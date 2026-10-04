/* =====================================================================
 * Kudbee Cricket — sim.js  (DOM-free: runs in Node for tests and bots)
 * Metres. Origin = the batter's stumps. +y runs down the pitch toward the
 * bowler ("straight"), +x is the batter's off side (screen right from behind),
 * z is height. Contents: CFG, LEVELS, BOWLERS, Delivery physics, bowling AI,
 * the bat (timing windows -> shot), ball flight + fielding, and Match rules.
 * ===================================================================== */

KCK.CFG = {
  G: 9.81, PITCH: 20.12,
  REL_Y: 19.0, REL_Z: 2.1,
  STUMP_HALF: 0.114, STUMP_H: 0.711, BALL_R: 0.036,
  CONTACT_Y: 0.9,
  BOUNCE_E: 0.56, BOUNCE_V: 0.80,
  ROPE_R: 64, CX: 0, CY: 10.06,
  BAT_DELAY: 0.10,                       // tap -> bat meets ball
  K_DRAG: 0.0045, ROLL_DECEL: 3.0,
  RUN_T1: 3.0, RUN_T: 2.25, RUN_MARGIN: 0.25, MAX_RUNS: 3,
  FIELD_SPEED: 6.8, REACT: 0.25, THROW: 30, PICKUP: 0.35,
  BALLS_PER_OVER: 6,
  WIDE_X: 1.0,
};

KCK.LEVELS = [
  { name: 'ROOKIE', speed: 0.78, sigX: 0.40, sigY: 0.85, window: 1.35, drop: 1.3, rpo: 7.5, marker: 'early' },
  { name: 'PRO',    speed: 0.92, sigX: 0.28, sigY: 0.60, window: 1.00, drop: 1.0, rpo: 9.8, marker: 'late' },
  { name: 'LEGEND', speed: 1.04, sigX: 0.18, sigY: 0.40, window: 0.85, drop: 0.8, rpo: 12.2, marker: 'none' },
];
KCK.OVERS = [{ n: 2, wk: 3 }, { n: 5, wk: 5 }, { n: 10, wk: 8 }];

// All names are invented.
KCK.BOWLERS = [
  { id: 'sol',    name: 'Swing King Sol', kind: 'swing', speed: 30, swing: 6.0, turn: 0,   tag: 'SWING' },
  { id: 'bates',  name: 'Bouncer Bates',  kind: 'pace',  speed: 33, swing: 2.0, turn: 0,   tag: 'PACE' },
  { id: 'tanaka', name: 'Twirl Tanaka',   kind: 'spin',  speed: 21, swing: 0,   turn: 3.6, tag: 'OFF-SPIN' },
  { id: 'mo',     name: 'Mystery Mo',     kind: 'spin',  speed: 22.5, swing: 0, turn: -4.0, tag: 'LEG-SPIN' },
  { id: 'yusuf',  name: 'Yorker Yusuf',   kind: 'pace',  speed: 34, swing: 1.5, turn: 0,   tag: 'DEATH' },
];
KCK.BATTERS = [
  { name: 'Sixer Sam',   timing: 1.00, power: 1.06 },
  { name: 'Dasher Dev',  timing: 1.05, power: 1.00 },
  { name: 'Cool Kai',    timing: 1.08, power: 0.98 },
  { name: 'Blitz Bo',    timing: 0.94, power: 1.10 },
  { name: 'Wally Wick',  timing: 1.00, power: 1.00 },
  { name: 'Tonk Tilly',  timing: 0.92, power: 1.08 },
  { name: 'Pinch Pete',  timing: 0.96, power: 1.04 },
  { name: 'Crunch Cho',  timing: 0.90, power: 1.00 },
  { name: 'Nudge Nia',   timing: 1.02, power: 0.92 },
];

// ---- Delivery ------------------------------------------------------------------
// spec: { kind, label, speed, xa (line at the bat), yb (bounce length), swing, turn, x0, z0, noBall }
KCK.Delivery = class {
  constructor(spec) {
    const C = KCK.CFG, g = C.G;
    Object.assign(this, spec);
    this.x0 = spec.x0 === undefined ? 0.45 : spec.x0;
    this.z0 = spec.z0 || C.REL_Z;
    const v = this.speed, yb = Math.max(0.3, this.yb), tb = (C.REL_Y - yb) / v;
    this.tb = tb;
    this.vz0 = (0.5 * g * tb * tb - this.z0) / tb;
    const sw = this.swing || 0, turn = this.turn || 0;
    let vx;
    if (yb > C.CONTACT_Y) {
      const tPost = (yb - C.CONTACT_Y) / (v * C.BOUNCE_V);
      const xb = (this.xa + (this.x0 + 0.5 * sw * tb * tb) * tPost / tb - (sw * tb + turn) * tPost) / (1 + tPost / tb);
      vx = (xb - this.x0 - 0.5 * sw * tb * tb) / tb;
    } else {
      const tA = (C.REL_Y - C.CONTACT_Y) / v;
      vx = (this.xa - this.x0 - 0.5 * sw * tA * tA) / tA;
    }
    // integrate (exact for constant acceleration), up to two bounces
    const dt = 1 / 240, S = [];
    let s = { t: 0, x: this.x0, y: C.REL_Y, z: this.z0, vx, vy: -v, vz: this.vz0 }, bounces = 0;
    S.push({ t: 0, x: s.x, y: s.y, z: s.z });
    let tArr = -1, stump = null;
    while (s.t < 3.2 && s.y > -13) {
      const ax = bounces === 0 ? sw : 0;
      const py = s.y;
      s.x += s.vx * dt + 0.5 * ax * dt * dt; s.vx += ax * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt - 0.5 * g * dt * dt; s.vz -= g * dt;
      s.t += dt;
      if (s.z < 0) {
        s.z = 0; s.vz = -s.vz * C.BOUNCE_E;
        if (bounces === 0) { s.vy *= C.BOUNCE_V; s.vx += turn; this.bounceT = s.t; this.bounceX = s.x; this.bounceY = s.y; } else s.vy *= 0.85;
        bounces++;
      }
      S.push({ t: s.t, x: s.x, y: s.y, z: s.z });
      if (tArr < 0 && s.y <= C.CONTACT_Y) {
        const f = (py - C.CONTACT_Y) / (py - s.y), a = S[S.length - 2], b = S[S.length - 1];
        tArr = a.t + (b.t - a.t) * f;
        this.arr = { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, vy: s.vy };
      }
      if (!stump && s.y <= 0) { stump = { t: s.t, x: s.x, z: s.z }; }
    }
    if (this.bounceT === undefined) { this.bounceT = tb; this.bounceX = this.xa; this.bounceY = yb; }
    this.samples = S; this.tArr = tArr; this.stump = stump;
    this.hitsStumps = !!stump && Math.abs(stump.x) <= C.STUMP_HALF + C.BALL_R && stump.z <= C.STUMP_H + C.BALL_R;
    this.speedAtBat = Math.abs(this.arr.vy);
  }
  at(t) {
    const S = this.samples, i = Math.min(S.length - 2, Math.max(0, Math.floor(t * 240)));
    const a = S[i], b = S[i + 1], f = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0;
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f };
  }
};

// ---- Bowling AI --------------------------------------------------------------------
KCK.Bowling = {
  KINDS: {
    good:   { label: 'GOOD LENGTH', yb: 5.0, ys: 0.7, xa: 0.22, xs: 0.15, sp: 1.0 },
    full:   { label: 'FULL',        yb: 2.5, ys: 0.4, xa: 0.15, xs: 0.12, sp: 1.0 },
    yorker: { label: 'YORKER',      yb: 0.75, ys: 0.12, xa: 0.10, xs: 0.12, sp: 1.04 },
    short:  { label: 'BOUNCER',     yb: 8.6, ys: 0.5, xa: -0.10, xs: 0.2, sp: 1.03 },
    slower: { label: 'SLOWER BALL', yb: 4.6, ys: 0.6, xa: 0.15, xs: 0.15, sp: 0.70 },
    wide:   { label: 'WIDE LINE',   yb: 5.0, ys: 0.6, xa: 1.30, xs: 0.12, sp: 1.0 },
    flight: { label: 'FLIGHTED',    yb: 4.0, ys: 0.7, xa: 0.05, xs: 0.18, sp: 1.0 },
    arm:    { label: 'ARM BALL',    yb: 4.4, ys: 0.5, xa: 0.00, xs: 0.12, sp: 1.12 },
  },
  mix(bowler, ctx) {
    // ctx: { phase: 'pp'|'mid'|'death', lastBoundary, balls }
    if (bowler.kind === 'spin') return ctx.phase === 'death' ? ['flight', 'arm', 'arm', 'wide', 'short'] : ['flight', 'flight', 'good', 'arm', 'slower', 'short'];
    if (bowler.id === 'yusuf') return ['yorker', 'yorker', 'yorker', 'slower', 'wide', 'short', 'full'];
    if (ctx.phase === 'death') return ['yorker', 'yorker', 'slower', 'wide', 'short', 'full'];
    if (ctx.lastBoundary) return ['yorker', 'slower', 'short', 'full', 'good'];
    if (ctx.phase === 'pp') return ['good', 'good', 'full', 'full', 'short', 'wide'];
    return ['good', 'good', 'full', 'short', 'slower', 'yorker'];
  },
  make(bowler, level, rng, ctx) {
    const C = KCK.CFG, mix = this.mix(bowler, ctx);
    const kind = rng.pick(mix), K = this.KINDS[kind];
    const spin = bowler.kind === 'spin';
    let label = K.label;
    let swing = 0, turn = 0;
    if (bowler.kind === 'swing' || (bowler.kind === 'pace' && kind !== 'yorker')) {
      const dir = rng() < 0.5 ? 1 : -1; swing = dir * (bowler.swing * (0.7 + rng() * 0.6));
      if (bowler.swing >= 4) label = (dir > 0 ? 'OUTSWINGER' : 'INSWINGER'); else if (kind === 'good' || kind === 'full') label = K.label;
    }
    if (spin) {
      const googly = bowler.id === 'mo' && rng() < 0.3;
      turn = bowler.turn * (googly ? -0.85 : 1) * (0.75 + rng() * 0.5);
      if (kind === 'flight' || kind === 'good') label = googly ? 'GOOGLY' : bowler.tag;
    }
    const speed = bowler.speed * level.speed * K.sp * (0.97 + rng() * 0.06);
    const xa = K.xa + rng.gauss() * (K.xs + level.sigX * 0.8), yb = K.yb + rng.gauss() * (K.ys + level.sigY * K.yb * 0.25);
    return { kind, label, speed, xa, yb: Math.max(0.5, yb), swing, turn, noBall: rng() < 0.025 };
  },
};

// ---- Field settings ------------------------------------------------------------------
KCK.Field = {
  SETS: {
    pp:    [[2.2, -4.2, 'SLIP'], [6.5, -2.5, 'GULLY'], [15, 3, 'POINT'], [16, 12, 'COVER'], [9, 23, 'MID-OFF'], [-9, 23, 'MID-ON'], [-15, 10, 'MIDWICKET'], [-16, 0, 'SQ LEG'], [-12, -18, 'FINE LEG']],
    mid:   [[2.4, -4.4, 'SLIP'], [25, 2, 'POINT'], [26, 14, 'COVER'], [14, 48, 'LONG-OFF'], [-14, 48, 'LONG-ON'], [-30, 14, 'MIDWICKET'], [-28, -2, 'SQ LEG'], [-22, -28, 'FINE LEG'], [24, -26, 'THIRD MAN']],
    death: [[50, 0, 'DEEP POINT'], [50, 20, 'DEEP COVER'], [22, 60, 'LONG-OFF'], [-22, 60, 'LONG-ON'], [-52, 18, 'DEEP MIDWKT'], [-55, 0, 'DEEP SQ'], [-40, -30, 'DEEP FINE'], [40, -30, 'THIRD MAN'], [10, 26, 'MID-OFF']],
  },
  make(phase, bowler) {
    const set = this.SETS[phase] || this.SETS.mid, spin = bowler && bowler.kind === 'spin';
    const f = set.map((p, i) => ({ id: i, x: p[0], y: p[1], role: p[2], speed: KCK.CFG.FIELD_SPEED }));
    if (spin) { const s = f.find(q => q.role === 'SLIP'); if (s) { s.x = -3; s.y = 6; s.role = 'SHORT LEG'; } }
    f.push({ id: 9, x: 0, y: spin ? -1.6 : -11, role: 'KEEPER', speed: 5.5 });
    f.push({ id: 10, x: 0.8, y: 18.5, role: 'BOWLER', speed: 6.0 });
    return f;
  },
};

// ---- The bat: timing window -> shot --------------------------------------------------
KCK.Bat = {
  window(del, loft, level, batter) {
    let w = 0.105 * KCK.Util.clamp(29 / del.speed, 0.8, 1.45) * level.window * (batter ? batter.timing : 1);
    if (loft) w *= 0.8;
    return w;
  },
  // returns a shot (contact true/false)
  play(del, tapT, aimDeg, loft, rng, level, batter) {
    const C = KCK.CFG, U = KCK.Util, a = del.arr;
    const d = tapT + C.BAT_DELAY - del.tArr, w = this.window(del, loft, level, batter);
    const shot = { contact: false, d, w, reason: '' };
    if (Math.abs(d) >= w) { shot.reason = d < 0 ? 'early' : 'late'; return shot; }
    if (a.z > 1.75) { shot.reason = 'high'; return shot; }
    if (Math.abs(a.x - 0.1) > (loft ? 0.7 : 0.85)) { shot.reason = 'wide'; return shot; }
    const timingQ = 1 - Math.pow(Math.abs(d) / w, 2);
    const lineQ = 1 - 0.5 * Math.pow(Math.abs(a.x - 0.15) / 0.85, 2);
    const heightQ = a.z < 0.12 ? 0.78 : 1;
    const q = U.clamp(timingQ * lineQ * heightQ, 0, 1);
    shot.q = q; shot.contact = true; shot.loft = !!loft;
    shot.perfect = Math.abs(d) < 0.02 && q > 0.88;
    const power = batter ? batter.power : 1;
    shot.x = a.x; shot.y = C.CONTACT_Y; shot.z = U.clamp(a.z, 0.15, 1.5);
    shot.edge = (Math.abs(d) / w > 0.8 || q < 0.28) && rng() < 0.55;
    if (shot.edge) {
      const side = d > 0 ? 1 : -1;
      shot.angle = 180 - side * (18 + rng() * 45);
      shot.speed = 7 + 9 * q + rng() * 5;
      shot.elev = 6 + rng() * 30;
    } else {
      shot.angle = U.clamp(aimDeg + (d / w) * 28 + a.x * 12 + rng.gauss() * (1 - q) * 7 * (loft ? 1.4 : 1), -100, 100);
      shot.speed = Math.min(44, (4 + 25 * q + 0.2 * del.speedAtBat) * power * (loft ? 1.06 : 1) * (shot.perfect ? 1.06 : 1));
      shot.elev = loft ? U.clamp(24 + 12 * q + rng.gauss() * (3 + (1 - q) * 10), 12, 62) : U.clamp(2 + (1 - q) * (20 + rng() * 10) + rng.gauss(), 0, 55);
    }
    return shot;
  },
};

// ---- Ball flight + fielding ----------------------------------------------------------
KCK.Hit = {
  fly(shot) {
    const C = KCK.CFG, dt = 1 / 60, S = [];
    const az = shot.angle * Math.PI / 180, el = shot.elev * Math.PI / 180;
    let x = shot.x, y = shot.y, z = shot.z;
    let vx = shot.speed * Math.cos(el) * Math.sin(az), vy = shot.speed * Math.cos(el) * Math.cos(az), vz = shot.speed * Math.sin(el);
    let t = 0, bounces = 0, rolling = false;
    S.push({ t, x, y, z, air: true, b: 0 });
    while (t < 14) {
      const sp = Math.hypot(vx, vy, vz);
      if (!rolling) {
        const k = C.K_DRAG * sp;
        vx -= vx * k * dt; vy -= vy * k * dt; vz -= vz * k * dt; vz -= C.G * dt;
        x += vx * dt; y += vy * dt; z += vz * dt;
        if (z <= 0) {
          z = 0;
          if (vz < 0) {
            vz = -vz * 0.42; vx *= 0.80; vy *= 0.80; bounces++;
            if (Math.abs(vz) < 1.4) { rolling = true; vz = 0; }
          }
        }
      } else {
        const h = Math.hypot(vx, vy), nh = Math.max(0, h - (C.ROLL_DECEL + C.K_DRAG * h * h) * dt);
        if (h > 0) { vx *= nh / h; vy *= nh / h; }
        x += vx * dt; y += vy * dt; z = 0;
        if (nh < 0.4) { S.push({ t: t + dt, x, y, z, air: false, b: bounces, stop: true }); break; }
      }
      t += dt;
      S.push({ t, x, y, z, air: z > 0.05 && bounces === 0, b: bounces, v: Math.hypot(vx, vy, vz) });
      if (Math.hypot(x - C.CX, y - C.CY) > C.ROPE_R + 6) break;
    }
    return S;
  },

  // Walk the flight: first event wins — boundary, catch, or ground stop.
  field(samples, fielders, rng, level, freeHit) {
    const C = KCK.CFG;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const r = Math.hypot(s.x - C.CX, s.y - C.CY);
      if (r > C.ROPE_R) {
        // a fielder inside the rope may still take a boundary catch just as it arrives
        return { kind: s.b === 0 ? 'six' : 'four', t: s.t, i };
      }
      const catchable = s.z >= 0.25 && s.z <= 2.6 && s.t > 0.15;
      const groundable = s.z < 0.45;
      if (!catchable && !groundable) continue;
      let best = null;
      for (const f of fielders) {
        const dist = Math.hypot(f.x - s.x, f.y - s.y), run = f.speed * Math.max(0, s.t - C.REACT);
        if (catchable) {
          const reach = run + 1.0 - Math.max(0, ((s.v || 0) - 24) * 0.065), margin = reach - dist;
          if (margin >= 0 && (!best || s.t < best.t)) { best = { f, t: s.t, margin, mode: 'catch' }; }
        } else if (s.v === undefined || s.v < 36) {
          const reach = run + 0.55 + Math.min(0.5, (s.v || 0) * 0.012), margin = reach - dist;
          if (margin >= 0 && (!best)) best = { f, t: s.t, margin, mode: 'ground' };
        }
      }
      if (best) {
        if (best.mode === 'catch') {
          const p = (best.margin > 2 ? 0.02 : best.margin > 0.8 ? 0.12 : 0.35) * level.drop;
          if (rng() < p) return { kind: 'dropped', fielder: best.f, t: best.t + 0.7, spot: { x: s.x, y: s.y }, i };
          return { kind: 'caught', fielder: best.f, t: best.t, spot: { x: s.x, y: s.y }, i, margin: best.margin };
        }
        return { kind: 'ground', fielder: best.f, t: best.t, spot: { x: s.x, y: s.y }, i };
      }
    }
    // nobody got near it: nearest fielder collects it where it stopped
    const last = samples[samples.length - 1];
    let nf = null, nt = 1e9;
    for (const f of fielders) { const tt = C.REACT + Math.hypot(f.x - last.x, f.y - last.y) / f.speed; if (tt < nt) { nt = tt; nf = f; } }
    return { kind: 'ground', fielder: nf, t: Math.max(last.t, nt), spot: { x: last.x, y: last.y }, i: samples.length - 1 };
  },

  // Runs from the moment the ball is fielded.
  runs(fieldedAt) {
    const C = KCK.CFG, p = fieldedAt.spot;
    let k = 0;
    for (; k < C.MAX_RUNS; k++) {
      const endY = (k % 2 === 0) ? C.PITCH : 0;
      const tArr = fieldedAt.t + C.PICKUP + Math.hypot(p.x, p.y - endY) / C.THROW;
      const Tk = C.RUN_T1 + C.RUN_T * k;
      if (Tk + C.RUN_MARGIN > tArr) break;
    }
    return k;
  },
};

// ---- Match ----------------------------------------------------------------------------
KCK.Match = class {
  constructor(opts) {
    opts = opts || {};
    const C = KCK.CFG;
    this.levelIdx = opts.level === undefined ? 1 : opts.level;
    this.level = KCK.LEVELS[this.levelIdx];
    this.oversIdx = opts.overs === undefined ? 1 : opts.overs;
    const O = KCK.OVERS[this.oversIdx];
    this.maxOvers = O.n; this.maxWk = O.wk; this.maxBalls = O.n * C.BALLS_PER_OVER;
    this.seed = opts.seed === undefined ? 1 : opts.seed;
    this.rng = KCK.Util.rng(this.seed);
    this.first = Math.round(this.maxOvers * this.level.rpo * (0.93 + this.rng() * 0.14));
    this.target = this.first + 1;
    this.runs = 0; this.wk = 0; this.balls = 0; this.freeHit = false; this.over = false; this.result = null;
    this.batterIdx = 0; this.bat = { runs: 0, faced: 0 }; this.card = [];
    this.stats = { fours: 0, sixes: 0, dots: 0, extras: 0, perfect: 0 };
    this.log = []; this.lastBoundary = false;
    this.bowlerOrder = [];
    const cyc = [0, 1, 2, 3, 4];
    for (let i = 0; i < this.maxOvers; i++) this.bowlerOrder.push(cyc[i % 5]);
    if (this.maxOvers >= 2) this.bowlerOrder[this.maxOvers - 1] = 4;
    this.cur = null;
  }
  get ballsLeft() { return this.maxBalls - this.balls; }
  get overNo() { return Math.floor(this.balls / KCK.CFG.BALLS_PER_OVER); }
  get ballInOver() { return this.balls % KCK.CFG.BALLS_PER_OVER; }
  get need() { return Math.max(0, this.target - this.runs); }
  get batter() { return KCK.BATTERS[this.batterIdx % KCK.BATTERS.length]; }
  get bowler() { return KCK.BOWLERS[this.bowlerOrder[Math.min(this.overNo, this.bowlerOrder.length - 1)]]; }
  get phase() { const f = this.overNo / this.maxOvers; return f < 0.25 && this.maxOvers > 2 ? 'pp' : (f >= 0.7 || this.maxOvers === 2 && this.overNo >= 1 ? 'death' : 'mid'); }
  get reqRate() { return this.ballsLeft ? this.need / this.ballsLeft * 6 : 99; }

  // Next delivery + the field set for it.
  nextBall() {
    const bowler = this.bowler, phase = this.phase;
    const spec = KCK.Bowling.make(bowler, this.level, this.rng, { phase, lastBoundary: this.lastBoundary, balls: this.balls });
    const del = new KCK.Delivery(spec);
    const field = KCK.Field.make(phase, bowler);
    this.cur = { del, field, bowler, freeHit: this.freeHit };
    return this.cur;
  }

  // tapT === null  ->  no swing.  Returns the outcome record.
  resolve(tapT, aimDeg, loft) {
    const C = KCK.CFG, cur = this.cur, del = cur.del, fh = cur.freeHit;
    const out = { over: this.overNo, ball: this.ballInOver + 1, label: del.label, runs: 0, extras: 0, wicket: null, legal: true, kind: 'dot', contact: false, freeHit: fh, path: null, shot: null, fielded: null };
    let shot = tapT === null || tapT === undefined ? null : KCK.Bat.play(del, tapT, aimDeg, loft, this.rng, this.level, this.batter);
    out.shot = shot;
    const wide = Math.abs(del.arr.x) > C.WIDE_X + 0.0 || del.arr.z > 2.0;
    if (shot && shot.contact) {
      out.contact = true;
      const path = KCK.Hit.fly(shot), fd = KCK.Hit.field(path, cur.field, this.rng, this.level, fh);
      out.path = path; out.fielded = fd;
      if (fd.kind === 'six') { out.kind = 'six'; out.runs = 6; }
      else if (fd.kind === 'four') { out.kind = 'four'; out.runs = 4; }
      else if (fd.kind === 'caught') {
        out.fielder = fd.fielder;
        if (fh) { out.kind = 'dot'; out.safe = true; } else { out.kind = 'wicket'; out.wicket = fd.fielder.role === 'KEEPER' ? 'caught behind' : 'caught'; }
      } else {
        out.fielder = fd.fielder;
        out.runs = KCK.Hit.runs(fd);
        out.kind = out.runs ? 'runs' : 'dot';
        if (fd.kind === 'dropped') out.dropped = true;
      }
      if (out.kind === 'wicket') out.runs = 0;
    } else {
      out.missReason = shot ? shot.reason : 'left';
      if (wide && !del.noBall) { out.kind = 'wide'; out.legal = false; out.extras = 1; }
      else if (del.hitsStumps && !fh) { out.kind = 'wicket'; out.wicket = 'bowled'; }
      else { out.kind = 'dot'; if (del.hitsStumps && fh) out.safe = true; }
    }
    if (del.noBall && out.kind !== 'wide') { out.noBall = true; out.legal = false; out.extras = 1; if (out.kind === 'wicket') { out.kind = 'dot'; out.wicket = null; out.noBallSaved = true; } }
    this._apply(out);
    return out;
  }

  _apply(o) {
    const S = this.stats;
    this.runs += o.runs + o.extras; S.extras += o.extras;
    if (o.legal) { this.balls++; this.bat.faced++; }
    this.bat.runs += o.runs;
    if (o.kind === 'four') S.fours++; if (o.kind === 'six') S.sixes++;
    if (o.kind === 'dot' && o.legal && !o.noBall) S.dots++;
    if (o.shot && o.shot.perfect) S.perfect++;
    this.lastBoundary = o.kind === 'four' || o.kind === 'six';
    this.freeHit = !!o.noBall;
    if (o.kind === 'wicket') {
      this.wk++; this.card.push({ name: this.batter.name, runs: this.bat.runs, faced: this.bat.faced, how: o.wicket, out: true });
      this.batterIdx++; this.bat = { runs: 0, faced: 0 };
    }
    this.log.push(o);
    if (this.runs >= this.target) { this.over = true; this.result = 'win'; }
    else if (this.wk >= this.maxWk || this.balls >= this.maxBalls) { this.over = true; this.result = this.runs === this.first ? 'tie' : 'loss'; }
    if (this.over && !this.card.find(c => !c.out && c.name === this.batter.name)) this.card.push({ name: this.batter.name, runs: this.bat.runs, faced: this.bat.faced, how: 'not out', out: false });
    o.overDone = o.legal && this.ballInOver === 0;
  }
};

// ---- A deterministic batting bot (tests, evaluator, balance) -----------------------
KCK.Bot = {
  gapAim(field, loft) {
    const C = KCK.CFG;
    let best = 0, bestScore = -1;
    for (let a = -80; a <= 80; a += 4) {
      let score = 999;
      for (const f of field) {
        if (f.role === 'KEEPER') continue;
        const ang = Math.atan2(f.x, f.y) * 180 / Math.PI, dist = Math.hypot(f.x, f.y);
        let da = Math.abs(ang - a); if (da > 180) da = 360 - da;
        if (!loft && dist > 40) da += 8; // inner ring blocks a grounder, boundary riders stop it late
        if (loft && dist < 28) da += 12;
        score = Math.min(score, da);
      }
      score -= Math.abs(a) * 0.04;
      if (score > bestScore) { bestScore = score; best = a; }
    }
    return best;
  },
  // skill: timing noise (s). Returns [tapT, aimDeg, loft]
  decide(match, rng, skill) {
    const cur = match.cur, loft = match.reqRate > 9 || (match.freeHit);
    const tapT = cur.del.tArr - KCK.CFG.BAT_DELAY + rng.gauss() * skill;
    return [tapT, this.gapAim(cur.field, loft), loft];
  },
  playMatch(opts, skill, seed) {
    const m = new KCK.Match(opts), rng = KCK.Util.rng(seed || 7);
    let g = 0;
    while (!m.over && g++ < 400) { m.nextBall(); const [t, a, l] = this.decide(m, rng, skill); m.resolve(t, a, l); }
    return m;
  },
};
