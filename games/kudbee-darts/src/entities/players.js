/* =====================================================================
 * Kudbee Darts — entities/players.js
 * Player models. Humans aim with the pointer; AIs pick a strategic target
 * and throw through the SAME Dart -> Board.hitTest pipeline. The only thing
 * that makes an AI weak or strong is its Gaussian scatter sigma and how
 * ambitious its target choice is — difficulty is honest and tunable from
 * two numbers per tier.
 * ===================================================================== */
(function (KD) {
  'use strict';

  // Difficulty tiers: sigma is in board-radius units (smaller = tighter).
  const TIERS = {
    Rookie: { sigma: 0.130, thinkTime: 0.9, ambition: 0 },
    Pro:    { sigma: 0.070, thinkTime: 0.6, ambition: 1 },
    Legend: { sigma: 0.030, thinkTime: 0.45, ambition: 2 },
  };

  function Player(name, skinId) {
    this.name = name || 'Player';
    this.isAI = false;
    this.skinId = skinId || 'cyan';
    this.scoreState = null;     // owned by the active mode
    this.legs = 0;
    // per-match stats
    this.dartsThrown = 0;
    this.totalScored = 0;
    this.t180 = 0;
    this.bestCheckout = 0;
  }

  Player.prototype.skin = function () {
    return KD.Sprites.SKINS[this.skinId] || KD.Sprites.SKINS.cyan;
  };

  // ---- AI ---------------------------------------------------------------
  function AIPlayer(name, tierName, skinId) {
    Player.call(this, name, skinId || 'violet');
    this.isAI = true;
    this.tierName = tierName || 'Pro';
    const t = TIERS[this.tierName] || TIERS.Pro;
    this.sigma = t.sigma;
    this.thinkTime = t.thinkTime;
    this.ambition = t.ambition;
  }
  AIPlayer.prototype = Object.create(Player.prototype);
  AIPlayer.prototype.constructor = AIPlayer;

  // Choose an aim label given the mode, this AI's state, the opponent, and
  // how many darts remain this turn.
  AIPlayer.prototype.chooseTarget = function (mode, opponent, dartsLeft) {
    if (mode.id === 'x01') return this._chooseX01(mode, dartsLeft);
    if (mode.id === 'cricket') return this._chooseCricket(mode, opponent);
    return 'T20';
  };

  AIPlayer.prototype._chooseX01 = function (mode, dartsLeft) {
    const r = this.scoreState.remaining;
    if (r <= 170) {
      const route = KD.Mode_X01.checkoutRoute(r, dartsLeft);
      if (route) {
        // Rookies shy away from tight trebles when a safer grind works.
        if (this.ambition === 0 && route[0][0] === 'T' && r > 60) return '20';
        return route[0];
      }
      // Not directly finishable (bogey number) — knock it down with the 20s.
      return this.ambition === 0 ? '20' : 'T20';
    }
    return this.ambition === 0 ? '20' : 'T20';
  };

  AIPlayer.prototype._chooseCricket = function (mode, opponent) {
    const me = this.scoreState.marks;
    const opp = opponent.scoreState.marks;
    const nums = mode.numbers; // [20,19,18,17,16,15,25]
    const openSelf = nums.filter(function (n) { return me[n] < 3; });
    const scoreable = nums.filter(function (n) { return me[n] === 3 && opp[n] < 3; });

    // Pro/Legend rack points on 20/19 once those are closed for them.
    if (this.ambition >= 1) {
      const rich = scoreable.filter(function (n) { return n === 20 || n === 19; });
      if (rich.length) return this._cricketLabel(rich[0]);
    }
    if (openSelf.length) return this._cricketLabel(openSelf[0]);
    if (scoreable.length) return this._cricketLabel(scoreable[0]);
    return this._cricketLabel(20);
  };

  AIPlayer.prototype._cricketLabel = function (n) {
    if (n === 25) return this.ambition === 0 ? '25' : 'BULL';
    return this.ambition === 0 ? '' + n : 'T' + n;
  };

  // Effective scatter under pressure. Real players (especially weaker ones) choke
  // when on a checkout — their grouping opens up the closer they get to zero.
  // Returns a multiplier on base sigma: ~1.0 when safe, up to ~2.2 for a Rookie
  // on a two-dart finish. Legends stay ice-cool (smallest bump). When not on a
  // checkout the multiplier is 1 (no effect).
  AIPlayer.prototype.pressureFactor = function (remaining, dartsLeft) {
    if (this.ambition >= 2) {
      // Legends barely choke — only flinch on a tight one-dart out.
      if (remaining <= 40 && dartsLeft === 1) return 1.15;
      return 1.0;
    }
    // On a checkout = within 170 and reachable this turn.
    const onCheckout = remaining <= 170 && remaining >= 2;
    if (!onCheckout) return 1.0;
    // Closer to the money = tighter the pressure. 170 (start) -> ~1.0, single-dart outs -> peak.
    const proximity = 1 - Math.min(1, (remaining - 2) / 170); // 0 at 170, 1 at 2
    const dartsPressure = dartsLeft === 1 ? 1.3 : dartsLeft === 2 ? 1.1 : 1.0;
    const tierPanic = this.ambition === 0 ? 2.2 : 1.6;  // Rookies panic most
    return 1 + proximity * (tierPanic - 1) * dartsPressure;
  };

  Player.TIERS = TIERS;
  KD.Player = Player;
  KD.AIPlayer = AIPlayer;
})(window.KD = window.KD || {});
