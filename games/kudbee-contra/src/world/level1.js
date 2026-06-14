/* =====================================================================
 * Kudbee Contra — world/level1.js
 * Level 1: "Neon Jungle Outpost".
 * Pure data describing the playable gameplay layer: solid platforms, the
 * enemy spawn table, pickups, decorative props, and the boss-arena trigger.
 * The renderer/physics in game.js consume this; adding Levels 2-5 means
 * adding sibling files with the same shape.
 *
 * Coordinate space: world pixels. y grows downward. groundY is the top of
 * the solid floor. The level scrolls left -> right to `width`.
 * ===================================================================== */
(function (KC) {
  'use strict';

  const GROUND_Y = 560;
  const WIDTH = 6400;

  const Level1 = {
    id: 'neon-jungle-outpost',
    name: 'Neon Jungle Outpost',
    width: WIDTH,
    groundY: GROUND_Y,
    playerStart: { x: 80, y: GROUND_Y - 60 },

    // Solid platforms the player and enemies stand on (x, y(top), w, h).
    // A full-width floor plus raised ledges for verticality.
    platforms: [
      { x: 0, y: GROUND_Y, w: WIDTH, h: 200 },     // ground floor
      { x: 520, y: 470, w: 160, h: 20 },
      { x: 760, y: 400, w: 140, h: 20 },
      { x: 1040, y: 360, w: 180, h: 20 },
      { x: 1360, y: 460, w: 200, h: 20 },
      { x: 1720, y: 410, w: 120, h: 20 },
      { x: 1900, y: 330, w: 160, h: 20 },
      { x: 2280, y: 470, w: 220, h: 20 },
      { x: 2640, y: 400, w: 140, h: 20 },
      { x: 2900, y: 470, w: 160, h: 20 },
      { x: 3260, y: 380, w: 200, h: 20 },
      { x: 3640, y: 450, w: 160, h: 20 },
      { x: 3980, y: 360, w: 180, h: 20 },
      { x: 4360, y: 470, w: 200, h: 20 },
      { x: 4720, y: 400, w: 160, h: 20 },
      { x: 5060, y: 440, w: 180, h: 20 },
      // boss arena floor is the ground; raised side ledges:
      { x: 5760, y: 430, w: 120, h: 20 },
      { x: 6160, y: 430, w: 120, h: 20 },
    ],

    // Enemy spawn table. `trigger` = camera-right-edge x at which to spawn.
    // type: drone | soldier | turret. Boss handled separately.
    spawns: [
      { type: 'soldier', x: 640, y: GROUND_Y - 44, trigger: 300 },
      { type: 'drone', x: 880, y: 300, trigger: 520 },
      { type: 'soldier', x: 1120, y: 360 - 44, trigger: 760 },
      { type: 'turret', x: 1420, y: 460 - 40, trigger: 1100 },
      { type: 'drone', x: 1700, y: 260, trigger: 1300 },
      { type: 'drone', x: 1980, y: 230, trigger: 1500 },
      { type: 'soldier', x: 2340, y: 470 - 44, trigger: 1900 },
      { type: 'soldier', x: 2520, y: GROUND_Y - 44, trigger: 2050 },
      { type: 'turret', x: 2700, y: 400 - 40, trigger: 2300 },
      { type: 'drone', x: 3000, y: 300, trigger: 2600 },
      { type: 'soldier', x: 3320, y: 380 - 44, trigger: 2900 },
      { type: 'drone', x: 3700, y: 280, trigger: 3300 },
      { type: 'turret', x: 4040, y: 360 - 40, trigger: 3600 },
      { type: 'soldier', x: 4420, y: 470 - 44, trigger: 4000 },
      { type: 'drone', x: 4780, y: 300, trigger: 4300 },
      { type: 'soldier', x: 5120, y: 440 - 44, trigger: 4700 },
      { type: 'drone', x: 5300, y: 260, trigger: 4900 },
    ],

    pickups: [
      { kind: 'spread', x: 1080, y: 320 },
      { kind: 'health', x: 2360, y: 430 },
      { kind: 'plasma', x: 3300, y: 340 },
      { kind: 'health', x: 4400, y: 430 },
      { kind: 'laser', x: 5100, y: 400 },
      { kind: 'spread', x: 2900, y: 430 },
    ],

    // Decorative glowing plants / consoles (purely visual, drawn in gameplay layer).
    props: [
      { type: 'plant', x: 300, y: GROUND_Y },
      { type: 'console', x: 1300, y: GROUND_Y },
      { type: 'plant', x: 2100, y: GROUND_Y },
      { type: 'plant', x: 3500, y: GROUND_Y },
      { type: 'console', x: 4600, y: GROUND_Y },
      { type: 'plant', x: 5400, y: GROUND_Y },
    ],

    // When the camera's right edge passes this x, lock the arena and reveal boss.
    bossArena: {
      triggerX: 5600,
      lockMinX: 5600,
      lockMaxX: WIDTH,
      bossSpawn: { x: 6100, y: GROUND_Y - 110 },
    },

    music: 'level',           // intensity preset key for engine/audio
    parallaxSeed: 1337,
  };

  KC.Levels = KC.Levels || {};
  KC.Levels.level1 = Level1;
})(window.KC = window.KC || {});
