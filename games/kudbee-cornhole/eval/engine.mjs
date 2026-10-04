// Kudbee Cornhole — headless physics, rules and CPU checks (Node only, no browser).
//   node engine.mjs
import { loadKCH } from './load.mjs';

const K = loadKCH();
const C = K.CFG;
const R = [];
const rec = (id, pass, note) => { R.push({ id, pass }); console.log((pass ? 'PASS' : 'FAIL'), id, '—', note); };

const one = (style, u, s, err) => { const sim = new K.Sim(); const b = sim.throwBag(0, style, u, s, err || null); sim.runToRest(1 / 120, 4000); return { sim, b }; };

// 1. regulation geometry
rec('geometry', Math.abs(C.THETA * 180 / Math.PI - 10.62) < 0.05 && Math.abs(C.SLEN - 48.84) < 0.05 && Math.abs(C.HOLE_S - 39.84) < 0.05 && C.BOARD_Z0 === 324,
  `slope ${(C.THETA * 180 / Math.PI).toFixed(2)}°, surface ${C.SLEN.toFixed(2)} in, hole ${C.HOLE_S.toFixed(2)} in up the slope, pitch 27 ft`);

// 2. straight into the hole = airmail, worth 3
{
  const { sim, b } = one('slide', 0, C.HOLE_S);
  const t = sim.tally();
  rec('airmail', b.state === 'hole' && b.airmail && t.pts[0] === 3, `dead-centre throw drops in untouched (airmail=${b.airmail}), scores ${t.pts[0]}`);
}
// 3. misses end on the lawn for 0
{
  const a = one('slide', 0, -30).b, b2 = one('slide', 0, 62).b, c = one('slide', -22, 20).b;
  rec('misses-score-zero', a.state === 'ground' && b2.state === 'ground' && c.state === 'ground', `short / long / wide throws all end on the lawn (${a.state}, ${b2.state}, ${c.state})`);
}
// 4. a bag that lands on the board is worth 1 and stays
{
  const { sim, b } = one('flop', 6, 14);
  rec('board-bag', b.state === 'board' && sim.tally().pts[0] === 1 && Math.hypot(b.vu, b.vs) === 0, `a landed bag rests on the board (${b.state}), scores ${sim.tally().pts[0]}`);
}
// 5. slide skids, flop dies where it lands
{
  const rnd = K.Util.rng(11);
  const run = style => { let tot = 0, n = 0; for (let i = 0; i < 80; i++) { const err = { du: rnd.gauss() * 1.0, ds: rnd.gauss() * 1.4 }; const { b } = one(style, 0, 12, err); if (b.state === 'board') { tot += b.s - (12 + err.ds); n++; } } return tot / n; };
  const sl = run('slide'), fl = run('flop');
  rec('styles-differ', sl > fl + 1.5 && Math.abs(fl) < 2, `slide skids ${sl.toFixed(1)} in past its landing spot, flop ${fl.toFixed(1)} in`);
}
// 6. regulation-ish skill curve: tighter hands drop more bags in the hole
{
  const rate = sig => { const r = K.Util.rng(5); let hole = 0, N = 150; for (let i = 0; i < N; i++) { const { b } = one('flop', 0, C.HOLE_S, { du: r.gauss() * sig * 0.7, ds: r.gauss() * sig }); if (b.state === 'hole') hole++; } return hole / N; };
  const a = rate(2.6), b = rate(4.2), c = rate(7);
  rec('skill-curve', a > b && b > c && a > 0.5 && c < 0.4, `hole rate: legend-steady ${(a * 100) | 0}% > pro ${(b * 100) | 0}% > rookie ${(c * 100) | 0}%`);
}
// 7. bags push each other: a slider shoves a blocker into the hole
{
  const sim = new K.Sim();
  const mk = (team, s, vs) => ({ id: sim._id++, team, style: 'slide', state: 'board', x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, u: 0, s, vu: 0, vs, yaw: 0, yawV: 0, tilt: 0, tiltV: 0, airmail: false, touched: true, flight: 1 });
  const blocker = mk(1, C.HOLE_S - 6.5, 0), pusher = mk(0, C.HOLE_S - 14, 70);
  sim.bags.push(blocker, pusher);
  sim.runToRest(1 / 120, 3000);
  const t = sim.tally();
  rec('bag-pushes-bag', blocker.state === 'hole' && t.pts[1] === 3, `a sliding bag shoves the blocker in: blocker ${blocker.state}, pusher ${pusher.state}, points ${t.pts.join('/')}`);
}
// 8. determinism
{
  const sig = () => { const m = new K.Match({ first: 0 }); const rnd = K.Util.rng(99); for (let i = 0; i < 8; i++) { m.throw(i % 3 ? 'slide' : 'flop', rnd.gauss() * 3, 28 + rnd.gauss() * 6, null); m.sim.runToRest(1 / 120, 4000); m.afterSettle(); } return JSON.stringify(m.sim.bags.map(b => [b.state, +b.u.toFixed(5), +b.s.toFixed(5)])); };
  rec('deterministic', sig() === sig(), 'identical throws give identical boards');
}
// 9. cancellation scoring
{
  const m = new K.Match({ first: 0 });
  const bag = (team, state) => ({ id: m.sim._id++, team, state, u: 0, s: 5, vu: 0, vs: 0, holeT: 1 });
  m.sim.bags.push(bag(0, 'hole'), bag(0, 'board'), bag(0, 'board'), bag(1, 'board'), bag(1, 'board'), bag(1, 'board'));
  m.idx = 8; m.phase = 'settle';                    // pretend all 8 are thrown
  const r = m.afterSettle();
  rec('cancellation', r.tally.pts[0] === 5 && r.tally.pts[1] === 3 && r.winner === 0 && r.pts === 2 && m.score[0] === 2 && m.score[1] === 0, `3+1+1=5 vs 1+1+1=3 -> blue scores the 2-point difference (${m.score.join('-')})`);
}
// 10. turn order, 4 bags each, first to 21
{
  const m = new K.Match({ first: 1 });
  const order = m.order.join('');
  let n = 0; while (m.phase === 'throw' && n++ < 20) { m.throw('flop', 0, 8 + n * 3, null); m.sim.runToRest(1 / 120, 3000); m.afterSettle(); }
  rec('turn-order', order === '10101010' && m.thrown[0] === 4 && m.thrown[1] === 4 && m.phase === 'roundEnd', `teams alternate starting with the scorer (${order}), 4 bags each, round ends after 8`);
  const w = new K.Match({ first: 0 }); w.score[0] = 20; w.idx = 8; w.phase = 'settle';
  w.sim.bags.push({ id: 1, team: 0, state: 'hole', holeT: 1 }, { id: 2, team: 0, state: 'hole', holeT: 1 });
  const rr = w.afterSettle();
  rec('first-to-21', w.over && w.winner === 0 && w.score[0] >= 21, `20 + 6 -> match over, winner ${w.winner}`);
  const so = new K.Match({ solo: true }); so.sim.bags.push({ id: 1, team: 0, state: 'hole', holeT: 1 }, { id: 2, team: 0, state: 'board', holeT: 1 }); so.idx = 4; so.phase = 'settle';
  so.afterSettle();
  rec('practice-mode', so.score[0] === 4 && !so.over && so.order.length === 4, 'solo mode: one thrower, 4 bags, points just add up and it never ends');
}
// 11. the CPU plans quickly and plays a legal match to the end; skill matters
{
  const m = new K.Match({ first: 1 });
  const t0 = performance.now(); const plan = K.AI.plan(m, 1); const ms = performance.now() - t0;
  rec('cpu-plan-fast', ms < 700 && !!plan, `one planning pass takes ${ms.toFixed(0)} ms (budget 700)`);
  const play = (la, lb, seed) => {
    const rnd = K.Util.rng(seed), mm = new K.Match({ first: seed % 2 }); let g = 0, holes = [0, 0];
    while (!mm.over && g++ < 300) {
      const t = mm.team, ex = K.AI.execute(mm, t, t === 0 ? la : lb, rnd);
      mm.throw(ex.style, ex.u, ex.s, ex.err); mm.sim.runToRest(1 / 120, 3000);
      const rr = mm.afterSettle();
      if (rr) { holes[0] += rr.tally.holes[0]; holes[1] += rr.tally.holes[1]; if (!mm.over) mm.nextRound(); }
    }
    return { over: mm.over, winner: mm.winner, rounds: mm.round, holes };
  };
  const results = [play(2, 0, 201), play(2, 0, 202), play(1, 0, 203)];
  const allOver = results.every(r => r.over), legendWins = results.filter(r => r.winner === 0).length;
  rec('cpu-plays-matches', allOver && legendWins >= 2, `3 simulated matches finish (rounds ${results.map(r => r.rounds).join('/')}); the better CPU won ${legendWins}/3`);
}
// 12. persistence
{
  const store = {};
  const ls = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
  const K2 = loadKCH(['util.js'], ls);
  K2.Store.data.difficulty = 2; K2.Store.data.stats.won = 3; K2.Store.save();
  const K3 = loadKCH(['util.js'], ls); K3.Store.load();
  rec('store', K3.Store.data.difficulty === 2 && K3.Store.data.stats.won === 3, 'difficulty and stats survive a reload');
}

const failed = R.filter(r => !r.pass).length;
console.log(`\n=== ${R.length - failed}/${R.length} passed ===`);
process.exit(failed ? 1 : 0);
