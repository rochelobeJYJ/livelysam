
        // --- 1. ?�용???�름 �??�버 URL ?�정 ---
        const MINIGAME_ID = 'wing-tap-1';
        const IS_PREVIEW_MODE = new URLSearchParams(window.location.search).get('preview') === '1';
        const gameUsername = localStorage.getItem('j_game_username') || 'Guest';
        console.log(gameUsername + "님이 게임을 시작합니다.");

        const GAME_ID = "game1";

        function returnToMinigameHub() {
            try {
                if (window.parent && window.parent !== window && window.parent.LivelySam?.MinigamesHub?.closeRunner) {
                    window.parent.LivelySam.MinigamesHub.closeRunner();
                    return;
                }
            } catch {}
            window.location.href = 'index.html';
        }

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

        // --- 2. DOM ?�소 참조 ---
        const canvas = document.getElementById('gameCanvas');
        const ctx = canvas.getContext('2d');
        const WIDTH = canvas.width;
        const HEIGHT = canvas.height;

        const startOverlay = document.getElementById('start-overlay');
        const gameOverOverlay = document.getElementById('game-over-overlay');
        const globalHighscoreDisplay = document.getElementById('global-highscore-display');
        const restartBtn = gameOverOverlay.querySelector('.restart-btn');
        const lobbyBtn = gameOverOverlay.querySelector('.back-btn');

        // --- ?�상 ---
        const WHITE = '#FFFFFF';
        const BLACK = '#000000';
        const SKY_BLUE_TOP = '#87CEFA';
        const SKY_BLUE_BOTTOM = '#B0E2FF';
        const SUNSET_TOP = '#ff7b7b';
        const SUNSET_BOTTOM = '#feca57';
        const NIGHT_SKY_TOP = '#000033';
        const NIGHT_SKY_BOTTOM = '#000066';
        const SUNRISE_TOP = '#a29bfe';
        const SUNRISE_BOTTOM = '#fd79a8';
        const DAY_TOP_RGB = hexToRgb(SKY_BLUE_TOP);
        const DAY_BOTTOM_RGB = hexToRgb(SKY_BLUE_BOTTOM);
        const SUNSET_TOP_RGB = hexToRgb(SUNSET_TOP);
        const SUNSET_BOTTOM_RGB = hexToRgb(SUNSET_BOTTOM);
        const NIGHT_TOP_RGB = hexToRgb(NIGHT_SKY_TOP);
        const NIGHT_BOTTOM_RGB = hexToRgb(NIGHT_SKY_BOTTOM);
        const SUNRISE_TOP_RGB = hexToRgb(SUNRISE_TOP);
        const SUNRISE_BOTTOM_RGB = hexToRgb(SUNRISE_BOTTOM);
        const GREEN_PIPE = '#228B22';
        const GREEN_PIPE_DARK = '#2E712E';
        const PLANE_RED = '#D91E18';
        const PLANE_GREY = '#A9A9A9';
        const THRUST_YELLOW = '#FFDF00';
        const THRUST_ORANGE = '#FFA500';
        const GAME_OVER_RED = '#FF4500';

        // --- (?�정) 1. ?�트 ?�수 ---
        const FONT_RETRO_48 = "48px 'Press Start 2P', cursive"; 
        const FONT_RETRO_70 = "70px 'Press Start 2P', cursive"; 
        const FONT_KOREAN_48 = "bold 48px 'Inter', sans-serif";
        const FONT_KOREAN_30 = "bold 30px 'Inter', sans-serif";
	const FONT_INTER_70 = "bold 70px 'Inter', sans-serif";

        // --- 물리/?�이???�수 ---
        const GRAVITY = 0.5;
        const THRUST = -8;
        const BASE_GAME_SPEED = 3.5;
        const MAX_GAME_SPEED = 12;
        const BASE_GAP_HEIGHT = 360;
        const MIN_GAP_HEIGHT = 160;
        const BASE_SPAWN_RATE = 140;
        const MIN_SPAWN_RATE = 90;
        const PIPE_VERTICAL_PADDING = 60;

        // --- 게임 변??---
        let plane;
        let obstacles;
        let particles;
        let clouds;
        let score;
        let obstacleTimer;
        let gameOver;
        let explosionDone;
        let framesElapsed;
        let gameStarted;
        let highScore = 0;
        let currentGameSpeed;
        let currentGapHeight;
        let currentSpawnRate;
        let stars;
        let scoreSubmitted;
        let isSubmitting = false;

        // --- ?�래???�의 (Plane, Particle, ObstaclePair, Cloud, Star) ---
        class Plane {
            constructor(x, y) {
                this.x = x;
                this.y = y;
                this.yVel = 0;
                this.scale = 0.9;
                this.width = 60 * this.scale;
                this.height = 40 * this.scale;
                this.tilt = 0;
                this.bodyPoly = [[0, 10], [15, 0], [55, 5], [60, 20], [55, 35], [15, 40], [0, 30]];
                this.tailPoly = [[0, 10], [0, 30], [-15, 35], [-15, 5]];
            }
            applyThrust() {
                this.yVel = THRUST;
            }
            update() {
                if (!gameOver) {
                    this.yVel += GRAVITY;
                    if (this.yVel > 15) this.yVel = 15;
                    this.y += this.yVel;
                    this.tilt = Math.min(25, Math.max(-45, -this.yVel * 3));
                }
            }
            draw(ctx) {
                const centerX = this.x + (this.width / this.scale / 2) - 10;
                const centerY = this.y + (this.height / this.scale / 2);
                ctx.save();
                ctx.translate(centerX, centerY);
                ctx.rotate(-this.tilt * Math.PI / 180);
                ctx.scale(this.scale, this.scale);
                ctx.fillStyle = PLANE_GREY;
                ctx.beginPath();
                ctx.moveTo(this.tailPoly[0][0], this.tailPoly[0][1]);
                for (let i = 1; i < this.tailPoly.length; i++) {
                    ctx.lineTo(this.tailPoly[i][0], this.tailPoly[i][1]);
                }
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = PLANE_RED;
                ctx.beginPath();
                ctx.moveTo(this.bodyPoly[0][0], this.bodyPoly[0][1]);
                for (let i = 1; i < this.bodyPoly.length; i++) {
                    ctx.lineTo(this.bodyPoly[i][0], this.bodyPoly[i][1]);
                }
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = WHITE;
                ctx.beginPath();
                ctx.arc(30, 0, 8, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = BLACK;
                ctx.beginPath();
                ctx.arc(32, 0, 3, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
            getRect() {
                const paddingX = 5 * this.scale;
                const paddingY = 3 * this.scale;
                return {
                    x: this.x + paddingX,
                    y: this.y + paddingY,
                    width: this.width - 2 * paddingX,
                    height: this.height - 2 * paddingY
                };
            }
        }
        class Particle {
            constructor(x, y, isThrust) {
                this.x = x;
                this.y = y;
                if (isThrust) {
                    this.vx = -currentGameSpeed - (Math.random() * 2 + 1);
                    this.vy = Math.random() * 2 - 1;
                    this.color = [THRUST_YELLOW, THRUST_ORANGE, WHITE][Math.floor(Math.random() * 3)];
                    this.radius = Math.floor(Math.random() * 5) + 4;
                } else { // ??��
                    this.vx = Math.random() * 20 - 10;
                    this.vy = Math.random() * 20 - 10;
                    this.color = [THRUST_ORANGE, PLANE_RED, BLACK][Math.floor(Math.random() * 3)];
                    this.radius = Math.floor(Math.random() * 11) + 5;
                }
                this.life = 20;
            }
            update() {
                this.x += this.vx;
                this.y += this.vy;
                if (this.radius > 0) this.radius -= 0.5;
                this.life -= 1;
            }
            draw(ctx) {
                if (this.radius > 0) {
                    ctx.fillStyle = this.color;
                    ctx.beginPath();
                    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
        class ObstaclePair {
            constructor(x) {
                this.x = x;
                this.width = 90;
                this.gapHeight = currentGapHeight;
                const randomRange = HEIGHT - PIPE_VERTICAL_PADDING - this.gapHeight - PIPE_VERTICAL_PADDING;
                const gapY = Math.floor(Math.random() * (randomRange + 1)) + PIPE_VERTICAL_PADDING;
                this.topRect = { x: this.x, y: 0, width: this.width, height: gapY };
                this.bottomRect = { x: this.x, y: gapY + this.gapHeight, width: this.width, height: HEIGHT };
            }
            update() {
                this.x -= currentGameSpeed;
                this.topRect.x = this.x;
                this.bottomRect.x = this.x;
            }
            draw(ctx) {
                ctx.fillStyle = GREEN_PIPE;
                ctx.fillRect(this.topRect.x, this.topRect.y, this.topRect.width, this.topRect.height);
                ctx.fillRect(this.bottomRect.x, this.bottomRect.y, this.bottomRect.width, this.bottomRect.height);
                const topCap = { x: this.x - 5, y: this.topRect.height - 30, width: this.width + 10, height: 30 };
                const bottomCap = { x: this.x - 5, y: this.bottomRect.y, width: this.width + 10, height: 30 };
                ctx.fillStyle = GREEN_PIPE_DARK;
                ctx.fillRect(topCap.x, topCap.y, topCap.width, topCap.height);
                ctx.fillRect(bottomCap.x, bottomCap.y, bottomCap.width, bottomCap.height);
            }
        }
        class Cloud {
            constructor() {
                this.x = Math.floor(Math.random() * WIDTH) + WIDTH;
                this.y = Math.floor(Math.random() * (HEIGHT / 2 - 50)) + 50;
                this.speed = Math.random() * 1 + 0.5;
                this.radius = Math.floor(Math.random() * 31) + 20;
                this.parts = [];
                const numParts = Math.floor(Math.random() * 3) + 3;
                for (let i = 0; i < numParts; i++) {
                    const offsetX = Math.floor(Math.random() * (this.radius * 2 + 1)) - this.radius;
                    const offsetY = Math.floor(Math.random() * (this.radius + 1)) - (this.radius / 2);
                    const partRadius = Math.floor(Math.random() * (this.radius / 2 + 1)) + (this.radius / 2);
                    this.parts.push({ offset: { x: offsetX, y: offsetY }, radius: partRadius });
                }
            }
            update() {
                this.x -= this.speed;
                if (this.x < -this.radius * 2) {
                    this.x = Math.floor(Math.random() * 51) + WIDTH;
                    this.y = Math.floor(Math.random() * (HEIGHT / 2 - 50)) + 50;
                }
            }
            draw(ctx, cloudOpacity) {
                ctx.fillStyle = WHITE;
                ctx.globalAlpha = cloudOpacity * 0.8;
                for (const part of this.parts) {
                    ctx.beginPath();
                    ctx.arc(this.x + part.offset.x, this.y + part.offset.y, part.radius, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.globalAlpha = 1.0;
            }
        }
        class Star {
            constructor() {
                this.x = Math.random() * WIDTH;
                this.y = Math.random() * HEIGHT;
                this.radius = Math.random() * 1.5;
                this.speed = Math.random() * 0.2 + 0.1;
            }
            update() {
                this.x -= this.speed;
                if (this.x < 0) {
                    this.x = WIDTH;
                    this.y = Math.random() * HEIGHT;
                }
            }
            draw(ctx) {
                ctx.fillStyle = WHITE;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // --- ?�퍼 ?�수 ---
        function hexToRgb(hex) {
            let r = 0, g = 0, b = 0;
            if (hex.length == 7) {
                r = parseInt(hex.substring(1, 3), 16);
                g = parseInt(hex.substring(3, 5), 16);
                b = parseInt(hex.substring(5, 7), 16);
            }
            return [r, g, b];
        }
        function lerp(a, b, t) {
            return a + (b - a) * t;
        }
        function lerpColor(c1, c2, t) {
            const r = Math.round(lerp(c1[0], c2[0], t));
            const g = Math.round(lerp(c1[1], c2[1], t));
            const b = Math.round(lerp(c1[2], c2[2], t));
            return `rgb(${r}, ${g}, ${b})`;
        }
        function drawGradientSky(ctx, topColor, bottomColor) {
            const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
            gradient.addColorStop(0, topColor);
            gradient.addColorStop(1, bottomColor);
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, WIDTH, HEIGHT);
        }
        function drawTextWithShadow(ctx, text, font, color, x, y, textAlign = 'left', textBaseline = 'top') {
            ctx.font = font;
            ctx.fillStyle = color;
            ctx.shadowColor = BLACK;
            ctx.shadowOffsetX = 3;
            ctx.shadowOffsetY = 3;
            ctx.shadowBlur = 4;
            ctx.textAlign = textAlign;
            ctx.textBaseline = textBaseline;
            ctx.fillText(text, x, y);
            ctx.shadowColor = 'transparent';
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            ctx.shadowBlur = 0;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
        }
        function checkCollision(obj1, objOrRect2) {
            const rect1 = obj1.getRect();
            const rect2 = typeof objOrRect2.getRect === 'function' ? objOrRect2.getRect() : objOrRect2;
            return (
                rect1.x < rect2.x + rect2.width &&
                rect1.x + rect1.width > rect2.x &&
                rect1.y < rect2.y + rect2.height &&
                rect1.y + rect1.height > rect2.y
            );
        }
        
        // --- (?�정) 5. ?�버 ?�신 ?�수 (분리) ---
        
        /**
         * ?�수 '?�송'�??�당?�는 ?�수
         */
        async function submitScore(finalScore) {
            const leaderboard = getLeaderboardBridge();
            if (leaderboard?.submitScore) {
                await leaderboard.submitScore({
                    gameId: MINIGAME_ID,
                    nickname: gameUsername,
                    score: finalScore
                });
                return;
            }

            throw new Error('Firebase leaderboard bridge unavailable');

            try {
                const formData = new URLSearchParams();
                formData.append('gameId', GAME_ID);
                formData.append('name', gameUsername);
                formData.append('score', finalScore);

                const submitResponse = await fetch(SUBMIT_SCORE_URL, { 
                    method: 'POST', 
                    mode: 'cors', 
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: formData.toString() 
                });
                console.log('WT1 ?�수 ?�송 ?�도 ?�료. (?�답 ?�태: ' + submitResponse.status + ')');
            } catch (error) {
                console.error("WT1 ?�수 ?�송 �??�류:", error);
                // pElement??fetchAndDisplayGlobalScore?�서 관리하므�??�기??로그�??��?
            }
        }

        /**
         * '??? 최고' 기록??'조회'?�고 '?�시'?�는 ?�수
         */
        async function fetchAndDisplayGlobalScore(pElement, prefixText = "") {
            const leaderboard = getLeaderboardBridge();
            if (leaderboard?.getTopEntry) {
                pElement.textContent = prefixText + "... 전체 최고 기록 조회 중...";
                try {
                    const topEntry = await leaderboard.getTopEntry({ gameId: MINIGAME_ID });
                    if (topEntry) {
                        const maskedName = leaderboard.maskNickname
                            ? leaderboard.maskNickname(topEntry.nickname)
                            : (topEntry.maskedNickname || topEntry.nickname);
                        pElement.textContent = prefixText + `?�체 최고: ${topEntry.score} (${maskedName})`;
                    } else {
                        pElement.textContent = prefixText + '아직 등록된 기록이 없습니다.';
                    }
                } catch (error) {
                    console.error("WT1 최고 점수 불러오기 실패:", error);
                    pElement.textContent = prefixText + '최고 점수 연결 오류';
                }
                return;
            }
             // (?�정) 5. '??? 최고'�??�스??변�?
            pElement.textContent = prefixText + "... 서버 최고 기록 조회 중...";

            try {
                // (?�정) ??�� 조회??GET ?�청, gameId�?URL ?�라미터�??�송
                pElement.textContent = prefixText + 'Hall of fame unavailable.';
                return;
                const highscoreResponse = await fetch(`${GET_HIGHSCORE_URL}?gameId=${GAME_ID}`);
                if (!highscoreResponse.ok) throw new Error('Network response was not ok');
                
                const hsData = await highscoreResponse.json();
                
                if (hsData.result === 'success') {
                    const globalHighScore = hsData.highScore || 0;
                    const globalHighScoreName = hsData.name || "Unknown";
                    // ?�름 마스??
                    const maskedName = globalHighScoreName.substring(0, 2) + '*'.repeat(Math.max(0, globalHighScoreName.length - 2));
                    
                    // (?�정) 5. '??? 최고'�??�스??변�?
                    pElement.textContent = prefixText + `??? 최고: ${globalHighScore} (${maskedName})`;
                } else { 
                    // Apps Script가 {result: 'error'}�?반환??경우
                    pElement.textContent = prefixText + '최고 점수 불러오기 실패'; 
                    console.error('WT1 ?�버 ?�류:', hsData.message);
                }
            } catch (error) {
                // fetch ?�체 ?�는 JSON ?�싱 ?�패
                console.error("WT1 최고 점수 불러오기 실패:", error);
                pElement.textContent = prefixText + '최고 점수 연결 오류';
            }
        }
        
        // (??��) submitAndFetchScores, updateGlobalHighScore (???�수�??�체됨)

        // --- 메인 게임 로직 ---
        function startGame() {
            plane = new Plane(150, HEIGHT / 2);
            obstacles = [];
            particles = [];
            clouds = [];
            stars = [];
            for (let i = 0; i < 5; i++) {
                clouds.push(new Cloud());
            }
            for (let i = 0; i < 100; i++) {
                stars.push(new Star());
            }
            score = 0;
            obstacleTimer = 101;
            gameOver = false;
            explosionDone = false;
            framesElapsed = 0;
            scoreSubmitted = false;
            gameStarted = false;
            isSubmitting = false;
            
            highScore = parseInt(localStorage.getItem('wingTap1LocalHighScore')) || 0;
            
            currentGameSpeed = BASE_GAME_SPEED;
            currentGapHeight = BASE_GAP_HEIGHT;
            currentSpawnRate = BASE_SPAWN_RATE;

            startOverlay.style.display = 'flex';
            gameOverOverlay.style.display = 'none';
        }

        // --- (?�정) 5. 게임 오버 로직 (비동�? ---
        async function triggerGameOver() {
            if (gameOver) return;
            gameOver = true;
            
            if (!explosionDone) {
                const planeRect = plane.getRect();
                for (let i = 0; i < 30; i++) {
                    particles.push(new Particle(planeRect.x + planeRect.width / 2, planeRect.y + planeRect.height / 2, false));
                }
                explosionDone = true;
            }
            
            gameOverOverlay.style.display = 'flex';
            const finalScore = score;

            if (finalScore > highScore) {
                highScore = finalScore;
                localStorage.setItem('wingTap1LocalHighScore', highScore.toString());
            }
            
            const pElement = globalHighscoreDisplay;
            let prefixText = "";

            // ?�수 ?�송 (300???�상?�고, ?�직 ?�송 ?�했????
            if (finalScore >= 300 && !scoreSubmitted) {
                isSubmitting = true; // 버튼 비활?�화??
                scoreSubmitted = true;
                pElement.textContent = '300점+! 점수 전송 중...';
                
                await submitScore(finalScore); // ?�송???�날 ?�까지 ?��?
                
                prefixText = "?�송 ?�료! ";
            } else {
                isSubmitting = false;
                if (finalScore < 300) {
                    prefixText = "300점 미만은 전송되지 않습니다.\n"; // 300??미만?????�무 메시지?????��?
                }
            }

            // (?�정) 5. ?�수 ?�송 ?��??� 관계없??'??? 최고' 기록????�� 조회
            await fetchAndDisplayGlobalScore(pElement, prefixText);
            isSubmitting = false; // 모든 로직???�났?��?�?버튼 ?�성??
        }

        function gameLoop() {
            // (?�정) 루프가 중단?��? ?�도�?requestAnimationFrame??�??�에 배치
            requestAnimationFrame(gameLoop);
            
            // --- ?�데?�트 로직 ---
            if (gameStarted && !gameOver) {
                // 게임 ?�도/?�이??조절
                currentGameSpeed = Math.min(MAX_GAME_SPEED, BASE_GAME_SPEED + Math.floor(framesElapsed / 75) * 0.15);
                currentGapHeight = Math.max(MIN_GAP_HEIGHT, BASE_GAP_HEIGHT - Math.floor(framesElapsed / 250) * 5);
                currentSpawnRate = Math.max(MIN_SPAWN_RATE, BASE_SPAWN_RATE - Math.floor(framesElapsed / 280) * 5);
            
                plane.update();
                
                for (let i = obstacles.length - 1; i >= 0; i--) {
                    obstacles[i].update();
                    if (obstacles[i].x < -obstacles[i].width) {
                        obstacles.splice(i, 1);
                    }
                }
                
                clouds.forEach(cloud => cloud.update());
                stars.forEach(star => star.update());
                
                framesElapsed++;
                score = Math.floor(framesElapsed / 10);

                // ?�애�??�성
                obstacleTimer++;
                if (obstacleTimer > currentSpawnRate) {
                    obstacles.push(new ObstaclePair(WIDTH));
                    obstacleTimer = 0;
                }
                
                // 충돌 감�?
                if (plane.y < 0 || plane.y + plane.height > HEIGHT) {
                    triggerGameOver();
                }
                for (const obs of obstacles) {
                    if (checkCollision(plane, obs.topRect) || checkCollision(plane, obs.bottomRect)) {
                        triggerGameOver();
                        break;
                    }
                }
            } else if (!gameStarted) {
                // 게임 ?�작 ??
                clouds.forEach(cloud => cloud.update());
                stars.forEach(star => star.update());
            }

            // ?�티???�데?�트
            if (gameStarted) {
                for (let i = particles.length - 1; i >= 0; i--) {
                    particles[i].update();
                    if (particles[i].life <= 0 || particles[i].radius <= 0) {
                        particles.splice(i, 1);
                    }
                }
            }

            // --- 그리�?로직 ---
            // (배경 그리�?로직: 변�??�음)
            const cycleLengthInScore = 200;
            const totalCycleLengthInScore = cycleLengthInScore * 2;
            const currentCycleScore = (score || 0) % totalCycleLengthInScore;
            const isTransitioningToNight = currentCycleScore < cycleLengthInScore;
            const transitionProgress = (currentCycleScore % cycleLengthInScore) / cycleLengthInScore;
            let skyTopColor, skyBottomColor;
            let cloudOpacity;
            if (isTransitioningToNight) {
                cloudOpacity = 1.0 - transitionProgress;
            } else {
                cloudOpacity = transitionProgress;
            }
            cloudOpacity = Math.max(0, Math.min(1, cloudOpacity));
            if (isTransitioningToNight) {
                if (transitionProgress < 0.5) {
                    const halfProgress = transitionProgress * 2;
                    skyTopColor = lerpColor(DAY_TOP_RGB, SUNSET_TOP_RGB, halfProgress);
                    skyBottomColor = lerpColor(DAY_BOTTOM_RGB, SUNSET_BOTTOM_RGB, halfProgress);
                } else {
                    const halfProgress = (transitionProgress - 0.5) * 2;
                    skyTopColor = lerpColor(SUNSET_TOP_RGB, NIGHT_TOP_RGB, halfProgress);
                    skyBottomColor = lerpColor(SUNSET_BOTTOM_RGB, NIGHT_BOTTOM_RGB, halfProgress);
                }
            } else {
                if (transitionProgress < 0.5) {
                    const halfProgress = transitionProgress * 2;
                    skyTopColor = lerpColor(NIGHT_TOP_RGB, SUNRISE_TOP_RGB, halfProgress);
                    skyBottomColor = lerpColor(NIGHT_BOTTOM_RGB, SUNRISE_BOTTOM_RGB, halfProgress);
                } else {
                    const halfProgress = (transitionProgress - 0.5) * 2;
                    skyTopColor = lerpColor(SUNRISE_TOP_RGB, DAY_TOP_RGB, halfProgress);
                    skyBottomColor = lerpColor(SUNRISE_BOTTOM_RGB, DAY_BOTTOM_RGB, halfProgress);
                }
            }
            drawGradientSky(ctx, skyTopColor, skyBottomColor);
            const isDark = (isTransitioningToNight && transitionProgress > 0.2) ||
                         (!isTransitioningToNight && transitionProgress < 0.8);
            canvas.style.borderColor = isDark ? NIGHT_SKY_TOP : '#555';
            const isNight = (isTransitioningToNight && transitionProgress > 0.7) ||
                          (!isTransitioningToNight && transitionProgress < 0.3);
            if (isNight) {
                stars.forEach(star => star.draw(ctx));
            }
            clouds.forEach(cloud => cloud.draw(ctx, cloudOpacity));

            // (?�정) 캔버?�에 ?�스??그리�?
            if (!gameStarted) {
                // (?�정) 비행�?먼�? 그리�?(?�류 방�?)
                if (plane) plane.draw(ctx);
                // (?�정) 2. ?�?��? 변�?�?1. ?�트 ?�용
                drawTextWithShadow(ctx, "Wing Tap 1", FONT_RETRO_48, WHITE, WIDTH / 2, HEIGHT / 2 - 50, 'center', 'middle');
            
            } else if (!gameOver) {
                // ?�게??
                obstacles.forEach(obs => obs.draw(ctx));
                // (?�정) 3. '최고' -> '??기록' �?1. ?�트 ?�용
                drawTextWithShadow(ctx, `??기록: ${highScore}`, FONT_KOREAN_30, WHITE, WIDTH - 20, 30, 'right', 'top');
                // (?�정) 1. ?�트 ?�용
                drawTextWithShadow(ctx, score.toString(), FONT_INTER_70, WHITE, WIDTH / 2, 70, 'center', 'middle');
                particles.forEach(p => p.draw(ctx));
                if (plane) plane.draw(ctx);
            
            } else {
                // 게임 오버
                obstacles.forEach(obs => obs.draw(ctx));
                particles.forEach(p => p.draw(ctx));
                // (?�정) 1. ?�트 ?�용
                drawTextWithShadow(ctx, "Game Over", FONT_RETRO_48, GAME_OVER_RED, WIDTH / 2, HEIGHT / 2 - 50, 'center', 'middle');
            }

            // (??��) requestAnimationFrame(gameLoop); (�??�로 ?�동)
        }

        // --- 6. ?�벤??리스??---
        function handleGameAction() {
             if (isSubmitting) return; // ?�수 ?�송 �??�시??방�?

             if (!gameStarted) {
                gameStarted = true;
                startOverlay.style.display = 'none';
                plane.applyThrust();
                const planeBodyHeight = plane.height / 2;
                particles.push(new Particle(plane.x, plane.y + planeBodyHeight, true));
             }
             else if (!gameOver) {
                plane.applyThrust();
                const planeBodyHeight = plane.height / 2;
                particles.push(new Particle(plane.x, plane.y + planeBodyHeight, true));
            } else {
                // ?�시??
                startGame();
            }
        }

        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                handleGameAction();
            }
        });
        
        window.addEventListener('mousedown', (e) => {
            // (?�정) 로비 버튼 ?�릭 ?? 게임 ?�션(?�시?? 방�?
            if (e.target.closest('.back-btn')) {
                return;
            }
            e.preventDefault();
            handleGameAction();
        });
        
        window.addEventListener('touchstart', (e) => {
            // (?�정) 로비 버튼 ?�릭 ?? 게임 ?�션(?�시?? 방�?
            if (e.target.closest('.back-btn')) {
                return;
            }
            e.preventDefault();
            handleGameAction();
        }, { passive: false });

        lobbyBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            returnToMinigameHub();
        });
        
        // --- ?�면 ?�기 조정 ---
        function resizeCanvas() {
            const container = document.getElementById('game-container');
            const aspectRatio = WIDTH / HEIGHT; // 800 / 600
            let newWidth = window.innerWidth;
            let newHeight = window.innerHeight;
            const windowAspectRatio = newWidth / newHeight;
            let finalWidth, finalHeight;
            if (windowAspectRatio > aspectRatio) {
                finalHeight = newHeight;
                finalWidth = newHeight * aspectRatio;
            } else {
                finalWidth = newWidth;
                finalHeight = newWidth / aspectRatio;
            }
            container.style.width = `${finalWidth}px`;
            container.style.height = `${finalHeight}px`;
        }
        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();

        // --- (?�정) 7. ?�트 로드 ??게임 ?�작 ---
        console.log("Waiting for fonts to load...");
        // ?�트가 로드?�었?��? ?�인 (?�히 'Press Start 2P'?� 'Inter')
        document.fonts.ready.then(() => {
            console.log("Fonts loaded, starting game.");
            // ?�트 로드가 ?�료????게임 ?�작
            startGame();
            gameLoop();
        }).catch(err => {
            console.error("Font loading failed, starting game anyway:", err);
            // ?�트 로드 ?�패 ?�에??(?�스??기본 ?�트�? 게임 ?�작
            startGame();
            gameLoop();
        });
        
        // (??��) updateGlobalHighScore(); (게임 오버 ?�에�??�요)
    