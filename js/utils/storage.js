(function () {
  'use strict';
  const LS = window.LivelySam = window.LivelySam || {};

  const DB_NAME = 'LivelySamDB';
  const DB_VERSION = 1;
  const STORES = ['memos', 'todos', 'bookmarks', 'schedules', 'backups'];
  const LOCAL_PREFIX = 'ls_';
  const STORE_PREFIX = 'db_store_';

  let db = null;
  let dbMode = 'unknown';
  let initPromise = null;

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

  function getStoreKey(storeName) {
    return STORE_PREFIX + storeName;
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

  function getErrorDetails(error) {
    if (!error) return 'UnknownError';
    const name = error.name || 'UnknownError';
    const message = error.message ? `: ${error.message}` : '';
    return `${name}${message}`;
  }

  function enableFallback(reason, error) {
    if (dbMode !== 'localstorage') {
      console.warn(`[Storage] IndexedDB disabled, using localStorage fallback. ${reason} ${getErrorDetails(error)}`.trim());
    }
    dbMode = 'localstorage';
    db = null;
  }

  LS.Storage = {
    get(key, defaultValue) {
      try {
        const val = localStorage.getItem(LOCAL_PREFIX + key);
        if (val === null) return defaultValue;
        return JSON.parse(val);
      } catch {
        return defaultValue;
      }
    },

    set(key, value) {
      try {
        localStorage.setItem(LOCAL_PREFIX + key, JSON.stringify(value));
      } catch (e) {
        console.warn('[Storage] localStorage write failed:', e);
      }
    },

    remove(key) {
      localStorage.removeItem(LOCAL_PREFIX + key);
    },

    isIndexedDBAvailable() {
      return dbMode === 'indexeddb' && !!db;
    },

    async initDB() {
      if (this.isIndexedDBAvailable()) return db;
      if (dbMode === 'localstorage') return null;
      if (initPromise) return initPromise;

      initPromise = new Promise((resolve) => {
        if (typeof indexedDB === 'undefined') {
          enableFallback('indexedDB API is not available.');
          resolve(null);
          initPromise = null;
          return;
        }

        let request;
        try {
          request = indexedDB.open(DB_NAME, DB_VERSION);
        } catch (error) {
          enableFallback('indexedDB.open() threw.', error);
          resolve(null);
          initPromise = null;
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
          initPromise = null;
        };

        request.onblocked = () => {
          const error = request.error || new Error('IndexedDB open was blocked.');
          enableFallback('open request was blocked.', error);
          resolve(null);
          initPromise = null;
        };

        request.onerror = () => {
          const error = request.error || new Error('IndexedDB open failed.');
          enableFallback('open request failed.', error);
          resolve(null);
          initPromise = null;
        };
      });

      return initPromise;
    },

    async dbGet(storeName, id) {
      if (!db) await this.initDB();

      if (!this.isIndexedDBAvailable()) {
        return readStore(storeName).find((item) => item?.id === id) || null;
      }

      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    },

    async dbGetAll(storeName) {
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
      const data = {
        version: 1,
        exportDate: new Date().toISOString(),
        localStorage: {},
        indexedDB: {}
      };

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(LOCAL_PREFIX)) {
          data.localStorage[key] = localStorage.getItem(key);
        }
      }

      for (const store of STORES) {
        try {
          data.indexedDB[store] = await this.dbGetAll(store);
        } catch {
          data.indexedDB[store] = [];
        }
      }

      return data;
    },

    async importAll(data) {
      if (!data || data.version !== 1) {
        throw new Error('Invalid backup file format.');
      }

      if (data.localStorage) {
        Object.entries(data.localStorage).forEach(([key, val]) => {
          localStorage.setItem(key, val);
        });
      }

      if (data.indexedDB) {
        for (const [store, items] of Object.entries(data.indexedDB)) {
          if (STORES.includes(store)) {
            await this.dbClear(store);
            for (const item of items) {
              await this.dbPut(store, item);
            }
          }
        }
      }
    },

    async autoBackup() {
      const lastBackup = this.get('lastBackupDate', '');
      const today = new Date().toISOString().slice(0, 10);

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
        for (let i = 7; i < sorted.length; i++) {
          await this.dbDelete('backups', sorted[i].id);
        }

        console.log('[Storage] Auto backup complete:', today);
      } catch (e) {
        console.error('[Storage] Auto backup failed:', e);
      }
    },

    async getBackupList() {
      try {
        const all = await this.dbGetAll('backups');
        return all.sort((a, b) => b.date.localeCompare(a.date)).map((backup) => ({
          id: backup.id,
          date: backup.date,
          createdAt: backup.createdAt
        }));
      } catch {
        return [];
      }
    },

    async restoreBackup(backupId) {
      const backup = await this.dbGet('backups', backupId);
      if (!backup || !backup.data) {
        throw new Error('Backup data not found.');
      }
      await this.importAll(backup.data);
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
