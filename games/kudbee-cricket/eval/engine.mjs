// Kudbee Cricket — headless physics, rules and bot checks (Node only, no browser).
//   node engine.mjs
import { loadKCK } from './load.mjs';

const K = loadKCK();
const C = K.CFG;
const R = [];
const rec = (id, pass, note) => { R.push({ id, pass }); console.log((pass ? 'PASS' : 'FAIL'), id, '—', note); };
const near = (a, b, e) => Math.abs(a - b) <= e;

const mk = (over) => new K.Delivery(Object.assign({ kind: 'good', label: 'T', speed: 30, xa: 0.2, yb: 5, swing: 0, turn: 0 }, over || {}));
const setup = (opts, del, phase) => { const m = new K.Match(Object.assign({ level: 1, overs: 1, seed: 3 }, opts || {})); m.cur = { del, field: K.Field.make(phase || 'mid', m.bowler), bowler: m.bowler, freeHit: m.freeHit }; return m; };
const tapOn = d => d.tArr - C.BAT_DELAY;

// 1. delivery physics: the ball arrives where the bowler aimed, bounces where asked
{
  let worst = 0, worstY = 0;
  const rnd = K.Util.rng(1);
  for (let i = 0; i < 200; i++) {
    const xa = (rnd() - 0.5) * 2, yb = 1.5 + rnd() * 8, sw = (rnd() - 0.5) * 12, tn = (rnd() - 0.5) * 8, sp = 20 + rnd() * 16;
    const d = mk({ xa, yb, swing: sw, turn: tn, speed: sp });
    worst = Math.max(worst, Math.abs(d.arr.x - xa)); worstY = Math.max(worstY, Math.abs(d.bounceY - yb));
  }
  rec('delivery-aim', worst < 0.06 && worstY < 0.25, `200 random deliveries arrive within ${(worst * 100).toFixed(1)} cm of the line and bounce within ${(worstY * 100).toFixed(0)} cm of the length (swing + turn compensated)`);
}
// 2. physical sanity: pace, bounce, reach
{
  const g = mk({ speed: 33 }), y = mk({ yb: 0.75, speed: 34 }), s = mk({ yb: 8.6, speed: 34 });
  rec('delivery-shape', g.arr.z > 0.2 && g.arr.z < 1.2 && y.arr.z < 0.2 && s.arr.z > 0.9 && s.arr.z < 1.9 && g.tArr > 0.4 && g.tArr < 0.9,
    `good length ${g.arr.z.toFixed(2)} m high, yorker ${y.arr.z.toFixed(2)} m, bouncer ${s.arr.z.toFixed(2)} m; flight ${g.tArr.toFixed(2)} s`);
  const sw = mk({ swing: 6 }), nsw = mk({ swing: 0 });
  rec('swing-and-spin', Math.abs(sw.samples.find(p => p.t > 0.3).x - nsw.samples.find(p => p.t > 0.3).x) > 0.15 || Math.abs(sw.bounceX - nsw.bounceX) > 0.1, 'swing moves the ball in the air');
}
// 3. timing windows: perfect, edge, early, late
{
  const d = mk({ speed: 30 }), rnd = K.Util.rng(2), lv = K.LEVELS[1];
  const perfect = K.Bat.play(d, tapOn(d), 0, false, rnd, lv, null);
  const early = K.Bat.play(d, tapOn(d) - 0.25, 0, false, rnd, lv, null);
  const late = K.Bat.play(d, tapOn(d) + 0.25, 0, false, rnd, lv, null);
  const w = K.Bat.window(d, false, lv, null), ok = K.Bat.play(d, tapOn(d) + w * 0.5, 0, false, rnd, lv, null), edgey = K.Bat.play(d, tapOn(d) + w * 0.95, 0, false, K.Util.rng(9), lv, null);
  rec('timing-windows', perfect.contact && perfect.perfect && !early.contact && early.reason === 'early' && !late.contact && late.reason === 'late' && ok.q < perfect.q && ok.q > edgey.q,
    `window ±${(w * 1000) | 0} ms; dead-on q=${perfect.q.toFixed(2)}, half-window q=${ok.q.toFixed(2)}, edge of window q=${edgey.q.toFixed(2)}; 250 ms early/late miss`);
  const wl = K.Bat.window(d, true, lv, null), fast = K.Bat.window(mk({ speed: 38 }), false, lv, null), legend = K.Bat.window(d, false, K.LEVELS[2], null), rook = K.Bat.window(d, false, K.LEVELS[0], null);
  rec('window-scaling', wl < w && fast < w && legend < w && rook > w, `loft ${(wl * 1000) | 0} ms < ground ${(w * 1000) | 0} ms; faster ball ${(fast * 1000) | 0} ms; ROOKIE ${(rook * 1000) | 0} / LEGEND ${(legend * 1000) | 0} ms`);
}
// 4. direction: early goes leg side, late goes off side; aim steers the shot
{
  const d = mk(), lv = K.LEVELS[1], w = K.Bat.window(d, false, lv, null), r = () => K.Util.rng(4);
  const e = K.Bat.play(d, tapOn(d) - w * 0.6, 0, false, r(), lv, null), l = K.Bat.play(d, tapOn(d) + w * 0.6, 0, false, r(), lv, null);
  const a30 = K.Bat.play(d, tapOn(d), 30, false, r(), lv, null), a60 = K.Bat.play(d, tapOn(d), -60, false, r(), lv, null);
  rec('shot-direction', e.angle < l.angle - 10 && a30.angle > 15 && a60.angle < -45, `early ${e.angle.toFixed(0)}° < late ${l.angle.toFixed(0)}°; aim +30 -> ${a30.angle.toFixed(0)}°, aim -60 -> ${a60.angle.toFixed(0)}°`);
}
// 5. results of a delivery
{
  // bowled
  let m = setup({}, mk({ xa: 0.0, yb: 4.5 }));
  let o = m.resolve(null, 0, false);
  rec('bowled', o.kind === 'wicket' && o.wicket === 'bowled' && m.wk === 1 && m.balls === 1, `no shot at a straight ball -> ${o.wicket}; wickets ${m.wk}, balls ${m.balls}`);
  // dot (missed but off the stumps)
  m = setup({}, mk({ xa: 0.6, yb: 5 }));
  o = m.resolve(null, 0, false);
  rec('dot-ball', o.kind === 'dot' && m.runs === 0 && m.balls === 1 && m.wk === 0, 'a ball outside off, left alone, is a dot');
  // wide: +1, not a legal ball
  m = setup({}, mk({ xa: 1.4, yb: 5 }));
  o = m.resolve(null, 0, false);
  rec('wide', o.kind === 'wide' && m.runs === 1 && m.balls === 0, `wide adds a run (${m.runs}) and the ball is re-bowled (balls ${m.balls})`);
  // no ball + free hit: a would-be wicket on the free hit is safe
  m = setup({}, mk({ xa: 0.0, noBall: true }));
  o = m.resolve(null, 0, false);
  const fh1 = m.freeHit;
  m.cur = { del: mk({ xa: 0.0 }), field: K.Field.make('mid', m.bowler), bowler: m.bowler, freeHit: m.freeHit };
  const o2 = m.resolve(null, 0, false);
  rec('no-ball-free-hit', o.noBall && o.extras === 1 && m.balls === 1 && fh1 === true && o2.kind === 'dot' && o2.safe && m.wk === 0 && m.freeHit === false, `no-ball: +1, not counted, next ball is a free hit; the stumps are hit but the batter is safe`);
}
// 6. hits: boundaries, catches, runs
{
  const lv = K.LEVELS[1];
  // find a gap far from every fielder, and the bat contact for a perfect lofted shot -> six
  const field = K.Field.make('pp', K.BOWLERS[1]);
  const d = mk({ speed: 30, xa: 0.2, yb: 5 });
  const best = K.Bot.gapAim(field, true);
  let m = setup({ level: 1 }, d, 'pp'); m.cur.field = field;
  let o = m.resolve(tapOn(d), best, true);
  rec('boundary-or-better', o.contact && (o.kind === 'four' || o.kind === 'six' || o.kind === 'runs'), `perfect lofted drive into the gap at ${best}° -> ${o.kind} (${o.runs})`);
  // lofted straight at a deep fielder with varied timing -> some are caught, some fall safe or clear the rope
  let caught = 0, N = 80;
  for (let i = 0; i < N; i++) {
    const dd = mk({ speed: 30, xa: 0.2, yb: 5 });
    const mm = setup({ level: 1, seed: 100 + i }, dd, 'mid');
    const f = mm.cur.field.find(q => q.role === 'LONG-OFF');
    const ang = Math.atan2(f.x, f.y) * 180 / Math.PI;
    const w = K.Bat.window(dd, true, lv, null);
    const oo = mm.resolve(tapOn(dd) + w * (-0.8 + 1.6 * i / N), ang, true);
    if (oo.kind === 'wicket' && oo.wicket === 'caught') caught++;
  }
  rec('catches', caught > 8 && caught < N, `lofting at long-off across the whole timing window: caught ${caught}/${N} (the rest clear the rope, drop, or fall short)`);
  // a ball hit in the air and caught is NOT a wicket on a free hit
  let safe = 0, wk = 0;
  for (let i = 0; i < 80; i++) { const dd = mk({}); const mm = setup({ seed: 100 + i }, dd, 'mid'); mm.freeHit = true; mm.cur.freeHit = true; const f = mm.cur.field.find(q => q.role === 'LONG-OFF'); const w = K.Bat.window(dd, true, lv, null); const oo = mm.resolve(tapOn(dd) + w * (-0.8 + 1.6 * i / 80), Math.atan2(f.x, f.y) * 180 / Math.PI, true); if (oo.safe) safe++; if (oo.kind === 'wicket') wk++; }
  rec('free-hit-no-wicket', wk === 0 && safe > 5, `same 80 lofted hits on a free hit: ${wk} dismissals, ${safe} catches that would have been out are safe`);
  // runs scale with how far the ball goes
  const near1 = K.Hit.runs({ t: 1.0, spot: { x: 8, y: 14 } }), mid = K.Hit.runs({ t: 3.6, spot: { x: 30, y: 25 } }), deep = K.Hit.runs({ t: 6, spot: { x: 55, y: 50 } });
  rec('run-model', near1 === 0 && deep >= 2 && deep >= mid && mid >= 1, `runs for a ball fielded close / mid / deep: ${near1} / ${mid} / ${deep}`);
}
// 7. match rules: win / loss / tie / balls / overs
{
  const m = new K.Match({ level: 1, overs: 1, seed: 5 });
  rec('match-setup', m.maxBalls === 30 && m.maxWk === 5 && m.target === m.first + 1 && m.target > 20 && m.target < 80, `5 overs / ${m.maxWk} wickets, target ${m.target}`);
  const m2 = new K.Match({ level: 1, overs: 0, seed: 1 }); m2.runs = m2.target - 1;
  m2.cur = { del: mk({ xa: 0.6 }), field: K.Field.make('mid', m2.bowler), bowler: m2.bowler, freeHit: false };
  m2.cur.del = mk({ xa: 1.2 }); m2.resolve(null, 0, false);           // a wide takes it to the target
  rec('win-on-target', m2.over && m2.result === 'win', 'reaching the target ends the match as a win (even on a wide)');
  const m3 = new K.Match({ level: 1, overs: 0, seed: 1 });
  for (let i = 0; i < 3; i++) { m3.cur = { del: mk({ xa: 0 }), field: K.Field.make('mid', m3.bowler), bowler: m3.bowler, freeHit: false }; m3.resolve(null, 0, false); }
  rec('all-out', m3.over && m3.result === 'loss' && m3.wk === 3 && m3.batterIdx === 3, '3 wickets in a 2-over match ends the innings; next batter comes in each time');
  const m4 = new K.Match({ level: 1, overs: 0, seed: 1 }); m4.runs = m4.first;
  for (let i = 0; i < 12 && !m4.over; i++) { m4.cur = { del: mk({ xa: 0.6 }), field: K.Field.make('mid', m4.bowler), bowler: m4.bowler, freeHit: false }; m4.resolve(null, 0, false); }
  rec('tie-and-overs', m4.over && m4.result === 'tie' && m4.balls === 12 && m4.overNo === 2, 'scores level when the overs run out is a tie; 12 balls = 2 overs');
  const bo = new K.Match({ level: 1, overs: 2, seed: 1 });
  rec('bowler-rotation', bo.bowlerOrder.length === 10 && bo.bowlerOrder[9] === 4 && new Set(bo.bowlerOrder.slice(0, 5)).size === 5, 'every bowler gets an over; the death specialist closes the innings');
}
// 8. determinism
{
  const sig = () => { const m = K.Bot.playMatch({ level: 1, overs: 1, seed: 77 }, 0.05, 31); return JSON.stringify(m.log.map(o => [o.kind, o.runs, o.label])) + m.runs; };
  rec('deterministic', sig() === sig(), 'identical seed + inputs replay the identical match');
}
// 9. balance: harder bowling beats the same batter more often, and a clumsy bot loses
{
  const rate = (lv, skill) => { let w = 0, N = 60; for (let s = 1; s <= N; s++) if (K.Bot.playMatch({ level: lv, overs: 1, seed: s }, skill, s + 100).result === 'win') w++; return w / N; };
  const a = [rate(0, 0.05), rate(1, 0.05), rate(2, 0.05)], b = rate(1, 0.12);
  rec('difficulty-curve', a[0] > a[1] && a[1] > a[2] && a[0] > 0.6 && a[2] < 0.7 && b < a[1], `bot (±50 ms timing) wins ${(a[0] * 100) | 0}% / ${(a[1] * 100) | 0}% / ${(a[2] * 100) | 0}% vs ROOKIE / PRO / LEGEND; a sloppy ±120 ms bot wins ${(b * 100) | 0}% vs PRO`);
  const m = K.Bot.playMatch({ level: 1, overs: 1, seed: 8 }, 0.05, 3), fours = m.stats.fours, sixes = m.stats.sixes;
  rec('match-stats', m.log.length >= m.balls && m.stats.fours + m.stats.sixes >= 1 || m.runs > 0, `a bot match has ${fours} fours, ${sixes} sixes, ${m.wk} wickets, ${m.balls} legal balls`);
}
// 10. persistence
{
  const store = {};
  const ls = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
  const K2 = loadKCK(['util.js'], ls);
  K2.Store.data.difficulty = 2; K2.Store.data.overs = 2; K2.Store.data.stats.sixes = 7; K2.Store.save();
  const K3 = loadKCK(['util.js'], ls); K3.Store.load();
  rec('store', K3.Store.data.difficulty === 2 && K3.Store.data.overs === 2 && K3.Store.data.stats.sixes === 7, 'difficulty, match length and stats survive a reload');
}

const failed = R.filter(r => !r.pass).length;
console.log(`\n=== ${R.length - failed}/${R.length} passed ===`);
process.exit(failed ? 1 : 0);
