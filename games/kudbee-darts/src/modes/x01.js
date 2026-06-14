/* =====================================================================
 * Kudbee Darts — modes/x01.js  (501)
 * Race from 501 to exactly zero. Every dart subtracts its score. You MUST
 * finish on a double (or the bull, which counts as D25). Going below zero,
 * landing on 1, or hitting zero without a double = BUST: the whole turn is
 * reverted. Includes a checkout solver used by both the AI and the human
 * checkout hint.
 *
 * Uniform mode interface (shared with cricket.js):
 *   id, label, dartsPerTurn
 *   initPlayer(player), beginTurn(player)
 *   applyDart(player, hit, opponent) -> { bust, win, scored, text }
 *   summary(player), checkoutHint(player)
 * ===================================================================== */
(function (KD) {
  'use strict';

  function isDoubleHit(hit) {
    return hit.ring === 'double' || hit.ring === 'inbull';
  }

  // ---- Checkout solver ---------------------------------------------------
  // Scorer darts, ordered by how a real player would prefer them.
  const SCORERS = (function () {
    const list = [];
    [20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1].forEach(function (n) {
      list.push({ label: 'T' + n, value: n * 3 });
    });
    list.push({ label: 'BULL', value: 50 });
    [20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1].forEach(function (n) {
      list.push({ label: '' + n, value: n });
    });
    list.push({ label: '25', value: 25 });
    return list;
  })();

  // Finishing doubles, preferred order (D20/D16 are the classic "easy" lines).
  const FINISHERS = (function () {
    const order = [20, 16, 18, 12, 10, 8, 14, 6, 4, 2, 19, 17, 15, 13, 11, 9, 7, 5, 3, 1];
    const list = order.map(function (n) { return { label: 'D' + n, value: n * 2 }; });
    list.unshift({ label: 'BULL', value: 50 }); // bull = D25 finish
    return list;
  })();

  function finisherFor(value) {
    for (let i = 0; i < FINISHERS.length; i++) if (FINISHERS[i].value === value) return FINISHERS[i];
    return null;
  }

  // Return a checkout route (array of labels) for `remaining` within `darts`
  // darts, or null if not directly checkoutable.
  function checkoutRoute(remaining, darts) {
    if (remaining < 2 || remaining > 170) return null;
    // 1 dart
    const f1 = finisherFor(remaining);
    if (f1) return [f1.label];
    if (darts < 2) return null;
    // 2 darts
    for (let i = 0; i < SCORERS.length; i++) {
      const s = SCORERS[i];
      const fin = finisherFor(remaining - s.value);
      if (fin && remaining - s.value >= 2) return [s.label, fin.label];
    }
    if (darts < 3) return null;
    // 3 darts
    for (let i = 0; i < SCORERS.length; i++) {
      const s1 = SCORERS[i];
      const rest = remaining - s1.value;
      if (rest < 2) continue;
      for (let j = 0; j < SCORERS.length; j++) {
        const s2 = SCORERS[j];
        const fin = finisherFor(rest - s2.value);
        if (fin && rest - s2.value >= 2) return [s1.label, s2.label, fin.label];
      }
    }
    return null;
  }

  function Mode_X01(start) {
    this.id = 'x01';
    this.label = (start || 501) + '';
    this.start = start || 501;
    this.dartsPerTurn = 3;
  }

  Mode_X01.prototype.initPlayer = function (player) {
    player.scoreState = { remaining: this.start, turnStart: this.start, turnScore: 0 };
  };

  Mode_X01.prototype.beginTurn = function (player) {
    const s = player.scoreState;
    s.turnStart = s.remaining;
    s.turnScore = 0;
  };

  Mode_X01.prototype.applyDart = function (player, hit, opponent) {
    const s = player.scoreState;
    const next = s.remaining - hit.score;
    // Bust conditions.
    if (next < 0 || next === 1 || (next === 0 && !isDoubleHit(hit))) {
      s.remaining = s.turnStart;     // revert the whole turn
      s.turnScore = 0;
      return { bust: true, endTurn: true, scored: 0, text: 'BUST' };
    }
    if (next === 0) {                 // valid double finish
      s.remaining = 0;
      s.turnScore += hit.score;
      return { win: true, scored: hit.score, text: 'CHECKOUT!' };
    }
    s.remaining = next;
    s.turnScore += hit.score;
    return { scored: hit.score, text: hit.score ? '+' + hit.score : 'MISS' };
  };

  Mode_X01.prototype.summary = function (player) {
    return player.scoreState.remaining + '';
  };

  // Human-facing checkout suggestion (3 darts available at turn start).
  Mode_X01.prototype.checkoutHint = function (player, dartsLeft) {
    const r = player.scoreState.remaining;
    const route = checkoutRoute(r, dartsLeft || 3);
    return route ? route.join(' ') : null;
  };

  Mode_X01.checkoutRoute = checkoutRoute;
  KD.Mode_X01 = Mode_X01;
})(window.KD = window.KD || {});
