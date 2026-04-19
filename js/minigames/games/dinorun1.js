
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
            
	    // --- 0. Game 1 URL ---
            const MINIGAME_ID = 'dino-run-1';
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
            let game1Instance = null; 
            const body = document.body;
            const game1Wrapper = document.getElementById('game-1-wrapper');

            // --- 3. Game 1 (DinoGame_1) ?�행 ?�수 ---
            function launchGame1(username) {
                if (game1Instance) {
                    // ?�전 ?�스?�스 ?�리 (?�요??
                    if (game1Instance.loop) cancelAnimationFrame(game1Instance.loop);
                    document.removeEventListener('keydown', game1Instance.keyHandler);
                    document.removeEventListener('mousedown', game1Instance.mouseHandler);
                    document.removeEventListener('touchstart', game1Instance.touchHandler);
                }
                game1Instance = {}; 
                const gameUsername = username; 
                
                const canvas = game1Wrapper.querySelector('#game-canvas-g1');
                const ctx = canvas.getContext('2d');
                
                const scoreDisplay = game1Wrapper.querySelector('#score-display-g1');
                const highscoreDisplay = game1Wrapper.querySelector('#highscore-display-g1');
                const startOverlay = game1Wrapper.querySelector('#start-overlay-g1');
                const gameOverOverlay = game1Wrapper.querySelector('#game-over-overlay-g1');
                const globalHighscoreDisplay = game1Wrapper.querySelector('#global-highscore-display-g1');
                
                // (?�정) ?�로가�?버튼 리스??-> index.html�??�동
                const backBtnG1 = game1Wrapper.querySelector('.back-btn');
                backBtnG1.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    returnToMinigameHub();
                });

                const dinoIcon = '🦖';
                const cactusIcons = ['🌵', '🌵', '🌵', '🌵🌵', '🌵🌵', '🌵🌵🌵'];
                const iconSize = 30;
                const groundY = canvas.height - 2; 
                const playerX = 50;
                const jumpForce = 12;
                const gravity = 0.7;
                const initialSpeed = 5;
                const speedIncrease = 0.001;
                const nightModeThreshold = 200;

                let player;
                let obstacles = [];
                let stars = []; 
                let score = 0;
                let localHighScore = 0; 
                let globalHighScoreData = { score: 0, name: 'N/A' }; 
                let gameSpeed = initialSpeed;
                let gameState = 'lobby'; 
                let obstacleSpawnTimer = 0;
                let gameLoop; 
                let isNightMode = false;
                let isSubmitting = false; 

                // --- ?�래???�의 (Player, Obstacle, Star) ---
                class Player {
                    constructor(x, y) {
                        this.x = x; this.y = y; 
                        this.width = iconSize; this.height = iconSize;
                        this.dy = 0; this.isJumping = false;
                    }
                    draw() {
                        ctx.save(); 
                        ctx.translate(this.x + (this.width / 2), this.y); 
                        ctx.scale(-1, 1);
                        ctx.fillStyle = isNightMode ? '#eee' : '#555';
                        ctx.font = `${iconSize}px Arial`;
                        ctx.textBaseline = 'bottom'; ctx.textAlign = 'center'; 
                        ctx.fillText(dinoIcon, 0, 5); 
                        ctx.restore(); 
                    }
                    update() {
                        this.dy += gravity; this.y += this.dy;
                        if (this.y > groundY) { this.y = groundY; this.dy = 0; this.isJumping = false; }
                    }
                    jump() { if (!this.isJumping) { this.dy = -jumpForce; this.isJumping = true; } }
                }
                class Obstacle {
                    constructor(x, y, icon) {
                        this.x = x; this.y = y; this.icon = icon;
                        this.width = iconSize * (icon.length / 2); this.height = iconSize;
                    }
                    draw() {
                        ctx.fillStyle = isNightMode ? '#eee' : '#555';
                        ctx.font = `${iconSize}px Arial`;
                        ctx.textBaseline = 'bottom'; ctx.textAlign = 'start';
                        ctx.fillText(this.icon, this.x, this.y+4);
                    }
                    update() { this.x -= gameSpeed; }
                }
                class Star {
                    constructor() {
                        this.x = Math.random() * canvas.width;
                        this.y = Math.random() * (canvas.height - 50);
                        this.radius = Math.random() * 1.5;
                        this.opacity = Math.random();
                        this.fadeDirection = (Math.random() > 0.5) ? 'in' : 'out';
                    }
                    draw() {
                        ctx.beginPath();
                        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
                        ctx.fillStyle = `rgba(255, 255, 255, ${this.opacity})`;
                        ctx.fill();
                    }
                    update() { 
                        this.x -= (gameSpeed * 0.2);
                        if (this.x < 0) this.x = canvas.width;
                        if (this.fadeDirection === 'in') {
                            this.opacity += 0.005; if (this.opacity > 1) this.fadeDirection = 'out';
                        } else {
                            this.opacity -= 0.005; if (this.opacity < 0) this.fadeDirection = 'in';
                        }
                    }
                }
                // --- ?�심 ?�수 ---
                async function fetchGlobalHighScore() {
                    const leaderboard = getLeaderboardBridge();
                    if (leaderboard?.getTopEntry) {
                        try {
                            const topEntry = await leaderboard.getTopEntry({ gameId: MINIGAME_ID });
                            if (topEntry) {
                                return { score: topEntry.score, name: topEntry.nickname || 'Unknown' };
                            }
                        } catch (error) {
                            console.warn('G1: 리더보드 모듈 조회 ?�패, 기존 ?�트�??�백?�니??', error);
                        }
                        return { score: 0, name: 'N/A' };
                    }

                    return { score: 0, name: 'N/A' };

                    try {
                        const response = await fetch(GET_HIGHSCORE_URL_G1); 
                        if (!response.ok) throw new Error('Network response was not ok');
                        const data = await response.json();
                        if (data.result === 'success') return data; 
                        else console.error('G1: ?�버?�서 최고 ?�수 ?�이???�식???�못?�었?�니??');
                    } catch (error) { console.error("G1: 최고 점수 불러오기 실패:", error); }
                    return { score: 0, name: 'N/A' }; 
                }
                async function updateGlobalHighScore() {
                    globalHighScoreData = await fetchGlobalHighScore();
                }
                function initGame() {
                    localHighScore = localStorage.getItem('dinoLocalHighScore_g1') || 0; 
                    scoreDisplay.textContent = '점수: 0';
                    player = new Player(playerX, groundY);
                    obstacles = []; stars = [];
                    score = 0; gameSpeed = initialSpeed;
                    gameState = 'ready'; 
                    obstacleSpawnTimer = 100;
                    isNightMode = false; isSubmitting = false; 
                    for (let i=0; i < 50; i++) stars.push(new Star());
                    applyNightMode(false);
                    startOverlay.style.display = 'flex'; 
                    gameOverOverlay.style.display = 'none';
                    if (!game1Instance.loop) { game1Instance.loop = requestAnimationFrame(animate); }
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    player.draw();
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
                    obstacleSpawnTimer = (Math.random() * 100 + 50) * (initialSpeed / gameSpeed);
                }
                function applyNightMode(enable) {
                    isNightMode = enable;
                    if (enable) body.classList.add('night-mode');
                    else body.classList.remove('night-mode');
                }
                function animate() {
                    if (!game1Instance) return; 
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    if (isNightMode) { stars.forEach(star => { star.update(); star.draw(); }); }
                    if (gameState === 'playing') {
                        score += 0.1; gameSpeed += speedIncrease;
                        scoreDisplay.textContent = `점수: ${Math.floor(score)}`;
                        const scoreBlock = Math.floor(score / nightModeThreshold);
                        const shouldBeNight = (scoreBlock % 2 === 1); 
                        if (shouldBeNight && !isNightMode) applyNightMode(true);
                        else if (!shouldBeNight && isNightMode) applyNightMode(false);
                        obstacleSpawnTimer--;
                        if (obstacleSpawnTimer <= 0) spawnObstacle();
                        for (let i = obstacles.length - 1; i >= 0; i--) {
                            let obs = obstacles[i]; obs.update(); obs.draw();
                            if (obs.x + obs.width < 0) obstacles.splice(i, 1);
                        }
                        player.update(); player.draw();
                        checkCollisions();
                    } else { 
                        player.draw();
                        obstacles.forEach(obs => obs.draw());
                    }
                    game1Instance.loop = requestAnimationFrame(animate); 
                }
                function checkCollisions() {
                    for (let obs of obstacles) {
                        const padding = 5; 
                        let playerTop = player.y - player.height;
                        let playerBottom = player.y;
                        let obsTop = obs.y - obs.height;
                        let obsBottom = obs.y;
                        if (player.x < obs.x + obs.width - padding &&
                            player.x + player.width - padding > obs.x &&
                            playerTop < obsBottom && 
                            playerBottom > obsTop)   
                        {
                            triggerGameOver(); break;
                        }
                    }
                }
                async function triggerGameOver() {
                    if (gameState === 'gameOver') return;
                    gameState = 'gameOver';
                    gameOverOverlay.style.display = 'flex';
                    const finalScore = Math.floor(score);
                    if (finalScore > localHighScore) {
                        localHighScore = finalScore;
                        localStorage.setItem('dinoLocalHighScore_g1', localHighScore); 
                        scoreDisplay.textContent = `점수: ${Math.floor(score)}`;
                    }
                    
                    const pElement = gameOverOverlay.querySelector('p#global-highscore-display-g1');
                    pElement.textContent = ''; 

                    if (finalScore >= 200) {
                        isSubmitting = true; 
                        pElement.textContent = '200???�상! ?�수 ?�송 �?..';
                        let prefixText = '';
                        try {
                            await submitScore(finalScore);
                            prefixText = '?�송 ?�료! ';
                        } catch (error) {
                            console.error("G1 ?�수 ?�송 �??�류:", error);
                            prefixText = '?�송 ?�패. ';
                        }
                        await fetchAndDisplayGlobalScore(finalScore, pElement, prefixText);
                    } else {
                        
                        pElement.textContent = '200??미만?� 기록?��? ?�습?�다.';
                    }
                    isSubmitting = false; 
                }

                async function fetchAndDisplayGlobalScore(finalScore, pElement, prefixText = '') {
                    const leaderboard = getLeaderboardBridge();
                    if (leaderboard?.getTopEntry) {
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
                                pElement.textContent = `${prefixText}아직 등록된 기록이 없습니다.`;
                            }
                        } catch (error) {
                            console.error("G1 최고 점수 불러오기 실패:", error);
                            pElement.textContent = `${prefixText}최고 점수 연결 오류`;
                        }
                        return;
                    }

                    pElement.textContent = `${prefixText}명예???�당 ?�보�?불러?��? 못했?�니??`;
                    return;

                    try {
                        const highscoreResponse = await fetch(GET_HIGHSCORE_URL_G1); 
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
                        } else {
                            pElement.textContent = `${prefixText}최고 점수 불러오기 실패`;
                        }
                    } catch (error) {
                        console.error("G1 최고 점수 불러오기 실패:", error);
                        pElement.textContent = `${prefixText}최고 점수 연결 오류`;
                    }
                }
                async function submitScore(finalScore) { 
                    const leaderboard = getLeaderboardBridge();
                    if (leaderboard?.submitScore) {
                        await leaderboard.submitScore({
                            gameId: MINIGAME_ID,
                            nickname: gameUsername,
                            score: finalScore
                        });
                        return;
                        try {
                            await leaderboard.submitScore({
                                gameId: MINIGAME_ID,
                                nickname: gameUsername,
                                score: finalScore
                            });
                        } catch (error) {
                            console.error("G1 ?�수 ?�송 �??�류:", error);
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
                            console.error("G1 최고 점수 불러오기 실패:", error);
                            pElement.textContent = '최고 점수 연결 오류';
                        }

                        isSubmitting = false;
                        return;
                    }

                    throw new Error('Firebase leaderboard bridge unavailable');

                    const data = { name: gameUsername, score: finalScore }; 
                    try {
                        const formData = new URLSearchParams();
                        formData.append('name', data.name);
                        formData.append('score', data.score);
                        const submitResponse = await fetch(SUBMIT_SCORE_URL_G1, { 
                            method: 'POST', mode: 'cors', 
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded', },
                            body: formData.toString() 
                        });
                        console.log('G1 ?�수 ?�송 ?�도 ?�료. (?�답 ?�태: ' + submitResponse.status + ')');
                    } catch (error) {
                        console.error("G1 ?�수 ?�송 �??�류:", error);
                        pElement.textContent = '?�수 ?�송 ?�패 (?�류)';
                    }

                    try {
                        const highscoreResponse = await fetch(GET_HIGHSCORE_URL_G1); 
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
                        console.error("G1 최고 점수 불러오기 실패:", error);
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
                
                game1Instance.keyHandler = handleInput;
                game1Instance.mouseHandler = handleMouseInput;
                game1Instance.touchHandler = handleTouchInput;

                document.addEventListener('keydown', game1Instance.keyHandler);
                document.addEventListener('mousedown', game1Instance.mouseHandler); 
                document.addEventListener('touchstart', game1Instance.touchHandler, { passive: false }); 
                
                updateGlobalHighScore(); 
                initGame(); 
            }
            
            // --- (?�정) 5. ?�동 ?�행 로직 ---
            // 로컬 ?�토리�??�서 ?�용???�름??불러?�니??
            const gameUsername = localStorage.getItem('j_game_username') || 'Guest';
            console.log(gameUsername + "님이 게임을 시작합니다.");

            // launchGame1 ?�수�?즉시 ?�출?�니??
            launchGame1(gameUsername);

        }); 
    
