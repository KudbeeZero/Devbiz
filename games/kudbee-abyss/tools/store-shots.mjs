// Kudbee Abyss - the store-style screenshot set, rendered from the game (Playwright + Chromium).
//   node games/kudbee-abyss/tools/store-shots.mjs
// assets/store/01-*.jpg ... 06-*.jpg   1320x2868 (the App Store's 6.9" iPhone size), each a real screen of the phone in a rounded frame under a one-line caption.
// They are made for a store listing, a share post or a press kit: the game itself never loads them. Re-run it when a screen changes.
// (The in-game install screenshots in assets/app/ are made by tools/app-assets.mjs and are bare phone shots.)
import http from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { resolve, extname, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = resolve(HERE, '..', '..', '..'), GAME = resolve(HERE, '..'), OUT = join(GAME, 'assets', 'store');
const { chromium } = createRequire(resolve(ROOT, 'package.json'))('playwright');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((q, s) => { let p = join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html'); if (!p.startsWith(ROOT) || !existsSync(p)) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); s.end(readFileSync(p)); });
await new Promise(r => server.listen(0, r));
const BASE = `http://localhost:${server.address().port}/games/kudbee-abyss/`;
const browser = await chromium.launch(existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
mkdirSync(OUT, { recursive: true });

// the shots: [file, caption, how to get the phone there]
const save = JSON.stringify({ guided: true, found: { dawn: 1, song: 1, keeper: 1, chorus: 1, names: 1, nightline: 1, seventh: 1, echo: 1 }, deduced: { two_warnings: 1 }, apps: { lantern: 1, hush: 1 }, stSeen: { lantern: 1, hush: 1, echo: 1, ledger: 1, tide: 1, redial: 1, pin: 1 }, epi: { QUEEN: 3, VEY: 4, GUARDIAN: 0, WREN: 2, EYE: 1 }, epiSeen: true });
const SHOTS = [
  ['01-lock', 'It’s 3:07. Someone is texting you.', async pg => { await pg.evaluate(() => { ABY.Phone.show('lock'); ABY.Phone.setNotes([
    { title: 'Unknown', text: 'You\u2019re awake. Do you hear it? The flute is calling.', when: 'now' },
    { title: 'Vey', text: 'Do not answer the next call. I mean it this time.', when: '3:06' },
    { title: 'Echo Flute', icon: 'ic-flute', glyph: '\u266A', text: 'Your flute is ready. The Song of Recall is waiting.', when: '3:07' }]); }); }],
  ['02-thread', 'Every reply is a choice.', async pg => {
    await pg.evaluate(() => ABY.debug.goto('d4_contact', { mem: 6, light: 1, flags: { app_lantern: 1 } }));
    for (let i = 0; i < 30 && await pg.evaluate(() => ABY.game.delivering); i++) { await pg.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))); await pg.waitForTimeout(160); }
    await pg.waitForSelector('#replies.on .chip');
  }],
  ['03-notes', 'Pin the clues. Catch the lie.', async pg => {
    await pg.evaluate(() => { ABY.debug.goto('d4_contact', { mem: 6, notes: ['recording', 'a_hush', 'ledger', 'vey_photo', 'future_call', 'voicemail', 'photo_you', 'captain_name'] }); });
    await pg.waitForTimeout(400); await pg.evaluate(() => ABY.Phone.show('notes'));
  }],
  ['04-store', 'Apps that know what you did.', async pg => { await pg.evaluate(() => ABY.Phone.show('store')); }],
  ['05-gallery', 'Twenty-seven endings. Find them all.', async pg => { await pg.evaluate(() => ABY.Phone.show('gallery')); }],
  ['06-epilogue', 'And a week later, they write back.', async pg => { await pg.evaluate(() => { ABY.Phone.show('gallery'); document.getElementById('gEpi').click(); }); }],
];

const grab = await browser.newContext({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await grab.route('https://fonts.*/**', r => r.abort());
await grab.addInitScript(`localStorage.setItem('kudbee.abyss.v2', ${JSON.stringify(save)}); window.__abyOpening = 'awakening';`);
const page = await grab.newPage();
await page.goto(BASE + 'index.html');
await page.waitForFunction(() => document.getElementById('boot').classList.contains('gone') && window.ABY && ABY.Phone && ABY.Phone.screen === 'lock', null, { timeout: 20000 });
await page.waitForTimeout(800);
const shots = [];
for (const [file, caption, go] of SHOTS) {
  await go(page); await page.evaluate(() => ABY.Phone.hideBanner()); await page.waitForTimeout(900);
  shots.push([file, caption, (await page.screenshot({ type: 'png' })).toString('base64')]);
}
await grab.close();

// compose: the phone shot in a rounded frame under a caption, on the game's own night, 1320x2868 (440x956 CSS at 3x)
const comp = await browser.newContext({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 3 });
const cp = await comp.newPage(); await cp.goto(BASE + 'manifest.webmanifest');
for (const [file, caption, b64] of shots) {
  await cp.setContent(`<style>@font-face { font-family:'Space Grotesk'; font-weight:300 700; src:url(${BASE}../../assets/fonts/space-grotesk-variable-latin.woff2) format('woff2'); }
    html,body { margin:0; width:440px; height:956px; overflow:hidden; background:radial-gradient(120% 70% at 50% 0%, #2a1458 0%, #0b0518 55%, #05030c 100%); font-family:'Space Grotesk',sans-serif; }
    h1 { position:absolute; left:0; right:0; top:34px; margin:0; padding:0 36px; text-align:center; font-weight:700; font-size:30px; line-height:1.12; letter-spacing:-.01em; color:#f1ecff; text-wrap:balance; text-shadow:0 0 24px #6a2cff; }
    .ph { position:absolute; left:50px; top:150px; width:340px; height:738px; border-radius:42px; overflow:hidden; box-shadow:0 0 0 3px #1c1233, 0 0 0 5px #3a2a66, 0 24px 60px rgba(106,44,255,.45); }
    .ph img { width:100%; height:100%; display:block; object-fit:cover; object-position:top; } .tag { position:absolute; bottom:22px; left:0; right:0; text-align:center; font-size:12px; font-weight:600; letter-spacing:.3em; text-transform:uppercase; color:#9a6bff; }</style>
    <h1>${caption}</h1><div class="ph"><img src="data:image/png;base64,${b64}" alt=""></div><div class="tag">Kudbee Abyss</div>`);
  await cp.evaluate(() => Promise.all([document.fonts.ready, ...[...document.images].map(i => i.decode())]));
  await cp.screenshot({ path: join(OUT, file + '.jpg'), type: 'jpeg', quality: 90 });
}
await browser.close(); server.close();
console.log('wrote', OUT);
