// Kudbee Jackpot evaluator — slot math, provable fairness, chip accounting and the Bonus
// Wheel flow, in headless Chromium against the real page.
// Run: node games/kudbee-jackpot/eval/evaluator.mjs   (or: npm run jackpot:eval)
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL = process.env.JACKPOT_URL || ('file://' + resolve(HERE, '..', 'index.html'));
const OUT = process.env.JACKPOT_SHOTS || resolve(HERE, 'out');
mkdirSync(OUT, { recursive: true });
const R = [];
const rec = (id, pass, note) => { R.push({ id, pass, note }); console.log(pass ? 'PASS' : 'FAIL', id, '—', note); };

const launchOpts = { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'] };
if (existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOpts);
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const pageErrors = [], consoleErrs = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_|fonts\.g|net::|file:\/\/\/api\/|URL scheme "file" is not supported/.test(m.text())) consoleErrs.push(m.text()); });

await page.goto(URL, { waitUntil: 'load', timeout: 15000 });
await page.evaluate(() => window.__jackpotTest && window.__jackpotTest.ready());
await page.waitForTimeout(300);
rec('loads', pageErrors.length === 0, pageErrors[0] || 'no page errors');
rec('hook', await page.evaluate(() => !!window.__jackpotTest), 'window.__jackpotTest present');
await page.screenshot({ path: OUT + '/01-idle.png' });

// ---------------------------------------------------------------- layout (phone fills the screen, nothing clipped)
const layoutOf = () => page.evaluate(() => {
  const r = (el) => (typeof el === 'string' ? document.getElementById(el) : el).getBoundingClientRect();
  const f = r('frame'), reels = r('reels'), m = document.getElementById('marquee'), mr = r(m);
  const inside = (b, box) => b.top >= box.top - 1 && b.bottom <= box.bottom + 1 && b.left >= box.left - 1 && b.right <= box.right + 1;
  const visible = (el) => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0;
  const clipped = [...m.querySelectorAll('.title, .sub, #grandhero, .jptile')].filter(visible).filter((el) => !inside(r(el), mr)).map((el) => el.className || el.id);
  const controls = ['reels', 'spinbtn', 'winVal', 'chipVal', 'walletbtn', 'fairbadge'].concat([...document.querySelectorAll('.betbtn')]).every((el) => inside(r(el), f));
  return { vw: innerWidth, vh: innerHeight, fw: f.width, fh: f.height, reelsH: reels.height, reelsW: reels.width,
    clipped, controls, hScroll: document.documentElement.scrollWidth > innerWidth };
});
const checkLayout = async (w, h, id, extra) => {
  await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(250);
  const L = await layoutOf();
  await page.screenshot({ path: OUT + '/00-layout-' + w + 'x' + h + '.png' });
  const ok = L.clipped.length === 0 && L.controls && !L.hScroll && L.reelsH >= 150 && extra(L);
  rec(id, ok, `${w}x${h}: frame ${L.fw.toFixed(0)}x${L.fh.toFixed(0)}, reels ${L.reelsW.toFixed(0)}x${L.reelsH.toFixed(0)}, controls on-screen=${L.controls}, clipped marquee items=[${L.clipped.join(', ')}]`);
};
await checkLayout(390, 844, 'layout-phone', (L) => L.fh >= L.vh * 0.98 && L.reelsW >= L.vw * 0.85);
await checkLayout(375, 667, 'layout-small-phone', (L) => L.fh >= L.vh * 0.98);
await checkLayout(1280, 800, 'layout-desktop', (L) => L.fw <= 521 && L.fh <= 800);
await checkLayout(1440, 900, 'layout-desktop-tall', (L) => L.fw <= 521);
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(250);

// ---------------------------------------------------------------- math (deterministic sim on the game's own pure functions)
const sim = await page.evaluate(() => {
  const T = window.__jackpotTest;
  let a = 20261010; const rnd = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const N = 300000, bet = 10, total = bet * T.LINES.length, n = T.STRIP.length;
  let line = 0, scat = 0, hits = 0, bonus = 0, wheelCash = 0, seedPaid = 0;
  const seeds = { MINI: 50, MINOR: 200, MAJOR: 1000, GRAND: 5000 };
  for (let i = 0; i < N; i++) {
    const r = T.evaluateSpin(T.gridFromStops([0, 1, 2, 3, 4].map(() => Math.floor(rnd() * n))), bet);
    line += r.lineWin; scat += r.scatterPay; if (r.lineWin + r.scatterPay > 0) hits++;
    if (r.bonusTriggered) { bonus++; const w = T.WHEEL[Math.floor(rnd() * T.WHEEL.length)]; if (w[0] === 'X') wheelCash += total * parseInt(w.slice(1), 10); else seedPaid += seeds[w]; }
  }
  const staked = N * total, feedPct = 100 * (0.01 + 0.005 + 0.0025 + 0.001);
  // Exact bonus odds from the strip: chance a reel's 3-symbol window shows a Scatter, then P(>=3 of 5 reels).
  let win = 0; for (let st = 0; st < n; st++) if ([0, 1, 2].some((k) => T.STRIP[(st + k) % n] === 'SCATTER')) win++;
  const p = win / n, C = [1, 5, 10, 10, 5, 1];
  let pb = 0; for (let k = 3; k <= 5; k++) pb += C[k] * Math.pow(p, k) * Math.pow(1 - p, 5 - k);
  return { rtp: 100 * (line + scat + wheelCash + seedPaid) / staked + feedPct, hitPct: 100 * hits / N, bonusEvery: N / bonus, bonusExact: 1 / pb };
});
rec('rtp', sim.rtp > 93 && sim.rtp < 96.5, `return-to-player ${sim.rtp.toFixed(2)}% over a 300k-spin sample (README: ~94.6%; jackpot meters counted at steady state; big jackpots make this sample vary by about ±1.5 points)`);
rec('hit-rate', sim.hitPct > 35 && sim.hitPct < 41, `wins on ${sim.hitPct.toFixed(1)}% of spins (README ~38%)`);
rec('bonus-rate-exact', sim.bonusExact >= 260 && sim.bonusExact <= 270, `exact from the strip: bonus once every ${sim.bonusExact.toFixed(1)} spins (README 260-270; this 300k sample saw 1 in ${sim.bonusEvery.toFixed(0)})`);

// ---------------------------------------------------------------- fairness disclosure + round-trip
const strip = await page.evaluate(() => ({ shown: document.getElementById('stripDump').textContent, real: window.__jackpotTest.STRIP.join(', ') }));
rec('strip-disclosed', strip.shown === strip.real, 'Fair panel shows the exact reel strip the engine uses');

const acct = await page.evaluate(async () => {
  const T = window.__jackpotTest; const s0 = T.state(); const h0 = T.history().length;
  for (let i = 0; i < 12; i++) await T.spinInstant();
  const s1 = T.state(); const spins = T.history().slice(h0);
  const net = spins.reduce((m, h) => m - h.totalBet + h.totalWin, 0);
  return { before: s0.chips, after: s1.chips, net, n: spins.length, nonceStep: s1.nonce - s0.nonce };
});
rec('chip-accounting', acct.n === 12 && Math.abs(acct.before + acct.net - acct.after) < 1e-6 && acct.nonceStep === 12, `12 spins: ${acct.before} ${acct.net >= 0 ? '+' : ''}${acct.net} = ${acct.after}; nonce +${acct.nonceStep}`);

const fair = await page.evaluate(async () => {
  const T = window.__jackpotTest;
  const pending = T.history().filter((h) => !h.revealedSeed).slice(-12);
  await T.reveal(); await new Promise((r) => setTimeout(r, 200));
  const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  let ok = 0, checked = 0;
  for (const p of pending) {
    const h = T.history().find((x) => x.nonce === p.nonce && x.hash === p.hash);
    if (!h || !h.revealedSeed) continue; checked++;
    const hashOk = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(h.revealedSeed))) === h.hash;
    const stops = await T.drawReels(h.revealedSeed, h.clientSeed, h.nonce);
    if (hashOk && stops.join() === h.stops.join()) ok++;
  }
  return { ok, checked, rotated: T.state().nonce === 0 };
});
rec('provably-fair-roundtrip', fair.checked >= 12 && fair.ok === fair.checked && fair.rotated, `${fair.ok}/${fair.checked} past spins: revealed seed hashes to the committed hash and recomputes the same reel stops; seed rotated`);

// ---------------------------------------------------------------- Bonus Wheel: ✕ must collect, never strand the spin
const bonusNonce = await page.evaluate(async () => {
  const T = window.__jackpotTest; const st = JSON.parse(localStorage.getItem('kd.jackpot.pf'));
  for (let n = st.nonce; n < st.nonce + 6000; n++) if (T.evaluateSpin(T.gridFromStops(await T.drawReels(st.serverSeed, st.clientSeed, n)), 10).bonusTriggered) return n;
  return -1;
});
await page.evaluate((n) => { const st = JSON.parse(localStorage.getItem('kd.jackpot.pf')); st.nonce = n; localStorage.setItem('kd.jackpot.pf', JSON.stringify(st)); }, bonusNonce);
await page.reload(); await page.evaluate(() => window.__jackpotTest.ready()); await page.waitForTimeout(200);
const w0 = await page.evaluate(() => window.__jackpotTest.state());
await page.click('#spinbtn');
await page.waitForSelector('#wheelpanel:not(.hidden)', { timeout: 10000 });
const xDuringSpin = await page.evaluate(() => getComputedStyle(document.getElementById('closewheel')).display === 'none');
await page.waitForSelector('#collectBtn:not(.hidden)', { timeout: 10000 });
await page.screenshot({ path: OUT + '/02-wheel.png' });
await page.click('#closewheel');
await page.waitForTimeout(400);
const w1 = await page.evaluate(() => { const T = window.__jackpotTest, h = T.history(); return { s: T.state(), last: h[h.length - 1], spinOff: document.getElementById('spinbtn').disabled, panelHidden: document.getElementById('wheelpanel').classList.contains('hidden') }; });
const credited = w1.last && w1.last.nonce === bonusNonce && Math.abs(w0.chips - w1.last.totalBet + w1.last.totalWin - w1.s.chips) < 1e-6;
rec('wheel-close-collects', bonusNonce >= 0 && xDuringSpin && credited && !w1.spinOff && w1.panelHidden && w1.s.nonce === bonusNonce + 1,
  `bonus at nonce ${bonusNonce}; ✕ hidden while spinning=${xDuringSpin}; after ✕: ${w0.chips} -${w1.last && w1.last.totalBet} +${w1.last && w1.last.totalWin} = ${w1.s.chips} (${w1.last && w1.last.bonusWedge}), SPIN enabled=${!w1.spinOff}`);
await page.screenshot({ path: OUT + '/03-after-wheel.png' });

// ---------------------------------------------------------------- win presentation (real click, animated path)
const findNonce = (pred) => page.evaluate(async (predSrc) => {
  const T = window.__jackpotTest, st = JSON.parse(localStorage.getItem('kd.jackpot.pf')), pred = new Function('r', 'return ' + predSrc);
  for (let n = st.nonce; n < st.nonce + 20000; n++) { const r = T.evaluateSpin(T.gridFromStops(await T.drawReels(st.serverSeed, st.clientSeed, n)), 10); if (pred(r)) return n; }
  return -1;
}, pred);
const playNonce = async (n) => {
  await page.evaluate((nn) => { const st = JSON.parse(localStorage.getItem('kd.jackpot.pf')); st.nonce = nn; localStorage.setItem('kd.jackpot.pf', JSON.stringify(st)); localStorage.setItem('kd.jackpot.chips', '5000'); }, n);
  await page.reload(); await page.evaluate(() => window.__jackpotTest.ready()); await page.waitForTimeout(200);
  await page.click('#spinbtn');
  await page.waitForTimeout(450);
  await page.screenshot({ path: OUT + '/06-mid-spin.png' });
  await page.waitForFunction(() => !document.getElementById('spinbtn').disabled, null, { timeout: 15000 });
};
const lineNonce = await findNonce('r.lineWin >= 90 && !r.bonusTriggered && r.lineWin + r.scatterPay < 15 * r.totalBet');
await playNonce(lineNonce);
await page.waitForTimeout(2200);
const v1 = await page.evaluate(() => { const T = window.__jackpotTest, h = T.history(), last = h[h.length - 1]; return Object.assign(T.view(), { totalWin: last.totalWin }); });
await page.screenshot({ path: OUT + '/04-line-win.png' });
rec('win-presentation', lineNonce >= 0 && v1.winCells >= 3 && v1.lines >= 1 && v1.winText === Math.round(v1.totalWin).toLocaleString() && v1.spritesCached <= 16,
  `line win at nonce ${lineNonce}: ${v1.winCells} cells framed on ${v1.lines} line(s); counter shows ${v1.winText} (won ${v1.totalWin}); ${v1.spritesCached} cached symbol sprites`);

const bigNonce = await findNonce('!r.bonusTriggered && r.lineWin + r.scatterPay >= 15 * r.totalBet');
if (bigNonce >= 0) {
  await playNonce(bigNonce);
  await page.waitForTimeout(700);
  const v2 = await page.evaluate(() => window.__jackpotTest.view());
  await page.screenshot({ path: OUT + '/05-big-win.png' });
  rec('big-win', v2.big === 'BIG WIN' || v2.big === 'MEGA WIN', `nonce ${bigNonce}: banner "${v2.big}", counter ${v2.winText}`);
} else rec('big-win', false, 'no 15x+ line win found in 20k nonces');

// ---------------------------------------------------------------- broke -> refill demo chips
const shown = () => page.evaluate(() => ({ refill: !document.getElementById('refillbtn').classList.contains('hidden'), spinOff: document.getElementById('spinbtn').disabled, chips: window.__jackpotTest.state().chips }));
const normal = await shown();
await page.evaluate(() => localStorage.setItem('kd.jackpot.chips', '30'));
await page.reload(); await page.evaluate(() => window.__jackpotTest.ready()); await page.waitForTimeout(250);
const broke = await shown();
await page.screenshot({ path: OUT + '/07-broke.png' });
await page.click('#refillbtn'); await page.waitForTimeout(150);
const refilled = await shown();
await page.reload(); await page.evaluate(() => window.__jackpotTest.ready()); await page.waitForTimeout(250);
const persisted = await shown();
rec('broke-refill', !normal.refill && broke.refill && broke.spinOff && refilled.chips === 2000 && !refilled.refill && !refilled.spinOff && persisted.chips === 2000,
  `at ${normal.chips} chips refill hidden=${!normal.refill}; at 30: refill shown=${broke.refill}, SPIN disabled=${broke.spinOff}; after click: ${refilled.chips} chips, SPIN enabled=${!refilled.spinOff}; after reload: ${persisted.chips}`);

// ---------------------------------------------------------------- share card (SEO / social)
{
  const html = readFileSync(resolve(HERE, '..', 'index.html'), 'utf8');
  const meta = (attr, name) => { const m = html.match(new RegExp('<meta[^>]+' + attr + '="' + name + '"[^>]+content="([^"]*)"', 'i')); return m && m[1]; };
  const og = meta('property', 'og:image'), tw = meta('name', 'twitter:image'), cardType = meta('name', 'twitter:card');
  let dims = null, bytes = 0;
  const f = og && resolve(HERE, '..', '..', '..', 'assets', 'og', (og.split('/').pop() || '').split('?')[0]);
  if (f && existsSync(f)) {
    const b = readFileSync(f); bytes = b.length;
    for (let i = 2; i < b.length - 9;) { if (b[i] !== 0xff) { i++; continue; } const mk = b[i + 1]; if (mk >= 0xc0 && mk <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(mk)) { dims = { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) }; break; } i += 2 + b.readUInt16BE(i + 2); }
  }
  rec('share-card', !!og && /^https:\/\//.test(og) && og === tw && cardType === 'summary_large_image' && !!dims && dims.w === 1200 && dims.h === 630 && bytes < 300 * 1024,
    `og:image=${og} twitter:image matches=${og === tw} card=${cardType} file=${dims ? dims.w + 'x' + dims.h : 'missing'} ${(bytes / 1024).toFixed(0)}KB`);
}

rec('no-real-console-errors', consoleErrs.length === 0 && pageErrors.length === 0, consoleErrs[0] || pageErrors[0] || 'clean');
await browser.close();
const passed = R.filter((r) => r.pass).length;
console.log(`\n=== ${passed}/${R.length} passed ===  screenshots: ${OUT}`);
process.exit(passed === R.length ? 0 : 1);
