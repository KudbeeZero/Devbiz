/* =====================================================================
 * Kudbee Darts — engine/loop.js
 * Thin shim over the shared fixed-timestep loop
 * (games/shared/engine/loop.js). The game keeps calling `KD.Loop`
 * unchanged; the implementation lives in one shared place now.
 * The shared script must load before this one.
 * ===================================================================== */
(function (KD, E) {
  'use strict';
  KD.Loop = E.Loop;
})(window.KD = window.KD || {}, window.KudbeeEngine = window.KudbeeEngine || {});
