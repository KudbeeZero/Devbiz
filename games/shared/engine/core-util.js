/* =====================================================================
 * Kudbee Shared Engine — core-util.js
 * The math, randomness, and pooling helpers that every Kudbee title
 * needs, with no game-specific logic. Exposed as `KudbeeEngine.coreUtil`.
 *
 * Games build their own `Util` by spreading this core and adding their
 * game-specific extras (e.g. Darts adds gaussian/angNorm/smooth for aim
 * scatter; Contra adds aabb for collision), then attach it to their own
 * namespace. That keeps this file free of any single game's concerns
 * while still being the one place shared primitives are maintained.
 *
 * Load this before the game's own engine scripts.
 * ===================================================================== */
(function (E) {
  'use strict';

  const core = {
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
      return Math.floor(core.rand(min, max + 1));
    },

    pick(arr) {
      return arr[core.randInt(0, arr.length - 1)];
    },

    sign(v) {
      return v < 0 ? -1 : v > 0 ? 1 : 0;
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

  core.ObjectPool = ObjectPool;
  E.coreUtil = core;
})(window.KudbeeEngine = window.KudbeeEngine || {});
