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
    this.coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    this.ios = /iP(hone|od|ad)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    this.standalone = !!(navigator.standalone || (window.matchMedia && window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches));
    this.quality = 1; this.slow = 0; this.slowN = 0; this._fit();
    // prefers-reduced-motion: no screen shake, a few confetti instead of a storm, still chips (followed live)
    try { const mq = window.matchMedia('(prefers-reduced-motion: reduce)'); this.calm = mq.matches; if (mq.addEventListener) mq.addEventListener('change', e => { this.calm = e.matches; }); } catch (e) { this.calm = false; }
    KAR.Store.load();
    KAR.Store.data.visits++; KAR.Store.save();                       // (the INSTALL button shows from the second visit)
    // a save from before TROPHIES already earned some: count them as announced, quietly (no flood of cards on the first arrow)
    if (!Object.keys(KAR.Store.data.ach).length && KAR.achNew(KAR.Store.data).length) KAR.Store.save();
    this.audio = new KAR.Audio();
    this.screen = 'menu';              // menu | play | paused | over
    this.time = 0; this.last = 0; this.focusIdx = -1; this.focusPending = true; this.overlayT = 0; this.shake = 0;
    this.particles = []; this.banner = null; this.hint = ''; this.hintT = 0; this.pops = [];
    this.rng = KAR.Util.rng((Date.now() ^ 0x1f3d5b79) >>> 0);
    this.match = new KAR.Match({ mode: 'range', dist: 1, seed: 1 });
    this.bp = 'idle'; this.bpT = 0; this.zoom = 1; this.zoomTarget = 1; this.timeScale = 1;
    this.camB = 0; this.camTip = null; this.landT = -9; this.streak = 0; this.drama = '';
    this.ptr = { x: 480, y: 330 }; this.aimX = 0; this.aimY = KAR.CFG.FACE_Y;
    this.agentLog = KAR.Store.data.agentLog; this.agentTip = null; this.agentSince = 0; this.agentRound = []; this.agentQ = null;      // THE AGENT: your last arrows (saved) + this round's + the tip on screen
    this._resetShot();
    this._bind();
    this._app();
    try { if (/^#\/?agent$/.test(location.hash)) this.activate('agent'); } catch (e) { /* no location */ }      // /agent links straight to the coach
    this._frame = this._frame.bind(this);
    requestAnimationFrame(this._frame);
  }

  // Size the canvas to the screen. The game is laid out on a 960 x 640 stage; a wider screen (a landscape phone is
  // about 2.2 : 1) gets extra scenery either side instead of black bars, and the HUD rides out to the real edges.
  // The backing store matches the device pixels it is shown at (x quality, which drops if frames run slow).
  _fit() {
    const c = this.canvas, R = KAR.Render, vw = window.innerWidth || 960, vh = window.innerHeight || 640;
    const LW = Math.round(KAR.Util.clamp(640 * vw / vh, 960, 1480));
    R.XW = LW; R.XL = -(LW - 960) / 2;
    const cssW = Math.min(vw, vh * LW / 640), cssH = cssW * 640 / LW;
    c.style.width = cssW + 'px'; c.style.height = cssH + 'px';
    this.res = KAR.Util.clamp(cssH * (window.devicePixelRatio || 1) / 640, 0.6, 2) * this.quality;
    R.res = this.res;                                   // the level map paints its still layers at this resolution
    c.width = Math.round(LW * this.res); c.height = Math.round(640 * this.res);
    if (this.coarse && vh > vw && this.screen === 'play') this.togglePause();      // turned upright mid-range: pause under the 'turn sideways' card
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
    if (D.mode === 6) return this._cupMatch(seed);
    this.match = D.mode === 5 ? new KAR.Stage({ level: D.tourLv, seed }) : D.mode === 2 ? new KAR.Trick({ seed }) : D.mode === 4 ? new KAR.Trick({ seed: KAR.Daily.seed(day), daily: day })
      : D.mode === 3 ? new KAR.Swing({ seed }) : new KAR.Match({ mode: D.mode === 1 ? 'duel' : 'range', dist: KAR.locked(D.dist, D) ? 2 : D.dist, level: D.level, seed });
    this._begin();
  }
  // THE CUP: carry on the cup in progress (or draw a new one when there is none, it is over, or another cup is picked)
  // and shoot your tie of this round: a duel at the round's distance against the rival's own skill
  _cupMatch(seed) {
    const D = KAR.Store.data;
    if (!KAR.Cup.open(D.cupTier, D)) D.cupTier = 0;
    if (KAR.Cup.done(D.cup) || D.cup.tier !== D.cupTier) { D.cup = KAR.Cup.start(D.cupTier, seed); KAR.Store.save(); }
    const c = D.cup, opp = KAR.Cup.opponent(c), sk = KAR.Cup.skill(opp);
    this.match = new KAR.Match({ mode: 'duel', dist: KAR.Cup.dist(c), cpu: sk, seed });
    this.match.cup = { tier: c.tier, round: c.round, opp, name: sk.name };
    this._begin();
  }
  _begin() {
    this.starDing = 0; this.aidNext = false;
    this.shared = -9; this.unlocked = false; this.sideOpen = undefined; this.tourDone = false; this.cupGems = 0;
    this.trickShown = 0; this.trickCombo = 0; this.relT = -9; this.agentRound = []; this.starGemsWon = 0;
    this.introT = this.time; this.windT = -9; this.lastBase = this.match.baseWind;      // the level card; the wind-shift call
    if (this.canFull() && !this.fsLeft) this.goFull(true);
    this.wake(true);
    this.screen = 'play'; this.particles.length = 0; this.pops.length = 0; this.banner = null; this.newBest = false;
    this.focusIdx = -1; this.focusPending = true; this.showEnd = 0; this.zoom = 1; this.zoomTarget = 1;
    this.camB = 0; this.camTip = null; this.streak = 0; this.drama = '';
    this.hint = this.coarse ? 'TOUCH & HOLD TO DRAW  ·  DRAG TO AIM  ·  LIFT TO LOOSE' : 'PRESS & HOLD TO DRAW  ·  MOVE TO AIM  ·  RELEASE TO LOOSE'; this.hintT = 6;
    if (this.match.mode === 'trick') { this.hint = (this.match.daily ? 'DAILY #' + this.match.daily + '  ·  ' : '') + 'POP THE BALLOONS  ·  LEAD THE MOVERS  ·  GOLD = +2 ARROWS'; this.hintT = 6; }
    if (this.match.mode === 'swing') { this.hint = 'THE TARGET SWINGS  ·  LEAD IT  ·  LOOSE AS IT COMES TO YOU'; this.hintT = 6; }
    if (this.match.cup) { const k = this.match.cup; this.hint = KAR.CUPS[k.tier].name + '  ·  ' + KAR.CUP_ROUNDS[k.round] + '  ·  VS ' + k.name + '  ·  FIRST TO 6 SET POINTS'; this.hintT = 6; }
    if (this.match.mode === 'stage') { const L = this.match.def; this.hint = (L.boss ? 'BOSS!  ·  ' : '') + 'LEVEL ' + (this.match.lv + 1) + '  ·  ' + L.name + '  ·  ' + L.tip.toUpperCase(); this.hintT = 6; }
    if (this.aidOn()) { this.hint = 'AIM HELP IS ON  ·  THE FIRST ARROW OF EACH END SHOWS WHERE TO AIM'; this.hintT = 6; }
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
    if (this.coarse) { this.aimX = 0; this.aimY = KAR.CFG.FACE_Y; }      // touch: a new arrow's sight starts dead on the gold (drag from there)
    if (m.shooter === 1) this.cpu = { t: 0, stage: 'think', plan: null };
    this.drama = this._drama();
    this.coach = this._coach();
    this.aid = !this.coach && m.arrowNo === 0 && m.shooter === 0 && this.aidOn() ? { label: 'AIM HELP', w: null } : null;
    // a new end re-rolls the wind: say so (louder when it has switched sides) and flash the gauge
    if (m.arrowNo === 0 && m.endNo > 0 && m.mode !== 'trick' && !m.over) {
      const W = KAR.CFG.WIND[m.distIdx] || 3, was = this.lastBase || 0, now = m.baseWind, flip = Math.sign(was) !== Math.sign(now) && Math.abs(now) > 0.25 * W && Math.abs(was) > 0.25 * W;
      const how = Math.abs(now) > Math.abs(was) + 0.3 * W ? 'STRONGER' : Math.abs(now) < Math.abs(was) - 0.3 * W ? 'LIGHTER' : 'STEADY';
      this.hint = 'END ' + (m.endNo + 1) + '  \u00b7  ' + (flip ? 'THE WIND HAS SWITCHED SIDES!' : 'NEW WIND: ' + Math.abs(m.wind).toFixed(1) + ' ' + (now < 0 ? '\u2190' : '\u2192') + '  ' + how); this.hintT = 2.6;
      this.windT = this.time; this.windFlip = flip;
    }
    this.lastBase = m.baseWind;
  }

  // The first-shot tutorial, one card at a time on levels 1 and 2 (each shown once; D.tut keeps a bit per tip):
  // aim at the gold; hold your breath; the wind pushes the arrow - aim at the marker; then read it yourself.
  _coach() {
    const m = this.match, D = KAR.Store.data;
    if (m.mode !== 'stage' || m.shooter !== 0 || m.lv > 1) return null;
    const touch = this.coarse, done = b => (D.tut & b) !== 0, fired = m.arrows[0].length;
    if (m.lv === 0 && !done(1)) return { bit: 1, text: 'AIM AT THE GOLD', sub: touch ? 'touch & hold to draw  \u00b7  drag to aim  \u00b7  lift to shoot' : 'press & hold to draw  \u00b7  move to aim  \u00b7  release to shoot', marker: { x: 0, y: KAR.CFG.FACE_Y, label: 'GOLD' } };
    if (m.lv === 0 && !done(2) && fired >= 1) return { bit: 2, text: 'STEADY YOUR AIM', sub: touch ? 'at full draw, hold HOLD BREATH to calm the sight for a moment' : 'at full draw, hold B (or right-click) to hold your breath' };
    if (m.lv === 1 && !done(4)) {
      if (Math.abs(m.wind) < 2.2) { const sg = Math.sign(m.wind) || 1; m.wind = sg * 2.3; }   // a gust strong enough to see the hold-off at 18 m
      const h = KAR.Bot.hold(m);
      return { bit: 4, text: 'THE WIND PUSHES YOUR ARROW', sub: 'aim at the marker  \u00b7  off the gold, into the wind', marker: { x: h.x, y: h.y, label: 'AIM HERE', wind: true } };
    }
    if (m.lv === 1 && done(4) && !done(8)) return { bit: 8, text: 'NOW READ IT YOURSELF', sub: 'watch the wind gauge and the flags  \u00b7  aim off the same way' };
    return null;
  }

  // AIM HELP: a level you've failed twice and never cleared shows where to aim (for your bow, arrows and this wind) on
  // the first arrow of each end - still levels without crates only (a mover or the crate window needs reading yourself).
  // A clear puts the count back to 0.
  aidOn(m) {
    m = m || this.match; const D = KAR.Store.data;
    return m.mode === 'stage' && !m.offAt && !m.boxes && D.tour.fails[m.lv] >= 2 && D.tour.stars[m.lv] === 0;
  }
  _aidMark() {
    const a = this.aid, m = this.match;
    if (a.w !== m.wind) { const h = KAR.Bot.hold(m, undefined, this._kit(0)); a.x = h.x; a.y = h.y; a.w = m.wind; a.wind = Math.abs(h.x) > 0.02; }     // gusts move it
    return a;
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
    const who = m.cup ? m.cup.name : 'CPU';
    if (n.win > 10) return n.tie === 10 ? who + ' NEEDS A 10 TO TIE THE END' : 'THE END IS YOURS';
    if (n.win > 0) return who + ' NEEDS ' + n.win + ' TO TAKE THE END';
    return '';
  }

  setScreen(s) { this.screen = s; this.overlayT = 0; this.focusPending = true; }

  // ---- the app: offline + install ---------------------------------------------------
  // sw.js keeps a copy of the game so it opens with no signal. Android Chrome offers an install prompt (kept for the
  // INSTALL button); iPhone Safari has none, so the button opens a card that shows Share -> Add to Home Screen.
  _app() {
    try { if (navigator.serviceWorker && window.isSecureContext) navigator.serviceWorker.register('sw.js').catch(() => {}); } catch (e) { /* no service worker */ }
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); this.bip = e; });
    window.addEventListener('appinstalled', () => { this.bip = null; KAR.Store.data.install = 1; KAR.Store.save(); });
  }
  // the menu's INSTALL button: phones, second visit on, not already installed or waved off, and a way to install here
  canInstall() { const D = KAR.Store.data; return this.coarse && !this.standalone && D.install !== 1 && D.visits >= 2 && (!!this.bip || this.ios); }
  _install() {
    const D = KAR.Store.data;
    if (this.bip) { const e = this.bip; this.bip = null; try { e.prompt(); e.userChoice.then(() => { D.install = 1; KAR.Store.save(); }, () => {}); } catch (err) { /* already used */ } return; }
    this.setScreen('install');
  }

  // ---- phone comforts ------------------------------------------------------------
  // a short buzz (Android; iOS Safari has no vibration API, so this quietly does nothing there)
  buzz(p) { if (this.coarse && KAR.Store.data.haptics && navigator.vibrate) try { navigator.vibrate(p); } catch (e) { /* ignore */ } }
  canFull() { const d = document.documentElement; return this.coarse && !!(d.requestFullscreen || d.webkitRequestFullscreen); }
  isFull() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  // full screen + landscape lock where the browser allows it (Android Chrome, iPad); must run inside a tap
  goFull(on) {
    try {
      const d = document.documentElement;
      if (on && !this.isFull()) { const p = (d.requestFullscreen || d.webkitRequestFullscreen).call(d, { navigationUI: 'hide' }); const lock = () => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* ignore */ } }; if (p && p.then) p.then(lock, () => {}); else lock(); }
      else if (!on && this.isFull()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } catch (e) { /* not allowed here */ }
  }
  // keep the screen awake through a range (it would dim between arrows)
  wake(on) {
    try {
      if (on && !this.wakeLock && navigator.wakeLock && !document.hidden) navigator.wakeLock.request('screen').then(l => { this.wakeLock = l; l.addEventListener('release', () => { if (this.wakeLock === l) this.wakeLock = null; }); }, () => {});
      else if (!on && this.wakeLock) { this.wakeLock.release(); this.wakeLock = null; }
    } catch (e) { /* ignore */ }
  }

  activate(id) {
    this.audio.ensure(); this.audio.click();
    const D = KAR.Store.data;
    if (id === 'play' && D.mode === 5) return this.activate('levels');
    if (id === 'play' || id === 'restart' || id === 'rematch' || id === 'retry') this.startMatch();
    else if (/^mode\d$/.test(id)) { D.mode = +id[4]; KAR.Store.save(); }
    else if (/^d\d$/.test(id)) { if (!KAR.locked(+id[1], D)) { D.dist = +id[1]; KAR.Store.save(); } }
    else if (id === 'share' || id === 'shareGame' || id === 'shareLevel' || id === 'shareCup') this._share(id);
    else if (/^tsh\d+$/.test(id)) this._share('shareTrophy', KAR.ACH[+id.slice(3)]);
    else if (/^sh[A-Z]/.test(id)) this._shareAct(id);
    else if (id === 'levels') { this.wake(false); this.bp = 'idle'; this.cpu = null; this.zoomTarget = 1; this.worldView = KAR.TOUR[D.tourLv].v; this.setScreen('levels'); }
    else if (id === 'wprev' || id === 'wnext') this.worldView = KAR.Util.clamp((this.worldView | 0) + (id === 'wnext' ? 1 : -1), 0, KAR.VENUES.length - 1);
    else if (id === 'gear') this.setScreen('gear');
    else if (id === 'trophies') { this.achPage = 0; this.setScreen('trophies'); }
    else if (id === 'quests') this.setScreen('quests');
    else if (id === 'agent') { if (this.screen !== 'agent') this.agentBack = this.screen === 'paused' || this.screen === 'over' ? this.screen : 'menu'; this.setScreen('agent'); }
    else if (id === 'agentBack') this.setScreen(this.agentBack || 'menu');
    else if (/^aq\d$/.test(id)) { const i = +id[2]; this.agentQ = this.agentQ === i ? null : i; }
    else if (id === 'agentTips') { D.agent = !D.agent; this.agentTip = null; KAR.Store.save(); }
    else if (id === 'shop') { this.shopBack = this.screen === 'gear' ? 'gear' : this.screen === 'quests' ? 'quests' : 'menu'; this.shopSel = null; this.setScreen('shop'); }
    else if (id === 'shopBack') this.setScreen(this.shopBack || 'menu');
    else if (/^qc\d$/.test(id)) { const d = KAR.questDef(KAR.questToday(D).q[+id[2]].id); if (KAR.questClaim(D, +id[2]) === 'claimed') { KAR.Store.save(); this.audio.gold(2); this.buzz(20); this.gemFx = { n: d.gems, t: this.time }; } }
    else if (id === 'qb') { if (KAR.questBonus(D)) { KAR.Store.save(); this.audio.win(); this._burst(40); this.gemFx = { n: KAR.QUEST_BONUS, t: this.time }; } }
    else if (/^k[ba]\d$/.test(id)) { const kind = id[1] === 'b' ? 'bow' : 'arrow', i = +id[2]; if (KAR.kitOwned(D, kind, i)) { D.kit[kind] = i; this.shopSel = null; KAR.Store.save(); } else this.shopSel = { kind, i }; }
    else if (id === 'kbuy') { const s = this.shopSel; if (s && KAR.kitBuy(D, s.kind, s.i) === 'bought') { KAR.Store.save(); this.audio.win(); this._burst(40); this.shopSel = null; } }
    else if (id === 'tprev' || id === 'tnext') this.achPage = KAR.Util.clamp((this.achPage | 0) + (id === 'tnext' ? 1 : -1), 0, Math.ceil(KAR.ACH.length / 9) - 1);
    else if (id === 'back') this.setScreen('menu');
    else if (/^g[bfs]\d$/.test(id)) { const k = { b: 'bow', f: 'fletch', s: 'sight' }[id[1]], i = +id[2]; if (KAR.GEAR[k][i] && KAR.gearOpen(k, i, D)) { D.gear[k] = i; KAR.Store.save(); } }
    else if (/^L\d\d$/.test(id)) { const i = +id.slice(1); if (KAR.tourOpen(i, D)) { D.tourLv = i; D.mode = 5; KAR.Store.save(); if (this.screen === 'levels') this.startMatch(); } }
    else if (id === 'next' && D.mode === 6) this.startMatch();
    else if (id === 'next') { if (D.tourLv < KAR.TOUR.length - 1 && KAR.tourOpen(D.tourLv + 1, D)) D.tourLv++; KAR.Store.save(); this.startMatch(); }
    else if (/^lv\d$/.test(id)) { D.level = +id[2]; KAR.Store.save(); }
    else if (/^cup\d$/.test(id)) { const t = +id[3]; if (KAR.Cup.open(t, D)) { D.cupTier = t; D.mode = 6; KAR.Store.save(); } }
    else if (id === 'pause') this.togglePause();
    else if (id === 'resume') this.screen = 'play';
    else if (id === 'full') { const on = !this.isFull(); this.fsLeft = !on; this.goFull(on); }
    else if (id === 'aim') { D.aimSpeed = (D.aimSpeed + 1) % KAR.CFG.TOUCH_GAINS.length; KAR.Store.save(); }
    else if (id === 'buzz') { D.haptics = !D.haptics; KAR.Store.save(); this.buzz(20); }
    else if (id === 'install') this._install();
    else if (id === 'instOk') { D.install = 1; KAR.Store.save(); this.setScreen('menu'); }
    else if (id === 'instBack') this.setScreen('menu');
    else if (id === 'menu') { this.wake(false); this.setScreen('menu'); this.bp = 'idle'; this.zoomTarget = 1; this.cpu = null; }
    else if (id === 'mute') this.audio.setMuted(!this.audio.muted);
    else if (id === 'breath') this.holding = !this.holding;
  }
  togglePause() { if (this.screen === 'play') { this.setScreen('paused'); this.drawing = false; } else if (this.screen === 'paused') this.screen = 'play'; }

  // ---- input --------------------------------------------------------------------
  _pt(e) { const r = this.canvas.getBoundingClientRect(), R = KAR.Render; return { x: R.XL + (e.clientX - r.left) * R.XW / r.width, y: (e.clientY - r.top) * R.H / r.height }; }
  _setAimFromPtr() {
    const m = this.match;
    const q = KAR.Render.unproj(this.ptr.x, this.ptr.y, m.dist);
    const S = (m.viewD || m.faceD) * 1.3;
    this.aimX = KAR.Util.clamp(q.x, -S, S); this.aimY = KAR.Util.clamp(q.y, KAR.CFG.FACE_Y - S, KAR.CFG.FACE_Y + S);
  }
  _bind() {
    const c = this.canvas;
    const refit = () => { this._fit(); this.focusPending = this.screen !== 'play'; };
    window.addEventListener('resize', refit); window.addEventListener('orientationchange', () => setTimeout(refit, 120));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', refit);
    const fsc = () => { if (!this.isFull() && this.screen === 'play') this.fsLeft = true; setTimeout(refit, 60); };
    document.addEventListener('fullscreenchange', fsc); document.addEventListener('webkitfullscreenchange', fsc);
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
    const lift = e => { this._firstGesture(); if (e.touches.length === 0) { if (this.breathId !== undefined) this.holding = false; this.breathId = undefined; this.touchId = undefined; this.grab = null; if (this.drawing && !this.cpu) this._loose(); } };
    window.addEventListener('click', () => this._firstGesture());          // iOS unlocks audio on touchend / click
    window.addEventListener('touchend', lift); window.addEventListener('touchcancel', lift);
    c.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('keydown', e => this._onKey(e, true));
    window.addEventListener('keyup', e => this._onKey(e, false));
    document.addEventListener('visibilitychange', () => { if (document.hidden) { if (this.screen === 'play') this.togglePause(); this.audio.suspend(); } else { this.audio.resume(); if (this.screen === 'play' || this.screen === 'paused') this.wake(true); } });
    // blur fires for benign focus moves (iframes, preview toolbars): only drop held input; a hidden tab pauses
    // (a mouse button released outside the window is lost, so a desktop draw is dropped; touch keeps it - see above)
    window.addEventListener('blur', () => { this.holding = false; if (this.drawing && !this.cpu && !this.coarse) { this.drawing = false; this.draw = 0; } });
  }
  _firstGesture() { if (this.audio.ensure()) this.audio.startMusic(); }
  _beginDraw() { if (this.human() && !this.drawing) { this.drawing = true; this.draw = 0; this.holdT = 0; this.breath = 1; this.audio.drawStart(); } }

  // Touch aims like a trackpad: wherever the finger lands, the sight starts where it is (on the gold for a new
  // arrow) and follows the drag at TOUCH_GAIN, so your thumb never covers the target and small moves are precise.
  // While one finger draws, a second finger anywhere holds your breath for as long as it stays down.
  _onDown(e) {
    this._firstGesture();
    const p = this._pt(e), i = KAR.UI.hit(p.x, p.y), touch = e.pointerType === 'touch';
    // the level map: taps act on lift, so a sideways swipe (to the next world) never starts the tile under it
    if (this.screen === 'levels') { this.swipe = { x: p.x, y: p.y, i }; e.preventDefault(); return; }
    if (i >= 0) { e.preventDefault(); this.activate(KAR.UI.buttons[i].id); return; }
    if (this.screen !== 'play') return;
    if (this.bp === 'flight' && this.flight && this.flight.hero) { this.flight.skip = true; return; }
    if (touch && this.drawing && this.touchId !== undefined && e.pointerId !== this.touchId) { this.holding = true; this.breathId = e.pointerId; return; }
    if (touch) {
      const q = KAR.Render.proj(this.aimX, this.aimY, this.match.dist) || { x: 480, y: 318 };
      this.touchId = e.pointerId; this.grab = { px: p.x, py: p.y, sx: q.x, sy: q.y };
    } else { this.ptr = p; if (this.drawing || this.human()) this._setAimFromPtr(); }
    if (e.button === 2) { this.holding = true; return; }
    this._beginDraw();
    try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  }
  _onMove(e) {
    const p = this._pt(e), i = KAR.UI.hit(p.x, p.y), touch = e.pointerType === 'touch';
    if (!touch) { if (i >= 0) this.focusIdx = i; else if (this.screen === 'play') this.focusIdx = -1; }
    this.canvas.style.cursor = i >= 0 ? 'pointer' : (this.screen === 'play' ? 'crosshair' : 'default');
    if (this.screen !== 'play') return;
    if (touch) {
      if (e.pointerId !== this.touchId || !this.grab) return;
      const k = this.aimGain(), gb = this.grab;
      this.ptr = { x: gb.sx + (p.x - gb.px) * k, y: gb.sy + (p.y - gb.py) * k };
      if (this.human()) this._setAimFromPtr();
    } else if (i < 0 || this.drawing) { this.ptr = p; if (this.human()) this._setAimFromPtr(); }
  }
  _onUp(e) {
    if (this.screen === 'levels' && this.swipe) {
      const p = this._pt(e), sw = this.swipe, dx = p.x - sw.x, dy = p.y - sw.y; this.swipe = null;
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) this.activate(dx < 0 ? 'wnext' : 'wprev');
      else if (Math.hypot(dx, dy) < 30 && sw.i >= 0 && KAR.UI.hit(p.x, p.y) === sw.i) this.activate(KAR.UI.buttons[sw.i].id);
      return;
    }
    if (e.button === 2) { this.holding = false; return; }
    if (e.pointerType === 'touch') {
      if (e.pointerId === this.breathId) { this.holding = false; this.breathId = undefined; return; }
      if (this.touchId !== undefined && e.pointerId !== this.touchId) return;
      this.touchId = undefined; this.grab = null;
    }
    if (this.drawing) this._loose();
  }
  _onKey(e, down) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (down) this._firstGesture();
    if (down && (k === 'm' || k === 'M')) { this.audio.setMuted(!this.audio.muted); return; }
    if (down && k === 'Escape' && (this.screen === 'levels' || this.screen === 'trophies' || this.screen === 'quests')) { this.activate('back'); return; }
    if (down && k === 'Escape' && this.screen === 'shop') { this.activate('shopBack'); return; }
    if (down && k === 'Escape' && this.screen === 'install') { this.activate('instBack'); return; }
    if (down && k === 'Escape' && this.screen === 'share') { this.activate('shBack'); return; }
    if (down && k === 'Escape' && this.screen === 'agent') { this.activate('agentBack'); return; }
    if (down && k === '/' && (this.screen === 'menu' || this.screen === 'paused' || this.screen === 'over')) { e.preventDefault(); this.activate('agent'); return; }
    // the results card: N next level, R retry / play again, L the level map, Esc the map (levels) or the menu
    if (down && this.screen === 'over' && !e.repeat) {
      const has = id => KAR.UI.buttons.some(b => b.id === id && !b.disabled), K = k.toLowerCase();
      const id = K === 'n' ? 'next' : K === 'r' ? 'rematch' : K === 'l' ? 'levels' : k === 'Escape' ? (has('levels') ? 'levels' : 'menu') : null;
      if (id && has(id)) { e.preventDefault(); this.activate(id); return; }
    }
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
    if (k === ' ' || k === 'Enter') { e.preventDefault(); if (down && e.repeat && !this.drawing) return; if (down && this.bp === 'flight' && this.flight && this.flight.hero) this.flight.skip = true; else if (down) this._beginDraw(); else if (this.drawing) this._loose(); return; }
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
    if (shooter === 0) this.shotInfo = { power, held: this.holdT, steady: !!this.steady };
    if (this.coach && shooter === 0) { const D = KAR.Store.data; D.tut |= this.coach.bit; KAR.Store.save(); this.coach = null; }
    if (shooter === 0) this.aid = null;
    const res = m.shoot(this.aimX, this.aimY, sw.x, sw.y, power, this._kit(shooter));
    const tEnd = res.hit ? res.hit.t : res.samples[res.samples.length - 1].t;
    // ARROW CAM for the shots worth watching: golds, the odd 7/8 (so the cam alone doesn't give it away),
    // the last arrow of a range, and the CPU's X. The camera rides the arrow in, in slow motion.
    const last = m.over && (m.mode === 'range' || m.mode === 'stage');
    const hero = !res.trick && !res.star && !!res.hit && (shooter === 0 ? (res.ring >= 9 || last || (res.ring >= 7 && this.rng() < 0.3)) : (res.x || (res.ring === 10 && this.rng() < 0.5)));
    this.flight = { res, t: 0, tEnd, shooter, done: false, hero, real: 0, skip: false, last: shooter === 0 && (last || (m.mode === 'duel' && m.over)) };
    this.bp = 'flight'; this.bpT = 0; this.zoomTarget = hero ? 1 : 0; this.draw = 0; this.drama = '';
    this.audio.loose(); this.audio.fly(hero ? tEnd * 2 : tEnd * 0.9);
    if (shooter === 0) this.buzz(22);
    if (/^(PRESS|TOUCH|POP|DAILY|THE TARGET|LEVEL|AIM HELP)/.test(this.hint)) this.hintT = 0;        // the how-to line has done its job
    this.relT = this.time; this.relTeam = shooter; this.shake = Math.max(this.shake, 2.5);   // the bow kicks away
    if (hero) this.audio.heroIn();
    this.cpu = null;
    if (shooter === 0) { const st = KAR.Store.data.stats; st.arrows++; this._quest('arrow', 1); this._dayStreak(); }
  }

  // DAY STREAK: the first arrow of a (UTC) day counts it; day 3 and every 7th pay gems (a card says so)
  _dayStreak() {
    const r = KAR.playDay(KAR.Store.data); if (!r) return;
    KAR.Store.save();
    if (r.n >= 2 || r.gems) { if (!this.achQ) this.achQ = []; this.achQ.push({ a: { name: r.n + ' DAYS', text: r.gems ? '+' + r.gems + ' gems  ·  keep it going tomorrow' : 'come back tomorrow for day ' + (r.n + 1) }, title: 'DAY STREAK!', gem: !!r.gems }); }
  }
  // your bow + arrows; the CPU and the Daily (same for everyone) shoot club kit
  _kit(shooter) { return shooter === 0 && !this.match.daily ? KAR.kitOf(KAR.Store.data) : KAR.KIT0; }
  // count a quest event; a finished quest drops in a card (claim it on the QUESTS screen)
  _quest(ev, n) {
    if (!this.achQ) this.achQ = [];
    for (const d of KAR.questEvent(KAR.Store.data, ev, n)) this.achQ.push({ a: { name: d.text.toUpperCase(), text: 'claim +' + d.gems + ' gems in QUESTS' }, title: 'QUEST DONE!', gem: true });
  }

  _land() {
    const f = this.flight, res = f.res, m = this.match, st = KAR.Store.data.stats;
    f.done = true;
    if (res.trick) { this.bp = 'result'; this.bpT = 0; return; }       // balloons pop mid-flight (_pop); the arrow just runs out
    const e = res.hit;
    if (e) this.pops.push({ x: e.x, y: e.y, z: e.z, age: 0, ring: res.ring, team: f.shooter });
    this.landT = this.time;
    if (e) { const q = KAR.Render.proj(e.x, e.y, e.z || m.dist), wood = res.blocked || res.star, n = res.star ? 30 : 12; if (q) for (let i = 0; i < n; i++) { const a = -Math.PI * (0.1 + this.rng() * 0.8), sp = 60 + this.rng() * 160; this.particles.push({ x: q.x, y: q.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 420, rot: this.rng() * 6, vr: (this.rng() - 0.5) * 14, life: 0.35 + this.rng() * 0.35, col: wood ? (res.star ? ['#ffe27a', '#f0b52e', '#ffffff'][i % 3] : i % 2 ? '#c98d48' : '#8e5a28') : i % 2 ? '#f3d56f' : '#c99a38', w: wood ? 9 : 5, h: wood ? 3 : 2 }); } }
    if (f.shooter === 0 && !res.star) { this.streak = res.ring >= 9 ? this.streak + 1 : 0; if (this.streak > st.bestStreak) st.bestStreak = this.streak; if (res.robin) st.robins++; }
    const streak = f.shooter === 0 ? this.streak : 0, row = streak >= 2 ? streak + ' IN A ROW!' : '';
    if (e && res.ring >= 9 && !res.star) { const q = KAR.Render.proj(e.x, e.y, m.dist); if (q) for (let i = 0; i < (res.x ? 26 : 14); i++) { const a = this.rng() * 6.283, sp = 80 + this.rng() * 220; this.particles.push({ x: q.x, y: q.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, g: 320, rot: this.rng() * 6, vr: (this.rng() - 0.5) * 12, life: 0.7 + this.rng() * 0.6, col: ['#fff6a8', '#ffd34d', '#ffffff'][i % 3] }); } }
    this.shake = Math.max(this.shake, res.ring >= 9 ? 6 : 3);
    if (f.shooter === 0) this.buzz(res.robin ? [40, 60, 40, 60, 80] : res.ring >= 10 ? [30, 50, 45] : res.ring >= 9 ? 30 : res.miss ? 0 : 14);
    if (res.robin) { this._banner('ROBIN HOOD!', '#fff6a8', '#3fbf5a', 'arrow split clean in two', 72); this.audio.robin(); this._burst(60); this.shake = 10; }
    else if (res.star) { const coin = this.match.venue >= 5; this._banner(coin ? 'COIN BLOCK!' : 'STAR BOX!', '#fff6a8', '#ffb82e', '+10  \u00b7  ' + (coin ? 'cashed in' : 'smashed'), 88); this.audio.gold(streak); this._burst(30); }
    else if (res.blocked) { this.audio.miss(); this._banner('BLOCKED!', '#ffe0b0', '#b9783a', 'into the crates', 76); }
    else if (res.miss) { this.audio.miss(); if (f.last) this.audio.groan(); this._banner(res.short ? 'SHORT!' : 'MISS', '#ffffff', '#9aa3ad', res.short ? 'fell before the butt' : 'off the face', 70); }
    else {
      this.audio.thud(res.ring);
      const nm = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN'];
      if (res.x) { this._banner('X!', '#fff6a8', '#ffb82e', row || 'PERFECT CENTRE', 110); this.audio.gold(streak); this._burst(40 + streak * 8); }
      else if (res.ring === 10) { this._banner('TEN!', '#fff6a8', '#ffb82e', row || 'gold', 96); this.audio.gold(streak); this._burst(26 + streak * 6); }
      else if (res.ring === 9) { this._banner('NINE', '#fff6a8', '#ff9a1f', row || 'gold', 84); this.audio.cheer(false); if (streak >= 2) this.audio.gold(streak); }
      else this._banner(nm[res.ring], res.ring >= 7 ? '#ffd0c8' : '#c4ecff', res.ring >= 7 ? '#e8483a' : '#2f86d8', '', 70);
    }
    // a gold lands with a hit-stop: the world holds for a beat under a white flash (none with reduced motion)
    if (f.shooter === 0 && !res.star && res.ring === 10 && !this.calm) { this.freeze = res.x ? 0.09 : 0.06; this.flash = { t: this.time, a: res.x ? 0.5 : 0.32 }; }
    if (f.shooter === 0 && !res.star) { if (res.ring === 10) st.tens++; if (res.x) st.xs++; }       // a STAR BOX is not a gold
    if (f.shooter === 0 && res.star) st.starBoxes++;
    if (f.shooter === 0 && !res.star) { if (res.ring >= 9) this._quest('gold', 1); if (res.ring === 10) this._quest('ten', 1); if (res.x) this._quest('x', 1); this._quest('streak', this.streak); }
    if (f.shooter === 0) this._agentNote(res);
    this._achCheck(); KAR.Store.save();
    this.bp = 'result'; this.bpT = 0;
    if (res.endDone && !m.over) {
      const p = m.mode === 'duel' ? null : m.pace(this._best()), pc = p === null ? '' : p > 0 ? '  ·  ' + p + ' AHEAD OF YOUR BEST' : p < 0 ? '  ·  ' + (-p) + ' BEHIND YOUR BEST' : '  ·  LEVEL WITH YOUR BEST';
      this.hint = 'END COMPLETE  ·  ' + (m.mode === 'duel' ? 'YOU ' + res.endScores[0] + ' – ' + (m.cup ? m.cup.name : 'CPU') + ' ' + res.endScores[1] : res.endScores[0] + ' POINTS' + pc); this.hintT = 2.4;
    }
  }

  // your best for what you're shooting (a level, a range distance, the SWINGER); 0 when there's none
  _best() { const m = this.match, D = KAR.Store.data; return m.mode === 'stage' ? D.tour.best[m.lv] : m.mode === 'range' ? D.best[m.distIdx] : m.mode === 'swing' ? D.swingBest || 0 : 0; }
  // touch aim speed: sight px per finger px (AIM SPEED in pause)
  aimGain() { return KAR.CFG.TOUCH_GAINS[KAR.Store.data.aimSpeed] || KAR.CFG.TOUCH_GAIN; }

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
    KAR.Store.data.stats.pops += res.pops.length; this._quest('pop', res.pops.length); this._quest('combo', res.mult); this._achCheck();
    const two = res.pops.length > 1, gold = res.bonusArrows > 0;
    this._banner(two ? 'DOUBLE POP!' : 'POP!', '#ffffff', gold ? '#ffb82e' : '#ff5d8a', '+' + res.points + (res.mult > 1 ? '  \u00b7  COMBO \u00d7' + res.mult : '') + (gold ? '  \u00b7  +' + res.bonusArrows + ' ARROWS' : ''), two ? 76 : 88);
    this.audio.pop(res.pops.length, res.mult); this.buzz(res.pops.length > 1 ? [25, 40, 25] : 25); if (two || gold) this._burst(30);
  }

  // THE AGENT watches your arrow: where it landed against the gold, the wind, the draw. Every few arrows, when it
  // sees something worth fixing (and the tutorial coach isn't talking), a tip slides in at the bottom left.
  _agentNote(res) {
    const m = this.match, A = KAR.Agent, D = KAR.Store.data, si = this.shotInfo || { power: 1, held: 0, steady: false };
    if (res.star || res.blocked || m.mode === 'trick') return;
    const last = m.arrows[0][m.arrows[0].length - 1], h = last && last.hit;
    if (!h && !res.short) return;                                      // flew past a moving target: no mark to read
    const w = (m.faceD || KAR.CFG.FACE[m.distIdx]) / 20;
    const shot = A.clean({ dx: h ? h.x : 0, dy: h ? h.y - KAR.CFG.FACE_Y : 0, wind: res.wind * this._kit(0).wind, power: si.power, held: Math.min(60, si.held), steady: si.steady, ring: res.ring, short: !!res.short, w, mv: !!m.offAt, tire: this._kit(0).tire });
    if (!shot) return;
    A.note(this.agentLog, shot); D.agentLog = this.agentLog; this.agentRound.push(shot);      // remembered in the save, so ROBIN knows you next time
    this.agentSince++;
    if (!D.agent || this.coach || this.agentLog.length < 3) return;
    const tip = A.read(this.agentLog)[0];
    if (tip.id === 'warm' || tip.id === 'ok') return;
    if (this.agentTip && this.agentTip.id === tip.id && this.agentSince < 4) return;      // don't nag: the same tip at most every 4 arrows
    this.agentTip = { id: tip.id, line: tip.line, t: this.time }; this.agentSince = 0;
    if (this.audio.chirp) this.audio.chirp();
  }

  // TROPHIES: announce anything newly reached (a card slides in at the top; one at a time)
  _achCheck() {
    const got = KAR.achNew(KAR.Store.data);
    if (!got.length) return;
    KAR.Store.save();
    if (!this.achQ) this.achQ = [];
    for (const a of got) this.achQ.push({ a, t: 0 });
  }

  _banner(text, c1, c2, sub, size) { this.banner = { text, c1, c2, sub, size, age: 0, life: 1.5 }; }
  _burst(n) {
    if (this.calm) n = Math.ceil(n / 4);
    const cols = ['#ffe14d', '#ff6b5a', '#7ac7ff', '#a9ec62', '#ffffff', '#c46bff'];
    for (let i = 0; i < n; i++) this.particles.push({ x: 140 + this.rng() * 680, y: -20 - this.rng() * 120, vx: (this.rng() - 0.5) * 120, vy: 40 + this.rng() * 120, g: 260, rot: this.rng() * 6, vr: (this.rng() - 0.5) * 9, life: 2.2 + this.rng(), col: cols[Math.floor(this.rng() * cols.length)] });
  }

  // the daily result as one line to paste to friends (same balloons for everyone, so the numbers compare)
  // The game's public link: the page's canonical URL (so a share from a preview deploy still points at the live
  // game, and the link unfurls with the share card from the og: tags), else wherever we are.
  link() { const c = document.querySelector('link[rel=canonical]'); return (c && c.href) || location.origin + location.pathname; }
  // SHARE: the moment (a level, world, tour, cup round, daily or trophy) becomes a picture (KAR.Share.card) and a line
  // with a link to its landing page; the SHARE screen previews the picture with where to send it
  _share(kind, a) {
    const mo = KAR.Share.moment(kind, this.match, this, a); if (!mo) return;
    const url = mo.slug ? KAR.Share.url(mo.slug) : this.link(), cv = KAR.Share.card(mo.info);
    const sh = this.shareCv = { kind, mo, url, cv, file: null, slug: mo.slug || 'game' };
    this.shareText = mo.text + ' \u00b7 ' + url; this.shared = -9; this.sharedKind = null;
    KAR.Share.file(cv).then(f => { sh.file = f; });
    if (this.screen !== 'share') this.shareBack = this.screen;
    this.setScreen('share');
  }
  _shareAct(id) {
    const sh = this.shareCv; if (!sh && id !== 'shBack') return;
    const txt = sh && sh.mo.text, url = sh && sh.url;
    try {
      if (id === 'shBack') { this.shareCv = null; this.screen = this.shareBack || 'menu'; this.focusPending = true; if (this.screen === 'over') this.overlayT = 9; }
      else if (id === 'shSheet') {                 // the phone's share sheet, with the picture when it can take files
        if (KAR.Share.canFiles(sh.file)) navigator.share({ files: [sh.file], title: 'Kudbee Archery', text: txt + ' ' + url }).catch(() => {});
        else if (navigator.share) navigator.share({ title: 'Kudbee Archery', text: txt, url }).catch(() => {});
        this.shared = this.time; this.sharedKind = 'sheet';
      }
      else if (id === 'shX' || id === 'shFB' || id === 'shWA') { window.open(KAR.Share.intent({ shX: 'x', shFB: 'fb', shWA: 'wa' }[id], txt, url), '_blank', 'noopener'); this.shared = this.time; this.sharedKind = id; }
      else if (id === 'shCopy') { this.shared = this.time; this.sharedKind = 'copy'; navigator.clipboard.writeText(this.shareText).catch(() => {}); }
      else if (id === 'shSave') {                  // the picture as a file (a download on a computer, the photo prompt on a phone)
        const a = document.createElement('a'); a.download = 'kudbee-archery-' + sh.slug + '.png';
        a.href = sh.file ? URL.createObjectURL(sh.file) : sh.cv.toDataURL('image/png');
        document.body.appendChild(a); a.click(); a.remove(); if (sh.file) setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        this.shared = this.time; this.sharedKind = 'save';
      }
    } catch (e) { /* no clipboard / pop-ups blocked: the line still shows on the SHARE screen */ }
  }

  _finishMatch() {
    const m = this.match, D = KAR.Store.data, s0 = KAR.starTotal(D);
    this.newGear = [];
    const gearUp = () => { this.newGear = KAR.gearBetween(s0, KAR.starTotal(D)); };
    if (m.daily) {
      const dd = D.daily;
      if (dd.day !== m.daily) { dd.day = m.daily; dd.best = 0; dd.plays = 0; dd.first = m.score; }
      dd.plays++; D.stats.dailies++; this._quest('daily', 1); this.newBest = m.score > dd.best; dd.best = Math.max(dd.best, m.score);
      this._achCheck(); KAR.Store.save(); this.setScreen('over');
      if (this.newBest && m.score > 0) { this.audio.win(); this._burst(80); } else this.audio.lose();
      return;
    }
    if (m.mode === 'stage') {
      const T = D.tour, i = m.lv, sc = m.total(0), st = m.stars(), wasOpen = KAR.tourOpen(i + 1, D), bosses = () => KAR.TOUR.every((L, j) => !L.boss || T.stars[j] > 0), before = bosses();
      const sides = KAR.TOUR.map((L, j) => L.after === i && !KAR.tourOpen(j, D) ? L.v : -1).filter(v => v >= 0);   // side worlds this level opens
      T.fails[i] = st >= 1 ? 0 : Math.min(99, T.fails[i] + 1); this.aidNext = st === 0 && this.aidOn(m);
      this.newBest = sc > T.best[i]; T.best[i] = Math.max(T.best[i], sc); this.starGemsWon = KAR.starGems(D, T.stars[i], st); T.stars[i] = Math.max(T.stars[i], st);
      this.unlocked = i + 1 < KAR.TOUR.length && !wasOpen && KAR.tourOpen(i + 1, D) && KAR.TOUR[i + 1].after === undefined;
      this.sideOpen = st >= 1 && sides.length ? sides[0] : undefined;
      this.tourDone = !before && bosses();
      if (st >= 2) this._quest('level2', 1);
      gearUp(); this._achCheck(); KAR.Store.save(); this.setScreen('over');
      if (st >= 1) { this.audio.win(); this._burst(60 + st * 20); } else this.audio.lose();
      return;
    }
    if (m.mode === 'swing') {
      const sc = m.total(0); this.newBest = sc > (D.swingBest || 0); D.swingBest = Math.max(D.swingBest || 0, sc);
      if (sc >= 60) this._quest('swing', 1);
      this._achCheck(); KAR.Store.save(); this.setScreen('over');
      if (this.newBest && sc > 0) { this.audio.win(); this._burst(80); } else this.audio.lose();
      return;
    }
    if (m.mode === 'trick') {
      this.newBest = m.score > (D.trickBest || 0); D.trickBest = Math.max(D.trickBest || 0, m.score);
      this._achCheck(); KAR.Store.save(); this.setScreen('over');
      if (this.newBest && m.score > 0) { this.audio.win(); this._burst(80); } else this.audio.lose();
      return;
    }
    if (m.mode === 'range') {
      const sc = m.total(0), stars = m.stars(), was = KAR.locked(3, D);
      this.newBest = sc > D.best[m.distIdx]; D.best[m.distIdx] = Math.max(D.best[m.distIdx], sc); this.starGemsWon = KAR.starGems(D, D.stars[m.distIdx], stars); D.stars[m.distIdx] = Math.max(D.stars[m.distIdx], stars);
      this.unlocked = was && !KAR.locked(3, D); gearUp();
      if (sc >= 100) this._quest('range', 1);
    } else {
      D.stats.duels++; if (m.winner === 0) { D.stats.wins++; if (m.levelIdx === 2 && !m.cup) D.stats.legendWins++; this._quest('duel', 1); }
      // THE CUP: the tie is in; the rest of the round is shot out. Winning a cup pays gems (the full prize the first time)
      if (m.cup && D.cup && !KAR.Cup.done(D.cup) && D.cup.round === m.cup.round) {
        KAR.Cup.result(D.cup, m.winner === 0);
        if (D.cup.won) { const t = D.cup.tier; this.cupGems = D.cupWon[t] ? KAR.CUP_REPEAT : KAR.CUPS[t].gems; D.cupWon[t]++; D.gems += this.cupGems; }
      }
    }
    this._achCheck(); KAR.Store.save();
    this.setScreen('over');
    if (m.cup && D.cup && D.cup.won) { this.audio.win(); this._burst(140); }
    else if ((m.mode === 'duel' && m.winner === 0) || (m.mode === 'range' && m.stars() >= 1)) { this.audio.win(); this._burst(80); } else this.audio.lose();
  }

  // ---- loop ---------------------------------------------------------------------
  _frame(ts) {
    requestAnimationFrame(this._frame);
    const dt = Math.min(0.1, (ts - this.last) / 1000) || 0;
    this.last = ts;
    if (this.screen === 'play' && dt > 0 && !document.hidden) {
      this.slow += dt; this.slowN++;
      if (this.slowN >= 90) { if (this.slow / this.slowN > 0.026 && this.quality > 0.55) { this.quality = Math.max(0.55, this.quality * 0.8); this._fit(); } this.slow = 0; this.slowN = 0; }
    }
    this._update(dt);
    this._render();
  }

  _update(dt) {
    this.time += dt;
    const wt = this.freeze > 0 ? 0 : dt; if (this.freeze > 0) this.freeze -= dt;      // the hit-stop holds the world (not the clock)
    if (this.banner) { this.banner.age += dt; this.banner.life -= dt; if (this.banner.life <= 0) this.banner = null; }
    if (this.hintT > 0) this.hintT -= dt;
    for (const p of this.pops) p.age += wt;
    this.pops = this.pops.filter(p => p.age < 1.2);
    this.shake *= Math.exp(-dt * 9);
    for (const p of this.particles) { p.life -= wt; p.x += p.vx * wt; p.y += p.vy * wt; p.vy += p.g * wt; p.rot += p.vr * wt; }
    this.particles = this.particles.filter(p => p.life > 0);
    this.zoom += (this.zoomTarget - this.zoom) * Math.min(1, dt * (this.zoomTarget > this.zoom ? 4.2 : 6));
    if (this.screen === 'play') this._updateShot(wt); else this.overlayT += dt;
    // the results card's stars land one by one, each with a rising chime (in step with UI.overStage)
    if (this.screen === 'over' && this.match.mode === 'stage') { const st = this.match.stars(); while (this.starDing < st && this.overlayT > 0.4 + this.starDing * 0.3) { this.starDing++; this.audio.star(this.starDing); this.buzz(10); } }
    // each world plays its own tune (the map plays the world on its page)
    this.audio.theme = this.screen === 'levels' ? this.worldView | 0 : /^(play|paused|over)$/.test(this.screen) || (this.screen === 'share' && this.shareBack === 'over') ? this.match.venue || 0 : 0;
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
        const wasFull = this.draw >= 1, was3 = Math.floor(this.draw * 3);
        // a recurve gets heavier toward the anchor: quick off the brace, slow into the last few inches
        this.draw = Math.min(1, this.draw + dt / C.DRAW_T * 1.044 * (1.35 - 0.7 * this.draw));
        if (this.draw >= 1 && !wasFull) { this.audio.full(); if (!this.cpu) this.buzz(12); }
        else if (!this.cpu && Math.floor(this.draw * 3) > was3) this.buzz(5);          // the limbs loading up: a tick at a third and two thirds
        this.audio.drawSet(this.draw);
        if (this.draw >= 1) this.holdT += dt;
        // breath: holding steadies the sight for a couple of seconds; empty lungs make it worse
        if (this.holding && this.breath > 0 && this.gasp <= 0) this.breath = Math.max(0, this.breath - dt / 2.4);
        else { this.breath = Math.min(1, this.breath + dt / 5); }
        if (this.breath <= 0 && this.holding && this.gasp <= 0) { this.gasp = 0.9; this.holding = this.coarse ? false : this.holding; }
        if (this.gasp > 0) this.gasp -= dt;
        const steady = this.holding && this.breath > 0 && this.gasp <= 0;
        const kit = this._kit(m.shooter);
        const fatigue = Math.max(0, this.holdT - C.STEADY_T / kit.tire) * 0.9 * kit.tire + (this.gasp > 0 ? 0.9 : 0);
        const amp = C.BASE_SWAY * kit.sway * m.dist * (1 + fatigue) * (steady ? 0.25 : 1) * (0.55 + 0.45 * this.draw);
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
      this.orbit = hero && !m.boxes ? KAR.Util.clamp((this.bpT - 0.15) / 0.7, 0, 1) : 0;       // (behind a crate wall it holds instead)
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
    ctx.setTransform(this.res, 0, 0, this.res, -R.XL * this.res, 0);
    if (document.body.dataset.screen !== this.screen) document.body.dataset.screen = this.screen;
    ctx.save();
    if (this.shake > 0.3 && !this.calm) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    R.setView(this.zoom, m.dist, m.faceD, m.viewD);
    const sel = this.screen === 'levels', menuish = this.screen === 'menu' || this.screen === 'gear' || this.screen === 'trophies' || this.screen === 'quests' || this.screen === 'shop' || this.screen === 'agent' || this.screen === 'install' || sel || (this.screen === 'share' && this.shareBack !== 'over');
    R.tOff = m.offAt && !menuish ? m.offAt(m.T) : null; R.venue = sel ? (this.worldView | 0) : menuish ? 0 : (m.venue || 0); R.gear = KAR.Store.data.gear; R.railA = m.move === 'slide' ? m.def.amp : 0; R.orbitA = m.move === 'orbit' ? m.def.amp : 0; R.boss = !menuish && !!(m.def && m.def.boss);
    R.flags = !menuish && m.def && m.def.flags || null;
    R.boxes = !menuish && m.boxes ? m.boxes.map((b, i) => ({ x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1, star: b.star, mv: b.mv, off: m.boxOff(i, m.T), gone: m.boxGone(i, this.showEnd, m.T) })) : null;
    if (this.camB > 0 && this.camTip) R.chase(this.camTip, this.camB, this.bp === 'result' ? this.orbit : 0);
    if (!sel && R._mapC) R.dropMap();                  // the map's cached layers are big: let them go off the map
    if (menuish && !sel && R.drawMenuPhoto(ctx)) { /* photo carries its own target */ }
    else if (sel) R.mapScene(ctx, this.worldView | 0, this.time);
    else {
      R.drawWorld(ctx, this.time, m.wind);
      if (m.mode === 'trick') R.drawBalloons(ctx, m, this.time); else R.drawTarget(ctx, this.time, m.wind, m.offAt ? (m.move || 'swing') : null);
      this._drawArrows(ctx);
    }
    if (!menuish) {
      R.drawWind(ctx, this.time, m.wind); this._drawAim(ctx);
      const rel = (this.time - this.relT) / 0.45;
      if (rel >= 0 && rel < 1 && this.screen === 'play') R.bow(ctx, this.relX || 480, this.relY || 300, 0, this.relTeam ? 1 : 0, this.time, Math.max(0.001, rel));
    }
    if (this.flash) { const a = this.flash.a * (1 - (this.time - this.flash.t) / 0.22); if (a > 0) { ctx.fillStyle = 'rgba(255,250,224,' + a.toFixed(3) + ')'; ctx.fillRect(R.XL, 0, R.XW, 640); } else this.flash = null; }
    ctx.restore();
    U.begin();
    for (const p of this.particles) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.col; const w = p.w || 8, h = p.h || 5; ctx.fillRect(-w / 2, -h / 2, w, h); ctx.restore(); }
    if (this.screen === 'menu') U.menu(ctx, this);
    else if (this.screen === 'gear') U.gearScreen(ctx, this);
    else if (this.screen === 'trophies') U.trophies(ctx, this);
    else if (this.screen === 'quests') U.quests(ctx, this);
    else if (this.screen === 'shop') U.shop(ctx, this);
    else if (this.screen === 'agent') U.agent(ctx, this);
    else if (this.screen === 'install') U.installScreen(ctx, this);
    else if (this.screen === 'share' && menuish) U.shareScreen(ctx, this);
    else if (sel) U.levels(ctx, this);
    else {
      if (this.screen !== 'share') U.hud(ctx, this);        // (the SHARE screen covers the scoreboard: none of its buttons under it)
      if (this.screen === 'paused') U.pause(ctx, this);
      else if (this.screen === 'over') { U.over(ctx, this); U.debrief(ctx, this); }
      else if (this.screen === 'share') U.shareScreen(ctx, this);
    }
    if (this.screen !== 'share') U.achToast(ctx, this);     // (held while the SHARE screen previews its card; it shows after)
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
    if (this.screen === 'menu' || this.screen === 'gear' || this.screen === 'trophies' || this.screen === 'quests' || this.screen === 'shop' || this.screen === 'agent' || this.screen === 'levels') return;
    const f0 = this.flight, newest = f0 ? m.arrows[f0.shooter][m.arrows[f0.shooter].length - 1] : null;
    // arrows in the face, then the THINK BOX crates in front of it, then the arrows stuck in the crates
    const stuck = inCrate => { for (let s = 0; s < m.shooters; s++) for (const a of m.arrows[s]) if (a.end === this.showEnd && !!(a.hit && a.hit.z !== undefined) === inCrate && !(this.bp === 'flight' && a === newest)) R.stuck(ctx, a, s, a === newest ? this.time - this.landT : undefined); };
    // impact rings (one in a crate is drawn with the crates)
    const rings = inCrate => { for (const p of this.pops) { if ((p.z !== undefined) !== inCrate) continue; const q = R.proj(p.x, p.y, p.z || m.dist); if (!q) continue; ctx.beginPath(); ctx.arc(q.x, q.y, (0.05 + p.age * 0.25) * q.k, 0, 6.283); ctx.strokeStyle = 'rgba(255,255,255,' + (1 - p.age / 1.2) + ')'; ctx.lineWidth = 3; ctx.stroke(); } };
    stuck(false); rings(false);
    if (R.boxes) { R.drawBoxes(ctx, this.time, m.wind, m.offAt ? m.move : null); stuck(true); rings(true); }
    if (this.bp === 'flight' && this.flight) {
      const f = this.flight, S = f.res.samples, tip = this._tip(f), i = tip.i, b = S[Math.min(S.length - 1, i + 1)];
      const prev = S[Math.max(0, i - 1)], dir = { x: b.x - prev.x, y: b.y - prev.y, z: b.z - prev.z };
      // faint trail (not from the arrow cam: it would be drawn through the lens)
      ctx.save(); ctx.lineCap = 'round';
      const zw = R.boxes && tip.z > m.dist - KAR.BOXZ ? m.dist - KAR.BOXZ : -1;      // (past a crate wall: only the part through the window)
      if (this.camB < 0.5) for (let j = Math.max(0, i - 14); j < i; j++) { if (S[j].z < zw) continue; const p = R.proj(S[j].x, S[j].y, S[j].z), q = R.proj(S[j + 1].x, S[j + 1].y, S[j + 1].z); if (!p || !q) continue; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.strokeStyle = 'rgba(255,255,255,' + (0.5 * (j - (i - 14)) / 14) + ')'; ctx.lineWidth = 2 + 3 * (1 - this.zoom); ctx.stroke(); }
      ctx.restore();
      if (!f.done) {
        // arrow cam: speed lines streaming past the lens
        if (this.camB > 0.3) { ctx.save(); ctx.globalAlpha = (this.camB - 0.3) * 0.9; ctx.strokeStyle = '#ffffff'; ctx.lineCap = 'round'; for (let j = 0; j < 14; j++) { const a = j * 2.399, r0 = 250 + ((j * 97 + this.time * 1600) % 240); ctx.lineWidth = 1.5 + (j % 3); ctx.beginPath(); ctx.moveTo(480 + Math.cos(a) * r0, 300 + Math.sin(a) * r0 * 0.7); ctx.lineTo(480 + Math.cos(a) * (r0 + 70), 300 + Math.sin(a) * (r0 + 70) * 0.7); ctx.stroke(); } ctx.restore(); }
        // arrow cam: the real 3D arrow seen from behind; otherwise the stretched long-shot arrow so it reads in the wide view
        if (this.camB > 0.3) { const L = Math.hypot(dir.x, dir.y, dir.z) || 1; R.arrow3(ctx, tip, { x: dir.x / L, y: dir.y / L, z: dir.z / L }, 0.75, f.shooter, { rot: f.t * 40 }); }   // vanes spin the arrow in flight
        else {
          let len = 0.8 + 3.2 * (1 - this.zoom);
          if (R.boxes && tip.z > m.dist - KAR.BOXZ) { const L = Math.hypot(dir.x, dir.y, dir.z) || 1; len = Math.max(0.3, Math.min(len, (tip.z - m.dist + KAR.BOXZ) * L / Math.max(1e-6, dir.z))); }   // past the crates: only what is through the window
          R.arrow(ctx, tip, dir, len, f.shooter, 0);
        }
      }
    } else if (this.bp === 'result' && this.flight && this.flight.res.hit) { /* stuck arrow already drawn from match.arrows */ }
  }

  _drawAim(ctx) {
    const R = KAR.Render, m = this.match;
    if (this.bp !== 'ready' || this.zoom < 0.85 || this.screen === 'over') return;
    const cpu = !!this.cpu;
    if (this.coach && this.coach.marker && !cpu) R.marker(ctx, this.coach.marker, m, this.time);
    const aid = !cpu && !(this.coach && this.coach.marker) && this.aid ? this._aidMark() : null;      // AIM HELP rides over the bow (its label stays readable), under the sight
    if (!this.drawing && !cpu) { if (aid) R.marker(ctx, aid, m, this.time); return; }
    const sx = this.aimX + this.sway.x, sy = this.aimY + this.sway.y, q = R.proj(sx, sy, m.dist);
    if (!q) return;
    R.bow(ctx, q.x, q.y, this.draw, cpu ? 1 : 0, this.time, 0, { creep: this.draw >= 1 && !cpu ? Math.max(0, this.holdT - KAR.CFG.STEADY_T) : 0 });
    if (aid) R.marker(ctx, aid, m, this.time);
    this.relX = q.x; this.relY = q.y;
    const r = Math.max(14, 0.12 * q.k * Math.min(1, m.faceD / 0.6) + 8);
    R.sight(ctx, q.x, q.y, Math.min(26, r), this.steady, this.time, cpu ? 1 : 0);
  }
};

document.addEventListener('DOMContentLoaded', () => { window.KARGame = new KAR.Game(document.getElementById('gameCanvas')); });
