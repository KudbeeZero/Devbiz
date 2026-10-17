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
// 10. ROBIN HOOD: a second arrow into the same hole splits the first; a near miss doesn't
{
  const m = new K.Match({ mode: 'range', dist: 0, seed: 4 }); m.wind = 0;
  const a = m.shoot(0.05, C.FACE_Y, 0, 0, 1); m.wind = 0;
  const b = m.shoot(0.05, C.FACE_Y, 0, 0, 1); m.wind = 0;
  const c = m.shoot(0.05 + C.ROBIN * 2, C.FACE_Y, 0, 0, 1);
  rec('robin-hood', !a.robin && b.robin && !c.robin && m.arrows[0][0].split && !m.arrows[0][2].split && b.ring === a.ring,
    `same spot -> ROBIN HOOD (first arrow split=${m.arrows[0][0].split}); ${(C.ROBIN * 200).toFixed(1)} cm away is not; the score is unchanged (${a.ring}/${b.ring})`);
  const n = new K.Match({ mode: 'range', dist: 0, seed: 4 }); n.wind = 0; n.shoot(0.05, C.FACE_Y, 0, 0, 1); n._newEnd(); n.endNo = 1; n.arrowNo = 0; n.wind = 0;
  rec('robin-same-end-only', !n.shoot(0.05, C.FACE_Y, 0, 0, 1).robin, 'arrows are pulled between ends, so last end\'s hole can\'t be split');
}
// 11. last-arrow pressure: what the shooter needs
{
  const m = new K.Match({ mode: 'range', dist: 1, seed: 6 });
  const none = m.needs(100);
  m.endNo = 4; m.arrowNo = 2; for (let i = 0; i < 14; i++) m.arrows[0].push({ ring: 8, end: 0 });   // 112 so far
  const n = m.needs(115), T3 = K.STARS[1][1];
  const d = new K.Match({ mode: 'duel', dist: 1, seed: 6 });
  for (let i = 0; i < 5; i++) d.arrows[i % 2].push({ ring: i % 2 ? 7 : 10, end: 0 });                 // you 30, CPU 14 so far
  d.arrowNo = 5; const dn = d.needs();
  rec('needs', none === null && n.best === 4 && n.star3 === T3 - 112 && dn.win === 17 && dn.tie === 16,
    `mid-range: nothing; last arrow on 112 vs best 115 -> needs ${n.best} (3 stars: ${n.star3}); duel CPU needs ${dn.win} to take the end (can't)`);
}
// 12. BALLOON POP: lead a mover and it pops; quiver, combo, gold refill, double pops, game over
{
  const C2 = K.CFG, D = K.Trick.DIST;
  // aim where the balloon WILL be when the arrow arrives (fixed point on the flight time)
  const lead = (m, b) => { let t = 0.4; for (let i = 0; i < 4; i++) { const p = m.pos(b, m.T + t), s = K.Flight.solve(D, p.x, p.y), r = K.Flight.run(D, s.yaw, s.pitch, C2.V0, m.wind); t = r.hit.t; } const p = m.pos(b, m.T + t); return p; };
  const m = new K.Trick({ seed: 3 }); m.tick(0.5);
  const b = m.balloons.find(x => Math.abs(m.pos(x, m.T).x) < 4) || m.balloons[0];
  const p = lead(m, b), q0 = m.quiver;
  const r1 = m.shoot(p.x, p.y, 0, 0, 1);
  const naive = new K.Trick({ seed: 3 }); naive.tick(0.5);
  const nb = naive.balloons.find(x => x.id === b.id), np = naive.pos(nb, naive.T), fast = Math.abs(nb.vx) > 0.6;
  const r0 = naive.shoot(np.x, np.y, 0, 0, 1);
  rec('pop-leads', r1.pops.some(x => x.id === b.id) && m.quiver === q0 - 1 + (r1.bonusArrows || 0) && r1.points >= 100 && (!fast || !r0.pops.some(x => x.id === b.id)),
    `leading the balloon pops it (+${r1.points}); aiming where it is now ${r0.pops.length ? 'also popped (slow drifter)' : 'misses'}`);
  // combo: pop again straight away -> multiplier 2
  m.tick(0.1); const b2 = m.balloons.find(x => x.popAt === null && Math.abs(m.pos(x, m.T).x) < 5);
  const r2 = b2 ? m.shoot(lead(m, b2).x, lead(m, b2).y, 0, 0, 1) : { pops: [] };
  const r3 = m.shoot(0, -2, 0, 0, 1);
  rec('pop-combo', r2.pops.length > 0 && r2.mult === 2 && !r3.pops.length && m.combo === 0, `second pop in a row scores at x${r2.mult}; a miss resets the combo`);
  // gold refills two arrows; double pop scores double each
  const g = new K.Trick({ seed: 3 }); g.balloons = [{ id: 90, born: 0, x0: 0, vx: 0, y0: 1.5, ph: 0, gold: true, col: 0, popAt: null }, { id: 91, born: 0, x0: 0.05, vx: 0, y0: 1.52, ph: 0, gold: false, col: 1, popAt: null }]; g.wind = 0;
  const gp = g.pos(g.balloons[0], g.T + 0.45), qg = g.quiver, rg = g.shoot(gp.x, gp.y, 0, 0, 1);
  rec('pop-gold-double', rg.pops.length === 2 && g.quiver === qg - 1 + 2 && rg.points === (250 + 100) * 2, `one arrow through two lined-up balloons: both pop (+${rg.points}); the gold one refills 2 arrows`);
  // over when the quiver is empty; deterministic
  const e = new K.Trick({ seed: 8 }); let n = 0; while (!e.over && n++ < 100) { e.tick(0.6); e.shoot(0, 5, 0, 0, 1); }
  const sig = () => { const t = new K.Trick({ seed: 12 }); const out = []; for (let i = 0; i < 6; i++) { t.tick(0.7); out.push(t.balloons.map(x => x.id + ':' + t.pos(x, t.T).x.toFixed(3)).join(',')); } return out.join('|'); };
  rec('pop-flow', e.over && n === K.Trick.ARROWS && sig() === sig(), `${n} misses empty the quiver and end the round; balloon traffic replays exactly per seed`);
}
// 12b. SWINGER: a pendulum on ropes; you have to lead it, arrows ride with it, misses fly through
{
  const m = new K.Swing({ seed: 5 }); m.wind = 0; m.tick(0.37);
  const L = K.Swing.L, P = 2 * Math.PI * Math.sqrt(L / C.G), o0 = m.offAt(m.T), o1 = m.offAt(m.T + P);
  rec('swing-pendulum', Math.abs(o0.x - o1.x) < 1e-9 && Math.abs(P - 3.11) < 0.02 && Math.abs(m.offAt(m.T).y - L * (1 - Math.cos(m.offAt(m.T).th))) < 1e-12, `period ${P.toFixed(2)} s = 2\u03c0\u221a(L/g); the boss rises at the ends of the arc`);
  // aim where it IS -> the face has moved on; aim where it WILL BE -> a ten
  const tf = K.Flight.run(30, K.Flight.solve(30, 0, C.FACE_Y).yaw, K.Flight.solve(30, 0, C.FACE_Y).pitch, C.V0, 0).hit.t;
  let best = null; for (let i = 0; i < 200 && !best; i++) { m.tick(0.02); const now = m.offAt(m.T), then = m.offAt(m.T + tf); if (Math.abs(now.x - then.x) > 0.35) best = { now, then }; }
  const at = m.shoot(best.now.x, C.FACE_Y + best.now.y, 0, 0, 1).ring, lead = m.shoot(best.then.x, C.FACE_Y + best.then.y, 0, 0, 1).ring;
  rec('swing-lead', lead >= 9 && at < lead, `aiming at the face scores ${at}; leading it by the ${tf.toFixed(2)} s flight scores ${lead}`);
  const a = m.arrows[0][1], o = m.offAt(m.T);
  rec('swing-arrows-ride', a.hit && Math.hypot(a.hit.x, a.hit.y - C.FACE_Y) < 0.08, `the arrow is kept in the boss's own frame (${a.hit.x.toFixed(3)}, ${(a.hit.y - C.FACE_Y).toFixed(3)}) and drawn ${o.x.toFixed(2)} m off centre as it swings`);
  const miss = m.shoot(o.x + 2.5, C.FACE_Y, 0, 0, 1); m.shoot(0, C.FACE_Y, 0, 0, 1);
  let amp = []; while (!m.over) { amp.push(m.th0); for (let i = 0; i < 3 && !m.over; i++) m.shoot(0, C.FACE_Y, 0, 0, 1); }
  rec('swing-flow', miss.miss && m.arrows[0][2].hit === null && m.endScores.length === 4 && amp.every((v, i) => !i || v > amp[i - 1]) && m.needs() === null, `a miss off the boss leaves nothing hanging in the air; 4 ends, the swing grows each end (${amp.map(v => v.toFixed(2)).join(' < ')})`);
}
// 12c. DAILY: one seed per UTC day, the same on every device
{
  const D = K.Daily, day = D.day(Date.UTC(2026, 9, 17, 23, 59)), next = D.day(Date.UTC(2026, 9, 18, 0, 1));
  const sig = s => { const t = new K.Trick({ seed: s, daily: 1 }); const out = [t.wind.toFixed(4)]; for (let i = 0; i < 8; i++) { t.tick(0.5); out.push(t.balloons.map(b => b.id + ':' + b.y0.toFixed(3) + ':' + b.vx.toFixed(3) + ':' + b.gold).join(',')); } return out.join('|'); };
  rec('daily-seed', day === 1 && next === 2 && D.date(1) === '2026-10-17' && sig(D.seed(day)) === sig(D.seed(day)) && sig(D.seed(day)) !== sig(D.seed(next)), `#1 is 2026-10-17 (UTC); the same day gives identical wind and balloons, the next day different`);
}
// 12d. 70 m unlock: 6 stars across the shorter distances (or an existing 70 m score)
{
  const d = { best: [0, 0, 0, 0], stars: [3, 2, 0, 0] };
  const a = K.locked(3, d); d.stars[2] = 1; const b = K.locked(3, d); const c = K.locked(3, { best: [0, 0, 0, 90], stars: [0, 0, 0, 0] });
  rec('unlock-70', a && !b && !c && !K.locked(2, { best: [0, 0, 0, 0], stars: [0, 0, 0, 0] }), '70 m stays locked on 5 stars, opens on 6; players who already shot 70 m keep it');
}
// 12b. THE TOUR: fifteen levels in three venues, each one opens the next
{
  const T = K.TOUR, ok = T.length === 15 && K.VENUES.length === 3 && T.every((L, i) => L.v === Math.floor(i / 5) && L.stars[0] < L.stars[1] && L.stars[1] < L.stars[2] && L.stars[2] <= L.ends * 30);
  const D = { tour: { stars: Array(15).fill(0) } }, chain = [K.tourOpen(0, D), K.tourOpen(1, D)]; D.tour.stars[0] = 1; chain.push(K.tourOpen(1, D), K.tourOpen(2, D));
  rec('tour-levels', ok && chain.join() === 'true,false,true,false', `${T.length} levels over ${K.VENUES.map(v => v.name.toLowerCase()).join(' / ')}; star targets rise; one star opens the next level`);
  // a perfect still-air run earns 3 stars; a smaller face scores tighter rings
  const st = new K.Stage({ level: 0, seed: 3 }); st.wind = 0; while (!st.over) { st._gust = () => { st.wind = 0; }; st.wind = 0; st.shoot(0, C.FACE_Y, 0, 0, 1); }
  const small = new K.Stage({ level: 5, seed: 1 }), sc = K.Score.ring(1, 0.2, C.FACE_Y, small.faceD).ring, std = K.Score.ring(1, 0.2, C.FACE_Y).ring;
  rec('tour-stars-face', st.stars() === 3 && st.total(0) === st.max && new K.Stage({ level: 0 }).stars() === 0 && small.faceD < C.FACE[1] && sc < std,
    `a perfect run scores ${st.total(0)}/${st.max} for 3 stars; the 48 cm face scores a 20 cm miss as ${sc} (standard face: ${std})`);
  // ON THE RAIL: the boss slides; a shot led to where it will be scores, and the arrow rides in the boss
  const rl = new K.Stage({ level: 2, seed: 9 }), xs = Array.from({ length: 40 }, (_, i) => rl.offAt(i * 0.1).x), moved = Math.max(...xs) - Math.min(...xs); rl.tick(0.8);
  rl.wind = 0; const s0 = K.Flight.solve(rl.dist, 0, C.FACE_Y), tf = K.Flight.run(rl.dist, s0.yaw, s0.pitch, C.V0, 0).hit.t, o = rl.offAt(rl.T + tf);
  const led = rl.shoot(o.x, C.FACE_Y + o.y, 0, 0, 1);
  rl.wind = 0; const o2 = rl.offAt(rl.T), still = rl.shoot(o2.x - 0.45 * Math.sign(rl.offAt(rl.T + tf).x - o2.x || 1), C.FACE_Y, 0, 0, 1);
  rec('tour-rail', moved > 0.2 && led.ring >= 9 && rl.arrows[0][0].hit && still.ring < led.ring, `the rail boss slides across ${(moved * 100) | 0} cm; leading it scores ${led.ring}, aiming behind it ${still.ring}`);
}
// 13. persistence
{
  const store = {};
  const ls = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
  const K2 = loadKAR(['util.js'], ls);
  K2.Store.data.dist = 3; K2.Store.data.best[2] = 111; K2.Store.data.stars[2] = 2; K2.Store.data.mode = 2; K2.Store.data.trickBest = 4200; K2.Store.data.swingBest = 97; K2.Store.data.daily = { day: 4, best: 3100, plays: 2, first: 2500 }; K2.Store.data.tour.stars[4] = 2; K2.Store.data.tour.best[4] = 99; K2.Store.data.tourLv = 5; K2.Store.save();
  const K3 = loadKAR(['util.js'], ls); K3.Store.load();
  rec('store', K3.Store.data.dist === 3 && K3.Store.data.best[2] === 111 && K3.Store.data.stars[2] === 2 && K3.Store.data.mode === 2 && K3.Store.data.trickBest === 4200 && K3.Store.data.swingBest === 97 && K3.Store.data.daily.best === 3100 && K3.Store.data.daily.first === 2500 && K3.Store.data.tour.stars[4] === 2 && K3.Store.data.tour.best[4] === 99 && K3.Store.data.tourLv === 5, 'distance, best scores, stars, BALLOON POP mode and best, and level progress survive a reload');
}
const failed = R.filter(r => !r.pass).length;
console.log(`\n=== ${R.length - failed}/${R.length} passed ===`);
process.exit(failed ? 1 : 0);
