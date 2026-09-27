KAB.Audio = class {
  constructor() {
    this.actx = new (window.AudioContext || window.webkitAudioContext)();
  }

  synth(freq, duration, type = 'sine', volume = 0.1) {
    const now = this.actx.currentTime;
    const osc = this.actx.createOscillator();
    const gain = this.actx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(this.actx.destination);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + duration);
    osc.start(now);
    osc.stop(now + duration);
  }

  launch() {
    this.synth(280, 0.15, 'sine', 0.15);
    this.synth(420, 0.1, 'sine', 0.1);
  }

  hit() {
    this.synth(200, 0.12, 'square', 0.12);
    this.synth(100, 0.08, 'sine', 0.1);
  }

  destroy() {
    const now = this.actx.currentTime;
    this.synth(150, 0.2, 'square', 0.15);
    this.synth(80, 0.15, 'sine', 0.1);
  }

  levelComplete() {
    const notes = [261.63, 329.63, 392.00, 523.25];
    notes.forEach((f, i) => {
      setTimeout(() => this.synth(f, 0.3, 'sine', 0.12), i * 100);
    });
  }

  gameOver() {
    this.synth(200, 0.3, 'sine', 0.2);
    this.synth(150, 0.4, 'sine', 0.15);
  }
};
