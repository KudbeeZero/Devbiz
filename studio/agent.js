/* ===========================================================================
 * KUDBEE Studio Hub — agent.js
 * The Studio Agent: a deterministic analytics engine that reads your stats
 * across every game, spots patterns, coaches your weak spots, generates a
 * daily challenge, and powers a chat-style Q&A. No AI key required — pure
 * rules, runs fully local. (A future owner-gated upgrade can swap in an LLM
 * for richer commentary; the interface is the same window.Agent.chat().)
 * ========================================================================= */
(function () {
  'use strict';
  var S = window.KDStudio;

  var TIPS = {
    pinball: {
      drain_left: "You're draining left a lot. The left rescue bumper cluster punches balls back to center — and aim for the inlane, not the outlane gap.",
      drain_right: "Right-side drains dominating. Same fix: ride the right rescue bank, and time your flip a hair earlier on right-outlane shots.",
      low_combo: "Your combos fizzle. Stop swinging at random — pick ONE chain: ramp to drops to ramp. Three different shots in 4 seconds is a named combo every time.",
      no_secrets: "You haven't found a secret pocket yet. Send a hard shot into the dead space by each wall (upper corners, lower corners) — they shimmer.",
      multiball_hunter: "You've never seen multiball. Lock balls in the center saucer (below the ramp exit) instead of always shooting the ramp.",
      tilt_prone: "You tilt out often. Nudge sparingly — the warning flash gives you one nudge of grace. Bank it, don't burn it."
    },
    darts: {
      too_soft: "Your flicks read TOO SOFT. Commit to the swipe — power under 0.82 sags the dart low. Hit the green band on the gauge.",
      too_hard: "TOO HARD — you're overshooting. Shorten the swipe, same speed. The dart sails outward on a max-power flick.",
      no_180s: "You've yet to throw a 180. Three straight treble-20s. Line up the reticle high and trust the flick.",
      checkout_blind: "You're leaving big checkouts. Study the board's suggested finish and practice the route before you need it under pressure."
    },
    orbital: {
      die_early: "Early hull breaches. Newtonian drift is the killer — you thrust, you keep moving. Tap thrust in pulses; never hold it.",
      low_waves: "You're not reaching high waves. Let drones clump, then chain-kill for combo multiplier. Shield plus rapid-fire pickup timing is everything.",
      ignore_pickups: "You're sailing past powerups. Shield, rapid-fire, and bomb each swing a wave's difficulty curve — grab them first."
    },
    puzzles: {
      par_hog: "You're beating par by wide margins. On 4x4 boards, solve in your head BEFORE you click — visualize the rotations, then execute.",
      stuck_later: "Later boards trip you up. The wrap-around edges are the trick: a tile's north can connect to the bottom row. Think torus, not grid.",
      no_threes: "You're settling for 1-star clears. Every board has a par solution — reset and chase three stars before advancing."
    }
  };

  function snapshot() {
    var g = S.games();
    var pin = g.pinball || {}, dar = g.darts || {}, orb = g.orbital || {}, puz = g.puzzles || {};
    var totPlays = (pin.plays || 0) + (dar.plays || 0) + (orb.plays || 0) + (puz.plays || 0);
    return { pin: pin, dar: dar, orb: orb, puz: puz, totPlays: totPlays,
             level: S.terra().level, xp: S.profile().xp };
  }

  // Score each dimension 0..1 to find your weakest link.
  function weakness() {
    var sn = snapshot();
    var cands = [];
    if ((sn.pin.plays || 0) > 2 && (sn.pin.total || 0) / Math.max(1, sn.pin.plays) < 8000)
      cands.push({ game: 'pinball', dim: 'low_combo', score: 0.8 });
    if ((sn.dar.plays || 0) > 2 && (sn.dar.total || 0) / Math.max(1, sn.dar.plays) < 2000)
      cands.push({ game: 'darts', dim: 'too_soft', score: 0.7 });
    if ((sn.orb.plays || 0) > 1 && (sn.orb.best || 0) < 5000)
      cands.push({ game: 'orbital', dim: 'die_early', score: 0.75 });
    if ((sn.puz.plays || 0) > 1 && (sn.puz.total || 0) / Math.max(1, sn.puz.plays) < 3)
      cands.push({ game: 'puzzles', dim: 'par_hog', score: 0.6 });
    if (!sn.pin.plays) cands.push({ game: 'pinball', dim: 'no_secrets', score: 0.9 });
    if (!sn.dar.plays) cands.push({ game: 'darts', dim: 'checkout_blind', score: 0.9 });
    cands.sort(function (a, b) { return b.score - a.score; });
    return cands[0] || { game: 'pinball', dim: 'low_combo', score: 0.5 };
  }

  function coachText(w) { var t = TIPS[w.game] || {}; return t[w.dim] || "Keep playing — the more data I get, the sharper my reads."; }

  // Deterministic daily challenge (seeded by day).
  function dailyChallenge() {
    var day = Math.floor(Date.now() / 86400000);
    var pool = [
      { game: 'pinball', text: 'Rip a TRIPLE LOOP in one ball (all 3 ramps).', xp: 150 },
      { game: 'pinball', text: 'Light all 4 secret pockets in a single game.', xp: 200 },
      { game: 'darts',   text: 'Throw a 180 (three straight treble-20s).', xp: 150 },
      { game: 'darts',   text: 'Finish a 501 leg with a checkout over 80.', xp: 200 },
      { game: 'orbital', text: 'Reach wave 10 with a 4x combo active.', xp: 180 },
      { game: 'puzzles', text: 'Three-star any 6x6 board.', xp: 150 },
      { game: 'any',     text: 'Score in 3 different games today.', xp: 250 },
      { game: 'pinball', text: 'Go a full game without tilting.', xp: 120 }
    ];
    var c = pool[day % pool.length];
    c.id = 'daily_' + day; c.day = day;
    return c;
  }

  // Trend: compare last N score events to the N before. +1 / 0 / -1.
  function trend(gameKey) {
    var h = S.history(40).filter(function (e) { return e.game === gameKey && e.event === 'score'; });
    if (h.length < 4) return 0;
    var mid = Math.floor(h.length / 2);
    var a = 0, b = 0;
    for (var i = 0; i < mid; i++) a += h[i].payload || 0;
    for (var j = mid; j < h.length; j++) b += h[j].payload || 0;
    var avgA = a / mid, avgB = b / (h.length - mid);
    if (avgB > avgA * 1.15) return 1;
    if (avgB < avgA * 0.85) return -1;
    return 0;
  }

  function summary() {
    var sn = snapshot();
    var lines = [];
    lines.push('Level ' + sn.level + ' · ' + sn.xp.toLocaleString() + ' XP · ' + sn.totPlays + ' total plays.');
    var fav = '—', favN = 0;
    [['pinball', sn.pin.plays], ['darts', sn.dar.plays], ['orbital', sn.orb.plays], ['puzzles', sn.puz.plays]].forEach(function (p) {
      if ((p[1] || 0) > favN) { favN = p[1] || 0; fav = p[0]; }
    });
    if (favN) lines.push('Most-played: ' + fav + ' (' + favN + ' runs).');
    return lines;
  }

  // Public surface. window.Agent is the "agent-driven" face of the Hub.
  window.Agent = {
    snapshot: snapshot,
    weakness: weakness,
    coach: function () { return coachText(weakness()); },
    daily: dailyChallenge,
    trend: trend,
    summary: summary,
    card: function () { var w = weakness(); return { title: w.game.toUpperCase() + ' COACHING', body: coachText(w), game: w.game, dim: w.dim, score: w.score }; },
    chat: function (msg) {
      msg = (msg || '').toLowerCase();
      if (/daily|challenge|today/.test(msg)) { var d = dailyChallenge(); return "Today's challenge: " + d.text + ' (+' + d.xp + ' XP)'; }
      if (/weak|coach|help|advice/.test(msg)) return coachText(weakness());
      if (/trend|better|worse|improving/.test(msg)) {
        var t = trend('pinball');
        return t === 1 ? "Trending UP on pinball — scores climbing."
             : t === -1 ? "Pinball scores dipping. Focus on the coaching tip."
             : "Pinball's holding steady.";
      }
      if (/summary|stats|how am i|standing/.test(msg)) return summary().join(' ');
      return "Ask me about: your daily challenge, coaching/weakness, trends, or summary.";
    }
  };
})();
