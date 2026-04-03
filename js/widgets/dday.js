(function () {
  'use strict';
  const LS = window.LivelySam = window.LivelySam || {};

  LS.DdayWidget = {
    _items: [],
    _interval: null,

    init() {
      this._items = LS.Storage.get('dday_items', []);
      this.render();
      this._bindEvents();
      // 매일 자정에 갱신
      this._interval = setInterval(() => this.render(), 60 * 1000);
    },

    _bindEvents() {
      document.getElementById('dday-add')?.addEventListener('click', () => this.addItem());
    },

    async addItem() {
      const result = await LS.Helpers.promptModal('D-Day 추가', [
        { id: 'name', type: 'text', label: 'D-Day 이름', placeholder: '예: 수능, 기말고사' },
        { id: 'date', type: 'date', label: '목표 날짜', value: LS.Helpers.formatDate(new Date(), 'YYYY-MM-DD') }
      ]);
      if (!result || !result.name.trim() || !result.date) return;

      this._items.push({
        id: LS.Helpers.generateId(),
        name: result.name.trim(),
        date: result.date,
        createdAt: new Date().toISOString()
      });

      this._save();
      this.render();
    },

    deleteItem(id) {
      this._items = this._items.filter(i => i.id !== id);
      this._save();
      this.render();
    },

    render() {
      const container = document.getElementById('dday-content');
      if (!container) return;

      if (this._items.length === 0) {
        container.innerHTML = '<div class="dday-empty">📅 D-Day를 추가해보세요</div>';
        return;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let html = '';
      // 날짜순 정렬 (가까운 날짜 먼저)
      const sorted = [...this._items].sort((a, b) => {
        const da = Math.abs(new Date(a.date) - today);
        const db = Math.abs(new Date(b.date) - today);
        return da - db;
      });

      sorted.forEach(item => {
        const target = new Date(item.date + 'T00:00:00');
        const diff = Math.ceil((target - today) / (1000 * 60 * 60 * 24));

        let ddayText, ddayClass;
        if (diff > 0) {
          ddayText = `D-${diff}`;
          ddayClass = 'dday-future';
        } else if (diff === 0) {
          ddayText = 'D-Day!';
          ddayClass = 'dday-today';
        } else {
          ddayText = `D+${Math.abs(diff)}`;
          ddayClass = 'dday-past';
        }

        html += `<div class="dday-item ${ddayClass}" data-id="${item.id}">`;
        html += `<div class="dday-info">`;
        html += `<span class="dday-name">${LS.Helpers.escapeHtml(item.name)}</span>`;
        html += `<span class="dday-date">${LS.Helpers.formatDate(target, 'M월 D일')}</span>`;
        html += `</div>`;
        html += `<div class="dday-count ${ddayClass}">${ddayText}</div>`;
        html += `<button class="dday-delete" title="삭제">×</button>`;
        html += `</div>`;
      });

      container.innerHTML = html;

      // 삭제 이벤트
      container.querySelectorAll('.dday-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const id = e.target.closest('.dday-item')?.dataset.id;
          if (id) this.deleteItem(id);
        });
      });
    },

    _save() {
      LS.Storage.set('dday_items', this._items);
    },

    destroy() {
      if (this._interval) clearInterval(this._interval);
    }
  };
})();
