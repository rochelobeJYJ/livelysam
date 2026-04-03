(function () {
  'use strict';
  const LS = window.LivelySam = window.LivelySam || {};

  LS.BookmarksWidget = {
    _bookmarks: [],

    async init() {
      try {
        this._bookmarks = await LS.Storage.dbGetAll('bookmarks');
      } catch {
        this._bookmarks = LS.Storage.get('bookmarks_fallback', []);
      }
      this.render();
    },

    render() {
      const container = document.getElementById('bookmarks-content');
      if (!container) return;

      if (this._bookmarks.length === 0) {
        container.innerHTML = '<div class="bm-empty">🔗 즐겨찾기를 추가해보세요</div>';
        return;
      }

      let html = '<div class="bm-grid">';
      this._bookmarks.forEach(bm => {
        html += `<a class="bm-item" href="${LS.Helpers.escapeHtml(bm.url)}" target="_blank" data-id="${bm.id}" title="${LS.Helpers.escapeHtml(bm.url)}">`;
        html += `<span class="bm-icon">${bm.icon || '🔗'}</span>`;
        html += `<span class="bm-name">${LS.Helpers.escapeHtml(bm.name)}</span>`;
        html += `</a>`;
      });
      html += '</div>';
      container.innerHTML = html;

      // 우클릭으로 편집/삭제
      container.querySelectorAll('.bm-item').forEach(item => {
        item.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          this._showContextMenu(e, item.dataset.id);
        });
      });
    },

    addBookmark() {
      const name = prompt('즐겨찾기 이름:');
      if (!name || !name.trim()) return;
      const url = prompt('URL (https://...):', 'https://');
      if (!url || !url.trim()) return;
      const icon = prompt('아이콘 (이모지):', '🔗') || '🔗';

      const bm = {
        id: LS.Helpers.generateId(),
        name: name.trim(),
        url: url.trim(),
        icon: icon,
        createdAt: new Date().toISOString()
      };

      this._bookmarks.push(bm);
      this._save(bm);
      this.render();
    },

    async deleteBookmark(id) {
      this._bookmarks = this._bookmarks.filter(b => b.id !== id);
      try { await LS.Storage.dbDelete('bookmarks', id); }
      catch { LS.Storage.set('bookmarks_fallback', this._bookmarks); }
      this.render();
    },

    async editBookmark(id) {
      const bm = this._bookmarks.find(b => b.id === id);
      if (!bm) return;

      const name = prompt('이름 수정:', bm.name);
      if (name === null) return;
      bm.name = name.trim() || bm.name;

      const url = prompt('URL 수정:', bm.url);
      if (url !== null) bm.url = url.trim() || bm.url;

      const icon = prompt('아이콘 수정:', bm.icon);
      if (icon !== null) bm.icon = icon || bm.icon;

      await this._save(bm);
      this.render();
    },

    _showContextMenu(e, id) {
      // 간단한 편집/삭제 선택
      const action = prompt('작업 선택:\n1: 편집\n2: 삭제\n(숫자 입력)');
      if (action === '1') this.editBookmark(id);
      if (action === '2') this.deleteBookmark(id);
    },

    async _save(bm) {
      try { await LS.Storage.dbPut('bookmarks', bm); }
      catch { LS.Storage.set('bookmarks_fallback', this._bookmarks); }
    }
  };
})();
