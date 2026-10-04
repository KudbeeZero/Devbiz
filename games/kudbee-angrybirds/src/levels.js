/* =====================================================================
 * Kudbee Birds — levels.js
 * Level data. `build(b)` places bodies with the KAB.Builder helpers
 * (ground is y=540). Every level is verified headlessly by
 * eval/solve.mjs: it must (1) stand still on its own and (2) be solvable
 * by a search bot. `stars` = [2-star score, 3-star score].
 * ===================================================================== */

KAB.LEVELS = [
  {
    name: 'First Contact', hint: 'Drag the bird back, then let go.',
    birds: ['cyan', 'cyan', 'gold'], stars: [28000, 35000],
    theme: { sky: ['#0b1330', '#1d2a5c'], accent: '#39e6ff', skyline: '#14224a' },
    build(b) {
      b.col(610, [['wood', 40, 40], ['wood', 40, 40], ['wood', 40, 40], ['grunt']]);
      b.col(740, [['glass', 40, 40], ['wood', 40, 40], ['glass', 40, 40], ['wood', 40, 40], ['grunt']]);
      b.col(870, [['wood', 40, 40], ['wood', 40, 40], ['grunt']]);
    },
  },
  {
    name: 'Glass House', hint: 'Tap in flight: Dash boosts forward.',
    birds: ['cyan', 'gold', 'cyan'], stars: [21000, 26000],
    theme: { sky: ['#0d1b2a', '#123a4d'], accent: '#7CFFb2', skyline: '#10303f' },
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
    theme: { sky: ['#1a1038', '#3a1a5c'], accent: '#c46bff', skyline: '#2a1650' },
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
    theme: { sky: ['#1c1220', '#4a1f3a'], accent: '#ff7ab8', skyline: '#341530' },
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
    theme: { sky: ['#220f0f', '#55201a'], accent: '#ff5d3c', skyline: '#3a1612' },
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
    theme: { sky: ['#0a1f1a', '#14463a'], accent: '#7CFFb2', skyline: '#0f3128' },
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
    theme: { sky: ['#101030', '#2a2a6c'], accent: '#6f5bff', skyline: '#1c1c52' },
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
    theme: { sky: ['#1d0a24', '#5a1040'], accent: '#ff3d7f', skyline: '#3a0c32' },
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
];
