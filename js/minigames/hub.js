(function () {
  'use strict';

  const LS = window.LivelySam = window.LivelySam || {};
  const SELECTED_GAME_STORAGE_KEY = 'minigameSelectedGameId';
  const TAB_STORAGE_KEY = 'minigameActiveTab';
  const NICKNAME_STORAGE_KEY = 'minigameNickname';
  const LEGACY_NICKNAME_STORAGE_KEY = 'j_game_username';
  const NICKNAME_MAX_LENGTH = 12;

  const STATUS_ORDER = {
    ready: 0,
    prototype: 1,
    'coming-soon': 2
  };

  function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function text(value, fallback = '') {
    const normalized = String(value ?? '').trim();
    return normalized || fallback;
  }

  function asStringArray(value, limit = 8) {
    const values = Array.isArray(value) ? value : [value];
    return values
      .map((item) => text(item))
      .filter(Boolean)
      .slice(0, limit);
  }

  function escapeHtml(value) {
    if (LS.Helpers?.escapeHtml) {
      return LS.Helpers.escapeHtml(String(value ?? ''));
    }

    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeStatus(value) {
    const normalized = text(value, 'prototype').toLowerCase();
    if (normalized === 'ready' || normalized === 'prototype' || normalized === 'coming-soon') {
      return normalized;
    }
    return 'prototype';
  }

  function normalizeLaunchType(value) {
    return text(value, 'iframe').toLowerCase() === 'mount' ? 'mount' : 'iframe';
  }

  function normalizeHallOfFamePreview(value) {
    const rows = Array.isArray(value) ? value : [];
    return rows.slice(0, 10).map((row, index) => ({
      rank: Math.max(1, parseInt(row?.rank, 10) || index + 1),
      name: text(row?.name, `플레이어 ${index + 1}`),
      score: text(row?.score, '-'),
      meta: text(row?.meta)
    }));
  }

  function normalizeLeaderboardMode(value) {
    return text(value, 'all-scores').toLowerCase() === 'all-scores'
      ? 'all-scores'
      : 'personal-best';
  }

  function normalizeNickname(value) {
    return text(value).replace(/\s+/g, ' ').slice(0, NICKNAME_MAX_LENGTH);
  }

  function hasNickname(value) {
    return Boolean(normalizeNickname(value));
  }

  function normalizeGame(raw = {}) {
    const id = text(raw.id);
    if (!id) {
      throw new Error('미니게임 id가 필요합니다.');
    }

    return {
      id,
      seriesId: text(raw.seriesId, id),
      seriesTitle: text(raw.seriesTitle, text(raw.title, '미니게임')),
      seriesDescription: text(raw.seriesDescription),
      seriesIcon: text(raw.seriesIcon, text(raw.icon, '🕹️')),
      title: text(raw.title, '미니게임'),
      icon: text(raw.icon, '🦖'),
      description: text(raw.description, '설명이 아직 없습니다.'),
      status: normalizeStatus(raw.status),
      launchType: normalizeLaunchType(raw.launchType),
      entry: text(raw.entry),
      mount: typeof raw.mount === 'function' ? raw.mount : null,
      scoreLabel: text(raw.scoreLabel, '점수 규칙을 아직 정하지 않았습니다.'),
      rankingLabel: text(raw.rankingLabel, '명예의 전당이 준비되면 여기에 표시됩니다.'),
      ctaLabel: text(raw.ctaLabel),
      tags: asStringArray(raw.tags, 6),
      notes: asStringArray(raw.notes, 6),
      author: text(raw.author),
      version: text(raw.version),
      updatedAt: text(raw.updatedAt),
      leaderboardMode: normalizeLeaderboardMode(raw.leaderboardMode),
      hallNotice: text(raw.hallNotice),
      previewDisabled: raw.previewDisabled === true,
      hallOfFamePreview: normalizeHallOfFamePreview(raw.hallOfFamePreview)
    };
  }

  function copyGame(game) {
    if (!game) return null;

    return {
      ...game,
      tags: [...(game.tags || [])],
      notes: [...(game.notes || [])],
      hallOfFamePreview: clone(game.hallOfFamePreview || [])
    };
  }

  function canLaunch(game) {
    if (!game || game.status !== 'ready') return false;
    if (game.launchType === 'mount') {
      return typeof game.mount === 'function';
    }
    return Boolean(game.entry);
  }

  function canPreview(game) {
    return Boolean(game)
      && game.status === 'ready'
      && game.launchType === 'iframe'
      && Boolean(game.entry)
      && game.previewDisabled !== true;
  }

  function buildPreviewEntry(entry) {
    const url = text(entry);
    if (!url) return '';

    const hashIndex = url.indexOf('#');
    const base = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
    const hash = hashIndex >= 0 ? url.slice(hashIndex) : '';
    const separator = base.includes('?') ? '&' : '?';
    return `${base}${separator}preview=1${hash}`;
  }

  function getStatusMeta(status) {
    if (status === 'ready') {
      return { label: '바로 플레이', className: 'is-ready' };
    }
    if (status === 'coming-soon') {
      return { label: '준비 중', className: 'is-coming' };
    }
    return { label: '개발 중', className: 'is-prototype' };
  }

  function syncModalBodyState() {
    const settingsActive = document.getElementById('settings-modal')?.classList.contains('active');
    const promptActive = document.getElementById('prompt-modal')?.classList.contains('active');
    const minigameActive = document.getElementById('minigame-modal')?.classList.contains('active');

    document.body.classList.toggle('minigame-open', Boolean(minigameActive));
    document.body.classList.toggle('modal-open', Boolean(settingsActive || promptActive || minigameActive));
  }

  function shouldTrapGameplayKey(event) {
    if (!event) return false;
    if (event.ctrlKey || event.metaKey || event.altKey) return false;

    return [
      ' ',
      'Spacebar',
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'Enter'
    ].includes(event.key) || [
      'Space',
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'Enter'
    ].includes(event.code);
  }

  LS.MinigamesHub = {
    _initialized: false,
    _activeTab: 'games',
    _selectedGameId: '',
    _games: new Map(),
    _registrationCounter: 0,
    _hallCache: new Map(),
    _hallRequestSerialByGame: new Map(),
    _hallRefreshTimerByGame: new Map(),
    _runnerCleanup: null,

    init() {
      if (this._initialized) {
        this.render();
        return;
      }

      this._activeTab = text(LS.Storage?.get?.(TAB_STORAGE_KEY, 'games'), 'games');
      this._selectedGameId = text(LS.Storage?.get?.(SELECTED_GAME_STORAGE_KEY, ''), '');
      if (!['games', 'hall'].includes(this._activeTab)) {
        this._activeTab = 'games';
      }

      this._ensureDom();
      this._bindEvents();
      this.getNickname();
      this._initialized = true;
      this.render();
    },

    registerGame(rawGame) {
      const normalized = normalizeGame(rawGame);
      const previous = this._games.get(normalized.id);
      const game = {
        ...normalized,
        sortIndex: Number.isFinite(previous?.sortIndex) ? previous.sortIndex : this._registrationCounter++
      };
      this._games.set(game.id, game);

      if (!this._selectedGameId) {
        this._selectedGameId = game.id;
      }

      if (this._initialized) {
        this.render();
      }

      return copyGame(game);
    },

    unregisterGame(gameId) {
      const id = text(gameId);
      if (!id) return false;

      const deleted = this._games.delete(id);
      if (!deleted) return false;

      if (this._selectedGameId === id) {
        this._selectedGameId = this.getGames()[0]?.id || '';
      }

      if (this._initialized) {
        this.closeRunner();
        this.render();
      }

      return true;
    },

    getGames() {
      return Array.from(this._games.values())
        .sort((a, b) => {
          const statusGap = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
          if (statusGap !== 0) return statusGap;
          return (a.sortIndex ?? 0) - (b.sortIndex ?? 0);
        })
        .map((item) => copyGame(item));
    },

    getGameSeries() {
      const seriesMap = new Map();

      this.getGames().forEach((game) => {
        const seriesId = text(game.seriesId, game.id);
        const existing = seriesMap.get(seriesId);

        if (existing) {
          existing.games.push(game);
          return;
        }

        seriesMap.set(seriesId, {
          id: seriesId,
          title: text(game.seriesTitle, game.title),
          description: text(game.seriesDescription),
          icon: text(game.seriesIcon, game.icon),
          sortIndex: game.sortIndex ?? 0,
          games: [game]
        });
      });

      return Array.from(seriesMap.values())
        .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0))
        .map((series) => ({
          ...series,
          games: [...series.games].sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0))
        }));
    },

    getSelectedGame() {
      const games = this.getGames();
      if (!games.length) return null;

      const selected = games.find((game) => game.id === this._selectedGameId);
      return selected || games[0];
    },

    invalidateHallOfFameCache(gameId = '') {
      const targetGameId = text(gameId);
      if (targetGameId) {
        this._hallCache.delete(targetGameId);
        this._hallRequestSerialByGame.delete(targetGameId);
      } else {
        this._hallCache.clear();
        this._hallRequestSerialByGame.clear();
      }

      if (this._initialized) {
        this.render();
      }
    },

    refreshHallOfFame(gameId) {
      const targetGameId = text(gameId);
      if (!targetGameId) return;

      const state = this._hallCache.get(targetGameId) || {};
      this._hallCache.set(targetGameId, {
        loading: true,
        loaded: false,
        error: '',
        provider: text(state.provider, 'firebase'),
        entries: Array.isArray(state.entries) ? state.entries : []
      });

      if (this._initialized) {
        this._renderGamesPanel();
        if (this._activeTab === 'hall') {
          this._renderHallPanel();
        }
      }

      this._loadHallOfFame(targetGameId);
    },

    _scheduleHallRefresh(gameId, delayMs = 0) {
      const targetGameId = text(gameId);
      if (!targetGameId) return;

      const previousTimer = this._hallRefreshTimerByGame.get(targetGameId);
      if (previousTimer) {
        window.clearTimeout(previousTimer);
      }

      const timerId = window.setTimeout(() => {
        this._hallRefreshTimerByGame.delete(targetGameId);
        this.refreshHallOfFame(targetGameId);
      }, Math.max(0, delayMs));

      this._hallRefreshTimerByGame.set(targetGameId, timerId);
    },

    _mergeHallEntries(entries = [], gameId = '') {
      const leaderboardMode = normalizeLeaderboardMode(this._games.get(text(gameId))?.leaderboardMode);

      if (leaderboardMode === 'all-scores') {
        const merged = new Map();

        entries.forEach((entry, index) => {
          const normalized = {
            ...entry,
            entryId: text(entry?.entryId),
            playerId: text(entry?.playerId),
            nickname: text(entry?.nickname || entry?.name),
            name: text(entry?.nickname || entry?.name),
            score: Math.max(0, parseInt(entry?.score, 10) || 0),
            updatedAt: text(entry?.updatedAt),
            meta: text(entry?.meta),
            source: text(entry?.source, 'firebase')
          };

          if (!normalized.nickname && !normalized.entryId) return;

          const key = normalized.entryId || `fallback:${index}:${normalized.nickname}:${normalized.score}:${normalized.updatedAt}`;
          const current = merged.get(key);
          if (!current) {
            merged.set(key, normalized);
            return;
          }

          const currentScore = Math.max(0, parseInt(current?.score, 10) || 0);
          const nextScore = Math.max(0, parseInt(normalized?.score, 10) || 0);
          const useNext = nextScore > currentScore
            || (nextScore === currentScore && normalized.updatedAt.localeCompare(current.updatedAt) > 0);

          merged.set(key, useNext ? { ...current, ...normalized } : current);
        });

        return Array.from(merged.values())
          .sort((left, right) => {
            const scoreGap = (parseInt(right?.score, 10) || 0) - (parseInt(left?.score, 10) || 0);
            if (scoreGap !== 0) return scoreGap;
            return text(right?.updatedAt).localeCompare(text(left?.updatedAt));
          })
          .slice(0, 10)
          .map((entry, index) => ({
            ...entry,
            rank: index + 1
          }));
      }

      const merged = new Map();

      entries.forEach((entry) => {
        const nickname = text(entry?.nickname || entry?.name);
        const playerId = text(entry?.playerId);
        const key = playerId || (nickname ? `nickname:${nickname}` : '');
        if (!key) return;

        const normalized = {
          ...entry,
          playerId,
          nickname,
          name: nickname,
          score: Math.max(0, parseInt(entry?.score, 10) || 0),
          updatedAt: text(entry?.updatedAt),
          meta: text(entry?.meta),
          source: text(entry?.source, 'firebase')
        };

        const current = merged.get(key);
        if (!current) {
          merged.set(key, normalized);
          return;
        }

        const currentScore = Math.max(0, parseInt(current?.score, 10) || 0);
        const nextScore = Math.max(0, parseInt(normalized?.score, 10) || 0);
        const useNext = nextScore > currentScore
          || (nextScore === currentScore && normalized.updatedAt.localeCompare(current.updatedAt) > 0);

        merged.set(key, useNext ? { ...current, ...normalized } : current);
      });

      return Array.from(merged.values())
        .sort((left, right) => {
          const scoreGap = (parseInt(right?.score, 10) || 0) - (parseInt(left?.score, 10) || 0);
          if (scoreGap !== 0) return scoreGap;
          return text(right?.updatedAt).localeCompare(text(left?.updatedAt));
        })
        .slice(0, 10)
        .map((entry, index) => ({
          ...entry,
          rank: index + 1
        }));
    },

    _applySubmittedScore(detail = {}) {
      const gameId = text(detail.gameId);
      const leaderboardMode = normalizeLeaderboardMode(this._games.get(gameId)?.leaderboardMode);
      if (detail.accepted === false) return;
      const nickname = text(detail.nickname);
      const playerId = text(detail.playerId);
      const entryId = text(detail.entryId);
      const scoreSource = leaderboardMode === 'all-scores'
        ? (detail.submittedScore ?? detail.score ?? detail.personalBest)
        : (detail.personalBest ?? detail.score ?? detail.submittedScore);
      const score = Math.max(0, parseInt(scoreSource, 10) || 0);
      if (!gameId || !nickname) return;

      const currentState = this._hallCache.get(gameId) || {};
      const entries = Array.isArray(currentState.entries) ? [...currentState.entries] : [];

      if (leaderboardMode === 'all-scores') {
        const submittedAt = new Date().toISOString();
        const existingIndex = entryId
          ? entries.findIndex((entry) => text(entry?.entryId) === entryId)
          : -1;
        const nextEntry = {
          entryId: entryId || `local:${submittedAt}:${Math.random().toString(16).slice(2, 8)}`,
          playerId,
          nickname,
          name: nickname,
          score,
          updatedAt: submittedAt,
          meta: '방금 기록',
          source: 'firebase'
        };

        if (existingIndex >= 0) {
          entries.splice(existingIndex, 1, {
            ...entries[existingIndex],
            ...nextEntry
          });
        } else {
          entries.push(nextEntry);
        }

        this._hallCache.set(gameId, {
          loading: false,
          loaded: true,
          error: '',
          provider: text(currentState.provider, 'firebase'),
          entries: this._mergeHallEntries(entries, gameId)
        });

        if (this._initialized) {
          this._renderGamesPanel();
          if (this._activeTab === 'hall') {
            this._renderHallPanel();
          }
        }
        return;
      }

      const existingIndex = playerId
        ? entries.findIndex((entry) => text(entry?.playerId) === playerId)
        : entries.findIndex((entry) => text(entry?.nickname || entry?.name) === nickname);

      const submittedAt = new Date().toISOString();
      const nextEntry = {
        ...(existingIndex >= 0 ? entries[existingIndex] : {}),
        playerId,
        nickname,
        name: nickname,
        score,
        updatedAt: submittedAt,
        meta: '방금 갱신',
        source: 'firebase'
      };

      if (existingIndex >= 0) {
        const previousScore = parseInt(entries[existingIndex]?.score, 10) || 0;
        nextEntry.score = Math.max(previousScore, score);
        entries.splice(existingIndex, 1, nextEntry);
      } else {
        entries.push(nextEntry);
      }

      this._hallCache.set(gameId, {
        loading: false,
        loaded: true,
        error: '',
        provider: text(currentState.provider, 'firebase'),
        entries: this._mergeHallEntries(entries, gameId)
      });

      if (this._initialized) {
        this._renderGamesPanel();
        if (this._activeTab === 'hall') {
          this._renderHallPanel();
        }
      }
    },

    getNickname() {
      const stored = normalizeNickname(LS.Storage?.get?.(NICKNAME_STORAGE_KEY, ''));
      let localCurrent = '';
      let legacy = '';

      try {
        localCurrent = normalizeNickname(localStorage.getItem(NICKNAME_STORAGE_KEY));
      } catch {
        localCurrent = '';
      }

      try {
        legacy = normalizeNickname(localStorage.getItem(LEGACY_NICKNAME_STORAGE_KEY));
      } catch {
        legacy = '';
      }

      const nickname = stored || localCurrent || legacy;
      if (nickname && (nickname !== stored || nickname !== localCurrent || nickname !== legacy)) {
        this._persistNickname(nickname);
      }

      return nickname;
    },

    setNickname(value) {
      const nickname = normalizeNickname(value);
      if (!nickname) return '';

      this._persistNickname(nickname);
      if (this._initialized) {
        this.render();
      }

      return nickname;
    },

    async ensureNickname(options = {}) {
      const force = options?.force === true;
      const current = this.getNickname();
      if (hasNickname(current) && !force) {
        return current;
      }

      const result = await LS.Helpers?.promptModal?.('미니게임 닉네임', [
        {
          id: 'nickname',
          type: 'text',
          label: '닉네임',
          value: current,
          placeholder: '예: 공룡쌤',
          help: `명예의 전당 등재용 이름입니다. 나중에 다시 바꾸실 수 있고, ${NICKNAME_MAX_LENGTH}자 이하로 저장됩니다.`
        }
      ], {
        message: '게임 기록이 올라가면 이 닉네임으로 저장됩니다.',
        confirmText: '저장'
      });

      syncModalBodyState();
      if (!result) return '';

      const nickname = normalizeNickname(result.nickname);
      if (!hasNickname(nickname)) {
        LS.Helpers?.showToast?.('명예의 전당에 표시할 닉네임을 입력해 주세요.', 'warning', 2400);
        return this.ensureNickname({ force: true });
      }

      this.setNickname(nickname);
      LS.Helpers?.showToast?.('미니게임 닉네임을 저장했습니다.', 'success', 2200);
      return nickname;
    },

    open(options = {}) {
      this.init();

      const requestedTab = text(options.tab, 'games');
      const requestedGameId = text(options.gameId);
      this._activeTab = ['games', 'hall'].includes(requestedTab) ? requestedTab : 'games';

      if (requestedGameId && this._games.has(requestedGameId)) {
        this._selectedGameId = requestedGameId;
      }

      const modal = document.getElementById('minigame-modal');
      if (!modal) return;

      this.render();
      this.getGames().forEach((game) => this._scheduleHallRefresh(game.id, 0));
      modal.classList.add('active');
      syncModalBodyState();
      document.getElementById('minigame-close-btn')?.focus();
    },

    close() {
      const modal = document.getElementById('minigame-modal');
      if (!modal) return;

      this.closeRunner();
      modal.classList.remove('active');
      syncModalBodyState();
    },

    closeRunner(options = {}) {
      const shouldRefreshHall = options?.refreshHall !== false;
      const runner = document.getElementById('minigame-runner');
      const runnerBody = document.getElementById('minigame-runner-body');
      const runnerTitle = document.getElementById('minigame-runner-title');
      if (!runner || !runnerBody || !runnerTitle) return;

      if (typeof this._runnerCleanup === 'function') {
        try {
          this._runnerCleanup();
        } catch (error) {
          console.warn('[Minigames] runner cleanup failed:', error);
        }
      }

      this._runnerCleanup = null;
      runner.hidden = true;
      runnerBody.innerHTML = '';
      runnerTitle.textContent = '미니게임 실행';

      if (shouldRefreshHall) {
        const activeGameId = text(this._selectedGameId);
        if (activeGameId) {
          this._scheduleHallRefresh(activeGameId, 600);
        }
        if (this._initialized) {
          this.render();
        }
      }
    },

    _focusRunnerFrame(iframe) {
      if (!iframe) return;

      const focusFrame = () => {
        if (!iframe.isConnected) return;

        try {
          iframe.focus({ preventScroll: true });
        } catch {
          try {
            iframe.focus();
          } catch {
            // ignore focus failures
          }
        }

        try {
          const frameWindow = iframe.contentWindow;
          const frameDocument = iframe.contentDocument || frameWindow?.document;
          frameWindow?.focus?.();

          if (frameDocument?.body) {
            frameDocument.body.tabIndex = -1;
            frameDocument.body.focus({ preventScroll: true });
          } else {
            frameDocument?.documentElement?.focus?.();
          }
        } catch {
          // ignore cross-context focus failures
        }
      };

      requestAnimationFrame(focusFrame);
      window.setTimeout(focusFrame, 120);
      window.setTimeout(focusFrame, 320);
    },

    _forwardKeyboardToRunner(event) {
      const runner = document.getElementById('minigame-runner');
      if (!runner || runner.hidden) return false;

      const iframe = document.querySelector('#minigame-runner-body .minigame-runner-frame');
      if (!iframe) return false;

      const tagName = String(event?.target?.tagName || '').toUpperCase();
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName)) return false;

      try {
        const frameWindow = iframe.contentWindow;
        const frameDocument = iframe.contentDocument || frameWindow?.document;
        if (!frameWindow || !frameDocument) return false;

        const target = frameDocument.activeElement && frameDocument.activeElement !== frameDocument.body
          ? frameDocument.activeElement
          : (frameDocument.body || frameDocument.documentElement);
        if (!target) return false;

        const forwardedEvent = new KeyboardEvent(event.type, {
          key: event.key,
          code: event.code,
          location: event.location,
          repeat: event.repeat,
          ctrlKey: event.ctrlKey,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
          metaKey: event.metaKey,
          bubbles: true,
          cancelable: true,
          composed: true
        });

        this._focusRunnerFrame(iframe);
        target.dispatchEvent(forwardedEvent);
        return true;
      } catch {
        return false;
      }
    },

    render() {
      if (!this._initialized) return;

      const games = this.getGames();
      if (!games.find((game) => game.id === this._selectedGameId)) {
        this._selectedGameId = games[0]?.id || '';
      }

      LS.Storage?.set?.(SELECTED_GAME_STORAGE_KEY, this._selectedGameId);
      LS.Storage?.set?.(TAB_STORAGE_KEY, this._activeTab);

      this._renderProfileSummary();
      this._renderGamesPanel();
      this._renderHallPanel();
      this._syncTabState();
    },

    selectGame(gameId) {
      const id = text(gameId);
      if (!id || !this._games.has(id)) return;

      this._selectedGameId = id;
      this.render();
    },

    setActiveTab(tabId) {
      if (!['games', 'hall'].includes(tabId)) return;
      this._activeTab = tabId;
      if (tabId === 'hall') {
        this.render();
        this.getGames().forEach((game) => this._scheduleHallRefresh(game.id, 0));
        return;
      }
      this.render();
    },

    async launchSelectedGame() {
      await this.launchGame(this._selectedGameId);
    },

    async launchGame(gameId = '') {
      const targetId = text(gameId, this._selectedGameId);
      if (targetId && this._games.has(targetId)) {
        this._selectedGameId = targetId;
      }

      const game = this.getSelectedGame();
      if (!game) {
        LS.Helpers?.showToast?.('등록된 미니게임이 아직 없습니다.', 'info', 2200);
        return;
      }

      if (!canLaunch(game)) {
        LS.Helpers?.showToast?.('이 게임은 아직 실행 준비 중입니다.', 'warning', 2600);
        return;
      }

      const nickname = await this.ensureNickname();
      if (!hasNickname(nickname)) {
        return;
      }

      this._launchGame(game, nickname);
    },

    _launchGame(game, nickname = '') {
      const runner = document.getElementById('minigame-runner');
      const runnerTitle = document.getElementById('minigame-runner-title');
      const runnerBody = document.getElementById('minigame-runner-body');
      if (!runner || !runnerTitle || !runnerBody) return;

      const resolvedNickname = hasNickname(nickname) ? normalizeNickname(nickname) : this.getNickname();
      if (resolvedNickname) {
        this._persistNickname(resolvedNickname);
      }

      this.closeRunner({ refreshHall: false });

      runnerTitle.textContent = game.title;
      runner.hidden = false;

      if (game.launchType === 'mount' && typeof game.mount === 'function') {
        const maybeCleanup = game.mount(runnerBody, {
          game,
          close: () => this.closeRunner(),
          nickname: resolvedNickname,
          storage: LS.Storage,
          helpers: LS.Helpers
        });

        if (typeof maybeCleanup === 'function') {
          this._runnerCleanup = maybeCleanup;
        }
        return;
      }

      const iframe = document.createElement('iframe');
      iframe.className = 'minigame-runner-frame';
      iframe.src = game.entry;
      iframe.title = `${game.title} 실행 화면`;
      iframe.tabIndex = 0;
      iframe.setAttribute('loading', 'eager');
      iframe.addEventListener('load', () => {
        this._focusRunnerFrame(iframe);
      }, { once: true });
      runnerBody.appendChild(iframe);
      this._focusRunnerFrame(iframe);
    },

    _ensureDom() {
      if (document.getElementById('minigame-modal')) {
        return;
      }

      const modal = document.createElement('div');
      modal.id = 'minigame-modal';
      modal.className = 'minigame-modal-overlay';
      modal.innerHTML = `
        <div class="minigame-shell" role="dialog" aria-modal="true" aria-labelledby="minigame-title">
          <div class="minigame-header">
            <div class="minigame-header-copy">
              <div class="minigame-header-icon" aria-hidden="true">🦖</div>
              <div>
                <div class="minigame-eyebrow">Quick Play</div>
                <h2 id="minigame-title">미니게임</h2>
                <p class="minigame-header-desc">썸네일을 보고 바로 플레이하고, 기록은 바로 아래에서 확인하실 수 있습니다.</p>
              </div>
            </div>
            <div class="minigame-header-side">
              <div id="minigame-profile-summary" class="minigame-profile-summary"></div>
              <div class="minigame-tabbar" role="tablist" aria-label="미니게임 섹션">
                <button type="button" class="minigame-tab-btn" data-minigame-tab="games">둘러보기</button>
                <button type="button" class="minigame-tab-btn" data-minigame-tab="hall">명예의 전당</button>
              </div>
            </div>
            <button type="button" id="minigame-close-btn" class="minigame-close-btn" aria-label="미니게임 닫기">✕</button>
          </div>

          <div class="minigame-layout">
            <div class="minigame-content">
              <section class="minigame-panel" data-minigame-panel="games">
                <div id="minigame-gallery" class="minigame-gallery"></div>
              </section>

              <section class="minigame-panel" data-minigame-panel="hall">
                <div id="minigame-hall" class="minigame-hall"></div>
              </section>
            </div>
          </div>

          <div id="minigame-runner" class="minigame-runner" hidden>
            <div class="minigame-runner-head">
              <div id="minigame-runner-title" class="minigame-runner-title">미니게임 실행</div>
              <div class="minigame-runner-actions">
                <button type="button" id="minigame-runner-close-btn" class="minigame-runner-btn is-primary">닫기</button>
              </div>
            </div>
            <div id="minigame-runner-body" class="minigame-runner-body"></div>
          </div>
        </div>
      `;

      document.body.appendChild(modal);
    },

    _bindEvents() {
      const modal = document.getElementById('minigame-modal');
      if (!modal || modal.dataset.bound === '1') return;

      modal.dataset.bound = '1';

      window.addEventListener('livelysam:minigameScoreSubmitted', (event) => {
        const detail = event?.detail || {};
        const gameId = text(detail.gameId);
        if (!gameId) return;
        this._applySubmittedScore(detail);
        this._scheduleHallRefresh(gameId, 900);
      });

      modal.addEventListener('click', (event) => {
        if (event.target === modal) {
          this.close();
          return;
        }

        const tabButton = event.target.closest('[data-minigame-tab]');
        if (tabButton) {
          this.setActiveTab(tabButton.dataset.minigameTab);
          return;
        }

        const playButton = event.target.closest('[data-minigame-play-game]');
        if (playButton) {
          this.launchGame(playButton.dataset.minigamePlayGame);
          return;
        }

        if (event.target.closest('[data-minigame-edit-nickname]')) {
          this.ensureNickname({ force: true });
          return;
        }

        if (event.target.closest('#minigame-close-btn')) {
          this.close();
          return;
        }

        if (event.target.closest('#minigame-runner-close-btn')) {
          this.closeRunner();
        }
      });

      modal.addEventListener('keydown', (event) => {
        const card = event.target.closest('[data-minigame-play-game][role="button"]');
        if (!card) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        this.launchGame(card.dataset.minigamePlayGame);
      });

      document.addEventListener('keydown', (event) => {
        const isActive = modal.classList.contains('active');
        if (!isActive) return;

        if (event.key === 'Escape') {
          event.preventDefault();
          const runner = document.getElementById('minigame-runner');
          if (runner && !runner.hidden) {
            this.closeRunner();
            return;
          }
          this.close();
          return;
        }

        if (this._forwardKeyboardToRunner(event) && shouldTrapGameplayKey(event)) {
          event.preventDefault();
        }
      });

      document.addEventListener('keyup', (event) => {
        const isActive = modal.classList.contains('active');
        if (!isActive) return;
        if (event.key === 'Escape') return;

        if (this._forwardKeyboardToRunner(event) && shouldTrapGameplayKey(event)) {
          event.preventDefault();
        }
      });
    },

    _renderProfileSummary() {
      const target = document.getElementById('minigame-profile-summary');
      if (!target) return;

      const nickname = this.getNickname();
      target.innerHTML = `
        <div class="minigame-profile-card ${hasNickname(nickname) ? '' : 'is-empty'}">
          <div class="minigame-profile-copy">
            <div class="minigame-profile-label">닉네임</div>
            <div class="minigame-profile-name">${hasNickname(nickname) ? escapeHtml(nickname) : '아직 닉네임이 없습니다.'}</div>
            <div class="minigame-profile-help">명예의 전당에는 이 이름으로 기록됩니다.</div>
          </div>
          <button type="button" class="minigame-inline-btn" data-minigame-edit-nickname>
            ${hasNickname(nickname) ? '수정' : '입력'}
          </button>
        </div>
      `;
    },

    _renderGamePreview(game) {
      if (canPreview(game)) {
        return `
          <iframe
            class="minigame-gallery-frame"
            src="${escapeHtml(buildPreviewEntry(game.entry))}"
            title="${escapeHtml(game.title)} 썸네일"
            loading="lazy"
            tabindex="-1"
            aria-hidden="true"></iframe>
        `;
      }

      const status = getStatusMeta(game.status);
      return `
        <div class="minigame-gallery-static">
          <div class="minigame-gallery-static-icon" aria-hidden="true">${escapeHtml(game.icon)}</div>
          <div class="minigame-gallery-static-title">${escapeHtml(game.title)}</div>
          <div class="minigame-gallery-static-text">${escapeHtml(status.label)}</div>
        </div>
      `;
    },

    _renderCompactHallRows(rows, emptyTitle) {
      const items = Array.isArray(rows) ? rows.filter(Boolean).slice(0, 3) : [];
      if (!items.length) {
        return `
          <div class="minigame-mini-hall-empty">
            <strong>${escapeHtml(emptyTitle)}</strong>
            <span>아직 등록된 기록이 없습니다.</span>
          </div>
        `;
      }

      return items.map((row) => `
        <div class="minigame-mini-hall-row">
          <div class="minigame-mini-hall-rank">${escapeHtml(String(row.rank))}</div>
          <div class="minigame-mini-hall-player">
            <strong>${escapeHtml(row.nickname || row.name || '플레이어')}</strong>
            <span>${escapeHtml(row.meta || row.updatedAt || '기록')}</span>
          </div>
          <div class="minigame-mini-hall-score">${escapeHtml(String(row.score ?? '-'))}</div>
        </div>
      `).join('');
    },

    _buildGalleryHallContent(game) {
      const hallState = this._hallCache.get(game.id) || {};
      const previewRows = Array.isArray(hallState.entries) && hallState.entries.length
        ? hallState.entries.slice(0, 3)
        : game.hallOfFamePreview.slice(0, 3);

      return `
        <div class="minigame-gallery-hall-head">
          <span>명예의 전당</span>
          <span>Top 3</span>
        </div>
        ${hallState.loading ? '<p class="minigame-gallery-hall-loading">기록을 불러오는 중입니다.</p>' : ''}
        ${hallState.error ? `<p class="minigame-gallery-hall-loading">${escapeHtml(hallState.error)}</p>` : ''}
        ${this._renderCompactHallRows(previewRows, `${game.title} 명예의 전당 준비 중`)}
      `;
    },

    _refreshGameCardHall(gameId) {
      const game = this._games.get(gameId);
      if (!game) return;

      const target = document.querySelector(`[data-minigame-card-hall-content="${gameId}"]`);
      if (!target) return;

      target.innerHTML = this._buildGalleryHallContent(game);
    },

    _renderSeriesHeader(series) {
      const description = text(series?.description);

      return `
        <div class="minigame-series-head">
          <div class="minigame-series-copy">
            <div class="minigame-series-icon" aria-hidden="true">${escapeHtml(series?.icon || '🕹️')}</div>
            <div class="minigame-series-title-wrap">
              <div class="minigame-series-eyebrow">Series</div>
              <div class="minigame-series-title">${escapeHtml(series?.title || 'Minigame')}</div>
              ${description ? `<p class="minigame-series-text">${escapeHtml(description)}</p>` : ''}
            </div>
          </div>
        </div>
      `;
    },

    _renderGameGalleryCard(game) {
      const status = getStatusMeta(game.status);
      const playable = canLaunch(game);

      return `
        <article
          class="minigame-gallery-card ${game.id === this._selectedGameId ? 'is-selected' : ''} ${playable ? 'is-playable' : 'is-disabled'}"
          data-minigame-play-game="${escapeHtml(game.id)}"
          role="button"
          tabindex="${playable ? '0' : '-1'}"
          aria-label="${escapeHtml(game.title)} ${playable ? '게임 시작' : '준비 중'}">
          <div class="minigame-gallery-preview ${canPreview(game) ? 'has-frame' : 'is-static'}">
            ${this._renderGamePreview(game)}
            <div class="minigame-gallery-preview-top">
              <span class="minigame-status-chip ${status.className}">${escapeHtml(status.label)}</span>
              <span class="minigame-gallery-preview-icon" aria-hidden="true">${escapeHtml(game.icon)}</span>
            </div>
            <div class="minigame-gallery-preview-bottom">
              <div class="minigame-gallery-preview-copy">
                <span>Quick Play</span>
                <strong>${escapeHtml(game.title)}</strong>
              </div>
            </div>
          </div>

          <div class="minigame-gallery-body">
            <div class="minigame-gallery-title-row">
              <div>
                <h3>${escapeHtml(game.title)}</h3>
                <p>${escapeHtml(game.description)}</p>
              </div>
            </div>

            <div class="minigame-gallery-hall">
              <div data-minigame-card-hall-content="${escapeHtml(game.id)}">
                ${this._buildGalleryHallContent(game)}
              </div>
            </div>
          </div>
        </article>
      `;
    },

    _buildSeriesOverviewRows(series) {
      return (series?.games || []).map((game) => {
        const hallState = this._hallCache.get(game.id) || {};
        const topEntry = Array.isArray(hallState.entries) && hallState.entries.length
          ? hallState.entries[0]
          : (Array.isArray(game.hallOfFamePreview) ? game.hallOfFamePreview[0] : null);

        return {
          title: game.title,
          nickname: text(topEntry?.nickname || topEntry?.name),
          score: topEntry?.score,
          loading: Boolean(hallState.loading && !topEntry),
          empty: !topEntry && !hallState.loading && !hallState.error
        };
      }).slice(0, 3);
    },

    _renderSeriesOverviewCard(series) {
      const previewGame = series.games.find((game) => canPreview(game)) || series.games[0];
      const rows = this._buildSeriesOverviewRows(series);
      const readyCount = series.games.filter((game) => canLaunch(game)).length;

      return `
        <article
          class="minigame-series-portal"
          data-minigame-open-series="${escapeHtml(series.id)}"
          role="button"
          tabindex="0"
          aria-label="${escapeHtml(series.title)} 시리즈 열기">
          <div class="minigame-series-portal-preview ${canPreview(previewGame) ? 'has-frame' : 'is-static'}">
            ${previewGame ? this._renderGamePreview(previewGame) : ''}
            <div class="minigame-series-portal-top">
              <span class="minigame-status-chip is-ready">${escapeHtml(String(readyCount))} modes</span>
              <span class="minigame-gallery-preview-icon" aria-hidden="true">${escapeHtml(series.icon)}</span>
            </div>
            <div class="minigame-series-portal-bottom">
              <div class="minigame-gallery-preview-copy">
                <span>Series Select</span>
                <strong>${escapeHtml(series.title)}</strong>
              </div>
              <span class="minigame-series-portal-cta">들어가기</span>
            </div>
          </div>

          <div class="minigame-series-portal-body">
            <div class="minigame-series-portal-copy">
              <h3>${escapeHtml(series.title)}</h3>
              <p>${escapeHtml(series.description || '시리즈 안에서 원하는 모드를 골라 바로 플레이할 수 있습니다.')}</p>
            </div>
            <div class="minigame-series-mode-strip">
              ${series.games.map((game) => `<span class="minigame-series-mode-chip">${escapeHtml(game.title)}</span>`).join('')}
            </div>
            <div class="minigame-series-overview-board">
              <div class="minigame-series-overview-head">
                <span>대표 기록</span>
                <span>Top 1 by mode</span>
              </div>
              ${rows.map((row) => `
                <div class="minigame-series-overview-row">
                  <div class="minigame-series-overview-title">${escapeHtml(row.title)}</div>
                  <div class="minigame-series-overview-meta">
                    ${row.loading ? '불러오는 중' : row.empty ? '기록 없음' : escapeHtml(row.nickname || '익명')}
                  </div>
                  <div class="minigame-series-overview-score">
                    ${row.loading || row.empty || row.score === undefined ? '-' : escapeHtml(String(row.score))}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </article>
      `;
    },

    _renderSeriesDetail(series) {
      return `
        <div class="minigame-series-detail">
          <div class="minigame-series-detail-head">
            <button type="button" class="minigame-inline-btn minigame-series-back-btn" data-minigame-back-series>
              전체 게임
            </button>
            <div class="minigame-series-detail-hero">
              ${this._renderSeriesHeader(series)}
              <div class="minigame-series-mode-strip is-detail">
                ${series.games.map((game) => `<span class="minigame-series-mode-chip">${escapeHtml(game.title)}</span>`).join('')}
              </div>
            </div>
          </div>
          <div class="minigame-gallery-grid">
            ${series.games.map((game) => this._renderGameGalleryCard(game)).join('')}
          </div>
        </div>
      `;
    },

    _renderGamesPanel() {
      const target = document.getElementById('minigame-gallery');
      if (!target) return;

      const games = this.getGames();
      if (!games.length) {
        target.innerHTML = `
          <div class="minigame-empty-panel">
            <div class="minigame-empty-panel-icon" aria-hidden="true">🦖</div>
            <h3>플레이할 게임을 준비 중입니다.</h3>
            <p>게임이 등록되면 여기에서 바로 실행하실 수 있습니다.</p>
          </div>
        `;
        return;
      }

      games.forEach((gameItem) => this._ensureHallOfFameState(gameItem.id));

      const cards = games.map((game) => {
        const status = getStatusMeta(game.status);
        const canPlay = canLaunch(game);

        return `
          <article
            class="minigame-gallery-card ${game.id === this._selectedGameId ? 'is-selected' : ''} ${canPlay ? 'is-playable' : 'is-disabled'}"
            data-minigame-play-game="${escapeHtml(game.id)}"
            role="button"
            tabindex="${canPlay ? '0' : '-1'}"
            aria-label="${escapeHtml(game.title)} ${canPlay ? '게임 시작' : '준비 중'}">
            <div class="minigame-gallery-preview ${canPreview(game) ? 'has-frame' : 'is-static'}">
              ${this._renderGamePreview(game)}
              <div class="minigame-gallery-preview-top">
                <span class="minigame-status-chip ${status.className}">${escapeHtml(status.label)}</span>
                <span class="minigame-gallery-preview-icon" aria-hidden="true">${escapeHtml(game.icon)}</span>
              </div>
              <div class="minigame-gallery-preview-bottom">
                <div class="minigame-gallery-preview-copy">
                  <span>Quick Play</span>
                  <strong>${escapeHtml(game.title)}</strong>
                </div>
              </div>
            </div>

            <div class="minigame-gallery-body">
              <div class="minigame-gallery-title-row">
                <div>
                  <h3>${escapeHtml(game.title)}</h3>
                  <p>${escapeHtml(game.description)}</p>
                </div>
              </div>

              <div class="minigame-gallery-hall">
                <div data-minigame-card-hall-content="${escapeHtml(game.id)}">
                  ${this._buildGalleryHallContent(game)}
                </div>
              </div>
            </div>
          </article>
        `;
      }).join('');

      target.innerHTML = `
        <div class="minigame-gallery-grid">
          ${cards}
        </div>
      `;
    },

    _ensureHallOfFameState(gameId) {
      const state = this._hallCache.get(gameId);
      if (state?.loading || state?.loaded) return;

      this._hallCache.set(gameId, {
        loading: true,
        loaded: false,
        error: '',
        provider: 'firebase',
        entries: state?.entries || []
      });

      this._loadHallOfFame(gameId);
    },

    async _loadHallOfFame(gameId) {
      if (!LS.Leaderboard?.getHallOfFame) return;

      const requestSerial = (this._hallRequestSerialByGame.get(gameId) || 0) + 1;
      this._hallRequestSerialByGame.set(gameId, requestSerial);

      try {
        const result = await LS.Leaderboard.getHallOfFame({
          gameId,
          limit: 10,
          leaderboardMode: normalizeLeaderboardMode(this._games.get(gameId)?.leaderboardMode)
        });
        if (requestSerial !== this._hallRequestSerialByGame.get(gameId)) return;
        const currentState = this._hallCache.get(gameId) || {};
        const fetchedEntries = Array.isArray(result?.entries) ? result.entries : [];

        this._hallCache.set(gameId, {
          loading: false,
          loaded: true,
          error: '',
          provider: text(result?.provider, 'firebase'),
          entries: this._mergeHallEntries([
            ...(Array.isArray(currentState.entries) ? currentState.entries : []),
            ...fetchedEntries
          ], gameId)
        });
      } catch (error) {
        if (requestSerial !== this._hallRequestSerialByGame.get(gameId)) return;

        this._hallCache.set(gameId, {
          loading: false,
          loaded: true,
          error: text(error?.message, '명예의 전당을 불러오지 못했습니다.'),
          provider: 'firebase',
          entries: []
        });
      }

      this._refreshGameCardHall(gameId);
      if (this._activeTab === 'games') {
        this._renderGamesPanel();
      }
      if (this._activeTab === 'hall') {
        this._renderHallPanel();
      }
    },

    _renderHallRows(rows, emptyTitle) {
      const items = Array.isArray(rows) ? rows.filter(Boolean).slice(0, 10) : [];

      if (items.length) {
        return items.map((row) => `
          <div class="minigame-hall-row">
            <div class="minigame-hall-rank">${row.rank}</div>
            <div class="minigame-hall-player">
              <strong>${escapeHtml(row.nickname || row.name)}</strong>
              <span>${escapeHtml(row.meta || row.updatedAt || '기록 시간 없음')}</span>
            </div>
            <div class="minigame-hall-score">${escapeHtml(String(row.score ?? '-'))}</div>
          </div>
        `).join('');
      }

      return `
        <div class="minigame-hall-empty">
          <div class="minigame-hall-empty-icon" aria-hidden="true">🏆</div>
          <div class="minigame-hall-empty-title">${escapeHtml(emptyTitle)}</div>
          <div class="minigame-hall-empty-text">아직 등록된 기록이 없습니다.</div>
        </div>
      `;
    },

    _renderHallCard(gameItem) {
      const hallState = this._hallCache.get(gameItem.id) || {};
      const hallRows = Array.isArray(hallState.entries) && hallState.entries.length
        ? hallState.entries.slice(0, 10)
        : gameItem.hallOfFamePreview.slice(0, 10);
      const isSelected = gameItem.id === this._selectedGameId;

      return `
        <div class="minigame-section-card minigame-hall-card ${isSelected ? 'is-selected' : ''}" data-minigame-hall-card="${escapeHtml(gameItem.id)}">
          <div class="minigame-hall-card-head">
            <div>
              <div class="minigame-section-title">${escapeHtml(gameItem.title)}</div>
              <p class="minigame-section-text">${escapeHtml(gameItem.rankingLabel)}</p>
              ${gameItem.hallNotice ? `<p class="minigame-section-text">${escapeHtml(gameItem.hallNotice)}</p>` : ''}
            </div>
            <div class="minigame-hall-card-icon" aria-hidden="true">${escapeHtml(gameItem.icon)}</div>
          </div>
          ${hallState.loading ? '<p class="minigame-section-text">기록을 불러오는 중입니다.</p>' : ''}
          ${hallState.error ? `<p class="minigame-section-text">${escapeHtml(hallState.error)}</p>` : ''}
          <div class="minigame-hall-board">
            ${this._renderHallRows(hallRows, `${gameItem.title} 명예의 전당 준비 중`)}
          </div>
        </div>
      `;
    },

    _renderHallPanel() {
      const target = document.getElementById('minigame-hall');
      if (!target) return;

      const games = this.getGames();
      if (games.length) {
        games.forEach((gameItem) => this._ensureHallOfFameState(gameItem.id));

        const sections = this.getGameSeries().map((series) => `
          <section class="minigame-series-section">
            ${this._renderSeriesHeader(series)}
            <div class="minigame-hall-grid">
              ${series.games.map((game) => this._renderHallCard(game)).join('')}
            </div>
          </section>
        `).join('');

        target.innerHTML = `
          <div class="minigame-series-stack">
            ${sections}
          </div>
        `;
        return;
      }
      if (!games.length) {
        target.innerHTML = `
          <div class="minigame-section-card">
            <div class="minigame-section-title">명예의 전당 준비 중</div>
            <p class="minigame-section-text">연결된 게임이 아직 없습니다. 게임을 등록하면 게임별 상위 기록이 여기에 표시됩니다.</p>
          </div>
        `;
        return;
      }

      games.forEach((gameItem) => this._ensureHallOfFameState(gameItem.id));

      const cards = games.map((gameItem) => {
        const hallState = this._hallCache.get(gameItem.id) || {};
        const hallRows = Array.isArray(hallState.entries) && hallState.entries.length
          ? hallState.entries
          : gameItem.hallOfFamePreview;
        const isSelected = gameItem.id === this._selectedGameId;

        return `
          <div class="minigame-section-card minigame-hall-card ${isSelected ? 'is-selected' : ''}" data-minigame-hall-card="${escapeHtml(gameItem.id)}">
            <div class="minigame-hall-card-head">
              <div>
                <div class="minigame-section-title">${escapeHtml(gameItem.title)}</div>
                <p class="minigame-section-text">${escapeHtml(gameItem.rankingLabel)}</p>
              </div>
              <div class="minigame-hall-card-icon" aria-hidden="true">${escapeHtml(gameItem.icon)}</div>
            </div>
            ${hallState.loading ? '<p class="minigame-section-text">기록을 불러오는 중입니다.</p>' : ''}
            ${hallState.error ? `<p class="minigame-section-text">${escapeHtml(hallState.error)}</p>` : ''}
            <div class="minigame-hall-board">
              ${this._renderHallRows(hallRows, `${gameItem.title} 명예의 전당 준비 중`)}
            </div>
          </div>
        `;
      }).join('');

      target.innerHTML = `
        <div class="minigame-hall-grid">
          ${cards}
        </div>
      `;
    },

    _persistNickname(nickname) {
      const normalized = normalizeNickname(nickname);
      if (!normalized) return '';

      LS.Storage?.set?.(NICKNAME_STORAGE_KEY, normalized);
      try {
        localStorage.setItem(NICKNAME_STORAGE_KEY, normalized);
        localStorage.setItem(LEGACY_NICKNAME_STORAGE_KEY, normalized);
      } catch {
        // ignore storage sync failures
      }

      return normalized;
    },

    _syncTabState() {
      document.querySelectorAll('.minigame-tab-btn').forEach((button) => {
        const active = button.dataset.minigameTab === this._activeTab;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-selected', active ? 'true' : 'false');
      });

      document.querySelectorAll('.minigame-panel').forEach((panel) => {
        panel.classList.toggle('is-active', panel.dataset.minigamePanel === this._activeTab);
      });
    }
  };
})();
