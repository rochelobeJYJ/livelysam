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
        container.innerHTML = '<div class="bm-empty">+ 버튼으로 즐겨찾기를 추가해보세요</div>';
        return;
      }

      let html = '<div class="bm-grid">';
      this._bookmarks.forEach((bookmark) => {
        const safeUrl = LS.Helpers.escapeHtml(bookmark.url);
        const safeName = LS.Helpers.escapeHtml(bookmark.name);
        const safeIcon = LS.Helpers.escapeHtml(bookmark.icon || '🔗');

        html += `<div class="bm-item" data-id="${bookmark.id}">`;
        html += `<button class="bm-link" data-action="open" data-url="${safeUrl}" title="${safeUrl}">`;
        html += `<span class="bm-icon">${safeIcon}</span>`;
        html += `<span class="bm-name">${safeName}</span>`;
        html += `</button>`;
        html += `<div class="bm-actions">`;
        html += `<button class="bm-action-btn" data-action="copy" data-url="${safeUrl}" title="URL 복사">복사</button>`;
        html += `<button class="bm-action-btn" data-action="edit" title="수정">수정</button>`;
        html += `<button class="bm-action-btn" data-action="delete" title="삭제">삭제</button>`;
        html += `</div>`;
        html += `</div>`;
      });
      html += '</div>';
      container.innerHTML = html;

      container.onclick = (event) => this._handleClick(event);
    },

    async addBookmark() {
      const result = await LS.Helpers.promptModal('즐겨찾기 추가', [
        { id: 'name', type: 'text', label: '이름', placeholder: '예: ChatGPT' },
        { id: 'url', type: 'url', label: 'URL', placeholder: 'https://example.com' },
        { id: 'icon', type: 'text', label: '아이콘', placeholder: '🔗', value: '🔗' }
      ], {
        confirmText: '추가'
      });

      if (!result) return;

      const name = result.name?.trim();
      const url = this._normalizeUrl(result.url);
      const icon = result.icon?.trim() || '🔗';

      if (!name || !url) {
        LS.Helpers.showToast('이름과 URL을 모두 입력해주세요.', 'warning');
        return;
      }

      const bookmark = {
        id: LS.Helpers.generateId(),
        name,
        url,
        icon,
        createdAt: new Date().toISOString()
      };

      this._bookmarks.push(bookmark);
      await this._save(bookmark);
      this.render();
      LS.Helpers.showToast('즐겨찾기를 추가했습니다.', 'success');
    },

    async editBookmark(id) {
      const bookmark = this._bookmarks.find((item) => item.id === id);
      if (!bookmark) return;

      const result = await LS.Helpers.promptModal('즐겨찾기 수정', [
        { id: 'name', type: 'text', label: '이름', value: bookmark.name },
        { id: 'url', type: 'url', label: 'URL', value: bookmark.url },
        { id: 'icon', type: 'text', label: '아이콘', value: bookmark.icon || '🔗' }
      ], {
        confirmText: '저장'
      });

      if (!result) return;

      const name = result.name?.trim();
      const url = this._normalizeUrl(result.url);
      const icon = result.icon?.trim() || '🔗';

      if (!name || !url) {
        LS.Helpers.showToast('이름과 URL을 모두 입력해주세요.', 'warning');
        return;
      }

      bookmark.name = name;
      bookmark.url = url;
      bookmark.icon = icon;

      await this._save(bookmark);
      this.render();
      LS.Helpers.showToast('즐겨찾기를 수정했습니다.', 'success');
    },

    async deleteBookmark(id) {
      const confirmed = await LS.Helpers.confirmModal('즐겨찾기 삭제', '이 즐겨찾기를 삭제할까요?');
      if (!confirmed) return;

      this._bookmarks = this._bookmarks.filter((item) => item.id !== id);
      try {
        await LS.Storage.dbDelete('bookmarks', id);
      } catch {
        LS.Storage.set('bookmarks_fallback', this._bookmarks);
      }
      this.render();
      LS.Helpers.showToast('즐겨찾기를 삭제했습니다.', 'success');
    },

    async _handleClick(event) {
      const actionEl = event.target.closest('[data-action]');
      if (!actionEl) return;

      const card = actionEl.closest('.bm-item');
      const id = card?.dataset.id;
      const action = actionEl.dataset.action;
      const url = actionEl.dataset.url;

      if (action === 'open' && url) {
        window.open(url, '_blank', 'noopener,noreferrer');
        return;
      }

      if (action === 'copy' && url) {
        await this._copyUrl(url);
        return;
      }

      if (!id) return;

      if (action === 'edit') {
        this.editBookmark(id);
      } else if (action === 'delete') {
        this.deleteBookmark(id);
      }
    },

    async _copyUrl(url) {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(url);
          LS.Helpers.showToast('URL을 복사했습니다.', 'success');
          return;
        }
      } catch {
        // Fall through to the warning toast below.
      }
      LS.Helpers.showToast('클립보드 복사에 실패했습니다. URL을 직접 확인해주세요.', 'warning', 3200);
    },

    _normalizeUrl(url) {
      const trimmed = String(url || '').trim();
      if (!trimmed) return '';
      if (/^https?:\/\//i.test(trimmed)) return trimmed;
      return `https://${trimmed}`;
    },

    async _save(bookmark) {
      try {
        await LS.Storage.dbPut('bookmarks', bookmark);
      } catch {
        LS.Storage.set('bookmarks_fallback', this._bookmarks);
      }
    }
  };
})();
