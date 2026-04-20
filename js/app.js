(function () {
  'use strict';
  const LS = window.LivelySam = window.LivelySam || {};
  const VERSION_INFO = window.LivelySamVersion || LS.VERSION_INFO || { version: '0.0.0-dev', defaultChannel: 'dev' };
  LS.VERSION_INFO = Object.freeze({ ...VERSION_INFO });
  LS.VERSION = String(LS.VERSION_INFO.version || '0.0.0-dev');

  const GRID_COLUMNS = 24;
  const GRID_CELL_HEIGHT = 40;
  const GRID_MARGIN = 6;
  const GRID_WIDTH_UNIT_SCALE = 2;
  const GRID_COLUMN_STYLE_ID = 'ls-grid-column-style';
  const GRID_LAYOUT_STORAGE_KEY = 'gridLayout';
  const GRID_LAYOUT_STATE_STORAGE_KEY = 'gridLayoutState';
  const GRID_LAYOUT_BACKUP_STORAGE_KEY = 'gridLayoutBackup';
  const GRID_LAYOUT_STATE_VERSION = 2;
  /* 현재 사용자 배치를 반영한 기본 위젯 레이아웃 (24컬럼, cellHeight=40 기준) */
  const DEFAULT_LAYOUT = [
    { id: 'clock',     x: 0,  y: 3,  w: 5, h: 7,  minW: 2, minH: 2 },
    { id: 'timetable', x: 5,  y: 0,  w: 6, h: 12, minW: 4, minH: 6 },
    { id: 'calendar',  x: 11, y: 0,  w: 7, h: 12, minW: 6, minH: 10 },
    { id: 'weather',   x: 18, y: 0,  w: 6, h: 13, minW: 2, minH: 2 },
    { id: 'meal',      x: 0,  y: 10, w: 5, h: 6,  minW: 4, minH: 6 },
    { id: 'timer',     x: 0,  y: 0,  w: 3, h: 3,  minW: 2, minH: 2 },
    { id: 'dday',      x: 3,  y: 0,  w: 2, h: 3,  minW: 2, minH: 2 },
    { id: 'memo',      x: 5,  y: 12, w: 6, h: 8,  minW: 4, minH: 4 },
    { id: 'todo',      x: 11, y: 12, w: 7, h: 8,  minW: 4, minH: 4 },
    { id: 'bookmarks', x: 18, y: 13, w: 6, h: 7,  minW: 4, minH: 4 },
    { id: 'shortcuts', x: 0,  y: 16, w: 5, h: 4,  minW: 4, minH: 3 }
  ];
  const WIDGET_VISIBILITY_FIELDS = [
    ['clock', 'widget-visible-clock'],
    ['timetable', 'widget-visible-timetable'],
    ['calendar', 'widget-visible-calendar'],
    ['weather', 'widget-visible-weather'],
    ['meal', 'widget-visible-meal'],
    ['timer', 'widget-visible-timer'],
    ['dday', 'widget-visible-dday'],
    ['memo', 'widget-visible-memo'],
    ['todo', 'widget-visible-todo'],
    ['bookmarks', 'widget-visible-bookmarks'],
    ['shortcuts', 'widget-visible-shortcuts']
  ];
  const LAYOUT_EDIT_ORIGIN_STORAGE_KEY = 'layoutEditOrigin';
  const WIDGET_META = {
    clock: { title: '시계', icon: '⏰' },
    timetable: { title: '시간표', icon: '📚' },
    calendar: { title: '일정', icon: '📅' },
    weather: { title: '날씨', icon: '☁️' },
    meal: { title: '급식', icon: '🍽️' },
    timer: { title: '타이머', icon: '⏱️' },
    dday: { title: 'D-Day', icon: '🎯' },
    memo: { title: '메모', icon: '📝' },
    todo: { title: '할 일', icon: '✅' },
    bookmarks: { title: '즐겨찾기', icon: '🔖' },
    shortcuts: { title: '바로가기', icon: '🗂️' }
  };
  const GOOGLE_LOCAL_SYNC_DELAY_MS = 1200;
  const GOOGLE_REALTIME_SYNC_INTERVAL_MS = 60 * 1000;
  const GOOGLE_REALTIME_SYNC_STALE_MS = 60 * 1000;
  const GOOGLE_FOCUS_SYNC_STALE_MS = 15 * 1000;

  LS.App = {
    grid: null,
    _schoolResolveRequestId: 0,
    _weatherResolveRequestId: 0,
    _schoolResolveState: { status: 'idle', message: '' },
    _weatherResolveState: { status: 'idle', message: '' },
    _weatherConnectionState: { status: 'idle', stage: 'idle', presetKey: '', message: '', locationName: '', checkedAt: 0 },
    _resolvedSchoolSignature: '',
    _resolvedWeatherSignature: '',
    _debouncedSchoolResolution: null,
    _debouncedWeatherResolution: null,
    _viewportMetricsBound: false,
    _viewportMetricsUpdater: null,
    _runtimeChangedHandler: null,
    _beforeUnloadHandler: null,
    _widgetResizeObserver: null,
    _widgetMetricsFrame: 0,
    _widgetSettingsFocusTimer: 0,
    _widgetSummarySyncFrame: 0,
    _appRefreshIntervalId: 0,
    _startupQuickstartTimer: 0,
    _activeSettingsTab: 'quickstart',
    _layoutEditMode: false,
    _lastSafeVisibleLayout: null,
    _suppressGridChange: false,
    _settingsDirty: false,
    _settingsDiscardConfirmOpen: false,
    _settingsSaveInProgress: false,
    _settingsSessionSnapshot: null,
    _settingsSyncing: false,
    _settingsTimetableRefreshTimer: 0,
    _floatingDockExpanded: false,
    _floatingDockCollapseTimer: 0,
    _googleAutoSyncTimer: 0,
    _googleAutoSyncBound: false,
    _googleRecordsChangedHandler: null,
    _googleSyncChangedHandler: null,
    _googlePassiveSyncTimer: 0,
    _googleInitialSyncTimer: 0,
    _googleSettingsResyncTimer: 0,
    _googleRealtimeSyncBound: false,
    _googleRealtimeSyncIntervalId: 0,
    _googleFocusSyncHandler: null,
    _googleOnlineSyncHandler: null,
    _googleVisibilitySyncHandler: null,
    _googleProgressBound: false,
    _googleProgressHandler: null,
    _googleSyncPromise: null,
    _googleSyncSuppressUntil: 0,
    _googleStatusRefreshPromise: null,
    _lastGoogleDiagnostics: null,
    _themePreviewKeys: [
      'theme',
      'widgetOpacity',
      'fontSize',
      'customPrimaryColor',
      'customPrimaryLightColor',
      'customAccentColor',
      'customBackgroundColor',
      'backgroundOpacity'
    ],

    async init() {
      console.log('[LivelySam] 초기화 시작...');
      await LS.Storage.initDB();
      this._applyAppMetadata();
      // 설정 로드
      LS.Config.init();
      this._stabilizePersistedWidgetVisibility();
      LS.Config.applyTheme();
      await LS.GoogleWorkspace?.init?.();

      // 런타임 연동
      LS.Lively.init();
      LS.WallpaperEngine?.init?.();
      this._initEnvironment();
      {
        const savedLayoutEditMode = LS.Storage.get('layoutEditMode', false);
        this._layoutEditMode = savedLayoutEditMode === true || savedLayoutEditMode === 'true';
      }
      await LS.Records.init();
      this._initGrid();
      this._seedLayoutPersistence();
      await this._initWidgets();
      this._initResponsiveWidgetMetrics();
      this._initSettingsModal();
      try {
        LS.MinigamesHub?.init?.();
      } catch (error) {
        console.warn('[LivelySam] 미니게임 허브 초기화 실패:', error);
      }
      LS.Leaderboard?.warmup?.().then(() => {
        this._refreshLeaderboardSettingsStatus();
        try {
          LS.MinigamesHub?.invalidateHallOfFameCache?.();
          LS.MinigamesHub?.render?.();
        } catch (error) {
          console.warn('[LivelySam] 미니게임 허브 갱신 실패:', error);
        }
      }).catch((error) => {
        console.warn('[LivelySam] 리더보드 초기화 실패:', error);
        this._refreshLeaderboardSettingsStatus();
      });
      this._bindGoogleAutoSync();
      this._bindGoogleSyncProgress();
      this._bindGoogleRealtimeSync();
      this._scheduleInitialGoogleSync();
      // 자동 백업
      LS.Storage.autoBackup();
      LS.Config.onChange((key, value) => {
        const shouldApplyTheme = key === '_bulk'
          ? this._bulkIncludes(value, this._themePreviewKeys)
          : this._themePreviewKeys.includes(key);

        if (shouldApplyTheme) {
          LS.Config.applyTheme();
        }
        if ([
          'grade',
          'classNum',
          'atptCode',
          'schoolCode',
          'weatherShowCurrent',
          'weatherShowDetails',
          'weatherShowHourlyForecast',
          'weatherShowDailyForecast',
          'weatherShowAirCurrent',
          'weatherShowAirHourlyForecast',
          'weatherShowAirDailyForecast',
          'weatherShowAlerts',
          'weatherShowUpdatedAt',
          'weatherShowTonightSky',
          'mealShowNutritionInfo',
          'mealCompactDayView',
          'calendarAstronomyLevel',
          'calendarAstronomyKoreaOnly',
          'googleCalendarSyncEnabled',
          'googleTasksSyncEnabled',
          'googleCalendarId',
          'googleTasklistId'
        ].includes(key) || key === '_bulk') {
          this._refreshData();
        }
        this._handleConfigChange(key, value);
      });
      LS.WallpaperEngine?.markReady?.();

      this._queueSchoolResolution();
      this._queueWeatherResolution();
      this._refreshLivelySetupNotice();
      this._refreshGoogleSyncDockButton();
      this._bindAppLifecycle();

      // 주기적 데이터 갱신 (30분)
      window.clearInterval(this._appRefreshIntervalId);
      this._appRefreshIntervalId = window.setInterval(() => this._refreshData(), 30 * 60 * 1000);

      // 첫 실행 체크
      if (!LS.Config.get('atptCode')) {
        if (this._isHostedWallpaper()) {
          this._refreshLivelySetupNotice();
        } else {
          window.clearTimeout(this._startupQuickstartTimer);
          this._startupQuickstartTimer = window.setTimeout(() => this._openSettings('quickstart'), 500);
        }
      }

      console.log('[LivelySam] 초기화 완료!');
    },

    _applyAppMetadata() {
      const versionNode = document.getElementById('app-version');
      if (versionNode) {
        versionNode.textContent = LS.VERSION;
      }
    },

    _bindAppLifecycle() {
      if (this._beforeUnloadHandler) return;
      this._beforeUnloadHandler = () => {
        this.destroy();
      };
      window.addEventListener('beforeunload', this._beforeUnloadHandler);
    },

    _initEnvironment() {
      this._syncEnvironmentClasses();

      this._debouncedSchoolResolution = LS.Helpers.debounce(() => {
        this._resolveSchoolFromConfig();
      }, 700);

      this._debouncedWeatherResolution = LS.Helpers.debounce(() => {
        this._resolveWeatherFromConfig();
      }, 700);

      this._updateViewportMetrics();
      if (!this._viewportMetricsBound) {
        this._viewportMetricsBound = true;
        this._viewportMetricsUpdater = LS.Helpers.debounce(() => {
          this._updateViewportMetrics();
          this._queueResponsiveWidgetMetrics();
        }, 80);
        this._runtimeChangedHandler = () => {
          this._syncEnvironmentClasses();
          this._updateViewportMetrics();
          this._queueResponsiveWidgetMetrics();
          this._refreshLivelySetupNotice();
        };
        window.addEventListener('resize', this._viewportMetricsUpdater, { passive: true });
        window.addEventListener('livelysam:runtimeChanged', this._runtimeChangedHandler);
      }
    },

    _syncEnvironmentClasses() {
      const isWallpaperEngine = Boolean(LS.WallpaperEngine?.isWallpaperEngine);
      document.body.classList.toggle('lively-mode', LS.Lively.isLively);
      document.body.classList.toggle('wallpaper-engine-mode', isWallpaperEngine);
      document.body.classList.toggle('browser-mode', !LS.Lively.isLively && !isWallpaperEngine);
    },

    _isHostedWallpaper() {
      return Boolean(LS.Lively.isLively || LS.WallpaperEngine?.isWallpaperEngine);
    },

    _getHostedWallpaperName() {
      if (LS.WallpaperEngine?.isWallpaperEngine) return 'Wallpaper Engine';
      if (LS.Lively.isLively) return 'Lively';
      return '';
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

    _normalizeWeatherProviderMode(value) {
      return String(value || '').trim().toLowerCase() === 'custom' ? 'custom' : 'proxy';
    },

    _getWeatherProviderModeDraft(scope = 'main') {
      const fieldId = scope === 'quick' ? 'quick-weather-mode-select' : 'weather-mode-select';
      const savedMode = typeof LS.Config.getWeatherProviderMode === 'function'
        ? LS.Config.getWeatherProviderMode()
        : 'proxy';
      return this._normalizeWeatherProviderMode(this._getFormFieldValue(fieldId, savedMode));
    },

    _getWeatherApiKeyDraft(scope = 'main') {
      const fieldId = scope === 'quick' ? 'quick-weather-key-input' : 'weather-key-input';
      const rawValue = String(this._getFormFieldValue(fieldId, LS.Config.get('weatherApiKey')) || '').trim();
      return this._getWeatherProviderModeDraft(scope) === 'custom' ? rawValue : '';
    },

    _getWeatherProviderLabel(mode = 'proxy') {
      return this._normalizeWeatherProviderMode(mode) === 'custom'
        ? '개인 OpenWeather API 키'
        : '기본 공용 날씨 서버';
    },

    _syncWeatherProviderControls() {
      const apply = (scope = 'main') => {
        const isQuick = scope === 'quick';
        const modeField = document.getElementById(isQuick ? 'quick-weather-mode-select' : 'weather-mode-select');
        const keyWrap = document.getElementById(isQuick ? 'quick-weather-key-wrap' : 'weather-key-wrap');
        const helpEl = document.getElementById(isQuick ? 'quick-weather-mode-help' : 'weather-mode-help');
        const mode = this._getWeatherProviderModeDraft(scope);
        const usesCustomKey = mode === 'custom';

        if (modeField) {
          modeField.value = mode;
        }
        if (keyWrap) {
          keyWrap.hidden = !usesCustomKey;
        }
        if (helpEl) {
          helpEl.textContent = usesCustomKey
            ? '추천: 개인 키는 이 PC에만 저장됩니다. 가장 빠르고 안정적이며 공용 서버 사용량 보호 영향 없이 직접 조회합니다.'
            : '기본 서버로 바로 시작할 수 있습니다. 다만 가장 빠르고 안정적인 사용은 개인 OpenWeather API 키를 권장합니다.';
        }
      };

      apply('main');
      apply('quick');
      this._refreshWeatherConnectionFeedback();
    },

    _handleConfigChange(key, value) {
      const shouldResolveSchool = key === '_bulk'
        ? this._bulkIncludes(value, ['schoolName']) &&
          !this._bulkIncludes(value, ['schoolCode', 'atptCode'])
        : key === 'schoolName';

      const shouldResolveWeather = key === '_bulk'
        ? this._bulkIncludes(value, ['weatherProviderMode', 'weatherApiKey', 'schoolAddress']) &&
          !this._bulkIncludes(value, ['weatherLat', 'weatherLon', 'weatherSchoolLat', 'weatherSchoolLon'])
        : ['weatherProviderMode', 'weatherApiKey', 'schoolAddress'].includes(key);

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
      const currentAtptCode = LS.Config.get('atptCode') || '';
      const currentSchoolCode = LS.Config.get('schoolCode') || '';
      const currentSignature = `${this._normalizeSchoolName(schoolName)}|${currentAtptCode}|${currentSchoolCode}`;

      if (!schoolName) {
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
      LS.NeisAPI.setApiKey((LS.Config.get('neisApiKey') || '').trim());

      try {
        const results = await LS.NeisAPI.searchSchool(schoolName);
        if (requestId !== this._schoolResolveRequestId) return;

        if (!results.length) {
          this._schoolResolveState = {
            status: 'error',
            message: '학교를 찾지 못했습니다. 학교명을 조금 더 정확하게 입력해 주세요.'
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

        this._resolvedSchoolSignature = `${this._normalizeSchoolName(nextConfig.schoolName)}|${nextConfig.atptCode}|${nextConfig.schoolCode}`;
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
          message: '학교 정보를 가져오지 못했습니다. 기본 학교 서버 상태를 확인한 뒤 다시 시도해 주세요.'
        };
        this._refreshLivelySetupNotice();
      }
    },

    async _resolveWeatherFromConfig() {
      const weatherMode = typeof LS.Config.getWeatherProviderMode === 'function'
        ? LS.Config.getWeatherProviderMode()
        : 'proxy';
      const weatherApiKey = typeof LS.Config.getWeatherApiKeyForUse === 'function'
        ? LS.Config.getWeatherApiKeyForUse()
        : (LS.Config.get('weatherApiKey') || '').trim();
      const activePreset = typeof LS.Config.getWeatherPresetConfig === 'function'
        ? LS.Config.getWeatherPresetConfig()
        : {
            key: 'school',
            label: LS.Config.get('schoolName') || '학교',
            address: (LS.Config.get('schoolAddress') || '').trim(),
            lat: LS.Config.get('weatherLat'),
            lon: LS.Config.get('weatherLon')
          };
      const providerLabel = this._getWeatherProviderLabel(weatherMode);
      const currentSignature = `${weatherMode}|${activePreset.key}|${activePreset.address}|${activePreset.lat}|${activePreset.lon}`;
      LS.WeatherAPI.setMode(weatherMode);
      LS.WeatherAPI.setApiKey(weatherApiKey);
      const hasAvailableProvider = typeof LS.WeatherAPI.hasAvailableProvider === 'function'
        ? LS.WeatherAPI.hasAvailableProvider()
        : (weatherMode === 'proxy' || Boolean(weatherApiKey));

      if (!hasAvailableProvider || !activePreset.address) {
        this._weatherResolveState = { status: 'idle', message: '' };
        this._refreshLivelySetupNotice();
        return;
      }

      if (activePreset.lat !== null && activePreset.lon !== null && currentSignature === this._resolvedWeatherSignature) {
        return;
      }

      const requestId = ++this._weatherResolveRequestId;
      this._weatherResolveState = { status: 'loading', message: '날씨 위치를 확인하는 중입니다.' };
      this._refreshLivelySetupNotice();

      try {
        const location = await LS.WeatherAPI.geocode(activePreset.address);
        if (requestId !== this._weatherResolveRequestId) return;

        if (!location) {
          this._weatherResolveState = {
            status: 'error',
            message: `주소로 날씨 위치를 찾지 못했습니다. ${providerLabel} 설정을 확인해 주세요.`
          };
          this._refreshLivelySetupNotice();
          return;
        }

        const changed = location.lat !== activePreset.lat || location.lon !== activePreset.lon;
        this._resolvedWeatherSignature = `${weatherMode}|${activePreset.key}|${activePreset.address}|${location.lat}|${location.lon}`;
        this._weatherResolveState = {
          status: 'ready',
          message: `${location.name || '선택한 주소'} 기준으로 날씨 위치를 설정했습니다.`
        };

        if (changed) {
          LS.Config.setMultiple({
            weatherLat: location.lat,
            weatherLon: location.lon,
            weatherSchoolLat: location.lat,
            weatherSchoolLon: location.lon
          });
        } else {
          this._refreshLivelySetupNotice();
        }
      } catch (e) {
        console.error('[LivelySam] 날씨 위치 자동 설정 실패:', e);
        if (requestId !== this._weatherResolveRequestId) return;
        this._weatherResolveState = {
          status: 'error',
          message: `날씨 위치를 가져오지 못했습니다. ${providerLabel} 상태를 확인해 주세요.`
        };
        this._refreshLivelySetupNotice();
      }
    },

    _refreshLivelySetupNotice() {
      const noticeEl = document.getElementById('lively-setup-notice');
      const textEl = document.getElementById('lively-setup-text');
      if (!noticeEl || !textEl) return;

      this._refreshQuickStartOverview();

      if (!this._isHostedWallpaper()) {
        noticeEl.hidden = true;
        return;
      }

      const schoolName = (LS.Config.get('schoolName') || '').trim();
      const hasSchoolCode = Boolean(LS.Config.get('atptCode') && LS.Config.get('schoolCode'));
      const weatherMode = typeof LS.Config.getWeatherProviderMode === 'function'
        ? LS.Config.getWeatherProviderMode()
        : 'proxy';
      const usesCustomWeatherKey = weatherMode === 'custom';
      const weatherApiKey = usesCustomWeatherKey
        ? (LS.Config.get('weatherApiKey') || '').trim()
        : '';
      const activeWeatherPreset = typeof LS.Config.getWeatherPresetConfig === 'function'
        ? LS.Config.getWeatherPresetConfig()
        : {
            key: 'school',
            label: LS.Config.get('schoolName') || '학교',
            address: LS.Config.get('schoolAddress') || '',
            lat: LS.Config.get('weatherLat'),
            lon: LS.Config.get('weatherLon')
          };
      const hasWeatherLocation = activeWeatherPreset.lat !== null && activeWeatherPreset.lon !== null;
      const hostName = this._getHostedWallpaperName();
      const lines = hostName === 'Wallpaper Engine'
        ? ['설정은 Wallpaper Engine의 User Properties 또는 우측 하단 설정 버튼에서 변경할 수 있습니다.']
        : ['설정은 Lively의 Customize 패널에서 변경하세요.'];
      let tone = 'info';

      if (!schoolName) {
        tone = 'error';
        lines.push('학교명을 입력하면 학교 코드를 자동으로 찾아 연결합니다.');
      } else if (!hasSchoolCode) {
        tone = this._schoolResolveState.status === 'error' ? 'error' : 'info';
        lines.push(this._schoolResolveState.message || '학교 정보를 찾는 중입니다.');
      } else if (this._schoolResolveState.status === 'warning') {
        tone = 'warning';
        lines.push(this._schoolResolveState.message);
      } else {
        lines.push(`${LS.Config.get('schoolName')} 연결이 완료되었습니다.`);
      }

      if (usesCustomWeatherKey && !weatherApiKey) {
        if (tone === 'info') {
          tone = 'warning';
        }
        lines.push('날씨를 개인 키로 사용하려면 OpenWeather API 키를 입력해 주세요.');
      } else if (!activeWeatherPreset.address && schoolName) {
        if (tone === 'info') {
          tone = 'warning';
        }
        lines.push(`${activeWeatherPreset.label || '날씨'} 주소를 연결하면 날씨도 자동으로 맞춰집니다.`);
      } else if (this._weatherConnectionState.status === 'ready' && this._weatherConnectionState.presetKey === activeWeatherPreset.key) {
        lines.push('날씨 연결이 정상적으로 확인되었습니다.');
      } else if (this._weatherConnectionState.status === 'error' && this._weatherConnectionState.presetKey === activeWeatherPreset.key) {
        if (tone === 'info') {
          tone = 'warning';
        }
        lines.push(this._weatherConnectionState.message || '실제 날씨 데이터를 불러오지 못했습니다.');
      } else if (hasWeatherLocation) {
        lines.push(`${this._getWeatherProviderLabel(weatherMode)} 기준 날씨 위치 설정이 완료되었습니다.`);
      } else if (activeWeatherPreset.address) {
        if (tone === 'info' && this._weatherResolveState.status === 'error') {
          tone = 'warning';
        }
        lines.push(this._weatherResolveState.message || '날씨 위치를 찾는 중입니다.');
      }

      const shouldShow = !hasSchoolCode ||
        this._schoolResolveState.status === 'loading' ||
        this._schoolResolveState.status === 'error' ||
        this._schoolResolveState.status === 'warning' ||
        (usesCustomWeatherKey && !weatherApiKey) ||
        (Boolean(activeWeatherPreset.address) && !hasWeatherLocation);

      if (!shouldShow) {
        noticeEl.hidden = true;
        return;
      }

      noticeEl.hidden = false;
      noticeEl.className = `lively-setup-notice is-${tone}`;
      textEl.innerHTML = lines.map(line => `<div>${LS.Helpers.escapeHtml(line)}</div>`).join('');
    },

    setWeatherConnectionState(nextState = {}) {
      this._weatherConnectionState = {
        ...this._weatherConnectionState,
        ...nextState
      };
      this._refreshWeatherConnectionFeedback();
      this._refreshQuickStartOverview();
      this._refreshLivelySetupNotice();
    },

    _refreshWeatherConnectionFeedback() {
      const statusEl = document.getElementById('weather-location-status');
      if (!statusEl) return;

      const weatherMode = this._getWeatherProviderModeDraft('main');
      const usesCustomKey = weatherMode === 'custom';
      const providerLabel = this._getWeatherProviderLabel(weatherMode);
      const weatherKeyDraft = this._getWeatherApiKeyDraft('main');
      const schoolAddressDraft = String(LS.Config.get('schoolAddress') || '').trim();
      const savedWeatherMode = typeof LS.Config.getWeatherProviderMode === 'function'
        ? LS.Config.getWeatherProviderMode()
        : 'proxy';
      const savedWeatherKey = typeof LS.Config.isWeatherUsingCustomKey === 'function' && LS.Config.isWeatherUsingCustomKey()
        ? String(LS.Config.get('weatherApiKey') || '').trim()
        : '';
      const hasDraftChanges = weatherMode !== savedWeatherMode || weatherKeyDraft !== savedWeatherKey;

      const state = this._weatherConnectionState || {};
      let tone = state.status === 'ready'
        ? 'ready'
        : state.status === 'error'
          ? 'error'
          : state.status === 'loading'
            ? 'loading'
            : 'idle';
      let stage = state.stage || 'idle';
      let message = state.message || `${providerLabel} 기준 연결 결과가 여기에 표시됩니다.`;

      if (usesCustomKey && !weatherKeyDraft) {
        tone = 'idle';
        stage = 'idle';
        message = '내 API 키 사용을 선택했습니다. OpenWeather API 키를 입력하면 이 PC에만 저장되고, 공용 서버보다 더 빠르고 안정적으로 직접 조회합니다.';
      } else if (!schoolAddressDraft) {
        tone = 'idle';
        stage = 'idle';
        message = `학교 주소가 연결되면 ${providerLabel} 기준으로 실제 날씨와 미세먼지를 확인합니다.`;
      } else if (hasDraftChanges) {
        tone = 'loading';
        stage = 'resolve';
        message = `저장 후 ${providerLabel} 기준으로 주소 확인과 실제 날씨 호출을 순서대로 진행합니다.`;
      } else if (!state.message && !usesCustomKey) {
        message = '기본 공용 서버를 사용합니다. 저장 후 실제 연결 결과가 여기에 표시됩니다.';
      }

      const steps = [
        { key: 'resolve', label: '주소/좌표 확인' },
        { key: 'fetch', label: '실제 날씨 호출' }
      ].map((step) => {
        let stepTone = 'pending';
        if (tone === 'ready') {
          stepTone = 'done';
        } else if (tone === 'error') {
          if (stage === 'fetch' && step.key === 'resolve') {
            stepTone = 'done';
          } else if (step.key === stage) {
            stepTone = 'error';
          }
        } else if (tone === 'loading') {
          if (stage === 'fetch' && step.key === 'resolve') {
            stepTone = 'done';
          } else if (step.key === stage) {
            stepTone = 'active';
          }
        }
        return `<span class="weather-connection-step is-${stepTone}">${LS.Helpers.escapeHtml(step.label)}</span>`;
      }).join('');

      const checkedAtMarkup = !hasDraftChanges && state.checkedAt
        ? `<div class="weather-connection-meta">마지막 확인 ${LS.Helpers.escapeHtml(new Date(state.checkedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }))}</div>`
        : '';

      statusEl.className = `weather-connection-status is-${tone}`;
      statusEl.innerHTML = `
        <div class="weather-connection-main">${LS.Helpers.escapeHtml(message.trim())}</div>
        <div class="weather-connection-steps">${steps}</div>
        ${checkedAtMarkup}
      `;
    },

    _isWidgetVisible(widgetId) {
      return LS.Config?.isWidgetVisible?.(widgetId) !== false;
    },

    _cloneLayout(layout = []) {
      return Array.isArray(layout) ? layout.map((item) => ({ ...item })) : [];
    },

    _serializeLayoutSignature(layout = []) {
      return JSON.stringify((Array.isArray(layout) ? layout : []).map((item) => ({
        id: String(item?.id || ''),
        x: Number(item?.x) || 0,
        y: Number(item?.y) || 0,
        w: Number(item?.w) || 1,
        h: Number(item?.h) || 1
      })));
    },

    _scaleLayoutWidthUnits(layout = [], scale = GRID_WIDTH_UNIT_SCALE) {
      const nextScale = Number(scale) || 1;
      if (nextScale === 1) {
        return this._cloneLayout(layout);
      }

      return this._cloneLayout(layout).map((item) => ({
        ...item,
        x: Math.max(0, Math.round((Number(item?.x) || 0) * nextScale)),
        w: Math.max(1, Math.round((Number(item?.w) || 1) * nextScale)),
        ...(item?.minW == null
          ? {}
          : { minW: Math.max(1, Math.round((Number(item.minW) || 1) * nextScale)) })
      }));
    },

    _ensureGridColumnStyles(columnCount = GRID_COLUMNS) {
      const normalizedCount = Math.max(1, Math.floor(Number(columnCount) || GRID_COLUMNS));
      const styleId = `${GRID_COLUMN_STYLE_ID}-${normalizedCount}`;
      let styleEl = document.getElementById(styleId);

      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = styleId;
        document.head.appendChild(styleEl);
      }

      if (styleEl.dataset.columnCount === String(normalizedCount)) {
        return styleEl;
      }

      const selectors = [
        `.grid-stack.grid-stack-${normalizedCount}`,
        `.grid-stack.gs-${normalizedCount}`
      ];
      const target = selectors.map((selector) => `${selector} > .grid-stack-item`).join(', ');
      const rules = [
        `${target} { width: calc(100% / ${normalizedCount}); min-width: calc(100% / ${normalizedCount}); }`
      ];

      for (let i = 1; i <= normalizedCount; i += 1) {
        rules.push(`${selectors[0]} > .grid-stack-item[gs-w="${i}"], ${selectors[1]} > .grid-stack-item[gs-w="${i}"] { width: calc((100% / ${normalizedCount}) * ${i}); }`);
        rules.push(`${selectors[0]} > .grid-stack-item[gs-min-w="${i}"], ${selectors[1]} > .grid-stack-item[gs-min-w="${i}"] { min-width: calc((100% / ${normalizedCount}) * ${i}); }`);
        rules.push(`${selectors[0]} > .grid-stack-item[gs-max-w="${i}"], ${selectors[1]} > .grid-stack-item[gs-max-w="${i}"] { max-width: calc((100% / ${normalizedCount}) * ${i}); }`);
        if (i < normalizedCount) {
          rules.push(`${selectors[0]} > .grid-stack-item[gs-x="${i}"], ${selectors[1]} > .grid-stack-item[gs-x="${i}"] { left: calc((100% / ${normalizedCount}) * ${i}); }`);
        }
      }

      styleEl.textContent = rules.join('\n');
      styleEl.dataset.columnCount = String(normalizedCount);
      return styleEl;
    },

    _normalizePersistedLayoutState(candidate, source = '') {
      const rawLayout = Array.isArray(candidate)
        ? candidate
        : Array.isArray(candidate?.layout)
          ? candidate.layout
          : null;

      if (!Array.isArray(rawLayout) || rawLayout.length === 0) {
        return null;
      }

      const knownWidgetIds = new Set(DEFAULT_LAYOUT.map((item) => item.id));
      const seen = new Set();
      const layout = this._cloneLayout(rawLayout).filter((item) => {
        const widgetId = String(item?.id || '');
        if (!widgetId || !knownWidgetIds.has(widgetId) || seen.has(widgetId)) {
          return false;
        }
        seen.add(widgetId);
        return true;
      });
      if (layout.length === 0) {
        return null;
      }

      const updatedValue = Array.isArray(candidate)
        ? 0
        : candidate?.updatedAt ?? candidate?.updatedAtIso ?? candidate?.savedAt ?? 0;
      const updatedAt = typeof updatedValue === 'number' && Number.isFinite(updatedValue)
        ? updatedValue
        : (() => {
            const parsed = Date.parse(String(updatedValue || ''));
            return Number.isFinite(parsed) ? parsed : 0;
          })();
      const parsedVersion = Array.isArray(candidate) ? 0 : Number(candidate?.version);
      const version = Number.isFinite(parsedVersion) ? parsedVersion : 0;

      return {
        source,
        version,
        updatedAt,
        reason: Array.isArray(candidate) ? '' : String(candidate?.reason || '').trim(),
        layout,
        widgetVisibility: candidate && !Array.isArray(candidate) && candidate.widgetVisibility && typeof candidate.widgetVisibility === 'object'
          ? { ...candidate.widgetVisibility }
          : null
      };
    },

    _isAutoGeneratedLayoutReason(reason = '') {
      const normalized = String(reason || '').trim().toLowerCase();
      if (!normalized) {
        return false;
      }
      return normalized === 'seed'
        || normalized === 'repair'
        || normalized === 'fit-layout'
        || normalized === 'fit-layout-noop'
        || normalized === 'stabilize-visibility'
        || normalized.startsWith('migrate-');
    },

    _getPersistedLayoutSourcePriority(source = '') {
      if (source === GRID_LAYOUT_STATE_STORAGE_KEY) return 3;
      if (source === GRID_LAYOUT_BACKUP_STORAGE_KEY) return 2;
      if (source === GRID_LAYOUT_STORAGE_KEY) return 1;
      return 0;
    },

    _comparePersistedLayoutCandidates(left, right) {
      const leftManual = this._isAutoGeneratedLayoutReason(left?.reason) ? 0 : 1;
      const rightManual = this._isAutoGeneratedLayoutReason(right?.reason) ? 0 : 1;
      if (rightManual !== leftManual) {
        return rightManual - leftManual;
      }

      if ((right?.updatedAt || 0) !== (left?.updatedAt || 0)) {
        return (right?.updatedAt || 0) - (left?.updatedAt || 0);
      }

      if ((right?.layout?.length || 0) !== (left?.layout?.length || 0)) {
        return (right?.layout?.length || 0) - (left?.layout?.length || 0);
      }

      if ((right?.version || 0) !== (left?.version || 0)) {
        return (right?.version || 0) - (left?.version || 0);
      }

      return this._getPersistedLayoutSourcePriority(right?.source) - this._getPersistedLayoutSourcePriority(left?.source);
    },

    _getPersistedLayoutState() {
      const candidates = [
        this._normalizePersistedLayoutState(LS.Storage.get(GRID_LAYOUT_STATE_STORAGE_KEY, null), GRID_LAYOUT_STATE_STORAGE_KEY),
        this._normalizePersistedLayoutState(LS.Storage.get(GRID_LAYOUT_BACKUP_STORAGE_KEY, null), GRID_LAYOUT_BACKUP_STORAGE_KEY),
        this._normalizePersistedLayoutState(LS.Storage.get(GRID_LAYOUT_STORAGE_KEY, null), GRID_LAYOUT_STORAGE_KEY)
      ].filter(Boolean);

      if (candidates.length === 0) {
        return null;
      }

      candidates.sort((a, b) => this._comparePersistedLayoutCandidates(a, b));

      return candidates[0];
    },

    _persistLayoutState(layout = [], options = {}) {
      const clonedLayout = this._cloneLayout(layout).filter((item) => item?.id);
      if (clonedLayout.length === 0) {
        return null;
      }

      const widgetVisibility = options.widgetVisibility && typeof options.widgetVisibility === 'object'
        ? { ...options.widgetVisibility }
        : LS.Config.getWidgetVisibility();
      const state = {
        version: GRID_LAYOUT_STATE_VERSION,
        updatedAt: Date.now(),
        updatedAtIso: new Date().toISOString(),
        reason: String(options.reason || '').trim(),
        layout: clonedLayout,
        widgetVisibility
      };

      LS.Storage.set(GRID_LAYOUT_STORAGE_KEY, clonedLayout);
      LS.Storage.set(GRID_LAYOUT_STATE_STORAGE_KEY, state);
      LS.Storage.set(GRID_LAYOUT_BACKUP_STORAGE_KEY, state);
      return state;
    },

    _seedLayoutPersistence() {
      const persisted = this._getPersistedLayoutState();
      if (persisted?.source !== GRID_LAYOUT_STORAGE_KEY && persisted?.layout?.length >= DEFAULT_LAYOUT.length) {
        return;
      }

      const layout = this.grid
        ? this._mergeVisibleLayoutIntoNormalized(this._captureCurrentVisibleGridLayout())
        : this._getNormalizedLayout();
      if (!layout.length) return;

      this._persistLayoutState(layout, {
        reason: persisted ? 'repair' : 'seed'
      });
    },

    _getGridViewportRows() {
      const appContainer = document.querySelector('.app-container');
      const rootStyles = window.getComputedStyle(document.documentElement);
      const viewportHeightValue = parseFloat(rootStyles.getPropertyValue('--ls-viewport-height')) || 0;
      const windowHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      let availableHeight = Math.max(320, viewportHeightValue || windowHeight);

      if (appContainer) {
        const appStyles = window.getComputedStyle(appContainer);
        const paddingTop = parseFloat(appStyles.paddingTop) || 0;
        const paddingBottom = parseFloat(appStyles.paddingBottom) || 0;
        const containerContentHeight = Math.max(0, appContainer.clientHeight - paddingTop - paddingBottom);
        availableHeight = Math.max(availableHeight - 10, containerContentHeight);
      } else {
        availableHeight = Math.max(320, availableHeight - 10);
      }

      const rawRows = (availableHeight + GRID_MARGIN + 2) / (GRID_CELL_HEIGHT + GRID_MARGIN);
      return Math.max(6, Math.floor(rawRows));
    },

    _getLayoutBottom(layout = []) {
      return layout.reduce((max, item) => Math.max(max, (item?.y || 0) + (item?.h || 0)), 0);
    },

    _isLayoutWithinCanvas(layout = []) {
      const rowLimit = this._getGridViewportRows();
      return layout.every((item) => {
        const x = Number(item?.x) || 0;
        const y = Number(item?.y) || 0;
        const w = Number(item?.w) || 1;
        const h = Number(item?.h) || 1;
        return x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= GRID_COLUMNS && y + h <= rowLimit;
      });
    },

    _canPlaceInCanvas(occupied, x, y, w, h, rowLimit) {
      if (x < 0 || y < 0 || w <= 0 || h <= 0) return false;
      if (x + w > GRID_COLUMNS || y + h > rowLimit) return false;

      for (let row = y; row < y + h; row += 1) {
        for (let col = x; col < x + w; col += 1) {
          if (occupied.has(`${col}:${row}`)) {
            return false;
          }
        }
      }
      return true;
    },

    _occupyCanvasCells(occupied, item) {
      const x = Number(item?.x) || 0;
      const y = Number(item?.y) || 0;
      const w = Number(item?.w) || 1;
      const h = Number(item?.h) || 1;
      for (let row = y; row < y + h; row += 1) {
        for (let col = x; col < x + w; col += 1) {
          occupied.add(`${col}:${row}`);
        }
      }
    },

    _findFirstCanvasSlot(occupied, w, h, rowLimit) {
      for (let y = 0; y <= rowLimit - h; y += 1) {
        for (let x = 0; x <= GRID_COLUMNS - w; x += 1) {
          if (this._canPlaceInCanvas(occupied, x, y, w, h, rowLimit)) {
            return { x, y };
          }
        }
      }
      return null;
    },

    _getLayoutSizeCandidates(item) {
      const minW = Math.max(1, Number(item?.minW) || 1);
      const minH = Math.max(1, Number(item?.minH) || 1);
      const currentW = Math.max(minW, Number(item?.w) || minW);
      const currentH = Math.max(minH, Number(item?.h) || minH);
      const candidates = [
        { w: Math.min(GRID_COLUMNS, currentW), h: currentH },
        { w: Math.min(GRID_COLUMNS, currentW), h: minH },
        { w: minW, h: minH }
      ];
      const seen = new Set();
      return candidates.filter((size) => {
        const key = `${size.w}x${size.h}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    },

    _fitLayoutToCanvas(layout = []) {
      const rowLimit = this._getGridViewportRows();
      const fullLayout = this._cloneLayout(layout);
      const visibleItems = fullLayout
        .filter((item) => this._isWidgetVisible(item.id))
        .sort((a, b) => (a.y - b.y) || (a.x - b.x));
      const occupied = new Set();
      const placed = new Map();

      for (const item of visibleItems) {
        const sizeCandidates = this._getLayoutSizeCandidates(item);
        let nextPlacement = null;

        for (const size of sizeCandidates) {
          const preferredX = Math.max(0, Math.min(GRID_COLUMNS - size.w, Number(item?.x) || 0));
          const preferredY = Math.max(0, Math.min(rowLimit - size.h, Number(item?.y) || 0));
          if (this._canPlaceInCanvas(occupied, preferredX, preferredY, size.w, size.h, rowLimit)) {
            nextPlacement = { ...item, x: preferredX, y: preferredY, w: size.w, h: size.h };
            break;
          }

          const found = this._findFirstCanvasSlot(occupied, size.w, size.h, rowLimit);
          if (found) {
            nextPlacement = { ...item, x: found.x, y: found.y, w: size.w, h: size.h };
            break;
          }
        }

        if (!nextPlacement) {
          return null;
        }

        this._occupyCanvasCells(occupied, nextPlacement);
        placed.set(item.id, nextPlacement);
      }

      return fullLayout.map((item) => placed.get(item.id) || { ...item });
    },

    _mergeVisibleLayoutIntoNormalized(visibleLayout = [], baseLayout = this._getNormalizedLayout()) {
      const visibleMap = new Map((visibleLayout || []).map((item) => [item.id, { ...item }]));
      return baseLayout.map((item) => {
        const next = visibleMap.get(item.id);
        return next ? { ...item, ...next } : { ...item };
      });
    },

    _captureCurrentVisibleGridLayout() {
      if (!this.grid?.getGridItems) return [];
      const baseMap = new Map(this._getNormalizedLayout().map((item) => [item.id, { ...item }]));
      return this.grid.getGridItems().map((el) => {
        const node = el.gridstackNode || {};
        const id = node.id || el.getAttribute('gs-id') || '';
        const base = baseMap.get(id) || {};
        return {
          ...base,
          id,
          x: Number(node.x) || 0,
          y: Number(node.y) || 0,
          w: Number(node.w) || 1,
          h: Number(node.h) || 1,
          minW: base.minW ?? Number(node.minW) ?? 1,
          minH: base.minH ?? Number(node.minH) ?? 1
        };
      }).sort((a, b) => (a.y - b.y) || (a.x - b.x));
    },

    _restoreVisibleGridLayout(layout = []) {
      if (!this.grid?.update || !Array.isArray(layout) || layout.length === 0) return;
      this._suppressGridChange = true;
      this.grid.batchUpdate?.();
      layout.forEach((item) => {
        const el = document.querySelector(`.grid-stack-item[gs-id="${item.id}"]`);
        if (!el) return;
        this.grid.update(el, {
          x: item.x,
          y: item.y,
          w: item.w,
          h: item.h
        });
      });
      this.grid.batchUpdate?.(false);
      this._suppressGridChange = false;
      this._queueResponsiveWidgetMetrics();
    },

    _ensureGridFitsCanvas(options = {}) {
      const currentVisibleLayout = this._captureCurrentVisibleGridLayout();
      if (currentVisibleLayout.length === 0) {
        return true;
      }

      const baseLayout = this._mergeVisibleLayoutIntoNormalized(currentVisibleLayout);
      const fittedLayout = this._fitLayoutToCanvas(baseLayout);
      if (!fittedLayout) {
        return false;
      }

      const visibleFittedLayout = fittedLayout.filter((item) => this._isWidgetVisible(item.id));
      const currentSignature = JSON.stringify(currentVisibleLayout.map(({ id, x, y, w, h }) => ({ id, x, y, w, h })));
      const fittedSignature = JSON.stringify(visibleFittedLayout.map(({ id, x, y, w, h }) => ({ id, x, y, w, h })));
      this._lastSafeVisibleLayout = this._cloneLayout(visibleFittedLayout);

      if (currentSignature === fittedSignature) {
        this._persistLayoutState(fittedLayout, { reason: 'fit-layout-noop' });
        return true;
      }

      this._persistLayoutState(fittedLayout, { reason: 'fit-layout' });

      if (options.applyLive !== false) {
        this._restoreVisibleGridLayout(visibleFittedLayout);
      }

      return true;
    },

    _captureLayoutEditOrigin() {
      const snapshot = {
        layout: this._cloneLayout(this._getNormalizedLayout()),
        widgetVisibility: LS.Config.getWidgetVisibility()
      };
      LS.Storage.set(LAYOUT_EDIT_ORIGIN_STORAGE_KEY, snapshot);
      return snapshot;
    },

    _getLayoutEditOrigin() {
      const snapshot = LS.Storage.get(LAYOUT_EDIT_ORIGIN_STORAGE_KEY, null);
      if (!snapshot || !Array.isArray(snapshot.layout)) {
        return null;
      }
      return {
        layout: this._cloneLayout(snapshot.layout),
        widgetVisibility: snapshot.widgetVisibility && typeof snapshot.widgetVisibility === 'object'
          ? { ...snapshot.widgetVisibility }
          : LS.Config.getWidgetVisibility()
      };
    },

    async _restoreLayoutEditOrigin() {
      const snapshot = this._getLayoutEditOrigin();
      if (!snapshot) {
        LS.Helpers.showToast('되돌릴 이전 배치가 없습니다.', 'info', 2200);
        return;
      }

      const confirmed = await LS.Helpers.confirmModal(
        '배치 원복',
        '편집을 시작했을 때의 배치와 위젯 표시 상태로 되돌립니다. 현재 편집 중인 변경은 취소됩니다.',
        { confirmText: '되돌리기', cancelText: '취소' }
      );
      if (!confirmed) return;

      this._persistLayoutState(this._cloneLayout(snapshot.layout), {
        reason: 'restore-layout-origin',
        widgetVisibility: snapshot.widgetVisibility
      });
      LS.Config.set('widgetVisibility', { ...snapshot.widgetVisibility });
      LS.Storage.set('layoutEditMode', true);
      this._reloadAfterStorageFlush(120);
    },

    _getNormalizedLayout() {
      const persistedState = this._getPersistedLayoutState();
      let savedLayout = persistedState?.layout || null;
      const migrationReasons = [];

      // 마이그레이션: cellHeight 80 → 40 전환 (y, h 값 2배)
      if (Array.isArray(savedLayout) && savedLayout.length && !LS.Storage.get('gridLayoutMigratedV2')) {
        savedLayout = savedLayout.map((item) => ({
          ...item,
          y: (item.y ?? 0) * 2,
          h: (item.h ?? 1) * 2
        }));
        LS.Storage.set('gridLayoutMigratedV2', true);
        migrationReasons.push('grid-v2');
      }

      if (Array.isArray(savedLayout) && savedLayout.length && (persistedState?.version || 0) < GRID_LAYOUT_STATE_VERSION) {
        savedLayout = this._scaleLayoutWidthUnits(savedLayout);
        migrationReasons.push('grid-v3-width');
      }

      if (Array.isArray(savedLayout) && savedLayout.length && migrationReasons.length) {
        this._persistLayoutState(savedLayout, { reason: `migrate-${migrationReasons.join('+')}` });
      }

      const sourceLayout = Array.isArray(savedLayout) && savedLayout.length ? savedLayout : DEFAULT_LAYOUT;
      const defaultMap = new Map(DEFAULT_LAYOUT.map((item) => [item.id, { ...item }]));
      const normalized = [];
      const seen = new Set();

      sourceLayout.forEach((item) => {
        if (!item?.id) return;
        const base = defaultMap.get(item.id) || {};
        normalized.push({
          ...base,
          ...item,
          minW: base.minW ?? item.minW ?? 1,
          minH: base.minH ?? item.minH ?? 1
        });
        seen.add(item.id);
      });

      DEFAULT_LAYOUT.forEach((item) => {
        if (!seen.has(item.id)) {
          normalized.push({ ...item });
        }
      });

      return normalized;
    },

    _initGrid() {
      const layout = this._getNormalizedLayout();
      const visibleLayout = layout.filter((item) => this._isWidgetVisible(item.id));

      // 위젯 HTML 생성
      const gridEl = document.querySelector('.grid-stack');
      if (!gridEl) return;

      this._ensureGridColumnStyles(GRID_COLUMNS);

      gridEl.innerHTML = '';

      visibleLayout.forEach(item => {
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
        column: GRID_COLUMNS,
        cellHeight: GRID_CELL_HEIGHT,
        margin: GRID_MARGIN,
        float: true,
        animate: true,
        draggable: { handle: '.widget-header' },
        resizable: { handles: 'nw,ne,se,sw' }
      });
      this._bindLayoutEditInteractions();
      this._lastSafeVisibleLayout = this._cloneLayout(visibleLayout);
      this._applyLayoutEditMode();
      this.grid.on('change', () => {
        if (this._suppressGridChange) return;
        const nextVisibleLayout = this._captureCurrentVisibleGridLayout();

        if (!this._layoutEditMode) {
          const safeVisibleLayout = this._cloneLayout(this._lastSafeVisibleLayout || []);
          if (safeVisibleLayout.length > 0) {
            const nextSignature = this._serializeLayoutSignature(nextVisibleLayout);
            const safeSignature = this._serializeLayoutSignature(safeVisibleLayout);
            if (nextSignature !== safeSignature) {
              console.warn('[LivelySam] Ignored unexpected grid change outside layout edit mode.');
              this._restoreVisibleGridLayout(safeVisibleLayout);
              return;
            }
          }
          this._lastSafeVisibleLayout = this._cloneLayout(nextVisibleLayout);
          this._queueResponsiveWidgetMetrics();
          return;
        }

        this._lastSafeVisibleLayout = this._cloneLayout(nextVisibleLayout);
        this._saveLayout();
        this._queueResponsiveWidgetMetrics();
      });
    },

    _initResponsiveWidgetMetrics() {
      this._queueResponsiveWidgetMetrics();

      if (typeof ResizeObserver === 'undefined') {
        return;
      }

      this._widgetResizeObserver?.disconnect?.();
      this._widgetResizeObserver = new ResizeObserver((entries) => {
        entries.forEach((entry) => {
          this._applyResponsiveWidgetMetrics(entry.target);
        });
      });

      document.querySelectorAll('.widget').forEach((widgetEl) => {
        this._widgetResizeObserver.observe(widgetEl);
        this._applyResponsiveWidgetMetrics(widgetEl);
      });
    },

    _queueResponsiveWidgetMetrics() {
      if (this._widgetMetricsFrame) {
        window.cancelAnimationFrame(this._widgetMetricsFrame);
      }

      this._widgetMetricsFrame = window.requestAnimationFrame(() => {
        this._widgetMetricsFrame = 0;
        document.querySelectorAll('.widget').forEach((widgetEl) => {
          this._applyResponsiveWidgetMetrics(widgetEl);
        });
      });
    },

    _applyResponsiveWidgetMetrics(widgetEl) {
      if (!widgetEl) return;

      const width = widgetEl.clientWidth || widgetEl.parentElement?.clientWidth || 320;
      const height = widgetEl.clientHeight || widgetEl.parentElement?.clientHeight || 240;
      const widgetId = widgetEl.id || '';
      const isTimetable = widgetId === 'widget-timetable';
      const isCalendar = widgetId === 'widget-calendar';
      const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
      const sizeCapActive = isTimetable || isCalendar;
      const effectiveHeight = isTimetable
        ? Math.min(height, 430)
        : isCalendar
          ? Math.min(height, 620)
          : height;
      const scaleMax = isTimetable ? 1.06 : isCalendar ? 1.1 : 1.16;
      const spaceScaleMax = isTimetable ? 1.04 : isCalendar ? 1.1 : 1.18;
      const compactScaleMax = isTimetable ? 1.04 : isCalendar ? 1.1 : 1.16;
      const scaleMin = isTimetable ? 0.94 : 0.96;
      const spaceScaleMin = isTimetable ? 0.64 : 0.92;
      const compactScaleMin = isTimetable ? 0.9 : 0.9;
      const widthMode = width < 240 ? 'xs' : width < 420 ? 'sm' : width < 760 ? 'md' : 'lg';
      const heightMode = height < 220 ? 'xs' : height < 360 ? 'sm' : height < 760 ? 'md' : 'lg';
      const scale = clamp(Math.min(width / 360, effectiveHeight / 290), scaleMin, sizeCapActive ? scaleMax : 1.16);
      const spaceScale = clamp(Math.min(width / 360, effectiveHeight / 280), spaceScaleMin, sizeCapActive ? spaceScaleMax : 1.18);
      const compactScale = clamp(Math.min(width / 340, effectiveHeight / 250), compactScaleMin, sizeCapActive ? compactScaleMax : 1.16);
      const rowHeight = isTimetable
        ? Math.round(clamp(((effectiveHeight - 134) / 7) * 1.1, 34, 40))
        : Math.round(clamp((effectiveHeight - 150) / 7, 56, 86));
      const headerHeight = Math.round(clamp(rowHeight * (isTimetable ? 0.94 : 0.82), isTimetable ? 32 : 50, isTimetable ? 37 : 68));
      const calendarCellHeight = Math.round(clamp((effectiveHeight - 176) / 5, 54, 77));
      const calendarWeekHeight = Math.round(clamp(calendarCellHeight * 1.8, 96, 139));

      widgetEl.style.setProperty('--widget-scale', scale.toFixed(3));
      widgetEl.style.setProperty('--widget-space-scale', spaceScale.toFixed(3));
      widgetEl.style.setProperty('--widget-compact-scale', compactScale.toFixed(3));
      widgetEl.style.setProperty('--widget-table-header-height', `${headerHeight}px`);
      widgetEl.style.setProperty('--widget-table-row-height', `${rowHeight}px`);
      widgetEl.style.setProperty('--widget-calendar-cell-height', `${calendarCellHeight}px`);
      widgetEl.style.setProperty('--widget-calendar-week-height', `${calendarWeekHeight}px`);
      widgetEl.dataset.widthMode = widthMode;
      widgetEl.dataset.heightMode = heightMode;
    },

    _saveLayout() {
      const items = this.grid.getGridItems();
      const currentNodes = new Map(items.map((el) => {
        const node = el.gridstackNode;
        return [node.id || el.getAttribute('gs-id'), {
          x: node.x,
          y: node.y,
          w: node.w,
          h: node.h
        }];
      }));

      const layout = this._getNormalizedLayout().map((item) => {
        const current = currentNodes.get(item.id);
        if (!current) return { ...item };
        return {
          ...item,
          x: current.x,
          y: current.y,
          w: current.w,
          h: current.h
        };
      });
      this._persistLayoutState(layout, { reason: 'grid-change' });
      return true;
    },

    _reloadAfterStorageFlush(delay = 0) {
      const safeDelay = Math.max(0, Number(delay) || 0);
      const scheduleReload = () => {
        window.setTimeout(() => location.reload(), safeDelay);
      };

      try {
        const pending = LS.Storage.flushPending?.();
        if (pending && typeof pending.then === 'function') {
          void pending.catch((error) => {
            console.warn('[LivelySam] Storage flush before reload failed:', error);
          }).finally(scheduleReload);
          return;
        }
      } catch (error) {
        console.warn('[LivelySam] Storage flush before reload threw:', error);
      }

      scheduleReload();
    },

    resetLayout() {
      LS.Storage.remove(GRID_LAYOUT_STORAGE_KEY);
      LS.Storage.remove(GRID_LAYOUT_STATE_STORAGE_KEY);
      LS.Storage.remove(GRID_LAYOUT_BACKUP_STORAGE_KEY);
      LS.Storage.remove(LAYOUT_EDIT_ORIGIN_STORAGE_KEY);
      this._reloadAfterStorageFlush();
    },

    _bindLayoutEditInteractions() {
      const surfaceEl = document.querySelector('.app-container');
      if (!surfaceEl || surfaceEl.dataset.layoutEditBound === '1') return;

      surfaceEl.dataset.layoutEditBound = '1';

      surfaceEl.addEventListener('pointerdown', (event) => {
        if (event.target.closest('.widget-action-btn')) {
          event.stopPropagation();
        }
      }, true);

      surfaceEl.addEventListener('click', (event) => {
        const closeButton = event.target.closest('[data-widget-close]');
        if (closeButton) {
          event.preventDefault();
          event.stopPropagation();
          this._closeWidgetFromLayoutEdit(closeButton.dataset.widgetClose || '');
          return;
        }

        if (!this._layoutEditMode) return;
        if (document.body.classList.contains('prompt-open') || document.body.classList.contains('settings-open')) return;
        if (event.target.closest('#floating-action-stack, #settings-modal, #prompt-modal, .ls-toast-wrap')) return;
        if (event.target.closest('.grid-stack-item')) return;
        void this._openHiddenWidgetPicker();
      });
    },

    _getWidgetMeta(widgetId) {
      return WIDGET_META[widgetId] || { title: widgetId, icon: '' };
    },

    _syncWidgetVisibilityField(widgetId, visible) {
      const entry = WIDGET_VISIBILITY_FIELDS.find(([id]) => id === widgetId);
      if (!entry) return;

      const field = document.getElementById(entry[1]);
      if (field) {
        field.checked = Boolean(visible);
      }
    },

    _stabilizePersistedWidgetVisibility() {
      const savedLayout = this._getPersistedLayoutState()?.layout || null;
      if (!Array.isArray(savedLayout) || savedLayout.length === 0) {
        return;
      }

      const layoutIds = new Set(savedLayout.map((item) => String(item?.id || '')).filter(Boolean));
      const initialVisibilityKeys = new Set(LS.Config.getInitialWidgetVisibilityKeys?.() || []);
      const currentVisibility = LS.Config.getWidgetVisibility();
      const nextVisibility = { ...currentVisibility };
      let changed = false;

      WIDGET_VISIBILITY_FIELDS.forEach(([widgetId]) => {
        if (layoutIds.has(widgetId)) return;
        if (initialVisibilityKeys.has(widgetId)) return;
        if (nextVisibility[widgetId] === false) return;
        nextVisibility[widgetId] = false;
        changed = true;
      });

      if (changed) {
        LS.Config.set('widgetVisibility', nextVisibility);
        this._persistLayoutState(savedLayout, {
          reason: 'stabilize-visibility',
          widgetVisibility: nextVisibility
        });
      }
    },

    _setWidgetVisibility(widgetId, visible, options = {}) {
      const currentVisibility = LS.Config.getWidgetVisibility();
      if (!Object.prototype.hasOwnProperty.call(currentVisibility, widgetId)) {
        return false;
      }

      const nextVisible = Boolean(visible);
      const wasVisible = currentVisibility[widgetId] !== false;
      if (wasVisible === nextVisible) {
        return false;
      }

      currentVisibility[widgetId] = nextVisible;
      this._syncWidgetVisibilityField(widgetId, nextVisible);
      LS.Config.set('widgetVisibility', currentVisibility);
      this._persistLayoutState(
        this.grid
          ? this._mergeVisibleLayoutIntoNormalized(this._captureCurrentVisibleGridLayout())
          : this._getNormalizedLayout(),
        {
          reason: nextVisible ? 'widget-show' : 'widget-hide',
          widgetVisibility: currentVisibility
        }
      );
      this._refreshQuickStartOverview();
      this._refreshWidgetSettingsSummary();
      this._renderSettingsPanelIntro();
      this._setSettingsSaveState('saved', '위젯 표시 저장됨');

      if (options.toastMessage) {
        LS.Helpers.showToast(options.toastMessage, options.toastTone || (nextVisible ? 'success' : 'info'), options.toastDuration || 2200);
      }

      if (options.reload !== false) {
        LS.Storage.set('layoutEditMode', this._layoutEditMode);
        this._reloadAfterStorageFlush(options.reloadDelay || 180);
      }

      return true;
    },

    _getHiddenWidgetPickerOptions() {
      const visibility = LS.Config.getWidgetVisibility();
      return WIDGET_VISIBILITY_FIELDS
        .filter(([widgetId]) => visibility[widgetId] === false)
        .map(([widgetId]) => {
          const meta = this._getWidgetMeta(widgetId);
          return {
            value: widgetId,
            text: `${meta.icon} ${meta.title}`.trim()
          };
        });
    },

    _closeWidgetFromLayoutEdit(widgetId) {
      if (!this._layoutEditMode || !widgetId) return;

      const meta = this._getWidgetMeta(widgetId);
      this._setWidgetVisibility(widgetId, false, {
        toastMessage: `${meta.title} 위젯을 숨기고 편집 화면을 다시 불러옵니다.`,
        toastTone: 'info'
      });
    },

    _showHiddenWidgetOnCanvas(widgetId) {
      if (!widgetId) return false;

      const baseLayout = this._mergeVisibleLayoutIntoNormalized(this._captureCurrentVisibleGridLayout());
      const baseItem = baseLayout.find((item) => item.id === widgetId);
      if (!baseItem) return false;
      const defaultItem = DEFAULT_LAYOUT.find((item) => item.id === widgetId) || baseItem;

      const nextLayout = baseLayout.map((item) => item.id === widgetId
        ? {
            ...item,
            x: defaultItem.x,
            y: defaultItem.y,
            w: Math.max(Number(item.minW) || 1, Number(defaultItem.w) || Number(item.w) || 1),
            h: Math.max(Number(item.minH) || 1, Number(defaultItem.h) || Number(item.h) || 1)
          }
        : { ...item });
      const meta = this._getWidgetMeta(widgetId);

      this._persistLayoutState(nextLayout, { reason: 'show-hidden-widget' });
      this._setWidgetVisibility(widgetId, true, {
        reload: false,
        toastMessage: `${meta.title} 위젯을 기본 위치로 다시 열었습니다.`,
        toastTone: 'success'
      });
      LS.Storage.set('layoutEditMode', this._layoutEditMode);
      this._reloadAfterStorageFlush(160);
      return true;
    },

    async _openHiddenWidgetPicker() {
      const hiddenWidgetOptions = this._getHiddenWidgetPickerOptions();
      if (hiddenWidgetOptions.length === 0) {
        LS.Helpers.showToast('현재 숨겨진 위젯이 없습니다.', 'info', 2200);
        return;
      }

      const result = await LS.Helpers.promptModal('숨겨진 위젯 열기', [
        {
          id: 'widgetId',
          label: '다시 열 위젯',
          type: 'select',
          value: hiddenWidgetOptions[0].value,
          options: hiddenWidgetOptions
        }
      ], {
        message: '편집모드에서는 빈 공간을 클릭해서 현재 숨겨진 위젯을 기본 위치로 다시 열 수 있습니다.',
        confirmText: '열기'
      });

      const widgetId = result?.widgetId || '';
      if (!widgetId) return;
      this._showHiddenWidgetOnCanvas(widgetId);
    },

    _applyLayoutEditMode() {
      const isEditing = Boolean(this._layoutEditMode);
      document.body.classList.toggle('layout-edit-mode', isEditing);

      if (this.grid?.setStatic) {
        this.grid.setStatic(!isEditing);
      }

      const button = document.getElementById('layout-mode-btn');
      if (button) {
        button.classList.toggle('is-active', isEditing);
        button.textContent = isEditing ? '완료' : '배치';
        button.title = isEditing ? '배치 편집 종료' : '배치 편집 시작';
        button.setAttribute('aria-label', button.title);
      }

      const revertButton = document.getElementById('layout-revert-btn');
      if (revertButton) {
        revertButton.hidden = !isEditing || !this._getLayoutEditOrigin();
      }

      const gridEl = document.querySelector('.grid-stack');
      if (gridEl) {
        gridEl.title = isEditing ? '빈 공간을 클릭하면 숨겨진 위젯을 기본 위치로 다시 열 수 있습니다.' : '';
      }
    },

    _toggleLayoutEditMode(forceState) {
      const nextState = typeof forceState === 'boolean' ? forceState : !this._layoutEditMode;
      if (nextState && !this._layoutEditMode) {
        this._captureLayoutEditOrigin();
        this._lastSafeVisibleLayout = this._cloneLayout(this._captureCurrentVisibleGridLayout());
      }
      this._layoutEditMode = nextState;
      LS.Storage.set('layoutEditMode', nextState);
      this._applyLayoutEditMode();
      LS.Helpers.showToast(
        nextState ? '배치 편집 모드를 켰습니다. 위젯을 자유롭게 옮기고 크기를 조절할 수 있으며, 빈 공간을 클릭하면 숨겨진 위젯을 기본 위치로 다시 열 수 있습니다.' : '배치 편집 모드를 종료했습니다.',
        'info',
        3200
      );
    },

    _getWidgetHTML(id) {
      const widgets = {
        clock: {
          body: `
            <div class="clock-widget-inner">
              <div class="clock-analog-wrap">
                <canvas id="clock-analog" width="140" height="140"></canvas>
              </div>
              <div class="clock-digital-wrap">
                <div id="clock-digital" class="clock-digital">00:00:00</div>
                <div class="clock-date-row">
                  <div id="clock-date" class="clock-date"></div>
                  <div id="clock-moon" class="clock-moon-badge" title="달 위상">
                    <canvas id="clock-moon-canvas" class="clock-moon-canvas" width="64" height="64" aria-hidden="true"></canvas>
                  </div>
                </div>
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
          headerExtra: '<span id="timetable-header-info" class="widget-header-info"></span>',
          actions: '<button class="widget-action-btn" onclick="LivelySam.TimetableWidget.refresh()" title="새로고침">↻</button>',
          body: '<div id="timetable-content" class="timetable-content"></div>'
        },
        calendar: {
          actions: '<button class="widget-action-btn" onclick="LivelySam.App.syncGoogleWorkspace()" title="Google 동기화">↻</button><button id="cal-add-event" class="widget-action-btn" title="일정 추가">＋</button>',
          body: `
            <div class="cal-nav">
              <button id="cal-prev" class="cal-nav-btn">‹</button>
              <span id="cal-title" class="cal-title"></span>
              <div id="cal-view" class="cal-view-mode"></div>
              <button id="cal-next" class="cal-nav-btn">›</button>
              <button id="cal-today" class="cal-today-btn">오늘</button>
            </div>
            <div id="cal-grid" class="cal-grid"></div>
            <div id="cal-events" class="cal-events"></div>`
        },
        weather: {
          actions: '<button class="widget-action-btn" onclick="LivelySam.WeatherWidget.update()" title="새로고침">↻</button>',
          body: '<div id="weather-content" class="weather-content"></div>'
        },
        meal: {
          actions: '<button class="widget-action-btn" onclick="LivelySam.MealWidget.refresh()" title="새로고침">↻</button>',
          body: `
            <div class="meal-tabs">
              <button class="meal-tab-btn active" data-view="today">오늘</button>
              <button class="meal-tab-btn" data-view="tomorrow">내일</button>
              <button class="meal-tab-btn" data-view="week">이번 주</button>
            </div>
            <div id="meal-content" class="meal-content"></div>`
        },
        timer: {
          body: `
            <div class="timer-widget-inner" id="timer-widget-inner" data-mode="timer" data-running="false">
              <div class="timer-primary">
                <div id="timer-state" class="timer-state">타이머</div>
                <div id="timer-display" class="timer-display">00:00</div>
              </div>
              <div class="timer-controls" role="group" aria-label="타이머 및 스탑워치 컨트롤">
                <button id="timer-start" class="timer-btn timer-btn-primary" type="button" title="타이머 시작" aria-label="타이머 시작">
                  <span class="timer-btn-icon" aria-hidden="true">▶</span>
                  <span class="timer-btn-label">시작</span>
                </button>
                <button id="timer-action" class="timer-btn" type="button" title="타이머 설정" aria-label="타이머 설정">
                  <span class="timer-btn-icon" aria-hidden="true">⏲</span>
                  <span class="timer-btn-label">설정</span>
                </button>
                <button id="timer-reset" class="timer-btn" type="button" title="타이머 초기화" aria-label="타이머 초기화">
                  <span class="timer-btn-icon" aria-hidden="true">↺</span>
                  <span class="timer-btn-label">초기화</span>
                </button>
                <button id="timer-mode" class="timer-btn" type="button" title="스탑워치로 전환" aria-label="스탑워치로 전환">
                  <span class="timer-btn-icon" aria-hidden="true">⏱</span>
                  <span class="timer-btn-label">전환</span>
                </button>
              </div>
            </div>`
        },
        dday: {
          actions: '<button id="dday-add" class="widget-action-btn" title="D-Day 추가">＋</button>',
          body: '<div id="dday-content" class="dday-content"></div>'
        },
        memo: {
          actions: '<button class="widget-action-btn" onclick="LivelySam.MemoWidget.addMemo()" title="메모 추가">＋</button>',
          body: '<div id="memo-content" class="memo-content"></div>'
        },
        todo: {
          actions: '<button class="widget-action-btn" onclick="LivelySam.App.syncGoogleWorkspace()" title="Google 동기화">↻</button><button class="widget-action-btn" onclick="LivelySam.TodoWidget.addTodo()" title="할 일 추가">＋</button>',
          body: '<div id="todo-content" class="todo-content"></div>'
        },
        bookmarks: {
          actions: '<button class="widget-action-btn" onclick="LivelySam.BookmarksWidget.addBookmark()" title="즐겨찾기 추가">＋</button>',
          body: '<div id="bookmarks-content" class="bm-content"></div>'
        },
        shortcuts: {
          actions: '<button class="widget-action-btn" onclick="LivelySam.ShortcutsWidget.addShortcut()" title="바로가기 추가">＋</button>',
          body: '<div id="shortcuts-content" class="shortcuts-content"></div>'
        }
      };

      const w = widgets[id];
      if (!w) return '';
      const meta = this._getWidgetMeta(id);

      return `
        <div class="widget" id="widget-${id}">
          <div class="widget-header">
            <span class="widget-title">${meta.title}</span>
            ${w.headerExtra || ''}
            <div class="widget-actions">
              ${w.actions || ''}
              <button class="widget-action-btn widget-edit-close-btn" data-widget-close="${id}" title="${meta.title} 위젯 숨기기" aria-label="${meta.title} 위젯 숨기기">✕</button>
            </div>
          </div>
          <div class="widget-body">${w.body}</div>
        </div>`;
    },

    async _initWidgets() {
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
      await LS.ShortcutsWidget.init();
    },

    async _refreshData() {
      return this._refreshDataWithOptions();
    },

    async _refreshDataWithOptions(options = {}) {
      console.log('[LivelySam] 데이터 갱신...');
      try {
        if (options.syncGoogle !== false) {
          await this._runGoogleSync({
            interactive: Boolean(options.interactive),
            silent: options.silent !== false
          });
        }
        await Promise.all([
          LS.TimetableWidget.refresh(),
          LS.MealWidget.refresh(),
          LS.WeatherWidget.update(),
          LS.CalendarWidget.refresh()
        ]);
        LS.TodoWidget.render();
      } catch (e) {
        console.error('[LivelySam] 데이터 갱신 실패:', e);
      }
    },

    _bindGoogleAutoSync() {
      if (this._googleAutoSyncBound) return;
      this._googleAutoSyncBound = true;

      this._googleRecordsChangedHandler = () => {
        this._scheduleGoogleAutoSync();
      };
      this._googleSyncChangedHandler = () => {
        this._refreshGoogleSettingsStatus();
        this._refreshGoogleSyncDockButton();
      };

      window.addEventListener('livelysam:recordsChanged', this._googleRecordsChangedHandler);
      window.addEventListener('livelysam:googleSyncChanged', this._googleSyncChangedHandler);
    },

    _scheduleGoogleAutoSync() {
      if (!LS.GoogleWorkspace?.sync) return;
      window.clearTimeout(this._googleAutoSyncTimer);
      this._googleAutoSyncTimer = window.setTimeout(async () => {
        if (Date.now() < this._googleSyncSuppressUntil) return;
        if (!LS.Config.get('googleCalendarSyncEnabled') && !LS.Config.get('googleTasksSyncEnabled')) return;

        const status = LS.GoogleWorkspace.getStatus?.() || {};
        if (!status.calendarEnabled && !status.tasksEnabled) {
          this._refreshGoogleSyncDockButton();
          return;
        }
        if (!status.connected && !status.hasRefreshToken) {
          this._refreshGoogleSyncDockButton();
          return;
        }

        try {
          await this._runGoogleSync({ interactive: false, silent: true });
        } catch (error) {
          console.warn('[LivelySam] 자동 Google 동기화 실패:', error);
        }
      }, GOOGLE_LOCAL_SYNC_DELAY_MS);
    },

    _bindGoogleSyncProgress() {
      if (this._googleProgressBound) return;
      this._googleProgressBound = true;

      this._googleProgressHandler = (event) => {
        const cached = LS.GoogleWorkspace?.getCachedDiagnostics?.() || {};
        const detail = event?.detail && typeof event.detail === 'object'
          ? event.detail
          : null;
        const previous = this._lastGoogleDiagnostics || {};
        this._lastGoogleDiagnostics = {
          ...previous,
          ...cached,
          debug: detail || cached.debug || previous.debug || null
        };
        this._refreshGoogleSettingsStatus();
        this._refreshGoogleSyncDockButton();
      };

      window.addEventListener('livelysam:googleSyncProgress', this._googleProgressHandler);
    },

    _bindGoogleRealtimeSync() {
      if (this._googleRealtimeSyncBound) return;
      this._googleRealtimeSyncBound = true;

      const scheduleVisibleSync = (reason, minAgeMs, delayMs) => {
        if (document.visibilityState === 'hidden') return;
        this._scheduleGooglePassiveSync({ reason, minAgeMs, delayMs });
      };

      this._googleFocusSyncHandler = () => {
        scheduleVisibleSync('focus', GOOGLE_FOCUS_SYNC_STALE_MS, 350);
      };
      this._googleOnlineSyncHandler = () => {
        scheduleVisibleSync('online', GOOGLE_FOCUS_SYNC_STALE_MS, 800);
      };
      this._googleVisibilitySyncHandler = () => {
        if (document.visibilityState !== 'visible') return;
        scheduleVisibleSync('visible', GOOGLE_FOCUS_SYNC_STALE_MS, 500);
      };

      window.addEventListener('focus', this._googleFocusSyncHandler);
      window.addEventListener('online', this._googleOnlineSyncHandler);
      document.addEventListener('visibilitychange', this._googleVisibilitySyncHandler);

      this._googleRealtimeSyncIntervalId = window.setInterval(() => {
        scheduleVisibleSync('poll', GOOGLE_REALTIME_SYNC_STALE_MS, 0);
      }, GOOGLE_REALTIME_SYNC_INTERVAL_MS);
    },

    _shouldRunGooglePassiveSync(minAgeMs = GOOGLE_REALTIME_SYNC_STALE_MS) {
      if (!LS.GoogleWorkspace?.sync) return false;
      if (this._googleSyncPromise) return false;
      if (Date.now() < this._googleSyncSuppressUntil) return false;
      if (!LS.Config.get('googleCalendarSyncEnabled') && !LS.Config.get('googleTasksSyncEnabled')) return false;
      if (document.visibilityState === 'hidden') return false;

      const status = LS.GoogleWorkspace.getStatus?.() || {};
      if (!status.calendarEnabled && !status.tasksEnabled) {
        return false;
      }
      if (!status.connected && !status.hasRefreshToken) {
        return false;
      }

      const lastSyncAt = Date.parse(status.lastSyncAt || '');
      return !Number.isFinite(lastSyncAt) || (Date.now() - lastSyncAt) >= Math.max(0, Number(minAgeMs) || 0);
    },

    _scheduleGooglePassiveSync(options = {}) {
      if (!this._shouldRunGooglePassiveSync(options.minAgeMs)) {
        return;
      }

      window.clearTimeout(this._googlePassiveSyncTimer);
      this._googlePassiveSyncTimer = window.setTimeout(async () => {
        if (!this._shouldRunGooglePassiveSync(options.minAgeMs)) {
          return;
        }

        try {
          await this._runGoogleSync({ interactive: false, silent: true });
        } catch (error) {
          console.warn(`[LivelySam] 자동 Google 가져오기 실패 (${options.reason || 'poll'}):`, error);
        }
      }, Math.max(0, Number(options.delayMs) || 0));
    },

    _scheduleInitialGoogleSync() {
      if (!LS.GoogleWorkspace?.sync) return;
      window.clearTimeout(this._googleInitialSyncTimer);
      this._googleInitialSyncTimer = window.setTimeout(async () => {
        const status = LS.GoogleWorkspace.getStatus?.() || {};
        if (!status.connected && !status.hasRefreshToken) return;
        if (!LS.Config.get('googleCalendarSyncEnabled') && !LS.Config.get('googleTasksSyncEnabled')) return;

        const lastSyncAt = Date.parse(status.lastSyncAt || '');
        const hasData = Number(status.calendarCount || 0) > 0 || Number(status.taskCount || 0) > 0;
        const isStale = !Number.isFinite(lastSyncAt) || (Date.now() - lastSyncAt) > (10 * 60 * 1000);
        if (!isStale && hasData) return;

        try {
          await this._runGoogleSync({ interactive: false, silent: true });
          await this._refreshDataWithOptions({ syncGoogle: false });
        } catch (error) {
          console.warn('[LivelySam] 초기 Google 동기화 실패:', error);
        }
      }, 1800);
    },

    async _runGoogleSync(options = {}) {
      if (!LS.GoogleWorkspace?.sync) {
        return LS.GoogleWorkspace?.getStatus?.() || {};
      }
      if (this._googleSyncPromise) {
        return this._googleSyncPromise;
      }

      this._googleSyncSuppressUntil = Date.now() + 1800;
      this._lastGoogleDiagnostics = this._getGoogleDiagnosticsSnapshot();
      this._refreshGoogleSettingsStatus();
      this._refreshGoogleSyncDockButton();
      let syncTask = null;
      syncTask = (async () => {
        try {
          return await LS.GoogleWorkspace.sync({
            interactive: Boolean(options.interactive),
            silent: Boolean(options.silent)
          });
        } finally {
          this._googleSyncSuppressUntil = Date.now() + 1800;
          if (this._googleSyncPromise === syncTask) {
            this._googleSyncPromise = null;
          }
          this._refreshGoogleSettingsStatus();
          this._refreshGoogleSyncDockButton();
        }
      })();

      this._googleSyncPromise = syncTask;
      this._refreshGoogleSyncDockButton();
      return syncTask;
    },

    /* ?? ?ㅼ젙 紐⑤떖 ?? */
    _initSettingsModal() {
      this._mountSettingsModal();
      const settingsBtn = this._ensureSettingsButton();
      this._ensureFloatingActionDock();
      settingsBtn.onclick = () => this._openSettings();
      document.getElementById('settings-close')?.addEventListener('click', () => {
        void this._requestSettingsClose('close');
      });
      document.getElementById('settings-cancel')?.addEventListener('click', () => {
        void this._requestSettingsClose('cancel');
      });

      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && document.getElementById('settings-modal')?.classList.contains('active')) {
          if (document.getElementById('prompt-modal')?.classList.contains('active')) return;
          event.preventDefault();
          void this._requestSettingsClose('escape');
        }
      });

      // 구버전 horizontal tabs + 신규 sidebar nav 모두 지원
      document.querySelectorAll('.settings-tab-btn, .settings-nav-item').forEach((btn) => {
        btn.addEventListener('click', (event) => {
          this._setActiveSettingsTab(event.currentTarget.dataset.tab);
        });
      });
      // 설정 검색 바인딩
      this._bindSettingsSearch();
      // intro 버튼(칩/액션)은 이제 .settings-content-head 안에 있음
      const headEl = document.querySelector('.settings-content-head');
      if (headEl && headEl.dataset.bound !== '1') {
        headEl.dataset.bound = '1';
        headEl.addEventListener('click', (event) => {
          const button = event.target.closest('[data-intro-target-tab]');
          if (!button) return;
          const targetTab = button.dataset.introTargetTab;
          const widgetFocus = button.dataset.widgetFocus;
          if (!targetTab) return;
          this._setActiveSettingsTab(targetTab);
          if (targetTab === 'widgets' && widgetFocus) {
            window.requestAnimationFrame(() => this._focusWidgetSettingsSection(widgetFocus));
          }
        });
      }

      document.getElementById('school-search-btn')?.addEventListener('click', () => this._searchSchool());
      document.getElementById('school-name-input')?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') this._searchSchool();
      });
      document.getElementById('quick-school-search-btn')?.addEventListener('click', () => this._searchSchool({
        inputId: 'quick-school-name-input',
        resultBoxId: 'quickstart-school-results',
        infoId: 'quickstart-school-display'
      }));
      document.getElementById('quick-school-name-input')?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          this._searchSchool({
            inputId: 'quick-school-name-input',
            resultBoxId: 'quickstart-school-results',
            infoId: 'quickstart-school-display'
          });
        }
      });
      [
        ['neis-guide-btn', 'neis'],
        ['quick-neis-guide-btn', 'neis'],
        ['weather-guide-btn', 'weather'],
        ['quick-weather-guide-btn', 'weather']
      ].forEach(([id, type]) => {
        document.getElementById(id)?.addEventListener('click', () => this._openApiGuide(type));
      });
      [
        ['neis-site-btn', 'https://open.neis.go.kr'],
        ['quick-neis-site-btn', 'https://open.neis.go.kr'],
        ['weather-site-btn', 'https://openweathermap.org/api'],
        ['quick-weather-site-btn', 'https://openweathermap.org/api']
      ].forEach(([id, url]) => {
        document.getElementById(id)?.addEventListener('click', () => this._openExternalUrl(url));
      });
      document.getElementById('google-guide-btn')?.addEventListener('click', () => this._openGoogleGuide());
      document.getElementById('google-console-btn')?.addEventListener('click', () => this._openExternalUrl('https://console.cloud.google.com/apis/credentials'));
      document.getElementById('google-connect-btn')?.addEventListener('click', () => this._connectGoogleWorkspace());
      document.getElementById('google-sync-btn')?.addEventListener('click', () => this._syncGoogleWorkspace());
      document.getElementById('google-disconnect-btn')?.addEventListener('click', () => this._disconnectGoogleWorkspace());
      document.getElementById('google-refresh-btn')?.addEventListener('click', () => this._reloadGoogleSettingsStatus({ toast: true }));
      document.getElementById('google-test-btn')?.addEventListener('click', () => this._runGoogleWorkspaceTest());
      document.getElementById('google-cleanup-btn')?.addEventListener('click', () => this._cleanupGoogleDuplicates());
      document.getElementById('google-config-file-btn')?.addEventListener('click', () => this._openGoogleLocalTarget('config'));
      document.getElementById('google-data-folder-btn')?.addEventListener('click', () => this._openGoogleLocalTarget('data'));
      document.getElementById('google-debug-btn')?.addEventListener('click', () => this._showGoogleDiagnostics());
      document.querySelectorAll('#settings-modal [data-copy-text]').forEach((button) => {
        if (button.dataset.copyBound === '1') return;
        button.dataset.copyBound = '1';
        button.addEventListener('click', async (event) => {
          const copyTarget = event.currentTarget;
          const text = String(copyTarget.dataset.copyText || '').trim();
          if (!text) return;
          const copied = await this._copyTextToClipboard(text);
          LS.Helpers.showToast(
            copied ? '버그 신고 메일 주소를 복사했습니다.' : `메일 주소: ${text}`,
            copied ? 'success' : 'warning',
            copied ? 2200 : 3600
          );
        });
      });
      document.getElementById('firebase-guide-btn')?.addEventListener('click', () => this._openExternalUrl('https://firebase.google.com/docs/web/setup'));
      document.getElementById('firebase-console-btn')?.addEventListener('click', () => this._openExternalUrl('https://console.firebase.google.com/'));

      document.getElementById('settings-save')?.addEventListener('click', () => this._saveSettings());
      document.getElementById('quickstart-save-btn')?.addEventListener('click', () => this._saveSettings());
      document.getElementById('reset-layout-btn')?.addEventListener('click', () => this.resetLayout());
      document.getElementById('export-btn')?.addEventListener('click', () => this._exportData());
      document.getElementById('import-btn')?.addEventListener('click', () => this._importData());
      document.getElementById('profile-select')?.addEventListener('change', (event) => this._switchProfile(event.currentTarget.value));
      document.getElementById('profile-new-btn')?.addEventListener('click', () => this._createProfile());
      document.getElementById('profile-rename-btn')?.addEventListener('click', () => this._renameProfile());
      document.getElementById('profile-delete-btn')?.addEventListener('click', () => this._deleteProfile());
      document.getElementById('download-timetable-template-btn')?.addEventListener('click', () => this._downloadTeacherTimetableTemplate());
      document.getElementById('upload-timetable-btn')?.addEventListener('click', () => this._importTeacherTimetableExcel());
      document.getElementById('quickstart-download-template-btn')?.addEventListener('click', () => this._downloadTeacherTimetableTemplate());
      document.getElementById('quickstart-upload-timetable-btn')?.addEventListener('click', () => this._importTeacherTimetableExcel());
      document.getElementById('homeroom-role-select')?.addEventListener('change', (event) => {
        const nextValue = event.currentTarget.value || 'homeroom';
        const quickRoleEl = document.getElementById('quick-homeroom-role-select');
        if (quickRoleEl) quickRoleEl.value = nextValue;
        this._syncTeacherRoleUI(nextValue);
        this._refreshQuickStartOverview();
      });
      document.getElementById('quick-homeroom-role-select')?.addEventListener('change', (event) => {
        const nextValue = event.currentTarget.value || 'homeroom';
        const roleEl = document.getElementById('homeroom-role-select');
        if (roleEl) roleEl.value = nextValue;
        this._syncTeacherRoleUI(nextValue);
        this._refreshQuickStartOverview();
      });
      document.getElementById('class-preset-select')?.addEventListener('change', (event) => {
        const nextValue = event.currentTarget.value || '';
        const quickClassEl = document.getElementById('quick-class-preset-select');
        if (quickClassEl) quickClassEl.value = nextValue;
        if (/^\d+$/.test(String(nextValue))) {
          const classInputEl = document.getElementById('class-input');
          const quickInputEl = document.getElementById('quick-class-input');
          if (classInputEl) classInputEl.value = nextValue;
          if (quickInputEl) quickInputEl.value = nextValue;
        } else {
          const classInputEl = document.getElementById('class-input');
          const quickInputEl = document.getElementById('quick-class-input');
          if (classInputEl) classInputEl.value = '';
          if (quickInputEl) quickInputEl.value = '';
        }
        this._syncClassPresetInput(nextValue, 'main');
        this._syncClassPresetInput(nextValue, 'quick');
        this._refreshQuickStartOverview();
      });
      document.getElementById('quick-class-preset-select')?.addEventListener('change', (event) => {
        const nextValue = event.currentTarget.value || '';
        const classPreset = document.getElementById('class-preset-select');
        if (classPreset) classPreset.value = nextValue;
        if (/^\d+$/.test(String(nextValue))) {
          const classInputEl = document.getElementById('class-input');
          const quickInputEl = document.getElementById('quick-class-input');
          if (classInputEl) classInputEl.value = nextValue;
          if (quickInputEl) quickInputEl.value = nextValue;
        } else {
          const classInputEl = document.getElementById('class-input');
          const quickInputEl = document.getElementById('quick-class-input');
          if (classInputEl) classInputEl.value = '';
          if (quickInputEl) quickInputEl.value = '';
        }
        this._syncClassPresetInput(nextValue, 'main');
        this._syncClassPresetInput(nextValue, 'quick');
        this._refreshQuickStartOverview();
      });
      document.getElementById('class-input')?.addEventListener('input', (event) => {
        const nextValue = event.currentTarget.value || '';
        const quickInputEl = document.getElementById('quick-class-input');
        const classPresetEl = document.getElementById('class-preset-select');
        const quickPresetEl = document.getElementById('quick-class-preset-select');
        if (quickInputEl && quickInputEl.value !== nextValue) quickInputEl.value = nextValue;
        if (classPresetEl) classPresetEl.value = '';
        if (quickPresetEl) quickPresetEl.value = '';
        this._syncClassPresetInput('', 'main');
        this._syncClassPresetInput('', 'quick');
        this._refreshQuickStartOverview();
      });
      document.getElementById('quick-class-input')?.addEventListener('input', (event) => {
        const nextValue = event.currentTarget.value || '';
        const classInputEl = document.getElementById('class-input');
        const classPresetEl = document.getElementById('class-preset-select');
        const quickPresetEl = document.getElementById('quick-class-preset-select');
        if (classInputEl && classInputEl.value !== nextValue) classInputEl.value = nextValue;
        if (classPresetEl) classPresetEl.value = '';
        if (quickPresetEl) quickPresetEl.value = '';
        this._syncClassPresetInput('', 'main');
        this._syncClassPresetInput('', 'quick');
        this._refreshQuickStartOverview();
      });
      document.getElementById('grade-select')?.addEventListener('change', (event) => {
        const quickGradeEl = document.getElementById('quick-grade-select');
        if (quickGradeEl) quickGradeEl.value = event.currentTarget.value;
      });
      document.getElementById('quick-grade-select')?.addEventListener('change', (event) => {
        const gradeEl = document.getElementById('grade-select');
        if (gradeEl) gradeEl.value = event.currentTarget.value;
      });
      document.getElementById('quick-timetable-mode-select')?.addEventListener('change', (event) => {
        const modeEl = document.getElementById('timetable-mode-select');
        if (modeEl) modeEl.value = event.currentTarget.value;
        this._refreshQuickStartOverview();
      });
      [
        'timetable-mode-select',
        'quick-timetable-mode-select',
        'homeroom-role-select',
        'quick-homeroom-role-select',
        'grade-select',
        'quick-grade-select',
        'class-preset-select',
        'quick-class-preset-select',
        'class-input',
        'quick-class-input',
        'start-time-input',
        'morning-min-input',
        'class-min-input',
        'break-min-input',
        'lunch-min-input',
        'lunch-after-select',
        'total-periods-select',
        'afterschool-check',
        'afterschool-min-input',
        'afterschool-days-input'
      ].forEach((id) => {
        const field = document.getElementById(id);
        if (!field || field.dataset.timetableViewBound === '1') return;
        field.dataset.timetableViewBound = '1';
        ['input', 'change'].forEach((eventName) => {
          field.addEventListener(eventName, () => this._refreshTimetableSettingsViews());
        });
      });
      document.querySelectorAll('#settings-modal [data-target-tab]').forEach((button) => {
        button.addEventListener('click', (event) => {
          const targetTab = event.currentTarget.dataset.targetTab;
          const widgetFocus = event.currentTarget.dataset.widgetFocus;
          if (!targetTab) return;
          this._setActiveSettingsTab(targetTab);
          if (targetTab === 'widgets' && widgetFocus) {
            window.requestAnimationFrame(() => this._focusWidgetSettingsSection(widgetFocus));
          }
        });
      });
      document.querySelectorAll('#settings-widgets [data-widget-focus]:not([data-target-tab])').forEach((button) => {
        button.addEventListener('click', (event) => {
          const widgetFocus = event.currentTarget.dataset.widgetFocus;
          if (widgetFocus) this._focusWidgetSettingsSection(widgetFocus);
        });
      });
      const settingsModal = document.getElementById('settings-modal');
      if (settingsModal && settingsModal.dataset.panelSectionBound !== '1') {
        settingsModal.dataset.panelSectionBound = '1';
        settingsModal.addEventListener('click', (event) => {
          const button = event.target.closest('.panel-section-nav-btn[data-panel-focus]');
          if (!button) return;
          const sectionName = button.dataset.panelFocus;
          if (sectionName) this._focusActivePanelSection(sectionName);
        });
      }
      if (settingsModal && settingsModal.dataset.timetableEditorBound !== '1') {
        settingsModal.dataset.timetableEditorBound = '1';
        settingsModal.addEventListener('input', (event) => {
          const input = event.target.closest('.settings-timetable-cell-input');
          if (!input) return;
          const day = String(input.dataset.day || '').trim();
          const period = String(input.dataset.period || '').trim();
          if (!day || !period) return;

          const teacherTimetable = this._readTeacherTimetableForSettings();
          const value = String(input.value || '').trim();
          if (value) {
            if (!teacherTimetable[day]) teacherTimetable[day] = {};
            teacherTimetable[day][period] = value;
          } else if (teacherTimetable[day]) {
            delete teacherTimetable[day][period];
            if (!Object.keys(teacherTimetable[day]).length) {
              delete teacherTimetable[day];
            }
          }

          this._writeTeacherTimetableForSettings(teacherTimetable);
          const clearBtn = document.getElementById('settings-timetable-clear-btn');
          if (clearBtn) {
            clearBtn.disabled = !Object.values(teacherTimetable).some((dayEntries) => dayEntries && Object.keys(dayEntries).length > 0);
          }
          this._scheduleSettingsTeacherTimetableRefresh();
        });
        settingsModal.addEventListener('click', async (event) => {
          const clearButton = event.target.closest('#settings-timetable-clear-btn');
          if (!clearButton) return;
          await this._clearSettingsTeacherTimetable();
        });
      }
      const settingsBody = document.querySelector('.settings-body');
      if (settingsBody && settingsBody.dataset.widgetSummaryScrollBound !== '1') {
        settingsBody.dataset.widgetSummaryScrollBound = '1';
        settingsBody.addEventListener('scroll', () => {
          window.cancelAnimationFrame(this._widgetSummarySyncFrame);
          this._widgetSummarySyncFrame = window.requestAnimationFrame(() => {
            const scrollerRect = settingsBody.getBoundingClientRect();
            const activePanel = document.querySelector('.settings-panel.active');
            if (!activePanel) return;
            const anchorTop = scrollerRect.top + 132;

            if (activePanel.id === 'settings-widgets') {
              const sections = Array.from(activePanel.querySelectorAll('[data-widget-section]'));
              if (!sections.length) return;
              let nextSection = sections[0];
              let closestDistance = Number.POSITIVE_INFINITY;

              sections.forEach((section) => {
                const distance = Math.abs(section.getBoundingClientRect().top - anchorTop);
                if (distance < closestDistance) {
                  closestDistance = distance;
                  nextSection = section;
                }
              });

              this._setActiveWidgetSummary(nextSection.dataset.widgetSection || '');
              return;
            }

            const sections = Array.from(activePanel.querySelectorAll('[data-panel-section]'));
            if (!sections.length) return;
            let nextSection = sections[0];
            let closestDistance = Number.POSITIVE_INFINITY;

            sections.forEach((section) => {
              const distance = Math.abs(section.getBoundingClientRect().top - anchorTop);
              if (distance < closestDistance) {
                closestDistance = distance;
                nextSection = section;
              }
            });

            this._setActivePanelSectionNav(nextSection.dataset.panelSection || '');
          });
        }, { passive: true });
      }
      document.getElementById('reset-custom-colors-btn')?.addEventListener('click', () => this._resetColorPreviewInputs());

      [
        'theme-select',
        'opacity-slider',
        'fontsize-slider',
        'custom-primary-color',
        'custom-primary-light-color',
        'custom-accent-color',
        'custom-background-color',
        'background-opacity-slider'
      ].forEach((id) => {
        document.getElementById(id)?.addEventListener('input', () => this._applyLiveThemePreview());
        document.getElementById(id)?.addEventListener('change', () => this._applyLiveThemePreview());
      });

      [
        'custom-primary-color',
        'custom-primary-light-color',
        'custom-accent-color',
        'custom-background-color'
      ].forEach((id) => {
        document.getElementById(id)?.addEventListener('input', (event) => {
          event.currentTarget.dataset.useDefault = 'false';
          this._applyLiveThemePreview();
        });
        document.getElementById(id)?.addEventListener('change', (event) => {
          event.currentTarget.dataset.useDefault = 'false';
          this._applyLiveThemePreview();
        });
      });

      this._bindMirroredFieldPair('neis-key-input', 'quick-neis-key-input');
      this._bindMirroredFieldPair('school-name-input', 'quick-school-name-input');
      this._bindMirroredFieldPair('weather-mode-select', 'quick-weather-mode-select');
      this._bindMirroredFieldPair('weather-key-input', 'quick-weather-key-input');
      this._bindMirroredFieldPair('grade-select', 'quick-grade-select');
      this._bindMirroredFieldPair('timetable-mode-select', 'quick-timetable-mode-select');
      ['weather-mode-select', 'quick-weather-mode-select', 'weather-key-input', 'quick-weather-key-input'].forEach((id) => {
        const field = document.getElementById(id);
        if (!field || field.dataset.weatherProviderBound === '1') return;
        field.dataset.weatherProviderBound = '1';
        ['input', 'change'].forEach((eventName) => {
          field.addEventListener(eventName, () => {
            if (this._settingsSyncing) return;
            this._syncWeatherProviderControls();
          });
        });
      });
      window.addEventListener('livelysam:googleSyncChanged', () => this._refreshGoogleSettingsStatus());
      window.addEventListener('livelysam:leaderboardStatusChanged', () => this._refreshLeaderboardSettingsStatus());
      window.addEventListener('focus', () => {
        const settingsOpen = document.getElementById('settings-modal')?.classList.contains('active');
        if (settingsOpen && this._activeSettingsTab === 'api') {
          this._reloadGoogleSettingsStatus();
        }
      });
      document.addEventListener('visibilitychange', () => {
        const settingsOpen = document.getElementById('settings-modal')?.classList.contains('active');
        if (document.visibilityState === 'visible' && settingsOpen && this._activeSettingsTab === 'api') {
          this._reloadGoogleSettingsStatus();
        }
      });
      this._bindSettingsDirtyTracking();
      this._bindGoogleSettingsLiveSync();
      this._bindLeaderboardSettingsLiveSync();
      this._refreshGoogleSyncDockButton();
      this._populateSettingsForm();
    },

    _mountSettingsModal() {
      const modal = document.getElementById('settings-modal');
      if (modal && modal.parentElement !== document.body) {
        document.body.appendChild(modal);
      }
    },

    _getSelectLabel(fieldId, fallback = '') {
      const field = document.getElementById(fieldId);
      return field?.options?.[field.selectedIndex]?.textContent?.trim() || fallback;
    },

    _getSettingsPanelMeta(tabName = 'quickstart') {
      const schoolName = String(this._getFormFieldValue('school-name-input', LS.Config.get('schoolName')) || '').trim();
      const schoolLinked = Boolean(LS.Config.get('atptCode') && LS.Config.get('schoolCode')) && Boolean(schoolName);
      const weatherMode = this._getWeatherProviderModeDraft('main');
      const weatherKey = this._getWeatherApiKeyDraft('main');
      const visibleWidgetCount = WIDGET_VISIBILITY_FIELDS.reduce((acc, [, fieldId]) => acc + (document.getElementById(fieldId)?.checked ? 1 : 0), 0);
      const weatherEnabledCount = [
        'weather-show-current-check',
        'weather-show-details-check',
        'weather-show-hourly-check',
        'weather-show-daily-check',
        'weather-show-air-current-check',
        'weather-show-air-hourly-check',
        'weather-show-air-daily-check',
        'weather-show-alerts-check',
        'weather-show-updated-check'
      ].filter((id) => document.getElementById(id)?.checked).length;
      const googleStatus = LS.GoogleWorkspace?.getStatus?.() || {};
      const profileCount = Array.isArray(LS.Config.getProfiles?.()) ? LS.Config.getProfiles().length : 1;
      const roleLabel = this._getSelectLabel('homeroom-role-select', '담임');
      const gradeLabel = this._getSelectLabel('grade-select', '1학년');
      const themeLabel = this._getSelectLabel('theme-select', '오션 브리즈').replace(/^[^\s]+\s*/, '');
      const timetableMode = this._getSelectLabel('timetable-mode-select', '학급 시간표 (자동 연동)');
      const totalPeriods = this._getSelectLabel('total-periods-select', '7교시');
      const lunchAfter = this._getSelectLabel('lunch-after-select', '4교시 후');
      const selectedClassValue = this._getSelectedClassValue() || LS.Config.get('classNum') || '1';
      const classroomLabel = roleLabel === '비담임'
        ? '비담임'
        : `${gradeLabel} ${LS.Config.getClassDisplayName(selectedClassValue)}`.trim();
      const fontSize = `${this._getFormFieldValue('fontsize-slider', LS.Config.get('fontSize')) || 14}px`;
      const opacity = `${this._getFormFieldValue('opacity-slider', LS.Config.get('widgetOpacity')) || 75}%`;

      const map = {
        quickstart: {
          kicker: '빠른 시작',
          title: '핵심 입력만 먼저 마치시면 바로 사용할 수 있습니다.',
          description: '학교 연결, 학급 기준, 시간표 방식처럼 처음 사용할 때 필요한 항목을 먼저 정리하는 곳입니다.',
          chips: [
            { text: schoolLinked ? '학교 연결됨' : '학교 연결 필요', primary: true },
            { text: classroomLabel },
            { text: weatherMode === 'custom' ? (weatherKey ? '개인 날씨 키 사용' : '개인 날씨 키 입력 대기') : '기본 공용 서버 사용' }
          ],
          actions: [
            { label: '학교/학급 상세 설정', tab: 'school', primary: true },
            { label: '위젯 옵션 보기', tab: 'widgets' }
          ]
        },
        widgets: {
          kicker: '위젯',
          title: '위젯 표시와 세부 옵션을 한곳에서 정리할 수 있습니다.',
          description: '시계, 시간표, 일정, 날씨, 급식, 기록 도구를 각각 따로 조정하되 공통 화면 옵션은 분리해서 관리합니다.',
          chips: [
            { text: `${visibleWidgetCount}개 위젯 표시 중`, primary: true },
            { text: `날씨 요소 ${weatherEnabledCount}개 표시` },
            { text: '공통 색감은 화면 탭' }
          ],
          actions: [
            { label: '공통 화면 옵션', tab: 'display', primary: true },
            { label: '날씨 카드로 이동', tab: 'widgets', widgetFocus: 'weather' }
          ]
        },
        api: {
          kicker: '연동',
          title: '학교 서버, 날씨 연결 방식, Google 계정 연동을 한곳에서 관리합니다.',
          description: '학교 데이터, 날씨, Google 일정/할 일 동기화를 한 탭에서 이어서 설정합니다.',
          chips: [
            { text: schoolLinked ? '학교 서버 사용 준비됨' : '학교 연결 필요', primary: true },
            { text: weatherMode === 'custom' ? (weatherKey ? '개인 날씨 키 사용' : '개인 날씨 키 입력 필요') : '기본 공용 서버 사용' },
            { text: googleStatus.connected ? 'Google 연결됨' : 'Google 미연결' }
          ],
          actions: [
            { label: '학교/학급 설정', tab: 'school', primary: true },
            { label: '일정 위젯 보기', tab: 'widgets', widgetFocus: 'calendar' }
          ]
        },
        school: {
          kicker: '학교/학급',
          title: '학교 연결과 학급 기준을 같은 흐름에서 관리합니다.',
          description: '프로필, 학교 검색, 담당 구분, 학년/반 설정을 한 패널로 묶어 시간표와 일정 기준이 끊기지 않도록 정리했습니다.',
          chips: [
            { text: schoolLinked ? (schoolName || '학교 연결됨') : '학교 미선택', primary: true },
            { text: classroomLabel },
            { text: `프로필 ${profileCount}개` }
          ],
          actions: [
            { label: '시간표 탭 보기', tab: 'day', primary: true },
            { label: '날씨 위젯 보기', tab: 'widgets', widgetFocus: 'weather' }
          ]
        },
        day: {
          kicker: '시간표',
          title: '시간표 방식, 교시 구성, 교사용 입력을 한 탭에서 관리합니다.',
          description: '자동 연동/교사용 모드 선택, 일과 시간, 점심/교시, 방과후, 직접 입력과 엑셀 업로드를 한 흐름으로 묶었습니다.',
          chips: [
            { text: timetableMode, primary: true },
            { text: `${totalPeriods} · ${lunchAfter}` },
            { text: document.getElementById('afterschool-check')?.checked ? '방과후 사용' : '방과후 미사용' }
          ],
          actions: [
            { label: '학교/학급 설정 보기', tab: 'school', primary: true },
            { label: '시간표 위젯 보기', tab: 'widgets', widgetFocus: 'timetable' }
          ]
        },
        display: {
          kicker: '화면',
          title: '공통 색감, 투명도, 글자 크기를 화면 전체 기준으로 조정합니다.',
          description: '위젯 개별 옵션과 분리해, 화면 전체의 분위기와 가독성만 이 탭에서 조정합니다.',
          chips: [
            { text: themeLabel, primary: true },
            { text: `글자 ${fontSize}` },
            { text: `투명도 ${opacity}` }
          ],
          actions: [
            { label: '위젯 옵션 보기', tab: 'widgets', primary: true },
            { label: '빠른 시작으로 이동', tab: 'quickstart' }
          ]
        },
        data: {
          kicker: '데이터',
          title: '레이아웃, 백업, 복원 같은 관리 작업을 모아두었습니다.',
          description: '위젯 위치 초기화, 전체 데이터 내보내기/가져오기, 버전 정보 확인처럼 주기적으로 필요한 관리 작업을 모았습니다.',
          chips: [
            { text: `프로필 ${profileCount}개`, primary: true },
            { text: '백업 / 복원' },
            { text: '레이아웃 초기화' }
          ],
          actions: [
            { label: '빠른 시작으로 이동', tab: 'quickstart', primary: true },
            { label: '화면 옵션 보기', tab: 'display' }
          ]
        }
      };

      return map[tabName] || map.quickstart;
    },

    _renderSettingsPanelIntro(tabName = this._activeSettingsTab || 'quickstart') {
      // 구버전 .settings-panel-intro 컨테이너는 .settings-content-head 로 통합되었음.
      // 내부 ID(title/description/chips/actions)는 그대로 유지되므로 그 요소만 확인한다.
      const titleEl = document.getElementById('settings-panel-title');
      const descriptionEl = document.getElementById('settings-panel-description');
      const chipsEl = document.getElementById('settings-panel-chips');
      const actionsEl = document.getElementById('settings-panel-actions');
      if (!titleEl || !descriptionEl || !chipsEl || !actionsEl) return;

      const meta = this._getSettingsPanelMeta(tabName);
      // kicker 는 신규 레이아웃에서 제거되었지만 기존 ID 가 남아 있을 경우 안전하게 갱신
      const kickerEl = document.getElementById('settings-panel-kicker');
      if (kickerEl) kickerEl.textContent = meta.kicker || '';

      titleEl.textContent = meta.title || '';
      descriptionEl.textContent = meta.description || '';
      chipsEl.replaceChildren();
      (meta.chips || []).forEach((chip, index) => {
        const chipEl = document.createElement('span');
        chipEl.className = `settings-panel-chip${chip.primary || index === 0 ? ' is-primary' : ''}`;
        chipEl.textContent = String(chip.text || '');
        chipsEl.appendChild(chipEl);
      });
      actionsEl.replaceChildren();
      (meta.actions || []).forEach((action, index) => {
        const actionBtn = document.createElement('button');
        actionBtn.type = 'button';
        actionBtn.className = `settings-panel-action-btn${action.primary || index === 0 ? ' is-primary' : ''}`;
        actionBtn.dataset.introTargetTab = String(action.tab || '');
        if (action.widgetFocus) {
          actionBtn.dataset.widgetFocus = String(action.widgetFocus);
        }
        actionBtn.textContent = String(action.label || '');
        actionsEl.appendChild(actionBtn);
      });
    },

    _setActivePanelSectionNav(sectionName = '') {
      const activePanel = document.querySelector('.settings-panel.active');
      if (!activePanel) return;
      activePanel.querySelectorAll('.panel-section-nav-btn').forEach((button) => {
        button.classList.toggle('is-active', Boolean(sectionName) && button.dataset.panelFocus === sectionName);
      });
    },

    _focusActivePanelSection(sectionName = '') {
      const activePanel = document.querySelector('.settings-panel.active');
      const scroller = document.querySelector('.settings-body');
      if (!activePanel || !scroller || !sectionName) return;

      const target = activePanel.querySelector(`[data-panel-section="${sectionName}"]`);
      if (!target) return;

      const scrollerRect = scroller.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const stickyOffset = 78;
      const nextTop = scroller.scrollTop + (targetRect.top - scrollerRect.top) - stickyOffset;

      scroller.scrollTo({
        top: Math.max(0, nextTop),
        behavior: 'smooth'
      });
      this._setActivePanelSectionNav(sectionName);
    },

    _setActiveWidgetSummary(sectionName = '') {
      document.querySelectorAll('#settings-widgets .widget-settings-summary').forEach((button) => {
        button.classList.toggle('is-active', Boolean(sectionName) && button.dataset.widgetFocus === sectionName);
      });
    },

    async _copyTextToClipboard(text) {
      const value = String(text || '').trim();
      if (!value) return false;

      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(value);
          return true;
        }
      } catch {
        // fall through to the legacy copy path
      }

      try {
        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.top = '-9999px';
        textarea.style.left = '-9999px';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const copied = document.execCommand('copy');
        textarea.remove();
        return copied;
      } catch {
        return false;
      }
    },

    _refreshWidgetSettingsSummary() {
      const getChecked = (id) => Boolean(document.getElementById(id)?.checked);
      const getSelectedText = (id) => {
        const field = document.getElementById(id);
        return field?.options?.[field.selectedIndex]?.textContent?.trim() || '';
      };
      const setSummary = (key, label, muted, text) => {
        document.querySelectorAll(`#settings-widgets [data-widget-state-label="${key}"]`).forEach((node) => {
          node.textContent = label;
          node.classList.toggle('is-hidden', muted);
        });
        const summaryNode = document.querySelector(`#settings-widgets [data-widget-summary-text="${key}"]`);
        if (summaryNode) summaryNode.textContent = text;
      };

      const weatherOptionIds = [
        'weather-show-current-check',
        'weather-show-details-check',
        'weather-show-tonight-sky-check',
        'weather-show-hourly-check',
        'weather-show-daily-check',
        'weather-show-air-current-check',
        'weather-show-air-hourly-check',
        'weather-show-air-daily-check',
        'weather-show-alerts-check',
        'weather-show-updated-check'
      ];
      const toolIds = [
        'widget-visible-timer',
        'widget-visible-dday',
        'widget-visible-memo',
        'widget-visible-todo',
        'widget-visible-bookmarks'
      ];

      const clockVisible = getChecked('widget-visible-clock');
      const timetableVisible = getChecked('widget-visible-timetable');
      const calendarVisible = getChecked('widget-visible-calendar');
      const calendarAstronomyLevel = document.getElementById('calendar-astronomy-level-select')?.value || 'basic';
      const calendarAstronomyKoreaOnly = getChecked('calendar-astronomy-korea-check');
      const weatherVisible = getChecked('widget-visible-weather');
      const mealVisible = getChecked('widget-visible-meal');
      const shortcutsVisible = getChecked('widget-visible-shortcuts');
      const shortcutIconScale = document.getElementById('shortcut-icon-scale-select')?.value || 'medium';
      const weatherEnabledCount = weatherOptionIds.filter(getChecked).length;
      const toolsEnabledCount = toolIds.filter(getChecked).length;
      const timetableMode = document.getElementById('timetable-mode-select')?.value === '1'
        ? '교사용 수동 입력'
        : '학급 자동 연동';
      const clockMode = getSelectedText('clock-format-select').includes('24') ? '24시간' : '12시간';
      const mealMode = getChecked('meal-compact-day-check') ? '간소화' : '기본형';
      const mealNutrition = getChecked('meal-show-nutrition-check') ? '영양 정보 표시' : '영양 정보 숨김';
      const toolsLabel = toolsEnabledCount === 0 ? '숨김' : toolsEnabledCount === toolIds.length ? '전체' : '일부';

      setSummary(
        'clock',
        clockVisible ? '표시' : '숨김',
        !clockVisible,
        `${clockMode} · ${getChecked('show-analog-check') ? '아날로그 표시' : '디지털만'} · ${getChecked('show-seconds-check') ? '초 표시' : '초 숨김'}`
      );
      setSummary(
        'timetable',
        timetableVisible ? '표시' : '숨김',
        !timetableVisible,
        `${timetableMode} · 교시/입력은 시간표 탭에서 설정`
      );
      setSummary(
        'calendar',
        calendarVisible ? '표시' : '숨김',
        !calendarVisible,
        calendarAstronomyLevel === 'off'
          ? '학교 일정 · Google 일정 기준 연결'
          : `학교 일정 · Google 일정 · 천문 ${calendarAstronomyLevel === 'detailed' ? '자세히' : '기본'}${calendarAstronomyKoreaOnly ? ' · 한국 관측 위주' : ''}`
      );
      setSummary(
        'weather',
        weatherVisible ? '표시' : '숨김',
        !weatherVisible,
        `세부 요소 ${weatherEnabledCount}개 표시 · 위치는 위젯, 연동은 연동 탭`
      );
      setSummary(
        'meal',
        mealVisible ? '표시' : '숨김',
        !mealVisible,
        getChecked('meal-compact-day-check') ? `${mealMode} · 메뉴/칼로리 중심` : `${mealMode} · ${mealNutrition}`
      );
      setSummary(
        'shortcuts',
        shortcutsVisible ? '표시' : '숨김',
        !shortcutsVisible,
        `${getChecked('shortcut-show-labels-check') ? '이름 표시' : '이름 숨김'} · ${getChecked('shortcut-show-paths-check') ? '경로 표시' : '경로 숨김'} · 아이콘 ${shortcutIconScale === 'small' ? '작게' : shortcutIconScale === 'large' ? '크게' : '기본'}`
      );
      setSummary(
        'tools',
        toolsLabel,
        toolsEnabledCount === 0,
        `${toolsEnabledCount}개 위젯 표시 · 내용 편집은 본문 위젯에서 처리`
      );
    },

    _focusWidgetSettingsSection(sectionName) {
      if (!sectionName) return;
      const scroller = document.querySelector('.settings-body');
      const target = document.querySelector(`#settings-widgets [data-widget-section="${sectionName}"]`);
      if (!scroller || !target) return;

      const scrollerRect = scroller.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const stickyOffset = 108;
      const nextTop = scroller.scrollTop + (targetRect.top - scrollerRect.top) - stickyOffset;

      scroller.scrollTo({
        top: Math.max(0, nextTop),
        behavior: 'smooth'
      });

      this._setActiveWidgetSummary(sectionName);
      document.querySelectorAll('#settings-widgets .widget-settings-card').forEach((card) => {
        card.classList.remove('is-focus-target');
      });
      target.classList.add('is-focus-target');

      window.clearTimeout(this._widgetSettingsFocusTimer);
      this._widgetSettingsFocusTimer = window.setTimeout(() => {
        target.classList.remove('is-focus-target');
      }, 1800);
    },

    _setActiveSettingsTab(tabName) {
      if (!tabName) return;
      this._activeSettingsTab = tabName;
      LS.Storage.set('lastSettingsTab', tabName);
      // 구버전 horizontal tabs
      document.querySelectorAll('.settings-tab-btn').forEach((item) => {
        item.classList.toggle('active', item.dataset.tab === tabName);
      });
      // 신규 sidebar nav 아이템
      document.querySelectorAll('.settings-nav-item').forEach((item) => {
        item.classList.toggle('is-active', item.dataset.tab === tabName);
      });
      const activePanelId = `settings-${tabName}`;
      document.querySelectorAll('.settings-panel').forEach((panel) => {
        panel.classList.toggle('active', panel.id === activePanelId);
      });
      const activePanel = document.getElementById(activePanelId);
      if (tabName === 'widgets') {
        this._setActiveWidgetSummary('clock');
        this._refreshWidgetSettingsSummary();
      } else {
        const firstPanelSection = activePanel?.querySelector('.panel-section-nav-btn')?.dataset.panelFocus || '';
        this._setActivePanelSectionNav(firstPanelSection);
      }
      if (tabName === 'api') {
        this._reloadGoogleSettingsStatus();
      }
      this._renderSettingsPanelIntro(tabName);
      document.querySelector('.settings-body')?.scrollTo({ top: 0, behavior: 'auto' });
    },

    _openSettings(preferredTab = '') {
      this._updateViewportMetrics();
      this._mountSettingsModal();
      document.body.classList.add('modal-open', 'settings-open');
      document.getElementById('settings-modal')?.classList.add('active');
      this._setSettingsButtonVisible(false);
      this._populateSettingsForm();
      this._captureSettingsSessionSnapshot();
      this._setActiveSettingsTab(preferredTab || LS.Storage.get('lastSettingsTab', '') || 'quickstart');
      document.querySelector('.settings-body')?.scrollTo({ top: 0, behavior: 'auto' });
    },

    _openMinigameHub(gameId = '') {
      LS.MinigamesHub?.open?.({ gameId });
      this._setFloatingDockExpanded(false);
    },

    _closeSettings() {
      document.body.classList.remove('settings-open');
      if (!document.getElementById('prompt-modal')?.classList.contains('active')) {
        document.body.classList.remove('modal-open');
      }
      document.getElementById('settings-modal')?.classList.remove('active');
      LS.Config.applyTheme();
      this._setSettingsButtonVisible(true);
      // 검색 상태 초기화
      this._clearSettingsSearch();
    },

    _cloneSettingsSessionValue(value) {
      if (typeof window.structuredClone === 'function') {
        return window.structuredClone(value);
      }
      return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    },

    _captureSettingsSessionSnapshot() {
      this._settingsSessionSnapshot = {
        config: this._cloneSettingsSessionValue(LS.Storage.get('config', {})),
        profiles: this._cloneSettingsSessionValue(LS.Storage.get('configProfiles', [])),
        activeProfileId: String(LS.Storage.get('activeProfileId', '') || '')
      };
    },

    _hasSettingsSessionDrift() {
      const snapshot = this._settingsSessionSnapshot;
      if (!snapshot) return false;

      const currentConfig = LS.Storage.get('config', {});
      const currentProfiles = LS.Storage.get('configProfiles', []);
      const currentActiveProfileId = String(LS.Storage.get('activeProfileId', '') || '');

      return JSON.stringify(currentConfig) !== JSON.stringify(snapshot.config)
        || JSON.stringify(currentProfiles) !== JSON.stringify(snapshot.profiles)
        || currentActiveProfileId !== snapshot.activeProfileId;
    },

    _restoreSettingsSessionSnapshot() {
      const snapshot = this._settingsSessionSnapshot;
      if (!snapshot) return false;

      LS.Storage.set('config', this._cloneSettingsSessionValue(snapshot.config));
      LS.Storage.set('configProfiles', this._cloneSettingsSessionValue(snapshot.profiles));
      LS.Storage.set('activeProfileId', snapshot.activeProfileId);
      LS.Config.init();

      this._resolvedSchoolSignature = '';
      this._resolvedWeatherSignature = '';
      this._schoolResolveState = { status: 'idle', message: '' };
      this._weatherResolveState = { status: 'idle', message: '' };
      this._settingsDirty = false;
      this._settingsSaveInProgress = false;
      this._lastGoogleDiagnostics = LS.GoogleWorkspace?.getCachedDiagnostics?.() || this._lastGoogleDiagnostics;

      if (document.getElementById('settings-modal')) {
        this._populateSettingsForm();
      }
      this._refreshLivelySetupNotice();
      this._refreshGoogleSettingsStatus();
      this._refreshGoogleSyncDockButton();
      this._refreshLeaderboardSettingsStatus();
      this._setSettingsSaveState('neutral', '저장됨');
      return true;
    },

    async _confirmDiscardSettingsChanges(context = 'close') {
      if (this._settingsSaveInProgress) {
        LS.Helpers.showToast('설정을 저장하는 중입니다. 완료될 때까지 잠시만 기다려 주세요.', 'info', 2200);
        return false;
      }
      const hasUnsavedChanges = this._settingsDirty || this._hasSettingsSessionDrift();
      if (!hasUnsavedChanges) return true;
      if (this._settingsDiscardConfirmOpen) return false;

      const contextMessageMap = {
        close: '지금 닫으면 저장하지 않은 변경사항이 사라집니다.',
        cancel: '지금 나가면 저장하지 않은 변경사항이 사라집니다.',
        escape: '설정창을 닫으면 저장하지 않은 변경사항이 사라집니다.',
        profileSwitch: '프로필을 바꾸면 현재 편집 중인 변경사항이 사라집니다.',
        profileCreate: '새 프로필을 만들면 현재 편집 중인 변경사항이 사라질 수 있습니다.',
        profileDelete: '프로필을 삭제하기 전에 현재 편집 중인 변경사항부터 사라집니다.'
      };

      this._settingsDiscardConfirmOpen = true;
      try {
        const confirmed = await LS.Helpers.confirmModal(
          '저장되지 않은 변경사항',
          `${contextMessageMap[context] || contextMessageMap.close} 계속하시겠습니까?`,
          {
            confirmText: '저장 안 함',
            cancelText: '계속 편집'
          }
        );
        if (!confirmed) return false;
        this._restoreSettingsSessionSnapshot();
        return true;
      } finally {
        this._settingsDiscardConfirmOpen = false;
      }
    },

    async _requestSettingsClose(context = 'close') {
      const confirmed = await this._confirmDiscardSettingsChanges(context);
      if (!confirmed) return;
      this._closeSettings();
    },

    /* ═══ 설정 검색 ═══ */
    _getSettingsTabLabel(tabName) {
      const labels = {
        quickstart: '빠른 시작',
        school: '학교·학급',
        day: '시간표',
        widgets: '위젯 옵션',
        api: '외부 연동',
        display: '화면 꾸미기',
        data: '데이터·정보'
      };
      return labels[tabName] || tabName;
    },

    _collectSettingsSearchIndex() {
      if (this._settingsSearchIndex && this._settingsSearchIndex.length) return this._settingsSearchIndex;
      const index = [];
      const modal = document.getElementById('settings-modal');
      if (!modal) return index;
      modal.querySelectorAll('.settings-panel').forEach((panel) => {
        const tabName = panel.id.replace(/^settings-/, '');
        const tabLabel = this._getSettingsTabLabel(tabName);
        panel.querySelectorAll('.setting-group').forEach((group) => {
          const groupTitle = group.querySelector('.setting-group-title')?.textContent?.trim() || '';
          const sectionKey = group.getAttribute('data-panel-section') || '';
          // 그룹 자체도 인덱싱
          if (groupTitle) {
            index.push({
              tab: tabName,
              tabLabel,
              section: sectionKey,
              title: groupTitle,
              hint: '',
              haystack: `${tabLabel} ${groupTitle}`.toLowerCase()
            });
          }
          // 각 라벨/설정도 인덱싱
          group.querySelectorAll('label, .setting-label, .setting-item-title').forEach((labelEl) => {
            const text = labelEl.textContent?.trim();
            if (!text || text.length < 2) return;
            // 라벨이 group-title 과 같으면 중복 제거
            if (text === groupTitle) return;
            index.push({
              tab: tabName,
              tabLabel,
              section: sectionKey,
              title: text,
              hint: groupTitle,
              haystack: `${tabLabel} ${groupTitle} ${text}`.toLowerCase()
            });
          });
        });
      });
      this._settingsSearchIndex = index;
      return index;
    },

    _renderSettingsSearchResults(query) {
      const resultsEl = document.getElementById('settings-search-results');
      if (!resultsEl) return;
      const q = (query || '').trim().toLowerCase();
      if (!q) {
        resultsEl.hidden = true;
        resultsEl.innerHTML = '';
        return;
      }
      const index = this._collectSettingsSearchIndex();
      const matches = index.filter((item) => item.haystack.includes(q)).slice(0, 30);
      if (!matches.length) {
        resultsEl.innerHTML = `
          <div class="settings-search-empty">
            <div class="settings-search-empty-title">검색 결과가 없습니다</div>
            <div class="settings-search-empty-hint">다른 키워드를 시도해 보세요. 예: 글자 크기, 테마, NEIS, Google</div>
          </div>
        `;
        resultsEl.hidden = false;
        return;
      }
      resultsEl.innerHTML = `
        <div class="settings-search-list">
          ${matches.map((item, i) => `
            <button type="button"
              class="settings-search-item"
              data-search-tab="${LS.Helpers.escapeHtml(item.tab)}"
              data-search-section="${LS.Helpers.escapeHtml(item.section || '')}"
              data-search-index="${i}">
              <span class="settings-search-item-title">${LS.Helpers.escapeHtml(item.title)}</span>
              <span class="settings-search-item-meta">
                <span class="settings-search-item-tab">${LS.Helpers.escapeHtml(item.tabLabel)}</span>
                ${item.hint ? `<span class="settings-search-item-sep">›</span><span class="settings-search-item-hint">${LS.Helpers.escapeHtml(item.hint)}</span>` : ''}
              </span>
            </button>
          `).join('')}
        </div>
      `;
      resultsEl.hidden = false;
    },

    _clearSettingsSearch() {
      const input = document.getElementById('settings-search-input');
      const clearBtn = document.getElementById('settings-search-clear');
      const resultsEl = document.getElementById('settings-search-results');
      if (input) input.value = '';
      if (clearBtn) clearBtn.hidden = true;
      if (resultsEl) {
        resultsEl.hidden = true;
        resultsEl.innerHTML = '';
      }
    },

    _bindSettingsSearch() {
      const input = document.getElementById('settings-search-input');
      const clearBtn = document.getElementById('settings-search-clear');
      const resultsEl = document.getElementById('settings-search-results');
      if (!input || input.dataset.searchBound === '1') return;
      input.dataset.searchBound = '1';

      const handle = () => {
        const value = input.value;
        if (clearBtn) clearBtn.hidden = !value;
        this._renderSettingsSearchResults(value);
      };

      input.addEventListener('input', handle);
      input.addEventListener('focus', handle);
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          this._clearSettingsSearch();
          input.blur();
        }
      });
      clearBtn?.addEventListener('click', () => {
        this._clearSettingsSearch();
        input.focus();
      });
      resultsEl?.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-search-tab]');
        if (!btn) return;
        const targetTab = btn.dataset.searchTab;
        const section = btn.dataset.searchSection;
        if (!targetTab) return;
        this._clearSettingsSearch();
        this._setActiveSettingsTab(targetTab);
        if (section) {
          window.requestAnimationFrame(() => {
            this._setActivePanelSectionNav(section);
            this._focusActivePanelSection(section);
          });
        }
      });
    },

    _ensureFloatingActionStack() {
      let stack = document.getElementById('floating-action-stack');
      if (!stack) {
        stack = document.createElement('div');
        stack.id = 'floating-action-stack';
        document.body.appendChild(stack);
      } else if (stack.parentElement !== document.body) {
        document.body.appendChild(stack);
      }

      stack.classList.add('floating-action-stack');
      if (stack.dataset.bound !== '1') {
        stack.dataset.bound = '1';

        stack.addEventListener('mouseenter', () => {
          window.clearTimeout(this._floatingDockCollapseTimer);
          this._setFloatingDockExpanded(true);
        });

        stack.addEventListener('mouseleave', () => {
          this._scheduleFloatingDockCollapse(120);
        });

        stack.addEventListener('focusin', () => {
          window.clearTimeout(this._floatingDockCollapseTimer);
          this._setFloatingDockExpanded(true);
        });

        stack.addEventListener('focusout', (event) => {
          if (stack.contains(event.relatedTarget)) return;
          this._scheduleFloatingDockCollapse(120);
        });

        document.addEventListener('pointerdown', (event) => {
          const modalOpen = document.getElementById('settings-modal')?.classList.contains('active');
          if (modalOpen) return;
          if (!stack.contains(event.target)) {
            this._setFloatingDockExpanded(false);
          }
        });

        window.addEventListener('blur', () => {
          this._setFloatingDockExpanded(false);
        });
      }

      return stack;
    },

    _ensureSettingsButton() {
      const stack = this._ensureFloatingActionStack();
      let btn = document.getElementById('settings-btn');
      if (!btn) {
        btn = document.createElement('button');
        btn.id = 'settings-btn';
        stack.appendChild(btn);
      } else if (btn.parentElement !== stack) {
        stack.appendChild(btn);
      }

      btn.type = 'button';
      btn.title = '설정 열기';
      btn.setAttribute('aria-label', '설정 열기');
      btn.innerHTML = `
        <svg class="settings-btn-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="3.2" stroke="currentColor" stroke-width="1.8"></circle>
          <path d="M12 2.5v3M12 18.5v3M5.28 5.28l2.12 2.12M16.6 16.6l2.12 2.12M2.5 12h3M18.5 12h3M5.28 18.72l2.12-2.12M16.6 7.4l2.12-2.12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
        </svg>
      `;
      btn.hidden = false;
      return btn;
    },

    _setSettingsButtonVisible(visible) {
      const stack = this._ensureFloatingActionStack();
      if (!visible) {
        this._setFloatingDockExpanded(false);
      }
      stack.style.opacity = visible ? '1' : '0';
      stack.style.visibility = visible ? 'visible' : 'hidden';
      stack.style.pointerEvents = visible ? 'auto' : 'none';
    },

    _setFloatingDockExpanded(expanded) {
      const stack = document.getElementById('floating-action-stack');
      window.clearTimeout(this._floatingDockCollapseTimer);
      this._floatingDockExpanded = Boolean(expanded);
      if (!stack) return;
      stack.classList.toggle('is-expanded', this._floatingDockExpanded);
    },

    _scheduleFloatingDockCollapse(delay = 0) {
      window.clearTimeout(this._floatingDockCollapseTimer);
      this._floatingDockCollapseTimer = window.setTimeout(() => {
        this._setFloatingDockExpanded(false);
      }, delay);
    },

    _renderSyncDockButtonIcon(button, options = {}) {
      if (!button) return;
      button.innerHTML = `<span class="floating-action-btn-icon-text${options.busy ? ' is-spinning' : ''}" aria-hidden="true">↻</span>`;
    },

    _ensureFloatingActionDock() {
      const stack = this._ensureFloatingActionStack();
      let dock = document.getElementById('floating-action-dock');
      if (!dock) {
        dock = document.createElement('div');
        dock.id = 'floating-action-dock';
        stack.appendChild(dock);
      } else if (dock.parentElement !== stack) {
        stack.appendChild(dock);
      }

      dock.className = 'floating-action-dock';

      const ensureButton = (id, label, title) => {
        let button = document.getElementById(id);
        if (!button) {
          button = document.createElement('button');
          button.id = id;
          dock.appendChild(button);
        } else if (button.parentElement !== dock) {
          dock.appendChild(button);
        }

        button.type = 'button';
        button.hidden = false;
        button.className = 'floating-action-btn';
        button.textContent = label;
        button.title = title;
        button.setAttribute('aria-label', title);
        return button;
      };

      const layoutBtn = ensureButton('layout-mode-btn', '배치', '배치 편집 시작');
      const revertBtn = ensureButton('layout-revert-btn', '원복', '편집 시작 전 배치로 되돌리기');
      const minigameBtn = ensureButton('minigame-dock-btn', '미니게임', '미니게임 열기');
      const quickBtn = ensureButton('quick-add-btn', '추가', '빠른 추가');
      const syncBtn = ensureButton('google-sync-dock-btn', '동기화', 'Google 수동 동기화');

      layoutBtn.classList.remove('is-icon-only');
      revertBtn.classList.remove('is-icon-only');
      minigameBtn.classList.add('is-icon-only', 'is-minigame');
      minigameBtn.textContent = '🦖';
      quickBtn.classList.add('is-icon-only');
      quickBtn.textContent = '+';
      syncBtn.classList.add('is-icon-only');
      this._renderSyncDockButtonIcon(syncBtn);

      if (!layoutBtn.dataset.bound) {
        layoutBtn.dataset.bound = '1';
        layoutBtn.addEventListener('click', () => this._toggleLayoutEditMode());
      }

      if (!quickBtn.dataset.bound) {
        quickBtn.dataset.bound = '1';
        quickBtn.addEventListener('click', () => this._openQuickAdd());
      }

      if (!minigameBtn.dataset.bound) {
        minigameBtn.dataset.bound = '1';
        minigameBtn.addEventListener('click', () => this._openMinigameHub());
      }

      if (!revertBtn.dataset.bound) {
        revertBtn.dataset.bound = '1';
        revertBtn.addEventListener('click', () => this._restoreLayoutEditOrigin());
      }

      if (!syncBtn.dataset.bound) {
        syncBtn.dataset.bound = '1';
        syncBtn.addEventListener('click', () => this._syncGoogleWorkspace());
      }

      this._applyLayoutEditMode();
      this._refreshGoogleSyncDockButton();
      return dock;
    },

    _refreshGoogleSyncDockButton() {
      const button = document.getElementById('google-sync-dock-btn');
      if (!button) return;

      const status = LS.GoogleWorkspace?.getStatus?.() || {};
      const diagnostics = this._getGoogleDiagnosticsSnapshot();
      const syncEnabled = Boolean(status.calendarEnabled || status.tasksEnabled);
      const hasGoogleSetup = Boolean(status.connected || status.hasCachedData || status.nativeConfigured || LS.Config.get('googleClientId'));
      const shouldShow = syncEnabled && hasGoogleSetup;
      const busy = Boolean(this._googleSyncPromise) || Boolean(status.nativeInProgress);
      const stageLabel = this._formatGoogleSyncStage(diagnostics?.debug?.stage);

      button.hidden = !shouldShow;
      button.disabled = busy;
      button.classList.toggle('is-disabled', busy);
      button.classList.toggle('is-busy', busy);
      button.classList.add('is-icon-only');
      this._renderSyncDockButtonIcon(button, { busy });
      button.title = busy
        ? `Google 동기화 중: ${stageLabel}`
        : (status.connected ? 'Google 수동 동기화' : 'Google 로그인 및 연결');
      button.setAttribute('aria-label', button.title);
    },

    _updateSettingsScrollButtons() {
      return;
    },

    _updateSettingsRuntimeTip() {
      const tipEl = document.getElementById('settings-runtime-tip');
      if (!tipEl) return;

      if (!this._isHostedWallpaper()) {
        tipEl.hidden = true;
        tipEl.textContent = '';
        return;
      }

      tipEl.hidden = false;
      if (LS.WallpaperEngine?.isWallpaperEngine) {
        tipEl.textContent = 'Wallpaper Engine에서는 먼저 상태 새로고침과 연결 테스트를 눌러 연결 상태를 확인해 주세요. 응답이 없으면 실행기를 한 번 다시 실행한 뒤 다시 시도하시는 편이 가장 안정적입니다.';
      } else {
        tipEl.textContent = 'Lively에서 텍스트 입력이 되지 않으면 Lively Settings > Wallpaper > Interaction > Wallpaper Input > Keyboard를 켜 주세요. 그다음 월페이퍼 안에서 상태 새로고침과 연결 테스트를 눌러 연결 상태를 확인하시면 됩니다.';
      }
    },

    _setSettingsSaveState(tone = 'neutral', text = '저장됨') {
      const statusEl = document.getElementById('settings-save-status');
      if (statusEl) {
        statusEl.className = `settings-save-status is-${tone}`;
        statusEl.textContent = text;
      }
      // 하단 푸터 힌트도 함께 업데이트
      const hintTextEl = document.getElementById('settings-footer-hint-text');
      const hintWrapEl = document.querySelector('.settings-footer-hint');
      if (hintWrapEl) {
        hintWrapEl.classList.remove('is-dirty', 'is-saved', 'is-neutral', 'is-pending');
        hintWrapEl.classList.add(`is-${tone}`);
      }
      if (hintTextEl) {
        if (tone === 'pending') {
          hintTextEl.textContent = '변경사항이 있습니다. 저장하지 않고 닫으면 사라집니다.';
        } else if (tone === 'saved') {
          hintTextEl.textContent = '모든 변경사항이 저장되었습니다.';
        } else {
          hintTextEl.textContent = '필요한 항목만 바꾸고 저장해 주세요.';
        }
      }
      this._syncSettingsDismissControls();
    },

    _markSettingsDirty(text = '저장 전 변경') {
      if (this._settingsSyncing) return;
      this._settingsDirty = true;
      this._setSettingsSaveState('pending', text);
    },

    _syncSettingsDismissControls() {
      const cancelBtn = document.getElementById('settings-cancel');
      const closeBtn = document.getElementById('settings-close');
      const saveBtn = document.getElementById('settings-save');
      const quickSaveBtn = document.getElementById('quickstart-save-btn');
      const dirty = Boolean(this._settingsDirty);
      const saving = Boolean(this._settingsSaveInProgress);

      if (cancelBtn) {
        cancelBtn.textContent = dirty ? '저장 안 함' : '닫기';
        cancelBtn.disabled = saving;
      }
      if (closeBtn) {
        closeBtn.setAttribute('aria-label', dirty ? '저장하지 않고 설정 닫기' : '설정 닫기');
        closeBtn.title = dirty ? '저장 안 함' : '닫기';
        closeBtn.disabled = saving;
      }
      if (saveBtn) {
        saveBtn.textContent = saving ? '저장 중...' : '저장';
        saveBtn.disabled = saving || !dirty;
      }
      if (quickSaveBtn) {
        quickSaveBtn.textContent = saving ? '저장 중...' : (dirty ? '지금 저장' : '저장 완료');
        quickSaveBtn.disabled = saving || !dirty;
      }
    },

    _bindSettingsDirtyTracking() {
      const modal = document.getElementById('settings-modal');
      if (!modal || modal.dataset.dirtyBound === '1') return;

      modal.dataset.dirtyBound = '1';
      modal.querySelectorAll('input, select, textarea').forEach((field) => {
        if (field.dataset.settingsDirtyBound === '1') return;
        field.dataset.settingsDirtyBound = '1';
        ['input', 'change'].forEach((eventName) => {
          field.addEventListener(eventName, () => {
            if (this._settingsSyncing) return;
            this._markSettingsDirty();
            this._refreshQuickStartOverview();
            this._refreshWidgetSettingsSummary();
            this._renderSettingsPanelIntro();
          });
        });
      });
    },

    _bindGoogleSettingsLiveSync() {
      const syncIds = new Set([
        'google-calendar-sync-check',
        'google-tasks-sync-check',
        'google-calendar-select',
        'google-tasklist-select'
      ]);

      [
        'google-client-id-input',
        'google-calendar-sync-check',
        'google-tasks-sync-check',
        'google-calendar-select',
        'google-tasklist-select'
      ].forEach((id) => {
        const field = document.getElementById(id);
        if (!field || field.dataset.googleLiveBound === '1') return;
        field.dataset.googleLiveBound = '1';

        const handler = () => {
          if (this._settingsSyncing) return;
          this._saveGoogleSettingsDraft();
          this._refreshGoogleSettingsStatus();
          if (syncIds.has(id)) {
            this._scheduleGoogleSettingsResync();
          }
        };

        ['input', 'change'].forEach((eventName) => {
          field.addEventListener(eventName, handler);
        });
      });
    },

    _scheduleGoogleSettingsResync() {
      clearTimeout(this._googleSettingsResyncTimer);
      this._googleSettingsResyncTimer = setTimeout(async () => {
        const status = LS.GoogleWorkspace?.getStatus?.() || {};
        if (!status.connected) return;

        try {
          await this._runGoogleSync({ interactive: false, silent: true });
          await this._refreshDataWithOptions({ syncGoogle: false });
          this._refreshGoogleSettingsStatus();
          this._setSettingsSaveState('saved', 'Google 설정 즉시 반영됨');
        } catch {
          this._refreshGoogleSettingsStatus();
        }
      }, 350);
    },

    _getGoogleDraftValidation() {
      const draft = this._collectGoogleSettingsFromForm();
      const status = LS.GoogleWorkspace?.getStatus?.() || {};
      const clientId = String(draft.googleClientId || '').trim();
      const currentOrigin = String(window.location.origin || '').trim();
      const recommendedOrigin = String(status.recommendedOrigin || LS.Config?.get?.('localLauncherOrigin') || '').trim();
      const looksLikeClientId = /^[0-9]+-[a-z0-9._-]+\.apps\.googleusercontent\.com$/i.test(clientId);
      const nativeConfigured = Boolean(status.nativeConfigured);
      const interactiveSupported = Boolean(status.interactiveSupported);
      const originMatches = nativeConfigured || !interactiveSupported || !recommendedOrigin || currentOrigin === recommendedOrigin;
      const issues = [];

      if (!nativeConfigured) {
        if (!clientId) {
          issues.push('Google 로그인 준비가 아직 완료되지 않았습니다. 앱을 다시 실행한 뒤 다시 시도해 주세요.');
        } else if (!looksLikeClientId) {
          issues.push('Google 로그인 설정이 올바르지 않습니다. 앱 준비 상태를 확인해 주세요.');
        }

        if (!interactiveSupported) {
          issues.push('현재 창에서는 Google 로그인 창을 열 수 없습니다. 브라우저 미리보기 창에서 다시 시도해 주세요.');
        } else if (!originMatches) {
          issues.push('현재 실행 환경에서는 Google 로그인 창을 바로 열 수 없습니다. 브라우저 미리보기 창에서 다시 시도해 주세요.');
        }
      }

      return {
        draft,
        status,
        clientId,
        looksLikeClientId,
        nativeConfigured,
        interactiveSupported,
        currentOrigin,
        recommendedOrigin,
        originMatches,
        issues
      };
    },

    _bindMirroredFieldPair(primaryId, secondaryId) {
      const primary = document.getElementById(primaryId);
      const secondary = document.getElementById(secondaryId);
      if (!primary || !secondary) return;

      const bind = (source, target) => {
        const attrName = `data-mirror-${target.id}`;
        if (source.getAttribute(attrName) === '1') return;
        source.setAttribute(attrName, '1');

        ['input', 'change'].forEach((eventName) => {
          source.addEventListener(eventName, () => {
            if (target.value !== source.value) {
              target.value = source.value;
            }
            this._refreshQuickStartOverview();
          });
        });
      };

      bind(primary, secondary);
      bind(secondary, primary);
    },

    _getFormFieldValue(primaryId, fallback = '') {
      const field = document.getElementById(primaryId);
      if (field) {
        return field.value ?? fallback;
      }
      return fallback;
    },

    _getSettingsTimetableContext() {
      const roleValue = this._getFormFieldValue(
        'homeroom-role-select',
        this._getTeacherRoleFromClassValue(LS.Config.get('classNum'))
      ) === 'nonhomeroom'
        ? 'nonhomeroom'
        : 'homeroom';
      const grade = parseInt(this._getFormFieldValue('grade-select', LS.Config.get('grade')), 10) || 0;
      const classValue = roleValue === 'nonhomeroom'
        ? LS.Config.getNonHomeroomValue()
        : (this._getSelectedClassValue() || LS.Config.get('classNum') || '1');
      const classNum = LS.Config.normalizeClassNum(classValue);
      const timetableMode = parseInt(this._getFormFieldValue('timetable-mode-select', LS.Config.get('timetableMode')), 10) || 0;

      return {
        roleValue,
        grade,
        classNum,
        timetableMode
      };
    },

    _getSettingsTimetableConfigFromForm() {
      const getInt = (id, fallback) => parseInt(this._getFormFieldValue(id, fallback), 10) || fallback;
      const afterSchoolEl = document.getElementById('afterschool-check');
      const context = this._getSettingsTimetableContext();

      return {
        ...LS.Config._config,
        grade: context.grade,
        classNum: context.classNum,
        timetableMode: context.timetableMode,
        startTime: this._getFormFieldValue('start-time-input', LS.Config.get('startTime')) || '08:20',
        morningMinutes: getInt('morning-min-input', LS.Config.get('morningMinutes') || 10),
        classMinutes: getInt('class-min-input', LS.Config.get('classMinutes') || 50),
        breakMinutes: getInt('break-min-input', LS.Config.get('breakMinutes') || 10),
        lunchMinutes: getInt('lunch-min-input', LS.Config.get('lunchMinutes') || 60),
        lunchAfterPeriod: getInt('lunch-after-select', LS.Config.get('lunchAfterPeriod') || 1),
        totalPeriods: getInt('total-periods-select', LS.Config.get('totalPeriods') || 1),
        afterSchoolEnabled: afterSchoolEl ? Boolean(afterSchoolEl.checked) : Boolean(LS.Config.get('afterSchoolEnabled')),
        afterSchoolMinutes: getInt('afterschool-min-input', LS.Config.get('afterSchoolMinutes') || 70),
        afterSchoolDays: this._getFormFieldValue('afterschool-days-input', LS.Config.get('afterSchoolDays')) || '1,3,5'
      };
    },

    _getSettingsTimetablePeriods() {
      return LS.Helpers.calculatePeriods(this._getSettingsTimetableConfigFromForm());
    },

    _getManualTeacherTimetableContextKey() {
      const context = this._getSettingsTimetableContext();
      return `${LS.Config.getSchoolContextKey()}:${context.grade}:${context.classNum}:1`;
    },

    _getLegacyAutoTeacherTimetableContextKey() {
      const context = this._getSettingsTimetableContext();
      return `${LS.Config.getSchoolContextKey()}:${context.grade}:${context.classNum}:0`;
    },

    _cloneTeacherTimetableData(value) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
      return JSON.parse(JSON.stringify(value));
    },

    _readTeacherTimetableForSettings() {
      const manualKey = `teacherTimetable:${this._getManualTeacherTimetableContextKey()}`;
      const legacyAutoKey = `teacherTimetable:${this._getLegacyAutoTeacherTimetableContextKey()}`;
      const currentScopedKey = `teacherTimetable:${LS.Config.getClassroomContextKey()}`;
      const candidates = [manualKey, legacyAutoKey, currentScopedKey, 'teacherTimetable']
        .filter((key, index, list) => key && list.indexOf(key) === index);

      for (const key of candidates) {
        const stored = LS.Storage.get(key, null);
        if (!stored || typeof stored !== 'object' || Array.isArray(stored)) continue;
        const cloned = this._cloneTeacherTimetableData(stored);
        if (key !== manualKey) {
          LS.Storage.set(manualKey, cloned);
        }
        return cloned;
      }

      return {};
    },

    _writeTeacherTimetableForSettings(data) {
      LS.Storage.set(
        `teacherTimetable:${this._getManualTeacherTimetableContextKey()}`,
        this._cloneTeacherTimetableData(data)
      );
    },

    _scheduleSettingsTeacherTimetableRefresh() {
      window.clearTimeout(this._settingsTimetableRefreshTimer);
      this._settingsTimetableRefreshTimer = window.setTimeout(async () => {
        await LS.TimetableWidget.refresh();
        this._refreshWidgetSettingsSummary();
      }, 180);
    },

    _refreshTimetableSettingsViews() {
      this._renderPeriodPreview();
      this._renderSettingsTimetableEditor();
      this._refreshWidgetSettingsSummary();
      this._renderSettingsPanelIntro(this._activeSettingsTab || 'quickstart');
    },

    _syncQuickStartForm() {
      const setVal = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.value = value ?? '';
      };

      setVal('quick-neis-key-input', this._getFormFieldValue('neis-key-input', LS.Config.get('neisApiKey')));
      setVal('quick-school-name-input', this._getFormFieldValue('school-name-input', LS.Config.get('schoolName')));
      setVal('quick-weather-mode-select', this._getFormFieldValue('weather-mode-select', typeof LS.Config.getWeatherProviderMode === 'function' ? LS.Config.getWeatherProviderMode() : 'proxy'));
      setVal('quick-weather-key-input', this._getFormFieldValue('weather-key-input', LS.Config.get('weatherApiKey')));
      setVal('quick-grade-select', this._getFormFieldValue('grade-select', LS.Config.get('grade')));
      setVal('quick-timetable-mode-select', this._getFormFieldValue('timetable-mode-select', LS.Config.get('timetableMode')));
      setVal('quick-homeroom-role-select', this._getFormFieldValue('homeroom-role-select', this._getTeacherRoleFromClassValue(LS.Config.get('classNum'))));
      setVal('quick-class-input', this._getFormFieldValue('class-input', LS.Config.isNonHomeroomClass(LS.Config.get('classNum')) ? '' : LS.Config.get('classNum')));
      setVal('quick-class-preset-select', this._getClassPresetValue(this._getSelectedClassValue('main') || LS.Config.get('classNum')));
      this._syncClassPresetInput(undefined, 'quick');
      this._syncWeatherProviderControls();
    },

    async _openApiGuide(type) {
      const isWeather = type === 'weather';
      const title = isWeather ? '개인 OpenWeather API 키 사용 안내' : 'NEIS 직접 키 사용 안내';
      const message = isWeather
        ? '기본 서버로 바로 시작할 수는 있지만, 가장 빠르고 안정적인 사용은 개인 키 직접 연결을 권장합니다. 개인 키는 이 PC에만 저장됩니다.'
        : '일반 사용자는 기본 학교 서버를 사용하시면 됩니다. 직접 키가 꼭 필요한 특수한 운영 환경일 때만 참고해 주세요.';
      const guideText = isWeather
        ? [
            '1. https://openweathermap.org 에서 무료 회원가입을 합니다.',
            '2. 상단 메뉴 또는 계정 페이지에서 API Keys 화면으로 들어갑니다.',
            '3. 기본 키를 복사하거나 새 키를 하나 생성합니다.',
            '4. 처음 발급한 키는 활성화까지 몇 분 정도 걸릴 수 있습니다.',
            '5. 이 설정창에서 "내 API 키 사용 (성능 추천)"을 선택한 뒤 키를 붙여넣고 저장합니다.',
            '6. 입력한 키는 이 PC에만 저장되고, 기본 서버 대신 개인 키로 직접 조회합니다.',
            '7. 공용 기본 서버는 바로 쓸 수 있지만, 응답 속도와 사용량 면에서는 개인 키 쪽이 더 유리합니다.'
          ].join('\n')
        : [
            '1. 기본 학교 서버를 쓰는 일반 사용자라면 이 절차가 필요하지 않습니다.',
            '2. 직접 키가 꼭 필요한 운영 환경이면 https://open.neis.go.kr 에 로그인합니다.',
            '3. 인증키 신청 메뉴에서 활용 용도를 작성해 승인받습니다.',
            '4. 발급된 키를 운영 환경에만 별도로 설정합니다.',
            '5. 일반 사용자 설정창에는 직접 키 입력을 노출하지 않는 것을 권장합니다.'
          ].join('\n');

      await LS.Helpers.promptModal(title, [
        {
          id: 'guide',
          type: 'textarea',
          label: '발급 절차',
          value: guideText,
          readonly: true,
          rows: isWeather ? 9 : 9
        }
      ], {
        message,
        confirmText: '닫기',
        showCancel: false
      });
    },

    _collectGoogleSettingsFromForm() {
      const googleStatus = LS.GoogleWorkspace?.getStatus?.() || {};
      const getVal = (id, fallback = '') => this._getFormFieldValue(id, fallback);
      const getChecked = (id, fallback = false) => {
        const el = document.getElementById(id);
        return el ? Boolean(el.checked) : Boolean(fallback);
      };

      return {
        googleClientId: String(getVal('google-client-id-input', LS.Config.get('googleClientId')) || '').trim(),
        googleCalendarSyncEnabled: getChecked('google-calendar-sync-check', LS.Config.get('googleCalendarSyncEnabled')),
        googleTasksSyncEnabled: getChecked('google-tasks-sync-check', LS.Config.get('googleTasksSyncEnabled')),
        googleCalendarId: String(getVal('google-calendar-select', googleStatus.selectedCalendarId || LS.Config.get('googleCalendarId')) || 'primary'),
        googleTasklistId: String(getVal('google-tasklist-select', googleStatus.selectedTasklistId || LS.Config.get('googleTasklistId')) || '@default')
      };
    },

    _saveGoogleSettingsDraft() {
      const nextConfig = this._collectGoogleSettingsFromForm();
      LS.Config.setMultiple(nextConfig);
      return nextConfig;
    },

    _collectLeaderboardSettingsFromForm() {
      const statusSnapshot = LS.Leaderboard?.getStatus?.() || {};
      const firebaseConfig = statusSnapshot.firebaseConfig || {};
      const getVal = (id, fallback = '') => this._getFormFieldValue(id, fallback);

      return {
        minigameLeaderboardProvider: 'firebase',
        minigameSeasonId: String(getVal('leaderboard-season-id-input', statusSnapshot.seasonId || LS.Config.get('minigameSeasonId') || 'season-1') || 'season-1').trim(),
        firebaseProjectId: String(getVal('firebase-project-id-input', firebaseConfig.projectId || LS.Config.get('firebaseProjectId')) || '').trim(),
        firebaseApiKey: String(getVal('firebase-api-key-input', firebaseConfig.apiKey || LS.Config.get('firebaseApiKey')) || '').trim(),
        firebaseAuthDomain: String(getVal('firebase-auth-domain-input', firebaseConfig.authDomain || LS.Config.get('firebaseAuthDomain')) || '').trim(),
        firebaseAppId: String(getVal('firebase-app-id-input', firebaseConfig.appId || LS.Config.get('firebaseAppId')) || '').trim(),
        firebaseStorageBucket: String(getVal('firebase-storage-bucket-input', firebaseConfig.storageBucket || LS.Config.get('firebaseStorageBucket')) || '').trim(),
        firebaseMessagingSenderId: String(getVal('firebase-messaging-sender-id-input', firebaseConfig.messagingSenderId || LS.Config.get('firebaseMessagingSenderId')) || '').trim(),
        firebaseMeasurementId: String(getVal('firebase-measurement-id-input', firebaseConfig.measurementId || LS.Config.get('firebaseMeasurementId')) || '').trim()
      };
    },

    _bindLeaderboardSettingsLiveSync() {
      [
        'leaderboard-provider-select',
        'leaderboard-season-id-input',
        'firebase-project-id-input',
        'firebase-api-key-input',
        'firebase-auth-domain-input',
        'firebase-app-id-input',
        'firebase-storage-bucket-input',
        'firebase-messaging-sender-id-input',
        'firebase-measurement-id-input'
      ].forEach((id) => {
        const field = document.getElementById(id);
        if (!field || field.dataset.leaderboardLiveBound === '1') return;
        field.dataset.leaderboardLiveBound = '1';

        const handler = () => {
          if (this._settingsSyncing) return;
          this._refreshLeaderboardSettingsStatus();
        };

        ['input', 'change'].forEach((eventName) => {
          field.addEventListener(eventName, handler);
        });
      });
    },

    _refreshLeaderboardSettingsStatus() {
      const statusBox = document.getElementById('leaderboard-status-display');
      if (!statusBox) return;

      const escapeHtml = (value) => LS.Helpers?.escapeHtml?.(String(value ?? '')) || String(value ?? '');
      const draft = this._collectLeaderboardSettingsFromForm();
      const status = LS.Leaderboard?.getStatus?.(draft) || {
        provider: 'firebase',
        seasonId: draft.minigameSeasonId || 'season-1',
        usingFirebase: false,
        canUseFirebase: false,
        hasFirebaseConfig: false,
        missingFirebaseKeys: []
      };
      const runtime = LS.Leaderboard?.getRuntimeStatus?.() || {
        phase: 'idle',
        ready: false,
        authReady: false,
        checkedAt: '',
        lastError: ''
      };

      const providerLabel = 'Firebase Firestore';
      const badgeClass = runtime.ready
        ? 'connected'
        : (runtime.phase === 'error' ? 'cached' : (status.canUseFirebase ? 'connected' : 'cached'));
      const badgeText = runtime.phase === 'warming'
        ? '연결 확인 중'
        : (runtime.ready ? '실연결 확인됨' : (status.canUseFirebase ? '연결 대기' : '설정 보완 필요'));
      const updatedLabel = runtime.checkedAt
        ? new Date(runtime.checkedAt).toLocaleString('ko-KR')
        : '아직 검사 전';
      const message = runtime.ready
        ? 'Firebase 익명 인증과 읽기/쓰기 테스트가 완료되었습니다. 이제 모든 게임 기록은 Firestore로만 저장됩니다.'
        : runtime.phase === 'error'
        ? `Firebase 연결 확인에 실패했습니다: ${runtime.lastError || '원인 미상'}`
        : status.canUseFirebase
        ? 'Firebase 설정은 읽혔습니다. 앱 시작 시 자동으로 익명 인증과 읽기/쓰기 테스트를 진행합니다.'
        : `Firebase를 쓰려면 다음 항목을 채워 주세요: ${status.missingFirebaseKeys.join(', ') || '필수 웹 앱 설정'}`;

      document.querySelectorAll('[data-leaderboard-firebase-field="1"]').forEach((row) => {
        row.hidden = false;
        row.classList.remove('is-collapsed');
      });

      statusBox.innerHTML = `
        <div class="google-status-head">
          <span class="google-status-badge is-${badgeClass}">${escapeHtml(badgeText)}</span>
          <span class="google-status-updated">${escapeHtml(updatedLabel)}</span>
        </div>
        <div class="google-status-lines">
          <div><strong>현재 저장소</strong> ${escapeHtml(providerLabel)}</div>
          <div><strong>시즌 ID</strong> ${escapeHtml(status.seasonId || 'season-1')}</div>
          <div><strong>프로젝트</strong> ${escapeHtml(draft.firebaseProjectId || status.firebaseConfig?.projectId || '미입력')}</div>
          <div><strong>익명 인증</strong> ${runtime.authReady ? '인증 완료' : '콘솔 활성화 + 앱 자동 로그인'}</div>
          <div><strong>쓰기 테스트</strong> ${runtime.writeReady ? '통과' : '미확인'}</div>
          ${runtime.lastError ? `<div class="google-status-error">${escapeHtml(runtime.lastError)}</div>` : ''}
          <div>${escapeHtml(message)}</div>
        </div>
      `;

      this._applyEmbeddedLeaderboardUi();
    },

    _applyEmbeddedLeaderboardUi() {
      document.querySelector('[data-panel-focus="leaderboard"]')?.setAttribute('hidden', 'hidden');
      document.querySelector('[data-panel-section="leaderboard"]')?.setAttribute('hidden', 'hidden');
    },

    _resolveGoogleOptionSelection(options, selectedValue, kind = 'calendar') {
      const items = Array.isArray(options) ? options : [];
      const preferred = String(selectedValue || '').trim();
      if (!items.length) return null;

      const exact = items.find((item) => item.id === preferred);
      if (exact) return exact;

      if (kind === 'calendar') {
        return items.find((item) => item.primary)
          || items.find((item) => item.writable)
          || items[0];
      }

      return items[0];
    },

    _populateGoogleSelect(selectId, options, selectedValue, fallbackLabel, kind = 'calendar') {
      const selectEl = document.getElementById(selectId);
      if (!selectEl) return;

      const items = Array.isArray(options) ? options : [];
      selectEl.replaceChildren();
      if (!items.length) {
        const fallbackOption = document.createElement('option');
        fallbackOption.value = String(selectedValue || '');
        fallbackOption.textContent = String(fallbackLabel || '');
        selectEl.appendChild(fallbackOption);
        selectEl.value = selectedValue || '';
        selectEl.disabled = true;
        return;
      }

      selectEl.disabled = false;
      items.forEach((item) => {
        const label = item.summary || item.title || item.name || item.id;
        const suffix = item.primary ? ' (기본)' : (!item.writable ? ' (읽기 전용)' : '');
        const optionEl = document.createElement('option');
        optionEl.value = String(item.id || '');
        optionEl.textContent = String(label + suffix);
        selectEl.appendChild(optionEl);
      });

      const resolved = this._resolveGoogleOptionSelection(items, selectedValue, kind);
      selectEl.value = resolved?.id || items[0].id;
    },

    _getGoogleDiagnosticsSnapshot() {
      const cached = LS.GoogleWorkspace?.getCachedDiagnostics?.() || {};
      const previous = this._lastGoogleDiagnostics || {};
      const merged = {
        ...previous,
        ...cached,
        debug: cached.debug || previous.debug || null
      };

      if (previous.testSummary) merged.testSummary = previous.testSummary;
      if (previous.testError) merged.testError = previous.testError;
      if (previous.testedAt) merged.testedAt = previous.testedAt;
      return merged;
    },

    _formatGoogleSyncStage(stage = '') {
      const stageMap = {
        start: '동기화 준비 중',
        'token-ready': 'Google 인증 확인 중',
        'token-missing': '로그인이 필요합니다',
        'account-ready': '계정 정보 확인 중',
        'lists-ready': '캘린더/할 일 목록 확인 중',
        'delete-queue-flushed': '삭제 대기 항목 정리 중',
        'remote-fetched': 'Google 변경분 불러오는 중',
        'remote-merged': '가져온 변경을 월페이퍼에 반영하는 중',
        'push-local-calendars': '월페이퍼 일정을 Google Calendar에 반영하는 중',
        'push-local-tasks': '월페이퍼 할 일을 Google Tasks에 반영하는 중',
        success: '동기화 완료',
        error: '동기화 실패',
        'health-check-success': '연결 테스트 완료',
        'health-check-error': '연결 테스트 실패'
      };
      return stageMap[String(stage || '').trim()] || '상태 확인 중';
    },

    _buildGoogleSyncSummary(status, diagnostics) {
      const debug = diagnostics?.debug;
      if (!debug || typeof debug !== 'object') {
        return '';
      }

      const pulledCount =
        Number(debug.remoteCalendarsCreated || 0) +
        Number(debug.remoteCalendarsUpdated || 0) +
        Number(debug.remoteTasksCreated || 0) +
        Number(debug.remoteTasksUpdated || 0);
      const pushedCount =
        Number(debug.pushedCalendarCreates || 0) +
        Number(debug.pushedCalendarUpdates || 0) +
        Number(debug.pushedTaskCreates || 0) +
        Number(debug.pushedTaskUpdates || 0);
      const reboundCount =
        Number(debug.pushedCalendarRebinds || 0) +
        Number(debug.pushedTaskRebinds || 0);
      const cleanupCount = Number(debug.remoteTasksRemoved || 0);
      const localChangeCount = Number(debug.localRecordChanges || 0);
      const parts = [];

      if (pulledCount > 0) {
        parts.push(`가져옴 ${pulledCount}건`);
      }
      if (pushedCount > 0) {
        parts.push(`보냄 ${pushedCount}건`);
      }
      if (reboundCount > 0) {
        parts.push(`재연결 ${reboundCount}건`);
      }
      if (localChangeCount > 0) {
        parts.push(`로컬 반영 ${localChangeCount}건`);
      }
      if (cleanupCount > 0) {
        parts.push(`정리 ${cleanupCount}건`);
      }
      if (Number(debug.remainingDeleteQueue || 0) > 0) {
        parts.push(`삭제 대기 ${debug.remainingDeleteQueue}건`);
      }

      if (parts.length) {
        return parts.join(' / ');
      }
      if (debug.stage === 'success') {
        return `일정 ${status.calendarCount || 0}건 / 할 일 ${status.taskCount || 0}건 확인됨`;
      }
      return '';
    },

    _formatGoogleErrorMessage(error, diagnostics = null) {
      const raw = String(error?.message || '').trim();

      if (diagnostics?.bridgeReachable === false) {
        return '연결 확인 도구에 응답이 없습니다. 앱을 다시 실행한 뒤 상태 새로고침을 눌러 주세요.';
      }
      if (/invalid_grant/i.test(raw)) {
        return 'Google 연결이 만료되었거나 취소되었습니다. 다시 로그인을 눌러 주세요.';
      }
      if (/access blocked|app not verified/i.test(raw)) {
        return 'Google Cloud 테스트 사용자 또는 검수 상태 때문에 로그인이 차단되었습니다.';
      }
      if (/api.*disabled|accessnotconfigured|has not been used/i.test(raw)) {
        return 'Google Calendar API 또는 Google Tasks API가 아직 활성화되지 않았습니다.';
      }
      if (/network|연결하지 못했습니다|timed out|timeout/i.test(raw)) {
        return 'Google 서버에 닿지 못했습니다. 네트워크, VPN, 방화벽 상태를 확인한 뒤 연결 테스트를 다시 눌러 주세요.';
      }
      return raw || '원인을 알 수 없는 오류가 발생했습니다.';
    },

    _formatGoogleDuplicateMember(item) {
      if (!item || typeof item !== 'object') {
        return '항목 정보 없음';
      }

      const parts = [];
      if (item.contextLabel) parts.push(item.contextLabel);
      if (item.containerName) parts.push(item.containerName);
      if (item.archived) parts.push('보관됨');
      if (item.readOnly) parts.push('읽기 전용');
      if (item.remoteId) parts.push(`remote ${String(item.remoteId).slice(-10)}`);
      return parts.join(' / ') || (item.title || '항목');
    },

    _buildGoogleDuplicateInspectionText(inspection) {
      if (!inspection || typeof inspection !== 'object') {
        return '[중복 점검 결과]\n- 결과를 불러오지 못했습니다.';
      }

      const lines = [
        '[중복 점검 결과]',
        `- 중복 그룹: ${Number(inspection.totalGroups || 0)}개`,
        `- 자동 정리 가능: ${Number(inspection.actionableGroups || 0)}개`,
        `- 자동 정리 불가: ${Number(inspection.blockedGroups || 0)}개`,
        `- 삭제 예정 로컬 기록: ${Number(inspection.actionableLocalDeleteCount || 0)}건`,
        `- 삭제 예정 Google 일정: ${Number(inspection.actionableCalendarDeleteCount || 0)}건`,
        `- 삭제 예정 Google 할 일: ${Number(inspection.actionableTaskDeleteCount || 0)}건`
      ];

      const groups = Array.isArray(inspection.groups) ? inspection.groups : [];
      if (!groups.length) {
        lines.push('');
        lines.push('중복 후보가 없습니다.');
        return lines.join('\n');
      }

      groups.forEach((group, index) => {
        lines.push('');
        lines.push(`[${index + 1}] ${group.kind === 'task' ? '할 일' : '일정'} / ${group.title || '제목 없음'}`);
        if (group.contextLabel) {
          lines.push(`- 기준: ${group.contextLabel}`);
        }
        if (group.containerName || group.containerId) {
          lines.push(`- 위치: ${group.containerName || group.containerId}`);
        }
        lines.push(`- 유지: ${this._formatGoogleDuplicateMember(group.keep)}`);
        (group.remove || []).forEach((item) => {
          lines.push(`- 삭제: ${this._formatGoogleDuplicateMember(item)}`);
        });
        if (!group.canAutoClean && group.blockedReason) {
          lines.push(`- 주의: ${group.blockedReason}`);
        }
      });

      return lines.join('\n');
    },

    async _reloadGoogleSettingsStatus(options = {}) {
      if (this._googleStatusRefreshPromise) {
        return this._googleStatusRefreshPromise;
      }

      const refreshTask = (async () => {
        try {
          await LS.GoogleWorkspace?.refreshStatus?.({ emit: false });
        } catch {
          // 상태 카드는 캐시된 정보로도 그릴 수 있다.
        }

        try {
          this._lastGoogleDiagnostics = await LS.GoogleWorkspace?.getDiagnostics?.({ refresh: false }) || {};
        } catch {
          this._lastGoogleDiagnostics = LS.GoogleWorkspace?.getCachedDiagnostics?.() || {};
        }

        this._refreshGoogleSettingsStatus();
        if (options.toast) {
          const reachable = this._lastGoogleDiagnostics?.bridgeReachable !== false;
          LS.Helpers.showToast(
            reachable ? 'Google 상태를 다시 확인했습니다.' : '연결 확인 도구에 응답이 없어 마지막으로 확인된 상태를 표시합니다.',
            reachable ? 'info' : 'warning',
            2200
          );
        }
        return this._lastGoogleDiagnostics;
      })();

      this._googleStatusRefreshPromise = refreshTask.finally(() => {
        this._googleStatusRefreshPromise = null;
      });
      return this._googleStatusRefreshPromise;
    },

    async _runGoogleWorkspaceTest() {
      let diagnostics = null;
      try {
        const result = await LS.GoogleWorkspace?.testConnection?.({ interactive: false });
        diagnostics = result?.diagnostics || await LS.GoogleWorkspace?.getDiagnostics?.({ refresh: false }) || {};
        this._lastGoogleDiagnostics = {
          ...diagnostics,
          testedAt: diagnostics?.testedAt || new Date().toISOString(),
          testOk: true,
          testError: '',
          testSummary: `계정 ${result?.accountEmail || '확인됨'} / 캘린더 ${result?.calendarOptionCount || 0}개 / 할 일 목록 ${result?.tasklistOptionCount || 0}개`
        };
        this._refreshGoogleSettingsStatus();
        LS.Helpers.showToast(
          `Google 테스트 성공: 캘린더 ${result?.calendarOptionCount || 0}개 / 할 일 목록 ${result?.tasklistOptionCount || 0}개`,
          'success',
          3000
        );
      } catch (error) {
        diagnostics = await this._reloadGoogleSettingsStatus().catch(() => this._getGoogleDiagnosticsSnapshot());
        this._lastGoogleDiagnostics = {
          ...(diagnostics || {}),
          testedAt: new Date().toISOString(),
          testOk: false,
          testError: this._formatGoogleErrorMessage(error, diagnostics),
          testSummary: ''
        };
        this._refreshGoogleSettingsStatus();
        LS.Helpers.showToast(`Google 테스트 실패: ${this._lastGoogleDiagnostics.testError}`, 'error', 4200);
      }
    },

    _getGoogleLocalPath(diagnostics, kind = 'data') {
      const info = diagnostics || {};
      if (kind === 'config') {
        return {
          target: String(info.configSource || '').trim(),
          kind: 'file',
          emptyMessage: '연동 준비 파일 위치를 아직 찾지 못했습니다. 상태 새로고침을 먼저 눌러 주세요.'
        };
      }

      return {
        target: String(info.dataRoot || '').trim(),
        kind: 'folder',
        emptyMessage: 'Google 데이터 폴더 위치를 아직 찾지 못했습니다. 상태 새로고침을 먼저 눌러 주세요.'
      };
    },

    async _openGoogleLocalTarget(kind = 'data') {
      const diagnostics = await this._reloadGoogleSettingsStatus().catch(() => this._getGoogleDiagnosticsSnapshot());
      const targetInfo = this._getGoogleLocalPath(diagnostics, kind);
      if (!targetInfo.target) {
        LS.Helpers.showToast(targetInfo.emptyMessage, 'warning', 3200);
        return;
      }

      if (diagnostics?.bridgeReachable === false) {
        LS.Helpers.showToast('연결 확인 도구가 응답하지 않아 파일이나 폴더를 바로 열 수 없습니다. 앱을 다시 실행해 주세요.', 'warning', 3600);
        return;
      }

      try {
        await LS.GoogleWorkspace?.openLocalTarget?.(targetInfo.target, targetInfo.kind);
      } catch (error) {
        LS.Helpers.showToast(`열기 실패: ${this._formatGoogleErrorMessage(error, diagnostics)}`, 'error', 3600);
      }
    },

    async _showGoogleDiagnostics() {
      const diagnostics = await this._reloadGoogleSettingsStatus().catch(() => this._getGoogleDiagnosticsSnapshot());
      let duplicateInspection = null;
      try {
        duplicateInspection = await LS.GoogleWorkspace?.inspectDuplicates?.();
      } catch {
        duplicateInspection = null;
      }
      const storageModeMap = {
        bridge: '공유 브리지',
        indexeddb: '브라우저 IndexedDB',
        localstorage: '브라우저 localStorage',
        unknown: '확인 중'
      };
      const expiresLabel = diagnostics?.expiresAt
        ? new Date(diagnostics.expiresAt).toLocaleString('ko-KR')
        : '없음';
      const lines = [
        `[현재 상태]`,
        `- 브리지 응답: ${diagnostics?.bridgeReachable === false ? '없음' : '있음'}`,
        `- 저장 백엔드: ${storageModeMap[diagnostics?.storageMode] || diagnostics?.storageMode || '확인 중'}`,
        `- OAuth JSON: ${diagnostics?.configSource || '미확인'}`,
        `- 데이터 폴더: ${diagnostics?.dataRoot || '미확인'}`,
        `- 계정: ${diagnostics?.accountEmail || diagnostics?.accountName || '미연결'}`,
        `- 연결 상태: ${diagnostics?.connected ? '연결됨' : '미연결'}`,
        `- 갱신 토큰: ${diagnostics?.hasRefreshToken ? '있음' : '없음'}`,
        `- access token 만료 시각: ${expiresLabel}`,
        `- 권한 누락: ${diagnostics?.missingScopes ? '있음' : '없음'}`,
        `- 최근 동기화: ${diagnostics?.lastSyncAt ? new Date(diagnostics.lastSyncAt).toLocaleString('ko-KR') : '없음'}`,
        `- 최근 진단 단계: ${diagnostics?.debug?.stage ? this._formatGoogleSyncStage(diagnostics.debug.stage) : '없음'}`,
        `- 최근 진단 시간: ${diagnostics?.debug?.updatedAt ? new Date(diagnostics.debug.updatedAt).toLocaleString('ko-KR') : '없음'}`
      ];

      if (diagnostics?.bridgeStoragePath) {
        lines.push(`- 공유 저장소 파일: ${diagnostics.bridgeStoragePath}`);
      }
      if (diagnostics?.selectedCalendarId) {
        lines.push(`- 선택 캘린더: ${diagnostics.selectedCalendarId}`);
      }
      if (diagnostics?.selectedTasklistId) {
        lines.push(`- 선택 할 일 목록: ${diagnostics.selectedTasklistId}`);
      }
      if (duplicateInspection) {
        lines.push(`- 중복 후보: ${duplicateInspection.totalGroups || 0}개 그룹 / 삭제 예정 ${duplicateInspection.actionableLocalDeleteCount || 0}건`);
      }
      if (diagnostics?.testError) {
        lines.push('');
        lines.push('[최근 테스트 오류]');
        lines.push(diagnostics.testError);
      } else if (diagnostics?.testSummary) {
        lines.push('');
        lines.push('[최근 테스트 결과]');
        lines.push(diagnostics.testSummary);
      }
      if (diagnostics?.lastError) {
        lines.push('');
        lines.push('[최근 동기화 오류]');
        lines.push(diagnostics.lastError);
      }
      if (duplicateInspection?.totalGroups) {
        lines.push('');
        lines.push(this._buildGoogleDuplicateInspectionText(duplicateInspection));
      }

      await LS.Helpers.promptModal('Google 상태 요약', [
        {
          id: 'google-diagnostics',
          type: 'textarea',
          label: '상태 요약',
          value: lines.join('\n'),
          readonly: true,
          rows: 22
        }
      ], {
        message: '연결 상태, 최근 동기화, 확인이 필요한 항목을 한 번에 볼 수 있습니다.',
        confirmText: '닫기',
        showCancel: false
      });
    },

    _refreshGoogleSettingsStatus() {
      const statusBox = document.getElementById('google-status-display');
      const connectBtn = document.getElementById('google-connect-btn');
      const syncBtn = document.getElementById('google-sync-btn');
      const disconnectBtn = document.getElementById('google-disconnect-btn');
      const refreshBtn = document.getElementById('google-refresh-btn');
      const testBtn = document.getElementById('google-test-btn');
      const cleanupBtn = document.getElementById('google-cleanup-btn');
      const configBtn = document.getElementById('google-config-file-btn');
      const dataBtn = document.getElementById('google-data-folder-btn');
      const debugBtn = document.getElementById('google-debug-btn');
      const authModeNote = document.getElementById('google-auth-mode-note');
      const clientConfigRow = document.getElementById('google-client-config-row');
      const clientConfigActions = document.getElementById('google-client-config-actions');
      const clientConfigHelp = document.getElementById('google-client-config-help');
      if (!statusBox) return;

      const status = LS.GoogleWorkspace?.getStatus?.() || {};
      const diagnostics = this._getGoogleDiagnosticsSnapshot();
      const validation = this._getGoogleDraftValidation();
      const nativeConfigured = Boolean(status.nativeConfigured);
      const selectedCalendar = this._resolveGoogleOptionSelection(
        status.calendarOptions || [],
        status.selectedCalendarId || LS.Config.get('googleCalendarId') || 'primary',
        'calendar'
      );
      const selectedTasklist = this._resolveGoogleOptionSelection(
        status.tasklistOptions || [],
        status.selectedTasklistId || LS.Config.get('googleTasklistId') || '@default',
        'tasklist'
      );
      const selectedCalendarId = String(selectedCalendar?.id || 'primary');
      const selectedTasklistId = String(selectedTasklist?.id || '@default');
      const bridgeReachable = diagnostics && Object.prototype.hasOwnProperty.call(diagnostics, 'bridgeReachable')
        ? diagnostics.bridgeReachable !== false
        : Boolean(status.bridgeAvailable);
      const syncInProgress = Boolean(this._googleSyncPromise) || Boolean(status.nativeInProgress);
      const syncStageLabel = this._formatGoogleSyncStage(diagnostics?.debug?.stage);
      const syncSummary = this._buildGoogleSyncSummary(status, diagnostics);
      const syncUpdatedLabel = diagnostics?.debug?.updatedAt
        ? new Date(diagnostics.debug.updatedAt).toLocaleString('ko-KR')
        : '';
      const hasSyncTargets = Boolean(status.calendarEnabled || status.tasksEnabled);
      const accessLabel = !status.connected
        ? '로그인 필요'
        : status.missingScopes
        ? '권한 다시 승인 필요'
        : status.tokenExpired
        ? '연결 재확인 필요'
        : '정상';
      const badgeTone = syncInProgress
        ? 'progress'
        : (!hasSyncTargets ? 'idle' : (!bridgeReachable ? 'idle' : (status.connected ? 'connected' : (status.missingScopes || status.hasCachedData ? 'cached' : 'idle'))));
      const badgeText = syncInProgress
        ? '동기화 진행 중'
        : !hasSyncTargets
        ? '동기화 꺼짐'
        : !bridgeReachable
        ? '연결 확인 필요'
        : status.connected
        ? '연결됨'
        : (status.missingScopes ? '권한 갱신 필요' : (status.hasCachedData ? '캐시 표시 중' : '미연결'));
      const accountLabel = status.accountEmail || status.accountName || '미연결';
      const syncTargetLabel = [
        status.calendarEnabled ? `캘린더: ${selectedCalendar?.summary || '미선택'}` : '',
        status.tasksEnabled ? `할 일: ${selectedTasklist?.title || '미선택'}` : ''
      ].filter(Boolean).join(' / ') || '동기화 대상이 꺼져 있습니다.';
      const syncModeLabel = !hasSyncTargets
        ? 'Google 동기화 꺼짐'
        : status.calendarEnabled && status.tasksEnabled
        ? '일정과 할 일을 양방향으로 동기화합니다.'
        : status.calendarEnabled
        ? '일정을 양방향으로 동기화합니다.'
        : '할 일을 양방향으로 동기화합니다.';
      const appReadyForGoogle = nativeConfigured || (validation.clientId && validation.looksLikeClientId);
      const nextActionLabel = syncInProgress
        ? '동기화 중입니다. 버튼이 다시 활성화될 때까지 잠시만 기다려 주세요.'
        : !hasSyncTargets
        ? 'Google Calendar 또는 Google Tasks 동기화를 켜 주세요.'
        : status.validationMode
        ? '검증 화면에서는 Google 동기화가 자동으로 꺼집니다.'
        : !appReadyForGoogle
        ? 'Google 로그인 준비가 아직 완료되지 않았습니다. 앱을 다시 실행한 뒤 다시 시도해 주세요.'
        : !bridgeReachable
        ? '앱을 다시 실행한 뒤 상태 새로고침을 눌러 주세요.'
        : !status.connected && !status.hasCachedData
        ? '로그인 및 연결을 눌러 Google 계정을 연결해 주세요.'
        : !status.connected && status.hasCachedData
        ? '연결이 끊겨 캐시만 보이는 상태입니다. 다시 로그인한 뒤 지금 동기화를 눌러 주세요.'
        : status.missingScopes
        ? '다시 로그인을 눌러 캘린더/할 일 권한을 다시 허용해 주세요.'
        : status.tokenExpired
        ? '연결 테스트나 지금 동기화를 눌러 연결을 다시 확인해 주세요.'
        : !status.interactiveSupported && !status.connected
        ? '브라우저 미리보기 창에서 로그인 및 연결을 진행해 주세요.'
        : '일정이나 할 일을 수정하면 자동으로 반영되며, 필요할 때 지금 동기화를 눌러 즉시 맞출 수 있습니다.';
      const userError = diagnostics?.testError
        || (status.lastError ? this._formatGoogleErrorMessage({ message: status.lastError }, diagnostics) : '');
      const updatedLabel = syncInProgress
        ? `${syncStageLabel}${syncUpdatedLabel ? ` · ${syncUpdatedLabel}` : ''}`
        : (status.lastSyncAt
          ? new Date(status.lastSyncAt).toLocaleString('ko-KR')
          : '아직 동기화 기록이 없습니다.');

      if (authModeNote) {
        authModeNote.textContent = '로그인 및 연결 버튼을 누르면 브라우저에서 승인 후 자동으로 돌아옵니다. 연결 후에는 상태 카드에서 결과를 바로 확인하실 수 있습니다.';
      }
      if (clientConfigRow) {
        clientConfigRow.hidden = true;
        clientConfigRow.classList.add('is-collapsed');
      }
      if (clientConfigActions) {
        clientConfigActions.hidden = true;
        clientConfigActions.classList.add('is-collapsed');
      }
      if (clientConfigHelp) {
        clientConfigHelp.hidden = true;
        clientConfigHelp.classList.add('is-collapsed');
      }

      this._populateGoogleSelect('google-calendar-select', status.calendarOptions || [], selectedCalendarId, '동기화 후 목록이 표시됩니다.', 'calendar');
      this._populateGoogleSelect('google-tasklist-select', status.tasklistOptions || [], selectedTasklistId, '동기화 후 목록이 표시됩니다.', 'tasklist');

      if (connectBtn) {
        connectBtn.disabled = syncInProgress || (nativeConfigured
          ? Boolean(status.nativeInProgress) || syncInProgress
          : (!validation.clientId || !validation.looksLikeClientId || !status.interactiveSupported));
        connectBtn.textContent = status.nativeInProgress
          ? '로그인 진행 중'
          : (status.connected ? '다시 로그인' : (status.missingScopes ? '권한 다시 승인' : '로그인 및 연결'));
      }
      if (syncBtn) {
        syncBtn.disabled = syncInProgress || (!status.calendarEnabled && !status.tasksEnabled) || (nativeConfigured
          ? Boolean(status.nativeInProgress) || (!status.interactiveSupported && !status.connected)
          : (!validation.clientId || !validation.looksLikeClientId || (!status.interactiveSupported && !status.connected)));
        syncBtn.classList.toggle('is-busy', syncInProgress);
        syncBtn.innerHTML = syncInProgress
          ? '<span class="btn-spinner" aria-hidden="true">↻</span>동기화 중...'
          : (status.connected ? '지금 다시 동기화' : '지금 동기화');
        syncBtn.title = syncInProgress
          ? 'Google 동기화 진행 중'
          : (status.connected ? 'Google 내용을 한 번 더 맞춥니다.' : 'Google 내용을 지금 가져옵니다.');
      }
      if (disconnectBtn) {
        disconnectBtn.disabled = Boolean(status.nativeInProgress) || syncInProgress || (!status.connected && !status.hasCachedData);
      }
      if (refreshBtn) {
        refreshBtn.disabled = Boolean(status.nativeInProgress) || syncInProgress || Boolean(this._googleStatusRefreshPromise);
      }
      if (testBtn) {
        testBtn.disabled = Boolean(status.nativeInProgress) || syncInProgress || Boolean(this._googleStatusRefreshPromise);
      }
      if (cleanupBtn) {
        cleanupBtn.disabled = Boolean(status.nativeInProgress)
          || syncInProgress
          || Boolean(this._googleStatusRefreshPromise)
          || (!status.calendarEnabled && !status.tasksEnabled)
          || (!status.connected && !status.hasRefreshToken);
      }
      if (configBtn) {
        configBtn.hidden = true;
        configBtn.disabled = !bridgeReachable || !String(diagnostics?.configSource || '').trim();
      }
      if (dataBtn) {
        dataBtn.hidden = true;
        dataBtn.disabled = !bridgeReachable || !String(diagnostics?.dataRoot || '').trim();
      }
      if (debugBtn) {
        debugBtn.hidden = true;
        debugBtn.disabled = false;
      }
      this._refreshGoogleSyncDockButton();

      statusBox.innerHTML = `
        <div class="google-status-head">
          <span class="google-status-badge is-${badgeTone}">${badgeText}</span>
          <span class="google-status-updated">${LS.Helpers.escapeHtml(updatedLabel)}</span>
        </div>
        <div class="google-status-lines">
          <div><strong>연결 계정</strong> ${LS.Helpers.escapeHtml(accountLabel)}</div>
          <div><strong>연결 상태</strong> ${LS.Helpers.escapeHtml(accessLabel)}</div>
          <div><strong>동기화 대상</strong> ${LS.Helpers.escapeHtml(syncTargetLabel)}</div>
          <div><strong>동기화 방식</strong> ${LS.Helpers.escapeHtml(syncModeLabel)}</div>
          ${syncInProgress ? `<div class="google-status-progress"><strong>현재 단계</strong> ${LS.Helpers.escapeHtml(syncStageLabel)}</div>` : ''}
          ${syncSummary ? `<div><strong>최근 동기화 요약</strong> ${LS.Helpers.escapeHtml(syncSummary)}</div>` : ''}
          <div><strong>동기화 데이터</strong> 일정 ${status.calendarCount || 0}건 / 할 일 ${status.taskCount || 0}건</div>
          ${diagnostics?.testSummary ? `<div><strong>최근 연결 확인</strong> ${LS.Helpers.escapeHtml(diagnostics.testSummary)}</div>` : ''}
          <div><strong>다음에 할 일</strong> ${LS.Helpers.escapeHtml(nextActionLabel)}</div>
          ${userError ? `<div class="google-status-error">${LS.Helpers.escapeHtml(userError)}</div>` : ''}
        </div>
      `;
    },

    async _openGoogleGuide() {
      await LS.Helpers.promptModal('Google 연동 설정 안내', [
        {
          id: 'guide',
          type: 'textarea',
          label: '설정 순서',
          value: [
            '1. 설정 > Google에서 로그인 및 연결을 누릅니다.',
            '2. 기본 브라우저가 열리면 Google 계정으로 로그인하고 권한을 허용합니다.',
            '3. 완료 메시지가 보이면 LivelySam으로 돌아옵니다.',
            '4. 상태 새로고침 또는 연결 테스트를 눌러 연결 상태를 확인합니다.',
            '5. 캘린더와 할 일 목록을 확인한 뒤 지금 동기화를 눌러 내용을 맞춥니다.',
            '',
            '[잘 안 될 때]',
            '- 로그인 창이 열리지 않으면 앱을 다시 실행한 뒤 다시 시도해 주세요.',
            '- 로그인 후 반응이 없으면 상태 새로고침과 연결 테스트를 눌러 최신 상태를 확인해 주세요.',
            '- access blocked 또는 app not verified가 보이면 현재 계정이 허용되지 않은 상태일 수 있으니 관리자에게 문의해 주세요.',
            '- Calendar API 또는 Tasks API 관련 오류가 나오면 앱 준비가 완료되지 않은 상태일 수 있으니 관리자에게 문의해 주세요.'
          ].join('\n'),
          readonly: true,
          rows: 16
        }
      ], {
        message: '일반 사용자는 로그인과 동기화 대상 선택만 하시면 됩니다.',
        confirmText: '닫기',
        showCancel: false
      });
    },

    async _connectGoogleWorkspace() {
      this._saveGoogleSettingsDraft();
      const validation = this._getGoogleDraftValidation();
      if (validation.issues.length) {
        LS.Helpers.showToast(validation.issues[0], 'warning', 3600);
        this._refreshGoogleSettingsStatus();
        return;
      }

      try {
        this._setSettingsSaveState('pending', 'Google 연결 확인 중');
        LS.Helpers.showToast('Google 연결을 시작합니다. 버튼과 상태 카드에서 진행 상황을 확인해 주세요.', 'info', 2600);
        await this._runGoogleSync({ interactive: true, silent: false, force: true });
        await this._refreshDataWithOptions({ syncGoogle: false });
        await this._reloadGoogleSettingsStatus().catch((error) => {
          console.warn('[Settings] Failed to reload Google settings status after connect:', error);
        });
        const status = LS.GoogleWorkspace?.getStatus?.() || {};
        this._setSettingsSaveState('saved', 'Google 연결됨');
        LS.Helpers.showToast(`Google 연결 완료: 일정 ${status.calendarCount || 0}건 / 할 일 ${status.taskCount || 0}건`, 'success', 2800);
      } catch (error) {
        const diagnostics = await this._reloadGoogleSettingsStatus().catch(() => this._getGoogleDiagnosticsSnapshot());
        LS.Helpers.showToast(`Google 연결 실패: ${this._formatGoogleErrorMessage(error, diagnostics)}`, 'error', 4200);
      }
    },

    async _syncGoogleWorkspace() {
      this._saveGoogleSettingsDraft();
      const validation = this._getGoogleDraftValidation();
      if (!validation.nativeConfigured && !validation.clientId) {
        LS.Helpers.showToast('Google 로그인 준비가 아직 완료되지 않았습니다. 앱을 다시 실행한 뒤 다시 시도해 주세요.', 'warning', 3600);
        this._refreshGoogleSettingsStatus();
        return;
      }
      if (!validation.nativeConfigured && !validation.looksLikeClientId) {
        LS.Helpers.showToast('Google 로그인 설정이 올바르지 않습니다. 앱 준비 상태를 확인해 주세요.', 'warning', 3600);
        this._refreshGoogleSettingsStatus();
        return;
      }

      const canInteractive = Boolean(LS.GoogleWorkspace?.supportsInteractiveAuth?.());
      try {
        this._setSettingsSaveState('pending', 'Google 동기화 시작');
        LS.Helpers.showToast('Google 동기화를 시작합니다. 버튼과 상태 카드에 진행 상황이 표시됩니다.', 'info', 2600);
        const status = await this._runGoogleSync({
          interactive: canInteractive,
          silent: false,
          force: true
        });
        await this._refreshDataWithOptions({ syncGoogle: false });
        await this._reloadGoogleSettingsStatus().catch((error) => {
          console.warn('[Settings] Failed to reload Google settings status after manual sync:', error);
        });
        this._setSettingsSaveState('saved', 'Google 동기화됨');

        if (!status.connected && !canInteractive) {
          LS.Helpers.showToast('현재 창에서는 로그인할 수 없습니다. 브라우저 미리보기에서 먼저 로그인해 주세요.', 'warning', 3200);
          return;
        }

        LS.Helpers.showToast(`Google 동기화 완료: 일정 ${status.calendarCount || 0}건 / 할 일 ${status.taskCount || 0}건`, 'success', 2800);
      } catch (error) {
        const diagnostics = await this._reloadGoogleSettingsStatus().catch(() => this._getGoogleDiagnosticsSnapshot());
        LS.Helpers.showToast(`Google 동기화 실패: ${this._formatGoogleErrorMessage(error, diagnostics)}`, 'error', 4200);
      }
    },

    async _cleanupGoogleDuplicates() {
      this._saveGoogleSettingsDraft();
      const status = LS.GoogleWorkspace?.getStatus?.() || {};
      const canInteractive = Boolean(LS.GoogleWorkspace?.supportsInteractiveAuth?.());

      if (!status.calendarEnabled && !status.tasksEnabled) {
        LS.Helpers.showToast('현재 모드에서는 Google 동기화가 비활성화되어 있어 중복 정리를 실행할 수 없습니다.', 'warning', 3600);
        return;
      }

      if (!status.connected && !status.hasRefreshToken && !canInteractive) {
        LS.Helpers.showToast('먼저 Google 로그인 및 연결을 완료해 주세요.', 'warning', 3200);
        return;
      }

      try {
        this._setSettingsSaveState('pending', 'Google 중복 점검 중');
        LS.Helpers.showToast('Google 상태를 새로 읽고 중복 후보를 점검합니다.', 'info', 2600);

        await this._runGoogleSync({
          interactive: !status.connected && canInteractive,
          silent: false,
          force: true
        });
        await this._refreshDataWithOptions({ syncGoogle: false });

        const inspection = await LS.GoogleWorkspace?.inspectDuplicates?.();
        if (!inspection || !inspection.totalGroups) {
          await this._reloadGoogleSettingsStatus().catch((error) => {
            console.warn('[Settings] Failed to reload Google settings status after duplicate inspection:', error);
          });
          this._setSettingsSaveState('saved', 'Google 중복 없음');
          LS.Helpers.showToast('Google 중복 후보를 찾지 못했습니다.', 'success', 2400);
          return;
        }

        const previewText = this._buildGoogleDuplicateInspectionText(inspection);
        if (!inspection.actionableGroups) {
          await LS.Helpers.promptModal('Google 중복 점검 결과', [
            {
              id: 'google-duplicate-summary',
              type: 'textarea',
              label: '자동 정리 불가',
              value: previewText,
              readonly: true,
              rows: 22
            }
          ], {
            message: '중복 후보는 있지만 읽기 전용 Google 항목이 포함되어 자동 정리할 수 없습니다.',
            confirmText: '닫기',
            showCancel: false
          });
          this._setSettingsSaveState('warning', 'Google 중복 수동 확인 필요');
          return;
        }

        const confirmed = await LS.Helpers.promptModal('Google 중복 정리', [
          {
            id: 'google-duplicate-preview',
            type: 'textarea',
            label: '정리 예정 항목',
            value: previewText,
            readonly: true,
            rows: 22
          }
        ], {
          message: '각 중복 그룹에서 1개만 남기고 나머지 로컬 기록을 삭제합니다. 삭제 대상은 다음 동기화에서 Google에서도 제거됩니다.',
          confirmText: '중복 정리 실행',
          cancelText: '취소'
        });

        if (confirmed === null) {
          this._setSettingsSaveState('neutral', 'Google 중복 정리 취소됨');
          return;
        }

        this._setSettingsSaveState('pending', 'Google 중복 정리 중');
        const cleanup = await LS.GoogleWorkspace?.cleanupDuplicates?.();
        const deletedLocalCount = Number(cleanup?.deletedLocalCount || 0);
        const queuedCalendarDeleteCount = Number(cleanup?.queuedCalendarDeleteCount || 0);
        const queuedTaskDeleteCount = Number(cleanup?.queuedTaskDeleteCount || 0);

        if (!deletedLocalCount) {
          await this._reloadGoogleSettingsStatus().catch((error) => {
            console.warn('[Settings] Failed to reload Google settings status after duplicate cleanup check:', error);
          });
          this._setSettingsSaveState('warning', 'Google 중복 정리 대상 없음');
          LS.Helpers.showToast('정리할 중복 기록이 더 이상 없습니다.', 'info', 2400);
          return;
        }

        LS.Helpers.showToast(
          `로컬 중복 ${deletedLocalCount}건을 정리했습니다. Google 삭제 예약: 일정 ${queuedCalendarDeleteCount}건 / 할 일 ${queuedTaskDeleteCount}건`,
          'info',
          3600
        );

        await this._runGoogleSync({
          interactive: false,
          silent: false,
          force: true
        });
        await this._refreshDataWithOptions({ syncGoogle: false });
        await this._reloadGoogleSettingsStatus().catch((error) => {
          console.warn('[Settings] Failed to reload Google settings status after duplicate cleanup:', error);
        });

        const remaining = await LS.GoogleWorkspace?.inspectDuplicates?.();
        if (remaining?.totalGroups) {
          this._setSettingsSaveState('warning', 'Google 중복 일부 남음');
          LS.Helpers.showToast(
            `중복 정리 후에도 ${remaining.totalGroups}개 그룹이 남아 있습니다. 상태를 다시 새로고침해 남은 항목을 확인해 주세요.`,
            'warning',
            4200
          );
          return;
        }

        this._setSettingsSaveState('saved', 'Google 중복 정리됨');
        LS.Helpers.showToast('Google 중복 정리를 마쳤습니다. 남아 있는 중복 후보가 없습니다.', 'success', 3200);
      } catch (error) {
        await this._reloadGoogleSettingsStatus().catch((error) => {
          console.warn('[Settings] Failed to reload Google settings status after duplicate cleanup error:', error);
        });
        const diagnostics = this._getGoogleDiagnosticsSnapshot();
        const pendingDeletes = Array.isArray(LS.Records?.getGoogleSyncDeleteQueue?.())
          ? LS.Records.getGoogleSyncDeleteQueue().length
          : 0;
        const suffix = pendingDeletes > 0 ? ` 삭제 대기 ${pendingDeletes}건은 다음 동기화에서 다시 처리됩니다.` : '';
        this._setSettingsSaveState('warning', 'Google 중복 정리 실패');
        LS.Helpers.showToast(`Google 중복 정리 실패: ${this._formatGoogleErrorMessage(error, diagnostics)}${suffix}`, 'error', 4800);
      }
    },

    async syncGoogleWorkspace() {
      return this._syncGoogleWorkspace();
    },

    async _disconnectGoogleWorkspace() {
      const confirmed = await LS.Helpers.confirmModal(
        'Google 연결 해제',
        'Google 연결을 해제하시겠습니까? Google 계정의 일정과 할 일은 삭제되지 않으며, 이 월페이퍼에 가져온 연결 정보와 캐시만 비웁니다.',
        {
          confirmText: '연결 해제',
          cancelText: '취소'
        }
      );
      if (!confirmed) return;

      await LS.GoogleWorkspace?.disconnect?.();
      this._lastGoogleDiagnostics = LS.GoogleWorkspace?.getCachedDiagnostics?.() || {};
      this._refreshGoogleSettingsStatus();
      this._setSettingsSaveState('saved', 'Google 연결 해제됨');
      await this._refreshData();
      LS.Helpers.showToast('Google 연동을 해제하고 캐시를 비웠습니다.', 'info', 2600);
    },

    _openExternalUrl(url) {
      if (!url) return;
      const openedWindow = window.open(url, '_blank', 'noopener,noreferrer');
      if (!openedWindow) {
        LS.Helpers.showToast('브라우저가 열리지 않으면 안내 팝업의 주소를 직접 열어 주세요.', 'warning', 2800);
      }
    },

    _getClassFieldIds(scope = 'main') {
      if (scope === 'quick') {
        return {
          role: document.getElementById('quick-homeroom-role-select'),
          preset: document.getElementById('quick-class-preset-select'),
          input: document.getElementById('quick-class-input'),
          wrap: document.getElementById('quickstart-class-wrap'),
          help: document.getElementById('quickstart-class-input-help')
        };
      }

      return {
        role: document.getElementById('homeroom-role-select'),
        preset: document.getElementById('class-preset-select'),
        input: document.getElementById('class-input'),
        wrap: document.getElementById('classroom-class-wrap'),
        help: document.getElementById('classroom-class-input-help')
      };
    },

    _getTeacherRoleFromClassValue(classValue) {
      return LS.Config.isNonHomeroomClass(classValue) ? 'nonhomeroom' : 'homeroom';
    },

    _getTeacherRoleValue(scope = 'main') {
      const { role } = this._getClassFieldIds(scope);
      return role?.value === 'nonhomeroom' ? 'nonhomeroom' : 'homeroom';
    },

    _syncTeacherRoleUI(roleValue = 'homeroom') {
      const isNonHomeroom = roleValue === 'nonhomeroom';
      const gradeMainEl = document.getElementById('grade-select');
      const gradeQuickEl = document.getElementById('quick-grade-select');
      if (gradeMainEl) gradeMainEl.disabled = isNonHomeroom;
      if (gradeQuickEl) gradeQuickEl.disabled = isNonHomeroom;

      ['main', 'quick'].forEach((scope) => {
        const fields = this._getClassFieldIds(scope);
        if (fields.wrap) fields.wrap.classList.toggle('is-collapsed', isNonHomeroom);
        if (fields.help) fields.help.classList.toggle('is-collapsed', isNonHomeroom);
        this._syncClassPresetInput(undefined, scope);
      });

      const roleHelp = document.getElementById('classroom-role-help');
      if (roleHelp) {
        roleHelp.textContent = isNonHomeroom
          ? '비담임을 선택하면 학급 자동 연동 대신 교사용 시간표를 쓰는 흐름이 더 자연스럽습니다.'
          : '담임을 선택하면 학년과 반을 정확히 맞춰 학급 시간표 자동 연동을 바로 사용할 수 있습니다.';
      }
    },

    _setQuickstartBadge(id, tone, text) {
      const badge = document.getElementById(id);
      if (!badge) return;
      badge.className = `quickstart-badge is-${tone}`;
      badge.textContent = text;
    },

    _refreshQuickStartOverview() {
      const panel = document.getElementById('settings-quickstart');
      if (!panel) return;

      const schoolName = String(this._getFormFieldValue('quick-school-name-input', this._getFormFieldValue('school-name-input', LS.Config.get('schoolName'))) || '').trim();
      const schoolLinked = Boolean(LS.Config.get('atptCode') && LS.Config.get('schoolCode')) &&
        this._normalizeSchoolName(schoolName) === this._normalizeSchoolName(LS.Config.get('schoolName'));
      const gradeValue = parseInt(this._getFormFieldValue('quick-grade-select', LS.Config.get('grade')), 10) || 0;
      const roleValue = this._getFormFieldValue('quick-homeroom-role-select', this._getTeacherRoleFromClassValue(LS.Config.get('classNum'))) === 'nonhomeroom'
        ? 'nonhomeroom'
        : 'homeroom';
      const classValue = roleValue === 'nonhomeroom' ? LS.Config.getNonHomeroomValue() : this._getSelectedClassValue('quick');
      const timetableMode = parseInt(this._getFormFieldValue('quick-timetable-mode-select', LS.Config.get('timetableMode')), 10) || 0;
      const weatherMode = this._getWeatherProviderModeDraft('quick');
      const usesCustomWeatherKey = weatherMode === 'custom';
      const weatherKey = this._getWeatherApiKeyDraft('quick');
      const weatherPreset = 'school';
      const weatherPresetConfig = LS.Config.getWeatherPresetConfig();
      const weatherAddressDirty = false;
      const weatherBaseReady = Boolean(weatherPresetConfig?.address) &&
        (!usesCustomWeatherKey || Boolean(weatherKey)) &&
        Boolean(LS.Config.get('schoolAddress')) &&
        Boolean(weatherPresetConfig?.hasCoordinates || LS.Config.get('schoolAddress'));
      const weatherConnectionState = this._weatherConnectionState || {};
      const weatherVerified = weatherConnectionState.status === 'ready' &&
        weatherConnectionState.presetKey === weatherPreset;

      const requiredItems = [
        { label: '학교 연결', complete: schoolLinked }
      ];
      const completedRequired = requiredItems.filter((item) => item.complete).length;
      const progress = Math.round((completedRequired / requiredItems.length) * 100);
      const pendingSave = Boolean(this._settingsDirty);

      const progressTextEl = document.getElementById('quickstart-progress-text');
      const progressCountEl = document.getElementById('quickstart-progress-count');
      const progressBarEl = document.getElementById('quickstart-progress-bar');
      const missingListEl = document.getElementById('quickstart-missing-list');
      if (progressTextEl) {
        progressTextEl.textContent = completedRequired === requiredItems.length
          ? (pendingSave
            ? '필수 입력은 끝났습니다. 저장을 누르면 바로 적용됩니다.'
            : '필수 입력이 완료되었습니다. 이제 바로 사용하실 수 있습니다.')
          : '학교 연결을 먼저 완료하시면 핵심 기능을 바로 쓸 수 있습니다.';
      }
      if (progressCountEl) {
        progressCountEl.textContent = `${completedRequired} / ${requiredItems.length}`;
      }
      if (progressBarEl) {
        progressBarEl.style.width = `${progress}%`;
      }
      if (missingListEl) {
        const chips = [];
        requiredItems.filter((item) => !item.complete).forEach((item) => {
          chips.push(`<span class="quickstart-missing-chip is-required">${LS.Helpers.escapeHtml(item.label)} 필요</span>`);
        });
        if (pendingSave) {
          chips.push('<span class="quickstart-missing-chip is-required">저장 필요</span>');
        }
        if (usesCustomWeatherKey && weatherKey) {
          chips.push('<span class="quickstart-missing-chip">개인 날씨 키 사용</span>');
        } else if (usesCustomWeatherKey) {
          chips.push('<span class="quickstart-missing-chip">개인 날씨 키 입력 대기</span>');
        } else {
          chips.push('<span class="quickstart-missing-chip">기본 공용 서버 사용</span>');
        }
        missingListEl.innerHTML = chips.join('');
      }

      const schoolDisplayEl = document.getElementById('quickstart-school-display');
      if (schoolDisplayEl) {
        schoolDisplayEl.textContent = schoolLinked
          ? `선택됨: ${LS.Config.get('schoolName')} (${LS.Config.get('atptCode')} / ${LS.Config.get('schoolCode')})`
          : (schoolName ? '학교 찾기 버튼을 눌러 검색 결과에서 학교를 선택해 주세요.' : '학교명을 입력한 뒤 학교 찾기를 눌러 주세요.');
      }
      this._setQuickstartBadge(
        'quickstart-school-badge',
        schoolLinked ? 'ready' : (schoolName ? 'neutral' : 'pending'),
        schoolLinked ? '완료' : (schoolName ? '확인 중' : '입력 필요')
      );

      const isNonHomeroom = roleValue === 'nonhomeroom';
      const classroomReady = isNonHomeroom || Boolean(classValue);
      const classroomBadgeText = isNonHomeroom
        ? '비담임'
        : (!classValue ? '학급 미설정' : `${gradeValue + 1}학년 ${LS.Config.getClassDisplayName(classValue)}`);
      this._setQuickstartBadge('quickstart-classroom-badge', classroomReady ? (isNonHomeroom ? 'neutral' : 'ready') : 'neutral', classroomBadgeText);
      const classroomTipEl = document.getElementById('quickstart-classroom-tip');
      if (classroomTipEl) {
        if (isNonHomeroom && timetableMode !== 1) {
          classroomTipEl.textContent = '비담임이면 내 시간표 직접 입력 / 교사용 모드를 권장합니다.';
        } else if (isNonHomeroom) {
          classroomTipEl.textContent = '비담임 설정입니다. 교사용 시간표로 직접 관리하시면 가장 자연스럽습니다.';
        } else if (!classValue) {
          classroomTipEl.textContent = '기본 목록은 10반까지입니다. 11반 이상이면 직접 입력 칸에 반 번호를 적어 주세요.';
        } else if (timetableMode === 1) {
          classroomTipEl.textContent = '교사용 시간표 모드입니다. 엑셀 업로드를 사용하면 입력이 가장 빠릅니다.';
        } else {
          classroomTipEl.textContent = '학급 시간표 자동 연동 모드입니다. 학교와 학급만 맞으면 자동으로 불러옵니다.';
        }
      }

      this._setQuickstartBadge(
        'quickstart-weather-badge',
        !usesCustomWeatherKey ? 'ready' : (!weatherKey ? 'optional' : (weatherVerified ? 'ready' : 'neutral')),
        !usesCustomWeatherKey ? '기본 서버' : (!weatherKey ? '키 필요' : (weatherVerified ? '확인 완료' : (weatherAddressDirty ? '저장 필요' : '확인 중')))
      );
      const weatherDisplayEl = document.getElementById('quickstart-weather-display');
      if (weatherDisplayEl) {
        weatherDisplayEl.className = 'quickstart-inline-status';
        if (!usesCustomWeatherKey) {
          weatherDisplayEl.textContent = '기본 공용 서버를 사용합니다. 바로 시작할 수 있지만, 응답 속도와 사용량 면에서는 개인 API 키 직접 연결을 권장합니다.';
        } else if (!weatherKey) {
          weatherDisplayEl.textContent = '개인 API 키는 이 PC에만 저장됩니다. 입력하면 공용 서버 사용량 보호 영향 없이 직접 조회할 수 있습니다.';
        } else if (weatherVerified) {
          weatherDisplayEl.classList.add('is-ready');
          weatherDisplayEl.textContent = `${this._weatherConnectionState.message || '학교 기준 날씨 연결 확인이 완료되었습니다.'}${this._weatherConnectionState.checkedAt ? ` 마지막 확인 ${new Date(this._weatherConnectionState.checkedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}` : ''}`;
        } else if (weatherConnectionState.status === 'error' && weatherConnectionState.presetKey === weatherPreset) {
          weatherDisplayEl.classList.add('is-error');
          weatherDisplayEl.textContent = weatherConnectionState.message || '날씨 연결 확인에 실패했습니다.';
        } else if (weatherConnectionState.status === 'loading' && weatherConnectionState.presetKey === weatherPreset) {
          weatherDisplayEl.classList.add('is-loading');
          weatherDisplayEl.textContent = weatherConnectionState.message || '날씨 위치와 실제 데이터를 확인하는 중입니다.';
        } else if (weatherBaseReady) {
          weatherDisplayEl.classList.add('is-loading');
          weatherDisplayEl.textContent = '날씨 위치와 실제 데이터를 확인하는 중입니다.';
        } else {
          weatherDisplayEl.textContent = this._weatherResolveState.message || '날씨 위치를 확인하는 중입니다.';
        }
      }

      const nextListEl = document.getElementById('quickstart-next-list');
      if (nextListEl) {
        const nextItems = [];
        if (pendingSave) nextItems.push('변경한 내용을 실제 화면에 적용하려면 지금 저장을 눌러 주세요.');
        if (!schoolLinked) nextItems.push('학교명을 입력하고 학교 찾기에서 정확한 학교를 선택해 주세요.');
        if (!isNonHomeroom && !classValue) nextItems.push('담임이면 반을 정해 주세요. 기본 목록은 10반까지이고, 그 이상은 직접 입력하면 됩니다.');
        if (isNonHomeroom && timetableMode !== 1) nextItems.push('비담임이라면 시간표 방식을 교사용 모드로 바꾸는 편이 더 자연스럽습니다.');
        if (timetableMode === 1) nextItems.push('교사용 시간표 엑셀 업로드를 쓰면 요일별 과목 입력 시간을 많이 줄일 수 있습니다.');
        if (usesCustomWeatherKey && !weatherKey) nextItems.push('개인 날씨 키를 쓰시려면 OpenWeather API 키를 입력해 주세요.');
        if (!usesCustomWeatherKey) nextItems.push('기본 서버로 바로 사용은 가능하지만, 오래 쓰실 계획이면 개인 날씨 키를 연결해 두는 편이 더 빠르고 안정적입니다.');
        if (nextItems.length === 0) nextItems.push('필수 입력이 완료되었습니다. 이제 화면/색상, 백업, 세부 교시 설정만 필요할 때 손보시면 됩니다.');
        nextListEl.innerHTML = nextItems.map((item) => `<div class="quickstart-next-item">${LS.Helpers.escapeHtml(item)}</div>`).join('');
      }

      this._setQuickstartBadge(
        'quickstart-finish-badge',
        completedRequired === requiredItems.length ? (pendingSave ? 'neutral' : 'ready') : 'neutral',
        completedRequired === requiredItems.length ? (pendingSave ? '저장 필요' : '사용 가능') : '안내'
      );

      // 신규 사이드바: 빠른 시작 탭의 보류 표시점(red dot)
      const quickstartNavItem = document.querySelector('.settings-nav-item[data-tab="quickstart"]');
      const quickstartIndicator = document.querySelector('.settings-nav-indicator[data-nav-indicator="quickstart"]');
      const hasPending = completedRequired < requiredItems.length;
      if (quickstartNavItem) quickstartNavItem.classList.toggle('has-pending', hasPending);
      if (quickstartIndicator) quickstartIndicator.classList.toggle('is-pending', hasPending);
    },

    _populateProfileControls() {
      const selectEl = document.getElementById('profile-select');
      if (!selectEl) return;

      const profiles = LS.Config.getProfiles();
      const activeId = LS.Config.getActiveProfileId();

      selectEl.replaceChildren();
      profiles.forEach((profile) => {
        const optionEl = document.createElement('option');
        optionEl.value = String(profile.id || '');
        optionEl.textContent = String(profile.name || '');
        selectEl.appendChild(optionEl);
      });
      selectEl.value = activeId;

      const deleteBtn = document.getElementById('profile-delete-btn');
      if (deleteBtn) {
        deleteBtn.disabled = profiles.length <= 1;
      }

      const summaryEl = document.getElementById('profile-summary-display');
      if (summaryEl) {
        summaryEl.innerHTML = this._buildProfileSummary(LS.Config.getActiveProfile());
      }
    },

    _buildProfileSummary(profile) {
      const data = profile?.data || {};
      const schoolName = data.schoolName || '학교 미설정';
      const isNonHomeroom = LS.Config.isNonHomeroomClass(data.classNum || '');
      const grade = Number.isFinite(parseInt(data.grade, 10)) ? `${parseInt(data.grade, 10) + 1}학년` : '';
      const classLabel = isNonHomeroom ? '비담임' : `${grade} ${LS.Config.getClassDisplayName(data.classNum || '1')}`.trim();

      return [
        `<div><strong>${LS.Helpers.escapeHtml(profile?.name || '프로필')}</strong></div>`,
        `<div><strong>학교</strong> ${LS.Helpers.escapeHtml(schoolName)}</div>`,
        `<div><strong>담당</strong> ${LS.Helpers.escapeHtml(classLabel || '미설정')}</div>`,
        '<div><strong>날씨 기준</strong> 학교 기준</div>'
      ].join('');
    },

    async _switchProfile(profileId) {
      const currentId = LS.Config.getActiveProfileId();
      if (!profileId || profileId === currentId) return;
      if (!await this._confirmDiscardSettingsChanges('profileSwitch')) {
        const selectEl = document.getElementById('profile-select');
        if (selectEl) selectEl.value = currentId;
        return;
      }

      LS.Config.switchProfile(profileId);
      this._populateSettingsForm();
      this._captureSettingsSessionSnapshot();
      this._refreshLivelySetupNotice();
      LS.Helpers.showToast('프로필을 전환했습니다.', 'success', 2200);
    },

    async _createProfile() {
      if (!await this._confirmDiscardSettingsChanges('profileCreate')) {
        return;
      }

      const result = await LS.Helpers.promptModal('새 프로필', [
        {
          id: 'name',
          type: 'text',
          label: '프로필 이름',
          placeholder: '예: 본교 1학년 / 출장 / 시험기간'
        },
        {
          id: 'cloneCurrent',
          type: 'select',
          label: '현재 설정 복사',
          value: '1',
          options: [
            { value: '1', text: '복사해서 시작' },
            { value: '0', text: '빈 프로필로 시작' }
          ]
        }
      ], {
        message: '프로필에는 학교, 학년/반, 비담임 여부, 집 위치, 날씨 프리셋이 함께 저장됩니다.',
        confirmText: '생성'
      });

      if (!result) return;

      const name = String(result.name || '').trim() || `프로필 ${LS.Config.getProfiles().length + 1}`;
      LS.Config.createProfile(name, { cloneCurrent: result.cloneCurrent !== '0' });
      this._populateSettingsForm();
      this._captureSettingsSessionSnapshot();
      this._refreshLivelySetupNotice();
      LS.Helpers.showToast('새 프로필을 만들었습니다.', 'success', 2200);
    },

    async _renameProfile() {
      const activeProfile = LS.Config.getActiveProfile();
      if (!activeProfile) return;

      const result = await LS.Helpers.promptModal('프로필 이름 변경', [
        {
          id: 'name',
          type: 'text',
          label: '프로필 이름',
          value: activeProfile.name || ''
        }
      ], {
        confirmText: '변경'
      });

      if (!result) return;
      const name = String(result.name || '').trim();
      if (!name) {
        LS.Helpers.showToast('프로필 이름을 입력해 주세요.', 'warning', 2400);
        return;
      }

      LS.Config.renameActiveProfile(name);
      this._populateProfileControls();
      LS.Helpers.showToast('프로필 이름을 변경했습니다.', 'success', 2200);
    },

    async _deleteProfile() {
      const profiles = LS.Config.getProfiles();
      if (profiles.length <= 1) {
        LS.Helpers.showToast('마지막 프로필은 삭제할 수 없습니다.', 'warning', 2400);
        return;
      }

      if (!await this._confirmDiscardSettingsChanges('profileDelete')) {
        return;
      }

      const activeProfile = LS.Config.getActiveProfile();
      if (!activeProfile) return;

      const confirmed = await LS.Helpers.confirmModal(
        '프로필 삭제',
        `${activeProfile.name || '현재'} 프로필을 삭제하시겠습니까? 이 프로필에 저장된 학교/학급 기준과 관련 설정이 함께 삭제됩니다.`
      );
      if (!confirmed) return;

      if (!LS.Config.deleteActiveProfile()) {
        LS.Helpers.showToast('프로필 삭제에 실패했습니다.', 'error', 2400);
        return;
      }

      this._populateSettingsForm();
      this._captureSettingsSessionSnapshot();
      this._refreshLivelySetupNotice();
      LS.Helpers.showToast('프로필을 삭제했습니다.', 'success', 2200);
    },

    async _openQuickAdd() {
      const result = await LS.Helpers.promptModal('빠른 추가', [
        {
          id: 'mode',
          type: 'select',
          label: '추가 방식',
          value: 'auto',
          options: [
            { value: 'auto', text: '자동 판별' },
            { value: 'note', text: '메모' },
            { value: 'task', text: '할 일' },
            { value: 'schedule', text: '일정' },
            { value: 'countdown', text: 'D-Day' },
            { value: 'bookmark', text: '북마크' }
          ]
        },
        {
          id: 'text',
          type: 'text',
          label: '내용',
          placeholder: '예: 오늘 3교시 상담 / 내일 14:00 회의 / D-10 중간고사 / https://example.com'
        }
      ], {
        message: '한 줄 입력으로 메모, 할 일, 일정, D-Day, 북마크를 바로 만듭니다.',
        confirmText: '추가'
      });

      if (!result) return;

      const saved = await LS.Records.quickAddFromText(result.text, { mode: result.mode || 'auto' });
      if (!saved) return;

      LS.Helpers.showToast(saved.summary || '빠른 추가를 완료했습니다.', 'success', 2400);
    },

    _getClassPresetValue(classValue) {
      const normalized = LS.Config.normalizeClassNum(classValue);
      if (/^\d+$/.test(String(normalized))) {
        const classNumber = parseInt(normalized, 10);
        if (classNumber >= 1 && classNumber <= 10) {
          return String(classNumber);
        }
      }

      return '';
    },

    _syncClassPresetInput(selectedValue, scope = 'main') {
      const { preset: presetEl, input: inputEl } = this._getClassFieldIds(scope);
      if (!presetEl || !inputEl) return;

      const isNonHomeroom = this._getTeacherRoleValue(scope) === 'nonhomeroom';
      const resolvedValue = selectedValue !== undefined
        ? selectedValue
        : this._getClassPresetValue(inputEl.value || LS.Config.get('classNum'));

      if (isNonHomeroom) {
        presetEl.disabled = true;
        inputEl.disabled = true;
        inputEl.classList.add('is-hidden');
        return;
      }

      presetEl.disabled = false;

      if (/^\d+$/.test(String(resolvedValue))) {
        presetEl.value = String(resolvedValue);
        inputEl.value = String(resolvedValue);
        inputEl.disabled = true;
        inputEl.classList.add('is-hidden');
        return;
      }

      presetEl.value = '';
      inputEl.disabled = false;
      inputEl.classList.remove('is-hidden');
      if (!inputEl.value || LS.Config.isNonHomeroomClass(inputEl.value)) {
        inputEl.value = '';
      }
    },

    _getSelectedClassValue(scope = 'main') {
      const { preset: presetEl, input: inputEl } = this._getClassFieldIds(scope);
      if (this._getTeacherRoleValue(scope) === 'nonhomeroom') {
        return LS.Config.getNonHomeroomValue();
      }

      const presetValue = presetEl?.value || '';

      if (/^\d+$/.test(presetValue)) {
        return presetValue;
      }

      const inputValue = String(inputEl?.value || '').replace(/반/g, '').trim();
      return inputValue;
    },

    _setColorInputState(id, storedValue, fallbackValue) {
      const input = document.getElementById(id);
      if (!input) return;
      const hasCustom = Boolean(storedValue);
      input.dataset.useDefault = hasCustom ? 'false' : 'true';
      input.value = hasCustom ? storedValue : fallbackValue;
    },

    _syncDefaultColorInputsWithTheme() {
      const baseTheme = LS.Config.getTheme({
        theme: parseInt(document.getElementById('theme-select')?.value, 10) || LS.Config.get('theme'),
        customPrimaryColor: '',
        customPrimaryLightColor: '',
        customAccentColor: '',
        customBackgroundColor: '',
        backgroundOpacity: parseInt(document.getElementById('background-opacity-slider')?.value, 10) || LS.Config.get('backgroundOpacity')
      });

      [
        ['custom-primary-color', baseTheme.primary],
        ['custom-primary-light-color', baseTheme.primaryLight],
        ['custom-accent-color', baseTheme.accent],
        ['custom-background-color', '#FFFFFF']
      ].forEach(([id, fallbackValue]) => {
        const input = document.getElementById(id);
        if (input?.dataset.useDefault === 'true') {
          input.value = fallbackValue;
        }
      });
    },

    _updateThemePreviewLabels() {
      const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
      };

      setText('opacity-value', `${document.getElementById('opacity-slider')?.value || LS.Config.get('widgetOpacity')}%`);
      setText('fontsize-value', `${document.getElementById('fontsize-slider')?.value || LS.Config.get('fontSize')}px`);
      setText('background-opacity-value', `${document.getElementById('background-opacity-slider')?.value || LS.Config.get('backgroundOpacity')}%`);

      [
        'custom-primary-color',
        'custom-primary-light-color',
        'custom-accent-color',
        'custom-background-color'
      ].forEach((id) => {
        const input = document.getElementById(id);
        const label = document.getElementById(`${id}-value`);
        if (input && label) {
          label.textContent = input.dataset.useDefault === 'true'
            ? `${input.value.toUpperCase()} · 기본`
            : input.value.toUpperCase();
        }
      });
    },

    _readThemePreviewValues() {
      const getInt = (id, fallback) => parseInt(document.getElementById(id)?.value, 10) || fallback;
      const readColor = (id) => {
        const input = document.getElementById(id);
        if (!input) return '';
        return input.dataset.useDefault === 'true' ? '' : input.value;
      };

      return {
        theme: getInt('theme-select', LS.Config.get('theme')),
        widgetOpacity: getInt('opacity-slider', LS.Config.get('widgetOpacity')),
        fontSize: getInt('fontsize-slider', LS.Config.get('fontSize')),
        customPrimaryColor: readColor('custom-primary-color'),
        customPrimaryLightColor: readColor('custom-primary-light-color'),
        customAccentColor: readColor('custom-accent-color'),
        customBackgroundColor: readColor('custom-background-color'),
        backgroundOpacity: getInt('background-opacity-slider', LS.Config.get('backgroundOpacity'))
      };
    },

    _applyLiveThemePreview() {
      this._syncDefaultColorInputsWithTheme();
      this._updateThemePreviewLabels();
      LS.Config.applyThemePreview(this._readThemePreviewValues());
    },

    _resetColorPreviewInputs() {
      [
        'custom-primary-color',
        'custom-primary-light-color',
        'custom-accent-color',
        'custom-background-color'
      ].forEach((id) => {
        const input = document.getElementById(id);
        if (input) input.dataset.useDefault = 'true';
      });

      const backgroundOpacitySlider = document.getElementById('background-opacity-slider');
      if (backgroundOpacitySlider) {
        backgroundOpacitySlider.value = '98';
      }

      this._applyLiveThemePreview();
    },

    _downloadBlob(blob, fileName) {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    },

    _downloadTeacherTimetableTemplate() {
      if (!window.XLSX) {
        LS.Helpers.showToast('엑셀 라이브러리를 불러오지 못했습니다.', 'error', 3200);
        return;
      }

      const periods = this._getSettingsTimetablePeriods().filter((period) => period.type === 'class' || period.type === 'afterSchool');
      const weekdays = ['월', '화', '수', '목', '금'];
      const rows = [['요일', '교시', '교시명', '시간', '과목']];

      weekdays.forEach((day, index) => {
        periods.forEach((period) => {
          if (period.type === 'afterSchool' && Array.isArray(period.days) && !period.days.includes(index + 1)) {
            return;
          }
          rows.push([day, period.period, period.label, `${period.start}~${period.end}`, '']);
        });
      });

      const guideRows = [
        ['작성 방법'],
        ['1. 시간표 시트에서 과목 칸만 채우면 됩니다.'],
        ['2. 요일은 월/화/수/목/금 또는 1~5 값을 사용할 수 있습니다.'],
        ['3. 업로드하면 교사용 시간표 모드로 바로 반영됩니다.']
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), '시간표');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(guideRows), '작성안내');

      const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const fileName = `LivelySam_교사용시간표_양식_${LS.Helpers.formatDate(new Date(), 'YYYY-MM-DD')}.xlsx`;

      this._downloadBlob(blob, fileName);
      LS.Helpers.showToast('교사용 시간표 양식을 다운로드했습니다.', 'success');
    },

    _importTeacherTimetableExcel() {
      if (!window.XLSX) {
        LS.Helpers.showToast('엑셀 라이브러리를 불러오지 못했습니다.', 'error', 3200);
        return;
      }

      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.xlsx,.xls';
      input.onchange = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
          const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
          const imported = this._parseTeacherTimetableWorkbook(workbook);
          this._writeTeacherTimetableForSettings(imported);
          LS.Config.set('timetableMode', 1);
          const modeEl = document.getElementById('timetable-mode-select');
          const quickModeEl = document.getElementById('quick-timetable-mode-select');
          if (modeEl) modeEl.value = '1';
          if (quickModeEl) quickModeEl.value = '1';
          LS.Helpers.showToast('교사용 시간표를 엑셀에서 가져왔습니다.', 'success', 3200);
          await LS.TimetableWidget.refresh();
          this._refreshTimetableSettingsViews();
          this._refreshQuickStartOverview();
        } catch (error) {
          LS.Helpers.showToast(`엑셀 가져오기 실패: ${error.message}`, 'error', 3600);
        }
      };
      input.click();
    },

    _parseTeacherTimetableWorkbook(workbook) {
      const sheetName = workbook.SheetNames.includes('시간표')
        ? '시간표'
        : workbook.SheetNames[0];

      const sheet = workbook.Sheets[sheetName];
      if (!sheet) {
        throw new Error('시간표 시트를 찾지 못했습니다.');
      }

      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
      const teacherTimetable = {};
      let importedCount = 0;

      rows.forEach((row) => {
        const dayValue = row['요일'] ?? row.day ?? row.weekday;
        const periodValue = row['교시'] ?? row.period ?? row['교시번호'];
        const subjectValue = String(row['과목'] ?? row.subject ?? '').trim();
        const day = this._parseTeacherWeekday(dayValue);
        const period = this._parseTeacherPeriod(periodValue);

        if (!day || !period || !subjectValue) return;

        if (!teacherTimetable[day]) teacherTimetable[day] = {};
        teacherTimetable[day][period] = subjectValue;
        importedCount += 1;
      });

      if (!importedCount) {
        throw new Error('과목 데이터가 없습니다. 양식의 요일, 교시, 과목 칼럼을 확인해 주세요.');
      }

      return teacherTimetable;
    },

    _parseTeacherWeekday(value) {
      const text = String(value ?? '').trim();
      const map = {
        '1': 1, '월': 1, '월요일': 1,
        '2': 2, '화': 2, '화요일': 2,
        '3': 3, '수': 3, '수요일': 3,
        '4': 4, '목': 4, '목요일': 4,
        '5': 5, '금': 5, '금요일': 5
      };
      return map[text] || null;
    },

    _parseTeacherPeriod(value) {
      const match = String(value ?? '').trim().match(/\d+/);
      if (!match) return null;
      const period = parseInt(match[0], 10);
      return Number.isFinite(period) && period > 0 ? period : null;
    },

    _collectWidgetVisibilityFromForm() {
      return WIDGET_VISIBILITY_FIELDS.reduce((acc, [widgetId, fieldId]) => {
        const field = document.getElementById(fieldId);
        acc[widgetId] = field ? Boolean(field.checked) : LS.Config.isWidgetVisible(widgetId);
        return acc;
      }, {});
    },

    _populateSettingsForm() {
      this._settingsSyncing = true;
      const c = LS.Config;
      const leaderboardStatus = LS.Leaderboard?.getStatus?.() || {};
      const leaderboardConfig = leaderboardStatus.firebaseConfig || {};
      const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
      const setChecked = (id, val) => { const el = document.getElementById(id); if (el) el.checked = val; };
      const resolvedTheme = c.getTheme();
      const classValue = c.get('classNum');

      setVal('school-name-input', c.get('schoolName'));
      setVal('neis-key-input', c.get('neisApiKey'));
      setVal('weather-mode-select', typeof c.getWeatherProviderMode === 'function' ? c.getWeatherProviderMode() : 'proxy');
      setVal('weather-key-input', c.get('weatherApiKey'));
      setVal('theme-select', c.get('theme'));
      setVal('opacity-slider', c.get('widgetOpacity'));
      setVal('fontsize-slider', c.get('fontSize'));
      setVal('background-opacity-slider', c.get('backgroundOpacity'));
      WIDGET_VISIBILITY_FIELDS.forEach(([widgetId, fieldId]) => {
        setChecked(fieldId, c.isWidgetVisible(widgetId));
      });
      setVal('clock-format-select', c.get('clockFormat'));
      setChecked('show-analog-check', c.get('showAnalogClock'));
      setChecked('show-seconds-check', c.get('showSeconds'));
      setChecked('weather-show-current-check', c.get('weatherShowCurrent'));
      setChecked('weather-show-details-check', c.get('weatherShowDetails'));
      setChecked('weather-show-tonight-sky-check', c.get('weatherShowTonightSky'));
      setChecked('weather-show-hourly-check', c.get('weatherShowHourlyForecast'));
      setChecked('weather-show-daily-check', c.get('weatherShowDailyForecast'));
      setChecked('weather-show-air-current-check', c.get('weatherShowAirCurrent'));
      setChecked('weather-show-air-hourly-check', c.get('weatherShowAirHourlyForecast'));
      setChecked('weather-show-air-daily-check', c.get('weatherShowAirDailyForecast'));
      setChecked('weather-show-alerts-check', c.get('weatherShowAlerts'));
      setChecked('weather-show-updated-check', c.get('weatherShowUpdatedAt'));
      setChecked('meal-show-nutrition-check', c.get('mealShowNutritionInfo'));
      setChecked('meal-compact-day-check', c.get('mealCompactDayView'));
      setChecked('shortcut-show-labels-check', c.get('shortcutShowLabels'));
      setChecked('shortcut-show-paths-check', c.get('shortcutShowPaths'));
      setVal('shortcut-icon-scale-select', c.get('shortcutIconScale'));
      setVal('calendar-astronomy-level-select', c.get('calendarAstronomyLevel'));
      setChecked('calendar-astronomy-korea-check', c.get('calendarAstronomyKoreaOnly'));
      setVal('google-client-id-input', c.get('googleClientId'));
      setChecked('google-calendar-sync-check', c.get('googleCalendarSyncEnabled'));
      setChecked('google-tasks-sync-check', c.get('googleTasksSyncEnabled'));
      setVal('google-calendar-select', c.get('googleCalendarId'));
      setVal('google-tasklist-select', c.get('googleTasklistId'));
      setVal('leaderboard-provider-select', 'firebase');
      setVal('leaderboard-season-id-input', leaderboardStatus.seasonId || c.get('minigameSeasonId'));
      setVal('firebase-project-id-input', leaderboardConfig.projectId || c.get('firebaseProjectId'));
      setVal('firebase-api-key-input', leaderboardConfig.apiKey || c.get('firebaseApiKey'));
      setVal('firebase-auth-domain-input', leaderboardConfig.authDomain || c.get('firebaseAuthDomain'));
      setVal('firebase-app-id-input', leaderboardConfig.appId || c.get('firebaseAppId'));
      setVal('firebase-storage-bucket-input', leaderboardConfig.storageBucket || c.get('firebaseStorageBucket'));
      setVal('firebase-messaging-sender-id-input', leaderboardConfig.messagingSenderId || c.get('firebaseMessagingSenderId'));
      setVal('firebase-measurement-id-input', leaderboardConfig.measurementId || c.get('firebaseMeasurementId'));
      setVal('timetable-mode-select', c.get('timetableMode') || 0);
      setVal('quick-timetable-mode-select', c.get('timetableMode') || 0);
      setVal('homeroom-role-select', this._getTeacherRoleFromClassValue(classValue));
      setVal('quick-homeroom-role-select', this._getTeacherRoleFromClassValue(classValue));
      setVal('grade-select', c.get('grade'));
      setVal('quick-grade-select', c.get('grade'));
      setVal('class-input', LS.Config.isNonHomeroomClass(classValue) ? '' : classValue);
      setVal('quick-class-input', LS.Config.isNonHomeroomClass(classValue) ? '' : classValue);
      setVal('class-preset-select', this._getClassPresetValue(classValue));
      setVal('quick-class-preset-select', this._getClassPresetValue(classValue));
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
      this._setColorInputState('custom-primary-color', c.get('customPrimaryColor'), resolvedTheme.primary);
      this._setColorInputState('custom-primary-light-color', c.get('customPrimaryLightColor'), resolvedTheme.primaryLight);
      this._setColorInputState('custom-accent-color', c.get('customAccentColor'), resolvedTheme.accent);
      this._setColorInputState('custom-background-color', c.get('customBackgroundColor'), '#FFFFFF');
      this._syncTeacherRoleUI(this._getTeacherRoleFromClassValue(classValue));
      this._syncClassPresetInput(this._getClassPresetValue(classValue), 'main');
      this._syncClassPresetInput(this._getClassPresetValue(classValue), 'quick');
      this._syncQuickStartForm();
      this._populateProfileControls();

      // 슬라이더 값 표시
      this._updateThemePreviewLabels();

      // ?숆탳 ?뺣낫 ?쒖떆
      const schoolInfo = document.getElementById('school-info-display');
      if (schoolInfo) {
        const name = c.get('schoolName');
        const code = c.get('schoolCode');
        if (name && code) {
          schoolInfo.textContent = `선택됨: ${name} (${c.get('atptCode')} / ${code})`;
          schoolInfo.style.color = '#2ecc71';
        } else {
          schoolInfo.textContent = '학교를 검색해 주세요.';
          schoolInfo.style.color = '#888';
        }
      }

      this._updateSettingsRuntimeTip();
      this._refreshGoogleSettingsStatus();
      this._refreshLeaderboardSettingsStatus();
      this._applyEmbeddedLeaderboardUi();
      const resultBox = document.getElementById('school-search-results');
      if (resultBox) resultBox.innerHTML = '';
      const quickResultBox = document.getElementById('quickstart-school-results');
      if (quickResultBox) quickResultBox.innerHTML = '';

      // 교시 시간표 미리보기
      this._renderPeriodPreview();
      this._renderSettingsTimetableEditor();
      this._refreshWidgetSettingsSummary();
      this._setActiveWidgetSummary('clock');
      this._renderSettingsPanelIntro(this._activeSettingsTab || 'quickstart');
      this._applyLiveThemePreview();
      this._settingsDirty = false;
      this._setSettingsSaveState('neutral', '저장됨');
      this._settingsSyncing = false;
      this._refreshQuickStartOverview();
    },

    _renderPeriodPreview() {
      const container = document.getElementById('period-preview');
      if (!container) return;

      const periods = document.getElementById('start-time-input')
        ? this._getSettingsTimetablePeriods()
        : LS.Config.getPeriods();
      let html = '<div class="period-preview-list">';
      periods.forEach(p => {
        const emoji = p.type === 'class'
          ? '📖'
          : p.type === 'lunch'
            ? '🍽️'
            : p.type === 'break'
              ? '☕'
              : p.type === 'morning'
                ? '🌅'
                : '📚';
        html += `<div class="period-preview-item">`;
        html += `<span class="period-preview-time">${p.start} ~ ${p.end}</span>`;
        html += `<span class="period-preview-label">${emoji} ${p.label}</span>`;
        html += `</div>`;
      });
      html += '</div>';
      container.innerHTML = html;
    },

    _renderSettingsTimetableEditor() {
      const container = document.getElementById('settings-timetable-editor');
      const statusEl = document.getElementById('settings-timetable-editor-status');
      const clearBtn = document.getElementById('settings-timetable-clear-btn');
      if (!container) return;

      const context = this._getSettingsTimetableContext();
      const classLabel = context.roleValue === 'nonhomeroom'
        ? '비담임'
        : `${context.grade + 1}학년 ${LS.Config.getClassDisplayName(context.classNum)}`.trim();
      const periods = this._getSettingsTimetablePeriods().filter((period) => period.type === 'class' || period.type === 'afterSchool');
      const teacherTimetable = this._readTeacherTimetableForSettings();
      const weekdays = [
        { value: '1', label: '월' },
        { value: '2', label: '화' },
        { value: '3', label: '수' },
        { value: '4', label: '목' },
        { value: '5', label: '금' }
      ];
      const hasEntries = weekdays.some(({ value: day }) => {
        const dayEntries = teacherTimetable[day];
        return dayEntries && Object.keys(dayEntries).length > 0;
      });

      if (statusEl) {
        const modeMessage = context.timetableMode === 1
          ? '현재는 교사용 직접 입력 모드입니다. 아래 표를 수정하면 즉시 저장되고 시간표 위젯에도 반영됩니다.'
          : '현재는 학급 시간표 자동 연동 모드입니다. 아래 표는 교사용 시간표로 저장되며, 시간표 방식을 교사용으로 바꾸면 사용됩니다.';
        statusEl.textContent = `${classLabel} 기준 교사용 시간표입니다. ${modeMessage}`;
      }
      if (clearBtn) {
        clearBtn.disabled = !hasEntries;
      }

      if (!periods.length) {
        container.innerHTML = '<div class="settings-timetable-editor-empty">교시 수와 일과 시간을 먼저 입력해 주세요.</div>';
        return;
      }

      let html = '<div class="settings-timetable-editor-table-wrap"><table class="settings-timetable-editor-table"><thead><tr><th>교시</th>';
      weekdays.forEach((day) => {
        html += `<th>${day.label}</th>`;
      });
      html += '</tr></thead><tbody>';

      periods.forEach((period) => {
        html += '<tr>';
        html += `<th><div class="settings-timetable-period-label">${LS.Helpers.escapeHtml(period.label)}</div><div class="settings-timetable-period-time">${LS.Helpers.escapeHtml(`${period.start} ~ ${period.end}`)}</div></th>`;

        weekdays.forEach((day) => {
          const isUnavailable = period.type === 'afterSchool'
            && Array.isArray(period.days)
            && !period.days.includes(parseInt(day.value, 10));
          if (isUnavailable) {
            html += '<td class="settings-timetable-editor-unavailable">미사용</td>';
            return;
          }

          const value = String(teacherTimetable?.[day.value]?.[String(period.period)] || '');
          html += `
            <td>
              <input
                type="text"
                class="setting-input settings-timetable-cell-input"
                data-day="${day.value}"
                data-period="${LS.Helpers.escapeHtml(String(period.period))}"
                value="${LS.Helpers.escapeHtml(value)}"
                placeholder="과목 입력">
            </td>
          `;
        });

        html += '</tr>';
      });

      html += '</tbody></table></div>';
      container.innerHTML = html;
    },

    async _clearSettingsTeacherTimetable() {
      const teacherTimetable = this._readTeacherTimetableForSettings();
      const hasEntries = Object.values(teacherTimetable).some((dayEntries) => dayEntries && Object.keys(dayEntries).length > 0);
      if (!hasEntries) {
        LS.Helpers.showToast('비울 교사용 시간표가 없습니다.', 'info', 2000);
        return;
      }

      const confirmed = await LS.Helpers.confirmModal(
        '교사용 시간표 비우기',
        '현재 학급/담당 기준으로 저장된 교사용 시간표를 모두 비우시겠습니까?'
      );
      if (!confirmed) return;

      this._writeTeacherTimetableForSettings({});
      this._renderSettingsTimetableEditor();
      await LS.TimetableWidget.refresh();
      this._refreshWidgetSettingsSummary();
      LS.Helpers.showToast('교사용 시간표를 비웠습니다.', 'success', 2200);
    },

    async _searchSchool(options = {}) {
      const inputId = options.inputId || 'school-name-input';
      const resultBoxId = options.resultBoxId || 'school-search-results';
      const infoId = options.infoId || 'school-info-display';
      const input = document.getElementById(inputId);
      const resultBox = document.getElementById(resultBoxId);
      if (!input || !resultBox) return;

      const name = input.value.trim();
      if (!name) {
        LS.Helpers.showToast('학교명을 입력해 주세요.', 'warning');
        return;
      }

      LS.NeisAPI.setApiKey((LS.Config.get('neisApiKey') || '').trim());
      resultBox.innerHTML = '<div class="search-loading">검색 중...</div>';

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

        resultBox.querySelectorAll('.school-result-item').forEach(item => {
          item.addEventListener('click', () => {
            const idx = parseInt(item.dataset.index);
            const school = results[idx];
            const weatherMode = this._getWeatherProviderModeDraft('main');
            const weatherApiKey = this._getWeatherApiKeyDraft('main');
            const mainSchoolInput = document.getElementById('school-name-input');
            const quickSchoolInput = document.getElementById('quick-school-name-input');
            LS.Config.setMultiple({
              schoolName: school.name,
              atptCode: school.atptCode,
              schoolCode: school.schoolCode,
              schoolAddress: school.address
            });
            this._resolvedSchoolSignature =
              `${this._normalizeSchoolName(school.name)}|${school.atptCode}|${school.schoolCode}`;
            this._schoolResolveState = {
              status: 'ready',
              message: `${school.region} ${school.name}와 연결되었습니다.`
            };

            // 날씨 좌표 설정
            LS.WeatherAPI.setMode(weatherMode);
            LS.WeatherAPI.setApiKey(weatherApiKey);
            if (school.address && (typeof LS.WeatherAPI.hasAvailableProvider !== 'function' || LS.WeatherAPI.hasAvailableProvider())) {
              LS.WeatherAPI.setApiKey(weatherApiKey);
              LS.WeatherAPI.geocode(school.address).then(loc => {
                if (loc) {
                  LS.Config.setMultiple({
                    weatherLat: loc.lat,
                    weatherLon: loc.lon,
                    weatherSchoolLat: loc.lat,
                    weatherSchoolLon: loc.lon
                  });
                  this._resolvedWeatherSignature = `${weatherMode}|school|${school.address}|${loc.lat}|${loc.lon}`;
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
              this._weatherResolveState = weatherMode === 'custom'
            ? { status: 'idle', message: '개인 OpenWeather API 키를 입력하면 학교 기준 날씨 위치를 바로 확인하고 직접 연결 상태까지 점검합니다.' }
                : { status: 'idle', message: '' };
            }

            // UI 갱신
            const infoEl = document.getElementById(infoId);
            if (infoEl) {
              infoEl.textContent = `선택됨: ${school.name}`;
              infoEl.style.color = '#2ecc71';
            }
            const mainInfoEl = document.getElementById('school-info-display');
            if (mainInfoEl && mainInfoEl !== infoEl) {
              mainInfoEl.textContent = `선택됨: ${school.name} (${school.atptCode} / ${school.schoolCode})`;
              mainInfoEl.style.color = '#2ecc71';
            }
            const quickInfoEl = document.getElementById('quickstart-school-display');
            if (quickInfoEl && quickInfoEl !== infoEl) {
              quickInfoEl.textContent = `선택됨: ${school.name} (${school.atptCode} / ${school.schoolCode})`;
            }
            resultBox.innerHTML = '';
            input.value = school.name;
            if (mainSchoolInput) mainSchoolInput.value = school.name;
            if (quickSchoolInput) quickSchoolInput.value = school.name;
            this._markSettingsDirty('학교 선택 저장 전');
            this._refreshQuickStartOverview();
            this._renderSettingsPanelIntro();

            this._refreshLivelySetupNotice();
          });
        });
      } catch (e) {
        resultBox.innerHTML = '<div class="search-error">검색에 실패했습니다. 기본 학교 서버 상태를 확인해 주세요.</div>';
      }
    },

    async _saveSettings() {
      if (this._settingsSaveInProgress) return;
      this._settingsSaveInProgress = true;
      this._syncSettingsDismissControls();

      try {
      const getVal = (id) => document.getElementById(id)?.value || '';
      const getChecked = (id) => document.getElementById(id)?.checked || false;
      const getInt = (id, def) => parseInt(document.getElementById(id)?.value) || def;
      const schoolName = getVal('school-name-input').trim();
      const currentSchoolName = String(LS.Config.get('schoolName') || '').trim();
      const previousWidgetVisibility = LS.Config.getWidgetVisibility();
      const nextWidgetVisibility = this._collectWidgetVisibilityFromForm();
      const nextLeaderboardConfig = this._collectLeaderboardSettingsFromForm();
      const nextWeatherProviderMode = this._getWeatherProviderModeDraft('main');

      const nextConfig = {
        schoolName,
        neisApiKey: getVal('neis-key-input'),
        weatherProviderMode: nextWeatherProviderMode,
        weatherProviderModeTouched: true,
        weatherApiKey: getVal('weather-key-input'),
        weatherActivePreset: 'school',
        weatherHomeLabel: '집',
        weatherHomeAddress: '',
        weatherHomeLat: null,
        weatherHomeLon: null,
        theme: getInt('theme-select', 1),
        widgetOpacity: getInt('opacity-slider', 75),
        fontSize: getInt('fontsize-slider', 14),
        backgroundOpacity: getInt('background-opacity-slider', 98),
        widgetVisibility: nextWidgetVisibility,
        clockFormat: getInt('clock-format-select', 1),
        showAnalogClock: getChecked('show-analog-check'),
        showSeconds: getChecked('show-seconds-check'),
        weatherShowCurrent: getChecked('weather-show-current-check'),
        weatherShowDetails: getChecked('weather-show-details-check'),
        weatherShowHourlyForecast: getChecked('weather-show-hourly-check'),
        weatherShowDailyForecast: getChecked('weather-show-daily-check'),
        weatherShowAirCurrent: getChecked('weather-show-air-current-check'),
        weatherShowAirHourlyForecast: getChecked('weather-show-air-hourly-check'),
        weatherShowAirDailyForecast: getChecked('weather-show-air-daily-check'),
        weatherShowAlerts: getChecked('weather-show-alerts-check'),
        weatherShowUpdatedAt: getChecked('weather-show-updated-check'),
        weatherShowTonightSky: getChecked('weather-show-tonight-sky-check'),
        mealShowNutritionInfo: getChecked('meal-show-nutrition-check'),
        mealCompactDayView: getChecked('meal-compact-day-check'),
        shortcutShowLabels: getChecked('shortcut-show-labels-check'),
        shortcutShowPaths: getChecked('shortcut-show-paths-check'),
        shortcutIconScale: getVal('shortcut-icon-scale-select') || 'medium',
        calendarAstronomyLevel: getVal('calendar-astronomy-level-select') || 'basic',
        calendarAstronomyKoreaOnly: getChecked('calendar-astronomy-korea-check'),
        googleClientId: getVal('google-client-id-input').trim(),
        googleCalendarSyncEnabled: getChecked('google-calendar-sync-check'),
        googleTasksSyncEnabled: getChecked('google-tasks-sync-check'),
        googleCalendarId: getVal('google-calendar-select') || 'primary',
        googleTasklistId: getVal('google-tasklist-select') || '@default',
        ...nextLeaderboardConfig,
        timetableMode: getInt('timetable-mode-select', 0),
        grade: getInt('grade-select', 0),
        classNum: this._getSelectedClassValue() || '1',
        startTime: getVal('start-time-input') || '08:20',
        morningMinutes: getInt('morning-min-input', 10),
        classMinutes: getInt('class-min-input', 50),
        breakMinutes: getInt('break-min-input', 10),
        lunchMinutes: getInt('lunch-min-input', 60),
        lunchAfterPeriod: getInt('lunch-after-select', 1),
        totalPeriods: getInt('total-periods-select', 1),
        afterSchoolEnabled: getChecked('afterschool-check'),
        afterSchoolMinutes: getInt('afterschool-min-input', 70),
        afterSchoolDays: getVal('afterschool-days-input') || '1,3,5',
        customPrimaryColor: this._readThemePreviewValues().customPrimaryColor,
        customPrimaryLightColor: this._readThemePreviewValues().customPrimaryLightColor,
        customAccentColor: this._readThemePreviewValues().customAccentColor,
        customBackgroundColor: this._readThemePreviewValues().customBackgroundColor
      };

      if (!schoolName) {
        Object.assign(nextConfig, {
          atptCode: '',
          schoolCode: '',
          schoolAddress: '',
          weatherLat: null,
          weatherLon: null,
          weatherSchoolLat: null,
          weatherSchoolLon: null
        });
      } else if (schoolName !== currentSchoolName) {
        Object.assign(nextConfig, {
          atptCode: '',
          schoolCode: '',
          schoolAddress: ''
        });
        this._resolvedSchoolSignature = '';
        this._resolvedWeatherSignature = '';
      }

      LS.Config.setMultiple(nextConfig);
      LS.Leaderboard?.reset?.();
      LS.Leaderboard?.warmup?.().catch((error) => {
        console.warn('[LivelySam] 리더보드 재연결 실패:', error);
      });
      LS.MinigamesHub?.invalidateHallOfFameCache?.();
      LS.MinigamesHub?.render?.();
      LS.Config.resetPeriodsToAuto();
      LS.Config.applyTheme();
      this._refreshGoogleSyncDockButton();
      this._refreshLeaderboardSettingsStatus();

      const selectedWeatherPreset = 'school';
      const weatherPresetConfig = LS.Config.getWeatherPresetConfig();
      const shouldVerifyWeatherConnection = Boolean(weatherPresetConfig?.address && (
        nextWeatherProviderMode === 'proxy' ||
        String(nextConfig.weatherApiKey || '').trim()
      ));
      const weatherProviderLabel = this._getWeatherProviderLabel(nextWeatherProviderMode);
      if (shouldVerifyWeatherConnection) {
        this.setWeatherConnectionState({
          status: 'loading',
          stage: 'resolve',
          presetKey: selectedWeatherPreset,
          locationName: '',
          checkedAt: 0,
          message: `${weatherPresetConfig.label || '학교'} 설정을 저장했습니다. ${weatherProviderLabel} 기준으로 주소와 실제 날씨 연결을 확인하는 중입니다.`
        });
      } else if (nextWeatherProviderMode === 'custom') {
        this.setWeatherConnectionState({
          status: 'idle',
          stage: 'idle',
          presetKey: selectedWeatherPreset,
          locationName: '',
          checkedAt: 0,
          message: '개인 OpenWeather API 키를 입력하면 저장 후 실제 연결까지 확인합니다. 실사용 기준으로 가장 빠르고 안정적인 방식입니다.'
        });
      } else {
        this.setWeatherConnectionState({
          status: 'idle',
          stage: 'idle',
          presetKey: selectedWeatherPreset,
          locationName: '',
          checkedAt: 0,
          message: '학교 주소가 연결되면 기본 공용 서버로 실제 날씨까지 확인합니다.'
        });
      }

      if (JSON.stringify(previousWidgetVisibility) !== JSON.stringify(nextWidgetVisibility)) {
        this._settingsDirty = false;
        this._setSettingsSaveState('saved', '저장됨');
        this._refreshQuickStartOverview();
        LS.Helpers.showToast('위젯 표시 설정을 적용하기 위해 화면을 새로고침합니다.', 'info', 2600);
        this._reloadAfterStorageFlush(240);
        return;
      }

      if (shouldVerifyWeatherConnection) {
        this._setSettingsSaveState('pending', '저장 후 날씨 확인 중');
      }

      await this._refreshDataWithOptions();
      LS.TimetableWidget.render();
      LS.ShortcutsWidget?.render?.();
      this._refreshTimetableSettingsViews();
      this._settingsDirty = false;
      this._refreshQuickStartOverview();

      const weatherState = this._weatherConnectionState || {};
      const weatherVerified = shouldVerifyWeatherConnection &&
        weatherState.status === 'ready' &&
        weatherState.presetKey === selectedWeatherPreset;
      const weatherFailed = shouldVerifyWeatherConnection &&
        weatherState.status === 'error' &&
        weatherState.presetKey === selectedWeatherPreset;

      if (weatherVerified) {
        this._setSettingsSaveState('saved', '저장됨 · 날씨 확인 완료');
        LS.Helpers.showToast('설정을 저장했고 날씨 연결까지 확인했습니다.', 'success', 2400);
      } else if (weatherFailed) {
        this._setSettingsSaveState('warning', '저장됨 · 날씨 확인 실패');
        LS.Helpers.showToast(weatherState.message || '설정은 저장했지만 날씨 확인에 실패했습니다.', 'warning', 3200);
      } else {
        this._setSettingsSaveState('saved', '저장됨');
        LS.Helpers.showToast('설정을 저장했습니다.', 'success', 2200);
      }
      this._captureSettingsSessionSnapshot();
      } catch (error) {
        this._setSettingsSaveState('warning', '저장 실패');
        LS.Helpers.showToast(`설정을 저장하지 못했습니다. ${error?.message || '잠시 후 다시 시도해 주세요.'}`, 'error', 3600);
      } finally {
        this._settingsSaveInProgress = false;
        this._syncSettingsDismissControls();
      }
    },

    async _exportData() {
      try {
        const data = await LS.Storage.exportAll();
        if (this._isHostedWallpaper()) {
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
            message: `${this._getHostedWallpaperName() || '현재 환경'}에서는 파일 다운로드 대신 JSON 복사 방식이 더 안정적입니다.`,
            confirmText: '닫기',
            showCancel: false
          });
          LS.Helpers.showToast('백업 JSON을 준비했습니다.', 'success');
          return;
        }

        const filename = `LivelySam_backup_${LS.Helpers.formatDate(new Date(), 'YYYY-MM-DD')}.json`;
        LS.Storage.downloadJSON(data, filename);
        LS.Helpers.showToast(`백업 파일을 저장했습니다. (${filename})`, 'success');
      } catch (e) {
        LS.Helpers.showToast(`내보내기 실패: ${e.message}`, 'error', 3200);
      }
    },

    async _confirmDataImport(sourceLabel = '선택한 백업 파일') {
      const unsavedMessage = this._settingsDirty
        ? ' 저장하지 않은 설정 변경도 함께 사라집니다.'
        : '';
      return LS.Helpers.confirmModal(
        '데이터 복원',
        `${sourceLabel}의 내용으로 현재 데이터 전체를 바꿉니다. 복원 후 화면이 새로고침됩니다.${unsavedMessage}`,
        {
          confirmText: '복원하기',
          cancelText: '취소'
        }
      );
    },

    _clearAppTimers() {
      window.clearInterval(this._appRefreshIntervalId);
      this._appRefreshIntervalId = 0;
      window.clearTimeout(this._startupQuickstartTimer);
      this._startupQuickstartTimer = 0;
      window.clearTimeout(this._googleAutoSyncTimer);
      this._googleAutoSyncTimer = 0;
      window.clearTimeout(this._googlePassiveSyncTimer);
      this._googlePassiveSyncTimer = 0;
      window.clearTimeout(this._googleInitialSyncTimer);
      this._googleInitialSyncTimer = 0;
      window.clearTimeout(this._googleSettingsResyncTimer);
      this._googleSettingsResyncTimer = 0;
      window.clearTimeout(this._floatingDockCollapseTimer);
      this._floatingDockCollapseTimer = 0;
      window.clearTimeout(this._settingsTimetableRefreshTimer);
      this._settingsTimetableRefreshTimer = 0;
      window.clearTimeout(this._widgetSettingsFocusTimer);
      this._widgetSettingsFocusTimer = 0;
      window.clearInterval(this._googleRealtimeSyncIntervalId);
      this._googleRealtimeSyncIntervalId = 0;
      if (this._widgetMetricsFrame) {
        window.cancelAnimationFrame(this._widgetMetricsFrame);
        this._widgetMetricsFrame = 0;
      }
      if (this._widgetSummarySyncFrame) {
        window.cancelAnimationFrame(this._widgetSummarySyncFrame);
        this._widgetSummarySyncFrame = 0;
      }
    },

    destroy() {
      this._clearAppTimers();
      this._widgetResizeObserver?.disconnect?.();
      this._widgetResizeObserver = null;
      if (this._viewportMetricsUpdater) {
        window.removeEventListener('resize', this._viewportMetricsUpdater);
      }
      if (this._runtimeChangedHandler) {
        window.removeEventListener('livelysam:runtimeChanged', this._runtimeChangedHandler);
      }
      if (this._googleRecordsChangedHandler) {
        window.removeEventListener('livelysam:recordsChanged', this._googleRecordsChangedHandler);
      }
      if (this._googleSyncChangedHandler) {
        window.removeEventListener('livelysam:googleSyncChanged', this._googleSyncChangedHandler);
      }
      if (this._googleProgressHandler) {
        window.removeEventListener('livelysam:googleSyncProgress', this._googleProgressHandler);
      }
      if (this._googleFocusSyncHandler) {
        window.removeEventListener('focus', this._googleFocusSyncHandler);
      }
      if (this._googleOnlineSyncHandler) {
        window.removeEventListener('online', this._googleOnlineSyncHandler);
      }
      if (this._googleVisibilitySyncHandler) {
        document.removeEventListener('visibilitychange', this._googleVisibilitySyncHandler);
      }
      if (this._beforeUnloadHandler) {
        window.removeEventListener('beforeunload', this._beforeUnloadHandler);
      }
    },

    async _importData() {
      if (this._isHostedWallpaper()) {
        const result = await LS.Helpers.promptModal('데이터 가져오기', [
          {
            id: 'json',
            type: 'textarea',
            label: '백업 JSON 붙여넣기',
            placeholder: '{ ... }',
            rows: 14
          }
        ], {
          message: '백업 JSON 전체를 붙여넣으면 현재 데이터를 지우고 백업 내용으로 복원합니다.',
          confirmText: '가져오기'
        });

        if (!result?.json?.trim()) return;
        if (!await this._confirmDataImport('붙여넣은 백업 JSON')) return;

        try {
          await LS.Storage.importAll(JSON.parse(result.json));
          LS.Helpers.showToast('데이터를 가져왔습니다. 화면을 새로고침합니다.', 'success', 3200);
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
        if (!await this._confirmDataImport(`선택한 백업 파일(${file.name})`)) return;
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

  /* 앱 시작 */
  document.addEventListener('DOMContentLoaded', () => {
    LS.App.init();
  });
})();
