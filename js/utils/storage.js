(function () {
  'use strict';
  const LS = window.LivelySam = window.LivelySam || {};

  const DB_NAME = 'LivelySamDB';
  const DB_VERSION = 2;
  const STORES = ['memos', 'todos', 'bookmarks', 'schedules', 'records', 'backups'];
  const LOCAL_PREFIX = 'ls_';
  const STORE_PREFIX = 'db_store_';
  const VALIDATION_SANDBOX_KEY = 'validationSandbox';
  const VALUE_META_STORAGE_KEY = '__storageValueMeta';
  const STORE_META_STORAGE_KEY = '__storageStoreMeta';
  const LAYOUT_STORAGE_KEYS = ['gridLayout', 'gridLayoutState', 'gridLayoutBackup'];

  function getBridgeQueryParam(key) {
    const helper = LS.Helpers?.getRuntimeQueryParam;
    if (typeof helper === 'function') {
      return helper(key, '');
    }
    try {
      return new URLSearchParams(window.location.search || '').get(key) || '';
    } catch {
      return '';
    }
  }

  function resolveBridgePort() {
    const candidate = String(getBridgeQueryParam('bridgePort') || '').trim();
    return /^\d{2,5}$/.test(candidate) ? candidate : '58671';
  }

  function buildBridgeHeaders(headers = {}) {
    const token = String(getBridgeQueryParam('livelySamToken') || '').trim();
    if (!token) return { ...(headers || {}) };
    return {
      ...(headers || {}),
      'X-LivelySam-Token': token
    };
  }

  const BRIDGE_ORIGIN = `http://127.0.0.1:${resolveBridgePort()}`;
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
  const PRIVATE_EXPORT_KEYS = ['googleWorkspaceAuth', VALIDATION_SANDBOX_KEY, VALUE_META_STORAGE_KEY, STORE_META_STORAGE_KEY];
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
  const safeParse = LS.Helpers?.safeParse || ((raw, fallback = null) => {
    if (raw === null || raw === undefined || raw === '') {
      return fallback;
    }

    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  });
  const safeWrite = LS.Helpers?.safeWrite || ((key, value, options = {}) => {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      if (options.log !== false) {
        console.warn(options.scope || '[Storage] localStorage write failed:', error);
      }
      if (options.throwOnError) {
        throw error;
      }
      return false;
    }
  });

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

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function parseRecordedTimestamp(value) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return value;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return Number.NEGATIVE_INFINITY;
      }

      if (/^\d+$/.test(trimmed)) {
        const numeric = Number(trimmed);
        if (Number.isFinite(numeric) && numeric > 0) {
          return numeric;
        }
      }

      const parsed = Date.parse(trimmed);
      return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
    }

    return Number.NEGATIVE_INFINITY;
  }

  function normalizeValueMetaEntry(raw) {
    if (raw === null || raw === undefined) {
      return null;
    }

    if (typeof raw === 'number' || typeof raw === 'string') {
      const updatedAt = parseRecordedTimestamp(raw);
      if (!Number.isFinite(updatedAt) || updatedAt <= 0) {
        return null;
      }
      return { updatedAt, deleted: false };
    }

    if (!isPlainObject(raw)) {
      return null;
    }

    const updatedAt = parseRecordedTimestamp(raw.updatedAt ?? raw.ts ?? raw.timestamp);
    if (!Number.isFinite(updatedAt) || updatedAt <= 0) {
      return null;
    }

    return {
      updatedAt,
      deleted: raw.deleted === true
    };
  }

  function normalizeValueMeta(raw) {
    if (!isPlainObject(raw)) {
      return {};
    }

    return Object.entries(raw).reduce((acc, [key, entry]) => {
      const normalizedKey = String(key || '').trim();
      if (!normalizedKey || normalizedKey === VALUE_META_STORAGE_KEY) {
        return acc;
      }

      const normalizedEntry = normalizeValueMetaEntry(entry);
      if (!normalizedEntry) {
        return acc;
      }

      acc[normalizedKey] = normalizedEntry;
      return acc;
    }, {});
  }

  function getSnapshotValueMeta(snapshot) {
    return normalizeValueMeta(snapshot?.values?.[VALUE_META_STORAGE_KEY]);
  }

  function setSnapshotValueMeta(snapshot, valueMeta) {
    if (!snapshot || !isPlainObject(snapshot.values)) {
      if (!snapshot) {
        return {};
      }
      snapshot.values = {};
    }

    const normalized = normalizeValueMeta(valueMeta);
    if (Object.keys(normalized).length > 0) {
      snapshot.values[VALUE_META_STORAGE_KEY] = normalized;
    } else {
      delete snapshot.values[VALUE_META_STORAGE_KEY];
    }
    return normalized;
  }

  function setSnapshotValueMetaEntry(snapshot, key, updatedAt, deleted = false) {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey || normalizedKey === VALUE_META_STORAGE_KEY) {
      return getSnapshotValueMeta(snapshot);
    }

    const valueMeta = getSnapshotValueMeta(snapshot);
    const timestamp = parseRecordedTimestamp(updatedAt);
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
      delete valueMeta[normalizedKey];
    } else {
      valueMeta[normalizedKey] = {
        updatedAt: timestamp,
        deleted: deleted === true
      };
    }
    return setSnapshotValueMeta(snapshot, valueMeta);
  }

  function readStoredValueMeta() {
    try {
      const raw = readRaw(VALUE_META_STORAGE_KEY);
      if (raw === null) {
        return {};
      }
      return normalizeValueMeta(safeParse(raw, {}));
    } catch {
      return {};
    }
  }

  function writeStoredValueMeta(valueMeta) {
    const normalized = normalizeValueMeta(valueMeta);
    if (Object.keys(normalized).length > 0) {
      writeRaw(VALUE_META_STORAGE_KEY, normalized);
    } else {
      removeRaw(VALUE_META_STORAGE_KEY);
    }
    return normalized;
  }

  function normalizeStoreMeta(raw) {
    if (!isPlainObject(raw)) {
      return {};
    }

    return Object.entries(raw).reduce((acc, [storeName, entries]) => {
      const normalizedStoreName = String(storeName || '').trim();
      if (!normalizedStoreName || !STORES.includes(normalizedStoreName) || !isPlainObject(entries)) {
        return acc;
      }

      const normalizedEntries = Object.entries(entries).reduce((storeAcc, [id, entry]) => {
        const normalizedId = String(id || '').trim();
        if (!normalizedId) {
          return storeAcc;
        }

        const normalizedEntry = normalizeValueMetaEntry(entry);
        if (!normalizedEntry) {
          return storeAcc;
        }

        storeAcc[normalizedId] = normalizedEntry;
        return storeAcc;
      }, {});

      if (Object.keys(normalizedEntries).length > 0) {
        acc[normalizedStoreName] = normalizedEntries;
      }

      return acc;
    }, {});
  }

  function getSnapshotStoreMeta(snapshot) {
    return normalizeStoreMeta(snapshot?.values?.[STORE_META_STORAGE_KEY]);
  }

  function setSnapshotStoreMeta(snapshot, storeMeta) {
    if (!snapshot || !isPlainObject(snapshot.values)) {
      if (!snapshot) {
        return {};
      }
      snapshot.values = {};
    }

    const normalized = normalizeStoreMeta(storeMeta);
    if (Object.keys(normalized).length > 0) {
      snapshot.values[STORE_META_STORAGE_KEY] = normalized;
    } else {
      delete snapshot.values[STORE_META_STORAGE_KEY];
    }
    return normalized;
  }

  function setSnapshotStoreMetaEntry(snapshot, storeName, id, updatedAt, deleted = false) {
    const normalizedStoreName = String(storeName || '').trim();
    const normalizedId = String(id || '').trim();
    if (!normalizedStoreName || !normalizedId || !STORES.includes(normalizedStoreName)) {
      return getSnapshotStoreMeta(snapshot);
    }

    const storeMeta = getSnapshotStoreMeta(snapshot);
    const nextEntries = isPlainObject(storeMeta[normalizedStoreName]) ? { ...storeMeta[normalizedStoreName] } : {};
    const timestamp = parseRecordedTimestamp(updatedAt);

    if (!Number.isFinite(timestamp) || timestamp <= 0) {
      delete nextEntries[normalizedId];
    } else {
      nextEntries[normalizedId] = {
        updatedAt: timestamp,
        deleted: deleted === true
      };
    }

    if (Object.keys(nextEntries).length > 0) {
      storeMeta[normalizedStoreName] = nextEntries;
    } else {
      delete storeMeta[normalizedStoreName];
    }

    return setSnapshotStoreMeta(snapshot, storeMeta);
  }

  function readStoredStoreMeta() {
    try {
      const raw = readRaw(STORE_META_STORAGE_KEY);
      if (raw === null) {
        return {};
      }
      return normalizeStoreMeta(safeParse(raw, {}));
    } catch {
      return {};
    }
  }

  function writeStoredStoreMeta(storeMeta) {
    const normalized = normalizeStoreMeta(storeMeta);
    if (Object.keys(normalized).length > 0) {
      writeRaw(STORE_META_STORAGE_KEY, normalized);
    } else {
      removeRaw(STORE_META_STORAGE_KEY);
    }
    return normalized;
  }

  function updateStoredStoreMetaEntry(storeName, id, updatedAt, deleted = false) {
    const normalizedStoreName = String(storeName || '').trim();
    const normalizedId = String(id || '').trim();
    if (!normalizedStoreName || !normalizedId || !STORES.includes(normalizedStoreName)) {
      return readStoredStoreMeta();
    }

    const storeMeta = readStoredStoreMeta();
    const nextEntries = isPlainObject(storeMeta[normalizedStoreName]) ? { ...storeMeta[normalizedStoreName] } : {};
    const timestamp = parseRecordedTimestamp(updatedAt);

    if (!Number.isFinite(timestamp) || timestamp <= 0) {
      delete nextEntries[normalizedId];
    } else {
      nextEntries[normalizedId] = {
        updatedAt: timestamp,
        deleted: deleted === true
      };
    }

    if (Object.keys(nextEntries).length > 0) {
      storeMeta[normalizedStoreName] = nextEntries;
    } else {
      delete storeMeta[normalizedStoreName];
    }

    return writeStoredStoreMeta(storeMeta);
  }

  function inferValueTimestamp(value) {
    if (!isPlainObject(value)) {
      return Number.NEGATIVE_INFINITY;
    }

    const candidates = [
      value.updatedAt,
      value.updatedAtIso,
      value.savedAt,
      value.savedAtIso,
      value.modifiedAt,
      value.modifiedAtIso,
      value.lastUpdatedAt,
      value.lastUpdatedAtIso,
      value.createdAt,
      value.createdAtIso,
      value.timestamp
    ];

    for (const candidate of candidates) {
      const timestamp = parseRecordedTimestamp(candidate);
      if (Number.isFinite(timestamp) && timestamp > 0) {
        return timestamp;
      }
    }

    return Number.NEGATIVE_INFINITY;
  }

  function getSnapshotValueState(snapshot, key) {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey || normalizedKey === VALUE_META_STORAGE_KEY) {
      return null;
    }

    const metaEntry = getSnapshotValueMeta(snapshot)[normalizedKey] || null;
    const hasValue = Object.prototype.hasOwnProperty.call(snapshot?.values || {}, normalizedKey);
    const value = hasValue ? snapshot.values[normalizedKey] : undefined;
    const payloadTime = inferValueTimestamp(value);
    const metaTime = metaEntry?.updatedAt || Number.NEGATIVE_INFINITY;

    if (metaEntry?.deleted === true && metaTime >= payloadTime) {
      return {
        kind: 'deleted',
        time: metaTime
      };
    }

    if (!hasValue) {
      return null;
    }

    return {
      kind: 'value',
      time: Math.max(metaTime, payloadTime),
      value: clone(value)
    };
  }

  function normalizeMergedValueState(state, fallbackTime) {
    if (!state) {
      return null;
    }

    const time = Number.isFinite(state.time) && state.time > 0
      ? state.time
      : fallbackTime;

    if (state.kind === 'deleted') {
      return {
        kind: 'deleted',
        time
      };
    }

    return {
      kind: 'value',
      time,
      value: clone(state.value)
    };
  }

  function getLayoutKeyPriority(key) {
    return key === 'gridLayout' ? 1 : 2;
  }

  function isAutoGeneratedLayoutReason(reason) {
    const normalized = String(reason || '').trim().toLowerCase();
    if (!normalized) {
      return false;
    }
    return normalized === 'seed'
      || normalized === 'seed-default-layout'
      || normalized === 'repair'
      || normalized === 'fit-layout'
      || normalized === 'fit-layout-noop'
      || normalized === 'stabilize-visibility'
      || normalized.startsWith('migrate-');
  }

  function normalizeLayoutItems(layout) {
    const seen = new Set();
    return (Array.isArray(layout) ? layout : []).reduce((acc, item) => {
      if (!isPlainObject(item)) {
        return acc;
      }
      const id = String(item.id || '').trim();
      if (!id || seen.has(id)) {
        return acc;
      }
      seen.add(id);
      acc.push(clone(item));
      return acc;
    }, []);
  }

  function serializeLayoutForComparison(layout) {
    return JSON.stringify(normalizeLayoutItems(layout).map((item) => ({
      id: String(item.id || ''),
      x: Number(item.x) || 0,
      y: Number(item.y) || 0,
      w: Number(item.w) || 0,
      h: Number(item.h) || 0
    })));
  }

  function getLayoutMetadataHint(snapshot, layout) {
    const layoutSignature = serializeLayoutForComparison(layout);
    const candidates = ['gridLayoutState', 'gridLayoutBackup']
      .map((key) => {
        const raw = snapshot?.values?.[key];
        if (!isPlainObject(raw) || !Array.isArray(raw.layout)) {
          return null;
        }
        return {
          raw,
          updatedAt: parseRecordedTimestamp(raw.updatedAt ?? raw.updatedAtIso ?? raw.savedAt),
          signature: serializeLayoutForComparison(raw.layout)
        };
      })
      .filter(Boolean);

    const exact = candidates.find((candidate) => candidate.signature === layoutSignature);
    if (exact) {
      return exact.raw;
    }

    candidates.sort((left, right) => right.updatedAt - left.updatedAt);
    return candidates[0]?.raw || null;
  }

  function extractLayoutMergeCandidate(snapshot, source, key) {
    const state = getSnapshotValueState(snapshot, key);
    if (!state || state.kind !== 'value') {
      return null;
    }

    const rawValue = clone(state.value);
    let layout = [];
    let widgetVisibility = null;
    let reason = '';
    let version = 0;
    let updatedAt = Number.isFinite(state.time) ? state.time : Number.NEGATIVE_INFINITY;

    if (Array.isArray(rawValue)) {
      layout = normalizeLayoutItems(rawValue);
      const metadataHint = getLayoutMetadataHint(snapshot, layout);
      if (isPlainObject(metadataHint)) {
        widgetVisibility = isPlainObject(metadataHint.widgetVisibility) ? clone(metadataHint.widgetVisibility) : null;
        reason = String(metadataHint.reason || '').trim();
        const hintedVersion = Number(metadataHint.version);
        version = Number.isFinite(hintedVersion) ? hintedVersion : 0;
        const valueTime = parseRecordedTimestamp(metadataHint.updatedAt ?? metadataHint.updatedAtIso ?? metadataHint.savedAt);
        if (Number.isFinite(valueTime) && valueTime > 0) {
          updatedAt = Math.max(updatedAt, valueTime);
        }
      }
    } else if (isPlainObject(rawValue) && Array.isArray(rawValue.layout)) {
      layout = normalizeLayoutItems(rawValue.layout);
      widgetVisibility = isPlainObject(rawValue.widgetVisibility) ? clone(rawValue.widgetVisibility) : null;
      reason = String(rawValue.reason || '').trim();
      const parsedVersion = Number(rawValue.version);
      version = Number.isFinite(parsedVersion) ? parsedVersion : 0;
      const valueTime = parseRecordedTimestamp(rawValue.updatedAt ?? rawValue.updatedAtIso ?? rawValue.savedAt);
      if (Number.isFinite(valueTime) && valueTime > 0) {
        updatedAt = Math.max(updatedAt, valueTime);
      }
    } else {
      return null;
    }

    if (layout.length === 0) {
      return null;
    }

    return {
      source,
      key,
      layout,
      layoutCount: layout.length,
      widgetVisibility,
      reason,
      version,
      updatedAt,
      rawValue
    };
  }

  function compareLayoutMergeCandidates(left, right) {
    const leftManual = isAutoGeneratedLayoutReason(left.reason) ? 0 : 1;
    const rightManual = isAutoGeneratedLayoutReason(right.reason) ? 0 : 1;
    if (rightManual !== leftManual) {
      return rightManual - leftManual;
    }

    if (right.updatedAt !== left.updatedAt) {
      return right.updatedAt - left.updatedAt;
    }

    if (right.layoutCount !== left.layoutCount) {
      return right.layoutCount - left.layoutCount;
    }

    if (right.version !== left.version) {
      return right.version - left.version;
    }

    const keyPriorityDiff = getLayoutKeyPriority(right.key) - getLayoutKeyPriority(left.key);
    if (keyPriorityDiff !== 0) {
      return keyPriorityDiff;
    }

    if (left.source !== right.source) {
      return right.source === 'bridge' ? 1 : -1;
    }

    return 0;
  }

  function resolveMergedLayoutValues(bridgeSnapshot, clientSnapshot, fallbackTime) {
    const candidates = [];
    const deletedStates = [];

    [
      ['bridge', bridgeSnapshot],
      ['client', clientSnapshot]
    ].forEach(([source, snapshot]) => {
      LAYOUT_STORAGE_KEYS.forEach((key) => {
        const state = getSnapshotValueState(snapshot, key);
        if (!state) {
          return;
        }
        if (state.kind === 'deleted') {
          deletedStates.push({
            source,
            key,
            time: Number.isFinite(state.time) ? state.time : Number.NEGATIVE_INFINITY
          });
          return;
        }

        const candidate = extractLayoutMergeCandidate(snapshot, source, key);
        if (candidate) {
          candidates.push(candidate);
        }
      });
    });

    if (candidates.length === 0) {
      if (deletedStates.length === 0) {
        return null;
      }

      deletedStates.sort((left, right) => {
        if (right.time !== left.time) {
          return right.time - left.time;
        }
        if (left.source !== right.source) {
          return right.source === 'bridge' ? 1 : -1;
        }
        return getLayoutKeyPriority(right.key) - getLayoutKeyPriority(left.key);
      });

      const deletedAt = Number.isFinite(deletedStates[0].time) && deletedStates[0].time > 0
        ? deletedStates[0].time
        : fallbackTime;
      return {
        kind: 'deleted',
        time: deletedAt
      };
    }

    candidates.sort(compareLayoutMergeCandidates);
    const best = candidates[0];
    const updatedAt = Number.isFinite(best.updatedAt) && best.updatedAt > 0
      ? best.updatedAt
      : fallbackTime;
    const updatedAtIso = new Date(updatedAt).toISOString();
    const canonicalLayout = normalizeLayoutItems(best.layout);
    const canonicalState = isPlainObject(best.rawValue) ? clone(best.rawValue) : {};

    canonicalState.version = Number.isFinite(Number(canonicalState.version)) && Number(canonicalState.version) > 0
      ? Number(canonicalState.version)
      : 2;
    canonicalState.updatedAt = updatedAt;
    canonicalState.updatedAtIso = updatedAtIso;
    canonicalState.reason = String(canonicalState.reason || best.reason || 'bridge-merge-layout');
    canonicalState.layout = canonicalLayout;
    if (best.widgetVisibility && Object.keys(best.widgetVisibility).length > 0) {
      canonicalState.widgetVisibility = clone(best.widgetVisibility);
    } else if (Object.prototype.hasOwnProperty.call(canonicalState, 'widgetVisibility')) {
      delete canonicalState.widgetVisibility;
    }

    return {
      kind: 'value',
      time: updatedAt,
      values: {
        gridLayout: canonicalLayout,
        gridLayoutState: canonicalState,
        gridLayoutBackup: clone(canonicalState)
      }
    };
  }

  function selectMergedValueState(bridgeState, clientState, fallbackTime) {
    if (!bridgeState && !clientState) {
      return null;
    }
    if (!bridgeState) {
      return normalizeMergedValueState(clientState, fallbackTime);
    }
    if (!clientState) {
      return normalizeMergedValueState(bridgeState, fallbackTime);
    }

    const bridgeTime = Number.isFinite(bridgeState.time) ? bridgeState.time : Number.NEGATIVE_INFINITY;
    const clientTime = Number.isFinite(clientState.time) ? clientState.time : Number.NEGATIVE_INFINITY;

    if (clientTime > bridgeTime) {
      return normalizeMergedValueState(clientState, fallbackTime);
    }
    if (bridgeTime > clientTime) {
      return normalizeMergedValueState(bridgeState, fallbackTime);
    }

    if (bridgeState.kind !== 'value' || clientState.kind !== 'value') {
      return normalizeMergedValueState(clientState, fallbackTime);
    }

    const bridgeSerialized = JSON.stringify(bridgeState.value);
    const clientSerialized = JSON.stringify(clientState.value);
    if (bridgeSerialized === clientSerialized) {
      return normalizeMergedValueState(clientState, bridgeTime);
    }

    if (isPlainObject(bridgeState.value) && isPlainObject(clientState.value)) {
      return {
        kind: 'value',
        time: fallbackTime,
        value: deepMergeMissing(clientState.value, bridgeState.value)
      };
    }

    return {
      kind: 'value',
      time: fallbackTime,
      value: clone(clientState.value)
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
      setSnapshotValueMeta(base, base.values[VALUE_META_STORAGE_KEY]);
      setSnapshotStoreMeta(base, base.values[STORE_META_STORAGE_KEY]);
    }

    if (raw.stores && typeof raw.stores === 'object' && !Array.isArray(raw.stores)) {
      STORES.forEach((storeName) => {
        const items = raw.stores[storeName];
        base.stores[storeName] = Array.isArray(items) ? clone(items) : [];
      });
    }

    return base;
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

  function buildStoreItemMap(items) {
    const map = new Map();

    (Array.isArray(items) ? items : []).forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const id = String(item.id || '').trim();
      if (!id) return;

      const existing = map.get(id);
      if (!existing || toTimestamp(item) >= toTimestamp(existing)) {
        map.set(id, clone(item));
      }
    });

    return map;
  }

  function getStoreItemState(item, metaEntry) {
    const payloadTime = toTimestamp(item);
    const metaTime = metaEntry?.updatedAt || Number.NEGATIVE_INFINITY;

    if (metaEntry?.deleted === true && metaTime >= payloadTime) {
      return {
        kind: 'deleted',
        time: metaTime
      };
    }

    if (!item) {
      return null;
    }

    return {
      kind: 'value',
      time: Math.max(payloadTime, metaTime),
      value: clone(item)
    };
  }

  function mergeStoreWithMeta(primarySnapshot, secondarySnapshot, storeName, fallbackTime) {
    const primaryItems = buildStoreItemMap(primarySnapshot?.stores?.[storeName]);
    const secondaryItems = buildStoreItemMap(secondarySnapshot?.stores?.[storeName]);
    const primaryMeta = getSnapshotStoreMeta(primarySnapshot)[storeName] || {};
    const secondaryMeta = getSnapshotStoreMeta(secondarySnapshot)[storeName] || {};
    const orderedIds = [];
    const seen = new Set();

    [
      Array.from(primaryItems.keys()),
      Array.from(secondaryItems.keys()),
      Object.keys(primaryMeta),
      Object.keys(secondaryMeta)
    ].forEach((ids) => {
      ids.forEach((id) => {
        if (!id || seen.has(id)) return;
        seen.add(id);
        orderedIds.push(id);
      });
    });

    const items = [];
    const meta = {};

    orderedIds.forEach((id) => {
      const resolved = selectMergedValueState(
        getStoreItemState(primaryItems.get(id), primaryMeta[id]),
        getStoreItemState(secondaryItems.get(id), secondaryMeta[id]),
        fallbackTime
      );
      if (!resolved) {
        return;
      }

      meta[id] = {
        updatedAt: resolved.time,
        deleted: resolved.kind === 'deleted'
      };

      if (resolved.kind === 'value') {
        items.push(clone(resolved.value));
      }
    });

    return { items, meta };
  }

  function hasStoreMetaEntries(snapshot) {
    const storeMeta = getSnapshotStoreMeta(snapshot);
    return Object.values(storeMeta).some((entries) => Object.keys(entries || {}).length > 0);
  }

  function hasBridgeData(snapshot) {
    const normalized = normalizeBridgeState(snapshot);
    const valueKeys = Object.keys(normalized.values).filter((key) => key !== VALUE_META_STORAGE_KEY && key !== STORE_META_STORAGE_KEY);
    if (valueKeys.length > 0) {
      return true;
    }
    if (Object.keys(getSnapshotValueMeta(normalized)).length > 0 || hasStoreMetaEntries(normalized)) {
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
    merged.values = {};
    const resolutionTime = Date.now();
    const resolvedLayout = resolveMergedLayoutValues(bridge, client, resolutionTime);
    const valueKeys = new Set([
      ...Object.keys(bridge.values || {}).filter((key) => key !== VALUE_META_STORAGE_KEY && key !== STORE_META_STORAGE_KEY && !LAYOUT_STORAGE_KEYS.includes(key)),
      ...Object.keys(client.values || {}).filter((key) => key !== VALUE_META_STORAGE_KEY && key !== STORE_META_STORAGE_KEY && !LAYOUT_STORAGE_KEYS.includes(key)),
      ...Object.keys(getSnapshotValueMeta(bridge)).filter((key) => !LAYOUT_STORAGE_KEYS.includes(key)),
      ...Object.keys(getSnapshotValueMeta(client)).filter((key) => !LAYOUT_STORAGE_KEYS.includes(key))
    ]);
    valueKeys.forEach((key) => {
      const resolved = selectMergedValueState(
        getSnapshotValueState(bridge, key),
        getSnapshotValueState(client, key),
        resolutionTime
      );
      if (!resolved) {
        return;
      }

      if (resolved.kind === 'deleted') {
        delete merged.values[key];
        setSnapshotValueMetaEntry(merged, key, resolved.time, true);
        return;
      }

      merged.values[key] = clone(resolved.value);
      setSnapshotValueMetaEntry(merged, key, resolved.time, false);
    });

    if (resolvedLayout?.kind === 'deleted') {
      LAYOUT_STORAGE_KEYS.forEach((key) => {
        delete merged.values[key];
        setSnapshotValueMetaEntry(merged, key, resolvedLayout.time, true);
      });
    } else if (resolvedLayout?.kind === 'value') {
      LAYOUT_STORAGE_KEYS.forEach((key) => {
        merged.values[key] = clone(resolvedLayout.values[key]);
        setSnapshotValueMetaEntry(merged, key, resolvedLayout.time, false);
      });
    }

    const mergedStoreMeta = {};
    STORES.forEach((storeName) => {
      const mergedStore = mergeStoreWithMeta(bridge, client, storeName, resolutionTime);
      merged.stores[storeName] = mergedStore.items;
      if (Object.keys(mergedStore.meta).length > 0) {
        mergedStoreMeta[storeName] = mergedStore.meta;
      }
    });

    setSnapshotStoreMeta(merged, mergedStoreMeta);

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
    return safeWrite(LOCAL_PREFIX + key, JSON.stringify(value), {
      scope: '[Storage] localStorage write failed:',
      throwOnError: true
    });
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
      const parsed = safeParse(raw, null);
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
      const parsed = safeParse(raw, []);
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
        const parsed = safeParse(rawValue, undefined);
        if (parsed === undefined) {
          continue;
        }

        if (strippedKey.startsWith(STORE_PREFIX)) {
          const storeName = strippedKey.slice(STORE_PREFIX.length);
          if (storeName !== BACKUP_STORE && STORES.includes(storeName) && Array.isArray(parsed)) {
            snapshot.stores[storeName] = clone(parsed);
          }
        } else {
          snapshot.values[strippedKey] = parsed;
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
    return mergeBridgeAndClientSnapshots(localSnapshot, indexedDbSnapshot);
  }

  async function fetchJson(url, options = {}) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller
      ? window.setTimeout(() => controller.abort(), options.timeout || 1800)
      : null;
    const headers = buildBridgeHeaders(options.headers || {});

    try {
      const response = await fetch(url, {
        method: options.method || 'GET',
        headers,
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
    if (!bridgeEnabled || bridgePendingOps.length === 0) return;
    if (bridgeFlushTimer) {
      window.clearTimeout(bridgeFlushTimer);
      bridgeFlushTimer = null;
    }

    const ops = bridgePendingOps.splice(0, bridgePendingOps.length);
    try {
      const requestBody = JSON.stringify({ ops });
      const requestHeaders = buildBridgeHeaders({ 'Content-Type': 'application/json' });
      if (requestHeaders['X-LivelySam-Token']) {
        fetch(BRIDGE_OPS_URL, {
          method: 'POST',
          headers: requestHeaders,
          body: requestBody,
          cache: 'no-store',
          keepalive: true,
          mode: 'cors'
        }).catch(() => {
          bridgePendingOps = ops.concat(bridgePendingOps);
        });
        return;
      }
      if (typeof navigator.sendBeacon !== 'function') {
        bridgePendingOps = ops.concat(bridgePendingOps);
        return;
      }
      const payload = new Blob([requestBody], { type: 'application/json' });
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
        const parsed = safeParse(rawValue, undefined);
        if (parsed === undefined) {
          return;
        }

        if (strippedKey.startsWith(STORE_PREFIX)) {
          const storeName = strippedKey.slice(STORE_PREFIX.length);
          if (storeName !== BACKUP_STORE && STORES.includes(storeName) && Array.isArray(parsed)) {
            snapshot.stores[storeName] = clone(parsed);
          }
        } else {
          snapshot.values[strippedKey] = parsed;
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
      if (String(key || '').trim() === VALUE_META_STORAGE_KEY) {
        return defaultValue;
      }
      if (bridgeEnabled) {
        return Object.prototype.hasOwnProperty.call(bridgeState.values, key)
          ? clone(bridgeState.values[key])
          : defaultValue;
      }

      try {
        const val = localStorage.getItem(LOCAL_PREFIX + key);
        if (val === null) return defaultValue;
        return safeParse(val, defaultValue);
      } catch {
        return defaultValue;
      }
    },

    set(key, value) {
      const normalizedKey = String(key || '').trim();
      if (!normalizedKey || normalizedKey === VALUE_META_STORAGE_KEY) {
        return;
      }
      const writeStamp = Date.now();

      if (bridgeEnabled) {
        bridgeState.values[normalizedKey] = clone(value);
        const valueMeta = setSnapshotValueMetaEntry(bridgeState, normalizedKey, writeStamp, false);
        try {
          writeRaw(normalizedKey, value);
          writeStoredValueMeta(valueMeta);
        } catch {
          // keep bridge state even if browser local mirror fails
        }
        enqueueBridgeOperation({ type: 'set-value', key: normalizedKey, value });
        enqueueBridgeOperation({ type: 'set-value', key: VALUE_META_STORAGE_KEY, value: valueMeta });
        queueBridgeFlush();
        return;
      }

      try {
        writeRaw(normalizedKey, value);
        const valueMeta = readStoredValueMeta();
        valueMeta[normalizedKey] = {
          updatedAt: writeStamp,
          deleted: false
        };
        writeStoredValueMeta(valueMeta);
      } catch (e) {
        console.warn('[Storage] localStorage write failed:', e);
      }
    },

    remove(key) {
      const normalizedKey = String(key || '').trim();
      if (!normalizedKey || normalizedKey === VALUE_META_STORAGE_KEY) {
        return;
      }
      const writeStamp = Date.now();

      if (bridgeEnabled) {
        delete bridgeState.values[normalizedKey];
        const valueMeta = setSnapshotValueMetaEntry(bridgeState, normalizedKey, writeStamp, true);
        try {
          removeRaw(normalizedKey);
          writeStoredValueMeta(valueMeta);
        } catch {
          // ignore mirror cleanup failures
        }
        enqueueBridgeOperation({ type: 'remove-value', key: normalizedKey });
        enqueueBridgeOperation({ type: 'set-value', key: VALUE_META_STORAGE_KEY, value: valueMeta });
        queueBridgeFlush();
        return;
      }
      try {
        removeRaw(normalizedKey);
        const valueMeta = readStoredValueMeta();
        valueMeta[normalizedKey] = {
          updatedAt: writeStamp,
          deleted: true
        };
        writeStoredValueMeta(valueMeta);
      } catch {
        removeRaw(normalizedKey);
      }
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

    async flushPending() {
      if (!bridgeEnabled) {
        return true;
      }
      return await flushBridgeNow();
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

            const normalizedRemoteSnapshot = normalizeBridgeState(remoteSnapshot);
            if (JSON.stringify(normalizedRemoteSnapshot) !== JSON.stringify(bridgeState)) {
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
      const writeStamp = Date.now();

      if (bridgeEnabled) {
        const items = Array.isArray(bridgeState.stores[storeName]) ? clone(bridgeState.stores[storeName]) : [];
        const index = items.findIndex((item) => item?.id === data?.id);
        if (index >= 0) {
          items[index] = clone(data);
        } else {
          items.push(clone(data));
        }
        bridgeState.stores[storeName] = items;
        const storeMeta = setSnapshotStoreMetaEntry(bridgeState, storeName, data?.id, writeStamp, false);
        try {
          writeStore(storeName, items);
          writeStoredStoreMeta(storeMeta);
        } catch {
          // ignore local mirror failures
        }
        enqueueBridgeOperation({ type: 'put-store-item', storeName, item: data });
        enqueueBridgeOperation({ type: 'set-value', key: STORE_META_STORAGE_KEY, value: storeMeta });
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
        updateStoredStoreMetaEntry(storeName, data?.id, writeStamp, false);
        return data?.id;
      }

      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.put(data);
        request.onsuccess = () => {
          updateStoredStoreMetaEntry(storeName, data?.id, writeStamp, false);
          resolve(request.result);
        };
        request.onerror = () => reject(request.error);
      });
    },

    async dbDelete(storeName, id) {
      const writeStamp = Date.now();

      if (bridgeEnabled) {
        bridgeState.stores[storeName] = (bridgeState.stores[storeName] || []).filter((item) => item?.id !== id);
        const storeMeta = setSnapshotStoreMetaEntry(bridgeState, storeName, id, writeStamp, true);
        try {
          writeStore(storeName, bridgeState.stores[storeName]);
          writeStoredStoreMeta(storeMeta);
        } catch {
          // ignore local mirror failures
        }
        enqueueBridgeOperation({ type: 'delete-store-item', storeName, id });
        enqueueBridgeOperation({ type: 'set-value', key: STORE_META_STORAGE_KEY, value: storeMeta });
        await flushBridgeNow();
        return;
      }

      if (!db) await this.initDB();

      if (!this.isIndexedDBAvailable()) {
        writeStore(storeName, readStore(storeName).filter((item) => item?.id !== id));
        updateStoredStoreMetaEntry(storeName, id, writeStamp, true);
        return;
      }

      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.delete(id);
        request.onsuccess = () => {
          updateStoredStoreMetaEntry(storeName, id, writeStamp, true);
          resolve();
        };
        request.onerror = () => reject(request.error);
      });
    },

    async dbClear(storeName) {
      const writeStamp = Date.now();
      const existingIds = bridgeEnabled
        ? []
        : (await this.dbGetAll(storeName)).map((item) => String(item?.id || '').trim()).filter(Boolean);

      if (bridgeEnabled) {
        (bridgeState.stores[storeName] || []).forEach((item) => {
          setSnapshotStoreMetaEntry(bridgeState, storeName, item?.id, writeStamp, true);
        });
        bridgeState.stores[storeName] = [];
        const storeMeta = getSnapshotStoreMeta(bridgeState);
        try {
          writeStore(storeName, []);
          writeStoredStoreMeta(storeMeta);
        } catch {
          // ignore local mirror failures
        }
        enqueueBridgeOperation({ type: 'clear-store', storeName });
        enqueueBridgeOperation({ type: 'set-value', key: STORE_META_STORAGE_KEY, value: storeMeta });
        await flushBridgeNow();
        return;
      }

      if (!db) await this.initDB();

      if (!this.isIndexedDBAvailable()) {
        readStore(storeName).forEach((item) => {
          updateStoredStoreMetaEntry(storeName, item?.id, writeStamp, true);
        });
        writeStore(storeName, []);
        return;
      }

      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.clear();
        request.onsuccess = () => {
          existingIds.forEach((id) => {
            updateStoredStoreMetaEntry(storeName, id, writeStamp, true);
          });
          resolve();
        };
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
            const parsed = safeParse(localStorage.getItem(key), undefined);
            if (parsed === undefined) {
              throw new Error('InvalidExportValue');
            }
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
          safeWrite(key, val, {
            scope: '[Storage] localStorage import failed:'
          });
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
