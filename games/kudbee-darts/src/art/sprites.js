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

  // Dart skins: barrel + glow colour. Unlocked via progression.
  const SKINS = {
    cyan:   { color: '#39e6ff', accent: '#bff3ff', name: 'Cyan Bolt' },
    violet: { color: '#c46bff', accent: '#ecd2ff', name: 'Violet Flux' },
    green:  { color: '#7CFFb2', accent: '#daffe9', name: 'Jade Spike' },
    gold:   { color: '#ffd34d', accent: '#fff0bf', name: 'Gold Ace' },
    ember:  { color: '#ff5d3c', accent: '#ffc8bb', name: 'Ember Tip' },
  };

  function Sprites() {
    this.images = {};
    this.manifest = {};
    this.ready = false;
  }

  Sprites.SKINS = SKINS;

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

  /* A neon dart drawn along +x (tip at +len/2). The flight code rotates the
   * context to the travel direction before calling this. */
  Sprites.prototype.drawDart = function (ctx, len, skin, glowK) {
    skin = skin || SKINS.cyan;
    const L = len, h = len * 0.16;
    ctx.save();
    ctx.shadowColor = skin.color;
    ctx.shadowBlur = 10 + (glowK || 0) * 8;

    // Point (tip).
    ctx.fillStyle = '#eaf6ff';
    ctx.beginPath();
    ctx.moveTo(L * 0.5, 0);
    ctx.lineTo(L * 0.30, -h * 0.5);
    ctx.lineTo(L * 0.30, h * 0.5);
    ctx.closePath();
    ctx.fill();

    // Barrel (skin colour).
    ctx.fillStyle = skin.color;
    this._roundRect(ctx, L * 0.02, -h * 0.55, L * 0.30, h * 1.1, h * 0.3, skin.color);
    // Barrel highlight.
    ctx.fillStyle = skin.accent;
    ctx.fillRect(L * 0.04, -h * 0.4, L * 0.26, h * 0.18);

    // Shaft.
    ctx.fillStyle = '#1a2236';
    this._roundRect(ctx, -L * 0.22, -h * 0.22, L * 0.26, h * 0.44, h * 0.2, '#1a2236');

    // Flight (feathers) at the tail.
    ctx.fillStyle = skin.color;
    ctx.globalAlpha = 0.92;
    ctx.beginPath();
    ctx.moveTo(-L * 0.22, 0);
    ctx.lineTo(-L * 0.5, -h * 1.3);
    ctx.lineTo(-L * 0.34, 0);
    ctx.lineTo(-L * 0.5, h * 1.3);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.shadowBlur = 0;
    ctx.restore();
  };

  /* A dart stuck in the board: small, angled as if thrown from the player's
   * side (coming in from lower-right). x,y is the impact point on the board. */
  Sprites.prototype.drawStuckDart = function (ctx, x, y, skin) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-Math.PI * 0.78); // tip into the board, tail toward lower-right
    this.drawDart(ctx, 40, skin, 0);
    ctx.restore();
  };

  /* Procedural neon stage behind the board, used when the Firefly bg key
   * (bg.stage) is empty. Game blits the image instead when present. */
  Sprites.prototype.drawBackdrop = function (ctx, w, h, time) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0a0f24');
    g.addColorStop(0.55, '#070a18');
    g.addColorStop(1, '#04050d');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Spotlight cone onto the board area.
    const cone = ctx.createRadialGradient(w / 2, h * 0.06, 20, w / 2, h * 0.42, h * 0.7);
    cone.addColorStop(0, 'rgba(57,230,255,0.16)');
    cone.addColorStop(1, 'rgba(57,230,255,0)');
    ctx.fillStyle = cone;
    ctx.fillRect(0, 0, w, h);

    // Drifting background fireflies.
    ctx.save();
    for (let i = 0; i < 22; i++) {
      const fx = (i * 137.5 % w);
      const fy = (h * 0.2 + ((i * 53 + time * 18) % (h * 0.7)));
      const tw = 0.3 + 0.3 * Math.sin(time * 2 + i);
      ctx.globalAlpha = tw;
      ctx.fillStyle = i % 2 ? '#39e6ff' : '#c46bff';
      ctx.beginPath(); ctx.arc(fx, fy, 1.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // Oche / floor line.
    ctx.strokeStyle = 'rgba(124,255,178,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, h - 26);
    ctx.lineTo(w, h - 26);
    ctx.stroke();
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
