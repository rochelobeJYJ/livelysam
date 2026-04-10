(function () {
  'use strict';
  const LS = window.LivelySam = window.LivelySam || {};

  const INTEGER_KEYS = new Set([
    'theme',
    'widgetOpacity',
    'fontSize',
    'clockFormat',
    'timetableMode',
    'grade',
    'morningMinutes',
    'classMinutes',
    'breakMinutes',
    'lunchMinutes',
    'lunchAfterPeriod',
    'totalPeriods',
    'afterSchoolMinutes'
  ]);

  const BOOLEAN_KEYS = new Set([
    'showAnalogClock',
    'showSeconds',
    'afterSchoolEnabled'
  ]);

  function readPropertyValue(property) {
    if (property && typeof property === 'object' && Object.prototype.hasOwnProperty.call(property, 'value')) {
      return property.value;
    }
    return property;
  }

  LS.WallpaperEngine = {
    isWallpaperEngine: false,
    ready: false,
    pendingUserProperties: {},
    generalProperties: {},

    init() {
      const hasWallpaperEngineApis =
        typeof window.wallpaperRegisterAudioListener === 'function' ||
        typeof window.wallpaperRequestRandomFileForProperty === 'function' ||
        /wallpaperengine/i.test(navigator.userAgent);

      if (hasWallpaperEngineApis) {
        this._activate();
      }
    },

    markReady() {
      this.ready = true;
      this.flushPendingProperties();
    },

    queueUserProperties(properties) {
      const normalized = this._normalizeUserProperties(properties);
      if (!Object.keys(normalized).length) return;

      Object.assign(this.pendingUserProperties, normalized);
      if (this.ready) {
        this.flushPendingProperties();
      }
    },

    flushPendingProperties() {
      if (!this.ready || !LS.Config) return;

      const pending = { ...this.pendingUserProperties };
      if (!Object.keys(pending).length) return;

      this.pendingUserProperties = {};
      LS.Config.setMultiple(pending);
      if (pending.theme !== undefined || pending.widgetOpacity !== undefined || pending.fontSize !== undefined) {
        LS.Config.applyTheme();
      }
    },

    _activate() {
      if (this.isWallpaperEngine) return;

      this.isWallpaperEngine = true;
      document.body.classList.add('wallpaper-engine-mode');
      document.body.classList.remove('browser-mode');
      window.dispatchEvent(new CustomEvent('livelysam:runtimeChanged', {
        detail: { isWallpaperEngine: true }
      }));
    },

    _normalizeUserProperties(properties) {
      const normalized = {};
      if (!properties || typeof properties !== 'object') return normalized;

      Object.entries(properties).forEach(([key, property]) => {
        const rawValue = readPropertyValue(property);
        if (rawValue === undefined || rawValue === null) return;

        if (BOOLEAN_KEYS.has(key)) {
          normalized[key] = rawValue === true || rawValue === 'true' || rawValue === 1 || rawValue === '1';
          return;
        }

        if (INTEGER_KEYS.has(key)) {
          const value = parseInt(rawValue, 10);
          if (!Number.isNaN(value)) {
            normalized[key] = value;
          }
          return;
        }

        normalized[key] = String(rawValue);
      });

      return normalized;
    }
  };

  window.wallpaperPropertyListener = Object.assign(window.wallpaperPropertyListener || {}, {
    applyUserProperties(properties) {
      LS.WallpaperEngine._activate();
      LS.WallpaperEngine.queueUserProperties(properties);
    },

    applyGeneralProperties(properties) {
      LS.WallpaperEngine._activate();
      LS.WallpaperEngine.generalProperties = properties || {};
    }
  });
})();
