/* =====================================================================
 * Kudbee Darts — engine/particles.js
 * Pooled particle system: dart-impact splinters, score-pop text, sparks,
 * and a confetti burst for leg/match wins. Drawn in world space. Pooling
 * keeps allocations near zero. Ported from Contra with confetti() added.
 * ===================================================================== */
(function (KD) {
  'use strict';
  const Util = KD.Util;

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
        p.font = cfg.font || null;
        p.drag = cfg.drag || 0;
        p.spin = cfg.spin || 0;
        p.rot = cfg.rot || 0;
        p.rect = cfg.rect || false;
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

  /* Dart hitting the board: a tight cone of splinters + a glow flash. */
  Particles.prototype.impact = function (x, y, color) {
    this.burst(x, y, color || '#cfe9ff', 10, 220, { glow: true, life: 0.35, size: 2, drag: 3 });
    this.burst(x, y, '#ffffff', 5, 120, { glow: true, life: 0.2, size: 1.5 });
    this.emit({ x: x, y: y, vx: 0, vy: 0, life: 0.16, size: 22, color: color || '#39e6ff', glow: true });
  };

  Particles.prototype.spark = function (x, y, color) {
    this.burst(x, y, color || '#9fefff', 8, 200, { glow: true, life: 0.3, size: 2 });
  };

  /* Celebratory confetti rain from a point, in studio palette colours. */
  Particles.prototype.confetti = function (x, y, colors) {
    colors = colors || ['#39e6ff', '#c46bff', '#7CFFb2', '#ffd34d', '#ff5d3c'];
    for (let i = 0; i < 90; i++) {
      const a = -Math.PI / 2 + Util.rand(-1.1, 1.1);
      const s = Util.rand(180, 460);
      this.emit({
        x: x + Util.rand(-30, 30), y: y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: Util.rand(1.1, 2.0),
        size: Util.rand(3, 6),
        color: Util.pick(colors),
        gravity: 520, drag: 0.6, shrink: false,
        rect: true, rot: Util.rand(0, 6.28), spin: Util.rand(-10, 10),
      });
    }
  };

  /* Floating score popup, e.g. "+60" / "T20". */
  Particles.prototype.scorePop = function (x, y, text, big, color) {
    this.emit({
      x: x, y: y, vx: Util.rand(-12, 12), vy: -70,
      life: 1.0, size: big ? 26 : 18,
      color: color || (big ? '#ffd34d' : '#ffffff'),
      gravity: 90, shrink: false, text: String(text),
      font: 'bold {S}px "Space Grotesk", monospace',
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
      if (p.spin) p.rot += p.spin * dt;
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
        ctx.globalAlpha = Math.max(0, Math.min(1, k * 1.3));
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color; ctx.shadowBlur = 12;
        ctx.font = (p.font || 'bold {S}px monospace').replace('{S}', p.size);
        ctx.textAlign = 'center';
        ctx.fillText(p.text, p.x, p.y);
        ctx.shadowBlur = 0;
        continue;
      }
      if (p.glow) { ctx.shadowColor = p.color; ctx.shadowBlur = 12; }
      ctx.fillStyle = p.color;
      if (p.rect) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      } else {
        const s = p.shrink ? p.size * (0.3 + k * 0.7) : p.size;
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

  KD.Particles = Particles;
})(window.KD = window.KD || {});
