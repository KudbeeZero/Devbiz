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
        // 'circle' (default) or 'rect' — rects read as chunky physical debris
        // (armor plating, shrapnel) so a death can look like solid matter
        // breaking apart rather than just another glowing dot.
        p.shape = cfg.shape || 'circle';
        p.rot = cfg.rot || 0;
        p.rotSpeed = cfg.rotSpeed || 0;
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

  // `weapon` (optional, from entities/weapons.js) tints the flash and spark
  // color to match the gun firing it and fattens the core for heavy shots
  // (plasma) — so each weapon's muzzle reads distinctly instead of every
  // shot flashing the same generic cyan. Omit `weapon` for a neutral flash
  // (e.g. the K9 companion's missile launch, which isn't a "gun").
  Particles.prototype.muzzle = function (x, y, dir, weapon) {
    const color = weapon ? weapon.color : '#9fefff';
    const heavy = !!(weapon && weapon.style === 'plasma');
    // Bright glow core at the muzzle — reads as a flash, one particle per shot.
    this.emit({ x: x + dir * 5, y: y, vx: dir * 60, vy: 0, life: heavy ? 0.1 : 0.07, size: heavy ? 16 : 10, color: '#e6fbff', glow: true, gravity: 0, drag: 6 });
    const n = weapon && weapon.pellets > 1 ? 9 : 6;
    for (let i = 0; i < n; i++) {
      this.emit({
        x: x, y: y,
        vx: dir * Util.rand(120, 360) + Util.rand(-40, 40),
        vy: Util.rand(-60, 60),
        life: 0.12, size: Util.rand(2, 4), color: color, glow: true, drag: 4,
      });
    }
    // Ejected shell casing — only for ballistic ('bolt'-style) weapons, since
    // a beam/plasma cannon has nothing to eject.
    if (!weapon || weapon.style === 'bolt') {
      this.emit({
        x: x, y: y, vx: -dir * Util.rand(60, 120), vy: -Util.rand(60, 140),
        life: 0.5, size: 3, color: '#e8c56b', shape: 'rect', rotSpeed: Util.rand(-14, 14),
        gravity: 700, drag: 0.4, shrink: false,
      });
    }
  };

  // `intensity` (default 1) scales a hit spark to the weight of the blow —
  // a pistol tick and a plasma/grenade hit shouldn't throw the same handful
  // of sparks.
  Particles.prototype.spark = function (x, y, color, intensity) {
    const k = Util.clamp(intensity || 1, 0.6, 2.4);
    this.burst(x, y, color || '#9fefff', Math.round(8 * k), 200 * k, { glow: true, life: 0.3, size: 2 * k });
  };

  // Chunky physical debris (armor plates, metal shrapnel) that tumbles under
  // gravity — used for enemy-death variety so grounded/armored enemies feel
  // like they broke apart rather than just puffed into smoke.
  Particles.prototype.debris = function (x, y, color, count, opts) {
    opts = opts || {};
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (opts.speed || 220) * (0.4 + Math.random() * 0.8);
      this.emit({
        x: x, y: y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s - (opts.pop || 90),
        life: opts.life || (0.6 + Math.random() * 0.5),
        size: opts.size || (5 + Math.random() * 5),
        color: color,
        gravity: opts.gravity != null ? opts.gravity : 900,
        shape: 'rect',
        rot: Math.random() * Math.PI * 2,
        rotSpeed: Util.rand(-10, 10),
        drag: opts.drag != null ? opts.drag : 0.6,
        glow: opts.glow || false,
      });
    }
  };

  // Electric short-circuit burst — a lighter, non-explosive kill FX (the
  // drone) so not every enemy dies with the same fireball: fast bright
  // sparks + a thin rising smoke wisp instead of a boom.
  Particles.prototype.zap = function (x, y, color) {
    this.burst(x, y, '#ffffff', 10, 320, { glow: true, life: 0.2, size: 2.5, drag: 3 });
    this.burst(x, y, color || '#c46bff', 14, 260, { glow: true, life: 0.3, size: 2, drag: 1 });
    this.burst(x, y, '#7a7a86', 6, 90, { life: 0.55, size: 6, gravity: -40, drag: 1.2 });
    this.emit({ x: x, y: y, vx: 0, vy: 0, life: 0.12, size: 26, color: '#f4e8ff', glow: true, gravity: 0, drag: 0 });
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
      if (p.rotSpeed) p.rot += p.rotSpeed * dt;
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
      if (p.shape === 'rect') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-s / 2, -s * 0.33, s, s * 0.66);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  };

  Particles.prototype.clear = function () { this.pool.clear(); };

  KC.Particles = Particles;
})(window.KC = window.KC || {});
