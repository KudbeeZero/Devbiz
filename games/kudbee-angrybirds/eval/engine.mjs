// Kudbee Birds — headless engine + rules checks (Node only, no browser).
//   node engine.mjs
// Covers the rigid-body engine, determinism, ability rules, the turn state
// machine, every level standing still on its own, and a replay of the recorded
// winning line for every level (solutions.json, produced by solve.mjs --write)
// so a physics/level tweak can never silently make a level unwinnable.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadKAB } from './load.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const KAB = loadKAB();
const R = [];
const rec = (id, pass, note) => { R.push({ id, pass }); console.log((pass ? 'PASS' : 'FAIL'), id, '—', note); };

function ground(p) { return p.add(new KAB.Body({ shape: 'box', kind: 'ground', mat: 'ground', x: 480, y: 640, w: 4000, h: 200, isStatic: true })); }

function pullPoint(angleDeg, pull) {
  const a = angleDeg * Math.PI / 180;
  return { x: Math.round(KAB.SLING.x - Math.cos(a) * pull), y: Math.round(KAB.SLING.y + Math.sin(a) * pull) };
}
function shoot(w, s) {
  const p = pullPoint(s.angle, s.pull);
  if (!w.fire(p.x, p.y)) return false;
  let t = 0;
  while ((w.state === 'flying' || w.state === 'resolve') && t++ < 3000) { if (s.ability === t - 1) w.useAbility(); w.step(); }
  return true;
}

// 1. stacking
{
  const p = new KAB.Physics(); ground(p);
  const bs = []; for (let i = 0; i < 6; i++) bs.push(p.add(new KAB.Body({ x: 500, y: 520 - i * 40, w: 40, h: 40, mat: 'wood' })));
  const y0 = bs.map(b => b.y);
  for (let t = 0; t < 240; t++) p.step(1 / 60);
  const drift = Math.max(...bs.map((b, i) => Math.abs(b.y - y0[i]) + Math.abs(b.x - 500)));
  rec('stack-stable', drift < 0.5 && bs.every(b => b.asleep) && bs.every(b => b.hp === b.maxHp), `6-high stack drift ${drift.toFixed(3)}px, asleep, undamaged`);
}
// 2. circle on ground
{
  const p = new KAB.Physics(); ground(p);
  const b = p.add(new KAB.Body({ shape: 'circle', r: 14, x: 300, y: 100, mat: 'wood', restitution: 0.6 }));
  for (let t = 0; t < 300; t++) p.step(1 / 60);
  rec('ball-rests-on-ground', Math.abs(b.y - 526) < 0.6 && b.asleep, `ball at y=${b.y.toFixed(2)} (expect 526), asleep=${b.asleep}`);
}
// 3. tunnelling
{
  const p = new KAB.Physics(); ground(p);
  const pane = p.add(new KAB.Body({ x: 500, y: 480, w: 8, h: 120, mat: 'glass' }));
  const bird = p.add(new KAB.Body({ shape: 'circle', kind: 'bird', r: 12, x: 200, y: 480, mat: 'wood', density: 1.5, invuln: true, linDamp: 0 }));
  bird.vx = 1480; let hit = false; p.onImpact = () => { hit = true; };
  for (let t = 0; t < 40; t++) p.step(1 / 60);
  rec('no-tunnelling', hit && (bird.x < 520 || pane.hp < pane.maxHp), `1480 px/s bird vs 8px pane: impact=${hit}, pane hp ${pane.hp.toFixed(0)}/${pane.maxHp}`);
}
// 4. determinism
{
  const sig = () => {
    const w = new KAB.World({}); w.load(3);
    shoot(w, { angle: 22, pull: 100, ability: null }); shoot(w, { angle: 40, pull: 90, ability: 12 });
    return w.score + '|' + w.phys.bodies.map(b => b.x.toFixed(4) + ',' + b.y.toFixed(4)).join(';');
  };
  rec('deterministic', sig() === sig(), 'identical shots produce identical worlds (replayable)');
}
// 5. abilities
{
  const w = new KAB.World({}); w.load(0);
  const p = pullPoint(30, 100); w.fire(p.x, p.y);
  const b = w.birds[0]; w.step(); w.step();
  const v0 = Math.hypot(b.vx, b.vy); w.useAbility(); const v1 = Math.hypot(b.vx, b.vy);
  const dashOk = v1 > v0 * 1.2 && !w.canUseAbility();
  const w2 = new KAB.World({}); w2.load(3);                      // first bird is gold (Slam)
  const q = pullPoint(35, 100); w2.fire(q.x, q.y); w2.step(); w2.step(); w2.useAbility();
  const slamOk = w2.birds[0].vy > 800 && Math.abs(w2.birds[0].vx) < 400;
  const w3 = new KAB.World({}); w3.load(2);                      // first bird is green (Split)
  const r = pullPoint(40, 100); w3.fire(r.x, r.y); w3.step(); w3.step(); w3.useAbility();
  const splitOk = w3.birds.length === 3 && w3.birds.every(x => x.alive);
  rec('ability-dash', dashOk, `speed ${v0.toFixed(0)} -> ${v1.toFixed(0)}, single use`);
  rec('ability-slam', slamOk, `vy ${w2.birds[0].vy.toFixed(0)}, vx ${w2.birds[0].vx.toFixed(0)}`);
  rec('ability-split', splitOk, `${w3.birds.length} birds after split`);
}
// 6. state machine: running out of birds ends in 'lost' (never hangs)
{
  const w = new KAB.World({}); w.load(0);
  let n = 0; while (w.state !== 'lost' && w.state !== 'won' && n++ < 10) shoot(w, { angle: 80, pull: 20, ability: null });
  rec('state-lost', w.state === 'lost' && w.birdsLeft() === 0, `state=${w.state} after ${w.shots} wasted shots`);
}
// 7. scoring + bonus + stars on a recorded win
const solPath = resolve(HERE, 'solutions.json');
const sols = existsSync(solPath) ? JSON.parse(readFileSync(solPath, 'utf8')) : null;
if (!sols) rec('solutions-present', false, 'eval/solutions.json missing — run: node solve.mjs --write');
// 8. every level stands still, then is beatable by its recorded line
for (let i = 0; i < KAB.LEVELS.length; i++) {
  const L = KAB.LEVELS[i];
  const w = new KAB.World({}); w.load(i);
  const bodies = w.phys.bodies.filter(b => !b.isStatic);
  const p0 = bodies.map(b => [b.x, b.y]);
  const n0 = bodies.length;
  for (let t = 0; t < 600; t++) w.step();
  const drift = Math.max(...bodies.map((b, k) => Math.hypot(b.x - p0[k][0], b.y - p0[k][1])));
  rec(`level${i + 1}-stands`, drift < 0.5 && w.phys.bodies.filter(b => !b.isStatic).length === n0 && w.score === 0, `${L.name}: ${n0} bodies, drift ${drift.toFixed(3)}px, nothing breaks by itself`);
  rec(`level${i + 1}-has-drones`, w.totalEnemies >= 3 && L.birds.length >= 3 && L.stars[0] < L.stars[1], `${w.totalEnemies} drones, ${L.birds.length} birds, stars ${L.stars.join('/')}`);
  if (sols && sols[i]) {
    const v = new KAB.World({}); v.load(i);
    for (const s of sols[i].shots) shoot(v, s);
    rec(`level${i + 1}-solvable`, v.state === 'won', `${L.name}: recorded ${sols[i].shots.length}-bird line -> ${v.state}, ${v.stars}★, score ${v.score}`);
    rec(`level${i + 1}-3-stars-attainable`, v.stars === 3, `${L.name}: recorded line earns ${v.stars}★ (thresholds ${L.stars.join('/')})`);
  } else if (sols) rec(`level${i + 1}-solvable`, false, `${L.name}: no recorded solution`);
}
// 9. persistence helpers
{
  const store = {};
  const ctx = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
  const K = loadKAB(['util.js']);
  K.Store.constructor; // no-op: ensure loaded
  globalThis.window = { localStorage: ctx };
  K.Store.record(0, 2, 20000); K.Store.record(0, 1, 30000);
  const b = K.Store.best(0);
  rec('store-progress', b.stars === 2 && b.score === 30000 && K.Store.unlocked(1) && !K.Store.unlocked(2), `best keeps max stars (${b.stars}) and max score (${b.score}); level 2 unlocked, 3 locked`);
}

const failed = R.filter(r => !r.pass).length;
console.log(`\n=== ${R.length - failed}/${R.length} passed ===`);
process.exit(failed ? 1 : 0);
