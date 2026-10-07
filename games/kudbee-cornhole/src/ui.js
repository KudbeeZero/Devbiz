/* =====================================================================
 * Kudbee Cornhole — ui.js
 * Cartoon HUD + screens: scoreboard, bag pips, style toggle, banners, menu,
 * round summary, pause and match-over. Buttons register while drawing so
 * pointer hit-testing and keyboard focus use the geometry the player sees.
 * ===================================================================== */

KCH.UI = {
  FONT: '"Lilita One","Arial Black","Trebuchet MS",system-ui,sans-serif',
  OUT: '#2a1a10',
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

  text(ctx, s, x, y, size, color, align, shadow) {
    ctx.save();
    ctx.font = '400 ' + size + 'px ' + this.FONT;
    ctx.textAlign = align || 'left'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
    if (shadow) {
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillText(s, x + 2, y + 2);
    }
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
    ctx.translate(0, focused ? -2 : 0);
    // Enhanced shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; this.rr(ctx, x, y + 6, w, h, 16); ctx.fill();
    this.rr(ctx, x - 3, y - 3, w + 6, h + 6, 18); ctx.fillStyle = this.OUT; ctx.fill();
    if (focused || opts.selected) {
      this.rr(ctx, x - 3, y - 3, w + 6, h + 6, 18); ctx.lineWidth = 4; ctx.strokeStyle = '#fff6a8'; ctx.stroke();
      // Glow effect for focused button
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,246,168,0.4)';
      this.rr(ctx, x - 6, y - 6, w + 12, h + 12, 20); ctx.stroke();
    }
    const gr = ctx.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, cs[0]); gr.addColorStop(0.5, cs[1]); gr.addColorStop(1, cs[2]);
    this.rr(ctx, x, y, w, h, 15); ctx.fillStyle = gr; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,' + (focused ? 0.45 : 0.32) + ')'; this.rr(ctx, x + 5, y + 4, w - 10, h * 0.38, 10); ctx.fill();
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

  backdrop(ctx, a) { ctx.fillStyle = 'rgba(20,16,40,' + a + ')'; ctx.fillRect(0, 0, KCH.Render.W, KCH.Render.H); },

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

  // little cloth bag icon (pips)
  pip(ctx, x, y, team, filled) {
    const col = KCH.Render.TEAM[team];
    ctx.save(); ctx.translate(x, y); ctx.rotate(-0.12);
    ctx.fillStyle = filled ? col.base : 'rgba(20,20,40,0.45)'; ctx.strokeStyle = this.OUT; ctx.lineWidth = 2.2;
    this.rr(ctx, -9, -9, 18, 18, 4); ctx.fill(); ctx.stroke();
    if (filled) { ctx.fillStyle = 'rgba(255,255,255,0.4)'; this.rr(ctx, -6, -6, 12, 5, 2); ctx.fill(); }
    ctx.restore();
  },

  // ---- HUD ------------------------------------------------------------------
  hud(ctx, g) {
    const U = this, m = g.match, solo = m.solo;
    // scoreboard
    const rows = solo ? [0] : [0, 1];
    const h = solo ? 58 : 98;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; U.rr(ctx, 14, 16, 258, h, 18); ctx.fill();
    U.rr(ctx, 12, 12, 258, h, 18); ctx.fillStyle = U.OUT; ctx.fill();
    const pg = ctx.createLinearGradient(0, 12, 0, 12 + h); pg.addColorStop(0, '#47628f'); pg.addColorStop(1, '#2a3f66');
    U.rr(ctx, 15, 15, 252, h - 6, 15); ctx.fillStyle = pg; ctx.fill();
    ctx.restore();
    rows.forEach((t, i) => {
      const y = 36 + i * 42, col = KCH.Render.TEAM[t];
      const active = !m.over && m.phase !== 'roundEnd' && m.team === t;
      if (active) { ctx.save(); ctx.fillStyle = 'rgba(255,246,168,0.22)'; U.rr(ctx, 20, y - 21, 246, 38, 12); ctx.fill(); ctx.restore(); }
      U.text(ctx, solo ? 'YOU' : (t === 0 ? 'YOU' : 'CPU'), 30, y + 8, 22, col.light, 'left');
      U.text(ctx, String(m.score[t]), 142, y + 11, 34, '#ffffff', 'right');
      for (let k = 0; k < m.bagsPer; k++) U.pip(ctx, 166 + k * 24, y - 2, t, k < m.bagsLeft(t));
    });
    // round chip
    U.rr(ctx, 380, 12, 200, 34, 17); ctx.fillStyle = U.OUT; ctx.fill();
    U.rr(ctx, 383, 15, 194, 28, 14); ctx.fillStyle = '#2a3f66'; ctx.fill();
    U.text(ctx, solo ? 'PRACTICE  ·  ROUND ' + m.round : 'ROUND ' + m.round + '  ·  FIRST TO ' + m.target, 480, 36, 16, '#ffe9a8', 'center');
    U.roundIcon(ctx, g, 'pause', 926, 36, 'pause');
    U.roundIcon(ctx, g, 'mute', 876, 36, g.audio.muted ? 'mute' : 'sound');
    U.roundIcon(ctx, g, 'retry', 826, 36, 'retry');

    // throw style toggle
    if (g.humanTurn()) {
      const st = g.style;
      U.text(ctx, 'THROW', 868, 462, 15, '#ffe9a8', 'center');
      U.button(ctx, g, 'slide', 806, 472, 124, 40, 'SLIDE', { small: true, color: st === 'slide' ? 'green' : 'blue', selected: st === 'slide' });
      U.button(ctx, g, 'flop', 806, 524, 124, 40, 'FLOP', { small: true, color: st === 'flop' ? 'green' : 'blue', selected: st === 'flop' });
      U.text(ctx, KCH.STYLE[st].tip, 868, 592, 13, '#ffffff', 'center');
    }
    // turn banner under the scoreboard
    if (g.turnText) {
      const a = Math.min(1, g.turnT * 4) * Math.min(1, (3 - g.turnT) * 3);
      ctx.save(); ctx.globalAlpha = Math.max(0, a);
      U.text(ctx, g.turnText, 480, 84, 26, '#ffffff', 'center');
      ctx.restore();
    }
    // event banner
    if (g.banner) {
      const b = g.banner, k = KCH.Util.easeOut(Math.min(1, b.age * 5)), fade = Math.min(1, b.life * 3);
      ctx.save(); ctx.globalAlpha = fade; ctx.translate(480, 190); ctx.scale(0.6 + 0.4 * k, 0.6 + 0.4 * k);
      U.bubble(ctx, b.text, 0, 0, b.size || 58, b.c1 || '#fff27a', b.c2 || '#ff9a1f', -0.03);
      if (b.sub) U.text(ctx, b.sub, 0, 38, 24, '#ffffff', 'center');
      ctx.restore();
    }
    // floating score pops projected from the world
    for (const p of g.popups) {
      const q = KCH.Render.proj(p.x, p.y + p.age * 14, p.z);
      if (!q) continue;
      ctx.save(); ctx.globalAlpha = Math.min(1, p.life * 2);
      U.text(ctx, p.text, q.x, q.y, p.size || 30, p.color, 'center');
      ctx.restore();
    }
  },

  // ---- screens ----------------------------------------------------------------
  menu(ctx, g) {
    const U = this, t = g.time;
    U.backdrop(ctx, 0.28);
    U.bubble(ctx, 'KUDBEE', 480, 108, 44, '#ffffff', '#cfe9ff', -0.03);
    U.bubble(ctx, 'CORNHOLE', 480, 196, 98, '#fff27a', '#ff9a1f', -0.03 + Math.sin(t * 1.4) * 0.008);
    U.text(ctx, 'BACKYARD BAG TOSS  ·  FIRST TO 21', 480, 234, 20, '#ffffff', 'center');
    const lv = KCH.AI.LEVELS;
    U.text(ctx, 'CPU SKILL', 480, 292, 18, '#ffe9a8', 'center');
    lv.forEach((L, i) => U.button(ctx, g, 'lv' + i, 270 + i * 140, 302, 128, 46, L.name, { small: true, color: KCH.Store.data.difficulty === i ? 'green' : 'blue', selected: KCH.Store.data.difficulty === i }));
    U.button(ctx, g, 'play', 330, 380, 300, 70, 'PLAY VS CPU', { primary: true });
    U.button(ctx, g, 'practice', 360, 468, 240, 50, 'PRACTICE', { small: true, color: 'yellow' });
    const s = KCH.Store.data.stats;
    if (s.played) U.text(ctx, s.won + ' / ' + s.played + ' matches won  ·  ' + s.holes + ' holes  ·  ' + s.airmails + ' airmails', 480, 556, 17, '#ffffff', 'center');
    U.roundIcon(ctx, g, 'mute', 926, 36, g.audio.muted ? 'mute' : 'sound');
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

  roundEnd(ctx, g) {
    const U = this, m = g.match, r = m.lastRound, T = g.overlayT;
    U.backdrop(ctx, Math.min(0.5, T * 1.4));
    const k = KCH.Util.easeOut(Math.min(1, T * 2.4));
    ctx.save(); ctx.translate(480, 320); ctx.scale(0.88 + 0.12 * k, 0.88 + 0.12 * k); ctx.translate(-480, -320); ctx.globalAlpha = k;
    U.panel(ctx, 250, 118, 460, 400, 'blue');
    U.ribbon(ctx, 480, 90, 340, 'ROUND ' + r.round, 'red');
    const tl = r.tally;
    const line = (t, y) => {
      const col = KCH.Render.TEAM[t], nm = m.solo ? 'YOU' : (t === 0 ? 'YOU' : 'CPU');
      U.text(ctx, nm, 290, y, 26, col.light, 'left');
      U.text(ctx, tl.holes[t] + ' in hole (' + tl.holes[t] * 3 + ')  +  ' + tl.board[t] + ' on board', 392, y - 2, 18, '#ffffff', 'left');
      U.text(ctx, String(tl.pts[t]), 672, y + 4, 34, '#ffe14d', 'right');
    };
    line(0, 214);
    if (!m.solo) line(1, 262);
    if (m.solo) {
      U.text(ctx, '+' + tl.pts[0] + ' POINTS', 480, 330, 40, '#ffe14d', 'center');
    } else if (r.winner >= 0) {
      U.text(ctx, 'CANCELLATION', 480, 312, 18, '#cfe6ff', 'center');
      U.text(ctx, (r.winner === 0 ? 'YOU' : 'CPU') + ' SCORE +' + r.pts, 480, 358, 40, r.winner === 0 ? '#9be35a' : '#ff9a8a', 'center');
    } else {
      U.text(ctx, 'ALL SQUARE  ·  NO SCORE', 480, 346, 32, '#ffffff', 'center');
    }
    U.text(ctx, 'TOTAL   YOU ' + m.score[0] + (m.solo ? '' : '   -   CPU ' + m.score[1]), 480, 404, 22, '#ffffff', 'center');
    U.button(ctx, g, 'next', 330, 432, 300, 56, m.over ? 'SEE RESULT' : 'NEXT ROUND', { primary: true });
    ctx.restore();
  },

  over(ctx, g) {
    const U = this, m = g.match, T = g.overlayT, won = m.winner === 0;
    U.backdrop(ctx, Math.min(0.55, T * 1.4));
    const k = KCH.Util.easeOut(Math.min(1, T * 2.2));
    ctx.save(); ctx.translate(480, 320); ctx.scale(0.86 + 0.14 * k, 0.86 + 0.14 * k); ctx.translate(-480, -320); ctx.globalAlpha = k;
    U.panel(ctx, 250, 110, 460, 420, won ? 'blue' : 'red');
    U.ribbon(ctx, 480, 82, 360, won ? 'YOU WIN!' : 'CPU WINS', won ? 'green' : 'red');
    U.text(ctx, m.score[0] + '  -  ' + m.score[1], 480, 232, 74, '#ffffff', 'center');
    const st = g.matchStats;
    U.text(ctx, 'ROUNDS ' + m.round + '   ·   HOLES ' + st.holes + '   ·   AIRMAILS ' + st.airmails, 480, 282, 20, '#ffe9a8', 'center');
    if (won) for (let i = 0; i < 3; i++) U.star(ctx, 480 + (i - 1) * 78, 346 - (i === 1 ? 14 : 0), i === 1 ? 38 : 30, true, T > 0.4 + i * 0.3 ? 1 : 0.01);
    else U.text(ctx, 'RUN IT BACK?', 480, 350, 34, '#ffffff', 'center');
    U.button(ctx, g, 'rematch', 320, 398, 320, 56, 'REMATCH', { primary: true });
    U.button(ctx, g, 'menu', 340, 466, 280, 44, 'MENU', { small: true, color: 'yellow' });
    ctx.restore();
  },
};
