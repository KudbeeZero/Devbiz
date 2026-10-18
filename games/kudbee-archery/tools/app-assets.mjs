// Kudbee Archery — the app's install assets, rendered from the game (Playwright + Chromium).
//   node tools/app-assets.mjs
// assets/icon-maskable-512.png   the icon inside Android's safe circle: the art at 80%, its own edge pixels stretched
//                                out to the corners so a round / squircle mask never cuts the arrow
// assets/screen-map.jpg          the level map and a shot at full draw, as a landscape phone shows them (844x390 @2x):
// assets/screen-play.jpg         Android's richer install sheet shows these (manifest "screenshots")
import http from 'node:http';
import { readFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { resolve, extname, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const GAME = resolve(dirname(fileURLToPath(import.meta.url)), '..'), ROOT = resolve(GAME, '..', '..');
const { chromium } = createRequire(join(GAME, 'eval', 'x.js'))('playwright');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((q, s) => { let p = join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html'); if (!p.startsWith(ROOT) || !existsSync(p)) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); s.end(readFileSync(p)); });
await new Promise(r => server.listen(0, r));
const BASE = `http://localhost:${server.address().port}/games/kudbee-archery/`;
const browser = await chromium.launch(existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});

// the maskable icon
{
  const page = await browser.newPage();
  await page.goto(BASE + 'manifest.webmanifest');
  const url = await page.evaluate(async () => {
    const im = new Image(); im.src = 'assets/icon-512.png'; await im.decode();
    const N = 512, k = 0.8, s = N * k, o = (N - s) / 2, c = document.createElement('canvas'); c.width = c.height = N;
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
    x.drawImage(im, o, o, s, s);
    x.drawImage(im, 0, 0, 1, N, 0, o, o, s); x.drawImage(im, N - 1, 0, 1, N, o + s, o, o, s);      // left + right: the edge columns, stretched
    x.drawImage(c, 0, o, N, 1, 0, 0, N, o); x.drawImage(c, 0, o + s - 1, N, 1, 0, o + s, N, o);     // top + bottom: the edge rows, stretched
    return c.toDataURL('image/png');
  });
  writeFileSync(join(GAME, 'assets', 'icon-maskable-512.png'), Buffer.from(url.split(',')[1], 'base64'));
  await page.close();
}

// the screenshots: a landscape phone, a save with a few worlds open
{
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.addInitScript(() => { try { localStorage.setItem('kudbee.archery.v1', JSON.stringify({ tut: 15, visits: 1, install: 1, tourLv: 3, tour: { stars: [3, 3, 2, 0, 0, 0].concat(Array(42).fill(0)), best: Array(48).fill(0) } })); } catch (e) { /* ignore */ } });
  await page.goto(BASE + 'index.html'); await page.waitForFunction(() => window.KARGame && document.fonts.status === 'loaded');
  await page.evaluate(() => { KARGame.activate('levels'); KARGame.worldView = 0; });
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(GAME, 'assets', 'screen-map.jpg'), type: 'jpeg', quality: 82 });
  await page.evaluate(() => { const D = KAR.Store.data; D.tourLv = 1; KARGame.startMatch(); });
  await page.waitForFunction(() => KARGame.screen === 'play' && KARGame.bp === 'ready');
  await page.evaluate(() => { KARGame.hintT = 0; KARGame._beginDraw(); const h = KAR.Bot.hold(KARGame.match); KARGame.aimX = h.x; KARGame.aimY = h.y; });      // the sight on the hold-off for this wind
  await page.waitForFunction(() => KARGame.draw >= 1); await page.waitForTimeout(250);
  await page.screenshot({ path: join(GAME, 'assets', 'screen-play.jpg'), type: 'jpeg', quality: 82 });
  await ctx.close();
}
await browser.close(); server.close();
console.log('wrote assets/icon-maskable-512.png, assets/screen-map.jpg, assets/screen-play.jpg');
