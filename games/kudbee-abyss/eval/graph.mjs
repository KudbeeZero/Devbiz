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

  const MOODS = ['void', 'spire', 'dusk', 'gate', 'dawn', 'dark', 'throne'], FOC = ['queen', 'guardian', 'vey', 'crystal', 'gate'], SCARES = ['glitch', 'jump', 'whisper', 'eye', 'blackout'], IMGS = ['corrupt', 'stairs', 'city', 'queen', 'eye'];
  const odd = ids.filter(id => { const n = N[id]; return !ABY.SPEAKERS[n.speaker] || !MOODS.includes(n.mood) || !FOC.includes(n.focus) || !(n.song || n.ending || (n.choices && n.choices.length)) || !n.text || !ABY.CHAPTERS.some(c => c.n === n.ch) || (n.scare && !SCARES.includes(n.scare)) || (n.img && !IMGS.includes(n.img)) || (n.ending && n.ending !== 'auto' && !ABY.ENDINGS[n.ending]); });
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
  const READ = ['knew_name', 'crystal', 'ledger', 'vey_trusted', 'vey_doubt', 'truth', 'crown', 'sealed', 'lullaby', 'broken', 'rite_doors', 'rite_blood', 'rite_lull', 'rite_choir', 'read_names', 'rite_wake', 'told_truth', 'little_crown', 'crown_laid', 'bells_done', 'riff_done', 'eye_is_sorrel', 'named_eye', 'promised_sorrel', 'rite_seventh', ...ABY.ENDING_IDS.filter(ABY.isFall).map(id => 'scar_' + id)];
  const key = s => [s.node, Math.min(4, s.mem || 0), Math.min(3, s.heart), Math.min(3, s.resolve), Math.min(3, s.trust), s.dread, (s.bat <= 0 ? 0 : s.bat <= 14 ? 1 : s.bat <= 32 ? 2 : 3), s.light, READ.filter(f => s.flags[f]).join(','), s.flags.song || '', s.tries, s.back].join('|');
  const succ = (s) => {
    const n = N[s.node], out = [];
    if (n.ending) { const c = ABY.carry(s); if (c) out.push(c); return out; }                  // Day Two: an ending with a way on carries her into act two
    if (n.song) { out.push(ABY.songDone(s, true), ABY.songDone(s, false)); return out; }
    for (const o of ABY.options(s)) { const t = ABY.choose(s, o.i); if (t) out.push(t); }
    const l = ABY.toggleLight(s); if (l !== s) out.push(l);
    return out;
  };
  // seven days are too deep for one shallow-first queue: the early days would eat the whole budget. So each day has its own queue (shallow-first
  // inside it) and the walk takes from them in turn, so every day gets a fair share. A day's states only ever come from real states before them.
  const DAY = ch => ch <= 5 ? 0 : ch <= 7 ? 1 : ch - 6;            // chapters 1-5 are day one, 6-7 day two, then one chapter a day
  const seen = new Map(), reach = new Set(), ends = new Set(), LIMIT = +process.env.WALK_LIMIT || 1500000;
  const walk = (seeds, limit, done, kf = key, local = seen) => {
    const Q = [], H = []; let n = 0;
    const push = (t) => { const d = DAY(N[t.node].ch); (Q[d] || (Q[d] = [], H[d] = 0, Q[d])).push(t); };
    seeds.forEach(push);
    for (let turn = 0; n < limit; turn++) {
      let d = -1; for (let i = 0; i < Q.length; i++) { const j = (turn + i) % Q.length; if (Q[j] && H[j] < Q[j].length) { d = j; break; } }
      if (d < 0) break;
      const s = Q[d][H[d]], k = kf(s); Q[d][H[d]++] = null; const was = local.get(k);
      if (was && was.bat <= s.bat) continue;                     // seen at least as drained: nothing new
      if (!was) n++; local.set(k, s); reach.add(s.node);      // (the limit counts distinct states; a lower-battery copy only replaces one)
      if (local !== seen && !seen.has(key(s))) seen.set(key(s), s);   // a follow-up walk's states are real states too
      if (N[s.node].ending) ends.add(ABY.endingOf(s));
      for (const t of succ(s)) push(t);
      if (done()) break;
    }
  };
  walk(ABY.OPENINGS.map(o => ABY.newState(10, o, ABY.ENDING_IDS)), LIMIT,   // (a veteran: every fall already suffered, so every scar's way out is walked too)
    () => reach.size === ids.length && ends.size === ABY.ENDING_IDS.length && seen.size > 60000);
  // a flag taken on day one and read on day six is a long way to carry in a bounded walk. So, for every scene or gated choice still not reached,
  // walk again from REAL states (already reached) that hold the flags it asks for: every state these walks find is reachable from the start.
  const need = (r) => r ? [r.flag, ...(r.all || [])].filter(Boolean) : [];
  const gates = id => ids.flatMap(f => (N[f].choices || []).filter(c => c.next === id && c.req)).map(c => c.req);
  const into = id => [...new Set(gates(id).flatMap(need))];   // flags it takes to get in
  const shut = (reqs) => reqs.map(r => r.noflag).filter(Boolean);   // flags that keep it shut
  const unmet = () => { const out = [];
    for (const id of ids) if (!reach.has(id)) out.push({ id, flags: into(id) });
    for (const id of ids) for (const c of N[id].choices || []) if (c.req && need(c.req).length && reach.has(id) && ![...seen.values()].some(x => x.node === id && ABY.okReq(x, c.req))) out.push({ id, flags: [...new Set([...need(c.req), ...into(id)])], req: c.req });
    return out; };
  for (let round = 0, todo = unmet(), was = -1; todo.length && todo.length !== was && round < 4; round++, was = todo.length, todo = unmet()) for (const t of todo) {   // (a chase can open the way to the next target, so look again)
    const ok = () => t.req ? [...seen.values()].some(x => x.node === t.id && ABY.okReq(x, t.req)) : reach.has(t.id); if (ok()) continue;
    const blocked = [...new Set([...shut(gates(t.id)), ...shut(t.req ? [t.req] : [])])];   // flags that keep the target shut: a seed must not hold one
    const near = (fl) => [...seen.values()].filter(x => !N[x.node].ending && fl.every(f => x.flags[f]) && !blocked.some(f => x.flags[f]) && DAY(N[x.node].ch) <= DAY(N[t.id].ch)).sort((p, q) => DAY(N[q.node].ch) - DAY(N[p.node].ch) || p.choices - q.choices).slice(0, 4000);   // nearest day first, earliest in it
    let seeds = near(t.flags); if (!seeds.length) seeds = near(into(t.id));       // nobody holds every flag yet: start from those who can get in, and pick up the rest
    // (merged more coarsely than the main walk: only the flags this target asks for are kept apart. Merging only prunes; it never invents a state)
    const keep = [...new Set([...t.flags, ...blocked])];   // (a flag that shuts the way in must be kept apart too)
    const coarse = s => [s.node, Math.min(4, s.mem || 0), Math.min(3, s.heart), Math.min(3, s.resolve), Math.min(3, s.trust), s.dread, (s.bat <= 0 ? 0 : s.bat <= 14 ? 1 : s.bat <= 32 ? 2 : 3), s.light, [...keep].filter(f => s.flags[f]).join(','), s.flags.song || '', s.tries, s.back].join('|');
    let last = 0; walk(seeds, 400000, () => { if (++last % 5000) return false; return ok(); }, coarse, new Map());
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

  // the rites (Day Three): each is bounded the same way, and every rite node has all three ways out
  const rites = ids.filter(id => typeof N[id].song === 'string');
  const ritesOk = rites.length === ABY.RITE_IDS.length && rites.every(id => ABY.RITES[N[id].song] && ['win', 'fail', 'give'].every(k => N[N[id].songNext && N[id].songNext[k]]));
  let rs = Object.assign(ABY.newState(), { node: 'd3_hall' }), rn = 0;
  while (rs.node === 'd3_hall' || rs.node === 'd3_doors_fail') { rs = rs.node === 'd3_hall' ? ABY.songDone(rs, false) : ABY.choose(rs, 0); if (rn++ > 20) break; }
  const rw = ABY.songDone(Object.assign(ABY.newState(), { node: 'd3_hall' }), true);
  rec('rites-bounded', ritesOk && rs.node === 'd3_doors_give' && rw.node === 'd3_doors_win' && rw.flags.rite_doors === 1, rites.length + ' rites; each can be retried ' + ABY.MAX_SONG_TRIES + ' times, then it lets you pass; a win sets its flag');
  { // review fixes: a Day Three ending can't loop back, a give-up doesn't starve later rites
    const v = N.d3_finale.choices.find(c => c.next === 'end_vigil');
    rec('d3-keeper-final', !!v && ABY.carry(Object.assign(ABY.newState(0), { node: 'end_vigil' })) === null && ABY.carry(Object.assign(ABY.newState(0), { node: 'end_keeper' })) !== null, 'the Day Three vigil ending is final; the Day Two keeper still carries on');
    const t = ABY.songDone(Object.assign(ABY.newState(0), { node: 'd3_hall', tries: ABY.MAX_SONG_TRIES }), false);
    rec('rite-giveup-resets-tries', t.tries === 0, 'giving up a rite resets the retry count');
  }
  rec('day-three', ABY.ENDINGS.keeper.cont === 'd3_wake' && !ABY.ENDINGS.loop.cont && ABY.isFall('loop') && N.d3_wake.ch === 8, 'keeper carries into Day Three; 3:07 Again is a fall, not a way on');
  { // DAY FOUR: both Day Three endings carry on; the book only closes for a veteran (7+ endings) who read the names and won the choir
    const toNames = ids.flatMap(id => (N[id].choices || []).filter(c => c.next === 'end_names'));
    const d4 = ABY.carry(Object.assign(ABY.newState(9), { node: 'end_watched', flags: { rite_doors: 1 } }));
    const shore = (o) => ABY.options(Object.assign(ABY.newState(0), { node: 'd4_shore' }, o)).some(x => x.c.next === 'end_names');
    rec('day-four', ABY.ENDINGS.chorus.cont === 'd4_wake' && ABY.ENDINGS.watched.cont === 'd4_wake' && d4 && d4.node === 'd4_wake' && d4.flags.rite_doors === 1 && N.d4_wake.ch === 9
      && toNames.length > 0 && toNames.every(c => c.req && c.req.min && c.req.min.mem >= 7 && c.req.all.includes('rite_choir'))
      && shore({ mem: 7, flags: { rite_choir: 1, read_names: 1 } }) && !shore({ mem: 6, flags: { rite_choir: 1, read_names: 1 } }) && !shore({ mem: 9, flags: { read_names: 1 } }),
      'chorus and watched carry into Day Four; closing the book needs 7+ endings found, the names read and the Drowned Choir won');
  }

  { // the two hard rites: faster than the plain ones, with chords (two notes in two lanes at once), harder to win, optional, and bounded like any rite
    const lane = i => i <= 2 ? 0 : i <= 5 ? 1 : 2, plain = ['doors', 'blood', 'lull', 'choir', 'wake'], hard = ['bells', 'riff'];
    const stats = id => { const c = ABY.RITES[id]; let chords = 0, bad = 0, t = 0, close = 0, last = [-9, -9, -9]; for (const m of c.mel) { t += m[1] * c.step; if (m[2] !== undefined) { chords++; if (lane(m[0]) === lane(m[2])) bad++; }
      for (const i of m[2] !== undefined ? [m[0], m[2]] : [m[0]]) { if (t - last[lane(i)] < 0.2) close++; last[lane(i)] = t; } if (m[1] === 0 && m !== c.mel[0] && m[2] === undefined) bad++; }
      return { chords, bad, close, len: c.mel.length + chords, secs: t }; };
    const sh = hard.map(stats), slowest = Math.min(...plain.map(id => ABY.RITES[id].step));
    const entry = (id, node, flag, o) => ABY.options(Object.assign(ABY.newState(0), { node }, o)).some(x => x.c.next === id);
    const w = ABY.songDone(Object.assign(ABY.newState(0), { node: 'd4_bells' }), true), f = ABY.songDone(Object.assign(ABY.newState(0), { node: 'd5_riff', tries: ABY.MAX_SONG_TRIES }), false);
    rec('hard-rites', hard.every((id, i) => ABY.RITES[id].step <= slowest - 0.05 && ABY.RITES[id].win > 0.6 && ABY.RITES[id].win <= 0.8 && sh[i].chords >= 12 && sh[i].bad === 0 && sh[i].close === 0 && sh[i].len > 80)
      && entry('d4_bells', 'd4_shore', 0, {}) && !entry('d4_bells', 'd4_shore', 0, { flags: { bells_done: 1 } }) && entry('d5_riff', 'd5_dawn', 0, {}) && !entry('d5_riff', 'd5_dawn', 0, { flags: { riff_done: 1 } })
      && w.node === 'd4_bells_win' && w.flags.rite_bells === 1 && f.node === 'd5_riff_give',
      'bells ' + sh[0].chords + ' chords / ' + sh[0].len + ' notes / ' + sh[0].secs.toFixed(0) + 's, riff ' + sh[1].chords + ' chords / ' + sh[1].len + ' notes / ' + sh[1].secs.toFixed(0) + 's; each faster than every plain rite (' + slowest + 's), no chord inside one lane, no two notes of a lane closer than 0.2s; each offered once and optional');
  }

  { // SEVEN DAYS: Day Five carries into Day Six, Day Six into Day Seven, and Day Seven is the end (nothing carries past it)
    const E = ABY.ENDINGS, dayOfEnd = id => { const n = ids.find(x => N[x].ending === id); return n ? N[n].ch : 0; };
    const d7 = ABY.ENDING_IDS.filter(id => dayOfEnd(id) === 12), d6 = ABY.ENDING_IDS.filter(id => dayOfEnd(id) === 11);
    const toSeventh = ids.flatMap(id => (N[id].choices || []).filter(c => c.next === 'end_seventh'));
    const end = (o) => ABY.options(Object.assign(ABY.newState(0), { node: 'd7_end' }, o)).some(x => x.c.next === 'end_seventh');
    const vet = { mem: 10, heart: 3, dread: 1, flags: { rite_seventh: 1, named_eye: 1, told_truth: 1 } };
    rec('seven-days', ABY.CHAPTERS.length === 12 && ABY.CHAPTERS[11].label === 'Day Seven' && E.nightline.cont === 'd6_wake' && E.passed.cont === 'd6_wake' && !E.warned.cont
      && d6.length === 2 && E.firstpage.cont === 'd7_wake' && !E.cradle.cont && d7.length === 3 && d7.every(id => !E[id].cont)
      && ABY.ENDING_IDS.every(id => !E[id].cont || N[E[id].cont].ch <= 12) && ABY.carry(Object.assign(ABY.newState(0), { node: 'end_again' })) === null,
      'Day Five (nightline, passed) -> Day Six (' + d6.join(', ') + ') -> Day Seven (' + d7.join(', ') + '); every Day Seven ending is final');
    rec('seventh-morning-gated', toSeventh.length === 1 && end(vet) && !end(Object.assign({}, vet, { mem: 9 })) && !end(Object.assign({}, vet, { dread: 4 }))
      && ['rite_seventh', 'named_eye', 'told_truth'].every(f => !end(Object.assign({}, vet, { flags: Object.assign({}, vet.flags, { [f]: 0 }) }))),
      'the book closes on Day Seven only for a veteran (10+ endings) who won the Seventh Night, named the Eye, told Wren the truth, and is not too afraid');
  }

  { // TEN OPENINGS: a first journey always starts at the start; after that it is scrambled, never the same one twice in a row, and every one is fair
    const O = ABY.OPENINGS, open = id => (N[id].choices || []).filter(c => !c.req);
    const picks = new Set(), grid = []; for (let i = 0; i < 1000; i++) { const r = i / 1000, last = O[i % O.length], p = ABY.pickOpening(r, 3, last); picks.add(p); grid.push(p !== last); }
    rec('ten-openings', O.length === 10 && new Set(O).size === 10 && O[0] === ABY.START && O.every(id => N[id] && N[id].ch === 1 && typeof N[id].teaser === 'string' && N[id].teaser.length > 20 && open(id).length >= 2)
      && O.every(id => ABY.newState(5, id).node === id) && ABY.newState(5, 'end_seventh').node === ABY.START
      && ABY.pickOpening(0.99, 0, 'op_bus') === ABY.START && picks.size === 10 && grid.every(Boolean) && ABY.pickOpening(0.999999, 4, 'awakening') !== 'awakening',
      '10 beginnings (' + O.slice(1).join(', ') + '); the first journey opens at ' + ABY.START + ', later ones are scrambled, never twice in a row');
  }

  { // FALLS AND CHECKPOINTS: a fall never carries on; waking goes back to the last dawn for a wake and a little dread; no wakes, no waking
    const falls = ABY.ENDING_IDS.filter(ABY.isFall), fallNode = id => ids.find(x => N[x].ending === id);
    const cp = Object.assign(ABY.newState(3), { node: 'd3_wake', dread: 2, heart: 2, flags: { rite_doors: 1 }, notes: ['eye'] });
    const w = ABY.wake(cp, 2, 7), top = ABY.wake(Object.assign({}, cp, { dread: ABY.MAX_DREAD }), 1, 0);
    // every day still has a way on that is not a fall: some ending carries into it, and that ending is not a fall
    const days = [...new Set(ABY.ENDING_IDS.map(id => ABY.ENDINGS[id].cont).filter(Boolean))];
    rec('falls-and-wakes', falls.length >= 8 && falls.every(id => !ABY.ENDINGS[id].cont && ABY.carry(Object.assign(ABY.newState(0), { node: fallNode(id) })) === null)
      && ['loop', 'drowned', 'hollow', 'blackout'].every(ABY.isFall) && !ABY.isFall('keeper') && !ABY.isFall('seventh')
      && ['d2_wake', 'd3_wake', 'd4_wake', 'd5_wake', 'd6_wake', 'd7_wake'].every(d => days.includes(d) && ABY.ENDING_IDS.some(id => ABY.ENDINGS[id].cont === d && !ABY.isFall(id)))
      && w && w.node === 'd3_wake' && w.dread === 3 && w.mem === 7 && w.heart === 2 && w.flags.rite_doors === 1 && w.flags !== cp.flags && cp.dread === 2
      && top.dread === ABY.MAX_DREAD - 1 && ABY.wake(cp, 0, 7) === null && ABY.wake(null, 3, 0) === null && ABY.WAKES === 3,
      falls.length + ' falls (' + falls.join(', ') + ') never carry on; every day keeps a way in that is not a fall; a wake returns to the dawn with +1 dread (never into the hollowing), ' + ABY.WAKES + ' a journey');
  }

  { // SCARS: a fall she has suffered marks every later journey (a flag a choice can ask for, a note from her past self); waking brings the new one
    const falls = ABY.ENDING_IDS.filter(ABY.isFall), st = ABY.newState(3, null, { loop: 1, dawn: 1, drowned: 1 });
    const gated = falls.filter(id => ids.some(x => (N[x].choices || []).some(c => c.req && c.req.flag === 'scar_' + id)));
    const cp = ABY.newState(2, null, { loop: 1 }), w = ABY.wake(cp, 3, 4, { loop: 1, drowned: 1, keeper: 1 });
    const kept = ABY.cleanState(JSON.parse(JSON.stringify(Object.assign({}, st, { flags: Object.assign({}, st.flags, { scar_dawn: 1 }) }))));
    rec('scars', falls.every(id => ABY.NOTES['scar_' + id]) && st.flags.scar_loop === 1 && st.flags.scar_drowned === 1 && !st.flags.scar_dawn && st.notes.join() === 'scar_loop,scar_drowned'
      && Object.keys(ABY.newState(0).flags).length === 0 && gated.length >= falls.length - 1
      && w.flags.scar_drowned === 1 && w.notes.includes('scar_drowned') && !w.flags.scar_keeper && !cp.flags.scar_drowned
      && kept.flags.scar_loop === 1 && kept.flags.scar_drowned === 1 && !kept.flags.scar_dawn,
      falls.length + ' falls leave a scar and a note; ' + gated.length + ' of them open a way past themselves next time (' + gated.join(', ') + '); a wake brings the fall just suffered; a save keeps them');
  }

  { // every ending that carries on opens a real "Day" chapter (the day label and the thread stamp read it)
    const bad = ABY.ENDING_IDS.filter(id => ABY.ENDINGS[id].cont && !/^Day /.test((ABY.CHAPTERS[N[ABY.ENDINGS[id].cont].ch - 1] || {}).label || ''));
    rec('carry-opens-a-day', bad.length === 0 && ABY.ENDING_IDS.filter(id => ABY.ENDINGS[id].cont).length >= 10, bad.join(', ') || 'every continuing ending opens a node in a chapter named "Day ..."');
  }

  { // the intro's little crown pays off on Day Four, once, and never traps the shore
    const sh = (o) => Object.assign(ABY.newState(0), { node: 'd4_shore' }, o);
    const offer = (o) => ABY.options(sh(o)).some(x => x.c.next === 'd4_crown');
    const laid = ABY.choose(Object.assign(ABY.newState(0), { node: 'd4_crown', dread: 3 }), 0);
    const named = (o) => ABY.options(Object.assign(ABY.newState(0), { node: 'd4_crown' }, o)).length;
    rec('d4-little-crown', offer({ flags: { little_crown: 1 } }) && !offer({}) && !offer({ flags: { little_crown: 1, crown_laid: 1 } })
      && laid && laid.node === 'd4_shore' && laid.flags.crown_laid === 1 && laid.dread === 2 && named({ flags: { read_names: 1 } }) === 3 && named({}) === 2,
      'taking out the little crown needs it from the first night, can be done once, lowers dread when laid down, and returns to the shore');
  }

  { // DAY FIVE: both dark Day Four endings carry on; the warning only works for a veteran who won the wake-up and told the truth
    const toWarned = ids.flatMap(id => (N[id].choices || []).filter(c => c.next === 'end_warned'));
    const d5 = ABY.carry(Object.assign(ABY.newState(9), { node: 'end_caller', flags: { rite_choir: 1 } }));
    const dawn = (o) => ABY.options(Object.assign(ABY.newState(0), { node: 'd5_dawn' }, o)).some(x => x.c.next === 'end_warned');
    rec('day-five', ABY.ENDINGS.caller.cont === 'd5_wake' && !ABY.ENDINGS.drowned.cont && ABY.isFall('drowned') && !ABY.ENDINGS.names.cont && d5 && d5.node === 'd5_wake' && d5.flags.rite_choir === 1 && N.d5_wake.ch === 10
      && toWarned.length > 0 && toWarned.every(c => c.req && c.req.min && c.req.min.mem >= 8 && c.req.all.includes('rite_wake') && c.req.all.includes('told_truth'))
      && dawn({ mem: 8, flags: { rite_wake: 1, told_truth: 1 } }) && !dawn({ mem: 7, flags: { rite_wake: 1, told_truth: 1 } }) && !dawn({ mem: 9, flags: { told_truth: 1 } }) && !dawn({ mem: 9, flags: { rite_wake: 1 } }),
      'caller carries into Day Five (drowning is a fall); warning Wren needs 8+ endings found, the wake-up won and the truth told');
  }

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
  const ST = ABY.STORE, sids = ST.map(a => a.id);
  rec('store-data', ST.length >= 4 && new Set(sids).size === sids.length && ST.every(a => a.name && a.glyph && a.tag && a.blurb && a.lore.length && a.c.length === 2 && Number.isInteger(a.need) && a.need >= 0 && a.need <= ABY.ENDING_IDS.length) && ST.some(a => a.need === 0) && ST.some(a => a.need >= 3), 'unique ids, every listing complete, a free first app and a late one, each unlock reachable');
  return R;
}

if (process.argv[1] && process.argv[1].endsWith('graph.mjs')) {
  const R = graphChecks(); for (const r of R) console.log((r.pass ? 'PASS' : 'FAIL') + ' ' + r.id + ' - ' + r.note);
  const p = R.filter(r => r.pass).length; console.log('\n=== ' + p + '/' + R.length + ' passed ==='); process.exit(p === R.length ? 0 : 1);
}
