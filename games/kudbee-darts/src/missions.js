/* =====================================================================
 * Kudbee Darts — missions.js
 * Daily missions: three a day, picked from a pool by the date (everyone
 * gets the same three on the same day), counted from your darts in matches
 * against the AI. Each pays coins + 💎 when you CLAIM it; claiming all
 * three opens the free DAILY CHEST on the chest screen. They roll over at
 * local midnight.
 * ===================================================================== */
(function (KD) {
  'use strict';

  const Game = KD.Game, Progression = KD.Progression, Util = KD.Util;
  const VIEW_H = 720;
  const C = { cyan: '#39e6ff', gold: '#ffd34d', green: '#7CFFb2', text: '#cfe9ff', dim: '#7d8aa8', violet: '#c46bff' };
  const FONT = '"Space Grotesk", sans-serif';

  // ev = the event that counts; test(res) narrows dart events.
  const POOL = [
    { id: 'win1',     ev: 'win',      n: 1,  coins: 30, tokens: 2, icon: '🏆', text: 'Win a match against the AI' },
    { id: 'win2',     ev: 'win',      n: 2,  coins: 60, tokens: 4, icon: '🏆', text: 'Win 2 matches against the AI' },
    { id: 'treble6',  ev: 'treble',   n: 6,  coins: 40, tokens: 3, icon: '🎯', text: 'Hit 6 trebles' },
    { id: 'treble12', ev: 'treble',   n: 12, coins: 70, tokens: 5, icon: '🎯', text: 'Hit 12 trebles' },
    { id: 'double5',  ev: 'double',   n: 5,  coins: 40, tokens: 3, icon: '◎',  text: 'Hit 5 doubles' },
    { id: 'bull3',    ev: 'bull',     n: 3,  coins: 50, tokens: 4, icon: '🔴', text: 'Hit 3 bullseyes' },
    { id: 't20x5',    ev: 't20',      n: 5,  coins: 70, tokens: 5, icon: '🔥', text: 'Hit treble 20 five times' },
    { id: 'ton2',     ev: 'ton',      n: 2,  coins: 50, tokens: 4, icon: '💯', text: 'Score 100+ in a turn twice' },
    { id: 'checkout', ev: 'checkout', n: 1,  coins: 40, tokens: 3, icon: '✅', text: 'Win a 301 or 501 leg' },
    { id: 'stars3',   ev: 'stars',    n: 3,  coins: 50, tokens: 4, icon: '⭐', text: 'Earn 3 stars in Darts Birds' },
    { id: 'darts60',  ev: 'darts',    n: 60, coins: 30, tokens: 2, icon: '➶',  text: 'Throw 60 darts' },
  ];
  const BY_ID = {};
  POOL.forEach((m) => { BY_ID[m.id] = m; });

  // Local calendar day as a number (20261018), so missions roll at the player's midnight.
  function dayKey(now) {
    const d = new Date(now == null ? Date.now() : now);
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }
  function pickFor(day) {
    let a = day | 0;
    const r = () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const out = [], evs = {};
    let guard = 0;
    while (out.length < 3 && guard++ < 200) {
      const m = POOL[Math.floor(r() * POOL.length)];
      if (evs[m.ev]) continue;            // one mission per kind of event
      evs[m.ev] = 1; out.push(m.id);
    }
    return out;
  }

  // ---- Progression: today's missions ---------------------------------------
  Progression.MISSIONS = POOL;
  Progression.dayKey = dayKey;
  // Today's state, rolled over (and repaired) on first use each day.
  Progression.prototype.daily = function () {
    const today = this._dayOverride || dayKey();
    let d = this.data.daily;
    const ok = d && d.day === today && Array.isArray(d.missions) && d.missions.length === 3
      && d.missions.every((m) => BY_ID[m.id] && Number.isInteger(m.have) && m.have >= 0);
    if (!ok) {
      d = this.data.daily = { day: today, missions: pickFor(today).map((id) => ({ id: id, have: 0, claimed: false })), chest: false };
      this.save();
    }
    return d;
  };
  // Count an event; returns the missions it just completed.
  Progression.prototype.missionEvent = function (ev, amount) {
    const done = [];
    this.daily().missions.forEach((m) => {
      const def = BY_ID[m.id];
      if (def.ev !== ev || m.have >= def.n) return;
      m.have = Math.min(def.n, m.have + (amount || 1));
      if (m.have >= def.n) done.push(def);
    });
    this.save();
    return done;
  };
  // Returns 'claimed' | 'notyet' | 'already'.
  Progression.prototype.claimMission = function (i) {
    const m = this.daily().missions[i], def = m && BY_ID[m.id];
    if (!m) return 'notyet';
    if (m.claimed) return 'already';
    if (m.have < def.n) return 'notyet';
    m.claimed = true;
    this.data.coins += def.coins;
    this.data.tokens += def.tokens;
    this.save();
    return 'claimed';
  };
  Progression.prototype.dailyChestReady = function () {
    const d = this.daily();
    return !d.chest && d.missions.every((m) => m.claimed);
  };
  Progression.prototype.claimDailyChest = function (rnd) {
    if (!this.dailyChestReady()) return null;
    this.daily().chest = true;
    const chest = this.rollChest(true, rnd);
    this.applyChest(chest);
    return chest;
  };
  // Something to collect: a finished mission or the chest.
  Progression.prototype.dailyClaimable = function () {
    const d = this.daily();
    return d.missions.some((m) => !m.claimed && m.have >= BY_ID[m.id].n) || this.dailyChestReady();
  };

  // ---- Game: events from play ------------------------------------------------
  Game.prototype._missionsOn = function () { return this.levelIdx != null || this.selOpp !== 'hotseat'; };
  Game.prototype._mission = function (ev, n) {
    const prog = this.progression;
    let done = [];
    if (ev === 'dart') {
      const res = n;
      done = done.concat(prog.missionEvent('darts', 1));
      if (res.ring === 'treble') done = done.concat(prog.missionEvent('treble', 1));
      if (res.ring === 'double') done = done.concat(prog.missionEvent('double', 1));
      if (res.ring === 'inbull' || res.ring === 'outbull') done = done.concat(prog.missionEvent('bull', 1));
      if (res.ring === 'treble' && res.value === 20) done = done.concat(prog.missionEvent('t20', 1));
    } else done = prog.missionEvent(ev, n);
    done.forEach((def) => this.toasts.push({ text: 'MISSION COMPLETE!', sub: def.text + ' · claim it in MISSIONS', life: 2.8 }));
  };

  // ---- Screen ----------------------------------------------------------------
  Game.prototype._missionLayout = function () {
    const cx = this.viewW / 2, w = Math.min(820, this.viewW - 60), x = cx - w / 2;
    const d = this.progression.daily();
    const btns = [{ id: 'back', x: 24, y: 72, w: 110, h: 40 }];
    d.missions.forEach((m, i) => {
      const y = 124 + i * 106;
      btns.push({ id: 'claim:' + i, row: true, i: i, x: x, y: y, w: w, h: 94, bx: x + w - 170, by: y + 19, bw: 154, bh: 56 });
    });
    btns.push({ id: 'chest', x: x, y: 450, w: w, h: 200, bx: x + w - 230, by: 520, bw: 210, bh: 62 });
    return btns;
  };

  Game.prototype._updateMissions = function () {
    if (this.input.justPressed('back') || this.input.justPressed('pause')) { this.state = 'menu'; return; }
    const p = this.input.pointer;
    if (!p.justDown) return;
    const prog = this.progression;
    const hitBtn = (b) => p.x >= b.bx && p.x <= b.bx + b.bw && p.y >= b.by && p.y <= b.by + b.bh;
    for (const b of this._missionLayout()) {
      if (b.id === 'back') {
        if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) { this.audio.tick(); this.state = 'menu'; return; }
        continue;
      }
      if (!hitBtn(b)) continue;
      this.audio.tick();
      if (b.row) {
        const r = prog.claimMission(b.i);
        if (r === 'claimed') {
          const def = BY_ID[prog.daily().missions[b.i].id];
          this.audio.chime(2);
          this.toasts.push({ text: '+' + def.coins + ' 🪙  +' + def.tokens + ' 💎', sub: def.text, life: 2.2 });
          if (this.particles && !this.reduceMotion) this.particles.burst(b.bx + b.bw / 2, b.by + b.bh / 2, C.gold, 22, 320, { glow: true, life: 0.7, size: 2.5, drag: 2 });
        }
      } else {
        const chest = prog.claimDailyChest();
        if (chest) {
          const t = prog.data.league.trophies, li = prog.leagueIdx();
          this._enterReward({ bonus: true, title: 'DAILY CHEST', back: 'missions', won: true, xp: 0, reward: {
            trophies: { from: t, to: t, delta: 0, leagueFrom: li, leagueTo: li, promoted: false, bonusTokens: 0 },
            chest: chest, matchCoins: 0 } });
        } else if (!prog.daily().chest) {
          this.toasts.push({ text: 'CLAIM ALL 3 MISSIONS', sub: 'Then the Daily Chest is yours', life: 2.2 });
        }
      }
      return;
    }
  };

  function untilMidnight() {
    const now = new Date(), next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const mins = Math.max(0, Math.round((next - now) / 60000));
    return Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm';
  }

  Game.prototype._drawMissions = function (ctx) {
    const prog = this.progression, d = prog.daily(), cx = this.viewW / 2;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.shadowColor = C.gold; ctx.shadowBlur = 20; ctx.fillStyle = '#fff';
    ctx.font = 'bold 44px ' + FONT; ctx.fillText('DAILY MISSIONS', cx, 66);
    ctx.shadowBlur = 0;
    ctx.fillStyle = C.violet; ctx.font = '14px ' + FONT;
    ctx.fillText('NEW MISSIONS IN ' + untilMidnight() + '  ·  PLAY THE AI OR DARTS BIRDS TO COUNT', cx, 94);
    ctx.textAlign = 'right'; ctx.fillStyle = C.gold; ctx.font = 'bold 20px ' + FONT;
    ctx.fillText('🪙 ' + prog.data.coins + '   💎 ' + prog.data.tokens, this.viewW - 24, 52);
    ctx.restore();

    this._missionLayout().forEach((b) => {
      if (b.id === 'back') { this._neonButton(ctx, { x: b.x, y: b.y, w: b.w, h: b.h, label: '← BACK', group: 'back', sel: false }); return; }
      if (b.row) this._drawMissionRow(ctx, b, d.missions[b.i]);
      else this._drawDailyChestPanel(ctx, b);
    });
  };

  Game.prototype._drawMissionRow = function (ctx, b, m) {
    const def = BY_ID[m.id], done = m.have >= def.n;
    ctx.save();
    ctx.fillStyle = m.claimed ? 'rgba(10,16,32,0.45)' : done ? 'rgba(124,255,178,0.10)' : 'rgba(10,16,32,0.7)';
    this._roundRect(ctx, b.x, b.y, b.w, b.h, 14); ctx.fill();
    ctx.lineWidth = done && !m.claimed ? 2.2 : 1.2;
    ctx.strokeStyle = done && !m.claimed ? C.green : 'rgba(180,210,255,0.2)';
    this._roundRect(ctx, b.x, b.y, b.w, b.h, 14); ctx.stroke();
    ctx.globalAlpha = m.claimed ? 0.55 : 1;
    // Icon medallion.
    const ix = b.x + 50, iy = b.y + b.h / 2;
    ctx.beginPath(); ctx.arc(ix, iy, 30, 0, Math.PI * 2);
    ctx.fillStyle = done ? 'rgba(124,255,178,0.18)' : 'rgba(57,230,255,0.12)'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = done ? C.green : C.cyan; ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.font = '26px ' + FONT;
    ctx.fillText(def.icon, ix, iy + 1);
    ctx.textBaseline = 'alphabetic';
    // Text, progress, reward.
    const tx = b.x + 96, tw = b.bx - tx - 24;
    ctx.textAlign = 'left'; ctx.fillStyle = '#fff';
    this._fitText(ctx, def.text, tx, b.y + 34, tw, 20);
    const by = b.y + 52, bh = 12;
    ctx.fillStyle = 'rgba(180,210,255,0.14)'; this._roundRect(ctx, tx, by, tw * 0.62, bh, 6); ctx.fill();
    const f = Math.min(1, m.have / def.n);
    if (f > 0) { ctx.fillStyle = done ? C.green : C.cyan; this._roundRect(ctx, tx, by, Math.max(bh, tw * 0.62 * f), bh, 6); ctx.fill(); }
    ctx.fillStyle = C.text; ctx.font = 'bold 13px ' + FONT;
    ctx.fillText(m.have + ' / ' + def.n, tx + tw * 0.62 + 10, by + 11);
    ctx.fillStyle = C.gold; ctx.font = 'bold 15px ' + FONT;
    ctx.fillText('🪙 ' + def.coins + '   💎 ' + def.tokens, tx, b.y + 84);
    // Button / state.
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (m.claimed) {
      ctx.fillStyle = C.green; ctx.font = 'bold 18px ' + FONT;
      ctx.fillText('✓ CLAIMED', b.bx + b.bw / 2, b.by + b.bh / 2);
    } else {
      const pulse = done && !this.reduceMotion ? 0.5 + 0.5 * Math.sin(this.time * 5) : 0;
      ctx.fillStyle = done ? 'rgba(124,255,178,' + (0.2 + 0.12 * pulse) + ')' : 'rgba(10,16,32,0.6)';
      this._roundRect(ctx, b.bx, b.by, b.bw, b.bh, 12); ctx.fill();
      ctx.lineWidth = done ? 2.5 : 1.2; ctx.strokeStyle = done ? C.green : 'rgba(180,210,255,0.25)';
      if (done) { ctx.shadowColor = C.green; ctx.shadowBlur = 10 + 8 * pulse; }
      this._roundRect(ctx, b.bx, b.by, b.bw, b.bh, 12); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = done ? '#fff' : C.dim; ctx.font = 'bold 20px ' + FONT;
      ctx.fillText(done ? 'CLAIM' : 'IN PROGRESS', b.bx + b.bw / 2, b.by + b.bh / 2 + 1);
    }
    ctx.restore();
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  };

  Game.prototype._drawDailyChestPanel = function (ctx, b) {
    const prog = this.progression, d = prog.daily(), ready = prog.dailyChestReady(), li = prog.leagueIdx();
    const L = Progression.LEAGUES[li];
    const claimed = d.missions.filter((m) => m.claimed).length;
    ctx.save();
    ctx.fillStyle = 'rgba(8,12,26,0.78)'; this._roundRect(ctx, b.x, b.y, b.w, b.h, 16); ctx.fill();
    ctx.lineWidth = ready ? 2.5 : 1.4; ctx.strokeStyle = ready ? C.gold : L.col + '88';
    if (ready) { ctx.shadowColor = C.gold; ctx.shadowBlur = 16; }
    this._roundRect(ctx, b.x, b.y, b.w, b.h, 16); ctx.stroke();
    ctx.shadowBlur = 0;
    const wob = ready && !this.reduceMotion ? Math.sin(this.time * 9) * 0.05 : 0;
    ctx.save(); ctx.translate(b.x + 120, b.y + 118); ctx.rotate(wob);
    ctx.globalAlpha = d.chest ? 0.45 : 1;
    this._drawChestShape(ctx, 0, 0, 0.95, li, d.chest ? 1 : 0);
    ctx.restore();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff'; ctx.font = 'bold 28px ' + FONT;
    ctx.fillText('DAILY CHEST', b.x + 240, b.y + 58);
    ctx.fillStyle = L.col; ctx.font = 'bold 15px ' + FONT;
    ctx.fillText(L.name + ' CHEST · ' + L.cards + ' cards · ' + L.coins + ' 🪙' + (L.tokens ? ' · ' + L.tokens + ' 💎' : ''), b.x + 240, b.y + 86);
    ctx.fillStyle = C.text; ctx.font = '15px ' + FONT;
    ctx.fillText(d.chest ? 'Opened today. A new one tomorrow.' : 'Claim all three missions to open it.', b.x + 240, b.y + 116);
    // Three pips: missions claimed.
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.arc(b.x + 252 + i * 30, b.y + 148, 10, 0, Math.PI * 2);
      ctx.fillStyle = i < claimed ? C.green : 'rgba(180,210,255,0.16)'; ctx.fill();
    }
    // Button.
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (!d.chest) {
      const pulse = ready && !this.reduceMotion ? 0.5 + 0.5 * Math.sin(this.time * 5) : 0;
      ctx.fillStyle = ready ? 'rgba(255,211,77,' + (0.2 + 0.12 * pulse) + ')' : 'rgba(10,16,32,0.6)';
      this._roundRect(ctx, b.bx, b.by, b.bw, b.bh, 12); ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = ready ? C.gold : 'rgba(180,210,255,0.25)';
      this._roundRect(ctx, b.bx, b.by, b.bw, b.bh, 12); ctx.stroke();
      ctx.fillStyle = ready ? '#fff' : C.dim; ctx.font = 'bold 22px ' + FONT;
      ctx.fillText(ready ? 'OPEN CHEST' : claimed + ' / 3 CLAIMED', b.bx + b.bw / 2, b.by + b.bh / 2 + 1);
    } else {
      ctx.fillStyle = C.green; ctx.font = 'bold 20px ' + FONT;
      ctx.fillText('✓ OPENED', b.bx + b.bw / 2, b.by + b.bh / 2);
    }
    ctx.restore();
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  };

  // Menu: a dot on MISSIONS when there is something to claim.
  const baseNeon = Game.prototype._neonButton;
  Game.prototype._neonButton = function (ctx, b) {
    baseNeon.call(this, ctx, b);
    if (b.id === 'nav:missions' && this.progression.dailyClaimable()) {
      const pulse = this.reduceMotion ? 1 : 0.75 + 0.25 * Math.sin(this.time * 6);
      ctx.save();
      ctx.fillStyle = '#ff3b5c'; ctx.globalAlpha = pulse;
      ctx.beginPath(); ctx.arc(b.x + b.w - 8, b.y + 8, 9, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#0a0618'; ctx.stroke();
      ctx.restore();
    }
  };
})(window.KD = window.KD || {});
