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
  // phones show the 640-high stage at ~0.6x: small print grows to stay readable (>= ~11 CSS px)
  sz(g, n) { return g.coarse ? Math.max(18, Math.round(n * 1.15)) : n; },
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

  backdrop(ctx, a) { const R = KCK.Render; ctx.fillStyle = 'rgba(20,16,40,' + a + ')'; ctx.fillRect(R.XL - 20, -20, R.XW + 40, R.H + 40); },

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
    const r = g.coarse ? 27 : 21, idx = this.buttons.length;
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

  // a TV-graphics plate: dark glass, an outline, and a coloured accent bar on the left
  broadcast(ctx, x, y, w, h, accent) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; this.rr(ctx, x + 2, y + 4, w, h, 12); ctx.fill();
    this.rr(ctx, x, y, w, h, 12); ctx.fillStyle = this.OUT; ctx.fill();
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, 'rgba(52,74,112,0.97)'); g.addColorStop(1, 'rgba(22,34,58,0.97)');
    this.rr(ctx, x + 2.5, y + 2.5, w - 5, h - 5, 10); ctx.fillStyle = g; ctx.fill();
    ctx.fillStyle = accent || '#ffe14d'; this.rr(ctx, x + 2.5, y + 2.5, 6, h - 5, 3); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; this.rr(ctx, x + 10, y + 4, w - 16, h * 0.35, 6); ctx.fill();
    ctx.restore();
  },

  overCard(ctx, g) {
    const U = this, m = g.match, c = g.overCard, a = Math.min(1, g.bpT * 5), ph = g.coarse;
    const w = 470, h = 196, x = 480 - w / 2, y = 216;
    ctx.save(); ctx.globalAlpha = a; ctx.translate(480, y + h / 2); const s = 0.92 + 0.08 * KCK.Util.easeOut(a); ctx.scale(s, s); ctx.translate(-480, -(y + h / 2));
    U.broadcast(ctx, x, y, w, h, '#ffe14d');
    U.text(ctx, 'END OF OVER ' + c.n, 480, y + 40, 28, '#ffe14d', 'center');
    U.text(ctx, c.r + (c.r === 1 ? ' RUN' : ' RUNS') + (c.w ? '  \u00b7  ' + c.w + (c.w > 1 ? ' WICKETS' : ' WICKET') : ''), 480, y + 82, 34, '#ffffff', 'center');
    U.text(ctx, 'KUDBEE KINGS ' + m.runs + '/' + m.wk + '   NEED ' + m.need + ' FROM ' + m.ballsLeft + '   RRR ' + m.reqRate.toFixed(2), 480, y + 118, U.sz(g, 16), '#cfe9ff', 'center');
    const nb = m.bowler;
    U.text(ctx, 'NEXT: ' + nb.name.toUpperCase() + '  (' + nb.tag + ')  ' + m.figures(nb.id).text, 480, y + 150, U.sz(g, 16), '#ffe9a8', 'center');
    U.text(ctx, (ph ? 'TAP' : 'CLICK') + ' TO CONTINUE', 480, y + h - 14, U.sz(g, 12), 'rgba(255,255,255,0.8)', 'center');
    ctx.restore();
  },

  // the wagon wheel: every scoring shot drawn from the crease to where it went (sixes purple, fours blue)
  wagon(ctx, cx, cy, r, log) {
    const C = KCK.CFG, s = r / C.ROPE_R, U = this;
    const P = (x, y) => [cx + x * s, cy - (y - C.CY) * s];
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r + 10, 0, 7); ctx.fillStyle = U.OUT; ctx.fill();
    const gg = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r + 8); gg.addColorStop(0, '#6ccd52'); gg.addColorStop(1, '#3f9a36');
    ctx.beginPath(); ctx.arc(cx, cy, r + 7, 0, 7); ctx.fillStyle = gg; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.setLineDash([4, 5]); ctx.beginPath(); ctx.arc(cx, cy, 27 * s, 0, 7); ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);
    const a = P(-0.9, 0), b = P(0.9, C.PITCH); ctx.fillStyle = '#dcc48c'; ctx.fillRect(a[0], b[1], b[0] - a[0], a[1] - b[1]);
    const o0 = P(0, C.CONTACT_Y);
    ctx.lineCap = 'round';
    for (const o of log) {
      if (!o.ww || !(o.runs > 0 || o.kind === 'wicket')) continue;
      let [ex, ey] = P(o.ww.x, o.ww.y); const d = Math.hypot(ex - cx, ey - cy); if (d > r) { ex = cx + (ex - cx) * r / d; ey = cy + (ey - cy) * r / d; }
      const col = o.kind === 'six' ? '#c46bff' : o.kind === 'four' ? '#2f86d8' : o.kind === 'wicket' ? '#e8483a' : '#ffffff';
      ctx.beginPath(); ctx.moveTo(o0[0], o0[1]); ctx.lineTo(ex, ey); ctx.strokeStyle = U.OUT; ctx.lineWidth = 5; ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.stroke();
      if (o.kind === 'wicket') { ctx.beginPath(); ctx.arc(ex, ey, 5, 0, 7); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = U.OUT; ctx.stroke(); }
    }
    ctx.restore();
  },

  // ---- HUD ------------------------------------------------------------------
  ballChip(ctx, x, y, o, now, big) {
    const U = this, r = big ? 17 : 14;
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
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = U.OUT; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, r - 2, 0, 7); ctx.fillStyle = o ? c1 : (now ? 'rgba(255,246,168,0.5)' : 'rgba(255,255,255,0.14)'); ctx.fill();
    ctx.restore();
    if (txt) U.text(ctx, txt, x, y + (big ? 7 : 6), big ? (txt.length > 1 ? 18 : 22) : (txt.length > 1 ? 13 : 17), '#ffffff', 'center');
  },

  hud(ctx, g) {
    const U = this, m = g.match, R = KCK.Render, ph = g.coarse;
    const xl = R.XL, xr = R.XL + R.XW;          // the real screen edges (a wide phone shows past 0..960)
    // scoreboard
    const sx = xl + 12;
    U.rr(ctx, sx + 2, 16, 292, 108, 18); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fill();
    U.rr(ctx, sx, 12, 292, 108, 18); ctx.fillStyle = U.OUT; ctx.fill();
    const pg = ctx.createLinearGradient(0, 12, 0, 120); pg.addColorStop(0, '#47628f'); pg.addColorStop(1, '#2a3f66');
    U.rr(ctx, sx + 3, 15, 286, 102, 15); ctx.fillStyle = pg; ctx.fill();
    U.text(ctx, 'KUDBEE KINGS', sx + 16, 40, U.sz(g, 17), R.TEAM.bat.light, 'left');
    U.text(ctx, m.runs + '/' + m.wk, sx + 16, 82, 46, '#ffffff', 'left');
    U.text(ctx, m.overNo + '.' + m.ballInOver + ' / ' + m.maxOvers, sx + 278, 40, 20, '#ffe9a8', 'right');
    U.text(ctx, 'TARGET ' + m.target, sx + 278, 66, 20, '#ffffff', 'right');
    const need = m.need;
    U.text(ctx, need > 0 ? 'NEED ' + need + ' FROM ' + m.ballsLeft : 'TARGET REACHED', sx + 278, 98, 19, need > m.ballsLeft * 3 ? '#ff9a8a' : '#a9ec62', 'right');
    // this over
    const chips = [];
    for (let i = m.log.length - 1; i >= 0; i--) { const o = m.log[i]; if (o.over !== m.overNo || (m.ballInOver === 0 && o.overDone)) break; chips.unshift(o); }
    const legal = chips.filter(o => o.legal);
    const cs = ph ? 38 : 32;
    for (let i = 0; i < 6; i++) U.ballChip(ctx, sx + 24 + i * cs, ph ? 144 : 140, legal[i], i === legal.length, ph);
    if (chips.length > legal.length) U.text(ctx, '+' + (chips.length - legal.length) + ' EXTRA', sx + 14 + 6 * cs, ph ? 151 : 147, U.sz(g, 14), '#ffe14d', 'left');
    // run rates, as on the TV graphic: current, and what the chase needs
    U.text(ctx, 'CRR ' + m.runRate.toFixed(2) + '   RRR ' + (m.need > 0 && m.ballsLeft ? m.reqRate.toFixed(2) : '-'), sx + 10, ph ? 188 : 178, U.sz(g, 14), m.reqRate > 12 && m.need > 0 ? '#ffb3a8' : '#ffffff', 'left');
    // bowler card (centre)
    const bw = m.bowler, cw = ph ? 260 : 200, ch = ph ? 60 : 50;
    U.rr(ctx, 480 - cw / 2, 12, cw, ch, 17); ctx.fillStyle = U.OUT; ctx.fill();
    U.rr(ctx, 483 - cw / 2, 15, cw - 6, ch - 6, 14); ctx.fillStyle = '#2a3f66'; ctx.fill();
    U.text(ctx, bw.name.toUpperCase(), 480, ph ? 38 : 34, U.sz(g, 15), '#ffffff', 'center');
    U.text(ctx, m.freeHit ? 'FREE HIT' : bw.tag + '   ' + m.figures(bw.id).text, 480, ph ? 62 : 53, U.sz(g, 14), m.freeHit ? '#ffe14d' : '#ffe9a8', 'center');
    // pause / sound / restart, from the right edge
    const ir = ph ? 27 : 21, step = ph ? 64 : 50, iy = ph ? 42 : 36;
    U.roundIcon(ctx, g, 'pause', xr - 13 - ir, iy, 'pause');
    U.roundIcon(ctx, g, 'mute', xr - 13 - ir - step, iy, g.audio.muted ? 'mute' : 'sound');
    U.roundIcon(ctx, g, 'retry', xr - 13 - ir - step * 2, iy, 'retry');
    // batter card
    const bwid = ph ? 262 : 222, bh = ph ? 50 : 44, by = 628 - bh;
    U.rr(ctx, sx, by, bwid, bh, 16); ctx.fillStyle = U.OUT; ctx.fill();
    U.rr(ctx, sx + 3, by + 3, bwid - 6, bh - 6, 13); ctx.fillStyle = '#2a3f66'; ctx.fill();
    U.text(ctx, m.batter.name.toUpperCase(), sx + 14, by + bh / 2 + 6, U.sz(g, 15), '#ffffff', 'left');
    U.text(ctx, m.bat.runs + ' (' + m.bat.faced + ')', sx + bwid - 14, by + bh / 2 + 8, 22, '#ffe14d', 'right');
    if (g.screen === 'over') return;
    // shot toggle, bottom right (phone: thumb-sized)
    const lf = g.loft, bwB = ph ? 150 : 124, bhB = ph ? 56 : 40, gap = ph ? 14 : 12, bx = xr - 30 - bwB, cx = bx + bwB / 2;
    const capY = 618, loftY = capY - 24 - bhB, gndY = loftY - gap - bhB;
    U.text(ctx, 'SHOT', cx, gndY - 10, U.sz(g, 15), '#ffe9a8', 'center');
    U.button(ctx, g, 'ground', bx, gndY, bwB, bhB, 'GROUND', { small: true, color: !lf ? 'green' : 'blue', selected: !lf });
    U.button(ctx, g, 'loft', bx, loftY, bwB, bhB, 'LOFT', { small: true, color: lf ? 'green' : 'blue', selected: lf });
    U.text(ctx, lf ? 'big hits, tiny timing window' : 'safe, along the deck', cx, capY, U.sz(g, 12), '#ffffff', 'center');
    // minimap
    R.minimap(ctx, xr - 88, ph ? 196 : 178, 66, g.fieldNow, g.aimDeg, g.loft, null, g.time);
    // speed gun, as soon as the ball leaves the hand
    const del = g.cur && g.cur.del;
    if (del && !g.replay && (g.bp === 'flight' || g.bp === 'hit' || g.bp === 'miss')) {
      const kx = xr - 88, ky = ph ? 280 : 262, a = Math.min(1, (g.bp === 'flight' ? g.bt : 1) * 5);
      ctx.save(); ctx.globalAlpha = a;
      U.broadcast(ctx, kx - 74, ky, 148, ph ? 52 : 46, '#ffe14d');
      U.text(ctx, 'SPEED', kx, ky + (ph ? 19 : 17), U.sz(g, 11), '#ffe9a8', 'center');
      U.text(ctx, (del.speed * 3.6).toFixed(1) + ' KM/H', kx, ky + (ph ? 44 : 39), ph ? 22 : 20, '#ffffff', 'center');
      ctx.restore();
    }
    // the commentary line (a TV lower third), between the batter card and the shot buttons
    const showComm = g.comm && g.hintT <= 0 && !g.replay && (g.bp === 'hit' || g.bp === 'miss' || g.bp === 'between' || (g.bp === 'ready' && g.bpT < 0.6));
    if (showComm) {
      const L0 = sx + bwid + 14, R0 = bx - 18, cw2 = Math.min(640, R0 - L0), cx2 = (L0 + R0) / 2, chh = ph ? 58 : 50, cy2 = 628 - chh;
      const o = g.out, acc = !o ? '#9aa3ad' : o.kind === 'six' ? '#c46bff' : o.kind === 'four' ? '#7ac7ff' : o.kind === 'wicket' ? '#ff6b5a' : o.runs ? '#a9ec62' : o.kind === 'wide' || o.noBall ? '#ffe14d' : '#9aa3ad';
      U.broadcast(ctx, cx2 - cw2 / 2, cy2, cw2, chh, acc);
      U.text(ctx, g.comm.tag, cx2 - cw2 / 2 + 16, cy2 + (ph ? 20 : 18), U.sz(g, 11), '#ffe9a8', 'left');
      ctx.font = '400 20px ' + U.FONT; const tw = ctx.measureText(g.comm.text).width, fs = Math.max(13, Math.min(ph ? 22 : 19, 20 * (cw2 - 32) / tw));
      U.text(ctx, g.comm.text, cx2 - cw2 / 2 + 16, cy2 + chh - (ph ? 12 : 11), fs, '#ffffff', 'left');
    }
    // action replay badge
    if (g.replay) {
      const ry = ph ? 84 : 76, on = Math.sin(g.time * 7) > -0.3;
      U.broadcast(ctx, 480 - 92, ry, 184, 44, '#ff6b5a');
      ctx.save(); ctx.globalAlpha = on ? 1 : 0.25; ctx.beginPath(); ctx.arc(480 - 58, ry + 22, 8, 0, 7); ctx.fillStyle = '#ff3b30'; ctx.fill(); ctx.restore();
      U.text(ctx, 'REPLAY', 480 + 12, ry + 32, 24, '#ffffff', 'center');
      U.text(ctx, (g.coarse ? 'TAP' : 'CLICK') + ' TO SKIP', 480, ry + 68, U.sz(g, 13), '#ffffff', 'center');
    }
    // end-of-over card
    if (g.overCard && g.bp === 'between') U.overCard(ctx, g);
    // prompt
    if (g.hint && g.hintT > 0) { ctx.save(); ctx.globalAlpha = Math.min(1, g.hintT * 3); U.text(ctx, g.hint, 480, R.XL < -60 ? 612 : 566, 22, '#ffffff', 'center'); ctx.restore(); }
    // delivery label
    if (g.deliveryLabel && g.deliveryT > 0) { ctx.save(); ctx.globalAlpha = Math.min(1, g.deliveryT * 2.5); U.text(ctx, g.deliveryLabel, 480, 100, 26, '#fff27a', 'center'); ctx.restore(); }
    // timing feedback
    if (g.feedback) {
      const f = g.feedback; ctx.save(); ctx.globalAlpha = Math.min(1, f.life * 2.5); U.text(ctx, f.text, 480, 148, 30, f.color, 'center');
      // timing meter: where the swing landed in the window (EARLY ... LATE), the gold notch is dead on
      const sh = g.out && g.out.shot;
      if (sh && sh.w) {
        const mw = 200, my = 162, u = KCK.Util.clamp(sh.d / sh.w, -1.25, 1.25), mx = 480 + u / 1.25 * mw / 2;
        U.rr(ctx, 480 - mw / 2 - 3, my - 3, mw + 6, 16, 8); ctx.fillStyle = U.OUT; ctx.fill();
        const gr = ctx.createLinearGradient(480 - mw / 2, 0, 480 + mw / 2, 0);
        gr.addColorStop(0, '#e8483a'); gr.addColorStop(0.3, '#ffb82e'); gr.addColorStop(0.5, '#a9ec62'); gr.addColorStop(0.7, '#ffb82e'); gr.addColorStop(1, '#e8483a');
        U.rr(ctx, 480 - mw / 2, my, mw, 10, 5); ctx.fillStyle = gr; ctx.fill();
        const pw = 0.02 / sh.w / 1.25 * mw; ctx.fillStyle = '#fff27a'; ctx.fillRect(480 - pw / 2, my - 2, pw, 14);
        ctx.beginPath(); ctx.moveTo(mx, my - 4); ctx.lineTo(mx - 7, my - 13); ctx.lineTo(mx + 7, my - 13); ctx.closePath(); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = U.OUT; ctx.stroke();
        U.text(ctx, 'EARLY', 480 - mw / 2 - 8, my + 10, U.sz(g, 12), '#ffffff', 'right');
        U.text(ctx, 'LATE', 480 + mw / 2 + 8, my + 10, U.sz(g, 12), '#ffffff', 'left');
      }
      ctx.restore();
    }
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
    // phone: taller (thumb-sized) choice buttons, the rows shift down to fit
    const ph = g.coarse, bh = ph ? 54 : 44, r1 = ph ? 284 : 286, r2 = r1 + bh + 46;
    ctx.save(); ctx.fillStyle = 'rgba(14,30,66,0.62)'; U.rr(ctx, 236, 252, 488, r2 + bh + 104 - 252, 22); ctx.fill(); ctx.restore();
    U.text(ctx, 'BOWLING', 480, r1 - 10, U.sz(g, 18), '#ffe9a8', 'center');
    KCK.LEVELS.forEach((L, i) => U.button(ctx, g, 'lv' + i, 270 + i * 140, r1, 128, bh, L.name, { small: true, color: KCK.Store.data.difficulty === i ? 'green' : 'blue', selected: KCK.Store.data.difficulty === i }));
    U.text(ctx, 'MATCH', 480, r2 - 10, U.sz(g, 18), '#ffe9a8', 'center');
    KCK.OVERS.forEach((O, i) => U.button(ctx, g, 'ov' + i, 270 + i * 140, r2, 128, bh, O.n + ' OVERS', { small: true, color: KCK.Store.data.overs === i ? 'green' : 'blue', selected: KCK.Store.data.overs === i }));
    U.button(ctx, g, 'play', 330, r2 + bh + 26, 300, 72, 'PLAY MATCH', { primary: true });
    const s = KCK.Store.data.stats, sy = ph ? 600 : 566;
    if (s.played) U.text(ctx, s.won + ' / ' + s.played + ' won  \u00b7  ' + s.sixes + ' sixes  \u00b7  ' + s.fours + ' fours  \u00b7  best ' + s.best, 480, sy, U.sz(g, 17), '#ffffff', 'center');
    else U.text(ctx, 'tap to swing  \u00b7  where you tap sets your shot direction', 480, sy, U.sz(g, 16), '#ffffff', 'center');
    const ir = ph ? 27 : 21;
    U.roundIcon(ctx, g, 'mute', KCK.Render.XL + KCK.Render.XW - 13 - ir, ph ? 42 : 36, g.audio.muted ? 'mute' : 'sound');
  },

  pause(ctx, g) {
    const U = this;
    U.backdrop(ctx, 0.55);
    // phone: thumb-sized rows, plus a vibration toggle
    const ph = g.coarse, rh = ph ? 54 : 50, gap = ph ? 12 : 16, y0 = ph ? 196 : 214;
    const rows = [['restart', 'RESTART', {}], ['menu', 'MENU', { color: 'yellow' }], ['mute', g.audio.muted ? 'SOUND: OFF' : 'SOUND: ON', {}]];
    if (ph) rows.push(['buzz', KCK.Store.data.haptics ? 'VIBRATION: ON' : 'VIBRATION: OFF', {}]);
    const bottom = y0 + 62 + rows.length * (rh + gap) + 28;
    U.panel(ctx, 290, ph ? 112 : 130, 380, bottom - (ph ? 112 : 130), 'blue');
    U.ribbon(ctx, 480, ph ? 88 : 106, 300, 'PAUSED', 'yellow');
    U.button(ctx, g, 'resume', 340, y0, 280, 62, 'RESUME', { primary: true });
    rows.forEach((r, i) => U.button(ctx, g, r[0], 340, y0 + 62 + gap + 4 + i * (rh + gap), 280, rh, r[1], Object.assign({ small: true }, r[2])));
  },

  over(ctx, g) {
    const U = this, m = g.match, T = g.overlayT, res = m.result;
    const col = res === 'win' ? 'blue' : res === 'tie' ? 'yellow' : 'red';
    U.backdrop(ctx, Math.min(0.55, T * 1.4));
    const k = KCK.Util.easeOut(Math.min(1, T * 2.2));
    ctx.save(); ctx.translate(480, 320); ctx.scale(0.86 + 0.14 * k, 0.86 + 0.14 * k); ctx.translate(-480, -320); ctx.globalAlpha = k;
    U.panel(ctx, 110, 104, 740, 440, col);
    U.ribbon(ctx, 480, 76, 400, res === 'win' ? 'YOU WIN!' : res === 'tie' ? 'MATCH TIED' : 'MATCH LOST', res === 'win' ? 'green' : res === 'tie' ? 'yellow' : 'red');
    // left: the result and the batting card
    const lx = 320;
    U.text(ctx, m.runs + '/' + m.wk, lx, 210, 70, '#ffffff', 'center');
    U.text(ctx, '(' + m.overNo + '.' + m.ballInOver + ' OV)', lx, 236, 18, '#ffffff', 'center');
    U.text(ctx, res === 'win' ? 'CHASED ' + m.target + ' WITH ' + m.ballsLeft + ' BALLS LEFT' : (res === 'tie' ? 'SCORES LEVEL AT ' + m.runs : 'FELL ' + (m.target - m.runs) + ' SHORT OF ' + m.target), lx, 266, 19, '#ffe9a8', 'center');
    const S = m.stats;
    U.text(ctx, 'SIXES ' + S.sixes + '  \u00b7  FOURS ' + S.fours + '  \u00b7  PERFECT ' + S.perfect, lx, 298, 18, '#ffffff', 'center');
    ctx.fillStyle = 'rgba(14,24,48,0.35)'; U.rr(ctx, 142, 312, 356, 116, 12); ctx.fill();
    const best = m.card.slice().sort((a, b) => b.runs - a.runs).slice(0, 3);
    best.forEach((c, i) => {
      const yy = 340 + i * 34, sr = c.faced ? Math.round(c.runs / c.faced * 100) : 0;
      U.text(ctx, c.name.toUpperCase(), 156, yy, 18, '#ffffff', 'left');
      U.text(ctx, c.out ? c.how : 'not out', 156, yy + 15, 12, 'rgba(255,255,255,0.75)', 'left');
      U.text(ctx, c.runs + (c.out ? '' : '*') + ' (' + c.faced + ')', 420, yy + 4, 21, '#ffe14d', 'right');
      U.text(ctx, 'SR ' + sr, 486, yy + 4, 13, '#ffffff', 'right');
    });
    if (res === 'win') for (let i = 0; i < 3; i++) U.star(ctx, lx + (i - 1) * 56, 452 - (i === 1 ? 8 : 0), i === 1 ? 24 : 19, true, T > 0.4 + i * 0.3 ? 1 : 0.01);
    // right: the wagon wheel
    const wx = 680, wy = 300;
    U.text(ctx, 'WAGON WHEEL', wx, 166, 20, '#ffffff', 'center');
    U.wagon(ctx, wx, wy, 108, m.log);
    const leg = [['6s', '#c46bff'], ['4s', '#2f86d8'], ['RUNS', '#ffffff'], ['OUT', '#e8483a']];
    leg.forEach((l, i) => { const lx2 = wx - 118 + i * 64; ctx.beginPath(); ctx.arc(lx2, 442, 6, 0, 7); ctx.fillStyle = l[1]; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = U.OUT; ctx.stroke(); U.text(ctx, l[0], lx2 + 10, 448, 14, '#ffffff', 'left'); });
    U.button(ctx, g, 'rematch', 250, 474, 290, 56, 'PLAY AGAIN', { primary: true });
    U.button(ctx, g, 'menu', 560, 474, 150, 56, 'MENU', { small: true, color: 'yellow' });
    ctx.restore();
  },
};
