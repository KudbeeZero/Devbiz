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
};
