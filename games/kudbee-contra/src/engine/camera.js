/* =====================================================================
 * Kudbee Contra — engine/camera.js
 * Cinematic 2D camera: smooth follow with a look-ahead deadzone, trauma
 * based screen shake, and dynamic zoom (used for the mini-boss reveal).
 * The camera exposes its world->screen transform so layers can apply
 * parallax relative to camera.x.
 * ===================================================================== */
(function (KC) {
  'use strict';
  const Util = KC.Util;

  function Camera(viewW, viewH) {
    this.viewW = viewW;
    this.viewH = viewH;
    this.x = 0;            // world-space left edge
    this.y = 0;
    this.zoom = 1;
    this.targetZoom = 1;

    this.minX = 0;
    this.maxX = Infinity;  // set per level

    // Trauma-based shake (Squirrel Eiserloh style): shake = trauma^2.
    this.trauma = 0;
    this._shakeX = 0;
    this._shakeY = 0;
    this._t = 0;
  }

  Camera.prototype.setBounds = function (minX, maxX) {
    this.minX = minX;
    this.maxX = maxX;
  };

  /* Add a shake impulse (0..1). Stacks but is capped at 1. */
  Camera.prototype.shake = function (amount) {
    this.trauma = Util.clamp(this.trauma + amount, 0, 1);
  };

  Camera.prototype.zoomTo = function (z) {
    this.targetZoom = z;
  };

  /* Follow a target point (usually the player center) with look-ahead. */
  Camera.prototype.follow = function (tx, ty, faceDir, dt) {
    // Aim slightly ahead of the player in their facing direction.
    const lookAhead = 90 * (faceDir || 0);
    const desiredX = tx + lookAhead - this.viewW / 2;
    const desiredY = ty - this.viewH * 0.55;

    // Smooth, frame-rate independent easing.
    const ease = 1 - Math.pow(0.0008, dt);
    this.x = Util.lerp(this.x, desiredX, ease);
    this.y = Util.lerp(this.y, desiredY, ease * 0.6);

    this.x = Util.clamp(this.x, this.minX, this.maxX - this.viewW);
    if (this.y > 0) this.y = 0;            // don't pan below ground baseline
    if (this.y < -200) this.y = -200;

    this.zoom = Util.lerp(this.zoom, this.targetZoom, 1 - Math.pow(0.01, dt));

    // Decay trauma; compute shake offset.
    this._t += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.2);
    const shake = this.trauma * this.trauma;
    const mag = 26 * shake;
    this._shakeX = (Math.sin(this._t * 53.0) + Math.sin(this._t * 31.0)) * 0.5 * mag;
    this._shakeY = (Math.sin(this._t * 47.0) + Math.cos(this._t * 41.0)) * 0.5 * mag;
  };

  /* Apply the camera transform to a context (call inside save/restore). */
  Camera.prototype.apply = function (ctx) {
    const cx = this.viewW / 2;
    const cy = this.viewH / 2;
    ctx.translate(cx, cy);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-cx, -cy);
    ctx.translate(-this.x + this._shakeX, -this.y + this._shakeY);
  };

  /* Screen-space offset for a layer at the given parallax factor (0..1). */
  Camera.prototype.parallaxX = function (factor) {
    return -(this.x * factor) + this._shakeX * factor;
  };
  Camera.prototype.parallaxY = function (factor) {
    return -(this.y * factor) + this._shakeY * factor;
  };

  KC.Camera = Camera;
})(window.KC = window.KC || {});
