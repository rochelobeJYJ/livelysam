(function () {
  'use strict';
  const LS = window.LivelySam = window.LivelySam || {};

  /* ── 기본 설정 ── */
  const DEFAULTS = {
    schoolName: '',
    neisApiKey: '',
    weatherApiKey: '',
    atptCode: '',
    schoolCode: '',
    schoolAddress: '',
    weatherLat: null,
    weatherLon: null,
    theme: 1,            // 오션 브리즈
    widgetOpacity: 75,
    fontSize: 14,
    clockFormat: 1,      // 24시간
    showAnalogClock: true,
    showSeconds: true,
    grade: 0,            // 1학년
    classNum: '1',
    startTime: '08:20',
    morningMinutes: 10,
    classMinutes: 50,
    breakMinutes: 10,
    lunchMinutes: 60,
    lunchAfterPeriod: 1, // 4교시 후
    totalPeriods: 1,     // 7교시
    afterSchoolEnabled: false,
    afterSchoolMinutes: 70,
    afterSchoolDays: '1,3,5',
    gridLayout: null,
    customPeriods: null   // 사용자가 수동 수정한 교시 시간
  };

  LS.Config = {
    _config: {},
    _listeners: [],

    /* ── 초기화 ── */
    init() {
      // localStorage에서 불러오기
      const saved = LS.Storage.get('config', {});
      this._config = { ...DEFAULTS, ...saved };

      // API 키 설정
      if (this._config.neisApiKey) {
        LS.NeisAPI.setApiKey(this._config.neisApiKey);
      }
      if (this._config.weatherApiKey) {
        LS.WeatherAPI.setApiKey(this._config.weatherApiKey);
      }
      if (this._config.weatherLat && this._config.weatherLon) {
        LS.WeatherAPI.setLocation(this._config.weatherLat, this._config.weatherLon);
      }
    },

    /* ── 값 읽기 ── */
    get(key) {
      return this._config[key] !== undefined ? this._config[key] : DEFAULTS[key];
    },

    /* ── 전체 설정 ── */
    getAll() {
      return { ...this._config };
    },

    /* ── 값 설정 ── */
    set(key, value) {
      const old = this._config[key];
      this._config[key] = value;
      this._save();

      // 특별 처리
      if (key === 'neisApiKey') LS.NeisAPI.setApiKey(value);
      if (key === 'weatherApiKey') LS.WeatherAPI.setApiKey(value);
      if (key === 'weatherLat' || key === 'weatherLon') {
        LS.WeatherAPI.setLocation(this._config.weatherLat, this._config.weatherLon);
      }

      // 리스너 호출
      this._listeners.forEach(fn => fn(key, value, old));
    },

    /* ── 여러 값 한꺼번에 설정 ── */
    setMultiple(obj) {
      Object.entries(obj).forEach(([k, v]) => {
        this._config[k] = v;
      });
      this._save();

      // API 키 반영
      if (obj.neisApiKey) LS.NeisAPI.setApiKey(obj.neisApiKey);
      if (obj.weatherApiKey) LS.WeatherAPI.setApiKey(obj.weatherApiKey);
      if (obj.weatherLat || obj.weatherLon) {
        LS.WeatherAPI.setLocation(this._config.weatherLat, this._config.weatherLon);
      }

      this._listeners.forEach(fn => fn('_bulk', obj, null));
    },

    /* ── 변경 감지 리스너 ── */
    onChange(fn) {
      this._listeners.push(fn);
    },

    /* ── 교시 계산 (커스텀 교시 우선) ── */
    getPeriods() {
      const custom = this._config.customPeriods;
      if (custom && custom.length > 0) return custom;
      return LS.Helpers.calculatePeriods(this._config);
    },

    /* ── 교시 시간 수동 수정 저장 ── */
    setCustomPeriods(periods) {
      this._config.customPeriods = periods;
      this._save();
    },

    /* ── 자동 계산으로 리셋 ── */
    resetPeriodsToAuto() {
      this._config.customPeriods = null;
      this._save();
      return LS.Helpers.calculatePeriods(this._config);
    },

    /* ── 테마 정보 ── */
    getTheme() {
      const themes = [
        { name: '벚꽃 파스텔', primary: '#FF8FA3', primaryLight: '#FFB5C2', accent: '#FF6B8A', bg: 'rgba(255, 181, 194, 0.05)' },
        { name: '오션 브리즈', primary: '#4DABF7', primaryLight: '#74C0FC', accent: '#228BE6', bg: 'rgba(116, 192, 252, 0.05)' },
        { name: '민트 가든', primary: '#63E6BE', primaryLight: '#96F2D7', accent: '#20C997', bg: 'rgba(150, 242, 215, 0.05)' },
        { name: '피치 코랄', primary: '#FFA07A', primaryLight: '#FFC9B9', accent: '#FF7F50', bg: 'rgba(255, 201, 185, 0.05)' },
        { name: '라벤더 드림', primary: '#B197FC', primaryLight: '#D0BFFF', accent: '#7950F2', bg: 'rgba(208, 191, 255, 0.05)' },
        { name: '선샤인', primary: '#FFD43B', primaryLight: '#FFE066', accent: '#FCC419', bg: 'rgba(255, 224, 102, 0.05)' },
        { name: '아이스 그레이', primary: '#CED4DA', primaryLight: '#DEE2E6', accent: '#ADB5BD', bg: 'rgba(222, 226, 230, 0.05)' },
        { name: '선셋', primary: '#FF6B6B', primaryLight: '#FFA07A', accent: '#FFD93D', bg: 'rgba(255, 107, 107, 0.05)' }
      ];
      return themes[this._config.theme] || themes[1];
    },

    /* ── 테마 CSS 변수 적용 ── */
    applyTheme() {
      const theme = this.getTheme();
      const opacity = this._config.widgetOpacity / 100;
      const root = document.documentElement;

      root.style.setProperty('--theme-primary', theme.primary);
      root.style.setProperty('--theme-primary-light', theme.primaryLight);
      root.style.setProperty('--theme-accent', theme.accent);
      root.style.setProperty('--theme-bg-tint', theme.bg);
      root.style.setProperty('--widget-opacity', opacity);
      root.style.setProperty('--font-size-base', this._config.fontSize + 'px');
    },

    /* ── 저장 ── */
    _save() {
      LS.Storage.set('config', this._config);
    }
  };
})();
