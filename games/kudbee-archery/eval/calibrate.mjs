// Star-target calibration for the Tour: median scores of casual / good / expert bots per level.
//   node calibrate.mjs [levels, e.g. 4,10]   (slow: ~25 s a level)
// Rule of thumb used: still targets ~6/7/4 under the medians, movers ~10/10/6, tiny faces just above the casual median.
// THINK BOX bots think like a player would: take the STAR BOX with the first arrow of an end, and wait until the
// shot they mean (leading a mover) will not run into a crate or a cart.
import { loadKAR } from './load.mjs';
const K = loadKAR(), C = K.CFG, only = process.argv[2] ? process.argv[2].split(',').map(Number) : null;
const SK = [['casual', 0.0034, 0.45], ['good', 0.0019, 0.22], ['expert', 0.0011, 0.10]];
// would a still-air-zeroed shot at (ax, ay) in wind w meet a crate (other than a STAR BOX)?
function walled(m, ax, ay, w) {
  const sol = K.Flight.solve(m.dist, ax, ay), r = K.Flight.run(m.dist - K.BOXZ, sol.yaw, sol.pitch, C.V0, w);
  if (!r.hit) return false;
  return m.boxes.some((b, i) => !b.star && !m.boxGone(i) && r.hit.x > b.x0 + m.boxOff(i, m.T + r.hit.t) - 0.03 && r.hit.x < b.x1 + m.boxOff(i, m.T + r.hit.t) + 0.03 && r.hit.y > b.y0 && r.hit.y < b.y1);
}
function play(lv, sig, read, seed) {
  const m = new K.Stage({ level: lv, seed }), rng = K.Util.rng(seed * 7 + 1);
  while (!m.over) {
    m.tick(0.8 + rng() * 2.5);
    let s;
    for (let tries = 0; tries < 40; tries++) {
      s = K.Bot.shot(m, rng, sig, read);
      const star = m.boxes && m.boxes.findIndex((b, i) => b.star && !m.boxGone(i));
      if (star >= 0 && m.arrowNo === 0) { const b = m.boxes[star], ew = m.wind * (1 + rng.gauss() * read); let ax = (b.x0 + b.x1) / 2; for (let i = 0; i < 3; i++) { const sol = K.Flight.solve(m.dist, ax, (b.y0 + b.y1) / 2), r = K.Flight.run(m.dist - K.BOXZ, sol.yaw, sol.pitch, C.V0, ew); if (!r.hit) break; ax -= r.hit.x - (b.x0 + b.x1) / 2; } s.aimX = ax; s.aimY = (b.y0 + b.y1) / 2; break; }
      if (m.offAt) {              // lead: aim where the boss will be when the arrow arrives (with timing error)
        for (let i = 0; i < 2; i++) { const sol = K.Flight.solve(m.dist, s.aimX, s.aimY), r = K.Flight.run(m.dist, sol.yaw, sol.pitch, C.V0, m.wind); if (!r.hit) break; const o = m.offAt(m.T + r.hit.t + rng.gauss() * sig * 12); s.aimX = s.aimX - (s.lx || 0) + o.x; s.aimY = s.aimY - (s.ly || 0) + o.y; s.lx = o.x; s.ly = o.y; }
      }
      if (!m.boxes || !walled(m, s.aimX, s.aimY, m.wind)) break;
      m.tick(0.1 + rng() * 0.05);  // not clear yet: wait a moment
    }
    m.shoot(s.aimX, s.aimY, s.sx, s.sy, 1);
  }
  return m.total(0);
}
for (let lv = 0; lv < K.TOUR.length; lv++) {
  if (only && !only.includes(lv)) continue;
  const L = K.TOUR[lv], out = SK.map(([n, sg, rd]) => { const a = Array.from({ length: 300 }, (_, i) => play(lv, sg, rd, i + 1)).sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; });
  console.log(String(lv).padStart(2), L.name.padEnd(15), 'max', L.ends * 30, 'median casual/good/expert', out.join(' / '), ' stars', L.stars.join('/'));
}
