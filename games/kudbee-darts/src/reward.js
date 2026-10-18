/* =====================================================================
 * Kudbee Darts — reward.js
 * The post-match reward screen: trophies count into your league bar, a
 * LEAGUE UP! moment when you cross into a new league, then the league's
 * chest drops in. Tap it and it bursts open, dealing out part cards (and
 * sometimes a brand-new part) with each part's progress to its next level.
 * CONTINUE goes on to the match card; UPGRADE jumps to the Workshop.
 * The reward is already banked by the time this plays (game.js _onMatchEnd),
 * so skipping or quitting never loses anything.
 * ===================================================================== */
(function (KD) {
  'use strict';

  const Game = KD.Game, Util = KD.Util;
  const VIEW_H = 720;
  const C = { cyan: '#39e6ff', gold: '#ffd34d', green: '#7CFFb2', text: '#cfe9ff', dim: '#7d8aa8', red: '#ff5d6c' };
  const FONT = '"Space Grotesk", sans-serif';
  const COUNT_T = 1.5;      // trophy count-up ends
  const PROMO_T = 2.4;      // LEAGUE UP! hold
  const DEAL_GAP = 0.3;     // seconds between dealt cards
  const CAT = { shape: 'BARRELS', tip: 'TIPS', flight: 'FLIGHTS' };
  const KIND = { shape: 'BARREL', tip: 'TIP', flight: 'FLIGHT' };
  const ease = (u) => 1 - Math.pow(1 - Util.clamp(u, 0, 1), 3);
  // Draw text no wider than maxW, shrinking the font if it has to.
  function fitText(ctx, txt, x, y, maxW, px, weight) {
    let size = px;
    ctx.font = (weight || 'bold') + ' ' + size + 'px ' + FONT;
    while (size > 8 && ctx.measureText(txt).width > maxW) { size -= 1; ctx.font = (weight || 'bold') + ' ' + size + 'px ' + FONT; }
    ctx.fillText(txt, x, y);
  }

  // src: { reward, won, xp, bonus }. A match passes its matchResult; a bonus
  // chest (bought with 💎) skips straight to the chest and returns to the Workshop.
  Game.prototype._enterReward = function (src) {
    src = src || this.matchResult;
    this.state = 'reward';
    this.rw = { phase: src.bonus ? 'chest' : 'trophies', t: 0, dealT: 0, src: src };
  };

  Game.prototype._openBonusChest = function () {
    const prog = this.progression, chest = prog.buyBonusChest();
    if (!chest) return false;
    const t = prog.data.league.trophies, li = prog.leagueIdx();
    this._enterReward({ bonus: true, won: true, xp: 0, reward: {
      trophies: { from: t, to: t, delta: 0, leagueFrom: li, leagueTo: li, promoted: false, bonusTokens: 0 },
      chest: chest, matchCoins: 0 } });
    return true;
  };

  // Every card the chest deals, in order: the new part first (the big one), then cards.
  Game.prototype._rewardCards = function () {
    const ch = this.rw.src.reward.chest, out = [];
    if (ch.newPart) out.push({ group: ch.newPart.group, id: ch.newPart.id, n: 0, isNew: true });
    ch.cards.forEach((c) => out.push(c));
    return out;
  };

  Game.prototype._rewardButtons = function () {
    const rw = this.rw, cx = this.viewW / 2;
    if (!rw || rw.phase !== 'open' || rw.dealT < this._rewardCards().length * DEAL_GAP + 0.35) return [];
    const prog = this.progression;
    const up = this._rewardCards().some((c) => prog.canUpgrade(c.group, c.id));
    return up
      ? [{ id: 'continue', label: 'CONTINUE', x: cx - 262, y: 636, w: 250, h: 62 },
         { id: 'upgrade', label: '⬆ UPGRADE NOW', x: cx + 12, y: 636, w: 250, h: 62, gold: true }]
      : [{ id: 'continue', label: 'CONTINUE', x: cx - 140, y: 636, w: 280, h: 62 }];
  };

  Game.prototype._leaveReward = function (to) {
    const bonus = this.rw.src.bonus;
    if (!bonus) { this.matchResult.rewardSeen = true; this.matchOverTimer = 0; }
    const back = this.rw && this.rw.src.back;
    this.rw = null;
    if (to === 'upgrade' || (bonus && back !== 'missions')) { this.wsPreview = null; this.state = 'workshop'; }
    else if (bonus) this.state = 'missions';
    else this.state = 'matchOver';
  };

  Game.prototype._updateReward = function (dt) {
    const rw = this.rw, r = rw.src.reward, p = this.input.pointer;
    const tap = p.justDown || this.input.justPressed('confirm');
    rw.t += dt;
    if (rw.phase === 'trophies') {
      const k = Math.min(1, Math.max(0, (rw.t - 0.35) / (COUNT_T - 0.35)));
      const step = Math.floor(k * 12);
      if (rw.t > 0.35 && step > (rw.tick || 0) && k < 1) { rw.tick = step; this.audio.count(k); }
      if (rw.t > COUNT_T + 0.5 || (tap && rw.t > 0.2)) {
        rw.phase = r.trophies.promoted ? 'promo' : 'chest'; rw.t = 0;
        if (r.trophies.promoted) { this.audio.leagueUp(); this._rewardBurst(this.viewW / 2, 330, KD.Progression.LEAGUES[r.trophies.leagueTo].col, true); }
      }
      return;
    }
    if (rw.phase === 'promo') {
      if (rw.t > PROMO_T || (tap && rw.t > 0.4)) { rw.phase = 'chest'; rw.t = 0; }
      return;
    }
    if (rw.phase === 'chest') {
      if (tap && rw.t > 0.35) {
        rw.phase = 'open'; rw.t = 0; rw.dealT = 0; rw.dealt = 0;
        this.audio.thud(); this.audio.chestOpen();
        this._rewardBurst(this.viewW / 2, 450, KD.Progression.LEAGUES[r.chest.league].col, false);
      }
      return;
    }
    // open: deal the cards, then the buttons take over.
    const cards = this._rewardCards();
    rw.dealT += dt;
    const shown = Math.min(cards.length, Math.floor(rw.dealT / DEAL_GAP) + 1);
    if (shown > (rw.dealt || 0)) { rw.dealt = shown; this.audio.card(!!cards[shown - 1].isNew); }
    if (!tap) return;
    const btns = this._rewardButtons();
    if (!btns.length) { rw.dealT = cards.length * DEAL_GAP + 0.35; rw.dealt = cards.length; return; }   // tap = deal the rest now
    if (this.input.justPressed('confirm')) { this._leaveReward('continue'); return; }
    for (let i = 0; i < btns.length; i++) {
      const b = btns[i];
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) { this.audio.tick(); this._leaveReward(b.id); return; }
    }
  };

  Game.prototype._rewardBurst = function (x, y, col, big) {
    if (!this.particles || this.reduceMotion) return;
    this.particles.shockwave(x, y, col, big ? 320 : 220, 0.8, big ? 6 : 4);
    this.particles.burst(x, y, col, big ? 40 : 26, big ? 520 : 380, { glow: true, life: 0.9, size: 3, drag: 2 });
    this.particles.burst(x, y, C.gold, big ? 24 : 14, 300, { glow: true, life: 0.7, size: 2, drag: 2 });
  };

  // ---- Drawing -------------------------------------------------------------
  Game.prototype._drawReward = function (ctx) {
    const rw = this.rw, r = rw.src.reward, W = this.viewW, cx = W / 2;
    const LG = KD.Progression.LEAGUES;
    const league = LG[rw.phase === 'trophies' ? r.trophies.leagueFrom : r.trophies.leagueTo];

    // Backdrop: a deep stage lit in the league's colour, with slow rays.
    ctx.save();
    ctx.fillStyle = 'rgba(3,5,14,0.82)'; ctx.fillRect(0, 0, W, VIEW_H);
    const glow = ctx.createRadialGradient(cx, 360, 20, cx, 360, W * 0.6);
    glow.addColorStop(0, league.col + '44'); glow.addColorStop(1, league.col + '00');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, VIEW_H);
    this._rewardRays(ctx, cx, 420, league.col, 0.06);
    ctx.restore();

    // Header.
    const won = rw.src.won;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 50px ' + FONT;
    ctx.shadowColor = won ? C.gold : C.red; ctx.shadowBlur = 22;
    ctx.fillStyle = won ? '#fff' : '#ffd6da';
    ctx.fillText(rw.src.bonus ? (rw.src.title || 'BONUS CHEST') : won ? 'VICTORY!' : 'DEFEAT', cx, 72);
    ctx.restore();

    this._drawLeagueStrip(ctx, rw, r);
    if (rw.phase === 'chest') this._drawChest(ctx, rw, r);
    if (rw.phase === 'open') this._drawDealt(ctx, rw, r);
    if (rw.phase === 'promo') this._drawPromo(ctx, rw, r);

    this._rewardButtons().forEach((b) => this._drawRewardButton(ctx, b));
    this.particles.draw(ctx);
    ctx.textAlign = 'left'; ctx.globalAlpha = 1;
  };

  Game.prototype._rewardRays = function (ctx, x, y, col, alpha) {
    if (this.reduceMotion) return;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(this.time * 0.12);
    ctx.fillStyle = col; ctx.globalAlpha = alpha;
    for (let i = 0; i < 14; i++) {
      ctx.rotate(Math.PI * 2 / 14);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-60, -1100); ctx.lineTo(60, -1100); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  };

  // League badge: a shield in the league's metal, rings and a dart in the
  // middle, and a crown on top for the champion league.
  Game.prototype._drawLeagueBadge = function (ctx, x, y, s, idx) {
    const L = KD.Progression.LEAGUES[idx];
    ctx.save();
    ctx.translate(x, y); ctx.scale(s, s);
    const shield = () => {
      ctx.beginPath();
      ctx.moveTo(0, -60); ctx.quadraticCurveTo(40, -58, 52, -44); ctx.lineTo(50, 6);
      ctx.quadraticCurveTo(44, 44, 0, 66); ctx.quadraticCurveTo(-44, 44, -50, 6); ctx.lineTo(-52, -44);
      ctx.quadraticCurveTo(-40, -58, 0, -60); ctx.closePath();
    };
    ctx.shadowColor = L.col; ctx.shadowBlur = 24;
    const g = ctx.createLinearGradient(0, -60, 0, 66);
    g.addColorStop(0, L.hi); g.addColorStop(0.45, L.col); g.addColorStop(1, '#1a1020');
    ctx.fillStyle = g; shield(); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 4; ctx.strokeStyle = '#0a0618'; shield(); ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = L.hi; ctx.globalAlpha = 0.7;
    ctx.save(); ctx.scale(0.84, 0.84); shield(); ctx.stroke(); ctx.restore();
    ctx.globalAlpha = 1;
    // Board rings.
    [26, 17, 8].forEach((rr, i) => {
      ctx.beginPath(); ctx.arc(0, 4, rr, 0, Math.PI * 2);
      ctx.fillStyle = i % 2 ? '#0a0618' : 'rgba(255,255,255,0.88)'; ctx.fill();
    });
    ctx.beginPath(); ctx.arc(0, 4, 4, 0, Math.PI * 2); ctx.fillStyle = '#ff3b5c'; ctx.fill();
    // A dart in the bull.
    ctx.strokeStyle = '#0a0618'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(2, 2); ctx.lineTo(30, -26); ctx.stroke();
    ctx.strokeStyle = L.hi; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(2, 2); ctx.lineTo(30, -26); ctx.stroke();
    ctx.fillStyle = L.col;
    ctx.beginPath(); ctx.moveTo(30, -26); ctx.lineTo(40, -26); ctx.lineTo(30, -36); ctx.closePath(); ctx.fill();
    // Pips: one per league step (champion gets a crown instead).
    if (idx === KD.Progression.LEAGUES.length - 1) {
      ctx.fillStyle = C.gold; ctx.strokeStyle = '#0a0618'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-26, -62); ctx.lineTo(-26, -84); ctx.lineTo(-13, -72); ctx.lineTo(0, -92);
      ctx.lineTo(13, -72); ctx.lineTo(26, -84); ctx.lineTo(26, -62); ctx.closePath(); ctx.stroke(); ctx.fill();
    } else {
      // One pip per league step: up to five in a row, a second row above
      // for the higher leagues (Master and up).
      const rows = idx < 5 ? [idx + 1] : [5, idx - 4];
      rows.forEach((n, row) => {
        for (let i = 0; i < n; i++) {
          const px = (i - (n - 1) / 2) * 13, py = 47 - row * 12;
          ctx.beginPath(); ctx.arc(px, py, 4.2, 0, Math.PI * 2); ctx.fillStyle = row ? C.gold : L.hi; ctx.fill();
          ctx.lineWidth = 1.5; ctx.strokeStyle = '#0a0618'; ctx.stroke();
        }
      });
    }
    ctx.restore();
  };

  // Trophy row: badge, league name, the trophy count ticking up and the bar
  // to the next league filling with it.
  Game.prototype._drawLeagueStrip = function (ctx, rw, r) {
    const LG = KD.Progression.LEAGUES, tr = r.trophies, W = this.viewW;
    const u = rw.phase === 'trophies' ? ease((rw.t - 0.35) / (COUNT_T - 0.35)) : 1;
    const shownT = Math.round(Util.lerp(tr.from, tr.to, u));
    const li = KD.Progression.leagueOf(shownT), L = LG[li], next = LG[li + 1];
    const bx = W / 2 - 150, by = 186;
    const pop = rw.phase === 'trophies' && !this.reduceMotion ? 1 + 0.08 * Math.sin(Math.min(1, rw.t / 0.4) * Math.PI) : 1;
    this._drawLeagueBadge(ctx, bx - 70, by, 0.95 * pop, li);
    ctx.save();
    ctx.textAlign = 'left';
    ctx.fillStyle = L.col; ctx.font = 'bold 26px ' + FONT;
    ctx.fillText(L.name + ' LEAGUE', bx, by - 34);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 34px ' + FONT;
    ctx.fillText('🏆 ' + shownT, bx, by + 6);
    const d = tr.delta;
    if (d !== 0 && rw.phase === 'trophies') {
      const a = Util.clamp(rw.t / 0.3, 0, 1);
      ctx.globalAlpha = a; ctx.fillStyle = d > 0 ? C.green : C.red; ctx.font = 'bold 26px ' + FONT;
      ctx.fillText((d > 0 ? '+' : '') + d, bx + 150 + (this.reduceMotion ? 0 : (1 - a) * 30), by + 4);
      ctx.globalAlpha = 1;
    }
    // Bar to the next league.
    const barW = 360, barY = by + 26;
    ctx.fillStyle = 'rgba(180,210,255,0.14)'; this._roundRect(ctx, bx, barY, barW, 16, 8); ctx.fill();
    const frac = next ? Util.clamp((shownT - L.min) / (next.min - L.min), 0, 1) : 1;
    if (frac > 0) {
      const g = ctx.createLinearGradient(bx, 0, bx + barW, 0);
      g.addColorStop(0, L.col); g.addColorStop(1, next ? next.col : L.hi);
      ctx.fillStyle = g; this._roundRect(ctx, bx, barY, Math.max(16, barW * frac), 16, 8); ctx.fill();
    }
    ctx.fillStyle = C.dim; ctx.font = '13px ' + FONT;
    ctx.fillText(next ? 'Next: ' + next.name + ' at 🏆 ' + next.min : 'Top league reached', bx, barY + 36);
    if (d === 0 && !rw.src.won) { ctx.fillStyle = C.dim; ctx.fillText('League floor: no trophies lost', bx + 210, barY + 36); }
    ctx.restore();
  };

  Game.prototype._drawPromo = function (ctx, rw, r) {
    const LG = KD.Progression.LEAGUES, L = LG[r.trophies.leagueTo], W = this.viewW, cx = W / 2;
    const a = Util.clamp(rw.t / 0.25, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(3,5,14,0.9)'; ctx.fillRect(0, 0, W, VIEW_H);
    this._rewardRays(ctx, cx, 340, L.col, 0.16);
    ctx.textAlign = 'center';
    ctx.shadowColor = L.col; ctx.shadowBlur = 28; ctx.fillStyle = '#fff';
    ctx.font = 'bold 60px ' + FONT; ctx.fillText('LEAGUE UP!', cx, 130);
    ctx.shadowBlur = 0;
    const s = this.reduceMotion ? 1.6 : 1.6 * (1 + 0.35 * Math.exp(-rw.t * 6) * Math.cos(rw.t * 18));
    this._drawLeagueBadge(ctx, cx, 340, s * Math.min(1, rw.t / 0.22 + 0.2), r.trophies.leagueTo);
    ctx.fillStyle = L.col; ctx.font = 'bold 40px ' + FONT; ctx.fillText(L.name, cx, 520);
    ctx.fillStyle = C.text; ctx.font = '16px ' + FONT;
    ctx.fillText('Bigger chests · tougher rivals with upgraded darts', cx, 556);
    if (r.trophies.bonusTokens) {
      ctx.fillStyle = C.cyan; ctx.font = 'bold 22px ' + FONT;
      ctx.fillText('+' + r.trophies.bonusTokens + ' 💎 league bonus', cx, 590);
    }
    ctx.fillStyle = C.dim; ctx.font = '13px ' + FONT;
    if (rw.t > 0.6) ctx.fillText('tap to continue', cx, 622);
    ctx.restore();
  };

  // The league chest: dark wood with bands in the league's metal; it drops in,
  // bounces, then wobbles and glows until you tap it.
  Game.prototype._drawChestShape = function (ctx, x, y, s, idx, lidOpen) {
    const L = KD.Progression.LEAGUES[idx];
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    const O = '#0a0618';
    // Body.
    ctx.lineWidth = 5; ctx.strokeStyle = O; ctx.lineJoin = 'round';
    const wood = ctx.createLinearGradient(0, -10, 0, 60);
    wood.addColorStop(0, '#7a4a24'); wood.addColorStop(1, '#3a210f');
    ctx.fillStyle = wood;
    this._roundRect(ctx, -80, -6, 160, 66, 10); ctx.fill(); ctx.stroke();
    ctx.fillStyle = L.col;
    [-62, 46].forEach((bx) => { ctx.fillRect(bx, -6, 16, 66); ctx.strokeRect(bx, -6, 16, 66); });
    // Lid.
    ctx.save();
    if (lidOpen) { ctx.translate(-30 * lidOpen, -46 * lidOpen); ctx.rotate(-0.45 * lidOpen); ctx.globalAlpha *= 1 - 0.35 * lidOpen; }
    ctx.fillStyle = wood;
    ctx.beginPath(); ctx.moveTo(-84, -6); ctx.lineTo(-84, -34); ctx.quadraticCurveTo(0, -70, 84, -34); ctx.lineTo(84, -6); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = L.col;
    [-66, 46].forEach((bx) => {
      ctx.beginPath(); ctx.moveTo(bx, -6); ctx.lineTo(bx, -44 + (bx < 0 ? 8 : 4)); ctx.lineTo(bx + 18, -48 + (bx < 0 ? 4 : 8)); ctx.lineTo(bx + 18, -6); ctx.closePath();
      ctx.fill(); ctx.stroke();
    });
    ctx.restore();
    // Lock.
    if (!lidOpen) {
      ctx.fillStyle = L.hi; this._roundRect(ctx, -16, -16, 32, 30, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = O; ctx.beginPath(); ctx.arc(0, -4, 4, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(-2, -2, 4, 10);
    }
    ctx.restore();
  };

  Game.prototype._drawChest = function (ctx, rw, r) {
    const cx = this.viewW / 2, idx = r.chest.league, L = KD.Progression.LEAGUES[idx];
    const drop = this.reduceMotion ? 1 : ease(rw.t / 0.45);
    const bounce = this.reduceMotion ? 0 : Math.abs(Math.sin(Math.min(1, rw.t / 0.7) * Math.PI * 2)) * 14 * Math.max(0, 1 - rw.t / 0.7);
    const y = Util.lerp(260, 470, drop) - bounce;
    const wob = this.reduceMotion || rw.t < 0.7 ? 0 : Math.sin(this.time * 9) * 0.05 * (0.5 + 0.5 * Math.sin(this.time * 1.7));
    ctx.save();
    const g = ctx.createRadialGradient(cx, y + 10, 10, cx, y + 10, 190);
    g.addColorStop(0, L.col + '66'); g.addColorStop(1, L.col + '00');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, y + 10, 190, 0, Math.PI * 2); ctx.fill();
    ctx.translate(cx, y); ctx.rotate(wob);
    this._drawChestShape(ctx, 0, 0, 1.25, idx, 0);
    ctx.restore();
    ctx.save(); ctx.textAlign = 'center';
    ctx.fillStyle = L.col; ctx.font = 'bold 20px ' + FONT;
    ctx.fillText(L.name + ' CHEST', cx, 588);
    if (rw.t > 0.6) {
      const pulse = this.reduceMotion ? 1 : 0.6 + 0.4 * Math.sin(this.time * 5);
      ctx.globalAlpha = pulse; ctx.fillStyle = '#fff'; ctx.font = 'bold 22px ' + FONT;
      ctx.fillText('TAP TO OPEN', cx, 628);
    }
    ctx.restore();
  };

  // The opened chest at the bottom and its cards dealt out above it.
  Game.prototype._drawDealt = function (ctx, rw, r) {
    const W = this.viewW, cx = W / 2, cards = this._rewardCards(), n = cards.length;
    const lid = this.reduceMotion ? 1 : ease(rw.t / 0.3);
    ctx.save(); ctx.globalAlpha = 0.9;
    this._drawChestShape(ctx, cx, 572, 0.62, r.chest.league, lid);
    ctx.restore();
    const gap = 16, cw = Math.min(200, (W - 80 - gap * (n - 1)) / Math.max(1, n)), ch = 226;
    const total = n * cw + (n - 1) * gap, x0 = cx - total / 2, y0 = 288;
    for (let i = 0; i < n; i++) {
      const u = (rw.dealT - i * DEAL_GAP) / 0.32;
      if (u <= 0) break;
      const e = this.reduceMotion ? 1 : ease(u);
      const tx = x0 + i * (cw + gap), x = Util.lerp(cx - cw / 2, tx, e), y = Util.lerp(520, y0, e);
      this._drawPartCard(ctx, cards[i], x, y, cw, ch, Math.min(1, e * 1.4));
    }
    // Coins from the chest (plus the win bonus), once the deal is done.
    if (rw.dealT > n * DEAL_GAP) {
      const coins = r.chest.coins + r.matchCoins;
      ctx.save(); ctx.textAlign = 'center';
      ctx.fillStyle = C.gold; ctx.font = 'bold 26px ' + FONT;
      ctx.fillText('+' + coins + ' 🪙', cx + 170, 584);
      if (r.chest.tokens) { ctx.fillStyle = C.cyan; ctx.fillText('+' + r.chest.tokens + ' 💎', cx + 290, 584); }
      if (rw.src.xp) {
        ctx.fillStyle = C.text; ctx.font = 'bold 22px ' + FONT;
        ctx.fillText('+' + rw.src.xp + ' XP', cx - 170, 584);
      }
      ctx.restore();
    }
    if (!n) {
      ctx.save(); ctx.textAlign = 'center'; ctx.fillStyle = C.text; ctx.font = '16px ' + FONT;
      ctx.fillText('Every part you own is maxed out!', cx, 400); ctx.restore();
    }
  };

  // One card: rarity frame, ×n (or NEW PART!), the part on a dart, its level,
  // and a bar of cards toward the next level (UPGRADE! when it's ready).
  Game.prototype._drawPartCard = function (ctx, c, x, y, w, h, flip) {
    const prog = this.progression, S = KD.Sprites, part = S[CAT[c.group]][c.id] || {};
    const tierCol = this._tierColor(part.tier);
    const cx = x + w / 2;
    ctx.save();
    ctx.translate(cx, y + h / 2); ctx.scale(flip, 1); ctx.translate(-cx, -(y + h / 2));
    ctx.fillStyle = 'rgba(12,16,34,0.95)';
    this._roundRect(ctx, x, y, w, h, 12); ctx.fill();
    ctx.lineWidth = c.isNew ? 3.5 : 2.5; ctx.strokeStyle = c.isNew ? C.gold : tierCol;
    ctx.shadowColor = c.isNew ? C.gold : tierCol; ctx.shadowBlur = c.isNew ? 22 : 10;
    this._roundRect(ctx, x, y, w, h, 12); ctx.stroke();
    ctx.shadowBlur = 0;
    // Header strip.
    ctx.fillStyle = (c.isNew ? C.gold : tierCol) + '33';
    this._roundRect(ctx, x + 4, y + 4, w - 8, 28, 9); ctx.fill();
    ctx.textAlign = 'center'; ctx.fillStyle = c.isNew ? C.gold : '#fff';
    ctx.font = 'bold ' + (c.isNew ? 15 : 20) + 'px ' + FONT;
    ctx.fillText(c.isNew ? 'NEW PART!' : '×' + c.n, cx, y + 25);
    // The part on your dart, pointing left, slid so the part sits mid-card.
    const d = prog.data.darts, skin = S.SKINS[prog.data.skins.equipped];
    const parts = { tip: d.tip, flight: d.flight, shape: d.shape }; parts[c.group] = c.id;
    const L = Math.min(118, w * 0.95);
    ctx.save();
    ctx.beginPath(); ctx.rect(x + 3, y + 34, w - 6, 70); ctx.clip();
    const off = c.group === 'tip' ? -L / 3 : c.group === 'flight' ? -L * 0.9 : -L * 0.55;
    ctx.translate(cx + off, y + 70); ctx.rotate(Math.PI);
    this.sprites.drawDart(ctx, L, skin, 0.3, parts);
    ctx.restore();
    // Name + rarity/kind, shrunk to fit the card.
    const tw = w - 14;
    ctx.fillStyle = '#fff'; fitText(ctx, part.name || c.id, cx, y + 126, tw, 16);
    ctx.fillStyle = tierCol; fitText(ctx, (part.tier || '').toUpperCase() + ' ' + KIND[c.group], cx, y + 146, tw, 12);
    // Level and cards toward the next one, then the bar.
    const lv = prog.partLv(c.group, c.id), cost = prog.upgradeCost(c.group, c.id), have = prog.partCards(c.group, c.id);
    const ready = prog.canUpgrade(c.group, c.id);
    const bx = x + 10, bw = w - 20, by = y + 178;
    ctx.textAlign = 'left'; ctx.fillStyle = C.gold; ctx.font = 'bold 13px ' + FONT;
    ctx.fillText('LV ' + lv, bx, by - 6);
    ctx.textAlign = 'right'; ctx.fillStyle = C.text; ctx.font = 'bold 13px ' + FONT;
    ctx.fillText(cost ? have + '/' + cost.cards : 'MAX', bx + bw, by - 6);
    ctx.fillStyle = 'rgba(180,210,255,0.14)'; this._roundRect(ctx, bx, by, bw, 12, 6); ctx.fill();
    const frac = cost ? Math.min(1, have / cost.cards) : 1;
    ctx.fillStyle = ready ? C.green : cost ? C.cyan : C.gold;
    if (frac > 0) { this._roundRect(ctx, bx, by, Math.max(12, bw * frac), 12, 6); ctx.fill(); }
    ctx.textAlign = 'center';
    if (ready) {
      ctx.globalAlpha = this.reduceMotion ? 1 : 0.7 + 0.3 * Math.sin(this.time * 6);
      ctx.fillStyle = C.green; fitText(ctx, '⬆ UPGRADE READY', cx, y + h - 12, tw, 13);
    } else if (c.isNew) {
      ctx.fillStyle = C.gold; fitText(ctx, 'Yours to equip', cx, y + h - 12, tw, 12, '');
    }
    ctx.restore();
  };

  // Menu corner: your league badge and trophies.
  Game.prototype._drawMenuLeague = function (ctx) {
    const prog = this.progression, li = prog.leagueIdx(), L = KD.Progression.LEAGUES[li];
    const x = this.viewW - 66, y = 74;
    this._drawLeagueBadge(ctx, x, y, 0.5, li);
    ctx.save(); ctx.textAlign = 'center';
    ctx.fillStyle = L.col; fitText(ctx, L.name, x, y + 52, 120, 13);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 15px ' + FONT;
    ctx.fillText('🏆 ' + prog.data.league.trophies, x, y + 72);
    ctx.restore();
    ctx.textAlign = 'left';
  };

  Game.prototype._drawRewardButton = function (ctx, b) {
    ctx.save();
    const col = b.gold ? C.gold : C.green;
    ctx.fillStyle = b.gold ? 'rgba(255,211,77,0.18)' : 'rgba(124,255,178,0.16)';
    this._roundRect(ctx, b.x, b.y, b.w, b.h, 14); ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 14;
    this._roundRect(ctx, b.x, b.y, b.w, b.h, 14); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff'; ctx.font = 'bold 22px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
    ctx.restore();
    ctx.textBaseline = 'alphabetic';
  };
})(window.KD = window.KD || {});
