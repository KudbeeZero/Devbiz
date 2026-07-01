/* =====================================================================
 * Kudbee Contra — engine/loop.js
 * Thin shim over the shared fixed-timestep loop
 * (games/shared/engine/loop.js). The game keeps calling `KC.Loop`
 * unchanged; the implementation lives in one shared place now.
 * The shared script must load before this one.
 * ===================================================================== */
(function (KC, E) {
  'use strict';
  KC.Loop = E.Loop;
})(window.KC = window.KC || {}, window.KudbeeEngine = window.KudbeeEngine || {});
