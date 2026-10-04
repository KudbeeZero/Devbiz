/* =====================================================================
 * Kudbee Archery — render.js
 * One pinhole camera blends between the SCOPE view (zoomed on the target
 * face, used while aiming and for the hit) and the WIDE view (behind the
 * archer, used while the arrow flies so you see its arc). The sky, hills,
 * mown field, hay-bale target butt, wind pennants, arrows and the first-person
 * bow are all painted in code.
 * ===================================================================== */

KAR.Render = {
  W: 960, H: 640, OUT: '#1d2a3a',
  cam: { x: 0, y: 1.6, z: -0.2, pitch: 0.004, F: 14000, CX: 480, CY: 330 },
  TEAM: [
    { base: '#2f86d8', light: '#7ac7ff', dark: '#1a4f8a', name: 'YOU' },
    { base: '#e8483a', light: '#ff9a8a', dark: '#97271d', name: 'CPU' },
  ],
  RING: ['#f4f1e6', '#f4f1e6', '#26262e', '#26262e', '#3c8fe0', '#3c8fe0', '#e4453a', '#e4453a', '#ffd34d', '#ffd34d'],
  zoom: 1, dist: 30, faceD: 0.8,

  setView(zoom, dist, faceD) {
    const C = KAR.CFG, U = KAR.Util, e = U.smooth(zoom), c = this.cam;
    this.zoom = e; this.dist = dist; this.faceD = faceD;
    const Fs = 0.4 * this.H * dist / faceD, Fw = 2000;
    c.F = Math.exp(U.lerp(Math.log(Fw), Math.log(Fs), e));
    const ex = U.lerp(0.8, 0, e), ey = U.lerp(1.9, 1.6, e), ez = U.lerp(-2.5, -0.2, e);
    const ty = U.lerp(1.0, C.FACE_Y, e), tz = U.lerp(dist * 0.55, dist, e);
    c.x = ex; c.y = ey; c.z = ez;
    c.pitch = Math.atan2(ey - ty, tz - ez);
    c.CX = 480 + U.lerp(0, 0, e); c.CY = U.lerp(300, 318, e);
  },

  proj(x, y, z) {
    const c = this.cam, dx = x - c.x, dy = y - c.y, dz = z - c.z;
    const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
    const zc = dz * cp - dy * sp;
    if (zc < 0.5) return null;
    const yc = dz * sp + dy * cp, k = c.F / zc;
    return { x: c.CX + dx * k, y: c.CY - yc * k, k, zc };
  },
  // screen -> point on the target plane z = Z
  unproj(sx, sy, Z) {
    const c = this.cam, cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
    const u = (sx - c.CX) / c.F, v = (c.CY - sy) / c.F;
    const dy = v * cp - sp, dz = v * sp + cp;
    const t = (Z - c.z) / dz;
    return { x: c.x + u * t, y: c.y + dy * t };
  },
  horizonY() { const c = this.cam; return c.CY - c.F * Math.tan(c.pitch); },

  poly(ctx, pts, fill, stroke, lw) {
    for (const p of pts) if (!p) return;
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.lineWidth = lw || 1; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.stroke(); }
  },
  line3(ctx, a, b, col, lw) {
    const p = this.proj(a[0], a[1], a[2]), q = this.proj(b[0], b[1], b[2]);
    if (!p || !q) return null; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.stroke(); return [p, q];
  },

  // ---- scenery ----------------------------------------------------------------
  drawWorld(ctx, t, wind) {
    const W = this.W, H = this.H, hy = Math.max(60, Math.min(H - 120, this.horizonY()));
    const sky = ctx.createLinearGradient(0, 0, 0, hy); sky.addColorStop(0, '#4aa8ff'); sky.addColorStop(1, '#d6f1ff');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    // sun glow + clouds
    const sg = ctx.createRadialGradient(780, hy - 150, 10, 780, hy - 150, 220); sg.addColorStop(0, 'rgba(255,248,200,0.9)'); sg.addColorStop(1, 'rgba(255,248,200,0)');
    ctx.fillStyle = sg; ctx.fillRect(560, 0, 400, hy + 40);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < 5; i++) { const cx = ((i * 251 + t * (5 + i)) % (W + 300)) - 150, cy = 50 + (i % 3) * 38 + (hy > 200 ? 0 : -10); ctx.beginPath(); ctx.ellipse(cx, cy, 80, 22, 0, 0, 7); ctx.ellipse(cx - 40, cy + 6, 50, 16, 0, 0, 7); ctx.ellipse(cx + 46, cy + 8, 56, 16, 0, 0, 7); ctx.fill(); }
    // far hills (three layers) and a tree line
    const hill = (base, amp, col, f, ph) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, hy + 2); for (let x = 0; x <= W; x += 16) ctx.lineTo(x, hy - base - Math.sin(x * f + ph) * amp - Math.sin(x * f * 2.3 + ph * 2) * amp * 0.4); ctx.lineTo(W, hy + 2); ctx.closePath(); ctx.fill(); };
    hill(46, 26, '#9bc7d8', 0.006, 1); hill(30, 20, '#78b093', 0.009, 2.4); hill(14, 10, '#4f9a55', 0.014, 4);
    const rnd = KAR.Util.rng(77);
    for (let x = -10; x < W + 20; x += 11 + rnd() * 13) { const th = 10 + rnd() * 20; ctx.fillStyle = rnd() > 0.5 ? '#2f7a3c' : '#3a8a45'; ctx.beginPath(); ctx.arc(x, hy - 6 - th * 0.35, th * 0.55, 0, 7); ctx.fill(); }
    // mown field: bands receding to the horizon, with a faint lane
    const gg = ctx.createLinearGradient(0, hy, 0, H); gg.addColorStop(0, '#79cc55'); gg.addColorStop(1, '#3f9a36');
    ctx.fillStyle = gg; ctx.fillRect(0, hy, W, H - hy);
    const D = this.dist;
    for (let i = 0; i < 40; i++) {
      const za = -4 + i * (D + 80) / 40 * (1 + i * 0.05), zb = za + (D + 80) / 40 * (1 + i * 0.05);
      this.poly(ctx, [this.proj(-300, 0, za), this.proj(300, 0, za), this.proj(300, 0, zb), this.proj(-300, 0, zb)], i % 2 ? 'rgba(255,255,255,0.075)' : 'rgba(0,50,0,0.05)');
    }
    this._lane(ctx);
  },
  _lane(ctx) {
    const D = this.dist;
    this.poly(ctx, [this.proj(-1.6, 0.01, -3), this.proj(1.6, 0.01, -3), this.proj(1.6, 0.01, D), this.proj(-1.6, 0.01, D)], 'rgba(255,255,255,0.10)');
    // shooting line + distance marker posts at 18/30/50/70 behind the target
    this.line3(ctx, [-2.4, 0.02, 0], [2.4, 0.02, 0], 'rgba(255,255,255,0.8)', Math.max(1.5, 3 * (1 - this.zoom) + 1));
  },

  // ---- the target ----------------------------------------------------------------
  drawTarget(ctx, t, wind) {
    const C = KAR.CFG, D = this.dist, F = this.faceD, R = F / 2, Y = C.FACE_Y;
    const ctr = this.proj(0, Y, D); if (!ctr) return;
    const k = ctr.k, OUT = this.OUT;
    const lw = Math.max(1.4, 0.012 * k);
    // legs + wooden frame
    const bw = F * 0.62 + 0.06;                       // half-width of the straw butt
    const legTop = Y - bw, bx = bw * 0.9;
    for (const s of [-1, 1]) { this.line3(ctx, [s * bx, legTop + 0.1, D + 0.15], [s * (bx + 0.35), 0, D + 0.5], OUT, lw * 4.2); this.line3(ctx, [s * bx, legTop + 0.1, D + 0.15], [s * (bx + 0.35), 0, D + 0.5], '#b9884e', lw * 2.6); }
    // straw butt: rounded square, with straw streaks
    const x0 = ctr.x - bw * k, y0 = ctr.y - bw * k, w = bw * 2 * k;
    ctx.save();
    ctx.beginPath(); (ctx.roundRect ? ctx.roundRect(x0, y0, w, w, 0.12 * k) : ctx.rect(x0, y0, w, w));
    const sg = ctx.createLinearGradient(0, y0, 0, y0 + w); sg.addColorStop(0, '#f3d56f'); sg.addColorStop(1, '#c99a38');
    ctx.fillStyle = sg; ctx.fill(); ctx.lineWidth = lw * 1.6; ctx.strokeStyle = OUT; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.clip();
    const rnd = KAR.Util.rng(31);
    ctx.strokeStyle = 'rgba(140,90,20,0.45)'; ctx.lineWidth = Math.max(1, lw * 0.5); ctx.beginPath();
    for (let i = 0; i < 80; i++) { const sx = x0 + rnd() * w, sy = y0 + rnd() * w; ctx.moveTo(sx, sy); ctx.lineTo(sx + (rnd() - 0.5) * 0.18 * k, sy + 0.04 * k + rnd() * 0.07 * k); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(70,40,10,0.45)'; ctx.lineWidth = Math.max(1.4, lw);              // binding twine
    for (const f of [0.28, 0.72]) { ctx.beginPath(); ctx.moveTo(x0, y0 + w * f); ctx.lineTo(x0 + w, y0 + w * f); ctx.stroke(); }
    ctx.restore();
    // face: ten rings
    for (let i = 9; i >= 0; i--) {
      const r = R * (i + 1) / 10 * k;
      ctx.beginPath(); ctx.arc(ctr.x, ctr.y, r, 0, 6.283); ctx.fillStyle = this.RING[i]; ctx.fill();
      ctx.lineWidth = Math.max(0.8, lw * 0.5); ctx.strokeStyle = (i === 2 || i === 3) ? 'rgba(255,255,255,0.55)' : 'rgba(20,20,30,0.55)'; ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(ctr.x, ctr.y, R * 0.05 * k, 0, 6.283); ctx.strokeStyle = 'rgba(20,20,30,0.6)'; ctx.lineWidth = Math.max(0.8, lw * 0.5); ctx.stroke();
    ctx.beginPath(); ctx.arc(ctr.x, ctr.y, R * k, 0, 6.283); ctx.strokeStyle = OUT; ctx.lineWidth = lw * 1.4; ctx.stroke();
    // pennants either side, streaming with the wind
    this._flag(ctx, -(bw + 0.35), D + 0.3, wind, t, '#ff5d5d'); this._flag(ctx, (bw + 0.35), D + 0.3, wind, t, '#ffd34d');
  },
  _flag(ctx, x, z, wind, t, col) {
    const top = this.proj(x, 1.9, z), bot = this.proj(x, 0, z); if (!top || !bot) return;
    const k = top.k, OUT = this.OUT;
    ctx.beginPath(); ctx.moveTo(bot.x, bot.y); ctx.lineTo(top.x, top.y); ctx.strokeStyle = OUT; ctx.lineWidth = Math.max(2, 0.05 * k); ctx.lineCap = 'round'; ctx.stroke();
    ctx.strokeStyle = '#d8dde3'; ctx.lineWidth = Math.max(1, 0.03 * k); ctx.stroke();
    const sg = Math.sign(wind) || 1, a = Math.min(1, Math.abs(wind) / 2.5), len = (0.35 + 0.65 * a) * 0.6 * k, flap = Math.sin(t * (4 + a * 8)) * 0.07 * k * (0.4 + a);
    const droop = (1 - a) * 0.45 * k;
    ctx.beginPath(); ctx.moveTo(top.x, top.y);
    ctx.quadraticCurveTo(top.x + sg * len * 0.5, top.y + droop * 0.4 + flap, top.x + sg * len, top.y + droop + flap * 0.5);
    ctx.lineTo(top.x + sg * len * 0.95, top.y + 0.22 * k + droop * 0.9 + flap * 0.4);
    ctx.quadraticCurveTo(top.x + sg * len * 0.5, top.y + 0.2 * k + droop * 0.4 - flap, top.x, top.y + 0.2 * k);
    ctx.closePath(); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = Math.max(1.2, 0.025 * k); ctx.strokeStyle = OUT; ctx.lineJoin = 'round'; ctx.stroke();
  },

  // ---- arrows ----------------------------------------------------------------------
  arrow(ctx, tip, dir, len, team, minLen) {
    const L = Math.hypot(dir.x, dir.y, dir.z) || 1, d = { x: dir.x / L, y: dir.y / L, z: dir.z / L };
    const tail = { x: tip.x - d.x * len, y: tip.y - d.y * len, z: tip.z - d.z * len };
    const p = this.proj(tip.x, tip.y, tip.z); let q = this.proj(tail.x, tail.y, tail.z); if (!p || !q) return;
    if (minLen) { let vx = q.x - p.x, vy = q.y - p.y, vl = Math.hypot(vx, vy); if (vl < minLen) { if (vl < 1) { vx = 0.25; vy = -1; vl = Math.hypot(vx, vy); } q = { x: p.x + vx / vl * minLen, y: p.y + vy / vl * minLen, k: q.k, zc: q.zc }; } }
    const col = this.TEAM[team || 0], w = Math.max(2.2 + 2.2 * (1 - this.zoom), 0.016 * p.k);
    ctx.save(); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(p.x, p.y); ctx.strokeStyle = this.OUT; ctx.lineWidth = w + 2.4; ctx.stroke();
    ctx.strokeStyle = '#f2e6c8'; ctx.lineWidth = w; ctx.stroke();
    // fletching: three vanes at the tail
    const dx = q.x - p.x, dy = q.y - p.y, dl = Math.hypot(dx, dy) || 1, nx = -dy / dl, ny = dx / dl, fl = Math.min(dl * 0.28, 26 + 0.05 * p.k);
    for (const s of [-1, 0, 1]) { ctx.beginPath(); ctx.moveTo(q.x - dx / dl * 0.1, q.y - dy / dl * 0.1); ctx.lineTo(q.x + dx / dl * fl * 0.2 + nx * s * fl * 0.5, q.y + dy / dl * fl * 0.2 + ny * s * fl * 0.5); ctx.lineTo(q.x - dx / dl * fl + nx * s * fl * 0.1, q.y - dy / dl * fl + ny * s * fl * 0.1); ctx.closePath(); ctx.fillStyle = s ? col.base : col.light; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = this.OUT; ctx.stroke(); }
    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1.8, w * 0.7), 0, 6.283); ctx.fillStyle = '#cfd6de'; ctx.fill();
    ctx.restore();
  },
  stuck(ctx, a, team) {
    if (!a.hit) return;
    const D = this.dist, h = a.hit, L = Math.hypot(h.vx, h.vy, h.vz) || 1;
    this.arrow(ctx, { x: h.x, y: h.y, z: D }, { x: h.vx / L, y: h.vy / L * 3.5, z: h.vz / L }, 0.5, team, 30 * Math.min(1, 0.4 + this.zoom));
  },

  // ---- first-person bow + sight ----------------------------------------------------------
  bow(ctx, sx, sy, draw, team, t) {
    const col = this.TEAM[team || 0], OUT = this.OUT, W = this.W, H = this.H;
    const cx = 480, base = H + 8, pull = draw * 70;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // the arrow: tapered from the string up to the sight point
    const tx = sx, ty = sy + 10, sxp = cx, syp = base - 62 + pull * 0.2;
    const ang = Math.atan2(ty - syp, tx - sxp), nx = -Math.sin(ang), ny = Math.cos(ang);
    ctx.beginPath(); ctx.moveTo(sxp + nx * 6, syp + ny * 6); ctx.lineTo(tx + nx * 0.8, ty + ny * 0.8); ctx.lineTo(tx - nx * 0.8, ty - ny * 0.8); ctx.lineTo(sxp - nx * 6, syp - ny * 6); ctx.closePath();
    ctx.fillStyle = '#f2e6c8'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
    // fletching at the nock
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sxp, syp); ctx.lineTo(sxp + nx * s * 26 - Math.cos(ang) * 6, syp + ny * s * 26 - Math.sin(ang) * 6); ctx.lineTo(sxp + Math.cos(ang) * 58 + nx * s * 8, syp + Math.sin(ang) * 58 + ny * s * 8); ctx.closePath(); ctx.fillStyle = s > 0 ? col.base : col.light; ctx.fill(); ctx.stroke(); }
    // bow limbs + string
    const limb = (s) => { ctx.beginPath(); ctx.moveTo(cx + s * 70, base - 200); ctx.quadraticCurveTo(cx + s * 175, base - 80, cx + s * 74, base + 10); ctx.lineWidth = 14; ctx.strokeStyle = OUT; ctx.stroke(); ctx.lineWidth = 8; ctx.strokeStyle = '#a8703a'; ctx.stroke(); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,230,170,0.7)'; ctx.stroke(); };
    limb(-1); limb(1);
    ctx.beginPath(); ctx.moveTo(cx - 70, base - 200); ctx.lineTo(sxp, syp + 14); ctx.lineTo(cx + 74, base - 200); ctx.lineWidth = 3.4; ctx.strokeStyle = '#fff6e0'; ctx.stroke(); ctx.lineWidth = 1.4; ctx.strokeStyle = OUT; ctx.stroke();
    // riser (grip) and the bow hand
    ctx.beginPath(); (ctx.roundRect ? ctx.roundRect(cx - 168, base - 110, 34, 100, 12) : ctx.rect(cx - 168, base - 110, 34, 100)); ctx.fillStyle = '#8a5a2c'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx - 152, base - 60, 34, 26, -0.2, 0, 7); ctx.fillStyle = '#f0b98a'; ctx.fill(); ctx.stroke();
    ctx.restore();
  },
  sight(ctx, x, y, r, steady, t) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.stroke();
    ctx.strokeStyle = steady ? '#a9ff7a' : '#fff6a8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.stroke();
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * (r - 4), y + Math.sin(a) * (r - 4)); ctx.lineTo(x + Math.cos(a) * (r + 12), y + Math.sin(a) * (r + 12)); ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 6; ctx.stroke(); ctx.strokeStyle = steady ? '#a9ff7a' : '#fff6a8'; ctx.lineWidth = 3; ctx.stroke(); }
    ctx.fillStyle = '#ff5d5d'; ctx.beginPath(); ctx.arc(x, y, 2.6, 0, 6.283); ctx.fill();
    ctx.restore();
  },
};
