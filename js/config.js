(function () {
  'use strict';

  const LS = window.LivelySam = window.LivelySam || {};
  const NON_HOMEROOM_CLASS = '__NO_HOMEROOM__';
  const CONFIG_STORAGE_KEY = 'config';
  const PROFILE_STORAGE_KEY = 'configProfiles';
  const ACTIVE_PROFILE_STORAGE_KEY = 'activeProfileId';
  const WIDGET_IDS = ['clock', 'timetable', 'calendar', 'weather', 'meal', 'timer', 'dday', 'memo', 'todo', 'bookmarks', 'shortcuts'];

  const THEMES = [
    { name: 'Berry Pastel', primary: '#FF8FA3', primaryLight: '#FFB5C2', accent: '#FF6B8A', bg: 'rgba(255, 181, 194, 0.05)' },
    { name: 'Ocean Breeze', primary: '#4DABF7', primaryLight: '#74C0FC', accent: '#228BE6', bg: 'rgba(116, 192, 252, 0.05)' },
    { name: 'Mint Garden', primary: '#63E6BE', primaryLight: '#96F2D7', accent: '#20C997', bg: 'rgba(150, 242, 215, 0.05)' },
    { name: 'Peach Coral', primary: '#FFA07A', primaryLight: '#FFC9B9', accent: '#FF7F50', bg: 'rgba(255, 201, 185, 0.05)' },
    { name: 'Lavender Dream', primary: '#B197FC', primaryLight: '#D0BFFF', accent: '#7950F2', bg: 'rgba(208, 191, 255, 0.05)' },
    { name: 'Sunny Lemon', primary: '#FFD43B', primaryLight: '#FFE066', accent: '#FCC419', bg: 'rgba(255, 224, 102, 0.05)' },
    { name: 'Icy Gray', primary: '#CED4DA', primaryLight: '#DEE2E6', accent: '#ADB5BD', bg: 'rgba(222, 226, 230, 0.05)' },
    { name: 'Sunset', primary: '#FF6B6B', primaryLight: '#FFA07A', accent: '#FFD93D', bg: 'rgba(255, 107, 107, 0.05)' }
  ];

  function getDefaultWidgetVisibility() {
    return WIDGET_IDS.reduce((acc, id) => {
      acc[id] = true;
      return acc;
    }, {});
  }

  const DEFAULTS = {
    schoolName: '',
    neisApiKey: '',
    weatherProviderMode: 'proxy',
    weatherProviderModeTouched: false,
    weatherApiKey: '',
    atptCode: '',
    schoolCode: '',
    schoolAddress: '',
    weatherLat: null,
    weatherLon: null,
    weatherSchoolLat: null,
    weatherSchoolLon: null,
    weatherActivePreset: 'school',
    weatherHomeLabel: '집',
    weatherHomeAddress: '',
    weatherHomeLat: null,
    weatherHomeLon: null,
    weatherShowCurrent: true,
    weatherShowDetails: true,
    weatherShowHourlyForecast: true,
    weatherShowDailyForecast: true,
    weatherShowAirCurrent: true,
    weatherShowAirHourlyForecast: true,
    weatherShowAirDailyForecast: true,
    weatherShowAlerts: true,
    weatherShowUpdatedAt: true,
    weatherShowTonightSky: true,
    mealShowNutritionInfo: true,
    mealCompactDayView: false,
    shortcutShowLabels: true,
    shortcutShowPaths: false,
    shortcutIconScale: 'medium',
    calendarAstronomyLevel: 'basic',
    calendarAstronomyKoreaOnly: true,
    googleClientId: '',
    googleCalendarSyncEnabled: true,
    googleTasksSyncEnabled: true,
    googleCalendarId: 'primary',
    googleTasklistId: '@default',
    minigameLeaderboardProvider: 'firebase',
    minigameSeasonId: 'season-1',
    firebaseApiKey: '',
    firebaseAuthDomain: '',
    firebaseProjectId: '',
    firebaseStorageBucket: '',
    firebaseMessagingSenderId: '',
    firebaseAppId: '',
    firebaseMeasurementId: '',
    theme: 1,
    widgetOpacity: 75,
    fontSize: 14,
    clockFormat: 1,
    showAnalogClock: true,
    showSeconds: true,
    timetableMode: 0,
    grade: 0,
    classNum: '1',
    startTime: '08:20',
    morningMinutes: 10,
    classMinutes: 50,
    breakMinutes: 10,
    lunchMinutes: 60,
    lunchAfterPeriod: 1,
    totalPeriods: 1,
    afterSchoolEnabled: false,
    afterSchoolMinutes: 70,
    afterSchoolDays: '1,3,5',
    customPrimaryColor: '',
    customPrimaryLightColor: '',
    customAccentColor: '',
    customBackgroundColor: '',
    backgroundOpacity: 98,
    widgetVisibility: getDefaultWidgetVisibility(),
    gridLayout: null,
    customPeriods: null
  };

  const PROFILE_KEYS = [
    'schoolName',
    'atptCode',
    'schoolCode',
    'schoolAddress',
    'weatherLat',
    'weatherLon',
    'weatherSchoolLat',
    'weatherSchoolLon',
    'weatherActivePreset',
    'weatherHomeLabel',
    'weatherHomeAddress',
    'weatherHomeLat',
    'weatherHomeLon',
    'timetableMode',
    'grade',
    'classNum'
  ];

  const GLOBAL_KEYS = Object.keys(DEFAULTS).filter((key) => !PROFILE_KEYS.includes(key));

  const BOOLEAN_KEYS = [
    'showAnalogClock',
    'showSeconds',
    'afterSchoolEnabled',
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
    'weatherProviderModeTouched',
    'mealShowNutritionInfo',
    'mealCompactDayView',
    'shortcutShowLabels',
    'shortcutShowPaths',
    'calendarAstronomyKoreaOnly',
    'googleCalendarSyncEnabled',
    'googleTasksSyncEnabled'
  ];

  const WEATHER_LOCATION_KEYS = [
    'weatherLat',
    'weatherLon',
    'weatherSchoolLat',
    'weatherSchoolLon',
    'weatherHomeLat',
    'weatherHomeLon',
    'weatherActivePreset'
  ];

  function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj || {}, key);
  }

  function pick(obj, keys) {
    const picked = {};
    (keys || []).forEach((key) => {
      if (hasOwn(obj, key)) {
        picked[key] = obj[key];
      }
    });
    return picked;
  }

  function isHexColor(value) {
    return /^#([0-9a-f]{6})$/i.test(String(value || '').trim());
  }

  function normalizeHexColor(value, fallback = '') {
    const text = String(value || '').trim();
    return isHexColor(text) ? text.toUpperCase() : fallback;
  }

  function normalizeBoolean(value, fallback = false) {
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return fallback;
  }

  function normalizeText(value, fallback = '') {
    if (value === null || value === undefined) return fallback;
    const text = String(value).trim();
    return text || fallback;
  }

  function normalizeNullableNumber(value, fallback = null) {
    if (value === '' || value === null || value === undefined) return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function normalizeWeatherPreset(value) {
    return String(value || '').trim().toLowerCase() === 'home' ? 'home' : 'school';
  }

  function normalizeWeatherProviderMode(value) {
    return String(value || '').trim().toLowerCase() === 'custom' ? 'custom' : 'proxy';
  }

  function normalizeAstronomyLevel(value, legacyValue = undefined) {
    const text = String(value || '').trim().toLowerCase();
    if (text === 'off') return 'off';
    if (text === 'detailed') return 'detailed';
    if (text === 'basic') return 'basic';
    if (legacyValue !== undefined) {
      return normalizeBoolean(legacyValue, true) ? 'basic' : 'off';
    }
    return DEFAULTS.calendarAstronomyLevel;
  }

  function normalizeShortcutIconScale(value) {
    const text = String(value || '').trim().toLowerCase();
    if (text === 'small' || text === 'large' || text === 'medium') return text;
    return DEFAULTS.shortcutIconScale;
  }

  function extractStoredWidgetVisibilityKeys(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return [];
    }

    return WIDGET_IDS.filter((id) => Object.prototype.hasOwnProperty.call(value, id));
  }

  function normalizeWidgetVisibility(value) {
    const defaults = getDefaultWidgetVisibility();
    if (!value || typeof value !== 'object') {
      return defaults;
    }

    return WIDGET_IDS.reduce((acc, id) => {
      const hasStoredValue = Object.prototype.hasOwnProperty.call(value, id);
      acc[id] = hasStoredValue
        ? normalizeBoolean(value[id], defaults[id])
        : defaults[id];
      return acc;
    }, {});
  }

  function hexToRgb(hex) {
    if (!isHexColor(hex)) return null;
    const value = hex.slice(1);
    return {
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16)
    };
  }

  function hexToRgba(hex, alpha) {
    const rgb = hexToRgb(hex);
    if (!rgb) return 'rgba(255, 255, 255, 0.98)';
    const safeAlpha = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1;
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${safeAlpha})`;
  }

  function mixHex(colorA, colorB, ratio = 0.35) {
    const a = hexToRgb(colorA);
    const b = hexToRgb(colorB);
    if (!a || !b) return colorA;

    const weight = Math.max(0, Math.min(1, ratio));
    const mix = (first, second) => Math.round(first * (1 - weight) + second * weight);
    const toHex = (value) => value.toString(16).padStart(2, '0').toUpperCase();

    return `#${toHex(mix(a.r, b.r))}${toHex(mix(a.g, b.g))}${toHex(mix(a.b, b.b))}`;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function createProfileId() {
    return typeof LS.Helpers?.generateId === 'function'
      ? `profile_${LS.Helpers.generateId()}`
      : `profile_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }

  LS.Config = {
    _config: {},
    _globalConfig: {},
    _profiles: [],
    _activeProfileId: '',
    _initialWidgetVisibilityKeys: [],
    _listeners: [],

    init() {
      const saved = LS.Storage.get(CONFIG_STORAGE_KEY, {});
      this._initialWidgetVisibilityKeys = extractStoredWidgetVisibilityKeys(saved?.widgetVisibility);
      const normalizedSaved = this._normalizeConfig({ ...DEFAULTS, ...saved });
      if (!hasOwn(saved, 'weatherProviderModeTouched') && normalizeText(saved?.weatherApiKey, '')) {
        normalizedSaved.weatherProviderMode = 'custom';
      }
      const storedProfiles = LS.Storage.get(PROFILE_STORAGE_KEY, []);
      const storedActiveProfileId = String(LS.Storage.get(ACTIVE_PROFILE_STORAGE_KEY, '') || '');

      this._globalConfig = pick(normalizedSaved, GLOBAL_KEYS);
      this._profiles = this._normalizeProfiles(storedProfiles, normalizedSaved);
      this._activeProfileId = this._resolveActiveProfileId(storedActiveProfileId);
      this._rebuildResolvedConfig();
      this._save();

      if (this._config.neisApiKey) {
        LS.NeisAPI.setApiKey(this._config.neisApiKey);
      }

      this._syncWeatherAPI();
    },

    get(key) {
      const value = this._config[key] !== undefined ? this._config[key] : DEFAULTS[key];
      if (key === 'widgetVisibility' && value && typeof value === 'object') {
        return clone(value);
      }
      return value;
    },

    getWidgetVisibility() {
      return clone(this._config.widgetVisibility || getDefaultWidgetVisibility());
    },

    getInitialWidgetVisibilityKeys() {
      return [...this._initialWidgetVisibilityKeys];
    },

    isWidgetVisible(widgetId) {
      const visibility = this._config.widgetVisibility || getDefaultWidgetVisibility();
      return visibility[widgetId] !== false;
    },

    getNonHomeroomValue() {
      return NON_HOMEROOM_CLASS;
    },

    normalizeClassNum(value) {
      const text = String(value ?? '').trim();
      if (!text) return DEFAULTS.classNum;

      if (text === NON_HOMEROOM_CLASS || text === '비담임' || text.toLowerCase() === 'none') {
        return NON_HOMEROOM_CLASS;
      }

      const stripped = text.replace(/반/g, '').trim();
      if (/^\d+$/.test(stripped)) {
        return String(parseInt(stripped, 10));
      }

      return stripped;
    },

    isNonHomeroomClass(value = this._config.classNum) {
      return this.normalizeClassNum(value) === NON_HOMEROOM_CLASS;
    },

    getClassDisplayName(value = this._config.classNum) {
      const normalized = this.normalizeClassNum(value);
      return normalized === NON_HOMEROOM_CLASS ? '비담임' : `${normalized}반`;
    },

    getWeatherPresetKey(value = this._config.weatherActivePreset) {
      return normalizeWeatherPreset(value);
    },

    getWeatherProviderMode(value = this._config.weatherProviderMode) {
      return normalizeWeatherProviderMode(value);
    },

    isWeatherUsingCustomKey() {
      return this.getWeatherProviderMode() === 'custom';
    },

    getWeatherApiKeyForUse() {
      return this.isWeatherUsingCustomKey()
        ? normalizeText(this._config.weatherApiKey, '')
        : '';
    },

    getWeatherPresetConfig(preset = this._config.weatherActivePreset) {
      const schoolLabel = normalizeText(this._config.schoolName, '학교');
      const schoolAddress = normalizeText(this._config.schoolAddress, '');
      const schoolLat = this._config.weatherSchoolLat ?? this._config.weatherLat;
      const schoolLon = this._config.weatherSchoolLon ?? this._config.weatherLon;

      if (false) return {
        key: 'school',
        label: schoolLabel,
        address: schoolAddress,
        lat: schoolLat ?? null,
        lon: schoolLon ?? null,
        hasCoordinates: schoolLat !== null && schoolLon !== null
      };

      const key = this.getWeatherPresetKey(preset);
      const isHome = key === 'home';
      const label = isHome
        ? normalizeText(this._config.weatherHomeLabel, '집')
        : normalizeText(this._config.schoolName, '학교');
      const address = isHome
        ? normalizeText(this._config.weatherHomeAddress, '')
        : normalizeText(this._config.schoolAddress, '');
      const lat = isHome
        ? this._config.weatherHomeLat
        : (this._config.weatherSchoolLat ?? this._config.weatherLat);
      const lon = isHome
        ? this._config.weatherHomeLon
        : (this._config.weatherSchoolLon ?? this._config.weatherLon);

      return {
        key,
        label,
        address,
        lat: lat ?? null,
        lon: lon ?? null,
        hasCoordinates: lat !== null && lon !== null
      };
    },

    getWeatherLocation(preset = this._config.weatherActivePreset) {
      const selected = this.getWeatherPresetConfig(preset);
      if (selected.lat === null || selected.lon === null) return null;
      return { lat: selected.lat, lon: selected.lon };
    },

    getSchoolContextKey() {
      const atptCode = normalizeText(this.get('atptCode'), 'no-atpt');
      const schoolCode = normalizeText(this.get('schoolCode'), 'no-school');
      return `${atptCode}:${schoolCode}`;
    },

    getClassroomContextKey() {
      const grade = String(parseInt(this.get('grade'), 10) || 0);
      const classNum = this.normalizeClassNum(this.get('classNum'));
      const timetableMode = String(parseInt(this.get('timetableMode'), 10) || 0);
      return `${this.getSchoolContextKey()}:${grade}:${classNum}:${timetableMode}`;
    },

    getProfiles() {
      return clone(this._profiles.map((profile) => ({
        id: profile.id,
        name: profile.name,
        updatedAt: profile.updatedAt,
        schoolName: profile.data.schoolName || '',
        grade: profile.data.grade,
        classNum: profile.data.classNum,
        timetableMode: profile.data.timetableMode,
        weatherHomeLabel: profile.data.weatherHomeLabel || '집',
        weatherActivePreset: profile.data.weatherActivePreset || 'school'
      })));
    },

    getActiveProfileId() {
      return this._activeProfileId;
    },

    getActiveProfile() {
      const profile = this._getActiveProfileInternal();
      return profile ? clone(profile) : null;
    },

    createProfile(name, options = {}) {
      const sourceData = options.cloneCurrent === false
        ? this._getDefaultProfileData()
        : this._getCurrentProfileData();
      const profile = {
        id: createProfileId(),
        name: normalizeText(name, this._buildProfileName()),
        updatedAt: nowIso(),
        data: this._normalizeProfileData(sourceData)
      };

      this._profiles.push(profile);
      this._activeProfileId = profile.id;
      this._rebuildResolvedConfig();
      this._save();
      this._syncWeatherAPI();
      this._emitChange('_bulk', clone(this._config), null);
      return this.getActiveProfile();
    },

    renameActiveProfile(name) {
      const profile = this._getActiveProfileInternal();
      if (!profile) return null;
      profile.name = normalizeText(name, profile.name || this._buildProfileName());
      profile.updatedAt = nowIso();
      this._save();
      this._emitChange('_profile_meta', this.getActiveProfile(), null);
      return this.getActiveProfile();
    },

    deleteActiveProfile() {
      if (this._profiles.length <= 1) return false;

      const currentId = this._activeProfileId;
      const nextProfiles = this._profiles.filter((profile) => profile.id !== currentId);
      if (nextProfiles.length === this._profiles.length) return false;

      this._profiles = nextProfiles;
      this._activeProfileId = nextProfiles[0]?.id || '';
      this._rebuildResolvedConfig();
      this._save();
      this._syncWeatherAPI();
      this._emitChange('_bulk', clone(this._config), null);
      return true;
    },

    switchProfile(profileId) {
      const nextId = String(profileId || '').trim();
      if (!nextId || nextId === this._activeProfileId) {
        return this.getActiveProfile();
      }

      const exists = this._profiles.some((profile) => profile.id === nextId);
      if (!exists) return this.getActiveProfile();

      this._activeProfileId = nextId;
      this._rebuildResolvedConfig();
      this._save();

      if (this._config.neisApiKey) {
        LS.NeisAPI.setApiKey(this._config.neisApiKey);
      }
      this._syncWeatherAPI();
      this._emitChange('_bulk', clone(this._config), null);
      return this.getActiveProfile();
    },

    set(key, value) {
      const old = this._config[key];
      const prepared = this._prepareValue(key, value);
      this._config[key] = prepared;
      this._syncWeatherAliases({ [key]: prepared });
      this._syncResolvedToSources();
      this._save();

      if (key === 'neisApiKey') LS.NeisAPI.setApiKey(prepared);
      if (key === 'weatherApiKey' || key === 'weatherProviderMode' || WEATHER_LOCATION_KEYS.includes(key)) {
        this._syncWeatherAPI();
      }

      this._emitChange(key, prepared, old);
    },

    setMultiple(obj) {
      const prepared = {};
      Object.entries(obj || {}).forEach(([key, value]) => {
        prepared[key] = this._prepareValue(key, value);
        this._config[key] = prepared[key];
      });

      this._syncWeatherAliases(prepared);
      this._syncResolvedToSources();
      this._save();

      if (hasOwn(prepared, 'neisApiKey')) LS.NeisAPI.setApiKey(this._config.neisApiKey);
      if (hasOwn(prepared, 'weatherApiKey') || hasOwn(prepared, 'weatherProviderMode') || WEATHER_LOCATION_KEYS.some((key) => hasOwn(prepared, key))) {
        this._syncWeatherAPI();
      }

      this._emitChange('_bulk', prepared, null);
    },

    onChange(fn) {
      this._listeners.push(fn);
    },

    getPeriods() {
      const custom = this._config.customPeriods;
      if (custom && custom.length > 0) return custom;
      return LS.Helpers.calculatePeriods(this._config);
    },

    resetPeriodsToAuto() {
      this._config.customPeriods = null;
      this._syncResolvedToSources();
      this._save();
      return LS.Helpers.calculatePeriods(this._config);
    },

    getTheme(overrides = {}) {
      const merged = { ...this._config, ...overrides };
      const baseTheme = THEMES[merged.theme] || THEMES[1];
      const primary = normalizeHexColor(merged.customPrimaryColor, baseTheme.primary);
      const primaryLight = normalizeHexColor(
        merged.customPrimaryLightColor,
        merged.customPrimaryColor ? mixHex(primary, '#FFFFFF', 0.35) : baseTheme.primaryLight
      );
      const accent = normalizeHexColor(merged.customAccentColor, baseTheme.accent);
      const backgroundColor = normalizeHexColor(merged.customBackgroundColor, '');
      const backgroundOpacity = Math.max(0, Math.min(100, parseInt(merged.backgroundOpacity, 10) || DEFAULTS.backgroundOpacity));
      const backgroundTint = backgroundColor
        ? hexToRgba(backgroundColor, backgroundOpacity / 100)
        : baseTheme.bg;

      return {
        name: baseTheme.name,
        primary,
        primaryLight,
        accent,
        backgroundColor: backgroundColor || '#FFFFFF',
        backgroundOpacity,
        bg: backgroundTint
      };
    },

    applyTheme() {
      this._applyThemeState(this._buildThemeState(this._config));
    },

    applyThemePreview(overrides = {}) {
      this._applyThemeState(this._buildThemeState({ ...this._config, ...overrides }));
    },

    _buildThemeState(configLike) {
      const theme = this.getTheme(configLike);
      const opacity = Math.max(0.1, Math.min(1, (parseInt(configLike.widgetOpacity, 10) || DEFAULTS.widgetOpacity) / 100));
      const fontSize = parseInt(configLike.fontSize, 10) || DEFAULTS.fontSize;
      return { theme, opacity, fontSize };
    },

    _applyThemeState(state) {
      const root = document.documentElement;
      root.style.setProperty('--theme-primary', state.theme.primary);
      root.style.setProperty('--theme-primary-light', state.theme.primaryLight);
      root.style.setProperty('--theme-accent', state.theme.accent);
      root.style.setProperty('--theme-bg-tint', state.theme.bg);
      root.style.setProperty('--widget-opacity', state.opacity);
      root.style.setProperty('--font-size-base', `${state.fontSize}px`);
    },

    _normalizeConfig(config) {
      const normalized = { ...config };
      normalized.classNum = this.normalizeClassNum(normalized.classNum);
      normalized.customPrimaryColor = normalizeHexColor(normalized.customPrimaryColor, '');
      normalized.customPrimaryLightColor = normalizeHexColor(normalized.customPrimaryLightColor, '');
      normalized.customAccentColor = normalizeHexColor(normalized.customAccentColor, '');
      normalized.customBackgroundColor = normalizeHexColor(normalized.customBackgroundColor, '');
      normalized.backgroundOpacity = Math.max(0, Math.min(100, parseInt(normalized.backgroundOpacity, 10) || DEFAULTS.backgroundOpacity));
      normalized.weatherActivePreset = normalizeWeatherPreset(normalized.weatherActivePreset);
      normalized.weatherProviderMode = normalizeWeatherProviderMode(normalized.weatherProviderMode);
      normalized.weatherHomeLabel = normalizeText(normalized.weatherHomeLabel, '집');
      normalized.weatherHomeAddress = normalizeText(normalized.weatherHomeAddress, '');
      normalized.weatherLat = normalizeNullableNumber(normalized.weatherLat, null);
      normalized.weatherLon = normalizeNullableNumber(normalized.weatherLon, null);
      normalized.weatherSchoolLat = normalizeNullableNumber(normalized.weatherSchoolLat, normalized.weatherLat);
      normalized.weatherSchoolLon = normalizeNullableNumber(normalized.weatherSchoolLon, normalized.weatherLon);
      normalized.weatherHomeLat = normalizeNullableNumber(normalized.weatherHomeLat, null);
      normalized.weatherHomeLon = normalizeNullableNumber(normalized.weatherHomeLon, null);
      normalized.calendarAstronomyLevel = normalizeAstronomyLevel(normalized.calendarAstronomyLevel, normalized.calendarShowAstronomyEvents);
      normalized.shortcutIconScale = normalizeShortcutIconScale(normalized.shortcutIconScale);
      normalized.grade = Math.max(0, Math.min(2, parseInt(normalized.grade, 10) || 0));
      normalized.timetableMode = Math.max(0, Math.min(1, parseInt(normalized.timetableMode, 10) || 0));
      normalized.widgetVisibility = normalizeWidgetVisibility(normalized.widgetVisibility);

      if (normalized.weatherLat === null) normalized.weatherLat = normalized.weatherSchoolLat;
      if (normalized.weatherLon === null) normalized.weatherLon = normalized.weatherSchoolLon;

      BOOLEAN_KEYS.forEach((key) => {
        normalized[key] = normalizeBoolean(normalized[key], DEFAULTS[key]);
      });

      return normalized;
    },

    _normalizeProfiles(storedProfiles, legacyConfig) {
      const profiles = Array.isArray(storedProfiles) ? storedProfiles : [];
      if (!profiles.length) {
        return [this._createProfileObject('기본 프로필', pick(legacyConfig, PROFILE_KEYS))];
      }

      return profiles.map((profile, index) => {
        const name = normalizeText(profile?.name, `프로필 ${index + 1}`);
        const id = normalizeText(profile?.id, createProfileId());
        return {
          id,
          name,
          updatedAt: normalizeText(profile?.updatedAt, nowIso()),
          data: this._normalizeProfileData(profile?.data || profile || {})
        };
      });
    },

    _normalizeProfileData(data) {
      return pick(this._normalizeConfig({ ...this._getDefaultProfileData(), ...(data || {}) }), PROFILE_KEYS);
    },

    _getDefaultProfileData() {
      return pick(DEFAULTS, PROFILE_KEYS);
    },

    _createProfileObject(name, seedData) {
      return {
        id: createProfileId(),
        name: normalizeText(name, this._buildProfileName()),
        updatedAt: nowIso(),
        data: this._normalizeProfileData(seedData)
      };
    },

    _buildProfileName() {
      return `프로필 ${this._profiles.length + 1}`;
    },

    _resolveActiveProfileId(candidate) {
      const preferred = String(candidate || '').trim();
      if (preferred && this._profiles.some((profile) => profile.id === preferred)) {
        return preferred;
      }
      return this._profiles[0]?.id || '';
    },

    _getActiveProfileInternal() {
      return this._profiles.find((profile) => profile.id === this._activeProfileId) || null;
    },

    _getCurrentProfileData() {
      return pick(this._config, PROFILE_KEYS);
    },

    _rebuildResolvedConfig() {
      const activeProfile = this._getActiveProfileInternal();
      const profileData = activeProfile ? activeProfile.data : this._getDefaultProfileData();
      this._config = this._normalizeConfig({
        ...DEFAULTS,
        ...this._globalConfig,
        ...profileData
      });
    },

    _syncResolvedToSources() {
      this._globalConfig = pick(this._config, GLOBAL_KEYS);
      const activeProfile = this._getActiveProfileInternal();
      if (activeProfile) {
        activeProfile.data = pick(this._config, PROFILE_KEYS);
        activeProfile.updatedAt = nowIso();
      }
    },

    _prepareValue(key, value) {
      if (key === 'classNum') return this.normalizeClassNum(value);
      if (BOOLEAN_KEYS.includes(key)) return normalizeBoolean(value, DEFAULTS[key]);
      if (key === 'calendarAstronomyLevel') return normalizeAstronomyLevel(value);
      if (key === 'shortcutIconScale') return normalizeShortcutIconScale(value);

      if (['customPrimaryColor', 'customPrimaryLightColor', 'customAccentColor', 'customBackgroundColor'].includes(key)) {
        return normalizeHexColor(value, '');
      }

      if (key === 'backgroundOpacity') {
        return Math.max(0, Math.min(100, parseInt(value, 10) || DEFAULTS.backgroundOpacity));
      }

      if (key === 'weatherActivePreset') {
        return normalizeWeatherPreset(value);
      }

      if (key === 'weatherProviderMode') {
        return normalizeWeatherProviderMode(value);
      }

      if (key === 'weatherHomeLabel') {
        return normalizeText(value, '집');
      }

      if (key === 'grade') {
        return Math.max(0, Math.min(2, parseInt(value, 10) || 0));
      }

      if (key === 'timetableMode') {
        return Math.max(0, Math.min(1, parseInt(value, 10) || 0));
      }

      if (key === 'widgetVisibility') {
        return normalizeWidgetVisibility(value);
      }

      if (['weatherLat', 'weatherLon', 'weatherSchoolLat', 'weatherSchoolLon', 'weatherHomeLat', 'weatherHomeLon'].includes(key)) {
        return normalizeNullableNumber(value, null);
      }

      return value;
    },

    _syncWeatherAliases(prepared = {}) {
      if (hasOwn(prepared, 'weatherSchoolLat') && !hasOwn(prepared, 'weatherLat')) {
        this._config.weatherLat = this._config.weatherSchoolLat;
      }
      if (hasOwn(prepared, 'weatherSchoolLon') && !hasOwn(prepared, 'weatherLon')) {
        this._config.weatherLon = this._config.weatherSchoolLon;
      }
      if (hasOwn(prepared, 'weatherLat') && !hasOwn(prepared, 'weatherSchoolLat')) {
        this._config.weatherSchoolLat = this._config.weatherLat;
      }
      if (hasOwn(prepared, 'weatherLon') && !hasOwn(prepared, 'weatherSchoolLon')) {
        this._config.weatherSchoolLon = this._config.weatherLon;
      }
    },

    _syncWeatherAPI() {
      LS.WeatherAPI.setMode(this.getWeatherProviderMode());
      LS.WeatherAPI.setApiKey(this.getWeatherApiKeyForUse());
      const location = this.getWeatherLocation();
      if (location) {
        LS.WeatherAPI.setLocation(location.lat, location.lon);
      } else {
        LS.WeatherAPI.setLocation(null, null);
      }
    },

    _save() {
      LS.Storage.set(CONFIG_STORAGE_KEY, pick(this._globalConfig, GLOBAL_KEYS));
      LS.Storage.set(PROFILE_STORAGE_KEY, this._profiles);
      LS.Storage.set(ACTIVE_PROFILE_STORAGE_KEY, this._activeProfileId);
    },

    _emitChange(key, value, oldValue) {
      this._listeners.forEach((fn) => fn(key, value, oldValue));
    }
  };
})();
