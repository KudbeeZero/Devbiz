/* =====================================================================
 * Kudbee Darts — tutorial.js
 * A first-match coach: four short tips that advance as the player does
 * the thing (aim → throw → read the score → finish on a double), then a
 * small thank-you reward. Never blocks input. Players who already have
 * matches on record skip it; HOW TO PLAY on the menu replays it.
 * ===================================================================== */
(function (KD) {
  'use strict';

  const Game = KD.Game, Progression = KD.Progression;
  const C = { cyan: '#39e6ff', gold: '#ffd34d', green: '#7CFFb2', text: '#cfe9ff', violet: '#c46bff' };
  const FONT = '"Space Grotesk", sans-serif';
  const DONE = 4;
  const REWARD = { coins: 50, tokens: 2 };

  const STEPS = [
    { title: 'AIM',    text: 'Press and drag on the screen to aim. The dart follows your finger from a distance, so your thumb never covers the target.' },
    { title: 'THROW',  text: 'Now flick upward and release to throw. A quicker flick means more power; the power band tunes itself to your hand.' },
    { title: 'SCORE',  text: 'Outer ring = double (×2), inner ring = treble (×3), bullseye = 50. The big number on the board is the segment value.' },
    { title: 'FINISH', text: 'In 301 and 501 you must finish exactly on a double. The glowing checkout guide shows your route when you are close.' },
  ];
  Game.TUTORIAL_STEPS = STEPS;

  // ---- Progression: where the player is in the tutorial -----------------------
  // 0..3 = showing that step, 4 = done. A save with matches played starts done.
  Progression.prototype.tutStep = function () {
    let t = this.data.tut;
    if (!Number.isInteger(t) || t < 0 || t > DONE) {
      const s = this.data.stats || {};
      const played = ((s.x01 && s.x01.played) || 0) + ((s.cricket && s.cricket.played) || 0);
      t = this.data.tut = played > 0 ? DONE : 0;
    }
    return t;
  };
  Progression.prototype.tutSet = function (n) { this.data.tut = Math.max(0, Math.min(DONE, n | 0)); this.save(); };

  // ---- Game ------------------------------------------------------------------
  Game.prototype._tutorialOn = function () {
    return this.progression.tutStep() < DONE && (this.levelIdx != null || this.selOpp !== 'hotseat');
  };
  Game.prototype._tutAdvance = function (to) {
    const prog = this.progression;
    if (to <= prog.tutStep()) return;
    this._tutT = 0;
    if (to >= DONE) {
      prog.tutSet(DONE);
      prog.data.coins += REWARD.coins; prog.data.tokens += REWARD.tokens; prog.save();
      this.toasts.push({ text: 'TRAINING COMPLETE', sub: '+' + REWARD.coins + ' 🪙  +' + REWARD.tokens + ' 💎  ·  replay any time: HOW TO PLAY', life: 3.4 });
      this.audio.coins();
    } else { prog.tutSet(to); this.audio.tick(); }
  };
  // Called every frame while a match is on.
  Game.prototype._tutorialTick = function (dt) {
    if (!this._tutorialOn()) return;
    const prog = this.progression, step = prog.tutStep(), d = this.dart;
    this._tutT = (this._tutT || 0) + dt;
    if (this.players[this.current].isAI) return;
    if (step === 0 && d.state === 'aiming') this._tutAdvance(1);
    else if (step === 1 && d.state === 'flying') this._tutAdvance(2);
    else if (step === 2 && this._tutT > 3.5 && (d.state === 'aiming' || d.state === 'flying')) this._tutAdvance(3);
    else if (step === 3 && this._tutT > 7) this._tutAdvance(DONE);
  };
  // A human turn finished: whatever step they were on, move to the finishing tip.
  Game.prototype._tutorialTurnEnd = function () {
    if (this._tutorialOn() && this.progression.tutStep() < 3 && this.current === 0) this._tutAdvance(3);
  };

  Game.prototype._drawTutorial = function (ctx) {
    if (!this._tutorialOn()) return;
    if (this.state !== 'play' && this.state !== 'turnEnd') return;
    if (this.players[this.current].isAI && this.state === 'play') return;
    const step = this.progression.tutStep(), s = STEPS[step];
    if (!s) return;
    // Wide screens: a card in the empty space left of the board. Narrow: a banner on top.
    const side = this.viewW / 2 - 300 - 24;
    const onSide = side >= 240;
    const w = onSide ? Math.min(400, side) : Math.min(680, this.viewW - 40);
    const x = onSide ? 24 : this.viewW / 2 - w / 2, y = onSide ? 190 : 96;
    ctx.save();
    ctx.font = '14px ' + FONT;
    const lines = [], maxW = w - 32;
    let line = '';
    s.text.split(' ').forEach((wd) => {
      const t = line ? line + ' ' + wd : wd;
      if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = wd; } else line = t;
    });
    if (line) lines.push(line);
    const h = 40 + lines.length * 21;
    const pulse = this.reduceMotion ? 0 : 0.5 + 0.5 * Math.sin(this.time * 4);
    ctx.globalAlpha = Math.min(1, (this._tutT || 0) * 4 + 0.15);
    ctx.fillStyle = 'rgba(6,10,24,0.86)'; this._roundRect(ctx, x, y, w, h, 14); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = C.cyan; ctx.shadowColor = C.cyan; ctx.shadowBlur = 8 + 8 * pulse;
    this._roundRect(ctx, x, y, w, h, 14); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.textAlign = 'left';
    ctx.fillStyle = C.gold; ctx.font = 'bold 15px ' + FONT;
    ctx.fillText((step + 1) + '/4  ' + s.title, x + 16, y + 24);
    ctx.fillStyle = '#fff'; ctx.font = '14px ' + FONT;
    lines.forEach((l, i) => ctx.fillText(l, x + 16, y + 48 + i * 21));
    ctx.restore();
    ctx.textAlign = 'left';
  };
})(window.KD);
