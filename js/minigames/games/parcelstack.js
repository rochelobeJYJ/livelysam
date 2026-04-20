(function () {
  'use strict';

  const MINIGAME_ID = 'parcel-stack';
  const LEADERBOARD_MODE = 'all-scores';
  const MAX_SCORES_PER_PLAYER = 3;
  const LOCAL_BEST_KEY = 'parcelStackLocalBest';
  const LOCAL_STAGE_PROGRESS_KEY = 'parcelStackStageProgress';
  const IS_PREVIEW_MODE = new URLSearchParams(window.location.search).get('preview') === '1';

  const CANVAS_WIDTH = 900;
  const CANVAS_HEIGHT = 1600;
  const CRANE_Y = 220;
  const DROP_MAX_HALF_RANGE = 330;
  const DROP_STAGE1_HALF_RANGE = 280;
  const DROP_HALF_RANGE_GAIN = 12;
  const DROP_POST_SPEED_CAP_GAIN = 8;
  const DROP_POST_SPEED_CAP_MAX = 362;
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
  const COLLAPSE_GRAVITY = 2520;
  const COLLAPSE_RESTITUTION = 0.08;
  const COLLAPSE_FRICTION = 0.42;
  const COLLAPSE_SETTLE_LINEAR = 42;
  const COLLAPSE_SETTLE_ANGULAR = 0.48;
  const COLLAPSE_OVERLAY_DELAY = 0.12;
  const COLLAPSE_OVERLAY_MAX_TIME = 3.6;
  const COLLAPSE_PIVOT_DAMPING = 1.7;
  const COLLAPSE_SOLVER_STEP = 1 / 120;
  const COLLAPSE_SOLVER_ITERATIONS = 10;
  const COLLAPSE_SOLVER_SLOP = 1.1;
  const COLLAPSE_SOLVER_BAUMGARTE = 0.72;
  const COLLAPSE_AIR_LINEAR_DAMPING = 0.06;
  const COLLAPSE_AIR_ANGULAR_DAMPING = 0.16;
  const COLLAPSE_SLEEP_LINEAR = 14;
  const COLLAPSE_SLEEP_VERTICAL = 18;
  const COLLAPSE_SLEEP_ANGULAR = 0.16;
  const BASE_BOX_SCORE = 5;
  const BASE_CRANE_SPEED = 132;
  const STAGE_SPEED_GAIN = 42;
  const SPEED_CAP_STAGE = 7;
  const SCENE_RENDER_SCALE_X = 0.94;
  const SCENE_RENDER_SCALE_Y = 1;
  const SCENE_RENDER_OFFSET_Y = 0;
  const SCENE_WORLD_BLEED_X = ((CANVAS_WIDTH / SCENE_RENDER_SCALE_X) - CANVAS_WIDTH) * 0.5;

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
  const startStageGroup = document.getElementById('startStageGroup');
  const startStageSelect = document.getElementById('startStageSelect');
  const startStageNote = document.getElementById('startStageNote');
  const restartStageGroup = document.getElementById('restartStageGroup');
  const restartStageSelect = document.getElementById('restartStageSelect');
  const restartStageNote = document.getElementById('restartStageNote');

  const initialStageProgress = loadStageProgress();

  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;

  const state = {
    mode: IS_PREVIEW_MODE ? 'preview' : 'ready',
    lastFrameTime: 0,
    elapsed: 0,
    score: 0,
    stage: 1,
    bestScore: loadLocalBest(),
    stageProgress: initialStageProgress,
    selectedStartStage: initialStageProgress.preferredStartStage,
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
    collapseBaseBoxes: [],
    collapseBoxes: [],
    collapseRigidBody: null,
    collapseSettledTimer: 0,
    collapseTimer: 0,
    collapseReasonText: '',
    collapseFinalizing: false,
    messageText: '',
    messageColor: '#647154',
    messageTimer: 0
  };
  let animationFrameId = 0;
  let isDisposed = false;

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

  function estimateStageStartScore(stage) {
    let total = 0;

    for (let currentStage = 1; currentStage < stage; currentStage += 1) {
      total += MAX_STACK_BOXES * (BASE_BOX_SCORE + Math.max(0, currentStage - 1));
    }

    return total;
  }

  function readStoredStageScore(startScores, stage) {
    const rawValue = startScores?.[stage] ?? startScores?.[String(stage)];
    const score = parseInt(rawValue, 10);
    return Number.isFinite(score) ? Math.max(0, score) : null;
  }

  function loadStageProgress() {
    if (IS_PREVIEW_MODE) {
      return {
        maxUnlockedStage: 1,
        preferredStartStage: 1,
        startScores: { 1: 0 }
      };
    }

    try {
      const raw = JSON.parse(localStorage.getItem(LOCAL_STAGE_PROGRESS_KEY) || '{}');
      const maxUnlockedStage = Math.max(1, parseInt(raw?.maxUnlockedStage, 10) || 1);
      const startScores = { 1: 0 };

      if (raw?.startScores && typeof raw.startScores === 'object') {
        Object.keys(raw.startScores).forEach((key) => {
          const stage = Math.max(1, parseInt(key, 10) || 1);
          const score = parseInt(raw.startScores[key], 10);
          if (Number.isFinite(score)) {
            startScores[stage] = Math.max(0, score);
          }
        });
      }

      for (let stage = 2; stage <= maxUnlockedStage; stage += 1) {
        if (readStoredStageScore(startScores, stage) == null) {
          startScores[stage] = estimateStageStartScore(stage);
        }
      }

      const preferredStartStage = clamp(
        parseInt(raw?.preferredStartStage, 10) || maxUnlockedStage,
        1,
        maxUnlockedStage
      );

      return {
        maxUnlockedStage,
        preferredStartStage,
        startScores
      };
    } catch {
      return {
        maxUnlockedStage: 1,
        preferredStartStage: 1,
        startScores: { 1: 0 }
      };
    }
  }

  function saveStageProgress() {
    if (IS_PREVIEW_MODE) return;

    try {
      localStorage.setItem(LOCAL_STAGE_PROGRESS_KEY, JSON.stringify({
        maxUnlockedStage: state.stageProgress.maxUnlockedStage,
        preferredStartStage: state.stageProgress.preferredStartStage,
        startScores: state.stageProgress.startScores
      }));
    } catch {
      // ignore storage failures
    }
  }

  function getMaxUnlockedStage() {
    return Math.max(1, parseInt(state.stageProgress?.maxUnlockedStage, 10) || 1);
  }

  function resolveStageStartScore(stage) {
    if (stage <= 1) return 0;
    return readStoredStageScore(state.stageProgress?.startScores, stage) ?? estimateStageStartScore(stage);
  }

  function buildStageOptionLabel(stage) {
    if (stage <= 1) {
      return 'Stage 1 · Fresh Start';
    }

    return `Stage ${stage} · ${resolveStageStartScore(stage)} pts`;
  }

  function updateStageSelectControl(group, select, note) {
    if (!group || !select || !note) return;

    const maxUnlockedStage = getMaxUnlockedStage();
    const selectedStage = clamp(state.selectedStartStage || 1, 1, maxUnlockedStage);
    group.hidden = maxUnlockedStage <= 1;

    if (group.hidden) {
      note.textContent = '';
      return;
    }

    const options = [];
    for (let stage = 1; stage <= maxUnlockedStage; stage += 1) {
      options.push(`<option value="${stage}">${buildStageOptionLabel(stage)}</option>`);
    }

    select.innerHTML = options.join('');
    select.value = String(selectedStage);

    if (selectedStage <= 1) {
      note.textContent = '0 pts';
    } else {
      note.textContent = `${resolveStageStartScore(selectedStage)} pts saved`;
    }
  }

  function syncStageStartControls() {
    updateStageSelectControl(startStageGroup, startStageSelect, startStageNote);
    updateStageSelectControl(restartStageGroup, restartStageSelect, restartStageNote);

    startButton.textContent = state.selectedStartStage > 1
      ? `Stage ${state.selectedStartStage} Start`
      : '바로 시작';
    restartButton.textContent = state.selectedStartStage > 1
      ? `Stage ${state.selectedStartStage} Restart`
      : '다시 하기';
  }

  function setSelectedStartStage(stage, options = {}) {
    const maxUnlockedStage = getMaxUnlockedStage();
    const normalizedStage = clamp(parseInt(stage, 10) || 1, 1, maxUnlockedStage);
    state.selectedStartStage = normalizedStage;
    state.stageProgress.preferredStartStage = normalizedStage;

    if (options.persist !== false) {
      saveStageProgress();
    }

    syncStageStartControls();
  }

  function rememberUnlockedStage(stage, score) {
    if (IS_PREVIEW_MODE) return;

    const normalizedStage = Math.max(1, parseInt(stage, 10) || 1);
    const normalizedScore = Math.max(0, Math.floor(score));
    const previousMaxStage = getMaxUnlockedStage();
    const previousScore = readStoredStageScore(state.stageProgress.startScores, normalizedStage) ?? 0;

    state.stageProgress.maxUnlockedStage = Math.max(previousMaxStage, normalizedStage);
    state.stageProgress.startScores[normalizedStage] = Math.max(previousScore, normalizedScore);

    if (normalizedStage > previousMaxStage) {
      state.selectedStartStage = normalizedStage;
      state.stageProgress.preferredStartStage = normalizedStage;
    }

    saveStageProgress();
    syncStageStartControls();
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

  function chooseWidthForStage(widthChoices) {
    if (state.stage <= SPEED_CAP_STAGE || widthChoices.length <= 1) {
      return choice(widthChoices);
    }

    const stageBias = Math.min(3, state.stage - SPEED_CAP_STAGE);
    const weightedChoices = [];

    widthChoices.forEach((value, index) => {
      const smallerBias = widthChoices.length - index;
      const weight = Math.max(1, smallerBias + stageBias - 1);

      for (let repeat = 0; repeat < weight; repeat += 1) {
        weightedChoices.push(value);
      }
    });

    return choice(weightedChoices);
  }

  function pointsPerBox() {
    return BASE_BOX_SCORE + Math.max(0, state.stage - 1);
  }

  function computeCraneSpeed() {
    const effectiveStage = Math.min(state.stage, SPEED_CAP_STAGE);
    return Math.min(560, BASE_CRANE_SPEED + (effectiveStage - 1) * STAGE_SPEED_GAIN);
  }

  function getDropHalfRange() {
    const baseRange = Math.min(
      DROP_MAX_HALF_RANGE,
      DROP_STAGE1_HALF_RANGE + Math.max(0, state.stage - 1) * DROP_HALF_RANGE_GAIN
    );

    if (state.stage <= SPEED_CAP_STAGE) {
      return baseRange;
    }

    return Math.min(
      DROP_POST_SPEED_CAP_MAX,
      baseRange + (state.stage - SPEED_CAP_STAGE) * DROP_POST_SPEED_CAP_GAIN
    );
  }

  function getDropBounds(boxWidth = 0) {
    const halfWidth = boxWidth * 0.5;
    const halfRange = getDropHalfRange();

    return {
      minX: CART_CENTER_X - halfRange + halfWidth,
      maxX: CART_CENTER_X + halfRange - halfWidth
    };
  }

  function beginSceneProjection() {
    ctx.save();
    ctx.translate(CANVAS_WIDTH * 0.5, 0);
    ctx.scale(SCENE_RENDER_SCALE_X, SCENE_RENDER_SCALE_Y);
    ctx.translate(-CANVAS_WIDTH * 0.5, SCENE_RENDER_OFFSET_Y);
  }

  function getBodyMass(body) {
    return Math.max(1, body.width * body.height);
  }

  function getBodyBounds(body) {
    return {
      left: body.centerX - body.width * 0.5,
      right: body.centerX + body.width * 0.5
    };
  }

  function getCartSupportBody() {
    return {
      centerX: CART_CENTER_X + state.cartOffsetX,
      width: CART_WIDTH * 0.84,
      topY: CART_DECK_Y
    };
  }

  function analyzeStackPhysics(stack = state.stack) {
    if (!Array.isArray(stack) || !stack.length) {
      return {
        stable: true,
        reserveRatio: 1,
        balance: 0,
        criticalOffset: 0,
        failure: null
      };
    }

    const substackComX = new Array(stack.length);
    let accumulatedMass = 0;
    let accumulatedMoment = 0;

    for (let index = stack.length - 1; index >= 0; index -= 1) {
      const body = stack[index];
      const mass = getBodyMass(body);
      accumulatedMass += mass;
      accumulatedMoment += mass * body.centerX;
      substackComX[index] = accumulatedMoment / accumulatedMass;
    }

    let minReserveRatio = 1;
    let criticalOffset = 0;

    for (let index = 0; index < stack.length; index += 1) {
      const supported = stack[index];
      const support = index === 0 ? getCartSupportBody() : stack[index - 1];
      const supportBounds = getBodyBounds(support);
      const supportedBounds = getBodyBounds(supported);
      const contactLeft = Math.max(supportBounds.left, supportedBounds.left);
      const contactRight = Math.min(supportBounds.right, supportedBounds.right);
      const contactWidth = contactRight - contactLeft;
      const comX = substackComX[index];
      const contactCenter = (contactLeft + contactRight) * 0.5;
      const halfContact = Math.max(contactWidth * 0.5, 1);
      const offsetRatio = (comX - contactCenter) / halfContact;

      if (contactWidth <= 0 || comX < contactLeft || comX > contactRight) {
        return {
          stable: false,
          reserveRatio: 0,
          balance: 1,
          criticalOffset: clamp(offsetRatio, -2, 2),
          failure: {
            index,
            support,
            supported,
            comX,
            contactLeft,
            contactRight,
            contactCenter,
            contactWidth
          }
        };
      }

      const reserve = Math.min(comX - contactLeft, contactRight - comX);
      const reserveRatio = clamp(reserve / halfContact, 0, 1);

      if (reserveRatio <= minReserveRatio) {
        minReserveRatio = reserveRatio;
        criticalOffset = clamp(offsetRatio, -1, 1);
      }
    }

    return {
      stable: true,
      reserveRatio: minReserveRatio,
      balance: 1 - minReserveRatio,
      criticalOffset,
      failure: null
    };
  }

  function syncStackPhysics(stack = state.stack) {
    const analysis = analyzeStackPhysics(stack);
    state.balance = analysis.balance;
    state.leanTarget = analysis.stable
      ? clamp(analysis.criticalOffset * 0.045, -0.1, 0.1)
      : clamp(analysis.criticalOffset * 0.16, -0.24, 0.24);
    return analysis;
  }

  function rotatePoint(x, y, angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: x * cos - y * sin,
      y: x * sin + y * cos
    };
  }

  function buildRigidCollapse(failure) {
    const failureIndex = clamp(parseInt(failure?.index, 10) || 0, 0, Math.max(0, state.stack.length - 1));
    const baseBoxes = state.stack.slice(0, failureIndex).map((item) => ({ ...item }));
    const clusterBoxes = state.stack.slice(failureIndex).map((item) => ({ ...item }));
    const pivotX = failure?.comX != null
      ? (failure.comX >= failure.contactCenter ? failure.contactRight : failure.contactLeft)
      : (failure?.contactCenter ?? CART_CENTER_X);
    const pivotY = failure?.support?.topY ?? getCartSupportBody().topY;

    let clusterMass = 0;
    let clusterMomentX = 0;
    let clusterMomentY = 0;

    clusterBoxes.forEach((box) => {
      const mass = getBodyMass(box);
      const centerY = box.y + box.height * 0.5;
      clusterMass += mass;
      clusterMomentX += mass * box.centerX;
      clusterMomentY += mass * centerY;
    });

    const comX = clusterMomentX / Math.max(clusterMass, 1);
    const comY = clusterMomentY / Math.max(clusterMass, 1);

    let inertia = 0;
    const boxes = clusterBoxes.map((box) => {
      const centerY = box.y + box.height * 0.5;
      const localX = box.centerX - comX;
      const localY = centerY - comY;
      const mass = getBodyMass(box);
      const boxInertia = mass * (box.width * box.width + box.height * box.height) / 12;
      inertia += boxInertia + mass * (localX * localX + localY * localY);

      return {
        ...box,
        localX,
        localY
      };
    });

    const rigidBody = {
      phase: 'pivot',
      pivotX,
      pivotY,
      centerX: comX,
      centerY: comY,
      velocityX: 0,
      velocityY: 0,
      angle: 0,
      angularVelocity: 0,
      inertia: Math.max(inertia, 1),
      mass: Math.max(clusterMass, 1),
      pivotInertia: Math.max(
        inertia + Math.max(clusterMass, 1) * ((comX - pivotX) * (comX - pivotX) + (comY - pivotY) * (comY - pivotY)),
        1
      ),
      comPivotOffsetX: comX - pivotX,
      comPivotOffsetY: comY - pivotY,
      settled: false,
      boxes,
      baseBoxes
    };

    setPivotRigidBodyAngle(rigidBody, 0);
    return rigidBody;
  }

  function buildFreeCollapseBox(box, support) {
    const centerY = box.y + box.height * 0.5;
    const mass = getBodyMass(box);
    const horizontalDirection = Math.sign(box.centerX - (support?.centerX ?? CART_CENTER_X))
      || state.craneDirection
      || 1;

    return {
      phase: 'free',
      pivotX: null,
      pivotY: null,
      centerX: box.centerX,
      centerY,
      velocityX: horizontalDirection * 180,
      velocityY: Math.max(box.vy || 0, 140),
      angle: 0,
      angularVelocity: horizontalDirection * 2.4,
      inertia: Math.max(mass * (box.width * box.width + box.height * box.height) / 12, 1),
      mass: Math.max(mass, 1),
      pivotInertia: 1,
      comPivotOffsetX: 0,
      comPivotOffsetY: 0,
      settled: false,
      boxes: [{
        ...box,
        localX: 0,
        localY: 0
      }],
      baseBoxes: state.stack.map((item) => ({ ...item }))
    };
  }

  function setPivotRigidBodyAngle(rigidBody, angle) {
    if (!rigidBody || rigidBody.phase !== 'pivot') return;
    const rotatedCom = rotatePoint(rigidBody.comPivotOffsetX, rigidBody.comPivotOffsetY, angle);
    rigidBody.angle = angle;
    rigidBody.centerX = rigidBody.pivotX + rotatedCom.x;
    rigidBody.centerY = rigidBody.pivotY + rotatedCom.y;
  }

  function getPivotReleaseAngle(rigidBody) {
    return clamp(0.22 + Math.max(0, rigidBody.boxes.length - 1) * 0.055, 0.22, 0.44);
  }

  function getRigidCollapseBoxes(rigidBody) {
    if (!rigidBody) return [];

    return rigidBody.boxes.map((box) => {
      const rotated = rotatePoint(box.localX, box.localY, rigidBody.angle);
      return {
        ...box,
        centerX: rigidBody.centerX + rotated.x,
        y: rigidBody.centerY + rotated.y - box.height * 0.5,
        rotation: rigidBody.angle
      };
    });
  }

  function getBodyInertia(body) {
    return Math.max(1, getBodyMass(body) * (body.width * body.width + body.height * body.height) / 12);
  }

  function syncCollapseFragment(body) {
    body.y = body.centerY - body.height * 0.5;
    return body;
  }

  function createCollapseFragment(box, options = {}) {
    const centerY = box.centerY ?? (box.y + box.height * 0.5);

    return syncCollapseFragment({
      ...box,
      centerX: box.centerX,
      centerY,
      vx: options.vx ?? box.vx ?? 0,
      vy: options.vy ?? box.vy ?? 0,
      rotation: options.rotation ?? box.rotation ?? 0,
      angularVelocity: options.angularVelocity ?? box.angularVelocity ?? 0,
      mass: options.mass ?? getBodyMass(box),
      inertia: options.inertia ?? getBodyInertia(box),
      settled: false
    });
  }

  function getFragmentBounds(body) {
    const halfWidth = body.width * 0.5;
    const halfHeight = body.height * 0.5;
    const corners = [
      rotatePoint(-halfWidth, -halfHeight, body.rotation || 0),
      rotatePoint(halfWidth, -halfHeight, body.rotation || 0),
      rotatePoint(halfWidth, halfHeight, body.rotation || 0),
      rotatePoint(-halfWidth, halfHeight, body.rotation || 0)
    ];

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    corners.forEach((corner) => {
      const worldX = body.centerX + corner.x;
      const worldY = body.centerY + corner.y;
      minX = Math.min(minX, worldX);
      maxX = Math.max(maxX, worldX);
      minY = Math.min(minY, worldY);
      maxY = Math.max(maxY, worldY);
    });

    return {
      minX,
      maxX,
      minY,
      maxY
    };
  }

  function buildCollapseFragmentsFromRigidBody(rigidBody) {
    return getRigidCollapseBoxes(rigidBody).map((box) => {
      const centerY = box.y + box.height * 0.5;
      const relX = box.centerX - rigidBody.centerX;
      const relY = centerY - rigidBody.centerY;
      const inheritedVx = rigidBody.velocityX * 0.78;
      const inheritedVy = rigidBody.velocityY * 0.78;
      const tangentialVx = clamp(-rigidBody.angularVelocity * relY * 0.34, -150, 150);
      const tangentialVy = clamp(rigidBody.angularVelocity * relX * 0.2, -110, 140);

      return createCollapseFragment(box, {
        vx: clamp(inheritedVx + tangentialVx, -220, 220),
        vy: clamp(inheritedVy + tangentialVy, -120, 260),
        rotation: box.rotation || 0,
        angularVelocity: clamp(
          rigidBody.angularVelocity * 0.46 + relX * 0.0024,
          -1.35,
          1.35
        )
      });
    });
  }

  function releaseRigidCollapseToFragments(rigidBody, velocityScale) {
    const rotatedCom = rotatePoint(rigidBody.comPivotOffsetX, rigidBody.comPivotOffsetY, rigidBody.angle);
    rigidBody.velocityX = clamp(-rigidBody.angularVelocity * rotatedCom.y * velocityScale, -220, 220);
    rigidBody.velocityY = clamp(rigidBody.angularVelocity * rotatedCom.x * velocityScale, -120, 240);
    state.collapseBoxes = buildCollapseFragmentsFromRigidBody(rigidBody);
    state.collapseRigidBody = null;
    state.collapseSettledTimer = 0;
  }

  function buildStaticCollapseSupports() {
    const supports = state.collapseBaseBoxes.map((box) => ({
      left: box.centerX - box.width * 0.5 + 10,
      right: box.centerX + box.width * 0.5 - 10,
      top: box.y,
      bottom: box.y + box.height
    }));

    supports.push({
      left: CART_CENTER_X - CART_WIDTH * 0.5,
      right: CART_CENTER_X + CART_WIDTH * 0.5,
      top: CART_DECK_Y,
      bottom: CART_DECK_Y + CART_HEIGHT
    });

    supports.push({
      left: -2000,
      right: CANVAS_WIDTH + 2000,
      top: GROUND_Y,
      bottom: GROUND_Y + 400
    });

    return supports;
  }

  function resolveCollapseFragment(body, supports) {
    let bounds = getFragmentBounds(body);

    if (bounds.minX < 18) {
      body.centerX += 18 - bounds.minX;
      body.vx = Math.abs(body.vx) * 0.2;
      body.angularVelocity *= 0.88;
      bounds = getFragmentBounds(body);
    } else if (bounds.maxX > CANVAS_WIDTH - 18) {
      body.centerX -= bounds.maxX - (CANVAS_WIDTH - 18);
      body.vx = -Math.abs(body.vx) * 0.2;
      body.angularVelocity *= 0.88;
      bounds = getFragmentBounds(body);
    }

    let resolved = false;
    let bestSupport = null;
    let bestPenetration = Infinity;

    supports.forEach((support) => {
      const overlapX = Math.min(bounds.maxX, support.right) - Math.max(bounds.minX, support.left);
      if (overlapX <= 18) return;
      if (bounds.maxY < support.top || bounds.minY >= support.top) return;

      const penetration = bounds.maxY - support.top;
      if (penetration >= 0 && penetration < bestPenetration) {
        bestPenetration = penetration;
        bestSupport = support;
      }
    });

    if (bestSupport) {
      body.centerY -= bestPenetration;
      syncCollapseFragment(body);
      resolved = true;

      if (body.vy > 0) {
        body.vy *= -0.08;
      }
      body.vx *= 0.9;
      body.angularVelocity *= 0.82;

      if (Math.abs(body.vy) < COLLAPSE_SETTLE_LINEAR) {
        body.vy = 0;
      }
      if (Math.abs(body.vx) < 14) {
        body.vx = 0;
      }
      if (Math.abs(body.angularVelocity) < COLLAPSE_SETTLE_ANGULAR) {
        body.angularVelocity = 0;
      }
    }

    body.settled = resolved && body.vx === 0 && body.vy === 0 && body.angularVelocity === 0;
    return getFragmentBounds(body);
  }

  function updateCollapseFragments(dt) {
    if (!state.collapseBoxes.length) {
      state.collapseSettledTimer = 0;
      return;
    }

    state.collapseBoxes.forEach((body) => {
      body.settled = false;
      body.vy += COLLAPSE_GRAVITY * dt;
      body.vx *= Math.exp(-dt * 0.85);
      body.angularVelocity *= Math.exp(-dt * 1.2);
      body.centerX += body.vx * dt;
      body.centerY += body.vy * dt;
      body.rotation += body.angularVelocity * dt;
      syncCollapseFragment(body);
    });

    const supports = buildStaticCollapseSupports();
    const bodies = [...state.collapseBoxes].sort((a, b) => (b.centerY - a.centerY));

    bodies.forEach((body) => {
      const bounds = resolveCollapseFragment(body, supports);
      supports.push({
        left: bounds.minX + 8,
        right: bounds.maxX - 8,
        top: bounds.minY,
        bottom: bounds.maxY
      });
    });

    if (state.collapseBoxes.every((body) => body.settled)) {
      state.collapseSettledTimer += dt;
    } else {
      state.collapseSettledTimer = 0;
    }
  }

  function inspectRigidBodyGround(rigidBody, angle = rigidBody.angle, centerX = rigidBody.centerX, centerY = rigidBody.centerY) {
    if (!rigidBody) {
      return {
        maxY: GROUND_Y,
        deepestPenetration: 0,
        primaryContact: null,
        contactCount: 0
      };
    }

    let maxY = -Infinity;
    let deepestPenetration = -Infinity;
    let primaryContact = null;
    let contactCount = 0;

    rigidBody.boxes.forEach((box) => {
      const rotatedCenter = rotatePoint(box.localX, box.localY, angle);
      const boxCenterX = centerX + rotatedCenter.x;
      const boxCenterY = centerY + rotatedCenter.y;
      const halfWidth = box.width * 0.5;
      const halfHeight = box.height * 0.5;
      const corners = [
        rotatePoint(-halfWidth, -halfHeight, angle),
        rotatePoint(halfWidth, -halfHeight, angle),
        rotatePoint(halfWidth, halfHeight, angle),
        rotatePoint(-halfWidth, halfHeight, angle)
      ];

      corners.forEach((corner) => {
        const worldX = boxCenterX + corner.x;
        const worldY = boxCenterY + corner.y;
        const penetration = worldY - GROUND_Y;
        maxY = Math.max(maxY, worldY);

        if (penetration > deepestPenetration) {
          deepestPenetration = penetration;
          primaryContact = {
            x: worldX,
            y: worldY,
            relX: worldX - centerX,
            relY: worldY - centerY,
            penetration
          };
        }

        if (penetration >= -2) {
          contactCount += 1;
        }
      });
    });

    return {
      maxY,
      deepestPenetration: Math.max(0, deepestPenetration),
      primaryContact,
      contactCount
    };
  }

  function resolveFreeRigidBodyGroundContact(rigidBody) {
    let groundInfo = inspectRigidBodyGround(rigidBody);
    if (groundInfo.maxY < GROUND_Y) {
      return groundInfo;
    }

    rigidBody.centerY -= groundInfo.maxY - GROUND_Y;
    groundInfo = inspectRigidBodyGround(rigidBody);

    const contact = groundInfo.primaryContact;
    if (contact) {
      const contactVelocityX = rigidBody.velocityX - rigidBody.angularVelocity * contact.relY;
      const contactVelocityY = rigidBody.velocityY + rigidBody.angularVelocity * contact.relX;

      if (contactVelocityY > 0) {
        const normalDenominator = (1 / rigidBody.mass) + ((contact.relX * contact.relX) / rigidBody.inertia);
        const normalImpulse = ((1 + COLLAPSE_RESTITUTION) * contactVelocityY) / Math.max(normalDenominator, 0.0001);
        rigidBody.velocityY -= normalImpulse / rigidBody.mass;
        rigidBody.angularVelocity -= (contact.relX * normalImpulse) / rigidBody.inertia;

        const postNormalVelocityX = rigidBody.velocityX - rigidBody.angularVelocity * contact.relY;
        const tangentDenominator = (1 / rigidBody.mass) + ((contact.relY * contact.relY) / rigidBody.inertia);
        const frictionLimit = normalImpulse * COLLAPSE_FRICTION;
        const frictionImpulse = clamp(
          -postNormalVelocityX / Math.max(tangentDenominator, 0.0001),
          -frictionLimit,
          frictionLimit
        );
        rigidBody.velocityX += frictionImpulse / rigidBody.mass;
        rigidBody.angularVelocity -= (contact.relY * frictionImpulse) / rigidBody.inertia;
      }
    }

    rigidBody.velocityX *= groundInfo.contactCount > 1 ? 0.88 : 0.94;

    if (groundInfo.contactCount > 0) {
      rigidBody.angularVelocity *= groundInfo.contactCount > 1 ? 0.84 : 0.9;
    }

    if (Math.abs(rigidBody.velocityY) < COLLAPSE_SETTLE_LINEAR) {
      rigidBody.velocityY = 0;
    }
    if (Math.abs(rigidBody.velocityX) < 12) {
      rigidBody.velocityX = 0;
    }
    if (Math.abs(rigidBody.angularVelocity) < COLLAPSE_SETTLE_ANGULAR) {
      rigidBody.angularVelocity = 0;
    }

    if (groundInfo.contactCount >= 2
      && rigidBody.velocityX === 0
      && rigidBody.velocityY === 0
      && rigidBody.angularVelocity === 0) {
      rigidBody.phase = 'settled';
      rigidBody.settled = true;
    }

    return groundInfo;
  }

  function dotVector(a, b) {
    return a.x * b.x + a.y * b.y;
  }

  function subtractVector(a, b) {
    return { x: a.x - b.x, y: a.y - b.y };
  }

  function scaleVector(vector, scalar) {
    return { x: vector.x * scalar, y: vector.y * scalar };
  }

  function addVector(a, b) {
    return { x: a.x + b.x, y: a.y + b.y };
  }

  function vectorLength(vector) {
    return Math.hypot(vector.x, vector.y);
  }

  function normalizeVector(vector) {
    const length = vectorLength(vector);
    if (length <= 1e-8) {
      return { x: 1, y: 0 };
    }

    return {
      x: vector.x / length,
      y: vector.y / length
    };
  }

  function perpendicularVector(vector) {
    return { x: -vector.y, y: vector.x };
  }

  function crossVector(a, b) {
    return a.x * b.y - a.y * b.x;
  }

  function crossScalarVector(scalar, vector) {
    return {
      x: -scalar * vector.y,
      y: scalar * vector.x
    };
  }

  function syncCollapseBody(body) {
    body.rotation = body.angle;
    body.y = body.centerY - body.height * 0.5;
    return body;
  }

  function getPhysicsBodyCenter(body) {
    return {
      x: body.centerX,
      y: body.centerY
    };
  }

  function createDynamicCollapseBody(box, options = {}) {
    const mass = getBodyMass(box);
    const inertia = getBodyInertia(box);

    return syncCollapseBody({
      ...box,
      centerX: options.centerX ?? box.centerX,
      centerY: options.centerY ?? (box.centerY ?? (box.y + box.height * 0.5)),
      vx: options.vx ?? box.vx ?? 0,
      vy: options.vy ?? box.vy ?? 0,
      angle: options.angle ?? box.rotation ?? 0,
      rotation: options.angle ?? box.rotation ?? 0,
      angularVelocity: options.angularVelocity ?? box.angularVelocity ?? 0,
      mass,
      invMass: 1 / Math.max(mass, 1),
      inertia,
      invInertia: 1 / Math.max(inertia, 1),
      friction: options.friction ?? 0.58,
      restitution: options.restitution ?? 0.04,
      touching: false,
      sleepTimer: 0,
      settled: false,
      isStatic: false
    });
  }

  function createStaticCollapseBody({ centerX, centerY, width, height, angle = 0, friction = 0.62, restitution = 0.02 }) {
    return {
      centerX,
      centerY,
      width,
      height,
      angle,
      rotation: angle,
      vx: 0,
      vy: 0,
      angularVelocity: 0,
      mass: Infinity,
      invMass: 0,
      inertia: Infinity,
      invInertia: 0,
      friction,
      restitution,
      touching: false,
      sleepTimer: 0,
      settled: true,
      isStatic: true
    };
  }

  function getPhysicsBodyAxes(body) {
    const angle = body.angle || 0;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return [
      { x: cos, y: sin },
      { x: -sin, y: cos }
    ];
  }

  function getPhysicsBodyVertices(body) {
    const [axisX, axisY] = getPhysicsBodyAxes(body);
    const halfWidth = body.width * 0.5;
    const halfHeight = body.height * 0.5;
    const center = getPhysicsBodyCenter(body);

    return [
      addVector(center, addVector(scaleVector(axisX, -halfWidth), scaleVector(axisY, -halfHeight))),
      addVector(center, addVector(scaleVector(axisX, halfWidth), scaleVector(axisY, -halfHeight))),
      addVector(center, addVector(scaleVector(axisX, halfWidth), scaleVector(axisY, halfHeight))),
      addVector(center, addVector(scaleVector(axisX, -halfWidth), scaleVector(axisY, halfHeight)))
    ];
  }

  function projectVerticesOntoAxis(vertices, axis) {
    let min = Infinity;
    let max = -Infinity;

    vertices.forEach((vertex) => {
      const projection = dotVector(vertex, axis);
      min = Math.min(min, projection);
      max = Math.max(max, projection);
    });

    return { min, max };
  }

  function pointInsidePhysicsBody(point, body, epsilon = 1.25) {
    const [axisX, axisY] = getPhysicsBodyAxes(body);
    const relative = subtractVector(point, getPhysicsBodyCenter(body));
    const localX = dotVector(relative, axisX);
    const localY = dotVector(relative, axisY);

    return Math.abs(localX) <= body.width * 0.5 + epsilon
      && Math.abs(localY) <= body.height * 0.5 + epsilon;
  }

  function getSupportPoints(vertices, direction) {
    let maxProjection = -Infinity;

    vertices.forEach((vertex) => {
      maxProjection = Math.max(maxProjection, dotVector(vertex, direction));
    });

    return vertices.filter((vertex) => Math.abs(dotVector(vertex, direction) - maxProjection) <= 2.5);
  }

  function dedupeContactPoints(points) {
    const unique = [];

    points.forEach((point) => {
      const duplicated = unique.some((candidate) => Math.hypot(candidate.x - point.x, candidate.y - point.y) <= 6);
      if (!duplicated) {
        unique.push(point);
      }
    });

    return unique;
  }

  function getCollisionContacts(bodyA, bodyB, normal, verticesA, verticesB) {
    const candidates = [];

    verticesA.forEach((vertex) => {
      if (pointInsidePhysicsBody(vertex, bodyB)) {
        candidates.push(vertex);
      }
    });

    verticesB.forEach((vertex) => {
      if (pointInsidePhysicsBody(vertex, bodyA)) {
        candidates.push(vertex);
      }
    });

    if (!candidates.length) {
      const supportA = getSupportPoints(verticesA, normal);
      const supportB = getSupportPoints(verticesB, scaleVector(normal, -1));

      supportA.forEach((pointA) => {
        supportB.forEach((pointB) => {
          candidates.push({
            x: (pointA.x + pointB.x) * 0.5,
            y: (pointA.y + pointB.y) * 0.5
          });
        });
      });
    }

    const unique = dedupeContactPoints(candidates);
    if (unique.length <= 2) {
      return unique;
    }

    const tangent = perpendicularVector(normal);
    unique.sort((left, right) => dotVector(left, tangent) - dotVector(right, tangent));
    return [unique[0], unique[unique.length - 1]];
  }

  function detectCollapseCollision(bodyA, bodyB) {
    const verticesA = getPhysicsBodyVertices(bodyA);
    const verticesB = getPhysicsBodyVertices(bodyB);
    const axes = [...getPhysicsBodyAxes(bodyA), ...getPhysicsBodyAxes(bodyB)];
    let penetration = Infinity;
    let collisionNormal = null;

    for (const axis of axes) {
      const normal = normalizeVector(axis);
      const projectionA = projectVerticesOntoAxis(verticesA, normal);
      const projectionB = projectVerticesOntoAxis(verticesB, normal);
      const overlap = Math.min(projectionA.max, projectionB.max) - Math.max(projectionA.min, projectionB.min);

      if (overlap <= 0) {
        return null;
      }

      if (overlap < penetration) {
        penetration = overlap;
        collisionNormal = normal;
      }
    }

    if (!collisionNormal) {
      return null;
    }

    const centerDelta = subtractVector(getPhysicsBodyCenter(bodyB), getPhysicsBodyCenter(bodyA));
    if (dotVector(centerDelta, collisionNormal) < 0) {
      collisionNormal = scaleVector(collisionNormal, -1);
    }

    const contacts = getCollisionContacts(bodyA, bodyB, collisionNormal, verticesA, verticesB);
    if (!contacts.length) {
      return null;
    }

    return {
      bodyA,
      bodyB,
      normal: collisionNormal,
      penetration,
      contacts,
      friction: Math.sqrt((bodyA.friction || 0.58) * (bodyB.friction || 0.58)),
      restitution: Math.min(bodyA.restitution || 0, bodyB.restitution || 0)
    };
  }

  function applyImpulseToBody(body, impulse, offset) {
    if (body.invMass === 0) return;
    body.vx += impulse.x * body.invMass;
    body.vy += impulse.y * body.invMass;
    body.angularVelocity += crossVector(offset, impulse) * body.invInertia;
  }

  function solveCollisionImpulse(manifold) {
    const { bodyA, bodyB, normal, contacts, friction, restitution } = manifold;
    const centerA = getPhysicsBodyCenter(bodyA);
    const centerB = getPhysicsBodyCenter(bodyB);
    const normalBias = Math.max(manifold.penetration - 0.2, 0) * 0.18 / COLLAPSE_SOLVER_STEP;

    contacts.forEach((contact) => {
      const ra = subtractVector(contact, centerA);
      const rb = subtractVector(contact, centerB);
      const velocityA = addVector({ x: bodyA.vx, y: bodyA.vy }, crossScalarVector(bodyA.angularVelocity, ra));
      const velocityB = addVector({ x: bodyB.vx, y: bodyB.vy }, crossScalarVector(bodyB.angularVelocity, rb));
      const relativeVelocity = subtractVector(velocityB, velocityA);
      const velocityAlongNormal = dotVector(relativeVelocity, normal);

      if (velocityAlongNormal > 0) {
        return;
      }

      const raCrossNormal = crossVector(ra, normal);
      const rbCrossNormal = crossVector(rb, normal);
      const inverseMassSum = bodyA.invMass + bodyB.invMass
        + raCrossNormal * raCrossNormal * bodyA.invInertia
        + rbCrossNormal * rbCrossNormal * bodyB.invInertia;

      if (inverseMassSum <= 1e-8) {
        return;
      }

      const bounce = Math.abs(velocityAlongNormal) > 48 ? restitution : 0;
      const normalImpulseScalar = Math.max(
        0,
        -((1 + bounce) * velocityAlongNormal - normalBias) / inverseMassSum / contacts.length
      );
      const normalImpulse = scaleVector(normal, normalImpulseScalar);
      applyImpulseToBody(bodyA, scaleVector(normalImpulse, -1), ra);
      applyImpulseToBody(bodyB, normalImpulse, rb);

      const postVelocityA = addVector({ x: bodyA.vx, y: bodyA.vy }, crossScalarVector(bodyA.angularVelocity, ra));
      const postVelocityB = addVector({ x: bodyB.vx, y: bodyB.vy }, crossScalarVector(bodyB.angularVelocity, rb));
      const postRelativeVelocity = subtractVector(postVelocityB, postVelocityA);
      const tangentVector = subtractVector(postRelativeVelocity, scaleVector(normal, dotVector(postRelativeVelocity, normal)));

      if (vectorLength(tangentVector) <= 1e-8) {
        bodyA.touching = true;
        bodyB.touching = true;
        return;
      }

      const tangent = normalizeVector(tangentVector);
      const tangentImpulseScalar = clamp(
        -dotVector(postRelativeVelocity, tangent) / inverseMassSum / contacts.length,
        -normalImpulseScalar * friction,
        normalImpulseScalar * friction
      );
      const tangentImpulse = scaleVector(tangent, tangentImpulseScalar);
      applyImpulseToBody(bodyA, scaleVector(tangentImpulse, -1), ra);
      applyImpulseToBody(bodyB, tangentImpulse, rb);
      bodyA.touching = true;
      bodyB.touching = true;
    });
  }

  function correctCollisionPositions(manifold) {
    const { bodyA, bodyB, normal, penetration } = manifold;
    const inverseMassSum = bodyA.invMass + bodyB.invMass;
    if (inverseMassSum <= 1e-8) return;

    const correctionMagnitude = Math.max(penetration - COLLAPSE_SOLVER_SLOP, 0) / inverseMassSum * COLLAPSE_SOLVER_BAUMGARTE;
    const correction = scaleVector(normal, correctionMagnitude);

    if (bodyA.invMass > 0) {
      bodyA.centerX -= correction.x * bodyA.invMass;
      bodyA.centerY -= correction.y * bodyA.invMass;
      syncCollapseBody(bodyA);
    }

    if (bodyB.invMass > 0) {
      bodyB.centerX += correction.x * bodyB.invMass;
      bodyB.centerY += correction.y * bodyB.invMass;
      syncCollapseBody(bodyB);
    }
  }

  function buildCollapseStaticBodies() {
    const staticBodies = state.collapseBaseBoxes.map((box) => createStaticCollapseBody({
      centerX: box.centerX,
      centerY: box.y + box.height * 0.5,
      width: box.width,
      height: box.height
    }));

    staticBodies.push(createStaticCollapseBody({
      centerX: CART_CENTER_X,
      centerY: CART_DECK_Y + 12,
      width: CART_WIDTH * 0.84,
      height: 24,
      friction: 0.64
    }));

    staticBodies.push(createStaticCollapseBody({
      centerX: CANVAS_WIDTH * 0.5,
      centerY: GROUND_Y + 80,
      width: CANVAS_WIDTH * 3,
      height: 160,
      friction: 0.76
    }));

    return staticBodies;
  }

  function buildBalanceCollapseBodies(failure) {
    const failureIndex = clamp(parseInt(failure?.index, 10) || 0, 0, Math.max(0, state.stack.length - 1));
    const direction = Math.sign((failure?.comX ?? CART_CENTER_X) - (failure?.contactCenter ?? CART_CENTER_X)) || 1;
    state.collapseBaseBoxes = state.stack.slice(0, failureIndex).map((item) => ({ ...item }));

    return state.stack.slice(failureIndex).map((item, index) => createDynamicCollapseBody(item, {
      angle: index === 0 ? direction * 0.008 : direction * 0.002,
      angularVelocity: index === 0 ? direction * 0.06 : 0
    }));
  }

  function buildMissCollapseBodies(box) {
    state.collapseBaseBoxes = state.stack.map((item) => ({ ...item }));
    return [createDynamicCollapseBody(box, {
      vx: box.vx ?? 0,
      vy: Math.max(box.vy || 0, 140),
      angle: 0,
      angularVelocity: (box.vx ?? 0) * 0.0015
    })];
  }

  function collectCollapseManifolds(staticBodies) {
    const manifolds = [];

    for (let index = 0; index < state.collapseBoxes.length; index += 1) {
      const dynamicBody = state.collapseBoxes[index];

      for (let nextIndex = index + 1; nextIndex < state.collapseBoxes.length; nextIndex += 1) {
        const manifold = detectCollapseCollision(dynamicBody, state.collapseBoxes[nextIndex]);
        if (manifold) {
          manifolds.push(manifold);
        }
      }

      staticBodies.forEach((staticBody) => {
        const manifold = detectCollapseCollision(dynamicBody, staticBody);
        if (manifold) {
          manifolds.push(manifold);
        }
      });
    }

    return manifolds;
  }

  function stepCollapseSimulation(stepDt) {
    if (!state.collapseBoxes.length) return;

    state.collapseBoxes.forEach((body) => {
      body.touching = false;
      body.vy += COLLAPSE_GRAVITY * stepDt;
      body.vx *= Math.exp(-stepDt * COLLAPSE_AIR_LINEAR_DAMPING);
      body.angularVelocity *= Math.exp(-stepDt * COLLAPSE_AIR_ANGULAR_DAMPING);
      body.centerX += body.vx * stepDt;
      body.centerY += body.vy * stepDt;
      body.angle += body.angularVelocity * stepDt;
      syncCollapseBody(body);
    });

    const staticBodies = buildCollapseStaticBodies();

    for (let iteration = 0; iteration < COLLAPSE_SOLVER_ITERATIONS; iteration += 1) {
      const manifolds = collectCollapseManifolds(staticBodies);
      if (!manifolds.length) {
        break;
      }

      manifolds.forEach((manifold) => {
        solveCollisionImpulse(manifold);
      });

      manifolds.forEach((manifold) => {
        correctCollisionPositions(manifold);
      });
    }

    state.collapseBoxes.forEach((body) => {
      syncCollapseBody(body);

      if (
        body.touching
        && Math.abs(body.vx) <= COLLAPSE_SLEEP_LINEAR
        && Math.abs(body.vy) <= COLLAPSE_SLEEP_VERTICAL
        && Math.abs(body.angularVelocity) <= COLLAPSE_SLEEP_ANGULAR
      ) {
        body.sleepTimer += stepDt;
        if (body.sleepTimer >= 0.18) {
          body.vx = 0;
          body.vy = 0;
          body.angularVelocity = 0;
          body.settled = true;
          syncCollapseBody(body);
        }
      } else {
        body.sleepTimer = 0;
        body.settled = false;
      }
    });
  }

  function updateCollapseSimulation(dt) {
    if (!state.collapseBoxes.length) {
      state.collapseSettledTimer = 0;
      return;
    }

    let remaining = Math.min(dt, 0.05);
    let iterations = 0;

    while (remaining > 1e-6 && iterations < 8) {
      const stepDt = Math.min(COLLAPSE_SOLVER_STEP, remaining);
      stepCollapseSimulation(stepDt);
      remaining -= stepDt;
      iterations += 1;
    }

    if (state.collapseBoxes.every((body) => body.settled)) {
      state.collapseSettledTimer += dt;
    } else {
      state.collapseSettledTimer = 0;
    }

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
      const visibleStackCount = (state.collapseBaseBoxes.length + state.collapseBoxes.length) || state.stack.length;
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
    const bounds = getDropBounds(width);

    return {
      style,
      width,
      height,
      centerX: clamp(state.craneX, bounds.minX, bounds.maxX),
      y: CRANE_Y,
      vx: 0,
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

  function beginDispatchCycle() {
    if (state.mode !== 'playing') return;

    state.currentBox = null;
    state.fallingBox = null;
    state.spawnCooldown = 0;
    state.dispatchPhase = 'exit';
    state.dispatchTimer = 0;
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
    state.collapseBaseBoxes = [];
    state.collapseBoxes = [];
    state.collapseRigidBody = null;
    state.collapseSettledTimer = 0;
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
    syncStackPhysics();
    state.lean = state.leanTarget;
  }

  function prepareShowcaseScene(preview = false) {
    clearRunState();
    seedShowcaseStack(preview ? 4 : 3);
    state.currentBox = createBox(state.stack.length + 1);
    const bounds = getDropBounds(state.currentBox.width);
    state.craneX = preview ? bounds.minX + 48 : bounds.minX + 96;
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
      box.width = chooseWidthForStage(widthChoices);
    }
    const bounds = getDropBounds(box.width);
    box.centerX = clamp(state.craneX, bounds.minX, bounds.maxX);
    box.y = CRANE_Y + Math.sin(state.elapsed * 3.2) * 4;
    state.currentBox = box;
    state.autoDropTimer = randomBetween(0.45, 1.15);
  }

  function startRun(stage = state.selectedStartStage || 1) {
    const selectedStage = clamp(parseInt(stage, 10) || 1, 1, getMaxUnlockedStage());
    clearRunState();
    state.stage = selectedStage;
    state.score = resolveStageStartScore(selectedStage);
    state.craneSpeed = computeCraneSpeed();
    setSelectedStartStage(selectedStage);
    setMode('playing');
    startOverlay.hidden = true;
    gameOverOverlay.hidden = true;
    spawnNextBox();
    if (selectedStage > 1) {
      showMessage(`Stage ${selectedStage} start`, '#647154');
    }
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
    const offset = box.centerX - support.centerX;
    const offsetRatio = Math.abs(offset) / Math.max(1, support.width * 0.5);
    const precision = 1 - clamp(offsetRatio, 0, 1);

    return {
      support,
      overlap,
      offset,
      offsetRatio,
      precision,
      success: overlap > 0
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
    box.vx = 0;
    box.vy = 0;
    box.precision = result.precision;
    state.stack.push(box);
    state.currentBox = null;
    state.fallingBox = null;
    state.spawnCooldown = SPAWN_DELAY;
    state.cartBounce = Math.max(state.cartBounce, 18);

    const physics = syncStackPhysics();

    if (result.precision > 0.92) {
      showMessage('Perfect drop', '#bd6f52');
      pushFloatingText('PERFECT', box.centerX, box.y - 18, '#bd6f52');
    } else if (result.precision > 0.76) {
      showMessage('Nice placement', '#647154');
      pushFloatingText('NICE', box.centerX, box.y - 18, '#647154');
    }

    burst(box.centerX, box.y + box.height * 0.28, box.style.tape, 8, 0.55);

    if (!physics.stable) {
      if (state.mode === 'preview') {
        finishPreviewFailure(box);
        return;
      }

      if (state.mode === 'playing') {
        state.score += pointsPerBox();
        if (state.score > state.bestScore) {
          state.bestScore = state.score;
          saveLocalBest(state.bestScore);
        }
      }

      endRun('balance', box, physics.failure);
      return;
    }

    if (state.mode === 'playing') {
      state.score += pointsPerBox();
      state.craneSpeed = computeCraneSpeed();

      if (state.score > state.bestScore) {
        state.bestScore = state.score;
        saveLocalBest(state.bestScore);
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
    state.fallingBox.vx = state.currentBox.vx || 0;
    state.fallingBox.vy = 0;
    state.currentBox = null;
  }

  function setButtonsDisabled(disabled) {
    startButton.disabled = disabled;
    restartButton.disabled = disabled;
    lobbyButton.disabled = disabled;
    if (startStageSelect) {
      startStageSelect.disabled = disabled;
    }
    if (restartStageSelect) {
      restartStageSelect.disabled = disabled;
    }
  }

  async function finalizeGameOver() {
    if (state.collapseFinalizing || state.mode === 'gameover') return;

    state.collapseFinalizing = true;
    setMode('gameover');
    gameOverOverlay.hidden = false;
    finalScoreLine.textContent = `최종 점수 ${state.score}점`;

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

    const failX = support?.comX ?? support?.contactCenter ?? box?.centerX ?? support?.centerX ?? CART_CENTER_X;
    const failY = box ? Math.min(box.y + box.height * 0.72, GROUND_Y - 18) : GROUND_Y - 36;
    burst(failX, failY, '#bd6f52', 22, 1.5);
    state.currentBox = null;
    state.fallingBox = null;
    state.spawnCooldown = 0;
    state.cartOffsetX = 0;
    state.dispatchPhase = '';
    state.dispatchTimer = 0;
    if (reason === 'miss' && box) {
      state.collapseRigidBody = null;
      state.collapseBoxes = buildMissCollapseBodies(box);
    } else {
      state.collapseRigidBody = null;
      state.collapseBoxes = buildBalanceCollapseBodies(support);
    }
    state.lean = state.leanTarget;
    state.collapseTimer = 0;
    state.collapseSettledTimer = 0;
    state.collapseReasonText = buildReasonText(reason);
    state.collapseFinalizing = false;
    state.stack = [];
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
    finalScoreLine.textContent = `최종 점수 ${state.score}점`;

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

    const bounds = getDropBounds(state.currentBox.width);
    const minX = bounds.minX;
    const maxX = bounds.maxX;
    const previousCraneX = state.craneX;
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
    state.currentBox.vx = (state.craneX - previousCraneX) / Math.max(dt, 0.0001);
  }

  function updateFallingBox(dt) {
    if (!state.fallingBox) return;

    state.fallingBox.vy += GRAVITY * dt;
    state.fallingBox.centerX += (state.fallingBox.vx || 0) * dt;
    state.fallingBox.y += state.fallingBox.vy * dt;

    const support = getSupportForNextBox();
    if (state.fallingBox.y + state.fallingBox.height >= support.topY) {
      landCurrentBox(state.fallingBox);
    } else if (
      state.fallingBox.y > CANVAS_HEIGHT + 120
      || state.fallingBox.centerX + state.fallingBox.width * 0.5 < -180
      || state.fallingBox.centerX - state.fallingBox.width * 0.5 > CANVAS_WIDTH + 180
    ) {
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
        rememberUnlockedStage(state.stage, state.score);
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
    updateCollapseSimulation(dt);
    state.collapseTimer += dt;

    if (!state.collapseFinalizing) {
      if (state.collapseBoxes.length && state.collapseSettledTimer >= COLLAPSE_OVERLAY_DELAY) {
        finalizeGameOver();
      } else if (state.collapseTimer >= COLLAPSE_OVERLAY_MAX_TIME) {
        finalizeGameOver();
      }
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
    const left = -SCENE_WORLD_BLEED_X - 36;
    const width = CANVAS_WIDTH + (SCENE_WORLD_BLEED_X + 36) * 2;
    const gradient = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    gradient.addColorStop(0, '#f5edd8');
    gradient.addColorStop(0.45, '#e4ddd0');
    gradient.addColorStop(1, '#d7d2c5');
    ctx.fillStyle = gradient;
    ctx.fillRect(left, 0, width, GROUND_Y);

    const sun = ctx.createRadialGradient(728, 154, 14, 728, 154, 126);
    sun.addColorStop(0, 'rgba(255, 248, 226, 0.95)');
    sun.addColorStop(0.65, 'rgba(255, 242, 205, 0.42)');
    sun.addColorStop(1, 'rgba(255, 242, 205, 0)');
    ctx.fillStyle = sun;
    ctx.fillRect(578, 18, 284, 266);
  }

  function drawBuildings() {
    const buildings = [
      { x: -28, width: 132, height: 278, color: '#c6bbab' },
      { x: 86, width: 146, height: 312, color: '#c1b6a4' },
      { x: 214, width: 110, height: 246, color: '#b5aa9b' },
      { x: 578, width: 148, height: 296, color: '#beb19d' },
      { x: 708, width: 118, height: 238, color: '#b2a590' },
      { x: 812, width: 126, height: 268, color: '#c8bba7' }
    ];

    buildings.forEach((building, index) => {
      const y = 236 + (index % 2) * 28;
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

    drawRoundedRect(298, 258, 302, 54, 27, 'rgba(255, 249, 236, 0.42)');
    drawRoundedRect(314, 272, 72, 24, 12, 'rgba(196, 115, 85, 0.18)');
    drawRoundedRect(400, 272, 92, 24, 12, 'rgba(108, 122, 95, 0.2)');
    drawRoundedRect(508, 272, 76, 24, 12, 'rgba(199, 133, 100, 0.18)');
  }

  function drawMarketFront() {
    drawRoundedRect(52, 560, 796, 302, 32, '#efe8d7');
    strokeRoundedRect(52, 560, 796, 302, 32, 'rgba(80, 69, 54, 0.08)', 2);
    drawRoundedRect(70, 578, 760, 266, 28, 'rgba(255, 253, 247, 0.22)');

    const sideStalls = [
      { x: 94, width: 228, awning: '#c17355', window: '#f2eee4', accent: '#d19a7d' },
      { x: 578, width: 228, awning: '#c78564', window: '#efe9de', accent: '#d9ab83' }
    ];

    sideStalls.forEach((stall) => {
      drawRoundedRect(stall.x, 618, stall.width, 198, 24, stall.window);
      drawRoundedRect(stall.x - 4, 602, stall.width + 8, 40, 18, stall.awning);
      for (let stripe = 0; stripe < 7; stripe += 1) {
        ctx.fillStyle = stripe % 2 === 0 ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.03)';
        ctx.fillRect(stall.x + stripe * ((stall.width + 8) / 7), 602, 16, 40);
      }

      drawRoundedRect(stall.x + 18, 658, stall.width - 36, 74, 16, 'rgba(110, 118, 126, 0.08)');
      drawRoundedRect(stall.x + 24, 748, stall.width - 48, 22, 11, 'rgba(88, 77, 60, 0.06)');
      drawRoundedRect(stall.x + 34, 786, stall.width - 68, 12, 6, 'rgba(124, 117, 100, 0.08)');

      for (let slot = 0; slot < 3; slot += 1) {
        drawRoundedRect(stall.x + 32 + slot * 58, 674, 42, 42, 10, 'rgba(255, 255, 255, 0.2)');
      }

      drawRoundedRect(stall.x + stall.width - 76, 668, 44, 54, 12, stall.accent);
      drawRoundedRect(stall.x + stall.width - 68, 678, 28, 10, 5, 'rgba(255, 255, 255, 0.28)');
    });

    drawRoundedRect(338, 606, 224, 222, 28, '#eef1e6');
    drawRoundedRect(352, 622, 196, 58, 20, '#dbe2d0');
    drawRoundedRect(366, 636, 168, 32, 16, '#6c7a5f');
    drawRoundedRect(360, 688, 180, 90, 18, 'rgba(114, 126, 108, 0.14)');

    for (let slat = 0; slat < 6; slat += 1) {
      drawRoundedRect(374, 700 + slat * 12, 152, 6, 3, 'rgba(96, 105, 90, 0.16)');
    }

    drawRoundedRect(380, 790, 140, 26, 13, '#d8d3c5');
    drawRoundedRect(390, 798, 120, 8, 4, 'rgba(82, 73, 58, 0.12)');
    drawRoundedRect(388, 718, 34, 26, 8, '#c58f57');
    drawRoundedRect(430, 708, 42, 36, 8, '#d09d67');
    drawRoundedRect(482, 714, 32, 30, 8, '#b98253');
    drawRoundedRect(400, 728, 10, 10, 5, 'rgba(255, 255, 255, 0.24)');
    drawRoundedRect(442, 720, 12, 12, 6, 'rgba(255, 255, 255, 0.24)');

    ctx.fillStyle = '#f7f3ea';
    ctx.font = '700 20px Bahnschrift';
    ctx.textAlign = 'center';
    ctx.fillText('PICKUP POINT', 450, 658);

    ctx.fillStyle = 'rgba(88, 77, 60, 0.42)';
    ctx.font = '700 13px Bahnschrift';
    ctx.fillText('COLLECT HERE', 450, 790);
  }

  function drawStreetAndVan() {
    const streetLeft = -SCENE_WORLD_BLEED_X - 26;
    const streetWidth = CANVAS_WIDTH + (SCENE_WORLD_BLEED_X + 26) * 2;
    drawRoundedRect(streetLeft, 884, streetWidth, 716, 0, '#c9c2b4');
    drawRoundedRect(streetLeft, 970, streetWidth, 630, 0, '#7d7b78');

    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    for (let index = 0; index < 8; index += 1) {
      ctx.fillRect(40 + index * 118, 1038, 64, 18);
    }

    drawRoundedRect(22, 890, 856, 70, 22, '#ddd7cb');
    drawRoundedRect(74, 898, 228, 52, 18, '#f5efe1');
    strokeRoundedRect(74, 898, 228, 52, 18, 'rgba(88, 77, 60, 0.08)', 1.5);
    ctx.fillStyle = '#586352';
    ctx.font = '700 21px Bahnschrift';
    ctx.textAlign = 'center';
    ctx.fillText('DELIVERY STOP', 188, 932);

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
    const bollards = [72, 134, 766, 828];
    bollards.forEach((x) => {
      drawRoundedRect(x, 1178, 20, 132, 10, '#62594f');
      drawRoundedRect(x + 3, 1188, 14, 28, 7, '#d8c280');
    });

    drawRoundedRect(16, 1228, 76, 116, 20, '#d4cab6');
    drawRoundedRect(808, 1218, 82, 126, 20, '#d7ccb9');
    drawRoundedRect(28, 1250, 52, 16, 8, '#ffffff');
    drawRoundedRect(820, 1244, 58, 16, 8, '#f7f4ea');
    drawRoundedRect(292, 1216, 316, 18, 9, 'rgba(99, 104, 102, 0.28)');
    drawRoundedRect(306, 1240, 288, 12, 6, 'rgba(65, 63, 62, 0.16)');
  }

  function drawCrane() {
    const carrierX = state.fallingBox?.centerX ?? state.currentBox?.centerX ?? state.craneX;
    const cableBottom = state.fallingBox
      ? state.fallingBox.y + 8
      : state.currentBox
        ? state.currentBox.y + 8
        : CRANE_Y + 20;

    drawRoundedRect(108, 154, 684, 18, 9, '#d7d2c8');
    drawRoundedRect(108, 160, 684, 6, 3, 'rgba(255, 255, 255, 0.48)');

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

  function drawWheel(x, y, radius, hubRadius) {
    ctx.fillStyle = '#464847';
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#dad7cf';
    ctx.beginPath();
    ctx.arc(x, y, hubRadius, 0, Math.PI * 2);
    ctx.fill();
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

    drawWheel(CART_CENTER_X - 124, bodyY + 88, 28, 10);
    drawWheel(CART_CENTER_X + 124, bodyY + 88, 28, 10);

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
      state.collapseBaseBoxes.forEach((box) => {
        drawBox(box, 0);
      });

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
      const spin = clamp(
        (state.fallingBox.vy / 4200) + ((state.fallingBox.vx || 0) / 5200),
        -0.11,
        0.11
      );
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

    beginSceneProjection();
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
    ctx.restore();
  }

  function handlePrimaryAction() {
    if (state.mode === 'ready') {
      startRun(state.selectedStartStage);
      return;
    }

    if (state.mode === 'gameover') {
      if (!state.isSubmitting) {
        startRun(state.selectedStartStage);
      }
      return;
    }

    if (state.mode === 'playing' && state.currentBox && !state.fallingBox) {
      dropCurrentBox();
    }
  }

  function handleCanvasPointerDown(event) {
    event.preventDefault();
    handlePrimaryAction();
  }

  function handleStartButtonClick() {
    startRun(state.selectedStartStage);
  }

  function handleRestartButtonClick() {
    startRun(state.selectedStartStage);
  }

  function handleLobbyButtonClick() {
    returnToMinigameHub();
  }

  function handleStartStageChange(event) {
    setSelectedStartStage(event.currentTarget.value);
  }

  function handleWindowKeydown(event) {
    if (event.code !== 'Space' && event.code !== 'Enter') return;
    event.preventDefault();
    handlePrimaryAction();
  }

  function bindEvents() {
    canvas.addEventListener('pointerdown', handleCanvasPointerDown);
    startButton.addEventListener('click', handleStartButtonClick);
    restartButton.addEventListener('click', handleRestartButtonClick);
    lobbyButton.addEventListener('click', handleLobbyButtonClick);

    if (startStageSelect) {
      startStageSelect.addEventListener('change', handleStartStageChange);
    }

    if (restartStageSelect) {
      restartStageSelect.addEventListener('change', handleStartStageChange);
    }

    window.addEventListener('keydown', handleWindowKeydown);
  }

  function cleanupGame() {
    isDisposed = true;
    if (animationFrameId) {
      window.cancelAnimationFrame(animationFrameId);
      animationFrameId = 0;
    }

    canvas.removeEventListener('pointerdown', handleCanvasPointerDown);
    startButton.removeEventListener('click', handleStartButtonClick);
    restartButton.removeEventListener('click', handleRestartButtonClick);
    lobbyButton.removeEventListener('click', handleLobbyButtonClick);
    if (startStageSelect) {
      startStageSelect.removeEventListener('change', handleStartStageChange);
    }
    if (restartStageSelect) {
      restartStageSelect.removeEventListener('change', handleStartStageChange);
    }
    window.removeEventListener('keydown', handleWindowKeydown);
    window.removeEventListener('beforeunload', cleanupGame);
  }

  function frame(now) {
    if (isDisposed) return;
    const seconds = now * 0.001;
    const dt = state.lastFrameTime ? Math.min(0.033, seconds - state.lastFrameTime) : 0.016;
    state.lastFrameTime = seconds;
    update(dt);
    render();
    animationFrameId = requestAnimationFrame(frame);
  }

  async function initialize() {
    bindEvents();
    window.addEventListener('beforeunload', cleanupGame);

    if (IS_PREVIEW_MODE) {
      resetPreviewScene();
    } else {
      prepareShowcaseScene(false);
      setMode('ready');
      syncStageStartControls();
      await refreshTopEntry();
    }

    updateHud();
    animationFrameId = requestAnimationFrame(frame);
  }

  initialize().catch((error) => {
    console.error('[Parcel Stack] Failed to initialize:', error);
    updateStatusLines('게임을 초기화하지 못했습니다.');
    animationFrameId = requestAnimationFrame(frame);
  });
})();
