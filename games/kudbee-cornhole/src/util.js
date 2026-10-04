const KCH = {};

KCH.Util = {
  clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; },
  lerp(a, b, t) { return a + (b - a) * t; },
  smooth(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); },
  easeOut(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return 1 - Math.pow(1 - t, 3); },
  // Small seeded PRNG: simulations, AI noise and cosmetic detail are all reproducible.
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
    return f;
  },
};

// Settings + stats persistence. Every access is wrapped: private windows,
// blocked storage and quota errors must never break the game.
KCH.Store = {
  KEY: 'kudbee.cornhole.v2',
  data: { muted: false, difficulty: 1, stats: { played: 0, won: 0, bags: 0, holes: 0, airmails: 0, bestStreak: 0 } },
  load() {
    try {
      const raw = window.localStorage.getItem(this.KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && typeof d === 'object') {
          this.data.muted = !!d.muted;
          this.data.difficulty = d.difficulty === 0 || d.difficulty === 2 ? d.difficulty : 1;
          if (d.stats && typeof d.stats === 'object') for (const k in this.data.stats) if (typeof d.stats[k] === 'number') this.data.stats[k] = d.stats[k];
        }
      }
    } catch (e) { /* storage unavailable */ }
    return this.data;
  },
  save() { try { window.localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) { /* ignore */ } },
};
