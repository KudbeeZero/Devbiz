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
  var Sg = { active: false, t: 0, notes: [], stats: null, bot: false, WIN: 0.6, LEAD: 2.2, FALL: 1.7, P: 0.075, G: 0.15 };
  // the melody: [index into the flute scale, steps after the last note]  (a step is 0.42 s)
  var MEL = [[2, 0], [3, 1], [5, 1], [3, 1], [2, 1], [0, 2], [2, 1], [3, 1], [5, 1], [7, 1], [5, 2], [3, 1], [2, 1], [3, 1], [5, 1], [7, 1], [9, 1], [8, 2], [7, 1], [5, 1], [3, 1], [5, 1], [3, 1], [2, 1], [0, 2], [2, 2], [0, 3]];
  var STEP = 0.42, cv, cx, W = 1, H = 1, dpr = 1, lanes = [], cb = null, finishAt = 0, shake = 0, flash = [0, 0, 0], hint = 1, held = {};
  var COL = ['#ff6ec7', '#39e6ff', '#ffd34d'];

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

  // begin: tries = how many times she has tried, done(won, {perfect, good, miss, acc})
  Sg.start = function (done) {
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
  Sg.press = press;                                           // (the evaluator and the bot press lanes through this)

  Sg.score = function () { var s = Sg.stats; return s ? (s.perfect + s.good * 0.65) / s.total : 0; };

  Sg.update = function (dt) {
    if (!Sg.active) return; dt = Math.min(dt, 0.05); Sg.t += dt; shake *= 0.9;
    for (var i = 0; i < 3; i++) flash[i] *= 0.86;
    for (i = 0; i < Sg.notes.length; i++) {
      var n = Sg.notes[i];
      if (Sg.bot && n.s === 0 && Sg.t >= n.t) press(n.lane);                           // test bot: a perfect player
      if (n.s === 0 && Sg.t > n.t + Sg.G) { n.s = 3; Sg.stats.miss++; Sg.stats.streak = 0; shake = 1; if (ABY.Audio) { ABY.Audio.sfx('miss'); } }
    }
    if (Sg.t > finishAt && !Sg.ending) {
      Sg.ending = true; Sg.stats.acc = Sg.score(); var won = Sg.stats.acc >= Sg.WIN, d = cb; Sg.stop(); if (d) d(won, Sg.stats);
    }
  };

  Sg.draw = function () {
    if (!Sg.active || !cx) return; cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.clearRect(0, 0, W, H);
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
    cx.fillText('SONG OF RECALL   ' + Math.round(Sg.score() * 100) + '%   ' + (Sg.stats.streak > 2 ? 'x' + Sg.stats.streak : ''), W / 2, Math.max(10, top - 26) - 8);
    if (hint > 0 && Sg.t > -Sg.LEAD + 0.4) { cx.globalAlpha = Math.min(1, hint) * (0.6 + 0.4 * Math.sin(performance.now() * 0.006)); cx.fillStyle = '#e8eef8'; cx.font = '600 ' + Math.max(13, Math.min(17, W * 0.022)) + 'px "Inter", sans-serif'; cx.fillText('Tap the lane when a note reaches the light', W / 2, hy + R * 2.05); cx.globalAlpha = 1; }
  };
  return Sg;
})();
