/* =====================================================================
 * Kudbee Abyss - fx.js (SOUND)
 * Everything is made in the browser (no audio files): a reverb, a slow pad chord
 * that follows the mood of the scene, a breathy flute that wanders a pentatonic
 * scale on its own and plays the Song of Recall, and one closing sound per ending.
 * Nothing starts until a tap (browsers keep audio locked until then).
 * ===================================================================== */
var ABY = window.ABY = window.ABY || {};

ABY.Audio = (function () {
  var A = { ctx: null, muted: false, started: false };
  var master, dry, wet, padBus, padNow = null, lastPhrase = 0, duck = 1;
  var SCALE = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25, 783.99];       // A minor pentatonic
  var PADS = {                                                                                   // Hz of the chord under each mood
    void: [55, 82.4, 110, 130.8], spire: [73.4, 110, 146.8, 174.6], dusk: [87.3, 130.8, 174.6, 207.7],
    gate: [55, 82.4, 123.5, 164.8], dawn: [65.4, 98, 164.8, 261.6], dark: [58.3, 87.3, 92.5, 138.6],
  };

  function impulse(c, secs) {
    var n = Math.floor(c.sampleRate * secs), b = c.createBuffer(2, n, c.sampleRate);
    for (var ch = 0; ch < 2; ch++) { var d = b.getChannelData(ch); for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6); }
    return b;
  }

  A.init = function () {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    var C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    try { A.ctx = new C(); } catch (e) { return; }
    var c = A.ctx, comp = c.createDynamicsCompressor();
    master = c.createGain(); master.gain.value = A.muted ? 0 : 0.8; master.connect(comp); comp.connect(c.destination);
    dry = c.createGain(); dry.connect(master);
    var conv = c.createConvolver(); conv.buffer = impulse(c, 2.8); wet = c.createGain(); wet.gain.value = 0.55; wet.connect(conv); conv.connect(master);
    padBus = c.createGain(); padBus.gain.value = 0.5; padBus.connect(dry); padBus.connect(wet);
    A.started = true;
  };
  A.setMuted = function (m) { A.muted = !!m; if (master) master.gain.setTargetAtTime(A.muted ? 0 : 0.8, A.ctx.currentTime, 0.05); };
  A.duck = function (v) { duck = v; if (padBus) padBus.gain.setTargetAtTime(0.5 * v, A.ctx.currentTime, 0.4); };

  // one note of the flute: a soft sine with a little triangle, vibrato and a breath of noise
  A.flute = function (freq, dur, vol, at, bright) {
    if (!A.ctx || A.muted) return;
    var c = A.ctx, t = c.currentTime + (at || 0), o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
    o.type = 'sine'; o2.type = 'triangle'; o.frequency.value = freq; o2.frequency.value = freq * 2;
    lfo.frequency.value = 5 + Math.random(); lg.gain.value = freq * 0.006; lfo.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency);
    var g2 = c.createGain(); g2.gain.value = bright ? 0.22 : 0.1; o2.connect(g2); g2.connect(g); o.connect(g);
    var v = (vol || 0.2) * duck * 1;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.06); g.gain.setTargetAtTime(v * 0.7, t + 0.1, dur * 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(dry); g.connect(wet);
    var nb = c.createBuffer(1, c.sampleRate * 0.12, c.sampleRate), nd = nb.getChannelData(0); for (var i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * (1 - i / nd.length);
    var ns = c.createBufferSource(), bp = c.createBiquadFilter(), ng = c.createGain(); ns.buffer = nb; bp.type = 'bandpass'; bp.frequency.value = freq * 3; bp.Q.value = 2; ng.gain.value = v * 0.35;
    ns.connect(bp); bp.connect(ng); ng.connect(dry); ns.start(t);
    o.start(t); o2.start(t); lfo.start(t); var end = t + dur + 0.05; o.stop(end); o2.stop(end); lfo.stop(end);
  };

  A.tone = function (freq, dur, type, vol, slideTo, at) {
    if (!A.ctx || A.muted) return;
    var c = A.ctx, t = c.currentTime + (at || 0), o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t); if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.1, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dry); g.connect(wet); o.start(t); o.stop(t + dur + 0.03);
  };

  // a pad: four soft saws per note through a low-pass; the old chord fades out as the new one fades in
  A.pad = function (mood) {
    if (!A.ctx) return; var c = A.ctx, notes = PADS[mood] || PADS.void; if (padNow && padNow.mood === mood) return;
    if (padNow) { var old = padNow; old.g.gain.setTargetAtTime(0.0001, c.currentTime, 1.4); setTimeout(function () { old.o.forEach(function (o) { try { o.stop(); } catch (e) {} }); }, 6500); }
    var g = c.createGain(), lp = c.createBiquadFilter(), os = []; lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 0.6;
    g.gain.value = 0.0001; g.gain.setTargetAtTime(0.16, c.currentTime, 1.8); lp.connect(g); g.connect(padBus);
    var lf = c.createOscillator(), lg = c.createGain(); lf.frequency.value = 0.07; lg.gain.value = 180; lf.connect(lg); lg.connect(lp.frequency); lf.start(); os.push(lf);
    notes.forEach(function (f, i) { [-6, 5].forEach(function (d) { var o = c.createOscillator(), og = c.createGain(); o.type = i < 2 ? 'sawtooth' : 'triangle'; o.frequency.value = f; o.detune.value = d; og.gain.value = i < 2 ? 0.18 : 0.12; o.connect(og); og.connect(lp); o.start(); os.push(o); }); });
    padNow = { mood: mood, g: g, o: os };
  };

  // while the story is quiet, the flute wanders: three or four soft notes now and then
  A.wander = function (nowMs, mood) {
    if (!A.ctx || A.muted || nowMs - lastPhrase < 7000 + Math.random() * 5000) return; lastPhrase = nowMs;
    var base = mood === 'dark' ? 0 : mood === 'dawn' ? 4 : 2, n = 3 + (Math.random() * 2 | 0), i = base + (Math.random() * 3 | 0);
    for (var k = 0; k < n; k++) { i = Math.max(0, Math.min(SCALE.length - 1, i + (Math.random() < 0.5 ? -1 : 1) * (1 + (Math.random() * 2 | 0)))); A.flute(SCALE[i] * (mood === 'dark' ? 0.5 : 1), 1.4 + Math.random(), 0.07, k * 0.7); }
  };

  // filtered noise: breath, static, a gust, a scream (f0 -> f1 is the filter sweep)
  A.noise = function (dur, vol, f0, f1, q, at, type) {
    if (!A.ctx || A.muted) return; var c = A.ctx, t = c.currentTime + (at || 0), n = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    var src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); src.buffer = b; f.type = type || 'bandpass'; f.frequency.setValueAtTime(f0, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur); f.Q.value = q || 1;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.06, dur / 3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); src.connect(f); f.connect(g); g.connect(dry); g.connect(wet); src.start(t);
  };
  var last = {};
  A.sfx = function (name) {
    if (!A.ctx || A.muted) return; var now = performance.now(); if (now - (last[name] || 0) < 30) return; last[name] = now;
    switch (name) {
      case 'choice': A.tone(392, 0.35, 'sine', 0.09, 784); A.tone(587, 0.5, 'sine', 0.07, 1174, 0.06); A.flute(SCALE[5], 0.9, 0.08, 0.04); break;
      case 'ding': A.tone(988, 0.16, 'sine', 0.08, 1318); A.tone(1318, 0.28, 'sine', 0.06, 1568, 0.09); break;
      case 'send': A.tone(520, 0.12, 'sine', 0.07, 880); break;
      case 'click': A.tone(2400, 0.02, 'square', 0.03); break;
      case 'ring': A.tone(1046, 0.14, 'square', 0.035); A.tone(784, 0.14, 'square', 0.035, null, 0.16); A.tone(1046, 0.14, 'square', 0.035, null, 0.5); A.tone(784, 0.14, 'square', 0.035, null, 0.66); break;
      case 'creep': A.tone(90, 1.4, 'sawtooth', 0.05, 58); A.noise(1.2, 0.05, 700, 260, 2); break;
      case 'whisper': A.noise(1.5, 0.09, 2600, 1700, 3.2); A.noise(1.1, 0.06, 3400, 2100, 4, 0.5); break;
      case 'glitch': A.noise(0.06, 0.16, 3000, 800, 1); A.noise(0.05, 0.14, 600, 4000, 1, 0.1); A.noise(0.08, 0.12, 2000, 300, 1, 0.22); A.tone(220, 0.1, 'square', 0.04, 90, 0.05); break;
      case 'jump': A.noise(0.5, 0.55, 5000, 260, 0.7); A.tone(70, 0.6, 'sawtooth', 0.22, 38); A.tone(1500, 0.2, 'square', 0.08, 300); break;
      case 'eyes': A.tone(41, 3.2, 'sine', 0.3, 27); A.tone(61, 3, 'sine', 0.12, 40, 0.2); A.noise(2.8, 0.18, 160, 90, 0.7); break;
      case 'blackfx': A.tone(120, 1.8, 'sine', 0.22, 30); A.noise(1.6, 0.1, 900, 80, 1); break;
      case 'hollow': A.tone(82, 3.4, 'sawtooth', 0.12, 41); A.noise(3, 0.07, 2200, 900, 3); break;
      case 'eye': A.tone(41, 3.6, 'sine', 0.3, 27); A.flute(SCALE[0], 4, 0.1, 0.4); A.noise(3, 0.14, 140, 70, 0.7); break;
      case 'mirror': [5, 3, 0].forEach(function (s, i) { A.flute(SCALE[s], 3, 0.1, i * 0.6, true); }); A.tone(55, 3.5, 'sine', 0.08); break;
      case 'betrayal': A.flute(SCALE[4], 2.5, 0.12); A.flute(SCALE[4] * 1.06, 2.5, 0.09, 0.5); A.tone(98, 3, 'sawtooth', 0.06, 70, 0.5); break;
      case 'tick': A.tone(1400 + Math.random() * 400, 0.025, 'sine', 0.012); break;
      case 'chapter': A.flute(SCALE[2], 1.6, 0.12); A.flute(SCALE[5], 1.8, 0.1, 0.25); A.flute(SCALE[8], 2.2, 0.08, 0.5); break;
      case 'miss': A.tone(150, 0.2, 'sawtooth', 0.05, 90); break;
      case 'ui': A.tone(660, 0.08, 'sine', 0.06, 880); break;
      case 'dawn': [0, 2, 4, 5, 7, 9].forEach(function (s, i) { A.flute(SCALE[s], 2.4, 0.13, i * 0.28, true); }); break;
      case 'song': [0, 2, 3, 5, 7, 9, 8, 9].forEach(function (s, i) { A.flute(SCALE[s], 2.6, 0.14, i * 0.22, true); }); A.tone(110, 3, 'sine', 0.1, 220); break;
      case 'echo': [9, 7, 5, 9, 8, 6].forEach(function (s, i) { A.flute(SCALE[s], 3, 0.1, i * 0.3, true); A.tone(SCALE[s] * 2, 2.5, 'sine', 0.04, null, i * 0.3); }); break;
      case 'silence': A.flute(SCALE[0], 4.5, 0.12); A.tone(55, 4, 'sine', 0.08, 40); break;
      case 'daybreak': [0, 2, 4, 5, 7, 9, 11].forEach(function (s, i) { A.flute(SCALE[s % SCALE.length], 3, 0.13, i * 0.3, true); }); A.tone(220, 3.5, 'sine', 0.08, 440); break;
      case 'keeper': A.tone(55, 4, 'sine', 0.2, 41); A.flute(SCALE[0], 4.5, 0.09, 0.4); A.noise(3, 0.05, 400, 120, 0.8); break;
      case 'loop': A.tone(1318, 0.12, 'square', 0.04); A.tone(1318, 0.12, 'square', 0.04, null, 0.9); A.noise(1.6, 0.08, 2400, 300, 1, 1.6); A.tone(74, 3, 'sawtooth', 0.1, 50, 1.6); break;
      case 'chorus': [0, 2, 3, 5, 7, 9, 10, 12].forEach(function (s, i) { A.flute(SCALE[s % SCALE.length], 3, 0.13, i * 0.25, true); }); A.tone(110, 4, 'sine', 0.12, 220); A.tone(165, 4, 'sine', 0.06, 330, 0.3); break;
      case 'watched': A.tone(48, 4, 'sine', 0.2, 30); A.noise(3, 0.07, 3000, 200, 2); A.tone(1760, 0.1, 'square', 0.03, null, 1.4); break;
      case 'names': [9, 7, 5, 3, 2, 0].forEach(function (s, i) { A.flute(SCALE[s], 3, 0.12, i * 0.4, true); }); A.tone(110, 4.5, 'sine', 0.08, 165, 1.6); break;
      case 'caller': A.tone(1318, 0.1, 'square', 0.04); A.tone(1568, 0.1, 'square', 0.04, null, 0.15); A.tone(62, 3.5, 'sine', 0.2, 40, 0.6); A.noise(2.4, 0.06, 2600, 300, 1, 0.8); break;
      case 'drowned': [0, 2, 3, 5, 3, 2, 0].forEach(function (s, i) { A.flute(SCALE[s] * 0.5, 3.4, 0.09, i * 0.55, true); }); A.noise(4, 0.1, 500, 120, 0.6); A.tone(41, 4, 'sine', 0.2, 30); break;
      case 'blackout': A.tone(60, 3.5, 'sine', 0.22, 24); A.noise(2.5, 0.12, 300, 60, 0.8); break;
      case 'door': A.tone(95, 1.3, 'sawtooth', 0.06, 210); A.tone(140, 1.1, 'sawtooth', 0.04, 330, 0.1); A.noise(1.3, 0.1, 500, 1800, 5); A.tone(48, 0.5, 'sine', 0.2, 30, 1.1); break;
      case 'crack': A.noise(0.09, 0.5, 6000, 900, 0.8); A.noise(0.05, 0.4, 3000, 400, 1, 0.06); A.tone(180, 0.18, 'square', 0.07, 40); break;
      case 'drip': A.tone(1800, 0.05, 'sine', 0.07, 700); A.noise(0.12, 0.05, 2400, 900, 2, 0.04); break;
      case 'knock': A.tone(70, 0.14, 'sine', 0.35, 45); A.tone(70, 0.14, 'sine', 0.3, 45, 0.28); A.tone(70, 0.16, 'sine', 0.38, 42, 0.52); A.noise(0.1, 0.12, 400, 150, 1.2); break;
      case 'scream': A.noise(0.9, 0.3, 1800, 5200, 2.5); A.tone(880, 0.8, 'sawtooth', 0.07, 1760); A.tone(1320, 0.7, 'square', 0.04, 600, 0.1); break;
      case 'thud': A.tone(55, 0.45, 'sine', 0.45, 28); A.noise(0.25, 0.25, 300, 80, 0.8); break;
      case 'crown': A.tone(110, 3.2, 'sawtooth', 0.1, 55); A.tone(116, 3.2, 'sawtooth', 0.08, 58); A.tone(55, 3.5, 'sine', 0.14, 36); break;
    }
  };
  A.buzz = function (ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} };
  A.scale = SCALE;
  return A;
})();
