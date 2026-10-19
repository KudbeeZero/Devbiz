/* =====================================================================
 * Kudbee Abyss - song.js (THE SONG OF RECALL, the rhythm game)
 * Notes of the melody fall down three lanes (low / middle / high flute). Tap a lane as
 * its note reaches the light (touch the lane, or A S D / arrow keys). Every hit plays
 * that note of the song, so a good run is the song; a miss is a hole in it. Judging is
 * perfect (+-75 ms) / good (+-150 ms); the Guardian is freed when the run is 60% whole.
 * It draws on its own transparent canvas over the 3D scene (multi-touch aware).
 * ===================================================================== */
var ABY = window.ABY = window.ABY || {};

ABY.Song = (function () {
  var Sg = { active: false, t: 0, notes: [], stats: null, bot: false, rate: 1, WIN: 0.6, LEAD: 2.2, FALL: 1.7, P: 0.075, G: 0.15 };
  // the melody: [index into the flute scale, steps after the last note]  (a step is 0.42 s)
  var MEL0 = [[2, 0], [3, 1], [5, 1], [3, 1], [2, 1], [0, 2], [2, 1], [3, 1], [5, 1], [7, 1], [5, 2], [3, 1], [2, 1], [3, 1], [5, 1], [7, 1], [9, 1], [8, 2], [7, 1], [5, 1], [3, 1], [5, 1], [3, 1], [2, 1], [0, 2], [2, 2], [0, 3]];
  var MEL, STEP = 0.42, cv, cx, W = 1, H = 1, dpr = 1, lanes = [], cb = null, finishAt = 0, shake = 0, flash = [0, 0, 0], hint = 1, held = {};
  var COL0 = ['#ff6ec7', '#39e6ff', '#ffd34d'], COL = COL0, STEP0 = 0.42, fxq = [], fxs = [], name = 'SONG OF RECALL', tint = null, redT = 0, doorT = 0, crackT = 0, bloodT = 0, darkT = 0, drips = [];

  function laneOf(idx) { return idx <= 2 ? 0 : idx <= 5 ? 1 : 2; }

  Sg.init = function (canvas) {
    cv = canvas; cx = cv.getContext('2d');
    cv.addEventListener('pointerdown', function (e) { if (!Sg.active) return; e.preventDefault(); var r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; held[e.pointerId] = 1; tapAt(x, y); }, { passive: false });
    cv.addEventListener('pointerup', function (e) { delete held[e.pointerId]; }); cv.addEventListener('pointercancel', function (e) { delete held[e.pointerId]; });
    window.addEventListener('keydown', function (e) {
      if (!Sg.active || e.repeat) return; var k = e.key.toLowerCase(), l = { a: 0, arrowleft: 0, j: 0, s: 1, arrowdown: 1, k: 1, d: 2, arrowright: 2, l: 2 }[k];
      if (l !== undefined) { e.preventDefault(); press(l); }
    });
    Sg.resize();
  };

  Sg.resize = function () {
    if (!cv) return; var r = cv.parentNode.getBoundingClientRect(); W = Math.max(2, r.width); H = Math.max(2, r.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2); cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px';
    var land = W / H >= 1.05, span = land ? Math.min(W * 0.46, 470) : Math.min(W * 0.92, 430), cxm = land ? W * 0.5 : W * 0.5, w = span / 3;
    lanes = [0, 1, 2].map(function (i) { return { x: cxm - span / 2 + w * (i + 0.5), w: w }; });
    Sg.hitY = H * (land ? 0.78 : 0.76); Sg.topY = H * (land ? 0.2 : 0.17); Sg.R = Math.max(26, Math.min(w * 0.36, 46));
  };

  // begin: done(won, {perfect, good, miss, acc}); `chart` (an ABY.RITES entry) plays a rite instead of the Song of Recall: its melody, its colours,
  // and its haunting (timed doors, cracks, flashes, blood), which only dresses the page and never changes what has to be hit
  Sg.start = function (done, chart) {
    MEL = chart ? chart.mel : MEL0; STEP = chart ? chart.step : STEP0; COL = chart ? chart.lanes : COL0; name = chart ? chart.name : 'SONG OF RECALL'; tint = chart ? chart.tint : null;
    fxq = chart ? chart.fx.map(function (f) { return { t: f[0] * STEP, k: f[1] }; }) : []; fxs = []; redT = doorT = crackT = bloodT = darkT = 0; drips = [];
    Sg.resize(); cb = done; Sg.t = -Sg.LEAD; Sg.notes = []; held = {}; flash = [0, 0, 0]; hint = 1; shake = 0;
    var t = 0; MEL.forEach(function (m) { t += m[1] * STEP; Sg.notes.push({ t: t, idx: m[0], lane: laneOf(m[0]), s: 0 }); });
    Sg.last = Sg.notes[Sg.notes.length - 1].t; Sg.stats = { perfect: 0, good: 0, miss: 0, total: Sg.notes.length, acc: 0, streak: 0, best: 0 };
    Sg.active = true; Sg.ending = false; finishAt = Sg.last + 1.4;
    if (ABY.Audio) ABY.Audio.duck(0.45);
  };
  Sg.stop = function () { Sg.active = false; if (cx) cx.clearRect(0, 0, cv.width, cv.height); if (ABY.Audio) ABY.Audio.duck(1); };

  function tapAt(x, y) { var best = -1, d = 1e9; for (var i = 0; i < 3; i++) { var dx = Math.abs(x - lanes[i].x); if (dx < d) { d = dx; best = i; } } if (d < lanes[best].w * 0.75 + 20) press(best); }

  function press(l) {
    flash[l] = 1; hint = 0; var n = null;
    for (var i = 0; i < Sg.notes.length; i++) { var o = Sg.notes[i]; if (o.s === 0 && o.lane === l && Math.abs(o.t - Sg.t) <= Sg.G) { n = o; break; } if (o.t - Sg.t > Sg.G) break; }
    if (!n) { if (ABY.Audio) ABY.Audio.sfx('miss'); return; }
    var err = Math.abs(n.t - Sg.t); n.s = err <= Sg.P ? 1 : 2; n.hitAt = Sg.t; n.hx = lanes[l].x;
    Sg.stats[n.s === 1 ? 'perfect' : 'good']++; Sg.stats.streak++; Sg.stats.best = Math.max(Sg.stats.best, Sg.stats.streak);
    if (ABY.Audio) { ABY.Audio.flute(ABY.Audio.scale[n.idx], 1.3, n.s === 1 ? 0.2 : 0.15, 0, true); ABY.Audio.buzz(8); }
    if (ABY.Scene) ABY.Scene.burst(lanes[l].x, Sg.hitY, n.s === 1 ? 0xffffff : parseInt(COL[l].slice(1), 16), n.s === 1 ? 22 : 12, 3);
  }
  Sg.laneX = function (l) { return lanes[l].x; };               // (the evaluator taps where a lane is)
  Sg.press = press;                                           // (the evaluator and the bot press lanes through this)

  Sg.score = function () { var s = Sg.stats; return s ? (s.perfect + s.good * 0.65) / s.total : 0; };

  // one haunting event: its sound, and what it does to the page (a rite only)
  function haunt(k) {
    var A = ABY.Audio, calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; if (A) A.sfx(k === 'flash' ? 'thud' : k === 'blood' ? 'drip' : k === 'dark' ? 'knock' : k);
    if (k === 'door') { doorT = 1; shake = Math.max(shake, 0.5); } else if (k === 'crack') { crackT = 1; shake = 1; fxs.push({ x: 0.15 + Math.random() * 0.7, s: Math.random() * 6 }); }
    else if (k === 'flash') { redT = 1; } else if (k === 'knock' || k === 'thud') { shake = 0.8; } else if (k === 'scream') { redT = 1; shake = 1; darkT = 0.7; }
    else if (k === 'blood') { bloodT = 1; for (var i = 0; i < 9; i++) drips.push({ x: 0.1 + Math.random() * 0.8, y: -Math.random() * 40, v: 40 + Math.random() * 90, r: 2 + Math.random() * 3 }); }
    else if (k === 'dark') darkT = 1; else if (k === 'drip') { drips.push({ x: 0.2 + Math.random() * 0.6, y: 0, v: 60, r: 3 }); bloodT = Math.max(bloodT, 0.3); }
    if (calm) { shake = 0; redT = Math.min(redT, 0.25); darkT = Math.min(darkT, 0.25); }   // reduced motion: the sound stays, the flashing and shaking go
  }
  // the dressing, painted behind the lanes: a door swinging open, a crack across the glass, blood running, a red flash, the dark closing in
  function dress() {
    var i;
    if (tint) { cx.save(); cx.globalAlpha = 0.14; cx.fillStyle = tint; cx.fillRect(0, 0, W, H); cx.restore(); }
    if (doorT > 0.01) {
      var o = 1 - doorT, dw = Math.min(W * 0.34, 220), dh = Math.min(H * 0.6, 340), x0 = W * 0.5 - dw / 2, y0 = H * 0.1;
      cx.save(); cx.globalAlpha = Math.min(1, doorT * 1.6); cx.fillStyle = '#ffd9a0'; cx.fillRect(x0, y0, dw, dh);   // the light behind it
      var sw = dw * (1 - 0.82 * Math.sin(Math.min(1, o * 1.5) * 1.5708)); cx.fillStyle = '#2a1208'; cx.fillRect(x0, y0, sw, dh);   // the leaf, hinged at the left
      cx.strokeStyle = '#6b3a1c'; cx.lineWidth = 4; cx.strokeRect(x0, y0, dw, dh); cx.fillStyle = '#c9954a'; cx.beginPath(); cx.arc(x0 + sw - 10, y0 + dh * 0.52, 5, 0, 6.2832); cx.fill(); cx.restore();
    }
    for (i = 0; i < fxs.length; i++) {
      var c = fxs[i], a = Math.min(1, 0.25 + crackT); cx.save(); cx.globalAlpha = a * 0.8; cx.strokeStyle = '#fff'; cx.lineWidth = 2; cx.beginPath();
      var px = c.x * W, py = 0; cx.moveTo(px, py); for (var j = 1; j < 9; j++) { px += Math.sin(c.s + j * 2.1) * W * 0.05; py = H * j / 8; cx.lineTo(px, py); } cx.stroke(); cx.restore();
    }
    if (bloodT > 0.02) {
      cx.save(); cx.globalAlpha = Math.min(0.9, bloodT); cx.fillStyle = '#9b0f1c'; var h = H * 0.07 * bloodT; cx.fillRect(0, 0, W, h);
      for (i = 0; i < drips.length; i++) { var d = drips[i]; cx.beginPath(); cx.arc(d.x * W, d.y, d.r, 0, 6.2832); cx.fill(); cx.fillRect(d.x * W - d.r * 0.4, 0, d.r * 0.8, Math.max(0, d.y)); } cx.restore();
    }
    if (darkT > 0.02) { var g = cx.createRadialGradient(W / 2, H * 0.6, H * 0.15, W / 2, H * 0.6, H * 0.8); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,' + Math.min(0.9, darkT) + ')'); cx.fillStyle = g; cx.fillRect(0, 0, W, H); }
    if (redT > 0.02) { cx.save(); cx.globalAlpha = Math.min(0.7, redT * 0.7); cx.fillStyle = redT > 0.8 ? '#fff' : '#b1001a'; cx.fillRect(0, 0, W, H); cx.restore(); }
  }

  Sg.update = function (dt) {
    if (!Sg.active) return; dt = Math.min(dt, 0.05) * Sg.rate; Sg.t += dt; shake *= 0.9;
    for (var i = 0; i < 3; i++) flash[i] *= 0.86;
    redT *= 0.93; doorT = Math.max(0, doorT - dt * 0.7); crackT *= 0.97; bloodT *= 0.985; darkT *= 0.94;
    while (fxq.length && Sg.t >= fxq[0].t) haunt(fxq.shift().k);
    for (i = drips.length - 1; i >= 0; i--) { var dp = drips[i]; dp.y += dp.v * dt; dp.v += 260 * dt; if (dp.y > H || bloodT < 0.02) drips.splice(i, 1); }
    for (i = 0; i < Sg.notes.length; i++) {
      var n = Sg.notes[i];
      if (Sg.bot && n.s === 0 && Sg.t >= n.t) press(n.lane);                           // test bot: a perfect player
      if (n.s === 0 && Sg.t > n.t + Sg.G) { n.s = 3; Sg.stats.miss++; Sg.stats.streak = 0; shake = 1; if (ABY.Audio) { ABY.Audio.sfx('miss'); } if (tint) { redT = Math.max(redT, 0.5); if (Sg.stats.miss % 3 === 0) haunt('crack'); } }
    }
    if (Sg.t > finishAt && !Sg.ending) {
      Sg.ending = true; Sg.stats.acc = Sg.score(); var won = Sg.stats.acc >= Sg.WIN, d = cb; Sg.stop(); if (d) d(won, Sg.stats);
    }
  };

  Sg.draw = function () {
    if (!Sg.active || !cx) return; cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.clearRect(0, 0, W, H);
    dress();
    var sx = (Math.random() - 0.5) * shake * 6; cx.save(); cx.translate(sx, 0);
    var hy = Sg.hitY, top = Sg.topY, R = Sg.R, i;
    // lanes
    for (i = 0; i < 3; i++) {
      var L = lanes[i], g = cx.createLinearGradient(0, top, 0, hy + R * 1.4); g.addColorStop(0, 'rgba(10,6,30,0)'); g.addColorStop(1, 'rgba(10,6,30,0.55)');
      cx.fillStyle = g; cx.fillRect(L.x - L.w * 0.46, top, L.w * 0.92, hy + R * 1.4 - top);
      cx.strokeStyle = 'rgba(255,255,255,0.10)'; cx.lineWidth = 1; cx.beginPath(); cx.moveTo(L.x - L.w * 0.46, top); cx.lineTo(L.x - L.w * 0.46, hy + R * 1.4); cx.stroke();
    }
    // the light each note must reach
    for (i = 0; i < 3; i++) {
      var Lx = lanes[i].x, f = flash[i], col = COL[i];
      cx.save(); cx.shadowColor = col; cx.shadowBlur = 18 + f * 30; cx.strokeStyle = col; cx.lineWidth = 3 + f * 3; cx.globalAlpha = 0.65 + f * 0.35;
      cx.beginPath(); cx.arc(Lx, hy, R, 0, 6.2832); cx.stroke(); cx.restore();
      if (f > 0.05) { cx.fillStyle = col; cx.globalAlpha = f * 0.35; cx.beginPath(); cx.arc(Lx, hy, R * 1.05, 0, 6.2832); cx.fill(); cx.globalAlpha = 1; }
    }
    // notes
    for (i = 0; i < Sg.notes.length; i++) {
      var n = Sg.notes[i], p = 1 - (n.t - Sg.t) / Sg.FALL; if (p < 0 || n.s === 3 && p > 1.25) continue;
      var Lm = lanes[n.lane], y = top + (hy - top) * p, c = COL[n.lane];
      if (n.s === 1 || n.s === 2) { var a = 1 - (Sg.t - n.hitAt) / 0.35; if (a <= 0) continue; cx.globalAlpha = a; cx.fillStyle = '#fff'; cx.beginPath(); cx.arc(Lm.x, hy, R * (1 + (1 - a) * 1.2), 0, 6.2832); cx.globalAlpha = a * 0.5; cx.fill(); cx.globalAlpha = 1; continue; }
      var r = R * (0.55 + 0.45 * Math.min(1, p)); cx.globalAlpha = n.s === 3 ? Math.max(0, 1.25 - p) * 0.5 : 1;
      cx.save(); cx.shadowColor = c; cx.shadowBlur = 20; cx.fillStyle = n.s === 3 ? '#555' : c; cx.beginPath(); cx.arc(Lm.x, y, r, 0, 6.2832); cx.fill(); cx.restore();
      cx.fillStyle = 'rgba(255,255,255,0.85)'; cx.beginPath(); cx.arc(Lm.x - r * 0.25, y - r * 0.25, r * 0.28, 0, 6.2832); cx.fill(); cx.globalAlpha = 1;
    }
    cx.restore();
    // header: progress, run score, streak
    var span = lanes[2].x - lanes[0].x + lanes[0].w, x0 = lanes[0].x - lanes[0].w / 2, pr = Math.max(0, Math.min(1, (Sg.t + Sg.LEAD) / (Sg.last + Sg.LEAD)));
    cx.fillStyle = 'rgba(255,255,255,0.12)'; cx.fillRect(x0, Math.max(10, top - 26), span, 5); cx.fillStyle = '#39e6ff'; cx.fillRect(x0, Math.max(10, top - 26), span * pr, 5);
    cx.textAlign = 'center'; cx.fillStyle = '#fff'; cx.font = '700 ' + Math.max(12, Math.min(16, W * 0.02)) + 'px "Space Grotesk", sans-serif';
    cx.fillText(name + '   ' + Math.round(Sg.score() * 100) + '%   ' + (Sg.stats.streak > 2 ? 'x' + Sg.stats.streak : ''), W / 2, Math.max(10, top - 26) - 8);
    if (hint > 0 && Sg.t > -Sg.LEAD + 0.4) { cx.globalAlpha = Math.min(1, hint) * (0.6 + 0.4 * Math.sin(performance.now() * 0.006)); cx.fillStyle = '#e8eef8'; cx.font = '600 ' + Math.max(13, Math.min(17, W * 0.022)) + 'px "Inter", sans-serif'; cx.fillText('Tap the lane when a note reaches the light', W / 2, hy + R * 2.05); cx.globalAlpha = 1; }
  };
  return Sg;
})();
