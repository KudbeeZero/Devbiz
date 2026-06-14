/* =====================================================================
 * Kudbee Contra — entities/weapons.js
 * Data-driven weapon table. Adding Plasma Cannon / Laser / Missiles later
 * is just another entry here plus (optionally) a projectile render style.
 * ===================================================================== */
(function (KC) {
  'use strict';

  // cooldown = seconds between shots. pellets fire in a spread (radians).
  const WEAPONS = {
    pulse: {
      name: 'Pulse Rifle',
      cooldown: 0.16,
      speed: 720,
      damage: 1,
      pellets: 1,
      spread: 0,
      radius: 4,
      color: '#9fefff',
      style: 'bolt',
      sfx: 'shoot',
    },
    spread: {
      name: 'Spread Shot',
      cooldown: 0.28,
      speed: 640,
      damage: 1,
      pellets: 5,
      spread: 0.42,
      radius: 4,
      color: '#ffd34d',
      style: 'bolt',
      sfx: 'spread',
    },
  };

  // Display order for the HUD / future weapon-wheel.
  WEAPONS._order = ['pulse', 'spread'];

  KC.Weapons = WEAPONS;
})(window.KC = window.KC || {});
