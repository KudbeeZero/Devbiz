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
    this.humanSigma = 0.024;

    // Menu selection.
    this.selMode = 'x01';
    this.selOpp = 'career';

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

    // Ease slow-mo back to normal; animation systems run on scaled time.
    this.timeScale = Util.approach(this.timeScale, 1, dt * 2.2);
    const adt = dt * this.timeScale;
    this.particles.update(adt);
    this.camera.update(adt);
    if (this.dart.state === 'flying') { if (this.dart.update(adt)) this._onDartLand(); }

    if (this.callout) { this.callout.life -= dt; if (this.callout.life <= 0) this.callout = null; }
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      this.toasts[i].life -= dt;
      if (this.toasts[i].life <= 0) this.toasts.splice(i, 1);
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
    btns.push({ id: 'play', label: '▶  PLAY', x: cx - 130, y: 380, w: 260, h: 64, sel: false, group: 'play' });
    // Skins
    const skinIds = ['cyan', 'violet', 'green', 'gold', 'ember'];
    const sw = 96, sg = 12, st = skinIds.length * sw + (skinIds.length - 1) * sg;
    let sx = cx - st / 2;
    skinIds.forEach((id) => {
      btns.push({ id: 'skin:' + id, label: id, x: sx, y: 498, w: sw, h: 74, sel: this.progression.data.skins.equipped === id, owned: this.progression.owns(id), group: 'skin' });
      sx += sw + sg;
    });
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
        else if (b.group === 'skin') {
          const id = b.id.split(':')[1];
          if (b.owned) this.progression.equip(id);
        }
        return;
      }
    }
  };

  // ---- Match setup -------------------------------------------------------
  Game.prototype._startMatch = function () {
    const prog = this.progression;
    const human = new KD.Player('You', prog.data.skins.equipped);
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

    this.mode = this.selMode === 'x01' ? new KD.Mode_X01(501) : new KD.Mode_Cricket();
    this.players = [human, opp];
    this.players.forEach((pl) => {
      this.mode.initPlayer(pl);
      pl.dartsThrown = 0; pl.totalScored = 0; pl.t180 = 0; pl.legs = 0;
    });
    this.current = 0;
    this.dartsThisTurn = 0;
    this.stuckDarts = [];
    this.dart.reset();
    this.mode.beginTurn(this.players[0]);
    this.matchResult = null;
    this.banner = '';
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
        this.dart.setAI(pt.x, pt.y, cur.sigma);
        this.aiTimer = cur.thinkTime;
      } else if (this.dart.state === 'aiming') {
        this.aiTimer -= dt;
        if (this.aiTimer <= 0) this.dart.release();
      }
      return;
    }

    // Human.
    if (this.dart.state === 'ready') {
      if (p.justDown) { this.dart.skin = cur.skin(); this.dart.beginAim(p.x, p.y); this.dart.sigma = this.humanSigma; }
    } else if (this.dart.state === 'aiming') {
      if (p.down) this.dart.updateAim(p.x, p.y, dt);
      if (p.justUp) this.dart.release();
    }
  };

  // Resolve a landed dart: score it, fire effects, advance the turn.
  Game.prototype._onDartLand = function () {
    const res = this.dart.result;
    const cur = this.players[this.current];
    const opp = this.players[1 - this.current];
    const lx = this.dart.landX, ly = this.dart.landY;

    this.audio.thud();
    this.particles.impact(lx, ly, cur.skin().color);
    this.camera.shake(0.14);
    this.stuckDarts.push({ x: lx, y: ly, skin: cur.skin() });
    cur.dartsThrown++;

    const out = this.mode.applyDart(cur, res, opp);
    this.dartsThisTurn++;

    // Floating score pop + chime.
    const big = (res.ring === 'treble' && res.value === 20) || res.ring === 'inbull' || out.win;
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

    // World (board + darts + fx) under the camera transform.
    ctx.save();
    this.camera.apply(ctx);
    this.board.draw(ctx);
    for (let i = 0; i < this.stuckDarts.length; i++) {
      const d = this.stuckDarts[i];
      this.sprites.drawStuckDart(ctx, d.x, d.y, d.skin);
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
    const accent = b.group === 'play' ? C.green : C.cyan;
    const locked = b.group === 'skin' && !b.owned;
    let col = b.sel ? accent : 'rgba(180,210,255,0.25)';
    if (b.group === 'skin') col = (KD.Sprites.SKINS[b.id.split(':')[1]] || {}).color || C.cyan;
    ctx.globalAlpha = locked ? 0.3 : 1;

    ctx.fillStyle = b.sel ? 'rgba(57,230,255,0.14)' : 'rgba(10,16,32,0.55)';
    if (b.group === 'play') ctx.fillStyle = 'rgba(124,255,178,0.16)';
    this._roundRect(ctx, b.x, b.y, b.w, b.h, r);
    ctx.fill();
    ctx.lineWidth = b.sel ? 2.5 : 1.5;
    ctx.strokeStyle = col;
    if (b.sel) { ctx.shadowColor = col; ctx.shadowBlur = 14; }
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
    ctx.fillText('DART SKIN', VIEW_W / 2, 486);
    ctx.restore();

    const btns = this._menuLayout();
    btns.forEach((b) => this._neonButton(ctx, b));

    // Stats footer.
    const d = this.progression.data;
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
    ctx.fillText('Drag from the board to aim · release to throw · the reticle shows where it lands', VIEW_W / 2, 686);
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
    ctx.fillText((cur.isAI ? cur.name + ' is throwing…' : 'YOUR THROW'), VIEW_W / 2, VIEW_H - 40);
    ctx.restore();
    ctx.textAlign = 'left';
  };

  Game.prototype._playerPanel = function (ctx, pl, x, active, align) {
    ctx.save();
    ctx.textAlign = align;
    ctx.fillStyle = active ? '#ffffff' : C.dim;
    ctx.font = 'bold 16px "Space Grotesk", sans-serif';
    if (active) { ctx.shadowColor = pl.skin().color; ctx.shadowBlur = 10; }
    ctx.fillText(pl.name + (pl.isAI ? '' : ''), x, 34);
    ctx.shadowBlur = 0;
    ctx.restore();
  };

  Game.prototype._drawHUDx01 = function (ctx) {
    const p1 = this.players[0], p2 = this.players[1];
    ctx.save();
    this._playerPanel(ctx, p1, 24, this.current === 0, 'left');
    this._playerPanel(ctx, p2, VIEW_W - 24, this.current === 1, 'right');
    // Big remaining scores.
    ctx.font = 'bold 52px "Space Grotesk", sans-serif';
    ctx.fillStyle = this.current === 0 ? C.cyan : C.text; ctx.textAlign = 'left';
    if (this.current === 0) { ctx.shadowColor = C.cyan; ctx.shadowBlur = 14; }
    ctx.fillText(this.mode.summary(p1), 24, 86); ctx.shadowBlur = 0;
    ctx.fillStyle = this.current === 1 ? C.cyan : C.text; ctx.textAlign = 'right';
    if (this.current === 1) { ctx.shadowColor = C.cyan; ctx.shadowBlur = 14; }
    ctx.fillText(this.mode.summary(p2), VIEW_W - 24, 86); ctx.shadowBlur = 0;
    // Checkout hint for human.
    const cur = this.players[this.current];
    if (!cur.isAI) {
      const hint = this.mode.checkoutHint(cur, this.mode.dartsPerTurn - this.dartsThisTurn);
      if (hint) {
        ctx.textAlign = this.current === 0 ? 'left' : 'right';
        ctx.fillStyle = C.green; ctx.font = '13px "Space Grotesk", monospace';
        ctx.fillText('checkout: ' + hint, this.current === 0 ? 24 : VIEW_W - 24, 106);
      }
    }
    ctx.restore();
    ctx.textAlign = 'left';
  };

  Game.prototype._drawHUDcricket = function (ctx) {
    const p1 = this.players[0], p2 = this.players[1];
    this._playerPanel(ctx, p1, 24, this.current === 0, 'left');
    this._playerPanel(ctx, p2, VIEW_W - 24, this.current === 1, 'right');
    ctx.save();
    ctx.textAlign = 'left'; ctx.fillStyle = C.text; ctx.font = 'bold 20px "Space Grotesk", sans-serif';
    ctx.fillText(p1.scoreState.points + '', 24, 60);
    ctx.textAlign = 'right'; ctx.fillText(p2.scoreState.points + '', VIEW_W - 24, 60);

    // Compact marks ledger, top-center.
    const nums = KD.Mode_Cricket.NUMBERS;
    const rowH = 22, x0 = VIEW_W / 2, top = 28;
    ctx.font = '14px "Space Grotesk", monospace';
    for (let i = 0; i < nums.length; i++) {
      const n = nums[i];
      const y = top + i * rowH;
      ctx.textAlign = 'center'; ctx.fillStyle = C.dim;
      ctx.fillText(n === 25 ? 'B' : '' + n, x0, y);
      ctx.textAlign = 'right'; ctx.fillStyle = C.cyan;
      ctx.fillText(this._marks(p1.scoreState.marks[n]), x0 - 22, y);
      ctx.textAlign = 'left'; ctx.fillStyle = C.violet;
      ctx.fillText(this._marks(p2.scoreState.marks[n]), x0 + 22, y);
    }
    ctx.restore();
    ctx.textAlign = 'left';
  };

  Game.prototype._marks = function (m) {
    return m >= 3 ? '⊗' : m === 2 ? '✕' : m === 1 ? '╱' : '·';
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

  KD.Game = Game;
})(window.KD = window.KD || {});
