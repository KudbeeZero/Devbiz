const KAB = {};

KAB.Util = {
  clamp(v, min, max) { return Math.max(min, Math.min(max, v)); },
  lerp(a, b, t) { return a + (b - a) * t; },
  dist(x1, y1, x2, y2) { const dx = x2 - x1, dy = y2 - y1; return Math.sqrt(dx * dx + dy * dy); },
  chance(p) { return Math.random() < p; },
  randRange(a, b) { return a + Math.random() * (b - a); },
  easeOut(t) { return 1 - Math.pow(1 - t, 3); },
  // Small seeded PRNG so cosmetic detail (cracks, stars) is stable per object.
  rng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },
};

// Progress + settings persistence. Every access is wrapped: private windows,
// blocked storage and quota errors must never break the game.
KAB.Store = {
  KEY: 'kudbee.birds.v2',
  data: { levels: {}, muted: false },
  load() {
    try {
      const raw = window.localStorage.getItem(this.KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && typeof d === 'object') {
          this.data.levels = d.levels && typeof d.levels === 'object' ? d.levels : {};
          this.data.muted = !!d.muted;
        }
      }
    } catch (e) { /* storage unavailable */ }
    return this.data;
  },
  save() {
    try { window.localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) { /* ignore */ }
  },
  best(i) { return this.data.levels[i] || { stars: 0, score: 0 }; },
  record(i, stars, score) {
    const prev = this.best(i);
    const isBest = score > prev.score;
    this.data.levels[i] = { stars: Math.max(prev.stars, stars), score: Math.max(prev.score, score) };
    this.save();
    return isBest;
  },
  unlocked(i) { return i === 0 || this.best(i - 1).stars > 0 || (typeof location !== 'undefined' && /[?&]unlock\b/.test(location.search || '')); },   // ?unlock opens every level (preview/QA)
};
