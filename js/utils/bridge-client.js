(function () {
  'use strict';
  const LS = window.LivelySam = window.LivelySam || {};

  /*
   * 로컬 브리지(LocalStorageBridge) 공용 클라이언트.
   * 토큰 캐시·헤더 구성·health 기반 토큰 복구·403 재시도를 한 곳에서 관리한다.
   * storage.js / google-workspace.js / data-service.js / shortcuts.js 가 공유한다.
   */

  const TOKEN_HEADER = 'X-LivelySam-Token';
  const DEFAULT_TIMEOUT_MS = 6000;
  const HEALTH_TIMEOUT_MS = 2500;

  function getQueryParam(key) {
    const helper = LS.Helpers?.getRuntimeQueryParam;
    if (typeof helper === 'function') {
      return helper(key, '');
    }
    try {
      return new URLSearchParams(window.location.search || '').get(key) || '';
    } catch {
      return '';
    }
  }

  function resolvePort() {
    const candidate = String(getQueryParam('bridgePort') || '').trim();
    return /^\d{2,5}$/.test(candidate) ? candidate : '58671';
  }

  const ORIGIN = `http://127.0.0.1:${resolvePort()}`;
  const HEALTH_URL = `${ORIGIN}/__livelysam__/health`;

  let tokenCache = String(getQueryParam('livelySamToken') || '').trim();
  let hydratePromise = null;

  function getToken() {
    return tokenCache;
  }

  function setToken(token) {
    const normalized = String(token || '').trim();
    tokenCache = normalized;

    const helper = LS.Helpers?.setRuntimeQueryParam;
    if (typeof helper === 'function') {
      helper('livelySamToken', normalized);
    }

    return tokenCache;
  }

  function buildHeaders(headers = {}) {
    if (!tokenCache) return { ...(headers || {}) };
    return {
      ...(headers || {}),
      [TOKEN_HEADER]: tokenCache
    };
  }

  function isBridgeUrl(url) {
    return typeof url === 'string' && url.startsWith(ORIGIN);
  }

  async function rawFetchJson(url, options = {}) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeout = Number(options.timeout) > 0 ? Number(options.timeout) : DEFAULT_TIMEOUT_MS;
    const timeoutId = controller
      ? window.setTimeout(() => controller.abort(), timeout)
      : null;

    try {
      const response = await fetch(url, {
        method: options.method || 'GET',
        headers: buildHeaders(options.headers || {}),
        body: options.body,
        cache: 'no-store',
        mode: 'cors',
        signal: controller?.signal
      });

      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }

      return await response.json();
    } catch (error) {
      if (error?.name === 'AbortError') {
        const timeoutError = new Error(`요청 시간이 초과되었습니다. (${timeout}ms)`);
        timeoutError.name = 'TimeoutError';
        throw timeoutError;
      }
      throw error;
    } finally {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    }
  }

  /* 브리지 재시작으로 토큰이 회전됐을 때 health에서 새 토큰을 받아온다. */
  async function hydrateTokenFromHealth(options = {}) {
    if (!options.force && tokenCache) {
      return tokenCache;
    }

    if (!hydratePromise) {
      hydratePromise = (async () => {
        try {
          const payload = await rawFetchJson(HEALTH_URL, {
            timeout: options.timeout || HEALTH_TIMEOUT_MS,
            headers: {}
          });
          if (payload?.auth_token) {
            setToken(payload.auth_token);
          }
        } catch {
          // 현재 토큰 유지. 원래 실패는 호출자가 처리한다.
        } finally {
          hydratePromise = null;
        }
        return tokenCache;
      })();
    }

    return hydratePromise;
  }

  /* 토큰 헤더 + 타임아웃 + (브리지 요청 한정) 403 시 토큰 복구 후 1회 재시도. */
  async function fetchJson(url, options = {}) {
    try {
      return await rawFetchJson(url, options);
    } catch (error) {
      const shouldRecover = isBridgeUrl(url)
        && !options._bridgeRetried
        && Number(error?.status || 0) === 403;

      if (shouldRecover) {
        await hydrateTokenFromHealth({ force: true });
        if (tokenCache) {
          return rawFetchJson(url, { ...options, _bridgeRetried: true });
        }
      }

      throw error;
    }
  }

  /* health 응답 전체를 반환. 실패 시 null. 토큰이 있으면 캐시에 반영. */
  async function fetchHealth(options = {}) {
    try {
      const payload = await rawFetchJson(HEALTH_URL, {
        timeout: options.timeout || HEALTH_TIMEOUT_MS,
        headers: {}
      });
      if (payload?.auth_token) {
        setToken(payload.auth_token);
      }
      return payload;
    } catch {
      return null;
    }
  }

  LS.BridgeClient = {
    ORIGIN,
    HEALTH_URL,
    TOKEN_HEADER,
    getQueryParam,
    getToken,
    setToken,
    buildHeaders,
    isBridgeUrl,
    hydrateTokenFromHealth,
    fetchJson,
    fetchHealth
  };
})();
