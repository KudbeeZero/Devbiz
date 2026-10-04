// Kudbee Archery — headless ballistics, scoring, match and bot checks (Node only).
//   node engine.mjs
import { loadKAR } from './load.mjs';

const K = loadKAR(), C = K.CFG;
const R = [];
const rec = (id, pass, note) => { R.push({ id, pass }); console.log((pass ? 'PASS' : 'FAIL'), id, '—', note); };

// 1. the sight solver puts a still-air arrow through the aim point at every distance
{
  let worst = 0;
  for (let d = 0; d < 4; d++) for (const [tx, ty] of [[0, C.FACE_Y], [0.2, 1.5], [-0.3, 1.0]]) {
    const s = K.Flight.solve(C.DISTS[d], tx, ty), r = K.Flight.run(C.DISTS[d], s.yaw, s.pitch, C.V0, 0);
    worst = Math.max(worst, Math.hypot(r.hit.x - tx, r.hit.y - ty));
  }
  rec('sight-solver', worst < 0.01, `still-air arrows land within ${(worst * 100).toFixed(2)} cm of the aim point at 18/30/50/70 m`);
}
// 2. physics sanity: further = more drop (steeper), more time, more wind drift; wind pushes the right way
{
  const p = [], t = [], dr = [];
  for (let d = 0; d < 4; d++) { const D = C.DISTS[d], s = K.Flight.solve(D, 0, C.FACE_Y); p.push(s.pitch); t.push(K.Flight.run(D, s.yaw, s.pitch, C.V0, 0).hit.t); dr.push(K.Flight.run(D, s.yaw, s.pitch, C.V0, 3).hit.x); }
  const inc = a => a.every((v, i) => !i || v > a[i - 1]);
  const left = K.Flight.run(70, K.Flight.solve(70, 0, C.FACE_Y).yaw, K.Flight.solve(70, 0, C.FACE_Y).pitch, C.V0, -3).hit.x;
  rec('ballistics', inc(p) && inc(t) && inc(dr) && dr[0] > 0 && left < 0 && t[3] > 1 && t[3] < 1.5,
    `pitch ${p.map(v => (v * 57.3).toFixed(1)).join('/')}°, flight ${t.map(v => v.toFixed(2)).join('/')} s, drift in a 3-unit wind ${dr.map(v => (v * 100).toFixed(0)).join('/')} cm; a left wind pushes left`);
}
// 3. less draw = a slower arrow that drops short
{
  const s = K.Flight.solve(50, 0, C.FACE_Y), full = K.Flight.run(50, s.yaw, s.pitch, C.V0, 0).hit, weak = K.Flight.run(50, s.yaw, s.pitch, C.V0 * 0.93, 0).hit;
  rec('power-matters', weak.y < full.y - 0.3 && weak.t > full.t, `a 93% draw lands ${((full.y - weak.y) * 100).toFixed(0)} cm low and arrives ${((weak.t - full.t) * 1000) | 0} ms later`);
}
// 4. ring scoring: boundaries, X, miss
{
  const S = K.Score, R50 = C.FACE[2] / 2, w = R50 / 10;
  const a = S.ring(2, 0, C.FACE_Y), b = S.ring(2, w * 0.49, C.FACE_Y), c = S.ring(2, w * 0.99, C.FACE_Y), d = S.ring(2, w * 1.01, C.FACE_Y), e = S.ring(2, R50 * 0.999, C.FACE_Y), f = S.ring(2, R50 * 1.01, C.FACE_Y);
  rec('ring-scoring', a.ring === 10 && a.x && b.x && c.ring === 10 && !c.x && d.ring === 9 && e.ring === 1 && f.ring === 0, `centre = X (10), edge of gold = 10, just outside = 9, outermost = 1, off the face = 0`);
  const small = K.Score.ring(0, 0.19, C.FACE_Y).ring, big = K.Score.ring(3, 0.19, C.FACE_Y).ring;
  rec('face-sizes', small < big && C.FACE[0] === 0.40 && C.FACE[3] === 1.22, `the same 19 cm miss scores ${small} on the 18 m face but ${big} on the 70 m face`);
}
// 5. a short arrow hits the ground, not the face
{
  const m = new K.Match({ mode: 'range', dist: 3, seed: 2 });
  const r = m.shoot(0, C.FACE_Y - 2.5, 0, 0, 1);       // aims 2.5 m under the face: still reaches the plane, but misses
  const r2 = m.shoot(0, C.FACE_Y, 0, 0, 0.0);          // no draw: dribbles short
  rec('misses', r.ring === 0 && r.miss && r2.short && r2.ring === 0, `aiming way low scores ${r.ring}; an undrawn bow drops short of the butt (short=${r2.short})`);
}
// 6. range flow: 5 ends x 3 arrows, scores add up, wind re-rolls each end
{
  const m = new K.Match({ mode: 'range', dist: 1, seed: 5 });
  const winds = new Set(); let n = 0, ends = 0;
  while (!m.over && n++ < 100) { winds.add(m.baseWind.toFixed(3)); const r = m.shoot(0, C.FACE_Y, 0, 0, 1); if (r.endDone) ends++; }
  const sum = m.arrows[0].reduce((a, h) => a + h.ring, 0);
  rec('range-flow', m.over && n === 15 && ends === 5 && m.total(0) === sum && winds.size >= 4 && m.arrows[0].length === 15, `15 arrows over 5 ends, total ${m.total(0)}, ${winds.size} different end winds`);
}
// 7. duel flow: alternating arrows, 2 set points per end, first to 6
{
  const m = new K.Match({ mode: 'duel', dist: 1, level: 1, seed: 7 });
  const order = []; let g = 0;
  while (!m.over && g++ < 100) { order.push(m.shooter); m.shoot(0, C.FACE_Y, 0, 0, 1); }
  rec('duel-alternates', order.slice(0, 6).join('') === '010101' && m.arrows[0].length === m.arrows[1].length, `shooters alternate (${order.slice(0, 6).join('')}); both fire ${m.arrows[0].length} arrows`);
  const t = new K.Match({ mode: 'duel', seed: 1 });
  const fire = (a, b) => { t.shoot(0, C.FACE_Y, a, 0, 1); t.shoot(0, C.FACE_Y, b, 0, 1); };
  // force scores by hand through the record: use huge sway for the second shooter
  for (let i = 0; i < 3; i++) fire(0, 3);
  rec('set-points', t.sets[0] === 2 && t.sets[1] === 0 && t.endNo === 1, `a better end is worth 2 set points (${t.sets.join('-')})`);
  const w = new K.Match({ mode: 'duel', seed: 1 });
  for (let e = 0; e < 3 && !w.over; e++) for (let i = 0; i < 3; i++) { w.shoot(0, C.FACE_Y, 0, 0, 1); w.shoot(0, C.FACE_Y, 3, 0, 1); }
  rec('duel-ends-at-6', w.over && w.winner === 0 && w.sets[0] === 6 && w.endNo === 3, `three won ends = 6 set points -> match over, winner ${w.winner}`);
}
// 8. determinism
{
  const sig = () => { const m = K.Bot.play({ mode: 'range', dist: 2, seed: 9 }, 0.002, 0.2, 4); return m.arrows[0].map(h => h.ring).join(',') + '|' + m.wind; };
  rec('deterministic', sig() === sig(), 'same seed and inputs replay the same match');
}
// 9. bot skill + distance curve; stars
{
  const avg = (d, sg, re) => { let t = 0, N = 40; for (let i = 1; i <= N; i++) t += K.Bot.play({ mode: 'range', dist: d, seed: i }, sg, re, i + 50).total(0); return t / N; };
  const ro = K.LEVELS[0], pr = K.LEVELS[1], lg = K.LEVELS[2];
  const a = avg(2, ro.sigma, ro.read), b = avg(2, pr.sigma, pr.read), c = avg(2, lg.sigma, lg.read);
  rec('skill-curve', a < b && b < c, `50 m average out of 150: ROOKIE ${a.toFixed(0)} < PRO ${b.toFixed(0)} < LEGEND ${c.toFixed(0)}`);
  const d0 = avg(0, pr.sigma, pr.read), d3 = avg(3, pr.sigma, pr.read);
  rec('distance-curve', d3 < d0 - 5, `a PRO shooter averages ${d0.toFixed(0)} at 18 m but ${d3.toFixed(0)} at 70 m (longer is harder)`);
  const mm = K.Bot.play({ mode: 'range', dist: 1, seed: 3 }, 0.0011, 0.1, 3);
  rec('stars', mm.stars() >= 2 && new K.Match({ mode: 'range' }).stars() === 0, `a LEGEND-grade shooter earns ${mm.stars()} stars at 30 m (${mm.total(0)}); an unfinished range earns none`);
  let wins = 0; for (let i = 1; i <= 30; i++) { const m2 = K.Bot.play({ mode: 'duel', dist: 1, level: 0, seed: i }, lg.sigma, lg.read, i); if (m2.winner === 0) wins++; }
  rec('duel-cpu-beatable', wins > 15, `a LEGEND-grade player beats the ROOKIE CPU ${wins}/30`);
}
// 10. persistence
{
  const store = {};
  const ls = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
  const K2 = loadKAR(['util.js'], ls);
  K2.Store.data.dist = 3; K2.Store.data.best[2] = 111; K2.Store.data.stars[2] = 2; K2.Store.save();
  const K3 = loadKAR(['util.js'], ls); K3.Store.load();
  rec('store', K3.Store.data.dist === 3 && K3.Store.data.best[2] === 111 && K3.Store.data.stars[2] === 2, 'distance, best scores and stars survive a reload');
}
const failed = R.filter(r => !r.pass).length;
console.log(`\n=== ${R.length - failed}/${R.length} passed ===`);
process.exit(failed ? 1 : 0);
