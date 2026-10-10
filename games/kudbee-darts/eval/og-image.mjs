// Regenerates the social share card (assets/og/darts.jpg, 1200x630) from the live game:
// a real in-game "180" (three darts in the treble 20) composited with the title.
// Run: node games/kudbee-darts/eval/og-image.mjs
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, writeFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL = 'file://' + resolve(HERE, '..', 'index.html');
const OUT = process.env.OG_OUT || resolve(HERE, '..', '..', '..', 'assets', 'og', 'darts.jpg');

const launchOpts = { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'] };
if (existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOpts);

const page = await browser.newPage({ viewport: { width: 960, height: 720 }, deviceScaleFactor: 2 });
await page.addInitScript(() => { let a = 99; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; });
await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(500);
await page.evaluate(() => {
  const g = window.DARTS; g.loop.stop();
  g.selOpp = 'hotseat'; g._startMatch();
  const skin = g.players[0].skin(), parts = g.players[0].dartParts, b = g.board;
  const tip = b.targetPoint('T20');
  KD.Sprites.STUCK_LEN = 96;   // promo card only: bigger than in-game so the darts read at thumbnail size
  const spots = [[-14, -4, 1.15], [12, -8, 1.95], [-1, 6, 1.57]];   // nose-down, flights above the tip
  spots.forEach((s, i) => g.stuckDarts.push({ x: tip.x + s[0], y: tip.y + s[1], skin, parts, ang: s[2], landT: -10 }));
  g.hitFlash = { res: b.hitTest(tip.x, tip.y), life: 1, col: '#7CFFb2' };
  g.dartsThisTurn = 3;
  g.time = 50;
  for (let i = 0; i < 3; i++) g._render();
});
const board = (await page.screenshot({ clip: { x: 190, y: 8, width: 580, height: 580 } })).toString('base64');
await page.close();

const card = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await card.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0;width:1200px;height:630px;overflow:hidden;position:relative;font-family:'Space Grotesk','Helvetica Neue',Arial,sans-serif;
background:radial-gradient(ellipse at 78% 50%,#12306a 0%,#0a1230 45%,#05050f 100%)">
<div style="position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(57,230,255,.035) 0 2px,transparent 2px 6px)"></div>
<div style="position:absolute;left:550px;top:-32px;width:700px;height:700px;filter:drop-shadow(0 0 45px rgba(57,230,255,.45))"><img src="data:image/png;base64,${board}" style="width:700px;height:700px;clip-path:circle(328px at 350px 347px)"></div>
<div style="position:absolute;left:70px;top:150px;width:560px;color:#fff">
  <div style="font-size:26px;letter-spacing:6px;color:#c46bff;font-weight:700">KUDBEE GAMES STUDIO</div>
  <div style="font-size:112px;line-height:.95;font-weight:800;margin-top:14px;text-shadow:0 0 30px rgba(57,230,255,.8)">KUDBEE<br>DARTS</div>
  <div style="font-size:34px;margin-top:26px;color:#cfe9ff;font-weight:500">Flick to throw. Hit the treble.<br>301, 501 &amp; Cricket vs. smart AI.</div>
  <div style="display:inline-block;margin-top:34px;padding:14px 30px;border:3px solid #7CFFb2;border-radius:14px;color:#7CFFb2;font-size:30px;font-weight:700;box-shadow:0 0 24px rgba(124,255,178,.45)">PLAY FREE IN YOUR BROWSER</div>
</div>
</body>`);
await card.waitForTimeout(200);
const jpg = await card.screenshot({ type: 'jpeg', quality: 88 });
writeFileSync(OUT, jpg);
console.log('wrote', OUT, (jpg.length / 1024).toFixed(0) + ' KB');
await browser.close();
