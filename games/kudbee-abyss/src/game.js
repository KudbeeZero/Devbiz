/* =====================================================================
 * Kudbee Abyss - game.js (THE GAME: the story told through the phone)
 * The story (story.js) arrives as text messages in Messages: typing dots, then the
 * speaker's bubbles (a long beat is split in two or three, like texting). Her answers
 * are quick-reply chips. The Song of Recall is the Echo Flute app (also a practice
 * mode), every ending is saved as a memory in the Gallery, the three hidden stats are
 * the Pulse rings, and the status bar clock / signal / battery answer the story. The phone
 * itself is the horror: a real battery, a flashlight she must manage, calls, clues in Notes,
 * and scares (glitches, jumps, whispers, the Eye) that grow with her dread.
 * Progress is saved after every choice; a save from outside is never trusted.
 * ===================================================================== */
(function () {
  'use strict';
  var ABY = window.ABY, N = ABY.NODES, P = ABY.Phone, $ = function (id) { return document.getElementById(id); };
  var KEY = 'kudbee.abyss.v2', URL = 'https://devbiz.kudbee.workers.dev/games/kudbee-abyss/';
  var G = ABY.game = { state: ABY.newState(), found: {}, run: false, log: [], saved: null, node: null, busy: false, delivering: false, fast: false, pending: 0, songBest: 0, haptics: true, badges: {}, apps: {}, faction: '', lean: '', ending: null, practice: false, seen: {}, orient: 'portrait' };
  var reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var raf = 0, last = 0, endTimer = 0, delayT = 0, shareTimer = 0, armT = {}, scareT = 0, ringT = 0, ambT = 0, noteN = 0;
  var WHO = { NARRATOR: 'Unknown', QUEEN: 'Queen', GUARDIAN: 'Guardian', VEY: 'Vey', EYE: 'No Caller ID' };
  var ECOL = { dawn: ['#ffd34d', '#ff9a5c'], song: ['#39e6ff', '#ff6ec7'], echo: ['#c46bff', '#7cffb2'], silence: ['#8890a8', '#4a5268'], crown: ['#ff2040', '#6a0010'], hollow: ['#8a2be2', '#2a0044'], eye: ['#ff4d5e', '#4a0010'], mirror: ['#9fb0cc', '#26324a'], betrayal: ['#7cffb2', '#06301a'], blackout: ['#6a6a7a', '#101018'], daybreak: ['#fff1b0', '#ffd34d'], keeper: ['#8aa0ff', '#1a1a3a'], loop: ['#30ff90', '#101020'], chorus: ['#ff9ad5', '#ffd34d'], watched: ['#ff4d5e', '#05030c'] };
  var CREEPS = ['behind you', 'it is 3:07', 'i can hear you breathing', 'don\u2019t look at the screen', 'you left the door open', 'she is not the one texting you', 'count the steps', 'turn around slowly'];

  // ---- save ----
  function cleanLog(raw) {
    var out = []; if (!Array.isArray(raw)) return out;
    raw.slice(-60).forEach(function (e) {
      if (!e || typeof e !== 'object' || ['in', 'out', 'sys', 'stamp', 'img'].indexOf(e.k) < 0 || typeof e.t !== 'string') return;
      out.push({ k: e.k, who: ABY.SPEAKERS[e.who] ? e.who : '', t: e.t.slice(0, 400), n: typeof e.n === 'string' && Object.prototype.hasOwnProperty.call(N, e.n) ? e.n : '' });
    });
    return out;
  }
  function load() {
    var d = null; try { d = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { d = null; }
    if (!d || typeof d !== 'object') d = {};
    G.found = {}; if (d.found && typeof d.found === 'object') ABY.ENDING_IDS.forEach(function (id) { if (d.found[id] === 1) G.found[id] = 1; });
    G.badges = {}; if (d.badges && typeof d.badges === 'object') ABY.BADGE_IDS.forEach(function (id) { if (d.badges[id] === 1) G.badges[id] = 1; });
    var own = function (k) { return typeof k === 'string' && Object.prototype.hasOwnProperty.call(ABY.FACTIONS, k); }; G.faction = own(d.faction) ? d.faction : ''; G.lean = own(d.lean) ? d.lean : ''; G.guided = d.guided === true;
    ABY.Audio.muted = d.muted === true; G.haptics = d.haptics !== false; G.songBest = Number.isInteger(d.songBest) ? Math.max(0, Math.min(100, d.songBest)) : 0; G.orient = d.orient === 'landscape' ? 'landscape' : 'portrait';
    G.apps = {}; if (d.apps && typeof d.apps === 'object') ABY.STORE.forEach(function (a) { if (d.apps[a.id] === 1) G.apps[a.id] = 1; });
    G.saved = null;
    if (d.run && typeof d.run === 'object') { var s = ABY.cleanState(d.run); if (s.choices > 0 || s.node !== ABY.START) G.saved = { state: s, log: cleanLog(d.run.log) }; }
  }
  function save() {
    var run = null; if (G.run) { run = Object.assign({}, G.state); run.log = G.log; }
    try { localStorage.setItem(KEY, JSON.stringify({ run: run, found: G.found, badges: G.badges, faction: G.faction, lean: G.lean, muted: ABY.Audio.muted, haptics: G.haptics, songBest: G.songBest, orient: G.orient, guided: G.guided, apps: G.apps })); } catch (e) { /* private window or full: the game still plays */ }
  }
  function active() { return G.run || !!G.saved; }
  function foundN() { return ABY.ENDING_IDS.filter(function (id) { return G.found[id]; }).length; }
  function buzz(ms) { if (G.haptics) ABY.Audio.buzz(ms); }

  // ---- the phone's face follows the story ----
  function world() {
    var s = G.state; P.setTime(187 + s.choices * 3 + s.tries * 2); P.setBattery(s.bat);
    P.setSignal(G.node ? G.node.mood : 'void');
    [['sH', '\u2665', s.heart], ['sR', '\u25C6', s.resolve], ['sT', '\u2726', s.trust], ['sD', '\u25C9', s.dread]].forEach(function (a) {
      var el = $(a[0]), v = a[2], was = +el.getAttribute('data-v') || 0; el.textContent = a[1] + v;
      if (v > was) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); } el.setAttribute('data-v', v);
    });
    $('stats3').classList.toggle('on', active() && s.choices > 0);
    var d = active() ? s.dread / ABY.MAX_DREAD : 0; $('screen').style.setProperty('--dread', d.toFixed(2)); $('screen').classList.toggle('uneasy', d >= 0.66);
    var t = $('torchBtn'); t.classList.toggle('on', !!s.light); t.setAttribute('aria-pressed', s.light ? 'true' : 'false'); t.classList.toggle('hint', !!(G.node && G.node.dark && !s.light));
    ABY.Scene.setTorch(!!s.light); ABY.Scene.setDread(d);
  }
  function contact(sp) {
    var key = (ABY.SPEAKERS[sp] ? sp : 'NARRATOR'), av = $('mAv'); av.className = 'av ' + key.toLowerCase(); av.textContent = key === 'NARRATOR' ? '✦' : key === 'EYE' ? '◉' : '';
    $('mName').textContent = WHO[key]; $('mName').style.color = ABY.SPEAKERS[key].color;
    $('mSub').innerHTML = key === 'GUARDIAN' ? '<span class="live" style="background:var(--ember);box-shadow:0 0 8px var(--ember)"></span>signal unstable' : key === 'EYE' ? '<span class="live" style="background:#ff4d5e;box-shadow:0 0 8px #ff4d5e"></span>it knows you are here' : key === 'NARRATOR' ? 'unknown number' : '<span class="live"></span>online';
  }

  // ---- the chat ----
  function scrollEnd(soft) { var t = $('thread'); t.style.scrollBehavior = soft && !reduced ? 'smooth' : 'auto'; t.scrollTop = t.scrollHeight; }
  function bubble(kind, who, text, quiet) {
    var th = $('thread'), el = document.createElement('div'); el.className = 'm ' + kind; if (quiet) el.style.animation = 'none';
    if (kind === 'in' && who) { var w = document.createElement('span'); w.className = 'who'; w.textContent = WHO[who] || who; w.style.color = ABY.SPEAKERS[who] ? ABY.SPEAKERS[who].color : '#fff'; el.appendChild(w); }
    el.appendChild(document.createTextNode(text)); th.appendChild(el); scrollEnd(!quiet); return el;
  }
  var PICS = { corrupt: 'assets/world/abyss-city-corrupt.webp', stairs: 'assets/world/abyss-stairs.webp', eye: 'assets/world/abyss-eye.webp', city: 'assets/world/abyss-city.webp', queen: 'assets/character/queen-960.webp' };
  function photo(key, quiet) {
    var th = $('thread'), el = document.createElement('div'); el.className = 'm photo'; if (quiet) el.style.animation = 'none'; el.setAttribute('role', 'img'); el.setAttribute('aria-label', 'A photo from the phone'); el.style.backgroundImage = 'url(' + (PICS[key] || PICS.corrupt) + ')'; th.appendChild(el); scrollEnd(!quiet); return el;
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
    var opts = ABY.options(G.state);
    if (!G.run) { chip('Begin a new journey', true, function () { startRun(); }); }
    else if (n.song) chip('\u266A Raise the flute', true, function () { startSong(false); });
    else if (n.call) { showCall(n, opts); }
    else opts.forEach(function (o) { chip(o.c.label, opts.length === 1, function (ev) { choose(o.i, ev); }); });
    requestAnimationFrame(function () { box.classList.add('on'); scrollEnd(false); });
    if (G.autoPick != null && G.run && !n.song && !n.call && !n.ending) { var k = G.autoPick; G.autoPick = null; (function go() { if (!G.run || G.state.node !== ABY.START) return; if (G.busy || G.delivering || !$('guide').hidden) return setTimeout(go, 300); choose(k); })(); }   // a reply sent from the lock screen
    var f = box.querySelector('.chip'); if (f && matchMedia('(pointer:fine)').matches && P.screen === 'msg') f.focus({ preventScroll: true });
  }
  // an incoming call: a full-screen ring with the node's two choices as Answer / Decline
  function showCall(n, opts) {
    var el = $('call'); $('callWho').textContent = n.call.from; $('callSub').textContent = n.call.sub || 'incoming call';
    var act = $('callAct'); act.innerHTML = '';
    opts.forEach(function (o, k) { var b = document.createElement('button'); b.type = 'button'; b.className = 'cbtn ' + (k === 0 ? 'yes' : 'no'); b.innerHTML = '<i>' + (k === 0 ? '\u260E' : '\u2715') + '</i><span></span>'; b.querySelector('span').textContent = o.c.label; b.addEventListener('click', function (ev) { stopRing(); choose(o.i, ev); }); act.appendChild(b); });
    el.classList.add('on'); P.lockAll(true); ring1(); clearInterval(ringT); ringT = setInterval(ring1, 1500);
  }
  function ring1() { ABY.Audio.sfx('ring'); buzz(200); }
  function stopRing() { clearInterval(ringT); ringT = 0; $('call').classList.remove('on'); P.lockAll(false); }
  function chip(label, go, fn) { var b = document.createElement('button'); b.type = 'button'; b.className = 'chip' + (go ? ' go' : ''); b.textContent = label; b.addEventListener('click', fn); $('replies').appendChild(b); }

  // deliver a node: typing dots, then its bubbles, then the reply chips
  function deliver(id, fromLog) {
    var n = N[id] || N[ABY.START]; id = N[id] ? id : ABY.START; G.node = n; G.state.node = id; G.delivering = true; G.fast = false;
    contact(n.speaker); ABY.Scene.setMood(n.mood); ABY.Scene.setEye(n.img === 'eye'); ABY.Scene.setFocus(n.focus); ABY.Audio.pad(n.mood); world();
    if (n.ending) return finale();
    if (n.dark && !G.state.light && !fromLog) { var hint = 'It is too dark to see. Switch on the flashlight (the torch button above).'; bubble('sys', '', hint); entry('sys', '', hint, id); }
    if (!fromLog && n.ch > 1 && G.lastCh !== n.ch) { var st = 'Chapter ' + n.ch + ' · ' + ABY.CHAPTERS[n.ch - 1].label; bubble('stamp', '', st); entry('stamp', '', st, id); ABY.Audio.sfx('chapter'); } G.lastCh = n.ch;
    var parts = n.speaker === 'NARRATOR' ? [n.text] : split(n.text), done = G.log.filter(function (e) { return e.n === id && e.k !== 'stamp'; }).length;
    $('replies').classList.remove('on');
    (function step(i) {
      if (i >= parts.length) { G.delivering = false; if (G.run) save(); return showReplies(n); }
      var typing = document.createElement('div'); typing.className = 'm typing'; typing.innerHTML = '<i></i><i></i><i></i>'; $('thread').appendChild(typing); scrollEnd(true);
      wait(380 + parts[i].length * 9 > 1500 ? 1500 : 380 + parts[i].length * 9, function () {
        typing.remove(); var narr = n.speaker === 'NARRATOR', b = bubble(narr ? 'sys' : 'in', n.speaker, parts[i]); entry(narr ? 'sys' : 'in', n.speaker, parts[i], id);
        if (i === 0 && !fromLog) { if (n.scare) scare(n.scare); if (n.img) { photo(n.img); entry('img', '', n.img, id); } } if (G.state.dread >= 4) corrupt(b, parts[i]);
        if (n.speaker === 'EYE') ABY.Audio.sfx('creep'); else ABY.Audio.sfx('ding'); buzz(10);
        if (n.note && !G.seen[n.note] && i === parts.length - 1) { G.seen[n.note] = 1; P.badge('notes', ++noteN); P.banner({ title: 'Notes', icon: 'ic-notes', glyph: '\u270E', text: 'New clue: ' + ABY.NOTES[n.note].title, onTap: function () { open('notes'); } }); }
        if (P.screen !== 'msg') { G.pending++; P.badge('msg', G.pending); P.banner({ title: WHO[n.speaker] || 'Unknown', text: parts[i], onTap: function () { open('msg'); } }); }
        step(i + 1);
      });
    })(done);
  }

  function choose(i, ev) {
    if (G.busy || G.delivering) return; var ns = ABY.choose(G.state, i); if (!ns) return; clearTimeout(scareT);
    var label = G.node.choices[i].label; ABY.Audio.init(); ABY.Audio.sfx('send'); buzz(12);
    var r = ev && ev.target && ev.target.getBoundingClientRect ? ev.target.getBoundingClientRect() : null;
    if (r) { var sr = $('screen').getBoundingClientRect(); ABY.Scene.burst(r.left - sr.left + 24, r.top - sr.top + r.height / 2, parseInt(ABY.SPEAKERS[G.node.speaker].color.slice(1), 16), 24, 3.2); }
    $('replies').classList.remove('on'); bubble('out', '', label); entry('out', '', label, '');
    G.state = ns; deliver(ns.node);
  }

  // ---- scares: the phone and the dark do things to her ----
  function fx(el, cls, ms) { el.classList.add(cls); setTimeout(function () { el.classList.remove(cls); }, reduced ? Math.min(ms, 500) : ms); }
  function scare(type) {
    var sc = $('screen');
    if (type === 'jump') { ABY.Audio.sfx('jump'); buzz(90); fx(sc, 'jump', 700); ABY.Scene.burst(240, 300, 0xff3050, 40, 5); }
    else if (type === 'glitch') { ABY.Audio.sfx('glitch'); buzz(30); fx(sc, 'glitch', 900); }
    else if (type === 'eye') { ABY.Audio.sfx('eyes'); buzz(60); fx(sc, 'eyeflash', 2600); }
    else if (type === 'blackout') { ABY.Audio.sfx('blackfx'); buzz(120); var b = $('blackout'); b.classList.add('on'); setTimeout(function () { b.classList.remove('on'); }, reduced ? 500 : 2200); }
    else { ABY.Audio.sfx('whisper'); fx(sc, 'flick', 1100); }                     // whisper
  }
  function corrupt(el, text) {                                                    // at high dread her own words are not quite stable
    if (reduced || Math.random() < 0.4) return; var node = el.lastChild; if (!node || node.nodeType !== 3) return;
    var glyphs = '\u2593\u2592\u2591#@%&?', arr = text.split(''), n = Math.min(5, Math.floor(text.length / 8));
    for (var k = 0; k < n; k++) { var i = Math.floor(Math.random() * arr.length); if (arr[i] !== ' ') arr[i] = glyphs.charAt(Math.floor(Math.random() * glyphs.length)); }
    node.nodeValue = arr.join(''); setTimeout(function () { node.nodeValue = text; }, 700);
  }
  function ambient(dt) {                                                          // dread >= 4: the screen glitches by itself; >= 5: strangers text
    if (!G.run || G.state.dread < 4 || P.screen !== 'msg' || ABY.Song.active || G.delivering || document.body.classList.contains('finale')) return;
    ambT -= dt; if (ambT > 0) return; ambT = 9 + Math.random() * 9;
    scare('glitch'); if (G.state.dread >= 5 && Math.random() < 0.55) { ABY.Audio.sfx('creep'); P.banner({ title: 'No Caller ID', icon: 'ic-eye', glyph: '\u25C9', text: CREEPS[Math.floor(Math.random() * CREEPS.length)] }); }
  }

  // ---- the song (the Echo Flute) ----
  function startSong(practice) {
    if (G.busy) return; ABY.Audio.init(); G.practice = !!practice; G.busy = true;
    flash(function () {
      G.busy = false; P.lockAll(true); document.body.classList.add('song'); $('songCv').classList.add('on'); $('replies').classList.remove('on');
      ABY.Scene.setStage('wall', 0.8); ABY.Scene.setFocus(practice ? 'queen' : 'guardian'); ABY.Song.start(songDone, practice ? null : ABY.RITES[ABY.NODES[G.state.node].song]);
    });
  }
  function songDone(won, st) {
    $('songCv').classList.remove('on'); document.body.classList.remove('song'); P.lockAll(false);
    var rite = !G.practice && ABY.RITES[ABY.NODES[G.state.node].song], pct = Math.round(st.acc * 100), note = (rite ? rite.name.replace(/\b(\w)(\w*)/g, function (m, a, b) { return a + b.toLowerCase(); }) : 'Song of Recall') + ': ' + pct + '%  ·  ' + st.perfect + ' perfect, ' + st.good + ' good, ' + st.miss + ' missed';
    if (pct > G.songBest) { G.songBest = pct; }
    if (won) { ABY.Audio.sfx('song'); ABY.Scene.burst(240, 260, 0xffffff, 70, 5); }
    if (G.practice) { P.show('flute'); $('fTxt').textContent = (won ? 'The song held. ' : 'The song faltered. ') + note.replace(/^[^:]*: /, ''); save(); return; }
    P.show('msg'); G.state = ABY.songDone(G.state, won); bubble('sys', '', '♪ ' + note); entry('sys', '', '♪ ' + note, ''); save();
    wait(won ? 1100 : 500, function () { deliver(G.state.node); });
  }

  // ---- the end: the gate opens, then the memory ----
  function finale() {
    var id = ABY.endingOf(G.state), E = ABY.ENDINGS[id]; G.ending = id; G.delivering = false; stopRing();
    P.lockAll(true); document.body.classList.add('finale'); ABY.Scene.setStage('chat', 1); ABY.Scene.setGate(id); ABY.Scene.setMood(E.mood); ABY.Scene.setFocus('gate'); ABY.Scene.openGate(true);
    P.setSignal(E.mood); ABY.Audio.sfx(id); buzz(30); if (id === 'blackout') { $('blackout').classList.add('on'); setTimeout(function () { $('blackout').classList.remove('on'); }, reduced ? 400 : 2400); } ABY.Scene.burst(240, 300, 0xffd34d, 60, 4.5);
    var first = !G.found[id]; G.found[id] = 1; G.lean = ABY.leaning(G.state); var gain = ABY.badgesFor(G.found, G.state).filter(function (b) { return !G.badges[b]; }); gain.forEach(function (b) { G.badges[b] = 1; }); G.run = false; bubble('stamp', '', '— end —', true); G.log = []; save(); if (first) P.badge('gallery', 1);
    clearTimeout(endTimer); endTimer = setTimeout(function () { P.lockAll(false); memory(id, first ? 'New memory saved' : 'Memory', true); if (gain.length) P.banner({ title: 'Badge earned', icon: 'ic-gal', glyph: '\u2605', text: gain.map(function (b) { return badge(b).name; }).join(' · '), onTap: function () { open('gallery'); } }); }, reduced ? 300 : 2600);
  }
  function badge(id) { return ABY.BADGES.filter(function (b) { return b.id === id; })[0]; }
  function memory(id, kicker, ended) {
    $('blackout').classList.remove('on');
    var E = ABY.ENDINGS[id]; G.shown = id; $('eKick').textContent = kicker; $('eName').textContent = E.name; $('eText').textContent = E.text;
    var dots = $('eDots'); dots.innerHTML = ''; ABY.ENDING_IDS.forEach(function (e) { var d = document.createElement('i'); if (G.found[e]) d.className = 'f'; dots.appendChild(d); });
    $('memAct').textContent = ended ? 'New journey' : 'Close'; $('memAct').setAttribute('data-ended', ended ? '1' : '0'); $('memNext').hidden = !(ended && E.cont && ABY.carry(G.state)); $('shareBtn').textContent = 'Share';
    $('memory').classList.add('on');
  }
  function closeMemory() { $('memory').classList.remove('on'); document.body.classList.remove('finale'); }
  // ---- sharing: a card painted from the game's art, a Share screen, a landing page per ending ----
  function openShare(kind, id, from) {
    var m = ABY.Share.moment(kind, id, G.found, { faction: G.faction, badges: badgeN() }); G.share = m; G.shareFrom = from || 'gallery'; m.cv = ABY.Share.card(m.info);
    var prev = $('shPrev');
    var paint = function () { m.cv = ABY.Share.card(m.info); prev.innerHTML = ''; prev.appendChild(m.cv); m.cv.setAttribute('role', 'img'); m.cv.setAttribute('aria-label', 'Share card: ' + m.info.title); ABY.Share.file(m.cv).then(function (f) { m.file = f; }); };   // the file is ready before the tap that shares it
    paint(); if (document.fonts && document.fonts.load) Promise.all([document.fonts.load('700 30px "Space Grotesk"'), document.fonts.load('500 20px "Space Grotesk"')]).then(function () { if (G.share === m) paint(); }, function () {});   // repaint once the game's font is in
    $('shSub').textContent = kind === 'ending' ? ABY.ENDINGS[id].name : 'My progress'; $('shLink').textContent = m.url.replace(/^https:\/\//, '');
    $('shNative').hidden = !navigator.share; ['shCopy'].forEach(function (b) { $(b).textContent = 'Copy link'; });
    P.show('share');
  }
  function shareAct(what) {
    var m = G.share; if (!m) return; ABY.Audio.sfx('ui');
    var done = function (id, msg, back) { var b = $(id); b.textContent = msg; clearTimeout(shareTimer); shareTimer = setTimeout(function () { b.textContent = back; }, 2200); };
    if (what === 'native') { var d = { title: 'Kudbee Abyss', text: m.text, url: m.url }; if (m.file && ABY.Share.canFiles(m.file)) d.files = [m.file]; if (navigator.share) navigator.share(d).catch(function () {}); return; }
    if (what === 'copy') { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(m.text + ' ' + m.url).then(function () { done('shCopy', 'Link copied', 'Copy link'); }, function () { done('shCopy', 'Copy failed', 'Copy link'); }); else done('shCopy', 'Copy failed', 'Copy link'); return; }
    if (what === 'save') { var a = document.createElement('a'); a.download = 'kudbee-abyss-' + m.slug + '.png'; a.href = m.cv.toDataURL('image/png'); document.body.appendChild(a); a.click(); a.remove(); done('shSave', 'Saved', 'Save image'); return; }
    window.open(ABY.Share.intent(what, m.text, m.url), '_blank', 'noopener');
  }

  // ---- a journey ----
  function startRun(carry) {
    var day2 = carry && ABY.carry(G.state); G.state = day2 || ABY.newState(foundN()); G.run = true; G.started = true; G.saved = null; G.log = []; G.lastCh = 0; G.pending = 0; G.ending = null; G.seen = {}; if (day2) day2.notes.forEach(function (k) { G.seen[k] = 1; }); noteN = 0; P.badge('notes', 0); stopRing(); ABY.Scene.setTorch(false); ABY.Scene.openGate(false); closeMemory(); P.lockAll(false);
    $('thread').innerHTML = ''; $('replies').innerHTML = ''; P.badge('msg', 0);
    var stamp = (day2 ? 'Day Two \u00B7 ' : 'Today ') + P.fmt(187); bubble('stamp', '', stamp, true); entry('stamp', '', stamp, '');
    if (P.screen !== 'msg') P.show('msg'); maybeGuide(); world(); var first = G.state.node; wait(700, function () { deliver(first); });
  }
  function rebuild() {                                                     // the saved chat, drawn at once
    $('thread').innerHTML = ''; G.log.forEach(function (e) { if (e.k === 'img') photo(e.t, true); else bubble(e.k, e.who, e.t, true); }); scrollEnd(false);
  }
  function openMsgApp() {
    if (G.run && G.started) { scrollEnd(false); return; }
    if (G.saved && !G.run) { resume(); return; }
    startRun();
  }
  function resume() {
    G.state = G.saved.state; G.log = G.saved.log; G.saved = null; G.run = true; G.seen = {}; G.state.notes.forEach(function (k) { G.seen[k] = 1; }); G.started = true; G.lastCh = N[G.state.node] ? N[G.state.node].ch : 0; G.pending = 0; rebuild();
    deliver(G.state.node, true);
  }

  // ---- apps ----
  function ring(svg, cx, r, w, frac, color) {
    var c = 2 * Math.PI * r, bg = document.createElementNS('http://www.w3.org/2000/svg', 'circle'), fg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    [bg, fg].forEach(function (e) { e.setAttribute('cx', cx); e.setAttribute('cy', cx); e.setAttribute('r', r); e.setAttribute('stroke-width', w); svg.appendChild(e); });
    bg.setAttribute('class', 'bg'); fg.setAttribute('stroke', color); fg.setAttribute('stroke-dasharray', '0 ' + c); requestAnimationFrame(function () { requestAnimationFrame(function () { fg.setAttribute('stroke-dasharray', (c * Math.max(0.02, frac)) + ' ' + c); }); });
  }
  function rings(svg, size, rs, w) { svg.innerHTML = ''; var s = G.state, v = active() ? [s.heart, s.resolve, s.trust, s.dread * 5 / ABY.MAX_DREAD] : [0, 0, 0, 0], col = ['#ff6ec7', '#ffd34d', '#7cffb2', '#ff4d5e']; rs.forEach(function (r, i) { ring(svg, size / 2, r, w, v[i] / 5, col[i]); }); }
  function renderHome() {
    rings($('wRings'), 64, [29, 23, 17, 11], 4); var s = G.state;
    $('wT').textContent = active() && G.node ? 'Chapter ' + G.node.ch + ' · ' + ABY.CHAPTERS[G.node.ch - 1].label : 'The Guardian’s Gate';
    $('wS').textContent = active() ? 'Heart ' + s.heart + ' · Resolve ' + s.resolve + ' · Trust ' + s.trust + ' · Dread ' + s.dread : (foundN() ? 'Endings found ' + foundN() + '/' + ABY.ENDING_IDS.length + ' · open Messages' : 'A message is waiting in Messages');
  }
  function renderLock() {
    var list = [], last = null; for (var i = G.log.length - 1; i >= 0; i--) if (G.log[i].k === 'in' || G.log[i].k === 'sys') { last = G.log[i]; break; }
    if (active() && last) list.push({ title: WHO[last.who] || 'Unknown', text: last.t, when: 'now', onTap: function () { open('msg'); } });
    else if (!active() && foundN() > 0) list.push({ title: 'Gallery', icon: 'ic-gal', glyph: '❉', text: 'You have found ' + foundN() + ' of ' + ABY.ENDING_IDS.length + ' memories.', when: 'today', onTap: function () { open('gallery'); } });
    else list.push({ title: 'Unknown', text: 'You’re awake. Do you hear it? The flute is calling.', when: 'now', onTap: function () { open('msg'); },
      replies: N[ABY.START].choices.map(function (c, i) { return { label: c.label, fn: function () { G.autoPick = i; open('msg'); } }; }) });
    list.push({ title: 'Echo Flute', icon: 'ic-flute', glyph: '♪', text: G.songBest ? 'Your best: ' + G.songBest + '%. The song is waiting.' : 'Your flute is ready. The Song of Recall is waiting.', when: '3:07', onTap: function () { open('flute'); } });
    P.setNotes(list);
  }
  function renderHome2() {
    var n = foundN(), tot = ABY.ENDING_IDS.length; rings($('h2Rings'), 64, [29, 23, 17, 11], 4);
    $('h2N').textContent = n + ' of ' + tot + ' endings'; $('h2S').textContent = n ? ABY.rank(badgeN()) + ' · ' + badgeN() + ' of ' + ABY.BADGE_IDS.length + ' badges' + (G.faction ? ' · ' + ABY.FACTIONS[G.faction].name : '') : 'Every choice you make can end it differently.';
    var d = $('h2Dots'); d.innerHTML = ''; ABY.ENDING_IDS.forEach(function (id) { var i = document.createElement('i'); if (G.found[id]) { i.className = 'f'; i.style.background = ECOL[id][1]; i.style.color = ECOL[id][0]; i.title = ABY.ENDINGS[id].title; } d.appendChild(i); });
    var b = $('h2Badges'); b.innerHTML = ''; ABY.BADGES.forEach(function (x) { var e = document.createElement('span'); e.textContent = G.badges[x.id] ? x.name : '? ' + x.hint; if (!G.badges[x.id]) e.className = 'off'; b.appendChild(e); });
  }
  function maybeGuide() {                                                   // first run only: say what to do, once
    if (G.guided || foundN() > 0 || !$('guide').hidden || $('memory').classList.contains('on') || ABY.Song.active) return; $('guide').hidden = false; $('gOk').focus({ preventScroll: true });
  }
  function renderGallery() {
    var box = $('tiles'); box.innerHTML = ''; $('gSub').textContent = foundN() + ' of ' + ABY.ENDING_IDS.length + ' memories'; P.badge('gallery', 0); $('gShare').hidden = foundN() === 0;
    ABY.ENDING_IDS.forEach(function (id) {
      var E = ABY.ENDINGS[id], f = G.found[id], b = document.createElement('button'); b.type = 'button'; b.className = 'tile ' + (f ? 'f' : 'locked');
      if (f) { b.style.setProperty('--g1', ECOL[id][0] + '88'); b.style.setProperty('--g2', ECOL[id][1]); }
      var h = document.createElement('h3'), p = document.createElement('p'); h.textContent = f ? E.name : 'Locked'; p.textContent = f ? '' : E.hint; b.appendChild(h); b.appendChild(p);
      if (f) b.addEventListener('click', function () { ABY.Audio.sfx('ui'); memory(id, 'Memory', false); }); box.appendChild(b);
    });
    renderFaction(); renderBadges();
  }
  function badgeN() { return ABY.BADGE_IDS.filter(function (b) { return G.badges[b]; }).length; }
  function renderFaction() {
    var box = $('faction'); box.innerHTML = ''; var F = ABY.FACTIONS, cur = G.faction && F[G.faction], lean = G.lean && F[G.lean];
    var h = document.createElement('h3'); h.textContent = cur ? 'Sworn to ' + cur.name : 'Factions'; box.appendChild(h);
    var p = document.createElement('p'); p.textContent = cur ? ABY.rank(badgeN()) + ' \u00B7 ' + badgeN() + ' of ' + ABY.BADGE_IDS.length + ' badges. ' + cur.blurb : (foundN() ? (lean ? lean.name + ' is calling you. ' : '') + 'Pledge to one. It is your own choice, and you can change it.' : 'Find an ending to hear them call.'); box.appendChild(p);
    if (!foundN()) return;
    var row = document.createElement('div'); row.className = 'facrow';
    ABY.FACTION_IDS.forEach(function (id) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'fbtn' + (G.faction === id ? ' on' : '') + (G.lean === id ? ' lean' : ''); b.style.setProperty('--fc', F[id].color); b.setAttribute('aria-pressed', G.faction === id ? 'true' : 'false'); b.textContent = F[id].name.replace('The ', '');
      b.addEventListener('click', function () { ABY.Audio.sfx('ui'); G.faction = id; save(); renderFaction(); }); row.appendChild(b);
    }); box.appendChild(row);
  }
  function renderBadges() {
    var box = $('badges'); box.innerHTML = ''; $('bSub').textContent = badgeN() + ' of ' + ABY.BADGE_IDS.length + ' badges';
    ABY.BADGES.forEach(function (b) {
      var e = !!G.badges[b.id], d = document.createElement('div'); d.className = 'bdg' + (e ? ' on' : ''); var i = document.createElement('i'); i.textContent = e ? '\u2605' : '\u2022'; var t = document.createElement('span'); t.textContent = e ? b.name : b.hint; d.appendChild(i); d.appendChild(t); d.setAttribute('title', b.hint); box.appendChild(d);
    });
  }
  function renderPulse() {
    rings($('bigR'), 120, [54, 44, 34, 24], 8); var s = G.state, v = active() ? [s.heart, s.resolve, s.trust, s.dread] : [0, 0, 0, 0], box = $('ringsL'); box.innerHTML = '';
    [['Heart', '#ff6ec7', 'What she remembers'], ['Resolve', '#ffd34d', 'What she will risk'], ['Trust', '#7cffb2', 'Who she lets in'], ['Dread', '#ff4d5e', 'What has seen her (at 6 she comes apart)']].forEach(function (r, i) {
      var d = document.createElement('div'); d.className = 'rl'; var l = document.createElement('div'), b = document.createElement('b'), sm = document.createElement('small'), val = document.createElement('span');
      b.textContent = r[0]; b.style.color = r[1]; sm.textContent = r[2]; l.appendChild(b); l.appendChild(sm); val.className = 'v'; val.style.color = r[1]; val.textContent = v[i] + '/' + (i === 3 ? ABY.MAX_DREAD : 5); d.appendChild(l); d.appendChild(val); box.appendChild(d);
    });
    $('pSub').textContent = (active() ? 'Choices made ' + s.choices + ' · ' : '') + 'Endings found ' + foundN() + '/' + ABY.ENDING_IDS.length + (G.songBest ? ' · Song best ' + G.songBest + '%' : '');
  }
  function renderNotes() {
    var box = $('noteList'); box.innerHTML = ''; noteN = 0; P.badge('notes', 0); var ks = active() ? G.state.notes : [];
    $('nSub').textContent = ks.length + ' of ' + Object.keys(ABY.NOTES).length + ' clues';
    if (!ks.length) { var e = document.createElement('p'); e.className = 'hint2'; e.textContent = 'Nothing yet. Clues you find (photos, recordings, calls, pages) are kept here, and some unlock things you can say.'; box.appendChild(e); return; }
    ks.forEach(function (k) { var n = ABY.NOTES[k], d = document.createElement('div'); d.className = 'nt'; var h = document.createElement('h3'), p = document.createElement('p'); h.textContent = n.title; p.textContent = n.text; d.appendChild(h); d.appendChild(p); box.appendChild(d); });
  }
  function renderStore() {
    var box = $('stList'); box.innerHTML = ''; var n = foundN(), got = 0;
    ABY.STORE.forEach(function (a) {
      var ok = n >= a.need, has = G.apps[a.id]; if (has) got++;
      var row = document.createElement('div'); row.className = 'sti' + (ok ? '' : ' lk');
      var ic = document.createElement('span'); ic.className = 'ico'; ic.textContent = ok ? a.glyph : '?'; ic.style.background = 'linear-gradient(145deg,' + a.c[0] + ',' + a.c[1] + ')';
      var tx = document.createElement('div'); tx.className = 'tx'; var b = document.createElement('b'), sm = document.createElement('small');
      b.textContent = ok ? a.name : 'Locked'; sm.textContent = ok ? a.tag + ' \u2014 ' + a.blurb : 'Find ' + a.need + ' ending' + (a.need === 1 ? '' : 's') + ' to see this listing.'; tx.appendChild(b); tx.appendChild(sm);
      var g = document.createElement('button'); g.type = 'button'; g.className = 'get' + (ok ? '' : ' lk'); g.textContent = !ok ? 'LOCKED' : has ? 'OPEN' : 'GET'; g.disabled = !ok;
      g.addEventListener('click', function () { if (!ok) return; if (!G.apps[a.id]) { G.apps[a.id] = 1; save(); ABY.Audio.sfx('ui'); } renderApp(a.id); P.show('appx'); });
      row.appendChild(ic); row.appendChild(tx); row.appendChild(g); box.appendChild(row);
    });
    $('stSub').textContent = got + ' installed \u00b7 ' + ABY.STORE.length + ' listings';
  }
  function renderApp(id) {
    var a = ABY.STORE.filter(function (x) { return x.id === id; })[0]; if (!a) return;
    $('axName').textContent = a.name; $('axTag').textContent = a.tag; var box = $('axBody'); box.innerHTML = '';
    a.lore.forEach(function (t) { var d = document.createElement('div'); d.className = 'nt'; var p = document.createElement('p'); p.textContent = t; d.appendChild(p); box.appendChild(d); });
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
    if (name !== 'msg') G.autoPick = null;
    if (name === 'home') maybeGuide();
    if (name === 'lock') renderLock(); else if (name === 'home') renderHome(); else if (name === 'home2') renderHome2(); else if (name === 'gallery') renderGallery(); else if (name === 'pulse') renderPulse(); else if (name === 'store') renderStore(); else if (name === 'flute') renderFlute(); else if (name === 'notes') renderNotes(); else if (name === 'settings') renderSettings();
    else if (name === 'msg') openMsgApp();
    if (name !== 'msg' && G.node && name !== 'lock') { /* the wallpaper keeps the speaker in view */ }
  }

  // ---- loop ----
  function flash(fn) { var f = $('flash'); f.style.opacity = '1'; setTimeout(function () { fn(); setTimeout(function () { f.style.opacity = '0'; }, 60); }, reduced ? 30 : 200); }
  function update(dt, now) { if (ABY.Song.active) ABY.Song.update(dt); else { ABY.Audio.wander(now, ABY.Scene.mood); ambient(dt); } }
  function frame(now) { raf = requestAnimationFrame(frame); var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016; last = now; update(dt, now); ABY.Scene.render(now); ABY.Song.draw(); }
  function wake() { if (!raf && !document.hidden) { last = 0; raf = requestAnimationFrame(frame); } }
  function sleep() { cancelAnimationFrame(raf); raf = 0; }
  document.addEventListener('visibilitychange', function () { if (document.hidden) { sleep(); if (ABY.Audio.ctx) ABY.Audio.ctx.suspend(); } else { wake(); if (ABY.Audio.ctx && !ABY.Audio.muted) ABY.Audio.ctx.resume(); } });
  ABY.debug = { frames: function () { return ABY.Scene.frames; }, running: function () { return !!raf; },
    // test hook: be at scene `id` with some stats (the evaluator and the screenshots use it; a player never does)
    goto: function (id, patch) {
      G.state = Object.assign(ABY.newState(), patch || {}); G.state.node = id; G.state.flags = Object.assign({}, (patch && patch.flags) || {}); G.state.notes = ((patch && patch.notes) || []).slice();
      clearTimeout(delayT); G.run = true; G.started = true; G.saved = null; G.log = []; G.lastCh = 0; G.seen = {}; G.ending = null; closeMemory(); stopRing(); P.lockAll(false); $('thread').innerHTML = ''; $('replies').innerHTML = '';
      if (P.screen !== 'msg') P.show('msg'); world(); deliver(id);
    },
    tick: function (dt) { ambient(dt); } };
  function resize() { ABY.Scene.resize(); ABY.Song.resize(); }
  window.addEventListener('resize', resize); window.addEventListener('orientationchange', function () { setTimeout(resize, 200); });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);

  // ---- input ----
  $('screen').addEventListener('pointermove', function (e) { if (e.pointerType !== 'mouse') return; var r = $('screen').getBoundingClientRect(); ABY.Scene.pointer(((e.clientX - r.left) / r.width - 0.5) * 2, ((e.clientY - r.top) / r.height - 0.5) * 2); });
  document.addEventListener('pointerdown', function () { ABY.Audio.init(); ABY.Audio.pad(G.node ? G.node.mood : 'void'); }, { once: true });
  $('thread').addEventListener('click', skip);
  $('torchBtn').addEventListener('click', function () {                            // the flashlight: costs battery, and the dark is worse without it
    if (!G.run || P.locked || G.busy) return; ABY.Audio.init(); ABY.Audio.sfx('click'); buzz(8);
    var ns = ABY.toggleLight(G.state), moved = ns.node !== G.state.node; G.state = ns; world(); save();
    if (moved) { $('replies').classList.remove('on'); deliver(ns.node); } else if (!G.delivering && G.node && !G.node.ending) showReplies(G.node);
  });
  $('rotBtn').addEventListener('click', function () { ABY.Audio.sfx('ui'); P.setOrient(G.orient === 'landscape' ? 'portrait' : 'landscape'); G.orient = P.orient; save(); });
  $('gOk').addEventListener('click', function () { G.guided = true; $('guide').hidden = true; save(); });
  $('fPlay').addEventListener('click', function () { startSong(true); });
  $('shareBtn').addEventListener('click', function () { ABY.Audio.sfx('ui'); openShare('ending', G.shown, 'gallery'); });
  $('shNative').addEventListener('click', function () { shareAct('native'); }); $('shX').addEventListener('click', function () { shareAct('x'); }); $('shFb').addEventListener('click', function () { shareAct('fb'); }); $('shWa').addEventListener('click', function () { shareAct('wa'); }); $('shCopy').addEventListener('click', function () { shareAct('copy'); }); $('shSave').addEventListener('click', function () { shareAct('save'); });
  $('axBack').addEventListener('click', function () { ABY.Audio.sfx('ui'); P.show('store'); });
  $('shBack').addEventListener('click', function () { ABY.Audio.sfx('ui'); P.show(G.shareFrom || 'home'); });
  $('pShare').addEventListener('click', function () { ABY.Audio.sfx('ui'); openShare('progress', null, 'pulse'); }); $('gShare').addEventListener('click', function () { ABY.Audio.sfx('ui'); openShare('progress', null, 'gallery'); });
  $('memNext').addEventListener('click', function () { ABY.Audio.sfx('ui'); closeMemory(); startRun(true); });
  $('memAct').addEventListener('click', function () { ABY.Audio.sfx('ui'); if ($('memAct').getAttribute('data-ended') === '1') { closeMemory(); startRun(); } else closeMemory(); });
  $('setSnd').addEventListener('click', function () { ABY.Audio.init(); ABY.Audio.setMuted(!ABY.Audio.muted); renderSettings(); save(); });
  $('setHap').addEventListener('click', function () { G.haptics = !G.haptics; renderSettings(); save(); if (G.haptics) ABY.Audio.buzz(15); });
  arm('setNew', 'Tap again to erase this chat', function () { G.saved = null; G.run = false; G.log = []; save(); startRun(); });
  arm('setRes', 'Tap again to erase every memory', function () { G.found = {}; G.badges = {}; G.apps = {}; G.faction = ''; G.lean = ''; save(); renderGallery(); P.badge('gallery', 0); });
  window.addEventListener('keydown', function (e) {
    var k = e.key.toLowerCase(); if (e.repeat) return;
    if (k === 'm') { ABY.Audio.setMuted(!ABY.Audio.muted); renderSettings(); save(); return; }
    if (k === 'r' && P.canRotate()) { P.setOrient(G.orient === 'landscape' ? 'portrait' : 'landscape'); G.orient = P.orient; save(); return; }
    if (k === 'f' && P.screen === 'msg' && G.run) { $('torchBtn').click(); return; }
    if (ABY.Song.active) return;
    if (P.screen === 'lock' && (k === 'enter' || k === ' ')) { e.preventDefault(); P.unlock(); return; }
    if (P.screen === 'msg') {
      if ((k === 'enter' || k === ' ') && G.delivering) { e.preventDefault(); skip(); return; }
      var n = parseInt(k, 10), b = $('replies').querySelectorAll('.chip'); if (n >= 1 && n <= b.length) b[n - 1].click();
    }
  });

  // ---- boot ----
  function boot() {
    load(); if (/[?&]fresh=1(&|$)/.test(location.search)) { G.saved = null; try { history.replaceState(null, '', location.pathname); } catch (e) { /* a shared link starts a clean journey: the old one stays on the phone until she plays */ } }
    ABY.Song.init($('songCv')); P.init({ onShow: onShow }); P.setOrient(G.orient);
    var pre = $('pre'), booted = false, stage = $('screen');
    function ready(gl) {
      if (booted) return; booted = true; if (!gl) stage.classList.add('nogl');
      if (G.saved) { G.state = G.saved.state; G.node = N[G.state.node]; G.log = G.saved.log; } ABY.Scene.setMood('void'); ABY.Scene.setFocus('queen'); world(); P.show('lock');
      setTimeout(function () { pre.classList.add('done'); }, 250); wake();
    }
    var img = new Image(), bgi = new Image(), bgi2 = new Image(), bgi3 = new Image(), bgi4 = new Image(), tried = 0, got = 0;
    function both() { if (++got === 5) ready(ABY.Scene.init($('three-canvas'), img, bgi.naturalWidth ? bgi : null, bgi2.naturalWidth ? bgi2 : null, bgi3.naturalWidth ? bgi3 : null, bgi4.naturalWidth ? bgi4 : null)); }
    img.onload = both; bgi.onload = both; bgi.onerror = both; bgi2.onload = both; bgi2.onerror = both; bgi3.onload = both; bgi3.onerror = both; bgi4.onload = both; bgi4.onerror = both;      // the cities are a bonus: without them the nebula stays
    img.onerror = function () { if (tried++ === 0) img.src = 'assets/character/queen.png'; else ready(false); };
    var eyeImg = bgi4; eyeImg.src = 'assets/world/abyss-eye.webp';
    ABY.Art = { queen: img, city: bgi, corrupt: bgi2, stairs: bgi3, eye: eyeImg };                       // the share cards are painted from these
    img.src = 'assets/character/queen-960.webp'; bgi.src = 'assets/world/abyss-city.webp'; bgi2.src = 'assets/world/abyss-city-corrupt.webp'; bgi3.src = 'assets/world/abyss-stairs.webp';
    setTimeout(function () { ready(false); }, 6000);                    // a slow or blocked 3D library never keeps her waiting
  }
  boot();
})();
