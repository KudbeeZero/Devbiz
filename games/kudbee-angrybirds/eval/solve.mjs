// Headless solvability search for Kudbee Birds levels.
//   node solve.mjs            -> all levels
//   node solve.mjs 3 5        -> only levels 3 and 5 (1-based)
// For each bird it snapshots the world, tries a grid of (angle, pull, ability
// timing), keeps the best shot, then re-verifies the winning line by replaying
// it from a fresh load (so the result is deterministic, not a clone artifact).
import { loadKAB } from './load.mjs';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const KAB = loadKAB();

function deepClone(o, memo = new WeakMap()) {
  if (o === null || typeof o !== 'object') return o;
  if (memo.has(o)) return memo.get(o);
  if (Array.isArray(o)) { const a = []; memo.set(o, a); for (const v of o) a.push(deepClone(v, memo)); return a; }
  if (Object.prototype.toString.call(o) === '[object Map]') { const m = new Map(); memo.set(o, m); for (const [k, v] of o) m.set(k, deepClone(v, memo)); return m; }
  const c = Object.create(Object.getPrototypeOf(o));
  memo.set(o, c);
  for (const k of Object.keys(o)) c[k] = deepClone(o[k], memo);
  return c;
}

function pullPoint(angleDeg, pull) {
  const a = angleDeg * Math.PI / 180;
  // Pull the bird back-and-DOWN so it launches forward-and-UP (screen y grows downward).
  // Whole-pixel pointer positions so a recorded line replays exactly with real mouse input.
  return { x: Math.round(KAB.SLING.x - Math.cos(a) * pull), y: Math.round(KAB.SLING.y + Math.sin(a) * pull) };
}

// Run one shot to completion. Returns the world (mutated).
function runShot(w, shot) {
  const p = pullPoint(shot.angle, shot.pull);
  if (!w.fire(p.x, p.y)) return false;
  let t = 0;
  while (w.state === 'flying' || w.state === 'resolve') {
    if (shot.ability != null && t === shot.ability) w.useAbility();
    w.step(); t++;
    if (t > 2400) break;
  }
  return true;
}

function freshWorld(level, shots) {
  const w = new KAB.World({}); w.load(level);
  for (const s of shots) runShot(w, s);
  return w;
}

const FAST = !!process.env.FAST;                                                 // quick design-iteration grid
const ANGLES = []; for (let a = 8; a <= 78; a += FAST ? 7 : 5) ANGLES.push(a);   // degrees above horizontal
const PULLS = FAST ? [60, 85, 110] : [55, 70, 85, 100, 110];
const ABILITY = FAST ? [null, 8, 30, 55] : [null, 8, 20, 35, 50, 70];

function candidates() {
  const out = [];
  for (const angle of ANGLES) for (const pull of PULLS) for (const ability of ABILITY) out.push({ angle, pull, ability });
  return out;
}

function evaluate(w) {
  const alive = w.enemiesAlive();
  // Credit partial progress too: damage dealt to the surviving drones guides the search.
  let dmg = 0;
  for (const b of w.phys.bodies) if (b.kind === 'enemy' && b.alive) dmg += Math.max(0, Math.min(1, 1 - b.hp / b.maxHp));
  return (w.state === 'won' ? 1e6 : 0) + (w.totalEnemies - alive) * 1e5 + dmg * 3e4 + w.score;
}

function solveLevel(level, beam = FAST ? 3 : 4) {
  let frontier = [{ shots: [], world: freshWorld(level, []) }];
  const cands = candidates();
  const nBirds = KAB.LEVELS[level].birds.length;
  for (let bird = 0; bird < nBirds; bird++) {
    const scored = [];
    for (const node of frontier) {
      if (node.world.state === 'won' || node.world.state === 'lost') { scored.push({ node, val: evaluate(node.world) + 1 }); continue; }
      for (const c of cands) {
        const w = deepClone(node.world);
        if (!runShot(w, c)) continue;
        scored.push({ node: { shots: node.shots.concat([c]), world: w }, val: evaluate(w) });
      }
    }
    scored.sort((a, b) => b.val - a.val);
    const next = []; const seen = new Set();
    for (const s of scored) {
      const key = Math.round(s.val);
      if (seen.has(key)) continue;
      seen.add(key); next.push(s.node);
      if (next.length >= beam) break;
    }
    frontier = next;
    const best = frontier[0].world;
    process.stderr.write(`  L${level + 1} bird ${bird + 1}/${nBirds}: best kills ${best.totalEnemies - best.enemiesAlive()}/${best.totalEnemies} score ${best.score} state ${best.state}\n`);
    if (frontier.some(n => n.world.state === 'won')) break;
  }
  const winner = frontier.find(n => n.world.state === 'won');
  const pick = winner || frontier[0];
  // Replay from scratch to confirm determinism.
  const replay = freshWorld(level, pick.shots);
  return { level, shots: pick.shots, won: replay.state === 'won', stars: replay.stars, score: replay.score, state: replay.state, birdsUsed: pick.shots.length, enemies: replay.totalEnemies - replay.enemiesAlive() };
}

const WRITE = process.argv.includes('--write');
const only = process.argv.slice(2).map(Number).filter(Boolean);
const levels = only.length ? only.map(n => n - 1) : KAB.LEVELS.map((_, i) => i);
let failed = 0;
for (const lv of levels) {
  const t0 = Date.now();
  const r = solveLevel(lv);
  console.log(`L${lv + 1} ${KAB.LEVELS[lv].name}: ${r.won ? 'SOLVED' : 'NOT SOLVED'} birds used ${r.birdsUsed}/${KAB.LEVELS[lv].birds.length} kills ${r.enemies} score ${r.score} stars ${r.stars} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  console.log('   shots', JSON.stringify(r.shots));
  if (!r.won) failed++;
  if (WRITE && r.won) {
    const f = new URL('./solutions.json', import.meta.url);
    const cur = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
    cur[lv] = { name: KAB.LEVELS[lv].name, shots: r.shots, score: r.score, stars: r.stars };
    writeFileSync(f, JSON.stringify(cur, null, 1) + '\n');
  }
}
process.exit(failed ? 1 : 0);
