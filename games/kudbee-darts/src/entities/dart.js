/* =====================================================================
 * Kudbee Darts — entities/dart.js
 * The throw — a true Darts-of-Fury-style FLICK. You drag to aim a live
 * reticle, then you must SWIPE-RELEASE to throw: there is no tap-to-place.
 * The release velocity sets the power and the curl; the pressure adds weight.
 *
 *   - Aim   : the reticle follows your finger, clamped to the board.
 *   - Power : release SPEED vs an ideal flick. Too soft and the dart drops
 *             low/short; too hard and it sails high and outward (overshoot).
 *   - Curl  : sideways release velocity bends the flight + pulls the landing.
 *   - Weight: harder PRESSURE sinks the dart a touch and adds curl/scatter.
 *   - Guard : a tap (tiny, slow swipe) does NOT throw — you get a nudge.
 *
 * The cosmetic 2.5D flight is animation only; the LANDING POINT is what
 * scores (via Board.hitTest), so the reticle and the result share one path.
 * ===================================================================== */
(function (KD) {
  'use strict';
  const Util = KD.Util;

  // ---- Flick tuning (logical px unless noted) ---------------------------
  const IDEAL_SPEED = 1500;     // px/s: a clean, committed flick
  const MIN_SWIPE_LEN = 24;     // below this a release is a "tap" -> no throw
  const MIN_REL_SPEED = 240;    // px/s: too slow to count as a flick

  const FLIGHT_TIME = 0.42;     // seconds, cosmetic (loft hang-time)

  function Dart(game) {
    this.game = game;
    this.state = 'ready';      // ready | aiming | flying | done
    this.aimX = 0; this.aimY = 0;
    this.sigma = 0.022;        // base landing scatter (board-radius units)
    this.isAI = false;

    // live swipe read-outs (for the aim guide)
    this.power = 0;            // normalized current swipe speed (0..~1.6)
    this.tooSoft = false;      // last release was a tap -> show a nudge
    this.nudgeT = 0;

    // flight
    this._ft = 0;
    this._fromX = 0; this._fromY = 0;
    this._curl = 0;            // signed lateral curl for the cosmetic arc
    this._powf = 1;
    this.landX = 0; this.landY = 0;
    this.result = null;
    this.skin = null;
    this.parts = null;         // { tip, flight } — cosmetic, set per thrower
  }

  Dart.prototype.reset = function () {
    this.state = 'ready';
    this.result = null;
    this._ft = 0;
    this.power = 0;
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
    this.isAI = false;
    this.power = 0;
    this.tooSoft = false;
    this.state = 'aiming';
  };

  Dart.prototype.updateAim = function (px, py, dt) {
    const p = this._clampToBoard(px, py);
    // Ease toward the pointer for a weighty feel.
    this.aimX = Util.lerp(this.aimX, p.x, 1 - Math.pow(0.0001, dt));
    this.aimY = Util.lerp(this.aimY, p.y, 1 - Math.pow(0.0001, dt));
    // Live power read-out from the pointer's smoothed speed.
    const spd = (this.game.input.pointer.speed) || 0;
    this.power = Util.lerp(this.power, Math.min(1.7, spd / IDEAL_SPEED), 1 - Math.pow(0.02, dt));
  };

  // ---- AI aiming ---------------------------------------------------------
  Dart.prototype.setAI = function (targetX, targetY, sigma) {
    this.aimX = targetX; this.aimY = targetY;
    this.sigma = sigma;
    this.isAI = true;
    this.state = 'aiming';
  };

  // Predicted landing for the AI (aim + nothing; scatter added on release).
  Dart.prototype.predict = function () {
    return { x: this.aimX, y: this.aimY };
  };

  // ---- Release -----------------------------------------------------------
  // Human flick. Returns null and stays 'aiming' if the gesture was a tap.
  Dart.prototype.release = function () {
    const Rpx = this.game.board.Rpx;

    if (this.isAI) return this._releaseAt(this.aimX, this.aimY, this.sigma);

    const pt = this.game.input.pointer;
    // Reject a tap / dab: enforce "you must swipe to throw".
    if (pt.swipeLen < MIN_SWIPE_LEN || pt.relSpeed < MIN_REL_SPEED) {
      this.tooSoft = true; this.nudgeT = 0.9;
      return null;
    }

    let lx = this.aimX, ly = this.aimY;
    const cx = this.game.board.cx, cy = this.game.board.cy;

    // Power: release speed vs the ideal flick.
    const powf = pt.relSpeed / IDEAL_SPEED;          // <1 soft, >1 hard
    this._powf = powf;

    // Radial (centre -> aim) for over/undershoot along the throw line.
    let rdx = lx - cx, rdy = ly - cy;
    const rlen = Math.sqrt(rdx * rdx + rdy * rdy) || 1;
    rdx /= rlen; rdy /= rlen;

    if (powf < 1) {
      // Soft flick: the dart drops low and pulls in toward the centre.
      const soft = (1 - powf);
      ly += soft * Rpx * 0.26;                       // gravity sag
      lx -= rdx * soft * Rpx * 0.05; ly -= rdy * soft * Rpx * 0.05;
    } else {
      // Hard flick: overshoot outward along the throw line (can sail off).
      const hard = Math.min(1.1, powf - 1);
      lx += rdx * hard * Rpx * 0.22;
      ly += rdy * hard * Rpx * 0.22;
    }

    // Curl: sideways component of the release direction pulls the landing and
    // bends the cosmetic flight. Measured perpendicular to the aim radial.
    const rs = pt.relSpeed || 1;
    const ux = pt.relVX / rs, uy = pt.relVY / rs;     // unit release dir
    const lateral = ux * (-rdy) + uy * (rdx);         // signed perp component
    this._curl = lateral;
    lx += (-rdy) * lateral * Rpx * 0.09;
    ly += (rdx) * lateral * Rpx * 0.09;

    // Weight from pressure (pen / 3D-touch): heavier = sinks + more curl.
    const pr = pt.pressure || 0;
    if (pr > 0.55) { ly += (pr - 0.55) * Rpx * 0.14; this._curl *= 1 + (pr - 0.55); }

    // Scatter grows when the throw is far from an ideal, committed flick.
    const wildness = Math.min(1.3, Math.abs(powf - 1) * 0.9 + Math.abs(lateral) * 0.5
      + Math.max(0, (90 - Math.min(90, pt.swipeLen)) / 90) * 0.4);
    const sigma = this.sigma * (1 + wildness);

    return this._releaseAt(lx, ly, sigma);
  };

  // Shared landing + flight kickoff for human and AI.
  Dart.prototype._releaseAt = function (lx, ly, sigma) {
    const Rpx = this.game.board.Rpx;
    const sx = Util.gaussian() * sigma * Rpx;
    const sy = Util.gaussian() * sigma * Rpx;
    this.landX = lx + sx;
    this.landY = ly + sy;
    this.result = this.game.board.hitTest(this.landX, this.landY);

    // Cosmetic flight: from the player's hand (just right of the oche centre)
    // up to the landing point, with a little hand-sway on the way.
    this._fromX = this.game.viewW / 2 + 64;
    this._fromY = this.game.viewH - 24;
    this._sway = (Math.random() * 2 - 1) * 22;
    this._roll = (Math.random() < 0.5 ? -1 : 1);
    if (this.isAI) { this._curl = (Math.random() * 2 - 1) * 0.25; this._powf = 1; }
    this._ft = 0;
    this.state = 'flying';
    this.game.audio.whoosh();
    if (this.game.lungeBoard) this.game.lungeBoard();
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
  // The aim reticle + a live power gauge teaching the flick.
  Dart.prototype.drawReticle = function (ctx) {
    if (this.nudgeT > 0 && this.state !== 'aiming') {
      // Brief "swipe to throw" nudge after a rejected tap.
      this.nudgeT -= 1 / 60;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, this.nudgeT * 1.6));
      ctx.fillStyle = '#ffd34d'; ctx.font = 'bold 20px "Space Grotesk", sans-serif';
      ctx.textAlign = 'center'; ctx.shadowColor = '#ffd34d'; ctx.shadowBlur = 14;
      ctx.fillText('SWIPE TO THROW', this.aimX, this.aimY - 30);
      ctx.restore();
      ctx.textAlign = 'left';
    }
    if (this.state !== 'aiming' || this.isAI) return;

    const p = { x: this.aimX, y: this.aimY };
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
    // Aim ring + rotating ticks.
    const rr = 18;
    ctx.globalAlpha = 0.55 + 0.4 * pulse;
    ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, Math.PI * 2); ctx.stroke();
    ctx.save();
    ctx.translate(p.x, p.y); ctx.rotate(t * 1.4);
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 2);
      ctx.beginPath(); ctx.moveTo(rr + 3, 0); ctx.lineTo(rr + 9, 0); ctx.stroke();
    }
    ctx.restore();
    // Crosshair + dot.
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    ctx.moveTo(p.x - 12, p.y); ctx.lineTo(p.x + 12, p.y);
    ctx.moveTo(p.x, p.y - 12); ctx.lineTo(p.x, p.y + 12);
    ctx.stroke();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2); ctx.fill();
    // Live label.
    ctx.globalAlpha = 1;
    ctx.font = 'bold 18px "Space Grotesk", monospace';
    ctx.textAlign = 'center'; ctx.fillStyle = col;
    ctx.fillText(res.label + (res.score ? '  ' + res.score : ''), p.x, p.y - rr - 12);
    ctx.restore();

    // Power gauge: a vertical bar beside the reticle that fills with the live
    // flick speed; the green band is the committed-flick sweet spot.
    const gx = p.x + rr + 18, gy0 = p.y - 46, gh = 92, gw = 9;
    ctx.save();
    ctx.fillStyle = 'rgba(10,16,32,0.7)';
    this.game._roundRect ? this.game._roundRect(ctx, gx, gy0, gw, gh, 4) : ctx.rect(gx, gy0, gw, gh);
    ctx.fill();
    // sweet-spot band (0.85..1.15 of ideal)
    const bandY = gy0 + gh * (1 - 1.15 / 1.7), bandH = gh * ((1.15 - 0.85) / 1.7);
    ctx.fillStyle = 'rgba(124,255,178,0.30)'; ctx.fillRect(gx, bandY, gw, bandH);
    const f = Math.max(0, Math.min(1, this.power / 1.7));
    const inBand = this.power >= 0.85 && this.power <= 1.15;
    ctx.fillStyle = inBand ? '#7CFFb2' : this.power > 1.15 ? '#ff5d3c' : '#39e6ff';
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 10;
    ctx.fillRect(gx, gy0 + gh * (1 - f), gw, gh * f);
    ctx.restore();
  };

  // The cosmetic dart flying toward the board: arcs up, CURLS to the side
  // (quadratic-Bézier hook), scales for depth, rolls on its axis, and the
  // flights flutter — the Darts-of-Fury "loop in" feel.
  Dart.prototype.drawFlight = function (ctx) {
    if (this.state !== 'flying') return;
    const k = this._ft / FLIGHT_TIME;
    const e = Util.smooth(k);

    // Quadratic Bézier from hand -> control -> landing. The control point is
    // offset sideways by the curl so the dart hooks in, and lifted so it lofts.
    const Rpx = this.game.board.Rpx;
    const x0 = this._fromX, y0 = this._fromY, x1 = this.landX, y1 = this.landY;
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const dx = x1 - x0, dy = y1 - y0;
    const dl = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / dl, ny = dx / dl;               // perpendicular
    const curlPx = (this._curl || 0) * Rpx * 0.55 + (this._sway || 0);
    const cxp = mx + nx * curlPx;
    const cyp = my + ny * curlPx - 78;               // lift for the loft
    const om = 1 - e;
    let x = om * om * x0 + 2 * om * e * cxp + e * e * x1;
    let y = om * om * y0 + 2 * om * e * cyp + e * e * y1;

    const scale = Util.lerp(1.45, 0.48, e);
    // Travel angle = Bézier tangent, with a hair of extra droop near landing.
    const tx = 2 * om * (cxp - x0) + 2 * e * (x1 - cxp);
    const ty = 2 * om * (cyp - y0) + 2 * e * (y1 - cyp);
    const ang = Math.atan2(ty, tx) + Math.cos(k * Math.PI) * 0.10;
    // Barrel roll: squashes the silhouette vertically as it spins.
    const spin = (this._roll || 1) * (k * 13);
    const roll = 0.4 + 0.6 * Math.abs(Math.cos(spin));
    // Tail flutter: a tiny shimmy that fades as it lands (flights "biting" air).
    const flutter = Math.sin(k * 26) * (1 - e) * 0.05;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang + flutter);
    ctx.scale(1, roll);
    this.game.sprites.drawDart(ctx, 46 * scale, this.skin, k, this.parts);
    ctx.restore();
  };

  KD.Dart = Dart;
})(window.KD = window.KD || {});
