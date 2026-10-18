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

  // centred text, shrunk if needed so it fits in maxW
  fit(ctx, s, x, y, size, color, maxW, align) {
    ctx.save(); ctx.font = '400 ' + size + 'px ' + this.FONT; const w = ctx.measureText(s).width; ctx.restore();
    this.text(ctx, s, x, y, w > maxW ? Math.max(10, Math.floor(size * maxW / w)) : size, color, align || 'center');
  },
  // phones show the 960 x 640 stage at about 0.6 of its size: small print gets bigger there so it stays readable
  sz(g, n) { return g.coarse ? Math.round(n < 20 ? n * 1.25 + 1 : n * 1.1) : n; },

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
      let size = opts.small ? 20 : 30;
      ctx.font = '400 ' + size + 'px ' + this.FONT;
      const lw = ctx.measureText(label).width; if (lw > w - 14) { size = Math.max(11, Math.floor(size * (w - 14) / lw)); ctx.font = '400 ' + size + 'px ' + this.FONT; }     // a long label shrinks to fit
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

  backdrop(ctx, a) { ctx.fillStyle = 'rgba(20,16,40,' + a + ')'; ctx.fillRect(KAR.Render.XL, 0, KAR.Render.XW, KAR.Render.H); },

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
    else if (kind === 'share') {                              // three linked dots
      ctx.lineWidth = 2.8; ctx.beginPath(); ctx.moveTo(cx + 6, cy - 7); ctx.lineTo(cx - 6, cy); ctx.lineTo(cx + 6, cy + 7); ctx.stroke();
      for (const [x, y] of [[cx + 7, cy - 8], [cx - 7, cy], [cx + 7, cy + 8]]) { ctx.beginPath(); ctx.arc(x, y, 4.2, 0, 6.283); ctx.fill(); }
    }
    else if (kind === 'prev' || kind === 'next') {          // a chunky chevron
      const d = kind === 'next' ? 1 : -1; ctx.lineWidth = 7; ctx.strokeStyle = this.OUT;
      for (const [w, c] of [[9, this.OUT], [5, color]]) { ctx.lineWidth = w; ctx.strokeStyle = c; ctx.beginPath(); ctx.moveTo(cx - d * 6, cy - 12); ctx.lineTo(cx + d * 6, cy); ctx.lineTo(cx - d * 6, cy + 12); ctx.stroke(); }
    }
    else if (kind === 'full' || kind === 'unfull') {          // four corner brackets: out = go full screen, in = leave it
      const out = kind === 'full', d = out ? 9 : 3, o = out ? -1 : 1;
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const x = cx + sx * d, y = cy + sy * d; ctx.beginPath(); ctx.moveTo(x, y - o * -sy * 6); ctx.lineTo(x, y); ctx.lineTo(x - o * -sx * 6, y); ctx.stroke(); }
    }
    else if (kind === 'sound' || kind === 'mute') {
      ctx.beginPath(); ctx.moveTo(cx - 9, cy - 4); ctx.lineTo(cx - 4, cy - 4); ctx.lineTo(cx + 2, cy - 9); ctx.lineTo(cx + 2, cy + 9); ctx.lineTo(cx - 4, cy + 4); ctx.lineTo(cx - 9, cy + 4); ctx.closePath(); ctx.fill();
      if (kind === 'sound') { ctx.beginPath(); ctx.arc(cx + 2, cy, 7, -0.9, 0.9); ctx.stroke(); ctx.beginPath(); ctx.arc(cx + 2, cy, 12, -0.9, 0.9); ctx.stroke(); }
      else { ctx.beginPath(); ctx.moveTo(cx + 6, cy - 6); ctx.lineTo(cx + 13, cy + 6); ctx.moveTo(cx + 13, cy - 6); ctx.lineTo(cx + 6, cy + 6); ctx.stroke(); }
    }
    ctx.restore();
  },

  roundIcon(ctx, g, id, cx, cy, kind, big) {
    const r = big ? 27 : 21, idx = this.buttons.length;
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
    const h = duel ? 138 : 104, xl = R.XL, xr = -R.XL;          // on a wide screen the panels ride out to the edges
    ctx.save(); ctx.translate(xl, 0);
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
      if (duel && s === 1 && m.cup) U.fit(ctx, m.cup.name, 28, y + 8, 18, col.light, 82, 'left');
      else U.text(ctx, duel ? col.name : 'SCORE', 28, y + 8, 20, col.light, 'left');
      U.fit(ctx, String(m.total(s)), 142, y + 12, 36, '#ffffff', 46, 'right');          // 100+ shrinks rather than covering the label
      const arrows = m.arrows[s].filter(a => a.end === m.endNo);
      for (let k = 0; k < m.per; k++) U.pip(ctx, 172 + k * 32, y - 1, s, arrows[k]);
      if (m.xs(s)) U.text(ctx, m.xs(s) + 'X', 276, y + 6, 15, '#ffd34d', 'right');
    });
    if (trick) { /* no ends */ }
    else if (m.mode === 'stage') U.fit(ctx, 'LEVEL ' + (m.lv + 1) + '  \u00b7  END ' + Math.min(m.endNo + 1, m.ends) + ' / ' + m.ends + '  \u00b7  ' + m.dist + ' M', 28, 98, U.sz(g, 17), '#ffe9a8', 272, 'left');
    else if (!duel) U.fit(ctx, 'END ' + Math.min(m.endNo + 1, m.ends) + ' / ' + m.ends + '  \u00b7  ' + m.dist + ' M' + (m.mode === 'swing' ? '  \u00b7  SWINGER' : ''), 28, 98, U.sz(g, 17), '#ffe9a8', 272, 'left');
    else U.fit(ctx, 'END ' + Math.min(m.endNo + 1, m.ends) + ' / ' + m.ends + '  \u00b7  SETS ' + m.sets[0] + ' - ' + m.sets[1], 28, 128, U.sz(g, 16), '#ffe9a8', 272, 'left');
    ctx.restore();
    const big = g.coarse, ri = big ? 62 : 50, ry = big ? 40 : 36, rx = 926 - (big ? 4 : 0) + xr;
    if (g.screen !== 'over') {          // (behind the results card they would still take clicks and keyboard focus)
      U.roundIcon(ctx, g, 'pause', rx, ry, 'pause', big);
      U.roundIcon(ctx, g, 'mute', rx - ri, ry, g.audio.muted ? 'mute' : 'sound', big);
      U.roundIcon(ctx, g, 'retry', rx - ri * 2, ry, 'retry', big);
    }
    // the tutorial card, top centre while the tip applies (between the score panel and the round buttons)
    if (g.coach && g.screen === 'play' && g.bp === 'ready' && !g.banner && !m.over) {
      const room = Math.min(480 - (322 + xl), rx - ri * 2 - (big ? 27 : 21) - 10 - 480), cw = Math.min(big ? 640 : 520, room * 2), cx = 480 - cw / 2, ch = big ? 84 : 70;
      U.rr(ctx, cx, 14, cw, ch, 16); ctx.fillStyle = U.OUT; ctx.fill();
      const cg = ctx.createLinearGradient(0, 17, 0, 11 + ch); cg.addColorStop(0, '#ffe888'); cg.addColorStop(1, '#ffb82e');
      U.rr(ctx, cx + 3, 17, cw - 6, ch - 6, 13); ctx.fillStyle = cg; ctx.fill();
      U.text(ctx, g.coach.text, 480, big ? 50 : 46, big ? 26 : 22, '#ffffff', 'center');
      U.fit(ctx, g.coach.sub, 480, big ? 82 : 70, big ? 18 : 13, '#ffffff', cw - 24);
    }
    this.levelCard(ctx, g);
    ctx.save(); ctx.translate(xl, 0);
    // wind gauge
    const w = m.wind, a = Math.min(1, Math.abs(w) / (KAR.CFG.WIND[m.distIdx] || 3)), wy = h + 30;
    U.rr(ctx, 12, wy, 172, 56, 16); ctx.fillStyle = U.OUT; ctx.fill(); U.rr(ctx, 15, wy + 3, 166, 50, 13); ctx.fillStyle = '#2a3f66'; ctx.fill();
    U.text(ctx, 'WIND', 26, wy + 24, U.sz(g, 14), '#ffe9a8', 'left');
    ctx.save(); ctx.translate(g.coarse ? 128 : 120, wy + 28); ctx.scale(Math.sign(w) || 1, 1); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const L = g.coarse ? 12 + a * 28 : 14 + a * 34; ctx.beginPath(); ctx.moveTo(-L, 0); ctx.lineTo(L, 0); ctx.moveTo(L - 11, -9); ctx.lineTo(L, 0); ctx.lineTo(L - 11, 9); ctx.lineWidth = 8; ctx.strokeStyle = U.OUT; ctx.stroke(); ctx.lineWidth = 4.5; ctx.strokeStyle = a > 0.66 ? '#ff9a7a' : a > 0.33 ? '#ffe14d' : '#9be35a'; ctx.stroke(); ctx.restore();
    U.text(ctx, Math.abs(w).toFixed(1), 26, wy + 46, 20, '#ffffff', 'left');
    const wa = g.time - g.windT;          // a new end's wind: the gauge flashes (orange when it has switched sides)
    if (wa >= 0 && wa < 1.6 && g.screen === 'play') { ctx.save(); ctx.globalAlpha = (1 - wa / 1.6) * (g.calm ? 0.7 : 0.6 + 0.4 * Math.abs(Math.sin(wa * 9))); U.rr(ctx, 9, wy - 3, 178, 62, 18); ctx.lineWidth = 5; ctx.strokeStyle = g.windFlip ? '#ff9a3c' : '#fff27a'; ctx.stroke(); ctx.restore(); }
    // gold streak chip: 9s and better in a row
    const chip = trick ? (g.trickCombo >= 2 ? 'COMBO \u00d7' + g.trickCombo : '') : (g.streak >= 2 ? 'GOLD STREAK \u00d7' + g.streak : '');
    if (chip) {
      const pulse = g.calm ? 1 : 1 + 0.06 * Math.sin(g.time * 8), sy = wy + 66;
      ctx.save(); ctx.translate(12, sy); ctx.scale(pulse, pulse);
      U.rr(ctx, 0, 0, 172, 40, 14); ctx.fillStyle = U.OUT; ctx.fill();
      const sg = ctx.createLinearGradient(0, 3, 0, 37); sg.addColorStop(0, '#ffe888'); sg.addColorStop(1, '#ff9a1f');
      U.rr(ctx, 3, 3, 166, 34, 11); ctx.fillStyle = sg; ctx.fill();
      ctx.restore();
      U.text(ctx, chip, 98, sy + 28, 18, '#ffffff', 'center');
    }
    ctx.restore();
    // last-arrow pressure line
    if (g.drama && g.screen === 'play' && g.bp === 'ready' && !g.banner) {
      const k = g.calm ? 1 : 1 + 0.04 * Math.sin(g.time * 6);
      ctx.save(); ctx.translate(480, 158); ctx.scale(k, k); U.text(ctx, g.drama, 0, 0, 22, '#fff27a', 'center'); ctx.restore();
    }
    // draw + breath meters while a shot is being prepared
    if (g.screen === 'play' && g.human() && g.drawing) {
      const bx = 330, by = 598;
      U.rr(ctx, bx - 3, by - 3, 300, 22, 11); ctx.fillStyle = U.OUT; ctx.fill();
      const dp = KAR.Util.clamp(g.draw, 0, 1), gr = ctx.createLinearGradient(bx, 0, bx + 294, 0); gr.addColorStop(0, '#ffe14d'); gr.addColorStop(1, dp >= 1 ? '#8aee54' : '#ff9a3c');
      U.rr(ctx, bx, by, Math.max(14, 294 * dp), 16, 8); ctx.fillStyle = gr; ctx.fill();
      U.text(ctx, dp >= 1 ? 'FULL DRAW \u00b7 RELEASE WHEN STEADY' : 'DRAWING\u2026', 480, by - 12, U.sz(g, 16), '#ffffff', 'center');
      // breath
      const br = KAR.Util.clamp(g.breath, 0, 1);
      const mx = 832 + xr - (big ? 30 : 0), my = big ? 330 : 360;
      U.rr(ctx, mx, my, 24, 150, 12); ctx.fillStyle = U.OUT; ctx.fill();
      const bh = Math.max(10, 144 * br); U.rr(ctx, mx + 3, my + 3 + (144 - bh), 18, bh, 9); ctx.fillStyle = g.holding ? '#9be35a' : (br < 0.25 ? '#ff7a6a' : '#6fb4ff'); ctx.fill();
      if (!big) U.text(ctx, 'BREATH', mx + 12, my + 170, 13, '#ffe9a8', 'center');
    }
    if (g.screen === 'play' && g.human() && !g.coarse) U.text(ctx, g.drawing ? 'HOLD B / RIGHT-CLICK TO STEADY' : '', 480, 624, 14, '#ffffff', 'center');
    if (big && g.screen === 'play' && g.human()) {
      U.button(ctx, g, 'breath', 772 + xr, 500, 172, 76, g.holding ? 'STEADY!' : 'BREATH', { small: true, color: g.holding ? 'green' : 'yellow' });
      if (g.drawing && !g.holding) U.text(ctx, 'or a 2nd finger', 858 + xr, 604, 17, '#ffffff', 'center');
    }
    // THE AGENT's tip: a card at the bottom left for a few seconds after an arrow lands
    if (g.agentTip && g.screen === 'play') {
      const age = g.time - g.agentTip.t, k = Math.min(1, age / 0.3, (6 - age) / 0.4);
      if (age > 6) g.agentTip = null;
      else {
        const x = 14 + xl, y = big ? 432 : 520, w = big ? 470 : 440, h = big ? 62 : 56;
        ctx.save(); ctx.globalAlpha = Math.max(0, k) * (g.drawing ? 0.45 : 1); ctx.translate(-(1 - Math.max(0, k)) * 40, 0);
        U.rr(ctx, x, y, w, h, 16); ctx.fillStyle = U.OUT; ctx.fill();
        U.rr(ctx, x + 3, y + 3, w - 6, h - 6, 13); ctx.fillStyle = '#2c4f86'; ctx.fill();
        this.robin(ctx, x + 32, y + h / 2, big ? 22 : 20, g.time);
        U.text(ctx, KAR.Agent.NAME + ' SAYS', x + 62, y + (big ? 24 : 22), U.sz(g, 13), '#9be35a', 'left');
        U.fit(ctx, g.agentTip.line, x + 62, y + h - (big ? 13 : 12), U.sz(g, 17), '#ffffff', w - 76, 'left');
        ctx.restore();
      }
    }
    // hint / turn text
    if (g.hint && g.hintT > 0 && !g.drawing && g.screen !== 'over') { ctx.save(); ctx.globalAlpha = Math.min(1, g.hintT * 2); U.fit(ctx, g.hint, 480, 618, big ? 24 : 20, '#ffffff', big ? 560 + xr * 2 - 40 : 900); ctx.restore(); }
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
    const C = g.coarse;                    // phones: a compact title and two rows of big buttons (taps of ~40 pt and up)
    if (C) { U.bubble(ctx, 'KUDBEE', 480, 46, 28, '#ffffff', '#cfe9ff', -0.03); U.bubble(ctx, 'ARCHERY', 480, 106, 62, '#fff27a', '#ff9a1f', -0.03 + Math.sin(t * 1.4) * 0.008); }
    else {
      U.bubble(ctx, 'KUDBEE', 480, 92, 42, '#ffffff', '#cfe9ff', -0.03);
      U.bubble(ctx, 'ARCHERY', 480, 178, 92, '#fff27a', '#ff9a1f', -0.03 + Math.sin(t * 1.4) * 0.008);
      U.fit(ctx, 'READ THE WIND  \u00b7  HOLD YOUR BREATH  \u00b7  HIT THE GOLD', 480, 212, U.sz(g, 17), '#ffffff', 900);
    }
    const xl = KAR.Render.XL, xr = -xl;
    U.button(ctx, g, 'gear', 16 + xl, 14, C ? 190 : 170, C ? 60 : 48, 'GEAR \u2605' + KAR.starTotal(D), { small: true, color: 'yellow' });
    U.button(ctx, g, 'trophies', 16 + xl + (C ? 202 : 180), 14, C ? 230 : 200, C ? 60 : 48, 'TROPHIES ' + KAR.achCount(D) + '/' + KAR.ACH.length, { small: true, color: 'yellow' });
    U.button(ctx, g, 'agent', 16 + xl, C ? 84 : 72, C ? 190 : 170, C ? 46 : 44, '    AGENT', { small: true, color: 'blue' });
    this.robin(ctx, 16 + xl + 30, (C ? 84 : 72) + (C ? 23 : 22), C ? 17 : 16, g.time);
    const trick = D.mode === 2, swing = D.mode === 3, daily = D.mode === 4;
    const tour = D.mode === 5;
    const cup = D.mode === 6;
    [[5, 'LEVELS'], [6, 'THE CUP'], [0, 'RANGE'], [1, 'DUEL'], [2, 'BALLOON POP'], [3, 'SWINGER'], [4, 'DAILY']].forEach(([i, n], k) => U.button(ctx, g, 'mode' + i, C ? 36 + (k % 4) * 222 : 22 + k * 132, C ? 126 + Math.floor(k / 4) * 66 : 232, C ? 210 : 124, C ? 58 : 44, n, { small: true, color: D.mode === i ? 'green' : (i >= 5 || i === 4 ? 'yellow' : i >= 2 ? 'red' : 'blue'), selected: D.mode === i }));
    if (cup) this.cupMenu(ctx, g);
    if (tour) {
      const T = D.tour, tot = T.stars.reduce((a, b) => a + b, 0), L = KAR.TOUR[D.tourLv], W = KAR.VENUES[L.v];
      // a medal per world (two rows of four): its stars, and a crown once its boss falls. Phones drop the headline to make room
      if (!C) U.fit(ctx, KAR.VENUES.length + ' WORLDS  \u00b7  ' + KAR.TOUR.length + ' LEVELS  \u00b7  A BOSS AT THE END OF EACH WORLD', 480, 294, U.sz(g, 18), '#ffffff', 900);
      for (let v = 0; v < KAR.VENUES.length; v++) {
        const sp = 226, hw = sp / 2 - 6, x = 480 + ((v % 4) - 1.5) * sp, y = (C ? 300 : 332) + Math.floor(v / 4) * (C ? 68 : 58), ws = T.stars.slice(v * 6, v * 6 + 6).reduce((a, b) => a + b, 0), open = KAR.tourOpen(v * 6, D), done = T.stars[v * 6 + 5] > 0;
        U.rr(ctx, x - hw - 3, y - 26, hw * 2 + 6, (C ? 58 : 48) + 6, 15); ctx.fillStyle = U.OUT; ctx.fill();
        U.rr(ctx, x - hw, y - 23, hw * 2, C ? 58 : 48, 12); ctx.fillStyle = open ? ['#3e7fd0', '#3f8a3c', '#9a4e7a', '#26386e', '#c9802e', '#d9770f', '#8a3fd0', '#1f8f8a'][v] : '#5b6470'; ctx.fill();
        U.fit(ctx, W === KAR.VENUES[v] ? '\u25b8 ' + KAR.VENUES[v].name : KAR.VENUES[v].name, x, y - 1, U.sz(g, 15), '#ffffff', hw * 2 - 16);
        if (open) { const sx = x - 34; U.star(ctx, sx, y + (C ? 21 : 15), C ? 10 : 9, true, 1); U.text(ctx, ws + ' / 18', sx + 15, y + (C ? 28 : 21), U.sz(g, 14), '#ffe9a8', 'left'); if (done) U.crown(ctx, x + hw - 14, y - 24, 10); }
        else this.lock(ctx, x, y + (C ? 22 : 16));
      }
      U.fit(ctx, 'NEXT UP: LEVEL ' + (D.tourLv + 1) + '  \u00b7  ' + L.name + (L.boss ? '  \u00b7  BOSS' : '') + '   \u2605 ' + tot + ' / ' + KAR.TOUR.length * 3, 480, C ? 432 : 438, U.sz(g, 19), '#fff27a', 900);
    }
    if (swing) {
      U.text(ctx, 'THE TARGET HANGS ON ROPES AND SWINGS', 480, 318, 20, '#ffffff', 'center');
      U.fit(ctx, 'lead it  \u00b7  loose as it swings toward your sight  \u00b7  the arc grows every end', 480, 350, U.sz(g, 17), '#ffe9a8', 900);
      U.fit(ctx, '30 m  \u00b7  4 ends of 3 arrows  \u00b7  out of 120', 480, 378, U.sz(g, 17), '#ffe9a8', 900);
      U.text(ctx, 'BEST ' + (D.swingBest || 0), 480, 428, 26, '#fff27a', 'center');
    }
    if (daily) {
      const day = KAR.Daily.day(), dd = D.daily, today = dd.day === day;
      U.text(ctx, 'DAILY #' + day + '  \u00b7  ' + KAR.Daily.date(day), 480, 318, 22, '#ffffff', 'center');
      U.fit(ctx, 'today\'s BALLOON POP: the same wind and balloons for everyone', 480, 350, U.sz(g, 17), '#ffe9a8', 900);
      U.fit(ctx, 'play it, then share your score  \u00b7  a new one every day (UTC)', 480, 378, U.sz(g, 17), '#ffe9a8', 900);
      U.text(ctx, today ? 'TODAY ' + dd.best + '   \u00b7   FIRST TRY ' + dd.first + '   \u00b7   ' + dd.plays + (dd.plays > 1 ? ' PLAYS' : ' PLAY') : 'NOT PLAYED YET TODAY', 480, 428, 24, '#fff27a', 'center');
    }
    if (trick) {
      U.text(ctx, 'BALLOONS DRIFT ACROSS THE RANGE IN THE WIND', 480, 318, 20, '#ffffff', 'center');
      U.fit(ctx, 'lead the movers  \u00b7  pop in a row for a combo  \u00b7  one arrow can pop two', 480, 350, U.sz(g, 17), '#ffe9a8', 900);
      U.fit(ctx, 'gold balloons refill 2 arrows  \u00b7  12 arrows to start', 480, 378, U.sz(g, 17), '#ffe9a8', 900);
      U.text(ctx, 'BEST ' + (D.trickBest || 0), 480, 428, 26, '#fff27a', 'center');
    }
    const plain = D.mode < 2;
    if (plain) U.fit(ctx, 'DISTANCE', 480, 308, U.sz(g, 17), '#ffe9a8', 900);
    if (plain) KAR.CFG.DISTS.forEach((d, i) => {
      const x = 144 + i * 170, lock = KAR.locked(i, D);
      U.button(ctx, g, 'd' + i, x, 316, 156, 46, d + ' M', { small: true, color: D.dist === i && !lock ? 'green' : 'blue', selected: D.dist === i && !lock, disabled: lock });
      if (lock) { const n = D.stars[0] + D.stars[1] + D.stars[2]; U.text(ctx, 'LOCKED', x + 78, 386, 15, '#ffffff', 'center'); U.text(ctx, '\u2605 ' + n + ' / ' + KAR.UNLOCK70 + ' TO OPEN', x + 78, 408, 14, '#ffe9a8', 'center'); return; }
      if (!duel) for (let k = 0; k < 3; k++) U.star(ctx, x + 38 + k * 40, 382, 11, k < D.stars[i], 1);
      if (!duel && D.best[i]) U.text(ctx, 'BEST ' + D.best[i], x + 78, 412, 14, '#ffffff', 'center');
    });
    if (duel) {
      U.fit(ctx, 'CPU SKILL', 480, 396, U.sz(g, 17), '#ffe9a8', 900);
      KAR.LEVELS.forEach((L, i) => U.button(ctx, g, 'lv' + i, 270 + i * 140, 404, 128, 40, L.name, { small: true, color: D.level === i ? 'green' : 'blue', selected: D.level === i }));
    }
    if (tour) U.button(ctx, g, 'play', 330, 452, 300, 70, 'PLAY', { primary: true });
    else if (cup) { const c = D.cup, on = !KAR.Cup.done(c) && c.tier === D.cupTier; U.button(ctx, g, 'play', 330, 452, 300, 70, on ? 'CONTINUE CUP' : 'START CUP', { primary: true }); }
    else if (!cup) U.button(ctx, g, 'play', 330, 462, 300, 70, daily ? 'PLAY TODAY' : swing ? 'START SWINGER' : trick ? 'START POPPING' : duel ? 'START DUEL' : 'START RANGE', { primary: true });
    if (!tour && !cup) U.fit(ctx, (C ? 'touch & hold to draw  \u00b7  drag anywhere to aim  \u00b7  lift to loose' : 'press & hold to draw  \u00b7  move to aim  \u00b7  release to loose'), 480, 568, U.sz(g, 16), '#ffffff', 900);
    if (!C) U.fit(ctx, D.stats.arrows + ' arrows shot  \u00b7  ' + D.stats.tens + ' tens  \u00b7  ' + D.stats.xs + ' X  \u00b7  best streak ' + D.stats.bestStreak + (D.stats.robins ? '  \u00b7  ' + D.stats.robins + ' robin hood' + (D.stats.robins > 1 ? 's' : '') : ''), 480, 594, U.sz(g, 15), '#ffe9a8', 900);
    U.roundIcon(ctx, g, 'mute', 926 + xr - (C ? 4 : 0), C ? 40 : 36, g.audio.muted ? 'mute' : 'sound', C);
    { const qw = C ? 214 : 180, qx = 926 + xr - (C ? 66 : 50) * (g.canFull() ? 3 : 2) - qw / 2 - (C ? 30 : 22), qh = C ? 60 : 48;
      U.button(ctx, g, 'quests', qx - qw / 2, 14, qw, qh, 'QUESTS', { small: true, color: 'blue' });
      this.gem(ctx, qx + qw / 2 - 22, 14 + qh / 2, C ? 11 : 9);
      if (KAR.questClaimable(D)) { ctx.beginPath(); ctx.arc(qx + qw / 2 - 6, 20, 9, 0, 6.283); ctx.fillStyle = '#ff3b4f'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = U.OUT; ctx.stroke(); } }
    const ri = C ? 66 : 50;
    if (g.canFull()) U.roundIcon(ctx, g, 'full', 926 + xr - ri, 40, g.isFull() ? 'unfull' : 'full', true);
    U.roundIcon(ctx, g, 'shareGame', 926 + xr - ri * (g.canFull() ? 2 : 1) - (C ? 4 : 0), C ? 40 : 36, 'share', C);
    // iPhone Safari has no full-screen mode for pages; added to the home screen the game opens full screen
    if (C && g.ios && !g.standalone && !g.canFull()) U.fit(ctx, 'TIP: SHARE \u2192 ADD TO HOME SCREEN TO PLAY FULL SCREEN', 480, 624, U.sz(g, 16), '#ffffff', 900);
  },

  // ---- the GEAR LOCKER: bow finishes, fletching and sight colours, opened by your star total ----
  gearScreen(ctx, g) {
    const U = this, D = KAR.Store.data, S = KAR.starTotal(D);
    U.backdrop(ctx, 0.5);
    U.panel(ctx, 100, 74, 760, 520, 'blue');
    U.ribbon(ctx, 480, 46, 380, 'GEAR LOCKER', 'yellow');
    U.fit(ctx, '\u2605 ' + S + ' STARS EARNED  \u00b7  kit opens as your stars grow  \u00b7  looks only, no stat changes', 480, 136, U.sz(g, 16), '#ffe9a8', 720);
    [['bow', 'BOW'], ['fletch', 'FLETCHING'], ['sight', 'SIGHT']].forEach(([k, label], r) => {
      const y = 152 + r * 122;
      U.text(ctx, label, 128, y + 18, U.sz(g, 16), '#ffffff', 'left');
      KAR.GEAR[k].forEach((it, i) => {
        const x = 128 + i * 142, open = KAR.gearOpen(k, i, D), on = D.gear[k] === i;
        U.button(ctx, g, 'g' + k[0] + i, x, y + 26, 130, 88, '', { small: true, color: on ? 'green' : 'blue', selected: on, disabled: !open });
        if (open) this.swatch(ctx, k, it, x + 65, y + 58);
        else { this.lock(ctx, x + 65, y + 52); }
        U.text(ctx, open ? it.name : '\u2605 ' + it.need, x + 65, y + 104 + (g.coarse ? 2 : 0), U.sz(g, 12), open ? '#ffffff' : '#ffe9a8', 'center');
      });
    });
    U.button(ctx, g, 'shop', 250, 520, 250, 56, 'BOWS & ARROWS', { small: true, color: 'yellow' });
    U.button(ctx, g, 'back', 520, 520, 200, 56, 'BACK', { primary: true });
  },
  // ---- TROPHIES: every lifetime goal with its progress, nine to a page ----
  trophies(ctx, g) {
    const U = this, D = KAR.Store.data, per = 9, pages = Math.ceil(KAR.ACH.length / per), pg = KAR.Util.clamp(g.achPage | 0, 0, pages - 1);
    U.backdrop(ctx, 0.5);
    U.panel(ctx, 70, 74, 820, 530, 'blue');
    U.ribbon(ctx, 480, 46, 380, 'TROPHIES', 'yellow');
    U.fit(ctx, KAR.achCount(D) + ' OF ' + KAR.ACH.length + ' WON  \u00b7  they come from every mode  \u00b7  tap a won one to share it', 480, 132, U.sz(g, 16), '#ffe9a8', 760);
    KAR.ACH.slice(pg * per, pg * per + per).forEach((a, k) => {
      const x = 96 + (k % 3) * 260, y = 148 + Math.floor(k / 3) * 112, v = Math.min(a.n, a.val(D) || 0), done = v >= a.n;
      if (done) { const idx = U.buttons.length; U.buttons.push({ id: 'tsh' + (pg * per + k), x, y, w: 248, h: 102, disabled: false, primary: false }); if (g.focusIdx === idx) { U.rr(ctx, x - 4, y - 4, 256, 110, 16); ctx.lineWidth = 4; ctx.strokeStyle = '#fff6a8'; ctx.stroke(); } }
      U.rr(ctx, x, y, 248, 102, 14); ctx.fillStyle = U.OUT; ctx.fill();
      U.rr(ctx, x + 3, y + 3, 242, 96, 12); ctx.fillStyle = done ? '#c9802e' : '#2c4f86'; ctx.fill();
      this.medal(ctx, x + 40, y + 44, done);
      U.fit(ctx, a.name, x + 76, y + 32, U.sz(g, 16), done ? '#fff6a8' : '#ffffff', done ? 134 : 164, 'left');
      if (done) U.icon(ctx, 'share', x + 226, y + 24, '#fff6a8');
      U.fit(ctx, a.text, x + 76, y + 54, U.sz(g, 13), '#ffe9a8', 164, 'left');
      U.rr(ctx, x + 76, y + 66, 100, 12, 6); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
      if (v > 0) { U.rr(ctx, x + 76, y + 66, Math.max(12, 100 * v / a.n), 12, 6); ctx.fillStyle = done ? '#fff27a' : '#7ac7ff'; ctx.fill(); }
      U.fit(ctx, done ? 'WON' : v + ' / ' + a.n, x + 236, y + 77, U.sz(g, 12), '#ffffff', 54, 'right');
    });
    U.button(ctx, g, 'tprev', 96, 494, 130, 56, '\u2039 PREV', { small: true, color: 'blue', disabled: pg === 0 });
    U.text(ctx, (pg + 1) + ' / ' + pages, 290, 532, U.sz(g, 18), '#ffffff', 'center');
    U.button(ctx, g, 'tnext', 354, 494, 130, 56, 'NEXT \u203a', { small: true, color: 'blue', disabled: pg >= pages - 1 });
    U.button(ctx, g, 'back', 630, 494, 230, 56, 'BACK', { primary: true });
  },
  // ---- SHARE: the brag card the moment made, and where to send it ----
  // phones that can share pictures get one big SHARE PICTURE (the share sheet, with the card attached); everyone
  // gets X / Facebook / WhatsApp (the link unfurls with the card's landing-page image), COPY and SAVE IMAGE
  shareScreen(ctx, g) {
    const U = this, sh = g.shareCv; if (!sh) return;
    U.backdrop(ctx, 0.7);
    const sheet = !!navigator.share && (g.coarse || KAR.Share.canFiles(sh.file)), w = 600, h = Math.round(w * sh.cv.height / sh.cv.width), x = 480 - w / 2, y = 22;
    U.rr(ctx, x - 5, y - 5, w + 10, h + 10, 14); ctx.fillStyle = U.OUT; ctx.fill();
    ctx.save(); U.rr(ctx, x, y, w, h, 10); ctx.clip(); ctx.drawImage(sh.cv, x, y, w, h); ctx.restore();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.8)'; U.rr(ctx, x, y, w, h, 10); ctx.stroke();
    const k = g.sharedKind, fresh = g.time - g.shared < 2.5, y0 = y + h + 22, bh = 58;
    let row = y0;
    if (sheet) { U.button(ctx, g, 'shSheet', 250, row, 460, bh, fresh && k === 'sheet' ? 'SHARING\u2026' : 'SHARE PICTURE', { primary: true }); row += bh + 18; }
    [['shX', 'X'], ['shFB', 'FACEBOOK'], ['shWA', 'WHATSAPP']].forEach(([id, l], i) => U.button(ctx, g, id, 156 + i * 220, row, 208, bh, l, { small: true, color: 'blue', primary: !sheet && i === 0 }));
    row += bh + 18;
    U.button(ctx, g, 'shCopy', 156, row, 208, bh, fresh && k === 'copy' ? 'COPIED!' : 'COPY LINK', { small: true, color: fresh && k === 'copy' ? 'green' : 'yellow' });
    U.button(ctx, g, 'shSave', 376, row, 208, bh, fresh && k === 'save' ? 'SAVED!' : 'SAVE IMAGE', { small: true, color: fresh && k === 'save' ? 'green' : 'yellow' });
    U.button(ctx, g, 'shBack', 596, row, 208, bh, 'BACK', { small: true, color: 'red' });
  },
  // a cut gem (the quest currency), centred on (x, y)
  gem(ctx, x, y, r) {
    ctx.save(); ctx.lineJoin = 'round';
    const P = [[-1, -0.35], [-0.55, -0.85], [0.55, -0.85], [1, -0.35], [0, 1]];
    ctx.beginPath(); P.forEach(([a, b], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, x + a * r, y + b * r)); ctx.closePath();
    ctx.fillStyle = '#3fd2ff'; ctx.fill(); ctx.lineWidth = Math.max(2, r * 0.22); ctx.strokeStyle = this.OUT; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - r, y - 0.35 * r); ctx.lineTo(x + r, y - 0.35 * r); ctx.moveTo(x - 0.3 * r, y - 0.35 * r); ctx.lineTo(x, y + r); ctx.lineTo(x + 0.3 * r, y - 0.35 * r);
    ctx.lineWidth = Math.max(1, r * 0.1); ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 0.55 * r, y - 0.85 * r); ctx.lineTo(x - 0.3 * r, y - 0.35 * r); ctx.lineTo(x + 0.3 * r, y - 0.35 * r); ctx.lineTo(x + 0.55 * r, y - 0.85 * r); ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fill();
    ctx.restore();
  },
  // the gem balance, right-aligned at (x, y), with a +n float after a claim
  gems(ctx, g, x, y) {
    const D = KAR.Store.data, s = '' + D.gems, sz = this.sz(g, 24);
    ctx.save(); ctx.font = '400 ' + sz + 'px ' + this.FONT; const w = ctx.measureText(s).width; ctx.restore();
    this.text(ctx, s, x, y, sz, '#bff4ff', 'right'); this.gem(ctx, x - w - 18, y - 9, 12);
    if (g.gemFx && g.time - g.gemFx.t < 1.2) { const a = (g.time - g.gemFx.t) / 1.2; ctx.save(); ctx.globalAlpha = 1 - a; this.text(ctx, '+' + g.gemFx.n, x, y - 26 - a * 24, this.sz(g, 20), '#9be35a', 'right'); ctx.restore(); }
  },

  // ---- DAILY QUESTS: three a day, each pays gems, all three pays a bonus ----
  quests(ctx, g) {
    const U = this, D = KAR.Store.data, Q = KAR.questToday(D);
    U.backdrop(ctx, 0.5);
    U.panel(ctx, 100, 74, 760, 530, 'blue');
    U.ribbon(ctx, 480, 46, 380, 'DAILY QUESTS', 'yellow');
    const left = 86400000 - Date.now() % 86400000, h = Math.floor(left / 3600000), mn = Math.floor(left % 3600000 / 60000);
    const sk = KAR.streakNow(D), nx = sk + 1, to = [3, 7].find(n => n >= nx) || Math.ceil(nx / 7) * 7;
    U.fit(ctx, 'NEW QUESTS IN ' + h + 'H ' + mn + 'M  ·  DAY STREAK ' + sk + '  ·  day ' + to + ' pays ' + KAR.STREAK_GEMS(to) + ' gems', 450, 132, U.sz(g, 16), '#ffe9a8', 560);
    U.gems(ctx, g, 832, 134);
    Q.q.forEach((x, i) => {
      const d = KAR.questDef(x.id), y = 148 + i * 96, done = x.have >= d.n;
      U.rr(ctx, 128, y, 704, 84, 14); ctx.fillStyle = U.OUT; ctx.fill();
      U.rr(ctx, 131, y + 3, 698, 78, 12); ctx.fillStyle = x.claimed ? '#3a5170' : done ? '#3f8a3c' : '#2c4f86'; ctx.fill();
      U.fit(ctx, d.text.toUpperCase(), 152, y + 34, U.sz(g, 19), '#ffffff', 390, 'left');
      U.rr(ctx, 152, y + 50, 300, 14, 7); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
      if (x.have > 0) { U.rr(ctx, 152, y + 50, Math.max(14, 300 * x.have / d.n), 14, 7); ctx.fillStyle = done ? '#9be35a' : '#7ac7ff'; ctx.fill(); }
      U.text(ctx, x.have + ' / ' + d.n, 466, y + 63, U.sz(g, 15), '#ffffff', 'left');
      this.gem(ctx, 566, y + 40, 12); U.text(ctx, '' + d.gems, 584, y + 49, U.sz(g, 22), '#bff4ff', 'left');
      if (x.claimed) U.text(ctx, '✓ CLAIMED', 728, y + 50, U.sz(g, 20), '#9be35a', 'center');
      else U.button(ctx, g, 'qc' + i, 640, y + 14, 176, 56, done ? 'CLAIM' : 'IN PROGRESS', { small: true, color: done ? 'green' : 'blue', disabled: !done });
    });
    const ready = KAR.questBonusReady(D);
    U.fit(ctx, Q.bonus ? 'ALL THREE DONE  ·  BONUS CLAIMED' : 'CLAIM ALL THREE FOR A BONUS', 152, 474, U.sz(g, 17), '#fff27a', 390, 'left');
    this.gem(ctx, 566, 466, 12); U.text(ctx, '' + KAR.QUEST_BONUS, 584, 475, U.sz(g, 22), '#bff4ff', 'left');
    if (!Q.bonus) U.button(ctx, g, 'qb', 640, 440, 176, 56, 'BONUS', { small: true, color: ready ? 'yellow' : 'blue', disabled: !ready });
    U.button(ctx, g, 'shop', 150, 522, 300, 60, 'BOWS & ARROWS', { small: true, color: 'yellow' });
    U.button(ctx, g, 'back', 610, 522, 220, 60, 'BACK', { primary: true });
  },

  // ---- BOWS & ARROWS: bought with gems; each handles differently (KAR.KIT) ----
  shop(ctx, g) {
    const U = this, D = KAR.Store.data, sel = g.shopSel;
    U.backdrop(ctx, 0.5);
    U.panel(ctx, 60, 74, 840, 546, 'blue');
    U.ribbon(ctx, 480, 46, 420, 'BOWS & ARROWS', 'yellow');
    U.fit(ctx, 'every bow and arrow handles differently  ·  none is simply better', 440, 132, U.sz(g, 16), '#ffe9a8', 600);
    U.gems(ctx, g, 872, 134);
    [['bow', 'BOW', 'kb'], ['arrow', 'ARROWS', 'ka']].forEach(([kind, label, pre], r) => {
      const y = 144 + r * 184;
      U.text(ctx, label, 84, y + 16, U.sz(g, 17), '#ffffff', 'left');
      KAR.KIT[kind].forEach((it, i) => {
        const x = 84 + i * 200, own = KAR.kitOwned(D, kind, i), on = D.kit[kind] === i, picked = sel && sel.kind === kind && sel.i === i;
        U.button(ctx, g, pre + i, x, y + 26, 188, 148, '', { small: true, color: on ? 'green' : picked ? 'yellow' : 'blue', selected: on || picked });
        U.fit(ctx, it.name, x + 94, y + 58, U.sz(g, 16), '#ffffff', 172);
        U.fit(ctx, '+ ' + it.plus, x + 94, y + 88, U.sz(g, 13), '#d6ffb8', 174);
        if (it.minus) U.fit(ctx, '− ' + it.minus, x + 94, y + 112, U.sz(g, 13), '#ffd0c8', 174);
        if (on) U.text(ctx, 'EQUIPPED', x + 94, y + 158, U.sz(g, 15), '#fff27a', 'center');
        else if (own) U.fit(ctx, 'OWNED · TAP TO USE', x + 94, y + 158, U.sz(g, 13), '#ffffff', 172);
        else { this.gem(ctx, x + 78, y + 151, 10); U.text(ctx, '' + it.cost, x + 94, y + 159, U.sz(g, 18), '#bff4ff', 'left'); }
      });
    });
    if (sel) {
      const it = KAR.KIT[sel.kind][sel.i], can = D.gems >= it.cost;
      U.button(ctx, g, 'kbuy', 84, 540, 380, 62, can ? 'BUY ' + it.name : 'NEED ' + (it.cost - D.gems) + ' MORE GEMS', { small: true, color: can ? 'green' : 'blue', disabled: !can, primary: can });
    } else U.fit(ctx, 'tap kit you own to use it  ·  tap new kit, then BUY', 274, 578, U.sz(g, 15), '#ffe9a8', 380);
    U.button(ctx, g, 'shopBack', 650, 540, 226, 62, 'BACK', { primary: !sel || D.gems < KAR.KIT[sel.kind][sel.i].cost });
  },

  // a round gold (won) or grey (not yet) medal with a star
  medal(ctx, x, y, done) {
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, 27, 0, 6.283); ctx.fillStyle = this.OUT; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, 24, 0, 6.283); ctx.fillStyle = done ? '#ffcf3a' : '#77808c'; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, 18, 0, 6.283); ctx.strokeStyle = done ? '#fff1a6' : '#a6aeb8'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.restore();
    this.star(ctx, x, y, 12, done, 1);
  },
  // a newly won trophy: a card that drops in at the top for ~3 s (queued, one at a time)
  achToast(ctx, g) {
    const q = g.achQ; if (!q || !q.length) return;
    const it = q[0]; if (it.t0 === undefined) { it.t0 = g.time; g.audio.gold(it.gem ? 2 : 3); g.buzz([20, 40, 30]); }
    const age = g.time - it.t0; if (age > 3.2) { q.shift(); return; }
    const k = Math.min(1, age / 0.25, (3.2 - age) / 0.3), y = -70 + 84 * k, U = this;
    ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, k));
    U.rr(ctx, 320, y, 320, 64, 16); ctx.fillStyle = U.OUT; ctx.fill();      // clear of the score panel and the round buttons
    U.rr(ctx, 323, y + 3, 314, 58, 13); ctx.fillStyle = '#c9802e'; ctx.fill();
    if (it.gem) this.gem(ctx, 356, y + 32, 18); else this.medal(ctx, 356, y + 32, true);
    U.fit(ctx, (it.title || 'TROPHY!') + '  ' + it.a.name, 392, y + 28, U.sz(g, 18), '#fff6a8', 236, 'left');
    U.fit(ctx, it.a.text, 392, y + 50, U.sz(g, 14), '#ffffff', 236, 'left');
    ctx.restore();
  },

  // a little picture of a gear item, centred on (x, y)
  swatch(ctx, kind, it, x, y) {
    const OUT = this.OUT, col = KAR.Render.TEAM[0];
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (kind === 'bow') {
      const limb = () => { ctx.beginPath(); ctx.moveTo(x - 10, y - 26); ctx.quadraticCurveTo(x + 4, y - 22, x + 6, y); ctx.quadraticCurveTo(x + 4, y + 22, x - 10, y + 26); };
      ctx.beginPath(); ctx.moveTo(x - 10, y - 26); ctx.lineTo(x - 10, y + 26); ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff6e0'; ctx.stroke();
      limb(); ctx.lineWidth = 9; ctx.strokeStyle = OUT; ctx.stroke(); limb(); ctx.lineWidth = 5; ctx.strokeStyle = it.limb; ctx.stroke();
      this.rr(ctx, x + 1, y - 9, 9, 18, 3); ctx.fillStyle = it.riser; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
      for (const sy of [-1, 1]) { ctx.beginPath(); ctx.arc(x - 10, y + sy * 26, 3.5, 0, 6.283); ctx.fillStyle = it.tip || col.base; ctx.fill(); ctx.lineWidth = 1.5; ctx.stroke(); }
    } else if (kind === 'fletch') {
      const v = it.v || [col.light, col.base, col.base];
      ctx.beginPath(); ctx.moveTo(x - 30, y + 8); ctx.lineTo(x + 30, y + 8); ctx.lineWidth = 6; ctx.strokeStyle = OUT; ctx.stroke(); ctx.lineWidth = 3; ctx.strokeStyle = '#f2e6c8'; ctx.stroke();
      v.forEach((c, i) => { const ox = x - 22 + i * 15; ctx.beginPath(); ctx.moveTo(ox, y + 6); ctx.lineTo(ox + 4, y - 16 + i % 2 * 4); ctx.lineTo(ox + 16, y - 12 + i % 2 * 4); ctx.lineTo(ox + 18, y + 6); ctx.closePath(); ctx.fillStyle = c; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke(); });
    } else {
      for (const [w, c] of [[6, 'rgba(0,0,0,0.55)'], [3, it.c]]) {
        ctx.beginPath(); ctx.arc(x, y, 14, 0, 6.283); ctx.lineWidth = w; ctx.strokeStyle = c; ctx.stroke();
        for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 10, y + Math.sin(a) * 10); ctx.lineTo(x + Math.cos(a) * 24, y + Math.sin(a) * 24); ctx.stroke(); }
      }
      ctx.beginPath(); ctx.arc(x, y, 3, 0, 6.283); ctx.fillStyle = it.steady; ctx.fill();
    }
    ctx.restore();
  },

  // ---- THE CUP ----------------------------------------------------------------------------
  // a little trophy cup: handles, a bowl, a stem and a base, in the cup's metal
  cupIcon(ctx, x, y, u, col, dim) {
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2, u * 0.16); ctx.strokeStyle = this.OUT;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(x + s * u * 0.78, y - u * 0.45, u * 0.34, 0, 6.283); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(x - u * 0.82, y - u * 0.95); ctx.lineTo(x + u * 0.82, y - u * 0.95); ctx.quadraticCurveTo(x + u * 0.8, y + u * 0.15, x, y + u * 0.3); ctx.quadraticCurveTo(x - u * 0.8, y + u * 0.15, x - u * 0.82, y - u * 0.95); ctx.closePath();
    const g = ctx.createLinearGradient(x - u, 0, x + u, 0); g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, dim ? '#8a929c' : col); g.addColorStop(1, dim ? '#5b6470' : col);
    ctx.fillStyle = g; ctx.fill(); ctx.stroke();
    ctx.fillStyle = dim ? '#5b6470' : col; ctx.fillRect(x - u * 0.12, y + u * 0.28, u * 0.24, u * 0.4); ctx.strokeRect(x - u * 0.12, y + u * 0.28, u * 0.24, u * 0.4);
    this.rr(ctx, x - u * 0.55, y + u * 0.66, u * 1.1, u * 0.34, u * 0.08); ctx.fill(); ctx.stroke();
    ctx.restore();
  },
  // the menu's CUP page: the three cups (BRONZE / SILVER / GOLD, each opened by winning the one before) and the cup
  // in progress
  cupMenu(ctx, g) {
    const U = this, D = KAR.Store.data, C = g.coarse, c = D.cup, y = C ? 266 : 300, h = C ? 118 : 104;
    KAR.CUPS.forEach((cp, i) => {
      const x = 480 + (i - 1) * 296 - 136, open = KAR.Cup.open(i, D), sel = D.cupTier === i;
      U.button(ctx, g, 'cup' + i, x, y, 272, h, '', { small: true, color: sel ? 'green' : 'blue', selected: sel, disabled: !open });
      this.cupIcon(ctx, x + 44, y + h / 2 + 4, C ? 30 : 26, cp.col, !open);
      U.fit(ctx, cp.name, x + 168, y + 34, U.sz(g, 22), '#ffffff', 186);
      U.fit(ctx, cp.dists.map(d => KAR.CFG.DISTS[d]).join(' · ') + ' M', x + 168, y + 62, U.sz(g, 16), '#ffe9a8', 186);
      if (!open) { this.lock(ctx, x + 252, y + 22); U.fit(ctx, 'WIN ' + KAR.CUPS[i - 1].name + ' FIRST', x + 168, y + 88, U.sz(g, 15), '#ffffff', 186); }
      else U.fit(ctx, D.cupWon[i] ? 'WON ×' + D.cupWon[i] : 'PRIZE ' + cp.gems + ' GEMS', x + 168, y + 88, U.sz(g, 16), D.cupWon[i] ? '#9be35a' : '#ffffff', 186);
      if (open && !D.cupWon[i]) this.gem(ctx, x + 252, y + 22, 8);
    });
    const on = !KAR.Cup.done(c) && c.tier === D.cupTier;
    U.fit(ctx, on ? KAR.CUPS[c.tier].name + ' IN PROGRESS  ·  ' + KAR.CUP_ROUNDS[c.round] + ' VS ' + KAR.RIVALS[KAR.Cup.opponent(c)].name + '  ·  ' + KAR.CFG.DISTS[KAR.Cup.dist(c)] + ' M'
      : '8 ARCHERS  ·  3 KNOCKOUT ROUNDS  ·  DUELS TO 6 SET POINTS  ·  WIN THE CUP', 480, C ? 412 : 432, U.sz(g, 18), on ? '#fff27a' : '#ffffff', 900);
  },
  // the bracket: quarter-finals (8), semis (4), final (2) and the winner, filled in as far as the cup has gone. You are
  // the gold name; someone knocked out is dimmed in the rounds after
  bracket(ctx, g, c, x0, y0, w, h) {
    const U = this, cols = 4, cw = w / cols, nm = i => (i === -1 ? 'YOU' : KAR.RIVALS[i].name), fs = U.sz(g, 14);
    const slotY = (n, j) => y0 + (j + 0.5) * h / (8 >> n);
    ctx.save(); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    for (let n = 0; n < 3; n++) {
      const a = n <= c.round ? KAR.Cup.alive(c, n) : Array(8 >> n).fill(null), nx = n < c.round ? c.res[n] : null;      // (rounds not reached yet: empty slots)
      for (let j = 0; j < a.length; j++) {
        const x = x0 + n * cw, y = slotY(n, j), won = nx && nx.indexOf(a[j]) >= 0, me = a[j] === -1, nm2 = a[j] === null ? '' : nm(a[j]);
        // the bracket lines on to the next round
        ctx.beginPath(); ctx.moveTo(x + cw - 6, y); ctx.lineTo(x + cw + 2, y); ctx.lineTo(x + cw + 2, slotY(n + 1, j >> 1)); ctx.stroke();
        U.rr(ctx, x, y - 11, cw - 8, 22, 7); ctx.fillStyle = me ? 'rgba(255,211,77,0.35)' : won ? 'rgba(155,227,90,0.25)' : 'rgba(0,0,0,0.25)'; ctx.fill();
        U.fit(ctx, nm2, x + (cw - 8) / 2, y + 6, fs, nx && !won ? 'rgba(255,255,255,0.45)' : me ? '#fff27a' : '#ffffff', cw - 14);
      }
    }
    const x = x0 + 3 * cw, y = slotY(3, 0), champ = c.round >= 3 ? c.res[2][0] : null;
    this.cupIcon(ctx, x + cw / 2, y - 26, 16, KAR.CUPS[c.tier].col, champ === null);
    U.rr(ctx, x, y - 2, cw - 4, 24, 7); ctx.fillStyle = champ === -1 ? 'rgba(255,211,77,0.5)' : 'rgba(0,0,0,0.25)'; ctx.fill();
    U.fit(ctx, champ === null ? '?' : nm(champ), x + (cw - 4) / 2, y + 16, fs, champ === -1 ? '#fff27a' : '#ffffff', cw - 10);
    ctx.restore();
  },
  // the results card after a cup tie: the tie, where it leaves you, and the bracket so far
  overCup(ctx, g) {
    const U = this, m = g.match, T = g.overlayT, D = KAR.Store.data, c = D.cup, k = KAR.Util.easeOut(Math.min(1, T * 2.2)), won = m.winner === 0;
    const champ = c && c.won, out = c && c.out, cp = KAR.CUPS[m.cup.tier];
    U.backdrop(ctx, Math.min(0.55, T * 1.4));
    ctx.save(); ctx.translate(480, 320); ctx.scale(0.86 + 0.14 * k, 0.86 + 0.14 * k); ctx.translate(-480, -320); ctx.globalAlpha = k;
    U.panel(ctx, 190, 104, 580, 430, won ? 'blue' : 'red');
    U.ribbon(ctx, 480, 76, 460, champ ? cp.name + ' WINNER!' : won ? KAR.CUP_ROUNDS[m.cup.round] + ' WON!' : 'KNOCKED OUT', won ? 'green' : 'red');
    U.fit(ctx, 'YOU ' + m.total(0) + ' – ' + m.total(1) + ' ' + m.cup.name + '   ·   SETS ' + m.sets[0] + ' – ' + m.sets[1] + '   ·   ' + m.dist + ' M', 480, 160, U.sz(g, 19), '#ffe9a8', won ? 440 : 540);
    if (won) { U.roundIcon(ctx, g, 'shareCup', 740, 140, 'share', g.coarse); U.text(ctx, 'SHARE', 740, g.coarse ? 192 : 184, U.sz(g, 14), '#ffffff', 'center'); }
    if (c) this.bracket(ctx, g, c, 214, 186, 532, 216);
    const line = champ ? (g.cupGems ? '+' + g.cupGems + ' GEMS  ·  ' : '') + (c.tier < 2 && D.cupWon[c.tier] === 1 ? KAR.CUPS[c.tier + 1].name + ' OPEN!' : 'CHAMPION!')
      : out ? KAR.RIVALS[c.res[2][0]] ? KAR.RIVALS[c.res[2][0]].name + ' WON THE CUP' : '' : 'NEXT: ' + KAR.CUP_ROUNDS[c.round] + ' VS ' + KAR.RIVALS[KAR.Cup.opponent(c)].name + ' AT ' + KAR.CFG.DISTS[KAR.Cup.dist(c)] + ' M';
    U.fit(ctx, line, 480, 428, U.sz(g, 20), champ ? '#9be35a' : '#ffffff', 540);
    if (!KAR.Cup.done(c)) {
      U.button(ctx, g, 'next', 250, 450, 280, 56, 'NEXT ROUND', { primary: true });
      U.button(ctx, g, 'menu', 560, 450, 150, 56, 'MENU', { small: true, color: 'yellow' });
    } else {
      U.button(ctx, g, 'rematch', 250, 450, 280, 56, 'NEW CUP', { primary: true });
      U.button(ctx, g, 'menu', 560, 450, 150, 56, 'MENU', { small: true, color: 'yellow' });
    }
    ctx.restore();
  },

  // the LEVEL MAP, one world per page (like the Kudbee Birds worlds): six big tiles, the boss last with a crown,
  // < 1/4 > to page (or swipe), BACK to the menu. A tile shows its number, name and stars, or a padlock.
  levels(ctx, g) {
    const U = this, D = KAR.Store.data, T = D.tour, v = g.worldView | 0, W = KAR.VENUES[v], C = g.coarse, xl = KAR.Render.XL;
    U.bubble(ctx, 'WORLD ' + (v + 1), 480, 70, 58, '#ffffff', '#cfe9ff', -0.02);
    U.text(ctx, W.name, 480, 108, 28, '#fff27a', 'center');
    const ws = T.stars.slice(v * 6, v * 6 + 6).reduce((a, b) => a + b, 0);
    U.fit(ctx, W.sub + '   \u2605 ' + ws + ' / 18', 480, 136, U.sz(g, 16), '#ffffff', 700);
    // the tiles leave gaps between them, so the world's hills and props show through (still big taps on a phone)
    for (let j = 0; j < 6; j++) {
      const i = v * 6 + j, L = KAR.TOUR[i], x = 118 + (j % 3) * 262, y = 160 + Math.floor(j / 3) * 160, open = KAR.tourOpen(i, D), sel = D.tourLv === i;
      U.button(ctx, g, 'L' + String(i).padStart(2, '0'), x, y, 200, 132, '', { small: true, color: sel ? 'green' : L.boss ? 'yellow' : 'blue', selected: sel, disabled: !open, primary: sel });   // primary: keyboard focus starts on it
      if (L.boss) { U.crown(ctx, x + 172, y + 26, 13); U.text(ctx, 'BOSS', x + 172, y + 58, U.sz(g, 14), '#ffffff', 'center'); }
      U.text(ctx, String(i + 1), x + 100, y + 60, 50, open ? '#ffffff' : '#e6e9ee', 'center');
      if (!open) { const why = L.after !== undefined && j === 0 ? 'BEAT LEVEL ' + (L.after + 1) : ''; this.lock(ctx, x + 100, y + (why ? 88 : 98)); if (why) U.fit(ctx, why, x + 100, y + 122, U.sz(g, 15), '#ffffff', 186); continue; }
      U.fit(ctx, L.name, x + 100, y + 88, U.sz(g, 16), '#ffffff', 180);
      for (let k = 0; k < 3; k++) U.star(ctx, x + 66 + k * 34, y + 112, 12, k < T.stars[i], 1);
    }
    const n = KAR.VENUES.length;
    U.button(ctx, g, 'wprev', 352, 506, 82, 68, '', { color: v > 0 ? 'blue' : 'grey', disabled: v === 0 });
    U.icon(ctx, 'prev', 393, 540, '#ffffff');
    U.text(ctx, (v + 1) + ' / ' + n, 480, 552, 26, '#ffffff', 'center');
    U.button(ctx, g, 'wnext', 526, 506, 82, 68, '', { color: v < n - 1 ? 'blue' : 'grey', disabled: v === n - 1 });
    U.icon(ctx, 'next', 567, 540, '#ffffff');
    U.button(ctx, g, 'back', 24 + xl, 510, 180, 64, 'BACK', { small: true, color: 'yellow' });
    if (C) U.text(ctx, 'or swipe', 480, 604, 17, '#ffffff', 'center');
  },
  // a little gold crown (the boss levels)
  crown(ctx, x, y, u) {
    ctx.save(); ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(x - u, y + u * 0.6); ctx.lineTo(x - u * 1.1, y - u * 0.6); ctx.lineTo(x - u * 0.45, y - u * 0.05); ctx.lineTo(x, y - u * 0.8); ctx.lineTo(x + u * 0.45, y - u * 0.05); ctx.lineTo(x + u * 1.1, y - u * 0.6); ctx.lineTo(x + u, y + u * 0.6); ctx.closePath();
    const cg = ctx.createLinearGradient(0, y - u, 0, y + u); cg.addColorStop(0, '#fff09a'); cg.addColorStop(1, '#ffb11f'); ctx.fillStyle = cg; ctx.fill();
    ctx.lineWidth = Math.max(2, u * 0.2); ctx.strokeStyle = this.OUT; ctx.stroke();
    ctx.restore();
  },
  lock(ctx, x, y) {
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x, y - 5, 6.5, Math.PI, 0); ctx.lineWidth = 6; ctx.strokeStyle = this.OUT; ctx.stroke(); ctx.lineWidth = 3; ctx.strokeStyle = '#e6e9ee'; ctx.stroke();
    this.rr(ctx, x - 10, y - 5, 20, 15, 3); ctx.fillStyle = '#e6e9ee'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = this.OUT; ctx.stroke();
    ctx.fillStyle = this.OUT; ctx.fillRect(x - 1.5, y, 3, 5);
    ctx.restore();
  },

  overTrick(ctx, g) {
    const U = this, m = g.match, T = g.overlayT, k = KAR.Util.easeOut(Math.min(1, T * 2.2));
    U.backdrop(ctx, Math.min(0.55, T * 1.4));
    ctx.save(); ctx.translate(480, 320); ctx.scale(0.86 + 0.14 * k, 0.86 + 0.14 * k); ctx.translate(-480, -320); ctx.globalAlpha = k;
    U.panel(ctx, 240, 104, 480, 430, g.newBest ? 'blue' : 'red');
    U.ribbon(ctx, 480, 76, 400, m.daily ? 'DAILY #' + m.daily : 'OUT OF ARROWS', g.newBest ? 'green' : 'red');
    U.text(ctx, String(m.score), 480, 226, 86, '#ffffff', 'center');
    U.fit(ctx, m.popped + ' POPPED   \u00b7   BEST COMBO \u00d7' + Math.max(1, Math.min(5, m.bestCombo)) + '   \u00b7   ' + m.arrowNo + ' ARROWS', 480, 266, U.sz(g, 19), '#ffe9a8', 450);
    if (m.daily) {
      const dd = KAR.Store.data.daily;
      U.text(ctx, g.newBest && dd.plays > 1 ? 'NEW BEST TODAY!' : 'TODAY\'S BEST ' + dd.best, 480, 322, 30, g.newBest && dd.plays > 1 ? '#fff27a' : '#ffffff', 'center');
      U.fit(ctx, 'same balloons for everyone today  \u00b7  first try ' + dd.first, 480, 352, U.sz(g, 17), '#ffe9a8', 450);
      U.button(ctx, g, 'share', 330, 376, 300, 52, 'SHARE SCORE', { small: true, color: 'yellow' });
    } else if (g.newBest && m.score > 0) U.text(ctx, 'NEW BEST!', 480, 340, 40, '#fff27a', 'center');
    else U.text(ctx, 'BEST ' + (KAR.Store.data.trickBest || 0), 480, 340, 28, '#ffffff', 'center');
    U.button(ctx, g, 'rematch', 270, 450, 270, 56, m.daily ? 'TRY AGAIN' : 'PLAY AGAIN', { primary: true });
    U.button(ctx, g, 'menu', 560, 450, 150, 56, 'MENU', { small: true, color: 'yellow' });
    ctx.restore();
  },

  overStage(ctx, g) {
    const U = this, m = g.match, T = g.overlayT, st = m.stars(), won = st >= 1, D = KAR.Store.data, last = m.lv === KAR.TOUR.length - 1;
    const side = g.sideOpen;           // side: a side world this win opened; g.tourDone: this win beat the last boss standing
    U.backdrop(ctx, Math.min(0.55, T * 1.4));
    const k = KAR.Util.easeOut(Math.min(1, T * 2.2));
    ctx.save(); ctx.translate(480, 320); ctx.scale(0.86 + 0.14 * k, 0.86 + 0.14 * k); ctx.translate(-480, -320); ctx.globalAlpha = k;
    U.panel(ctx, 240, 104, 480, 430, won ? 'blue' : 'red');
    const boss = !!m.def.boss;
    U.ribbon(ctx, 480, 76, 440, won ? (g.tourDone ? 'TOUR COMPLETE!' : boss ? 'WORLD ' + (m.venue + 1) + ' COMPLETE!' : 'LEVEL CLEARED!') : 'NOT THIS TIME', won ? 'green' : 'red');
    U.fit(ctx, KAR.VENUES[m.venue].name + '  \u00b7  ' + m.def.name, 480, 166, U.sz(g, 19), '#ffe9a8', 450);
    U.text(ctx, String(m.total(0)), 480, 236, 80, '#ffffff', 'center');
    U.fit(ctx, 'OUT OF ' + m.max + '   \u00b7   ' + m.xs(0) + ' X   \u00b7   ' + m.dist + ' M', 480, 268, U.sz(g, 19), '#ffe9a8', 450);
    for (let i = 0; i < 3; i++) U.star(ctx, 480 + (i - 1) * 78, 330 - (i === 1 ? 14 : 0), i === 1 ? 38 : 30, i < st, T > 0.4 + i * 0.3 ? 1 : 0.01);
    const S = m.def.stars, msg = side !== undefined && g.unlocked ? ['WORLD ' + (m.venue + 2) + ' + ' + KAR.VENUES[side].name + ' OPEN!', '#9be35a', 26] : side !== undefined ? [KAR.VENUES[side].name + ' WORLD OPEN!', '#9be35a', 26]
      : g.unlocked ? (boss ? ['WORLD ' + (m.venue + 2) + ' OPEN: ' + KAR.VENUES[m.venue + 1].name, '#9be35a', 26] : ['LEVEL ' + (m.lv + 2) + ' UNLOCKED!', '#9be35a', 28]) : g.newBest && m.total(0) > 0 ? ['NEW BEST!', '#fff27a', 28]
      : !won ? [(S[0] - m.total(0)) + ' MORE TO CLEAR IT', '#ffffff', 22] : st < 3 ? [(S[st] - m.total(0)) + ' MORE FOR ' + (st + 1) + ' STARS', '#ffffff', 20] : ['PERFECT', '#fff27a', 28];
    U.fit(ctx, msg[0], 480, 394, msg[2], msg[1], 450);
    if (g.newGear && g.newGear.length) U.fit(ctx, 'NEW GEAR: ' + g.newGear.map(n => n.name + (n.kind === 'bow' ? ' BOW' : n.kind === 'sight' ? ' SIGHT' : ' FLETCHING')).join(' \u00b7 '), 480, 426, U.sz(g, 16), '#9be35a', 450);
    else U.fit(ctx, '\u2605 ' + S[0] + '   \u2605\u2605 ' + S[1] + '   \u2605\u2605\u2605 ' + S[2] + '   \u00b7   ENDS  ' + m.endScores.map(e => e[0]).join(' '), 480, 426, U.sz(g, 15), '#ffffff', 450);
    this.group(ctx, g, 318, 246, 50); this.starGems(ctx, g, 640, 330);
    if (won) { U.roundIcon(ctx, g, 'shareLevel', 690, 140, 'share', g.coarse); U.text(ctx, 'SHARE', 690, g.coarse ? 192 : 184, U.sz(g, 14), '#ffffff', 'center'); }
    // NEXT never walks into a side world (THINK BOX after the world 4 boss): that one is picked on the map
    const next = !last && KAR.tourOpen(m.lv + 1, D) && KAR.TOUR[m.lv + 1].after === undefined;
    if (next && won) {
      U.button(ctx, g, 'next', 256, 450, 210, 56, 'NEXT LEVEL', { primary: true });
      U.button(ctx, g, 'rematch', 480, 450, 116, 56, 'RETRY', { small: true });
      U.button(ctx, g, 'levels', 610, 450, 104, 56, 'LEVELS', { small: true, color: 'yellow' });
    } else if (next) {
      U.button(ctx, g, 'rematch', 256, 450, 210, 56, 'TRY AGAIN', { primary: true });
      U.button(ctx, g, 'next', 480, 450, 116, 56, 'SKIP', { small: true });
      U.button(ctx, g, 'levels', 610, 450, 104, 56, 'LEVELS', { small: true, color: 'yellow' });
    } else {
      U.button(ctx, g, 'rematch', 270, 450, 270, 56, won ? 'PLAY AGAIN' : 'TRY AGAIN', { primary: true });
      U.button(ctx, g, 'levels', 560, 450, 150, 56, 'LEVELS', { small: true, color: 'yellow' });
    }
    ctx.restore();
  },

  pause(ctx, g) {
    const U = this;
    U.backdrop(ctx, 0.55);
    const extra = [], stage = g.match.mode === 'stage';
    if (g.coarse) extra.push(['aim', 'AIM SPEED: ' + KAR.CFG.AIM_NAMES[KAR.Store.data.aimSpeed]]);
    if (stage) extra.push(['levels', 'LEVELS']);
    if (g.coarse && navigator.vibrate) extra.push(['buzz', KAR.Store.data.haptics ? 'VIBRATE: ON' : 'VIBRATE: OFF']);
    if (g.canFull()) extra.push(['full', g.isFull() ? 'EXIT FULL SCREEN' : 'FULL SCREEN']);
    if (extra.length) {                       // phones: two columns so every button stays big
      const rows = Math.ceil((4 + extra.length) / 2);
      U.panel(ctx, 170, 130, 620, 190 + rows * 74, 'blue');
      U.ribbon(ctx, 480, 106, 300, 'PAUSED', 'yellow');
      U.button(ctx, g, 'resume', 220, 210, 520, 70, 'RESUME', { primary: true });
      [['restart', 'RESTART', 'blue'], ['menu', 'MENU', 'yellow'], ['mute', g.audio.muted ? 'SOUND: OFF' : 'SOUND: ON', 'blue'], ['agent', 'ASK THE AGENT', 'green']].concat(extra.map(e => e.concat('blue')))
        .forEach(([id, label, col], k) => U.button(ctx, g, id, 220 + (k % 2) * 270, 304 + Math.floor(k / 2) * 74, 250, 60, label, { small: true, color: col }));
      return;
    }
    U.panel(ctx, 290, 130, 380, stage ? 496 : 430, 'blue');
    U.ribbon(ctx, 480, 106, 300, 'PAUSED', 'yellow');
    U.button(ctx, g, 'resume', 340, 214, 280, 62, 'RESUME', { primary: true });
    if (stage) U.button(ctx, g, 'levels', 340, 558, 280, 50, 'LEVELS  (back to the map)', { small: true, color: 'yellow' });
    U.button(ctx, g, 'restart', 340, 294, 280, 50, 'RESTART', { small: true });
    U.button(ctx, g, 'menu', 340, 360, 280, 50, 'MENU', { small: true, color: 'yellow' });
    U.button(ctx, g, 'mute', 340, 426, 280, 50, g.audio.muted ? 'SOUND: OFF' : 'SOUND: ON', { small: true });
    U.button(ctx, g, 'agent', 340, 492, 280, 50, 'ASK THE AGENT  (/)', { small: true, color: 'green' });
  },

  over(ctx, g) {
    const U = this, m = g.match, T = g.overlayT, duel = m.mode === 'duel';
    if (m.mode === 'trick') return this.overTrick(ctx, g);
    if (m.mode === 'stage') return this.overStage(ctx, g);
    if (m.cup) return this.overCup(ctx, g);
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
      if (g.newGear && g.newGear.length) U.text(ctx, 'NEW GEAR: ' + g.newGear.map(n => n.name).join(' \u00b7 '), 480, 396, g.unlocked ? 18 : 22, '#9be35a', 'center');
      if (g.unlocked) U.text(ctx, '70 M UNLOCKED!', 480, g.newGear && g.newGear.length ? 376 : 396, 30, '#9be35a', 'center');
      else if (g.newBest) U.text(ctx, 'NEW BEST!', 480, 392, 28, '#fff27a', 'center');
    }
    if (!duel) { this.group(ctx, g, 318, 236, 50); this.starGems(ctx, g, 640, 330); }
    const ends = m.endScores.map((e, i) => (duel ? e[0] + ':' + e[1] : String(e[0]))).join('   ');
    U.fit(ctx, 'ENDS  ' + ends, 480, 420, U.sz(g, 17), '#ffffff', 450);
    U.button(ctx, g, 'rematch', 270, 450, 270, 56, 'PLAY AGAIN', { primary: true });
    U.button(ctx, g, 'menu', 560, 450, 150, 56, 'MENU', { small: true, color: 'yellow' });
    ctx.restore();
  },

  // the round's arrows on a little target face (results card): where each of yours landed, the gold ones bright
  group(ctx, g, cx, cy, rr) {
    const m = g.match, hits = m.arrows[0].filter(a => a.hit && a.hit.z === undefined), half = (m.faceD || KAR.CFG.FACE[m.distIdx]) / 2;
    if (!m.arrows[0].length) return;
    const cols = ['#ffd34d', '#ffd34d', '#e8483a', '#e8483a', '#4aa3f0', '#4aa3f0', '#222b38', '#222b38', '#f4f1e8', '#f4f1e8'];
    for (let i = 10; i >= 1; i--) { ctx.beginPath(); ctx.arc(cx, cy, rr * i / 10, 0, 6.283); ctx.fillStyle = cols[i - 1]; ctx.fill(); }
    ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 6.283); ctx.lineWidth = 3.5; ctx.strokeStyle = this.OUT; ctx.stroke();
    hits.forEach((a, i) => {
      const f = rr / half, dx = KAR.Util.clamp(a.hit.x * f, -rr - 6, rr + 6), dy = KAR.Util.clamp(-(a.hit.y - KAR.CFG.FACE_Y) * f, -rr - 6, rr + 6), t = g.overlayT - 0.3 - i * 0.05;
      if (t <= 0) return;
      ctx.beginPath(); ctx.arc(cx + dx, cy + dy, 4.2 * Math.min(1, t * 6), 0, 6.283); ctx.fillStyle = a.ring >= 9 ? '#ffffff' : '#9be35a'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = this.OUT; ctx.stroke();
    });
    const off = m.arrows[0].length - hits.length;
    this.fit(ctx, off ? off + ' OFF THE FACE' : 'YOUR GROUP', cx, cy + rr + 20, this.sz(g, 13), '#ffe9a8', 100);
  },
  // gems paid for the stars this round earned for the first time (results card)
  starGems(ctx, g, x, y) {
    const n = g.starGemsWon; if (!n || g.overlayT < 1.2) return;
    const k = KAR.Util.easeOut(Math.min(1, (g.overlayT - 1.2) * 3));
    ctx.save(); ctx.globalAlpha = k; this.gem(ctx, x, y - 7, 13); this.text(ctx, '+' + n, x + 20, y + 2, this.sz(g, 22), '#bff4ff', 'left');
    this.text(ctx, 'NEW STARS', x - 12, y + 26, this.sz(g, 12), '#bff4ff', 'left'); ctx.restore();
  },
  // a tour level's card while you get set: the level, its twist, and the scores for each star (your best beside them)
  levelCard(ctx, g) {
    const m = g.match;
    if (m.mode !== 'stage' || g.coach || g.screen !== 'play' || m.arrows[0].length || m.endNo) return;
    const age = g.time - g.introT, life = 4.2, k = Math.min(1, age / 0.25, (life - age) / 0.4) * (g.drawing ? 0 : 1);
    if (age > life || k <= 0) return;
    const U = this, L = m.def, D = KAR.Store.data, S = L.stars, best = D.tour.best[m.lv], cw = 460, cx = 480 - cw / 2, cy = 168, ch = 178;
    ctx.save(); ctx.globalAlpha = k; ctx.translate(480, cy + ch / 2); const sc = g.calm ? 1 : 0.9 + 0.1 * Math.min(1, age / 0.25); ctx.scale(sc, sc); ctx.translate(-480, -(cy + ch / 2));
    U.rr(ctx, cx, cy, cw, ch, 20); ctx.fillStyle = U.OUT; ctx.fill();
    const cg = ctx.createLinearGradient(0, cy, 0, cy + ch); cg.addColorStop(0, L.boss ? '#ffcf55' : '#5a86c9'); cg.addColorStop(1, L.boss ? '#e0901f' : '#2c4f86');
    U.rr(ctx, cx + 4, cy + 4, cw - 8, ch - 8, 16); ctx.fillStyle = cg; ctx.fill();
    if (L.boss) U.crown(ctx, cx + cw - 40, cy + 34, 15);
    U.text(ctx, (L.boss ? 'BOSS  \u00b7  ' : '') + 'LEVEL ' + (m.lv + 1), 480, cy + 38, U.sz(g, 18), '#ffffff', 'center');
    U.fit(ctx, L.name, 480, cy + 76, 36, '#fff27a', cw - 100);
    U.fit(ctx, L.tip.toUpperCase(), 480, cy + 104, U.sz(g, 15), '#ffffff', cw - 40);
    U.fit(ctx, m.dist + ' M  \u00b7  ' + m.ends + ' ENDS  \u00b7  OUT OF ' + m.max + (best ? '  \u00b7  YOUR BEST ' + best : ''), 480, cy + 128, U.sz(g, 14), '#ffe9a8', cw - 40);
    for (let i = 0; i < 3; i++) {
      const x = 480 + (i - 1) * 140, got = D.tour.stars[m.lv] > i;
      for (let j = 0; j <= i; j++) U.star(ctx, x - 12 - (i - j) * 22, cy + 150, 10, got, 1);       // the stars, then the score for them
      U.text(ctx, String(S[i]), x + 4, cy + 158, U.sz(g, 20), got ? '#fff27a' : '#ffffff', 'left');
    }
    ctx.restore();
  },

  // ROBIN, the agent: a round little robin redbreast with a feathered cap (bobs as it talks)
  robin(ctx, x, y, r, t) {
    const U = this, b = Math.sin((t || 0) * 3) * r * 0.05;
    ctx.save(); ctx.translate(x, y + b); ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(-r * 0.9, r * 0.2); ctx.lineTo(-r * 1.35, r * 0.65); ctx.lineTo(-r * 0.7, r * 0.6); ctx.closePath(); ctx.fillStyle = '#7a4a24'; ctx.fill(); ctx.lineWidth = Math.max(2, r * 0.12); ctx.strokeStyle = U.OUT; ctx.stroke();   // tail
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.fillStyle = '#8a5a2e'; ctx.fill(); ctx.stroke();
    ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.clip();
    ctx.beginPath(); ctx.ellipse(r * 0.25, r * 0.35, r * 0.72, r * 0.68, 0, 0, 6.283); ctx.fillStyle = '#ff7a2e'; ctx.fill();     // the red breast
    ctx.beginPath(); ctx.ellipse(r * 0.3, r * 0.95, r * 0.6, r * 0.35, 0, 0, 6.283); ctx.fillStyle = '#fff1dc'; ctx.fill();
    ctx.restore();
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(r * 0.85, -r * 0.05); ctx.lineTo(r * 1.35, r * 0.08); ctx.lineTo(r * 0.82, r * 0.25); ctx.closePath(); ctx.fillStyle = '#ffc93a'; ctx.fill(); ctx.lineWidth = Math.max(1.5, r * 0.09); ctx.stroke();   // beak
    ctx.beginPath(); ctx.arc(r * 0.42, -r * 0.25, r * 0.2, 0, 6.283); ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.48, -r * 0.24, r * 0.11, 0, 6.283); ctx.fillStyle = U.OUT; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-r * 0.75, -r * 0.6); ctx.quadraticCurveTo(0, -r * 1.25, r * 0.7, -r * 0.62); ctx.quadraticCurveTo(0, -r * 0.85, -r * 0.75, -r * 0.6); ctx.fillStyle = '#3f8a3c'; ctx.fill(); ctx.lineWidth = Math.max(1.5, r * 0.09); ctx.stroke();   // a Robin Hood cap
    ctx.beginPath(); ctx.moveTo(-r * 0.2, -r * 0.95); ctx.quadraticCurveTo(-r * 0.6, -r * 1.6, -r * 1.05, -r * 1.55); ctx.lineWidth = Math.max(2, r * 0.14); ctx.strokeStyle = '#e8483a'; ctx.stroke();   // feather
    ctx.restore();
  },

  // word-wrapped small print, left-aligned; returns the y under the last line
  wrap(ctx, s, x, y, maxW, size, color, lh, maxLines) {
    ctx.save(); ctx.font = '400 ' + size + 'px ' + this.FONT;
    const words = s.split(' '), lines = []; let cur = '';
    for (const wd of words) { const t = cur ? cur + ' ' + wd : wd; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = wd; } else cur = t; }
    if (cur) lines.push(cur);
    ctx.restore();
    lines.slice(0, maxLines || 9).forEach((l, i) => this.text(ctx, l, x, y + i * lh, size, color, 'left'));
    return y + Math.min(lines.length, maxLines || 9) * lh;
  },

  // ---- THE AGENT: what ROBIN sees in your last arrows, and what to do next ----
  agent(ctx, g) {
    const U = this, D = KAR.Store.data, A = KAR.Agent, log = g.agentLog || [], tips = A.read(log), plan = A.plan(D, tips);
    U.backdrop(ctx, 0.55);
    U.panel(ctx, 60, 74, 840, 534, 'blue');
    U.ribbon(ctx, 480, 46, 440, 'YOUR AGENT', 'green');
    // left: ROBIN and your last arrows on a little target (dots = where each landed, newest brightest)
    const cx = 196, cy = 268, rr = 104;
    for (let i = 10; i >= 1; i--) { ctx.beginPath(); ctx.arc(cx, cy, rr * i / 10, 0, 6.283); ctx.fillStyle = ['#ffd34d', '#ffd34d', '#e8483a', '#e8483a', '#4aa3f0', '#4aa3f0', '#222b38', '#222b38', '#f4f1e8', '#f4f1e8'][i - 1]; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.stroke(); }
    ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 6.283); ctx.lineWidth = 4; ctx.strokeStyle = U.OUT; ctx.stroke();
    const shown = log.slice(-9);
    shown.forEach((s, i) => {
      if (s.short) return;
      const f = rr / 10 / s.w, dx = KAR.Util.clamp(s.dx * f, -rr - 8, rr + 8), dy = KAR.Util.clamp(-s.dy * f, -rr - 8, rr + 8), last = i === shown.length - 1;
      ctx.beginPath(); ctx.arc(cx + dx, cy + dy, last ? 7 : 5.5, 0, 6.283); ctx.fillStyle = last ? '#9be35a' : 'rgba(255,255,255,' + (0.45 + 0.55 * i / shown.length) + ')'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = U.OUT; ctx.stroke();
    });
    if (!shown.length) U.fit(ctx, 'NO ARROWS YET', cx, cy + 6, U.sz(g, 16), '#ffffff', 190);
    const hits = shown.filter(s => !s.short), avg = hits.length ? shown.reduce((a, s) => a + s.ring, 0) / shown.length : 0;
    U.fit(ctx, shown.length ? 'LAST ' + shown.length + ' ARROWS  ·  AVG ' + avg.toFixed(1) : 'PLAY A ROUND, THEN ASK ME', cx, cy + rr + 32, U.sz(g, 16), '#ffe9a8', 250);
    this.robin(ctx, 128, 470, 40, g.time);
    U.text(ctx, A.NAME, 182, 466, 28, '#ffffff', 'left');
    U.fit(ctx, 'your archery coach', 182, 492, U.sz(g, 14), '#bfe3ff', 130, 'left');
    U.fit(ctx, 'ask me below \u2192', 182, 516, U.sz(g, 14), '#9be35a', 130, 'left');
    // right: what I see + what's next, or the answer to the question you tapped
    const X = 336, W = 532, fs = U.sz(g, 16), lh = g.coarse ? 24 : 21, q = g.agentQ;
    if (q !== null && q !== undefined && A.QS[q]) {
      U.text(ctx, A.QS[q].q, X, 142, 22, '#fff27a', 'left');
      U.wrap(ctx, A.answer(A.QS[q].id, D, log), X, 174, W, fs, '#ffffff', lh, g.coarse ? 9 : 10);
    } else {
      U.text(ctx, 'WHAT I SEE', X, 142, 22, '#fff27a', 'left');
      let y = 172;
      ctx.beginPath(); ctx.arc(X + 7, y - 6, 5, 0, 6.283); ctx.fillStyle = '#9be35a'; ctx.fill(); y = U.wrap(ctx, tips[0].text, X + 22, y, W - 22, fs, '#ffffff', lh, 3) + 6;
      y = Math.max(y + 8, 236);
      U.text(ctx, 'NEXT UP', X, y, 22, '#fff27a', 'left'); y += 30;
      const ic = { quest: '#bff4ff', level: '#ffd34d', trophy: '#ffb82e', gear: '#9be35a' };
      for (const p of plan.slice(0, 3)) { ctx.beginPath(); ctx.arc(X + 7, y - 6, 5, 0, 6.283); ctx.fillStyle = ic[p.kind] || '#ffffff'; ctx.fill(); U.fit(ctx, p.text, X + 22, y, fs, '#ffffff', W - 22, 'left'); y += lh + 8; }
    }
    // ASK ROBIN: four questions (tap again to go back to the overview)
    A.QS.forEach((x, i) => U.button(ctx, g, 'aq' + i, X + (i % 2) * 272, 400 + Math.floor(i / 2) * 62, 260, 52, x.q, { small: true, color: q === i ? 'green' : 'blue', selected: q === i }));
    U.button(ctx, g, 'agentTips', X, 530, 300, 56, D.agent ? 'TIPS IN GAME: ON' : 'TIPS IN GAME: OFF', { small: true, color: D.agent ? 'green' : 'grey' });
    U.button(ctx, g, 'agentBack', X + 316, 530, 216, 56, 'BACK', { primary: true });
  },

  // ROBIN's one-line read on the round, under the results card (tap it for the full AGENT screen)
  debrief(ctx, g) {
    const d = g.match.mode === 'trick' ? null : KAR.Agent.debrief(g.agentRound || []);
    if (!d) return;
    const U = this, k = KAR.Util.easeOut(Math.min(1, Math.max(0, g.overlayT - 0.5) * 2.5));
    if (k <= 0) return;
    ctx.save(); ctx.globalAlpha = k; ctx.translate(0, (1 - k) * 30);
    U.button(ctx, g, 'agent', 240, 552, 480, 62, '', { color: 'blue' });
    this.robin(ctx, 278, 583, 21, g.time);
    U.fit(ctx, KAR.Agent.NAME + ':  ' + d.head, 312, 576, U.sz(g, 15), '#bff4ff', 390, 'left');
    U.fit(ctx, d.line, 312, 602, U.sz(g, 17), '#ffffff', 390, 'left');
    ctx.restore();
  },
};
