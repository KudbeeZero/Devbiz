/* =====================================================================
 * Kudbee Cricket Premier — game.js
 * A neon T20 cricket game starring real cricketers. Time your shots,
 * aim into the gaps, bowl with pace and swing, and run a franchise.
 *
 * ZERO-BUILD: vanilla JS, Canvas 2D. Loads the shared core-util first.
 * Signature mechanic: timing-based batting — the ball comes down the
 * pitch, a shrinking "sweet-spot" ring tells you WHEN to swing, and your
 * aim direction (held drag / swipe) picks WHERE the ball goes.
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
    sign(v) { return v < 0 ? -1 : v > 0 ? 1 : 0; },
    gauss() {
      let u = 0, v = 0; while (u === 0) u = Math.random(); while (v === 0) v = Math.random();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
    },
    smooth(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); },
    approach(cur, tgt, d) { return cur < tgt ? Math.min(cur + d, tgt) : Math.max(cur - d, tgt); },
    dist(x1, y1, x2, y2) { const dx = x2 - x1, dy = y2 - y1; return Math.sqrt(dx * dx + dy * dy); },
  });

  const VIEW_W = 960, VIEW_H = 640;
  const C = { cyan: '#39e6ff', violet: '#c46bff', green: '#7CFFb2', gold: '#ffd34d', ember: '#ff5d3c', text: '#cfe9ff', dim: '#7d8aa8' };

  // ===================================================================
  // AUDIO — procedural neon synth (bat crack, crowd, thuds, UI ticks).
  // ===================================================================
  function Audio() {
    this.enabled = true; this.ctx = null; this.master = null; this._lastCrack = 0;
  }
  Audio.prototype._ensure = function () {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
  };
  Audio.prototype.toggle = function () { this.enabled = !this.enabled; if (this.master) this.master.gain.value = this.enabled ? 0.5 : 0; };
  Audio.prototype._tone = function (f, dur, type, vol, slideTo) {
    if (!this.enabled) return; this._ensure(); if (!this.ctx) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.3, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  };
  Audio.prototype._noise = function (dur, vol, hp) {
    if (!this.enabled) return; this._ensure(); if (!this.ctx) return;
    const t = this.ctx.currentTime, n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp || 800;
    const g = this.ctx.createGain(); g.gain.value = vol || 0.3;
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t);
  };
  Audio.prototype.batCrack = function (power) {
    const now = Date.now(); if (now - this._lastCrack < 60) return; this._lastCrack = now;
    this._noise(0.12, 0.25 + power * 0.4, 1200);
    this._tone(180 + power * 80, 0.1, 'square', 0.2, 60);
  };
  Audio.prototype.tap = function () { this._tone(420, 0.05, 'square', 0.12); };
  Audio.prototype.uiTick = function () { this._tone(660, 0.04, 'sine', 0.1); };
  Audio.prototype.whistle = function () { this._tone(900, 0.18, 'sine', 0.12, 700); };
  Audio.prototype.crowd = function () { this._noise(0.5, 0.06, 300); };

  // ===================================================================
  // REAL PLAYER ROSTER — famous cricketers, modelled as T20 bat/bowl cards.
  // rating 0..100 drives timing-window size, power ceiling, consistency.
  // ===================================================================
  const ROSTER = [
    { n: 'V. Kohli', bat: 92, bowl: 20, role: 'bat' },
    { n: 'R. Sharma', bat: 90, bowl: 12, role: 'bat' },
    { n: 'B. Stokes', bat: 84, bowl: 70, role: 'all' },
    { n: 'S. Gill', bat: 86, bowl: 8, role: 'bat' },
    { n: 'J. Root', bat: 82, bowl: 30, role: 'bat' },
    { n: 'B. Azam', bat: 85, bowl: 6, role: 'bat' },
    { n: 'de Kock', bat: 83, bowl: 4, role: 'wk' },
    { n: 'D. Warner', bat: 84, bowl: 5, role: 'bat' },
    { n: 'Rashid K.', bat: 40, bowl: 93, role: 'bowl' },
    { n: 'Bumrah', bat: 14, bowl: 95, role: 'bowl' },
    { n: 'Shami', bat: 16, bowl: 88, role: 'bowl' },
    { n: 'Malinga', bat: 12, bowl: 90, role: 'bowl' },
    { n: 'Starc', bat: 22, bowl: 89, role: 'bowl' },
    { n: 'Cummins', bat: 30, bowl: 90, role: 'bowl' },
    { n: 'Jadeja', bat: 66, bowl: 86, role: 'all' },
    { n: 'Maxwell', bat: 82, bowl: 50, role: 'all' },
  ];
  const TEAMS = [
    { name: 'Neon Royals', col: '#39e6ff', pick: [0, 4, 8, 9, 14, 2, 6, 10, 11, 3, 7] },
    { name: 'Violet Strikers', col: '#c46bff', pick: [1, 5, 12, 13, 15, 2, 6, 8, 9, 3, 7] },
    { name: 'Emerald XI', col: '#7CFFb2', pick: [2, 3, 8, 10, 14, 0, 6, 11, 12, 5, 7] },
    { name: 'Amber Pace', col: '#ffd34d', pick: [9, 10, 11, 12, 13, 1, 6, 15, 14, 4, 7] },
  ];

  // ===================================================================
  // INPUT — unified pointer (aim direction from drag vector / swipe).
  // ===================================================================
  function Input(canvas) {
    this.canvas = canvas; this.pointer = { down: false, x: 0, y: 0, sx: 0, sy: 0, dx: 0, dy: 0 };
    this.justDown = false; this.justUp = false; this.aimAng = -Math.PI / 2; this.aimLen = 0;
    const now = () => (window.performance ? performance.now() : Date.now()) / 1000;
    const toL = (cx, cy) => { const r = canvas.getBoundingClientRect(); return { x: (cx - r.left) * (canvas.width / r.width), y: (cy - r.top) * (canvas.height / r.height) }; };
    const self = this;
    if (window.PointerEvent) {
      canvas.addEventListener('pointerdown', e => { e.preventDefault(); const p = toL(e.clientX, e.clientY); self.pointer.down = true; self.pointer.sx = self.pointer.x = p.x; self.pointer.sy = self.pointer.y = p.y; self.pointer.dx = 0; self.pointer.dy = 0; self.justDown = true; });
      canvas.addEventListener('pointermove', e => { e.preventDefault(); if (self.pointer.down) { const p = toL(e.clientX, e.clientY); self.pointer.dx = p.x - self.pointer.sx; self.pointer.dy = p.y - self.pointer.sy; self.pointer.x = p.x; self.pointer.y = p.y; self.aimAng = Math.atan2(self.pointer.dy, self.pointer.dx); self.aimLen = KC.Util.clamp(Math.hypot(self.pointer.dx, self.pointer.dy) / 120, 0, 1); } }, { passive: false });
      window.addEventListener('pointerup', () => { if (self.pointer.down) { self.pointer.down = false; self.justUp = true; } });
    } else {
      canvas.addEventListener('mousedown', e => { const p = toL(e.clientX, e.clientY); self.pointer.down = true; self.pointer.sx = self.pointer.x = p.x; self.pointer.sy = self.pointer.y = p.y; self.justDown = true; });
      window.addEventListener('mousemove', e => { if (self.pointer.down) { const p = toL(e.clientX, e.clientY); self.pointer.dx = p.x - self.pointer.sx; self.pointer.dy = p.y - self.pointer.sy; self.pointer.x = p.x; self.pointer.y = p.y; } });
      window.addEventListener('mouseup', () => { self.pointer.down = false; self.justUp = true; });
    }
    this.endFrame = function () { this.justDown = false; this.justUp = false; };
  }

  // ===================================================================
  // PARTICLES — simple pooled sparks / dust for bat contact.
  // ===================================================================
  function Particles() { this.items = []; }
  Particles.prototype.burst = function (x, y, col, n) {
    n = n || 8;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = KC.Util.rand(60, 260);
      this.items.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: KC.Util.rand(0.2, 0.5), max: 0.5, col: col, size: KC.Util.rand(1.5, 3.5) });
    }
  };
  Particles.prototype.update = function (dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i]; p.life -= dt; if (p.life <= 0) { this.items.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 400 * dt; p.vx *= 0.98;
    }
  };
  Particles.prototype.draw = function (ctx) {
    for (const p of this.items) {
      ctx.globalAlpha = KC.Util.clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.col;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  // ===================================================================
  // GAME
  // ===================================================================
  function Game(opts) {
    this.canvas = opts.canvas; this.ctx = this.canvas.getContext('2d');
    this.viewW = VIEW_W; this.viewH = VIEW_H; this.canvas.width = VIEW_W; this.canvas.height = VIEW_H;
    this.time = 0; this.audio = new Audio(); this.input = new Input(this.canvas); this.particles = new Particles();
    this.reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.state = 'menu'; this.selTeam = 0;
    this.resetMatch();
    this.menuSel = 0; this.flash = 0; this.shake = 0; this.banner = '';
  }
  Game.prototype.resetMatch = function () {
    this.overs = 0; this.ball = 0; this.runs = 0; this.wickets = 0; this.target = 0; this.batting = true;
    this.thisOver = []; this.bowlerIdx = 0; this.batterIdx = 0;
    this.phase = 'idle'; // idle | runup | flight | resolve
    this.phaseT = 0; this.ballX = 0; this.ballY = 0; this.bounceX = 0;
    this.aimX = VIEW_W / 2; this.aimY = VIEW_H * 0.42; this.sweetRing = 0; this.sweetScore = 1;
    this.lastShot = null; this.overBalls = 0;
  };
  Game.prototype.start = function () { this._last = performance.now() / 1000; requestAnimationFrame(this._frame.bind(this)); };
  Game.prototype.confirm = function () {
    if (this.state === 'menu') { this.startMatch(); }
  };
  Game.prototype.startMatch = function () {
    this.resetMatch(); this.batting = true; this.innings = 1; this.phase = 'idle'; this.state = 'play';
    this.team = TEAMS[this.selTeam]; this.myXI = this.team.pick.map(i => ROSTER[i]);
    this.opp = TEAMS[(this.selTeam + 1) % TEAMS.length]; this.oppXI = this.opp.pick.map(i => ROSTER[i]);
    this.banner = this.team.name + ' to bat first'; this.flash = 1.5; this.audio.whistle();
  };

  // ---- main loop ----
  Game.prototype._frame = function () {
    const now = performance.now() / 1000; let dt = Math.min(0.05, now - this._last); this._last = now; this.time += dt;
    this.update(dt); this.render(); this.input.endFrame();
    requestAnimationFrame(this._frame.bind(this));
  };

  Game.prototype.update = function (dt) {
    this.particles.update(dt);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 2);
    if (this.state === 'menu') this._updateMenu(dt);
    else if (this.state === 'play') this._updatePlay(dt);
    else if (this.state === 'result') this._updateResult(dt);
  };

  Game.prototype._updatePlay = function (dt) {
    const I = this.input.pointer;
    switch (this.phase) {
      case 'idle': {
        // bowler begins runup on its own; batsman awaits.
        this.phaseT += dt;
        if (this.phaseT > 0.8) { this.phase = 'runup'; this.phaseT = 0; this._prepBall(); }
        break;
      }
      case 'runup': {
        this.phaseT += dt;
        if (this.phaseT > 0.5) { this.phase = 'flight'; this.phaseT = 0; this._releaseBall(); }
        break;
      }
      case 'flight': {
        this.phaseT += dt;
        // ball travels down the pitch; batsman can swing anytime during flight
        this._moveBall(dt);
        // sweet-spot ring: shrinks to a minimum at the ideal contact moment
        const prog = KC.Util.clamp(this.phaseT / this.flightDur, 0, 1);
        this.sweetRing = KC.Util.lerp(46, 12, KC.Util.smooth(prog));
        if (I.justDown) { this._swing(); }
        if (this.phaseT > this.flightDur + 0.5) { this._resolve(false, 0); } // played and missed / dot
        break;
      }
      case 'resolve': {
        this.phaseT += dt;
        if (this.phaseT > 1.0) { this._nextBall(); }
        break;
      }
    }
  };

  Game.prototype._prepBall = function () {
    // choose bowler & set flight params (pace varies by bowler rating)
    const bowl = this.oppXI[this.bowlerIdx % this.oppXI.length];
    this.flightDur = KC.Util.lerp(0.95, 0.62, bowl.bowl / 100); // faster bowler = shorter reaction
    this.bowlSwing = (KC.Util.gauss() * 0.06) * (1 - bowl.bowl / 150); // lateral drift
    this.bowlLine = KC.Util.gauss() * 0.10; // line off centre
    this.bounceX = VIEW_W / 2 + this.bowlLine * 120;
    this.bat = this.myXI[this.batterIdx % this.myXI.length];
    this.bowlerIdx++;
  };

  Game.prototype._releaseBall = function () {
    this.ballX = VIEW_W / 2 + this.bowlLine * 80; this.ballY = 70;
    this.ballVX = this.bowlSwing * 60; this.ballVY = (VIEW_H * 0.40) / this.flightDur;
    this._trail = []; this.audio.tap();
  };

  Game.prototype._moveBall = function (dt) {
    this.ballX += this.ballVX * dt; this.ballY += this.ballVY * dt;
    // trail sample
    this._trail.push({ x: this.ballX, y: this.ballY });
    if (this._trail.length > 14) this._trail.shift();
    // bounce once partway down
    if (this.ballY > VIEW_H * 0.52 && !this._bounced) { this._bounced = true; this.ballVY *= 0.85; this.audio.tap(); }
  };

  // The swing — timing quality vs the sweet spot, aim into gaps.
  Game.prototype._swing = function () {
    const prog = KC.Util.clamp(this.phaseT / this.flightDur, 0, 1);
    // ideal contact is ~0.82 through flight (just after bounce)
    const ideal = 0.82;
    const err = Math.abs(prog - ideal);
    let timing; // 1 perfect .. 0 whiff
    if (err < 0.06) timing = 1; else if (err < 0.13) timing = 0.8; else if (err < 0.22) timing = 0.5; else if (err < 0.34) timing = 0.2; else timing = 0;
    // player rating widens the timing window slightly
    const wid = 1 + (this.bat.bat - 70) / 120;
    if (err > 0.34 / wid && timing === 0) { this._resolve(false, 0); return; }

    const I = this.input.pointer;
    const aimAng = (I.aimLen > 0.05) ? I.aimAng : (-Math.PI / 2 + KC.Util.gauss() * 0.4);
    const aimPow = (I.aimLen > 0.05) ? I.aimLen : KC.Util.rand(0.4, 0.8);

    let runs = 0, out = false;
    if (timing <= 0.15) {
      out = true; // mistimed badly => dismissal
    } else {
      const power = timing * (0.5 + this.bat.bat / 180) * (0.6 + aimPow * 0.6);
      if (timing >= 0.92 && power > 0.85) runs = 6;
      else if (power > 0.62) runs = 4;
      else if (power > 0.4) runs = KC.Util.pick([1, 2, 2, 3]);
      else runs = KC.Util.pick([0, 1, 1]);
      // small chance a hard shot to a fielder is caught
      if ((runs === 4 || runs === 2) && Math.random() < 0.08) out = true;
    }
    this.lastShot = { ang: aimAng, pow: timing, runs: runs, out: out };
    this.audio.batCrack(timing);
    this.particles.burst(this.aimX, this.aimY, timing > 0.8 ? C.green : C.cyan, timing > 0.8 ? 16 : 8);
    this.shake = timing * 0.15;
    this._resolve(out, runs);
  };

  Game.prototype._resolve = function (out, runs) {
    this.phase = 'resolve'; this.phaseT = 0;
    if (out) {
      this.wickets++; this.banner = 'OUT!';
      this.audio.whistle(); this.batterIdx++;
    } else {
      this.runs += runs;
      this.banner = runs === 6 ? 'SIX!' : runs === 4 ? 'FOUR!' : runs > 0 ? runs + ' run' + (runs > 1 ? 's' : '') : 'Dot ball';
      if (runs === 6 || runs === 4) this.audio.crowd();
    }
    this.thisOver.push(out ? 'W' : (runs === 0 ? '.' : String(runs)));
    this._bounced = false;
  };

  Game.prototype._nextBall = function () {
    this.ball++; this.overBalls++;
    if (this.overBalls >= 6) { this.overs++; this.overBalls = 0; this.thisOver = []; this.audio.whistle(); }
    if (this.wickets >= 10 || this.overs >= 5) { this._endInnings(); return; }
    this.phase = 'idle'; this.phaseT = 0; this.banner = '';
  };

  Game.prototype._endInnings = function () {
    this.state = 'result';
    this.banner = this.team.name + ' scored ' + this.runs + '/' + this.wickets;
    this.audio.crowd();
  };

  // ===================================================================
  // RENDER
  // ===================================================================
  Game.prototype.render = function () {
    const ctx = this.ctx; ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    const sx = (Math.random() - 0.5) * this.shake * 16, sy = (Math.random() - 0.5) * this.shake * 16;
    ctx.save(); ctx.translate(sx, sy);
    this._drawGround(ctx);
    if (this.state === 'menu') { this._drawMenu(ctx); }
    else if (this.state === 'play') { this._drawPlay(ctx); }
    else if (this.state === 'result') { this._drawResult(ctx); }
    this.particles.draw(ctx);
    if (this.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (this.flash * 0.25).toFixed(2) + ')'; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
    ctx.restore();
  };

  Game.prototype._drawGround = function (ctx) {
    // deep neon sky
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, '#0a1430'); g.addColorStop(0.45, '#070b1c'); g.addColorStop(1, '#04060f');
    ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    // distant glow halo behind the ground
    const halo = ctx.createRadialGradient(VIEW_W / 2, VIEW_H * 0.46, 30, VIEW_W / 2, VIEW_H * 0.46, 360);
    halo.addColorStop(0, 'rgba(57,230,255,0.12)'); halo.addColorStop(1, 'rgba(57,230,255,0)');
    ctx.fillStyle = halo; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    // pitch strip with glow
    ctx.save();
    ctx.shadowColor = 'rgba(57,230,255,0.4)'; ctx.shadowBlur = 18;
    ctx.fillStyle = '#101a40'; ctx.fillRect(VIEW_W / 2 - 36, 40, 72, VIEW_H - 120);
    ctx.restore();
    ctx.strokeStyle = 'rgba(57,230,255,0.4)'; ctx.lineWidth = 2;
    ctx.strokeRect(VIEW_W / 2 - 36, 40, 72, VIEW_H - 120);
    // creases with glow
    ctx.save(); ctx.shadowColor = C.cyan; ctx.shadowBlur = 8; ctx.strokeStyle = 'rgba(124,255,178,0.7)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(VIEW_W / 2 - 36, VIEW_H * 0.78); ctx.lineTo(VIEW_W / 2 + 36, VIEW_H * 0.78); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(VIEW_W / 2 - 36, 70); ctx.lineTo(VIEW_W / 2 + 36, 70); ctx.stroke();
    ctx.restore();
    // 30-yard circle
    ctx.beginPath(); ctx.ellipse(VIEW_W / 2, VIEW_H * 0.46, 220, 150, 0, 0, TAU); ctx.strokeStyle = 'rgba(196,107,255,0.25)'; ctx.lineWidth = 1.5; ctx.stroke();
    // boundary with glow + dashed pulse
    ctx.save(); ctx.shadowColor = C.gold; ctx.shadowBlur = 14; ctx.strokeStyle = 'rgba(255,211,77,0.5)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(VIEW_W / 2, VIEW_H * 0.46, 320, 250, 0, 0, TAU); ctx.stroke();
    ctx.restore();
    // animated fielders (pulse + glow)
    const t = this.time;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU * 0.86 - TAU * 0.07 + Math.sin(t * 0.6 + i) * 0.02;
      const rr = 280 + Math.sin(t * 1.5 + i * 0.7) * 4;
      const fx = VIEW_W / 2 + Math.cos(a) * rr * 1.1, fy = VIEW_H * 0.46 + Math.sin(a) * rr * 0.78;
      const pulse = 0.5 + 0.5 * Math.sin(t * 3 + i);
      ctx.save(); ctx.shadowColor = C.green; ctx.shadowBlur = 8 + pulse * 8;
      ctx.beginPath(); ctx.arc(fx, fy, 4 + pulse * 1.5, 0, TAU);
      ctx.fillStyle = 'rgba(124,255,178,' + (0.5 + pulse * 0.4) + ')'; ctx.fill();
      ctx.restore();
    }
  };

  Game.prototype._drawPlay = function (ctx) {
    // bowler (glowing)
    ctx.save(); ctx.shadowColor = this.opp.col || C.violet; ctx.shadowBlur = 14;
    ctx.fillStyle = this.opp.col || C.violet;
    ctx.beginPath(); ctx.arc(VIEW_W / 2 + this.bowlLine * 60, 90, 10, 0, TAU); ctx.fill();
    ctx.restore();
    // batsman (glowing)
    ctx.save(); ctx.shadowColor = this.team.col || C.cyan; ctx.shadowBlur = 14;
    ctx.fillStyle = this.team.col || C.cyan;
    ctx.beginPath(); ctx.arc(VIEW_W / 2, VIEW_H * 0.82, 11, 0, TAU); ctx.fill();
    ctx.restore();
    // stumps (glow)
    ctx.save(); ctx.shadowColor = C.gold; ctx.shadowBlur = 8; ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 2.5;
    for (const ox of [-6, 0, 6]) { ctx.beginPath(); ctx.moveTo(VIEW_W / 2 + ox, VIEW_H * 0.74); ctx.lineTo(VIEW_W / 2 + ox, VIEW_H * 0.80); ctx.stroke(); }
    ctx.restore();

    // ball trail + ball in flight
    if (this.phase === 'flight' || this.phase === 'runup') {
      // trail
      for (let i = 0; i < this._trail.length; i++) {
        const p = this._trail[i]; const a = (i / this._trail.length) * 0.5;
        ctx.globalAlpha = a; ctx.fillStyle = '#ff6a3c';
        ctx.beginPath(); ctx.arc(p.x, p.y, 3 * (i / this._trail.length) + 1, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
      // ball with glow
      ctx.save(); ctx.shadowColor = '#ff3c5d'; ctx.shadowBlur = 14;
      ctx.fillStyle = '#ff3c5d'; ctx.beginPath(); ctx.arc(this.ballX, this.ballY, 5, 0, TAU); ctx.fill();
      ctx.restore();
      // sweet-spot ring at contact zone — the timing guide (pulsing)
      const cy = VIEW_H * 0.76;
      const sweet = this.sweetRing < 16;
      ctx.save(); ctx.shadowColor = sweet ? C.green : C.cyan; ctx.shadowBlur = sweet ? 16 : 8;
      ctx.strokeStyle = sweet ? C.green : C.cyan; ctx.lineWidth = 3; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.arc(this.aimX, cy, this.sweetRing, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1; ctx.restore();
    }
    // aim guide (drag direction)
    if (this.input.pointer.down && this.input.pointer.aimLen > 0.05) {
      const a = this.input.pointer.aimAng, l = 60;
      ctx.save(); ctx.shadowColor = C.gold; ctx.shadowBlur = 10;
      ctx.strokeStyle = C.gold; ctx.lineWidth = 3; ctx.globalAlpha = 0.7;
      ctx.beginPath(); ctx.moveTo(this.aimX, VIEW_H * 0.82); ctx.lineTo(this.aimX + Math.cos(a) * l, VIEW_H * 0.82 + Math.sin(a) * l); ctx.stroke();
      ctx.globalAlpha = 1; ctx.restore();
    }
    this._drawHUD(ctx);
    if (this.banner) { ctx.fillStyle = C.text; ctx.font = 'bold 28px "Space Grotesk",sans-serif'; ctx.textAlign = 'center'; ctx.shadowColor = C.cyan; ctx.shadowBlur = 16; ctx.fillText(this.banner, VIEW_W / 2, 40); ctx.shadowBlur = 0; ctx.textAlign = 'left'; }
  };

  Game.prototype._drawHUD = function (ctx) {
    ctx.fillStyle = C.text; ctx.font = 'bold 30px "Space Grotesk",monospace'; ctx.textAlign = 'left';
    ctx.fillText(this.runs + '/' + this.wickets, 16, 40);
    ctx.font = '14px "Space Grotesk",sans-serif';
    ctx.fillText('Ov ' + this.overs + '.' + this.overBalls + (this.overs >= 5 ? ' (innings done)' : '/5'), 16, 60);
    // batter
    const bat = this.myXI[this.batterIdx % this.myXI.length];
    ctx.fillStyle = this.team.col; ctx.font = 'bold 16px "Space Grotesk",sans-serif';
    ctx.fillText('Batting: ' + bat.n + ' (' + bat.bat + ')', 16, VIEW_H - 40);
    // this over
    ctx.fillStyle = C.dim; ctx.font = '13px monospace';
    ctx.fillText('This over: ' + this.thisOver.join(' '), 16, VIEW_H - 18);
  };

  Game.prototype._drawMenu = function (ctx) {
    ctx.fillStyle = C.text; ctx.font = 'bold 40px "Space Grotesk",sans-serif'; ctx.textAlign = 'center'; ctx.shadowColor = C.cyan; ctx.shadowBlur = 20;
    ctx.fillText('CRICKET', VIEW_W / 2, 120); ctx.shadowBlur = 0;
    ctx.font = 'bold 18px "Space Grotesk",sans-serif'; ctx.fillStyle = C.dim; ctx.fillText('Premier T20', VIEW_W / 2, 150);
    ctx.font = '15px "Space Grotesk",sans-serif';
    for (let i = 0; i < TEAMS.length; i++) {
      const y = 230 + i * 64, sel = i === this.selTeam;
      ctx.fillStyle = sel ? 'rgba(57,230,255,0.15)' : 'rgba(10,16,32,0.5)';
      this._roundRect(ctx, VIEW_W / 2 - 160, y, 320, 52, 10); ctx.fill();
      ctx.strokeStyle = sel ? TEAMS[i].col : 'rgba(180,210,255,0.25)'; ctx.lineWidth = sel ? 2.5 : 1.5;
      this._roundRect(ctx, VIEW_W / 2 - 160, y, 320, 52, 10); ctx.stroke();
      ctx.fillStyle = sel ? '#fff' : C.text; ctx.font = sel ? 'bold 20px "Space Grotesk",sans-serif' : '18px "Space Grotesk",sans-serif';
      ctx.fillText(TEAMS[i].name, VIEW_W / 2, y + 33);
    }
    ctx.fillStyle = C.dim; ctx.font = '13px "Space Grotesk",sans-serif';
    ctx.fillText('click a team, then tap the pitch to bat', VIEW_W / 2, VIEW_H - 30);
    ctx.fillText('swipe/drag to aim your shot', VIEW_W / 2, VIEW_H - 12);
    // menu nav with keyboard
    if (this._menuNav) {}
    ctx.textAlign = 'left';
    // team picker via pointer handled in future; for now click selects
    this._teamPickHandlers = true;
  };
  Game.prototype._drawResult = function (ctx) {
    ctx.fillStyle = 'rgba(5,5,15,0.85)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = C.text; ctx.font = 'bold 36px "Space Grotesk",sans-serif'; ctx.textAlign = 'center'; ctx.shadowColor = C.gold; ctx.shadowBlur = 20;
    ctx.fillText('INNINGS OVER', VIEW_W / 2, VIEW_H / 2 - 40); ctx.shadowBlur = 0;
    ctx.font = 'bold 24px "Space Grotesk",sans-serif'; ctx.fillStyle = C.green;
    ctx.fillText(this.banner, VIEW_W / 2, VIEW_H / 2 + 10);
    ctx.fillStyle = C.dim; ctx.font = '16px "Space Grotesk",sans-serif';
    ctx.fillText('click to return to menu', VIEW_W / 2, VIEW_H / 2 + 60);
    ctx.textAlign = 'left';
  };

  Game.prototype._roundRect = function (ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  };

  // ---- Pointer interaction: menu team pick + result return ----
  Game.prototype._pointer = function () { return this.input.pointer; };

  Game.prototype._handleMenuClick = function () {
    const p = this._pointer();
    if (p.justDown) {
      // team rows at y=230 + i*64, box 320x52 centered
      for (let i = 0; i < TEAMS.length; i++) {
        const x0 = VIEW_W / 2 - 160, y0 = 230 + i * 64;
        if (p.x >= x0 && p.x <= x0 + 320 && p.y >= y0 && p.y <= y0 + 52) {
          if (this.selTeam !== i) { this.audio.uiTick(); this.selTeam = i; }
          else { this.audio.tap(); this.startMatch(); }   // double-click same team = start
          return;
        }
      }
      // click anywhere else starts with selected team
      this.audio.tap(); this.startMatch();
    }
  };

  Game.prototype._updateMenu = function (dt) {
    this._handleMenuClick();
  };

  Game.prototype._updateResult = function (dt) {
    if (this._pointer().justDown) { this.state = 'menu'; this.audio.uiTick(); }
    // track score to the Hub once, on first entering result
    if (!this._hubTracked) {
      this._hubTracked = true;
      try { if (window.KDStudio) KDStudio.track && KDStudio.track('cricket', 'score', this.runs); } catch (e) {}
    }
  };

  // ===== KUDBEE Studio Hub stats hook =====
  // Standalone-safe: loads studio-sdk.js if present and installs the cricket plugin.
  (function () {
    if (document.readyState === 'complete') { var s = document.createElement('script'); s.src = '../studio/studio-sdk.js'; s.onload = function () { if (window.KDStudio) KDStudio.install && KDStudio.install('cricket'); }; document.head.appendChild(s); }
    else window.addEventListener('load', function () { var s = document.createElement('script'); s.src = '../studio/studio-sdk.js'; s.onload = function () { if (window.KDStudio) KDStudio.install && KDStudio.install('cricket'); }; document.head.appendChild(s); });
  })();

  KC.Game = Game;
  KC.Input = Input;
  KC.Audio = Audio;
  KC.Particles = Particles;
  KC.ROSTER = ROSTER;
  KC.TEAMS = TEAMS;
})(window.KC = window.KC || {});