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
  XL: 0, XW: 960,             // the visible stage: wider screens see x from XL to XL + XW (set by Game._fit)
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
    const H = this.H, hy = this.horizonY(), b = this.blend, X0 = this.XL - 20, W = this.XW + 40;
    // sky
    const sky = ctx.createLinearGradient(0, Math.min(0, hy - 260), 0, Math.max(60, hy));
    sky.addColorStop(0, '#4fb0ff'); sky.addColorStop(1, '#d4f0ff');
    ctx.fillStyle = sky; ctx.fillRect(X0, -20, W, H + 40);
    // clouds
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    const nc = Math.round(W / 190);
    for (let i = 0; i < nc; i++) {
      const cx = X0 + ((i * 233 + t * 6) % (W + 260)) - 130, cy = Math.max(30, hy - 150 + (i % 3) * 38) * (1 - b) + 20 * b;
      if (b > 0.9) continue;
      ctx.globalAlpha = 1 - b;
      ctx.beginPath(); ctx.ellipse(cx, cy, 70, 20, 0, 0, 7); ctx.ellipse(cx - 34, cy + 6, 44, 15, 0, 0, 7); ctx.ellipse(cx + 40, cy + 7, 48, 15, 0, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    }
    // far tree line
    if (hy > 0 && hy < H) {
      const x0 = Math.floor(X0 / 24) * 24;
      ctx.fillStyle = '#3e8a47'; ctx.beginPath(); ctx.moveTo(x0, hy);
      for (let x = x0; x <= X0 + W + 24; x += 24) ctx.lineTo(x, hy - 18 - Math.abs(Math.sin(x * 0.09)) * 22);
      ctx.lineTo(X0 + W + 24, hy + 4); ctx.lineTo(x0, hy + 4); ctx.closePath(); ctx.fill();
    }
    // ground base
    const g0 = Math.max(0, Math.min(H, hy));
    const gg = ctx.createLinearGradient(0, g0, 0, H);
    if (b > 0.5) { gg.addColorStop(0, '#2a6a3a'); gg.addColorStop(1, '#1d4e2c'); } else { gg.addColorStop(0, '#6ac84c'); gg.addColorStop(1, '#3f9a36'); }
    ctx.fillStyle = gg; ctx.fillRect(X0, g0, W, H - g0 + 20);

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
  // A cartoon cricketer standing at world (wx, wy), drawn in metres around the feet (scaled by the camera's px/metre).
  // o: shirt, shirtDark, pants, face ('back' | 'front'), run (phase), boost, helmet, num, arms (0 down .. 1 up),
  //    bat (the batter's swing: 0 resting on the ground, ~0.12 backlift, 1 the follow-through), pads, label.
  // Batters wear pads, gloves and a helmet with a grille and neck guard and hold the bat in both hands; the swing
  // carries the hands round the front of the body as the blade comes down from the backlift and up into the finish.
  // Far-away figures (few px per metre) skip the small detail.
  person(ctx, wx, wy, o) {
    const p = this.proj(wx, wy, 0); if (!p) return;
    const k = p.k * (o.boost || 1), OUT = this.OUT, x = p.x, y = p.y, U = KCK.Util;
    const fine = k > 40, lw = Math.max(1.2, 0.03 * k) / k;
    const shirt = o.shirt, dark = o.shirtDark || o.shirt, skin = o.skin || '#f0b98a', pants = o.pants || '#f4f4f4';
    const batter = o.bat !== undefined && o.bat !== null, padded = batter || o.pads || o.helmet;
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(x, y, 0.55 * k, 0.17 * k, 0, 0, 7); ctx.fill();
    ctx.translate(x, y); ctx.scale(k, k);
    // stroke a limb: the outline, then the colour on top
    const limb = (pts, w, col) => { ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.lineWidth = w + lw * 2; ctx.strokeStyle = OUT; ctx.stroke(); ctx.lineWidth = w; ctx.strokeStyle = col; ctx.stroke(); };
    const fillOut = col => { ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = OUT; ctx.stroke(); };
    const rrect = (x0, y0, w, h, r) => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x0, y0, w, h, r); else ctx.rect(x0, y0, w, h); };
    // ---- the bat: grip + blade, along direction a (0 points straight down; the swing turns it right -> down -> left) ----
    const bt = batter ? U.clamp(o.bat, 0, 1) : 0;
    let ba = 0, hand = [0.2, -0.95];
    if (batter) {
      if (bt <= 0.12) { const f = bt / 0.12; ba = U.lerp(0.32, 2.5, f); hand = [U.lerp(0.17, 0.27, f), U.lerp(-0.93, -1.18, f)]; }       // grounded -> backlift
      else { const f = U.easeOut((bt - 0.12) / 0.88), q = 1 - f; ba = U.lerp(2.5, -2.55, f);                                          // down through the line, into the finish
        hand = [q * q * 0.27 + 2 * q * f * 0.12 + f * f * -0.3, q * q * -1.18 + 2 * q * f * -0.8 + f * f * -1.42]; }
    }
    const dir = [Math.sin(ba), Math.cos(ba)], along = (d) => [hand[0] + dir[0] * d, hand[1] + dir[1] * d];
    const drawBat = () => {
      ctx.save(); ctx.translate(hand[0], hand[1]); ctx.rotate(-ba);
      rrect(-0.022, -0.06, 0.044, 0.3, 0.02); fillOut('#2a2f3a');                     // the rubber grip (from above the top hand)
      if (fine) { ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 0.008; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(-0.022, i * 0.05); ctx.lineTo(0.022, i * 0.05 + 0.02); ctx.stroke(); } }
      ctx.beginPath(); ctx.moveTo(-0.03, 0.22); ctx.quadraticCurveTo(0, 0.2, 0.03, 0.22); ctx.lineTo(0.058, 0.3); ctx.lineTo(0.06, 0.82); ctx.quadraticCurveTo(0, 0.87, -0.06, 0.82); ctx.lineTo(-0.058, 0.3); ctx.closePath();   // shoulders of the blade down to the toe
      const g = ctx.createLinearGradient(-0.06, 0, 0.06, 0); g.addColorStop(0, '#f6dca0'); g.addColorStop(0.55, '#e8c27a'); g.addColorStop(1, '#c99a52'); fillOut(g);
      if (fine) {
        ctx.fillStyle = '#e8483a'; ctx.fillRect(-0.056, 0.36, 0.112, 0.11); ctx.fillStyle = '#ffd34d'; ctx.fillRect(-0.056, 0.465, 0.112, 0.022);   // the maker's sticker
        ctx.fillStyle = '#ffffff'; ctx.font = '400 0.055px ' + (KCK.UI ? KCK.UI.FONT : 'sans-serif'); ctx.textAlign = 'center'; ctx.save(); ctx.translate(0, 0.415); ctx.rotate(Math.PI / 2); ctx.fillText('KUDBEE', 0, 0.018); ctx.restore();
        ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 0.012; ctx.beginPath(); ctx.moveTo(-0.035, 0.3); ctx.lineTo(-0.035, 0.8); ctx.stroke();   // the light down one edge
      }
      ctx.restore();
    };
    const run = o.run === undefined || o.run === null ? null : o.run;
    if (batter && o.face === 'side' && run === null) {
      this._sideBatter(ctx, o, { k, lw, fine, shirt, dark, skin, pants, bt, limb, fillOut, rrect, drawBat: (h, a) => { hand = h; ba = a; drawBat(); } });
      ctx.restore();
      if (o.label) KCK.UI.text(ctx, o.label, x, y - 1.8 * k - 6, 13, '#ffffff', 'center');
      return { x, y, k, top: y - 1.8 * k };
    }
    const batBehind = batter && o.face === 'back' && Math.cos(ba) > 0.35;            // pointing at the ground: the blade is in front of the batter, mostly hidden
    if (batBehind) drawBat();
    // ---- legs: a batter's stance is wide and a little crouched; running lifts the feet in turn ----
    const stance = batter && run === null ? 0.21 : 0.13, hipY = batter && run === null ? -0.88 : -0.92;
    for (const s of [-1, 1]) {
      const lift = run === null ? 0 : Math.max(0, Math.sin(run + (s > 0 ? 0 : Math.PI))) * 0.16, swingX = run === null ? 0 : Math.cos(run + (s > 0 ? 0 : Math.PI)) * 0.05;
      const fx = s * stance + swingX, fy = -lift, kx = s * (stance * 0.8 + 0.02) + swingX * 0.5, ky = -0.47 - lift * 0.6, hx = s * 0.1;
      limb([[hx, hipY], [kx, ky]], 0.17, pants);                                      // thigh
      if (padded) {                                                                    // the pad: a white guard from boot to above the knee
        const pw = 0.17, top = ky - 0.16, bot = fy - 0.07;
        rrect(kx - pw / 2, top, pw, bot - top, 0.06); fillOut('#fbfbf7');
        if (fine) {
          ctx.strokeStyle = 'rgba(120,130,150,0.55)'; ctx.lineWidth = lw * 0.8;
          for (const r of [-0.045, 0, 0.045]) { ctx.beginPath(); ctx.moveTo(kx + r, top + 0.05); ctx.lineTo(kx + r, bot - 0.04); ctx.stroke(); }
          ctx.strokeStyle = dark; ctx.lineWidth = 0.025;                               // straps
          for (const f of [0.3, 0.66]) { const sy = top + (bot - top) * f; ctx.beginPath(); ctx.moveTo(kx - pw / 2, sy); ctx.lineTo(kx + pw / 2, sy); ctx.stroke(); }
        }
      } else limb([[kx, ky], [fx, fy - 0.06]], 0.14, pants);                           // shin
      ctx.beginPath(); ctx.ellipse(fx + s * 0.02, fy - 0.03, 0.1, 0.055, 0, 0, 7); fillOut('#ffffff');        // boot
      if (fine) { ctx.fillStyle = '#9aa3ad'; ctx.fillRect(fx + s * 0.02 - 0.09, fy - 0.012, 0.18, 0.02); }
    }
    // ---- torso: shoulders wider than the waist, a collar, the number on the back ----
    const sh = -1.43, wa = hipY + 0.04;
    ctx.beginPath(); ctx.moveTo(-0.15, wa); ctx.lineTo(-0.22, sh + 0.06); ctx.quadraticCurveTo(-0.21, sh - 0.02, -0.1, sh - 0.03); ctx.lineTo(0.1, sh - 0.03); ctx.quadraticCurveTo(0.21, sh - 0.02, 0.22, sh + 0.06); ctx.lineTo(0.15, wa); ctx.closePath();
    const sg = ctx.createLinearGradient(-0.25, 0, 0.25, 0); sg.addColorStop(0, shirt); sg.addColorStop(1, dark); fillOut(sg);
    ctx.beginPath(); ctx.moveTo(-0.15, wa); ctx.lineTo(0.15, wa); ctx.lineWidth = 0.05; ctx.strokeStyle = pants; ctx.stroke();      // belt line
    if (fine) {
      if (o.face === 'back') {
        if (o.num !== undefined) { ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.font = '400 0.24px ' + (KCK.UI ? KCK.UI.FONT : 'sans-serif'); ctx.textAlign = 'center'; ctx.fillText(String(o.num), 0, -1.06); ctx.font = '400 0.07px ' + (KCK.UI ? KCK.UI.FONT : 'sans-serif'); ctx.fillText(o.name || 'KINGS', 0, -1.3); }
      } else {                                                                         // a V collar and a placket
        ctx.beginPath(); ctx.moveTo(-0.09, sh - 0.02); ctx.lineTo(0, sh + 0.1); ctx.lineTo(0.09, sh - 0.02); ctx.lineWidth = 0.035; ctx.strokeStyle = '#ffffff'; ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.beginPath(); ctx.ellipse(-0.1, sh + 0.12, 0.06, 0.16, 0.2, 0, 7); ctx.fill();   // a sheen
    }
    // ---- arms ----
    const shL = [-0.19, sh + 0.05], shR = [0.19, sh + 0.05];
    const elbow = (s, h, out) => { const mx = (s[0] + h[0]) / 2, my = (s[1] + h[1]) / 2, dx = h[0] - s[0], dy = h[1] - s[1], l = Math.hypot(dx, dy) || 1, bend = Math.max(0, 0.36 - l / 2) * 1.1 + 0.03; return [mx - dy / l * bend * out, my + dx / l * bend * out]; };
    const arm = (s, h, out) => { const e = elbow(s, h, out); limb([s, e], 0.105, shirt); limb([e, h], 0.085, skin); };
    if (batter) {
      const h2 = along(0.1);                                                           // bottom hand just below the top one
      arm(shL, hand, -1); arm(shR, h2, 1);
      if (!batBehind) drawBat();
      for (const h of [hand, h2]) { ctx.beginPath(); ctx.arc(h[0], h[1], 0.07, 0, 7); fillOut('#ffffff'); if (fine) { ctx.fillStyle = dark; ctx.fillRect(h[0] - 0.07, h[1] + 0.02, 0.14, 0.025); } }   // padded gloves
    } else {
      const up = o.arms || 0;
      for (const s of [-1, 1]) {
        const sp = s < 0 ? shL : shR, sw = run === null ? 0 : Math.sin(run + (s > 0 ? Math.PI : 0)) * 0.12;
        const raise = s > 0 ? up : up * 0.3, h = [sp[0] + s * (0.1 + raise * 0.05) + sw * 0.4, sp[1] + U.lerp(0.62, -0.62, raise) - Math.abs(sw) * 0.2];
        arm(sp, h, -s); ctx.beginPath(); ctx.arc(h[0], h[1], 0.06, 0, 7); fillOut(skin);
      }
    }
    // ---- head ----
    const hy = sh - 0.19, hr = 0.17;
    ctx.beginPath(); ctx.rect(-0.05, sh - 0.08, 0.1, 0.08); ctx.fillStyle = skin; ctx.fill();      // neck
    if (o.helmet) {
      if (o.face === 'back') {
        ctx.beginPath(); ctx.arc(0, hy + 0.03, hr * 0.92, 0, Math.PI); ctx.closePath(); fillOut(skin);                    // the back of the head under the helmet
        ctx.beginPath(); ctx.moveTo(-0.1, hy + 0.07); ctx.quadraticCurveTo(0, hy + 0.13, 0.1, hy + 0.07); ctx.lineTo(0.09, hy + 0.11); ctx.quadraticCurveTo(0, hy + 0.17, -0.09, hy + 0.11); ctx.closePath(); fillOut(shirt);   // the neck guard, a slim flap
        if (fine) for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 0.17, hy - 0.01); ctx.lineTo(s * 0.21, hy + 0.08); ctx.lineWidth = 0.022; ctx.strokeStyle = '#9aa3ad'; ctx.stroke(); }   // the grille's edges either side
      } else {
        ctx.beginPath(); ctx.arc(0, hy + 0.02, hr * 0.95, 0, 7); fillOut(skin);
        ctx.strokeStyle = '#9aa3ad'; ctx.lineWidth = 0.022; for (const gy of [0.0, 0.06, 0.12]) { ctx.beginPath(); ctx.moveTo(-0.14, hy + gy); ctx.lineTo(0.14, hy + gy); ctx.stroke(); }
      }
      ctx.beginPath(); ctx.arc(0, hy - 0.02, hr * 1.12, Math.PI * 0.95, Math.PI * 2.05); ctx.closePath();
      const hg = ctx.createLinearGradient(0, hy - 0.2, 0, hy + 0.05); hg.addColorStop(0, shirt); hg.addColorStop(1, dark); fillOut(hg);   // the dome
      if (fine) { ctx.beginPath(); ctx.moveTo(0, hy - 0.2); ctx.lineTo(0, hy - 0.04); ctx.lineWidth = 0.035; ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.stroke(); ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.arc(o.face === 'back' ? 0 : 0.08, hy - 0.1, 0.028, 0, 7); ctx.fill(); }
      if (o.face !== 'back') { ctx.beginPath(); ctx.ellipse(0, hy - 0.01, 0.2, 0.035, 0, 0, 7); fillOut(dark); }   // the peak
    } else {
      ctx.beginPath(); ctx.arc(0, hy, hr, 0, 7); fillOut(skin);
      if (o.face !== 'back') {
        for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * hr * 0.98, hy + 0.02, 0.035, 0, 7); fillOut(skin); }      // ears
        if (fine) {
          ctx.fillStyle = OUT; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * 0.06, hy + 0.01, 0.022, 0, 7); ctx.fill(); }
          ctx.beginPath(); ctx.arc(0, hy + 0.06, 0.05, 0.2, Math.PI - 0.2); ctx.lineWidth = 0.016; ctx.strokeStyle = OUT; ctx.stroke();
          ctx.fillStyle = 'rgba(255,120,110,0.35)'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * 0.1, hy + 0.06, 0.03, 0, 7); ctx.fill(); }
        }
      }
      ctx.beginPath(); ctx.arc(0, hy - 0.02, hr * 1.04, Math.PI * 1.0, Math.PI * 2.0); ctx.closePath(); fillOut(shirt);    // the cap
      if (o.face !== 'back') { ctx.beginPath(); ctx.ellipse(0, hy - 0.02, 0.21, 0.04, 0, 0, Math.PI); fillOut(dark); }    // its peak
      else { ctx.beginPath(); ctx.arc(0, hy - 0.04, 0.03, 0, 7); ctx.fillStyle = dark; ctx.fill(); }
    }
    ctx.restore();
    if (o.label) KCK.UI.text(ctx, o.label, x, y - 1.8 * k - 6, 13, '#ffffff', 'center');
    return { x, y, k, top: y - 1.8 * k };
  },

  // The striker side-on, like a real batter in their stance: chest to the right, front shoulder at the bowler, knees
  // flexed over striped pads, head turned in a profile helmet (peak, grille, ear guard). The swing runs in the screen
  // plane: the bat rests by the back foot, lifts up behind the head, sweeps down past the pads and wraps round into a
  // high finish over the front shoulder. Drawn in the person's metre space (already translated and scaled).
  _sideBatter(ctx, o, d) {
    const U = KCK.Util, OUT = this.OUT, { lw, fine, shirt, dark, skin, pants, bt, limb, fillOut } = d;
    // ---- where the hands and the bat are at this point of the swing ----
    let hand, ba;
    if (bt <= 0.12) { const f = U.easeOut(bt / 0.12); hand = [U.lerp(0.2, -0.08, f), U.lerp(-0.86, -1.3, f)]; ba = U.lerp(-0.32, -2.35, f); }   // grounded -> backlift
    else {
      const f = U.easeOut((bt - 0.12) / 0.88), q = 1 - f;
      hand = [q * q * -0.08 + 2 * q * f * 0.5 + f * f * 0.06, q * q * -1.3 + 2 * q * f * -0.36 + f * f * -1.56];   // down past the pads, up into the finish
      ba = U.lerp(-2.35, 3.55, Math.pow(f, 1.4));                                  // the blade is upright as the hands pass the pads
    }
    const along = t => [hand[0] + Math.sin(ba) * t, hand[1] + Math.cos(ba) * t], h2 = along(0.1);
    const hipY = -0.86, sh = -1.4, lean = 0.06;
    // ---- legs, far (front) leg first: thigh, then the pad with its knee roll, then the boot pointing at the off side ----
    const leg = (hip, knee, foot, far) => {
      limb([hip, knee], 0.17, far ? '#e4e4e4' : pants);
      const padCol = far ? '#e8eae4' : '#fbfbf7', top = [knee[0] + 0.02, knee[1] - 0.15], bot = [foot[0] + 0.02, foot[1] - 0.09];
      limb([top, bot], 0.17, padCol);
      if (fine) {
        const dx = bot[0] - top[0], dy = bot[1] - top[1], l = Math.hypot(dx, dy), nx = -dy / l, ny = dx / l;
        ctx.strokeStyle = 'rgba(120,130,150,0.5)'; ctx.lineWidth = lw * 0.8;
        for (const r of [-0.045, 0, 0.045]) { ctx.beginPath(); ctx.moveTo(top[0] + nx * r + dx * 0.12, top[1] + ny * r + dy * 0.12); ctx.lineTo(bot[0] + nx * r - dx * 0.08, bot[1] + ny * r - dy * 0.08); ctx.stroke(); }
        ctx.strokeStyle = dark; ctx.lineWidth = 0.025;                                // straps
        for (const f of [0.35, 0.7]) { const sx = top[0] + dx * f, sy = top[1] + dy * f; ctx.beginPath(); ctx.moveTo(sx - nx * 0.085, sy - ny * 0.085); ctx.lineTo(sx + nx * 0.085, sy + ny * 0.085); ctx.stroke(); }
      }
      ctx.beginPath(); ctx.ellipse(top[0] + 0.035, top[1] + 0.06, 0.07, 0.05, -0.3, 0, 7); fillOut(padCol);   // the knee roll at the top of the pad
      ctx.beginPath(); ctx.ellipse(foot[0] + 0.07, foot[1] - 0.035, 0.12, 0.055, 0, 0, 7); fillOut('#ffffff');   // boot, toe forward
      if (fine) { ctx.fillStyle = '#9aa3ad'; ctx.fillRect(foot[0] - 0.05, foot[1] - 0.012, 0.24, 0.02); }
    };
    leg([0.05, hipY], [0.19, -0.47], [0.2, 0], true);
    leg([-0.04, hipY], [0.02, -0.45], [-0.17, 0], false);
    // ---- the far (top-hand) arm sits behind the body ----
    const elbow = (s, h, out) => { const mx = (s[0] + h[0]) / 2, my = (s[1] + h[1]) / 2, dx = h[0] - s[0], dy = h[1] - s[1], l = Math.hypot(dx, dy) || 1, bend = Math.max(0, 0.36 - l / 2) * 1.1 + 0.03; return [mx - dy / l * bend * out, my + dx / l * bend * out]; };
    const arm = (s, h, out, col) => { const e = elbow(s, h, out); limb([s, e], 0.105, col); limb([e, h], 0.085, skin); };
    const up = hand[1] < sh + 0.1;                                                   // hands above the shoulders: elbows point out, not down
    arm([0.1 + lean, sh + 0.06], hand, up ? 1 : -1, dark);
    // ---- torso in profile, leaning into the stance ----
    const wa = hipY + 0.04;
    ctx.beginPath(); ctx.moveTo(-0.13, wa); ctx.quadraticCurveTo(-0.2 + lean * 0.5, sh + 0.3, -0.14 + lean, sh + 0.02); ctx.quadraticCurveTo(-0.05 + lean, sh - 0.05, 0.1 + lean, sh - 0.02);
    ctx.quadraticCurveTo(0.22 + lean, sh + 0.1, 0.17 + lean * 0.6, sh + 0.32); ctx.lineTo(0.13, wa); ctx.closePath();
    const sg = ctx.createLinearGradient(-0.2, 0, 0.25, 0); sg.addColorStop(0, dark); sg.addColorStop(0.6, shirt); sg.addColorStop(1, shirt); fillOut(sg);
    ctx.beginPath(); ctx.moveTo(-0.13, wa); ctx.lineTo(0.13, wa); ctx.lineWidth = 0.05; ctx.strokeStyle = pants; ctx.stroke();      // belt line
    if (fine) {
      ctx.beginPath(); ctx.moveTo(-0.06 + lean, sh + 0.02); ctx.quadraticCurveTo(-0.1 + lean * 0.5, sh + 0.35, -0.08, wa - 0.02); ctx.lineWidth = 0.035; ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.stroke();   // side seam stripe
      if (o.num !== undefined) { ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.font = '400 0.16px ' + (KCK.UI ? KCK.UI.FONT : 'sans-serif'); ctx.textAlign = 'center'; ctx.fillText(String(o.num), 0.07 + lean * 0.5, -1.07); }
      ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.beginPath(); ctx.ellipse(0.1 + lean, sh + 0.16, 0.05, 0.14, 0.15, 0, 7); ctx.fill();   // a sheen
    }
    // ---- the near (bottom-hand) arm, the bat, the gloves ----
    arm([-0.02 + lean, sh + 0.08], h2, up ? 1 : -1, shirt);
    d.drawBat(hand, ba);
    for (const h of [h2, hand]) { ctx.beginPath(); ctx.arc(h[0], h[1], 0.07, 0, 7); fillOut('#ffffff'); if (fine) { ctx.fillStyle = dark; ctx.fillRect(h[0] - 0.07, h[1] + 0.02, 0.14, 0.025); } }
    // ---- head in profile, looking down the pitch at the bowler (to the right) ----
    const hx = 0.05 + lean, hy = sh - 0.2;
    ctx.beginPath(); ctx.rect(hx - 0.07, sh - 0.1, 0.1, 0.12); ctx.fillStyle = skin; ctx.fill();          // neck
    ctx.beginPath(); ctx.arc(hx, hy + 0.02, 0.16, 0, 7); fillOut(skin);                                       // head
    ctx.beginPath(); ctx.arc(hx + 0.16, hy + 0.04, 0.035, 0, 7); fillOut(skin);                              // nose
    if (fine) { ctx.fillStyle = OUT; ctx.beginPath(); ctx.ellipse(hx + 0.095, hy + 0.0, 0.018, 0.026, 0, 0, 7); ctx.fill(); }   // eye on the ball
    ctx.beginPath(); ctx.moveTo(hx - 0.17, hy + 0.06); ctx.quadraticCurveTo(hx - 0.21, hy + 0.15, hx - 0.15, hy + 0.2); ctx.lineTo(hx - 0.09, hy + 0.15); ctx.closePath(); fillOut(shirt);   // the neck guard
    ctx.beginPath(); ctx.arc(hx, hy - 0.01, 0.19, Math.PI * 0.8, Math.PI * 2 - 0.12); ctx.lineTo(hx + 0.07, hy - 0.02); ctx.quadraticCurveTo(hx - 0.05, hy + 0.02, hx - 0.14, hy + 0.1); ctx.closePath();   // the shell
    const hg = ctx.createLinearGradient(0, hy - 0.2, 0, hy + 0.1); hg.addColorStop(0, shirt); hg.addColorStop(1, dark); fillOut(hg);
    ctx.beginPath(); ctx.moveTo(hx + 0.12, hy - 0.1); ctx.quadraticCurveTo(hx + 0.26, hy - 0.08, hx + 0.31, hy - 0.03); ctx.lineTo(hx + 0.16, hy - 0.03); ctx.closePath(); fillOut(dark);   // the peak
    ctx.strokeStyle = '#9aa3ad'; ctx.lineWidth = 0.024;                                                       // the grille round the face
    ctx.beginPath(); ctx.moveTo(hx + 0.2, hy - 0.03); ctx.quadraticCurveTo(hx + 0.26, hy + 0.12, hx + 0.1, hy + 0.2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hx + 0.07, hy + 0.06); ctx.lineTo(hx + 0.235, hy + 0.06); ctx.moveTo(hx + 0.05, hy + 0.13); ctx.lineTo(hx + 0.2, hy + 0.13); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(hx - 0.05, hy + 0.05, 0.04, 0.05, 0, 0, 7); ctx.fillStyle = dark; ctx.fill();          // ear guard
    if (fine) {
      ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.arc(hx - 0.06, hy - 0.08, 0.026, 0, 7); ctx.fill();          // badge on the shell
      ctx.beginPath(); ctx.arc(hx, hy - 0.01, 0.15, Math.PI * 1.15, Math.PI * 1.75); ctx.lineWidth = 0.035; ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.stroke();   // stripe over the dome
    }
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
