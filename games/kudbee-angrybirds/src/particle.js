/* =====================================================================
 * Kudbee Birds — particle.js
 * Cosmetic effects only (never touches physics): glow sparks, spinning
 * shards, shockwave rings, smoke puffs and floating score popups. Time-based
 * so it behaves the same at 30/60/120 Hz and under slow-mo.
 * ===================================================================== */

KAB.Particles = class {
  constructor() {
    this.list = [];
    this.MAX = 520;
  }

  _push(p) {
    if (this.list.length >= this.MAX) this.list.shift();
    this.list.push(p);
  }

  spark(x, y, color, count, speed, life) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.65);
      this._push({ t: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 380, color, life: life || 0.6, max: life || 0.6, size: 2 + Math.random() * 2.2 });
    }
  }

  shards(x, y, color, count, spread) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 90 + Math.random() * 260;
      this._push({
        t: 'shard', x: x + (Math.random() - 0.5) * (spread || 10), y: y + (Math.random() - 0.5) * (spread || 10),
        vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120, g: 900, color,
        rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 16,
        life: 0.9 + Math.random() * 0.6, max: 1.4, size: 3 + Math.random() * 5,
      });
    }
  }

  ring(x, y, color, radius, life, width) {
    this._push({ t: 'ring', x, y, color, r: 4, rMax: radius || 60, life: life || 0.4, max: life || 0.4, width: width || 3 });
  }

  smoke(x, y, count, color) {
    for (let i = 0; i < count; i++) {
      this._push({
        t: 'smoke', x: x + (Math.random() - 0.5) * 16, y: y + (Math.random() - 0.5) * 16,
        vx: (Math.random() - 0.5) * 50, vy: -20 - Math.random() * 60, g: -20, color: color || '#8aa0c8',
        life: 0.8 + Math.random() * 0.6, max: 1.4, size: 8 + Math.random() * 10,
      });
    }
  }

  puff(x, y, count, size) {
    for (let i = 0; i < count; i++) {
      this._push({ t: 'puff', x: x + (Math.random() - 0.5) * 18, y: y + (Math.random() - 0.5) * 18, vx: (Math.random() - 0.5) * 90, vy: -10 - Math.random() * 60, g: 0,
        life: 0.55 + Math.random() * 0.4, max: 0.95, size: (size || 14) * (0.6 + Math.random() * 0.7) });
    }
  }

  stars(x, y, count) {
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, sp = 140 + Math.random() * 200;
      this._push({ t: 'star', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 520, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12,
        life: 0.9 + Math.random() * 0.4, max: 1.3, size: 6 + Math.random() * 4 });
    }
  }

  feathers(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * 6.283, sp = 60 + Math.random() * 140;
      this._push({ t: 'feather', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, g: 120, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 9,
        color, life: 0.8 + Math.random() * 0.5, max: 1.3, size: 5 + Math.random() * 3 });
    }
  }

  chips(x, y, color, count, spread) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * 6.283, sp = 90 + Math.random() * 250;
      this._push({ t: 'chip', x: x + (Math.random() - 0.5) * (spread || 10), y: y + (Math.random() - 0.5) * (spread || 10),
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 140, g: 950, color, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 18,
        life: 0.9 + Math.random() * 0.6, max: 1.5, size: 4 + Math.random() * 6 });
    }
  }

  trail(x, y, color) {
    this._push({ t: 'spark', x, y, vx: 0, vy: 0, g: 0, color, life: 0.35, max: 0.35, size: 3.2 });
  }

  popup(x, y, text, color, size) {
    this._push({ t: 'popup', x, y, vx: 0, vy: -46, g: 0, text, color: color || '#ffffff', life: 1.1, max: 1.1, size: size || 18 });
  }

  clear() { this.list.length = 0; }

  update(dt) {
    for (const p of this.list) {
      p.life -= dt;
      if (p.t === 'ring') { p.r = p.rMax * (1 - Math.pow(p.life / p.max, 2)); continue; }
      p.vy += p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.t === 'shard') p.rot += p.vr * dt;
      if (p.t === 'smoke') { p.vx *= 0.97; p.size += dt * 14; }
      if (p.t === 'popup') p.vy *= 0.96;
    }
    this.list = this.list.filter(p => p.life > 0);
  }

  draw(ctx) {
    for (const p of this.list) {
      const a = Math.max(0, Math.min(1, p.life / p.max));
      if (p.t === 'spark') {
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.4 + a * 0.6), 0, 6.283); ctx.fill();
      } else if (p.t === 'shard') {
        ctx.save();
        ctx.globalAlpha = Math.min(1, a * 1.6);
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      } else if (p.t === 'ring') {
        ctx.globalAlpha = a * 0.9;
        ctx.strokeStyle = p.color; ctx.lineWidth = p.width * a + 0.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.stroke();
      } else if (p.t === 'puff') {
        ctx.globalAlpha = a * 0.95;
        ctx.fillStyle = '#ffffff'; ctx.strokeStyle = 'rgba(70,90,120,0.55)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.6 - a * 0.6), 0, 6.283); ctx.fill(); ctx.stroke();
      } else if (p.t === 'star') {
        ctx.save(); ctx.globalAlpha = Math.min(1, a * 1.6); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.beginPath();
        for (let k = 0; k < 10; k++) { const ang = -Math.PI / 2 + k * Math.PI / 5, rad = k % 2 ? p.size * 0.45 : p.size; ctx.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad); }
        ctx.closePath(); ctx.fillStyle = '#ffd34d'; ctx.fill(); ctx.strokeStyle = '#3a2216'; ctx.lineWidth = 1.8; ctx.stroke();
        ctx.restore();
      } else if (p.t === 'feather') {
        ctx.save(); ctx.globalAlpha = Math.min(1, a * 1.8); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.color; ctx.strokeStyle = '#3a2216'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(0, 0, p.size, p.size * 0.38, 0, 0, 6.283); ctx.fill(); ctx.stroke();
        ctx.restore();
      } else if (p.t === 'chip') {
        ctx.save(); ctx.globalAlpha = Math.min(1, a * 1.8); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.color; ctx.strokeStyle = '#3a2216'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(-p.size, -p.size * 0.4); ctx.lineTo(p.size * 0.9, -p.size * 0.6); ctx.lineTo(p.size * 0.6, p.size * 0.5); ctx.lineTo(-p.size * 0.7, p.size * 0.6); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
      } else if (p.t === 'smoke') {
        ctx.globalAlpha = a * 0.28;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.283); ctx.fill();
      } else if (p.t === 'popup') {
        ctx.globalAlpha = Math.min(1, a * 2);
        ctx.font = '400 ' + (p.size + 4) + 'px "Lilita One","Arial Black",system-ui,sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.strokeStyle = '#3a2216';
        ctx.strokeText(p.text, p.x, p.y);
        ctx.fillStyle = p.color; ctx.fillText(p.text, p.x, p.y);
      }
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }
};
