/* =====================================================================
 * Kudbee Darts — entities/dart.js
 * The throw: a Darts-of-Fury-style aim with a LIVE predictive reticle, a
 * timing-reward wobble, and a believable scatter on release. The cosmetic
 * 2.5D flight is just animation — the LANDING POINT is what scores (via
 * Board.hitTest), so prediction and result share one function.
 *
 * Feel:
 *   - Aim: the reticle follows the pointer, clamped to the board.
 *   - Wobble: a small Lissajous jitter whose amplitude GROWS the longer you
 *     hover — so a quick, committed throw is rewarded.
 *   - Release: landing = aim + wobble(at release) + Gaussian scatter(sigma).
 *     Human sigma is small (skill-assisted); AI sigma comes from difficulty.
 * ===================================================================== */
(function (KD) {
  'use strict';
  const Util = KD.Util;

  // Wobble tuning.
  const WOBBLE_BASE = 0.006;   // board-radius units at t=0
  const WOBBLE_GROW = 0.020;   // per second of hover
  const WOBBLE_MAX = 0.060;
  const W1 = 7.3, W2 = 5.1;    // Lissajous frequencies (rad/s)

  const FLIGHT_TIME = 0.34;    // seconds, cosmetic

  function Dart(game) {
    this.game = game;
    this.state = 'ready';      // ready | aiming | flying | done
    this.aimX = 0; this.aimY = 0;
    this.holdT = 0;
    this.wobAmp = WOBBLE_BASE;
    this.sigma = 0.022;        // landing scatter (board-radius units)
    this.isAI = false;

    // flight
    this._ft = 0;
    this._fromX = 0; this._fromY = 0;
    this.landX = 0; this.landY = 0;
    this.result = null;
    this.skin = null;
  }

  Dart.prototype.reset = function () {
    this.state = 'ready';
    this.holdT = 0;
    this.wobAmp = WOBBLE_BASE;
    this.result = null;
    this._ft = 0;
  };

  // Clamp an arbitrary point to lie within the playable board disc.
  Dart.prototype._clampToBoard = function (x, y) {
    const b = this.game.board;
    const dx = x - b.cx, dy = y - b.cy;
    const maxR = b.Rpx * KD.Board.R.dblOuter * 1.02;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > maxR) { x = b.cx + dx / d * maxR; y = b.cy + dy / d * maxR; }
    return { x: x, y: y };
  };

  // ---- Human aiming ------------------------------------------------------
  Dart.prototype.beginAim = function (px, py) {
    const p = this._clampToBoard(px, py);
    this.aimX = p.x; this.aimY = p.y;
    this.holdT = 0;
    this.wobAmp = WOBBLE_BASE;
    this.isAI = false;
    this.state = 'aiming';
  };

  Dart.prototype.updateAim = function (px, py, dt) {
    const p = this._clampToBoard(px, py);
    // Ease toward the pointer for a weighty feel.
    this.aimX = Util.lerp(this.aimX, p.x, 1 - Math.pow(0.0001, dt));
    this.aimY = Util.lerp(this.aimY, p.y, 1 - Math.pow(0.0001, dt));
    this.holdT += dt;
    this.wobAmp = Math.min(WOBBLE_MAX, WOBBLE_BASE + this.holdT * WOBBLE_GROW);
  };

  // ---- AI aiming ---------------------------------------------------------
  Dart.prototype.setAI = function (targetX, targetY, sigma) {
    this.aimX = targetX; this.aimY = targetY;
    this.sigma = sigma;
    this.wobAmp = WOBBLE_BASE; // AI steadiness modelled purely by sigma
    this.holdT = 0;
    this.isAI = true;
    this.state = 'aiming';
  };

  // Current wobble offset (board-radius units -> pixels).
  Dart.prototype._wobble = function (t) {
    const a = this.wobAmp * this.game.board.Rpx;
    return { x: Math.sin(t * W1) * a, y: Math.cos(t * W2) * a };
  };

  // Predicted landing BEFORE scatter — drives the reticle + label.
  Dart.prototype.predict = function () {
    const w = this.isAI ? { x: 0, y: 0 } : this._wobble(this.game.time);
    return { x: this.aimX + w.x, y: this.aimY + w.y };
  };

  // ---- Release -----------------------------------------------------------
  Dart.prototype.release = function () {
    const p = this.predict();
    const Rpx = this.game.board.Rpx;
    const sx = Util.gaussian() * this.sigma * Rpx;
    const sy = Util.gaussian() * this.sigma * Rpx;
    this.landX = p.x + sx;
    this.landY = p.y + sy;
    this.result = this.game.board.hitTest(this.landX, this.landY);

    // Cosmetic flight: from the oche (bottom-center) up to the landing point.
    this._fromX = this.game.viewW / 2;
    this._fromY = this.game.viewH - 30;
    this._ft = 0;
    this.state = 'flying';
    this.game.audio.whoosh();
    return this.result;
  };

  Dart.prototype.update = function (dt) {
    if (this.state !== 'flying') return false;
    this._ft += dt;
    if (this._ft >= FLIGHT_TIME) {
      this.state = 'done';
      return true; // signals arrival to the game
    }
    return false;
  };

  // ---- Rendering ---------------------------------------------------------
  // The animated predictive reticle + live score label.
  Dart.prototype.drawReticle = function (ctx) {
    if (this.state !== 'aiming') return;
    const p = this.predict();
    const res = this.game.board.hitTest(p.x, p.y);
    const t = this.game.time;
    const pulse = 0.5 + 0.5 * Math.sin(t * 6);
    const col = res.ring === 'treble' ? '#7CFFb2'
      : res.ring === 'double' ? '#ffd34d'
      : (res.ring === 'inbull' || res.ring === 'outbull') ? '#ff5d3c'
      : '#39e6ff';

    ctx.save();
    ctx.shadowColor = col; ctx.shadowBlur = 14;
    ctx.strokeStyle = col; ctx.lineWidth = 2;
    // Outer ring (wobble indicator: bigger = shakier).
    const rr = 16 + this.wobAmp * this.game.board.Rpx * 1.4;
    ctx.globalAlpha = 0.5 + 0.4 * pulse;
    ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, Math.PI * 2); ctx.stroke();
    // Crosshair.
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(p.x - 12, p.y); ctx.lineTo(p.x + 12, p.y);
    ctx.moveTo(p.x, p.y - 12); ctx.lineTo(p.x, p.y + 12);
    ctx.stroke();
    // Center dot.
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2); ctx.fill();
    // Live label.
    if (!this.isAI) {
      ctx.globalAlpha = 1;
      ctx.font = 'bold 18px "Space Grotesk", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = col;
      ctx.fillText(res.label + (res.score ? '  ' + res.score : ''), p.x, p.y - rr - 10);
    }
    ctx.restore();
  };

  // The cosmetic dart flying toward the board, scaling for depth.
  Dart.prototype.drawFlight = function (ctx) {
    if (this.state !== 'flying') return;
    const k = this._ft / FLIGHT_TIME;
    const e = Util.smooth(k);
    const x = Util.lerp(this._fromX, this.landX, e);
    // Parabolic lift so it arcs in.
    const baseY = Util.lerp(this._fromY, this.landY, e);
    const y = baseY - Math.sin(k * Math.PI) * 60;
    const scale = Util.lerp(1.4, 0.5, e);
    const ang = Math.atan2(this.landY - this._fromY, this.landX - this._fromX);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    this.game.sprites.drawDart(ctx, 46 * scale, this.skin, k);
    ctx.restore();
  };

  KD.Dart = Dart;
})(window.KD = window.KD || {});
