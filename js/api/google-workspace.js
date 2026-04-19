(function () {
  'use strict';

  const LS = window.LivelySam = window.LivelySam || {};

  const AUTH_STORAGE_KEY = 'googleWorkspaceAuth';
  const CACHE_STORAGE_KEY = 'googleWorkspaceCache';
  const DELETE_QUEUE_KEY = 'googleWorkspaceDeleteQueue';
  const GOOGLE_GSI_SRC = 'https://accounts.google.com/gsi/client';
  const BRIDGE_ORIGIN = 'http://127.0.0.1:58671';
  const BRIDGE_HEALTH_URL = `${BRIDGE_ORIGIN}/__livelysam__/health`;
  const NATIVE_STATUS_URL = `${BRIDGE_ORIGIN}/__livelysam__/google-auth/status`;
  const NATIVE_LOGIN_URL = `${BRIDGE_ORIGIN}/__livelysam__/google-auth/login`;
  const NATIVE_TOKEN_URL = `${BRIDGE_ORIGIN}/__livelysam__/google-auth/token`;
  const NATIVE_LOGOUT_URL = `${BRIDGE_ORIGIN}/__livelysam__/google-auth/logout`;
  const NATIVE_GOOGLE_API_URL = `${BRIDGE_ORIGIN}/__livelysam__/google-api`;
  const NATIVE_SHELL_OPEN_URL = `${BRIDGE_ORIGIN}/__livelysam__/shell/open`;
  const GOOGLE_SCOPES = {
    profile: ['openid', 'email', 'profile'],
    calendar: 'https://www.googleapis.com/auth/calendar',
    tasks: 'https://www.googleapis.com/auth/tasks'
  };
  const GOOGLE_SCOPE_ALIASES = {
    email: 'https://www.googleapis.com/auth/userinfo.email',
    profile: 'https://www.googleapis.com/auth/userinfo.profile'
  };
  const CACHE_PAST_DAYS = 60;
  const CACHE_FUTURE_DAYS = 365;
  const RECOMMENDED_ORIGIN = 'http://localhost:58672';

  let gisPromise = null;
  let authState = null;
  let cacheState = createEmptyCache();
  let nativeBridgeStatus = createEmptyNativeBridgeStatus();

  function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function text(value, fallback = '') {
    if (value === null || value === undefined) return fallback;
    const normalized = String(value).trim();
    return normalized || fallback;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function toDirectoryPath(pathValue = '') {
    const normalized = text(pathValue);
    if (!normalized) return '';
    const index = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
    return index >= 0 ? normalized.slice(0, index) : '';
  }

  function createEmptyCache() {
    return {
      updatedAt: '',
      origin: '',
      rangeStart: '',
      rangeEnd: '',
      lastError: '',
      account: null,
      calendars: [],
      tasklists: [],
      events: [],
      tasks: [],
      selectedCalendarId: '',
      selectedTasklistId: ''
    };
  }

  function normalizeAuth(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const accessToken = text(raw.accessToken);
    const expiresAt = Number(raw.expiresAt || 0);
    if (!accessToken || !Number.isFinite(expiresAt) || expiresAt <= 0) {
      return null;
    }

    return {
      accessToken,
      tokenType: text(raw.tokenType, 'Bearer'),
      expiresAt,
      scope: text(raw.scope),
      accountEmail: text(raw.accountEmail),
      accountName: text(raw.accountName),
      authMode: text(raw.authMode, 'browser-popup')
    };
  }

  function createEmptyNativeBridgeStatus() {
    return {
      available: false,
      configured: false,
      mode: 'browser-popup',
      inProgress: false,
      connected: false,
      hasRefreshToken: false,
      scope: '',
      expiresAt: 0,
      accountEmail: '',
      accountName: '',
      message: '',
      lastError: '',
      configSource: '',
      auth: null
    };
  }

  function normalizeNativeBridgeStatus(raw) {
    if (!raw || typeof raw !== 'object') {
      return createEmptyNativeBridgeStatus();
    }

    return {
      available: true,
      configured: Boolean(raw.configured),
      mode: text(raw.mode, 'native-bridge'),
      inProgress: Boolean(raw.inProgress),
      connected: Boolean(raw.connected),
      hasRefreshToken: Boolean(raw.hasRefreshToken),
      scope: text(raw.scope),
      expiresAt: Number(raw.expiresAt || 0),
      accountEmail: text(raw.accountEmail),
      accountName: text(raw.accountName),
      message: text(raw.message),
      lastError: text(raw.lastError),
      configSource: text(raw.configSource),
      auth: raw.auth && typeof raw.auth === 'object' ? clone(raw.auth) : null
    };
  }

  function normalizeCache(raw) {
    const fallback = createEmptyCache();
    if (!raw || typeof raw !== 'object') return fallback;

    return {
      updatedAt: text(raw.updatedAt),
      origin: text(raw.origin),
      rangeStart: text(raw.rangeStart),
      rangeEnd: text(raw.rangeEnd),
      lastError: text(raw.lastError),
      account: raw.account && typeof raw.account === 'object'
        ? {
            email: text(raw.account.email),
            name: text(raw.account.name),
            picture: text(raw.account.picture)
          }
        : null,
      calendars: Array.isArray(raw.calendars) ? clone(raw.calendars) : [],
      tasklists: Array.isArray(raw.tasklists) ? clone(raw.tasklists) : [],
      events: Array.isArray(raw.events) ? clone(raw.events) : [],
      tasks: Array.isArray(raw.tasks) ? clone(raw.tasks) : [],
      selectedCalendarId: text(raw.selectedCalendarId),
      selectedTasklistId: text(raw.selectedTasklistId)
    };
  }

  function persistAuthState() {
    if (authState) {
      LS.Storage.set(AUTH_STORAGE_KEY, authState);
    } else {
      LS.Storage.remove(AUTH_STORAGE_KEY);
    }
  }

  function persistCacheState() {
    LS.Storage.set(CACHE_STORAGE_KEY, cacheState);
  }

  function writeSyncDebug(stage, details = {}) {
    const snapshot = {
      stage: text(stage, 'unknown'),
      updatedAt: nowIso(),
      origin: getCurrentOrigin(),
      nativeBridgeConfigured: hasNativeBridgeConfigured(),
      nativeBridgeConnected: Boolean(nativeBridgeStatus.connected),
      ...clone(details)
    };
    try {
      LS.Storage.set('googleWorkspaceDebug', snapshot);
    } catch {
      // ignore storage diagnostics failures
    }
    return snapshot;
  }

  function loadPersistedState() {
    authState = normalizeAuth(LS.Storage.get(AUTH_STORAGE_KEY, null));
    cacheState = normalizeCache(LS.Storage.get(CACHE_STORAGE_KEY, createEmptyCache()));
  }

  function clearAuthState() {
    authState = null;
    persistAuthState();
  }

  function hasNativeBridgeConfigured() {
    return Boolean(nativeBridgeStatus.available && nativeBridgeStatus.configured);
  }

  function getGrantedScopeText() {
    if (hasNativeBridgeConfigured()) {
      return text(nativeBridgeStatus.scope);
    }
    return text(authState?.scope);
  }

  function updateNativeBridgeStatus(rawStatus, options = {}) {
    nativeBridgeStatus = normalizeNativeBridgeStatus(rawStatus);

    if (options.clearLocalAuthWhenDisconnected && hasNativeBridgeConfigured() && !nativeBridgeStatus.connected && !nativeBridgeStatus.inProgress) {
      clearAuthState();
    }

    if (options.emit !== false) {
      emitStatus();
    }

    return nativeBridgeStatus;
  }

  async function fetchJson(url, options = {}) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeout = Number(options.timeout || 6000);
    let timeoutId = null;

    try {
      const response = await Promise.race([
        fetch(url, {
          method: options.method || 'GET',
          headers: options.headers || {},
          body: options.body,
          cache: 'no-store',
          signal: controller?.signal
        }),
        new Promise((_, reject) => {
          timeoutId = window.setTimeout(() => {
            try {
              controller?.abort();
            } catch {
              // noop
            }
            const error = new Error(`요청 시간이 초과되었습니다. (${timeout}ms)`);
            error.name = 'TimeoutError';
            reject(error);
          }, timeout);
        })
      ]);

      const rawText = await response.text();
      let payload = null;
      if (rawText) {
        try {
          payload = JSON.parse(rawText);
        } catch {
          payload = rawText;
        }
      }

      if (!response.ok) {
        const errorMessage = typeof payload === 'object'
          ? text(payload?.error, `HTTP ${response.status}`)
          : text(payload, `HTTP ${response.status}`);
        const error = new Error(errorMessage);
        error.status = response.status;
        error.payload = payload;
        throw error;
      }

      return payload;
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

  function emitProgress(snapshot) {
    window.dispatchEvent(new CustomEvent('livelysam:googleSyncProgress', {
      detail: snapshot ? clone(snapshot) : null
    }));
  }

  function annotateSyncStage(stage, details = {}) {
    const snapshot = writeSyncDebug(stage, details);
    emitProgress(snapshot);
    return snapshot;
  }

  async function refreshNativeBridgeStatus(options = {}) {
    try {
      const payload = await fetchJson(NATIVE_STATUS_URL, {
        timeout: options.timeout || 3200
      });
      return updateNativeBridgeStatus(payload?.status, {
        emit: options.emit,
        clearLocalAuthWhenDisconnected: options.clearLocalAuthWhenDisconnected
      });
    } catch {
      nativeBridgeStatus = createEmptyNativeBridgeStatus();
      if (options.emit !== false) {
        emitStatus();
      }
      return nativeBridgeStatus;
    }
  }

  async function probeBridgeHealth() {
    try {
      return await fetchJson(BRIDGE_HEALTH_URL, {
        timeout: 2600
      });
    } catch {
      return null;
    }
  }

  function getRuntimeMode() {
    try {
      return new URLSearchParams(window.location.search || '').get('runtime') || '';
    } catch {
      return '';
    }
  }

  function isHttpOrigin() {
    const protocol = text(window.location.protocol).toLowerCase();
    return protocol === 'http:' || protocol === 'https:';
  }

  function isInteractiveRuntime() {
    const runtimeMode = getRuntimeMode();
    if (!isHttpOrigin()) return false;
    if (runtimeMode === 'desktophost') return false;
    if (window.LivelySam?.Lively?.isLively) return false;
    if (window.LivelySam?.WallpaperEngine?.isWallpaperEngine) return false;
    return true;
  }

  function getConfigValue(key, fallback = '') {
    if (typeof LS.Config?.get === 'function') {
      const value = LS.Config.get(key);
      return value === undefined ? fallback : value;
    }
    return fallback;
  }

  function isValidationMode() {
    try {
      const params = new URLSearchParams(window.location?.search || '');
      return params.get('validate') === '1';
    } catch {
      return false;
    }
  }

  function isCalendarSyncEnabled() {
    return !isValidationMode() && Boolean(getConfigValue('googleCalendarSyncEnabled', true));
  }

  function isTaskSyncEnabled() {
    return !isValidationMode() && Boolean(getConfigValue('googleTasksSyncEnabled', true));
  }

  function getEnabledScopes() {
    const scopes = [...GOOGLE_SCOPES.profile];
    if (isCalendarSyncEnabled()) {
      scopes.push(GOOGLE_SCOPES.calendar);
    }
    if (isTaskSyncEnabled()) {
      scopes.push(GOOGLE_SCOPES.tasks);
    }
    return scopes;
  }

  function normalizeGrantedScope(scope) {
    const normalized = text(scope);
    return GOOGLE_SCOPE_ALIASES[normalized] || normalized;
  }

  function hasGrantedScopes() {
    const granted = new Set(
      getGrantedScopeText()
        .split(/\s+/g)
        .map((item) => normalizeGrantedScope(item.trim()))
        .filter(Boolean)
    );
    return getEnabledScopes().every((scope) => granted.has(normalizeGrantedScope(scope)));
  }

  function hasValidAccessToken() {
    return Boolean(authState?.accessToken) && Number(authState.expiresAt || 0) > Date.now() + 30 * 1000;
  }

  function hasUsableAccessToken() {
    return hasValidAccessToken() && hasGrantedScopes();
  }

  function getCurrentOrigin() {
    return text(window.location.origin);
  }

  function buildStatus() {
    const validationMode = isValidationMode();
    const calendarEnabled = isCalendarSyncEnabled();
    const tasksEnabled = isTaskSyncEnabled();
    const hasClientId = Boolean(text(getConfigValue('googleClientId')));
    const nativeConfigured = hasNativeBridgeConfigured();
    const expiresAt = nativeConfigured
      ? Number(nativeBridgeStatus.expiresAt || 0)
      : Number(authState?.expiresAt || 0);
    const connected = nativeConfigured
      ? Boolean(nativeBridgeStatus.connected)
      : hasUsableAccessToken();
    const cacheAccount = cacheState.account || null;
    const accountEmail = nativeConfigured
      ? (nativeBridgeStatus.accountEmail || cacheAccount?.email || authState?.accountEmail || '')
      : (cacheAccount?.email || authState?.accountEmail || '');
    const accountName = nativeConfigured
      ? (nativeBridgeStatus.accountName || cacheAccount?.name || authState?.accountName || '')
      : (cacheAccount?.name || authState?.accountName || '');
    const missingScopes = nativeConfigured
      ? Boolean(nativeBridgeStatus.connected || nativeBridgeStatus.hasRefreshToken) && !hasGrantedScopes()
      : (hasValidAccessToken() && !hasGrantedScopes());
    const selectedCalendar = resolveConfiguredCalendar(
      cacheState.calendars,
      getConfigValue('googleCalendarId', cacheState.selectedCalendarId || 'primary')
    );
    const selectedTasklist = resolveConfiguredTasklist(
      cacheState.tasklists,
      getConfigValue('googleTasklistId', cacheState.selectedTasklistId || '@default')
    );

    return {
      interactiveSupported: nativeConfigured || isInteractiveRuntime(),
      recommendedOrigin: RECOMMENDED_ORIGIN,
      currentOrigin: getCurrentOrigin(),
      hasClientId: nativeConfigured || hasClientId,
      nativeConfigured,
      nativeConfigSource: text(nativeBridgeStatus.configSource),
      bridgeAvailable: Boolean(nativeBridgeStatus.available),
      nativeInProgress: Boolean(nativeBridgeStatus.inProgress),
      nativeMessage: text(nativeBridgeStatus.message),
      connected,
      hasRefreshToken: Boolean(nativeBridgeStatus.hasRefreshToken),
      expiresAt,
      tokenExpired: Number.isFinite(expiresAt) && expiresAt > 0 && expiresAt <= Date.now() + 30 * 1000,
      hasCachedData: cacheState.events.length > 0 || cacheState.tasks.length > 0,
      validationMode,
      calendarEnabled,
      tasksEnabled,
      missingScopes,
      accountEmail,
      accountName,
      calendarCount: cacheState.events.length,
      taskCount: cacheState.tasks.length,
      calendarOptions: clone(cacheState.calendars),
      tasklistOptions: clone(cacheState.tasklists),
      selectedCalendarId: text(selectedCalendar?.id || getConfigValue('googleCalendarId', cacheState.selectedCalendarId || 'primary')),
      selectedTasklistId: text(selectedTasklist?.id || getConfigValue('googleTasklistId', cacheState.selectedTasklistId || '@default')),
      lastSyncAt: cacheState.updatedAt,
      lastError: text(nativeBridgeStatus.lastError) || cacheState.lastError
    };
  }

  function buildDiagnostics(extra = {}) {
    const status = buildStatus();
    const configSource = text(status.nativeConfigSource);
    const dataRoot = text(extra.dataRoot || toDirectoryPath(configSource));
    const bridgeStoragePath = text(extra.bridgeStoragePath);
    const bridgeStorageDir = text(toDirectoryPath(bridgeStoragePath));
    const resolvedDataRoot = dataRoot || bridgeStorageDir;
    const debugSnapshot = LS.Storage?.get?.('googleWorkspaceDebug', null);

    return {
      bridgeReachable: Boolean(status.bridgeAvailable),
      bridgeStoragePath,
      storageMode: text(LS.Storage?.getBackendMode?.(), 'unknown'),
      interactiveSupported: Boolean(status.interactiveSupported),
      currentOrigin: text(status.currentOrigin),
      recommendedOrigin: text(status.recommendedOrigin),
      nativeConfigured: Boolean(status.nativeConfigured),
      connected: Boolean(status.connected),
      hasRefreshToken: Boolean(status.hasRefreshToken),
      tokenExpired: Boolean(status.tokenExpired),
      expiresAt: Number(status.expiresAt || 0),
      calendarEnabled: Boolean(status.calendarEnabled),
      tasksEnabled: Boolean(status.tasksEnabled),
      missingScopes: Boolean(status.missingScopes),
      accountEmail: text(status.accountEmail),
      accountName: text(status.accountName),
      configSource,
      dataRoot: resolvedDataRoot,
      authPath: resolvedDataRoot ? `${resolvedDataRoot}\\google-native-auth.json` : '',
      selectedCalendarId: text(status.selectedCalendarId),
      selectedTasklistId: text(status.selectedTasklistId),
      calendarCount: Number(status.calendarCount || 0),
      taskCount: Number(status.taskCount || 0),
      lastSyncAt: text(status.lastSyncAt),
      lastError: text(status.lastError),
      debug: debugSnapshot && typeof debugSnapshot === 'object' ? clone(debugSnapshot) : null,
      ...clone(extra)
    };
  }

  async function openLocalTarget(target, kind = 'file') {
    const normalizedTarget = text(target);
    if (!normalizedTarget) {
      throw new Error('열 대상 경로가 비어 있습니다.');
    }

    const payload = await fetchJson(NATIVE_SHELL_OPEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        target: normalizedTarget,
        kind
      }),
      timeout: 7000
    });

    if (!payload?.ok) {
      throw new Error(text(payload?.error, '로컬 경로를 열지 못했습니다.'));
    }

    return payload;
  }

  async function testGoogleConnection(options = {}) {
    try {
      await refreshNativeBridgeStatus({
        emit: false,
        clearLocalAuthWhenDisconnected: true
      });

      const bridgeHealth = await probeBridgeHealth();
      const baseDiagnostics = buildDiagnostics({
        bridgeStoragePath: text(bridgeHealth?.storage_path),
        testedAt: nowIso()
      });

      if (!baseDiagnostics.bridgeReachable && !baseDiagnostics.interactiveSupported) {
        throw new Error('로컬 브리지가 실행 중이 아닙니다. 런처 또는 브라우저 미리보기를 다시 실행해 주세요.');
      }

      const accessToken = await ensureAccessToken({
        interactive: Boolean(options.interactive)
      });
      if (!accessToken) {
        throw new Error('Google 로그인이 필요합니다. 로그인 및 연결을 먼저 진행해 주세요.');
      }

      const account = await fetchUserInfo(accessToken);
      const calendars = baseDiagnostics.calendarEnabled
        ? await fetchCalendarList(accessToken)
        : [];
      const tasklists = baseDiagnostics.tasksEnabled
        ? await fetchTasklists(accessToken)
        : [];

      annotateSyncStage('health-check-success', {
        email: text(account?.email),
        calendarOptionCount: calendars.length,
        tasklistOptionCount: tasklists.length
      });

      return {
        ok: true,
        accountEmail: text(account?.email),
        accountName: text(account?.name || account?.given_name || account?.email),
        calendarOptionCount: calendars.length,
        tasklistOptionCount: tasklists.length,
        diagnostics: buildDiagnostics({
          bridgeStoragePath: text(bridgeHealth?.storage_path),
          testedAt: nowIso(),
          testOk: true
        })
      };
    } catch (error) {
      annotateSyncStage('health-check-error', {
        message: text(error?.message),
        status: Number(error?.status || 0)
      });
      throw error;
    }
  }

  function emitStatus() {
    window.dispatchEvent(new CustomEvent('livelysam:googleSyncChanged', {
      detail: buildStatus()
    }));
  }

  function ensureGsiLoaded() {
    if (window.google?.accounts?.oauth2) {
      return Promise.resolve();
    }
    if (gisPromise) return gisPromise;

    gisPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${GOOGLE_GSI_SRC}"]`);
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error('Google 인증 스크립트를 불러오지 못했습니다.')), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = GOOGLE_GSI_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Google 인증 스크립트를 불러오지 못했습니다.'));
      document.head.appendChild(script);
    });

    return gisPromise;
  }

  function applyTokenResponse(response) {
    authState = {
      accessToken: text(response.access_token),
      tokenType: text(response.token_type, 'Bearer'),
      expiresAt: Date.now() + (Number(response.expires_in || 3600) * 1000),
      scope: text(response.scope),
      accountEmail: authState?.accountEmail || '',
      accountName: authState?.accountName || '',
      authMode: 'browser-popup'
    };
    persistAuthState();
  }

  function applyNativeTokenResponse(response) {
    const auth = normalizeAuth({
      ...(response || {}),
      authMode: 'native-bridge'
    });
    if (!auth) {
      throw new Error('Google 액세스 토큰을 받지 못했습니다.');
    }
    authState = auth;
    persistAuthState();
    return auth.accessToken;
  }

  function requestBrowserToken(interactive) {
    const clientId = text(getConfigValue('googleClientId'));
    if (!clientId) {
      return Promise.reject(new Error('Google OAuth Client ID를 먼저 입력해 주세요.'));
    }
    if (!isInteractiveRuntime()) {
      return Promise.reject(new Error('Google 로그인은 브라우저 미리보기 창에서만 진행할 수 있습니다.'));
    }

    return ensureGsiLoaded().then(() => new Promise((resolve, reject) => {
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: getEnabledScopes().join(' '),
        callback: (response) => {
          if (response?.error) {
            reject(new Error(text(response.error_description || response.error, 'Google 인증에 실패했습니다.')));
            return;
          }
          applyTokenResponse(response || {});
          resolve(authState.accessToken);
        },
        error_callback: () => reject(new Error('Google 인증 창을 열지 못했습니다.'))
      });

      tokenClient.requestAccessToken({
        prompt: interactive ? ((!authState || !hasGrantedScopes()) ? 'consent' : '') : ''
      });
    }));
  }

  async function requestNativeLogin() {
    const payload = await fetchJson(NATIVE_LOGIN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        scopes: getEnabledScopes()
      }),
      timeout: 8000
    });

    updateNativeBridgeStatus(payload?.status, { emit: true });

    const deadline = Date.now() + (4 * 60 * 1000);
    while (Date.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
      const status = await refreshNativeBridgeStatus({
        emit: true,
        clearLocalAuthWhenDisconnected: true
      });
      if (status.inProgress) continue;
      if (!status.connected) {
        throw new Error(text(status.lastError, 'Google 로그인에 실패했습니다.'));
      }
      return status;
    }

    throw new Error('Google 로그인 응답을 기다리는 시간이 초과되었습니다.');
  }

  async function requestNativeToken(options = {}) {
    await refreshNativeBridgeStatus({ emit: false });

    if (!hasNativeBridgeConfigured()) {
      throw new Error('개발자용 Google 로그인 설정이 준비되지 않았습니다.');
    }

    if (!nativeBridgeStatus.connected || !hasGrantedScopes()) {
      if (!options.interactive) {
        return '';
      }
      await requestNativeLogin();
    }

    const payload = await fetchJson(NATIVE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        scopes: getEnabledScopes()
      }),
      timeout: 15000
    });

    updateNativeBridgeStatus(payload?.status, { emit: false });
    const accessToken = applyNativeTokenResponse(payload?.auth || {});
    emitStatus();
    return accessToken;
  }

  function requestToken(interactive) {
    if (hasNativeBridgeConfigured()) {
      return requestNativeToken({ interactive });
    }
    return requestBrowserToken(interactive);
  }

  async function ensureAccessToken(options = {}) {
    if (hasUsableAccessToken()) {
      return authState.accessToken;
    }
    if (hasNativeBridgeConfigured()) {
      return requestNativeToken({ interactive: Boolean(options.interactive) });
    }
    if (!options.interactive) {
      return '';
    }
    return requestBrowserToken(true);
  }

  async function fetchGoogle(url, accessToken, options = {}) {
    if (hasNativeBridgeConfigured()) {
      const proxyPayload = await fetchJson(NATIVE_GOOGLE_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: options.method || 'GET',
          url,
          body: options.body ?? null,
          headers: options.headers || {}
        }),
        timeout: options.timeout || 15000
      });

      if (!proxyPayload?.ok) {
        const error = new Error(text(proxyPayload?.error, `Google API 요청 실패 (${Number(proxyPayload?.status || 500)})`));
        error.status = Number(proxyPayload?.status || 500);
        error.payload = proxyPayload?.payload ?? null;
        throw error;
      }

      return proxyPayload?.payload ?? {};
    }

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      ...(options.headers || {})
    };
    let body = options.body;
    if (body && typeof body === 'object') {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }

    const response = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body
    });

    const rawText = await response.text();
    let payload = null;
    if (rawText) {
      try {
        payload = JSON.parse(rawText);
      } catch {
        payload = rawText;
      }
    }

    if (!response.ok) {
      const errorMessage = typeof payload === 'object'
        ? text(payload?.error?.message, `Google API 요청 실패 (${response.status})`)
        : text(payload, `Google API 요청 실패 (${response.status})`);
      const error = new Error(errorMessage);
      error.status = response.status;
      throw error;
    }

    return payload;
  }

  function parseTimestamp(value) {
    const stamp = Date.parse(text(value));
    return Number.isFinite(stamp) ? stamp : 0;
  }

  function addDays(dateLike, days) {
    const date = new Date(dateLike);
    date.setDate(date.getDate() + days);
    return date;
  }

  function startOfDay(dateLike) {
    const date = new Date(dateLike);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function endOfDay(dateLike) {
    const date = new Date(dateLike);
    date.setHours(23, 59, 59, 999);
    return date;
  }

  function toDateString(dateLike) {
    const date = new Date(dateLike);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function toTimeString(value) {
    const normalized = text(value);
    if (!normalized) return '';
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) {
      return normalized.slice(11, 16);
    }
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  function getTimeZone() {
    return text(Intl.DateTimeFormat().resolvedOptions().timeZone, 'Asia/Seoul');
  }

  function addMinutes(baseTime, minutesToAdd) {
    const [hour, minute] = String(baseTime || '09:00').split(':').map((value) => parseInt(value, 10) || 0);
    const total = (hour * 60) + minute + minutesToAdd;
    const clamped = Math.max(0, total);
    const nextHour = Math.floor(clamped / 60) % 24;
    const nextMinute = clamped % 60;
    return `${String(nextHour).padStart(2, '0')}:${String(nextMinute).padStart(2, '0')}`;
  }

  function defaultEndTime(startTime) {
    return addMinutes(startTime || '09:00', 50);
  }

  function isNextDayExclusive(startDate, endDateExclusive) {
    return toDateString(addDays(`${startDate}T00:00:00`, 1)) === endDateExclusive;
  }

  function normalizeCalendars(items) {
    return (items || []).map((item) => {
      const accessRole = text(item.accessRole, 'reader');
      return {
        id: text(item.id),
        summary: text(item.summary, '이름 없는 캘린더'),
        primary: Boolean(item.primary),
        backgroundColor: text(item.backgroundColor, '#4DABF7'),
        foregroundColor: text(item.foregroundColor, '#1E293B'),
        accessRole,
        writable: accessRole === 'owner' || accessRole === 'writer'
      };
    }).filter((item) => item.id)
      .sort((a, b) => {
        if (a.primary !== b.primary) return a.primary ? -1 : 1;
        if (a.writable !== b.writable) return a.writable ? -1 : 1;
        return a.summary.localeCompare(b.summary, 'ko');
      });
  }

  function normalizeTasklists(items) {
    return (items || []).map((item) => ({
      id: text(item.id),
      title: text(item.title, '기본 목록'),
      writable: true
    })).filter((item) => item.id)
      .sort((a, b) => a.title.localeCompare(b.title, 'ko'));
  }

  function getPreferredBoundCalendarId() {
    try {
      if (typeof LS.Records?.listSchedules !== 'function') return '';

      const counts = new Map();
      LS.Records.listSchedules({ includeArchived: true }).forEach((record) => {
        const meta = record?.sync?.google?.calendar || {};
        const calendarId = text(meta.calendarId);
        if (!record?.schedule?.enabled || !calendarId || !text(meta.remoteId)) {
          return;
        }
        counts.set(calendarId, (counts.get(calendarId) || 0) + 1);
      });

      return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    } catch {
      return '';
    }
  }

  function getPreferredBoundTasklistId() {
    try {
      if (typeof LS.Records?.listTasks !== 'function') return '';

      const counts = new Map();
      LS.Records.listTasks({ includeArchived: true }).forEach((record) => {
        const meta = record?.sync?.google?.task || {};
        const tasklistId = text(meta.tasklistId);
        if (!record?.task?.enabled || !tasklistId || !text(meta.remoteId)) {
          return;
        }
        counts.set(tasklistId, (counts.get(tasklistId) || 0) + 1);
      });

      return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    } catch {
      return '';
    }
  }

  function resolveConfiguredCalendar(calendars, selectedId) {
    const items = Array.isArray(calendars) ? calendars : [];
    const preferredId = text(selectedId, 'primary');
    const exact = items.find((item) => item.id === preferredId) || null;

    if (exact && (exact.primary || exact.writable)) {
      return exact;
    }

    const boundCalendarId = getPreferredBoundCalendarId();
    const bound = boundCalendarId
      ? items.find((item) => item.id === boundCalendarId)
      : null;
    if (bound && (bound.primary || bound.writable)) {
      return bound;
    }

    if (preferredId === 'primary') {
      return items.find((item) => item.primary)
        || items.find((item) => item.writable)
        || exact
        || items[0]
        || null;
    }

    return exact
      || items.find((item) => item.primary)
      || items.find((item) => item.writable)
      || items[0]
      || null;
  }

  function resolveConfiguredTasklist(tasklists, selectedId) {
    const items = Array.isArray(tasklists) ? tasklists : [];
    const preferredId = text(selectedId, '@default');
    const exact = items.find((item) => item.id === preferredId) || null;
    if (exact) return exact;

    const boundTasklistId = getPreferredBoundTasklistId();
    const bound = boundTasklistId
      ? items.find((item) => item.id === boundTasklistId)
      : null;
    if (bound) return bound;

    return items[0] || null;
  }

  function resolveCalendarId(calendars) {
    return resolveConfiguredCalendar(
      calendars,
      getConfigValue('googleCalendarId', 'primary')
    );
  }

  function resolveTasklistId(tasklists) {
    return resolveConfiguredTasklist(
      tasklists,
      getConfigValue('googleTasklistId', '@default')
    );
  }

  function parseUntilDate(value) {
    const normalized = text(value);
    if (!normalized) return '';

    if (/^\d{8}$/.test(normalized)) {
      return `${normalized.slice(0, 4)}-${normalized.slice(4, 6)}-${normalized.slice(6, 8)}`;
    }

    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return '';
    return toDateString(date);
  }

  function parseRecurrenceRule(lines, fallbackDate) {
    const ruleLine = (Array.isArray(lines) ? lines : [])
      .map((line) => text(line))
      .find((line) => line.startsWith('RRULE:'));

    if (!ruleLine) {
      return {
        enabled: false,
        frequency: 'weekly',
        interval: 1,
        weekdays: [],
        until: ''
      };
    }

    const weekdayMap = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7 };
    const baseWeekday = new Date(`${fallbackDate}T00:00:00`).getDay() || 7;
    const parts = {};
    ruleLine.replace(/^RRULE:/, '').split(';').forEach((pair) => {
      const [key, value] = pair.split('=');
      if (key && value) parts[key] = value;
    });

    const frequencyMap = {
      DAILY: 'daily',
      WEEKLY: 'weekly',
      MONTHLY: 'monthly',
      YEARLY: 'yearly'
    };
    const frequency = frequencyMap[parts.FREQ] || 'weekly';
    const weekdays = text(parts.BYDAY)
      .split(',')
      .map((value) => weekdayMap[value])
      .filter(Boolean);

    return {
      enabled: true,
      frequency,
      interval: Math.max(1, parseInt(parts.INTERVAL, 10) || 1),
      weekdays: frequency === 'weekly'
        ? (weekdays.length ? weekdays : [baseWeekday])
        : [],
      until: parseUntilDate(parts.UNTIL)
    };
  }

  function buildRecurrenceLines(repeat) {
    if (!repeat?.enabled) return [];

    const frequencyMap = {
      daily: 'DAILY',
      weekly: 'WEEKLY',
      monthly: 'MONTHLY',
      yearly: 'YEARLY'
    };
    const byDayMap = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
    const parts = [`FREQ=${frequencyMap[repeat.frequency] || 'WEEKLY'}`];

    if ((parseInt(repeat.interval, 10) || 1) > 1) {
      parts.push(`INTERVAL=${Math.max(1, parseInt(repeat.interval, 10) || 1)}`);
    }

    if (repeat.frequency === 'weekly') {
      const weekdays = Array.isArray(repeat.weekdays) && repeat.weekdays.length
        ? repeat.weekdays
        : [1];
      parts.push(`BYDAY=${weekdays.map((day) => byDayMap[Math.max(1, Math.min(7, day)) - 1]).join(',')}`);
    }

    if (repeat.until) {
      const date = new Date(`${repeat.until}T23:59:59`);
      if (!Number.isNaN(date.getTime())) {
        parts.push(`UNTIL=${date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`);
      }
    }

    return [`RRULE:${parts.join(';')}`];
  }

  function buildEventDescription(event) {
    return text(event.description);
  }

  function normalizeRemoteCalendarEvent(event, calendarMeta) {
    const id = text(event?.id);
    const startDate = text(event?.start?.date || text(event?.start?.dateTime).slice(0, 10));
    if (!id || !startDate) return null;

    const eventType = text(event?.eventType, 'default');
    const allDay = Boolean(event?.start?.date && !event?.start?.dateTime);
    let startTime = '';
    let endTime = '';

    if (allDay) {
      const endDateExclusive = text(event?.end?.date);
      if (endDateExclusive && !isNextDayExclusive(startDate, endDateExclusive)) {
        return null;
      }
    } else {
      startTime = toTimeString(event?.start?.dateTime);
      endTime = toTimeString(event?.end?.dateTime);
      const endDate = text(event?.end?.dateTime).slice(0, 10);
      if (endDate && endDate !== startDate) {
        return null;
      }
    }

    if (eventType && eventType !== 'default') {
      return null;
    }

    return {
      id,
      title: text(event.summary, '제목 없는 일정'),
      description: buildEventDescription(event),
      date: startDate,
      startTime,
      endTime,
      allDay,
      repeat: parseRecurrenceRule(event.recurrence || [], startDate),
      updatedAt: text(event.updated),
      link: text(event.htmlLink),
      etag: text(event.etag),
      calendarId: calendarMeta?.id || '',
      calendarName: calendarMeta?.summary || '',
      readOnly: !Boolean(calendarMeta?.writable)
    };
  }

  function normalizeRemoteTask(item, tasklistMeta) {
    const id = text(item?.id);
    const title = text(item?.title);
    if (!id || !title || item?.deleted) return null;

    return {
      id,
      title: text(item.title, '제목 없는 할 일'),
      description: text(item.notes),
      dueDate: text(item.due).slice(0, 10),
      status: text(item.status) === 'completed' ? 'done' : 'needsAction',
      completedAt: text(item.completed),
      updatedAt: text(item.updated),
      link: text(item.webViewLink || item.selfLink),
      etag: text(item.etag),
      tasklistId: tasklistMeta?.id || '',
      tasklistName: tasklistMeta?.title || '',
      readOnly: !Boolean(tasklistMeta?.writable)
    };
  }

  function buildRepeatSignature(repeat = {}) {
    return [
      repeat.enabled ? '1' : '0',
      text(repeat.frequency, 'weekly'),
      String(Math.max(1, parseInt(repeat.interval, 10) || 1)),
      Array.isArray(repeat.weekdays) ? repeat.weekdays.join(',') : '',
      text(repeat.until)
    ].join('|');
  }

  function buildScheduleSignatureFields(source) {
    return [
      text(source.title).toLowerCase(),
      text(source.body || source.description).trim(),
      text(source.date),
      source.allDay ? '1' : '0',
      text(source.startTime),
      text(source.endTime),
      buildRepeatSignature(source.repeat)
    ].join('|');
  }

  function buildTaskSignatureFields(source) {
    return [
      text(source.title).toLowerCase(),
      text(source.body || source.description).trim(),
      text(source.dueDate),
      source.status === 'done' ? 'done' : 'open'
    ].join('|');
  }

  function buildScheduleSignatureFromRecord(record) {
    return buildScheduleSignatureFields({
      title: LS.Records.getDisplayTitle(record, '일정'),
      body: LS.Records.getDisplayBody(record),
      date: record.schedule?.date,
      allDay: record.schedule?.allDay,
      startTime: record.schedule?.startTime,
      endTime: record.schedule?.endTime,
      repeat: record.schedule?.repeat
    });
  }

  function buildTaskSignatureFromRecord(record) {
    return buildTaskSignatureFields({
      title: LS.Records.getDisplayTitle(record, '할 일'),
      body: LS.Records.getDisplayBody(record),
      dueDate: record.task?.dueDate,
      status: record.task?.status === 'done' ? 'done' : 'open'
    });
  }

  function buildScheduleSignatureFromRemote(item) {
    return buildScheduleSignatureFields(item);
  }

  function buildTaskSignatureFromRemote(item) {
    return buildTaskSignatureFields({
      title: item.title,
      description: item.description,
      dueDate: item.dueDate,
      status: item.status === 'done' ? 'done' : 'open'
    });
  }

  function getDuplicateFacetMeta(record, kind = 'calendar') {
    return kind === 'task'
      ? (record?.sync?.google?.task || {})
      : (record?.sync?.google?.calendar || {});
  }

  function getDuplicateContainerId(meta, kind = 'calendar') {
    return kind === 'task'
      ? text(meta?.tasklistId)
      : text(meta?.calendarId);
  }

  function getDuplicateContainerName(kind, containerId = '') {
    const safeContainerId = text(containerId);
    if (!safeContainerId) return '';

    if (kind === 'task') {
      const match = (cacheState.tasklists || []).find((item) => text(item?.id) === safeContainerId);
      return text(match?.title, safeContainerId);
    }

    const match = (cacheState.calendars || []).find((item) => text(item?.id) === safeContainerId);
    return text(match?.summary || match?.title, safeContainerId);
  }

  function buildDuplicateContextLabel(record, kind = 'calendar') {
    if (kind === 'task') {
      const dueDate = text(record?.task?.dueDate);
      const status = record?.task?.status === 'done' ? '완료' : '미완료';
      return dueDate ? `${dueDate} / ${status}` : status;
    }

    const date = text(record?.schedule?.date);
    if (!date) return '';
    if (record?.schedule?.allDay) {
      return `${date} / 하루종일`;
    }
    const startTime = text(record?.schedule?.startTime);
    const endTime = text(record?.schedule?.endTime);
    return [date, startTime && endTime ? `${startTime}-${endTime}` : (startTime || endTime || '')]
      .filter(Boolean)
      .join(' / ');
  }

  function createDuplicateRecordSnapshot(record, kind = 'calendar') {
    const meta = getDuplicateFacetMeta(record, kind);
    const containerId = getDuplicateContainerId(meta, kind);
    return {
      kind,
      recordId: text(record?.id),
      title: LS.Records.getDisplayTitle(record, kind === 'task' ? '할 일' : '일정'),
      body: LS.Records.getDisplayBody(record),
      contextLabel: buildDuplicateContextLabel(record, kind),
      archived: Boolean(record?.archivedAt),
      updatedAt: text(record?.updatedAt),
      createdAt: text(record?.createdAt),
      remoteUpdatedAt: text(meta?.remoteUpdatedAt),
      remoteId: text(meta?.remoteId),
      containerId,
      containerName: getDuplicateContainerName(kind, containerId),
      readOnly: Boolean(meta?.readOnly)
    };
  }

  function compareDuplicateRecordSnapshots(a, b) {
    if (Boolean(a?.remoteId) !== Boolean(b?.remoteId)) {
      return a?.remoteId ? -1 : 1;
    }
    if (Boolean(a?.readOnly) !== Boolean(b?.readOnly)) {
      return a?.readOnly ? 1 : -1;
    }
    if (Boolean(a?.archived) !== Boolean(b?.archived)) {
      return a?.archived ? 1 : -1;
    }

    const remoteDiff = parseTimestamp(b?.remoteUpdatedAt) - parseTimestamp(a?.remoteUpdatedAt);
    if (remoteDiff) return remoteDiff;

    const updatedDiff = parseTimestamp(b?.updatedAt) - parseTimestamp(a?.updatedAt);
    if (updatedDiff) return updatedDiff;

    const createdDiff = parseTimestamp(b?.createdAt) - parseTimestamp(a?.createdAt);
    if (createdDiff) return createdDiff;

    return text(a?.recordId).localeCompare(text(b?.recordId), 'en');
  }

  function inspectDuplicateRecords(records) {
    const groupsByKey = new Map();

    (Array.isArray(records) ? records : []).forEach((record) => {
      if (record?.schedule?.enabled) {
        const meta = getDuplicateFacetMeta(record, 'calendar');
        const containerId = getDuplicateContainerId(meta, 'calendar');
        if (text(meta?.remoteId) && containerId) {
          const signature = buildScheduleSignatureFromRecord(record);
          const key = `calendar:${containerId}:${signature}`;
          const bucket = groupsByKey.get(key) || [];
          bucket.push(createDuplicateRecordSnapshot(record, 'calendar'));
          groupsByKey.set(key, bucket);
        }
      }

      if (record?.task?.enabled) {
        const meta = getDuplicateFacetMeta(record, 'task');
        const containerId = getDuplicateContainerId(meta, 'task');
        if (text(meta?.remoteId) && containerId) {
          const signature = buildTaskSignatureFromRecord(record);
          const key = `task:${containerId}:${signature}`;
          const bucket = groupsByKey.get(key) || [];
          bucket.push(createDuplicateRecordSnapshot(record, 'task'));
          groupsByKey.set(key, bucket);
        }
      }
    });

    const groups = [...groupsByKey.entries()]
      .map(([id, members]) => {
        const ordered = [...members].sort(compareDuplicateRecordSnapshots);
        if (ordered.length <= 1) return null;

        const keep = ordered[0] || null;
        const remove = ordered.slice(1);
        const hasReadOnly = ordered.some((item) => item.readOnly);
        return {
          id,
          kind: keep?.kind || 'calendar',
          title: text(keep?.title),
          contextLabel: text(keep?.contextLabel),
          containerId: text(keep?.containerId),
          containerName: text(keep?.containerName),
          count: ordered.length,
          keep,
          remove,
          canAutoClean: remove.length > 0 && !hasReadOnly,
          blockedReason: hasReadOnly ? '읽기 전용 Google 항목이 포함되어 자동 정리할 수 없습니다.' : '',
          localDeleteCount: remove.length,
          remoteDeleteCount: remove.filter((item) => item.remoteId && !item.readOnly).length
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.canAutoClean !== b.canAutoClean) return a.canAutoClean ? -1 : 1;
        if (a.kind !== b.kind) return a.kind.localeCompare(b.kind, 'en');
        if (a.title !== b.title) return a.title.localeCompare(b.title, 'ko');
        if (a.contextLabel !== b.contextLabel) return a.contextLabel.localeCompare(b.contextLabel, 'ko');
        return a.id.localeCompare(b.id, 'en');
      });

    const actionableGroups = groups.filter((group) => group.canAutoClean);
    const blockedGroups = groups.filter((group) => !group.canAutoClean);
    const actionableMembers = actionableGroups.flatMap((group) => group.remove);

    return {
      generatedAt: nowIso(),
      totalGroups: groups.length,
      actionableGroups: actionableGroups.length,
      blockedGroups: blockedGroups.length,
      actionableLocalDeleteCount: actionableMembers.length,
      actionableCalendarDeleteCount: actionableMembers.filter((item) => item.kind === 'calendar').length,
      actionableTaskDeleteCount: actionableMembers.filter((item) => item.kind === 'task').length,
      groups
    };
  }

  async function inspectGoogleDuplicateRecords() {
    loadPersistedState();
    await LS.Records.init();
    return inspectDuplicateRecords(LS.Records.listAll({ includeArchived: true }));
  }

  async function cleanupGoogleDuplicateRecords() {
    loadPersistedState();
    await LS.Records.init();

    const inspection = inspectDuplicateRecords(LS.Records.listAll({ includeArchived: true }));
    const targets = inspection.groups
      .filter((group) => group.canAutoClean)
      .flatMap((group) => group.remove);

    const seen = new Set();
    const uniqueTargets = targets.filter((item) => {
      const key = text(item?.recordId);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    for (const item of uniqueTargets) {
      await LS.Records.deleteRecord(item.recordId);
    }

    const remainingInspection = inspectDuplicateRecords(LS.Records.listAll({ includeArchived: true }));
    return {
      deletedLocalCount: uniqueTargets.length,
      queuedCalendarDeleteCount: uniqueTargets.filter((item) => item.kind === 'calendar' && item.remoteId && !item.readOnly).length,
      queuedTaskDeleteCount: uniqueTargets.filter((item) => item.kind === 'task' && item.remoteId && !item.readOnly).length,
      deletedRecordIds: uniqueTargets.map((item) => item.recordId),
      inspection,
      remainingInspection
    };
  }

  function ensureRecordSync(record) {
    record.sync = record.sync || {};
    record.sync.google = record.sync.google || {};
    record.sync.google.calendar = record.sync.google.calendar || {};
    record.sync.google.task = record.sync.google.task || {};
    return record;
  }

  function setCalendarSyncMeta(record, remote, syncStamp) {
    ensureRecordSync(record);
    record.sync.google.calendar = {
      enabled: true,
      remoteId: text(remote?.id),
      calendarId: text(remote?.calendarId),
      remoteUpdatedAt: text(remote?.updatedAt),
      lastSyncedAt: text(syncStamp),
      lastSignature: buildScheduleSignatureFromRecord(record),
      link: text(remote?.link),
      etag: text(remote?.etag),
      readOnly: Boolean(remote?.readOnly)
    };
    return record;
  }

  function setTaskSyncMeta(record, remote, syncStamp) {
    ensureRecordSync(record);
    record.sync.google.task = {
      enabled: true,
      remoteId: text(remote?.id),
      tasklistId: text(remote?.tasklistId),
      remoteUpdatedAt: text(remote?.updatedAt),
      lastSyncedAt: text(syncStamp),
      lastSignature: buildTaskSignatureFromRecord(record),
      link: text(remote?.link),
      etag: text(remote?.etag),
      readOnly: Boolean(remote?.readOnly)
    };
    return record;
  }

  function clearCalendarSyncMeta(record) {
    ensureRecordSync(record);
    record.sync.google.calendar = {
      enabled: false,
      remoteId: '',
      calendarId: '',
      remoteUpdatedAt: '',
      lastSyncedAt: '',
      lastSignature: '',
      link: '',
      etag: '',
      readOnly: false
    };
    return record;
  }

  function clearTaskSyncMeta(record) {
    ensureRecordSync(record);
    record.sync.google.task = {
      enabled: false,
      remoteId: '',
      tasklistId: '',
      remoteUpdatedAt: '',
      lastSyncedAt: '',
      lastSignature: '',
      link: '',
      etag: '',
      readOnly: false
    };
    return record;
  }

  function createLocalRecordFromRemoteCalendar(remote, syncStamp) {
    const record = {
      id: LS.Helpers?.generateId?.() || `google-calendar-${remote.id}-${Date.now()}`,
      title: remote.title,
      body: remote.description,
      color: 'blue',
      createdAt: text(remote.updatedAt, syncStamp),
      updatedAt: text(remote.updatedAt, syncStamp),
      note: { enabled: false },
      task: {
        enabled: false,
        status: 'open',
        priority: 'medium',
        syncSchedule: false,
        dueDate: '',
        completedAt: null,
        startTime: '',
        endTime: '',
        repeat: { enabled: false, frequency: 'weekly', interval: 1, weekdays: [], until: '' }
      },
      schedule: {
        enabled: true,
        date: remote.date,
        startTime: remote.startTime,
        endTime: remote.endTime,
        allDay: remote.allDay,
        repeat: clone(remote.repeat)
      },
      countdown: { enabled: false, targetDate: '', group: '' },
      bookmark: { enabled: false, url: '', icon: '🔖', openMode: 'new' },
      sync: { google: { calendar: {}, task: {} } }
    };
    return setCalendarSyncMeta(record, remote, syncStamp);
  }

  function createLocalRecordFromRemoteTask(remote, syncStamp) {
    const record = {
      id: LS.Helpers?.generateId?.() || `google-task-${remote.id}-${Date.now()}`,
      title: remote.title,
      body: remote.description,
      color: 'green',
      createdAt: text(remote.updatedAt, syncStamp),
      updatedAt: text(remote.updatedAt, syncStamp),
      note: { enabled: false },
      task: {
        enabled: true,
        status: remote.status === 'done' ? 'done' : 'open',
        priority: 'medium',
        syncSchedule: false,
        dueDate: remote.dueDate,
        completedAt: remote.status === 'done' ? text(remote.completedAt || syncStamp) : null,
        startTime: '',
        endTime: '',
        repeat: { enabled: false, frequency: 'weekly', interval: 1, weekdays: [], until: '' }
      },
      schedule: {
        enabled: false,
        date: '',
        startTime: '',
        endTime: '',
        allDay: true,
        repeat: { enabled: false, frequency: 'weekly', interval: 1, weekdays: [], until: '' }
      },
      countdown: { enabled: false, targetDate: '', group: '' },
      bookmark: { enabled: false, url: '', icon: '🔖', openMode: 'new' },
      sync: { google: { calendar: {}, task: {} } }
    };
    return setTaskSyncMeta(record, remote, syncStamp);
  }

  function applyRemoteCalendarToRecord(record, remote, syncStamp) {
    const next = clone(record);
    next.title = remote.title;
    next.body = remote.description;
    next.updatedAt = text(remote.updatedAt, syncStamp);
    next.schedule = {
      ...next.schedule,
      enabled: true,
      date: remote.date,
      startTime: remote.allDay ? '' : remote.startTime,
      endTime: remote.allDay ? '' : remote.endTime,
      allDay: remote.allDay,
      repeat: clone(remote.repeat)
    };
    return setCalendarSyncMeta(next, remote, syncStamp);
  }

  function applyRemoteTaskToRecord(record, remote, syncStamp) {
    const next = clone(record);
    next.title = remote.title;
    next.body = remote.description;
    next.updatedAt = text(remote.updatedAt, syncStamp);
    next.task = {
      ...next.task,
      enabled: true,
      dueDate: remote.dueDate,
      status: remote.status === 'done' ? 'done' : 'open',
      completedAt: remote.status === 'done' ? text(remote.completedAt || syncStamp) : null
    };
    return setTaskSyncMeta(next, remote, syncStamp);
  }

  function bindCalendarSyncOnly(record, remote, syncStamp) {
    const next = clone(record);
    return setCalendarSyncMeta(next, remote, syncStamp);
  }

  function bindTaskSyncOnly(record, remote, syncStamp) {
    const next = clone(record);
    return setTaskSyncMeta(next, remote, syncStamp);
  }

  function buildLocalIndex(records) {
    const index = {
      calendarRemote: new Map(),
      calendarSignature: new Map(),
      taskRemote: new Map(),
      taskSignature: new Map()
    };

    records.forEach((record) => {
      const calendarMeta = record.sync?.google?.calendar || {};
      if (record.schedule?.enabled) {
        if (calendarMeta.remoteId) {
          index.calendarRemote.set(`${text(calendarMeta.calendarId)}:${text(calendarMeta.remoteId)}`, record);
        } else {
          const signature = buildScheduleSignatureFromRecord(record);
          const bucket = index.calendarSignature.get(signature) || [];
          bucket.push(record);
          index.calendarSignature.set(signature, bucket);
        }
      }

      const taskMeta = record.sync?.google?.task || {};
      if (record.task?.enabled) {
        if (taskMeta.remoteId) {
          index.taskRemote.set(`${text(taskMeta.tasklistId)}:${text(taskMeta.remoteId)}`, record);
        } else {
          const signature = buildTaskSignatureFromRecord(record);
          const bucket = index.taskSignature.get(signature) || [];
          bucket.push(record);
          index.taskSignature.set(signature, bucket);
        }
      }
    });

    return index;
  }

  function getCalendarRemoteKey(remote) {
    return `${text(remote?.calendarId)}:${text(remote?.id)}`;
  }

  function getTaskRemoteKey(remote) {
    return `${text(remote?.tasklistId)}:${text(remote?.id)}`;
  }

  function buildRemoteSignatureIndex(items, buildSignature, buildKey, claimedKeys = new Set()) {
    const index = new Map();
    (Array.isArray(items) ? items : []).forEach((item) => {
      const key = buildKey(item);
      if (!key || claimedKeys.has(key)) return;
      const signature = buildSignature(item);
      const bucket = index.get(signature) || [];
      bucket.push(item);
      index.set(signature, bucket);
    });
    return index;
  }

  function takeRemoteSignatureMatch(indexMap, signature, buildKey, claimedKeys = new Set()) {
    const bucket = indexMap.get(signature) || [];
    while (bucket.length) {
      const candidate = bucket.shift();
      const key = buildKey(candidate);
      if (!key || claimedKeys.has(key)) {
        continue;
      }
      if (!bucket.length) {
        indexMap.delete(signature);
      } else {
        indexMap.set(signature, bucket);
      }
      claimedKeys.add(key);
      return candidate;
    }
    indexMap.delete(signature);
    return null;
  }

  function collectClaimedRemoteKeys(records, kind) {
    const claimed = new Set();
    (Array.isArray(records) ? records : []).forEach((record) => {
      const meta = kind === 'task'
        ? (record.sync?.google?.task || {})
        : (record.sync?.google?.calendar || {});
      const remoteId = text(meta.remoteId);
      if (!remoteId) return;
      const containerId = kind === 'task'
        ? text(meta.tasklistId)
        : text(meta.calendarId);
      claimed.add(`${containerId}:${remoteId}`);
    });
    return claimed;
  }

  function takeSignatureMatch(indexMap, signature) {
    const bucket = indexMap.get(signature) || [];
    const record = bucket.shift() || null;
    if (!bucket.length) {
      indexMap.delete(signature);
    } else {
      indexMap.set(signature, bucket);
    }
    return record;
  }

  function isScheduleLocalDirty(record) {
    const meta = record.sync?.google?.calendar || {};
    return record.schedule?.enabled && buildScheduleSignatureFromRecord(record) !== text(meta.lastSignature);
  }

  function isTaskLocalDirty(record) {
    const meta = record.sync?.google?.task || {};
    return record.task?.enabled && buildTaskSignatureFromRecord(record) !== text(meta.lastSignature);
  }

  function buildCalendarPayload(record) {
    const title = LS.Records.getDisplayTitle(record, '일정');
    const body = LS.Records.getDisplayBody(record);
    const schedule = record.schedule || {};
    const payload = {
      summary: title,
      description: body
    };

    if (schedule.repeat?.enabled) {
      payload.recurrence = buildRecurrenceLines(schedule.repeat);
    }

    if (schedule.allDay) {
      payload.start = { date: schedule.date };
      payload.end = { date: toDateString(addDays(`${schedule.date}T00:00:00`, 1)) };
      return payload;
    }

    const startTime = text(schedule.startTime, '09:00');
    const endTime = text(schedule.endTime, defaultEndTime(startTime));
    const timeZone = getTimeZone();
    payload.start = { dateTime: `${schedule.date}T${startTime}:00`, timeZone };
    payload.end = { dateTime: `${schedule.date}T${endTime}:00`, timeZone };
    return payload;
  }

  function buildTaskPayload(record) {
    const title = LS.Records.getDisplayTitle(record, '할 일');
    const body = LS.Records.getDisplayBody(record);
    const payload = {
      title,
      notes: body,
      status: record.task?.status === 'done' ? 'completed' : 'needsAction'
    };

    if (record.task?.dueDate) {
      payload.due = `${record.task.dueDate}T00:00:00.000Z`;
    }
    if (record.task?.status === 'done') {
      payload.completed = text(record.task.completedAt, nowIso());
    } else {
      payload.completed = null;
    }
    return payload;
  }

  function getDeleteQueue() {
    if (typeof LS.Records?.getGoogleSyncDeleteQueue === 'function') {
      return LS.Records.getGoogleSyncDeleteQueue();
    }
    const stored = LS.Storage.get(DELETE_QUEUE_KEY, []);
    return Array.isArray(stored) ? clone(stored) : [];
  }

  function setDeleteQueue(items) {
    if (typeof LS.Records?.setGoogleSyncDeleteQueue === 'function') {
      LS.Records.setGoogleSyncDeleteQueue(items);
      return;
    }
    LS.Storage.set(DELETE_QUEUE_KEY, Array.isArray(items) ? items : []);
  }

  async function fetchUserInfo(accessToken) {
    return fetchGoogle('https://www.googleapis.com/oauth2/v3/userinfo', accessToken);
  }

  async function fetchCalendarList(accessToken) {
    const payload = await fetchGoogle('https://www.googleapis.com/calendar/v3/users/me/calendarList', accessToken);
    return normalizeCalendars(payload?.items || []);
  }

  async function fetchCalendarEvents(accessToken, calendarId) {
    const rangeStart = startOfDay(addDays(new Date(), -CACHE_PAST_DAYS));
    const rangeEnd = endOfDay(addDays(new Date(), CACHE_FUTURE_DAYS));
    const params = new URLSearchParams({
      singleEvents: 'false',
      maxResults: '2500',
      timeMin: rangeStart.toISOString(),
      timeMax: rangeEnd.toISOString()
    });
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`;
    const payload = await fetchGoogle(url, accessToken);
    return {
      items: payload?.items || [],
      rangeStart: toDateString(rangeStart),
      rangeEnd: toDateString(rangeEnd)
    };
  }

  async function fetchTasklists(accessToken) {
    const payload = await fetchGoogle('https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=100', accessToken);
    return normalizeTasklists(payload?.items || []);
  }

  async function fetchTasks(accessToken, tasklistId) {
    const url = `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(tasklistId)}/tasks?showCompleted=true&showHidden=true&maxResults=200`;
    const payload = await fetchGoogle(url, accessToken);
    return payload?.items || [];
  }

  async function createCalendarEvent(accessToken, calendarId, payload) {
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
    return fetchGoogle(url, accessToken, { method: 'POST', body: payload });
  }

  async function updateCalendarEvent(accessToken, calendarId, eventId, payload) {
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
    return fetchGoogle(url, accessToken, { method: 'PUT', body: payload });
  }

  async function deleteCalendarEvent(accessToken, calendarId, eventId) {
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
    return fetchGoogle(url, accessToken, { method: 'DELETE' });
  }

  async function createTask(accessToken, tasklistId, payload) {
    const url = `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(tasklistId)}/tasks`;
    return fetchGoogle(url, accessToken, { method: 'POST', body: payload });
  }

  async function updateTask(accessToken, tasklistId, taskId, payload) {
    const url = `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(tasklistId)}/tasks/${encodeURIComponent(taskId)}`;
    return fetchGoogle(url, accessToken, { method: 'PATCH', body: payload });
  }

  async function deleteTask(accessToken, tasklistId, taskId) {
    const url = `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(tasklistId)}/tasks/${encodeURIComponent(taskId)}`;
    return fetchGoogle(url, accessToken, { method: 'DELETE' });
  }

  async function flushDeleteQueue(accessToken, fallbacks = {}) {
    const queue = getDeleteQueue();
    if (!queue.length) return [];

    const remaining = [];
    for (const item of queue) {
      const kind = item?.kind === 'task' ? 'task' : 'calendar';
      const containerId = text(item?.containerId || (kind === 'task' ? fallbacks.tasklistId : fallbacks.calendarId));
      if (!containerId || !text(item?.remoteId)) {
        continue;
      }

      try {
        if (kind === 'task') {
          await deleteTask(accessToken, containerId, item.remoteId);
        } else {
          await deleteCalendarEvent(accessToken, containerId, item.remoteId);
        }
      } catch (error) {
        if (error?.status === 404) {
          continue;
        }
        remaining.push(item);
      }
    }

    setDeleteQueue(remaining);
    return remaining;
  }

  async function syncGoogleData(options = {}) {
    loadPersistedState();

    const calendarEnabled = isCalendarSyncEnabled();
    const tasksEnabled = isTaskSyncEnabled();
    const syncStats = {
      remainingDeleteQueue: 0,
      remoteCalendarsCreated: 0,
      remoteCalendarsUpdated: 0,
      remoteCalendarsBound: 0,
      remoteTasksCreated: 0,
      remoteTasksUpdated: 0,
      remoteTasksBound: 0,
      remoteTasksRemoved: 0,
      pushedCalendarCreates: 0,
      pushedCalendarUpdates: 0,
      pushedCalendarRebinds: 0,
      pushedTaskCreates: 0,
      pushedTaskUpdates: 0,
      pushedTaskRebinds: 0,
      localRecordChanges: 0
    };
    annotateSyncStage('start', {
      calendarEnabled,
      tasksEnabled,
      cachedCalendarCount: Array.isArray(cacheState.events) ? cacheState.events.length : 0,
      cachedTaskCount: Array.isArray(cacheState.tasks) ? cacheState.tasks.length : 0,
      selectedCalendarId: text(getConfigValue('googleCalendarId', cacheState.selectedCalendarId || 'primary')),
      selectedTasklistId: text(getConfigValue('googleTasklistId', cacheState.selectedTasklistId || '@default'))
    });
    if (!calendarEnabled && !tasksEnabled) {
      cacheState = normalizeCache({
        ...cacheState,
        updatedAt: nowIso(),
        lastError: ''
      });
      persistCacheState();
      emitStatus();
      return buildStatus();
    }

    const accessToken = await ensureAccessToken({ interactive: Boolean(options.interactive) });
    annotateSyncStage('token-ready', {
      hasAccessToken: Boolean(text(accessToken)),
      interactive: Boolean(options.interactive)
    });
    if (!accessToken) {
      annotateSyncStage('token-missing', {
        interactive: Boolean(options.interactive)
      });
      emitStatus();
      return buildStatus();
    }

    try {
      await LS.Records.init();
      const syncStamp = nowIso();
      const nextCache = createEmptyCache();
      nextCache.updatedAt = syncStamp;
      nextCache.origin = getCurrentOrigin();

      const account = await fetchUserInfo(accessToken);
      annotateSyncStage('account-ready', {
        email: text(account?.email),
        name: text(account?.name || account?.given_name || account?.email)
      });
      nextCache.account = {
        email: text(account?.email),
        name: text(account?.name || account?.given_name || account?.email),
        picture: text(account?.picture)
      };
      authState = {
        ...authState,
        accountEmail: nextCache.account.email,
        accountName: nextCache.account.name
      };
      persistAuthState();

      let selectedCalendar = null;
      if (calendarEnabled) {
        const calendars = await fetchCalendarList(accessToken);
        nextCache.calendars = calendars;
        selectedCalendar = resolveCalendarId(calendars);
        nextCache.selectedCalendarId = selectedCalendar?.id || '';
        if (selectedCalendar?.id && selectedCalendar.id !== getConfigValue('googleCalendarId', 'primary')) {
          LS.Config?.set?.('googleCalendarId', selectedCalendar.id);
        }
      }

      let selectedTasklist = null;
      if (tasksEnabled) {
        const tasklists = await fetchTasklists(accessToken);
        nextCache.tasklists = tasklists;
        selectedTasklist = resolveTasklistId(tasklists);
        nextCache.selectedTasklistId = selectedTasklist?.id || '';
        if (selectedTasklist?.id && selectedTasklist.id !== getConfigValue('googleTasklistId', '@default')) {
          LS.Config?.set?.('googleTasklistId', selectedTasklist.id);
        }
      }
      annotateSyncStage('lists-ready', {
        calendarOptionCount: nextCache.calendars.length,
        tasklistOptionCount: nextCache.tasklists.length,
        selectedCalendarId: text(selectedCalendar?.id),
        selectedTasklistId: text(selectedTasklist?.id)
      });

      const remainingDeleteQueue = await flushDeleteQueue(accessToken, {
        calendarId: selectedCalendar?.id || '',
        tasklistId: selectedTasklist?.id || ''
      });
      syncStats.remainingDeleteQueue = remainingDeleteQueue.length;
      annotateSyncStage('delete-queue-flushed', {
        remainingDeleteQueue: syncStats.remainingDeleteQueue
      });

      let remoteCalendars = [];
      if (calendarEnabled && selectedCalendar) {
        const payload = await fetchCalendarEvents(accessToken, selectedCalendar.id);
        nextCache.rangeStart = payload.rangeStart;
        nextCache.rangeEnd = payload.rangeEnd;
        remoteCalendars = (payload.items || [])
          .map((item) => normalizeRemoteCalendarEvent(item, selectedCalendar))
          .filter(Boolean);
      }

      let remoteTasks = [];
      if (tasksEnabled && selectedTasklist) {
        const payload = await fetchTasks(accessToken, selectedTasklist.id);
        remoteTasks = (payload || [])
          .map((item) => normalizeRemoteTask(item, selectedTasklist))
          .filter(Boolean);
      }
      annotateSyncStage('remote-fetched', {
        selectedCalendarId: text(selectedCalendar?.id),
        selectedTasklistId: text(selectedTasklist?.id),
        remoteCalendarCount: remoteCalendars.length,
        remoteTaskCount: remoteTasks.length
      });

      const localRecords = LS.Records.listAll({ includeArchived: true });
      const changedById = new Map();
      const localIndex = buildLocalIndex(localRecords);

      function upsertLocalRecord(record) {
        const index = localRecords.findIndex((item) => item.id === record.id);
        if (index >= 0) {
          localRecords[index] = clone(record);
        } else {
          localRecords.push(clone(record));
        }
        changedById.set(record.id, clone(record));
      }

      function getCurrentLocalRecord(candidate) {
        if (!candidate?.id) return candidate || null;
        return localRecords.find((item) => item.id === candidate.id) || candidate;
      }

      const remoteCalendarMap = new Map();
      remoteCalendars.forEach((item) => {
        remoteCalendarMap.set(getCalendarRemoteKey(item), item);
      });

      for (const remote of remoteCalendars) {
        const remoteKey = `${remote.calendarId}:${remote.id}`;
        const existing = getCurrentLocalRecord(
          localIndex.calendarRemote.get(remoteKey)
          || takeSignatureMatch(localIndex.calendarSignature, buildScheduleSignatureFromRemote(remote))
        );

        if (!existing) {
          syncStats.remoteCalendarsCreated += 1;
          upsertLocalRecord(createLocalRecordFromRemoteCalendar(remote, syncStamp));
          continue;
        }

        const meta = existing.sync?.google?.calendar || {};
        const localSignature = buildScheduleSignatureFromRecord(existing);
        const remoteSignature = buildScheduleSignatureFromRemote(remote);
        const localDirty = localSignature !== text(meta.lastSignature);
        const remoteDirty = text(meta.remoteUpdatedAt) !== text(remote.updatedAt);

        if (!text(meta.remoteId) && localSignature === remoteSignature) {
          syncStats.remoteCalendarsBound += 1;
          upsertLocalRecord(bindCalendarSyncOnly(existing, remote, syncStamp));
          continue;
        }

        if (!localDirty || localSignature === remoteSignature || (remoteDirty && parseTimestamp(remote.updatedAt) >= parseTimestamp(existing.updatedAt))) {
          syncStats.remoteCalendarsUpdated += 1;
          upsertLocalRecord(applyRemoteCalendarToRecord(existing, remote, syncStamp));
          continue;
        }

        // Keep the local edit dirty until it is pushed back to Google.
        // Updating sync metadata here would incorrectly mark the record as already synced.
        continue;
      }

      const remoteTaskMap = new Map();
      remoteTasks.forEach((item) => {
        remoteTaskMap.set(getTaskRemoteKey(item), item);
      });

      for (const remote of remoteTasks) {
        const remoteKey = `${remote.tasklistId}:${remote.id}`;
        const existing = getCurrentLocalRecord(
          localIndex.taskRemote.get(remoteKey)
          || takeSignatureMatch(localIndex.taskSignature, buildTaskSignatureFromRemote(remote))
        );

        if (!existing) {
          syncStats.remoteTasksCreated += 1;
          upsertLocalRecord(createLocalRecordFromRemoteTask(remote, syncStamp));
          continue;
        }

        const meta = existing.sync?.google?.task || {};
        const localSignature = buildTaskSignatureFromRecord(existing);
        const remoteSignature = buildTaskSignatureFromRemote(remote);
        const localDirty = localSignature !== text(meta.lastSignature);
        const remoteDirty = text(meta.remoteUpdatedAt) !== text(remote.updatedAt);

        if (!text(meta.remoteId) && localSignature === remoteSignature) {
          syncStats.remoteTasksBound += 1;
          upsertLocalRecord(bindTaskSyncOnly(existing, remote, syncStamp));
          continue;
        }

        if (!localDirty || localSignature === remoteSignature || (remoteDirty && parseTimestamp(remote.updatedAt) >= parseTimestamp(existing.updatedAt))) {
          syncStats.remoteTasksUpdated += 1;
          upsertLocalRecord(applyRemoteTaskToRecord(existing, remote, syncStamp));
          continue;
        }

        // Keep the local edit dirty until it is pushed back to Google.
        // Updating sync metadata here would incorrectly mark the record as already synced.
        continue;
      }

      if (tasksEnabled && selectedTasklist) {
        localRecords.forEach((record) => {
          const taskMeta = record.sync?.google?.task || {};
          if (!record.task?.enabled || !text(taskMeta.remoteId) || text(taskMeta.tasklistId) !== selectedTasklist.id) {
            return;
          }
          if (remoteTaskMap.has(`${selectedTasklist.id}:${taskMeta.remoteId}`)) {
            return;
          }

          const next = clone(record);
          next.task = {
            enabled: false,
            status: 'open',
            priority: 'medium',
            syncSchedule: false,
            dueDate: '',
            completedAt: null,
            startTime: '',
            endTime: '',
            repeat: { enabled: false, frequency: 'weekly', interval: 1, weekdays: [], until: '' }
          };
          clearTaskSyncMeta(next);
          syncStats.remoteTasksRemoved += 1;
          upsertLocalRecord(next);
        });
      }

      syncStats.localRecordChanges = changedById.size;
      annotateSyncStage('remote-merged', {
        remoteCalendarsCreated: syncStats.remoteCalendarsCreated,
        remoteCalendarsUpdated: syncStats.remoteCalendarsUpdated,
        remoteCalendarsBound: syncStats.remoteCalendarsBound,
        remoteTasksCreated: syncStats.remoteTasksCreated,
        remoteTasksUpdated: syncStats.remoteTasksUpdated,
        remoteTasksBound: syncStats.remoteTasksBound,
        remoteTasksRemoved: syncStats.remoteTasksRemoved,
        localRecordChanges: syncStats.localRecordChanges
      });

      if (calendarEnabled && selectedCalendar?.writable) {
        const claimedCalendarRemoteKeys = collectClaimedRemoteKeys(localRecords, 'calendar');
        const availableCalendarMatches = buildRemoteSignatureIndex(
          remoteCalendars,
          buildScheduleSignatureFromRemote,
          getCalendarRemoteKey,
          claimedCalendarRemoteKeys
        );
        annotateSyncStage('push-local-calendars', {
          selectedCalendarId: text(selectedCalendar?.id),
          localRecordChanges: syncStats.localRecordChanges
        });
        for (const record of localRecords) {
          if (!record.schedule?.enabled || !record.schedule?.date) continue;

          let next = clone(record);
          const currentMeta = next.sync?.google?.calendar || {};

          if (text(currentMeta.remoteId) && text(currentMeta.calendarId) && text(currentMeta.calendarId) !== text(selectedCalendar.id)) {
            if (!currentMeta.readOnly) {
              try {
                await deleteCalendarEvent(accessToken, currentMeta.calendarId, currentMeta.remoteId);
              } catch (error) {
                if (error?.status !== 404) {
                  throw error;
                }
              }
            }
            next = clearCalendarSyncMeta(next);
          }

          const meta = next.sync?.google?.calendar || {};
          const localDirty = isScheduleLocalDirty(next);
          if (!text(meta.remoteId)) {
            const rebound = takeRemoteSignatureMatch(
              availableCalendarMatches,
              buildScheduleSignatureFromRecord(next),
              getCalendarRemoteKey,
              claimedCalendarRemoteKeys
            );
            if (rebound) {
              syncStats.pushedCalendarRebinds += 1;
              next = bindCalendarSyncOnly(next, rebound, syncStamp);
              upsertLocalRecord(next);
              continue;
            }
            const created = await createCalendarEvent(accessToken, selectedCalendar.id, buildCalendarPayload(next));
            const normalized = normalizeRemoteCalendarEvent(created, selectedCalendar);
            if (normalized) {
              syncStats.pushedCalendarCreates += 1;
              claimedCalendarRemoteKeys.add(getCalendarRemoteKey(normalized));
              remoteCalendarMap.set(getCalendarRemoteKey(normalized), normalized);
              next = applyRemoteCalendarToRecord(next, normalized, syncStamp);
              upsertLocalRecord(next);
            }
            continue;
          }

          if (!localDirty) continue;

          try {
            const updated = await updateCalendarEvent(
              accessToken,
              text(meta.calendarId, selectedCalendar.id),
              meta.remoteId,
              buildCalendarPayload(next)
            );
            const normalized = normalizeRemoteCalendarEvent(updated, selectedCalendar);
            if (normalized) {
              syncStats.pushedCalendarUpdates += 1;
              remoteCalendarMap.set(getCalendarRemoteKey(normalized), normalized);
              next = applyRemoteCalendarToRecord(next, normalized, syncStamp);
              upsertLocalRecord(next);
            }
          } catch (error) {
            if (error?.status !== 404) {
              throw error;
            }
            next = clearCalendarSyncMeta(next);
            const rebound = takeRemoteSignatureMatch(
              availableCalendarMatches,
              buildScheduleSignatureFromRecord(next),
              getCalendarRemoteKey,
              claimedCalendarRemoteKeys
            );
            if (rebound) {
              syncStats.pushedCalendarRebinds += 1;
              next = bindCalendarSyncOnly(next, rebound, syncStamp);
              upsertLocalRecord(next);
              continue;
            }
            const created = await createCalendarEvent(accessToken, selectedCalendar.id, buildCalendarPayload(next));
            const normalized = normalizeRemoteCalendarEvent(created, selectedCalendar);
            if (normalized) {
              syncStats.pushedCalendarCreates += 1;
              claimedCalendarRemoteKeys.add(getCalendarRemoteKey(normalized));
              remoteCalendarMap.set(getCalendarRemoteKey(normalized), normalized);
              next = applyRemoteCalendarToRecord(next, normalized, syncStamp);
              upsertLocalRecord(next);
            }
          }
        }
      }

      if (tasksEnabled && selectedTasklist?.writable) {
        const claimedTaskRemoteKeys = collectClaimedRemoteKeys(localRecords, 'task');
        const availableTaskMatches = buildRemoteSignatureIndex(
          remoteTasks,
          buildTaskSignatureFromRemote,
          getTaskRemoteKey,
          claimedTaskRemoteKeys
        );
        annotateSyncStage('push-local-tasks', {
          selectedTasklistId: text(selectedTasklist?.id),
          localRecordChanges: syncStats.localRecordChanges
        });
        for (const record of localRecords) {
          if (!record.task?.enabled) continue;

          let next = clone(record);
          const currentMeta = next.sync?.google?.task || {};

          if (text(currentMeta.remoteId) && text(currentMeta.tasklistId) && text(currentMeta.tasklistId) !== text(selectedTasklist.id)) {
            try {
              await deleteTask(accessToken, currentMeta.tasklistId, currentMeta.remoteId);
            } catch (error) {
              if (error?.status !== 404) {
                throw error;
              }
            }
            next = clearTaskSyncMeta(next);
          }

          const meta = next.sync?.google?.task || {};
          const localDirty = isTaskLocalDirty(next);
          if (!text(meta.remoteId)) {
            const rebound = takeRemoteSignatureMatch(
              availableTaskMatches,
              buildTaskSignatureFromRecord(next),
              getTaskRemoteKey,
              claimedTaskRemoteKeys
            );
            if (rebound) {
              syncStats.pushedTaskRebinds += 1;
              next = bindTaskSyncOnly(next, rebound, syncStamp);
              upsertLocalRecord(next);
              continue;
            }
            const created = await createTask(accessToken, selectedTasklist.id, buildTaskPayload(next));
            const normalized = normalizeRemoteTask(created, selectedTasklist);
            if (normalized) {
              syncStats.pushedTaskCreates += 1;
              claimedTaskRemoteKeys.add(getTaskRemoteKey(normalized));
              remoteTaskMap.set(getTaskRemoteKey(normalized), normalized);
              next = applyRemoteTaskToRecord(next, normalized, syncStamp);
              upsertLocalRecord(next);
            }
            continue;
          }

          if (!localDirty) continue;

          try {
            const updated = await updateTask(
              accessToken,
              text(meta.tasklistId, selectedTasklist.id),
              meta.remoteId,
              buildTaskPayload(next)
            );
            const normalized = normalizeRemoteTask(updated, selectedTasklist);
            if (normalized) {
              syncStats.pushedTaskUpdates += 1;
              remoteTaskMap.set(getTaskRemoteKey(normalized), normalized);
              next = applyRemoteTaskToRecord(next, normalized, syncStamp);
              upsertLocalRecord(next);
            }
          } catch (error) {
            if (error?.status !== 404) {
              throw error;
            }
            next = clearTaskSyncMeta(next);
            const rebound = takeRemoteSignatureMatch(
              availableTaskMatches,
              buildTaskSignatureFromRecord(next),
              getTaskRemoteKey,
              claimedTaskRemoteKeys
            );
            if (rebound) {
              syncStats.pushedTaskRebinds += 1;
              next = bindTaskSyncOnly(next, rebound, syncStamp);
              upsertLocalRecord(next);
              continue;
            }
            const created = await createTask(accessToken, selectedTasklist.id, buildTaskPayload(next));
            const normalized = normalizeRemoteTask(created, selectedTasklist);
            if (normalized) {
              syncStats.pushedTaskCreates += 1;
              claimedTaskRemoteKeys.add(getTaskRemoteKey(normalized));
              remoteTaskMap.set(getTaskRemoteKey(normalized), normalized);
              next = applyRemoteTaskToRecord(next, normalized, syncStamp);
              upsertLocalRecord(next);
            }
          }
        }
      }

      if (changedById.size) {
        await LS.Records.saveMany([...changedById.values()]);
      }
      syncStats.localRecordChanges = changedById.size;

      nextCache.events = [...remoteCalendarMap.values()].sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.title.localeCompare(b.title, 'ko');
      });
      nextCache.tasks = [...remoteTaskMap.values()].sort((a, b) => {
        if ((a.status === 'done') !== (b.status === 'done')) {
          return a.status === 'done' ? 1 : -1;
        }
        if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return a.title.localeCompare(b.title, 'ko');
      });

      cacheState = normalizeCache(nextCache);
      persistCacheState();
      annotateSyncStage('success', {
        calendarCount: nextCache.events.length,
        taskCount: nextCache.tasks.length,
        selectedCalendarId: text(nextCache.selectedCalendarId),
        selectedTasklistId: text(nextCache.selectedTasklistId),
        remainingDeleteQueue: syncStats.remainingDeleteQueue,
        remoteCalendarsCreated: syncStats.remoteCalendarsCreated,
        remoteCalendarsUpdated: syncStats.remoteCalendarsUpdated,
        remoteCalendarsBound: syncStats.remoteCalendarsBound,
        remoteTasksCreated: syncStats.remoteTasksCreated,
        remoteTasksUpdated: syncStats.remoteTasksUpdated,
        remoteTasksBound: syncStats.remoteTasksBound,
        remoteTasksRemoved: syncStats.remoteTasksRemoved,
        pushedCalendarCreates: syncStats.pushedCalendarCreates,
        pushedCalendarUpdates: syncStats.pushedCalendarUpdates,
        pushedCalendarRebinds: syncStats.pushedCalendarRebinds,
        pushedTaskCreates: syncStats.pushedTaskCreates,
        pushedTaskUpdates: syncStats.pushedTaskUpdates,
        pushedTaskRebinds: syncStats.pushedTaskRebinds,
        localRecordChanges: syncStats.localRecordChanges
      });
      emitStatus();
      return buildStatus();
    } catch (error) {
      if (error?.status === 401) {
        clearAuthState();
        if (hasNativeBridgeConfigured()) {
          await refreshNativeBridgeStatus({
            emit: false,
            clearLocalAuthWhenDisconnected: true
          });
        }
      }
      cacheState = normalizeCache({
        ...cacheState,
        updatedAt: nowIso(),
        lastError: text(error?.message, 'Google 동기화 중 오류가 발생했습니다.')
      });
      persistCacheState();
      annotateSyncStage('error', {
        message: text(error?.message, 'Google 동기화 중 오류가 발생했습니다.'),
        status: Number(error?.status || 0),
        stack: text(error?.stack),
        remoteCalendarsCreated: syncStats.remoteCalendarsCreated,
        remoteCalendarsUpdated: syncStats.remoteCalendarsUpdated,
        remoteTasksCreated: syncStats.remoteTasksCreated,
        remoteTasksUpdated: syncStats.remoteTasksUpdated,
        pushedCalendarCreates: syncStats.pushedCalendarCreates,
        pushedCalendarUpdates: syncStats.pushedCalendarUpdates,
        pushedTaskCreates: syncStats.pushedTaskCreates,
        pushedTaskUpdates: syncStats.pushedTaskUpdates,
        localRecordChanges: syncStats.localRecordChanges
      });
      emitStatus();
      if (options.silent) {
        return buildStatus();
      }
      throw error;
    }
  }

  function getBoundRemoteCalendarKeys() {
    try {
      if (typeof LS.Records?.listSchedules !== 'function') {
        return new Set();
      }
      return new Set(
        LS.Records.listSchedules({ includeArchived: true })
          .map((record) => {
            const meta = record?.sync?.google?.calendar || {};
            if (!record?.schedule?.enabled || !text(meta.remoteId)) return '';
            return `${text(meta.calendarId)}:${text(meta.remoteId)}`;
          })
          .filter(Boolean)
      );
    } catch {
      return new Set();
    }
  }

  function getBoundRemoteTaskKeys() {
    try {
      if (typeof LS.Records?.listTasks !== 'function') {
        return new Set();
      }
      return new Set(
        LS.Records.listTasks({ includeArchived: true })
          .map((record) => {
            const meta = record?.sync?.google?.task || {};
            if (!record?.task?.enabled || !text(meta.remoteId)) return '';
            return `${text(meta.tasklistId)}:${text(meta.remoteId)}`;
          })
          .filter(Boolean)
      );
    } catch {
      return new Set();
    }
  }

  function toGoogleCalendarEntry(item) {
    return {
      id: `google:${text(item.calendarId)}:${text(item.id)}`,
      source: 'google',
      name: text(item.title, 'Google 일정'),
      description: text(item.description),
      color: '',
      date: text(item.date),
      startTime: item.allDay ? '' : text(item.startTime),
      endTime: item.allDay ? '' : text(item.endTime),
      allDay: Boolean(item.allDay),
      link: text(item.link)
    };
  }

  LS.GoogleWorkspace = {
    async init() {
      loadPersistedState();
      await refreshNativeBridgeStatus({
        emit: false,
        clearLocalAuthWhenDisconnected: true
      });
      emitStatus();
      return buildStatus();
    },

    async refreshStatus(options = {}) {
      loadPersistedState();
      await refreshNativeBridgeStatus({
        emit: options.emit !== false,
        clearLocalAuthWhenDisconnected: true,
        timeout: options.timeout || 3200
      });
      return buildStatus();
    },

    getStatus() {
      if (!hasNativeBridgeConfigured()) {
        loadPersistedState();
      }
      return buildStatus();
    },

    getCachedDiagnostics() {
      if (!hasNativeBridgeConfigured()) {
        loadPersistedState();
      }
      return buildDiagnostics();
    },

    async getDiagnostics(options = {}) {
      if (options.refresh !== false) {
        await refreshNativeBridgeStatus({
          emit: false,
          clearLocalAuthWhenDisconnected: true,
          timeout: options.timeout || 3200
        });
      }
      const bridgeHealth = await probeBridgeHealth();
      return buildDiagnostics({
        bridgeStoragePath: text(bridgeHealth?.storage_path)
      });
    },

    supportsInteractiveAuth() {
      return hasNativeBridgeConfigured() || isInteractiveRuntime();
    },

    async connect(options = {}) {
      return syncGoogleData({ interactive: options.interactive !== false });
    },

    async sync(options = {}) {
      return syncGoogleData({
        interactive: Boolean(options.interactive),
        silent: Boolean(options.silent)
      });
    },

    async testConnection(options = {}) {
      return testGoogleConnection(options);
    },

    async inspectDuplicates() {
      return inspectGoogleDuplicateRecords();
    },

    async cleanupDuplicates() {
      return cleanupGoogleDuplicateRecords();
    },

    async disconnect() {
      if (hasNativeBridgeConfigured()) {
        try {
          const payload = await fetchJson(NATIVE_LOGOUT_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: '{}',
            timeout: 10000
          });
          updateNativeBridgeStatus(payload?.status, {
            emit: false,
            clearLocalAuthWhenDisconnected: true
          });
        } catch (error) {
          console.warn('[GoogleWorkspace] Native logout failed:', error);
        }
      } else {
        try {
          if (window.google?.accounts?.oauth2?.revoke && authState?.accessToken) {
            window.google.accounts.oauth2.revoke(authState.accessToken, () => {});
          }
        } catch {
          // noop
        }
      }

      authState = null;
      cacheState = createEmptyCache();
      persistAuthState();
      persistCacheState();
      emitStatus();
      return buildStatus();
    },

    getCalendarOptions() {
      loadPersistedState();
      return clone(cacheState.calendars);
    },

    getTasklistOptions() {
      loadPersistedState();
      return clone(cacheState.tasklists);
    },

    getCalendarEntries(dateStr = '') {
      loadPersistedState();
      const targetDate = text(dateStr);
      const boundKeys = getBoundRemoteCalendarKeys();
      return clone(
        cacheState.events
          .filter((item) => (!targetDate || text(item.date) === targetDate))
          .filter((item) => !boundKeys.has(`${text(item.calendarId)}:${text(item.id)}`))
          .map((item) => toGoogleCalendarEntry(item))
      );
    },

    getTasks() {
      loadPersistedState();
      const boundKeys = getBoundRemoteTaskKeys();
      return clone(
        cacheState.tasks.filter((item) => !boundKeys.has(`${text(item.tasklistId)}:${text(item.id)}`))
      );
    },

    async openLocalTarget(target, kind = 'file') {
      return openLocalTarget(target, kind);
    }
  };
  })();
