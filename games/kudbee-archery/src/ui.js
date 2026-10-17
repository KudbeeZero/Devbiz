/* =====================================================================
 * Kudbee Archery — ui.js
 * Cartoon HUD + screens: scoreboard, arrow pips, wind gauge, draw + breath
 * meters, banners, menu, pause and results. Buttons register while drawing so
 * pointer hit-testing and keyboard focus use the geometry the player sees.
 * ===================================================================== */

KAR.UI = {
  FONT: '"Lilita One","Arial Black","Trebuchet MS",system-ui,sans-serif',
  OUT: '#1d2a3a',
  buttons: [],
  COL: {
    green:  ['#a9ec62', '#53bd3c', '#2f8a2a'],
    blue:   ['#7ac7ff', '#2f86d8', '#1f5fa8'],
    red:    ['#ff9a8a', '#e8483a', '#a82a20'],
    yellow: ['#ffe888', '#ffb82e', '#c9800e'],
    grey:   ['#c9cfd6', '#9aa3ad', '#6e7782'],
  },

  begin() { this.buttons.length = 0; },
  rr(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); },

  text(ctx, s, x, y, size, color, align) {
    ctx.save();
    ctx.font = '400 ' + size + 'px ' + this.FONT;
    ctx.textAlign = align || 'left'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, size * 0.24); ctx.strokeStyle = this.OUT; ctx.strokeText(s, x, y);
    ctx.fillStyle = color; ctx.fillText(s, x, y);
    ctx.restore();
  },

  bubble(ctx, s, x, y, size, c1, c2, tilt) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(tilt || 0);
    ctx.font = '400 ' + size + 'px ' + this.FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.34; ctx.strokeStyle = this.OUT; ctx.strokeText(s, 0, size * 0.06);
    ctx.lineWidth = size * 0.2; ctx.strokeStyle = '#ffffff'; ctx.strokeText(s, 0, 0);
    ctx.lineWidth = size * 0.1; ctx.strokeStyle = this.OUT; ctx.strokeText(s, 0, 0);
    const g = ctx.createLinearGradient(0, -size * 0.8, 0, size * 0.1); g.addColorStop(0, c1); g.addColorStop(1, c2);
    ctx.fillStyle = g; ctx.fillText(s, 0, 0);
    ctx.restore();
  },

  star(ctx, cx, cy, r, filled, scale) {
    ctx.save(); ctx.translate(cx, cy); ctx.scale(scale || 1, scale || 1);
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r * 0.5 : r; ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); }
    ctx.closePath(); ctx.lineJoin = 'round';
    if (filled) { const g = ctx.createLinearGradient(0, -r, 0, r); g.addColorStop(0, '#fff09a'); g.addColorStop(1, '#ffb11f'); ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = Math.max(2.5, r * 0.17); ctx.strokeStyle = this.OUT; ctx.stroke(); }
    else { ctx.fillStyle = 'rgba(30,30,50,0.35)'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(30,20,10,0.6)'; ctx.stroke(); }
    ctx.restore();
  },

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
    if (focused || opts.selected) { this.rr(ctx, x - 3, y - 3, w + 6, h + 6, 18); ctx.lineWidth = 4; ctx.strokeStyle = '#fff6a8'; ctx.stroke(); }
    const gr = ctx.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, cs[0]); gr.addColorStop(0.5, cs[1]); gr.addColorStop(1, cs[2]);
    this.rr(ctx, x, y, w, h, 15); ctx.fillStyle = gr; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.32)'; this.rr(ctx, x + 5, y + 4, w - 10, h * 0.38, 10); ctx.fill();
    if (label) {
      const size = opts.small ? 20 : 30;
      ctx.font = '400 ' + size + 'px ' + this.FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      ctx.lineWidth = size * 0.22; ctx.strokeStyle = opts.disabled ? '#555' : this.OUT; ctx.strokeText(label, x + w / 2, y + h / 2 + 2);
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

  backdrop(ctx, a) { ctx.fillStyle = 'rgba(20,16,40,' + a + ')'; ctx.fillRect(0, 0, KAR.Render.W, KAR.Render.H); },

  panel(ctx, x, y, w, h, color) {
    const cs = this.COL[color || 'blue'];
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; this.rr(ctx, x, y + 8, w, h, 24); ctx.fill();
    this.rr(ctx, x - 4, y - 4, w + 8, h + 8, 28); ctx.fillStyle = this.OUT; ctx.fill();
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, cs[0]); g.addColorStop(0.18, cs[1]); g.addColorStop(1, cs[2]);
    this.rr(ctx, x, y, w, h, 24); ctx.fillStyle = g; ctx.fill();
    this.rr(ctx, x + 8, y + 8, w - 16, h - 16, 18); ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.75)'; this.rr(ctx, x + 2, y + 2, w - 4, h - 4, 22); ctx.stroke();
    ctx.restore();
  },

  ribbon(ctx, cx, y, w, text, color) {
    const cs = this.COL[color || 'red'], h = 58;
    ctx.save(); ctx.lineJoin = 'round';
    for (const sx of [-1, 1]) {
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
    ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 3.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (kind === 'pause') { ctx.fillRect(cx - 7, cy - 8, 5, 16); ctx.fillRect(cx + 2, cy - 8, 5, 16); }
    else if (kind === 'retry') { ctx.beginPath(); ctx.arc(cx, cy, 8, 0.6, 5.6); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx + 8, cy - 9); ctx.lineTo(cx + 8, cy - 1); ctx.lineTo(cx, cy - 2); ctx.stroke(); }
    else if (kind === 'sound' || kind === 'mute') {
      ctx.beginPath(); ctx.moveTo(cx - 9, cy - 4); ctx.lineTo(cx - 4, cy - 4); ctx.lineTo(cx + 2, cy - 9); ctx.lineTo(cx + 2, cy + 9); ctx.lineTo(cx - 4, cy + 4); ctx.lineTo(cx - 9, cy + 4); ctx.closePath(); ctx.fill();
      if (kind === 'sound') { ctx.beginPath(); ctx.arc(cx + 2, cy, 7, -0.9, 0.9); ctx.stroke(); ctx.beginPath(); ctx.arc(cx + 2, cy, 12, -0.9, 0.9); ctx.stroke(); }
      else { ctx.beginPath(); ctx.moveTo(cx + 6, cy - 6); ctx.lineTo(cx + 13, cy + 6); ctx.moveTo(cx + 13, cy - 6); ctx.lineTo(cx + 6, cy + 6); ctx.stroke(); }
    }
    ctx.restore();
  },

  roundIcon(ctx, g, id, cx, cy, kind) {
    const r = 21, idx = this.buttons.length;
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

  // ---- HUD ------------------------------------------------------------------
  pip(ctx, x, y, team, a) {
    const U = this, col = KAR.Render.TEAM[team];
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, 13, 0, 7); ctx.fillStyle = U.OUT; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, 11, 0, 7); ctx.fillStyle = a ? (a.ring >= 9 ? '#ffd34d' : a.ring >= 7 ? '#ff6b5a' : a.ring >= 5 ? '#6fb4ff' : a.ring > 0 ? '#e6e6e6' : '#7a7f88') : 'rgba(255,255,255,0.16)'; ctx.fill();
    ctx.restore();
    if (a) U.text(ctx, a.x ? 'X' : (a.ring ? String(a.ring) : 'M'), x, y + 6, a.ring === 10 && !a.x ? 13 : 15, a.ring >= 9 || a.ring === 0 ? '#2a1a10' : '#ffffff', 'center');
  },

  hud(ctx, g) {
    const U = this, m = g.match, duel = m.mode === 'duel', trick = m.mode === 'trick', R = KAR.Render;
    const h = duel ? 138 : 104;
    U.rr(ctx, 14, 16, 300, h, 18); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fill();
    U.rr(ctx, 12, 12, 300, h, 18); ctx.fillStyle = U.OUT; ctx.fill();
    const pg = ctx.createLinearGradient(0, 12, 0, 12 + h); pg.addColorStop(0, '#47628f'); pg.addColorStop(1, '#2a3f66');
    U.rr(ctx, 15, 15, 294, h - 6, 15); ctx.fillStyle = pg; ctx.fill();
    if (trick) {
      // score, quiver (one tick per arrow left), best
      U.text(ctx, 'SCORE', 28, 46, 20, '#7ac7ff', 'left');
      U.text(ctx, String(g.trickShown), 290, 50, 36, '#ffffff', 'right');
      const n = m.quiver;
      for (let k = 0; k < Math.min(n, 14); k++) { const x = 30 + k * 13; ctx.save(); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, 66); ctx.lineTo(x, 92); ctx.strokeStyle = U.OUT; ctx.lineWidth = 5; ctx.stroke(); ctx.strokeStyle = '#f2e6c8'; ctx.lineWidth = 2.6; ctx.stroke(); ctx.fillStyle = k % 2 ? '#2f86d8' : '#7ac7ff'; ctx.fillRect(x - 3.5, 86, 7, 8); ctx.restore(); }
      U.text(ctx, n > 14 ? '+' + (n - 14) : '', 30 + 14 * 13, 90, 16, '#ffffff', 'left');
      const dd = KAR.Store.data.daily;
      U.text(ctx, m.daily ? 'TODAY ' + (dd.day === m.daily ? dd.best : 0) : 'BEST ' + (KAR.Store.data.trickBest || 0), 290, 98, 16, '#ffe9a8', 'right');
    }
    const rows = trick ? [] : duel ? [0, 1] : [0];
    rows.forEach((s, i) => {
      const y = 38 + i * 50, col = R.TEAM[s], active = !m.over && m.shooter === s && g.screen === 'play';
      if (active) { ctx.save(); ctx.fillStyle = 'rgba(255,246,168,0.22)'; U.rr(ctx, 20, y - 20, 284, 44, 12); ctx.fill(); ctx.restore(); }
      U.text(ctx, duel ? col.name : 'SCORE', 28, y + 8, 20, col.light, 'left');
      U.text(ctx, String(m.total(s)), 128, y + 12, 36, '#ffffff', 'right');
      const arrows = m.arrows[s].filter(a => a.end === m.endNo);
      for (let k = 0; k < m.per; k++) U.pip(ctx, 160 + k * 32, y - 1, s, arrows[k]);
      if (m.xs(s)) U.text(ctx, m.xs(s) + 'X', 276, y + 6, 15, '#ffd34d', 'right');
    });
    if (trick) { /* no ends */ }
    else if (!duel) U.text(ctx, 'END ' + Math.min(m.endNo + 1, m.ends) + ' / ' + m.ends + '   \u00b7   ' + m.dist + ' M' + (m.mode === 'swing' ? '   \u00b7   SWINGER' : ''), 28, 98, 17, '#ffe9a8', 'left');
    else U.text(ctx, 'END ' + Math.min(m.endNo + 1, m.ends) + ' / ' + m.ends + '   \u00b7   SETS ' + m.sets[0] + ' - ' + m.sets[1], 28, 128, 16, '#ffe9a8', 'left');
    U.roundIcon(ctx, g, 'pause', 926, 36, 'pause');
    U.roundIcon(ctx, g, 'mute', 876, 36, g.audio.muted ? 'mute' : 'sound');
    U.roundIcon(ctx, g, 'retry', 826, 36, 'retry');
    // wind gauge
    const w = m.wind, a = Math.min(1, Math.abs(w) / (KAR.CFG.WIND[m.distIdx] || 3)), wy = h + 30;
    U.rr(ctx, 12, wy, 172, 56, 16); ctx.fillStyle = U.OUT; ctx.fill(); U.rr(ctx, 15, wy + 3, 166, 50, 13); ctx.fillStyle = '#2a3f66'; ctx.fill();
    U.text(ctx, 'WIND', 26, wy + 24, 14, '#ffe9a8', 'left');
    ctx.save(); ctx.translate(120, wy + 28); ctx.scale(Math.sign(w) || 1, 1); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const L = 14 + a * 34; ctx.beginPath(); ctx.moveTo(-L, 0); ctx.lineTo(L, 0); ctx.moveTo(L - 11, -9); ctx.lineTo(L, 0); ctx.lineTo(L - 11, 9); ctx.lineWidth = 8; ctx.strokeStyle = U.OUT; ctx.stroke(); ctx.lineWidth = 4.5; ctx.strokeStyle = a > 0.66 ? '#ff9a7a' : a > 0.33 ? '#ffe14d' : '#9be35a'; ctx.stroke(); ctx.restore();
    U.text(ctx, Math.abs(w).toFixed(1), 26, wy + 46, 20, '#ffffff', 'left');
    // gold streak chip: 9s and better in a row
    const chip = trick ? (g.trickCombo >= 2 ? 'COMBO \u00d7' + g.trickCombo : '') : (g.streak >= 2 ? 'GOLD STREAK \u00d7' + g.streak : '');
    if (chip) {
      const pulse = 1 + 0.06 * Math.sin(g.time * 8), sy = wy + 66;
      ctx.save(); ctx.translate(12, sy); ctx.scale(pulse, pulse);
      U.rr(ctx, 0, 0, 172, 40, 14); ctx.fillStyle = U.OUT; ctx.fill();
      const sg = ctx.createLinearGradient(0, 3, 0, 37); sg.addColorStop(0, '#ffe888'); sg.addColorStop(1, '#ff9a1f');
      U.rr(ctx, 3, 3, 166, 34, 11); ctx.fillStyle = sg; ctx.fill();
      ctx.restore();
      U.text(ctx, chip, 98, sy + 28, 18, '#ffffff', 'center');
    }
    // last-arrow pressure line
    if (g.drama && g.screen === 'play' && g.bp === 'ready' && !g.banner) {
      const k = 1 + 0.04 * Math.sin(g.time * 6);
      ctx.save(); ctx.translate(480, 158); ctx.scale(k, k); U.text(ctx, g.drama, 0, 0, 22, '#fff27a', 'center'); ctx.restore();
    }
    // draw + breath meters while a shot is being prepared
    if (g.screen === 'play' && g.human() && g.drawing) {
      const bx = 330, by = 598;
      U.rr(ctx, bx - 3, by - 3, 300, 22, 11); ctx.fillStyle = U.OUT; ctx.fill();
      const dp = KAR.Util.clamp(g.draw, 0, 1), gr = ctx.createLinearGradient(bx, 0, bx + 294, 0); gr.addColorStop(0, '#ffe14d'); gr.addColorStop(1, dp >= 1 ? '#8aee54' : '#ff9a3c');
      U.rr(ctx, bx, by, Math.max(14, 294 * dp), 16, 8); ctx.fillStyle = gr; ctx.fill();
      U.text(ctx, dp >= 1 ? 'FULL DRAW \u00b7 RELEASE WHEN STEADY' : 'DRAWING\u2026', 480, by - 12, 16, '#ffffff', 'center');
      // breath
      const br = KAR.Util.clamp(g.breath, 0, 1);
      U.rr(ctx, 832, 360, 24, 150, 12); ctx.fillStyle = U.OUT; ctx.fill();
      const bh = Math.max(10, 144 * br); U.rr(ctx, 835, 363 + (144 - bh), 18, bh, 9); ctx.fillStyle = g.holding ? '#9be35a' : (br < 0.25 ? '#ff7a6a' : '#6fb4ff'); ctx.fill();
      U.text(ctx, 'BREATH', 844, 530, 13, '#ffe9a8', 'center');
    }
    if (g.screen === 'play' && g.human() && !g.coarse) U.text(ctx, g.drawing ? 'HOLD B / RIGHT-CLICK TO STEADY' : '', 480, 624, 14, '#ffffff', 'center');
    if (g.coarse && g.screen === 'play' && g.human()) U.button(ctx, g, 'breath', 806, 536, 140, 54, g.holding ? 'STEADY!' : 'HOLD BREATH', { small: true, color: g.holding ? 'green' : 'yellow' });
    // hint / turn text
    if (g.hint && g.hintT > 0 && !g.drawing) { ctx.save(); ctx.globalAlpha = Math.min(1, g.hintT * 2); U.text(ctx, g.hint, 480, 618, 20, '#ffffff', 'center'); ctx.restore(); }
    // banner
    if (g.banner) {
      const b = g.banner, k = KAR.Util.easeOut(Math.min(1, b.age * 5)), fade = Math.min(1, b.life * 3);
      ctx.save(); ctx.globalAlpha = fade; ctx.translate(480, 150); ctx.scale(0.6 + 0.4 * k, 0.6 + 0.4 * k);   // high enough that the gold (and your arrow) stays in view
      U.bubble(ctx, b.text, 0, 0, b.size || 80, b.c1 || '#fff27a', b.c2 || '#ff9a1f', -0.03);
      if (b.sub) U.text(ctx, b.sub, 0, 42, 24, '#ffffff', 'center');
      ctx.restore();
    }
  },

  // ---- screens ----------------------------------------------------------------
  menu(ctx, g) {
    const U = this, t = g.time, D = KAR.Store.data, duel = D.mode === 1;
    U.backdrop(ctx, 0.3);
    U.bubble(ctx, 'KUDBEE', 480, 92, 42, '#ffffff', '#cfe9ff', -0.03);
    U.bubble(ctx, 'ARCHERY', 480, 178, 92, '#fff27a', '#ff9a1f', -0.03 + Math.sin(t * 1.4) * 0.008);
    U.text(ctx, 'READ THE WIND  \u00b7  HOLD YOUR BREATH  \u00b7  HIT THE GOLD', 480, 212, 17, '#ffffff', 'center');
    const trick = D.mode === 2, swing = D.mode === 3, daily = D.mode === 4;
    ['RANGE', 'DUEL VS CPU', 'BALLOON POP', 'SWINGER', 'DAILY'].forEach((n, i) => U.button(ctx, g, 'mode' + i, 40 + i * 178, 232, 164, 44, n, { small: true, color: D.mode === i ? 'green' : (i >= 2 ? (i === 4 ? 'yellow' : 'red') : 'blue'), selected: D.mode === i }));
    if (swing) {
      U.text(ctx, 'THE TARGET HANGS ON ROPES AND SWINGS', 480, 318, 20, '#ffffff', 'center');
      U.text(ctx, 'lead it  \u00b7  loose as it swings toward your sight  \u00b7  the arc grows every end', 480, 350, 17, '#ffe9a8', 'center');
      U.text(ctx, '30 m  \u00b7  4 ends of 3 arrows  \u00b7  out of 120', 480, 378, 17, '#ffe9a8', 'center');
      U.text(ctx, 'BEST ' + (D.swingBest || 0), 480, 428, 26, '#fff27a', 'center');
    }
    if (daily) {
      const day = KAR.Daily.day(), dd = D.daily, today = dd.day === day;
      U.text(ctx, 'DAILY #' + day + '  \u00b7  ' + KAR.Daily.date(day), 480, 318, 22, '#ffffff', 'center');
      U.text(ctx, 'today\'s BALLOON POP: the same wind and balloons for everyone', 480, 350, 17, '#ffe9a8', 'center');
      U.text(ctx, 'play it, then share your score  \u00b7  a new one every day (UTC)', 480, 378, 17, '#ffe9a8', 'center');
      U.text(ctx, today ? 'TODAY ' + dd.best + '   \u00b7   FIRST TRY ' + dd.first + '   \u00b7   ' + dd.plays + (dd.plays > 1 ? ' PLAYS' : ' PLAY') : 'NOT PLAYED YET TODAY', 480, 428, 24, '#fff27a', 'center');
    }
    if (trick) {
      U.text(ctx, 'BALLOONS DRIFT ACROSS THE RANGE IN THE WIND', 480, 318, 20, '#ffffff', 'center');
      U.text(ctx, 'lead the movers  \u00b7  pop in a row for a combo  \u00b7  one arrow can pop two', 480, 350, 17, '#ffe9a8', 'center');
      U.text(ctx, 'gold balloons refill 2 arrows  \u00b7  12 arrows to start', 480, 378, 17, '#ffe9a8', 'center');
      U.text(ctx, 'BEST ' + (D.trickBest || 0), 480, 428, 26, '#fff27a', 'center');
    }
    const plain = D.mode < 2;
    if (plain) U.text(ctx, 'DISTANCE', 480, 308, 17, '#ffe9a8', 'center');
    if (plain) KAR.CFG.DISTS.forEach((d, i) => {
      const x = 144 + i * 170, lock = KAR.locked(i, D);
      U.button(ctx, g, 'd' + i, x, 316, 156, 46, d + ' M', { small: true, color: D.dist === i && !lock ? 'green' : 'blue', selected: D.dist === i && !lock, disabled: lock });
      if (lock) { const n = D.stars[0] + D.stars[1] + D.stars[2]; U.text(ctx, 'LOCKED', x + 78, 386, 15, '#ffffff', 'center'); U.text(ctx, '\u2605 ' + n + ' / ' + KAR.UNLOCK70 + ' TO OPEN', x + 78, 408, 14, '#ffe9a8', 'center'); return; }
      if (!duel) for (let k = 0; k < 3; k++) U.star(ctx, x + 38 + k * 40, 382, 11, k < D.stars[i], 1);
      if (!duel && D.best[i]) U.text(ctx, 'BEST ' + D.best[i], x + 78, 412, 14, '#ffffff', 'center');
    });
    if (duel) {
      U.text(ctx, 'CPU SKILL', 480, 396, 17, '#ffe9a8', 'center');
      KAR.LEVELS.forEach((L, i) => U.button(ctx, g, 'lv' + i, 270 + i * 140, 404, 128, 40, L.name, { small: true, color: D.level === i ? 'green' : 'blue', selected: D.level === i }));
    }
    U.button(ctx, g, 'play', 330, 462, 300, 70, daily ? 'PLAY TODAY' : swing ? 'START SWINGER' : trick ? 'START POPPING' : duel ? 'START DUEL' : 'START RANGE', { primary: true });
    U.text(ctx, 'press & hold to draw  \u00b7  move to aim  \u00b7  release to loose', 480, 568, 16, '#ffffff', 'center');
    U.text(ctx, D.stats.arrows + ' arrows shot  \u00b7  ' + D.stats.tens + ' tens  \u00b7  ' + D.stats.xs + ' X  \u00b7  best streak ' + D.stats.bestStreak + (D.stats.robins ? '  \u00b7  ' + D.stats.robins + ' robin hood' + (D.stats.robins > 1 ? 's' : '') : ''), 480, 594, 15, '#ffe9a8', 'center');
    U.roundIcon(ctx, g, 'mute', 926, 36, g.audio.muted ? 'mute' : 'sound');
  },

  overTrick(ctx, g) {
    const U = this, m = g.match, T = g.overlayT, k = KAR.Util.easeOut(Math.min(1, T * 2.2));
    U.backdrop(ctx, Math.min(0.55, T * 1.4));
    ctx.save(); ctx.translate(480, 320); ctx.scale(0.86 + 0.14 * k, 0.86 + 0.14 * k); ctx.translate(-480, -320); ctx.globalAlpha = k;
    U.panel(ctx, 240, 104, 480, 430, g.newBest ? 'blue' : 'red');
    U.ribbon(ctx, 480, 76, 400, m.daily ? 'DAILY #' + m.daily : 'OUT OF ARROWS', g.newBest ? 'green' : 'red');
    U.text(ctx, String(m.score), 480, 226, 86, '#ffffff', 'center');
    U.text(ctx, m.popped + ' POPPED   \u00b7   BEST COMBO \u00d7' + Math.max(1, Math.min(5, m.bestCombo)) + '   \u00b7   ' + m.arrowNo + ' ARROWS', 480, 266, 19, '#ffe9a8', 'center');
    if (m.daily) {
      const dd = KAR.Store.data.daily;
      U.text(ctx, g.newBest && dd.plays > 1 ? 'NEW BEST TODAY!' : 'TODAY\'S BEST ' + dd.best, 480, 322, 30, g.newBest && dd.plays > 1 ? '#fff27a' : '#ffffff', 'center');
      U.text(ctx, 'same balloons for everyone today  \u00b7  first try ' + dd.first, 480, 352, 17, '#ffe9a8', 'center');
      const copied = g.time - g.shared < 2.5;
      U.button(ctx, g, 'share', 330, 376, 300, 52, copied ? 'COPIED!' : 'SHARE SCORE', { small: true, color: copied ? 'green' : 'yellow' });
    } else if (g.newBest && m.score > 0) U.text(ctx, 'NEW BEST!', 480, 340, 40, '#fff27a', 'center');
    else U.text(ctx, 'BEST ' + (KAR.Store.data.trickBest || 0), 480, 340, 28, '#ffffff', 'center');
    U.button(ctx, g, 'rematch', 270, 450, 270, 56, m.daily ? 'TRY AGAIN' : 'PLAY AGAIN', { primary: true });
    U.button(ctx, g, 'menu', 560, 450, 150, 56, 'MENU', { small: true, color: 'yellow' });
    ctx.restore();
  },

  pause(ctx, g) {
    const U = this;
    U.backdrop(ctx, 0.55);
    U.panel(ctx, 290, 130, 380, 372, 'blue');
    U.ribbon(ctx, 480, 106, 300, 'PAUSED', 'yellow');
    U.button(ctx, g, 'resume', 340, 214, 280, 62, 'RESUME', { primary: true });
    U.button(ctx, g, 'restart', 340, 294, 280, 50, 'RESTART', { small: true });
    U.button(ctx, g, 'menu', 340, 360, 280, 50, 'MENU', { small: true, color: 'yellow' });
    U.button(ctx, g, 'mute', 340, 426, 280, 50, g.audio.muted ? 'SOUND: OFF' : 'SOUND: ON', { small: true });
  },

  over(ctx, g) {
    const U = this, m = g.match, T = g.overlayT, duel = m.mode === 'duel';
    if (m.mode === 'trick') return this.overTrick(ctx, g);
    const swing = m.mode === 'swing', won = duel ? m.winner === 0 : swing ? g.newBest || m.total(0) >= 80 : m.stars() >= 1;
    U.backdrop(ctx, Math.min(0.55, T * 1.4));
    const k = KAR.Util.easeOut(Math.min(1, T * 2.2));
    ctx.save(); ctx.translate(480, 320); ctx.scale(0.86 + 0.14 * k, 0.86 + 0.14 * k); ctx.translate(-480, -320); ctx.globalAlpha = k;
    U.panel(ctx, 240, 104, 480, 430, won ? 'blue' : 'red');
    U.ribbon(ctx, 480, 76, 400, duel ? (m.winner === 0 ? 'YOU WIN!' : m.winner === 1 ? 'CPU WINS' : 'DRAW') : swing ? 'SWINGER DONE' : 'RANGE COMPLETE', won ? 'green' : 'red');
    if (duel) {
      U.text(ctx, m.total(0) + '  \u2013  ' + m.total(1), 480, 218, 70, '#ffffff', 'center');
      U.text(ctx, 'SETS ' + m.sets[0] + ' \u2013 ' + m.sets[1] + '   \u00b7   X ' + m.xs(0) + ' \u2013 ' + m.xs(1), 480, 256, 20, '#ffe9a8', 'center');
    } else if (swing) {
      U.text(ctx, String(m.total(0)), 480, 222, 86, '#ffffff', 'center');
      U.text(ctx, 'OUT OF 120   \u00b7   ' + m.xs(0) + ' X   \u00b7   ' + m.dist + ' M ON THE SWING', 480, 258, 20, '#ffe9a8', 'center');
      U.text(ctx, g.newBest && m.total(0) > 0 ? 'NEW BEST!' : 'BEST ' + (KAR.Store.data.swingBest || 0), 480, 340, g.newBest ? 40 : 28, g.newBest ? '#fff27a' : '#ffffff', 'center');
    } else {
      U.text(ctx, String(m.total(0)), 480, 222, 86, '#ffffff', 'center');
      U.text(ctx, 'OUT OF 150   \u00b7   ' + m.xs(0) + ' X   \u00b7   ' + m.dist + ' M', 480, 258, 20, '#ffe9a8', 'center');
      for (let i = 0; i < 3; i++) U.star(ctx, 480 + (i - 1) * 78, 330 - (i === 1 ? 14 : 0), i === 1 ? 38 : 30, i < m.stars(), T > 0.4 + i * 0.3 ? 1 : 0.01);
      if (g.unlocked) U.text(ctx, '70 M UNLOCKED!', 480, 396, 30, '#9be35a', 'center');
      else if (g.newBest) U.text(ctx, 'NEW BEST!', 480, 392, 28, '#fff27a', 'center');
    }
    const ends = m.endScores.map((e, i) => (duel ? e[0] + ':' + e[1] : String(e[0]))).join('   ');
    U.text(ctx, 'ENDS  ' + ends, 480, 420, 17, '#ffffff', 'center');
    U.button(ctx, g, 'rematch', 270, 450, 270, 56, 'PLAY AGAIN', { primary: true });
    U.button(ctx, g, 'menu', 560, 450, 150, 56, 'MENU', { small: true, color: 'yellow' });
    ctx.restore();
  },
};
