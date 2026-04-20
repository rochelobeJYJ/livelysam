(function () {
  'use strict';

  const LS = window.LivelySam = window.LivelySam || {};

  function formatUpdatedAt(dateStr) {
    if (!dateStr) return '';

    const date = new Date(dateStr);
    const today = new Date();
    if (date.toDateString() === today.toDateString()) {
      return LS.Helpers.formatTime(date, true, false);
    }
    return LS.Helpers.formatDate(date, 'M월 D일');
  }

  function escapeAndBreaks(value) {
    return LS.Helpers.escapeHtml(String(value || '')).replace(/\n/g, '<br>');
  }

  function renderSectionAction(action, icon, title, active = false) {
    return `<button class="record-section-icon-btn ${active ? 'is-active' : ''}" type="button" data-toolbar-action="${action}" title="${LS.Helpers.escapeHtml(title)}" aria-label="${LS.Helpers.escapeHtml(title)}">${icon}</button>`;
  }

  function renderSectionHeader(title, actions = '') {
    return `<div class="record-section-row"><div class="record-section-title">${LS.Helpers.escapeHtml(title)}</div>${actions ? `<div class="record-section-actions">${actions}</div>` : ''}</div>`;
  }

  function getMemoRecords(query, archivedOnly) {
    if (query) {
      return LS.Records.search(query, { facets: ['note'], archived: archivedOnly ? true : false });
    }

    const notes = LS.Records.listNotes({ includeArchived: archivedOnly });
    return archivedOnly ? notes.filter((record) => record.archivedAt) : notes.filter((record) => !record.archivedAt);
  }

  function splitMemoBody(record) {
    const title = String(record.title || '').trim();
    const body = LS.Records.getDisplayBody(record);
    const lines = String(body || '').split(/\r?\n/g);
    const plainLines = lines.filter((line) => !/^\s*-\s*\[( |x|X)\]\s+/.test(line));
    const preview = plainLines.join('\n').trim();
    const fallback = title || LS.Records.getDisplayTitle(record, '메모');
    return { title, preview, fallback };
  }

  LS.MemoWidget = {
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
      const container = document.getElementById('memo-content');
      if (!container) return;

      const memos = getMemoRecords(this._query, this._showArchived);
      const colors = LS.Records.getColorOptions();
      const pinned = this._showArchived ? [] : memos.filter((record) => record.pinned);
      const regular = this._showArchived ? memos : memos.filter((record) => !record.pinned);

      let html = '';
      html += '<div class="memo-list">';
      const toolbarActions = [
        renderSectionAction('search', '⌕', this._query ? `검색어 변경 (${this._query})` : '검색', Boolean(this._query)),
        renderSectionAction('toggle-archive', '🗃', this._showArchived ? '사용 중 메모 보기' : '보관함 보기', this._showArchived)
      ].join('');

      if (!memos.length) {
        html += renderSectionHeader(this._showArchived ? '보관된 메모' : '메모 목록', toolbarActions);
        html += `<div class="memo-empty">${this._showArchived ? '보관된 메모가 없습니다.' : '+ 버튼으로 메모를 추가해 보세요'}</div>`;
      } else {
        if (pinned.length) {
          html += renderSectionHeader('고정 메모', !regular.length && !this._showArchived ? toolbarActions : '');
          pinned.forEach((record) => {
            html += this._renderMemoCard(record, colors);
          });
        }

        if (regular.length) {
          const regularTitle = this._showArchived ? '보관된 메모' : '메모 목록';
          html += renderSectionHeader(regularTitle, this._showArchived || regular.length ? toolbarActions : '');
          regular.forEach((record) => {
            html += this._renderMemoCard(record, colors);
          });
        }
      }

      html += '</div>';
      container.innerHTML = html;

      container.querySelectorAll('[data-toolbar-action]').forEach((button) => {
        button.addEventListener('click', () => {
          void this._handleToolbarAction(button.dataset.toolbarAction || '');
        });
      });

      container.querySelectorAll('.memo-card').forEach((card) => {
        card.addEventListener('click', (event) => this._handleCardClick(event, card.dataset.id));
      });
    },

    _renderMemoCard(record, colors) {
      const colorMeta = LS.Records.getColorMeta(record.color);
      const linkedLabels = LS.Records.getFacetLabels(record, ['note']);
      const tagLabels = LS.Records.getTagLabels(record);
      const checklist = LS.Records.getChecklistItems(record);
      const body = splitMemoBody(record);

      let html = `<div class="memo-card" style="background:${colorMeta.bg}" data-id="${record.id}">`;
      html += '<div class="memo-card-header">';
      html += `<button class="memo-pin ${record.pinned ? 'pinned' : ''}" data-action="pin" title="${record.pinned ? '고정 해제' : '상단 고정'}">📌</button>`;
      html += '<div class="memo-card-actions-right">';
      html += '<button class="memo-edit" data-action="edit" title="편집">✏️</button>';
      html += '<button class="memo-delete" data-action="delete" title="삭제">✕</button>';
      html += '</div></div>';

      html += '<div class="memo-card-body" data-action="edit">';
      if (body.title && body.preview) {
        html += `<div class="memo-card-title">${LS.Helpers.escapeHtml(body.title)}</div>`;
        html += `<div class="memo-card-text">${escapeAndBreaks(body.preview)}</div>`;
      } else {
        html += `<div class="memo-card-text">${escapeAndBreaks(body.fallback)}</div>`;
      }
      html += '</div>';

      if (checklist.length) {
        html += '<div class="memo-checklist">';
        checklist.forEach((item) => {
          html += `<button class="memo-checklist-item ${item.done ? 'done' : ''}" data-action="toggle-check" data-index="${item.index}">`;
          html += `<span class="memo-checklist-box">${item.done ? '☑' : '☐'}</span>`;
          html += `<span class="memo-checklist-text">${LS.Helpers.escapeHtml(item.text)}</span>`;
          html += '</button>';
        });
        html += '</div>';
      }

      if (record.category || linkedLabels.length || tagLabels.length) {
        html += '<div class="record-badge-row">';
        if (record.category) {
          html += `<span class="record-category-badge">${LS.Helpers.escapeHtml(record.category)}</span>`;
        }
        linkedLabels.forEach((label) => {
          html += `<span class="record-facet-badge">${LS.Helpers.escapeHtml(label)}</span>`;
        });
        tagLabels.forEach((label) => {
          html += `<span class="record-tag-badge">${LS.Helpers.escapeHtml(label)}</span>`;
        });
        html += '</div>';
      }

      html += '<div class="memo-card-footer">';
      html += `<span class="memo-time">${formatUpdatedAt(record.updatedAt)}</span>`;
      html += '<div class="memo-colors">';
      colors.forEach((color) => {
        html += `<span class="memo-color-dot ${record.color === color.value ? 'is-active' : ''}" data-action="color" data-color="${color.value}" style="background:${color.bg}" title="${color.label}"></span>`;
      });
      html += '</div></div>';

      html += '<div class="record-quick-actions">';
      html += '<button class="record-quick-btn" data-action="convert-task">할 일</button>';
      html += '<button class="record-quick-btn" data-action="convert-schedule">일정</button>';
      html += '<button class="record-quick-btn" data-action="convert-countdown">D-Day</button>';
      html += `<button class="record-quick-btn" data-action="${record.bookmark?.enabled ? 'open-link' : 'convert-bookmark'}">${record.bookmark?.enabled ? '링크' : '북마크'}</button>`;
      html += `<button class="record-quick-btn" data-action="archive">${record.archivedAt ? '복원' : '보관'}</button>`;
      html += '</div>';
      html += '</div>';

      return html;
    },

    async addMemo() {
      await LS.Records.openRecordEditor({ mode: 'note' });
    },

    async _handleToolbarAction(action) {
      if (action === 'toggle-archive') {
        this._showArchived = !this._showArchived;
        this.render();
        return;
      }

      if (action !== 'search') return;

      const result = await LS.Helpers.promptModal('메모 검색', [
        {
          id: 'query',
          type: 'text',
          label: '검색어',
          value: this._query,
          placeholder: '제목, 내용, 체크리스트'
        }
      ], {
        confirmText: '적용',
        cancelText: '취소'
      });
      if (!result) return;

      this._query = String(result.query || '').trim();
      this.render();
    },

    async _handleCardClick(event, recordId) {
      const action = event.target.dataset.action || event.target.closest('[data-action]')?.dataset.action;
      if (!action) return;

      if (action === 'delete') {
        const confirmed = await LS.Helpers.confirmModal('메모 삭제', '이 메모를 목록에서 제거하시겠습니까?');
        if (!confirmed) return;
        await LS.Records.removeFacet(recordId, 'note');
        return;
      }

      if (action === 'pin') {
        await LS.Records.togglePinned(recordId);
        return;
      }

      if (action === 'color') {
        await LS.Records.setColor(recordId, event.target.dataset.color);
        return;
      }

      if (action === 'archive') {
        await LS.Records.toggleArchive(recordId);
        return;
      }

      if (action === 'toggle-check') {
        const itemIndex = parseInt(event.target.closest('[data-index]')?.dataset.index || '-1', 10);
        if (itemIndex >= 0) {
          await LS.Records.toggleChecklistItem(recordId, itemIndex);
        }
        return;
      }

      if (action === 'convert-task') {
        await LS.Records.convertRecord(recordId, 'task');
        return;
      }

      if (action === 'convert-schedule') {
        await LS.Records.convertRecord(recordId, 'schedule');
        return;
      }

      if (action === 'convert-countdown') {
        await LS.Records.convertRecord(recordId, 'countdown');
        return;
      }

      if (action === 'convert-bookmark') {
        await LS.Records.convertRecord(recordId, 'bookmark');
        return;
      }

      if (action === 'open-link') {
        LS.Records.openBookmark(recordId);
        return;
      }

      if (action === 'edit') {
        await LS.Records.openRecordEditor({ recordId, mode: 'note' });
      }
    }
  };
})();
