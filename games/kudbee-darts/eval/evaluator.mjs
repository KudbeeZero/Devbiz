// Kudbee Darts evaluator — scoring rules, board geometry, AI tiers, and the real
// flick-throw -> flight -> impact path, driven frame-by-frame in headless Chromium.
// Run: node games/kudbee-darts/eval/evaluator.mjs   (or: npm run darts:eval)
// Screenshots land in $DARTS_SHOTS (default: eval/out, untracked).
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL = process.env.DARTS_URL || ('file://' + resolve(HERE, '..', 'index.html'));
const OUT = process.env.DARTS_SHOTS || resolve(HERE, 'out');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const R = [];
const rec = (id, pass, note) => { R.push({ id, pass, note }); console.log(pass ? 'PASS' : 'FAIL', id, '—', note); };

const launchOpts = { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'] };
if (existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOpts);
const page = await browser.newPage({ viewport: { width: 960, height: 720 }, deviceScaleFactor: 2 });

const pageErrors = [], consoleErrs = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (!/Failed to load resource|ERR_|fonts\.g|net::|file:\/\/\/api\/|URL scheme "file" is not supported|manifest/.test(t)) consoleErrs.push(t);
});

// Virtual clock: input timestamps (flick speed) come from performance.now, so make it
// advance only when the harness steps a frame — no wall-clock/screenshot-latency noise.
await page.addInitScript(() => { window.__vt = 1000; window.__realNow = performance.now.bind(performance);
  let a = 0x2f6e2b1; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; performance.now = () => window.__vt; });
await page.goto(URL, { waitUntil: 'load', timeout: 15000 });
await sleep(500);
rec('loads', pageErrors.length === 0, pageErrors.length ? pageErrors[0] : 'no page errors');
rec('hook', await page.evaluate(() => !!(window.DARTS && window.DARTS.board)), 'window.DARTS present');

// Take over the clock: stop the rAF loop and step update+render by hand so every
// frame (and every screenshot) is deterministic.
await page.evaluate(() => {
  const g = window.DARTS;
  g.loop.stop();
  window.__step = (n) => { for (let i = 0; i < (n || 1); i++) { window.__vt += 1000 / 60; g._update(1 / 60); g._render(); } };
  window.__step(2);
});
const step = (n) => page.evaluate((k) => window.__step(k), n);

// ---------------------------------------------------------------- studio intro
const intro = await page.evaluate(() => {
  const g = window.DARTS, out = { first: g.state };
  window.__step(90); out.mid = g.state;                      // 1.5s in: still on the card
  window.__step(150); out.after = g.state;                   // 4s in: on to the menu
  g.state = 'intro'; g.introT = 1; g.input.pointer.justDown = true; g._updateIntro(0); out.skip = g.state;
  g.state = 'menu'; window.__step(2);
  return out;
});
rec('studio-intro', intro.first === 'intro' && intro.mid === 'intro' && intro.after === 'menu' && intro.skip === 'menu',
  `opens on KUDBEE STUDIOS (${intro.first}), still there at 1.5s (${intro.mid}), menu by 4s (${intro.after}), tap skips (${intro.skip})`);

// ---------------------------------------------------------------- board
const board = await page.evaluate(() => {
  const g = window.DARTS, b = g.board;
  const hit = (label) => { const p = b.targetPoint(label); const h = b.hitTest(p.x, p.y); return { label, score: h.score, ring: h.ring }; };
  const labels = ['BULL', '25', 'T20', 'D20', '20', 'T19', 'D16', 'T1', 'D1', '3', '11'];
  const res = labels.map(hit);
  // wedge order clockwise from the top: 20 1 18 4 13 6 10 15 2 17 3 19 7 16 8 11 14 9 12 5
  const order = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
  const bad = [];
  order.forEach((v, i) => {
    const a = i * 18 * Math.PI / 180, r = b.Rpx * 0.75;
    const h = b.hitTest(b.cx + Math.sin(a) * r, b.cy - Math.cos(a) * r);
    if (h.value !== v) bad.push(v + '!=' + h.value);
  });
  const far = b.hitTest(b.cx + b.Rpx * 1.5, b.cy);
  return { res, bad, farRing: far.ring };
});
const exp = { BULL: [50, 'inbull'], 25: [25, 'outbull'], T20: [60, 'treble'], D20: [40, 'double'], 20: [20, 'single'], T19: [57, 'treble'], D16: [32, 'double'], T1: [3, 'treble'], D1: [2, 'double'], 3: [3, 'single'], 11: [11, 'single'] };
const boardBad = board.res.filter((h) => !exp[h.label] || h.score !== exp[h.label][0] || h.ring !== exp[h.label][1]);
rec('board-targets', boardBad.length === 0, boardBad.length ? JSON.stringify(boardBad) : board.res.length + ' targetPoint labels hit-test to the right score/ring');
rec('board-wedge-order', board.bad.length === 0 && board.farRing === 'miss', board.bad.length ? board.bad.join(',') : '20 wedges clockwise-correct; off-board = miss');

// ---------------------------------------------------------------- 501 rules
const x01 = await page.evaluate(() => {
  const M = KD.Mode_X01, out = {};
  const h = (score, ring) => ({ score, ring });
  const mk = (rem) => { const m = new M(501), p = {}; m.initPlayer(p); p.scoreState.remaining = rem; m.beginTurn(p); return { m, p }; };
  let t = mk(100); out.normal = t.m.applyDart(t.p, h(20, 'single')).scored === 20 && t.p.scoreState.remaining === 80;
  t = mk(40); out.checkoutD20 = !!t.m.applyDart(t.p, h(40, 'double')).win && t.p.scoreState.remaining === 0;
  t = mk(50); out.checkoutBull = !!t.m.applyDart(t.p, h(50, 'inbull')).win;
  t = mk(40); let r = t.m.applyDart(t.p, h(40, 'treble')); out.zeroNeedsDouble = !!r.bust && t.p.scoreState.remaining === 40;
  t = mk(32); r = t.m.applyDart(t.p, h(31, 'single')); out.leaveOneBusts = !!r.bust;
  t = mk(30); r = t.m.applyDart(t.p, h(60, 'treble')); out.belowZeroBusts = !!r.bust;
  t = mk(100); t.m.applyDart(t.p, h(20, 'single')); t.m.applyDart(t.p, h(20, 'single')); r = t.m.applyDart(t.p, h(70, 'treble'));
  out.bustRevertsWholeTurn = !!r.bust && t.p.scoreState.remaining === 100;
  out.route170 = (KD.Mode_X01.checkoutRoute(170, 3) || []).join(' ');
  out.route40 = (KD.Mode_X01.checkoutRoute(40, 1) || []).join(' ');
  out.route169 = KD.Mode_X01.checkoutRoute(169, 3);
  return out;
});
const x01Bad = ['normal', 'checkoutD20', 'checkoutBull', 'zeroNeedsDouble', 'leaveOneBusts', 'belowZeroBusts', 'bustRevertsWholeTurn'].filter((k) => !x01[k]);
rec('x01-rules', x01Bad.length === 0, x01Bad.length ? 'failed: ' + x01Bad.join(',') : 'checkout on D/bull, bust on <0 / 1 / single-zero, bust reverts the turn');
rec('x01-checkout-routes', x01.route170 === 'T20 T20 BULL' && x01.route40 === 'D20' && x01.route169 === null, `170 -> ${x01.route170}; 40 -> ${x01.route40}; 169 -> ${x01.route169}`);

// ---------------------------------------------------------------- cricket
const cricket = await page.evaluate(() => {
  const m = new KD.Mode_Cricket(), a = {}, b = {};
  m.initPlayer(a); m.initPlayer(b); m.beginTurn(a);
  const hit = (v, ring) => ({ score: v * (ring === 'treble' ? 3 : ring === 'double' ? 2 : 1), ring, value: v, mult: ring === 'treble' ? 3 : ring === 'double' ? 2 : 1, label: '' + v });
  const r1 = m.applyDart(a, hit(20, 'treble'), b);
  const r2 = m.applyDart(a, hit(20, 'single'), b);      // closed + opp open -> scores 20
  const r3 = m.applyDart(a, hit(10, 'single'), b);      // 10 is not a cricket number
  return { ok: r1.marksGained === 3 && r2.scored === 20 && r3.scored === 0 && !r1.win, r1, r2, r3 };
});
rec('cricket-rules', cricket.ok, `treble-20 = ${cricket.r1.marksGained} marks, extra 20 on a closed number scores ${cricket.r2.scored}, non-cricket number scores ${cricket.r3.scored}`);

// ---------------------------------------------------------------- AI tiers
const tiers = await page.evaluate(() => {
  const g = window.DARTS, b = g.board, out = {};
  const tgt = b.targetPoint('T20');
  ['Rookie', 'Pro', 'Legend'].forEach((tier) => {
    const ai = new KD.AIPlayer(tier, tier, 'violet');
    let sum = 0, t20 = 0, n = 600;
    for (let i = 0; i < n; i++) {
      g.dart.setAI(tgt.x, tgt.y, ai.sigma);
      const r = g.dart.release();
      sum += Math.hypot(g.dart.landX - tgt.x, g.dart.landY - tgt.y) / b.Rpx;
      if (r.ring === 'treble' && r.value === 20) t20++;
      g.dart.reset();
    }
    out[tier] = { meanErr: +(sum / n).toFixed(3), t20: +(t20 / n).toFixed(3) };
  });
  return out;
});
rec('ai-tier-ordering', tiers.Rookie.meanErr > tiers.Pro.meanErr && tiers.Pro.meanErr > tiers.Legend.meanErr && tiers.Legend.t20 > tiers.Rookie.t20,
  `mean miss (board radii): Rookie ${tiers.Rookie.meanErr} > Pro ${tiers.Pro.meanErr} > Legend ${tiers.Legend.meanErr}; T20 rate ${tiers.Rookie.t20}/${tiers.Pro.t20}/${tiers.Legend.t20}`);

// ---------------------------------------------------------------- 301 mode
const m301 = await page.evaluate(() => {
  const g = window.DARTS; g.selMode = 'x301'; g.selOpp = 'hotseat'; g._startMatch(); window.__step(2);
  const out = { label: g.mode.label, start: g.players[0].scoreState.remaining, id: g.mode.id, btns: g._menuLayout().filter((b) => b.group === 'mode').map((b) => b.label) };
  g.selMode = 'x01'; return out;
});
rec('mode-301', m301.start === 301 && m301.label === '301' && m301.id === 'x01' && m301.btns.join() === '301,501,CRICKET', `301 match starts at ${m301.start} (label ${m301.label}); mode buttons: ${m301.btns.join(' / ')}`);

// ---------------------------------------------------------------- real throw
await page.evaluate(() => { const g = window.DARTS; Math.random = Math.random;  g.selMode = 'x01'; g.selOpp = 'hotseat'; g._startMatch(); window.__step(120); });
rec('match-starts', (await page.evaluate(() => window.DARTS.state)) === 'play', 'state=play after _startMatch');
await page.screenshot({ path: OUT + '/01-play.png' });

const canvasBox = await page.evaluate(() => { const r = document.getElementById('game').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
const toPx = (lx, ly) => ({ x: canvasBox.x + (lx / 960) * canvasBox.w, y: canvasBox.y + (ly / 720) * canvasBox.h });

// Aim at the treble 20, press, drag a clean flick upward, release.
const t20 = await page.evaluate(() => window.DARTS.board.targetPoint('T20'));
const start = toPx(t20.x, t20.y + 150), end = toPx(t20.x, t20.y);
await page.evaluate(() => { const g = window.DARTS; window.__lens = []; let inFlight = false, inStuck = false; window.__stuckLens = []; const dd = g.sprites.drawDart.bind(g.sprites); g.sprites.drawDart = function (ctx, len) { if (inFlight) window.__lens.push(len); if (inStuck) window.__stuckLens.push(len); return dd.apply(null, arguments); }; const ds = g.sprites.drawStuckDart.bind(g.sprites); g.sprites.drawStuckDart = function () { inStuck = true; try { return ds.apply(null, arguments); } finally { inStuck = false; } }; const df = g.dart.drawFlight.bind(g.dart); g.dart.drawFlight = function () { inFlight = true; try { return df.apply(null, arguments); } finally { inFlight = false; } }; });
await page.evaluate(() => { const g = window.DARTS, o = g.dart.release.bind(g.dart); g.dart.release = function () { const p = g.input.pointer; window.__rel = { relSpeed: Math.round(p.relSpeed), swipeLen: Math.round(p.swipeLen), isAI: g.dart.isAI }; return o(); }; });
await page.mouse.move(start.x, start.y);
await page.mouse.down(); await step(2);
await page.screenshot({ path: OUT + '/02-aiming.png' });
const N = 8;
for (let i = 1; i <= N; i++) {
  await page.mouse.move(start.x + (end.x - start.x) * i / N, start.y + (end.y - start.y) * i / N);
  await step(1);
}
const aimInfo = await page.evaluate(() => ({ state: window.DARTS.dart.state, power: +window.DARTS.dart.power.toFixed(2) }));
await page.screenshot({ path: OUT + '/03-aim-power.png' });
await page.mouse.up(); await step(1);
const thrown = await page.evaluate(() => ({ rel: window.__rel, state: window.DARTS.dart.state, powf: window.DARTS.dart._powf, res: window.DARTS.dart.result && window.DARTS.dart.result.label }));
rec('flick-throws', thrown.state === 'flying', `release=${JSON.stringify(thrown.rel)}; aiming state=${aimInfo.state} power=${aimInfo.power}; after release dart=${thrown.state}, powf=${(thrown.powf || 0).toFixed(2)}, lands on ${thrown.res}`);

// ---- Flick auto-calibration: the power band re-centers on each player ----
// Two players flick at very different speeds (slow trackpad drag vs fast phone
// swipe). Feed each a run of consistent flicks and check the learned ideal moves
// toward their own speed, so their typical throw sits in the sweet spot (powf in
// 0.85..1.15) — not stuck reading TOO SOFT / TOO HARD against a fixed 1500.
const cal = await page.evaluate(() => {
  const g = window.DARTS, prog = g.progression;
  const snap = JSON.parse(JSON.stringify(prog.data.flick));   // restore after, don't pollute later checks
  const run = (speed, throws) => {
    prog.data.flick = { ideal: 1500, n: 0, recent: [] };       // fresh player
    let last;
    for (let i = 0; i < throws; i++) last = prog.recordFlick(speed);
    return { ideal: Math.round(prog.flickIdeal()), powf: +(speed / prog.flickIdeal()).toFixed(2), justCal: last.justCalibrated };
  };
  const slow = run(820, 6);     // a gentle, short-swipe player
  const fast = run(2300, 6);    // a hard, fast-swipe player
  const one = run(820, 1);      // after a single throw it must NOT be fully centered yet
  prog.data.flick = snap; prog.save();
  const inBand = (p) => p >= 0.85 && p <= 1.15;
  return { slow, fast, one, ok: inBand(slow.powf) && inBand(fast.powf) && slow.ideal < 1100 && fast.ideal > 1900 && one.ideal > 820 && one.ideal < 1500 };
});
rec('flick-autocalibrate', cal.ok,
  `slow player (820px/s) -> ideal ${cal.slow.ideal}, powf ${cal.slow.powf}; fast player (2300) -> ideal ${cal.fast.ideal}, powf ${cal.fast.powf}; after 1 throw ideal ${cal.one.ideal} (not yet centered)`);

// Walk the flight frame by frame, capturing frames + render timings.
const FT = 0.42;
const shots = { 0.12: '04a-flight.png', 0.35: '04-flight-early.png', 0.55: '04b-flight.png', 0.7: '05-flight-mid.png', 0.85: '04c-flight.png', 0.95: '06-flight-late.png' };
const clips = [];
const frameMs = [];
let nextShot = Object.keys(shots).map(Number).sort();
for (let i = 0; i < 40; i++) {
  const st = await page.evaluate(() => {
    const g = window.DARTS, t0 = window.__realNow(); window.__vt += 1000 / 60; g._update(1 / 60); g._render();
    return { ms: window.__realNow() - t0, state: g.dart.state, k: g.dart._ft / 0.42, game: g.state };
  });
  if (st.state === 'flying') frameMs.push(st.ms);
  if (nextShot.length && st.state === 'flying' && st.k >= nextShot[0]) { clips.push((await page.screenshot({ clip: { x: 340, y: 90, width: 280, height: 440 } })).toString('base64')); await page.screenshot({ path: OUT + '/' + shots[nextShot[0]] }); nextShot.shift(); }
  if (st.state !== 'flying') break;
}
const lensFlight = await page.evaluate(() => window.__lens.slice());
const flown = await page.evaluate(() => { const g = window.DARTS; return { dartsThisTurn: g.dartsThisTurn, stuck: g.stuckDarts.length, bounce: g.bounceDarts.length, particles: g.particles.pool.active ? g.particles.pool.active.length : null }; });
// Depth continuity: the last in-flight draw must match the stuck dart's drawn size, or the dart pops on landing.
await step(2);
const stuckLen = (await page.evaluate(() => window.__stuckLens[0])) || 0;
const lastFlightLen = lensFlight.length ? lensFlight[lensFlight.length - 1] : 0;
rec('flight-size-continuity', stuckLen >= 60 && Math.abs(lastFlightLen - stuckLen) <= 0.1 * stuckLen && lensFlight[0] > lastFlightLen, `first flight len ${lensFlight[0] && lensFlight[0].toFixed(1)} -> last ${lastFlightLen.toFixed(1)} vs stuck ${stuckLen} (was 40, then 48)`);
rec('flight-shots', nextShot.length === 0, nextShot.length ? 'missed capture points ' + nextShot.join(',') : 'captured early/mid/late flight frames');
rec('dart-lands', flown.dartsThisTurn === 1 && (flown.stuck + flown.bounce) === 1, `dartsThisTurn=${flown.dartsThisTurn} stuck=${flown.stuck} bounce=${flown.bounce}`);
// Pose: darts enter nose-down, so the flights sit ABOVE the tip (tip angle in the lower half-plane),
// and the in-flight angle has already pitched to the embedded pose by the last frame (no flip on contact).
const pose = await page.evaluate(() => { const g = window.DARTS, d = g.stuckDarts[0]; const diff = Math.atan2(Math.sin(g.dart._lastAng - d.ang), Math.cos(g.dart._lastAng - d.ang)); return { ang: d.ang, tailUp: Math.sin(d.ang), diff }; /* canvas y is down: tip pointing down (sin>0) means the tail is up */ });
rec('flights-above-tip', pose.tailUp > 0.7, `stuck tip angle ${pose.ang.toFixed(2)} rad -> tip points down ${(pose.tailUp * 100).toFixed(0)}%, so the flights are above the tip`);
rec('embed-pose-continuity', Math.abs(pose.diff) < 0.12, `last flight frame vs stuck pose differ by ${pose.diff.toFixed(3)} rad`);
await page.screenshot({ path: OUT + '/07-impact.png' });
const impactMs = [];
for (let i = 0; i < 12; i++) {
  impactMs.push(await page.evaluate(() => { const t0 = window.__realNow(); window.__vt += 1000 / 60; window.DARTS._update(1 / 60); window.DARTS._render(); return window.__realNow() - t0; }));
  if (i === 5) await page.screenshot({ path: OUT + '/08-impact-after.png' });
}
await step(60);
await page.screenshot({ path: OUT + '/09-settled.png' });

const avg = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
const mx = (a) => a.reduce((s, v) => Math.max(s, v), 0);
const perf = { flightAvg: avg(frameMs), flightMax: mx(frameMs), impactAvg: avg(impactMs), impactMax: mx(impactMs) };
console.log('  frame cost (update+render, software-rendered headless, not a device FPS): ' + JSON.stringify(Object.fromEntries(Object.entries(perf).map(([k, v]) => [k, +v.toFixed(2) + 'ms']))));
rec('frame-cost-sane', perf.flightAvg < 33 && perf.impactAvg < 33, `flight avg ${perf.flightAvg.toFixed(1)}ms (max ${perf.flightMax.toFixed(1)}), impact avg ${perf.impactAvg.toFixed(1)}ms (max ${perf.impactMax.toFixed(1)}) — headless software canvas, relative only`);

if (clips.length) {
  const sheet = await browser.newPage({ viewport: { width: 280 * clips.length, height: 440 } });
  await sheet.setContent('<body style="margin:0;display:flex;background:#000">' + clips.map((c) => '<img width=280 height=440 src="data:image/png;base64,' + c + '">').join('') + '</body>');
  await sheet.screenshot({ path: OUT + '/flight-sheet.png' });
  await sheet.close();
}
// ---------------------------------------------------------------- board theme (neon <-> pub)
await page.evaluate(() => { const g = window.DARTS; g.state = 'menu'; window.__step(2); });
await page.screenshot({ path: OUT + '/10-menu-neon.png' });
const themeBtn = await page.evaluate(() => { const b = window.DARTS._menuLayout().find((x) => x.group === 'theme'); return b && { x: b.x + b.w / 2, y: b.y + b.h / 2, label: b.label }; });
const pt = themeBtn ? toPx(themeBtn.x, themeBtn.y) : { x: 0, y: 0 };
await page.mouse.move(pt.x, pt.y); await page.mouse.down(); await step(2); await page.mouse.up(); await step(2);
const themed = await page.evaluate(() => {
  const g = window.DARTS, b = g.board;
  const px = (name) => {
    const tp = b.targetPoint('T20'), c = b._baked.getContext('2d');
    const d = c.getImageData(Math.round(b._bakeCx + tp.x - b.cx), Math.round(b._bakeCy + tp.y - b.cy), 1, 1).data;
    return [d[0], d[1], d[2]];
  };
  const pub = { name: b.themeName, pixel: px(), label: g._menuLayout().find((x) => x.group === 'theme').label };
  const saved = Object.keys(localStorage).map((k) => localStorage.getItem(k)).filter((v) => /boardTheme/.test(v || ''))[0] || '';
  const probes = [[0, 0], [30, -100], [-90, 60], [200, 10], [10, 230], [0, -120]];
  const sig = () => probes.map((p) => { const h = b.hitTest(b.cx + p[0], b.cy + p[1]); return h.score + h.ring; }).join('|');
  const sigPub = sig();
  g._toggleBoardTheme();
  const neon = { name: b.themeName, pixel: px() };
  const sigNeon = sig();
  g._toggleBoardTheme();   // leave it on pub for the screenshots
  return { pub, neon, savedPub: /"boardTheme":"pub"/.test(saved), sameGeometry: sigPub === sigNeon };
});
const isRed = (p) => p[0] > 150 && p[1] < 80 && p[2] < 90, isCyan = (p) => p[2] > 200 && p[1] > 180 && p[0] < 120;
rec('board-theme', !!themeBtn && themed.pub.name === 'pub' && themed.pub.label === 'BOARD: PUB' && themed.savedPub && isRed(themed.pub.pixel) && themed.neon.name === 'neon' && isCyan(themed.neon.pixel) && themed.sameGeometry,
  `menu click -> ${themed.pub.name} (${themed.pub.label}), saved=${themed.savedPub}; T20 treble pixel pub ${themed.pub.pixel} / neon ${themed.neon.pixel}; hit-test identical across themes=${themed.sameGeometry}`);
await page.screenshot({ path: OUT + '/11-menu-pub.png' });
await page.evaluate(() => { const g = window.DARTS; g.selOpp = 'hotseat'; g._startMatch(); window.__step(60); });
await page.screenshot({ path: OUT + '/12-pub-play.png' });
await page.evaluate(() => {   // land two darts on the pub board (treble 20, then bull) to eyeball flash/contrast
  const g = window.DARTS;
  ['T20', 'BULL'].forEach((t) => { const p = g.board.targetPoint(t); g.dart.setAI(p.x, p.y, 0.001); g.dart.skin = g.players[0].skin(); g.dart.release(); for (let i = 0; i < 60 && g.dart.state === 'flying'; i++) window.__step(1); window.__step(4); });
});
await page.screenshot({ path: OUT + '/13-pub-impact.png' });


// ---------------------------------------------------------------- dart gallery (visual review)
await page.evaluate(() => {
  const cv = document.createElement('canvas'); cv.id = '__gallery'; cv.width = 960; cv.height = 720;
  cv.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;width:960px;height:720px';
  document.body.appendChild(cv);
  const c = cv.getContext('2d'), sp = window.DARTS.sprites, S = KD.Sprites;
  c.fillStyle = '#0b0f1e'; c.fillRect(0, 0, 960, 360); c.fillStyle = '#efe2c0'; c.fillRect(0, 360, 960, 360);
  const skins = Object.keys(S.SKINS);
  skins.forEach((k, i) => { c.save(); c.translate(330, 36 + i * 70 + 10); sp.drawDart(c, 190, S.SKINS[k], 0.4, { tip: 'steel', flight: 'standard' }); c.restore(); });
  const tips = Object.keys(S.TIPS), fls = Object.keys(S.FLIGHTS);
  fls.forEach((f, i) => { c.save(); c.translate(820, 40 + i * 56); sp.drawDart(c, 190, S.SKINS.violet, 0.2, { tip: tips[i % tips.length], flight: f }); c.restore(); });
  skins.forEach((k, i) => { c.save(); c.translate(330, 400 + i * 62); sp.drawDart(c, 190, S.SKINS[k], 0, { tip: 'steel', flight: 'kite' }); c.restore(); });
  [48, 40, 64].forEach((L, i) => { c.save(); c.translate(480 + i * 150, 600); c.rotate(-0.6); sp.drawDart(c, L, S.SKINS.cyan, 0, { tip: 'steel', flight: 'standard' }); c.restore(); });
});
await page.screenshot({ path: OUT + '/14-dart-gallery.png', clip: { x: 0, y: 0, width: 960, height: 720 } });
await page.evaluate(() => document.getElementById('__gallery').remove());

// ---------------------------------------------------------------- share card (SEO / social)
{
  const html = readFileSync(resolve(HERE, '..', 'index.html'), 'utf8');
  const meta = (attr, name) => { const m = html.match(new RegExp('<meta[^>]+' + attr + '="' + name + '"[^>]+content="([^"]*)"', 'i')); return m && m[1]; };
  const og = meta('property', 'og:image'), tw = meta('name', 'twitter:image'), card = meta('name', 'twitter:card');
  let dims = null, bytes = 0;
  if (og) {
    const f = resolve(HERE, '..', '..', '..', 'assets', 'og', (og.split('/').pop() || '').split('?')[0]);
    if (existsSync(f)) {
      const b = readFileSync(f); bytes = b.length;
      for (let i = 2; i < b.length - 9;) { if (b[i] !== 0xff) { i++; continue; } const mk = b[i + 1]; if (mk >= 0xc0 && mk <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(mk)) { dims = { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) }; break; } i += 2 + b.readUInt16BE(i + 2); }
    }
  }
  const ok = !!og && /^https:\/\//.test(og) && og === tw && card === 'summary_large_image' && !!dims && dims.w === 1200 && dims.h === 630 && bytes < 300 * 1024
    && !!meta('property', 'og:title') && !!meta('property', 'og:description') && !!meta('property', 'og:url');
  rec('share-card', ok, `og:image=${og} twitter:image matches=${og === tw} card=${card} file=${dims ? dims.w + 'x' + dims.h : 'missing'} ${(bytes / 1024).toFixed(0)}KB`);
}
// ---------------------------------------------------------------- Darts Birds campaign
{
  const camp = await page.evaluate(() => {
    const g = window.DARTS, C = window.KD.Campaign, out = {};
    out.count = C.LEVELS.length;
    out.bosses = C.LEVELS.map((l, i) => (l.boss ? i : -1)).filter((i) => i >= 0);
    out.stars = [C.starsFor(C.LEVELS[0], C.LEVELS[0].par), C.starsFor(C.LEVELS[0], C.LEVELS[0].par + 6), C.starsFor(C.LEVELS[0], C.LEVELS[0].par + 7)];
    // Fresh campaign save for the flow checks.
    g.progression.data.campaign = { stars: [] };
    g.progression.save();
    g.state = 'menu'; g._openLevels(); out.mapState = g.state; out.mapWorld = g.mapWorld;
    out.layoutTiles = g._levelsLayout().filter((b) => b.group === 'level').length;
    out.lockedStart = g._playLevel(5) === undefined && g.levelIdx === null && g.state === 'levels';
    g.state = 'menu';
    g._playLevel(0); out.started = g.state === 'play' && g.levelIdx === 0 && g.mode.id === 'x01';
    g.players[0].dartsThrown = 18; g._matchWin(g.players[0]);
    out.won = { state: g.state, stars: g.matchResult.level.stars, next: g.matchResult.level.next, saved: g.progression.campaignStars(0), unlock1: g.progression.campaignUnlocked(1), unlock2: g.progression.campaignUnlocked(2) };
    out.btns = g._matchButtons().map((b) => b.id).join();
    g._onMatchButton('share');
    out.share = /Level 1 .* in 18 darts in Kudbee Darts/.test(g.shareText || '') && /https:\/\/devbiz\.kudbee\.workers\.dev\/games\/kudbee-darts\//.test(g.shareText || '');
    g.matchOverTimer = 0; g._onMatchButton('next');
    out.nextStarted = g.state === 'play' && g.levelIdx === 1;
    // A loss earns nothing and keeps the best earned before.
    g.players[0].dartsThrown = 40; g._matchWin(g.players[1]);
    out.lossKeeps = g.progression.campaignStars(0) === 3 && g.matchResult.level.stars === 0;
    // Corrupt saves are cleaned on load and cut to the level count.
    const key = 'kd.profile.v1', prev = localStorage.getItem(key);
    localStorage.setItem(key, JSON.stringify({ version: 1, campaign: { stars: [9, 'x', 2, 1.5] } }));
    const fresh = new window.KD.Progression();
    out.clean = fresh.data.campaign.stars.length === C.LEVELS.length && fresh.data.campaign.stars.slice(0, 4).join() === '0,0,2,0';
    if (prev === null) localStorage.removeItem(key); else localStorage.setItem(key, prev);
    g.progression.data.campaign = { stars: [] }; g.progression.save(); g.levelIdx = null; g.state = 'menu';
    return out;
  });
  const campOk = camp.count === 30 && JSON.stringify(camp.bosses) === '[4,9,14,19,24,29]' && JSON.stringify(camp.stars) === '[3,2,1]'
    && camp.mapState === 'levels' && camp.mapWorld === 0 && camp.layoutTiles === 5 && camp.lockedStart && camp.started
    && camp.won.state === 'matchOver' && camp.won.stars === 3 && camp.won.next === 1 && camp.won.saved === 3 && camp.won.unlock1 && !camp.won.unlock2
    && camp.nextStarted && camp.lossKeeps && camp.clean && camp.btns === 'next,retry,levels,share' && camp.share;
  rec('darts-birds-campaign', campOk, `levels=${camp.count} bosses=${camp.bosses} stars=${camp.stars} map=${camp.mapState}/w${camp.mapWorld} tiles=${camp.layoutTiles} locked=${camp.lockedStart} flow=${camp.won.state}/${camp.won.stars}★ next=${camp.nextStarted} loss=${camp.lossKeeps} clean=${camp.clean} buttons=${camp.btns} share=${camp.share}`);
  await page.evaluate(() => window.__step(2));
  await page.evaluate(() => { const g = window.DARTS; g.state = 'levels'; g.mapWorld = 0; window.__step(3); });
  const mapPx = await page.evaluate(() => { const c = document.getElementById('game'); const d = c.getContext('2d').getImageData(480, 20, 1, 1).data; return { r: d[0], g: d[1], b: d[2] }; });
  await page.screenshot({ path: resolve(OUT, 'darts-birds-map.png') });
  rec('darts-birds-map-render', mapPx.b > 20 && mapPx.r < 120, `top-centre pixel rgb(${mapPx.r},${mapPx.g},${mapPx.b}) (night sky, drawn not blank)`);
  // A campaign match plays in its world's scenery (World 1: dawn sky), not the neon stage.
  const playPx = await page.evaluate(() => {
    const g = window.DARTS; g.levelIdx = 0; g._startMatch(); window.__step(3);
    const d = document.getElementById('game').getContext('2d').getImageData(8, 700, 1, 1).data;
    const out = { r: d[0], g: d[1], b: d[2], state: g.state };
    g.levelIdx = null; g.state = 'menu'; window.__step(2);
    return out;
  });
  rec('darts-birds-world-scene', playPx.state === 'play' && playPx.r > 12 && playPx.b > playPx.g, `campaign match bottom-left rgb(${playPx.r},${playPx.g},${playPx.b}) (dawn hills, not the neon floor)`);
  await page.evaluate(() => { const g = window.DARTS; g.state = 'menu'; window.__step(2); });
}
// ---------------------------------------------------------------- THINK BOX (crates)
// A side world of crate levels: it opens from the World 1 boss, NEXT LEVEL never
// leads into it, an ideal flick at a crate sticks in the wood and scores nothing,
// a clear bed still scores, a sliding crate moves (and carries its darts), and
// the AI aims around crates.
{
  const tb = await page.evaluate(() => {
    const g = window.DARTS, C = window.KD.Campaign, prog = g.progression, out = {};
    const first = C.LEVELS.findIndex((l) => l.after != null);
    out.first = first; out.world = C.WORLDS[C.LEVELS[first].world].name;
    prog.data.campaign = { stars: [] };
    out.shutBefore = !prog.campaignUnlocked(first);
    prog.data.campaign.stars[4] = 1;
    out.openAfterBoss1 = prog.campaignUnlocked(first);
    out.nextSkipsSide = C.nextOf(first - 1) === null && C.nextOf(first) === first + 1;
    // CRATE ROW: the crate covers T20; T19 is clear.
    g.levelIdx = first; g._startMatch(); g._groupCenter = null; g._groupStrength = 0;
    const d = g.dart, B = g.board, P = { powf: 1, curlX: 0, curlY: 0, sink: 0 };
    const at = (label) => { d.isAI = false; d.reset(); const p = B.targetPoint(label); d._releaseAt(p.x, p.y, 0, P); return d.result; };
    const r20 = at('T20'); out.t20 = r20.label; out.t20blocked = !!r20.blocked && r20.score === 0;
    out.t19 = at('T19').label;
    // Land the blocked dart through the game so it sticks in the crate.
    at('T20'); d._ft = d._sim.T; g._onDartLand();
    const stuck = g.stuckDarts[g.stuckDarts.length - 1];
    out.stuckInCrate = stuck && stuck.crate === 0;
    // The AI aims around the crate.
    const aim = g._aiClearShot(B.targetPoint('T20'), 0.5);
    out.aiDodges = !g._behindCrate(aim.x, aim.y, 0.5);
    // SHUTTER: the sliding crate moves over time.
    g.levelIdx = first + 1; g._startMatch();
    const a = g.crateRects(0)[0].x0, b2 = g.crateRects(0.6)[0].x0;
    out.slides = Math.abs(a - b2) > 0.01;
    prog.data.campaign = { stars: [] }; prog.save();
    d.reset(); g.levelIdx = null; g.state = 'menu';
    return out;
  });
  const ok = tb.world === 'THINK BOX' && tb.shutBefore && tb.openAfterBoss1 && tb.nextSkipsSide
    && tb.t20blocked && tb.t19 === 'T19' && tb.stuckInCrate && tb.aiDodges && tb.slides;
  rec('think-box', ok, `world=${tb.world} first=${tb.first} opens-after-boss1=${tb.shutBefore && tb.openAfterBoss1} next-skips-side=${tb.nextSkipsSide} T20=${tb.t20} T19=${tb.t19} stuck-in-crate=${tb.stuckInCrate} ai-dodges=${tb.aiDodges} slides=${tb.slides}`);
}

// ---------------------------------------------------------------- HALLOWEEN + NIGHTMARE
// Two spooky side worlds: HALLOWEEN opens after the World 2 boss, NIGHTMARE after
// the World 3 boss; their pumpkins, bats, ghosts and tombstones block like crates,
// each draws, a slide.axis 'y' box moves up and down, and their matches use the
// spooky scenery.
{
  const sp = await page.evaluate(() => {
    const g = window.DARTS, C = window.KD.Campaign, prog = g.progression, out = {};
    const firstOf = (name) => C.LEVELS.findIndex((l) => C.WORLDS[l.world].name === name);
    const hw = firstOf('HALLOWEEN'), nm = firstOf('NIGHTMARE');
    out.hw = hw; out.nm = nm; out.afterHw = C.LEVELS[hw].after; out.afterNm = C.LEVELS[nm].after;
    prog.data.campaign = { stars: [] };
    out.shut = !prog.campaignUnlocked(hw) && !prog.campaignUnlocked(nm);
    prog.data.campaign.stars[9] = 1; out.hwOpen = prog.campaignUnlocked(hw) && !prog.campaignUnlocked(nm);
    prog.data.campaign.stars[14] = 1; out.nmOpen = prog.campaignUnlocked(nm);
    out.kinds = [...new Set(C.LEVELS.flatMap((l) => (l.boxes || []).map((b) => b.kind || 'crate')))].sort().join();
    // Each obstacle kind draws something (pixels change on a blank canvas).
    const c = document.createElement('canvas'); c.width = 120; c.height = 120; const x = c.getContext('2d');
    out.drawn = ['crate', 'pumpkin', 'bat', 'ghost', 'tomb'].every((k) => {
      x.clearRect(0, 0, 120, 120); g._obstacle(x, k, 10, 10, 100, 100);
      const d = x.getImageData(0, 0, 120, 120).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n > 1500;
    });
    // A pumpkin blocks a dart like a crate (PUMPKIN PATCH covers the lower board).
    g.levelIdx = hw; g._startMatch(); g._groupCenter = null; g._groupStrength = 0;
    const d = g.dart, B = g.board, P = { powf: 1, curlX: 0, curlY: 0, sink: 0 };
    const lb = C.LEVELS[hw].boxes[0], tx = B.cx + (lb.x + lb.w / 2) * B.Rpx, ty = B.cy + (lb.y + lb.h / 2) * B.Rpx;
    d.isAI = false; d.reset(); d._releaseAt(tx, ty, 0, P);
    out.pumpkinBlocks = !!d.result.blocked;
    // SLEEP PARALYSIS slides up and down.
    const sl = C.LEVELS.findIndex((l) => l.name === 'SLEEP PARALYSIS');
    g.levelIdx = sl; g._startMatch();
    const a = g.crateRects(0)[0], b2 = g.crateRects(1.5)[0];
    out.ySlide = Math.abs(a.y0 - b2.y0) > 0.01 && Math.abs(a.x0 - b2.x0) < 1e-9;
    // The match is painted in the world's scenery (bottom-left is the dark spooky hills).
    window.__step(2);
    const px = document.getElementById('game').getContext('2d').getImageData(8, 700, 1, 1).data;
    out.scene = [px[0], px[1], px[2]];
    prog.data.campaign = { stars: [] }; prog.save(); d.reset(); g.levelIdx = null; g.state = 'menu';
    return out;
  });
  const ok = sp.afterHw === 9 && sp.afterNm === 14 && sp.shut && sp.hwOpen && sp.nmOpen
    && sp.kinds === 'bat,crate,ghost,pumpkin,tomb' && sp.drawn && sp.pumpkinBlocks && sp.ySlide && sp.scene[0] < 40 && sp.scene[0] > sp.scene[1] && sp.scene[0] >= sp.scene[2];   // red-black, not the blue neon floor
  rec('spooky-worlds', ok, `halloween@${sp.hw} after ${sp.afterHw}, nightmare@${sp.nm} after ${sp.afterNm}, opens=${sp.shut && sp.hwOpen && sp.nmOpen} kinds=${sp.kinds} drawn=${sp.drawn} pumpkin-blocks=${sp.pumpkinBlocks} y-slide=${sp.ySlide} scene=rgb(${sp.scene})`);
}

// ---------------------------------------------------------------- dart workshop: barrels
// Five barrel shapes (torpedo free, the rest bought with coins), worn in matches,
// thrown by the AI by tier, cleaned up from a bad save, and each draws a distinct dart.
{
  const ws = await page.evaluate(() => {
    const g = window.DARTS, prog = g.progression, B = window.KD.Sprites.BARRELS, out = {};
    const snap = JSON.stringify(prog.data);
    out.shapes = Object.keys(B).join();
    prog.data.coins = 60; prog.data.ownedShapes = ['torpedo']; prog.data.darts.shape = 'torpedo';
    out.poor = prog.chooseShape('hex');                    // 180 > 60
    out.buy = prog.chooseShape('straight'); out.coins = prog.data.coins;   // 60 - 50
    out.equipFree = prog.chooseShape('torpedo');
    prog.chooseShape('straight');
    g.levelIdx = null; g.selOpp = 'Pro'; g._startMatch();
    out.youWear = g.players[0].dartParts.shape; out.aiWears = g.players[1].dartParts.shape;
    // A save naming an unknown or unowned barrel falls back to the torpedo.
    localStorage.setItem('kd.profile.v1', JSON.stringify({ version: 1, darts: { tip: 'steel', flight: 'standard', shape: 'hex' }, ownedShapes: ['torpedo'] }));
    out.cleaned = new window.KD.Progression().data.darts.shape;
    // Each barrel draws a different dart.
    const c = document.createElement('canvas'); c.width = 260; c.height = 60; const x = c.getContext('2d');
    const sig = Object.keys(B).map((k) => { x.clearRect(0, 0, 260, 60); x.save(); x.translate(250, 30); g.sprites.drawDart(x, 240, window.KD.Sprites.SKINS.cyan, 0, { shape: k }); x.restore(); const d = x.getImageData(0, 0, 260, 60).data; let h = 0; for (let i = 0; i < d.length; i += 97) h = (h * 31 + d[i]) >>> 0; return h; });
    out.distinct = new Set(sig).size === sig.length;
    prog.data = JSON.parse(snap); prog.save(); g.state = 'menu';
    return out;
  });
  const ok = ws.shapes === 'torpedo,straight,bomb,sharkcut,hex' && ws.poor === 'poor' && ws.buy === 'bought' && ws.coins === 10
    && ws.equipFree === 'equipped' && ws.youWear === 'straight' && ws.aiWears === 'sharkcut' && ws.cleaned === 'torpedo' && ws.distinct;
  rec('workshop-barrels', ok, `shapes=${ws.shapes} poor=${ws.poor} buy=${ws.buy} coins=${ws.coins} you=${ws.youWear} ai(Pro)=${ws.aiWears} bad-save->${ws.cleaned} distinct=${ws.distinct}`);
}

// ---------------------------------------------------------------- dart workshop: try on, then buy
// Tapping a part you don't own puts it on the big dart without spending a coin;
// BUY & EQUIP buys it; tapping an owned part equips it; leaving drops the preview.
{
  const wt = await page.evaluate(() => {
    const g = window.DARTS, prog = g.progression, out = {};
    const snap = JSON.stringify(prog.data);
    prog.data.coins = 150; prog.data.ownedTips = ['steel']; prog.data.darts.tip = 'steel';
    g.state = 'workshop'; g.wsPreview = null;
    const tap = (id) => { const b = g._workshopLayout().find((x) => x.id === id); if (!b) return false;
      g.input.pointer.x = b.x + b.w / 2; g.input.pointer.y = b.y + b.h / 2; g.input.pointer.justDown = true;
      g._updateWorkshop(0); g.input.pointer.justDown = false; return true; };
    tap('tip:plasma');                                         // 200 > 150: try on only
    out.tryOn = g.wsPreview && g.wsPreview.key; out.coinsAfterTry = prog.data.coins; out.stillSteel = prog.data.darts.tip;
    out.shownTip = g._wsLoadout().tip;
    out.poorBtn = (g._workshopLayout().find((x) => x.id === 'buy') || {}).offer?.kind;
    tap('buy'); out.poorKept = prog.data.coins === 150 && prog.data.darts.tip === 'steel';
    tap('tip:needle'); out.buyBtn = (g._workshopLayout().find((x) => x.id === 'buy') || {}).offer?.kind;
    tap('buy'); out.bought = prog.data.darts.tip + '/' + prog.data.coins + '/' + g.wsPreview;
    tap('tip:goldp'); tap('tip:goldp'); out.toggledOff = g.wsPreview === null;
    tap('tip:goldp'); tap('tip:steel'); out.equipOwned = prog.data.darts.tip + '/' + g.wsPreview;
    tap('tip:plasma'); g.input.justPressed = ((orig) => (k) => k === 'back' || orig.call(g.input, k))(g.input.justPressed);
    g._updateWorkshop(0); delete g.input.justPressed; out.leave = g.state + '/' + g.wsPreview;
    const r = g._wsRatings({ skin: 'cyan', shape: 'hex', tip: 'plasma', flight: 'ghost' });
    out.ratings = [r.speed, r.stability, r.slimness].join(',');
    prog.data = JSON.parse(snap); prog.save(); g.state = 'menu'; g.wsPreview = null;
    return out;
  });
  const ok = wt.tryOn === 'plasma' && wt.coinsAfterTry === 150 && wt.stillSteel === 'steel' && wt.shownTip === 'plasma'
    && wt.poorBtn === 'poor' && wt.poorKept && wt.buyBtn === 'buy' && wt.bought === 'needle/110/null'
    && wt.toggledOff && wt.equipOwned === 'steel/null' && wt.leave === 'menu/null' && /^\d+,\d+,\d+$/.test(wt.ratings);
  rec('workshop-try-on', ok, `try=${wt.tryOn} coins=${wt.coinsAfterTry} shown=${wt.shownTip} poor=${wt.poorBtn}/${wt.poorKept} buy=${wt.buyBtn}->${wt.bought} toggle=${wt.toggledOff} equip=${wt.equipOwned} leave=${wt.leave} ratings=${wt.ratings}`);
}

// ---------------------------------------------------------------- leagues, chests, upgrades
// Trophies move you through the leagues (never relegated below your best),
// every AI match ends on the reward screen (trophies -> chest -> cards ->
// CONTINUE), chest cards only go to parts you own, cards + coins level a part
// up, levels steady your hand, league rivals get matching upgrades, and
// pass-and-play earns nothing.
{
  const lg = await page.evaluate(() => {
    const g = window.DARTS, prog = g.progression, P = window.KD.Progression, out = {};
    const snap = JSON.stringify(prog.data);
    prog.data.league = { trophies: 90, best: 0 };
    const w = prog.awardTrophies(true, 0);
    out.promo = w.delta + '/' + w.promoted + '/' + P.LEAGUES[w.leagueTo].name;            // 30/true/SILVER
    prog.data.league.trophies = 105;
    out.floor = prog.awardTrophies(false, 0).to;                                           // 100: Silver floor
    out.star = prog.awardTrophies(true, 3).delta;                                          // 45
    // Chests: only owned, non-maxed parts get cards; a won chest has the league's count.
    prog.data.ownedShapes = ['torpedo']; prog.data.ownedTips = ['steel']; prog.data.ownedFlights = ['standard'];
    prog.data.parts = { cards: {}, lv: { 'flight:standard': 5 } };
    let bad = 0, total = 0;
    for (let i = 0; i < 40; i++) {
      const ch = prog.rollChest(true);
      ch.cards.forEach((c) => { total += c.n; if (!prog.ownsPart(c.group, c.id) || c.id === 'standard') bad++; });
    }
    out.chestCardsOk = bad === 0 && total >= 40 * 3;
    // Upgrade: needs cards then coins; a level steadies the hand.
    prog.data.coins = 30; prog.data.parts.cards['shape:torpedo'] = 2;
    out.upCards = prog.upgradePart('shape', 'torpedo');
    prog.data.parts.cards['shape:torpedo'] = 3;
    out.upPoor = prog.upgradePart('shape', 'torpedo');
    prog.data.coins = 100;
    out.up = prog.upgradePart('shape', 'torpedo') + '/' + prog.partLv('shape', 'torpedo') + '/' + prog.data.coins;  // upgraded/2/60
    out.steady = prog.steadiness();
    // A bad save is cleaned up.
    localStorage.setItem('kd.profile.v1', JSON.stringify({ version: 1, league: { trophies: -5, best: 99 }, parts: { cards: { 'shape:torpedo': 'x', 'evil:x': 3 }, lv: { 'tip:steel': 77 } } }));
    const q = new window.KD.Progression().data;
    out.clean = q.league.trophies + '/' + q.league.best + '/' + JSON.stringify(q.parts);
    // A real AI match: steadier you, upgraded rival, reward screen flow.
    prog.data.league = { trophies: 260, best: 2 }; prog.save();
    g.levelIdx = null; g.selOpp = 'Pro'; g.selMode = 'x01'; g._startMatch();
    out.humanSteady = g.humanSteady;
    out.aiSigma = +(g.players[1].sigma / new window.KD.AIPlayer('x', 'Pro', 'violet').sigma).toFixed(3);   // 0.955 in Gold
    g._matchWin(g.players[0]);
    out.reward = !!g.matchResult.reward;
    for (let i = 0; i < 90; i++) { g._update(1 / 60); }
    out.flow = [g.state];
    const tap = () => { g.input.pointer.justDown = true; g._updateReward(0); g.input.pointer.justDown = false; };
    for (let i = 0; i < 200 && g.rw.phase !== 'chest'; i++) g._update(1 / 60);
    for (let i = 0; i < 40; i++) g._update(1 / 60);
    out.flow.push(g.rw.phase); tap(); out.flow.push(g.rw.phase);
    tap();                                               // deal everything now
    const btn = g._rewardButtons().find((b) => b.id === 'continue');
    g.input.pointer.x = btn.x + 5; g.input.pointer.y = btn.y + 5; tap();
    out.flow.push(g.state + ':' + g.matchResult.rewardSeen);
    // Pass-and-play: no trophies, no chest, no boost.
    const t0 = prog.data.league.trophies;
    g.selOpp = 'hotseat'; g._startMatch(); out.hotSteady = g.humanSteady; g._matchWin(g.players[0]);
    out.hotNone = !g.matchResult.reward && prog.data.league.trophies === t0;
    prog.data = JSON.parse(snap); prog.save(); g.state = 'menu';
    return out;
  });
  const ok = lg.promo === '30/true/SILVER' && lg.floor === 100 && lg.star === 45 && lg.chestCardsOk
    && lg.upCards === 'cards' && lg.upPoor === 'poor' && lg.up === 'upgraded/2/60' && Math.abs(lg.steady - 0.925) < 1e-9          // 5 levels: flight maxed (+4), barrel LV 2 (+1)
    && lg.clean === '2700/9/{"cards":{},"lv":{"tip:steel":5}}'   // best clamped to Champion lifts trophies to its floor
    && Math.abs(lg.humanSteady - 0.925) < 1e-9 && lg.aiSigma === 0.955 && lg.reward
    && lg.flow.join() === 'reward,chest,open,matchOver:true' && lg.hotSteady === 1 && lg.hotNone;
  rec('leagues-upgrades', ok, `promo=${lg.promo} floor=${lg.floor} star=${lg.star} chest-cards=${lg.chestCardsOk} up=${lg.upCards}/${lg.upPoor}/${lg.up} steady=${lg.steady} clean=${lg.clean} you=${lg.humanSteady} ai×${lg.aiSigma} flow=${lg.flow} hotseat=${lg.hotSteady}/${lg.hotNone}`);
}

// ---------------------------------------------------------------- tokens + league leaderboard
// Ten leagues; reaching one pays 💎 once; won chests pay 💎 by league; 💎 fill
// missing upgrade cards (2 each) and buy a bonus chest that plays the chest
// screen and returns to the Workshop. The leaderboard ranks everyone by
// trophies, labels AI rivals, and finds you in MY LEAGUE and TOP 100.
{
  const tk = await page.evaluate(() => {
    const g = window.DARTS, prog = g.progression, P = window.KD.Progression, out = {};
    const snap = JSON.stringify(prog.data);
    out.leagues = P.LEAGUES.length + ':' + P.LEAGUES.map((l) => l.min).join(',');
    prog.data.tokens = 0; prog.data.league = { trophies: 230, best: 1 };
    const pr = prog.awardTrophies(true, 0);                       // into GOLD (idx 2): +20 💎
    out.promoTokens = pr.bonusTokens + '/' + prog.data.tokens;
    prog.data.league = { trophies: 230, best: 2 }; prog.awardTrophies(false, 0); prog.awardTrophies(true, 0);
    out.noRepeat = prog.data.tokens;                                // still 20: Gold was already reached
    const ch = prog.rollChest(true); out.chestTokens = ch.tokens;   // Gold chest: 2 💎
    // Tokens fill missing cards.
    prog.data.ownedShapes = ['torpedo']; prog.data.parts = { cards: { 'shape:torpedo': 1 }, lv: {} };
    prog.data.coins = 100; prog.data.tokens = 3;
    out.short = prog.upgradePart('shape', 'torpedo', true);        // needs 4 💎, has 3
    prog.data.tokens = 4;
    out.filled = prog.upgradePart('shape', 'torpedo', true) + '/' + prog.partLv('shape', 'torpedo') + '/' + prog.data.tokens + '/' + prog.partCards('shape', 'torpedo');
    // Bonus chest: costs 30 💎, plays the chest, returns to the Workshop.
    prog.data.tokens = 29; out.bonusPoor = g._openBonusChest();
    prog.data.tokens = 40; g.state = 'workshop';
    out.bonus = g._openBonusChest() + '/' + g.state + '/' + g.rw.phase + '/' + prog.data.tokens;
    g._updateReward(0.5);                                           // the chest takes taps after its drop-in
    g.input.pointer.justDown = true; g._updateReward(0); g._updateReward(0); g.input.pointer.justDown = false;
    const cont = g._rewardButtons().find((b) => b.id === 'continue');
    g.input.pointer.x = cont.x + 4; g.input.pointer.y = cont.y + 4; g.input.pointer.justDown = true; g._updateReward(0); g.input.pointer.justDown = false;
    out.bonusBack = g.state;
    // Leaderboard.
    prog.data.league = { trophies: 1420, best: 6 };
    g.state = 'leaderboard'; g.lbTab = 'league'; g._openLeaderboard();
    const rows = g._boardRows();
    out.sorted = rows.every((r, i) => i === 0 || rows[i - 1].trophies >= r.trophies);
    out.aiLabelled = rows.filter((r) => !r.you).every((r) => r.ai);
    const v = g._boardView();
    out.myLeague = v.rows.some((r) => r.you) && v.rows.every((r) => r.league === 6);
    g.lbTab = 'top'; g.lbPage = 0;
    const me = rows.find((r) => r.you);
    const fm = g._boardButtons().find((b) => b.id === 'findme');
    g.input.pointer.x = fm.x + 4; g.input.pointer.y = fm.y + 4; g.input.pointer.justDown = true; g._updateLeaderboard(); g.input.pointer.justDown = false;
    out.findMe = g._boardView().rows.some((r) => r.you) && g.lbPage === Math.floor((me.rank - 1) / 10);
    window.__step(2);
    prog.data = JSON.parse(snap); prog.save(); g.state = 'menu'; g._lbBoard = null;
    return out;
  });
  const ok = tk.leagues === '10:0,100,250,450,700,1000,1350,1750,2200,2700' && tk.promoTokens === '20/20' && tk.noRepeat === 20
    && tk.chestTokens === 2 && tk.short === 'cards' && tk.filled === 'upgraded/2/0/0' && tk.bonusPoor === false
    && tk.bonus === 'true/reward/chest/10' && tk.bonusBack === 'workshop' && tk.sorted && tk.aiLabelled && tk.myLeague && tk.findMe;
  rec('tokens-leaderboard', ok, `leagues=${tk.leagues} promo💎=${tk.promoTokens} once=${tk.noRepeat} chest💎=${tk.chestTokens} fill=${tk.short}->${tk.filled} bonus=${tk.bonusPoor}/${tk.bonus}->${tk.bonusBack} board sorted=${tk.sorted} ai-labelled=${tk.aiLabelled} my-league=${tk.myLeague} find-me=${tk.findMe}`);
}

// ---------------------------------------------------------------- curl lead
// The curl starts bending 30ms before release (already turning as it leaves
// the hand) but is rescaled so the landing, and so the score, is unchanged.
{
  const cl = await page.evaluate(() => {
    const g = window.DARTS, d = g.dart, B = g.board, Rp = B.Rpx;
    g.levelIdx = null; g.selOpp = 'hotseat'; g._startMatch();
    g._groupCenter = null; g._groupStrength = 0;
    const ax = B.cx, ay = B.cy - 0.6 * Rp;
    d.isAI = false; d.reset(); d._releaseAt(ax, ay, 0, { powf: 1, curlX: 1, curlY: 0, sink: 0 });
    const s = d._sim, T = s.T, k = d._pxPerM();
    const plain = 0.5 * s.cx * T * T * k;                     // landing curl with no lead
    const landCurl = d.landX - ax;
    const t = 0.15 * T, early = d._simAt(t).x - (s.x0 + s.vx * t);
    const noLead = 0.5 * s.cx * t * t;
    d.reset(); g.state = 'menu';
    return { same: Math.abs(landCurl - plain) < 0.01, ratio: early / noLead };
  });
  rec('curl-lead', cl.same && cl.ratio > 1.4, `landing curl unchanged=${cl.same}, curl at 15% of the flight = ${cl.ratio.toFixed(2)}x a no-lead curl`);
}

// ---------------------------------------------------------------- flight simulator
// The dart flies a simulated projectile (like the archery arrow): an ideal
// flick lands where the hand error put it, a soft flick drops lower, a hard one
// rides higher, curl bends it sideways, and the drawn flight is that path
// (starts at the hand, ends on the landing spot, arcs above the target).
{
  const sim = await page.evaluate(() => {
    const g = window.DARTS, d = g.dart, B = g.board, Rp = B.Rpx;
    g.levelIdx = null; g.selOpp = 'hotseat'; g._startMatch();
    const ax = B.cx, ay = B.cy - 0.6 * Rp, out = {};
    // No grouping pull from earlier throws: this measures the flight alone.
    const go = (phys) => { g._groupCenter = null; g._groupStrength = 0; d.isAI = !phys; d.reset(); d._releaseAt(ax, ay, 0, phys); return { dx: (d.landX - ax) / Rp, dy: (d.landY - ay) / Rp, label: d.result.label }; };
    const P = (powf, curlX) => ({ powf, curlX: curlX || 0, curlY: 0, sink: 0 });
    out.ideal = go(P(1)); out.soft = go(P(0.8)); out.hard = go(P(1.3)); out.curl = go(P(1, 1)); out.ai = go(null);
    d.isAI = false; d.reset(); d._releaseAt(ax, ay, 0, P(1));
    const h = d._flightAt(0), e = d._flightAt(1);
    let apex = 1e9; for (let i = 0; i <= 60; i++) apex = Math.min(apex, d._flightAt(i / 60).y);
    out.path = { fromHand: Math.hypot(h.x - d._fromX, h.y - d._fromY) < 1, toLand: Math.hypot(e.x - d.landX, e.y - d.landY) < 1, apexAbove: apex < ay - 20, apexOnScreen: apex > 0 };
    d.isAI = false; d.reset(); g.state = 'menu';
    return out;
  });
  const near = (v) => Math.abs(v) < 0.005;
  const ok = near(sim.ideal.dx) && near(sim.ideal.dy) && sim.ideal.label === 'T20'
    && sim.soft.dy > 0.08 && sim.hard.dy < -0.08 && near(sim.soft.dx) && sim.curl.dx > 0.05
    && near(sim.ai.dx) && near(sim.ai.dy)
    && sim.path.fromHand && sim.path.toLand && sim.path.apexAbove && sim.path.apexOnScreen;
  rec('flight-simulator', ok, `ideal ${sim.ideal.label} soft dy=${sim.soft.dy.toFixed(2)}R hard dy=${sim.hard.dy.toFixed(2)}R curl dx=${sim.curl.dx.toFixed(2)}R ai on-target=${near(sim.ai.dx) && near(sim.ai.dy)} path=${JSON.stringify(sim.path)}`);
}
rec('no-real-console-errors', consoleErrs.length === 0 && pageErrors.length === 0, consoleErrs.length || pageErrors.length ? (consoleErrs[0] || pageErrors[0]) : 'clean');

await browser.close();
const passed = R.filter((r) => r.pass).length;
console.log(`\n=== ${passed}/${R.length} passed ===  screenshots: ${OUT}`);
process.exit(passed === R.length ? 0 : 1);
