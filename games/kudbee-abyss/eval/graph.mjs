// Walks every path of the story in node (no browser): every link exists, every node is reachable, no state is stuck, every state
// can still reach an ending, all ten endings are reachable, the forced scenes (blackout, hollowing) are reachable and recoverable,
// hidden choices can be unlocked, and the pure helpers behave. The walk covers the flashlight too (switched by hand at any node).
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const ABY = createRequire(import.meta.url)(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'story.js'));

function walkChecks() {
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
  for (let ch = true; ch;) { ch = false; for (const id of ids) if (!sure.has(id) && (N[id].song ? ['song_win', 'song_fail', 'reconcile'].every(x => sure.has(x) || true) : /^hero_/.test(id) ? ABY.OPENINGS.every(o => sure.has(o)) : N[id].time ? open(id).some(c => c.next === '@back' || (/^(confide|holders)$/.test(N[id].thread || '') && sure.has(c.next))) : open(id).some(c => c.next === '@back' ? false : sure.has(c.next)))) { sure.add(id); ch = true; } }
  rec('story-always-finishable', ids.every(id => sure.has(id)), ids.filter(id => !sure.has(id)).join(', ') || 'from every scene the always-available choices reach an ending (' + sure.size + '/' + ids.length + ')');

  // REACHABILITY (a bounded search from the start, shallow first). Two states that behave the same are one state: a stat only matters up to
  // 3 (the highest rule), a flag only if something reads it, the battery in four bands. The state kept for a band is the one with the LOWEST battery.
  const READ = ['knew_name', 'crystal', 'ledger', 'vey_trusted', 'vey_doubt', 'truth', 'crown', 'sealed', 'lullaby', 'broken', 'rite_doors', 'rite_blood', 'rite_lull', 'rite_choir', 'read_names', 'rite_wake', 'told_truth', 'little_crown', 'crown_laid', 'bells_done', 'riff_done', 'eye_is_sorrel', 'named_eye', 'promised_sorrel', 'rite_seventh', 'board_out', 'vey3_hand', ...ABY.ENDING_IDS.filter(ABY.isFall).map(id => 'scar_' + id)];
  READ.push(...ABY.OBJECTS.flatMap(o => ['has_' + o.id, 'used_' + o.id]));
  READ.push(...ABY.LINK_IDS.map(l => 'link_' + l), 'ev_door', 'ev_line', 'ev_first', 'vey_known', 'refused_next',
    ...ids.filter(id => N[id].time && !/^(confide|holders)$/.test(N[id].thread || '')).flatMap(id => N[id].choices.map(c => c.set)), 'doubt', 'asked_eye', 'ally', 'skipped_doors', 'doubt2', 'first_page', 'knows_loop', 'wren_with');   // the clock's slips (seen once) and what they read   // the evidence board's deductions, and its once-only scenes
  READ.push(...ABY.BOND_FLAGS);   // a bond is counted from these, so the walk keeps states with different bonds apart
  // the flags that matter, as bits of a few integers: far cheaper than filtering a hundred names into a string for every one of two million states
  const READBIT = new Map([...new Set(READ)].map((f, i) => [f, i])), READWORDS = Math.ceil(READBIT.size / 31);
  const readKey = (flags) => { const w = new Array(READWORDS).fill(0); for (const f in flags) { if (!flags[f]) continue; const i = READBIT.get(f); if (i !== undefined) w[(i / 31) | 0] |= 1 << (i % 31); } return w.join('.'); };
  const key = s => [s.node, Math.min(4, s.mem || 0), Math.min(3, s.heart), Math.min(3, s.resolve), Math.min(3, s.trust), s.dread, (s.bat <= 0 ? 0 : s.bat <= 14 ? 1 : s.bat <= 32 ? 2 : 3), s.light, readKey(s.flags), s.flags.song || '', s.tries, s.back].join('|');
  // the evidence board costs nothing when the pair is right, so the walk pins every right pair as soon as she holds both clues (notes are not in
  // the key; the deductions are). A player who never pins anything only sees fewer choices, so this hides no path.
  const pin = (t) => { for (const L of ABY.LINKS) if (!t.flags['link_' + L.id] && t.notes.includes(L.a) && t.notes.includes(L.b)) { const u = ABY.link(t, L.a, L.b); if (u) { delete u.linked; t = u; } } return t; };
  const succ = (s) => {
    const n = N[s.node], out = [];
    if (n.ending) { const c = ABY.carry(s); if (c) out.push(c); return out; }                  // Day Two: an ending with a way on carries her into act two
    if (n.song) { out.push(ABY.songDone(s, true), ABY.songDone(s, false)); return out; }
    for (const o of ABY.options(s)) { let t = ABY.choose(s, o.i); while (t && (N[t.node].beat || N[t.node].road)) { reach.add(t.node); t = ABY.choose(t, 0); } if (t) out.push(t); }   // a beat or a side road is a proven pass-through (checks `beats`, `side-roads`): step through it, so it costs the walk no statees
    const l = ABY.toggleLight(s); if (l !== s) out.push(l);
    return out.map(t => t.notes.length === s.notes.length ? t : pin(t));   // (no new clue, no new pair: flags are never taken back, so she was already pinned)
  };
  // seven days are too deep for one shallow-first queue: the early days would eat the whole budget. So each day has its own queue (shallow-first
  // inside it) and the walk takes from them in turn, so every day gets a fair share. A day's states only ever come from real states before them.
  const DAY = ch => ch <= 5 ? 0 : ch <= 7 ? 1 : ch - 6;            // chapters 1-5 are day one, 6-7 day two, then one chapter a day
  const seen = new Map(), byNode = new Map(), reach = new Set(), ends = new Set(), LIMIT = +process.env.WALK_LIMIT || 1500000;
  // (an index of the kept states by scene: a chase asks 'does anyone standing here satisfy this rule?' thousands of times, and scanning every state each time was the slow part)
  const index = (k, s) => { let m = byNode.get(s.node); if (!m) byNode.set(s.node, m = new Map()); m.set(k, s); };
  const standing = (id, rule) => { const m = byNode.get(id); if (m) for (const x of m.values()) if (ABY.okReq(x, rule)) return true; return false; };
  const walk = (seeds, limit, done, kf = key, local = seen) => {
    const Q = [], H = []; let n = 0;
    const push = (t) => { const d = DAY(N[t.node].ch); (Q[d] || (Q[d] = [], H[d] = 0, Q[d])).push(t); };
    seeds.forEach(push);
    for (let turn = 0; n < limit; turn++) {
      let d = -1; for (let i = 0; i < Q.length; i++) { const j = (turn + i) % Q.length; if (Q[j] && H[j] < Q[j].length) { d = j; break; } }
      if (d < 0) break;
      const s = Q[d][H[d]], k = kf(s); Q[d][H[d]++] = null; const was = local.get(k);
      if (was && was.bat <= s.bat) continue;                     // seen at least as drained: nothing new
      if (!was) n++; local.set(k, s); if (local === seen) index(k, s); reach.add(s.node);      // (the limit counts distinct states; a lower-battery copy only replaces one)
      if (local !== seen) { const sk = key(s); if (!seen.has(sk)) { seen.set(sk, s); index(sk, s); } }   // a follow-up walk's states are real states too
      if (N[s.node].ending) ends.add(ABY.endingOf(s));
      for (const t of succ(s)) push(t);
      if (done()) break;
    }
  };
  // (the nine other openings go first: the walk merges journeys that differ only in how they began, and the ones it keeps should be the ones with an echo to walk)
  walk([...ABY.OPENINGS.filter(o => o !== ABY.START), ABY.START].map(o => { const st = ABY.newState(10, o, ABY.ENDING_IDS); for (const k of Object.keys(st.flags)) if (/^echo_/.test(k)) delete st.flags[k]; return st; }), LIMIT,   // (echoes only add a voice, so the walk leaves them out: they would fatten every one of millions of states)
      // (a veteran: every fall already suffered, so every scar's way out is walked too)
    () => reach.size === ids.length && ends.size === ABY.ENDING_IDS.length && seen.size > 60000);
  // a flag taken on day one and read on day six is a long way to carry in a bounded walk. So, for every scene or gated choice still not reached,
  // walk again from REAL states (already reached) that hold the flags it asks for: every state these walks find is reachable from the start.
  // (a deduction `link_<id>` is not a flag any choice sets: it is pinned from two clues, so the chase asks for those clues instead: 'note:<id>')
  const LINKED = Object.fromEntries(ABY.LINKS.map(l => ['link_' + l.id, ['note:' + l.a, 'note:' + l.b]]));
  const has = (x, f) => f.startsWith('note:') ? x.notes.includes(f.slice(5)) : !!x.flags[f];
  const need = (r) => r ? [r.flag, ...(r.all || [])].filter(Boolean).flatMap(f => LINKED[f] || [f]) : [];
  const gates = id => ids.flatMap(f => (N[f].choices || []).filter(c => c.next === id && c.req)).map(c => c.req);
  const into = id => [...new Set(gates(id).flatMap(need))];   // flags it takes to get in
  const shut = (reqs) => reqs.map(r => r.noflag).filter(Boolean);   // flags that keep it shut
  // how many steps each scene is from a target, following the story's links backwards (rules ignored; Infinity = no way there). An ending leads
  // on to the next day's wake (the 'auto' ending to any of them), and a time slip leads back to wherever she entered it from.
  const conts = Object.values(ABY.ENDINGS).map(E => E.cont).filter(Boolean), from = {}, link = (a, b) => (from[b] || (from[b] = [])).push(a);
  for (const id of ids) {
    for (const c of N[id].choices || []) { link(id, c.next); if (N[c.next] && N[c.next].time) link(c.next, id); }
    for (const nx of Object.values(N[id].songNext || {})) link(id, nx);
    if (N[id].ending) for (const nx of N[id].ending === 'auto' ? conts : [ABY.ENDINGS[N[id].ending] && ABY.ENDINGS[N[id].ending].cont].filter(Boolean)) link(id, nx); }
  const toward = (target) => { const d = new Map([[target, 0]]), q = [target]; for (let i = 0; i < q.length; i++) for (const p of from[q[i]] || []) if (!d.has(p)) { d.set(p, d.get(q[i]) + 1); q.push(p); } return id => d.has(id) ? d.get(id) : Infinity; };
  const unmet = () => { const out = [];
    for (const id of ids) if (!reach.has(id) && !N[id].thread) out.push({ id, flags: into(id) });
    for (const id of ids) for (const c of N[id].choices || []) if (c.req && (need(c.req).length || c.req.bond) && reach.has(id) && !standing(id, c.req)) out.push({ id, flags: [...new Set([...need(c.req), ...into(id)])], own: need(c.req), req: c.req });
    return out; };
  for (let round = 0, todo = unmet(), was = -1; todo.length && todo.length !== was && round < (process.env.GRAPH_QUICK ? 0 : 4); round++, was = todo.length, todo = unmet()) for (const t of todo) {   // (a chase can open the way to the next target, so look again)
    const ok = () => t.req ? standing(t.id, t.req) : reach.has(t.id); if (ok()) continue;
    const blocked = [...new Set([...shut(gates(t.id)), ...shut(t.req ? [t.req] : [])])];   // flags that keep the target shut: a seed must not hold one
    const far = toward(t.id);   // (an ungated scene asks for no flags, so every state qualifies: without this the seeds were the shallowest Day One states, and each chase re-walked the day)
    const near = (fl) => { const hit = [], day = DAY(N[t.id].ch);   // the closest scenes to the target first (steps in the story graph), then nearest day, earliest in it
      for (const [id, m] of [...byNode].filter(([id]) => !N[id].ending && DAY(N[id].ch) <= day).sort((p, q) => far(p[0]) - far(q[0]))) {
        if (hit.length >= 4000 && far(id) > far(hit[hit.length - 1].node)) break;   // (4000 closer seeds are enough)
        for (const x of m.values()) if (fl.every(f => has(x, f)) && !blocked.some(f => x.flags[f]) && (!t.req || !t.req.bond || ABY.okReq(x, { bond: t.req.bond }))) hit.push(x); }
      return hit.sort((p, q) => far(p.node) - far(q.node) || DAY(N[q.node].ch) - DAY(N[p.node].ch) || p.choices - q.choices).slice(0, 4000); };
    let seeds = near(t.flags); if (!seeds.length && t.own) seeds = near(t.own); if (!seeds.length) seeds = near(into(t.id));   // (a gated choice: start from whoever holds the flags ITS rule asks for; the other ways into the scene are only one way in)       // nobody holds every flag yet: start from those who can get in, and pick up the rest
    if (!seeds.length) seeds = [...new Set(t.flags.flatMap(f => near([f])))].slice(0, 4000);   // nor that: start from those who hold any part of it (one clue of a pair)
    // (merged more coarsely than the main walk: only the flags this target asks for are kept apart. Merging only prunes; it never invents a state)
    const keep = [...new Set([...t.flags, ...blocked])];   // (a flag that shuts the way in must be kept apart too)
    const coarse = s => [s.node, Math.min(4, s.mem || 0), Math.min(3, s.heart), Math.min(3, s.resolve), Math.min(3, s.trust), s.dread, (s.bat <= 0 ? 0 : s.bat <= 14 ? 1 : s.bat <= 32 ? 2 : 3), s.light, [...keep].filter(f => has(s, f)).join(','), ABY.BOND_IDS.map(w => Math.max(-1, Math.min(3, ABY.bond(s, w)))).join(''), s.flags.song || '', s.tries, s.back].join('|');
    let last = 0; walk(seeds, 400000, () => { if (++last % 5000) return false; return ok(); }, coarse, new Map());
  }
  rec('story-all-nodes-reachable', ids.every(id => reach.has(id) || N[id].thread), ids.filter(id => !reach.has(id) && !N[id].thread).join(', ') || 'every scene can be reached from the start (' + seen.size + ' states searched)');
  const missing = ABY.ENDING_IDS.filter(e => !ends.has(e));
  rec('story-all-endings', missing.length === 0, 'reachable: ' + [...ends].sort().join(', ') + (missing.length ? ' | MISSING ' + missing.join(', ') : ''));

  // the forced scenes: the phone dies, her mind comes apart; both come back to where she was headed when she can fight them
  const at = id => [...(byNode.get(id) || new Map()).values()];   // the kept states standing at a scene
  const black = at('blackout'), holl = at('hollowing');
  const back = (s, pick) => { for (const o of ABY.options(s)) { const t = ABY.choose(s, o.i); if (t && N[s.node].choices[o.i].next === '@back') return t; } return null; };
  const recovered = black.filter(s => back(s)), saved = holl.filter(s => back(s));
  rec('forced-blackout', black.length > 0 && recovered.length > 0 && recovered.length < black.length && recovered.every(s => back(s).bat > 0), black.length + ' blackout states; ' + recovered.length + ' can recharge and carry on (the crystal, or a spark), the rest end in the dark');
  rec('forced-hollowing', holl.length > 0 && saved.length > 0 && saved.length < holl.length && saved.every(s => back(s).dread < ABY.MAX_DREAD), holl.length + ' hollowing states; ' + saved.length + ' are pulled back by trust (dread drops), the rest let go');

  // hidden choices exist and unlock: some state shows a choice that another does not
  const reqNodes = ids.filter(id => (N[id].choices || []).some(c => c.req));
  let unlocked = 0, hidden = 0; for (const id of reqNodes) { const here = at(id); if (!here.length) continue; for (let i = 0; i < N[id].choices.length; i++) if (N[id].choices[i].req) { const sees = here.some(s => ABY.okReq(s, N[id].choices[i].req)), hides = here.some(s => !ABY.okReq(s, N[id].choices[i].req)); if (sees) unlocked++; if (hides) hidden++; } }
  const never = []; for (const id of reqNodes) for (const c of N[id].choices) if (c.req && !c.req.open && !c.req.hero && !/^rg_done_/.test(c.req.noflag || '') && !at(id).some(s => ABY.okReq(s, c.req))) never.push(id + ':' + c.label);
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

  { // the three hard rites: faster than the plain ones, with chords (two notes in two lanes at once), harder to win, optional, and bounded like any rite
    const lane = i => i <= 2 ? 0 : i <= 5 ? 1 : 2, plain = ['doors', 'blood', 'lull', 'choir', 'wake'], hard = ['bells', 'riff', 'box'];
    const stats = id => { const c = ABY.RITES[id]; let chords = 0, bad = 0, t = 0, close = 0, last = [-9, -9, -9]; for (const m of c.mel) { t += m[1] * c.step; if (m[2] !== undefined) { chords++; if (lane(m[0]) === lane(m[2])) bad++; }
      for (const i of m[2] !== undefined ? [m[0], m[2]] : [m[0]]) { if (t - last[lane(i)] < 0.2) close++; last[lane(i)] = t; } if (m[1] === 0 && m !== c.mel[0] && m[2] === undefined) bad++; }
      return { chords, bad, close, len: c.mel.length + chords, secs: t }; };
    const sh = hard.map(stats), slowest = Math.min(...plain.map(id => ABY.RITES[id].step));
    const entry = (id, node, flag, o) => ABY.options(Object.assign(ABY.newState(0), { node }, o)).some(x => x.c.next === id);
    const w = ABY.songDone(Object.assign(ABY.newState(0), { node: 'd4_bells' }), true), f = ABY.songDone(Object.assign(ABY.newState(0), { node: 'd5_riff', tries: ABY.MAX_SONG_TRIES }), false);
    const wb = ABY.songDone(Object.assign(ABY.newState(0), { node: 'd6_box' }), true), fb = ABY.songDone(Object.assign(ABY.newState(0), { node: 'd6_box', tries: ABY.MAX_SONG_TRIES }), false);
    rec('hard-rites', hard.every((id, i) => ABY.RITES[id].step <= slowest - 0.05 && ABY.RITES[id].win > 0.6 && ABY.RITES[id].win <= 0.8 && sh[i].chords >= 12 && sh[i].bad === 0 && sh[i].close === 0 && sh[i].len > 80)
      && entry('d4_bells', 'd4_shore', 0, {}) && !entry('d4_bells', 'd4_shore', 0, { flags: { bells_done: 1 } }) && entry('d5_riff', 'd5_dawn', 0, {}) && !entry('d5_riff', 'd5_dawn', 0, { flags: { riff_done: 1 } }) && entry('d6_box', 'd6_sorrel', 0, {}) && !entry('d6_box', 'd6_sorrel', 0, { flags: { box_done: 1 } })
      && w.node === 'd4_bells_win' && w.flags.rite_bells === 1 && f.node === 'd5_riff_give' && wb.node === 'd6_box_win' && wb.flags.rite_box === 1 && fb.node === 'd6_box_give',
      'bells ' + sh[0].chords + ' chords / ' + sh[0].len + ' notes / ' + sh[0].secs.toFixed(0) + 's, riff ' + sh[1].chords + ' chords / ' + sh[1].len + ' notes / ' + sh[1].secs.toFixed(0) + 's; each faster than every plain rite (' + slowest + 's), no chord inside one lane, no two notes of a lane closer than 0.2s; each offered once and optional');
  }

  { // SEVEN DAYS: Day Five carries into Day Six, Day Six into Day Seven, and Day Seven is the end (nothing carries past it)
    const E = ABY.ENDINGS, dayOfEnd = id => { const n = ids.find(x => N[x].ending === id); return n ? N[n].ch : 0; };
    const d7 = ABY.ENDING_IDS.filter(id => dayOfEnd(id) === 12), d6 = ABY.ENDING_IDS.filter(id => dayOfEnd(id) === 11);
    const toSeventh = ids.flatMap(id => (N[id].choices || []).filter(c => c.next === 'end_seventh'));
    const end = (o) => ABY.options(Object.assign(ABY.newState(0), { node: 'd7_end' }, o)).some(x => x.c.next === 'end_seventh');
    const vet = { mem: 10, heart: 3, dread: 1, flags: { rite_seventh: 1, named_eye: 1, told_truth: 1 } };
    rec('seven-days', ABY.CHAPTERS.length === 12 && ABY.CHAPTERS[11].label === 'Day Seven' && E.nightline.cont === 'd6_wake' && E.passed.cont === 'd6_wake' && !E.warned.cont
      && d6.length === 2 && E.firstpage.cont === 'd7_wake' && !E.cradle.cont && d7.length === 4 && d7.every(id => !E[id].cont)
      && ABY.ENDING_IDS.every(id => !E[id].cont || N[E[id].cont].ch <= 12) && ABY.carry(Object.assign(ABY.newState(0), { node: 'end_again' })) === null,
      'Day Five (nightline, passed) -> Day Six (' + d6.join(', ') + ') -> Day Seven (' + d7.join(', ') + '); every Day Seven ending is final');
    rec('seventh-morning-gated', toSeventh.length === 1 && end(vet) && !end(Object.assign({}, vet, { mem: 9 })) && !end(Object.assign({}, vet, { dread: 4 }))
      && ['rite_seventh', 'named_eye', 'told_truth'].every(f => !end(Object.assign({}, vet, { flags: Object.assign({}, vet.flags, { [f]: 0 }) }))),
      'the book closes on Day Seven only for a veteran (10+ endings) who won the Seventh Night, named the Eye, told Wren the truth, and is not too afraid');
    // the accusation: every suspect can be named, but only the deduction pinned on Day Six names the right one; a wrong name is a fall, the right
    // one a confession, and only the small key Vey pressed into her hand on Day Three turns the confession into The Low Door. Offered once a night (putting it away shuts it)
    const accuse = (o) => ABY.options(Object.assign(ABY.newState(0), { node: 'd7_accuse' }, o)).map(x => x.c.next), offered = (o) => ABY.options(Object.assign(ABY.newState(0), { node: 'd7_gather' }, o)).some(x => x.c.next === 'd7_accuse');
    const wrong = ['d7_acc_eye', 'd7_acc_guard', 'd7_acc_vey'], fallsOf = id => (N[id].choices || []).every(c => N[c.next].ending && ABY.isFall(N[c.next].ending));
    const low = (o) => ABY.options(Object.assign(ABY.newState(0), { node: 'd7_confess' }, o)).some(x => x.c.next === 'end_lowdoor');
    rec('accusation', wrong.every(id => accuse({}).includes(id) && fallsOf(id)) && !accuse({}).includes('d7_confess') && accuse({ flags: { link_what_she_gave: 1 } }).includes('d7_confess')
      && accuse({}).includes('d7_gather') && offered({}) && !offered({ flags: { board_out: 1 } }) && ABY.choose(Object.assign(ABY.newState(0), { node: 'd7_accuse' }), 4).flags.board_out === 1
      && !low({}) && low({ flags: { vey3_hand: 1 } }) && (N.d7_confess.choices || []).some(c => !c.req && c.next === 'd7_end')
      && ids.filter(id => (N[id].choices || []).some(c => c.next === 'end_lowdoor')).join() === 'd7_confess' && !ABY.isFall('lowdoor') && !E.lowdoor.cont,
      'three wrong suspects (each a fall), the Queen only with "Who she locked away" pinned, and The Low Door only with Vey\'s small key too; putting the notes away closes it for the night');
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

  { // the evidence board: every deduction pairs two real clues, opens a hidden choice at its scene, and that scene is reached; a right pair is free,
    // a wrong one costs (but never kills the phone or tips her over from inside Notes); a pair pins once; a save keeps the deductions
    const L = ABY.LINKS, base = Object.assign(ABY.newState(0), { node: 'd2_door', notes: ['recording', 'future_call', 'ledger'], dread: 4, bat: 2 });
    const right = ABY.link(base, 'future_call', 'recording'), wrong = ABY.link(base, 'recording', 'ledger'), wrong2 = ABY.link(wrong, 'recording', 'ledger');
    const shaped = L.filter(l => ABY.NOTES[l.a] && ABY.NOTES[l.b] && l.a !== l.b && l.title && l.text && N[l.at] && (N[l.at].choices || []).some(c => c.req && c.req.flag === 'link_' + l.id && N[c.next] && reach.has(c.next)));
    const once = ['d2_door', 'd5_dawn', 'd7_end'].every(at => (N[at].choices || []).filter(c => c.req && /^link_/.test(c.req.flag || '')).every(c => c.req.noflag && (N[c.next].choices || []).every(d => d.next !== at || d.set === c.req.noflag)));
    const det = (deduced, flags) => ABY.badgesFor({ dawn: 1 }, Object.assign(ABY.newState(0), { node: 'gate_opens', flags }), deduced).includes('detective');   // five different deductions, over any nights
    const kept = ABY.cleanState(Object.assign({}, right, { flags: Object.assign({ link_nope: 1 }, right.flags) }));
    rec('evidence-board', L.length >= 7 && shaped.length === L.length && new Set(L.flatMap(l => [l.a + '+' + l.b])).size === L.length
      && right.flags.link_two_warnings === 1 && right.linked === 'two_warnings' && right.bat === 2 && right.dread === 4 && ABY.link(right, 'recording', 'future_call') === null
      && wrong.linked === null && wrong.bat === 1 && wrong.dread === 5 && wrong2.bat === 1 && wrong2.dread === 5 && !Object.keys(wrong.flags).length
      && ABY.link(base, 'recording', 'recording') === null && ABY.link(base, 'recording', 'eye') === null && ABY.link(Object.assign({}, base, { node: 'end_keeper' }), 'recording', 'future_call') === null
      && ABY.options(right).some(o => o.c.next === 'ev_door') && !ABY.options(base).some(o => o.c.next === 'ev_door') && once
      && kept.flags.link_two_warnings === 1 && !kept.flags.link_nope
      && det({ two_warnings: 1, yes_man: 1, many_hands: 1, birthday: 1 }, { link_watcher: 1 }) && !det({ two_warnings: 1, yes_man: 1, many_hands: 1, birthday: 1 }, {}) && !det({ two_warnings: 1, yes_man: 1, many_hands: 1, birthday: 1 }, { link_two_warnings: 1 }),
      L.length + ' deductions, each pairing two real clues and opening a hidden choice that is reached (' + shaped.map(l => l.at).join(', ') + '); a wrong pair costs 2% and 1 dread, never past 1% or the edge; the scenes that return are offered once; a save keeps them; Detective counts five different deductions over any nights');
  }

  { // the long pairs: a deduction whose two clues are first filed at least two days apart, opening a scene on or after the later one's day. The
    // scene is offered once and every way out of it returns to the scene it was opened from, adding no clue: more of the night, not another way through
    const LL = ABY.LINKS.filter(l => l.long), wake = id => (/^d(\d)_wake$/.exec(id) || [])[1] - 1;
    const filed = k => ids.filter(id => N[id].note === k || (N[id].choices || []).some(c => c.note === k)).map(id => DAY(N[id].ch)).concat(ABY.OVERNIGHT.filter(o => o.note === k).map(o => wake(o.at)));
    const first = k => Math.min(...filed(k)), gaps = [];
    const shaped = LL.filter(l => {
      const ways = (N[l.at].choices || []).filter(c => c.req && c.req.flag === 'link_' + l.id), c = ways[0], ev = c && N[c.next];
      if (ways.length !== 1 || !ev || !c.req.noflag || ev.note || ev.ending || ev.song || !ev.choices.every(d => d.next === l.at && d.set === c.req.noflag && !d.note && !d.req)) return false;
      const gap = first(l.b) - first(l.a); gaps.push(l.id + ' ' + (first(l.a) + 1) + '>' + (first(l.b) + 1));
      if (gap < 2 || DAY(N[l.at].ch) < first(l.b) || DAY(ev.ch) !== DAY(N[l.at].ch)) return false;
      const st = Object.assign(ABY.newState(0), { node: l.at, mem: 9, notes: [l.a, l.b, N[l.at].note].filter(Boolean) }), u = ABY.link(st, l.a, l.b);
      const k = N[l.at].choices.indexOf(c), has = t => ABY.options(t).some(o => o.i === k), i = u && ABY.options(u).filter(o => o.i === k)[0], v = i && ABY.choose(u, i.i), w = v && ABY.choose(v, 0);
      return u && u.linked === l.id && !has(st) && v && v.node === c.next && w && w.node === l.at && !has(w) && w.notes.length === u.notes.length;
    });
    const days = new Set(LL.map(l => DAY(N[l.at].ch))), unreached = LL.filter(l => !(N[l.at].choices || []).some(c => c.req && c.req.flag === 'link_' + l.id && reach.has(c.next)));
    rec('long-pairs', LL.length >= 6 && shaped.length === LL.length && days.size >= 5 && !unreached.length,
      LL.length + ' deductions join a clue to one first found two or more days later (' + gaps.join(', ') + '), opening scenes on ' + days.size + ' days; each is offered once, after both clues, and returns to the scene it was opened from with no new clue' + (shaped.length < LL.length ? ' | BAD ' + LL.filter(l => !shaped.includes(l)).map(l => l.id).join(', ') : '') + (unreached.length ? ' | UNREACHED ' + unreached.map(l => l.id).join(', ') : ''));
  }

  { // calls that have to be picked up: every day rings at least once; a call is Answer / Decline (no hidden choices: the call screen shows both);
    // decline an insistent one and it rings again, louder each time, and the third ring has already answered itself (one choice, nothing to refuse)
    const calls = ids.filter(id => N[id].call), lv = id => N[id].call.ring || 1, dec = id => (N[id].choices.length === 2 && N[N[id].choices[1].next].call) ? N[id].choices[1].next : null;
    const shaped = calls.filter(id => { const ch = N[id].choices || []; return ch.length >= 1 && ch.length <= 2 && ch.every(c => !c.req && c.next !== '@back') && lv(id) >= 1 && lv(id) <= 3 && (ch.length === 2 || lv(id) === 3); });
    const louder = calls.every(id => !dec(id) || lv(dec(id)) > lv(id)), heads = calls.filter(id => dec(id) && !calls.some(p => dec(p) === id));
    const self = calls.filter(id => N[id].choices.length === 1), selfOk = self.every(id => calls.some(p => dec(p) === id) && lv(id) === 3);
    const days = [...new Set(calls.map(id => DAY(N[id].ch)))].sort();
    rec('calls-must-be-answered', calls.length >= 11 && shaped.length === calls.length && louder && heads.length >= 3 && self.length >= 2 && selfOk && days.length === 7 && calls.every(id => reach.has(id)) && N.c4_choir_talk.note === 'choir',
      calls.length + ' calls over all seven days, each reached; ' + heads.length + ' will not take no (' + heads.join(', ') + '): declined, they ring again louder, and ' + self.length + ' end by answering themselves; the drowned choir finally files its clue');
  }
  { // overnight messages: while she sleeps the people she has met write to her. Each is a real voice on a real day, for a flag a choice sets on an
    // EARLIER day (so it is always remembered, never invented), shown only to whoever holds the flag; some file a clue, and a carried day files it too
    const O = ABY.OVERNIGHT.filter(o => !o.req.bond), setAt = f => ids.filter(id => (N[id].choices || []).some(c => c.set === f)), day = id => N[id].ch;
    const bad = O.filter(o => !ABY.SPEAKERS[o.who] || !N[o.at] || !/_wake$/.test(o.at) || !o.text || !o.req || (!o.req.flag && !ABY.OPENINGS.includes(o.req.open)) || (o.note && !ABY.NOTES[o.note])
      || (o.req.flag && (!setAt(o.req.flag).length || !setAt(o.req.flag).some(id => reach.has(id) && day(id) < day(o.at))))).map(o => o.id);
    const days = [...new Set(O.map(o => o.at))].sort(), who = new Set(O.map(o => o.who));
    const holder = (o) => ABY.overnightFor(Object.assign(ABY.newState(0, o.req.open), { node: o.at, flags: o.req.flag ? { [o.req.flag]: 1 } : {} })).some(x => x.id === o.id);
    const later = ABY.OPENINGS, way = later.every(op => ['d2_wake', 'd7_wake'].every(at => ABY.overnightFor(Object.assign(ABY.newState(0, op), { node: at })).filter(x => x.req.open).length === 1)) && ['d2_wake', 'd7_wake'].every(at => ABY.overnightFor(Object.assign(ABY.newState(0), { node: at })).every(x => x.req.open === ABY.START));
    const none = ABY.overnightFor(Object.assign(ABY.newState(0), { node: 'd3_wake' })).length === 0;
    const carried = ABY.carry(Object.assign(ABY.newState(0), { node: 'end_keeper', flags: { vey_known: 1 } })), plain = ABY.carry(Object.assign(ABY.newState(0), { node: 'end_keeper' }));
    const landed = ABY._land(Object.assign(ABY.newState(0), { node: 'd5_wake', flags: { refused_next: 1 } }));
    const unread = new Set(ids.flatMap(f => (N[f].choices || []).filter(c => c.set).map(c => c.set))), nowRead = O.filter(o => unread.has(o.req.flag)).length;
    rec('overnight-messages', O.length >= 15 && bad.length === 0 && new Set(O.map(o => o.id)).size === O.length && days.join() === 'd2_wake,d3_wake,d4_wake,d5_wake,d6_wake,d7_wake' && ['QUEEN', 'VEY', 'GUARDIAN', 'EYE', 'WREN', 'SORREL'].every(w => who.has(w))
      && O.every(holder) && none && way && ABY.newState(0, 'op_bath').open === 'op_bath' && ABY.cleanState({ open: 'op_snow' }).open === 'op_snow' && ABY.cleanState({ open: 'nope' }).open === ABY.START
      && carried && carried.notes.includes('vey_gift') && !plain.notes.includes('vey_gift') && landed.notes.includes('eye_noticed'),
      O.length + ' overnight messages over six mornings from ' + who.size + ' voices, each for a flag set on an earlier day or for how the journey began (all ten openings are remembered on Day Two and Day Seven)' + (bad.length ? ' | BAD ' + bad.join(', ') : '') + '; only those who hold the flag hear them; a carried day files its clue');
  }
  { // codas: when an ending lands, the people she met text her one last time, for the flags she holds. They change no ending, tile or share card. Each
    // one's flag must be set by a choice on a reached scene from which the ending can still be reached (following choices, rite results, a slip's return
    // and a good ending's carry into the next day); the battery can die on any scene, so a blackout coda only needs its flag set on Day One
    const AUTO = ['dawn', 'song', 'echo', 'silence', 'crown', 'betrayal', 'hollow'], endsAt = id => !N[id].ending ? [] : N[id].ending === 'auto' ? AUTO : [N[id].ending];
    const into = {}; ids.forEach(id => (N[id].choices || []).forEach(c => { if (N[c.next] && N[c.next].time) (into[c.next] = into[c.next] || []).push(id); }));
    const out = id => [...new Set([].concat(...(N[id].choices || []).map(c => c.next === '@back' ? (into[id] || []) : N[c.next] ? [c.next] : []), Object.values(N[id].songNext || {}).filter(x => N[x]), endsAt(id).map(e => ABY.ENDINGS[e] && ABY.ENDINGS[e].cont).filter(Boolean)))];
    const leads = {}, endsFrom = (id) => { if (leads[id]) return leads[id]; const seen = new Set([id]), q = [id], got = new Set(); while (q.length) { const x = q.pop(); endsAt(x).forEach(e => got.add(e)); out(x).forEach(y => { if (!seen.has(y)) { seen.add(y); q.push(y); } }); } return (leads[id] = got); };
    const can = (f, end) => ids.some(id => reach.has(id) && (N[id].choices || []).some(c => c.set === f && (end === 'blackout' ? DAY(N[id].ch) === 0 : endsFrom(c.next === '@back' || !N[c.next] ? id : c.next).has(end))));
    const C = ABY.CODAS, bad = C.filter(c => !ABY.ENDINGS[c.end] || !ABY.SPEAKERS[c.who] || c.who === 'NARRATOR' || !c.text || !c.req || !c.req.flag || Object.keys(c.req).length !== 1 || !can(c.req.flag, c.end)).map(c => c.id);
    const per = ABY.ENDING_IDS.map(e => C.filter(c => c.end === e).length), who = new Set(C.map(c => c.who));
    const holder = c => ABY.codasFor(c.end, Object.assign(ABY.newState(0), { flags: { [c.req.flag]: 1 } })).some(x => x.id === c.id), none = ABY.ENDING_IDS.every(e => ABY.codasFor(e, ABY.newState(0)).length === 0);
    const capped = ABY.ENDING_IDS.every(e => ABY.codasFor(e, Object.assign(ABY.newState(0), { flags: Object.fromEntries(C.map(c => [c.req.flag, 1])) })).length === Math.min(ABY.CODA_MAX, C.filter(c => c.end === e).length));
    rec('codas', bad.length === 0 && Math.min(...per) >= 2 && new Set(C.map(c => c.id)).size === C.length && who.size >= 7 && C.every(holder) && none && capped,
      C.length + ' codas from ' + who.size + ' voices, at least ' + Math.min(...per) + ' for each of the ' + ABY.ENDING_IDS.length + ' endings, each for a flag set where that ending can still be reached; none for a player who did nothing, at most ' + ABY.CODA_MAX + ' at once' + (bad.length ? ' | BAD ' + bad.join(', ') : ''));
  }
  { // detours: two scenes off a day's road, entered once from one scene of their own day; every way out of the second goes back there and sets the
    // flag that shuts the way in, so the day keeps its shape (a detour reaches no ending, no call, no rite, no slip) and it cannot be farmed
    const D = ABY.DETOURS, sc = d => [d.id + '_a', d.id + '_b'], days = new Set(D.map(d => DAY(N[d.from].ch)));
    const bad = D.filter(d => { const [a, b] = sc(d), from = N[d.from], into = ids.filter(id => (N[id].choices || []).some(c => c.next === a));
      return !from || from.ending || from.call || from.time || !N[a] || !N[b] || into.length !== 1 || into[0] !== d.from
        || from.choices.filter(c => c.next === a).some(c => !c.req || c.req.noflag !== d.id) || N[a].choices.some(c => c.next !== b || c.set)
        || N[b].choices.some(c => c.next !== d.from || c.set !== d.id) || [a, b].some(id => N[id].ending || N[id].call || N[id].song || N[id].time || !reach.has(id) || DAY(N[id].ch) !== DAY(from.ch) || !ABY.SPEAKERS[N[id].speaker])
        || ids.some(id => id !== b && (N[id].choices || []).some(c => c.set === d.id)); }).map(d => d.id);
    rec('detours', D.length >= 6 && bad.length === 0 && [1, 2, 3, 4, 5, 6].every(x => days.has(x)) && new Set(D.map(d => d.id)).size === D.length,
      D.length + ' detours (' + D.length * 2 + ' scenes) off Day Two to Day Seven, each reached, entered once from a scene of its own day and returning to it' + (bad.length ? ' | BAD ' + bad.join(', ') : ''));
  }
  { // second sight: a scene most journeys pass opens with a line from someone who remembers an earlier journey (an ending found, a fall survived, or how
    // many); the scene must be reached and said once (no flashlight loop, no slip or detour returns to it), and nobody remembers a first journey
    const S = ABY.SECOND_SIGHT, back = new Set(ids.filter(id => (N[id].choices || []).some(c => c.next === id || (N[c.next] && N[c.next].time)))), dtFrom = new Set(ABY.DETOURS.map(d => d.from));
    const okReq = r => (r.flag && Object.keys(r).length === 1 && ((/^echo_/.test(r.flag) && ABY.ENDINGS[r.flag.slice(5)] && !ABY.isFall(r.flag.slice(5))) || (/^scar_/.test(r.flag) && ABY.isFall(r.flag.slice(5)))))
      || (r.min && Object.keys(r).length === 1 && Object.keys(r.min).join() === 'mem' && r.min.mem >= 1 && r.min.mem < ABY.ENDING_IDS.length);
    const bad = S.filter(x => { const n = N[x.at]; return !n || !reach.has(x.at) || n.ending || n.call || n.time || n.detour || /_wake$/.test(x.at) || back.has(x.at) || dtFrom.has(x.at) || !ABY.SPEAKERS[x.who] || !x.text || !x.req || !okReq(x.req); }).map(x => x.id);
    const first = S.every(x => !ABY.overnightFor(Object.assign(ABY.newState(0), { node: x.at })).some(o => o.id === x.id));
    const later = S.every(x => ABY.overnightFor(Object.assign(ABY.newState(x.req.min ? x.req.min.mem : 0), { node: x.at, flags: x.req.flag ? { [x.req.flag]: 1 } : {} })).some(o => o.id === x.id));
    const days = new Set(S.map(x => DAY(N[x.at].ch)));
    rec('second-sight', S.length >= 12 && bad.length === 0 && first && later && days.size === 7 && new Set(S.map(x => x.at)).size === S.length,
      S.length + ' lines over all seven days from someone who remembers an earlier journey, each on a reached scene said once; a first journey hears none' + (bad.length ? ' | BAD ' + bad.join(', ') : ''));
  }
  { // app whispers: an installed app speaks once, as itself, on a later day. It is only a voice: nothing in the story reads `app_` flags, so a journey with
    // every app installed takes the same choices, the same scenes and the same endings as one with none (proved by replaying seeded journeys both ways)
    const W = ABY.APP_WHISPERS, back = new Set(ids.filter(id => (N[id].choices || []).some(c => c.next === id || (N[c.next] && N[c.next].time)))), dtFrom = new Set(ABY.DETOURS.map(d => d.from)), ss = new Set(ABY.SECOND_SIGHT.map(x => x.at));
    const darkOnce = (x) => x.req.noLight && N[x.at].dark && (N[x.at].choices || []).every(c => c.next !== x.at || c.light === 1) && !(N[x.at].choices || []).some(c => N[c.next] && N[c.next].time);
    const bad = W.filter(x => { const n = N[x.at]; return !n || !reach.has(x.at) || DAY(n.ch) < 1 || n.ending || n.call || n.time || n.detour || /_wake$/.test(x.at) || dtFrom.has(x.at) || ss.has(x.at) || (back.has(x.at) && !darkOnce(x))
      || !ABY.APP_IDS.includes(x.app) || x.req.flag !== 'app_' + x.app || Object.keys(x.req).some(k => k !== 'flag' && k !== 'noLight') || !ABY.SPEAKERS[x.who] || ABY.SPEAKERS[x.who].app !== x.app || !x.text || !['', 'flicker', 'ring', 'glitch'].includes(x.fx); }).map(x => x.id);
    const reads = []; for (const id of ids) for (const c of N[id].choices || []) if (/app_/.test(JSON.stringify(c.req || {}) + (c.set || '') + JSON.stringify(c.add || {}))) reads.push(id);
    const quiet = W.every(x => !ABY.overnightFor(Object.assign(ABY.newState(0), { node: x.at })).some(o => o.id === x.id));
    const heard = W.every(x => ABY.overnightFor(Object.assign(ABY.newState(0, undefined, {}, [x.app]), { node: x.at })).some(o => o.id === x.id));
    // the same seeded journeys with every app installed and with none: identical choices, scenes and endings, day after day
    let rs = 7; const rnd = () => (rs = (rs * 1103515245 + 12345) % 2147483648) / 2147483648, strip = st => { const f = Object.assign({}, st.flags); for (const k in f) if (/^app_/.test(k)) delete f[k]; return JSON.stringify(Object.assign({}, st, { flags: f, notes: st.notes.filter(k => !/^a_/.test(k)) })); };   // (an app's clue is only a note until she pins it: app-clues)
    let runs = 0, diverged = 0, ends = new Set(), spoke = new Set();
    const dawns = ['d2_wake', 'd3_wake', 'd4_wake', 'd5_wake', 'd6_wake', 'd7_wake'].filter(id => N[id]);
    for (let r = 0; r < 600 + dawns.length * 150; r++) {   // from every opening, then from every later dawn (a random journey rarely lives that long)
      const op = ABY.OPENINGS[r % ABY.OPENINGS.length], mem = r % 11, at = r < 600 ? null : dawns[(r - 600) % dawns.length];
      let a = ABY.newState(mem, op, {}), b = ABY.newState(mem, op, {}, ABY.APP_IDS); if (at) { a = Object.assign(a, { node: at }); b = Object.assign(b, { node: at }); }
      for (let step = 0; step < 900; step++) {
        const oa = ABY.options(a).map(o => o.i).join(), ob = ABY.options(b).map(o => o.i).join(); if (oa !== ob || strip(a) !== strip(b)) { diverged++; break; } for (const o of ABY.overnightFor(b)) if (/^w_/.test(o.id)) spoke.add(o.id);
        if (N[a.node].ending) { const e = ABY.endingOf(a); ends.add(e); if (e !== ABY.endingOf(b)) { diverged++; break; } const ca = ABY.carry(a), cb = ABY.carry(b); if (!ca || !cb) { if (!!ca !== !!cb) diverged++; break; } a = ca; b = cb; continue; }
        const opts = ABY.options(a); if (!opts.length) break; const pick = opts[Math.floor(rnd() * opts.length)].i; a = ABY.choose(a, pick); b = ABY.choose(b, pick); if (!a || !b) { if (!!a !== !!b) diverged++; break; }
      }
      runs++;
    }
    const days = new Set(W.map(x => DAY(N[x.at].ch)));
    rec('app-whispers', W.length === ABY.STORE.length && new Set(W.map(x => x.app)).size === W.length && new Set(W.map(x => x.at)).size === W.length && bad.length === 0 && reads.length === 0 && quiet && heard && diverged === 0 && spoke.size >= 6 && days.size === 6 && W.some(x => x.fx === 'flicker' && x.req.noLight) && W.some(x => x.fx === 'ring'),
      W.length + ' installed apps each speak once on Day Two to Day Seven (' + W.filter(x => x.fx).map(x => x.app + ': ' + x.fx).join(', ') + '); no choice reads an app; ' + runs + ' seeded journeys replayed with every app and with none: ' + diverged + ' diverged (' + ends.size + ' endings reached, ' + spoke.size + ' of the apps heard on the way)' + (bad.length ? ' | BAD ' + bad.join(', ') : '') + (reads.length ? ' | READ BY ' + reads.join(', ') : ''));
  }
  { // app clues: four installed apps also leave a clue, the other half of a deduction's second pair (`alt` in ABY.LINKS). The app stands in for a clue
    // her journey missed, so it opens a deduction that already exists (its hidden choice is proven by evidence-board): no new scene, choice or ending.
    // Proved from REAL reached states standing where the app speaks WITHOUT the clue it replaces: install the app there, search forward, and the
    // deduction's hidden choice is offered at its scene while she still has never held the original clue.
    const C = ABY.APP_WHISPERS.filter(w => w.note), AL = ABY.LINKS.filter(l => l.alt), pairOf = w => AL.filter(l => l.alt.includes(w.note))[0];
    const halves = w => { const L = pairOf(w), keep = L.alt.filter(k => k !== w.note)[0]; return { L, keep, lost: [L.a, L.b].filter(k => k !== keep)[0] }; };
    const shaped = C.filter(w => { const n = ABY.NOTES[w.note]; if (!pairOf(w) || !n || !n.title || !n.text || w.note !== 'a_' + w.app) return false; const { L, keep, lost } = halves(w);
      return [L.a, L.b].includes(keep) && lost !== w.note && ids.every(id => N[id].note !== w.note) && ABY.OVERNIGHT.every(o => o.note !== w.note) && ABY.linkOf(w.note, keep) === L && ABY.linkOf(w.note, lost) === null; });
    const opened = [], shut = [];
    for (const w of C.filter(x => pairOf(x))) {
      const { L, keep, lost } = halves(w), m = byNode.get(w.at), seeds = m ? [...m.values()].filter(x => !x.notes.includes(lost) && !x.flags['link_' + L.id]) : [];
      // the app installed on the way in: arriving here, its whisper files the clue (as `_land` does). The search is steered by `toward` (first to the scene
      // that files the clue it pairs with, then to the deduction's scene); steering only orders it, so whatever it finds is a real journey
      const toKeep = toward(ids.filter(id => N[id].note === keep)[0] || L.at), toAt = toward(L.at), far = s => s.notes.includes(keep) ? toAt(s.node) : toKeep(s.node) + 1000;
      const B = [], vis = new Set(), put = s => { const d = far(s); if (d < Infinity) (B[d] || (B[d] = [])).push(s); };
      seeds.map(x => Object.assign({}, x, { flags: Object.assign({}, x.flags, { ['app_' + w.app]: 1 }), notes: x.notes.concat(w.note) })).forEach(put);
      let found = false;
      for (let n = 0; n < 200000 && !found; n++) {
        const d = B.findIndex(b => b && b.length); if (d < 0) break; let s = B[d].pop();
        if (!s.flags['link_' + L.id] && s.notes.includes(keep)) { const u = ABY.link(s, w.note, keep); if (u) { delete u.linked; s = u; } }
        const k = key(s) + '|' + s.notes.includes(keep); if (vis.has(k)) continue; vis.add(k);
        if (s.node === L.at && !s.notes.includes(lost) && ABY.options(s).some(o => (N[s.node].choices[o.i].req || {}).flag === 'link_' + L.id)) found = true;
        for (const t of succ(s)) if (!t.notes.includes(lost)) put(t);
      }
      (found ? opened : shut).push(w.app + ' -> ' + L.id + (found ? '' : ' (' + seeds.length + ' seeds)'));
    }
    rec('app-clues', C.length >= 4 && AL.length === C.length && shaped.length === C.length && opened.length === C.length,
      C.length + ' installed apps leave a clue that stands in for one her journey missed (' + opened.join(', ') + '): from real states without the original clue, the deduction\'s hidden choice opens; no new scene or ending' + (shut.length ? ' | NOT OPENED ' + shut.join(', ') : '') + (shaped.length < C.length ? ' | BAD ' + C.filter(w => !shaped.includes(w)).map(w => w.app).join(', ') : ''));
  }
  { // time slips: the Clock turns back (a flashback) or forward (a flash-forward) and always returns. A slip is a safe scene entered from exactly one scene of its
    // own day, never from another slip; every choice in it returns to where she was and sets its own `tt_` flag (so it is seen once); a slip's flag is read by a
    // choice on a LATER scene of the same or a later day (what she saw matters); each of the five origins offers one of each; the slips file clues
    const slips = ids.filter(id => N[id].time && !N[id].thread), entries = ids.flatMap(id => (N[id].choices || []).filter(c => N[c.next] && N[c.next].time && !N[c.next].thread).map(c => ({ from: id, to: c.next, c })));
    const tt = id => [...new Set(N[id].choices.map(c => c.set))];
    const readers = (f) => ids.filter(id => !N[id].time && (N[id].choices || []).some(c => c.req && (c.req.flag === f || (c.req.all || []).includes(f))));
    const dayOf = id => N[id].ch, shapedSlip = slips.filter(id => ['past', 'future'].includes(N[id].time) && N[id].safe && N[id].choices.length >= 2 && N[id].choices.every(c => c.next === '@back') && tt(id).length === 1 && /^tt_/.test(tt(id)[0])
      && entries.filter(e => e.to === id).length === 1 && N[id].note && ABY.NOTES[N[id].note] && reach.has(id));
    const entryOk = entries.every(e => !N[e.from].time && dayOf(e.from) === dayOf(e.to) && e.c.req && e.c.req.noflag === tt(e.to)[0] && N[e.to].choices.every(c => c.set === tt(e.to)[0]));
    const pays = slips.filter(id => readers(tt(id)[0]).some(r => dayOf(r) >= dayOf(id))), origins = [...new Set(entries.map(e => e.from))];
    const both = origins.every(o => ['past', 'future'].every(t => entries.some(e => e.from === o && N[e.to].time === t)));
    // behaviour: a slip remembers and returns; being in one never interrupts her (no blackout, no hollowing) but the return does; a save keeps the way back
    const o0 = Object.assign(ABY.newState(0), { node: 'd3_wake', bat: 40 }), inside = ABY.choose(o0, o0 ? N.d3_wake.choices.findIndex(c => c.next === 'fb_locking') : 0);
    const out = inside && ABY.choose(inside, 0), again = out && ABY.options(out).some(x => x.c.next === 'fb_locking'), tired = ABY.choose(Object.assign(ABY.newState(0), { node: 'fb_locking', back: 'd3_wake', bat: 1, dread: 5 }), 1);
    const kept = ABY.cleanState(JSON.parse(JSON.stringify(inside || {}))), lost = ABY.cleanState({ node: 'fb_locking', back: '' });
    rec('time-slips', slips.length === 10 && shapedSlip.length === slips.length && entries.length === 10 && entryOk && origins.length === 5 && both && pays.length === slips.length
      && inside && inside.node === 'fb_locking' && inside.back === 'd3_wake' && out && out.node === 'd3_wake' && out.back === '' && out.flags.tt_locking === 1 && out.notes.includes('locking') && !again
      && tired && tired.node === 'blackout' && kept.node === 'fb_locking' && kept.back === 'd3_wake' && lost.node === ABY.START,
      slips.length + ' slips (5 flashbacks, 5 flash-forwards) from ' + origins.join(', ') + ': each seen once, each returns where she was, each filing a clue, each read by a later choice; a tired return can still end in the dark; a save keeps the way back');
  }
  { // THE ROAD, LONGER: beats on the most-travelled links of every day. A beat is a pure pass-through: all its choices are free and go to one scene,
    // set and add nothing, and it is entered from exactly one scene; walking through it leaves her exactly where the old link did (light on or off)
    const B = ids.filter(id => N[id].beat), into = id => ids.filter(x => (N[x].choices || []).some(c => c.next === id));
    const shaped = B.filter(id => { const n = N[id], t = n.choices[0] && n.choices[0].next, src = into(id);
      return n.safe && !n.dark && !n.note && !n.ending && !n.call && !n.song && !n.time && !n.img && n.text.length > 200 && n.choices.length >= 1 && n.choices.every(c => c.next === t && c.free && !c.add && !c.set && !c.req && c.light === undefined && !c.retry)
        && N[t] && !N[t].beat && DAY(N[t].ch) === DAY(n.ch) && src.length === 1 && DAY(N[src[0]].ch) === DAY(n.ch); });
    const same = B.every(id => { const src = into(id)[0], t = N[id].choices[0].next; return [0, 1].every(light => { const s = Object.assign(ABY.newState(0), { node: src, bat: 40, light, heart: 2, resolve: 2, trust: 2, dread: 1, flags: { knew_name: 1, wren_with: 1, promised_sorrel: 1, tt_nine: 1, scar_cradle: 1, scar_loop: 1 } });
      const i = N[src].choices.findIndex(c => c.next === id), a = ABY.choose(s, i), b = a && ABY.choose(a, 0);
      const c = N[src].choices[i]; c.next = t; const d = ABY.choose(s, i); c.next = id;   // the old link, taken directly: landing on the scene (a dark room, a clue) is the same either way
      return a && b && d && b.node === t && d.node === t && ['heart', 'resolve', 'trust', 'dread', 'bat', 'light', 'mem', 'back'].every(f => b[f] === d[f]) && JSON.stringify(b.flags) === JSON.stringify(d.flags) && b.notes.join() === d.notes.join(); }); });
    const days = new Set(B.map(id => DAY(N[id].ch)));
    rec('beats', B.length >= 35 && shaped.length === B.length && same && days.size === 7 && B.every(id => reach.has(id)), B.length + ' beats on the most-travelled links of all ' + days.size + ' days (' + shaped.length + ' shaped), each reached, each a free pass-through that leaves her exactly where the old link did, with the flashlight on or off');
  }
  { // MORE CALLS THROUGH THE WEEK: fourteen optional chains, two per day (the first on the first scene), no two on one scene. Each is offered once from one scene (a choice that costs nothing),
    // rings, rings louder if declined, and finally answers itself; every end returns to the scene she left and sets rg_done_<k>, so nothing about the story changes
    const O = { home1: 'awakening_b', vey2: 'd2_lull', home3: 'd3_stare', eye4: 'd4_delete', corvin5: 'd5_hang', queen6: 'd6_wall', queen7: 'd7_again',   // the first ring
      you1: 'stones_path', queen2: 'd2_turn', corvin3: 'd3_fork', before4: 'd4_bottom', vey5: 'd5_truth', wren6: 'd6_who', you7: 'd7_queen' }, K = Object.keys(O);   // the second ring
    const inert = c => c.bat === 0 && !c.add && !c.light && !c.note && !c.song && !c.req;
    const shaped = K.filter(k => {
      const r1 = N['rg_' + k], r2 = N['rg_' + k + '_2'], r3 = N['rg_' + k + '_3'], a = N['rg_' + k + '_a'], b = N['rg_' + k + '_b'], o = N[O[k]], day = DAY(o.ch);
      const entry = o.choices.filter(c => c.next === 'rg_' + k);
      return r1 && r2 && r3 && a && b && [r1, r2, r3, a, b].every(n => DAY(n.ch) === day && !n.dark && !n.note && !n.ending) && [r1, r2, r3].every(n => n.call)
        && (r1.call.ring || 1) < r2.call.ring && r2.call.ring < r3.call.ring && r3.call.ring === 3 && r1.choices.length === 2 && r2.choices.length === 2 && r3.choices.length === 1
        && r1.choices[0].next === 'rg_' + k + '_a' && r1.choices[1].next === 'rg_' + k + '_2' && r2.choices[0].next === 'rg_' + k + '_a' && r2.choices[1].next === 'rg_' + k + '_3' && r3.choices[0].next === 'rg_' + k + '_b'
        && [r1, r2, r3].every(n => n.choices.every(inert)) && a.choices.length === 2 && b.choices.length === 1 && [a, b].every(n => n.text.length > 200 && n.choices.every(c => c.next === O[k] && c.bat === 0 && c.set === 'rg_done_' + k && !c.add && !c.req))
        && entry.length === 1 && entry[0].bat === 0 && !entry[0].add && entry[0].req && entry[0].req.noflag === 'rg_done_' + k;
    });
    const days = new Set(K.map(k => DAY(N[O[k]].ch))), perDay = [0, 1, 2, 3, 4, 5, 6].every(d => K.filter(k => DAY(N[O[k]].ch) === d).length === 2), apart = new Set(Object.values(O)).size === K.length, start = k => Object.assign(ABY.newState(0), { node: O[k], bat: 40 });
    const run = k => { let s = start(k); const i = s.node && N[O[k]].choices.findIndex(c => c.next === 'rg_' + k); s = ABY.choose(s, i); s = ABY.choose(s, 1); s = ABY.choose(s, 1); s = ABY.choose(s, 0); return s && ABY.choose(s, 0); };   // enter, decline, decline, it answers itself, put the phone down
    const same = K.every(k => { const base = start(k), e = run(k); return e && e.node === O[k] && ['heart', 'resolve', 'trust', 'dread', 'bat', 'light', 'mem'].every(f => e[f] === base[f]) && e.notes.filter(n => n !== N[O[k]].note).join() === base.notes.join() && e.flags['rg_done_' + k] === 1 && Object.keys(e.flags).length === 1 && !ABY.options(e).some(o => o.c.next === 'rg_' + k) && ABY.options(e).length === ABY.options(base).length - 1; });
    rec('ring-detours', shaped.length === 14 && days.size === 7 && perDay && apart && same, shaped.length + ' of 14 call chains (' + K.map(k => N['rg_' + k].call.from).join(', ') + ') on ' + days.size + ' days, two a day on different scenes, each offered once for free, ringing louder and then answering itself; every end returns to the scene she left and moves no stat');
  }
  { // THE FIRST SCENE, DEEPER: awakening (the opening every first journey gets) is a three-scene prologue too, then the same three ways into the haze it always had
    const a = N.awakening, b = N.awakening_b, c = N.awakening_c;
    const exits = c && c.choices.map(x => x.next).join();
    rec('first-scene-prologue', a && b && c && a.choices.length === 3 && a.choices.every(x => x.next === 'awakening_b' && !x.req) && b.choices.filter(x => x.next === 'awakening_c' && !x.req).length === 2 && b.choices.length === 3 && b.choices.some(x => x.next === 'rg_home1')
      && c.note === 'o_awake' && ABY.NOTES.o_awake && [['4', 'd4_wake', 9], ['6', 'd6_dawn', 11]].every(([d, at, ch]) => { const e = N['ec' + d + '_awake'], into = N[at].choices.filter(x => x.next === 'ec' + d + '_awake'); return e && e.thread === 'awakening' && e.time === 'past' && e.safe && e.ch === ch && e.choices.length >= 2 && e.choices.every(x => x.next === '@back' && x.set === 'tt_echo' + d) && e.text.length > 150 && into.length === 1 && into[0].req.open === 'awakening' && into[0].req.noflag === 'tt_echo' + d; }) && exits === 'flute_path,stones_path,unknown_sms' && b.text.length > 150 && c.text.length > 150 && a.ch === 1 && b.ch === 1 && c.ch === 1,
      'the first scene is a three-scene prologue (awakening -> awakening_b -> awakening_c, filing the clue o_awake) that ends in the same three ways it always had: ' + exits);
  }
  { // THE BEGINNINGS, DEEPER: each of the nine other openings is a three-scene prologue (react -> the scene that is only its own -> the clue, then the same three ways
    // into the haze it always had), files its own clue, and returns as a flashback on Day Four and Day Six, offered only to a journey that began that way
    const others = ABY.OPENINGS.filter(o => o !== ABY.START), key = o => o.slice(3), op = o => N[o], texts = new Set();
    const chain = others.filter(o => {
      const b = N[o + '_b'], c = N[o + '_c']; if (!b || !c) return false; texts.add(b.text); texts.add(c.text);
      return op(o).choices.length >= 3 && op(o).choices.every(x => x.next === o + '_b') && b.choices.length >= 2 && b.choices.every(x => x.next === o + '_c' && !x.req)
        && b.ch === 1 && c.ch === 1 && c.note && ABY.NOTES[c.note] && /^o_/.test(c.note) && c.choices.length >= 3 && c.choices.every(x => N[x.next] && !/^op_/.test(x.next) && !x.req) && b.text.length > 150 && c.text.length > 150;
    });
    const echoes = others.every(o => ['4', '6'].every(d => {
      const e = N['ec' + d + '_' + key(o)], flag = 'tt_echo' + d, origin = d === '4' ? 'd4_wake' : 'd6_dawn';
      const into = N[origin].choices.filter(c => c.next === 'ec' + d + '_' + key(o));
      return e && e.thread === o && e.time === 'past' && e.safe && e.ch === (d === '4' ? 9 : 11) && e.choices.length >= 2 && e.choices.every(c => c.next === '@back' && c.set === flag) && e.text.length > 150
        && into.length === 1 && into[0].req && into[0].req.open === o && into[0].req.noflag === flag;
    }));
    const pay = (node, f) => N[node].choices.some(c => c.req && c.req.flag === f);
    const seesAt = (node, open, flags) => ABY.options(Object.assign(ABY.newState(0, open), { node, flags: flags || {} })).filter(x => /clock back/.test(x.c.label)).map(x => x.c.next);
    const own = others.every(o => seesAt('d4_wake', o).filter(n => /^ec4_/.test(n)).join() === 'ec4_' + key(o) && seesAt('d6_dawn', o).filter(n => /^ec6_/.test(n)).join() === 'ec6_' + key(o)
      && seesAt('d4_wake', o, { tt_echo4: 1 }).every(n => !/^ec4_/.test(n)) && seesAt('d6_dawn', o, { tt_echo6: 1 }).every(n => !/^ec6_/.test(n)));
    const none = seesAt('d4_wake', ABY.START).every(n => !/^ec/.test(n) || n === 'ec4_awake') && seesAt('d6_dawn', ABY.START).every(n => !/^ec/.test(n) || n === 'ec6_awake');   // the first opening sees only its own
    const go = ABY.choose(Object.assign(ABY.newState(0, 'op_lift'), { node: 'd4_wake' }), N.d4_wake.choices.findIndex(c => c.next === 'ec4_lift')), back = go && ABY.choose(go, 0);
    const walkIn = (() => { let s = ABY.newState(0, 'op_bath'); for (const want of ['op_bath_b', 'op_bath_c']) { s = ABY.choose(s, 0); if (!s || s.node !== want) return null; } return s; })();
    rec('opening-threads', chain.length === 9 && texts.size === 18 && echoes && pay('d5_truth', 'tt_echo4') && pay('d7_eye', 'tt_echo6') && own && none
      && go && go.node === 'ec4_lift' && go.back === 'd4_wake' && back && back.node === 'd4_wake' && back.flags.tt_echo4 === 1 && back.open === 'op_lift'
      && walkIn && walkIn.node === 'op_bath_c' && walkIn.notes.includes('o_bath') && walkIn.open === 'op_bath' && walkIn.choices === 2,
      'nine three-scene prologues (' + chain.length + ' of 9 chained, 18 scenes of their own, each filing its clue), each returning as a flashback on Day Four and Day Six for the journey that began that way (' + others.length * 2 + ' echoes), read by Wren\u2019s Day Five and the Eye on Day Seven; the first journey sees only its own (the haze)');
  }
  { // SIDE ROADS: a reply said the long way round. Three scenes beside one reply of a day (its twin): the way in costs exactly what the reply costs,
    // every choice inside is free and does nothing, and every way out arrives where the reply goes; so from any state, any path through the road leaves
    // her exactly where the reply does (flashlight on or off). One a day from Day Two to Day Seven; Day Seven's is a second way to the last page
    const RD = ABY.ROADS, inert = c => c.free && c.bat === 0 && !c.add && !c.set && !c.req && c.light === undefined && !c.retry && !c.note && !c.song;
    const shaped = RD.filter(r => { const from = N[r.from], twin = from && from.choices.filter(c => c.label === r.twin), way = from && from.choices.filter(c => c.next === r.id + '_a'), sc = ['a', 'b', 'c'].map(k => N[r.id + '_' + k]);
      if (!twin || twin.length !== 1 || way.length !== 1 || sc.some(n => !n)) return false; const t = twin[0], w = way[0], strip = c => JSON.stringify(Object.assign({}, c, { label: '', next: '', as: undefined }));
      return strip(w) === strip(t) && !t.req && w.label.length > t.label.length && N[t.next] && !N[t.next].road && !N[t.next].beat && DAY(N[t.next].ch) === DAY(from.ch)
        && sc.every((n, k) => n.road === r.id && n.safe && !n.dark && !n.note && !n.ending && !n.call && !n.song && !n.time && !n.img && !n.scare && n.ch === from.ch && ABY.SPEAKERS[n.speaker] && n.text.length > 200 && n.choices.length === 2
          && new Set(n.choices.map(c => c.label)).size === 2 && n.choices.every(c => inert(c) && c.next === (k < 2 ? r.id + '_' + 'abc'[k + 1] : t.next)))
        && ids.filter(id => (N[id].choices || []).some(c => c.next === r.id + '_a')).join() === r.from; });
    const same = RD.every(r => { const from = N[r.from], i = from.choices.findIndex(c => c.label === r.twin), j = from.choices.findIndex(c => c.next === r.id + '_a');
      return [0, 1].every(light => { const s = Object.assign(ABY.newState(0), { node: r.from, bat: 40, light, heart: 2, resolve: 2, trust: 2, dread: 1, flags: { knew_name: 1, wren_with: 1, promised_sorrel: 1, tt_nine: 1 } }), d = ABY.choose(s, i);
        // every one of the 8 paths through the road (two choices in each of three scenes)
        return d && [0, 1, 2, 3, 4, 5, 6, 7].every(p => { let a = ABY.choose(s, j); for (let k = 0; k < 3 && a; k++) a = ABY.choose(a, (p >> k) & 1);
          return a && a.node === d.node && ['heart', 'resolve', 'trust', 'dread', 'bat', 'light', 'mem', 'back'].every(f => a[f] === d[f]) && JSON.stringify(a.flags) === JSON.stringify(d.flags) && a.notes.join() === d.notes.join(); }); }); });
    const days = new Set(RD.map(r => DAY(N[r.from].ch))), texts = new Set(RD.flatMap(r => ['a', 'b', 'c'].map(k => N[r.id + '_' + k].text)));
    const last = RD.some(r => N[N[r.id + '_c'].choices[0].next] && r.from === 'd7_rite_win' && N[r.id + '_c'].choices[0].next === 'd7_end');
    rec('side-roads', RD.length === 6 && shaped.length === RD.length && same && days.size === 6 && !days.has(0) && texts.size === 18 && last && RD.every(r => ['a', 'b', 'c'].every(k => reach.has(r.id + '_' + k))),
      RD.length + ' side roads (' + RD.map(r => r.from + ' -> ' + N[r.id + '_c'].choices[0].next).join(', ') + '), ' + shaped.length + ' shaped, ' + texts.size + ' new scenes over ' + days.size + ' days, each reached: the way in is a copy of its reply, and all 8 paths through leave her exactly where the reply does, flashlight on or off; Day Seven\u2019s is a second way to the last page');
  }
  { // WHO YOU WERE: three people the player can be (ABY.HEROES). A choice of who, never of what: the "before" scene plays first and goes back to the opening
    // she was waking in, each flashback is offered once from one scene on Day Two, Four and Six (never one that speaks a once-only line) and returns there, every choice is free, sets
    // only its own tt_hero flag and adds nothing, and the overnight lines only talk. So a journey as anyone is the same journey, stat for stat
    const HS = ABY.HERO_IDS, DAYS = [[2, 'd2_you', 6], [4, 'd4_type', 9], [6, 'd6_story', 11]], WAKES = ['d2_wake', 'd3_wake', 'd4_wake', 'd5_wake', 'd6_wake', 'd7_wake'], quiet = c => c.free && !c.add && c.light === undefined && !c.retry;
    const shaped = HS.filter(h => { const i = N['hero_' + h];
      return ABY.HEROES.some(x => x.id === h && x.name && x.tag && x.blurb) && i && i.safe && i.thread === 'hero' && !i.time && i.ch === 1 && i.note === 'h_' + h && ABY.NOTES['h_' + h] && i.text.length > 300 && i.choices.length >= 2 && i.choices.every(c => c.next === '@back' && quiet(c) && !c.set && !c.req)
        && DAYS.every(([d, at, ch]) => { const f = N['hb' + d + '_' + h], into = N[at].choices.filter(c => c.next === 'hb' + d + '_' + h);
          return f && f.safe && f.thread === 'hero' && f.time === 'past' && f.ch === ch && !f.note && f.text.length > 300 && f.choices.length >= 2 && f.choices.every(c => c.next === '@back' && quiet(c) && c.set === 'tt_hero' + d && !c.req)
            && into.length === 1 && quiet(into[0]) && !into[0].set && into[0].req.hero === h && into[0].req.noflag === 'tt_hero' + d && !N[at].dark; })
        && WAKES.every(at => ABY.HERO_LINES.filter(m => m.at === at && m.req.hero === h && ABY.SPEAKERS[m.who] && m.text.length > 100 && (at === 'd4_wake' ? m.note === 'hc_' + h : !m.note)).length === 1); });
    const texts = new Set(HS.flatMap(h => ['hero_' + h, 'hb2_' + h, 'hb4_' + h, 'hb6_' + h].map(id => N[id] && N[id].text)).concat(ABY.HERO_LINES.map(m => m.text)));
    const STAT = ['heart', 'resolve', 'trust', 'dread', 'bat', 'light', 'mem', 'open'], same = (a, b) => STAT.every(f => a[f] === b[f]);
    const start = HS.every(h => ABY.OPENINGS.every(op => { const base = ABY.newState(3, op), a = ABY.heroStart(base, h), b = a && ABY.choose(a, 0), d = ABY._land(Object.assign({}, base, { flags: {}, notes: base.notes.slice(), choices: 1 }));
      return a.node === 'hero_' + h && a.back === op && b && b.node === op && b.hero === h && same(b, d) && JSON.stringify(b.flags) === JSON.stringify(d.flags) && b.notes.filter(n => n !== 'h_' + h).join() === d.notes.join() && b.notes.includes('h_' + h); }))
      && ABY.heroStart(ABY.newState(0), 'nobody').node === ABY.START && ABY.heroStart(ABY.heroStart(ABY.newState(0), 'jude'), 'rowan').hero === 'jude';
    const trip = HS.every(h => DAYS.every(([d, at]) => [0, 1].every(light => { const s = Object.assign(ABY.newState(2), { node: at, hero: h, bat: 30, light, heart: 2, trust: 1, dread: 2 }), i = N[at].choices.findIndex(c => c.next === 'hb' + d + '_' + h), a = ABY.choose(s, i), b = a && ABY.choose(a, 1), base = ABY._land(Object.assign({}, s, { flags: {}, notes: [] }));
      return a && a.node === 'hb' + d + '_' + h && b && b.node === at && b.hero === h && same(b, base) && Object.keys(b.flags).join() === 'tt_hero' + d && !ABY.options(b).some(o => /^hb/.test(o.c.next)) && HS.filter(x => x !== h).every(x => !ABY.options(s).some(o => o.c.next === 'hb' + d + '_' + x)); })))
      && DAYS.every(([, at]) => !ABY.options(Object.assign(ABY.newState(0), { node: at })).some(o => /^hb/.test(o.c.next)));
    const lines = HS.every(h => WAKES.every(at => ABY.overnightFor(Object.assign(ABY.newState(0), { node: at, hero: h })).filter(m => /^h_/.test(m.id)).length === 1))
      && WAKES.every(at => !ABY.overnightFor(Object.assign(ABY.newState(0), { node: at })).some(m => /^h_/.test(m.id)));
    // one reply a day in their own words: `as` changes what she says, never the choice (ABY.labelOf is display only), and only for that person
    const AS = ids.flatMap(id => (N[id].choices || []).filter(c => c.as).map(c => ({ id, c })));
    const said = AS.every(({ id, c }) => !N[id].call && !N[id].beat && !N[id].song && Object.keys(c.as).sort().join() === HS.slice().sort().join() && new Set(HS.map(h => c.as[h])).size === HS.length
      && HS.every(h => c.as[h].length > c.label.length && c.as[h] !== c.label && ABY.labelOf(c, { hero: h }) === c.as[h]) && ABY.labelOf(c, { hero: '' }) === c.label && ABY.labelOf(c, null) === c.label);
    const replyDays = new Set(AS.map(x => DAY(N[x.id].ch)));
    // a clue only that person is given (Day Four, with the overnight line), the third pair of a deduction that already exists: it stands in for the clue
    // her journey may have missed, on a later scene, so it opens a hidden choice the evidence board already proves; nobody else can ever hold it
    const filed = (k) => ids.filter(id => N[id].note === k || (N[id].choices || []).some(c => c.note === k)), dayOf = k => Math.min(...filed(k).map(id => DAY(N[id].ch)));
    const clued = HS.filter(h => { const L = ABY.LINKS.filter(l => l.hero && l.hero[0] === h), l = L[0]; if (L.length !== 1) return false; const [, k, keep] = l.hero, lost = [l.a, l.b].filter(x => x !== keep)[0];
      const st = Object.assign(ABY.newState(0), { node: l.at, hero: h, notes: [k, keep] }), u = ABY.link(st, k, keep);
      return k === 'hc_' + h && ABY.NOTES[k] && [l.a, l.b].includes(keep) && lost && filed(k).length === 0 && ABY.OVERNIGHT.concat(ABY.APP_WHISPERS || []).every(o => o.note !== k) && ABY.HERO_LINES.filter(m => m.note === k).length === 1
        && ABY.linkOf(k, keep) === l && ABY.linkOf(keep, k) === l && ABY.linkOf(k, lost) === null && ABY.helpedBy(k, keep) === '' && dayOf(keep) >= 3 && DAY(N[l.at].ch) >= dayOf(keep)
        && u && u.linked === l.id && u.bat === st.bat && u.dread === st.dread && (N[l.at].choices || []).some(c => c.req && c.req.flag === 'link_' + l.id) && ABY.options(u).some(c => c.c.req && c.c.req.flag === 'link_' + l.id); });
    const intoD4 = Object.keys(ABY.ENDINGS).filter(e => ABY.ENDINGS[e].cont === 'd4_wake')[0], carried = h => { const end = ids.filter(id => N[id].ending === intoD4)[0]; return end ? ABY.carry(Object.assign(ABY.newState(0), { node: end, hero: h })) : null; };
    const arrives = !!intoD4 && HS.every(h => { const c = carried(h); return c && c.node === 'd4_wake' && c.notes.includes('hc_' + h) && HS.filter(x => x !== h).every(x => !c.notes.includes('hc_' + x)); }) && !carried('').notes.some(n => /^hc_/.test(n));
    // a last message on every ending, one for each kind (a fall, an ending that carries on, a final one), always after the others and only for that person
    const kind = e => ABY.ENDINGS[e].fall ? 'fall' : ABY.ENDINGS[e].cont ? 'cont' : 'end', all = Object.assign(ABY.newState(0), { flags: Object.fromEntries(ABY.CODAS.map(c => [c.req.flag, 1])) });
    const closes = ABY.HERO_CODAS.length === HS.length * 3 && new Set(ABY.HERO_CODAS.map(c => c.text)).size === ABY.HERO_CODAS.length && ABY.HERO_CODAS.every(c => ABY.SPEAKERS[c.who] && c.text.length > 100)
      && ABY.ENDING_IDS.every(e => HS.every(h => { const s = Object.assign({}, all, { hero: h }), got = ABY.codasFor(e, s), mine = got[got.length - 1], rest = ABY.codasFor(e, all);
        return mine && mine.hero === h && mine.kind === kind(e) && got.length === rest.length + 1 && rest.every((c, i) => got[i] === c) && !rest.some(c => c.hero); }));
    const kept = ABY.cleanState({ hero: 'ellis', node: 'd2_wake' }).hero === 'ellis' && ABY.cleanState({ hero: 'nobody' }).hero === '' && ABY.carry(Object.assign(ABY.newState(0), { node: 'end_keeper', hero: 'rowan' })).hero === 'rowan'
      && ABY.wake(Object.assign(ABY.newState(0), { hero: 'jude' }), 2, 0).hero === 'jude' && ABY.choose(Object.assign(ABY.newState(0), { hero: 'jude' }), 0).hero === 'jude';
    rec('heroes', HS.length === 3 && shaped.length === 3 && texts.size === 30 && start && trip && lines && kept && AS.length >= 7 && said && replyDays.size === 7 && clued.length === 3 && ABY.LINKS.filter(l => l.hero).length === HS.length && arrives && closes,
      HS.length + ' people to be (' + ABY.HEROES.map(h => h.name + ', ' + h.tag.toLowerCase()).join('; ') + '), ' + shaped.length + ' shaped: a "before" scene that returns to every one of the ten openings, a flashback each on Day Two, Four and Six, an overnight line by name on all six wakes (' + texts.size + ' distinct texts); '
      + AS.length + ' replies said in their own words across ' + replyDays.size + ' days; ' + clued.length + ' clues only one of them holds, each a third pair for a deduction (' + ABY.LINKS.filter(l => l.hero).map(l => l.hero[0] + ': ' + l.id).join(', ') + '), filed on the Day Four wake' + (arrives ? '' : ' (NOT ON CARRY)') + '; '
      + ABY.HERO_CODAS.length + ' last messages, one for every ending as each of them' + (closes ? '' : ' (CODAS WRONG)') + '; every choice free, nothing moves a stat, the person is kept through a save, a carry and a wake');
  }
  { // confidences: five warm-bond memories (two scenes each) that only listen: nothing they touch can reach a gate, a rite or an ending
    const C = ids.filter(id => N[id].thread === 'confide'), PAIRS = [['d3_wake', 'GUARDIAN', 'corvin', { freed_name: 1 }], ['d4_wake', 'VEY', 'vey', { vey_known: 1 }], ['d5_dawn', 'WREN', 'wren', { riff_done: 1 }], ['d6_dawn', 'QUEEN', 'queen', { heard: 1 }], ['d7_gather', 'EYE', 'eye', { asked_eye: 1 }]];
    const inert = c => c.bat === 0 && !c.add && !c.light && !c.req && !c.song && !c.note && !c.give && !c.take && !c.obj && !c.cont, tallies = new Set(C.flatMap(id => N[id].choices.map(c => c.set).filter(Boolean)));
    const shaped = C.filter(id => N[id].time === 'past' && N[id].safe && !N[id].note && !N[id].dark && N[id].text.length > 250 && N[id].choices.length >= 2 && N[id].choices.every(c => inert(c) && (/_a$/.test(id) ? c.next === id.replace(/_a$/, '_b') && !c.set : c.next === '@back' && /^tt_conf_/.test(c.set))));
    const rows = PAIRS.map(([at, who, k, fl]) => {
      const into = N[at].choices.filter(c => c.next === 'cf_' + k + '_a'), c = into[0];
      const room = at === 'd6_dawn' || at === 'd7_gather' || /^d\d_(wake|dawn)$/.test(at);
      const base = Object.assign(ABY.newState(0), { node: at, flags: Object.assign({}, fl), bat: 40, heart: 2, resolve: 2, trust: 2, dread: 1 });
      const cold = Object.assign({}, base, { flags: {} }), mid = ABY.choose(base, N[at].choices.indexOf(c));
      let s = mid, steps = 0; while (s && s.node !== at && steps++ < 4) s = ABY.choose(s, 0);
      const same = s && s.node === at && ['heart', 'resolve', 'trust', 'dread', 'bat', 'light', 'mem'].every(f => s[f] === base[f]) && s.notes.join() === base.notes.join() && s.back === '' && Object.keys(s.flags).filter(f => !base.flags[f]).join() === 'tt_conf_' + k;
      const gone = s && !ABY.options(s).some(x => x.c.next === 'cf_' + k + '_a');
      const hidden = !ABY.options(cold).some(x => x.c.next === 'cf_' + k + '_a');
      return into.length === 1 && c.req && c.req.bond && c.req.bond.who === who && c.req.bond.min === 1 && c.req.noflag === 'tt_conf_' + k && inert(Object.assign({}, c, { req: null })) && !c.add && N[at].ch === N['cf_' + k + '_a'].ch && mid && mid.node === 'cf_' + k + '_a' && mid.back === at && same && gone && hidden;
    });
    rec('confidences', C.length === 10 && shaped.length === 10 && tallies.size === 5 && rows.length === 5 && rows.every(Boolean),
      '5 warm-bond confidences (' + C.length + ' scenes) from Day Three to Day Seven: each offered once and only to a player whose bond with that person is warm, each costs nothing (no battery, no light, no stat) and leaves every stat, the battery, the light, the clues and the way back exactly as it found them (only its own once-only flag is new), so no gate, rite or ending moves' + (rows.every(Boolean) ? '' : ' | BAD ' + PAIRS.filter((p, i) => !rows[i]).map(p => p[0]).join(', ')));
  }
  { // holders: Day Four's contact list is a book of five earlier holders (a hub and two scenes each) that costs nothing and returns where she left, so no gate, rite or ending moves
    const H = ids.filter(id => N[id].thread === 'holders'), KEYS = ['maren', 'nurse', 'paper', 'widow', 'radio'], hub = N.hold_hub;
    const free = c => c.bat === 0 && !c.add && !c.light && !c.song && !c.note && !c.give && !c.take && !c.obj && !c.cont;
    const shaped = H.every(id => N[id].time === 'past' && N[id].safe && !N[id].note && !N[id].dark && N[id].choices.every(free) && (id === 'hold_hub' || N[id].text.length > 250)
      && (/_a$/.test(id) ? N[id].choices.every(c => c.next === id.replace(/_a$/, '_b') && !c.set) : /_b$/.test(id) ? N[id].choices.every(c => c.next === '@back' && /^tt_hold_/.test(c.set)) : true));
    const base = Object.assign(ABY.newState(0), { node: 'd4_wake', bat: 40, heart: 2, resolve: 2, trust: 2, dread: 1, flags: { freed_name: 1 } });
    const enter = ABY.choose(base, N.d4_wake.choices.findIndex(c => c.next === 'hold_hub'));
    const offers = s => ABY.options(s).map(x => x.c.next);
    const readOne = (s, k) => { let t = ABY.choose(s, N[s.node].choices.findIndex(c => c.next === 'hold_' + k + '_a')); t = t && ABY.choose(t, 0); return t && ABY.choose(t, 0); };
    const same = (a, b) => ['heart', 'resolve', 'trust', 'dread', 'bat', 'light', 'mem'].every(f => a[f] === b[f]) && a.notes.join() === b.notes.join();
    let cur = enter, ok = !!(enter && enter.node === 'hold_hub' && enter.back === 'd4_wake' && offers(enter).length === 6), n = 0;
    for (const k of KEYS) { const after = ok && readOne(cur, k); if (!after || after.node !== 'hold_hub' && after.node !== 'd4_wake') { ok = false; break; } n++; cur = after.node === 'd4_wake' ? ABY.choose(after, N.d4_wake.choices.findIndex(c => c.next === 'hold_hub')) : after; }
    const seen = cur && cur.node === 'hold_hub' ? offers(cur) : [];
    const closed = enter && ABY.choose(enter, 5), reread = cur && cur.node === 'hold_hub' && offers(cur).join() === '@back';
    rec('holders', H.length === 11 && shaped && n === 5 && ok && reread && closed && closed.node === 'd4_wake' && same(closed, base) && closed.back === '' && Object.keys(closed.flags).join() === 'freed_name' && cur && same(cur, base) && Object.keys(cur.flags).filter(f => !base.flags[f]).sort().join() === KEYS.map(k => 'tt_hold_' + k).sort().join() && N.d4_wake.choices.filter(c => c.next === 'hold_hub').length === 1 && !N.d4_wake.choices.find(c => c.next === 'hold_hub').req,
      'five earlier holders (' + H.length + ' scenes: a hub and two each) in the Day Four contact book (opened from the Day Four wake): each read once, then gone from the list; reading or closing costs no battery, stat, light or clue and returns to the Day Four wake with only its own flag new, so no gate, rite or ending moves' + (reread ? '' : ' | after all five the book offers: ' + seen.join(',')));
  }
  { // objects: each is picked up once on a scene it loops back to, spent on a later chapter, and its use is remembered the next morning
    const O = ABY.OBJECTS, rows = O.map(o => {
      const picks = [], uses = [];
      for (const id in N) (N[id].choices || []).forEach(c => { if (c.set === 'has_' + o.id) picks.push({ id, c }); if (c.set === 'used_' + o.id) uses.push({ id, c }); });
      const p = picks[0], u = uses[0], said = ABY.OVERNIGHT.filter(m => m.req && m.req.flag === 'used_' + o.id);
      const ok = picks.length === 1 && uses.length === 1 && p.c.next === p.id && p.c.req.noflag === 'has_' + o.id && u.c.req.flag === 'has_' + o.id && u.c.req.noflag === 'used_' + o.id
        && N[u.id].ch > N[p.id].ch && said.length === 1 && /_wake$/.test(said[0].at) && +/^d(\d)/.exec(said[0].at)[1] > +/^d(\d)/.exec(u.id)[1];
      return { o, ok };
    });
    const s0 = ABY.newState(0), got = Object.assign({}, s0, { flags: { has_salt: 1, has_shard: 1, used_shard: 1 } }), clean = ABY.cleanState(JSON.parse(JSON.stringify(got)));
    {   // the epilogue: all five people write in all three tones, a warm bond gets the warm one, and a hostile or missing snapshot never throws
      const E = ABY.EPI_LINES, full = ABY.BOND_IDS.every(w => ABY.EPI_BANDS.every(b => typeof E[w][b] === 'string' && E[w][b].length > 40)), distinct = new Set(ABY.BOND_IDS.flatMap(w => ABY.EPI_BANDS.map(b => E[w][b]))).size === 15;
      const warmS = { flags: Object.fromEntries(ABY.BONDS.VEY.up.map(f => [f, 1])) }, snap = ABY.bondSnap(warmS), ep = ABY.epilogueFor(snap);
      rec('epilogue', full && distinct && ep.length === 5 && ep.find(m => m.who === 'VEY').band === 'warm' && ep.find(m => m.who === 'QUEEN').band === 'mid' && ABY.epilogueFor({ QUEEN: -2 }).find(m => m.who === 'QUEEN').band === 'cold'
        && ABY.epilogueFor(null).length === 5 && ABY.cleanSnap('x') === null && ABY.cleanSnap({ QUEEN: 99, VEY: 'a' }).QUEEN === 4 && ABY.cleanSnap({ VEY: 'a' }).VEY === 0,
        '5 people x 3 tones = 15 distinct messages; a warm Vey bond gets the warm one, a cold Queen the cold one, and a hostile or missing snapshot is cleaned');
    }
    rec('objects', O.length === 3 && O.length <= 3 && rows.every(r => r.ok) && ABY.carried(s0).length === 0 && ABY.carried(got).map(o => o.id).join() === 'salt' && clean.flags.has_salt === 1 && clean.flags.used_shard === 1 && !clean.flags.has_fake,
      O.length + ' objects (' + O.map(o => o.id).join(', ') + '), each picked up once, spent on a later day and remembered the morning after; a save keeps them');
  }
  { // echoes: every ending that is not a fall is remembered by someone on a later wake, and nothing else reads or sets the flag
    const E = ABY.ECHOES, good = ABY.ENDING_IDS.filter(id => !ABY.isFall(id)), dayOf = id => +/^d(\d)_wake$/.exec(id)[1];
    const bad = E.filter(e => !ABY.SPEAKERS[e.who] || !/_wake$/.test(e.at) || !N[e.at] || !e.text || e.req.flag !== 'echo_' + e.id.slice(7) || !good.includes(e.id.slice(7))).map(e => e.id);
    const found = ABY.ENDING_IDS.reduce((m, id) => (m[id] = 1, m), {}), vet = ABY.newState(0, ABY.START, found), cp = ABY.wake(Object.assign(ABY.newState(0), { node: 'd3_wake' }), 3, 0, found);
    const heard = at => ABY.overnightFor(Object.assign({}, vet, { node: at })).filter(x => /^n_echo_/.test(x.id)).length;
    const rookie = ABY.overnightFor(Object.assign(ABY.newState(0), { node: 'd2_wake' })).filter(x => /^n_echo_/.test(x.id)).length;
    const only = ABY.overnightFor(Object.assign(ABY.newState(0, ABY.START, { dawn: 1, crown: 1 }), { node: 'd2_wake' })).map(x => x.id).filter(x => /^n_echo_/.test(x));
    const kept = ABY.cleanState(JSON.parse(JSON.stringify(Object.assign({}, vet, { flags: Object.assign({}, vet.flags, { echo_crown: 1, echo_fake: 1 }) }))));
    rec('echoes', bad.length === 0 && E.length === good.length && good.every(id => E.some(e => e.id === 'n_echo_' + id)) && ABY.echoesOf(found).join() === good.join() && !ABY.echoesOf({ crown: 1 }).length
      && good.every(id => vet.flags['echo_' + id] === 1) && !ABY.ENDING_IDS.some(id => ABY.isFall(id) && vet.flags['echo_' + id]) && rookie === 0 && only.join() === 'n_echo_dawn' && cp.flags.echo_dawn === 1
      && ['d2_wake', 'd3_wake', 'd4_wake', 'd5_wake', 'd6_wake', 'd7_wake'].every(at => heard(at) >= 2 && heard(at) <= 4) && good.every(id => kept.flags['echo_' + id] === 1) && !kept.flags.echo_crown && !kept.flags.echo_fake,
      E.length + ' echoes, one per ending that is not a fall, spread over six wakes (' + ['d2_wake', 'd3_wake', 'd4_wake', 'd5_wake', 'd6_wake', 'd7_wake'].map(heard).join('/') + '); a new player hears none; a save and a wake keep them');
  }
  { // the trust ledger: how she treated each of the five is counted from flags her choices already set (no new state), and it is spent on Day Seven
    // (a warm or cold message, a person to stand with her). Every flag it counts must be set by a choice, and every bond rule must be one a player can meet
    const setAt = f => ids.filter(id => (N[id].choices || []).some(c => c.set === f)), bonded = ABY.OVERNIGHT.filter(o => o.req.bond);
    const choices = ids.flatMap(id => (N[id].choices || []).filter(c => c.req && c.req.bond).map(c => ({ id, c })));
    const rules = bonded.map(o => ({ at: o.at, ...o.req.bond })).concat(choices.map(x => ({ at: x.id, ...x.c.req.bond })));
    const before = f => setAt(f).some(id => reach.has(id) && N[id].ch < 12), ok = ABY.BOND_IDS.every(w => ABY.BONDS[w].up.every(before) && ABY.BONDS[w].down.every(before));
    const meet = r => r.min === undefined || ABY.BONDS[r.who].up.length >= r.min, cool = r => r.max === undefined || ABY.BONDS[r.who].down.length > -r.max - 1;
    const top = Object.fromEntries(ABY.BOND_IDS.map(w => [w, [...seen.values()].reduce((m, st) => Math.max(m, ABY.bond(st, w)), -9)]));
    const sample = ABY.newState(0), warm = Object.assign({}, sample, { flags: Object.fromEntries(ABY.BONDS.VEY.up.map(f => [f, 1])) }), cold = Object.assign({}, sample, { flags: { refused_vey: 1 } }), mixed = Object.assign({}, sample, { flags: { vey_known: 1, refused_vey: 1 } });
    const hear = (s, at) => ABY.overnightFor(Object.assign({}, s, { node: at })).map(x => x.id).join();
    rec('trust-ledger', ok && rules.length >= 8 && rules.every(r => ABY.BOND_IDS.includes(r.who) && meet(r) && cool(r)) && choices.length >= 4
      && ABY.bond(warm, 'VEY') === 4 && ABY.bond(cold, 'VEY') === -1 && ABY.bond(mixed, 'VEY') === 0 && ABY.bond(null, 'VEY') === 0 && ABY.bond(sample, 'NOBODY') === 0
      && hear(warm, 'd7_wake').includes('b_vey_warm') && !hear(warm, 'd7_wake').includes('b_vey_cold') && hear(cold, 'd7_wake').includes('b_vey_cold') && !hear(mixed, 'd7_wake').includes('b_vey')
      && ABY.BOND_IDS.every(w => bonded.some(o => o.at === 'd7_wake' && o.req.bond.who === w && o.req.bond.max === -1)) && ['b_queen_cold', 'b_guardian_cold', 'b_wren_cold'].every(id => hear(Object.assign({}, sample, { flags: { blamed_queen: 1, skipped_doors: 1, warned: 1, refused_vey: 1, refused_next: 1 } }), 'd7_wake').includes(id)) && !hear(sample, 'd7_wake').includes('_cold')
      && !ABY.options(Object.assign({}, sample, { node: 'd7_gather' })).some(o => o.c.req && o.c.req.bond) && ABY.options(Object.assign({}, warm, { node: 'd7_gather' })).some(o => o.c.req && o.c.req.bond && o.c.req.bond.who === 'VEY'),
      'best reached ' + JSON.stringify(top) + '; ' + ABY.BOND_IDS.length + ' bonds counted from ' + ABY.BOND_FLAGS.length + ' flags a choice already sets; ' + bonded.length + ' Day Seven messages (every person has a cold one as well as a warm one) and ' + choices.length + ' people who stand with her, all for a bond a player can reach; a stranger is offered none');
  }
  { // no choice does nothing: every flag a choice sets is read by something (a gated choice, an ending rule, a badge, an overnight message)
    const code = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'story.js'), 'utf8'), tail = code.slice(code.indexOf('ABY.endingFor'));
    const set = [...new Set(ids.flatMap(id => (N[id].choices || []).filter(c => c.set).map(c => c.set)))];
    const read = new Set(ids.flatMap(id => (N[id].choices || []).flatMap(c => c.req ? [c.req.flag, c.req.noflag, ...(c.req.all || [])] : [])).filter(Boolean).concat(ABY.OVERNIGHT.map(o => o.req.flag), ABY.BOND_FLAGS));
    const unread = set.filter(f => !read.has(f) && !new RegExp('\\b' + f + '\\b').test(tail));
    rec('every-flag-is-read', unread.length === 0, unread.join(', ') || set.length + ' flags set by choices, every one read by a gated choice, an ending rule, a badge or an overnight message');
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
  const deducedAll = Object.fromEntries(ABY.LINK_IDS.map(l => [l, 1]));
  for (const x of sts) { ABY.badgesFor(foundAll, x, deducedAll).forEach(b => earned.add(b)); lean.add(ABY.leaning(x)); }
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
  const base = Object.assign(ABY.newState(), { node: 'awakening_c' }), after = ABY.choose(base, 0);
  rec('choose-pure', base.resolve === 0 && after.resolve === 1 && after.node === 'flute_path' && ABY.choose(base, 9) === null && ABY.choose(Object.assign(ABY.newState(), { node: 'g_meet' }), 3) === null && base.notes.length === 0, 'a choice returns a new state; a bad or hidden choice is refused');
  const ST = ABY.STORE, sids = ST.map(a => a.id);
  const keyOk = k => k && Object.keys(k).length === 1 && ABY.STORE_KEYS.includes(Object.keys(k)[0]) && ('found' in k ? Number.isInteger(k.found) && k.found >= 0 && k.found <= ABY.ENDING_IDS.length : 'end' in k ? ABY.ENDING_IDS.includes(k.end) : 'helped' in k ? ABY.CLUE_APPS.includes(k.helped) : ABY.LINK_IDS.includes(k.link));
  rec('store-data', ST.length >= 4 && new Set(sids).size === sids.length && ST.every(a => a.name && a.glyph && a.tag && a.blurb && a.lore.length && a.c.length === 2 && keyOk(a.key) && ('found' in a.key || a.hint)) && ST.some(a => a.key.found === 0) && ST.some(a => a.key.found >= 3), 'unique ids, every listing complete, a free first app and a late one, each unlock a real ending count, ending or deduction (and a hint when it is not a count)');
  // the App Store's depth: listings opened by one ending (a fall too) or one deduction, and pages whose reviews know what she has done
  const bad = [];
  for (const a of ST) {
    if (!Array.isArray(a.reviews) || a.reviews.length < 2) bad.push(a.id + ': fewer than two reviews');
    else {
      if (!a.reviews.some(r => !r.key)) bad.push(a.id + ': no review anyone who opens it can read');
      for (const r of a.reviews) { if (!r.who || !r.text || !Number.isInteger(r.stars) || r.stars < 1 || r.stars > 5) bad.push(a.id + ': incomplete review'); if (r.key && !keyOk(r.key)) bad.push(a.id + ': review key ' + JSON.stringify(r.key)); if (r.key && JSON.stringify(r.key) === JSON.stringify(a.key)) bad.push(a.id + ': a review sealed by the listing\'s own key'); }
    }
  }
  const all = { found: Object.fromEntries(ABY.ENDING_IDS.map(id => [id, 1])), deduced: Object.fromEntries(ABY.LINK_IDS.map(id => [id, 1])), helped: Object.fromEntries(ABY.CLUE_APPS.map(id => [id, 1])) };
  if (ABY.storeOpen(all).length !== ST.length) bad.push('a listing never opens');
  if (ST.some(a => ABY.storeReviews(all, a.id).sealed)) bad.push('a review never opens');
  if (ABY.storeOpen({ found: {}, deduced: {} }).join() !== ST.filter(a => a.key.found === 0).map(a => a.id).join()) bad.push('a new phone opens more than the free listings');
  const byEnd = ST.filter(a => 'end' in a.key), byLink = ST.filter(a => 'link' in a.key);
  rec('store-depth', !bad.length && byEnd.some(a => ABY.isFall(a.key.end)) && byEnd.some(a => !ABY.isFall(a.key.end)) && byLink.length >= 1 && ST.every(a => a.reviews.some(r => r.key) || 'found' in a.key === false),
    bad.length ? bad.slice(0, 4).join('; ') : ST.length + ' listings (' + byEnd.length + ' opened by an ending, ' + byLink.length + ' by a deduction), ' + ST.reduce((t, a) => t + a.reviews.length, 0) + ' reviews (' + ST.reduce((t, a) => t + a.reviews.filter(r => r.key).length, 0) + ' only for someone who was there); all of it opens');
  { // the credit for an app's clue: only a pair holding an app's clue credits it (never the story's own pairs, never a wrong pair); each of those apps has a
    // review sealed until it helped her; and the credit is shown, never read: no scene, choice or overnight message mentions it
    const AL = ABY.LINKS.filter(l => l.alt), right = AL.every(l => { const app = ABY.clueApp(l.alt.filter(k => /^a_/.test(k))[0]); return app && ABY.helpedBy(l.alt[0], l.alt[1]) === app && ABY.helpedBy(l.alt[1], l.alt[0]) === app; });
    const plain = ABY.LINKS.every(l => ABY.helpedBy(l.a, l.b) === '') && ABY.helpedBy('a_cast', 'recording') === '' && ABY.clueApp('bargain') === '';
    const sealed = ABY.CLUE_APPS.every(app => { const a = ST.filter(x => x.id === app)[0], r = a.reviews.filter(x => x.key && x.key.helped === app); return r.length === 1 && !ABY.storeReviews({ found: {}, deduced: {} }, app).shown.includes(r[0]) && ABY.storeReviews({ helped: { [app]: 1 } }, app).shown.includes(r[0]); });
    const unread = !/"helped"|CLUE_APPS|clueApp/.test(JSON.stringify(ABY.NODES) + JSON.stringify(ABY.OVERNIGHT) + JSON.stringify(ABY.APP_WHISPERS));
    rec('app-credit', AL.length === ABY.CLUE_APPS.length && right && plain && sealed && unread, ABY.CLUE_APPS.length + ' apps are credited only for a deduction pinned with their own clue; each has a review that opens only once it has helped her; the story never reads the credit');
  }
  return R;
}

// The walk is the slow part and depends only on the story and on this file, so its result is kept: an unchanged story re-checks instantly
// (GRAPH_FRESH=1 forces a real walk). GRAPH_QUICK=1 walks a small slice and skips the checks that need the whole walk, for a fast look while editing.
const here = dirname(fileURLToPath(import.meta.url));
const NEEDS_FULL_WALK = new Set(['story-all-nodes-reachable', 'story-all-endings', 'hidden-choices', 'evidence-board', 'long-pairs', 'overnight-messages', 'trust-ledger', 'badges-and-factions']);
export function graphChecks() {
  if (process.env.GRAPH_QUICK) { process.env.WALK_LIMIT = process.env.WALK_LIMIT || '60000'; return walkChecks().map(r => NEEDS_FULL_WALK.has(r.id) && !r.pass ? { ...r, pass: true, note: 'SKIPPED in quick mode (needs the full walk) | ' + r.note } : r); }
  const sum = createHash('sha256').update(readFileSync(resolve(here, '..', 'src', 'story.js'))).update(readFileSync(fileURLToPath(import.meta.url))).update(String(process.env.WALK_LIMIT || '')).digest('hex');
  const file = resolve(here, '..', '..', '..', 'node_modules', '.cache', 'abyss-graph.json');
  if (!process.env.GRAPH_FRESH) { try { const c = JSON.parse(readFileSync(file, 'utf8')); if (c.sum === sum) return c.R; } catch (e) { /* no cache yet */ } }
  const R = walkChecks();
  try { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify({ sum, R })); } catch (e) { /* a read-only checkout just walks every time */ }
  return R;
}

if (process.argv[1] && process.argv[1].endsWith('graph.mjs')) {
  const R = graphChecks(); for (const r of R) console.log((r.pass ? 'PASS' : 'FAIL') + ' ' + r.id + ' - ' + r.note);
  const p = R.filter(r => r.pass).length; console.log('\n=== ' + p + '/' + R.length + ' passed ==='); process.exit(p === R.length ? 0 : 1);
}
