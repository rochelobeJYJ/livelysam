(function () {
  'use strict';

  const LS = window.LivelySam = window.LivelySam || {};

  function getDdayInfo(targetDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const target = new Date(`${targetDate}T00:00:00`);
    const diff = Math.ceil((target - today) / (1000 * 60 * 60 * 24));

    if (diff > 0) return { text: `D-${diff}`, cls: 'dday-future' };
    if (diff === 0) return { text: 'D-Day', cls: 'dday-today' };
    return { text: `D+${Math.abs(diff)}`, cls: 'dday-past' };
  }

  function getCountdownRecords(query, archivedOnly) {
    if (query) {
      return LS.Records.search(query, {
        facets: ['countdown'],
        archived: archivedOnly ? true : false
      });
    }

    const items = LS.Records.listCountdowns({ includeArchived: archivedOnly });
    return archivedOnly
      ? items.filter((record) => record.archivedAt)
      : items.filter((record) => !record.archivedAt);
  }

  function groupByLabel(records) {
    return records.reduce((groups, record) => {
      const group = record.countdown.group || '기타';
      if (!groups[group]) groups[group] = [];
      groups[group].push(record);
      return groups;
    }, {});
  }

  LS.DdayWidget = {
    _bound: false,
    _interval: null,
    _layoutObserver: null,
    _layoutRefreshHandle: 0,
    _boundViewportLayoutHandler: null,
    _currentLayout: 'full',
    _query: '',
    _showArchived: false,

    async init() {
      await LS.Records.init();

      if (!this._bound) {
        this._bound = true;
        window.addEventListener('livelysam:recordsChanged', () => this.render());
      }

      this._bindResponsiveLayout();
      this.render();

      if (!this._interval) {
        this._interval = window.setInterval(() => this.render(), 60 * 1000);
      }

      document.getElementById('dday-add')?.addEventListener('click', () => this.addItem());
    },

    _getRootElement() {
      return document.getElementById('widget-dday');
    },

    _bindResponsiveLayout() {
      const root = this._getRootElement();
      if (!root) return;

      this._boundViewportLayoutHandler = this._boundViewportLayoutHandler || (() => {
        this._queueResponsiveLayoutRefresh();
      });

      if (typeof ResizeObserver !== 'undefined') {
        this._layoutObserver?.disconnect?.();
        this._layoutObserver = new ResizeObserver(() => {
          this._queueResponsiveLayoutRefresh();
        });
        this._layoutObserver.observe(root);
      } else {
        window.removeEventListener('resize', this._boundViewportLayoutHandler);
        window.addEventListener('resize', this._boundViewportLayoutHandler);
      }

      this._updateResponsiveLayout();
    },

    _queueResponsiveLayoutRefresh() {
      if (this._layoutRefreshHandle) {
        window.cancelAnimationFrame(this._layoutRefreshHandle);
      }

      this._layoutRefreshHandle = window.requestAnimationFrame(() => {
        this._layoutRefreshHandle = 0;
        this._updateResponsiveLayout();
      });
    },

    _updateResponsiveLayout() {
      const root = this._getRootElement();
      if (!root) return;

      const width = root.clientWidth || 0;
      const height = root.clientHeight || 0;
      let layout = 'full';

      if (width <= 212 || height <= 132) {
        layout = 'micro';
      } else if (width <= 308 || height <= 198) {
        layout = 'compact';
      }

      root.dataset.layout = layout;
      if (this._currentLayout === layout) return;

      this._currentLayout = layout;
      this.render();
    },

    _getVisibleRecords(records) {
      if (this._currentLayout !== 'micro') return records;
      return records.slice(0, 4);
    },

    async addItem() {
      await LS.Records.openRecordEditor({ mode: 'countdown' });
    },

    render() {
      const container = document.getElementById('dday-content');
      const root = this._getRootElement();
      if (!container || !root) return;

      const layout = this._currentLayout;
      const records = getCountdownRecords(this._query, this._showArchived);
      const visibleRecords = this._getVisibleRecords(records);
      const grouped = groupByLabel(visibleRecords);
      const groupNames = Object.keys(grouped).sort((a, b) => a.localeCompare(b, 'ko'));
      const hiddenCount = Math.max(0, records.length - visibleRecords.length);
      const showSearch = layout !== 'micro';
      const showArchiveButton = layout !== 'micro';
      const showGroupTitles = layout === 'full';

      let html = '<div class="widget-toolbar dday-toolbar">';
      if (showSearch) {
        html += `<input class="widget-search dday-search" id="dday-search" type="text" placeholder="검색" value="${LS.Helpers.escapeHtml(this._query)}">`;
      }
      html += '<div class="widget-filter-group dday-filter-group">';
      html += `<button class="widget-filter-btn ${this._showArchived ? '' : 'active'}" data-filter="active" title="진행 중 D-Day 보기">진행</button>`;
      html += `<button class="widget-filter-btn ${this._showArchived ? 'active' : ''}" data-filter="archived" title="보관함 보기">보관</button>`;
      html += '</div>';
      if (showArchiveButton) {
        html += `<button class="widget-secondary-btn dday-archive-btn" id="dday-archive-past" title="${this._showArchived ? '진행 중 D-Day 보기' : '지난 D-Day 한 번에 보관'}">${this._showArchived ? '진행 보기' : '지난 일정 정리'}</button>`;
      }
      html += '</div>';

      if (!records.length) {
        html += `<div class="dday-empty">${this._showArchived ? '보관된 D-Day가 없습니다.' : '헤더의 추가 버튼으로 D-Day를 만들어 주세요.'}</div>`;
        container.innerHTML = html;
      } else {
        html += '<div class="dday-list">';
        groupNames.forEach((groupName) => {
          if (showGroupTitles) {
            html += `<div class="record-section-title">${LS.Helpers.escapeHtml(groupName)}</div>`;
          }

          grouped[groupName].forEach((record) => {
            const info = getDdayInfo(record.countdown.targetDate);

            html += `<div class="dday-item ${info.cls}" data-id="${record.id}">`;
            html += '<div class="dday-info" data-action="edit">';
            html += '<div class="dday-main-row">';
            html += `<div class="dday-name">${LS.Helpers.escapeHtml(LS.Records.getDisplayTitle(record, 'D-Day'))}</div>`;
            html += `<div class="dday-count ${info.cls}">${info.text}</div>`;
            html += '</div>';
            html += `<div class="dday-date">${record.countdown.targetDate}</div>`;
            html += '</div>';
            html += '<div class="dday-actions">';
            html += '<button class="dday-edit" data-action="edit" title="편집">✎</button>';
            html += '<button class="dday-delete" data-action="delete" title="삭제">✕</button>';
            html += '</div>';
            html += '</div>';
          });
        });
        html += '</div>';

        if (hiddenCount > 0) {
          html += `<div class="dday-summary-more">+${hiddenCount}개 더</div>`;
        }

        container.innerHTML = html;
      }

      container.querySelector('#dday-search')?.addEventListener('input', (event) => {
        this._query = event.target.value || '';
        this.render();
      });

      container.querySelectorAll('[data-filter]').forEach((button) => {
        button.addEventListener('click', () => {
          this._showArchived = button.dataset.filter === 'archived';
          this.render();
        });
      });

      container.querySelector('#dday-archive-past')?.addEventListener('click', async () => {
        if (this._showArchived) {
          this._showArchived = false;
          this.render();
          return;
        }

        const count = await LS.Records.archivePastCountdowns();
        LS.Helpers.showToast(
          count ? `${count}개의 지난 D-Day를 보관했습니다.` : '보관할 지난 D-Day가 없습니다.',
          'success'
        );
      });

      container.querySelectorAll('.dday-item').forEach((item) => {
        item.addEventListener('click', (event) => this._handleClick(event, item.dataset.id));
      });
    },

    async _handleClick(event, recordId) {
      const action = event.target.dataset.action || event.target.closest('[data-action]')?.dataset.action;
      if (!action) return;

      if (action === 'delete') {
        const confirmed = await LS.Helpers.confirmModal('D-Day 삭제', '이 D-Day를 목록에서 삭제하시겠습니까?');
        if (!confirmed) return;
        await LS.Records.removeFacet(recordId, 'countdown');
        return;
      }

      if (action === 'archive') {
        await LS.Records.toggleArchive(recordId);
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

      if (action === 'convert-bookmark') {
        await LS.Records.convertRecord(recordId, 'bookmark');
        return;
      }

      if (action === 'open-link') {
        LS.Records.openBookmark(recordId);
        return;
      }

      if (action === 'edit') {
        await LS.Records.openRecordEditor({ recordId, mode: 'countdown' });
      }
    },

    destroy() {
      if (this._interval) {
        window.clearInterval(this._interval);
        this._interval = null;
      }

      if (this._layoutRefreshHandle) {
        window.cancelAnimationFrame(this._layoutRefreshHandle);
        this._layoutRefreshHandle = 0;
      }

      this._layoutObserver?.disconnect?.();
      this._layoutObserver = null;

      if (this._boundViewportLayoutHandler) {
        window.removeEventListener('resize', this._boundViewportLayoutHandler);
      }
    }
  };
})();
