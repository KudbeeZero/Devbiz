/* =====================================================================
 * Kudbee Darts — achievements.js
 * Lifetime goals (bullseyes, trebles, 180s, wins, leagues, upgrades...).
 * Counted from your darts in matches against the AI and Darts Birds, like
 * the daily missions. Each pays coins + 💎 the moment it unlocks, with a
 * toast; the ACHIEVEMENTS screen shows progress. Pure in-game rewards.
 * ===================================================================== */
(function (KD) {
  'use strict';

  const Game = KD.Game, Progression = KD.Progression;
  const C = { cyan: '#39e6ff', gold: '#ffd34d', green: '#7CFFb2', text: '#cfe9ff', dim: '#7d8aa8', violet: '#c46bff' };
  const FONT = '"Space Grotesk", sans-serif';
  const PER_PAGE = 8;

  // c = counter that fills it; mode 'max' counters (league, upgrade levels) are set, not added.
  const LIST = [
    { id: 'win1',     c: 'wins',     n: 1,    icon: '🏆', text: 'Win your first match',            coins: 25,  tokens: 1 },
    { id: 'win10',    c: 'wins',     n: 10,   icon: '🏆', text: 'Win 10 matches',                  coins: 60,  tokens: 3 },
    { id: 'win50',    c: 'wins',     n: 50,   icon: '👑', text: 'Win 50 matches',                  coins: 200, tokens: 10 },
    { id: 'darts100', c: 'darts',    n: 100,  icon: '➶',  text: 'Throw 100 darts',                 coins: 30,  tokens: 1 },
    { id: 'darts1k',  c: 'darts',    n: 1000, icon: '➶',  text: 'Throw 1,000 darts',               coins: 150, tokens: 6 },
    { id: 'bull1',    c: 'bull',     n: 1,    icon: '🔴', text: 'Hit your first bullseye',         coins: 25,  tokens: 1 },
    { id: 'bull25',   c: 'bull',     n: 25,   icon: '🔴', text: 'Hit 25 bullseyes',                coins: 120, tokens: 5 },
    { id: 'treble10', c: 'treble',   n: 10,   icon: '🎯', text: 'Hit 10 trebles',                  coins: 40,  tokens: 2 },
    { id: 'treble100',c: 'treble',   n: 100,  icon: '🎯', text: 'Hit 100 trebles',                 coins: 180, tokens: 8 },
    { id: 'double10', c: 'double',   n: 10,   icon: '◎',  text: 'Hit 10 doubles',                  coins: 40,  tokens: 2 },
    { id: 't20x25',   c: 't20',      n: 25,   icon: '🔥', text: 'Hit treble 20 twenty-five times', coins: 120, tokens: 5 },
    { id: 'ton5',     c: 'ton',      n: 5,    icon: '💯', text: 'Score 100+ in a turn 5 times',    coins: 70,  tokens: 3 },
    { id: 't180',     c: 't180',     n: 1,    icon: '🌟', text: 'Score a 180',                     coins: 100, tokens: 5 },
    { id: 't180x5',   c: 't180',     n: 5,    icon: '🌟', text: 'Score five 180s',                 coins: 250, tokens: 12 },
    { id: 'checkout5',c: 'checkout', n: 5,    icon: '✅', text: 'Win 5 legs of 301/501',           coins: 70,  tokens: 3 },
    { id: 'stars15',  c: 'stars',    n: 15,   icon: '⭐', text: 'Earn 15 stars in Darts Birds',    coins: 80,  tokens: 4 },
    { id: 'stars45',  c: 'stars',    n: 45,   icon: '⭐', text: 'Earn 45 stars in Darts Birds',    coins: 220, tokens: 10 },
    { id: 'gold',     c: 'league',   n: 2,    icon: '🥇', text: 'Reach GOLD league',               coins: 60,  tokens: 3, max: true },
    { id: 'diamond',  c: 'league',   n: 4,    icon: '💎', text: 'Reach DIAMOND league',            coins: 120, tokens: 6, max: true },
    { id: 'legend',   c: 'league',   n: 8,    icon: '🔱', text: 'Reach LEGEND league',             coins: 300, tokens: 15, max: true },
    { id: 'champ',    c: 'league',   n: 9,    icon: '👑', text: 'Become KUDBEE CHAMPION',          coins: 500, tokens: 25, max: true },
    { id: 'up1',      c: 'upgrade',  n: 1,    icon: '🔧', text: 'Upgrade a dart part',             coins: 30,  tokens: 2 },
    { id: 'up10',     c: 'upgrade',  n: 10,   icon: '🔧', text: 'Upgrade parts 10 times',          coins: 150, tokens: 8 },
  ];
  const BY_ID = {};
  LIST.forEach((a) => { BY_ID[a.id] = a; });
  Progression.ACHIEVEMENTS = LIST;

  // ---- Progression -----------------------------------------------------------
  // Repaired on every read: counters are non-negative ints, `got` only holds known ids.
  Progression.prototype.ach = function () {
    let a = this.data.ach;
    if (!a || typeof a !== 'object') a = this.data.ach = { have: {}, got: {} };
    if (!a.have || typeof a.have !== 'object') a.have = {};
    if (!a.got || typeof a.got !== 'object') a.got = {};
    Object.keys(a.have).forEach((k) => { const v = a.have[k]; if (!Number.isInteger(v) || v < 0) a.have[k] = 0; });
    Object.keys(a.got).forEach((k) => { if (!BY_ID[k]) delete a.got[k]; });
    return a;
  };
  Progression.prototype.achHave = function (c) { return this.ach().have[c] || 0; };
  Progression.prototype.achCount = function () { return Object.keys(this.ach().got).length; };
  // Count (or, for `max` counters, raise) a goal; returns the achievements it just unlocked.
  Progression.prototype.achEvent = function (c, amount, asMax) {
    const a = this.ach();
    const amt = Math.max(0, Math.floor(amount) || 0);
    a.have[c] = asMax ? Math.max(a.have[c] || 0, amt) : Math.min(1e9, (a.have[c] || 0) + amt);
    const out = [];
    LIST.forEach((def) => {
      if (def.c !== c || a.got[def.id] || a.have[c] < def.n) return;
      a.got[def.id] = 1;
      this.data.coins += def.coins;
      this.data.tokens += def.tokens;
      out.push(def);
    });
    this.save();
    return out;
  };
  // Rescan leagues after a promotion so a skipped league still counts.
  Progression.prototype.achLeague = function () { return this.achEvent('league', this.leagueIdx(), true); };

  // ---- Game: events from play ------------------------------------------------
  Game.prototype._ach = function (ev, n, asMax) {
    const prog = this.progression;
    let got = [];
    if (ev === 'dart') {
      const res = n;
      got = got.concat(prog.achEvent('darts', 1));
      if (res.ring === 'treble') got = got.concat(prog.achEvent('treble', 1));
      if (res.ring === 'double') got = got.concat(prog.achEvent('double', 1));
      if (res.ring === 'inbull' || res.ring === 'outbull') got = got.concat(prog.achEvent('bull', 1));
      if (res.ring === 'treble' && res.value === 20) got = got.concat(prog.achEvent('t20', 1));
    } else got = prog.achEvent(ev, n, asMax);
    got.forEach((def) => {
      this.toasts.push({ text: '🏅 ' + def.text.toUpperCase(), sub: 'ACHIEVEMENT  +' + def.coins + ' 🪙  +' + def.tokens + ' 💎', life: 3.2 });
      this.audio.levelUp();
    });
  };

  // ---- Screen ----------------------------------------------------------------
  Game.prototype._achLayout = function () {
    const total = Math.min(900, this.viewW - 60), x0 = this.viewW / 2 - total / 2, cw = (total - 14) / 2;
    const btns = [{ id: 'back', x: 24, y: 72, w: 110, h: 40 }];
    const pages = Math.ceil(LIST.length / PER_PAGE), page = Math.max(0, Math.min(pages - 1, this.achPage || 0));
    for (let k = 0; k < PER_PAGE; k++) {
      const i = page * PER_PAGE + k;
      if (i >= LIST.length) break;
      btns.push({ id: 'card:' + i, card: true, i: i, x: x0 + (k % 2) * (cw + 14), y: 124 + Math.floor(k / 2) * 112, w: cw, h: 100 });
    }
    btns.push({ id: 'prev', x: this.viewW / 2 - 150, y: 584, w: 90, h: 46, dis: page === 0 });
    btns.push({ id: 'next', x: this.viewW / 2 + 60, y: 584, w: 90, h: 46, dis: page >= pages - 1 });
    return btns;
  };

  Game.prototype._updateAchievements = function () {
    if (this.input.justPressed('back') || this.input.justPressed('pause')) { this.state = 'menu'; return; }
    const p = this.input.pointer;
    if (!p.justDown) return;
    const pages = Math.ceil(LIST.length / PER_PAGE);
    for (const b of this._achLayout()) {
      if (p.x < b.x || p.x > b.x + b.w || p.y < b.y || p.y > b.y + b.h) continue;
      if (b.id === 'back') { this.audio.tick(); this.state = 'menu'; return; }
      if (b.id === 'prev' && !b.dis) { this.audio.tick(); this.achPage = (this.achPage || 0) - 1; return; }
      if (b.id === 'next' && !b.dis) { this.audio.tick(); this.achPage = Math.min(pages - 1, (this.achPage || 0) + 1); return; }
    }
    if (p.x > this.viewW - 80 && p.y < 90) return;
  };

  Game.prototype._drawAchievements = function (ctx) {
    const prog = this.progression, a = prog.ach(), cx = this.viewW / 2;
    const pages = Math.ceil(LIST.length / PER_PAGE), page = Math.max(0, Math.min(pages - 1, this.achPage || 0));
    ctx.save();
    ctx.textAlign = 'center';
    ctx.shadowColor = C.gold; ctx.shadowBlur = 20; ctx.fillStyle = '#fff';
    ctx.font = 'bold 44px ' + FONT; ctx.fillText('ACHIEVEMENTS', cx, 66);
    ctx.shadowBlur = 0;
    ctx.fillStyle = C.violet; ctx.font = '14px ' + FONT;
    ctx.fillText(prog.achCount() + ' / ' + LIST.length + ' UNLOCKED  ·  REWARDS PAY THE MOMENT YOU EARN THEM', cx, 94);
    ctx.textAlign = 'right'; ctx.fillStyle = C.gold; ctx.font = 'bold 20px ' + FONT;
    ctx.fillText('🪙 ' + prog.data.coins + '   💎 ' + prog.data.tokens, this.viewW - 24, 52);
    ctx.restore();

    this._achLayout().forEach((b) => {
      if (b.id === 'back') { this._neonButton(ctx, { x: b.x, y: b.y, w: b.w, h: b.h, label: '← BACK', group: 'back', sel: false }); return; }
      if (b.card) { this._drawAchCard(ctx, b, LIST[b.i], a); return; }
      ctx.save();
      ctx.globalAlpha = b.dis ? 0.3 : 1;
      this._neonButton(ctx, { x: b.x, y: b.y, w: b.w, h: b.h, label: b.id === 'prev' ? '‹' : '›', group: 'page', sel: false });
      ctx.restore();
    });
    ctx.save();
    ctx.textAlign = 'center'; ctx.fillStyle = C.text; ctx.font = 'bold 16px ' + FONT;
    ctx.fillText((page + 1) + ' / ' + pages, cx, 613);
    ctx.restore();
  };

  Game.prototype._drawAchCard = function (ctx, b, def, a) {
    const have = Math.min(def.n, a.have[def.c] || 0), done = !!a.got[def.id];
    ctx.save();
    ctx.fillStyle = done ? 'rgba(255,211,77,0.10)' : 'rgba(10,16,32,0.7)';
    this._roundRect(ctx, b.x, b.y, b.w, b.h, 14); ctx.fill();
    ctx.lineWidth = done ? 2.2 : 1.2; ctx.strokeStyle = done ? C.gold : 'rgba(180,210,255,0.2)';
    if (done) { ctx.shadowColor = C.gold; ctx.shadowBlur = 10; }
    this._roundRect(ctx, b.x, b.y, b.w, b.h, 14); ctx.stroke();
    ctx.shadowBlur = 0;
    const ix = b.x + 42, iy = b.y + b.h / 2;
    ctx.globalAlpha = done ? 1 : 0.7;
    ctx.beginPath(); ctx.arc(ix, iy, 27, 0, Math.PI * 2);
    ctx.fillStyle = done ? 'rgba(255,211,77,0.2)' : 'rgba(57,230,255,0.1)'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = done ? C.gold : C.cyan; ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.font = '24px ' + FONT;
    ctx.fillText(done ? def.icon : def.icon, ix, iy + 1);
    ctx.textBaseline = 'alphabetic'; ctx.globalAlpha = 1;
    const tx = b.x + 84, tw = b.w - 84 - 14;
    ctx.textAlign = 'left'; ctx.fillStyle = '#fff';
    this._fitText(ctx, def.text, tx, b.y + 32, tw, 16);
    const by = b.y + 46, bh = 11, bw = tw * 0.6;
    ctx.fillStyle = 'rgba(180,210,255,0.14)'; this._roundRect(ctx, tx, by, bw, bh, 6); ctx.fill();
    if (have > 0) { ctx.fillStyle = done ? C.gold : C.cyan; this._roundRect(ctx, tx, by, Math.max(bh, bw * have / def.n), bh, 6); ctx.fill(); }
    ctx.fillStyle = C.text; ctx.font = 'bold 12px ' + FONT;
    ctx.fillText(have + ' / ' + def.n, tx + bw + 8, by + 10);
    ctx.fillStyle = done ? C.green : C.gold; ctx.font = 'bold 14px ' + FONT;
    ctx.fillText(done ? '✓ UNLOCKED' : '🪙 ' + def.coins + '   💎 ' + def.tokens, tx, b.y + 82);
    ctx.restore();
    ctx.textAlign = 'left';
  };
})(window.KD);
