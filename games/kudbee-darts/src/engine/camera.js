/* =====================================================================
 * Kudbee Darts — engine/camera.js
 * 2D camera providing trauma-based screen shake and dynamic zoom. In darts
 * the board is static, so we don't use follow(); instead we hold the camera
 * centered and use shake() on impacts + punchZoom() for big-hit slow-mo.
 * ===================================================================== */
(function (KD) {
  'use strict';
  const Util = KD.Util;

  function Camera(viewW, viewH) {
    this.viewW = viewW;
    this.viewH = viewH;
    this.x = 0;
    this.y = 0;
    this.zoom = 1;
    this.targetZoom = 1;
    this.focusX = viewW / 2;
    this.focusY = viewH / 2;

    // Trauma-based shake (Squirrel Eiserloh style): shake = trauma^2.
    this.trauma = 0;
    this._shakeX = 0;
    this._shakeY = 0;
    this._t = 0;
  }

  /* Add a shake impulse (0..1). Stacks but is capped at 1. */
  Camera.prototype.shake = function (amount) {
    this.trauma = Util.clamp(this.trauma + amount, 0, 1);
  };

  Camera.prototype.zoomTo = function (z) {
    this.targetZoom = z;
  };

  /* Punch the zoom toward a focus point (a big hit) then let it ease back. */
  Camera.prototype.punchZoom = function (z, fx, fy) {
    this.targetZoom = z;
    if (fx != null) this.focusX = fx;
    if (fy != null) this.focusY = fy;
  };

  Camera.prototype.update = function (dt) {
    this.zoom = Util.lerp(this.zoom, this.targetZoom, 1 - Math.pow(0.01, dt));
    // Ease the focus back to the screen center as zoom relaxes.
    this.focusX = Util.lerp(this.focusX, this.viewW / 2, 1 - Math.pow(0.2, dt));
    this.focusY = Util.lerp(this.focusY, this.viewH / 2, 1 - Math.pow(0.2, dt));

    this._t += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    const shake = this.trauma * this.trauma;
    const mag = 22 * shake;
    this._shakeX = (Math.sin(this._t * 53.0) + Math.sin(this._t * 31.0)) * 0.5 * mag;
    this._shakeY = (Math.sin(this._t * 47.0) + Math.cos(this._t * 41.0)) * 0.5 * mag;
  };

  /* Apply the camera transform to a context (call inside save/restore). */
  Camera.prototype.apply = function (ctx) {
    ctx.translate(this.focusX, this.focusY);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.focusX, -this.focusY);
    ctx.translate(this._shakeX, this._shakeY);
  };

  KD.Camera = Camera;
})(window.KD = window.KD || {});
