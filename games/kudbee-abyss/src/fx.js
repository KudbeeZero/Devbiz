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

  var last = {};
  A.sfx = function (name) {
    if (!A.ctx || A.muted) return; var now = performance.now(); if (now - (last[name] || 0) < 30) return; last[name] = now;
    switch (name) {
      case 'choice': A.tone(392, 0.35, 'sine', 0.09, 784); A.tone(587, 0.5, 'sine', 0.07, 1174, 0.06); A.flute(SCALE[5], 0.9, 0.08, 0.04); break;
      case 'tick': A.tone(1400 + Math.random() * 400, 0.025, 'sine', 0.012); break;
      case 'chapter': A.flute(SCALE[2], 1.6, 0.12); A.flute(SCALE[5], 1.8, 0.1, 0.25); A.flute(SCALE[8], 2.2, 0.08, 0.5); break;
      case 'miss': A.tone(150, 0.2, 'sawtooth', 0.05, 90); break;
      case 'ui': A.tone(660, 0.08, 'sine', 0.06, 880); break;
      case 'dawn': [0, 2, 4, 5, 7, 9].forEach(function (s, i) { A.flute(SCALE[s], 2.4, 0.13, i * 0.28, true); }); break;
      case 'song': [0, 2, 3, 5, 7, 9, 8, 9].forEach(function (s, i) { A.flute(SCALE[s], 2.6, 0.14, i * 0.22, true); }); A.tone(110, 3, 'sine', 0.1, 220); break;
      case 'echo': [9, 7, 5, 9, 8, 6].forEach(function (s, i) { A.flute(SCALE[s], 3, 0.1, i * 0.3, true); A.tone(SCALE[s] * 2, 2.5, 'sine', 0.04, null, i * 0.3); }); break;
      case 'silence': A.flute(SCALE[0], 4.5, 0.12); A.tone(55, 4, 'sine', 0.08, 40); break;
      case 'crown': A.tone(110, 3.2, 'sawtooth', 0.1, 55); A.tone(116, 3.2, 'sawtooth', 0.08, 58); A.tone(55, 3.5, 'sine', 0.14, 36); break;
    }
  };
  A.buzz = function (ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} };
  A.scale = SCALE;
  return A;
})();
