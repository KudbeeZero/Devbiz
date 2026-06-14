/* =====================================================================
 * Kudbee Contra — entities/projectiles.js
 * Pooled projectiles for both the player and enemies, plus arcing grenades.
 * `friendly` flags who they damage. Collision + damage resolution lives in
 * game.js; this module owns spawning, motion, and drawing.
 * ===================================================================== */
(function (KC) {
  'use strict';
  const Util = KC.Util;

  function Projectiles() {
    this.pool = new Util.ObjectPool(
      function () { return {}; },
      function (p, cfg) {
        p.x = cfg.x; p.y = cfg.y;
        p.vx = cfg.vx; p.vy = cfg.vy;
        p.w = (cfg.radius || 4) * 2; p.h = (cfg.radius || 4) * 2;
        p.radius = cfg.radius || 4;
        p.damage = cfg.damage || 1;
        p.friendly = !!cfg.friendly;
        p.color = cfg.color || '#fff';
        p.style = cfg.style || 'bolt';     // bolt | enemy | grenade
        p.life = cfg.life || 2.0;
        p.gravity = cfg.gravity || 0;
        p.fuse = cfg.fuse || 0;            // grenades explode on fuse end
        p.spin = 0;
      }
    );
  }

  Projectiles.prototype.spawn = function (cfg) { return this.pool.spawn(cfg); };

  // Fire one weapon definition from (x,y) toward unit vector (dx,dy).
  Projectiles.prototype.fireWeapon = function (weapon, x, y, dx, dy, friendly) {
    const baseAngle = Math.atan2(dy, dx);
    const n = weapon.pellets;
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : (i / (n - 1) - 0.5);
      const a = baseAngle + t * weapon.spread;
      this.spawn({
        x: x, y: y,
        vx: Math.cos(a) * weapon.speed,
        vy: Math.sin(a) * weapon.speed,
        radius: weapon.radius,
        damage: weapon.damage,
        friendly: friendly,
        color: weapon.color,
        style: 'bolt',
        life: 1.6,
      });
    }
  };

  Projectiles.prototype.grenade = function (x, y, dir, up) {
    return this.spawn({
      x: x, y: y,
      vx: dir * 260, vy: up ? -460 : -360,
      radius: 6, damage: 4, friendly: true,
      color: '#ffd34d', style: 'grenade',
      life: 5, gravity: 1100, fuse: 0.9,
    });
  };

  Projectiles.prototype.update = function (dt, groundY) {
    const a = this.pool.active;
    for (let i = 0; i < a.length; i++) {
      const p = a[i];
      p.life -= dt;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.spin += dt * 12;
      if (p.style === 'grenade') {
        p.fuse -= dt;
        // bounce on ground
        if (p.y > groundY - p.radius) {
          p.y = groundY - p.radius;
          p.vy *= -0.45;
          p.vx *= 0.7;
        }
        if (p.fuse <= 0) { p.dead = true; p.exploded = true; }
      }
      if (p.life <= 0) p.dead = true;
    }
  };

  Projectiles.prototype.sweep = function () { this.pool.sweep(); };
  Projectiles.prototype.clear = function () { this.pool.clear(); };

  Projectiles.prototype.draw = function (ctx) {
    const a = this.pool.active;
    for (let i = 0; i < a.length; i++) {
      const p = a[i];
      ctx.save();
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 12;
      ctx.fillStyle = p.color;
      if (p.style === 'grenade') {
        ctx.translate(p.x, p.y);
        ctx.rotate(p.spin);
        ctx.fillRect(-5, -3, 10, 6);
        ctx.fillStyle = '#ff5d3c';
        ctx.fillRect(-2, -6, 4, 3);
      } else if (p.style === 'missile') {
        // homing rocket: oriented body + exhaust
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.atan2(p.vy, p.vx));
        ctx.fillStyle = '#ffd34d';
        ctx.fillRect(-6, -3, 11, 6);
        ctx.fillStyle = '#ff5d3c';
        ctx.beginPath(); ctx.moveTo(5, -3); ctx.lineTo(10, 0); ctx.lineTo(5, 3); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#9fefff';
        ctx.fillRect(-9, -2, 4, 4);
      } else if (p.friendly) {
        // bright bolt with trail
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.radius + 3, p.radius, Math.atan2(p.vy, p.vx), 0, Math.PI * 2);
        ctx.fill();
      } else {
        // enemy orb
        ctx.fillStyle = '#ff5d6d';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.shadowBlur = 0;
  };

  KC.Projectiles = Projectiles;
})(window.KC = window.KC || {});
