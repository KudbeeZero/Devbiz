/* =====================================================================
 * Kudbee Archery — sim.js  (DOM-free: runs in Node for tests and bots)
 * Metres. x = lateral (+ right), y = height, z = down-range. The archer
 * stands at the origin; the target face centre is (0, FACE_Y, dist).
 * Arrows fly with gravity, quadratic drag against the AIR (so wind pushes
 * them sideways), and the sight is zeroed for still air: the player has to
 * hold off into the wind. Contents: CFG, Flight, scoring, Match, Bot.
 * ===================================================================== */

KAR.CFG = {
  G: 9.81, V0: 62, KD: 0.0011, WGAIN: 3.2,      // WGAIN: how hard the (game) wind shoves a flying arrow
  SHOOT: { x: 0, y: 1.55, z: 0 },
  FACE_Y: 1.3,
  DISTS: [18, 30, 50, 70], FACE: [0.40, 0.80, 1.22, 1.22], WIND: [1.2, 2.2, 3.5, 5.0],
  ENDS: 5, PER: 3,
  TOUCH_GAIN: 0.7,                                      // touch aims like a trackpad: sight px per finger px
  DRAW_T: 0.9, STEADY_T: 3.0, BASE_SWAY: 0.0016,       // radians of sight wobble at rest
  ROBIN: 0.009,                                          // metres: closer than this to an arrow in the face splits it
};
KAR.LEVELS = [
  { name: 'ROOKIE', sigma: 0.0034, wind: 0.55, read: 0.40 },
  { name: 'PRO',    sigma: 0.0019, wind: 0.8,  read: 0.22 },
  { name: 'LEGEND', sigma: 0.0011, wind: 1.0,  read: 0.10 },
];

// ---- ballistics -----------------------------------------------------------------
KAR.Flight = {
  // Integrates one arrow. Returns { samples:[{t,x,y,z}], hit:{x,y,t,vx,vy,vz}|null, ground:bool }
  run(dist, yaw, pitch, speed, wind) {
    const C = KAR.CFG, dt = 1 / 240, S = [];
    const cp = Math.cos(pitch);
    let x = C.SHOOT.x, y = C.SHOOT.y, z = C.SHOOT.z;
    let vx = speed * Math.sin(yaw) * cp, vy = speed * Math.sin(pitch), vz = speed * Math.cos(yaw) * cp;
    let t = 0, n = 0;
    S.push({ t, x, y, z });
    while (t < 6) {
      const rx = vx - wind * C.WGAIN, ry = vy, rz = vz, rs = Math.hypot(rx, ry, rz);
      const ax = -C.KD * rs * rx, ay = -C.G - C.KD * rs * ry, az = -C.KD * rs * rz;
      const px = x, py = y, pz = z;
      vx += ax * dt; vy += ay * dt; vz += az * dt;
      x += vx * dt; y += vy * dt; z += vz * dt; t += dt; n++;
      if (z >= dist) {
        const f = (dist - pz) / (z - pz);
        const hx = px + (x - px) * f, hy = py + (y - py) * f, ht = t - dt + dt * f;
        S.push({ t: ht, x: hx, y: hy, z: dist });
        return { samples: S, hit: { x: hx, y: hy, t: ht, vx, vy, vz }, ground: false };
      }
      if (y <= 0) { S.push({ t, x, y: 0, z }); return { samples: S, hit: null, ground: true, groundAt: { x, z, t } }; }
      if (n % 4 === 0) S.push({ t, x, y, z });
    }
    return { samples: S, hit: null, ground: true, groundAt: { x, z, t } };
  },

  // The (yaw, pitch) that puts a still-air, full-power arrow through the point (tx, ty) on the target plane.
  solve(dist, tx, ty) {
    const C = KAR.CFG;
    const yaw = Math.atan2(tx - C.SHOOT.x, dist);
    let lo = -0.2, hi = 0.45;
    for (let i = 0; i < 26; i++) {
      const mid = (lo + hi) / 2, r = this.run(dist, yaw, mid, C.V0, 0);
      const yy = r.hit ? r.hit.y : -1;
      if (yy < ty) lo = mid; else hi = mid;
    }
    return { yaw, pitch: (lo + hi) / 2 };
  },
};

// ---- scoring --------------------------------------------------------------------
KAR.Score = {
  // hit: {x,y} on the target plane. Returns { ring: 0..10, x: bool, r }
  ring(distIdx, hx, hy, faceD) {
    const C = KAR.CFG, R = (faceD || C.FACE[distIdx]) / 2, r = Math.hypot(hx, hy - C.FACE_Y);
    if (r > R) return { ring: 0, x: false, r };
    const w = R / 10;
    return { ring: 10 - Math.floor(r / w), x: r < w / 2, r };
  },
};

// ---- match ----------------------------------------------------------------------
// mode 'range': one archer, ENDS ends of PER arrows.  mode 'duel': you vs the CPU, alternate arrows,
// each end is worth 2 set points to the higher end total (1 each if level); first to 6 wins.
KAR.Match = class {
  constructor(opts) {
    opts = opts || {};
    const C = KAR.CFG;
    this.mode = opts.mode === 'duel' ? 'duel' : 'range';
    this.distIdx = opts.dist === undefined ? 1 : opts.dist;
    this.dist = C.DISTS[this.distIdx]; this.faceD = C.FACE[this.distIdx];
    this.levelIdx = opts.level === undefined ? 1 : opts.level; this.level = KAR.LEVELS[this.levelIdx];
    this.rng = KAR.Util.rng(opts.seed === undefined ? 1 : opts.seed);
    this.shooters = this.mode === 'duel' ? 2 : 1;
    this.ends = C.ENDS; this.per = C.PER;
    this.endNo = 0; this.arrowNo = 0;               // arrowNo counts arrows fired this end (all shooters)
    this.arrows = [[], []];                         // per shooter: [{ring,x,end,hit}]
    this.sets = [0, 0]; this.endScores = [];        // endScores[end] = [a, b]
    this.over = false; this.winner = -1;
    this.baseWind = 0; this._newEnd();
    this.log = [];
  }
  _newEnd() {
    const C = KAR.CFG, W = C.WIND[this.distIdx] * (this.mode === 'duel' ? this.level.wind : 1);
    this.baseWind = (this.rng() * 2 - 1) * W;
    this._gust();
  }
  _gust() { const W = KAR.CFG.WIND[this.distIdx]; this.wind = this.baseWind + this.rng.gauss() * 0.12 * W; }
  get shooter() { return this.mode === 'duel' ? this.arrowNo % 2 : 0; }
  get arrowsLeft() { return this.per * this.shooters - this.arrowNo; }
  total(s) { return this.arrows[s].reduce((a, h) => a + h.ring, 0); }
  xs(s) { return this.arrows[s].filter(h => h.x).length; }
  endTotal(s, end) { return this.arrows[s].filter(h => h.end === end).reduce((a, h) => a + h.ring, 0); }

  get max() { return this.ends * this.per * 10; }
  // Fire with the sight at (aimX, aimY) on the target plane, hand sway (sx, sy) in metres, draw power 0..1.
  shoot(aimX, aimY, sx, sy, power) {
    const C = KAR.CFG, sh = this.shooter, wind = this.wind;
    const sol = KAR.Flight.solve(this.dist, aimX + sx, aimY + sy);
    const speed = C.V0 * (0.72 + 0.28 * KAR.Util.clamp(power, 0, 1));
    const fl = KAR.Flight.run(this.dist, sol.yaw, sol.pitch, speed, wind);
    const res = { shooter: sh, end: this.endNo, wind, samples: fl.samples, hit: fl.hit, ground: fl.ground, ring: 0, x: false, short: false };
    let hl = fl.hit;                     // the hit in the target's own frame (the same thing unless the target moves)
    if (fl.hit && this.offAt) { const o = this.offAt(this.T + fl.hit.t); hl = { x: fl.hit.x - o.x, y: fl.hit.y - o.y }; }
    if (fl.hit) {
      const sc = KAR.Score.ring(this.distIdx, hl.x, hl.y, this.faceD); res.ring = sc.ring; res.x = sc.x; res.miss = sc.ring === 0;
      // ROBIN HOOD: on the face, within a shaft's width of an arrow already in it this end (it would split that arrow)
      if (!res.miss) for (let s = 0; s < 2 && !res.robin; s++) for (const a of this.arrows[s]) if (a.end === this.endNo && a.hit && a.ring && Math.hypot(a.hit.x - hl.x, a.hit.y - hl.y) < C.ROBIN) { res.robin = true; a.split = true; break; }
    }
    else { res.miss = true; res.short = true; }
    // a moving target carries its arrows with it - one that missed the boss altogether just flies on through
    const keep = fl.hit && !(this.offAt && res.miss && !this.onBoss(hl));
    this.arrows[sh].push({ ring: res.ring, x: res.x, robin: !!res.robin, end: this.endNo, hit: keep ? { x: hl.x, y: hl.y, vx: fl.hit.vx, vy: fl.hit.vy, vz: fl.hit.vz } : null });
    this.arrowNo++;
    this.log.push(res);
    res.endDone = this.arrowNo >= this.per * this.shooters;
    if (res.endDone) this._closeEnd(res);
    else this._gust();
    return res;
  }
  _closeEnd(res) {
    const e = this.endNo, a = this.endTotal(0, e), b = this.shooters > 1 ? this.endTotal(1, e) : 0;
    this.endScores.push([a, b]);
    if (this.shooters > 1) { if (a > b) this.sets[0] += 2; else if (b > a) this.sets[1] += 2; else { this.sets[0]++; this.sets[1]++; } }
    res.endScores = [a, b];
    this.endNo++; this.arrowNo = 0;
    if (this.mode === 'duel') {
      if (this.sets[0] >= 6 || this.sets[1] >= 6 || this.endNo >= this.ends) {
        this.over = true;
        this.winner = this.sets[0] > this.sets[1] ? 0 : this.sets[1] > this.sets[0] ? 1 : (this.total(0) > this.total(1) ? 0 : this.total(1) > this.total(0) ? 1 : -1);
      }
    } else if (this.endNo >= this.ends) this.over = true;
    if (!this.over) this._newEnd();
  }
  // Before the shooter's LAST arrow of the match/end: what does it need? Range: points for a new best and
  // for 3 stars. Duel (CPU's last arrow of an end): points the CPU needs to win the end. null when not the last.
  needs(best) {
    const C = KAR.CFG;
    if (this.over || this.arrowsLeft !== 1 || this.mode === 'swing') return null;
    if (this.mode === 'range') {
      if (this.endNo !== this.ends - 1) return null;
      const t = this.total(0), T3 = KAR.STARS[this.distIdx][1];
      return { best: best ? best + 1 - t : null, star3: t < T3 ? T3 - t : null };
    }
    const a = this.endTotal(0, this.endNo), b = this.endTotal(1, this.endNo);
    return { win: a - b + 1, tie: a - b };
  }
  // stars for a finished range (0..3)
  stars() {
    if (this.mode !== 'range' || !this.over) return 0;
    const T = KAR.STARS[this.distIdx], s = this.total(0);
    return s >= T[1] ? 3 : s >= T[0] ? 2 : s >= T[0] * 0.75 ? 1 : 0;
  }
};
KAR.STARS = [[112, 130], [118, 134], [112, 130], [92, 116]];       // [2-star, 3-star] out of 150
// 70 m opens once you have 6 stars across 18/30/50 (or you already have a score there).
KAR.UNLOCK70 = 6;
KAR.locked = (dist, data) => dist === 3 && !(data.best[3] > 0) && data.stars[0] + data.stars[1] + data.stars[2] < KAR.UNLOCK70;

// ---- SWINGER ------------------------------------------------------------------------
// The 30 m boss hangs from a frame on two parallel ropes, so it swings side to side like a playground swing
// and stays upright (rising a little at each end of the arc). A real pendulum: period 2*pi*sqrt(L/g). The
// swing grows each end. You score it like a range - 4 ends of 3 - but the face is wherever it will be when
// the arrow arrives, so you lead it. The clock T runs only when the game ticks it, like BALLOON POP.
KAR.Swing = class extends KAR.Match {
  constructor(opts) {
    opts = opts || {};
    super({ mode: 'range', dist: 1, seed: opts.seed });
    this.mode = 'swing'; this.ends = KAR.Swing.ENDS; this.T = 0;
    this.viewD = 2.0;                                   // the scope frames the whole swing, not just the face
  }
  _newEnd() {
    super._newEnd();
    this.th0 = KAR.Swing.AMP[Math.min(this.endNo || 0, KAR.Swing.AMP.length - 1)];
    this.ph = this.rng() * 6.283;
  }
  tick(dt) { this.T += dt; }
  offAt(T) {
    const L = KAR.Swing.L, w = Math.sqrt(KAR.CFG.G / L), th = this.th0 * Math.sin(w * T + this.ph);
    return { x: L * Math.sin(th), y: L * (1 - Math.cos(th)), th };
  }
  onBoss(h) { const bw = this.faceD * 0.62 + 0.06; return Math.abs(h.x) < bw && Math.abs(h.y - KAR.CFG.FACE_Y) < bw; }
};
KAR.Swing.L = 2.4; KAR.Swing.ENDS = 4; KAR.Swing.AMP = [0.16, 0.22, 0.28, 0.34];

// ---- THE TOUR (levels) ------------------------------------------------------------------
// Fifteen levels across three venues, each a short range with its own twist: the wind, a smaller face, a boss
// that slides along a rail or swings on ropes, gusts that change arrow to arrow. Stars come from the level's
// own thresholds; one star opens the next level. move: 'slide' (amp in metres, w rad/s) or 'swing' (amp in
// radians on Swing.L ropes). face: the face size as a fraction of the standard one at that distance.
KAR.VENUES = [
  { name: 'VILLAGE GREEN', sub: 'a still morning on the club field' },
  { name: 'FOREST GLADE', sub: 'late sun through the pines' },
  { name: 'MOUNTAIN PASS', sub: 'sunset, and the wind off the peaks' },
  { name: 'LANTERN NIGHT', sub: 'floodlights, fireflies and a cold wind' },
];
// Four worlds of six levels, like the Kudbee Birds worlds: each world ends in a BOSS level (crowned on the map).
// Star targets are tuned with bots (casual / good / expert, leading the movers): see eval/calibrate.mjs.
KAR.TOUR = [
  { v: 0, name: 'FIRST ARROWS',  dist: 0, ends: 2, wind: 0.25, stars: [36, 46, 54], tip: 'a calm day at 18 m · find the gold' },
  { v: 0, name: 'BREEZE',        dist: 0, ends: 3, wind: 0.8,  stars: [58, 70, 80], tip: 'a light crosswind · aim off into it' },
  { v: 0, name: 'ON THE RAIL',   dist: 0, ends: 3, wind: 0.3,  move: 'slide', amp: 0.7, w: 0.9, stars: [50, 64, 76], tip: 'the boss slides along a rail · lead it' },
  { v: 0, name: 'THIRTY METRES', dist: 1, ends: 3, wind: 0.8,  stars: [60, 72, 82], tip: 'further out, and the wind has longer to work' },
  { v: 0, name: 'GARDEN SWING',  dist: 0, ends: 3, wind: 0.4,  move: 'swing', amp: 0.14, stars: [50, 63, 76], tip: 'a gentle swing at 18 m · loose as it comes to you' },
  { v: 0, name: 'VILLAGE CUP',   dist: 1, ends: 4, wind: 1.0,  boss: true, stars: [80, 96, 108], tip: 'four ends for the cup' },
  { v: 1, name: 'SMALL GOLD',    dist: 1, ends: 3, wind: 0.6,  face: 0.6, stars: [48, 62, 74], tip: 'a 48 cm face · every ring is narrower' },
  { v: 1, name: 'ROPE SWING',    dist: 1, ends: 3, wind: 0.5,  move: 'swing', amp: 0.2, stars: [54, 68, 79], tip: 'the boss swings on ropes · loose as it comes to you' },
  { v: 1, name: 'GUSTS',         dist: 1, ends: 3, wind: 0.9,  gust: 0.45, stars: [56, 70, 82], tip: 'the wind changes arrow to arrow · watch the flags' },
  { v: 1, name: 'FAST RAIL',     dist: 1, ends: 3, wind: 0.5,  move: 'slide', amp: 1.0, w: 1.5, stars: [50, 64, 77], tip: 'a quicker rail · lead it more' },
  { v: 1, name: 'NEEDLE',        dist: 1, ends: 3, wind: 0.7,  gust: 0.3, face: 0.5, stars: [42, 56, 70], tip: 'a 40 cm face at 30 m in a fickle wind' },
  { v: 1, name: 'FOREST CROWN',  dist: 2, ends: 4, wind: 0.9,  boss: true, stars: [76, 94, 106], tip: '50 m for the crown' },
  { v: 2, name: 'HIGH WIND',     dist: 2, ends: 3, wind: 1.5,  stars: [54, 68, 79], tip: 'a strong crosswind · hold well off' },
  { v: 2, name: 'PENDULUM',      dist: 2, ends: 3, wind: 0.7,  move: 'swing', amp: 0.16, stars: [52, 66, 79], tip: 'a long swing at 50 m · time it' },
  { v: 2, name: 'EAGLE EYE',     dist: 3, ends: 3, wind: 0.7,  face: 0.75, stars: [40, 54, 66], tip: '70 m at a smaller face' },
  { v: 2, name: 'STORM RAIL',    dist: 2, ends: 3, wind: 1.2,  gust: 0.3, move: 'slide', amp: 0.9, w: 1.1, stars: [52, 66, 79], tip: 'a moving boss in a gusty wind' },
  { v: 2, name: 'SWING STORM',   dist: 2, ends: 3, wind: 1.2,  gust: 0.3, move: 'swing', amp: 0.14, stars: [52, 66, 79], tip: 'a swing in a crosswind · lead it and hold off' },
  { v: 2, name: 'THE SUMMIT',    dist: 3, ends: 5, wind: 1.3,  gust: 0.25, boss: true, stars: [80, 104, 124], tip: 'five ends at 70 m · the peak' },
  { v: 3, name: 'FIRST LANTERN', dist: 2, ends: 3, wind: 0.6,  stars: [57, 70, 80], tip: '50 m under the floodlights' },
  { v: 3, name: 'NIGHT RAIL',    dist: 2, ends: 3, wind: 0.6,  move: 'slide', amp: 1.0, w: 1.6, stars: [52, 66, 79], tip: 'a fast rail at 50 m · lead it in the dark' },
  { v: 3, name: 'FIREFLY',       dist: 3, ends: 3, wind: 0.6,  face: 0.65, stars: [36, 50, 64], tip: 'a tiny face at 70 m' },
  { v: 3, name: 'MIDNIGHT SWING',dist: 3, ends: 3, wind: 0.7,  move: 'swing', amp: 0.12, stars: [42, 58, 74], tip: 'a swing at 70 m · time it long' },
  { v: 3, name: 'NIGHT GALE',    dist: 3, ends: 3, wind: 1.6,  gust: 0.4, stars: [40, 54, 70], tip: 'a gale that changes every arrow' },
  { v: 3, name: 'LANTERN KING',  dist: 3, ends: 5, wind: 1.1,  gust: 0.25, move: 'slide', amp: 0.8, w: 1.2, face: 0.85, boss: true, stars: [74, 98, 120], tip: 'the last boss · five ends at 70 m on the rail' },
];
// the 15-level tour (before the worlds) saved progress by these indices
KAR.TOUR_V1 = [0, 1, 2, 3, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 17];
// one star opens the next level; a level you already have stars on stays open (so older saves keep their place)
KAR.tourOpen = (i, data) => i === 0 || (data.tour.stars[i - 1] || 0) > 0 || (data.tour.stars[i] || 0) > 0;
KAR.Stage = class extends KAR.Match {
  constructor(opts) {
    opts = opts || {};
    const lv = KAR.Util.clamp(opts.level | 0, 0, KAR.TOUR.length - 1), def = KAR.TOUR[lv], C = KAR.CFG;
    super({ mode: 'range', dist: def.dist, seed: opts.seed });
    this.mode = 'stage'; this.lv = lv; this.def = def; this.venue = def.v; this.ends = def.ends; this.T = 0;
    this.faceD = C.FACE[def.dist] * (def.face || 1);
    this.rng = KAR.Util.rng(opts.seed === undefined ? 1 : opts.seed); this.ph = this.rng() * 6.283;
    this._newEnd();                                    // again, now the level is known
    if (def.move) {
      this.move = def.move; this.offAt = def.move === 'swing' ? this._swingAt : this._slideAt;
      const span = def.move === 'swing' ? KAR.Swing.L * Math.sin(def.amp) : def.amp;
      this.viewD = Math.max(this.faceD, span * 1.25 + this.faceD * 0.75);
    }
  }
  get max() { return this.ends * this.per * 10; }
  _newEnd() {
    const def = this.def; if (!def) return;
    this.baseWind = (this.rng() * 2 - 1) * KAR.CFG.WIND[this.distIdx] * def.wind;
    this._gust();
  }
  _gust() { const def = this.def; if (!def) return; this.wind = this.baseWind + this.rng.gauss() * (def.gust || 0.12) * KAR.CFG.WIND[this.distIdx] * Math.max(0.5, def.wind); }
  tick(dt) { this.T += dt; }
  _slideAt(T) { const d = this.def; return { x: d.amp * Math.sin(d.w * T + this.ph), y: 0, th: 0 }; }
  _swingAt(T) {
    const L = KAR.Swing.L, w = Math.sqrt(KAR.CFG.G / L), th = this.def.amp * Math.sin(w * T + this.ph);
    return { x: L * Math.sin(th), y: L * (1 - Math.cos(th)), th };
  }
  onBoss(h) { const bw = this.faceD * 0.62 + 0.06; return Math.abs(h.x) < bw && Math.abs(h.y - KAR.CFG.FACE_Y) < bw; }
  stars() { if (!this.over) return 0; const s = this.total(0), T = this.def.stars; return s >= T[2] ? 3 : s >= T[1] ? 2 : s >= T[0] ? 1 : 0; }
  // before the last arrow: points needed to clear the level / for 3 stars / for a new best
  needs(best) {
    if (this.over || this.arrowsLeft !== 1 || this.endNo !== this.ends - 1) return null;
    const t = this.total(0), S = this.def.stars;
    return { best: best ? best + 1 - t : null, clear: t < S[0] ? S[0] - t : null, star3: t < S[2] ? S[2] - t : null };
  }
};

// ---- GEAR --------------------------------------------------------------------------------
// Cosmetic kit for your bow, unlocked by the stars you have earned (levels + ranges). Stars are never spent:
// an item opens for good once your total reaches its number. Nothing here changes how an arrow flies.
KAR.GEAR = {
  bow: [
    { name: 'CLUB OAK',      need: 0,  limb: '#a8703a', riser: '#6b4322', tip: null },
    { name: 'BLACK CARBON',  need: 6,  limb: '#3a3f47', riser: '#22262c', tip: '#e8483a' },
    { name: 'ROYAL BLUE',    need: 12, limb: '#2f6fc8', riser: '#1b3a6e', tip: '#ffd34d' },
    { name: 'CHERRY',        need: 20, limb: '#c0453e', riser: '#6e1f1c', tip: '#ffe9a8' },
    { name: 'GOLD LEAF',     need: 34, limb: '#e0a92e', riser: '#7a4f12', tip: '#fff6c8' },
  ],
  fletch: [
    { name: 'TEAM',          need: 0,  v: null },
    { name: 'FLAME',         need: 3,  v: ['#ff5a2a', '#ffb02e', '#ff5a2a'] },
    { name: 'LIME',          need: 9,  v: ['#7fe03a', '#e8ff9a', '#7fe03a'] },
    { name: 'RAINBOW',       need: 16, v: ['#ff4f5e', '#3fa0ff', '#ffd34d'] },
    { name: 'GOLD',          need: 28, v: ['#ffd34d', '#fff2a8', '#ffd34d'] },
  ],
  sight: [
    { name: 'CLASSIC',       need: 0,  c: '#fff6a8', steady: '#a9ff7a' },
    { name: 'ICE',           need: 5,  c: '#bff4ff', steady: '#6fe8ff' },
    { name: 'RUBY',          need: 14, c: '#ffc2cf', steady: '#ff5d8a' },
    { name: 'GOLD',          need: 24, c: '#ffe58a', steady: '#ffc21f' },
  ],
};
KAR.starTotal = data => data.tour.stars.reduce((a, b) => a + b, 0) + data.stars.reduce((a, b) => a + b, 0);
KAR.gearOpen = (kind, i, data) => KAR.starTotal(data) >= KAR.GEAR[kind][i].need;
// gear that opened between two star totals (for the results card)
KAR.gearBetween = (s0, s1) => { const out = []; for (const k of ['bow', 'fletch', 'sight']) for (const g of KAR.GEAR[k]) if (g.need > s0 && g.need <= s1) out.push({ kind: k, name: g.name }); return out; };

// ---- DAILY ----------------------------------------------------------------------------
// One BALLOON POP a day, the same for everyone: the seed comes from the UTC date, so the wind and the order,
// colours, heights and speeds of the balloons match on every device that day. #1 is 2026-10-17.
KAR.Daily = {
  EPOCH: 20743,
  day(now) { return Math.floor((now === undefined ? Date.now() : now) / 86400000) - this.EPOCH + 1; },
  seed(day) { let h = (day * 2654435761) >>> 0; h ^= h >>> 16; h = Math.imul(h, 0x45d9f3b) >>> 0; return (h ^ (h >>> 16)) >>> 0; },
  date(day) { return new Date((day + this.EPOCH - 1) * 86400000).toISOString().slice(0, 10); },
};

// ---- BALLOON POP (arcade) ---------------------------------------------------------------
// Balloons drift across a plane DIST metres down-range, pushed by the wind and bobbing. You have a quiver
// of arrows; each balloon popped scores (gold ones score more and refill 2 arrows), arrows that pop in
// consecutive shots build a combo multiplier, and an arrow flies on after a pop, so lined-up balloons can
// go together. The trick clock T only runs when the game ticks it (it slows with the slow-mo), so a shot
// fired at T0 meets each balloon where it will be at T0 + the arrow's flight time. Deterministic per seed.
KAR.Trick = class {
  constructor(opts) {
    opts = opts || {};
    const C = KAR.CFG;
    this.mode = 'trick'; this.distIdx = 1; this.dist = KAR.Trick.DIST; this.faceD = 3.2;
    this.rng = KAR.Util.rng(opts.seed === undefined ? 1 : opts.seed);
    this.shooters = 1; this.shooter = 0; this.per = 1; this.ends = 1; this.endNo = 0; this.arrowNo = 0;
    this.arrows = [[], []]; this.sets = [0, 0]; this.endScores = []; this.log = [];
    this.quiver = KAR.Trick.ARROWS; this.score = 0; this.combo = 0; this.bestCombo = 0; this.popped = 0;
    this.over = false; this.winner = -1; this.daily = opts.daily || 0;
    this.T = 0; this.balloons = []; this.nextId = 1; this.spawnT = 0;
    this.wind = (this.rng() * 2 - 1) * C.WIND[1] * 0.8; this.baseWind = this.wind;
    for (let i = 0; i < 4; i++) this._spawn(-3 + i * 1.6);       // a few already crossing at the start
  }
  get arrowsLeft() { return this.quiver; }
  total() { return this.score; }
  xs() { return 0; }
  stars() { return 0; }
  needs() { return null; }
  mult() { return Math.max(1, Math.min(5, this.combo)); }      // 1st pop x1, 2nd in a row x2 ... up to x5
  _spawn(age) {
    const r = this.rng, side = r() < 0.5 ? -1 : 1, heat = Math.min(1, this.popped / 24);
    const speed = (0.7 + r() * 1.2) * (1 + heat * 0.9);
    const b = { id: this.nextId++, born: this.T - (age || 0), x0: side * 7.2, vx: -side * speed, y0: 0.9 + r() * 2.1, ph: r() * 6.28,
      gold: r() < 0.12, col: Math.floor(r() * 4), popAt: null };
    this.balloons.push(b); return b;
  }
  pos(b, T) {
    const a = T - b.born;
    return { x: b.x0 + b.vx * a + this.wind * 0.18 * a, y: b.y0 + 0.22 * Math.sin(1.3 * a + b.ph) + 0.04 * a };
  }
  // advance the trick clock: retire popped / escaped balloons, keep the sky full
  tick(dt) {
    this.T += dt;
    this.balloons = this.balloons.filter(b => (b.popAt === null || this.T < b.popAt) && Math.abs(this.pos(b, this.T).x) < 7.6);
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.balloons.length < 7) { this._spawn(0); this.spawnT = 0.7 + this.rng() * 0.9; }
  }
  shoot(aimX, aimY, sx, sy, power) {
    const C = KAR.CFG, D = this.dist, T0 = this.T, R = KAR.Trick.R;
    const sol = KAR.Flight.solve(D, aimX + sx, aimY + sy);
    const speed = C.V0 * (0.72 + 0.28 * KAR.Util.clamp(power, 0, 1));
    const plane = KAR.Flight.run(D, sol.yaw, sol.pitch, speed, this.wind);              // where it crosses the balloons
    const fl = KAR.Flight.run(D + 45, sol.yaw, sol.pitch, speed, this.wind);            // ...and where it goes after
    const res = { shooter: 0, end: 0, wind: this.wind, samples: fl.samples, hit: null, ground: true, ring: 0, x: false, miss: true, short: !plane.hit, pops: [], points: 0, trick: true };
    if (plane.hit) {
      const h = plane.hit, tc = h.t;
      res.popT = tc; res.cross = { x: h.x, y: h.y };
      for (const b of this.balloons) {
        if (b.popAt !== null) continue;
        const p = this.pos(b, T0 + tc);
        if (Math.hypot(p.x - h.x, p.y - h.y) < R) { b.popAt = T0 + tc; res.pops.push({ id: b.id, x: p.x, y: p.y, gold: b.gold, col: b.col }); }
      }
    }
    this.quiver--;
    if (res.pops.length) {
      this.combo++; this.bestCombo = Math.max(this.bestCombo, this.combo); this.popped += res.pops.length;
      const m = this.mult(), base = res.pops.reduce((a, p) => a + (p.gold ? 250 : 100), 0);
      res.points = base * m * res.pops.length;                     // two in one arrow scores double each
      this.score += res.points; res.mult = m; res.miss = false;
      const golds = res.pops.filter(p => p.gold).length; this.quiver += golds * 2; res.bonusArrows = golds * 2;
    } else this.combo = 0;
    this.arrowNo++; this.log.push(res);
    res.endDone = false;
    if (this.quiver <= 0) this.over = true;
    return res;
  }
};
KAR.Trick.DIST = 25; KAR.Trick.ARROWS = 12; KAR.Trick.R = 0.26;

// ---- the CPU / test bot -----------------------------------------------------------
KAR.Bot = {
  // Reads the wind with some error, aims off to compensate, then shakes by the skill's sigma.
  shot(match, rng, sigma, readErr) {
    const C = KAR.CFG, D = match.dist;
    const ew = match.wind * (1 + rng.gauss() * readErr) + rng.gauss() * 0.15;
    let ax = 0;
    for (let i = 0; i < 3; i++) {            // fixed point: find the aim that cancels the drift
      const sol = KAR.Flight.solve(D, ax, C.FACE_Y), r = KAR.Flight.run(D, sol.yaw, sol.pitch, C.V0, ew);
      if (!r.hit) break;
      ax -= r.hit.x;
    }
    const sx = rng.gauss() * sigma * D, sy = rng.gauss() * sigma * D;
    return { aimX: ax, aimY: C.FACE_Y, sx, sy, power: 1 };
  },
  // the steady-hand, perfect-read aim for the current wind (the tutorial's AIM HERE marker)
  hold(match, ty) {
    const C = KAR.CFG, D = match.dist; ty = ty === undefined ? C.FACE_Y : ty;
    let ax = 0;
    for (let i = 0; i < 4; i++) { const sol = KAR.Flight.solve(D, ax, ty), r = KAR.Flight.run(D, sol.yaw, sol.pitch, C.V0, match.wind); if (!r.hit) break; ax -= r.hit.x; }
    return { x: ax, y: ty };
  },
  play(opts, sigma, readErr, seed) {
    const m = new KAR.Match(opts), rng = KAR.Util.rng(seed || 3);
    let g = 0;
    while (!m.over && g++ < 200) {
      const lv = m.shooter === 1 ? m.level : null;
      const s = lv ? this.shot(m, rng, lv.sigma, lv.read) : this.shot(m, rng, sigma, readErr);
      m.shoot(s.aimX, s.aimY, s.sx, s.sy, s.power);
    }
    return m;
  },
};
