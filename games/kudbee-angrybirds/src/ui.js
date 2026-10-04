/* =====================================================================
 * Kudbee Birds — ui.js
 * Cartoon HUD + screens (menu, level select, pause, win, fail). Chunky
 * outlined lettering, glossy buttons, ribbons and panels. Buttons are
 * registered while drawing so pointer hit-testing and keyboard focus use the
 * exact geometry the player sees.
 * ===================================================================== */

KAB.UI = {
  FONT: '"Lilita One","Arial Black","Trebuchet MS",system-ui,sans-serif',
  OUT: '#3a2216',
  buttons: [],
  PER_PAGE: 8,
  WORLDS: ['MEADOW', 'FROSTPEAK', 'NIGHTMARE'],

  COL: {
    green:  ['#a9ec62', '#53bd3c', '#2f8a2a'],
    blue:   ['#7ac7ff', '#2f86d8', '#1f5fa8'],
    red:    ['#ff9a8a', '#e8483a', '#a82a20'],
    yellow: ['#ffe888', '#ffb82e', '#c9800e'],
    grey:   ['#c9cfd6', '#9aa3ad', '#6e7782'],
  },

  begin() { this.buttons.length = 0; },

  fmt(n) { return Math.round(n).toLocaleString('en-US'); },

  rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  },

  // Chunky outlined text.
  text(ctx, s, x, y, size, color, align) {
    ctx.save();
    ctx.font = '400 ' + size + 'px ' + this.FONT;
    ctx.textAlign = align || 'left'; ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, size * 0.24); ctx.strokeStyle = this.OUT;
    ctx.strokeText(s, x, y);
    ctx.fillStyle = color; ctx.fillText(s, x, y);
    ctx.restore();
  },

  // Big gradient lettering with a thick outline (logo style).
  bubble(ctx, s, x, y, size, c1, c2, tilt) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(tilt || 0);
    ctx.font = '400 ' + size + 'px ' + this.FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.34; ctx.strokeStyle = this.OUT; ctx.strokeText(s, 0, size * 0.06);
    ctx.lineWidth = size * 0.2; ctx.strokeStyle = '#ffffff'; ctx.strokeText(s, 0, 0);
    ctx.lineWidth = size * 0.1; ctx.strokeStyle = this.OUT; ctx.strokeText(s, 0, 0);
    const g = ctx.createLinearGradient(0, -size * 0.8, 0, size * 0.1);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    ctx.fillStyle = g; ctx.fillText(s, 0, 0);
    ctx.restore();
  },

  star(ctx, cx, cy, r, filled, glow, scale) {
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(scale || 1, scale || 1);
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r * 0.5 : r;
      ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    ctx.closePath(); ctx.lineJoin = 'round';
    if (filled) {
      const g = ctx.createLinearGradient(0, -r, 0, r);
      g.addColorStop(0, '#fff09a'); g.addColorStop(1, '#ffb11f');
      ctx.fillStyle = g; ctx.fill();
      ctx.lineWidth = Math.max(2.5, r * 0.17); ctx.strokeStyle = this.OUT; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath(); ctx.ellipse(-r * 0.25, -r * 0.35, r * 0.2, r * 0.1, -0.6, 0, 6.283); ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(30,30,50,0.35)'; ctx.fill();
      ctx.lineWidth = Math.max(2, r * 0.13); ctx.strokeStyle = 'rgba(30,20,10,0.6)'; ctx.stroke();
    }
    ctx.restore();
  },

  // Glossy outlined button. opts: { color, small, disabled, primary }
  button(ctx, g, id, x, y, w, h, label, opts) {
    opts = opts || {};
    const idx = this.buttons.length;
    this.buttons.push({ id, x, y, w, h, disabled: !!opts.disabled, primary: !!opts.primary });
    const focused = g.focusIdx === idx && !opts.disabled;
    const cs = this.COL[opts.disabled ? 'grey' : (opts.color || (opts.primary ? 'green' : 'blue'))];
    ctx.save();
    ctx.translate(0, focused ? -1.5 : 0);
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; this.rr(ctx, x, y + 5, w, h, 16); ctx.fill();
    this.rr(ctx, x - 3, y - 3, w + 6, h + 6, 18); ctx.fillStyle = this.OUT; ctx.fill();
    if (focused) { this.rr(ctx, x - 3, y - 3, w + 6, h + 6, 18); ctx.lineWidth = 4; ctx.strokeStyle = '#fff6a8'; ctx.stroke(); }
    const gr = ctx.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, cs[0]); gr.addColorStop(0.5, cs[1]); gr.addColorStop(1, cs[2]);
    this.rr(ctx, x, y, w, h, 15); ctx.fillStyle = gr; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.32)';
    this.rr(ctx, x + 5, y + 4, w - 10, h * 0.38, 10); ctx.fill();
    if (label) {
      const size = opts.small ? 21 : 30;
      ctx.font = '400 ' + size + 'px ' + this.FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      ctx.lineWidth = size * 0.22; ctx.strokeStyle = opts.disabled ? '#555' : this.OUT;
      ctx.strokeText(label, x + w / 2, y + h / 2 + 2);
      ctx.fillStyle = opts.disabled ? '#d8dde3' : '#ffffff'; ctx.fillText(label, x + w / 2, y + h / 2 + 2);
    }
    ctx.restore();
  },

  hit(x, y) {
    for (let i = this.buttons.length - 1; i >= 0; i--) {
      const b = this.buttons[i];
      if (!b.disabled && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return i;
    }
    return -1;
  },

  backdrop(ctx, a) { ctx.fillStyle = 'rgba(8,16,40,' + a + ')'; ctx.fillRect(0, 0, KAB.Render.W, KAB.Render.H); },

  panel(ctx, x, y, w, h, color) {
    const cs = this.COL[color || 'blue'];
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; this.rr(ctx, x, y + 8, w, h, 24); ctx.fill();
    this.rr(ctx, x - 4, y - 4, w + 8, h + 8, 28); ctx.fillStyle = this.OUT; ctx.fill();
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, cs[0]); g.addColorStop(0.18, cs[1]); g.addColorStop(1, cs[2]);
    this.rr(ctx, x, y, w, h, 24); ctx.fillStyle = g; ctx.fill();
    this.rr(ctx, x + 8, y + 8, w - 16, h - 16, 18); ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.75)'; this.rr(ctx, x + 2, y + 2, w - 4, h - 4, 22); ctx.stroke();
    ctx.restore();
  },

  ribbon(ctx, cx, y, w, text, color) {
    const cs = this.COL[color || 'red'], h = 58;
    ctx.save();
    ctx.lineJoin = 'round';
    for (const sx of [-1, 1]) {                                   // folded tails
      const tx = cx + sx * (w / 2 - 6);
      ctx.beginPath(); ctx.moveTo(tx, y + 12); ctx.lineTo(tx + sx * 52, y + 12); ctx.lineTo(tx + sx * 34, y + h / 2 + 12); ctx.lineTo(tx + sx * 52, y + h + 12); ctx.lineTo(tx, y + h + 12); ctx.closePath();
      ctx.fillStyle = cs[2]; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = this.OUT; ctx.stroke();
    }
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, cs[0]); g.addColorStop(0.5, cs[1]); g.addColorStop(1, cs[2]);
    this.rr(ctx, cx - w / 2, y, w, h, 10); ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = this.OUT; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.28)'; this.rr(ctx, cx - w / 2 + 6, y + 5, w - 12, h * 0.34, 7); ctx.fill();
    ctx.restore();
    this.text(ctx, text, cx, y + h / 2 + 13, 38, '#ffffff', 'center');
  },

  icon(ctx, kind, cx, cy, color) {
    ctx.save();
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 3.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (kind === 'pause') { ctx.fillRect(cx - 7, cy - 8, 5, 16); ctx.fillRect(cx + 2, cy - 8, 5, 16); }
    else if (kind === 'retry') { ctx.beginPath(); ctx.arc(cx, cy, 8, 0.6, 5.6); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx + 8, cy - 9); ctx.lineTo(cx + 8, cy - 1); ctx.lineTo(cx, cy - 2); ctx.stroke(); }
    else if (kind === 'sound' || kind === 'mute') {
      ctx.beginPath(); ctx.moveTo(cx - 9, cy - 4); ctx.lineTo(cx - 4, cy - 4); ctx.lineTo(cx + 2, cy - 9); ctx.lineTo(cx + 2, cy + 9); ctx.lineTo(cx - 4, cy + 4); ctx.lineTo(cx - 9, cy + 4); ctx.closePath(); ctx.fill();
      if (kind === 'sound') { ctx.beginPath(); ctx.arc(cx + 2, cy, 7, -0.9, 0.9); ctx.stroke(); ctx.beginPath(); ctx.arc(cx + 2, cy, 12, -0.9, 0.9); ctx.stroke(); }
      else { ctx.beginPath(); ctx.moveTo(cx + 6, cy - 6); ctx.lineTo(cx + 13, cy + 6); ctx.moveTo(cx + 13, cy - 6); ctx.lineTo(cx + 6, cy + 6); ctx.stroke(); }
    } else if (kind === 'lock') {
      ctx.fillRect(cx - 11, cy - 2, 22, 16); ctx.beginPath(); ctx.arc(cx, cy - 3, 7, Math.PI, 0); ctx.stroke();
    } else if (kind === 'left' || kind === 'right') {
      const d = kind === 'left' ? -1 : 1;
      ctx.beginPath(); ctx.moveTo(cx - d * 5, cy - 9); ctx.lineTo(cx + d * 6, cy); ctx.lineTo(cx - d * 5, cy + 9); ctx.stroke();
    }
    ctx.restore();
  },

  roundIcon(ctx, g, id, cx, cy, kind) {
    const r = 21;
    const idx = this.buttons.length;
    this.buttons.push({ id, x: cx - r, y: cy - r, w: r * 2, h: r * 2, disabled: false, primary: false, hud: true });
    const focused = g.focusIdx === idx;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(cx, cy + 3, r + 2, 0, 6.283); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, r + 2.5, 0, 6.283); ctx.fillStyle = this.OUT; ctx.fill();
    if (focused) { ctx.beginPath(); ctx.arc(cx, cy, r + 2.5, 0, 6.283); ctx.lineWidth = 3.5; ctx.strokeStyle = '#fff6a8'; ctx.stroke(); }
    const gr = ctx.createLinearGradient(0, cy - r, 0, cy + r); gr.addColorStop(0, '#8fd2ff'); gr.addColorStop(0.5, '#2f86d8'); gr.addColorStop(1, '#1f5fa8');
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.283); ctx.fillStyle = gr; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.ellipse(cx, cy - r * 0.45, r * 0.65, r * 0.32, 0, 0, 6.283); ctx.fill();
    ctx.restore();
    this.icon(ctx, kind, cx, cy, '#ffffff');
  },

  // ---- HUD ----------------------------------------------------------------
  hud(ctx, g) {
    const w = g.world, U = this;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; U.rr(ctx, 14, 15, 230, 68, 16); ctx.fill();
    U.rr(ctx, 12, 10, 230, 68, 16); ctx.fillStyle = U.OUT; ctx.fill();
    const pg = ctx.createLinearGradient(0, 12, 0, 76); pg.addColorStop(0, '#3f78b8'); pg.addColorStop(1, '#244a80');
    U.rr(ctx, 15, 13, 224, 62, 13); ctx.fillStyle = pg; ctx.fill();
    ctx.restore();
    U.text(ctx, 'LEVEL ' + (w.index + 1) + '  ' + w.level.name.toUpperCase(), 26, 33, 15, '#cfe6ff', 'left');
    U.text(ctx, U.fmt(g.shownScore), 26, 66, 33, '#ffe14d', 'left');
    const best = KAB.Store.best(w.index);
    if (best.score) U.text(ctx, 'BEST ' + U.fmt(best.score), 232, 66, 13, '#cfe6ff', 'right');

    const total = w.totalEnemies, alive = w.enemiesAlive();
    const x0 = 480 - (total * 28) / 2 + 14;
    for (let i = 0; i < total; i++) {
      const cx = x0 + i * 28, cy = 36;
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, 11.5, 0, 6.283); ctx.fillStyle = U.OUT; ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy, 9, 0, 6.283);
      if (i < alive) {
        ctx.fillStyle = '#82d44a'; ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx - 3, cy - 1.5, 2.6, 0, 6.283); ctx.arc(cx + 3, cy - 1.5, 2.6, 0, 6.283); ctx.fill();
        ctx.fillStyle = '#12101c'; ctx.beginPath(); ctx.arc(cx - 2.6, cy - 1.2, 1.2, 0, 6.283); ctx.arc(cx + 2.6, cy - 1.2, 1.2, 0, 6.283); ctx.fill();
      } else { ctx.fillStyle = 'rgba(20,30,50,0.55)'; ctx.fill(); }
      ctx.restore();
    }

    U.roundIcon(ctx, g, 'pause', 926, 36, 'pause');
    U.roundIcon(ctx, g, 'mute', 876, 36, g.audio.muted ? 'mute' : 'sound');
    U.roundIcon(ctx, g, 'retry', 826, 36, 'retry');

    if (w.state === 'flying' && w.canUseAbility()) {
      const b = w.birds[0], spec = KAB.BIRDS[b.data.type];
      const pulse = 1 + 0.04 * Math.sin(g.time * 9);
      ctx.save();
      ctx.translate(480, 560); ctx.scale(pulse, pulse);
      U.rr(ctx, -150, -22, 300, 44, 22); ctx.fillStyle = U.OUT; ctx.fill();
      U.rr(ctx, -146, -18, 292, 36, 18); ctx.fillStyle = spec.color; ctx.fill();
      ctx.restore();
      U.text(ctx, (g.coarse ? 'TAP' : 'TAP / SPACE') + ' = ' + spec.name.toUpperCase(), 480, 568, 20, '#ffffff', 'center');
    }

    if (w.state === 'ready' && g.hintT > 0 && w.shots === 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, g.hintT);
      U.text(ctx, w.level.hint, 480, 132, 26, '#ffffff', 'center');
      if (w.index === 0 && !g.coarse) U.text(ctx, 'or use the arrow keys + Space', 480, 160, 16, '#ffe9a8', 'center');
      ctx.restore();
    }
  },

  // ---- screens ------------------------------------------------------------
  menu(ctx, g) {
    const U = this, t = g.time;
    U.backdrop(ctx, 0.28);
    U.bubble(ctx, 'KUDBEE', 480, 118, 46, '#ffffff', '#cfe9ff', -0.03);
    U.bubble(ctx, 'BIRDS', 480, 218, 112, '#fff27a', '#ff9a1f', -0.03 + Math.sin(t * 1.4) * 0.008);
    const types = ['cyan', 'gold', 'green', 'egg'];
    types.forEach((ty, i) => {
      const cx = 240 + i * 160, cy = 336 + Math.sin(t * 2 + i) * 7;
      KAB.Render.drawBird(ctx, cx, cy, 28, ty, Math.sin(t * 1.5 + i) * 0.12, 0, t, { blink: (t * 0.7 + i) % 3 > 2.9 });
      const spec = KAB.BIRDS[ty];
      U.text(ctx, spec.name.toUpperCase(), cx, cy + 56, 19, '#ffffff', 'center');
    });
    let total = 0; const lv = KAB.Store.data.levels; for (const k in lv) total += lv[k].stars;
    U.button(ctx, g, 'play', 360, 428, 240, 66, total ? 'CONTINUE' : 'PLAY', { primary: true });
    U.button(ctx, g, 'levels', 380, 508, 200, 46, 'LEVELS', { small: true });
    U.star(ctx, 452, 575, 11, true, false);
    U.text(ctx, total + ' / ' + (KAB.LEVELS.length * 3), 472, 582, 20, '#ffe14d', 'left');
    U.roundIcon(ctx, g, 'mute', 926, 36, g.audio.muted ? 'mute' : 'sound');
  },

  select(ctx, g) {
    const U = this, n = KAB.LEVELS.length, per = U.PER_PAGE, pages = Math.ceil(n / per);
    g.selPage = Math.max(0, Math.min(pages - 1, g.selPage || 0));
    U.backdrop(ctx, 0.5);
    U.bubble(ctx, 'WORLD ' + (g.selPage + 1), 480, 78, 52, '#ffffff', '#cfe9ff', 0);
    U.text(ctx, U.WORLDS[g.selPage] || '', 480, 112, 24, '#ffe14d', 'center');
    const cols = 4, tw = 186, tH = 128, gap = 20;
    const x0 = (960 - (cols * tw + (cols - 1) * gap)) / 2, y0 = 142;
    for (let k = 0; k < per; k++) {
      const i = g.selPage * per + k;
      if (i >= n) break;
      const x = x0 + (k % cols) * (tw + gap), y = y0 + Math.floor(k / cols) * (tH + gap);
      const open = KAB.Store.unlocked(i), best = KAB.Store.best(i);
      U.button(ctx, g, 'lvl' + i, x, y, tw, tH, '', { color: open ? (best.stars ? 'blue' : 'green') : 'grey', disabled: !open });
      U.text(ctx, String(i + 1), x + tw / 2, y + 62, 56, open ? '#ffffff' : '#c7ccd3', 'center');
      if (open) for (let s = 0; s < 3; s++) U.star(ctx, x + tw / 2 + (s - 1) * 36, y + 100, 13, s < best.stars, false);
      else U.icon(ctx, 'lock', x + tw / 2, y + 96, '#e3e7ec');
    }
    if (pages > 1) {
      U.button(ctx, g, 'pgprev', 380, 482, 64, 52, '', { small: true, disabled: g.selPage === 0 });
      U.icon(ctx, 'left', 412, 508, '#ffffff');
      U.button(ctx, g, 'pgnext', 516, 482, 64, 52, '', { small: true, disabled: g.selPage >= pages - 1 });
      U.icon(ctx, 'right', 548, 508, '#ffffff');
      U.text(ctx, (g.selPage + 1) + ' / ' + pages, 480, 516, 22, '#ffffff', 'center');
    }
    U.button(ctx, g, 'back', 30, 530, 150, 48, 'BACK', { small: true, color: 'yellow' });
  },

  pause(ctx, g) {
    const U = this;
    U.backdrop(ctx, 0.55);
    U.panel(ctx, 290, 120, 380, 372, 'blue');
    U.ribbon(ctx, 480, 96, 300, 'PAUSED', 'yellow');
    U.button(ctx, g, 'resume', 340, 200, 280, 62, 'RESUME', { primary: true });
    U.button(ctx, g, 'restart', 340, 280, 280, 50, 'RESTART', { small: true });
    U.button(ctx, g, 'levels', 340, 346, 280, 50, 'LEVELS', { small: true });
    U.button(ctx, g, 'mute', 340, 412, 280, 50, g.audio.muted ? 'SOUND: OFF' : 'SOUND: ON', { small: true, color: 'yellow' });
  },

  won(ctx, g) {
    const U = this, w = g.world, T = g.overlayT;
    U.backdrop(ctx, Math.min(0.55, T * 1.4));
    const k = KAB.Util.easeOut(Math.min(1, T * 2.2));
    ctx.save();
    ctx.translate(480, 300); ctx.scale(0.86 + 0.14 * k, 0.86 + 0.14 * k); ctx.translate(-480, -300);
    ctx.globalAlpha = k;
    U.panel(ctx, 260, 96, 440, 440, 'blue');
    U.ribbon(ctx, 480, 58, 340, w.index === KAB.LEVELS.length - 1 ? 'ALL CLEARED!' : 'LEVEL CLEARED!', 'red');
    for (let i = 0; i < 3; i++) {
      const appear = 0.5 + i * 0.42;
      const on = i < w.stars && T > appear;
      const s = on ? 1 + Math.max(0, 0.7 - (T - appear) * 2.2) : 1;
      U.star(ctx, 480 + (i - 1) * 84, 196 - (i === 1 ? 16 : 0), i === 1 ? 44 : 36, on, on, s);
    }
    const target = w.score, shown = Math.min(target, target * KAB.Util.easeOut(Math.min(1, Math.max(0, (T - 0.3) / 1.1))));
    U.text(ctx, 'SCORE', 480, 282, 17, '#cfe6ff', 'center');
    U.text(ctx, U.fmt(shown), 480, 330, 50, '#ffe14d', 'center');
    if (w.winBonus) U.text(ctx, w.queue.length + ' bird' + (w.queue.length === 1 ? '' : 's') + ' left  +' + U.fmt(w.winBonus), 480, 360, 19, '#ffffff', 'center');
    if (g.newBest && T > 1.2) U.text(ctx, 'NEW HIGH SCORE!', 480, 392, 22, '#ff9a8a', 'center');
    else U.text(ctx, 'BEST ' + U.fmt(KAB.Store.best(w.index).score), 480, 392, 17, '#cfe6ff', 'center');

    const last = w.index >= KAB.LEVELS.length - 1;
    if (!last) U.button(ctx, g, 'next', 320, 410, 320, 56, 'NEXT LEVEL', { primary: true });
    U.button(ctx, g, 'restart', 320, last ? 410 : 476, 152, 40, 'REPLAY', { small: true });
    U.button(ctx, g, 'levels', 488, last ? 410 : 476, 152, 40, 'LEVELS', { small: true, color: 'yellow' });
    ctx.restore();
  },

  lost(ctx, g) {
    const U = this, T = g.overlayT, left = g.world.enemiesAlive();
    U.backdrop(ctx, Math.min(0.55, T * 1.4));
    const k = KAB.Util.easeOut(Math.min(1, T * 2.2));
    ctx.save();
    ctx.globalAlpha = k;
    U.panel(ctx, 280, 130, 400, 330, 'blue');
    U.ribbon(ctx, 480, 94, 340, 'LEVEL FAILED', 'red');
    U.text(ctx, left + ' grub' + (left === 1 ? '' : 's') + ' left laughing', 480, 232, 22, '#ffffff', 'center');
    U.text(ctx, 'SCORE ' + U.fmt(g.world.score), 480, 270, 26, '#ffe14d', 'center');
    U.button(ctx, g, 'restart', 330, 296, 300, 62, 'TRY AGAIN', { primary: true });
    U.button(ctx, g, 'levels', 330, 376, 300, 50, 'LEVELS', { small: true, color: 'yellow' });
    ctx.restore();
  },
};
