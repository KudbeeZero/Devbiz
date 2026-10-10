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
rec('flight-size-continuity', stuckLen >= 46 && Math.abs(lastFlightLen - stuckLen) <= 0.1 * stuckLen && lensFlight[0] > lastFlightLen, `first flight len ${lensFlight[0] && lensFlight[0].toFixed(1)} -> last ${lastFlightLen.toFixed(1)} vs stuck ${stuckLen} (was 40; +20%)`);
rec('flight-shots', nextShot.length === 0, nextShot.length ? 'missed capture points ' + nextShot.join(',') : 'captured early/mid/late flight frames');
rec('dart-lands', flown.dartsThisTurn === 1 && (flown.stuck + flown.bounce) === 1, `dartsThisTurn=${flown.dartsThisTurn} stuck=${flown.stuck} bounce=${flown.bounce}`);
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
rec('no-real-console-errors', consoleErrs.length === 0 && pageErrors.length === 0, consoleErrs.length || pageErrors.length ? (consoleErrs[0] || pageErrors[0]) : 'clean');

await browser.close();
const passed = R.filter((r) => r.pass).length;
console.log(`\n=== ${passed}/${R.length} passed ===  screenshots: ${OUT}`);
process.exit(passed === R.length ? 0 : 1);
