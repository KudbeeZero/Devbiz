/* =====================================================================
 * Kudbee Darts — modes/cricket.js
 * Standard Cricket. Numbers in play: 20,19,18,17,16,15 and the bull (25).
 * Three "marks" close a number (single=1, double=2, treble=3; bull single=1,
 * bull double=2). Once you've CLOSED a number, extra marks on it score that
 * number's points — but ONLY while your opponent hasn't closed it too.
 * Win: all your numbers closed AND your points >= opponent's points.
 *
 * Uniform mode interface (shared with x01.js).
 * ===================================================================== */
(function (KD) {
  'use strict';

  const NUMBERS = [20, 19, 18, 17, 16, 15, 25];

  // Map a board hit to a cricket {n, marks} or null if it doesn't count.
  function cricketHit(hit) {
    if (hit.ring === 'inbull') return { n: 25, marks: 2 };
    if (hit.ring === 'outbull') return { n: 25, marks: 1 };
    if (hit.value >= 15 && hit.value <= 20 && hit.ring !== 'miss') {
      return { n: hit.value, marks: hit.mult };
    }
    return null;
  }

  function Mode_Cricket() {
    this.id = 'cricket';
    this.label = 'Cricket';
    this.dartsPerTurn = 3;
    this.numbers = NUMBERS;
  }

  Mode_Cricket.prototype.initPlayer = function (player) {
    const marks = {};
    NUMBERS.forEach(function (n) { marks[n] = 0; });
    player.scoreState = { marks: marks, points: 0, turnScore: 0 };
  };

  Mode_Cricket.prototype.beginTurn = function (player) {
    player.scoreState.turnScore = 0;
  };

  Mode_Cricket.prototype.allClosed = function (player) {
    const m = player.scoreState.marks;
    for (let i = 0; i < NUMBERS.length; i++) if (m[NUMBERS[i]] < 3) return false;
    return true;
  };

  Mode_Cricket.prototype.applyDart = function (player, hit, opponent) {
    const ch = cricketHit(hit);
    if (!ch) return { scored: 0, text: 'MISS' };
    const s = player.scoreState;
    const cur = s.marks[ch.n];
    const toClose = Math.max(0, 3 - cur);
    const closing = Math.min(ch.marks, toClose);
    const overflow = ch.marks - closing;
    s.marks[ch.n] = cur + closing;

    let pts = 0;
    if (overflow > 0 && s.marks[ch.n] === 3 && opponent.scoreState.marks[ch.n] < 3) {
      pts = ch.n * overflow;       // 20..15, or 25 for the bull
      s.points += pts;
      s.turnScore += pts;
    }

    const win = this.allClosed(player) && s.points >= opponent.scoreState.points;
    let text = closing > 0 ? (closing === 1 ? 'MARK' : closing + ' MARKS') : '';
    if (pts > 0) text = '+' + pts;
    if (win) text = 'GAME!';
    return { win: win, scored: pts, marksGained: closing, text: text || 'MISS' };
  };

  Mode_Cricket.prototype.summary = function (player) {
    return player.scoreState.points + ' pts';
  };

  Mode_Cricket.prototype.checkoutHint = function () { return null; };

  Mode_Cricket.NUMBERS = NUMBERS;
  KD.Mode_Cricket = Mode_Cricket;
})(window.KD = window.KD || {});
