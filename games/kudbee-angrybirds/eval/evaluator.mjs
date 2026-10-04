// Kudbee Birds — Playwright + real-Chromium evaluator.
//   node evaluator.mjs            (writes screenshots to eval/out/, gitignored)
// Drives the shipped page with real pointer/keyboard input: menu, level select,
// slingshot launch, ability tap, keyboard aiming, pause, a full recorded win,
// the fail flow, progress persistence across reload, phone-sized viewport and
// reduced-motion.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL = process.env.BIRDS_URL || ('file://' + resolve(HERE, '..', 'index.html'));
const OUT = resolve(HERE, 'out');
mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const R = [];
const rec = (id, pass, note) => { R.push({ id, pass }); console.log((pass ? 'PASS' : 'FAIL'), id, '—', note); };

const opts = { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'] };
if (existsSync('/opt/pw-browsers/chromium')) opts.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(opts);

const sols = JSON.parse(readFileSync(resolve(HERE, 'solutions.json'), 'utf8'));
const errors = [];
const watch = page => {
  page.on('pageerror', e => errors.push('pageerror: ' + e));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text())) errors.push('console: ' + m.text()); });
};

async function open(viewport, ctxOpts) {
  const ctx = await browser.newContext(Object.assign({ viewport, deviceScaleFactor: 1 }, ctxOpts || {}));
  const page = await ctx.newPage();
  watch(page);
  await page.goto(URL);
  await page.waitForFunction(() => window.KABGame);
  await sleep(250);
  return { ctx, page };
}
const snap = page => page.evaluate(() => {
  const g = KABGame, w = g.world;
  return { screen: g.screen, ws: w.state, score: w.score, enemies: w.enemiesAlive(), shots: w.shots, queue: w.queue.length, tick: w.tick, ability: w.abilityUsed, stars: w.stars, level: w.index, reduce: g.reduceMotion };
});
// logical (960x600) -> client coords
const toClient = (page, x, y) => page.evaluate(([x, y]) => {
  const r = document.getElementById('gameCanvas').getBoundingClientRect();
  return { x: r.left + x * r.width / 960, y: r.top + y * r.height / 600 };
}, [x, y]);
const clickBtn = async (page, id) => {
  const p = await page.evaluate(id => {
    const b = KAB.UI.buttons.find(b => b.id === id); if (!b) return null;
    const r = document.getElementById('gameCanvas').getBoundingClientRect();
    return { x: r.left + (b.x + b.w / 2) * r.width / 960, y: r.top + (b.y + b.h / 2) * r.height / 600 };
  }, id);
  if (!p) throw new Error('no button ' + id);
  await page.mouse.click(p.x, p.y);
};
// Same whole-pixel pull point the solver used; `abilityAt` fires the ability on an exact
// simulation tick (wall-clock timing would make a recorded line non-reproducible).
async function drag(page, angle, pull, abilityAt) {
  const a = angle * Math.PI / 180;
  const from = await toClient(page, 150, 436);
  const to = await toClient(page, Math.round(150 - Math.cos(a) * pull), Math.round(436 + Math.sin(a) * pull));
  if (abilityAt != null) await page.evaluate(at => {
    const w = KABGame.world;
    if (!w.__orig) { w.__orig = w.step; w.step = function () { if (this.__at != null && this.state === 'flying' && this.tick - this.launchTick === this.__at) { this.useAbility(); this.__at = null; } return this.__orig.apply(this, arguments); }; }
    w.__at = at;
  }, abilityAt);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
}
const waitFor = async (page, fn, ms = 20000) => { try { await page.waitForFunction(fn, null, { timeout: ms }); return true; } catch (e) { return false; } };

// ---------------------------------------------------------------------------
{
  const { ctx, page } = await open({ width: 960, height: 600 });
  rec('loads', errors.length === 0 && (await snap(page)).screen === 'menu', 'page loads on the menu with no errors');

  const px = await page.evaluate(() => {
    const c = document.getElementById('gameCanvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const seen = new Set(); let lit = 0;
    for (let i = 0; i < d.length; i += 4 * 97) { seen.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4)); if (d[i] + d[i + 1] + d[i + 2] > 300) lit++; }
    return { colors: seen.size, lit };
  });
  rec('menu-renders', px.colors > 40 && px.lit > 20, `menu has ${px.colors} distinct tones, ${px.lit} bright samples`);
  await page.screenshot({ path: OUT + '/01-menu.png' });

  await clickBtn(page, 'levels'); await sleep(200);
  const sel = await page.evaluate(() => ({ screen: KABGame.screen, tiles: KAB.UI.buttons.filter(b => /^lvl/.test(b.id)).map(b => !b.disabled) }));
  rec('level-select-locks', sel.screen === 'select' && sel.tiles.length === 8 && sel.tiles[0] && sel.tiles.slice(1).every(t => !t), `8 tiles; only level 1 open on a fresh profile (${sel.tiles.map(t => t ? 'open' : 'locked').join(',')})`);
  await page.screenshot({ path: OUT + '/02-select.png' });

  await clickBtn(page, 'lvl0'); await sleep(500);
  let s = await snap(page);
  rec('start-level', s.screen === 'play' && s.ws === 'ready' && s.enemies === 3 && s.queue === 2, `level 1 ready: ${s.enemies} drones, ${s.queue + 1} birds`);
  await page.screenshot({ path: OUT + '/03-level1.png' });

  // mouse launch + visible aim
  const a = await toClient(page, 150, 436); await page.mouse.move(a.x, a.y); await page.mouse.down();
  const to = await toClient(page, 85, 478); await page.mouse.move(to.x, to.y, { steps: 5 }); await sleep(150);
  await page.screenshot({ path: OUT + '/04-aiming.png' });
  await page.mouse.up(); await sleep(120);
  s = await snap(page);
  rec('mouse-launch', s.ws === 'flying' && s.shots === 1, `drag-release launches the bird (state=${s.ws}, shots=${s.shots})`);
  await sleep(150);
  await page.mouse.click(480, 300);                       // tap anywhere in flight = ability
  await sleep(80);
  s = await snap(page);
  rec('ability-tap', s.ability === true, 'tapping during flight triggers the bird ability');
  await page.screenshot({ path: OUT + '/05-flight.png' });
  await waitFor(page, () => KABGame.world.state !== 'flying' && KABGame.world.state !== 'resolve' || KABGame.screen !== 'play');

  // keyboard aiming
  await page.keyboard.press('r'); await sleep(300);
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowRight');
  await sleep(100);
  await page.screenshot({ path: OUT + '/06-keyboard-aim.png' });
  await page.keyboard.press('Space'); await sleep(120);
  s = await snap(page);
  rec('keyboard-launch', s.shots === 1 && s.ws === 'flying', `arrows aim, Space fires (shots=${s.shots}, state=${s.ws})`);

  // pause freezes the simulation
  await page.keyboard.press('r'); await sleep(300);
  await page.keyboard.press('p'); await sleep(100);
  const t1 = await snap(page); await sleep(400); const t2 = await snap(page);
  await page.screenshot({ path: OUT + '/07-paused.png' });
  rec('pause-freezes', t1.screen === 'paused' && t1.tick === t2.tick, `paused; tick ${t1.tick} -> ${t2.tick}`);
  await page.keyboard.press('p'); await sleep(150);
  s = await snap(page);
  rec('resume', s.screen === 'play', 'P resumes play');

  // fps
  const fps = await page.evaluate(() => new Promise(res => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else res(n); }; requestAnimationFrame(f); }));
  rec('fps', fps >= 30, `${fps} frames/s in headless Chromium`);

  // recorded win on level 1 with real mouse input
  await page.keyboard.press('r'); await sleep(300);
  for (const shot of sols[0].shots) {
    const ok = await waitFor(page, () => KABGame.world.state === 'ready' || KABGame.screen !== 'play', 25000);
    if (!ok || (await snap(page)).screen !== 'play') break;
    await drag(page, shot.angle, shot.pull, shot.ability);
  }
  const won = await waitFor(page, () => KABGame.screen === 'won', 30000);
  s = await snap(page);
  await sleep(1800);
  await page.screenshot({ path: OUT + '/08-won.png' });
  rec('win-flow', won && s.stars >= 1 && s.enemies === 0, `recorded solution wins level 1 with real input: ${s.stars}★, score ${s.score}`);

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('kudbee.birds.v2') || '{}'));
  rec('progress-saved', saved.levels && saved.levels[0] && saved.levels[0].stars >= 1 && saved.levels[0].score === s.score, `localStorage: ${JSON.stringify(saved.levels && saved.levels[0])}`);

  await page.reload(); await page.waitForFunction(() => window.KABGame); await sleep(250);
  await clickBtn(page, 'levels'); await sleep(200);
  const sel2 = await page.evaluate(() => KAB.UI.buttons.filter(b => /^lvl/.test(b.id)).map(b => !b.disabled));
  rec('level-unlocks', sel2[0] && sel2[1] && !sel2[2], `after a win + reload, level 2 is open and 3 still locked (${sel2.map(t => t ? 1 : 0).join('')})`);
  await page.screenshot({ path: OUT + '/09-select-progress.png' });

  // fail flow: waste every bird
  await clickBtn(page, 'lvl1'); await sleep(300);
  for (let i = 0; i < 3; i++) {
    const ok = await waitFor(page, () => KABGame.world.state === 'ready' || KABGame.screen !== 'play', 25000);
    if (!ok || (await snap(page)).screen !== 'play') break;
    await drag(page, 80, 20);
  }
  const lost = await waitFor(page, () => KABGame.screen === 'lost', 30000);
  await sleep(1200);
  await page.screenshot({ path: OUT + '/10-lost.png' });
  rec('lose-flow', lost, 'running out of birds shows the fail screen (no hang)');
  await clickBtn(page, 'restart'); await sleep(300);
  s = await snap(page);
  rec('retry-same-level', s.screen === 'play' && s.level === 1 && s.ws === 'ready', `Try Again restarts level ${s.level + 1}, not level 1`);
  await ctx.close();
}

// phone-sized viewport: canvas scales and pointer coords still map correctly
{
  const { ctx, page } = await open({ width: 390, height: 700 }, { hasTouch: true, isMobile: true });
  await clickBtn(page, 'levels'); await sleep(150); await clickBtn(page, 'lvl0'); await sleep(400);
  const r = await page.evaluate(() => { const b = document.getElementById('gameCanvas').getBoundingClientRect(); return { w: b.width, h: b.height, ratio: b.width / b.height }; });
  await drag(page, 40, 90); await sleep(150);
  const s = await snap(page);
  await page.screenshot({ path: OUT + '/11-phone.png' });
  rec('phone-scaling', r.w <= 390.5 && Math.abs(r.ratio - 1.6) < 0.02 && s.shots === 1, `canvas ${r.w.toFixed(0)}x${r.h.toFixed(0)} fits 390px wide; drag-launch works scaled (shots=${s.shots})`);
  await ctx.close();
}

// reduced motion
{
  const { ctx, page } = await open({ width: 960, height: 600 }, { reducedMotion: 'reduce' });
  const reduce = (await snap(page)).reduce;
  await clickBtn(page, 'levels'); await sleep(100); await clickBtn(page, 'lvl0'); await sleep(300);
  await drag(page, 25, 90); await sleep(2500);
  const shake = await page.evaluate(() => KABGame.shake);
  rec('reduced-motion', reduce === true && shake === 0, `prefers-reduced-motion honoured (reduce=${reduce}, shake=${shake})`);
  await ctx.close();
}

rec('no-console-errors', errors.length === 0, errors.length ? errors[0] : 'no page or console errors during the whole run');
await browser.close();
const failed = R.filter(r => !r.pass).length;
console.log(`\n=== ${R.length - failed}/${R.length} passed ===`);
process.exit(failed ? 1 : 0);
