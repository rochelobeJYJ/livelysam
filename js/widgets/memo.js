(function () {
  'use strict';
  const LS = window.LivelySam = window.LivelySam || {};

  LS.MemoWidget = {
    _memos: [],

    async init() {
      try {
        this._memos = await LS.Storage.dbGetAll('memos');
      } catch {
        this._memos = LS.Storage.get('memos_fallback', []);
      }
      this.render();
    },

    render() {
      const container = document.getElementById('memo-content');
      if (!container) return;

      let html = '<div class="memo-list">';

      if (this._memos.length === 0) {
        html += '<div class="memo-empty">📝 + 버튼을 눌러 메모를 추가하세요</div>';
      }

      // 고정 메모 먼저, 그 다음 최신순
      const sorted = [...this._memos].sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.updatedAt) - new Date(a.updatedAt);
      });

      sorted.forEach(memo => {
        const colors = {
          yellow: '#FFF9C4',
          pink: '#F8BBD0',
          blue: '#BBDEFB',
          green: '#C8E6C9',
          purple: '#E1BEE7',
          orange: '#FFE0B2'
        };
        const bgColor = colors[memo.color] || colors.yellow;

        html += `<div class="memo-card" style="background:${bgColor}" data-id="${memo.id}">`;
        html += `<div class="memo-card-header">`;
        html += `<button class="memo-pin ${memo.pinned ? 'pinned' : ''}" data-action="pin" title="${memo.pinned ? '고정 해제' : '고정'}">📌</button>`;
        html += `<button class="memo-delete" data-action="delete" title="삭제">×</button>`;
        html += `</div>`;
        html += `<div class="memo-card-body" data-action="edit" contenteditable="false">${this._renderContent(memo.content)}</div>`;
        html += `<div class="memo-card-footer">`;
        html += `<span class="memo-time">${this._formatTime(memo.updatedAt)}</span>`;
        html += `<div class="memo-colors">`;
        Object.keys(colors).forEach(c => {
          html += `<span class="memo-color-dot" data-action="color" data-color="${c}" style="background:${colors[c]}" title="${c}"></span>`;
        });
        html += `</div></div></div>`;
      });

      html += '</div>';
      container.innerHTML = html;

      // 이벤트 바인딩
      container.querySelectorAll('.memo-card').forEach(card => {
        card.addEventListener('click', (e) => this._handleCardClick(e, card.dataset.id));
      });
    },

    _renderContent(content) {
      return LS.Helpers.escapeHtml(content || '').replace(/\n/g, '<br>');
    },

    _formatTime(dateStr) {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      const now = new Date();
      if (d.toDateString() === now.toDateString()) {
        return LS.Helpers.formatTime(d, true, false);
      }
      return LS.Helpers.formatDate(d, 'M월 D일');
    },

    _handleCardClick(e, id) {
      const action = e.target.dataset.action || e.target.closest('[data-action]')?.dataset.action;
      if (!action) return;

      switch (action) {
        case 'delete':
          this._deleteMemo(id);
          break;
        case 'pin':
          this._togglePin(id);
          break;
        case 'color':
          this._changeColor(id, e.target.dataset.color);
          break;
        case 'edit':
          this._editMemo(id);
          break;
      }
    },

    async addMemo() {
      const result = await LS.Helpers.promptModal('메모 추가', [
        { id: 'content', type: 'textarea', label: '메모 내용', placeholder: '내용을 입력하세요' }
      ]);
      if (!result || !result.content.trim()) return;

      const memo = {
        id: LS.Helpers.generateId(),
        content: result.content.trim(),
        color: 'yellow',
        pinned: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      this._memos.push(memo);
      await this._save(memo);
      this.render();
    },

    async _editMemo(id) {
      const memo = this._memos.find(m => m.id === id);
      if (!memo) return;

      const result = await LS.Helpers.promptModal('메모 수정', [
        { id: 'content', type: 'textarea', label: '메모 내용', value: memo.content }
      ]);
      if (!result) return;

      memo.content = result.content.trim();
      if (!memo.content) {
          this._deleteMemo(id);
          return;
      }
      
      memo.updatedAt = new Date().toISOString();
      await this._save(memo);
      this.render();
    },

    async _deleteMemo(id) {
      const confirmed = await LS.Helpers.confirmModal('메모 삭제', '이 메모를 삭제할까요?');
      if (!confirmed) return;
      const confirm = () => true;
      if (!confirm('이 메모를 삭제하시겠습니까?')) return;
      this._memos = this._memos.filter(m => m.id !== id);
      try {
        await LS.Storage.dbDelete('memos', id);
      } catch {
        LS.Storage.set('memos_fallback', this._memos);
      }
      this.render();
    },

    async _togglePin(id) {
      const memo = this._memos.find(m => m.id === id);
      if (!memo) return;
      memo.pinned = !memo.pinned;
      await this._save(memo);
      this.render();
    },

    async _changeColor(id, color) {
      const memo = this._memos.find(m => m.id === id);
      if (!memo) return;
      memo.color = color;
      await this._save(memo);
      this.render();
    },

    async _save(memo) {
      try {
        await LS.Storage.dbPut('memos', memo);
      } catch {
        LS.Storage.set('memos_fallback', this._memos);
      }
    }
  };
})();
