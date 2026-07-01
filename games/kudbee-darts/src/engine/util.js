/* =====================================================================
 * Kudbee Darts — engine/util.js
 * The shared engine core (clamp/lerp/rand/pick/sign/dist/approach/
 * ObjectPool, from games/shared/engine/core-util.js) plus two
 * darts-specific helpers used by the aim-scatter and wedge math
 * (gaussian, angNorm) and a smoothstep easing. Attaches to window.KD.
 * The shared script must load before this one.
 * ===================================================================== */
(function (KD, E) {
  'use strict';

  const TAU = Math.PI * 2;

  const Util = Object.assign({}, E.coreUtil, {
    TAU: TAU,

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
  });

  KD.Util = Util;
})(window.KD = window.KD || {}, window.KudbeeEngine = window.KudbeeEngine || {});
