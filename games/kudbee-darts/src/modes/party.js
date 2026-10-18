/* =====================================================================
 * Kudbee Darts — modes/party.js
 * Two quick modes that share the uniform mode interface (see x01.js):
 *
 *   AROUND THE CLOCK  Race through 1 → 20, then the bull. Any dart on your
 *                     number advances you: single +1, double +2, treble +3,
 *                     so the rings matter. First to hit the bull wins.
 *   COUNT-UP          Eight rounds of three darts; every dart adds its score.
 *                     Highest total wins. A tie goes to the better single
 *                     round, then to whoever threw last.
 * ===================================================================== */
(function (KD) {
  'use strict';

  const BULL = 21;                    // the clock's last target
  const ROUNDS = 8;

  // ---- Around the Clock ------------------------------------------------------
  function Mode_Clock() {
    this.id = 'clock';
    this.label = 'Clock';
    this.dartsPerTurn = 3;
  }
  Mode_Clock.prototype.initPlayer = function (player) { player.scoreState = { target: 1, turnScore: 0 }; };
  Mode_Clock.prototype.beginTurn = function (player) { player.scoreState.turnScore = 0; };
  Mode_Clock.prototype.applyDart = function (player, hit) {
    const s = player.scoreState;
    if (s.target === BULL) {
      if (hit.ring === 'inbull' || hit.ring === 'outbull') { s.target = BULL + 1; return { win: true, scored: 0, text: 'GAME!' }; }
      return { scored: 0, text: 'MISS' };
    }
    if (hit.ring === 'miss' || hit.value !== s.target) return { scored: 0, text: 'MISS' };
    const adv = Math.max(1, hit.mult | 0);
    s.target = Math.min(BULL, s.target + adv);
    s.turnScore += adv;
    return { scored: adv, text: '+' + adv };
  };
  Mode_Clock.prototype.summary = function (player) { return Mode_Clock.targetLabel(player.scoreState.target); };
  Mode_Clock.prototype.checkoutHint = function () { return null; };
  Mode_Clock.targetLabel = function (t) { return t >= BULL ? 'BULL' : '' + t; };
  Mode_Clock.BULL = BULL;

  // ---- Count-Up ----------------------------------------------------------------
  function Mode_CountUp() {
    this.id = 'countup';
    this.label = 'Count-Up';
    this.dartsPerTurn = 3;
    this.rounds = ROUNDS;
  }
  Mode_CountUp.prototype.initPlayer = function (player) {
    player.scoreState = { total: 0, round: 0, inTurn: 0, best: 0, turnScore: 0 };
  };
  Mode_CountUp.prototype.beginTurn = function (player) {
    const s = player.scoreState;
    s.round++; s.inTurn = 0; s.turnScore = 0;
  };
  Mode_CountUp.prototype.applyDart = function (player, hit, opponent) {
    const s = player.scoreState, o = opponent.scoreState;
    s.total += hit.score; s.turnScore += hit.score; s.inTurn++;
    if (s.turnScore > s.best) s.best = s.turnScore;
    const out = { scored: hit.score, text: hit.score ? '+' + hit.score : 'MISS' };
    // The match ends when the second shooter finishes the last round.
    if (s.round >= ROUNDS && s.inTurn >= this.dartsPerTurn && o.round >= ROUNDS && o.inTurn >= this.dartsPerTurn) {
      out.win = true;
      out.winner = s.total > o.total ? player : s.total < o.total ? opponent : (s.best >= o.best ? player : opponent);
      out.text = 'FINAL!';
    }
    return out;
  };
  Mode_CountUp.prototype.summary = function (player) { return player.scoreState.total + ''; };
  Mode_CountUp.prototype.checkoutHint = function () { return null; };
  Mode_CountUp.ROUNDS = ROUNDS;

  KD.Mode_Clock = Mode_Clock;
  KD.Mode_CountUp = Mode_CountUp;
})(window.KD = window.KD || {});
