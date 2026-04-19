
// --- (異붽?) 1. ?ъ슜???대쫫 諛??쒕쾭 URL ?ㅼ젙 ---
        const MINIGAME_ID = 'wing-tap-2';
        const IS_PREVIEW_MODE = new URLSearchParams(window.location.search).get('preview') === '1';
        const gameUsername = localStorage.getItem('j_game_username') || 'Guest';
        console.log(gameUsername + "?섏씠 寃뚯엫???쒖옉?⑸땲??");

        const GAME_ID = "game2"; // ?숉꺆 2?대?濡?"game2"

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

        // --- 珥덇린 ?ㅼ젙 ---
        const canvas = document.getElementById('gameCanvas');
        const ctx = canvas.getContext('2d');
        const WIDTH = canvas.width;
        const HEIGHT = canvas.height;

        // --- ?됱긽 ---
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

        const PIPE_BODY = '#556270'; 
        const PIPE_CAP = '#414A53'; 
        const PIPE_HIGHLIGHT = '#A9B7C6'; 

        const PLANE_RED = '#D91E18'; 
        const PLANE_BLUE = '#3498db'; 
        const PLANE_YELLOW = '#f1c40f'; 
        const PLANE_GREY = '#A9A9A9';
        const THRUST_YELLOW = '#FFDF00';
        const THRUST_ORANGE = '#FFA500';
        const GAME_OVER_RED = '#FF4500';
        const FUEL_GREEN = '#00FF00';
        const FUEL_RED = '#FF0000';
        const MISSILE_BODY = '#555555';
        const SHIELD_BLUE = '#00BFFF'; 
        const SHIELD_BLUE_DARK = '#0080FF'; 
        const MAGNET_RED = '#e74c3c'; 

        // --- ?고듃 ---
	const FONT_RETRO_70 = "70px 'Press Start 2P', cursive";
	const FONT_RETRO_48 = "48px 'Press Start 2P', cursive";
	const FONT_RETRO_24 = "24px 'Press Start 2P', cursive";
        const FONT_24 = 'bold 24px consolas';
        const FONT_30 = 'bold 30px consolas';
        const FONT_70 = 'bold 70px consolas';
        const FONT_18 = 'bold 18px consolas';
// --- (異붽?) 寃뚯엫?ㅻ쾭 ?붾㈃ 踰꾪듉 ?곸뿭 ---
    	const RESTART_BTN_RECT = { x: WIDTH/2 - 141, y: HEIGHT/2 + 150, w: 280, h: 50 };
    	const LOBBY_BTN_RECT = { x: WIDTH/2 - 141, y: HEIGHT/2 + 210, w: 280, h: 50 };
	

        // --- ?쒖씠??議곗젅 ?곸닔 ---
        const BASE_GAME_SPEED = 3.5;  
        const MAX_GAME_SPEED = 12;      
        const BASE_GAP_HEIGHT = 360;    
        const MIN_GAP_HEIGHT = 160;    
        const BASE_SPAWN_RATE = 140;   
        const MIN_SPAWN_RATE = 90;     
        const PIPE_VERTICAL_PADDING = 60; 
        
        const FUEL_SPAWN_RATE = 238; 
        const MISSILE_SPAWN_RATE = 200; 
        const POWERUP_SPAWN_RATE = 600; 
        const MISSILE_FUEL_DAMAGE = 30; 
        const FUEL_COLLISION_TOLERANCE = 10; 
        const POWERUP_COLLISION_TOLERANCE = 15; 
        const MAGNET_PULL_RADIUS = 150; 

        // --- 湲곗껜 ?곗씠?곕쿋?댁뒪 ---
        const PLANE_TYPES = [
            {
                key: 'basic',
                name: '?숉꺆 (湲곕낯)',
                color: PLANE_RED,
                gravity: 0.5,
                thrust: -8.0,
                maxFuel: 120, 
                eyeType: 'normal',
                bodyPoly: [[0, 10], [15, 0], [55, 5], [60, 20], [55, 35], [15, 40], [0, 30]],
                tailPoly: [[0, 10], [0, 30], [-15, 35], [-15, 5]],
            },
            {
                key: 'jet',
                name: '?쒗듃 (怨좎냽)',
                color: PLANE_BLUE,
                gravity: 0.7, 
                thrust: -10.0, 
                maxFuel: 100, 
                eyeType: 'angry',
                bodyPoly: [[0, 10], [15, 0], [60, 5], [65, 20], [60, 35], [15, 40], [0, 30]],
                tailPoly: [[0, 10], [0, 30], [-20, 40], [-20, 0]],
            },
            {
                key: 'glider',
                name: '湲?쇱씠??(?쒓났)',
                color: PLANE_YELLOW,
                gravity: 0.35, 
                thrust: -6.5, 
                maxFuel: 140, 
                eyeType: 'gentle',
                bodyPoly: [[0, 10], [10, 0], [50, 5], [55, 20], [50, 35], [10, 40], [0, 30]],
                tailPoly: [[0, 10], [0, 30], [-10, 30], [-10, 10]],
            }
        ];

        // --- 寃뚯엫 蹂??---
        let plane;
        let obstacles;
        let particles;
        let clouds;
        let stars; 
        let fuelItems; 
        let missiles;
        let powerUps; 
        let backgroundLayers; 
        
        let score;
        let obstacleTimer, fuelItemTimer, missileTimer, powerUpTimer; 
        let explosionDone;
        let framesElapsed; 
        
        let gameState = 'menu'; // 'menu', 'playing', 'dying', 'gameOver'
        let currentPlaneIndex = 0; 
        
        let mouseX = 0; 
        let mouseY = 0; 

        let highScore = 0;
        let currentGameSpeed;
        let currentGapHeight;
        let currentSpawnRate;
        let scoreSubmitted; 

	let isSubmitting = false; // (異붽?) ?먯닔 ?꾩넚以??뚮옒洹?
	let serverStatusMessage = ""; // (異붽?) ?쒕쾭 硫붿떆吏 ?쒖떆??

        // --- ?대옒???뺤쓽 ---

        class Plane {
            constructor(x, y, typeKey) {
                const type = PLANE_TYPES.find(p => p.key === typeKey);
                
                this.x = x;
                this.y = y;
                this.yVel = 0;
                this.scale = 0.9;
                this.width = 60 * this.scale;
                this.height = 40 * this.scale;
                this.tilt = 0;

                this.type = type;
                this.gravity = type.gravity;
                this.thrust = type.thrust;
                this.maxFuel = type.maxFuel;
                this.fuel = type.maxFuel;

                this.hasShield = false;
                this.magnetCharges = 0;
                this.hitTimer = 0; 
            }

            applyThrust() {
                if (this.fuel > 0) {
                    this.yVel = this.thrust;
                    this.fuel = Math.max(0, this.fuel - 1.8); 
                    return true;
                }
                return false;
            }

            addFuel(amount) {
                this.fuel = Math.min(this.maxFuel, this.fuel + amount);
            }

            takeDamage(fuelAmount) {
                this.fuel = Math.max(0, this.fuel - fuelAmount);
                this.hitTimer = 30; 
            }
            
            update() {
                if (gameState === 'playing') { 
                    this.yVel += this.gravity;
                    if (this.yVel > 15) this.yVel = 15; 
                    this.y += this.yVel;
                    this.tilt = Math.min(25, Math.max(-45, -this.yVel * 3));
                    
                    if (this.hitTimer > 0) { 
                        this.hitTimer--;
                    }

                } else if (gameState === 'menu') {
                    this.y = (HEIGHT / 2) + Math.sin(framesElapsed * 0.05) * 10;
                    this.tilt = 0;
                } else if (gameState === 'dying') { 
                    this.yVel += this.gravity;
                    if (this.yVel > 15) this.yVel = 15; 
                    this.y += this.yVel;
                    this.tilt = Math.max(-90, this.tilt - 5); 
                }
            }

            draw(ctx) {
                const centerX = this.x + (this.width / this.scale / 2) - 10;
                const centerY = this.y + (this.height / this.scale / 2);

                ctx.save();
                ctx.translate(centerX, centerY);
                ctx.rotate(-this.tilt * Math.PI / 180);
                ctx.scale(this.scale, this.scale);

                // 1. 瑗щ━?좉컻
                ctx.fillStyle = PLANE_GREY;
                ctx.beginPath();
                ctx.moveTo(this.type.tailPoly[0][0], this.type.tailPoly[0][1]);
                for (let i = 1; i < this.type.tailPoly.length; i++) {
                    ctx.lineTo(this.type.tailPoly[i][0], this.type.tailPoly[i][1]);
                }
                ctx.closePath();
                ctx.fill();

                // 2. 紐몄껜
                ctx.fillStyle = this.type.color;
                ctx.beginPath();
                ctx.moveTo(this.type.bodyPoly[0][0], this.type.bodyPoly[0][1]);
                for (let i = 1; i < this.type.bodyPoly.length; i++) {
                    ctx.lineTo(this.type.bodyPoly[i][0], this.type.bodyPoly[i][1]);
                }
                ctx.closePath();
                ctx.fill();

                // 3. 議곗쥌??(?곗옄)
                ctx.fillStyle = WHITE;
                ctx.beginPath();
                ctx.arc(30, 0, 8, 0, Math.PI * 2);
                ctx.fill();
                
                // 4. ?덈룞??
                if (gameState === 'dying' || gameState === 'gameOver' || this.hitTimer > 0) {
                    ctx.strokeStyle = BLACK;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(27, -3); ctx.lineTo(33, 3);
                    ctx.moveTo(33, -3); ctx.lineTo(27, 3);
                    ctx.stroke();
                }
                else if (this.type.eyeType === 'angry') {
                    ctx.fillStyle = this.type.color; 
                    ctx.beginPath();
                    ctx.arc(30, 0, 8, Math.PI, 0); 
                    ctx.fill();
                    ctx.fillStyle = BLACK;
                    ctx.beginPath();
                    ctx.arc(32, -1, 3, 0, Math.PI * 2); 
                    ctx.fill();
                } else if (this.type.eyeType === 'gentle') {
                    ctx.fillStyle = BLACK;
                    ctx.beginPath();
                    ctx.arc(32, 2, 5, 0, Math.PI * 2); 
                    ctx.fill();
                } else {
                    ctx.fillStyle = BLACK;
                    ctx.beginPath();
                    ctx.arc(32, 0, 3, 0, Math.PI * 2); 
                    ctx.fill();
                }
                
                // ?대뱶 (v15.2: ??媛源앷쾶)
                if (this.hasShield) {
                    const shieldCenterX = 55; 
                    const shieldAngle = Math.PI / 2.2; 
                    ctx.lineWidth = 3 / this.scale;
                    
                    ctx.strokeStyle = SHIELD_BLUE;
                    ctx.beginPath();
                    ctx.arc(shieldCenterX, 20, 30, -shieldAngle, shieldAngle); // r=30
                    ctx.stroke();

                    ctx.strokeStyle = WHITE;
                    ctx.beginPath();
                    ctx.arc(shieldCenterX, 20, 25, -shieldAngle, shieldAngle); // r=25
                    ctx.stroke();
                    
                    ctx.strokeStyle = SHIELD_BLUE;
                    ctx.beginPath();
                    ctx.arc(shieldCenterX, 20, 20, -shieldAngle, shieldAngle); // r=20
                    ctx.stroke();
                }

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
            constructor(x, y, type) {
                this.x = x;
                this.y = y;
                this.type = type;
                this.radius = 0;

                if (type === 'thrust') {
                    this.vx = -currentGameSpeed - (Math.random() * 2 + 1);
                    this.vy = Math.random() * 2 - 1;
                    this.color = [THRUST_YELLOW, THRUST_ORANGE, WHITE][Math.floor(Math.random() * 3)];
                    this.radius = Math.floor(Math.random() * 5) + 4;
                    this.life = 20; 
                } else if (type === 'explosion') { 
                    this.vx = Math.random() * 20 - 10;
                    this.vy = Math.random() * 20 - 10;
                    this.color = [THRUST_ORANGE, PLANE_RED, BLACK][Math.floor(Math.random() * 3)];
                    this.radius = Math.floor(Math.random() * 11) + 5;
                    this.life = 20; 
                } else if (type === 'missileTrail') { 
                    this.vx = 0.5; 
                    this.vy = Math.random() * 1 - 0.5;
                    this.color = [MISSILE_BODY, THRUST_ORANGE][Math.floor(Math.random() * 2)];
                    this.radius = Math.floor(Math.random() * 2) + 1;
                    this.life = 15;
                } else if (type === 'missileHit') { 
                    this.vx = Math.random() * 8 - 4;
                    this.vy = Math.random() * 8 - 4;
                    this.color = [GAME_OVER_RED, MISSILE_BODY, BLACK][Math.floor(Math.random() * 3)];
                    this.radius = Math.floor(Math.random() * 5) + 3;
                    this.life = 15;
                } else if (type === 'fuelGet') { 
                    this.vx = Math.random() * 6 - 3; 
                    this.vy = Math.random() * 6 - 3;
                    this.color = [FUEL_GREEN, WHITE, THRUST_YELLOW][Math.floor(Math.random() * 3)];
                    this.radius = Math.floor(Math.random() * 6) + 3;
                    this.life = 25;
                } else if (type === 'shieldBreak') { 
                    this.vx = Math.random() * 10 - 5;
                    this.vy = Math.random() * 10 - 5;
                    this.color = [SHIELD_BLUE, '#87CEFA', WHITE][Math.floor(Math.random() * 3)];
                    this.radius = Math.floor(Math.random() * 7) + 4;
                    this.life = 30;
                } else if (type === 'magnetPull') { 
                    this.vx = 0; this.vy = 0; 
                    this.color = [THRUST_YELLOW, WHITE][Math.floor(Math.random() * 2)];
                    this.radius = Math.random() * 2 + 1;
                    this.life = 10; 
                }
            }

            update() {
                this.x += this.vx;
                this.y += this.vy;
                
                if (['explosion', 'thrust', 'fuelGet', 'shieldBreak', 'missileHit'].includes(this.type)) {
                     if (this.radius > 0) this.radius -= 0.5;
                }
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
                this.gapY = Math.floor(Math.random() * (randomRange + 1)) + PIPE_VERTICAL_PADDING;
                
                this.topRect = { x: this.x, y: 0, width: this.width, height: this.gapY };
                this.bottomRect = { x: this.x, y: this.gapY + this.gapHeight, width: this.width, height: HEIGHT - (this.gapY + this.gapHeight) };

                this.isMoving = Math.random() < 0.3; 
                this.yVel = (Math.random() > 0.5 ? 1 : -1) * (1 + Math.random() * 0.5); 
            }

            update() {
                this.x -= currentGameSpeed;

                if (this.isMoving) {
                    this.gapY += this.yVel;
                    if (this.gapY < PIPE_VERTICAL_PADDING || this.gapY + this.gapHeight > HEIGHT - PIPE_VERTICAL_PADDING) {
                        this.yVel *= -1;
                    }
                    
                    this.topRect.height = this.gapY;
                    this.bottomRect.y = this.gapY + this.gapHeight;
                    this.bottomRect.height = HEIGHT - this.bottomRect.y;
                }

                this.topRect.x = this.x;
                this.bottomRect.x = this.x;
            }

            draw(ctx) {
                const bodyGradient = ctx.createLinearGradient(this.topRect.x, 0, this.topRect.x + this.topRect.width, 0);
                bodyGradient.addColorStop(0, PIPE_HIGHLIGHT);
                bodyGradient.addColorStop(0.2, PIPE_BODY);
                bodyGradient.addColorStop(1, PIPE_CAP);
                
                ctx.fillStyle = bodyGradient;
                ctx.fillRect(this.topRect.x, this.topRect.y, this.topRect.width, this.topRect.height);
                ctx.fillRect(this.bottomRect.x, this.bottomRect.y, this.bottomRect.width, this.bottomRect.height);

                const topCap = { x: this.x - 5, y: this.topRect.height - 30, width: this.width + 10, height: 30 };
                const bottomCap = { x: this.x - 5, y: this.bottomRect.y, width: this.width + 10, height: 30 };

                const capGradient = ctx.createLinearGradient(topCap.x, 0, topCap.x + topCap.width, 0);
                capGradient.addColorStop(0, PIPE_HIGHLIGHT);
                capGradient.addColorStop(0.5, PIPE_CAP);
                capGradient.addColorStop(1, PIPE_CAP);
                
                ctx.fillStyle = capGradient;
                ctx.fillRect(topCap.x, topCap.y, topCap.width, topCap.height);
                ctx.fillRect(bottomCap.x, bottomCap.y, bottomCap.width, bottomCap.height);
            }
        }

        class FuelItem {
            constructor() {
                this.x = WIDTH;
                this.y = Math.random() * (HEIGHT - 300) + 150; 
                this.width = 30;
                this.height = 30;
                this.angle = 0;
                this.value = 50; 
            }

            update() {
                if (plane && plane.magnetCharges > 0) {
                    const dx = (plane.x + plane.width / 2) - (this.x + this.width / 2);
                    const dy = (plane.y + plane.height / 2) - (this.y + this.height / 2);
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    
                    if (dist < MAGNET_PULL_RADIUS) {
                        const pullSpeed = 8;
                        this.x += (dx / dist) * pullSpeed;
                        this.y += (dy / dist) * pullSpeed;
                        if (framesElapsed % 4 === 0) {
                            particles.push(new Particle(this.x + this.width / 2, this.y + this.height / 2, 'magnetPull'));
                        }
                    } else {
                        this.x -= currentGameSpeed; 
                    }
                } else {
                    this.x -= currentGameSpeed; 
                }
                this.angle += 0.05;
            }

            draw(ctx) {
                ctx.save();
                ctx.translate(this.x + this.width / 2, this.y + this.height / 2);
                ctx.rotate(this.angle);

                const w = this.width;
                const h = this.height;
                const halfW = w / 2;
                const halfH = h / 2;
                const capHeight = 5;

                ctx.fillStyle = THRUST_YELLOW;
                ctx.fillRect(-halfW, -halfH + capHeight, w, h - capHeight*2);
                ctx.fillStyle = '#E6C300'; 
                ctx.beginPath();
                ctx.ellipse(0, -halfH + capHeight, halfW, capHeight, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#D4AF00'; 
                ctx.beginPath();
                ctx.ellipse(0, halfH - capHeight, halfW, capHeight, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = BLACK;
                ctx.font = 'bold 24px consolas';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('F', 0, 2); 

                ctx.restore();
            }

            getRect() {
                return { x: this.x, y: this.y, width: this.width, height: this.height };
            }

            getForgivingRect() {
                return { 
                    x: this.x - FUEL_COLLISION_TOLERANCE, 
                    y: this.y - FUEL_COLLISION_TOLERANCE, 
                    width: this.width + 2 * FUEL_COLLISION_TOLERANCE, 
                    height: this.height + 2 * FUEL_COLLISION_TOLERANCE 
                };
            }
        }

        class PowerUp {
            constructor(type) {
                this.x = WIDTH;
                this.y = Math.random() * (HEIGHT - 300) + 150; 
                this.width = 30;
                this.height = 30;
                this.type = type; // 'shield' or 'magnet'
                this.angle = 0;
            }

            update() {
                if (plane && plane.magnetCharges > 0) {
                    const dx = (plane.x + plane.width / 2) - (this.x + this.width / 2);
                    const dy = (plane.y + plane.height / 2) - (this.y + this.height / 2);
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    
                    if (dist < MAGNET_PULL_RADIUS) {
                        const pullSpeed = 8;
                        this.x += (dx / dist) * pullSpeed;
                        this.y += (dy / dist) * pullSpeed;
                        if (framesElapsed % 4 === 0) {
                            particles.push(new Particle(this.x + this.width / 2, this.y + this.height / 2, 'magnetPull'));
                        }
                    } else {
                        this.x -= currentGameSpeed; 
                    }
                } else {
                    this.x -= currentGameSpeed; 
                }
                this.angle += 0.05;
            }

            draw(ctx) {
                ctx.save();
                ctx.translate(this.x + this.width / 2, this.y + this.height / 2);
                ctx.rotate(this.angle);

                const w = this.width;
                const h = this.height;
                const halfW = w / 2;
                const halfH = h / 2;
                
                if (this.type === 'shield') {
                    const shieldW = halfW * 0.9;
                    const shieldH = halfH * 0.9;
                    
                    ctx.fillStyle = SHIELD_BLUE;
                    ctx.beginPath();
                    ctx.moveTo(0, -shieldH);
                    ctx.lineTo(shieldW, -shieldH * 0.8);
                    ctx.lineTo(shieldW, shieldH * 0.5);
                    ctx.lineTo(0, shieldH);
                    ctx.closePath();
                    ctx.fill();
                    
                    ctx.fillStyle = SHIELD_BLUE_DARK;
                    ctx.beginPath();
                    ctx.moveTo(0, -shieldH);
                    ctx.lineTo(-shieldW, -shieldH * 0.8);
                    ctx.lineTo(-shieldW, shieldH * 0.5);
                    ctx.lineTo(0, shieldH);
                    ctx.closePath();
                    ctx.fill();

                    ctx.strokeStyle = WHITE;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(0, -shieldH);
                    ctx.lineTo(shieldW, -shieldH * 0.8);
                    ctx.lineTo(shieldW, shieldH * 0.5);
                    ctx.lineTo(0, shieldH);
                    ctx.lineTo(-shieldW, shieldH * 0.5);
                    ctx.lineTo(-shieldW, -shieldH * 0.8);
                    ctx.closePath();
                    ctx.stroke();

                } else if (this.type === 'magnet') {
                    ctx.strokeStyle = MAGNET_RED;
                    ctx.lineWidth = 8;
                    ctx.beginPath();
                    ctx.moveTo(-halfW + 4, -halfH); 
                    ctx.lineTo(-halfW + 4, halfH - 10); 
                    ctx.quadraticCurveTo(0, halfH + 5, halfW - 4, halfH - 10); 
                    ctx.lineTo(halfW - 4, -halfH); 
                    ctx.stroke();

                    ctx.fillStyle = WHITE;
                    ctx.fillRect(-halfW - 1, -halfH - 2, 10, 4);
                    ctx.fillRect(halfW - 9, -halfH - 2, 10, 4);
                }
                ctx.restore();
            }

            getRect() {
                return { x: this.x, y: this.y, width: this.width, height: this.height };
            }

            getForgivingRect() {
                return { 
                    x: this.x - POWERUP_COLLISION_TOLERANCE, 
                    y: this.y - POWERUP_COLLISION_TOLERANCE, 
                    width: this.width + 2 * POWERUP_COLLISION_TOLERANCE, 
                    height: this.height + 2 * POWERUP_COLLISION_TOLERANCE 
                };
            }
        }

        class EnemyMissile {
            constructor() {
                this.x = WIDTH;
                this.y = Math.random() * HEIGHT;
                this.width = 25;
                this.height = 10;
                this.yVel = 0;
            }

            update() {
                this.x -= (currentGameSpeed + 3); 

                if (plane) {
                    let targetY = plane.y + plane.height / 2;
                    let homingStrength = Math.abs(targetY - this.y) > 100 ? 0.05 : 0.03;
                    this.yVel = (targetY - (this.y + this.height/2)) * homingStrength;
                    this.y += this.yVel;
                }

                if (framesElapsed % 3 === 0) {
                    particles.push(new Particle(this.x + this.width, this.y + this.height / 2, 'missileTrail'));
                }
            }

            draw(ctx) {
                ctx.fillStyle = MISSILE_BODY;
                ctx.fillRect(this.x, this.y, this.width, this.height);
                ctx.fillStyle = GAME_OVER_RED;
                ctx.beginPath();
                ctx.moveTo(this.x + this.width, this.y); 
                ctx.lineTo(this.x + this.width + 8, this.y + this.height / 2); 
                ctx.lineTo(this.x + this.width, this.y + this.height); 
                ctx.closePath();
                ctx.fill();
            }

            getRect() {
                return { x: this.x, y: this.y, width: this.width + 8, height: this.height }; 
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

        class ParallaxLayer {
            constructor(speedMultiplier, baseColorRGB, y, height, steepness) {
                this.speedMultiplier = speedMultiplier;
                this.baseColorRGB = baseColorRGB; // 'R,G,B'
                this.y = y;
                this.height = height;
                this.steepness = steepness;
                this.offset = Math.random() * 1000; 
            }

            update() {
                if (gameState === 'playing' || gameState === 'dying') { 
                    this.offset += currentGameSpeed * this.speedMultiplier;
                }
            }

            draw(ctx, isDark) {
                const alpha = isDark ? 0.5 : 0.3; 
                ctx.fillStyle = `rgba(${this.baseColorRGB}, ${alpha})`;
                
                ctx.beginPath();
                ctx.moveTo(0, HEIGHT);
                ctx.lineTo(0, this.y);
                
                for (let x = 0; x <= WIDTH; x++) {
                    let waveY = this.height / 2 * Math.sin((x + this.offset) * this.steepness * 0.01);
                    ctx.lineTo(x, this.y + waveY);
                }
                
                ctx.lineTo(WIDTH, HEIGHT);
                ctx.closePath();
                ctx.fill();
            }
        }


        // --- ?ы띁 ?⑥닔 ---

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

	function drawMultilineTextWithShadow(ctx, text, font, color, x, y, textAlign = 'left', textBaseline = 'top', lineHeight = 30) {
        const lines = text.split('\n');

        // 湲곗??먯뿉 ?곕씪 y ?쒖옉 ?꾩튂 議곗젙
        let startY = y;
        if (textBaseline === 'middle') {
            startY -= (lines.length - 1) * lineHeight / 2;
        } else if (textBaseline === 'bottom') {
            startY -= (lines.length - 1) * lineHeight;
        }

        lines.forEach((line, index) => {
            drawTextWithShadow(ctx, line, font, color, x, startY + (index * lineHeight), textAlign, textBaseline);
        });
    }

        function drawFuelBar(ctx, x, y, width, height, fuel, maxFuel) {
            const percent = fuel / maxFuel;
            const barWidth = width * percent;
            const color = percent > 0.3 ? FUEL_GREEN : FUEL_RED;

            ctx.fillStyle = '#333';
            ctx.fillRect(x, y, width, height);
            ctx.strokeStyle = WHITE;
            ctx.strokeRect(x, y, width, height);
            ctx.fillStyle = color;
            ctx.fillRect(x, y, barWidth, height);
            ctx.fillStyle = WHITE;
            ctx.font = 'bold 18px consolas';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`?곕즺: ${Math.max(0, Math.ceil(fuel))}`, x + width / 2, y + height / 2 + 2);
        }

        function drawShieldIcon(x, y) {
            ctx.save();
            ctx.translate(x, y);
            ctx.scale(0.7, 0.7); 
            
            const halfW = 10;
            const halfH = 10;
            const shieldW = halfW * 0.9;
            const shieldH = halfH * 0.9;
            
            ctx.fillStyle = SHIELD_BLUE;
            ctx.beginPath();
            ctx.moveTo(0, -shieldH); ctx.lineTo(shieldW, -shieldH * 0.8);
            ctx.lineTo(shieldW, shieldH * 0.5); ctx.lineTo(0, shieldH);
            ctx.closePath(); ctx.fill();
            
            ctx.fillStyle = SHIELD_BLUE_DARK;
            ctx.beginPath();
            ctx.moveTo(0, -shieldH); ctx.lineTo(-shieldW, -shieldH * 0.8);
            ctx.lineTo(-shieldW, shieldH * 0.5); ctx.lineTo(0, shieldH);
            ctx.closePath(); ctx.fill();

            ctx.strokeStyle = WHITE;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, -shieldH); ctx.lineTo(shieldW, -shieldH * 0.8);
            ctx.lineTo(shieldW, shieldH * 0.5); ctx.lineTo(0, shieldH);
            ctx.lineTo(-shieldW, shieldH * 0.5); ctx.lineTo(-shieldW, -shieldH * 0.8);
            ctx.closePath(); ctx.stroke();

            ctx.restore();
        }

        function drawMagnetIcon(x, y) {
            ctx.save();
            ctx.translate(x, y);
            ctx.scale(0.7, 0.7); 

            const halfW = 10;
            const halfH = 10;
            
            ctx.strokeStyle = MAGNET_RED;
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.moveTo(-halfW + 4, -halfH); 
            ctx.lineTo(-halfW + 4, halfH - 6); 
            ctx.quadraticCurveTo(0, halfH + 3, halfW - 4, halfH - 6); 
            ctx.lineTo(halfW - 4, -halfH); 
            ctx.stroke();

            ctx.fillStyle = WHITE;
            ctx.fillRect(-halfW - 1, -halfH - 2, 6, 3);
            ctx.fillRect(halfW - 5, -halfH - 2, 6, 3);

            ctx.restore();
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

// --- (異붽?) 5. ?쒕쾭 ?듭떊 ?⑥닔 (?숉꺆1?먯꽌 蹂듭궗) ---
      /**
     * ?먯닔 '?꾩넚'留??대떦?섎뒗 ?⑥닔
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
            console.log('WT2 점수 전송 시도 완료. (응답 상태: ' + submitResponse.status + ')');
        } catch (error) {
            console.error("WT2 점수 전송 중 오류:", error);
        }
    }

    /**
     * '??? 理쒓퀬' 湲곕줉??'議고쉶'?섍퀬 '?쒖떆' (蹂???낅뜲?댄듃)
     */
    async function fetchAndDisplayGlobalScore(prefixText = "") {
        const leaderboard = getLeaderboardBridge();
        if (leaderboard?.getTopEntry) {
            serverStatusMessage = `${prefixText}... 전체 최고 기록 조회 중...`;
            try {
                const topEntry = await leaderboard.getTopEntry({ gameId: MINIGAME_ID });
                if (topEntry) {
                    const maskedName = leaderboard.maskNickname
                        ? leaderboard.maskNickname(topEntry.nickname)
                        : (topEntry.maskedNickname || topEntry.nickname);
                    serverStatusMessage = `${prefixText}서버 최고: ${topEntry.score} (${maskedName})`;
                } else {
                    serverStatusMessage = `${prefixText}아직 등록된 기록이 없습니다.`;
                }
            } catch (error) {
                console.error('Leaderboard high-score lookup failed:', error);
                serverStatusMessage = `${prefixText}최고 점수를 불러오지 못했습니다.`;
            }
            return;
        }
         // (?섏젙) pElement ???serverStatusMessage 蹂???ъ슜
        serverStatusMessage = prefixText + "... 서버 최고 기록 조회 중...";

        try {
            serverStatusMessage = prefixText + '명예의 전당을 사용할 수 없습니다.';
            return;
            const highscoreResponse = await fetch(`${GET_HIGHSCORE_URL}?gameId=${GAME_ID}`);
            if (!highscoreResponse.ok) throw new Error('Network response was not ok');

            const hsData = await highscoreResponse.json();

            if (hsData.result === 'success') {
                const globalHighScore = hsData.highScore || 0;
                const globalHighScoreName = hsData.name || "Unknown";
                const maskedName = globalHighScoreName.substring(0, 2) + '*'.repeat(Math.max(0, globalHighScoreName.length - 2));

                serverStatusMessage = `${prefixText}서버 최고: ${globalHighScore} (${maskedName})`;
            } else { 
                serverStatusMessage = prefixText + '최고 점수를 불러오지 못했습니다.'; 
                console.error('WT2 서버 오류:', hsData.message);
            }
        } catch (error) {
            console.error("WT2 최고 점수 불러오기 실패:", error);
            serverStatusMessage = prefixText + '최고 점수 연결 오류';
        }
    }




        function changePlane(direction) {
            if (gameState !== 'menu') return;
            currentPlaneIndex = (currentPlaneIndex + direction + PLANE_TYPES.length) % PLANE_TYPES.length;
            plane = new Plane(150, HEIGHT / 2, PLANE_TYPES[currentPlaneIndex].key);
        }

        // --- 硫붿씤 寃뚯엫 濡쒖쭅 ---

        function startGame() {
            gameState = 'menu'; 
            plane = new Plane(150, HEIGHT / 2, PLANE_TYPES[currentPlaneIndex].key);
            
            obstacles = [];
            particles = [];
            clouds = [];
            stars = []; 
            fuelItems = []; 
            missiles = [];
            powerUps = []; 
            backgroundLayers = []; 

            backgroundLayers.push(new ParallaxLayer(0.1, '0, 80, 30', HEIGHT - 150, 100, 0.2)); 
            backgroundLayers.push(new ParallaxLayer(0.2, '10, 100, 40', HEIGHT - 100, 100, 0.5)); 

            for (let i = 0; i < 5; i++) {
                clouds.push(new Cloud());
            }
            for (let i = 0; i < 100; i++) {
                stars.push(new Star());
            }
            
            score = 0; 
            obstacleTimer = 101;
            fuelItemTimer = 0; 
            missileTimer = 0;  
            powerUpTimer = 0; 
            
            explosionDone = false;
            framesElapsed = 0; 
            scoreSubmitted = false;
            
            highScore = parseInt(localStorage.getItem('wingTapHighScore')) || 0;
            
            currentGameSpeed = BASE_GAME_SPEED;
            currentGapHeight = BASE_GAP_HEIGHT; 
            currentSpawnRate = BASE_SPAWN_RATE;

        }

        function gameLoop() {
            
            // --- ?낅뜲?댄듃 濡쒖쭅 ---
            framesElapsed++; 

            if (gameState === 'playing') {
                currentGameSpeed = Math.min(MAX_GAME_SPEED, BASE_GAME_SPEED + Math.floor(framesElapsed / 75) * 0.15); 
                currentGapHeight = Math.max(MIN_GAP_HEIGHT, BASE_GAP_HEIGHT - Math.floor(framesElapsed / 250) * 5); 
                currentSpawnRate = Math.max(MIN_SPAWN_RATE, BASE_SPAWN_RATE - Math.floor(framesElapsed / 280) * 5); 
            
                plane.update();
                
                for (let i = obstacles.length - 1; i >= 0; i--) {
                    obstacles[i].update();
                    if (obstacles[i].x < -obstacles[i].width) obstacles.splice(i, 1);
                }
                
                for (let i = fuelItems.length - 1; i >= 0; i--) {
                    fuelItems[i].update();
                    if (fuelItems[i].x < -fuelItems[i].width) fuelItems.splice(i, 1);
                }

                for (let i = missiles.length - 1; i >= 0; i--) {
                    missiles[i].update();
                    if (missiles[i].x < -missiles[i].width) missiles.splice(i, 1);
                }

                for (let i = powerUps.length - 1; i >= 0; i--) {
                    powerUps[i].update();
                    if (powerUps[i].x < -powerUps[i].width) powerUps.splice(i, 1);
                }
                
                clouds.forEach(cloud => cloud.update());
                stars.forEach(star => star.update()); 
                backgroundLayers.forEach(layer => layer.update()); 
                
                score = Math.floor(framesElapsed / 10); 

                // --- ?ㅽ룷??---
                obstacleTimer++;
                if (obstacleTimer > currentSpawnRate) {
                    obstacles.push(new ObstaclePair(WIDTH));
                    obstacleTimer = 0;
                }
                
                fuelItemTimer++; 
                if (fuelItemTimer > FUEL_SPAWN_RATE) { 
                    fuelItems.push(new FuelItem());
                    fuelItemTimer = 0;
                }

                missileTimer++; 
                if (missileTimer > MISSILE_SPAWN_RATE) {
                    missiles.push(new EnemyMissile());
                    missileTimer = 0;
                }

                powerUpTimer++; 
                if (powerUpTimer > POWERUP_SPAWN_RATE) {
                    const type = Math.random() > 0.5 ? 'shield' : 'magnet';
                    powerUps.push(new PowerUp(type));
                    powerUpTimer = 0;
                }
                
                // --- 異⑸룎 媛먯? (v15.3: 踰꾧렇 ?섏젙) ---
                let isDead = false;
                if (plane.y < 0 || plane.y + plane.height > HEIGHT) isDead = true;
                
                for (const obs of obstacles) {
                    if (checkCollision(plane, obs.topRect) || checkCollision(plane, obs.bottomRect)) {
                        isDead = true;
                        break;
                    }
                }

                if (isDead) {
                    gameState = 'dying'; 
                } else {
                    // [BUG FIX] ?댁븘?덉쓣 ?뚮쭔 ?꾩씠??異⑸룎??寃??
                    const planeRect = plane.getRect();
                    
                    // ?곕즺 ?꾩씠??異⑸룎
                    for (let i = fuelItems.length - 1; i >= 0; i--) {
                        const forgivingFuelRect = fuelItems[i].getForgivingRect();
                        
                        if (checkCollision(plane, forgivingFuelRect)) {
                            plane.addFuel(fuelItems[i].value);
                            for (let p = 0; p < 15; p++) {
                                particles.push(new Particle(planeRect.x + planeRect.width / 2, planeRect.y + planeRect.height / 2, 'fuelGet'));
                            }
                            if (plane.magnetCharges > 0) plane.magnetCharges--;
                            
                            fuelItems.splice(i, 1);
                        }
                    }

                    // 誘몄궗??異⑸룎
                    for (let i = missiles.length - 1; i >= 0; i--) {
                        if (checkCollision(plane, missiles[i])) {
                            if (plane.hasShield) {
                                plane.hasShield = false; 
                                for(let p=0; p < 20; p++) {
                                    particles.push(new Particle(missiles[i].x, missiles[i].y + missiles[i].height/2, 'shieldBreak'));
                                }
                            } else {
                                plane.takeDamage(MISSILE_FUEL_DAMAGE); 
                                for(let p=0; p < 10; p++) {
                                    particles.push(new Particle(missiles[i].x, missiles[i].y + missiles[i].height/2, 'missileHit'));
                                }
                            }
                            missiles.splice(i, 1); 
                        }
                    }

                    // ?뚯썙???꾩씠??異⑸룎
                    for (let i = powerUps.length - 1; i >= 0; i--) {
                        if (checkCollision(plane, powerUps[i].getForgivingRect())) { 
                            if (plane.magnetCharges > 0) {
                                plane.magnetCharges--;
                            }

                            if (powerUps[i].type === 'shield') {
                                plane.hasShield = true; 
                            } else if (powerUps[i].type === 'magnet') {
                                plane.magnetCharges += 3; 
                            }
                            
                            powerUps.splice(i, 1);
                        }
                    }
                }

            } else if (gameState === 'menu') {
                plane.update(); 
                clouds.forEach(cloud => cloud.update());
                stars.forEach(star => star.update());
            } else if (gameState === 'dying') { 
                plane.update(); 
                backgroundLayers.forEach(layer => layer.update()); 

                if (!explosionDone) {
                    // 1. ??컻 ?④낵 (湲곗〈怨??숈씪)
                const planeRect = plane.getRect();
                for (let i = 0; i < 30; i++) {
                    particles.push(new Particle(planeRect.x + planeRect.width / 2, planeRect.y + planeRect.height / 2, 'explosion'));
                }
                explosionDone = true;

                // 2. (異붽?) ?쒕쾭 濡쒖쭅??泥섎━??鍮꾨룞湲??⑥닔
                async function handleGameOverLogic() {
                    const finalScore = score;

                    // 3. 濡쒖뺄 理쒓퀬 ?먯닔 ???(湲곗〈怨??숈씪)
                    if (finalScore > highScore) {
                        highScore = finalScore;
                        localStorage.setItem('wingTapHighScore', highScore.toString());
                    }

                    let prefixText = "";

                    // 4. ?먯닔 ?꾩넚 (300???댁긽????
                    if (finalScore >= 300 && !scoreSubmitted) {
                        isSubmitting = true; // (以묒슂) ?좉툑 ?쒖옉
                        scoreSubmitted = true;
                        serverStatusMessage = '300점 이상! 점수 전송 중...';

                        try {
                            await submitScore(finalScore);
                            prefixText = "전송 완료! ";
                        } catch (error) {
                            console.error("점수 전송 중 오류:", error);
                            prefixText = "전송 실패. ";
                        }
                    } else {
                        if (finalScore < 300) {
                            prefixText = "300점 미만은 전송되지 않습니다.\n\n";
                        }
                    }

                    // 5. '??? 理쒓퀬' 湲곕줉 議고쉶 (??긽 ?ㅽ뻾)
                    await fetchAndDisplayGlobalScore(prefixText);
                    isSubmitting = false; // (以묒슂) ?좉툑 ?댁젣
                }

                // 6. (異붽?) 鍮꾨룞湲??⑥닔 ?ㅽ뻾
                handleGameOverLogic();
                }
            }

            if (gameState !== 'menu') {
                for (let i = particles.length - 1; i >= 0; i--) {
                    particles[i].update(); // <--- v15.2 ?ㅽ? ?섏젙??
                    if (particles[i].life <= 0 || particles[i].radius <= 0) {
                        particles.splice(i, 1);
                    }
                }
            }

            if (gameState === 'dying' && explosionDone) {
                 if (particles.length === 0 || plane.y > HEIGHT + 50) { 
                    gameState = 'gameOver';
                 }
            }


            // --- 洹몃━湲?---
            
            const cycleLengthInScore = 200; 
            const totalCycleLengthInScore = cycleLengthInScore * 2; 
            const cycleProgress = (Math.floor(framesElapsed / 10) % totalCycleLengthInScore);
            
            const isTransitioningToNight = cycleProgress < cycleLengthInScore; 
            const transitionProgress = (cycleProgress % cycleLengthInScore) / cycleLengthInScore; 

            let skyTopColor, skyBottomColor;
            let cloudOpacity;
            
            if (isTransitioningToNight) cloudOpacity = 1.0 - transitionProgress; 
            else cloudOpacity = transitionProgress; 
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

            backgroundLayers.forEach(layer => layer.draw(ctx, isDark)); 

            const isNight = (isTransitioningToNight && transitionProgress > 0.7) || 
                          (!isTransitioningToNight && transitionProgress < 0.3); 
            if (isNight) stars.forEach(star => star.draw(ctx));
            
            clouds.forEach(cloud => cloud.draw(ctx, cloudOpacity)); 

            // --- ?곹깭蹂?洹몃━湲?---
            if (gameState === 'menu') {
                plane.draw(ctx); 
                drawTextWithShadow(ctx, "Wing Tap 2", FONT_RETRO_48, WHITE, WIDTH / 2, HEIGHT / 2 - 120, 'center', 'middle');

                const leftArrowX = WIDTH/2 - 180;
                const rightArrowX = WIDTH/2 + 180;
                const arrowY = HEIGHT/2 + 80;
                const startY = HEIGHT/2 + 130;
                
                const leftArrowHitbox = { x: leftArrowX - 40, y: arrowY - 30, w: 80, h: 60 };
                const rightArrowHitbox = { x: rightArrowX - 40, y: arrowY - 30, w: 80, h: 60 };
                const startHitbox = { x: WIDTH/2 - 150, y: startY - 20, w: 300, h: 40 };

                const leftHover = (mouseX > leftArrowHitbox.x && mouseX < leftArrowHitbox.x + leftArrowHitbox.w && 
                                 mouseY > leftArrowHitbox.y && mouseY < leftArrowHitbox.y + leftArrowHitbox.h);
                const rightHover = (mouseX > rightArrowHitbox.x && mouseX < rightArrowHitbox.x + rightArrowHitbox.w &&
                                  mouseY > rightArrowHitbox.y && mouseY < rightArrowHitbox.y + rightArrowHitbox.h);
                const startHover = (mouseX > startHitbox.x && mouseX < startHitbox.x + startHitbox.w &&
                                  mouseY > startHitbox.y && mouseY < startHitbox.y + startHitbox.h);
                
                const leftFont = leftHover ? FONT_30 : FONT_24;
                const rightFont = rightHover ? FONT_30 : FONT_24;
                const startFont = startHover ? FONT_30 : FONT_24;

                drawTextWithShadow(ctx, "<", leftFont, THRUST_YELLOW, leftArrowX, arrowY, 'center', 'middle');
                drawTextWithShadow(ctx, ">", rightFont, THRUST_YELLOW, rightArrowX, arrowY, 'center', 'middle');
                drawTextWithShadow(ctx, PLANE_TYPES[currentPlaneIndex].name, FONT_30, WHITE, WIDTH / 2, arrowY, 'center', 'middle');
                drawTextWithShadow(ctx, "클릭 / 스페이스바로 시작", startFont, WHITE, WIDTH / 2, startY, 'center', 'middle');
                drawTextWithShadow(ctx, "방향키 좌우: 기체 변경", FONT_18, WHITE, WIDTH / 2, startY + 30, 'center', 'middle');

            } else if (gameState === 'playing') {
                obstacles.forEach(obs => obs.draw(ctx));
                fuelItems.forEach(item => item.draw(ctx)); 
                missiles.forEach(m => m.draw(ctx)); 
                powerUps.forEach(p => p.draw(ctx)); 

                drawTextWithShadow(ctx, `최고: ${highScore}`, FONT_30, WHITE, WIDTH - 20, 30, 'right', 'top');
                drawTextWithShadow(ctx, score.toString(), FONT_70, WHITE, WIDTH / 2, 70, 'center', 'middle');
                
                particles.forEach(p => p.draw(ctx));
                plane.draw(ctx); 

                drawFuelBar(ctx, 20, 20, 200, 25, plane.fuel, plane.maxFuel);
                
                let uiXOffset = 230;
                if (plane.hasShield) {
                    drawShieldIcon(uiXOffset + 10, 33);
                    uiXOffset += 40; 
                }
                if (plane.magnetCharges > 0) {
                    drawMagnetIcon(uiXOffset + 10, 33);
                    drawTextWithShadow(ctx, `: ${plane.magnetCharges}`, FONT_24, MAGNET_RED, uiXOffset + 20, 33, 'left', 'middle');
                }
            
            } else if (gameState === 'dying') { 
                obstacles.forEach(obs => obs.draw(ctx)); 
                fuelItems.forEach(item => item.draw(ctx));
                missiles.forEach(m => m.draw(ctx));
                powerUps.forEach(p => p.draw(ctx));
                
                particles.forEach(p => p.draw(ctx)); 
                plane.draw(ctx); 

                drawTextWithShadow(ctx, `최고: ${highScore}`, FONT_30, WHITE, WIDTH - 20, 30, 'right', 'top');
                drawTextWithShadow(ctx, score.toString(), FONT_70, WHITE, WIDTH / 2, 70, 'center', 'middle');
                drawFuelBar(ctx, 20, 20, 200, 25, plane.fuel, plane.maxFuel);

            } else if (gameState === 'gameOver') {
                obstacles.forEach(obs => obs.draw(ctx)); 
                fuelItems.forEach(item => item.draw(ctx));
                missiles.forEach(m => m.draw(ctx));
                powerUps.forEach(p => p.draw(ctx));
                particles.forEach(p => p.draw(ctx)); 
                plane.draw(ctx); 

// 3. (異붽?) 留덉슦???몃쾭 媛먯? (?붿껌 1)
            const restartHover = (mouseX > RESTART_BTN_RECT.x && mouseX < RESTART_BTN_RECT.x + RESTART_BTN_RECT.w &&
                                mouseY > RESTART_BTN_RECT.y && mouseY < RESTART_BTN_RECT.y + RESTART_BTN_RECT.h);
            const lobbyHover = (mouseX > LOBBY_BTN_RECT.x && mouseX < LOBBY_BTN_RECT.x + LOBBY_BTN_RECT.w &&
                              mouseY > LOBBY_BTN_RECT.y && mouseY < LOBBY_BTN_RECT.y + LOBBY_BTN_RECT.h);

            // 4. (異붽?) ?명꽣?숉떚釉?諛뺤뒪 踰꾪듉 洹몃━湲?(?붿껌 1)

            // RESTART 踰꾪듉
            ctx.fillStyle = restartHover ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.1)';
            ctx.fillRect(RESTART_BTN_RECT.x, RESTART_BTN_RECT.y, RESTART_BTN_RECT.w, RESTART_BTN_RECT.h);
            drawTextWithShadow(ctx, "[ RESTART ]", FONT_RETRO_24, WHITE, RESTART_BTN_RECT.x + RESTART_BTN_RECT.w / 2, RESTART_BTN_RECT.y + RESTART_BTN_RECT.h / 2, 'center', 'middle');

            // LOBBY 踰꾪듉
            ctx.fillStyle = lobbyHover ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.1)';
            ctx.fillRect(LOBBY_BTN_RECT.x, LOBBY_BTN_RECT.y, LOBBY_BTN_RECT.w, LOBBY_BTN_RECT.h);
            drawTextWithShadow(ctx, "[ LOBBY ]", FONT_RETRO_24, WHITE, LOBBY_BTN_RECT.x + LOBBY_BTN_RECT.w / 2, LOBBY_BTN_RECT.y + LOBBY_BTN_RECT.h / 2, 'center', 'middle');

            // 5. (?섏젙) 以꾨컮轅덉씠 ?곸슜???쒕쾭 硫붿떆吏 異쒕젰 (?붿껌 2, 5)
            drawMultilineTextWithShadow(ctx, serverStatusMessage, FONT_24, THRUST_YELLOW, WIDTH / 2, HEIGHT / 2 + 80, 'center', 'middle', 18);
            }

            requestAnimationFrame(gameLoop);
        }



        // --- ?대깽??由ъ뒪??---
        const handleInput = (e) => {
     if (isSubmitting) return; // ?꾩넚 以묒씪 ???꾨Т寃껊룄 ????

     if (gameState === 'playing') { 
        // '寃뚯엫 以????뚮뒗 ?먰봽(applyThrust)留??ㅽ뻾?⑸땲??
        if(plane.applyThrust()) { 
            particles.push(new Particle(plane.x, plane.y + plane.height / 2, 'thrust'));
        }
    } else if (gameState === 'gameOver') { 
        // '寃뚯엫 ?ㅻ쾭'???뚮쭔 ?ㅽ럹?댁뒪諛붾줈 ?ъ떆??startGame)???ㅽ뻾?⑸땲??
        startGame(); 
    }

    if (e) e.preventDefault(); 
};
        


        window.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            mouseX = (e.clientX - rect.left) * (WIDTH / rect.width);
            mouseY = (e.clientY - rect.top) * (HEIGHT / rect.height);
        });

        const startNewGame = (e) => {
            gameState = 'playing';
            framesElapsed = 0; 
            score = 0;
            plane.yVel = 0;
            if (plane.applyThrust()) {
                particles.push(new Particle(plane.x, plane.y + plane.height / 2, 'thrust'));
            }
            if(e) e.preventDefault();
        };

        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                if (gameState === 'menu') {
                    startNewGame(e);
                } else {
                    handleInput(e);
                }
            }
            if (gameState === 'menu') {
                if (e.code === 'ArrowLeft') changePlane(-1);
                else if (e.code === 'ArrowRight') changePlane(1);
            }
        });
        
        const handleMenuClick = (clickX, clickY) => {
            if (gameState !== 'menu') return false;

            const leftChangeHitbox = { x: WIDTH/2 - 250, y: HEIGHT/2 + 40, w: 150, h: 80 };
            const rightChangeHitbox = { x: WIDTH/2 + 100, y: HEIGHT/2 + 40, w: 150, h: 80 };

            const leftHit = (clickX > leftChangeHitbox.x && clickX < leftChangeHitbox.x + leftChangeHitbox.w &&
                             clickY > leftChangeHitbox.y && clickY < leftChangeHitbox.y + leftChangeHitbox.h);
            const rightHit = (clickX > rightChangeHitbox.x && clickX < rightChangeHitbox.x + rightChangeHitbox.w &&
                              clickY > rightChangeHitbox.y && clickY < rightChangeHitbox.y + rightChangeHitbox.h);
            
            if (leftHit) {
                changePlane(-1);
                return true; 
            } else if (rightHit) {
                changePlane(1);
                return true; 
            }
            
            return false; 
        };

window.addEventListener('mousedown', (e) => {
            if (e) e.preventDefault();
            const rect = canvas.getBoundingClientRect();
            const clickX = (e.clientX - rect.left) * (WIDTH / rect.width);
            const clickY = (e.clientY - rect.top) * (HEIGHT / rect.height);

            if (gameState === 'menu') {
                const arrowClicked = handleMenuClick(clickX, clickY);
                if (!arrowClicked) {
                    startNewGame(e);
                }
            } else if (gameState === 'playing') {
                 // (?섏젙) 'playing' ?곹깭???뚮쭔 handleInput ?몄텧 (?곕즺 遺꾩궗)
                 handleInput(e); 
            } else if (gameState === 'gameOver') {
                // (?섏젙) 'gameOver' ?곹깭???뚮뒗 踰꾪듉 濡쒖쭅留?吏곸젒 泥섎━
                // (?대븣 handleInput()???몄텧?섏? ?딆뒿?덈떎!)
                
                if (isSubmitting) return; // ?꾩넚 以묒씠硫??꾨Т寃껊룄 ????

                // RESTART 踰꾪듉 ?대┃ ?뺤씤
                if (clickX > RESTART_BTN_RECT.x && clickX < RESTART_BTN_RECT.x + RESTART_BTN_RECT.w &&
                    clickY > RESTART_BTN_RECT.y && clickY < RESTART_BTN_RECT.y + RESTART_BTN_RECT.h) {
                    startGame(); // 踰꾪듉???뚮????뚮쭔 ?ъ떆??
                }
                
                // LOBBY 踰꾪듉 ?대┃ ?뺤씤
                if (clickX > LOBBY_BTN_RECT.x && clickX < LOBBY_BTN_RECT.x + LOBBY_BTN_RECT.w &&
                    clickY > LOBBY_BTN_RECT.y && clickY < LOBBY_BTN_RECT.y + LOBBY_BTN_RECT.h) {
                    returnToMinigameHub();
                }
            }
        });
        

	window.addEventListener('touchstart', (e) => {
            if (e) e.preventDefault(); 

            const rect = canvas.getBoundingClientRect();
            const touchX = (e.touches[0].clientX - rect.left) * (WIDTH / rect.width);
            const touchY = (e.touches[0].clientY - rect.top) * (HEIGHT / rect.height);

            if (gameState === 'menu') {
                const arrowTouched = handleMenuClick(touchX, touchY);
                if (!arrowTouched) {
                    startNewGame(e);
                }
            } else if (gameState === 'playing') {
                 // (?섏젙) 'playing' ?곹깭???뚮쭔 handleInput ?몄텧 (?곕즺 遺꾩궗)
                 handleInput(e);
            } else if (gameState === 'gameOver') {
                // (?섏젙) 'gameOver' ?곹깭???뚮뒗 踰꾪듉 濡쒖쭅留?吏곸젒 泥섎━
                // (?대븣 handleInput()???몄텧?섏? ?딆뒿?덈떎!)
                
                if (isSubmitting) return; // ?꾩넚 以묒씠硫??꾨Т寃껊룄 ????

                // RESTART 踰꾪듉 ?곗튂 ?뺤씤
                if (touchX > RESTART_BTN_RECT.x && touchX < RESTART_BTN_RECT.x + RESTART_BTN_RECT.w &&
                    touchY > RESTART_BTN_RECT.y && touchY < RESTART_BTN_RECT.y + RESTART_BTN_RECT.h) {
                    startGame(); // 踰꾪듉???뚮????뚮쭔 ?ъ떆??
                }
                
                // LOBBY 踰꾪듉 ?곗튂 ?뺤씤
                if (touchX > LOBBY_BTN_RECT.x && touchX < LOBBY_BTN_RECT.x + LOBBY_BTN_RECT.w &&
                    touchY > LOBBY_BTN_RECT.y && touchY < LOBBY_BTN_RECT.y + LOBBY_BTN_RECT.h) {
                        returnToMinigameHub();
                }
            }
        }, { passive: false });


        // ?붾㈃ ?ш린 議곗젙
        function resizeCanvas() {
            const aspectRatio = WIDTH / HEIGHT; // 800 / 600
            let newWidth = window.innerWidth;
            let newHeight = window.innerHeight;
            const windowAspectRatio = newWidth / newHeight;

            if (windowAspectRatio > aspectRatio) {
                canvas.style.height = '100%';
                canvas.style.width = `${newHeight * aspectRatio}px`;
            } else {
                canvas.style.width = '100%';
                canvas.style.height = `${newWidth / aspectRatio}px`;
            }
        }
        window.addEventListener('resize', resizeCanvas);
        resizeCanvas(); 

        // --- 寃뚯엫 ?쒖옉 ---
        startGame();
        gameLoop();
    
