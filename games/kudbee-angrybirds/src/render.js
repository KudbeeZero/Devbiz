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

  // ---- blocks -----------------------------------------------------------
  drawBlock(ctx, b, accent) {
    const m = KAB.Mat[b.mat];
    const w = b.w, h = b.h;
    ctx.save();
    ctx.translate(b.x, b.y); ctx.rotate(b.angle);
    const dmg = Math.max(0, Math.min(1, 1 - b.hp / b.maxHp));
    const hx = -w / 2, hy = -h / 2;

    // dark under-edge so blocks read against a busy painted backdrop
    ctx.fillStyle = 'rgba(8,14,30,0.45)';
    ctx.fillRect(hx - 1.5, hy - 1.5, w + 3, h + 3);

    if (b.mat === 'glass') {
      ctx.fillStyle = 'rgba(30,70,110,0.28)';
      ctx.fillRect(hx, hy, w, h);
      ctx.fillStyle = 'rgba(120,235,255,0.30)';
      ctx.fillRect(hx, hy, w, h);
      ctx.save();
      ctx.beginPath(); ctx.rect(hx, hy, w, h); ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 3;
      ctx.beginPath();
      for (let k = -h; k < w + h; k += 16) { ctx.moveTo(hx + k, hy + h); ctx.lineTo(hx + k + h, hy); }
      ctx.stroke();
      ctx.restore();
    } else {
      const base = b.mat === 'wood' ? '#c99a2e' : b.mat === 'stone' ? '#6a4a9e' : '#c2381f';
      const g = ctx.createLinearGradient(0, hy, 0, hy + h);
      g.addColorStop(0, this.shade(base, 0.22)); g.addColorStop(1, this.shade(base, -0.28));
      ctx.fillStyle = g; ctx.fillRect(hx, hy, w, h);
      ctx.save();
      ctx.beginPath(); ctx.rect(hx, hy, w, h); ctx.clip();
      if (b.mat === 'wood') {
        ctx.strokeStyle = 'rgba(70,40,5,0.35)'; ctx.lineWidth = 1;
        ctx.beginPath();
        if (w >= h) for (let yy = hy + 6; yy < hy + h; yy += 7) { ctx.moveTo(hx, yy); ctx.lineTo(hx + w, yy); }
        else for (let xx = hx + 6; xx < hx + w; xx += 7) { ctx.moveTo(xx, hy); ctx.lineTo(xx, hy + h); }
        ctx.stroke();
      } else if (b.mat === 'stone') {
        const r = KAB.Util.rng(b.id * 31);
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        for (let i = 0; i < Math.max(4, w * h / 260); i++) ctx.fillRect(hx + r() * w, hy + r() * h, 2 + r() * 3, 1.5 + r() * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.16)';
        for (let i = 0; i < Math.max(3, w * h / 360); i++) ctx.fillRect(hx + r() * w, hy + r() * h, 2 + r() * 3, 1.5 + r() * 2);
      } else {
        ctx.fillStyle = 'rgba(20,6,6,0.55)';
        ctx.fillRect(hx, hy + h * 0.32, w, h * 0.12); ctx.fillRect(hx, hy + h * 0.66, w, h * 0.12);
        if (w >= 26) {
          ctx.fillStyle = '#ffe9c2';
          ctx.font = '800 ' + Math.max(8, Math.floor(h * 0.3)) + 'px ui-monospace, Menlo, monospace';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('TNT', 0, 0);
          ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        }
      }
      ctx.restore();
    }

    ctx.strokeStyle = this.alpha(m.color, 0.95); ctx.lineWidth = 1.6;
    ctx.strokeRect(hx + 0.8, hy + 0.8, w - 1.6, h - 1.6);
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(hx + 2.5, hy + h - 2.5); ctx.lineTo(hx + 2.5, hy + 2.5); ctx.lineTo(hx + w - 2.5, hy + 2.5); ctx.stroke();

    // Damage cracks, stable per block.
    const n = dmg > 0.66 ? 3 : dmg > 0.33 ? 2 : dmg > 0.08 ? 1 : 0;
    if (n) {
      const r = KAB.Util.rng(b.id * 17 + 5);
      ctx.strokeStyle = b.mat === 'glass' ? 'rgba(255,255,255,0.85)' : 'rgba(10,5,15,0.8)';
      ctx.lineWidth = 1.3;
      for (let i = 0; i < n; i++) {
        let px = hx + r() * w, py = hy + (r() < 0.5 ? 0 : h);
        ctx.beginPath(); ctx.moveTo(px, py);
        for (let s = 0; s < 4; s++) { px += (r() - 0.5) * w * 0.4; py += (py > 0 ? -1 : 1) * h * 0.22 * r() + (r() - 0.5) * 4; ctx.lineTo(px, py); }
        ctx.stroke();
      }
    }
    if (b.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (b.flash * 0.45) + ')'; ctx.fillRect(hx, hy, w, h); }
    ctx.restore();

    if (b.mat === 'tnt') {                                       // pulsing fuse spark
      ctx.save();
      ctx.translate(b.x, b.y); ctx.rotate(b.angle);
      ctx.fillStyle = '#ffd34d'; ctx.shadowColor = '#ff5d3c'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(0, -h / 2 - 3, 2.4 + Math.sin(performance.now() / 90 + b.id) * 0.8, 0, 6.283); ctx.fill();
      ctx.restore();
    }
  },

  // ---- birds ------------------------------------------------------------
  drawBird(ctx, x, y, r, type, ang, look, t, o) {
    const spec = KAB.BIRDS[type];
    const col = spec.color;
    o = o || {};
    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang);
    ctx.shadowColor = col; ctx.shadowBlur = o.noGlow ? 0 : 14;

    // tail feathers + type-specific crest
    ctx.fillStyle = this.shade(col, -0.35);
    ctx.beginPath(); ctx.moveTo(-r * 0.7, -r * 0.1); ctx.lineTo(-r * 1.5, -r * 0.55); ctx.lineTo(-r * 1.15, -r * 0.05); ctx.lineTo(-r * 1.55, r * 0.3); ctx.lineTo(-r * 0.7, r * 0.25); ctx.closePath(); ctx.fill();
    ctx.fillStyle = this.shade(col, 0.1);
    if (type === 'cyan') {
      ctx.beginPath(); ctx.moveTo(-r * 0.1, -r * 0.8); ctx.lineTo(-r * 1.0, -r * 1.5); ctx.lineTo(-r * 0.55, -r * 0.7); ctx.lineTo(-r * 1.25, -r * 1.05); ctx.lineTo(-r * 0.3, -r * 0.3); ctx.closePath(); ctx.fill();
    } else if (type === 'gold') {
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * r * 0.36 - r * 0.15, -r * 0.85); ctx.lineTo(i * r * 0.36, -r * 1.35); ctx.lineTo(i * r * 0.36 + r * 0.15, -r * 0.85); ctx.closePath(); ctx.fill(); }
    } else {
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-r * 0.15 + i * r * 0.32, -r * 0.95, r * 0.2, 0, 6.283); ctx.fill(); }
    }

    // body
    const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.05);
    g.addColorStop(0, this.shade(col, 0.55)); g.addColorStop(0.55, col); g.addColorStop(1, this.shade(col, -0.45));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = this.shade(col, -0.55); ctx.lineWidth = 1.4; ctx.stroke();

    // belly
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.beginPath(); ctx.ellipse(r * 0.08, r * 0.46, r * 0.62, r * 0.4, 0, 0, 6.283); ctx.fill();

    // beak
    ctx.fillStyle = '#ffb02e';
    ctx.beginPath(); ctx.moveTo(r * 0.78, -r * 0.08); ctx.lineTo(r * 1.5, r * 0.18); ctx.lineTo(r * 0.78, r * 0.34); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#a85d00'; ctx.lineWidth = 1; ctx.stroke();

    // eyes (pupils track `look`), angry brow
    const lk = look == null ? 0 : look;
    const px = Math.cos(lk) * r * 0.07, py = Math.sin(lk) * r * 0.07;
    const blink = o.blink ? 0.15 : 1;
    for (const ex of [r * 0.18, r * 0.58]) {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(ex, -r * 0.2, r * 0.19, r * 0.24 * blink, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#10142a';
      ctx.beginPath(); ctx.arc(ex + px, -r * 0.2 + py, r * 0.09, 0, 6.283); ctx.fill();
    }
    ctx.strokeStyle = this.shade(col, -0.7); ctx.lineWidth = Math.max(1.6, r * 0.16); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-r * 0.02, -r * 0.62); ctx.lineTo(r * 0.4, -r * 0.4); ctx.moveTo(r * 0.8, -r * 0.62); ctx.lineTo(r * 0.42, -r * 0.4); ctx.stroke();
    ctx.restore();
  },

  // ---- hive drones (the enemies) -----------------------------------------
  drawEnemy(ctx, b, t) {
    const spec = KAB.ENEMIES[b.data.type];
    const r = b.r, col = spec.color;
    const frac = Math.max(0, b.hp / b.maxHp);
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.angle * 0.6);
    ctx.shadowColor = col; ctx.shadowBlur = 12;

    // antenna + blinking bulb
    ctx.strokeStyle = this.shade(col, -0.4); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -r * 0.9); ctx.lineTo(r * 0.2, -r * 1.35); ctx.stroke();
    ctx.fillStyle = Math.sin(t * 5 + b.id) > 0 ? '#ffe9a8' : '#ff5d9e';
    ctx.beginPath(); ctx.arc(r * 0.2, -r * 1.4, r * 0.13, 0, 6.283); ctx.fill();

    // side fins
    ctx.fillStyle = this.shade(col, -0.35);
    ctx.beginPath(); ctx.ellipse(-r * 1.0, r * 0.1, r * 0.28, r * 0.5, -0.3, 0, 6.283); ctx.fill();
    ctx.beginPath(); ctx.ellipse(r * 1.0, r * 0.1, r * 0.28, r * 0.5, 0.3, 0, 6.283); ctx.fill();

    // hull
    const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.05);
    g.addColorStop(0, this.shade(col, 0.5)); g.addColorStop(0.6, col); g.addColorStop(1, this.shade(col, -0.5));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = this.shade(col, -0.6); ctx.lineWidth = 1.5; ctx.stroke();

    // visor
    ctx.fillStyle = '#150b1e';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-r * 0.72, -r * 0.34, r * 1.44, r * 0.62, r * 0.28); else ctx.rect(-r * 0.72, -r * 0.34, r * 1.44, r * 0.62);
    ctx.fill();
    const hurt = frac < 0.4;
    ctx.strokeStyle = b.flash > 0 ? '#ffffff' : '#ffe9a8'; ctx.lineWidth = Math.max(1.6, r * 0.12); ctx.lineCap = 'round';
    for (const ex of [-r * 0.32, r * 0.32]) {
      ctx.beginPath();
      if (hurt) { const s = r * 0.12; ctx.moveTo(ex - s, -s * 0.7 - r * 0.02); ctx.lineTo(ex + s, s * 0.7 - r * 0.02); ctx.moveTo(ex + s, -s * 0.7 - r * 0.02); ctx.lineTo(ex - s, s * 0.7 - r * 0.02); }
      else { ctx.moveTo(ex - r * 0.12, -r * 0.08 + (ex < 0 ? -r * 0.05 : r * 0.05)); ctx.lineTo(ex + r * 0.12, -r * 0.08 + (ex < 0 ? r * 0.04 : -r * 0.04)); }
      ctx.stroke();
    }
    // grille
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); for (let i = -1; i <= 1; i++) { ctx.moveTo(i * r * 0.24 - r * 0.06, r * 0.5); ctx.lineTo(i * r * 0.24 - r * 0.06, r * 0.72); } ctx.stroke();

    if (b.data.type === 'armor' || b.data.type === 'boss') {         // helmet
      const hg = ctx.createLinearGradient(0, -r, 0, -r * 0.2);
      hg.addColorStop(0, '#dfe8ff'); hg.addColorStop(1, '#6f7da8');
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.arc(0, 0, r * 1.04, Math.PI * 1.08, Math.PI * 1.92); ctx.lineTo(r * 0.8, -r * 0.46); ctx.lineTo(-r * 0.8, -r * 0.46); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#2a3150'; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.fillStyle = '#2a3150';
      for (const rx of [-0.55, 0, 0.55]) { ctx.beginPath(); ctx.arc(r * rx, -r * 0.66, r * 0.06, 0, 6.283); ctx.fill(); }
    }
    if (b.data.type === 'boss') {                                     // crown
      ctx.fillStyle = '#ffd34d'; ctx.strokeStyle = '#8a5a00'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-r * 0.6, -r * 0.95);
      for (let i = 0; i < 4; i++) { ctx.lineTo(-r * 0.6 + i * r * 0.4 + r * 0.2, -r * 1.55); ctx.lineTo(-r * 0.6 + (i + 1) * r * 0.4, -r * 0.95); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    if (frac < 0.7) {
      ctx.strokeStyle = 'rgba(10,5,15,0.75)'; ctx.lineWidth = 1.3;
      const rr = KAB.Util.rng(b.id * 13);
      for (let i = 0; i < (frac < 0.35 ? 3 : 1); i++) {
        let px = (rr() - 0.5) * r, py = r * 0.1 + rr() * r * 0.7;
        ctx.beginPath(); ctx.moveTo(px, py); for (let s = 0; s < 3; s++) { px += (rr() - 0.5) * r * 0.5; py += r * 0.18; ctx.lineTo(px, py); } ctx.stroke();
      }
    }
    ctx.restore();

    if (b.data.type === 'boss' && b.hp < b.maxHp) {                   // boss health bar
      const bw = 70, bx = b.x - bw / 2, by = b.y - r - 26;
      ctx.fillStyle = 'rgba(5,6,15,0.8)'; ctx.fillRect(bx - 2, by - 2, bw + 4, 9);
      ctx.fillStyle = frac > 0.4 ? '#7CFFb2' : '#ff5d3c'; ctx.fillRect(bx, by, bw * frac, 5);
    }
  },

  // ---- slingshot ----------------------------------------------------------
  // Back band + back post (draw before the bird).
  slingBack(ctx, accent, bx, by, stretch) {
    const S = KAB.SLING;
    ctx.save();
    const mg = ctx.createLinearGradient(0, KAB.GROUND_Y - 62, 0, KAB.GROUND_Y);
    mg.addColorStop(0, '#8a6a45'); mg.addColorStop(1, '#5a3f26');
    ctx.fillStyle = this._hasLake() ? mg : '#0f1b36'; ctx.strokeStyle = this._hasLake() ? 'rgba(30,16,6,0.8)' : this.alpha(accent, 0.7); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(S.x - 30, KAB.GROUND_Y); ctx.lineTo(S.x - 20, KAB.GROUND_Y - 62); ctx.lineTo(S.x + 20, KAB.GROUND_Y - 62); ctx.lineTo(S.x + 30, KAB.GROUND_Y); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#7a4d1e'; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(S.x + 12, KAB.GROUND_Y - 58); ctx.lineTo(S.x + 12, S.y + 12); ctx.lineTo(S.x + 20, S.y - 6); ctx.stroke();
    ctx.strokeStyle = this.alpha(accent, 0.55); ctx.lineWidth = Math.max(2, 5 - stretch * 2.2);
    ctx.beginPath(); ctx.moveTo(S.x + 20, S.y - 6); ctx.lineTo(bx, by); ctx.stroke();
    ctx.restore();
  },
  // Front post + front band (draw after the bird).
  slingFront(ctx, accent, bx, by, stretch) {
    const S = KAB.SLING;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#a06a2a'; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.moveTo(S.x - 8, KAB.GROUND_Y - 58); ctx.lineTo(S.x - 8, S.y + 14); ctx.lineTo(S.x - 18, S.y - 8); ctx.stroke();
    ctx.strokeStyle = this.alpha(accent, 0.95); ctx.lineWidth = Math.max(2.2, 5.5 - stretch * 2.4);
    ctx.shadowColor = accent; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.moveTo(S.x - 18, S.y - 8); ctx.lineTo(bx, by); ctx.stroke();
    ctx.restore();
  },

  trajectory(ctx, pts, accent, t) {
    ctx.save();
    for (let i = 1; i < pts.length; i += 2) {
      const f = 1 - i / pts.length;
      ctx.globalAlpha = 0.25 + 0.75 * f;
      ctx.fillStyle = i % 4 === 1 ? '#ffffff' : accent;
      ctx.beginPath(); ctx.arc(pts[i].x, pts[i].y, 1.6 + 2.4 * f, 0, 6.283); ctx.fill();
    }
    ctx.restore();
  },
};
