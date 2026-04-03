(function () {
  'use strict';
  const LS = window.LivelySam = window.LivelySam || {};

  const DB_NAME = 'LivelySamDB';
  const DB_VERSION = 1;
  const STORES = ['memos', 'todos', 'bookmarks', 'schedules', 'backups'];

  let db = null;

  LS.Storage = {
    /* ── localStorage 래퍼 ── */
    get(key, defaultValue) {
      try {
        const val = localStorage.getItem('ls_' + key);
        if (val === null) return defaultValue;
        return JSON.parse(val);
      } catch {
        return defaultValue;
      }
    },

    set(key, value) {
      try {
        localStorage.setItem('ls_' + key, JSON.stringify(value));
      } catch (e) {
        console.warn('[Storage] localStorage 저장 실패:', e);
      }
    },

    remove(key) {
      localStorage.removeItem('ls_' + key);
    },

    /* ── IndexedDB 초기화 ── */
    async initDB() {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (e) => {
          const db = e.target.result;
          STORES.forEach(name => {
            if (!db.objectStoreNames.contains(name)) {
              db.createObjectStore(name, { keyPath: 'id' });
            }
          });
        };

        request.onsuccess = (e) => {
          db = e.target.result;
          resolve(db);
        };

        request.onerror = (e) => {
          console.error('[Storage] IndexedDB 초기화 실패:', e);
          reject(e);
        };
      });
    },

    /* ── IndexedDB CRUD ── */
    async dbGet(storeName, id) {
      if (!db) await this.initDB();
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
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    },

    /* ── 전체 데이터 내보내기 ── */
    async exportAll() {
      const data = {
        version: 1,
        exportDate: new Date().toISOString(),
        localStorage: {},
        indexedDB: {}
      };

      // localStorage
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith('ls_')) {
          data.localStorage[key] = localStorage.getItem(key);
        }
      }

      // IndexedDB
      for (const store of STORES) {
        try {
          data.indexedDB[store] = await this.dbGetAll(store);
        } catch {
          data.indexedDB[store] = [];
        }
      }

      return data;
    },

    /* ── 전체 데이터 가져오기 ── */
    async importAll(data) {
      if (!data || data.version !== 1) {
        throw new Error('올바르지 않은 데이터 형식입니다.');
      }

      // localStorage
      if (data.localStorage) {
        Object.entries(data.localStorage).forEach(([key, val]) => {
          localStorage.setItem(key, val);
        });
      }

      // IndexedDB
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

    /* ── 자동 백업 (1일 1회) ── */
    async autoBackup() {
      const lastBackup = this.get('lastBackupDate', '');
      const today = new Date().toISOString().slice(0, 10);

      if (lastBackup === today) return; // 오늘 이미 백업함

      try {
        const data = await this.exportAll();
        const backupEntry = {
          id: 'backup_' + today,
          date: today,
          data: data,
          createdAt: new Date().toISOString()
        };

        await this.dbPut('backups', backupEntry);
        this.set('lastBackupDate', today);

        // 최근 7일 백업만 유지
        const allBackups = await this.dbGetAll('backups');
        const sorted = allBackups.sort((a, b) => b.date.localeCompare(a.date));
        for (let i = 7; i < sorted.length; i++) {
          await this.dbDelete('backups', sorted[i].id);
        }

        console.log('[Storage] 자동 백업 완료:', today);
      } catch (e) {
        console.error('[Storage] 자동 백업 실패:', e);
      }
    },

    /* ── 백업 목록 조회 ── */
    async getBackupList() {
      try {
        const all = await this.dbGetAll('backups');
        return all.sort((a, b) => b.date.localeCompare(a.date)).map(b => ({
          id: b.id,
          date: b.date,
          createdAt: b.createdAt
        }));
      } catch {
        return [];
      }
    },

    /* ── 특정 백업 복원 ── */
    async restoreBackup(backupId) {
      const backup = await this.dbGet('backups', backupId);
      if (!backup || !backup.data) {
        throw new Error('백업 데이터를 찾을 수 없습니다.');
      }
      await this.importAll(backup.data);
    },

    /* ── JSON 파일 다운로드 ── */
    downloadJSON(data, filename) {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
  };
})();
