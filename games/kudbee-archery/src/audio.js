/* =====================================================================
 * Kudbee Archery — audio.js
 * Fully synthesized: bow draw creak, string twang, arrow whoosh, target thud, crowd
 * cheer, UI ticks and a calm outdoor loop. The AudioContext is
 * created lazily on the first user gesture; SFX are rate-limited; mute is
 * persisted.
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
        this.actx = new AC();
        this.master = this.actx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.9;
        this.master.connect(this.actx.destination);
        const len = this.actx.sampleRate * 0.8;
        this.noiseBuf = this.actx.createBuffer(1, len, this.actx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { this.actx = null; return false; }
    }
    if (this.actx.state === 'suspended') this.actx.resume().catch(() => {});
    return true;
  }

  setMuted(m) {
    this.muted = m; KAR.Store.data.muted = m; KAR.Store.save();
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.actx.currentTime, 0.02);
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

  click() { if (this._ok('click', 40)) { this.tone(660, 0.06, 'square', 0.05); this.tone(990, 0.05, 'square', 0.035, null, 0.03); } }
  draw(p) { if (this._ok('draw', 70)) this.tone(120 + p * 220, 0.08, 'sawtooth', 0.03, 140 + p * 240); }
  full() { this.tone(520, 0.08, 'triangle', 0.06); }
  loose() { this.noise(0.12, 0.2, 2600, 'highpass'); this.tone(190, 0.22, 'triangle', 0.22, 70); this.tone(95, 0.3, 'sine', 0.12, 60, 0.02); }
  fly(t) { this.noise(Math.max(0.2, t), 0.05, 1800, 'bandpass', 0.05, 1.2); }
  thud(ring) { this.noise(0.1, 0.22, 600, 'lowpass'); this.tone(150, 0.12, 'triangle', 0.22, 70); if (ring >= 9) this.tone(880, 0.12, 'triangle', 0.08, null, 0.05); }
  miss() { this.noise(0.18, 0.1, 500, 'lowpass'); this.tone(200, 0.2, 'sawtooth', 0.05, 110); }
  gold() { [784, 988, 1175].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.1, null, i * 0.07)); }
  cheer(big) { this.noise(big ? 1.4 : 0.8, big ? 0.15 : 0.09, 2200, 'bandpass', 0, 0.5); this.noise(big ? 1.1 : 0.6, 0.09, 1200, 'bandpass', 0.1, 0.6); }
  groan() { this.noise(0.7, 0.07, 500, 'bandpass', 0, 0.7); this.tone(150, 0.6, 'sawtooth', 0.03, 95); }
  win() { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => { this.tone(f, 0.3, 'triangle', 0.1, null, i * 0.11); this.tone(f / 2, 0.3, 'sine', 0.05, null, i * 0.11); }); this.cheer(true); }
  lose() { [330, 262, 196].forEach((f, i) => this.tone(f, 0.34, 'triangle', 0.09, f * 0.9, i * 0.17)); }

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
      this.nextT += spb; this.step++;
    }
  }
};
