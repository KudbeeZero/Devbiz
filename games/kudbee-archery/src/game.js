/* =====================================================================
 * Kudbee Archery — game.js
 * The controller. Press to start drawing, move to aim, hold B / right-click
 * to steady your breath, release to loose. The sight wobbles; the wind pushes
 * the arrow; the camera pulls back to follow the arc, then punches in on the
 * target. Rules and ballistics live in sim.js. Logical canvas is 960x640.
 * ===================================================================== */

KAR.Game = class {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = KAR.Render.W * this.dpr; canvas.height = KAR.Render.H * this.dpr;
    this.coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    KAR.Store.load();
    this.audio = new KAR.Audio();
    this.screen = 'menu';              // menu | play | paused | over
    this.time = 0; this.last = 0; this.focusIdx = -1; this.focusPending = true; this.overlayT = 0; this.shake = 0;
    this.particles = []; this.banner = null; this.hint = ''; this.hintT = 0; this.pops = [];
    this.rng = KAR.Util.rng((Date.now() ^ 0x1f3d5b79) >>> 0);
    this.match = new KAR.Match({ mode: 'range', dist: 1, seed: 1 });
    this.bp = 'idle'; this.bpT = 0; this.zoom = 1; this.zoomTarget = 1; this.timeScale = 1;
    this.ptr = { x: 480, y: 330 }; this.aimX = 0; this.aimY = KAR.CFG.FACE_Y;
    this._resetShot();
    this._bind();
    this._frame = this._frame.bind(this);
    requestAnimationFrame(this._frame);
  }

  _resetShot() {
    this.drawing = false; this.draw = 0; this.holdT = 0; this.holding = false; this.breath = 1; this.gasp = 0;
    this.flight = null; this.cpu = null; this.sway = { x: 0, y: 0 }; this.ph = [this.rng() * 6.28, this.rng() * 6.28, this.rng() * 6.28, this.rng() * 6.28];
  }

  // ---- flow ---------------------------------------------------------------------
  startMatch() {
    const D = KAR.Store.data;
    this.match = new KAR.Match({ mode: D.mode === 1 ? 'duel' : 'range', dist: D.dist, level: D.level, seed: (this.rng() * 4294967296) >>> 0 });
    this.screen = 'play'; this.particles.length = 0; this.pops.length = 0; this.banner = null; this.newBest = false;
    this.focusIdx = -1; this.focusPending = true; this.showEnd = 0; this.zoom = 1; this.zoomTarget = 1;
    this.hint = this.coarse ? 'TOUCH & HOLD TO DRAW  ·  DRAG TO AIM  ·  LIFT TO LOOSE' : 'PRESS & HOLD TO DRAW  ·  MOVE TO AIM  ·  RELEASE TO LOOSE'; this.hintT = 6;
    this._nextShot();
  }

  human() { return this.screen === 'play' && this.match.shooter === 0 && !this.cpu && this.bp === 'ready'; }

  _nextShot() {
    const m = this.match;
    this._resetShot();
    if (m.arrowNo === 0) this.showEnd = m.endNo;
    this.bp = 'ready'; this.bpT = 0; this.zoomTarget = 1;
    this.aimX = 0; this.aimY = KAR.CFG.FACE_Y;
    this.ptr = { x: 480, y: 330 }; this._setAimFromPtr();
    if (m.shooter === 1) this.cpu = { t: 0, stage: 'think', plan: null };
  }

  setScreen(s) { this.screen = s; this.overlayT = 0; this.focusPending = true; }

  activate(id) {
    this.audio.ensure(); this.audio.click();
    const D = KAR.Store.data;
    if (id === 'play' || id === 'restart' || id === 'rematch' || id === 'retry') this.startMatch();
    else if (/^mode\d$/.test(id)) { D.mode = +id[4]; KAR.Store.save(); }
    else if (/^d\d$/.test(id)) { D.dist = +id[1]; KAR.Store.save(); }
    else if (/^lv\d$/.test(id)) { D.level = +id[2]; KAR.Store.save(); }
    else if (id === 'pause') this.togglePause();
    else if (id === 'resume') this.screen = 'play';
    else if (id === 'menu') { this.setScreen('menu'); this.bp = 'idle'; this.zoomTarget = 1; this.cpu = null; }
    else if (id === 'mute') this.audio.setMuted(!this.audio.muted);
    else if (id === 'breath') this.holding = !this.holding;
  }
  togglePause() { if (this.screen === 'play') { this.setScreen('paused'); this.drawing = false; } else if (this.screen === 'paused') this.screen = 'play'; }

  // ---- input --------------------------------------------------------------------
  _pt(e) { const r = this.canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * KAR.Render.W / r.width, y: (e.clientY - r.top) * KAR.Render.H / r.height }; }
  _setAimFromPtr() {
    const m = this.match, y = this.ptr.y - (this.coarse ? 70 : 0);
    const q = KAR.Render.unproj(this.ptr.x, y, m.dist);
    this.aimX = KAR.Util.clamp(q.x, -m.faceD * 1.3, m.faceD * 1.3); this.aimY = KAR.Util.clamp(q.y, KAR.CFG.FACE_Y - m.faceD * 1.3, KAR.CFG.FACE_Y + m.faceD * 1.3);
  }
  _bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', e => this._onDown(e));
    c.addEventListener('pointermove', e => this._onMove(e));
    c.addEventListener('pointerup', e => this._onUp(e));
    c.addEventListener('pointercancel', () => { this.drawing = false; this.draw = 0; this.holding = false; });
    c.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('keydown', e => this._onKey(e, true));
    window.addEventListener('keyup', e => this._onKey(e, false));
    document.addEventListener('visibilitychange', () => { if (document.hidden) { if (this.screen === 'play') this.togglePause(); this.audio.suspend(); } else this.audio.resume(); });
    window.addEventListener('blur', () => { if (this.screen === 'play') this.togglePause(); });
  }
  _firstGesture() { if (this.audio.ensure()) this.audio.startMusic(); }
  _beginDraw() { if (this.human() && !this.drawing) { this.drawing = true; this.draw = 0; this.holdT = 0; this.breath = 1; this.audio.draw(0); } }

  _onDown(e) {
    this._firstGesture();
    const p = this._pt(e), i = KAR.UI.hit(p.x, p.y);
    if (i >= 0) { e.preventDefault(); this.activate(KAR.UI.buttons[i].id); return; }
    if (this.screen !== 'play') return;
    this.ptr = p; if (this.drawing || this.human()) this._setAimFromPtr();
    if (e.button === 2) { this.holding = true; return; }
    this._beginDraw();
    try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  }
  _onMove(e) {
    const p = this._pt(e), i = KAR.UI.hit(p.x, p.y);
    if (i >= 0) this.focusIdx = i; else if (this.screen === 'play') this.focusIdx = -1;
    this.canvas.style.cursor = i >= 0 ? 'pointer' : (this.screen === 'play' ? 'crosshair' : 'default');
    if (this.screen === 'play' && (i < 0 || this.drawing)) { this.ptr = p; if (this.human()) this._setAimFromPtr(); }
  }
  _onUp(e) {
    if (e.button === 2) { this.holding = false; return; }
    if (this.drawing) this._loose();
  }
  _onKey(e, down) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (down) this._firstGesture();
    if (down && (k === 'm' || k === 'M')) { this.audio.setMuted(!this.audio.muted); return; }
    if (down && (k === 'p' || k === 'P' || k === 'Escape')) { e.preventDefault(); if (this.screen === 'play' || this.screen === 'paused') this.togglePause(); return; }
    if (k === 'b' || k === 'B' || k === 'Shift') { this.holding = down; return; }
    if (this.screen !== 'play') {
      if (!down) return;
      const n = KAR.UI.buttons.length; if (!n) return;
      if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'Tab') { e.preventDefault(); this.focusIdx = Math.min(n - 1, this.focusIdx + 1); }
      else if (k === 'ArrowLeft' || k === 'ArrowUp') { e.preventDefault(); this.focusIdx = Math.max(0, this.focusIdx - 1); }
      else if (k === 'Enter' || k === ' ') { e.preventDefault(); const b = KAR.UI.buttons[this.focusIdx]; if (b && !b.disabled) this.activate(b.id); }
      return;
    }
    if (down && (k === 'r' || k === 'R')) { this.startMatch(); return; }
    if (k === ' ' || k === 'Enter') { e.preventDefault(); if (down) this._beginDraw(); else if (this.drawing) this._loose(); return; }
    if (down && this.human()) {
      const st = 7;
      if (k === 'ArrowLeft') this.ptr.x -= st; else if (k === 'ArrowRight') this.ptr.x += st; else if (k === 'ArrowUp') this.ptr.y -= st; else if (k === 'ArrowDown') this.ptr.y += st; else return;
      e.preventDefault(); this._setAimFromPtr();
    }
  }

  // ---- shooting -------------------------------------------------------------------
  _loose() {
    if (!this.drawing || this.bp !== 'ready') return;
    this.drawing = false;
    if (!this.cpu && this.draw < 0.4) { this.draw = 0; this.hint = 'DRAW LONGER BEFORE YOU RELEASE'; this.hintT = 1.5; return; }
    const m = this.match;
    const power = this.cpu ? 1 : KAR.Util.clamp(this.draw, 0, 1);
    const sw = this.cpu ? { x: this.cpu.sx, y: this.cpu.sy } : { x: this.sway.x, y: this.sway.y };
    const shooter = m.shooter;
    const res = m.shoot(this.aimX, this.aimY, sw.x, sw.y, power);
    const tEnd = res.hit ? res.hit.t : res.samples[res.samples.length - 1].t;
    this.flight = { res, t: 0, tEnd, shooter, done: false };
    this.bp = 'flight'; this.bpT = 0; this.zoomTarget = 0; this.draw = 0;
    this.audio.loose(); this.audio.fly(tEnd * 0.9);
    this.cpu = null;
    if (shooter === 0) { const st = KAR.Store.data.stats; st.arrows++; }
  }

  _land() {
    const f = this.flight, res = f.res, m = this.match, st = KAR.Store.data.stats;
    f.done = true;
    const e = res.hit;
    if (e) this.pops.push({ x: e.x, y: e.y, age: 0, ring: res.ring, team: f.shooter });
    this.shake = Math.max(this.shake, res.ring >= 9 ? 6 : 3);
    if (res.miss) { this.audio.miss(); this._banner(res.short ? 'SHORT!' : 'MISS', '#ffffff', '#9aa3ad', res.short ? 'fell before the butt' : 'off the face', 70); }
    else {
      this.audio.thud(res.ring);
      const nm = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN'];
      if (res.x) { this._banner('X!', '#fff6a8', '#ffb82e', 'PERFECT CENTRE', 110); this.audio.gold(); this._burst(40); }
      else if (res.ring === 10) { this._banner('TEN!', '#fff6a8', '#ffb82e', 'gold', 96); this.audio.gold(); this._burst(26); }
      else if (res.ring === 9) { this._banner('NINE', '#fff6a8', '#ff9a1f', 'gold', 84); this.audio.cheer(false); }
      else this._banner(nm[res.ring], res.ring >= 7 ? '#ffd0c8' : '#c4ecff', res.ring >= 7 ? '#e8483a' : '#2f86d8', '', 70);
    }
    if (f.shooter === 0) { if (res.ring === 10) st.tens++; if (res.x) st.xs++; }
    this.bp = 'result'; this.bpT = 0;
    if (res.endDone && !m.over) { this.hint = 'END COMPLETE  ·  ' + (m.mode === 'duel' ? 'YOU ' + res.endScores[0] + ' – CPU ' + res.endScores[1] : res.endScores[0] + ' POINTS'); this.hintT = 2.4; }
  }

  _banner(text, c1, c2, sub, size) { this.banner = { text, c1, c2, sub, size, age: 0, life: 1.5 }; }
  _burst(n) {
    const cols = ['#ffe14d', '#ff6b5a', '#7ac7ff', '#a9ec62', '#ffffff', '#c46bff'];
    for (let i = 0; i < n; i++) this.particles.push({ x: 140 + this.rng() * 680, y: -20 - this.rng() * 120, vx: (this.rng() - 0.5) * 120, vy: 40 + this.rng() * 120, g: 260, rot: this.rng() * 6, vr: (this.rng() - 0.5) * 9, life: 2.2 + this.rng(), col: cols[Math.floor(this.rng() * cols.length)] });
  }

  _finishMatch() {
    const m = this.match, D = KAR.Store.data;
    if (m.mode === 'range') {
      const sc = m.total(0), stars = m.stars();
      this.newBest = sc > D.best[m.distIdx]; D.best[m.distIdx] = Math.max(D.best[m.distIdx], sc); D.stars[m.distIdx] = Math.max(D.stars[m.distIdx], stars);
    } else { D.stats.duels++; if (m.winner === 0) D.stats.wins++; }
    KAR.Store.save();
    this.setScreen('over');
    if ((m.mode === 'duel' && m.winner === 0) || (m.mode === 'range' && m.stars() >= 1)) { this.audio.win(); this._burst(80); } else this.audio.lose();
  }

  // ---- loop ---------------------------------------------------------------------
  _frame(ts) {
    requestAnimationFrame(this._frame);
    const dt = Math.min(0.1, (ts - this.last) / 1000) || 0;
    this.last = ts;
    this._update(dt);
    this._render();
  }

  _update(dt) {
    this.time += dt;
    if (this.banner) { this.banner.age += dt; this.banner.life -= dt; if (this.banner.life <= 0) this.banner = null; }
    if (this.hintT > 0) this.hintT -= dt;
    for (const p of this.pops) p.age += dt;
    this.pops = this.pops.filter(p => p.age < 1.2);
    this.shake *= Math.exp(-dt * 9);
    for (const p of this.particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.rot += p.vr * dt; }
    this.particles = this.particles.filter(p => p.life > 0);
    this.zoom += (this.zoomTarget - this.zoom) * Math.min(1, dt * (this.zoomTarget > this.zoom ? 4.2 : 6));
    if (this.screen === 'play') this._updateShot(dt); else this.overlayT += dt;
  }

  _updateShot(dt) {
    const m = this.match, C = KAR.CFG;
    this.bpT += dt;
    if (this.bp === 'ready') {
      if (this.cpu) this._updateCpu(dt);
      if (this.drawing) {
        const wasFull = this.draw >= 1;
        this.draw = Math.min(1, this.draw + dt / C.DRAW_T);
        if (this.draw >= 1 && !wasFull) this.audio.full(); else if (this.draw < 1) this.audio.draw(this.draw);
        if (this.draw >= 1) this.holdT += dt;
        // breath: holding steadies the sight for a couple of seconds; empty lungs make it worse
        if (this.holding && this.breath > 0 && this.gasp <= 0) this.breath = Math.max(0, this.breath - dt / 2.4);
        else { this.breath = Math.min(1, this.breath + dt / 5); }
        if (this.breath <= 0 && this.holding && this.gasp <= 0) { this.gasp = 0.9; this.holding = this.coarse ? false : this.holding; }
        if (this.gasp > 0) this.gasp -= dt;
        const steady = this.holding && this.breath > 0 && this.gasp <= 0;
        const fatigue = Math.max(0, this.holdT - C.STEADY_T) * 0.9 + (this.gasp > 0 ? 0.9 : 0);
        const amp = C.BASE_SWAY * m.dist * (1 + fatigue) * (steady ? 0.25 : 1) * (0.55 + 0.45 * this.draw);
        const t = this.time;
        this.sway.x = amp * (Math.sin(1.3 * t + this.ph[0]) * 0.7 + Math.sin(2.9 * t + this.ph[1]) * 0.3);
        this.sway.y = amp * 1.1 * (Math.sin(1.7 * t + this.ph[2]) * 0.7 + Math.sin(3.3 * t + this.ph[3]) * 0.3) + amp * 0.4 * Math.sin(0.9 * t);
        this.steady = steady;
      } else { this.sway.x = 0; this.sway.y = 0; this.steady = false; }
    } else if (this.bp === 'flight') {
      const f = this.flight, frac = f.t / f.tEnd;
      this.timeScale = frac > 0.86 ? 0.4 : 1;
      f.t += dt * this.timeScale;
      this.zoomTarget = frac < 0.5 ? 0 : 1;
      if (f.t >= f.tEnd) { f.t = f.tEnd; this.timeScale = 1; this._land(); }
    } else if (this.bp === 'result') {
      if (this.bpT > (this.flight.res.endDone ? 2.1 : 1.3)) { if (m.over) this._finishMatch(); else this._nextShot(); }
    }
  }

  _updateCpu(dt) {
    const c = this.cpu, m = this.match;
    c.t += dt;
    if (c.stage === 'think' && c.t > 0.9) {
      const lv = m.level, s = KAR.Bot.shot(m, this.rng, lv.sigma, lv.read);
      c.plan = s; c.sx = s.sx; c.sy = s.sy; c.stage = 'aim'; c.t = 0;
      this.drawing = true; this.draw = 0; this.holdT = 0;
      c.from = { x: 0, y: KAR.CFG.FACE_Y - m.faceD * 0.7 };
    } else if (c.stage === 'aim') {
      const k = KAR.Util.smooth(c.t / 1.0);
      this.aimX = KAR.Util.lerp(c.from.x, c.plan.aimX, k); this.aimY = KAR.Util.lerp(c.from.y, c.plan.aimY, k);
      this.sway.x = c.sx * 0.0; this.sway.y = 0;
      if (c.t >= 1.15) { this.draw = 1; this._loose(); }
    }
  }

  // ---- drawing ------------------------------------------------------------------
  _render() {
    const ctx = this.ctx, R = KAR.Render, U = KAR.UI, m = this.match;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.save();
    if (this.shake > 0.3) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    R.setView(this.zoom, m.dist, m.faceD);
    R.drawWorld(ctx, this.time, m.wind);
    R.drawTarget(ctx, this.time, m.wind);
    this._drawArrows(ctx);
    if (this.screen !== 'menu') this._drawAim(ctx);
    ctx.restore();
    U.begin();
    for (const p of this.particles) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.col; ctx.fillRect(-4, -2.5, 8, 5); ctx.restore(); }
    if (this.screen === 'menu') U.menu(ctx, this);
    else {
      U.hud(ctx, this);
      if (this.screen === 'paused') U.pause(ctx, this);
      else if (this.screen === 'over') U.over(ctx, this);
    }
    if (this.focusPending) { this.focusPending = false; if (this.screen !== 'play') { const i = U.buttons.findIndex(b => b.primary && !b.disabled); this.focusIdx = i >= 0 ? i : 0; } }
  }

  _drawArrows(ctx) {
    const R = KAR.Render, m = this.match;
    if (this.screen === 'menu') return;
    for (let s = 0; s < m.shooters; s++) for (const a of m.arrows[s]) if (a.end === this.showEnd && !(this.bp === 'flight' && this.flight && a === m.arrows[this.flight.shooter][m.arrows[this.flight.shooter].length - 1])) R.stuck(ctx, a, s);
    // impact rings
    for (const p of this.pops) { const q = R.proj(p.x, p.y, m.dist); if (!q) continue; ctx.beginPath(); ctx.arc(q.x, q.y, (0.05 + p.age * 0.25) * q.k, 0, 6.283); ctx.strokeStyle = 'rgba(255,255,255,' + (1 - p.age / 1.2) + ')'; ctx.lineWidth = 3; ctx.stroke(); }
    if (this.bp === 'flight' && this.flight) {
      const f = this.flight, S = f.res.samples;
      let i = 0; while (i < S.length - 2 && S[i + 1].t < f.t) i++;
      const a = S[i], b = S[Math.min(S.length - 1, i + 1)], u = b.t > a.t ? KAR.Util.clamp((f.t - a.t) / (b.t - a.t), 0, 1) : 0;
      const tip = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u };
      const prev = S[Math.max(0, i - 1)], dir = { x: b.x - prev.x, y: b.y - prev.y, z: b.z - prev.z };
      // faint trail
      ctx.save(); ctx.lineCap = 'round';
      for (let j = Math.max(0, i - 14); j < i; j++) { const p = R.proj(S[j].x, S[j].y, S[j].z), q = R.proj(S[j + 1].x, S[j + 1].y, S[j + 1].z); if (!p || !q) continue; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.strokeStyle = 'rgba(255,255,255,' + (0.5 * (j - (i - 14)) / 14) + ')'; ctx.lineWidth = 2 + 3 * (1 - this.zoom); ctx.stroke(); }
      ctx.restore();
      if (!f.done) R.arrow(ctx, tip, dir, 0.8 + 3.2 * (1 - this.zoom), f.shooter, 0);
      else if (f.res.hit) R.stuck(ctx, { hit: f.res.hit }, f.shooter);
    } else if (this.bp === 'result' && this.flight && this.flight.res.hit) { /* stuck arrow already drawn from match.arrows */ }
  }

  _drawAim(ctx) {
    const R = KAR.Render, m = this.match;
    if (this.bp !== 'ready' || this.zoom < 0.85 || this.screen === 'over') return;
    const cpu = !!this.cpu;
    if (!this.drawing && !cpu) return;
    const sx = this.aimX + this.sway.x, sy = this.aimY + this.sway.y, q = R.proj(sx, sy, m.dist);
    if (!q) return;
    R.bow(ctx, q.x, q.y, this.draw, cpu ? 1 : 0, this.time);
    const r = Math.max(14, 0.12 * q.k * Math.min(1, m.faceD / 0.6) + 8);
    R.sight(ctx, q.x, q.y, Math.min(26, r), this.steady, this.time);
    // wind-hold helper on the easier levels: a faint tick where a still-air arrow would be pushed to
  }
};

document.addEventListener('DOMContentLoaded', () => { window.KARGame = new KAR.Game(document.getElementById('gameCanvas')); });
