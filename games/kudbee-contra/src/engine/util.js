/* =====================================================================
 * Kudbee Contra — engine/util.js
 * The shared engine core (clamp/lerp/rand/pick/sign/dist/approach/
 * ObjectPool, from games/shared/engine/core-util.js) plus a Contra-
 * specific axis-aligned bounding-box overlap test used by combat
 * collision. Attaches to window.KC.
 * The shared script must load before this one.
 * ===================================================================== */
(function (KC, E) {
  'use strict';

  const Util = Object.assign({}, E.coreUtil, {
    /* Axis-aligned bounding-box overlap test. Boxes are {x, y, w, h}. */
    aabb(a, b) {
      return (
        a.x < b.x + b.w &&
        a.x + a.w > b.x &&
        a.y < b.y + b.h &&
        a.y + a.h > b.y
      );
    },
  });

  KC.Util = Util;
})(window.KC = window.KC || {}, window.KudbeeEngine = window.KudbeeEngine || {});
