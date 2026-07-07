/* =====================================================================
 * Kudbee Contra — engine/audio.js
 * 100% original, code-synthesized sound via the Web Audio API — no audio
 * files, no licensing concerns. SFX are short oscillator/noise bursts;
 * music is a looping arpeggio bed. Real Suno/ElevenLabs/Stable-Audio
 * tracks can later be swapped in via assets/manifest.json (see docs).
 * ===================================================================== */
(function (KC) {
  'use strict';

  function Audio() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.enabled = true;
    this._musicTimer = null;
    this._step = 0;
  }

  // Browsers require audio to start from a user gesture; call on first input.
  Audio.prototype.unlock = function () {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.22;
    this.musicGain.connect(this.master);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.6;
    this.sfxGain.connect(this.master);
  };

  Audio.prototype.setEnabled = function (on) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.7 : 0;
  };

  // ---- Low-level helpers -------------------------------------------------
  Audio.prototype._tone = function (freq, dur, type, gain, slideTo) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain || 0.3, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  };

  Audio.prototype._noise = function (dur, gain, filterFreq) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = gain || 0.3;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = filterFreq || 1200;
    src.connect(filt);
    filt.connect(g);
    g.connect(this.sfxGain);
    src.start(t);
  };

  // ---- Named SFX ---------------------------------------------------------
  Audio.prototype.shoot = function () { this._tone(880, 0.09, 'square', 0.18, 320); };
  Audio.prototype.spread = function () { this._tone(660, 0.10, 'sawtooth', 0.16, 240); };
  Audio.prototype.enemyShoot = function () { this._tone(300, 0.12, 'sawtooth', 0.10, 140); };
  Audio.prototype.hit = function () { this._tone(180, 0.08, 'square', 0.16, 90); this._noise(0.06, 0.12); };
  Audio.prototype.explosion = function () { this._noise(0.45, 0.45, 800); this._tone(90, 0.4, 'triangle', 0.22, 40); };
  Audio.prototype.jump = function () { this._tone(420, 0.12, 'square', 0.14, 720); };
  Audio.prototype.land = function () { this._noise(0.08, 0.12, 500); };
  Audio.prototype.powerup = function () {
    this._tone(523, 0.09, 'square', 0.2);
    setTimeout(() => this._tone(659, 0.09, 'square', 0.2), 90);
    setTimeout(() => this._tone(784, 0.12, 'square', 0.2), 180);
  };
  Audio.prototype.playerHurt = function () { this._tone(220, 0.25, 'sawtooth', 0.3, 70); };
  Audio.prototype.grenade = function () { this._tone(140, 0.18, 'triangle', 0.14, 260); };
  // Short robotic short-circuit blip for a non-explosive kill (the drone) —
  // so not every enemy death booms identically.
  Audio.prototype.zap = function () {
    this._tone(1400, 0.05, 'square', 0.16, 220);
    this._tone(700, 0.08, 'sawtooth', 0.12, 90);
    this._noise(0.05, 0.08, 2200);
  };
  Audio.prototype.bossAlarm = function () {
    let n = 0;
    const beep = () => { if (n++ < 4) { this._tone(440, 0.18, 'sawtooth', 0.22); setTimeout(beep, 240); } };
    beep();
  };

  // ---- Procedural music bed ---------------------------------------------
  // A minor-key driving arpeggio that loops; intensity raises the tempo/notes.
  Audio.prototype.startMusic = function (intensity) {
    this.stopMusic();
    if (!this.ctx || !this.enabled) return;
    const base = [220, 261.63, 329.63, 392, 329.63, 261.63]; // A minor-ish
    const interval = intensity >= 2 ? 150 : 200;
    this._step = 0;
    this._musicTimer = setInterval(() => {
      if (!this.enabled) return;
      const f = base[this._step % base.length];
      this._musicNote(f, interval / 1000 * 0.9);
      if (this._step % 2 === 0) this._musicNote(f / 2, interval / 1000 * 1.8, 0.10); // bass
      this._step++;
    }, interval);
  };

  Audio.prototype._musicNote = function (freq, dur, gain) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain || 0.18, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.musicGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  };

  Audio.prototype.stopMusic = function () {
    if (this._musicTimer) { clearInterval(this._musicTimer); this._musicTimer = null; }
  };

  KC.Audio = Audio;
})(window.KC = window.KC || {});
