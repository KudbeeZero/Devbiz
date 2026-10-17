// Renders the social share card (Open Graph / Twitter) for Kudbee Archery from the live game: a 1200x630 frame of
// the bow at full draw on the Mountain Pass at sunset, with the title and the pitch drawn over it.
//   node games/kudbee-archery/tools/og-card.mjs   (writes assets/og/archery.jpg at the repo root; needs playwright)
import http from 'node:http';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, extname, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = resolve(HERE, '..', '..', '..');
const { chromium } = createRequire(resolve(HERE, '..', 'eval', 'x.js'))('playwright');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.png': 'image/png' };
const server = http.createServer((q, s) => { const p = join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!p.startsWith(ROOT) || !existsSync(p)) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); s.end(readFileSync(p)); });
await new Promise(r => server.listen(0, r));
const b = await chromium.launch(existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
const page = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto(`http://localhost:${server.address().port}/games/kudbee-archery/index.html`);
await page.waitForFunction(() => window.KARGame); await page.evaluate(() => document.fonts.ready);
await page.evaluate(() => {
  document.querySelector('.back-link').style.display = 'none';
  const g = KARGame, D = KAR.Store.data; D.tut = 15; D.tour.stars.fill(3); D.tourLv = 12; D.mode = 5; D.gear = { bow: 4, fletch: 4, sight: 3 };
  g.startMatch(); g.hintT = 0; g.match.wind = 2.6;
  KAR.UI.hud = () => {};                                     // no scoreboard on the card
  const sv = KAR.Render.setView.bind(KAR.Render); KAR.Render.setView = (...a) => { sv(...a); KAR.Render.cam.CX += 170; };   // the range sits right of the title
  const draw = g._render.bind(g);
  g._render = function () {
    this.drawing = true; this.draw = 1; this.holdT = 0.4; this.steady = true; this.sway = { x: 0, y: 0 }; this.aimX = -0.32; this.aimY = KAR.CFG.FACE_Y + 0.03;
    draw();
    const ctx = this.ctx, U = KAR.UI, L = KAR.Render.XL;
    ctx.save();
    const sh = ctx.createLinearGradient(L, 0, L + 560, 0); sh.addColorStop(0, 'rgba(14,10,36,0.78)'); sh.addColorStop(1, 'rgba(14,10,36,0)');
    ctx.fillStyle = sh; ctx.fillRect(L, 0, 560, 640);
    const x = L + 250;
    U.bubble(ctx, 'KUDBEE', x, 118, 50, '#ffffff', '#cfe9ff', -0.04);
    U.bubble(ctx, 'ARCHERY', x, 222, 104, '#fff27a', '#ff9a1f', -0.04);
    U.text(ctx, 'READ THE WIND', x, 296, 30, '#ffffff', 'center');
    U.text(ctx, 'HOLD YOUR BREATH', x, 336, 30, '#ffffff', 'center');
    U.text(ctx, 'HIT THE GOLD', x, 376, 30, '#ffe14d', 'center');
    const chip = (t, y, c) => { ctx.font = '400 26px ' + U.FONT; const w = ctx.measureText(t).width + 44; U.rr(ctx, x - w / 2 - 3, y - 3, w + 6, 52, 18); ctx.fillStyle = U.OUT; ctx.fill(); const gr = ctx.createLinearGradient(0, y, 0, y + 46); gr.addColorStop(0, c[0]); gr.addColorStop(1, c[1]); U.rr(ctx, x - w / 2, y, w, 46, 15); ctx.fillStyle = gr; ctx.fill(); U.text(ctx, t, x, y + 33, 26, '#ffffff', 'center'); };
    chip(KAR.TOUR.length + ' LEVELS · ' + KAR.VENUES.length + ' WORLDS · BOSSES', 410, ['#7ac7ff', '#1f5fa8']);
    chip('PLAY FREE IN YOUR BROWSER', 476, ['#a9ec62', '#2f8a2a']);
    U.text(ctx, 'KUDBEE GAMES STUDIO', x, 590, 20, '#cfe9ff', 'center');
    ctx.restore();
  };
});
await page.waitForTimeout(1500);
const png = await page.locator('#gameCanvas').screenshot({ type: 'jpeg', quality: 86 });
const out = resolve(ROOT, 'assets', 'og', 'archery.jpg'); writeFileSync(out, png);
console.log('wrote', out, png.length, 'bytes', await page.evaluate(() => [innerWidth, innerHeight, KARGame.canvas.style.width, KARGame.canvas.style.height]));
await b.close(); server.close();
