/* =====================================================================
 * Kudbee Archery — quest.js
 * DAILY QUESTS: three a day, picked from a pool by the UTC day (the same three
 * for everyone), counted from your own arrows in any mode. Each pays GEMS when
 * you CLAIM it, and claiming all three pays a bonus. Gems buy bows and arrows
 * (KAR.KIT in sim.js). In-game only - nothing is bought with money.
 * ===================================================================== */

// ev: the game event that counts; max: the event reports a level (a streak, a combo) instead of adding up
KAR.QUESTS = [
  { id: 'arrows', ev: 'arrow',  n: 20, gems: 10, text: 'shoot 20 arrows' },
  { id: 'golds',  ev: 'gold',   n: 10, gems: 15, text: 'hit 10 golds (9 or better)' },
  { id: 'tens',   ev: 'ten',    n: 5,  gems: 15, text: 'hit 5 tens' },
  { id: 'xs',     ev: 'x',      n: 2,  gems: 20, text: 'hit 2 X’s' },
  { id: 'streak', ev: 'streak', n: 3,  gems: 20, text: '3 golds in a row', max: true },
  { id: 'pops',   ev: 'pop',    n: 25, gems: 15, text: 'pop 25 balloons' },
  { id: 'combo',  ev: 'combo',  n: 3,  gems: 20, text: 'a ×3 combo in BALLOON POP', max: true },
  { id: 'level',  ev: 'level2', n: 1,  gems: 15, text: 'clear a level with 2+ stars' },
  { id: 'duel',   ev: 'duel',   n: 1,  gems: 20, text: 'win a duel' },
  { id: 'daily',  ev: 'daily',  n: 1,  gems: 10, text: 'play today’s DAILY' },
  { id: 'swing',  ev: 'swing',  n: 1,  gems: 20, text: 'score 60+ on the SWINGER' },
  { id: 'range',  ev: 'range',  n: 1,  gems: 15, text: 'score 100+ in a RANGE' },
];
KAR.QUEST_BONUS = 30;
KAR.questDef = id => KAR.QUESTS.find(q => q.id === id);

// the three quests for a day: seeded by the day number, one per kind of event
KAR.questPick = day => {
  let a = KAR.Daily.seed(day + 7919) | 0;
  const r = () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const out = [];
  for (let g = 0; out.length < 3 && g < 200; g++) { const q = KAR.QUESTS[Math.floor(r() * KAR.QUESTS.length)]; if (!out.some(o => o.ev === q.ev)) out.push(q); }
  return out.map(q => q.id);
};

// today's quests, rolled over (and repaired) on first use each day
KAR.questToday = (D, day) => {
  const today = day === undefined ? KAR.Daily.day() : day;
  let Q = D.quest;
  const ok = Q && Q.day === today && Array.isArray(Q.q) && Q.q.length === 3 && Q.q.every(x => x && KAR.questDef(x.id) && Number.isInteger(x.have) && x.have >= 0 && x.have <= KAR.questDef(x.id).n && typeof x.claimed === 'boolean') && typeof Q.bonus === 'boolean';
  if (!ok) Q = D.quest = { day: today, q: KAR.questPick(today).map(id => ({ id, have: 0, claimed: false })), bonus: false };
  return Q;
};
// count an event; returns the quests it just finished
KAR.questEvent = (D, ev, n, day) => {
  const Q = KAR.questToday(D, day), done = [];
  for (const x of Q.q) {
    const d = KAR.questDef(x.id);
    if (d.ev !== ev || x.have >= d.n) continue;
    x.have = Math.min(d.n, d.max ? Math.max(x.have, n | 0) : x.have + (n === undefined ? 1 : n | 0));
    if (x.have >= d.n) done.push(d);
  }
  return done;
};
// 'claimed' | 'notyet' | 'already'
KAR.questClaim = (D, i, day) => {
  const Q = KAR.questToday(D, day), x = Q.q[i], d = x && KAR.questDef(x.id);
  if (!x) return 'notyet';
  if (x.claimed) return 'already';
  if (x.have < d.n) return 'notyet';
  x.claimed = true; D.gems += d.gems;
  return 'claimed';
};
KAR.questBonusReady = (D, day) => { const Q = KAR.questToday(D, day); return !Q.bonus && Q.q.every(x => x.claimed); };
KAR.questBonus = (D, day) => { if (!KAR.questBonusReady(D, day)) return false; KAR.questToday(D, day).bonus = true; D.gems += KAR.QUEST_BONUS; return true; };
KAR.questClaimable = (D, day) => { const Q = KAR.questToday(D, day); return Q.q.some(x => !x.claimed && x.have >= KAR.questDef(x.id).n) || KAR.questBonusReady(D, day); };

// ---- gems for stars: every star you earn for the first time (a level or a range) pays STAR_GEMS ----
KAR.STAR_GEMS = 5;
KAR.starGems = (D, before, after) => { const n = Math.max(0, (after | 0) - (before | 0)) * KAR.STAR_GEMS; D.gems += n; return n; };

// ---- DAY STREAK: shoot on consecutive (UTC) days; day 3 pays 15 gems, day 7 (and every 7th) pays 40 ----
KAR.STREAK_GEMS = n => n % 7 === 0 ? 40 : n === 3 ? 15 : 0;
// the first arrow of a day: returns { n, gems } (gems already added), or null when today is already counted
KAR.playDay = (D, day) => {
  const today = day === undefined ? KAR.Daily.day() : day, S = D.streak;
  if (S.day === today) return null;
  S.n = S.day === today - 1 ? S.n + 1 : 1; S.day = today; S.best = Math.max(S.best, S.n);
  const gems = KAR.STREAK_GEMS(S.n); D.gems += gems;
  return { n: S.n, gems };
};
// the streak as it stands today (a missed day shows 0 until you shoot again)
KAR.streakNow = (D, day) => { const today = day === undefined ? KAR.Daily.day() : day, S = D.streak; return S.day === today || S.day === today - 1 ? S.n : 0; };

// ---- buying kit ----
KAR.kitOwned = (D, kind, i) => i === 0 || ((kind === 'bow' ? D.ownBow : D.ownArrow) >> i & 1) === 1;
// 'bought' | 'owned' | 'poor'
KAR.kitBuy = (D, kind, i) => {
  const it = KAR.KIT[kind][i];
  if (!it) return 'poor';
  if (KAR.kitOwned(D, kind, i)) return 'owned';
  if (D.gems < it.cost) return 'poor';
  D.gems -= it.cost;
  if (kind === 'bow') D.ownBow |= 1 << i; else D.ownArrow |= 1 << i;
  D.kit[kind] = i;
  return 'bought';
};
