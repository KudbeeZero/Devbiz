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

  KD.Campaign = { WORLDS: WORLDS, LEVELS: LEVELS, starsFor: starsFor, worldRange: worldRange };
})(window.KD = window.KD || {});
