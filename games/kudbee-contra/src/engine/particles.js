/* =====================================================================
 * Kudbee Contra — engine/particles.js
 * Pooled particle system for muzzle flashes, explosions, debris, sparks,
 * and floating damage numbers. Drawn in world space (under the camera
 * transform). Pooling keeps allocations near zero during heavy combat.
 * ===================================================================== */
(function (KC) {
  'use strict';
  const Util = KC.Util;

  function Particles() {
    this.pool = new Util.ObjectPool(
      function () { return {}; },
      function (p, cfg) {
        p.x = cfg.x; p.y = cfg.y;
        p.vx = cfg.vx; p.vy = cfg.vy;
        p.life = cfg.life; p.maxLife = cfg.life;
        p.size = cfg.size;
        p.color = cfg.color;
        p.gravity = cfg.gravity || 0;
        p.shrink = cfg.shrink !== false;
        p.glow = cfg.glow || false;
        p.text = cfg.text || null;
        p.drag = cfg.drag || 0;
      }
    );
  }

  Particles.prototype.emit = function (cfg) { return this.pool.spawn(cfg); };

  Particles.prototype.burst = function (x, y, color, count, speed, opts) {
    opts = opts || {};
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.emit({
        x: x, y: y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: opts.life || (0.4 + Math.random() * 0.4),
        size: opts.size || (2 + Math.random() * 3),
        color: color,
        gravity: opts.gravity || 0,
        glow: opts.glow || false,
        drag: opts.drag || 0,
      });
    }
  };

  Particles.prototype.explosion = function (x, y, big) {
    const n = big ? 38 : 20;
    this.burst(x, y, '#ffcf6b', n, big ? 360 : 240, { glow: true, life: 0.6, size: big ? 5 : 3 });
    this.burst(x, y, '#ff7a3c', n, big ? 300 : 200, { glow: true, life: 0.5 });
    this.burst(x, y, '#5b5b66', big ? 16 : 8, 160, { gravity: 600, life: 0.9, drag: 1.5 });
    // bright flash core
    this.emit({ x: x, y: y, vx: 0, vy: 0, life: 0.18, size: big ? 60 : 36, color: '#fff6d8', glow: true });
  };

  Particles.prototype.muzzle = function (x, y, dir) {
    for (let i = 0; i < 6; i++) {
      this.emit({
        x: x, y: y,
        vx: dir * Util.rand(120, 360) + Util.rand(-40, 40),
        vy: Util.rand(-60, 60),
        life: 0.12, size: Util.rand(2, 4), color: '#9fefff', glow: true, drag: 4,
      });
    }
  };

  Particles.prototype.spark = function (x, y, color) {
    this.burst(x, y, color || '#9fefff', 8, 200, { glow: true, life: 0.3, size: 2 });
  };

  Particles.prototype.damageNumber = function (x, y, amount, crit) {
    this.emit({
      x: x, y: y, vx: Util.rand(-20, 20), vy: -90,
      life: 0.8, size: crit ? 22 : 16, color: crit ? '#ffd34d' : '#ffffff',
      gravity: 120, shrink: false, text: String(amount),
    });
  };

  Particles.prototype.update = function (dt) {
    const a = this.pool.active;
    for (let i = 0; i < a.length; i++) {
      const p = a[i];
      p.life -= dt;
      if (p.life <= 0) { p.dead = true; continue; }
      if (p.drag) {
        p.vx -= p.vx * Math.min(1, p.drag * dt);
        p.vy -= p.vy * Math.min(1, p.drag * dt);
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.pool.sweep();
  };

  Particles.prototype.draw = function (ctx) {
    const a = this.pool.active;
    for (let i = 0; i < a.length; i++) {
      const p = a[i];
      const k = p.life / p.maxLife;
      ctx.globalAlpha = Math.max(0, Math.min(1, k));
      if (p.text) {
        ctx.globalAlpha = Math.max(0, Math.min(1, k * 1.2));
        ctx.fillStyle = p.color;
        ctx.font = 'bold ' + p.size + 'px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(p.text, p.x, p.y);
        continue;
      }
      if (p.glow) {
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 12;
      }
      ctx.fillStyle = p.color;
      const s = p.shrink ? p.size * (0.3 + k * 0.7) : p.size;
      ctx.beginPath();
      ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  };

  Particles.prototype.clear = function () { this.pool.clear(); };

  KC.Particles = Particles;
})(window.KC = window.KC || {});
