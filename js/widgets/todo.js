(function () {
  'use strict';
  const LS = window.LivelySam = window.LivelySam || {};

  LS.TodoWidget = {
    _todos: [],

    async init() {
      try {
        this._todos = await LS.Storage.dbGetAll('todos');
      } catch {
        this._todos = LS.Storage.get('todos_fallback', []);
      }
      this.render();
    },

    render() {
      const container = document.getElementById('todo-content');
      if (!container) return;

      const pending = this._todos.filter(t => !t.done).sort((a, b) => {
        const prio = { high: 0, medium: 1, low: 2 };
        if (prio[a.priority] !== prio[b.priority]) return prio[a.priority] - prio[b.priority];
        if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return new Date(b.createdAt) - new Date(a.createdAt);
      });

      const done = this._todos.filter(t => t.done).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

      let html = '<div class="todo-list">';

      if (pending.length === 0 && done.length === 0) {
        html += '<div class="todo-empty">✅ 할 일을 추가해보세요</div>';
      }

      // 미완료
      pending.forEach(t => {
        html += this._renderItem(t);
      });

      // 완료 (최근 5개만)
      if (done.length > 0) {
        html += `<div class="todo-done-header">완료됨 (${done.length}개)</div>`;
        done.slice(0, 5).forEach(t => {
          html += this._renderItem(t);
        });
        if (done.length > 5) {
          html += `<div class="todo-more">+${done.length - 5}개 더</div>`;
        }
      }

      html += '</div>';
      container.innerHTML = html;

      // 이벤트 바인딩
      container.querySelectorAll('.todo-item').forEach(item => {
        item.querySelector('.todo-check')?.addEventListener('click', () => this._toggle(item.dataset.id));
        item.querySelector('.todo-delete')?.addEventListener('click', () => this._delete(item.dataset.id));
        item.querySelector('.todo-text')?.addEventListener('click', () => this._edit(item.dataset.id));
      });
    },

    _renderItem(t) {
      const prioColors = { high: '#FF6B6B', medium: '#FFD43B', low: '#69DB7C' };
      const prioLabels = { high: '높음', medium: '보통', low: '낮음' };
      const isOverdue = t.dueDate && !t.done && t.dueDate < LS.Helpers.formatDate(new Date(), 'YYYY-MM-DD');

      let html = `<div class="todo-item ${t.done ? 'todo-done' : ''} ${isOverdue ? 'todo-overdue' : ''}" data-id="${t.id}">`;
      html += `<button class="todo-check">${t.done ? '☑️' : '⬜'}</button>`;
      html += `<div class="todo-body">`;
      html += `<span class="todo-text ${t.done ? 'todo-text-done' : ''}">${LS.Helpers.escapeHtml(t.text)}</span>`;
      html += `<div class="todo-meta">`;
      html += `<span class="todo-priority" style="color:${prioColors[t.priority]}">${prioLabels[t.priority]}</span>`;
      if (t.dueDate) {
        const d = new Date(t.dueDate + 'T00:00:00');
        html += `<span class="todo-due ${isOverdue ? 'todo-overdue-text' : ''}">${LS.Helpers.formatDate(d, 'M월 D일')}</span>`;
      }
      html += `</div></div>`;
      html += `<button class="todo-delete" title="삭제">×</button>`;
      html += `</div>`;
      return html;
    },

    async addTodo() {
      const result = await LS.Helpers.promptModal('할 일 추가', [
        { id: 'text', type: 'text', label: '할 일 내용', placeholder: '내용 입력' },
        { id: 'priority', type: 'select', label: '우선순위', options: [{value:'low',text:'낮음'}, {value:'medium',text:'보통'}, {value:'high',text:'높음'}], value: 'medium' },
        { id: 'dueDate', type: 'date', label: '마감일 (선택)' }
      ]);
      if (!result || !result.text.trim()) return;

      const todo = {
        id: LS.Helpers.generateId(),
        text: result.text.trim(),
        priority: result.priority,
        dueDate: result.dueDate || null,
        done: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      this._todos.push(todo);
      this._save(todo);
      this.render();
    },

    async _toggle(id) {
      const todo = this._todos.find(t => t.id === id);
      if (!todo) return;
      todo.done = !todo.done;
      todo.updatedAt = new Date().toISOString();
      await this._save(todo);
      this.render();
    },

    async _edit(id) {
      const todo = this._todos.find(t => t.id === id);
      if (!todo) return;
      
      const result = await LS.Helpers.promptModal('할 일 수정', [
        { id: 'text', type: 'text', label: '할 일 내용', value: todo.text },
        { id: 'priority', type: 'select', label: '우선순위', options: [{value:'low',text:'낮음'}, {value:'medium',text:'보통'}, {value:'high',text:'높음'}], value: todo.priority },
        { id: 'dueDate', type: 'date', label: '마감일 (선택)', value: todo.dueDate || '' }
      ]);
      if (!result || !result.text.trim()) return;
      
      todo.text = result.text.trim();
      todo.priority = result.priority;
      todo.dueDate = result.dueDate || null;
      todo.updatedAt = new Date().toISOString();
      await this._save(todo);
      this.render();
    },

    async _delete(id) {
      this._todos = this._todos.filter(t => t.id !== id);
      try { await LS.Storage.dbDelete('todos', id); }
      catch { LS.Storage.set('todos_fallback', this._todos); }
      this.render();
    },

    async _save(todo) {
      try { await LS.Storage.dbPut('todos', todo); }
      catch { LS.Storage.set('todos_fallback', this._todos); }
    }
  };
})();
