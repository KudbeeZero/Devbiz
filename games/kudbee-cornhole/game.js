/* =====================================================================
 * Kudbee Cornhole — game.js
 * A neon cornhole (bag-toss) game with REAL physics. You drag back from
 * the bag to aim (slingshot style) and release to throw. The bag flies a
 * true parabolic arc under gravity, spins, hits the wooden board with a
 * scrunch (deformation), skids with friction, and either drops in the hole
 * (3 pts) or sticks on the board (1 pt).
 *
 * ZERO-BUILD: vanilla JS + Canvas 2D. Loads shared core-util first.
 * ===================================================================== */
(function (KC) {
  'use strict';
  const E = window.KudbeeEngine || {};
  const TAU = Math.PI * 2;

  KC.Util = Object.assign({}, E.coreUtil || {}, {
    clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; },
    lerp(a, b, t) { return a + (b - a) * t; },
    rand(min, max) { return min + Math.random() * (max - min); },
    randInt(min, max) { return Math.floor(min + Math.random() * (max - min + 1)); },
    pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
    smooth(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); },
    gauss() { let u = 0, v = 0; while (u === 0) u = Math.random(); while (v === 0) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); },
  });

  const VIEW_W = 960, VIEW_H = 680;
  const C = { cyan: '#39e6ff', violet: '#c46bff', green: '#7CFFb2', gold: '#ffd34d', ember: '#ff7a2d', text: '#dfeaff', dim: '#8a93a8' };

  // Particle system for impacts and scoring
  class Particle {
    constructor(x, y, vx, vy, life, col, spin) {
      this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.life = life; this.maxLife = life; this.col = col;
      this.rot = spin != null ? Math.random() * Math.PI * 2 : null; this.spin = spin;
    }
    update(dt) {
      this.x += this.vx * dt; this.y += this.vy * dt; this.life -= dt;
      if (this.spin != null) { this.rot += this.spin * dt; this.vy += 220 * dt; this.vx *= 0.99; }
    }
    draw(ctx) {
      const a = Math.max(0, this.life / this.maxLife); ctx.globalAlpha = a; ctx.fillStyle = this.col;
      if (this.spin != null) {
        ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.rot);
        ctx.fillRect(-4, -2, 8, 4); ctx.restore();
      } else { ctx.beginPath(); ctx.arc(this.x, this.y, 2, 0, 7); ctx.fill(); }
    }
  }

  // World geometry (logical units). Side view: thrower left, board right+up.
  const GROUND_Y = 560;
  const BOARD_X = 760;            // board near-edge x
  const BOARD_W = 150;            // board length (along throw axis, drawn as depth)
  const BOARD_T = 14;             // board thickness
  const BOARD_H = 90;             // board top height above ground (angled)
  const HOLE_R = 26;              // hole radius
  const HOLE_X = BOARD_X + 40;    // hole centre x
  const GRAV = 1500;              // px/s^2
  const BAG = 22;                 // bag half-size (square)

  // ===================================================================
  // AUDIO — procedural: wood thud, bag skid, hollow hole drop, whoosh.
  // ===================================================================
  function Audio() { this.enabled = true; this.ctx = null; this.master = null; }
  Audio.prototype._ensure = function () {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(this.ctx.destination);
  };
  Audio.prototype.toggle = function () { this.enabled = !this.enabled; if (this.master) this.master.gain.value = this.enabled ? 0.5 : 0; };
  Audio.prototype._tone = function (f, dur, type, vol, slide) {
    if (!this.enabled) return; this._ensure(); if (!this.ctx) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.3, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  };
  Audio.prototype._noise = function (dur, vol, hp, lp) {
    if (!this.enabled) return; this._ensure(); if (!this.ctx) return;
    const t = this.ctx.currentTime, n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass';
    f.frequency.value = (hp + lp) / 2; f.Q.value = 0.8;
    const g = this.ctx.createGain(); g.gain.value = vol || 0.3;
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t);
  };
  Audio.prototype.whoosh = function () { this._noise(0.22, 0.15, 600, 2200); };
  Audio.prototype.woodThud = function (power) {
    this._tone(140 + power * 80, 0.14, 'triangle', 0.3 + power * 0.25, 60);
    this._noise(0.1, 0.25, 500, 1400);
  };
  Audio.prototype.skid = function () { this._noise(0.25, 0.12, 1800, 4500); };
  Audio.prototype.holeDrop = function () {
    this._tone(280, 0.22, 'sine', 0.35, 75);   // satisfying hollow drop
    this._noise(0.12, 0.18, 700, 2200);
    this._tone(140, 0.15, 'sine', 0.25, null);
  };
  Audio.prototype.scoreJingle = function (pts) {
    const base = pts >= 3 ? 660 : 520;
    this._tone(base, 0.12, 'square', 0.15);
    setTimeout(() => this._tone(base * 1.5, 0.15, 'square', 0.15), 90);
  };
  Audio.prototype.uiTick = function () { this._tone(660, 0.04, 'sine', 0.1); };

  // ===================================================================
  // INPUT — slingshot drag: press on bag, drag back, release to throw.
  // ===================================================================
  function Input(canvas) {
    this.canvas = canvas; this.pointer = { down: false, x: 0, y: 0, sx: 0, sy: 0, justDown: false, justUp: false };
    const toL = (cx, cy) => { const r = canvas.getBoundingClientRect(); return { x: (cx - r.left) * (canvas.width / r.width), y: (cy - r.top) * (canvas.height / r.height) }; };
    const self = this;
    const down = (cx, cy) => { const p = toL(cx, cy); self.pointer.down = true; self.pointer.sx = self.pointer.x = p.x; self.pointer.sy = self.pointer.y = p.y; self.pointer.justDown = true; };
    const move = (cx, cy) => { if (self.pointer.down) { const p = toL(cx, cy); self.pointer.x = p.x; self.pointer.y = p.y; } };
    const up = () => { if (self.pointer.down) { self.pointer.down = false; self.justUp = true; } };
    if (window.PointerEvent) {
      canvas.addEventListener('pointerdown', e => { e.preventDefault(); down(e.clientX, e.clientY); });
      canvas.addEventListener('pointermove', e => { e.preventDefault(); move(e.clientX, e.clientY); }, { passive: false });
      window.addEventListener('pointerup', up);
    } else {
      canvas.addEventListener('mousedown', e => { down(e.clientX, e.clientY); });
      window.addEventListener('mousemove', e => { move(e.clientX, e.clientY); });
      window.addEventListener('mouseup', up);
    }
    this.endFrame = function () { this.pointer.justDown = false; this.pointer.justUp = false; };
  }

  // ===================================================================
  // GAME
  // ===================================================================
  function Game(opts) {
    this.canvas = opts.canvas; this.ctx = this.canvas.getContext('2d');
    this.viewW = VIEW_W; this.viewH = VIEW_H; this.canvas.width = VIEW_W; this.canvas.height = VIEW_H;
    this.time = 0; this.audio = new Audio(); this.input = new Input(this.canvas);
    this.reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.state = 'menu';         // menu | play | over
    this.particles = [];
    this.reset();
  }
  Game.prototype.reset = function () {
    this.bag = { x: 150, y: GROUND_Y - BAG, vx: 0, vy: 0, spin: 0, rot: 0, air: true, squash: 0, skid: 0, rest: false, gone: false };
    this.aiming = false; this.power = 0; this.aimAng = -0.4;
    this.score = 0; this.round = 0; this.maxRounds = 8; this.bagsLeft = 8;
    this.phase = 'aim';          // aim | fly | settle
    this.banner = ''; this.flash = 0; this.shake = 0; this.lastPts = 0; this._scorePops = [];
    this.streak = 0; this.bestStreak = 0; this.hitStopT = 0; this._scoredThisThrow = false;
  };
  Game.prototype.start = function () { this._last = performance.now() / 1000; requestAnimationFrame(this._frame.bind(this)); };

  Game.prototype._frame = function () {
    const now = performance.now() / 1000; let dt = Math.min(0.05, now - this._last); this._last = now; this.time += dt;
    // hit-stop: brief near-freeze sells the impact of a hole drop without a real pause.
    if (this.hitStopT > 0 && !this.reduceMotion) { this.hitStopT -= dt; dt *= 0.06; }
    this.update(dt); this.render(); this.input.endFrame();
    requestAnimationFrame(this._frame.bind(this));
  };
  Game.prototype._triggerHitStop = function (dur) { if (!this.reduceMotion) this.hitStopT = Math.max(this.hitStopT, dur); };

  Game.prototype.update = function (dt) {
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 1.5);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 2);
    // particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      this.particles[i].update(dt);
      if (this.particles[i].life <= 0) this.particles.splice(i, 1);
    }
    // score pops
    for (let i = this._scorePops.length - 1; i >= 0; i--) {
      const p = this._scorePops[i]; p.life -= dt; p.y += p.vy * dt; p.vy *= 0.92;
      if (p.life <= 0) this._scorePops.splice(i, 1);
    }
    if (this.state === 'menu') { if (this.input.pointer.justDown) { this.audio.uiTick(); this.state = 'play'; this.reset(); } }
    else if (this.state === 'play') this._updatePlay(dt);
    else if (this.state === 'over') { if (this.input.pointer.justDown) { this.audio.uiTick(); this.reset(); this.state = 'play'; } }
  };

  Game.prototype._updatePlay = function (dt) {
    const I = this.input.pointer, b = this.bag;
    if (this.phase === 'aim') {
      // slingshot: press near bag, drag back, release to launch
      if (I.justDown && Math.hypot(I.x - b.x, I.y - (b.y + BAG)) < 60) { this.aiming = true; this.audio.uiTick(); }
      if (this.aiming) {
        const dx = I.sx - I.x, dy = I.sy - I.y;        // pull vector (back = positive power)
        this.power = KC.Util.clamp(Math.sqrt(dx * dx + dy * dy) / 280, 0, 1);
        this.aimAng = Math.atan2(dy, dx);
      }
      if (I.justUp && this.aiming) {
        this.aiming = false;
        if (this.power > 0.06) {
          const spd = this.power * 1500;
          b.vx = Math.cos(this.aimAng) * spd; b.vy = Math.sin(this.aimAng) * spd;
          b.spin = this.power * 12 * KC.Util.sign(b.vx || 1); b.air = true; b.squash = 0;
          this.phase = 'fly'; this.audio.whoosh();
        }
      }
    } else if (this.phase === 'fly') {
      b.vy += GRAV * dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.rot += b.spin * dt;
      // ground collision
      if (b.y >= GROUND_Y - BAG) {
        b.y = GROUND_Y - BAG; b.vy = -b.vy * 0.25; b.vx *= 0.7; b.squash = 1;
        if (Math.abs(b.vy) < 60) { b.vy = 0; this._enterSettle(); }
        else this.audio.woodThud(KC.Util.clamp(Math.abs(b.vy) / 600, 0, 1));
      }
      // board top collision (front edge then surface)
      const topY = GROUND_Y - BOARD_H;
      const overBoardX = b.x > BOARD_X - BAG * 0.5 && b.x < BOARD_X + BOARD_W + BAG * 0.5;
      if (overBoardX && b.vy > 0) {
        const bagBottom = b.y + BAG;
        const overHole = Math.abs(b.x - HOLE_X) < HOLE_R - 4;
        // descending onto the board surface (or into the hole)
        if (bagBottom > topY - 6 && bagBottom < topY + BOARD_T + 30) {
          if (overHole && b.vy < 950) { this._score(3); return; }
          // land on the board surface
          this._emitParticles(b.x, topY + 5, C.amber, 4);
          b.y = topY - BAG; b.vy = -b.vy * 0.18; b.vx *= 0.5; b.squash = 1; b.spin *= 0.4;
          this.audio.woodThud(KC.Util.clamp(Math.abs(b.vy) / 500, 0, 1));
          if (Math.abs(b.vy) < 45) { b.vy = 0; this._enterSettle(); }
        }
      }
      // off the back / fell off
      if (b.x > VIEW_W + 40 || b.x < -40) { this._enterSettle(); }
    } else if (this.phase === 'settle') {
      // friction on board or ground, bag scrunch relaxes
      b.squash = KC.Util.lerp(b.squash, 0, 1 - Math.pow(0.001, dt));
      if (Math.abs(b.vx) > 5) { b.vx *= 0.86; b.x += b.vx * dt; b.rot += b.spin * dt; }
      else { b.vx = 0; this._finalizeThrow(); }
      // slid into hole?
      if (b.rest !== false) {
        const overHole = Math.abs(b.x - HOLE_X) < HOLE_R - 6 && b.y < GROUND_Y - 10;
        if (overHole && !b.gone) { b.gone = true; this._score(3); }
        // slid off board back edge
        if (b.x > BOARD_X + BOARD_W && b.y > GROUND_Y - 30) { this._finalizeThrow(); }
      }
    }
    // squash visual always relaxes toward 0 in fly too
    if (this.phase === 'fly') b.squash = KC.Util.lerp(b.squash, 0, 1 - Math.pow(0.02, dt));
  };

  Game.prototype._enterSettle = function () {
    this.phase = 'settle';
    const b = this.bag;
    const onBoard = b.x > BOARD_X - BAG && b.x < BOARD_X + BOARD_W + BAG && b.y < GROUND_Y - 20;
    if (onBoard && !b.gone) { b.rest = 'board'; }
    else b.rest = 'ground';
  };

  Game.prototype._emitParticles = function (x, y, col, count) {
    if (this.reduceMotion) return;
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2, sp = 50 + Math.random() * 100;
      this.particles.push(new Particle(x, y, Math.cos(ang) * sp, Math.sin(ang) * sp, 0.6, col));
    }
  };
  // confetti: tumbling rectangles with gravity + drift — reserved for the hole drop (3pt),
  // distinct from the small round impact sparks above.
  Game.prototype._emitConfetti = function (x, y, count) {
    if (this.reduceMotion) return;
    const cols = [C.gold, C.cyan, C.green, C.text];
    for (let i = 0; i < count; i++) {
      const ang = KC.Util.rand(-Math.PI, 0), sp = KC.Util.rand(100, 340);
      this.particles.push(new Particle(x, y, Math.cos(ang) * sp * 0.6, Math.sin(ang) * sp, KC.Util.rand(0.9, 1.4), KC.Util.pick(cols), KC.Util.rand(-8, 8)));
    }
  };
  Game.prototype._score = function (pts) {
    this.streak++; this.bestStreak = Math.max(this.bestStreak, this.streak); this._scoredThisThrow = true;
    // Apply multiplier for hole drops based on streak: 1x @ streak 1, 1.5x @ 3, 2x @ 5+
    let mult = 1;
    if (pts >= 3) {
      mult = this.streak >= 5 ? 2.0 : this.streak >= 3 ? 1.5 : 1.0;
      pts = Math.round(pts * mult);
    }
    this.score += pts; this.lastPts = pts; this.flash = 1; this.shake = pts >= 3 ? 0.5 : 0.2;
    if (pts >= 3) {
      this.audio.holeDrop(); this._triggerHitStop(0.12);
      // bigger confetti + extra flash for multiplier kicks
      const confettiCount = this.streak >= 5 ? 80 : this.streak >= 3 ? 56 : 36;
      this._emitConfetti(this.bag.x, this.bag.y, confettiCount);
      if (mult > 1) { this.flash = Math.max(this.flash, 1.8); this.shake = Math.max(this.shake, 0.75); }
    } else {
      this.audio.skid();
    }
    this.audio.scoreJingle(pts);
    this.bag.gone = true;
    this._emitParticles(this.bag.x, this.bag.y, pts >= 3 ? C.gold : C.green, pts >= 3 ? 16 : 8);
    const multStr = mult > 1 ? ' ×' + mult.toFixed(1) + 'x!' : '';
    const popText = pts >= 3 && this.streak >= 3 ? '+' + pts + multStr : '+' + pts;
    this._scorePops.push({ x: this.bag.x, y: this.bag.y - 20, text: popText, life: 1.6, col: pts >= 3 ? C.gold : C.green, vy: -50 });
    if (pts >= 3) { this.phase = 'settle'; this.bag.vx = 0; this.bag.vy = 0; }
  };

  Game.prototype._finalizeThrow = function () {
    const b = this.bag;
    const onBoard = b.rest === 'board' && !b.gone;
    if (onBoard && b.x > BOARD_X - BAG && b.x < BOARD_X + BOARD_W + BAG) {
      this._score(1);    // stuck on the board = 1 pt
    }
    if (!this._scoredThisThrow) this.streak = 0;   // missed everything: chain breaks
    // next throw
    this.bagsLeft--; this.round++;
    if (this.bagsLeft <= 0 || this.score >= 21) { this.state = 'over'; this.audio.scoreJingle(1); return; }
    this._resetBag();
  };

  Game.prototype._resetBag = function () {
    this.bag = { x: 150, y: GROUND_Y - BAG, vx: 0, vy: 0, spin: 0, rot: 0, air: true, squash: 0, skid: 0, rest: false, gone: false };
    this.phase = 'aim'; this.power = 0; this._scoredThisThrow = false;
  };

  // ===================================================================
  // RENDER
  // ===================================================================
  Game.prototype.render = function () {
    const ctx = this.ctx; ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    const sx = (Math.random() - 0.5) * this.shake * 20, sy = (Math.random() - 0.5) * this.shake * 20;
    ctx.save(); ctx.translate(sx, sy);
    this._drawScene(ctx);
    if (this.state === 'menu') this._drawMenu(ctx);
    else { this._drawHUD(ctx); this._drawBag(ctx); this._drawParticles(ctx); this._drawScorePops(ctx); }
    if (this.state === 'over') this._drawOver(ctx);
    if (this.flash > 0) { ctx.fillStyle = 'rgba(255,211,77,' + (this.flash * 0.25).toFixed(2) + ')'; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
    ctx.restore();
  };

  Game.prototype._drawParticles = function (ctx) {
    ctx.shadowBlur = 0;
    for (const p of this.particles) p.draw(ctx);
    ctx.globalAlpha = 1;
  };

  Game.prototype._drawScene = function (ctx) {
    // sky gradient
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, '#10132a'); g.addColorStop(0.6, '#0a0d1c'); g.addColorStop(1, '#070a14');
    ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    // ground
    ctx.fillStyle = '#0c1020'; ctx.fillRect(0, GROUND_Y, VIEW_W, VIEW_H - GROUND_Y);
    // shadow under board
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(BOARD_X - 2, GROUND_Y, BOARD_W + 4, 12);
    // ground line
    ctx.strokeStyle = 'rgba(255,160,60,0.3)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, GROUND_Y); ctx.lineTo(VIEW_W, GROUND_Y); ctx.stroke();
    // board (side view): angled platform with depth
    const topY = GROUND_Y - BOARD_H;
    // shadow/depth
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(BOARD_X + 2, topY + 2, BOARD_W - 2, BOARD_T);
    // main board surface
    ctx.fillStyle = '#3a2410';
    ctx.fillRect(BOARD_X, topY, BOARD_W, BOARD_T);
    // highlight (wood grain illusion)
    ctx.fillStyle = '#5a3820';
    ctx.fillRect(BOARD_X, topY, BOARD_W, 3);
    ctx.fillStyle = 'rgba(255,200,100,0.08)';
    ctx.fillRect(BOARD_X, topY + 3, BOARD_W * 0.7, 2);
    // neon trim with glow
    ctx.shadowColor = C.ember; ctx.shadowBlur = 18;
    ctx.strokeStyle = C.ember; ctx.lineWidth = 2.5;
    ctx.strokeRect(BOARD_X, topY, BOARD_W, BOARD_T);
    ctx.shadowBlur = 0;
    // inner border for depth
    ctx.strokeStyle = 'rgba(255,160,60,0.4)'; ctx.lineWidth = 1;
    ctx.strokeRect(BOARD_X + 2, topY + 2, BOARD_W - 4, BOARD_T - 4);
    // legs with shadow
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 4;
    ctx.fillStyle = '#1a0a00';
    ctx.fillRect(BOARD_X + 8, topY + BOARD_T, 10, BOARD_H * 0.5);
    ctx.fillRect(BOARD_X + BOARD_W - 18, topY + BOARD_T, 10, BOARD_H * 0.5);
    ctx.shadowBlur = 0;
    // hole (drawn as dark ellipse with strong glow)
    ctx.shadowColor = C.gold; ctx.shadowBlur = 18;
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(HOLE_X, topY + 4, HOLE_R, 8, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = C.gold; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(HOLE_X, topY + 4, HOLE_R, 8, 0, 0, TAU); ctx.stroke();
    // inner glow ring
    ctx.strokeStyle = 'rgba(255,211,77,0.3)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(HOLE_X, topY + 4, HOLE_R - 3, 5, 0, 0, TAU); ctx.stroke();
    ctx.shadowBlur = 0;
  };

  Game.prototype._drawBag = function (ctx) {
    const b = this.bag;
    ctx.save();
    ctx.translate(b.x, b.y);
    // shadow under bag
    ctx.save();
    ctx.globalAlpha = 0.2; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(0, BAG * 0.8, BAG * 0.9, BAG * 0.3, 0, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.rotate(b.rot);
    // squash: compress vertically on impact, bulge horizontally
    const sq = b.squash || 0;
    const sxw = 1 + sq * 0.5, syh = 1 - sq * 0.55;
    ctx.scale(sxw, syh);
    // bag body (square, fabric look) with depth
    ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 8;
    ctx.fillStyle = '#d47a3a';
    ctx.fillRect(-BAG, -BAG, BAG * 2, BAG * 2);
    ctx.shadowBlur = 0;
    // top highlight (fabric shine)
    ctx.fillStyle = '#e89a5a';
    ctx.fillRect(-BAG, -BAG, BAG * 2, BAG * 0.6);
    // darker fabric on sides
    ctx.fillStyle = '#a85520';
    ctx.fillRect(-BAG, BAG * 0.4, BAG * 2, BAG * 1.6);
    // neon stitch with glow
    ctx.strokeStyle = C.gold; ctx.lineWidth = 2; ctx.shadowColor = C.gold; ctx.shadowBlur = 10;
    ctx.strokeRect(-BAG + 2, -BAG + 2, BAG * 2 - 4, BAG * 2 - 4);
    ctx.shadowBlur = 0;
    // fabric texture lines
    ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(-BAG, 0); ctx.lineTo(BAG, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -BAG); ctx.lineTo(0, BAG); ctx.stroke();
    // subtle fold details
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(-BAG * 0.6, -BAG * 0.3); ctx.quadraticCurveTo(-BAG * 0.2, 0, BAG * 0.5, BAG * 0.4); ctx.stroke();
    ctx.restore();
    // aim guide while aiming
    if (this.aiming) {
      ctx.strokeStyle = C.gold; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.8; ctx.setLineDash([8, 5]);
      ctx.shadowColor = C.gold; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + Math.cos(this.aimAng) * this.power * 200, b.y + Math.sin(this.aimAng) * this.power * 200); ctx.stroke();
      ctx.shadowBlur = 0; ctx.setLineDash([]); ctx.globalAlpha = 1;
      // power indicator with color coding
      ctx.save(); ctx.translate(b.x, b.y - BAG - 20);
      const powerPct = Math.round(this.power * 100);
      ctx.fillStyle = this.power > 0.8 ? C.ember : this.power > 0.5 ? C.gold : C.cyan;
      ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 12;
      ctx.font = 'bold 16px "Space Grotesk",monospace'; ctx.textAlign = 'center';
      ctx.fillText(powerPct + '%', 0, 0);
      ctx.restore();
    }
  };

  Game.prototype._drawHUD = function (ctx) {
    ctx.textAlign = 'left';
    // Score with glow
    ctx.shadowColor = C.cyan; ctx.shadowBlur = 12;
    ctx.fillStyle = C.text; ctx.font = 'bold 32px "Space Grotesk",monospace';
    ctx.fillText(String(this.score).padStart(2, '0'), 16, 42);
    ctx.shadowBlur = 0;
    ctx.font = '12px "Space Grotesk",sans-serif'; ctx.fillStyle = C.dim;
    ctx.fillText('SCORE', 16, 60);
    // Bags remaining indicator
    ctx.fillStyle = this.bagsLeft <= 2 ? C.ember : C.dim;
    ctx.font = '12px "Space Grotesk",sans-serif';
    ctx.fillText('BAGS: ' + this.bagsLeft, 16, 84);
    // Visual bag counter dots
    const dotSpacing = 18;
    for (let i = 0; i < this.bagsLeft && i < 4; i++) {
      const dotX = 16 + (i * dotSpacing);
      ctx.fillStyle = C.gold;
      ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.arc(dotX, 100, 3, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // streak counter — only worth showing once a chain is actually building
    if (this.streak >= 2) {
      const pulse = 1 + Math.sin(this.time * 12) * 0.08;
      ctx.save(); ctx.translate(140, 42); ctx.scale(pulse, pulse);
      ctx.font = 'bold 22px "Space Grotesk",monospace'; ctx.fillStyle = C.gold;
      ctx.shadowColor = C.gold; ctx.shadowBlur = 14;
      ctx.textAlign = 'center';
      ctx.fillText('🔥 ' + this.streak, 0, 0);
      ctx.shadowBlur = 0;
      ctx.font = '10px sans-serif'; ctx.fillStyle = C.dim;
      ctx.fillText('COMBO', 0, 14);
      ctx.restore();
    }
    ctx.textAlign = 'left';
    // throw line marker with gradient feel
    ctx.strokeStyle = 'rgba(255,160,60,0.3)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(120, GROUND_Y - 90); ctx.lineTo(120, GROUND_Y - 20); ctx.stroke();
    // Best streak display in corner
    if (this.bestStreak >= 3) {
      ctx.font = '11px "Space Grotesk",sans-serif'; ctx.fillStyle = C.dim; ctx.textAlign = 'right';
      ctx.fillText('Best: ' + this.bestStreak + '🔥', VIEW_W - 20, 30);
    }
  };

  Game.prototype._drawScorePops = function (ctx) {
    ctx.textAlign = 'center';
    for (const p of this._scorePops) {
      const a = KC.Util.clamp(p.life / 1.6, 0, 1);
      const bounce = Math.max(0, 1 - (1 - a) * (1 - a)) * 2; // ease out bounce
      ctx.save(); ctx.translate(p.x, p.y - bounce * 8);
      ctx.globalAlpha = a; ctx.font = 'bold 36px "Space Grotesk",monospace';
      ctx.fillStyle = p.col; ctx.shadowColor = p.col; ctx.shadowBlur = 20;
      ctx.fillText(p.text, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.textAlign = 'left';
  };

  Game.prototype._drawMenu = function (ctx) {
    // Background gradient suggestion
    ctx.fillStyle = 'rgba(5,5,15,0.3)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    ctx.textAlign = 'center';
    ctx.fillStyle = C.text; ctx.font = 'bold 48px "Space Grotesk",sans-serif';
    ctx.shadowColor = C.ember; ctx.shadowBlur = 24;
    ctx.fillText('CORNHOLE', VIEW_W / 2, 180);
    ctx.shadowBlur = 0;

    ctx.font = 'bold 20px "Space Grotesk",sans-serif'; ctx.fillStyle = C.gold;
    ctx.fillText('Neon Bag Toss', VIEW_W / 2, 220);

    ctx.font = '15px "Space Grotesk",sans-serif'; ctx.fillStyle = C.text;
    ctx.fillText('Drag back from the bag & release to throw', VIEW_W / 2, 310);
    ctx.fillText('Hole = 3 pts  ·  Board = 1 pt', VIEW_W / 2, 335);
    ctx.fillText('First to 21 wins  ·  Build combos for multipliers', VIEW_W / 2, 360);

    ctx.fillStyle = C.gold; ctx.font = 'bold 24px "Space Grotesk",sans-serif';
    const pulse = 0.7 + 0.3 * Math.sin(this.time * 5);
    ctx.globalAlpha = pulse;
    ctx.shadowColor = C.gold; ctx.shadowBlur = 16;
    ctx.fillText('CLICK TO PLAY', VIEW_W / 2, 450);
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    ctx.textAlign = 'left';
  };

  Game.prototype._drawOver = function (ctx) {
    ctx.fillStyle = 'rgba(5,5,15,0.92)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    // glow behind text
    ctx.fillStyle = 'rgba(255,211,77,0.08)'; ctx.beginPath();
    ctx.arc(VIEW_W / 2, VIEW_H / 2 - 20, 120, 0, TAU); ctx.fill();

    ctx.textAlign = 'center';
    ctx.fillStyle = C.text; ctx.font = 'bold 44px "Space Grotesk",sans-serif';
    ctx.shadowColor = C.gold; ctx.shadowBlur = 24;
    ctx.fillText('GAME OVER', VIEW_W / 2, VIEW_H / 2 - 50);
    ctx.shadowBlur = 0;

    ctx.font = 'bold 32px "Space Grotesk",monospace'; ctx.fillStyle = C.gold;
    ctx.fillText(String(this.score).padStart(2, '0'), VIEW_W / 2, VIEW_H / 2 + 10);
    ctx.font = '14px "Space Grotesk",sans-serif'; ctx.fillStyle = C.dim;
    ctx.fillText('FINAL SCORE', VIEW_W / 2, VIEW_H / 2 + 32);

    if (this.bestStreak >= 2) {
      ctx.font = 'bold 18px "Space Grotesk",sans-serif'; ctx.fillStyle = C.gold;
      ctx.shadowColor = C.gold; ctx.shadowBlur = 12;
      ctx.fillText('🔥 Best streak: ' + this.bestStreak, VIEW_W / 2, VIEW_H / 2 + 60);
      ctx.shadowBlur = 0;
    }

    ctx.fillStyle = C.gold; ctx.font = 'bold 18px "Space Grotesk",sans-serif';
    const pulse2 = 0.6 + 0.4 * Math.sin(this.time * 4);
    ctx.globalAlpha = pulse2;
    ctx.shadowColor = C.gold; ctx.shadowBlur = 14;
    ctx.fillText('CLICK TO PLAY AGAIN', VIEW_W / 2, VIEW_H / 2 + 100);
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    ctx.textAlign = 'left';
  };

  KC.Game = Game;
  KC.Input = Input;
  KC.Audio = Audio;

  // ===== KUDBEE Studio Hub stats hook =====
  // Standalone-safe: loads studio-sdk.js if present, tracks final score, installs plugin.
  (function () {
    function load() {
      var s = document.createElement('script'); s.src = '../studio/studio-sdk.js';
      s.onload = function () { if (window.KDStudio) { KDStudio.install && KDStudio.install('cornhole'); } };
      document.head.appendChild(s);
    }
    if (document.readyState === 'complete') load(); else window.addEventListener('load', load);
  })();

  // Track score on game over.
  var _origReset = Game.prototype.reset;
  Game.prototype.reset = function () {
    if (this.state === 'over' && this.score > 0) { try { if (window.KDStudio) KDStudio.track && KDStudio.track('cornhole', 'score', this.score); } catch (e) {} }
    return _origReset.call(this);
  };
})(window.KC = window.KC || {});
