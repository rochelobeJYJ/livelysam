(function () {
  'use strict';

  const LS = window.LivelySam = window.LivelySam || {};
  const PROVIDER_FIREBASE = 'firebase';
  const DEFAULT_SEASON_ID = 'season-1';
  const DEFAULT_LEADERBOARD_MODE = 'all-scores';
  const DEFAULT_MAX_ENTRIES_PER_PLAYER = 3;
  const FIREBASE_APP_NAME = 'livelysam-minigames';
  const CONNECTIVITY_GAME_ID = 'connectivity-probe';
  const FIREBASE_REQUIRED_KEYS = [
    'apiKey',
    'authDomain',
    'projectId',
    'appId'
  ];
  const LEADERBOARD_CONFIG_DEFAULTS = {
    minigameLeaderboardProvider: PROVIDER_FIREBASE,
    minigameSeasonId: DEFAULT_SEASON_ID,
    firebaseApiKey: '',
    firebaseAuthDomain: '',
    firebaseProjectId: '',
    firebaseStorageBucket: '',
    firebaseMessagingSenderId: '',
    firebaseAppId: '',
    firebaseMeasurementId: ''
  };
  const MAX_NICKNAME_LENGTH = 12;

  let firebaseApp = null;
  let firestoreDb = null;
  let firebaseAuth = null;
  let firebaseConfigHash = '';
  let authPromise = null;
  let runtimeStatus = {
    phase: 'idle',
    ready: false,
    provider: PROVIDER_FIREBASE,
    seasonId: DEFAULT_SEASON_ID,
    authReady: false,
    writeReady: false,
    checkedAt: '',
    lastError: ''
  };

  function text(value, fallback = '') {
    const normalized = String(value ?? '').trim();
    return normalized || fallback;
  }

  function normalizeSeasonId(value) {
    return text(value, DEFAULT_SEASON_ID).replace(/\s+/g, '-').slice(0, 40) || DEFAULT_SEASON_ID;
  }

  function normalizeNickname(value) {
    return text(value).replace(/\s+/g, ' ').slice(0, MAX_NICKNAME_LENGTH);
  }

  function normalizeScore(value, fallback = 0) {
    const numeric = Math.floor(Number(value));
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
  }

  function normalizeLeaderboardMode(value) {
    return text(value, DEFAULT_LEADERBOARD_MODE).toLowerCase() === 'all-scores'
      ? 'all-scores'
      : 'personal-best';
  }

  function normalizeMaxEntriesPerPlayer(value, fallback = DEFAULT_MAX_ENTRIES_PER_PLAYER) {
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }

    return Math.max(0, Math.min(10, parsed));
  }

  function maskNickname(value) {
    const nickname = text(value, '익명');
    if (nickname.length <= 2) return nickname;
    return `${nickname.slice(0, 2)}${'*'.repeat(Math.max(1, nickname.length - 2))}`;
  }

  function getPublicLeaderboardConfig() {
    const publicConfig = window.LivelySamPublicConfig?.leaderboard;
    return publicConfig && typeof publicConfig === 'object' ? publicConfig : {};
  }

  function getConfigValue(key, overrides = {}) {
    if (Object.prototype.hasOwnProperty.call(overrides, key)) {
      return overrides[key];
    }

    const localValue = LS.Config?.get?.(key);
    const defaultValue = LEADERBOARD_CONFIG_DEFAULTS[key];
    if (defaultValue === undefined) {
      return localValue;
    }

    const localText = String(localValue ?? '').trim();
    const defaultText = String(defaultValue ?? '').trim();
    if (localText && localText !== defaultText) {
      return localValue;
    }

    const publicConfig = getPublicLeaderboardConfig();
    if (Object.prototype.hasOwnProperty.call(publicConfig, key)) {
      return publicConfig[key];
    }

    return localValue;
  }

  function buildFirebaseConfig(overrides = {}) {
    return {
      apiKey: text(getConfigValue('firebaseApiKey', overrides)),
      authDomain: text(getConfigValue('firebaseAuthDomain', overrides)),
      projectId: text(getConfigValue('firebaseProjectId', overrides)),
      storageBucket: text(getConfigValue('firebaseStorageBucket', overrides)),
      messagingSenderId: text(getConfigValue('firebaseMessagingSenderId', overrides)),
      appId: text(getConfigValue('firebaseAppId', overrides)),
      measurementId: text(getConfigValue('firebaseMeasurementId', overrides))
    };
  }

  function getMissingFirebaseKeys(config) {
    return FIREBASE_REQUIRED_KEYS.filter((key) => !text(config?.[key]));
  }

  function updateRuntimeStatus(patch = {}) {
    runtimeStatus = {
      ...runtimeStatus,
      ...patch,
      checkedAt: new Date().toISOString()
    };

    try {
      window.dispatchEvent(new CustomEvent('livelysam:leaderboardStatusChanged', {
        detail: { ...runtimeStatus }
      }));
    } catch {
      // ignore event dispatch failures
    }
  }

  function dispatchLeaderboardEvent(target, eventName, detail = {}) {
    if (!target || typeof target.dispatchEvent !== 'function') return;

    try {
      const EventConstructor = typeof target.CustomEvent === 'function' ? target.CustomEvent : CustomEvent;
      target.dispatchEvent(new EventConstructor(eventName, { detail }));
    } catch {
      // ignore event dispatch failures
    }
  }

  function emitLeaderboardEvent(eventName, detail = {}) {
    const targets = [window];

    try {
      if (window.parent && window.parent !== window) {
        targets.push(window.parent);
      }
    } catch {
      // ignore cross-context access failures
    }

    try {
      if (window.top && window.top !== window && window.top !== window.parent) {
        targets.push(window.top);
      }
    } catch {
      // ignore cross-context access failures
    }

    Array.from(new Set(targets)).forEach((target) => {
      dispatchLeaderboardEvent(target, eventName, detail);
    });
  }

  function buildEntriesCollection(db, seasonId, gameId) {
    return db
      .collection('minigameLeaderboards')
      .doc(seasonId)
      .collection('games')
      .doc(gameId)
      .collection('entries');
  }

  function buildAllScoresCollection(db, seasonId, gameId) {
    return db
      .collection('minigameLeaderboards')
      .doc(seasonId)
      .collection('games')
      .doc(gameId)
      .collection('runs');
  }

  function buildPlayerRunDocId(playerId, slotIndex) {
    return `${playerId}__top${slotIndex}`;
  }

  function toIsoString(value) {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (typeof value?.toDate === 'function') return value.toDate().toISOString();
    if (value instanceof Date) return value.toISOString();
    return '';
  }

  async function queryLeaderboardCollection(collection, options = {}) {
    const limit = Math.max(1, Math.min(20, parseInt(options?.limit, 10) || 10));
    const query = collection.orderBy('score', 'desc').limit(limit);

    try {
      return await query.get({ source: 'server' });
    } catch {
      return query.get();
    }
  }

  function normalizeEntry(row, index = 0) {
    return {
      rank: Math.max(1, parseInt(row?.rank, 10) || index + 1),
      entryId: text(row?.entryId),
      playerId: text(row?.playerId),
      nickname: text(row?.nickname || row?.name, '익명'),
      maskedNickname: text(row?.maskedNickname, maskNickname(row?.nickname || row?.name || '익명')),
      score: normalizeScore(row?.score),
      updatedAt: text(row?.updatedAt),
      source: text(row?.source, PROVIDER_FIREBASE)
    };
  }

  async function submitPersonalBestEntry({
    db,
    gameId,
    seasonId,
    playerId,
    nickname,
    score,
    serverTimestamp
  }) {
    const entriesCollection = buildEntriesCollection(db, seasonId, gameId);
    const entryRef = entriesCollection.doc(playerId);

    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(entryRef);
      const current = snapshot.exists ? snapshot.data() : {};
      const previousScore = normalizeScore(current?.score);
      const bestScore = Math.max(previousScore, score);

      if (!snapshot.exists) {
        transaction.set(entryRef, {
          seasonId,
          gameId,
          playerId,
          nickname,
          score: bestScore,
          source: 'livelysam',
          createdAt: serverTimestamp,
          updatedAt: serverTimestamp,
          lastSubmittedAt: serverTimestamp
        });
      } else {
        transaction.set(entryRef, {
          seasonId,
          gameId,
          playerId,
          nickname,
          score: bestScore,
          source: text(current?.source, 'livelysam'),
          updatedAt: serverTimestamp,
          lastSubmittedAt: serverTimestamp
        }, { merge: true });
      }

      return {
        provider: PROVIDER_FIREBASE,
        gameId,
        seasonId,
        leaderboardMode: 'personal-best',
        entryId: entryRef.id,
        submittedScore: score,
        personalBest: bestScore,
        improved: bestScore > previousScore
      };
    });
  }

  async function fetchLeaderboardEntries({
    db,
    gameId,
    seasonId,
    leaderboardMode,
    limit
  }) {
    const collection = leaderboardMode === 'all-scores'
      ? buildAllScoresCollection(db, seasonId, gameId)
      : buildEntriesCollection(db, seasonId, gameId);
    const snapshot = await queryLeaderboardCollection(collection, { limit });
  }

  function inspectSettings(overrides = {}) {
    const seasonId = normalizeSeasonId(getConfigValue('minigameSeasonId', overrides));
    const firebaseConfig = buildFirebaseConfig(overrides);
    const missingFirebaseKeys = getMissingFirebaseKeys(firebaseConfig);
    const hasFirebaseConfig = missingFirebaseKeys.length === 0;
    const hasSdk = Boolean(window.firebase?.initializeApp && window.firebase?.firestore && window.firebase?.auth);

    return {
      provider: PROVIDER_FIREBASE,
      seasonId,
      firebaseConfig,
      missingFirebaseKeys,
      hasFirebaseConfig,
      hasSdk,
      usingFirebase: true,
      canUseFirebase: hasFirebaseConfig && hasSdk
    };
  }

  async function ensureFirebaseConnection(overrides = {}) {
    const status = inspectSettings(overrides);
    if (!status.hasSdk) {
      throw new Error('Firebase SDK를 불러오지 못했습니다.');
    }
    if (!status.hasFirebaseConfig) {
      throw new Error(`Firebase 설정이 비어 있습니다: ${status.missingFirebaseKeys.join(', ')}`);
    }

    const nextHash = JSON.stringify(status.firebaseConfig);
    if (firebaseApp && firebaseConfigHash && firebaseConfigHash !== nextHash) {
      try {
        await firebaseApp.delete();
      } catch (error) {
        console.warn('[Leaderboard] Firebase app reset failed:', error);
      } finally {
        firebaseApp = null;
        firestoreDb = null;
        firebaseAuth = null;
        authPromise = null;
        firebaseConfigHash = '';
      }
    }

    if (!firebaseApp) {
      const existingApp = window.firebase.apps?.find((app) => app.name === FIREBASE_APP_NAME);
      firebaseApp = existingApp || window.firebase.initializeApp(status.firebaseConfig, FIREBASE_APP_NAME);
      firestoreDb = firebaseApp.firestore();
      firebaseAuth = firebaseApp.auth();
      firebaseConfigHash = nextHash;
    }

    return {
      app: firebaseApp,
      db: firestoreDb,
      auth: firebaseAuth,
      status
    };
  }

  async function ensureAnonymousAuth(overrides = {}) {
    const { auth } = await ensureFirebaseConnection(overrides);
    if (auth.currentUser) {
      return auth.currentUser;
    }

    if (!authPromise) {
      authPromise = auth.signInAnonymously()
        .then((credential) => credential?.user || auth.currentUser)
        .catch((error) => {
          authPromise = null;
          throw error;
        });
    }

    const user = await authPromise;
    if (!user) {
      authPromise = null;
      throw new Error('익명 인증에 실패했습니다.');
    }

    return user;
  }

  async function submitScoreToFirebase(options = {}) {
    const gameId = text(options?.gameId);
    const nickname = normalizeNickname(options?.nickname);
    const score = normalizeScore(options?.score);
    const leaderboardMode = normalizeLeaderboardMode(options?.leaderboardMode);
    const maxEntriesPerPlayer = normalizeMaxEntriesPerPlayer(options?.maxEntriesPerPlayer);
    const allowModeFallback = options?.allowModeFallback !== false;
    const seasonId = normalizeSeasonId(options?.seasonId || getConfigValue('minigameSeasonId'));
    if (!gameId) {
      throw new Error('gameId가 비어 있습니다.');
    }
    if (!nickname) {
      throw new Error('닉네임이 비어 있습니다.');
    }

    const user = await ensureAnonymousAuth(options?.settings || {});
    const { db } = await ensureFirebaseConnection(options?.settings || {});
    const serverTimestamp = window.firebase.firestore.FieldValue.serverTimestamp();

    if (leaderboardMode === 'all-scores') {
      const runsCollection = buildAllScoresCollection(db, seasonId, gameId);
      try {
        let result;

        if (maxEntriesPerPlayer > 0) {
          const slotRefs = Array.from({ length: maxEntriesPerPlayer }, (_, index) => (
            runsCollection.doc(buildPlayerRunDocId(user.uid, index + 1))
          ));

          result = await db.runTransaction(async (transaction) => {
            const snapshots = [];
            for (const ref of slotRefs) {
              snapshots.push(await transaction.get(ref));
            }

            const existingEntries = snapshots.map((snapshot, index) => ({
              slotIndex: index + 1,
              ref: slotRefs[index],
              exists: snapshot.exists,
              data: snapshot.exists ? snapshot.data() : null
            }));

            const presentEntries = existingEntries.filter((entry) => entry.exists);
            const emptyEntry = existingEntries.find((entry) => !entry.exists) || null;
            const sortedExisting = [...presentEntries].sort((left, right) => {
              const scoreGap = normalizeScore(left.data?.score) - normalizeScore(right.data?.score);
              if (scoreGap !== 0) return scoreGap;
              return text(left.data?.updatedAt).localeCompare(text(right.data?.updatedAt));
            });
            const lowestEntry = sortedExisting[0] || null;

            let targetEntry = emptyEntry;
            let accepted = true;
            if (!targetEntry) {
              if (score > normalizeScore(lowestEntry?.data?.score)) {
                targetEntry = lowestEntry;
              } else {
                accepted = false;
              }
            }

            const currentTopScore = presentEntries.reduce((best, entry) => (
              Math.max(best, normalizeScore(entry.data?.score))
            ), 0);

            if (!accepted || !targetEntry) {
              return {
                provider: PROVIDER_FIREBASE,
                gameId,
                seasonId,
                leaderboardMode,
                accepted: false,
                entryId: '',
                submittedScore: score,
                personalBest: currentTopScore,
                improved: score > currentTopScore
              };
            }

            const previousData = targetEntry.data || {};
            transaction.set(targetEntry.ref, {
              entryId: targetEntry.ref.id,
              seasonId,
              gameId,
              playerId: user.uid,
              nickname,
              score,
              source: 'livelysam',
              createdAt: previousData.createdAt || serverTimestamp,
              updatedAt: serverTimestamp,
              lastSubmittedAt: serverTimestamp
            });

            return {
              provider: PROVIDER_FIREBASE,
              gameId,
              seasonId,
              leaderboardMode,
              accepted: true,
              entryId: targetEntry.ref.id,
              submittedScore: score,
              personalBest: Math.max(currentTopScore, score),
              improved: score > currentTopScore
            };
          });
        } else {
          const entryRef = runsCollection.doc();
          await entryRef.set({
            entryId: entryRef.id,
            seasonId,
            gameId,
            playerId: user.uid,
            nickname,
            score,
            source: 'livelysam',
            createdAt: serverTimestamp,
            updatedAt: serverTimestamp,
            lastSubmittedAt: serverTimestamp
          });

          result = {
            provider: PROVIDER_FIREBASE,
            gameId,
            seasonId,
            leaderboardMode,
            accepted: true,
            entryId: entryRef.id,
            submittedScore: score,
            personalBest: score,
            improved: true
          };
        }

        if (result.accepted !== false) {
          try {
            await submitPersonalBestEntry({
              db,
              gameId,
              seasonId,
              playerId: user.uid,
              nickname,
              score,
              serverTimestamp
            });
          } catch (mirrorError) {
            console.warn('[Leaderboard] Failed to mirror personal-best entry:', mirrorError);
          }
        }

        if (gameId !== CONNECTIVITY_GAME_ID && result.accepted !== false) {
          emitLeaderboardEvent('livelysam:minigameScoreSubmitted', {
            ...result,
            nickname,
            playerId: user.uid
          });
        }

        return result;
      } catch (error) {
        if (!allowModeFallback) {
          throw error;
        }

        console.warn('[Leaderboard] all-scores submit failed, falling back to personal-best:', error);
        const fallbackResult = await submitPersonalBestEntry({
          db,
          gameId,
          seasonId,
          playerId: user.uid,
          nickname,
          score,
          serverTimestamp
        });
        const result = {
          ...fallbackResult,
          requestedLeaderboardMode: leaderboardMode,
          fallbackMode: 'personal-best'
        };

        if (gameId !== CONNECTIVITY_GAME_ID) {
          emitLeaderboardEvent('livelysam:minigameScoreSubmitted', {
            ...result,
            nickname,
            playerId: user.uid
          });
        }

        return result;
      }
    }

    const result = await submitPersonalBestEntry({
      db,
      gameId,
      seasonId,
      playerId: user.uid,
      nickname,
      score,
      serverTimestamp
    });

    if (gameId !== CONNECTIVITY_GAME_ID) {
      emitLeaderboardEvent('livelysam:minigameScoreSubmitted', {
        ...result,
        nickname,
        playerId: user.uid
      });
    }

    return result;
  }

  async function getHallOfFameFromFirebase(options = {}) {
    const gameId = text(options?.gameId);
    const leaderboardMode = normalizeLeaderboardMode(options?.leaderboardMode);
    const allowModeFallback = options?.allowModeFallback !== false;
    const seasonId = normalizeSeasonId(options?.seasonId || getConfigValue('minigameSeasonId'));
    const limit = Math.max(1, Math.min(20, parseInt(options?.limit, 10) || 10));
    if (!gameId) {
      throw new Error('gameId가 비어 있습니다.');
    }

    const { db } = await ensureFirebaseConnection(options?.settings || {});
    try {
      return await fetchLeaderboardEntries({
        db,
        gameId,
        seasonId,
        leaderboardMode,
        limit
      });
    } catch (error) {
      if (leaderboardMode !== 'all-scores' || !allowModeFallback) {
        throw error;
      }

      console.warn('[Leaderboard] all-scores fetch failed, falling back to personal-best:', error);
      const fallbackResult = await fetchLeaderboardEntries({
        db,
        gameId,
        seasonId,
        leaderboardMode: 'personal-best',
        limit
      });

      return {
        ...fallbackResult,
        requestedLeaderboardMode: leaderboardMode,
        fallbackMode: 'personal-best'
      };
    }

    const entries = snapshot.docs.map((doc, index) => normalizeEntry({
      rank: index + 1,
      entryId: doc.id,
      playerId: text(doc.data()?.playerId, doc.id),
      nickname: text(doc.data()?.nickname, '익명'),
      score: doc.data()?.score,
      updatedAt: toIsoString(doc.data()?.updatedAt),
      source: text(doc.data()?.source, PROVIDER_FIREBASE)
    }, index));

    return {
      provider: PROVIDER_FIREBASE,
      gameId,
      seasonId,
      leaderboardMode,
      entries,
      topEntry: entries[0] || null
    };
  }

  async function runConnectivityProbe(options = {}) {
    await submitScoreToFirebase({
      gameId: CONNECTIVITY_GAME_ID,
      nickname: 'probe',
      score: 0,
      seasonId: options.seasonId,
      leaderboardMode: 'personal-best',
      allowModeFallback: false
    });

    await getHallOfFameFromFirebase({
      gameId: CONNECTIVITY_GAME_ID,
      seasonId: options.seasonId,
      limit: 1,
      leaderboardMode: 'personal-best',
      allowModeFallback: false
    });

    await submitScoreToFirebase({
      gameId: CONNECTIVITY_GAME_ID,
      nickname: 'probe',
      score: 0,
      seasonId: options.seasonId,
      leaderboardMode: 'all-scores',
      maxEntriesPerPlayer: DEFAULT_MAX_ENTRIES_PER_PLAYER,
      allowModeFallback: false
    });

    await getHallOfFameFromFirebase({
      gameId: CONNECTIVITY_GAME_ID,
      seasonId: options.seasonId,
      limit: 1,
      leaderboardMode: 'all-scores',
      allowModeFallback: false
    });
  }

  async function warmupFirebase(options = {}) {
    const status = inspectSettings(options?.settings || {});
    if (!status.canUseFirebase) {
      updateRuntimeStatus({
        phase: 'config-missing',
        ready: false,
        provider: PROVIDER_FIREBASE,
        seasonId: status.seasonId,
        authReady: false,
        writeReady: false,
        lastError: status.missingFirebaseKeys.length
          ? `Firebase 설정 누락: ${status.missingFirebaseKeys.join(', ')}`
          : 'Firebase SDK를 불러오지 못했습니다.'
      });
      return { ...runtimeStatus };
    }

    updateRuntimeStatus({
      phase: 'warming',
      ready: false,
      provider: PROVIDER_FIREBASE,
      seasonId: status.seasonId,
      authReady: false,
      writeReady: false,
      lastError: ''
    });

    try {
      await ensureAnonymousAuth(options?.settings || {});
      updateRuntimeStatus({
        phase: 'auth-ready',
        ready: false,
        provider: PROVIDER_FIREBASE,
        seasonId: status.seasonId,
        authReady: true,
        writeReady: false,
        lastError: ''
      });

      await runConnectivityProbe({ seasonId: status.seasonId });

      updateRuntimeStatus({
        phase: 'ready',
        ready: true,
        provider: PROVIDER_FIREBASE,
        seasonId: status.seasonId,
        authReady: true,
        writeReady: true,
        lastError: ''
      });
    } catch (error) {
      updateRuntimeStatus({
        phase: 'error',
        ready: false,
        provider: PROVIDER_FIREBASE,
        seasonId: status.seasonId,
        authReady: runtimeStatus.authReady,
        writeReady: false,
        lastError: text(error?.message, 'Firebase 리더보드 연결 실패')
      });
    }

    return { ...runtimeStatus };
  }

  LS.Leaderboard = {
    getStatus(overrides = {}) {
      return inspectSettings(overrides);
    },

    getRuntimeStatus() {
      return { ...runtimeStatus };
    },

    maskNickname,

    isUsingFirebase(overrides = {}) {
      return inspectSettings(overrides).canUseFirebase;
    },

    reset() {
      if (firebaseApp) {
        firebaseApp.delete().catch(() => {});
      }
      firebaseApp = null;
      firestoreDb = null;
      firebaseAuth = null;
      firebaseConfigHash = '';
      authPromise = null;
      updateRuntimeStatus({
        phase: 'idle',
        ready: false,
        provider: PROVIDER_FIREBASE,
        seasonId: inspectSettings().seasonId,
        authReady: false,
        writeReady: false,
        lastError: ''
      });
    },

    async warmup(options = {}) {
      return warmupFirebase(options);
    },

    async submitScore(options = {}) {
      return submitScoreToFirebase(options);
    },

    async getHallOfFame(options = {}) {
      return getHallOfFameFromFirebase(options);
    },

    async getTopEntry(options = {}) {
      const result = await this.getHallOfFame({ ...options, limit: 1 });
      return result?.entries?.[0] || null;
    }
  };
})();
