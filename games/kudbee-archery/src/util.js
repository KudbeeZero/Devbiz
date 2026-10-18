const KAR = {};
// (the Tour's save arrays below are sized for its 30 levels; engine.mjs checks this against KAR.TOUR.length)

KAR.Util = {
  clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; },
  lerp(a, b, t) { return a + (b - a) * t; },
  smooth(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); },
  easeOut(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return 1 - Math.pow(1 - t, 3); },
  // Small seeded PRNG: deliveries, catches and cosmetic detail are all reproducible.
  rng(seed) {
    let s = seed >>> 0;
    const f = function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.gauss = function () {
      let u = 0, v = 0;
      while (u === 0) u = f();
      while (v === 0) v = f();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };
    f.pick = arr => arr[Math.floor(f() * arr.length) % arr.length];
    return f;
  },
};

// Settings + stats persistence. Every access is wrapped: private windows,
// blocked storage and quota errors must never break the game.
KAR.Store = {
  KEY: 'kudbee.archery.v1',
  data: { muted: false, haptics: true, mode: 5, tourLv: 0, tour: { stars: Array(30).fill(0), best: Array(30).fill(0) }, gear: { bow: 0, fletch: 0, sight: 0 }, tut: 0, dist: 1, level: 1, best: [0, 0, 0, 0], stars: [0, 0, 0, 0], trickBest: 0, swingBest: 0, daily: { day: 0, best: 0, plays: 0, first: 0 }, stats: { arrows: 0, tens: 0, xs: 0, duels: 0, wins: 0, bestStreak: 0, robins: 0, legendWins: 0, pops: 0, dailies: 0, starBoxes: 0 }, ach: {}, gems: 0, kit: { bow: 0, arrow: 0 }, ownBow: 1, ownArrow: 1, quest: null, agent: true, agentLog: [], streak: { day: 0, n: 0, best: 0 }, aimSpeed: 1 },
  load() {
    try {
      const raw = window.localStorage.getItem(this.KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && typeof d === 'object') {
          const D = this.data, pick = (v, n) => (Number.isInteger(v) && v >= 0 && v < n ? v : null);
          D.muted = !!d.muted;
          if (typeof d.haptics === 'boolean') D.haptics = d.haptics;
          if (typeof d.agent === 'boolean') D.agent = d.agent;
          if (Array.isArray(d.agentLog) && KAR.Agent) D.agentLog = d.agentLog.slice(-KAR.Agent.KEEP).map(x => KAR.Agent.clean(x)).filter(x => x);      // ROBIN remembers your last arrows
          if (pick(d.mode, 6) !== null) D.mode = d.mode;
          if (pick(d.aimSpeed, 3) !== null) D.aimSpeed = d.aimSpeed;
          // the day streak: whole numbers, a streak no longer than the days since day 1 (and a best at least as long)
          if (d.streak && typeof d.streak === 'object') { const s = d.streak; if (Number.isInteger(s.day) && s.day >= 0 && s.day < 1e5 && Number.isInteger(s.n) && s.n >= 0 && s.n <= s.day && Number.isInteger(s.best) && s.best >= s.n && s.best <= s.day) D.streak = { day: s.day, n: s.n, best: s.best }; }
          const v1 = d.tour && Array.isArray(d.tour.stars) && d.tour.stars.length === 15 && KAR.TOUR_V1;   // a save from the 15-level tour
          if (pick(d.tourLv, v1 ? 15 : 30) !== null) D.tourLv = v1 ? v1[d.tourLv] : d.tourLv;
          if (d.gear && typeof d.gear === 'object') for (const k in D.gear) if (pick(d.gear[k], KAR.GEAR ? KAR.GEAR[k].length : 5) !== null) D.gear[k] = d.gear[k];
          if (Number.isInteger(d.tut)) D.tut = d.tut;
          // stars are whole numbers 0..3 and bests 0..150 (a corrupt or hand-edited save can't open every level and all the gear)
          const ok = (k, v) => Number.isInteger(v) && v >= 0 && v <= (k === 'stars' ? 3 : 150);
          if (d.tour && typeof d.tour === 'object') for (const k of ['stars', 'best']) if (Array.isArray(d.tour[k])) for (let i = 0; i < Math.min(v1 ? v1.length : 30, d.tour[k].length); i++) if (ok(k, d.tour[k][i])) D.tour[k][v1 ? v1[i] : i] = d.tour[k][i];
          if (typeof d.trickBest === 'number') D.trickBest = d.trickBest;
          if (typeof d.swingBest === 'number') D.swingBest = d.swingBest;
          if (d.daily && typeof d.daily === 'object') for (const k in D.daily) if (typeof d.daily[k] === 'number') D.daily[k] = d.daily[k];
          if (pick(d.dist, 4) !== null) D.dist = d.dist;
          if (pick(d.level, 3) !== null) D.level = d.level;
          for (const k of ['best', 'stars']) if (Array.isArray(d[k])) for (let i = 0; i < 4; i++) if (typeof d[k][i] === 'number') D[k][i] = d[k][i];
          if (d.stats && typeof d.stats === 'object') for (const k in D.stats) if (Number.isInteger(d.stats[k]) && d.stats[k] >= 0) D.stats[k] = d.stats[k];
          // gems + kit: whole numbers in range; you can only have kit you own (the club kit is always yours)
          if (Number.isInteger(d.gems) && d.gems >= 0) D.gems = Math.min(d.gems, 1e6);
          for (const k of ['ownBow', 'ownArrow']) if (Number.isInteger(d[k]) && d[k] >= 0 && d[k] < 16) D[k] = d[k] | 1;
          if (d.kit && typeof d.kit === 'object') { if (pick(d.kit.bow, 4) !== null && (D.ownBow >> d.kit.bow & 1)) D.kit.bow = d.kit.bow; if (pick(d.kit.arrow, 4) !== null && (D.ownArrow >> d.kit.arrow & 1)) D.kit.arrow = d.kit.arrow; }
          if (d.quest && typeof d.quest === 'object') D.quest = d.quest;        // checked (and rolled over) by KAR.questToday
          if (d.ach && typeof d.ach === 'object' && !Array.isArray(d.ach)) for (const k in d.ach) if (d.ach[k] === 1 && /^[a-z0-9]{2,12}$/.test(k)) D.ach[k] = 1;
        }
      }
    } catch (e) { /* storage unavailable */ }
    return this.data;
  },
  save() { try { window.localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) { /* ignore */ } },
};
