/* =====================================================================
 * Kudbee Darts — world/board.js
 * The geometric heart of the game. ONE place owns the dartboard geometry,
 * so the polar hit-test and the procedural neon renderer derive from the
 * exact same radii/angles — guaranteeing the pixels you see match the score
 * you get. The board is baked to an offscreen canvas once and blitted each
 * frame; only darts + reticle redraw live.
 *
 * Coordinate note: canvas y points DOWN. We measure the wedge angle as
 *   a = atan2(dx, -dy)  -> 0 at top (the 20), increasing CLOCKWISE,
 * which matches the visual layout regardless of the y-down convention.
 * ===================================================================== */
(function (KD) {
  'use strict';
  const Util = KD.Util;
  const TAU = Math.PI * 2;
  const D2R = Math.PI / 180;

  // Standard clockwise wedge order, 20 centered straight up.
  const WEDGES = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

  // Radii normalized to the double-ring outer edge = 1.0 (real board mm / 170).
  const R = {
    inBull: 0.0374,
    outBull: 0.0935,
    trbInner: 0.582,
    trbOuter: 0.629,
    dblInner: 0.953,
    dblOuter: 1.0,
  };

  // Studio neon palette.
  const COL = {
    bg: '#0a0e20',
    singleA: '#0d1228',
    singleB: '#161d3c',
    ringCyan: '#39e6ff',
    ringViolet: '#c46bff',
    outBull: '#7CFFb2',
    inBull: '#ff3c5d',
    wire: 'rgba(180,210,255,0.30)',
  };

  function Board() {
    this.cx = 480;
    this.cy = 360;
    this.Rpx = 300;
    this._baked = null;
    this._bakedR = 0;
  }

  Board.WEDGES = WEDGES;
  Board.R = R;

  Board.prototype.layout = function (cx, cy, Rpx) {
    this.cx = cx; this.cy = cy; this.Rpx = Rpx;
    if (Math.abs(Rpx - this._bakedR) > 0.5) this._bake();
  };

  /* -------------------------------------------------------------------
   * Hit test — the scoring authority.
   * Returns { score, ring, mult, value, label }.
   *   ring: 'inbull'|'outbull'|'single'|'treble'|'double'|'miss'
   * ----------------------------------------------------------------- */
  Board.prototype.hitTest = function (px, py) {
    const dx = px - this.cx;
    const dy = py - this.cy;
    const r = Math.sqrt(dx * dx + dy * dy) / this.Rpx;

    if (r > R.dblOuter) return { score: 0, ring: 'miss', mult: 0, value: 0, label: 'MISS' };
    if (r <= R.inBull) return { score: 50, ring: 'inbull', mult: 2, value: 25, label: 'BULL' };
    if (r <= R.outBull) return { score: 25, ring: 'outbull', mult: 1, value: 25, label: '25' };

    // Wedge number from the clockwise-from-top angle.
    let a = Math.atan2(dx, -dy);       // (-PI, PI], 0 at top, clockwise
    if (a < 0) a += TAU;               // [0, TAU)
    let idx = Math.floor((a + 9 * D2R) / (18 * D2R)); // +half-wedge: 20 centered up
    idx = ((idx % 20) + 20) % 20;
    const value = WEDGES[idx];

    let mult, ring;
    if (r >= R.dblInner) { mult = 2; ring = 'double'; }
    else if (r >= R.trbInner && r <= R.trbOuter) { mult = 3; ring = 'treble'; }
    else { mult = 1; ring = 'single'; }

    const label = (mult === 3 ? 'T' : mult === 2 ? 'D' : '') + value;
    return { score: value * mult, ring: ring, mult: mult, value: value, label: label };
  };

  /* Wedge index -> canvas center angle (radians). */
  function wedgeCanvasAngle(idx) {
    return idx * 18 * D2R - Math.PI / 2; // top is -90deg in canvas space
  }

  /* -------------------------------------------------------------------
   * Inverse: an aim label -> ideal pixel target. Used by the AI to turn a
   * strategic choice ('T20','D16','BULL','20','25') into an aim point.
   * ----------------------------------------------------------------- */
  Board.prototype.targetPoint = function (label) {
    label = String(label).toUpperCase();
    if (label === 'BULL' || label === 'B' || label === '50') {
      return { x: this.cx, y: this.cy };
    }
    if (label === '25' || label === 'OB') {
      // a point on the outer-bull annulus (straight up, arbitrary)
      const rm = (R.inBull + R.outBull) / 2 * this.Rpx;
      return { x: this.cx, y: this.cy - rm };
    }
    let mult = 1, numStr = label;
    if (label[0] === 'T') { mult = 3; numStr = label.slice(1); }
    else if (label[0] === 'D') { mult = 2; numStr = label.slice(1); }
    const value = parseInt(numStr, 10);
    const idx = WEDGES.indexOf(value);
    if (idx < 0) return { x: this.cx, y: this.cy };

    let rm;
    if (mult === 3) rm = (R.trbInner + R.trbOuter) / 2;
    else if (mult === 2) rm = (R.dblInner + R.dblOuter) / 2;
    else rm = (R.outBull + R.trbInner) / 2; // big inner single
    rm *= this.Rpx;
    const ang = wedgeCanvasAngle(idx);
    return { x: this.cx + Math.cos(ang) * rm, y: this.cy + Math.sin(ang) * rm };
  };

  /* -------------------------------------------------------------------
   * Procedural neon render, baked once to an offscreen canvas.
   * ----------------------------------------------------------------- */
  function sector(ctx, cx, cy, r0, r1, aStart, aEnd, fill) {
    ctx.beginPath();
    ctx.arc(cx, cy, r1, aStart, aEnd, false);
    ctx.arc(cx, cy, r0, aEnd, aStart, true);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  Board.prototype._bake = function () {
    const Rpx = this.Rpx;
    const pad = Rpx * 0.22;             // room for the numbers ring + glow
    const size = Math.ceil((Rpx + pad) * 2);
    const cv = document.createElement('canvas');
    cv.width = size; cv.height = size;
    const ctx = cv.getContext('2d');
    const cx = size / 2, cy = size / 2;
    this._bakeCx = cx; this._bakeCy = cy;
    this._bakedR = Rpx;
    this._baked = cv;

    // Outer backdrop disc (the catch-ring) with a soft neon rim.
    ctx.save();
    ctx.shadowColor = COL.ringCyan;
    ctx.shadowBlur = Rpx * 0.10;
    ctx.fillStyle = '#05060f';
    ctx.beginPath();
    ctx.arc(cx, cy, Rpx * 1.16, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = COL.bg;
    ctx.beginPath();
    ctx.arc(cx, cy, Rpx * 1.10, 0, TAU);
    ctx.fill();

    const half = 9 * D2R;
    for (let i = 0; i < 20; i++) {
      const cAng = wedgeCanvasAngle(i);
      const aS = cAng - half, aE = cAng + half;
      const even = i % 2 === 0;
      const single = even ? COL.singleA : COL.singleB;
      const ring = even ? COL.ringCyan : COL.ringViolet;

      // Inner single (bull -> treble) and outer single (treble -> double).
      sector(ctx, cx, cy, R.outBull * Rpx, R.trbInner * Rpx, aS, aE, single);
      sector(ctx, cx, cy, R.trbOuter * Rpx, R.dblInner * Rpx, aS, aE, single);

      // Glowing treble + double rings.
      ctx.save();
      ctx.shadowColor = ring;
      ctx.shadowBlur = Rpx * 0.04;
      sector(ctx, cx, cy, R.trbInner * Rpx, R.trbOuter * Rpx, aS, aE, ring);
      sector(ctx, cx, cy, R.dblInner * Rpx, R.dblOuter * Rpx, aS, aE, ring);
      ctx.restore();
    }

    // Bull.
    ctx.save();
    ctx.shadowColor = COL.outBull; ctx.shadowBlur = Rpx * 0.05;
    ctx.fillStyle = COL.outBull;
    ctx.beginPath(); ctx.arc(cx, cy, R.outBull * Rpx, 0, TAU); ctx.fill();
    ctx.shadowColor = COL.inBull; ctx.shadowBlur = Rpx * 0.07;
    ctx.fillStyle = COL.inBull;
    ctx.beginPath(); ctx.arc(cx, cy, R.inBull * Rpx, 0, TAU); ctx.fill();
    ctx.restore();

    // Spider wires: ring circles + wedge boundaries.
    ctx.strokeStyle = COL.wire;
    ctx.lineWidth = Math.max(1, Rpx * 0.006);
    [R.outBull, R.trbInner, R.trbOuter, R.dblInner, R.dblOuter].forEach(function (rr) {
      ctx.beginPath(); ctx.arc(cx, cy, rr * Rpx, 0, TAU); ctx.stroke();
    });
    for (let i = 0; i < 20; i++) {
      const aB = wedgeCanvasAngle(i) + half;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(aB) * R.outBull * Rpx, cy + Math.sin(aB) * R.outBull * Rpx);
      ctx.lineTo(cx + Math.cos(aB) * R.dblOuter * Rpx, cy + Math.sin(aB) * R.dblOuter * Rpx);
      ctx.stroke();
    }

    // Numbers ring.
    ctx.fillStyle = '#dfeaff';
    ctx.font = 'bold ' + Math.round(Rpx * 0.10) + 'px "Space Grotesk", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = COL.ringCyan;
    ctx.shadowBlur = Rpx * 0.03;
    const numR = R.dblOuter * Rpx + Rpx * 0.11;
    for (let i = 0; i < 20; i++) {
      const ang = wedgeCanvasAngle(i);
      ctx.fillText(String(WEDGES[i]), cx + Math.cos(ang) * numR, cy + Math.sin(ang) * numR);
    }
    ctx.shadowBlur = 0;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  };

  Board.prototype.draw = function (ctx) {
    if (!this._baked) this._bake();
    ctx.drawImage(this._baked, this.cx - this._bakeCx, this.cy - this._bakeCy);
  };

  KD.Board = Board;
})(window.KD = window.KD || {});
