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
  DRAW_T: 0.9, STEADY_T: 3.0, BASE_SWAY: 0.0016,       // radians of sight wobble at rest
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
  ring(distIdx, hx, hy) {
    const C = KAR.CFG, R = C.FACE[distIdx] / 2, r = Math.hypot(hx, hy - C.FACE_Y);
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

  // Fire with the sight at (aimX, aimY) on the target plane, hand sway (sx, sy) in metres, draw power 0..1.
  shoot(aimX, aimY, sx, sy, power) {
    const C = KAR.CFG, sh = this.shooter, wind = this.wind;
    const sol = KAR.Flight.solve(this.dist, aimX + sx, aimY + sy);
    const speed = C.V0 * (0.72 + 0.28 * KAR.Util.clamp(power, 0, 1));
    const fl = KAR.Flight.run(this.dist, sol.yaw, sol.pitch, speed, wind);
    const res = { shooter: sh, end: this.endNo, wind, samples: fl.samples, hit: fl.hit, ground: fl.ground, ring: 0, x: false, short: false };
    if (fl.hit) { const sc = KAR.Score.ring(this.distIdx, fl.hit.x, fl.hit.y); res.ring = sc.ring; res.x = sc.x; res.miss = sc.ring === 0; }
    else { res.miss = true; res.short = true; }
    this.arrows[sh].push({ ring: res.ring, x: res.x, end: this.endNo, hit: fl.hit ? { x: fl.hit.x, y: fl.hit.y, vx: fl.hit.vx, vy: fl.hit.vy, vz: fl.hit.vz } : null });
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
  // stars for a finished range (0..3)
  stars() {
    if (this.mode !== 'range' || !this.over) return 0;
    const T = KAR.STARS[this.distIdx], s = this.total(0);
    return s >= T[1] ? 3 : s >= T[0] ? 2 : s >= T[0] * 0.75 ? 1 : 0;
  }
};
KAR.STARS = [[112, 130], [118, 134], [112, 130], [92, 116]];       // [2-star, 3-star] out of 150

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
