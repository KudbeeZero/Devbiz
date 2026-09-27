/* Kudbee Pinball — HYPERDRIVE launcher plug-in.
 *
 * Owns everything about getting a ball from the shooter lane onto the table: serving,
 * the lane hold, charge, the spring plunger, the climb, the crest + skill-shot award,
 * failed-plunge recapture, the charge meter and the touch affordance.
 *
 * The game passes a small host object; the launcher never reaches into game globals.
 *
 *   var L = KBLauncher.create(host);   // once, after the table exists
 *   physics:  L.update(h) · L.holdInLane(b) · L.climbing(b) · L.crest(b) · L.recapture(b, h)
 *   input:    L.press() · L.release(abort) · L.pointerHit(coarse, px, py, W, H)
 *   render:   L.drawWorld(ctx) (table space) · L.drawHUD(ctx, W, H) (screen space)
 *
 * The special bit: release inside the PERFECT notch (dead-centre of the lit lane's band)
 * for a HYPERDRIVE launch — light-streak climb, shockwave at the crest, double skill award.
 */
(function () {
  'use strict';

  var LANE_X = 831, LANE_REST_Y = 1320, LANE_FLOOR_Y = 1340, LANE_IN = 800, LANE_OUT = 862;
  var CREST_Y = 265;
  var LANE_G = 800;                  // climb gravity: charge ≥ 0.45 clears the lane
  var CHARGE_RATE = 1.6;             // full charge in 0.625s
  var MIN_CLEAR = 0.45;
  var LANES = [{ x: 250, label: 'A' }, { x: 450, label: 'B' }, { x: 650, label: 'C' }];
  var BANDS = [[0.45, 0.633, 2], [0.633, 0.817, 1], [0.817, 1.0, 0]];   // [from, to, lane] — weak plunge drops right
  var LANE_HALF_W = 64;
  var SKILL_VALUE = 5000, SKILL_MISS = 500, STREAK_CAP = 3;
  var PERFECT_HALF = 0.045;          // ±, around the lit band's centre (≈56ms of hold)
  var TAU = Math.PI * 2;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function bandOf(lane) { for (var i = 0; i < BANDS.length; i++) if (BANDS[i][2] === lane) return BANDS[i]; return BANDS[0]; }
  function laneFor(pow) {
    var f = clamp((pow - MIN_CLEAR) / (1 - MIN_CLEAR), 0, 1);
    return f >= 0.667 ? 0 : (f >= 0.333 ? 1 : 2);
  }

  function create(host) {
    var balls = host.balls;
    var charge = 0, charging = false;
    var lit = 1, streak = 0, bestStreak = 0, perfects = 0;
    var snapT = 0, snapFrom = 0;          // plunger snap-back animation
    var ghost = -1, ghostT = 0;           // last release position on the meter
    var perfectFlash = 0;

    function makeLaneBall(keep) {
      return { x: LANE_X, y: LANE_REST_Y, vx: 0, vy: 0, r: host.BALL_R, inLane: true, injected: false, launchPow: 0,
        rampCd: 0, lRampCd: 0, rRampCd: 0, portalCd: 0, lowT: 0, trail: [], noSave: !!keep };
    }
    function laneBall() { for (var i = 0; i < balls.length; i++) if (balls[i].inLane) return balls[i]; return null; }
    function laneBusy() {
      for (var i = 0; i < balls.length; i++) { var b = balls[i]; if (b.inLane || (!b.injected && b.x > LANE_IN - 2)) return true; }
      return false;
    }
    function perfectRange() { var bd = bandOf(lit), c = (bd[0] + bd[1]) / 2; return [c - PERFECT_HALF, c + PERFECT_HALF]; }

    // ---- serving ----
    function serve(keep) { lit = Math.floor(Math.random() * 3); balls.push(makeLaneBall(keep)); }
    // After a lock: serve the lane only when nothing else is in play and the lane is empty;
    // otherwise the saucer kicks the ball straight back out. The lane holds ONE ball.
    function serveAfterLock(s) {
      var live = false;
      for (var i = 0; i < balls.length; i++) if (!balls[i].inLane) live = true;
      if (!live && !laneBusy()) { balls.push(makeLaneBall(true)); return; }
      var down = s.y < 400;                       // the Star sits under the top arch: kick it down
      balls.push({ x: s.x, y: s.y, vx: (Math.random() - 0.5) * 320, vy: down ? 240 : -560 - Math.random() * 120,
        r: host.BALL_R, inLane: false, injected: true, launchPow: 1, rampCd: 0.4, lRampCd: 0.4, rRampCd: 0.4, portalCd: 0.4,
        saucerCd: 1.5, lowT: 0, trail: [], noSave: true, mbImmune: 0.5 });
      host.burst(s.x, s.y, '#ffffff', 10, 360);
    }

    // ---- input ----
    function press() { if (laneBall()) { charging = true; return true; } return false; }
    function release(abort) {
      if (!charging) return;
      charging = false;
      if (abort) { charge = 0; return; }
      launch();
    }
    function launch() {
      var b = laneBall(); if (!b) return;
      var pr = perfectRange(), perfect = charge >= pr[0] && charge <= pr[1];
      b.inLane = false; b.injected = false; b.launchPow = charge; b.hyper = perfect;
      b.x = LANE_X; b.y = LANE_REST_Y;
      b.vy = -(620 + charge * 1700); b.vx = -6; b.launchCd = 1.0;
      ghost = charge; ghostT = 2.5; snapFrom = charge; snapT = 0.22;
      host.sfx('launch');
      if (perfect) {
        perfects++; perfectFlash = 1;
        host.sfx('perfect'); host.shake(0.35);
        host.burst(LANE_X, LANE_FLOOR_Y - 10, '#7df9ff', 22, 520); host.burst(LANE_X, LANE_FLOOR_Y - 10, '#ffffff', 10, 300);
        host.callout('HYPERDRIVE', 'perfect launch', '#7df9ff');
      }
      charge = 0;
    }
    function pointerHit(coarse, px, py, W, H) {
      if (!laneBall()) return false;
      return coarse ? px >= W * 0.52 : (px > W * 0.55 && py > H * 0.7);
    }

    // ---- physics (called from the host's physStep) ----
    function update(h) {
      if (charging && laneBall()) charge = Math.min(1, charge + h * CHARGE_RATE);
      if (snapT > 0) snapT = Math.max(0, snapT - h);
      if (ghostT > 0) ghostT = Math.max(0, ghostT - h);
      if (perfectFlash > 0) perfectFlash = Math.max(0, perfectFlash - h * 1.4);
    }
    function holdInLane(b, h) {
      if (!b.inLane) return false;
      b.vy += host.G * h; b.y += b.vy * h; if (b.y > LANE_REST_Y) { b.y = LANE_REST_Y; b.vy = 0; }
      b.x = LANE_X;
      return true;
    }
    function climbing(b) { return !b.injected && b.x > LANE_IN; }
    // A failed plunge that falls back to the lane floor is parked for another go.
    function recapture(b, h) {
      if (b.launchCd) b.launchCd = Math.max(0, b.launchCd - h);
      // The whole lane interior counts: a weak plunge drifts left (vx −6) and used to settle at
      // x≈815, outside a narrow 820–842 window — parked on the floor, unlaunchable, forever.
      if (b.injected || b.x <= LANE_IN + 4 || b.x >= LANE_OUT || b.y <= 1290 || b.y >= 1336) return false;
      if (b.vx * b.vx + b.vy * b.vy >= 6400 || (b.launchCd && b.launchCd >= 0.3)) return false;
      b.launchCd = 0; b.inLane = true; b.launchPow = 0; b.hyper = false; b.x = LANE_X; b.vx = 0; b.vy = 0; b.trail.length = 0;
      return true;
    }
    // A cleared plunge crests the lane and is dropped through the skill lane its power picked.
    function crest(b) {
      if (!climbing(b) || b.y >= CREST_Y) return false;
      b.inLane = false; b.injected = true;
      if (!b.noSave) host.armSave();
      var lane = laneFor(b.launchPow), L = LANES[lane];
      // Drop through the skill lane, not onto The Star (450,220): lane B shares its x, and
      // without a saucer cooldown the same-frame star check would swallow the ball.
      b.saucerCd = 2.0; b.portalCd = 0.8;
      b.x = L.x + (lane === 1 ? -55 : 0); b.y = 255;
      b.vx = lane === 0 ? 80 : lane === 2 ? -80 : -40; b.vy = 220;
      b.trail.length = 0;
      if (lane === lit) {
        host.comboHit(L.x, 210, 'skill');
        streak++; if (streak > bestStreak) bestStreak = streak;
        var step = Math.min(streak - 1, STREAK_CAP);
        var award = (SKILL_VALUE + step * Math.round(SKILL_VALUE * 0.5)) * (b.hyper ? 2 : 1);
        host.addScore(award); host.bonus(b.hyper ? 30 : 15); host.sfx('skill');
        var shown = '+' + (award * host.mult()).toLocaleString();
        if (b.hyper) host.callout('HYPERDRIVE SKILL', shown + '  ·  2×', '#7df9ff');
        else if (streak >= 2) host.callout('SKILL STREAK ×' + streak, shown, '#ffd34d');
        else host.callout('SKILL SHOT!', shown, '#ffd34d');
        host.shake(0.55 + step * 0.08);
        host.burst(L.x, 210, b.hyper ? '#7df9ff' : '#ffd34d', 28 + step * 4, 520); host.burst(L.x, 210, '#ffffff', 14, 300);
        if (b.hyper) host.burst(L.x, 210, '#c46bff', 24, 700);
      } else {
        streak = 0;
        host.addScore(SKILL_MISS); host.callout('LANE ' + L.label, '+' + SKILL_MISS, '#39e6ff');
        host.burst(L.x, 210, '#39e6ff', 10, 340);
      }
      b.hyper = false;
      return true;
    }

    // ---- render: table space ----
    function drawSkillLanes(ctx, t, rm) {
      for (var i = 0; i < LANES.length; i++) {
        var L = LANES[i], on = (i === lit);
        var pulse = on && !rm ? 0.5 + 0.5 * Math.abs(Math.sin(t / 260)) : (on ? 0.6 : 0);
        var c = on ? '255,211,77' : '57,230,255';
        ctx.globalCompositeOperation = 'lighter';
        var g = ctx.createLinearGradient(0, 150, 0, 300);
        g.addColorStop(0, 'rgba(' + c + ',' + (on ? (0.05 + pulse * 0.10) : 0.04).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(' + c + ',0)');
        ctx.fillStyle = g; ctx.fillRect(L.x - LANE_HALF_W, 150, LANE_HALF_W * 2, 150);
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = 'rgba(' + c + ',' + (on ? 0.85 : 0.28) + ')'; ctx.lineWidth = on ? 3 : 1.5;
        ctx.beginPath();
        ctx.moveTo(L.x - LANE_HALF_W, 300); ctx.lineTo(L.x - LANE_HALF_W, 158);
        ctx.moveTo(L.x + LANE_HALF_W, 300); ctx.lineTo(L.x + LANE_HALF_W, 158); ctx.stroke();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = on ? '#ffe79a' : 'rgba(120,170,230,0.6)';
        ctx.font = '700 ' + (on ? 30 : 20) + 'px "Space Grotesk", sans-serif';
        ctx.fillText(on ? SKILL_VALUE.toLocaleString() : L.label, L.x, 192);
        if (on) { ctx.fillStyle = 'rgba(255,211,77,0.85)'; ctx.font = '700 13px Inter, sans-serif'; ctx.fillText('SKILL', L.x, 168); }
      }
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
    // Spring plunger under the lane floor: compresses with charge, rattles at full power,
    // snaps back on release.
    function drawPlunger(ctx, t, rm) {
      var comp = charging ? charge : (snapT > 0 ? snapFrom * Math.pow(snapT / 0.22, 2) : 0);
      var jit = charging && charge >= 1 && !rm ? (Math.random() - 0.5) * 1.6 : 0;
      var top = LANE_FLOOR_Y + 3 + comp * 30, knob = 1404 + comp * 20, x = LANE_X + jit;
      var hot = comp;
      // lane energy: the column glows and chevrons race upward as power builds
      if (hot > 0.02 || perfectFlash > 0) {
        ctx.globalCompositeOperation = 'lighter';
        var a = Math.max(hot * 0.22, perfectFlash * 0.35);
        var g = ctx.createLinearGradient(0, LANE_FLOOR_Y, 0, 200);
        g.addColorStop(0, 'rgba(125,249,255,' + a.toFixed(3) + ')'); g.addColorStop(1, 'rgba(125,249,255,0)');
        ctx.fillStyle = g; ctx.fillRect(LANE_IN + 2, 200, LANE_OUT - LANE_IN - 4, LANE_FLOOR_Y - 200);
        ctx.globalCompositeOperation = 'source-over';
      }
      // coil
      var coils = 6, cw = 11;
      ctx.strokeStyle = 'rgba(' + Math.round(150 + hot * 105) + ',' + Math.round(200 + hot * 49) + ',255,0.85)';
      ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, top);
      for (var i = 1; i <= coils * 2; i++) ctx.lineTo(x + (i % 2 ? cw : -cw), top + (knob - 8 - top) * i / (coils * 2));
      ctx.stroke();
      // tip plate + rod + knob
      ctx.fillStyle = hot > 0.6 ? '#ffe79a' : '#cfe9ff';
      ctx.fillRect(x - 15, top - 3, 30, 5);
      ctx.strokeStyle = 'rgba(207,233,255,0.6)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x, knob - 8); ctx.lineTo(x, knob); ctx.stroke();
      ctx.fillStyle = hot > 0.02 ? 'rgba(255,' + Math.round(211 - hot * 60) + ',77,0.95)' : 'rgba(196,107,255,0.8)';
      ctx.beginPath(); ctx.arc(x, knob + 6, 8, 0, TAU); ctx.fill();
    }
    // Hyperdrive climb: light streaks trail a perfect launch up the lane.
    function drawHyper(ctx, rm) {
      if (rm) return;
      for (var i = 0; i < balls.length; i++) {
        var b = balls[i]; if (!b.hyper || b.injected) continue;
        ctx.globalCompositeOperation = 'lighter';
        for (var k = -1; k <= 1; k++) {
          var g = ctx.createLinearGradient(0, b.y, 0, b.y + 240);
          g.addColorStop(0, 'rgba(125,249,255,0.75)'); g.addColorStop(1, 'rgba(196,107,255,0)');
          ctx.strokeStyle = g; ctx.lineWidth = k === 0 ? 5 : 2;
          ctx.beginPath(); ctx.moveTo(b.x + k * 12, b.y); ctx.lineTo(b.x + k * 12, b.y + 240); ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    function drawWorld(ctx) {
      if (host.state() !== 'play') return;
      var t = host.now(), rm = host.reduceMotion;
      drawSkillLanes(ctx, t, rm);
      drawPlunger(ctx, t, rm);
      drawLaneMeter(ctx, t, rm);
      drawHyper(ctx, rm);
    }

    // ---- render: screen space ----
    function affordanceActive() {
      if (host.state() !== 'play' || !laneBall()) return false;
      return host.isCoarse || host.launchPointerDown();
    }
    function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
    function drawAffordance(ctx, W, H, t, rm) {
      if (!affordanceActive()) return;
      var mn = Math.min(W, H), pad = Math.round(mn * 0.03);
      var x0 = W * 0.52, w = W - x0;
      var pulse = rm ? 0.55 : 0.4 + 0.3 * (0.5 + 0.5 * Math.sin(t / 320));
      ctx.fillStyle = 'rgba(57,230,255,' + (charging ? 0.1 : 0.05).toFixed(2) + ')';
      ctx.fillRect(x0, H * 0.06, w, H * 0.88);
      ctx.strokeStyle = 'rgba(57,230,255,' + pulse.toFixed(2) + ')'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x0, H * 0.08); ctx.lineTo(x0, H * 0.94); ctx.stroke();
      var ix = x0 + w * 0.5, iy = H - pad - Math.round(mn * 0.14);
      ctx.fillStyle = 'rgba(196,107,255,0.25)'; roundRect(ctx, ix - 14, iy - 28, 28, 36, 8); ctx.fill();
      ctx.strokeStyle = 'rgba(196,107,255,0.75)'; ctx.lineWidth = 2; roundRect(ctx, ix - 14, iy - 28, 28, 36, 8); ctx.stroke();
      if (charging) {
        ctx.strokeStyle = 'rgba(255,211,77,0.9)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(ix, iy - 10, 18, -Math.PI / 2, -Math.PI / 2 + clamp(charge, 0, 1) * TAU); ctx.stroke();
      }
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#cfe9ff'; ctx.font = '700 ' + Math.round(mn * 0.024) + 'px system-ui,sans-serif';
      ctx.fillText(charging ? 'RELEASE' : 'HOLD', ix, H * 0.68);
      ctx.fillStyle = 'rgba(138,147,168,0.95)'; ctx.font = '600 ' + Math.round(mn * 0.017) + 'px system-ui,sans-serif';
      ctx.fillText(charging ? 'on the ◆ for HYPERDRIVE' : 'right side · plunger', ix, H * 0.68 + Math.round(mn * 0.028));
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    }
    // Power column inside the shooter lane: fills upward as you charge. One band per skill
    // lane (lit band gold), the ◆ PERFECT notch inside it, and a ghost of the last release
    // so the timing can be learned. Lives in table space, so it scales with the table.
    var COL_TOP = 430, COL_BOT = 1290, COL_W = 16;
    function yOf(c) { return COL_BOT - (COL_BOT - COL_TOP) * c; }
    function drawLaneMeter(ctx, t, rm) {
      var lb = laneBall(); if (!lb) return;
      var x0 = LANE_X - COL_W / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(x0 - 3, COL_TOP - 3, COL_W + 6, COL_BOT - COL_TOP + 6);
      ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(x0, yOf(MIN_CLEAR), COL_W, COL_BOT - yOf(MIN_CLEAR));
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '700 13px Inter, sans-serif';
      for (var i = 0; i < BANDS.length; i++) {
        var bd = BANDS[i], ya = yOf(bd[1]), yb = yOf(bd[0]), on = (bd[2] === lit);
        ctx.fillStyle = on ? 'rgba(255,211,77,0.85)' : 'rgba(57,230,255,0.22)';
        ctx.fillRect(x0, ya + 1, COL_W, yb - ya - 2);
        ctx.fillStyle = on ? '#04040a' : 'rgba(207,233,255,0.75)';
        ctx.fillText(LANES[bd[2]].label, LANE_X, on ? yb - 12 : (ya + yb) / 2);
      }
      var pr = perfectRange(), py0 = yOf(pr[1]), py1 = yOf(pr[0]);
      var glow = rm ? 0.85 : 0.65 + 0.35 * Math.sin(t / 140);
      ctx.fillStyle = 'rgba(125,249,255,' + glow.toFixed(2) + ')';
      ctx.fillRect(x0 - 4, py0, COL_W + 8, py1 - py0);
      ctx.fillStyle = '#04040a'; ctx.fillText('◆', LANE_X, (py0 + py1) / 2 + 0.5);
      if (ghostT > 0 && ghost >= 0) {
        ctx.fillStyle = 'rgba(255,255,255,' + (0.6 * ghostT / 2.5).toFixed(2) + ')';
        ctx.fillRect(x0 - 8, yOf(clamp(ghost, 0, 1)) - 1.5, COL_W + 16, 3);
      }
      if (charge > 0) {
        var yc = yOf(clamp(charge, 0, 1));
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(x0 + 3, yc, COL_W - 6, COL_BOT - yc);
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#ffffff'; ctx.fillRect(x0 - 10, yc - 2, COL_W + 20, 4);
      } else {
        var a = rm ? 0.8 : 0.45 + 0.4 * Math.abs(Math.sin(t / 380));
        ctx.fillStyle = 'rgba(207,233,255,' + a.toFixed(2) + ')'; ctx.font = '700 15px Inter, sans-serif';
        ctx.fillText('HOLD', LANE_X, COL_BOT - 34);
        if (!host.isCoarse) { ctx.font = '700 11px Inter, sans-serif'; ctx.fillText('SPACE', LANE_X, COL_BOT - 16); }
      }
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
    function drawHUD(ctx, W, H) { drawAffordance(ctx, W, H, host.now(), host.reduceMotion); }

    function reset() { charge = 0; charging = false; streak = 0; bestStreak = 0; perfects = 0; snapT = 0; ghostT = 0; perfectFlash = 0; }

    return {
      LANE_G: LANE_G,
      serve: serve, serveAfterLock: serveAfterLock, laneBall: laneBall, laneBusy: laneBusy,
      press: press, release: release, launch: launch, pointerHit: pointerHit,
      update: update, holdInLane: holdInLane, climbing: climbing, recapture: recapture, crest: crest,
      drawWorld: drawWorld, drawHUD: drawHUD, affordanceActive: affordanceActive, reset: reset,
      perfectRange: perfectRange,
      get charge() { return charge; }, set charge(v) { charge = v; },
      get charging() { return charging; },
      get lit() { return lit; },
      get streak() { return streak; }, get bestStreak() { return bestStreak; },
      get perfects() { return perfects; }
    };
  }

  window.KBLauncher = { create: create };
})();
