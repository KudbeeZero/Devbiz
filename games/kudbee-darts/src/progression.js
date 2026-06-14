/* =====================================================================
 * Kudbee Darts — progression.js
 * The "addictive" layer: XP + levels, win streaks, a climbable league
 * ladder of named AI opponents, unlockable dart skins, and per-mode stats —
 * all persisted to localStorage so progress survives a reload. Pure data;
 * the runtime stays offline and dependency-free. The shape is kept simple
 * and serializable so a future cloud sync can adopt it unchanged.
 * ===================================================================== */
(function (KD) {
  'use strict';

  const KEY = 'kd.profile.v1';

  // The ladder you climb in Career mode. Beating rank N unlocks rank N+1.
  const LADDER = [
    { name: 'Spark',  tier: 'Rookie', skin: 'cyan' },
    { name: 'Vex',    tier: 'Rookie', skin: 'green' },
    { name: 'Nova',   tier: 'Pro',    skin: 'green' },
    { name: 'Quill',  tier: 'Pro',    skin: 'violet' },
    { name: 'Mirage', tier: 'Pro',    skin: 'violet' },
    { name: 'Zenith', tier: 'Legend', skin: 'gold' },
    { name: 'Apex',   tier: 'Legend', skin: 'ember' },
  ];

  // Skins unlocked at level milestones (in addition to ladder rewards).
  const SKIN_UNLOCKS = { 3: 'green', 6: 'violet', 10: 'gold', 15: 'ember' };

  function defaults() {
    return {
      version: 1,
      xp: 0, level: 1, xpToNext: 100,
      streak: 0, bestStreak: 0,
      coins: 0,
      ladderRank: 0,
      stats: {
        x01: { played: 0, won: 0, darts: 0, total180s: 0, bestCheckout: 0 },
        cricket: { played: 0, won: 0, marks: 0, points: 0 },
      },
      skins: { owned: ['cyan'], equipped: 'cyan' },
      settings: { sound: true },
    };
  }

  function Progression() {
    this.data = defaults();
    this.onToast = null;   // (text, sub) callback for level-up / unlock toasts
    this.load();
  }

  Progression.LADDER = LADDER;

  Progression.prototype.load = function () {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.version === 1) {
          // shallow-merge over defaults so new fields appear gracefully
          const d = defaults();
          this.data = Object.assign(d, parsed);
          this.data.stats = Object.assign(d.stats, parsed.stats || {});
          this.data.skins = Object.assign(d.skins, parsed.skins || {});
          this.data.settings = Object.assign(d.settings, parsed.settings || {});
        }
      }
    } catch (e) { /* corrupt save -> defaults */ }
  };

  Progression.prototype.save = function () {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* ignore */ }
  };

  Progression.prototype.reset = function () {
    this.data = defaults();
    this.save();
  };

  // ---- Skins ------------------------------------------------------------
  Progression.prototype.owns = function (id) { return this.data.skins.owned.indexOf(id) !== -1; };
  Progression.prototype.equip = function (id) {
    if (this.owns(id)) { this.data.skins.equipped = id; this.save(); }
  };
  Progression.prototype.unlock = function (id) {
    if (id && !this.owns(id)) {
      this.data.skins.owned.push(id);
      const nm = (KD.Sprites.SKINS[id] || {}).name || id;
      if (this.onToast) this.onToast('SKIN UNLOCKED', nm);
    }
  };

  // ---- XP / levels ------------------------------------------------------
  Progression.prototype._levelUp = function () {
    this.data.level++;
    this.data.xp -= this.data.xpToNext;
    this.data.xpToNext = Math.round(this.data.xpToNext * 1.35);
    this.data.coins += 25;
    if (this.onToast) this.onToast('LEVEL ' + this.data.level, '+25 coins');
    const skin = SKIN_UNLOCKS[this.data.level];
    if (skin) this.unlock(skin);
  };

  Progression.prototype.addXP = function (amount) {
    this.data.xp += amount;
    while (this.data.xp >= this.data.xpToNext) this._levelUp();
  };

  /* Record a finished match. result = {
   *   mode:'x01'|'cricket', won:bool, isLadder:bool, ladderTier, margin,
   *   darts, t180, checkout, marks, points
   * } */
  Progression.prototype.recordMatch = function (result) {
    const d = this.data;
    const st = d.stats[result.mode];
    if (st) {
      st.played++;
      if (result.won) st.won++;
      if (result.mode === 'x01') {
        st.darts += result.darts || 0;
        st.total180s += result.t180 || 0;
        if ((result.checkout || 0) > st.bestCheckout) st.bestCheckout = result.checkout;
      } else {
        st.marks += result.marks || 0;
        st.points += result.points || 0;
      }
    }

    let xp = 30 + (result.t180 || 0) * 20 + (result.marks || 0) * 2;
    if (result.won) {
      xp += 60;
      d.streak++;
      if (d.streak > d.bestStreak) d.bestStreak = d.streak;
      xp = Math.round(xp * (1 + Math.min(d.streak, 5) * 0.1)); // streak bonus
      d.coins += 15;
      // Climb the ladder if this was the current rung.
      if (result.isLadder && result.ladderRank === d.ladderRank && d.ladderRank < LADDER.length - 1) {
        d.ladderRank++;
        const next = LADDER[d.ladderRank];
        if (next.skin) this.unlock(next.skin);
        if (this.onToast) this.onToast('LADDER UP', 'Next: ' + next.name);
      }
    } else {
      d.streak = 0;
    }
    this.addXP(xp);
    this.save();
    return xp;
  };

  KD.Progression = Progression;
})(window.KD = window.KD || {});
