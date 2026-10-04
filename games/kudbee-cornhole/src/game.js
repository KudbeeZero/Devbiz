/* =====================================================================
 * Kudbee Cornhole — game.js
 * The controller: fixed-step simulation, pointer/touch/keyboard input, the
 * camera dolly that follows each throw, aiming with a swaying hand, CPU
 * turns, round summaries, and the juice (dust, confetti, banners, sound).
 * Logical canvas is 960x640; CSS scales it, pointer coords are mapped back.
 * ===================================================================== */

KCH.Game = class {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = KCH.Render.W * this.dpr; canvas.height = KCH.Render.H * this.dpr;
    this.reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    KCH.Store.load();
    this.audio = new KCH.Audio();

    this.screen = 'menu';              // menu | play | paused | roundEnd | over
    this.time = 0; this.acc = 0; this.last = 0; this.timeScale = 1; this.slowT = 0;
    this.focusIdx = -1; this.focusPending = true;
    this.overlayT = 0; this.shake = 0;
    this.particles = []; this.popups = []; this.banner = null;
    this.turnText = ''; this.turnT = 0;
    this.style = 'slide';
    this.aim = { u: 0, s: KCH.CFG.HOLE_S, active: false, t0: 0, key: false };
    this.camB = 0; this.camTarget = 0;      // 0 = aim view, 1 = landing view
    this.cpu = null;
    this.matchStats = { holes: 0, airmails: 0 };
    this.rng = KCH.Util.rng((Date.now() ^ 0x9e3779b9) >>> 0);
    this.match = new KCH.Match({ solo: true });
    this.skidT = 0;
    this._bind();
    this._frame = this._frame.bind(this);
    requestAnimationFrame(this._frame);
  }

  // ---- flow ---------------------------------------------------------------
  startMatch(solo) {
    this.solo = !!solo;
    this.level = KCH.Store.data.difficulty;
    this.match = new KCH.Match({ solo: this.solo, first: this.rng() < 0.5 ? 0 : 1 });
    this.matchStats = { holes: 0, airmails: 0 };
    this.screen = 'play'; this.cpu = null;
    this.particles.length = 0; this.popups.length = 0; this.banner = null;
    this.aim.u = 0; this.aim.s = KCH.CFG.HOLE_S; this.aim.active = false; this.aim.key = false;
    this.camB = 0; this.camTarget = 0; this.focusPending = true; this.focusIdx = -1;
    this._beginTurn();
  }

  humanTurn() { return this.screen === 'play' && this.match.phase === 'throw' && !this.match.over && this.match.team === 0 && !this.cpu; }

  _beginTurn() {
    const m = this.match;
    this.camTarget = 0;
    if (m.phase !== 'throw') return;
    if (m.team === 0) {
      this.turnText = m.solo ? 'DRAG OVER THE BOARD, RELEASE TO THROW' : 'YOUR THROW'; this.turnT = 3;
      this.aim.active = false; this.aim.key = false;
    } else {
      this.turnText = 'CPU IS LINING UP…'; this.turnT = 3;
      this.cpu = { t: 0, stage: 'think', plan: null, from: { u: 0, s: 20 } };
    }
  }

  _afterSettle() {
    const m = this.match;
    const r = m.afterSettle();
    if (r) {
      this.camTarget = 0;
      this.audio.roundEnd(r.pts);
      this.roundEndT = 0.9;                      // let the board sit for a beat, then summary
      this.pendingSummary = true;
      return;
    }
    this._beginTurn();
  }

  _openSummary() {
    this.pendingSummary = false;
    this.setScreen('roundEnd');
    const m = this.match;
    if (!m.solo) {
      const w = m.lastRound.winner;
      if (w === 0 && m.lastRound.pts) this.audio.cheer(); else if (w === 1 && m.lastRound.pts) this.audio.boo();
    }
  }

  setScreen(s) { this.screen = s; this.overlayT = 0; this.focusPending = true; }

  activate(id) {
    this.audio.ensure(); this.audio.click();
    if (id === 'play') this.startMatch(false);
    else if (id === 'practice') this.startMatch(true);
    else if (/^lv\d$/.test(id)) { KCH.Store.data.difficulty = parseInt(id[2], 10); KCH.Store.save(); }
    else if (id === 'slide' || id === 'flop') this.style = id;
    else if (id === 'pause') this.togglePause();
    else if (id === 'resume') this.screen = 'play';
    else if (id === 'restart' || id === 'retry' || id === 'rematch') this.startMatch(this.match.solo);
    else if (id === 'menu') { this.setScreen('menu'); this.match = new KCH.Match({ solo: true }); this.camB = 0; this.camTarget = 0; }
    else if (id === 'mute') this.audio.setMuted(!this.audio.muted);
    else if (id === 'next') {
      if (this.match.over) { this._finishMatch(); this.setScreen('over'); if (this.match.winner === 0) { this.audio.win(); this._confetti(60); } else this.audio.lose(); }
      else { this.match.nextRound(); this.screen = 'play'; this.focusPending = true; this._beginTurn(); }
    }
  }

  _finishMatch() {
    const st = KCH.Store.data.stats, m = this.match;
    if (m.solo) return;
    st.played++; if (m.winner === 0) st.won++;
    st.holes += this.matchStats.holes; st.airmails += this.matchStats.airmails;
    KCH.Store.save();
  }

  togglePause() {
    if (this.screen === 'play') { this.aim.active = false; this.setScreen('paused'); }
    else if (this.screen === 'paused') this.screen = 'play';
  }

  // ---- throwing -------------------------------------------------------------
  _swayed() {
    const t = Math.max(0, this.time - this.aim.t0);
    const A = (this.reduceMotion ? 1.0 : 3.0) * (1 + Math.max(0, t - 2.5) * 0.5);   // arms tire after a couple of seconds
    return {
      u: this.aim.u + A * (Math.sin(t * 1.9 + 0.4) * 0.8 + Math.sin(t * 3.3 + 1.7) * 0.35),
      s: this.aim.s + A * 1.2 * (Math.sin(t * 2.3 + 1.1) * 0.8 + Math.sin(t * 3.9) * 0.3),
    };
  }

  _humanThrow() {
    if (!this.humanTurn() || !this.aim.active) return;
    const p = this._swayed();
    this.aim.active = false;
    const sig = this.style === 'flop' ? 1.3 : 1.5;
    this._launch(this.style, p.u, p.s, { du: this.rng.gauss() * sig * 0.7, ds: this.rng.gauss() * sig });
  }

  _launch(style, u, s, err) {
    const m = this.match;
    if (!m.throw(style, u, s, err)) return;
    this.camTarget = 1;
    this.turnText = '';
  }

  // ---- sim events -----------------------------------------------------------
  _drain() {
    const sim = this.match.sim;
    for (const e of sim.events) {
      const b = e.bag;
      if (e.type === 'throw') this.audio.whoosh(e.v);
      else if (e.type === 'land') {
        this.audio.thump(e.v);
        this._dust(b.x, b.y, b.z, 4 + Math.round(Math.min(8, e.v / 60)));
        this._addShake(Math.min(5, e.v / 90));
      } else if (e.type === 'push') this.audio.push();
      else if (e.type === 'hole') {
        this.audio.plop(b.airmail);
        this.matchStats.holes += b.team === 0 ? 1 : 0;
        if (b.airmail && b.team === 0) this.matchStats.airmails++;
        if (b.team === 0) KCH.Store.data.stats.bags = (KCH.Store.data.stats.bags || 0);
        this._confetti(b.airmail ? 36 : 22, b.team);
        this._banner(b.airmail ? 'AIRMAIL!' : 'IN THE HOLE!', b.team === 0 ? '+3 for ' + (this.match.solo ? 'you' : 'you') : '+3 for the CPU', b.airmail ? '#fff27a' : '#ffffff', b.airmail ? '#ff7a1f' : '#9be35a');
        const p = KCH.surface.point(0, KCH.CFG.HOLE_S);
        this.popups.push({ x: p.x, y: p.y + 6, z: p.z, text: '+3', color: '#ffe14d', life: 1.4, age: 0, size: 38 });
        if (!this.reduceMotion) this.slowT = 0.7;
        this._addShake(3);
      } else if (e.type === 'ground' || e.type === 'off') {
        if (e.type === 'ground') { this.audio.miss(); this._dust(b.x, 1, b.z, 4); this._banner('MISS', '', '#ffffff', '#9aa3ad', 44); }
      }
    }
    sim.events.length = 0;
  }

  _dust(x, y, z, n) {
    for (let i = 0; i < n; i++) this.particles.push({ kind: 'dust', x: x + (Math.random() - 0.5) * 4, y: y + 1, z: z + (Math.random() - 0.5) * 4, vx: (Math.random() - 0.5) * 30, vy: 12 + Math.random() * 24, vz: (Math.random() - 0.5) * 30, life: 0.5 + Math.random() * 0.3, max: 0.8, size: 1.6 + Math.random() * 1.6 });
  }

  _confetti(n, team) {
    if (this.reduceMotion) return;
    const cols = ['#ffe14d', '#ff5d6a', '#5ec8ff', '#9be35a', '#ffffff', '#ff9a1f'];
    for (let i = 0; i < n; i++) this.particles.push({ kind: 'confetti', sx: 480 + (Math.random() - 0.5) * 240, sy: 240 + Math.random() * 40, vsx: (Math.random() - 0.5) * 360, vsy: -260 - Math.random() * 260, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14, life: 1.4 + Math.random() * 0.9, max: 2.2, size: 3 + Math.random() * 3, color: cols[i % cols.length] });
  }

  _banner(text, sub, c1, c2, size) { this.banner = { text, sub, c1, c2, size, life: 1.5, age: 0 }; }
  _addShake(v) { if (!this.reduceMotion) this.shake = Math.min(8, this.shake + v); }

  // ---- input ----------------------------------------------------------------
  _pt(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * KCH.Render.W / r.width, y: (e.clientY - r.top) * KCH.Render.H / r.height };
  }

  _aimFrom(p) {
    const y = p.y - (this.coarse ? 56 : 0);                 // keep the reticle clear of a fingertip
    const q = KCH.Render.unprojectBoard(p.x, y);
    if (!q) return;
    this.aim.u = KCH.Util.clamp(q.u, -22, 22);
    this.aim.s = KCH.Util.clamp(q.s, -8, KCH.CFG.SLEN + 10);
  }

  _bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', e => this._onDown(e));
    c.addEventListener('pointermove', e => this._onMove(e));
    c.addEventListener('pointerup', e => this._onUp(e));
    c.addEventListener('pointercancel', () => { this.aim.active = false; });
    c.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('keydown', e => this._onKey(e));
    document.addEventListener('visibilitychange', () => { if (document.hidden) { if (this.screen === 'play') this.togglePause(); this.audio.suspend(); } else this.audio.resume(); });
    window.addEventListener('blur', () => { if (this.screen === 'play') this.togglePause(); });
  }

  _firstGesture() { if (this.audio.ensure()) this.audio.startMusic(); }

  _onDown(e) {
    this._firstGesture();
    const p = this._pt(e);
    const i = KCH.UI.hit(p.x, p.y);
    if (i >= 0) { e.preventDefault(); this.activate(KCH.UI.buttons[i].id); return; }
    if (this.humanTurn()) {
      this.aim.active = true; this.aim.t0 = this.time; this.aim.key = false;
      this._aimFrom(p);
      try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    }
  }

  _onMove(e) {
    const p = this._pt(e);
    if (this.aim.active && !this.aim.key) { this._aimFrom(p); return; }
    const i = KCH.UI.hit(p.x, p.y);
    if (i >= 0) this.focusIdx = i; else if (this.screen === 'play') this.focusIdx = -1;
    this.canvas.style.cursor = i >= 0 ? 'pointer' : (this.humanTurn() ? 'crosshair' : 'default');
  }

  _onUp(e) {
    if (this.aim.active && !this.aim.key) { this._aimFrom(this._pt(e)); this._humanThrow(); }
  }

  _onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    this._firstGesture();
    if (k === 'm' || k === 'M') { this.audio.setMuted(!this.audio.muted); return; }
    if (k === 'p' || k === 'P' || k === 'Escape') { e.preventDefault(); if (this.screen === 'play' || this.screen === 'paused') this.togglePause(); else if (this.screen === 'over' || this.screen === 'roundEnd') {/* keep */} return; }
    if (this.screen !== 'play') {
      const n = KCH.UI.buttons.length; if (!n) return;
      if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'Tab') { e.preventDefault(); this.focusIdx = Math.min(n - 1, this.focusIdx + 1); }
      else if (k === 'ArrowLeft' || k === 'ArrowUp') { e.preventDefault(); this.focusIdx = Math.max(0, this.focusIdx - 1); }
      else if (k === 'Enter' || k === ' ') { e.preventDefault(); const b = KCH.UI.buttons[this.focusIdx]; if (b && !b.disabled) this.activate(b.id); }
      return;
    }
    if (k === 's' || k === 'S') { this.style = this.style === 'slide' ? 'flop' : 'slide'; this.audio.click(); return; }
    if ((k === 'r' || k === 'R')) { this.startMatch(this.match.solo); return; }
    if (!this.humanTurn()) return;
    const A = this.aim;
    const nudge = (du, ds) => { if (!A.active) { A.active = true; A.t0 = this.time; A.key = true; } A.key = true; A.u = KCH.Util.clamp(A.u + du, -22, 22); A.s = KCH.Util.clamp(A.s + ds, -8, KCH.CFG.SLEN + 10); };
    if (k === 'ArrowLeft') { e.preventDefault(); nudge(-1, 0); }
    else if (k === 'ArrowRight') { e.preventDefault(); nudge(1, 0); }
    else if (k === 'ArrowUp') { e.preventDefault(); nudge(0, 1.5); }
    else if (k === 'ArrowDown') { e.preventDefault(); nudge(0, -1.5); }
    else if (k === ' ' || k === 'Enter') { e.preventDefault(); if (!A.active) { A.active = true; A.t0 = this.time; A.key = true; } this._humanThrow(); }
  }

  // ---- loop -------------------------------------------------------------------
  _frame(ts) {
    requestAnimationFrame(this._frame);
    const dt = Math.min(0.1, (ts - this.last) / 1000) || 0;
    this.last = ts;
    this._update(dt);
    this._render();
  }

  _update(dt) {
    this.time += dt;
    if (this.slowT > 0) { this.slowT -= dt; this.timeScale = this.slowT > 0 ? 0.35 : 1; } else this.timeScale = 1;
    const sdt = dt * this.timeScale;
    if (this.turnT > 0) this.turnT -= dt;
    if (this.banner) { this.banner.age += dt; this.banner.life -= dt; if (this.banner.life <= 0) this.banner = null; }
    for (const p of this.popups) { p.age += dt; p.life -= dt; }
    this.popups = this.popups.filter(p => p.life > 0);
    this.shake *= Math.exp(-dt * 9);

    // particles
    for (const p of this.particles) {
      p.life -= sdt;
      if (p.kind === 'confetti') { p.sx += p.vsx * sdt; p.sy += p.vsy * sdt; p.vsy += 620 * sdt; p.vsx *= 0.99; p.rot += p.vr * sdt; }
      else { p.x += p.vx * sdt; p.y += p.vy * sdt; p.z += p.vz * sdt; p.vy -= 20 * sdt; }
    }
    this.particles = this.particles.filter(p => p.life > 0);

    // camera blend toward the target view
    const rate = this.camTarget > this.camB ? 1.5 : 1.1;
    this.camB += Math.sign(this.camTarget - this.camB) * Math.min(Math.abs(this.camTarget - this.camB), dt * rate);

    if (this.screen === 'play') {
      const m = this.match;
      // fixed-step simulation
      this.acc += sdt;
      let n = 0;
      while (this.acc >= 1 / 120 && n < 12) { m.sim.step(1 / 120); this.acc -= 1 / 120; n++; }
      if (this.acc > 1 / 30) this.acc = 0;
      this._drain();
      this.skidT -= dt;
      if (this.skidT <= 0) { for (const b of m.sim.bags) if (b.state === 'board' && Math.hypot(b.vu, b.vs) > 22) { this.audio.skid(Math.hypot(b.vu, b.vs)); this.skidT = 0.18; break; } }

      if (m.phase === 'settle' && m.sim.settled()) this._afterSettle();
      if (this.pendingSummary) { this.roundEndT -= dt; if (this.roundEndT <= 0) this._openSummary(); }
      if (this.cpu) this._updateCpu(dt);
    } else if (this.screen === 'roundEnd' || this.screen === 'over') this.overlayT += dt;
    else this.overlayT += dt;
  }

  _updateCpu(dt) {
    const c = this.cpu, m = this.match;
    c.t += dt;
    if (c.stage === 'think' && c.t > 0.9) {
      const ex = KCH.AI.execute(m, 1, this.level, this.rng);
      c.plan = ex; c.stage = 'aim'; c.t = 0;
      this.style = this.style;                       // (the human's toggle is unaffected)
    } else if (c.stage === 'aim') {
      const k = KCH.Util.smooth(c.t / 0.8);
      this.aim.u = KCH.Util.lerp(c.from.u, c.plan.u, k); this.aim.s = KCH.Util.lerp(c.from.s, c.plan.s, k);
      this.aim.active = true; this.aim.key = true; this.aim.t0 = this.time;
      if (c.t >= 0.95) {
        this.aim.active = false;
        this.cpu = null;
        this._launch(c.plan.style, c.plan.u, c.plan.s, c.plan.err);
        c.from = { u: c.plan.u, s: c.plan.s };
      }
    }
  }

  _cameraPose() {
    const k = KCH.Util.smooth(this.camB), S = KCH.surface.point(0, KCH.CFG.SLEN * 0.55);
    const a = { x: 0, y: 58, z: 150 }, b = { x: 0, y: 34, z: 252 };
    const lookA = { x: 0, y: 3, z: 344 }, lookB = { x: 0, y: S.y - 3, z: S.z + 8 };
    const L = (p, q) => p + (q - p) * k;
    let shx = 0, shy = 0;
    if (this.shake > 0.1) { shx = (Math.random() - 0.5) * this.shake * 0.4; shy = (Math.random() - 0.5) * this.shake * 0.3; }
    return { px: L(a.x, b.x) + shx, py: L(a.y, b.y) + shy, pz: L(a.z, b.z), tx: L(lookA.x, lookB.x), ty: L(lookA.y, lookB.y), tz: L(lookA.z, lookB.z) };
  }

  _render() {
    const ctx = this.ctx, R = KCH.Render;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, R.W, R.H);
    const cp = this._cameraPose();
    R.setCamera(cp.px, cp.py, cp.pz, cp.tx, cp.ty, cp.tz);

    R.drawBackdrop(ctx, this.time);
    R.drawFence(ctx, this.time);
    R.drawLawn(ctx);
    R.drawProps(ctx);
    const inMenu = this.screen === 'menu';
    if (!inMenu) R.drawBoard(ctx, this.time);

    const m = this.match, bags = inMenu ? [] : m.sim.bags.slice().sort((a, b) => b.z - a.z);
    for (const b of bags) R.drawBag(ctx, b);
    R.drawParticles(ctx, this.particles);

    // aim helper
    const showAim = this.screen === 'play' && (this.aim.active || this.humanTurn());
    if (showAim && this.camB < 0.2) {
      const p = this.cpu ? this.aim : (this.aim.active ? this._swayed() : this.aim);
      if (this.aim.active) {
        const style = this.cpu && this.cpu.plan ? this.cpu.plan.style : this.style;
        R.drawReticle(ctx, p.u, p.s, this.time, KCH.surface.overBoard(p.u, KCH.CFG.BOARD_Z0 + p.s * Math.cos(KCH.CFG.THETA), 0));
      }
    }
    if (this.screen === 'play' && this.camB < 0.35 && !this.match.over && this.match.phase === 'throw') {
      const team = this.match.team;
      const pull = this.aim.active ? Math.min(1, (this.time - this.aim.t0) * 0.5) : 0;
      ctx.save(); ctx.globalAlpha = 1 - this.camB / 0.35;
      R.drawHands(ctx, team, this.aim.u, pull * 0.4, this.time, this.cpu && this.cpu.plan ? this.cpu.plan.style : this.style);
      ctx.restore();
    }

    KCH.UI.begin();
    if (this.screen === 'play' || this.screen === 'paused' || this.screen === 'roundEnd' || this.screen === 'over') KCH.UI.hud(ctx, this);
    if (this.screen === 'menu') KCH.UI.menu(ctx, this);
    else if (this.screen === 'paused') { KCH.UI.buttons.length = 0; KCH.UI.pause(ctx, this); }
    else if (this.screen === 'roundEnd') { KCH.UI.buttons.length = 0; KCH.UI.roundEnd(ctx, this); }
    else if (this.screen === 'over') { KCH.UI.buttons.length = 0; KCH.UI.over(ctx, this); }

    if (this.focusPending) {
      let i = KCH.UI.buttons.findIndex(b => b.primary && !b.hud);
      if (i < 0 && this.screen !== 'play') i = KCH.UI.buttons.findIndex(b => !b.disabled && !b.hud);
      this.focusIdx = i; this.focusPending = false;
    }
  }
};

document.addEventListener('DOMContentLoaded', () => { window.KCHGame = new KCH.Game(document.getElementById('gameCanvas')); });
