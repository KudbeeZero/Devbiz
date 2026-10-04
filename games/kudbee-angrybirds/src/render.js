/* =====================================================================
 * Kudbee Birds — render.js
 * World drawing: cached parallax neon backdrop, textured destructible
 * blocks with damage cracks, the three birds, the hive drones, the slingshot
 * and the aim preview. Pure canvas vector art — no image assets.
 * ===================================================================== */

KAB.Render = {
  W: 960, H: 600,
  _bg: {},
  _col: {},

  rgb(hex) {
    let c = this._col[hex];
    if (!c) {
      const n = parseInt(hex.slice(1), 16);
      c = this._col[hex] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    return c;
  },
  // k > 0 mixes toward white, k < 0 toward black.
  shade(hex, k) {
    const c = this.rgb(hex);
    const t = k < 0 ? 0 : 255, a = Math.abs(k);
    return 'rgb(' + Math.round(c[0] + (t - c[0]) * a) + ',' + Math.round(c[1] + (t - c[1]) * a) + ',' + Math.round(c[2] + (t - c[2]) * a) + ')';
  },
  alpha(hex, a) { const c = this.rgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; },

  // ---- backdrop ---------------------------------------------------------
  img: { lake: null },

  // Kicks off the painted backdrop load; until it arrives (or if it fails) the
  // procedural neon skyline below is used, so the game never shows an empty stage.
  loadImages() {
    const im = new Image();
    im.onload = () => { this._bg = {}; this._fringe = null; };
    im.src = 'assets/bg-lake.jpg';
    this.img.lake = im;
  },

  _hasLake() { const im = this.img.lake; return !!(im && im.complete && im.naturalWidth > 0); },

  // Painted scene: meadow line aligned to the physics ground, per-level mood grade,
  // soft depth-of-field so the playfield pops, cartoon dirt + grass in front.
  _makePaintedBg(theme, dpr, seed) {
    const cv = document.createElement('canvas');
    cv.width = this.W * dpr; cv.height = this.H * dpr;
    const x = cv.getContext('2d');
    x.scale(dpr, dpr);
    const rnd = KAB.Util.rng(seed);
    const GY = KAB.GROUND_Y;
    const im = this.img.lake;
    const m = theme.mood || { tint: '#ffffff', a: 0 };

    // The source's front meadow line sits ~88% down; land it on the physics ground.
    const sc = GY / (im.naturalHeight * 0.883);
    const dw = im.naturalWidth * sc, dh = im.naturalHeight * sc;
    x.save();
    x.beginPath(); x.rect(0, 0, this.W, GY + 2); x.clip();
    if ('filter' in x) x.filter = 'blur(1.6px) saturate(' + (m.sat || 1) + ') brightness(' + (m.bright || 1) + ')';
    // Nudge left so the scene's own scaffold (it reads as a second slingshot) is cropped off.
    x.drawImage(im, -(dw - this.W) / 2 - 38, 0, dw, dh);
    x.filter = 'none';
    x.restore();

    // Mood grade: multiply tint, then a warm horizon glow for sunset-type levels.
    if (m.a > 0) {
      x.save(); x.globalCompositeOperation = 'multiply'; x.globalAlpha = m.a; x.fillStyle = m.tint; x.fillRect(0, 0, this.W, GY); x.restore();
    }
    if (m.glow) {
      const gl = x.createRadialGradient(m.gx || 700, GY - 120, 10, m.gx || 700, GY - 120, 520);
      gl.addColorStop(0, this.alpha(m.glow, 0.55)); gl.addColorStop(1, this.alpha(m.glow, 0));
      x.save(); x.globalCompositeOperation = 'screen'; x.fillStyle = gl; x.fillRect(0, 0, this.W, GY); x.restore();
    }
    // HUD readability scrim + gentle vignette.
    const sg = x.createLinearGradient(0, 0, 0, 130);
    sg.addColorStop(0, 'rgba(4,10,30,0.50)'); sg.addColorStop(1, 'rgba(4,10,30,0)');
    x.fillStyle = sg; x.fillRect(0, 0, this.W, 130);
    const vg = x.createRadialGradient(480, 280, 260, 480, 280, 640);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.30)');
    x.fillStyle = vg; x.fillRect(0, 0, this.W, GY);

    const stars = [];
    if (m.night) {
      for (let i = 0; i < 60; i++) stars.push({ x: rnd() * this.W, y: rnd() * 220, r: 0.6 + rnd() * 1.3, p: rnd() * 6.28 });
      for (const st of stars) { x.fillStyle = 'rgba(235,240,255,' + (0.35 + st.r * 0.25) + ')'; x.fillRect(st.x, st.y, st.r, st.r); }
    }
    this._cartoonGround(x, theme, rnd);
    return { cv, stars: stars.filter((st, i) => i % 3 === 0) };
  },

  // Dirt + stone + grass cap below the playfield (y >= ground line).
  _cartoonGround(x, theme, rnd) {
    const GY = KAB.GROUND_Y, W = this.W, H = this.H;
    const dg = x.createLinearGradient(0, GY, 0, H);
    dg.addColorStop(0, '#7a5434'); dg.addColorStop(1, '#2e1d10');
    x.fillStyle = dg; x.fillRect(0, GY, W, H - GY);
    // rounded stone blobs
    for (let row = 0; row < 3; row++) {
      let px = -20 + (row % 2) * 24;
      while (px < W + 30) {
        const w = 38 + rnd() * 46, h = 16 + rnd() * 10, y = GY + 14 + row * 17;
        const shade = 0.82 + rnd() * 0.3;
        x.fillStyle = 'rgb(' + Math.round(150 * shade) + ',' + Math.round(106 * shade) + ',' + Math.round(66 * shade) + ')';
        x.strokeStyle = 'rgba(30,16,6,0.75)'; x.lineWidth = 1.6;
        x.beginPath();
        if (x.roundRect) x.roundRect(px, y, w, h, 7); else x.rect(px, y, w, h);
        x.fill(); x.stroke();
        x.fillStyle = 'rgba(255,235,200,0.18)'; x.fillRect(px + 5, y + 2.5, w * 0.45, 2.5);
        px += w + 5 + rnd() * 5;
      }
    }
    // grass cap with a lit top edge
    const gg = x.createLinearGradient(0, GY - 2, 0, GY + 16);
    gg.addColorStop(0, '#9be84a'); gg.addColorStop(0.45, '#4fb83a'); gg.addColorStop(1, '#2a7a2c');
    x.fillStyle = gg;
    x.beginPath(); x.moveTo(0, GY + 16);
    for (let px = 0; px <= W; px += 12) x.lineTo(px, GY - 1 + Math.sin(px * 0.11) * 1.8 + (rnd() - 0.5) * 2);
    x.lineTo(W, GY + 16); x.closePath(); x.fill();
    x.strokeStyle = 'rgba(20,70,20,0.55)'; x.lineWidth = 1.5; x.stroke();
    x.fillStyle = 'rgba(210,255,150,0.35)'; x.fillRect(0, GY - 1.5, W, 2);
  },

  // Front grass blades drawn OVER the bodies' feet so everything stands in the meadow.
  _makeFringe(dpr) {
    const cv = document.createElement('canvas');
    cv.width = this.W * dpr; cv.height = 40 * dpr;
    const x = cv.getContext('2d');
    x.scale(dpr, dpr);
    const rnd = KAB.Util.rng(4242), GY = KAB.GROUND_Y, base = 40 - 2;
    for (let px = -4; px < this.W + 4; px += 3 + rnd() * 4) {
      const h = 5 + rnd() * 9, lean = (rnd() - 0.5) * 6, g = 120 + Math.floor(rnd() * 90);
      x.fillStyle = 'rgb(' + Math.round(g * 0.45) + ',' + g + ',' + Math.round(g * 0.3) + ')';
      x.beginPath(); x.moveTo(px - 2, base); x.lineTo(px + lean, base - h); x.lineTo(px + 2, base); x.closePath(); x.fill();
    }
    return cv;
  },

  drawFringe(ctx, dpr) {
    if (!this._hasLake()) return;
    if (!this._fringe || this._fringeDpr !== dpr) { this._fringe = this._makeFringe(dpr); this._fringeDpr = dpr; }
    ctx.drawImage(this._fringe, 0, KAB.GROUND_Y - 38, this.W, 40);
  },

  _makeBg(theme, dpr, seed) {
    if (this._hasLake()) return this._makePaintedBg(theme, dpr, seed);
    const cv = document.createElement('canvas');
    cv.width = this.W * dpr; cv.height = this.H * dpr;
    const x = cv.getContext('2d');
    x.scale(dpr, dpr);
    const rnd = KAB.Util.rng(seed);
    const GY = KAB.GROUND_Y;

    const g = x.createLinearGradient(0, 0, 0, GY);
    g.addColorStop(0, theme.sky[0]); g.addColorStop(1, theme.sky[1]);
    x.fillStyle = g; x.fillRect(0, 0, this.W, this.H);

    // Synthwave sun, sliced by scanlines.
    const sx = 760 + rnd() * 80, sy = 150;
    const glow = x.createRadialGradient(sx, sy, 10, sx, sy, 170);
    glow.addColorStop(0, this.alpha(theme.accent, 0.35)); glow.addColorStop(1, this.alpha(theme.accent, 0));
    x.fillStyle = glow; x.fillRect(sx - 180, sy - 180, 360, 360);
    x.save();
    x.beginPath(); x.arc(sx, sy, 62, 0, 6.283); x.clip();
    const sg = x.createLinearGradient(0, sy - 62, 0, sy + 62);
    sg.addColorStop(0, this.alpha(theme.accent, 0.95)); sg.addColorStop(1, this.alpha('#ff5d9e', 0.9));
    x.fillStyle = sg; x.fillRect(sx - 62, sy - 62, 124, 124);
    x.fillStyle = theme.sky[1];
    for (let i = 0; i < 6; i++) x.fillRect(sx - 62, sy + 4 + i * 11, 124, 1.5 + i * 0.9);
    x.restore();

    // Two skyline layers.
    const layer = (color, minH, maxH, windows, litAlpha) => {
      let px = -10;
      while (px < this.W + 10) {
        const w = 28 + rnd() * 54, h = minH + rnd() * (maxH - minH);
        x.fillStyle = color; x.fillRect(px, GY - h, w, h);
        if (windows) {
          x.fillStyle = this.alpha(theme.accent, litAlpha);
          for (let wy = GY - h + 8; wy < GY - 10; wy += 12) for (let wx = px + 5; wx < px + w - 6; wx += 9) if (rnd() > 0.72) x.fillRect(wx, wy, 3, 4);
        }
        px += w + rnd() * 6;
      }
    };
    layer(this.shade(theme.skyline, -0.3), 90, 210, false, 0);
    layer(theme.skyline, 40, 130, true, 0.55);

    // Ground slab + perspective grid.
    const gg = x.createLinearGradient(0, GY, 0, this.H);
    gg.addColorStop(0, '#0c1630'); gg.addColorStop(1, '#04060f');
    x.fillStyle = gg; x.fillRect(0, GY, this.W, this.H - GY);
    x.strokeStyle = this.alpha(theme.accent, 0.16); x.lineWidth = 1;
    x.beginPath();
    for (let i = -14; i <= 38; i++) {
      const bx = 480 + (i - 12) * 52;
      const topX = 480 + (bx - 480) * 0.42;
      x.moveTo(topX, GY); x.lineTo(bx, this.H);
    }
    for (let k = 1; k <= 5; k++) { const yy = GY + 60 * Math.pow(k / 5, 1.7); x.moveTo(0, yy); x.lineTo(this.W, yy); }
    x.stroke();
    x.save();
    x.shadowColor = theme.accent; x.shadowBlur = 14;
    x.strokeStyle = theme.accent; x.lineWidth = 3;
    x.beginPath(); x.moveTo(0, GY + 1.5); x.lineTo(this.W, GY + 1.5); x.stroke();
    x.restore();

    // Static star field (a few are re-drawn twinkling each frame).
    const stars = [];
    for (let i = 0; i < 70; i++) stars.push({ x: rnd() * this.W, y: rnd() * (GY - 240), r: 0.5 + rnd() * 1.3, p: rnd() * 6.28 });
    for (const s of stars) { x.fillStyle = 'rgba(220,235,255,' + (0.25 + s.r * 0.2) + ')'; x.fillRect(s.x, s.y, s.r, s.r); }
    return { cv, stars: stars.filter((s, i) => i % 3 === 0) };
  },

  drawBackground(ctx, theme, key, t, dpr, reduceMotion) {
    let bg = this._bg[key];
    if (!bg || bg.dpr !== dpr) { bg = this._bg[key] = this._makeBg(theme, dpr, 1000 + key * 77); bg.dpr = dpr; }
    ctx.drawImage(bg.cv, 0, 0, this.W, this.H);
    if (!reduceMotion) {
      for (const s of bg.stars) {
        ctx.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(t * 1.4 + s.p));
        ctx.fillStyle = '#eaf6ff';
        ctx.fillRect(s.x, s.y, s.r + 0.6, s.r + 0.6);
      }
      ctx.globalAlpha = 1;
    }
  },

  // ---- cartoon art ----------------------------------------------------------
  OUT: '#3a2216',
  lookAt: { x: 150, y: 436 },

  _path(ctx, b) {
    ctx.beginPath();
    if (b.shape === 'circle') ctx.arc(0, 0, b.r, 0, 6.283);
    else if (b.shape === 'poly') { b.verts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); }
    else {
      const w = b.w, h = b.h, r = Math.min(4, w * 0.2, h * 0.2);
      if (ctx.roundRect) ctx.roundRect(-w / 2, -h / 2, w, h, r); else ctx.rect(-w / 2, -h / 2, w, h);
    }
  },

  // ---- blocks -----------------------------------------------------------
  drawBlock(ctx, b) {
    const dmg = Math.max(0, Math.min(1, 1 - b.hp / b.maxHp));
    const circle = b.shape === 'circle', poly = b.shape === 'poly';
    const w = circle ? b.r * 2 : b.w, h = circle ? b.r * 2 : b.h;
    const hx = -w / 2, hy = -h / 2;
    const stops = {
      wood: ['#f7d283', '#d99c3c', '#b67826'], stone: ['#d6dde3', '#a5aeb8', '#7c8691'],
      glass: ['#f4fdff', '#c2ecff', '#8dcfee'], tnt: ['#f5735a', '#d9432b', '#a52a19'],
    }[b.mat];
    ctx.save();
    ctx.translate(b.x, b.y); ctx.rotate(b.angle);
    ctx.lineJoin = 'round';

    this._path(ctx, b);
    const g = ctx.createLinearGradient(0, hy, 0, hy + h);
    g.addColorStop(0, stops[0]); g.addColorStop(0.5, stops[1]); g.addColorStop(1, stops[2]);
    ctx.fillStyle = g; ctx.fill();

    ctx.save();
    this._path(ctx, b); ctx.clip();
    const rnd = KAB.Util.rng(b.id * 31 + 7);
    if (b.mat === 'wood') {
      ctx.strokeStyle = 'rgba(122,70,14,0.5)'; ctx.lineWidth = 1.3;
      ctx.beginPath();
      if (circle) {
        for (let k = 0; k < 4; k++) { const a = k * Math.PI / 4; ctx.moveTo(Math.cos(a) * b.r, Math.sin(a) * b.r); ctx.lineTo(-Math.cos(a) * b.r, -Math.sin(a) * b.r); }
        ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, b.r * 0.55, 0, 6.283); ctx.stroke();
      } else if (poly || w >= h) {
        const n = Math.max(1, Math.round(h / 16)); for (let k = 1; k < n; k++) { const yy = hy + h * k / n; ctx.moveTo(hx, yy); ctx.lineTo(hx + w, yy); }
        if (!poly && w > 70) for (let xx = hx + 52; xx < hx + w - 20; xx += 52) { ctx.moveTo(xx, hy); ctx.lineTo(xx, hy + h); }
        ctx.stroke();
      } else {
        const n = Math.max(1, Math.round(w / 16)); for (let k = 1; k < n; k++) { const xx = hx + w * k / n; ctx.moveTo(xx, hy); ctx.lineTo(xx, hy + h); }
        if (h > 70) for (let yy = hy + 52; yy < hy + h - 20; yy += 52) { ctx.moveTo(hx, yy); ctx.lineTo(hx + w, yy); }
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(122,70,14,0.28)'; ctx.lineWidth = 1;                                     // grain flecks
      ctx.beginPath(); for (let i = 0; i < Math.max(3, w * h / 500); i++) { const px = hx + rnd() * w, py = hy + rnd() * h; ctx.moveTo(px, py); ctx.lineTo(px + (w >= h ? 7 : 0), py + (w >= h ? 0 : 7)); } ctx.stroke();
      if (!circle && !poly) {                                                                            // nails
        ctx.fillStyle = '#5a3a14';
        const long = w >= h, o = Math.min(7, Math.min(w, h) * 0.3);
        const spots = long ? [[hx + o, 0], [hx + w - o, 0]] : [[0, hy + o], [0, hy + h - o]];
        if (Math.min(w, h) >= 30) spots.push(...(long ? [[hx + o, hy + h - o], [hx + w - o, hy + o]] : [[hx + w - o, hy + o], [hx + o, hy + h - o]]));
        for (const s of spots) { ctx.beginPath(); ctx.arc(s[0], s[1], 1.9, 0, 6.283); ctx.fill(); }
      }
    } else if (b.mat === 'stone') {
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      for (let i = 0; i < Math.max(4, w * h / 300); i++) ctx.fillRect(hx + rnd() * w, hy + rnd() * h, 2 + rnd() * 4, 1.5 + rnd() * 2.5);
      ctx.fillStyle = 'rgba(40,50,70,0.18)';
      for (let i = 0; i < Math.max(4, w * h / 300); i++) ctx.fillRect(hx + rnd() * w, hy + rnd() * h, 2 + rnd() * 4, 1.5 + rnd() * 2.5);
      if (!circle && !poly) {                                                                            // chiselled bevel
        ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(hx + 2, hy + h - 2); ctx.lineTo(hx + 2, hy + 2); ctx.lineTo(hx + w - 2, hy + 2); ctx.stroke();
        ctx.strokeStyle = 'rgba(30,40,60,0.28)';
        ctx.beginPath(); ctx.moveTo(hx + w - 2, hy + 3); ctx.lineTo(hx + w - 2, hy + h - 2); ctx.lineTo(hx + 3, hy + h - 2); ctx.stroke();
        if (w > 90) { ctx.strokeStyle = 'rgba(40,50,70,0.35)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(0, hy + 3); ctx.lineTo(0, hy + h - 3); ctx.stroke(); }
      }
      if (circle) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(-b.r * 0.35, -b.r * 0.4, b.r * 0.32, b.r * 0.18, -0.6, 0, 6.283); ctx.fill(); }
    } else if (b.mat === 'glass') {
      ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 3;
      ctx.beginPath();
      for (let k = -h; k < w + h; k += 18) { ctx.moveTo(hx + k, hy + h); ctx.lineTo(hx + k + h, hy); }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(80,150,190,0.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(hx + 3, hy + h * 0.7); ctx.lineTo(hx + w * 0.5, hy + h * 0.3); ctx.stroke();
      ctx.fillStyle = '#ffffff';
      const sx = hx + w * (0.2 + rnd() * 0.6), sy = hy + h * (0.25 + rnd() * 0.5), sr = Math.min(5, Math.min(w, h) * 0.22);
      ctx.beginPath(); ctx.moveTo(sx, sy - sr); ctx.lineTo(sx + sr * 0.25, sy - sr * 0.25); ctx.lineTo(sx + sr, sy); ctx.lineTo(sx + sr * 0.25, sy + sr * 0.25); ctx.lineTo(sx, sy + sr); ctx.lineTo(sx - sr * 0.25, sy + sr * 0.25); ctx.lineTo(sx - sr, sy); ctx.lineTo(sx - sr * 0.25, sy - sr * 0.25); ctx.closePath(); ctx.fill();
    } else {                                                                                             // tnt
      ctx.fillStyle = 'rgba(40,10,6,0.6)';
      ctx.fillRect(hx, hy + h * 0.3, w, h * 0.13); ctx.fillRect(hx, hy + h * 0.65, w, h * 0.13);
      if (w >= 26) {
        ctx.fillStyle = '#fff3d6'; ctx.strokeStyle = '#4a1208'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
        ctx.font = '400 ' + Math.max(9, Math.floor(h * 0.34)) + 'px "Lilita One","Arial Black",system-ui,sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.strokeText('TNT', 0, 1); ctx.fillText('TNT', 0, 1);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      }
    }
    ctx.restore();

    this._path(ctx, b);
    ctx.strokeStyle = b.mat === 'glass' ? '#3b86a8' : this.OUT; ctx.lineWidth = 2.8; ctx.stroke();
    if (!circle && !poly && b.mat !== 'stone') {
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(hx + 3.5, hy + h - 4); ctx.lineTo(hx + 3.5, hy + 3.5); ctx.lineTo(hx + w - 4, hy + 3.5); ctx.stroke();
    }

    // damage: bruising + cracks that deepen with each stage
    const stage = dmg > 0.66 ? 3 : dmg > 0.33 ? 2 : dmg > 0.08 ? 1 : 0;
    if (stage) {
      ctx.save(); this._path(ctx, b); ctx.clip();
      ctx.fillStyle = 'rgba(40,20,0,' + (0.06 * stage) + ')'; ctx.fillRect(hx - 2, hy - 2, w + 4, h + 4);
      const r = KAB.Util.rng(b.id * 17 + 5);
      ctx.strokeStyle = b.mat === 'glass' ? 'rgba(255,255,255,0.95)' : 'rgba(30,15,8,0.85)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < stage + 1; i++) {
        let px = hx + r() * w, py = hy + r() * h;
        ctx.beginPath(); ctx.moveTo(px, py);
        for (let k = 0; k < 4; k++) { px += (r() - 0.5) * Math.max(10, w * 0.45); py += (r() - 0.35) * Math.max(10, h * 0.45); ctx.lineTo(px, py); }
        ctx.stroke();
      }
      ctx.restore();
    }
    if (b.flash > 0) { this._path(ctx, b); ctx.fillStyle = 'rgba(255,255,255,' + (b.flash * 0.5) + ')'; ctx.fill(); }
    ctx.restore();

    if (b.mat === 'tnt') {                                       // fuse spark
      ctx.save();
      ctx.translate(b.x, b.y); ctx.rotate(b.angle);
      ctx.strokeStyle = '#3a2216'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -h / 2); ctx.quadraticCurveTo(4, -h / 2 - 5, 2, -h / 2 - 8); ctx.stroke();
      ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.arc(2, -h / 2 - 9, 2.6 + Math.sin(performance.now() / 80 + b.id) * 0.9, 0, 6.283); ctx.fill();
      ctx.restore();
    }
  },

  // ---- birds ------------------------------------------------------------
  BIRD: {
    cyan:  { base: '#38b6ff', light: '#a4e2ff', dark: '#1b78c8', belly: '#eaf8ff' },
    gold:  { base: '#ffc933', light: '#ffeb94', dark: '#d9900b', belly: '#fff5cf' },
    green: { base: '#6fd94d', light: '#c8f7a8', dark: '#3b9a29', belly: '#f2ffe0' },
    egg:   { base: '#fff1d4', light: '#ffffff', dark: '#dfc594', belly: '#fffbf2' },
  },

  drawBird(ctx, x, y, r, type, ang, look, t, o) {
    const c = this.BIRD[type] || this.BIRD.cyan, OUT = this.OUT;
    o = o || {};
    const lw = Math.max(2.4, r * 0.17);
    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (!o.noShadow) { ctx.fillStyle = 'rgba(0,0,0,0.0)'; }

    // tail fan
    for (let k = -1; k <= 1; k++) {
      ctx.save(); ctx.translate(-r * 0.78, k * r * 0.26); ctx.rotate(Math.PI + k * 0.38);
      ctx.fillStyle = c.dark; ctx.strokeStyle = OUT; ctx.lineWidth = lw * 0.8;
      ctx.beginPath(); ctx.ellipse(r * 0.42, 0, r * 0.55, r * 0.19, 0, 0, 6.283); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    // crest (behind the head)
    ctx.fillStyle = c.dark; ctx.strokeStyle = OUT; ctx.lineWidth = lw * 0.8;
    if (type === 'cyan') {
      for (let k = 0; k < 3; k++) {
        ctx.beginPath(); ctx.moveTo(r * (0.35 - k * 0.3), -r * 0.85);
        ctx.quadraticCurveTo(-r * (0.3 + k * 0.3), -r * (1.55 - k * 0.1), -r * (0.95 + k * 0.28), -r * (1.15 - k * 0.2));
        ctx.quadraticCurveTo(-r * (0.2 + k * 0.28), -r * 0.95, -r * (0.1 + k * 0.3), -r * 0.8); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    } else if (type === 'gold') {
      for (let k = -1; k <= 1; k++) {
        ctx.beginPath(); ctx.moveTo(k * r * 0.34 - r * 0.2, -r * 0.88); ctx.lineTo(k * r * 0.34, -r * 1.42); ctx.lineTo(k * r * 0.34 + r * 0.2, -r * 0.88); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    } else if (type === 'green') {
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.ellipse(-r * 0.2 + k * r * 0.3, -r * 1.0 - (k === 1 ? r * 0.12 : 0), r * 0.17, r * 0.27, (k - 1) * 0.5, 0, 6.283); ctx.fill(); ctx.stroke(); }
    } else {
      ctx.fillStyle = '#e8483a';
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(-r * 0.1 + k * r * 0.3, -r * (0.95 + (k === 1 ? 0.12 : 0)), r * 0.22, 0, 6.283); ctx.fill(); ctx.stroke(); }
    }

    // body
    const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.08);
    g.addColorStop(0, c.light); g.addColorStop(0.5, c.base); g.addColorStop(1, c.dark);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.clip();
    ctx.fillStyle = c.belly;
    ctx.beginPath(); ctx.ellipse(r * 0.1, r * 0.62, r * 0.78, r * 0.52, 0, 0, 6.283); ctx.fill();
    if (type === 'egg') { ctx.fillStyle = 'rgba(255,140,160,0.55)'; ctx.beginPath(); ctx.arc(r * 0.45, r * 0.18, r * 0.16, 0, 6.283); ctx.fill(); }
    ctx.restore();
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.strokeStyle = OUT; ctx.lineWidth = lw; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.ellipse(-r * 0.4, -r * 0.5, r * 0.3, r * 0.16, -0.6, 0, 6.283); ctx.fill();

    // beak
    ctx.fillStyle = '#ffab1e'; ctx.strokeStyle = OUT; ctx.lineWidth = lw * 0.7;
    ctx.beginPath(); ctx.moveTo(r * 0.7, -r * 0.14); ctx.quadraticCurveTo(r * 1.35, -r * 0.1, r * 1.5, r * 0.12); ctx.quadraticCurveTo(r * 1.1, r * 0.2, r * 0.7, r * 0.12); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e07d00';
    ctx.beginPath(); ctx.moveTo(r * 0.72, r * 0.13); ctx.quadraticCurveTo(r * 1.1, r * 0.2, r * 1.5, r * 0.12); ctx.quadraticCurveTo(r * 1.25, r * 0.42, r * 0.8, r * 0.34); ctx.closePath(); ctx.fill(); ctx.stroke();

    // eyes + angry brows
    const lk = look == null ? 0 : look, blink = o.blink ? 0.12 : 1;
    const ex = [r * 0.12, r * 0.55];
    for (const e of ex) {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = OUT; ctx.lineWidth = lw * 0.6;
      ctx.beginPath(); ctx.ellipse(e, -r * 0.14, r * 0.21, r * 0.27 * blink, 0, 0, 6.283); ctx.fill(); ctx.stroke();
      if (blink > 0.5) {
        ctx.fillStyle = '#12101c';
        ctx.beginPath(); ctx.arc(e + Math.cos(lk) * r * 0.07, -r * 0.14 + Math.sin(lk) * r * 0.08, r * 0.1, 0, 6.283); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(e + Math.cos(lk) * r * 0.07 + r * 0.03, -r * 0.14 + Math.sin(lk) * r * 0.08 - r * 0.04, r * 0.035, 0, 6.283); ctx.fill();
      }
    }
    ctx.strokeStyle = OUT; ctx.lineWidth = r * (type === 'gold' ? 0.3 : 0.22);
    ctx.beginPath(); ctx.moveTo(-r * 0.12, -r * 0.5); ctx.lineTo(r * 0.4, -r * 0.3); ctx.moveTo(r * 0.82, -r * 0.52); ctx.lineTo(r * 0.38, -r * 0.3); ctx.stroke();
    ctx.restore();
  },

  drawEgg(ctx, b) {
    ctx.save();
    ctx.translate(b.x, b.y); ctx.rotate(Math.atan2(b.vy, b.vx) + Math.PI / 2);
    ctx.fillStyle = '#fffaf0'; ctx.strokeStyle = this.OUT; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.ellipse(0, 0, 7.5, 10, 0, 0, 6.283); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(224,197,148,0.7)'; ctx.beginPath(); ctx.arc(2.5, 3, 2.2, 0, 6.283); ctx.arc(-2.5, 4.5, 1.4, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.arc(0, -12.5 - Math.sin(performance.now() / 60) * 0.8, 3, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#ff7a2a'; ctx.beginPath(); ctx.arc(0, -12.5, 1.6, 0, 6.283); ctx.fill();
    ctx.restore();
  },

  // ---- hive grubs (the enemies): original round critters ----------------------
  drawEnemy(ctx, b, t) {
    const type = b.data.type, r = b.r, OUT = this.OUT;
    const frac = Math.max(0, b.hp / b.maxHp);
    const base = type === 'boss' ? { l: '#b4f07c', b: '#6fc23f', d: '#3d8a2a' } : { l: '#c2f58a', b: '#82d44a', d: '#4a9a2e' };
    const lw = Math.max(2.4, r * 0.15);
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.angle * 0.35);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    // horn nubs + ears
    ctx.fillStyle = '#e8d29a'; ctx.strokeStyle = OUT; ctx.lineWidth = lw * 0.8;
    for (const sx of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(sx * r * 0.45, -r * 0.82); ctx.quadraticCurveTo(sx * r * 0.75, -r * 1.25, sx * r * 0.9, -r * 0.95); ctx.quadraticCurveTo(sx * r * 0.8, -r * 0.78, sx * r * 0.62, -r * 0.7); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = base.d;
      ctx.beginPath(); ctx.ellipse(sx * r * 1.0, r * 0.05, r * 0.2, r * 0.3, sx * 0.3, 0, 6.283); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e8d29a';
    }
    // body
    const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.1);
    g.addColorStop(0, base.l); g.addColorStop(0.55, base.b); g.addColorStop(1, base.d);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.fill();
    ctx.strokeStyle = OUT; ctx.lineWidth = lw; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.ellipse(-r * 0.4, -r * 0.5, r * 0.28, r * 0.15, -0.6, 0, 6.283); ctx.fill();

    // eyes track the action
    const lk = Math.atan2(this.lookAt.y - b.y, this.lookAt.x - b.x);
    const hurt = frac < 0.34, bruised = frac < 0.67;
    for (const sx of [-1, 1]) {
      const ex = sx * r * 0.36, ey = -r * 0.14;
      ctx.fillStyle = '#fff'; ctx.strokeStyle = OUT; ctx.lineWidth = lw * 0.65;
      ctx.beginPath(); ctx.ellipse(ex, ey, r * 0.27, r * 0.3, 0, 0, 6.283); ctx.fill(); ctx.stroke();
      if (hurt) {
        ctx.strokeStyle = '#12101c'; ctx.lineWidth = lw * 0.7; const s = r * 0.14;
        ctx.beginPath(); ctx.moveTo(ex - s, ey - s); ctx.lineTo(ex + s, ey + s); ctx.moveTo(ex + s, ey - s); ctx.lineTo(ex - s, ey + s); ctx.stroke();
      } else {
        ctx.fillStyle = '#12101c';
        ctx.beginPath(); ctx.arc(ex + Math.cos(lk) * r * 0.09, ey + Math.sin(lk) * r * 0.09, r * (b.flash > 0 ? 0.07 : 0.13), 0, 6.283); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex + Math.cos(lk) * r * 0.09 + r * 0.04, ey + Math.sin(lk) * r * 0.09 - r * 0.05, r * 0.04, 0, 6.283); ctx.fill();
      }
      if (bruised && sx === 1) { ctx.fillStyle = 'rgba(120,60,150,0.45)'; ctx.beginPath(); ctx.ellipse(ex, ey + r * 0.2, r * 0.3, r * 0.14, 0, 0, 6.283); ctx.fill(); }
    }
    ctx.strokeStyle = OUT; ctx.lineWidth = r * 0.17;
    ctx.beginPath(); ctx.moveTo(-r * 0.7, -r * 0.5); ctx.lineTo(-r * 0.12, -r * 0.34); ctx.lineTo(r * 0.12, -r * 0.34); ctx.lineTo(r * 0.7, -r * 0.5); ctx.stroke();     // furious unibrow

    // grin with fangs
    ctx.fillStyle = '#3a0f14'; ctx.strokeStyle = OUT; ctx.lineWidth = lw * 0.7;
    ctx.beginPath(); ctx.moveTo(-r * 0.5, r * 0.3); ctx.quadraticCurveTo(0, r * (hurt ? 0.25 : 0.72), r * 0.5, r * 0.3); ctx.quadraticCurveTo(0, r * 0.4, -r * 0.5, r * 0.3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff';
    for (const sx of [-0.22, 0.22]) { ctx.beginPath(); ctx.moveTo(sx * r - r * 0.07, r * 0.36); ctx.lineTo(sx * r + r * 0.07, r * 0.36); ctx.lineTo(sx * r, r * 0.52); ctx.closePath(); ctx.fill(); }

    if (type === 'armor' || type === 'boss') {                                                              // steel helmet
      const hg = ctx.createLinearGradient(0, -r, 0, -r * 0.2);
      hg.addColorStop(0, '#f1f5ff'); hg.addColorStop(1, '#8d9ac0');
      ctx.fillStyle = hg; ctx.strokeStyle = OUT; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.arc(0, 0, r * 1.06, Math.PI * 1.07, Math.PI * 1.93); ctx.lineTo(r * 0.86, -r * 0.5); ctx.lineTo(-r * 0.86, -r * 0.5); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#3b4468';
      for (const rx of [-0.55, 0, 0.55]) { ctx.beginPath(); ctx.arc(r * rx, -r * 0.72, r * 0.07, 0, 6.283); ctx.fill(); }
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r * 0.92, Math.PI * 1.18, Math.PI * 1.45); ctx.stroke();
    } else {                                                                                                // leaf sprout
      ctx.fillStyle = '#4fbf3a'; ctx.strokeStyle = OUT; ctx.lineWidth = lw * 0.7;
      ctx.beginPath(); ctx.moveTo(0, -r * 0.95); ctx.quadraticCurveTo(r * 0.5, -r * 1.55, r * 0.55, -r * 1.05); ctx.quadraticCurveTo(r * 0.25, -r * 0.95, 0, -r * 0.95); ctx.fill(); ctx.stroke();
    }
    if (type === 'boss') {                                                                                  // gold crown
      ctx.fillStyle = '#ffd34d'; ctx.strokeStyle = OUT; ctx.lineWidth = lw * 0.8;
      ctx.beginPath(); ctx.moveTo(-r * 0.62, -r * 1.0);
      for (let i = 0; i < 4; i++) { ctx.lineTo(-r * 0.62 + i * r * 0.4 + r * 0.2, -r * 1.62); ctx.lineTo(-r * 0.62 + (i + 1) * r * 0.4, -r * 1.0); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e84a5f'; ctx.beginPath(); ctx.arc(0, -r * 1.18, r * 0.09, 0, 6.283); ctx.fill();
    }
    if (b.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (b.flash * 0.45) + ')'; ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.fill(); }
    ctx.restore();

    if (type === 'boss' && b.hp < b.maxHp) {                                                                // boss health bar
      const bw = 78, bx = b.x - bw / 2, by = b.y - r - 30;
      ctx.fillStyle = this.OUT; this._rr(ctx, bx - 3, by - 3, bw + 6, 12, 6); ctx.fill();
      ctx.fillStyle = frac > 0.4 ? '#7ae04a' : '#ff5d3c'; this._rr(ctx, bx, by, Math.max(4, bw * frac), 6, 3); ctx.fill();
    }
  },

  _rr(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); },

  // ---- slingshot ----------------------------------------------------------
  _fork(ctx, x1, y1, x2, y2, w) {
    ctx.lineCap = 'round';
    ctx.strokeStyle = this.OUT; ctx.lineWidth = w + 5; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.strokeStyle = '#b97a3a'; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,225,160,0.55)'; ctx.lineWidth = Math.max(2, w * 0.25);
    ctx.beginPath(); ctx.moveTo(x1 - 2, y1); ctx.lineTo(x2 - 2, y2); ctx.stroke();
  },
  // Back prong + back band + pouch (draw before the bird).
  slingBack(ctx, accent, bx, by, stretch) {
    const S = KAB.SLING;
    ctx.save();
    this._fork(ctx, S.x + 4, S.y + 24, S.x + 18, S.y - 8, 10);
    ctx.lineCap = 'round';
    ctx.strokeStyle = this.OUT; ctx.lineWidth = Math.max(5, 9 - stretch * 3.5);
    ctx.beginPath(); ctx.moveTo(S.x + 18, S.y - 8); ctx.lineTo(bx, by); ctx.stroke();
    ctx.strokeStyle = '#6b3f22'; ctx.lineWidth = Math.max(3, 6 - stretch * 3);
    ctx.beginPath(); ctx.moveTo(S.x + 18, S.y - 8); ctx.lineTo(bx, by); ctx.stroke();
    ctx.restore();
  },
  // Stem + front prong + front band (draw after the bird).
  slingFront(ctx, accent, bx, by, stretch) {
    const S = KAB.SLING;
    ctx.save();
    this._fork(ctx, S.x, KAB.GROUND_Y + 2, S.x, S.y + 28, 16);
    this._fork(ctx, S.x, S.y + 30, S.x - 16, S.y - 6, 11);
    ctx.lineCap = 'round';
    ctx.strokeStyle = this.OUT; ctx.lineWidth = Math.max(5, 9.5 - stretch * 3.5);
    ctx.beginPath(); ctx.moveTo(S.x - 16, S.y - 6); ctx.lineTo(bx, by); ctx.stroke();
    ctx.strokeStyle = '#7c4a28'; ctx.lineWidth = Math.max(3, 6.5 - stretch * 3);
    ctx.beginPath(); ctx.moveTo(S.x - 16, S.y - 6); ctx.lineTo(bx, by); ctx.stroke();
    ctx.restore();
  },

  trajectory(ctx, pts, accent, t) {
    ctx.save();
    for (let i = 1; i < pts.length; i += 3) {
      const f = 1 - i / pts.length;
      ctx.globalAlpha = 0.35 + 0.65 * f;
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = this.OUT; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(pts[i].x, pts[i].y, 2.4 + 2.6 * f, 0, 6.283); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  },
};
