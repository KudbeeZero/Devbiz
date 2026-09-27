const KAB = {};

KAB.Util = {
  clamp(v, min, max) { return Math.max(min, Math.min(max, v)); },
  lerp(a, b, t) { return a + (b - a) * t; },
  dist(x1, y1, x2, y2) { const dx = x2 - x1, dy = y2 - y1; return Math.sqrt(dx*dx + dy*dy); },
  angle(x1, y1, x2, y2) { return Math.atan2(y2 - y1, x2 - x1); },
  radToDeg(rad) { return rad * 180 / Math.PI; },
  degToRad(deg) { return deg * Math.PI / 180; },
  chance(p) { return Math.random() < p; },
  randRange(a, b) { return a + Math.random() * (b - a); },
  randInt(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); },
};

KAB.Vec2 = class {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }
  set(x, y) { this.x = x; this.y = y; return this; }
  add(v) { this.x += v.x; this.y += v.y; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; return this; }
  mult(s) { this.x *= s; this.y *= s; return this; }
  div(s) { this.x /= s; this.y /= s; return this; }
  dot(v) { return this.x * v.x + this.y * v.y; }
  len() { return Math.sqrt(this.x * this.x + this.y * this.y); }
  norm() { const l = this.len(); if (l > 0) this.div(l); return this; }
  clone() { return new KAB.Vec2(this.x, this.y); }
  rot(angle) {
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const x = this.x * cos - this.y * sin;
    const y = this.x * sin + this.y * cos;
    this.x = x; this.y = y;
    return this;
  }
};
