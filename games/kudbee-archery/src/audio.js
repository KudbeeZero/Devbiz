/* =====================================================================
 * Kudbee Archery — audio.js
 * The core loop is recorded (CC0, one small sprite: assets/sfx.mp3, mapped in src/sfx.js):
 * the bow's creak and release, the arrow's swish, the thwack into the straw, a crowd's
 * "ooh" and applause - each a few variants, played at a slightly random pitch so no
 * two shots sound the same. Layered on top, and standing in until the sprite has
 * loaded (or if it never does), the synthesized set: a creak that tightens as you draw,
 * the clicker, the string's twang, the whoosh, the thud and the shaft quivering.
 * The score is heard: each ring lands a little brighter than the one below, a 9 draws
 * an "ooh", a 10 rings a bell, an X has its own signature, and a gold streak climbs.
 * Plus UI ticks, an outdoor bed (wind that follows the gauge, birds) and a calm loop
 * with its own key, tempo and lead for each world. A compressor on the master keeps
 * it loud enough for a phone speaker. The AudioContext is created on the first gesture
 * and unlocked the way iOS needs (a silent buffer inside the gesture; playback session
 * so the ringer switch doesn't mute it). SFX are rate-limited; mute is persisted.
 * ===================================================================== */

KAR.Audio = class {
  constructor() {
    this.actx = null; this.master = null; this.noiseBuf = null;
    this.muted = !!KAR.Store.data.muted;
    this.last = {}; this.lastVar = {};
    this.sfx = null; this.sfxLoading = false; this.sfxFailed = false;
    this.musicOn = false; this.musicTimer = 0; this.step = 0; this.nextT = 0; this.theme = 0;
  }

  ensure() {
    if (!this.actx) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        // iOS: as "playback" the page is heard with the ringer switch on silent (Safari 16.4+)
        try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* older browsers */ }
        this.actx = new AC();
        this.comp = this.actx.createDynamicsCompressor();
        this.comp.threshold.value = -20; this.comp.knee.value = 14; this.comp.ratio.value = 4; this.comp.attack.value = 0.004; this.comp.release.value = 0.2;
        this.master = this.actx.createGain();
        this.master.gain.value = this.muted ? 0 : 1;
        this.master.connect(this.comp); this.comp.connect(this.actx.destination);
        const len = this.actx.sampleRate * 0.8;
        this.noiseBuf = this.actx.createBuffer(1, len, this.actx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { this.actx = null; return false; }
      this.load();
    }
    if (this.actx.state !== 'running') {
      this.actx.resume().catch(() => {});
      // iOS only unlocks output once something actually starts playing inside the gesture
      try { const b = this.actx.createBufferSource(); b.buffer = this.actx.createBuffer(1, 1, 22050); b.connect(this.actx.destination); b.start(0); } catch (e) { /* ignore */ }
    }
    return true;
  }

  setMuted(m) {
    this.muted = m; KAR.Store.data.muted = m; KAR.Store.save();
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 1, this.actx.currentTime, 0.02);
  }
  suspend() { if (this.actx && this.actx.state === 'running') this.actx.suspend().catch(() => {}); }
  resume() { if (this.actx && this.actx.state === 'suspended') this.actx.resume().catch(() => {}); }

  _ok(key, ms) {
    if (!this.actx || this.muted) return false;
    const now = performance.now();
    if (this.last[key] && now - this.last[key] < ms) return false;
    this.last[key] = now; return true;
  }

  tone(freq, dur, type, vol, slideTo, delay) {
    if (!this.actx) return;
    const t0 = this.actx.currentTime + (delay || 0);
    const o = this.actx.createOscillator(), g = this.actx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  noise(dur, vol, freq, type, delay, q) {
    if (!this.actx) return;
    const t0 = this.actx.currentTime + (delay || 0);
    const s = this.actx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = this.actx.createBiquadFilter(); f.type = type || 'lowpass';
    f.frequency.setValueAtTime(freq || 1200, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(60, (freq || 1200) * 0.3), t0 + dur);
    if (q) f.Q.value = q;
    const g = this.actx.createGain();
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t0); s.stop(t0 + dur + 0.02);
  }

  // ---- the recordings ----
  // One fetch + decode of the sprite; until it lands (or if it fails) every sound falls back to the synth.
  load() {
    if (this.sfx || this.sfxLoading || !KAR.SFX || typeof fetch !== 'function') return;
    this.sfxLoading = true;
    const a = this.actx, done = b => { this.sfx = b; this.sfxLoading = false; }, fail = () => { this.sfxLoading = false; this.sfxFailed = true; };
    fetch(KAR.SFX.url).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(buf => new Promise((ok, no) => { const p = a.decodeAudioData(buf, ok, no); if (p && p.then) p.then(ok, no); }))   // old Safari: callbacks only
      .then(done, fail);
  }
  has(name) { return !!(this.sfx && (KAR.SFX.clips[name + '1'] || KAR.SFX.clips[name])); }
  // play a clip: a random numbered variant (name1, name2, ...), or that one take by its full name, at a random
  // pitch around rate
  play(name, vol, rate, delay, jitter) {
    if (!this.has(name)) return null;
    const C = KAR.SFX.clips; let n = 0; while (C[name + (n + 1)]) n++;
    const k = C[name] ? name : name + (1 + Math.floor(Math.random() * n));
    if (n > 1 && k === this.lastVar[name]) return this.play(name, vol, rate, delay, jitter);      // never the same take twice running
    this.lastVar[name] = k;
    const [at, len] = C[k], a = this.actx, t0 = a.currentTime + (delay || 0);
    const s = a.createBufferSource(), g = a.createGain(); s.buffer = this.sfx;
    s.playbackRate.value = (rate || 1) * (1 + ((jitter === undefined ? 0.05 : jitter) * (Math.random() * 2 - 1)));
    g.gain.value = vol === undefined ? 1 : vol;
    s.connect(g); g.connect(this.master); s.start(t0, at, len);
    return { s, g };
  }

  click() { if (this._ok('click', 40)) { this.tone(660, 0.06, 'square', 0.08); this.tone(990, 0.05, 'square', 0.06, null, 0.03); } }

  // ---- the bow ----
  // The draw: a continuous creak - looped noise through a narrow band-pass, chopped into ratchet pulses by a
  // sawtooth, rising in pitch and pulse rate with the draw weight. drawSet() follows the draw every frame.
  drawStart() {
    if (!this.actx || this.muted || this.creak) return;
    const a = this.actx, t = a.currentTime;
    const s = a.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = a.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 7; f.frequency.value = 260;
    const chop = a.createGain(); chop.gain.value = 0.15;
    const lfo = a.createOscillator(); lfo.type = 'sawtooth'; lfo.frequency.value = 12;
    const depth = a.createGain(); depth.gain.value = 0.85; lfo.connect(depth); depth.connect(chop.gain);
    const g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1.1, t + 0.06);
    s.connect(f); f.connect(chop); chop.connect(g); g.connect(this.master); s.start(t); lfo.start(t);
    this.creak = { s, f, g, lfo };
    this.tone(140, 0.12, 'triangle', 0.12, 120);                  // the nock seating on the string
    this.play('creak', 0.32, 0.62, 0.04, 0.08);                    // the limbs taking the weight (a wood creak, pitched down)
  }
  drawSet(p) {
    const c = this.creak; if (!c) return;
    const t = this.actx.currentTime, full = p >= 1;
    c.f.frequency.setTargetAtTime(240 + p * 620, t, 0.04);
    c.lfo.frequency.setTargetAtTime(full ? 5 : 10 + p * 30, t, 0.05);
    c.g.gain.setTargetAtTime(full ? 0.4 : 1.1 + 1.5 * p, t, 0.05);   // held at anchor it settles to a faint strain
  }
  drawStop() {
    const c = this.creak; if (!c) return; this.creak = null;
    const t = this.actx.currentTime; c.g.gain.cancelScheduledValues(t); c.g.gain.setTargetAtTime(0.0001, t, 0.015);
    c.s.stop(t + 0.12); c.lfo.stop(t + 0.12);
  }
  draw(p) { this.drawSet(p); }                                    // (kept for callers of the old name)
  // the clicker snapping off the point at full draw
  full() { this.noise(0.02, 0.7, 6000, 'highpass'); this.tone(2600, 0.035, 'square', 0.12); this.tone(1300, 0.05, 'triangle', 0.1, null, 0.005); }
  // the release: string slap on the arm guard, the twang of the string settling, the limbs' thump
  loose() {
    this.drawStop();
    if (this.play('bow', 1.8, 1, 0, 0.06)) {                     // the recorded release, with the synth's limb thump under it
      this.tone(62, 0.22, 'sine', 0.45, 42); this.tone(104, 0.4, 'triangle', 0.22, 96);
      return;
    }
    this.noise(0.05, 0.9, 2200, 'highpass');
    this.noise(0.09, 0.5, 900, 'bandpass', 0.008, 1.5);
    this.tone(104, 0.55, 'triangle', 0.55, 96); this.tone(208, 0.32, 'sawtooth', 0.12, 198); this.tone(312, 0.22, 'sine', 0.1, 300);
    this.tone(62, 0.22, 'sine', 0.6, 42);
  }
  // the arrow leaving: a recorded swish off the string, then a whoosh that falls in pitch as it goes away
  // (doppler), long in slow-motion
  fly(t) {
    if (!this.actx) return;
    const rec = !!this.play('swish', 0.7, 1.12, 0.03, 0.08);
    const a = this.actx, d = Math.max(0.25, t), t0 = a.currentTime + 0.02;
    const s = a.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = a.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2.2; f.frequency.setValueAtTime(2400, t0); f.frequency.exponentialRampToValueAtTime(420, t0 + d);
    const g = a.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(rec ? 0.22 : 0.45, t0 + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t0); s.stop(t0 + d + 0.05);
  }
  // into the straw: the thwack, the boss's body, then the shaft quivering (a buzzing tone that dies away).
  // THE LADDER: the inner the ring, the tighter and brighter the hit and the higher the little woodblock
  // tick on top of it (rings 5-8 climb a pentatonic step each), so you hear the score before you read it.
  thud(ring) {
    const r = Math.max(1, Math.min(10, ring | 0)), up = (r - 1) / 9;
    if (this.play('hit', 0.9, 0.92 + up * 0.16)) this.play('body', 0.22 + up * 0.18, 0.95 + up * 0.15);       // (the body is mostly low boom: kept under the thwack so it doesn't pump the compressor)
    else { this.noise(0.14, 0.9, 520, 'lowpass'); this.tone(118, 0.16, 'sine', 0.7, 52); this.noise(0.06, 0.4, 2400, 'bandpass', 0, 2); }
    this.quiver();
    if (r >= 5 && r <= 8) { const f = [523.25, 587.33, 659.25, 783.99][r - 5]; this.tone(f, 0.09, 'triangle', 0.1 + (r - 5) * 0.03, null, 0.03); this.tone(f * 2, 0.06, 'sine', 0.04, null, 0.03); }
  }
  // a struck bell: a few inharmonic partials, the higher ones dying first
  bell(f, vol, delay, len) {
    const P = [[1, 1, 1], [2.0, 0.5, 0.7], [2.76, 0.35, 0.5], [5.4, 0.18, 0.3], [8.9, 0.08, 0.18]], d = len || 1.2;
    for (const [m, v, l] of P) this.tone(f * m, d * l, 'sine', vol * v, null, delay || 0);
  }
  // the streak lifts every gold a whole tone (capped an octave up)
  _lift(streak) { return Math.pow(2, Math.min(6, Math.max(0, (streak || 1) - 1)) * 2 / 12); }
  // a 9, just outside the 10: the crowd draws breath (kept under the 10's reward: a near miss, not a win) - "ooh" (layered from one voice), and a little applause
  ooh() {
    if (!this._ok('ooh', 600)) return;
    if (this.has('ooh')) {
      [[0.84, 0, 0.15], [0.93, 0.03, 0.14], [1.0, 0.05, 0.13], [1.1, 0.02, 0.1], [0.76, 0.07, 0.1]].forEach(([r, d, v]) => this.play('ooh', v, r, 0.12 + d, 0.03));
      this.play('clap2', 0.1, 1, 0.75, 0.05);
    } else { this.tone(392, 0.7, 'sawtooth', 0.04, 330, 0.12); this.tone(466, 0.7, 'sawtooth', 0.03, 392, 0.14); this.cheer(false); }
  }
  // a 10: a bright bell, a fifth above it, then the sparkle; climbs with the streak
  ten(streak) {
    const k = this._lift(streak);
    this.bell(1046.5 * k, 0.16, 0.03, 1.2); this.bell(1568 * k, 0.1, 0.11, 1.0);
    this.tone(2093 * k, 0.12, 'triangle', 0.06, null, 0.19);
    this.cheer(streak >= 2);
  }
  // the X: its own signature - a low boom, the two-note bell call (always the same shape, so you learn it), a
  // rising sparkle run, and the crowd going up
  xHit(streak) {
    const k = this._lift(streak);
    this.tone(55, 0.6, 'sine', 0.5, 38); this.noise(0.5, 0.18, 300, 'lowpass', 0.02);
    this.bell(784 * k, 0.14, 0.03, 1.4); this.bell(1568 * k, 0.13, 0.17, 1.6);
    [2093, 2637, 3136, 4186].forEach((f, i) => this.tone(f * k, 0.16, 'triangle', 0.05, null, 0.3 + i * 0.05));
    this.cheer(true);
  }
  quiver() {
    if (!this.actx) return;
    // the wobble rides its own stage (0..1) before the envelope: added straight onto the envelope's gain it would
    // outlast the fade and ring at full level for the whole note
    const a = this.actx, t0 = a.currentTime + 0.02, o = a.createOscillator(), am = a.createOscillator(), amg = a.createGain(), wob = a.createGain(), g = a.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(230, t0); o.frequency.exponentialRampToValueAtTime(190, t0 + 0.6);
    am.frequency.value = 38; wob.gain.value = 0.5; amg.gain.value = 0.5; am.connect(amg); amg.connect(wob.gain);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.2, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
    o.connect(wob); wob.connect(g); g.connect(this.master); o.start(t0); am.start(t0); o.stop(t0 + 0.65); am.stop(t0 + 0.65);
  }
  miss() { this.noise(0.22, 0.4, 500, 'lowpass'); this.tone(200, 0.24, 'sawtooth', 0.08, 110); }
  // streak: each extra gold in a row lifts the chime a whole tone
  gold(streak) { const k = Math.pow(2, Math.min(6, Math.max(0, (streak || 1) - 1)) * 2 / 12); [784, 988, 1175].forEach((f, i) => this.tone(f * k, 0.2, 'triangle', 0.16, null, i * 0.07)); if (streak >= 3) this.tone(1568 * k, 0.3, 'sine', 0.1, null, 0.22); }
  heroIn() { this.tone(70, 0.9, 'sine', 0.35, 45); this.noise(0.9, 0.12, 900, 'bandpass', 0, 2); }
  pop(n, mult) { for (let i = 0; i < (n || 1); i++) { this.noise(0.09, 0.7, 3800, 'highpass', i * 0.07); this.tone(900 + (mult || 1) * 120, 0.08, 'square', 0.08, 300, i * 0.07); } if (mult > 1) [659, 784, 988].slice(0, Math.min(3, mult - 1)).forEach((f, i) => this.tone(f * (1 + mult * 0.06), 0.14, 'triangle', 0.12, null, 0.1 + i * 0.06)); }
  // ROBIN the agent pipes up: two quick bird chirps
  chirp() { this.tone(2400, 0.07, 'sine', 0.05, 3400, 0); this.tone(2600, 0.09, 'sine', 0.05, 3800, 0.1); }
  robin() { this.noise(0.08, 0.5, 3200, 'highpass'); [523.25, 783.99, 1046.5, 1567.98].forEach((f, i) => this.tone(f, 0.22, 'square', 0.07, null, 0.06 + i * 0.08)); this.cheer(true); }
  cheer(big) {
    if (this.has('clap')) { if (big) { this.play('clap1', 0.5, 1, 0.08, 0.04); this.play('clap2', 0.3, 1.06, 0.2, 0.04); } else this.play('clap2', 0.3, 1, 0.1, 0.05); return; }
    this.noise(big ? 1.4 : 0.8, big ? 0.3 : 0.18, 2200, 'bandpass', 0, 0.5); this.noise(big ? 1.1 : 0.6, 0.18, 1200, 'bandpass', 0.1, 0.6); }
  groan() { this.noise(0.7, 0.12, 500, 'bandpass', 0, 0.7); this.tone(150, 0.6, 'sawtooth', 0.05, 95); }
  win() { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => { this.tone(f, 0.3, 'triangle', 0.15, null, i * 0.11); this.tone(f / 2, 0.3, 'sine', 0.08, null, i * 0.11); }); this.cheer(true); }
  // a results star landing: each one a step higher (1, 2, 3)
  star(n) { const k = Math.pow(2, ((n || 1) - 1) * 4 / 12); this.tone(1046.5 * k, 0.16, 'triangle', 0.14); this.tone(2093 * k, 0.12, 'sine', 0.06, null, 0.03); if (n >= 3) this.cheer(false); }
  lose() { [330, 262, 196].forEach((f, i) => this.tone(f, 0.34, 'triangle', 0.13, f * 0.9, i * 0.17)); }

  // ---- outdoors ----
  // A wind bed (looped noise, low-passed) whose level and brightness follow the wind gauge, plus a bird now and
  // then (scheduled from the music clock). setWind(0..1) is cheap to call every frame.
  setWind(a) {
    if (!this.actx) return;
    if (!this.windBed) {
      const c = this.actx, s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400; f.Q.value = 0.6;
      const g = c.createGain(); g.gain.value = 0.0001; s.connect(f); f.connect(g); g.connect(this.master); s.start();
      // gusts: a slow wobble on the level
      const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.17; lg.gain.value = 0.02; lfo.connect(lg); lg.connect(g.gain); lfo.start();
      this.windBed = { f, g, a: -1 };
    }
    const w = this.windBed; if (Math.abs(w.a - a) < 0.03) return; w.a = a;
    const t = this.actx.currentTime;
    w.g.gain.setTargetAtTime(0.03 + 0.11 * a, t, 0.6); w.f.frequency.setTargetAtTime(280 + 700 * a, t, 0.6);
  }
  bird(delay) {
    const base = 2600 + Math.random() * 1400, n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) this.tone(base * (1 + 0.08 * (i % 2)), 0.07, 'sine', 0.05, base * 1.35, delay + i * 0.11);
  }

  startMusic() {
    if (this.musicOn || !this.actx) return;
    this.musicOn = true; this.nextT = this.actx.currentTime + 0.1; this.step = 0;
    this.musicTimer = setInterval(() => this._musicTick(), 90);
  }
  stopMusic() { this.musicOn = false; clearInterval(this.musicTimer); }
  _musicTick() {
    if (!this.actx || this.actx.state !== 'running') { if (this.actx) this.nextT = this.actx.currentTime + 0.1; return; }
    const th = KAR.Audio.THEMES[this.theme] || KAR.Audio.THEMES[0], spb = 60 / th.bpm / 2;      // eighth notes
    const hz = n => 440 * Math.pow(2, (n - 69) / 12);
    while (this.nextT < this.actx.currentTime + 0.25) {
      const t = this.nextT - this.actx.currentTime;
      const bar = Math.floor(this.step / 8) % 4, e = this.step % 8, ch = th.chords[bar];
      if (e === 0) this.tone(hz(ch[0]) / 2, spb * 3.6, 'triangle', 0.045, null, t);
      if (e === 4) this.tone(hz(ch[2]) / 2, spb * 3.2, 'triangle', 0.035, null, t);
      if (e % 2 === 1) this.tone(hz(ch[(th.up ? 3 - (e >> 1) : e >> 1) % 3]) * 2, spb * 1.3, th.lead, th.lv, null, t);
      if (e === 3 && th.birds && Math.random() < 0.3) this.bird(t);
      this.nextT += spb; this.step++;
    }
  }
};

// The tune of each world (KAR.VENUES order): four chords as MIDI notes (root first), tempo, the lead's voice and
// level, the arpeggio's direction, and birds in the day worlds. The bass, the eighth-note feel and the mix are shared.
KAR.Audio.THEMES = [
  { bpm: 104, chords: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]], lead: 'sine', lv: 0.018, birds: true },              // VILLAGE GREEN: C Am F G, a backyard strum
  { bpm: 96, chords: [[62, 65, 69], [58, 62, 65], [60, 64, 67], [57, 60, 64]], lead: 'triangle', lv: 0.02, birds: true, up: true },   // FOREST GLADE: Dm Bb C Am, folk
  { bpm: 112, chords: [[55, 59, 62], [62, 66, 69], [64, 67, 71], [60, 64, 67]], lead: 'triangle', lv: 0.018 },                        // MOUNTAIN PASS: G D Em C, bright and high
  { bpm: 84, chords: [[57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62]], lead: 'sine', lv: 0.016, up: true },                    // LANTERN NIGHT: Am F C G, slow, no birds
  { bpm: 100, chords: [[64, 67, 71], [60, 64, 67], [55, 59, 62], [62, 66, 69]], lead: 'square', lv: 0.008 },                         // THINK BOX: Em C G D, a puzzle bleep
  { bpm: 118, chords: [[65, 68, 72], [61, 65, 68], [68, 72, 75], [63, 67, 70]], lead: 'square', lv: 0.01, up: true },                  // BITCOIN CITY: Fm Db Ab Eb, night synth
  { bpm: 108, chords: [[65, 69, 72], [62, 65, 69], [58, 62, 65], [60, 64, 67]], lead: 'sine', lv: 0.02, birds: true },                // SOLANA BEACH: F Dm Bb C, sunny
  { bpm: 96, chords: [[59, 62, 66], [55, 59, 62], [62, 66, 69], [57, 61, 64]], lead: 'triangle', lv: 0.017 },                         // ALGORAND PEAKS: Bm G D A, wide open
];
