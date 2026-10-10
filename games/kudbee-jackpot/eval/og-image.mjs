// Regenerates the social share card (assets/og/jackpot.jpg, 1200x630) from the live game:
// the real reels after a real winning spin, composited with the title.
// Run: node games/kudbee-jackpot/eval/og-image.mjs
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, writeFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL = 'file://' + resolve(HERE, '..', 'index.html');
const OUT = process.env.OG_OUT || resolve(HERE, '..', '..', '..', 'assets', 'og', 'jackpot.jpg');

const launchOpts = { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'] };
if (existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOpts);

const page = await browser.newPage({ viewport: { width: 520, height: 900 }, deviceScaleFactor: 2 });
await page.goto(URL, { waitUntil: 'load' });
await page.evaluate(() => window.__jackpotTest.ready());
// Find a spin under this seed with a high-symbol line (7s or gems) and play it for real.
const nonce = await page.evaluate(async () => {
  const T = window.__jackpotTest, st = JSON.parse(localStorage.getItem('kd.jackpot.pf'));
  for (let n = st.nonce; n < st.nonce + 30000; n++) {
    const r = T.evaluateSpin(T.gridFromStops(await T.drawReels(st.serverSeed, st.clientSeed, n)), 10);
    if (!r.bonusTriggered && r.winningLines.some((w) => (w.symbol === 'SEVEN' || w.symbol === 'DIAMOND') && w.count >= 3)) return n;
  }
  return -1;
});
if (nonce < 0) throw new Error('no showcase spin found');
await page.evaluate((n) => { const st = JSON.parse(localStorage.getItem('kd.jackpot.pf')); st.nonce = n; localStorage.setItem('kd.jackpot.pf', JSON.stringify(st)); }, nonce);
await page.reload(); await page.evaluate(() => window.__jackpotTest.ready()); await page.waitForTimeout(300);
await page.click('#spinbtn');
await page.waitForFunction(() => !document.getElementById('spinbtn').disabled, null, { timeout: 15000 });
await page.waitForTimeout(1900);
await page.evaluate(() => { document.getElementById('helpbtn').style.display = 'none'; });
const reels = (await page.locator('#bezel').screenshot()).toString('base64');
await page.close();

const card = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await card.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0;width:1200px;height:630px;overflow:hidden;position:relative;font-family:'Space Grotesk','Helvetica Neue',Arial,sans-serif;
background:radial-gradient(120% 90% at 75% 50%,#3a1238 0%,#140a24 45%,#07050f 100%)">
<div style="position:absolute;inset:-300px;background:repeating-conic-gradient(from 0deg at 72% 50%,rgba(255,190,90,.07) 0 6deg,transparent 6deg 18deg)"></div>
<div style="position:absolute;right:46px;top:50%;transform:translateY(-50%);width:600px;filter:drop-shadow(0 0 40px rgba(255,170,60,.45))"><img src="data:image/png;base64,${reels}" style="width:600px;display:block"></div>
<div style="position:absolute;left:60px;top:118px;width:480px;color:#fff">
  <div style="font-size:24px;letter-spacing:7px;color:#ff9fd6;font-weight:700">KUDBEE JACKPOT</div>
  <div style="font-size:92px;line-height:.92;font-weight:800;margin-top:14px;letter-spacing:2px;background:linear-gradient(180deg,#fff6d0,#ffc54a 50%,#ff6a3d);-webkit-background-clip:text;color:transparent;filter:drop-shadow(0 0 18px rgba(255,160,60,.5))">NEON<br>FORTUNE</div>
  <div style="font-size:30px;margin-top:24px;color:#ffe7c4;font-weight:500;line-height:1.3">5 reels · 4 progressive jackpots<br>Provably fair spins</div>
  <div style="display:inline-block;margin-top:30px;padding:13px 26px;border:3px solid #ffd36b;border-radius:14px;color:#ffe39a;font-size:26px;font-weight:700;box-shadow:0 0 24px rgba(255,190,80,.45)">PLAY FREE · DEMO CHIPS</div>
</div>
</body>`);
await card.waitForTimeout(200);
const jpg = await card.screenshot({ type: 'jpeg', quality: 88 });
writeFileSync(OUT, jpg);
console.log('wrote', OUT, (jpg.length / 1024).toFixed(0) + ' KB', 'from nonce', nonce);
await browser.close();
