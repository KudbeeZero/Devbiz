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
  cam: { x: 0, y: 1.6, z: -0.2, pitch: 0.004, yaw: 0, F: 14000, CX: 480, CY: 330 },
  TEAM: [
    { base: '#2f86d8', light: '#7ac7ff', dark: '#1a4f8a', name: 'YOU' },
    { base: '#e8483a', light: '#ff9a8a', dark: '#97271d', name: 'CPU' },
  ],
  // RING[i] fills the band from (i)/10 to (i+1)/10 of the radius: gold in the middle, white on the outside (WA face)
  RING: ['#ffd34d', '#ffd34d', '#e4453a', '#e4453a', '#3c8fe0', '#3c8fe0', '#26262e', '#26262e', '#f4f1e6', '#f4f1e6'],
  zoom: 1, dist: 30, faceD: 0.8,

  setView(zoom, dist, faceD) {
    const C = KAR.CFG, U = KAR.Util, e = U.smooth(zoom), c = this.cam;
    this.zoom = e; this.dist = dist; this.faceD = faceD;
    const Fs = 0.4 * this.H * dist / faceD, Fw = 2000;
    c.F = Math.exp(U.lerp(Math.log(Fw), Math.log(Fs), e));
    const ex = U.lerp(0.8, 0, e), ey = U.lerp(1.9, 1.6, e), ez = U.lerp(-2.5, -0.2, e);
    const ty = U.lerp(1.0, C.FACE_Y, e), tz = U.lerp(dist * 0.55, dist, e);
    c.x = ex; c.y = ey; c.z = ez; c.yaw = 0;
    c.pitch = Math.atan2(ey - ty, tz - ez);
    c.CX = 480 + U.lerp(0, 0, e); c.CY = U.lerp(300, 318, e);
    this.chaseB = 0;
  },

  // ARROW CAM: blend the camera (b 0..1) from wherever setView put it to a chase position just behind and
  // above the flying arrow, looking down-range at the face. Called after setView, only for hero shots.
  // orbit 0..1 (after the hit): swing round to a three-quarter view so the arrow reads in profile, sunk in the
  // boss, the camera turning (yaw) to keep the hit centred.
  chase(tip, b, orbit) {
    if (!(b > 0)) return;
    const C = KAR.CFG, U = KAR.Util, c = this.cam, e = U.smooth(b), o = U.smooth(orbit || 0);
    const x = tip.x * 0.92 + 0.95 * o, y = tip.y + 0.16 + 0.14 * o, z = tip.z - 1.7 - 0.35 * o;
    c.x = U.lerp(c.x, x, e); c.y = U.lerp(c.y, y, e); c.z = U.lerp(c.z, z, e);
    c.pitch = U.lerp(c.pitch, Math.atan2(y - C.FACE_Y, Math.max(1, this.dist - z)), e);
    c.F = Math.exp(U.lerp(Math.log(c.F), Math.log(820 + 330 * o), e));
    c.CY = U.lerp(c.CY, 300, e);
    c.yaw = Math.atan2(tip.x - c.x, tip.z - c.z) * o * e;           // turn to face the hit as we swing round
    this.chaseB = e;
  },

  proj(x, y, z) {
    const c = this.cam, dy = y - c.y;
    let dx = x - c.x, dz = z - c.z;
    if (c.yaw) { const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw), rx = dx * cy - dz * sy; dz = dx * sy + dz * cy; dx = rx; }
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
  // Photo backdrops (assets/bg-*.jpg); null until loaded so the painted scene is the fallback.
  _photo(name) {
    const c = this._ph || (this._ph = {});
    if (!c[name]) { const im = new Image(); const o = c[name] = { im, ok: false }; im.onload = () => { o.ok = true; }; im.src = 'assets/' + name + '.jpg'; }
    return c[name].ok ? c[name].im : null;
  },
  drawMenuPhoto(ctx) {
    const im = this._photo('bg-menu'); if (!im) return false;
    const W = this.W, H = this.H, s = Math.max(W / im.width, H / im.height);
    ctx.drawImage(im, (W - im.width * s) / 2, (H - im.height * s) / 2, im.width * s, im.height * s);
    return true;
  },
  drawWorld(ctx, t, wind) {
    const W = this.W, H = this.H, hy = Math.max(60, Math.min(H - 120, this.horizonY()));
    const sky = ctx.createLinearGradient(0, 0, 0, hy); sky.addColorStop(0, '#4aa8ff'); sky.addColorStop(1, '#d6f1ff');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    const ph = this._photo(KAR.CFG.DISTS.indexOf(this.dist) % 2 ? 'bg-range-2' : 'bg-range-1');
    if (ph) {
      const s = Math.max(W / ph.width, hy / ph.height);
      ctx.drawImage(ph, (W - ph.width * s) / 2, hy - ph.height * s, ph.width * s, ph.height * s);
      this._field(ctx, hy, true);
      return;
    }
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
    this._field(ctx, hy);
  },
  _field(ctx, hy, photo) {
    const W = this.W, H = this.H;
    const gg = ctx.createLinearGradient(0, hy, 0, H); gg.addColorStop(0, photo ? '#7aa83e' : '#79cc55'); gg.addColorStop(1, photo ? '#4a8a2e' : '#3f9a36');
    ctx.fillStyle = gg; ctx.fillRect(0, hy, W, H - hy);
    const D = this.dist;
    for (let i = 0; i < 40; i++) {
      const za = -4 + i * (D + 80) / 40 * (1 + i * 0.05), zb = za + (D + 80) / 40 * (1 + i * 0.05);
      this.poly(ctx, [this.proj(-300, 0, za), this.proj(300, 0, za), this.proj(300, 0, zb), this.proj(-300, 0, zb)], i % 2 ? (photo ? 'rgba(255,255,255,0.11)' : 'rgba(255,255,255,0.075)') : (photo ? 'rgba(0,50,0,0.10)' : 'rgba(0,50,0,0.05)'));
    }
    if (photo) this._fences(ctx);
    this._lane(ctx);
  },
  // Split-rail fences + a lane sign converging on the target, like a real range.
  _fences(ctx) {
    const D = this.dist + 6, X = 9, km = (this.proj(X, 0, D * 0.5) || { k: 40 }).k, OUT = this.OUT || '#3a2216';
    for (const sx of [-1, 1]) {
      const n = Math.round(D / 4);
      for (const h of [0.45, 0.95]) {
        const a = this.proj(sx * X, h, 0.5), b = this.proj(sx * X, h, D);
        if (a && b) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.strokeStyle = '#5a3d22'; ctx.lineWidth = Math.max(1.2, 0.045 * km); ctx.lineCap = 'round'; ctx.stroke(); }
      }
      for (let i = 0; i <= n; i++) {
        const z = 6 + i * (D - 6) / n, p = this.proj(sx * X, 0, z), q = this.proj(sx * X, 1.15, z);
        if (p && q) { ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.strokeStyle = '#4a3019'; ctx.lineWidth = Math.max(1.2, 0.07 * (this.proj(sx * X, 0, z) || { k: 20 }).k * 0.5); ctx.stroke(); }
      }
    }
  },
  _lane(ctx) {
    const D = this.dist;
    this.poly(ctx, [this.proj(-1.6, 0.01, -3), this.proj(1.6, 0.01, -3), this.proj(1.6, 0.01, D), this.proj(-1.6, 0.01, D)], 'rgba(255,255,255,0.10)');
    // shooting line + distance marker posts at 18/30/50/70 behind the target
    this.line3(ctx, [-2.4, 0.02, 0], [2.4, 0.02, 0], 'rgba(255,255,255,0.8)', Math.max(1.5, 3 * (1 - this.zoom) + 1));
  },

  // ---- the target ----------------------------------------------------------------
  // drifting leaves: the stronger the wind, the faster and flatter they fly
  drawWind(ctx, t, wind) {
    const W = this.W, H = this.H, a = Math.min(1, Math.abs(wind) / 4), dir = Math.sign(wind) || 1;
    ctx.save();
    for (let i = 0; i < 16; i++) {
      const sp = 40 + a * 260 + (i % 4) * 14, ph = (i * 137.5) % W;
      let x = ((ph + dir * t * sp) % (W + 80) + (W + 80)) % (W + 80) - 40;
      const y = H * (0.3 + 0.55 * ((i * 53) % 100) / 100) + Math.sin(t * 1.7 + i) * (10 + 14 * (1 - a));
      ctx.globalAlpha = 0.5 + 0.35 * a; ctx.fillStyle = i % 3 ? '#8fd24a' : '#e6c54a';
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 3 + i) * 0.9 + dir * a * 0.6); ctx.beginPath(); ctx.ellipse(0, 0, 5 + (i % 3), 2.2, 0, 0, 7); ctx.fill(); ctx.restore();
    }
    ctx.restore();
  },
  drawTarget(ctx, t, wind) {
    const C = KAR.CFG, D = this.dist, F = this.faceD, R = F / 2, Y = C.FACE_Y;
    const ctr = this.proj(0, Y, D); if (!ctr) return;
    const k = ctr.k, OUT = this.OUT;
    const lw = Math.max(1.4, 0.012 * k);
    // legs + wooden frame
    const bw = F * 0.62 + 0.06;                       // half-width of the straw butt
    const legTop = Y - bw, bx = bw * 0.9;
    for (const s of [-1, 1]) { this.line3(ctx, [s * bx, legTop + 0.1, D + 0.15], [s * (bx + 0.35), 0, D + 0.5], OUT, lw * 4.2); this.line3(ctx, [s * bx, legTop + 0.1, D + 0.15], [s * (bx + 0.35), 0, D + 0.5], '#b9884e', lw * 2.6); }
    // straw butt: a rounded square boss 45 cm deep, built in 3D so it foreshortens when the camera swings round
    const rc = 0.12, T = 0.45, rim = (z) => {
      const pts = [];
      for (const [cx, cy, a0] of [[bw - rc, bw - rc, 0], [-bw + rc, bw - rc, 1.571], [-bw + rc, -bw + rc, 3.142], [bw - rc, -bw + rc, 4.712]])
        for (let i = 0; i <= 4; i++) { const a = a0 + i * 0.3927; pts.push(this.proj(cx + Math.cos(a) * rc, Y + cy + Math.sin(a) * rc, z)); }
      return pts;
    };
    const front = rim(D), back = rim(D + T);
    if (front.some(q => !q) || back.some(q => !q)) return;
    const path = pts => { ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.closePath(); };
    ctx.save(); ctx.lineJoin = 'round';
    if (Math.abs(this.cam.yaw) > 0.01) {         // the visible side of the boss
      const sd = this.cam.x > 0 ? 1 : -1, side = [this.proj(sd * bw, Y + bw - rc, D), this.proj(sd * bw, Y + bw - rc, D + T), this.proj(sd * bw, Y - bw + rc, D + T), this.proj(sd * bw, Y - bw + rc, D)];
      if (!side.some(q => !q)) { path(side); ctx.fillStyle = '#b68a32'; ctx.fill(); ctx.lineWidth = lw * 1.6; ctx.strokeStyle = OUT; ctx.stroke(); }
    }
    const top = front.reduce((a, q) => Math.min(a, q.y), 1e9), bot = front.reduce((a, q) => Math.max(a, q.y), -1e9);
    const x0 = front.reduce((a, q) => Math.min(a, q.x), 1e9), w = front.reduce((a, q) => Math.max(a, q.x), -1e9) - x0, y0 = top;
    path(front);
    const sg = ctx.createLinearGradient(0, top, 0, bot); sg.addColorStop(0, '#f3d56f'); sg.addColorStop(1, '#c99a38');
    ctx.fillStyle = sg; ctx.fill(); ctx.lineWidth = lw * 1.6; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.clip();
    const rnd = KAR.Util.rng(31);
    ctx.strokeStyle = 'rgba(140,90,20,0.45)'; ctx.lineWidth = Math.max(1, lw * 0.5); ctx.beginPath();
    for (let i = 0; i < 80; i++) { const sx = x0 + rnd() * w, sy = y0 + rnd() * (bot - top); ctx.moveTo(sx, sy); ctx.lineTo(sx + (rnd() - 0.5) * 0.18 * k, sy + 0.04 * k + rnd() * 0.07 * k); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(70,40,10,0.45)'; ctx.lineWidth = Math.max(1.4, lw);              // binding twine
    for (const f of [0.28, 0.72]) { const a = this.proj(-bw, Y + bw - 2 * bw * f, D), b = this.proj(bw, Y + bw - 2 * bw * f, D); if (a && b) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); } }
    ctx.restore();
    // face: ten rings
    // the face as a projected ellipse (a circle when seen square-on)
    const ring = (r) => { const a = this.proj(-r, Y, D), b = this.proj(r, Y, D), c = this.proj(0, Y + r, D), d = this.proj(0, Y - r, D); if (!a || !b || !c || !d) return false; ctx.beginPath(); ctx.ellipse((a.x + b.x) / 2, (c.y + d.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(d.y - c.y) / 2, 0, 0, 6.283); return true; };
    for (let i = 9; i >= 0; i--) {
      if (!ring(R * (i + 1) / 10)) continue;
      ctx.fillStyle = this.RING[i]; ctx.fill();
      ctx.lineWidth = Math.max(0.8, lw * 0.5); ctx.strokeStyle = (i === 6 || i === 7) ? 'rgba(255,255,255,0.55)' : 'rgba(20,20,30,0.55)'; ctx.stroke();
    }
    if (ring(R * 0.05)) { ctx.strokeStyle = 'rgba(20,20,30,0.6)'; ctx.lineWidth = Math.max(0.8, lw * 0.5); ctx.stroke(); }
    if (ring(R)) { ctx.strokeStyle = OUT; ctx.lineWidth = lw * 1.4; ctx.stroke(); }
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
  arrow(ctx, tip, dir, len, team, minLen, split) {
    const L = Math.hypot(dir.x, dir.y, dir.z) || 1, d = { x: dir.x / L, y: dir.y / L, z: dir.z / L };
    const tail = { x: tip.x - d.x * len, y: tip.y - d.y * len, z: tip.z - d.z * len };
    const p = this.proj(tip.x, tip.y, tip.z); let q = this.proj(tail.x, tail.y, tail.z); if (!p || !q) return;
    if (minLen) { let vx = q.x - p.x, vy = q.y - p.y, vl = Math.hypot(vx, vy); if (vl < minLen) { if (vl < 1) { vx = 0.25; vy = -1; vl = Math.hypot(vx, vy); } q = { x: p.x + vx / vl * minLen, y: p.y + vy / vl * minLen, k: q.k, zc: q.zc }; } }
    const col = this.TEAM[team || 0], w = Math.max(2.2 + 2.2 * (1 - this.zoom), 0.016 * p.k);
    ctx.save(); ctx.lineCap = 'round';
    if (split) {        // two splinters peeled apart from the tip, no fletching left to speak of
      const dx = q.x - p.x, dy = q.y - p.y, dl = Math.hypot(dx, dy) || 1, nx = -dy / dl * dl * 0.16, ny = dx / dl * dl * 0.16;
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.quadraticCurveTo(p.x + dx * 0.5 + nx * s * 0.6, p.y + dy * 0.5 + ny * s * 0.6, q.x + nx * s, q.y + ny * s); ctx.strokeStyle = this.OUT; ctx.lineWidth = w * 0.6 + 2.4; ctx.stroke(); ctx.strokeStyle = '#e8d6a8'; ctx.lineWidth = w * 0.6; ctx.stroke(); }
      ctx.restore(); return;
    }
    ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(p.x, p.y); ctx.strokeStyle = this.OUT; ctx.lineWidth = w + 2.4; ctx.stroke();
    ctx.strokeStyle = '#f2e6c8'; ctx.lineWidth = w; ctx.stroke();
    // fletching: three vanes at the tail
    const dx = q.x - p.x, dy = q.y - p.y, dl = Math.hypot(dx, dy) || 1, nx = -dy / dl, ny = dx / dl, fl = Math.min(dl * 0.28, 26 + 0.05 * p.k);
    for (const s of [-1, 0, 1]) { ctx.beginPath(); ctx.moveTo(q.x - dx / dl * 0.1, q.y - dy / dl * 0.1); ctx.lineTo(q.x + dx / dl * fl * 0.2 + nx * s * fl * 0.5, q.y + dy / dl * fl * 0.2 + ny * s * fl * 0.5); ctx.lineTo(q.x - dx / dl * fl + nx * s * fl * 0.1, q.y - dy / dl * fl + ny * s * fl * 0.1); ctx.closePath(); ctx.fillStyle = s ? col.base : col.light; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = this.OUT; ctx.stroke(); }
    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1.8, w * 0.7), 0, 6.283); ctx.fillStyle = '#cfd6de'; ctx.fill();
    ctx.restore();
  },
  // ---- the arrow as a real 3D object -----------------------------------------------
  // A 75 cm shaft along unit d ending at tip, three vanes 120° apart near the nock, drawn with the same
  // camera as everything else, so a stuck arrow seen from the shooting line foreshortens to its nock and
  // vane "star" (what an archer actually sees in a boss) and the arrow cam sees it from behind.
  // o: { stuck, split, rot, shadow }
  arrow3(ctx, tip, d, len, team, o) {
    o = o || {};
    const col = this.TEAM[team || 0], OUT = this.OUT;
    const tail = { x: tip.x - d.x * len, y: tip.y - d.y * len, z: tip.z - d.z * len };
    const p = this.proj(tip.x, tip.y, tip.z), q = this.proj(tail.x, tail.y, tail.z);
    if (!p || !q) return;
    // a frame around the shaft: u sideways, v "up" (both perpendicular to d)
    let ux = d.z, uz = -d.x, ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;
    const u = { x: ux, y: 0, z: uz }, v = { x: d.y * uz, y: d.z * ux - d.x * uz, z: -d.y * ux };
    const at = (s, ra, rb) => this.proj(tail.x + d.x * s + u.x * ra + v.x * rb, tail.y + d.y * s + u.y * ra + v.y * rb, tail.z + d.z * s + u.z * ra + v.z * rb);
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // shadow on the face + the hole the point punched (sun high on the right: shadow falls down-left)
    if (o.shadow) {
      const D = tip.z, e = this.proj(tip.x + (tail.x - tip.x) * 0.5 - 0.05, tip.y - 0.09, D);
      if (e) { ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(e.x, e.y); ctx.strokeStyle = 'rgba(40,25,5,0.2)'; ctx.lineWidth = Math.max(2.5, 0.016 * p.k); ctx.stroke(); }
      ctx.beginPath(); ctx.ellipse(p.x, p.y, Math.max(2.2, 0.009 * p.k), Math.max(1.8, 0.007 * p.k), 0, 0, 6.283); ctx.fillStyle = 'rgba(25,15,5,0.6)'; ctx.fill();
    }
    const wT = Math.max(1.6, 0.011 * p.k), wN = Math.max(1.8, 0.011 * q.k);
    const shaft = (a, b, w0, w1, c) => {
      const dx = b.x - a.x, dy = b.y - a.y, dl = Math.hypot(dx, dy) || 1, nx = -dy / dl, ny = dx / dl;
      ctx.beginPath(); ctx.moveTo(a.x + nx * w0 / 2, a.y + ny * w0 / 2); ctx.lineTo(b.x + nx * w1 / 2, b.y + ny * w1 / 2); ctx.lineTo(b.x - nx * w1 / 2, b.y - ny * w1 / 2); ctx.lineTo(a.x - nx * w0 / 2, a.y - ny * w0 / 2); ctx.closePath();
      ctx.fillStyle = c; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = OUT; ctx.stroke();
    };
    if (o.split) {                      // ROBIN HOOD victim: the shaft peeled into two splinters, vanes shredded
      for (const sg of [-1, 1]) { const b = at(0, sg * 0.05, 0.02); if (b) shaft(p, b, wT * 0.7, wN * 0.6, '#e8d6a8'); }
      ctx.restore(); return;
    }
    // vanes: draw the ones on the far side of the shaft first
    const rot = o.rot || 0, cam = this.cam, vanes = [];
    for (let i = 0; i < 3; i++) {
      const a = rot + i * 2.0944, ca = Math.cos(a), sa = Math.sin(a);
      const r = { x: u.x * ca + v.x * sa, y: u.y * ca + v.y * sa, z: u.z * ca + v.z * sa };
      const toCam = (cam.x - tail.x) * r.x + (cam.y - tail.y) * r.y + (cam.z - tail.z) * r.z;
      vanes.push({ ca, sa, i, far: toCam < 0 });
    }
    const vane = (V) => {
      const R = 0.032, pts = [at(0.03, 0, 0), at(0.05, V.ca * R, V.sa * R), at(0.11, V.ca * R * 0.85, V.sa * R * 0.85), at(0.15, 0, 0)];
      if (pts.some(x => !x)) return;
      ctx.beginPath(); pts.forEach((x, k) => (k ? ctx.lineTo(x.x, x.y) : ctx.moveTo(x.x, x.y))); ctx.closePath();
      ctx.fillStyle = V.i === 0 ? col.light : col.base; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = OUT; ctx.stroke();
    };
    vanes.filter(V => V.far).forEach(vane);
    shaft(p, q, wT, wN, '#f2e6c8');
    // a highlight down the shaft
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = Math.max(0.8, Math.min(wT, wN) * 0.3); ctx.stroke();
    vanes.filter(V => !V.far).forEach(vane);
    // nock
    ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(1.8, wN * 0.75), 0, 6.283); ctx.fillStyle = col.dark; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = OUT; ctx.stroke();
    if (!o.stuck) { ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1.6, wT * 0.6), 0, 6.283); ctx.fillStyle = '#cfd6de'; ctx.fill(); }
    ctx.restore();
  },

  // How a stuck arrow rests: the flight direction plus a small per-arrow lean (shaft flex and the way it bit),
  // tail up. Deterministic from where it hit, so it never flickers between frames.
  restDir(h) {
    const L = Math.hypot(h.vx, h.vy, h.vz) || 1, f = n => { const x = Math.sin(h.x * 127.1 + h.y * 311.7 + n * 74.7) * 43758.5453; return x - Math.floor(x); };
    const d = { x: h.vx / L + (f(1) - 0.5) * 0.24, y: h.vy / L - 0.06 - f(2) * 0.10, z: h.vz / L }, l = Math.hypot(d.x, d.y, d.z);
    return { x: d.x / l, y: d.y / l, z: d.z / l, rot: f(3) * 2.09 };
  },
  // age: seconds since this arrow landed (fresh hits sink in, flex from the flight line to rest, and quiver)
  stuck(ctx, a, team, age) {
    if (!a.hit) return;
    const h = a.hit, rd = this.restDir(h), L = Math.hypot(h.vx, h.vy, h.vz) || 1;
    let d = rd, len = 0.62;
    if (age !== undefined && age < 1.4) {
      const bite = Math.min(1, age / 0.07), settle = KAR.Util.easeOut(Math.min(1, age / 0.12));
      len = 0.75 - 0.13 * bite;                                                    // the point drives in
      const fl = { x: h.vx / L, y: h.vy / L, z: h.vz / L };
      d = { x: KAR.Util.lerp(fl.x, rd.x, settle), y: KAR.Util.lerp(fl.y, rd.y, settle), z: KAR.Util.lerp(fl.z, rd.z, settle) };
      const qv = Math.exp(-age * 4.5) * Math.sin(age * 58) * 0.07, qh = Math.exp(-age * 4.5) * Math.cos(age * 47) * 0.035;   // the tail shivers, the tip is held
      d.x += qh; d.y += qv; const l = Math.hypot(d.x, d.y, d.z); d.x /= l; d.y /= l; d.z /= l;
    }
    this.arrow3(ctx, { x: h.x, y: h.y, z: this.dist }, d, len, team, { stuck: true, split: a.split, rot: rd.rot, shadow: true });
  },

  // ---- BALLOON POP ------------------------------------------------------------------
  BALLOON: ['#ff4f5e', '#3fa0ff', '#8fdc3e', '#c46bff'],
  drawBalloons(ctx, m, t) {
    const R = KAR.Trick.R, D = m.dist, OUT = this.OUT;
    for (const b of m.balloons) {
      if (b.popAt !== null && m.T >= b.popAt) continue;
      const p = m.pos(b, m.T), q = this.proj(p.x, p.y, D); if (!q) continue;
      const r = R * q.k, col = b.gold ? '#ffd34d' : this.BALLOON[b.col];
      // string, swinging under the knot
      ctx.save(); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(q.x, q.y + r * 1.12);
      for (let i = 1; i <= 6; i++) ctx.lineTo(q.x + Math.sin(t * 2.4 + b.ph + i * 0.9) * r * 0.16 * i / 6, q.y + r * 1.12 + i * r * 0.55);
      ctx.strokeStyle = 'rgba(40,40,50,0.7)'; ctx.lineWidth = Math.max(1, r * 0.05); ctx.stroke();
      // body + knot
      ctx.beginPath(); ctx.moveTo(q.x - r * 0.14, q.y + r * 1.2); ctx.lineTo(q.x + r * 0.14, q.y + r * 1.2); ctx.lineTo(q.x, q.y + r * 1.02); ctx.closePath(); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = Math.max(1.2, r * 0.07); ctx.strokeStyle = OUT; ctx.stroke();
      const g = ctx.createRadialGradient(q.x - r * 0.35, q.y - r * 0.4, r * 0.1, q.x, q.y, r * 1.15);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.18, col); g.addColorStop(1, b.gold ? '#c9800e' : 'rgba(0,0,0,0.55)');
      ctx.beginPath(); ctx.ellipse(q.x, q.y, r * 0.9, r * 1.08, Math.sin(t * 1.3 + b.ph) * 0.08, 0, 6.283);
      ctx.fillStyle = col; ctx.fill(); ctx.globalAlpha = 0.55; ctx.fillStyle = g; ctx.fill(); ctx.globalAlpha = 1;
      ctx.lineWidth = Math.max(1.4, r * 0.08); ctx.strokeStyle = OUT; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(q.x - r * 0.36, q.y - r * 0.44, r * 0.16, r * 0.26, -0.5, 0, 6.283); ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fill();
      if (b.gold) { const s = r * (0.35 + 0.15 * Math.sin(t * 9 + b.ph)); ctx.translate(q.x + r * 0.6, q.y - r * 0.8); ctx.rotate(t * 2); ctx.fillStyle = '#ffffff'; ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = i * 0.785, rr = i % 2 ? s * 0.3 : s; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); }
      ctx.restore();
    }
  },

  // ---- first-person bow + sight ----------------------------------------------------------
  // A right-handed recurve seen from the archer's eye. It is built in camera space (metres: x right,
  // y up, z forward) and projected around the sight: the aperture sits on the aim axis at (sx, sy),
  // so the whole rig follows the sight and its sway. draw 0..1 brings the bow up and pulls the nock
  // from brace height back to the anchor under the chin: the limbs bend back, the recurves unroll,
  // the string folds into a V and the arrow slides back through the rest until its point clicks past
  // the clicker. o.creep (seconds held past the steady window) lets the draw shake and creep forward.
  // rel 0..1: the moment after the release - the string slaps home and shivers, and the bow rolls
  // forward out of a loose hand.
  bow(ctx, sx, sy, draw, team, t, rel, o) {
    o = o || {};
    const col = this.TEAM[team || 0], OUT = this.OUT, U = KAR.Util;
    const F = 330, ZN = 0.07, GX = 0.045, GZ = 0.74, MID = -0.06, GRIP = -0.15;
    let p = U.clamp(draw, 0, 1), roll = 0, ox = sx, oy = sy, vib = 0;
    if (rel > 0) {
      const e = U.easeOut(rel); p = 0; roll = 0.6 * e; ox -= 40 * e; oy += 60 * e + 240 * rel * rel;
      vib = Math.sin(rel * 70) * (1 - rel) * 0.014;
    } else {
      oy += (1 - U.easeOut(Math.min(1, p * 3.5))) * 170;                 // the bow comes up as the draw starts
      const c = o.creep || 0;
      if (c > 0) { p -= Math.min(0.05, c * 0.02) + Math.abs(Math.sin(t * 19)) * Math.min(0.012, c * 0.006); ox += Math.sin(t * 23) * Math.min(3, c * 1.5); }
    }
    // the bow rolls forward about the grip after the release
    const rot = v => { if (!roll) return v; const dy = v.y - GRIP, dz = v.z - GZ, c = Math.cos(roll), s = Math.sin(roll); return { x: v.x, y: GRIP + dy * c - dz * s, z: GZ + dy * s + dz * c }; };
    const P = v => { v = rot(v); const z = Math.max(ZN, v.z); return { x: ox + F * v.x / z, y: oy - F * v.y / z, s: F / z }; };
    const lerp3 = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k });
    // a camera-space segment cut at the near plane (the anchor end sits almost at the eye)
    const seg = (a, b) => { a = rot(a); b = rot(b); if (a.z < ZN && b.z < ZN) return null; if (a.z < ZN) a = lerp3(a, b, (ZN - a.z) / (b.z - a.z)); if (b.z < ZN) b = lerp3(b, a, (ZN - b.z) / (a.z - b.z)); return [a, b]; };
    const Pr = v => ({ x: ox + F * v.x / v.z, y: oy - F * v.y / v.z, s: F / v.z });
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // limbs: they bend back toward the archer as the draw comes on, and the recurve curls unroll
    const k = 0.298 + 0.096 * p, curl = 1.2 - 0.7 * p;
    // the eye sits right of the bow's plane, so a limb bending back toward the archer swings left on screen
    const YS = Math.sin(0.45), YC = Math.cos(0.45), yaw = (y, d) => ({ x: GX + d * YS, y, z: GZ + d * YC });
    const limb = sg => { const pts = []; for (let i = 0; i <= 16; i++) { const s = i / 16; pts.push({ s, v: yaw(MID + sg * (0.27 + 0.55 * s - 0.04 * p * s * s), 0.03 * s - k * s * s + curl * Math.max(0, s - 0.78) ** 2) }); } return pts; };
    const drawLimb = pts => {
      const L = [], Rr = [];
      for (const { s, v } of pts) { const w = 0.042 - 0.026 * s; L.push(P({ x: v.x - w / 2, y: v.y, z: v.z })); Rr.push(P({ x: v.x + w / 2, y: v.y, z: v.z })); }
      ctx.beginPath(); L.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); for (let i = Rr.length - 1; i >= 0; i--) ctx.lineTo(Rr[i].x, Rr[i].y); ctx.closePath();
      ctx.fillStyle = '#a8703a'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke();
      ctx.beginPath(); pts.forEach(({ v }, i) => { const q = P({ x: v.x - 0.006, y: v.y, z: v.z }); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,230,170,0.6)'; ctx.stroke();
      const tp = P(pts[pts.length - 1].v); ctx.beginPath(); ctx.arc(tp.x, tp.y, Math.max(4, 0.016 * tp.s), 0, 6.283); ctx.fillStyle = col.base; ctx.fill(); ctx.lineWidth = 2.5; ctx.stroke();
      return pts[pts.length - 1].v;
    };
    const up = limb(1), lo = limb(-1);
    const tipU = drawLimb(up), tipL = drawLimb(lo);

    // riser: dark wood, cut away into a sight window above the grip, a team-colour stripe down the back
    const RT = MID + 0.27, RB = MID - 0.27, hw = 0.019;
    const rs = [[RT, 0], [0.06, 0], [0.035, 0.009], [-0.07, 0.009], [-0.085, 0], [RB, 0]];
    ctx.beginPath();
    rs.forEach(([y, cut], i) => { const q = P({ x: GX - hw + cut, y, z: GZ }); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); });
    for (let i = rs.length - 1; i >= 0; i--) { const y = rs[i][0], q = P({ x: GX + hw + (y < -0.1 && y > -0.22 ? 0.006 : 0), y, z: GZ }); ctx.lineTo(q.x, q.y); }
    ctx.closePath(); ctx.fillStyle = '#6b4322'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke();
    { const a = P({ x: GX + hw * 0.45, y: RT - 0.02, z: GZ }), b = P({ x: GX + hw * 0.45, y: RB + 0.02, z: GZ }); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineWidth = Math.max(2, 0.006 * a.s); ctx.strokeStyle = col.base; ctx.stroke(); }

    // sight: a block on the riser and an extension rod out to the aperture (the reticle ring)
    { const a = P({ x: GX - hw, y: 0.02, z: GZ + 0.02 }), b = P({ x: 0.012, y: 0.004, z: 1.0 });
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineWidth = 7; ctx.strokeStyle = OUT; ctx.stroke(); ctx.lineWidth = 3.5; ctx.strokeStyle = '#8c96a3'; ctx.stroke();
      const m1 = P({ x: GX - hw - 0.006, y: 0.045, z: GZ }), m2 = P({ x: GX - hw + 0.004, y: -0.005, z: GZ });
      ctx.beginPath(); ctx.rect(m1.x, m1.y, m2.x - m1.x, m2.y - m1.y); ctx.fillStyle = '#3a414c'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke(); }

    // bow arm + hand wrapped round the grip
    { const sh = seg({ x: -0.16, y: -0.42, z: 0.12 }, { x: GX - 0.01, y: GRIP - 0.03, z: GZ - 0.03 });
      if (sh) { const a = Pr(sh[0]), b = Pr(sh[1]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineWidth = 0.075 * b.s + 10; ctx.strokeStyle = OUT; ctx.stroke(); ctx.lineWidth = 0.075 * b.s + 4; ctx.strokeStyle = col.base; ctx.stroke();
        const w = lerp3(sh[1], sh[0], 0.12), wq = Pr(w); ctx.beginPath(); ctx.moveTo(wq.x, wq.y); ctx.lineTo(b.x, b.y); ctx.lineWidth = 0.062 * b.s; ctx.strokeStyle = '#f0b98a'; ctx.stroke(); }
      const h = P({ x: GX - 0.004, y: GRIP, z: GZ - 0.02 }), r = 0.05 * h.s;
      ctx.beginPath(); ctx.ellipse(h.x, h.y, r * 0.95, r * 1.15, 0.1, 0, 6.283); ctx.fillStyle = '#f0b98a'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke();
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(h.x + r * 0.15, h.y - r * 0.45 + i * r * 0.42); ctx.lineTo(h.x + r * 0.85, h.y - r * 0.38 + i * r * 0.42); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(120,70,40,0.6)'; ctx.stroke(); }
      const th = P({ x: GX - 0.026, y: GRIP + 0.05, z: GZ + 0.01 }); ctx.beginPath(); ctx.ellipse(th.x, th.y, r * 0.32, r * 0.55, -0.35, 0, 6.283); ctx.fillStyle = '#f0b98a'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = OUT; ctx.stroke(); }

    // nock: on the braced string at rest, under the chin at full draw
    const brace = yaw(-0.075, -0.21), anchor = { x: 0.02, y: -0.11, z: 0.035 };
    const nock = lerp3(brace, anchor, U.easeOut(p) * 0.35 + p * 0.65);
    const REST = { x: 0.027, y: -0.075, z: GZ - 0.01 }, CLICK_Z = GZ + 0.025;
    let tip = null;
    if (rel <= 0) {
      // the arrow: shaft from the nock through the rest, three vanes at the back, a steel point
      const d = { x: REST.x - nock.x, y: REST.y - nock.y, z: REST.z - nock.z }, dl = Math.hypot(d.x, d.y, d.z); d.x /= dl; d.y /= dl; d.z /= dl;
      const at = s => ({ x: nock.x + d.x * s, y: nock.y + d.y * s, z: nock.z + d.z * s });
      tip = at(0.74);
      const sh = seg(nock, tip);
      if (sh) {
        const N = 12; let prev = Pr(sh[0]);
        for (let i = 1; i <= N; i++) { const q = Pr(lerp3(sh[0], sh[1], i / N)), w = Math.max(2.4, 0.008 * (q.s + prev.s) / 2);
          ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(q.x, q.y); ctx.lineWidth = w + 3; ctx.strokeStyle = OUT; ctx.stroke(); prev = q; }
        prev = Pr(sh[0]);
        for (let i = 1; i <= N; i++) { const f = i / N, q = Pr(lerp3(sh[0], sh[1], f)), w = Math.max(2.4, 0.008 * (q.s + prev.s) / 2);
          ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(q.x, q.y); ctx.lineWidth = w; ctx.strokeStyle = f > 0.96 ? '#c9d1d9' : '#f2e6c8'; ctx.stroke(); prev = q; }
        // vanes - big and soft while the nock is close to the eye
        const ux = d.z, uz = -d.x, ul = Math.hypot(ux, uz) || 1, u = { x: ux / ul, y: 0, z: uz / ul };
        const v = { x: u.y * d.z - u.z * d.y, y: u.z * d.x - u.x * d.z, z: u.x * d.y - u.y * d.x };
        for (const [ang, c] of [[Math.PI, col.base], [Math.PI / 3, col.light], [-Math.PI / 3, col.light]]) {
          const ca = Math.cos(ang), sa = Math.sin(ang), dir = { x: u.x * ca + v.x * sa, y: u.y * ca + v.y * sa, z: u.z * ca + v.z * sa };
          const off = (s, h) => { const b = at(s); return { x: b.x + dir.x * h, y: b.y + dir.y * h, z: b.z + dir.z * h }; };
          const pts = [off(0.025, 0), off(0.035, 0.016), off(0.075, 0.013), off(0.115, 0)];
          if (pts.some(q => rot(q).z < ZN + 0.02)) continue;
          ctx.beginPath(); pts.forEach((q, i) => { const r = P(q); i ? ctx.lineTo(r.x, r.y) : ctx.moveTo(r.x, r.y); }); ctx.closePath();
          ctx.fillStyle = c; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
        }
      }
    }
    // clicker: a thin blade on the riser that rides on the arrow until the point is drawn past it
    { const passed = !tip || tip.z < CLICK_Z, top = P({ x: GX - hw - 0.002, y: -0.025, z: CLICK_Z }), bot = P({ x: passed ? GX - hw - 0.002 : GX - hw - 0.009, y: passed ? -0.07 : -0.069, z: CLICK_Z });
      ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(bot.x, bot.y); ctx.lineWidth = 4; ctx.strokeStyle = OUT; ctx.stroke(); ctx.lineWidth = 2; ctx.strokeStyle = '#d8dee6'; ctx.stroke(); }

    // string: tip to nock to tip - fine and sharp at the bow, a soft blur where it passes the eye
    const sn = rel > 0 ? { x: brace.x + vib, y: brace.y, z: brace.z } : nock;
    for (const end of [tipU, tipL]) {
      const sg = seg(end, sn); if (!sg) continue;
      const N = 10; let prev = Pr(sg[0]);
      for (let i = 1; i <= N; i++) { const q = Pr(lerp3(sg[0], sg[1], i / N)), w = Math.max(1.6, Math.min(9, 0.0024 * q.s));
        ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(q.x, q.y);
        if (w > 4) { ctx.lineWidth = w; ctx.strokeStyle = 'rgba(255,246,224,' + Math.min(0.7, 3 / w) + ')'; ctx.stroke(); }
        else { ctx.lineWidth = w + 1.6; ctx.strokeStyle = OUT; ctx.stroke(); ctx.lineWidth = w; ctx.strokeStyle = '#fff6e0'; ctx.stroke(); }
        prev = q; }
    }

    // the draw hand: a leather tab on three fingers hooked round the string, gone below frame at anchor
    if (rel <= 0 && nock.z > 0.2) {
      const h = P({ x: nock.x + 0.012, y: nock.y - 0.004, z: nock.z }), r = 0.03 * h.s, fade = U.clamp((nock.z - 0.2) / 0.12, 0, 1);
      ctx.globalAlpha = fade;
      const arm = seg({ x: nock.x + 0.03, y: nock.y - 0.01, z: nock.z }, { x: 0.22, y: -0.34, z: 0.06 });
      if (arm) { const a = Pr(arm[0]), b = Pr(arm[1]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineWidth = 0.07 * a.s + 6; ctx.strokeStyle = OUT; ctx.stroke(); ctx.lineWidth = 0.07 * a.s; ctx.strokeStyle = '#f0b98a'; ctx.stroke(); }
      ctx.beginPath(); ctx.ellipse(h.x + r * 0.5, h.y + r * 0.2, r * 1.2, r * 0.95, 0.3, 0, 6.283); ctx.fillStyle = '#f0b98a'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = OUT; ctx.stroke();
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.ellipse(h.x - r * 0.25, h.y + i * r * 0.55, r * 0.5, r * 0.3, 0, 0, 6.283); ctx.fillStyle = '#e6a877'; ctx.fill(); ctx.stroke(); }
      ctx.beginPath(); ctx.ellipse(h.x - r * 0.05, h.y, r * 0.42, r * 1.05, 0, 0, 6.283); ctx.fillStyle = '#4a2d18'; ctx.fill(); ctx.stroke();
      ctx.globalAlpha = 1;
    }
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
if (typeof Image !== 'undefined') ['bg-menu', 'bg-range-1', 'bg-range-2'].forEach(n => KAR.Render._photo(n));
