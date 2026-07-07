(function () {
  'use strict';

  const LS = window.LivelySam = window.LivelySam || {};
  const LOCAL_RUNTIME_VALUES = new Set(['desktophost', 'browserpreview']);
  const DEFAULT_FETCH_TIMEOUT_MS = 8000;

  const BridgeClient = LS.BridgeClient;
  const LOCAL_PROXY_ORIGIN = BridgeClient.ORIGIN;

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

  function resolveTimeout(value, fallback = DEFAULT_FETCH_TIMEOUT_MS) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
  }

  function buildTimeoutError(timeoutMs) {
    const error = new Error(`요청 시간이 초과되었습니다. (${timeoutMs}ms)`);
    error.name = 'TimeoutError';
    return error;
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
      const normalizedUrl = url.toString();
      const timeoutMs = resolveTimeout(options.timeoutMs, DEFAULT_FETCH_TIMEOUT_MS);
      const requestOptions = { ...options };
      delete requestOptions.timeoutMs;
      const isLocalProxyRequest = normalizedUrl.startsWith(`${LOCAL_PROXY_ORIGIN}/`);
      const requestHeaders = isLocalProxyRequest
        ? BridgeClient.buildHeaders({
            Accept: 'application/json',
            ...(requestOptions.headers || {})
          })
        : {
            Accept: 'application/json',
            ...(requestOptions.headers || {})
          };
      delete requestOptions.headers;
      delete requestOptions._bridgeRetried;

      const hasExternalSignal = Boolean(requestOptions.signal);
      const controller = typeof AbortController !== 'undefined' && !hasExternalSignal
        ? new AbortController()
        : null;
      if (controller) {
        requestOptions.signal = controller.signal;
      }

      let timeoutId = 0;
      let response = null;

      try {
        response = await Promise.race([
          fetch(normalizedUrl, {
            method: requestOptions.method || 'GET',
            headers: requestHeaders,
            cache: 'no-store',
            ...requestOptions
          }),
          new Promise((_, reject) => {
            timeoutId = window.setTimeout(() => {
              try {
                controller?.abort();
              } catch {
                // noop
              }
              reject(buildTimeoutError(timeoutMs));
            }, timeoutMs);
          })
        ]);
      } catch (error) {
        if (error?.name === 'AbortError') {
          throw buildTimeoutError(timeoutMs);
        }
        throw error;
      } finally {
        if (timeoutId) {
          window.clearTimeout(timeoutId);
        }
      }

      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok) {
        if (isLocalProxyRequest && response.status === 403 && !options._bridgeRetried) {
          // 브리지 재시작으로 토큰이 회전된 경우: 새 토큰을 받아 1회 재시도.
          await BridgeClient.hydrateTokenFromHealth({ force: true });
          if (BridgeClient.getToken()) {
            return LS.DataService.fetchJson(path, params, { ...options, _bridgeRetried: true });
          }
        }

        const message = text(payload?.error, `HTTP ${response.status}`);
        const error = new Error(message);
        error.status = response.status;
        error.code = text(payload?.code);
        error.detail = text(payload?.detail);
        error.payload = payload;
        error.url = normalizedUrl;
        throw error;
      }

      return payload;
    }
  };
})();
