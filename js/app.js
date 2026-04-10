(function () {
  'use strict';
  const LS = window.LivelySam = window.LivelySam || {};

  /* ── 기본 위젯 레이아웃 (4단 구성) ── */
  const DEFAULT_LAYOUT = [
    { id: 'clock',     x: 0,  y: 0, w: 3, h: 5, minW: 1, minH: 1 },
    { id: 'timetable', x: 3,  y: 0, w: 3, h: 6, minW: 3, minH: 4 },
    { id: 'calendar',  x: 6,  y: 0, w: 3, h: 6, minW: 3, minH: 5 },
    { id: 'weather',   x: 9,  y: 0, w: 3, h: 3, minW: 1, minH: 1 },
    { id: 'meal',      x: 0,  y: 5, w: 3, h: 4, minW: 2, minH: 3 },
    { id: 'timer',     x: 9,  y: 3, w: 3, h: 3, minW: 1, minH: 1 },
    { id: 'dday',      x: 9,  y: 6, w: 3, h: 2, minW: 1, minH: 1 },
    { id: 'memo',      x: 3,  y: 6, w: 3, h: 3, minW: 2, minH: 2 },
    { id: 'todo',      x: 6,  y: 6, w: 3, h: 3, minW: 2, minH: 2 },
    { id: 'bookmarks', x: 0,  y: 9, w: 3, h: 2, minW: 2, minH: 2 }
  ];

  LS.App = {
    grid: null,
    _schoolResolveRequestId: 0,
    _weatherResolveRequestId: 0,
    _schoolResolveState: { status: 'idle', message: '' },
    _weatherResolveState: { status: 'idle', message: '' },
    _resolvedSchoolSignature: '',
    _resolvedWeatherSignature: '',
    _debouncedSchoolResolution: null,
    _debouncedWeatherResolution: null,
    _viewportMetricsBound: false,
    _viewportMetricsUpdater: null,

    async init() {
      console.log('[LivelySam] 🚀 초기화 시작...');

      // 1. 스토리지 초기화
      await LS.Storage.initDB();

      // 2. 설정 로드
      LS.Config.init();
      LS.Config.applyTheme();

      // 3. Lively 연동
      LS.Lively.init();
      this._initEnvironment();

      // 4. Gridstack 레이아웃 초기화
      this._initGrid();

      // 5. 위젯 초기화
      await this._initWidgets();

      // 6. 설정 모달 바인딩
      this._initSettingsModal();

      // 7. 자동 백업
      LS.Storage.autoBackup();

      // 8. 설정 변경 리스너
      LS.Config.onChange((key, value) => {
        if (['theme', 'widgetOpacity', 'fontSize'].includes(key)) {
          LS.Config.applyTheme();
        }
        if (['grade', 'classNum', 'atptCode', 'schoolCode'].includes(key) || key === '_bulk') {
          this._refreshData();
        }
        this._handleConfigChange(key, value);
      });

      this._queueSchoolResolution();
      this._queueWeatherResolution();
      this._refreshLivelySetupNotice();

      // 9. 주기적 데이터 갱신 (30분)
      setInterval(() => this._refreshData(), 30 * 60 * 1000);

      // 10. 첫 실행 체크
      if (!LS.Config.get('atptCode')) {
        if (LS.Lively.isLively) {
          this._refreshLivelySetupNotice();
        } else {
          setTimeout(() => this._openSettings(), 500);
        }
      }

      console.log('[LivelySam] ✅ 초기화 완료!');
    },

    _initEnvironment() {
      document.body.classList.toggle('lively-mode', LS.Lively.isLively);
      document.body.classList.toggle('browser-mode', !LS.Lively.isLively);

      this._debouncedSchoolResolution = LS.Helpers.debounce(() => {
        this._resolveSchoolFromConfig();
      }, 700);

      this._debouncedWeatherResolution = LS.Helpers.debounce(() => {
        this._resolveWeatherFromConfig();
      }, 700);

      this._updateViewportMetrics();
      if (!this._viewportMetricsBound) {
        this._viewportMetricsBound = true;
        this._viewportMetricsUpdater = LS.Helpers.debounce(() => this._updateViewportMetrics(), 80);
        window.addEventListener('resize', this._viewportMetricsUpdater, { passive: true });
        window.addEventListener('livelysam:runtimeChanged', () => this._updateViewportMetrics());
      }
    },

    _updateViewportMetrics() {
      const root = document.documentElement;
      const innerHeight = window.innerHeight || root.clientHeight || 0;
      let bottomInset = 0;

      if (LS.Lively.isLively) {
        const screenHeight = window.screen?.height || innerHeight;
        const availHeight = window.screen?.availHeight || innerHeight;
        bottomInset = Math.max(0, innerHeight - availHeight, screenHeight - availHeight);
        bottomInset = Math.min(bottomInset, 120);
      }

      root.style.setProperty('--ls-desktop-bottom-inset', `${bottomInset}px`);
      root.style.setProperty('--ls-viewport-height', `${Math.max(320, innerHeight - bottomInset)}px`);
    },

    _bulkIncludes(obj, keys) {
      if (!obj || typeof obj !== 'object') return false;
      return keys.some(key => Object.prototype.hasOwnProperty.call(obj, key));
    },

    _queueSchoolResolution() {
      this._debouncedSchoolResolution?.();
    },

    _queueWeatherResolution() {
      this._debouncedWeatherResolution?.();
    },

    _normalizeSchoolName(name) {
      return String(name || '').replace(/\s+/g, '').toLowerCase();
    },

    _pickBestSchoolMatch(results, schoolName) {
      const normalizedName = this._normalizeSchoolName(schoolName);
      const exactMatches = results.filter(item => this._normalizeSchoolName(item.name) === normalizedName);
      const currentCode = LS.Config.get('schoolCode');
      const pool = exactMatches.length > 0 ? exactMatches : results;
      const selected = pool.find(item => item.schoolCode === currentCode) || pool[0];

      return {
        school: selected,
        ambiguousCount: pool.length > 1 ? pool.length : 0
      };
    },

    _handleConfigChange(key, value) {
      const shouldResolveSchool = key === '_bulk'
        ? this._bulkIncludes(value, ['schoolName', 'neisApiKey']) &&
          !this._bulkIncludes(value, ['schoolCode', 'atptCode'])
        : ['schoolName', 'neisApiKey'].includes(key);

      const shouldResolveWeather = key === '_bulk'
        ? this._bulkIncludes(value, ['weatherApiKey', 'schoolAddress']) &&
          !this._bulkIncludes(value, ['weatherLat', 'weatherLon'])
        : ['weatherApiKey', 'schoolAddress'].includes(key);

      if (shouldResolveSchool) {
        this._resolvedSchoolSignature = '';
        this._queueSchoolResolution();
      }

      if (shouldResolveWeather) {
        this._resolvedWeatherSignature = '';
        this._queueWeatherResolution();
      }

      this._refreshLivelySetupNotice();
    },

    async _resolveSchoolFromConfig() {
      const schoolName = (LS.Config.get('schoolName') || '').trim();
      const neisApiKey = (LS.Config.get('neisApiKey') || '').trim();
      const currentAtptCode = LS.Config.get('atptCode') || '';
      const currentSchoolCode = LS.Config.get('schoolCode') || '';
      const currentSignature = `${this._normalizeSchoolName(schoolName)}|${currentAtptCode}|${currentSchoolCode}|${neisApiKey}`;

      if (!schoolName || !neisApiKey) {
        this._schoolResolveState = { status: 'idle', message: '' };
        this._refreshLivelySetupNotice();
        return;
      }

      if (currentAtptCode && currentSchoolCode && currentSignature === this._resolvedSchoolSignature) {
        return;
      }

      const requestId = ++this._schoolResolveRequestId;
      this._schoolResolveState = { status: 'loading', message: '학교 정보를 확인하는 중입니다.' };
      this._refreshLivelySetupNotice();
      LS.NeisAPI.setApiKey(neisApiKey);

      try {
        const results = await LS.NeisAPI.searchSchool(schoolName);
        if (requestId !== this._schoolResolveRequestId) return;

        if (!results.length) {
          this._schoolResolveState = {
            status: 'error',
            message: '학교를 찾지 못했습니다. 학교명을 조금 더 정확하게 입력해주세요.'
          };
          this._refreshLivelySetupNotice();
          return;
        }

        const { school, ambiguousCount } = this._pickBestSchoolMatch(results, schoolName);
        const nextConfig = {
          schoolName: school.name,
          atptCode: school.atptCode,
          schoolCode: school.schoolCode,
          schoolAddress: school.address
        };
        const changed = nextConfig.schoolName !== LS.Config.get('schoolName') ||
          nextConfig.atptCode !== currentAtptCode ||
          nextConfig.schoolCode !== currentSchoolCode ||
          nextConfig.schoolAddress !== LS.Config.get('schoolAddress');

        this._resolvedSchoolSignature = `${this._normalizeSchoolName(nextConfig.schoolName)}|${nextConfig.atptCode}|${nextConfig.schoolCode}|${neisApiKey}`;
        this._schoolResolveState = ambiguousCount > 1
          ? {
              status: 'warning',
              message: `같은 이름의 학교 ${ambiguousCount}개 중 첫 번째 결과(${school.region})를 적용했습니다.`
            }
          : {
              status: 'ready',
              message: `${school.region} ${school.name}와 연결되었습니다.`
            };

        if (changed) {
          LS.Config.setMultiple(nextConfig);
        } else {
          this._refreshLivelySetupNotice();
        }
      } catch (e) {
        console.error('[LivelySam] 학교 자동 설정 실패:', e);
        if (requestId !== this._schoolResolveRequestId) return;
        this._schoolResolveState = {
          status: 'error',
          message: '학교 정보를 가져오지 못했습니다. NEIS API 키를 확인해주세요.'
        };
        this._refreshLivelySetupNotice();
      }
    },

    async _resolveWeatherFromConfig() {
      const weatherApiKey = (LS.Config.get('weatherApiKey') || '').trim();
      const schoolAddress = (LS.Config.get('schoolAddress') || '').trim();
      const currentLat = LS.Config.get('weatherLat');
      const currentLon = LS.Config.get('weatherLon');
      const currentSignature = `${weatherApiKey}|${schoolAddress}|${currentLat}|${currentLon}`;

      if (!weatherApiKey || !schoolAddress) {
        this._weatherResolveState = { status: 'idle', message: '' };
        this._refreshLivelySetupNotice();
        return;
      }

      if (currentLat !== null && currentLon !== null && currentSignature === this._resolvedWeatherSignature) {
        return;
      }

      const requestId = ++this._weatherResolveRequestId;
      this._weatherResolveState = { status: 'loading', message: '날씨 위치를 확인하는 중입니다.' };
      this._refreshLivelySetupNotice();
      LS.WeatherAPI.setApiKey(weatherApiKey);

      try {
        const location = await LS.WeatherAPI.geocode(schoolAddress);
        if (requestId !== this._weatherResolveRequestId) return;

        if (!location) {
          this._weatherResolveState = {
            status: 'error',
            message: '학교 주소로 날씨 위치를 찾지 못했습니다. 날씨 API 키를 확인해주세요.'
          };
          this._refreshLivelySetupNotice();
          return;
        }

        const changed = location.lat !== currentLat || location.lon !== currentLon;
        this._resolvedWeatherSignature = `${weatherApiKey}|${schoolAddress}|${location.lat}|${location.lon}`;
        this._weatherResolveState = {
          status: 'ready',
          message: `${location.name || '학교 주소'} 기준으로 날씨 위치를 설정했습니다.`
        };

        if (changed) {
          LS.Config.setMultiple({ weatherLat: location.lat, weatherLon: location.lon });
        } else {
          this._refreshLivelySetupNotice();
        }
      } catch (e) {
        console.error('[LivelySam] 날씨 위치 자동 설정 실패:', e);
        if (requestId !== this._weatherResolveRequestId) return;
        this._weatherResolveState = {
          status: 'error',
          message: '날씨 위치를 가져오지 못했습니다. OpenWeatherMap API 키를 확인해주세요.'
        };
        this._refreshLivelySetupNotice();
      }
    },

    _refreshLivelySetupNotice() {
      const noticeEl = document.getElementById('lively-setup-notice');
      const textEl = document.getElementById('lively-setup-text');
      if (!noticeEl || !textEl) return;

      if (!LS.Lively.isLively) {
        noticeEl.hidden = true;
        return;
      }

      const schoolName = (LS.Config.get('schoolName') || '').trim();
      const neisApiKey = (LS.Config.get('neisApiKey') || '').trim();
      const hasSchoolCode = Boolean(LS.Config.get('atptCode') && LS.Config.get('schoolCode'));
      const weatherApiKey = (LS.Config.get('weatherApiKey') || '').trim();
      const hasWeatherLocation = LS.Config.get('weatherLat') !== null && LS.Config.get('weatherLon') !== null;
      const lines = ['설정은 Lively의 Customize 패널에서 변경하세요.'];
      let tone = 'info';

      if (!neisApiKey) {
        tone = 'error';
        lines.push('NEIS API 키를 입력하면 학교 데이터를 불러올 수 있습니다.');
      } else if (!schoolName) {
        tone = 'error';
        lines.push('학교명을 입력하면 학교 코드가 자동으로 연결됩니다.');
      } else if (!hasSchoolCode) {
        tone = this._schoolResolveState.status === 'error' ? 'error' : 'info';
        lines.push(this._schoolResolveState.message || '학교 정보를 찾는 중입니다.');
      } else if (this._schoolResolveState.status === 'warning') {
        tone = 'warning';
        lines.push(this._schoolResolveState.message);
      } else {
        lines.push(`${LS.Config.get('schoolName')} 연결이 완료되었습니다.`);
      }

      if (weatherApiKey) {
        if (hasWeatherLocation) {
          lines.push('날씨 위치 설정이 완료되었습니다.');
        } else {
          if (tone === 'info' && this._weatherResolveState.status === 'error') {
            tone = 'warning';
          }
          lines.push(this._weatherResolveState.message || '날씨 위치를 찾는 중입니다.');
        }
      }

      const shouldShow = !hasSchoolCode ||
        this._schoolResolveState.status === 'loading' ||
        this._schoolResolveState.status === 'error' ||
        this._schoolResolveState.status === 'warning' ||
        (Boolean(weatherApiKey) && !hasWeatherLocation);

      if (!shouldShow) {
        noticeEl.hidden = true;
        return;
      }

      noticeEl.hidden = false;
      noticeEl.className = `lively-setup-notice is-${tone}`;
      textEl.innerHTML = lines.map(line => `<div>${LS.Helpers.escapeHtml(line)}</div>`).join('');
    },

    _initGrid() {
      const savedLayout = LS.Storage.get('gridLayout', null);
      const layout = savedLayout || DEFAULT_LAYOUT;

      // 위젯 HTML 생성
      const gridEl = document.querySelector('.grid-stack');
      if (!gridEl) return;

      layout.forEach(item => {
        const widgetHtml = this._getWidgetHTML(item.id);
        if (!widgetHtml) return;

        const el = document.createElement('div');
        el.className = 'grid-stack-item';
        el.setAttribute('gs-id', item.id);
        el.setAttribute('gs-x', item.x);
        el.setAttribute('gs-y', item.y);
        el.setAttribute('gs-w', item.w);
        el.setAttribute('gs-h', item.h);
        if (item.minW) el.setAttribute('gs-min-w', item.minW);
        if (item.minH) el.setAttribute('gs-min-h', item.minH);

        el.innerHTML = `<div class="grid-stack-item-content">${widgetHtml}</div>`;
        gridEl.appendChild(el);
      });

      this.grid = GridStack.init({
        column: 12,
        cellHeight: 80,
        margin: 8,
        float: true,
        animate: true,
        draggable: { handle: '.widget-header' },
        resizable: { handles: 'se,sw' }
      });

      // 레이아웃 변경 저장
      this.grid.on('change', () => {
        this._saveLayout();
      });
    },

    _saveLayout() {
      const items = this.grid.getGridItems();
      const layout = items.map(el => {
        const node = el.gridstackNode;
        return {
          id: node.id || el.getAttribute('gs-id'),
          x: node.x, y: node.y,
          w: node.w, h: node.h,
          minW: parseInt(el.getAttribute('gs-min-w')) || 2,
          minH: parseInt(el.getAttribute('gs-min-h')) || 2
        };
      });
      LS.Storage.set('gridLayout', layout);
    },

    resetLayout() {
      LS.Storage.remove('gridLayout');
      location.reload();
    },

    _getWidgetHTML(id) {
      const widgets = {
        clock: {
          title: '⏰ 시계', icon: '⏰',
          body: `
            <div class="clock-widget-inner">
              <div class="clock-analog-wrap">
                <canvas id="clock-analog" width="140" height="140"></canvas>
              </div>
              <div class="clock-digital-wrap">
                <div id="clock-digital" class="clock-digital">00:00:00</div>
                <div id="clock-date" class="clock-date"></div>
                <div class="clock-meta">
                  <span id="clock-day" class="clock-day"></span>
                  <span id="clock-semester" class="clock-semester"></span>
                </div>
                <div id="clock-holiday" class="clock-holiday" style="display:none"></div>
              </div>
              <div class="clock-period-section">
                <div id="clock-period" class="period-badge"></div>
                <div id="clock-remaining" class="clock-remaining"></div>
                <div class="clock-progress"><div id="clock-progress-bar" class="clock-progress-bar"></div></div>
                <div id="clock-next" class="clock-next" style="display:none"></div>
              </div>
            </div>`
        },
        timetable: {
          title: '📋 시간표', icon: '📋',
          headerExtra: '<span id="timetable-header-info" class="widget-header-info"></span>',
          actions: '<button class="widget-action-btn" onclick="LivelySam.TimetableWidget.refresh()" title="새로고침">🔄</button>',
          body: '<div id="timetable-content" class="timetable-content"></div>'
        },
        calendar: {
          title: '📅 학사일정', icon: '📅',
          actions: '<button id="cal-add-event" class="widget-action-btn" title="일정 추가">➕</button>',
          body: `
            <div class="cal-nav">
              <button id="cal-prev" class="cal-nav-btn">◀</button>
              <span id="cal-title" class="cal-title"></span>
              <button id="cal-next" class="cal-nav-btn">▶</button>
              <button id="cal-today" class="cal-today-btn">오늘</button>
            </div>
            <div id="cal-grid" class="cal-grid"></div>
            <div id="cal-events" class="cal-events"></div>`
        },
        weather: {
          title: '🌤️ 날씨', icon: '🌤️',
          actions: '<button class="widget-action-btn" onclick="LivelySam.WeatherWidget.update()" title="새로고침">🔄</button>',
          body: '<div id="weather-content" class="weather-content"></div>'
        },
        meal: {
          title: '🍱 급식', icon: '🍱',
          actions: '<button class="widget-action-btn" onclick="LivelySam.MealWidget.refresh()" title="새로고침">🔄</button>',
          body: `
            <div class="meal-tabs">
              <button class="meal-tab-btn active" data-view="today">오늘</button>
              <button class="meal-tab-btn" data-view="tomorrow">내일</button>
              <button class="meal-tab-btn" data-view="week">이번주</button>
            </div>
            <div id="meal-content" class="meal-content"></div>`
        },
        timer: {
          title: '⏱️ 타이머', icon: '⏱️',
          body: `
            <div class="timer-widget-inner" id="widget-timer">
              <div id="timer-state" class="timer-state" style="display:none"></div>
              <div id="timer-display" class="timer-display">00:00</div>
              <div class="timer-progress-wrap"><div id="timer-progress" class="timer-progress-bar"></div></div>
              <div class="timer-controls">
                <button id="timer-start" class="timer-btn">▶️ 시작</button>
                <button id="timer-reset" class="timer-btn">⏹️ 초기화</button>
                <button id="timer-set" class="timer-btn">⏲️ 설정</button>
                <button id="timer-mode-btn" class="timer-btn">⏱️ 타이머</button>
              </div>
            </div>`
        },
        dday: {
          title: '📌 D-Day', icon: '📌',
          actions: '<button id="dday-add" class="widget-action-btn" title="D-Day 추가">➕</button>',
          body: '<div id="dday-content" class="dday-content"></div>'
        },
        memo: {
          title: '📝 메모', icon: '📝',
          actions: '<button class="widget-action-btn" onclick="LivelySam.MemoWidget.addMemo()" title="메모 추가">➕</button>',
          body: '<div id="memo-content" class="memo-content"></div>'
        },
        todo: {
          title: '✅ 할 일', icon: '✅',
          actions: '<button class="widget-action-btn" onclick="LivelySam.TodoWidget.addTodo()" title="할 일 추가">➕</button>',
          body: '<div id="todo-content" class="todo-content"></div>'
        },
        bookmarks: {
          title: '🔗 즐겨찾기', icon: '🔗',
          actions: '<button class="widget-action-btn" onclick="LivelySam.BookmarksWidget.addBookmark()" title="즐겨찾기 추가">➕</button>',
          body: '<div id="bookmarks-content" class="bm-content"></div>'
        }
      };

      const w = widgets[id];
      if (!w) return '';

      return `
        <div class="widget" id="widget-${id}">
          <div class="widget-header">
            <span class="widget-title">${w.title}</span>
            ${w.headerExtra || ''}
            <div class="widget-actions">
              ${w.actions || ''}
            </div>
          </div>
          <div class="widget-body">${w.body}</div>
        </div>`;
    },

    async _initWidgets() {
      // 순서대로 초기화
      LS.ClockWidget.init();
      await LS.TimetableWidget.init();
      await LS.MealWidget.init();
      await LS.WeatherWidget.init();
      await LS.CalendarWidget.init();
      await LS.MemoWidget.init();
      await LS.TodoWidget.init();
      LS.TimerWidget.init();
      LS.DdayWidget.init();
      await LS.BookmarksWidget.init();
    },

    async _refreshData() {
      console.log('[LivelySam] 🔄 데이터 갱신...');
      try {
        await Promise.all([
          LS.TimetableWidget.refresh(),
          LS.MealWidget.refresh(),
          LS.WeatherWidget.update(),
          LS.CalendarWidget.refresh()
        ]);
      } catch (e) {
        console.error('[LivelySam] 데이터 갱신 실패:', e);
      }
    },

    /* ── 설정 모달 ── */
    _initSettingsModal() {
      const settingsBtn = this._ensureSettingsButton();
      settingsBtn.onclick = () => this._openSettings();
      document.getElementById('settings-close')?.addEventListener('click', () => this._closeSettings());
      document.getElementById('settings-cancel')?.addEventListener('click', () => this._closeSettings());
      document.getElementById('settings-overlay')?.addEventListener('click', () => this._closeSettings());

      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && document.getElementById('settings-modal')?.classList.contains('active')) {
          this._closeSettings();
        }
      });

      document.querySelectorAll('.settings-tab-btn').forEach((btn) => {
        btn.addEventListener('click', (event) => {
          const target = event.currentTarget;
          document.querySelectorAll('.settings-tab-btn').forEach((item) => item.classList.remove('active'));
          document.querySelectorAll('.settings-panel').forEach((panel) => panel.classList.remove('active'));
          target.classList.add('active');
          document.getElementById('settings-' + target.dataset.tab)?.classList.add('active');
          window.requestAnimationFrame(() => {
            document.querySelector('.settings-body')?.scrollTo({ top: 0, behavior: 'auto' });
            this._updateSettingsScrollButtons();
          });
        });
      });

      document.getElementById('school-search-btn')?.addEventListener('click', () => this._searchSchool());
      document.getElementById('school-name-input')?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') this._searchSchool();
      });

      document.getElementById('settings-save')?.addEventListener('click', () => this._saveSettings());
      document.getElementById('reset-layout-btn')?.addEventListener('click', () => this.resetLayout());
      document.getElementById('export-btn')?.addEventListener('click', () => this._exportData());
      document.getElementById('import-btn')?.addEventListener('click', () => this._importData());

      this._ensureSettingsScrollControls();
      this._bindSettingsBodyScroll();
      this._populateSettingsForm();
    },

    _openSettings() {
      this._updateViewportMetrics();
      document.body.classList.add('modal-open', 'settings-open');
      document.getElementById('settings-modal')?.classList.add('active');
      this._setSettingsButtonVisible(false);
      this._populateSettingsForm();
      document.querySelector('.settings-body')?.scrollTo({ top: 0, behavior: 'auto' });
      this._updateSettingsScrollButtons();
    },

    _closeSettings() {
      document.body.classList.remove('settings-open');
      if (!document.getElementById('prompt-modal')?.classList.contains('active')) {
        document.body.classList.remove('modal-open');
      }
      document.getElementById('settings-modal')?.classList.remove('active');
      this._setSettingsButtonVisible(true);
    },

    _bindSettingsBodyScroll() {
      const body = document.querySelector('.settings-body');
      const container = document.querySelector('.settings-container');
      if (!body || !container || body.dataset.scrollBound === 'true') return;

      body.dataset.scrollBound = 'true';

      const handleWheel = (event) => {
        if (!document.getElementById('settings-modal')?.classList.contains('active')) return;
        if (event.target.closest('.settings-scroll-btn')) return;

        const delta = event.deltaY;
        if (Math.abs(delta) < 1) return;

        const maxScroll = body.scrollHeight - body.clientHeight;
        if (maxScroll <= 0) return;

        const nextTop = Math.max(0, Math.min(maxScroll, body.scrollTop + delta));
        if (nextTop === body.scrollTop) return;

        body.scrollTop = nextTop;
        this._updateSettingsScrollButtons();
        event.preventDefault();
        event.stopPropagation();
      };

      container.addEventListener('wheel', handleWheel, { passive: false, capture: true });
      body.addEventListener('scroll', () => this._updateSettingsScrollButtons(), { passive: true });
    },

    _ensureSettingsButton() {
      let btn = document.getElementById('settings-btn');
      if (!btn) {
        btn = document.createElement('button');
        btn.id = 'settings-btn';
        document.body.appendChild(btn);
      } else if (btn.parentElement !== document.body) {
        document.body.appendChild(btn);
      }

      btn.type = 'button';
      btn.title = '설정 열기';
      btn.setAttribute('aria-label', '설정 열기');
      btn.textContent = '⚙️';
      Object.assign(btn.style, {
        position: 'fixed',
        right: '18px',
        bottom: 'calc(24px + var(--ls-desktop-bottom-inset, 0px))',
        width: '54px',
        height: '54px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: 'none',
        borderRadius: '999px',
        background: 'rgba(255, 255, 255, 0.96)',
        color: '#1a1a2e',
        fontSize: '24px',
        lineHeight: '1',
        cursor: 'pointer',
        zIndex: '9999',
        boxShadow: '0 16px 34px rgba(0, 0, 0, 0.18)',
        opacity: '1',
        visibility: 'visible',
        pointerEvents: 'auto'
      });
      btn.hidden = false;
      return btn;
    },

    _setSettingsButtonVisible(visible) {
      const btn = this._ensureSettingsButton();
      btn.style.opacity = visible ? '1' : '0';
      btn.style.visibility = visible ? 'visible' : 'hidden';
      btn.style.pointerEvents = visible ? 'auto' : 'none';
    },

    _ensureSettingsScrollControls() {
      const container = document.querySelector('.settings-container');
      if (!container || container.querySelector('.settings-scroll-controls')) return;

      const controls = document.createElement('div');
      controls.className = 'settings-scroll-controls';
      controls.innerHTML = `
        <button type="button" id="settings-scroll-up" class="settings-scroll-btn" aria-label="위로 스크롤">▲</button>
        <button type="button" id="settings-scroll-down" class="settings-scroll-btn" aria-label="아래로 스크롤">▼</button>
      `;
      container.appendChild(controls);

      document.getElementById('settings-scroll-up')?.addEventListener('click', () => this._scrollSettingsBody(-220));
      document.getElementById('settings-scroll-down')?.addEventListener('click', () => this._scrollSettingsBody(220));
    },

    _scrollSettingsBody(delta) {
      const body = document.querySelector('.settings-body');
      if (!body) return;
      const maxScroll = Math.max(0, body.scrollHeight - body.clientHeight);
      body.scrollTop = Math.max(0, Math.min(maxScroll, body.scrollTop + delta));
      this._updateSettingsScrollButtons();
    },

    _updateSettingsScrollButtons() {
      const body = document.querySelector('.settings-body');
      const upBtn = document.getElementById('settings-scroll-up');
      const downBtn = document.getElementById('settings-scroll-down');
      const controls = document.querySelector('.settings-scroll-controls');
      if (!body || !upBtn || !downBtn || !controls) return;

      const maxScroll = Math.max(0, body.scrollHeight - body.clientHeight);
      controls.hidden = maxScroll <= 4;
      upBtn.disabled = body.scrollTop <= 4;
      downBtn.disabled = body.scrollTop >= maxScroll - 4;
    },

    _updateSettingsRuntimeTip() {
      const tipEl = document.getElementById('settings-runtime-tip');
      if (!tipEl) return;

      if (!LS.Lively.isLively) {
        tipEl.hidden = true;
        tipEl.textContent = '';
        return;
      }

      tipEl.hidden = false;
      tipEl.textContent = 'Lively에서 텍스트 입력이 안 되면 Lively Settings > Wallpaper > Interaction > Wallpaper Input > Keyboard를 켜주세요. 데이터 백업/복원은 파일 대신 모달에서 JSON 복사/붙여넣기로 동작합니다.';
    },

    _populateSettingsForm() {
      const c = LS.Config;
      const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
      const setChecked = (id, val) => { const el = document.getElementById(id); if (el) el.checked = val; };

      setVal('school-name-input', c.get('schoolName'));
      setVal('neis-key-input', c.get('neisApiKey'));
      setVal('weather-key-input', c.get('weatherApiKey'));
      setVal('theme-select', c.get('theme'));
      setVal('opacity-slider', c.get('widgetOpacity'));
      setVal('fontsize-slider', c.get('fontSize'));
      setVal('clock-format-select', c.get('clockFormat'));
      setChecked('show-analog-check', c.get('showAnalogClock'));
      setChecked('show-seconds-check', c.get('showSeconds'));
      setVal('timetable-mode-select', c.get('timetableMode') || 0);
      setVal('grade-select', c.get('grade'));
      setVal('class-input', c.get('classNum'));
      setVal('start-time-input', c.get('startTime'));
      setVal('morning-min-input', c.get('morningMinutes'));
      setVal('class-min-input', c.get('classMinutes'));
      setVal('break-min-input', c.get('breakMinutes'));
      setVal('lunch-min-input', c.get('lunchMinutes'));
      setVal('lunch-after-select', c.get('lunchAfterPeriod'));
      setVal('total-periods-select', c.get('totalPeriods'));
      setChecked('afterschool-check', c.get('afterSchoolEnabled'));
      setVal('afterschool-min-input', c.get('afterSchoolMinutes'));
      setVal('afterschool-days-input', c.get('afterSchoolDays'));

      // 슬라이더 값 표시
      const opSlider = document.getElementById('opacity-slider');
      const opLabel = document.getElementById('opacity-value');
      if (opSlider && opLabel) {
        opLabel.textContent = opSlider.value + '%';
        opSlider.oninput = () => { opLabel.textContent = opSlider.value + '%'; };
      }
      const fsSlider = document.getElementById('fontsize-slider');
      const fsLabel = document.getElementById('fontsize-value');
      if (fsSlider && fsLabel) {
        fsLabel.textContent = fsSlider.value + 'px';
        fsSlider.oninput = () => { fsLabel.textContent = fsSlider.value + 'px'; };
      }

      // 학교 정보 표시
      const schoolInfo = document.getElementById('school-info-display');
      if (schoolInfo) {
        const name = c.get('schoolName');
        const code = c.get('schoolCode');
        if (name && code) {
          schoolInfo.textContent = `✅ ${name} (${c.get('atptCode')} / ${code})`;
          schoolInfo.style.color = '#2ecc71';
        } else {
          schoolInfo.textContent = '학교를 검색해주세요';
          schoolInfo.style.color = '#888';
        }
      }

      this._updateSettingsRuntimeTip();

      // 교시 시간표 미리보기
      this._renderPeriodPreview();
      this._updateSettingsScrollButtons();
    },

    _renderPeriodPreview() {
      const container = document.getElementById('period-preview');
      if (!container) return;

      const periods = LS.Config.getPeriods();
      let html = '<div class="period-preview-list">';
      periods.forEach(p => {
        const emoji = p.type === 'class' ? '📖' : p.type === 'lunch' ? '🍽️' : p.type === 'break' ? '☕' : p.type === 'morning' ? '🌅' : '📚';
        html += `<div class="period-preview-item">`;
        html += `<span class="period-preview-time">${p.start} ~ ${p.end}</span>`;
        html += `<span class="period-preview-label">${emoji} ${p.label}</span>`;
        html += `</div>`;
      });
      html += '</div>';
      container.innerHTML = html;
    },

    async _searchSchool() {
      const input = document.getElementById('school-name-input');
      const resultBox = document.getElementById('school-search-results');
      if (!input || !resultBox) return;

      const name = input.value.trim();
      if (!name) {
        LS.Helpers.showToast('학교명을 입력해주세요.', 'warning');
        return;
      }

      const apiKey = document.getElementById('neis-key-input')?.value?.trim();
      if (!apiKey) {
        LS.Helpers.showToast('NEIS API 키를 먼저 입력해주세요.', 'warning');
        return;
      }

      LS.NeisAPI.setApiKey(apiKey);
      resultBox.innerHTML = '<div class="search-loading">🔍 검색 중...</div>';

      try {
        const results = await LS.NeisAPI.searchSchool(name);
        if (results.length === 0) {
          resultBox.innerHTML = '<div class="search-empty">검색 결과가 없습니다.</div>';
          return;
        }

        let html = '';
        results.forEach((r, i) => {
          html += `<div class="school-result-item" data-index="${i}">`;
          html += `<div class="school-result-name">${r.name}</div>`;
          html += `<div class="school-result-info">${r.region} · ${r.schoolType} · ${r.address}</div>`;
          html += `</div>`;
        });
        resultBox.innerHTML = html;

        // 클릭 이벤트
        resultBox.querySelectorAll('.school-result-item').forEach(item => {
          item.addEventListener('click', () => {
            const idx = parseInt(item.dataset.index);
            const school = results[idx];
            const neisApiKey = document.getElementById('neis-key-input')?.value?.trim() || '';
            const weatherApiKey = document.getElementById('weather-key-input')?.value?.trim() || '';
            LS.Config.setMultiple({
              schoolName: school.name,
              atptCode: school.atptCode,
              schoolCode: school.schoolCode,
              schoolAddress: school.address
            });
            this._resolvedSchoolSignature =
              `${this._normalizeSchoolName(school.name)}|${school.atptCode}|${school.schoolCode}|${neisApiKey}`;
            this._schoolResolveState = {
              status: 'ready',
              message: `${school.region} ${school.name}와 연결되었습니다.`
            };

            // 날씨 좌표 설정
            if (school.address && weatherApiKey) {
              LS.WeatherAPI.setApiKey(weatherApiKey);
              LS.WeatherAPI.geocode(school.address).then(loc => {
                if (loc) {
                  LS.Config.setMultiple({ weatherLat: loc.lat, weatherLon: loc.lon });
                  this._resolvedWeatherSignature = `${weatherApiKey}|${school.address}|${loc.lat}|${loc.lon}`;
                  this._weatherResolveState = {
                    status: 'ready',
                    message: `${loc.name || '학교 주소'} 기준으로 날씨 위치를 설정했습니다.`
                  };
                } else {
                  this._weatherResolveState = {
                    status: 'error',
                    message: '학교 주소로 날씨 위치를 찾지 못했습니다.'
                  };
                }
                this._refreshLivelySetupNotice();
              });
            } else {
              this._weatherResolveState = { status: 'idle', message: '' };
            }

            // UI 갱신
            const infoEl = document.getElementById('school-info-display');
            if (infoEl) {
              infoEl.textContent = `✅ ${school.name} 선택됨`;
              infoEl.style.color = '#2ecc71';
            }
            resultBox.innerHTML = '';
            input.value = school.name;

            this._refreshLivelySetupNotice();
          });
        });
      } catch (e) {
        resultBox.innerHTML = '<div class="search-error">❌ 검색 실패. API 키를 확인하세요.</div>';
      }
    },

    _saveSettings() {
      const getVal = (id) => document.getElementById(id)?.value || '';
      const getChecked = (id) => document.getElementById(id)?.checked || false;
      const getInt = (id, def) => parseInt(document.getElementById(id)?.value) || def;

      LS.Config.setMultiple({
        neisApiKey: getVal('neis-key-input'),
        weatherApiKey: getVal('weather-key-input'),
        theme: getInt('theme-select', 1),
        widgetOpacity: getInt('opacity-slider', 75),
        fontSize: getInt('fontsize-slider', 14),
        clockFormat: getInt('clock-format-select', 1),
        showAnalogClock: getChecked('show-analog-check'),
        showSeconds: getChecked('show-seconds-check'),
        timetableMode: getInt('timetable-mode-select', 0),
        grade: getInt('grade-select', 0),
        classNum: getVal('class-input') || '1',
        startTime: getVal('start-time-input') || '08:20',
        morningMinutes: getInt('morning-min-input', 10),
        classMinutes: getInt('class-min-input', 50),
        breakMinutes: getInt('break-min-input', 10),
        lunchMinutes: getInt('lunch-min-input', 60),
        lunchAfterPeriod: getInt('lunch-after-select', 1),
        totalPeriods: getInt('total-periods-select', 1),
        afterSchoolEnabled: getChecked('afterschool-check'),
        afterSchoolMinutes: getInt('afterschool-min-input', 70),
        afterSchoolDays: getVal('afterschool-days-input') || '1,3,5'
      });

      // 교시 자동 재계산
      LS.Config.resetPeriodsToAuto();
      LS.Config.applyTheme();

      this._closeSettings();
      this._refreshData();

      // 시간표 위젯 갱신
      LS.TimetableWidget.render();
    },

    async _exportData() {
      try {
        const data = await LS.Storage.exportAll();
        if (LS.Lively.isLively) {
          await LS.Helpers.promptModal('데이터 백업', [
            {
              id: 'json',
              type: 'textarea',
              label: '백업 JSON',
              value: JSON.stringify(data, null, 2),
              readonly: true,
              rows: 14
            }
          ], {
            message: 'Lively에서는 파일 다운로드 대신 JSON 복사 방식이 더 안정적입니다.',
            confirmText: '닫기',
            showCancel: false
          });
          LS.Helpers.showToast('백업 JSON을 열었습니다.', 'success');
          return;
        }

        const filename = `LivelySam_backup_${LS.Helpers.formatDate(new Date(), 'YYYY-MM-DD')}.json`;
        LS.Storage.downloadJSON(data, filename);
        LS.Helpers.showToast('데이터를 내보냈습니다.', 'success');
      } catch (e) {
        LS.Helpers.showToast(`내보내기 실패: ${e.message}`, 'error', 3200);
      }
    },

    async _importData() {
      if (LS.Lively.isLively) {
        const result = await LS.Helpers.promptModal('데이터 가져오기', [
          {
            id: 'json',
            type: 'textarea',
            label: '백업 JSON 붙여넣기',
            placeholder: '{ ... }',
            rows: 14
          }
        ], {
          message: '백업 JSON 전체를 붙여넣으면 현재 데이터 위에 복원합니다.',
          confirmText: '가져오기'
        });

        if (!result?.json?.trim()) return;

        try {
          await LS.Storage.importAll(JSON.parse(result.json));
          LS.Helpers.showToast('데이터를 가져왔습니다. 레이아웃을 새로고침합니다.', 'success', 3200);
          location.reload();
        } catch (err) {
          LS.Helpers.showToast(`가져오기 실패: ${err.message}`, 'error', 3200);
        }
        return;
      }

      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const text = await file.text();
          const data = JSON.parse(text);
          await LS.Storage.importAll(data);
          LS.Helpers.showToast('데이터를 가져왔습니다. 페이지를 새로고침합니다.', 'success', 3200);
          location.reload();
        } catch (err) {
          LS.Helpers.showToast(`가져오기 실패: ${err.message}`, 'error', 3200);
        }
      };
      input.click();
    }
  };

  /* ── 앱 시작 ── */
  document.addEventListener('DOMContentLoaded', () => {
    LS.App.init();
  });
})();
