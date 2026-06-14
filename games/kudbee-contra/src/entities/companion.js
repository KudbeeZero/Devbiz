/* =====================================================================
 * Kudbee Contra — entities/companion.js
 * "K9" — the player's robotic missile-dog companion (your Jarvis).
 *
 * It hovers at the operative's side and bobs idly. When the player's
 * OVERDRIVE meter is full and they trigger the Special, K9 enters its
 * barrage state: it locks onto the nearest enemy and rains homing missiles
 * for a few seconds. Charge builds back up through combat.
 *
 * Art: uses the manifest image `companion.idle` when present, otherwise an
 * original procedural robo-dog (art/sprites.js: drawCompanion).
 * ===================================================================== */
(function (KC) {
  'use strict';
  const Util = KC.Util;

  const BARRAGE_TIME = 5.0;   // seconds of missile fire
  const FIRE_INTERVAL = 0.30; // seconds between missiles during barrage

  function Companion(game) {
    this.game = game;
    this.w = 48; this.h = 34;
    this.reset();
  }

  Companion.prototype.reset = function () {
    const p = this.game.player;
    this.x = p ? p.cx() : 80;
    this.y = p ? p.cy() - 60 : 80;
    this.dir = 1;
    this.phase = Math.random() * 6;
    this.active = false;
    this.activeT = 0;
    this.fireCd = 0;
    this.level = 1;          // raised by the game's level-up system
  };

  Companion.prototype.cx = function () { return this.x + this.w / 2; };
  Companion.prototype.cy = function () { return this.y + this.h / 2; };

  // Fire the special: kick off the homing-missile barrage.
  Companion.prototype.activate = function () {
    this.active = true;
    // Higher operative levels extend the barrage and tighten its cadence.
    this.activeT = BARRAGE_TIME + (this.level - 1) * 0.5;
    this.fireCd = 0.15;
    this.game.audio.powerup();
    this.game.audio.bossAlarm();
    this.game.particles.burst(this.cx(), this.cy(), '#ffd34d', 22, 280, { glow: true });
    this.game.camera.shake(0.35);
  };

  Companion.prototype.update = function (dt, player, targets) {
    this.phase += dt * 4;

    // Hover behind/above the operative, easing toward the target slot.
    const slotX = player.cx() - player.dir * 42 - this.w / 2;
    const slotY = player.cy() - 58 - this.h / 2 + Math.sin(this.phase) * 4;
    this.x = Util.lerp(this.x, slotX, 1 - Math.pow(0.0002, dt));
    this.y = Util.lerp(this.y, slotY, 1 - Math.pow(0.0010, dt));
    this.dir = player.dir;

    if (this.active) {
      this.activeT -= dt;
      this.fireCd -= dt;
      if (this.fireCd <= 0) {
        const tgt = this._nearest(targets);
        if (tgt) {
          this._fireMissile(tgt);
          // From level 3+, fire a second missile at another target.
          if (this.level >= 3) {
            const t2 = this._nearest(targets.filter((t) => t !== tgt));
            if (t2) this._fireMissile(t2);
          }
          this.fireCd = Math.max(0.16, FIRE_INTERVAL - (this.level - 1) * 0.025);
        } else this.fireCd = 0.12;
      }
      if (this.activeT <= 0) this.active = false;
    }
  };

  Companion.prototype._nearest = function (targets) {
    let best = null, bd = Infinity;
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      if (!t || t.dead) continue;
      const d = Util.dist(this.cx(), this.cy(), t.cx(), t.cy());
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  };

  Companion.prototype._fireMissile = function (tgt) {
    const dx = tgt.cx() - this.cx();
    const dy = tgt.cy() - this.cy();
    const len = Math.hypot(dx, dy) || 1;
    this.game.projectiles.spawn({
      x: this.cx(), y: this.cy(),
      vx: dx / len * 240, vy: dy / len * 240,
      radius: 5, damage: 3, friendly: true,
      color: '#ffd34d', style: 'missile', life: 2.6,
    });
    this.game.audio.grenade();
    this.game.particles.muzzle(this.cx(), this.cy(), this.dir);
  };

  Companion.prototype.draw = function (ctx, sprites) {
    ctx.save();
    ctx.translate(this.x, this.y);
    if (sprites.has('companion.idle')) {
      const img = sprites.images['companion.idle'];
      const dw = this.h * 1.7 * (img.width / img.height);
      const dh = this.h * 1.7;
      ctx.save();
      ctx.translate(this.w / 2, this.h / 2);
      ctx.scale(this.dir, 1);
      ctx.shadowColor = this.active ? '#ff5d3c' : '#39e6ff';
      ctx.shadowBlur = this.active ? 18 : 10;
      ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    } else {
      sprites.drawCompanion(ctx, this.w, this.h, { dir: this.dir, phase: this.phase, active: this.active });
    }
    ctx.restore();
  };

  KC.Companion = Companion;
})(window.KC = window.KC || {});
