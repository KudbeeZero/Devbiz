/* Kudbee Pinball — MULTIBALL JACKPOTS plug-in.
 *
 * Real pinball's classic multiball hook: once balls are loose, the three ramps light for
 * Jackpots. Collect all three (any order) and the table lights SUPER JACKPOT — the next ramp
 * shot, whichever one, pays a huge bonus and relights the round so it keeps paying for as
 * long as multiball lasts. Purely additive: it watches multiballActive itself (no edits at
 * the four places multiball starts) and only adds two call sites to the existing ramp hits.
 *
 *   var jackpot = KBJackpot.create(host);   // once, after ramp/leftRamp/rightRamp exist
 *   physics/logic: jackpot.update(h) from physStep (edge-detects multiball start/end —
 *                  deterministic, same as launcher.update(), so headless tests need no rAF)
 *                  jackpot.hitCenter() from onRamp, jackpot.hitSide(r.side) from onSideRamp
 *   render:        jackpot.drawWorld(ctx)  (table space, after the ramps draw)
 *   test:          jackpot.state() -> {active, lit:[...], superLit, round}
 */
(function () {
  'use strict';

  var SHOTS = ['center', 'left', 'right'];
  var VALUES = [15000, 20000, 25000];   // per shot collected this round, in order
  var SUPER_VALUE = 75000;
  var TAU = Math.PI * 2;

  function create(host) {
    var active = false, wasMultiball = false;
    var lit = {}, superLit = false, round = 0;
    var hitFlash = { center: 0, left: 0, right: 0 };   // brief post-collect brightening, per shot

    function armRound() {
      lit = { center: true, left: true, right: true };
      superLit = false; round++;
    }
    function litCount() { var n = 0; for (var i = 0; i < SHOTS.length; i++) if (lit[SHOTS[i]]) n++; return n; }

    function onMultiballStart() {
      active = true; armRound();
      host.callout('JACKPOTS LIT', 'shoot the ramps', '#ffd34d');
    }
    function onMultiballEnd() { active = false; lit = {}; superLit = false; }

    // Called once per physics step — the only place that needs to know multiball
    // started or ended, so no other code has to remember to tell this module.
    function update(dt) {
      var mb = host.multiballActive();
      if (mb && !wasMultiball) onMultiballStart();
      else if (!mb && wasMultiball) onMultiballEnd();
      wasMultiball = mb;
      for (var i = 0; i < SHOTS.length; i++) { var s = SHOTS[i]; if (hitFlash[s] > 0) hitFlash[s] = Math.max(0, hitFlash[s] - dt * 2.5); }
    }

    function collect(shot) {
      if (!active) return false;
      hitFlash[shot] = 1;
      if (superLit) {
        host.addScore(SUPER_VALUE);
        host.bonus(40);
        host.sfx('superjackpot');
        host.shake(0.9);
        host.colorWash(255, 211, 77, 1.3);
        host.callout('SUPER JACKPOT!', '+' + (SUPER_VALUE * host.mult()).toLocaleString(), '#ffd34d');
        var g = host.geometry(shot);
        host.burst(g.x, g.y, '#ffd34d', 34, 680); host.burst(g.x, g.y, '#ffffff', 18, 420); host.burst(g.x, g.y, '#39e6ff', 22, 560);
        armRound();
        return 'super';
      }
      if (!lit[shot]) return false;
      var idx = 3 - litCount();     // 0 for the first collected this round, 1 for the second...
      var value = VALUES[Math.min(idx, VALUES.length - 1)];
      lit[shot] = false;
      host.addScore(value);
      host.bonus(15);
      host.sfx('jackpot');
      host.shake(0.4 + idx * 0.08);
      var geo = host.geometry(shot);
      host.burst(geo.x, geo.y, '#ffd34d', 18 + idx * 4, 480);
      host.callout('JACKPOT', '+' + (value * host.mult()).toLocaleString(), '#ffd34d');
      if (litCount() === 0) {
        superLit = true;
        host.sfx('superlit');
        host.callout('SUPER JACKPOT LIT', 'shoot any ramp', '#ff5d3c');
      }
      return 'jackpot';
    }

    function hitCenter() { return collect('center'); }
    function hitSide(side) { return collect(side < 0 ? 'left' : 'right'); }

    // ---- render: table space, drawn after the ramps so the glow sits on top. Purely a
    // persistent in-world indicator — the callout() banner already handles announcements,
    // so this never duplicates that text (the HUD is crowded enough during multiball). ----
    function drawShotGlow(ctx, shot, g, t, rm) {
      if (!g) return;
      var on = superLit || lit[shot], hit = hitFlash[shot];
      var pulse = rm ? 0.7 : 0.5 + 0.5 * Math.sin(t / 220);
      var col = superLit ? '255,93,60' : '255,211,77';
      var r = 70 + hit * 30;
      ctx.globalCompositeOperation = 'lighter';
      var rad = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, r);
      rad.addColorStop(0, 'rgba(' + col + ',' + (on ? (0.22 + pulse * 0.18 + hit * 0.4) : hit * 0.3).toFixed(3) + ')');
      rad.addColorStop(1, 'rgba(' + col + ',0)');
      ctx.fillStyle = rad; ctx.beginPath(); ctx.arc(g.x, g.y, r, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      if (!on) return;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = superLit ? '#ff8a66' : '#ffe79a';
      ctx.font = '700 ' + (superLit ? 15 : 12) + 'px "Space Grotesk", sans-serif';
      ctx.fillText(superLit ? 'SUPER' : 'JACKPOT', g.x, g.y - 40);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
    function drawWorld(ctx) {
      if (!active || host.state() !== 'play') return;
      var t = host.now(), rm = host.reduceMotion;
      for (var i = 0; i < SHOTS.length; i++) {
        var shot = SHOTS[i];
        drawShotGlow(ctx, shot, host.geometry(shot), t, rm);
      }
    }

    function reset() { active = false; wasMultiball = false; lit = {}; superLit = false; round = 0; hitFlash = { center: 0, left: 0, right: 0 }; }
    function state() { return { active: active, lit: SHOTS.filter(function (s) { return lit[s]; }), superLit: superLit, round: round }; }

    return { update: update, hitCenter: hitCenter, hitSide: hitSide, drawWorld: drawWorld, reset: reset, state: state };
  }

  window.KBJackpot = { create: create };
})();
