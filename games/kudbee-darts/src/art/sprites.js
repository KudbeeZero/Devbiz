/* =====================================================================
 * Kudbee Darts — art/sprites.js
 * Original code-drawn art + the asset swap-in pipeline (same contract as
 * Kudbee Contra):
 *   - assets/manifest.json maps logical keys -> image paths.
 *   - Non-empty path => the image loads and is used.
 *   - Empty/missing  => the procedural placeholder draws instead.
 * So an Adobe Firefly background can be dropped into assets/backgrounds/ and
 * wired via the manifest with ZERO code changes. The dartboard itself is NOT
 * here — it lives in world/board.js so geometry and pixels stay exact.
 * ===================================================================== */
(function (KD) {
  'use strict';

  // Dart skins: barrel + glow colour + stat mods. Unlocked via progression.
  const SKINS = {
    cyan:   { color: '#39e6ff', accent: '#bff3ff', name: 'Cyan Bolt', tier: 'common', speed: 0, stability: 0, slimness: 0 },
    violet: { color: '#c46bff', accent: '#ecd2ff', name: 'Violet Flux', tier: 'uncommon', speed: 0.02, stability: 0, slimness: 0 },
    green:  { color: '#7CFFb2', accent: '#daffe9', name: 'Jade Spike', tier: 'uncommon', speed: 0, stability: 0.03, slimness: 0 },
    gold:   { color: '#ffd34d', accent: '#fff0bf', name: 'Gold Ace', tier: 'rare', speed: 0.04, stability: 0.02, slimness: 0 },
    ember:  { color: '#ff5d3c', accent: '#ffc8bb', name: 'Ember Tip', tier: 'rare', speed: 0, stability: 0, slimness: 0.05 },
  };

  // ---- Dart Workshop catalogs -------------------------------------------
  // TIPS change the point geometry + colour/glow + stat mods. `col:null` means "use the
  // barrel/skin colour" so neon tips theme with the equipped skin.
  const TIPS = {
    steel:  { name: 'Steel Point', col: '#eaf6ff', len: 0.20, glow: 0, tier: 'common', speed: 0, stability: 0, slimness: 0 },
    needle: { name: 'Needle',      col: '#dfeaff', len: 0.27, glow: 1, tier: 'uncommon', speed: 0.03, stability: 0, slimness: 0.02 },
    neon:   { name: 'Neon Spike',  col: null,      len: 0.21, glow: 7, tier: 'uncommon', speed: 0, stability: 0.03, slimness: 0 },
    plasma: { name: 'Plasma Tip',  col: '#ffffff', len: 0.25, glow: 13, hot: true, tier: 'epic', speed: 0.05, stability: 0.03, slimness: 0 },
    goldp:  { name: 'Gold Point',  col: '#ffd34d', len: 0.20, glow: 4, tier: 'rare', speed: 0, stability: 0.04, slimness: 0 },
  };

  // FLIGHTS change the tail feather silhouette + opacity + stat mods. Each `shape` returns
  // the polygon (in barrel-relative units) for one half; the renderer mirrors.
  const FLIGHTS = {
    standard: { name: 'Standard', alpha: 0.92, spread: 1.30, sweep: 0.50, notch: 0, tier: 'common', speed: 0, stability: 0, slimness: 0 },
    slim:     { name: 'Slim',     alpha: 0.95, spread: 0.85, sweep: 0.50, notch: 0, tier: 'uncommon', speed: 0, stability: 0, slimness: 0.04 },
    kite:     { name: 'Kite',     alpha: 0.92, spread: 1.65, sweep: 0.46, notch: 0, tier: 'uncommon', speed: 0.02, stability: 0, slimness: 0 },
    shark:    { name: 'Shark',    alpha: 0.94, spread: 1.45, sweep: 0.72, notch: 0, tier: 'rare', speed: 0.03, stability: 0.02, slimness: 0 },
    star:     { name: 'Star',     alpha: 0.95, spread: 1.55, sweep: 0.50, notch: 0.4, tier: 'rare', speed: 0, stability: 0.04, slimness: 0.02 },
    ghost:    { name: 'Ghost',    alpha: 0.55, spread: 1.70, sweep: 0.50, notch: 0, tier: 'epic', speed: 0.04, stability: 0, slimness: 0.06 },
  };

  function Sprites() {
    this.images = {};
    this.manifest = {};
    this.ready = false;
  }

  // Drawn length (logical px) of a dart stuck in the board. Flight scales to match it.
  Sprites.STUCK_LEN = 64;
  Sprites.SKINS = SKINS;
  Sprites.TIPS = TIPS;
  Sprites.FLIGHTS = FLIGHTS;

  Sprites.prototype.load = function (manifestUrl) {
    const self = this;
    return fetch(manifestUrl)
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (json) {
        self.manifest = json && json.assets ? json.assets : {};
        const loads = [];
        Object.keys(self.manifest).forEach(function (key) {
          const path = self.manifest[key];
          if (path) {
            loads.push(new Promise(function (res) {
              const img = new Image();
              img.onload = function () { self.images[key] = img; res(); };
              img.onerror = function () { res(); };
              img.src = manifestUrl.replace(/manifest\.json$/, '') + path;
            }));
          }
        });
        return Promise.all(loads);
      })
      .catch(function () { /* no manifest -> all procedural */ })
      .then(function () { self.ready = true; });
  };

  Sprites.prototype.has = function (key) { return !!this.images[key]; };

  // ---- colour helpers (cached) -------------------------------------------
  const _rgbCache = {};
  function rgb(hex) {
    let c = _rgbCache[hex];
    if (c) return c;
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(function (x) { return x + x; }).join('') : h, 16);
    c = _rgbCache[hex] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    return c;
  }
  // k < 1 darkens toward black, k > 1 lightens toward white.
  function shade(hex, k) {
    const c = rgb(hex);
    const f = k < 1 ? function (v) { return Math.round(v * k); } : function (v) { return Math.round(v + (255 - v) * (k - 1)); };
    return 'rgb(' + f(c[0]) + ',' + f(c[1]) + ',' + f(c[2]) + ')';
  }

  /* A dart drawn along +x with the TIP at the local origin (0,0) so the caller
   * can place the exact scoring point under the tip. The flight code rotates
   * the context to the travel direction before calling this.
   *   parts = { tip:'steel', flight:'standard' } (optional, cosmetic)
   * Front to back: steel point -> torpedo barrel (shaded, with grip rings) ->
   * ringed shaft -> two-panel flight with a crease. Glow comes from a cached
   * sprite behind the barrel, not per-shape shadowBlur.
   */
  Sprites.prototype.drawDart = function (ctx, len, skin, glowK, parts) {
    skin = skin || SKINS.cyan;
    parts = parts || {};
    const tip = TIPS[parts.tip] || TIPS.steel;
    const flight = FLIGHTS[parts.flight] || FLIGHTS.standard;
    const L = len, h = len * 0.16;
    const col = skin.color, acc = skin.accent;
    const tipCol = tip.col || col;
    const tipBase = -L * tip.len;                 // where the point meets the barrel
    const bLen = L * 0.34, bx = tipBase - bLen;   // barrel runs bx .. tipBase
    const sLen = L * 0.22, sx = bx - sLen;        // shaft runs sx .. bx
    const fTail = sx - L * 0.30;                  // flight tail
    ctx.save();

    // Soft skin-coloured glow behind the barrel (cheap sprite, no blur filter).
    const gl = (glowK || 0);
    if (KD.Particles && KD.Particles.glowSprite) {
      const gr = h * (2.1 + gl * 1.0);
      ctx.globalAlpha = 0.16 + gl * 0.16;
      ctx.drawImage(KD.Particles.glowSprite(col), tipBase - bLen * 0.5 - gr, -gr, gr * 2, gr * 2);
      ctx.globalAlpha = 1;
    }

    // ---- Flight (drawn first so shaft/barrel overlap its root) ------------
    const spr = h * flight.spread * 1.15;
    const fx = sx + sLen * 0.05;
    const midx = fx - (fx - fTail) * flight.sweep;
    const panel = function (sign) {
      ctx.beginPath();
      ctx.moveTo(fx, 0);
      ctx.lineTo(fTail, sign * spr);
      if (flight.notch) ctx.lineTo(midx, sign * spr * flight.notch);
      ctx.lineTo(midx, 0);
      ctx.closePath();
    };
    ctx.globalAlpha = flight.alpha;
    panel(-1); ctx.fillStyle = shade(col, 1.18); ctx.fill();   // upper panel catches the light
    panel(1);  ctx.fillStyle = shade(col, 0.62); ctx.fill();   // lower panel in shade
    ctx.globalAlpha = 1;
    // Accent stripe along the leading third of each panel + crease + edge light.
    ctx.globalAlpha = flight.alpha * 0.85;
    ctx.fillStyle = acc;
    ctx.beginPath(); ctx.moveTo(fx - (fx - fTail) * 0.10, -spr * 0.10); ctx.lineTo(fx - (fx - fTail) * 0.24, -spr * 0.46); ctx.lineTo(fx - (fx - fTail) * 0.34, -spr * 0.40); ctx.lineTo(fx - (fx - fTail) * 0.20, -spr * 0.06); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(fx - (fx - fTail) * 0.10, spr * 0.10); ctx.lineTo(fx - (fx - fTail) * 0.24, spr * 0.46); ctx.lineTo(fx - (fx - fTail) * 0.34, spr * 0.40); ctx.lineTo(fx - (fx - fTail) * 0.20, spr * 0.06); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = Math.max(0.6, h * 0.05);
    ctx.beginPath(); ctx.moveTo(fx, -h * 0.02); ctx.lineTo(fTail, -spr); if (flight.notch) ctx.lineTo(midx, -spr * flight.notch); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath(); ctx.moveTo(fx, 0); ctx.lineTo(midx, 0); ctx.stroke();
    ctx.globalAlpha = 1;

    // ---- Shaft: slim steel tube with two joint rings ----------------------
    const sh = h * 0.30;
    const sg = ctx.createLinearGradient(0, -sh, 0, sh);
    sg.addColorStop(0, '#e9eef5'); sg.addColorStop(0.45, '#8f99a8'); sg.addColorStop(1, '#2a303b');
    ctx.fillStyle = sg;
    ctx.fillRect(sx, -sh, sLen + 1, sh * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(sx + sLen * 0.30, -sh, Math.max(0.6, h * 0.06), sh * 2);
    ctx.fillRect(sx + sLen * 0.70, -sh, Math.max(0.6, h * 0.06), sh * 2);

    // ---- Barrel: torpedo profile (slim front, fat middle, slim rear) ------
    const hw0 = h * 0.40, hw1 = h * 0.56, hw2 = h * 0.46;
    const bg = ctx.createLinearGradient(0, -hw1, 0, hw1);
    bg.addColorStop(0, shade(col, 1.55));
    bg.addColorStop(0.25, shade(col, 1.12));
    bg.addColorStop(0.62, shade(col, 0.72));
    bg.addColorStop(1, shade(col, 0.34));
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(tipBase, -hw0);
    ctx.quadraticCurveTo(bx + bLen * 0.45, -hw1 * 1.12, bx, -hw2);
    ctx.lineTo(bx, hw2);
    ctx.quadraticCurveTo(bx + bLen * 0.45, hw1 * 1.12, tipBase, hw0);
    ctx.closePath();
    ctx.fill();
    // Knurled grip rings across the middle of the barrel.
    ctx.strokeStyle = 'rgba(0,0,0,0.42)'; ctx.lineWidth = Math.max(0.5, h * 0.05);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const gx = bx + bLen * (0.22 + i * 0.105);
      const gh = hw1 * (1 - Math.abs(i - 2.5) * 0.06);
      ctx.moveTo(gx, -gh); ctx.lineTo(gx, gh);
    }
    ctx.stroke();
    // Specular streak along the top.
    ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = Math.max(0.7, h * 0.09); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(tipBase - bLen * 0.08, -hw1 * 0.52); ctx.lineTo(bx + bLen * 0.1, -hw1 * 0.62); ctx.stroke();

    // ---- Point: slim steel (or themed) cone with a lit edge ---------------
    const tw = h * 0.20;
    const tg = ctx.createLinearGradient(0, -tw, 0, tw);
    tg.addColorStop(0, shade(tipCol, 1.5)); tg.addColorStop(0.5, tipCol); tg.addColorStop(1, shade(tipCol, 0.45));
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(tipBase + L * 0.01, -tw * 1.6);
    ctx.lineTo(tipBase + L * 0.01, tw * 1.6);
    ctx.closePath(); ctx.fill();
    if (tip.glow) {                      // themed tips keep a small hot glow
      ctx.globalCompositeOperation = 'lighter';
      const tr = h * (0.55 + tip.glow * 0.045) + gl * h * 0.3;
      ctx.globalAlpha = tip.hot ? 0.7 : 0.4;
      ctx.drawImage(KD.Particles.glowSprite(tipCol === '#ffffff' ? col : tipCol), tipBase * 0.5 - tr, -tr, tr * 2, tr * 2);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    }
    ctx.restore();
  };

  /* A dart stuck in the board. x,y is the EXACT impact point — the dart's tip
   * lands on it. `ang` is the incoming travel angle (radians); a small per-dart
   * jitter is supplied by the caller so a grouping never looks rubber-stamped. */
  Sprites.prototype.drawStuckDart = function (ctx, x, y, skin, ang, parts) {
    if (ang == null) ang = -Math.PI * 0.78;
    // Contact shadow: a soft dark ellipse pressed against the board right at the
    // tip, so the dart reads as EMBEDDED in the surface, not floating above it.
    ctx.save();
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(x, y, 8, 3.5, ang, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    // Tip is at origin already; nudge in micro-amount so it reads as embedded.
    this.drawDart(ctx, Sprites.STUCK_LEN, skin, 0, parts);
    ctx.restore();
  };

  /* Warm wood-panelled pub wall + plank floor for the 'pub' board theme. */
  Sprites.prototype._drawBackdropPub = function (ctx, w, h, time) {
    const horizon = h * 0.66, cx = w / 2;
    const g = ctx.createLinearGradient(0, 0, 0, horizon);
    g.addColorStop(0, '#2d1b11'); g.addColorStop(1, '#1b100a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, horizon);

    // Panelling: vertical boards with a dark seam and a faint top-left sheen.
    for (let x = 0; x < w; x += 56) {
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(x, 0, 3, horizon);
      ctx.fillStyle = 'rgba(255,200,140,0.035)'; ctx.fillRect(x + 3, 0, 10, horizon);
    }
    // Picture-rail along the top and a chair-rail above the floor.
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, h * 0.045, w, 5);
    ctx.fillStyle = '#3a2314'; ctx.fillRect(0, horizon - 14, w, 14);
    ctx.fillStyle = 'rgba(255,200,140,0.12)'; ctx.fillRect(0, horizon - 14, w, 2);

    // Warm pool of light from the lamp over the board.
    const glow = ctx.createRadialGradient(cx, h * 0.40, 30, cx, h * 0.40, w * 0.55);
    glow.addColorStop(0, 'rgba(255,190,110,0.30)');
    glow.addColorStop(0.5, 'rgba(255,150,70,0.09)');
    glow.addColorStop(1, 'rgba(255,150,70,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, w, horizon);
    ctx.save();
    ctx.beginPath(); ctx.moveTo(cx - 26, -20); ctx.lineTo(cx - 330, h * 0.62); ctx.lineTo(cx + 330, h * 0.62); ctx.lineTo(cx + 26, -20); ctx.closePath();
    ctx.fillStyle = 'rgba(255,205,140,0.055)'; ctx.fill();
    ctx.restore();

    // Plank floor with perspective seams.
    const fg = ctx.createLinearGradient(0, horizon, 0, h);
    fg.addColorStop(0, '#22140c'); fg.addColorStop(1, '#0e0804');
    ctx.fillStyle = fg; ctx.fillRect(0, horizon, w, h - horizon);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,190,120,0.07)'; ctx.lineWidth = 1.5;
    for (let i = -6; i <= 6; i++) {
      ctx.beginPath(); ctx.moveTo(cx + i * (w / 8), h); ctx.lineTo(cx + i * 10, horizon); ctx.stroke();
    }
    ctx.restore();

    // A few dust motes drifting through the light.
    ctx.save();
    for (let i = 0; i < 14; i++) {
      const mx = cx - 260 + ((i * 97.3 + time * (4 + (i % 4))) % 520);
      const my = h * 0.12 + ((i * 61 + time * 6) % (horizon * 0.8));
      ctx.globalAlpha = 0.12 + 0.12 * Math.sin(time * 1.5 + i);
      ctx.fillStyle = '#ffd9a8';
      ctx.beginPath(); ctx.arc(mx, my, 1.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  };

  /* Procedural neon stage behind the board, used when the Firefly bg key
   * (bg.stage) is empty. Game blits the image instead when present. */
  Sprites.prototype.drawBackdrop = function (ctx, w, h, time, theme) {
    if (theme === 'pub') { this._drawBackdropPub(ctx, w, h, time); return; }
    const horizon = h * 0.66;             // where the back wall meets the floor
    const cx = w / 2;

    // Back wall — deep vertical gradient.
    const g = ctx.createLinearGradient(0, 0, 0, horizon);
    g.addColorStop(0, '#0a1028');
    g.addColorStop(0.6, '#080b1c');
    g.addColorStop(1, '#06091a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, horizon);

    // Big soft stage glow behind the board (cyan core, violet halo).
    const glow = ctx.createRadialGradient(cx, h * 0.40, 30, cx, h * 0.40, w * 0.5);
    glow.addColorStop(0, 'rgba(57,230,255,0.18)');
    glow.addColorStop(0.4, 'rgba(120,90,255,0.08)');
    glow.addColorStop(1, 'rgba(57,230,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, horizon);

    // Two spotlight cones from the top corners onto the board.
    [w * 0.16, w * 0.84].forEach(function (sx) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(sx, -20);
      ctx.lineTo(cx - 150, h * 0.5);
      ctx.lineTo(cx + 150, h * 0.5);
      ctx.closePath();
      ctx.fillStyle = 'rgba(150,190,255,0.045)';
      ctx.fill();
      ctx.restore();
    });

    // Faint neon wall strips on the far left/right for depth.
    ctx.save();
    for (let i = 0; i < 4; i++) {
      const sx = 30 + i * 26;
      ctx.globalAlpha = 0.10 - i * 0.02;
      ctx.fillStyle = '#39e6ff'; ctx.fillRect(sx, h * 0.12, 3, horizon - h * 0.12);
      ctx.fillStyle = '#c46bff'; ctx.fillRect(w - sx - 3, h * 0.12, 3, horizon - h * 0.12);
    }
    ctx.restore();

    // Floor — darker, with perspective lines converging toward the board.
    const fg = ctx.createLinearGradient(0, horizon, 0, h);
    fg.addColorStop(0, '#05060f');
    fg.addColorStop(1, '#03040a');
    ctx.fillStyle = fg;
    ctx.fillRect(0, horizon, w, h - horizon);
    ctx.save();
    ctx.strokeStyle = 'rgba(57,230,255,0.10)';
    ctx.lineWidth = 1.5;
    const vanishX = cx, vanishY = horizon - 40;
    for (let i = -5; i <= 5; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + i * (w / 9), h);
      ctx.lineTo(vanishX + i * 8, vanishY);
      ctx.stroke();
    }
    // A couple of horizontal floor bands.
    for (let j = 1; j <= 3; j++) {
      const fy = horizon + (h - horizon) * (j / 3.2);
      ctx.globalAlpha = 0.5 - j * 0.12;
      ctx.beginPath(); ctx.moveTo(0, fy); ctx.lineTo(w, fy); ctx.stroke();
    }
    ctx.restore();

    // Drifting bokeh orbs (soft, blurred) + crisp fireflies.
    ctx.save();
    for (let i = 0; i < 12; i++) {
      const bx = (i * 197.3 + Math.sin(time * 0.3 + i) * 30) % w;
      const by = h * 0.1 + ((i * 71 + time * 8) % (horizon * 0.9));
      const rad = 10 + (i % 3) * 8;
      const orb = ctx.createRadialGradient(bx, by, 0, bx, by, rad);
      const col = i % 2 ? '57,230,255' : '196,107,255';
      orb.addColorStop(0, 'rgba(' + col + ',0.10)');
      orb.addColorStop(1, 'rgba(' + col + ',0)');
      ctx.fillStyle = orb;
      ctx.beginPath(); ctx.arc(bx, by, rad, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < 22; i++) {
      const fx = (i * 137.5 % w);
      const fy = (h * 0.18 + ((i * 53 + time * 18) % (horizon * 0.85)));
      ctx.globalAlpha = 0.3 + 0.3 * Math.sin(time * 2 + i);
      ctx.fillStyle = i % 2 ? '#39e6ff' : '#c46bff';
      ctx.beginPath(); ctx.arc(fx, fy, 1.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // Oche / throw line glow on the floor.
    ctx.save();
    ctx.shadowColor = '#7CFFb2'; ctx.shadowBlur = 12;
    ctx.strokeStyle = 'rgba(124,255,178,0.35)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.34, h - 26);
    ctx.lineTo(cx + w * 0.34, h - 26);
    ctx.stroke();
    ctx.restore();
  };

  Sprites.prototype._roundRect = function (ctx, x, y, w, h, r, fill) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  };

  KD.Sprites = Sprites;
})(window.KD = window.KD || {});
