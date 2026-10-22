// Kudbee Abyss — the app's install assets, rendered from the game (Playwright + Chromium).
//   node games/kudbee-abyss/tools/app-assets.mjs
// assets/app/icon-512.png, icon-192.png    the home-screen icon: the Eye from the game's own art (assets/world/abyss-eye.webp), cropped
// assets/app/apple-touch-icon.png (180)    tight and darkened at the edges, so it reads at 60px on a home screen
// assets/app/icon-maskable-512.png         the same Eye smaller, inside Android's safe circle (a round or squircle mask never cuts it)
// assets/app/screen-*.jpg                  the phone as a real phone shows it (390x844 @2x): the lock screen at 3:07, a thread in the
//                                          middle of the night, the App Store. Android's richer install sheet shows these (manifest "screenshots")
// Re-run it when the art or the screens change, and bump V in sw.js (it keeps these files).
import http from 'node:http';
import { readFileSync, existsSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, extname, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = resolve(HERE, '..', '..', '..'), GAME = resolve(HERE, '..'), OUT = join(GAME, 'assets', 'app');
const { chromium } = createRequire(resolve(ROOT, 'package.json'))('playwright');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((q, s) => { let p = join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html'); if (!p.startsWith(ROOT) || !existsSync(p)) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); s.end(readFileSync(p)); });
await new Promise(r => server.listen(0, r));
const BASE = `http://localhost:${server.address().port}/games/kudbee-abyss/`;
const browser = await chromium.launch(existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
mkdirSync(OUT, { recursive: true });
const png = (url, name) => writeFileSync(join(OUT, name), Buffer.from(url.split(',')[1], 'base64'));

// the icons: one crop of the Eye, drawn at every size from the full-resolution art (never a downscaled copy of a downscale)
{
  const page = await browser.newPage();
  await page.goto(BASE + 'assets/world/abyss-eye.webp');
  const out = await page.evaluate(async () => {
    const im = new Image(); im.src = location.href; await im.decode();
    // the Eye sits at about (683, 118) in the 1280x720 art; `half` is how much of the sky around it the icon keeps
    const draw = (N, half, round) => {
      const c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d');
      x.fillStyle = '#07020f'; x.fillRect(0, 0, N, N);
      const cx = 683, cy = 150, sx = cx - half, sy = Math.max(0, cy - half);
      x.drawImage(im, sx, sy, half * 2, half * 2, 0, 0, N, N);
      const v = x.createRadialGradient(N / 2, N * 0.42, N * 0.18, N / 2, N / 2, N * 0.72);   // a vignette: the Eye glows, the edges fall away to night
      v.addColorStop(0, 'rgba(7,2,15,0)'); v.addColorStop(1, 'rgba(7,2,15,0.92)'); x.fillStyle = v; x.fillRect(0, 0, N, N);
      const g = x.createRadialGradient(N / 2, N * 0.4, 0, N / 2, N * 0.4, N * 0.3);           // and a little more of its own red light
      g.addColorStop(0, 'rgba(255,60,90,0.28)'); g.addColorStop(1, 'rgba(255,60,90,0)'); x.globalCompositeOperation = 'screen'; x.fillStyle = g; x.fillRect(0, 0, N, N);
      return c.toDataURL('image/png');
    };
    return { i512: draw(512, 150), i192: draw(192, 150), apple: draw(180, 150), mask: draw(512, 200) };
  });
  png(out.i512, 'icon-512.png'); png(out.i192, 'icon-192.png'); png(out.apple, 'apple-touch-icon.png'); png(out.mask, 'icon-maskable-512.png');
  await page.close();
}

// the screenshots: a real phone held upright, a save that has been through a few nights
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://fonts.*/**', r => r.abort());
  await ctx.addInitScript(`localStorage.setItem('kudbee.abyss.v2', JSON.stringify({ guided: true, found: { dawn: 1, song: 1, keeper: 1, chorus: 1, drowned: 1, nightline: 1 }, deduced: { two_warnings: 1 }, apps: { lantern: 1, hush: 1 }, stSeen: { lantern: 1, hush: 1, echo: 1, ledger: 1, tide: 1, redial: 1, pin: 1 } })); window.__abyOpening = 'awakening';`);
  const page = await ctx.newPage();
  await page.goto(BASE + 'index.html');
  await page.waitForFunction(() => document.getElementById('boot').classList.contains('gone') && window.ABY && ABY.Phone && ABY.Phone.screen === 'lock', null, { timeout: 20000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(OUT, 'screen-lock.jpg'), type: 'jpeg', quality: 86 });
  // a thread in the middle of the night: Day Four, the contact list with every number that ever held the phone
  await page.evaluate(() => ABY.debug.goto('d4_contact', { mem: 6, light: 1, flags: { app_lantern: 1 } }));
  for (let i = 0; i < 30 && await page.evaluate(() => ABY.game.delivering); i++) { await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))); await page.waitForTimeout(160); }
  await page.waitForSelector('#replies.on .chip');
  const calm = async () => { await page.evaluate(() => ABY.Phone.hideBanner()); await page.waitForTimeout(700); };   // (a "New clue" banner would cover the top of the shot)
  await calm();
  await page.screenshot({ path: join(OUT, 'screen-thread.jpg'), type: 'jpeg', quality: 86 });
  await page.evaluate(() => ABY.Phone.show('store')); await calm();
  await page.screenshot({ path: join(OUT, 'screen-store.jpg'), type: 'jpeg', quality: 86 });
  await ctx.close();
}
await browser.close(); server.close();
console.log('wrote', OUT);
