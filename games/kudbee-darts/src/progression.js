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

  // ---- Flick auto-calibration ------------------------------------------
  // Every player flicks at their own natural speed — a fast phone swipe, a
  // short trackpad drag. Rather than hold one fixed "ideal" that only suits
  // some devices, the game learns each player's typical release speed over
  // their first throws and re-centers the power sweet-spot on it, so a clean
  // flick feels clean everywhere. FLICK_DEFAULT must match dart.js IDEAL_SPEED
  // (the fallback before any throw is recorded).
  const FLICK_DEFAULT = 1500;     // px/s, the un-calibrated starting ideal
  const FLICK_MIN = 700, FLICK_MAX = 2600;   // clamp the learned ideal to sane bounds
  const FLICK_RECENT = 8;         // recent flick speeds kept for the robust median
  const FLICK_FULL_AT = 4;        // genuine flicks before the player is fully trusted

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

  // Dart Workshop coin shop. Defaults are free; the rest are bought with coins
  // earned from matches. (Cosmetic only — they never change the physics.)
  const TIP_COST    = { steel: 0, needle: 40, neon: 80, goldp: 120, plasma: 200 };
  const FLIGHT_COST = { standard: 0, slim: 30, kite: 60, shark: 100, star: 140, ghost: 160 };

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
      // Dart Workshop loadout: equipped + owned tips/flights.
      darts: { tip: 'steel', flight: 'standard' },
      ownedTips: ['steel'],
      ownedFlights: ['standard'],
      // Learned flick model: ideal release speed this device's player tends to
      // throw at, the running sample count, and the most recent speeds.
      flick: { ideal: FLICK_DEFAULT, n: 0, recent: [] },
      // Darts Birds campaign: best stars (0-3) per level, by level index.
      campaign: { stars: [] },
      settings: { sound: true, boardTheme: 'neon' },
    };
  }

  // Best stars per campaign level. Anything that isn't a whole 0..3 number
  // is dropped to 0, and the list is padded or cut to the level count.
  function sanitizeCampaign(raw) {
    const n = KD.Campaign.LEVELS.length;
    const src = raw && Array.isArray(raw.stars) ? raw.stars : [];
    const stars = [];
    for (let i = 0; i < n; i++) {
      const v = src[i];
      stars.push(Number.isInteger(v) && v >= 0 && v <= 3 ? v : 0);
    }
    return { stars: stars };
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
          this.data.darts = Object.assign(d.darts, parsed.darts || {});
          this.data.ownedTips = parsed.ownedTips || d.ownedTips;
          this.data.ownedFlights = parsed.ownedFlights || d.ownedFlights;
          this.data.flick = Object.assign(d.flick, parsed.flick || {});
          if (!Array.isArray(this.data.flick.recent)) this.data.flick.recent = [];
          this.data.settings = Object.assign(d.settings, parsed.settings || {});
          this.data.campaign = sanitizeCampaign(parsed.campaign);
        }
      }
    } catch (e) { /* corrupt save -> defaults */ }
  };

  // Keep the best star count for a level. A level unlocks once the level
  // that opens it (the one before, or a side world's `after`) has a star.
  Progression.prototype.campaignStars = function (i) {
    return this.data.campaign.stars[i] || 0;
  };
  Progression.prototype.campaignUnlocked = function (i) {
    const prev = KD.Campaign.opener(i);
    return prev < 0 || this.campaignStars(prev) > 0;
  };
  Progression.prototype.recordLevel = function (i, stars) {
    const c = this.data.campaign.stars;
    const before = this.campaignStars(i);
    if (stars > before) c[i] = stars;
    this.save();
    return { best: Math.max(before, stars), improved: stars > before };
  };

  Progression.prototype.save = function () {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* ignore */ }
  };

  Progression.prototype.reset = function () {
    this.data = defaults();
    this.save();
  };

  // ---- Flick auto-calibration ------------------------------------------
  // The release speed the power band is currently centered on for this player.
  Progression.prototype.flickIdeal = function () {
    return (this.data.flick && this.data.flick.ideal) || FLICK_DEFAULT;
  };

  // Record one genuine flick's release speed (taps are filtered out upstream)
  // and re-center the ideal on the player. Early throws stay close to the
  // default; after a few the band sits on the player's own median speed.
  // Returns { ideal, justCalibrated }.
  Progression.prototype.recordFlick = function (relSpeed) {
    const f = this.data.flick || (this.data.flick = { ideal: FLICK_DEFAULT, n: 0, recent: [] });
    const s = Math.max(FLICK_MIN, Math.min(FLICK_MAX, relSpeed || 0));
    f.recent.push(s);
    if (f.recent.length > FLICK_RECENT) f.recent.shift();
    const wasCalibrated = f.n >= FLICK_FULL_AT;
    f.n++;
    // Robust center: the median of recent flicks, so one wild throw can't skew it.
    const sorted = f.recent.slice().sort(function (a, b) { return a - b; });
    const mid = sorted.length % 2
      ? sorted[(sorted.length - 1) / 2]
      : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
    // Blend from the default toward the player's own speed as confidence grows.
    const conf = Math.min(1, f.n / FLICK_FULL_AT);
    f.ideal = Math.max(FLICK_MIN, Math.min(FLICK_MAX, FLICK_DEFAULT * (1 - conf) + mid * conf));
    this.save();
    return { ideal: f.ideal, justCalibrated: !wasCalibrated && f.n >= FLICK_FULL_AT };
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

  // ---- Dart Workshop: tips & flights ------------------------------------
  Progression.prototype.tipCost = function (id) { return TIP_COST[id] || 0; };
  Progression.prototype.flightCost = function (id) { return FLIGHT_COST[id] || 0; };
  Progression.prototype.ownsTip = function (id) { return this.data.ownedTips.indexOf(id) !== -1; };
  Progression.prototype.ownsFlight = function (id) { return this.data.ownedFlights.indexOf(id) !== -1; };

  // Buy-if-needed-then-equip. Returns 'equipped' | 'bought' | 'poor'.
  Progression.prototype.chooseTip = function (id) {
    if (!this.ownsTip(id)) {
      const cost = this.tipCost(id);
      if (this.data.coins < cost) return 'poor';
      this.data.coins -= cost;
      this.data.ownedTips.push(id);
      this.data.darts.tip = id; this.save();
      if (this.onToast) this.onToast('TIP UNLOCKED', (KD.Sprites.TIPS[id] || {}).name || id);
      return 'bought';
    }
    this.data.darts.tip = id; this.save();
    return 'equipped';
  };
  Progression.prototype.chooseFlight = function (id) {
    if (!this.ownsFlight(id)) {
      const cost = this.flightCost(id);
      if (this.data.coins < cost) return 'poor';
      this.data.coins -= cost;
      this.data.ownedFlights.push(id);
      this.data.darts.flight = id; this.save();
      if (this.onToast) this.onToast('FLIGHT UNLOCKED', (KD.Sprites.FLIGHTS[id] || {}).name || id);
      return 'bought';
    }
    this.data.darts.flight = id; this.save();
    return 'equipped';
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
