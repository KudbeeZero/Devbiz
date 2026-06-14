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
    this.pointer = {
      down: false, justDown: false, justUp: false,
      x: 0, y: 0, startX: 0, startY: 0,
    };

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

  Input.prototype._bindPointer = function () {
    const c = this.canvas;
    const down = (cx, cy) => {
      const p = this._toLogical(cx, cy);
      this.pointer.down = true;
      this.pointer.justDown = true;
      this.pointer.startX = this.pointer.x = p.x;
      this.pointer.startY = this.pointer.y = p.y;
    };
    const move = (cx, cy) => {
      const p = this._toLogical(cx, cy);
      this.pointer.x = p.x;
      this.pointer.y = p.y;
    };
    const up = () => {
      if (this.pointer.down) this.pointer.justUp = true;
      this.pointer.down = false;
    };

    // Mouse.
    c.addEventListener('mousedown', (e) => { e.preventDefault(); down(e.clientX, e.clientY); });
    window.addEventListener('mousemove', (e) => move(e.clientX, e.clientY));
    window.addEventListener('mouseup', up);

    // Touch.
    c.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      down(t.clientX, t.clientY);
    }, { passive: false });
    c.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      move(t.clientX, t.clientY);
    }, { passive: false });
    c.addEventListener('touchend', (e) => { e.preventDefault(); up(); }, { passive: false });
    c.addEventListener('touchcancel', up, { passive: false });
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
