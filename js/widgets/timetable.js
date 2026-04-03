(function () {
  'use strict';
  const LS = window.LivelySam = window.LivelySam || {};

  LS.TimetableWidget = {
    _weekData: {},
    _manualData: null,

    async init() {
      this._manualData = LS.Storage.get('manualTimetable', null);
      await this.loadWeekTimetable();
      this.render();
    },

    async loadWeekTimetable() {
      const config = LS.Config;
      const atpt = config.get('atptCode');
      const school = config.get('schoolCode');
      const grade = config.get('grade') + 1;
      const classNum = config.get('classNum');

      if (!atpt || !school) {
        this._weekData = {};
        return;
      }

      try {
        const monday = LS.NeisAPI.getMonday(new Date());
        this._weekData = await LS.NeisAPI.getWeekTimetable(atpt, school, grade, classNum, monday);
        LS.Storage.set('cachedTimetable', this._weekData);
        LS.Storage.set('cachedTimetableDate', LS.Helpers.formatDate(monday, 'YYYY-MM-DD'));
      } catch (e) {
        console.error('[Timetable] 시간표 로드 실패:', e);
        this._weekData = LS.Storage.get('cachedTimetable', {});
      }
    },

    render() {
      const container = document.getElementById('timetable-content');
      if (!container) return;

      const periods = LS.Config.getPeriods();
      const classPeriods = periods.filter(p => p.type === 'class' || p.type === 'afterSchool');
      const now = new Date();
      const today = LS.Helpers.formatDate(now, 'YYYYMMDD');
      const currentDay = now.getDay(); // 0=일, 1=월, ..., 6=토
      const monday = LS.NeisAPI.getMonday(now);

      // 학년/반 헤더
      const mode = LS.Config.get('timetableMode') || 0;
      const grade = LS.Config.get('grade') + 1;
      const classNum = LS.Config.get('classNum');
      const headerEl = document.getElementById('timetable-header-info');
      if (headerEl) {
        if (mode === 1) {
          headerEl.innerHTML = '<span style="color:var(--theme-accent); font-weight:700;">내 시간표 (교사용)</span>';
        } else {
          headerEl.textContent = `${grade}학년 ${classNum}반`;
        }
      }

      let html = '<table class="timetable-table"><thead><tr><th class="tt-period-col">교시</th>';
      const dayLabels = ['월', '화', '수', '목', '금'];

      // 요일 헤더
      for (let d = 0; d < 5; d++) {
        const dayDate = new Date(monday);
        dayDate.setDate(dayDate.getDate() + d);
        const isToday = d + 1 === currentDay;
        html += `<th class="${isToday ? 'tt-today-header' : ''}">${dayLabels[d]}</th>`;
      }
      html += '</tr></thead><tbody>';

      // 교시별 행
      const currentPeriodInfo = LS.Helpers.getCurrentPeriod(periods, now);

      classPeriods.forEach(p => {
        const periodNum = p.period;
        const isCurrentPeriod = currentPeriodInfo.current && currentPeriodInfo.current.period === periodNum;
        const isAfterSchool = p.type === 'afterSchool';

        html += `<tr class="${isCurrentPeriod ? 'tt-current-row' : ''} ${isAfterSchool ? 'tt-afterschool-row' : ''}">`;
        html += `<td class="tt-period-cell"><span class="tt-period-num">${periodNum}</span><span class="tt-period-time">${p.start}</span></td>`;

        for (let d = 0; d < 5; d++) {
          const dayDate = new Date(monday);
          dayDate.setDate(dayDate.getDate() + d);
          const dateStr = LS.Helpers.formatDate(dayDate, 'YYYYMMDD');
          const isToday = d + 1 === currentDay;
          const isCurrent = isToday && isCurrentPeriod;

          // 방과후 수업 요일 체크
          if (isAfterSchool && p.days && !p.days.includes(d + 1)) {
            html += `<td class="tt-cell tt-empty ${isToday ? 'tt-today' : ''}">—</td>`;
            continue;
          }

          // 수동 입력 우선, 없으면 NEIS 데이터
          const dayOfWeek = d + 1; // 1~5 (월~금)
          let subject = this._getSubject(dateStr, periodNum, dayOfWeek);

          html += `<td class="tt-cell ${isToday ? 'tt-today' : ''} ${isCurrent ? 'tt-current' : ''}" 
                       data-date="${dateStr}" data-period="${periodNum}" data-day="${dayOfWeek}"
                       title="클릭하여 수정">`;
          html += subject ? LS.Helpers.escapeHtml(subject) : '<span class="tt-empty-text">—</span>';
          html += '</td>';
        }
        html += '</tr>';
      });

      html += '</tbody></table>';
      container.innerHTML = html;

      // 셀 클릭 이벤트 (수동 수정)
      container.querySelectorAll('.tt-cell[data-date]').forEach(cell => {
        cell.addEventListener('click', (e) => this._editCell(e.currentTarget));
      });
    },

    _getSubject(dateStr, period, dayOfWeek) {
      if (LS.Config.get('timetableMode') === 1) {
        const teacherData = LS.Storage.get('teacherTimetable', {});
        if (teacherData[dayOfWeek] && teacherData[dayOfWeek][period]) {
          return teacherData[dayOfWeek][period];
        }
        return '';
      }

      // 수동 입력 데이터 우선
      if (this._manualData && this._manualData[dateStr] && this._manualData[dateStr][period]) {
        return this._manualData[dateStr][period];
      }
      // NEIS 데이터
      const dayData = this._weekData[dateStr];
      if (dayData) {
        const found = dayData.find(t => t.period === period);
        if (found) return found.subject;
      }
      return '';
    },

    _editCell(cell) {
      const date = cell.dataset.date;
      const period = parseInt(cell.dataset.period);
      const dayOfWeek = parseInt(cell.dataset.day);
      const current = this._getSubject(date, period, dayOfWeek);

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'tt-edit-input';
      input.value = current;
      input.placeholder = '과목명';

      cell.innerHTML = '';
      cell.appendChild(input);
      input.focus();
      input.select();

      const save = () => {
        const val = input.value.trim();
        
        if (LS.Config.get('timetableMode') === 1) {
          let tData = LS.Storage.get('teacherTimetable', {});
          if (!tData[dayOfWeek]) tData[dayOfWeek] = {};
          if (val) tData[dayOfWeek][period] = val;
          else delete tData[dayOfWeek][period];
          LS.Storage.set('teacherTimetable', tData);
        } else {
          if (!this._manualData) this._manualData = {};
          if (!this._manualData[date]) this._manualData[date] = {};
          if (val) {
            this._manualData[date][period] = val;
          } else {
            delete this._manualData[date][period];
          }
          LS.Storage.set('manualTimetable', this._manualData);
        }
        this.render();
      };

      input.addEventListener('blur', save);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') save();
        if (e.key === 'Escape') this.render();
      });
    },

    refresh() {
      this.loadWeekTimetable().then(() => this.render());
    }
  };
})();
