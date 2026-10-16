// FRONTIER: Aether Wing — playability rubric (Playwright + Chromium, WebGL via SwiftShader).
// Run from the repo root: `npm run aether:eval`. Drives the game through window.AW only.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL = process.env.AETHER_URL || ('file://' + resolve(HERE, '..', 'index.html'));
const OUT = resolve(HERE, 'out');
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const R = [];
const rec = (id, pass, note) => { R.push({ id, pass }); console.log((pass ? 'PASS' : 'FAIL'), id, '—', note); };

// Cloud containers: use the pre-installed Chromium when present (avoids `playwright install`).
const launchOpts = { headless: true, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] };
if (existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOpts);

const errors = [], consoleErrs = [];
function watch(page) {
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|fonts\.g|net::/.test(m.text())) consoleErrs.push(m.text()); });
}
async function fresh(opts) {
  const page = await (opts ? (await browser.newContext(opts)).newPage() : browser.newPage({ viewport: { width: 960, height: 600 } }));
  watch(page);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.AW, null, { timeout: 15000 });
  return page;
}
// Spawn the whole wave-1 drone budget in the firing line and hold fire until it is cleared.
const CLEAR_WAVE_1 = async () => {
  const A = window.AW, sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 4; i++) A.spawnDroneAhead();
  A.hold(true);
  let cleared = false;
  for (let i = 0; i < 200; i++) { await sleep(50); if (A.stats.drones === 0 && A.waveBreak > 0) { cleared = true; break; } }
  A.hold(false);
  return cleared;
};

// ---- desktop ----
const page = await fresh();
rec('loads', errors.length === 0, errors.length ? errors[0] : 'no page errors');
rec('hook', await page.evaluate(() => !!window.AW), 'window.AW present');
await page.screenshot({ path: OUT + '/01-gate.png' });
await page.click('#startBtn');
await sleep(300);
rec('start', (await page.evaluate(() => window.AW.state)) === 'play', 'Launch → state=play');
const banner1 = await page.evaluate(() => window.AW.banner);
rec('wave-banner', banner1 === 'WAVE 1', 'launch announces "' + banner1 + '"');

const kill = await page.evaluate(async () => {
  const A = window.AW, sleep = ms => new Promise(r => setTimeout(r, ms));
  A.spawnDroneAhead(); A.hold(true);
  for (let i = 0; i < 80 && A.stats.kills === 0; i++) await sleep(50);
  A.hold(false);
  return A.stats.kills;
});
rec('blasters-kill', kill >= 1, 'kills=' + kill + ' after holding fire on a drone ahead');

// wave clear → bonus banner → next wave
await page.evaluate(() => window.AW.restart());
const adv = await page.evaluate(async (clear) => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const cleared = await (0, eval)('(' + clear + ')')();
  const clearBanner = window.AW.banner;
  for (let i = 0; i < 60 && window.AW.stats.wave === 1; i++) await sleep(50);
  return { cleared, clearBanner, wave: window.AW.stats.wave, banner: window.AW.banner };
}, CLEAR_WAVE_1.toString());
await page.screenshot({ path: OUT + '/02-play.png' });
rec('wave-advance', adv.cleared && adv.clearBanner === 'WAVE 1 CLEAR' && adv.wave === 2 && adv.banner === 'WAVE 2',
  JSON.stringify(adv));

// regression: pausing inside the wave break used to strand the game with no further waves
await page.evaluate(() => window.AW.restart());
const gap = await page.evaluate(async (clear) => {
  const A = window.AW, sleep = ms => new Promise(r => setTimeout(r, ms));
  const cleared = await (0, eval)('(' + clear + ')')();
  A.pause(); await sleep(2500); const heldWave = A.stats.wave; A.resume();
  for (let i = 0; i < 80 && A.stats.wave === 1; i++) await sleep(50);
  return { cleared, heldWave, wave: A.stats.wave };
}, CLEAR_WAVE_1.toString());
rec('wave-gap-pause', gap.cleared && gap.heldWave === 1 && gap.wave === 2,
  'break held while paused (wave ' + gap.heldWave + '), next wave after resume (wave ' + gap.wave + ')');

// regression: restarting inside the break used to let the old timer bump the new run to wave 2
await page.evaluate(() => window.AW.restart());
const rs = await page.evaluate(async (clear) => {
  const A = window.AW, sleep = ms => new Promise(r => setTimeout(r, ms));
  const cleared = await (0, eval)('(' + clear + ')')();
  A.restart(); await sleep(2500);
  return { cleared, wave: A.stats.wave };
}, CLEAR_WAVE_1.toString());
rec('restart-in-gap', rs.cleared && rs.wave === 1, 'new run stays on wave ' + rs.wave);

// missile with nothing to lock: rack untouched, reticle flashes "no lock"
await page.evaluate(() => window.AW.restart());
const msl = await page.evaluate(() => {
  const before = document.getElementById('hudMsl').textContent;
  window.AW.missile();
  return { before, after: document.getElementById('hudMsl').textContent, nolock: document.getElementById('reticle').classList.contains('nolock') };
});
rec('missile-no-lock', msl.before === msl.after && msl.nolock, 'rack ' + msl.before + '→' + msl.after + ' · nolock=' + msl.nolock);

// sound: context exists after launch, M and the HUD button toggle mute
const snd = await page.evaluate(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const a = window.AW.sound;
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }));
  const b = window.AW.sound, icon = document.getElementById('sndBtn').textContent;
  document.getElementById('sndBtn').click();
  await sleep(50);
  return { ctx: a.ctx, engine: a.engine, mutedAfterM: b.muted, icon, mutedAfterBtn: window.AW.sound.muted };
});
rec('sound', snd.ctx && snd.mutedAfterM && snd.icon === '🔇' && !snd.mutedAfterBtn,
  'audio ctx=' + snd.ctx + ' engine=' + snd.engine + ' · M mutes (' + snd.icon + ') · button unmutes');

const over = await page.evaluate(() => { window.AW.hurt(400); return { state: window.AW.state, shown: !document.getElementById('results').classList.contains('hidden') }; });
rec('game-over', over.state === 'over' && over.shown, 'state=' + over.state + ' · results shown=' + over.shown);
await page.screenshot({ path: OUT + '/03-results.png' });

// ---- phone ----
const phone = await fresh({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
await phone.evaluate(() => window.AW.start());
await sleep(200);
const target = await phone.evaluate(() => { const el = document.elementFromPoint(80, 400); return el.id || el.className; });
await phone.touchscreen.tap(30, 400);
await sleep(700);
const sx = await phone.evaluate(() => window.AW.ship.x);
rec('touch-steer', target === 'view' && sx < -3, 'touch at mid-left lands on #' + target + ' · ship x=' + sx.toFixed(2));
const btn = await phone.evaluate(() => {
  const b = document.querySelector('.tbtn.fire').getBoundingClientRect();
  const el = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
  return el.className;
});
rec('touch-buttons', /tbtn fire/.test(btn), 'fire button still receives touches (' + btn + ')');
await phone.screenshot({ path: OUT + '/04-phone.png' });

rec('no-console-errors', consoleErrs.length === 0 && errors.length === 0,
  consoleErrs.concat(errors).slice(0, 2).join(' | ') || 'clean (font requests ignored)');

const pass = R.filter(r => r.pass).length;
console.log('\n=== ' + pass + '/' + R.length + ' passed ===');
await browser.close();
process.exit(pass === R.length ? 0 : 1);
