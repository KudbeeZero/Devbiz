/* =====================================================================
 * Kudbee Shared Engine — loop.js
 * Fixed-timestep game loop targeting 60 updates/second with a separate
 * render pass. Decoupling update from render keeps the simulation
 * deterministic regardless of the display refresh rate.
 *
 * Single source of truth for every Kudbee title. Games alias it via a
 * thin per-game shim (e.g. `KD.Loop = KudbeeEngine.Loop;`) so their own
 * code keeps calling `KD.Loop` / `KC.Loop` unchanged. Load this before
 * the game's own engine scripts.
 * ===================================================================== */
(function (E) {
  'use strict';

  const STEP = 1 / 60;        // fixed simulation step (seconds)
  const MAX_FRAME = 0.25;     // clamp huge gaps (tab was backgrounded)

  function Loop(update, render) {
    this.update = update;     // update(dt) — called at a fixed cadence
    this.render = render;     // render(alpha) — called once per rAF
    this.running = false;
    this.last = 0;
    this.acc = 0;
    this._raf = 0;

    // Rolling FPS measurement for the debug readout.
    this.fps = 60;
    this._fpsAcc = 0;
    this._fpsFrames = 0;

    this._tick = this._tick.bind(this);
  }

  Loop.prototype.start = function () {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.acc = 0;
    this._raf = requestAnimationFrame(this._tick);
  };

  Loop.prototype.stop = function () {
    this.running = false;
    cancelAnimationFrame(this._raf);
  };

  Loop.prototype._tick = function (now) {
    if (!this.running) return;
    this._raf = requestAnimationFrame(this._tick);

    let frame = (now - this.last) / 1000;
    this.last = now;
    if (frame > MAX_FRAME) frame = MAX_FRAME;
    this.acc += frame;

    // Consume accumulated time in fixed steps.
    let steps = 0;
    while (this.acc >= STEP && steps < 5) {
      this.update(STEP);
      this.acc -= STEP;
      steps++;
    }

    // Interpolation factor for smooth rendering between sim steps.
    const alpha = this.acc / STEP;
    this.render(alpha);

    // FPS sampling (updates ~4x/sec).
    this._fpsAcc += frame;
    this._fpsFrames++;
    if (this._fpsAcc >= 0.25) {
      this.fps = Math.round(this._fpsFrames / this._fpsAcc);
      this._fpsAcc = 0;
      this._fpsFrames = 0;
    }
  };

  Loop.STEP = STEP;
  E.Loop = Loop;
})(window.KudbeeEngine = window.KudbeeEngine || {});
