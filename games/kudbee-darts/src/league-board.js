/* =====================================================================
 * Kudbee Darts — league-board.js
 * The League Leaderboard, ranked by trophies. MY LEAGUE shows the players
 * in your league around you; TOP 100 pages through the whole board.
 * When the online leaderboard server is configured (KD_LB_CONFIG.API_BASE)
 * the board is real players from it. Until then it is filled with a fixed
 * field of AI rivals, and the screen says so: nothing here pretends a bot
 * is a person.
 * ===================================================================== */
(function (KD) {
  'use strict';

  const Game = KD.Game, Util = KD.Util;
  const VIEW_H = 720;
  const C = { cyan: '#39e6ff', gold: '#ffd34d', green: '#7CFFb2', text: '#cfe9ff', dim: '#7d8aa8', violet: '#c46bff' };
  const FONT = '"Space Grotesk", sans-serif';
  const PAGE = 10, RIVALS = 160;

  // ---- The AI field --------------------------------------------------------
  const HEAD = ['Ace', 'Blaze', 'Bolt', 'Echo', 'Flick', 'Ghost', 'Hex', 'Jinx', 'Kilo', 'Lynx', 'Mako', 'Nova',
    'Onyx', 'Pike', 'Quill', 'Rook', 'Sable', 'Tango', 'Vex', 'Wren', 'Zed', 'Iris', 'Juno', 'Koda'];
  const TAIL = ['', 'Dart', 'X', '180', 'Bull', 'Arrow', 'Pro', 'Flight', 'Tungsten', 'Oche'];
  function prng(seed) {
    let a = seed | 0;
    return function () {
      a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  // A fixed field, so the board doesn't reshuffle every visit. Trophies are
  // spread low-heavy (most players are in the lower leagues) up to Champion,
  // and drift a little day to day so the board moves.
  let FIELD = null;
  function field() {
    if (FIELD) return FIELD;
    const r = prng(0x0D4A7), used = {};
    FIELD = [];
    for (let i = 0; i < RIVALS; i++) {
      let name;
      do { name = HEAD[Math.floor(r() * HEAD.length)] + TAIL[Math.floor(r() * TAIL.length)]; } while (used[name] && Object.keys(used).length < HEAD.length * TAIL.length);
      used[name] = 1;
      FIELD.push({ name: name, base: Math.floor(3100 * Math.pow(r(), 1.7)), phase: r() * 6.28 });
    }
    return FIELD;
  }
  function today() { return Math.floor(Date.now() / 864e5); }

  // All rows (rivals + you), best first, with rank and league.
  Game.prototype._boardRows = function () {
    const prog = this.progression, LO = KD.Progression;
    const online = this._lbBoard;
    let rows;
    if (online) {
      rows = online.map((e) => ({ name: e.name, trophies: e.value, you: !!e.you, ai: false }));
      if (!rows.some((x) => x.you)) rows.push({ name: 'You', trophies: prog.data.league.trophies, you: true, ai: false });
    } else {
      const day = today();
      rows = field().map((f) => ({ name: f.name, trophies: Math.max(0, f.base + Math.round(14 * Math.sin(day * 0.9 + f.phase))), ai: true }));
      rows.push({ name: 'You', trophies: prog.data.league.trophies, you: true, ai: false });
    }
    rows.sort((a, b) => b.trophies - a.trophies || (a.you ? -1 : b.you ? 1 : 0));
    rows.forEach((x, i) => { x.rank = i + 1; x.league = LO.leagueOf(x.trophies); });
    return rows;
  };

  // The rows a tab shows on the current page, and its page count.
  Game.prototype._boardView = function () {
    const rows = this._boardRows(), me = rows.find((x) => x.you);
    if (this.lbTab === 'league') {
      const mine = rows.filter((x) => x.league === me.league);
      const at = mine.indexOf(me);
      const start = Util.clamp(at - Math.floor(PAGE / 2), 0, Math.max(0, mine.length - PAGE));
      return { rows: mine.slice(start, start + PAGE), pages: 1, me: me, leagueRank: at + 1, leagueSize: mine.length, all: rows.length };
    }
    const top = rows.slice(0, 100), pages = Math.ceil(top.length / PAGE);
    this.lbPage = Util.clamp(this.lbPage || 0, 0, pages - 1);
    return { rows: top.slice(this.lbPage * PAGE, this.lbPage * PAGE + PAGE), pages: pages, me: me,
      leagueRank: rows.filter((x) => x.league === me.league).indexOf(me) + 1, leagueSize: rows.filter((x) => x.league === me.league).length, all: rows.length };
  };

  Game.prototype._openLeaderboard = function () {
    this.lbTab = this.lbTab || 'league';
    this.lbPage = 0;
    // Real players when the online league server is configured.
    const cfg = window.KD_LB_CONFIG || {};
    if (!cfg.API_BASE || !window.KDLeaderboard) return;
    const self = this;
    window.KDLeaderboard.create(cfg)
      .then((lb) => lb.leaderboard('trophies', 100))
      .then((res) => { if (res && Array.isArray(res.entries) && res.entries.length) self._lbBoard = res.entries; })
      .catch(() => { /* offline: keep the AI field */ });
  };

  // ---- Layout + input --------------------------------------------------------
  Game.prototype._boardGeom = function () {
    const W = this.viewW, wide = W >= 1300;
    const tx = wide ? 60 : 28, tw = wide ? Math.round(W * 0.56) : 560;
    return { wide: wide, tx: tx, tw: tw, top: 196, rh: 42, px: tx + tw + 28, pw: W - (tx + tw + 28) - (wide ? 50 : 24) };
  };

  Game.prototype._boardButtons = function () {
    const G = this._boardGeom(), cx = G.tx + G.tw / 2, v = this._boardView();
    const b = [
      { id: 'back', x: 24, y: 72, w: 110, h: 40 },
      { id: 'tab:league', x: cx - 214, y: 126, w: 204, h: 46 },
      { id: 'tab:top', x: cx + 10, y: 126, w: 204, h: 46 },
    ];
    if (this.lbTab === 'top' && v.pages > 1) {
      const py = G.top + PAGE * G.rh + 6;
      b.push({ id: 'prev', x: cx - 150, y: py, w: 90, h: 46 }, { id: 'next', x: cx + 60, y: py, w: 90, h: 46 },
        { id: 'findme', x: G.tx + G.tw - 130, y: py, w: 130, h: 46 });
    }
    return b;
  };

  Game.prototype._updateLeaderboard = function () {
    if (this.input.justPressed('back') || this.input.justPressed('pause')) { this.state = 'menu'; return; }
    const p = this.input.pointer;
    if (!p.justDown) return;
    const hit = this._boardButtons().find((b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h);
    if (!hit) return;
    this.audio.tick();
    if (hit.id === 'back') this.state = 'menu';
    else if (hit.id === 'tab:league') this.lbTab = 'league';
    else if (hit.id === 'tab:top') { this.lbTab = 'top'; this.lbPage = 0; }
    else if (hit.id === 'prev') this.lbPage = Math.max(0, this.lbPage - 1);
    else if (hit.id === 'next') this.lbPage++;
    else if (hit.id === 'findme') {
      const me = this._boardRows().find((x) => x.you);
      this.lbPage = me.rank <= 100 ? Math.floor((me.rank - 1) / PAGE) : this.lbPage;
      if (me.rank > 100) this.toasts.push({ text: 'NOT IN THE TOP 100 YET', sub: 'You are #' + me.rank + ' · win to climb', life: 2.4 });
    }
  };

  // ---- Drawing -------------------------------------------------------------
  Game.prototype._drawLeaderboard = function (ctx) {
    const G = this._boardGeom(), v = this._boardView(), LG = KD.Progression.LEAGUES, prog = this.progression;
    const online = !!this._lbBoard;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.shadowColor = C.gold; ctx.shadowBlur = 20; ctx.fillStyle = '#fff';
    ctx.font = 'bold 44px ' + FONT;
    ctx.fillText('LEAGUE LEADERBOARD', this.viewW / 2, 66);
    ctx.shadowBlur = 0;
    ctx.fillStyle = online ? C.green : C.violet; ctx.font = '13px ' + FONT;
    ctx.fillText(online ? 'ONLINE · REAL PLAYERS · RANKED BY TROPHIES'
      : 'RANKED BY TROPHIES · AI RIVALS UNTIL THE ONLINE LEAGUE GOES LIVE', this.viewW / 2, 92);
    ctx.restore();

    const btns = this._boardButtons();
    btns.forEach((b) => {
      if (b.id === 'back') { this._neonButton(ctx, { x: b.x, y: b.y, w: b.w, h: b.h, label: '← BACK', group: 'back', sel: false }); return; }
      const sel = (b.id === 'tab:league' && this.lbTab === 'league') || (b.id === 'tab:top' && this.lbTab === 'top');
      const label = b.id === 'tab:league' ? 'MY LEAGUE' : b.id === 'tab:top' ? 'TOP 100' : b.id === 'prev' ? '‹' : b.id === 'next' ? '›' : 'FIND ME';
      const dead = (b.id === 'prev' && this.lbPage === 0) || (b.id === 'next' && this.lbPage >= v.pages - 1);
      ctx.save(); ctx.globalAlpha = dead ? 0.35 : 1;
      this._neonButton(ctx, { x: b.x, y: b.y, w: b.w, h: b.h, label: label, group: 'tab', sel: sel });
      ctx.restore();
    });

    // Table.
    const { tx, tw, top, rh } = G;
    ctx.save();
    ctx.textAlign = 'left'; ctx.fillStyle = C.dim; ctx.font = 'bold 11px ' + FONT;
    ctx.fillText('#', tx + 12, top - 9);
    ctx.fillText('PLAYER', tx + 96, top - 9);
    ctx.fillText('LEAGUE', tx + tw * 0.56, top - 9);
    ctx.textAlign = 'right'; ctx.fillText('🏆', tx + tw - 14, top - 9);
    v.rows.forEach((r, i) => {
      const y = top + i * rh, h = rh - 6, cy = y + h / 2 + 1, L = LG[r.league];
      ctx.fillStyle = r.you ? 'rgba(124,255,178,0.13)' : (i % 2 ? 'rgba(255,255,255,0.03)' : 'rgba(10,16,32,0.55)');
      this._roundRect(ctx, tx, y, tw, h, 8); ctx.fill();
      if (r.you) {
        ctx.lineWidth = 2; ctx.strokeStyle = C.green; ctx.shadowColor = C.green; ctx.shadowBlur = 12;
        this._roundRect(ctx, tx, y, tw, h, 8); ctx.stroke(); ctx.shadowBlur = 0;
      }
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillStyle = r.rank === 1 ? C.gold : r.rank === 2 ? '#cdd9e6' : r.rank === 3 ? '#d59a5a' : C.text;
      ctx.font = 'bold 15px ' + FONT;
      ctx.fillText('' + r.rank, tx + 30, cy);
      this._drawLeagueBadge(ctx, tx + 72, cy, 0.22, r.league);
      ctx.textAlign = 'left';
      ctx.fillStyle = r.you ? C.green : '#fff'; ctx.font = 'bold 16px ' + FONT;
      ctx.fillText(r.name, tx + 96, cy);
      if (r.ai) {
        const nw = ctx.measureText(r.name).width;
        ctx.fillStyle = C.dim; ctx.font = 'bold 10px ' + FONT;
        ctx.fillText('AI', tx + 104 + nw, cy + 1);
      }
      ctx.fillStyle = L.col; ctx.font = 'bold 13px ' + FONT;
      ctx.fillText(L.name, tx + tw * 0.56, cy);
      ctx.textAlign = 'right'; ctx.fillStyle = r.you ? C.green : C.cyan; ctx.font = 'bold 16px ' + FONT;
      ctx.fillText('' + r.trophies, tx + tw - 14, cy);
      ctx.textBaseline = 'alphabetic';
    });
    if (this.lbTab === 'top' && v.pages > 1) {
      ctx.textAlign = 'center'; ctx.fillStyle = C.dim; ctx.font = 'bold 13px ' + FONT;
      ctx.fillText((this.lbPage + 1) + ' / ' + v.pages, tx + tw / 2, top + PAGE * rh + 34);
    }
    ctx.restore();

    this._drawBoardCard(ctx, G, v);
    ctx.textAlign = 'left';
  };

  // Right column: your league, rank, progress, wallet and record.
  Game.prototype._drawBoardCard = function (ctx, G, v) {
    const prog = this.progression, d = prog.data, LG = KD.Progression.LEAGUES;
    const li = prog.leagueIdx(), L = LG[li], next = LG[li + 1];
    const x = G.px, w = G.pw, y = 126, h = VIEW_H - y - 40;
    ctx.save();
    ctx.fillStyle = 'rgba(8,12,26,0.72)'; this._roundRect(ctx, x, y, w, h, 14); ctx.fill();
    ctx.strokeStyle = L.col; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.5; this._roundRect(ctx, x, y, w, h, 14); ctx.stroke();
    ctx.globalAlpha = 1;
    const cx = x + w / 2;
    this._drawLeagueBadge(ctx, cx, y + 82, 0.8, li);
    ctx.textAlign = 'center';
    ctx.fillStyle = L.col; ctx.font = 'bold 22px ' + FONT; ctx.fillText(L.name + ' LEAGUE', cx, y + 170);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 26px ' + FONT; ctx.fillText('🏆 ' + d.league.trophies, cx, y + 202);
    ctx.fillStyle = C.text; ctx.font = '14px ' + FONT;
    ctx.fillText('#' + v.leagueRank + ' of ' + v.leagueSize + ' in ' + L.name + '  ·  #' + v.me.rank + ' overall', cx, y + 228);
    // Bar to the next league.
    const bx = x + 22, bw = w - 44, by = y + 244;
    ctx.fillStyle = 'rgba(180,210,255,0.14)'; this._roundRect(ctx, bx, by, bw, 12, 6); ctx.fill();
    const frac = next ? Util.clamp((d.league.trophies - L.min) / (next.min - L.min), 0, 1) : 1;
    ctx.fillStyle = L.col; if (frac > 0) { this._roundRect(ctx, bx, by, Math.max(12, bw * frac), 12, 6); ctx.fill(); }
    ctx.fillStyle = C.dim; ctx.font = '12px ' + FONT;
    ctx.fillText(next ? (next.min - d.league.trophies) + ' 🏆 to ' + next.name : 'Top league', cx, by + 30);
    // Wallet + record.
    const x01 = d.stats.x01, cri = d.stats.cricket;
    const lines = [
      ['Coins · Tokens', '🪙 ' + d.coins + '   💎 ' + d.tokens],
      ['Wins', (x01.won + cri.won) + '  (best streak ' + d.bestStreak + ')'],
      ['Best checkout', x01.bestCheckout ? '' + x01.bestCheckout : '—'],
      ['180s', '' + x01.total180s],
    ];
    lines.forEach((ln, i) => {
      const ly = by + 66 + i * 30;
      if (ly > y + h - 12) return;
      ctx.textAlign = 'left'; ctx.fillStyle = C.dim; ctx.font = '13px ' + FONT; ctx.fillText(ln[0], x + 22, ly);
      ctx.textAlign = 'right'; ctx.fillStyle = C.text; ctx.font = 'bold 14px ' + FONT; ctx.fillText(ln[1], x + w - 22, ly);
    });
    ctx.restore();
  };
})(window.KD = window.KD || {});
