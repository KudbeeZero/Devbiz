/* =====================================================================
 * Kudbee Voidrunner — Wingman tactics.js  (the agent's tactical brain)
 * ---------------------------------------------------------------------
 * A deterministic "expert-system" agent that reads a live run-state
 * snapshot (gameplay, /wingman worker edition) and returns ONE prioritized
 * tactical line for the player. It is an autonomous decision-maker that
 * evaluates the battlefield every few seconds and tells the pilot the
 * single highest-value move right now.
 *
 * Design notes:
 *  - Pure logic, no platform globals — runs identically in the Cloudflare
 *    Worker, the local Node `wrangler dev`, and unit tests.
 *  - Priority-ordered: it returns the single most important insight, not a
 *    wall of tips. Higher `urgency` → hotter readout in the UI.
 *  - Optionally, a Workers AI adapter (in worker.js) can sit BEHIND this
 *    engine; the deterministic brain always runs first as a reliable floor.
 *
 * Snapshot shape (from the client):
 *    distance, shields, maxShields, combo, bossActive, bossHp,
 *    chainReady (bool), rapidActive, tripleActive, afterburner,
 *    threatCount, rocksNear, sinceMilestone (km since last big event)
 * ===================================================================== */

export function evaluate(snap) {
  // Normalize defensively so every field is a safe number/bool.
  var S = snap || {};
  var dist = num(S.distance);
  var shields = num(S.shields);
  var maxShields = num(S.maxShields) || 5;
  var combo = num(S.combo);
  var bossActive = !!S.bossActive;
  var bossHp = num(S.bossHp);
  var chainReady = !!S.chainReady;
  var rapid = !!S.rapidActive;
  var triple = !!S.tripleActive;
  var afterburner = !!S.afterburner;
  var threats = num(S.threatCount);
  var rocksNear = num(S.rocksNear);
  var since = num(S.sinceMilestone);

  // Build a ranked list. Each candidate is { urgency: 0..1, text, col:hex }.
  var cands = [];

  // 1) LIFE-SAVING — highest priority.
  if (shields <= 1) {
    cands.push({
      urgency: 0.98,
      text: 'Integrity critical — hug a shield pickup, now!',
      col: '#39e6ff',
    });
  }
  if (rocksNear > 0 && shields <= 2 && !bossActive) {
    cands.push({
      urgency: 0.92,
      text: 'Rocks closing — bank wide, don\u2019t hold the line.',
      col: '#39e6ff',
    });
  }
  if (threats >= 4 && shields <= 2) {
    cands.push({
      urgency: 0.9,
      text: 'Enemy swarm incoming on damaged hull — pick orbits, not a dogfight.',
      col: '#ff5d3c',
    });
  }

  // 2) MOMENTUM / CHAIN — the player is hot; keep it alive.
  if (chainReady && !bossActive) {
    cands.push({
      urgency: 0.78,
      text: 'Chain beam ready — line up the whole field before you pull the trigger.',
      col: '#39ffe0',
    });
  }
  if (combo >= 8) {
    cands.push({
      urgency: 0.7,
      text: combo + '× chain roaring — don\u2019t get greedy, keep the rhythm.',
      col: '#ffd34d',
    });
  }
  if (combo >= 4 && combo < 8) {
    cands.push({
      urgency: 0.55,
      text: combo + '× combo — chain a pickup before it cools.',
      col: '#ffd34d',
    });
  }

  // 3) BOSS AWARENESS.
  if (bossActive) {
    if (bossHp > 0.6) {
      cands.push({ urgency: 0.72, text: 'Capital ship — break its volleys, plink the core when the gaps open.', col: '#ff5d3c' });
    } else if (bossHp > 0.3) {
      cands.push({ urgency: 0.82, text: 'Capital ship wearing down — floor it for the corefinisher.', col: '#ff5d3c' });
    } else {
      cands.push({ urgency: 0.9, text: 'Core exposed — center its fire, end it!', col: '#ff5d3c' });
    }
  }

  // 4) LOADOUT USAGE.
  if (rapid) cands.push({ urgency: 0.4, text: 'Rapid fire live — hold the trigger, volume is king.', col: '#ffd34d' });
  if (triple) cands.push({ urgency: 0.42, text: 'Triple shot active — spread down the barrel at clusters.', col: '#7CFFb2' });
  if (afterburner) cands.push({ urgency: 0.5, text: 'Afterburner burning — break contact, then re-engage clean.', col: '#ffffff' });

  // 5) PROGRESS / ENCOURAGEMENT — when nothing urgent, coach + hype.
  if (since > 120) {
    cands.push({
      urgency: 0.22,
      text: 'Quiet stretch at ' + Math.round(dist) + ' km — save the boost for the belt ahead.',
      col: '#7c8aa0',
    });
  } else if (dist > 0 && dist < 400) {
    cands.push({ urgency: 0.2, text: 'Into the belt — steady hands, Simurgh\u2019s watching your six.', col: '#7c8aa0' });
  } else {
    cands.push({ urgency: 0.18, text: 'Locked on. Keep the throttle hot, pilot.', col: '#7c8aa0' });
  }

  // Return the single highest-urgency line (ties → first stable candidate).
  cands.sort(function (a, b) { return b.urgency - a.urgency; });
  return {
    text: cands[0].text,
    col: cands[0].col,
    urgency: cands[0].urgency,
    // A machine-readable key so the client can react (pulse the gauge, etc.)
    kind: keyFor(cands[0].col),
  };
}

function keyFor(col) {
  switch (col) {
    case '#39e6ff': return 'danger';
    case '#ff5d3c': return 'boss';
    case '#39ffe0': return 'chain';
    case '#ffd34d': return 'momentum';
    case '#7CFFb2': return 'powerup';
    case '#ffffff': return 'boost';
    default: return 'coach';
  }
}

function num(v) {
  var n = typeof v === 'number' ? v : parseFloat(v);
  return isFinite(n) ? n : 0;
}

// Nice-to-have for tests / dev server.
export function describe() { return 'simurgh-wingman-tactical-v1'; }
