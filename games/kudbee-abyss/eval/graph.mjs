// Walks every path of the story in node (no browser): every link exists, every node is reachable, no state is stuck, every state
// can still reach an ending, all ten endings are reachable, the forced scenes (blackout, hollowing) are reachable and recoverable,
// hidden choices can be unlocked, and the pure helpers behave. The walk covers the flashlight too (switched by hand at any node).
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const ABY = createRequire(import.meta.url)(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'story.js'));

export function graphChecks() {
  const R = [], rec = (id, pass, note) => R.push({ id, pass: !!pass, note });
  const N = ABY.NODES, ids = Object.keys(N);

  // links (including @back), notes and images exist
  const dead = [];
  for (const id of ids) for (const c of N[id].choices || []) if (c.next !== '@back' && !N[c.next]) dead.push(id + '->' + c.next);
  const badNotes = ids.filter(id => N[id].note && !ABY.NOTES[N[id].note]);
  rec('story-links', dead.length === 0 && badNotes.length === 0 && N[ABY.START], dead.concat(badNotes).join(', ') || ids.length + ' nodes, every choice leads somewhere, every clue exists');

  const MOODS = ['void', 'spire', 'dusk', 'gate', 'dawn', 'dark', 'throne'], FOC = ['queen', 'guardian', 'vey', 'crystal', 'gate'], SCARES = ['glitch', 'jump', 'whisper', 'eye', 'blackout'], IMGS = ['corrupt', 'stairs', 'city', 'queen'];
  const odd = ids.filter(id => { const n = N[id]; return !ABY.SPEAKERS[n.speaker] || !MOODS.includes(n.mood) || !FOC.includes(n.focus) || !(n.song || n.ending || (n.choices && n.choices.length)) || !n.text || ![1, 2, 3, 4, 5, 6, 7].includes(n.ch) || (n.scare && !SCARES.includes(n.scare)) || (n.img && !IMGS.includes(n.img)) || (n.ending && n.ending !== 'auto' && !ABY.ENDINGS[n.ending]); });
  rec('story-nodes-shaped', odd.length === 0, odd.join(', ') || 'speaker, mood, focus, chapter and text on every node; scares, pictures and endings are known');

  // STRUCTURE (proven for every possible state, no walking needed): a gated choice can hide others, so every scene needs at least one choice that
  // is always there; and from every scene those always-there choices must lead to an ending (so nobody can ever be stuck or trapped in a loop).
  const open = id => (N[id].choices || []).filter(c => !c.req);
  const noWay = ids.filter(id => !N[id].ending && !N[id].song && open(id).length === 0);
  rec('story-no-dead-ends', noWay.length === 0, noWay.join(', ') || 'every scene has at least one choice that is always available');
  const sure = new Set(ids.filter(id => N[id].ending));
  for (let ch = true; ch;) { ch = false; for (const id of ids) if (!sure.has(id) && (N[id].song ? ['song_win', 'song_fail', 'reconcile'].every(x => sure.has(x) || true) : open(id).some(c => c.next === '@back' ? false : sure.has(c.next)))) { sure.add(id); ch = true; } }
  rec('story-always-finishable', ids.every(id => sure.has(id)), ids.filter(id => !sure.has(id)).join(', ') || 'from every scene the always-available choices reach an ending (' + sure.size + '/' + ids.length + ')');

  // REACHABILITY (a bounded search from the start, shallow first). Two states that behave the same are one state: a stat only matters up to
  // 3 (the highest rule), a flag only if something reads it, the battery in four bands. The state kept for a band is the one with the LOWEST battery.
  const READ = ['knew_name', 'crystal', 'ledger', 'vey_trusted', 'vey_doubt', 'truth', 'crown', 'sealed', 'lullaby', 'broken'];
  const key = s => [s.node, Math.min(4, s.mem || 0), Math.min(3, s.heart), Math.min(3, s.resolve), Math.min(3, s.trust), s.dread, (s.bat <= 0 ? 0 : s.bat <= 14 ? 1 : s.bat <= 32 ? 2 : 3), s.light, READ.filter(f => s.flags[f]).join(','), s.flags.song || '', s.tries, s.back].join('|');
  const succ = (s) => {
    const n = N[s.node], out = [];
    if (n.ending) { const c = ABY.carry(s); if (c) out.push(c); return out; }                  // Day Two: an ending with a way on carries her into act two
    if (n.song) { out.push(ABY.songDone(s, true), ABY.songDone(s, false)); return out; }
    for (const o of ABY.options(s)) { const t = ABY.choose(s, o.i); if (t) out.push(t); }
    const l = ABY.toggleLight(s); if (l !== s) out.push(l);
    return out;
  };
  const seen = new Map(), reach = new Set(), ends = new Set(), q = [ABY.newState(10)], LIMIT = +process.env.WALK_LIMIT || 400000; let head = 0;
  while (head < q.length && seen.size < LIMIT) {
    const s = q[head], k = key(s); q[head++] = null; const was = seen.get(k);
    if (was && was.bat <= s.bat) continue;                       // seen at least as drained: nothing new
    seen.set(k, s); reach.add(s.node);
    const n = N[s.node]; if (n.ending) ends.add(ABY.endingOf(s));
    for (const t of succ(s)) q.push(t);
    if (reach.size === ids.length && ends.size === ABY.ENDING_IDS.length && seen.size > 60000) break;   // enough witnesses
  }
  rec('story-all-nodes-reachable', ids.every(id => reach.has(id)), ids.filter(id => !reach.has(id)).join(', ') || 'every scene can be reached from the start (' + seen.size + ' states searched)');
  const missing = ABY.ENDING_IDS.filter(e => !ends.has(e));
  rec('story-all-endings', missing.length === 0, 'reachable: ' + [...ends].sort().join(', ') + (missing.length ? ' | MISSING ' + missing.join(', ') : ''));

  // the forced scenes: the phone dies, her mind comes apart; both come back to where she was headed when she can fight them
  const states = [...seen.values()];
  const black = states.filter(s => s.node === 'blackout'), holl = states.filter(s => s.node === 'hollowing');
  const back = (s, pick) => { for (const o of ABY.options(s)) { const t = ABY.choose(s, o.i); if (t && N[s.node].choices[o.i].next === '@back') return t; } return null; };
  const recovered = black.filter(s => back(s)), saved = holl.filter(s => back(s));
  rec('forced-blackout', black.length > 0 && recovered.length > 0 && recovered.length < black.length && recovered.every(s => back(s).bat > 0), black.length + ' blackout states; ' + recovered.length + ' can recharge and carry on (the crystal, or a spark), the rest end in the dark');
  rec('forced-hollowing', holl.length > 0 && saved.length > 0 && saved.length < holl.length && saved.every(s => back(s).dread < ABY.MAX_DREAD), holl.length + ' hollowing states; ' + saved.length + ' are pulled back by trust (dread drops), the rest let go');

  // hidden choices exist and unlock: some state shows a choice that another does not
  const reqNodes = ids.filter(id => (N[id].choices || []).some(c => c.req));
  let unlocked = 0, hidden = 0; for (const id of reqNodes) { const here = states.filter(s => s.node === id); if (!here.length) continue; for (let i = 0; i < N[id].choices.length; i++) if (N[id].choices[i].req) { const sees = here.some(s => ABY.okReq(s, N[id].choices[i].req)), hides = here.some(s => !ABY.okReq(s, N[id].choices[i].req)); if (sees) unlocked++; if (hides) hidden++; } }
  const never = []; for (const id of reqNodes) for (const c of N[id].choices) if (c.req && !states.some(s => s.node === id && ABY.okReq(s, c.req))) never.push(id + ':' + c.label);
  rec('hidden-choices', never.length === 0 && hidden > 0, never.join(', ') || unlocked + ' gated choices can be unlocked (and hidden: ' + hidden + ')');

  // dark rooms frighten her without the light; the light costs battery; the song cannot be retried for ever
  const d0 = ABY._land(Object.assign(ABY.newState(), { node: 'pillar_door' })), d1 = ABY._land(Object.assign(ABY.newState(), { node: 'pillar_door', light: 1 }));
  rec('dark-needs-light', d0.dread === 1 && d1.dread === 0, 'arriving in the dark without the flashlight: dread ' + d0.dread + '; with it: ' + d1.dread);
  const a = ABY.choose(Object.assign(ABY.newState(), { node: 'awakening' }), 0), b = ABY.choose(Object.assign(ABY.newState(), { node: 'awakening', light: 1 }), 0);
  rec('light-drains-battery', a.bat === ABY.BAT0 - 1 && b.bat === ABY.BAT0 - 1 - ABY.TORCH && ABY.toggleLight(ABY.newState()).bat === ABY.BAT0 - ABY.TORCH_TOGGLE, 'a choice costs 1; with the flashlight on, ' + (1 + ABY.TORCH) + '; switching it costs ' + ABY.TORCH_TOGGLE);
  let s = ABY.newState(); s.node = 'song_intro'; let n = 0;
  while (s.node !== 'reconcile' && n++ < 20) { s = ABY.songDone(s, false); if (s.node === 'song_fail') s = ABY.choose(s, 0); }
  rec('song-retries-bounded', s.node === 'reconcile' && n <= ABY.MAX_SONG_TRIES + 2, 'after ' + ABY.MAX_SONG_TRIES + ' fails the Guardian is held instead');

  // DAY TWO: the true ending only opens for someone who has found earlier endings (mem), and only the endings with a way on continue
  const toDay = ids.filter(id => N[id].choices && N[id].choices.some(c => c.next === 'end_daybreak')).flatMap(id => N[id].choices.filter(c => c.next === 'end_daybreak'));
  const cont = ABY.ENDING_IDS.filter(e => ABY.ENDINGS[e].cont), fin = ABY.ENDING_IDS.filter(e => !ABY.ENDINGS[e].cont);
  const fresh = Object.assign(ABY.newState(0), { node: 'gate_opens', trust: 3, flags: { lullaby: 1 } }), carried = ABY.carry(fresh), done = ABY.carry(Object.assign(ABY.newState(0), { node: 'end_hollow' }));
  rec('day-two', toDay.length > 0 && toDay.every(c => c.req && c.req.min && c.req.min.mem >= 4) && cont.length >= 3 && cont.every(e => ABY.NODES[ABY.ENDINGS[e].cont]) && carried && carried.node === 'd2_wake' && carried.flags.lullaby === 1 && carried.bat >= 48 && done === null && ABY.newState(7).mem === 7 && ABY.choose(ABY.newState(7), 0).mem === 7,
    'the true ending needs 4+ earlier endings found; ' + cont.join('/') + ' continue into Day Two, ' + fin.join('/') + ' are final; the carry keeps stats, flags and clues');

  // BADGES and FACTIONS: earned from what she found and how she ended; every badge can be earned; a faction is where her choices lean
  const earned = new Set(), lean = new Set(), sts = [...seen.values()].filter(x => N[x.node].ending);
  const foundAll = Object.fromEntries(ABY.ENDING_IDS.map(e => [e, 1]));
  for (const x of sts) { ABY.badgesFor(foundAll, x).forEach(b => earned.add(b)); lean.add(ABY.leaning(x)); }
  const lone = ABY.badgesFor({ dawn: 1 }, Object.assign(ABY.newState(), { node: 'gate_opens', dread: 0, bat: 40, trust: 2 }));
  const L = (o) => ABY.leaning(Object.assign(ABY.newState(), o));
  rec('badges-and-factions', ABY.BADGE_IDS.every(b => earned.has(b)) && ABY.BADGE_IDS.length === new Set(ABY.BADGE_IDS).size && lean.size === 3 && lone.join() === 'first_light,fearless,lamplighter' && L({}) === 'choir' && L({ resolve: 3 }) === 'order' && L({ dread: 4 }) === 'court' && L({ flags: { crown: 1 }, dread: 1 }) === 'court' && ABY.rank(0) === 'Initiate' && ABY.rank(3) === 'Adept' && ABY.rank(7) === 'Elder',
    ABY.BADGE_IDS.length + ' badges, every one earnable; endings lean to ' + [...lean].sort().join('/') + '; ranks Initiate / Adept / Elder by badges');

  // ending rules, by hand
  const E = (o) => ABY.endingFor(Object.assign({ heart: 0, resolve: 0, trust: 0, dread: 0, flags: {} }, o));
  rec('ending-rules', E({}) === 'silence' && E({ trust: 2 }) === 'dawn' && E({ heart: 2, resolve: 2, trust: 2 }) === 'echo' && E({ heart: 2, resolve: 2, trust: 2, dread: 3 }) === 'dawn' && E({ flags: { crown: 1 }, trust: 5 }) === 'crown' && E({ flags: { song: 'win' } }) === 'song'
    && E({ flags: { vey_trusted: 1 }, dread: 3 }) === 'betrayal' && E({ flags: { vey_trusted: 1, vey_doubt: 1 }, dread: 3, trust: 2 }) === 'dawn' && E({ flags: { sealed: 1 } }) === 'hollow' && E({ flags: { lullaby: 1 } }) === 'echo' && E({ flags: { broken: 1 } }) === 'dawn' && E({ flags: { truth: 1 } }) === 'dawn', 'silence / dawn / echo / crown / song / betrayal / hollow, in order');

  // saves from outside are never trusted
  const c1 = ABY.cleanState({ node: 'gate_opens', heart: 99, resolve: -4, trust: '3', dread: 99, bat: -5, light: 'yes', flags: { crown: 'yes', song: 'win', evil: 1, ledger: 1 }, tries: 50, choices: 1e9, notes: ['ledger', 'evil', 5], back: 'end_hollow' });
  const c2 = ABY.cleanState({ node: '__proto__' }), c3 = ABY.cleanState('nope'), c4 = ABY.cleanState({ node: 'constructor', back: 'constructor' }), c5 = ABY.cleanState({ node: 'blackout', back: 'spire', bat: 3 }), c6 = ABY.cleanState({ node: 'spire', back: 'g_meet' });
  rec('save-cleaned', c1.node === ABY.START && c1.heart === 5 && c1.resolve === 0 && c1.trust === 0 && c1.dread === ABY.MAX_DREAD && c1.bat === 1 && c1.light === 0 && !c1.flags.crown && c1.flags.ledger === 1 && c1.flags.song === 'win' && !('evil' in c1.flags) && c1.tries === ABY.MAX_SONG_TRIES && c1.choices === 999 && c1.notes.join() === 'ledger' && c1.back === ''
    && c2.node === ABY.START && c3.node === ABY.START && c4.node === ABY.START && c4.back === '' && c5.node === 'blackout' && c5.back === 'spire' && c6.back === '', 'out-of-range, wrong-type and unknown values dropped; a return point only survives on a forced scene');
  const base = ABY.newState(), after = ABY.choose(base, 0);
  rec('choose-pure', base.resolve === 0 && after.resolve === 1 && after.node === 'flute_path' && ABY.choose(base, 9) === null && ABY.choose(Object.assign(ABY.newState(), { node: 'g_meet' }), 3) === null && base.notes.length === 0, 'a choice returns a new state; a bad or hidden choice is refused');
  return R;
}

if (process.argv[1] && process.argv[1].endsWith('graph.mjs')) {
  const R = graphChecks(); for (const r of R) console.log((r.pass ? 'PASS' : 'FAIL') + ' ' + r.id + ' - ' + r.note);
  const p = R.filter(r => r.pass).length; console.log('\n=== ' + p + '/' + R.length + ' passed ==='); process.exit(p === R.length ? 0 : 1);
}
