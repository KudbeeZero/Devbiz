/* =====================================================================
 * Kudbee Birds — levels.js
 * Level data. `build(b)` places bodies with the KAB.Builder helpers
 * (ground is y=540). `theme.mood` grades the painted backdrop per level. Every level is verified headlessly by
 * eval/solve.mjs: it must (1) stand still on its own and (2) be solvable
 * by a search bot. `stars` = [2-star score, 3-star score].
 * ===================================================================== */

KAB.LEVELS = [
  {
    name: 'First Contact', hint: 'Drag the bird back, then let go.',
    birds: ['cyan', 'cyan', 'gold'], stars: [28000, 35000],
    theme: { sky: ['#0b1330', '#1d2a5c'], accent: '#39e6ff', skyline: '#14224a', mood: { tint: '#ffffff', a: 0 } },
    build(b) {
      b.col(610, [['wood', 40, 40], ['wood', 40, 40], ['wood', 40, 40], ['grunt']]);
      b.col(740, [['glass', 40, 40], ['wood', 40, 40], ['glass', 40, 40], ['wood', 40, 40], ['grunt']]);
      b.col(870, [['wood', 40, 40], ['wood', 40, 40], ['grunt']]);
    },
  },
  {
    name: 'Glass House', hint: 'Tap in flight: Dash boosts forward.',
    birds: ['cyan', 'gold', 'cyan'], stars: [21000, 26000],
    theme: { sky: ['#0d1b2a', '#123a4d'], accent: '#7CFFb2', skyline: '#10303f', mood: { tint: '#7fe8d0', a: 0.22, sat: 1.05 } },
    build(b) {
      b.col(500, [['stone', 26, 92]]);
      b.col(600, [['glass', 16, 70], ['glass', 16, 70]]);
      b.col(740, [['glass', 16, 70], ['glass', 16, 70]]);
      b.beam('wood', 670, 400, 190, 18);
      b.enemy('grunt', 670, 524);
      b.enemyOn('grunt', 670, 382);
      b.col(850, [['wood', 36, 50], ['grunt']]);
    },
  },
  {
    name: 'Split Decision', hint: 'Green splits in three with a tap.',
    birds: ['green', 'cyan', 'green', 'gold'], stars: [37000, 47000],
    theme: { sky: ['#1a1038', '#3a1a5c'], accent: '#c46bff', skyline: '#2a1650', mood: { tint: '#b08aff', a: 0.30, glow: '#ff9ad0', gx: 760 } },
    build(b) {
      b.col(520, [['stone', 30, 100]]);
      b.enemy('grunt', 566, 525);
      b.col(620, [['wood', 40, 50], ['glass', 34, 34], ['grunt']]);
      b.col(720, [['wood', 40, 80], ['grunt']]);
      b.col(820, [['wood', 40, 110], ['glass', 34, 34], ['armor']]);
      b.col(915, [['wood', 36, 40], ['grunt']]);
    },
  },
  {
    name: 'Stone Keep', hint: 'Gold slams straight down. Crack the roof.',
    birds: ['gold', 'cyan', 'green', 'gold'], stars: [34000, 43000],
    theme: { sky: ['#1c1220', '#4a1f3a'], accent: '#ff7ab8', skyline: '#341530', mood: { tint: '#ff9ac0', a: 0.28, glow: '#ffb070', gx: 720 } },
    build(b) {
      b.col(580, [['stone', 26, 70], ['stone', 26, 70]]);
      b.col(740, [['stone', 26, 70], ['stone', 26, 70]]);
      b.beam('stone', 660, 400, 200, 22);
      b.enemy('armor', 660, 522);
      b.col(620, [['wood', 24, 50], ['grunt']], 378);
      b.enemyOn('grunt', 710, 378);
      b.col(850, [['wood', 36, 40], ['armor']]);
      b.col(925, [['wood', 30, 30], ['grunt']]);
    },
  },
  {
    name: 'Powder Keg', hint: 'Pop the TNT. Chain reactions score big.',
    birds: ['cyan', 'green', 'gold', 'cyan'], stars: [28000, 36000],
    theme: { sky: ['#220f0f', '#55201a'], accent: '#ff5d3c', skyline: '#3a1612', mood: { tint: '#ff8a50', a: 0.34, glow: '#ff5d3c', gx: 700, bright: 0.95 } },
    build(b) {
      b.col(500, [['wood', 28, 70], ['grunt']]);
      b.col(640, [['wood', 20, 60], ['wood', 20, 60]]);
      b.col(740, [['wood', 20, 60], ['wood', 20, 60]]);
      b.beam('wood', 690, 420, 130, 16);
      b.tnt(690, 523, 34);
      b.col(690, [['tnt', 30], ['grunt']], 404);
      b.col(890, [['stone', 40, 60], ['grunt']]);
      b.enemy('armor', 570, 521);
    },
  },
  {
    name: 'Bridge Gap', hint: 'Mix birds. Break a pillar, drop the bridge.',
    birds: ['cyan', 'green', 'cyan', 'gold', 'cyan'], stars: [39000, 49000],
    theme: { sky: ['#0a1f1a', '#14463a'], accent: '#7CFFb2', skyline: '#0f3128', mood: { tint: '#9dffc2', a: 0.24, sat: 1.1 } },
    build(b) {
      b.col(560, [['stone', 40, 90], ['stone', 40, 90]]);
      b.col(800, [['stone', 40, 90], ['stone', 40, 90]]);
      b.beam('wood', 680, 360, 290, 20);
      b.enemyOn('grunt', 620, 340);
      b.enemyOn('armor', 740, 340);
      b.col(680, [['glass', 24, 40], ['tnt', 34]], 540);
      b.enemy('grunt', 620, 525);
      b.col(900, [['stone', 40, 50], ['wood', 40, 50], ['armor']]);
      b.col(848, [['wood', 28, 40], ['grunt']]);
    },
  },
  {
    name: 'Twin Towers', hint: 'Topple one, crush the other.',
    birds: ['green', 'gold', 'cyan', 'cyan', 'green'], stars: [46000, 58000],
    theme: { sky: ['#101030', '#2a2a6c'], accent: '#6f5bff', skyline: '#1c1c52', mood: { tint: '#6a6aff', a: 0.42, glow: '#8a7bff', gx: 600, bright: 0.85 } },
    build(b) {
      b.col(500, [['wood', 40, 40], ['wood', 40, 40], ['grunt']]);
      b.col(610, [['stone', 60, 44], ['stone', 60, 44], ['wood', 50, 44], ['glass', 50, 44], ['wood', 50, 44], ['grunt']]);
      b.col(810, [['stone', 60, 44], ['stone', 60, 44], ['glass', 50, 44], ['wood', 50, 44], ['armor']]);
      b.tnt(710, 523, 34);
      b.enemy('grunt', 710, 490);
      b.col(920, [['wood', 30, 40], ['grunt']]);
    },
  },
  {
    name: 'Hive Sentinel', hint: 'The boss is armored. Use the TNT.',
    birds: ['gold', 'green', 'cyan', 'gold', 'green', 'cyan'], stars: [55000, 69000],
    theme: { sky: ['#1d0a24', '#5a1040'], accent: '#ff3d7f', skyline: '#3a0c32', mood: { tint: '#7a1030', a: 0.55, glow: '#ff3d7f', gx: 700, bright: 0.7, night: true } },
    build(b) {
      b.col(700, [['stone', 240, 36], ['wood', 190, 28]]);
      b.col(650, [['stone', 24, 100]], 476);
      b.col(750, [['stone', 24, 100]], 476);
      b.enemyOn('boss', 700, 476);
      b.beam('wood', 700, 376, 150, 18);
      b.enemyOn('armor', 738, 358);
      b.enemyOn('grunt', 664, 358);
      b.tnt(552, 523, 34);
      b.tnt(852, 523, 34);
      b.col(498, [['wood', 36, 50], ['grunt']]);
      b.col(910, [['wood', 36, 50], ['armor']]);
    },
  },
  // ---- World 2: Frostpeak --------------------------------------------------
  {
    name: 'Snow Day', hint: 'Egg Bomb: tap to lay a bomb on the roof.',
    birds: ['egg', 'cyan', 'egg'], stars: [21000, 27000],
    theme: { world: 2, sky: ['#9bd7ff', '#e6f6ff'], accent: '#7fd0ff', skyline: '#b9c9e8', mood: { tint: '#ffffff', a: 0 } },
    build(b) {
      b.col(520, [['stone', 26, 90]]);
      b.enemy('grunt', 566, 525);
      b.col(640, [['glass', 24, 70], ['glass', 24, 70]]);
      b.col(760, [['glass', 24, 70], ['glass', 24, 70]]);
      b.beam('wood', 700, 400, 170, 14);
      b.tri('wood', 700, 386, 160, 52);
      b.enemy('grunt', 700, 524);
      b.col(870, [['wood', 40, 40], ['wood', 40, 40], ['grunt']]);
    },
  },
  {
    name: 'Boulder Run', hint: 'Knock the platform out. Boulders do the rest.',
    birds: ['cyan', 'gold', 'egg', 'cyan'], stars: [29000, 36000],
    theme: { world: 2, sky: ['#9bd7ff', '#e6f6ff'], accent: '#7fd0ff', skyline: '#b9c9e8', mood: { tint: '#ffd7a8', a: 0.18, glow: '#ffb070', gx: 760 } },
    build(b) {
      b.col(560, [['wood', 24, 110]]);
      b.col(780, [['wood', 24, 110]]);
      b.beam('wood', 670, 430, 260, 20);
      b.ball('stone', 620, 390, 20);
      b.ball('stone', 720, 390, 20);
      b.enemy('grunt', 640, 525);
      b.enemy('armor', 706, 523);
      b.col(880, [['wood', 40, 60], ['grunt']]);
    },
  },
  {
    name: 'Cart Crashers', hint: 'Wheels roll. Everything on the cart goes with it.',
    birds: ['cyan', 'green', 'egg', 'gold'], stars: [37000, 46000],
    theme: { world: 2, sky: ['#9bd7ff', '#e6f6ff'], accent: '#7fd0ff', skyline: '#b9c9e8', mood: { tint: '#b8d4ff', a: 0.22 } },
    build(b) {
      b.ball('wood', 640, 524, 16);
      b.ball('wood', 740, 524, 16);
      b.beam('wood', 690, 508, 160, 14);
      b.col(655, [['wood', 40, 40], ['grunt']], 494);
      b.col(730, [['tnt', 34], ['armor']], 494);
      b.col(860, [['stone', 40, 70], ['grunt']]);
      b.col(520, [['wood', 30, 70]]);
    },
  },
  {
    name: 'Ice Palace', hint: 'Crack the pillars. Roofs fall hard.',
    birds: ['egg', 'green', 'gold', 'egg', 'cyan'], stars: [44000, 55000],
    theme: { world: 2, sky: ['#9bd7ff', '#e6f6ff'], accent: '#7fd0ff', skyline: '#b9c9e8', mood: { tint: '#9fd8ff', a: 0.26, glow: '#d8f0ff', gx: 640 } },
    build(b) {
      b.col(560, [['glass', 30, 60], ['glass', 30, 60]]);
      b.col(680, [['glass', 30, 60], ['glass', 30, 60]]);
      b.col(800, [['glass', 30, 60], ['glass', 30, 60]]);
      b.beam('glass', 614, 420, 124, 14);
      b.beam('glass', 746, 420, 124, 14);
      b.tri('stone', 614, 406, 110, 46);
      b.tri('stone', 746, 406, 110, 46);
      b.enemy('grunt', 620, 525);
      b.enemy('armor', 740, 523);
      b.col(895, [['wood', 36, 40], ['grunt']]);
      b.col(490, [['stone', 24, 70], ['grunt']]);
    },
  },
  {
    name: 'TNT Valley', hint: 'Light the fuse. Let the crates do the work.',
    birds: ['cyan', 'egg', 'green', 'egg'], stars: [43000, 54000],
    theme: { world: 2, sky: ['#9bd7ff', '#e6f6ff'], accent: '#7fd0ff', skyline: '#b9c9e8', mood: { tint: '#ff9a7a', a: 0.3, glow: '#ff7a3c', gx: 700, bright: 0.95 } },
    build(b) {
      b.col(520, [['wood', 30, 50], ['grunt']]);
      b.tnt(600, 523, 34); b.tnt(636, 523, 34); b.tnt(672, 523, 34);
      b.beam('wood', 636, 506, 130, 14);
      b.enemyOn('grunt', 618, 492);
      b.enemyOn('armor', 662, 492);
      b.col(790, [['tnt', 34], ['wood', 70, 14], ['grunt']]);
      b.col(890, [['stone', 40, 60], ['armor']]);
    },
  },
  {
    name: 'Behind the Hill', hint: 'Lob it over, or lay an egg behind the rock.',
    birds: ['egg', 'green', 'gold', 'cyan', 'egg'], stars: [42000, 52000],
    theme: { world: 2, sky: ['#9bd7ff', '#e6f6ff'], accent: '#7fd0ff', skyline: '#b9c9e8', mood: { tint: '#c9b8ff', a: 0.3, glow: '#ffa0d0', gx: 700 } },
    build(b) {
      b.hill(600, 230, 120);
      b.enemyOn('grunt', 600, 420);
      b.enemy('grunt', 752, 525);
      b.col(820, [['wood', 40, 40], ['wood', 40, 40], ['grunt']]);
      b.col(900, [['stone', 40, 60], ['armor']]);
    },
  },
  {
    name: 'Twin Peaks', hint: 'Topple the big one onto the small ones.',
    birds: ['green', 'egg', 'gold', 'cyan', 'egg'], stars: [42000, 53000],
    theme: { world: 2, sky: ['#9bd7ff', '#e6f6ff'], accent: '#7fd0ff', skyline: '#b9c9e8', mood: { tint: '#6a8aff', a: 0.4, glow: '#8aa0ff', gx: 600, bright: 0.85 } },
    build(b) {
      b.col(560, [['wood', 40, 40], ['wood', 40, 40], ['grunt']]);
      b.col(700, [['stone', 70, 40], ['wood', 60, 40], ['glass', 50, 40], ['wood', 50, 40], ['tri', 'stone', 56, 40]]);
      b.col(830, [['stone', 40, 40], ['glass', 40, 40], ['wood', 40, 40], ['armor']]);
      b.tnt(765, 523, 34);
      b.enemy('grunt', 765, 490);
      b.col(915, [['wood', 30, 40], ['grunt']]);
    },
  },
  {
    name: 'Frost King', hint: 'The king sits on a throne of ice. Bring bombs.',
    birds: ['gold', 'egg', 'green', 'egg', 'cyan', 'gold', 'egg'], stars: [56000, 70000],
    theme: { world: 2, sky: ['#9bd7ff', '#e6f6ff'], accent: '#7fd0ff', skyline: '#b9c9e8', mood: { tint: '#4a1a7a', a: 0.52, glow: '#c97bff', gx: 700, bright: 0.72, night: true } },
    build(b) {
      b.col(720, [['stone', 250, 36], ['wood', 200, 26]]);
      b.col(660, [['glass', 24, 90]], 478);
      b.col(780, [['glass', 24, 90]], 478);
      b.enemyOn('king', 702, 478);
      b.col(748, [['tnt', 30]], 478);
      b.beam('wood', 720, 388, 170, 16);
      b.tri('stone', 720, 372, 150, 44);
      b.col(560, [['tnt', 34], ['grunt']]);
      b.tnt(868, 523, 34);
      b.col(500, [['wood', 36, 50], ['grunt']]);
      b.col(918, [['wood', 36, 50], ['armor']]);
    },
  },
  // ---- World 3: Nightmare ----------------------------------------------------
  {
    name: 'Gloomfall', hint: 'The ruins lean. Push them over.',
    birds: ['cyan', 'gold', 'egg', 'green', 'egg'], stars: [41000, 52000],
    theme: { world: 3, bg: 0, sky: ['#0d0614', '#3a1030'], accent: '#c46bff', skyline: '#1a0a28', mood: { tint: '#ffffff', a: 0 } },
    build(b) {
      b.hill(600, 190, 90);
      b.enemyOn('grunt', 600, 450);
      b.col(740, [['stone', 40, 60], ['wood', 40, 44], ['grunt']]);
      b.col(830, [['stone', 40, 60], ['stone', 40, 60], ['wood', 40, 44], ['armor']]);
      b.col(915, [['ball', 'stone', 22], ['wood', 36, 40], ['armor']]);
      b.enemy('grunt', 460, 525);
    },
  },
  {
    name: 'Blood Moon Keep', hint: 'The keep sits high. Lob it, or bomb the gate.',
    birds: ['egg', 'gold', 'green', 'cyan', 'egg', 'gold'], stars: [60000, 76000],
    theme: { world: 3, bg: 1, sky: ['#0d0614', '#3a1030'], accent: '#ff4d6d', skyline: '#1a0a28', mood: { tint: '#ffffff', a: 0 } },
    build(b) {
      b.hill(770, 360, 110);
      b.enemyOn('boss', 750, 430);
      b.col(818, [['stone', 40, 40], ['wood', 40, 36], ['armor']], 430);
      b.col(520, [['wood', 40, 50], ['grunt']]);
      b.col(565, [['stone', 36, 60], ['grunt']]);
      b.enemy('grunt', 480, 525);
    },
  },
  {
    name: 'Eclipse Citadel', hint: 'Spires fall hard. Find the weak pillar.',
    birds: ['gold', 'egg', 'green', 'cyan', 'egg', 'gold'], stars: [41000, 53000],
    theme: { world: 3, bg: 2, sky: ['#0d0614', '#3a1030'], accent: '#ff3d3d', skyline: '#1a0a28', mood: { tint: '#ffffff', a: 0 } },
    build(b) {
      b.col(640, [['stone', 44, 70], ['wood', 44, 60], ['glass', 44, 46], ['wood', 44, 46]]);
      b.col(800, [['stone', 44, 70], ['wood', 44, 60], ['glass', 44, 46], ['wood', 44, 46]]);
      b.beam('stone', 720, 318, 230, 24);
      b.enemyOn('boss', 720, 294);
      b.col(720, [['tnt', 32], ['grunt']]);
      b.enemy('armor', 570, 520);
      b.col(900, [['wood', 36, 50], ['armor']]);
      b.col(500, [['wood', 36, 50], ['grunt']]);
    },
  },
  {
    name: 'Heart of the Nightmare', hint: 'The Nightmare King waits at the heart. End it.',
    birds: ['gold', 'egg', 'green', 'egg', 'cyan', 'gold', 'egg', 'green'], stars: [70000, 92000],
    theme: { world: 3, bg: 3, sky: ['#0d0614', '#3a1030'], accent: '#ff2d55', skyline: '#1a0a28', mood: { tint: '#ffffff', a: 0 } },
    build(b) {
      b.col(720, [['stone', 250, 36], ['wood', 200, 26]]);
      b.col(660, [['glass', 24, 90]], 478);
      b.col(780, [['glass', 24, 90]], 478);
      b.enemyOn('king', 702, 478);
      b.col(748, [['tnt', 30]], 478);
      b.beam('stone', 720, 388, 170, 16);
      b.enemyOn('boss', 720, 372);
      b.col(560, [['tnt', 34], ['armor']]);
      b.tnt(868, 523, 34);
      b.col(500, [['wood', 36, 50], ['grunt']]);
      b.col(918, [['wood', 36, 50], ['armor']]);
    },
  },
];
