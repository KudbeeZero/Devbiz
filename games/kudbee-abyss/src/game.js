/* =====================================================================
 * Kudbee Abyss - game.js (THE GAME: the story told through the phone)
 * The story (story.js) arrives as text messages in Messages: typing dots, then the
 * speaker's bubbles (a long beat is split in two or three, like texting). Her answers
 * are quick-reply chips. The Song of Recall is the Echo Flute app (also a practice
 * mode), every ending is saved as a memory in the Gallery, the three hidden stats are
 * the Pulse rings, and the status bar clock / signal / battery answer the story.
 * Progress is saved after every choice; a save from outside is never trusted.
 * ===================================================================== */
(function () {
  'use strict';
  var ABY = window.ABY, N = ABY.NODES, P = ABY.Phone, $ = function (id) { return document.getElementById(id); };
  var KEY = 'kudbee.abyss.v2', URL = 'https://devbiz.kudbee.workers.dev/games/kudbee-abyss/';
  var G = ABY.game = { state: ABY.newState(), found: {}, run: false, log: [], saved: null, node: null, busy: false, delivering: false, fast: false, pending: 0, songBest: 0, haptics: true, ending: null, practice: false };
  var reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var raf = 0, last = 0, endTimer = 0, delayT = 0, shareTimer = 0, armT = {};
  var WHO = { NARRATOR: 'Unknown', QUEEN: 'Queen', GUARDIAN: 'Guardian', VEY: 'Vey' };
  var ECOL = { dawn: ['#ffd34d', '#ff9a5c'], song: ['#39e6ff', '#ff6ec7'], echo: ['#c46bff', '#7cffb2'], silence: ['#8890a8', '#4a5268'], crown: ['#ff2040', '#6a0010'] };

  // ---- save ----
  function cleanLog(raw) {
    var out = []; if (!Array.isArray(raw)) return out;
    raw.slice(-60).forEach(function (e) {
      if (!e || typeof e !== 'object' || ['in', 'out', 'sys', 'stamp'].indexOf(e.k) < 0 || typeof e.t !== 'string') return;
      out.push({ k: e.k, who: ABY.SPEAKERS[e.who] ? e.who : '', t: e.t.slice(0, 400), n: typeof e.n === 'string' && Object.prototype.hasOwnProperty.call(N, e.n) ? e.n : '' });
    });
    return out;
  }
  function load() {
    var d = null; try { d = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { d = null; }
    if (!d || typeof d !== 'object') d = {};
    G.found = {}; if (d.found && typeof d.found === 'object') ABY.ENDING_IDS.forEach(function (id) { if (d.found[id] === 1) G.found[id] = 1; });
    ABY.Audio.muted = d.muted === true; G.haptics = d.haptics !== false; G.songBest = Number.isInteger(d.songBest) ? Math.max(0, Math.min(100, d.songBest)) : 0;
    G.saved = null;
    if (d.run && typeof d.run === 'object') { var s = ABY.cleanState(d.run); if (s.choices > 0 || s.node !== ABY.START) G.saved = { state: s, log: cleanLog(d.run.log) }; }
  }
  function save() {
    var run = null; if (G.run) { run = Object.assign({}, G.state); run.log = G.log; }
    try { localStorage.setItem(KEY, JSON.stringify({ run: run, found: G.found, muted: ABY.Audio.muted, haptics: G.haptics, songBest: G.songBest })); } catch (e) { /* private window or full: the game still plays */ }
  }
  function active() { return G.run || !!G.saved; }
  function foundN() { return ABY.ENDING_IDS.filter(function (id) { return G.found[id]; }).length; }
  function buzz(ms) { if (G.haptics) ABY.Audio.buzz(ms); }

  // ---- the phone's face follows the story ----
  function world() {
    var s = G.state; P.setTime(187 + s.choices * 3 + s.tries * 2); P.setBattery(Math.max(6, 87 - s.choices * 2 - (s.flags.song ? 3 : 0)));
    P.setSignal(G.node ? G.node.mood : 'void');
    [['sH', '♥', s.heart], ['sR', '◆', s.resolve], ['sT', '✦', s.trust]].forEach(function (a) {
      var el = $(a[0]), v = a[2], was = +el.getAttribute('data-v') || 0; el.textContent = a[1] + v;
      if (v > was) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); } el.setAttribute('data-v', v);
    });
    $('stats3').classList.toggle('on', active() && s.choices > 0);
  }
  function contact(sp) {
    var key = (ABY.SPEAKERS[sp] ? sp : 'NARRATOR'), av = $('mAv'); av.className = 'av ' + key.toLowerCase(); av.textContent = key === 'NARRATOR' ? '✦' : '';
    $('mName').textContent = WHO[key]; $('mName').style.color = ABY.SPEAKERS[key].color;
    $('mSub').innerHTML = key === 'GUARDIAN' ? '<span class="live" style="background:var(--ember);box-shadow:0 0 8px var(--ember)"></span>signal unstable' : key === 'NARRATOR' ? 'unknown number' : '<span class="live"></span>online';
  }

  // ---- the chat ----
  function scrollEnd(soft) { var t = $('thread'); t.style.scrollBehavior = soft && !reduced ? 'smooth' : 'auto'; t.scrollTop = t.scrollHeight; }
  function bubble(kind, who, text, quiet) {
    var th = $('thread'), el = document.createElement('div'); el.className = 'm ' + kind; if (quiet) el.style.animation = 'none';
    if (kind === 'in' && who) { var w = document.createElement('span'); w.className = 'who'; w.textContent = WHO[who] || who; w.style.color = ABY.SPEAKERS[who] ? ABY.SPEAKERS[who].color : '#fff'; el.appendChild(w); }
    el.appendChild(document.createTextNode(text)); th.appendChild(el); scrollEnd(!quiet); return el;
  }
  function entry(kind, who, text, nodeId) { G.log.push({ k: kind, who: who || '', t: text, n: nodeId || '' }); if (G.log.length > 60) G.log.shift(); }
  function split(text) {                                                  // a long beat arrives as two or three texts, like a person typing
    var parts = text.split(/(?<=[.!?…])\s+/), out = [], cur = '';
    parts.forEach(function (p) { if (cur && (cur + ' ' + p).length > 105 && out.length < 2) { out.push(cur); cur = p; } else cur = cur ? cur + ' ' + p : p; });
    if (cur) out.push(cur); return out;
  }
  function wait(ms, fn) { clearTimeout(delayT); G.flush = fn; delayT = setTimeout(function () { G.flush = null; fn(); }, G.fast || reduced ? Math.min(ms, 60) : ms); }
  function skip() { if (G.delivering && G.flush) { var f = G.flush; G.flush = null; clearTimeout(delayT); G.fast = true; f(); } }

  function showReplies(n) {
    var box = $('replies'); box.innerHTML = ''; box.classList.remove('on');
    if (!G.run) { chip('Begin a new journey', true, function () { startRun(); }); }
    else if (n.song) chip('♪ Raise the flute', true, function () { startSong(false); });
    else n.choices.forEach(function (c, i) { chip(c.label, n.choices.length === 1, function (ev) { choose(i, ev); }); });
    requestAnimationFrame(function () { box.classList.add('on'); scrollEnd(false); });
    var f = box.querySelector('.chip'); if (f && matchMedia('(pointer:fine)').matches && P.screen === 'msg') f.focus({ preventScroll: true });
  }
  function chip(label, go, fn) { var b = document.createElement('button'); b.type = 'button'; b.className = 'chip' + (go ? ' go' : ''); b.textContent = label; b.addEventListener('click', fn); $('replies').appendChild(b); }

  // deliver a node: typing dots, then its bubbles, then the reply chips
  function deliver(id, fromLog) {
    var n = N[id] || N[ABY.START]; id = N[id] ? id : ABY.START; G.node = n; G.state.node = id; G.delivering = true; G.fast = false;
    contact(n.speaker); ABY.Scene.setMood(n.mood); ABY.Scene.setFocus(n.focus); ABY.Audio.pad(n.mood); world();
    if (n.ending) return finale();
    if (!fromLog && n.ch > 1 && G.lastCh !== n.ch) { var st = 'Chapter ' + n.ch + ' · ' + ABY.CHAPTERS[n.ch - 1].label; bubble('stamp', '', st); entry('stamp', '', st, id); ABY.Audio.sfx('chapter'); } G.lastCh = n.ch;
    var parts = n.speaker === 'NARRATOR' ? [n.text] : split(n.text), done = G.log.filter(function (e) { return e.n === id && e.k !== 'stamp'; }).length;
    $('replies').classList.remove('on');
    (function step(i) {
      if (i >= parts.length) { G.delivering = false; if (G.run) save(); return showReplies(n); }
      var typing = document.createElement('div'); typing.className = 'm typing'; typing.innerHTML = '<i></i><i></i><i></i>'; $('thread').appendChild(typing); scrollEnd(true);
      wait(380 + parts[i].length * 9 > 1500 ? 1500 : 380 + parts[i].length * 9, function () {
        typing.remove(); var narr = n.speaker === 'NARRATOR'; bubble(narr ? 'sys' : 'in', n.speaker, parts[i]); entry(narr ? 'sys' : 'in', n.speaker, parts[i], id);
        ABY.Audio.sfx('ding'); buzz(10);
        if (P.screen !== 'msg') { G.pending++; P.badge('msg', G.pending); P.banner({ title: WHO[n.speaker] || 'Unknown', text: parts[i], onTap: function () { open('msg'); } }); }
        step(i + 1);
      });
    })(done);
  }

  function choose(i, ev) {
    if (G.busy || G.delivering) return; var ns = ABY.choose(G.state, i); if (!ns) return;
    var label = G.node.choices[i].label; ABY.Audio.init(); ABY.Audio.sfx('send'); buzz(12);
    var r = ev && ev.target && ev.target.getBoundingClientRect ? ev.target.getBoundingClientRect() : null;
    if (r) { var sr = $('screen').getBoundingClientRect(); ABY.Scene.burst(r.left - sr.left + 24, r.top - sr.top + r.height / 2, parseInt(ABY.SPEAKERS[G.node.speaker].color.slice(1), 16), 24, 3.2); }
    $('replies').classList.remove('on'); bubble('out', '', label); entry('out', '', label, '');
    G.state = ns; deliver(ns.node);
  }

  // ---- the song (the Echo Flute) ----
  function startSong(practice) {
    if (G.busy) return; ABY.Audio.init(); G.practice = !!practice; G.busy = true;
    flash(function () {
      G.busy = false; P.lockAll(true); document.body.classList.add('song'); $('songCv').classList.add('on'); $('replies').classList.remove('on');
      ABY.Scene.setStage('wall', 0.8); ABY.Scene.setFocus(practice ? 'queen' : 'guardian'); ABY.Song.start(songDone);
    });
  }
  function songDone(won, st) {
    $('songCv').classList.remove('on'); document.body.classList.remove('song'); P.lockAll(false);
    var pct = Math.round(st.acc * 100), note = 'Song of Recall: ' + pct + '%  ·  ' + st.perfect + ' perfect, ' + st.good + ' good, ' + st.miss + ' missed';
    if (pct > G.songBest) { G.songBest = pct; }
    if (won) { ABY.Audio.sfx('song'); ABY.Scene.burst(240, 260, 0xffffff, 70, 5); }
    if (G.practice) { P.show('flute'); $('fTxt').textContent = (won ? 'The song held. ' : 'The song faltered. ') + note.replace('Song of Recall: ', ''); save(); return; }
    P.show('msg'); G.state = ABY.songDone(G.state, won); bubble('sys', '', '♪ ' + note); entry('sys', '', '♪ ' + note, ''); save();
    wait(won ? 1100 : 500, function () { deliver(G.state.node); });
  }

  // ---- the end: the gate opens, then the memory ----
  function finale() {
    var id = ABY.endingFor(G.state), E = ABY.ENDINGS[id]; G.ending = id; G.delivering = false;
    P.lockAll(true); document.body.classList.add('finale'); ABY.Scene.setStage('chat', 1); ABY.Scene.setGate(id); ABY.Scene.setMood(E.mood); ABY.Scene.setFocus('gate'); ABY.Scene.openGate(true);
    ABY.Audio.sfx(id); buzz(30); ABY.Scene.burst(240, 300, 0xffd34d, 60, 4.5);
    var first = !G.found[id]; G.found[id] = 1; G.run = false; bubble('stamp', '', '— end —', true); G.log = []; save(); if (first) P.badge('gallery', 1);
    clearTimeout(endTimer); endTimer = setTimeout(function () { P.lockAll(false); memory(id, first ? 'New memory saved' : 'Memory', true); }, reduced ? 300 : 2600);
  }
  function memory(id, kicker, ended) {
    var E = ABY.ENDINGS[id]; G.shown = id; $('eKick').textContent = kicker; $('eName').textContent = E.name; $('eText').textContent = E.text;
    var dots = $('eDots'); dots.innerHTML = ''; ABY.ENDING_IDS.forEach(function (e) { var d = document.createElement('i'); if (G.found[e]) d.className = 'f'; dots.appendChild(d); });
    $('memAct').textContent = ended ? '▶ New journey' : 'Close'; $('memAct').setAttribute('data-ended', ended ? '1' : '0'); $('shareBtn').textContent = 'Share';
    $('memory').classList.add('on');
  }
  function closeMemory() { $('memory').classList.remove('on'); document.body.classList.remove('finale'); }
  function share() {
    var E = ABY.ENDINGS[G.shown] || ABY.ENDINGS.dawn, text = 'I found "' + E.name + '" in Kudbee Abyss (' + foundN() + '/' + ABY.ENDING_IDS.length + ' endings). Can you find them all?';
    var done = function (msg) { var b = $('shareBtn'); b.textContent = msg; clearTimeout(shareTimer); shareTimer = setTimeout(function () { b.textContent = 'Share'; }, 2200); };
    if (navigator.share) { navigator.share({ title: 'Kudbee Abyss', text: text, url: URL }).catch(function () {}); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text + ' ' + URL).then(function () { done('Link copied'); }, function () { done('Copy failed'); }); else done('Copy failed');
  }

  // ---- a journey ----
  function startRun() {
    G.state = ABY.newState(); G.run = true; G.started = true; G.saved = null; G.log = []; G.lastCh = 0; G.pending = 0; G.ending = null; ABY.Scene.openGate(false); closeMemory(); P.lockAll(false);
    $('thread').innerHTML = ''; $('replies').innerHTML = ''; P.badge('msg', 0);
    var stamp = 'Today ' + P.fmt(187); bubble('stamp', '', stamp, true); entry('stamp', '', stamp, '');
    if (P.screen !== 'msg') P.show('msg'); world(); wait(700, function () { deliver(ABY.START); });
  }
  function rebuild() {                                                     // the saved chat, drawn at once
    $('thread').innerHTML = ''; G.log.forEach(function (e) { bubble(e.k, e.who, e.t, true); }); scrollEnd(false);
  }
  function openMsgApp() {
    if (G.run && G.started) { scrollEnd(false); return; }
    if (G.saved && !G.run) { resume(); return; }
    startRun();
  }
  function resume() {
    G.state = G.saved.state; G.log = G.saved.log; G.saved = null; G.run = true; G.started = true; G.lastCh = N[G.state.node] ? N[G.state.node].ch : 0; G.pending = 0; rebuild();
    deliver(G.state.node, true);
  }

  // ---- apps ----
  function ring(svg, cx, r, w, frac, color) {
    var c = 2 * Math.PI * r, bg = document.createElementNS('http://www.w3.org/2000/svg', 'circle'), fg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    [bg, fg].forEach(function (e) { e.setAttribute('cx', cx); e.setAttribute('cy', cx); e.setAttribute('r', r); e.setAttribute('stroke-width', w); svg.appendChild(e); });
    bg.setAttribute('class', 'bg'); fg.setAttribute('stroke', color); fg.setAttribute('stroke-dasharray', '0 ' + c); requestAnimationFrame(function () { requestAnimationFrame(function () { fg.setAttribute('stroke-dasharray', (c * Math.max(0.02, frac)) + ' ' + c); }); });
  }
  function rings(svg, size, rs, w) { svg.innerHTML = ''; var s = G.state, v = active() ? [s.heart, s.resolve, s.trust] : [0, 0, 0], col = ['#ff6ec7', '#ffd34d', '#7cffb2']; rs.forEach(function (r, i) { ring(svg, size / 2, r, w, v[i] / 5, col[i]); }); }
  function renderHome() {
    rings($('wRings'), 64, [28, 21, 14], 5); var s = G.state;
    $('wT').textContent = active() && G.node ? 'Chapter ' + G.node.ch + ' · ' + ABY.CHAPTERS[G.node.ch - 1].label : 'The Guardian’s Gate';
    $('wS').textContent = active() ? 'Heart ' + s.heart + ' · Resolve ' + s.resolve + ' · Trust ' + s.trust : (foundN() ? 'Endings found ' + foundN() + '/5 · open Messages' : 'A message is waiting in Messages');
  }
  function renderLock() {
    var list = [], last = null; for (var i = G.log.length - 1; i >= 0; i--) if (G.log[i].k === 'in' || G.log[i].k === 'sys') { last = G.log[i]; break; }
    if (active() && last) list.push({ title: WHO[last.who] || 'Unknown', text: last.t, when: 'now', onTap: function () { open('msg'); } });
    else if (!active() && foundN() > 0) list.push({ title: 'Gallery', icon: 'ic-gal', glyph: '❉', text: 'You have found ' + foundN() + ' of 5 memories.', when: 'today', onTap: function () { open('gallery'); } });
    else list.push({ title: 'Unknown', text: 'You’re awake. Do you hear it? The flute is calling.', when: 'now', onTap: function () { open('msg'); } });
    list.push({ title: 'Echo Flute', icon: 'ic-flute', glyph: '♪', text: G.songBest ? 'Your best: ' + G.songBest + '%. The song is waiting.' : 'Your flute is ready. The Song of Recall is waiting.', when: '3:07', onTap: function () { open('flute'); } });
    P.setNotes(list);
  }
  function renderGallery() {
    var box = $('tiles'); box.innerHTML = ''; $('gSub').textContent = foundN() + ' of ' + ABY.ENDING_IDS.length + ' memories'; P.badge('gallery', 0);
    ABY.ENDING_IDS.forEach(function (id) {
      var E = ABY.ENDINGS[id], f = G.found[id], b = document.createElement('button'); b.type = 'button'; b.className = 'tile ' + (f ? 'f' : 'locked');
      if (f) { b.style.setProperty('--g1', ECOL[id][0] + '88'); b.style.setProperty('--g2', ECOL[id][1]); }
      var h = document.createElement('h3'), p = document.createElement('p'); h.textContent = f ? E.name : 'Locked'; p.textContent = f ? '' : E.hint; b.appendChild(h); b.appendChild(p);
      if (f) b.addEventListener('click', function () { ABY.Audio.sfx('ui'); memory(id, 'Memory', false); }); box.appendChild(b);
    });
  }
  function renderPulse() {
    rings($('bigR'), 120, [52, 40, 28], 9); var s = G.state, v = active() ? [s.heart, s.resolve, s.trust] : [0, 0, 0], box = $('ringsL'); box.innerHTML = '';
    [['Heart', '#ff6ec7', 'What she remembers'], ['Resolve', '#ffd34d', 'What she will risk'], ['Trust', '#7cffb2', 'Who she lets in']].forEach(function (r, i) {
      var d = document.createElement('div'); d.className = 'rl'; var l = document.createElement('div'), b = document.createElement('b'), sm = document.createElement('small'), val = document.createElement('span');
      b.textContent = r[0]; b.style.color = r[1]; sm.textContent = r[2]; l.appendChild(b); l.appendChild(sm); val.className = 'v'; val.style.color = r[1]; val.textContent = v[i] + '/5'; d.appendChild(l); d.appendChild(val); box.appendChild(d);
    });
    $('pSub').textContent = (active() ? 'Choices made ' + s.choices + ' · ' : '') + 'Endings found ' + foundN() + '/5' + (G.songBest ? ' · Song best ' + G.songBest + '%' : '');
  }
  function renderFlute() { $('fBest').textContent = G.songBest ? G.songBest + '%' : '—'; }
  function renderSettings() {
    $('togSnd').classList.toggle('on', !ABY.Audio.muted); $('setSnd').setAttribute('aria-pressed', ABY.Audio.muted ? 'false' : 'true');
    $('togHap').classList.toggle('on', G.haptics); $('setHap').setAttribute('aria-pressed', G.haptics ? 'true' : 'false');
  }
  function arm(id, msg, doIt) {                                           // a danger button needs two taps
    var b = $(id), s = b.querySelector('small'), orig = s.getAttribute('data-o') || s.textContent; s.setAttribute('data-o', orig);
    b.addEventListener('click', function () { if (armT[id]) { clearTimeout(armT[id]); armT[id] = 0; s.textContent = orig; doIt(); } else { s.textContent = msg; armT[id] = setTimeout(function () { armT[id] = 0; s.textContent = orig; }, 3200); } });
  }

  function open(app) { P.show(app); }
  function onShow(name) {
    if (name !== 'msg') closeMemory(); else G.pending = 0;
    if (name === 'lock') renderLock(); else if (name === 'home') renderHome(); else if (name === 'gallery') renderGallery(); else if (name === 'pulse') renderPulse(); else if (name === 'flute') renderFlute(); else if (name === 'settings') renderSettings();
    else if (name === 'msg') openMsgApp();
    if (name !== 'msg' && G.node && name !== 'lock') { /* the wallpaper keeps the speaker in view */ }
  }

  // ---- loop ----
  function flash(fn) { var f = $('flash'); f.style.opacity = '1'; setTimeout(function () { fn(); setTimeout(function () { f.style.opacity = '0'; }, 60); }, reduced ? 30 : 200); }
  function update(dt, now) { if (ABY.Song.active) ABY.Song.update(dt); else ABY.Audio.wander(now, ABY.Scene.mood); }
  function frame(now) { raf = requestAnimationFrame(frame); var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016; last = now; update(dt, now); ABY.Scene.render(now); ABY.Song.draw(); }
  function wake() { if (!raf && !document.hidden) { last = 0; raf = requestAnimationFrame(frame); } }
  function sleep() { cancelAnimationFrame(raf); raf = 0; }
  document.addEventListener('visibilitychange', function () { if (document.hidden) { sleep(); if (ABY.Audio.ctx) ABY.Audio.ctx.suspend(); } else { wake(); if (ABY.Audio.ctx && !ABY.Audio.muted) ABY.Audio.ctx.resume(); } });
  ABY.debug = { frames: function () { return ABY.Scene.frames; }, running: function () { return !!raf; } };
  function resize() { ABY.Scene.resize(); ABY.Song.resize(); }
  window.addEventListener('resize', resize); window.addEventListener('orientationchange', function () { setTimeout(resize, 200); });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);

  // ---- input ----
  $('screen').addEventListener('pointermove', function (e) { if (e.pointerType !== 'mouse') return; var r = $('screen').getBoundingClientRect(); ABY.Scene.pointer(((e.clientX - r.left) / r.width - 0.5) * 2, ((e.clientY - r.top) / r.height - 0.5) * 2); });
  document.addEventListener('pointerdown', function () { ABY.Audio.init(); ABY.Audio.pad(G.node ? G.node.mood : 'void'); }, { once: true });
  $('thread').addEventListener('click', skip);
  $('fPlay').addEventListener('click', function () { startSong(true); });
  $('shareBtn').addEventListener('click', share);
  $('memAct').addEventListener('click', function () { ABY.Audio.sfx('ui'); if ($('memAct').getAttribute('data-ended') === '1') { closeMemory(); startRun(); } else closeMemory(); });
  $('setSnd').addEventListener('click', function () { ABY.Audio.init(); ABY.Audio.setMuted(!ABY.Audio.muted); renderSettings(); save(); });
  $('setHap').addEventListener('click', function () { G.haptics = !G.haptics; renderSettings(); save(); if (G.haptics) ABY.Audio.buzz(15); });
  arm('setNew', 'Tap again to erase this chat', function () { G.saved = null; G.run = false; G.log = []; save(); startRun(); });
  arm('setRes', 'Tap again to erase every memory', function () { G.found = {}; save(); renderGallery(); P.badge('gallery', 0); });
  window.addEventListener('keydown', function (e) {
    var k = e.key.toLowerCase(); if (e.repeat) return;
    if (k === 'm') { ABY.Audio.setMuted(!ABY.Audio.muted); renderSettings(); save(); return; }
    if (ABY.Song.active) return;
    if (P.screen === 'lock' && (k === 'enter' || k === ' ')) { e.preventDefault(); P.unlock(); return; }
    if (P.screen === 'msg') {
      if ((k === 'enter' || k === ' ') && G.delivering) { e.preventDefault(); skip(); return; }
      var n = parseInt(k, 10), b = $('replies').querySelectorAll('.chip'); if (n >= 1 && n <= b.length) b[n - 1].click();
    }
  });

  // ---- boot ----
  function boot() {
    load(); ABY.Song.init($('songCv')); P.init({ onShow: onShow });
    var pre = $('pre'), booted = false, stage = $('screen');
    function ready(gl) {
      if (booted) return; booted = true; if (!gl) stage.classList.add('nogl');
      if (G.saved) { G.state = G.saved.state; G.node = N[G.state.node]; G.log = G.saved.log; } ABY.Scene.setMood('void'); ABY.Scene.setFocus('queen'); world(); P.show('lock');
      setTimeout(function () { pre.classList.add('done'); }, 250); wake();
    }
    var img = new Image(), bgi = new Image(), tried = 0, got = 0;
    function both(gl) { if (++got === 2) ready(ABY.Scene.init($('three-canvas'), img, bgi.naturalWidth ? bgi : null)); }
    img.onload = both; bgi.onload = both; bgi.onerror = both;                  // the city is a bonus: without it the nebula stays
    img.onerror = function () { if (tried++ === 0) img.src = 'assets/character/queen.png'; else ready(false); };
    img.src = 'assets/character/queen-960.webp'; bgi.src = 'assets/world/abyss-city.webp';
    setTimeout(function () { ready(false); }, 6000);                    // a slow or blocked 3D library never keeps her waiting
  }
  boot();
})();
