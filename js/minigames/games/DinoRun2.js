
        document.addEventListener('DOMContentLoaded', () => {
            function returnToMinigameHub() {
                try {
                    if (window.parent && window.parent !== window && window.parent.LivelySam?.MinigamesHub?.closeRunner) {
                        window.parent.LivelySam.MinigamesHub.closeRunner();
                        return;
                    }
                } catch {}
                window.location.href = 'index.html';
            }
            
	    // --- 0. Game 2 URL ---
            const MINIGAME_ID = 'dino-run-2';
            const IS_PREVIEW_MODE = new URLSearchParams(window.location.search).get('preview') === '1';

            function getLeaderboardBridge() {
                if (IS_PREVIEW_MODE) {
                    return null;
                }
                try {
                    if (window.parent && window.parent !== window && window.parent.LivelySam?.Leaderboard) {
                        return window.parent.LivelySam.Leaderboard;
                    }
                } catch {}
                return window.LivelySam?.Leaderboard || null;
            }

            // --- 1. 글로벌 변??�?공통 ?�소 ---
            let game2Instance = null; 
            const body = document.body;
            const game2Wrapper = document.getElementById('game-2-wrapper');
            
            // --- 4. Game 2 (DinoGame_2) ?�행 ?�수 ---
            function launchGame2(username) {
                if (game2Instance) {
                    // ?�전 ?�스?�스 ?�리 (?�요??
                    if (game2Instance.loop) cancelAnimationFrame(game2Instance.loop);
                    document.removeEventListener('keydown', game2Instance.keyHandler);
                    document.removeEventListener('mousedown', game2Instance.mouseHandler);
                    document.removeEventListener('touchstart', game2Instance.touchHandler);
                }
                game2Instance = {}; 
                const gameUsername = username; 
                
                const canvas = game2Wrapper.querySelector('#game-canvas-g2');
                const ctx = canvas.getContext('2d');
                
                const scoreDisplay = game2Wrapper.querySelector('#score-display-g2');
                const highscoreDisplay = game2Wrapper.querySelector('#highscore-display-g2');
                const startOverlay = game2Wrapper.querySelector('#start-overlay-g2');
                const gameOverOverlay = game2Wrapper.querySelector('#game-over-overlay-g2');
                const globalHighscoreDisplay = game2Wrapper.querySelector('#global-highscore-display-g2'); 
                
                // (?�정) ?�로가�?버튼 리스??-> index.html�??�동
                const backBtnG2 = game2Wrapper.querySelector('.back-btn');
                backBtnG2.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    returnToMinigameHub();
                });

                const dinoIcon = '🦖';
                const cactusIcons = ['🌵', '🌵', '🌵', '🌵🌵', '🌵🌵', '🌵🌵🌵'];
                const meatIcon = '?��'; 
                const birdIcon = '🦅'; 

                const iconSize = 30;
                const groundY = canvas.height - 2; 
                const playerX = 50;
                const jumpForce = 12; 
                const gravity = 0.7;
                
                const initialSpeed = 6.354;
                const speedIncrease = 0.0012; 
                const nightModeThreshold = 200;

                let player;
                let obstacles = [], stars = [], items = [], hazards = [], effects = [], weatherParticles = []; 
                let score = 0, localHighScore = 0; 
                let globalHighScoreData = { score: 0, name: 'N/A' }; 
                let gameSpeed = initialSpeed;
                let gameState = 'lobby'; 
                let obstacleSpawnTimer = 0, itemSpawnTimer = 0, hazardSpawnTimer = 0;
                let lastWeatherSpawn = 0, scoreMilestone = 500; 
                let gameLoop; 
                let isNightMode = false, isSubmitting = false; 
                let combo = 0;

                // --- ?�래???�의 (Player, Obstacle, Item, Hazard, Effect, Star, WeatherParticle) ---
                class Player {
                    constructor(x, y) {
                        this.x = x; this.y = y; this.width = iconSize; this.height = iconSize;
                        this.dy = 0; this.isJumping = false; this.jumpForce = jumpForce; 
                    }
                    draw() {
                        ctx.save(); ctx.translate(this.x + (this.width / 2), this.y); ctx.scale(-1, 1);
                        ctx.fillStyle = isNightMode ? '#eee' : '#555'; ctx.font = `${iconSize}px Arial`;
                        ctx.textBaseline = 'bottom'; ctx.textAlign = 'center'; ctx.fillText(dinoIcon, 0, 5); ctx.restore(); 
                    }
                    update() {
                        this.dy += gravity; this.y += this.dy;
                        if (this.y > groundY) { this.y = groundY; this.dy = 0; this.isJumping = false; }
                    }
                    jump() { if (!this.isJumping) { this.dy = -this.jumpForce; this.isJumping = true; } }
                }
                class Obstacle { 
                    constructor(x, y, icon) {
                        this.x = x; this.y = y; this.icon = icon;
                        this.width = iconSize * (icon.length / 2); this.height = iconSize;
                    }
                    draw() {
                        ctx.fillStyle = isNightMode ? '#eee' : '#555'; ctx.font = `${iconSize}px Arial`;
                        ctx.textBaseline = 'bottom'; ctx.textAlign = 'start'; ctx.fillText(this.icon, this.x, this.y+4);
                    }
                    update() { this.x -= gameSpeed; }
                }
                class Item { 
                    constructor(x, y, icon, data, size) {
                        this.x = x; this.y = y; this.icon = icon; this.type = data.type; this.effect = data.effect;
                        this.value = data.value; this.size = size || iconSize; 
                        this.width = this.size; this.height = this.size; this.isHit = false; 
                    }
                    draw() {
                        ctx.fillStyle = isNightMode ? '#eee' : '#555'; ctx.font = `${this.size}px Arial`; 
                        ctx.textBaseline = 'bottom'; ctx.textAlign = 'start'; ctx.fillText(this.icon, this.x, this.y + 4);
                    }
                    update() { this.x -= gameSpeed; }
                }
                class Hazard { 
                    constructor(x, y, icon, points) {
                        this.x = x; this.baseY = y; this.y = y; this.icon = icon; this.points = points;
                        this.width = iconSize; this.height = iconSize;
                        this.animationTimer = Math.random() * 20; this.iconFrames = ['🦅', '🦇']; this.isHit = false; 
                    }
                    draw() {
                        ctx.fillStyle = isNightMode ? '#eee' : '#555'; ctx.font = `${iconSize}px Arial`;
                        ctx.textBaseline = 'bottom'; ctx.textAlign = 'start'; ctx.fillText(this.icon, this.x, this.y); 
                    }
                    update() {
                        this.x -= gameSpeed; this.animationTimer++;
                        this.y = this.baseY + Math.sin(this.animationTimer * 0.1) * 5; 
                        this.icon = this.iconFrames[Math.floor(this.animationTimer / 10) % this.iconFrames.length];
                    }
                }
                class Effect {
                    constructor(x, y, text, color) {
                        this.x = x; this.y = y; this.text = text; this.color = color;
                        this.opacity = 1.0; this.duration = 60; 
                    }
                    update() { this.y -= 0.5; this.opacity -= 1.0 / this.duration; this.duration--; }
                    draw() {
                        ctx.save(); ctx.globalAlpha = this.opacity; ctx.fillStyle = this.color;
                        ctx.font = 'bold 20px Arial'; ctx.textAlign = 'center';
                        ctx.fillText(this.text, this.x, this.y); ctx.restore();
                    }
                }
                class Star { 
                    constructor() {
                        this.x = Math.random() * canvas.width; this.y = Math.random() * (canvas.height - 50);
                        this.radius = Math.random() * 1.5; this.opacity = Math.random();
                        this.fadeDirection = (Math.random() > 0.5) ? 'in' : 'out';
                    }
                    draw() {
                        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
                        ctx.fillStyle = `rgba(255, 255, 255, ${this.opacity})`; ctx.fill();
                    }
                    update() { 
                        this.x -= (gameSpeed * 0.2); 
                        if (this.x < 0) this.x = canvas.width;
                        if (this.fadeDirection === 'in') { this.opacity += 0.005; if (this.opacity > 1) this.fadeDirection = 'out';
                        } else { this.opacity -= 0.005; if (this.opacity < 0) this.fadeDirection = 'in'; }
                    }
                }
                class WeatherParticle { 
                    constructor() {
                        this.x = Math.random() * canvas.width; this.y = -10; this.icon = '?�️'; 
                        this.speed = Math.random() * 1 + 1; this.size = 5 + Math.random() * 5; 
                    }
                    update() {
                        this.y += this.speed; this.x -= (gameSpeed * 0.1); 
                        if (this.x < -10) this.x = canvas.width + 10;
                    }
                    draw() { ctx.font = `${this.size}px Arial`; ctx.fillText(this.icon, this.x, this.y); }
                }
                
                // --- ?�심 ?�수 ---
                function drawGround() {
                    ctx.beginPath(); ctx.moveTo(0, groundY + 1); ctx.lineTo(canvas.width, groundY + 1);
                    ctx.strokeStyle = isNightMode ? '#aaa' : '#555'; ctx.lineWidth = 3; ctx.stroke();
                }
                async function fetchGlobalHighScore() {
                    const leaderboard = getLeaderboardBridge();
                    if (leaderboard?.getTopEntry) {
                        try {
                            const topEntry = await leaderboard.getTopEntry({ gameId: MINIGAME_ID });
                            if (topEntry) {
                                return { score: topEntry.score, name: topEntry.nickname || 'Unknown' };
                            }
                        } catch (error) {
                            console.warn('G2: 리더보드 모듈 조회 ?�패, 기존 ?�트�??�백?�니??', error);
                        }
                        return { score: 0, name: 'N/A' };
                    }

                    return { score: 0, name: 'N/A' };

                    try {
                        const response = await fetch(GET_HIGHSCORE_URL_G2); 
                        if (!response.ok) throw new Error('Network response was not ok');
                        const data = await response.json();
                        if (data.result === 'success') return data; 
                        else console.error('G2: ?�버?�서 최고 ?�수 ?�이???�식???�못?�었?�니??');
                    } catch (error) { console.error("G2: 최고 점수 불러오기 실패:", error); }
                    return { score: 0, name: 'N/A' }; 
                }
                async function updateGlobalHighScore() {
                    globalHighScoreData = await fetchGlobalHighScore();
                }
                function initGame() {
                    localHighScore = localStorage.getItem('dinoLocalHighScore_g2') || 0; 
                    scoreDisplay.textContent = '점수: 0';
                    player = new Player(playerX, groundY);
                    obstacles = []; stars = []; items = []; 
                    hazards = []; effects = []; weatherParticles = []; 
                    score = 0; gameSpeed = initialSpeed; gameState = 'ready'; 
                    obstacleSpawnTimer = 95; itemSpawnTimer = 400; hazardSpawnTimer = 180; 
                    scoreMilestone = 500; isNightMode = false; isSubmitting = false; combo = 0;
                    for (let i=0; i < 50; i++) stars.push(new Star());
                    applyNightMode(false); body.classList.remove('dazzling'); 
                    startOverlay.style.display = 'flex'; gameOverOverlay.style.display = 'none';
                    if (!game2Instance.loop) { game2Instance.loop = requestAnimationFrame(animate); }
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    drawGround(); player.draw();
                    scoreDisplay.textContent = '점수: 0';
                }
                function startGame() {
                    if ((gameState === 'ready' || gameState === 'gameOver') && !isSubmitting) {
                        if (gameState === 'gameOver') initGame(); 
                        gameState = 'playing'; 
                        startOverlay.style.display = 'none';
                        gameOverOverlay.style.display = 'none';
                    }
                }
                function spawnObstacle() { 
                    const icon = cactusIcons[Math.floor(Math.random() * cactusIcons.length)]; 
                    obstacles.push(new Obstacle(canvas.width + 50, groundY, icon));
                    obstacleSpawnTimer = (Math.random() * 100 + 70) * (initialSpeed / gameSpeed);
                }
                function spawnItem() { 
                    const meatData = { type: 'points', effect: 'score', value: 10 };
                    items.push(new Item(canvas.width + 100, groundY, meatIcon, meatData, 25)); 
                    itemSpawnTimer = (Math.random() * 285 + 225) * (initialSpeed / gameSpeed); 
                }
                function spawnHazard() { 
                    const birdY = (Math.random() > 0.5) ? groundY - 35 : groundY - 65; 
                    hazards.push(new Hazard(canvas.width + 50, birdY, birdIcon, -50)); 
                    hazardSpawnTimer = (Math.random() * 210 + 170) * (initialSpeed / gameSpeed);
                }
                function applyNightMode(enable) {
                    isNightMode = enable;
                    if (enable) body.classList.add('night-mode');
                    else body.classList.remove('night-mode');
                }
                function triggerDazzlingEffect() {
                    body.classList.add('dazzling');
                    setTimeout(() => { body.classList.remove('dazzling'); }, 5000); 
                }
                function animate() {
                    if (!game2Instance) return; 
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    drawGround();
                    for (let i = weatherParticles.length - 1; i >= 0; i--) {
                        let p = weatherParticles[i]; p.update(); p.draw();
                        if (p.y > canvas.height + 10) weatherParticles.splice(i, 1); 
                    }
                    if (isNightMode) { stars.forEach(star => { star.update(); star.draw(); }); }
                    if (gameState === 'playing') {
                        score += 0.1; gameSpeed += speedIncrease; 
                        scoreDisplay.textContent = `점수: ${Math.floor(score)}`;
                        const scoreBlockWeather = Math.floor(score / 100);
                        const shouldShowLeaves = (scoreBlockWeather % 2 === 1); 
                        if (shouldShowLeaves) {
                            lastWeatherSpawn++;
                            if (lastWeatherSpawn > 20) { weatherParticles.push(new WeatherParticle()); lastWeatherSpawn = 0; }
                        } else { if (weatherParticles.length > 0) weatherParticles = []; }
                        if (score > scoreMilestone) { triggerDazzlingEffect(); scoreMilestone += 500; }
                        const scoreBlock = Math.floor(score / nightModeThreshold);
                        const shouldBeNight = (scoreBlock % 2 === 1); 
                        if (shouldBeNight && !isNightMode) applyNightMode(true);
                        else if (!shouldBeNight && isNightMode) applyNightMode(false);
                        obstacleSpawnTimer--; if (obstacleSpawnTimer <= 0) spawnObstacle();
                        itemSpawnTimer--; if (itemSpawnTimer <= 0) spawnItem(); 
                        hazardSpawnTimer--; if (hazardSpawnTimer <= 0) spawnHazard();
                        for (let i = obstacles.length - 1; i >= 0; i--) {
                            let obs = obstacles[i]; obs.update(); obs.draw();
                            if (obs.x + obs.width < 0) obstacles.splice(i, 1);
                        }
                        for (let i = items.length - 1; i >= 0; i--) {
                            let item = items[i]; item.update(); item.draw();
                            if (item.x + item.width < 0) items.splice(i, 1);
                        }
                        for (let i = hazards.length - 1; i >= 0; i--) {
                            let haz = hazards[i]; haz.update(); haz.draw();
                            if (haz.x + haz.width < 0) hazards.splice(i, 1);
                        }
                        player.update(); player.draw();
                        for (let i = effects.length - 1; i >= 0; i--) {
                            let effect = effects[i]; effect.update(); effect.draw();
                            if (effect.duration <= 0) effects.splice(i, 1);
                        }
                        checkCollisions(); 
                    } else { 
                        player.draw(); obstacles.forEach(obs => obs.draw());
                        items.forEach(item => item.draw()); hazards.forEach(haz => haz.draw());
                        effects.forEach(effect => effect.draw()); weatherParticles.forEach(p => p.draw());
                    }
                    game2Instance.loop = requestAnimationFrame(animate); 
                }
                function isColliding(player, obj, padding) {
                    let playerTop = player.y - player.height; let playerBottom = player.y;
                    let objTop = obj.y - obj.height; let objBottom = obj.y;
                    if (obj instanceof Hazard) { objTop = obj.y - obj.height; objBottom = obj.y; }       
                    else { objTop = obj.y - obj.height; objBottom = obj.y; }
                    return ( player.x < obj.x + obj.width - padding &&
                             player.x + player.width - padding > obj.x &&
                             playerTop < objBottom && playerBottom > objTop );
                }
                function showEffect(x, y, text, color) { effects.push(new Effect(x, y, text, color)); }
                function checkCollisions() {
                    const padding = 5; 
                    for (let i = obstacles.length - 1; i >= 0; i--) {
                        let obs = obstacles[i];
                        if (isColliding(player, obs, padding)) {
                            showEffect(player.x, player.y - player.height, '�?', '#ff3300');
                            triggerGameOver(); return; 
                        }
                    }
                    for (let i = items.length - 1; i >= 0; i--) {
                        let item = items[i];
                        if (!item.isHit && isColliding(player, item, padding)) {
                            item.isHit = true; 
                            if (item.type === 'points') {
                                combo++; const pointsEarned = 10 * combo; score += pointsEarned; 
                                showEffect(player.x, player.y - player.height, `+${pointsEarned} (x${combo})`, '#00cc66');
                            }
                        scoreDisplay.textContent = `점수: ${Math.floor(score)}`;
                        }
                    }
                    for (let i = hazards.length - 1; i >= 0; i--) {
                        let haz = hazards[i];
                        if (!haz.isHit && isColliding(player, haz, padding)) {
                            haz.isHit = true; score += haz.points; combo = 0; 
                            if (score < 0) { 
                                scoreDisplay.textContent = `점수: ${Math.floor(score)}`;
                                showEffect(player.x, player.y - player.height, 'GAME OVER', '#ff3300');
                                triggerGameOver(); return; 
                            }
                    scoreDisplay.textContent = '점수: 0';
                            showEffect(player.x, player.y - player.height, `${haz.points}`, '#ff3300');
                            hazards.splice(i, 1); 
                        }
                    }
                }
                async function triggerGameOver() {
                    if (gameState === 'gameOver') return; 
                    gameState = 'gameOver';
                    gameOverOverlay.style.display = 'flex';
                    body.classList.remove('dazzling'); 
                    const finalScore = Math.floor(score);
                    if (finalScore > localHighScore) {
                        localHighScore = finalScore;
                        localStorage.setItem('dinoLocalHighScore_g2', localHighScore); 
                        scoreDisplay.textContent = `점수: ${Math.floor(score)}`;
                    }
                    
                    const pElement = gameOverOverlay.querySelector('p#global-highscore-display-g2');
                    pElement.textContent = ''; 

                    if (finalScore >= 200) {
                        isSubmitting = true; 
                        pElement.textContent = '200???�상! ?�수 ?�송 �?..';
                        await submitAndFetchScores(finalScore, pElement); 
                    } else {
                        isSubmitting = false; 
                        pElement.textContent = '200??미만?� 기록?��? ?�습?�다.';
                    }
                }
                async function submitAndFetchScores(finalScore, pElement) { 
                    const leaderboard = getLeaderboardBridge();
                    if (leaderboard?.submitScore) {
                        try {
                            await leaderboard.submitScore({
                                gameId: MINIGAME_ID,
                                nickname: gameUsername,
                                score: finalScore
                            });
                        } catch (error) {
                            console.error("G2 ?�수 ?�송 �??�류:", error);
                            pElement.textContent = '?�수 ?�송 ?�패 (?�류)';
                            isSubmitting = false;
                            return;
                        }

                        try {
                            const topEntry = await leaderboard.getTopEntry({ gameId: MINIGAME_ID });
                            if (topEntry) {
                                globalHighScoreData.score = topEntry.score;
                                globalHighScoreData.name = topEntry.nickname || gameUsername;
                                const maskedName = leaderboard.maskNickname
                                    ? leaderboard.maskNickname(topEntry.nickname || gameUsername)
                                    : (topEntry.nickname || gameUsername);
                                pElement.textContent = `전체 최고 점수: ${topEntry.score} (${maskedName})`;
                            } else {
                                pElement.textContent = '아직 등록된 기록이 없습니다.';
                            }
                        } catch (error) {
                            console.error("G2 최고 점수 불러오기 실패:", error);
                            pElement.textContent = '최고 점수 연결 오류';
                        }

                        isSubmitting = false;
                        return;
                    }

                    throw new Error('Firebase leaderboard bridge unavailable');

                    const data = { name: gameUsername, score: finalScore }; 
                    try {
                        const formData = new URLSearchParams();
                        formData.append('name', data.name); formData.append('score', data.score);
                        const submitResponse = await fetch(SUBMIT_SCORE_URL_G2, { 
                            method: 'POST', mode: 'cors', 
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded', },
                            body: formData.toString() 
                        });
                        console.log('G2 ?�수 ?�송 ?�도 ?�료. (?�답 ?�태: ' + submitResponse.status + ')');
                    } catch (error) {
                        console.error("G2 ?�수 ?�송 �??�류:", error);
                        pElement.textContent = '?�수 ?�송 ?�패 (?�류)';
                    }
                    try {
                        const highscoreResponse = await fetch(GET_HIGHSCORE_URL_G2); 
                        if (!highscoreResponse.ok) throw new Error('Network response was not ok');
                        const hsData = await highscoreResponse.json();
                        if (hsData.result === 'success') {
                            const globalHighScore = hsData.highScore;
                            if (finalScore > globalHighScoreData.score) {
                                globalHighScoreData.score = finalScore;
                                globalHighScoreData.name = gameUsername; 
                            }
                            const globalHighScoreName = hsData.name || "Unknown";
                            const maskedName = globalHighScoreName.substring(0, 2) + '*'.repeat(Math.max(0, globalHighScoreName.length - 2));
                            pElement.textContent = `전체 최고 점수: ${globalHighScore} (${maskedName})`;
                        } else { pElement.textContent = '최고 점수 불러오기 실패'; }
                    } catch (error) {
                        console.error("G2 최고 점수 불러오기 실패:", error);
                        pElement.textContent = '최고 점수 연결 오류';
                    }
                    isSubmitting = false; 
                }
                
                // --- ?�벤??리스??---
                function handleGameAction() {
                    if (gameState === 'playing') player.jump();
                    else startGame(); 
                }
                function handleInput(e) {
                    if (e.key === ' ' || e.code === 'Space') {
                        e.preventDefault(); handleGameAction(); 
                    }
                }
                function handleMouseInput(e) {
                    if (e.target.closest('.back-btn')) { // (?�정)
                        return;
                    }
                    e.preventDefault(); handleGameAction();
                }
                function handleTouchInput(e) {
                    if (e.target.closest('.back-btn')) { // (?�정)
                        return;
                    }
                    e.preventDefault(); handleGameAction(); 
                }
                
                game2Instance.keyHandler = handleInput;
                game2Instance.mouseHandler = handleMouseInput;
                game2Instance.touchHandler = handleTouchInput;

                document.addEventListener('keydown', game2Instance.keyHandler);
                document.addEventListener('mousedown', game2Instance.mouseHandler); 
                document.addEventListener('touchstart', game2Instance.touchHandler, { passive: false }); 
                
                updateGlobalHighScore(); 
                initGame(); 
            }

            
            // --- (?�정) 5. ?�동 ?�행 로직 ---
            // 로컬 ?�토리�??�서 ?�용???�름??불러?�니??
            const gameUsername = localStorage.getItem('j_game_username') || 'Guest';
            console.log(gameUsername + "님이 게임을 시작합니다.");
            
            // launchGame2 ?�수�?즉시 ?�출?�니??
            launchGame2(gameUsername);

        }); 
    
