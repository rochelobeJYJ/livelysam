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

  function renderSectionAction(action, icon, title, active = false) {
    return `<button class="record-section-icon-btn ${active ? 'is-active' : ''}" type="button" data-toolbar-action="${action}" title="${LS.Helpers.escapeHtml(title)}" aria-label="${LS.Helpers.escapeHtml(title)}">${icon}</button>`;
  }

  function renderSectionHeader(title, actions = '') {
    return `<div class="record-section-row"><div class="record-section-title">${LS.Helpers.escapeHtml(title)}</div>${actions ? `<div class="record-section-actions">${actions}</div>` : ''}</div>`;
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

      let html = '';
      html += '<div class="todo-list">';
      const toolbarActions = [
        renderSectionAction('search', '⌕', this._query ? `검색어 변경 (${this._query})` : '검색', Boolean(this._query)),
        renderSectionAction('sort', '⇅', `정렬 변경 (${this._getSortLabel(this._sortBy)})`, this._sortBy !== 'priority'),
        renderSectionAction('toggle-archive', '🗃', this._showArchived ? '진행 중 항목 보기' : '보관함 보기', this._showArchived)
      ].join('');

      if (!records.length && !googleTasks.length) {
        html += renderSectionHeader(this._showArchived ? '보관된 항목' : '진행 중', toolbarActions);
        html += `<div class="todo-empty">${this._showArchived ? '보관한 항목이 없습니다.' : '할 일을 추가해 보세요.'}</div>`;
      } else if (this._showArchived) {
        html += renderSectionHeader('보관된 항목', toolbarActions);
        records.forEach((record) => {
          html += this._renderLocalItem(record);
        });
      } else {
        if (pending.length) {
          html += renderSectionHeader('진행 중', toolbarActions);
          pending.forEach((record) => {
            html += this._renderLocalItem(record);
          });
        }

        if (done.length) {
          html += renderSectionHeader(`완료됨 (${done.length})`, pending.length ? '' : toolbarActions);
          done.forEach((record) => {
            html += this._renderLocalItem(record);
          });
        }

        if (googleTasks.length) {
          html += renderSectionHeader('Google Tasks', pending.length || done.length ? '' : toolbarActions);
          html += '<div class="todo-google-section">';
          googleTasks.forEach((task) => {
            html += this._renderGoogleItem(task);
          });
          html += '</div>';
        }
      }

      html += '</div>';
      container.innerHTML = html;

      container.querySelectorAll('[data-toolbar-action]').forEach((button) => {
        button.addEventListener('click', () => {
          void this._handleToolbarAction(button.dataset.toolbarAction || '');
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

    _getSortLabel(sortBy = this._sortBy) {
      return {
        priority: '우선순위',
        dueDate: '마감일',
        updatedAt: '최근 수정',
        title: '제목순'
      }[sortBy] || '우선순위';
    },

    async _handleToolbarAction(action) {
      if (action === 'toggle-archive') {
        this._showArchived = !this._showArchived;
        this.render();
        return;
      }

      if (action === 'search') {
        const result = await LS.Helpers.promptModal('할 일 검색', [
          {
            id: 'query',
            type: 'text',
            label: '검색어',
            value: this._query,
            placeholder: '제목, 설명, 태그'
          }
        ], {
          confirmText: '적용',
          cancelText: '취소'
        });
        if (!result) return;

        this._query = String(result.query || '').trim();
        this.render();
        return;
      }

      if (action !== 'sort') return;

      const result = await LS.Helpers.promptModal('할 일 정렬', [
        {
          id: 'sortBy',
          type: 'select',
          label: '정렬 기준',
          value: this._sortBy,
          options: [
            { value: 'priority', text: '우선순위' },
            { value: 'dueDate', text: '마감일' },
            { value: 'updatedAt', text: '최근 수정' },
            { value: 'title', text: '제목순' }
          ]
        }
      ], {
        confirmText: '적용',
        cancelText: '취소'
      });
      if (!result) return;

      this._sortBy = result.sortBy || 'priority';
      this.render();
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
