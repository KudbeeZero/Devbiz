// Kudbee Cornhole — browser rubric (Playwright + Chromium, real pointer/keyboard input).
//   node evaluator.mjs     (serves the repo over local HTTP; file:// taints canvas)
import http from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, extname, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'out'); mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.png': 'image/png', '.css': 'text/css' };
const server = http.createServer((q, s) => {
  const p = join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !existsSync(p)) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); s.end(readFileSync(p));
});
await new Promise(r => server.listen(0, r));
const URL = `http://localhost:${server.address().port}/games/kudbee-cornhole/index.html`;

const R = [];
const rec = (id, pass, note) => { R.push(pass); console.log(pass ? 'PASS' : 'FAIL', id, '—', note); };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(URL); await page.waitForFunction(() => window.KCHGame);

const box = await page.locator('#gameCanvas').boundingBox();
const toPx = (x, y) => [box.x + x * box.width / 960, box.y + y * box.height / 640];
const click = async id => { const b = await page.evaluate(i => { const x = KCH.UI.buttons.find(b => b.id === i); return x && { x: x.x + x.w / 2, y: x.y + x.h / 2 }; }, id); if (!b) return false; await page.mouse.click(...toPx(b.x, b.y)); return true; };
const G = fn => page.evaluate(fn);
const waitFor = (fn, ms = 20000) => page.waitForFunction(fn, null, { timeout: ms }).then(() => true, () => false);

rec('boots-clean', errors.length === 0 && await G(() => KCH.Game && KCH.UI.buttons.length > 0), `menu renders with ${await G(() => KCH.UI.buttons.length)} buttons, ${errors.length} console errors`);
await page.screenshot({ path: `${OUT}/menu.png` });

// difficulty select persists
await click('lv2');
rec('difficulty-persists', await G(() => JSON.parse(localStorage.getItem('kudbee.cornhole.v2')).difficulty === 2), 'LEGEND selected and saved');

// start a match, throw by real drag/release
await click('play');
rec('match-starts', await G(() => KCHGame.screen === 'play' && KCHGame.match.order.length === 8), 'play screen, 8 bags in the round');
await waitFor(() => KCHGame.humanTurn());
const before = await G(() => KCHGame.match.sim.bags.length);
const aimPt = await G(() => { const p = KCH.Render.projectBoard ? KCH.Render.projectBoard(0, KCH.CFG.HOLE_S) : null; return p; });
const tx = 480, ty = aimPt ? aimPt.y : 300;
await page.mouse.move(...toPx(tx, ty)); await page.mouse.down(); await page.mouse.move(...toPx(tx, ty + 2)); 
await page.screenshot({ path: `${OUT}/aim.png` });
await page.mouse.up();
rec('pointer-throw', await waitFor(() => KCHGame.match.sim.bags.length > 0 || KCHGame.match.idx > 0, 5000), 'releasing the pointer over the board launches a bag');
await page.waitForTimeout(1500); await page.screenshot({ path: `${OUT}/flight.png` });

// CPU takes its turn and the turn returns to the human
rec('cpu-replies', await waitFor(() => KCHGame.match.idx >= 2 && KCHGame.humanTurn(), 30000), 'CPU throws and control returns to the player');

// keyboard throw + style toggle
const st0 = await G(() => KCHGame.style); await page.keyboard.press('s');
rec('style-toggle', await G(() => KCHGame.style) !== st0, 'S key toggles slide/flop');
await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp'); await page.keyboard.press(' ');
const idx1 = await G(() => KCHGame.match.idx);
rec('keyboard-throw', await waitFor(() => KCHGame.match.idx > 2 || KCHGame.match.sim.bags.length >= 3, 5000), `arrow keys + Space throw (bags thrown ${idx1})`);

// pause freezes, resume continues
await waitFor(() => KCHGame.humanTurn(), 30000);
await page.keyboard.press('p');
rec('pause', await G(() => KCHGame.screen === 'paused'), 'P pauses');
await page.screenshot({ path: `${OUT}/pause.png` });
await click('resume');
rec('resume', await G(() => KCHGame.screen === 'play'), 'resume returns to play');

// play a whole round with the keyboard so we see the summary
let guard = 0;
while (guard++ < 150 && await G(() => KCHGame.screen === 'play')) {
  if (await G(() => KCHGame.humanTurn())) { await page.keyboard.press('ArrowUp'); await page.keyboard.press(' '); }
  await page.waitForTimeout(400);
}
rec('round-summary', await G(() => KCHGame.screen === 'roundEnd' || KCHGame.screen === 'over'), `round ends on the summary card (screen=${await G(() => KCHGame.screen)})`);
await page.screenshot({ path: `${OUT}/round.png` });
await click('next');
rec('next-round', await G(() => KCHGame.screen === 'play' || KCHGame.screen === 'over'), 'continue starts the next round (or finishes the match)');

// practice mode
await G(() => KCHGame.activate('menu'));
await waitFor(() => KCHGame.screen === 'menu' && KCH.UI.buttons.some(b => b.id === 'practice'), 3000);
await click('practice');
await waitFor(() => KCHGame.screen === 'play', 3000);
rec('practice', await G(() => KCHGame.screen === 'play' && KCHGame.match.solo), 'practice mode: solo');

// mobile viewport: no horizontal scroll, canvas fits
await page.setViewportSize({ width: 390, height: 780 });
rec('mobile-fit', await G(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no horizontal scroll at phone width');

rec('no-errors', errors.length === 0, `${errors.length} page errors${errors.length ? ': ' + errors[0] : ''}`);
await browser.close(); server.close();
const fail = R.filter(x => !x).length;
console.log(`\n=== ${R.length - fail}/${R.length} passed ===`);
process.exit(fail ? 1 : 0);
