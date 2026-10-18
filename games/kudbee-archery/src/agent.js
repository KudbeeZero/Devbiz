/* =====================================================================
 * Kudbee Archery — agent.js  (DOM-free: runs in Node for tests)
 * THE AGENT: a coach that rides along with you. It reads your last arrows
 * (where they landed against the gold, the wind each one flew in, how far
 * you drew, how long you held) and says what is going wrong in plain words,
 * then points you at your next goals: a quest, a level, a trophy, gear.
 * Rules, not a model - it runs offline and sends nothing anywhere.
 * ===================================================================== */

KAR.Agent = {
  NAME: 'ROBIN',
  KEEP: 12,                      // shots remembered (this session only)
  // record one of your arrows. s: { dx, dy (m from the gold, + right / up), wind, power, held, steady, ring, short, w (ring width, m), mv (moving target), tire }
  note(log, s) { log.push(s); if (log.length > this.KEEP) log.shift(); return log; },

  // what it sees in your last arrows: a list of tips, the most useful first. { id, line (in-game, short), text (the panel) }
  read(log) {
    const L = log.slice(-9), out = [];
    if (L.length < 3) return [{ id: 'warm', line: 'SHOOT A FEW - I’M WATCHING', text: 'shoot three arrows and I’ll tell you what I see' }];
    const n = L.length, mean = f => L.reduce((a, s) => a + f(s), 0) / n;
    const w = mean(s => s.w), hits = L.filter(s => !s.short);
    const shorts = n - hits.length, pw = mean(s => s.power);
    // 1. short draws: the arrow is slow and drops (or never reaches the butt)
    if ((shorts >= 1 && pw < 0.97) || (pw < 0.9 && hits.length && hits.reduce((a, s) => a + s.dy, 0) / hits.length < -1.5 * w))
      out.push({ id: 'draw', line: 'DRAW ALL THE WAY - SHORT DRAWS DROP LOW', text: 'you’re loosing before full draw (' + Math.round(pw * 100) + '% on average): the arrow flies slow and drops. wait for the click at full draw' });
    if (hits.length >= 3) {
      // 2. the wind: + = pushed downwind (not holding off enough), - = holding off too much
      const windy = hits.filter(s => Math.abs(s.wind) >= 0.6 && !s.mv);
      if (windy.length >= 2) {
        const e = windy.reduce((a, s) => a + s.dx * Math.sign(s.wind), 0) / windy.length / w;
        if (e > 1.2) out.push({ id: 'under', line: 'THE WIND IS WINNING - AIM MORE INTO IT', text: 'your arrows land ' + e.toFixed(1) + ' rings downwind: hold off further into the wind (the flags and gauge show which way it blows)' });
        else if (e < -1.2) out.push({ id: 'over', line: 'TOO MUCH HOLD-OFF - AIM CLOSER TO THE GOLD', text: 'you’re aiming off too far: your arrows land ' + (-e).toFixed(1) + ' rings upwind. trust the wind a little less' });
      }
      // 3. a steady miss up or down (sight picture) when the draw is fine
      const dy = hits.reduce((a, s) => a + s.dy, 0) / hits.length / w;
      if (!out.some(t => t.id === 'draw') && Math.abs(dy) > 1.6) out.push({ id: dy > 0 ? 'high' : 'low', line: dy > 0 ? 'GROUPING HIGH - AIM A TOUCH LOWER' : 'GROUPING LOW - AIM A TOUCH HIGHER', text: 'your group sits ' + Math.abs(dy).toFixed(1) + ' rings ' + (dy > 0 ? 'high' : 'low') + ': move your sight the other way by that much' });
      // 4. the spread around your own group: tired arms, or a wobbly hold
      const cx = hits.reduce((a, s) => a + s.dx, 0) / hits.length, cy = hits.reduce((a, s) => a + s.dy, 0) / hits.length;
      const sd = Math.sqrt(hits.reduce((a, s) => a + (s.dx - cx) ** 2 + (s.dy - cy) ** 2, 0) / hits.length) / w;
      const tired = hits.filter(s => s.held > KAR.CFG.STEADY_T / (s.tire || 1)).length / hits.length, steady = hits.filter(s => s.steady).length / hits.length;
      if (sd > 2.2 && tired >= 0.5) out.push({ id: 'tired', line: 'LOOSE SOONER - THE SIGHT SHAKES IF YOU HOLD', text: 'you hold full draw too long: after ' + (KAR.CFG.STEADY_T / (hits[0].tire || 1)).toFixed(1) + ' s your arm tires and the sight shakes. settle, then loose' });
      else if (sd > 2.2 && steady < 0.5) out.push({ id: 'breath', line: 'HOLD YOUR BREATH AS YOU AIM', text: 'your group is ' + sd.toFixed(1) + ' rings wide. hold your breath (SPACE, or the BREATH button) while you settle: the sight goes calm' });
      // 5. all good: push on
      const avg = hits.reduce((a, s) => a + s.ring, 0) / n;
      if (!out.length && avg >= 9) out.push({ id: 'hot', line: 'YOU’RE ON FIRE - KEEP THAT RHYTHM', text: 'averaging ' + avg.toFixed(1) + ' a shot: you’re ready for a longer distance or the next level' });
    }
    if (!out.length) out.push({ id: 'ok', line: 'NICE AND CENTRED - KEEP GOING', text: 'nothing wrong I can see: your misses go every way, which is just luck. keep the same routine' });
    return out;
  },

  // your next goals from the save: [{ kind, text }]
  plan(D, tips) {
    const out = [];
    // the quest closest to done
    if (KAR.questToday) {
      const Q = KAR.questToday(D), open = Q.q.map(x => ({ x, d: KAR.questDef(x.id) })).filter(o => !o.x.claimed);
      const ready = open.find(o => o.x.have >= o.d.n);
      if (ready) out.push({ kind: 'quest', text: 'CLAIM YOUR QUEST: ' + ready.d.text + '  (+' + ready.d.gems + ' gems)' });
      else if (open.length) { const o = open.sort((a, b) => b.x.have / b.d.n - a.x.have / a.d.n)[0]; out.push({ kind: 'quest', text: 'QUEST: ' + o.d.text + '  ·  ' + o.x.have + '/' + o.d.n + '  (+' + o.d.gems + ' gems)' }); }
    }
    // the first open level short of 3 stars
    if (KAR.TOUR && D.tour) for (let i = 0; i < KAR.TOUR.length; i++) if (KAR.tourOpen(i, D) && D.tour.stars[i] < 3) { const s = D.tour.stars[i]; out.push({ kind: 'level', text: 'LEVEL ' + (i + 1) + ' ' + KAR.TOUR[i].name + (s ? '  ·  ' + s + '★ - go for 3' : '  ·  not cleared yet') }); break; }
    // the trophy closest to done
    if (KAR.ACH) {
      const left = KAR.ACH.filter(a => !KAR.achDone(a, D)).map(a => ({ a, k: Math.min(1, (a.val(D) || 0) / a.n) })).sort((p, q) => q.k - p.k)[0];
      if (left) out.push({ kind: 'trophy', text: 'TROPHY: ' + left.a.name + ' - ' + left.a.text + '  ·  ' + Math.round(left.k * 100) + '%' });
    }
    // gear that answers your main problem
    const g = this.gear(D, tips && tips[0] && tips[0].id);
    if (g) out.push({ kind: 'gear', text: g });
    return out;
  },

  // which bow or arrow helps with a tip (equip it if you own it, else how many gems it costs)
  gear(D, id) {
    if (!KAR.KIT || !D.kit) return null;
    const pick = { under: ['arrow', 2], over: ['arrow', 2], draw: ['arrow', 2], tired: ['bow', 1], breath: ['bow', 1] }[id];
    if (!pick) return null;
    const [kind, i] = pick, it = KAR.KIT[kind][i], why = { under: 'drifts less in the wind', over: 'drifts less in the wind', draw: 'forgives short draws', tired: 'the steadiest sight', breath: 'the steadiest sight' }[id];
    if (D.kit[kind] === i) return null;
    if (KAR.kitOwned(D, kind, i)) return 'GEAR: equip the ' + it.name + ' - ' + why;
    return 'GEAR: the ' + it.name + ' ' + why + '  ·  ' + (D.gems >= it.cost ? 'you can buy it now (' + it.cost + ' gems)' : (it.cost - D.gems) + ' more gems');
  },

  // ---- ASK ROBIN: tap a question, get an answer worked out from your own game ----
  QS: [
    { id: 'wind',  q: 'HOW DO I READ THE WIND?' },
    { id: 'kit',   q: 'WHICH BOW & ARROWS?' },
    { id: 'stars', q: 'HOW DO I GET 3 STARS?' },
    { id: 'me',    q: 'HOW AM I DOING?' },
  ],
  // how far a centred arrow drifts in a wind of 2 at each distance, in rings of that face (the physics, not a table)
  drift(i) {
    const C = KAR.CFG, d = C.DISTS[i], s = KAR.Flight.solve(d, 0, C.FACE_Y), h = KAR.Flight.run(d, s.yaw, s.pitch, C.V0, 2).hit;
    return h ? h.x / (C.FACE[i] / 20) : 0;
  },
  // your average wind error over the arrows it remembers (rings; + = pushed downwind), or null
  windErr(log) {
    const L = log.filter(s => !s.short && !s.mv && Math.abs(s.wind) >= 0.6);
    return L.length >= 2 ? L.reduce((a, s) => a + s.dx * Math.sign(s.wind) / s.w, 0) / L.length : null;
  },
  answer(id, D, log) {
    const tips = this.read(log), top = tips[0] && tips[0].id;
    if (id === 'wind') {
      const e = this.windErr(log);
      return 'the WIND box shows how hard it blows and the arrow shows where to; the flags lean the same way. aim off INTO it - toward where it comes from. in a wind of 2 a centred arrow drifts about ' + this.drift(0).toFixed(1) + ' rings at 18 m, ' + this.drift(1).toFixed(1) + ' at 30 m and ' + this.drift(2).toFixed(1) + ' at 50 m, so double the wind, double the aim-off. '
        + (e === null ? 'shoot a few in the wind and I’ll tell you how you’re reading it.' : e > 1 ? 'you’re landing ' + e.toFixed(1) + ' rings downwind: aim off more.' : e < -1 ? 'you’re aiming off ' + (-e).toFixed(1) + ' rings too far: aim off less.' : 'your wind reads are spot on - keep it up.');
    }
    if (id === 'kit') {
      const k = this.gear(D, top), b = KAR.KIT.bow[D.kit.bow | 0], a = KAR.KIT.arrow[D.kit.arrow | 0];
      return 'you shoot the ' + b.name + ' with ' + a.name + ' arrows and have ' + D.gems + ' gems (from DAILY QUESTS). '
        + (k ? k.replace(/^GEAR: /, '') + '. ' : 'nothing in your shooting asks for different kit right now. ')
        + 'rough guide: wind beats you - CARBON or HEAVY CEDAR; a wobbly sight - HUNTER LONGBOW; you rush your draw - HEAVY CEDAR; you want speed - OLYMPIC or COMPOUND (loose quickly with the compound).';
    }
    if (id === 'stars') {
      let i = -1;
      for (let j = 0; j < KAR.TOUR.length; j++) if (KAR.tourOpen(j, D) && D.tour.stars[j] < 3) { i = j; break; }
      if (i < 0) return 'you have 3 stars on every level you can play - try the DAILY, a duel against LEGEND, or 70 m on the RANGE.';
      const L = KAR.TOUR[i], n = L.ends * 3, need = L.stars[2], per = need / n;
      return 'LEVEL ' + (i + 1) + ' ' + L.name + ': ' + L.ends + ' ends of 3 arrows, ' + need + ' points for 3 stars - an average of ' + per.toFixed(1) + ' an arrow'
        + (per >= 9 ? ', so nearly every arrow in the gold. ' : per >= 8 ? ', so mostly golds and reds. ' : '. ') + 'your best there is ' + D.tour.best[i] + '. tip: ' + L.tip + '.'
        + (top && top !== 'ok' && top !== 'warm' && top !== 'hot' ? ' and fix this first: ' + tips[0].line.toLowerCase() + '.' : '');
    }
    const st = D.stats, gold = st.arrows ? Math.round(st.tens / st.arrows * 100) : 0, L = log.filter(s => !s.short), avg = L.length ? log.reduce((a, s) => a + s.ring, 0) / log.length : 0;
    if (!st.arrows) return 'you haven’t shot yet! start with LEVELS: level 1 is a calm day at 18 m.';
    return st.arrows + ' arrows so far: ' + st.tens + ' tens (' + gold + '%), ' + st.xs + ' X, a best streak of ' + st.bestStreak + ' golds' + (st.robins ? ', and ' + st.robins + ' ROBIN HOOD' + (st.robins > 1 ? 's' : '') : '') + '. '
      + (log.length ? 'your last ' + log.length + ' average ' + avg.toFixed(1) + '. ' : '') + (tips[0] ? tips[0].text + '.' : '');
  },

  // one line for the results card: how this round went, and the thing to work on
  debrief(round) {
    const L = round.filter(s => s), n = L.length;
    if (n < 3) return null;
    const avg = L.reduce((a, s) => a + s.ring, 0) / n, golds = L.filter(s => s.ring >= 9).length, tip = this.read(L)[0];
    const head = 'AVG ' + avg.toFixed(1) + '  ·  ' + golds + '/' + n + ' GOLD';
    return { head, line: tip.id === 'ok' || tip.id === 'warm' ? (avg >= 8 ? 'SOLID ROUND - SAME AGAIN!' : 'NO PATTERN - KEEP A STEADY ROUTINE') : tip.line };
  },

  // a remembered shot from a save: every field present, finite and in range (a bad save is dropped, not trusted)
  clean(s) {
    if (!s || typeof s !== 'object') return null;
    const n = (v, lo, hi) => typeof v === 'number' && isFinite(v) && v >= lo && v <= hi;
    if (!n(s.dx, -5, 5) || !n(s.dy, -5, 5) || !n(s.wind, -20, 20) || !n(s.power, 0, 1) || !n(s.held, 0, 60) || !n(s.w, 0.005, 0.2) || !n(s.tire, 0.1, 5) || !Number.isInteger(s.ring) || s.ring < 0 || s.ring > 10) return null;
    const r = v => Math.round(v * 1e4) / 1e4;
    return { dx: r(s.dx), dy: r(s.dy), wind: r(s.wind), power: r(s.power), held: r(s.held), steady: !!s.steady, ring: s.ring, short: !!s.short, w: r(s.w), mv: !!s.mv, tire: s.tire };
  },
};
