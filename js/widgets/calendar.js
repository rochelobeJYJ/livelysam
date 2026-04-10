(function () {
  'use strict';
  const LS = window.LivelySam = window.LivelySam || {};

  LS.CalendarWidget = {
    _currentYear: 0,
    _currentMonth: 0,
    _schoolSchedule: [],
    _customEvents: [],

    async init() {
      const now = new Date();
      this._currentYear = now.getFullYear();
      this._currentMonth = now.getMonth() + 1;
      this._customEvents = LS.Storage.get('customScheduleEvents', []);
      await this.loadSchedule();
      this.render();
      this._bindEvents();
    },

    async loadSchedule() {
      const atpt = LS.Config.get('atptCode');
      const school = LS.Config.get('schoolCode');
      if (!atpt || !school) return;

      try {
        this._schoolSchedule = await LS.NeisAPI.getSchedule(atpt, school, this._currentYear, this._currentMonth);
        LS.Storage.set('cachedSchedule', { data: this._schoolSchedule, year: this._currentYear, month: this._currentMonth });
      } catch (e) {
        const cached = LS.Storage.get('cachedSchedule', null);
        if (cached && cached.year === this._currentYear && cached.month === this._currentMonth) {
          this._schoolSchedule = cached.data;
        }
      }
    },

    _bindEvents() {
      document.getElementById('cal-prev')?.addEventListener('click', () => this._navigate(-1));
      document.getElementById('cal-next')?.addEventListener('click', () => this._navigate(1));
      document.getElementById('cal-today')?.addEventListener('click', () => {
        const now = new Date();
        this._currentYear = now.getFullYear();
        this._currentMonth = now.getMonth() + 1;
        this.loadSchedule().then(() => this.render());
      });
      document.getElementById('cal-add-event')?.addEventListener('click', () => this._openEventModal());
    },

    _navigate(dir) {
      this._currentMonth += dir;
      if (this._currentMonth > 12) { this._currentMonth = 1; this._currentYear++; }
      if (this._currentMonth < 1) { this._currentMonth = 12; this._currentYear--; }
      this.loadSchedule().then(() => this.render());
    },

    render() {
      // 월 표시
      const titleEl = document.getElementById('cal-title');
      if (titleEl) titleEl.textContent = `${this._currentYear}년 ${this._currentMonth}월`;

      this._renderGrid();
      this._renderEventList();
    },

    _renderGrid() {
      const grid = document.getElementById('cal-grid');
      if (!grid) return;

      const year = this._currentYear;
      const month = this._currentMonth;
      const firstDay = new Date(year, month - 1, 1).getDay();
      const lastDate = new Date(year, month, 0).getDate();
      const today = new Date();
      const todayStr = LS.Helpers.formatDate(today, 'YYYY-MM-DD');

      let html = '<div class="cal-day-headers">';
      ['일', '월', '화', '수', '목', '금', '토'].forEach((d, i) => {
        const cls = i === 0 ? 'cal-sun' : i === 6 ? 'cal-sat' : '';
        html += `<div class="cal-header-cell ${cls}">${d}</div>`;
      });
      html += '</div><div class="cal-cells">';

      // 이전 달 빈칸
      for (let i = 0; i < firstDay; i++) {
        html += '<div class="cal-cell cal-empty"></div>';
      }

      // 날짜
      for (let d = 1; d <= lastDate; d++) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const isToday = dateStr === todayStr;
        const dayOfWeek = new Date(year, month - 1, d).getDay();
        const isSun = dayOfWeek === 0;
        const isSat = dayOfWeek === 6;

        // 이벤트 확인
        const events = this._getEventsForDate(dateStr);
        const holiday = LS.Holidays.isHoliday(dateStr);
        const hasEvents = events.length > 0 || holiday;

        let cls = 'cal-cell';
        if (isToday) cls += ' cal-today';
        if (isSun || holiday) cls += ' cal-sun';
        else if (isSat) cls += ' cal-sat';
        if (hasEvents) cls += ' cal-has-event';

        html += `<div class="${cls}" data-date="${dateStr}" title="${this._getDateTooltip(dateStr, events, holiday)}">`;
        html += `<span class="cal-date-num">${d}</span>`;
        if (hasEvents) {
          html += '<div class="cal-event-dots">';
          if (holiday) html += '<span class="cal-dot cal-dot-holiday"></span>';
          events.forEach(e => {
            const dotCls = e.source === 'neis' ? 'cal-dot-school' : 'cal-dot-custom';
            html += `<span class="cal-dot ${dotCls}"></span>`;
          });
          html += '</div>';
        }
        html += '</div>';
      }

      html += '</div>';
      grid.innerHTML = html;

      // 날짜 클릭 이벤트
      grid.querySelectorAll('.cal-cell[data-date]').forEach(cell => {
        cell.addEventListener('click', () => this._onDateClick(cell.dataset.date));
      });
    },

    _renderEventList() {
      const list = document.getElementById('cal-events');
      if (!list) return;

      // 이번 달 모든 이벤트
      const allEvents = [];

      // 공휴일
      const holidays = LS.Holidays.getMonthHolidays(this._currentYear, this._currentMonth);
      holidays.forEach(h => {
        allEvents.push({ date: h.date, name: h.name, type: 'holiday' });
      });

      // NEIS 학사일정
      this._schoolSchedule.forEach(s => {
        const dateStr = `${s.date.slice(0, 4)}-${s.date.slice(4, 6)}-${s.date.slice(6, 8)}`;
        allEvents.push({ date: dateStr, name: s.eventName, type: 'school' });
      });

      // 커스텀 이벤트
      this._customEvents.forEach(e => {
        if (e.date.startsWith(`${this._currentYear}-${String(this._currentMonth).padStart(2, '0')}`)) {
          allEvents.push({ date: e.date, name: e.name, type: 'custom', id: e.id });
        }
      });

      allEvents.sort((a, b) => a.date.localeCompare(b.date));

      if (allEvents.length === 0) {
        list.innerHTML = '<div class="cal-no-events">이번 달 일정이 없습니다</div>';
        return;
      }

      let html = '';
      allEvents.forEach(e => {
        const day = parseInt(e.date.split('-')[2]);
        const typeEmoji = e.type === 'holiday' ? '🎉' : e.type === 'school' ? '🏫' : '📌';
        html += `<div class="cal-event-item cal-event-${e.type}">`;
        html += `<span class="cal-event-date">${day}일</span>`;
        html += `<span class="cal-event-emoji">${typeEmoji}</span>`;
        html += `<span class="cal-event-name">${LS.Helpers.escapeHtml(e.name)}</span>`;
        if (e.type === 'custom') {
          html += `<button class="cal-event-delete" data-id="${e.id}" title="삭제">×</button>`;
        }
        html += '</div>';
      });

      list.innerHTML = html;

      // 삭제 버튼
      list.querySelectorAll('.cal-event-delete').forEach(btn => {
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this._deleteCustomEvent(btn.dataset.id);
        });
      });
    },

    _getEventsForDate(dateStr) {
      const events = [];
      const neisDate = dateStr.replace(/-/g, '');
      this._schoolSchedule.forEach(s => {
        if (s.date === neisDate) events.push({ ...s, source: 'neis' });
      });
      this._customEvents.forEach(e => {
        if (e.date === dateStr) events.push({ ...e, source: 'custom' });
      });
      return events;
    },

    _getDateTooltip(dateStr, events, holiday) {
      const tips = [];
      if (holiday) tips.push(holiday.name);
      events.forEach(e => tips.push(e.eventName || e.name));
      return tips.join(', ') || '';
    },

    _onDateClick(dateStr) {
      this._openEventModal(dateStr);
    },

    async _openEventModal(prefillDate) {
      const date = prefillDate || LS.Helpers.formatDate(new Date(), 'YYYY-MM-DD');
      const result = await LS.Helpers.promptModal('일정 추가', [
        { id: 'name', type: 'text', label: `${date} 일정명`, placeholder: '예: 학년 회의' }
      ], {
        confirmText: '추가'
      });

      const name = result?.name?.trim();
      if (!name) return;

      const event = {
        id: LS.Helpers.generateId(),
        date,
        name,
        createdAt: new Date().toISOString()
      };

      this._customEvents.push(event);
      LS.Storage.set('customScheduleEvents', this._customEvents);
      this.render();
      LS.Helpers.showToast('일정을 추가했습니다.', 'success');
    },

    _showAddEventModal(prefillDate) {
      return this._openEventModal(prefillDate);
    },

    _deleteCustomEvent(id) {
      this._customEvents = this._customEvents.filter(e => e.id !== id);
      LS.Storage.set('customScheduleEvents', this._customEvents);
      this.render();
    },

    refresh() {
      this.loadSchedule().then(() => this.render());
    }
  };
})();
