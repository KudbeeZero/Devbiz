/* =====================================================================
 * Kudbee Abyss - game.js (THE GAME: state, dialogue, screens, loop)
 * Ties the story (story.js), the stage (scene.js), the sound (fx.js) and the song
 * (song.js) together. Progress is saved after every choice; a save from outside is
 * never trusted (ABY.cleanState). Phone first: touch targets 44px+, safe areas,
 * the dialogue never hides the scene, the loop sleeps when the tab is hidden.
 * ===================================================================== */
(function () {
  'use strict';
  var ABY = window.ABY, N = ABY.NODES, $ = function (id) { return document.getElementById(id); };
  var KEY = 'kudbee.abyss.v2', URL = 'https://devbiz.kudbee.workers.dev/games/kudbee-abyss/';
  var G = ABY.game = { state: ABY.newState(), found: {}, run: false, type: null, node: null, busy: false, note: '' };
  var reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var stageEl = $('stage'), raf = 0, last = 0, endTimer = 0, shareTimer = 0;

  // ---- save ----
  function load() {
    var d = null; try { d = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { d = null; }
    if (!d || typeof d !== 'object') d = {};
    G.found = {}; if (d.found && typeof d.found === 'object') ABY.ENDING_IDS.forEach(function (id) { if (d.found[id] === 1) G.found[id] = 1; });
    ABY.Audio.muted = d.muted === true;
    G.saved = d.run ? ABY.cleanState(d.run) : null;
    if (G.saved && G.saved.choices < 1 && G.saved.node === ABY.START) G.saved = null;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ run: G.run ? G.state : null, found: G.found, muted: ABY.Audio.muted })); } catch (e) { /* private window or full: the game still plays */ } }
  function foundN() { return ABY.ENDING_IDS.filter(function (id) { return G.found[id]; }).length; }

  // ---- small helpers ----
  function show(el, on) { el.classList.toggle('hidden', !on); }
  function flash(fn) { var f = $('flash'); f.style.opacity = '1'; setTimeout(function () { fn(); setTimeout(function () { f.style.opacity = '0'; }, 60); }, reduced ? 30 : 200); }
  function pips() {
    [['pipH', 'heart'], ['pipR', 'resolve'], ['pipT', 'trust']].forEach(function (p) {
      var el = $(p[0]), b = el.querySelector('b'), v = G.state[p[1]], was = +el.getAttribute('data-v') || 0;
      if (b.children.length !== 5) { b.innerHTML = ''; for (var i = 0; i < 5; i++) b.appendChild(document.createElement('u')); }
      for (var j = 0; j < 5; j++) b.children[j].className = j < v ? 'f' : '';
      if (v > was) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
      el.setAttribute('data-v', v); el.setAttribute('title', p[1] + ' ' + v + '/5');
    });
    $('pips').classList.toggle('on', G.run && G.state.choices > 0);
  }
  function sound() { var b = $('sndBtn'); b.innerHTML = ABY.Audio.muted ? '&#128263;' : '&#128266;'; b.setAttribute('aria-pressed', ABY.Audio.muted ? 'true' : 'false'); }
  function setMuted(m) { ABY.Audio.setMuted(m); sound(); save(); }

  // ---- a story beat ----
  function enter(id) {
    var n = N[id]; if (!n) id = ABY.START, n = N[id];
    G.state.node = id; G.node = n; if (G.run) save();
    ABY.Scene.setMood(n.mood); ABY.Scene.setFocus(n.focus); ABY.Audio.pad(n.mood);
    if (n.ending) return finale();
    var sp = ABY.SPEAKERS[n.speaker], ch = ABY.CHAPTERS[n.ch - 1];
    $('chap').textContent = 'Chapter ' + n.ch + ' · ' + ch.label;
    var who = $('who'); who.textContent = n.speaker; who.style.color = sp.color;
    var opts = $('opts'); opts.innerHTML = ''; opts.classList.remove('on');
    $('card').hidden = false; pips();
    var panel = $('panel'); panel.style.animation = 'none'; void panel.offsetWidth; panel.style.animation = '';
    if (n.ch >= 2 && G.lastCh !== n.ch) ABY.Audio.sfx('chapter'); G.lastCh = n.ch;
    typeText(n.text, function () { options(n); });
    $('skip').textContent = G.note; G.note = '';
  }
  function typeText(text, done) {
    var say = $('say'); G.type = { text: text, i: 0, acc: 0, done: done };
    if (reduced) { finishType(); return; }
    say.textContent = '';
  }
  function finishType() {
    var t = G.type; if (!t) return; G.type = null; var say = $('say'); say.textContent = t.text; t.done();
  }
  function options(n) {
    var opts = $('opts'); opts.innerHTML = '';
    if (n.song) { addOpt('Raise the flute', true, startSong); }
    else n.choices.forEach(function (c, i) { addOpt(c.label, n.choices.length === 1, function (ev) { choose(i, ev); }); });
    requestAnimationFrame(function () { opts.classList.add('on'); });
    var first = opts.querySelector('.opt'); if (first && matchMedia('(pointer:fine)').matches) first.focus({ preventScroll: true });
  }
  function addOpt(label, go, fn) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'opt' + (go ? ' go' : ''); b.textContent = label;
    b.addEventListener('click', function (ev) { fn(ev); }); $('opts').appendChild(b);
  }
  function choose(i, ev) {
    if (G.busy) return; var ns = ABY.choose(G.state, i); if (!ns) return; G.busy = true;
    ABY.Audio.init(); ABY.Audio.sfx('choice'); ABY.Audio.buzz(12);
    var r = ev && ev.target && ev.target.getBoundingClientRect ? ev.target.getBoundingClientRect() : null;
    if (r) ABY.Scene.burst(r.left + r.width * 0.1, r.top + r.height / 2, ABY.SPEAKERS[G.node.speaker].color.replace('#', '0x') * 1 || 0x39e6ff, 26, 3.4);
    flash(function () { G.state = ns; G.busy = false; enter(ns.node); });
  }

  // ---- the song ----
  function startSong() {
    if (G.busy) return; ABY.Audio.init(); G.busy = true;
    flash(function () {
      G.busy = false; $('card').hidden = true; $('songCv').classList.add('on'); $('hud').style.opacity = '0.0'; $('hud').style.pointerEvents = 'none';
      ABY.Scene.setFocus('guardian'); ABY.Song.start(songDone);
    });
  }
  function songDone(won, st) {
    $('songCv').classList.remove('on'); $('hud').style.opacity = ''; $('hud').style.pointerEvents = '';
    var pct = Math.round(st.acc * 100);
    G.note = 'Song of Recall: ' + pct + '%  ·  ' + st.perfect + ' perfect, ' + st.good + ' good, ' + st.miss + ' missed';
    if (won) { ABY.Audio.sfx('song'); ABY.Scene.burst(innerWidth * 0.5, innerHeight * 0.45, 0xffffff, 80, 5); }
    setTimeout(function () { G.state = ABY.songDone(G.state, won); enter(G.state.node); }, won ? 900 : 400);
  }

  // ---- the end ----
  function finale() {
    var id = ABY.endingFor(G.state), E = ABY.ENDINGS[id]; G.ending = id;
    $('card').hidden = true; ABY.Scene.setGate(id); ABY.Scene.setMood(E.mood); ABY.Scene.setFocus('gate'); ABY.Scene.openGate(true);
    ABY.Audio.sfx(id); ABY.Audio.buzz(30); ABY.Scene.burst(innerWidth * 0.5, innerHeight * 0.45, 0xffd34d, 60, 4.5);
    var first = !G.found[id]; G.found[id] = 1; G.run = false; save();
    clearTimeout(endTimer);
    endTimer = setTimeout(function () {
      $('eKick').textContent = first ? 'New ending found' : 'The End';
      $('eName').textContent = E.name; $('eText').textContent = E.text;
      var dots = $('eDots'); dots.innerHTML = ''; ABY.ENDING_IDS.forEach(function (e) { var d = document.createElement('i'); if (G.found[e]) d.className = 'f'; dots.appendChild(d); });
      $('eMeta').innerHTML = 'Endings found <b>' + foundN() + '/' + ABY.ENDING_IDS.length + '</b> · Choices made <b>' + G.state.choices + '</b>';
      $('shareBtn').textContent = 'Share your ending'; show($('end'), true);
    }, reduced ? 300 : 2600);
  }

  // ---- screens ----
  function newRun() {
    G.state = ABY.newState(); G.run = true; G.lastCh = 0; G.ending = null; ABY.Scene.openGate(false);
    flash(function () { show($('title'), false); show($('end'), false); show($('echoes'), false); G.busy = false; enter(ABY.START); });
  }
  function resume() {
    G.state = G.saved; G.run = true; G.lastCh = 0; ABY.Scene.openGate(false);
    flash(function () { show($('title'), false); G.busy = false; enter(G.state.node); });
  }
  function title() {
    $('card').hidden = true; show($('title'), true); show($('end'), false);
    $('contBtn').hidden = !G.saved; $('beginBtn').textContent = G.saved ? 'New journey' : '▶ Begin';
    $('titleMeta').innerHTML = 'Endings found <b>' + foundN() + '/' + ABY.ENDING_IDS.length + '</b>';
    $('echoN').textContent = foundN() + '/' + ABY.ENDING_IDS.length; pips();
    ABY.Scene.setMood('void'); ABY.Scene.setFocus('queen');
  }
  function echoes() {
    var l = $('gList'); l.innerHTML = '';
    ABY.ENDING_IDS.forEach(function (id) {
      var E = ABY.ENDINGS[id], f = G.found[id], d = document.createElement('div'); d.className = 'gi' + (f ? ' f' : '');
      var h = document.createElement('h3'), p = document.createElement('p'); h.textContent = f ? E.name : '???'; p.textContent = f ? E.text : E.hint; d.appendChild(h); d.appendChild(p); l.appendChild(d);
    });
    show($('echoes'), true);
  }
  function share() {
    var E = ABY.ENDINGS[G.ending] || ABY.ENDINGS.dawn, text = 'I found "' + E.name + '" in Kudbee Abyss (' + foundN() + '/' + ABY.ENDING_IDS.length + ' endings). Can you find them all?';
    var done = function (msg) { var b = $('shareBtn'); b.textContent = msg; clearTimeout(shareTimer); shareTimer = setTimeout(function () { b.textContent = 'Share your ending'; }, 2200); };
    if (navigator.share) { navigator.share({ title: 'Kudbee Abyss', text: text, url: URL }).catch(function () {}); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text + ' ' + URL).then(function () { done('Link copied'); }, function () { done('Copy failed'); });
    else done('Copy failed');
  }

  // ---- loop ----
  function update(dt, now) {
    var t = G.type;
    if (t) {
      t.acc += dt * 85; var k = Math.floor(t.acc);
      if (k > 0) { t.acc -= k; var before = t.i; t.i = Math.min(t.text.length, t.i + k); var say = $('say'); say.textContent = t.text.slice(0, t.i); var c = document.createElement('span'); c.className = 'cur'; say.appendChild(c); if ((t.i >> 2) !== (before >> 2)) ABY.Audio.sfx('tick'); if (t.i >= t.text.length) finishType(); }
    }
    if (ABY.Song.active) ABY.Song.update(dt); else ABY.Audio.wander(now, ABY.Scene.mood);
  }
  function frame(now) {
    raf = requestAnimationFrame(frame); var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016; last = now;
    update(dt, now); ABY.Scene.render(now); ABY.Song.draw();
  }
  function wake() { if (!raf && !document.hidden) { last = 0; raf = requestAnimationFrame(frame); } }
  function sleep() { cancelAnimationFrame(raf); raf = 0; }
  document.addEventListener('visibilitychange', function () { if (document.hidden) { sleep(); if (ABY.Audio.ctx) ABY.Audio.ctx.suspend(); } else { wake(); if (ABY.Audio.ctx && !ABY.Audio.muted) ABY.Audio.ctx.resume(); } });
  ABY.debug = { frames: function () { return ABY.Scene.frames; }, running: function () { return !!raf; } };

  function resize() { ABY.Scene.resize(); ABY.Song.resize(); }
  window.addEventListener('resize', resize); window.addEventListener('orientationchange', function () { setTimeout(resize, 200); });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);

  // ---- input ----
  stageEl.addEventListener('pointermove', function (e) { if (e.pointerType !== 'mouse') return; ABY.Scene.pointer((e.clientX / innerWidth - 0.5) * 2, (e.clientY / innerHeight - 0.5) * 2); });
  document.addEventListener('pointerdown', function () { ABY.Audio.init(); ABY.Audio.pad(G.node ? G.node.mood : 'void'); }, { once: true });
  $('panel').addEventListener('click', function (e) { if (G.type && !e.target.closest('.opt')) finishType(); });
  $('beginBtn').addEventListener('click', function () { ABY.Audio.init(); ABY.Audio.sfx('ui'); newRun(); });
  $('contBtn').addEventListener('click', function () { ABY.Audio.init(); ABY.Audio.sfx('ui'); resume(); });
  $('againBtn').addEventListener('click', function () { ABY.Audio.sfx('ui'); newRun(); });
  $('shareBtn').addEventListener('click', share);
  $('echoBtn').addEventListener('click', function () { ABY.Audio.init(); ABY.Audio.sfx('ui'); echoes(); });
  $('echoClose').addEventListener('click', function () { show($('echoes'), false); });
  $('sndBtn').addEventListener('click', function () { ABY.Audio.init(); setMuted(!ABY.Audio.muted); });
  window.addEventListener('keydown', function (e) {
    var k = e.key.toLowerCase(); if (e.repeat) return;
    if (k === 'm') { setMuted(!ABY.Audio.muted); return; }
    if (k === 'escape') { show($('echoes'), false); return; }
    if (ABY.Song.active) return;
    if (!$('title').classList.contains('hidden')) { if (k === 'enter') { e.preventDefault(); G.saved ? resume() : newRun(); } return; }
    if (!$('end').classList.contains('hidden')) { if (k === 'enter') newRun(); return; }
    if (G.type && (k === 'enter' || k === ' ')) { e.preventDefault(); finishType(); return; }
    var n = parseInt(k, 10), b = $('opts').querySelectorAll('.opt');
    if (n >= 1 && n <= b.length) b[n - 1].click();
  });

  // ---- boot ----
  function boot() {
    load(); sound(); ABY.Song.init($('songCv'));
    var pre = $('pre'), booted = false;
    function ready(gl) { if (booted) return; booted = true; if (!gl) stageEl.classList.add('nogl'); title(); setTimeout(function () { pre.classList.add('done'); }, 250); wake(); }
    var img = new Image(), tried = 0;
    img.onload = function () { ready(ABY.Scene.init($('three-canvas'), img)); };
    img.onerror = function () { if (tried++ === 0) img.src = 'assets/character/queen.png'; else ready(false); };
    img.src = 'assets/character/queen-960.webp';
    setTimeout(function () { ready(false); }, 6000);                    // a slow or blocked 3D library never keeps her waiting
  }
  boot();
})();
