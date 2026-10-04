// Kudbee Archery — browser rubric (Playwright + Chromium, real pointer/keyboard input).
//   node evaluator.mjs     (serves the repo over local HTTP)
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
const URL = `http://localhost:${server.address().port}/games/kudbee-archery/index.html`;

const R = [];
const rec = (id, pass, note) => { R.push(pass); console.log(pass ? 'PASS' : 'FAIL', id, '—', note); };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(URL); await page.waitForFunction(() => window.KARGame);

const box = await page.locator('#gameCanvas').boundingBox();
const toPx = (x, y) => [box.x + x * box.width / 960, box.y + y * box.height / 640];
const click = async id => { const b = await page.evaluate(i => { const x = KAR.UI.buttons.find(b => b.id === i); return x && { x: x.x + x.w / 2, y: x.y + x.h / 2 }; }, id); if (!b) return false; await page.mouse.click(...toPx(b.x, b.y)); return true; };
const G = fn => page.evaluate(fn);
const clickWhen = async id => { await page.waitForFunction(i => KAR.UI.buttons.some(b => b.id === i), id, { timeout: 5000 }).catch(() => {}); return click(id); };
const waitFor = (fn, ms = 20000) => page.waitForFunction(fn, null, { timeout: ms }).then(() => true, () => false);

rec('boots-clean', errors.length === 0 && await G(() => KAR.UI.buttons.length > 0), `menu renders with ${await G(() => KAR.UI.buttons.length)} buttons, ${errors.length} console errors`);
await page.screenshot({ path: `${OUT}/menu.png` });

await click('d3'); await click('d2');
rec('settings-persist', await G(() => { const d = JSON.parse(localStorage.getItem('kudbee.archery.v1')); return d.dist === 2 && d.mode === 0; }), '50 m selected and saved');

await click('play');
rec('range-starts', await G(() => KARGame.screen === 'play' && KARGame.match.mode === 'range' && KARGame.match.dist === 50 && KARGame.bp === 'ready'), 'range screen at 50 m, ready to shoot');

// draw with a real press-and-hold, aim with the pointer, check the draw meter rises
await page.mouse.move(...toPx(480, 318)); await page.mouse.down();
await page.waitForTimeout(500);
const d1 = await G(() => KARGame.draw);
await waitFor(() => KARGame.draw >= 1, 3000);
rec('draw-meter', d1 > 0.25 && d1 < 0.9 && await G(() => KARGame.draw >= 1), `drawing climbs (${d1.toFixed(2)} at 0.5 s) to a full draw`);
await page.screenshot({ path: `${OUT}/aim.png` });

// the sight sways at full draw; holding breath (B) shrinks the sway
const amp = async hold => {
  if (hold) await page.keyboard.down('b');
  let mx = 0; for (let i = 0; i < 25; i++) { await page.waitForTimeout(40); mx = Math.max(mx, await G(() => Math.hypot(KARGame.sway.x, KARGame.sway.y))); }
  if (hold) await page.keyboard.up('b'); return mx;
};
const loose = await amp(false), steady = await amp(true);
rec('breath-steadies', loose > 0.01 && steady < loose * 0.7, `sight sway ${(loose * 100).toFixed(1)} cm free vs ${(steady * 100).toFixed(1)} cm holding breath`);

await page.mouse.up();
rec('loose-flies', await waitFor(() => KARGame.bp === 'flight' || KARGame.bp === 'result', 2000), 'releasing the mouse looses the arrow');
await page.waitForTimeout(250); await page.screenshot({ path: `${OUT}/flight.png` });
await waitFor(() => KARGame.bp === 'result', 8000);
const r1 = await G(() => ({ ring: KARGame.flight.res.ring, total: KARGame.match.total(0), n: KARGame.match.arrows[0].length }));
rec('arrow-scores', r1.n === 1 && r1.total === r1.ring, `arrow 1 scored ${r1.ring}; the scoreboard shows ${r1.total}`);
await page.screenshot({ path: `${OUT}/hit.png` });
await waitFor(() => KARGame.bp === 'ready', 5000);

// a too-short draw does not shoot
await page.mouse.move(...toPx(480, 318)); await page.mouse.down(); await page.waitForTimeout(150); await page.mouse.up();
rec('short-draw-cancels', await G(() => KARGame.bp === 'ready' && KARGame.match.arrows[0].length === 1), 'a quick tap does not loose an arrow');

// keyboard shot: Space draws and releases
await page.keyboard.down(' '); await waitFor(() => KARGame.draw >= 1, 3000); await page.keyboard.up(' ');
rec('keyboard-shot', await waitFor(() => KARGame.match.arrows[0].length === 2, 8000), 'holding and releasing Space shoots');
await waitFor(() => KARGame.bp === 'ready', 8000);

// pause freezes the shot clock
await page.keyboard.press('p');
const t0 = await G(() => KARGame.bpT); await page.waitForTimeout(350);
rec('pause', await G(() => KARGame.screen === 'paused') && await page.evaluate(v => KARGame.bpT === v, t0), 'P pauses and the clock stops');
await page.screenshot({ path: `${OUT}/pause.png` });
await click('resume');
rec('resume', await G(() => KARGame.screen === 'play'), 'resume returns to the range');

// finish: put the range on its very last arrow, shoot it for real
await G(() => { const m = KARGame.match; m.endNo = m.ends - 1; m.arrowNo = m.per - 1; });
await waitFor(() => KARGame.bp === 'ready', 8000);
await page.mouse.move(...toPx(480, 318)); await page.mouse.down(); await waitFor(() => KARGame.draw >= 1, 3000); await page.mouse.up();
rec('range-ends', await waitFor(() => KARGame.screen === 'over', 15000), `the range ends on the results screen (${await G(() => KARGame.match.total(0))} points)`);
await page.screenshot({ path: `${OUT}/over.png` });
rec('best-saved', await G(() => JSON.parse(localStorage.getItem('kudbee.archery.v1')).best[2] === KARGame.match.total(0) && JSON.parse(localStorage.getItem('kudbee.archery.v1')).stats.arrows >= 3), 'best score and arrow count are saved');

// duel: the CPU takes its arrows
await clickWhen('menu'); await page.waitForTimeout(150); await clickWhen('mode1'); await clickWhen('lv1'); await clickWhen('play');
rec('duel-starts', await G(() => KARGame.match.mode === 'duel' && KARGame.screen === 'play'), 'duel vs CPU starts');
await waitFor(() => KARGame.bp === 'ready' && KARGame.match.shooter === 0, 5000);
await page.mouse.move(...toPx(480, 318)); await page.mouse.down(); await waitFor(() => KARGame.draw >= 1, 3000); await page.mouse.up();
rec('cpu-replies', await waitFor(() => KARGame.match.arrows[1].length === 1, 20000), 'after your arrow the CPU draws, aims and shoots one of its own');
await page.screenshot({ path: `${OUT}/duel.png` });

await page.setViewportSize({ width: 390, height: 780 });
rec('mobile-fit', await G(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no horizontal scroll at phone width');
rec('no-errors', errors.length === 0, `${errors.length} page errors${errors.length ? ': ' + errors[0] : ''}`);
await browser.close(); server.close();
const fail = R.filter(x => !x).length;
console.log(`\n=== ${R.length - fail}/${R.length} passed ===`);
process.exit(fail ? 1 : 0);
