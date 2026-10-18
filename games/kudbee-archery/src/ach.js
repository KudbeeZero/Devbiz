/* =====================================================================
 * Kudbee Archery — ach.js
 * TROPHIES: lifetime goals read straight off the saved stats (arrows, golds,
 * X's, streaks, ROBIN HOODs, bosses, stars, duels, balloons, the daily...).
 * A trophy unlocks the moment its number is reached, with a card on screen;
 * D.ach keeps the ones already announced. Badges only — no stat changes.
 * ===================================================================== */

KAR.bossesBeaten = D => KAR.TOUR.reduce((n, L, i) => n + (L.boss && D.tour.stars[i] > 0 ? 1 : 0), 0);
KAR.tourStars = D => D.tour.stars.reduce((a, b) => a + b, 0);

// val(D) -> progress; n -> the goal
KAR.ACH = [
  { id: 'arrow1',   name: 'FIRST ARROW',     text: 'loose your first arrow',              n: 1,    val: D => D.stats.arrows },
  { id: 'arrow500', name: 'QUIVER RUNNER',   text: 'shoot 500 arrows',                    n: 500,  val: D => D.stats.arrows },
  { id: 'arrow2k',  name: 'IRON ARM',        text: 'shoot 2,000 arrows',                  n: 2000, val: D => D.stats.arrows },
  { id: 'ten1',     name: 'FIRST GOLD',      text: 'hit a ten',                           n: 1,    val: D => D.stats.tens },
  { id: 'ten100',   name: 'GOLDSMITH',       text: 'hit 100 tens',                        n: 100,  val: D => D.stats.tens },
  { id: 'x1',       name: 'DEAD CENTRE',     text: 'hit an X',                            n: 1,    val: D => D.stats.xs },
  { id: 'x25',      name: 'X MARKS THE SPOT', text: 'hit 25 X’s',                    n: 25,   val: D => D.stats.xs },
  { id: 'streak3',  name: 'HOT HAND',        text: '3 golds (9+) in a row',               n: 3,    val: D => D.stats.bestStreak },
  { id: 'streak8',  name: 'ON FIRE',         text: '8 golds in a row',                    n: 8,    val: D => D.stats.bestStreak },
  { id: 'robin1',   name: 'ROBIN HOOD',      text: 'split an arrow',                      n: 1,    val: D => D.stats.robins },
  { id: 'robin3',   name: 'MERRY MEN',       text: 'split 3 arrows',                      n: 3,    val: D => D.stats.robins },
  { id: 'boss1',    name: 'BOSS DOWN',       text: 'beat a world boss',                   n: 1,    val: D => KAR.bossesBeaten(D) },
  { id: 'boss5',    name: 'TOUR CHAMPION',   text: 'beat every world boss',               n: 5,    val: D => KAR.bossesBeaten(D) },
  { id: 'stars45',  name: 'STAR COLLECTOR',  text: '45 stars on the tour',                n: 45,   val: D => KAR.tourStars(D) },
  { id: 'stars90',  name: 'PERFECT TOUR',    text: 'all 90 tour stars',                   n: 90,   val: D => KAR.tourStars(D) },
  { id: 'long70',   name: 'LONG SHOT',       text: '3 stars on the 70 m range',           n: 3,    val: D => D.stars[3] },
  { id: 'duel1',    name: 'DUELLIST',        text: 'win a duel',                          n: 1,    val: D => D.stats.wins },
  { id: 'duel10',   name: 'DUEL MASTER',     text: 'win 10 duels',                        n: 10,   val: D => D.stats.wins },
  { id: 'legend',   name: 'LEGEND SLAYER',   text: 'beat the LEGEND CPU',                 n: 1,    val: D => D.stats.legendWins },
  { id: 'pop100',   name: 'BALLOON BUSTER',  text: 'pop 100 balloons',                    n: 100,  val: D => D.stats.pops },
  { id: 'pop2k',    name: 'POP STAR',        text: 'score 2,000 in BALLOON POP',          n: 2000, val: D => D.trickBest || 0 },
  { id: 'swing90',  name: 'PENDULUM PRO',    text: 'score 90 on the SWINGER',             n: 90,   val: D => D.swingBest || 0 },
  { id: 'daily7',   name: 'REGULAR',         text: 'play 7 dailies',                      n: 7,    val: D => D.stats.dailies },
  { id: 'starbox',  name: 'BOX BREAKER',     text: 'smash a STAR BOX',                    n: 1,    val: D => D.stats.starBoxes },
];

// Which trophies are unlocked (announced or not yet): progress has reached the goal.
KAR.achDone = (a, D) => (a.val(D) || 0) >= a.n;
KAR.achCount = D => KAR.ACH.filter(a => KAR.achDone(a, D)).length;
// Mark newly reached trophies as announced and return them. Unknown ids in a save are dropped.
KAR.achNew = D => {
  if (!D.ach || typeof D.ach !== 'object' || Array.isArray(D.ach)) D.ach = {};
  for (const k in D.ach) if (!KAR.ACH.some(a => a.id === k)) delete D.ach[k];
  const out = [];
  for (const a of KAR.ACH) if (!D.ach[a.id] && KAR.achDone(a, D)) { D.ach[a.id] = 1; out.push(a); }
  return out;
};
