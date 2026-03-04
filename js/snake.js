(function() {
  const canvas = document.getElementById('gameboard');
  const ctx = canvas.getContext('2d');

  // Config
  const SIZE = 10;
  const COLS = canvas.width / SIZE;
  const ROWS = canvas.height / SIZE;
  const FOOD_PER_LEVEL = 5;
  const SPEED_MAP = { slow: 200, normal: 140, fast: 90 };

  // State
  let state = 'idle'; // idle | countdown | playing | paused | dead
  let snake, dir, nextDir, food, score, hiScore, level, foodTaken;
  let streak, baseSpeed, gameInterval, countdownVal, gameStartTime, timerInterval;
  let selectedSpeed = 'slow';
  let particles = [];

  // Load hi score
  hiScore = parseInt(localStorage.getItem('snakeHi') || '0');
  document.getElementById('hi-score').textContent = hiScore;

  // Food progress dots
  function buildFoodDots() {
    const container = document.getElementById('food-dots');
    container.innerHTML = '';
    for (let i = 0; i < FOOD_PER_LEVEL; i++) {
      const d = document.createElement('div');
      d.className = 'food-dot' + (i < foodTaken ? ' eaten' : '');
      container.appendChild(d);
    }
  }

  function updateFoodDots() {
    const dots = document.querySelectorAll('.food-dot');
    dots.forEach((d, i) => {
      if (i < foodTaken) d.classList.add('eaten');
    });
  }

  // UI updates
  function setScore(v) {
    score = v;
    const el = document.getElementById('score');
    el.textContent = v;
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
    if (v > hiScore) {
      hiScore = v;
      localStorage.setItem('snakeHi', hiScore);
      const hi = document.getElementById('hi-score');
      hi.textContent = hiScore;
      hi.classList.add('new-record');
      setTimeout(() => hi.classList.remove('new-record'), 2500);
    }
    document.getElementById('hi-score').textContent = hiScore;
  }

  function setLevel(v) {
    level = v;
    document.getElementById('level').textContent = v;
    const pct = (foodTaken / FOOD_PER_LEVEL) * 100;
    document.getElementById('level-bar').style.width = pct + '%';
  }

  function setStreak(v) {
    streak = v;
    const el = document.getElementById('streak');
    el.textContent = v;
    if (v > 0 && v % 3 === 0) {
      el.style.transform = 'scale(1.3)';
      setTimeout(() => el.style.transform = '', 300);
    }
  }

  function updateTimer() {
    if (!gameStartTime) return;
    const elapsed = Math.floor((Date.now() - gameStartTime) / 1000);
    const m = String(Math.floor(elapsed / 60)).padStart(2,'0');
    const s = String(elapsed % 60).padStart(2,'0');
    document.getElementById('timer').textContent = m + ':' + s;
  }

  // Overlay helpers
  function showOverlay(title, sub, extra) {
    const ov = document.getElementById('overlay');
    document.getElementById('overlay-title').textContent = title;
    document.getElementById('overlay-sub').textContent = sub;
    document.getElementById('overlay-extra').innerHTML = extra || '';
    ov.classList.remove('hidden');
  }

  function hideOverlay() {
    document.getElementById('overlay').classList.add('hidden');
  }

  function showCountdown(n) {
    const ov = document.getElementById('overlay');
    document.getElementById('overlay-title').textContent = '';
    document.getElementById('overlay-sub').textContent = '';
    document.getElementById('overlay-extra').innerHTML =
      `<div class="countdown-display">${n}</div>`;
    ov.classList.remove('hidden');
  }

  // Init / reset game data
  function initGame() {
    snake = [{ x: 20, y: 20 }, { x: 19, y: 20 }, { x: 18, y: 20 }];
    dir = { x: 1, y: 0 };
    nextDir = { x: 1, y: 0 };
    score = 0;
    level = 1;
    foodTaken = 0;
    streak = 0;
    baseSpeed = SPEED_MAP[selectedSpeed];
    document.getElementById('score').textContent = '0';
    document.getElementById('level').textContent = '1';
    document.getElementById('level-bar').style.width = '0%';
    document.getElementById('streak').textContent = '0';
    document.getElementById('snake-length').textContent = snake.length;
    document.getElementById('timer').textContent = '00:00';
    buildFoodDots();
    placeFood();
  }

  // Food placement
  function placeFood() {
    let pos;
    do {
      pos = {
        x: Math.floor(Math.random() * COLS),
        y: Math.floor(Math.random() * ROWS)
      };
    } while (snake.some(s => s.x === pos.x && s.y === pos.y));
    food = pos;
  }

  // Countdown -> start
  function startCountdown() {
    state = 'countdown';
    countdownVal = 3;
    showCountdown(countdownVal);
    const tick = () => {
      countdownVal--;
      if (countdownVal > 0) {
        showCountdown(countdownVal);
        setTimeout(tick, 800);
      } else {
        hideOverlay();
        beginPlay();
      }
    };
    setTimeout(tick, 800);
  }

  function beginPlay() {
    state = 'playing';
    gameStartTime = Date.now();
    timerInterval = setInterval(updateTimer, 1000);
    const speed = Math.max(60, baseSpeed - (level - 1) * 12);
    gameInterval = setInterval(gameTick, speed);
    document.getElementById('btn-pause').disabled = false;
  }

  function stopIntervals() {
    clearInterval(gameInterval);
    clearInterval(timerInterval);
    gameInterval = null;
    timerInterval = null;
  }

  // Main tick
  function gameTick() {
    dir = nextDir;

    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    // Wall collision
    if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) {
      gameover(); return;
    }

    // Self collision
    if (snake.some(s => s.x === head.x && s.y === head.y)) {
      gameover(); return;
    }

    const ate = head.x === food.x && head.y === food.y;
    snake.unshift(head);
    if (!ate) snake.pop();

    if (ate) {
      foodTaken++;
      setStreak(streak + 1);
      // Score: base + level bonus + streak bonus
      const bonus = Math.floor(streak * 2 * level);
      setScore(score + (level * 10) + bonus);
      document.getElementById('snake-length').textContent = snake.length;
      updateFoodDots();
      spawnParticles(food.x * SIZE + SIZE/2, food.y * SIZE + SIZE/2, '#ff3d71');

      if (foodTaken >= FOOD_PER_LEVEL) {
        stopIntervals();
        levelUp();
        return;
      }
      placeFood();
    }

    draw();
  }

  function levelUp() {
    level++;
    foodTaken = 0;
    buildFoodDots();
    setLevel(level);
    showOverlay('NIVEAU ' + level, 'Excellent ! Continue…', '');
    spawnParticles(200, 200, '#00ff9d', 20);
    setTimeout(() => {
      hideOverlay();
      const speed = Math.max(60, baseSpeed - (level - 1) * 12);
      timerInterval = setInterval(updateTimer, 1000);
      gameInterval = setInterval(gameTick, speed);
      state = 'playing';
      placeFood();
    }, 1800);
  }

  function gameover() {
    stopIntervals();
    state = 'dead';
    setStreak(0);

    // Death flash
    canvas.style.filter = 'brightness(3)';
    setTimeout(() => canvas.style.filter = '', 150);
    spawnParticles(snake[0].x * SIZE, snake[0].y * SIZE, '#ff3d71', 16);

    setTimeout(() => {
      showOverlay(
        'GAME OVER',
        'Niveau ' + level,
        `<div class="game-over-score">${score}</div>
         <div class="game-over-detail">points</div>
         <button class="btn btn-start" onclick="document.getElementById('btn-start').click()" style="margin-top:8px;padding:10px 28px">▶ REJOUER</button>`
      );
      document.getElementById('btn-pause').disabled = true;
    }, 400);
  }

  // Drawing
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw subtle grid
    ctx.strokeStyle = 'rgba(0,229,255,0.03)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(x * SIZE, 0);
      ctx.lineTo(x * SIZE, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * SIZE);
      ctx.lineTo(canvas.width, y * SIZE);
      ctx.stroke();
    }

    // Food glow
    const fx = food.x * SIZE + SIZE/2;
    const fy = food.y * SIZE + SIZE/2;
    const grd = ctx.createRadialGradient(fx, fy, 0, fx, fy, SIZE * 1.8);
    grd.addColorStop(0, 'rgba(255,61,113,0.35)');
    grd.addColorStop(1, 'rgba(255,61,113,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(food.x * SIZE - SIZE, food.y * SIZE - SIZE, SIZE * 3, SIZE * 3);

    // Food
    ctx.fillStyle = '#ff3d71';
    ctx.shadowColor = '#ff3d71';
    ctx.shadowBlur = 10;
    ctx.fillRect(food.x * SIZE + 1, food.y * SIZE + 1, SIZE - 2, SIZE - 2);
    ctx.shadowBlur = 0;

    // Snake body
    for (let i = snake.length - 1; i >= 0; i--) {
      const s = snake[i];
      const t = i / snake.length;
      if (i === 0) {
        // Head
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#00ff9d';
        ctx.shadowBlur = 12;
      } else {
        // Gradient from head to tail
        const r = Math.round(0 + t * 0);
        const g = Math.round(255 - t * 80);
        const b = Math.round(157 - t * 100);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.shadowColor = '#00ff9d';
        ctx.shadowBlur = 4 - t * 3;
      }
      const margin = i === 0 ? 0.5 : 1;
      ctx.fillRect(s.x * SIZE + margin, s.y * SIZE + margin, SIZE - margin * 2, SIZE - margin * 2);
    }
    ctx.shadowBlur = 0;

    // Eyes on head
    const hx = snake[0].x * SIZE;
    const hy = snake[0].y * SIZE;
    ctx.fillStyle = '#060d14';
    if (dir.x !== 0) {
      ctx.fillRect(hx + (dir.x > 0 ? 6 : 1), hy + 1, 2, 2);
      ctx.fillRect(hx + (dir.x > 0 ? 6 : 1), hy + 6, 2, 2);
    } else {
      ctx.fillRect(hx + 1, hy + (dir.y > 0 ? 6 : 1), 2, 2);
      ctx.fillRect(hx + 6, hy + (dir.y > 0 ? 6 : 1), 2, 2);
    }
  }

  // Particles
  function spawnParticles(x, y, color, count = 8) {
    const container = document.getElementById('particles');
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      const angle = (Math.PI * 2 / count) * i;
      const dist = 20 + Math.random() * 40;
      p.style.cssText = `
        left: ${x}px; top: ${y}px;
        background: ${color};
        box-shadow: 0 0 6px ${color};
        --tx: ${Math.cos(angle) * dist}px;
        --ty: ${Math.sin(angle) * dist}px;
      `;
      container.appendChild(p);
      setTimeout(() => p.remove(), 600);
    }
  }

  // Input
  document.addEventListener('keydown', e => {
    if (state !== 'playing' && state !== 'paused') {
      if ((e.key === 'Enter' || e.key === ' ') && state !== 'countdown') {
        document.getElementById('btn-start').click();
      }
      return;
    }
    switch(e.key) {
      case 'ArrowLeft':  case 'a': if (dir.x !== 1)  nextDir = {x:-1,y:0}; break;
      case 'ArrowRight': case 'd': if (dir.x !== -1) nextDir = {x:1,y:0};  break;
      case 'ArrowUp':    case 'w': if (dir.y !== 1)  nextDir = {x:0,y:-1}; break;
      case 'ArrowDown':  case 's': if (dir.y !== -1) nextDir = {x:0,y:1};  break;
      case 'p': case 'P': togglePause(); break;
      case 'r': case 'R': document.getElementById('btn-start').click(); break;
    }
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) e.preventDefault();
  });

  // Touch D-pad
  function bindDpad(id, dx, dy) {
    document.getElementById(id).addEventListener('touchstart', e => {
      e.preventDefault();
      if (dir.x !== -dx || dir.y !== -dy) nextDir = {x:dx, y:dy};
    }, { passive: false });
  }
  bindDpad('d-up', 0, -1);
  bindDpad('d-down', 0, 1);
  bindDpad('d-left', -1, 0);
  bindDpad('d-right', 1, 0);

  // Buttons
  document.getElementById('btn-start').addEventListener('click', () => {
    if (state === 'countdown') return;
    stopIntervals();
    initGame();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    startCountdown();
  });

  document.getElementById('btn-pause').addEventListener('click', togglePause);

  function togglePause() {
    if (state === 'playing') {
      state = 'paused';
      stopIntervals();
      showOverlay('PAUSE', 'Appuie sur P pour reprendre', '');
    } else if (state === 'paused') {
      hideOverlay();
      state = 'playing';
      const speed = Math.max(60, baseSpeed - (level - 1) * 12);
      timerInterval = setInterval(updateTimer, 1000);
      gameInterval = setInterval(gameTick, speed);
    }
  }

  // Speed buttons
  document.querySelectorAll('.speed-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedSpeed = btn.dataset.speed;
      baseSpeed = SPEED_MAP[selectedSpeed];
    });
  });

  // Initial screen
  showOverlay('SNAKE', 'Appuie sur JOUER pour commencer', '');

})();