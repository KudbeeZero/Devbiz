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
    cyan:   { color: '#39e6ff', accent: '#bff3ff', name: 'Cyan Bolt', tier: 'common', speed: 0, stability: 0, slimness: 0, cost: 0 },
    violet: { color: '#c46bff', accent: '#ecd2ff', name: 'Violet Flux', tier: 'uncommon', speed: 0.02, stability: 0, slimness: 0, cost: 250 },
    green:  { color: '#7CFFb2', accent: '#daffe9', name: 'Jade Spike', tier: 'uncommon', speed: 0, stability: 0.03, slimness: 0, cost: 250 },
    gold:   { color: '#ffd34d', accent: '#fff0bf', name: 'Gold Ace', tier: 'rare', speed: 0.04, stability: 0.02, slimness: 0, cost: 500 },
    ember:  { color: '#ff5d3c', accent: '#ffc8bb', name: 'Ember Tip', tier: 'rare', speed: 0, stability: 0, slimness: 0.05, cost: 500 },
  };

  // ---- Dart Workshop catalogs -------------------------------------------
  // TIPS change the point geometry + colour/glow + stat mods. `col:null` means "use the
  // barrel/skin colour" so neon tips theme with the equipped skin.
  const TIPS = {
    steel:  { name: 'Steel Point', col: '#eaf6ff', len: 0.20, glow: 0, tier: 'common', speed: 0, stability: 0, slimness: 0, cost: 0 },
    needle: { name: 'Needle',      col: '#dfeaff', len: 0.27, glow: 1, tier: 'uncommon', speed: 0.03, stability: 0, slimness: 0.02, cost: 200 },
    neon:   { name: 'Neon Spike',  col: null,      len: 0.21, glow: 7, tier: 'uncommon', speed: 0, stability: 0.03, slimness: 0, cost: 200 },
    plasma: { name: 'Plasma Tip',  col: '#ffffff', len: 0.25, glow: 13, hot: true, tier: 'epic', speed: 0.05, stability: 0.03, slimness: 0, cost: 750 },
    goldp:  { name: 'Gold Point',  col: '#ffd34d', len: 0.20, glow: 4, tier: 'rare', speed: 0, stability: 0.04, slimness: 0, cost: 400 },
  };

  // FLIGHTS change the tail feather silhouette + opacity + stat mods. Each `shape` returns
  // the polygon (in barrel-relative units) for one half; the renderer mirrors.
  const FLIGHTS = {
    standard: { name: 'Standard', alpha: 0.92, spread: 1.30, sweep: 0.50, notch: 0, tier: 'common', speed: 0, stability: 0, slimness: 0, cost: 0 },
    slim:     { name: 'Slim',     alpha: 0.95, spread: 0.85, sweep: 0.50, notch: 0, tier: 'uncommon', speed: 0, stability: 0, slimness: 0.04, cost: 150 },
    kite:     { name: 'Kite',     alpha: 0.92, spread: 1.65, sweep: 0.46, notch: 0, tier: 'uncommon', speed: 0.02, stability: 0, slimness: 0, cost: 150 },
    shark:    { name: 'Shark',    alpha: 0.94, spread: 1.45, sweep: 0.72, notch: 0, tier: 'rare', speed: 0.03, stability: 0.02, slimness: 0, cost: 350 },
    star:     { name: 'Star',     alpha: 0.95, spread: 1.55, sweep: 0.50, notch: 0.4, tier: 'rare', speed: 0, stability: 0.04, slimness: 0.02, cost: 350 },
    ghost:    { name: 'Ghost',    alpha: 0.55, spread: 1.70, sweep: 0.50, notch: 0, tier: 'epic', speed: 0.04, stability: 0, slimness: 0.06, cost: 600 },
  };

  function Sprites() {
    this.images = {};
    this.manifest = {};
    this.ready = false;
  }

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

  /* A neon dart drawn along +x with the TIP at the local origin (0,0) so the
   * caller can place the exact scoring point under the tip. The flight code
   * rotates the context to the travel direction before calling this.
   *   parts = { tip:'steel', flight:'standard' } (optional, cosmetic)
   */
  Sprites.prototype.drawDart = function (ctx, len, skin, glowK, parts) {
    skin = skin || SKINS.cyan;
    parts = parts || {};
    const tip = TIPS[parts.tip] || TIPS.steel;
    const flight = FLIGHTS[parts.flight] || FLIGHTS.standard;
    const L = len, h = len * 0.16;
    const tipCol = tip.col || skin.color;
    // Local geometry is laid out so the very tip sits at x=0; the body runs in -x.
    const tipBase = -L * tip.len;          // where the point meets the barrel
    ctx.save();
    ctx.shadowColor = skin.color;
    ctx.shadowBlur = 10 + (glowK || 0) * 8;

    // Point (tip) — apex at origin.
    if (tip.hot) { ctx.shadowColor = tipCol; ctx.shadowBlur = 14 + (glowK || 0) * 10; }
    ctx.fillStyle = tipCol;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(tipBase, -h * 0.5);
    ctx.lineTo(tipBase, h * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.shadowColor = skin.color; ctx.shadowBlur = 10 + (glowK || 0) * 8;

    // Barrel (skin colour).
    const bx = tipBase - L * 0.30;
    ctx.fillStyle = skin.color;
    this._roundRect(ctx, bx, -h * 0.55, L * 0.30, h * 1.1, h * 0.3, skin.color);
    // Barrel knurl highlight.
    ctx.fillStyle = skin.accent;
    ctx.fillRect(bx + L * 0.02, -h * 0.4, L * 0.26, h * 0.16);

    // Shaft.
    const sx = bx - L * 0.26;
    ctx.fillStyle = '#1a2236';
    this._roundRect(ctx, sx, -h * 0.22, L * 0.26, h * 0.44, h * 0.2, '#1a2236');

    // Flight (feathers) at the tail — silhouette from the equipped flight.
    const fx = sx;                         // feathers fan out from here, toward -x
    const fTail = fx - L * 0.28;
    const spr = h * flight.spread;
    const midx = fx - L * 0.28 * flight.sweep;
    ctx.fillStyle = skin.color;
    ctx.globalAlpha = flight.alpha;
    ctx.beginPath();
    ctx.moveTo(fx, 0);
    ctx.lineTo(fTail, -spr);
    if (flight.notch) ctx.lineTo(midx, -spr * flight.notch);
    ctx.lineTo(midx, 0);
    if (flight.notch) ctx.lineTo(midx, spr * flight.notch);
    ctx.lineTo(fTail, spr);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.shadowBlur = 0;
    ctx.restore();
  };

  /* A dart stuck in the board. x,y is the EXACT impact point — the dart's tip
   * lands on it. `ang` is the incoming travel angle (radians); a small per-dart
   * jitter is supplied by the caller so a grouping never looks rubber-stamped. */
  Sprites.prototype.drawStuckDart = function (ctx, x, y, skin, ang, parts) {
    if (ang == null) ang = -Math.PI * 0.78;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    // Tip is at origin already; nudge in micro-amount so it reads as embedded.
    this.drawDart(ctx, 40, skin, 0, parts);
    ctx.restore();
  };

  /* Procedural neon stage behind the board, used when the Firefly bg key
   * (bg.stage) is empty. Game blits the image instead when present. */
  Sprites.prototype.drawBackdrop = function (ctx, w, h, time) {
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
