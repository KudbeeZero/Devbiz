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
  Audio.prototype.whoosh = function () { this._noise(0.18, 0.12, 500, 2000); };
  Audio.prototype.woodThud = function (power) {
    this._tone(120 + power * 60, 0.12, 'triangle', 0.25 + power * 0.2, 70);
    this._noise(0.08, 0.2, 400, 1200);
  };
  Audio.prototype.skid = function () { this._noise(0.22, 0.1, 1500, 4000); };
  Audio.prototype.holeDrop = function () {
    this._tone(300, 0.18, 'sine', 0.3, 90);   // hollow descending clunk
    this._noise(0.1, 0.15, 600, 2000);
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
    this.reset();
  }
  Game.prototype.reset = function () {
    this.bag = { x: 150, y: GROUND_Y - BAG, vx: 0, vy: 0, spin: 0, rot: 0, air: true, squash: 0, skid: 0, rest: false, gone: false };
    this.aiming = false; this.power = 0; this.aimAng = -0.4;
    this.score = 0; this.round = 0; this.maxRounds = 8; this.bagsLeft = 8;
    this.phase = 'aim';          // aim | fly | settle
    this.banner = ''; this.flash = 0; this.shake = 0; this.lastPts = 0; this._scorePops = [];
  };
  Game.prototype.start = function () { this._last = performance.now() / 1000; requestAnimationFrame(this._frame.bind(this)); };

  Game.prototype._frame = function () {
    const now = performance.now() / 1000; let dt = Math.min(0.05, now - this._last); this._last = now; this.time += dt;
    this.update(dt); this.render(); this.input.endFrame();
    requestAnimationFrame(this._frame.bind(this));
  };

  Game.prototype.update = function (dt) {
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 1.5);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 2);
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

  Game.prototype._score = function (pts) {
    this.score += pts; this.lastPts = pts; this.flash = 1; this.shake = pts >= 3 ? 0.4 : 0.15;
    if (pts >= 3) this.audio.holeDrop(); this.audio.scoreJingle(pts);
    this.bag.gone = true;
    this._scorePops.push({ x: this.bag.x, y: this.bag.y - 20, text: '+' + pts, life: 1.4, col: pts >= 3 ? C.gold : C.green, vy: -40 });
    if (pts >= 3) { this.phase = 'settle'; this.bag.vx = 0; this.bag.vy = 0; }
  };

  Game.prototype._finalizeThrow = function () {
    const b = this.bag;
    const onBoard = b.rest === 'board' && !b.gone;
    if (onBoard && b.x > BOARD_X - BAG && b.x < BOARD_X + BOARD_W + BAG) {
      this._score(1);    // stuck on the board = 1 pt
    }
    // next throw
    this.bagsLeft--; this.round++;
    if (this.bagsLeft <= 0 || this.score >= 21) { this.state = 'over'; this.audio.scoreJingle(1); return; }
    this._resetBag();
  };

  Game.prototype._resetBag = function () {
    this.bag = { x: 150, y: GROUND_Y - BAG, vx: 0, vy: 0, spin: 0, rot: 0, air: true, squash: 0, skid: 0, rest: false, gone: false };
    this.phase = 'aim'; this.power = 0;
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
    else { this._drawHUD(ctx); this._drawBag(ctx); this._drawScorePops(ctx); }
    if (this.state === 'over') this._drawOver(ctx);
    if (this.flash > 0) { ctx.fillStyle = 'rgba(255,211,77,' + (this.flash * 0.25).toFixed(2) + ')'; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
    ctx.restore();
  };

  Game.prototype._drawScene = function (ctx) {
    // sky gradient
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, '#10132a'); g.addColorStop(0.6, '#0a0d1c'); g.addColorStop(1, '#070a14');
    ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    // ground
    ctx.fillStyle = '#0c1020'; ctx.fillRect(0, GROUND_Y, VIEW_W, VIEW_H - GROUND_Y);
    ctx.strokeStyle = 'rgba(255,160,60,0.25)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, GROUND_Y); ctx.lineTo(VIEW_W, GROUND_Y); ctx.stroke();
    // board (side view): angled platform
    const topY = GROUND_Y - BOARD_H;
    ctx.fillStyle = '#3a2410';
    ctx.fillRect(BOARD_X, topY, BOARD_W, BOARD_T);
    ctx.fillStyle = '#5a3820';
    ctx.fillRect(BOARD_X, topY, BOARD_W, 4);
    // neon trim
    ctx.strokeStyle = C.ember; ctx.lineWidth = 2; ctx.shadowColor = C.ember; ctx.shadowBlur = 10;
    ctx.strokeRect(BOARD_X, topY, BOARD_W, BOARD_T); ctx.shadowBlur = 0;
    // legs
    ctx.fillStyle = '#2a1a0c';
    ctx.fillRect(BOARD_X + 8, topY + BOARD_T, 8, BOARD_H * 0.5);
    ctx.fillRect(BOARD_X + BOARD_W - 16, topY + BOARD_T, 8, BOARD_H * 0.5);
    // hole (drawn as dark ellipse)
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(HOLE_X, topY + 4, HOLE_R, 8, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = C.gold; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(HOLE_X, topY + 4, HOLE_R, 8, 0, 0, TAU); ctx.stroke();
    // power target marker under hole
    ctx.fillStyle = C.dim; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('3 pts', HOLE_X, topY - 10); ctx.textAlign = 'left';
  };

  Game.prototype._drawBag = function (ctx) {
    const b = this.bag;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.rot);
    // squash: compress vertically on impact, bulge horizontally
    const sq = b.squash || 0;
    const sxw = 1 + sq * 0.45, syh = 1 - sq * 0.5;
    ctx.scale(sxw, syh);
    // bag body (square, fabric look)
    ctx.fillStyle = '#c46b2a';
    ctx.fillRect(-BAG, -BAG, BAG * 2, BAG * 2);
    ctx.fillStyle = '#a85520';
    ctx.fillRect(-BAG, -BAG, BAG * 2, BAG * 0.5);
    // neon stitch
    ctx.strokeStyle = C.gold; ctx.lineWidth = 1.5; ctx.shadowColor = C.gold; ctx.shadowBlur = 6;
    ctx.strokeRect(-BAG + 3, -BAG + 3, BAG * 2 - 6, BAG * 2 - 6);
    ctx.shadowBlur = 0;
    // fold line (scrunched detail)
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-BAG * 0.5, -BAG * 0.4); ctx.lineTo(BAG * 0.6, BAG * 0.5); ctx.stroke();
    ctx.restore();
    // aim guide while aiming
    if (this.aiming) {
      ctx.strokeStyle = C.gold; ctx.lineWidth = 2; ctx.globalAlpha = 0.7; ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + Math.cos(this.aimAng) * this.power * 180, b.y + Math.sin(this.aimAng) * this.power * 180); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      // power arc
      ctx.fillStyle = this.power > 0.7 ? C.ember : C.cyan; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(Math.round(this.power * 100) + '%', b.x, b.y - BAG - 10); ctx.textAlign = 'left';
    }
  };

  Game.prototype._drawHUD = function (ctx) {
    ctx.fillStyle = C.text; ctx.font = 'bold 26px "Space Grotesk",monospace'; ctx.textAlign = 'left';
    ctx.fillText('Score ' + this.score, 16, 36);
    ctx.font = '14px "Space Grotesk",sans-serif'; ctx.fillStyle = C.dim;
    ctx.fillText('Bags left: ' + this.bagsLeft, 16, 56);
    // throw line marker
    ctx.fillStyle = 'rgba(255,160,60,0.4)';
    ctx.fillRect(120, GROUND_Y - 80, 4, 80);
  };

  Game.prototype._drawScorePops = function (ctx) {
    ctx.textAlign = 'center';
    for (const p of this._scorePops) {
      const a = KC.Util.clamp(p.life / 1.4, 0, 1);
      ctx.globalAlpha = a; ctx.font = 'bold 30px "Space Grotesk",sans-serif';
      ctx.fillStyle = p.col; ctx.shadowColor = p.col; ctx.shadowBlur = 16;
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.textAlign = 'left';
  };

  Game.prototype._drawMenu = function (ctx) {
    ctx.fillStyle = C.text; ctx.font = 'bold 40px "Space Grotesk",sans-serif'; ctx.textAlign = 'center'; ctx.shadowColor = C.ember; ctx.shadowBlur = 20;
    ctx.fillText('CORNHOLE', VIEW_W / 2, 200); ctx.shadowBlur = 0;
    ctx.font = 'bold 18px "Space Grotesk",sans-serif'; ctx.fillStyle = C.dim; ctx.fillText('Neon Bag Toss', VIEW_W / 2, 230);
    ctx.font = '16px "Space Grotesk",sans-serif'; ctx.fillStyle = C.text;
    ctx.fillText('Drag back from the bag & release to throw', VIEW_W / 2, 320);
    ctx.fillText('Hole = 3 pts  ·  Board = 1 pt  ·  First to 21 wins', VIEW_W / 2, 348);
    ctx.fillStyle = C.gold; ctx.font = 'bold 22px "Space Grotesk",sans-serif';
    const pulse = 0.6 + 0.4 * Math.sin(this.time * 4);
    ctx.globalAlpha = pulse; ctx.fillText('click to play', VIEW_W / 2, 440); ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  };

  Game.prototype._drawOver = function (ctx) {
    ctx.fillStyle = 'rgba(5,5,15,0.85)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = C.text; ctx.font = 'bold 38px "Space Grotesk",sans-serif'; ctx.textAlign = 'center'; ctx.shadowColor = C.gold; ctx.shadowBlur = 20;
    ctx.fillText('GAME OVER', VIEW_W / 2, VIEW_H / 2 - 40); ctx.shadowBlur = 0;
    ctx.font = 'bold 28px "Space Grotesk",sans-serif'; ctx.fillStyle = C.green;
    ctx.fillText('Score: ' + this.score, VIEW_W / 2, VIEW_H / 2 + 10);
    ctx.fillStyle = C.dim; ctx.font = '16px "Space Grotesk",sans-serif';
    ctx.fillText('click to play again', VIEW_W / 2, VIEW_H / 2 + 60);
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
