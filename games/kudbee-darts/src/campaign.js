/* =====================================================================
 * Kudbee Darts — campaign.js
 * Darts Birds: a level campaign in worlds, Angry Birds style. Each world
 * is five levels and the fifth is a BOSS. A level is a 301 or 501 leg
 * against a named AI rival. Stars are earned by the darts you throw on
 * the winning leg: 1 star for a win, 2 within par+6, 3 within par. Pure
 * data plus the star rule, so it can be unit-checked without a browser.
 * ===================================================================== */
(function (KD) {
  'use strict';

  const WORLDS = [
    { name: 'DART DAWN',      sub: 'Rookie rivals',   sky: 'dawn' },
    { name: 'NEON NOON',      sub: 'Pro rivals',      sky: 'noon' },
    { name: 'MIDNIGHT MARKS', sub: 'Legend rivals',   sky: 'night' },
    { name: 'THINK BOX',      sub: 'Crates in the way · opens after World 1', sky: 'box' },
  ];

  // sigma = the rival's scatter in board-radius units (smaller is tighter;
  // the league's Rookie is 0.13, Pro 0.07, Legend 0.03), so difficulty ramps
  // level by level instead of jumping with the tier. par = darts on the
  // winning leg for 3 stars; 2 stars allow par + 6. Both are tuned with
  // eval/calibrate.mjs.
  const LEVELS = [
    { world: 0, name: 'Spark',       mode: 'x301', tier: 'Rookie', skin: 'cyan',   sigma: 0.15,  par: 22 },
    { world: 0, name: 'Vex',         mode: 'x301', tier: 'Rookie', skin: 'green',  sigma: 0.14,  par: 21 },
    { world: 0, name: 'Spark II',    mode: 'x301', tier: 'Rookie', skin: 'cyan',   sigma: 0.13,  par: 21 },
    { world: 0, name: 'Vex II',      mode: 'x301', tier: 'Rookie', skin: 'green',  sigma: 0.125, par: 20 },
    { world: 0, name: 'THE WARDEN',  mode: 'x301', tier: 'Pro',    skin: 'ember',  sigma: 0.14,  par: 20, boss: true },
    { world: 1, name: 'Nova',        mode: 'x01',  tier: 'Pro',    skin: 'green',  sigma: 0.15,  par: 30 },
    { world: 1, name: 'Quill',       mode: 'x01',  tier: 'Pro',    skin: 'violet', sigma: 0.14,  par: 29 },
    { world: 1, name: 'Mirage',      mode: 'x01',  tier: 'Pro',    skin: 'violet', sigma: 0.135, par: 28 },
    { world: 1, name: 'Nova II',     mode: 'x301', tier: 'Pro',    skin: 'green',  sigma: 0.13,  par: 18 },
    { world: 1, name: 'THE ORACLE',  mode: 'x01',  tier: 'Pro',    skin: 'gold',   sigma: 0.12,  par: 30, boss: true },
    { world: 2, name: 'Zenith',      mode: 'x01',  tier: 'Legend', skin: 'gold',   sigma: 0.15,  par: 27 },
    { world: 2, name: 'Apex',        mode: 'x01',  tier: 'Legend', skin: 'ember',  sigma: 0.14,  par: 26 },
    { world: 2, name: 'Zenith II',   mode: 'x301', tier: 'Legend', skin: 'gold',   sigma: 0.13,  par: 17 },
    { world: 2, name: 'Apex II',     mode: 'x301', tier: 'Legend', skin: 'ember',  sigma: 0.125, par: 17 },
    { world: 2, name: 'THE EMPEROR', mode: 'x01',  tier: 'Legend', skin: 'violet', sigma: 0.115, par: 27, boss: true },
    // THINK BOX: a side world that opens once the World 1 boss has a star.
    // Wooden crates stand just in front of the board; a dart that meets one
    // sticks in the wood and scores nothing, so you plan around them. Boxes
    // are in board radii from the bull (x right, y down); slide = side-to-side
    // amplitude (radii) and speed (rad/s).
    { world: 3, name: 'CRATE ROW',   mode: 'x301', tier: 'Rookie', skin: 'cyan',   sigma: 0.14,  par: 21, after: 4,
      boxes: [{ x: -0.32, y: -1.12, w: 0.64, h: 0.52 }] },
    { world: 3, name: 'SHUTTER',     mode: 'x301', tier: 'Rookie', skin: 'green',  sigma: 0.135, par: 22,
      boxes: [{ x: -0.3, y: -0.3, w: 0.6, h: 0.6, slide: { amp: 0.75, w: 1.3 } }] },
    { world: 3, name: 'TWO WINDOWS', mode: 'x01',  tier: 'Pro',    skin: 'violet', sigma: 0.14,  par: 30,
      boxes: [{ x: -1.12, y: -0.55, w: 0.62, h: 1.1 }, { x: 0.5, y: -0.55, w: 0.62, h: 1.1 }] },
    { world: 3, name: 'CRISS-CROSS', mode: 'x01',  tier: 'Pro',    skin: 'gold',   sigma: 0.135, par: 31,
      boxes: [{ x: -0.3, y: -0.98, w: 0.6, h: 0.5, slide: { amp: 0.6, w: 1.2 } },
              { x: -0.3, y: 0.48, w: 0.6, h: 0.5, slide: { amp: 0.6, w: 1.2, p: Math.PI } }] },
    { world: 3, name: 'THE BIG BOX', mode: 'x01',  tier: 'Pro',    skin: 'ember',  sigma: 0.125, par: 31, boss: true,
      boxes: [{ x: -1.12, y: -1.12, w: 0.86, h: 0.74 }, { x: 0.26, y: -1.12, w: 0.86, h: 0.74 },
              { x: -0.26, y: 0.3, w: 0.52, h: 0.5, slide: { amp: 0.62, w: 1.6 } }] },
  ];

  // Stars for a WON leg thrown in `darts` darts. A loss is always 0.
  function starsFor(level, darts) {
    if (darts <= level.par) return 3;
    if (darts <= level.par + 6) return 2;
    return 1;
  }

  // Levels in a world, as [firstIndex, count].
  function worldRange(w) {
    let first = -1, count = 0;
    LEVELS.forEach((l, i) => { if (l.world === w) { if (first < 0) first = i; count++; } });
    return { first: first, count: count };
  }

  // The level whose star opens level i (-1 for the first level). A side
  // world's first level names it with `after`; everything else follows on.
  function opener(i) {
    const L = LEVELS[i];
    return L.after != null ? L.after : i - 1;
  }

  // The level NEXT LEVEL leads to from i: never into a side world.
  function nextOf(i) {
    const n = i + 1;
    return n < LEVELS.length && LEVELS[n].after == null ? n : null;
  }

  KD.Campaign = { WORLDS: WORLDS, LEVELS: LEVELS, starsFor: starsFor, worldRange: worldRange, opener: opener, nextOf: nextOf };
})(window.KD = window.KD || {});
