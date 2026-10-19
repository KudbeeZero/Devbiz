/* =====================================================================
 * Kudbee Abyss - phone.js (THE PHONE: the operating system the story lives on)
 * A lock screen with notifications, a home screen with apps, a status bar whose clock
 * is STORY time (it moves a few minutes with every choice) and whose signal and battery
 * answer the story, banners for new messages, a home bar you swipe or tap. The live 3D
 * scene is the wallpaper behind all of it. This file is only the shell: what an app
 * shows is filled in by game.js through hooks.onShow(name).
 * On a desktop it sits in a phone bezel; on a real phone it is the whole screen.
 * ===================================================================== */
var ABY = window.ABY = window.ABY || {};

ABY.Phone = (function () {
  var P = { screen: 'lock', hooks: {}, locked: false };
  var $ = function (id) { return document.getElementById(id); };
  var APPS = ['home2', 'msg', 'flute', 'gallery', 'pulse', 'settings', 'share', 'notes', 'store', 'appx'], bannerT = 0, badges = { msg: 0, gallery: 0, notes: 0 };
  var DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var SIGNAL = { void: 1, spire: 3, dusk: 2, gate: 4, dawn: 4, dark: 0, throne: 0 };
  P.orient = 'portrait';

  // story time -> "3:07" (the clock is part of the story; it never shows the real time)
  P.fmt = function (mins) { var h = Math.floor(mins / 60) % 12 || 12, m = mins % 60; return h + ':' + (m < 10 ? '0' : '') + m; };
  P.setTime = function (mins) { var t = P.fmt(mins); $('clock').textContent = t; $('lkTime').textContent = t; };
  P.setBattery = function (pct) { pct = Math.max(1, Math.min(100, Math.round(pct))); $('batN').textContent = pct + '%'; var b = $('bat'); b.firstElementChild.style.width = pct + '%'; b.classList.toggle('low', pct <= 20); };
  P.setSignal = function (mood) {
    var n = SIGNAL[mood] == null ? 1 : SIGNAL[mood], bars = $('sig').children; for (var i = 0; i < 4; i++) bars[i].className = i < n ? 'on' : '';
    $('carrier').textContent = n === 0 ? 'NO SERVICE' : n === 4 ? 'ECHO 5G' : 'ECHO';
  };
  P.setDate = function (txt) { $('lkDate').textContent = txt; };

  P.badge = function (app, n) {
    badges[app] = n; var host = app === 'msg' ? $('icMsg') : app === 'gallery' ? $('icGal') : app === 'notes' ? $('icNotes') : null; if (!host) return;
    var b = host.querySelector('.badge'); if (!n) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('span'); b.className = 'badge'; host.appendChild(b); } b.textContent = n > 9 ? '9+' : String(n);
  };

  // ---- navigation ----
  P.show = function (name) {
    if (P.locked) return;
    var prev = P.screen; P.screen = name;
    ['lock', 'home'].concat(APPS).forEach(function (id) { $(id).classList.toggle('on', id === name); });
    var dev = $('device'); dev.classList.remove('s-lock', 's-home', 's-app'); dev.classList.add(name === 'lock' ? 's-lock' : name === 'home' || name === 'home2' ? 's-home' : 's-app');
    var pg = $('pager').children; pg[0].classList.toggle('on', name !== 'home2'); pg[1].classList.toggle('on', name === 'home2');
    if (ABY.Scene) ABY.Scene.setStage(name === 'msg' ? 'chat' : 'wall', name === 'lock' ? 0.95 : name === 'home' || name === 'home2' ? 0.1 : name === 'msg' ? 1 : 0.1);
    if (name === 'msg') P.badge('msg', 0);
    if (P.hooks.onShow) P.hooks.onShow(name, prev);
  };
  P.goHome = function () { if (!P.locked && P.screen !== 'lock') P.show('home'); };
  P.unlock = function () { if (P.screen === 'lock') { if (ABY.Audio) { ABY.Audio.init(); ABY.Audio.sfx('ui'); } P.show('home'); } };
  P.lockAll = function (on) { P.locked = !!on; };                      // while the song or an ending plays, the home bar does nothing

  // ---- banner (a new message while she is somewhere else) ----
  P.banner = function (o) {
    var el = $('banner'); el.innerHTML = '';
    var n = document.createElement('button'); n.type = 'button'; n.className = 'note';
    var ic = document.createElement('span'); ic.className = 'ico ' + (o.icon || 'ic-msg'); ic.textContent = o.glyph || '\u{1F4AC}';
    var tx = document.createElement('span'); tx.className = 'tx'; var h = document.createElement('span'); h.className = 'h'; var a = document.createElement('span'); a.textContent = o.title; var w = document.createElement('span'); w.textContent = o.when || 'now'; h.appendChild(a); h.appendChild(w);
    var b = document.createElement('span'); b.className = 'b'; b.textContent = o.text; tx.appendChild(h); tx.appendChild(b); n.appendChild(ic); n.appendChild(tx);
    n.addEventListener('click', function () { P.hideBanner(); if (o.onTap) o.onTap(); }); el.appendChild(n);
    requestAnimationFrame(function () { el.classList.add('on'); }); clearTimeout(bannerT); bannerT = setTimeout(P.hideBanner, 4200);
  };
  P.hideBanner = function () { $('banner').classList.remove('on'); };

  // ---- lock screen notifications: a list of {glyph, icon, title, when, text, onTap} ----
  P.setNotes = function (list) {
    var box = $('lkNotes'); box.innerHTML = '';
    list.forEach(function (o, i) {
      var n = document.createElement('button'); n.type = 'button'; n.className = 'note'; n.style.animationDelay = (0.25 + i * 0.18) + 's';
      var ic = document.createElement('span'); ic.className = 'ico ' + (o.icon || 'ic-msg'); ic.textContent = o.glyph || '\u{1F4AC}';
      var tx = document.createElement('span'); tx.className = 'tx'; var h = document.createElement('span'); h.className = 'h'; var a = document.createElement('span'); a.textContent = o.title; var w = document.createElement('span'); w.textContent = o.when || 'now'; h.appendChild(a); h.appendChild(w);
      var b = document.createElement('span'); b.className = 'b'; b.textContent = o.text; tx.appendChild(h); tx.appendChild(b); n.appendChild(ic); n.appendChild(tx);
      n.addEventListener('click', function (e) { e.stopPropagation(); if (o.onTap) o.onTap(); }); box.appendChild(n);
      if (o.replies) {                                                    // quick replies under a notification: answer without opening it
        var rw = document.createElement('div'); rw.className = 'nrep'; rw.style.animation = 'noteIn .6s var(--ease) both'; rw.style.animationDelay = (0.45 + i * 0.18) + 's';
        o.replies.forEach(function (r) { var b2 = document.createElement('button'); b2.type = 'button'; b2.textContent = r.label; b2.addEventListener('click', function (e) { e.stopPropagation(); r.fn(); }); rw.appendChild(b2); }); box.appendChild(rw);
      }
    });
  };

  // ---- orientation: on a real phone the screen turns by itself; on a desktop the simulated phone can be laid on its side ----
  P.canRotate = function () { var b = $('rotBtn'); return !!b && getComputedStyle(b).display !== 'none'; };
  P.setOrient = function (o) {
    P.orient = o === 'landscape' ? 'landscape' : 'portrait'; $('device').classList.toggle('land', P.orient === 'landscape');
    var b = $('rotBtn'); if (b) { b.setAttribute('aria-pressed', P.orient === 'landscape' ? 'true' : 'false'); b.setAttribute('aria-label', P.orient === 'landscape' ? 'Hold the phone upright' : 'Turn the phone on its side'); }
    requestAnimationFrame(function () { window.dispatchEvent(new Event('resize')); });
  };

  // ---- gestures ----
  function swipe(el, up, tap) {
    var y0 = null, t0 = 0;
    el.addEventListener('pointerdown', function (e) { y0 = e.clientY; t0 = performance.now(); });
    window.addEventListener('pointerup', function (e) { if (y0 === null) return; var dy = e.clientY - y0, dt = performance.now() - t0; y0 = null; if (dy < -34) up(); else if (tap && Math.abs(dy) < 10 && dt < 400) tap(e); });
    window.addEventListener('pointercancel', function () { y0 = null; });
  }

  function hswipe(el, left, right) {                                   // a sideways flick between the two home pages (no pointer capture: the icons still get their taps)
    var x0 = null, y0 = 0, hit = 0;
    el.addEventListener('pointerdown', function (e) { x0 = e.clientX; y0 = e.clientY; });
    window.addEventListener('pointerup', function (e) {
      if (x0 === null) return; var dx = e.clientX - x0, dy = e.clientY - y0; x0 = null;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) { hit = performance.now(); if (dx < 0) left(); else right(); }
    });
    window.addEventListener('pointercancel', function () { x0 = null; });
    el.addEventListener('click', function (e) { if (performance.now() - hit < 350) { e.stopPropagation(); e.preventDefault(); } }, true);   // the tap that ends a swipe is not a tap
  }

  P.init = function (hooks) {
    P.hooks = hooks || {};
    swipe($('homebar'), P.goHome, P.goHome);
    $('homebar').addEventListener('keydown', function (e) { if (e.key === 'Enter') P.goHome(); }); $('homebar').setAttribute('tabindex', '0');
    swipe($('lock'), P.unlock, null);
    hswipe($('home'), function () { if (P.screen === 'home') P.show('home2'); }, function () {});
    hswipe($('home2'), function () {}, function () { if (P.screen === 'home2') P.show('home'); });
    $('h2Gal').addEventListener('click', function () { P.show('gallery'); });
    $('unlock').addEventListener('click', P.unlock);
    document.querySelectorAll('[data-home]').forEach(function (b) { b.addEventListener('click', function () { if (ABY.Audio) ABY.Audio.sfx('ui'); P.goHome(); }); });
    document.querySelectorAll('.appi[data-app]').forEach(function (b) { b.addEventListener('click', function () { if (ABY.Audio) { ABY.Audio.init(); ABY.Audio.sfx('ui'); } P.show(b.getAttribute('data-app')); }); });
    $('wPulse').addEventListener('click', function () { if (ABY.Audio) ABY.Audio.sfx('ui'); P.show('pulse'); });
    var d = new Date(); P.setDate(DAY[d.getDay()] + ' · Echo hour');
    window.addEventListener('keydown', function (e) { if (!P.locked && (P.screen === 'home' || P.screen === 'home2') && $('guide').hidden) { if (e.key === 'ArrowLeft' && P.screen === 'home2') P.show('home'); else if (e.key === 'ArrowRight' && P.screen === 'home') P.show('home2'); } });
    window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !P.locked && P.screen !== 'lock' && P.screen !== 'home') P.goHome(); });
  };
  return P;
})();
