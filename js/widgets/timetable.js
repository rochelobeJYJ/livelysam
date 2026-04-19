(function () {
  'use strict';

  const LS = window.LivelySam = window.LivelySam || {};

  const STORAGE_KEYS = {
    single: 'manualTimetable',
    teacher: 'teacherTimetable',
    weekly: 'weeklyTimetableOverrides',
    exam: 'examTimetableProfile',
    colors: 'subjectColors'
  };

  const DAY_LABELS = ['월', '화', '수', '목', '금'];
  const OVERLAY_LABELS = {
    base: '기본',
    teacher: '내 시간표',
    single: '일회 보강',
    weekly: '1주 보강',
    exam: '시험'
  };

  function clone(value, fallback) {
    if (value === undefined || value === null) return fallback;
    return JSON.parse(JSON.stringify(value));
  }

  function compactDate(value) {
    return String(value || '').replace(/-/g, '').trim();
  }

  function hyphenDate(value) {
    const text = compactDate(value);
    if (!/^\d{8}$/.test(text)) return '';
    return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  }

  function formatMonthDay(date) {
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }

  function normalizeSubject(value) {
    return String(value || '').trim();
  }

  function normalizeSubjectKey(value) {
    return normalizeSubject(value).replace(/\s+/g, '');
  }

  function isHexColor(value) {
    return /^#([0-9a-f]{6})$/i.test(String(value || '').trim());
  }

  function hexToRgba(hex, alpha) {
    const value = String(hex || '').replace('#', '');
    if (value.length !== 6) return 'rgba(0, 0, 0, 0.04)';
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function isDateInRange(dateStr, startDate, endDate) {
    if (!dateStr || !startDate || !endDate) return false;
    return dateStr >= startDate && dateStr <= endDate;
  }

  function cleanupNestedMap(target, parentKey) {
    if (!target[parentKey] || Object.keys(target[parentKey]).length === 0) {
      delete target[parentKey];
    }
  }

  function setPeriodValue(target, primaryKey, period, value) {
    if (!target[primaryKey]) target[primaryKey] = {};
    if (value) target[primaryKey][period] = value;
    else delete target[primaryKey][period];
    cleanupNestedMap(target, primaryKey);
  }

  function cloneStoredValue(value, fallback) {
    if (value === undefined || value === null) return clone(fallback, fallback);
    return clone(value, fallback);
  }

  LS.TimetableWidget = {
    _weekData: {},
    _singleOverrides: {},
    _teacherData: {},
    _weeklyOverrides: {},
    _examProfile: { enabled: false, name: '', startDate: '', endDate: '', entries: {} },
    _subjectColors: {},
    _currentMonday: null,
    _editLayer: 'single',
    _bound: false,

    async init() {
      this._reloadLocalData();
      this._currentMonday = LS.NeisAPI.getMonday(new Date());
      this._ensureEditLayer();
      await this.loadWeekTimetable();
      this.render();
    },

    _getScopedStorageKey(baseKey) {
      return `${baseKey}:${LS.Config.getClassroomContextKey()}`;
    },

    _readScopedStorage(baseKey, fallback) {
      const scopedValue = LS.Storage.get(this._getScopedStorageKey(baseKey), null);
      if (scopedValue !== null && scopedValue !== undefined) {
        return cloneStoredValue(scopedValue, fallback);
      }

      const legacyValue = LS.Storage.get(baseKey, null);
      if (legacyValue !== null && legacyValue !== undefined) {
        const migrated = cloneStoredValue(legacyValue, fallback);
        LS.Storage.set(this._getScopedStorageKey(baseKey), migrated);
        return migrated;
      }

      return cloneStoredValue(fallback, fallback);
    },

    _writeScopedStorage(baseKey, value) {
      LS.Storage.set(this._getScopedStorageKey(baseKey), value);
    },

    _reloadLocalData() {
      this._singleOverrides = this._readScopedStorage(STORAGE_KEYS.single, {});
      this._teacherData = this._readScopedStorage(STORAGE_KEYS.teacher, {});
      this._weeklyOverrides = this._readScopedStorage(STORAGE_KEYS.weekly, {});
      this._examProfile = this._readScopedStorage(STORAGE_KEYS.exam, {
        enabled: false,
        name: '',
        startDate: '',
        endDate: '',
        entries: {}
      });
      this._subjectColors = this._readScopedStorage(STORAGE_KEYS.colors, {});
    },

    _isTeacherMode() {
      return Number(LS.Config.get('timetableMode') || 0) === 1;
    },

    _getWeekKey(date = this._currentMonday) {
      return LS.Helpers.formatDate(new Date(date), 'YYYYMMDD');
    },

    _getCurrentWeekDates() {
      const dates = [];
      const monday = new Date(this._currentMonday);
      for (let index = 0; index < 5; index += 1) {
        const date = new Date(monday);
        date.setDate(date.getDate() + index);
        dates.push(date);
      }
      return dates;
    },

    _getEditLayerOptions() {
      const options = [];
      if (this._isTeacherMode()) {
        options.push({ value: 'teacher', label: '내 시간표' });
      }
      options.push({ value: 'single', label: '일회 보강' });
      options.push({ value: 'weekly', label: '1주 보강' });
      options.push({ value: 'exam', label: '시험 시간표' });
      return options;
    },

    _ensureEditLayer() {
      const allowed = this._getEditLayerOptions().map((item) => item.value);
      if (!allowed.includes(this._editLayer)) {
        this._editLayer = this._isTeacherMode() ? 'teacher' : 'single';
      }
    },

    async loadWeekTimetable() {
      const atpt = LS.Config.get('atptCode');
      const school = LS.Config.get('schoolCode');
      const classNum = LS.Config.get('classNum');
      const isTeacherMode = this._isTeacherMode();
      const isNonHomeroom = LS.Config.isNonHomeroomClass(classNum);

      if (!atpt || !school || isTeacherMode || isNonHomeroom) {
        this._weekData = {};
        return;
      }

      const grade = Number(LS.Config.get('grade') || 0) + 1;
      const cacheKey = `cachedTimetable:${atpt}:${school}:${grade}:${classNum}:${this._getWeekKey()}`;

      try {
        this._weekData = await LS.NeisAPI.getWeekTimetable(atpt, school, grade, classNum, this._currentMonday);
        LS.Storage.set(cacheKey, this._weekData);
      } catch (error) {
        console.error('[Timetable] Failed to load timetable:', error);
        this._weekData = LS.Storage.get(cacheKey, {});
      }
    },

    render() {
      const container = document.getElementById('timetable-content');
      if (!container) return;

      this._ensureEditLayer();
      const headerEl = document.getElementById('timetable-header-info');
      if (headerEl) {
        headerEl.textContent = '';
      }

      const periods = LS.Config.getPeriods();
      const classPeriods = periods.filter((period) => period.type === 'class' || period.type === 'afterSchool');
      const now = new Date();
      const currentDay = now.getDay();
      const currentPeriodInfo = LS.Helpers.getCurrentPeriod(periods, now);
      const weekDates = this._getCurrentWeekDates();

      let html = this._renderToolbar();
      html += '<table class="timetable-table"><colgroup><col class="tt-col-period">';
      weekDates.forEach(() => {
        html += '<col class="tt-col-day">';
      });
      html += '</colgroup><thead><tr><th class="tt-period-col">교시</th>';

      weekDates.forEach((date, dayIndex) => {
        const isToday = dayIndex + 1 === currentDay
          && this._getWeekKey(LS.NeisAPI.getMonday(now)) === this._getWeekKey();
        html += `<th class="${isToday ? 'tt-today-header' : ''}">`;
        html += `<div class="tt-header-day">${DAY_LABELS[dayIndex]}</div>`;
        html += `<div class="tt-header-date">${formatMonthDay(date)}</div>`;
        html += '</th>';
      });
      html += '</tr></thead><tbody>';

      classPeriods.forEach((period) => {
        const periodNum = period.period;
        const isCurrentPeriod = currentPeriodInfo.current && currentPeriodInfo.current.period === periodNum;
        const isAfterSchool = period.type === 'afterSchool';

        html += `<tr class="${isCurrentPeriod ? 'tt-current-row' : ''} ${isAfterSchool ? 'tt-afterschool-row' : ''}">`;
        html += `<td class="tt-period-cell"><div class="tt-period-inner"><span class="tt-period-num">${periodNum}</span><span class="tt-period-time">${period.start}</span></div></td>`;

        weekDates.forEach((date, dayIndex) => {
          const dateStr = LS.Helpers.formatDate(date, 'YYYYMMDD');
          const dayOfWeek = dayIndex + 1;
          const isToday = dayOfWeek === currentDay
            && this._getWeekKey(LS.NeisAPI.getMonday(now)) === this._getWeekKey();
          const isCurrent = isToday && isCurrentPeriod;

          if (isAfterSchool && period.days && !period.days.includes(dayOfWeek)) {
            html += `<td class="tt-cell tt-empty ${isToday ? 'tt-today' : ''}">${this._renderEmptyCellBody()}</td>`;
            return;
          }

          const cellData = this._getCellData(dateStr, periodNum, dayOfWeek);
          const cellTitle = `${dateStr} ${periodNum}교시 - ${cellData.sourceLabel} 수정`;

          html += `<td class="tt-cell ${isToday ? 'tt-today' : ''} ${isCurrent ? 'tt-current' : ''} tt-source-${cellData.source}" data-date="${dateStr}" data-period="${periodNum}" data-day="${dayOfWeek}" title="${LS.Helpers.escapeHtml(cellTitle)}">`;
          html += this._renderCellBody(cellData);
          html += '</td>';
        });

        html += '</tr>';
      });

      html += '</tbody></table>';
      container.innerHTML = html;

      const prevWeekBtn = container.querySelector('#tt-prev-week');
      const currentWeekBtn = container.querySelector('#tt-current-week');
      const nextWeekBtn = container.querySelector('#tt-next-week');
      const toolbarActions = container.querySelector('.tt-toolbar-actions');
      const toolbarMeta = container.querySelector('.tt-toolbar-meta');
      const clearLayerBtn = container.querySelector('#tt-clear-layer');

      prevWeekBtn?.classList.add('tt-week-btn');
      currentWeekBtn?.classList.add('tt-week-btn', 'tt-toolbar-advanced');
      nextWeekBtn?.classList.add('tt-week-btn');
      toolbarActions?.classList.add('tt-toolbar-advanced');
      toolbarMeta?.classList.add('tt-toolbar-advanced');

      if (prevWeekBtn) {
        prevWeekBtn.textContent = '‹';
        prevWeekBtn.title = '이전 주';
        prevWeekBtn.setAttribute('aria-label', '이전 주');
      }
      if (currentWeekBtn) {
        currentWeekBtn.textContent = '이번 주';
      }
      if (nextWeekBtn) {
        nextWeekBtn.textContent = '›';
        nextWeekBtn.title = '다음 주';
        nextWeekBtn.setAttribute('aria-label', '다음 주');
      }
      if (clearLayerBtn) {
        clearLayerBtn.textContent = '레이어 비우기';
      }

      container.querySelector('#tt-prev-week')?.addEventListener('click', () => this._moveWeek(-7));
      container.querySelector('#tt-next-week')?.addEventListener('click', () => this._moveWeek(7));
      container.querySelector('#tt-current-week')?.addEventListener('click', () => this._jumpCurrentWeek());
      container.querySelector('#tt-edit-layer')?.addEventListener('change', (event) => {
        this._editLayer = event.target.value || 'single';
        this.render();
      });
      container.querySelector('#tt-exam-settings')?.addEventListener('click', () => this._openExamSettings());
      container.querySelector('#tt-subject-colors')?.addEventListener('click', () => this._openSubjectColorEditor());
      container.querySelector('#tt-clear-layer')?.addEventListener('click', () => this._clearCurrentLayer());

      container.querySelectorAll('.tt-cell[data-date]').forEach((cell) => {
        cell.addEventListener('click', (event) => this._editCell(event.currentTarget));
      });
    },

    _renderToolbar() {
      const weekDates = this._getCurrentWeekDates();
      const weekLabel = `${formatMonthDay(weekDates[0])} - ${formatMonthDay(weekDates[4])}`;
      const editOptions = this._getEditLayerOptions();
      const overlaySummary = [];

      const weekKey = this._getWeekKey();
      const weeklyCount = Object.values(this._weeklyOverrides[weekKey] || {}).reduce((sum, periods) => {
        return sum + Object.keys(periods || {}).length;
      }, 0);
      if (weeklyCount) overlaySummary.push(`이번 주 1주 보강 ${weeklyCount}건`);

      const singleCount = weekDates.reduce((sum, date) => {
        const dateKey = LS.Helpers.formatDate(date, 'YYYYMMDD');
        return sum + Object.keys(this._singleOverrides[dateKey] || {}).length;
      }, 0);
      if (singleCount) overlaySummary.push(`일회 보강 ${singleCount}건`);

      if (this._examProfile.enabled && this._examProfile.startDate && this._examProfile.endDate) {
        overlaySummary.push(`시험기간 ${this._examProfile.name || '활성'} ${hyphenDate(this._examProfile.startDate)} ~ ${hyphenDate(this._examProfile.endDate)}`);
      }

      return `
        <div class="tt-toolbar">
          <div class="tt-toolbar-row">
            <div class="tt-week-nav">
              <button class="widget-secondary-btn" id="tt-prev-week">이전 주</button>
              <div class="tt-week-label">
                <strong>${weekLabel}</strong>
                <span>${this._getWeekLabelHint()}</span>
              </div>
              <button class="widget-secondary-btn" id="tt-current-week">현재 주</button>
              <button class="widget-secondary-btn" id="tt-next-week">다음 주</button>
            </div>
            <div class="tt-toolbar-actions">
              <select id="tt-edit-layer" class="widget-select">
                ${editOptions.map((option) => `<option value="${option.value}" ${option.value === this._editLayer ? 'selected' : ''}>${option.label}</option>`).join('')}
              </select>
              <button class="widget-secondary-btn" id="tt-exam-settings">시험기간</button>
              <button class="widget-secondary-btn" id="tt-subject-colors">과목 색상</button>
              <button class="widget-secondary-btn" id="tt-clear-layer">현재 레이어 비우기</button>
            </div>
          </div>
          <div class="tt-toolbar-meta">
            <span class="tt-mode-chip">편집 레이어: ${OVERLAY_LABELS[this._editLayer]}</span>
            ${overlaySummary.length ? overlaySummary.map((text) => `<span class="tt-mode-chip muted">${LS.Helpers.escapeHtml(text)}</span>`).join('') : '<span class="tt-mode-chip muted">추가 레이어 없음</span>'}
          </div>
        </div>
      `;
    },

    _getWeekLabelHint() {
      if (this._isTeacherMode()) return '내 시간표 기준';
      if (LS.Config.isNonHomeroomClass(LS.Config.get('classNum'))) return '비담임 / 자동 연동 없음';
      return `${Number(LS.Config.get('grade') || 0) + 1}학년 ${LS.Config.getClassDisplayName(LS.Config.get('classNum'))}`;
    },

    _getHeaderText() {
      if (this._isTeacherMode()) return '내 시간표';
      if (LS.Config.isNonHomeroomClass(LS.Config.get('classNum'))) return '비담임 / 자동 연동 없음';
      return `${Number(LS.Config.get('grade') || 0) + 1}학년 ${LS.Config.getClassDisplayName(LS.Config.get('classNum'))}`;
    },

    _getBaseSubject(dateStr, period, dayOfWeek) {
      if (this._isTeacherMode()) {
        return normalizeSubject(this._teacherData?.[dayOfWeek]?.[period] || '');
      }

      const dayData = this._weekData[dateStr];
      if (Array.isArray(dayData)) {
        const found = dayData.find((item) => item.period === period);
        if (found) return normalizeSubject(found.subject);
      }

      return '';
    },

    _getCellData(dateStr, period, dayOfWeek) {
      const weekKey = this._getWeekKey();
      const baseSubject = this._getBaseSubject(dateStr, period, dayOfWeek);
      const weeklySubject = normalizeSubject(this._weeklyOverrides?.[weekKey]?.[dayOfWeek]?.[period] || '');
      const singleSubject = normalizeSubject(this._singleOverrides?.[dateStr]?.[period] || '');
      const examSubject = this._examProfile.enabled && isDateInRange(dateStr, this._examProfile.startDate, this._examProfile.endDate)
        ? normalizeSubject(this._examProfile.entries?.[dateStr]?.[period] || '')
        : '';

      if (examSubject) return { subject: examSubject, source: 'exam', sourceLabel: OVERLAY_LABELS.exam };
      if (singleSubject) return { subject: singleSubject, source: 'single', sourceLabel: OVERLAY_LABELS.single };
      if (weeklySubject) return { subject: weeklySubject, source: 'weekly', sourceLabel: OVERLAY_LABELS.weekly };
      if (baseSubject) {
        return {
          subject: baseSubject,
          source: this._isTeacherMode() ? 'teacher' : 'base',
          sourceLabel: this._isTeacherMode() ? OVERLAY_LABELS.teacher : OVERLAY_LABELS.base
        };
      }

      return {
        subject: '',
        source: this._isTeacherMode() ? 'teacher' : 'base',
        sourceLabel: this._isTeacherMode() ? OVERLAY_LABELS.teacher : OVERLAY_LABELS.base
      };
    },

    _renderCellBody(cellData) {
      if (!cellData.subject) {
        return this._renderEmptyCellBody();
      }

      const color = this._getSubjectColor(cellData.subject);
      const style = color
        ? `--tt-subject-bg:${hexToRgba(color, 0.16)};--tt-subject-border:${hexToRgba(color, 0.35)};--tt-subject-color:${color};`
        : '';
      const subjectClass = this._getSubjectNameSizeClass(cellData.subject);

      return `
        <div class="tt-subject-card ${color ? 'has-color' : ''}" style="${style}">
          <span class="tt-subject-name ${subjectClass}">${LS.Helpers.escapeHtml(cellData.subject)}</span>
        </div>
      `;
    },

    _renderEmptyCellBody() {
      return '<div class="tt-cell-placeholder"><span class="tt-empty-text">-</span></div>';
    },

    _getSubjectNameSizeClass(subject) {
      const length = [...normalizeSubject(subject).replace(/\s+/g, '')].length;
      if (length <= 2) return 'is-short';
      if (length <= 5) return 'is-medium';
      return 'is-long';
    },

    _getSubjectColor(subject) {
      const key = normalizeSubjectKey(subject);
      const entries = Object.entries(this._subjectColors || {});
      const matched = entries.find(([name]) => normalizeSubjectKey(name) === key);
      return matched && isHexColor(matched[1]) ? matched[1].toUpperCase() : '';
    },

    async _moveWeek(offsetDays) {
      const next = new Date(this._currentMonday);
      next.setDate(next.getDate() + offsetDays);
      this._currentMonday = LS.NeisAPI.getMonday(next);
      await this.loadWeekTimetable();
      this.render();
    },

    async _jumpCurrentWeek() {
      this._currentMonday = LS.NeisAPI.getMonday(new Date());
      await this.loadWeekTimetable();
      this.render();
    },

    _editCell(cell) {
      const date = cell.dataset.date;
      const period = parseInt(cell.dataset.period, 10);
      const dayOfWeek = parseInt(cell.dataset.day, 10);

      if (this._editLayer === 'exam' && !this._canEditExamDate(date)) {
        LS.Helpers.showToast('시험기간 설정 후 해당 기간 주간에서 시험 시간표를 수정해 주세요.', 'warning', 3200);
        return;
      }

      const current = this._getEditableValue(date, period, dayOfWeek);
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'tt-edit-input';
      input.value = current;
      input.placeholder = `${OVERLAY_LABELS[this._editLayer]} 입력`;

      cell.innerHTML = '';
      cell.appendChild(input);
      input.focus();
      input.select();

      const save = () => {
        this._saveCellValue(date, period, dayOfWeek, normalizeSubject(input.value));
        this.render();
      };

      input.addEventListener('blur', save);
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') save();
        if (event.key === 'Escape') this.render();
      });
    },

    _getEditableValue(date, period, dayOfWeek) {
      if (this._editLayer === 'teacher') {
        return normalizeSubject(this._teacherData?.[dayOfWeek]?.[period] || '');
      }
      if (this._editLayer === 'single') {
        return normalizeSubject(this._singleOverrides?.[date]?.[period] || '');
      }
      if (this._editLayer === 'weekly') {
        return normalizeSubject(this._weeklyOverrides?.[this._getWeekKey()]?.[dayOfWeek]?.[period] || '');
      }
      if (this._editLayer === 'exam') {
        return normalizeSubject(this._examProfile?.entries?.[date]?.[period] || '');
      }
      return '';
    },

    _saveCellValue(date, period, dayOfWeek, value) {
      if (this._editLayer === 'teacher') {
        setPeriodValue(this._teacherData, dayOfWeek, period, value);
        this._writeScopedStorage(STORAGE_KEYS.teacher, this._teacherData);
        return;
      }

      if (this._editLayer === 'single') {
        setPeriodValue(this._singleOverrides, date, period, value);
        this._writeScopedStorage(STORAGE_KEYS.single, this._singleOverrides);
        return;
      }

      if (this._editLayer === 'weekly') {
        const weekKey = this._getWeekKey();
        if (!this._weeklyOverrides[weekKey]) this._weeklyOverrides[weekKey] = {};
        setPeriodValue(this._weeklyOverrides[weekKey], dayOfWeek, period, value);
        cleanupNestedMap(this._weeklyOverrides, weekKey);
        this._writeScopedStorage(STORAGE_KEYS.weekly, this._weeklyOverrides);
        return;
      }

      if (this._editLayer === 'exam') {
        if (!this._examProfile.entries) this._examProfile.entries = {};
        setPeriodValue(this._examProfile.entries, date, period, value);
        this._writeScopedStorage(STORAGE_KEYS.exam, this._examProfile);
      }
    },

    _canEditExamDate(dateStr) {
      return Boolean(
        this._examProfile.enabled
        && this._examProfile.startDate
        && this._examProfile.endDate
        && isDateInRange(dateStr, this._examProfile.startDate, this._examProfile.endDate)
      );
    },

    async _openExamSettings() {
      const result = await LS.Helpers.promptModal('시험기간 시간표 설정', [
        {
          id: 'enabled',
          type: 'select',
          label: '사용 여부',
          value: this._examProfile.enabled ? '1' : '0',
          options: [
            { value: '1', text: '사용' },
            { value: '0', text: '사용 안 함' }
          ]
        },
        { id: 'name', type: 'text', label: '이름', value: this._examProfile.name || '', placeholder: '예: 중간고사' },
        { id: 'startDate', type: 'date', label: '시작일', value: hyphenDate(this._examProfile.startDate) },
        { id: 'endDate', type: 'date', label: '종료일', value: hyphenDate(this._examProfile.endDate) }
      ], {
        message: '시험기간을 설정한 뒤, 편집 레이어를 "시험 시간표"로 바꾸고 셀을 클릭하면 날짜별 시험 시간표를 입력할 수 있습니다.',
        confirmText: '저장'
      });

      if (!result) return;

      const startDate = compactDate(result.startDate);
      const endDate = compactDate(result.endDate);
      if (result.enabled === '1' && (!/^\d{8}$/.test(startDate) || !/^\d{8}$/.test(endDate))) {
        LS.Helpers.showToast('시험기간 시작일과 종료일을 입력해 주세요.', 'warning', 3200);
        return;
      }
      if (result.enabled === '1' && endDate < startDate) {
        LS.Helpers.showToast('시험기간 종료일은 시작일보다 늦어야 합니다.', 'warning', 3200);
        return;
      }

      this._examProfile = {
        enabled: result.enabled === '1',
        name: normalizeSubject(result.name) || '시험기간',
        startDate,
        endDate,
        entries: this._examProfile.entries || {}
      };
      this._writeScopedStorage(STORAGE_KEYS.exam, this._examProfile);
      this.render();
    },

    async _openSubjectColorEditor() {
      const knownSubjects = this._collectKnownSubjects();
      const currentLines = Object.keys(this._subjectColors || {})
        .sort((a, b) => a.localeCompare(b, 'ko'))
        .map((subject) => `${subject}=${this._subjectColors[subject]}`)
        .join('\n');

      const result = await LS.Helpers.promptModal('과목 색상 설정', [
        {
          id: 'colorMap',
          type: 'textarea',
          label: '과목=색상',
          value: currentLines,
          rows: 12,
          placeholder: '국어=#F8BBD0\n수학=#BBDEFB'
        }
      ], {
        message: knownSubjects.length
          ? `현재 보이는 과목: ${knownSubjects.join(', ')}\n형식은 "과목=#RRGGBB" 입니다. 삭제하려면 해당 줄을 지우시면 됩니다.`
          : '형식은 "과목=#RRGGBB" 입니다. 삭제하려면 해당 줄을 지우시면 됩니다.',
        confirmText: '저장'
      });

      if (!result) return;

      const nextMap = {};
      const errors = [];

      String(result.colorMap || '')
        .split(/\r?\n/g)
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line, index) => {
          const separatorMatch = line.match(/^(.+?)(=|:|,)(#?[0-9a-fA-F]{6})$/);
          if (!separatorMatch) {
            errors.push(index + 1);
            return;
          }

          const subject = normalizeSubject(separatorMatch[1]);
          const color = separatorMatch[3].startsWith('#')
            ? separatorMatch[3].toUpperCase()
            : `#${separatorMatch[3].toUpperCase()}`;

          if (!subject || !isHexColor(color)) {
            errors.push(index + 1);
            return;
          }

          nextMap[subject] = color;
        });

      if (errors.length) {
        LS.Helpers.showToast(`형식이 잘못된 줄이 있습니다: ${errors.join(', ')}`, 'warning', 3600);
        return;
      }

      this._subjectColors = nextMap;
      this._writeScopedStorage(STORAGE_KEYS.colors, this._subjectColors);
      this.render();
    },

    _collectKnownSubjects() {
      const subjects = new Set();

      this._getCurrentWeekDates().forEach((date, dayIndex) => {
        const dateStr = LS.Helpers.formatDate(date, 'YYYYMMDD');
        const dayOfWeek = dayIndex + 1;
        const periods = LS.Config.getPeriods().filter((period) => period.type === 'class' || period.type === 'afterSchool');
        periods.forEach((period) => {
          const subject = this._getCellData(dateStr, period.period, dayOfWeek).subject;
          if (subject) subjects.add(subject);
        });
      });

      return [...subjects].sort((a, b) => a.localeCompare(b, 'ko'));
    },

    async _clearCurrentLayer() {
      const messageMap = {
        teacher: '내 시간표 전체 주간 구조에서 현재 보이는 요일/교시 입력값을 비웁니다. 계속하시겠습니까?',
        single: '현재 주의 일회 보강 입력값을 모두 비웁니다. 계속하시겠습니까?',
        weekly: '현재 주의 1주 보강 입력값을 모두 비웁니다. 계속하시겠습니까?',
        exam: '현재 주의 시험 시간표 입력값을 모두 비웁니다. 계속하시겠습니까?'
      };

      const confirmed = await LS.Helpers.confirmModal('시간표 레이어 비우기', messageMap[this._editLayer] || '현재 레이어를 비우시겠습니까?');
      if (!confirmed) return;

      const weekDates = this._getCurrentWeekDates().map((date) => LS.Helpers.formatDate(date, 'YYYYMMDD'));

      if (this._editLayer === 'teacher') {
        const periods = LS.Config.getPeriods().filter((period) => period.type === 'class' || period.type === 'afterSchool');
        for (let day = 1; day <= 5; day += 1) {
          periods.forEach((period) => {
            if (this._teacherData?.[day]) delete this._teacherData[day][period.period];
          });
          cleanupNestedMap(this._teacherData, day);
        }
        this._writeScopedStorage(STORAGE_KEYS.teacher, this._teacherData);
      }

      if (this._editLayer === 'single') {
        weekDates.forEach((dateKey) => {
          delete this._singleOverrides[dateKey];
        });
        this._writeScopedStorage(STORAGE_KEYS.single, this._singleOverrides);
      }

      if (this._editLayer === 'weekly') {
        delete this._weeklyOverrides[this._getWeekKey()];
        this._writeScopedStorage(STORAGE_KEYS.weekly, this._weeklyOverrides);
      }

      if (this._editLayer === 'exam') {
        weekDates.forEach((dateKey) => {
          delete this._examProfile.entries[dateKey];
        });
        this._writeScopedStorage(STORAGE_KEYS.exam, this._examProfile);
      }

      this.render();
    },

    async refresh() {
      this._reloadLocalData();
      await this.loadWeekTimetable();
      this.render();
    }
  };
})();
