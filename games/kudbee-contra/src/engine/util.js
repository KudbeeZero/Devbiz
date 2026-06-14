/* =====================================================================
 * Kudbee Contra — engine/util.js
 * Small math, collision, and pooling helpers shared across the engine.
 * Everything attaches to the global window.KC namespace (no bundler).
 * ===================================================================== */
(function (KC) {
  'use strict';

  const Util = {
    clamp(v, min, max) {
      return v < min ? min : v > max ? max : v;
    },

    lerp(a, b, t) {
      return a + (b - a) * t;
    },

    rand(min, max) {
      return min + Math.random() * (max - min);
    },

    randInt(min, max) {
      return Math.floor(Util.rand(min, max + 1));
    },

    pick(arr) {
      return arr[Util.randInt(0, arr.length - 1)];
    },

    sign(v) {
      return v < 0 ? -1 : v > 0 ? 1 : 0;
    },

    /* Axis-aligned bounding-box overlap test. Boxes are {x, y, w, h}. */
    aabb(a, b) {
      return (
        a.x < b.x + b.w &&
        a.x + a.w > b.x &&
        a.y < b.y + b.h &&
        a.y + a.h > b.y
      );
    },

    /* Distance between two points. */
    dist(x1, y1, x2, y2) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      return Math.sqrt(dx * dx + dy * dy);
    },

    /* Approach `current` toward `target` by at most `delta` (for smoothing). */
    approach(current, target, delta) {
      if (current < target) return Math.min(current + delta, target);
      return Math.max(current - delta, target);
    },
  };

  /* ---------------------------------------------------------------------
   * ObjectPool — recycles entities so the GC stays quiet during combat.
   * `factory` builds a fresh object; `reset(obj, ...args)` reinitializes it.
   * ------------------------------------------------------------------- */
  function ObjectPool(factory, reset) {
    this.factory = factory;
    this.reset = reset;
    this.active = [];
    this.free = [];
  }

  ObjectPool.prototype.spawn = function () {
    const obj = this.free.length ? this.free.pop() : this.factory();
    this.reset.apply(null, [obj].concat(Array.prototype.slice.call(arguments)));
    obj.dead = false;
    this.active.push(obj);
    return obj;
  };

  /* Sweep dead actives back into the free list. Call once per frame. */
  ObjectPool.prototype.sweep = function () {
    for (let i = this.active.length - 1; i >= 0; i--) {
      if (this.active[i].dead) {
        this.free.push(this.active.splice(i, 1)[0]);
      }
    }
  };

  ObjectPool.prototype.clear = function () {
    while (this.active.length) this.free.push(this.active.pop());
  };

  Util.ObjectPool = ObjectPool;
  KC.Util = Util;
})(window.KC = window.KC || {});
