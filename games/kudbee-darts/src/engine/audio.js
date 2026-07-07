/* =====================================================================
 * Kudbee Darts — engine/audio.js
 * 100% original, code-synthesized sound via the Web Audio API — no audio
 * files, no licensing concerns. The synth core (tones, noise, envelopes,
 * music bed) is ported from Contra; the named SFX are darts-specific:
 * throw whoosh, board thud, scoring chimes, bust buzzer, crowd cheer.
 * ===================================================================== */
(function (KD) {
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
    this.musicGain.gain.value = 0.16;
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

  Audio.prototype._noise = function (dur, gain, filterFreq, sweepTo) {
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
    filt.frequency.setValueAtTime(filterFreq || 1200, t);
    if (sweepTo) filt.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(this.sfxGain);
    src.start(t);
  };

  // ---- Named SFX ---------------------------------------------------------
  // Throw release: a quick airy whoosh (filtered noise sweeping down).
  Audio.prototype.whoosh = function () { this._noise(0.18, 0.18, 2600, 500); };
  // Dart sticking into the board: a low thud + tick.
  Audio.prototype.thud = function () { this._tone(150, 0.07, 'sine', 0.22, 70); this._noise(0.05, 0.10, 900); };
  // A genuine miss: a duller, deflated clunk — no ring or bite, so it reads
  // as "that didn't stick" rather than a scoring thud.
  Audio.prototype.clunk = function () { this._tone(95, 0.10, 'sine', 0.14, 45); this._noise(0.09, 0.12, 420); };
  // UI tick / reticle blip.
  Audio.prototype.tick = function () { this._tone(660, 0.04, 'square', 0.08); };
  // Good score chime. tier 0 = single, 1 = treble/20s, 2 = bull/checkout.
  Audio.prototype.chime = function (tier) {
    const sets = [[523, 659], [523, 659, 784], [659, 784, 988, 1175]];
    const notes = sets[Math.min(tier || 0, 2)];
    notes.forEach((f, i) => setTimeout(() => this._tone(f, 0.12, 'triangle', 0.2), i * 70));
  };
  // 501 bust: a sour descending buzzer.
  Audio.prototype.bust = function () { this._tone(220, 0.4, 'sawtooth', 0.22, 80); this._noise(0.2, 0.1, 500); };
  // Leg/match win: a rising fanfare + a swelling crowd cheer.
  Audio.prototype.cheer = function () {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this._tone(f, 0.16, 'square', 0.2), i * 90));
    this._noise(0.9, 0.18, 1400, 2600);
    setTimeout(() => this._noise(0.7, 0.14, 1200, 2200), 220);
  };

  // ---- Procedural ambient music bed -------------------------------------
  // A slow, mellow minor pad loop — lounge atmosphere, not action.
  Audio.prototype.startMusic = function () {
    this.stopMusic();
    if (!this.ctx || !this.enabled) return;
    const base = [196, 233.08, 293.66, 349.23, 293.66, 233.08]; // G minor-ish
    const interval = 460;
    this._step = 0;
    this._musicTimer = setInterval(() => {
      if (!this.enabled) return;
      const f = base[this._step % base.length];
      this._musicNote(f, interval / 1000 * 1.6);
      if (this._step % 3 === 0) this._musicNote(f / 2, interval / 1000 * 2.4, 0.08);
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
    g.gain.exponentialRampToValueAtTime(gain || 0.14, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.musicGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  };

  Audio.prototype.stopMusic = function () {
    if (this._musicTimer) { clearInterval(this._musicTimer); this._musicTimer = null; }
  };

  KD.Audio = Audio;
})(window.KD = window.KD || {});
