// Kudbee Voidrunner — playability rubric (Playwright + Chromium). Run from the repo root:
// `npm run voidrunner:eval`. Drives the game through window.VOID and real input events.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL = process.env.VOIDRUNNER_URL || ('file://' + resolve(HERE, '..', 'index.html'));
const OUT = resolve(HERE, 'out');
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const R = [];
const rec = (id, pass, note) => { R.push({ id, pass }); console.log((pass ? 'PASS' : 'FAIL'), id, '—', note); };

const launchOpts = { headless: true, args: ['--no-sandbox'] };
if (existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOpts);

// file:// can't reach the leaderboard or wingman APIs (CORS) — those fetches are expected to fail.
const NOISE = /Failed to load resource|ERR_|fonts\.g|net::|file:\/\/\/api\/|file:\/\/\/wingman|CORS policy/;
const errors = [], consoleErrs = [];
function watch(page, tag) {
  page.on('pageerror', e => errors.push(tag + String(e)));
  page.on('console', m => { if (m.type() === 'error' && !NOISE.test(m.text())) consoleErrs.push(tag + m.text()); });
}
async function open(ctxOpts, tag) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage(); watch(page, tag);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.VOID, null, { timeout: 15000 });
  await page.evaluate(() => window.VOID.endIntro());
  await sleep(800);
  return page;
}

// ---- desktop ----
const page = await open({ viewport: { width: 960, height: 640 } }, '');
rec('loads', errors.length === 0, errors[0] || 'no page errors');
rec('pause-btn-hidden-on-gate', await page.evaluate(() => document.getElementById('pauseBtn').classList.contains('hidden')), 'pause button hidden on the title screen');
await page.click('#startBtn'); await sleep(300);
rec('start', (await page.evaluate(() => window.VOID.state)) === 'play', 'Launch → state=play');

// regression: the bloom pass threw on every frame with lit engines, skipping the HUD
const before = errors.length;
await page.evaluate(() => { window.__f = 0; (function c() { window.__f++; requestAnimationFrame(c); })(); window.__t0 = performance.now(); });
await page.keyboard.down(' '); await page.keyboard.down('Shift'); await sleep(3000);
await page.keyboard.up('Shift'); await page.keyboard.up(' ');
const fps = await page.evaluate(() => window.__f / ((performance.now() - window.__t0) / 1000));
const playErrs = errors.slice(before);
rec('frames-render-clean', playErrs.length === 0, playErrs.length ? playErrs.length + ' errors, first: ' + playErrs[0].slice(0, 120) : '3 s of boosted fire, 0 frame errors (bloom + HUD draw every frame)');
rec('fps', fps >= 45, '~' + Math.round(fps) + ' fps');
await page.screenshot({ path: OUT + '/01-play.png' });

const score = await page.evaluate(() => window.VOID.score);
rec('scoring', score > 0, 'score=' + score + ' after 3 s of fire');

// pause button: visible in play, pauses on click, hides while paused
const pb = await page.evaluate(() => {
  const b = document.getElementById('pauseBtn'), shown = !b.classList.contains('hidden');
  b.click();
  return { shown, paused: window.VOID.paused, overlay: !document.getElementById('pause').classList.contains('hidden') };
});
await sleep(100);
const pbHidden = await page.evaluate(() => document.getElementById('pauseBtn').classList.contains('hidden'));
rec('pause-button', pb.shown && pb.paused && pb.overlay && pbHidden, JSON.stringify(Object.assign(pb, { hiddenWhilePaused: pbHidden })));
await page.click('#resumeBtn'); await sleep(100);

// regression: alt-tab mid-turn left the key "held" and the run going
const blur = await page.evaluate(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
  await sleep(100);
  const held = window.VOID.keys.left;
  window.dispatchEvent(new Event('blur'));
  return { held, after: !!window.VOID.keys.left, paused: window.VOID.paused };
});
// blur releases held keys but must not pause: browsers fire it for benign focus moves (iframes, toolbars)
rec('blur-releases-keys', blur.held && !blur.after && !blur.paused, 'left held=' + blur.held + ' → after blur ' + blur.after + ' · paused=' + blur.paused + ' (must stay false)');
await page.evaluate(() => { if (window.VOID.paused) window.VOID.togglePause(); });

const hid = await page.evaluate(() => {
  Object.defineProperty(document, 'hidden', { value: true, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
  const paused = window.VOID.paused;
  Object.defineProperty(document, 'hidden', { value: false, configurable: true });
  if (paused) window.VOID.togglePause();
  return paused;
});
rec('hidden-tab-pauses', hid, 'paused=' + hid + ' when the tab is hidden');

const over = await page.evaluate(async () => {
  const V = window.VOID, sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 40 && V.state === 'play'; i++) { V.forceRockAtShip(); await sleep(250); }
  return { state: V.state, shown: !document.getElementById('over').classList.contains('hidden'), pauseHidden: document.getElementById('pauseBtn').classList.contains('hidden') };
});
rec('game-over', over.state === 'over' && over.shown && over.pauseHidden, JSON.stringify(over));
await sleep(600);
await page.screenshot({ path: OUT + '/02-over.png' });

// ---- phone ----
const phone = await open({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, 'phone: ');
await phone.tap('#startBtn'); await sleep(1200);
// MSL / DASH are drawn buttons beside the chain gauge; the chain gauge itself must not fire a missile
const zones = await phone.evaluate(() => {
  const V = window.VOID; V.forceMissileAmmo(3); V.spawnEnemyFar();
  const W = innerWidth, H = innerHeight, m = Math.min(W, H);
  const chainY = H - Math.round(m * 0.035) - Math.round(m * 0.03) - 8 + 4;      // chainMeterRect() centre row
  return { chainLeft: { x: W / 2 - m * 0.12, y: chainY }, ammo0: V.missileAmmo };
});
await phone.touchscreen.tap(zones.chainLeft.x, zones.chainLeft.y); await sleep(100);
const afterChainTap = await phone.evaluate(() => window.VOID.missileAmmo);
const btnPos = await phone.evaluate(() => {
  const W = innerWidth, H = innerHeight, m = Math.min(W, H);
  const crY = H - Math.round(m * 0.035) - Math.round(m * 0.03) - 8;
  const w = Math.max(64, m * 0.16), h = Math.max(30, Math.round(m * 0.055)), y = crY - h - 10 + h / 2;
  return { msl: { x: W / 2 - 6 - w / 2, y }, dash: { x: W / 2 + 6 + w / 2, y } };
});
const beforeMsl = await phone.evaluate(() => { window.VOID.forceEnemyType('drone', { z: 500, hp: 50 }); return window.VOID.missileAmmo; });   // a lock target the autofire can't kill first
await phone.touchscreen.tap(btnPos.msl.x, btnPos.msl.y); await sleep(100);
const afterMsl = await phone.evaluate(() => window.VOID.missileAmmo);
await phone.touchscreen.tap(btnPos.dash.x, btnPos.dash.y); await sleep(60);
const dashed = await phone.evaluate(() => window.VOID.dashT > 0 || window.VOID.dashCd > 0);
await phone.screenshot({ path: OUT + '/03-phone-play.png' });
// ammo regenerates continuously, so compare with a margin: a tap fires a salvo of up to 3
rec('touch-msl-dash', afterChainTap >= zones.ammo0 - 0.01 && afterMsl <= beforeMsl - 0.9 && dashed,
  'chain-gauge tap: ammo ' + zones.ammo0.toFixed(1) + '→' + afterChainTap.toFixed(1) + ' · MSL button: ' + beforeMsl.toFixed(1) + '→' + afterMsl.toFixed(1) + ' · DASH button dashed=' + dashed);
const ph = await phone.evaluate(() => {
  const b = document.getElementById('pauseBtn').getBoundingClientRect();
  const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
  const mid = document.elementFromPoint(195, 500);
  return { btn: top && top.id, mid: mid && mid.id, x: b.left + b.width / 2, y: b.top + b.height / 2 };
});
await phone.touchscreen.tap(ph.x, ph.y); await sleep(150);
const phPaused = await phone.evaluate(() => window.VOID.paused);
await phone.screenshot({ path: OUT + '/04-phone-paused.png' });
rec('phone-pause', ph.btn === 'pauseBtn' && ph.mid === 'game' && phPaused, 'tap target #' + ph.btn + ' · mid-screen #' + ph.mid + ' · paused=' + phPaused);

rec('no-console-errors', consoleErrs.length === 0 && errors.length === 0,
  consoleErrs.concat(errors).slice(0, 2).join(' | ').slice(0, 200) || 'clean (file:// API fetches + fonts ignored)');

const pass = R.filter(r => r.pass).length;
console.log('\n=== ' + pass + '/' + R.length + ' passed ===');
await browser.close();
process.exit(pass === R.length ? 0 : 1);
