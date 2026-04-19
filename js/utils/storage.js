(function () {
  'use strict';
  const LS = window.LivelySam = window.LivelySam || {};

  const DB_NAME = 'LivelySamDB';
  const DB_VERSION = 2;
  const STORES = ['memos', 'todos', 'bookmarks', 'schedules', 'records', 'backups'];
  const LOCAL_PREFIX = 'ls_';
  const STORE_PREFIX = 'db_store_';
  const VALIDATION_SANDBOX_KEY = 'validationSandbox';
  const BRIDGE_ORIGIN = 'http://127.0.0.1:58671';
  const BRIDGE_URL = `${BRIDGE_ORIGIN}/__livelysam__/storage`;
  const BRIDGE_OPS_URL = `${BRIDGE_ORIGIN}/__livelysam__/storage/ops`;
  const BRIDGE_HEALTH_URL = `${BRIDGE_ORIGIN}/__livelysam__/health`;
  const BRIDGE_HEALTH_TIMEOUT = 2500;
  const BRIDGE_SNAPSHOT_TIMEOUT = 12000;
  const BRIDGE_FLUSH_TIMEOUT = 8000;
  const BRIDGE_INIT_RETRY_COUNT = 3;
  const BRIDGE_INIT_RETRY_DELAY = 450;
  const EXPORT_VERSION = 2;
  const BACKUP_STORE = 'backups';
  const PRIVATE_EXPORT_KEYS = ['googleWorkspaceAuth', VALIDATION_SANDBOX_KEY];
  const PRIVATE_CONFIG_FIELDS = [
    'neisApiKey',
    'weatherApiKey',
    'googleClientId',
    'firebaseApiKey',
    'firebaseAuthDomain',
    'firebaseProjectId',
    'firebaseStorageBucket',
    'firebaseMessagingSenderId',
    'firebaseAppId',
    'firebaseMeasurementId'
  ];

  let db = null;
  let dbMode = 'unknown';
  let initPromise = null;
  let bridgeEnabled = false;
  let bridgeState = createEmptyBridgeState();
  let bridgeFlushTimer = null;
  let bridgeFlushPromise = null;
  let bridgePendingOps = [];

  function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function buildBackupEnvelope(localValues, indexedValues, storageMode = 'browser') {
    const safeLocalValues = localValues && typeof localValues === 'object' ? localValues : {};
    const safeIndexedValues = indexedValues && typeof indexedValues === 'object' ? indexedValues : {};
    const storeCounts = {};

    STORES.forEach((storeName) => {
      storeCounts[storeName] = Array.isArray(safeIndexedValues[storeName]) ? safeIndexedValues[storeName].length : 0;
    });

    return {
      version: EXPORT_VERSION,
      exportDate: new Date().toISOString(),
      app: 'LivelySam',
      meta: {
        storageMode,
        localStorageKeys: Object.keys(safeLocalValues).length,
        stores: storeCounts
      },
      localStorage: safeLocalValues,
      indexedDB: safeIndexedValues
    };
  }

  function getExportStoreNames() {
    return STORES.filter((storeName) => storeName !== BACKUP_STORE);
  }

  function getBackupStoreLocalKey() {
    return LOCAL_PREFIX + getStoreKey(BACKUP_STORE);
  }

  function getLocalDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function isExportableValueKey(key) {
    return !PRIVATE_EXPORT_KEYS.includes(String(key || ''));
  }

  function sanitizeExportValue(key, value) {
    if (String(key || '') !== 'config' || !value || typeof value !== 'object' || Array.isArray(value)) {
      return clone(value);
    }

    const nextConfig = clone(value);
    PRIVATE_CONFIG_FIELDS.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(nextConfig, field)) {
        delete nextConfig[field];
      }
    });
    return nextConfig;
  }

  function normalizeBackupData(data) {
    if (!data || typeof data !== 'object') return null;
    if (![1, 2].includes(data.version)) return null;
    if (!data.localStorage || typeof data.localStorage !== 'object') return null;
    if (!data.indexedDB || typeof data.indexedDB !== 'object') return null;

    return buildBackupEnvelope(data.localStorage, data.indexedDB, data.meta?.storageMode || 'import');
  }

  function createEmptyBridgeState() {
    return {
      version: 2,
      updatedAt: new Date().toISOString(),
      values: {},
      stores: STORES.reduce((acc, storeName) => {
        acc[storeName] = [];
        return acc;
      }, {})
    };
  }

  function normalizeBridgeState(raw) {
    const base = createEmptyBridgeState();
    if (!raw || typeof raw !== 'object') {
      return base;
    }

    if (raw.updatedAt) {
      base.updatedAt = raw.updatedAt;
    }

    if (raw.values && typeof raw.values === 'object' && !Array.isArray(raw.values)) {
      base.values = clone(raw.values);
    }

    if (raw.stores && typeof raw.stores === 'object' && !Array.isArray(raw.stores)) {
      STORES.forEach((storeName) => {
        const items = raw.stores[storeName];
        base.stores[storeName] = Array.isArray(items) ? clone(items) : [];
      });
    }

    return base;
  }

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function deepMergeMissing(primaryValue, secondaryValue) {
    if (primaryValue === undefined) return clone(secondaryValue);
    if (secondaryValue === undefined) return clone(primaryValue);

    if (isPlainObject(primaryValue) && isPlainObject(secondaryValue)) {
      const merged = clone(primaryValue);
      Object.entries(secondaryValue).forEach(([key, value]) => {
        if (!(key in merged)) {
          merged[key] = clone(value);
        } else {
          merged[key] = deepMergeMissing(merged[key], value);
        }
      });
      return merged;
    }

    return clone(primaryValue);
  }

  function toTimestamp(item) {
    if (!item || typeof item !== 'object') return Number.NEGATIVE_INFINITY;
    const stamp = item.updatedAt || item.createdAt || item.date || '';
    const value = Date.parse(stamp);
    return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
  }

  function mergeStoreItems(primaryItems, secondaryItems) {
    const merged = [];
    const indexById = new Map();

    function pushItem(item, preferIncoming = false) {
      if (!item || typeof item !== 'object') return;
      const key = item.id || JSON.stringify(item);

      if (!indexById.has(key)) {
        indexById.set(key, merged.length);
        merged.push(clone(item));
        return;
      }

      const currentIndex = indexById.get(key);
      const existing = merged[currentIndex];
      const existingTime = toTimestamp(existing);
      const incomingTime = toTimestamp(item);
      const shouldReplace = preferIncoming
        ? incomingTime >= existingTime
        : incomingTime > existingTime;

      if (shouldReplace) {
        merged[currentIndex] = clone(item);
      }
    }

    (Array.isArray(primaryItems) ? primaryItems : []).forEach((item) => pushItem(item));
    (Array.isArray(secondaryItems) ? secondaryItems : []).forEach((item) => pushItem(item, false));
    return merged;
  }

  function hasBridgeData(snapshot) {
    const normalized = normalizeBridgeState(snapshot);
    if (Object.keys(normalized.values).length > 0) {
      return true;
    }
    return STORES.some((storeName) => normalized.stores[storeName].length > 0);
  }

  function mergeBridgeAndClientSnapshots(bridgeSnapshot, clientSnapshot) {
    const bridge = normalizeBridgeState(bridgeSnapshot);
    const client = normalizeBridgeState(clientSnapshot);

    if (!hasBridgeData(bridge) && hasBridgeData(client)) {
      return client;
    }

    const merged = normalizeBridgeState(bridge);
    const valueKeys = new Set([
      ...Object.keys(merged.values || {}),
      ...Object.keys(client.values || {})
    ]);
    valueKeys.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(bridge.values, key)) {
        merged.values[key] = clone(bridge.values[key]);
      } else if (Object.prototype.hasOwnProperty.call(client.values, key)) {
        merged.values[key] = clone(client.values[key]);
      }
    });

    STORES.forEach((storeName) => {
      merged.stores[storeName] = mergeStoreItems(merged.stores[storeName], client.stores[storeName]);
    });

    return merged;
  }

  function getErrorDetails(error) {
    if (!error) return 'UnknownError';
    const name = error.name || 'UnknownError';
    const message = error.message ? `: ${error.message}` : '';
    return `${name}${message}`;
  }

  function readRaw(key) {
    try {
      return localStorage.getItem(LOCAL_PREFIX + key);
    } catch {
      return null;
    }
  }

  function writeRaw(key, value) {
    localStorage.setItem(LOCAL_PREFIX + key, JSON.stringify(value));
  }

  function removeRaw(key) {
    localStorage.removeItem(LOCAL_PREFIX + key);
  }

  function getStoreKey(storeName) {
    return STORE_PREFIX + storeName;
  }

  function shouldForceLocalStorage() {
    try {
      const params = new URLSearchParams(window.location?.search || '');
      return params.get('validate') === '1' && params.get('forceStorage') !== '0';
    } catch {
      return false;
    }
  }

  function readValidationSandboxMarker() {
    try {
      const raw = readRaw(VALIDATION_SANDBOX_KEY);
      if (raw === null) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return {
        active: parsed.active !== false,
        source: String(parsed.source || '').trim(),
        createdAt: String(parsed.createdAt || '').trim(),
        keys: Array.isArray(parsed.keys)
          ? parsed.keys.map((key) => String(key || '').trim()).filter(Boolean)
          : []
      };
    } catch {
      return null;
    }
  }

  function clearValidationSandboxMarker() {
    const marker = readValidationSandboxMarker();
    if (!marker?.active) return false;

    const keysToRemove = new Set([VALIDATION_SANDBOX_KEY, ...marker.keys]);
    keysToRemove.forEach((key) => {
      try {
        localStorage.removeItem(LOCAL_PREFIX + key);
      } catch {
        // ignore local cleanup failures
      }
    });
    return true;
  }

  function cleanupValidationSandboxIfNeeded() {
    if (shouldForceLocalStorage()) return false;
    const marker = readValidationSandboxMarker();
    if (!marker?.active) return false;
    const cleared = clearValidationSandboxMarker();
    if (cleared) {
      console.info('[Storage] Cleared validation sandbox data from browser localStorage.');
    }
    return cleared;
  }

  function readStore(storeName) {
    try {
      const raw = readRaw(getStoreKey(storeName));
      if (raw === null) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeStore(storeName, items) {
    writeRaw(getStoreKey(storeName), Array.isArray(items) ? items : []);
  }

  function enableFallback(reason, error) {
    if (dbMode !== 'localstorage') {
      console.warn(`[Storage] Shared bridge/IndexedDB unavailable, using browser-local fallback. ${reason} ${getErrorDetails(error)}`.trim());
    }
    bridgeEnabled = false;
    dbMode = 'localstorage';
    db = null;
  }

  function collectLocalStorageSnapshot() {
    const snapshot = createEmptyBridgeState();
    const validationSandbox = shouldForceLocalStorage() ? null : readValidationSandboxMarker();
    if (validationSandbox?.active) {
      return snapshot;
    }

    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const storageKey = localStorage.key(i);
        if (!storageKey || !storageKey.startsWith(LOCAL_PREFIX)) continue;

        const rawValue = localStorage.getItem(storageKey);
        if (rawValue === null) continue;

        const strippedKey = storageKey.slice(LOCAL_PREFIX.length);
        try {
          const parsed = JSON.parse(rawValue);
          if (strippedKey.startsWith(STORE_PREFIX)) {
            const storeName = strippedKey.slice(STORE_PREFIX.length);
            if (storeName !== BACKUP_STORE && STORES.includes(storeName) && Array.isArray(parsed)) {
              snapshot.stores[storeName] = clone(parsed);
            }
          } else {
            snapshot.values[strippedKey] = parsed;
          }
        } catch {
          // ignore broken local cache entry
        }
      }
    } catch {
      // ignore inaccessible localStorage
    }

    return snapshot;
  }

  function openLegacyIndexedDb() {
    return new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }

      let request;
      try {
        request = indexedDB.open(DB_NAME, DB_VERSION);
      } catch {
        resolve(null);
        return;
      }

      request.onupgradeneeded = () => {
        try {
          request.result?.close?.();
        } catch {
          // noop
        }
      };
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
  }

  async function collectIndexedDbSnapshot() {
    const snapshot = createEmptyBridgeState();
    const openedDb = await openLegacyIndexedDb();
    if (!openedDb) {
      return snapshot;
    }

    await Promise.all(STORES.map((storeName) => new Promise((resolve) => {
      if (!openedDb.objectStoreNames.contains(storeName)) {
        resolve();
        return;
      }

      try {
        const tx = openedDb.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.getAll();
        request.onsuccess = () => {
          snapshot.stores[storeName] = Array.isArray(request.result) ? clone(request.result) : [];
          resolve();
        };
        request.onerror = () => resolve();
      } catch {
        resolve();
      }
    })));

    try {
      openedDb.close();
    } catch {
      // noop
    }

    return snapshot;
  }

  async function collectClientSnapshot() {
    const localSnapshot = collectLocalStorageSnapshot();
    const indexedDbSnapshot = await collectIndexedDbSnapshot();
    const merged = normalizeBridgeState(localSnapshot);
    STORES.forEach((storeName) => {
      merged.stores[storeName] = mergeStoreItems(merged.stores[storeName], indexedDbSnapshot.stores[storeName]);
    });
    return merged;
  }

  async function fetchJson(url, options = {}) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller
      ? window.setTimeout(() => controller.abort(), options.timeout || 1800)
      : null;

    try {
      const response = await fetch(url, {
        method: options.method || 'GET',
        headers: options.headers || {},
        body: options.body,
        cache: 'no-store',
        mode: 'cors',
        signal: controller?.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } finally {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    }
  }

  function sleep(ms) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, Math.max(0, Number(ms) || 0));
    });
  }

  async function probeBridgeHealth() {
    try {
      const result = await fetchJson(BRIDGE_HEALTH_URL, { timeout: BRIDGE_HEALTH_TIMEOUT });
      return !!result?.ok;
    } catch {
      return false;
    }
  }

  async function loadBridgeSnapshot() {
    return normalizeBridgeState(await fetchJson(BRIDGE_URL, { timeout: BRIDGE_SNAPSHOT_TIMEOUT }));
  }

  async function initializeBridgeSnapshotWithRetry() {
    let lastError = null;

    for (let attempt = 1; attempt <= BRIDGE_INIT_RETRY_COUNT; attempt += 1) {
      try {
        return await loadBridgeSnapshot();
      } catch (error) {
        lastError = error;
        if (attempt < BRIDGE_INIT_RETRY_COUNT) {
          await sleep(BRIDGE_INIT_RETRY_DELAY * attempt);
        }
      }
    }

    throw lastError || new Error('Shared bridge snapshot could not be loaded.');
  }

  async function replaceBridgeSnapshot(snapshot = bridgeState) {
    if (!bridgeEnabled) return false;

    const nextSnapshot = normalizeBridgeState(snapshot);
    nextSnapshot.updatedAt = new Date().toISOString();
    try {
      const response = await fetchJson(BRIDGE_URL, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(nextSnapshot),
        timeout: BRIDGE_FLUSH_TIMEOUT
      });
      bridgeState = normalizeBridgeState(response?.snapshot || nextSnapshot);
      return true;
    } catch (error) {
      console.warn('[Storage] Shared bridge snapshot replace failed:', error);
      return false;
    }
  }

  function normalizeBridgeOperation(op) {
    if (!op || typeof op !== 'object') return null;

    const type = String(op.type || '').trim();
    if (!type) return null;

    if (type === 'set-value') {
      const key = String(op.key || '').trim();
      if (!key) return null;
      return { type, key, value: clone(op.value) };
    }

    if (type === 'remove-value') {
      const key = String(op.key || '').trim();
      if (!key) return null;
      return { type, key };
    }

    if (type === 'put-store-item') {
      const storeName = String(op.storeName || '').trim();
      if (!STORES.includes(storeName)) return null;
      return { type, storeName, item: clone(op.item) };
    }

    if (type === 'delete-store-item') {
      const storeName = String(op.storeName || '').trim();
      const id = op.id;
      if (!STORES.includes(storeName) || id === undefined || id === null || id === '') return null;
      return { type, storeName, id };
    }

    if (type === 'clear-store') {
      const storeName = String(op.storeName || '').trim();
      if (!STORES.includes(storeName)) return null;
      return { type, storeName };
    }

    return null;
  }

  function enqueueBridgeOperation(op) {
    const normalized = normalizeBridgeOperation(op);
    if (!normalized) return;
    bridgePendingOps.push(normalized);
  }

  async function flushBridgeNow() {
    if (!bridgeEnabled) return false;
    if (bridgeFlushTimer) {
      window.clearTimeout(bridgeFlushTimer);
      bridgeFlushTimer = null;
    }
    if (bridgeFlushPromise) {
      return bridgeFlushPromise;
    }
    if (bridgePendingOps.length === 0) {
      return true;
    }

    const ops = bridgePendingOps.splice(0, bridgePendingOps.length);
    bridgeFlushPromise = (async () => {
      try {
        const response = await fetchJson(BRIDGE_OPS_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ ops }),
          timeout: BRIDGE_FLUSH_TIMEOUT
        });
        bridgeState = normalizeBridgeState(response?.snapshot || bridgeState);
        return true;
      } catch (error) {
        console.warn('[Storage] Shared bridge op flush failed:', error);
        bridgePendingOps = ops.concat(bridgePendingOps);
        return false;
      } finally {
        bridgeFlushPromise = null;
        if (bridgePendingOps.length > 0) {
          queueBridgeFlush();
        }
      }
    })();

    return bridgeFlushPromise;
  }

  function queueBridgeFlush() {
    if (!bridgeEnabled) return;
    if (bridgeFlushTimer) {
      window.clearTimeout(bridgeFlushTimer);
    }
    bridgeFlushTimer = window.setTimeout(() => {
      void flushBridgeNow();
    }, 150);
  }

  function flushBridgeViaBeacon() {
    if (!bridgeEnabled || typeof navigator.sendBeacon !== 'function' || bridgePendingOps.length === 0) return;
    if (bridgeFlushTimer) {
      window.clearTimeout(bridgeFlushTimer);
      bridgeFlushTimer = null;
    }

    const ops = bridgePendingOps.splice(0, bridgePendingOps.length);
    try {
      const payload = new Blob([JSON.stringify({ ops })], { type: 'application/json' });
      const sent = navigator.sendBeacon(BRIDGE_OPS_URL, payload);
      if (!sent) {
        bridgePendingOps = ops.concat(bridgePendingOps);
      }
    } catch {
      bridgePendingOps = ops.concat(bridgePendingOps);
    }
  }

  function exportBridgeState() {
    const localStorageData = {};
    const indexedDBData = {};

    Object.entries(bridgeState.values).forEach(([key, value]) => {
      if (!isExportableValueKey(key)) return;
      localStorageData[LOCAL_PREFIX + key] = JSON.stringify(sanitizeExportValue(key, value));
    });

    getExportStoreNames().forEach((storeName) => {
      localStorageData[LOCAL_PREFIX + getStoreKey(storeName)] = JSON.stringify(bridgeState.stores[storeName] || []);
      indexedDBData[storeName] = clone(bridgeState.stores[storeName] || []);
    });

    return buildBackupEnvelope(localStorageData, indexedDBData, 'bridge');
  }

  function importBridgeState(data) {
    const snapshot = createEmptyBridgeState();
    snapshot.stores[BACKUP_STORE] = clone(bridgeState.stores[BACKUP_STORE] || []);

    if (data.localStorage && typeof data.localStorage === 'object') {
      Object.entries(data.localStorage).forEach(([key, rawValue]) => {
        if (!key.startsWith(LOCAL_PREFIX)) return;
        const strippedKey = key.slice(LOCAL_PREFIX.length);
        try {
          const parsed = JSON.parse(rawValue);
          if (strippedKey.startsWith(STORE_PREFIX)) {
            const storeName = strippedKey.slice(STORE_PREFIX.length);
            if (storeName !== BACKUP_STORE && STORES.includes(storeName) && Array.isArray(parsed)) {
              snapshot.stores[storeName] = clone(parsed);
            }
          } else {
            snapshot.values[strippedKey] = parsed;
          }
        } catch {
          // ignore invalid import entry
        }
      });
    }

    if (data.indexedDB && typeof data.indexedDB === 'object') {
      Object.entries(data.indexedDB).forEach(([storeName, items]) => {
        if (storeName !== BACKUP_STORE && STORES.includes(storeName) && Array.isArray(items)) {
          snapshot.stores[storeName] = clone(items);
        }
      });
    }

    return normalizeBridgeState(snapshot);
  }

  if (typeof window !== 'undefined') {
    cleanupValidationSandboxIfNeeded();
    window.addEventListener('pagehide', flushBridgeViaBeacon);
  }

  LS.Storage = {
    get(key, defaultValue) {
      if (bridgeEnabled) {
        return Object.prototype.hasOwnProperty.call(bridgeState.values, key)
          ? clone(bridgeState.values[key])
          : defaultValue;
      }

      try {
        const val = localStorage.getItem(LOCAL_PREFIX + key);
        if (val === null) return defaultValue;
        return JSON.parse(val);
      } catch {
        return defaultValue;
      }
    },

    set(key, value) {
      if (bridgeEnabled) {
        bridgeState.values[key] = clone(value);
        try {
          writeRaw(key, value);
        } catch {
          // keep bridge state even if browser local mirror fails
        }
        enqueueBridgeOperation({ type: 'set-value', key, value });
        queueBridgeFlush();
        return;
      }

      try {
        localStorage.setItem(LOCAL_PREFIX + key, JSON.stringify(value));
      } catch (e) {
        console.warn('[Storage] localStorage write failed:', e);
      }
    },

    remove(key) {
      if (bridgeEnabled) {
        delete bridgeState.values[key];
        try {
          removeRaw(key);
        } catch {
          // ignore mirror cleanup failures
        }
        enqueueBridgeOperation({ type: 'remove-value', key });
        queueBridgeFlush();
        return;
      }
      removeRaw(key);
    },

    isIndexedDBAvailable() {
      return dbMode === 'indexeddb' && !!db;
    },

    isSharedBridgeAvailable() {
      return bridgeEnabled;
    },

    getBackendMode() {
      return dbMode;
    },

    async initDB() {
      if (bridgeEnabled) return null;
      if (this.isIndexedDBAvailable()) return db;
      if (dbMode === 'localstorage') return null;
      if (initPromise) return initPromise;

      initPromise = (async () => {
        cleanupValidationSandboxIfNeeded();

        if (shouldForceLocalStorage()) {
          enableFallback('validation mode forced localStorage.');
          return null;
        }

        const bridgeOk = await probeBridgeHealth();
        if (bridgeOk) {
          try {
            const [remoteSnapshot, clientSnapshot] = await Promise.all([
              initializeBridgeSnapshotWithRetry(),
              collectClientSnapshot()
            ]);
            const mergedSnapshot = mergeBridgeAndClientSnapshots(remoteSnapshot, clientSnapshot);
            bridgeState = normalizeBridgeState(mergedSnapshot);
            bridgeEnabled = true;
            dbMode = 'bridge';
            db = null;

            if (!hasBridgeData(remoteSnapshot) && hasBridgeData(bridgeState)) {
              await replaceBridgeSnapshot(bridgeState);
            }

            console.log('[Storage] Shared local bridge enabled.');
            return null;
          } catch (error) {
            console.warn('[Storage] Shared bridge initialization failed:', error);
          }
        } else if (window.location?.protocol === 'file:') {
          console.warn('[Storage] Shared local bridge is not running. file:// preview will use browser-local storage until the bridge starts.');
        }

        if (typeof indexedDB === 'undefined') {
          enableFallback('indexedDB API is not available.');
          return null;
        }

        return await new Promise((resolve) => {
          let request;
          try {
            request = indexedDB.open(DB_NAME, DB_VERSION);
          } catch (error) {
            enableFallback('indexedDB.open() threw.', error);
            resolve(null);
            return;
          }

          request.onupgradeneeded = (event) => {
            const openedDb = event.target.result;
            STORES.forEach((name) => {
              if (!openedDb.objectStoreNames.contains(name)) {
                openedDb.createObjectStore(name, { keyPath: 'id' });
              }
            });
          };

          request.onsuccess = (event) => {
            db = event.target.result;
            dbMode = 'indexeddb';

            db.onclose = () => {
              db = null;
              if (dbMode === 'indexeddb') {
                dbMode = 'unknown';
              }
            };

            db.onversionchange = () => {
              db?.close();
            };

            resolve(db);
          };

          request.onblocked = () => {
            const error = request.error || new Error('IndexedDB open was blocked.');
            enableFallback('open request was blocked.', error);
            resolve(null);
          };

          request.onerror = () => {
            const error = request.error || new Error('IndexedDB open failed.');
            enableFallback('open request failed.', error);
            resolve(null);
          };
        });
      })();

      try {
        return await initPromise;
      } finally {
        initPromise = null;
      }
    },

    async dbGetAll(storeName) {
      if (bridgeEnabled) {
        return clone(bridgeState.stores[storeName] || []);
      }

      if (!db) await this.initDB();

      if (!this.isIndexedDBAvailable()) {
        return readStore(storeName);
      }

      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
    },

    async dbPut(storeName, data) {
      if (bridgeEnabled) {
        const items = Array.isArray(bridgeState.stores[storeName]) ? clone(bridgeState.stores[storeName]) : [];
        const index = items.findIndex((item) => item?.id === data?.id);
        if (index >= 0) {
          items[index] = clone(data);
        } else {
          items.push(clone(data));
        }
        bridgeState.stores[storeName] = items;
        try {
          writeStore(storeName, items);
        } catch {
          // ignore local mirror failures
        }
        enqueueBridgeOperation({ type: 'put-store-item', storeName, item: data });
        await flushBridgeNow();
        return data?.id;
      }

      if (!db) await this.initDB();

      if (!this.isIndexedDBAvailable()) {
        const items = readStore(storeName);
        const index = items.findIndex((item) => item?.id === data?.id);
        if (index >= 0) {
          items[index] = data;
        } else {
          items.push(data);
        }
        writeStore(storeName, items);
        return data?.id;
      }

      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.put(data);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    },

    async dbDelete(storeName, id) {
      if (bridgeEnabled) {
        bridgeState.stores[storeName] = (bridgeState.stores[storeName] || []).filter((item) => item?.id !== id);
        try {
          writeStore(storeName, bridgeState.stores[storeName]);
        } catch {
          // ignore local mirror failures
        }
        enqueueBridgeOperation({ type: 'delete-store-item', storeName, id });
        await flushBridgeNow();
        return;
      }

      if (!db) await this.initDB();

      if (!this.isIndexedDBAvailable()) {
        writeStore(storeName, readStore(storeName).filter((item) => item?.id !== id));
        return;
      }

      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    },

    async dbClear(storeName) {
      if (bridgeEnabled) {
        bridgeState.stores[storeName] = [];
        try {
          writeStore(storeName, []);
        } catch {
          // ignore local mirror failures
        }
        enqueueBridgeOperation({ type: 'clear-store', storeName });
        await flushBridgeNow();
        return;
      }

      if (!db) await this.initDB();

      if (!this.isIndexedDBAvailable()) {
        writeStore(storeName, []);
        return;
      }

      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    },

    async exportAll() {
      if (bridgeEnabled) {
        return exportBridgeState();
      }

      const localStorageData = {};
      const indexedDBData = {};

      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        const strippedKey = key && key.startsWith(LOCAL_PREFIX)
          ? key.slice(LOCAL_PREFIX.length)
          : '';
        if (key && key.startsWith(LOCAL_PREFIX) && key !== getBackupStoreLocalKey() && isExportableValueKey(strippedKey)) {
          try {
            const parsed = JSON.parse(localStorage.getItem(key));
            localStorageData[key] = JSON.stringify(sanitizeExportValue(strippedKey, parsed));
          } catch {
            localStorageData[key] = localStorage.getItem(key);
          }
        }
      }

      for (const store of getExportStoreNames()) {
        try {
          indexedDBData[store] = await this.dbGetAll(store);
        } catch {
          indexedDBData[store] = [];
        }
      }

      return buildBackupEnvelope(localStorageData, indexedDBData, 'browser');
    },

    async importAll(data) {
      const normalized = normalizeBackupData(data);
      if (!normalized) {
        throw new Error('Invalid backup file format.');
      }

      if (bridgeEnabled) {
        bridgeState = importBridgeState(normalized);
        await replaceBridgeSnapshot(bridgeState);
        return;
      }

      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key && key.startsWith(LOCAL_PREFIX) && key !== getBackupStoreLocalKey()) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));

      if (normalized.localStorage) {
        Object.entries(normalized.localStorage).forEach(([key, val]) => {
          if (!key.startsWith(LOCAL_PREFIX) || key === getBackupStoreLocalKey()) return;
          localStorage.setItem(key, val);
        });
      }

      for (const store of getExportStoreNames()) {
        await this.dbClear(store);
        const items = Array.isArray(normalized.indexedDB?.[store]) ? normalized.indexedDB[store] : [];
        for (const item of items) {
          await this.dbPut(store, item);
        }
      }
    },

    async autoBackup() {
      const lastBackup = this.get('lastBackupDate', '');
      const today = getLocalDateKey();

      if (lastBackup === today) return;

      try {
        const data = await this.exportAll();
        const backupEntry = {
          id: 'backup_' + today,
          date: today,
          data,
          createdAt: new Date().toISOString()
        };

        await this.dbPut('backups', backupEntry);
        this.set('lastBackupDate', today);

        const allBackups = await this.dbGetAll('backups');
        const sorted = allBackups.sort((a, b) => b.date.localeCompare(a.date));
        for (let i = 7; i < sorted.length; i += 1) {
          await this.dbDelete('backups', sorted[i].id);
        }

        console.log('[Storage] Auto backup complete:', today);
      } catch (e) {
        console.error('[Storage] Auto backup failed:', e);
      }
    },

    downloadJSON(data, filename) {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    }
  };
})();
