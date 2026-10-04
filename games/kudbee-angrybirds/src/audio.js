/* =====================================================================
 * Kudbee Birds — audio.js
 * All sound is synthesized (no files). The AudioContext is created lazily on
 * the first user gesture (autoplay policy), SFX are rate-limited so a pile-up
 * can't machine-gun the speakers, and a quiet looping synth bed plays under
 * the game. Mute is persisted.
 * ===================================================================== */

KAB.Audio = class {
  constructor() {
    this.actx = null;
    this.master = null;
    this.noiseBuf = null;
    this.muted = !!KAB.Store.data.muted;
    this.last = {};
    this.musicOn = false;
    this.musicTimer = 0;
    this.step = 0;
    this.nextT = 0;
  }

  // Call from a user gesture. Safe to call repeatedly.
  ensure() {
    if (!this.actx) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        this.actx = new AC();
        this.master = this.actx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.9;
        this.master.connect(this.actx.destination);
        const len = this.actx.sampleRate * 0.6;
        this.noiseBuf = this.actx.createBuffer(1, len, this.actx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { this.actx = null; return false; }
    }
    if (this.actx.state === 'suspended') this.actx.resume().catch(() => {});
    return true;
  }

  setMuted(m) {
    this.muted = m;
    KAB.Store.data.muted = m;
    KAB.Store.save();
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.actx.currentTime, 0.02);
  }

  suspend() { if (this.actx && this.actx.state === 'running') this.actx.suspend().catch(() => {}); }
  resume() { if (this.actx && this.actx.state === 'suspended') this.actx.resume().catch(() => {}); }

  _ok(key, ms) {
    if (!this.actx || this.muted) return false;
    const now = performance.now();
    if (this.last[key] && now - this.last[key] < ms) return false;
    this.last[key] = now;
    return true;
  }

  tone(freq, dur, type, vol, slideTo, delay) {
    if (!this.actx) return;
    const t0 = this.actx.currentTime + (delay || 0);
    const o = this.actx.createOscillator(), g = this.actx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  noise(dur, vol, freq, type, delay, q) {
    if (!this.actx) return;
    const t0 = this.actx.currentTime + (delay || 0);
    const s = this.actx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = this.actx.createBiquadFilter();
    f.type = type || 'lowpass';
    f.frequency.setValueAtTime(freq || 1200, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(60, (freq || 1200) * 0.25), t0 + dur);
    if (q) f.Q.value = q;
    const g = this.actx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t0); s.stop(t0 + dur + 0.02);
  }

  click() { if (this._ok('click', 40)) { this.tone(660, 0.06, 'square', 0.05); this.tone(990, 0.05, 'square', 0.035, null, 0.03); } }
  stretch(t) { if (this._ok('stretch', 70)) this.tone(180 + t * 220, 0.07, 'triangle', 0.03); }
  launch(speed) {
    if (!this._ok('launch', 60)) return;
    this.noise(0.28, 0.16, 2600, 'bandpass', 0, 1.2);
    this.tone(220, 0.22, 'sawtooth', 0.07, 520);
    this.tone(120, 0.12, 'sine', 0.12, 60);
  }

  hit(mat, strength) {
    const s = Math.min(1, strength);
    if (!this._ok('hit' + mat, 55)) return;
    const v = 0.05 + s * 0.14;
    if (mat === 'glass') { this.tone(1900 + Math.random() * 500, 0.1, 'triangle', v * 0.7); this.tone(2700, 0.07, 'sine', v * 0.5, null, 0.01); }
    else if (mat === 'stone') { this.noise(0.1, v * 1.4, 900, 'lowpass'); this.tone(95, 0.12, 'sine', v * 1.2, 55); }
    else if (mat === 'tnt') { this.tone(140, 0.12, 'square', v * 0.6, 90); }
    else { this.noise(0.09, v * 1.3, 1500, 'lowpass'); this.tone(170, 0.1, 'triangle', v, 90); }
  }

  shatter(mat) {
    if (!this._ok('shatter', 45)) return;
    if (mat === 'glass') {
      this.noise(0.35, 0.16, 6000, 'highpass');
      for (let i = 0; i < 4; i++) this.tone(1500 + Math.random() * 2500, 0.12, 'triangle', 0.05, null, i * 0.025);
    } else if (mat === 'stone') {
      this.noise(0.4, 0.28, 700, 'lowpass');
      this.tone(80, 0.3, 'sine', 0.2, 40);
    } else {
      this.noise(0.3, 0.2, 1800, 'lowpass');
      this.tone(210, 0.18, 'square', 0.08, 70);
    }
  }

  kill() {
    if (!this._ok('kill', 80)) return;
    this.tone(420, 0.1, 'sine', 0.16, 840);
    this.tone(630, 0.16, 'sine', 0.13, 1260, 0.07);
    this.tone(210, 0.2, 'triangle', 0.1, 105, 0.03);
  }

  boom() {
    if (!this._ok('boom', 90)) return;
    this.noise(0.8, 0.5, 1400, 'lowpass');
    this.tone(110, 0.6, 'sine', 0.4, 28);
    this.tone(60, 0.5, 'sawtooth', 0.12, 30);
  }

  ability(kind) {
    if (!this._ok('ability', 60)) return;
    if (kind === 'dash') { this.noise(0.25, 0.14, 4200, 'bandpass', 0, 1.5); this.tone(300, 0.2, 'sawtooth', 0.09, 1200); }
    else if (kind === 'slam') { this.tone(700, 0.25, 'sawtooth', 0.1, 90); this.noise(0.18, 0.12, 1800, 'lowpass'); }
    else { [520, 660, 800].forEach((f, i) => this.tone(f, 0.12, 'square', 0.06, f * 1.5, i * 0.05)); }
  }

  win() { [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => { this.tone(f, 0.32, 'triangle', 0.1, null, i * 0.11); this.tone(f / 2, 0.32, 'sine', 0.05, null, i * 0.11); }); }
  star(i) { this.tone(660 + i * 220, 0.28, 'triangle', 0.12, 1320 + i * 220); this.tone(990 + i * 330, 0.2, 'sine', 0.06, null, 0.05); }
  lose() { [330, 262, 196, 147].forEach((f, i) => this.tone(f, 0.34, 'triangle', 0.1, f * 0.9, i * 0.16)); }

  // ---- music bed -------------------------------------------------------
  startMusic() {
    if (this.musicOn || !this.actx) return;
    this.musicOn = true;
    this.nextT = this.actx.currentTime + 0.1;
    this.step = 0;
    this.musicTimer = setInterval(() => this._musicTick(), 90);
  }

  stopMusic() { this.musicOn = false; clearInterval(this.musicTimer); }

  _musicTick() {
    if (!this.actx || this.actx.state !== 'running') { if (this.actx) this.nextT = this.actx.currentTime + 0.1; return; }
    const spb = 60 / 92 / 4;                       // 16th note at 92 bpm
    const bass = [55, 55, 43.65, 43.65, 65.41, 65.41, 49, 49];
    const arp = [0, 3, 7, 10, 7, 3, 12, 10];
    while (this.nextT < this.actx.currentTime + 0.25) {
      const t = this.nextT - this.actx.currentTime;
      const bar = Math.floor(this.step / 16) % 8;
      const s16 = this.step % 16;
      if (s16 % 4 === 0) this.tone(bass[bar], spb * 3.4, 'triangle', 0.045, null, t);
      if (s16 % 2 === 0 && !this.muted) {
        const root = bass[bar] * 4;
        this.tone(root * Math.pow(2, arp[(s16 / 2) % 8] / 12), spb * 1.6, 'sine', 0.02, null, t);
      }
      this.nextT += spb;
      this.step++;
    }
  }
};
