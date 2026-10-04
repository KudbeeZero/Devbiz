/* =====================================================================
 * Kudbee Birds — ui.js
 * Canvas HUD + screens (menu, level select, pause, win, fail). Buttons are
 * registered while drawing so pointer hit-testing and keyboard focus use the
 * exact same geometry the player sees.
 * ===================================================================== */

KAB.UI = {
  FONT: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  MONO: 'ui-monospace, Menlo, Consolas, monospace',
  buttons: [],

  begin() { this.buttons.length = 0; },

  fmt(n) { return Math.round(n).toLocaleString('en-US'); },

  rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  },

  star(ctx, cx, cy, r, filled, glow, scale) {
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(scale || 1, scale || 1);
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r * 0.46 : r;
      ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    ctx.closePath();
    if (filled) {
      ctx.shadowColor = '#ffd34d'; ctx.shadowBlur = glow ? 18 : 0;
      ctx.fillStyle = '#ffd34d'; ctx.fill();
      ctx.shadowBlur = 0; ctx.strokeStyle = '#a86f00'; ctx.lineWidth = 1.5; ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    ctx.restore();
  },

  // opts: { primary, accent, id, small, disabled }
  button(ctx, g, id, x, y, w, h, label, opts) {
    opts = opts || {};
    const idx = this.buttons.length;
    this.buttons.push({ id, x, y, w, h, disabled: !!opts.disabled, primary: !!opts.primary });
    const focused = g.focusIdx === idx && !opts.disabled;
    const accent = opts.accent || '#39e6ff';
    ctx.save();
    ctx.shadowColor = accent; ctx.shadowBlur = focused ? 18 : 0;
    this.rr(ctx, x, y, w, h, 12);
    if (opts.disabled) ctx.fillStyle = 'rgba(255,255,255,0.05)';
    else if (opts.primary) { const gr = ctx.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, KAB.Render.shade(accent, 0.15)); gr.addColorStop(1, KAB.Render.shade(accent, -0.35)); ctx.fillStyle = gr; }
    else ctx.fillStyle = focused ? KAB.Render.alpha(accent, 0.28) : 'rgba(255,255,255,0.07)';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = focused ? 2.5 : 1.5;
    ctx.strokeStyle = opts.disabled ? 'rgba(255,255,255,0.12)' : focused ? '#ffffff' : KAB.Render.alpha(accent, 0.7);
    ctx.stroke();
    ctx.fillStyle = opts.disabled ? 'rgba(255,255,255,0.3)' : opts.primary ? '#06101c' : '#eaf6ff';
    ctx.font = '800 ' + (opts.small ? 14 : 18) + 'px ' + this.FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2 + 1);
    ctx.restore();
  },

  hit(x, y) {
    for (let i = this.buttons.length - 1; i >= 0; i--) {
      const b = this.buttons[i];
      if (!b.disabled && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return i;
    }
    return -1;
  },

  title(ctx, text, x, y, size, color) {
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.font = '900 ' + size + 'px ' + this.FONT;
    ctx.shadowColor = color; ctx.shadowBlur = 24;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.globalAlpha = 0.22;
    ctx.fillText(text, x, y - 2);
    ctx.restore();
  },

  text(ctx, s, x, y, size, color, align, weight, mono) {
    ctx.save();
    ctx.font = (weight || 600) + ' ' + size + 'px ' + (mono ? this.MONO : this.FONT);
    ctx.fillStyle = color; ctx.textAlign = align || 'left'; ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, size * 0.2); ctx.strokeStyle = 'rgba(6,10,28,0.78)';
    ctx.strokeText(s, x, y);                       // dark halo keeps text legible on a bright scene
    ctx.fillText(s, x, y);
    ctx.restore();
  },

  backdrop(ctx, a) { ctx.fillStyle = 'rgba(4,6,16,' + a + ')'; ctx.fillRect(0, 0, KAB.Render.W, KAB.Render.H); },

  panel(ctx, x, y, w, h, accent) {
    ctx.save();
    this.rr(ctx, x, y, w, h, 18);
    ctx.fillStyle = 'rgba(10,16,38,0.92)'; ctx.fill();
    ctx.shadowColor = accent; ctx.shadowBlur = 26;
    ctx.strokeStyle = KAB.Render.alpha(accent, 0.8); ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  },

  icon(ctx, kind, cx, cy, color) {
    ctx.save();
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (kind === 'pause') { ctx.fillRect(cx - 6, cy - 7, 4, 14); ctx.fillRect(cx + 2, cy - 7, 4, 14); }
    else if (kind === 'play') { ctx.beginPath(); ctx.moveTo(cx - 5, cy - 8); ctx.lineTo(cx + 8, cy); ctx.lineTo(cx - 5, cy + 8); ctx.closePath(); ctx.fill(); }
    else if (kind === 'retry') { ctx.beginPath(); ctx.arc(cx, cy, 7, 0.6, 5.6); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx + 7, cy - 8); ctx.lineTo(cx + 7, cy - 1); ctx.lineTo(cx, cy - 2); ctx.stroke(); }
    else if (kind === 'sound' || kind === 'mute') {
      ctx.beginPath(); ctx.moveTo(cx - 8, cy - 3); ctx.lineTo(cx - 4, cy - 3); ctx.lineTo(cx + 1, cy - 8); ctx.lineTo(cx + 1, cy + 8); ctx.lineTo(cx - 4, cy + 3); ctx.lineTo(cx - 8, cy + 3); ctx.closePath(); ctx.fill();
      if (kind === 'sound') { ctx.beginPath(); ctx.arc(cx + 1, cy, 6, -0.9, 0.9); ctx.stroke(); ctx.beginPath(); ctx.arc(cx + 1, cy, 10, -0.9, 0.9); ctx.stroke(); }
      else { ctx.beginPath(); ctx.moveTo(cx + 5, cy - 5); ctx.lineTo(cx + 12, cy + 5); ctx.moveTo(cx + 12, cy - 5); ctx.lineTo(cx + 5, cy + 5); ctx.stroke(); }
    } else if (kind === 'lock') {
      ctx.fillRect(cx - 9, cy - 1, 18, 13);
      ctx.beginPath(); ctx.arc(cx, cy - 2, 6, Math.PI, 0); ctx.stroke();
    }
    ctx.restore();
  },

  roundIcon(ctx, g, id, cx, cy, kind, label) {
    const r = 18;
    const idx = this.buttons.length;
    this.buttons.push({ id, x: cx - r, y: cy - r, w: r * 2, h: r * 2, disabled: false, primary: false, hud: true });
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.283);
    ctx.fillStyle = 'rgba(8,12,30,0.65)'; ctx.fill();
    ctx.strokeStyle = g.focusIdx === idx ? '#ffffff' : 'rgba(57,230,255,0.55)'; ctx.lineWidth = g.focusIdx === idx ? 2.5 : 1.5; ctx.stroke();
    ctx.restore();
    this.icon(ctx, kind, cx, cy, '#cfe9ff');
  },

  // ---- HUD ----------------------------------------------------------------
  hud(ctx, g) {
    const w = g.world, th = w.level.theme;
    const U = this;
    U.text(ctx, 'LEVEL ' + (w.index + 1) + '  ·  ' + w.level.name.toUpperCase(), 22, 28, 13, KAB.Render.alpha(th.accent, 0.95), 'left', 800);
    ctx.save();
    ctx.shadowColor = th.accent; ctx.shadowBlur = 10;
    U.text(ctx, U.fmt(g.shownScore), 22, 62, 32, '#ffffff', 'left', 800, true);
    ctx.restore();
    const best = KAB.Store.best(w.index);
    if (best.score) U.text(ctx, 'BEST ' + U.fmt(best.score), 22, 82, 12, 'rgba(207,233,255,0.6)', 'left', 600, true);

    // drones remaining
    const total = w.totalEnemies, alive = w.enemiesAlive();
    const x0 = 480 - (total * 22) / 2 + 11;
    U.text(ctx, 'HIVE DRONES', 480, 24, 11, 'rgba(207,233,255,0.6)', 'center', 700);
    for (let i = 0; i < total; i++) {
      ctx.save();
      ctx.beginPath(); ctx.arc(x0 + i * 22, 40, 7, 0, 6.283);
      if (i < alive) { ctx.fillStyle = '#ff5d9e'; ctx.shadowColor = '#ff5d9e'; ctx.shadowBlur = 10; ctx.fill(); }
      else { ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1.5; ctx.stroke(); }
      ctx.restore();
    }

    U.roundIcon(ctx, g, 'pause', 926, 32, 'pause');
    U.roundIcon(ctx, g, 'mute', 882, 32, g.audio.muted ? 'mute' : 'sound');
    U.roundIcon(ctx, g, 'retry', 838, 32, 'retry');

    // ability hint
    if (w.state === 'flying' && w.canUseAbility()) {
      const b = w.birds[0];
      const spec = KAB.BIRDS[b.data.type];
      const pulse = 0.75 + 0.25 * Math.sin(g.time * 8);
      ctx.save();
      ctx.globalAlpha = pulse;
      U.rr(ctx, 330, 536, 300, 40, 20);
      ctx.fillStyle = 'rgba(8,12,30,0.8)'; ctx.fill();
      ctx.strokeStyle = spec.color; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
      U.text(ctx, (g.coarse ? 'TAP' : 'TAP / SPACE') + '  ·  ' + spec.name.toUpperCase(), 480, 561, 15, spec.color, 'center', 800);
    }

    // first-shots hint
    if (w.state === 'ready' && g.hintT > 0 && w.shots === 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, g.hintT);
      U.text(ctx, w.level.hint, 480, 126, 20, '#ffffff', 'center', 700);
      if (w.index === 0 && !g.coarse) U.text(ctx, 'or use the arrow keys + Space', 480, 150, 13, 'rgba(207,233,255,0.65)', 'center', 600);
      ctx.restore();
    }
  },

  // ---- screens ------------------------------------------------------------
  menu(ctx, g) {
    const U = this, t = g.time;
    U.backdrop(ctx, 0.45);
    U.title(ctx, 'KUDBEE BIRDS', 480, 150, 72, '#39e6ff');
    U.text(ctx, 'NEON SLINGSHOT DEMOLITION', 480, 186, 16, 'rgba(207,233,255,0.8)', 'center', 700);

    const types = ['cyan', 'gold', 'green'];
    types.forEach((ty, i) => {
      const cx = 300 + i * 180, cy = 330 + Math.sin(t * 2 + i) * 6;
      KAB.Render.drawBird(ctx, cx, cy, 24, ty, Math.sin(t * 1.5 + i) * 0.12, 0, t, { blink: (t * 0.7 + i) % 3 > 2.9 });
      const spec = KAB.BIRDS[ty];
      U.text(ctx, spec.name.toUpperCase(), cx, cy + 52, 14, spec.color, 'center', 800);
      U.text(ctx, spec.tip, cx, cy + 71, 11, 'rgba(207,233,255,0.62)', 'center', 600);
    });

    const stars = KAB.Store.data.levels;
    let total = 0; for (const k in stars) total += stars[k].stars;
    U.button(ctx, g, 'play', 380, 440, 200, 54, total ? 'CONTINUE' : 'PLAY', { primary: true });
    U.button(ctx, g, 'levels', 380, 504, 200, 40, 'LEVEL SELECT', { small: true });
    U.text(ctx, '★ ' + total + ' / ' + (KAB.LEVELS.length * 3), 480, 570, 14, '#ffd34d', 'center', 800, true);
    U.roundIcon(ctx, g, 'mute', 926, 32, g.audio.muted ? 'mute' : 'sound');
  },

  select(ctx, g) {
    const U = this, th = KAB.LEVELS;
    U.backdrop(ctx, 0.62);
    U.title(ctx, 'SELECT LEVEL', 480, 96, 44, '#39e6ff');
    const cols = 4, tw = 190, tH = 118, gap = 20;
    const x0 = (960 - (cols * tw + (cols - 1) * gap)) / 2, y0 = 138;
    for (let i = 0; i < th.length; i++) {
      const x = x0 + (i % cols) * (tw + gap), y = y0 + Math.floor(i / cols) * (tH + gap);
      const open = KAB.Store.unlocked(i);
      const best = KAB.Store.best(i);
      const accent = th[i].theme.accent;
      U.button(ctx, g, 'lvl' + i, x, y, tw, tH, '', { accent, disabled: !open });
      ctx.save();
      U.text(ctx, String(i + 1), x + 18, y + 44, 34, open ? accent : 'rgba(255,255,255,0.25)', 'left', 900, true);
      U.text(ctx, th[i].name.toUpperCase(), x + 18, y + 68, 12, open ? '#eaf6ff' : 'rgba(255,255,255,0.3)', 'left', 800);
      if (open) {
        for (let s = 0; s < 3; s++) U.star(ctx, x + 30 + s * 28, y + 92, 10, s < best.stars, false);
        if (best.score) U.text(ctx, U.fmt(best.score), x + tw - 12, y + 98, 11, 'rgba(207,233,255,0.6)', 'right', 600, true);
      } else U.icon(ctx, 'lock', x + tw - 30, y + 36, 'rgba(255,255,255,0.35)');
      ctx.restore();
    }
    U.button(ctx, g, 'back', 40, 530, 150, 44, 'BACK', { small: true });
  },

  pause(ctx, g) {
    const U = this;
    U.backdrop(ctx, 0.6);
    U.panel(ctx, 300, 130, 360, 350, '#39e6ff');
    U.title(ctx, 'PAUSED', 480, 190, 42, '#39e6ff');
    U.button(ctx, g, 'resume', 340, 220, 280, 50, 'RESUME', { primary: true });
    U.button(ctx, g, 'restart', 340, 282, 280, 44, 'RESTART LEVEL', { small: true });
    U.button(ctx, g, 'levels', 340, 336, 280, 44, 'LEVEL SELECT', { small: true });
    U.button(ctx, g, 'mute', 340, 390, 280, 44, g.audio.muted ? 'SOUND: OFF' : 'SOUND: ON', { small: true });
    U.text(ctx, 'P / Esc resume  ·  R restart  ·  M sound', 480, 462, 11, 'rgba(207,233,255,0.5)', 'center', 600);
  },

  won(ctx, g) {
    const U = this, w = g.world, T = g.overlayT, th = w.level.theme;
    U.backdrop(ctx, Math.min(0.62, T * 1.4));
    const k = KAB.Util.easeOut(Math.min(1, T * 2.2));
    ctx.save();
    ctx.translate(480, 300); ctx.scale(0.88 + 0.12 * k, 0.88 + 0.12 * k); ctx.translate(-480, -300);
    ctx.globalAlpha = k;
    U.panel(ctx, 270, 70, 420, 460, th.accent);
    U.title(ctx, w.index === KAB.LEVELS.length - 1 ? 'HIVE DESTROYED' : 'LEVEL CLEARED', 480, 132, 34, '#7CFFb2');
    for (let i = 0; i < 3; i++) {
      const appear = 0.5 + i * 0.42;
      const on = i < w.stars && T > appear;
      const s = on ? 1 + Math.max(0, 0.7 - (T - appear) * 2.2) : 1;
      U.star(ctx, 480 + (i - 1) * 78, 200 - (i === 1 ? 10 : 0), 32, on, on, s);
    }
    const target = w.score, shown = Math.min(target, target * KAB.Util.easeOut(Math.min(1, Math.max(0, (T - 0.3) / 1.1))));
    U.text(ctx, U.fmt(shown), 480, 296, 44, '#ffffff', 'center', 900, true);
    U.text(ctx, 'SCORE', 480, 258, 12, 'rgba(207,233,255,0.55)', 'center', 800);
    if (w.winBonus) U.text(ctx, w.queue.length + ' unused bird' + (w.queue.length === 1 ? '' : 's') + '  +' + U.fmt(w.winBonus), 480, 324, 14, '#ffd34d', 'center', 700, true);
    if (g.newBest && T > 1.2) U.text(ctx, 'NEW BEST!', 480, 350, 16, '#ff5d9e', 'center', 900);
    else U.text(ctx, 'BEST ' + U.fmt(KAB.Store.best(w.index).score), 480, 350, 13, 'rgba(207,233,255,0.55)', 'center', 700, true);

    const last = w.index >= KAB.LEVELS.length - 1;
    if (!last) U.button(ctx, g, 'next', 330, 378, 300, 52, 'NEXT LEVEL', { primary: true, accent: '#7CFFb2' });
    U.button(ctx, g, 'restart', 330, last ? 378 : 440, 144, 44, 'REPLAY', { small: true, primary: last, accent: '#7CFFb2' });
    U.button(ctx, g, 'levels', 486, last ? 378 : 440, 144, 44, 'LEVELS', { small: true });
    ctx.restore();
  },

  lost(ctx, g) {
    const U = this, T = g.overlayT, left = g.world.enemiesAlive();
    U.backdrop(ctx, Math.min(0.62, T * 1.4));
    const k = KAB.Util.easeOut(Math.min(1, T * 2.2));
    ctx.save();
    ctx.globalAlpha = k;
    U.panel(ctx, 290, 130, 380, 320, '#ff5d9e');
    U.title(ctx, 'OUT OF BIRDS', 480, 196, 36, '#ff5d9e');
    U.text(ctx, left + ' drone' + (left === 1 ? '' : 's') + ' still online', 480, 232, 15, 'rgba(207,233,255,0.75)', 'center', 700);
    U.text(ctx, 'SCORE ' + U.fmt(g.world.score), 480, 266, 16, '#ffffff', 'center', 800, true);
    U.button(ctx, g, 'restart', 330, 294, 300, 52, 'TRY AGAIN', { primary: true, accent: '#ff5d9e' });
    U.button(ctx, g, 'levels', 330, 358, 300, 44, 'LEVEL SELECT', { small: true });
    ctx.restore();
  },
};
