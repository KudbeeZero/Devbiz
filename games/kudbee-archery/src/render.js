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

  // viewD: how much the scope frames (defaults to the face; SWINGER frames the whole swing)
  setView(zoom, dist, faceD, viewD) {
    const C = KAR.CFG, U = KAR.Util, e = U.smooth(zoom), c = this.cam;
    this.zoom = e; this.dist = dist; this.faceD = faceD;
    const Fs = 0.4 * this.H * dist / (viewD || faceD), Fw = 2000;
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
    if (this.venue === 1) return this._forest(ctx, t, hy);
    if (this.venue === 2) return this._mountain(ctx, t, hy);
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
  // ---- the TOUR venues: painted scenes keyed to the horizon, so they track the camera like the photos do ----
  // pines: a ragged band of conifer silhouettes along y = base (h: typical height, seed: layout)
  _pines(ctx, base, h, col, seed, step) {
    const W = this.W, rnd = KAR.Util.rng(seed);
    ctx.fillStyle = col; ctx.beginPath(); ctx.rect(-20, base - 2, W + 40, 60);
    for (let x = -20; x < W + 40; x += step * (0.55 + rnd() * 0.9)) {
      const th = h * (0.55 + rnd() * 0.75), w = th * (0.2 + rnd() * 0.06), lean = (rnd() - 0.5) * th * 0.04;
      for (let k = 0; k < 4; k++) {                       // four tiers of boughs, narrowing to the tip
        const top = base - th * (0.3 + k * 0.24), bot = base - th * k * 0.2 + 2, ww = w * (1 - k * 0.22);
        ctx.moveTo(x + lean * (k + 1), top - (k === 3 ? th * 0.1 : 0)); ctx.lineTo(x + ww, bot); ctx.lineTo(x + ww * 0.35, bot - th * 0.03); ctx.lineTo(x - ww * 0.35, bot - th * 0.03); ctx.lineTo(x - ww, bot); ctx.closePath();
      }
    }
    ctx.fill();
  },
  _forest(ctx, t, hy) {
    const W = this.W, H = this.H;
    const sky = ctx.createLinearGradient(0, 0, 0, hy); sky.addColorStop(0, '#5f9ad8'); sky.addColorStop(0.6, '#bcd8e8'); sky.addColorStop(1, '#ffe2a8');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, hy + 2);
    const sx = 170, sy = hy - 170, sg = ctx.createRadialGradient(sx, sy, 8, sx, sy, 300); sg.addColorStop(0, 'rgba(255,246,210,1)'); sg.addColorStop(0.12, 'rgba(255,230,160,0.8)'); sg.addColorStop(1, 'rgba(255,220,150,0)');
    ctx.fillStyle = sg; ctx.fillRect(0, 0, W, hy + 2);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (let i = 0; i < 4; i++) { const cx = ((i * 290 + t * (4 + i)) % (W + 300)) - 150, cy = 40 + (i % 2) * 44; ctx.beginPath(); ctx.ellipse(cx, cy, 90, 16, 0, 0, 7); ctx.ellipse(cx + 50, cy + 6, 60, 12, 0, 0, 7); ctx.fill(); }
    const hill = (base, amp, col, f, ph) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, hy + 2); for (let x = 0; x <= W; x += 16) ctx.lineTo(x, hy - base - Math.sin(x * f + ph) * amp - Math.sin(x * f * 2.3 + ph * 2) * amp * 0.4); ctx.lineTo(W, hy + 2); ctx.closePath(); ctx.fill(); };
    hill(70, 30, '#a9c3c9', 0.005, 2);
    this._pines(ctx, hy - 34, 70, '#6f9a8a', 11, 26); this._pines(ctx, hy - 14, 90, '#3f6e52', 12, 30); this._pines(ctx, hy + 2, 120, '#24503a', 13, 38);
    // shafts of late light through the trees
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) { const a = 0.55 + i * 0.13 + Math.sin(t * 0.3 + i) * 0.02, g = ctx.createLinearGradient(sx, sy, sx + Math.cos(a) * 700, sy + Math.sin(a) * 700); g.addColorStop(0, 'rgba(255,220,150,0.16)'); g.addColorStop(1, 'rgba(255,220,150,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(a - 0.035) * 800, sy + Math.sin(a - 0.035) * 800); ctx.lineTo(sx + Math.cos(a + 0.035) * 800, sy + Math.sin(a + 0.035) * 800); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    this._field(ctx, hy, false, ['#86bb4c', '#3a7a2c']);
    const v = ctx.createRadialGradient(W / 2, H * 0.55, H * 0.4, W / 2, H * 0.55, H * 0.95); v.addColorStop(0, 'rgba(40,30,10,0)'); v.addColorStop(1, 'rgba(40,30,10,0.28)'); ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  },
  _mountain(ctx, t, hy) {
    const W = this.W, H = this.H;
    const sky = ctx.createLinearGradient(0, 0, 0, hy); sky.addColorStop(0, '#2c3470'); sky.addColorStop(0.45, '#8a5a9a'); sky.addColorStop(0.8, '#f2876a'); sky.addColorStop(1, '#ffcf7a');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, hy + 2);
    const sx = 700, sy = hy - 64, sg = ctx.createRadialGradient(sx, sy, 10, sx, sy, 360); sg.addColorStop(0, 'rgba(255,240,190,0.95)'); sg.addColorStop(0.1, 'rgba(255,190,110,0.6)'); sg.addColorStop(1, 'rgba(255,150,90,0)');
    ctx.fillStyle = sg; ctx.fillRect(0, 0, W, hy + 2);
    ctx.beginPath(); ctx.arc(sx, sy, 34, 0, 6.283); ctx.fillStyle = '#fff1c4'; ctx.fill();
    ctx.fillStyle = 'rgba(255,200,170,0.55)';
    for (let i = 0; i < 4; i++) { const cx = ((i * 270 + t * (3 + i)) % (W + 300)) - 150, cy = 60 + (i % 2) * 50; ctx.beginPath(); ctx.ellipse(cx, cy, 110, 9, 0, 0, 7); ctx.ellipse(cx + 70, cy + 7, 70, 7, 0, 0, 7); ctx.fill(); }
    // two ranges of peaks: the far one hazy violet with snow, the near one dark
    const range = (base, hgt, col, snow, seed, n) => {
      const rnd = KAR.Util.rng(seed), pts = [];
      for (let i = 0; i <= n * 2; i++) pts.push([i * (W + 120) / (n * 2) - 60 + (rnd() - 0.5) * 30, base - hgt * (i % 2 ? 0.5 + rnd() * 0.5 : 0.08 + rnd() * 0.22)]);
      ctx.beginPath(); ctx.moveTo(-60, hy + 2); pts.forEach(([x, y]) => ctx.lineTo(x, y)); ctx.lineTo(W + 60, hy + 2); ctx.closePath();
      const g = ctx.createLinearGradient(0, base - hgt, 0, hy); g.addColorStop(0, col[0]); g.addColorStop(1, col[1]); ctx.fillStyle = g; ctx.fill();
      // the lit (sun-side, right) face of each peak, then a snow cap with a ragged lower edge
      for (let i = 1; i < pts.length - 1; i += 2) {
        const [px, py] = pts[i], [lx, ly] = pts[i - 1], [rx, ry] = pts[i + 1], L = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
        const foot = [px + (rx - px) * 0.15, Math.max(ly, ry)];
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(rx, ry); ctx.lineTo(foot[0], foot[1]); ctx.closePath(); ctx.fillStyle = 'rgba(255,170,140,0.16)'; ctx.fill();
        if (!snow || base - py < hgt * 0.55) continue;
        const f = 0.3, a = L([px, py], [lx, ly], f), b = L([px, py], [rx, ry], f * 0.85), m = L(a, b, 0.5);
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(b[0], b[1]); ctx.lineTo(L(b, m, 0.5)[0], m[1] - (b[1] - py) * 0.12); ctx.lineTo(m[0], m[1] + (b[1] - py) * 0.18); ctx.lineTo(L(a, m, 0.5)[0], m[1] - (a[1] - py) * 0.1); ctx.lineTo(a[0], a[1]); ctx.closePath();
        ctx.fillStyle = snow; ctx.fill();
      }
    };
    range(hy - 26, 190, ['#8c7ab8', '#c99aa8'], 'rgba(255,232,228,0.92)', 5, 5);
    range(hy - 8, 100, ['#4e4a7a', '#6e5f86'], null, 9, 8);
    this._pines(ctx, hy + 2, 60, '#2a2f4a', 21, 22);
    this._field(ctx, hy, false, ['#a8b45a', '#466a2e']);
    ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = 'rgba(255,200,170,0.3)'; ctx.fillRect(0, hy, W, H - hy); ctx.restore();
    const v = ctx.createRadialGradient(W / 2, H * 0.5, H * 0.35, W / 2, H * 0.5, H * 0.95); v.addColorStop(0, 'rgba(30,10,40,0)'); v.addColorStop(1, 'rgba(30,10,40,0.35)'); ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  },
  _field(ctx, hy, photo, pal) {
    const W = this.W, H = this.H;
    const gg = ctx.createLinearGradient(0, hy, 0, H); gg.addColorStop(0, pal ? pal[0] : photo ? '#7aa83e' : '#79cc55'); gg.addColorStop(1, pal ? pal[1] : photo ? '#4a8a2e' : '#3f9a36');
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
  // swing: SWINGER - the boss hangs on two ropes from a frame and is drawn wherever tOff (its swing offset) puts it
  drawTarget(ctx, t, wind, swing) {
    const C = KAR.CFG, D = this.dist, F = this.faceD, R = F / 2, Y = C.FACE_Y;
    const o = (swing && this.tOff) || { x: 0, y: 0 }, P = (x, y, z) => this.proj(x + o.x, y + o.y, z);
    const ctr = P(0, Y, D); if (!ctr) return;
    const k = ctr.k, OUT = this.OUT;
    const lw = Math.max(1.4, 0.012 * k);
    // legs + wooden frame
    const bw = F * 0.62 + 0.06;                       // half-width of the straw butt
    const legTop = Y - bw, bx = bw * 0.9;
    if (swing === 'slide') this._rail(ctx, o, bw, bx, Y, D, lw);
    else if (swing) this._gantry(ctx, o, bw, Y, D, lw);
    else for (const s of [-1, 1]) { this.line3(ctx, [s * bx, legTop + 0.1, D + 0.15], [s * (bx + 0.35), 0, D + 0.5], OUT, lw * 4.2); this.line3(ctx, [s * bx, legTop + 0.1, D + 0.15], [s * (bx + 0.35), 0, D + 0.5], '#b9884e', lw * 2.6); }
    // straw butt: a rounded square boss 45 cm deep, built in 3D so it foreshortens when the camera swings round
    const rc = 0.12, T = 0.45, rim = (z) => {
      const pts = [];
      for (const [cx, cy, a0] of [[bw - rc, bw - rc, 0], [-bw + rc, bw - rc, 1.571], [-bw + rc, -bw + rc, 3.142], [bw - rc, -bw + rc, 4.712]])
        for (let i = 0; i <= 4; i++) { const a = a0 + i * 0.3927; pts.push(P(cx + Math.cos(a) * rc, Y + cy + Math.sin(a) * rc, z)); }
      return pts;
    };
    const front = rim(D), back = rim(D + T);
    if (front.some(q => !q) || back.some(q => !q)) return;
    const path = pts => { ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.closePath(); };
    ctx.save(); ctx.lineJoin = 'round';
    if (Math.abs(this.cam.yaw) > 0.01) {         // the visible side of the boss
      const sd = this.cam.x > 0 ? 1 : -1, side = [P(sd * bw, Y + bw - rc, D), P(sd * bw, Y + bw - rc, D + T), P(sd * bw, Y - bw + rc, D + T), P(sd * bw, Y - bw + rc, D)];
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
    for (const f of [0.28, 0.72]) { const a = P(-bw, Y + bw - 2 * bw * f, D), b = P(bw, Y + bw - 2 * bw * f, D); if (a && b) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); } }
    ctx.restore();
    // face: ten rings
    // the face as a projected ellipse (a circle when seen square-on)
    const ring = (r) => { const a = P(-r, Y, D), b = P(r, Y, D), c = P(0, Y + r, D), d = P(0, Y - r, D); if (!a || !b || !c || !d) return false; ctx.beginPath(); ctx.ellipse((a.x + b.x) / 2, (c.y + d.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(d.y - c.y) / 2, 0, 0, 6.283); return true; };
    for (let i = 9; i >= 0; i--) {
      if (!ring(R * (i + 1) / 10)) continue;
      ctx.fillStyle = this.RING[i]; ctx.fill();
      ctx.lineWidth = Math.max(0.8, lw * 0.5); ctx.strokeStyle = (i === 6 || i === 7) ? 'rgba(255,255,255,0.55)' : 'rgba(20,20,30,0.55)'; ctx.stroke();
    }
    if (ring(R * 0.05)) { ctx.strokeStyle = 'rgba(20,20,30,0.6)'; ctx.lineWidth = Math.max(0.8, lw * 0.5); ctx.stroke(); }
    if (ring(R)) { ctx.strokeStyle = OUT; ctx.lineWidth = lw * 1.4; ctx.stroke(); }
    // pennants either side, streaming with the wind
    const fx = swing === 'slide' ? (this.railA || 1) + bw + 0.8 : swing ? 2.9 : bw + 0.35;
    this._flag(ctx, -fx, D + 0.3, wind, t, '#ff5d5d'); this._flag(ctx, fx, D + 0.3, wind, t, '#ffd34d');
  },
  // SWINGER frame: two timber posts and a cross-beam, two ropes down to the top of the boss (parallel ropes keep it upright)
  _gantry(ctx, o, bw, Y, D, lw) {
    const OUT = this.OUT, top = Y + bw + KAR.Swing.L, zb = D + 0.25, X = 2.4;
    for (const s of [-1, 1]) { this.line3(ctx, [s * X, 0, zb], [s * X, top + 0.1, zb], OUT, lw * 5); this.line3(ctx, [s * X, 0, zb], [s * X, top + 0.1, zb], '#a87a44', lw * 3.2); }
    this.line3(ctx, [-X - 0.15, top, zb], [X + 0.15, top, zb], OUT, lw * 5.5); this.line3(ctx, [-X - 0.15, top, zb], [X + 0.15, top, zb], '#b9884e', lw * 3.6);
    for (const s of [-1, 1]) { const ax = s * bw * 0.7; this.line3(ctx, [ax, top, D + 0.1], [ax + o.x, Y + bw + o.y - 0.02, D + 0.1], OUT, lw * 2.2); this.line3(ctx, [ax, top, D + 0.1], [ax + o.x, Y + bw + o.y - 0.02, D + 0.1], '#e8d6a8', lw * 1.1); }
  },
  // ON THE RAIL: a timber beam on trestles across the range, the boss riding it on a two-wheel trolley
  _rail(ctx, o, bw, bx, Y, D, lw) {
    const OUT = this.OUT, A = (this.railA || 1) + bw + 0.4, ry = Y - bw - 0.16, z = D + 0.2;
    for (const x of [-A, -A / 3, A / 3, A]) for (const s of [-1, 1]) { this.line3(ctx, [x, ry, z], [x + s * 0.22, 0, z + 0.15], OUT, lw * 3.6); this.line3(ctx, [x, ry, z], [x + s * 0.22, 0, z + 0.15], '#8a6236', lw * 2); }
    this.line3(ctx, [-A - 0.1, ry, z], [A + 0.1, ry, z], OUT, lw * 5.5); this.line3(ctx, [-A - 0.1, ry, z], [A + 0.1, ry, z], '#b9884e', lw * 3.4);
    this.line3(ctx, [-A, ry + 0.035, z], [A, ry + 0.035, z], '#c9d1d9', lw * 1.2);
    for (const s of [-1, 1]) {
      const x = o.x + s * bx * 0.8; this.line3(ctx, [x, Y - bw + 0.05, D + 0.1], [x, ry + 0.06, z], OUT, lw * 3.4); this.line3(ctx, [x, Y - bw + 0.05, D + 0.1], [x, ry + 0.06, z], '#6a4a2a', lw * 2);
      const w = this.proj(x, ry + 0.06, z); if (w) { const r = Math.max(2.5, 0.06 * w.k); ctx.beginPath(); ctx.arc(w.x, w.y, r, 0, 6.283); ctx.fillStyle = '#3a414c'; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = OUT; ctx.stroke(); ctx.beginPath(); ctx.arc(w.x, w.y, r * 0.35, 0, 6.283); ctx.fillStyle = '#c9d1d9'; ctx.fill(); }
    }
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
    const o = this.tOff || { x: 0, y: 0 };            // a swinging boss carries its arrows
    this.arrow3(ctx, { x: h.x + o.x, y: h.y + o.y, z: this.dist }, d, len, team, { stuck: true, split: a.split, rot: rd.rot, shadow: true });
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
  // rel 0..1: the moment after the release - the string slaps home and shivers, the bow hand opens and the
  // bow tips forward into the finger sling while the arm follows through.
  bow(ctx, sx, sy, draw, team, t, rel, o) {
    o = o || {};
    const col = this.TEAM[team || 0], OUT = this.OUT, U = KAR.Util;
    const F = 330, ZN = 0.07, GX = 0.085, GZ = 0.74, MID = -0.06, GRIP = -0.15;
    let p = U.clamp(draw, 0, 1), roll = 0, ox = sx, oy = sy, vib = 0;
    if (rel > 0) {
      const e = U.easeOut(rel); roll = 0.9 * e; ox -= 30 * e; oy += 40 * e + 110 * rel * rel;
      p = -0.16 * Math.sin(rel * 34) * (1 - rel) * (1 - rel);                // the limbs whip past brace and ring down
      vib = Math.sin(rel * 90) * (1 - rel) * (1 - rel) * 0.022;
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
    const YS = Math.sin(0.32), YC = Math.cos(0.32), yaw = (y, d) => ({ x: GX + d * YS, y, z: GZ + d * YC });
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

    // ---- arms ----------------------------------------------------------------------------
    // The arms have their own frame: after the release they don't roll with the bow - the arm follows
    // through (drops a little, swings out) while the bow tips forward out of the open hand into the sling.
    const fe = rel > 0 ? U.easeOut(rel) : 0, ax = rel > 0 ? sx - 22 * fe : ox, ay = rel > 0 ? sy + 30 * fe : oy;
    const PA = v => ({ x: ax + F * v.x / v.z, y: ay - F * v.y / v.z, s: F / v.z });
    const SKIN = ['#ffd9b5', '#f0b98a', '#c98a5a'], LEATHER = ['#a8733f', '#7a4a26', '#4a2a12'];
    const SLEEVE = [col.light, col.base, col.dark], CUFF = [col.base, col.dark, '#122a44'];
    const along = (a, b, k) => lerp3(a, b, k);
    // a rounded arm section between two camera-space points (radii in metres), shaded across its width so it
    // reads as a limb, not a ribbon. Cut where it comes inside zc of the eye so it runs off frame instead of
    // ballooning. pr: the projector (arm frame by default). Returns the screen axis for detailing.
    const tube = (a, b, ra, rb, pal, zc, pr) => {
      pr = pr || PA; zc = zc || 0.12;
      if (a.z < zc && b.z < zc) return null;
      if (a.z < zc) { const k = (zc - a.z) / (b.z - a.z); ra += (rb - ra) * k; a = lerp3(a, b, k); }
      if (b.z < zc) { const k = (zc - b.z) / (a.z - b.z); rb += (ra - rb) * k; b = lerp3(b, a, k); }
      const p = pr(a), q = pr(b), wa = ra * p.s, wb = rb * q.s, dx = q.x - p.x, dy = q.y - p.y, dl = Math.hypot(dx, dy) || 1;
      let nx = -dy / dl, ny = dx / dl; if (ny > 0) { nx = -nx; ny = -ny; }           // n points to the lit (upper) side
      const an = Math.atan2(ny, nx);
      ctx.beginPath(); ctx.moveTo(p.x + nx * wa, p.y + ny * wa); ctx.lineTo(q.x + nx * wb, q.y + ny * wb);
      ctx.arc(q.x, q.y, wb, an, an + Math.PI, dx * ny - dy * nx > 0); ctx.lineTo(p.x - nx * wa, p.y - ny * wa); ctx.closePath();
      const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2, w = (wa + wb) / 2, g = ctx.createLinearGradient(mx + nx * w, my + ny * w, mx - nx * w, my - ny * w);
      g.addColorStop(0, pal[0]); g.addColorStop(0.35, pal[1]); g.addColorStop(1, pal[2]);
      ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = OUT; ctx.stroke();
      return { p, q, wa, wb, nx, ny, ux: dx / dl, uy: dy / dl };
    };
    // the bow hand sits on the grip; drawn after the arm (below) in its own 2D frame
    const bh = PA({ x: GX, y: GRIP, z: GZ - 0.02 }), hs = 0.112 * bh.s;

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

    // bow arm: straight from the left shoulder to the grip - sleeve with a cuff, forearm, laced leather arm guard
    { const S = { x: -0.21, y: -0.27, z: 0.02 }, W = { x: GX - 0.016, y: GRIP - 0.035, z: GZ - 0.1 }, E = along(S, W, 0.5); E.x -= 0.015; E.y -= 0.01;
      const up = tube(S, E, 0.062, 0.052, SLEEVE);
      if (up) for (const k of [0.45, 0.7]) {             // fabric creases
        const cx = up.p.x + (up.q.x - up.p.x) * k, cy = up.p.y + (up.q.y - up.p.y) * k, w = up.wa + (up.wb - up.wa) * k;
        ctx.beginPath(); ctx.moveTo(cx + up.nx * w * 0.8, cy + up.ny * w * 0.8); ctx.quadraticCurveTo(cx + up.ux * w * 0.35, cy + up.uy * w * 0.35, cx - up.nx * w * 0.5, cy - up.ny * w * 0.5);
        ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(10,30,60,0.35)'; ctx.stroke();
      }
      const M = along(E, W, 0.45);
      tube(E, M, 0.047, 0.041, SKIN); tube(M, W, 0.041, 0.03, SKIN);
      tube(along(E, S, 0.07), along(E, W, 0.06), 0.055, 0.053, CUFF);                     // rolled sleeve cuff
      const g = tube(along(E, W, 0.2), along(E, W, 0.84), 0.05, 0.037, LEATHER);           // arm guard
      if (g) {
        const at = (k, side) => { const w = (g.wa + (g.wb - g.wa) * k) * side; return { x: g.p.x + (g.q.x - g.p.x) * k + g.nx * w, y: g.p.y + (g.q.y - g.p.y) * k + g.ny * w }; };
        // saddle stitching just inside both edges
        ctx.save(); ctx.setLineDash([3, 3]); ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(255,225,180,0.55)';
        for (const sd of [0.78, -0.78]) { const a1 = at(0.04, sd), a2 = at(0.96, sd); ctx.beginPath(); ctx.moveTo(a1.x, a1.y); ctx.lineTo(a2.x, a2.y); ctx.stroke(); }
        ctx.restore();
        // two straps across it, each with a small steel buckle on the lit side
        for (const k of [0.3, 0.72]) {
          const a1 = at(k - 0.045, 1.06), a2 = at(k + 0.045, 1.06), b2 = at(k + 0.045, -1.06), b1 = at(k - 0.045, -1.06);
          ctx.beginPath(); ctx.moveTo(a1.x, a1.y); ctx.lineTo(a2.x, a2.y); ctx.lineTo(b2.x, b2.y); ctx.lineTo(b1.x, b1.y); ctx.closePath();
          ctx.fillStyle = '#3d2412'; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = OUT; ctx.stroke();
          const c = at(k, 0.55), bw = Math.max(3, (g.wa + g.wb) * 0.09);
          ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(Math.atan2(g.uy, g.ux));
          ctx.beginPath(); (ctx.roundRect ? ctx.roundRect(-bw * 0.8, -bw, bw * 1.6, bw * 2, bw * 0.35) : ctx.rect(-bw * 0.8, -bw, bw * 1.6, bw * 2));
          ctx.fillStyle = '#c9d1d9'; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = OUT; ctx.stroke();
          ctx.fillStyle = '#3d2412'; ctx.fillRect(-bw * 0.35, -bw * 0.55, bw * 0.7, bw * 1.1);
          ctx.restore();
        }
      }
      // the hand: drawn in its own frame around the grip, wrist meeting the forearm
      const wq = PA(W), rq = P({ x: GX + 0.019, y: GRIP, z: GZ });
      const hand = this.bowHand(ctx, bh.x, bh.y, hs, (rq.x - bh.x) / hs, { x: (wq.x - bh.x) / hs, y: (wq.y - bh.y) / hs }, fe);
      // finger sling: a braided cord from thumb to forefinger round the front of the riser - it catches the bow
      const ra = P({ x: GX + 0.024, y: GRIP + 0.05, z: GZ + 0.02 }), rb = P({ x: GX - 0.022, y: GRIP + 0.052, z: GZ + 0.02 });
      ctx.beginPath(); ctx.moveTo(hand.thumb.x, hand.thumb.y); ctx.quadraticCurveTo(rb.x, rb.y - hs * 0.08, (ra.x + rb.x) / 2, (ra.y + rb.y) / 2 - hs * 0.12); ctx.quadraticCurveTo(ra.x + hs * 0.1, ra.y - hs * 0.04, hand.index.x, hand.index.y);
      ctx.lineWidth = 3.6; ctx.strokeStyle = OUT; ctx.stroke(); ctx.lineWidth = 1.8; ctx.strokeStyle = col.dark; ctx.stroke();
      ctx.save(); ctx.setLineDash([2, 2.5]); ctx.lineWidth = 1; ctx.strokeStyle = col.light; ctx.stroke(); ctx.restore(); }

    // nock: on the braced string at rest, under the chin at full draw
    const brace = yaw(-0.075, -0.21), anchor = { x: 0.02, y: -0.11, z: 0.035 };
    const nock = lerp3(brace, anchor, U.easeOut(p) * 0.35 + p * 0.65);
    const REST = { x: GX - 0.031, y: -0.075, z: GZ - 0.01 }, CLICK_Z = GZ + 0.025;
    let tip = null;
    if (rel <= 0) {
      // the arrow: shaft from the nock through the rest, three vanes at the back, a steel point
      const d = { x: REST.x - nock.x, y: REST.y - nock.y, z: REST.z - nock.z }, dl = Math.hypot(d.x, d.y, d.z); d.x /= dl; d.y /= dl; d.z /= dl;
      const at = s => ({ x: nock.x + d.x * s, y: nock.y + d.y * s, z: nock.z + d.z * s });
      tip = at(0.74);
      const sh = seg(nock, tip);
      if (sh) {
        // close to the eye it is out of focus: wide segments are drawn soft, with no outline, and capped in width
        const N = 14, W8 = s => Math.max(2.4, 0.008 * s), soft = w => w > 9;
        let prev = Pr(sh[0]);
        for (let i = 1; i <= N; i++) { const q = Pr(lerp3(sh[0], sh[1], i / N)), w = W8((q.s + prev.s) / 2);
          if (!soft(w)) { ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(q.x, q.y); ctx.lineWidth = w + 3; ctx.strokeStyle = OUT; ctx.stroke(); } prev = q; }
        prev = Pr(sh[0]);
        for (let i = 1; i <= N; i++) { const f = i / N, q = Pr(lerp3(sh[0], sh[1], f)), w = W8((q.s + prev.s) / 2);
          ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(q.x, q.y);
          if (soft(w)) { ctx.lineWidth = Math.min(16, w); ctx.strokeStyle = 'rgba(242,230,200,' + Math.max(0.25, Math.min(0.85, 9 / w)).toFixed(2) + ')'; }
          else { ctx.lineWidth = w; ctx.strokeStyle = f > 0.96 ? '#c9d1d9' : '#f2e6c8'; }
          ctx.stroke(); prev = q; }
        // vanes - big and soft while the nock is close to the eye
        const ux = d.z, uz = -d.x, ul = Math.hypot(ux, uz) || 1, u = { x: ux / ul, y: 0, z: uz / ul };
        const v = { x: u.y * d.z - u.z * d.y, y: u.z * d.x - u.x * d.z, z: u.x * d.y - u.y * d.x };
        for (const [ang, c] of [[Math.PI, col.base], [Math.PI / 3, col.light], [-Math.PI / 3, col.light]]) {
          const ca = Math.cos(ang), sa = Math.sin(ang), dir = { x: u.x * ca + v.x * sa, y: u.y * ca + v.y * sa, z: u.z * ca + v.z * sa };
          const off = (s, h) => { const b = at(s); return { x: b.x + dir.x * h, y: b.y + dir.y * h, z: b.z + dir.z * h }; };
          const pts = [off(0.025, 0), off(0.035, 0.016), off(0.075, 0.013), off(0.115, 0)];
          if (pts.some(q => rot(q).z < 0.16)) continue;           // right under the eye they are a blur, out of view
          ctx.beginPath(); pts.forEach((q, i) => { const r = P(q); i ? ctx.lineTo(r.x, r.y) : ctx.moveTo(r.x, r.y); }); ctx.closePath();
          ctx.fillStyle = c; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
        }
      }
    }
    if (rel > 0 && rel < 0.16) {
      const k = rel / 0.16, a = P(REST), tx = ox + (a.x - ox) * 0.05, ty = oy + (a.y - oy) * 0.05, hx = a.x + (tx - a.x) * Math.min(1, k * 2.2), hy = a.y + (ty - a.y) * Math.min(1, k * 2.2);
      const g = ctx.createLinearGradient(a.x, a.y, hx, hy); g.addColorStop(0, 'rgba(255,248,225,0)'); g.addColorStop(1, 'rgba(255,248,225,' + (0.9 * (1 - k)).toFixed(3) + ')');
      ctx.beginPath(); ctx.moveTo(a.x - 9, a.y + 4); ctx.lineTo(hx, hy); ctx.lineTo(a.x + 9, a.y + 4); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
      // and a puff of light where it leaves through the aperture
      const fl = Math.max(0, 1 - Math.abs(k - 0.45) / 0.45), rg = ctx.createRadialGradient(tx, ty, 0, tx, ty, 26 + 30 * k);
      rg.addColorStop(0, 'rgba(255,250,230,' + (0.75 * fl).toFixed(3) + ')'); rg.addColorStop(1, 'rgba(255,250,230,0)'); ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(tx, ty, 26 + 30 * k, 0, 6.283); ctx.fill();
    }
    // clicker: a thin blade on the riser that rides on the arrow until the point is drawn past it
    { const passed = !tip || tip.z < CLICK_Z, top = P({ x: GX - hw - 0.002, y: -0.025, z: CLICK_Z }), bot = P({ x: passed ? GX - hw - 0.002 : GX - hw - 0.009, y: passed ? -0.07 : -0.069, z: CLICK_Z });
      ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(bot.x, bot.y); ctx.lineWidth = 4; ctx.strokeStyle = OUT; ctx.stroke(); ctx.lineWidth = 2; ctx.strokeStyle = '#d8dee6'; ctx.stroke(); }

    // string: tip to nock to tip - fine and sharp at the bow, a soft blur where it passes the eye
    const sn = rel > 0 ? { x: brace.x + vib, y: brace.y, z: brace.z } : nock;
    if (rel > 0 && rel < 0.5) for (const g of [-1, 1]) {           // the shiver: a faint blur either side of the string
      const gn = { x: brace.x - g * Math.abs(vib) * 1.4, y: brace.y, z: brace.z };
      for (const end of [tipU, tipL]) { const a = P(end), b = P(gn); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,246,224,' + (0.45 * (1 - rel * 2)).toFixed(3) + ')'; ctx.stroke(); }
    }
    for (const end of [tipU, tipL]) {
      const sg = seg(end, sn); if (!sg) continue;
      const N = 10; let prev = Pr(sg[0]);
      for (let i = 1; i <= N; i++) { const q = Pr(lerp3(sg[0], sg[1], i / N)), w = Math.max(1.6, Math.min(9, 0.0024 * q.s));
        ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(q.x, q.y);
        if (w > 4) { ctx.lineWidth = w; ctx.strokeStyle = 'rgba(255,246,224,' + Math.min(0.5, 2.2 / w).toFixed(3) + ')'; ctx.stroke(); }
        else { ctx.lineWidth = w + 1.6; ctx.strokeStyle = OUT; ctx.stroke(); ctx.lineWidth = w; ctx.strokeStyle = '#fff6e0'; ctx.stroke(); }
        prev = q; }
    }

    // the draw arm: three fingers hooked on the string (one above the arrow, two below) behind a leather tab,
    // the forearm running back past the cheek to an elbow behind the eye. As the nock comes back to the anchor
    // under the chin the hand slides down out of frame on its own.
    if (rel <= 0 && nock.z > 0.09) {
      // the forearm is part of the hand's own silhouette (no seam at the wrist): it runs from the wrist back
      // toward the elbow - its screen direction from where the wrist projects - into a rolled sleeve
      const W = { x: nock.x + 0.055, y: nock.y - 0.018, z: nock.z - 0.035 };
      const n = P(nock), ns = 0.085 * n.s, wq = P(W);
      this.drawHand(ctx, n.x, n.y, ns, { x: (wq.x - n.x) / ns, y: (wq.y - n.y) / ns }, col);
    }
    ctx.restore();
  },
  // ---- hands ---------------------------------------------------------------------------
  // Each hand is ONE illustrated silhouette in its own 2D frame (1 unit = a hand's width, y down), placed with
  // translate + scale: a smooth outline through hand-placed points, the fingers parted by fine inner lines,
  // shaded inside the outline. No overlapping primitives, so no seams. Light comes from the upper left.
  SKIN3: ['#ffe0c4', '#f2bb8c', '#c4855a'], INK: 'rgba(128,60,30,0.6)',
  _skinFill(ctx, x0, y0, x1, y1) { const g = ctx.createLinearGradient(x0, y0, x1, y1), c = this.SKIN3; g.addColorStop(0, c[0]); g.addColorStop(0.45, c[1]); g.addColorStop(1, c[2]); return g; },
  // a smooth (Catmull-Rom) closed outline through pts; with open, the last->first segment (where the hand runs on
  // into the forearm) is left out, so it can be stroked without a seam across the wrist
  _spline(ctx, pts, open) {
    const n = pts.length, P = i => pts[(i + n) % n];
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 0; i < n - 1; i++) { const a = P(i - 1), b = P(i), c = P(i + 1), d = P(i + 2);
      ctx.bezierCurveTo(b.x + (c.x - a.x) / 6, b.y + (c.y - a.y) / 6, c.x - (d.x - b.x) / 6, c.y - (d.y - b.y) / 6, c.x, c.y); }
    if (!open) ctx.closePath();
  },
  // a soft inner line through 2-3 points
  _crease(ctx, pts, w, col) { ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); if (pts.length === 3) ctx.quadraticCurveTo(pts[1].x, pts[1].y, pts[2].x, pts[2].y); else ctx.lineTo(pts[1].x, pts[1].y); ctx.lineWidth = w; ctx.strokeStyle = col; ctx.stroke(); },
  _knuckle(ctx, x, y, r) { const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r); g.addColorStop(0, 'rgba(255,242,228,0.45)'); g.addColorStop(1, 'rgba(255,242,228,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill(); },
  // shared painter: fill + inner shading (clipped), outline, inner lines. fingers: [{a, b, r}] centre lines for the
  // round shading of each finger; lines: creases; knuckles: highlight spots; nails: [{x, y, a, r}]
  _paintHand(ctx, pts, lw, o) {
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath(); this._spline(ctx, pts); ctx.fillStyle = this._skinFill(ctx, o.light.x, o.light.y, o.dark.x, o.dark.y); ctx.fill();
    ctx.save(); ctx.clip();
    for (const f of o.fingers) {                       // each finger is a soft cylinder: shade under, light along the top
      const dx = f.b.x - f.a.x, dy = f.b.y - f.a.y, dl = Math.hypot(dx, dy) || 1, nx = dy / dl, ny = -dx / dl, up = ny < 0 ? 1 : -1;
      for (const [k, col, w] of [[-0.6, 'rgba(140,66,34,0.13)', 0.42], [0.42, 'rgba(255,244,232,0.26)', 0.26]]) {
        const ox = nx * up * f.r * k, oy = ny * up * f.r * k;
        ctx.beginPath(); ctx.moveTo(f.a.x + ox, f.a.y + oy); ctx.lineTo(f.b.x + ox, f.b.y + oy); ctx.lineWidth = f.r * w * 2; ctx.strokeStyle = col; ctx.stroke();
      }
    }
    for (const t of o.tendons || []) this._crease(ctx, t, lw * 3.5, 'rgba(255,238,222,0.2)');
    if (o.shade) { const g = ctx.createLinearGradient(o.shade[0].x, o.shade[0].y, o.shade[1].x, o.shade[1].y); g.addColorStop(0, 'rgba(120,58,30,0)'); g.addColorStop(1, 'rgba(120,58,30,0.26)'); ctx.fillStyle = g; ctx.fillRect(-3, -3, 6, 6); }
    for (const k of o.knuckles) this._knuckle(ctx, k.x, k.y, 0.11);
    ctx.restore();
    for (const l of o.lines) this._crease(ctx, l, lw * (l.w || 1.15), this.INK);
    for (const n of o.nails || []) {
      ctx.save(); ctx.translate(n.x, n.y); ctx.rotate(n.a);
      ctx.beginPath(); ctx.ellipse(0, 0, n.r, n.r * 0.7, 0, 0, 6.283); ctx.fillStyle = '#fbdccb'; ctx.fill(); ctx.lineWidth = lw * 0.9; ctx.strokeStyle = 'rgba(150,80,45,0.55)'; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(-n.r * 0.2, -n.r * 0.2, n.r * 0.4, n.r * 0.18, 0, 0, 6.283); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill(); ctx.restore();
    }
    ctx.beginPath(); this._spline(ctx, pts, true); ctx.lineWidth = lw * 2.4; ctx.strokeStyle = this.OUT; ctx.stroke();
    ctx.restore();
  },
  // move a canonical wrist (the first and last outline points, centred on c) onto where the forearm really ends:
  // the wrist corners take the whole shift, their neighbours half, so the hand bends gently into the arm
  _wristTo(pts, c, w, hw) {
    let dx = w.x - c.x, dy = w.y - c.y; const m = Math.hypot(dx, dy), k = m > 0.35 ? 0.35 / m : 1; dx *= k; dy *= k;
    const n = pts.length, out = pts.map(p => ({ x: p.x, y: p.y }));
    for (const [i, f] of [[0, 1], [n - 1, 1], [1, 0.5], [n - 2, 0.5]]) { out[i].x += dx * f; out[i].y += dy * f; }
    if (hw) {                                            // match the forearm's width at the wrist
      const a = out[0], b = out[n - 1], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, half = Math.hypot(a.x - b.x, a.y - b.y) / 2 || 1, s = KAR.Util.clamp(hw, 0.24, 0.5) / half;
      out[0] = { x: mx + (a.x - mx) * s, y: my + (a.y - my) * s }; out[n - 1] = { x: mx + (b.x - mx) * s, y: my + (b.y - my) * s };
    }
    return out;
  },
  // the bow hand (left) round the grip, seen from behind: the thumb up the left of the riser toward the target, the
  // web of the hand on the grip, the knuckles running down it and four fingers wrapping round its right edge.
  // rw: the riser's half-width (local), wrist: where the forearm meets the hand (local), open 0..1 after release
  // (the fingers spring open and the thumb swings out). Returns the screen points the finger sling ties to.
  bowHand(ctx, x, y, s, rw, wrist, open) {
    const lw = 1 / s, U = KAR.Util, o = U.clamp(open || 0, 0, 1), L = (c, op) => ({ x: U.lerp(c[0], op[0], o), y: U.lerp(c[1], op[1], o) }), R = rw;
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    // outline, clockwise from the wrist (thumb side) - closed fist / open hand
    const pts = this._wristTo([
      L([-0.33, 0.62], [-0.33, 0.62]), L([-0.43, 0.3], [-0.44, 0.3]), L([-0.44, 0.0], [-0.47, 0.02]),
      L([-0.38, -0.3], [-0.58, -0.2]), L([-0.3, -0.56], [-0.72, -0.44]), L([-0.2, -0.65], [-0.69, -0.57]), L([-0.11, -0.57], [-0.57, -0.52]),   // thumb
      L([-0.13, -0.35], [-0.33, -0.31]), L([-0.04, -0.36], [-0.12, -0.33]),                                                                // web
      L([0.12, -0.42], [0.2, -0.4]), L([R + 0.1, -0.41], [R + 0.42, -0.38]), L([R + 0.24, -0.33], [R + 0.64, -0.33]), L([R + 0.23, -0.21], [R + 0.64, -0.22]),   // index
      L([R + 0.12, -0.165], [R + 0.42, -0.19]),
      L([R + 0.25, -0.12], [R + 0.62, -0.15]), L([R + 0.24, 0.02], [R + 0.62, -0.03]), L([R + 0.12, 0.055], [R + 0.4, 0.0]),               // middle
      L([R + 0.22, 0.1], [R + 0.54, 0.04]), L([R + 0.2, 0.21], [R + 0.54, 0.14]), L([R + 0.1, 0.245], [R + 0.32, 0.17]),                  // ring
      L([R + 0.16, 0.29], [R + 0.42, 0.21]), L([R + 0.1, 0.38], [R + 0.41, 0.3]), L([0.2, 0.42], [0.22, 0.38]),                          // little
      L([0.24, 0.62], [0.24, 0.62]),
    ], { x: -0.05, y: 0.62 }, wrist);
    const kn = [{ x: 0.0, y: -0.28 }, { x: 0.07, y: -0.09 }, { x: 0.09, y: 0.09 }, { x: 0.07, y: 0.25 }];
    const tips = [pts[11], pts[14], pts[17], pts[20]], notch = [pts[13], pts[16], pts[19]];
    this._paintHand(ctx, pts, lw, {
      light: { x: -0.4, y: -0.5 }, dark: { x: 0.35, y: 0.6 },
      fingers: kn.map((k, i) => ({ a: k, b: tips[i], r: [0.11, 0.11, 0.1, 0.085][i] })).concat([{ a: { x: -0.32, y: 0.0 }, b: pts[5], r: 0.12 }]),
      knuckles: kn.map(k => ({ x: k.x - 0.02, y: k.y - 0.02 })),
      tendons: kn.map(k => [{ x: -0.05 + k.y * 0.15, y: 0.5 }, { x: (k.x - 0.1) * 0.6, y: k.y * 0.5 + 0.2 }, { x: k.x - 0.05, y: k.y + 0.02 }]),
      shade: [{ x: -0.1, y: -0.1 }, { x: 0.3, y: 0.5 }],
      lines: [
        [{ x: -0.13, y: -0.33 }, { x: -0.22, y: -0.12 }, { x: -0.3, y: 0.08 }],                                              // the thumb's inner edge against the palm
        ...notch.map((n, i) => [{ x: kn[i].x + 0.03, y: (kn[i].y + kn[i + 1].y) / 2 }, { x: (kn[i].x + n.x) / 2 + 0.02, y: (kn[i].y + kn[i + 1].y) / 2 + 0.01 }, n]),   // finger partings
        ...kn.map((k, i) => { const t = tips[i], m = { x: k.x + (t.x - k.x) * 0.62, y: k.y + (t.y - k.y) * 0.62 }; return [{ x: m.x - 0.02, y: m.y - 0.07 }, { x: m.x + 0.02, y: m.y }, { x: m.x - 0.01, y: m.y + 0.06 }].map(p => ({ x: p.x, y: p.y })); }).map(l => Object.assign(l, { w: 0.8 })),   // middle-joint creases
      ],
      nails: o > 0.4 ? tips.map((t, i) => ({ x: t.x - 0.06, y: t.y - 0.02 + 0.01 * i, a: -0.08, r: 0.05 })).concat([{ x: pts[5].x + 0.05, y: pts[5].y + 0.06, a: -0.7, r: 0.055 }]) : [{ x: pts[5].x + 0.06, y: pts[5].y + 0.07, a: -0.9, r: 0.055 }],
    });
    ctx.restore();
    return { thumb: { x: x + pts[5].x * s, y: y + pts[5].y * s }, index: { x: x + (R + 0.08) * s, y: y - 0.42 * s } };
  },
  // the draw hand (right) on the string, seen from behind and to the left: the back of the hand, the index finger
  // above the nock and middle + ring below, curled round the string with their tips just past it; the little finger
  // curled into the palm and the thumb tucked under, its tip showing. A leather tab between fingers and string.
  // Origin: the nock, string running down the y axis. hw: the forearm's half-width at the wrist (local).
  drawHand(ctx, x, y, s, wrist, col) {
    const lw = 1 / s, OUT = this.OUT;
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // finger tab: cordovan leather, stitched, notched for the arrow - mostly hidden behind the fingers
    ctx.beginPath(); ctx.moveTo(-0.13, -0.5); ctx.quadraticCurveTo(-0.01, -0.58, 0.12, -0.5); ctx.lineTo(0.12, 0.62); ctx.quadraticCurveTo(-0.01, 0.7, -0.13, 0.62); ctx.lineTo(-0.13, 0.06); ctx.lineTo(-0.08, 0); ctx.lineTo(-0.13, -0.06); ctx.closePath();
    const tg = ctx.createLinearGradient(-0.13, 0, 0.12, 0); tg.addColorStop(0, '#7a4524'); tg.addColorStop(1, '#3a1d0c'); ctx.fillStyle = tg; ctx.fill(); ctx.lineWidth = lw * 2.4; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.save(); ctx.setLineDash([lw * 3, lw * 3]); ctx.lineWidth = lw; ctx.strokeStyle = 'rgba(255,220,170,0.5)'; ctx.beginPath(); ctx.moveTo(-0.09, -0.46); ctx.lineTo(-0.09, 0.58); ctx.stroke(); ctx.restore();
    const base = [
      { x: 0.92, y: -0.24 }, { x: 0.66, y: -0.34 }, { x: 0.42, y: -0.4 },                                                   // back of the hand, top
      { x: 0.2, y: -0.39 }, { x: 0.03, y: -0.35 }, { x: -0.08, y: -0.27 }, { x: -0.07, y: -0.16 }, { x: 0.05, y: -0.12 }, { x: 0.2, y: -0.12 },   // index
      { x: 0.3, y: -0.07 },                                                                                                   // the gap for the nock
      { x: 0.2, y: -0.02 }, { x: 0.03, y: 0.0 }, { x: -0.09, y: 0.07 }, { x: -0.09, y: 0.18 }, { x: -0.02, y: 0.225 },       // middle
      { x: -0.08, y: 0.28 }, { x: -0.07, y: 0.39 }, { x: 0.05, y: 0.45 }, { x: 0.18, y: 0.47 },                               // ring
      { x: 0.27, y: 0.55 }, { x: 0.4, y: 0.59 },                                                                              // little finger, curled in
      { x: 0.48, y: 0.62 }, { x: 0.54, y: 0.68 }, { x: 0.64, y: 0.68 }, { x: 0.75, y: 0.58 },                                  // thumb tip, tucked under
      { x: 0.92, y: 0.44 },
    ];
    // the forearm: away from the wrist along the arm's screen direction (kept between 8 and 55 degrees below the
    // horizontal), widening a little over the muscle, out past the edge of the frame
    let ang = Math.atan2(wrist.y - 0.1, wrist.x - 0.4); ang = KAR.Util.clamp(isFinite(ang) ? ang : 0.5, 0.14, 0.96);
    const dx = Math.cos(ang), dy = Math.sin(ang), A = base[0], B = base[base.length - 1], cx = (A.x + B.x) / 2, cy = (A.y + B.y) / 2;
    const at = (P, d, k) => ({ x: P.x + dx * d + (P.x - cx) * k, y: P.y + dy * d + (P.y - cy) * k });
    const pts = [at(A, 7, 0.5), at(A, 1.3, 0.2), ...base, at(B, 1.3, 0.12), at(B, 7, 0.5)];
    const kn = [{ x: 0.42, y: -0.27 }, { x: 0.43, y: 0.06 }, { x: 0.41, y: 0.31 }];
    this._paintHand(ctx, pts, lw, {
      light: { x: 0.5 + dy * 0.6, y: 0.1 - dx * 0.6 }, dark: { x: 0.5 - dy * 0.75, y: 0.1 + dx * 0.75 },
      fingers: [{ a: kn[0], b: { x: -0.02, y: -0.24 }, r: 0.12 }, { a: kn[1], b: { x: -0.03, y: 0.1 }, r: 0.11 }, { a: kn[2], b: { x: -0.02, y: 0.33 }, r: 0.1 }],
      knuckles: kn.map(k => ({ x: k.x + 0.02, y: k.y - 0.03 })),
      tendons: kn.map(k => [{ x: 0.9, y: 0.1 + k.y * 0.4 }, { x: 0.68, y: k.y * 0.75 + 0.02 }, { x: k.x + 0.06, y: k.y }]),
      shade: [{ x: 0.5, y: 0.1 }, { x: 0.55, y: 0.65 }],
      lines: [
        [{ x: 0.36, y: 0.2 }, { x: 0.16, y: 0.22 }, { x: -0.02, y: 0.225 }],                                                  // middle / ring
        [{ x: 0.4, y: 0.47 }, { x: 0.28, y: 0.47 }, { x: 0.2, y: 0.5 }],                                                      // ring / little finger
        [{ x: 0.46, y: 0.6 }, { x: 0.58, y: 0.56 }, { x: 0.74, y: 0.58 }],                                                    // the thumb under the palm
        ...[[0.12, -0.25], [0.1, 0.1], [0.08, 0.33]].map(([cx, cy]) => Object.assign([{ x: cx + 0.02, y: cy - 0.09 }, { x: cx - 0.03, y: cy }, { x: cx + 0.01, y: cy + 0.08 }], { w: 0.8 })),   // middle joints
        ...[[-0.04, -0.21], [-0.05, 0.12], [-0.04, 0.33]].map(([cx, cy]) => Object.assign([{ x: cx + 0.03, y: cy - 0.07 }, { x: cx - 0.01, y: cy }, { x: cx + 0.03, y: cy + 0.06 }], { w: 0.7 })),  // the last joint, curling round
      ],
    });
    // the sleeve, rolled to mid-forearm: a cuff band, then the sleeve running off frame
    if (col) {
      const d0 = 2.3, side = (P, d, k) => at(P, d, k), q = [side(A, d0, 0.32), side(A, 8, 0.62), side(B, 8, 0.62), side(B, d0, 0.3)];
      const band = (d1, d2, k1, k2) => [side(A, d1, k1), side(A, d2, k2), side(B, d2, k2), side(B, d1, k1)];
      const fillQ = (Q, c0, c1) => { ctx.beginPath(); Q.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); const m = { x: (Q[0].x + Q[3].x) / 2, y: (Q[0].y + Q[3].y) / 2 }, g = ctx.createLinearGradient(Q[0].x, Q[0].y, Q[3].x, Q[3].y); g.addColorStop(0, c0); g.addColorStop(1, c1); ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = lw * 2.4; ctx.strokeStyle = OUT; ctx.stroke(); return m; };
      fillQ(q, col.light, col.dark);
      for (const k of [0.4, 0.75]) { const a = side(A, d0 + 0.6 + k, 0.4), b = side(B, d0 + 0.3 + k * 1.2, 0.38); this._crease(ctx, [a, { x: (a.x + b.x) / 2 + dx * 0.15, y: (a.y + b.y) / 2 + dy * 0.15 }, b], lw * 1.6, 'rgba(10,30,60,0.35)'); }
      fillQ(band(d0 - 0.05, d0 + 0.32, 0.36, 0.4), col.base, '#122a44');
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
