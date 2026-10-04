/* =====================================================================
 * Kudbee Cornhole — render.js
 * A small real-perspective renderer on Canvas 2D: pitched pinhole camera,
 * striped lawn, fence + string lights, trees, a regulation sloped board with
 * a hole, thick cloth bags (tumbling in flight, sinking into the hole),
 * shadows, aim reticle and flight preview. All art is drawn in code.
 * ===================================================================== */

KCH.Render = {
  W: 960, H: 640, F: 1650, CX: 480, CY: 250,
  OUT: '#2a1a10',
  cam: { x: 0, y: 70, z: 60, pitch: 0.2 },
  TEAM: [
    { base: '#2f86d8', light: '#7ac7ff', dark: '#1a4f8a', name: 'BLUE' },
    { base: '#e8483a', light: '#ff9a8a', dark: '#97271d', name: 'RED' },
  ],

  setCamera(px, py, pz, tx, ty, tz) {
    this.cam.x = px; this.cam.y = py; this.cam.z = pz;
    this.cam.pitch = Math.atan2(py - ty, tz - pz);
  },

  // world -> screen. Returns null when behind the camera.
  proj(x, y, z) {
    const c = this.cam, dx = x - c.x, dy = y - c.y, dz = z - c.z;
    const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
    const zc = -dy * sp + dz * cp;
    if (zc < 8) return null;
    const yc = dy * cp + dz * sp;
    const k = this.F / zc;
    return { x: this.CX + dx * k, y: this.CY - yc * k, k, zc };
  },

  // screen -> point on the board's sloped plane (u lateral, s along slope)
  unprojectBoard(sx, sy) {
    const c = this.cam, cp = Math.cos(c.pitch), sp = Math.sin(c.pitch), C = KCH.CFG;
    const dx = (sx - this.CX) / this.F, dy = (this.CY - sy) / this.F;
    // ray = right*dx + up*dy + forward*1
    const rx = dx, ry = dy * cp - sp, rz = dy * sp + cp;
    const th = C.THETA, nx = 0, ny = Math.cos(th), nz = -Math.sin(th);
    const denom = nx * rx + ny * ry + nz * rz;
    if (Math.abs(denom) < 1e-6) return null;
    const p0 = KCH.surface.point(0, 0);
    const t = (nx * (p0.x - c.x) + ny * (p0.y - c.y) + nz * (p0.z - c.z)) / denom;
    if (t <= 0) return null;
    const x = c.x + rx * t, z = c.z + rz * t;
    return KCH.surface.fromWorld(x, z);
  },

  poly(ctx, pts, fill, stroke, lw) {
    if (pts.some(p => !p)) return;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.lineWidth = lw || 1; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.stroke(); }
  },

  P(x, y, z) { return this.proj(x, y, z); },

  // ---- environment -------------------------------------------------------
  drawBackdrop(ctx, t) {
    const W = this.W, H = this.H;
    const g = ctx.createLinearGradient(0, 0, 0, this.CY + 60);
    g.addColorStop(0, '#59b8ff'); g.addColorStop(0.7, '#bfe6ff'); g.addColorStop(1, '#eaf8ff');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const sg = ctx.createRadialGradient(780, 70, 6, 780, 70, 200);
    sg.addColorStop(0, 'rgba(255,250,215,0.95)'); sg.addColorStop(1, 'rgba(255,250,215,0)');
    ctx.fillStyle = sg; ctx.fillRect(560, 0, 400, 280);
    ctx.fillStyle = '#fffbe3'; ctx.beginPath(); ctx.arc(780, 70, 26, 0, 6.283); ctx.fill();
    // drifting clouds
    for (const c of [[0.12, 70, 1.0, 6], [0.46, 40, 0.8, 4], [0.7, 120, 0.9, 5], [0.9, 62, 0.7, 7]]) {
      const cx = ((c[0] * W + t * c[3]) % (W + 240)) - 120, cy = c[1], sc = c[2];
      this._cloud(ctx, cx, cy, sc);
    }
    // distant tree line (anchored in the world so the camera move parallaxes it)
    const rnd = KCH.Util.rng(91);
    for (let i = 0; i < 16; i++) {
      const wx = -1700 + i * 230 + rnd() * 80, wz = 1500 + rnd() * 200, r = 150 + rnd() * 110;
      const p = this.proj(wx, r * 0.55, wz);
      if (!p) continue;
      const rad = r * p.k;
      ctx.fillStyle = '#2c8a4a'; ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, 6.283); ctx.arc(p.x - rad * 0.7, p.y + rad * 0.25, rad * 0.75, 0, 6.283); ctx.arc(p.x + rad * 0.7, p.y + rad * 0.3, rad * 0.7, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#3aa65a'; ctx.beginPath(); ctx.arc(p.x - rad * 0.15, p.y - rad * 0.25, rad * 0.55, 0, 6.283); ctx.fill();
    }
  },

  _cloud(ctx, cx, cy, sc) {
    const puffs = [[0, 0, 26], [-32, 9, 20], [32, 9, 22], [-14, -14, 20], [16, -12, 22], [54, 15, 14], [-54, 15, 14]];
    ctx.fillStyle = 'rgba(190,215,245,0.9)';
    for (const p of puffs) { ctx.beginPath(); ctx.arc(cx + p[0] * sc, cy + p[1] * sc + 4 * sc, p[2] * sc, 0, 6.283); ctx.fill(); }
    ctx.fillStyle = '#ffffff';
    for (const p of puffs) { ctx.beginPath(); ctx.arc(cx + p[0] * sc, cy + p[1] * sc, p[2] * sc, 0, 6.283); ctx.fill(); }
  },

  drawFence(ctx, t) {
    const z = 980, h = 68, x0 = -1400, x1 = 1400;
    const a = this.proj(x0, 0, z), b = this.proj(x1, 0, z), c = this.proj(x1, h, z), d = this.proj(x0, h, z);
    if (!a || !b || !c || !d) return;
    const g = ctx.createLinearGradient(0, d.y, 0, a.y); g.addColorStop(0, '#c98d52'); g.addColorStop(1, '#9a6a3c');
    this.poly(ctx, [a, b, c, d], g);
    ctx.strokeStyle = 'rgba(70,40,15,0.55)'; ctx.lineWidth = Math.max(1, a.k * 0.3);
    ctx.beginPath();
    for (let x = x0; x <= x1; x += 6.5) { const p0 = this.proj(x, 0, z), p1 = this.proj(x, h, z); if (p0 && p1) { ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); } }
    ctx.stroke();
    // rails + posts
    ctx.fillStyle = '#7a5230';
    for (const yy of [12, 54]) { const r0 = this.proj(x0, yy, z), r1 = this.proj(x1, yy, z); if (r0 && r1) ctx.fillRect(r0.x, r0.y - 2 * r0.k, r1.x - r0.x, 4 * r0.k); }
    for (let x = x0; x <= x1; x += 150) { const p0 = this.proj(x, 0, z - 1), p1 = this.proj(x, h + 5, z - 1); if (p0 && p1) { ctx.fillStyle = '#6a4424'; ctx.fillRect(p0.x - 3.5 * p0.k, p1.y, 7 * p0.k, p0.y - p1.y); } }
    // string lights draped between posts
    for (let x = x0; x < x1; x += 150) {
      for (let i = 0; i <= 10; i++) {
        const u = i / 10, px = x + 150 * u, py = h + 4 - Math.sin(u * Math.PI) * 14;
        const p = this.proj(px, py, z - 2);
        if (!p) continue;
        const glow = 0.65 + 0.35 * Math.sin(t * 2 + px * 0.05);
        const rg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 7 * p.k + 3);
        rg.addColorStop(0, 'rgba(255,236,170,' + (0.9 * glow) + ')'); rg.addColorStop(1, 'rgba(255,236,170,0)');
        ctx.fillStyle = rg; ctx.fillRect(p.x - 10, p.y - 10, 20, 20);
        ctx.fillStyle = '#fff5c8'; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1.2, 1.2 * p.k), 0, 6.283); ctx.fill();
      }
    }
  },

  drawLawn(ctx) {
    const near = Math.max(this.cam.z + 14, -50);
    for (let z = 980, i = 0; z > near; z -= 32, i++) {
      const a = this.proj(-1600, 0, z), b = this.proj(1600, 0, z), c = this.proj(1600, 0, z - 32), d = this.proj(-1600, 0, z - 32);
      if (!a || !b || !c || !d) { continue; }
      this.poly(ctx, [a, b, c, d], ((z / 32) | 0) % 2 ? '#7bcb4a' : '#6dbf3f');
    }
    // fill below the nearest stripe so the screen bottom is never empty
    const e = this.proj(0, 0, near + 40);
    if (e) { ctx.fillStyle = '#6dbf3f'; ctx.fillRect(0, e.y, this.W, this.H - e.y); }
    // lighting: sunlit far field, shaded foreground
    const h = this.proj(0, 0, 980);
    if (h) {
      const g = ctx.createLinearGradient(0, h.y - 10, 0, this.H);
      g.addColorStop(0, 'rgba(255,255,220,0.30)'); g.addColorStop(0.35, 'rgba(255,255,220,0)'); g.addColorStop(1, 'rgba(10,50,10,0.32)');
      ctx.fillStyle = g; ctx.fillRect(0, h.y - 10, this.W, this.H - h.y + 10);
      const hz = ctx.createLinearGradient(0, h.y - 26, 0, h.y + 16); hz.addColorStop(0, 'rgba(234,248,255,0)'); hz.addColorStop(1, 'rgba(234,248,255,0.5)'); ctx.fillStyle = hz; ctx.fillRect(0, h.y - 26, this.W, 42);
    }
    // grass tufts + clover flowers scattered over the lawn
    const rnd = KCH.Util.rng(5);
    for (let i = 0; i < 160; i++) {
      const wx = -520 + rnd() * 1040, wz = 40 + rnd() * 880;
      const p = this.proj(wx, 0, wz);
      if (!p || p.y > this.H + 10 || p.zc < 110) continue;                 // never scale scenery up in the lens
      const sz = Math.min(11, Math.max(2, 6 * p.k));
      if (i % 9 === 0) { ctx.fillStyle = i % 2 ? '#fffbe3' : '#ffe14d'; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1.2, sz * 0.22), 0, 6.283); ctx.fill(); continue; }
      ctx.strokeStyle = 'rgba(40,110,30,0.55)'; ctx.lineWidth = Math.max(1, sz * 0.14);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - sz * 0.4, p.y - sz); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + sz * 0.1, p.y - sz * 1.2); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + sz * 0.5, p.y - sz * 0.9); ctx.stroke();
    }
  },

  // A hedge row along the fence with potted flowers: backyard set dressing that reads at any framing.
  drawProps(ctx) {
    const rnd = KCH.Util.rng(12);
    ctx.save();
    for (let i = 0; i < 38; i++) {
      const x = -1300 + i * 70 + rnd() * 24, z = 955 + rnd() * 18, r = 26 + rnd() * 16;
      const p = this.proj(x, r * 0.55, z);
      if (!p) continue;
      const rad = r * p.k;
      ctx.fillStyle = '#2a7f3d'; ctx.strokeStyle = this.OUT; ctx.lineWidth = Math.max(1.2, 0.5 * p.k);
      ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, 6.283); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#3aa65a'; ctx.beginPath(); ctx.arc(p.x - rad * 0.2, p.y - rad * 0.25, rad * 0.55, 0, 6.283); ctx.fill();
      if (i % 3 === 0) { ctx.fillStyle = i % 2 ? '#ff8aa0' : '#fff27a'; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(p.x + (k - 1) * rad * 0.5, p.y - rad * (0.1 + (k % 2) * 0.3), Math.max(1.4, rad * 0.14), 0, 6.283); ctx.fill(); } }
    }
    ctx.restore();
  },

  // ---- the board ---------------------------------------------------------
  drawBoard(ctx, t) {
    const C = KCH.CFG, S = KCH.surface, th = C.THETA;
    const T = 0.75, ny = Math.cos(th), nz = -Math.sin(th);
    const top = [S.point(-12, 0), S.point(12, 0), S.point(12, C.SLEN), S.point(-12, C.SLEN)];
    const bot = top.map(p => ({ x: p.x, y: p.y - T * ny, z: p.z - T * nz }));
    const pr = pts => pts.map(p => this.proj(p.x, p.y, p.z));
    const T0 = pr(top), B0 = pr(bot);
    if (T0.some(p => !p)) return;
    // ground shadow
    const sh = [S.point(-12, 0), S.point(12, 0), S.point(12, C.SLEN), S.point(-12, C.SLEN)].map(p => this.proj(p.x + 2.6, 0.05, p.z + 1));
    this.poly(ctx, sh, 'rgba(15,45,15,0.26)');
    // legs: two planks under the high (back) edge
    for (const sx of [-1, 1]) {
      const a = this.proj(sx * 10, 11.5, C.BOARD_Z0 + 46), b = this.proj(sx * 10, 0, C.BOARD_Z0 + 52), c = this.proj(sx * 10 + 3.2, 0, C.BOARD_Z0 + 52), d = this.proj(sx * 10 + 3.2, 11.5, C.BOARD_Z0 + 46);
      this.poly(ctx, [a, b, c, d], '#8a5a30', this.OUT, 1.5);
    }
    // visible edge faces
    this.poly(ctx, [T0[0], T0[1], B0[1], B0[0]], '#c98d52', this.OUT, 2);              // front edge
    const camX = this.cam.x;
    if (camX >= -12) this.poly(ctx, [T0[0], T0[3], B0[3], B0[0]], '#b57a42', this.OUT, 2);   // left side (seen from the right)
    if (camX <= 12) this.poly(ctx, [T0[1], T0[2], B0[2], B0[1]], '#b57a42', this.OUT, 2);    // right side
    // top surface: birch field, dark painted border, white pin-stripe
    this.poly(ctx, T0, '#f4dcaa', this.OUT, 2.5);
    const inset = (m, col) => this.poly(ctx, [S.point(-12 + m, m), S.point(12 - m, m), S.point(12 - m, C.SLEN - m), S.point(-12 + m, C.SLEN - m)].map(p => this.proj(p.x, p.y, p.z)), col);
    ctx.save();
    this.poly(ctx, T0, null);
    ctx.clip();
    inset(0.0, '#2a3040'); inset(1.8, '#ffffff'); inset(2.3, '#f4dcaa');
    // grain
    ctx.strokeStyle = 'rgba(150,100,50,0.28)'; ctx.lineWidth = 1;
    const rnd = KCH.Util.rng(33);
    ctx.beginPath();
    for (let i = 0; i < 26; i++) { const u = -10 + rnd() * 20, s0 = rnd() * 20, p0 = this.proj(...Object.values(S.point(u, s0))), p1 = this.proj(...Object.values(S.point(u + (rnd() - 0.5) * 0.4, s0 + 14 + rnd() * 18))); if (p0 && p1) { ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); } }
    ctx.stroke();
    // painted lightning-bolt logo + wordmark (affine approximation of the plane)
    this._decal(ctx);
    ctx.restore();
    // hole: dark well, white rim, black ring
    const hp = []; for (let i = 0; i < 32; i++) { const a = i / 32 * 6.283, q = S.point(Math.cos(a) * C.HOLE_R, C.HOLE_S + Math.sin(a) * C.HOLE_R); hp.push(this.proj(q.x, q.y, q.z)); }
    const hr = []; for (let i = 0; i < 32; i++) { const a = i / 32 * 6.283, q = S.point(Math.cos(a) * (C.HOLE_R + 0.9), C.HOLE_S + Math.sin(a) * (C.HOLE_R + 0.9)); hr.push(this.proj(q.x, q.y, q.z)); }
    this.poly(ctx, hr, '#ffffff', this.OUT, 1.6);
    const hc = this.proj(...Object.values(S.point(0, C.HOLE_S)));
    this.poly(ctx, hp, '#0d0906', this.OUT, 1.6);
    if (hc) { const g = ctx.createRadialGradient(hc.x, hc.y + 2, 1, hc.x, hc.y, C.HOLE_R * hc.k); g.addColorStop(0, '#000'); g.addColorStop(1, '#3a2a1a'); ctx.save(); this.poly(ctx, hp, null); ctx.clip(); ctx.fillStyle = g; ctx.fillRect(hc.x - 60, hc.y - 40, 120, 80); ctx.restore(); }
  },

  _decal(ctx) {
    const S = KCH.surface;
    const o = this.proj(...Object.values(S.point(0, 18))), ux = this.proj(...Object.values(S.point(1, 18))), sx = this.proj(...Object.values(S.point(0, 19)));
    if (!o || !ux || !sx) return;
    ctx.save();
    ctx.transform(ux.x - o.x, ux.y - o.y, sx.x - o.x, sx.y - o.y, o.x, o.y);
    ctx.scale(1, -1);
    ctx.fillStyle = '#e8483a';
    ctx.beginPath(); ctx.moveTo(-2.4, 5); ctx.lineTo(1.2, 5); ctx.lineTo(-0.2, 1.4); ctx.lineTo(2.6, 1.4); ctx.lineTo(-1.8, -5.4); ctx.lineTo(-0.9, -0.4); ctx.lineTo(-3.4, -0.4); ctx.closePath(); ctx.fill();
    ctx.lineWidth = 0.6; ctx.strokeStyle = '#2a1a10'; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.font = '400 3.4px "Lilita One","Arial Black",sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#2a3040';
    ctx.scale(1, -1);
    ctx.fillText('KUDBEE', 0, 9.8);
    ctx.restore();
  },

  // ---- bags ---------------------------------------------------------------
  _basis(b) {
    const th = KCH.CFG.THETA, cy = Math.cos(b.yaw), sy = Math.sin(b.yaw);
    if (b.state === 'board' || b.state === 'hole') {
      const eu = [1, 0, 0], es = [0, Math.sin(th), Math.cos(th)], n = [0, Math.cos(th), -Math.sin(th)];
      const A = [eu[0] * cy + es[0] * sy, eu[1] * cy + es[1] * sy, eu[2] * cy + es[2] * sy];
      const B = [-eu[0] * sy + es[0] * cy, -eu[1] * sy + es[1] * cy, -eu[2] * sy + es[2] * cy];
      return { A, B, N: n };
    }
    // in the air / on the lawn: flat, spinning about the vertical, tumbling end over end
    const A0 = [cy, 0, -sy], B0 = [sy, 0, cy], N0 = [0, 1, 0];
    const ct = Math.cos(b.tilt || 0), st = Math.sin(b.tilt || 0);
    return { A: A0, B: [B0[0] * ct + N0[0] * st, B0[1] * ct + N0[1] * st, B0[2] * ct + N0[2] * st], N: [N0[0] * ct - B0[0] * st, N0[1] * ct - B0[1] * st, N0[2] * ct - B0[2] * st] };
  },

  drawBag(ctx, b, opts) {
    opts = opts || {};
    const col = this.TEAM[b.team], H = KCH.CFG.BAG_T / 2, R = 3.0;
    const bs = this._basis(b);
    let cx = b.x, cy = b.y, cz = b.z, sc = 1, alpha = 1;
    if (b.state === 'hole') {
      const t = Math.min(1, (b.holeT || 0) / 0.35);
      const p = KCH.surface.point(0, KCH.CFG.HOLE_S);
      cx = p.x; cy = p.y - t * 4; cz = p.z; sc = 1 - t * 0.55; alpha = 1;
    }
    const corner = (sa, sb, sn) => ({ x: cx + (bs.A[0] * sa + bs.B[0] * sb) * R * sc + bs.N[0] * sn * H, y: cy + (bs.A[1] * sa + bs.B[1] * sb) * R * sc + bs.N[1] * sn * H, z: cz + (bs.A[2] * sa + bs.B[2] * sb) * R * sc + bs.N[2] * sn * H });
    const top = [corner(-1, -1, 1), corner(1, -1, 1), corner(1, 1, 1), corner(-1, 1, 1)];
    const bot = [corner(-1, -1, -1), corner(1, -1, -1), corner(1, 1, -1), corner(-1, 1, -1)];
    const pt = top.map(p => this.proj(p.x, p.y, p.z)), pb = bot.map(p => this.proj(p.x, p.y, p.z));
    if (pt.some(p => !p) || pb.some(p => !p)) return;
    // contact shadow
    if (!opts.noShadow && b.state !== 'hole') {
      const sy = b.state === 'board' ? null : (KCH.surface.overBoard(b.x, b.z, 0) ? KCH.surface.heightAt(b.z) + 0.05 : 0.05);
      if (sy != null) {
        const h = Math.max(0, b.y - sy), k = Math.max(0.35, 1 - h / 120);
        const s0 = this.proj(b.x + h * 0.15, sy, b.z + h * 0.1);
        if (s0) { ctx.fillStyle = 'rgba(15,45,15,' + (0.32 * k) + ')'; ctx.beginPath(); ctx.ellipse(s0.x, s0.y, 4.6 * s0.k * k, 2.2 * s0.k * k, 0, 0, 6.283); ctx.fill(); }
      }
    }
    ctx.save();
    if (b.state === 'hole') {
      const hp = []; for (let i = 0; i < 28; i++) { const a = i / 28 * 6.283, q = KCH.surface.point(Math.cos(a) * KCH.CFG.HOLE_R, KCH.CFG.HOLE_S + Math.sin(a) * KCH.CFG.HOLE_R); hp.push(this.proj(q.x, q.y, q.z)); }
      this.poly(ctx, hp, null); ctx.clip();
    }
    // side walls facing the camera
    const cam = this.cam;
    const sides = [[0, 1], [1, 2], [2, 3], [3, 0]];
    const mid = { x: cx, y: cy, z: cz };
    sides.forEach((s, i) => {
      const nrm = [[0, -1], [1, 0], [0, 1], [-1, 0]][i];
      const wx = bs.A[0] * nrm[0] + bs.B[0] * nrm[1], wy = bs.A[1] * nrm[0] + bs.B[1] * nrm[1], wz = bs.A[2] * nrm[0] + bs.B[2] * nrm[1];
      if (wx * (cam.x - mid.x) + wy * (cam.y - mid.y) + wz * (cam.z - mid.z) <= 0) return;
      this.poly(ctx, [pt[s[0]], pt[s[1]], pb[s[1]], pb[s[0]]], col.dark, this.OUT, 1.6);
    });
    // top face (or underside if tumbled over)
    const up = bs.N[0] * (cam.x - cx) + bs.N[1] * (cam.y - cy) + bs.N[2] * (cam.z - cz) > 0;
    const face = up ? pt : pb;
    const c0 = face[0], c2 = face[2];
    const g = ctx.createLinearGradient(c0.x, c0.y, c2.x, c2.y);
    g.addColorStop(0, col.light); g.addColorStop(0.5, col.base); g.addColorStop(1, col.dark);
    this.poly(ctx, face, g, this.OUT, 2);
    // stitched border + centre seam
    const mix = (a, b2, t2) => ({ x: a.x + (b2.x - a.x) * t2, y: a.y + (b2.y - a.y) * t2 });
    const ctr = { x: (face[0].x + face[2].x) / 2, y: (face[0].y + face[2].y) / 2 };
    const ins = face.map(p => mix(p, ctr, 0.2));
    ctx.setLineDash([2.2, 2.2]); ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1;
    ctx.beginPath(); ins.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath();
    const m01 = mix(face[0], face[1], 0.5), m23 = mix(face[3], face[2], 0.5);
    ctx.moveTo(m01.x, m01.y); ctx.lineTo(m23.x, m23.y); ctx.stroke();
    ctx.restore();
  },

  // ---- reticle + flight preview ---------------------------------------------
  drawReticle(ctx, u, s, t, ok, style) {
    const S = KCH.surface;
    const ring = (r) => { const pts = []; for (let i = 0; i < 32; i++) { const a = i / 32 * 6.283, q = S.point(u + Math.cos(a) * r, s + Math.sin(a) * r); pts.push(this.proj(q.x, q.y + 0.15, q.z)); } return pts; };
    const outer = ring(3.6), inner = ring(1.3);
    if (outer.some(p => !p)) return;
    const pulse = 0.82 + 0.18 * Math.sin(t * 9);
    const col = ok ? '#fff6a8' : '#ff6a50';
    ctx.save();
    this.poly(ctx, outer, ok ? 'rgba(255,246,168,0.22)' : 'rgba(255,90,70,0.26)', 'rgba(30,20,10,0.8)', 6.5);
    ctx.globalAlpha = pulse; this.poly(ctx, outer, null, col, 3.4);
    ctx.globalAlpha = 1; this.poly(ctx, inner, col, this.OUT, 1.6);
    // four ticks pointing in, like a scope
    const c = this.proj(...Object.values(S.point(u, s)));
    if (c) {
      ctx.strokeStyle = this.OUT; ctx.lineWidth = 5; ctx.lineCap = 'round';
      const k = Math.max(8, 3.6 * c.k);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.beginPath(); ctx.moveTo(c.x + dx * k * 1.15, c.y + dy * k * 0.55 * 1.15); ctx.lineTo(c.x + dx * k * 1.55, c.y + dy * k * 0.55 * 1.55); ctx.stroke(); }
      ctx.strokeStyle = col; ctx.lineWidth = 2.4;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.beginPath(); ctx.moveTo(c.x + dx * k * 1.15, c.y + dy * k * 0.55 * 1.15); ctx.lineTo(c.x + dx * k * 1.55, c.y + dy * k * 0.55 * 1.55); ctx.stroke(); }
    }
    ctx.restore();
  },

  // Dotted flight arc using the same launch maths as Sim.throwBag.
  drawArc(ctx, style, u, s) {
    const C = KCH.CFG, tp = KCH.surface.point(u, s);
    const ty = tp.y + C.BAG_T / 2, dx = tp.x - C.HAND.x, dz = tp.z - C.HAND.z, d = Math.hypot(dx, dz);
    const a = C.LAUNCH_DEG * Math.PI / 180, dy = ty - C.HAND.y;
    const den = 2 * Math.cos(a) * Math.cos(a) * (d * Math.tan(a) - dy);
    if (den <= 0) return;
    const speed = Math.sqrt(C.G * d * d / den), vh = speed * Math.cos(a), vy = speed * Math.sin(a), T = d / vh;
    ctx.save();
    for (let i = 1; i < 26; i++) {
      const tt = T * i / 26, p = this.proj(C.HAND.x + dx / d * vh * tt, C.HAND.y + vy * tt - 0.5 * C.G * tt * tt, C.HAND.z + dz / d * vh * tt);
      if (!p) continue;
      ctx.globalAlpha = 0.35 + 0.65 * (i / 26);
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = this.OUT; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(p.x, p.y, 1.8 + 2.4 * (i / 26) * Math.min(2, p.k * 0.9), 0, 6.283); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  },

  // First-person hands holding the bag, bottom of the screen.
  drawHands(ctx, team, aimU, pull, t, style) {
    const col = this.TEAM[team];
    const cx = this.CX + aimU * 5, cy = 590 + pull * 18, w = 92, h = 54;
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(aimU * 0.012);
    // sleeves
    for (const sx of [-1, 1]) {
      ctx.fillStyle = col.dark; ctx.strokeStyle = this.OUT; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(sx * (w + 30), 90); ctx.lineTo(sx * (w - 6), 18); ctx.lineTo(sx * (w + 26), 4); ctx.lineTo(sx * (w + 70), 90); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    // the bag, top face tilted toward us
    const g = ctx.createLinearGradient(-w, -h, w, h); g.addColorStop(0, col.light); g.addColorStop(0.5, col.base); g.addColorStop(1, col.dark);
    ctx.fillStyle = col.dark; ctx.strokeStyle = this.OUT; ctx.lineWidth = 3.5; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(-w + 8, h - 2); ctx.lineTo(w - 8, h - 2); ctx.lineTo(w, h + 22); ctx.lineTo(-w, h + 22); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(-w + 14, -h); ctx.lineTo(w - 14, -h); ctx.lineTo(w, h); ctx.lineTo(-w, h); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.setLineDash([5, 5]); ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(-w + 26, -h + 10); ctx.lineTo(w - 26, -h + 10); ctx.lineTo(w - 14, h - 10); ctx.lineTo(-w + 14, h - 10); ctx.closePath(); ctx.stroke();
    ctx.setLineDash([]);
    if (style === 'flop') { ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.moveTo(0, -h + 6); ctx.lineTo(0, h - 6); ctx.stroke(); }
    // fingers + thumbs
    const skin = '#f0c29a', skinD = '#c98f66';
    for (const sx of [-1, 1]) {
      ctx.fillStyle = skin; ctx.strokeStyle = this.OUT; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(sx * (w - 2), h + 6, 22, 30, sx * 0.25, 0, 6.283); ctx.fill(); ctx.stroke();
      ctx.fillStyle = skinD; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(sx * (w + 8), h - 10 + i * 12, 9, 5, 0, 0, 6.283); ctx.fill(); }
      ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(sx * (w - 24), -h + 18, 11, 17, sx * -0.3, 0, 6.283); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  },

  drawParticles(ctx, parts) {
    for (const p of parts) {
      const a = Math.max(0, Math.min(1, p.life / p.max));
      if (p.kind === 'confetti') {
        ctx.save(); ctx.globalAlpha = Math.min(1, a * 2); ctx.translate(p.sx, p.sy); ctx.rotate(p.rot);
        ctx.fillStyle = p.color; ctx.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size);
        ctx.restore(); continue;
      }
      const q = this.proj(p.x, p.y, p.z);
      if (!q) continue;
      if (p.kind === 'dust') {
        ctx.globalAlpha = a * 0.7; ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(110,90,60,0.5)'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(q.x, q.y, p.size * q.k * (1.5 - a * 0.5), 0, 6.283); ctx.fill(); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  },
};
