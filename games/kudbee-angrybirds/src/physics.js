KAB.Body = class {
  constructor(x, y, w, h, type = 'dynamic') {
    this.pos = new KAB.Vec2(x, y);
    this.vel = new KAB.Vec2();
    this.acc = new KAB.Vec2();
    this.w = w;
    this.h = h;
    this.type = type; // dynamic, static, kinematic
    this.mass = type === 'dynamic' ? (w * h) / 1000 : Infinity;
    this.rot = 0;
    this.angVel = 0;
    this.angAcc = 0;
    this.friction = 0.85;
    this.restitution = 0.5;
    this.active = true;
    this.hp = 100;
  }

  step(dt, gravity) {
    if (this.type === 'static') return;

    this.acc.y = gravity;
    this.vel.add(this.acc);
    this.vel.mult(this.friction);
    this.pos.add(this.vel);
    this.acc.set(0, 0);

    this.angVel *= 0.98;
    this.rot += this.angVel;
    this.angAcc = 0;

    // Ground constraint
    if (this.pos.y + this.h / 2 > 580) {
      this.pos.y = 580 - this.h / 2;
      this.vel.y *= -this.restitution;
      if (Math.abs(this.vel.y) < 0.5) this.vel.y = 0;
    }

    if (this.pos.x < this.w / 2) {
      this.pos.x = this.w / 2;
      this.vel.x *= -this.restitution;
    }
    if (this.pos.x > 960 - this.w / 2) {
      this.pos.x = 960 - this.w / 2;
      this.vel.x *= -this.restitution;
    }
  }

  applyImpulse(px, py, ix, iy) {
    if (this.type === 'static') return;
    this.vel.x += ix / this.mass;
    this.vel.y += iy / this.mass;

    const rx = px - this.pos.x;
    const ry = py - this.pos.y;
    this.angVel += (rx * iy - ry * ix) / (this.mass * 50);
  }

  damage(amt) {
    this.hp = Math.max(0, this.hp - amt);
    if (this.hp <= 0) this.active = false;
  }
};

KAB.Physics = class {
  constructor() {
    this.bodies = [];
    this.gravity = 0.15;
    this.damping = 0.98;
  }

  add(body) {
    this.bodies.push(body);
    return body;
  }

  remove(body) {
    const i = this.bodies.indexOf(body);
    if (i >= 0) this.bodies.splice(i, 1);
  }

  step() {
    this.bodies.forEach(b => b.step(1, this.gravity));
    this.resolveCollisions();
    this.bodies = this.bodies.filter(b => b.active);
  }

  resolveCollisions() {
    for (let i = 0; i < this.bodies.length; i++) {
      for (let j = i + 1; j < this.bodies.length; j++) {
        this.checkCollision(this.bodies[i], this.bodies[j]);
      }
    }
  }

  checkCollision(a, b) {
    const dx = b.pos.x - a.pos.x;
    const dy = b.pos.y - a.pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const minDist = (a.w + b.w) / 4;

    if (dist < minDist) {
      const nx = dist > 0 ? dx / dist : 1;
      const ny = dist > 0 ? dy / dist : 0;
      const overlap = minDist - dist;

      if (a.type !== 'static') a.pos.x -= nx * overlap * 0.5;
      if (a.type !== 'static') a.pos.y -= ny * overlap * 0.5;
      if (b.type !== 'static') b.pos.x += nx * overlap * 0.5;
      if (b.type !== 'static') b.pos.y += ny * overlap * 0.5;

      const relVel = new KAB.Vec2(b.vel.x - a.vel.x, b.vel.y - a.vel.y);
      const velAlongNormal = relVel.x * nx + relVel.y * ny;

      if (velAlongNormal < 0) return;

      const restitution = Math.min(a.restitution, b.restitution);
      const impulse = -(1 + restitution) * velAlongNormal / (1 / a.mass + 1 / b.mass);

      const ix = impulse * nx;
      const iy = impulse * ny;

      if (a.type !== 'static') {
        a.vel.x -= ix / a.mass;
        a.vel.y -= iy / a.mass;
      }
      if (b.type !== 'static') {
        b.vel.x += ix / b.mass;
        b.vel.y += iy / b.mass;
      }

      const dmg = Math.max(5, Math.abs(velAlongNormal) * 2);
      a.damage(dmg);
      b.damage(dmg);
    }
  }
};
