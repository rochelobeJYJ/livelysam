(function () {
  'use strict';

  const MINIGAME_ID = 'lane-dash';
  const LEADERBOARD_MODE = 'all-scores';
  const MAX_SCORES_PER_PLAYER = 3;
  const LOCAL_BEST_KEY = 'laneDashLocalBest';
  const IS_PREVIEW_MODE = new URLSearchParams(window.location.search).get('preview') === '1';

  const LANE_COUNT = 3;
  const ROAD_TOP_Y = 140;
  const ROAD_BOTTOM_Y = 1510;
  const ROAD_TOP_WIDTH = 300;
  const ROAD_BOTTOM_WIDTH = 768;
  const PLAYER_Y = 1320;
  const PLAYER_WIDTH = 92;
  const PLAYER_HEIGHT = 138;

  const BASE_SPEED = 500;
  const MAX_SPEED = 980;
  const BASE_SPAWN_INTERVAL = 0.88;
  const MIN_SPAWN_INTERVAL = 0.38;

  const BOOST_DURATION = 2.8;
  const BOOST_MULTIPLIER = 1.55;
  const SCORE_RATE_BASE = 10;
  const SCORE_RATE_SPEED_FACTOR = 0.016;
  const BOOST_SCORE_BONUS = 8;
  const SHIELD_SCORE_BONUS = 5;

  const PICKUP_TYPES = {
    boost: 'boost',
    shield: 'shield'
  };

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const shell = document.getElementById('shell');

  const scoreValue = document.getElementById('scoreValue');
  const bestValue = document.getElementById('bestValue');
  const boostValue = document.getElementById('boostValue');
  const shieldValue = document.getElementById('shieldValue');

  const startOverlay = document.getElementById('startOverlay');
  const gameOverOverlay = document.getElementById('gameOverOverlay');
  const startStatus = document.getElementById('startStatus');
  const gameOverStatus = document.getElementById('gameOverStatus');
  const finalScoreLine = document.getElementById('finalScoreLine');
  const startButton = document.getElementById('startButton');
  const restartButton = document.getElementById('restartButton');
  const lobbyButton = document.getElementById('lobbyButton');

  const state = {
    mode: IS_PREVIEW_MODE ? 'preview' : 'ready',
    lastFrameTime: 0,
    idleClock: 0,
    elapsed: 0,
    score: 0,
    bestScore: loadLocalBest(),
    speed: BASE_SPEED,
    playerLane: 1,
    playerX: 0,
    spawnTimer: 0.62,
    obstacles: [],
    pickups: [],
    particles: [],
    stars: createStars(38),
    topEntry: null,
    isSubmitting: false,
    boostTimer: 0,
    shieldReady: false,
    messageText: '',
    messageColor: '#ffd86b',
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
      // ignore local storage failures
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

    window.location.href = 'index.html';
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function choice(values) {
    return values[Math.floor(Math.random() * values.length)];
  }

  function roadMetricsAt(y) {
    const t = clamp((y - ROAD_TOP_Y) / (ROAD_BOTTOM_Y - ROAD_TOP_Y), 0, 1);
    const width = ROAD_TOP_WIDTH + (ROAD_BOTTOM_WIDTH - ROAD_TOP_WIDTH) * t;
    return {
      width,
      left: (canvas.width - width) / 2,
      laneWidth: width / LANE_COUNT
    };
  }

  function laneCenter(lane, y = PLAYER_Y + PLAYER_HEIGHT * 0.55) {
    const metrics = roadMetricsAt(y);
    return metrics.left + metrics.laneWidth * (lane + 0.5);
  }

  function createStars(count) {
    return Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      radius: randomBetween(1.2, 3.4),
      speed: randomBetween(28, 112),
      alpha: randomBetween(0.2, 0.85)
    }));
  }

  function choosePickupType() {
    if (!state.shieldReady && Math.random() < 0.32) {
      return PICKUP_TYPES.shield;
    }
    return PICKUP_TYPES.boost;
  }

  function createObstacle(lane, y = -180) {
    return {
      lane,
      y,
      height: randomBetween(118, 164),
      widthScale: randomBetween(0.72, 0.84),
      stripePhase: Math.random() * Math.PI * 2
    };
  }

  function createPickup(lane, y = -130, type = choosePickupType()) {
    return {
      lane,
      y,
      type,
      radius: randomBetween(22, 30),
      pulse: Math.random() * Math.PI * 2
    };
  }

  function createParticle(x, y, color, spread = 1, power = 1) {
    const angle = randomBetween(0, Math.PI * 2);
    const velocity = randomBetween(120, 400) * power;
    const maxLife = randomBetween(0.35, 0.8);
    return {
      x,
      y,
      vx: Math.cos(angle) * velocity * spread,
      vy: Math.sin(angle) * velocity * spread - randomBetween(0, 130),
      life: maxLife,
      maxLife,
      size: randomBetween(3, 9),
      color
    };
  }

  function burst(x, y, color, count, spread = 1, power = 1) {
    for (let index = 0; index < count; index += 1) {
      state.particles.push(createParticle(x, y, color, spread, power));
    }
  }

  function currentNickname() {
    return resolveGameNickname().slice(0, 12) || 'Guest';
  }

  function setMode(mode) {
    state.mode = mode;
    shell.dataset.mode = mode;
  }

  function showMessage(text, color) {
    state.messageText = text;
    state.messageColor = color;
    state.messageTimer = 1.05;
  }

  function topEntryText() {
    if (IS_PREVIEW_MODE) {
      return '썸네일은 자동 데모로 재생됩니다.';
    }

    if (!state.topEntry) {
      return '아직 등록된 최고 기록이 없습니다.';
    }

    const leaderboard = getLeaderboardBridge();
    const rawNickname = state.topEntry.nickname || '';
    const displayName = rawNickname
      ? (leaderboard?.maskNickname ? leaderboard.maskNickname(rawNickname) : rawNickname)
      : (state.topEntry.maskedNickname || '익명');

    return `현재 1위 ${displayName} · ${Math.floor(state.topEntry.score || 0)}점`;
  }

  function updateStatusLines(statusText) {
    const resolvedStatus = statusText || topEntryText();
    startStatus.textContent = resolvedStatus;
    if (!state.isSubmitting) {
      gameOverStatus.textContent = resolvedStatus;
    }
  }

  async function refreshTopEntry() {
    const leaderboard = getLeaderboardBridge();
    if (!leaderboard?.getTopEntry) {
      state.topEntry = null;
      updateStatusLines();
      return;
    }

    updateStatusLines('랭킹 정보를 불러오는 중입니다.');

    try {
      state.topEntry = await leaderboard.getTopEntry({
        gameId: MINIGAME_ID,
        leaderboardMode: LEADERBOARD_MODE
      });
    } catch (error) {
      console.warn('[Lane Dash] Failed to load top entry:', error);
      state.topEntry = null;
    }

    updateStatusLines();
  }

  async function submitScore(finalScore) {
    const leaderboard = getLeaderboardBridge();
    if (!leaderboard?.submitScore) {
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

  function setButtonsDisabled(disabled) {
    restartButton.disabled = disabled;
    lobbyButton.disabled = disabled;
  }

  function seedPreviewScene() {
    state.spawnTimer = 0.2;
    state.obstacles = [
      createObstacle(1, 220),
      createObstacle(0, -180),
      createObstacle(2, -560)
    ];
    state.pickups = [
      createPickup(2, 20, PICKUP_TYPES.boost),
      createPickup(1, -360, PICKUP_TYPES.shield)
    ];
  }

  function resetRun(nextMode = IS_PREVIEW_MODE ? 'preview' : 'ready') {
    setMode(nextMode);
    state.elapsed = 0;
    state.score = 0;
    state.speed = BASE_SPEED;
    state.playerLane = 1;
    state.playerX = laneCenter(1);
    state.spawnTimer = 0.62;
    state.obstacles = [];
    state.pickups = [];
    state.particles = [];
    state.isSubmitting = false;
    state.boostTimer = 0;
    state.shieldReady = false;
    state.messageText = '';
    state.messageColor = '#ffd86b';
    state.messageTimer = 0;
    state.lastFrameTime = 0;

    scoreValue.textContent = '0';
    bestValue.textContent = String(state.bestScore);
    boostValue.textContent = '-';
    shieldValue.textContent = '-';

    finalScoreLine.textContent = '최종 점수 0';
    updateStatusLines();

    startOverlay.hidden = nextMode === 'preview';
    gameOverOverlay.hidden = true;
    setButtonsDisabled(false);

    if (nextMode === 'preview') {
      seedPreviewScene();
    }
  }

  function startRun() {
    if (IS_PREVIEW_MODE || state.isSubmitting) return;

    if (state.mode === 'gameover') {
      resetRun('ready');
    }

    if (state.mode !== 'ready') return;

    startOverlay.hidden = true;
    gameOverOverlay.hidden = true;
    setMode('playing');
  }

  function endRun() {
    if (state.mode === 'gameover' || state.mode === 'preview') return;

    setMode('gameover');
    const finalScore = Math.floor(state.score);
    finalScoreLine.textContent = `최종 점수 ${finalScore}`;
    gameOverOverlay.hidden = false;

    if (finalScore > state.bestScore) {
      state.bestScore = finalScore;
      bestValue.textContent = String(state.bestScore);
      saveLocalBest(finalScore);
    }

    state.isSubmitting = true;
    gameOverStatus.textContent = '기록을 저장하는 중입니다.';
    setButtonsDisabled(true);

    submitScore(finalScore)
      .then((result) => {
        if (result?.accepted === false) {
          gameOverStatus.textContent = '개인 최고 기록 3개 밖이라 이번 점수는 저장되지 않았습니다.';
        }
      })
      .catch((error) => {
        console.warn('[Lane Dash] Failed to submit score:', error);
      })
      .finally(async () => {
        state.isSubmitting = false;
        setButtonsDisabled(false);
        await refreshTopEntry();
      });
  }

  function movePlayerToLane(lane) {
    state.playerLane = clamp(Math.round(lane), 0, LANE_COUNT - 1);
  }

  function laneFromClientX(clientX) {
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    return clamp(Math.floor(x * LANE_COUNT), 0, LANE_COUNT - 1);
  }

  function onCanvasPress(clientX) {
    if (IS_PREVIEW_MODE) return;

    movePlayerToLane(laneFromClientX(clientX));

    if (state.mode !== 'playing') {
      startRun();
    }
  }

  function updatePreviewAutopilot() {
    const laneScores = [0.2, 0.2, 0.2];

    state.obstacles.forEach((obstacle) => {
      const distance = obstacle.y - PLAYER_Y;
      if (distance > -200 && distance < 520) {
        laneScores[obstacle.lane] -= 14 - clamp(distance / 60, 0, 8);
      } else if (distance >= 520 && distance < 860) {
        laneScores[obstacle.lane] -= 2.5;
      }
    });

    state.pickups.forEach((pickup) => {
      const distance = pickup.y - PLAYER_Y;
      if (distance > -220 && distance < 560) {
        if (pickup.type === PICKUP_TYPES.shield && !state.shieldReady) {
          laneScores[pickup.lane] += 5;
        } else if (pickup.type === PICKUP_TYPES.boost) {
          laneScores[pickup.lane] += 3;
        }
      }
    });

    laneScores[state.playerLane] += 0.8;
    const targetLane = laneScores.indexOf(Math.max(...laneScores));
    state.playerLane = targetLane;
  }

  function spawnPattern() {
    const lanes = [0, 1, 2];
    const harderPatternChance = clamp(0.16 + state.elapsed * 0.009, 0.16, 0.58);
    const twoWallPattern = Math.random() < harderPatternChance;

    if (twoWallPattern) {
      const safeLane = choice(lanes);
      lanes
        .filter((lane) => lane !== safeLane)
        .forEach((lane) => {
          state.obstacles.push(createObstacle(lane));
        });

      if (Math.random() < 0.7) {
        state.pickups.push(createPickup(safeLane, -124));
      }
      return;
    }

    const primaryLane = choice(lanes);
    const blockedLanes = [primaryLane];
    state.obstacles.push(createObstacle(primaryLane));

    const remainingLanes = lanes.filter((lane) => lane !== primaryLane);
    if (state.elapsed > 16 && Math.random() < 0.2) {
      const secondaryLane = choice(remainingLanes);
      blockedLanes.push(secondaryLane);
      state.obstacles.push(createObstacle(secondaryLane, -274));
    }

    const safeLanes = lanes.filter((lane) => !blockedLanes.includes(lane));
    if (safeLanes.length > 0 && Math.random() < 0.54) {
      state.pickups.push(createPickup(choice(safeLanes), -124));
    }
  }

  function collectPickup(index) {
    const pickup = state.pickups[index];
    const pickupX = laneCenter(pickup.lane, pickup.y + pickup.radius);
    const pickupY = pickup.y + pickup.radius;

    if (pickup.type === PICKUP_TYPES.boost) {
      state.boostTimer = Math.min(5.2, state.boostTimer + BOOST_DURATION);
      state.score += BOOST_SCORE_BONUS;
      showMessage('연료 부스트', '#ffcf66');
      burst(pickupX, pickupY, '#ffd86b', 18, 0.9, 0.82);
    } else {
      state.shieldReady = true;
      state.score += SHIELD_SCORE_BONUS;
      showMessage('실드 준비', '#79bbf3');
      burst(pickupX, pickupY, '#78d8ff', 18, 0.85, 0.8);
    }

    state.pickups.splice(index, 1);
  }

  function updateHud() {
    scoreValue.textContent = String(Math.floor(state.score));
    bestValue.textContent = String(state.bestScore);
    boostValue.textContent = state.boostTimer > 0 ? `${state.boostTimer.toFixed(1)}s` : '-';
    shieldValue.textContent = state.shieldReady ? 'ON' : '-';
  }

  function updateStars(deltaTime) {
    const drift = (state.mode === 'playing' || state.mode === 'preview')
      ? state.speed * 0.08
      : 26;

    state.stars.forEach((star) => {
      star.y += (star.speed + drift) * deltaTime;
      if (star.y > canvas.height + 20) {
        star.y = -20;
        star.x = Math.random() * canvas.width;
      }
    });
  }

  function updateParticles(deltaTime) {
    for (let index = state.particles.length - 1; index >= 0; index -= 1) {
      const particle = state.particles[index];
      particle.life -= deltaTime;
      if (particle.life <= 0) {
        state.particles.splice(index, 1);
        continue;
      }

      particle.vy += 480 * deltaTime;
      particle.x += particle.vx * deltaTime;
      particle.y += particle.vy * deltaTime;
    }
  }

  function triggerShieldBreak(index) {
    const obstacle = state.obstacles[index];
    const metrics = roadMetricsAt(obstacle.y + obstacle.height * 0.5);
    const obstacleCenterX = metrics.left + metrics.laneWidth * (obstacle.lane + 0.5);
    const obstacleCenterY = obstacle.y + obstacle.height * 0.5;

    state.shieldReady = false;
    state.obstacles.splice(index, 1);
    showMessage('실드 소모', '#79bbf3');
    burst(obstacleCenterX, obstacleCenterY, '#78d8ff', 22, 1.15, 1.05);
  }

  function handleCollisions() {
    const playerCenterX = state.playerX;
    const playerTop = PLAYER_Y + 8;
    const playerBottom = PLAYER_Y + PLAYER_HEIGHT - 8;
    const playerCenterY = PLAYER_Y + PLAYER_HEIGHT * 0.54;

    for (let index = state.pickups.length - 1; index >= 0; index -= 1) {
      const pickup = state.pickups[index];
      const pickupX = laneCenter(pickup.lane, pickup.y + pickup.radius);
      const pickupY = pickup.y + pickup.radius;
      const dx = pickupX - playerCenterX;
      const dy = pickupY - playerCenterY;
      const collisionDistance = pickup.radius + PLAYER_WIDTH * 0.28;

      if ((dx * dx) + (dy * dy) <= collisionDistance * collisionDistance) {
        collectPickup(index);
      }
    }

    for (let index = state.obstacles.length - 1; index >= 0; index -= 1) {
      const obstacle = state.obstacles[index];
      const metrics = roadMetricsAt(obstacle.y + obstacle.height * 0.5);
      const obstacleCenterX = metrics.left + metrics.laneWidth * (obstacle.lane + 0.5);
      const obstacleWidth = metrics.laneWidth * obstacle.widthScale;
      const obstacleTop = obstacle.y;
      const obstacleBottom = obstacle.y + obstacle.height;
      const overlapsX = Math.abs(obstacleCenterX - playerCenterX) < (obstacleWidth * 0.48 + PLAYER_WIDTH * 0.32);
      const overlapsY = obstacleBottom > playerTop && obstacleTop < playerBottom;

      if (!overlapsX || !overlapsY) {
        continue;
      }

      if (state.shieldReady) {
        triggerShieldBreak(index);
        continue;
      }

      burst(playerCenterX, PLAYER_Y + PLAYER_HEIGHT * 0.5, '#ff7f95', 28, 1.35, 1.2);
      if (state.mode === 'preview') {
        resetRun('preview');
        return;
      }

      endRun();
      return;
    }
  }

  function updateGame(deltaTime) {
    state.idleClock += deltaTime;
    updateStars(deltaTime);
    updateParticles(deltaTime);

    const isRunning = state.mode === 'playing' || state.mode === 'preview';
    if (state.mode === 'preview') {
      updatePreviewAutopilot();
    }

    const targetX = laneCenter(state.playerLane);
    state.playerX += (targetX - state.playerX) * Math.min(1, deltaTime * 11);

    if (state.messageTimer > 0) {
      state.messageTimer = Math.max(0, state.messageTimer - deltaTime);
    }

    if (!isRunning) {
      return;
    }

    state.elapsed += deltaTime;
    state.speed = clamp(BASE_SPEED + state.elapsed * 18, BASE_SPEED, MAX_SPEED);

    if (state.boostTimer > 0) {
      state.boostTimer = Math.max(0, state.boostTimer - deltaTime);
    }

    const scoreRate = SCORE_RATE_BASE + (state.speed - BASE_SPEED) * SCORE_RATE_SPEED_FACTOR;
    const scoreMultiplier = state.boostTimer > 0 ? BOOST_MULTIPLIER : 1;
    state.score += deltaTime * scoreRate * scoreMultiplier;

    state.spawnTimer -= deltaTime;
    if (state.spawnTimer <= 0) {
      spawnPattern();
      state.spawnTimer = clamp(
        BASE_SPAWN_INTERVAL - state.elapsed * 0.008 + randomBetween(-0.05, 0.07),
        MIN_SPAWN_INTERVAL,
        BASE_SPAWN_INTERVAL
      );
    }

    for (let index = state.obstacles.length - 1; index >= 0; index -= 1) {
      const obstacle = state.obstacles[index];
      obstacle.y += state.speed * deltaTime;
      if (obstacle.y > canvas.height + 180) {
        state.obstacles.splice(index, 1);
      }
    }

    for (let index = state.pickups.length - 1; index >= 0; index -= 1) {
      const pickup = state.pickups[index];
      pickup.y += state.speed * deltaTime;
      pickup.pulse += deltaTime * 5.2;
      if (pickup.y > canvas.height + 120) {
        state.pickups.splice(index, 1);
      }
    }

    handleCollisions();
    updateHud();
  }

  function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#95a3b1');
    gradient.addColorStop(0.38, '#697684');
    gradient.addColorStop(1, '#39414a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const horizonY = 290;
    ctx.fillStyle = 'rgba(34, 40, 46, 0.82)';
    ctx.fillRect(0, horizonY, canvas.width, 120);

    const buildings = [
      { x: 0, w: 110, h: 170 },
      { x: 88, w: 90, h: 120 },
      { x: 160, w: 120, h: 205 },
      { x: 262, w: 86, h: 150 },
      { x: 334, w: 122, h: 230 },
      { x: 452, w: 84, h: 142 },
      { x: 520, w: 132, h: 216 },
      { x: 640, w: 100, h: 150 },
      { x: 728, w: 88, h: 194 },
      { x: 800, w: 100, h: 132 }
    ];

    buildings.forEach((building, index) => {
      const baseY = horizonY + (index % 3) * 8;
      const topY = baseY - building.h;
      ctx.fillStyle = index % 2 === 0 ? '#2e353d' : '#262c33';
      ctx.fillRect(building.x, topY, building.w, building.h);

      ctx.fillStyle = 'rgba(255, 223, 153, 0.18)';
      for (let row = topY + 18; row < baseY - 16; row += 24) {
        for (let col = building.x + 14; col < building.x + building.w - 14; col += 20) {
          if ((row + col + index * 13) % 3 === 0) {
            ctx.fillRect(col, row, 8, 10);
          }
        }
      }
    });

    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(0, horizonY + 22, canvas.width, 4);

    state.stars.forEach((star) => {
      ctx.fillStyle = `rgba(255, 255, 255, ${star.alpha * 0.38})`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawRoad() {
    const topLeft = (canvas.width - ROAD_TOP_WIDTH) / 2;
    const bottomLeft = (canvas.width - ROAD_BOTTOM_WIDTH) / 2;
    const topRight = topLeft + ROAD_TOP_WIDTH;
    const bottomRight = bottomLeft + ROAD_BOTTOM_WIDTH;

    const roadGradient = ctx.createLinearGradient(0, ROAD_TOP_Y, 0, ROAD_BOTTOM_Y);
    roadGradient.addColorStop(0, '#4b5057');
    roadGradient.addColorStop(0.55, '#2f353d');
    roadGradient.addColorStop(1, '#1f242b');

    const sidewalkGradient = ctx.createLinearGradient(0, ROAD_TOP_Y, 0, ROAD_BOTTOM_Y);
    sidewalkGradient.addColorStop(0, '#8a8f95');
    sidewalkGradient.addColorStop(1, '#676d74');

    ctx.fillStyle = sidewalkGradient;
    ctx.beginPath();
    ctx.moveTo(topLeft - 76, ROAD_TOP_Y);
    ctx.lineTo(topLeft, ROAD_TOP_Y);
    ctx.lineTo(bottomLeft, ROAD_BOTTOM_Y);
    ctx.lineTo(bottomLeft - 120, ROAD_BOTTOM_Y);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(topRight, ROAD_TOP_Y);
    ctx.lineTo(topRight + 76, ROAD_TOP_Y);
    ctx.lineTo(bottomRight + 120, ROAD_BOTTOM_Y);
    ctx.lineTo(bottomRight, ROAD_BOTTOM_Y);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(topLeft, ROAD_TOP_Y);
    ctx.lineTo(topRight, ROAD_TOP_Y);
    ctx.lineTo(bottomRight, ROAD_BOTTOM_Y);
    ctx.lineTo(bottomLeft, ROAD_BOTTOM_Y);
    ctx.closePath();
    ctx.fillStyle = roadGradient;
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(topLeft, ROAD_TOP_Y);
    ctx.lineTo(bottomLeft, ROAD_BOTTOM_Y);
    ctx.moveTo(topRight, ROAD_TOP_Y);
    ctx.lineTo(bottomRight, ROAD_BOTTOM_Y);
    ctx.stroke();

    for (let y = ROAD_TOP_Y + 44; y < ROAD_BOTTOM_Y; y += 124) {
      const curbTop = roadMetricsAt(y);
      const curbBottom = roadMetricsAt(y + 44);

      ctx.fillStyle = '#e6e7e8';
      ctx.beginPath();
      ctx.moveTo(curbTop.left - 28, y);
      ctx.lineTo(curbTop.left, y);
      ctx.lineTo(curbBottom.left, y + 44);
      ctx.lineTo(curbBottom.left - 42, y + 44);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#50565d';
      ctx.beginPath();
      ctx.moveTo(curbTop.left - 48, y);
      ctx.lineTo(curbTop.left - 28, y);
      ctx.lineTo(curbBottom.left - 42, y + 44);
      ctx.lineTo(curbBottom.left - 62, y + 44);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#e6e7e8';
      ctx.beginPath();
      ctx.moveTo(curbTop.left + curbTop.width, y);
      ctx.lineTo(curbTop.left + curbTop.width + 28, y);
      ctx.lineTo(curbBottom.left + curbBottom.width + 42, y + 44);
      ctx.lineTo(curbBottom.left + curbBottom.width, y + 44);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#50565d';
      ctx.beginPath();
      ctx.moveTo(curbTop.left + curbTop.width + 28, y);
      ctx.lineTo(curbTop.left + curbTop.width + 48, y);
      ctx.lineTo(curbBottom.left + curbBottom.width + 62, y + 44);
      ctx.lineTo(curbBottom.left + curbBottom.width + 42, y + 44);
      ctx.closePath();
      ctx.fill();
    }

    const laneDividerScroll = (state.elapsed * state.speed * 0.18) % 136;
    for (let divider = 1; divider < LANE_COUNT; divider += 1) {
      for (let y = ROAD_TOP_Y - 150 + laneDividerScroll; y < ROAD_BOTTOM_Y; y += 136) {
        const segmentTop = roadMetricsAt(y);
        const segmentBottom = roadMetricsAt(y + 74);
        const x1 = segmentTop.left + segmentTop.laneWidth * divider;
        const x2 = segmentBottom.left + segmentBottom.laneWidth * divider;
        ctx.strokeStyle = 'rgba(236, 239, 242, 0.28)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x1, y);
        ctx.lineTo(x2, y + 74);
        ctx.stroke();
      }
    }

    ctx.strokeStyle = 'rgba(255, 207, 102, 0.55)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(topLeft + ROAD_TOP_WIDTH * 0.12, ROAD_TOP_Y + 16);
    ctx.lineTo(bottomLeft + ROAD_BOTTOM_WIDTH * 0.12, ROAD_BOTTOM_Y);
    ctx.moveTo(topLeft + ROAD_TOP_WIDTH * 0.88, ROAD_TOP_Y + 16);
    ctx.lineTo(bottomLeft + ROAD_BOTTOM_WIDTH * 0.88, ROAD_BOTTOM_Y);
    ctx.stroke();
  }

  function drawObstacle(obstacle) {
    const metrics = roadMetricsAt(obstacle.y + obstacle.height * 0.5);
    const centerX = metrics.left + metrics.laneWidth * (obstacle.lane + 0.5);
    const width = metrics.laneWidth * obstacle.widthScale;
    const left = centerX - width / 2;
    const top = obstacle.y;
    const radius = clamp(width * 0.16, 12, 28);

    const fillGradient = ctx.createLinearGradient(left, top, left + width, top + obstacle.height);
    fillGradient.addColorStop(0, '#f7a53f');
    fillGradient.addColorStop(1, '#db6f25');
    ctx.fillStyle = fillGradient;
    roundRect(left, top, width, obstacle.height, radius);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.24)';
    roundRect(left + width * 0.12, top + 16, width * 0.76, 14, 9);
    ctx.fill();

    ctx.save();
    ctx.translate(left, top);
    ctx.strokeStyle = 'rgba(35, 36, 38, 0.74)';
    ctx.lineWidth = 9;
    for (let stripeY = -34 + ((state.elapsed * 320 + obstacle.stripePhase * 60) % 70); stripeY < obstacle.height + 36; stripeY += 46) {
      ctx.beginPath();
      ctx.moveTo(12, stripeY);
      ctx.lineTo(width - 12, stripeY + 24);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBoostIcon(centerX, centerY, radius) {
    ctx.fillStyle = '#6d3a0e';
    roundRect(centerX - radius * 0.72, centerY - radius * 0.84, radius * 1.28, radius * 1.62, radius * 0.18);
    ctx.fill();

    ctx.fillStyle = '#ffdc8d';
    ctx.fillRect(centerX - radius * 0.58, centerY - radius * 0.18, radius * 1.02, radius * 0.26);
    ctx.fillRect(centerX - radius * 0.22, centerY - radius * 1.02, radius * 0.36, radius * 0.28);

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(centerX + radius * 0.04, centerY - radius * 0.56);
    ctx.lineTo(centerX - radius * 0.16, centerY - radius * 0.02);
    ctx.lineTo(centerX + radius * 0.04, centerY - radius * 0.02);
    ctx.lineTo(centerX - radius * 0.08, centerY + radius * 0.54);
    ctx.lineTo(centerX + radius * 0.22, centerY + radius * 0.04);
    ctx.lineTo(centerX + radius * 0.02, centerY + radius * 0.04);
    ctx.closePath();
    ctx.fill();
  }

  function drawShieldIcon(centerX, centerY, radius) {
    ctx.fillStyle = '#2d587f';
    roundRect(centerX - radius * 0.74, centerY - radius * 0.84, radius * 1.46, radius * 1.68, radius * 0.22);
    ctx.fill();

    ctx.fillStyle = '#bde3ff';
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - radius * 0.64);
    ctx.lineTo(centerX + radius * 0.5, centerY - radius * 0.26);
    ctx.lineTo(centerX + radius * 0.34, centerY + radius * 0.42);
    ctx.lineTo(centerX, centerY + radius * 0.68);
    ctx.lineTo(centerX - radius * 0.34, centerY + radius * 0.42);
    ctx.lineTo(centerX - radius * 0.5, centerY - radius * 0.26);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#4e88bc';
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - radius * 0.34);
    ctx.lineTo(centerX + radius * 0.22, centerY - radius * 0.14);
    ctx.lineTo(centerX + radius * 0.12, centerY + radius * 0.18);
    ctx.lineTo(centerX, centerY + radius * 0.3);
    ctx.lineTo(centerX - radius * 0.12, centerY + radius * 0.18);
    ctx.lineTo(centerX - radius * 0.22, centerY - radius * 0.14);
    ctx.closePath();
    ctx.fill();
  }

  function drawPickup(pickup) {
    const centerX = laneCenter(pickup.lane, pickup.y + pickup.radius);
    const centerY = pickup.y + pickup.radius;
    const pulse = 1 + Math.sin(pickup.pulse) * 0.16;
    const radius = pickup.radius * pulse;
    const isBoost = pickup.type === PICKUP_TYPES.boost;

    const glow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius * 2.1);
    if (isBoost) {
      glow.addColorStop(0, 'rgba(255, 236, 176, 0.95)');
      glow.addColorStop(0.42, 'rgba(255, 207, 102, 0.74)');
      glow.addColorStop(1, 'rgba(255, 207, 102, 0)');
    } else {
      glow.addColorStop(0, 'rgba(225, 242, 255, 0.95)');
      glow.addColorStop(0.42, 'rgba(121, 187, 243, 0.74)');
      glow.addColorStop(1, 'rgba(121, 187, 243, 0)');
    }

    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius * 2.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = isBoost ? '#f0a845' : '#5f97c5';
    roundRect(centerX - radius * 0.88, centerY - radius * 0.92, radius * 1.76, radius * 1.84, radius * 0.2);
    ctx.fill();

    if (isBoost) {
      drawBoostIcon(centerX, centerY, radius);
    } else {
      drawShieldIcon(centerX, centerY, radius);
    }
  }

  function drawPlayer() {
    const centerX = state.playerX;
    const top = PLAYER_Y;
    const laneOffset = laneCenter(state.playerLane) - state.playerX;
    const lean = clamp(laneOffset * 0.1, -10, 10);

    ctx.save();
    ctx.translate(centerX, top + PLAYER_HEIGHT * 0.5);

    const shadow = ctx.createRadialGradient(0, 16, 10, 0, 16, 116);
    shadow.addColorStop(0, 'rgba(0, 0, 0, 0.34)');
    shadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = shadow;
    ctx.beginPath();
    ctx.ellipse(0, 52, 66, 86, 0, 0, Math.PI * 2);
    ctx.fill();

    const hullGlow = ctx.createRadialGradient(0, 0, 10, 0, 0, 118);
    hullGlow.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
    hullGlow.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = hullGlow;
    ctx.beginPath();
    ctx.arc(0, 12, 128, 0, Math.PI * 2);
    ctx.fill();

    if (state.shieldReady) {
      ctx.strokeStyle = 'rgba(121, 187, 243, 0.78)';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.ellipse(0, 12, 70, 94, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.rotate(lean * 0.008);

    ctx.fillStyle = state.boostTimer > 0 ? '#f4c24d' : '#d84d42';
    roundRect(-34, -72, 68, 142, 24);
    ctx.fill();

    ctx.fillStyle = '#b3281f';
    roundRect(-30, -60, 60, 98, 18);
    ctx.fill();

    ctx.fillStyle = '#dbe7f2';
    roundRect(-22, -46, 44, 28, 10);
    ctx.fill();

    ctx.fillStyle = '#1e2833';
    roundRect(-20, -42, 40, 20, 8);
    ctx.fill();

    ctx.fillStyle = '#f3f5f7';
    ctx.fillRect(-26, -10, 52, 8);
    ctx.fillRect(-26, 18, 52, 8);

    if (state.boostTimer > 0) {
      const boostAlpha = clamp(state.boostTimer / BOOST_DURATION, 0.25, 1);
      ctx.fillStyle = `rgba(255, 186, 69, ${0.92 * boostAlpha})`;
      ctx.beginPath();
      ctx.moveTo(-14, 72);
      ctx.lineTo(0, 124 + Math.sin(state.idleClock * 16) * 8);
      ctx.lineTo(14, 72);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = '#14181c';
    roundRect(-38, -48, 10, 34, 6);
    ctx.fill();
    roundRect(28, -48, 10, 34, 6);
    ctx.fill();
    roundRect(-38, 30, 10, 34, 6);
    ctx.fill();
    roundRect(28, 30, 10, 34, 6);
    ctx.fill();
    ctx.restore();
  }

  function drawParticles() {
    state.particles.forEach((particle) => {
      const alpha = particle.life / particle.maxLife;
      ctx.fillStyle = hexToRgba(particle.color, alpha);
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size * alpha, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawMessageBanner() {
    if (state.messageTimer <= 0 || !state.messageText || state.mode === 'ready') {
      return;
    }

    const alpha = clamp(state.messageTimer / 1.05, 0.12, 1);
    ctx.fillStyle = hexToRgba(state.messageColor, 0.14 * alpha);
    roundRect(314, 108, 272, 50, 18);
    ctx.fill();

    ctx.fillStyle = hexToRgba(state.messageColor, 0.98 * alpha);
    ctx.font = '700 24px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(state.messageText, canvas.width / 2, 140);
  }

  function render() {
    drawBackground();
    drawRoad();
    state.pickups.forEach(drawPickup);
    state.obstacles.forEach(drawObstacle);
    drawParticles();
    drawPlayer();
    drawMessageBanner();
  }

  function frame(now) {
    if (!state.lastFrameTime) {
      state.lastFrameTime = now;
    }

    const deltaTime = Math.min(0.033, (now - state.lastFrameTime) / 1000);
    state.lastFrameTime = now;

    updateGame(deltaTime);
    updateHud();
    render();

    window.requestAnimationFrame(frame);
  }

  function roundRect(x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function hexToRgba(hex, alpha) {
    const normalized = hex.replace('#', '');
    const value = normalized.length === 3
      ? normalized.split('').map((char) => char + char).join('')
      : normalized;
    const numeric = parseInt(value, 16);
    const red = (numeric >> 16) & 255;
    const green = (numeric >> 8) & 255;
    const blue = numeric & 255;
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }

  startButton.addEventListener('click', () => {
    startRun();
  });

  restartButton.addEventListener('click', () => {
    resetRun('ready');
    startRun();
  });

  lobbyButton.addEventListener('click', () => {
    if (state.isSubmitting) return;
    returnToMinigameHub();
  });

  canvas.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    onCanvasPress(event.clientX);
  });

  document.addEventListener('keydown', (event) => {
    const key = event.key;
    if (['ArrowLeft', 'ArrowRight', 'a', 'A', 'd', 'D', ' ', 'Enter', '1', '2', '3'].includes(key)) {
      event.preventDefault();
    }

    if (state.isSubmitting || IS_PREVIEW_MODE) {
      return;
    }

    if (key === 'ArrowLeft' || key === 'a' || key === 'A') {
      movePlayerToLane(state.playerLane - 1);
      return;
    }

    if (key === 'ArrowRight' || key === 'd' || key === 'D') {
      movePlayerToLane(state.playerLane + 1);
      return;
    }

    if (key === '1') {
      movePlayerToLane(0);
      return;
    }

    if (key === '2') {
      movePlayerToLane(1);
      return;
    }

    if (key === '3') {
      movePlayerToLane(2);
      return;
    }

    if (key === ' ' || key === 'Enter') {
      if (state.mode === 'gameover') {
        resetRun('ready');
      }
      startRun();
    }
  });

  resetRun();
  refreshTopEntry();
  window.requestAnimationFrame(frame);
})();
