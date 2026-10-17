// ============================================================
//  INVASION — Space Invaders Style Game
// ============================================================

const InvasionGame = (() => {
    // ---- Audio ----
    let audioCtx = null;

    function ensureAudio() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    function playTone(freq, duration, type = 'square', volume = 0.10) {
        ensureAudio();
        const osc  = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type     = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(volume, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    }

    function sfxShoot() {
        playTone(880, 0.06, 'square', 0.08);
    }

    function sfxExplode() {
        playTone(150, 0.15, 'sawtooth', 0.12);
        setTimeout(() => playTone(80, 0.2, 'sawtooth', 0.10), 50);
    }

    function sfxPlayerHit() {
        playTone(200, 0.1, 'sawtooth', 0.15);
        setTimeout(() => playTone(100, 0.3, 'sawtooth', 0.15), 80);
    }

    function sfxStart() {
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
            setTimeout(() => playTone(f, 0.10, 'square', 0.10), i * 70);
        });
    }

    function sfxAlienStep() {
        playTone(180 + Math.random() * 40, 0.04, 'square', 0.04);
    }

    // ---- DOM refs ----
    const canvas  = document.getElementById('game-canvas');
    const ctx     = canvas.getContext('2d');
    const scoreEl  = document.getElementById('score');
    const highEl   = document.getElementById('high-score');
    const overlay  = document.getElementById('game-overlay');
    const oTitle   = document.getElementById('overlay-title');
    const oMsg     = document.getElementById('overlay-msg');
    const oScore   = document.getElementById('overlay-score');
    const gameArea = document.getElementById('game-area');

    // ---- Config ----
    const W = 400;
    const H = 400;

    // Player
    const PLAYER_W = 30;
    const PLAYER_H = 14;
    const PLAYER_SPEED = 4;

    // Bullet
    const BULLET_W = 3;
    const BULLET_H = 10;
    const BULLET_SPEED = 6;

    // Alien
    const ALIEN_W = 22;
    const ALIEN_H = 16;
    const ALIEN_PAD_X = 8;
    const ALIEN_PAD_Y = 6;
    const ALIEN_COLS = 8;
    const ALIEN_ROWS = 4;

    // ---- State ----
    let player, bullets, aliens = [], alienDir, alienSpeed, alienStepTimer, alienShootTimer;
    let score, highScore, lives, alive, running, animFrame, keys, gameLoop;
    let particles, level;

    highScore = parseInt(localStorage.getItem('retro-invasion-best') || '0', 10);
    highEl.textContent = highScore;

    // ---- Helpers ----
    function rand(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function rectIntersect(a, b) {
        return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    }

    function createParticles(x, y, color, count = 8) {
        for (let i = 0; i < count; i++) {
            particles.push({
                x, y,
                vx: (Math.random() - 0.5) * 4,
                vy: (Math.random() - 0.5) * 4,
                life: 20 + Math.random() * 15,
                color,
            });
        }
    }

    // ---- Drawing helpers ----
    function drawAlien(x, y, row) {
        const colors = ['#ff2d95', '#00f0ff', '#ffe600', '#39ff14'];
        const color  = colors[row % colors.length];

        ctx.fillStyle = color;

        // Body
        ctx.fillRect(x + 3, y, ALIEN_W - 6, ALIEN_H);
        ctx.fillRect(x, y + 4, ALIEN_W, ALIEN_H - 8);

        // Eyes
        ctx.fillStyle = '#000';
        ctx.fillRect(x + 6, y + 4, 3, 3);
        ctx.fillRect(x + ALIEN_W - 9, y + 4, 3, 3);

        // Antennae / feet (animate)
        ctx.fillStyle = color;
        const t = Math.floor(Date.now() / 400) % 2;
        if (t === 0) {
            ctx.fillRect(x, y - 3, 3, 3);
            ctx.fillRect(x + ALIEN_W - 3, y - 3, 3, 3);
        } else {
            ctx.fillRect(x, y + ALIEN_H, 3, 3);
            ctx.fillRect(x + ALIEN_W - 3, y + ALIEN_H, 3, 3);
        }
    }

    function drawPlayer(x, y) {
        // Ship body
        ctx.fillStyle = '#39ff14';
        ctx.fillRect(x, y + 4, PLAYER_W, PLAYER_H - 4);
        // Turret
        ctx.fillRect(x + PLAYER_W / 2 - 3, y, 6, 6);
        // Tip
        ctx.fillRect(x + PLAYER_W / 2 - 1, y - 3, 2, 3);

        // Glow
        ctx.shadowColor = '#39ff14';
        ctx.shadowBlur = 8;
        ctx.fillRect(x, y, PLAYER_W, PLAYER_H);
        ctx.shadowBlur = 0;
    }

    function drawBullet(x, y, color = '#ffe600') {
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 6;
        ctx.fillRect(x, y, BULLET_W, BULLET_H);
        ctx.shadowBlur = 0;
    }

    function drawGrid() {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);

        // Star field
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        for (let i = 0; i < 40; i++) {
            const sx = (i * 97) % W;
            const sy = (i * 53) % H;
            ctx.fillRect(sx, sy, 1, 1);
        }
    }

    function drawHUD() {
        drawLives();
        // Level
        ctx.fillStyle = '#00f0ff';
        ctx.font = '10px Courier New';
        ctx.fillText('LEVEL ' + level, W - 55, 13);
    }

    function drawLives() {
        // Draw lives as small simplified player icons (no glow)
        for (let i = 0; i < lives; i++) {
            const x = 10 + i * 36;
            const y = 2;
            // Simple ship shape without glow
            ctx.fillStyle = '#39ff14';
            ctx.fillRect(x, y + 4, PLAYER_W, PLAYER_H - 4);
            ctx.fillRect(x + PLAYER_W / 2 - 3, y, 6, 6);
            ctx.fillRect(x + PLAYER_W / 2 - 1, y - 3, 2, 3);
        }
    }

    // ---- Init ----
    function init() {
        canvas.width  = W;
        canvas.height = H;
        startLevel();  // create aliens BEFORE draw
        resetGame();
    }

    function createAliens() {
        const aliens = [];
        const totalW = ALIEN_COLS * (ALIEN_W + ALIEN_PAD_X) - ALIEN_PAD_X;
        const startX = (W - totalW) / 2;

        for (let r = 0; r < ALIEN_ROWS; r++) {
            for (let c = 0; c < ALIEN_COLS; c++) {
                aliens.push({
                    x: startX + c * (ALIEN_W + ALIEN_PAD_X),
                    y: 50 + r * (ALIEN_H + ALIEN_PAD_Y),
                    alive: true,
                    row: r,
                });
            }
        }
        return aliens;
    }

    function resetGame() {
        player     = { x: W / 2 - PLAYER_W / 2, y: H - 40 };
        bullets    = [];
        particles  = [];
        level      = 1;
        score      = 0;
        lives      = 3;
        alive      = true;
        running    = false;
        keys       = {};
        scoreEl.textContent = 0;
        overlay.classList.remove('hidden');
        oTitle.textContent  = 'INVASION';
        oMsg.textContent    = '← → to move | SPACE to fire';
        oScore.style.display = 'none';
        draw();
    }

    function startLevel() {
        bullets      = [];
        particles    = [];
        aliens       = createAliens();
        alienDir     = 1;
        alienSpeed   = 0.5 + (level - 1) * 0.25;
        alienStepTimer = 0;
        alienShootTimer = 0;
    }

    // ---- Update ----
    function update() {
        if (!alive || !running) return;

        // Player movement
        if (keys['ArrowLeft'] || keys['KeyA']) {
            player.x -= PLAYER_SPEED;
            if (player.x < 0) player.x = 0;
        }
        if (keys['ArrowRight'] || keys['KeyD']) {
            player.x += PLAYER_SPEED;
            if (player.x > W - PLAYER_W) player.x = W - PLAYER_W;
        }

        // Bullets
        bullets.forEach(b => { b.y += b.dir === -1 ? -BULLET_SPEED : BULLET_SPEED; });
        bullets = bullets.filter(b => b.y > -BULLET_H && b.y < H);

        // Alien step
        alienStepTimer++;
        const stepInterval = Math.max(5, Math.floor(30 / (1 + (level - 1) * 0.3)));
        if (alienStepTimer >= stepInterval) {
            alienStepTimer = 0;
            const aliveAliens = aliens.filter(a => a.alive);

            if (aliveAliens.length === 0) {
                // Level complete
                level++;
                startLevel();
                return;
            }

            let hitEdge = false;
            for (const a of aliveAliens) {
                if ((a.x + ALIEN_W >= W - 5 && alienDir > 0) || (a.x <= 5 && alienDir < 0)) {
                    hitEdge = true;
                    break;
                }
            }

            if (hitEdge) {
                alienDir *= -1;
                aliens.forEach(a => { if (a.alive) a.y += 12; });
            } else {
                aliens.forEach(a => { if (a.alive) a.x += alienDir * (8 + (level - 1) * 0.5); });
            }

            sfxAlienStep();

            // Check if aliens reached bottom
            for (const a of aliveAliens) {
                if (a.y + ALIEN_H >= player.y) {
                    lives = 0;
                    return gameOver();
                }
            }
        }

        // Alien shooting
        alienShootTimer++;
        const shootInterval = Math.max(30, 90 - level * 10);
        if (alienShootTimer >= shootInterval) {
            alienShootTimer = 0;
            const aliveAliens = aliens.filter(a => a.alive);
            if (aliveAliens.length > 0) {
                // Pick bottom-most alien from a random column
                const cols = {};
                for (const a of aliveAliens) {
                    const col = Math.round(a.x / (ALIEN_W + ALIEN_PAD_X));
                    if (!cols[col] || a.y > cols[col].y) cols[col] = a;
                }
                const bottoms = Object.values(cols);
                const shooter = bottoms[rand(0, bottoms.length - 1)];
                bullets.push({
                    x: shooter.x + ALIEN_W / 2,
                    y: shooter.y + ALIEN_H,
                    dir: 1,
                });
            }
        }

        // Collision: player bullets vs aliens
        for (const b of bullets) {
            if (b.dir !== -1) continue; // only player bullets
            for (const a of aliens) {
                if (!a.alive) continue;
                if (rectIntersect(
                    { x: b.x, y: b.y, w: BULLET_W, h: BULLET_H },
                    { x: a.x, y: a.y, w: ALIEN_W, h: ALIEN_H }
                )) {
                    a.alive = false;
                    b.y = -999;
                    const scoreMap = [30, 20, 20, 10];
                    score += scoreMap[a.row % scoreMap.length] * level;
                    scoreEl.textContent = score;
                    createParticles(a.x + ALIEN_W / 2, a.y + ALIEN_H / 2, ['#ff2d95', '#00f0ff', '#ffe600', '#39ff14'][a.row % 4], 10);
                    sfxExplode();
                    break;
                }
            }
        }
        bullets = bullets.filter(b => b.y > -BULLET_H);

        // Collision: alien bullets vs player
        for (const b of bullets) {
            if (b.dir !== 1) continue;
            if (rectIntersect(
                { x: b.x, y: b.y, w: BULLET_W, h: BULLET_H },
                { x: player.x, y: player.y, w: PLAYER_W, h: PLAYER_H }
            )) {
                b.y = 999;
                lives--;
                createParticles(player.x + PLAYER_W / 2, player.y + PLAYER_H / 2, '#39ff14', 12);
                sfxPlayerHit();
                if (lives <= 0) {
                    return gameOver();
                }
                break;
            }
        }

        // Collision: alien vs player (body check)
        for (const a of aliens) {
            if (!a.alive) continue;
            if (rectIntersect(
                { x: a.x, y: a.y, w: ALIEN_W, h: ALIEN_H },
                { x: player.x, y: player.y, w: PLAYER_W, h: PLAYER_H }
            )) {
                lives = 0;
                return gameOver();
            }
        }

        // Particles
        particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.life--;
        });
        particles = particles.filter(p => p.life > 0);
    }

    function draw() {
        drawGrid();

        // Aliens
        for (const a of aliens) {
            if (a.alive) drawAlien(a.x, a.y, a.row);
        }

        // Player
        if (alive) drawPlayer(player.x, player.y);

        // Bullets
        for (const b of bullets) {
            drawBullet(b.x, b.y, b.dir === -1 ? '#ffe600' : '#ff2d95');
        }

        // Particles
        for (const p of particles) {
            ctx.globalAlpha = p.life / 35;
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x, p.y, 2, 2);
        }
        ctx.globalAlpha = 1;

        drawHUD();
    }

    // ---- Game Loop ----
    function loop() {
        update();
        draw();
        gameLoop = requestAnimationFrame(loop);
    }

    function gameOver() {
        alive  = false;
        running = false;
        cancelAnimationFrame(gameLoop);

        if (score > highScore) {
            highScore = score;
            localStorage.setItem('retro-invasion-best', highScore);
            highEl.textContent = highScore;
        }

        oTitle.textContent  = 'GAME OVER';
        oMsg.textContent    = 'Press SPACE or button to retry';
        oScore.textContent  = `Score: ${score}  |  High: ${highScore}`;
        oScore.style.display = 'block';
        overlay.classList.remove('hidden');
    }

    // ---- Start game session (shared by key, touch, tap) ----
    function startGameSession() {
        ensureAudio();
        if (!alive) resetGame();
        startLevel();
        running  = true;
        overlay.classList.add('hidden');
        sfxStart();
        loop();
    }

    // ---- Controls ----
    function handleKey(e) {
        if (['Space', 'Enter'].includes(e.code)) {
            e.preventDefault();
            if (!running) startGameSession();
            return;
        }

        keys[e.code] = true;

        if (running && e.code === 'Space') {
            e.preventDefault();
            // Limit to one bullet on screen
            const playerBullets = bullets.filter(b => b.dir === -1);
            if (playerBullets.length < 2) {
                bullets.push({
                    x: player.x + PLAYER_W / 2 - BULLET_W / 2,
                    y: player.y - BULLET_H,
                    dir: -1,
                });
                sfxShoot();
            }
        }

        // Prevent scrolling with arrows
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
            e.preventDefault();
        }
    }

    const handleKeyUp = (e) => {
        keys[e.code] = false;
    };

    // ---- D-Pad / touch support ----
    function setupDPad() {
        // D-pad buttons for movement
        const btnMap = {
            'btn-left': 'ArrowLeft',
            'btn-right': 'ArrowRight',
        };

        for (const [btnId, keyCode] of Object.entries(btnMap)) {
            const btn = document.getElementById(btnId);
            if (!btn) continue;

            btn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                ensureAudio();
                keys[keyCode] = true;
                if (!running) startGameSession();
            }, { passive: false });

            btn.addEventListener('touchend', (e) => {
                e.preventDefault();
                keys[keyCode] = false;
            }, { passive: false });

            btn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                ensureAudio();
                keys[keyCode] = true;
                if (!running) startGameSession();
            });

            btn.addEventListener('mouseup', () => {
                keys[keyCode] = false;
            });
        }

        // Fire button (or space on desktop)
        const btnStart = document.getElementById('btn-start-game');
        if (btnStart) {
            btnStart.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                startGameSession();
            });
        }

        // Touch canvas to fire
        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            ensureAudio();
            if (!running) {
                startGameSession();
                return;
            }
            // Fire on tap
            const playerBullets = bullets.filter(b => b.dir === -1);
            if (playerBullets.length < 2) {
                bullets.push({
                    x: player.x + PLAYER_W / 2 - BULLET_W / 2,
                    y: player.y - BULLET_H,
                    dir: -1,
                });
                sfxShoot();
            }
        }, { passive: false });
    }

    // ---- Public API ----
    function start() {
        gameArea.classList.remove('hidden');
        document.addEventListener('keydown', handleKey);
        document.addEventListener('keyup', handleKeyUp);
        init();
        setupDPad();
        // loop() is started by startGameSession() when user presses START/SPACE
    }

    function isActive() {
        return running;
    }

    function stop() {
        document.removeEventListener('keydown', handleKey);
        document.removeEventListener('keyup', handleKeyUp);
        cancelAnimationFrame(gameLoop);
        running  = false;
        alive    = false;
    }

    return { start, stop, isActive };
})();

// ---- Global wire-up (used by index.html onclick handlers) ----
// eslint-disable-next-line no-unused-vars
function startGame(name) {
    if (name === 'snake') {
        SnakeGame.start();
    } else if (name === 'invasion') {
        InvasionGame.start();
    }
}
// eslint-disable-next-line no-unused-vars
function goBack() {
    SnakeGame.stop();
    InvasionGame.stop();
    document.getElementById('game-area').classList.add('hidden');
}
