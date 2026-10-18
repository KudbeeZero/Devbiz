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
// 12b. THE TOUR: five worlds of six levels, a boss last in each; each level opens the next
{
  const T = K.TOUR, ok = T.length === 30 && K.VENUES.length === 5 && T.every((L, i) => L.v === Math.floor(i / 6) && !!L.boss === (i % 6 === 5) && L.stars[0] > 0 && L.stars[0] < L.stars[1] && L.stars[1] < L.stars[2] && L.stars[2] <= L.ends * 30);
  const D = { tour: { stars: Array(30).fill(0) } }, chain = [K.tourOpen(0, D), K.tourOpen(1, D)]; D.tour.stars[0] = 1; chain.push(K.tourOpen(1, D), K.tourOpen(2, D));
  rec('tour-levels', ok && chain.join() === 'true,false,true,false', `${T.length} levels over ${K.VENUES.map(v => v.name.toLowerCase()).join(' / ')}, a boss ending each world; star targets rise; one star opens the next level`);
  // a perfect still-air run earns 3 stars; a smaller face scores tighter rings
  const st = new K.Stage({ level: 0, seed: 3 }); st.wind = 0; while (!st.over) { st._gust = () => { st.wind = 0; }; st.wind = 0; st.shoot(0, C.FACE_Y, 0, 0, 1); }
  const small = new K.Stage({ level: 6, seed: 1 }), sc = K.Score.ring(1, 0.2, C.FACE_Y, small.faceD).ring, std = K.Score.ring(1, 0.2, C.FACE_Y).ring;
  rec('tour-stars-face', st.stars() === 3 && st.total(0) === st.max && new K.Stage({ level: 0 }).stars() === 0 && small.faceD < C.FACE[1] && sc < std,
    `a perfect run scores ${st.total(0)}/${st.max} for 3 stars; the 48 cm face scores a 20 cm miss as ${sc} (standard face: ${std})`);
  // ON THE RAIL: the boss slides; a shot led to where it will be scores, and the arrow rides in the boss
  const rl = new K.Stage({ level: 2, seed: 9 }), xs = Array.from({ length: 40 }, (_, i) => rl.offAt(i * 0.1).x), moved = Math.max(...xs) - Math.min(...xs); rl.tick(0.8);
  rl.wind = 0; const s0 = K.Flight.solve(rl.dist, 0, C.FACE_Y), tf = K.Flight.run(rl.dist, s0.yaw, s0.pitch, C.V0, 0).hit.t, o = rl.offAt(rl.T + tf);
  const led = rl.shoot(o.x, C.FACE_Y + o.y, 0, 0, 1);
  rl.wind = 0; const o2 = rl.offAt(rl.T), still = rl.shoot(o2.x - 0.45 * Math.sign(rl.offAt(rl.T + tf).x - o2.x || 1), C.FACE_Y, 0, 0, 1);
  rec('tour-rail', moved > 0.2 && led.ring >= 9 && rl.arrows[0][0].hit && still.ring < led.ring, `the rail boss slides across ${(moved * 100) | 0} cm; leading it scores ${led.ring}, aiming behind it ${still.ring}`);
}
// 12e. THINK BOX: crates stop an arrow (0, kept in the crate), the window lets it through, a STAR BOX breaks for a 10
// once an end, a cart blocks the gold only while it is in front of it; the world opens off the world 1 boss
{
  const shot = (m, x, y) => { m.wind = 0; m._gust = () => { m.wind = 0; }; return m.shoot(x, y, 0, 0, 1); };
  const pe = new K.Stage({ level: 24, seed: 2 }), gold = shot(pe, 0, C.FACE_Y), wall = shot(pe, 0.4, C.FACE_Y), stuck = pe.arrows[0][1].hit;
  const sb = new K.Stage({ level: 25, seed: 2 }), b = sb.boxes.find(x => x.star), bx = (b.x0 + b.x1) / 2, by = (b.y0 + b.y1) / 2;
  const s1 = shot(sb, bx, by), s2 = shot(sb, bx, by); shot(sb, 0, C.FACE_Y); const s3 = shot(sb, bx, by);       // the third arrow closes the end; next end it is back
  const sh = new K.Stage({ level: 26, seed: 5 }), s0 = K.Flight.solve(sh.dist, 0, C.FACE_Y), tf = K.Flight.run(sh.dist - K.BOXZ, s0.yaw, s0.pitch, C.V0, 0).hit.t;
  const off = () => Math.abs(sh.boxOff(0, sh.T + tf)), find = ok => { for (let i = 0; i < 400 && !ok(off()); i++) sh.tick(0.02); };   // the cart is 60 cm wide
  find(o => o < 0.2); const blockedC = shot(sh, 0, C.FACE_Y); find(o => o > 0.4); const clearC = shot(sh, 0, C.FACE_Y);
  // the STAR BOX is whole until the arrow gets there, and still shows smashed after that arrow closes the end
  const sl = new K.Stage({ level: 25, seed: 2 }); shot(sl, 0, C.FACE_Y); shot(sl, 0, C.FACE_Y); const e0 = sl.endNo, si = sl.boxes.findIndex(x => x.star), last = shot(sl, bx, by);
  const timing = last.star && sl.endNo === e0 + 1 && !sl.boxGone(si, e0, sl.T) && sl.boxGone(si, e0, sl.T + last.hit.t) && !sl.boxGone(si);
  // an arrow over the wall (no boss behind it there) flies on rather than hanging in the air; one that gets in through
  // a window but clips the crates' sides further back is still blocked
  const ov = new K.Stage({ level: 24, seed: 2 }), over = shot(ov, 0.6, 2.4), gone = ov.arrows[0][0].hit === null && over.miss && !over.blocked;
  const jb = new K.Stage({ level: 24, seed: 2 }), zb = jb.dist - K.BOXZ + K.BOXD, jam = shot(jb, 0.123, C.FACE_Y), deep = jam.blocked && jam.hit.z === zb;
  const D = { tour: { stars: Array(30).fill(0) } }, closed = K.tourOpen(24, D); D.tour.stars[23] = 3; const not23 = K.tourOpen(24, D); D.tour.stars[5] = 1;
  rec('think-box', gold.ring >= 9 && !gold.blocked && wall.blocked && wall.ring === 0 && stuck && stuck.z === pe.dist - K.BOXZ && stuck.bi >= 0 && s1.star && s1.ring === 10 && !s2.star && s2.ring === 0 && s3.star && blockedC.blocked && !clearC.blocked && clearC.ring >= 9 && !closed && !not23 && K.tourOpen(24, D) && !K.tourOpen(25, D) && timing && gone && deep,
    `the window scores ${gold.ring}, the crates stop a shot dead (kept in the crate); the STAR BOX scores ${s1.ring} once an end (then ${s2.ring}, back next end); the cart blocks the gold, then clears for a ${clearC.ring}; THINK BOX opens off the Village Cup; the STAR BOX smashes when the arrow arrives (${timing}); over the wall flies on (${gone}); a window shot that clips the jamb is blocked (${deep})`);
}
// 12c. GEAR: kit opens on your star total (levels + ranges) and is never spent; the tutorial's hold-off is exact
{
  const D = { tour: { stars: Array(30).fill(0) }, stars: [0, 0, 0, 0] }, G = K.GEAR;
  const first = ['bow', 'fletch', 'sight'].every(k => K.gearOpen(k, 0, D) && !K.gearOpen(k, 1, D) && G[k].every((g, i) => !i || g.need > G[k][i - 1].need));
  D.tour.stars.fill(2, 0, 4); D.stars[1] = 3;                                         // 11 stars
  const opened = K.gearBetween(5, K.starTotal(D)).map(g => g.name).join(', ');
  const m = new K.Stage({ level: 1, seed: 4 }); m.wind = 2.3; const h = K.Bot.hold(m), s0 = K.Flight.solve(m.dist, h.x, h.y), r = K.Flight.run(m.dist, s0.yaw, s0.pitch, C.V0, m.wind).hit;
  rec('gear-and-hold', first && K.starTotal(D) === 11 && K.gearOpen('bow', 1, D) && !K.gearOpen('bow', 2, D) && opened === 'BLACK CARBON, LIME' && Math.hypot(r.x, r.y - C.FACE_Y) < 0.002,
    `starting kit is open, the rest locked; 11 stars open ${opened} (crossing from 5); aiming at the tutorial's hold-off lands ${(Math.hypot(r.x, r.y - C.FACE_Y) * 1000).toFixed(1)} mm from centre`);
}
// 13. persistence
{
  const store = {};
  const ls = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
  const K2 = loadKAR(['util.js'], ls);
  K2.Store.data.dist = 3; K2.Store.data.best[2] = 111; K2.Store.data.stars[2] = 2; K2.Store.data.mode = 2; K2.Store.data.trickBest = 4200; K2.Store.data.swingBest = 97; K2.Store.data.daily = { day: 4, best: 3100, plays: 2, first: 2500 }; K2.Store.data.tour.stars[4] = 2; K2.Store.data.tour.best[4] = 99; K2.Store.data.tourLv = 5; K2.Store.data.gear.bow = 3; K2.Store.data.tut = 5; K2.Store.save();
  const K3 = loadKAR(['util.js'], ls); K3.Store.load();
  rec('store', K3.Store.data.dist === 3 && K3.Store.data.best[2] === 111 && K3.Store.data.stars[2] === 2 && K3.Store.data.mode === 2 && K3.Store.data.trickBest === 4200 && K3.Store.data.swingBest === 97 && K3.Store.data.daily.best === 3100 && K3.Store.data.daily.first === 2500 && K3.Store.data.tour.stars[4] === 2 && K3.Store.data.tour.best[4] === 99 && K3.Store.data.tourLv === 5 && K3.Store.data.gear.bow === 3 && K3.Store.data.tut === 5, 'distance, best scores, stars, BALLOON POP mode and best, level progress, gear and tutorial progress survive a reload');
  // a save from the old 15-level tour: each level's stars and best move to where that level now sits, so nothing is lost or re-locked
  const old = { stars: [3, 2, 1, 3, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0], best: [54, 70, 60, 80, 99, 50, 52, 0, 0, 0, 0, 0, 0, 0, 0] }, ls2 = { s: JSON.stringify({ tour: old, tourLv: 6 }), getItem() { return this.s; }, setItem(k, v) { this.s = v; } };
  const K4 = loadKAR(['util.js', 'sim.js'], ls2); K4.Store.load(); const T4 = K4.Store.data.tour;
  const moved = old.stars.every((v, i) => T4.stars[K4.TOUR_V1[i]] === v) && T4.best[5] === 99 && T4.stars[4] === 0 && K4.Store.data.tourLv === 7 && K4.TOUR[7].name === 'ROPE SWING' && K4.tourOpen(5, K4.Store.data) && K4.tourOpen(4, K4.Store.data) && K4.tourOpen(8, K4.Store.data) && !K4.tourOpen(9, K4.Store.data);
  // a save from the 24-level tour (before THINK BOX) loads as it was, with the new world's levels empty
  const s24 = { stars: Array(24).fill(2), best: Array(24).fill(70) }, ls3 = { s: JSON.stringify({ tour: s24, tourLv: 23 }), getItem() { return this.s; }, setItem(k, v) { this.s = v; } };
  const K5 = loadKAR(['util.js', 'sim.js'], ls3); K5.Store.load(); const T5 = K5.Store.data.tour;
  const kept = T5.stars.length === 30 && T5.stars.slice(0, 24).every(v => v === 2) && T5.stars.slice(24).every(v => v === 0) && T5.best[23] === 70 && K5.Store.data.tourLv === 23 && K5.tourOpen(24, K5.Store.data);
  // a corrupt save (stars out of 0..3, fractions) can't open levels or gear; the save arrays fit the Tour
  const ls4 = { s: JSON.stringify({ tour: { stars: [99, -4, 2.5, 3], best: [500, 70] } }), getItem() { return this.s; }, setItem(k, v) { this.s = v; } };
  const K6 = loadKAR(['util.js', 'sim.js'], ls4); K6.Store.load(); const T6 = K6.Store.data.tour;
  const sane = T6.stars.slice(0, 4).join() === '0,0,0,3' && T6.best[0] === 0 && T6.best[1] === 70 && T6.stars.length === K6.TOUR.length && T6.best.length === K6.TOUR.length;
  rec('store-tour-upgrade', moved && kept && sane, 'an old 15-level save maps onto the worlds (VILLAGE CUP keeps its 2 stars as the world 1 boss, the player stays on ROPE SWING); a 24-level save keeps every star and THINK BOX is open; corrupt star/best values are dropped; the save arrays fit the Tour');
}
// TROPHIES: progress comes off the saved stats, each is announced once, and a save can't forge them
{
  const K = loadKAR(['util.js', 'sim.js', 'ach.js']), D = K.Store.data;
  const ids = new Set(K.ACH.map(a => a.id));
  const fresh = K.achNew(D).length;                                  // a new save has none
  D.stats.arrows = 1; D.stats.xs = 1; const first = K.achNew(D).map(a => a.id).join();
  const again = K.achNew(D).length;                                  // already announced
  K.TOUR.forEach((L, i) => { if (L.boss) D.tour.stars[i] = 1; });
  const boss = K.achNew(D).map(a => a.id).join();
  D.ach.bogus = 1; K.achNew(D); const dropped = !('bogus' in D.ach);
  // a hand-edited save can't hand out trophies: announced flags stay flags, stats must be whole and >= 0
  const ls = { s: JSON.stringify({ ach: { x25: 1, 'bad key!': 1, arrow1: 'yes' }, stats: { xs: 3.5, tens: -2, pops: 40 } }), getItem() { return this.s; }, setItem(k, v) { this.s = v; } };
  const K2 = loadKAR(['util.js', 'sim.js', 'ach.js'], ls); K2.Store.load(); const D2 = K2.Store.data;
  const sane = D2.ach.x25 === 1 && !('arrow1' in D2.ach) && !('bad key!' in D2.ach) && D2.stats.xs === 0 && D2.stats.tens === 0 && D2.stats.pops === 40 && K2.achCount(D2) === 0;
  rec('trophies', ids.size === K.ACH.length && K.ACH.length >= 20 && fresh === 0 && first === 'arrow1,x1' && again === 0 && boss === 'boss1,boss5' && dropped && sane,
    `${K.ACH.length} trophies (unique ids); a new save has none; the first arrow + an X unlock FIRST ARROW and DEAD CENTRE once; all bosses unlock BOSS DOWN + TOUR CHAMPION; unknown ids are dropped; a forged save can't count (fractional/negative stats are ignored, a flag without the stat isn't a win)`);
}
// BOWS & ARROWS: still-air shots land where you aim with every combination; the trade-offs are real
{
  const K = loadKAR(['util.js', 'sim.js', 'ach.js', 'quest.js']), C = K.CFG;
  const shot = (kit, wind, power, dist = 3) => { const m = new K.Match({ mode: 'range', dist, seed: 3 }); m.wind = wind; return m.shoot(0, C.FACE_Y, 0, 0, power, kit); };
  const kit = (b, a) => K.kitOf({ kit: { bow: b, arrow: a } });
  let worst = 0;
  for (let b = 0; b < 4; b++) for (let a = 0; a < 4; a++) for (let d = 0; d < 4; d++) { const r = shot(kit(b, a), 0, 1, d); worst = Math.max(worst, Math.hypot(r.hit.x, r.hit.y - C.FACE_Y)); }
  const drift = k => Math.abs(shot(k, 3, 1).hit.x) * 100;
  const club = drift(kit(0, 0)), carbon = drift(kit(0, 1)), cedar = drift(kit(0, 2)), longbow = drift(kit(1, 0)), olympic = drift(kit(2, 0));
  const drop = k => (C.FACE_Y - shot(k, 0, 0.8, 1).hit.y) * 100;
  const dClub = drop(kit(0, 0)), dX10 = drop(kit(0, 3)), dCedar = drop(kit(0, 2));
  const same = shot(null, 2, 0.9).hit.x === shot(K.KIT0, 2, 0.9).hit.x && Math.abs(K.kitSpeed(0.5, K.KIT0) - C.V0 * (0.72 + 0.28 * 0.5)) < 1e-9;
  const bowFx = K.KIT.bow[1].sway < 1 && K.KIT.bow[2].sway > 1 && K.KIT.bow[3].tire > 1;
  rec('kit-handling', worst < 0.01 && carbon < club && cedar < carbon && longbow > club && olympic < club && dX10 > dClub && dCedar < dClub && same && bowFx,
    `every bow x arrow lands within ${(worst * 100).toFixed(2)} cm of the aim in still air (each bow is sighted in); 70 m drift in a 3-unit wind: club ${club.toFixed(0)} cm, carbon ${carbon.toFixed(0)}, cedar ${cedar.toFixed(0)}, longbow ${longbow.toFixed(0)}, olympic ${olympic.toFixed(0)}; an 80% draw at 30 m drops club ${dClub.toFixed(0)} cm, X10 ${dX10.toFixed(0)}, cedar ${dCedar.toFixed(0)}; club kit = the old shot exactly; the longbow steadies the sight, the olympic twitches, the compound tires`);
}
// DAILY QUESTS + gems: three a day (same for everyone), counted, claimed once, a bonus for all three; kit costs gems
{
  const K = loadKAR(['util.js', 'sim.js', 'ach.js', 'quest.js']), D = K.Store.data;
  const p1 = K.questPick(100).join(), p2 = K.questPick(100).join(), p3 = K.questPick(101).join();
  const evs = new Set(K.questPick(100).map(id => K.questDef(id).ev));
  const Q = K.questToday(D, 100);
  // drive each of today's quests to done through its event
  for (const x of Q.q) { const d = K.questDef(x.id); if (d.max) { K.questEvent(D, d.ev, d.n - 1, 100); K.questEvent(D, d.ev, 1, 100); } K.questEvent(D, d.ev, d.n, 100); }
  const maxKept = Q.q.every(x => x.have === K.questDef(x.id).n);
  const pre = K.questClaim(D, 0, 100), gems0 = D.gems;
  const twice = K.questClaim(D, 0, 100), early = K.questBonus(D, 100);
  K.questClaim(D, 1, 100); K.questClaim(D, 2, 100);
  const sum = Q.q.reduce((a, x) => a + K.questDef(x.id).gems, 0);
  const bonus = K.questBonus(D, 100), bonusTwice = K.questBonus(D, 100), total = D.gems;
  const rolled = K.questToday(D, 101).q.every(x => x.have === 0 && !x.claimed) && K.questToday(D, 101).day === 101;
  // buying: too poor, bought (and equipped), owned
  D.gems = 20; const poor = K.kitBuy(D, 'bow', 1); D.gems = 30; const bought = K.kitBuy(D, 'bow', 1), left = D.gems, eq = D.kit.bow, again = K.kitBuy(D, 'bow', 1);
  // a save can't equip kit it doesn't own, or own kit outside the list
  const ls = { s: JSON.stringify({ gems: 12.5, kit: { bow: 3, arrow: 2 }, ownBow: 1, ownArrow: 5 + 64 }), getItem() { return this.s; }, setItem(k, v) { this.s = v; } };
  const K2 = loadKAR(['util.js', 'sim.js', 'ach.js', 'quest.js'], ls); K2.Store.load(); const D2 = K2.Store.data;
  const sane = D2.gems === 0 && D2.kit.bow === 0 && D2.kit.arrow === 0 && D2.ownArrow === 1;
  rec('daily-quests', p1 === p2 && p1 !== p3 && evs.size === 3 && maxKept && pre === 'claimed' && gems0 === K.questDef(Q.q[0].id).gems && twice === 'already' && !early && bonus && !bonusTwice && total === sum + K.QUEST_BONUS && rolled
    && poor === 'poor' && bought === 'bought' && left === 0 && eq === 1 && again === 'owned' && sane,
    `day 100 → ${p1} (same every time, different tomorrow, one per kind); events fill them, claims pay once (${sum} gems + ${K.QUEST_BONUS} bonus = ${total}), the bonus waits for all three; tomorrow rolls over; a 30-gem longbow is too dear at 20, bought and equipped at 30, then owned; a forged save can't hold fractional gems or kit it doesn't own`);
}
// THE AGENT: it reads real arrows. Shoot a 30 m range in a steady right wind three ways and it names the fault;
// the plan points at a quest, a level and a trophy; the gear tip offers kit that answers the fault
{
  const K = loadKAR(['util.js', 'sim.js', 'ach.js', 'quest.js', 'agent.js']), A = K.Agent, C = K.CFG;
  const run = (hold, power, held, seed) => {
    const m = new K.Match({ mode: 'range', dist: 1, seed }), log = [], rng = K.Util.rng(seed), w = C.FACE[1] / 20;
    for (let i = 0; i < 6; i++) {
      m.wind = 2; const r = m.shoot(-hold * m.wind, C.FACE_Y, (rng() - 0.5) * 0.02, (rng() - 0.5) * 0.02, power), h = r.hit;
      A.note(log, { dx: h ? h.x : 0, dy: h ? h.y - C.FACE_Y : 0, wind: r.wind, power, held, steady: false, ring: r.ring, short: !!r.short, w, mv: false, tire: 1 });
    }
    return A.read(log)[0].id;
  };
  // how far a centred arrow drifts at 30 m in this wind: hold that much off and the agent is happy
  const s = K.Flight.solve(30, 0, C.FACE_Y), drift = K.Flight.run(30, s.yaw, s.pitch, C.V0, 2).hit.x / 2;
  const under = run(0, 1, 1, 7), good = run(drift, 1, 1, 7), over = run(drift * 3, 1, 1, 7), short = run(drift, 0.6, 1, 7);
  const warm = A.read([]).length === 1 && A.read([])[0].id === 'warm';
  const D = K.Store.data, plan = A.plan(D, [{ id: 'under' }]).map(p => p.kind).join(',');
  D.gems = 50; const buy = A.gear(D, 'under'); D.ownArrow |= 4; const equip = A.gear(D, 'under'); D.kit.arrow = 2; const none = A.gear(D, 'under');
  const keep = A.note([], {}) && (() => { const l = []; for (let i = 0; i < 20; i++) A.note(l, { i }); return l.length === A.KEEP && l[0].i === 8; })();
  rec('agent-reads', warm && under === 'under' && good !== 'under' && good !== 'over' && over === 'over' && short === 'draw' && plan === 'quest,level,trophy,gear' && /buy it now/.test(buy) && /equip/.test(equip) && none === null && keep,
    `no hold-off → "${under}", the right hold-off → "${good}", 3x too much → "${over}", a 60% draw → "${short}"; plan = ${plan}; gear tip: buy → equip → nothing once it's on; keeps the last ${A.KEEP} arrows`);
}
// ASK ROBIN: answers worked out from your own game; a round debrief; the remembered arrows survive a reload, and a bad save is dropped
{
  const ls = { s: null, getItem() { return this.s; }, setItem(k, v) { this.s = v; } };
  const K = loadKAR(['util.js', 'sim.js', 'ach.js', 'quest.js', 'agent.js'], ls), A = K.Agent, D = K.Store.data;
  const shot = (dx, ring) => ({ dx, dy: 0, wind: 2, power: 1, held: 1, steady: false, ring, short: false, w: 0.04, mv: false, tire: 1 });
  const log = []; for (let i = 0; i < 5; i++) A.note(log, shot(0.12, 7));
  const wind = A.answer('wind', D, log), kit = A.answer('kit', D, log), stars = A.answer('stars', D, log), me0 = A.answer('me', D, []);
  D.stats.arrows = 100; D.stats.tens = 25; const me = A.answer('me', D, log);
  const d18 = A.drift(0), d50 = A.drift(2), deb = A.debrief(log), none = A.debrief(log.slice(0, 2));
  D.agentLog = log; K.Store.save();
  const raw = JSON.parse(ls.s); raw.agentLog.push({ dx: 'x' }, { dx: 9e9, dy: 0, wind: 0, power: 1, held: 0, w: 0.04, tire: 1, ring: 3 }, null);
  ls.s = JSON.stringify(raw); const K2 = loadKAR(['util.js', 'sim.js', 'ach.js', 'quest.js', 'agent.js'], ls); K2.Store.load();
  const kept = K2.Store.data.agentLog;
  rec('agent-asks', /downwind: aim off more/.test(wind) && d50 > d18 && d18 > 0 && /HEAVY CEDAR/.test(kit) && /LEVEL 1 FIRST ARROWS/.test(stars) && /54 points/.test(stars) && /haven.t shot/.test(me0) && /25 tens \(25%\)/.test(me)
    && deb && /AVG 7.0/.test(deb.head) && /WIND/.test(deb.line) && none === null && kept.length === 5 && kept[0].dx === 0.12,
    `wind answer reads your drift (wind 2: ${d18.toFixed(1)} rings at 18 m, ${d50.toFixed(1)} at 50 m) and says "aim off more"; kit points at HEAVY CEDAR; 3 stars = 54 on level 1; how-am-I-doing counts tens; debrief "${deb && deb.head} · ${deb && deb.line}"; 5 arrows survive a reload, 3 forged ones are dropped`);
}
// PACE, gems for new stars, the DAY STREAK, and the AIM SPEED setting (all saved and checked on load)
{
  const ls = { s: null, getItem() { return this.s; }, setItem(k, v) { this.s = v; } };
  const L = () => loadKAR(['util.js', 'sim.js', 'ach.js', 'quest.js', 'agent.js'], ls), K = L(), D = K.Store.data;
  const m = new K.Match({ mode: 'range', dist: 0, seed: 3 }), p0 = m.pace(120);
  for (let i = 0; i < 3; i++) m.shoot(0, C.FACE_Y, 0, 0, 1);
  const pa = m.pace(120), pb = m.pace(0), mine = m.total(0);
  const g0 = D.gems, g1 = K.starGems(D, 1, 3), g2 = K.starGems(D, 3, 2), paid = D.gems - g0;
  const days = [10, 11, 12, 12, 13, 14, 15, 16, 18].map(d => { const r = K.playDay(D, d); return r ? r.n + ':' + r.gems : '-'; }).join(' ');
  const now18 = K.streakNow(D, 18), now19 = K.streakNow(D, 19), now20 = K.streakNow(D, 20), best = D.streak.best;
  D.aimSpeed = 2; K.Store.save();
  const K2 = L(); K2.Store.load(); const kept = K2.Store.data.aimSpeed === 2 && K2.Store.data.streak.n === 1 && K2.Store.data.streak.best === 7;
  const raw = JSON.parse(ls.s); raw.aimSpeed = 7; raw.streak = { day: 20, n: 500, best: 500 }; ls.s = JSON.stringify(raw);
  const K3 = L(); K3.Store.load(); const bad = K3.Store.data.aimSpeed === 1 && K3.Store.data.streak.n === 0;
  rec('pace-gems-streak', p0 === null && pa === mine - 24 && pb === null && g1 === 10 && g2 === 0 && paid === 10
    && days === '1:0 2:0 3:15 - 4:0 5:0 6:0 7:40 1:0' && now18 === 1 && now19 === 1 && now20 === 0 && best === 7 && kept && bad && K.CFG.TOUCH_GAINS[1] === K.CFG.TOUCH_GAIN,
    `pace after 3 arrows (${mine}) vs a 120 best = ${pa}; 1→3 stars pays ${g1} gems, a worse round 0; days 10..16 then 18 → ${days}; streak shows 1 on the next day, 0 after a missed one; AIM SPEED + streak survive a reload, a forged 500-day streak and AIM 7 are dropped`);
}
const failed = R.filter(r => !r.pass).length;
console.log(`\n=== ${R.length - failed}/${R.length} passed ===`);
process.exit(failed ? 1 : 0);
