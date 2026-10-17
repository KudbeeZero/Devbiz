import { chromium } from 'playwright';
import http from 'node:http'; import { readFileSync, existsSync } from 'node:fs'; import { join, extname } from 'node:path';
const ROOT = '/home/user/Devbiz', OUT = process.argv[2];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
const server = http.createServer((q, s) => { const p = join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!existsSync(p)) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); s.end(readFileSync(p)); });
await new Promise(r => server.listen(0, r));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }), errs = [];
for (const [nm, o] of [['d', { viewport: { width: 960, height: 640 } }], ['p', { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
  const page = await (await b.newContext(o)).newPage(); page.on('pageerror', e => errs.push(e.message));
  await page.goto(`http://localhost:${server.address().port}/games/kudbee-archery/index.html`); await page.waitForFunction(() => window.KARGame); await page.waitForTimeout(500);
  await page.evaluate(() => { const T = KAR.Store.data.tour; [3, 2, 3, 1, 2, 3, 2, 1].forEach((v, i) => T.stars[i] = v); KAR.Store.data.tourLv = 8; KAR.Store.data.mode = 5; });
  await page.waitForTimeout(300); await page.screenshot({ path: `${OUT}/lv-${nm}-menu.png` });
  for (const w of [0, 1, 2, 3]) { await page.evaluate(w => { KARGame.activate('levels'); KARGame.worldView = w; }, w); await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/lv-${nm}-w${w}.png` }); }
  await page.evaluate(() => { KAR.Store.data.tourLv = 23; KAR.Store.data.tour.stars.fill(1, 0, 23); KARGame.startMatch(); }); await page.waitForTimeout(700); await page.screenshot({ path: `${OUT}/lv-${nm}-boss.png` });
  await page.evaluate(() => { const g = KARGame, m = g.match; KAR.Store.data.tourLv = 5; g.startMatch(); const mm = g.match; while (!mm.over) mm.shoot(0, KAR.CFG.FACE_Y, 0, 0, 1); KAR.Store.data.tour.stars[5] = 0; g._finishMatch(); }); await page.waitForTimeout(1500); await page.screenshot({ path: `${OUT}/lv-${nm}-over.png` });
}
console.log('errors', errs); await b.close(); server.close();
