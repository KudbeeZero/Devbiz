/* =====================================================================
 * Kudbee Cricket — game.js
 * The controller. One ball at a time: READY -> RUN-UP -> FLIGHT (tap to swing)
 * -> the outcome plays out (a high field-view replay for hits, the bat view
 * for misses) -> next ball. All rules/physics live in sim.js; this file is
 * input, timing, the camera, and the juice. Logical canvas is 960x640.
 * ===================================================================== */

KCK.Game = class {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = KCK.Render.W * this.dpr; canvas.height = KCK.Render.H * this.dpr;
    this.coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    KCK.Store.load();
    this.audio = new KCK.Audio();
    this.screen = 'menu';              // menu | play | paused | over
    this.time = 0; this.last = 0; this.focusIdx = -1; this.focusPending = true; this.overlayT = 0; this.shake = 0;
    this.particles = []; this.banner = null; this.feedback = null; this.hint = ''; this.hintT = 0;
    this.deliveryLabel = ''; this.deliveryT = 0;
    this.loft = false; this.aimDeg = 0; this.camB = 0; this.camTarget = 0;
    this.rng = KCK.Util.rng((Date.now() ^ 0x51ed270b) >>> 0);
    this.match = new KCK.Match({ level: 1, overs: 1, seed: 1 });
    this.fieldNow = []; this.bp = 'idle'; this.bpT = 0; this.bt = 0; this.cur = null;
    this._bind();
    this._frame = this._frame.bind(this);
    requestAnimationFrame(this._frame);
  }

  // ---- flow ---------------------------------------------------------------------
  startMatch() {
    const D = KCK.Store.data;
    this.match = new KCK.Match({ level: D.difficulty, overs: D.overs, seed: (this.rng() * 4294967296) >>> 0 });
    this.screen = 'play'; this.particles.length = 0; this.banner = null; this.feedback = null;
    this.camB = 0; this.camTarget = 0; this.focusIdx = -1; this.focusPending = true; this.loft = false; this.counted = false;
    this.hint = 'TAP TO SWING  ·  WHERE YOU TAP AIMS THE SHOT'; this.hintT = 4;
    this._nextBall();
  }

  _nextBall() {
    const m = this.match;
    this.cur = m.nextBall();
    this.fieldNow = this.cur.field;
    this.bp = 'ready'; this.bpT = 0; this.bt = 0; this.tap = null; this.out = null; this.hit = null;
    this.deliveryLabel = ''; this.stumpsHit = false; this.ballHidden = false; this.camTarget = 0; this.events = [];
    if (m.freeHit) { this.hint = 'FREE HIT  ·  YOU CANNOT BE OUT'; this.hintT = 2.5; }
  }

  setScreen(s) { this.screen = s; this.overlayT = 0; this.focusPending = true; }

  activate(id) {
    this.audio.ensure(); this.audio.click();
    const D = KCK.Store.data;
    if (id === 'play') this.startMatch();
    else if (/^lv\d$/.test(id)) { D.difficulty = parseInt(id[2], 10); KCK.Store.save(); }
    else if (/^ov\d$/.test(id)) { D.overs = parseInt(id[2], 10); KCK.Store.save(); }
    else if (id === 'ground') this.loft = false;
    else if (id === 'loft') this.loft = true;
    else if (id === 'pause') this.togglePause();
    else if (id === 'resume') this.screen = 'play';
    else if (id === 'restart' || id === 'rematch') this.startMatch();
    else if (id === 'retry') this.startMatch();
    else if (id === 'menu') { this.setScreen('menu'); this.camB = 0; this.camTarget = 0; this.fieldNow = []; }
    else if (id === 'mute') this.audio.setMuted(!this.audio.muted);
  }

  togglePause() {
    if (this.screen === 'play') this.setScreen('paused');
    else if (this.screen === 'paused') this.screen = 'play';
  }

  // ---- input --------------------------------------------------------------------
  _pt(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * KCK.Render.W / r.width, y: (e.clientY - r.top) * KCK.Render.H / r.height };
  }
  _aimFromX(x) { this.aimDeg = KCK.Util.clamp((x - 480) / 480 * 95, -90, 90); }

  _bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', e => this._onDown(e));
    c.addEventListener('pointermove', e => this._onMove(e));
    c.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('keydown', e => this._onKey(e));
    document.addEventListener('visibilitychange', () => { if (document.hidden) { if (this.screen === 'play') this.togglePause(); this.audio.suspend(); } else this.audio.resume(); });
    window.addEventListener('blur', () => { if (this.screen === 'play') this.togglePause(); });
  }
  _firstGesture() { if (this.audio.ensure()) this.audio.startMusic(); }

  _onDown(e) {
    this._firstGesture();
    const p = this._pt(e), i = KCK.UI.hit(p.x, p.y);
    if (i >= 0) { e.preventDefault(); this.activate(KCK.UI.buttons[i].id); return; }
    if (this.screen === 'play') { this._aimFromX(p.x); this.swing(); }
  }
  _onMove(e) {
    const p = this._pt(e), i = KCK.UI.hit(p.x, p.y);
    if (i >= 0) this.focusIdx = i; else if (this.screen === 'play') this.focusIdx = -1;
    this.canvas.style.cursor = i >= 0 ? 'pointer' : (this.screen === 'play' ? 'crosshair' : 'default');
    if (this.screen === 'play' && i < 0 && (e.pointerType === 'mouse' || e.buttons)) this._aimFromX(p.x);
  }
  _onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    this._firstGesture();
    if (k === 'm' || k === 'M') { this.audio.setMuted(!this.audio.muted); return; }
    if (k === 'p' || k === 'P' || k === 'Escape') { e.preventDefault(); if (this.screen === 'play' || this.screen === 'paused') this.togglePause(); return; }
    if (this.screen !== 'play') {
      const n = KCK.UI.buttons.length; if (!n) return;
      if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'Tab') { e.preventDefault(); this.focusIdx = Math.min(n - 1, this.focusIdx + 1); }
      else if (k === 'ArrowLeft' || k === 'ArrowUp') { e.preventDefault(); this.focusIdx = Math.max(0, this.focusIdx - 1); }
      else if (k === 'Enter' || k === ' ') { e.preventDefault(); const b = KCK.UI.buttons[this.focusIdx]; if (b && !b.disabled) this.activate(b.id); }
      return;
    }
    if (k === 'l' || k === 'L') { this.loft = !this.loft; this.audio.click(); return; }
    if (k === 'r' || k === 'R') { this.startMatch(); return; }
    if (k === 'ArrowLeft') { e.preventDefault(); this.aimDeg = KCK.Util.clamp(this.aimDeg - 6, -90, 90); }
    else if (k === 'ArrowRight') { e.preventDefault(); this.aimDeg = KCK.Util.clamp(this.aimDeg + 6, -90, 90); }
    else if (k === ' ' || k === 'Enter' || k === 'ArrowUp') { e.preventDefault(); this.swing(); }
  }

  // Record the swing; the outcome is resolved when the ball reaches the bat.
  swing() {
    if (this.screen !== 'play' || this.bp !== 'flight' || this.tap) return;
    this.tap = { t: this.bt, aim: this.aimDeg, loft: this.loft };
    this.audio.whoosh();
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
    if (this.feedback) { this.feedback.life -= dt; if (this.feedback.life <= 0) this.feedback = null; }
    if (this.hintT > 0) this.hintT -= dt;
    if (this.deliveryT > 0) this.deliveryT -= dt;
    this.shake *= Math.exp(-dt * 9);
    for (const p of this.particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.rot += p.vr * dt; }
    this.particles = this.particles.filter(p => p.life > 0);
    const rate = 1.8; this.camB += Math.sign(this.camTarget - this.camB) * Math.min(Math.abs(this.camTarget - this.camB), dt * rate);

    if (this.screen === 'play') this._updateBall(dt);
    else this.overlayT += dt;
  }

  _updateBall(dt) {
    const m = this.match, cur = this.cur, del = cur.del;
    this.bpT += dt;
    if (this.bp === 'ready') {
      if (this.bpT > 1.0) { this.bp = 'runup'; this.bpT = 0; this.audio.bowl(); }
    } else if (this.bp === 'runup') {
      if (this.bpT > 0.95) { this.bp = 'flight'; this.bpT = 0; this.bt = 0; this.bounced = false; this.deliveryLabel = del.label; this.deliveryT = 1.6; if (del.noBall) { this.hint = 'NO BALL'; this.hintT = 1.2; } }
    } else if (this.bp === 'flight') {
      this.bt += dt;
      if (!this.bounced && this.bt >= del.bounceT) { this.bounced = true; this.audio.bounce(); }
      if (this.bt >= del.tArr) this._resolve();
    } else if (this.bp === 'hit') {
      this.hit.t += dt;
      while (this.events.length && this.events[0].t <= this.hit.t) this.events.shift().fn();
      if (this.hit.t >= this.hit.dur) this._endBall();
    } else if (this.bp === 'miss') {
      this.hit.t += dt; this.bt += dt;
      while (this.events.length && this.events[0].t <= this.hit.t) this.events.shift().fn();
      if (this.hit.t >= this.hit.dur) this._endBall();
    } else if (this.bp === 'between') {
      if (this.bpT > 0.7) { if (m.over) this._finishMatch(); else this._nextBall(); }
    }
  }

  _fb(text, color, life) { this.feedback = { text, color, life: life || 1.1 }; }
  _banner(text, c1, c2, sub, size) { this.banner = { text, c1, c2, sub, size, age: 0, life: 1.7 }; }
  _burst(n) {
    const cols = ['#ffe14d', '#ff6b5a', '#7ac7ff', '#a9ec62', '#ffffff', '#c46bff'];
    for (let i = 0; i < n; i++) this.particles.push({ x: 120 + this.rng() * 720, y: -20 - this.rng() * 120, vx: (this.rng() - 0.5) * 120, vy: 40 + this.rng() * 120, g: 260, rot: this.rng() * 6, vr: (this.rng() - 0.5) * 9, life: 2.2 + this.rng(), col: cols[Math.floor(this.rng() * cols.length)] });
  }

  _resolve() {
    const m = this.match, cur = this.cur, del = cur.del, tap = this.tap;
    const o = m.resolve(tap ? tap.t : null, tap ? tap.aim : 0, tap ? tap.loft : false);
    this.out = o; this.events = [];
    const s = o.shot;
    // timing feedback
    if (tap) {
      if (s && s.contact) {
        const late = s.d > 0.04 ? ' (LATE)' : s.d < -0.04 ? ' (EARLY)' : '';
        if (o.shot.edge) this._fb('EDGED!', '#ffb86b'); else if (s.perfect) this._fb('PERFECT!', '#fff27a'); else if (s.q > 0.75) this._fb('GREAT' + late, '#a9ec62'); else this._fb('GOOD' + late, '#ffffff');
      } else this._fb(o.missReason === 'early' ? 'TOO EARLY' : o.missReason === 'late' ? 'TOO LATE' : o.missReason === 'high' ? 'TOO HIGH' : 'OUT OF REACH', '#ff9a8a');
    }
    if (o.contact) {
      const fd = o.fielded, dur = Math.max(2.4, Math.min(6.2, fd.t + (o.runs > 0 && o.runs < 4 ? o.runs * 1.4 : 1.2)));
      this.hit = { t: 0, dur, path: o.path, fd };
      this.bp = 'hit'; this.camTarget = 1;
      if (s.edge) this.audio.edge(); else this.audio.crack(s.speed);
      this.shake = Math.max(this.shake, s.perfect ? 7 : 3);
      const E = (t, fn) => this.events.push({ t, fn });
      if (o.kind === 'six') { E(Math.min(fd.t, 3) * 0.7, () => { this._banner('SIX!', '#e6c0ff', '#9a45e6'); this.audio.cheer(true); this._burst(60); this.shake = 8; }); }
      else if (o.kind === 'four') { E(Math.min(fd.t, 4) * 0.75, () => { this._banner('FOUR!', '#c4ecff', '#2f86d8'); this.audio.cheer(false); this._burst(24); }); }
      else if (o.kind === 'wicket') { E(fd.t, () => { this.audio.catchSnap(); this._banner(o.wicket === 'caught behind' ? 'CAUGHT BEHIND!' : 'CAUGHT!', '#ffd0c8', '#e8483a', o.fielder ? o.fielder.role : '', 64); this.audio.groan(); this.shake = 7; }); }
      else if (o.dropped) { E(fd.t - 0.6, () => { this._banner('DROPPED!', '#fff6a8', '#ffb82e', 'a life!', 66); }); }
      else if (o.safe) { E(fd.t, () => this._banner('SAFE!', '#fff6a8', '#ffb82e', 'free hit', 66)); }
      else if (o.runs) { E(Math.min(fd.t + 0.4, 3.5), () => { this._banner(o.runs + (o.runs > 1 ? ' RUNS' : ' RUN'), '#d6ffb0', '#53bd3c', '', 58); this.audio.cheer(false); }); }
      else { E(fd.t + 0.3, () => this._banner('NO RUN', '#ffffff', '#9aa3ad', '', 48)); }
      if (o.noBall) E(0.2, () => { this.hint = 'NO BALL  ·  FREE HIT NEXT'; this.hintT = 2; });
    } else {
      this.bp = 'miss'; this.camTarget = 0; this.hit = { t: 0, dur: 1.5, path: null, fd: null };
      const E = (t, fn) => this.events.push({ t, fn });
      if (o.kind === 'wicket') { E(del.stump ? del.stump.t - del.tArr : 0.15, () => { this.stumpsHit = true; this.stumpsT = 0; this.audio.stumps(); this._banner('BOWLED!', '#ffd0c8', '#e8483a', '', 76); this.audio.groan(); this.shake = 9; }); this.hit.dur = 2.0; }
      else if (o.kind === 'wide') E(0.3, () => this._banner('WIDE', '#fff6a8', '#ffb82e', '+1 run', 70));
      else if (o.noBall) E(0.2, () => { this._banner('NO BALL!', '#fff6a8', '#ffb82e', 'free hit next', 60); });
      else { E(0.4, () => this._banner(o.safe ? 'MISSED THE STUMPS' : 'DOT BALL', '#ffffff', '#9aa3ad', '', 48)); }
    }
  }

  _endBall() {
    this.camTarget = 0; this.bp = 'between'; this.bpT = 0; this.banner = null;
    if (this.match.over) this.camTarget = 0;
  }

  _finishMatch() {
    const m = this.match, st = KCK.Store.data.stats;
    st.played++; if (m.result === 'win') st.won++;
    st.runs += m.runs; st.fours += m.stats.fours; st.sixes += m.stats.sixes; st.wickets += m.wk; st.best = Math.max(st.best, m.runs);
    KCK.Store.save();
    this.setScreen('over');
    if (m.result === 'win') { this.audio.win(); this._burst(80); } else this.audio.lose();
  }

  // ---- drawing ------------------------------------------------------------------
  _render() {
    const ctx = this.ctx, R = KCK.Render, U = KCK.UI;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.save();
    if (this.shake > 0.3) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    R.setView(this.camB);
    R.drawWorld(ctx, this.time);
    this._drawScene(ctx);
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
    if (this.screen === 'play' && this.camB < 0.05 && !this.coarse) { /* no focus ring during play */ }
  }

  _ballState() {
    const del = this.cur && this.cur.del, C = KCK.CFG;
    if (!del || this.screen === 'menu') return null;
    if (this.bp === 'flight') return { ...del.at(this.bt) };
    if ((this.bp === 'hit') && this.hit) {
      const S = this.hit.path, fd = this.hit.fd, t = this.hit.t;
      if (t >= fd.t && fd.spot) { return { x: fd.spot.x, y: fd.spot.y, z: fd.kind === 'caught' ? 1.2 : 0.1 }; }
      const i = Math.min(S.length - 1, Math.floor(t * 60)); return { x: S[i].x, y: S[i].y, z: S[i].z };
    }
    if (this.bp === 'miss' && this.hit) { const t = Math.min(del.samples[del.samples.length - 1].t, del.tArr + this.hit.t); return { ...del.at(t) }; }
    return null;
  }

  _fielderPos(f) {
    if (this.bp === 'hit' && this.hit && this.hit.fd.fielder && this.hit.fd.fielder.id === f.id && this.hit.fd.spot) {
      const fd = this.hit.fd, u = KCK.Util.smooth((this.hit.t - KCK.CFG.REACT) / Math.max(0.2, fd.t - KCK.CFG.REACT));
      return { x: KCK.Util.lerp(f.x, fd.spot.x, u), y: KCK.Util.lerp(f.y, fd.spot.y, u), run: u > 0 && u < 1 ? this.time * 14 : null };
    }
    return { x: f.x, y: f.y, run: null };
  }

  _drawScene(ctx) {
    const R = KCK.Render, U = KCK.UI, m = this.match, C = KCK.CFG;
    if (this.screen === 'menu' && !this.cur) { /* empty ground */ }
    R.stumps(ctx, 0); R.stumps(ctx, C.PITCH);
    const batView = R.blend < 0.5, boost = 1 + 1.6 * R.blend;
    const cur = this.cur, del = cur && cur.del;
    // pitch marker
    if (cur && this.bp === 'flight' && batView) {
      const lv = m.level.marker, f = this.bt / del.bounceT;
      if (lv === 'early' || (lv === 'late' && f > 0.35)) { if (this.bt < del.bounceT + 0.15) R.marker(ctx, del.bounceX, del.bounceY, 0.5 + 0.3 * Math.sin(this.time * 10)); }
    }
    if (this.screen === 'play' && batView && (this.bp === 'ready' || this.bp === 'runup' || this.bp === 'flight') && !(this.tap)) R.aim(ctx, this.aimDeg, this.loft, this.time);
    // people, far to near
    const people = [];
    const teamF = R.TEAM.field, teamB = R.TEAM.bat;
    if (cur) for (const f of this.fieldNow) {
      if (batView && (f.y < 2 || f.role === 'KEEPER')) { if (!(R.blend > 0.05)) continue; }
      const p = this._fielderPos(f);
      people.push({ x: p.x, y: p.y, o: { shirt: teamF.base, shirtDark: teamF.dark, pants: '#f4f4f4', face: 'front', run: p.run, boost: f.role === 'BOWLER' ? 1 : boost, arms: 0 } });
    }
    // bowler run-up (bat view) replaces the idle bowler figure
    if (cur && (this.bp === 'ready' || this.bp === 'runup' || this.bp === 'flight')) {
      const bi = people.findIndex(q => q.y > 18 && q.y < 19 && q.x < 1.2 && q.x > 0.5);
      if (bi >= 0) people.splice(bi, 1);
      let by = 34, bx = 1.4, run = null, arms = 0;
      if (this.bp === 'runup') { const u = this.bpT / 0.95; by = KCK.Util.lerp(34, C.REL_Y, u * u * 0.4 + u * 0.6); bx = KCK.Util.lerp(1.4, 0.45, u); run = this.time * 13; arms = u > 0.8 ? (u - 0.8) * 5 : 0; }
      else if (this.bp === 'flight') { by = C.REL_Y - Math.min(1.5, this.bt * 5); bx = 0.45; arms = Math.max(0, 1 - this.bt * 6); }
      people.push({ x: bx, y: by, o: { shirt: teamF.light, shirtDark: teamF.base, face: 'front', run, arms, boost: boost * 0.95 } });
    }
    // non-striker
    people.push({ x: 1.0, y: C.PITCH - 0.4, o: { shirt: teamB.base, shirtDark: teamB.dark, face: 'back', helmet: true, boost } });
    // batter
    const swingU = this.tap && this.bp !== 'idle' ? KCK.Util.clamp((this.bt - this.tap.t) / 0.14, 0, 1) : (this.bp === 'hit' || this.bp === 'miss' ? 1 : 0);
    const bu = this.bp === 'hit' || this.bp === 'miss' ? KCK.Util.clamp(1 - (this.hit ? this.hit.t : 0) * 1.5, 0.35, 1) * (this.tap ? 1 : 0.1) : swingU;
    const bwait = this.bp === 'ready' || this.bp === 'runup' || (this.bp === 'flight' && !this.tap);
    people.push({ x: -0.3, y: 0.15, o: { shirt: teamB.base, shirtDark: teamB.dark, face: 'back', helmet: true, bat: bwait ? 0.12 + 0.04 * Math.sin(this.time * 3) : bu, num: m.batterIdx + 7, boost, arms: 0.2 } });
    people.sort((a, b) => b.y - a.y);
    for (const q of people) R.person(ctx, q.x, q.y, q.o);
    // stumps shatter
    if (this.stumpsHit) {
      this.stumpsT = (this.stumpsT || 0) + 0.016;
      for (let i = 0; i < 3; i++) { const a = (i - 1) * 0.5 * this.stumpsT * 2; R.line3(ctx, [(i - 1) * 0.1 + (i - 1) * this.stumpsT * 0.8, -0.1 - this.stumpsT * 1.2, 0.02], [(i - 1) * 0.1 + (i - 1) * this.stumpsT * 1.5, -0.1 - this.stumpsT * 2.4, 0.5], '#f7ecc8', 4); }
    }
    // ball
    const b = this._ballState();
    if (b && !this.ballHidden) {
      let trail = null;
      if (this.bp === 'hit' && this.hit) { const S = this.hit.path, i = Math.min(S.length - 1, Math.floor(this.hit.t * 60)); trail = []; for (let j = Math.max(0, i - 40); j < i; j += 2) trail.push(S[j]); }
      R.ball(ctx, b, trail, this.time);
      if (this.bp === 'hit' && this.hit && this.hit.fd.spot && this.hit.t < this.hit.fd.t) { const s = this.hit.fd.spot; if (this.hit.fd.kind === 'caught' || this.hit.fd.kind === 'dropped') R.marker(ctx, s.x, s.y, 0.7); }
    }
    // batters running between the wickets (field view)
    if (this.bp === 'hit' && this.out && this.out.runs > 0 && this.out.runs < 4 && R.blend > 0.4) {
      const t = this.hit.t - 0.3;
      if (t > 0) { const k = Math.min(this.out.runs, 3), cyc = Math.min(k, t / C.RUN_T), ph = cyc - Math.floor(cyc), dir = Math.floor(cyc) % 2;
        const y1 = C.PITCH * (dir ? 1 - ph : ph), y2 = C.PITCH - y1;
        R.person(ctx, -0.6, y1, { shirt: teamB.base, shirtDark: teamB.dark, face: 'back', run: this.time * 14, helmet: true, boost });
        R.person(ctx, 0.6, y2, { shirt: teamB.light, shirtDark: teamB.base, face: 'back', run: this.time * 14, helmet: true, boost }); }
    }
  }
};

document.addEventListener('DOMContentLoaded', () => { window.KCKGame = new KCK.Game(document.getElementById('gameCanvas')); });
