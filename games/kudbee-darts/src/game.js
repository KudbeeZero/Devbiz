/* =====================================================================
 * Kudbee Darts — game.js
 * The orchestrator: owns the canvas, the fixed-timestep loop, the state
 * machine (menu / play / turnEnd / matchOver / pause), the turn director,
 * scoring hand-off to the active mode, progression, the HUD, the on-canvas
 * menus, and all the juice (slow-mo, screen shake, confetti, callouts).
 *
 * Logical resolution is a fixed 960x720; the canvas scales responsively.
 * ===================================================================== */
(function (KD) {
  'use strict';
  const Util = KD.Util;

  const VIEW_W = 960;
  const VIEW_H = 720;
  const DART_SCALE = 1.75;  // increased 25%
  const C = {
    cyan: '#39e6ff', violet: '#c46bff', green: '#7CFFb2',
    gold: '#ffd34d', ember: '#ff5d3c', text: '#cfe9ff', dim: '#7d8aa8',
  };

  function Game(opts) {
    this.canvas = opts.canvas;
    this.ctx = this.canvas.getContext('2d');
    this._readableText();
    this.viewW = VIEW_W; this.viewH = VIEW_H;
    this.canvas.width = VIEW_W; this.canvas.height = VIEW_H;
    this.debug = false;
    this.time = 0;
    this.timeScale = 1;

    // Respect prefers-reduced-motion: shake/zoom/confetti flourishes thin out.
    this.reduceMotion = !!(window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    // Engine systems.
    this.input = new KD.Input(this.canvas);
    this.audio = new KD.Audio();
    this.camera = new KD.Camera(this.viewW, VIEW_H);
    if (this.reduceMotion) this.camera.shakeScale = 0;
    this.particles = new KD.Particles();
    this.sprites = new KD.Sprites();
    this.board = new KD.Board();
    this._fit();
    this.progression = new KD.Progression();
    this.board.setTheme(this.progression.data.settings.boardTheme);
    this.dart = new KD.Dart(this);
    this.humanSigma = 0.030;   // a touch more scatter -> aim matters more

    // Menu selection.
    this.selMode = 'x01';
    this.selOpp = 'career';

    // Darts Birds campaign: the level being played (null for a normal match)
    // and the world page shown on the level map.
    this.levelIdx = null;
    this.mapWorld = 0;
    this.crateT = 0;      // THINK BOX crate clock (runs on slow-mo time, like the dart)

    // Board "lunge": a quick scale-in + snap-back on each throw release, so the
    // board reads as reacting to the dart leaving the hand (Darts-of-Fury feel).
    this._lungeT = 0;
    this.LUNGE_DUR = 0.30;
    this.boardScale = 1;

    // Match state.
    this.players = [];
    this.current = 0;
    this.mode = null;
    this.dartsThisTurn = 0;
    this.stuckDarts = [];
    // Genuine misses don't stick — they tumble off-board instead (see
    // _spawnBounceDart / _drawBounceDarts). Separate from stuckDarts so a
    // per-turn clear doesn't cut a still-animating bounce short.
    this.bounceDarts = [];
    // Dart-grouping (muscle memory): the running cluster center of the human's
    // landed darts this turn. Non-null => subsequent darts get pulled toward it,
    // so grooving a line (rushing the trebles) reads as skillfully tight. Reset
    // every turn. Only affects the human; the AI throws true to its own target.
    this._groupCenter = null;
    this._groupStrength = 0;     // 0..1, grows as the player stacks darts on target
    this.aiTimer = 0;
    this.isLadder = false;
    this.ladderRank = 0;
    // Lets a checkout/180 hold its slow-mo for a beat before the normal
    // per-frame ease-back (below) resumes — so the biggest moments don't get
    // cut short by the same recovery rate as an ordinary big hit.
    this._slowmoHoldT = 0;

    // UI feedback.
    this.callout = null;        // { text, life }
    this.banner = '';
    this.toasts = [];
    this.turnEndTimer = 0;
    this.matchResult = null;
    this.hitFlash = null;       // { res, life, col } — lit segment on the board
    this.flickFb = null;        // { text, col, life } — swipe coaching read-out

    this.progression.onToast = (text, sub) => {
      this.toasts.push({ text: text, sub: sub, life: 2.4 });
    };

    // Every launch opens on the KUDBEE STUDIOS card, then the menu.
    this.state = 'intro';
    this.introT = 0;
    this.loop = new KD.Loop(this._update.bind(this), this._render.bind(this));
    this._bindMeta();
  }

  // The flick release speed the power band is centered on right now — learned
  // per player by Progression, so the sweet spot fits this device's throw.
  Game.prototype.idealFlick = function () {
    return this.progression ? this.progression.flickIdeal() : 1500;
  };

  // Phone-first: the logical width follows the real screen's aspect, so the
  // canvas fills a wide phone or laptop with no letterbox bars. Height stays
  // 720 and the width is clamped to 4:3 .. 2.4:1 so the board never distorts.
  Game.prototype._fit = function () {
    const r = this.canvas.parentNode.getBoundingClientRect();
    const aspect = Math.min(2.4, Math.max(4 / 3, r.width / r.height || 4 / 3));
    const w = Math.round(VIEW_H * aspect);
    // Logical px that show as 11 CSS px at this screen height (0 = no bump).
    const scale = r.height / VIEW_H;
    this._minFont = scale > 0 && scale < 1 ? 11 / scale : 0;
    if (w === this.viewW) return;
    // The board recentres; keep darts already in it (and the aim) on it.
    const dx = (w - this.viewW) / 2;
    (this.stuckDarts || []).forEach((d) => { d.x += dx; });
    (this.bounceDarts || []).forEach((d) => { d.x += dx; });
    if (this.dart) this.dart.aimX += dx;
    this.viewW = w;
    this.canvas.width = w; this.canvas.height = VIEW_H;
    this.camera.viewW = w;
    this.board.layout(w / 2, 296, 232);
  };

  // Small print stays readable on phones: the canvas is shown at about 0.54x
  // on a 390px-tall landscape phone, so a 14px label would land near 7.5 CSS
  // px. Every font size set on this context is raised toward the size that
  // shows as 11 CSS px (at most 1.6x, so layouts keep their shape). _fit
  // keeps _minFont current; big desktop screens are left untouched.
  Game.prototype._readableText = function () {
    const desc = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'font');
    if (!desc || !desc.set) return;
    const game = this;
    this._minFont = 0;
    Object.defineProperty(this.ctx, 'font', {
      configurable: true,
      get() { return desc.get.call(this); },
      set(v) {
        const min = game._minFont;
        if (min > 0) {
          v = String(v).replace(/(\d+(?:\.\d+)?)px/, (m, n) => {
            n = +n;
            return (n >= min ? n : Math.min(min, n * 1.6)).toFixed(1) + 'px';
          });
        }
        desc.set.call(this, v);
      },
    });
  };

  // How much _readableText is growing ~12px labels right now (1 = not at all),
  // so tightly stacked lines can open their spacing to match.
  Game.prototype._textBump = function () {
    return this._minFont > 12 ? Math.min(1.6, this._minFont / 12) : 1;
  };

  Game.prototype.start = function () {
    window.addEventListener('resize', () => this._fit());
    this._fit();
    this.audio.startMusic();
    this.loop.start();
    // Defer leaderboard init to avoid blocking game startup
    setTimeout(() => this._lbInit(), 100);
  };

  // Triggered by Dart.release(): the board lunges in a touch, then snaps back.
  Game.prototype.lungeBoard = function () {
    if (this.reduceMotion) return;      // stillness beats snap under reduced motion
    this._lungeT = this.LUNGE_DUR;
  };

  // Set the big centre callout with a pop-in scale (see _drawCallout).
  Game.prototype._say = function (text, life, col) {
    this.callout = { text: text, life: life, max: life, col: col || C.gold };
  };

  Game.prototype._bindMeta = function () {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Backquote') this.debug = !this.debug;
      if (e.code === 'KeyM') {
        const on = !this.audio.enabled;
        this.audio.setEnabled(on);
        this.progression.data.settings.sound = on;
        this.progression.save();
      }
    });
  };

  // ====================================================================
  // UPDATE
  // ====================================================================
  Game.prototype._update = function (dt) {
    this.input.poll();
    this.time += dt;

    if (this.state === 'intro') this._updateIntro(dt);
    else if (this.state === 'menu') this._updateMenu(dt);
    else if (this.state === 'levels') this._updateLevels(dt);
    else if (this.state === 'play') this._updatePlay(dt);
    else if (this.state === 'turnEnd') this._updateTurnEnd(dt);
    else if (this.state === 'matchOver') this._updateMatchOver(dt);
    else if (this.state === 'reward') this._updateReward(dt);
    else if (this.state === 'pause') this._updatePause(dt);
    else if (this.state === 'workshop') this._updateWorkshop(dt);
    else if (this.state === 'leaderboard') this._updateLeaderboard(dt);
    else if (this.state === 'missions') this._updateMissions(dt);

    // Board lunge spring (comes in fast, snaps back).
    if (this._lungeT > 0) {
      this._lungeT = Math.max(0, this._lungeT - dt);
      const u = 1 - this._lungeT / this.LUNGE_DUR;     // 0 -> 1
      this.boardScale = 1 + Math.sin(u * Math.PI) * 0.055;
    } else {
      this.boardScale = Util.lerp(this.boardScale, 1, 1 - Math.pow(0.001, dt));
    }

    // Ease slow-mo back to normal; animation systems run on scaled time. A
    // checkout/180 can hold this a beat via _slowmoHoldT before the ease-back
    // resumes, so the celebration isn't clipped short.
    if (this._slowmoHoldT > 0) this._slowmoHoldT = Math.max(0, this._slowmoHoldT - dt);
    else this.timeScale = Util.approach(this.timeScale, 1, dt * 2.2);
    const adt = dt * this.timeScale;
    this.crateT += adt;
    this.particles.update(adt);
    this.camera.update(adt);
    if (this.dart.state === 'flying') {
      // Emit trail particles during flight.
      if (!this.reduceMotion && Math.random() < 0.6) {
        const dartPos = this.dart._getFlightPos && this.dart._getFlightPos();
        if (dartPos) {
          const skinCol = (this.dart.skin && this.dart.skin.color) || '#39e6ff';
          this.particles.trail(dartPos.x, dartPos.y, dartPos.vx || 0, dartPos.vy || 0, skinCol);
        }
      }
      if (this.dart.update(adt)) this._onDartLand();
    }

    // Tumbling "bounce out" darts from a genuine miss (see _spawnBounceDart).
    for (let i = this.bounceDarts.length - 1; i >= 0; i--) {
      const b = this.bounceDarts[i];
      b.life -= dt;
      if (b.life <= 0) { this.bounceDarts.splice(i, 1); continue; }
      b.vy += b.grav * dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.rot += b.spin * dt;
    }

    if (this.callout) { this.callout.life -= dt; if (this.callout.life <= 0) this.callout = null; }
    if (this.hitFlash) { this.hitFlash.life -= dt * 1.7; if (this.hitFlash.life <= 0) this.hitFlash = null; }
    if (this.flickFb) { this.flickFb.life -= dt * 0.9; if (this.flickFb.life <= 0) this.flickFb = null; }
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      this.toasts[i].life -= dt;
      if (this.toasts[i].life <= 0) this.toasts.splice(i, 1);
    }

    // Digital scoreboard: pop decay + shed-brick physics (HUD space).
    for (let i = 0; i < this.players.length; i++) {
      const pl = this.players[i];
      if (pl._scorePop > 0) {
        if (!pl._shedFired && pl._digX != null) { this._shedDigits(pl); pl._shedFired = true; }
        pl._scorePop = Math.max(0, pl._scorePop - dt * 2.2);
        if (pl._scorePop === 0) pl._shedFired = false;
      }
      const sh = pl._shed;
      if (sh && sh.length) {
        for (let j = sh.length - 1; j >= 0; j--) {
          const b = sh[j];
          b.life -= dt; if (b.life <= 0) { sh.splice(j, 1); continue; }
          b.vy += 900 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.rot += b.spin * dt;
        }
      }
    }

    this.input.endFrame();
  };

  // ---- Menu --------------------------------------------------------------
  Game.prototype._menuLayout = function () {
    const btns = [];
    const cx = this.viewW / 2;
    // Mode toggle
    btns.push({ id: 'mode:x301', label: '301', x: cx - 225, y: 196, w: 140, h: 52, sel: this.selMode === 'x301', group: 'mode' });
    btns.push({ id: 'mode:x01', label: '501', x: cx - 70, y: 196, w: 140, h: 52, sel: this.selMode === 'x01', group: 'mode' });
    btns.push({ id: 'mode:cricket', label: 'CRICKET', x: cx + 85, y: 196, w: 140, h: 52, sel: this.selMode === 'cricket', group: 'mode' });
    // Opponent
    const opps = [['career', 'CAREER'], ['hotseat', '2P'], ['Rookie', 'ROOKIE'], ['Pro', 'PRO'], ['Legend', 'LEGEND']];
    const ow = 158, gap = 8, total = opps.length * ow + (opps.length - 1) * gap;
    let ox = cx - total / 2;
    opps.forEach((o) => {
      btns.push({ id: 'opp:' + o[0], label: o[1], x: ox, y: 304, w: ow, h: 46, sel: this.selOpp === o[0], group: 'opp' });
      ox += ow + gap;
    });
    // Play: a quick match, or the Darts Birds campaign map.
    btns.push({ id: 'play', label: '▶  PLAY', x: cx - 270, y: 372, w: 250, h: 64, sel: false, group: 'play' });
    btns.push({ id: 'camp', label: '🌙  DARTS BIRDS', x: cx + 20, y: 372, w: 250, h: 64, sel: false, group: 'camp' });
    // Board look: neon (default) or a classic pub board.
    btns.push({ id: 'theme', label: 'BOARD: ' + (this.board.themeName === 'pub' ? 'PUB' : 'NEON'), x: cx + 280, y: 382, w: 170, h: 44, sel: false, group: 'theme' });
    // Secondary nav: the Dart Workshop and the League Leaderboard.
    btns.push({ id: 'nav:workshop', label: '🎯  DART WORKSHOP', x: cx - 389, y: 456, w: 254, h: 54, sel: false, group: 'nav' });
    btns.push({ id: 'nav:missions', label: '📅  MISSIONS', x: cx - 125, y: 456, w: 250, h: 54, sel: false, group: 'nav' });
    btns.push({ id: 'nav:leaderboard', label: '🏆  LEADERBOARD', x: cx + 135, y: 456, w: 254, h: 54, sel: false, group: 'nav' });
    return btns;
  };

  // ---- Darts Birds campaign: level map -----------------------------------
  Game.prototype._openLevels = function () {
    const prog = this.progression, L = KD.Campaign.LEVELS;
    // Open on the first unlocked level still at zero stars, else the last world.
    let w = KD.Campaign.WORLDS.length - 1;
    for (let i = 0; i < L.length; i++) {
      if (prog.campaignUnlocked(i) && prog.campaignStars(i) === 0) { w = L[i].world; break; }
    }
    this.mapWorld = w;
    this.state = 'levels';
  };

  Game.prototype._pageWorld = function (d) {
    const last = KD.Campaign.WORLDS.length - 1;
    this.mapWorld = Math.max(0, Math.min(last, this.mapWorld + d));
  };

  Game.prototype._playLevel = function (i) {
    if (!this.progression.campaignUnlocked(i)) {
      this.toasts.push({ text: 'LOCKED', sub: 'Beat the level before it', life: 2.2 });
      return;
    }
    this.levelIdx = i;
    this._startMatch();
  };

  Game.prototype._levelsLayout = function () {
    const cx = this.viewW / 2, btns = [];
    const range = KD.Campaign.worldRange(this.mapWorld);
    const TW = 150, GAP = 18;
    const total = range.count * TW + (range.count - 1) * GAP;
    let x = cx - total / 2;
    for (let k = 0; k < range.count; k++) {
      const i = range.first + k;
      const boss = !!KD.Campaign.LEVELS[i].boss;
      btns.push({ id: 'lvl:' + i, x: x, y: boss ? 236 : 254, w: TW, h: boss ? 196 : 172, group: 'level', idx: i });
      x += TW + GAP;
    }
    btns.push({ id: 'back', x: 22, y: 20, w: 128, h: 46, group: 'nav' });
    btns.push({ id: 'prev', x: 18, y: 296, w: 56, h: 116, group: 'page' });
    btns.push({ id: 'next', x: this.viewW - 74, y: 296, w: 56, h: 116, group: 'page' });
    return btns;
  };

  Game.prototype._updateLevels = function () {
    if (this.input.justPressed('back')) { this.state = 'menu'; return; }
    if (this.input.justPressed('left')) { this._pageWorld(-1); return; }
    if (this.input.justPressed('right')) { this._pageWorld(1); return; }
    const p = this.input.pointer;
    if (!p.justUp) return;
    // A horizontal swipe pages worlds; anything shorter is a tap.
    const dx = p.x - p.startX, dy = p.y - p.startY;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy)) { this._pageWorld(dx < 0 ? 1 : -1); return; }
    const btns = this._levelsLayout();
    for (let i = 0; i < btns.length; i++) {
      const b = btns[i];
      if (p.x < b.x || p.x > b.x + b.w || p.y < b.y || p.y > b.y + b.h) continue;
      this.audio.tick();
      if (b.id === 'back') this.state = 'menu';
      else if (b.id === 'prev') this._pageWorld(-1);
      else if (b.id === 'next') this._pageWorld(1);
      else if (b.group === 'level') this._playLevel(b.idx);
      return;
    }
  };

  // Results-card buttons for a campaign leg.
  Game.prototype._matchButtons = function () {
    const r = this.matchResult, lvl = r && r.level;
    if (!lvl) return [];
    const items = [];
    if (lvl.won && lvl.next != null) items.push({ id: 'next', label: 'NEXT LEVEL  ›', group: 'primary' });
    items.push({ id: 'retry', label: '↻  RETRY', group: 'btn' });
    items.push({ id: 'levels', label: 'LEVELS', group: 'nav' });
    items.push({ id: 'share', label: 'SHARE', group: 'share' });
    const w = 210, gap = 16, cx = this.viewW / 2, y = VIEW_H / 2 + 112, h = 54;
    let x = cx - (items.length * w + (items.length - 1) * gap) / 2;
    items.forEach((it) => { it.x = x; it.y = y; it.w = w; it.h = h; x += w + gap; });
    return items;
  };

  // The game's public link: the page's canonical URL, so a share from a
  // preview deploy still points at the live game and unfurls with its card.
  Game.prototype._shareLink = function () {
    const c = document.querySelector('link[rel=canonical]');
    return (c && c.href) || location.origin + location.pathname;
  };

  // Phones open the share sheet; elsewhere the line and link are copied.
  Game.prototype._share = function () {
    const r = this.matchResult, lvl = r && r.level;
    if (!lvl) return;
    const L = KD.Campaign.LEVELS[lvl.idx];
    const txt = lvl.won
      ? 'I cleared Level ' + (lvl.idx + 1) + ' \u00b7 ' + L.name + ' ' + '\u2605'.repeat(lvl.stars) + '\u2606'.repeat(3 - lvl.stars) + ' in ' + r.darts + ' darts in Kudbee Darts. Can you beat it?'
      : L.name + ' beat me on Level ' + (lvl.idx + 1) + ' in Kudbee Darts. Can you take the leg?';
    const url = this._shareLink();
    this.shareText = txt + ' ' + url;
    const coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    try {
      if (navigator.share && coarse) navigator.share({ title: 'Kudbee Darts', text: txt, url: url }).catch(() => {});
      else {
        if (navigator.clipboard) navigator.clipboard.writeText(this.shareText).catch(() => {});
        this.toasts.push({ text: 'COPIED', sub: 'Paste it to a friend', life: 2.2 });
      }
    } catch (e) { /* no share sheet or clipboard */ }
  };

  Game.prototype._onMatchButton = function (id) {
    const lvl = this.matchResult.level;
    if (id === 'next') { this.levelIdx = lvl.next; this._startMatch(); }
    else if (id === 'retry') this._startMatch();
    else if (id === 'share') this._share();
    else if (id === 'levels') {
      this.mapWorld = KD.Campaign.LEVELS[this.levelIdx].world;
      this.state = 'levels';
    }
  };

  Game.prototype._toggleBoardTheme = function () {
    const next = this.board.themeName === 'pub' ? 'neon' : 'pub';
    this.board.setTheme(next);
    this.progression.data.settings.boardTheme = next;
    this.progression.save();
  };

  Game.prototype._updateMenu = function () {
    const p = this.input.pointer;
    if (!p.justDown) return;
    const btns = this._menuLayout();
    for (let i = 0; i < btns.length; i++) {
      const b = btns[i];
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
        this.audio.tick();
        if (b.group === 'mode') this.selMode = b.id.split(':')[1];
        else if (b.group === 'opp') this.selOpp = b.id.split(':')[1];
        else if (b.group === 'play') { this.levelIdx = null; this._startMatch(); }
        else if (b.group === 'camp') this._openLevels();
        else if (b.group === 'theme') this._toggleBoardTheme();
        else if (b.group === 'nav') {
          const dest = b.id.split(':')[1];
          this.state = dest;        // 'workshop' | 'missions' | 'leaderboard'
          if (dest === 'leaderboard' && this._openLeaderboard) this._openLeaderboard();
        }
        return;
      }
    }
  };

  // ---- Match setup -------------------------------------------------------
  Game.prototype._startMatch = function () {
    this.audio.setIntensity(0);
    const prog = this.progression;
    const human = new KD.Player('You', prog.data.skins.equipped);
    human.dartParts = { tip: prog.data.darts.tip, flight: prog.data.darts.flight, shape: prog.data.darts.shape };
    let opp;
    this.isLadder = false;
    this.ladderRank = prog.data.ladderRank;
    const level = this.levelIdx != null ? KD.Campaign.LEVELS[this.levelIdx] : null;

    if (level) {
      opp = new KD.AIPlayer(level.name, level.tier, level.skin);
      if (level.sigma) opp.sigma = level.sigma;
    } else if (this.selOpp === 'hotseat') {
      opp = new KD.Player('Guest', 'ember');
    } else if (this.selOpp === 'career') {
      const rung = KD.Progression.LADDER[prog.data.ladderRank];
      opp = new KD.AIPlayer(rung.name, rung.tier, rung.skin);
      this.isLadder = true;
    } else {
      opp = new KD.AIPlayer(this.selOpp + ' Bot', this.selOpp, 'violet');
    }
    // AIs throw themed darts too (neon tip + a flight chosen from their name).
    // AIs throw themed darts too; the barrel follows their tier.
    if (opp.isAI) opp.dartParts = { tip: 'neon', flight: 'shark', shape: { Rookie: 'straight', Pro: 'sharkcut', Legend: 'hex' }[opp.tierName] || 'bomb' };
    else opp.dartParts = { tip: 'steel', flight: 'standard' };
    // Upgraded parts steady your hand. League rivals (quick AI and the career
    // ladder) carry upgrades for your league; campaign rivals keep their tuned
    // accuracy. Pass-and-play earns no trophies, so nobody's darts are boosted.
    this.humanSteady = this.selOpp === 'hotseat' && !level ? 1 : prog.steadiness();
    if (opp.isAI && !level) opp.sigma *= KD.Progression.aiSteadiness(prog.leagueIdx());

    const modeKey = level ? level.mode : this.selMode;
    this.mode = modeKey === 'cricket' ? new KD.Mode_Cricket() : new KD.Mode_X01(modeKey === 'x301' ? 301 : 501);
    this.players = [human, opp];
    this.players.forEach((pl) => {
      this.mode.initPlayer(pl);
      pl.dartsThrown = 0; pl.totalScored = 0; pl.t180 = 0; pl.legs = 0;
      // Digital-scoreboard juice state.
      pl._scorePop = 0; pl._shed = []; pl._shedFired = false; pl._digX = null; pl._digY = 0; pl._digH = 0; pl._popCol = '#39e6ff';
      // Hot-streak badge: consecutive BIG hits (see _onDartLand) by this
      // player, across turns. Cosmetic only — no XP/coins/leaderboard impact.
      pl.hotStreak = 0;
    });
    this.current = 0;
    this.dartsThisTurn = 0;
    this.stuckDarts = [];
    this.bounceDarts = [];
    this.dart.reset();
    this.mode.beginTurn(this.players[0]);
    this.matchResult = null;
    this.banner = '';
    this.hitFlash = null;
    this.flickFb = null;
    this.state = 'play';
  };

  // ---- Play loop ---------------------------------------------------------
  Game.prototype._updatePlay = function (dt) {
    if (this.input.justPressed('pause')) { this.state = 'pause'; return; }
    const cur = this.players[this.current];
    const p = this.input.pointer;

    if (cur.isAI) {
      if (this.dart.state === 'ready') {
        const label = cur.chooseTarget(this.mode, this.players[1 - this.current], this.mode.dartsPerTurn - this.dartsThisTurn);
        const pt = this._aiClearShot(this.board.targetPoint(label), cur.thinkTime + KD.Dart.FLIGHT_T);
        this.dart.skin = cur.skin();
        this.dart.parts = cur.dartParts || null;
        // Pressure: weaker AIs choke on checkouts — open their grouping the closer
        // they get to zero, so comebacks happen and the opponent feels human.
        const rem = cur.scoreState && cur.scoreState.remaining;
        const dartsLeft = this.mode.dartsPerTurn - this.dartsThisTurn;
        const sigma = cur.sigma * cur.pressureFactor(rem, dartsLeft);
        this.dart.setAI(pt.x, pt.y, sigma);
        this.aiTimer = cur.thinkTime;
      } else if (this.dart.state === 'aiming') {
        this.aiTimer -= dt;
        if (this.aiTimer <= 0) this.dart.release();
      }
      return;
    }

    // Human — drag to aim, then SWIPE-RELEASE to throw (a tap won't throw).
    if (this.dart.state === 'ready') {
      if (p.justDown) { this.dart.skin = cur.skin(); this.dart.parts = cur.dartParts || null; this.dart.steady = this.current === 0 ? (this.humanSteady || 1) : 1; this.dart.beginAim(p.x, p.y); this.dart.sigma = this.humanSigma * this.dart.steady; }
    } else if (this.dart.state === 'aiming') {
      if (p.down) this.dart.updateAim(p.x, p.y, dt);
      if (p.justUp) {
        const r = this.dart.release();
        if (!r) this.dart.reset();      // rejected tap → back to ready, no throw
      }
    }
  };

  // Resolve a landed dart: score it, fire effects, advance the turn.
  Game.prototype._onDartLand = function () {
    const res = this.dart.result;
    const cur = this.players[this.current];
    const opp = this.players[1 - this.current];
    const lx = this.dart.landX, ly = this.dart.landY;

    const isMiss = res.ring === 'miss';
    if (isMiss) this.audio.clunk(); else this.audio.thud();
    if (res.blocked) this._say('BLOCKED!', 0.9, '#d79b5c');
    // Impact effects: splinters, glow flash, and shockwave.
    const skinCol = cur.skin().color;
    if (!isMiss) {
      if (!this.reduceMotion) this.particles.impact(lx, ly, skinCol);
      this.particles.shockwave(lx, ly, skinCol, 80, 0.35, 2);
    }
    // Stuck dart: lean derives from the actual throw trajectory (hand -> landing),
    // NOT a constant. A right flick sticks pointing right; down sticks pointing down.
    // _fromX/_fromY is the hand position set in dart._releaseAt(); tip points along
    // that travel direction, tilted slightly downward for a natural "embedded" read.
    // Embedded pose comes from the dart (nose-down, flights above the tip) — the same
    // angle the flight pitches into on approach, so there is no flip on contact.
    const lean = this.dart.embedAngle(lx, ly) + (Math.random() * 2 - 1) * 0.04;
    // A genuine miss doesn't stick — it clips off and tumbles away instead of
    // freezing in a scoring pose (see _spawnBounceDart). Purely cosmetic: the
    // score is 0 either way, this only changes how the whiff *reads*.
    if (res.blocked) {
      // Stuck in a THINK BOX crate: remember where the crate was, so the dart rides along with it.
      const box = KD.Campaign.LEVELS[this.levelIdx].boxes[res.crate];
      this.stuckDarts.push({ x: lx, y: ly, skin: cur.skin(), parts: cur.dartParts || null, ang: lean, landT: this.time,
        crate: res.crate, slide0: this._crateSlide(box, this.crateT) });
    } else if (isMiss) this._spawnBounceDart(lx, ly, cur, lean);
    else this.stuckDarts.push({ x: lx, y: ly, skin: cur.skin(), parts: cur.dartParts || null, ang: lean, landT: this.time });
    cur.dartsThrown++;

    const out = this.mode.applyDart(cur, res, opp);

    // Dart-grouping (muscle memory): a scoring human dart updates the turn's
    // cluster center so subsequent darts groove toward it. Stronger the more you
    // stack — landing T20 then T20 pulls the third in tight for a realistic 180.
    // Misses/busts break the groove (reset), just like a real broken rhythm.
    if (!cur.isAI && !isMiss && !out.bust && res.score > 0) {
      if (!this._groupCenter) this._groupCenter = { x: lx, y: ly };
      else { this._groupCenter.x = this._groupCenter.x * 0.6 + lx * 0.4; this._groupCenter.y = this._groupCenter.y * 0.6 + ly * 0.4; }
      this._groupStrength = Math.min(0.55, this._groupStrength + 0.18);
    }
    this.dartsThisTurn++;
    // Daily missions count your darts in matches against the AI.
    if (this.current === 0 && this._missionsOn && this._missionsOn()) this._mission('dart', res);

    // Floating score pop + scoring explosion (density scales with the score).
    // A one-dart Cricket close (0 -> 3 marks on a fresh number, e.g. a clean
    // treble-19) is just as rare and skillful as a treble-20 or bull in 501 —
    // give it the same "big hit" weight instead of only T20/bull ever popping.
    const big = (res.ring === 'treble' && res.value === 20) || res.ring === 'inbull' || out.win
      || (this.mode.id === 'cricket' && out.marksGained === 3);
    const burstCol = res.ring === 'treble' ? C.green
      : res.ring === 'double' ? C.gold
      : (res.ring === 'inbull' || res.ring === 'outbull') ? C.ember : skinCol;
    if (res.score > 0 || big) {
      this.particles.scoreBurst(lx, ly, burstCol, res.score, big);
      // Chunky "bricks" knocked off the segment — denser on the big hits.
      this.particles.bricks(lx, ly, burstCol, big ? 16 : Math.min(14, 6 + Math.round(res.score / 8)),
        { speed: big ? 300 : 220, size: big ? 9 : 7 });
      // Bullseye gets its own hot little flourish on top of the burst: a few
      // rising ember wisps, denser for the inner (50) than the outer (25).
      if ((res.ring === 'inbull' || res.ring === 'outbull') && !this.reduceMotion) {
        this.particles.smoke(lx, ly, C.ember, res.ring === 'inbull' ? 7 : 4);
      }
      // Flag the active scoreboard to pop + shed its own digital bricks.
      cur._scorePop = 1; cur._popCol = burstCol;
      // Light up the exact segment that was hit.
      this.hitFlash = { res: res, life: 1, col: burstCol };
    } else {
      // A genuine miss: a duller gray puff instead of colorful splinters —
      // the board didn't register a score, so the fx shouldn't look like it did.
      // A crate hit knocks wood splinters off the crate instead.
      if (res.blocked) this.particles.bricks(lx, ly, '#b9824a', 10, { speed: 220, size: 6 });
      else this.particles.dust(lx, ly);
    }
    // Haptic thump on phones that support it (denser for the big hits).
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(big ? [0, 16, 30, 22] : res.score > 0 ? 14 : 8); } catch (_) {}
    }
    this.camera.shake(big ? 0.22 : 0.12);
    // A crate hit already shouts BLOCKED!; no second "MISS" pop on top of it.
    if (!res.blocked) this.particles.scorePop(lx, ly - 6, out.text, big,
      res.ring === 'treble' ? C.green : res.ring === 'double' ? C.gold : null);

    // Hot-streak badge: consecutive BIG hits (see above) by the same thrower,
    // across turns. A bust reverts the whole turn, so it also breaks the
    // streak. Capped at 5 and purely cosmetic — no XP/coins/save-data impact.
    if (out.bust) {
      cur.hotStreak = 0;
    } else if (big) {
      const wasCapped = (cur.hotStreak || 0) >= 5;
      cur.hotStreak = Math.min((cur.hotStreak || 0) + 1, 5);
      if (cur.hotStreak >= 2 && !wasCapped) {
        this.toasts.push({ text: 'HOT STREAK', sub: cur.name + ' ×' + cur.hotStreak, life: 1.5 });
      }
    } else {
      cur.hotStreak = 0;
    }

    if (out.bust) {
      this.audio.bust(); this.audio.aww();
      this._say('BUST', 1.3, C.ember);
      this._endTurn();
      return;
    }
    if (big) {
      this.timeScale = 0.4;
      // Note: a checkout (out.win) punches its zoom via _matchWin below,
      // toward the winning dart itself — not here — since _matchWin fires
      // in the same tick and would otherwise immediately clobber whatever
      // target we set on this pass.
      if (!this.reduceMotion) this.camera.punchZoom(1.16, lx, ly);
      this.camera.shake(out.win ? 0.5 : 0.4);
      if (res.ring === 'inbull' || res.ring === 'outbull') this.audio.bull(res.ring === 'inbull'); else this.audio.chime(2);
    } else if (res.score > 0) {
      if (res.ring === 'treble') this.audio.treble();
      else this.audio.chime(res.value === 25 ? 1 : 0);
    }

    if (out.win) { this._matchWin(cur, lx, ly); return; }
    if (this.dartsThisTurn >= this.mode.dartsPerTurn) { this._endTurn(); return; }
    this.dart.reset();
  };

  // A genuine miss (landed beyond the double wire) doesn't stick — it kicks
  // outward off the surround and tumbles away, instead of freezing in the
  // same stuck-in-the-board pose a scoring dart gets. Purely cosmetic: the
  // score was already 0 either way (see _onDartLand); this only changes how
  // the whiff reads. Physics is simulated inline in _update (this.bounceDarts).
  Game.prototype._spawnBounceDart = function (x, y, player, ang) {
    const dx = x - this.board.cx, dy = y - this.board.cy;
    const dl = Math.sqrt(dx * dx + dy * dy) || 1;
    const kick = this.reduceMotion ? 0 : Util.rand(70, 150);
    const life = this.reduceMotion ? 0.28 : 0.65;
    this.bounceDarts.push({
      x: x, y: y,
      vx: (dx / dl) * kick * 0.5 + (this.reduceMotion ? 0 : Util.rand(-30, 30)),
      vy: this.reduceMotion ? 0 : -Util.rand(60, 120),
      rot: ang, spin: this.reduceMotion ? 0 : Util.rand(-10, 10),
      grav: 520,
      skin: player.skin(), parts: player.dartParts || null,
      life: life, maxLife: life,
    });
  };

  // Draws the tumbling "bounce out" darts spawned above; fades to nothing.
  Game.prototype._drawBounceDarts = function (ctx) {
    for (let i = 0; i < this.bounceDarts.length; i++) {
      const b = this.bounceDarts[i];
      const k = b.life / b.maxLife;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, k * 1.4));
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      this.sprites.drawDart(ctx, KD.Sprites.STUCK_LEN + 10, b.skin, 0, b.parts);
      ctx.restore();
    }
  };

  Game.prototype._endTurn = function () {
    const cur = this.players[this.current];
    // Announcer for the completed turn.
    if (this.mode.id === 'x01') {
      const ts = cur.scoreState.turnScore;
      if (ts === 180) {
        // The maximum — celebrate properly: gold rain + a double shockwave.
        cur.t180++;
        this._say('180!', 1.9);
        this.audio.oneEighty();
        this.particles.confetti(this.board.cx, this.board.cy - 30,
          ['#ffd34d', '#fff0bf', '#7CFFb2', '#39e6ff'], this.reduceMotion ? 24 : 80);
        this.particles.shockwave(this.board.cx, this.board.cy, C.gold, 250, 0.8, 5);
        this.particles.shockwave(this.board.cx, this.board.cy, '#ffffff', 160, 0.55, 3);
        this.camera.shake(0.5);
        // A 180 is a maximum-score turn, not a single dart, so it doesn't
        // get the per-dart punchZoom in _onDartLand — give it its own
        // camera push-in + a held slow-mo beat to match the moment.
        if (!this.reduceMotion) {
          this.camera.punchZoom(1.12, this.board.cx, this.board.cy - 20);
          this.timeScale = 0.55;
          this._slowmoHoldT = 0.35;
        }
      } else if (ts >= 100) { this._say(ts + '!', 1.3); this.audio.ton(); }
      if (ts >= 100 && this.current === 0 && this._missionsOn && this._missionsOn()) this._mission('ton', 1);
    } else {
      const ts = cur.scoreState.turnScore;
      if (ts >= 60) this._say('+' + ts, 1.2, C.green);
    }
    this.turnEndTimer = 1.5;
    this.banner = cur.name + (this.mode.id === 'x01' ? ' scored ' + cur.scoreState.turnScore : '');
    this.state = 'turnEnd';
  };

  Game.prototype._updateTurnEnd = function (dt) {
    this.turnEndTimer -= dt;
    const p = this.input.pointer;
    if (this.turnEndTimer <= 0 || p.justDown) this._nextTurn();
  };

  Game.prototype._nextTurn = function () {
    this.stuckDarts = [];
    this._groupCenter = null; this._groupStrength = 0;   // fresh groove each turn
    this.current = 1 - this.current;
    this.mode.beginTurn(this.players[this.current]);
    const ss = this.players[this.current].scoreState;
    this.audio.setIntensity(this.mode.id === 'x01' && ss && ss.remaining <= 170 && !this.players[this.current].isAI ? 1 : 0);
    this.dartsThisTurn = 0;
    this.dart.reset();
    this.banner = '';
    this.state = 'play';
  };

  // ---- Match over --------------------------------------------------------
  // `wx`/`wy` are the exact landing point of the winning dart (the checkout
  // double, the closing mark, ...) when known — the punch zooms toward THAT
  // shot rather than the board's geometric centre, then the normal focus/
  // zoom easing in Camera.update carries the view back over the next beat.
  Game.prototype._matchWin = function (winner, wx, wy) {
    this.state = 'matchOver';
    this.audio.setIntensity(0);
    this.timeScale = 0.5;
    if (!this.reduceMotion) {
      this.camera.punchZoom(1.16, wx != null ? wx : this.board.cx, wy != null ? wy : this.board.cy);
      this._slowmoHoldT = 0.35;
    }
    const cCount = this.reduceMotion ? 26 : 90;
    this.particles.confetti(this.board.cx, this.board.cy, null, cCount);
    // Side cannons for the winning moment.
    this.particles.confetti(this.board.cx - 260, this.board.cy - 110, null, Math.round(cCount * 0.6));
    this.particles.confetti(this.board.cx + 260, this.board.cy - 110, null, Math.round(cCount * 0.6));
    this.particles.shockwave(this.board.cx, this.board.cy, C.gold, 300, 0.9, 5);
    this.audio.cheer();

    const human = this.players[0];
    const won = winner === human;
    const result = {
      mode: this.mode.id,
      won: won,
      isLadder: this.isLadder,
      ladderRank: this.ladderRank,
      darts: human.dartsThrown,
      t180: human.t180,
      checkout: (won && this.mode.id === 'x01') ? winner.scoreState.turnStart : 0,
      marks: 0, points: this.mode.id === 'cricket' ? human.scoreState.points : 0,
    };
    if (this.mode.id === 'cricket') {
      let m = 0; KD.Mode_Cricket.NUMBERS.forEach((n) => { m += Math.min(3, human.scoreState.marks[n]); });
      result.marks = m;
    }
    // Darts Birds: stars for the leg, kept as the level's best.
    let lvl = null;
    if (this.levelIdx != null) {
      const L = KD.Campaign.LEVELS[this.levelIdx];
      const stars = won ? KD.Campaign.starsFor(L, human.dartsThrown) : 0;
      const prog = this.progression, LV = KD.Campaign.LEVELS;
      const sideShut = LV.map((l, j) => l.after === this.levelIdx && !prog.campaignUnlocked(j));
      const rec = prog.recordLevel(this.levelIdx, stars);
      LV.forEach((l, j) => {
        if (sideShut[j] && prog.campaignUnlocked(j)) {
          this.toasts.push({ text: KD.Campaign.WORLDS[l.world].name + ' OPEN!', sub: 'A new world on the level map', life: 3.2 });
        }
      });
      const next = KD.Campaign.nextOf(this.levelIdx);
      lvl = { idx: this.levelIdx, stars: stars, best: rec.best, won: won, par: L.par, boss: !!L.boss, next: won ? next : null };
    }
    const xp = this.progression.recordMatch(result);
    // League reward: trophies and a chest for any match against the AI. It is
    // banked now, so leaving early never loses it; the reward screen plays it back.
    let reward = null;
    if (this.levelIdx != null || this.selOpp !== 'hotseat') {
      const prog = this.progression;
      const trophies = prog.awardTrophies(won, lvl ? lvl.stars : 0);
      const chest = prog.rollChest(won);
      prog.applyChest(chest);
      reward = { trophies: trophies, chest: chest, matchCoins: won ? 15 : 0 };
      if (won && this._mission) {
        this._mission('win', 1);
        if (this.mode.id === 'x01') this._mission('checkout', 1);
        if (lvl && lvl.stars) this._mission('stars', lvl.stars);
      }
    }
    this.matchResult = {
      winner: winner.name, won: won, xp: xp,
      darts: human.dartsThrown, t180: human.t180,
      checkout: result.checkout, mode: this.mode.id,
      points: result.points, level: lvl, reward: reward, rewardSeen: !reward,
    };
    this.matchOverTimer = 0.8;

    // online leaderboard: post the match to the cloud SDK (degrades to local)
    this._lbPostMatch();
  };

  // ---- online leaderboard (kd-leaderboard.js SDK → Worker + D1) ----
  // Posts match results after each game. Demo mode works immediately (name prompt);
  // full online when the Worker is deployed and API_BASE is configured.
  Game.prototype._lbInit = function () {
    if (!window.KDLeaderboard) return;
    if (this._lb || this._lbIniting) return;
    this._lbIniting = true;
    var self = this;
    try {
      window.KDLeaderboard.create(window.KD_LB_CONFIG || {})
        .then(function (c) {
          self._lb = c;
          self._lbIniting = false;
          if (self._lbPostQueued) { self._lbPostQueued = false; self._lbPostMatch(); }
        })
        .catch(function () { self._lbIniting = false; self._lbPostQueued = false; });
    } catch (e) { this._lbIniting = false; }
  };
  Game.prototype._lbPostMatch = function () {
    if (!window.KDLeaderboard) return;
    if (!this._lb) { this._lbPostQueued = true; this._lbInit(); return; }
    var self = this, lb = this._lb;
    var d = this.progression.data;
    var x01 = d.stats.x01, cri = d.stats.cricket;
    var wins = x01.won + cri.won;
    var rating = 1180 + d.level * 38 + d.ladderRank * 150 + d.bestStreak * 22 + wins * 6;
    var submit = function () {
      var nm = (lb.user() && lb.user().name) || 'Player';
      lb.submit(nm, {
        rating: rating,
        bestCheckout: x01.bestCheckout || 0,
        total180s: x01.total180s || 0,
        wins: wins,
        bestStreak: d.bestStreak || 0,
        trophies: (d.league && d.league.trophies) || 0,
      }).catch(function () { /* cloud offline — local profile already saved */ });
    };
    if (!lb.isSignedIn()) {
      lb.signIn()
        .then(function () { if (lb.isSignedIn()) submit(); })
        .catch(function () {});
    } else submit();
  };

  Game.prototype._updateMatchOver = function (dt) {
    this.matchOverTimer -= dt;
    const p = this.input.pointer;
    if (this.matchOverTimer > 0) return;
    if (!this.matchResult.rewardSeen) { this._enterReward(); return; }
    if (this.matchResult.level) {
      // Campaign leg: the card's buttons decide where to go next.
      const btns = this._matchButtons();
      if (this.input.justPressed('confirm')) { this._onMatchButton(btns[0].id); return; }
      if (!p.justDown) return;
      for (let i = 0; i < btns.length; i++) {
        const b = btns[i];
        if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
          this.audio.tick();
          this._onMatchButton(b.id);
          return;
        }
      }
      return;
    }
    if (p.justDown || this.input.justPressed('confirm')) this.state = 'menu';
  };

  Game.prototype._pauseLayout = function () {
    const cx = this.viewW / 2;
    return [
      { id: 'resume', label: '▶  RESUME', x: cx - 130, y: VIEW_H / 2 - 4, w: 260, h: 58, group: 'play', sel: false },
      { id: 'quit', label: 'QUIT TO MENU', x: cx - 130, y: VIEW_H / 2 + 70, w: 260, h: 48, group: 'nav', sel: false },
    ];
  };

  Game.prototype._updatePause = function () {
    if (this.input.justPressed('pause') || this.input.justPressed('confirm')) { this.state = 'play'; return; }
    if (this.input.justPressed('back')) { this.state = 'menu'; return; }
    const p = this.input.pointer;
    if (p.justDown) {
      const btns = this._pauseLayout();
      for (let i = 0; i < btns.length; i++) {
        const b = btns[i];
        if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
          this.audio.tick();
          this.state = b.id === 'quit' ? 'menu' : 'play';
          return;
        }
      }
      this.state = 'play';   // tap anywhere else = resume
    }
  };

  // ====================================================================
  // RENDER
  // ====================================================================
  Game.prototype._render = function () {
    const ctx = this.ctx;
    // The page's own "← STUDIO" link only belongs on the menu; elsewhere it
    // would sit on top of the score cards and the map's BACK button.
    const backLink = document.querySelector('.back-link');
    if (backLink) backLink.style.display = this.state === 'menu' ? '' : 'none';
    ctx.clearRect(0, 0, this.viewW, VIEW_H);
    if (this.state === 'intro') { this._drawIntro(ctx); return; }

    // Backdrop: a campaign match plays in its world's scenery; otherwise the
    // Firefly image if provided, else the procedural neon stage.
    const st = this.state;
    if (this.levelIdx != null && (st === 'play' || st === 'turnEnd' || st === 'matchOver' || st === 'pause')) {
      this._drawWorldScene(ctx, KD.Campaign.WORLDS[KD.Campaign.LEVELS[this.levelIdx].world], this.viewW * 0.16, 262);
    } else if (this.sprites.has('bg.stage')) {
      const img = this.sprites.images['bg.stage'];
      ctx.drawImage(img, 0, 0, this.viewW, VIEW_H);
      ctx.fillStyle = 'rgba(4,6,14,0.45)';
      ctx.fillRect(0, 0, this.viewW, VIEW_H);
    } else {
      this.sprites.drawBackdrop(ctx, this.viewW, VIEW_H, this.time, this.board.themeName);
    }

    if (this.state === 'menu') { this._drawMenu(ctx); this._drawToasts(ctx); return; }
    if (this.state === 'levels') { this._drawLevels(ctx); this._drawToasts(ctx); return; }
    if (this.state === 'workshop') { this._drawWorkshop(ctx); this._drawToasts(ctx); return; }
    if (this.state === 'reward') { this._drawReward(ctx); this._drawToasts(ctx); return; }
    if (this.state === 'leaderboard') { this._drawLeaderboard(ctx); this._drawToasts(ctx); return; }
    if (this.state === 'missions') { this._drawMissions(ctx); this._drawToasts(ctx); return; }

    // World (board + darts + fx) under the camera transform. The board-lunge
    // scale is applied around the board centre so it "breathes" on each throw.
    ctx.save();
    this.camera.apply(ctx);
    if (this.boardScale !== 1) {
      ctx.translate(this.board.cx, this.board.cy);
      ctx.scale(this.boardScale, this.boardScale);
      ctx.translate(-this.board.cx, -this.board.cy);
    }
    this.board.draw(ctx);
    if (this.hitFlash) this.board.drawHitFlash(ctx, this.hitFlash.res, this.hitFlash.life, this.hitFlash.col);
    if (this.state === 'play') this._drawCheckoutGuide(ctx);
    // Darts in the board, then any THINK BOX crates in front of it, then the
    // darts stuck in those crates (riding along as a crate slides).
    const drawStuck = (d, ox, oy) => {
      const x = d.x + ox, y = d.y + oy;
      // A brief settle wobble right after impact — a quick decaying jiggle
      // so a fresh stick reads as landing WITH force, not teleporting in.
      let ang = d.ang;
      if (!this.reduceMotion && d.landT != null) {
        const el = this.time - d.landT;
        ang += Math.sin(el * 46) * Math.max(0, 0.14 - el * 0.6);
      }
      // Thunk: a fresh dart arrives slightly oversized and settles into the board.
      let thunk = 1;
      if (!this.reduceMotion && d.landT != null) thunk += 0.16 * Math.max(0, 1 - (this.time - d.landT) / 0.11);
      if (thunk !== 1) { ctx.save(); ctx.translate(x, y); ctx.scale(thunk, thunk); ctx.translate(-x, -y); }
      this.sprites.drawStuckDart(ctx, x, y, d.skin, ang, d.parts);
      if (thunk !== 1) ctx.restore();
    };
    for (let i = 0; i < this.stuckDarts.length; i++) {
      if (this.stuckDarts[i].crate == null) drawStuck(this.stuckDarts[i], 0, 0);
    }
    this._drawCrates(ctx);
    for (let i = 0; i < this.stuckDarts.length; i++) {
      const d = this.stuckDarts[i];
      if (d.crate != null) { const sh = this._crateShiftPx(d); drawStuck(d, sh.x, sh.y); }
    }
    this._drawBounceDarts(ctx);
    this.dart.drawFlight(ctx);
    this.dart.drawHeld(ctx);
    this.particles.draw(ctx);
    this.dart.drawReticle(ctx);
    ctx.restore();

    this._drawHUD(ctx);
    if (this.callout) this._drawCallout(ctx);
    if (this.state === 'turnEnd') this._drawBanner(ctx);
    if (this.state === 'matchOver') this._drawMatchOver(ctx);
    if (this.state === 'pause') this._drawPause(ctx);
    this._drawToasts(ctx);

    if (this.debug) {
      ctx.fillStyle = '#45586a'; ctx.font = '12px monospace'; ctx.textAlign = 'left';
      ctx.fillText('fps ' + this.loop.fps, 8, VIEW_H - 8);
    }
  };

  // ---- KUDBEE STUDIOS intro ---------------------------------------------
  // A short studio card before the menu: the hex mark, KUDBEE, STUDIOS
  // spelled out, then "presents KUDBEE DARTS". A tap, click or key skips it.
  const INTRO_DUR = 3.4;

  Game.prototype._updateIntro = function (dt) {
    this.introT += dt;
    const skip = this.input.pointer.justDown || this.input.justPressed('confirm') || this.input.justPressed('back');
    if (this.introT >= INTRO_DUR || (skip && this.introT > 0.25)) this.state = 'menu';
  };

  Game.prototype._drawIntro = function (ctx) {
    const t = this.introT, W = this.viewW, H = VIEW_H, cx = W / 2;
    const clamp01 = (v) => Math.max(0, Math.min(1, v));
    const ease = (v) => 1 - Math.pow(1 - clamp01(v), 3);
    const still = this.reduceMotion;

    // Deep night backdrop with a soft spotlight behind the mark.
    ctx.fillStyle = '#05070f';
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(cx, 300, 10, cx, 300, 420);
    glow.addColorStop(0, 'rgba(255,196,64,' + (0.22 * ease(t / 0.8)).toFixed(3) + ')');
    glow.addColorStop(1, 'rgba(5,7,15,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // The whole card fades out over the last half second.
    const out = clamp01((INTRO_DUR - t) / 0.5);
    ctx.save();
    ctx.globalAlpha = out;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    // Hex mark with a dart in its centre, popping in.
    const a1 = ease(t / 0.6);
    const sc = still ? 1 : 0.6 + 0.4 * a1 + Math.sin(clamp01(t / 0.6) * Math.PI) * 0.08;
    ctx.save();
    ctx.globalAlpha = out * a1;
    ctx.translate(cx, 200); ctx.scale(sc, sc);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const ang = Math.PI / 6 + i * Math.PI / 3;
      ctx[i ? 'lineTo' : 'moveTo'](Math.cos(ang) * 62, Math.sin(ang) * 62);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,196,64,0.12)'; ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = C.gold;
    ctx.shadowColor = C.gold; ctx.shadowBlur = 22; ctx.stroke(); ctx.shadowBlur = 0;
    // Bullseye rings and a dart stuck in the middle.
    ctx.lineWidth = 3;
    [34, 20].forEach((r, i) => { ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.strokeStyle = i ? C.cyan : 'rgba(255,255,255,0.8)'; ctx.stroke(); });
    ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fillStyle = '#ff4d6d'; ctx.fill();
    ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = '#e8eef8'; ctx.fillRect(4, -2.5, 42, 5);
    ctx.fillStyle = C.gold; ctx.beginPath(); ctx.moveTo(40, 0); ctx.lineTo(60, -13); ctx.lineTo(56, 0); ctx.lineTo(60, 13); ctx.closePath(); ctx.fill();
    ctx.restore();

    // KUDBEE, sliding up into place.
    const a2 = ease((t - 0.3) / 0.6);
    ctx.globalAlpha = out * a2;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = C.gold; ctx.shadowBlur = 26;
    ctx.font = 'bold 92px "Space Grotesk", sans-serif';
    ctx.fillText('KUDBEE', cx, 340 + (still ? 0 : (1 - a2) * 24));
    ctx.shadowBlur = 0;

    // S T U D I O S, one letter at a time.
    const word = 'STUDIOS', gap = 34;
    ctx.font = 'bold 30px "Space Grotesk", sans-serif';
    ctx.fillStyle = C.cyan;
    ctx.shadowColor = C.cyan; ctx.shadowBlur = 12;
    for (let i = 0; i < word.length; i++) {
      ctx.globalAlpha = out * ease((t - 0.75 - i * 0.07) / 0.3);
      ctx.fillText(word[i], cx + (i - (word.length - 1) / 2) * gap, 412);
    }
    ctx.shadowBlur = 0;

    // A gold rule, then "presents KUDBEE DARTS".
    const a3 = ease((t - 1.35) / 0.5);
    ctx.globalAlpha = out * a3;
    ctx.fillStyle = C.gold;
    ctx.fillRect(cx - 150 * a3, 448, 300 * a3, 2);
    ctx.fillStyle = C.dim;
    ctx.font = 'italic 18px "Space Grotesk", sans-serif';
    ctx.fillText('presents', cx, 482);
    const a4 = ease((t - 1.75) / 0.5);
    ctx.globalAlpha = out * a4;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = C.cyan; ctx.shadowBlur = 18;
    ctx.font = 'bold 44px "Space Grotesk", sans-serif';
    ctx.fillText('KUDBEE DARTS', cx, 530);
    ctx.shadowBlur = 0;

    // Skip hint.
    ctx.globalAlpha = out * 0.55 * clamp01((t - 0.6) / 0.4);
    ctx.fillStyle = C.dim;
    ctx.font = '13px "Space Grotesk", sans-serif';
    ctx.fillText('TAP TO SKIP', cx, H - 64);
    ctx.restore();
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  };

  // ---- Menu render -------------------------------------------------------
  Game.prototype._neonButton = function (ctx, b) {
    const r = 12;
    ctx.save();
    const accent = b.group === 'play' ? C.green : b.group === 'camp' ? C.gold : b.group === 'nav' ? C.violet : C.cyan;
    const locked = b.group === 'skin' && !b.owned;
    let col = b.sel ? accent : (b.group === 'nav' ? C.violet : 'rgba(180,210,255,0.25)');
    if (b.group === 'skin') col = (KD.Sprites.SKINS[b.id.split(':')[1]] || {}).color || C.cyan;
    ctx.globalAlpha = locked ? 0.3 : 1;

    ctx.fillStyle = b.sel ? 'rgba(57,230,255,0.14)' : 'rgba(10,16,32,0.55)';
    if (b.group === 'play') ctx.fillStyle = 'rgba(124,255,178,0.16)';
    if (b.group === 'nav') ctx.fillStyle = 'rgba(196,107,255,0.10)';
    this._roundRect(ctx, b.x, b.y, b.w, b.h, r);
    ctx.fill();
    ctx.lineWidth = b.sel ? 2.5 : (b.group === 'nav' ? 2 : 1.5);
    ctx.strokeStyle = col;
    if (b.sel || b.group === 'nav') { ctx.shadowColor = col; ctx.shadowBlur = b.group === 'nav' ? 8 : 14; }
    this._roundRect(ctx, b.x, b.y, b.w, b.h, r);
    ctx.stroke();
    ctx.shadowBlur = 0;

    if (b.group === 'skin') {
      // draw a mini dart preview
      ctx.save();
      ctx.translate(b.x + b.w / 2, b.y + b.h / 2 + 4);
      ctx.rotate(-Math.PI * 0.25);
      this.sprites.drawDart(ctx, 64, KD.Sprites.SKINS[b.id.split(':')[1]], 0);
      ctx.restore();
      if (locked) {
        ctx.fillStyle = '#cfe9ff'; ctx.font = '11px "Space Grotesk", sans-serif';
        ctx.textAlign = 'center'; ctx.fillText('🔒', b.x + b.w / 2, b.y + b.h - 8);
      }
    } else {
      ctx.fillStyle = b.sel ? '#ffffff' : C.text;
      ctx.font = (b.group === 'play' || b.group === 'camp' ? 'bold 22px' : 'bold 16px') + ' "Space Grotesk", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
    }
    ctx.restore();
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  };

  Game.prototype._drawMenu = function (ctx) {
    // Title.
    ctx.save();
    ctx.textAlign = 'center';
    ctx.shadowColor = C.cyan;
    ctx.shadowBlur = this.reduceMotion ? 24 : 22 + Math.sin(this.time * 1.8) * 9;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 64px "Space Grotesk", sans-serif';
    ctx.fillText('KUDBEE DARTS', this.viewW / 2, 110);
    ctx.shadowBlur = 0;
    ctx.fillStyle = C.violet;
    ctx.font = '15px "Space Grotesk", sans-serif';
    ctx.fillText('PREDICTIVE FLICK · 301 · 501 · CRICKET · CLIMB THE LEAGUE', this.viewW / 2, 140);

    // Section labels.
    ctx.fillStyle = C.dim; ctx.font = 'bold 12px "Space Grotesk", sans-serif';
    ctx.fillText('GAME MODE', this.viewW / 2, 182);
    ctx.fillText('OPPONENT', this.viewW / 2, 290);
    ctx.restore();

    const btns = this._menuLayout();
    btns.forEach((b) => this._neonButton(ctx, b));
    if (this._drawMenuLeague) this._drawMenuLeague(ctx);

    // Equipped-loadout mini preview beside the PLAY button.
    const d = this.progression.data;
    const skin = KD.Sprites.SKINS[d.skins.equipped];
    ctx.save();
    ctx.translate(this.viewW / 2 + 48, 524);
    ctx.rotate(-Math.PI * 0.07);
    this.sprites.drawDart(ctx, 112, skin, 0.4, d.darts);
    ctx.restore();
    ctx.save();
    ctx.textAlign = 'center'; ctx.fillStyle = C.dim;
    ctx.font = '11px "Space Grotesk", sans-serif';
    const tipN = (KD.Sprites.TIPS[d.darts.tip] || {}).name || d.darts.tip;
    const flN = (KD.Sprites.FLIGHTS[d.darts.flight] || {}).name || d.darts.flight;
    ctx.fillText(skin.name + ' · ' + tipN + ' · ' + flN, this.viewW / 2, 586);
    ctx.restore();

    // Stats footer.
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = C.text; ctx.font = '14px "Space Grotesk", sans-serif';
    const rung = KD.Progression.LADDER[d.ladderRank];
    ctx.fillText('LV ' + d.level + '   ·   Streak ' + d.streak + ' (best ' + d.bestStreak + ')   ·   Coins ' + d.coins + '   ·   Next rival: ' + rung.name + ' (' + rung.tier + ')', this.viewW / 2, 612);
    // XP bar.
    const bw = 320, bx = this.viewW / 2 - bw / 2, by = 626;
    ctx.fillStyle = 'rgba(180,210,255,0.15)'; this._roundRect(ctx, bx, by, bw, 8, 4); ctx.fill();
    ctx.fillStyle = C.cyan; const f = Math.max(0, Math.min(1, d.xp / d.xpToNext));
    this._roundRect(ctx, bx, by, bw * f, 8, 4); ctx.fill();
    ctx.fillStyle = C.dim; ctx.font = '11px monospace';
    ctx.fillText(d.xp + ' / ' + d.xpToNext + ' XP', this.viewW / 2, 652);
    ctx.fillStyle = C.dim; ctx.font = '12px "Space Grotesk", sans-serif';
    ctx.fillText('Drag to aim, then SWIPE-RELEASE to throw — the power band auto-tunes to your flick. The checkout guide lights up your finish.', this.viewW / 2, 686);
    ctx.restore();
    ctx.textAlign = 'left';
  };

  // ---- HUD ---------------------------------------------------------------
  Game.prototype._drawHUD = function (ctx) {
    if (this.mode.id === 'x01') this._drawHUDx01(ctx);
    else this._drawHUDcricket(ctx);
    // Dart pips for the current thrower.
    const cur = this.players[this.current];
    ctx.save();
    ctx.textAlign = 'center';
    for (let i = 0; i < this.mode.dartsPerTurn; i++) {
      const used = i < this.dartsThisTurn;
      ctx.fillStyle = used ? 'rgba(180,210,255,0.25)' : cur.skin().color;
      ctx.beginPath(); ctx.arc(this.viewW / 2 - 26 + i * 26, VIEW_H - 22, 6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = C.dim; ctx.font = '12px "Space Grotesk", sans-serif';
    ctx.fillText((cur.isAI ? cur.name + ' is throwing…' : 'DRAG TO AIM · FLICK TO THROW'), this.viewW / 2, VIEW_H - 40);
    ctx.restore();
    ctx.textAlign = 'left';
    if (this.flickFb) this._drawFlickFb(ctx);
  };

  // Brief swipe-coaching read-out after a throw (teaches the flick power band).
  Game.prototype._drawFlickFb = function (ctx) {
    const f = this.flickFb;
    const a = Math.min(1, f.life * 1.5);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.fillStyle = f.col; ctx.shadowColor = f.col; ctx.shadowBlur = 14;
    ctx.font = 'bold 22px "Space Grotesk", sans-serif';
    ctx.fillText(f.text, this.viewW / 2, VIEW_H - 66 - (1 - f.life) * 14);
    ctx.restore();
    ctx.globalAlpha = 1; ctx.textAlign = 'left';
  };

  // A polished scoreboard card (left or right). Returns nothing; draws name,
  // avatar chip, the big primary readout, leg pips and an active-turn glow. The
  // cards sit BELOW the Studio back-link so the score is never covered.
  Game.prototype._scoreCard = function (ctx, pl, side, active, big, sub) {
    const W = 256, H = 96, M = 16, TOP = 44;
    const x = side === 'left' ? M : this.viewW - M - W;
    const y = TOP;
    const col = pl.skin().color;
    ctx.save();
    // Card body + active glow.
    ctx.fillStyle = active ? 'rgba(57,230,255,0.10)' : 'rgba(8,12,26,0.66)';
    this._roundRect(ctx, x, y, W, H, 14); ctx.fill();
    ctx.lineWidth = active ? 2.5 : 1.2;
    ctx.strokeStyle = active ? col : 'rgba(180,210,255,0.18)';
    if (active) { ctx.shadowColor = col; ctx.shadowBlur = 16; }
    this._roundRect(ctx, x, y, W, H, 14); ctx.stroke();
    ctx.shadowBlur = 0;

    const avx = side === 'left' ? x + 30 : x + W - 30;
    const avy = y + 30;
    // Avatar chip.
    ctx.fillStyle = col; ctx.globalAlpha = active ? 1 : 0.8;
    ctx.beginPath(); ctx.arc(avx, avy, 17, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#05070f'; ctx.font = 'bold 18px "Space Grotesk", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(pl.name.charAt(0).toUpperCase(), avx, avy + 1);
    ctx.textBaseline = 'alphabetic';

    // Name + role/sub, anchored away from the avatar.
    const tx = side === 'left' ? x + 56 : x + W - 56;
    const tAlign = side === 'left' ? 'left' : 'right';
    ctx.textAlign = tAlign;
    ctx.fillStyle = active ? '#ffffff' : C.text;
    ctx.font = 'bold 17px "Space Grotesk", sans-serif';
    ctx.fillText(pl.name, tx, y + 24);
    ctx.fillStyle = C.dim; ctx.font = '11px "Space Grotesk", sans-serif';
    ctx.fillText(pl.isAI ? (pl.tierName || 'AI') + ' rival' : 'you', tx, y + 40);

    // Active turn arrow.
    if (active) {
      ctx.fillStyle = col;
      const ax = side === 'left' ? x + W - 16 : x + 16;
      const dir = side === 'left' ? -1 : 1;
      ctx.beginPath();
      ctx.moveTo(ax, y + 18); ctx.lineTo(ax + dir * 9, y + 24); ctx.lineTo(ax, y + 30);
      ctx.closePath(); ctx.fill();
    }
    // Hot-streak badge: nudged in from the avatar toward the card's centre
    // and dropped below the "you"/rival subtitle line so it never overlaps it.
    this._drawStreakBadge(ctx, pl.hotStreak, avx + 14 * (side === 'left' ? 1 : -1), avy + 24);

    // Big primary readout as a glowing seven-segment display. Each side gets
    // its own digital tint — left BLUE, right cool GREEN — and pops + sheds
    // little square "bricks" on every score.
    const digCol = side === 'left' ? C.cyan : C.green;
    const str = String(big);
    const dh = 44;
    const sc = 1 + (pl._scorePop || 0) * 0.14;
    const digW = str.length * (dh * 0.56 * sc + dh * 0.16 * sc);
    const rightX = side === 'left' ? x + W - 16 : x + 16 + digW;
    const topY = y + 40;
    ctx.save();
    ctx.globalAlpha = active ? 1 : 0.72;
    this._sevenSeg(ctx, rightX, topY, str, dh, digCol, sc);
    ctx.restore();
    // Remember the digit centre (HUD space) for the shed-brick spawn.
    pl._digX = rightX - digW / 2; pl._digY = topY + dh / 2; pl._digH = dh;
    this._drawShed(ctx, pl);
    if (sub) {
      ctx.textAlign = side === 'left' ? 'left' : 'right';
      ctx.fillStyle = C.green; ctx.font = '12px "Space Grotesk", monospace';
      ctx.fillText(sub, side === 'left' ? x + 16 : x + W - 16, y + 84);
    }

    // Leg pips.
    if (pl.legs) {
      ctx.fillStyle = C.gold;
      for (let i = 0; i < Math.min(pl.legs, 5); i++) {
        const px = (side === 'left' ? x + 56 : x + W - 56 - i * 12) + (side === 'left' ? i * 12 : 0);
        ctx.beginPath(); ctx.arc(px, y + 54, 3, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
    ctx.textAlign = 'left';
  };

  // Small "hot streak" chip — consecutive BIG hits (T20/bull, or a one-dart
  // Cricket close) by this player, across turns. Pure HUD flair: it never
  // touches scoring, XP, coins, or the saved profile the leaderboard reads.
  // (bx, by) is the badge's own centre — callers place it wherever the card
  // layout has room, so it never clips a card edge or another element.
  Game.prototype._drawStreakBadge = function (ctx, n, bx, by) {
    if (!n || n < 2) return;
    const col = n >= 5 ? C.ember : n >= 4 ? C.gold : C.cyan;
    const w = 32, h = 16;
    ctx.save();
    ctx.fillStyle = 'rgba(5,8,16,0.85)';
    this._roundRect(ctx, bx - w / 2, by - h / 2, w, h, 8); ctx.fill();
    ctx.lineWidth = 1.3; ctx.strokeStyle = col;
    ctx.shadowColor = col; ctx.shadowBlur = 8;
    this._roundRect(ctx, bx - w / 2, by - h / 2, w, h, 8); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = col; ctx.font = 'bold 11px "Space Grotesk", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🔥' + n, bx, by + 1);
    ctx.restore();
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  };

  Game.prototype._drawHUDx01 = function (ctx) {
    const p1 = this.players[0], p2 = this.players[1];
    const cur = this.players[this.current];
    // Checkout hint shown as the active player's card sub-line.
    let sub1 = '', sub2 = '';
    if (!cur.isAI) {
      const hint = this.mode.checkoutHint(cur, this.mode.dartsPerTurn - this.dartsThisTurn);
      if (hint) { if (this.current === 0) sub1 = '◎ ' + hint; else sub2 = '◎ ' + hint; }
    }
    this._scoreCard(ctx, p1, 'left', this.current === 0, this.mode.summary(p1), sub1);
    this._scoreCard(ctx, p2, 'right', this.current === 1, this.mode.summary(p2), sub2);
  };

  // One player's full Cricket scoreboard, living in the wide empty side column
  // (left or right of the board) so it reads like a real multiplayer match.
  Game.prototype._cricketColumn = function (ctx, pl, side, active, oppMarks) {
    const nums = KD.Mode_Cricket.NUMBERS;
    const PW = 200, M = 12, rowH = 30;
    const PH = 92 + nums.length * rowH + 14;
    const x = side === 'left' ? M : this.viewW - M - PW;
    const y = 46;
    const col = pl.skin().color;
    ctx.save();
    // Panel.
    ctx.fillStyle = active ? 'rgba(57,230,255,0.09)' : 'rgba(8,12,26,0.66)';
    this._roundRect(ctx, x, y, PW, PH, 14); ctx.fill();
    ctx.lineWidth = active ? 2.5 : 1.2;
    ctx.strokeStyle = active ? col : 'rgba(180,210,255,0.18)';
    if (active) { ctx.shadowColor = col; ctx.shadowBlur = 16; }
    this._roundRect(ctx, x, y, PW, PH, 14); ctx.stroke();
    ctx.shadowBlur = 0;

    // Header: avatar + name + role.
    const avx = x + 28, avy = y + 28;
    ctx.fillStyle = col; ctx.globalAlpha = active ? 1 : 0.8;
    ctx.beginPath(); ctx.arc(avx, avy, 16, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#05070f'; ctx.font = 'bold 17px "Space Grotesk", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(pl.name.charAt(0).toUpperCase(), avx, avy + 1);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = active ? '#fff' : C.text; ctx.font = 'bold 16px "Space Grotesk", sans-serif';
    ctx.fillText(pl.name, x + 52, y + 24);
    ctx.fillStyle = C.dim; ctx.font = '10px "Space Grotesk", sans-serif';
    ctx.fillText(pl.isAI ? (pl.tierName || 'AI') + ' rival' : 'you', x + 52, y + 38);
    // Hot-streak badge, tucked in the panel's top-right — clear of the
    // left-aligned name/avatar and (with an 8px margin) of the active-turn
    // chevron, which only occupies the very edge at x+PW-16.
    this._drawStreakBadge(ctx, pl.hotStreak, x + PW - 40, y + 22);
    if (active) {
      ctx.fillStyle = col; ctx.beginPath();
      ctx.moveTo(x + PW - 16, y + 16); ctx.lineTo(x + PW - 8, y + 22); ctx.lineTo(x + PW - 16, y + 28);
      ctx.closePath(); ctx.fill();
    }

    // Big points.
    ctx.textAlign = 'right'; ctx.fillStyle = active ? col : C.text;
    if (active) { ctx.shadowColor = col; ctx.shadowBlur = 12; }
    ctx.font = 'bold 30px "Space Grotesk", sans-serif';
    ctx.fillText(pl.scoreState.points + '', x + PW - 14, y + 70);
    ctx.shadowBlur = 0;
    ctx.textAlign = 'left'; ctx.fillStyle = C.dim; ctx.font = '11px "Space Grotesk", sans-serif';
    ctx.fillText('POINTS', x + 16, y + 66);

    // Divider.
    ctx.strokeStyle = 'rgba(180,210,255,0.14)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 14, y + 84); ctx.lineTo(x + PW - 14, y + 84); ctx.stroke();

    // Marks ledger: number label + this player's marks, with a "scoring" tint
    // when they've closed it but the opponent hasn't (so extra hits score).
    const top = y + 104;
    for (let i = 0; i < nums.length; i++) {
      const n = nums[i];
      const ry = top + i * rowH;
      const c = pl.scoreState.marks[n];
      const scoring = c >= 3 && oppMarks[n] < 3;
      ctx.textAlign = 'left';
      ctx.font = 'bold 15px "Space Grotesk", monospace';
      ctx.fillStyle = c >= 3 ? (scoring ? C.green : 'rgba(125,140,170,0.55)') : C.text;
      ctx.fillText(n === 25 ? 'BULL' : '' + n, x + 18, ry);
      ctx.textAlign = 'right';
      ctx.font = 'bold 18px "Space Grotesk", monospace';
      ctx.fillStyle = c >= 3 ? (scoring ? C.green : 'rgba(125,140,170,0.55)') : col;
      ctx.fillText(this._marks(c), x + PW - 18, ry);
    }
    ctx.restore();
    ctx.textAlign = 'left';
  };

  Game.prototype._drawHUDcricket = function (ctx) {
    const p1 = this.players[0], p2 = this.players[1];
    this._cricketColumn(ctx, p1, 'left', this.current === 0, p2.scoreState.marks);
    this._cricketColumn(ctx, p2, 'right', this.current === 1, p1.scoreState.marks);
  };

  Game.prototype._marks = function (m) {
    return m >= 3 ? '⊗' : m === 2 ? '✕' : m === 1 ? '╱' : '·';
  };

  // ---- On-board checkout guide ------------------------------------------
  // When the human is on a finish (≤170 with a route in the darts remaining),
  // light up exactly what to hit — the next dart brightest. Doubles as a
  // built-in training aid, and is unmissable on the final dart of a checkout.
  Game.prototype._drawCheckoutGuide = function (ctx) {
    if (!this.mode || this.mode.id !== 'x01' || !KD.Mode_X01.checkoutRoute) return;
    const cur = this.players[this.current];
    if (!cur || cur.isAI || this.dart.state === 'flying') return;
    const left = this.mode.dartsPerTurn - this.dartsThisTurn;
    const route = KD.Mode_X01.checkoutRoute(cur.scoreState.remaining, left);
    if (!route) return;
    const t = this.time;
    const pts = route.map((lbl) => ({ lbl: lbl, p: this.board.targetPoint(lbl) }));

    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // Dashed route line in throw order.
    if (pts.length > 1) {
      ctx.setLineDash([6, 9]); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(124,255,178,0.35)';
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) { const q = pts[i].p; i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }
      ctx.stroke(); ctx.setLineDash([]);
    }
    for (let i = 0; i < pts.length; i++) {
      const q = pts[i].p, isNext = i === 0;
      const col = isNext ? '#7CFFb2' : '#c46bff';
      const pulse = isNext ? 0.55 + 0.45 * Math.sin(t * 7) : 0.7;
      const rad = isNext ? 21 : 15;
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = col; ctx.lineWidth = isNext ? 3 : 2;
      ctx.shadowColor = col; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(q.x, q.y, rad, 0, Math.PI * 2); ctx.stroke();
      if (isNext) {
        const ir = rad * (0.45 + 0.25 * (1 + Math.sin(t * 7)));
        ctx.globalAlpha = pulse * 0.6;
        ctx.beginPath(); ctx.arc(q.x, q.y, ir, 0, Math.PI * 2); ctx.stroke();
      }
      // Label badge sitting just outside the marker, toward the rim.
      const odx = q.x - this.board.cx, ody = q.y - this.board.cy;
      const ol = Math.sqrt(odx * odx + ody * ody) || 1;
      const bx = q.x + (odx / ol) * (rad + 16), by = q.y + (ody / ol) * (rad + 16);
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      const lbl = (pts.length > 1 ? (i + 1) + '· ' : '') + pts[i].lbl;
      ctx.font = 'bold 14px "Space Grotesk", sans-serif';
      const tw = ctx.measureText(lbl).width + 12;
      ctx.fillStyle = 'rgba(5,8,16,0.82)';
      this._roundRect(ctx, bx - tw / 2, by - 11, tw, 22, 7); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.9;
      this._roundRect(ctx, bx - tw / 2, by - 11, tw, 22, 7); ctx.stroke();
      ctx.globalAlpha = 1; ctx.fillStyle = isNext ? '#eafff4' : '#f0e2ff';
      ctx.fillText(lbl, bx, by + 1);
    }
    // "CHECKOUT" tag at the top of the board on the final dart of a 1-dart finish.
    if (left === 1 && pts.length === 1) {
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 7);
      ctx.fillStyle = '#7CFFb2'; ctx.shadowColor = '#7CFFb2'; ctx.shadowBlur = 14;
      ctx.font = 'bold 16px "Space Grotesk", sans-serif';
      ctx.fillText('CHECKOUT — HIT ' + pts[0].lbl, this.board.cx, this.board.cy - this.board.Rpx - 6);
    }
    ctx.restore();
    ctx.globalAlpha = 1; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  };

  // ---- Overlays ----------------------------------------------------------
  Game.prototype._drawCallout = function (ctx) {
    const c = this.callout;
    const a = Math.min(1, c.life * 1.4);
    const col = c.col || C.gold;
    // Pop-in: a quick scale overshoot as the callout is born, easing to 1.
    const born = (c.max || 1.3) - c.life;
    const s = this.reduceMotion ? 1 : 1 + Math.max(0, 0.35 - born * 2.8);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(this.viewW / 2, VIEW_H * 0.5);
    ctx.scale(s, s);
    ctx.textAlign = 'center';
    ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 26;
    ctx.font = 'bold 72px "Space Grotesk", sans-serif';
    ctx.fillText(c.text, 0, 0);
    ctx.restore();
    ctx.textAlign = 'left';
  };

  Game.prototype._drawBanner = function (ctx) {
    // Neon-carded turn banner, tinted to whoever just threw.
    const col = this.players[this.current] ? this.players[this.current].skin().color : C.cyan;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(5,6,15,0.78)';
    this._roundRect(ctx, this.viewW / 2 - 220, VIEW_H - 150, 440, 56, 12); ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = col;
    ctx.shadowColor = col; ctx.shadowBlur = 12; ctx.globalAlpha = 0.9;
    this._roundRect(ctx, this.viewW / 2 - 220, VIEW_H - 150, 440, 56, 12); ctx.stroke();
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff'; ctx.font = 'bold 18px "Space Grotesk", sans-serif';
    ctx.fillText(this.banner, this.viewW / 2, VIEW_H - 122);
    ctx.fillStyle = C.dim; ctx.font = '12px "Space Grotesk", sans-serif';
    ctx.fillText('tap to continue', this.viewW / 2, VIEW_H - 104);
    ctx.restore();
    ctx.textAlign = 'left';
  };

  Game.prototype._drawMatchOver = function (ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(4,6,14,0.78)';
    ctx.fillRect(0, 0, this.viewW, VIEW_H);
    ctx.textAlign = 'center';
    const r = this.matchResult;
    if (r.level) { this._drawLevelResult(ctx, r); ctx.restore(); return; }
    ctx.fillStyle = r.won ? C.green : C.ember;
    ctx.shadowColor = r.won ? C.green : C.ember; ctx.shadowBlur = 26;
    ctx.font = 'bold 72px "Space Grotesk", sans-serif';
    ctx.fillText(r.won ? 'YOU WIN!' : 'DEFEAT', this.viewW / 2, VIEW_H / 2 - 30);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff'; ctx.font = '22px "Space Grotesk", sans-serif';
    ctx.fillText(r.winner + ' takes the leg', this.viewW / 2, VIEW_H / 2 + 14);
    ctx.fillStyle = C.gold; ctx.font = 'bold 20px "Space Grotesk", sans-serif';
    ctx.fillText('+' + r.xp + ' XP', this.viewW / 2, VIEW_H / 2 + 52);
    // Your match line: darts thrown, plus the highlights that matter.
    const bits = [r.darts + ' darts'];
    if (r.t180 > 0) bits.push(r.t180 + '× 180');
    if (r.won && r.mode === 'x01' && r.checkout) bits.push(r.checkout + ' checkout');
    if (r.mode === 'cricket' && r.points) bits.push(r.points + ' pts');
    ctx.fillStyle = C.dim; ctx.font = '14px "Space Grotesk", sans-serif';
    ctx.fillText(bits.join('  ·  '), this.viewW / 2, VIEW_H / 2 + 80);
    if (this.matchOverTimer <= 0) {
      ctx.fillStyle = C.dim; ctx.font = '14px "Space Grotesk", sans-serif';
      ctx.fillText('tap to return to the menu', this.viewW / 2, VIEW_H / 2 + 116);
    }
    ctx.restore();
    ctx.textAlign = 'left';
  };

  // ---- Darts Birds campaign: level map render ----------------------------
  const OUTLINE = '#0a0618';
  const SKY = {
    dawn:  ['#120a33', '#3b1d6e', '#a2457e', '#ffb48a'],
    noon:  ['#06203a', '#0f4f6e', '#2c8f9a', '#bff3e0'],
    night: ['#030210', '#0d0a2e', '#2b1657', '#7d5bd0'],
    box:   ['#1b0d22', '#5a2340', '#c2553f', '#ffc078'],
    halloween: ['#0d0618', '#2e1245', '#7a2a3a', '#ff8a2b'],
    nightmare: ['#030104', '#14040c', '#3a0814', '#7a0f1e'],
  };
  const HILLS = {
    dawn:  ['#2a1450', '#1d0d3a', '#120828'],
    noon:  ['#0c3550', '#082638', '#051a28'],
    night: ['#1a1044', '#110a33', '#08051f'],
    box:   ['#3a1d2a', '#2a1420', '#1a0c16'],
    halloween: ['#24123a', '#170b28', '#0c0616'],
    nightmare: ['#1a0a12', '#10050b', '#070205'],
  };
  const STARS_AT = [[70, 80], [190, 150], [330, 60], [520, 118], [640, 52], [880, 190], [260, 210], [600, 200], [930, 60], [430, 40]];

  // A world's cartoon scenery: sky, twinkling stars, a sun or moon with
  // turning rays, drifting clouds, outlined hills and the world's prop. The
  // level map and the campaign's own matches both paint it.
  Game.prototype._drawWorldScene = function (ctx, world, sunX, sy) {
    const sky = SKY[world.sky], hills = HILLS[world.sky], t = this.time;
    ctx.save();
    // Night sky with a bold bottom-to-top gradient.
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, sky[0]); g.addColorStop(0.55, sky[1]); g.addColorStop(0.85, sky[2]); g.addColorStop(1, sky[3]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, this.viewW, VIEW_H);
    // Twinkling stars.
    STARS_AT.forEach((s, i) => {
      const a = 0.45 + 0.35 * Math.sin(t * 2 + i * 1.7);
      ctx.globalAlpha = a; ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(s[0] * this.viewW / 960, s[1], 2 + (i % 3) * 0.6, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;
    // Sun / moon with slowly turning rays, outlined like a cartoon.
    const sunY = sy, sunCol = world.sky === 'night' ? '#eef3ff' : world.sky === 'dawn' ? '#ffd34d' : world.sky === 'box' ? '#ffb347' : world.sky === 'halloween' ? '#ff9a3c' : world.sky === 'nightmare' ? '#d4233a' : '#fff2b3';
    const eerie = world.sky === 'halloween' || world.sky === 'nightmare';
    if (eerie) {
      // A haunted moon: a soft pulsing halo instead of rays.
      const halo = ctx.createRadialGradient(sunX, sunY, 40, sunX, sunY, 150);
      halo.addColorStop(0, sunCol); halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.35 + 0.1 * Math.sin(t * 1.5);
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(sunX, sunY, 150, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.save(); ctx.translate(sunX, sunY); ctx.rotate(t * 0.12);
      ctx.fillStyle = sunCol; ctx.globalAlpha = 0.16;
      for (let k = 0; k < 12; k++) {
        ctx.rotate(Math.PI / 6);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-22, 150); ctx.lineTo(22, 150); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(sunX, sunY, 54, 0, Math.PI * 2);
    ctx.fillStyle = sunCol; ctx.fill();
    if (eerie) {            // craters
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      [[-18, -14, 11], [16, 8, 14], [-6, 22, 7], [22, -22, 6]].forEach((c) => { ctx.beginPath(); ctx.arc(sunX + c[0], sunY + c[1], c[2], 0, Math.PI * 2); ctx.fill(); });
    }
    ctx.lineWidth = 6; ctx.strokeStyle = OUTLINE;
    ctx.beginPath(); ctx.arc(sunX, sunY, 54, 0, Math.PI * 2); ctx.stroke();
    // Puffy clouds drifting across.
    const drift = (base, s, speed) => ((base + t * speed) % (this.viewW + 260)) - 130;
    const spooky = world.sky === 'halloween' || world.sky === 'nightmare';
    const cloudCol = spooky ? 'rgba(52,36,70,0.9)' : null;
    this._cloud(ctx, drift(0, 1, 14), 206, 0.7, cloudCol);
    this._cloud(ctx, drift(420, 1, 9), 470, 0.8, cloudCol);
    this._cloud(ctx, drift(700, 1, 18), 236, 0.5, cloudCol);
    if (spooky) {
      // Bats flitting across the sky (the moon backlights them).
      for (let i = 0; i < 4; i++) {
        const bx = ((i * 330 + t * (40 + i * 12)) % (this.viewW + 120)) - 60;
        const by = 90 + i * 45 + Math.sin(t * 2 + i * 2) * 18;
        this._bat(ctx, bx, by, 46 - i * 5, 22 - i * 2);
      }
    }
    // Layered hills, outlined.
    [[500, 0], [560, 1], [620, 2]].forEach(([base, li]) => {
      ctx.beginPath(); ctx.moveTo(0, VIEW_H);
      for (let x = 0; x <= this.viewW + 60; x += 60) {
        const y = base - 26 * Math.sin(x * 0.011 + li * 2.1) - 14 * Math.sin(x * 0.027 + li);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(this.viewW, VIEW_H); ctx.closePath();
      ctx.fillStyle = hills[li]; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = OUTLINE; ctx.stroke();
    });
    this._worldProp(ctx, world.sky, this.viewW - 118, 500);
    if (world.sky === 'nightmare') {
      // Low drifting fog, and eyes blinking in the dark hills.
      for (let i = 0; i < 5; i++) {
        const fx = ((i * 260 + t * 22) % (this.viewW + 400)) - 200;
        ctx.fillStyle = 'rgba(190,170,200,0.10)';
        ctx.beginPath(); ctx.ellipse(fx, 640 + (i % 2) * 30, 220, 36, 0, 0, Math.PI * 2); ctx.fill();
      }
      for (let i = 0; i < 4; i++) {
        if (Math.sin(t * 1.3 + i * 2.7) > 0.85) continue;          // a blink
        const ex = this.viewW * (0.12 + i * 0.24), ey = 600 + (i % 2) * 34;
        ctx.fillStyle = '#ff2a3a';
        ctx.beginPath(); ctx.ellipse(ex, ey, 6, 3, 0, 0, Math.PI * 2); ctx.ellipse(ex + 18, ey, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  };

  Game.prototype._drawLevels = function (ctx) {
    const world = KD.Campaign.WORLDS[this.mapWorld];
    const t = this.time, cx = this.viewW / 2;
    ctx.save();
    this._drawWorldScene(ctx, world, this.viewW - 150, 118);
    // Header.
    ctx.textAlign = 'center';
    ctx.shadowColor = '#c46bff'; ctx.shadowBlur = 22;
    ctx.fillStyle = '#fff'; ctx.font = 'bold 44px "Space Grotesk", sans-serif';
    ctx.fillText('DARTS BIRDS', cx, 84);
    ctx.shadowBlur = 0;
    ctx.fillStyle = C.gold; ctx.font = 'bold 20px "Space Grotesk", sans-serif';
    ctx.fillText('WORLD ' + (this.mapWorld + 1) + '  ·  ' + world.name, cx, 124);
    ctx.fillStyle = C.dim; ctx.font = '14px "Space Grotesk", sans-serif';
    ctx.fillText(world.sub, cx, 146);
    // Tiles.
    const prog = this.progression;
    const btns = this._levelsLayout();
    let current = -1;
    for (let i = 0; i < KD.Campaign.LEVELS.length; i++) {
      if (prog.campaignUnlocked(i) && prog.campaignStars(i) === 0) { current = i; break; }
    }
    btns.forEach((b) => {
      if (b.group !== 'level') return;
      const L = KD.Campaign.LEVELS[b.idx];
      const open = prog.campaignUnlocked(b.idx), stars = prog.campaignStars(b.idx);
      const bob = b.idx === current ? Math.sin(t * 3.2) * 5 : 0;
      this._tile(ctx, b, L, b.idx, open, stars, bob);
    });
    // Stars for this world and the page dots.
    const range = KD.Campaign.worldRange(this.mapWorld);
    let got = 0;
    for (let k = 0; k < range.count; k++) got += prog.campaignStars(range.first + k);
    ctx.fillStyle = 'rgba(10,6,24,0.7)';
    this._roundRect(ctx, cx - 110, 462, 220, 34, 17); ctx.fill();
    ctx.fillStyle = C.gold; ctx.font = 'bold 16px "Space Grotesk", sans-serif';
    ctx.fillText('STARS  ' + got + ' / ' + range.count * 3, cx, 485);
    KD.Campaign.WORLDS.forEach((_, w) => {
      ctx.beginPath(); ctx.arc(cx - 24 + w * 24, 522, w === this.mapWorld ? 7 : 5, 0, Math.PI * 2);
      ctx.fillStyle = w === this.mapWorld ? C.gold : 'rgba(255,255,255,0.35)'; ctx.fill();
    });
    // Back and page arrows.
    ctx.textAlign = 'left';
    btns.forEach((b) => {
      if (b.group === 'nav') {
        ctx.fillStyle = 'rgba(10,6,24,0.75)'; this._roundRect(ctx, b.x, b.y, b.w, b.h, 12); ctx.fill();
        ctx.strokeStyle = C.violet; ctx.lineWidth = 2; this._roundRect(ctx, b.x, b.y, b.w, b.h, 12); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 17px "Space Grotesk", sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('‹  BACK', b.x + b.w / 2, b.y + 29); ctx.textAlign = 'left';
      } else if (b.group === 'page') {
        const dis = (b.id === 'prev' && this.mapWorld === 0) || (b.id === 'next' && this.mapWorld === KD.Campaign.WORLDS.length - 1);
        ctx.globalAlpha = dis ? 0.25 : 1;
        ctx.fillStyle = 'rgba(10,6,24,0.7)'; ctx.beginPath(); ctx.arc(b.x + b.w / 2, b.y + b.h / 2, 26, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = C.cyan; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 30px "Space Grotesk", sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(b.id === 'prev' ? '‹' : '›', b.x + b.w / 2, b.y + b.h / 2 + 10);
        ctx.globalAlpha = 1; ctx.textAlign = 'left';
      }
    });
    ctx.restore();
  };

  // ---- THINK BOX crates ---------------------------------------------------
  // A crate's side-to-side offset (board radii) at crate-clock time t.
  Game.prototype._crateSlide = function (b, t) {
    return b.slide ? b.slide.amp * Math.sin(t * b.slide.w + (b.slide.p || 0)) : 0;
  };

  // The level's crates in board-face metres (x right, y down from the bull),
  // where they will stand tAhead seconds from now; null when there are none.
  Game.prototype.crateRects = function (tAhead) {
    const L = this.levelIdx != null ? KD.Campaign.LEVELS[this.levelIdx] : null;
    if (!L || !L.boxes) return null;
    const M = KD.Dart.BOARD_M, t = this.crateT + (tAhead || 0);
    return L.boxes.map((b, i) => {
      const o = this._crateOffset(b, t);
      return { x0: (b.x + o.x) * M, x1: (b.x + o.x + b.w) * M, y0: (b.y + o.y) * M, y1: (b.y + o.y + b.h) * M, crate: i };
    });
  };

  // The slide as an {x, y} offset (board radii): along x unless slide.axis is 'y'.
  Game.prototype._crateOffset = function (b, t) {
    const o = this._crateSlide(b, t);
    return b.slide && b.slide.axis === 'y' ? { x: 0, y: o } : { x: o, y: 0 };
  };

  // How far (px, {x, y}) a dart stuck in a sliding box has moved since it landed.
  Game.prototype._crateShiftPx = function (d) {
    const L = KD.Campaign.LEVELS[this.levelIdx], b = L && L.boxes && L.boxes[d.crate];
    if (!b) return { x: 0, y: 0 };
    const k = (this._crateSlide(b, this.crateT) - d.slide0) * this.board.Rpx * KD.Dart.depthScale(KD.Dart.CRATE_Z);
    return b.slide && b.slide.axis === 'y' ? { x: 0, y: k } : { x: k, y: 0 };
  };

  // Is the board point (px) behind a crate tAhead seconds from now?
  Game.prototype._behindCrate = function (x, y, tAhead) {
    const cr = this.crateRects(tAhead);
    if (!cr) return false;
    const M = KD.Dart.BOARD_M / this.board.Rpx, pad = 0.012;   // a little margin off the crate edges
    const X = (x - this.board.cx) * M, Y = (y - this.board.cy) * M;
    return cr.some((c) => X > c.x0 - pad && X < c.x1 + pad && Y > c.y0 - pad && Y < c.y1 + pad);
  };

  // An AI whose target sits behind a crate (when its dart would get there)
  // takes the first clear bed from a list of good scoring spots instead.
  const DODGE = ['T20', 'T19', 'T18', 'T17', 'T16', 'BULL', 'T15', 'T14', '20', '19', '18', '17', '16', '15', '14', '25', '13', '12', '11'];
  Game.prototype._aiClearShot = function (pt, tAhead) {
    if (!this._behindCrate(pt.x, pt.y, tAhead)) return pt;
    for (let i = 0; i < DODGE.length; i++) {
      const p = this.board.targetPoint(DODGE[i]);
      if (!this._behindCrate(p.x, p.y, tAhead)) return p;
    }
    return pt;
  };

  Game.prototype._drawCrates = function (ctx) {
    const L = this.levelIdx != null ? KD.Campaign.LEVELS[this.levelIdx] : null;
    if (!L || !L.boxes) return;
    const B = this.board, R = B.Rpx * KD.Dart.depthScale(KD.Dart.CRATE_Z);
    L.boxes.forEach((b) => {
      const o = this._crateOffset(b, this.crateT);
      this._obstacle(ctx, b.kind || 'crate', B.cx + (b.x + o.x) * R, B.cy + (b.y + o.y) * R, b.w * R, b.h * R);
    });
  };

  // ---- Obstacles: how a box is drawn (it blocks the same either way) ----
  Game.prototype._obstacle = function (ctx, kind, x, y, w, h) {
    if (kind === 'pumpkin') this._pumpkin(ctx, x, y, w, h);
    else if (kind === 'bat') this._bat(ctx, x, y, w, h);
    else if (kind === 'ghost') this._ghost(ctx, x, y, w, h);
    else if (kind === 'tomb') this._tomb(ctx, x, y, w, h);
    else this._crate(ctx, x, y, w, h);
  };

  // A jack-o'-lantern filling the box: ribbed, with a glowing carved face.
  Game.prototype._pumpkin = function (ctx, x, y, w, h) {
    const cx = x + w / 2, cy = y + h * 0.58, rx = w / 2, ry = h * 0.42;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(cx + 8, cy + 10, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3f6b2a'; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx - w * 0.05, cy - ry + 4); ctx.lineTo(cx - w * 0.02, y); ctx.lineTo(cx + w * 0.08, y + 2); ctx.lineTo(cx + w * 0.05, cy - ry + 4); ctx.closePath();
    ctx.fill(); ctx.stroke();
    const g = ctx.createRadialGradient(cx - rx * 0.3, cy - ry * 0.4, 2, cx, cy, Math.max(rx, ry));
    g.addColorStop(0, '#ffb24d'); g.addColorStop(1, '#d4581a');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(110,35,0,0.55)'; ctx.lineWidth = 2;
    [0.35, 0.7].forEach((k) => { ctx.beginPath(); ctx.ellipse(cx, cy, rx * k, ry * 0.98, 0, 0, Math.PI * 2); ctx.stroke(); });
    // Carved face, lit from inside.
    ctx.fillStyle = '#ffe36b';
    const tri = (ax, ay, bx2, by2, cx2, cy2) => { ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx2, by2); ctx.lineTo(cx2, cy2); ctx.closePath(); ctx.fill(); };
    tri(cx - rx * 0.55, cy - ry * 0.05, cx - rx * 0.15, cy - ry * 0.05, cx - rx * 0.35, cy - ry * 0.45);
    tri(cx + rx * 0.15, cy - ry * 0.05, cx + rx * 0.55, cy - ry * 0.05, cx + rx * 0.35, cy - ry * 0.45);
    ctx.beginPath();
    ctx.moveTo(cx - rx * 0.6, cy + ry * 0.2);
    for (let i = 0; i <= 6; i++) ctx.lineTo(cx - rx * 0.6 + rx * 0.2 * i, cy + ry * (i % 2 ? 0.32 : 0.2));
    ctx.lineTo(cx + rx * 0.5, cy + ry * 0.5); ctx.lineTo(cx - rx * 0.5, cy + ry * 0.5); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  };

  // A bat with flapping wings across the box, red eyes.
  Game.prototype._bat = function (ctx, x, y, w, h) {
    const cx = x + w / 2, cy = y + h / 2, flap = Math.sin(this.time * 12) * h * 0.25;
    ctx.save();
    ctx.fillStyle = '#1c0f2a'; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy - h * 0.15);
    ctx.quadraticCurveTo(cx - w * 0.25, cy - h * 0.5 - flap, x, cy - h * 0.2 - flap);
    ctx.quadraticCurveTo(x + w * 0.1, cy + h * 0.1, x + w * 0.16, cy + h * 0.3);
    ctx.quadraticCurveTo(x + w * 0.25, cy + h * 0.1, x + w * 0.33, cy + h * 0.32);
    ctx.quadraticCurveTo(cx - w * 0.1, cy + h * 0.2, cx, cy + h * 0.45);
    ctx.quadraticCurveTo(cx + w * 0.1, cy + h * 0.2, x + w * 0.67, cy + h * 0.32);
    ctx.quadraticCurveTo(x + w * 0.75, cy + h * 0.1, x + w * 0.84, cy + h * 0.3);
    ctx.quadraticCurveTo(x + w * 0.9, cy + h * 0.1, x + w, cy - h * 0.2 - flap);
    ctx.quadraticCurveTo(cx + w * 0.25, cy - h * 0.5 - flap, cx, cy - h * 0.15);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx, cy, w * 0.09, h * 0.32, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ff3b3b';
    ctx.beginPath(); ctx.arc(cx - w * 0.03, cy - h * 0.08, Math.max(1.5, w * 0.018), 0, Math.PI * 2); ctx.arc(cx + w * 0.03, cy - h * 0.08, Math.max(1.5, w * 0.018), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };

  // A sheet ghost: round head, wavy hem, hollow eyes.
  Game.prototype._ghost = function (ctx, x, y, w, h) {
    const r = Math.min(w / 2, h * 0.5), t = this.time;
    ctx.save();
    ctx.globalAlpha = 0.93;
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.arc(x + w / 2, y + r, w / 2, Math.PI, 0);
    ctx.lineTo(x + w, y + h);
    const n = 4;
    for (let i = n; i > 0; i--) {
      const xm = x + w * (i - 0.5) / n, x0 = x + w * (i - 1) / n;
      ctx.quadraticCurveTo(xm, y + h - h * 0.16 * (1 + Math.sin(t * 5 + i) * 0.4), x0, y + h);
    }
    ctx.closePath();
    ctx.fillStyle = '#f2eeff'; ctx.fill();
    ctx.globalAlpha = 1; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = '#1a1030';
    ctx.beginPath(); ctx.ellipse(x + w * 0.36, y + r * 0.95, w * 0.07, h * 0.08, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + w * 0.64, y + r * 0.95, w * 0.07, h * 0.08, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + w * 0.5, y + r * 1.35, w * 0.06, h * 0.07, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };

  // A rounded tombstone with RIP, a crack and grass at its foot.
  Game.prototype._tomb = function (ctx, x, y, w, h) {
    const r = w / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x + 8, y + r + 10, w, h - r);
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, '#a7b0bb'); g.addColorStop(1, '#5d6672');
    ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y + r); ctx.arc(x + r, y + r, r, Math.PI, 0); ctx.lineTo(x + w, y + h); ctx.closePath();
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(30,30,40,0.6)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + w * 0.7, y + r * 0.6); ctx.lineTo(x + w * 0.6, y + r * 1.1); ctx.lineTo(x + w * 0.72, y + r * 1.4); ctx.stroke();
    ctx.fillStyle = '#3c434d'; ctx.textAlign = 'center';
    ctx.font = 'bold ' + Math.round(w * 0.24) + 'px "Space Grotesk", sans-serif';
    ctx.fillText('RIP', x + w / 2, y + r + w * 0.12);
    ctx.fillStyle = '#3d7a34';
    ctx.beginPath(); ctx.moveTo(x - 4, y + h);
    for (let i = 0; i <= 8; i++) ctx.lineTo(x - 4 + (w + 8) * i / 8, y + h - (i % 2 ? h * 0.12 : 2));
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y + r); ctx.arc(x + r, y + r, r, Math.PI, 0); ctx.lineTo(x + w, y + h); ctx.stroke();
    ctx.restore();
  };

  // A cartoon wooden crate: planks, a frame with a diagonal brace, nails, and
  // a bold outline, with a soft shadow cast back onto whatever is behind it.
  Game.prototype._crate = function (ctx, x, y, w, h) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x + 8, y + 10, w, h);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#dca063'); g.addColorStop(1, '#a8693a');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    const n = Math.max(2, Math.round(h / 30));
    ctx.strokeStyle = 'rgba(70,35,12,0.5)'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 1; i < n; i++) { const py = y + h * i / n; ctx.moveTo(x, py); ctx.lineTo(x + w, py); }
    ctx.stroke();
    const f = Math.max(5, Math.min(w, h) * 0.13);
    ctx.fillStyle = '#8a5229';
    ctx.fillRect(x, y, w, f); ctx.fillRect(x, y + h - f, w, f); ctx.fillRect(x, y, f, h); ctx.fillRect(x + w - f, y, f, h);
    ctx.save();
    ctx.beginPath(); ctx.rect(x + f, y + f, w - 2 * f, h - 2 * f); ctx.clip();
    ctx.strokeStyle = '#8a5229'; ctx.lineWidth = f * 0.9;
    ctx.beginPath(); ctx.moveTo(x + f, y + h - f); ctx.lineTo(x + w - f, y + f); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#3b2412';
    [[x + f / 2, y + f / 2], [x + w - f / 2, y + f / 2], [x + f / 2, y + h - f / 2], [x + w - f / 2, y + h - f / 2]].forEach((q) => {
      ctx.beginPath(); ctx.arc(q[0], q[1], Math.max(1.5, f * 0.18), 0, Math.PI * 2); ctx.fill();
    });
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 4; ctx.strokeRect(x, y, w, h);
    ctx.restore();
  };

  Game.prototype._cloud = function (ctx, x, y, s, fill) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.arc(34, -12, 40, 0, Math.PI * 2); ctx.arc(74, 0, 28, 0, Math.PI * 2);
    ctx.arc(30, 14, 26, 0, Math.PI * 2); ctx.arc(-8, 14, 22, 0, Math.PI * 2);
    ctx.fillStyle = fill || 'rgba(236,230,255,0.92)'; ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = OUTLINE; ctx.stroke();
    ctx.restore();
  };

  // One outlined cartoon prop per world, standing on the hills.
  Game.prototype._worldProp = function (ctx, sky, x, y) {
    ctx.save(); ctx.lineWidth = 5; ctx.strokeStyle = OUTLINE;
    if (sky === 'dawn') {
      // Dartboard on a post.
      ctx.fillStyle = '#5a3d2b'; ctx.fillRect(x - 5, y - 10, 10, 90); ctx.strokeRect(x - 5, y - 10, 10, 90);
      ctx.beginPath(); ctx.arc(x, y - 36, 44, 0, Math.PI * 2);
      ctx.fillStyle = '#f4efe2'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y - 36, 30, 0, Math.PI * 2); ctx.fillStyle = '#c0392b'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y - 36, 12, 0, Math.PI * 2); ctx.fillStyle = '#2ecc71'; ctx.fill(); ctx.stroke();
    } else if (sky === 'noon') {
      // A stack of neon darts stuck in the ground.
      [-22, 0, 22].forEach((dx, i) => {
        ctx.save(); ctx.translate(x + dx, y + 30); ctx.rotate(-0.25 + i * 0.25);
        ctx.fillStyle = [C.cyan, C.green, C.violet][i];
        ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(0, -92); ctx.lineTo(10, -106); ctx.lineTo(0, -120); ctx.lineTo(-10, -106); ctx.lineTo(-10, -92); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.restore();
      });
    } else if (sky === 'halloween') {
      // A crooked bare tree and a jack-o'-lantern at its foot.
      ctx.strokeStyle = '#1a0f20'; ctx.lineWidth = 9; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x + 20, y + 80); ctx.quadraticCurveTo(x + 6, y + 10, x + 26, y - 70);
      ctx.moveTo(x + 18, y - 10); ctx.quadraticCurveTo(x - 20, y - 30, x - 44, y - 64);
      ctx.moveTo(x + 22, y - 40); ctx.quadraticCurveTo(x + 50, y - 60, x + 70, y - 96);
      ctx.moveTo(x - 20, y - 36); ctx.lineTo(x - 30, y - 78);
      ctx.stroke();
      this._pumpkin(ctx, x - 58, y + 24, 70, 56);
    } else if (sky === 'nightmare') {
      // A dead tree with something watching from it, and a leaning tombstone.
      ctx.strokeStyle = '#08030a'; ctx.lineWidth = 10; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, y + 80); ctx.lineTo(x + 4, y - 60);
      ctx.moveTo(x + 2, y - 10); ctx.lineTo(x - 46, y - 70);
      ctx.moveTo(x + 3, y - 34); ctx.lineTo(x + 52, y - 92);
      ctx.moveTo(x - 30, y - 50); ctx.lineTo(x - 58, y - 52);
      ctx.stroke();
      ctx.fillStyle = '#ffd400';
      ctx.beginPath(); ctx.ellipse(x - 6, y - 30, 5, 3, 0, 0, Math.PI * 2); ctx.ellipse(x + 10, y - 30, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.translate(x - 70, y + 10); ctx.rotate(-0.12); this._tomb(ctx, 0, 0, 48, 66); ctx.restore();
    } else if (sky === 'box') {
      // A stack of crates.
      this._crate(ctx, x - 52, y - 4, 60, 56);
      this._crate(ctx, x + 6, y - 4, 60, 56);
      this._crate(ctx, x - 24, y - 58, 60, 54);
    } else {
      // A lantern on a pole.
      ctx.fillStyle = '#3a2a1a'; ctx.fillRect(x - 4, y - 70, 8, 110); ctx.strokeRect(x - 4, y - 70, 8, 110);
      ctx.beginPath(); ctx.arc(x, y - 92, 26, 0, Math.PI * 2);
      ctx.fillStyle = C.gold; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y - 92, 44, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,211,77,0.18)'; ctx.fill();
    }
    ctx.restore();
  };

  Game.prototype._star = function (ctx, x, y, r, on) {
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const rr = k % 2 === 0 ? r : r * 0.45, a = -Math.PI / 2 + k * Math.PI / 5;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = on ? C.gold : 'rgba(10,6,24,0.7)'; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = on ? OUTLINE : '#4a4f72'; ctx.stroke();
  };

  Game.prototype._tile = function (ctx, b, L, idx, open, stars, bob) {
    const x = b.x, y = b.y + bob, w = b.w, h = b.h, cx = x + w / 2;
    ctx.save();
    // Drop shadow, then the body.
    ctx.fillStyle = OUTLINE; this._roundRect(ctx, x + 6, b.y + 8, w, h, 16); ctx.fill();
    const body = ctx.createLinearGradient(0, y, 0, y + h);
    if (open) {
      const col = C[L.skin] || C.cyan;
      body.addColorStop(0, col); body.addColorStop(1, '#1a1040');
    } else { body.addColorStop(0, '#2a2e4a'); body.addColorStop(1, '#141628'); }
    ctx.fillStyle = body; this._roundRect(ctx, x, y, w, h, 16); ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = OUTLINE; this._roundRect(ctx, x, y, w, h, 16); ctx.stroke();
    if (L.boss) {
      // Crown over the boss tile.
      ctx.fillStyle = C.gold; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cx - 34, y - 6); ctx.lineTo(cx - 34, y - 34); ctx.lineTo(cx - 17, y - 20);
      ctx.lineTo(cx, y - 40); ctx.lineTo(cx + 17, y - 20); ctx.lineTo(cx + 34, y - 34); ctx.lineTo(cx + 34, y - 6);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.textAlign = 'center';
    if (open) {
      ctx.fillStyle = 'rgba(10,6,24,0.55)';
      ctx.beginPath(); ctx.arc(cx, y + 30, 19, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 18px "Space Grotesk", sans-serif';
      ctx.fillText(String(idx + 1), cx, y + 36);
      // Long names shrink to fit the tile.
      let fs = L.boss ? 15 : 17;
      ctx.fillStyle = '#fff'; ctx.font = 'bold ' + fs + 'px "Space Grotesk", sans-serif';
      while (fs > 9 && ctx.measureText(L.name).width > w - 14) { fs--; ctx.font = 'bold ' + fs + 'px "Space Grotesk", sans-serif'; }
      ctx.fillText(L.name, cx, y + 84);
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = '12px "Space Grotesk", sans-serif';
      ctx.fillText((L.mode === 'x301' ? '301' : '501') + '  ·  ' + (L.boss ? 'BOSS' : L.tier), cx, y + 84 + 20 * this._textBump());
      for (let s = 0; s < 3; s++) this._star(ctx, cx - 26 + s * 26, y + h - 26, 11, s < stars);
    } else {
      // Padlock.
      ctx.fillStyle = '#5b6182';
      ctx.beginPath(); ctx.arc(cx, y + 62, 16, Math.PI, 0); ctx.lineWidth = 6; ctx.strokeStyle = '#5b6182'; ctx.stroke();
      ctx.fillRect(cx - 22, y + 62, 44, 34);
      ctx.fillStyle = OUTLINE; ctx.beginPath(); ctx.arc(cx, y + 78, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C.dim; ctx.font = '12px "Space Grotesk", sans-serif';
      ctx.fillText('Beat level ' + (KD.Campaign.opener(idx) + 1), cx, y + h - 28);
    }
    ctx.restore();
  };

  // Results card for a campaign leg: stars, title and buttons.
  Game.prototype._drawLevelResult = function (ctx, r) {
    const lvl = r.level, cx = this.viewW / 2, cy = VIEW_H / 2;
    const boss = lvl.boss && lvl.won;
    ctx.textAlign = 'center';
    for (let s = 0; s < 3; s++) this._star(ctx, cx - 74 + s * 74, cy - 150, 30, s < lvl.stars);
    ctx.fillStyle = r.won ? C.green : C.ember;
    ctx.shadowColor = r.won ? C.green : C.ember; ctx.shadowBlur = 24;
    ctx.font = 'bold 60px "Space Grotesk", sans-serif';
    let title = r.won ? 'LEVEL CLEARED!' : 'DEFEAT';
    if (boss) {
      const w = KD.Campaign.LEVELS[lvl.idx].world, W = KD.Campaign.WORLDS[w];
      const side = KD.Campaign.LEVELS.some((l) => l.world === w && l.after != null);
      title = (side ? W.name : 'WORLD ' + (w + 1)) + ' COMPLETE!';
    }
    ctx.fillText(title, cx, cy - 58);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff'; ctx.font = '20px "Space Grotesk", sans-serif';
    ctx.fillText((r.won ? 'You take' : r.winner + ' takes') + ' the leg', cx, cy - 22);
    ctx.fillStyle = C.gold; ctx.font = 'bold 18px "Space Grotesk", sans-serif';
    ctx.fillText('+' + r.xp + ' XP', cx, cy + 8);
    ctx.fillStyle = C.dim; ctx.font = '14px "Space Grotesk", sans-serif';
    const need = lvl.won ? (lvl.stars === 3 ? 'Best stars!' : '3 stars: win within ' + lvl.par + ' darts') : 'Win to earn stars';
    ctx.fillText(r.darts + ' darts  ·  par ' + lvl.par + '  ·  ' + need, cx, cy + 38);
    const btns = this._matchButtons();
    btns.forEach((b) => {
      const col = b.group === 'primary' ? C.green : b.group === 'btn' ? C.cyan : b.group === 'share' ? C.gold : C.violet;
      ctx.fillStyle = 'rgba(10,6,24,0.85)'; this._roundRect(ctx, b.x, b.y, b.w, b.h, 14); ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = col; this._roundRect(ctx, b.x, b.y, b.w, b.h, 14); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 18px "Space Grotesk", sans-serif';
      ctx.fillText(b.label, b.x + b.w / 2, b.y + 34);
    });
    ctx.textAlign = 'left';
  };

  Game.prototype._drawPause = function (ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(4,6,14,0.8)'; ctx.fillRect(0, 0, this.viewW, VIEW_H);
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
    ctx.shadowColor = C.cyan; ctx.shadowBlur = 20;
    ctx.font = 'bold 48px "Space Grotesk", sans-serif';
    ctx.fillText('PAUSED', this.viewW / 2, VIEW_H / 2 - 60);
    ctx.shadowBlur = 0;
    ctx.restore();
    this._pauseLayout().forEach((b) => this._neonButton(ctx, b));
    ctx.save();
    ctx.textAlign = 'center'; ctx.fillStyle = C.dim;
    ctx.font = '12px "Space Grotesk", sans-serif';
    ctx.fillText('P resume · M mute · Esc quit', this.viewW / 2, VIEW_H / 2 + 150);
    ctx.restore();
    ctx.textAlign = 'left';
  };

  Game.prototype._drawToasts = function (ctx) {
    ctx.save();
    ctx.textAlign = 'center';
    for (let i = 0; i < this.toasts.length; i++) {
      const t = this.toasts[i];
      const a = Math.min(1, t.life);
      const y = 70 + i * 56;
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(57,230,255,0.12)';
      this._roundRect(ctx, this.viewW / 2 - 130, y, 260, 46, 10); ctx.fill();
      ctx.strokeStyle = C.cyan; ctx.lineWidth = 1.5;
      this._roundRect(ctx, this.viewW / 2 - 130, y, 260, 46, 10); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 16px "Space Grotesk", sans-serif';
      ctx.fillText(t.text, this.viewW / 2, y + 20);
      if (t.sub) { ctx.fillStyle = C.green; ctx.font = '12px "Space Grotesk", sans-serif'; ctx.fillText(t.sub, this.viewW / 2, y + 37); }
    }
    ctx.restore();
    ctx.globalAlpha = 1; ctx.textAlign = 'left';
  };

  Game.prototype._roundRect = function (ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  // ---- Digital seven-segment readout ------------------------------------
  // Segment table a,b,c,d,e,f,g for 0-9 (a=top, b=tr, c=br, d=bottom, e=bl,
  // f=tl, g=mid).
  Game._SEG = {
    '0': [1,1,1,1,1,1,0], '1': [0,1,1,0,0,0,0], '2': [1,1,0,1,1,0,1],
    '3': [1,1,1,1,0,0,1], '4': [0,1,1,0,0,1,1], '5': [1,0,1,1,0,1,1],
    '6': [1,0,1,1,1,1,1], '7': [1,1,1,0,0,0,0], '8': [1,1,1,1,1,1,1],
    '9': [1,1,1,1,0,1,1],
  };

  Game.prototype._segDigit = function (ctx, x, y, w, h, on, color) {
    const t = Math.max(2, h * 0.13);              // segment thickness
    const m = t * 0.7;                            // inset margin
    const x0 = x + m, x1 = x + w - m, my = y + h / 2;
    const y0 = y + m, y1 = y + h - m;
    const segs = [
      [x0, y0, x1, y0],          // a top
      [x1, y0, x1, my],          // b top-right
      [x1, my, x1, y1],          // c bottom-right
      [x0, y1, x1, y1],          // d bottom
      [x0, my, x0, y1],          // e bottom-left
      [x0, y0, x0, my],          // f top-left
      [x0, my, x1, my],          // g mid
    ];
    ctx.lineWidth = t; ctx.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const lit = on[i];
      ctx.strokeStyle = lit ? color : 'rgba(255,255,255,0.05)';
      if (lit) { ctx.shadowColor = color; ctx.shadowBlur = h * 0.18; } else ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.moveTo(segs[i][0], segs[i][1]); ctx.lineTo(segs[i][2], segs[i][3]);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  };

  // Draw `str` as glowing seven-seg digits. `rightX` is the right edge for
  // right-aligned numbers (scoreboards). Returns the left x used.
  Game.prototype._sevenSeg = function (ctx, rightX, topY, str, h, color, popScale) {
    const sc = popScale || 1;
    const w = h * 0.56 * sc, hh = h * sc, gap = h * 0.16 * sc;
    const cw = w + gap;
    let x = rightX - str.length * cw + gap * 0.5;
    const yy = topY - (hh - h) / 2;               // keep baseline as the number grows
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      const on = Game._SEG[ch] || [0,0,0,0,0,0,0];
      this._segDigit(ctx, x, yy, w, hh, on, color);
      x += cw;
    }
    return rightX - str.length * cw;
  };

  // Spawn the "squares coming off" the digital readout when it ticks.
  Game.prototype._shedDigits = function (pl) {
    const n = 10, col = pl._popCol || '#39e6ff';
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 180;
      pl._shed.push({
        x: pl._digX + (Math.random() * 2 - 1) * pl._digH * 1.2,
        y: pl._digY + (Math.random() * 2 - 1) * pl._digH * 0.5,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80,
        life: 0.45 + Math.random() * 0.4, rot: Math.random() * 6.28,
        spin: (Math.random() * 2 - 1) * 12, size: 4 + Math.random() * 6, col: col,
      });
    }
  };

  Game.prototype._drawShed = function (ctx, pl) {
    const sh = pl._shed; if (!sh || !sh.length) return;
    ctx.save();
    for (let i = 0; i < sh.length; i++) {
      const b = sh[i];
      ctx.globalAlpha = Math.max(0, Math.min(1, b.life * 2));
      ctx.fillStyle = b.col; ctx.shadowColor = b.col; ctx.shadowBlur = 8;
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot);
      ctx.fillRect(-b.size / 2, -b.size / 2, b.size, b.size);
      ctx.restore();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  };

  // ====================================================================
  // DART WORKSHOP  — pick a barrel (skin), a tip and a flight.
  // ====================================================================
  // Workshop geometry. 4:3 screens stack the preview above four rows of
  // chips (finish, barrel, tip, flight); wide screens (phones in landscape)
  // put the preview and stats on the left and taller chips on the right,
  // since they have width to spare but little height.
  Game.prototype._wsGeom = function () {
    const wide = this.viewW >= 1300;
    return wide
      ? { wide: true, cx: this.viewW * 0.63, rows: [164, 298, 432, 566], chipH: 100,
          dartX: this.viewW * 0.2 + 150, dartY: 300, dartLen: 340,
          info: { x: this.viewW * 0.2 - 175, y: 400, w: 410, h: 250, top: 24, nameGap: 22, gap: 16, m: 12 }, buyH: 50 }
      : { wide: false, cx: this.viewW / 2, rows: [256, 344, 432, 520], chipH: 66,
          dartX: this.viewW / 2 + 90, dartY: 160, dartLen: 250,
          info: { x: this.viewW / 2 + 128, y: 116, w: 330, h: 132, top: 18, nameGap: 20, gap: 10, m: 10 }, buyH: 28 };
  };

  // The part on show in the big preview: what you tapped (try before you buy)
  // swapped into what you have equipped. null when nothing is being previewed.
  Game.prototype._wsLoadout = function () {
    const d = this.progression.data, pv = this.wsPreview;
    const L = { skin: d.skins.equipped, shape: d.darts.shape, tip: d.darts.tip, flight: d.darts.flight };
    if (pv) L[pv.group] = pv.key;
    return L;
  };

  // What the BUY button can do for the previewed part.
  Game.prototype._wsOffer = function () {
    const pv = this.wsPreview, prog = this.progression;
    if (!pv) return null;
    if (pv.group === 'skin') return { kind: 'locked' };
    const cost = pv.group === 'shape' ? prog.shapeCost(pv.key) : pv.group === 'tip' ? prog.tipCost(pv.key) : prog.flightCost(pv.key);
    return prog.data.coins >= cost ? { kind: 'buy', cost: cost } : { kind: 'poor', cost: cost, need: cost - prog.data.coins };
  };

  Game.prototype._workshopLayout = function () {
    const prog = this.progression;
    const btns = [];
    btns.push({ id: 'back', label: '← BACK', x: 24, y: 72, w: 110, h: 40, group: 'back' });
    // Bonus chest for 💎, under the coin and token balance (top-right).
    const bw = this.viewW >= 1300 ? 250 : 190;
    btns.push({ id: 'bonus', group: 'bonus', x: this.viewW - 24 - bw, y: 66, w: bw, h: 42 });

    const G = this._wsGeom(), WS_ROWS = G.rows, WS_CHIP_H = G.chipH;
    const row = (ids, kind, y, cw, gap, sel, owned, cost) => {
      const total = ids.length * cw + (ids.length - 1) * gap;
      let x = G.cx - total / 2;
      ids.forEach((id) => {
        btns.push({
          id: kind + ':' + id, group: kind, key: id, x: x, y: y, w: cw, h: WS_CHIP_H,
          sel: sel(id), owned: owned(id), cost: cost(id),
        });
        x += cw + gap;
      });
    };

    row(['cyan', 'violet', 'green', 'gold', 'ember'], 'skin', WS_ROWS[0], 132, 10,
      (id) => prog.data.skins.equipped === id, (id) => prog.owns(id), () => 0);
    row(Object.keys(KD.Sprites.BARRELS), 'shape', WS_ROWS[1], 132, 10,
      (id) => prog.data.darts.shape === id, (id) => prog.ownsShape(id), (id) => prog.shapeCost(id));
    row(Object.keys(KD.Sprites.TIPS), 'tip', WS_ROWS[2], 132, 10,
      (id) => prog.data.darts.tip === id, (id) => prog.ownsTip(id), (id) => prog.tipCost(id));
    row(Object.keys(KD.Sprites.FLIGHTS), 'flight', WS_ROWS[3], 108, 9,
      (id) => prog.data.darts.flight === id, (id) => prog.ownsFlight(id), (id) => prog.flightCost(id));
    const pv = this.wsPreview;
    if (pv) btns.forEach((b) => { if (b.group === pv.group && b.key === pv.key) b.prev = true; });
    // BUY for the previewed part, along the bottom of the info card.
    const off = this._wsOffer();
    if (off && off.kind !== 'locked') {
      const I = G.info, m = I.m;
      btns.push({ id: 'buy', group: 'buy', x: I.x + m, y: I.y + I.h - G.buyH - m, w: I.w - m * 2, h: G.buyH, offer: off });
    }
    // Nothing on trial: the card lists your equipped barrel, tip and flight,
    // each with an UPGRADE button.
    if (!pv) {
      const I = G.info, k = this._textBump(), rowH = G.wide ? 62 : 35, top = I.y + I.top + (G.wide ? 12 : 6) * k;
      const bw = G.wide ? 160 : 124;
      [['shape', prog.data.darts.shape], ['tip', prog.data.darts.tip], ['flight', prog.data.darts.flight]].forEach(([g, id], i) => {
        btns.push({ id: 'up:' + g, group: 'up', part: g, key: id, x: I.x + I.w - I.m - bw, y: top + i * rowH + 4, w: bw, h: rowH - 10 });
      });
    }
    return btns;
  };

  // Tapping a part you own equips it. Tapping one you don't puts it on the
  // big dart to try on (tap it again to put it back); BUY on the info card
  // buys and equips it. Nothing is ever bought by a single stray tap.
  Game.prototype._updateWorkshop = function (dt) {
    this.wsFlash = Math.max(0, (this.wsFlash || 0) - (dt || 0));
    const leave = () => { this.wsPreview = null; this.state = 'menu'; };
    if (this.input.justPressed('back') || this.input.justPressed('pause')) { leave(); return; }
    const p = this.input.pointer;
    if (!p.justDown) return;
    const btns = this._workshopLayout();
    const prog = this.progression;
    for (let i = 0; i < btns.length; i++) {
      const b = btns[i];
      if (p.x < b.x || p.x > b.x + b.w || p.y < b.y || p.y > b.y + b.h) continue;
      this.audio.tick();
      if (b.group === 'back') { leave(); return; }
      if (b.group === 'bonus') {
        if (!this._openBonusChest()) {
          this.toasts.push({ text: 'NEED ' + (KD.Progression.BONUS_CHEST_TOKENS - prog.data.tokens) + ' MORE 💎', sub: 'Tokens come from chests and league-ups', life: 2.2 });
        } else { this.audio.chime(1); this.audio.coins(); }
        return;
      }
      if (b.group === 'up') {
        const r = prog.upgradePart(b.part, b.key, true);
        const nm = (WS_CAT(b.part)[b.key] || {}).name || b.key;
        if (r === 'upgraded') {
          this.audio.levelUp(); this.wsFlash = 0.9;
          this.toasts.push({ text: nm.toUpperCase() + ' → LV ' + prog.partLv(b.part, b.key), sub: 'Steadier hand: aim wobble and scatter down', life: 2.4 });
        } else if (r === 'cards') {
          const c = prog.upgradeCost(b.part, b.key);
          this.toasts.push({ text: 'NEED ' + (c.cards - prog.partCards(b.part, b.key)) + ' MORE CARDS', sub: 'Or ' + prog.tokenFill(b.part, b.key) + ' 💎 to fill them', life: 2.4 });
        } else if (r === 'poor') this.toasts.push({ text: 'NOT ENOUGH COINS', sub: 'Win matches to earn coins', life: 2.2 });
        return;
      }
      if (b.group === 'buy') {
        const pv = this.wsPreview;
        if (b.offer.kind === 'poor') {
          this.toasts.push({ text: 'NOT ENOUGH COINS', sub: 'Win matches to earn coins', life: 2.2 });
          return;
        }
        const r = pv.group === 'shape' ? prog.chooseShape(pv.key) : pv.group === 'tip' ? prog.chooseTip(pv.key) : prog.chooseFlight(pv.key);
        if (r === 'bought') { this.audio.chime(1); this.audio.buzz(18); this.wsPreview = null; this.wsFlash = 0.9; }
        return;
      }
      if (b.owned) {
        if (b.group === 'skin') prog.equip(b.key);
        else if (b.group === 'shape') prog.chooseShape(b.key);
        else if (b.group === 'tip') prog.chooseTip(b.key);
        else prog.chooseFlight(b.key);
        this.wsPreview = null;
        this.audio.chime(0);
      } else {
        this.wsPreview = b.prev ? null : { group: b.group, key: b.key };
      }
      return;
    }
  };

  Game.prototype._tierColor = function (tier) {
    const colors = { common: '#b4d2ff', uncommon: '#7cffb2', rare: '#ffd34d', epic: '#c46bff' };
    return colors[tier] || '#39e6ff';
  };

  // Loadout stats as a 0..100 rating, where 100 is the best part in every
  // slot. Style ratings only: the footer is honest that every dart flies the same.
  const WS_STATS = [['speed', 'SPEED', '#ff5d3c'], ['stability', 'STABILITY', '#7cffb2'], ['slimness', 'SLIMNESS', '#39e6ff']];
  Game.prototype._wsRatings = function (L) {
    const S = KD.Sprites;
    const cats = [[S.SKINS, L.skin], [S.BARRELS, L.shape], [S.TIPS, L.tip], [S.FLIGHTS, L.flight]];
    const out = {};
    WS_STATS.forEach(([k]) => {
      let have = 0, best = 0;
      cats.forEach(([cat, id]) => {
        have += (cat[id] || {})[k] || 0;
        best += Math.max.apply(null, Object.keys(cat).map((j) => cat[j][k] || 0));
      });
      out[k] = best > 0 ? Math.round(100 * have / best) : 0;
    });
    return out;
  };

  // Bars for the equipped rating; a previewed part shows its change on top
  // (green for a gain, red for a loss) with the new number.
  Game.prototype._drawStatBars = function (ctx, x, y, w, cur, nxt) {
    const k = this._textBump(), labW = 88 * k, numW = 76 * k, bw = w - labW - numW, rowH = 19 * k;
    WS_STATS.forEach(([key, label, col], i) => {
      const sy = y + i * rowH, a = cur[key], b = nxt ? nxt[key] : a;
      ctx.textAlign = 'left'; ctx.fillStyle = C.dim; ctx.font = 'bold 11px "Space Grotesk", sans-serif';
      ctx.fillText(label, x, sy);
      const bx = x + labW, by = sy - 8;
      ctx.fillStyle = 'rgba(180,210,255,0.14)'; ctx.fillRect(bx, by, bw, 9);
      ctx.fillStyle = col; ctx.fillRect(bx, by, bw * Math.min(a, b) / 100, 9);
      if (b !== a) {
        ctx.fillStyle = b > a ? C.green : '#ff5d6c';
        ctx.globalAlpha = 0.85;
        ctx.fillRect(bx + bw * Math.min(a, b) / 100, by, bw * Math.abs(b - a) / 100, 9);
        ctx.globalAlpha = 1;
      }
      ctx.textAlign = 'right'; ctx.font = 'bold 12px "Space Grotesk", sans-serif';
      ctx.fillStyle = b > a ? C.green : b < a ? '#ff5d6c' : C.text;
      ctx.fillText(b !== a ? b + ' (' + (b > a ? '+' : '') + (b - a) + ')' : String(b), x + w, sy);
    });
    ctx.textAlign = 'left';
  };

  const WS_KIND = { skin: 'FINISH', shape: 'BARREL', tip: 'TIP', flight: 'FLIGHT' };
  const WS_CAT = (g) => g === 'skin' ? KD.Sprites.SKINS : g === 'shape' ? KD.Sprites.BARRELS : g === 'tip' ? KD.Sprites.TIPS : KD.Sprites.FLIGHTS;

  // The info card: what's on the big dart, its rarity, the stat change, and BUY.
  Game.prototype._drawWsInfo = function (ctx, G) {
    const I = G.info, pv = this.wsPreview, d = this.progression.data, k = this._textBump();
    const shown = pv ? WS_CAT(pv.group)[pv.key] : null;
    const tier = shown ? shown.tier : 'common', tierCol = shown ? this._tierColor(tier) : C.cyan;
    ctx.save();
    ctx.fillStyle = 'rgba(8,12,26,0.86)';
    this._roundRect(ctx, I.x, I.y, I.w, I.h, 14); ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = pv ? tierCol : 'rgba(180,210,255,0.22)';
    this._roundRect(ctx, I.x, I.y, I.w, I.h, 14); ctx.stroke();
    const m = I.m + 2, tx = I.x + m;
    let ty = I.y + I.top;
    ctx.textAlign = 'left';
    if (pv) {
      ctx.fillStyle = tierCol; ctx.font = 'bold 11px "Space Grotesk", sans-serif';
      ctx.fillText('TRYING ON · ' + tier.toUpperCase() + ' ' + WS_KIND[pv.group], tx, ty);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 20px "Space Grotesk", sans-serif';
      ctx.fillText(shown.name, tx, ty + I.nameGap * k);
    } else {
      this._drawWsUpgrades(ctx, G);
      ctx.restore();
      ctx.textAlign = 'left';
      return;
    }
    ty += (I.nameGap + I.gap + 4) * k;
    const cur = this._wsRatings(this._wsLoadout.call({ progression: this.progression, wsPreview: null }));
    const nxt = pv ? this._wsRatings(this._wsLoadout()) : null;
    this._drawStatBars(ctx, tx, ty, I.w - m * 2, cur, nxt);
    if (pv && pv.group === 'skin') {
      ctx.fillStyle = C.gold; ctx.font = 'bold 12px "Space Grotesk", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('🔒 Level up or climb the ladder to unlock', I.x + I.w / 2, I.y + I.h - 16);
    }
    ctx.restore();
    ctx.textAlign = 'left';
  };

  // YOUR DART: the steadiness your upgrades give, then a row per equipped
  // part with its level, cards toward the next level, and an UPGRADE button.
  Game.prototype._drawWsUpgrades = function (ctx, G) {
    const I = G.info, prog = this.progression, k = this._textBump(), m = I.m + 2;
    const steady = Math.round((1 - prog.steadiness()) * 1000) / 10;
    ctx.textAlign = 'left';
    ctx.fillStyle = C.dim; ctx.font = 'bold 11px "Space Grotesk", sans-serif';
    ctx.fillText('YOUR DART', I.x + m, I.y + I.top);
    ctx.textAlign = 'right'; ctx.fillStyle = steady > 0 ? C.green : C.dim;
    ctx.fillText('STEADY HAND +' + steady + '%', I.x + I.w - m, I.y + I.top);
    this._workshopLayout().filter((b) => b.group === 'up').forEach((b) => {
      const part = WS_CAT(b.part)[b.key] || {}, lv = prog.partLv(b.part, b.key);
      const cost = prog.upgradeCost(b.part, b.key), have = prog.partCards(b.part, b.key);
      const ready = prog.canUpgrade(b.part, b.key, true), fill = prog.tokenFill(b.part, b.key);
      const lx = I.x + m, barW = b.x - lx - 12;
      ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = 'bold ' + (G.wide ? 14 : 12) + 'px "Space Grotesk", sans-serif';
      ctx.fillText(part.name + '  ', lx, b.y + (G.wide ? 16 : 12));
      const nw = ctx.measureText(part.name + '  ').width;
      ctx.fillStyle = this._tierColor(part.tier); ctx.font = 'bold 11px "Space Grotesk", sans-serif';
      ctx.fillText('LV ' + lv, lx + nw, b.y + (G.wide ? 16 : 12));
      const by = b.y + b.h - (G.wide ? 14 : 9), bh = G.wide ? 10 : 7;
      ctx.fillStyle = 'rgba(180,210,255,0.14)'; ctx.fillRect(lx, by, barW, bh);
      ctx.fillStyle = ready ? C.green : cost ? C.cyan : C.gold;
      ctx.fillRect(lx, by, barW * (cost ? Math.min(1, have / cost.cards) : 1), bh);
      // Button.
      const pulse = ready && !this.reduceMotion ? 0.5 + 0.5 * Math.sin(this.time * 5) : 0;
      ctx.fillStyle = ready ? 'rgba(124,255,178,' + (0.16 + 0.1 * pulse) + ')' : 'rgba(10,16,32,0.6)';
      this._roundRect(ctx, b.x, b.y, b.w, b.h, 9); ctx.fill();
      ctx.lineWidth = ready ? 2 : 1.2; ctx.strokeStyle = ready ? C.green : 'rgba(180,210,255,0.25)';
      this._roundRect(ctx, b.x, b.y, b.w, b.h, 9); ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = ready ? '#fff' : cost ? C.text : C.gold;
      this._fitText(ctx, !cost ? 'MAX LEVEL' : ready ? '⬆ LV ' + cost.to + ' · 🪙' + cost.coins + (fill ? ' 💎' + fill : '') : have + '/' + cost.cards + ' cards',
        b.x + b.w / 2, b.y + b.h / 2 + 1, b.w - 12, G.wide ? 14 : 11);
      ctx.textBaseline = 'alphabetic';
    });
    ctx.textAlign = 'left';
  };

  // fillText, shrinking the font until the text fits maxW.
  Game.prototype._fitText = function (ctx, txt, x, y, maxW, px) {
    let size = px;
    ctx.font = 'bold ' + size + 'px "Space Grotesk", sans-serif';
    while (size > 8 && ctx.measureText(txt).width > maxW) { size -= 1; ctx.font = 'bold ' + size + 'px "Space Grotesk", sans-serif'; }
    ctx.fillText(txt, x, y);
  };

  Game.prototype._drawBonusButton = function (ctx, b) {
    const ok = this.progression.data.tokens >= KD.Progression.BONUS_CHEST_TOKENS;
    ctx.save();
    ctx.fillStyle = ok ? 'rgba(57,230,255,0.16)' : 'rgba(10,16,32,0.6)';
    this._roundRect(ctx, b.x, b.y, b.w, b.h, 10); ctx.fill();
    ctx.lineWidth = ok ? 2 : 1.2; ctx.strokeStyle = ok ? C.cyan : 'rgba(180,210,255,0.25)';
    if (ok) { ctx.shadowColor = C.cyan; ctx.shadowBlur = 10; }
    this._roundRect(ctx, b.x, b.y, b.w, b.h, 10); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = ok ? '#fff' : C.dim;
    this._fitText(ctx, '🎁 BONUS CHEST · 💎' + KD.Progression.BONUS_CHEST_TOKENS, b.x + b.w / 2, b.y + b.h / 2 + 1, b.w - 14, 14);
    ctx.restore();
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  };

  Game.prototype._drawBuyButton = function (ctx, b) {
    const ok = b.offer.kind === 'buy';
    const pulse = ok && !this.reduceMotion ? 0.5 + 0.5 * Math.sin(this.time * 5) : 0;
    ctx.save();
    ctx.fillStyle = ok ? 'rgba(255,211,77,' + (0.18 + 0.1 * pulse) + ')' : 'rgba(10,16,32,0.6)';
    this._roundRect(ctx, b.x, b.y, b.w, b.h, 10); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = ok ? C.gold : 'rgba(180,210,255,0.25)';
    if (ok) { ctx.shadowColor = C.gold; ctx.shadowBlur = 8 + 8 * pulse; }
    this._roundRect(ctx, b.x, b.y, b.w, b.h, 10); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = ok ? '#fff' : C.dim;
    ctx.font = 'bold ' + (b.h >= 40 ? 18 : 14) + 'px "Space Grotesk", sans-serif';
    ctx.fillText(ok ? 'BUY & EQUIP · 🪙 ' + b.offer.cost : 'NEED 🪙 ' + b.offer.need + ' MORE', b.x + b.w / 2, b.y + b.h / 2 + 1);
    ctx.restore();
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  };

  Game.prototype._workshopChip = function (ctx, b) {
    const r = 12;
    const skinCol = (KD.Sprites.SKINS[b.key] || {}).color || C.cyan;
    const cat = b.group === 'skin' ? KD.Sprites.SKINS : b.group === 'shape' ? KD.Sprites.BARRELS : b.group === 'tip' ? KD.Sprites.TIPS : KD.Sprites.FLIGHTS;
    const cosmetic = cat[b.key];
    const tier = cosmetic ? cosmetic.tier : 'common';
    const tierCol = this._tierColor(tier);
    const accent = b.group === 'skin' ? skinCol : tierCol;
    ctx.save();
    ctx.globalAlpha = (!b.owned && b.group === 'skin') ? 0.4 : 1;
    ctx.fillStyle = b.sel ? 'rgba(57,230,255,0.13)' : 'rgba(10,16,32,0.6)';
    this._roundRect(ctx, b.x, b.y, b.w, b.h, r); ctx.fill();
    ctx.lineWidth = b.sel ? 2.5 : 1.2;
    ctx.strokeStyle = b.sel ? accent : 'rgba(180,210,255,0.2)';
    if (b.sel) { ctx.shadowColor = accent; ctx.shadowBlur = 14; }
    this._roundRect(ctx, b.x, b.y, b.w, b.h, r); ctx.stroke();
    if (b.prev) {
      ctx.globalAlpha = 1;
      ctx.setLineDash([6, 4]); ctx.lineWidth = 2.5; ctx.strokeStyle = C.gold;
      ctx.lineDashOffset = this.reduceMotion ? 0 : -this.time * 18;
      this._roundRect(ctx, b.x - 3, b.y - 3, b.w + 6, b.h + 6, r + 3); ctx.stroke();
      ctx.setLineDash([]);
    }

    // Level badge on owned parts that have been upgraded; a green dot when an upgrade is ready.
    if (b.group !== 'skin' && b.owned) {
      const lv = this.progression.partLv(b.group, b.key);
      const ready = this.progression.canUpgrade(b.group, b.key);
      if (ready) { ctx.fillStyle = C.green; ctx.beginPath(); ctx.arc(b.x + 10, b.y + 10, 5, 0, Math.PI * 2); ctx.fill(); }
      if (lv > 1) {
        ctx.fillStyle = C.gold; ctx.font = 'bold 11px "Space Grotesk", sans-serif'; ctx.textAlign = 'left';
        ctx.fillText('LV' + lv, b.x + (ready ? 18 : 7), b.y + 15);
      }
    }
    // Rarity badge
    if (tier !== 'common') {
      ctx.fillStyle = tierCol;
      ctx.beginPath(); ctx.arc(b.x + b.w - 10, b.y + 10, 6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.shadowBlur = 0;

    const cx = b.x + b.w / 2;
    // Preview centre: middle of the room above the name and status lines.
    const py = b.y + Math.max(16, (b.h - 5 - 25 * this._textBump()) / 2);
    // Mini preview, clipped to the chip so it never spills onto its neighbours.
    ctx.save();
    this._roundRect(ctx, b.x + 2, b.y + 2, b.w - 4, b.h - 4, r); ctx.clip();
    if (b.group === 'skin') {
      ctx.save(); ctx.translate(cx, py); ctx.rotate(-Math.PI * 0.12);
      this.sprites.drawDart(ctx, 98, KD.Sprites.SKINS[b.key], 0.3, this.progression.data.darts);
      ctx.restore();
    } else if (b.group === 'shape') {
      // Side-on, with the barrel centred in the chip so its shape and grip read.
      const skin = KD.Sprites.SKINS[this.progression.data.skins.equipped];
      const d = this.progression.data.darts;
      ctx.save(); ctx.translate(cx + 44, py);
      this.sprites.drawDart(ctx, 116, skin, 0.2, { tip: d.tip, flight: d.flight, shape: b.key });
      ctx.restore();
    } else {
      const skin = KD.Sprites.SKINS[this.progression.data.skins.equipped];
      const dd = this.progression.data.darts;
      const parts = b.group === 'tip' ? { tip: b.key, flight: dd.flight, shape: dd.shape }
                                       : { tip: dd.tip, flight: b.key, shape: dd.shape };
      // Pointing left, slid so the part being chosen sits mid-chip: the tip
      // and barrel for tips, the flight (about 0.9 of the length back) for flights.
      // Flights are tall, so short chips get a smaller dart.
      const L = b.group === 'flight' && b.h < 80 ? 80 : 102;
      ctx.save(); ctx.translate(b.group === 'tip' ? cx - L / 3 : cx - L * 0.9, py); ctx.rotate(Math.PI);
      this.sprites.drawDart(ctx, L, skin, 0.2, parts);
      ctx.restore();
    }
    ctx.restore();
    // Name.
    ctx.textAlign = 'center'; ctx.fillStyle = b.sel ? '#fff' : C.text;
    ctx.font = 'bold 12px "Space Grotesk", sans-serif';
    ctx.fillText((cosmetic || {}).name || b.key, cx, b.y + b.h - 5 - 13 * this._textBump());
    // Status line: EQUIPPED / cost / OWNED / LOCKED.
    ctx.font = '11px "Space Grotesk", sans-serif';
    if (b.sel) { ctx.fillStyle = C.green; ctx.fillText('EQUIPPED', cx, b.y + b.h - 5); }
    else if (b.prev) { ctx.fillStyle = C.gold; ctx.fillText('TRYING ON', cx, b.y + b.h - 5); }
    else if (b.group === 'skin') { ctx.fillStyle = b.owned ? C.dim : C.gold; ctx.fillText(b.owned ? 'tap to equip' : '🔒 locked', cx, b.y + b.h - 5); }
    else if (b.owned) { ctx.fillStyle = C.dim; ctx.fillText('owned', cx, b.y + b.h - 5); }
    else { ctx.fillStyle = C.gold; ctx.fillText('🪙 ' + b.cost, cx, b.y + b.h - 5); }
    ctx.restore();
    ctx.textAlign = 'left';
  };

  Game.prototype._drawWorkshop = function (ctx) {
    const d = this.progression.data;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.shadowColor = C.cyan; ctx.shadowBlur = 20; ctx.fillStyle = '#fff';
    ctx.font = 'bold 44px "Space Grotesk", sans-serif';
    ctx.fillText('DART WORKSHOP', this.viewW / 2, 80);
    ctx.shadowBlur = 0;
    ctx.fillStyle = C.violet; ctx.font = '13px "Space Grotesk", sans-serif';
    ctx.fillText('TRY ON ANY PART · BUY WHAT YOU LOVE', this.viewW / 2, 104);

    // Coin + token balance (top-right).
    ctx.textAlign = 'right'; ctx.fillStyle = C.gold;
    ctx.font = 'bold 20px "Space Grotesk", sans-serif';
    ctx.fillText('🪙 ' + d.coins, this.viewW - 24, 52);
    const cw = ctx.measureText('🪙 ' + d.coins).width;
    ctx.fillStyle = C.cyan; ctx.fillText('💎 ' + d.tokens, this.viewW - 44 - cw, 52);

    // Big turntable preview: the equipped dart, or the part you're trying on
    // swapped in, slowly rolling on its long axis over a glowing pedestal.
    const L = this._wsLoadout();
    const skin = KD.Sprites.SKINS[L.skin];
    const G = this._wsGeom();
    const still = this.reduceMotion;
    const bob = still ? 0 : Math.sin(this.time * 1.6) * 6;
    const midX = G.dartX - G.dartLen * 0.45;              // the dart is drawn back from its tip
    ctx.save();
    const ped = ctx.createRadialGradient(midX, G.dartY + 70, 4, midX, G.dartY + 70, G.dartLen * 0.6);
    ped.addColorStop(0, skin.color + '55'); ped.addColorStop(1, skin.color + '00');
    ctx.fillStyle = ped;
    ctx.beginPath(); ctx.ellipse(midX, G.dartY + 70, G.dartLen * 0.6, 26, 0, 0, Math.PI * 2); ctx.fill();
    if (this.wsFlash > 0) {                                // a fresh purchase flares gold
      const f = this.wsFlash / 0.9;
      ctx.globalAlpha = f; ctx.strokeStyle = C.gold; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(midX, G.dartY, G.dartLen * (0.75 - 0.25 * f), 60 * (1.6 - f), 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.translate(G.dartX, G.dartY + bob);
    ctx.rotate(-Math.PI * 0.03 + (still ? 0 : Math.sin(this.time * 0.8) * 0.03));
    // Roll: squash across the long axis, never flatter than 55% so it reads as a turn.
    if (!still) ctx.scale(1, 0.55 + 0.45 * Math.abs(Math.cos(this.time * 0.45)));
    ctx.shadowColor = skin.color; ctx.shadowBlur = 30;
    this.sprites.drawDart(ctx, G.dartLen, skin, 0.6, { tip: L.tip, flight: L.flight, shape: L.shape });
    ctx.restore();

    this._drawWsInfo(ctx, G);

    // Section labels.
    ctx.textAlign = 'center'; ctx.fillStyle = C.dim; ctx.font = 'bold 12px "Space Grotesk", sans-serif';
    ['FINISH', 'BARREL', 'TIP', 'FLIGHT'].forEach((t, i) => ctx.fillText(t, G.cx, G.rows[i] - 7));
    ctx.restore();

    const btns = this._workshopLayout();
    btns.forEach((b) => {
      if (b.group === 'back') this._neonButton(ctx, { x: b.x, y: b.y, w: b.w, h: b.h, label: b.label, group: 'back', sel: false });
      else if (b.group === 'buy') this._drawBuyButton(ctx, b);
      else if (b.group === 'up') { /* drawn inside the info card */ }
      else if (b.group === 'bonus') this._drawBonusButton(ctx, b);
      else this._workshopChip(ctx, b);
    });
    ctx.fillStyle = C.dim; ctx.font = '12px "Space Grotesk", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Looks are cosmetic · upgrade levels steady your hand. Win matches for coins and chest cards.', this.viewW / 2, VIEW_H - 24);
    ctx.textAlign = 'left';
  };

  // LEADERBOARD: see league-board.js.

  KD.Game = Game;
})(window.KD = window.KD || {});
