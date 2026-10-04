/* =====================================================================
 * Kudbee Cornhole — physics.js
 * Deterministic bag physics + the rules, with no DOM dependency so the
 * headless tests and the CPU planner run the exact same code as the game.
 *
 * Units: inches, seconds. World axes: x = right, y = up, z = away from the
 * thrower. Regulation board: 24 x 48 in, 3 in high at the front rising to
 * 12 in at the back, 6 in hole centred 9 in from the back edge, 27 ft pitch.
 * ===================================================================== */

KCH.CFG = {
  G: 386,
  BOARD_Z0: 324,                      // front edge of the target board (27 ft)
  BOARD_W: 24, BOARD_RUN: 48,         // width, horizontal length
  NEAR_H: 3, FAR_H: 12,
  HOLE_R: 3,
  BAG_T: 1.6, BAG_R: 3.4,
  HAND: { x: 0, y: 46, z: 36 },       // release point
  LAUNCH_DEG: 50,
};
KCH.CFG.THETA = Math.atan2(KCH.CFG.FAR_H - KCH.CFG.NEAR_H, KCH.CFG.BOARD_RUN);
KCH.CFG.SLEN = Math.hypot(KCH.CFG.BOARD_RUN, KCH.CFG.FAR_H - KCH.CFG.NEAR_H);   // surface length
KCH.CFG.HOLE_S = KCH.CFG.SLEN - 9;                                             // hole centre, along the slope

// How each throw style behaves. SLIDE skids; FLOP tumbles and dies where it lands.
KCH.STYLE = {
  slide: { mu: 0.26, muImpact: 0.27, e: 0.08, spin: 3,  flip: 0,  label: 'SLIDE', tip: 'skids a few inches, can slide in' },
  flop:  { mu: 0.60, muImpact: 1.25, e: 0.0,  spin: 1,  flip: 1,  label: 'FLOP',  tip: 'lands dead, blocks the hole' },
};

KCH.surface = {
  // point on the board's top surface for plane coordinates (u lateral, s along slope)
  point(u, s) {
    const C = KCH.CFG;
    return { x: u, y: C.NEAR_H + s * Math.sin(C.THETA), z: C.BOARD_Z0 + s * Math.cos(C.THETA) };
  },
  // plane coordinates for a world point's (x, z) (clamped projection onto the plane)
  fromWorld(x, z) {
    const C = KCH.CFG;
    return { u: x, s: (z - C.BOARD_Z0) / Math.cos(C.THETA) };
  },
  overBoard(x, z, margin) {
    const C = KCH.CFG, m = margin || 0;
    return Math.abs(x) <= C.BOARD_W / 2 + m && z >= C.BOARD_Z0 - m && z <= C.BOARD_Z0 + C.BOARD_RUN + m;
  },
  heightAt(z) {
    const C = KCH.CFG;
    return C.NEAR_H + (z - C.BOARD_Z0) * Math.tan(C.THETA);
  },
};

KCH.Sim = class {
  constructor() {
    this.bags = [];
    this.events = [];
    this.t = 0;
    this._id = 1;
  }

  clone() {
    const c = new KCH.Sim();
    c.bags = this.bags.map(b => Object.assign({}, b));
    c._id = this._id; c.t = this.t;
    return c;
  }

  clear() { this.bags = []; this.events = []; }

  emit(type, bag, v) { this.events.push({ type, bag, v: v || 0 }); }

  // Launch a bag so it lands at plane coordinates (u, s) on the board.
  // `err` = { du, ds } is execution error in inches (already scaled by the thrower).
  throwBag(team, style, u, s, err) {
    const C = KCH.CFG, st = KCH.STYLE[style];
    const du = err ? err.du : 0, ds = err ? err.ds : 0;
    const tp = KCH.surface.point(u + du, s + ds);
    const ty = tp.y + C.BAG_T / 2;
    const dx = tp.x - C.HAND.x, dz = tp.z - C.HAND.z;
    const d = Math.hypot(dx, dz);
    const a = C.LAUNCH_DEG * Math.PI / 180;
    const dy = ty - C.HAND.y;
    const denom = 2 * Math.cos(a) * Math.cos(a) * (d * Math.tan(a) - dy);
    const speed = Math.sqrt(C.G * d * d / denom);
    const vh = speed * Math.cos(a), vy = speed * Math.sin(a);
    const flight = d / vh;
    const b = {
      id: this._id++, team, style, state: 'air',
      x: C.HAND.x, y: C.HAND.y, z: C.HAND.z,
      vx: dx / d * vh, vy, vz: dz / d * vh,
      u: 0, s: 0, vu: 0, vs: 0,
      yaw: 0, yawV: (du >= 0 ? 1 : -1) * st.spin, tilt: 0, tiltV: st.flip ? (Math.PI * 2 * st.flip) / flight : 0,
      airmail: false, touched: false, pushedIn: false, flight,
      sq: 0, sqV: 0,                                  // cosmetic squash-and-wobble of the filled bag (never feeds back into the physics)
    };
    this.bags.push(b);
    this.emit('throw', b, speed);
    return b;
  }

  step(dt) {
    this.t += dt;
    const C = KCH.CFG;
    for (const b of this.bags) {
      b.sqV += (-380 * b.sq - 15 * b.sqV) * dt; b.sq += b.sqV * dt;     // jelly spring: a filled bag squashes, then settles
      if (b.state === 'air') this._air(b, dt);
      else if (b.state === 'board') this._board(b, dt);
      else if (b.state === 'off') this._fall(b, dt);
      else if (b.state === 'hole') { b.holeT = (b.holeT || 0) + dt; }
    }
    this._collide();
  }

  _air(b, dt) {
    const C = KCH.CFG;
    const px = b.x, py = b.y, pz = b.z;
    b.vy -= C.G * dt;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    b.yaw += b.yawV * dt; b.tilt += b.tiltV * dt;

    // board contact: the bag's underside crossing the sloped surface
    if (KCH.surface.overBoard(b.x, b.z, 0.5)) {
      const k = Math.cos(C.THETA);
      const surfY = KCH.surface.heightAt(b.z) + C.BAG_T / 2 / k;
      if (b.y <= surfY && b.vy < 0) { this._land(b, dt); return; }
    }
    if (b.y <= C.BAG_T / 2) {                                   // missed the board: onto the lawn
      b.y = C.BAG_T / 2; b.state = 'ground'; b.vx *= 0.15; b.vz *= 0.15; b.vy = 0; b.tilt = 0;
      b.sq = Math.min(1, Math.hypot(b.vx, b.vy, b.vz) / 260); b.sqV = 0;
      this.emit('ground', b, Math.hypot(b.vx, b.vz));
    }
  }

  _land(b, dt) {
    const C = KCH.CFG, st = KCH.STYLE[b.style];
    const th = C.THETA, sn = Math.sin(th), cs = Math.cos(th);
    // velocity in the slope frame: lateral, along-slope, normal (into the surface is negative)
    const vn = b.vy * cs - b.vz * sn;
    const vs = b.vy * sn + b.vz * cs;
    const pl = KCH.surface.fromWorld(b.x, b.z);
    b.u = pl.u; b.s = Math.max(0, Math.min(C.SLEN, pl.s));
    // straight through the hole = airmail
    if (Math.hypot(b.u, b.s - C.HOLE_S) < C.HOLE_R + 0.3 && vn < 0) {
      b.state = 'hole'; b.airmail = true; b.holeT = 0;
      this.emit('hole', b, Math.abs(vn)); return;
    }
    const impact = Math.abs(vn);
    // thud: tiny bounce, and friction at the contact eats tangential speed
    let tu = b.vx, ts = vs;
    const tm = Math.hypot(tu, ts);
    const lose = st.muImpact * (1 + st.e) * impact;
    const keep = tm > 1e-6 ? Math.max(0, tm - lose) / tm : 0;
    b.vu = tu * keep; b.vs = ts * keep;
    b.state = 'board'; b.touched = true;
    b.tilt = 0; b.yawV *= 0.4;
    this._place(b);
    b.sq = Math.min(1.1, 0.25 + impact / 170); b.sqV = 0;
    this.emit('land', b, impact);
  }

  _place(b) {
    const C = KCH.CFG;
    const p = KCH.surface.point(b.u, b.s);
    const n = { y: Math.cos(C.THETA), z: -Math.sin(C.THETA) };
    b.x = p.x + 0; b.y = p.y + n.y * C.BAG_T / 2; b.z = p.z + n.z * C.BAG_T / 2;
  }

  _board(b, dt) {
    const C = KCH.CFG, st = KCH.STYLE[b.style];
    const sp = Math.hypot(b.vu, b.vs);
    const gs = -C.G * Math.sin(C.THETA);                       // gravity along the slope (down = negative s)
    const fr = st.mu * C.G * Math.cos(C.THETA);
    if (sp < 0.4) {
      if (Math.abs(gs) <= fr) { b.vu = 0; b.vs = 0; }          // static: friction holds it
      else { b.vs += (gs + fr) * dt; }
    } else if (sp <= fr * dt && Math.abs(gs) <= fr) {
      b.vu = 0; b.vs = 0;                                      // friction stops it this step and can hold it: at rest (no creep loop)
    } else {
      const dec = Math.min(sp, fr * dt);                       // friction can slow a bag to a stop, never reverse it
      b.vu -= b.vu / sp * dec; b.vs -= b.vs / sp * dec;
      b.vs += gs * dt;
    }
    if (Math.hypot(b.vu, b.vs) < 0.4 && Math.abs(gs) <= fr) { b.vu = 0; b.vs = 0; }
    b.u += b.vu * dt; b.s += b.vs * dt;
    b.yaw += b.yawV * dt; b.yawV *= Math.max(0, 1 - 4 * dt);

    // dropped through the hole (centre of mass over it, and not rocketing past)
    const dh = Math.hypot(b.u, b.s - C.HOLE_S);
    if (dh < C.HOLE_R && Math.hypot(b.vu, b.vs) < 150) {
      b.state = 'hole'; b.holeT = 0; this.emit('hole', b, Math.hypot(b.vu, b.vs)); return;
    }
    // slid or got shoved off an edge
    if (Math.abs(b.u) > C.BOARD_W / 2 + 0.6 || b.s < -0.6 || b.s > C.SLEN + 0.6) {
      const p = KCH.surface.point(b.u, b.s), sn = Math.sin(C.THETA), cs = Math.cos(C.THETA);
      b.state = 'off';
      b.x = p.x; b.y = p.y + C.BAG_T / 2; b.z = p.z;
      b.vx = b.vu; b.vy = b.vs * sn; b.vz = b.vs * cs;
      this.emit('off', b, Math.hypot(b.vu, b.vs));
      return;
    }
    this._place(b);
  }

  _fall(b, dt) {
    const C = KCH.CFG;
    b.vy -= C.G * dt;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    b.yaw += b.yawV * dt;
    if (b.y <= C.BAG_T / 2) { b.y = C.BAG_T / 2; b.state = 'ground'; b.vx *= 0.1; b.vz *= 0.1; b.vy = 0; this.emit('ground', b, 0); }
  }

  // bag-on-bag: circles in the board plane, a soft cloth thud, momentum is shared
  _collide() {
    const R = KCH.CFG.BAG_R * 2;
    const list = this.bags.filter(b => b.state === 'board');
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const A = list[i], B = list[j];
        const dx = B.u - A.u, ds = B.s - A.s, d = Math.hypot(dx, ds);
        if (d >= R) continue;
        const nx = d > 1e-6 ? dx / d : 1, ns = d > 1e-6 ? ds / d : 0, ov = R - d;
        const aStill = Math.hypot(A.vu, A.vs) < 0.5, bStill = Math.hypot(B.vu, B.vs) < 0.5;
        // separate (a resting bag is shoved only if the mover has momentum)
        const wa = aStill && !bStill ? 0.15 : 0.5, wb = bStill && !aStill ? 0.15 : 0.5;
        A.u -= nx * ov * wa / (wa + wb); A.s -= ns * ov * wa / (wa + wb);
        B.u += nx * ov * wb / (wa + wb); B.s += ns * ov * wb / (wa + wb);
        const rv = (B.vu - A.vu) * nx + (B.vs - A.vs) * ns;
        if (rv < 0) {
          const e = 0.12, j2 = -(1 + e) * rv / 2;
          A.vu -= j2 * nx; A.vs -= j2 * ns; B.vu += j2 * nx; B.vs += j2 * ns;
          B.sq = Math.max(B.sq, Math.min(0.6, Math.abs(rv) / 200)); this.emit('push', B, Math.abs(rv));
          if (!A.touched) A.touched = true;
        }
      }
    }
  }

  // Everything has come to rest (or is gone).
  settled() {
    for (const b of this.bags) {
      if (b.state === 'air' || b.state === 'off') return false;
      if (b.state === 'board' && Math.hypot(b.vu, b.vs) > 0.5) return false;
      if (b.state === 'hole' && (b.holeT || 0) < 0.5) return false;
    }
    return true;
  }

  runToRest(dt, maxSteps) {
    let n = 0;
    while (!this.settled() && n++ < (maxSteps || 3000)) this.step(dt);
    return n;
  }

  // points by team: 3 per bag in the hole, 1 per bag still on the board
  tally() {
    const pts = [0, 0], holes = [0, 0], board = [0, 0];
    for (const b of this.bags) {
      if (b.state === 'hole') { pts[b.team] += 3; holes[b.team]++; }
      else if (b.state === 'board') { pts[b.team] += 1; board[b.team]++; }
    }
    return { pts, holes, board, net: [Math.max(0, pts[0] - pts[1]), Math.max(0, pts[1] - pts[0])] };
  }
};

/* ---- match rules ------------------------------------------------------- */
KCH.Match = class {
  constructor(opts) {
    opts = opts || {};
    this.target = opts.target || 21;
    this.solo = !!opts.solo;              // practice: one thrower, points just add up, never ends
    this.bagsPer = opts.bagsPer || 4;
    this.score = [0, 0];
    this.round = 0;
    this.first = opts.first != null ? opts.first : 0;
    this.sim = new KCH.Sim();
    this.log = [];
    this.over = false; this.winner = -1;
    this.startRound();
  }

  startRound() {
    this.round++;
    this.thrown = [0, 0];
    this.order = [];
    const n = this.solo ? this.bagsPer : this.bagsPer * 2;
    for (let i = 0; i < n; i++) this.order.push(this.solo ? 0 : (i % 2 === 0 ? this.first : 1 - this.first));
    this.idx = 0;
    this.sim.clear();
    this.phase = 'throw';                 // throw | settle | roundEnd
    this.lastRound = null;
  }

  get team() { return this.order[this.idx]; }
  bagsLeft(t) { return this.bagsPer - this.thrown[t]; }

  throw(style, u, s, err) {
    if (this.phase !== 'throw' || this.over) return null;
    const t = this.team;
    const b = this.sim.throwBag(t, style, u, s, err);
    this.thrown[t]++;
    this.idx++;
    this.phase = 'settle';
    return b;
  }

  // Call once the sim has settled after a throw.
  afterSettle() {
    if (this.phase !== 'settle') return null;
    if (this.idx >= this.order.length) {
      const tl = this.sim.tally();
      if (this.solo) {
        this.score[0] += tl.pts[0];
        this.lastRound = { tally: tl, winner: 0, pts: tl.pts[0], round: this.round };
        this.log.push(this.lastRound);
        this.phase = 'roundEnd';
        return this.lastRound;
      }
      const net = tl.net;
      const w = net[0] > net[1] ? 0 : net[1] > net[0] ? 1 : -1;
      if (w >= 0) this.score[w] += net[w];
      this.lastRound = { tally: tl, winner: w, pts: w >= 0 ? net[w] : 0, round: this.round };
      this.log.push(this.lastRound);
      if (this.score[0] >= this.target || this.score[1] >= this.target) { this.over = true; this.winner = this.score[0] >= this.score[1] ? 0 : 1; }
      this.phase = 'roundEnd';
      return this.lastRound;
    }
    this.phase = 'throw';
    return null;
  }

  nextRound() {
    if (this.over) return;
    const w = this.lastRound ? this.lastRound.winner : -1;
    if (w >= 0) this.first = w;           // the team that scored throws first
    this.startRound();
  }
};

/* ---- CPU ---------------------------------------------------------------
 * Plans by simulating its own throws: tries a grid of landing spots in both
 * styles on a copy of the board, keeps the one that nets the most points.
 * Difficulty only changes how steady its hand is when it executes the plan.
 * ----------------------------------------------------------------------- */
KCH.AI = {
  LEVELS: [
    { name: 'ROOKIE', sigma: 7.0, miss: 0.1 },
    { name: 'PRO', sigma: 4.2, miss: 0.03 },
    { name: 'LEGEND', sigma: 2.6, miss: 0 },
  ],

  plan(match, team) {
    const C = KCH.CFG;
    const trial = (style, u, s) => {
      const sim = match.sim.clone();
      sim.throwBag(team, style, u, s, null);
      sim.runToRest(1 / 80, 900);
      const tl = sim.tally();
      const mine = tl.pts[team] - tl.pts[1 - team];
      // tie-break: stay close to the hole; a flop is a handy blocker
      return mine - Math.hypot(u, s - C.HOLE_S) * 0.02 + (style === 'flop' ? 0.05 : 0);
    };
    let best = null;
    const consider = (style, u, s) => {
      const val = trial(style, u, s);
      if (!best || val > best.val) best = { style, u, s, val };
    };
    // coarse sweep, then refine around the winner
    for (const style of ['slide', 'flop']) for (const u of [-7, -3.5, 0, 3.5, 7]) for (const s of [12, 22, 31, C.HOLE_S - 2.5, C.HOLE_S, 44]) consider(style, u, s);
    const c = best;
    for (const du of [-2, 0, 2]) for (const ds of [-2.5, 0, 2.5]) if (du || ds) consider(c.style, c.u + du, c.s + ds);
    return best;
  },

  // Turn the plan into a throw with the level's hand error.
  execute(match, team, level, rnd) {
    const plan = this.plan(match, team);
    const L = this.LEVELS[level] || this.LEVELS[1];
    const sig = L.sigma * (plan.style === 'flop' ? 0.85 : 1);
    let du = rnd.gauss() * sig * 0.7, ds = rnd.gauss() * sig;
    if (rnd() < L.miss) { du += (rnd() - 0.5) * 18; ds += (rnd() - 0.5) * 24; }
    return { style: plan.style, u: plan.u, s: plan.s, err: { du, ds } };
  },
};
