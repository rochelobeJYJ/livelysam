(function () {
  'use strict';

  const MINIGAME_ID = 'parcel-stack';
  const LEADERBOARD_MODE = 'all-scores';
  const MAX_SCORES_PER_PLAYER = 3;
  const LOCAL_BEST_KEY = 'parcelStackLocalBest';
  const IS_PREVIEW_MODE = new URLSearchParams(window.location.search).get('preview') === '1';

  const CANVAS_WIDTH = 900;
  const CANVAS_HEIGHT = 1600;
  const CRANE_Y = 220;
  const DROP_MIN_X = 200;
  const DROP_MAX_X = 700;
  const CART_CENTER_X = CANVAS_WIDTH * 0.5;
  const CART_DECK_Y = 1248;
  const CART_WIDTH = 336;
  const CART_HEIGHT = 118;
  const GROUND_Y = 1368;
  const GRAVITY = 2280;
  const SPAWN_DELAY = 0.24;
  const MAX_STACK_BOXES = 11;
  const LOAD_LIMIT_TOP_Y = 352;
  const DISPATCH_EXIT_DURATION = 0.72;
  const DISPATCH_ENTRY_DURATION = 0.64;
  const DISPATCH_TRAVEL_X = CANVAS_WIDTH + 460;
  const COLLAPSE_DURATION = 1.12;
  const COLLAPSE_GRAVITY = 2520;
  const BASE_BOX_SCORE = 5;
  const BASE_CRANE_SPEED = 220;
  const STAGE_SPEED_GAIN = 34;

  const BOX_STYLE_SET = [
    {
      base: '#c58f57',
      edge: '#a77444',
      top: '#e1b887',
      tape: '#f1dfb7',
      label: '#f8f4ea',
      stamp: '#8c5334',
      accent: '#bd6f52'
    },
    {
      base: '#b98253',
      edge: '#94623b',
      top: '#d7a873',
      tape: '#e6d3ae',
      label: '#f6f1e6',
      stamp: '#6f7a57',
      accent: '#647154'
    },
    {
      base: '#d09d67',
      edge: '#ab7a49',
      top: '#e7c394',
      tape: '#f0dfbc',
      label: '#fbf7ee',
      stamp: '#9f623f',
      accent: '#8f5e49'
    }
  ];

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const shell = document.getElementById('shell');

  const scoreValue = document.getElementById('scoreValue');
  const bestValue = document.getElementById('bestValue');
  const stackValue = document.getElementById('stackValue');
  const stabilityValue = document.getElementById('stabilityValue');

  const startOverlay = document.getElementById('startOverlay');
  const gameOverOverlay = document.getElementById('gameOverOverlay');
  const startStatus = document.getElementById('startStatus');
  const gameOverStatus = document.getElementById('gameOverStatus');
  const finalScoreLine = document.getElementById('finalScoreLine');
  const startButton = document.getElementById('startButton');
  const restartButton = document.getElementById('restartButton');
  const lobbyButton = document.getElementById('lobbyButton');

  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;

  const state = {
    mode: IS_PREVIEW_MODE ? 'preview' : 'ready',
    lastFrameTime: 0,
    elapsed: 0,
    score: 0,
    stage: 1,
    bestScore: loadLocalBest(),
    topEntry: null,
    isSubmitting: false,
    stack: [],
    currentBox: null,
    fallingBox: null,
    floatingTexts: [],
    particles: [],
    spawnCooldown: 0,
    craneX: CART_CENTER_X,
    craneDirection: 1,
    craneSpeed: BASE_CRANE_SPEED,
    balance: 0,
    lean: 0,
    leanTarget: 0,
    hookBob: 0,
    cartBounce: 0,
    cartOffsetX: 0,
    dispatchPhase: '',
    dispatchTimer: 0,
    vanX: -280,
    vanSpeed: 32,
    previewResetTimer: 0,
    autoDropTimer: 0,
    collapseBoxes: [],
    collapseTimer: 0,
    collapseReasonText: '',
    collapseFinalizing: false,
    messageText: '',
    messageColor: '#647154',
    messageTimer: 0
  };

  if (IS_PREVIEW_MODE) {
    document.body.classList.add('preview-mode');
  }

  function loadLocalBest() {
    try {
      const value = parseInt(localStorage.getItem(LOCAL_BEST_KEY), 10);
      return Number.isFinite(value) && value > 0 ? value : 0;
    } catch {
      return 0;
    }
  }

  function saveLocalBest(value) {
    try {
      localStorage.setItem(LOCAL_BEST_KEY, String(Math.max(0, Math.floor(value))));
    } catch {
      // ignore storage failures
    }
  }

  function resolveGameNickname() {
    try {
      const parentNickname = window.parent && window.parent !== window
        && window.parent.LivelySam?.MinigamesHub?.getNickname?.();
      if (parentNickname) return String(parentNickname).trim();
    } catch {
      // ignore parent access failures
    }

    try {
      const nickname = localStorage.getItem('minigameNickname');
      if (nickname) return String(nickname).trim();
    } catch {
      // ignore local storage failures
    }

    try {
      const legacyNickname = localStorage.getItem('j_game_username');
      if (legacyNickname) return String(legacyNickname).trim();
    } catch {
      // ignore local storage failures
    }

    return 'Guest';
  }

  function getLeaderboardBridge() {
    if (IS_PREVIEW_MODE) {
      return null;
    }

    try {
      if (window.parent && window.parent !== window && window.parent.LivelySam?.Leaderboard) {
        return window.parent.LivelySam.Leaderboard;
      }
    } catch {
      // ignore parent access failures
    }

    return window.LivelySam?.Leaderboard || null;
  }

  function returnToMinigameHub() {
    try {
      if (window.parent && window.parent !== window && window.parent.LivelySam?.MinigamesHub?.closeRunner) {
        window.parent.LivelySam.MinigamesHub.closeRunner();
        return;
      }
    } catch {
      // ignore parent access failures
    }

    try {
      window.location.href = new URL('../../../index.html', window.location.href).href;
    } catch {
      window.location.reload();
    }
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(start, end, t) {
    return start + (end - start) * t;
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function choice(values) {
    return values[Math.floor(Math.random() * values.length)];
  }

  function pointsPerBox() {
    return BASE_BOX_SCORE + Math.max(0, state.stage - 1);
  }

  function computeCraneSpeed() {
    return Math.min(520, BASE_CRANE_SPEED + (state.stage - 1) * STAGE_SPEED_GAIN);
  }

  function roundRectPath(x, y, width, height, radius) {
    const r = Math.max(0, Math.min(radius, width * 0.5, height * 0.5));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function drawRoundedRect(x, y, width, height, radius, fillStyle) {
    roundRectPath(x, y, width, height, radius);
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }

  function strokeRoundedRect(x, y, width, height, radius, strokeStyle, lineWidth = 1) {
    roundRectPath(x, y, width, height, radius);
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = strokeStyle;
    ctx.stroke();
  }

  function currentNickname() {
    return resolveGameNickname().slice(0, 12) || 'Guest';
  }

  function formatMaskedName(entry) {
    const leaderboard = getLeaderboardBridge();
    const rawName = entry?.nickname || entry?.name || '';
    if (!rawName) return '익명';
    return leaderboard?.maskNickname ? leaderboard.maskNickname(rawName) : rawName;
  }

  function topEntryText() {
    if (IS_PREVIEW_MODE) {
      return '썸네일에서는 자동 데모 화면만 표시됩니다.';
    }

    if (!state.topEntry) {
      return '아직 등록된 최고 기록이 없습니다.';
    }

    return `현재 1위 ${formatMaskedName(state.topEntry)} · ${Math.floor(state.topEntry.score || 0)}점`;
  }

  function updateStatusLines(statusText, options = {}) {
    const line = statusText || topEntryText();
    const updateGameOver = options.gameOver !== false;
    startStatus.textContent = line;
    if (updateGameOver && !state.isSubmitting) {
      gameOverStatus.textContent = line;
    }
  }

  async function refreshTopEntry(options = {}) {
    const leaderboard = getLeaderboardBridge();
    const updateGameOver = options.preserveGameOver !== true;
    if (!leaderboard?.getTopEntry) {
      state.topEntry = null;
      updateStatusLines('', { gameOver: updateGameOver });
      return;
    }

    updateStatusLines('기록 정보를 불러오는 중입니다.', { gameOver: updateGameOver });

    try {
      state.topEntry = await leaderboard.getTopEntry({
        gameId: MINIGAME_ID,
        leaderboardMode: LEADERBOARD_MODE
      });
    } catch (error) {
      console.warn('[Parcel Stack] Failed to load top entry:', error);
      state.topEntry = null;
    }

    updateStatusLines('', { gameOver: updateGameOver });
  }

  async function submitScore(finalScore) {
    const leaderboard = getLeaderboardBridge();
    if (!leaderboard?.submitScore || finalScore <= 0) {
      return null;
    }

    return leaderboard.submitScore({
      gameId: MINIGAME_ID,
      nickname: currentNickname(),
      score: finalScore,
      leaderboardMode: LEADERBOARD_MODE,
      maxEntriesPerPlayer: MAX_SCORES_PER_PLAYER
    });
  }

  function updateHud() {
    scoreValue.textContent = String(Math.floor(state.score));
    bestValue.textContent = String(Math.floor(state.bestScore));

    if (state.mode === 'playing' || state.mode === 'gameover' || state.mode === 'dispatching' || state.mode === 'collapsing') {
      const visibleStackCount = state.collapseBoxes.length || state.stack.length;
      stackValue.textContent = `S${state.stage} · ${visibleStackCount}`;
      stabilityValue.textContent = `${Math.round((1 - clamp(state.balance, 0, 1)) * 100)}%`;
    } else {
      stackValue.textContent = 'S1 · Demo';
      stabilityValue.textContent = 'Ready';
    }
  }

  function setMode(mode) {
    state.mode = mode;
    shell.dataset.mode = mode;
    updateHud();
  }

  function showMessage(text, color = '#647154') {
    state.messageText = text;
    state.messageColor = color;
    state.messageTimer = 1.1;
  }

  function pushFloatingText(text, x, y, color) {
    state.floatingTexts.push({
      text,
      x,
      y,
      vy: -42,
      life: 0.9,
      maxLife: 0.9,
      color
    });
  }

  function createParticle(x, y, color, size, vx, vy, maxLife) {
    return {
      x,
      y,
      vx,
      vy,
      size,
      life: maxLife,
      maxLife,
      color
    };
  }

  function burst(x, y, color, count, power = 1) {
    for (let index = 0; index < count; index += 1) {
      const angle = randomBetween(0, Math.PI * 2);
      const velocity = randomBetween(90, 260) * power;
      state.particles.push(createParticle(
        x,
        y,
        color,
        randomBetween(3, 8),
        Math.cos(angle) * velocity,
        Math.sin(angle) * velocity - randomBetween(20, 120),
        randomBetween(0.35, 0.78)
      ));
    }
  }

  function resetEffects() {
    state.floatingTexts = [];
    state.particles = [];
    state.messageText = '';
    state.messageTimer = 0;
  }

  function createBox(seed = 0) {
    const style = BOX_STYLE_SET[seed % BOX_STYLE_SET.length];
    const widths = [132, 148, 164, 176, 188, 196];
    const width = choice(widths);
    const height = 76 + Math.floor(Math.random() * 18);

    return {
      style,
      width,
      height,
      centerX: clamp(state.craneX, DROP_MIN_X + width * 0.5, DROP_MAX_X - width * 0.5),
      y: CRANE_Y,
      vy: 0,
      tapeInset: randomBetween(18, 26),
      labelWidth: randomBetween(0.26, 0.38),
      labelOffset: randomBetween(-0.18, 0.18),
      tiltBias: randomBetween(-0.02, 0.02)
    };
  }

  function createPresetBox(width, height, offset, seed) {
    const box = createBox(seed);
    box.width = width;
    box.height = height;
    box.offset = offset;
    return box;
  }

  function getSupportForNextBox() {
    if (!state.stack.length) {
      return {
        centerX: CART_CENTER_X,
        width: CART_WIDTH * 0.84,
        topY: CART_DECK_Y
      };
    }

    const topBox = state.stack[state.stack.length - 1];
    return {
      centerX: topBox.centerX,
      width: topBox.width,
      topY: topBox.y
    };
  }

  function hasReachedLoadLimit() {
    const support = getSupportForNextBox();
    return state.stack.length >= MAX_STACK_BOXES || support.topY <= LOAD_LIMIT_TOP_Y;
  }

  function buildReasonText(reason) {
    if (reason === 'miss') {
      return '상자가 중심을 벗어나 카트 밖으로 떨어졌습니다.';
    }
    if (reason === 'capacity') {
      return '배송 카트가 가득 차 새 카트로 교체합니다.';
    }
    return '무게 중심이 무너져 적재물이 실제로 쓰러졌습니다.';
  }

  function createCollapseBoxes(reason, box, support) {
    const referenceX = box?.centerX ?? support?.centerX ?? CART_CENTER_X;
    const tiltDirection = Math.sign(referenceX - (support?.centerX ?? CART_CENTER_X))
      || Math.sign(state.lean || state.leanTarget)
      || 1;
    const sourceBoxes = [...state.stack];

    if (box && !sourceBoxes.includes(box)) {
      sourceBoxes.push(box);
    }

    return sourceBoxes.map((item, index) => {
      const depth = sourceBoxes.length <= 1 ? 0 : index / (sourceBoxes.length - 1);
      const spread = (depth - 0.5) * 120;
      const launchBoost = reason === 'balance' ? 1.18 : 0.9;
      const horizontal = tiltDirection * (80 + depth * 260) * launchBoost + spread + randomBetween(-26, 26);
      const vertical = -(60 + depth * 170) * launchBoost - randomBetween(0, 60);
      const angular = tiltDirection * (0.42 + depth * 1.28) + randomBetween(-0.18, 0.18);

      return {
        ...item,
        centerX: item.centerX,
        y: item.y,
        rotation: 0,
        vx: horizontal,
        vy: vertical,
        angularVelocity: angular,
        settled: false
      };
    });
  }

  function beginDispatchCycle() {
    if (state.mode !== 'playing') return;

    state.currentBox = null;
    state.fallingBox = null;
    state.spawnCooldown = 0;
    state.dispatchPhase = 'exit';
    state.dispatchTimer = 0;
    state.balance = Math.max(0, state.balance - 0.12);
    state.lean = 0;
    state.leanTarget = 0;
    state.cartBounce = Math.max(state.cartBounce, 22);
    showMessage('Load complete', '#647154');
    pushFloatingText('LOAD COMPLETE', CART_CENTER_X, getSupportForNextBox().topY - 24, '#647154');
    setMode('dispatching');
    updateHud();
  }

  function clearRunState() {
    state.score = 0;
    state.stage = 1;
    state.stack = [];
    state.currentBox = null;
    state.fallingBox = null;
    state.spawnCooldown = 0;
    state.balance = 0;
    state.lean = 0;
    state.leanTarget = 0;
    state.craneX = CART_CENTER_X;
    state.craneDirection = 1;
    state.craneSpeed = BASE_CRANE_SPEED;
    state.previewResetTimer = 0;
    state.autoDropTimer = 0;
    state.cartBounce = 0;
    state.cartOffsetX = 0;
    state.dispatchPhase = '';
    state.dispatchTimer = 0;
    state.collapseBoxes = [];
    state.collapseTimer = 0;
    state.collapseReasonText = '';
    state.collapseFinalizing = false;
    resetEffects();
    updateHud();
  }

  function seedShowcaseStack(count = 3) {
    state.stack = [];
    const presets = [
      createPresetBox(196, 84, 4, 0),
      createPresetBox(166, 76, -18, 1),
      createPresetBox(184, 82, 10, 2),
      createPresetBox(156, 78, -14, 3),
      createPresetBox(168, 84, 12, 4)
    ];

    let support = {
      centerX: CART_CENTER_X,
      width: CART_WIDTH * 0.84,
      topY: CART_DECK_Y
    };

    for (let index = 0; index < count; index += 1) {
      const next = presets[index];
      next.centerX = support.centerX + next.offset;
      next.y = support.topY - next.height;
      state.stack.push(next);
      support = {
        centerX: next.centerX,
        width: next.width,
        topY: next.y
      };
    }

    state.balance = count > 3 ? 0.28 : 0.18;
    state.leanTarget = count > 3 ? 0.045 : 0.03;
  }

  function prepareShowcaseScene(preview = false) {
    clearRunState();
    seedShowcaseStack(preview ? 4 : 3);
    state.currentBox = createBox(state.stack.length + 1);
    state.craneX = preview ? DROP_MIN_X + 48 : DROP_MIN_X + 96;
    state.currentBox.centerX = state.craneX;
    state.autoDropTimer = preview ? 0.65 : 0;
    updateHud();
  }

  function spawnNextBox() {
    const support = getSupportForNextBox();
    const box = createBox(state.score + state.stack.length + 1);
    const maxWidth = clamp(support.width + 44, 132, 196);
    const widthChoices = [132, 148, 164, 176, 188, 196].filter((value) => value <= maxWidth);
    if (widthChoices.length) {
      box.width = choice(widthChoices);
    }
    box.centerX = clamp(state.craneX, DROP_MIN_X + box.width * 0.5, DROP_MAX_X - box.width * 0.5);
    box.y = CRANE_Y + Math.sin(state.elapsed * 3.2) * 4;
    state.currentBox = box;
    state.autoDropTimer = randomBetween(0.45, 1.15);
  }

  function startRun() {
    clearRunState();
    setMode('playing');
    startOverlay.hidden = true;
    gameOverOverlay.hidden = true;
    spawnNextBox();
    updateStatusLines(topEntryText());
  }

  function resetPreviewScene() {
    prepareShowcaseScene(true);
    setMode('preview');
  }

  function evaluateLanding(box) {
    const support = getSupportForNextBox();
    const supportLeft = support.centerX - support.width * 0.5;
    const supportRight = support.centerX + support.width * 0.5;
    const boxLeft = box.centerX - box.width * 0.5;
    const boxRight = box.centerX + box.width * 0.5;
    const overlap = Math.min(supportRight, boxRight) - Math.max(supportLeft, boxLeft);
    const minOverlap = Math.max(42, Math.min(box.width, support.width) * 0.44);
    const offset = box.centerX - support.centerX;
    const offsetRatio = Math.abs(offset) / Math.max(34, support.width * 0.36);
    const precision = 1 - clamp(offsetRatio, 0, 1);

    return {
      support,
      overlap,
      minOverlap,
      offset,
      offsetRatio,
      precision,
      success: overlap >= minOverlap
    };
  }

  function finishPreviewFailure(box) {
    burst(box.centerX, Math.min(box.y + box.height * 0.7, GROUND_Y - 12), box.style.accent, 16, 1.2);
    state.currentBox = null;
    state.fallingBox = null;
    state.previewResetTimer = 0.82;
    state.leanTarget = clamp(state.leanTarget + randomBetween(-0.12, 0.12), -0.2, 0.2);
  }

  function landCurrentBox(box) {
    const result = evaluateLanding(box);
    if (!result.success) {
      if (state.mode === 'preview') {
        finishPreviewFailure(box);
        return;
      }

      endRun('miss', box, result.support);
      return;
    }

    box.y = result.support.topY - box.height;
    box.offset = result.offset;
    box.centerX = box.centerX;
    box.precision = result.precision;
    state.stack.push(box);
    state.currentBox = null;
    state.fallingBox = null;
    state.spawnCooldown = SPAWN_DELAY;
    state.cartBounce = Math.max(state.cartBounce, 18);

    if (state.mode === 'playing') {
      state.score += pointsPerBox();
      state.craneSpeed = computeCraneSpeed();
      const overlapPenalty = clamp(1 - ((result.overlap - result.minOverlap) / Math.max(1, result.support.width - result.minOverlap)), 0, 1);
      state.balance = clamp(
        state.balance + result.offsetRatio * 0.3 + overlapPenalty * 0.14 - result.precision * 0.03,
        0,
        1.08
      );
      state.leanTarget = clamp(state.leanTarget + result.offset * 0.0009, -0.24, 0.24);

      if (result.precision > 0.9) {
        state.balance = Math.max(0, state.balance - 0.05);
        showMessage('Perfect drop', '#bd6f52');
        pushFloatingText('PERFECT', box.centerX, box.y - 18, '#bd6f52');
      } else if (result.precision > 0.72) {
        state.balance = Math.max(0, state.balance - 0.015);
        showMessage('Nice placement', '#647154');
        pushFloatingText('NICE', box.centerX, box.y - 18, '#647154');
      }

      if (state.score > state.bestScore) {
        state.bestScore = state.score;
        saveLocalBest(state.bestScore);
      }

      burst(box.centerX, box.y + box.height * 0.28, box.style.tape, 8, 0.55);

      if (state.balance >= 1) {
        endRun('balance', box, result.support);
        return;
      }

      if (hasReachedLoadLimit()) {
        beginDispatchCycle();
        return;
      }
    }

    updateHud();
  }

  function dropCurrentBox() {
    if (!state.currentBox || state.fallingBox) return;
    state.fallingBox = state.currentBox;
    state.fallingBox.vy = 0;
    state.currentBox = null;
  }

  function setButtonsDisabled(disabled) {
    startButton.disabled = disabled;
    restartButton.disabled = disabled;
    lobbyButton.disabled = disabled;
  }

  async function finalizeGameOver() {
    if (state.collapseFinalizing || state.mode === 'gameover') return;

    state.collapseFinalizing = true;
    setMode('gameover');
    gameOverOverlay.hidden = false;
    finalScoreLine.textContent = `적재한 상자 ${state.score}개`;

    const reasonText = state.collapseReasonText || buildReasonText('balance');

    if (state.score <= 0 || IS_PREVIEW_MODE) {
      state.isSubmitting = false;
      gameOverStatus.textContent = `${reasonText}\n첫 기록은 저장되지 않았습니다.`;
      startStatus.textContent = topEntryText();
      state.collapseFinalizing = false;
      return;
    }

    state.isSubmitting = true;
    gameOverStatus.textContent = `${reasonText}\n기록을 저장하는 중입니다.`;
    setButtonsDisabled(true);

    try {
      const result = await submitScore(state.score);
      if (result?.accepted === false) {
        gameOverStatus.textContent = `${reasonText}\n개인 최고 기록 3개 밖이라 이번 점수는 저장되지 않았습니다.`;
      } else {
        gameOverStatus.textContent = `${reasonText}\n이번 점수 ${state.score}점이 반영되었습니다.`;
      }
    } catch (error) {
      console.warn('[Parcel Stack] Failed to submit score:', error);
      gameOverStatus.textContent = `${reasonText}\n점수 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.`;
    } finally {
      state.isSubmitting = false;
      setButtonsDisabled(false);
      await refreshTopEntry({ preserveGameOver: true });
      updateHud();
      state.collapseFinalizing = false;
    }
  }

  function endRun(reason, box, support) {
    if (state.mode === 'gameover' || state.mode === 'collapsing') return;

    const failX = box?.centerX ?? support?.centerX ?? CART_CENTER_X;
    const failY = box ? Math.min(box.y + box.height * 0.72, GROUND_Y - 18) : GROUND_Y - 36;
    burst(failX, failY, '#bd6f52', 22, 1.5);
    state.currentBox = null;
    state.fallingBox = null;
    state.spawnCooldown = 0;
    state.cartOffsetX = 0;
    state.dispatchPhase = '';
    state.dispatchTimer = 0;
    state.collapseBoxes = createCollapseBoxes(reason, box, support);
    state.collapseTimer = 0;
    state.collapseReasonText = buildReasonText(reason);
    state.collapseFinalizing = false;
    state.stack = [];
    state.leanTarget = clamp(state.leanTarget + randomBetween(-0.18, 0.18), -0.24, 0.24);
    state.cartBounce = Math.max(state.cartBounce, 20);
    gameOverOverlay.hidden = true;

    setMode('collapsing');
    updateHud();
  }

  async function legacyEndRun(reason, box, support) {
    if (state.mode === 'gameover') return;

    const failX = box?.centerX ?? support?.centerX ?? CART_CENTER_X;
    const failY = box ? Math.min(box.y + box.height * 0.72, GROUND_Y - 18) : GROUND_Y - 36;
    burst(failX, failY, '#bd6f52', 22, 1.5);
    state.currentBox = null;
    state.fallingBox = null;
    state.spawnCooldown = 0;
    state.leanTarget = clamp(state.leanTarget + randomBetween(-0.18, 0.18), -0.24, 0.24);

    setMode('gameover');
    gameOverOverlay.hidden = false;
    finalScoreLine.textContent = `적재한 상자 ${state.score}개`;

    const reasonText = reason === 'miss'
      ? '상자가 중심을 벗어나 카트 밖으로 떨어졌습니다.'
      : '무게 중심이 무너져 탑이 버티지 못했습니다.';

    if (state.score <= 0 || IS_PREVIEW_MODE) {
      state.isSubmitting = false;
      gameOverStatus.textContent = `${reasonText}\n첫 기록은 저장되지 않았습니다.`;
      startStatus.textContent = topEntryText();
      return;
    }

    state.isSubmitting = true;
    gameOverStatus.textContent = `${reasonText}\n기록을 저장하는 중입니다.`;
    setButtonsDisabled(true);

    try {
      const result = await submitScore(state.score);
      if (result?.accepted === false) {
        gameOverStatus.textContent = `${reasonText}\n개인 최고 기록 3개 밖이라 이번 점수는 저장되지 않았습니다.`;
      } else {
        gameOverStatus.textContent = `${reasonText}\n이번 점수 ${state.score}점이 반영되었습니다.`;
      }
    } catch (error) {
      console.warn('[Parcel Stack] Failed to submit score:', error);
      gameOverStatus.textContent = `${reasonText}\n점수 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.`;
    } finally {
      state.isSubmitting = false;
      setButtonsDisabled(false);
      await refreshTopEntry({ preserveGameOver: true });
      updateHud();
    }
  }

  function updateCurrentBoxMotion(dt) {
    if (!state.currentBox) return;

    const halfWidth = state.currentBox.width * 0.5;
    const minX = DROP_MIN_X + halfWidth;
    const maxX = DROP_MAX_X - halfWidth;
    state.craneX += state.craneDirection * state.craneSpeed * dt;

    if (state.craneX <= minX) {
      state.craneX = minX;
      state.craneDirection = 1;
    } else if (state.craneX >= maxX) {
      state.craneX = maxX;
      state.craneDirection = -1;
    }

    state.currentBox.centerX = state.craneX;
    state.currentBox.y = CRANE_Y + Math.sin(state.elapsed * 3.6 + state.currentBox.width * 0.02) * 5;
  }

  function updateFallingBox(dt) {
    if (!state.fallingBox) return;

    state.fallingBox.vy += GRAVITY * dt;
    state.fallingBox.y += state.fallingBox.vy * dt;

    const support = getSupportForNextBox();
    if (state.fallingBox.y + state.fallingBox.height >= support.topY) {
      landCurrentBox(state.fallingBox);
    } else if (state.fallingBox.y > CANVAS_HEIGHT + 120) {
      if (state.mode === 'preview') {
        finishPreviewFailure(state.fallingBox);
      } else {
        endRun('miss', state.fallingBox, support);
      }
    }
  }

  function updateDispatch(dt) {
    if (state.dispatchPhase === 'exit') {
      state.dispatchTimer += dt;
      const progress = clamp(state.dispatchTimer / DISPATCH_EXIT_DURATION, 0, 1);
      state.cartOffsetX = easeOutCubic(progress) * DISPATCH_TRAVEL_X;

      if (progress >= 1) {
        state.stack = [];
        state.stage += 1;
        state.balance = 0;
        state.lean = 0;
        state.leanTarget = 0;
        state.craneSpeed = computeCraneSpeed();
        state.cartOffsetX = -DISPATCH_TRAVEL_X;
        state.dispatchPhase = 'enter';
        state.dispatchTimer = 0;
        updateHud();
      }
      return;
    }

    if (state.dispatchPhase === 'enter') {
      state.dispatchTimer += dt;
      const progress = clamp(state.dispatchTimer / DISPATCH_ENTRY_DURATION, 0, 1);
      state.cartOffsetX = lerp(-DISPATCH_TRAVEL_X, 0, easeOutCubic(progress));

      if (progress >= 1) {
        state.cartOffsetX = 0;
        state.dispatchPhase = '';
        setMode('playing');
        showMessage(`Stage ${state.stage}`, '#bd6f52');
        pushFloatingText(`STAGE ${state.stage}`, CANVAS_WIDTH * 0.5, 316, '#bd6f52');
        spawnNextBox();
        updateHud();
      }
    }
  }

  function updateCollapse(dt) {
    state.collapseBoxes.forEach((box) => {
      if (box.settled) return;

      box.vy += COLLAPSE_GRAVITY * dt;
      box.centerX += box.vx * dt;
      box.y += box.vy * dt;
      box.rotation += box.angularVelocity * dt;

      if (box.y + box.height >= GROUND_Y) {
        box.y = GROUND_Y - box.height;
        box.vy *= -0.18;
        box.vx *= 0.84;
        box.angularVelocity *= 0.72;

        if (Math.abs(box.vy) < 36) {
          box.vy = 0;
        }
      }

      if (box.centerX - box.width * 0.5 < 32) {
        box.centerX = 32 + box.width * 0.5;
        box.vx *= -0.18;
      } else if (box.centerX + box.width * 0.5 > CANVAS_WIDTH - 32) {
        box.centerX = CANVAS_WIDTH - 32 - box.width * 0.5;
        box.vx *= -0.18;
      }

      if (box.y + box.height >= GROUND_Y && Math.abs(box.vx) < 18 && Math.abs(box.angularVelocity) < 0.12) {
        box.settled = true;
      }
    });

    state.collapseTimer += dt;

    if (!state.collapseFinalizing && state.collapseTimer >= COLLAPSE_DURATION) {
      finalizeGameOver();
    }
  }

  function updateDemoPreview(dt) {
    if (state.previewResetTimer > 0) {
      state.previewResetTimer -= dt;
      if (state.previewResetTimer <= 0) {
        resetPreviewScene();
      }
      return;
    }

    if (!state.currentBox && !state.fallingBox && state.spawnCooldown <= 0) {
      spawnNextBox();
    }

    updateCurrentBoxMotion(dt);
    updateFallingBox(dt);

    if (state.spawnCooldown > 0) {
      state.spawnCooldown -= dt;
    }

    if (state.currentBox && !state.fallingBox) {
      state.autoDropTimer -= dt;
      const support = getSupportForNextBox();
      const tolerance = Math.max(16, support.width * 0.18);
      if (state.autoDropTimer <= 0 && Math.abs(state.currentBox.centerX - support.centerX) <= tolerance) {
        dropCurrentBox();
      }
    }

    if (state.stack.length >= 7) {
      state.previewResetTimer = 0.84;
    }
  }

  function updateParticles(dt) {
    state.particles = state.particles.filter((particle) => {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 420 * dt;
      return particle.life > 0;
    });
  }

  function updateFloatingTexts(dt) {
    state.floatingTexts = state.floatingTexts.filter((item) => {
      item.life -= dt;
      item.y += item.vy * dt;
      return item.life > 0;
    });
  }

  function updateBackgroundMotion(dt) {
    state.hookBob += dt;
    state.vanX += state.vanSpeed * dt;
    if (state.vanX > CANVAS_WIDTH + 220) {
      state.vanX = -260;
      state.vanSpeed = randomBetween(28, 42);
    }
  }

  function updatePhysics(dt) {
    state.cartBounce = lerp(state.cartBounce, 0, 1 - Math.exp(-dt * 8));
    state.lean = lerp(state.lean, state.leanTarget, 1 - Math.exp(-dt * 4.5));
    state.leanTarget *= Math.exp(-dt * 1.1);

    if (state.mode === 'playing') {
      state.balance = clamp(
        state.balance + Math.abs(state.lean) * dt * 0.05 + Math.max(0, state.stage - 1) * dt * 0.012 - dt * 0.003,
        0,
        1.08
      );
      if (state.balance >= 0.98) {
        endRun('balance');
      }
    }

    if (state.messageTimer > 0) {
      state.messageTimer -= dt;
      if (state.messageTimer <= 0) {
        state.messageText = '';
      }
    }
  }

  function update(dt) {
    state.elapsed += dt;

    updateBackgroundMotion(dt);
    updateParticles(dt);
    updateFloatingTexts(dt);
    updatePhysics(dt);

    if (state.mode === 'preview') {
      updateDemoPreview(dt);
      return;
    }

    if (state.mode === 'dispatching') {
      updateDispatch(dt);
      return;
    }

    if (state.mode === 'collapsing') {
      updateCollapse(dt);
      return;
    }

    if (state.mode === 'ready') {
      updateCurrentBoxMotion(dt);
      return;
    }

    if (state.mode === 'playing') {
      if (!state.currentBox && !state.fallingBox && state.spawnCooldown <= 0) {
        spawnNextBox();
      }

      if (state.spawnCooldown > 0) {
        state.spawnCooldown -= dt;
      }

      updateCurrentBoxMotion(dt);
      updateFallingBox(dt);
    }
  }

  function drawSky() {
    const gradient = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    gradient.addColorStop(0, '#f5edd8');
    gradient.addColorStop(0.45, '#e4ddd0');
    gradient.addColorStop(1, '#d7d2c5');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, GROUND_Y);

    const sun = ctx.createRadialGradient(714, 154, 14, 714, 154, 116);
    sun.addColorStop(0, 'rgba(255, 248, 226, 0.95)');
    sun.addColorStop(0.65, 'rgba(255, 242, 205, 0.42)');
    sun.addColorStop(1, 'rgba(255, 242, 205, 0)');
    ctx.fillStyle = sun;
    ctx.fillRect(590, 24, 248, 248);
  }

  function drawBuildings() {
    const buildings = [
      { x: 32, width: 148, height: 312, color: '#c1b6a4' },
      { x: 164, width: 108, height: 246, color: '#b5aa9b' },
      { x: 594, width: 144, height: 288, color: '#beb19d' },
      { x: 726, width: 118, height: 238, color: '#b2a590' }
    ];

    buildings.forEach((building, index) => {
      const y = 244 + (index % 2) * 28;
      drawRoundedRect(building.x, y, building.width, building.height, 24, building.color);
      drawRoundedRect(building.x + 12, y + 18, building.width - 24, building.height - 36, 18, 'rgba(255, 255, 255, 0.12)');

      ctx.fillStyle = 'rgba(71, 69, 64, 0.1)';
      for (let row = 0; row < 5; row += 1) {
        for (let col = 0; col < 3; col += 1) {
          drawRoundedRect(
            building.x + 22 + col * 30,
            y + 32 + row * 48,
            18,
            26,
            6,
            index % 2 === 0 ? 'rgba(255, 250, 235, 0.22)' : 'rgba(96, 96, 96, 0.12)'
          );
        }
      }
    });
  }

  function drawMarketFront() {
    drawRoundedRect(84, 574, 732, 276, 28, '#efe8d7');
    strokeRoundedRect(84, 574, 732, 276, 28, 'rgba(80, 69, 54, 0.08)', 2);

    const stalls = [
      { x: 112, width: 206, awning: '#c17355', window: '#f2eee4' },
      { x: 346, width: 188, awning: '#6c7a5f', window: '#f5f0e7' },
      { x: 560, width: 228, awning: '#c78564', window: '#efe9de' }
    ];

    stalls.forEach((stall, index) => {
      drawRoundedRect(stall.x, 618, stall.width, 196, 22, stall.window);
      drawRoundedRect(stall.x - 4, 604, stall.width + 8, 40, 18, stall.awning);
      for (let stripe = 0; stripe < 6; stripe += 1) {
        ctx.fillStyle = stripe % 2 === 0 ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.03)';
        ctx.fillRect(stall.x + stripe * ((stall.width + 8) / 6), 604, 18, 40);
      }
      drawRoundedRect(stall.x + 18, 658, stall.width - 36, 96, 18, 'rgba(110, 118, 126, 0.08)');
      drawRoundedRect(stall.x + 22, 768, stall.width - 44, 24, 12, 'rgba(88, 77, 60, 0.06)');
      if (index === 1) {
        ctx.fillStyle = '#6c7a5f';
        ctx.font = '700 24px Bahnschrift';
        ctx.textAlign = 'center';
        ctx.fillText('PICKUP', stall.x + stall.width * 0.5, 646);
      }
    });
  }

  function drawStreetAndVan() {
    drawRoundedRect(0, 884, CANVAS_WIDTH, 716, 0, '#c9c2b4');
    drawRoundedRect(0, 970, CANVAS_WIDTH, 630, 0, '#7d7b78');

    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    for (let index = 0; index < 7; index += 1) {
      ctx.fillRect(92 + index * 124, 1038, 70, 18);
    }

    drawRoundedRect(62, 890, 776, 70, 22, '#ddd7cb');
    drawRoundedRect(110, 898, 136, 52, 18, '#f5efe1');
    ctx.fillStyle = '#586352';
    ctx.font = '700 24px Bahnschrift';
    ctx.textAlign = 'left';
    ctx.fillText('DELIVERY STOP', 132, 932);

    const vanX = state.vanX;
    const vanY = 1018;
    ctx.save();
    ctx.globalAlpha = 0.78;
    drawRoundedRect(vanX, vanY, 164, 86, 18, '#ece3d1');
    drawRoundedRect(vanX + 98, vanY - 26, 54, 58, 16, '#ece3d1');
    drawRoundedRect(vanX + 14, vanY + 16, 64, 32, 10, '#d6d0c6');
    drawRoundedRect(vanX + 100, vanY - 8, 42, 20, 8, '#c6d2dc');
    drawRoundedRect(vanX + 30, vanY + 52, 100, 12, 6, '#c17355');
    ctx.fillStyle = '#4f504f';
    ctx.beginPath();
    ctx.arc(vanX + 36, vanY + 88, 18, 0, Math.PI * 2);
    ctx.arc(vanX + 128, vanY + 88, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawForegroundProps() {
    const bollards = [102, 162, 744, 804];
    bollards.forEach((x) => {
      drawRoundedRect(x, 1178, 20, 132, 10, '#62594f');
      drawRoundedRect(x + 3, 1188, 14, 28, 7, '#d8c280');
    });

    drawRoundedRect(46, 1228, 76, 116, 20, '#d4cab6');
    drawRoundedRect(778, 1218, 82, 126, 20, '#d7ccb9');
    drawRoundedRect(58, 1250, 52, 16, 8, '#ffffff');
    drawRoundedRect(790, 1244, 58, 16, 8, '#f7f4ea');
  }

  function drawCrane() {
    const carrierX = state.fallingBox?.centerX ?? state.currentBox?.centerX ?? state.craneX;
    const cableBottom = state.fallingBox
      ? state.fallingBox.y + 8
      : state.currentBox
        ? state.currentBox.y + 8
        : CRANE_Y + 20;

    drawRoundedRect(144, 154, 612, 18, 9, '#d7d2c8');
    drawRoundedRect(144, 160, 612, 6, 3, 'rgba(255, 255, 255, 0.48)');

    drawRoundedRect(carrierX - 30, 142, 60, 42, 12, '#8d918f');
    drawRoundedRect(carrierX - 18, 150, 36, 18, 9, 'rgba(255, 255, 255, 0.24)');

    ctx.strokeStyle = '#686c6a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(carrierX, 184);
    ctx.lineTo(carrierX, cableBottom);
    ctx.stroke();

    drawRoundedRect(carrierX - 16, cableBottom - 6, 32, 16, 8, '#6d736f');
    drawRoundedRect(carrierX - 10, cableBottom + 8, 20, 16, 8, '#5e645e');
  }

  function drawCart() {
    const bounce = state.cartBounce;
    const deckY = CART_DECK_Y + bounce;
    const bodyY = deckY + 22;

    ctx.save();
    ctx.translate(state.cartOffsetX, bounce);

    ctx.fillStyle = 'rgba(41, 42, 42, 0.16)';
    ctx.beginPath();
    ctx.ellipse(CART_CENTER_X, bodyY + 120, 210, 30, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#707777';
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(CART_CENTER_X - 166, bodyY + 34);
    ctx.lineTo(CART_CENTER_X - 126, bodyY - 28);
    ctx.lineTo(CART_CENTER_X + 126, bodyY - 28);
    ctx.lineTo(CART_CENTER_X + 166, bodyY + 34);
    ctx.stroke();

    drawRoundedRect(CART_CENTER_X - 170, deckY, 340, 36, 18, '#7f8584');
    drawRoundedRect(CART_CENTER_X - 154, bodyY + 12, 308, 42, 18, '#676d6b');

    ctx.fillStyle = '#f3efdf';
    for (let rail = 0; rail < 4; rail += 1) {
      drawRoundedRect(CART_CENTER_X - 128 + rail * 82, bodyY + 20, 54, 8, 4, 'rgba(255, 255, 255, 0.24)');
    }

    ctx.fillStyle = '#464847';
    ctx.beginPath();
    ctx.arc(CART_CENTER_X - 124, bodyY + 88, 28, 0, Math.PI * 2);
    ctx.arc(CART_CENTER_X + 124, bodyY + 88, 28, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#dad7cf';
    ctx.beginPath();
    ctx.arc(CART_CENTER_X - 124, bodyY + 88, 10, 0, Math.PI * 2);
    ctx.arc(CART_CENTER_X + 124, bodyY + 88, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawBox(box, rotation = 0) {
    ctx.save();
    ctx.translate(box.centerX, box.y + box.height * 0.5);
    ctx.rotate(rotation);
    ctx.translate(-box.width * 0.5, -box.height * 0.5);

    ctx.shadowColor = 'rgba(47, 39, 29, 0.16)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 12;
    drawRoundedRect(0, 0, box.width, box.height, 18, box.style.base);
    ctx.shadowColor = 'transparent';

    drawRoundedRect(8, 8, box.width - 16, box.height * 0.26, 14, box.style.top);
    drawRoundedRect(box.tapeInset, 0, 24, box.height, 10, box.style.tape);
    drawRoundedRect(box.width - box.tapeInset - 24, 0, 24, box.height, 10, box.style.tape);

    const labelWidth = box.width * box.labelWidth;
    const labelX = box.width * 0.5 - labelWidth * 0.5 + box.width * box.labelOffset;
    drawRoundedRect(labelX, box.height * 0.36, labelWidth, box.height * 0.22, 8, box.style.label);
    strokeRoundedRect(labelX, box.height * 0.36, labelWidth, box.height * 0.22, 8, 'rgba(88, 79, 61, 0.08)', 1.5);

    ctx.fillStyle = box.style.stamp;
    ctx.font = '700 18px Bahnschrift';
    ctx.textAlign = 'center';
    ctx.fillText('CITY', box.width * 0.5, box.height * 0.5 + 6);

    drawRoundedRect(16, box.height - 24, 56, 10, 5, 'rgba(255, 255, 255, 0.16)');
    drawRoundedRect(box.width - 86, box.height - 30, 70, 14, 6, box.style.accent);
    strokeRoundedRect(0.5, 0.5, box.width - 1, box.height - 1, 18, 'rgba(73, 50, 29, 0.16)', 2);
    ctx.restore();
  }

  function drawHeldAndFallingBoxes() {
    if (state.mode === 'collapsing') {
      state.collapseBoxes.forEach((box) => {
        drawBox(box, box.rotation || 0);
      });
    } else {
      state.stack.forEach((box, index) => {
        const depth = state.stack.length > 1 ? index / (state.stack.length - 1) : 0;
        const sway = state.lean * (0.2 + depth * 0.78) + box.tiltBias;
        drawBox({ ...box, centerX: box.centerX + state.cartOffsetX }, sway);
      });
    }

    if (state.currentBox) {
      drawBox(state.currentBox, Math.sin(state.elapsed * 2.8) * 0.016);
    }

    if (state.fallingBox) {
      const spin = clamp(state.fallingBox.vy / 3800, -0.06, 0.06) * (state.fallingBox.centerX >= getSupportForNextBox().centerX ? 1 : -1);
      drawBox(state.fallingBox, spin);
    }
  }

  function drawMessageOverlay() {
    if (!state.messageText || state.messageTimer <= 0) return;

    ctx.save();
    ctx.globalAlpha = clamp(state.messageTimer / 1.1, 0, 1);
    ctx.fillStyle = state.messageColor;
    ctx.font = '700 26px Bahnschrift';
    ctx.textAlign = 'center';
    ctx.fillText(state.messageText, CANVAS_WIDTH * 0.5, 298 + Math.sin(state.elapsed * 5) * 3);
    ctx.restore();
  }

  function drawFloatingTexts() {
    state.floatingTexts.forEach((item) => {
      ctx.save();
      ctx.globalAlpha = clamp(item.life / item.maxLife, 0, 1);
      ctx.fillStyle = item.color;
      ctx.font = '700 24px Bahnschrift';
      ctx.textAlign = 'center';
      ctx.fillText(item.text, item.x, item.y);
      ctx.restore();
    });
  }

  function drawParticles() {
    state.particles.forEach((particle) => {
      ctx.save();
      ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  function drawBalanceHint() {
    if (state.mode !== 'playing') return;

    const centerX = CANVAS_WIDTH * 0.5;
    const y = 84;
    drawRoundedRect(centerX - 116, y, 232, 10, 5, 'rgba(61, 57, 49, 0.12)');
    drawRoundedRect(centerX - 116, y, 232 * (1 - clamp(state.balance, 0, 1)), 10, 5, '#6b7a5c');
    drawRoundedRect(centerX - 3 + state.lean * 420, y - 9, 6, 28, 3, '#bd6f52');
  }

  function render() {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    drawSky();
    drawBuildings();
    drawMarketFront();
    drawStreetAndVan();
    drawCrane();
    drawCart();
    drawHeldAndFallingBoxes();
    drawForegroundProps();
    drawParticles();
    drawFloatingTexts();
    drawMessageOverlay();
    drawBalanceHint();
  }

  function handlePrimaryAction() {
    if (state.mode === 'ready') {
      startRun();
      return;
    }

    if (state.mode === 'gameover') {
      if (!state.isSubmitting) {
        startRun();
      }
      return;
    }

    if (state.mode === 'playing' && state.currentBox && !state.fallingBox) {
      dropCurrentBox();
    }
  }

  function bindEvents() {
    canvas.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      handlePrimaryAction();
    });

    startButton.addEventListener('click', () => {
      startRun();
    });

    restartButton.addEventListener('click', () => {
      startRun();
    });

    lobbyButton.addEventListener('click', () => {
      returnToMinigameHub();
    });

    window.addEventListener('keydown', (event) => {
      if (event.code !== 'Space' && event.code !== 'Enter') return;
      event.preventDefault();
      handlePrimaryAction();
    });
  }

  function frame(now) {
    const seconds = now * 0.001;
    const dt = state.lastFrameTime ? Math.min(0.033, seconds - state.lastFrameTime) : 0.016;
    state.lastFrameTime = seconds;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  async function initialize() {
    bindEvents();

    if (IS_PREVIEW_MODE) {
      resetPreviewScene();
    } else {
      prepareShowcaseScene(false);
      setMode('ready');
      await refreshTopEntry();
    }

    updateHud();
    requestAnimationFrame(frame);
  }

  initialize().catch((error) => {
    console.error('[Parcel Stack] Failed to initialize:', error);
    updateStatusLines('게임을 초기화하지 못했습니다.');
    requestAnimationFrame(frame);
  });
})();
