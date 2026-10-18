/* =====================================================================
 * Kudbee Darts — entities/dart.js
 * The throw — a true Darts-of-Fury-style FLICK. You drag to aim a live
 * reticle, then you must SWIPE-RELEASE to throw: there is no tap-to-place.
 * The release velocity sets the power and the curl; the pressure adds weight.
 *
 *   - Aim   : the reticle follows your finger, clamped to the board.
 *   - Power : release SPEED vs an ideal flick. Too soft and the dart drops
 *             low/short; too hard and it sails high and outward (overshoot).
 *   - Curl  : sideways release velocity bends the flight + pulls the landing.
 *   - Weight: harder PRESSURE sinks the dart a touch and adds curl/scatter.
 *   - Guard : a tap (tiny, slow swipe) does NOT throw — you get a nudge.
 *
 * The flight is SIMULATED, like the arrow in Kudbee Archery: the release
 * becomes a real 3D projectile (metres, seconds, gravity, curl) from the
 * hand to the board face, drawn in perspective. Where that trajectory
 * meets the board is the landing point that scores (via Board.hitTest).
 * The thrower's hand error (sigma) picks the point an ideal flick would
 * hit; the actual flick's power and curl then play out through the physics.
 * ===================================================================== */
(function (KD) {
  'use strict';
  const Util = KD.Util;

  // ---- Flick tuning (logical px unless noted) ---------------------------
  // IDEAL_SPEED is only the FALLBACK: the live ideal is learned per player by
  // Progression (game.idealFlick()) and re-centers the power band on their own
  // natural flick. Must match Progression.FLICK_DEFAULT.
  const IDEAL_SPEED = 1500;     // px/s: a clean, committed flick (un-calibrated)
  const MIN_SWIPE_LEN = 24;     // below this a release is a "tap" -> no throw
  const MIN_REL_SPEED = 240;    // px/s: too slow to count as a flick

  // ---- Flight simulator (metres, seconds) --------------------------------
  const T_IDEAL = 0.40;         // s, flight time of an ideal flick
  const OCHE = 2.37;            // m, the throw line to the board face
  const G = 5.5;                // m/s^2: softer than Earth's 9.81 so the arc stays on screen
  const BOARD_M = 0.170;        // m in one board radius (outer edge of the doubles)
  const CAM_BACK = 4.0;         // m from the camera to the hand: the view's depth
  const POWER_GAIN = 0.15;      // how strongly flick power changes release speed
  const CURL_ACC = 0.18;        // m/s^2 sideways per unit of curl
  const SINK_ACC = 0.27;        // m/s^2 extra drop per unit of extra pressure
  const CURL_LEAD = 0.030;      // s: the curl starts bending this much sooner (already
                                // turning as the dart leaves the hand) for a cleaner arc
  const CRATE_D = 0.12;         // m: THINK BOX crates stand this far in front of the board
  const BASE_LEN = 55;          // flight sprite length at scale 1
  const START_SCALE = 1.9;      // flight size at the hand (closest to the camera)
  const HAND_X = (g) => g.viewW / 2 + 120;   // throwing hand: right of the oche centre
  const HAND_Y = (g) => g.viewH - 84;        // tip height — high enough to see the dart in hand
  const STUCK_LEN = KD.Sprites.STUCK_LEN;   // Sprites.drawStuckDart length

  function Dart(game) {
    this.game = game;
    this.state = 'ready';      // ready | aiming | flying | done
    this.aimX = 0; this.aimY = 0;
    this._swayX = 0; this._swayY = 0;   // live hand-tremor offset (logical px)
    this._swayPhase = Math.random() * Math.PI * 2;
    this.sigma = 0.022;        // base landing scatter (board-radius units)
    this.isAI = false;

    // live swipe read-outs (for the aim guide)
    this.power = 0;            // normalized current swipe speed (0..~1.6)
    this.tooSoft = false;      // last release was a tap -> show a nudge
    this.nudgeT = 0;

    // flight
    this._ft = 0;
    this._fromX = 0; this._fromY = 0;
    this._curl = 0;            // signed lateral curl for the cosmetic arc
    this._powf = 1;
    this.landX = 0; this.landY = 0;
    this.result = null;
    this.skin = null;
    this.parts = null;         // { tip, flight } — cosmetic, set per thrower
  }

  Dart.prototype.reset = function () {
    this.state = 'ready';
    this.result = null;
    this._ft = 0;
    this.power = 0;
  };

  // Clamp an arbitrary point to lie within the playable board disc.
  Dart.prototype._clampToBoard = function (x, y) {
    const b = this.game.board;
    const dx = x - b.cx, dy = y - b.cy;
    const maxR = b.Rpx * KD.Board.R.dblOuter * 1.02;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > maxR) { x = b.cx + dx / d * maxR; y = b.cy + dy / d * maxR; }
    return { x: x, y: y };
  };

  // ---- Human aiming ------------------------------------------------------
  Dart.prototype.beginAim = function (px, py) {
    const p = this._clampToBoard(px, py);
    this.aimX = p.x; this.aimY = p.y;
    this._swayPhase = Math.random() * Math.PI * 2;   // fresh tremor each throw
    this._swayX = 0; this._swayY = 0;
    this.isAI = false;
    this.power = 0;
    this.tooSoft = false;
    this.state = 'aiming';
  };

  Dart.prototype.updateAim = function (px, py, dt) {
    const p = this._clampToBoard(px, py);
    // Ease toward the pointer for a weighty feel.
    this.aimX = Util.lerp(this.aimX, p.x, 1 - Math.pow(0.0001, dt));
    this.aimY = Util.lerp(this.aimY, p.y, 1 - Math.pow(0.0001, dt));
    // Live power read-out from the pointer's smoothed speed, relative to the
    // player's own calibrated ideal (so the gauge reads the same on any device).
    const spd = (this.game.input.pointer.speed) || 0;
    const ideal = this.game.idealFlick ? this.game.idealFlick() : IDEAL_SPEED;
    this.power = Util.lerp(this.power, Math.min(1.7, spd / ideal), 1 - Math.pow(0.02, dt));

    // Hand-tremor sway: a subtle multi-frequency tremor a real throw has. Two
    // incommensurate sines give it an organic, non-repetitive drift. Amplitude is
    // small (a few logical px) so it reads as "steady your hand" skill, not noise.
    // Grows very slightly the longer you hold (fatigue), rewarding commitment.
    if (!this.game.reduceMotion) {
      this._swayPhase += dt;
      const hold = Math.min(1, this._swayPhase / 2.2);
      const amp = (0.6 + hold * 0.7) * (this.game.board.Rpx / 232) * (this.steady || 1);   // upgrades steady the hand
      const a = this._swayPhase;
      this._swayX = (Math.sin(a * 7.3) * 0.7 + Math.sin(a * 4.1 + 1.3) * 0.3) * amp;
      this._swayY = (Math.sin(a * 6.1 + 0.7) * 0.7 + Math.sin(a * 3.7 + 2.1) * 0.3) * amp;
    } else {
      this._swayX = 0; this._swayY = 0;
    }
  };

  // ---- AI aiming ---------------------------------------------------------
  Dart.prototype.setAI = function (targetX, targetY, sigma) {
    this.aimX = targetX; this.aimY = targetY;
    this.sigma = sigma;
    this.isAI = true;
    this.state = 'aiming';
  };

  // Predicted landing for the AI (aim + nothing; scatter added on release).
  Dart.prototype.predict = function () {
    return { x: this.aimX, y: this.aimY };
  };

  // ---- Release -----------------------------------------------------------
  // Human flick. Returns null and stays 'aiming' if the gesture was a tap.
  Dart.prototype.release = function () {
    const Rpx = this.game.board.Rpx;

    if (this.isAI) return this._releaseAt(this.aimX, this.aimY, this.sigma);

    const pt = this.game.input.pointer;
    // Reject a tap / dab: enforce "you must swipe to throw".
    if (pt.swipeLen < MIN_SWIPE_LEN || pt.relSpeed < MIN_REL_SPEED) {
      this.tooSoft = true; this.nudgeT = 0.9;
      return null;
    }

    let lx = this.aimX + this._swayX, ly = this.aimY + this._swayY;
    const cx = this.game.board.cx, cy = this.game.board.cy;

    // Auto-calibrate: learn THIS player's natural flick speed and re-center the
    // power band on it, then score THIS throw against the updated ideal — so a
    // trackpad drag and a phone flick both read as a clean, committed throw.
    let cal = null;
    if (this.game.progression && this.game.progression.recordFlick) {
      cal = this.game.progression.recordFlick(pt.relSpeed);
    }
    const ideal = (cal && cal.ideal) || (this.game.idealFlick ? this.game.idealFlick() : IDEAL_SPEED);

    // Power: release speed vs the (calibrated) ideal flick.
    const powf = pt.relSpeed / ideal;                // <1 soft, >1 hard
    this._powf = powf;

    // Radial (centre -> aim) for over/undershoot along the throw line.
    let rdx = lx - cx, rdy = ly - cy;
    const rlen = Math.sqrt(rdx * rdx + rdy * rdy) || 1;
    rdx /= rlen; rdy /= rlen;

    // Curl: the sideways part of the release, measured across the aim radial.
    const rs = pt.relSpeed || 1;
    const ux = pt.relVX / rs, uy = pt.relVY / rs;     // unit release dir
    const lateral = ux * (-rdy) + uy * (rdx);         // signed perp component
    this._curl = lateral;

    // Weight from pressure (pen / 3D-touch): a heavier throw sinks a touch and curls more.
    const pr = pt.pressure || 0;
    const sink = pr > 0.55 ? pr - 0.55 : 0;
    if (sink) this._curl *= 1 + sink;

    // Scatter grows when the throw is far from an ideal, committed flick.
    const wildness = Math.min(1.3, Math.abs(powf - 1) * 0.9 + Math.abs(lateral) * 0.5
      + Math.max(0, (90 - Math.min(90, pt.swipeLen)) / 90) * 0.4);
    const sigma = this.sigma * (1 + wildness);

    // Coaching read-out so the flick power band is learnable. Once the game has
    // locked onto the player's flick, announce it once so the adaptation is felt.
    const fb = (cal && cal.justCalibrated) ? { text: 'DIALED IN', col: '#7CFFb2' }
      : powf < 0.82 ? { text: 'TOO SOFT', col: '#39e6ff' }
      : powf > 1.30 ? { text: 'TOO HARD', col: '#ff5d3c' }
      : (Math.abs(powf - 1) < 0.12 && Math.abs(lateral) < 0.3) ? { text: 'PERFECT FLICK', col: '#7CFFb2' }
      : { text: 'CLEAN FLICK', col: '#cfe9ff' };
    this.game.flickFb = { text: fb.text, col: fb.col, life: 1.15 };

    // Power, curl and weight go to the flight simulator, not straight onto the landing.
    return this._releaseAt(lx, ly, sigma, { powf: powf, curlX: -rdy * this._curl, curlY: rdx * this._curl, sink: sink });
  };

  // Shared landing + flight kickoff for human and AI.
  Dart.prototype._releaseAt = function (lx, ly, sigma, phys) {
    const Rpx = this.game.board.Rpx;
    const cx = this.game.board.cx, cy = this.game.board.cy;

    // Directional scatter: real darts misses are predominantly TANGENTIAL — into
    // the neighbouring wedges (aim at T20, miss into 5 or 1) — not isotropic.
    // Decompose the Gaussian jitter into tangential (large) + radial (small)
    // axes relative to the board centre, so misses read like real ones.
    const dx = lx - cx, dy = ly - cy;
    const rad = Math.sqrt(dx * dx + dy * dy) || 1;
    const tx = -dy / rad, ty = dx / rad;       // unit tangent (clockwise)
    const rx = dx / rad, ry = dy / rad;        // unit radial (outward)
    const gTang = Util.gaussian();
    const gRad = Util.gaussian();
    const tangSigma = sigma * 1.25;             // wide into adjacent wedges
    const radSigma = sigma * 0.45;              // tight in/out (less depth error)
    const jx = tx * gTang * tangSigma * Rpx + rx * gRad * radSigma * Rpx;
    const jy = ty * gTang * tangSigma * Rpx + ry * gRad * radSigma * Rpx;

    let landX = lx + jx, landY = ly + jy;

    // Dart grouping (muscle memory): if the player has already landed a dart this
    // turn, pull this landing toward that cluster center. The longer the groove,
    // the stronger the pull — so stacking T20s feels tight and skillful. The AI
    // throws true to its target (no grouping), keeping its skill honest to sigma.
    const gc = this.game._groupCenter;
    if (!this.isAI && gc && this.game._groupStrength > 0) {
      const g = this.game._groupStrength;     // 0..~0.55
      landX = landX * (1 - g) + gc.x * g;
      landY = landY * (1 - g) + gc.y * g;
    }

    // (landX, landY) is where an ideal flick would land after the hand error.
    // The simulator flies the ACTUAL release (power, curl, weight) from the
    // hand through gravity; where it meets the board face is what scores.
    // The AI always throws an ideal flick, so its landings keep their sigma.
    this._fromX = HAND_X(this.game); this._fromY = HAND_Y(this.game);
    if (!phys) { this._curl = 0; this._powf = 1; }
    this._launch(landX, landY, phys || null);
    // A dart stopped by a THINK BOX crate scores nothing (ring 'miss', so every
    // mode treats it as a miss) and is flagged so it sticks in the wood.
    this.result = this.blocked
      ? { score: 0, ring: 'miss', mult: 0, value: 0, label: 'BLOCKED', blocked: true, crate: this.blocked.crate }
      : this.game.board.hitTest(this.landX, this.landY);
    this._roll = (Math.random() < 0.5 ? -1 : 1);
    this._embedAng = this.embedAngle(this.landX, this.landY);
    this._ft = 0;
    this.state = 'flying';
    this.game.audio.whoosh();
    // Release juice: a snap-ring + a few sparks at the hand as the dart leaves.
    if (this.game.particles) {
      const col = (this.skin && this.skin.color) || '#39e6ff';
      this.game.particles.shockwave(this._fromX, this._fromY - 10, col, 44, 0.28, 2.5);
      if (!this.game.reduceMotion) {
        this.game.particles.burst(this._fromX, this._fromY - 10, col, 6, 190, { glow: true, life: 0.25, size: 2, drag: 3 });
      }
    }
    if (this.game.lungeBoard) this.game.lungeBoard();
    return this.result;
  };

  // Angle (radians, canvas y-down) the tip points when the dart is embedded at (lx, ly).
  // Real darts arc over and enter the board nose-down, so seen from the thrower the
  // FLIGHTS sit above the tip. A sideways throw leans the tip toward the target side.
  Dart.prototype.embedAngle = function (lx, ly) {
    const g = this.game;
    const dx = lx - (this._fromX || HAND_X(g));
    return Math.PI / 2 - Util.clamp(dx / (g.viewW * 0.5), -1, 1) * 0.45;
  };

  Dart.prototype.update = function (dt) {
    if (this.state !== 'flying') return false;
    this._ft += dt;
    if (this._ft >= this._sim.T) {
      this.state = 'done';
      return true; // signals arrival to the game
    }
    return false;
  };

  // ---- Flight simulator ------------------------------------------------
  // Board-face metres: x right, y down (gravity is +y), z from the hand (0)
  // to the board (OCHE). The view is a perspective camera CAM_BACK behind the
  // hand, scaled so z = OCHE lands exactly on the board's own pixels.
  Dart.prototype._pxPerM = function () { return this.game.board.Rpx / BOARD_M; };
  Dart.prototype._depthScale = function (z) { return (OCHE + CAM_BACK) / (z + CAM_BACK); };
  Dart.prototype._project = function (p) {
    const b = this.game.board, k = this._pxPerM(), s = this._depthScale(p.z);
    return { x: b.cx + p.x * k * s, y: b.cy + p.y * k * s, s: s };
  };

  // Launch toward (tx, ty) on the board: solve the velocity an ideal flick
  // needs to meet it in T_IDEAL, then apply the real flick. A soft flick is
  // slower, so gravity has longer to pull it down; a hard one is faster and
  // flatter, so it rides high. Curl and weight are steady sideways/down pushes.
  Dart.prototype._launch = function (tx, ty, phys) {
    const b = this.game.board, k = this._pxPerM(), s0 = this._depthScale(0);
    const x0 = (this._fromX - b.cx) / (k * s0), y0 = (this._fromY - b.cy) / (k * s0);
    const X = (tx - b.cx) / k, Y = (ty - b.cy) / k, T = T_IDEAL;
    let vx = (X - x0) / T, vy = (Y - y0 - 0.5 * G * T * T) / T, vz = OCHE / T;
    const f = phys ? Util.clamp(1 + (phys.powf - 1) * POWER_GAIN, 0.75, 1.2) : 1;
    vx *= f; vy *= f; vz *= f;
    // Curl runs on its own clock, CURL_LEAD ahead of release, so the hook is
    // already bending as the dart leaves the hand instead of easing in from
    // dead straight. It is rescaled so the total curl at the board is unchanged:
    // the arc is cleaner, the landing (and every score) stays the same.
    const cx = phys ? phys.curlX * CURL_ACC : 0, cy = phys ? phys.curlY * CURL_ACC : 0;
    const ay = G + (phys ? phys.sink * SINK_ACC : 0);
    const Tb = OCHE / vz;
    this._sim = { x0: x0, y0: y0, vx: vx, vy: vy, vz: vz, ay: ay, cx: cx, cy: cy,
      curlK: Tb * Tb / (Tb * Tb + 2 * CURL_LEAD * Tb), T: Tb };
    // THINK BOX: where the path crosses the crate plane, a crate in the way
    // (at the moment the dart gets there) stops it.
    this.blocked = null;
    const tc = (OCHE - CRATE_D) / vz;
    const crates = this.game.crateRects ? this.game.crateRects(tc) : null;
    if (crates) {
      const pc = this._simAt(tc);
      for (let i = 0; i < crates.length; i++) {
        const c = crates[i];
        if (pc.x >= c.x0 && pc.x <= c.x1 && pc.y >= c.y0 && pc.y <= c.y1) {
          this.blocked = { crate: c.crate };
          this._sim.T = tc;
          break;
        }
      }
    }
    const end = this._project(this._simAt(this._sim.T));
    this.landX = end.x; this.landY = end.y;
  };

  Dart.prototype._simAt = function (t) {
    const s = this._sim;
    const c = 0.5 * (t * t + 2 * CURL_LEAD * t) * s.curlK;   // curl travel, lead-shifted
    return { x: s.x0 + s.vx * t + s.cx * c, y: s.y0 + s.vy * t + 0.5 * s.ay * t * t + s.cy * c, z: s.vz * t };
  };

  // The flight at progress k (0..1 of the simulated time), on screen. vx/vy is
  // screen velocity (px/s), tx/ty the screen travel direction, and e the depth
  // progress (0 at the hand, 1 at the board) that sizes the sprite.
  Dart.prototype._flightAt = function (k) {
    const sim = this._sim, t = Util.clamp(k, 0, 1) * sim.T, dt = sim.T * 0.01;
    const p = this._project(this._simAt(t)), q = this._project(this._simAt(t + dt));
    const s0 = this._depthScale(0);
    const tx = q.x - p.x, ty = q.y - p.y;
    return { x: p.x, y: p.y, vx: tx / dt, vy: ty / dt, tx: tx, ty: ty, e: (s0 - p.s) / (s0 - 1) };
  };

  // Current position + velocity along the flight arc, for trail emission.
  Dart.prototype._getFlightPos = function () {
    if (this.state !== 'flying') return null;
    const f = this._flightAt(this._ft / this._sim.T);
    return { x: f.x, y: f.y, vx: f.vx, vy: f.vy };
  };

  // ---- Rendering ---------------------------------------------------------
  // The aim reticle + a live power gauge teaching the flick.
  Dart.prototype.drawReticle = function (ctx) {
    if (this.nudgeT > 0 && this.state !== 'aiming') {
      // Brief "swipe to throw" nudge after a rejected tap.
      this.nudgeT -= 1 / 60;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, this.nudgeT * 1.6));
      ctx.fillStyle = '#ffd34d'; ctx.font = 'bold 20px "Space Grotesk", sans-serif';
      ctx.textAlign = 'center'; ctx.shadowColor = '#ffd34d'; ctx.shadowBlur = 14;
      ctx.fillText('SWIPE TO THROW', this.aimX, this.aimY - 30);
      ctx.restore();
      ctx.textAlign = 'left';
    }
    if (this.state !== 'aiming') return;

    // The AI gets its own, deliberately simpler "targeting" reticle instead of
    // the human crosshair + power gauge (which teaches the flick and would be
    // meaningless for a scripted throw). Previously an opponent's think-time
    // had NO board-side feedback at all beyond a small dim HUD line ("Rookie
    // Bot is throwing…"), so it was hard to read where the AI was even aiming.
    if (this.isAI) { this.drawAIReticle(ctx); return; }

    // Draw the reticle at the swayed aim point so the player SEES the hand
    // tremor and learns to time the throw when it's centered — the core skill.
    const p = { x: this.aimX + this._swayX, y: this.aimY + this._swayY };
    const res = this.game.board.hitTest(p.x, p.y);
    const t = this.game.time;
    const pulse = 0.5 + 0.5 * Math.sin(t * 6);
    const col = res.ring === 'treble' ? '#7CFFb2'
      : res.ring === 'double' ? '#ffd34d'
      : (res.ring === 'inbull' || res.ring === 'outbull') ? '#ff5d3c'
      : '#39e6ff';

    ctx.save();
    ctx.shadowColor = col; ctx.shadowBlur = 14;
    ctx.strokeStyle = col; ctx.lineWidth = 2;
    // Aim ring + rotating ticks.
    const rr = 18;
    ctx.globalAlpha = 0.55 + 0.4 * pulse;
    ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, Math.PI * 2); ctx.stroke();
    ctx.save();
    ctx.translate(p.x, p.y); ctx.rotate(t * 1.4);
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 2);
      ctx.beginPath(); ctx.moveTo(rr + 3, 0); ctx.lineTo(rr + 9, 0); ctx.stroke();
    }
    ctx.restore();
    // Crosshair + dot.
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    ctx.moveTo(p.x - 12, p.y); ctx.lineTo(p.x + 12, p.y);
    ctx.moveTo(p.x, p.y - 12); ctx.lineTo(p.x, p.y + 12);
    ctx.stroke();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2); ctx.fill();
    // Live label.
    ctx.globalAlpha = 1;
    ctx.font = 'bold 18px "Space Grotesk", monospace';
    ctx.textAlign = 'center'; ctx.fillStyle = col;
    ctx.fillText(res.label + (res.score ? '  ' + res.score : ''), p.x, p.y - rr - 12);
    ctx.restore();

    // Enhanced power gauge: vertical bar beside the reticle with dynamic glow feedback.
    // The green band is the committed-flick sweet spot.
    const gx = p.x + rr + 18, gy0 = p.y - 46, gh = 92, gw = 9;
    ctx.save();

    // Outer glow/border effect scales with power input.
    const glowIntensity = Math.min(1, this.power / 1.7) * 0.6;
    ctx.shadowColor = 'rgba(57,230,255,0.5)';
    ctx.shadowBlur = 8 + glowIntensity * 6;
    ctx.fillStyle = 'rgba(10,16,32,0.85)';
    if (this.game._roundRect) {
      this.game._roundRect(ctx, gx - 2, gy0 - 2, gw + 4, gh + 4, 4);
    } else {
      ctx.beginPath();
      ctx.rect(gx - 2, gy0 - 2, gw + 4, gh + 4);
    }
    ctx.fill();

    // Main gauge background.
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(10,16,32,0.7)';
    if (this.game._roundRect) {
      this.game._roundRect(ctx, gx, gy0, gw, gh, 4);
    } else {
      ctx.beginPath();
      ctx.rect(gx, gy0, gw, gh);
    }
    ctx.fill();

    // Sweet-spot band with enhanced glow (0.85..1.15 of ideal).
    const bandY = gy0 + gh * (1 - 1.15 / 1.7), bandH = gh * ((1.15 - 0.85) / 1.7);
    ctx.fillStyle = 'rgba(124,255,178,0.35)';
    ctx.shadowColor = 'rgba(124,255,178,0.4)';
    ctx.shadowBlur = 6;
    ctx.fillRect(gx - 1, bandY - 1, gw + 2, bandH + 2);
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = 'rgba(124,255,178,0.25)';
    ctx.fillRect(gx, bandY, gw, bandH);

    // Gauge fill with color feedback and dynamic glow.
    const f = Math.max(0, Math.min(1, this.power / 1.7));
    const inBand = this.power >= 0.85 && this.power <= 1.15;
    const fillCol = inBand ? '#7CFFb2' : this.power > 1.15 ? '#ff5d3c' : '#39e6ff';
    const fillY = gy0 + gh * (1 - f);
    const fillH = gh * f;

    // Glow effect that intensifies in the sweet spot.
    ctx.shadowColor = fillCol;
    ctx.shadowBlur = inBand ? 12 : 8;
    ctx.fillStyle = fillCol;
    ctx.fillRect(gx, fillY, gw, fillH);

    // Highlight line on the fill for depth.
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(gx + 1, fillY + 1, 2, fillH - 2);

    ctx.restore();
  };

  // A softer "targeting lock" reticle for the AI's think-time: a ring that
  // eases inward on a slow loop plus four short corner ticks, tinted in the
  // AI's own skin colour. No crosshair/label/power gauge (those are about
  // teaching a human's flick and would be noise for a scripted throw) — this
  // is just enough to read WHERE the opponent is about to throw.
  Dart.prototype.drawAIReticle = function (ctx) {
    const p = { x: this.aimX, y: this.aimY };
    const g = this.game;
    const col = (this.skin && this.skin.color) || '#c46bff';
    const cyc = g.reduceMotion ? 0.5 : (g.time * 1.1) % 1;   // 0 -> 1 loop
    const rr = Math.max(5, 30 - cyc * 14);
    ctx.save();
    ctx.strokeStyle = col; ctx.lineWidth = 1.5;
    ctx.shadowColor = col; ctx.shadowBlur = 9;
    ctx.globalAlpha = 0.28 + 0.32 * (1 - cyc);
    ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, Math.PI * 2); ctx.stroke();
    // Four short corner ticks, fixed distance out — a "lock-on" frame.
    ctx.globalAlpha = 0.55;
    const tickR = 13, tickLen = 6;
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(p.x + Math.cos(a) * tickR, p.y + Math.sin(a) * tickR);
      ctx.lineTo(p.x + Math.cos(a) * (tickR + tickLen), p.y + Math.sin(a) * (tickR + tickLen));
      ctx.stroke();
    }
    ctx.restore();
  };

  // The dart in your hand: large in the foreground, tilted toward where you are
  // aiming, so a throw starts from something you can see (first-person feel).
  // Its tip sits on the flight's launch point, so release hands off seamlessly.
  Dart.prototype.drawHeld = function (ctx) {
    const g = this.game;
    if (g.state !== 'play' || this.isAI || (this.state !== 'ready' && this.state !== 'aiming')) return;
    const cur = g.players[g.current];
    if (!cur || cur.isAI) return;
    const tx = HAND_X(g), ty = HAND_Y(g);
    const ax = this.state === 'aiming' ? this.aimX : g.board.cx;
    const bob = g.reduceMotion ? 0 : Math.sin(g.time * 2.2) * 2.5;
    const lean = Util.clamp((ax - tx) / g.viewW, -0.5, 0.5) * 0.7;
    const gripped = this.state === 'aiming' ? 1 : 0;
    ctx.save();
    ctx.translate(tx, ty + bob);
    ctx.rotate(-Math.PI / 2 + lean);
    ctx.scale(0.7, 1);                       // pointing away from camera (matches the flight's first frame)
    g.sprites.drawDart(ctx, BASE_LEN * START_SCALE, cur.skin(), 0.4 + gripped * 0.6, cur.dartParts || this.parts);
    ctx.restore();
  };

  // The cosmetic dart flying toward the board: arcs up, CURLS to the side
  // (quadratic-Bézier hook), scales for depth, rolls on its axis, and the
  // flights flutter — the Darts-of-Fury "loop in" feel.
  Dart.prototype.drawFlight = function (ctx) {
    if (this.state !== 'flying') return;
    const k = this._ft / this._sim.T;
    const f = this._flightAt(k);
    const e = f.e, x = f.x, y = f.y;

    // Ends at the stuck dart's drawn length (40/46) so the dart doesn't pop in size on contact.
    const scale = Util.lerp(START_SCALE, STUCK_LEN / BASE_LEN, e);

    // Shadow converging on the impact point: as the dart closes in, a soft
    // dark ellipse tightens onto the exact landing spot — reads as depth.
    if (e > 0.4) {
      const sa = (e - 0.4) / 0.6;
      ctx.save();
      ctx.globalAlpha = sa * 0.34;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(this.landX + (1 - sa) * 10, this.landY + (1 - sa) * 16,
        15 * (1.7 - sa * 0.7), 8 * (1.7 - sa * 0.7), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Landing marker: a ring that tightens onto the exact scoring point as the dart
    // closes in — the strongest depth/aim cue, and it costs one thin stroke.
    if (e > 0.3 && !this.game.reduceMotion) {
      const m = (e - 0.3) / 0.7;
      ctx.save();
      ctx.strokeStyle = (this.skin && this.skin.color) || '#39e6ff';
      ctx.globalAlpha = 0.15 + 0.5 * m;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(this.landX, this.landY, 30 - 22 * m, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    // Motion trail: tapered solid-colour segments sampled along the arc (no
    // per-segment gradients, no shadowBlur — those dominated frame cost).
    const col = (this.skin && this.skin.color) || '#39e6ff';
    if (k > 0.05 && !this.game.reduceMotion) {
      const SEG = 7, SPAN = 0.26;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = col; ctx.lineCap = 'round';
      let px = x, py = y;
      for (let i = 1; i <= SEG; i++) {
        const q = this._flightAt(Math.max(0, k - SPAN * i / SEG));
        const u = 1 - i / (SEG + 1);                      // 1 at the dart -> 0 at the tail
        ctx.globalAlpha = 0.75 * u * (1 - e * 0.35);
        ctx.lineWidth = (1.5 + 6.5 * u) * scale;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(q.x, q.y); ctx.stroke();
        px = q.x; py = q.y;
      }
      // White-hot core down the middle of the trail, tapering with it.
      ctx.strokeStyle = '#ffffff';
      px = x; py = y;
      for (let i = 1; i <= SEG; i++) {
        const q = this._flightAt(Math.max(0, k - SPAN * i / SEG));
        const u = 1 - i / (SEG + 1);
        ctx.globalAlpha = 0.5 * u * (1 - e * 0.35);
        ctx.lineWidth = (0.6 + 1.8 * u) * scale;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(q.x, q.y); ctx.stroke();
        px = q.x; py = q.y;
      }
      // Soft halo on the dart itself (cached sprite, mid-flight).
      const h = 54 * scale * Math.sin(Math.min(1, k) * Math.PI);
      if (h > 2) {
        ctx.globalAlpha = 0.55;
        ctx.drawImage(KD.Particles.glowSprite(col), x - h / 2, y - h / 2, h, h);
      }
      ctx.restore();
    }

    // Orientation = the simulated travel direction, so the nose always points
    // the way the dart is moving (up-and-over, then down onto the board). The
    // path already lands nose-down, so the embed-pose match is only a gentle
    // tail-end settle over the last ~30%.
    let ang = Math.atan2(f.ty, f.tx);
    if (this._embedAng != null) {
      let d = this._embedAng - ang;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      ang += d * Util.smooth(Util.clamp((k - 0.7) / 0.3, 0, 1));
    }
    this._lastAng = ang;

    // Barrel roll about the long axis: a calm spin that scales with power and
    // eases flat on contact. Shallower squash than before so it reads as a roll,
    // not a flip.
    const powerMult = Math.max(0.7, Math.min(1.8, this._powf));
    const spin = (this._roll || 1) * (k * 4 * powerMult);   // ~2/3 of a turn: slow enough to follow
    const roll = Util.lerp(0.72 + 0.28 * Math.abs(Math.cos(spin)), 1, e * e);
    // Foreshortening: thrown away from the camera the dart starts pointing into the
    // screen (short) and comes side-on as it arcs over.
    const along = 0.7 + 0.3 * Util.smooth(Math.min(1, k * 1.6));

    // Tail flutter: a tiny shimmy that fades as it lands (flights "biting" air).
    const flutter = Math.sin(k * 26) * (1 - e) * 0.05;
    // Release wobble: the dart snakes about its line for the first third of the
    // flight and settles as it finds the air. Upgraded darts (this.steady < 1)
    // wobble less, so a better dart visibly flies truer.
    const wob = this.game.reduceMotion ? 0 : Math.sin(k * 46) * Math.pow(Math.max(0, 1 - k * 2.6), 2) * 0.16 * Math.max(0.3, 1 - (1 - (this.steady || 1)) * 6);

    // Afterimages on a hard flick: two faint ghosts a few frames behind.
    if (!this.game.reduceMotion && this._powf > 1.06 && k > 0.08) {
      for (let gi = 1; gi <= 2; gi++) {
        const q = this._flightAt(Math.max(0, k - 0.035 * gi));
        ctx.save();
        ctx.globalAlpha = 0.22 / gi;
        ctx.translate(q.x, q.y);
        ctx.rotate(Math.atan2(q.ty, q.tx));
        ctx.scale(along, roll);
        this.game.sprites.drawDart(ctx, BASE_LEN * scale, this.skin, k, this.parts);
        ctx.restore();
      }
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang + flutter + wob);
    ctx.scale(along, roll);
    this.game.sprites.drawDart(ctx, BASE_LEN * scale, this.skin, k, this.parts);
    ctx.restore();
  };

  // Shared with the game's THINK BOX crates (drawn and hit in the same space).
  Dart.BOARD_M = BOARD_M;
  Dart.CRATE_Z = OCHE - CRATE_D;
  Dart.depthScale = function (z) { return (OCHE + CAM_BACK) / (z + CAM_BACK); };
  Dart.FLIGHT_T = T_IDEAL;

  KD.Dart = Dart;
})(window.KD = window.KD || {});
