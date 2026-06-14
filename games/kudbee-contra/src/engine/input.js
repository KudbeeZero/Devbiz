/* =====================================================================
 * Kudbee Contra — engine/input.js
 * Unified input layer that merges keyboard, the Gamepad API, and on-screen
 * touch buttons into a single logical action set the game reads each frame:
 *   left, right, up, down, jump, fire, grenade, slide, start, pause
 *
 * Source handling:
 *   - Keyboard + touch are EVENT driven and held in `_held` (set on down,
 *     cleared on up).
 *   - Gamepad has no release events, so it is POLLED fresh into `_pad` every
 *     frame and OR-combined with `_held` at commit time.
 * Edge helpers (justPressed/justReleased) make menu + jump handling clean.
 * ===================================================================== */
(function (KC) {
  'use strict';

  const ACTIONS = ['left', 'right', 'up', 'down', 'jump', 'fire', 'grenade', 'slide', 'special', 'start', 'pause'];

  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    Space: 'jump', KeyJ: 'jump',
    KeyK: 'fire', KeyX: 'fire',
    KeyL: 'grenade', KeyC: 'grenade',
    ShiftLeft: 'slide', ShiftRight: 'slide',
    KeyE: 'special', KeyQ: 'special',
    Enter: 'start',
    Escape: 'pause', KeyP: 'pause',
  };

  function blank() {
    const o = {};
    ACTIONS.forEach((a) => (o[a] = false));
    return o;
  }

  function Input(touchRoot) {
    this.state = blank();   // committed state this frame
    this.prev = blank();    // committed state last frame
    this._held = blank();   // keyboard + touch (event driven)
    this._pad = blank();    // gamepad (polled fresh each frame)

    this._touchRoot = touchRoot || null;
    this._bindKeyboard();
    if (this._touchRoot) this._bindTouch();
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
    // Release everything if the window loses focus.
    window.addEventListener('blur', () => { this._held = blank(); });
  };

  Input.prototype._bindTouch = function () {
    const buttons = this._touchRoot.querySelectorAll('[data-action]');
    buttons.forEach((btn) => {
      const action = btn.getAttribute('data-action');
      const on = (e) => { e.preventDefault(); this._held[action] = true; btn.classList.add('pressed'); };
      const off = (e) => { e.preventDefault(); this._held[action] = false; btn.classList.remove('pressed'); };
      btn.addEventListener('touchstart', on, { passive: false });
      btn.addEventListener('touchend', off, { passive: false });
      btn.addEventListener('touchcancel', off, { passive: false });
      // Mouse fallback so the touch UI is testable on desktop.
      btn.addEventListener('mousedown', on);
      btn.addEventListener('mouseup', off);
      btn.addEventListener('mouseleave', off);
    });
  };

  Input.prototype._pollGamepad = function () {
    const pad = blank();
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < pads.length; i++) {
      const gp = pads[i];
      if (!gp) continue;
      const ax = gp.axes[0] || 0;
      const ay = gp.axes[1] || 0;
      if (ax < -0.4) pad.left = true;
      if (ax > 0.4) pad.right = true;
      if (ay < -0.4) pad.up = true;
      if (ay > 0.4) pad.down = true;
      const b = gp.buttons;
      const on = (idx) => b[idx] && b[idx].pressed;
      // Standard mapping.
      if (on(12)) pad.up = true;
      if (on(13)) pad.down = true;
      if (on(14)) pad.left = true;
      if (on(15)) pad.right = true;
      if (on(0)) pad.jump = true;     // A
      if (on(2)) pad.fire = true;     // X
      if (on(1)) pad.grenade = true;  // B
      if (on(5)) pad.slide = true;    // RB
      if (on(3)) pad.special = true;  // Y
      if (on(7)) pad.special = true;  // RT
      if (on(9)) pad.start = true;    // Start
      if (on(8)) pad.pause = true;    // Select
    }
    this._pad = pad;
  };

  /* Call once at the very start of each update step. */
  Input.prototype.poll = function () {
    this.prev = this.state;
    this._pollGamepad();
    const next = blank();
    ACTIONS.forEach((a) => (next[a] = this._held[a] || this._pad[a]));
    this.state = next;
  };

  Input.prototype.down = function (a) { return !!this.state[a]; };
  Input.prototype.justPressed = function (a) { return this.state[a] && !this.prev[a]; };
  Input.prototype.justReleased = function (a) { return !this.state[a] && this.prev[a]; };

  Input.ACTIONS = ACTIONS;
  KC.Input = Input;
})(window.KC = window.KC || {});
