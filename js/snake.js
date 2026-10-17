// ============================================================
//  SNAKE — Full Canvas Game
// ============================================================

const SnakeGame = (() => {
    // ---- Audio (Web Audio API) ----
    let audioCtx = null;

    function ensureAudio() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    // Play a square-wave note (retro chip-tune style)
    function playTone(freq, duration, type = 'square', volume = 0.12) {
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

    function sfxEat() {
        // Quick ascending "ding" — two notes
        playTone(587.33, 0.08);  // D5
        setTimeout(() => playTone(783.99, 0.10), 60);  // G5
    }

    function sfxDie() {
        // Descending crash
        playTone(300, 0.12, 'sawtooth', 0.15);
        setTimeout(() => playTone(200, 0.12, 'sawtooth', 0.15), 80);
        setTimeout(() => playTone(120, 0.30, 'sawtooth', 0.15), 160);
    }

    function sfxStart() {
        // Short ascending jingle
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
            setTimeout(() => playTone(f, 0.10, 'square', 0.10), i * 70);
        });
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

    // ---- Mobile touch / swipe state ----
    let touchStartX = 0, touchStartY = 0;
    const SWIPE_MIN = 30; // px threshold

    // ---- Config ----
    const GRID     = 20;            // cell size in px
    const COLS     = 20;            // grid width  (cells)
    const ROWS     = 20;            // grid height (cells)
    const BASE_SPEED = 120;         // ms per tick at start

    // ---- State ----
    let snake, direction, nextDirection, food, score, highScore, alive, running, timer, lastAppliedDirection = { x: 1, y: 0 };

    highScore = parseInt(localStorage.getItem('retro-snake-best') || '0', 10);
    highEl.textContent = highScore;

    // ---- Helpers ----
    function rand(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function randomFood() {
        let pos;
        do {
            pos = { x: rand(0, COLS - 1), y: rand(0, ROWS - 1) };
        } while (snake.some(s => s.x === pos.x && s.y === pos.y));
        return pos;
    }

    // ---- Init ----
    function init() {
        canvas.width  = COLS * GRID;
        canvas.height = ROWS * GRID;
        resetGame();
        draw();                       // draw initial empty grid
    }

    function resetGame() {
        const midX = Math.floor(COLS / 2);
        const midY = Math.floor(ROWS / 2);
        snake     = [
            { x: midX, y: midY },
            { x: midX - 1, y: midY },
            { x: midX - 2, y: midY },
        ];
        direction       = { x: 1, y: 0 };
        nextDirection   = { x: 1, y: 0 };
        food            = randomFood();
        score           = 0;
        alive           = true;
        running         = false;
        scoreEl.textContent = 0;
        overlay.classList.remove('hidden');
        oTitle.textContent  = 'SNAKE';
        oMsg.textContent    = 'Tap canvas or swipe to start';
        oScore.style.display = 'none';
    }

    // ---- Drawing helpers ----
    function drawGrid() {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // faint grid lines
        ctx.strokeStyle = 'rgba(57, 255, 20, 0.04)';
        ctx.lineWidth = 0.5;
        for (let x = 0; x <= canvas.width; x += GRID) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
        }
        for (let y = 0; y <= canvas.height; y += GRID) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
        }
    }

    function drawCell(x, y, color, glow = false) {
        const pad = 1;
        ctx.fillStyle = color;
        if (glow) {
            ctx.shadowColor = color;
            ctx.shadowBlur  = 10;
        }
        ctx.fillRect(x * GRID + pad, y * GRID + pad, GRID - pad * 2, GRID - pad * 2);
        ctx.shadowBlur = 0;
    }

    function draw() {
        drawGrid();

        // Food — pulsing
        const pulse = 0.8 + 0.2 * Math.sin(Date.now() / 200);
        ctx.globalAlpha = pulse;
        drawCell(food.x, food.y, '#ff2d95', true);
        ctx.globalAlpha = 1;

        // Snake body
        snake.forEach((seg, i) => {
            const c = i === 0 ? '#39ff14' : '#2bcc10';
            drawCell(seg.x, seg.y, c, i === 0);
        });

        // Snake eyes on head
        const head = snake[0];
        ctx.fillStyle = '#000';
        const ex = head.x * GRID + GRID / 2;
        const ey = head.y * GRID + GRID / 2;
        ctx.beginPath();
        ctx.arc(ex + direction.x * 3 - direction.y * 3, ey + direction.y * 3 - direction.x * 3, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(ex - direction.x * 3 + direction.y * 3, ey - direction.y * 3 + direction.x * 3, 1.5, 0, Math.PI * 2);
        ctx.fill();
    }

    // ---- Game Loop ----
    function tick() {
        if (!alive || !running) return;

        // Apply queued direction change
        direction = { ...nextDirection };
        lastAppliedDirection = { ...direction };
        // Reset nextDirection to prevent multiple changes in one tick
        nextDirection = { ...direction };
        const head = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };

        // Wall wrapping
        if (head.x < 0) head.x = COLS - 1;
        if (head.x >= COLS) head.x = 0;
        if (head.y < 0) head.y = ROWS - 1;
        if (head.y >= ROWS) head.y = 0;

        // Self collision
        if (snake.some(s => s.x === head.x && s.y === head.y)) {
            return gameOver();
        }

        snake.unshift(head);

        // Eat food?
        if (head.x === food.x && head.y === food.y) {
            score += 10;
            scoreEl.textContent = score;
            food = randomFood();
            sfxEat();
            // Speed up slightly
            clearInterval(timer);
            const speed = Math.max(50, BASE_SPEED - Math.floor(score / 50) * 8);
            timer = setInterval(tick, speed);
        } else {
            snake.pop();
        }

        draw();
    }

    function gameOver() {
        alive  = false;
        running = false;
        clearInterval(timer);

        // Update high score
        if (score > highScore) {
            highScore = score;
            localStorage.setItem('retro-snake-best', highScore);
            highEl.textContent = highScore;
        }

        // Show overlay
        oTitle.textContent  = 'GAME OVER';
        oMsg.textContent    = 'Tap canvas or button to retry';
        oScore.textContent  = `Score: ${score}`;
        oScore.style.display = 'block';
        overlay.classList.remove('hidden');

        sfxDie();

        // Flash effect
        drawGrid();
        ctx.fillStyle = 'rgba(255, 45, 149, 0.3)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // ---- Controls ----
    function handleKey(e) {
        if (['Space', 'Enter'].includes(e.code)) {
            e.preventDefault();
            if (!running) startGameSession();
            return;
        }

        if (!running) {
            // Prevent arrow key scrolling on the start screen
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
                e.preventDefault();
            }
            return;
        }

        const map = {
            ArrowUp:    { x:  0, y: -1 },
            ArrowDown:  { x:  0, y:  1 },
            ArrowLeft:  { x: -1, y:  0 },
            ArrowRight: { x:  1, y:  0 },
            KeyW:       { x:  0, y: -1 },
            KeyS:       { x:  0, y:  1 },
            KeyA:       { x: -1, y:  0 },
            KeyD:       { x:  1, y:  0 },
        };

        const dir = map[e.code];
        if (dir) {
            e.preventDefault();
            setDirection(dir);
        }
    }

    // ---- Start game session (shared by key, touch, tap) ----
    function startGameSession() {
        ensureAudio();
        if (!alive) resetGame();
        running  = true;
        overlay.classList.add('hidden');
        sfxStart();
        timer = setInterval(tick, BASE_SPEED);
        tick();
    }

    // ---- Direction setter (180° guard) ----
    function setDirection(dir) {
        // Prevent 180° turns based on last applied direction (not queued direction)
        if (dir.x !== -lastAppliedDirection.x || dir.y !== -lastAppliedDirection.y) {
            nextDirection = dir;
        }
    }

    // ---- Swipe detection ----
    canvas.addEventListener('touchstart', e => {
        const t = e.touches[0];
        touchStartX = t.clientX;
        touchStartY = t.clientY;
        // Tap (short, no movement) to start/restart
        canvas.addEventListener('touchend', handleTapEnd, { once: true });
    }, { passive: true });

    // Prevent page scrolling during swipe
    canvas.addEventListener('touchmove', e => {
        e.preventDefault();
    }, { passive: false });

    function handleTapEnd(e) {
        const t = e.changedTouches[0];
        const dx = t.clientX - touchStartX;
        const dy = t.clientY - touchStartY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < SWIPE_MIN) {
            // It's a tap — start/restart game
            if (!running) startGameSession();
            return;
        }

        // Swipe — determine direction
        if (Math.abs(dx) > Math.abs(dy)) {
            setDirection(dx > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 });
        } else {
            setDirection(dy > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 });
        }
    }

    // ---- D-Pad button handlers ----
    function setupDPad() {
        const btns = {
            'btn-up':    { x:  0, y: -1 },
            'btn-down':  { x:  0, y:  1 },
            'btn-left':  { x: -1, y:  0 },
            'btn-right': { x:  1, y:  0 },
        };

        for (const [id, dir] of Object.entries(btns)) {
            const btn = document.getElementById(id);
            if (!btn) continue;

            const activate = (e) => {
                e.preventDefault();
                ensureAudio();
                if (!running) startGameSession();
                setDirection(dir);
            };

            btn.addEventListener('touchstart', activate, { passive: false });
            btn.addEventListener('mousedown', activate);
        }

        // Start/restart button
        const btnStart = document.getElementById('btn-start-game');
        if (btnStart) {
            btnStart.addEventListener('click', startGameSession);
        }
    }

    // ---- Public API ----
    function start() {
        gameArea.classList.remove('hidden');
        document.addEventListener('keydown', handleKey);
        init();
        setupDPad();
    }

    function isActive() {
        return running;
    }

    function stop() {
        document.removeEventListener('keydown', handleKey);
        clearInterval(timer);
        running = false;
        alive   = false;
    }

    // Animate food pulse when idle
    function animateIdle() {
        if (running) return;
        draw();
        requestAnimationFrame(animateIdle);
    }

    return { start, stop, animateIdle };
})();

// ---- Global wire-up (used by index.html onclick handlers) ----
// eslint-disable-next-line no-unused-vars
function startGame(name) {
    if (name === 'snake') {
        SnakeGame.start();
    }
}

// eslint-disable-next-line no-unused-vars
function goBack() {
    if (SnakeGame.isActive()) {
        SnakeGame.stop();
    } else if (InvasionGame.isActive()) {
        InvasionGame.stop();
    }
    document.getElementById('game-area').classList.add('hidden');
}
