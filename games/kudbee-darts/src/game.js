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
  const C = {
    cyan: '#39e6ff', violet: '#c46bff', green: '#7CFFb2',
    gold: '#ffd34d', ember: '#ff5d3c', text: '#cfe9ff', dim: '#7d8aa8',
  };

  function Game(opts) {
    this.canvas = opts.canvas;
    this.ctx = this.canvas.getContext('2d');
    this.viewW = VIEW_W; this.viewH = VIEW_H;
    this.canvas.width = VIEW_W; this.canvas.height = VIEW_H;
    this.debug = false;
    this.time = 0;
    this.timeScale = 1;

    // Engine systems.
    this.input = new KD.Input(this.canvas);
    this.audio = new KD.Audio();
    this.camera = new KD.Camera(VIEW_W, VIEW_H);
    this.particles = new KD.Particles();
    this.sprites = new KD.Sprites();
    this.board = new KD.Board();
    this.board.layout(480, 296, 232);
    this.progression = new KD.Progression();
    this.dart = new KD.Dart(this);
    this.humanSigma = 0.030;   // a touch more scatter -> aim matters more

    // Menu selection.
    this.selMode = 'x01';
    this.selOpp = 'career';

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
    this.aiTimer = 0;
    this.isLadder = false;
    this.ladderRank = 0;

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

    this.state = 'menu';
    this.loop = new KD.Loop(this._update.bind(this), this._render.bind(this));
    this._bindMeta();
  }

  Game.prototype.start = function () {
    this.audio.startMusic();
    this.loop.start();
  };

  // Triggered by Dart.release(): the board lunges in a touch, then snaps back.
  Game.prototype.lungeBoard = function () { this._lungeT = this.LUNGE_DUR; };

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

    if (this.state === 'menu') this._updateMenu(dt);
    else if (this.state === 'play') this._updatePlay(dt);
    else if (this.state === 'turnEnd') this._updateTurnEnd(dt);
    else if (this.state === 'matchOver') this._updateMatchOver(dt);
    else if (this.state === 'pause') this._updatePause(dt);
    else if (this.state === 'workshop') this._updateWorkshop(dt);
    else if (this.state === 'leaderboard') this._updateLeaderboard(dt);

    // Board lunge spring (comes in fast, snaps back).
    if (this._lungeT > 0) {
      this._lungeT = Math.max(0, this._lungeT - dt);
      const u = 1 - this._lungeT / this.LUNGE_DUR;     // 0 -> 1
      this.boardScale = 1 + Math.sin(u * Math.PI) * 0.055;
    } else {
      this.boardScale = Util.lerp(this.boardScale, 1, 1 - Math.pow(0.001, dt));
    }

    // Ease slow-mo back to normal; animation systems run on scaled time.
    this.timeScale = Util.approach(this.timeScale, 1, dt * 2.2);
    const adt = dt * this.timeScale;
    this.particles.update(adt);
    this.camera.update(adt);
    if (this.dart.state === 'flying') { if (this.dart.update(adt)) this._onDartLand(); }

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
    const cx = VIEW_W / 2;
    // Mode toggle
    btns.push({ id: 'mode:x01', label: '501', x: cx - 150, y: 196, w: 140, h: 52, sel: this.selMode === 'x01', group: 'mode' });
    btns.push({ id: 'mode:cricket', label: 'CRICKET', x: cx + 10, y: 196, w: 140, h: 52, sel: this.selMode === 'cricket', group: 'mode' });
    // Opponent
    const opps = [['career', 'CAREER'], ['hotseat', '2P'], ['Rookie', 'ROOKIE'], ['Pro', 'PRO'], ['Legend', 'LEGEND']];
    const ow = 158, gap = 8, total = opps.length * ow + (opps.length - 1) * gap;
    let ox = cx - total / 2;
    opps.forEach((o) => {
      btns.push({ id: 'opp:' + o[0], label: o[1], x: ox, y: 304, w: ow, h: 46, sel: this.selOpp === o[0], group: 'opp' });
      ox += ow + gap;
    });
    // Play
    btns.push({ id: 'play', label: '▶  PLAY', x: cx - 130, y: 372, w: 260, h: 64, sel: false, group: 'play' });
    // Secondary nav: the Dart Workshop and the League Leaderboard.
    btns.push({ id: 'nav:workshop', label: '🎯  DART WORKSHOP', x: cx - 264, y: 456, w: 254, h: 54, sel: false, group: 'nav' });
    btns.push({ id: 'nav:leaderboard', label: '🏆  LEADERBOARD', x: cx + 10, y: 456, w: 254, h: 54, sel: false, group: 'nav' });
    return btns;
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
        else if (b.group === 'play') this._startMatch();
        else if (b.group === 'nav') {
          const dest = b.id.split(':')[1];
          this.state = dest;        // 'workshop' | 'leaderboard'
        }
        return;
      }
    }
  };

  // ---- Match setup -------------------------------------------------------
  Game.prototype._startMatch = function () {
    const prog = this.progression;
    const human = new KD.Player('You', prog.data.skins.equipped);
    human.dartParts = { tip: prog.data.darts.tip, flight: prog.data.darts.flight };
    let opp;
    this.isLadder = false;
    this.ladderRank = prog.data.ladderRank;

    if (this.selOpp === 'hotseat') {
      opp = new KD.Player('Guest', 'ember');
    } else if (this.selOpp === 'career') {
      const rung = KD.Progression.LADDER[prog.data.ladderRank];
      opp = new KD.AIPlayer(rung.name, rung.tier, rung.skin);
      this.isLadder = true;
    } else {
      opp = new KD.AIPlayer(this.selOpp + ' Bot', this.selOpp, 'violet');
    }
    // AIs throw themed darts too (neon tip + a flight chosen from their name).
    if (opp.isAI) opp.dartParts = { tip: 'neon', flight: 'shark' };
    else opp.dartParts = { tip: 'steel', flight: 'standard' };

    this.mode = this.selMode === 'x01' ? new KD.Mode_X01(501) : new KD.Mode_Cricket();
    this.players = [human, opp];
    this.players.forEach((pl) => {
      this.mode.initPlayer(pl);
      pl.dartsThrown = 0; pl.totalScored = 0; pl.t180 = 0; pl.legs = 0;
      // Digital-scoreboard juice state.
      pl._scorePop = 0; pl._shed = []; pl._shedFired = false; pl._digX = null; pl._digY = 0; pl._digH = 0; pl._popCol = '#39e6ff';
    });
    this.current = 0;
    this.dartsThisTurn = 0;
    this.stuckDarts = [];
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
        const pt = this.board.targetPoint(label);
        this.dart.skin = cur.skin();
        this.dart.parts = cur.dartParts || null;
        this.dart.setAI(pt.x, pt.y, cur.sigma);
        this.aiTimer = cur.thinkTime;
      } else if (this.dart.state === 'aiming') {
        this.aiTimer -= dt;
        if (this.aiTimer <= 0) this.dart.release();
      }
      return;
    }

    // Human — drag to aim, then SWIPE-RELEASE to throw (a tap won't throw).
    if (this.dart.state === 'ready') {
      if (p.justDown) { this.dart.skin = cur.skin(); this.dart.parts = cur.dartParts || null; this.dart.beginAim(p.x, p.y); this.dart.sigma = this.humanSigma; }
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

    this.audio.thud();
    const skinCol = cur.skin().color;
    // Stuck dart: tip lands exactly on the scoring point; lean varies by where
    // on the board it landed (+ a hair of jitter) so groups don't look stamped.
    const lean = -Math.PI * 0.78 + (lx - this.board.cx) / this.board.Rpx * 0.14
               + (Math.random() * 2 - 1) * 0.04;
    this.stuckDarts.push({ x: lx, y: ly, skin: cur.skin(), parts: cur.dartParts || null, ang: lean });
    cur.dartsThrown++;

    const out = this.mode.applyDart(cur, res, opp);
    this.dartsThisTurn++;

    // Floating score pop + scoring explosion (density scales with the score).
    const big = (res.ring === 'treble' && res.value === 20) || res.ring === 'inbull' || out.win;
    const burstCol = res.ring === 'treble' ? C.green
      : res.ring === 'double' ? C.gold
      : (res.ring === 'inbull' || res.ring === 'outbull') ? C.ember : skinCol;
    if (res.score > 0 || big) {
      this.particles.scoreBurst(lx, ly, burstCol, res.score, big);
      // Chunky "bricks" knocked off the segment — denser on the big hits.
      this.particles.bricks(lx, ly, burstCol, big ? 16 : Math.min(14, 6 + Math.round(res.score / 8)),
        { speed: big ? 300 : 220, size: big ? 9 : 7 });
      // Flag the active scoreboard to pop + shed its own digital bricks.
      cur._scorePop = 1; cur._popCol = burstCol;
      // Light up the exact segment that was hit.
      this.hitFlash = { res: res, life: 1, col: burstCol };
    } else {
      this.particles.impact(lx, ly, skinCol);  // a miss still throws splinters
    }
    // Haptic thump on phones that support it (denser for the big hits).
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(big ? [0, 16, 30, 22] : res.score > 0 ? 14 : 8); } catch (_) {}
    }
    this.camera.shake(big ? 0.22 : 0.12);
    this.particles.scorePop(lx, ly - 6, out.text, big,
      res.ring === 'treble' ? C.green : res.ring === 'double' ? C.gold : null);

    if (out.bust) {
      this.audio.bust();
      this.callout = { text: 'BUST', life: 1.3 };
      this._endTurn();
      return;
    }
    if (big) {
      this.timeScale = 0.4;
      this.camera.punchZoom(1.16, lx, ly);
      this.camera.shake(0.4);
      this.audio.chime(2);
    } else if (res.score > 0) {
      this.audio.chime(res.ring === 'treble' || res.value === 25 ? 1 : 0);
    }

    if (out.win) { this._matchWin(cur); return; }
    if (this.dartsThisTurn >= this.mode.dartsPerTurn) { this._endTurn(); return; }
    this.dart.reset();
  };

  Game.prototype._endTurn = function () {
    const cur = this.players[this.current];
    // Announcer for the completed turn.
    if (this.mode.id === 'x01') {
      const ts = cur.scoreState.turnScore;
      if (ts === 180) { cur.t180++; this.callout = { text: '180!', life: 1.6 }; this.audio.cheer(); }
      else if (ts >= 100) this.callout = { text: ts + '!', life: 1.3 };
    } else {
      const ts = cur.scoreState.turnScore;
      if (ts >= 60) this.callout = { text: '+' + ts, life: 1.2 };
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
    this.current = 1 - this.current;
    this.mode.beginTurn(this.players[this.current]);
    this.dartsThisTurn = 0;
    this.dart.reset();
    this.banner = '';
    this.state = 'play';
  };

  // ---- Match over --------------------------------------------------------
  Game.prototype._matchWin = function (winner) {
    this.state = 'matchOver';
    this.timeScale = 0.5;
    this.camera.punchZoom(1.1, this.board.cx, this.board.cy);
    this.particles.confetti(this.board.cx, this.board.cy);
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
    const xp = this.progression.recordMatch(result);
    this.matchResult = { winner: winner.name, won: won, xp: xp };
    this.matchOverTimer = 0.8;
  };

  Game.prototype._updateMatchOver = function (dt) {
    this.matchOverTimer -= dt;
    const p = this.input.pointer;
    if (this.matchOverTimer <= 0 && (p.justDown || this.input.justPressed('confirm'))) {
      this.state = 'menu';
    }
  };

  Game.prototype._updatePause = function () {
    if (this.input.justPressed('pause') || this.input.justPressed('confirm')) { this.state = 'play'; return; }
    const p = this.input.pointer;
    if (p.justDown) {
      // bottom button = quit to menu, else resume
      if (p.y > VIEW_H * 0.62) this.state = 'menu'; else this.state = 'play';
    }
  };

  // ====================================================================
  // RENDER
  // ====================================================================
  Game.prototype._render = function () {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);

    // Backdrop (Firefly image if provided, else procedural neon stage).
    if (this.sprites.has('bg.stage')) {
      const img = this.sprites.images['bg.stage'];
      ctx.drawImage(img, 0, 0, VIEW_W, VIEW_H);
      ctx.fillStyle = 'rgba(4,6,14,0.45)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    } else {
      this.sprites.drawBackdrop(ctx, VIEW_W, VIEW_H, this.time);
    }

    if (this.state === 'menu') { this._drawMenu(ctx); this._drawToasts(ctx); return; }
    if (this.state === 'workshop') { this._drawWorkshop(ctx); this._drawToasts(ctx); return; }
    if (this.state === 'leaderboard') { this._drawLeaderboard(ctx); this._drawToasts(ctx); return; }

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
    for (let i = 0; i < this.stuckDarts.length; i++) {
      const d = this.stuckDarts[i];
      this.sprites.drawStuckDart(ctx, d.x, d.y, d.skin, d.ang, d.parts);
    }
    this.dart.drawFlight(ctx);
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

  // ---- Menu render -------------------------------------------------------
  Game.prototype._neonButton = function (ctx, b) {
    const r = 12;
    ctx.save();
    const accent = b.group === 'play' ? C.green : b.group === 'nav' ? C.violet : C.cyan;
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
      this.sprites.drawDart(ctx, 46, KD.Sprites.SKINS[b.id.split(':')[1]], 0);
      ctx.restore();
      if (locked) {
        ctx.fillStyle = '#cfe9ff'; ctx.font = '11px "Space Grotesk", sans-serif';
        ctx.textAlign = 'center'; ctx.fillText('🔒', b.x + b.w / 2, b.y + b.h - 8);
      }
    } else {
      ctx.fillStyle = b.sel ? '#ffffff' : C.text;
      ctx.font = (b.group === 'play' ? 'bold 24px' : 'bold 16px') + ' "Space Grotesk", sans-serif';
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
    ctx.shadowColor = C.cyan; ctx.shadowBlur = 24;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 64px "Space Grotesk", sans-serif';
    ctx.fillText('KUDBEE DARTS', VIEW_W / 2, 110);
    ctx.shadowBlur = 0;
    ctx.fillStyle = C.violet;
    ctx.font = '15px "Space Grotesk", sans-serif';
    ctx.fillText('PREDICTIVE FLICK · 501 + CRICKET · CLIMB THE LEAGUE', VIEW_W / 2, 140);

    // Section labels.
    ctx.fillStyle = C.dim; ctx.font = 'bold 12px "Space Grotesk", sans-serif';
    ctx.fillText('GAME MODE', VIEW_W / 2, 182);
    ctx.fillText('OPPONENT', VIEW_W / 2, 290);
    ctx.restore();

    const btns = this._menuLayout();
    btns.forEach((b) => this._neonButton(ctx, b));

    // Equipped-loadout mini preview beside the PLAY button.
    const d = this.progression.data;
    const skin = KD.Sprites.SKINS[d.skins.equipped];
    ctx.save();
    ctx.translate(VIEW_W / 2, 530);
    ctx.rotate(-Math.PI * 0.12);
    this.sprites.drawDart(ctx, 120, skin, 0.4, d.darts);
    ctx.restore();
    ctx.save();
    ctx.textAlign = 'center'; ctx.fillStyle = C.dim;
    ctx.font = '11px "Space Grotesk", sans-serif';
    const tipN = (KD.Sprites.TIPS[d.darts.tip] || {}).name || d.darts.tip;
    const flN = (KD.Sprites.FLIGHTS[d.darts.flight] || {}).name || d.darts.flight;
    ctx.fillText(skin.name + ' · ' + tipN + ' · ' + flN, VIEW_W / 2, 566);
    ctx.restore();

    // Stats footer.
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = C.text; ctx.font = '14px "Space Grotesk", sans-serif';
    const rung = KD.Progression.LADDER[d.ladderRank];
    ctx.fillText('LV ' + d.level + '   ·   Streak ' + d.streak + ' (best ' + d.bestStreak + ')   ·   Coins ' + d.coins + '   ·   Next rival: ' + rung.name + ' (' + rung.tier + ')', VIEW_W / 2, 612);
    // XP bar.
    const bw = 320, bx = VIEW_W / 2 - bw / 2, by = 626;
    ctx.fillStyle = 'rgba(180,210,255,0.15)'; this._roundRect(ctx, bx, by, bw, 8, 4); ctx.fill();
    ctx.fillStyle = C.cyan; const f = Math.max(0, Math.min(1, d.xp / d.xpToNext));
    this._roundRect(ctx, bx, by, bw * f, 8, 4); ctx.fill();
    ctx.fillStyle = C.dim; ctx.font = '11px monospace';
    ctx.fillText(d.xp + ' / ' + d.xpToNext + ' XP', VIEW_W / 2, 652);
    ctx.fillStyle = C.dim; ctx.font = '12px "Space Grotesk", sans-serif';
    ctx.fillText('Drag to aim, then SWIPE-RELEASE to throw — flick speed sets power & curl. The checkout guide lights up your finish.', VIEW_W / 2, 686);
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
      ctx.beginPath(); ctx.arc(VIEW_W / 2 - 26 + i * 26, VIEW_H - 22, 6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = C.dim; ctx.font = '12px "Space Grotesk", sans-serif';
    ctx.fillText((cur.isAI ? cur.name + ' is throwing…' : 'DRAG TO AIM · FLICK TO THROW'), VIEW_W / 2, VIEW_H - 40);
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
    ctx.fillText(f.text, VIEW_W / 2, VIEW_H - 66 - (1 - f.life) * 14);
    ctx.restore();
    ctx.globalAlpha = 1; ctx.textAlign = 'left';
  };

  // A polished scoreboard card (left or right). Returns nothing; draws name,
  // avatar chip, the big primary readout, leg pips and an active-turn glow. The
  // cards sit BELOW the Studio back-link so the score is never covered.
  Game.prototype._scoreCard = function (ctx, pl, side, active, big, sub) {
    const W = 256, H = 96, M = 16, TOP = 44;
    const x = side === 'left' ? M : VIEW_W - M - W;
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
    const x = side === 'left' ? M : VIEW_W - M - PW;
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
    const a = Math.min(1, this.callout.life * 1.4);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.fillStyle = C.gold; ctx.shadowColor = C.gold; ctx.shadowBlur = 26;
    ctx.font = 'bold 72px "Space Grotesk", sans-serif';
    ctx.fillText(this.callout.text, VIEW_W / 2, VIEW_H * 0.5);
    ctx.restore();
    ctx.textAlign = 'left';
  };

  Game.prototype._drawBanner = function (ctx) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(5,6,15,0.7)';
    this._roundRect(ctx, VIEW_W / 2 - 220, VIEW_H - 150, 440, 56, 10); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 18px "Space Grotesk", sans-serif';
    ctx.fillText(this.banner, VIEW_W / 2, VIEW_H - 122);
    ctx.fillStyle = C.dim; ctx.font = '12px "Space Grotesk", sans-serif';
    ctx.fillText('tap to continue', VIEW_W / 2, VIEW_H - 104);
    ctx.restore();
    ctx.textAlign = 'left';
  };

  Game.prototype._drawMatchOver = function (ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(4,6,14,0.78)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    const r = this.matchResult;
    ctx.fillStyle = r.won ? C.green : C.ember;
    ctx.shadowColor = r.won ? C.green : C.ember; ctx.shadowBlur = 26;
    ctx.font = 'bold 72px "Space Grotesk", sans-serif';
    ctx.fillText(r.won ? 'YOU WIN!' : 'DEFEAT', VIEW_W / 2, VIEW_H / 2 - 30);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff'; ctx.font = '22px "Space Grotesk", sans-serif';
    ctx.fillText(r.winner + ' takes the leg', VIEW_W / 2, VIEW_H / 2 + 14);
    ctx.fillStyle = C.gold; ctx.font = 'bold 20px "Space Grotesk", sans-serif';
    ctx.fillText('+' + r.xp + ' XP', VIEW_W / 2, VIEW_H / 2 + 52);
    if (this.matchOverTimer <= 0) {
      ctx.fillStyle = C.dim; ctx.font = '14px "Space Grotesk", sans-serif';
      ctx.fillText('tap to return to the menu', VIEW_W / 2, VIEW_H / 2 + 96);
    }
    ctx.restore();
    ctx.textAlign = 'left';
  };

  Game.prototype._drawPause = function (ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(4,6,14,0.8)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
    ctx.font = 'bold 48px "Space Grotesk", sans-serif';
    ctx.fillText('PAUSED', VIEW_W / 2, VIEW_H / 2 - 30);
    ctx.font = '18px "Space Grotesk", sans-serif'; ctx.fillStyle = C.cyan;
    ctx.fillText('tap upper area to resume', VIEW_W / 2, VIEW_H / 2 + 30);
    ctx.fillStyle = C.ember;
    ctx.fillText('tap lower area to quit to menu', VIEW_W / 2, VIEW_H * 0.7);
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
      this._roundRect(ctx, VIEW_W / 2 - 130, y, 260, 46, 10); ctx.fill();
      ctx.strokeStyle = C.cyan; ctx.lineWidth = 1.5;
      this._roundRect(ctx, VIEW_W / 2 - 130, y, 260, 46, 10); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 16px "Space Grotesk", sans-serif';
      ctx.fillText(t.text, VIEW_W / 2, y + 20);
      if (t.sub) { ctx.fillStyle = C.green; ctx.font = '12px "Space Grotesk", sans-serif'; ctx.fillText(t.sub, VIEW_W / 2, y + 37); }
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
  Game.prototype._workshopLayout = function () {
    const prog = this.progression;
    const btns = [];
    btns.push({ id: 'back', label: '← BACK', x: 24, y: 72, w: 110, h: 40, group: 'back' });

    const row = (ids, kind, y, cw, gap, sel, owned, cost) => {
      const total = ids.length * cw + (ids.length - 1) * gap;
      let x = VIEW_W / 2 - total / 2;
      ids.forEach((id) => {
        btns.push({
          id: kind + ':' + id, group: kind, key: id, x: x, y: y, w: cw, h: 70,
          sel: sel(id), owned: owned(id), cost: cost(id),
        });
        x += cw + gap;
      });
    };

    row(['cyan', 'violet', 'green', 'gold', 'ember'], 'skin', 286, 132, 10,
      (id) => prog.data.skins.equipped === id, (id) => prog.owns(id), () => 0);
    row(Object.keys(KD.Sprites.TIPS), 'tip', 396, 132, 10,
      (id) => prog.data.darts.tip === id, (id) => prog.ownsTip(id), (id) => prog.tipCost(id));
    row(Object.keys(KD.Sprites.FLIGHTS), 'flight', 506, 108, 9,
      (id) => prog.data.darts.flight === id, (id) => prog.ownsFlight(id), (id) => prog.flightCost(id));
    return btns;
  };

  Game.prototype._updateWorkshop = function () {
    if (this.input.justPressed('back') || this.input.justPressed('pause')) { this.state = 'menu'; return; }
    const p = this.input.pointer;
    if (!p.justDown) return;
    const btns = this._workshopLayout();
    for (let i = 0; i < btns.length; i++) {
      const b = btns[i];
      if (p.x < b.x || p.x > b.x + b.w || p.y < b.y || p.y > b.y + b.h) continue;
      this.audio.tick();
      if (b.group === 'back') { this.state = 'menu'; return; }
      if (b.group === 'skin') {
        if (b.owned) { this.progression.equip(b.key); this.audio.chime(0); }
        else this.toasts.push({ text: 'LOCKED', sub: 'Level up or climb the ladder', life: 2.2 });
      } else if (b.group === 'tip') {
        const r = this.progression.chooseTip(b.key);
        if (r === 'poor') this.toasts.push({ text: 'NOT ENOUGH COINS', sub: 'Win matches to earn coins', life: 2.2 });
        else this.audio.chime(r === 'bought' ? 1 : 0);
      } else if (b.group === 'flight') {
        const r = this.progression.chooseFlight(b.key);
        if (r === 'poor') this.toasts.push({ text: 'NOT ENOUGH COINS', sub: 'Win matches to earn coins', life: 2.2 });
        else this.audio.chime(r === 'bought' ? 1 : 0);
      }
      return;
    }
  };

  Game.prototype._workshopChip = function (ctx, b) {
    const r = 12;
    const skinCol = (KD.Sprites.SKINS[b.key] || {}).color || C.cyan;
    const accent = b.group === 'skin' ? skinCol : C.cyan;
    ctx.save();
    ctx.globalAlpha = (!b.owned && b.group === 'skin') ? 0.4 : 1;
    ctx.fillStyle = b.sel ? 'rgba(57,230,255,0.13)' : 'rgba(10,16,32,0.6)';
    this._roundRect(ctx, b.x, b.y, b.w, b.h, r); ctx.fill();
    ctx.lineWidth = b.sel ? 2.5 : 1.2;
    ctx.strokeStyle = b.sel ? accent : 'rgba(180,210,255,0.2)';
    if (b.sel) { ctx.shadowColor = accent; ctx.shadowBlur = 14; }
    this._roundRect(ctx, b.x, b.y, b.w, b.h, r); ctx.stroke();
    ctx.shadowBlur = 0;

    const cx = b.x + b.w / 2;
    // Mini preview.
    if (b.group === 'skin') {
      ctx.save(); ctx.translate(cx, b.y + 28); ctx.rotate(-Math.PI * 0.18);
      this.sprites.drawDart(ctx, 70, KD.Sprites.SKINS[b.key], 0.3, this.progression.data.darts);
      ctx.restore();
    } else {
      const skin = KD.Sprites.SKINS[this.progression.data.skins.equipped];
      const parts = b.group === 'tip' ? { tip: b.key, flight: this.progression.data.darts.flight }
                                       : { tip: this.progression.data.darts.tip, flight: b.key };
      ctx.save(); ctx.translate(cx + 22, b.y + 28); ctx.rotate(Math.PI);
      this.sprites.drawDart(ctx, 78, skin, 0.2, parts);
      ctx.restore();
    }
    // Name.
    const cat = b.group === 'skin' ? KD.Sprites.SKINS : b.group === 'tip' ? KD.Sprites.TIPS : KD.Sprites.FLIGHTS;
    ctx.textAlign = 'center'; ctx.fillStyle = b.sel ? '#fff' : C.text;
    ctx.font = 'bold 12px "Space Grotesk", sans-serif';
    ctx.fillText((cat[b.key] || {}).name || b.key, cx, b.y + b.h - 18);
    // Status line: EQUIPPED / cost / OWNED / LOCKED.
    ctx.font = '11px "Space Grotesk", sans-serif';
    if (b.sel) { ctx.fillStyle = C.green; ctx.fillText('EQUIPPED', cx, b.y + b.h - 5); }
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
    ctx.fillText('DART WORKSHOP', VIEW_W / 2, 80);
    ctx.shadowBlur = 0;
    ctx.fillStyle = C.violet; ctx.font = '13px "Space Grotesk", sans-serif';
    ctx.fillText('CRAFT YOUR PERFECT DART · BARREL · TIP · FLIGHT', VIEW_W / 2, 104);

    // Coin balance (top-right).
    ctx.textAlign = 'right'; ctx.fillStyle = C.gold;
    ctx.font = 'bold 20px "Space Grotesk", sans-serif';
    ctx.fillText('🪙 ' + d.coins, VIEW_W - 24, 52);

    // Big live preview of the equipped loadout, gently bobbing + spinning.
    const skin = KD.Sprites.SKINS[d.skins.equipped];
    const bob = Math.sin(this.time * 1.6) * 6;
    ctx.save();
    ctx.translate(VIEW_W / 2, 180 + bob);
    ctx.rotate(-Math.PI * 0.12 + Math.sin(this.time * 0.8) * 0.05);
    // Glow pedestal.
    ctx.shadowColor = skin.color; ctx.shadowBlur = 30;
    this.sprites.drawDart(ctx, 300, skin, 0.6, d.darts);
    ctx.restore();

    // Section labels.
    ctx.textAlign = 'center'; ctx.fillStyle = C.dim; ctx.font = 'bold 12px "Space Grotesk", sans-serif';
    ctx.fillText('BARREL', VIEW_W / 2, 274);
    ctx.fillText('TIP', VIEW_W / 2, 384);
    ctx.fillText('FLIGHT', VIEW_W / 2, 494);
    ctx.restore();

    const btns = this._workshopLayout();
    btns.forEach((b) => {
      if (b.group === 'back') this._neonButton(ctx, { x: b.x, y: b.y, w: b.w, h: b.h, label: b.label, group: 'back', sel: false });
      else this._workshopChip(ctx, b);
    });
    ctx.fillStyle = C.dim; ctx.font = '12px "Space Grotesk", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Cosmetic only — every dart flies the same. Earn coins by winning matches.', VIEW_W / 2, VIEW_H - 24);
    ctx.textAlign = 'left';
  };

  // ====================================================================
  // LEADERBOARD — the Bullseye League standings (you vs. the AI ladder).
  // ====================================================================
  Game.prototype._leaderboardData = function () {
    const d = this.progression.data;
    const L = KD.Progression.LADDER;
    const rows = L.map((r, i) => ({
      name: r.name, tier: r.tier,
      rating: 1240 + i * 165,
      beaten: i < d.ladderRank,
      you: false,
    }));
    // Your rating reflects level, ladder progress, and streaks.
    const x01 = d.stats.x01, cri = d.stats.cricket;
    const wins = x01.won + cri.won;
    const youRating = 1180 + d.level * 38 + d.ladderRank * 150 + d.bestStreak * 22 + wins * 6;
    rows.push({ name: 'You', tier: 'Player', rating: youRating, you: true, beaten: false });
    rows.sort((a, b) => b.rating - a.rating);
    return rows;
  };

  Game.prototype._updateLeaderboard = function () {
    if (this.input.justPressed('back') || this.input.justPressed('pause')) { this.state = 'menu'; return; }
    const p = this.input.pointer;
    if (p.justDown) {
      if (p.y < 80 && p.x < 150) { this.state = 'menu'; return; }   // back hit-zone
      this.state = 'menu';
    }
  };

  Game.prototype._drawLeaderboard = function (ctx) {
    const d = this.progression.data;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.shadowColor = C.gold; ctx.shadowBlur = 20; ctx.fillStyle = '#fff';
    ctx.font = 'bold 44px "Space Grotesk", sans-serif';
    ctx.fillText('BULLSEYE LEAGUE', VIEW_W / 2, 80);
    ctx.shadowBlur = 0;
    ctx.fillStyle = C.violet; ctx.font = '13px "Space Grotesk", sans-serif';
    ctx.fillText('SEASON STANDINGS · CLIMB THE RANKS', VIEW_W / 2, 104);
    ctx.restore();

    this._neonButton(ctx, { x: 24, y: 72, w: 110, h: 40, label: '← BACK', group: 'back', sel: false });

    // Standings table.
    const rows = this._leaderboardData();
    const tx = 70, tw = 520, rh = 44, top = 150;
    ctx.save();
    ctx.textAlign = 'left'; ctx.fillStyle = C.dim; ctx.font = 'bold 11px "Space Grotesk", sans-serif';
    ctx.fillText('#', tx + 6, top - 10);
    ctx.fillText('PLAYER', tx + 44, top - 10);
    ctx.fillText('TIER', tx + 300, top - 10);
    ctx.textAlign = 'right'; ctx.fillText('RATING', tx + tw - 14, top - 10);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const y = top + i * rh;
      ctx.fillStyle = r.you ? 'rgba(124,255,178,0.12)' : (i % 2 ? 'rgba(255,255,255,0.03)' : 'rgba(10,16,32,0.5)');
      this._roundRect(ctx, tx, y, tw, rh - 6, 8); ctx.fill();
      if (r.you) {
        ctx.lineWidth = 2; ctx.strokeStyle = C.green; ctx.shadowColor = C.green; ctx.shadowBlur = 12;
        this._roundRect(ctx, tx, y, tw, rh - 6, 8); ctx.stroke(); ctx.shadowBlur = 0;
      }
      const cy = y + (rh - 6) / 2 + 1;
      ctx.textBaseline = 'middle';
      // Rank with medal tint for the top 3.
      ctx.textAlign = 'center';
      ctx.fillStyle = i === 0 ? C.gold : i === 1 ? '#cdd9e6' : i === 2 ? '#d59a5a' : C.dim;
      ctx.font = 'bold 16px "Space Grotesk", sans-serif';
      ctx.fillText('' + (i + 1), tx + 22, cy);
      // Name.
      ctx.textAlign = 'left';
      ctx.fillStyle = r.you ? C.green : '#fff';
      ctx.font = 'bold 16px "Space Grotesk", sans-serif';
      ctx.fillText(r.name + (r.beaten ? '  ✓' : ''), tx + 44, cy);
      // Tier.
      ctx.fillStyle = C.dim; ctx.font = '13px "Space Grotesk", sans-serif';
      ctx.fillText(r.tier, tx + 300, cy);
      // Rating.
      ctx.textAlign = 'right'; ctx.fillStyle = r.you ? C.green : C.cyan;
      ctx.font = 'bold 16px "Space Grotesk", monospace';
      ctx.fillText('' + r.rating, tx + tw - 14, cy);
      ctx.textBaseline = 'alphabetic';
    }
    ctx.restore();

    // Your stats card (right column).
    const sx = 640, sw = VIEW_W - sx - 40, sy = 150;
    ctx.save();
    ctx.fillStyle = 'rgba(8,12,26,0.66)';
    this._roundRect(ctx, sx, sy, sw, 360, 14); ctx.fill();
    ctx.strokeStyle = 'rgba(180,210,255,0.18)'; ctx.lineWidth = 1.2;
    this._roundRect(ctx, sx, sy, sw, 360, 14); ctx.stroke();
    ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = 'bold 18px "Space Grotesk", sans-serif';
    ctx.fillText('YOUR CAREER', sx + 20, sy + 32);
    const x01 = d.stats.x01, cri = d.stats.cricket;
    const pct = (w, p) => p ? (w / p * 100).toFixed(1) + '%' : '—';
    const lines = [
      ['Level', 'LV ' + d.level],
      ['Win streak', d.streak + '  (best ' + d.bestStreak + ')'],
      ['501 record', x01.won + 'W / ' + (x01.played - x01.won) + 'L  · ' + pct(x01.won, x01.played)],
      ['Cricket record', cri.won + 'W / ' + (cri.played - cri.won) + 'L  · ' + pct(cri.won, cri.played)],
      ['180s thrown', '' + x01.total180s],
      ['Best checkout', x01.bestCheckout ? '' + x01.bestCheckout : '—'],
      ['Ladder rank', (d.ladderRank + 1) + ' / ' + KD.Progression.LADDER.length],
      ['Coins', '🪙 ' + d.coins],
    ];
    for (let i = 0; i < lines.length; i++) {
      const y = sy + 70 + i * 36;
      ctx.fillStyle = C.dim; ctx.font = '13px "Space Grotesk", sans-serif';
      ctx.fillText(lines[i][0], sx + 20, y);
      ctx.textAlign = 'right'; ctx.fillStyle = C.text; ctx.font = 'bold 14px "Space Grotesk", sans-serif';
      ctx.fillText(lines[i][1], sx + sw - 20, y);
      ctx.textAlign = 'left';
    }
    ctx.restore();

    ctx.fillStyle = C.dim; ctx.font = '12px "Space Grotesk", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Beat the rival above you in Career to climb · tap anywhere or BACK to return', VIEW_W / 2, VIEW_H - 24);
    ctx.textAlign = 'left';
  };

  KD.Game = Game;
})(window.KD = window.KD || {});
