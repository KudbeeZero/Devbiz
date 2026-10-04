/* =====================================================================
 * Kudbee Cricket — ui.js
 * Cartoon HUD + screens: scoreboard, over tracker, bowler card, shot toggle,
 * banners, menu, pause and match-over. Buttons register while drawing so
 * pointer hit-testing and keyboard focus use the geometry the player sees.
 * ===================================================================== */

KCK.UI = {
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

  backdrop(ctx, a) { ctx.fillStyle = 'rgba(20,16,40,' + a + ')'; ctx.fillRect(0, 0, KCK.Render.W, KCK.Render.H); },

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
  ballChip(ctx, x, y, o, now) {
    const U = this;
    let txt = '', c1 = '#cfd8e3';
    if (o) {
      if (o.kind === 'wicket') { txt = 'W'; c1 = '#ff6b5a'; }
      else if (o.kind === 'wide') { txt = 'Wd'; c1 = '#ffe14d'; }
      else if (o.noBall) { txt = 'Nb'; c1 = '#ffe14d'; }
      else if (o.kind === 'four') { txt = '4'; c1 = '#7ac7ff'; }
      else if (o.kind === 'six') { txt = '6'; c1 = '#c46bff'; }
      else if (o.runs) { txt = String(o.runs); c1 = '#a9ec62'; }
      else { txt = '\u00b7'; c1 = '#9aa3ad'; }
    }
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, 14, 0, 7); ctx.fillStyle = U.OUT; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, 12, 0, 7); ctx.fillStyle = o ? c1 : (now ? 'rgba(255,246,168,0.5)' : 'rgba(255,255,255,0.14)'); ctx.fill();
    ctx.restore();
    if (txt) U.text(ctx, txt, x, y + 6, txt.length > 1 ? 13 : 17, '#ffffff', 'center');
  },

  hud(ctx, g) {
    const U = this, m = g.match, R = KCK.Render;
    // scoreboard
    U.rr(ctx, 14, 16, 292, 108, 18); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fill();
    U.rr(ctx, 12, 12, 292, 108, 18); ctx.fillStyle = U.OUT; ctx.fill();
    const pg = ctx.createLinearGradient(0, 12, 0, 120); pg.addColorStop(0, '#47628f'); pg.addColorStop(1, '#2a3f66');
    U.rr(ctx, 15, 15, 286, 102, 15); ctx.fillStyle = pg; ctx.fill();
    U.text(ctx, 'KUDBEE KINGS', 28, 40, 17, R.TEAM.bat.light, 'left');
    U.text(ctx, m.runs + '/' + m.wk, 28, 82, 46, '#ffffff', 'left');
    U.text(ctx, m.overNo + '.' + m.ballInOver + ' / ' + m.maxOvers, 290, 40, 20, '#ffe9a8', 'right');
    U.text(ctx, 'TARGET ' + m.target, 290, 66, 20, '#ffffff', 'right');
    const need = m.need;
    U.text(ctx, need > 0 ? 'NEED ' + need + ' FROM ' + m.ballsLeft : 'TARGET REACHED', 290, 98, 19, need > m.ballsLeft * 3 ? '#ff9a8a' : '#a9ec62', 'right');
    // this over
    const logs = m.log.filter(o => o.over === m.overNo || (!o.legal && o.over === m.overNo));
    const chips = []; let leg = 0;
    for (let i = m.log.length - 1; i >= 0; i--) { const o = m.log[i]; if (o.over !== m.overNo || (m.ballInOver === 0 && o.overDone)) break; chips.unshift(o); }
    for (let i = 0; i < 6; i++) U.ballChip(ctx, 36 + i * 32, 140, chips.filter(o => o.legal)[i], i === chips.filter(o => o.legal).length);
    if (chips.some(o => !o.legal)) U.text(ctx, '+' + chips.filter(o => !o.legal).length + ' EXTRA', 232, 146, 14, '#ffe14d', 'left');
    // bowler card
    const bw = m.bowler;
    U.rr(ctx, 380, 12, 200, 50, 17); ctx.fillStyle = U.OUT; ctx.fill();
    U.rr(ctx, 383, 15, 194, 44, 14); ctx.fillStyle = '#2a3f66'; ctx.fill();
    U.text(ctx, bw.name.toUpperCase(), 480, 34, 15, '#ffffff', 'center');
    U.text(ctx, bw.tag + (m.freeHit ? '  \u00b7  FREE HIT' : ''), 480, 53, 14, m.freeHit ? '#ffe14d' : '#ffe9a8', 'center');
    U.roundIcon(ctx, g, 'pause', 926, 36, 'pause');
    U.roundIcon(ctx, g, 'mute', 876, 36, g.audio.muted ? 'mute' : 'sound');
    U.roundIcon(ctx, g, 'retry', 826, 36, 'retry');
    // batter card
    U.rr(ctx, 12, 584, 222, 44, 16); ctx.fillStyle = U.OUT; ctx.fill();
    U.rr(ctx, 15, 587, 216, 38, 13); ctx.fillStyle = '#2a3f66'; ctx.fill();
    U.text(ctx, m.batter.name.toUpperCase(), 26, 612, 15, '#ffffff', 'left');
    U.text(ctx, m.bat.runs + ' (' + m.bat.faced + ')', 220, 614, 22, '#ffe14d', 'right');
    if (g.screen === 'over') return;
    // shot toggle
    const lf = g.loft;
    U.text(ctx, 'SHOT', 868, 462, 15, '#ffe9a8', 'center');
    U.button(ctx, g, 'ground', 806, 472, 124, 40, 'GROUND', { small: true, color: !lf ? 'green' : 'blue', selected: !lf });
    U.button(ctx, g, 'loft', 806, 524, 124, 40, 'LOFT', { small: true, color: lf ? 'green' : 'blue', selected: lf });
    U.text(ctx, lf ? 'big hits, tiny timing window' : 'safe, along the deck', 868, 592, 12, '#ffffff', 'center');
    // minimap
    R.minimap(ctx, 872, 178, 66, g.fieldNow, g.aimDeg, g.loft, null, g.time);
    // prompt
    if (g.hint) { ctx.save(); ctx.globalAlpha = Math.min(1, g.hintT * 3); U.text(ctx, g.hint, 480, 612, 22, '#ffffff', 'center'); ctx.restore(); }
    // delivery label
    if (g.deliveryLabel && g.deliveryT > 0) { ctx.save(); ctx.globalAlpha = Math.min(1, g.deliveryT * 2.5); U.text(ctx, g.deliveryLabel, 480, 100, 26, '#fff27a', 'center'); ctx.restore(); }
    // timing feedback
    if (g.feedback) { const f = g.feedback; ctx.save(); ctx.globalAlpha = Math.min(1, f.life * 2.5); U.text(ctx, f.text, 480, 148, 30, f.color, 'center'); ctx.restore(); }
    // banner
    if (g.banner) {
      const b = g.banner, k = KCK.Util.easeOut(Math.min(1, b.age * 5)), fade = Math.min(1, b.life * 3);
      ctx.save(); ctx.globalAlpha = fade; ctx.translate(480, 250); ctx.scale(0.6 + 0.4 * k, 0.6 + 0.4 * k);
      U.bubble(ctx, b.text, 0, 0, b.size || 76, b.c1 || '#fff27a', b.c2 || '#ff9a1f', -0.03);
      if (b.sub) U.text(ctx, b.sub, 0, 44, 26, '#ffffff', 'center');
      ctx.restore();
    }
  },

  // ---- screens ----------------------------------------------------------------
  menu(ctx, g) {
    const U = this, t = g.time;
    U.backdrop(ctx, 0.3);
    U.bubble(ctx, 'KUDBEE', 480, 98, 44, '#ffffff', '#cfe9ff', -0.03);
    U.bubble(ctx, 'CRICKET', 480, 188, 98, '#fff27a', '#ff9a1f', -0.03 + Math.sin(t * 1.4) * 0.008);
    U.text(ctx, 'CHASE THE TARGET  \u00b7  TIME YOUR SHOTS', 480, 226, 20, '#ffffff', 'center');
    U.text(ctx, 'BOWLING', 480, 276, 18, '#ffe9a8', 'center');
    KCK.LEVELS.forEach((L, i) => U.button(ctx, g, 'lv' + i, 270 + i * 140, 286, 128, 44, L.name, { small: true, color: KCK.Store.data.difficulty === i ? 'green' : 'blue', selected: KCK.Store.data.difficulty === i }));
    U.text(ctx, 'MATCH', 480, 366, 18, '#ffe9a8', 'center');
    KCK.OVERS.forEach((O, i) => U.button(ctx, g, 'ov' + i, 270 + i * 140, 376, 128, 44, O.n + ' OVERS', { small: true, color: KCK.Store.data.overs === i ? 'green' : 'blue', selected: KCK.Store.data.overs === i }));
    U.button(ctx, g, 'play', 330, 446, 300, 72, 'PLAY MATCH', { primary: true });
    const s = KCK.Store.data.stats;
    if (s.played) U.text(ctx, s.won + ' / ' + s.played + ' won  \u00b7  ' + s.sixes + ' sixes  \u00b7  ' + s.fours + ' fours  \u00b7  best ' + s.best, 480, 566, 17, '#ffffff', 'center');
    else U.text(ctx, 'tap to swing  \u00b7  where you tap sets your shot direction', 480, 566, 16, '#ffffff', 'center');
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

  over(ctx, g) {
    const U = this, m = g.match, T = g.overlayT, res = m.result;
    const col = res === 'win' ? 'blue' : res === 'tie' ? 'yellow' : 'red';
    U.backdrop(ctx, Math.min(0.55, T * 1.4));
    const k = KCK.Util.easeOut(Math.min(1, T * 2.2));
    ctx.save(); ctx.translate(480, 320); ctx.scale(0.86 + 0.14 * k, 0.86 + 0.14 * k); ctx.translate(-480, -320); ctx.globalAlpha = k;
    U.panel(ctx, 230, 104, 500, 440, col);
    U.ribbon(ctx, 480, 76, 400, res === 'win' ? 'YOU WIN!' : res === 'tie' ? 'MATCH TIED' : 'MATCH LOST', res === 'win' ? 'green' : res === 'tie' ? 'yellow' : 'red');
    U.text(ctx, m.runs + '/' + m.wk, 480, 214, 74, '#ffffff', 'center');
    U.text(ctx, res === 'win' ? 'CHASED ' + m.target + ' WITH ' + m.ballsLeft + ' BALLS LEFT' : (res === 'tie' ? 'SCORES LEVEL AT ' + m.runs : 'FELL ' + (m.target - m.runs) + ' SHORT OF ' + m.target), 480, 250, 20, '#ffe9a8', 'center');
    const S = m.stats;
    U.text(ctx, 'SIXES ' + S.sixes + '   \u00b7   FOURS ' + S.fours + '   \u00b7   PERFECT ' + S.perfect, 480, 292, 20, '#ffffff', 'center');
    const best = m.card.slice().sort((a, b) => b.runs - a.runs).slice(0, 3);
    best.forEach((c, i) => { U.text(ctx, c.name.toUpperCase(), 290, 336 + i * 30, 19, '#ffffff', 'left'); U.text(ctx, c.runs + ' (' + c.faced + ')' + (c.out ? '' : '*'), 670, 336 + i * 30, 21, '#ffe14d', 'right'); });
    if (res === 'win') for (let i = 0; i < 3; i++) U.star(ctx, 480 + (i - 1) * 70, 450 - (i === 1 ? 10 : 0), i === 1 ? 30 : 24, true, T > 0.4 + i * 0.3 ? 1 : 0.01);
    U.button(ctx, g, 'rematch', 270, 468, 270, 54, 'PLAY AGAIN', { primary: true });
    U.button(ctx, g, 'menu', 560, 468, 150, 54, 'MENU', { small: true, color: 'yellow' });
    ctx.restore();
  },
};
