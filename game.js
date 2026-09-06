(() => {
  'use strict';

  // ---------- DOM ----------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const levelEl = document.getElementById('level');
  const shotsEl = document.getElementById('shots');
  const hintEl = document.getElementById('hint');
  const startScreen = document.getElementById('startScreen');
  const gameOverScreen = document.getElementById('gameOverScreen');
  const finalText = document.getElementById('finalText');
  const finalScore = document.getElementById('finalScore');
  const finalBest = document.getElementById('finalBest');
  const finalShots = document.getElementById('finalShots');
  const goalBanner = document.getElementById('goalBanner');
  const saveBanner = document.getElementById('saveBanner');
  const playBtn = document.getElementById('playBtn');
  const restartBtn = document.getElementById('restartBtn');

  // ---------- State ----------
  const STATE = { READY: 'ready', AIMING: 'aiming', FLYING: 'flying', RESOLVED: 'resolved' };

  const game = {
    state: STATE.READY,
    score: 0,
    best: +(localStorage.getItem('pf_best') || 0),
    level: 1,
    shotsLeft: 5,
    levelGoals: 0,
    levelTarget: 3,
    keeperReaction: 0.42, // fraction of predicted time before keeper commits
    keeperSpeed: 1.0,
  };

  const field = {
    w: 0, h: 0, dpr: 1,
    goalX: 0, goalY: 0, goalW: 0, goalH: 0,
    goalLineY: 0,
    groundY: 0,
    ballRadius: 0,
    ballRest: { x: 0, y: 0 },
    keeperX: 0, keeperY: 0, keeperW: 0, keeperH: 0,
    keeperBaseY: 0,
    keeperTargetX: 0,
  };

  const ball = {
    x: 0, y: 0, vx: 0, vy: 0, r: 18,
    spin: 0,
    trail: [],
  };

  const drag = {
    active: false,
    startX: 0, startY: 0,
    currentX: 0, currentY: 0,
    pointerId: null,
  };

  // ---------- Sizing ----------
  function resize() {
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    field.dpr = dpr;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    field.w = rect.width;
    field.h = rect.height;

    // Goal: upper 38% of pitch, full width minus margins
    const goalTop = field.h * 0.12;
    const goalHeight = field.h * 0.22;
    const goalMargin = field.w * 0.08;
    field.goalX = goalMargin;
    field.goalY = goalTop;
    field.goalW = field.w - 2 * goalMargin;
    field.goalH = goalHeight;
    field.goalLineY = goalTop + goalHeight; // line ball must cross

    // Ground / ball rest
    field.groundY = field.h * 0.86;
    field.ballRest = { x: field.w / 2, y: field.groundY - 24 };
    ball.r = Math.max(14, Math.min(20, field.w * 0.025));
    ball.x = field.ballRest.x;
    ball.y = field.ballRest.y;

    // Keeper size scales with goal height
    field.keeperH = goalHeight * 0.92;
    field.keeperW = field.keeperH * 0.7;
    field.keeperBaseY = goalTop + goalHeight - field.keeperH / 2;
    field.keeperX = field.w / 2;
    field.keeperY = field.keeperBaseY;
    field.keeperTargetX = field.keeperX;
  }

  window.addEventListener('resize', resize);

  // ---------- Drawing ----------
  function drawPitch() {
    // Sky-ish grass top gradient
    const g = ctx.createLinearGradient(0, 0, 0, field.h);
    g.addColorStop(0, '#0e8f44');
    g.addColorStop(1, '#064826');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, field.w, field.h);

    // Mowed stripes
    const stripeCount = 8;
    for (let i = 0; i < stripeCount; i++) {
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.05)';
      ctx.fillRect(0, (field.h / stripeCount) * i, field.w, field.h / stripeCount);
    }

    // Penalty box outline (decorative)
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 2;
    const box = {
      x: field.w * 0.18,
      y: field.goalLineY,
      w: field.w * 0.64,
      h: field.h * 0.34,
    };
    ctx.strokeRect(box.x, box.y, box.w, box.h);

    // Goal frame
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    // Posts and crossbar
    ctx.moveTo(field.goalX, field.goalY);
    ctx.lineTo(field.goalX, field.goalY + field.goalH);
    ctx.moveTo(field.goalX + field.goalW, field.goalY);
    ctx.lineTo(field.goalX + field.goalW, field.goalY + field.goalH);
    ctx.moveTo(field.goalX, field.goalY);
    ctx.lineTo(field.goalX + field.goalW, field.goalY);
    // Crossbar underside shadow
    ctx.stroke();
    ctx.restore();

    // Net (simple hatch)
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    const netStep = 14;
    ctx.beginPath();
    for (let x = field.goalX; x <= field.goalX + field.goalW; x += netStep) {
      ctx.moveTo(x, field.goalY);
      ctx.lineTo(x, field.goalY + field.goalH);
    }
    for (let y = field.goalY; y <= field.goalY + field.goalH; y += netStep) {
      ctx.moveTo(field.goalX, y);
      ctx.lineTo(field.goalX + field.goalW, y);
    }
    ctx.stroke();
    ctx.restore();

    // Ground line near ball
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, field.groundY);
    ctx.lineTo(field.w, field.groundY);
    ctx.stroke();
    ctx.restore();
  }

  function drawKeeper() {
    const { keeperX, keeperY, keeperW, keeperH } = field;
    ctx.save();
    // Body (jersey)
    const bodyW = keeperW * 0.85;
    const bodyH = keeperH * 0.7;
    ctx.fillStyle = '#f4d35e';
    roundRect(keeperX - bodyW / 2, keeperY - bodyH / 2, bodyW, bodyH, 12);
    ctx.fill();

    // Number
    ctx.fillStyle = '#222';
    ctx.font = `bold ${Math.floor(bodyH * 0.45)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(game.level), keeperX, keeperY + 2);

    // Arms (long, dramatic)
    const armW = bodyW * 0.28;
    const armH = bodyH * 1.05;
    ctx.fillStyle = '#f4d35e';
    roundRect(keeperX - bodyW / 2 - armW * 0.65, keeperY - armH / 2 + 4, armW, armH, 8);
    ctx.fill();
    roundRect(keeperX + bodyW / 2 - armW * 0.35, keeperY - armH / 2 + 4, armW, armH, 8);
    ctx.fill();

    // Gloves
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(keeperX - bodyW / 2 - armW * 0.65 + armW / 2,
            keeperY - armH / 2 + armH - 4, armW * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(keeperX + bodyW / 2 - armW * 0.35 + armW / 2,
            keeperY - armH / 2 + armH - 4, armW * 0.55, 0, Math.PI * 2);
    ctx.fill();

    // Head
    const headR = bodyH * 0.28;
    ctx.fillStyle = '#f1c27d';
    ctx.beginPath();
    ctx.arc(keeperX, keeperY - bodyH / 2 - headR * 0.6, headR, 0, Math.PI * 2);
    ctx.fill();

    // Shorts (lower body)
    ctx.fillStyle = '#222';
    const shortsW = bodyW * 0.7;
    const shortsH = keeperH - bodyH;
    roundRect(keeperX - shortsW / 2, keeperY + bodyH / 2 - 4, shortsW, shortsH, 8);
    ctx.fill();

    ctx.restore();
  }

  function drawBall() {
    ctx.save();
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(ball.x, ball.y + ball.r * 1.2, ball.r * 0.9, ball.r * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ball body
    const r = ball.r;
    ctx.translate(ball.x, ball.y);
    ctx.rotate(ball.spin);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    // Pentagon pattern
    ctx.fillStyle = '#222';
    const pentR = r * 0.32;
    const positions = [
      [0, 0],
      [r * 0.55, -r * 0.2],
      [r * 0.35, r * 0.45],
      [-r * 0.35, r * 0.45],
      [-r * 0.55, -r * 0.2],
    ];
    positions.forEach(([px, py]) => {
      drawPentagon(px, py, pentR);
    });

    ctx.restore();

    // Trail
    if (ball.trail.length > 1) {
      ctx.save();
      ctx.lineCap = 'round';
      for (let i = 0; i < ball.trail.length - 1; i++) {
        const a = ball.trail[i];
        const b = ball.trail[i + 1];
        const t = i / ball.trail.length;
        ctx.strokeStyle = `rgba(255,255,255,${0.05 + t * 0.25})`;
        ctx.lineWidth = 4 + t * 4;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawPentagon(cx, cy, r) {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const ang = -Math.PI / 2 + i * (Math.PI * 2 / 5);
      const x = cx + Math.cos(ang) * r;
      const y = cy + Math.sin(ang) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }

  function roundRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawAim() {
    if (drag.active) {
      ctx.save();
      // Slingshot line
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ball.x, ball.y);
      ctx.lineTo(drag.currentX, drag.currentY);
      ctx.stroke();

      // Pull-back indicator
      const dx = ball.x - drag.currentX;
      const dy = ball.y - drag.currentY;
      const power = Math.min(1, Math.hypot(dx, dy) / 220);

      ctx.strokeStyle = `rgba(255, ${Math.floor(255 - power * 120)}, 80, 0.95)`;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(ball.x, ball.y);
      ctx.lineTo(ball.x + dx * 1.6, ball.y + dy * 1.6);
      ctx.stroke();
      ctx.setLineDash([]);

      // Power bar
      const barW = 140;
      const barH = 10;
      const barX = ball.x - barW / 2;
      const barY = ball.y + ball.r + 18;
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      roundRect(barX, barY, barW, barH, 5);
      ctx.fill();
      ctx.fillStyle = `hsl(${Math.floor(140 - power * 140)}, 80%, 55%)`;
      roundRect(barX, barY, barW * power, barH, 5);
      ctx.fill();
      ctx.restore();
    }
  }

  // ---------- Input ----------
  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left),
      y: (e.clientY - rect.top),
    };
  }

  function onDown(e) {
    if (game.state !== STATE.READY) return;
    const p = getPos(e);
    const dx = p.x - ball.x;
    const dy = p.y - ball.y;
    if (Math.hypot(dx, dy) > ball.r + 30) return;
    drag.active = true;
    drag.startX = ball.x;
    drag.startY = ball.y;
    drag.currentX = p.x;
    drag.currentY = p.y;
    drag.pointerId = e.pointerId;
    canvas.setPointerCapture?.(e.pointerId);
    game.state = STATE.AIMING;
    if (hintEl) hintEl.style.opacity = '0';
    e.preventDefault();
  }

  function onMove(e) {
    if (!drag.active || game.state !== STATE.AIMING) return;
    if (drag.pointerId !== null && e.pointerId !== drag.pointerId) return;
    const p = getPos(e);
    // Clamp the pull so the user can't yank the ball off-screen
    const dx = p.x - ball.x;
    const dy = p.y - ball.y;
    const maxPull = 200;
    const dist = Math.hypot(dx, dy);
    if (dist > maxPull) {
      const k = maxPull / dist;
      drag.currentX = ball.x + dx * k;
      drag.currentY = ball.y + dy * k;
    } else {
      drag.currentX = p.x;
      drag.currentY = p.y;
    }
    e.preventDefault();
  }

  function onUp(e) {
    if (!drag.active) return;
    if (drag.pointerId !== null && e.pointerId !== drag.pointerId && e.pointerId !== undefined) return;
    const dx = ball.x - drag.currentX;
    const dy = ball.y - drag.currentY;
    const power = Math.hypot(dx, dy);
    drag.active = false;
    drag.pointerId = null;
    if (power < 18) {
      // tap, not a flick
      game.state = STATE.READY;
      return;
    }
    shoot(dx, dy, power);
    e.preventDefault?.();
  }

  function shoot(pullDx, pullDy, pullMag) {
    const maxPull = 200;
    const power = Math.min(1, pullMag / maxPull);
    // Map pull to launch velocity. The harder you pull back, the harder the kick.
    const launchSpeed = 620 + power * 880; // px/s
    // Slight upward lift on weak shots; arcing on stronger ones
    const lift = -260 - power * 380;
    // Direction: opposite of pull
    const ang = Math.atan2(pullDy, pullDx);
    ball.vx = Math.cos(ang) * launchSpeed;
    ball.vy = Math.sin(ang) * launchSpeed + lift; // bias upward
    // Scale: longer pull = faster
    const k = launchSpeed / Math.hypot(ball.vx, ball.vy - lift);
    ball.vx *= k; ball.vy = (ball.vy - lift) * k + lift;

    ball.spin = 0;
    ball.trail.length = 0;
    game.state = STATE.FLYING;
    game.keeperTargetX = predictKeeperTarget();
  }

  function predictKeeperTarget() {
    // Simulate ball trajectory briefly with current physics and return
    // the X where the ball crosses the keeper's Y plane.
    const sim = { x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy };
    const dt = 1 / 60;
    let safety = 240; // ~4 seconds
    while (safety-- > 0) {
      sim.vy += GRAVITY * dt;
      sim.x += sim.vx * dt;
      sim.y += sim.vy * dt;
      if (sim.y > field.keeperBaseY - field.keeperH * 0.1) {
        // clamp inside goal horizontally
        const clamped = Math.max(field.goalX + field.keeperW / 2,
                                  Math.min(field.goalX + field.goalW - field.keeperW / 2, sim.x));
        return clamped;
      }
      if (sim.y < -50) break;
    }
    return field.w / 2;
  }

  // ---------- Physics ----------
  const GRAVITY = 1400; // px/s^2

  function update(dt) {
    if (game.state !== STATE.FLYING) return;

    // Move ball
    ball.vy += GRAVITY * dt;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.spin += (ball.vx * dt) / ball.r;
    ball.trail.push({ x: ball.x, y: ball.y });
    if (ball.trail.length > 18) ball.trail.shift();

    // Move keeper toward predicted target
    const target = game.keeperTargetX;
    const dx = target - field.keeperX;
    const move = Math.sign(dx) * Math.min(Math.abs(dx), field.keeperW * 4 * dt * game.keeperSpeed);
    field.keeperX += move;

    // Bounce off side walls (post collisions)
    if (ball.x - ball.r < 0 && ball.y < field.goalLineY + 4) {
      ball.x = ball.r;
      ball.vx = Math.abs(ball.vx) * 0.55;
    } else if (ball.x + ball.r > field.w && ball.y < field.goalLineY + 4) {
      ball.x = field.w - ball.r;
      ball.vx = -Math.abs(ball.vx) * 0.55;
    }

    // Goal collisions (top crossbar)
    if (ball.y - ball.r < field.goalY &&
        ball.x > field.goalX && ball.x < field.goalX + field.goalW) {
      ball.y = field.goalY + ball.r;
      ball.vy = Math.abs(ball.vy) * 0.4;
      ball.vx *= 0.85;
    }

    // Goal detection
    if (ball.y - ball.r <= field.goalLineY &&
        ball.x > field.goalX && ball.x < field.goalX + field.goalW) {
      const inGoalVertically = ball.y < field.goalY + field.goalH + 6 && ball.y > field.goalY - 6;
      const crossedDown = ball.vy > 0 || ball.y < field.goalY + 4;
      if (inGoalVertically && crossedDown) {
        // Check keeper save
        const keeperBox = {
          x: field.keeperX - field.keeperW / 2,
          y: field.keeperY - field.keeperH / 2,
          w: field.keeperW,
          h: field.keeperH,
        };
        const ballBox = { x: ball.x - ball.r, y: ball.y - ball.r, w: ball.r * 2, h: ball.r * 2 };
        const overlap = !(keeperBox.x + keeperBox.w < ballBox.x ||
                          keeperBox.x > ballBox.x + ballBox.w ||
                          keeperBox.y + keeperBox.h < ballBox.y ||
                          keeperBox.y > ballBox.y + ballBox.h);

        // Small ball near keeper + close enough to gloves counts as save
        const distToKeeper = Math.hypot(ball.x - field.keeperX, ball.y - field.keeperY);
        if (overlap || distToKeeper < field.keeperW * 0.55) {
          resolve(false, true);
        } else {
          resolve(true, false);
        }
        return;
      }
    }

    // Out of bounds
    if (ball.y > field.groundY + ball.r + 8 || ball.x < -ball.r || ball.x > field.w + ball.r) {
      resolve(false, false);
      return;
    }
  }

  function resolve(isGoal, isSave) {
    game.state = STATE.RESOLVED;
    if (isGoal) {
      game.score++;
      game.levelGoals++;
      game.best = Math.max(game.best, game.score);
      localStorage.setItem('pf_best', String(game.best));
      showBanner(goalBanner);
      // Continue if level not done
      if (game.levelGoals >= game.levelTarget) {
        // Next level after a beat
        setTimeout(() => {
          game.level++;
          game.shotsLeft = 5;
          game.levelGoals = 0;
          game.levelTarget = 3 + Math.floor(game.level * 0.5);
          game.keeperSpeed = 1 + (game.level - 1) * 0.18;
          game.keeperReaction = Math.max(0.2, 0.42 - (game.level - 1) * 0.025);
          resetForNextShot();
          updateHUD();
        }, 900);
      } else {
        setTimeout(() => {
          game.shotsLeft--;
          resetForNextShot();
          updateHUD();
        }, 700);
      }
    } else if (isSave) {
      showBanner(saveBanner);
      setTimeout(() => {
        game.shotsLeft--;
        resetForNextShot();
        updateHUD();
      }, 900);
    } else {
      // Miss / wide
      game.shotsLeft--;
      setTimeout(() => {
        resetForNextShot();
        updateHUD();
      }, 600);
    }
    updateHUD();
    checkGameOver();
  }

  function showBanner(el) {
    el.classList.remove('show');
    void el.offsetWidth; // restart animation
    el.classList.add('show');
  }

  function resetForNextShot() {
    ball.x = field.ballRest.x;
    ball.y = field.ballRest.y;
    ball.vx = 0; ball.vy = 0;
    ball.spin = 0;
    ball.trail.length = 0;
    field.keeperX = field.w / 2;
    field.keeperY = field.keeperBaseY;
    game.keeperTargetX = field.w / 2;
    game.state = STATE.READY;
  }

  function updateHUD() {
    scoreEl.textContent = game.score;
    bestEl.textContent = game.best;
    levelEl.textContent = game.level;
    shotsEl.textContent = Math.max(0, game.shotsLeft);
  }

  function checkGameOver() {
    if (game.shotsLeft <= 0 && game.state === STATE.READY) {
      finalScore.textContent = game.score;
      finalBest.textContent = game.best;
      finalShots.textContent = (game.level - 1) * 5 + (5 - game.shotsLeft);
      finalText.textContent = `You scored ${game.score} ${game.score === 1 ? 'goal' : 'goals'}.`;
      gameOverScreen.hidden = false;
    }
  }

  // ---------- Game loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.04, (now - last) / 1000);
    last = now;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  function render() {
    ctx.clearRect(0, 0, field.w, field.h);
    drawPitch();
    drawKeeper();
    drawAim();
    drawBall();
  }

  // ---------- Pointer wiring ----------
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  // ---------- Buttons ----------
  function startGame() {
    game.score = 0;
    game.level = 1;
    game.shotsLeft = 5;
    game.levelGoals = 0;
    game.levelTarget = 3;
    game.keeperSpeed = 1;
    game.keeperReaction = 0.42;
    updateHUD();
    startScreen.style.display = 'none';
    gameOverScreen.hidden = true;
    resetForNextShot();
    if (hintEl) hintEl.style.opacity = '1';
  }

  playBtn.addEventListener('click', startGame);
  restartBtn.addEventListener('click', () => {
    gameOverScreen.hidden = true;
    startGame();
  });

  // ---------- Boot ----------
  resize();
  updateHUD();
  ball.x = field.ballRest.x;
  ball.y = field.ballRest.y;
  requestAnimationFrame((t) => { last = t; frame(t); });

  // ---------- PWA: Service worker ----------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline optional */ });
    });
  }
})();