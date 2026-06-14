/* =====================================================================
 * Kudbee Contra — art/sprites.js
 * Original, code-drawn placeholder art + the asset swap-in pipeline.
 *
 * THE PIPELINE CONTRACT:
 *   - assets/manifest.json maps logical keys (e.g. "player.idle",
 *     "bg.neon-jungle.far") to image file paths.
 *   - On load we fetch the manifest. For any key with a non-empty path,
 *     the image is loaded and used. For empty/missing keys we draw the
 *     original procedural placeholder instead.
 *   - Therefore: drop a production / AI-generated PNG into assets/<folder>/,
 *     point its key at the file in manifest.json, and it renders with ZERO
 *     code changes. See docs/ASSET_PIPELINE.md.
 *
 * All placeholder shapes below are original to Kudbee Contra.
 * ===================================================================== */
(function (KC) {
  'use strict';

  function Sprites() {
    this.images = {};       // key -> HTMLImageElement (only for provided assets)
    this.manifest = {};
    this.ready = false;
  }

  // Resolve manifest relative to the game root regardless of page depth.
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
              img.onerror = function () { res(); }; // fall back to procedural
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

  /* ===================================================================
   * Procedural drawing. Each entity calls these with its facing dir and a
   * walk/animation phase. Coordinates are local; callers translate first.
   * =================================================================== */

  // --- Kudbee Operative (player) ------------------------------------------
  Sprites.prototype.drawPlayer = function (ctx, w, h, state) {
    // Use the supplied character image (manifest: player.idle) when present.
    if (this.has('player.idle')) { this._drawPlayerImage(ctx, w, h, state); return; }
    const dir = state.dir || 1;
    const phase = state.phase || 0;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(dir, 1);

    const sliding = state.action === 'slide';
    const legSwing = Math.sin(phase) * (state.moving ? 6 : 0);

    // Energy aura.
    ctx.shadowColor = '#39e6ff';
    ctx.shadowBlur = 14;

    if (sliding) {
      // Low, stretched pose.
      this._roundRect(ctx, -w * 0.5, h * 0.1, w * 0.9, h * 0.32, 6, '#1b9ad6');
      this._roundRect(ctx, -w * 0.5, h * 0.05, w * 0.5, h * 0.18, 5, '#39e6ff');
      ctx.shadowBlur = 0;
      ctx.restore();
      return;
    }

    // Legs.
    ctx.fillStyle = '#1769a3';
    this._roundRect(ctx, -10, 6 + legSwing, 8, 22, 3, '#1769a3');
    this._roundRect(ctx, 2, 6 - legSwing, 8, 22, 3, '#1769a3');

    // Torso / armor.
    this._roundRect(ctx, -12, -16, 24, 26, 6, '#1b9ad6');
    this._roundRect(ctx, -12, -16, 24, 8, 6, '#39e6ff'); // chest light

    // Backpack/thruster.
    this._roundRect(ctx, -16, -12, 6, 18, 3, '#0e4d75');

    // Head / visor.
    this._roundRect(ctx, -8, -30, 16, 16, 5, '#123');
    ctx.fillStyle = '#7CFFb2';
    ctx.fillRect(-5, -26, 10, 4); // glowing visor

    // Arm + gun, aiming.
    const aim = state.aim || 0; // -1 up, 0 fwd, 1 down
    ctx.save();
    ctx.translate(8, -8);
    ctx.rotate(aim * 0.5);
    this._roundRect(ctx, 0, -3, 22, 6, 2, '#0e4d75');
    ctx.fillStyle = '#39e6ff';
    ctx.fillRect(20, -2, 4, 4); // muzzle tip
    ctx.restore();

    ctx.shadowBlur = 0;
    ctx.restore();
  };

  // Draw the player from a manifest image, anchored feet-to-hitbox-bottom and
  // flipped to face the travel direction. Slides squash the sprite.
  Sprites.prototype._drawPlayerImage = function (ctx, w, h, state) {
    const img = this.images['player.idle'];
    const dir = state.dir || 1;
    const sliding = state.action === 'slide';
    const dh = h * 1.6 * (sliding ? 0.6 : 1);
    const dw = dh * (img.width / img.height);
    const bob = state.moving ? Math.sin(state.phase || 0) * 1.5 : Math.sin((state.phase || 0) * 0.4) * 0.8;
    ctx.save();
    ctx.translate(w / 2, h + bob);     // bottom-center of the hitbox
    ctx.scale(dir, 1);
    ctx.shadowColor = '#39e6ff';
    ctx.shadowBlur = 10;
    ctx.drawImage(img, -dw / 2, -dh + 4, dw, dh);
    ctx.shadowBlur = 0;
    ctx.restore();
  };

  // Shared helper: draw an enemy from a manifest image, fit to the hitbox.
  // anchor 'bottom' seats ground units; 'center' suits floating ones.
  Sprites.prototype._enemyImg = function (ctx, key, w, h, dir, factor, anchor, glow) {
    const img = this.images[key];
    const dh = h * factor;
    const dw = dh * (img.width / img.height);
    ctx.save();
    if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 12; }
    if (anchor === 'bottom') {
      ctx.translate(w / 2, h);
      ctx.scale(dir, 1);
      ctx.drawImage(img, -dw / 2, -dh, dw, dh);
    } else {
      ctx.translate(w / 2, h / 2);
      ctx.scale(dir, 1);
      ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    }
    ctx.restore();
  };

  // --- Alien Drone --------------------------------------------------------
  Sprites.prototype.drawDrone = function (ctx, w, h, state) {
    if (this.has('enemy.drone')) { this._enemyImg(ctx, 'enemy.drone', w, h, state.dir >= 0 ? 1 : -1, 1.5, 'center', '#c46bff'); return; }
    const phase = state.phase || 0;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    const bob = Math.sin(phase * 2) * 3;
    ctx.translate(0, bob);
    ctx.shadowColor = '#c46bff';
    ctx.shadowBlur = 14;
    // Body
    ctx.fillStyle = '#7a2bbf';
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.42, h * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    // Eye
    ctx.fillStyle = '#ff4d6d';
    ctx.beginPath();
    ctx.arc(state.dir >= 0 ? 6 : -6, -2, 5, 0, Math.PI * 2);
    ctx.fill();
    // Rotor blur
    ctx.strokeStyle = 'rgba(196,107,255,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-w * 0.5, -h * 0.34);
    ctx.lineTo(w * 0.5, -h * 0.34);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
  };

  // --- Cyber Soldier ------------------------------------------------------
  Sprites.prototype.drawSoldier = function (ctx, w, h, state) {
    if (this.has('enemy.soldier')) { this._enemyImg(ctx, 'enemy.soldier', w, h, state.dir || 1, 1.32, 'bottom', '#ff5d3c'); return; }
    const dir = state.dir || 1;
    const phase = state.phase || 0;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(dir, 1);
    const legSwing = Math.sin(phase) * (state.moving ? 5 : 0);
    ctx.shadowColor = '#ff5d3c';
    ctx.shadowBlur = 8;
    this._roundRect(ctx, -9, 6 + legSwing, 7, 20, 3, '#7a1f1f');
    this._roundRect(ctx, 2, 6 - legSwing, 7, 20, 3, '#7a1f1f');
    this._roundRect(ctx, -11, -14, 22, 24, 5, '#b8412f');
    this._roundRect(ctx, -7, -28, 14, 15, 4, '#3a1010');
    ctx.fillStyle = '#ff5d3c';
    ctx.fillRect(-4, -24, 8, 3); // visor
    // Rifle
    this._roundRect(ctx, 6, -6, 20, 5, 2, '#222');
    ctx.shadowBlur = 0;
    ctx.restore();
  };

  // --- Mechanical Turret --------------------------------------------------
  Sprites.prototype.drawTurret = function (ctx, w, h, state) {
    if (this.has('enemy.turret')) { this._enemyImg(ctx, 'enemy.turret', w, h, state.dir || 1, 1.35, 'bottom', '#ffb13c'); return; }
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.shadowColor = '#ffb13c';
    ctx.shadowBlur = 8;
    // Base
    this._roundRect(ctx, -w * 0.4, 2, w * 0.8, h * 0.45, 4, '#444a55');
    // Dome
    ctx.fillStyle = '#5a6270';
    ctx.beginPath();
    ctx.arc(0, 2, w * 0.32, Math.PI, 0);
    ctx.fill();
    // Barrel toward target.
    ctx.save();
    ctx.rotate(state.aimAngle || 0);
    this._roundRect(ctx, 0, -3, w * 0.55, 6, 2, '#2b2f38');
    ctx.fillStyle = '#ffb13c';
    ctx.fillRect(w * 0.5, -2, 4, 4);
    ctx.restore();
    ctx.fillStyle = '#ff3c3c';
    ctx.beginPath(); ctx.arc(0, -2, 3, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  };

  // --- Mini-Boss: "Hive Sentinel" -----------------------------------------
  Sprites.prototype.drawBoss = function (ctx, w, h, state) {
    if (this.has('boss.hive-sentinel')) {
      const enraged = state.phaseNum >= 2;
      this._enemyImg(ctx, 'boss.hive-sentinel', w, h, 1, 1.3, 'center', enraged ? '#ff3c5d' : '#c46bff');
      return;
    }
    const phase = state.phase || 0;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    const enraged = state.phaseNum >= 2;
    ctx.shadowColor = enraged ? '#ff3c5d' : '#c46bff';
    ctx.shadowBlur = 22;
    // Core hull
    ctx.fillStyle = enraged ? '#5a1030' : '#3a1560';
    this._roundRect(ctx, -w * 0.45, -h * 0.4, w * 0.9, h * 0.8, 14, ctx.fillStyle);
    // Armor plates
    ctx.fillStyle = enraged ? '#8a1f3f' : '#5a2a8f';
    this._roundRect(ctx, -w * 0.45, -h * 0.4, w * 0.32, h * 0.8, 12, ctx.fillStyle);
    this._roundRect(ctx, w * 0.13, -h * 0.4, w * 0.32, h * 0.8, 12, ctx.fillStyle);
    // Pulsing core eye
    const pulse = 0.6 + Math.sin(phase * 3) * 0.4;
    ctx.fillStyle = enraged ? '#ff4d6d' : '#39e6ff';
    ctx.globalAlpha = pulse;
    ctx.beginPath(); ctx.arc(0, 0, w * 0.16, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    // Cannon pods
    this._roundRect(ctx, -w * 0.5, h * 0.1, w * 0.16, h * 0.22, 4, '#222');
    this._roundRect(ctx, w * 0.34, h * 0.1, w * 0.16, h * 0.22, 4, '#222');
    ctx.shadowBlur = 0;
    ctx.restore();
  };

  // --- K9 Companion (robotic missile-dog) ---------------------------------
  Sprites.prototype.drawCompanion = function (ctx, w, h, state) {
    const dir = state.dir || 1;
    const phase = state.phase || 0;
    const active = state.active;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(dir, 1);
    const accent = active ? '#ff5d3c' : '#39e6ff';
    ctx.shadowColor = accent;
    ctx.shadowBlur = active ? 18 : 12;

    // Hover thruster glow underneath.
    ctx.fillStyle = active ? 'rgba(255,93,60,0.5)' : 'rgba(57,230,255,0.4)';
    ctx.beginPath();
    ctx.ellipse(0, h * 0.42, w * 0.3, 4 + Math.sin(phase * 3) * 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body.
    this._roundRect(ctx, -w * 0.42, -h * 0.18, w * 0.7, h * 0.42, 7, '#243447');
    this._roundRect(ctx, -w * 0.42, -h * 0.18, w * 0.7, h * 0.16, 7, '#2f4a63');

    // Missile pod on the back (two tubes).
    this._roundRect(ctx, -w * 0.3, -h * 0.36, w * 0.34, h * 0.2, 3, '#1a2636');
    ctx.fillStyle = active ? '#ffd34d' : '#5a6b80';
    ctx.fillRect(-w * 0.26, -h * 0.32, 4, 4);
    ctx.fillRect(-w * 0.14, -h * 0.32, 4, 4);

    // Head with visor eye.
    this._roundRect(ctx, w * 0.18, -h * 0.1, w * 0.3, h * 0.34, 5, '#2f4a63');
    ctx.fillStyle = accent;
    ctx.fillRect(w * 0.3, -h * 0.02, w * 0.16, 4); // eye band
    // Antenna ear.
    ctx.strokeStyle = accent; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(w * 0.24, -h * 0.1); ctx.lineTo(w * 0.2, -h * 0.34); ctx.stroke();
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.arc(w * 0.2, -h * 0.36, 2.5, 0, Math.PI * 2); ctx.fill();

    // Little legs.
    ctx.fillStyle = '#1a2636';
    ctx.fillRect(-w * 0.3, h * 0.22, 5, h * 0.18);
    ctx.fillRect(-w * 0.05, h * 0.22, 5, h * 0.18);
    ctx.fillRect(w * 0.22, h * 0.22, 5, h * 0.18);

    ctx.shadowBlur = 0;
    ctx.restore();
  };

  // --- Pickups ------------------------------------------------------------
  Sprites.prototype.drawPickup = function (ctx, w, h, kind, phase) {
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.translate(0, Math.sin(phase * 3) * 3);
    const map = {
      health: { c: '#4dff9e', t: '+' },
      spread: { c: '#ffd34d', t: 'S' },
      plasma: { c: '#c46bff', t: 'P' },
      laser: { c: '#ff5d6d', t: 'L' },
    };
    const info = map[kind] || map.spread;
    ctx.shadowColor = info.c;
    ctx.shadowBlur = 16;
    this._roundRect(ctx, -w * 0.35, -h * 0.35, w * 0.7, h * 0.7, 5, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = info.c;
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(info.t, 0, 1);
    ctx.shadowBlur = 0;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  };

  // --- Helpers ------------------------------------------------------------
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

  KC.Sprites = Sprites;
})(window.KC = window.KC || {});
