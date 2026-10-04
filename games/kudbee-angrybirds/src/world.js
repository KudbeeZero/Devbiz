/* =====================================================================
 * Kudbee Birds — world.js
 * Game rules with no DOM/canvas dependency: level loading, the slingshot
 * launch, bird abilities, destruction + scoring, TNT, chains, the turn
 * state machine and star rating. The browser game and the headless solver
 * (eval/solve.mjs) drive this exact same class, one fixed tick at a time.
 *
 * state: ready -> flying -> resolve -> (ready | won | lost)
 * ===================================================================== */

KAB.GROUND_Y = 540;
KAB.SLING = { x: 150, y: 436 };
KAB.MAX_PULL = 110;
KAB.MIN_PULL = 16;
KAB.LAUNCH_K = 9.6;                     // px/s of launch speed per px of pull
KAB.TICK = 1 / 60;
KAB.BIRD_BONUS = 10000;

KAB.BIRDS = {
  cyan:  { name: 'Dash',  r: 12, density: 1.5, rest: 0.20, color: '#39e6ff', ability: 'dash',  tip: 'Tap to boost forward' },
  gold:  { name: 'Slam',  r: 15, density: 3.4, rest: 0.08, color: '#ffd34d', ability: 'slam',  tip: 'Tap to dive down hard' },
  green: { name: 'Split', r: 13, density: 1.3, rest: 0.50, color: '#7CFFb2', ability: 'split', tip: 'Tap to split in three' },
};

KAB.ENEMIES = {
  grunt: { r: 15, hp: 60,  density: 0.8, score: 5000,  color: '#ff5d9e' },
  armor: { r: 17, hp: 220, density: 1.1, score: 8000,  color: '#ff7ab8' },
  boss:  { r: 30, hp: 1100, density: 1.5, score: 25000, color: '#ff3d7f', resist: 0.4 },
};

KAB.Builder = class {
  constructor(world) { this.world = world; }

  box(mat, x, y, w, h, angle) {
    return this.world.phys.add(new KAB.Body({ shape: 'box', kind: 'block', mat, x, y, w, h, angle: angle || 0 }));
  }

  tnt(x, y, s) {
    s = s || 32;
    return this.world.phys.add(new KAB.Body({ shape: 'box', kind: 'block', mat: 'tnt', x, y, w: s, h: s }));
  }

  enemy(type, x, y) {
    const e = KAB.ENEMIES[type];
    return this.world.phys.add(new KAB.Body({
      shape: 'circle', kind: 'enemy', mat: 'wood', x, y, r: e.r, density: e.density,
      hp: e.hp, resist: e.resist, restitution: 0.12, friction: 0.5, linDamp: 0.1, angDamp: 1.2, data: { type },
    }));
  }

  enemyOn(type, x, topY) { return this.enemy(type, x, topY - KAB.ENEMIES[type].r - 0.5); }

  // Stack items upward from baseY. Item: [mat, w, h] | ['tnt', size] | [enemyType]
  col(x, items, baseY) {
    let y = baseY == null ? KAB.GROUND_Y : baseY;
    for (const it of items) {
      if (KAB.ENEMIES[it[0]]) { this.enemyOn(it[0], x, y); y -= KAB.ENEMIES[it[0]].r * 2 + 1; }
      else if (it[0] === 'tnt') { const s = it[1] || 32; this.tnt(x, y - s / 2, s); y -= s; }
      else { this.box(it[0], x, y - it[2] / 2, it[1], it[2]); y -= it[2]; }
    }
    return y;
  }

  // Horizontal beam whose underside rests at `underY`.
  beam(mat, cx, underY, w, h) { return this.box(mat, cx, underY - h / 2, w, h); }
};

KAB.World = class {
  constructor(handlers) {
    this.h = handlers || {};
    this.silent = false;
    this.phys = new KAB.Physics();
    this.state = 'ready';
    this.tick = 0;
    this.score = 0;
    this.queue = [];
    this.current = null;
    this.birds = [];
    this.index = 0;
  }

  emit(name, ...args) { if (!this.silent && this.h[name]) this.h[name](...args); }

  load(index) {
    const L = KAB.LEVELS[index];
    this.index = index;
    this.level = L;
    this.phys = new KAB.Physics();
    this.phys.onImpact = (a, b, closing, x, y) => this._impact(a, b, closing, x, y);
    this.phys.add(new KAB.Body({ shape: 'box', kind: 'ground', mat: 'ground', x: 480, y: KAB.GROUND_Y + 100, w: 4000, h: 200, isStatic: true }));
    this.phys.add(new KAB.Body({ shape: 'box', kind: 'ground', mat: 'ground', x: -60, y: 0, w: 120, h: 3000, isStatic: true }));
    this.phys.add(new KAB.Body({ shape: 'box', kind: 'ground', mat: 'ground', x: 1022, y: 0, w: 120, h: 3000, isStatic: true, data: { birdPass: true } }));   // right edge: keeps drones + debris in play
    L.build(new KAB.Builder(this));

    this.queue = L.birds.slice();
    this.current = null;
    this.birds = [];
    this.score = 0;
    this.tick = 0;
    this.chain = 0;
    this.lastKillTick = -999;
    this.pendingBlasts = [];
    this.winBonus = 0;
    this.stars = 0;
    this.totalEnemies = 0;
    this.shots = 0;

    // Let the structure settle before the player sees it (no damage, no sound).
    this.silent = true;
    this.phys.damageOn = false;
    for (let i = 0; i < 150; i++) this.phys.step(KAB.TICK);
    this.phys.damageOn = true;
    for (const b of this.phys.bodies) { b.hp = b.maxHp; b.flash = 0; }
    this.silent = false;
    this.totalEnemies = this.enemiesAlive();
    this._nextBird();
    return this;
  }

  enemiesAlive() {
    let n = 0;
    for (const b of this.phys.bodies) if (b.kind === 'enemy' && b.alive) n++;
    return n;
  }

  birdsLeft() { return this.queue.length + (this.current ? 1 : 0); }

  _nextBird() {
    this.current = this.queue.length ? this.queue.shift() : null;
    this.state = this.current ? 'ready' : 'resolve';
    this.birds = [];
    this.abilityUsed = false;
    this.resolveT = 0;
    this.emit('state', this.state);
  }

  // Launch the current bird from pull position (px, py). Returns false if the
  // pull was too short to count.
  fire(px, py) {
    if (this.state !== 'ready' || !this.current) return false;
    const dx = KAB.SLING.x - px, dy = KAB.SLING.y - py;
    const pull = Math.sqrt(dx * dx + dy * dy);
    if (pull < KAB.MIN_PULL) return false;
    const speed = Math.min(pull, KAB.MAX_PULL) * KAB.LAUNCH_K;
    const type = this.current;
    const spec = KAB.BIRDS[type];
    const b = new KAB.Body({
      shape: 'circle', kind: 'bird', mat: 'wood', x: px, y: py, r: spec.r, density: spec.density,
      restitution: spec.rest, friction: 0.5, linDamp: 0.02, angDamp: 0.6, invuln: true,
      data: { type, touched: false, slowT: 0, born: this.tick },
    });
    this.current = null;                          // the bird has left the sling
    b.vx = dx / pull * speed;
    b.vy = dy / pull * speed;
    this.phys.add(b);
    this.birds = [b];
    this.abilityUsed = false;
    this.launchTick = this.tick;
    this.state = 'flying';
    this.shots++;
    this.emit('launch', b, speed);
    this.emit('state', this.state);
    return true;
  }

  canUseAbility() {
    if (this.state !== 'flying' || this.abilityUsed) return false;
    const b = this.birds[0];
    return !!(b && b.alive && !b.data.touched);
  }

  useAbility() {
    if (!this.canUseAbility()) return false;
    const b = this.birds[0];
    const spec = KAB.BIRDS[b.data.type];
    this.abilityUsed = true;
    this.phys.wake(b);
    if (spec.ability === 'dash') {
      const sp = Math.hypot(b.vx, b.vy) || 1;
      const k = Math.min(1.4, Math.max(1.25, 720 / sp));
      b.vx *= k; b.vy *= k;
    } else if (spec.ability === 'slam') {
      b.vx *= 0.22;
      b.vy = Math.max(b.vy, 0) + 980;
    } else if (spec.ability === 'split') {
      const sp = Math.hypot(b.vx, b.vy) || 1;
      const ang = Math.atan2(b.vy, b.vx);
      for (const off of [-0.2, 0.2]) {
        const c = new KAB.Body({
          shape: 'circle', kind: 'bird', mat: 'wood', x: b.x, y: b.y, r: 9, density: spec.density,
          restitution: spec.rest, friction: 0.5, linDamp: 0.02, angDamp: 0.6, invuln: true,
          data: { type: b.data.type, touched: false, slowT: 0, born: this.tick, child: true },
        });
        c.vx = Math.cos(ang + off) * sp; c.vy = Math.sin(ang + off) * sp;
        this.phys.add(c);
        this.birds.push(c);
      }
    }
    this.emit('ability', spec.ability, b.x, b.y, b);
    return true;
  }

  _impact(a, b, closing, x, y) {
    if (this.silent) return;
    if (a.kind === 'bird') a.data.touched = true;
    if (b.kind === 'bird') b.data.touched = true;
    this.emit('impact', a, b, closing, x, y);
  }

  _score(points, x, y, kind) {
    this.score += points;
    this.emit('score', points, x, y, kind);
  }

  _destroy(b) {
    b.alive = false;
    if (b.kind === 'enemy') {
      const spec = KAB.ENEMIES[b.data.type];
      this._score(spec.score, b.x, b.y, 'enemy');
      this.chain = this.tick - this.lastKillTick < 150 ? this.chain + 1 : 1;
      this.lastKillTick = this.tick;
      if (this.chain >= 2) this._score(1000 * (this.chain - 1), b.x, b.y - 26, 'chain');
      this.emit('kill', b, this.chain);
      if (this.enemiesAlive() === 0) this.emit('lastKill', b);
    } else {
      const m = KAB.Mat[b.mat];
      this._score(m.score, b.x, b.y, 'block');
      this.emit('destroy', b);
      if (m.explosive) this.pendingBlasts.push({ x: b.x, y: b.y, t: 4 });
    }
  }

  _explode(x, y) {
    const R = 135;
    this.emit('explode', x, y, R);
    for (const o of this.phys.bodies) {
      if (o.isStatic || !o.alive) continue;
      const dx = o.x - x, dy = o.y - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > R) continue;
      const f = 1 - d / R;
      const nx = d > 1 ? dx / d : 0, ny = d > 1 ? dy / d - 0.25 : -1;
      const dv = 600 * f / (0.5 + 0.5 * o.mass);
      this.phys.wake(o);
      o.vx += nx * dv; o.vy += ny * dv;
      o.av += (nx > 0 ? 1 : -1) * f * 4;
      if (!o.invuln) o.hp -= 230 * f * f;
    }
  }

  step() {
    this.tick++;
    this.phys.step(KAB.TICK);

    // Destruction + out-of-bounds.
    for (const b of this.phys.bodies) {
      if (b.isStatic || !b.alive || b.kind === 'bird') continue;
      if (b.hp <= 0) this._destroy(b);
      else if (b.y > 900 || b.x > 1400 || b.x < -300) {
        b.alive = false;
        if (b.kind === 'enemy') {
          this._score(KAB.ENEMIES[b.data.type].score, Math.min(b.x, 940), Math.min(b.y, 540), 'enemy');
          this.emit('kill', b, 1);
          if (this.enemiesAlive() === 0) this.emit('lastKill', b);
        }
      }
    }
    for (let i = this.pendingBlasts.length - 1; i >= 0; i--) {
      const p = this.pendingBlasts[i];
      if (--p.t <= 0) { this.pendingBlasts.splice(i, 1); this._explode(p.x, p.y); }
    }
    this.phys.cleanup();

    if (this.state === 'flying') this._stepFlying();
    else if (this.state === 'resolve') this._stepResolve();
  }

  _stepFlying() {
    let settled = true;
    for (const b of this.birds) {
      if (!b.alive) continue;
      const off = b.x > 1300 || b.x < -200 || b.y > 900;
      if (off) { b.alive = false; continue; }
      const sp = Math.abs(b.vx) + Math.abs(b.vy);
      b.data.slowT = sp < 22 ? b.data.slowT + 1 : 0;
      if (!(b.asleep || b.data.slowT > 50)) settled = false;
    }
    if (this.tick - this.launchTick > 840) settled = true;
    if (settled) { this.state = 'resolve'; this.resolveT = 0; this.emit('state', this.state); }
  }

  _worldQuiet() {
    for (const b of this.phys.bodies) {
      if (b.isStatic || !b.alive || b.kind === 'bird') continue;
      if (!b.asleep && Math.abs(b.vx) + Math.abs(b.vy) > 30) return false;
    }
    return true;
  }

  _stepResolve() {
    this.resolveT++;
    if (this.resolveT === 40) for (const b of this.birds) if (b.alive) { b.alive = false; this.emit('birdGone', b); }
    if (this.resolveT < 45) return;
    if (!(this._worldQuiet() || this.resolveT > 300)) return;
    if (this.enemiesAlive() === 0) this._win();
    else if (this.queue.length) this._nextBird();
    else { this.state = 'lost'; this.emit('state', this.state); this.emit('lose'); }
  }

  _win() {
    this.winBonus = this.queue.length * KAB.BIRD_BONUS;
    this.score += this.winBonus;
    const s = this.level.stars;
    this.stars = 1 + (this.score >= s[0] ? 1 : 0) + (this.score >= s[1] ? 1 : 0);
    this.state = 'won';
    this.emit('state', this.state);
    this.emit('win', this.stars, this.score, this.winBonus);
  }

  // Ballistic preview of the first `n` ticks of a shot, using the engine's own
  // integrator so the dotted arc matches the real flight until first contact.
  preview(px, py, n) {
    const dx = KAB.SLING.x - px, dy = KAB.SLING.y - py;
    const pull = Math.sqrt(dx * dx + dy * dy);
    if (pull < KAB.MIN_PULL) return [];
    const speed = Math.min(pull, KAB.MAX_PULL) * KAB.LAUNCH_K;
    let x = px, y = py, vx = dx / pull * speed, vy = dy / pull * speed;
    const h = KAB.TICK / this.phys.substeps, g = this.phys.gravity;
    const pts = [];
    for (let i = 0; i < n; i++) {
      for (let s = 0; s < this.phys.substeps; s++) {
        vy += g * h;
        const d = 1 - 0.02 * h;
        vx *= d; vy *= d;
        x += vx * h; y += vy * h;
      }
      pts.push({ x, y });
      if (y > KAB.GROUND_Y) break;
    }
    return pts;
  }
};
