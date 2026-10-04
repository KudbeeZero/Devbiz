/* =====================================================================
 * Kudbee Cricket — render.js
 * A real-perspective renderer on Canvas 2D. One pinhole camera blends between
 * the BAT view (behind the stumps, down the pitch) and the FIELD view (high,
 * behind the batter, whole oval) so the same code draws both. Everything is
 * painted in code: striped outfield, rope, ad boards, crowded stands, cartoon
 * players, ball + shadow + trail, pitch marker, aim wedge, minimap.
 * ===================================================================== */

KCK.Render = {
  W: 960, H: 640, OUT: '#1d2a3a',
  cam: { x: 0, y: -4, z: 2.7, pitch: 0.1, F: 1150, CX: 480, CY: 330 },
  TEAM: {
    bat:   { base: '#2f86d8', light: '#7ac7ff', dark: '#1a4f8a' },
    field: { base: '#e8483a', light: '#ff9a8a', dark: '#97271d' },
  },
  POSE: {
    bat:   { x: 0.0, y: -14, z: 3.3, tx: 0.0, ty: 14, tz: 0.2, F: 1250 },
    field: { x: 0, y: -70, z: 96, tx: 0, ty: 12, tz: 0, F: 880 },
  },

  setView(b) {
    const A = this.POSE.bat, B = this.POSE.field, U = KCK.Util, e = U.smooth(b), c = this.cam;
    const px = U.lerp(A.x, B.x, e), py = U.lerp(A.y, B.y, e), pz = U.lerp(A.z, B.z, e);
    const tx = U.lerp(A.tx, B.tx, e), ty = U.lerp(A.ty, B.ty, e), tz = U.lerp(A.tz, B.tz, e);
    c.x = px; c.y = py; c.z = pz; c.F = U.lerp(A.F, B.F, e);
    c.pitch = Math.atan2(pz - tz, ty - py);
    c.CY = U.lerp(330, 300, e);
    this.blend = e;
  },
  blend: 0,

  proj(x, y, z) {
    const c = this.cam, dx = x - c.x, dy = y - c.y, dz = z - c.z;
    const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
    const zc = dy * cp - dz * sp;
    if (zc < 0.6) return null;
    const yc = dy * sp + dz * cp, k = c.F / zc;
    return { x: c.CX + dx * k, y: c.CY - yc * k, k, zc };
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
    if (!p || !q) return; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.stroke();
  },
  ringPath(ctx, r, n, cx, cy, z) {
    cx = cx === undefined ? KCK.CFG.CX : cx; cy = cy === undefined ? KCK.CFG.CY : cy; z = z || 0;
    let first = true, ok = true;
    for (let i = 0; i <= n; i++) {
      const a = i / n * Math.PI * 2, p = this.proj(cx + Math.sin(a) * r, cy + Math.cos(a) * r, z);
      if (!p) { first = true; ok = false; continue; }
      if (first) { ctx.moveTo(p.x, p.y); first = false; } else ctx.lineTo(p.x, p.y);
    }
    return ok;
  },

  // ---- environment ---------------------------------------------------------------
  drawWorld(ctx, t) {
    const W = this.W, H = this.H, hy = this.horizonY(), b = this.blend;
    // sky
    const sky = ctx.createLinearGradient(0, Math.min(0, hy - 260), 0, Math.max(60, hy));
    sky.addColorStop(0, '#4fb0ff'); sky.addColorStop(1, '#d4f0ff');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    // clouds
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 5; i++) {
      const cx = ((i * 233 + t * 6) % (W + 260)) - 130, cy = Math.max(30, hy - 150 + (i % 3) * 38) * (1 - b) + 20 * b;
      if (b > 0.9) continue;
      ctx.globalAlpha = 1 - b;
      ctx.beginPath(); ctx.ellipse(cx, cy, 70, 20, 0, 0, 7); ctx.ellipse(cx - 34, cy + 6, 44, 15, 0, 0, 7); ctx.ellipse(cx + 40, cy + 7, 48, 15, 0, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    }
    // far tree line
    if (hy > 0 && hy < H) {
      ctx.fillStyle = '#3e8a47'; ctx.beginPath(); ctx.moveTo(0, hy);
      for (let x = 0; x <= W; x += 24) ctx.lineTo(x, hy - 18 - Math.abs(Math.sin(x * 0.09)) * 22);
      ctx.lineTo(W, hy + 4); ctx.lineTo(0, hy + 4); ctx.closePath(); ctx.fill();
    }
    // ground base
    const g0 = Math.max(0, Math.min(H, hy));
    const gg = ctx.createLinearGradient(0, g0, 0, H);
    if (b > 0.5) { gg.addColorStop(0, '#2a6a3a'); gg.addColorStop(1, '#1d4e2c'); } else { gg.addColorStop(0, '#6ac84c'); gg.addColorStop(1, '#3f9a36'); }
    ctx.fillStyle = gg; ctx.fillRect(0, g0, W, H - g0);

    if (b > 0.35) this._fieldOval(ctx); else this._bandGround(ctx);
    this._pitch(ctx);
    this._rope(ctx);
    this._stands(ctx);
  },

  _bandGround(ctx) {
    const C = KCK.CFG;
    for (let i = 0; i < 16; i++) {
      const ya = -2 + i * 5.2, yb = ya + 5.2;
      this.poly(ctx, [this.proj(-70, ya, 0), this.proj(70, ya, 0), this.proj(70, yb, 0), this.proj(-70, yb, 0)], i % 2 ? 'rgba(255,255,255,0.07)' : 'rgba(0,40,0,0.05)');
    }
    // 30-yard circle
    ctx.beginPath(); if (this.ringPath(ctx, 27, 64) || true) { ctx.setLineDash([10, 10]); ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]); }
  },
  _fieldOval(ctx) {
    const C = KCK.CFG;
    ctx.save();
    ctx.beginPath(); this.ringPath(ctx, C.ROPE_R, 72); ctx.closePath();
    ctx.fillStyle = '#62c24a'; ctx.fill(); ctx.clip();
    for (let i = 0; i < 24; i++) {
      const xa = -66 + i * 5.5, xb = xa + 5.5;
      this.poly(ctx, [this.proj(xa, -60, 0), this.proj(xb, -60, 0), this.proj(xb, 90, 0), this.proj(xa, 90, 0)], i % 2 ? 'rgba(255,255,255,0.09)' : 'rgba(0,40,0,0.06)');
    }
    ctx.beginPath(); this.ringPath(ctx, 27, 64); ctx.setLineDash([8, 8]); ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
  },
  _pitch(ctx) {
    const P = KCK.CFG.PITCH, w = 1.52;
    this.poly(ctx, [this.proj(-w, -1.6, 0), this.proj(w, -1.6, 0), this.proj(w, P + 1.6, 0), this.proj(-w, P + 1.6, 0)], '#dcc48c');
    this.poly(ctx, [this.proj(-w, 1.5, 0), this.proj(w, 1.5, 0), this.proj(w, P - 1.2, 0), this.proj(-w, P - 1.2, 0)], 'rgba(120,90,40,0.16)');
    const L = (a, b) => this.line3(ctx, a, b, 'rgba(255,255,255,0.95)', Math.max(1.2, 3 * (1 - this.blend) + 1));
    L([-1.3, 1.22, 0], [1.3, 1.22, 0]); L([-1.3, P - 1.22, 0], [1.3, P - 1.22, 0]);            // popping creases
    L([-1.3, 0, 0], [1.3, 0, 0]); L([-1.3, P, 0], [1.3, P, 0]);                                 // bowling creases
    L([-1.3, 0, 0], [-1.3, 1.22, 0]); L([1.3, 0, 0], [1.3, 1.22, 0]); L([-1.3, P, 0], [-1.3, P - 1.22, 0]); L([1.3, P, 0], [1.3, P - 1.22, 0]);
  },
  _rope(ctx) {
    const C = KCK.CFG;
    ctx.beginPath(); this.ringPath(ctx, C.ROPE_R, 96);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(2, 4 * (1 - this.blend) + 2); ctx.lineJoin = 'round'; ctx.stroke();
    // ad boards just outside the rope
    const n = 48, rnd = KCK.Util.rng(4);
    const cols = ['#ffb82e', '#2f86d8', '#e8483a', '#53bd3c', '#c46bff'];
    for (let i = 0; i < n; i++) {
      const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2, r = C.ROPE_R + 1.4;
      const pt = (a, z) => this.proj(C.CX + Math.sin(a) * r, C.CY + Math.cos(a) * r, z);
      this.poly(ctx, [pt(a0, 0), pt(a1, 0), pt(a1, 1.1), pt(a0, 1.1)], cols[Math.floor(rnd() * 5)], this.OUT, 1.4);
    }
  },
  _stands(ctx) {
    const C = KCK.CFG, n = 60, rnd = KCK.Util.rng(9);
    const cols = ['#ffd34d', '#ff8a7a', '#7ac7ff', '#fff', '#a9ec62', '#c46bff', '#ffb82e'];
    for (let i = 0; i < n; i++) {
      const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
      const pt = (a, r, z) => this.proj(C.CX + Math.sin(a) * r, C.CY + Math.cos(a) * r, z);
      const am = (a0 + a1) / 2; if (Math.cos(am) < -0.3 && this.blend < 0.35) continue;   // behind the batter
      // stand body
      this.poly(ctx, [pt(a0, C.ROPE_R + 3, 1), pt(a1, C.ROPE_R + 3, 1), pt(a1, C.ROPE_R + 20, 14), pt(a0, C.ROPE_R + 20, 14)], '#6b7487', this.OUT, 1.2);
      // crowd dots
      for (let r2 = 0; r2 < 7; r2++) for (let j = 0; j < 3; j++) {
        const f = (r2 + 0.5) / 7, a = a0 + (a1 - a0) * (j + 0.5 + (rnd() - 0.5) * 0.4) / 3, rr = C.ROPE_R + 4 + f * 15.5, z = 1.4 + f * 12.2;
        const p = pt(a, rr, z); if (!p) continue;
        const s = Math.max(2.2, 1.0 * p.k * 0.9);
        ctx.fillStyle = cols[Math.floor(rnd() * cols.length)]; ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, 7); ctx.fill();
      }
    }
  },

  // ---- people --------------------------------------------------------------------
  // A cartoon person standing at world (wx, wy). o: shirt, pants, face ('back'|'front'|'side'), run (phase), boost, helmet, bat (swing 0..1), arms (0 down .. 1 up)
  person(ctx, wx, wy, o) {
    const p = this.proj(wx, wy, 0); if (!p) return;
    const boost = o.boost || 1, k = p.k * boost, OUT = this.OUT;
    const x = p.x, y = p.y;
    const H = 1.78 * k, lw = Math.max(1.6, 0.05 * k);
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(x, y, 0.5 * k, 0.16 * k, 0, 0, 7); ctx.fill();
    const run = o.run === undefined || o.run === null ? 0 : Math.sin(o.run) * 0.28 * k;
    const hip = y - 0.92 * k, legW = 0.15 * k;
    for (const s of [-1, 1]) {
      const lx = x + s * 0.13 * k, off = s * run * (o.face === 'side' ? 1.3 : 0.5);
      ctx.beginPath(); ctx.moveTo(lx, hip); ctx.lineTo(lx + off * 0.4, y - 0.04 * k);
      ctx.lineWidth = legW + lw * 2; ctx.strokeStyle = OUT; ctx.stroke();
      ctx.lineWidth = legW; ctx.strokeStyle = o.pants || '#f4f4f4'; ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(lx + off * 0.4, y - 0.02 * k, legW * 0.85, legW * 0.5, 0, 0, 7); ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = OUT; ctx.stroke();
    }
    // torso
    const tw = 0.52 * k, th = 0.68 * k, ty = hip - th + 0.05 * k;
    ctx.beginPath(); (ctx.roundRect ? ctx.roundRect(x - tw / 2, ty, tw, th, 0.17 * k) : ctx.rect(x - tw / 2, ty, tw, th));
    const sg = ctx.createLinearGradient(x - tw / 2, 0, x + tw / 2, 0); sg.addColorStop(0, o.shirt); sg.addColorStop(1, o.shirtDark || o.shirt);
    ctx.fillStyle = sg; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = OUT; ctx.stroke();
    if (o.face === 'back' && o.num !== undefined) { ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = '400 ' + Math.max(8, 0.26 * k) + 'px ' + (KCK.UI ? KCK.UI.FONT : 'sans-serif'); ctx.textAlign = 'center'; ctx.fillText(String(o.num), x, ty + th * 0.55); }
    // arms
    const sy = ty + 0.12 * k, up = o.arms || 0;
    for (const s of [-1, 1]) {
      const ax = x + s * (tw / 2 + 0.02 * k), ex = x + s * (0.42 + up * 0.1) * k, ey = sy + (0.42 - up * 0.72) * k;
      ctx.beginPath(); ctx.moveTo(ax, sy); ctx.lineTo(ex, ey); ctx.lineWidth = 0.15 * k + lw * 2; ctx.strokeStyle = OUT; ctx.stroke();
      ctx.lineWidth = 0.15 * k; ctx.strokeStyle = o.shirt; ctx.stroke();
      ctx.fillStyle = o.skin || '#f0b98a'; ctx.beginPath(); ctx.arc(ex, ey, 0.09 * k, 0, 7); ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = OUT; ctx.stroke();
    }
    // bat
    if (o.bat !== undefined && o.bat !== null) {
      const a = KCK.Util.lerp(0.5, -2.2, o.bat), bx = x + 0.35 * k, by = ty + 0.5 * k, L = 0.95 * k;
      ctx.save(); ctx.translate(bx, by); ctx.rotate(a);
      ctx.fillStyle = '#e8c27a'; ctx.strokeStyle = OUT; ctx.lineWidth = lw; ctx.beginPath(); (ctx.roundRect ? ctx.roundRect(-0.07 * k, 0, 0.14 * k, L, 0.04 * k) : ctx.rect(-0.07 * k, 0, 0.14 * k, L)); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    // head + helmet/cap
    const hr = 0.2 * k, hy = ty - hr * 0.55;
    ctx.fillStyle = o.skin || '#f0b98a'; ctx.beginPath(); ctx.arc(x, hy, hr, 0, 7); ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.fillStyle = o.shirt; ctx.beginPath(); ctx.arc(x, hy - 0.02 * k, hr * 1.05, Math.PI * 1.02, Math.PI * 1.98); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (o.helmet) { ctx.beginPath(); ctx.arc(x, hy + 0.02 * k, hr * 1.1, Math.PI * 0.9, Math.PI * 2.1); ctx.strokeStyle = OUT; ctx.lineWidth = lw; ctx.stroke(); }
    if (o.face === 'front') { ctx.fillStyle = OUT; ctx.beginPath(); ctx.arc(x - hr * 0.35, hy + hr * 0.1, hr * 0.12, 0, 7); ctx.arc(x + hr * 0.35, hy + hr * 0.1, hr * 0.12, 0, 7); ctx.fill(); }
    if (o.label) KCK.UI.text(ctx, o.label, x, y - H - 6, Math.max(11, 13), '#ffffff', 'center');
    ctx.restore();
    return { x, y, k, top: y - H };
  },

  stumps(ctx, y) {
    const S = KCK.CFG;
    for (const sx of [-0.1, 0, 0.1]) this.line3(ctx, [sx, y, 0], [sx, y, S.STUMP_H], '#f7ecc8', Math.max(1.6, 3 * (1 - this.blend) + 1.5));
    this.line3(ctx, [-0.115, y, S.STUMP_H], [0.115, y, S.STUMP_H], '#ffd34d', Math.max(1.4, 2.5 * (1 - this.blend) + 1));
  },

  // ---- the ball ------------------------------------------------------------------
  ball(ctx, b, trail, t) {
    const sh = this.proj(b.x, b.y, 0), p = this.proj(b.x, b.y, b.z);
    if (!p) return;
    if (sh) { const hs = KCK.Util.clamp(1 - b.z / 25, 0.3, 1); ctx.fillStyle = 'rgba(0,0,0,' + (0.28 * hs) + ')'; ctx.beginPath(); ctx.ellipse(sh.x, sh.y, Math.max(3, 0.14 * sh.k) * (0.7 + 0.3 * hs), Math.max(1.6, 0.06 * sh.k), 0, 0, 7); ctx.fill(); }
    if (trail && trail.length) {
      for (let i = 0; i < trail.length; i++) { const q = this.proj(trail[i].x, trail[i].y, trail[i].z); if (!q) continue; const a = (i + 1) / trail.length; ctx.fillStyle = 'rgba(255,236,170,' + (0.55 * a) + ')'; ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(2, 0.12 * q.k * a + 1.5 * a), 0, 7); ctx.fill(); }
    }
    const r = Math.max(4.6 + 2.6 * this.blend, 0.17 * p.k);
    if (this.blend > 0.3) { ctx.save(); ctx.shadowColor = '#ffd34d'; ctx.shadowBlur = 14; ctx.fillStyle = 'rgba(255,210,90,0.5)'; ctx.beginPath(); ctx.arc(p.x, p.y, r + 2, 0, 7); ctx.fill(); ctx.restore(); }
    ctx.beginPath(); ctx.arc(p.x, p.y, r + 1.6, 0, 7); ctx.fillStyle = this.OUT; ctx.fill();
    const g = ctx.createRadialGradient(p.x - r * 0.3, p.y - r * 0.3, r * 0.1, p.x, p.y, r); g.addColorStop(0, '#ff8f7a'); g.addColorStop(1, '#c3281c');
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = Math.max(1, r * 0.16); ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.62, 0.4 + t * 9, 2.4 + t * 9); ctx.stroke();
  },

  marker(ctx, x, y, a) {
    const p = this.proj(x, y, 0); if (!p) return;
    ctx.save(); ctx.globalAlpha = a;
    const rx = Math.max(10, 0.5 * p.k), ry = rx * 0.38;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, rx, ry, 0, 0, 7); ctx.lineWidth = 3; ctx.strokeStyle = '#fff27a'; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(p.x, p.y, rx * 0.5, ry * 0.5, 0, 0, 7); ctx.fillStyle = 'rgba(255,242,122,0.35)'; ctx.fill();
    ctx.restore();
  },

  // aim wedge on the ground, from the batter outward
  aim(ctx, deg, loft, t) {
    const a = deg * Math.PI / 180, len = loft ? 34 : 24;
    const o = this.proj(0, 1.2, 0.02); if (!o) return;
    const L = this.proj(Math.sin(a - 0.05) * len, 1.2 + Math.cos(a - 0.05) * len, 0.02), R = this.proj(Math.sin(a + 0.05) * len, 1.2 + Math.cos(a + 0.05) * len, 0.02), M = this.proj(Math.sin(a) * len, 1.2 + Math.cos(a) * len, 0.02);
    if (!L || !R || !M) return;
    ctx.save(); ctx.globalAlpha = 0.5 + 0.15 * Math.sin(t * 6);
    ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(L.x, L.y); ctx.lineTo(R.x, R.y); ctx.closePath();
    ctx.fillStyle = loft ? 'rgba(255,214,80,0.55)' : 'rgba(255,255,255,0.5)'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.stroke();
    ctx.restore();
    if (loft) { ctx.strokeStyle = 'rgba(255,214,80,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(M.x, M.y, 7, 0, 7); ctx.stroke(); }
  },

  // ---- minimap ----------------------------------------------------------------------
  minimap(ctx, x, y, r, field, aimDeg, loft, ball, t) {
    const C = KCK.CFG, sc = r / (C.ROPE_R + 4);
    const px = a => x + (a.x - C.CX) * sc, py = a => y - (a.y - C.CY) * sc;
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r + 3, 0, 7); ctx.fillStyle = this.OUT; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = '#62c24a'; ctx.fill(); ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(x, y, 27 * sc, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#dcc48c'; ctx.fillRect(x - 1.6 * sc * 1.0, py({ y: C.PITCH }), 3.2 * sc, C.PITCH * sc);
    // aim wedge
    const a = aimDeg * Math.PI / 180, bx = px({ x: 0 }), by = py({ y: 0.5 });
    ctx.fillStyle = loft ? 'rgba(255,214,80,0.6)' : 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.moveTo(bx, by);
    ctx.lineTo(bx + Math.sin(a - 0.12) * r * 1.2, by - Math.cos(a - 0.12) * r * 1.2); ctx.lineTo(bx + Math.sin(a + 0.12) * r * 1.2, by - Math.cos(a + 0.12) * r * 1.2); ctx.closePath(); ctx.fill();
    for (const f of field) { ctx.fillStyle = f.role === 'KEEPER' ? '#ffe14d' : this.TEAM.field.base; ctx.strokeStyle = this.OUT; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(px(f), py(f), 3.4, 0, 7); ctx.fill(); ctx.stroke(); }
    ctx.fillStyle = this.TEAM.bat.base; ctx.strokeStyle = this.OUT; ctx.beginPath(); ctx.arc(bx, py({ y: 0 }), 3.4, 0, 7); ctx.fill(); ctx.stroke();
    ctx.restore();
  },
};
