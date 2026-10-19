// Walks every path of the story in node (no browser): every link exists, every node is reachable,
// every state can still reach an ending, all five endings are reachable, and the pure helpers behave.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const ABY = createRequire(import.meta.url)(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'story.js'));

export function graphChecks() {
  const R = [], rec = (id, pass, note) => R.push({ id, pass: !!pass, note });
  const N = ABY.NODES, ids = Object.keys(N);

  // links
  const dead = [];
  for (const id of ids) for (const c of N[id].choices || []) if (!N[c.next]) dead.push(id + '->' + c.next);
  rec('story-links', dead.length === 0 && N[ABY.START], dead.join(', ') || ids.length + ' nodes, every choice leads somewhere');

  // each node is either a choice node, a song node or an ending, and speakers/moods are known
  const MOODS = ['void', 'spire', 'dusk', 'gate', 'dawn', 'dark'], FOC = ['queen', 'guardian', 'vey', 'crystal', 'gate'];
  const odd = ids.filter(id => { const n = N[id]; return !ABY.SPEAKERS[n.speaker] || !MOODS.includes(n.mood) || !FOC.includes(n.focus) || !(n.song || n.ending || (n.choices && n.choices.length)) || !n.text || ![1, 2, 3].includes(n.ch); });
  rec('story-nodes-shaped', odd.length === 0, odd.join(', ') || 'speaker, mood, focus, chapter and text on every node');

  // state-space walk (node x stats x flags x tries): every reachable state, including after each song result
  const key = s => [s.node, s.heart, s.resolve, s.trust, s.flags.crown || 0, s.flags.crystal || 0, s.flags.song || '', s.tries].join('|');
  const seen = new Map(), reach = new Set(), ends = new Set(), q = [ABY.newState()];
  let stuck = [], steps = 0;
  while (q.length) {
    const s = q.pop(), k = key(s); if (seen.has(k)) continue; seen.set(k, s); reach.add(s.node); steps++;
    const n = N[s.node];
    if (n.ending) { ends.add(ABY.endingFor(s)); continue; }
    if (n.song) { q.push(ABY.songDone(s, true), ABY.songDone(s, false)); continue; }
    if (!n.choices.length) { stuck.push(s.node); continue; }
    n.choices.forEach((c, i) => { const o = ABY.choose(s, i); if (o) q.push(o); });
  }
  rec('story-all-nodes-reachable', ids.every(id => reach.has(id)), ids.filter(id => !reach.has(id)).join(', ') || 'every node can be reached from the start');
  rec('story-no-dead-ends', stuck.length === 0, stuck.join(', ') || steps + ' states walked, none stuck');
  rec('story-all-endings', ABY.ENDING_IDS.every(e => ends.has(e)), 'reachable: ' + [...ends].sort().join(', ') + (ABY.ENDING_IDS.filter(e => !ends.has(e)).length ? ' | MISSING ' + ABY.ENDING_IDS.filter(e => !ends.has(e)).join(', ') : ''));

  // every state reaches an ending (no loop with no way out): reverse reachability
  const edges = new Map(); const keyOf = s => key(s);
  for (const [k, s] of seen) {
    const n = N[s.node], out = [];
    if (n.song) out.push(ABY.songDone(s, true), ABY.songDone(s, false));
    else if (!n.ending) n.choices.forEach((c, i) => { const o = ABY.choose(s, i); if (o) out.push(o); });
    edges.set(k, out.map(keyOf));
  }
  const good = new Set([...seen].filter(([k, s]) => N[s.node].ending).map(([k]) => k));
  for (let ch = true; ch;) { ch = false; for (const [k, outs] of edges) if (!good.has(k) && outs.some(o => good.has(o))) { good.add(k); ch = true; } }
  rec('story-always-finishable', good.size === seen.size, good.size + '/' + seen.size + ' states can reach an ending');

  // the song cannot be retried for ever
  let s = ABY.newState(); s.node = 'song_intro'; let n = 0;
  while (s.node !== 'reconcile' && n++ < 20) { s = ABY.songDone(s, false); if (s.node === 'song_fail') s = ABY.choose(s, 0); }
  rec('song-retries-bounded', s.node === 'reconcile' && n <= ABY.MAX_SONG_TRIES + 2, 'after ' + ABY.MAX_SONG_TRIES + ' fails the Guardian is held instead');

  // ending rules, by hand
  const E = (h, r, t, f) => ABY.endingFor({ heart: h, resolve: r, trust: t, flags: f || {} });
  rec('ending-rules', E(0, 0, 0) === 'silence' && E(0, 0, 2) === 'dawn' && E(2, 2, 2) === 'echo' && E(2, 2, 1) === 'silence' && E(5, 5, 5, { crown: 1 }) === 'crown' && E(5, 5, 5, { song: 'win' }) === 'song' && E(2, 2, 2, { song: 'fail' }) === 'echo', 'silence / dawn / echo / crown / song ordering');

  // saves from outside are never trusted
  const c1 = ABY.cleanState({ node: 'gate_opens', heart: 99, resolve: -4, trust: '3', flags: { crown: 'yes', song: 'win', evil: 1 }, tries: 50, choices: 1e9 });
  const c2 = ABY.cleanState({ node: '__proto__' }), c3 = ABY.cleanState('nope'), c4 = ABY.cleanState({ node: 'constructor' });
  rec('save-cleaned', c1.node === ABY.START && c1.heart === 5 && c1.resolve === 0 && c1.trust === 0 && !c1.flags.crown && c1.flags.song === 'win' && !('evil' in c1.flags) && c1.tries === ABY.MAX_SONG_TRIES && c1.choices === 999 && c2.node === ABY.START && c3.node === ABY.START && c4.node === ABY.START, 'out-of-range, wrong-type and unknown values dropped');
  const base = ABY.newState(), after = ABY.choose(base, 0);
  rec('choose-pure', base.resolve === 0 && after.resolve === 1 && after.node === 'flute_path' && ABY.choose(base, 9) === null, 'a choice returns a new state; a bad index is refused');
  return R;
}

if (process.argv[1] && process.argv[1].endsWith('graph.mjs')) {
  const R = graphChecks(); for (const r of R) console.log((r.pass ? 'PASS' : 'FAIL') + ' ' + r.id + ' - ' + r.note);
  const p = R.filter(r => r.pass).length; console.log('\n=== ' + p + '/' + R.length + ' passed ==='); process.exit(p === R.length ? 0 : 1);
}
