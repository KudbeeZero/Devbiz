/* =====================================================================
 * Kudbee Darts — engine/util.js
 * Small math, randomness, and pooling helpers shared across the engine.
 * Everything attaches to the global window.KD namespace (no bundler).
 * Ported from the Kudbee Contra engine with two darts-specific helpers
 * (gaussian, angNorm) added for the aim-scatter and wedge math.
 * ===================================================================== */
(function (KD) {
  'use strict';

  const TAU = Math.PI * 2;

  const Util = {
    TAU: TAU,

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

    /* Standard-normal sample via Box-Muller. Used for AI aim scatter so the
     * grouping is a believable bell curve around the intended target. */
    gaussian() {
      let u1 = 0, u2 = 0;
      while (u1 === 0) u1 = Math.random(); // avoid log(0)
      u2 = Math.random();
      return Math.sqrt(-2 * Math.log(u1)) * Math.cos(TAU * u2);
    },

    /* Wrap an angle into [-PI, PI). */
    angNorm(a) {
      a = (a + Math.PI) % TAU;
      if (a < 0) a += TAU;
      return a - Math.PI;
    },

    /* Smoothstep easing on [0,1]. */
    smooth(t) {
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      return t * t * (3 - 2 * t);
    },
  };

  /* ---------------------------------------------------------------------
   * ObjectPool — recycles entities so the GC stays quiet during effects.
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
  KD.Util = Util;
})(window.KD = window.KD || {});
