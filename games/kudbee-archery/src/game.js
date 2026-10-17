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
    this.camB = 0; this.camTip = null; this.landT = -9; this.streak = 0; this.drama = '';
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
    const seed = (this.rng() * 4294967296) >>> 0;
    const day = KAR.Daily.day();
    if (D.mode === 5 && !KAR.tourOpen(D.tourLv, D)) D.tourLv = 0;
    this.match = D.mode === 5 ? new KAR.Stage({ level: D.tourLv, seed }) : D.mode === 2 ? new KAR.Trick({ seed }) : D.mode === 4 ? new KAR.Trick({ seed: KAR.Daily.seed(day), daily: day })
      : D.mode === 3 ? new KAR.Swing({ seed }) : new KAR.Match({ mode: D.mode === 1 ? 'duel' : 'range', dist: KAR.locked(D.dist, D) ? 2 : D.dist, level: D.level, seed });
    this.shared = -9; this.unlocked = false;
    this.trickShown = 0; this.trickCombo = 0; this.relT = -9;
    this.screen = 'play'; this.particles.length = 0; this.pops.length = 0; this.banner = null; this.newBest = false;
    this.focusIdx = -1; this.focusPending = true; this.showEnd = 0; this.zoom = 1; this.zoomTarget = 1;
    this.camB = 0; this.camTip = null; this.streak = 0; this.drama = '';
    this.hint = this.coarse ? 'TOUCH & HOLD TO DRAW  ·  DRAG TO AIM  ·  LIFT TO LOOSE' : 'PRESS & HOLD TO DRAW  ·  MOVE TO AIM  ·  RELEASE TO LOOSE'; this.hintT = 6;
    if (this.match.mode === 'trick') { this.hint = (this.match.daily ? 'DAILY #' + this.match.daily + '  ·  ' : '') + 'POP THE BALLOONS  ·  LEAD THE MOVERS  ·  GOLD = +2 ARROWS'; this.hintT = 6; }
    if (this.match.mode === 'swing') { this.hint = 'THE TARGET SWINGS  ·  LEAD IT  ·  LOOSE AS IT COMES TO YOU'; this.hintT = 6; }
    if (this.match.mode === 'stage') { const L = this.match.def; this.hint = 'LEVEL ' + (this.match.lv + 1) + '  ·  ' + L.name + '  ·  ' + L.tip.toUpperCase(); this.hintT = 6; }
    this._nextShot();
  }

  human() { return this.screen === 'play' && this.match.shooter === 0 && !this.cpu && this.bp === 'ready'; }

  _nextShot() {
    const m = this.match;
    this._resetShot();
    if (m.arrowNo === 0) this.showEnd = m.endNo;
    this.bp = 'ready'; this.bpT = 0; this.zoomTarget = 1; this.camB = 0; this.orbit = 0;
    this.aimX = 0; this.aimY = KAR.CFG.FACE_Y;
    this.ptr = { x: 480, y: 330 }; this._setAimFromPtr();
    if (m.shooter === 1) this.cpu = { t: 0, stage: 'think', plan: null };
    this.drama = this._drama();
  }

  // Last-arrow pressure, shown across the top while that arrow is up.
  _drama() {
    const m = this.match, D = KAR.Store.data, n = m.needs(m.mode === 'stage' ? D.tour.best[m.lv] : D.best[m.distIdx]);
    if (!n) return '';
    if (m.mode === 'stage') {
      if (n.clear !== null) return n.clear > 10 ? 'LAST ARROW' : 'LAST ARROW \u00b7 NEED ' + n.clear + ' TO CLEAR THE LEVEL';
      return n.star3 !== null && n.star3 <= 10 ? 'LAST ARROW \u00b7 ' + n.star3 + ' FOR 3 STARS' : 'LAST ARROW';
    }
    if (m.mode === 'range') {
      const parts = [];
      if (n.best !== null && n.best <= 0) return 'NEW BEST LOCKED IN \u00b7 FINISH IT!';
      if (n.best !== null && n.best <= 10) parts.push('NEED ' + n.best + ' FOR A NEW BEST');
      if (n.star3 !== null && n.star3 <= 10) parts.push(n.star3 + ' FOR 3 STARS');
      return parts.length ? 'LAST ARROW \u00b7 ' + parts.join(' \u00b7 ') : 'LAST ARROW';
    }
    if (n.win > 10) return n.tie === 10 ? 'CPU NEEDS A 10 TO TIE THE END' : 'THE END IS YOURS';
    if (n.win > 0) return 'CPU NEEDS ' + n.win + ' TO TAKE THE END';
    return '';
  }

  setScreen(s) { this.screen = s; this.overlayT = 0; this.focusPending = true; }

  activate(id) {
    this.audio.ensure(); this.audio.click();
    const D = KAR.Store.data;
    if (id === 'play' || id === 'restart' || id === 'rematch' || id === 'retry') this.startMatch();
    else if (/^mode\d$/.test(id)) { D.mode = +id[4]; KAR.Store.save(); }
    else if (/^d\d$/.test(id)) { if (!KAR.locked(+id[1], D)) { D.dist = +id[1]; KAR.Store.save(); } }
    else if (id === 'share') this._share();
    else if (/^L\d\d$/.test(id)) { const i = +id.slice(1); if (KAR.tourOpen(i, D)) { D.tourLv = i; KAR.Store.save(); } }
    else if (id === 'next') { if (D.tourLv < KAR.TOUR.length - 1 && KAR.tourOpen(D.tourLv + 1, D)) D.tourLv++; KAR.Store.save(); this.startMatch(); }
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
    const S = (m.viewD || m.faceD) * 1.3;
    this.aimX = KAR.Util.clamp(q.x, -S, S); this.aimY = KAR.Util.clamp(q.y, KAR.CFG.FACE_Y - S, KAR.CFG.FACE_Y + S);
  }
  _bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', e => this._onDown(e));
    c.addEventListener('pointermove', e => this._onMove(e));
    c.addEventListener('pointerup', e => this._onUp(e));
    // Phones: a still finger held for a second is exactly a full draw, and also what iOS/Android read as a
    // long-press (callout, magnifier, text selection). They answer with pointercancel and then no pointerup,
    // which used to throw the draw away - the bow came back but the arrow never left. So: block those
    // gestures at the touch level, keep the draw through a touch pointercancel, and loose when the last
    // finger actually lifts (touchend fires even after the pointer stream was cancelled).
    c.addEventListener('pointercancel', e => { if (e.pointerType !== 'touch') { this.drawing = false; this.draw = 0; this.holding = false; } });
    const block = e => { if (this.screen === 'play' && e.cancelable) e.preventDefault(); };
    c.addEventListener('touchstart', block, { passive: false });
    c.addEventListener('touchmove', block, { passive: false });
    const lift = e => { this._firstGesture(); if (e.touches.length === 0 && this.drawing && !this.cpu) this._loose(); };
    window.addEventListener('click', () => this._firstGesture());          // iOS unlocks audio on touchend / click
    window.addEventListener('touchend', lift); window.addEventListener('touchcancel', lift);
    c.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('keydown', e => this._onKey(e, true));
    window.addEventListener('keyup', e => this._onKey(e, false));
    document.addEventListener('visibilitychange', () => { if (document.hidden) { if (this.screen === 'play') this.togglePause(); this.audio.suspend(); } else this.audio.resume(); });
    // blur fires for benign focus moves (iframes, preview toolbars): only drop held input; a hidden tab pauses
    // (a mouse button released outside the window is lost, so a desktop draw is dropped; touch keeps it - see above)
    window.addEventListener('blur', () => { this.holding = false; if (this.drawing && !this.cpu && !this.coarse) { this.drawing = false; this.draw = 0; } });
  }
  _firstGesture() { if (this.audio.ensure()) this.audio.startMusic(); }
  _beginDraw() { if (this.human() && !this.drawing) { this.drawing = true; this.draw = 0; this.holdT = 0; this.breath = 1; this.audio.drawStart(); } }

  _onDown(e) {
    this._firstGesture();
    const p = this._pt(e), i = KAR.UI.hit(p.x, p.y);
    if (i >= 0) { e.preventDefault(); this.activate(KAR.UI.buttons[i].id); return; }
    if (this.screen !== 'play') return;
    if (this.bp === 'flight' && this.flight && this.flight.hero) { this.flight.skip = true; return; }
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
    if (k === ' ' || k === 'Enter') { e.preventDefault(); if (down && this.bp === 'flight' && this.flight && this.flight.hero) this.flight.skip = true; else if (down) this._beginDraw(); else if (this.drawing) this._loose(); return; }
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
    // ARROW CAM for the shots worth watching: golds, the odd 7/8 (so the cam alone doesn't give it away),
    // the last arrow of a range, and the CPU's X. The camera rides the arrow in, in slow motion.
    const last = m.over && (m.mode === 'range' || m.mode === 'stage');
    const hero = !res.trick && !!res.hit && (shooter === 0 ? (res.ring >= 9 || last || (res.ring >= 7 && this.rng() < 0.3)) : (res.x || (res.ring === 10 && this.rng() < 0.5)));
    this.flight = { res, t: 0, tEnd, shooter, done: false, hero, real: 0, skip: false };
    this.bp = 'flight'; this.bpT = 0; this.zoomTarget = hero ? 1 : 0; this.draw = 0; this.drama = '';
    this.audio.loose(); this.audio.fly(hero ? tEnd * 2 : tEnd * 0.9);
    if (/^(PRESS|TOUCH|POP|DAILY|THE TARGET|LEVEL)/.test(this.hint)) this.hintT = 0;        // the how-to line has done its job
    this.relT = this.time; this.relTeam = shooter; this.shake = Math.max(this.shake, 2.5);   // the bow kicks away
    if (hero) this.audio.heroIn();
    this.cpu = null;
    if (shooter === 0) { const st = KAR.Store.data.stats; st.arrows++; }
  }

  _land() {
    const f = this.flight, res = f.res, m = this.match, st = KAR.Store.data.stats;
    f.done = true;
    if (res.trick) { this.bp = 'result'; this.bpT = 0; return; }       // balloons pop mid-flight (_pop); the arrow just runs out
    const e = res.hit;
    if (e) this.pops.push({ x: e.x, y: e.y, age: 0, ring: res.ring, team: f.shooter });
    this.landT = this.time;
    if (e) { const q = KAR.Render.proj(e.x, e.y, m.dist); if (q) for (let i = 0; i < 12; i++) { const a = -Math.PI * (0.1 + this.rng() * 0.8), sp = 60 + this.rng() * 160; this.particles.push({ x: q.x, y: q.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 420, rot: this.rng() * 6, vr: (this.rng() - 0.5) * 14, life: 0.35 + this.rng() * 0.35, col: i % 2 ? '#f3d56f' : '#c99a38', w: 5, h: 2 }); } }
    if (f.shooter === 0) { this.streak = res.ring >= 9 ? this.streak + 1 : 0; if (this.streak > st.bestStreak) st.bestStreak = this.streak; if (res.robin) st.robins++; }
    const streak = f.shooter === 0 ? this.streak : 0, row = streak >= 2 ? streak + ' IN A ROW!' : '';
    if (e && res.ring >= 9) { const q = KAR.Render.proj(e.x, e.y, m.dist); if (q) for (let i = 0; i < (res.x ? 26 : 14); i++) { const a = this.rng() * 6.283, sp = 80 + this.rng() * 220; this.particles.push({ x: q.x, y: q.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, g: 320, rot: this.rng() * 6, vr: (this.rng() - 0.5) * 12, life: 0.7 + this.rng() * 0.6, col: ['#fff6a8', '#ffd34d', '#ffffff'][i % 3] }); } }
    this.shake = Math.max(this.shake, res.ring >= 9 ? 6 : 3);
    if (res.robin) { this._banner('ROBIN HOOD!', '#fff6a8', '#3fbf5a', 'arrow split clean in two', 72); this.audio.robin(); this._burst(60); this.shake = 10; }
    else if (res.miss) { this.audio.miss(); this._banner(res.short ? 'SHORT!' : 'MISS', '#ffffff', '#9aa3ad', res.short ? 'fell before the butt' : 'off the face', 70); }
    else {
      this.audio.thud(res.ring);
      const nm = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN'];
      if (res.x) { this._banner('X!', '#fff6a8', '#ffb82e', row || 'PERFECT CENTRE', 110); this.audio.gold(streak); this._burst(40 + streak * 8); }
      else if (res.ring === 10) { this._banner('TEN!', '#fff6a8', '#ffb82e', row || 'gold', 96); this.audio.gold(streak); this._burst(26 + streak * 6); }
      else if (res.ring === 9) { this._banner('NINE', '#fff6a8', '#ff9a1f', row || 'gold', 84); this.audio.cheer(false); if (streak >= 2) this.audio.gold(streak); }
      else this._banner(nm[res.ring], res.ring >= 7 ? '#ffd0c8' : '#c4ecff', res.ring >= 7 ? '#e8483a' : '#2f86d8', '', 70);
    }
    if (f.shooter === 0) { if (res.ring === 10) st.tens++; if (res.x) st.xs++; }
    this.bp = 'result'; this.bpT = 0;
    if (res.endDone && !m.over) { this.hint = 'END COMPLETE  ·  ' + (m.mode === 'duel' ? 'YOU ' + res.endScores[0] + ' – CPU ' + res.endScores[1] : res.endScores[0] + ' POINTS'); this.hintT = 2.4; }
  }

  // BALLOON POP: the arrow reaches the balloons' plane
  _pop(res) {
    const m = this.match;
    if (!res.pops.length) {
      if (this.trickCombo >= 2) { this.hint = 'COMBO BROKEN'; this.hintT = 1; } else { this.hint = 'MISS'; this.hintT = 0.8; }
      this.trickCombo = 0; this.audio.miss(); return;
    }
    const R = KAR.Render, cols = R.BALLOON;
    for (const p of res.pops) {
      const q = R.proj(p.x, p.y, m.dist); if (!q) continue;
      const col = p.gold ? '#ffd34d' : cols[p.col];
      for (let i = 0; i < 22; i++) { const a = this.rng() * 6.283, sp = 120 + this.rng() * 320; this.particles.push({ x: q.x, y: q.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, g: 520, rot: this.rng() * 6, vr: (this.rng() - 0.5) * 18, life: 0.5 + this.rng() * 0.5, col: i % 4 ? col : '#ffffff', w: 7, h: 4 }); }
      this.pops.push({ x: p.x, y: p.y, age: 0, ring: 10, team: 0 });
    }
    this.trickShown = m.score; this.trickCombo = res.mult; this.shake = Math.max(this.shake, 5);
    const two = res.pops.length > 1, gold = res.bonusArrows > 0;
    this._banner(two ? 'DOUBLE POP!' : 'POP!', '#ffffff', gold ? '#ffb82e' : '#ff5d8a', '+' + res.points + (res.mult > 1 ? '  \u00b7  COMBO \u00d7' + res.mult : '') + (gold ? '  \u00b7  +' + res.bonusArrows + ' ARROWS' : ''), two ? 76 : 88);
    this.audio.pop(res.pops.length, res.mult); if (two || gold) this._burst(30);
  }

  _banner(text, c1, c2, sub, size) { this.banner = { text, c1, c2, sub, size, age: 0, life: 1.5 }; }
  _burst(n) {
    const cols = ['#ffe14d', '#ff6b5a', '#7ac7ff', '#a9ec62', '#ffffff', '#c46bff'];
    for (let i = 0; i < n; i++) this.particles.push({ x: 140 + this.rng() * 680, y: -20 - this.rng() * 120, vx: (this.rng() - 0.5) * 120, vy: 40 + this.rng() * 120, g: 260, rot: this.rng() * 6, vr: (this.rng() - 0.5) * 9, life: 2.2 + this.rng(), col: cols[Math.floor(this.rng() * cols.length)] });
  }

  // the daily result as one line to paste to friends (same balloons for everyone, so the numbers compare)
  _shareText() {
    const m = this.match;
    return 'Kudbee Archery \u00b7 Daily #' + m.daily + ' (' + KAR.Daily.date(m.daily) + ') \u00b7 ' + m.score + ' pts \u00b7 ' + m.popped + ' popped \u00b7 best combo \u00d7' + Math.max(1, Math.min(5, m.bestCombo)) + ' \u00b7 ' + location.origin + location.pathname;
  }
  _share() {
    const txt = this._shareText(); this.shared = this.time; this.shareText = txt;
    try { if (navigator.share && this.coarse) navigator.share({ text: txt }).catch(() => {}); else navigator.clipboard.writeText(txt).catch(() => {}); } catch (e) { /* no clipboard: the line is shown on screen */ }
  }

  _finishMatch() {
    const m = this.match, D = KAR.Store.data;
    if (m.daily) {
      const dd = D.daily;
      if (dd.day !== m.daily) { dd.day = m.daily; dd.best = 0; dd.plays = 0; dd.first = m.score; }
      dd.plays++; this.newBest = m.score > dd.best; dd.best = Math.max(dd.best, m.score);
      KAR.Store.save(); this.setScreen('over');
      if (this.newBest && m.score > 0) { this.audio.win(); this._burst(80); } else this.audio.lose();
      return;
    }
    if (m.mode === 'stage') {
      const T = D.tour, i = m.lv, sc = m.total(0), st = m.stars(), wasOpen = KAR.tourOpen(i + 1, D);
      this.newBest = sc > T.best[i]; T.best[i] = Math.max(T.best[i], sc); T.stars[i] = Math.max(T.stars[i], st);
      this.unlocked = i + 1 < KAR.TOUR.length && !wasOpen && KAR.tourOpen(i + 1, D);
      KAR.Store.save(); this.setScreen('over');
      if (st >= 1) { this.audio.win(); this._burst(60 + st * 20); } else this.audio.lose();
      return;
    }
    if (m.mode === 'swing') {
      const sc = m.total(0); this.newBest = sc > (D.swingBest || 0); D.swingBest = Math.max(D.swingBest || 0, sc);
      KAR.Store.save(); this.setScreen('over');
      if (this.newBest && sc > 0) { this.audio.win(); this._burst(80); } else this.audio.lose();
      return;
    }
    if (m.mode === 'trick') {
      this.newBest = m.score > (D.trickBest || 0); D.trickBest = Math.max(D.trickBest || 0, m.score);
      KAR.Store.save(); this.setScreen('over');
      if (this.newBest && m.score > 0) { this.audio.win(); this._burst(80); } else this.audio.lose();
      return;
    }
    if (m.mode === 'range') {
      const sc = m.total(0), stars = m.stars(), was = KAR.locked(3, D);
      this.newBest = sc > D.best[m.distIdx]; D.best[m.distIdx] = Math.max(D.best[m.distIdx], sc); D.stars[m.distIdx] = Math.max(D.stars[m.distIdx], stars);
      this.unlocked = was && !KAR.locked(3, D);
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
    if (!this.drawing) this.audio.drawStop();
    this.audio.setWind(this.screen === 'play' || this.screen === 'over' ? Math.min(1, Math.abs(this.match.wind) / 4) : 0.15);
  }

  _updateShot(dt) {
    const m = this.match, C = KAR.CFG, trick = m.mode === 'trick';
    this.bpT += dt;
    if (m.tick && this.bp !== 'flight') m.tick(dt);
    if (this.bp === 'ready') {
      if (this.cpu) this._updateCpu(dt);
      if (this.drawing) {
        const wasFull = this.draw >= 1;
        // a recurve gets heavier toward the anchor: quick off the brace, slow into the last few inches
        this.draw = Math.min(1, this.draw + dt / C.DRAW_T * 1.044 * (1.35 - 0.7 * this.draw));
        if (this.draw >= 1 && !wasFull) this.audio.full();
        this.audio.drawSet(this.draw);
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
      f.real += dt;
      if (f.hero) {
        this.timeScale = f.skip ? 4 : frac < 0.75 ? 0.6 : 0.25;          // press to skip
        this.camB = Math.min(1, f.real / 0.3);
      } else if (f.res.trick) {
        // stay on the balloons; a beat of slow motion as the arrow meets the ones it is about to pop
        const pt = f.res.popT, near = f.res.pops.length && pt !== undefined && f.t > pt - 0.14 && f.t < pt + 0.2;
        this.timeScale = near ? 0.3 : 1; this.zoomTarget = 1;
      } else {
        this.timeScale = frac > 0.86 ? 0.4 : 1;
        this.zoomTarget = frac < 0.5 ? 0 : 1;
      }
      f.t += dt * this.timeScale;
      if (m.tick) m.tick(dt * this.timeScale);            // the world slows with the arrow, so pops / the swing land where computed
      if (trick) {
        if (!f.popDone && f.res.popT !== undefined && f.t >= f.res.popT) { f.popDone = true; this._pop(f.res); }
        if (!f.popDone && f.res.popT === undefined && f.t > 0.3) { f.popDone = true; this._pop(f.res); }
      }
      if (f.t >= f.tEnd) { f.t = f.tEnd; this.timeScale = 1; this._land(); }
      this.camTip = this._tip(f);
    } else if (this.bp === 'result') {
      // arrow cam: swing round to the landing (three-quarter view of the arrow in the boss), hold, pull back
      const hero = this.flight.hero;
      this.orbit = hero ? KAR.Util.clamp((this.bpT - 0.15) / 0.7, 0, 1) : 0;
      if (this.camB > 0) this.camB = this.bpT < (hero ? 1.45 : 0.55) ? this.camB : Math.max(0, this.camB - dt / 0.4);
      if (this.bpT > (trick ? 0.25 : (this.flight.res.endDone ? 2.1 : 1.3) + (this.flight.hero ? 0.7 : 0))) { if (m.over) this._finishMatch(); else this._nextShot(); }
    }
  }

  _updateCpu(dt) {
    const c = this.cpu, m = this.match;
    c.t += dt;
    if (c.stage === 'think' && c.t > 0.9) {
      const lv = m.level, s = KAR.Bot.shot(m, this.rng, lv.sigma, lv.read);
      c.plan = s; c.sx = s.sx; c.sy = s.sy; c.stage = 'aim'; c.t = 0;
      this.drawing = true; this.draw = 0; this.holdT = 0; this.audio.drawStart();
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
    R.setView(this.zoom, m.dist, m.faceD, m.viewD);
    R.tOff = m.offAt ? m.offAt(m.T) : null; R.venue = this.screen === 'menu' ? 0 : (m.venue || 0); R.railA = m.move === 'slide' ? m.def.amp : 0;
    if (this.camB > 0 && this.camTip) R.chase(this.camTip, this.camB, this.bp === 'result' ? this.orbit : 0);
    if (this.screen === 'menu' && R.drawMenuPhoto(ctx)) { /* photo carries its own target */ }
    else {
      R.drawWorld(ctx, this.time, m.wind);
      if (m.mode === 'trick') R.drawBalloons(ctx, m, this.time); else R.drawTarget(ctx, this.time, m.wind, m.offAt ? (m.move || 'swing') : null);
      this._drawArrows(ctx);
    }
    if (this.screen !== 'menu') {
      R.drawWind(ctx, this.time, m.wind); this._drawAim(ctx);
      const rel = (this.time - this.relT) / 0.45;
      if (rel >= 0 && rel < 1 && this.screen === 'play') R.bow(ctx, this.relX || 480, this.relY || 300, 0, this.relTeam ? 1 : 0, this.time, Math.max(0.001, rel));
    }
    ctx.restore();
    U.begin();
    for (const p of this.particles) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.col; const w = p.w || 8, h = p.h || 5; ctx.fillRect(-w / 2, -h / 2, w, h); ctx.restore(); }
    if (this.screen === 'menu') U.menu(ctx, this);
    else {
      U.hud(ctx, this);
      if (this.screen === 'paused') U.pause(ctx, this);
      else if (this.screen === 'over') U.over(ctx, this);
    }
    if (this.focusPending) { this.focusPending = false; if (this.screen !== 'play') { const i = U.buttons.findIndex(b => b.primary && !b.disabled); this.focusIdx = i >= 0 ? i : 0; } }
  }

  _tip(f) {
    const S = f.res.samples;
    let i = 0; while (i < S.length - 2 && S[i + 1].t < f.t) i++;
    const a = S[i], b = S[Math.min(S.length - 1, i + 1)], u = b.t > a.t ? KAR.Util.clamp((f.t - a.t) / (b.t - a.t), 0, 1) : 0;
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u, i };
  }

  _drawArrows(ctx) {
    const R = KAR.Render, m = this.match;
    if (this.screen === 'menu') return;
    const f0 = this.flight, newest = f0 ? m.arrows[f0.shooter][m.arrows[f0.shooter].length - 1] : null;
    for (let s = 0; s < m.shooters; s++) for (const a of m.arrows[s]) if (a.end === this.showEnd && !(this.bp === 'flight' && a === newest)) R.stuck(ctx, a, s, a === newest ? this.time - this.landT : undefined);
    // impact rings
    for (const p of this.pops) { const q = R.proj(p.x, p.y, m.dist); if (!q) continue; ctx.beginPath(); ctx.arc(q.x, q.y, (0.05 + p.age * 0.25) * q.k, 0, 6.283); ctx.strokeStyle = 'rgba(255,255,255,' + (1 - p.age / 1.2) + ')'; ctx.lineWidth = 3; ctx.stroke(); }
    if (this.bp === 'flight' && this.flight) {
      const f = this.flight, S = f.res.samples, tip = this._tip(f), i = tip.i, b = S[Math.min(S.length - 1, i + 1)];
      const prev = S[Math.max(0, i - 1)], dir = { x: b.x - prev.x, y: b.y - prev.y, z: b.z - prev.z };
      // faint trail (not from the arrow cam: it would be drawn through the lens)
      ctx.save(); ctx.lineCap = 'round';
      if (this.camB < 0.5) for (let j = Math.max(0, i - 14); j < i; j++) { const p = R.proj(S[j].x, S[j].y, S[j].z), q = R.proj(S[j + 1].x, S[j + 1].y, S[j + 1].z); if (!p || !q) continue; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.strokeStyle = 'rgba(255,255,255,' + (0.5 * (j - (i - 14)) / 14) + ')'; ctx.lineWidth = 2 + 3 * (1 - this.zoom); ctx.stroke(); }
      ctx.restore();
      if (!f.done) {
        // arrow cam: speed lines streaming past the lens
        if (this.camB > 0.3) { ctx.save(); ctx.globalAlpha = (this.camB - 0.3) * 0.9; ctx.strokeStyle = '#ffffff'; ctx.lineCap = 'round'; for (let j = 0; j < 14; j++) { const a = j * 2.399, r0 = 250 + ((j * 97 + this.time * 1600) % 240); ctx.lineWidth = 1.5 + (j % 3); ctx.beginPath(); ctx.moveTo(480 + Math.cos(a) * r0, 300 + Math.sin(a) * r0 * 0.7); ctx.lineTo(480 + Math.cos(a) * (r0 + 70), 300 + Math.sin(a) * (r0 + 70) * 0.7); ctx.stroke(); } ctx.restore(); }
        // arrow cam: the real 3D arrow seen from behind; otherwise the stretched long-shot arrow so it reads in the wide view
        if (this.camB > 0.3) { const L = Math.hypot(dir.x, dir.y, dir.z) || 1; R.arrow3(ctx, tip, { x: dir.x / L, y: dir.y / L, z: dir.z / L }, 0.75, f.shooter, { rot: f.t * 40 }); }   // vanes spin the arrow in flight
        else R.arrow(ctx, tip, dir, 0.8 + 3.2 * (1 - this.zoom), f.shooter, 0);
      }
    } else if (this.bp === 'result' && this.flight && this.flight.res.hit) { /* stuck arrow already drawn from match.arrows */ }
  }

  _drawAim(ctx) {
    const R = KAR.Render, m = this.match;
    if (this.bp !== 'ready' || this.zoom < 0.85 || this.screen === 'over') return;
    const cpu = !!this.cpu;
    if (!this.drawing && !cpu) return;
    const sx = this.aimX + this.sway.x, sy = this.aimY + this.sway.y, q = R.proj(sx, sy, m.dist);
    if (!q) return;
    R.bow(ctx, q.x, q.y, this.draw, cpu ? 1 : 0, this.time, 0, { creep: this.draw >= 1 && !cpu ? Math.max(0, this.holdT - KAR.CFG.STEADY_T) : 0 });
    this.relX = q.x; this.relY = q.y;
    const r = Math.max(14, 0.12 * q.k * Math.min(1, m.faceD / 0.6) + 8);
    R.sight(ctx, q.x, q.y, Math.min(26, r), this.steady, this.time);
    // wind-hold helper on the easier levels: a faint tick where a still-air arrow would be pushed to
  }
};

document.addEventListener('DOMContentLoaded', () => { window.KARGame = new KAR.Game(document.getElementById('gameCanvas')); });
