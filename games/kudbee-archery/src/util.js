const KAR = {};

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
  data: { muted: false, mode: 0, dist: 1, level: 1, best: [0, 0, 0, 0], stars: [0, 0, 0, 0], stats: { arrows: 0, tens: 0, xs: 0, duels: 0, wins: 0 } },
  load() {
    try {
      const raw = window.localStorage.getItem(this.KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && typeof d === 'object') {
          const D = this.data, pick = (v, n) => (Number.isInteger(v) && v >= 0 && v < n ? v : null);
          D.muted = !!d.muted;
          if (pick(d.mode, 2) !== null) D.mode = d.mode;
          if (pick(d.dist, 4) !== null) D.dist = d.dist;
          if (pick(d.level, 3) !== null) D.level = d.level;
          for (const k of ['best', 'stars']) if (Array.isArray(d[k])) for (let i = 0; i < 4; i++) if (typeof d[k][i] === 'number') D[k][i] = d[k][i];
          if (d.stats && typeof d.stats === 'object') for (const k in D.stats) if (typeof d.stats[k] === 'number') D.stats[k] = d.stats[k];
        }
      }
    } catch (e) { /* storage unavailable */ }
    return this.data;
  },
  save() { try { window.localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) { /* ignore */ } },
};
