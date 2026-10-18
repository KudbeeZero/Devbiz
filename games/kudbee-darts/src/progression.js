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
  const SHAPE_COST  = { torpedo: 0, straight: 50, bomb: 70, sharkcut: 110, hex: 180 };

  // ---- Leagues, chests and dart upgrades -----------------------------------
  // Trophies come from AI matches and campaign levels (not pass-and-play): a
  // win adds, a loss takes some back, but never below the floor of the best
  // league you've reached, so you can't be relegated. Each league pays a
  // bigger chest. Chests hold cards for the parts you own (barrels, tips,
  // flights) and sometimes a brand-new part. Cards + coins level a part up,
  // and every level steadies your hand a little (see steadiness()).
  const LEAGUES = [
    { name: 'BRONZE',   min: 0,    col: '#d08a4e', hi: '#ffd2a1', cards: 2, coins: 15 },
    { name: 'SILVER',   min: 100,  col: '#b9c7d8', hi: '#ffffff', cards: 3, coins: 20 },
    { name: 'GOLD',     min: 250,  col: '#ffc63d', hi: '#fff3b8', cards: 3, coins: 30 },
    { name: 'PLATINUM', min: 450,  col: '#5fe6d6', hi: '#d8fff9', cards: 4, coins: 40 },
    { name: 'DIAMOND',  min: 700,  col: '#7fb3ff', hi: '#e2edff', cards: 5, coins: 55 },
    { name: 'KUDBEE CHAMPION', min: 1000, col: '#ff4fd8', hi: '#ffd6f6', cards: 6, coins: 75 },
  ];
  const TROPHY_WIN = 30, TROPHY_LOSS = 12, TROPHY_STAR = 5;   // +5 per campaign star
  const MAX_PART_LV = 5;
  const UP_CARDS = [0, 3, 6, 12, 24];          // cards to go from level i to i+1
  const UP_COINS = [0, 40, 100, 220, 450];
  const STEADY_PER_LV = 0.015;                  // 1.5% less scatter + sway per level
  const NEW_PART_CHANCE = 0.12;                 // a chest may hold a part you don't own

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
      darts: { tip: 'steel', flight: 'standard', shape: 'torpedo' },
      ownedTips: ['steel'],
      ownedFlights: ['standard'],
      ownedShapes: ['torpedo'],
      // Learned flick model: ideal release speed this device's player tends to
      // throw at, the running sample count, and the most recent speeds.
      flick: { ideal: FLICK_DEFAULT, n: 0, recent: [] },
      // Darts Birds campaign: best stars (0-3) per level, by level index.
      campaign: { stars: [] },
      // Leagues + upgrades: trophies, best league reached, and per-part cards
      // and levels keyed 'shape:hex' / 'tip:needle' / 'flight:star'.
      league: { trophies: 0, best: 0 },
      parts: { cards: {}, lv: {} },
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

  function sanitizeLeague(raw) {
    const t = raw && Number.isFinite(raw.trophies) ? Math.max(0, Math.round(raw.trophies)) : 0;
    const b = raw && Number.isInteger(raw.best) ? Math.max(0, Math.min(LEAGUES.length - 1, raw.best)) : 0;
    return { trophies: Math.max(t, LEAGUES[b].min), best: Math.max(b, leagueOf(t)) };
  }
  function sanitizeParts(raw) {
    const out = { cards: {}, lv: {} };
    const ok = (k) => /^(shape|tip|flight):[a-z]+$/.test(k);
    if (raw && raw.cards) Object.keys(raw.cards).forEach((k) => { const v = raw.cards[k]; if (ok(k) && Number.isInteger(v) && v > 0) out.cards[k] = Math.min(v, 999); });
    if (raw && raw.lv) Object.keys(raw.lv).forEach((k) => { const v = raw.lv[k]; if (ok(k) && Number.isInteger(v) && v > 1) out.lv[k] = Math.min(v, MAX_PART_LV); });
    return out;
  }
  function leagueOf(trophies) {
    let i = 0;
    while (i + 1 < LEAGUES.length && trophies >= LEAGUES[i + 1].min) i++;
    return i;
  }

  function Progression() {
    this.data = defaults();
    this.onToast = null;   // (text, sub) callback for level-up / unlock toasts
    this.load();
  }

  Progression.LADDER = LADDER;
  Progression.LEAGUES = LEAGUES;
  Progression.MAX_PART_LV = MAX_PART_LV;
  Progression.leagueOf = leagueOf;

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
          this.data.ownedShapes = Array.isArray(parsed.ownedShapes) ? parsed.ownedShapes : d.ownedShapes;
          if (!KD.Sprites.BARRELS[this.data.darts.shape] || this.data.ownedShapes.indexOf(this.data.darts.shape) < 0) this.data.darts.shape = 'torpedo';
          this.data.flick = Object.assign(d.flick, parsed.flick || {});
          if (!Array.isArray(this.data.flick.recent)) this.data.flick.recent = [];
          this.data.settings = Object.assign(d.settings, parsed.settings || {});
          this.data.campaign = sanitizeCampaign(parsed.campaign);
          this.data.league = sanitizeLeague(parsed.league);
          this.data.parts = sanitizeParts(parsed.parts);
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
  Progression.prototype.shapeCost = function (id) { return SHAPE_COST[id] || 0; };
  Progression.prototype.ownsShape = function (id) { return this.data.ownedShapes.indexOf(id) !== -1; };
  Progression.prototype.chooseShape = function (id) {
    if (!this.ownsShape(id)) {
      const cost = this.shapeCost(id);
      if (this.data.coins < cost) return 'poor';
      this.data.coins -= cost;
      this.data.ownedShapes.push(id);
      this.data.darts.shape = id; this.save();
      if (this.onToast) this.onToast('BARREL UNLOCKED', (KD.Sprites.BARRELS[id] || {}).name || id);
      return 'bought';
    }
    this.data.darts.shape = id; this.save();
    return 'equipped';
  };

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

  // ---- Leagues ------------------------------------------------------------
  Progression.prototype.leagueIdx = function () { return leagueOf(this.data.league.trophies); };
  Progression.prototype.league = function () { return LEAGUES[this.leagueIdx()]; };

  // ---- Parts: owned, cards, levels, upgrades --------------------------------
  const PART_CATS = { shape: 'BARRELS', tip: 'TIPS', flight: 'FLIGHTS' };
  Progression.prototype.ownsPart = function (group, id) {
    return group === 'shape' ? this.ownsShape(id) : group === 'tip' ? this.ownsTip(id) : this.ownsFlight(id);
  };
  Progression.prototype.partLv = function (group, id) { return this.data.parts.lv[group + ':' + id] || 1; };
  Progression.prototype.partCards = function (group, id) { return this.data.parts.cards[group + ':' + id] || 0; };
  // What the next level costs, or null at the max.
  Progression.prototype.upgradeCost = function (group, id) {
    const lv = this.partLv(group, id);
    return lv >= MAX_PART_LV ? null : { cards: UP_CARDS[lv], coins: UP_COINS[lv], to: lv + 1 };
  };
  Progression.prototype.canUpgrade = function (group, id) {
    const c = this.upgradeCost(group, id);
    return !!c && this.ownsPart(group, id) && this.partCards(group, id) >= c.cards && this.data.coins >= c.coins;
  };
  // Returns 'upgraded' | 'max' | 'cards' | 'poor' | 'unowned'.
  Progression.prototype.upgradePart = function (group, id) {
    if (!this.ownsPart(group, id)) return 'unowned';
    const c = this.upgradeCost(group, id);
    if (!c) return 'max';
    if (this.partCards(group, id) < c.cards) return 'cards';
    if (this.data.coins < c.coins) return 'poor';
    const k = group + ':' + id;
    this.data.parts.cards[k] -= c.cards;
    if (!this.data.parts.cards[k]) delete this.data.parts.cards[k];
    this.data.coins -= c.coins;
    this.data.parts.lv[k] = c.to;
    this.save();
    return 'upgraded';
  };
  // Upgrade levels on what you have equipped (0..12), and the scatter/sway
  // multiplier they buy: 1.0 stock, down to 0.82 with everything maxed.
  Progression.prototype.upgradeLevels = function () {
    const d = this.data.darts;
    return (this.partLv('shape', d.shape) - 1) + (this.partLv('tip', d.tip) - 1) + (this.partLv('flight', d.flight) - 1);
  };
  Progression.prototype.steadiness = function () { return 1 - STEADY_PER_LV * this.upgradeLevels(); };
  // League rivals carry upgraded darts too, so the climb stays a fair fight.
  Progression.aiSteadiness = function (leagueIdx) { return 1 - STEADY_PER_LV * Math.min(12, leagueIdx * 2); };

  // Roll a chest for the current league. Cards go to parts you own (a part
  // that's maxed gets none); sometimes the chest holds a part you don't own,
  // which is yours right away. rnd defaults to Math.random (seedable in tests).
  Progression.prototype.rollChest = function (won, rnd) {
    rnd = rnd || Math.random;
    const L = this.league(), S = KD.Sprites;
    const chest = { league: this.leagueIdx(), coins: won ? L.coins : Math.round(L.coins / 3), cards: [], newPart: null };
    const owned = [], unowned = [];
    Object.keys(PART_CATS).forEach((g) => {
      Object.keys(S[PART_CATS[g]]).forEach((id) => {
        if (!this.ownsPart(g, id)) unowned.push([g, id]);
        else if (this.partLv(g, id) < MAX_PART_LV) owned.push([g, id]);
      });
    });
    if (won && unowned.length && rnd() < NEW_PART_CHANCE + 0.03 * chest.league) {
      const [g, id] = unowned[Math.floor(rnd() * unowned.length)];
      chest.newPart = { group: g, id: id };
    }
    let n = won ? L.cards : 1;
    const tally = {};
    while (n-- > 0 && owned.length) {
      // Favour what you have equipped: half the cards go to your current dart.
      const d = this.data.darts;
      const eq = [['shape', d.shape], ['tip', d.tip], ['flight', d.flight]].filter(([g, id]) => this.partLv(g, id) < MAX_PART_LV);
      const pick = eq.length && rnd() < 0.5 ? eq[Math.floor(rnd() * eq.length)] : owned[Math.floor(rnd() * owned.length)];
      const k = pick[0] + ':' + pick[1];
      tally[k] = (tally[k] || 0) + 1 + (rnd() < 0.25 ? 1 : 0);
    }
    Object.keys(tally).forEach((k) => { const [g, id] = k.split(':'); chest.cards.push({ group: g, id: id, n: tally[k] }); });
    return chest;
  };

  // Bank a chest: coins, cards, and any new part.
  Progression.prototype.applyChest = function (chest) {
    const d = this.data;
    d.coins += chest.coins;
    chest.cards.forEach((c) => { const k = c.group + ':' + c.id; d.parts.cards[k] = (d.parts.cards[k] || 0) + c.n; });
    if (chest.newPart) {
      const { group: g, id } = chest.newPart;
      const list = g === 'shape' ? d.ownedShapes : g === 'tip' ? d.ownedTips : d.ownedFlights;
      if (list.indexOf(id) < 0) list.push(id);
    }
    this.save();
  };

  // Trophies for a finished match. Returns { delta, from, to, leagueFrom, leagueTo, promoted }.
  Progression.prototype.awardTrophies = function (won, stars) {
    const lg = this.data.league, from = lg.trophies, leagueFrom = leagueOf(from);
    const floor = LEAGUES[lg.best].min;
    const to = won ? from + TROPHY_WIN + TROPHY_STAR * (stars || 0) : Math.max(floor, from - TROPHY_LOSS);
    lg.trophies = to;
    const leagueTo = leagueOf(to);
    const promoted = leagueTo > lg.best;
    if (leagueTo > lg.best) lg.best = leagueTo;
    this.save();
    return { delta: to - from, from: from, to: to, leagueFrom: leagueFrom, leagueTo: leagueTo, promoted: promoted };
  };

  KD.Progression = Progression;
})(window.KD = window.KD || {});
