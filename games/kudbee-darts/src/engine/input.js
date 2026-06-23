/* =====================================================================
 * Kudbee Darts — engine/input.js
 * Two input layers:
 *   1. Keyboard — menu navigation, confirm/back, pause, mute (edge-detected).
 *   2. Pointer  — unified mouse + touch drag, reported in LOGICAL canvas
 *      coordinates. The drag (down -> move -> up) drives the flick-throw and
 *      the live predictive reticle. `touch-action: none` on the canvas keeps
 *      the browser from stealing the gesture.
 *
 * Logical-coordinate mapping uses getBoundingClientRect so aim is accurate
 * no matter how the canvas is scaled (essential for mobile).
 * ===================================================================== */
(function (KD) {
  'use strict';

  const ACTIONS = ['left', 'right', 'up', 'down', 'confirm', 'back', 'pause'];

  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    Enter: 'confirm', Space: 'confirm',
    Escape: 'back', Backspace: 'back',
    KeyP: 'pause',
  };

  function blank() {
    const o = {};
    ACTIONS.forEach((a) => (o[a] = false));
    return o;
  }

  function Input(canvas) {
    this.canvas = canvas;
    this.state = blank();
    this.prev = blank();
    this._held = blank();

    // Pointer state (logical coords). `down` is the live press flag; `start`
    // is where the press began; `pos` is the current position; `justDown` /
    // `justUp` are single-frame edges consumed by the game each step.
    //
    // Swipe-throw extras: a short ring buffer of recent samples lets us read
    // the RELEASE velocity (direction + speed) and the total swipe vector at
    // the moment the finger lifts — the heart of the flick-throw. `pressure`
    // comes from Pointer Events when the device reports it (pen / 3D-touch);
    // on plain touch it stays ~0.5 and the throw leans on speed instead.
    this.pointer = {
      down: false, justDown: false, justUp: false,
      x: 0, y: 0, startX: 0, startY: 0,
      vx: 0, vy: 0, speed: 0, pressure: 0,
      // captured fresh on each release:
      relVX: 0, relVY: 0, relSpeed: 0, swipeX: 0, swipeY: 0, swipeLen: 0, downMs: 0,
    };
    this._samples = [];          // { x, y, t } recent move samples
    this._downT = 0;

    this._bindKeyboard();
    this._bindPointer();
  }

  Input.prototype._bindKeyboard = function () {
    window.addEventListener('keydown', (e) => {
      const action = KEYMAP[e.code];
      if (action) {
        this._held[action] = true;
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.code) !== -1) {
          e.preventDefault();
        }
      }
    });
    window.addEventListener('keyup', (e) => {
      const action = KEYMAP[e.code];
      if (action) this._held[action] = false;
    });
    window.addEventListener('blur', () => { this._held = blank(); });
  };

  // Convert a client point to logical canvas coordinates.
  Input.prototype._toLogical = function (clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - r.left) * (this.canvas.width / r.width),
      y: (clientY - r.top) * (this.canvas.height / r.height),
    };
  };

  // Estimate velocity (logical px/s) over the most recent ~70ms of samples.
  Input.prototype._releaseVel = function () {
    const s = this._samples;
    if (s.length < 2) return { vx: 0, vy: 0 };
    const last = s[s.length - 1];
    let i = s.length - 2;
    while (i > 0 && last.t - s[i].t < 0.070) i--;
    const a = s[i], dt = Math.max(0.001, last.t - a.t);
    return { vx: (last.x - a.x) / dt, vy: (last.y - a.y) / dt };
  };

  Input.prototype._bindPointer = function () {
    const c = this.canvas;
    const now = () => (window.performance ? performance.now() : Date.now()) / 1000;

    const down = (cx, cy, pressure) => {
      const p = this._toLogical(cx, cy);
      this.pointer.down = true;
      this.pointer.justDown = true;
      this.pointer.startX = this.pointer.x = p.x;
      this.pointer.startY = this.pointer.y = p.y;
      this.pointer.vx = this.pointer.vy = this.pointer.speed = 0;
      this.pointer.pressure = pressure || 0;
      this._downT = now();
      this._samples.length = 0;
      this._samples.push({ x: p.x, y: p.y, t: this._downT });
    };
    const move = (cx, cy, pressure) => {
      const p = this._toLogical(cx, cy);
      const t = now();
      // Live (smoothed) velocity for the aim guide.
      const prev = this._samples[this._samples.length - 1];
      if (prev) {
        const dt = Math.max(0.001, t - prev.t);
        this.pointer.vx = (p.x - prev.x) / dt;
        this.pointer.vy = (p.y - prev.y) / dt;
        this.pointer.speed = Math.sqrt(this.pointer.vx * this.pointer.vx + this.pointer.vy * this.pointer.vy);
      }
      this.pointer.x = p.x;
      this.pointer.y = p.y;
      if (pressure) this.pointer.pressure = pressure;
      this._samples.push({ x: p.x, y: p.y, t: t });
      if (this._samples.length > 16) this._samples.shift();
    };
    const up = () => {
      if (this.pointer.down) {
        this.pointer.justUp = true;
        const v = this._releaseVel();
        this.pointer.relVX = v.vx; this.pointer.relVY = v.vy;
        this.pointer.relSpeed = Math.sqrt(v.vx * v.vx + v.vy * v.vy);
        this.pointer.swipeX = this.pointer.x - this.pointer.startX;
        this.pointer.swipeY = this.pointer.y - this.pointer.startY;
        this.pointer.swipeLen = Math.sqrt(this.pointer.swipeX * this.pointer.swipeX + this.pointer.swipeY * this.pointer.swipeY);
        this.pointer.downMs = (now() - this._downT) * 1000;
      }
      this.pointer.down = false;
    };

    // Pointer Events unify mouse + touch + pen and expose `pressure`.
    if (window.PointerEvent) {
      c.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (c.setPointerCapture) { try { c.setPointerCapture(e.pointerId); } catch (_) {} }
        down(e.clientX, e.clientY, e.pressure);
      });
      c.addEventListener('pointermove', (e) => { e.preventDefault(); if (this.pointer.down) move(e.clientX, e.clientY, e.pressure); }, { passive: false });
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    } else {
      // Legacy fallback: mouse + touch.
      c.addEventListener('mousedown', (e) => { e.preventDefault(); down(e.clientX, e.clientY, 0); });
      window.addEventListener('mousemove', (e) => { if (this.pointer.down) move(e.clientX, e.clientY, 0); });
      window.addEventListener('mouseup', up);
      c.addEventListener('touchstart', (e) => { e.preventDefault(); const t = e.changedTouches[0]; down(t.clientX, t.clientY, t.force || 0); }, { passive: false });
      c.addEventListener('touchmove', (e) => { e.preventDefault(); const t = e.changedTouches[0]; move(t.clientX, t.clientY, t.force || 0); }, { passive: false });
      c.addEventListener('touchend', (e) => { e.preventDefault(); up(); }, { passive: false });
      c.addEventListener('touchcancel', up, { passive: false });
    }
  };

  /* Call once at the start of each update step. */
  Input.prototype.poll = function () {
    this.prev = this.state;
    const next = blank();
    ACTIONS.forEach((a) => (next[a] = this._held[a]));
    this.state = next;
  };

  /* Call at the END of each update step to clear single-frame pointer edges. */
  Input.prototype.endFrame = function () {
    this.pointer.justDown = false;
    this.pointer.justUp = false;
  };

  Input.prototype.down = function (a) { return !!this.state[a]; };
  Input.prototype.justPressed = function (a) { return this.state[a] && !this.prev[a]; };
  Input.prototype.justReleased = function (a) { return !this.state[a] && this.prev[a]; };

  Input.ACTIONS = ACTIONS;
  KD.Input = Input;
})(window.KD = window.KD || {});
