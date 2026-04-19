(function () {
  'use strict';

  const LS = window.LivelySam = window.LivelySam || {};
  const LOCAL_PROXY_ORIGIN = 'http://127.0.0.1:58671';
  const LOCAL_RUNTIME_VALUES = new Set(['desktophost', 'browserpreview']);

  function text(value, fallback = '') {
    if (value === null || value === undefined) return fallback;
    const normalized = String(value).trim();
    return normalized || fallback;
  }

  function stripTrailingSlash(value) {
    return text(value).replace(/\/+$/, '');
  }

  function normalizeApiBaseUrl(value) {
    const base = stripTrailingSlash(value);
    if (!base) return '';
    return /\/api$/i.test(base) ? base : `${base}/api`;
  }

  function getExplicitBaseUrl() {
    const publicConfigBase = text(window.LivelySamPublicConfig?.dataServices?.proxyBaseUrl);
    return normalizeApiBaseUrl(window.LIVELYSAM_PROXY_BASE_URL || publicConfigBase || '');
  }

  function getRuntimeValue() {
    try {
      const params = new URLSearchParams(window.location.search || '');
      return text(params.get('runtime')).toLowerCase();
    } catch {
      return '';
    }
  }

  function isLocalPreviewHost() {
    const hostname = String(window.location.hostname || '').trim().toLowerCase();
    const port = String(window.location.port || '').trim();
    const runtime = getRuntimeValue();
    if (window.location.protocol === 'file:') return true;
    if (LOCAL_RUNTIME_VALUES.has(runtime)) return true;
    if (hostname === '127.0.0.1' || hostname === 'localhost') {
      return true;
    }
    return false;
  }

  function getConfiguredBaseUrl() {
    const explicit = getExplicitBaseUrl();
    if (explicit) return explicit;
    if (isLocalPreviewHost()) return `${LOCAL_PROXY_ORIGIN}/api`;
    if (/^https?:$/i.test(window.location.protocol || '')) {
      return `${stripTrailingSlash(window.location.origin)}/api`;
    }
    return `${LOCAL_PROXY_ORIGIN}/api`;
  }

  LS.DataService = {
    getBaseUrl() {
      return getConfiguredBaseUrl();
    },

    buildUrl(path, params = {}) {
      const normalizedBase = `${stripTrailingSlash(this.getBaseUrl())}/`;
      const normalizedPath = String(path || '').replace(/^\/+/, '');
      const url = new URL(normalizedPath, normalizedBase);

      Object.entries(params || {}).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;
        url.searchParams.set(key, String(value));
      });

      return url;
    },

    async fetchJson(path, params = {}, options = {}) {
      const url = this.buildUrl(path, params);
      const response = await fetch(url.toString(), {
        method: options.method || 'GET',
        headers: {
          Accept: 'application/json',
          ...(options.headers || {})
        },
        cache: 'no-store',
        ...options
      });

      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok) {
        const message = text(payload?.error, `HTTP ${response.status}`);
        throw new Error(message);
      }

      return payload;
    }
  };
})();
