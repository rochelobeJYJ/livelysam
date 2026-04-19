(function () {
  'use strict';

  const LS = window.LivelySam = window.LivelySam || {};

  const PRIORITY_LABELS = { high: '높음', medium: '보통', low: '낮음' };
  const PRIORITY_COLORS = { high: '#E03131', medium: '#F08C00', low: '#2B8A3E' };

  function isOverdue(record) {
    const dueDate = record?.task?.dueDate;
    if (!dueDate || record?.task?.status === 'done') return false;
    return dueDate < LS.Helpers.formatDate(new Date(), 'YYYY-MM-DD');
  }

  function renderDueDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(`${dateStr}T00:00:00`);
    return LS.Helpers.formatDate(date, 'M월 D일');
  }

  function includesQuery(textValue, query) {
    const source = String(textValue || '').toLowerCase();
    return source.includes(String(query || '').trim().toLowerCase());
  }

  function getTodoRecords(query, archivedOnly) {
    if (query) {
      return LS.Records.search(query, { facets: ['task'], archived: archivedOnly ? true : false });
    }

    const tasks = LS.Records.listTasks({ includeArchived: archivedOnly });
    return archivedOnly ? tasks.filter((record) => record.archivedAt) : tasks.filter((record) => !record.archivedAt);
  }

  function sortTodoRecords(records, sortBy) {
    return [...records].sort((a, b) => {
      if (sortBy === 'title') {
        return LS.Records.getDisplayTitle(a).localeCompare(LS.Records.getDisplayTitle(b), 'ko');
      }

      if (sortBy === 'updatedAt') {
        return new Date(b.updatedAt) - new Date(a.updatedAt);
      }

      if (sortBy === 'dueDate') {
        if (a.task.dueDate && b.task.dueDate) return a.task.dueDate.localeCompare(b.task.dueDate);
        if (a.task.dueDate) return -1;
        if (b.task.dueDate) return 1;
        return new Date(b.updatedAt) - new Date(a.updatedAt);
      }

      const order = { high: 0, medium: 1, low: 2 };
      const priorityDiff = (order[a.task.priority] ?? 1) - (order[b.task.priority] ?? 1);
      if (priorityDiff !== 0) return priorityDiff;
      if ((a.task.status === 'done') !== (b.task.status === 'done')) return a.task.status === 'done' ? 1 : -1;
      if (a.task.dueDate && b.task.dueDate) return a.task.dueDate.localeCompare(b.task.dueDate);
      if (a.task.dueDate) return -1;
      if (b.task.dueDate) return 1;
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });
  }

  function sortGoogleTasks(tasks) {
    return [...tasks].sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === 'done' ? 1 : -1;
      }
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return a.title.localeCompare(b.title, 'ko');
    });
  }

  function getGoogleTasks(query) {
    const tasks = LS.GoogleWorkspace?.getTasks?.() || [];
    if (!query) return sortGoogleTasks(tasks);

    return sortGoogleTasks(tasks.filter((task) => (
      includesQuery(task.title, query)
      || includesQuery(task.description, query)
      || includesQuery(task.tasklistName, query)
    )));
  }

  LS.TodoWidget = {
    _bound: false,
    _query: '',
    _showArchived: false,
    _sortBy: 'priority',

    async init() {
      await LS.Records.init();

      if (!this._bound) {
        this._bound = true;
        window.addEventListener('livelysam:recordsChanged', () => this.render());
        window.addEventListener('livelysam:googleSyncChanged', () => this.render());
      }

      this.render();
    },

    render() {
      const container = document.getElementById('todo-content');
      if (!container) return;

      const records = sortTodoRecords(getTodoRecords(this._query, this._showArchived), this._sortBy);
      const googleTasks = this._showArchived ? [] : getGoogleTasks(this._query);
      const pending = records.filter((record) => record.task.status !== 'done');
      const done = records.filter((record) => record.task.status === 'done');

      let html = '<div class="widget-toolbar">';
      html += `<input class="widget-search" id="todo-search" type="text" placeholder="할 일 검색" value="${LS.Helpers.escapeHtml(this._query)}">`;
      html += '<select class="widget-select" id="todo-sort">';
      html += `<option value="priority" ${this._sortBy === 'priority' ? 'selected' : ''}>우선순위</option>`;
      html += `<option value="dueDate" ${this._sortBy === 'dueDate' ? 'selected' : ''}>마감일</option>`;
      html += `<option value="updatedAt" ${this._sortBy === 'updatedAt' ? 'selected' : ''}>최근 수정</option>`;
      html += `<option value="title" ${this._sortBy === 'title' ? 'selected' : ''}>제목순</option>`;
      html += '</select>';
      html += '<div class="widget-filter-group">';
      html += `<button class="widget-filter-btn ${this._showArchived ? '' : 'active'}" data-filter="active">사용 중</button>`;
      html += `<button class="widget-filter-btn ${this._showArchived ? 'active' : ''}" data-filter="archived">보관함</button>`;
      html += '</div></div>';

      html += '<div class="todo-list">';

      if (!records.length && !googleTasks.length) {
        html += `<div class="todo-empty">${this._showArchived ? '보관한 항목이 없습니다.' : '할 일을 추가해 보세요.'}</div>`;
      } else if (this._showArchived) {
        html += '<div class="record-section-title">보관된 항목</div>';
        records.forEach((record) => {
          html += this._renderLocalItem(record);
        });
      } else {
        if (pending.length) {
          html += '<div class="record-section-title">진행 중</div>';
          pending.forEach((record) => {
            html += this._renderLocalItem(record);
          });
        }

        if (done.length) {
          html += `<div class="record-section-title">완료됨 (${done.length})</div>`;
          done.forEach((record) => {
            html += this._renderLocalItem(record);
          });
        }

        if (googleTasks.length) {
          html += '<div class="record-section-title todo-google-section-title">Google Tasks</div>';
          html += '<div class="todo-google-section">';
          googleTasks.forEach((task) => {
            html += this._renderGoogleItem(task);
          });
          html += '</div>';
        }
      }

      html += '</div>';
      container.innerHTML = html;

      container.querySelector('#todo-search')?.addEventListener('input', (event) => {
        this._query = event.target.value || '';
        this.render();
      });

      container.querySelector('#todo-sort')?.addEventListener('change', (event) => {
        this._sortBy = event.target.value || 'priority';
        this.render();
      });

      container.querySelectorAll('[data-filter]').forEach((button) => {
        button.addEventListener('click', () => {
          this._showArchived = button.dataset.filter === 'archived';
          this.render();
        });
      });

      container.querySelectorAll('.todo-item').forEach((item) => {
        item.addEventListener('click', (event) => this._handleItemClick(event, item.dataset.id));
      });

      container.querySelectorAll('[data-google-link]').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          const url = button.dataset.googleLink;
          if (url) {
            window.open(url, '_blank', 'noopener,noreferrer');
          }
        });
      });
    },

    _renderLocalItem(record) {
      const overdue = isOverdue(record);
      const dueDate = renderDueDate(record.task.dueDate);
      const linkedLabels = LS.Records.getFacetLabels(record, ['task']);
      const tagLabels = LS.Records.getTagLabels(record);
      const googleTaskMeta = record.sync?.google?.task || {};
      const googleTaskLinked = Boolean(record.task?.enabled && googleTaskMeta.remoteId);

      let html = `<div class="todo-item ${record.task.status === 'done' ? 'todo-done' : ''} ${overdue ? 'todo-overdue' : ''}" data-id="${record.id}">`;
      html += `<button class="todo-check" data-action="toggle">${record.task.status === 'done' ? '✓' : '○'}</button>`;
      html += '<div class="todo-body" data-action="edit">';
      html += `<div class="todo-title ${record.task.status === 'done' ? 'todo-text-done' : ''}" data-action="edit">${LS.Helpers.escapeHtml(LS.Records.getDisplayTitle(record, '할 일'))}</div>`;

      if (LS.Records.getDisplayBody(record)) {
        html += `<div class="todo-desc">${LS.Helpers.escapeHtml(LS.Records.getDisplayBody(record)).replace(/\n/g, '<br>')}</div>`;
      }

      html += '<div class="todo-meta">';
      if (dueDate) {
        html += `<span class="todo-due ${overdue ? 'todo-overdue-text' : ''}">${dueDate}</span>`;
      }
      html += `<span class="todo-priority" style="color:${PRIORITY_COLORS[record.task.priority]}">${PRIORITY_LABELS[record.task.priority]}</span>`;
      if (record.task.repeat?.enabled) {
        html += '<span class="todo-repeat">반복</span>';
      }
      if (record.task.syncSchedule && record.schedule?.enabled) {
        html += '<span class="todo-repeat">일정동기화</span>';
      }
      if (googleTaskLinked) {
        html += '<span class="todo-google-chip is-icon" title="Google 동기화" aria-label="Google 동기화">↻</span>';
      }
      html += '</div>';

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

      html += '<div class="record-quick-actions">';
      html += '<button class="record-quick-btn" data-action="convert-schedule">일정</button>';
      html += '<button class="record-quick-btn" data-action="convert-countdown">D-Day</button>';
      html += `<button class="record-quick-btn" data-action="${record.bookmark?.enabled ? 'open-link' : 'convert-bookmark'}">${record.bookmark?.enabled ? '링크' : '북마크'}</button>`;
      html += `<button class="record-quick-btn" data-action="archive">${record.archivedAt ? '복원' : '보관'}</button>`;
      html += '</div>';
      html += '</div>';

      html += '<div class="todo-actions">';
      if (googleTaskMeta.link) {
        html += `<button class="todo-edit" type="button" data-google-link="${LS.Helpers.escapeHtml(googleTaskMeta.link)}" title="Google Tasks에서 열기">↗</button>`;
      }
      html += '<button class="todo-edit" data-action="edit" title="편집">✎</button>';
      html += '<button class="todo-delete" data-action="delete" title="삭제">×</button>';
      html += '</div>';
      html += '</div>';
      return html;
    },

    _renderGoogleItem(task) {
      const dueDate = renderDueDate(task.dueDate);
      const done = task.status === 'done';

      let html = `<div class="todo-item todo-google-item ${done ? 'todo-done' : ''}">`;
      html += `<div class="todo-google-check">${done ? '✓' : 'G'}</div>`;
      html += '<div class="todo-body">';
      html += `<div class="todo-title ${done ? 'todo-text-done' : ''}">${LS.Helpers.escapeHtml(task.title)}</div>`;

      if (task.description) {
        html += `<div class="todo-desc">${LS.Helpers.escapeHtml(task.description).replace(/\n/g, '<br>')}</div>`;
      }

      html += '<div class="todo-meta">';
      if (dueDate) {
        html += `<span class="todo-due">${dueDate}</span>`;
      }
      html += '<span class="todo-google-chip is-icon" title="Google Tasks" aria-label="Google Tasks">↻</span>';
      if (task.tasklistName) {
        html += `<span class="todo-due">${LS.Helpers.escapeHtml(task.tasklistName)}</span>`;
      }
      if (done) {
        html += '<span class="todo-repeat">완료됨</span>';
      }
      html += '</div>';
      html += '</div>';

      html += '<div class="todo-actions">';
      if (task.link) {
        html += `<button class="todo-edit" type="button" data-google-link="${LS.Helpers.escapeHtml(task.link)}" title="Google에서 열기">↗</button>`;
      }
      html += '</div>';
      html += '</div>';
      return html;
    },

    async addTodo() {
      await LS.Records.openRecordEditor({ mode: 'task' });
    },

    async _handleItemClick(event, recordId) {
      const action = event.target.dataset.action || event.target.closest('[data-action]')?.dataset.action;
      if (!action) return;

      if (action === 'toggle') {
        await LS.Records.toggleTaskComplete(recordId);
        return;
      }

      if (action === 'delete') {
        const confirmed = await LS.Helpers.confirmModal('할 일 삭제', '이 항목을 목록에서 삭제하시겠습니까?');
        if (!confirmed) return;
        await LS.Records.removeFacet(recordId, 'task');
        return;
      }

      if (action === 'archive') {
        await LS.Records.toggleArchive(recordId);
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
        await LS.Records.openRecordEditor({ recordId, mode: 'task' });
      }
    }
  };
})();
