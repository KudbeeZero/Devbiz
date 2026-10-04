/* =====================================================================
 * Kudbee Birds — physics.js
 * A small 2D rigid-body engine: boxes + circles, SAT/clipped contact
 * manifolds, warm-started sequential impulses, rotation, friction,
 * restitution, sleeping and impact damage. Fixed-timestep + sub-stepped so a
 * fast bird cannot tunnel through a thin pane, and fully deterministic (no
 * Math.random) so the headless solver can replay shots exactly.
 *
 * Units: pixels, seconds. +y is down.
 * ===================================================================== */

KAB.Mat = {
  glass:  { density: 0.6, rest: 0.10, fric: 0.35, hp: 55,  score: 300, color: '#39e6ff' },
  wood:   { density: 1.0, rest: 0.15, fric: 0.65, hp: 150, score: 500, color: '#ffd34d' },
  stone:  { density: 2.1, rest: 0.06, fric: 0.75, hp: 480, score: 800, color: '#c46bff' },
  tnt:    { density: 0.8, rest: 0.12, fric: 0.5,  hp: 28,  score: 600, color: '#ff5d3c', explosive: true },
  ground: { density: 1,   rest: 0.05, fric: 0.9,  hp: 1e9, score: 0,   color: '#1b2a46' },
};

KAB.Body = class {
  constructor(o) {
    this.id = KAB.Body._n++;
    this.shape = o.shape || 'box';
    this.kind = o.kind || 'block';          // block | bird | enemy | ground
    this.mat = o.mat || 'wood';
    const m = KAB.Mat[this.mat] || KAB.Mat.wood;
    this.x = o.x; this.y = o.y; this.angle = o.angle || 0;
    this.vx = 0; this.vy = 0; this.av = 0;
    this.w = o.w || 0; this.h = o.h || 0; this.r = o.r || 0;
    this.density = o.density != null ? o.density : m.density;
    this.restitution = o.restitution != null ? o.restitution : m.rest;
    this.friction = o.friction != null ? o.friction : m.fric;
    this.maxHp = this.hp = o.hp != null ? o.hp : m.hp;
    this.isStatic = !!o.isStatic;
    this.invuln = !!o.invuln;
    this.resist = o.resist != null ? o.resist : 1;   // damage multiplier (<1 = tougher)
    this.linDamp = o.linDamp != null ? o.linDamp : 0.05;
    this.angDamp = o.angDamp != null ? o.angDamp : 0.5;
    // Polygons (e.g. roof triangles) arrive as local vertices; re-centre on the centroid.
    let area, inertiaPerMass;
    if (this.shape === 'poly') {
      const v = o.verts;
      let a2 = 0, cx = 0, cy = 0;
      for (let i = 0; i < v.length; i++) {
        const p = v[i], q = v[(i + 1) % v.length], cr = p.x * q.y - q.x * p.y;
        a2 += cr; cx += (p.x + q.x) * cr; cy += (p.y + q.y) * cr;
      }
      area = Math.abs(a2) / 2; cx /= 3 * a2; cy /= 3 * a2;
      this.verts = v.map(p => ({ x: p.x - cx, y: p.y - cy }));
      let num = 0, den = 0;
      for (let i = 0; i < this.verts.length; i++) {
        const p = this.verts[i], q = this.verts[(i + 1) % this.verts.length], cr = Math.abs(p.x * q.y - q.x * p.y);
        num += cr * (p.x * p.x + p.y * p.y + p.x * q.x + p.y * q.y + q.x * q.x + q.y * q.y); den += cr;
      }
      inertiaPerMass = num / (6 * den);
      this.cx = cx; this.cy = cy;                 // centroid offset from the authoring origin
      this.rad = Math.max.apply(null, this.verts.map(p => Math.hypot(p.x, p.y)));
      this.w = 2 * Math.max.apply(null, this.verts.map(p => Math.abs(p.x))); this.h = 2 * Math.max.apply(null, this.verts.map(p => Math.abs(p.y)));
    } else {
      area = this.shape === 'circle' ? Math.PI * this.r * this.r : this.w * this.h;
      inertiaPerMass = this.shape === 'circle' ? 0.5 * this.r * this.r : (this.w * this.w + this.h * this.h) / 12;
      this.rad = this.shape === 'circle' ? this.r : Math.hypot(this.w, this.h) / 2;
    }
    this.mass = this.isStatic ? 0 : this.density * area / 1000;
    this.invMass = this.isStatic ? 0 : 1 / this.mass;
    this.invI = this.isStatic ? 0 : 1 / (this.mass * inertiaPerMass);
    this.asleep = false;
    this.sleepT = 0;
    this.alive = true;
    this.flash = 0;                          // render-only impact flash
    this.data = o.data || {};
  }
};
KAB.Body._n = 1;

KAB.Physics = class {
  constructor() {
    this.bodies = [];
    this.gravity = 900;
    this.substeps = 3;
    this.iters = 10;
    this.damageOn = true;
    this.onImpact = null;                    // (a, b, closingSpeed, x, y)
    this.arbiters = new Map();
  }

  add(b) { this.bodies.push(b); return b; }

  step(dt) {
    const h = dt / this.substeps;
    for (let i = 0; i < this.substeps; i++) this._substep(h);
  }

  // Drop dead bodies and wake anything that was resting against them.
  cleanup() {
    let removed = null;
    for (const b of this.bodies) if (!b.alive) (removed || (removed = [])).push(b);
    if (!removed) return;
    this.bodies = this.bodies.filter(b => b.alive);
    for (const r of removed) this.wakeNear(r.x, r.y, r.rad + 8);
  }

  wakeNear(x, y, radius) {
    for (const b of this.bodies) {
      if (b.isStatic || !b.asleep) continue;
      if (Math.abs(b.x - x) < radius + b.rad && Math.abs(b.y - y) < radius + b.rad) {
        b.asleep = false; b.sleepT = 0;
      }
    }
  }

  wake(b) { b.asleep = false; b.sleepT = 0; }

  _substep(h) {
    const bodies = this.bodies;
    const n = bodies.length;
    const g = this.gravity;

    for (let i = 0; i < n; i++) {
      const b = bodies[i];
      if (b.isStatic) continue;
      if (!b.asleep) b.vy += g * h;
      if (b.shape === 'circle') { b._hx = b.r; b._hy = b.r; }
      else if (b.shape === 'poly') {
        const c = Math.cos(b.angle), sn = Math.sin(b.angle);
        let mx = 0, my = 0;
        for (const p of b.verts) { mx = Math.max(mx, Math.abs(p.x * c - p.y * sn)); my = Math.max(my, Math.abs(p.x * sn + p.y * c)); }
        b._hx = mx; b._hy = my;
      } else {
        const c = Math.abs(Math.cos(b.angle)), s = Math.abs(Math.sin(b.angle));
        b._hx = c * b.w / 2 + s * b.h / 2;
        b._hy = s * b.w / 2 + c * b.h / 2;
      }
    }
    for (let i = 0; i < n; i++) {
      const b = bodies[i];
      if (!b.isStatic) continue;
      const c = Math.abs(Math.cos(b.angle)), s = Math.abs(Math.sin(b.angle));
      b._hx = c * b.w / 2 + s * b.h / 2;
      b._hy = s * b.w / 2 + c * b.h / 2;
    }

    // ---- narrow phase -> arbiters -------------------------------------
    const prev = this.arbiters;
    const next = new Map();
    const list = [];
    for (let i = 0; i < n; i++) {
      const A = bodies[i];
      for (let j = i + 1; j < n; j++) {
        const B = bodies[j];
        if (A.isStatic && B.isStatic) continue;
        if ((A.kind === 'bird' && B.data.birdPass) || (B.kind === 'bird' && A.data.birdPass)) continue;   // edge wall: birds fly through
        if ((A.data.egg && B.kind === 'bird') || (B.data.egg && A.kind === 'bird')) continue;           // egg bombs ignore the bird that laid them
        const sA = A.isStatic || A.asleep, sB = B.isStatic || B.asleep;
        if (sA && sB) continue;
        if (Math.abs(A.x - B.x) > A._hx + B._hx || Math.abs(A.y - B.y) > A._hy + B._hy) continue;
        const man = KAB.collide(A, B);
        if (!man) continue;

        // Wake a sleeper if something genuinely hits it.
        if (A.asleep || B.asleep) {
          const rvx = B.vx - A.vx, rvy = B.vy - A.vy;
          const closing = -(rvx * man.nx + rvy * man.ny);
          const mover = A.asleep ? B : A;
          if (closing > 18 || mover.kind === 'bird' || Math.hypot(mover.vx, mover.vy) > 40) {
            if (A.asleep) this.wake(A);
            if (B.asleep) this.wake(B);
          }
        }

        const key = A.id < B.id ? A.id * 67108864 + B.id : B.id * 67108864 + A.id;   // 2^26 apart: ids can never collide
        const old = prev.get(key);
        const arb = {
          A, B, nx: man.nx, ny: man.ny, pts: man.pts,
          fric: Math.sqrt(A.friction * B.friction),
          e: Math.max(A.restitution, B.restitution),
        };
        if (old && old.A === A) {
          for (const c of arb.pts) {
            for (const oc of old.pts) {
              if (Math.abs(c.x - oc.x) < 4 && Math.abs(c.y - oc.y) < 4) { c.Pn = oc.Pn; c.Pt = oc.Pt; break; }
            }
          }
        }
        next.set(key, arb);
        list.push(arb);
      }
    }
    this.arbiters = next;

    // ---- pre-step: effective masses, bias, warm start, impact damage ---
    const inv_h = 1 / h;
    for (const arb of list) {
      const { A, B, nx, ny } = arb;
      const tx = ny, ty = -nx;
      const aDyn = !(A.isStatic || A.asleep), bDyn = !(B.isStatic || B.asleep);
      const imA = aDyn ? A.invMass : 0, imB = bDyn ? B.invMass : 0;
      const iiA = aDyn ? A.invI : 0, iiB = bDyn ? B.invI : 0;
      arb.imA = imA; arb.imB = imB; arb.iiA = iiA; arb.iiB = iiB;
      let closeSum = 0, closeN = 0, cx = 0, cy = 0;
      for (const c of arb.pts) {
        c.rAx = c.x - A.x; c.rAy = c.y - A.y;
        c.rBx = c.x - B.x; c.rBy = c.y - B.y;
        const rnA = c.rAx * ny - c.rAy * nx, rnB = c.rBx * ny - c.rBy * nx;
        c.massN = 1 / (imA + imB + iiA * rnA * rnA + iiB * rnB * rnB);
        const rtA = c.rAx * ty - c.rAy * tx, rtB = c.rBx * ty - c.rBy * tx;
        c.massT = 1 / (imA + imB + iiA * rtA * rtA + iiB * rtB * rtB);
        const dvx = (B.vx - B.av * c.rBy) - (A.vx - A.av * c.rAy);
        const dvy = (B.vy + B.av * c.rBx) - (A.vy + A.av * c.rAx);
        const vn = dvx * nx + dvy * ny;
        const push = Math.min(140, 0.2 * inv_h * Math.max(0, -c.sep - 0.6));
        c.bias = push;
        if (vn < -70) c.bias = Math.max(c.bias, -arb.e * vn);
        if (vn < 0) { closeSum += -vn; closeN++; }
        cx += c.x; cy += c.y;
        const Px = c.Pn * nx + c.Pt * tx, Py = c.Pn * ny + c.Pt * ty;
        A.vx -= imA * Px; A.vy -= imA * Py; A.av -= iiA * (c.rAx * Py - c.rAy * Px);
        B.vx += imB * Px; B.vy += imB * Py; B.av += iiB * (c.rBx * Py - c.rBy * Px);
      }
      if (closeN > 0) {
        const closing = closeSum / arb.pts.length;
        if (closing > 40) {
          const px = cx / arb.pts.length, py = cy / arb.pts.length;
          if (this.damageOn && closing > 90) {
            const mu = 1 / (A.invMass + B.invMass);
            // Birds are the player's weapon and hit full strength; debris-on-debris
            // chain damage is softened so one lucky bird can't clear a whole level.
            const dmg = (closing - 90) * mu * (A.kind === 'bird' || B.kind === 'bird' || A.kind === 'ground' || B.kind === 'ground' ? 0.25 : 0.13);
            if (!A.isStatic && !A.invuln) { A.hp -= dmg * A.resist; A.flash = 1; }
            if (!B.isStatic && !B.invuln) { B.hp -= dmg * B.resist; B.flash = 1; }
          }
          if (this.onImpact) this.onImpact(A, B, closing, px, py);
        }
      }
    }

    // ---- iterate -------------------------------------------------------
    for (let it = 0; it < this.iters; it++) {
      for (const arb of list) {
        const { A, B, nx, ny, imA, imB, iiA, iiB } = arb;
        const tx = ny, ty = -nx;
        for (const c of arb.pts) {
          let dvx = (B.vx - B.av * c.rBy) - (A.vx - A.av * c.rAy);
          let dvy = (B.vy + B.av * c.rBx) - (A.vy + A.av * c.rAx);
          const vn = dvx * nx + dvy * ny;
          let dPn = c.massN * (-vn + c.bias);
          const Pn0 = c.Pn;
          c.Pn = Math.max(Pn0 + dPn, 0);
          dPn = c.Pn - Pn0;
          let Px = dPn * nx, Py = dPn * ny;
          A.vx -= imA * Px; A.vy -= imA * Py; A.av -= iiA * (c.rAx * Py - c.rAy * Px);
          B.vx += imB * Px; B.vy += imB * Py; B.av += iiB * (c.rBx * Py - c.rBy * Px);

          dvx = (B.vx - B.av * c.rBy) - (A.vx - A.av * c.rAy);
          dvy = (B.vy + B.av * c.rBx) - (A.vy + A.av * c.rAx);
          const vt = dvx * tx + dvy * ty;
          let dPt = c.massT * (-vt);
          const maxPt = arb.fric * c.Pn;
          const Pt0 = c.Pt;
          c.Pt = Math.max(-maxPt, Math.min(maxPt, Pt0 + dPt));
          dPt = c.Pt - Pt0;
          Px = dPt * tx; Py = dPt * ty;
          A.vx -= imA * Px; A.vy -= imA * Py; A.av -= iiA * (c.rAx * Py - c.rAy * Px);
          B.vx += imB * Px; B.vy += imB * Py; B.av += iiB * (c.rBx * Py - c.rBy * Px);
        }
      }
    }

    // ---- integrate + sleep ---------------------------------------------
    for (let i = 0; i < n; i++) {
      const b = bodies[i];
      if (b.isStatic || b.asleep) continue;
      const ld = 1 - Math.min(0.5, b.linDamp * h), ad = 1 - Math.min(0.5, b.angDamp * h);
      b.vx *= ld; b.vy *= ld; b.av *= ad;
      b.x += b.vx * h; b.y += b.vy * h; b.angle += b.av * h;
      const sp = Math.abs(b.vx) + Math.abs(b.vy) + Math.abs(b.av) * b.rad;
      if (sp < 7) {
        b.sleepT += h;
        if (b.sleepT > 0.6) { b.asleep = true; b.vx = b.vy = b.av = 0; }
      } else b.sleepT = 0;
      if (b.flash > 0) b.flash = Math.max(0, b.flash - h * 4);
    }
  }
};

/* ---- narrow phase ------------------------------------------------------
 * collide(A, B) -> { nx, ny, pts:[{x,y,sep,Pn,Pt}] } or null. The normal
 * points from A toward B. Box-box follows the classic SAT + incident-edge
 * clipping approach, giving two contact points so stacks rest flat.
 * --------------------------------------------------------------------- */
KAB.collide = function (A, B) {
  if (A.shape === 'poly' || B.shape === 'poly') {
    if (A.shape === 'circle') return KAB._circlePoly(A, B);
    if (B.shape === 'circle') {
      const m = KAB._circlePoly(B, A);
      if (!m) return null;
      m.nx = -m.nx; m.ny = -m.ny;
      return m;
    }
    return KAB._polyPoly(A, B);
  }
  if (A.shape === 'circle' && B.shape === 'circle') return KAB._circleCircle(A, B);
  if (A.shape === 'circle') return KAB._circleBox(A, B);     // circle -> box == A -> B
  if (B.shape === 'circle') {
    const m = KAB._circleBox(B, A);                           // circle(B) -> box(A): flip to A -> B
    if (!m) return null;
    m.nx = -m.nx; m.ny = -m.ny;
    return m;
  }
  return KAB._boxBox(A, B);
};

KAB._circleCircle = function (A, B) {
  const dx = B.x - A.x, dy = B.y - A.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  const rs = A.r + B.r;
  if (d >= rs) return null;
  const nx = d > 1e-6 ? dx / d : 0, ny = d > 1e-6 ? dy / d : 1;
  const sep = d - rs;
  return { nx, ny, pts: [{ x: A.x + nx * (A.r + sep * 0.5), y: A.y + ny * (A.r + sep * 0.5), sep, Pn: 0, Pt: 0 }] };
};

// Circle `C` against box `X`. Returned normal points from the circle to the box.
KAB._circleBox = function (C, X) {
  const cs = Math.cos(X.angle), sn = Math.sin(X.angle);
  const dx = C.x - X.x, dy = C.y - X.y;
  const px = dx * cs + dy * sn, py = -dx * sn + dy * cs;     // circle centre in box space
  const hx = X.w / 2, hy = X.h / 2;
  const qx = Math.max(-hx, Math.min(hx, px)), qy = Math.max(-hy, Math.min(hy, py));
  let lnx, lny, sep, cxl, cyl;
  if (qx === px && qy === py) {                                // centre inside the box
    const ox = hx - Math.abs(px), oy = hy - Math.abs(py);
    if (ox < oy) { lnx = px >= 0 ? 1 : -1; lny = 0; cxl = lnx * hx; cyl = py; sep = -(ox + C.r); }
    else { lnx = 0; lny = py >= 0 ? 1 : -1; cxl = px; cyl = lny * hy; sep = -(oy + C.r); }
  } else {
    const ddx = px - qx, ddy = py - qy;
    const d = Math.sqrt(ddx * ddx + ddy * ddy);
    if (d >= C.r) return null;
    lnx = ddx / d; lny = ddy / d; cxl = qx; cyl = qy; sep = d - C.r;
  }
  // box -> circle normal in world space, then flip to circle -> box
  const wnx = lnx * cs - lny * sn, wny = lnx * sn + lny * cs;
  const wx = X.x + cxl * cs - cyl * sn, wy = X.y + cxl * sn + cyl * cs;
  return { nx: -wnx, ny: -wny, pts: [{ x: wx, y: wy, sep, Pn: 0, Pt: 0 }] };
};

KAB._boxBox = function (A, B) {
  const hAx = A.w / 2, hAy = A.h / 2, hBx = B.w / 2, hBy = B.h / 2;
  const ca = Math.cos(A.angle), sa = Math.sin(A.angle);
  const cb = Math.cos(B.angle), sb = Math.sin(B.angle);
  // rotation columns: col1 = (c, s), col2 = (-s, c)
  const dpx = B.x - A.x, dpy = B.y - A.y;
  const dAx = ca * dpx + sa * dpy, dAy = -sa * dpx + ca * dpy;
  const dBx = cb * dpx + sb * dpy, dBy = -sb * dpx + cb * dpy;
  // C = RotA^T * RotB
  const C11 = ca * cb + sa * sb, C21 = -sa * cb + ca * sb;     // col1
  const C12 = ca * -sb + sa * cb, C22 = -sa * -sb + ca * cb;   // col2
  const a11 = Math.abs(C11), a21 = Math.abs(C21), a12 = Math.abs(C12), a22 = Math.abs(C22);

  const fAx = Math.abs(dAx) - hAx - (a11 * hBx + a12 * hBy);
  if (fAx > 0) return null;
  const fAy = Math.abs(dAy) - hAy - (a21 * hBx + a22 * hBy);
  if (fAy > 0) return null;
  const fBx = Math.abs(dBx) - (a11 * hAx + a21 * hAy) - hBx;
  if (fBx > 0) return null;
  const fBy = Math.abs(dBy) - (a12 * hAx + a22 * hAy) - hBy;
  if (fBy > 0) return null;

  let axis = 0, separation = fAx, nx, ny;
  nx = dAx > 0 ? ca : -ca; ny = dAx > 0 ? sa : -sa;
  const relTol = 0.95, absTol = 0.01;
  if (fAy > relTol * separation + absTol * hAy) {
    axis = 1; separation = fAy;
    nx = dAy > 0 ? -sa : sa; ny = dAy > 0 ? ca : -ca;
  }
  if (fBx > relTol * separation + absTol * hBx) {
    axis = 2; separation = fBx;
    nx = dBx > 0 ? cb : -cb; ny = dBx > 0 ? sb : -sb;
  }
  if (fBy > relTol * separation + absTol * hBy) {
    axis = 3; separation = fBy;
    nx = dBy > 0 ? -sb : sb; ny = dBy > 0 ? cb : -cb;
  }

  let frontNx, frontNy, front, sideNx, sideNy, negSide, posSide, inc;
  if (axis === 0) {
    frontNx = nx; frontNy = ny; front = A.x * frontNx + A.y * frontNy + hAx;
    sideNx = -sa; sideNy = ca; const side = A.x * sideNx + A.y * sideNy;
    negSide = -side + hAy; posSide = side + hAy;
    inc = KAB._incident(hBx, hBy, B.x, B.y, cb, sb, frontNx, frontNy);
  } else if (axis === 1) {
    frontNx = nx; frontNy = ny; front = A.x * frontNx + A.y * frontNy + hAy;
    sideNx = ca; sideNy = sa; const side = A.x * sideNx + A.y * sideNy;
    negSide = -side + hAx; posSide = side + hAx;
    inc = KAB._incident(hBx, hBy, B.x, B.y, cb, sb, frontNx, frontNy);
  } else if (axis === 2) {
    frontNx = -nx; frontNy = -ny; front = B.x * frontNx + B.y * frontNy + hBx;
    sideNx = -sb; sideNy = cb; const side = B.x * sideNx + B.y * sideNy;
    negSide = -side + hBy; posSide = side + hBy;
    inc = KAB._incident(hAx, hAy, A.x, A.y, ca, sa, frontNx, frontNy);
  } else {
    frontNx = -nx; frontNy = -ny; front = B.x * frontNx + B.y * frontNy + hBy;
    sideNx = cb; sideNy = sb; const side = B.x * sideNx + B.y * sideNy;
    negSide = -side + hBx; posSide = side + hBx;
    inc = KAB._incident(hAx, hAy, A.x, A.y, ca, sa, frontNx, frontNy);
  }

  const c1 = KAB._clip(inc, -sideNx, -sideNy, negSide);
  if (c1.length < 2) return null;
  const c2 = KAB._clip(c1, sideNx, sideNy, posSide);
  if (c2.length < 2) return null;

  const pts = [];
  for (let i = 0; i < 2; i++) {
    const sep = frontNx * c2[i].x + frontNy * c2[i].y - front;
    if (sep <= 0) {
      pts.push({ x: c2[i].x - sep * frontNx, y: c2[i].y - sep * frontNy, sep, Pn: 0, Pt: 0 });
    }
  }
  if (!pts.length) return null;
  return { nx, ny, pts };
};

KAB._incident = function (hx, hy, px, py, c, s, nx, ny) {
  // n = -(Rot^T * normal)
  let lx = -(c * nx + s * ny), ly = -(-s * nx + c * ny);
  const ax = Math.abs(lx), ay = Math.abs(ly);
  let v0, v1;
  if (ax > ay) {
    if (lx > 0) { v0 = [hx, -hy]; v1 = [hx, hy]; } else { v0 = [-hx, hy]; v1 = [-hx, -hy]; }
  } else if (ly > 0) { v0 = [hx, hy]; v1 = [-hx, hy]; } else { v0 = [-hx, -hy]; v1 = [hx, -hy]; }
  return [
    { x: px + c * v0[0] - s * v0[1], y: py + s * v0[0] + c * v0[1] },
    { x: px + c * v1[0] - s * v1[1], y: py + s * v1[0] + c * v1[1] },
  ];
};

KAB._clip = function (v, nx, ny, offset) {
  const out = [];
  const d0 = nx * v[0].x + ny * v[0].y - offset;
  const d1 = nx * v[1].x + ny * v[1].y - offset;
  if (d0 <= 0) out.push(v[0]);
  if (d1 <= 0) out.push(v[1]);
  if (d0 * d1 < 0) {
    const t = d0 / (d0 - d1);
    out.push({ x: v[0].x + t * (v[1].x - v[0].x), y: v[0].y + t * (v[1].y - v[0].y) });
  }
  return out;
};

/* ---- convex polygons -----------------------------------------------------
 * World-space vertices + outward edge normals for a poly OR a box, then the
 * same reference-face / incident-edge clipping used for boxes, generalised.
 * --------------------------------------------------------------------- */
KAB._polyData = function (b) {
  const c = Math.cos(b.angle), sn = Math.sin(b.angle);
  const local = b.shape === 'poly' ? b.verts : [
    { x: -b.w / 2, y: -b.h / 2 }, { x: b.w / 2, y: -b.h / 2 }, { x: b.w / 2, y: b.h / 2 }, { x: -b.w / 2, y: b.h / 2 }];
  const v = [], n = [];
  for (const p of local) v.push({ x: b.x + p.x * c - p.y * sn, y: b.y + p.x * sn + p.y * c });
  for (let i = 0; i < v.length; i++) {
    const a = v[i], q = v[(i + 1) % v.length];
    let ex = q.x - a.x, ey = q.y - a.y;
    const l = Math.sqrt(ex * ex + ey * ey) || 1;
    let nx = ey / l, ny = -ex / l;
    if (nx * (a.x - b.x) + ny * (a.y - b.y) < 0) { nx = -nx; ny = -ny; }   // always outward
    n.push({ x: nx, y: ny });
  }
  return { v, n };
};

KAB._maxSep = function (P, Q) {
  let best = -Infinity, idx = 0;
  for (let i = 0; i < P.v.length; i++) {
    let mn = Infinity;
    for (let j = 0; j < Q.v.length; j++) {
      const d = P.n[i].x * (Q.v[j].x - P.v[i].x) + P.n[i].y * (Q.v[j].y - P.v[i].y);
      if (d < mn) mn = d;
    }
    if (mn > best) { best = mn; idx = i; }
  }
  return [best, idx];
};

KAB._polyPoly = function (A, B) {
  const pa = KAB._polyData(A), pb = KAB._polyData(B);
  const ra = KAB._maxSep(pa, pb); if (ra[0] > 0) return null;
  const rb = KAB._maxSep(pb, pa); if (rb[0] > 0) return null;
  const flip = rb[0] > ra[0] + 0.1;
  const ref = flip ? pb : pa, inc = flip ? pa : pb, ri = flip ? rb[1] : ra[1];
  const n = ref.n[ri];
  let ii = 0, mn = Infinity;
  for (let j = 0; j < inc.n.length; j++) { const d = n.x * inc.n[j].x + n.y * inc.n[j].y; if (d < mn) { mn = d; ii = j; } }
  const seg = [inc.v[ii], inc.v[(ii + 1) % inc.v.length]];
  const r1 = ref.v[ri], r2 = ref.v[(ri + 1) % ref.v.length];
  let tx = r2.x - r1.x, ty = r2.y - r1.y; const tl = Math.sqrt(tx * tx + ty * ty) || 1; tx /= tl; ty /= tl;
  const c1 = KAB._clip(seg, -tx, -ty, -(tx * r1.x + ty * r1.y));
  if (c1.length < 2) return null;
  const c2 = KAB._clip(c1, tx, ty, tx * r2.x + ty * r2.y);
  if (c2.length < 2) return null;
  const pts = [];
  for (const p of c2) {
    const sep = n.x * (p.x - r1.x) + n.y * (p.y - r1.y);
    if (sep <= 0) pts.push({ x: p.x - sep * n.x, y: p.y - sep * n.y, sep, Pn: 0, Pt: 0 });
  }
  if (!pts.length) return null;
  return flip ? { nx: -n.x, ny: -n.y, pts } : { nx: n.x, ny: n.y, pts };
};

// Circle C against polygon/box P. Returned normal points from the circle to P.
KAB._circlePoly = function (C, P) {
  const pd = KAB._polyData(P);
  let best = -Infinity, fi = 0;
  for (let i = 0; i < pd.v.length; i++) {
    const s = pd.n[i].x * (C.x - pd.v[i].x) + pd.n[i].y * (C.y - pd.v[i].y);
    if (s > best) { best = s; fi = i; }
  }
  if (best > C.r) return null;
  const v1 = pd.v[fi], v2 = pd.v[(fi + 1) % pd.v.length], n = pd.n[fi];
  let nx, ny, px, py, sep;
  if (best < 0) {                                             // centre inside: push out through the nearest face
    nx = n.x; ny = n.y; px = C.x - n.x * best; py = C.y - n.y * best; sep = best - C.r;
  } else {
    const ex = v2.x - v1.x, ey = v2.y - v1.y, l2 = ex * ex + ey * ey || 1;
    const u = ((C.x - v1.x) * ex + (C.y - v1.y) * ey) / l2;
    if (u <= 0 || u >= 1) {
      const v = u <= 0 ? v1 : v2;
      const dx = C.x - v.x, dy = C.y - v.y, d = Math.sqrt(dx * dx + dy * dy);
      if (d >= C.r) return null;
      nx = d > 1e-6 ? dx / d : n.x; ny = d > 1e-6 ? dy / d : n.y; px = v.x; py = v.y; sep = d - C.r;
    } else { nx = n.x; ny = n.y; px = C.x - n.x * best; py = C.y - n.y * best; sep = best - C.r; }
  }
  return { nx: -nx, ny: -ny, pts: [{ x: px, y: py, sep, Pn: 0, Pt: 0 }] };
};
