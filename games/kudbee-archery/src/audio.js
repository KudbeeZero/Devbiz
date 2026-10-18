/* =====================================================================
 * Kudbee Archery — audio.js
 * Fully synthesized, no files: a bow creak that tightens as you draw, the clicker,
 * the string's twang and slap, the arrow's whoosh, the straw thud and the shaft
 * quivering, crowd, UI ticks, an outdoor bed (wind that follows the gauge, birds)
 * and a calm loop. A compressor on the master keeps it loud enough for a phone
 * speaker. The AudioContext is created on the first gesture and unlocked the way
 * iOS needs (a silent buffer inside the gesture; playback session so the ringer
 * switch doesn't mute it). SFX are rate-limited; mute is persisted.
 * ===================================================================== */

KAR.Audio = class {
  constructor() {
    this.actx = null; this.master = null; this.noiseBuf = null;
    this.muted = !!KAR.Store.data.muted;
    this.last = {};
    this.musicOn = false; this.musicTimer = 0; this.step = 0; this.nextT = 0;
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
    this.noise(0.05, 0.9, 2200, 'highpass');
    this.noise(0.09, 0.5, 900, 'bandpass', 0.008, 1.5);
    this.tone(104, 0.55, 'triangle', 0.55, 96); this.tone(208, 0.32, 'sawtooth', 0.12, 198); this.tone(312, 0.22, 'sine', 0.1, 300);
    this.tone(62, 0.22, 'sine', 0.6, 42);
  }
  // the arrow leaving: a whoosh that falls in pitch as it goes away (doppler), long in slow-motion
  fly(t) {
    if (!this.actx) return;
    const a = this.actx, d = Math.max(0.25, t), t0 = a.currentTime + 0.02;
    const s = a.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = a.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2.2; f.frequency.setValueAtTime(2400, t0); f.frequency.exponentialRampToValueAtTime(420, t0 + d);
    const g = a.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.45, t0 + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t0); s.stop(t0 + d + 0.05);
  }
  // into the straw: a dull thud, the boss's body, then the shaft quivering (a buzzing tone that dies away)
  thud(ring) {
    this.noise(0.14, 0.9, 520, 'lowpass'); this.tone(118, 0.16, 'sine', 0.7, 52); this.noise(0.06, 0.4, 2400, 'bandpass', 0, 2);
    this.quiver();
    if (ring >= 9) this.tone(880, 0.14, 'triangle', 0.12, null, 0.06);
  }
  quiver() {
    if (!this.actx) return;
    const a = this.actx, t0 = a.currentTime + 0.02, o = a.createOscillator(), am = a.createOscillator(), amg = a.createGain(), g = a.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(230, t0); o.frequency.exponentialRampToValueAtTime(190, t0 + 0.6);
    am.frequency.value = 38; amg.gain.value = 0.5; am.connect(amg); amg.connect(g.gain);
    g.gain.setValueAtTime(0.18, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
    o.connect(g); g.connect(this.master); o.start(t0); am.start(t0); o.stop(t0 + 0.65); am.stop(t0 + 0.65);
  }
  miss() { this.noise(0.22, 0.4, 500, 'lowpass'); this.tone(200, 0.24, 'sawtooth', 0.08, 110); }
  // streak: each extra gold in a row lifts the chime a whole tone
  gold(streak) { const k = Math.pow(2, Math.min(6, Math.max(0, (streak || 1) - 1)) * 2 / 12); [784, 988, 1175].forEach((f, i) => this.tone(f * k, 0.2, 'triangle', 0.16, null, i * 0.07)); if (streak >= 3) this.tone(1568 * k, 0.3, 'sine', 0.1, null, 0.22); }
  heroIn() { this.tone(70, 0.9, 'sine', 0.35, 45); this.noise(0.9, 0.12, 900, 'bandpass', 0, 2); }
  pop(n, mult) { for (let i = 0; i < (n || 1); i++) { this.noise(0.09, 0.7, 3800, 'highpass', i * 0.07); this.tone(900 + (mult || 1) * 120, 0.08, 'square', 0.08, 300, i * 0.07); } if (mult > 1) [659, 784, 988].slice(0, Math.min(3, mult - 1)).forEach((f, i) => this.tone(f * (1 + mult * 0.06), 0.14, 'triangle', 0.12, null, 0.1 + i * 0.06)); }
  // ROBIN the agent pipes up: two quick bird chirps
  chirp() { this.tone(2400, 0.07, 'sine', 0.05, 3400, 0); this.tone(2600, 0.09, 'sine', 0.05, 3800, 0.1); }
  robin() { this.noise(0.08, 0.5, 3200, 'highpass'); [523.25, 783.99, 1046.5, 1567.98].forEach((f, i) => this.tone(f, 0.22, 'square', 0.07, null, 0.06 + i * 0.08)); this.cheer(true); }
  cheer(big) { this.noise(big ? 1.4 : 0.8, big ? 0.3 : 0.18, 2200, 'bandpass', 0, 0.5); this.noise(big ? 1.1 : 0.6, 0.18, 1200, 'bandpass', 0.1, 0.6); }
  groan() { this.noise(0.7, 0.12, 500, 'bandpass', 0, 0.7); this.tone(150, 0.6, 'sawtooth', 0.05, 95); }
  win() { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => { this.tone(f, 0.3, 'triangle', 0.15, null, i * 0.11); this.tone(f / 2, 0.3, 'sine', 0.08, null, i * 0.11); }); this.cheer(true); }
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
    const spb = 60 / 104 / 2;                         // eighth notes at 104 bpm: a loose backyard strum
    const chords = [[261.6, 329.6, 392], [220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7]];
    while (this.nextT < this.actx.currentTime + 0.25) {
      const t = this.nextT - this.actx.currentTime;
      const bar = Math.floor(this.step / 8) % 4, e = this.step % 8, ch = chords[bar];
      if (e === 0) this.tone(ch[0] / 2, spb * 3.6, 'triangle', 0.045, null, t);
      if (e === 4) this.tone(ch[2] / 2, spb * 3.2, 'triangle', 0.035, null, t);
      if (e % 2 === 1) this.tone(ch[(e >> 1) % 3] * 2, spb * 1.3, 'sine', 0.018, null, t);
      if (e === 3 && Math.random() < 0.3) this.bird(t);
      this.nextT += spb; this.step++;
    }
  }
};
