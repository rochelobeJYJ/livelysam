(function () {
  'use strict';

  const LS = window.LivelySam = window.LivelySam || {};

  function getBookmarkRecords(query, archivedOnly) {
    if (query) {
      return LS.Records.search(query, { facets: ['bookmark'], archived: archivedOnly ? true : false });
    }

    const bookmarks = LS.Records.listBookmarks({ includeArchived: archivedOnly });
    return archivedOnly ? bookmarks.filter((record) => record.archivedAt) : bookmarks.filter((record) => !record.archivedAt);
  }

  function renderPreview(record) {
    const body = LS.Records.getDisplayBody(record);
    return body ? LS.Helpers.escapeHtml(body).replace(/\n/g, '<br>') : '';
  }

  LS.BookmarksWidget = {
    _bound: false,
    _query: '',
    _showArchived: false,

    async init() {
      await LS.Records.init();

      if (!this._bound) {
        this._bound = true;
        window.addEventListener('livelysam:recordsChanged', () => this.render());
      }

      this.render();
    },

    render() {
      const container = document.getElementById('bookmarks-content');
      if (!container) return;

      const bookmarks = getBookmarkRecords(this._query, this._showArchived);
      const pinned = this._showArchived ? [] : bookmarks.filter((record) => record.pinned);
      const regular = this._showArchived ? bookmarks : bookmarks.filter((record) => !record.pinned);

      let html = '<div class="widget-toolbar">';
      html += `<input class="widget-search" id="bookmark-search" type="text" placeholder="북마크 검색" value="${LS.Helpers.escapeHtml(this._query)}">`;
      html += '<div class="widget-filter-group">';
      html += `<button class="widget-filter-btn ${this._showArchived ? '' : 'active'}" data-filter="active">사용 중</button>`;
      html += `<button class="widget-filter-btn ${this._showArchived ? 'active' : ''}" data-filter="archived">보관함</button>`;
      html += '</div></div>';

      html += '<div class="bm-list">';
      if (!bookmarks.length) {
        html += `<div class="bm-empty">${this._showArchived ? '보관된 북마크가 없습니다.' : '+ 버튼으로 북마크를 추가해 보세요'}</div>`;
      } else {
        if (pinned.length) {
          html += '<div class="record-section-title">고정 북마크</div>';
          html += '<div class="bm-grid">';
          pinned.forEach((record) => {
            html += this._renderCard(record);
          });
          html += '</div>';
        }

        if (regular.length) {
          html += `<div class="record-section-title">${this._showArchived ? '보관된 북마크' : '북마크 목록'}</div>`;
          html += '<div class="bm-grid">';
          regular.forEach((record) => {
            html += this._renderCard(record);
          });
          html += '</div>';
        }
      }
      html += '</div>';

      container.innerHTML = html;

      container.querySelector('#bookmark-search')?.addEventListener('input', (event) => {
        this._query = event.target.value || '';
        this.render();
      });

      container.querySelectorAll('[data-filter]').forEach((button) => {
        button.addEventListener('click', () => {
          this._showArchived = button.dataset.filter === 'archived';
          this.render();
        });
      });

      container.querySelectorAll('.bm-item').forEach((card) => {
        card.addEventListener('click', (event) => this._handleClick(event, card.dataset.id));
      });
    },

    _renderCard(record) {
      const colorMeta = LS.Records.getColorMeta(record.color);
      const title = LS.Helpers.escapeHtml(LS.Records.getDisplayTitle(record, '북마크'));
      const url = LS.Helpers.escapeHtml(record.bookmark.url);
      const icon = LS.Helpers.escapeHtml(record.bookmark.icon || '🔖');
      const desc = renderPreview(record);
      const linkedLabels = LS.Records.getFacetLabels(record, ['bookmark']);
      const tagLabels = LS.Records.getTagLabels(record);

      let html = `<div class="bm-item" data-id="${record.id}" style="background:${colorMeta.bg}">`;
      html += '<div class="bm-topbar">';
      html += `<button class="bm-pin ${record.pinned ? 'pinned' : ''}" data-action="pin" title="${record.pinned ? '고정 해제' : '상단 고정'}">📌</button>`;
      html += '<div class="bm-card-actions">';
      html += '<button class="bm-icon-btn" data-action="edit" title="편집">✏️</button>';
      html += '<button class="bm-icon-btn" data-action="delete" title="삭제">🗑️</button>';
      html += '</div></div>';

      html += `<button class="bm-link" data-action="open" title="${url}">`;
      html += '<div class="bm-head">';
      html += `<span class="bm-icon">${icon}</span>`;
      html += `<span class="bm-name">${title}</span>`;
      html += '</div>';
      if (record.category) html += `<div class="bm-category">${LS.Helpers.escapeHtml(record.category)}</div>`;
      html += `<div class="bm-url">${url}</div>`;
      if (desc) html += `<div class="bm-desc">${desc}</div>`;
      html += '</button>';

      if (linkedLabels.length || tagLabels.length) {
        html += '<div class="record-badge-row">';
        linkedLabels.forEach((label) => {
          html += `<span class="record-facet-badge">${LS.Helpers.escapeHtml(label)}</span>`;
        });
        tagLabels.forEach((label) => {
          html += `<span class="record-tag-badge">${LS.Helpers.escapeHtml(label)}</span>`;
        });
        html += '</div>';
      }

      html += '<div class="bm-actions">';
      html += '<button class="bm-action-btn" data-action="copy">복사</button>';
      html += `<button class="bm-action-btn" data-action="archive">${record.archivedAt ? '복원' : '보관'}</button>`;
      html += '</div>';
      html += '</div>';

      return html;
    },

    async addBookmark() {
      await LS.Records.openRecordEditor({ mode: 'bookmark' });
    },

    async _handleClick(event, recordId) {
      const action = event.target.dataset.action || event.target.closest('[data-action]')?.dataset.action;
      if (!action || !recordId) return;

      const record = LS.Records.getById(recordId);
      if (!record) return;

      if (action === 'open') {
        LS.Records.openBookmark(record);
        return;
      }

      if (action === 'copy') {
        await this._copyUrl(record.bookmark.url);
        return;
      }

      if (action === 'pin') {
        await LS.Records.togglePinned(recordId);
        return;
      }

      if (action === 'archive') {
        await LS.Records.toggleArchive(recordId);
        return;
      }

      if (action === 'edit') {
        await LS.Records.openRecordEditor({ recordId, mode: 'bookmark' });
        return;
      }

      if (action === 'delete') {
        const confirmed = await LS.Helpers.confirmModal('북마크 삭제', '이 북마크 연결을 제거하시겠습니까?');
        if (!confirmed) return;
        await LS.Records.removeFacet(recordId, 'bookmark');
      }
    },

    async _copyUrl(url) {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(url);
          LS.Helpers.showToast('링크 주소를 복사했습니다.', 'success');
          return;
        }
      } catch {}
      LS.Helpers.showToast('클립보드 복사에 실패했습니다. 링크를 직접 확인해 주세요.', 'warning', 3200);
    }
  };
})();
