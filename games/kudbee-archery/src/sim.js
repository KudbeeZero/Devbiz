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
  TOUCH_GAINS: [0.5, 0.7, 0.95], AIM_NAMES: ['SLOW', 'NORMAL', 'FAST'],     // the AIM SPEED setting (pause, on touch screens)
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
  // v: the launch speed the sight is zeroed for (a faster bow gets its own sight marks); V0 by default.
  solve(dist, tx, ty, v) {
    const C = KAR.CFG, V = v || C.V0;
    const yaw = Math.atan2(tx - C.SHOOT.x, dist);
    let lo = -0.2, hi = 0.45;
    for (let i = 0; i < 26; i++) {
      const mid = (lo + hi) / 2, r = this.run(dist, yaw, mid, V, 0);
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
    this.levelIdx = opts.level === undefined ? 1 : opts.level; this.level = opts.cpu || KAR.LEVELS[this.levelIdx];     // cpu: a CUP rival's own skill
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
  // kit: the shooter's bow + arrows (KAR.kitOf); club kit when left out.
  shoot(aimX, aimY, sx, sy, power, kit) {
    const C = KAR.CFG, sh = this.shooter, wind = this.wind, k = kit || KAR.KIT0, ew = wind * k.wind;
    const sol = KAR.Flight.solve(this.dist, aimX + sx, aimY + sy, C.V0 * k.speed);
    const speed = KAR.kitSpeed(power, k);
    const fl = KAR.Flight.run(this.dist, sol.yaw, sol.pitch, speed, ew);
    const res = { shooter: sh, end: this.endNo, wind, samples: fl.samples, hit: fl.hit, ground: fl.ground, ring: 0, x: false, short: false };
    const bk = this.boxes ? this._crate(sol, speed, ew) : null;          // THINK BOX: crates in front of the boss stop it first
    if (bk) {
      res.samples = bk.samples; res.hit = bk.hit; res.ring = bk.star ? 10 : 0; res.miss = !bk.star; res.blocked = !bk.star; res.star = bk.star; res.bi = bk.bi;
      this.arrows[sh].push({ ring: res.ring, x: false, robin: false, end: this.endNo, hit: bk.star ? null : bk.local });
    } else {
      let hl = fl.hit;                     // the hit in the target's own frame (the same thing unless the target moves)
      if (fl.hit && this.offAt) { const o = this.offAt(this.T + fl.hit.t); hl = { x: fl.hit.x - o.x, y: fl.hit.y - o.y }; }
      if (fl.hit) {
        const sc = KAR.Score.ring(this.distIdx, hl.x, hl.y, this.faceD); res.ring = sc.ring; res.x = sc.x; res.miss = sc.ring === 0;
        // ROBIN HOOD: on the face, within a shaft's width of an arrow already in it this end (it would split that arrow)
        if (!res.miss) for (let s = 0; s < 2 && !res.robin; s++) for (const a of this.arrows[s]) if (a.end === this.endNo && a.hit && a.ring && Math.hypot(a.hit.x - hl.x, a.hit.y - hl.y) < C.ROBIN) { res.robin = true; a.split = true; break; }
      }
      else { res.miss = true; res.short = true; }
      // a moving target carries its arrows with it - one that missed the boss altogether just flies on through (as does
      // one that sails over a THINK BOX wall: there is no boss there to stop it)
      const keep = fl.hit && !((this.offAt || this.boxes) && res.miss && !this.onBoss(hl));
      this.arrows[sh].push({ ring: res.ring, x: res.x, robin: !!res.robin, end: this.endNo, hit: keep ? { x: hl.x, y: hl.y, vx: fl.hit.vx, vy: fl.hit.vy, vz: fl.hit.vz } : null });
    }
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
  // PACE: your points so far against your best scaled to the arrows shot (+ ahead, - behind); null with no best yet
  pace(best) {
    const n = this.arrows[0].length;
    if (!(best > 0) || !n) return null;
    return Math.round(this.total(0) - best * n / (this.ends * this.per));
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
// Eight worlds of six levels, each a short range with its own twist: the wind, a smaller face, a boss that slides
// along a rail, swings on ropes or orbits a hub, gusts that change arrow to arrow, crates in the way. Stars come from the level's
// own thresholds; one star opens the next level. move: 'slide' (amp in metres, w rad/s), 'swing' (amp in
// radians on Swing.L ropes) or 'orbit' (amp in metres across, w rad/s). face: the face size as a fraction of the standard one at that distance. boxes: crates
// (THINK BOX, below); flags: [x, height] of the wind pennants planted in front of a crate wall. view: how much the
// scope frames, in metres, when it should take in more than the face.
KAR.VENUES = [
  { name: 'VILLAGE GREEN', sub: 'a still morning on the club field' },
  { name: 'FOREST GLADE', sub: 'late sun through the pines' },
  { name: 'MOUNTAIN PASS', sub: 'sunset, and the wind off the peaks' },
  { name: 'LANTERN NIGHT', sub: 'floodlights, fireflies and a cold wind' },
  { name: 'THINK BOX', sub: 'crates, windows and carts · think before you shoot' },
  { name: 'BITCOIN CITY', sub: 'orange neon and a market that never sleeps · gems only, no real coins' },
  { name: 'SOLANA BEACH', sub: 'a synthwave sunset where everything moves fast · gems only' },
  { name: 'ALGORAND PEAKS', sub: 'crystal peaks under the aurora · pure precision · gems only' },
];
// THINK BOX builders. Crates stand BOXZ metres in front of the boss (BOXD deep) and stop an arrow dead (0 points);
// a STAR BOX (star: true) breaks and scores 10 (once an end); a CART (mv: { a: metres, w: rad/s, p: phase }) is a
// stack of crates on wheels that rolls to and fro across the lane. All in target-plane metres: x across, y up.
// wall: crates from the ground up to `top`, `half` metres either side of the lane, with windows [x0, x1, y0, y1] cut in it
// (side by side: two windows must not overlap across, i.e. no window stacked above another)
KAR.BOXZ = 0.8; KAR.BOXD = 0.6;
KAR.wall = (half, top, wins) => {
  const out = []; let x = -half;
  for (const [x0, x1, y0, y1] of wins.slice().sort((a, b) => a[0] - b[0])) {
    if (x0 > x) out.push({ x0: x, x1: x0, y0: 0, y1: top });
    out.push({ x0, x1, y0: 0, y1: y0 }); if (y1 < top) out.push({ x0, x1, y0: y1, y1: top });
    x = x1;
  }
  if (x < half) out.push({ x0: x, x1: half, y0: 0, y1: top });
  return out;
};
// Eight worlds of six levels, like the Kudbee Birds worlds: each world ends in a BOSS level (crowned on the map).
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
  { v: 3, name: 'LANTERN KING',  dist: 3, ends: 5, wind: 1.1,  gust: 0.25, move: 'slide', amp: 0.8, w: 1.2, face: 0.85, boss: true, stars: [74, 98, 120], tip: 'the night boss · five ends at 70 m on the rail' },
  // THINK BOX: a puzzle world that opens once the Village Cup falls (after: the level whose star opens it)
  { v: 4, name: 'PEEPHOLE',      dist: 0, ends: 3, wind: 0.5,  after: 5, boxes: KAR.wall(0.95, 1.62, [[-0.12, 0.12, 1.18, 1.42]]), flags: [0.55, 1.52], stars: [51, 68, 79], tip: 'a crate wall · the gold is through the window' },
  { v: 4, name: 'STAR BOX',      dist: 1, ends: 3, wind: 0.6,  view: 1.0, boxes: KAR.wall(1.3, 1.92, [[-0.15, 0.15, 1.15, 1.45]]).concat([{ x0: 0.72, x1: 1.08, y0: 1.92, y1: 2.28, star: true }]), flags: [0.55, 1.52], stars: [56, 75, 83], tip: 'the STAR BOX scores 10 once an end · then go through the window' },
  { v: 4, name: 'SHUTTER',       dist: 0, ends: 3, wind: 0.3,  boxes: [{ x0: -0.3, x1: 0.3, y0: 0, y1: 1.62, mv: { a: 0.62, w: 1.5 } }], stars: [47, 64, 77], tip: 'a crate cart rolls across · loose when the gold is clear' },
  { v: 4, name: 'TWO WINDOWS',   dist: 1, ends: 3, wind: 0.5,  move: 'slide', amp: 1.0, w: 0.8, boxes: KAR.wall(2.2, 2.0, [[-1.15, -0.45, 0.8, 1.8], [0.45, 1.15, 0.8, 1.8]]), flags: [1.35, 2.15], stars: [50, 66, 79], tip: 'the boss rides behind the wall · hit it in a window' },
  { v: 4, name: 'CRISS-CROSS',   dist: 1, ends: 3, wind: 0.9,  gust: 0.35, boxes: [{ x0: -0.25, x1: 0.25, y0: 0, y1: 1.9, mv: { a: 1.0, w: 1.1 } }, { x0: -0.25, x1: 0.25, y0: 0, y1: 1.9, mv: { a: 1.0, w: 1.1, p: Math.PI } }], stars: [51, 67, 79], tip: 'two carts criss-cross · find the gap' },
  { v: 4, name: 'THE BIG BOX',   dist: 2, ends: 4, wind: 0.9,  gust: 0.25, move: 'swing', amp: 0.14, face: 0.6, view: 1.15, boss: true, boxes: KAR.wall(2.6, 2.05, [[-0.7, 0.7, 0.85, 1.75]]).concat([{ x0: 1.1, x1: 1.5, y0: 2.05, y1: 2.45, star: true }]), flags: [1.05, 2.2], stars: [56, 84, 102], tip: 'the boss swings behind a window · and a STAR BOX up top' },
  // CRYPTO CITY: a neon side world that opens once the Forest Crown falls. Its crates are glowing BLOCKS (a chain of
  // them) and its STAR BOX is a COIN BLOCK. Themed only: everything it pays is in-game gems - no coins, wallets or tokens.
  { v: 5, name: 'GENESIS BLOCK', dist: 1, ends: 3, wind: 0.5,  after: 11, view: 1.0, boxes: KAR.wall(1.25, 1.9, [[-0.16, 0.16, 1.14, 1.46]]).concat([{ x0: -1.05, x1: -0.7, y0: 1.9, y1: 2.25, star: true }]), flags: [0.6, 1.55], stars: [56, 75, 83], tip: 'the first block · shoot through the window · the COIN BLOCK pays 10' },
  { v: 5, name: 'HODL',          dist: 2, ends: 3, wind: 0.5,  face: 0.7, stars: [50, 62, 76], tip: 'a small face at 50 m · hold your breath, hold your nerve' },
  { v: 5, name: 'PUMP & DUMP',   dist: 1, ends: 3, wind: 0.5,  move: 'swing', amp: 0.2, stars: [55, 68, 79], tip: 'the price swings up and down · loose as it comes to you' },
  { v: 5, name: 'GAS FEES',      dist: 2, ends: 3, wind: 1.0,  gust: 0.45, stars: [55, 69, 80], tip: 'the wind changes every arrow, like the fees · watch the flags' },
  { v: 5, name: 'BULL RUN',      dist: 1, ends: 3, wind: 0.5,  move: 'slide', amp: 1.1, w: 1.7, stars: [54, 67, 78], tip: 'the bull charges along the rail · lead it' },
  { v: 5, name: 'THE WHALE',     dist: 2, ends: 4, wind: 0.9,  gust: 0.25, move: 'slide', amp: 1.0, w: 0.9, boss: true, boxes: KAR.wall(2.4, 2.0, [[-1.25, -0.45, 0.8, 1.8], [0.45, 1.25, 0.8, 1.8]]).concat([{ x0: -0.2, x1: 0.2, y0: 2.0, y1: 2.4, star: true }]), flags: [1.5, 2.15], stars: [59, 89, 108], tip: 'the whale swims behind the chain · hit it in a window, take the COIN BLOCK' },
  // SOLANA BEACH (world 7): a synthwave sunset where everything is quick - fast rails, a ticking shutter, a boss on an
  // ORBIT (it circles a hub, so it rises and falls as it goes round). Opens off the BITCOIN CITY boss.
  { v: 6, name: 'FAST LANE',     dist: 1, ends: 3, wind: 0.5,  move: 'slide', amp: 1.0, w: 2.0, stars: [53, 67, 78], tip: 'the fastest rail yet · lead it a long way' },
  { v: 6, name: 'PROOF OF HISTORY', dist: 1, ends: 3, wind: 0.4, boxes: [{ x0: -0.3, x1: 0.3, y0: 0, y1: 1.7, mv: { a: 0.66, w: 2.3 } }], stars: [51, 67, 79], tip: 'a shutter that ticks like a clock · count the beat, then loose' },
  { v: 6, name: 'HIGH THROUGHPUT', dist: 2, ends: 3, wind: 1.1, gust: 0.5, stars: [54, 69, 80], tip: 'a new gust every arrow at 50 m · read each one' },
  { v: 6, name: 'ORBIT',         dist: 1, ends: 3, wind: 0.5,  move: 'orbit', amp: 0.7, w: 1.1, stars: [55, 68, 79], tip: 'the boss circles a hub · loose at the top or the bottom of the loop' },
  { v: 6, name: 'PARALLEL',      dist: 1, ends: 3, wind: 0.6,  move: 'slide', amp: 1.0, w: 1.3, boxes: KAR.wall(2.3, 2.0, [[-1.2, -0.45, 0.8, 1.8], [0.45, 1.2, 0.8, 1.8]]).concat([{ x0: -0.2, x1: 0.2, y0: 2.0, y1: 2.4, star: true }]), flags: [1.45, 2.15], view: 1.1, stars: [58, 72, 81], tip: 'two windows, a quick boss · and a COIN BLOCK on top' },
  { v: 6, name: 'SUNSET VALIDATOR', dist: 2, ends: 4, wind: 0.8, gust: 0.3, move: 'orbit', amp: 0.8, w: 0.9, boss: true, stars: [73, 92, 106], tip: 'the boss orbits at 50 m in a gusty sea breeze · four ends' },
  // ALGORAND PEAKS (world 8): crystal peaks under the aurora - long range, small faces, no luck: pure precision.
  { v: 7, name: 'PURE STAKE',    dist: 2, ends: 3, wind: 0.4,  face: 0.6, stars: [45, 58, 73], tip: 'a 73 cm face at 50 m in a light wind · just be precise' },
  { v: 7, name: 'FINALITY',      dist: 2, ends: 3, wind: 0.6,  view: 1.1, boxes: KAR.wall(1.5, 2.0, [[-0.14, 0.14, 1.16, 1.44]]).concat([{ x0: 0.85, x1: 1.25, y0: 2.0, y1: 2.4, star: true }]), flags: [0.7, 1.6], stars: [40, 57, 79], tip: 'a tiny window in the ice wall at 50 m · and a COIN BLOCK' },
  { v: 7, name: 'AURORA RAIL',   dist: 3, ends: 3, wind: 0.7,  move: 'slide', amp: 0.8, w: 1.0, stars: [42, 58, 74], tip: 'a rail at 70 m · lead it under the lights' },
  { v: 7, name: 'FROST GALE',    dist: 3, ends: 3, wind: 1.7,  gust: 0.4, stars: [38, 52, 70], tip: 'a gale off the glacier, a new gust every arrow' },
  { v: 7, name: 'CRYSTAL ORBIT', dist: 2, ends: 3, wind: 0.7,  move: 'orbit', amp: 0.7, w: 1.2, face: 0.8, stars: [46, 62, 75], tip: 'a smaller boss on a quick orbit at 50 m' },
  { v: 7, name: 'THE PEAK',      dist: 3, ends: 5, wind: 1.2,  gust: 0.3, move: 'orbit', amp: 0.7, w: 0.8, face: 0.85, boss: true, stars: [56, 89, 118], tip: 'the last boss · five ends at 70 m, orbiting in the cold' },
];
// the 15-level tour (before the worlds) saved progress by these indices
KAR.TOUR_V1 = [0, 1, 2, 3, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 17];
// one star opens the next level (or, for a side world, the level named by `after`); a level you already have stars
// on stays open (so older saves keep their place)
KAR.tourOpen = (i, data) => { const s = data.tour.stars, L = KAR.TOUR[i], need = L && L.after !== undefined ? L.after : i - 1; return i === 0 || (s[need] || 0) > 0 || (s[i] || 0) > 0; };
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
      this.move = def.move; this.offAt = def.move === 'swing' ? this._swingAt : def.move === 'orbit' ? this._orbitAt : this._slideAt;
      const span = def.move === 'swing' ? KAR.Swing.L * Math.sin(def.amp) : def.amp;
      this.viewD = Math.max(this.faceD, span * 1.25 + this.faceD * 0.75);
    }
    if (def.view) this.viewD = Math.max(this.viewD || 0, def.view);
    if (def.boxes) { this.boxes = def.boxes; this.broken = {}; }       // broken[i] = { end, at }: when a STAR BOX smashed
  }
  // a cart's sideways offset at time T (0 for a crate that stays put)
  boxOff(i, T) { const mv = this.boxes[i].mv; return mv ? mv.a * Math.sin(mv.w * T + this.ph + (mv.p || 0)) : 0; }
  // is crate i smashed in that end (default: this one)? With T, only once the arrow has got there - so the game can
  // show a STAR BOX whole until the arrow arrives, and still smashed after the end's last arrow closes the end
  boxGone(i, end, T) { const b = this.broken[i]; return !!b && b.end === (end === undefined ? this.endNo : end) && (T === undefined || T >= b.at); }
  // does the arrow meet a crate? It flies to the crates' front face; if it is inside a crate there (where that crate
  // will be when the arrow arrives) it stops - or smashes a STAR BOX. One that gets in through a window can still clip
  // the crates' sides on the way through (they are BOXD deep), so it is checked at their back face too. The hit is
  // kept in the crate's own frame.
  _crate(sol, speed, wind) {
    const zf = this.dist - KAR.BOXZ;
    for (const z of [zf, zf + KAR.BOXD]) {
      const fl = KAR.Flight.run(z, sol.yaw, sol.pitch, speed, wind); if (!fl.hit) return null;
      const h = fl.hit;
      for (let i = 0; i < this.boxes.length; i++) {
        const b = this.boxes[i]; if (this.boxGone(i) || (b.star && z !== zf)) continue;
        const o = this.boxOff(i, this.T + h.t);
        if (h.x < b.x0 + o || h.x > b.x1 + o || h.y < b.y0 || h.y > b.y1) continue;
        if (b.star) this.broken[i] = { end: this.endNo, at: this.T + h.t };
        return { samples: fl.samples, star: !!b.star, bi: i, hit: { x: h.x, y: h.y, z, t: h.t, vx: h.vx, vy: h.vy, vz: h.vz }, local: { x: h.x - o, y: h.y, z, bi: i, vx: h.vx, vy: h.vy, vz: h.vz } };
      }
    }
    return null;
  }
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
  // ORBIT: the boss goes round a hub on a flat loop - amp across, half that up and down - and never dips below its stand
  _orbitAt(T) { const d = this.def, a = d.w * T + this.ph; return { x: d.amp * Math.cos(a), y: d.amp * 0.5 * (1 + Math.sin(a)), th: 0 }; }
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

// ---- BOWS & ARROWS -------------------------------------------------------------------
// Bought with gems (from the daily quests). Each plays differently, none is simply better. The sight is
// zeroed for each bow, so a still-air shot always lands where you aim; kit changes how the arrow handles:
//   speed  launch speed (a faster arrow is in the air less, so the wind has less time to push it)
//   wind   how hard the wind shoves this arrow in flight
//   weak   what a short draw costs (x the club's speed loss)
//   sway   how much the sight wobbles
//   tire   how soon a held full draw starts to shake (x the club's)
KAR.KIT = {
  bow: [
    { name: 'CLUB RECURVE',   cost: 0,   speed: 1.00, sway: 1.00, tire: 1.0, plus: 'the all-rounder', minus: '' },
    { name: 'HUNTER LONGBOW', cost: 30,  speed: 0.92, sway: 0.72, tire: 0.8, plus: 'steady, forgiving sight', minus: 'slow arrow: more drift' },
    { name: 'OLYMPIC RECURVE', cost: 60, speed: 1.09, sway: 1.25, tire: 1.0, plus: 'fast, flat arrow', minus: 'twitchy sight' },
    { name: 'COMPOUND',       cost: 100, speed: 1.12, sway: 0.85, tire: 2.2, plus: 'fast and calm', minus: 'tires fast at full draw' },
  ],
  arrow: [
    { name: 'ALUMINIUM',      cost: 0,   speed: 1.00, wind: 1.00, weak: 1.0, plus: 'the all-rounder', minus: '' },
    { name: 'CARBON',         cost: 25,  speed: 1.03, wind: 0.82, weak: 1.8, plus: 'cuts the wind', minus: 'short draws drop hard' },
    { name: 'HEAVY CEDAR',    cost: 40,  speed: 0.90, wind: 0.70, weak: 0.7, plus: 'shrugs off wind & short draws', minus: 'slow: lead movers more' },
    { name: 'X10 PRO',        cost: 80,  speed: 1.06, wind: 0.72, weak: 2.6, plus: 'fast, barely drifts', minus: 'needs a full draw' },
  ],
};
KAR.KIT0 = { speed: 1, wind: 1, weak: 1, sway: 1, tire: 1 };
// the combined handling of a loadout (data.kit = { bow, arrow } indexes)
KAR.kitOf = data => {
  const k = (data && data.kit) || {}, b = KAR.KIT.bow[k.bow | 0] || KAR.KIT.bow[0], a = KAR.KIT.arrow[k.arrow | 0] || KAR.KIT.arrow[0];
  return { speed: b.speed * a.speed, wind: a.wind, weak: a.weak, sway: b.sway, tire: b.tire };
};
// launch speed for a draw of `power` (0..1): the club loses 28% of its speed at no draw; `weak` scales that
KAR.kitSpeed = (power, k) => KAR.CFG.V0 * k.speed * Math.max(0.4, 1 - 0.28 * k.weak * (1 - KAR.Util.clamp(power, 0, 1)));

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
  shoot(aimX, aimY, sx, sy, power, kit) {
    const C = KAR.CFG, D = this.dist, T0 = this.T, R = KAR.Trick.R, k = kit || KAR.KIT0, ew = this.wind * k.wind;
    const sol = KAR.Flight.solve(D, aimX + sx, aimY + sy, C.V0 * k.speed);
    const speed = KAR.kitSpeed(power, k);
    const plane = KAR.Flight.run(D, sol.yaw, sol.pitch, speed, ew);              // where it crosses the balloons
    const fl = KAR.Flight.run(D + 45, sol.yaw, sol.pitch, speed, ew);            // ...and where it goes after
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

// ---- THE CUP (knockout) -------------------------------------------------------------------
// Eight archers, three rounds of duels (quarter-final, semi-final, final), one cup. You are one of the eight; the
// other seven are named CPU rivals drawn for the cup from the pool by its seed. Each rival has a rating (0 = club
// novice, 1 = world class) that sets their sight wobble and how well they read the wind. The other ties of a round are
// shot out by bots (deterministic per seed), so the favourites usually - not always - come through to meet you.
// BRONZE is open from the start; SILVER opens when you win BRONZE, GOLD when you win SILVER. Gems are in-game only.
KAR.RIVALS = [
  { name: 'ROOKIE RAY',    r: 0.05, col: '#7ac7ff' }, { name: 'MOSSY MEG',    r: 0.12, col: '#7fe03a' },
  { name: 'BARNEY BOLT',   r: 0.2,  col: '#ffb02e' }, { name: 'PIPPA PINE',   r: 0.28, col: '#5fae4a' },
  { name: 'NED NOCK',      r: 0.35, col: '#c46bff' }, { name: 'GOLDIE GRACE', r: 0.42, col: '#ffd34d' },
  { name: 'WILLOW WREN',   r: 0.5,  col: '#9be35a' }, { name: 'SIR FLETCHER', r: 0.57, col: '#ff6b5a' },
  { name: 'ARROW ANYA',    r: 0.64, col: '#ff5fd2' }, { name: 'CAPTAIN QUIVER', r: 0.7, col: '#3fa0ff' },
  { name: 'MAID MARIGOLD', r: 0.76, col: '#ff9a3c' }, { name: 'HAWKEYE HAL',  r: 0.82, col: '#e8483a' },
  { name: 'THE BARON',     r: 0.88, col: '#b48cff' }, { name: 'SILENT SUKI',  r: 0.93, col: '#5ff0ff' },
  { name: 'LADY LONGBOW',  r: 0.98, col: '#fff27a' },
];
KAR.CUPS = [
  { name: 'BRONZE CUP', dists: [0, 1, 1], lo: 0,  hi: 9,  gems: 40,  col: '#d9894a' },
  { name: 'SILVER CUP', dists: [1, 2, 2], lo: 4,  hi: 13, gems: 80,  col: '#c9d1d9' },
  { name: 'GOLD CUP',   dists: [2, 3, 3], lo: 8,  hi: 15, gems: 150, col: '#ffd34d' },
];
KAR.CUP_ROUNDS = ['QUARTER-FINAL', 'SEMI-FINAL', 'FINAL'];
KAR.CUP_REPEAT = 10;                 // gems for winning a cup you have already won
KAR.Cup = {
  // a rival's duel skill (the shape KAR.Match takes as opts.cpu): wobble and wind read eased from novice to world class
  skill(i) { const r = KAR.RIVALS[i].r; return { name: KAR.RIVALS[i].name, sigma: KAR.Util.lerp(0.0036, 0.0009, r), read: KAR.Util.lerp(0.45, 0.07, r), wind: KAR.Util.lerp(0.55, 1.0, r) }; },
  open(tier, D) { return tier === 0 || (D.cupWon[tier - 1] | 0) > 0; },
  // a new cup: seven rivals from the tier's slice of the pool, seeded into a bracket (you are -1). Slots pair up
  // 0-1, 2-3, 4-5, 6-7; the favourites start on opposite sides so they meet late
  start(tier, seed) {
    const C = KAR.CUPS[tier], rng = KAR.Util.rng(seed), pool = [];
    for (let i = C.lo; i < C.hi; i++) pool.push(i);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const seven = pool.slice(0, 7).sort((a, b) => KAR.RIVALS[b].r - KAR.RIVALS[a].r);     // strongest first
    // you sit in slot 0 against the weakest of the seven; the top seed is drawn on the far side (slot 7)
    const field = [-1, seven[6], seven[3], seven[4], seven[2], seven[5], seven[1], seven[0]];
    return { tier, seed: seed >>> 0, round: 0, field, res: [], out: false, won: false };
  },
  // who is still in at the start of round n (n = 0: the whole field)
  alive(c, n) { return n === 0 ? c.field.slice() : c.res[n - 1].slice(); },
  opponent(c) { const a = this.alive(c, c.round), i = a.indexOf(-1); return i < 0 ? null : a[i ^ 1]; },
  dist(c) { return KAR.CUPS[c.tier].dists[Math.min(2, c.round)]; },
  // one bot-vs-bot tie at that distance, deterministic in (cup seed, round, pair)
  tie(c, a, b, n) {
    const sa = this.skill(a), sb = this.skill(b), seed = (c.seed ^ Math.imul(n * 8 + a * 31 + b + 1, 2654435761)) >>> 0;
    const m = KAR.Bot.play({ mode: 'duel', dist: KAR.CUPS[c.tier].dists[n], cpu: sb, seed }, sa.sigma, sa.read, seed ^ 0x9e3779b9);
    return m.winner === 1 ? b : m.winner === 0 ? a : (KAR.RIVALS[a].r >= KAR.RIVALS[b].r ? a : b);
  },
  // your tie in this round is over: record it, shoot out the other ties, move on (or out)
  result(c, won) {
    const a = this.alive(c, c.round), next = [];
    for (let i = 0; i < a.length; i += 2) {
      if (a[i] === -1 || a[i + 1] === -1) next.push(won ? -1 : (a[i] === -1 ? a[i + 1] : a[i]));
      else next.push(this.tie(c, a[i], a[i + 1], c.round));
    }
    c.res.push(next); c.round++;
    if (!won) c.out = true;
    if (won && c.round >= 3) c.won = true;
    // knocked out: the rest of the cup is still shot out, so the bracket shows who won it
    if (c.out) while (c.round < 3) { const b = this.alive(c, c.round), nx = []; for (let i = 0; i < b.length; i += 2) nx.push(this.tie(c, b[i], b[i + 1], c.round)); c.res.push(nx); c.round++; }
    return c;
  },
  done(c) { return !c || c.out || c.won; },
  // a saved cup is only kept when its shape is right (a hand-edited one is dropped and a new cup starts)
  clean(c) {
    if (!c || typeof c !== 'object' || !Number.isInteger(c.tier) || !KAR.CUPS[c.tier] || !Number.isInteger(c.seed) || !Number.isInteger(c.round) || c.round < 0 || c.round > 3) return null;
    const ok = x => x === -1 || (Number.isInteger(x) && x >= 0 && x < KAR.RIVALS.length);
    if (!Array.isArray(c.field) || c.field.length !== 8 || !c.field.every(ok) || c.field.filter(x => x === -1).length !== 1) return null;
    if (!Array.isArray(c.res) || c.res.length !== c.round || !c.res.every((r, n) => Array.isArray(r) && r.length === 4 >> n && r.every(ok))) return null;
    const fresh = this.start(c.tier, c.seed);
    if (fresh.field.join() !== c.field.join()) return null;
    return { tier: c.tier, seed: c.seed, round: c.round, field: c.field.slice(), res: c.res.map(r => r.slice()), out: !!c.out, won: !!c.won };
  },
};
