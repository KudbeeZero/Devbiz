// Kudbee Abyss - playability + safety rubric (Playwright + Chromium). From the repo root: `npm run abyss:eval`.
// Walks the story in node (graph.mjs), then plays the real page AS A PHONE: lock screen, home screen, status bar, the Messages
// chat (the endings by tapping replies, and the horror: dread, flashlight, battery, calls, clues, scares, forced scenes), the Echo Flute (by touch, key and bot), Gallery, Pulse, Settings, banners and
// badges, phone fit + notch on three phones, the desktop bezel, saves (good and hostile), no-WebGL / no-CDN, hidden tab, reduced motion, share.
// three.js comes from cdnjs on the live site; here it is fetched once (curl), checked against the page's integrity hash
// (so this also proves the SRI hash is right) and served through a route. No network -> the 3D checks are skipped, not failed.
import { chromium } from 'playwright';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { graphChecks } from './graph.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), GAME = resolve(HERE, '..'), ROOT = resolve(GAME, '..', '..');
const OUT = join(HERE, 'out'), CACHE = join(HERE, '.cache'); mkdirSync(OUT, { recursive: true }); mkdirSync(CACHE, { recursive: true });
const R = [], rec = (id, pass, note) => { R.push({ id, pass: !!pass }); console.log((pass ? 'PASS' : 'FAIL') + ' ' + id + ' - ' + note); };
const skip = (id, why) => console.log('SKIP ' + id + ' - ' + why);
const sleep = ms => new Promise(r => setTimeout(r, ms));

for (const r of graphChecks()) rec(r.id, r.pass, r.note);
const ABYS = createRequire(import.meta.url)(join(GAME, 'src', 'story.js'));

// ---- three.js, verified ----
const html = readFileSync(join(GAME, 'index.html'), 'utf8');
const m = html.match(/<script src="(https:\/\/cdnjs\.cloudflare\.com\/[^"]*three\.min\.js)" integrity="sha384-([^"]+)"/);
rec('abyss-sri-present', !!m && /crossorigin="anonymous"/.test(html.slice(html.indexOf('three.min.js'), html.indexOf('three.min.js') + 200)), m ? 'three.js has integrity + crossorigin' : 'three.js tag has no integrity hash');
let THREE_PATH = null;
if (m) {
  const f = join(CACHE, 'three.r128.min.js');
  try { if (!existsSync(f) || statSync(f).size < 1e5) execFileSync('curl', ['-sSfL', '-m', '60', '-o', f, m[1]], { stdio: 'ignore' }); } catch (e) { /* offline */ }
  if (existsSync(f) && statSync(f).size > 1e5) {
    const h = createHash('sha384').update(readFileSync(f)).digest('base64');
    rec('abyss-sri-matches-cdn-file', h === m[2], h === m[2] ? 'integrity hash matches the file the CDN serves' : 'HASH MISMATCH: the browser would refuse three.js on the live site');
    if (h === m[2]) THREE_PATH = f;
  } else skip('abyss-sri-matches-cdn-file', 'cdnjs unreachable from here');
}

// ---- link previews: the game page and every landing page carry an image of the right size ----
const jpegSize = (file) => { const b = readFileSync(file); if (b[0] !== 0xff || b[1] !== 0xd8) return null; for (let i = 2; i < b.length - 9;) { if (b[i] !== 0xff) { i++; continue; } const m = b[i + 1]; if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) }; i += 2 + b.readUInt16BE(i + 2); } return null; };
const metaOf = (html) => { const o = {}; for (const t of html.match(/<meta\b[^>]*>/gi) || []) { const k = (t.match(/(?:property|name)="([^"]+)"/) || [])[1], v = (t.match(/content="([^"]*)"/) || [])[1]; if (k && v !== undefined) o[k] = v; } o.canonical = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1]; o.title = (html.match(/<title>([^<]*)<\/title>/) || [])[1]; return o; };
const SITE = 'https://devbiz.kudbee.workers.dev';
const imgFile = (u) => join(ROOT, new globalThis.URL(u).pathname);
{
  const problems = [], M = metaOf(html);
  for (const k of ['og:title', 'og:description', 'og:image', 'og:image:alt', 'twitter:card', 'twitter:image', 'twitter:image:alt']) if (!M[k]) problems.push('missing ' + k);
  if (M['twitter:card'] !== 'summary_large_image') problems.push('twitter:card is ' + M['twitter:card']);
  if (M['og:image'] && !M['og:image'].startsWith(SITE + '/') || M['og:image'] !== M['twitter:image']) problems.push('og:image / twitter:image are not the same absolute URL');
  if (M['og:image'] && !/\?v=\d+$/.test(M['og:image'])) problems.push('og:image has no ?v= (cards are cached for days)');
  const f = M['og:image'] && imgFile(M['og:image']), sz = f && existsSync(f) ? jpegSize(f) : null;
  if (!sz || sz.w !== 1200 || sz.h !== 630) problems.push('image is ' + (sz ? sz.w + 'x' + sz.h : 'missing') + ', not 1200x630');
  if (M['og:image:width'] !== '1200' || M['og:image:height'] !== '630') problems.push('og:image:width/height are not 1200/630');
  if (M.canonical !== SITE + '/games/kudbee-abyss/index.html') problems.push('canonical is ' + M.canonical);
  rec('share-meta-game-page', problems.length === 0, problems.join('; ') || 'og + twitter cards: absolute versioned 1200x630 image, alt text, canonical');
}
{
  const problems = [], slugs = ABYS.ENDING_IDS.concat(['progress']);
  for (const slug of slugs) {
    const f = join(GAME, 's', slug, 'index.html'); if (!existsSync(f)) { problems.push(slug + ': no landing page'); continue; }
    const M = metaOf(readFileSync(f, 'utf8')), want = SITE + '/games/kudbee-abyss/s/' + slug + '/';
    if (M.canonical !== want || M['og:url'] !== want) problems.push(slug + ': canonical/og:url is not ' + want);
    if (M['twitter:card'] !== 'summary_large_image' || !M['og:title'] || !M['og:description'] || !M['og:image:alt']) problems.push(slug + ': card tags incomplete');
    const im = M['og:image'], p2 = im && imgFile(im), sz = p2 && existsSync(p2) ? jpegSize(p2) : null;
    if (!im || !im.startsWith(SITE + '/assets/og/abyss/' + slug + '.jpg?v=') || im !== M['twitter:image']) problems.push(slug + ': og:image is ' + im);
    else if (!sz || sz.w !== 1200 || sz.h !== 630) problems.push(slug + ': image ' + (sz ? sz.w + 'x' + sz.h : 'missing'));
  }
  rec('share-landing-pages', problems.length === 0, problems.join('; ') || slugs.length + ' landing pages (' + slugs.join(', ') + '): canonical + og + twitter cards, each with its own 1200x630 image');
}

// ---- a static server (a folder URL serves its index.html) ----
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.json': 'application/json' };
const srv = http.createServer((q, r) => {
  let p = join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  if (!p.startsWith(ROOT) || !existsSync(p)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); r.end(readFileSync(p));
}).listen(0);
const URL = `http://localhost:${srv.address().port}/games/kudbee-abyss/`;

const launch = { headless: true, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] };
if (existsSync('/opt/pw-browsers/chromium')) launch.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launch);

const NOISE = /Failed to load resource|ERR_|net::|fonts\.g|GL Driver Message|GPU stall|WebGL/;
const errs = [];
async function open(opts = {}, tag = '', { cdn = true, pre } = {}) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 960, height: 600 } }, opts.ctx || {}));
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push(tag + ' ' + e.message)); pg.on('console', x => { if (x.type() === 'error' && !NOISE.test(x.text())) errs.push(tag + ' ' + x.text().slice(0, 140)); });
  await pg.route('https://fonts.*/**', r => r.abort());
  if (cdn && THREE_PATH) await pg.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, path: THREE_PATH }));
  else await pg.route('https://cdnjs.cloudflare.com/**', r => r.abort());
  if (!opts.guide) await pg.addInitScript(`try { if (!localStorage.getItem('kudbee.abyss.v2')) localStorage.setItem('kudbee.abyss.v2', '{"guided":true}'); } catch (e) {}`);   // the first-run guide has its own check; every other flow starts past it
  if (pre) await pg.addInitScript(pre);
  await pg.goto(URL, { waitUntil: 'load' });
  await pg.waitForFunction(() => document.getElementById('pre').classList.contains('done'), null, { timeout: 15000 });
  return { ctx, pg };
}
const PHONES = [{ n: 'landscape-844x390', w: 844, h: 390 }, { n: 'small-landscape-667x375', w: 667, h: 375 }, { n: 'portrait-390x844', w: 390, h: 844 }];
const phoneCtx = (p) => ({ ctx: { viewport: { width: p.w, height: p.h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } });


// ---- driving the phone ----
const wake = async (pg) => { await pg.waitForFunction(() => ABY.Phone && ABY.Phone.screen === 'lock'); };
async function openMessages(pg) {                       // lock -> home -> Messages, the way a person does
  if (await pg.evaluate(() => ABY.Phone.screen) === 'lock') { await pg.click('#unlock'); await pg.waitForFunction(() => ABY.Phone.screen === 'home'); await sleep(300); }
  await pg.click('#icMsg'); await pg.waitForFunction(() => ABY.Phone.screen === 'msg'); await sleep(200);
}
async function pick(pg, text) {                         // wait for the reply chips (Enter skips the typing dots), tap the one with this text
  await pg.waitForFunction(() => ABY.game.delivering || document.querySelector('#replies.on .chip'), null, { timeout: 15000 });
  for (let i = 0; i < 6 && await pg.evaluate(() => ABY.game.delivering); i++) { await pg.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))); await sleep(150); }
  await pg.waitForSelector('#replies.on .chip', { timeout: 10000 });
  await pg.locator('#replies .chip', { hasText: text }).first().click();
  await sleep(250);
}
async function playSong(pg, bot = true) {
  await pick(pg, 'Raise the flute');
  await pg.waitForFunction(() => ABY.Song.active, null, { timeout: 5000 });
  if (bot) await pg.evaluate(() => { ABY.Song.bot = true; });
  await pg.waitForFunction(() => !ABY.Song.active, null, { timeout: 60000 });
}
const PATHS = {
  silence: ['Follow the flute', 'Climb the broken spire', 'Take the crystal', 'Reach out', 'Open the gate'],
  dawn: ['Listen to the stones', 'Ask Vey to guide me', 'Reach out your hand', 'Open the gate'],
  crown: ['Follow the flute', 'Climb the broken spire', 'Take the crystal', 'Take the crown for myself', 'Wear it anyway'],
  echo: ['Follow the flute', 'Climb the broken spire', 'Offer the flute instead', 'Walk through the light', 'Open the gate'],
};
async function memoryShown(pg) { await pg.waitForFunction(() => document.getElementById('memory').classList.contains('on'), null, { timeout: 12000 }); return pg.evaluate(() => ({ name: document.getElementById('eName').textContent, kick: document.getElementById('eKick').textContent, found: Object.keys(ABY.game.found) })); }
const vis = `(el) => { const s = getComputedStyle(el), r = el.getBoundingClientRect(); return s.visibility !== 'hidden' && s.display !== 'none' && r.width > 0 && r.height > 0 && +s.opacity > 0.05 && !el.closest('[hidden]') && !el.closest('.scr:not(.on):not(#lock):not(#home)'); }`;

// ================= desktop: the phone in a bezel =================
let { ctx, pg } = await open({ ctx: { viewport: { width: 1100, height: 900 } } }, 'bezel');
await wake(pg);
const dev = await pg.evaluate(() => { const d = document.getElementById('device').getBoundingClientRect(), i = document.getElementById('island').getBoundingClientRect(); return { w: d.width, h: d.height, vw: innerWidth, vh: innerHeight, island: i.width > 0, cx: d.left + d.width / 2 }; });
rec('desktop-bezel', Math.abs(dev.w / dev.h - 0.49) < 0.03 && dev.h <= dev.vh && dev.island && Math.abs(dev.cx - dev.vw / 2) < 2, 'a ' + Math.round(dev.w) + 'x' + Math.round(dev.h) + ' phone centred in the window, with its island');
await pg.screenshot({ path: join(OUT, 'desktop-lock.png') });
if (THREE_PATH) {
  const f0 = await pg.evaluate(() => ABY.debug.frames()); await sleep(1500); const f1 = await pg.evaluate(() => ABY.debug.frames()); const calls = await pg.evaluate(() => ABY.Scene.drawCalls());
  rec('3d-renders', f1 - f0 >= 8 && calls > 0 && await pg.evaluate(() => !!ABY.Scene.canvas()), (f1 - f0) + ' frames in 1.5 s, ' + calls + ' draw calls (the wallpaper is live)');
} else skip('3d-renders', 'no three.js copy');

// the lock screen
const lk = await pg.evaluate(() => ({ time: document.getElementById('lkTime').textContent, clock: document.getElementById('clock').textContent, notes: document.querySelectorAll('#lkNotes .note').length, hint: !!document.getElementById('unlock') }));
rec('lock-screen', /^3:07$/.test(lk.time) && lk.clock === lk.time && lk.notes >= 2 && lk.hint, 'story clock ' + lk.time + ', ' + lk.notes + ' notifications, swipe-up hint');
// swipe up unlocks (a real drag), the home bar swipes back
await pg.mouse.move(550, 500); await pg.mouse.down(); await pg.mouse.move(550, 400, { steps: 5 }); await pg.mouse.up(); await sleep(500);
rec('lock-swipe-unlocks', await pg.evaluate(() => ABY.Phone.screen) === 'home', 'dragging up on the lock screen opens the home screen');
const apps = await pg.evaluate(() => [...document.querySelectorAll('.appi')].map(a => a.textContent.trim()));
rec('home-screen', ['Messages', 'Echo Flute', 'Gallery', 'Studio', 'Pulse', 'Settings'].every(n => apps.some(a => a.includes(n))) && await pg.evaluate(() => /message is waiting/i.test(document.getElementById('wS').textContent)), apps.join(' | '));
await pg.screenshot({ path: join(OUT, 'desktop-home.png') });

// Messages: typing dots first, then bubbles; her reply is an outgoing bubble; the status bar answers the story
await pg.click('#icMsg'); await pg.waitForFunction(() => ABY.Phone.screen === 'msg');
const sawTyping = await pg.waitForSelector('#thread .m.typing', { timeout: 4000 }).then(() => true, () => false);
await pg.waitForSelector('#replies.on .chip', { timeout: 12000 });
const m0 = await pg.evaluate(() => ({ bubbles: document.querySelectorAll('#thread .m.sys').length, clock: document.getElementById('clock').textContent, bat: parseInt(document.getElementById('batN').textContent), av: document.getElementById('mAv').className, chips: document.querySelectorAll('#replies .chip').length }));
rec('chat-typing-and-bubbles', sawTyping && m0.bubbles >= 1 && m0.chips === 3, 'typing dots shown first: ' + sawTyping + ', ' + m0.bubbles + ' message bubble(s), ' + m0.chips + ' quick replies');
await pick(pg, 'Listen to the stones'); await pick(pg, 'Ask Vey to guide me'); await pg.waitForSelector('#replies.on .chip');
const m1 = await pg.evaluate(() => ({ outs: [...document.querySelectorAll('#thread .m.out')].map(e => e.textContent), clock: document.getElementById('clock').textContent, bat: parseInt(document.getElementById('batN').textContent), av: document.getElementById('mAv').className, name: document.getElementById('mName').textContent, bars: document.querySelectorAll('#sig i.on').length, pips: document.getElementById('sT').textContent }));
rec('chat-reply-bubbles', m1.outs.join('|') === 'Listen to the stones|Ask Vey to guide me', 'her replies appear as outgoing bubbles: ' + m1.outs.join(' / '));
rec('contact-follows-speaker', /vey/.test(m1.av) && m1.name === 'Vey', 'the chat header turned into ' + m1.name + ' (' + m1.av + ')');
rec('status-bar-answers-story', m1.clock !== m0.clock && m1.bat < m0.bat && m1.bars === 2 && m1.pips === '✦1', 'clock ' + m0.clock + ' -> ' + m1.clock + ', battery ' + m0.bat + '% -> ' + m1.bat + '%, signal ' + m1.bars + '/4, trust ' + m1.pips);
if (THREE_PATH) {
  const c1 = await pg.evaluate(() => ABY.Scene.camera()); await pg.evaluate(() => ABY.game); await sleep(1500);
  rec('camera-follows-speaker', await pg.evaluate(() => ABY.Scene.focus === 'vey'), 'the wallpaper camera is on Vey while Vey talks');
}
await pg.screenshot({ path: join(OUT, 'desktop-chat.png') });
// the home bar: a swipe up goes home; then a banner + badge when a message arrives while she is elsewhere
await pg.mouse.move(550, 860); await pg.mouse.down(); await pg.mouse.move(550, 760, { steps: 5 }); await pg.mouse.up(); await sleep(500);
rec('homebar-swipe', await pg.evaluate(() => ABY.Phone.screen) === 'home', 'swiping up from the home bar leaves the app');
await pg.click('#icMsg'); await pg.waitForFunction(() => ABY.Phone.screen === 'msg'); await pg.waitForSelector('#replies.on .chip');
await pg.locator('#replies .chip').first().click(); await sleep(150); await pg.click('.scr.on [data-home]');
await pg.waitForSelector('#banner.on', { timeout: 6000 }).catch(() => {}); const ban = await pg.evaluate(() => ({ on: document.getElementById('banner').classList.contains('on'), badge: (document.querySelector('#icMsg .badge') || {}).textContent, screen: ABY.Phone.screen }));
rec('banner-and-badge', ban.on && ban.badge && ban.screen === 'home', 'a message arriving on the home screen: banner shown, Messages badge ' + ban.badge);
await pg.screenshot({ path: join(OUT, 'desktop-banner.png') }); await pg.click('#banner .note'); await sleep(500);
rec('banner-opens-chat', await pg.evaluate(() => ABY.Phone.screen) === 'msg' && await pg.evaluate(() => !document.querySelector('#icMsg .badge')), 'tapping the banner opens the chat and clears the badge');
await ctx.close();

// the five endings, by tapping replies in Messages
const done = {};
for (const [id, path] of Object.entries(PATHS)) {
  ({ ctx, pg } = await open({}, 'run-' + id)); await wake(pg); await openMessages(pg);
  for (const t of path) await pick(pg, t);
  const e = await memoryShown(pg); done[id] = e;
  const want = { silence: 'The Quiet Gate', dawn: 'The Gate Opens', crown: 'The Crown of Shadows', echo: 'Another Gate' }[id];
  rec('ending-' + id, e.name === want && e.kick === 'New memory saved', '"' + e.name + '" (' + e.kick + ')');
  if (id === 'echo') await pg.screenshot({ path: join(OUT, 'desktop-ending-echo.png') });
  await ctx.close();
}
// the song ending: the Song of Recall arrives as a message; the Echo Flute plays it; a bot plays it perfectly
({ ctx, pg } = await open({}, 'run-song')); await wake(pg); await openMessages(pg);
await pick(pg, 'Listen to the stones'); await pick(pg, 'Ask Vey'); await pick(pg, 'Play the Song');
await playSong(pg, true); await pg.waitForFunction(() => ABY.Phone.screen === 'msg');
const st = await pg.evaluate(() => ({ stats: ABY.Song.stats, flags: ABY.game.state.flags, report: [...document.querySelectorAll('#thread .m.sys')].some(e => /Song of Recall: \d+%/.test(e.textContent)) }));
rec('song-win', st.flags.song === 'win' && st.stats.perfect + st.stats.good >= 24 && st.report, st.stats.perfect + ' perfect / ' + st.stats.good + ' good / ' + st.stats.miss + ' missed; the result is texted into the chat');
await pick(pg, 'Walk into the dawn'); const es = await memoryShown(pg);
rec('ending-song', es.name === 'The Song Remembered', '"' + es.name + '"');
rec('gallery-badge', await pg.evaluate(() => !!document.querySelector('#icGal .badge')), 'the Gallery shows a badge for the new memory');
// SHARE: the Share screen previews the card; the native sheet gets the picture + the landing-page link; each network button opens the right link
await pg.evaluate(() => {
  window.__shared = null; window.__opened = []; window.__copied = null;
  navigator.canShare = () => true; navigator.share = d => { window.__shared = d; return Promise.resolve(); };
  window.open = (u) => { window.__opened.push(u); return null; };
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: t => { window.__copied = t; return Promise.resolve(); } }, configurable: true });
});
await pg.click('#shareBtn'); await pg.waitForFunction(() => ABY.Phone.screen === 'share'); await sleep(500);
const prev = await pg.evaluate(() => { const c = document.querySelector('#shPrev canvas'), x = c && c.getContext('2d'); if (!c) return null; const seen = new Set(); for (let i = 0; i < 400; i++) { const d = x.getImageData((i * 53) % c.width, (i * 97) % c.height, 1, 1).data; seen.add(d[0] >> 4 << 8 | d[1] >> 4 << 4 | d[2] >> 4); } return { w: c.width, h: c.height, colours: seen.size, link: document.getElementById('shLink').textContent, sub: document.getElementById('shSub').textContent, native: !document.getElementById('shNative').hidden }; });
rec('share-screen-card', prev && prev.w === 1200 && prev.h === 630 && prev.colours > 60 && /\/s\/song\/$/.test(prev.link) && /Song Remembered/.test(prev.sub) && prev.native, prev ? 'a ' + prev.w + 'x' + prev.h + ' card painted (' + prev.colours + ' colour buckets), link ' + prev.link + ', native Share... button shown' : 'no preview canvas');
await pg.screenshot({ path: join(OUT, 'desktop-share.png') });
await pg.click('#shNative'); await sleep(300); const sh = await pg.evaluate(() => { const d = window.__shared; return d && { url: d.url, text: d.text, file: d.files && d.files[0] && { n: d.files[0].name, t: d.files[0].type, sz: d.files[0].size } }; });
rec('share-native-sheet', sh && sh.url === SITE + '/games/kudbee-abyss/s/song/' && /Song Remembered/.test(sh.text) && /1 of 15/.test(sh.text) && sh.file && sh.file.n === 'kudbee-abyss.png' && sh.file.t === 'image/png' && sh.file.sz > 50000, sh ? 'share sheet got the link ' + sh.url.replace(SITE, '') + ' + ' + (sh.file ? sh.file.n + ' (' + Math.round(sh.file.sz / 1024) + 'KB)' : 'NO IMAGE') : 'navigator.share not called');
await pg.click('#shX'); await pg.click('#shFb'); await pg.click('#shWa'); const op = await pg.evaluate(() => window.__opened), land = encodeURIComponent(SITE + '/games/kudbee-abyss/s/song/');
rec('share-network-links', op.length === 3 && op[0].startsWith('https://twitter.com/intent/tweet?') && op[0].includes('url=' + land) && op[1].startsWith('https://www.facebook.com/sharer/sharer.php?u=' + land) && op[2].startsWith('https://wa.me/?text=') && op[2].includes(land), 'X, Facebook and WhatsApp all carry the landing-page link');
await pg.click('#shCopy'); await sleep(200); const cp = await pg.evaluate(() => window.__copied);
rec('share-copy-link', cp && /Song Remembered/.test(cp) && cp.endsWith(SITE + '/games/kudbee-abyss/s/song/'), 'the copied text ends with the landing-page link');
const dl = await Promise.all([pg.waitForEvent('download', { timeout: 5000 }).catch(() => null), pg.click('#shSave')]); const dn = dl[0] && dl[0].suggestedFilename();
rec('share-save-image', dn === 'kudbee-abyss-song.png', 'Save image downloads ' + dn);
// progress share (from Pulse): the count is personal, the link is the progress page
await pg.click('#shBack'); await sleep(300); await pg.evaluate(() => ABY.Phone.show('pulse')); await sleep(500); await pg.click('#pShare'); await pg.waitForFunction(() => ABY.Phone.screen === 'share'); await sleep(700); await pg.click('#shNative'); await sleep(300);
const sp = await pg.evaluate(() => window.__shared); rec('share-progress', sp && sp.url === SITE + '/games/kudbee-abyss/s/progress/' && /1 of 15 endings/.test(sp.text) && sp.files && sp.files[0], sp ? sp.text.slice(0, 60) + '... -> ' + sp.url.replace(SITE, '') : 'navigator.share not called');
await pg.evaluate(() => ABY.Phone.show('home')); await sleep(300);
// the Gallery: the found ending is a photo, the rest are locked; tapping the photo reopens the memory; Pulse shows the stats; Settings toggles
await pg.mouse.move(550, 860).catch(() => {}); await pg.evaluate(() => ABY.Phone.show('home')); await sleep(400);
await pg.click('#icGal'); await sleep(500);
const gal = await pg.evaluate(() => [...document.querySelectorAll('#tiles .tile')].map(t => ({ f: t.classList.contains('f'), h: t.querySelector('h3').textContent })));
rec('gallery-tiles', gal.length === ABYS.ENDING_IDS.length && gal.filter(g => g.f).length === 1 && gal.filter(g => g.h === 'Locked').length === ABYS.ENDING_IDS.length - 1, gal.map(g => g.h).join(' | '));
await pg.click('#tiles .tile.f'); await sleep(300); rec('gallery-opens-memory', await pg.evaluate(() => document.getElementById('memory').classList.contains('on') && /Song Remembered/.test(document.getElementById('eName').textContent) && document.getElementById('eKick').textContent === 'Memory'), 'a found photo reopens its memory');
await pg.click('#memAct'); await sleep(300);
await pg.evaluate(() => ABY.Phone.show('pulse')); await sleep(900);
const pl = await pg.evaluate(() => ({ rows: [...document.querySelectorAll('#ringsL .rl .v')].map(v => v.textContent), sub: document.getElementById('pSub').textContent }));
rec('pulse-rings', pl.rows.length === 4 && /Endings found 1\/15/.test(pl.sub), 'Heart / Resolve / Trust / Dread ' + pl.rows.join(', ') + ' | ' + pl.sub);
await ctx.close();

// the Echo Flute app: practice by touch and by key; fail; the best score is kept
({ ctx, pg } = await open(phoneCtx(PHONES[0]), 'flute')); await wake(pg); await pg.click('#unlock'); await sleep(500); await pg.click('[data-app=flute]'); await sleep(500);
await pg.click('#fPlay'); await pg.waitForFunction(() => ABY.Song.active);
const hit = async (viaTouch) => {                       // tap a little early (a tap takes ~100 ms to arrive) and allow a few notes for slow machines
  for (let k = 0; k < 4; k++) {
    const before = await pg.evaluate(() => ABY.Song.stats.perfect + ABY.Song.stats.good);
    const n = await pg.evaluate(() => { const S = ABY.Song, o = S.notes.find(x => x.s === 0); return o ? { lane: o.lane } : null; });
    await pg.waitForFunction(() => { const S = ABY.Song, o = S.notes.find(x => x.s === 0); return o && o.t - S.t < 0.09; }, null, { polling: 'raf', timeout: 8000 });
    if (viaTouch) { const x = await pg.evaluate((l) => document.getElementById('songCv').getBoundingClientRect().left + ABY.Song.laneX(l), n.lane); await pg.touchscreen.tap(x, 300); } else await pg.keyboard.press(['a', 's', 'd'][n.lane]);
    await sleep(150); const after = await pg.evaluate(() => ABY.Song.stats.perfect + ABY.Song.stats.good); if (after > before) return after;
  }
  return pg.evaluate(() => ABY.Song.stats.perfect + ABY.Song.stats.good);
};
const h1 = await hit(true), h2 = await hit(false);
rec('song-touch-and-keys', h1 >= 1 && h2 >= 2, 'a touch tap landed (' + h1 + ') and a key landed (' + h2 + ')');
await pg.screenshot({ path: join(OUT, 'phone-song.png') });
await pg.evaluate(() => { ABY.Song.rate = 3; }); await pg.waitForFunction(() => !ABY.Song.active, null, { timeout: 40000 }); await sleep(800);
const fl = await pg.evaluate(() => ({ screen: ABY.Phone.screen, txt: document.getElementById('fTxt').textContent, best: document.getElementById('fBest').textContent, saved: JSON.parse(localStorage.getItem('kudbee.abyss.v2')).songBest }));
rec('flute-practice', fl.screen === 'flute' && /faltered/.test(fl.txt) && /^\d+%$/.test(fl.best) && fl.saved > 0, 'back in the app: "' + fl.txt.slice(0, 50) + '", best ' + fl.best + ' kept');
await ctx.close();
// no input in the story: the song fails, the Guardian offers another try
({ ctx, pg } = await open({}, 'songfail')); await wake(pg); await openMessages(pg);
await pick(pg, 'Listen to the stones'); await pick(pg, 'Ask Vey'); await pick(pg, 'Play the Song'); await pick(pg, 'Raise the flute'); await pg.waitForFunction(() => ABY.Song.active); await pg.evaluate(() => { ABY.Song.rate = 3; });
await pg.waitForFunction(() => !ABY.Song.active, null, { timeout: 40000 }); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
const failed = await pg.evaluate(() => ({ node: ABY.game.state.node, fail: ABY.game.state.flags.song, chips: [...document.querySelectorAll('#replies .chip')].map(b => b.textContent) }));
rec('song-fail', failed.node === 'song_fail' && failed.fail === 'fail' && failed.chips.some(o => /again/i.test(o)), 'node ' + failed.node + ' | ' + failed.chips.join(' / ')); await ctx.close();


// ================= the horror: dread, flashlight, battery, calls, clues, scares, forced scenes =================
const at = async (pg, id, patch) => {                  // be at a scene (a test hook) and let its messages arrive
  await pg.evaluate(([i, p]) => ABY.debug.goto(i, p), [id, patch || {}]);
  for (let i = 0; i < 12 && await pg.evaluate(() => ABY.game.delivering); i++) { await pg.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))); await sleep(140); }
  await sleep(250);
};
if (THREE_PATH) {
  ({ ctx, pg } = await open({}, 'eye')); await wake(pg);
  // the Eye backdrop: an `img: 'eye'` scene fades it in over the world, and leaving the scene fades it out
  const eyeId = await pg.evaluate(() => Object.keys(ABY.NODES || {}).find(k => ABY.NODES[k].img === 'eye'));
  if (eyeId) {
    await pg.evaluate(id => ABY.debug.goto(id, {}), eyeId); await sleep(2500);
    const on = await pg.evaluate(() => ABY.Scene.eye);
    await pg.evaluate(() => ABY.debug.goto(ABY.START, {})); await sleep(2500);
    const off = await pg.evaluate(() => ABY.Scene.eye);
    rec('eye-backdrop', on > 0.8 && off < 0.2, 'the Eye fades in on its scene (' + on.toFixed(2) + ') and away after (' + off.toFixed(2) + ')');
  }
  await ctx.close();
}
const chips = (pg) => pg.evaluate(() => [...document.querySelectorAll('#replies .chip')].map(c => c.textContent));
const tapChip = async (pg, text) => { await pg.waitForSelector('#replies.on .chip', { timeout: 10000 }); await pg.locator('#replies .chip', { hasText: text }).first().click(); await sleep(300); };
{
  let { ctx, pg } = await open({}, 'horror'); await wake(pg); await openMessages(pg);
  // the first scare: the unknown number glitches the screen, the contact turns red, dread rises
  await pick(pg, 'Check your phone');
  const glitch = await pg.waitForSelector('#screen.glitch', { timeout: 5000 }).then(() => true, () => false);
  await pg.waitForSelector('#replies.on .chip', { timeout: 10000 });
  const e1 = await pg.evaluate(() => ({ name: document.getElementById('mName').textContent, dread: document.getElementById('sD').textContent, av: document.getElementById('mAv').className }));
  rec('scare-glitch-unknown-number', glitch && e1.name === 'No Caller ID' && /eye/.test(e1.av) && e1.dread === '◉1', 'the screen glitched; the contact is "' + e1.name + '"; dread ' + e1.dread);
  // the flashlight: on by a choice, costs battery on every later choice, and by hand
  await pick(pg, 'Switch on the flashlight');
  const t1 = await pg.evaluate(() => ({ on: document.getElementById('torchBtn').classList.contains('on'), light: ABY.game.state.light, bat: ABY.game.state.bat, torch: ABY.Scene.torchT }));
  await pg.waitForSelector('#replies.on .chip', { timeout: 10000 }); await pick(pg, 'Keep the light on');
  const t2 = await pg.evaluate(() => ({ bat: ABY.game.state.bat })); await pg.waitForSelector('#replies.on .chip', { timeout: 10000 });
  await pg.click('#torchBtn'); await sleep(200); const t3 = await pg.evaluate(() => ({ on: document.getElementById('torchBtn').classList.contains('on'), bat: ABY.game.state.bat }));
  rec('flashlight-costs-battery', t1.on && t1.light === 1 && t1.torch === 1 && t1.bat === ABYS.BAT0 - 2 && t2.bat === t1.bat - 1 - ABYS.TORCH && !t3.on && t3.bat === t2.bat - ABYS.TORCH_TOGGLE, 'torch on (' + t1.bat + '%), the next choice cost ' + (t1.bat - t2.bat) + ' (1 + ' + ABYS.TORCH + '), switching it off cost ' + (t2.bat - t3.bat));
  // a dark room: she is scared without the light, and a choice needs it
  await at(pg, 'pillar_door', {}); const d0 = await chips(pg), hint = await pg.evaluate(() => ({ torchHint: document.getElementById('torchBtn').classList.contains('hint'), says: [...document.querySelectorAll('#thread .m.sys')].some(e => /too dark/i.test(e.textContent)) }));
  await pg.click('#torchBtn'); await sleep(300); const d1 = await chips(pg);
  rec('dark-needs-flashlight', !d0.includes('Read the ledger') && hint.torchHint && hint.says && d1.includes('Read the ledger'), 'dark: ' + d0.join(' / ') + ' (torch button pulses); after the torch: ' + d1.join(' / '));
  // a clue unlocks a hidden choice, and lands in Notes
  await pg.locator('#replies .chip', { hasText: 'Read the ledger' }).first().click(); await sleep(400);
  for (let i = 0; i < 8 && await pg.evaluate(() => ABY.game.delivering); i++) { await pg.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))); await sleep(140); } await sleep(400);
  const nb = await pg.evaluate(() => ({ notes: ABY.game.state.notes.slice(), flag: ABY.game.state.flags.ledger, banner: document.getElementById('banner').textContent }));
  await at(pg, 'g_meet', { flags: { ledger: 1 }, dread: 2 }); const g1 = await chips(pg); await at(pg, 'g_meet', {}); const g0 = await chips(pg);
  rec('clues-unlock-choices', nb.notes.includes('ledger') && nb.flag === 1 && /New clue/.test(nb.banner) && g1.includes('Read him the ledger') && g1.includes('Look him in the eye') && !g0.includes('Read him the ledger') && !g0.includes('Look him in the eye'), 'with the ledger and dread 2 she can say: ' + g1.join(' / ') + ' | without: ' + g0.join(' / '));
  // an incoming call
  await at(pg, 'call_1', {}); await pg.waitForSelector('#call.on', { timeout: 5000 });
  const cl = await pg.evaluate(() => ({ who: document.getElementById('callWho').textContent, btns: [...document.querySelectorAll('#callAct .cbtn')].map(b => ({ t: b.textContent.replace(/[^A-Za-z]/g, ''), w: b.querySelector('i').getBoundingClientRect().width })), locked: ABY.Phone.locked }));
  rec('incoming-call', cl.who === 'Unknown (you)' && cl.btns.length === 2 && /Answer/.test(cl.btns[0].t) && /Decline/.test(cl.btns[1].t) && cl.btns.every(b => b.w >= 60) && cl.locked, 'a full-screen call from "' + cl.who + '": ' + cl.btns.map(b => b.t).join(' / ') + ' (home locked while it rings)');
  await pg.screenshot({ path: join(OUT, 'horror-call.png') }); await pg.locator('#callAct .cbtn').first().click(); await sleep(500);
  for (let i = 0; i < 8 && await pg.evaluate(() => ABY.game.delivering); i++) { await pg.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))); await sleep(140); } await sleep(300);
  const ca = await pg.evaluate(() => ({ node: ABY.game.state.node, hidden: !document.getElementById('call').classList.contains('on'), notes: ABY.game.state.notes.slice() }));
  await pg.evaluate(() => ABY.Phone.show('notes')); await sleep(500); const nl = await pg.evaluate(() => [...document.querySelectorAll('#noteList .nt h3')].map(h => h.textContent));
  rec('call-answered-and-noted', ca.node === 'call_self' && ca.hidden && ca.notes.includes('future_call') && nl.includes('Call from your own number'), 'answered -> ' + ca.node + '; Notes now holds: ' + nl.join(' | ')); await pg.screenshot({ path: join(OUT, 'horror-notes.png') });
  // a photo, and a jump scare
  await pg.evaluate(() => ABY.Phone.show('msg')); await at(pg, 'vey_photo', {});
  const ph = await pg.evaluate(() => { const e = document.querySelector('#thread .m.photo'); return { n: document.querySelectorAll('#thread .m.photo').length, bg: e && e.style.backgroundImage, w: e && e.getBoundingClientRect().width }; });
  rec('photo-in-the-chat', ph.n === 1 && /corrupt/.test(ph.bg) && ph.w > 100, 'a photo bubble in the thread (' + ph.bg.slice(0, 50) + ')');
  // dread everywhere
  await at(pg, 'eye_top', { dread: 5, choices: 10 }); await sleep(600);
  const dr = await pg.evaluate(() => ({ sD: document.getElementById('sD').textContent, uneasy: document.getElementById('screen').classList.contains('uneasy'), v: getComputedStyle(document.getElementById('screen')).getPropertyValue('--dread') }));
  await pg.evaluate(() => ABY.debug.tick(30));
  const amb = await pg.waitForSelector('#screen.glitch', { timeout: 3000 }).then(() => true, () => false);
  await pg.evaluate(() => ABY.Phone.show('pulse')); await sleep(700); const pr = await pg.evaluate(() => [...document.querySelectorAll('#ringsL .rl b')].map(b => b.textContent));
  rec('dread-shows', dr.sD === '◉5' && dr.uneasy && +dr.v > 0.8 && amb && pr.join() === 'Heart,Resolve,Trust,Dread', 'dread 5 of 6: the screen is uneasy (' + dr.v.trim() + '), it glitches by itself, and Pulse has four rings');
  await ctx.close();
}
{ // the phone dies; her mind comes apart
  const { ctx, pg } = await open({}, 'forced'); await wake(pg); await openMessages(pg);
  await at(pg, 'flute_path', { bat: 1 }); await tapChip(pg, 'Climb the broken spire');
  const blk = await pg.waitForSelector('#blackout.on', { timeout: 6000 }).then(() => true, () => false);
  for (let i = 0; i < 10 && await pg.evaluate(() => ABY.game.delivering); i++) { await pg.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))); await sleep(140); }
  await pg.waitForSelector('#replies.on .chip', { timeout: 10000 }); const bc = await chips(pg), bn = await pg.evaluate(() => ({ node: ABY.game.state.node, back: ABY.game.state.back, bat: ABY.game.state.bat }));
  rec('battery-dies', blk && bn.node === 'blackout' && bn.back === 'spire' && bn.bat === 0 && bc.join() === 'Wait for the light,Scream for help', 'the phone died on the way to the spire: ' + bc.join(' / ') + ' (no crystal, no way back)');
  await tapChip(pg, 'Wait for the light'); const z = await memoryShown(pg); rec('ending-blackout', z.name === 'Zero Percent', '"' + z.name + '"');
  await pg.click('#memAct'); await sleep(600);
  await at(pg, 'flute_path', { bat: 1, flags: { crystal: 1 } }); await tapChip(pg, 'Climb the broken spire'); await sleep(800);
  for (let i = 0; i < 10 && await pg.evaluate(() => ABY.game.delivering); i++) { await pg.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))); await sleep(140); }
  await pg.waitForSelector('#replies.on .chip', { timeout: 10000 }); const rc = await chips(pg); await tapChip(pg, 'Hold the phone to the crystal'); await sleep(500);
  const rb = await pg.evaluate(() => ({ node: ABY.game.state.node, bat: ABY.game.state.bat }));
  rec('battery-recharge', rc.includes('Hold the phone to the crystal') && rb.node === 'spire' && rb.bat >= 30, 'with the crystal she recharges (' + rb.bat + '%) and goes on to the ' + rb.node);
  await at(pg, 'hollow_walk', { dread: 5, trust: 3 }); await tapChip(pg, 'Keep walking'); await sleep(500);
  for (let i = 0; i < 10 && await pg.evaluate(() => ABY.game.delivering); i++) { await pg.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))); await sleep(140); }
  await pg.waitForSelector('#replies.on .chip', { timeout: 10000 }); const hc = await chips(pg), hn = await pg.evaluate(() => ABY.game.state.node);
  await tapChip(pg, 'Take the hand'); await sleep(500); const hb = await pg.evaluate(() => ({ node: ABY.game.state.node, dread: ABY.game.state.dread }));
  rec('mind-comes-apart-and-trust-saves', hn === 'hollowing' && hc.includes('Take the hand') && hb.node === 'g_meet' && hb.dread < 6, 'at dread 6 she comes apart; with trust 3 she can take Vey\'s hand and go on (dread ' + hb.dread + ')');
  await at(pg, 'hollow_walk', { dread: 5, trust: 0 }); await tapChip(pg, 'Keep walking'); await sleep(500);
  for (let i = 0; i < 10 && await pg.evaluate(() => ABY.game.delivering); i++) { await pg.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))); await sleep(140); }
  await pg.waitForSelector('#replies.on .chip', { timeout: 10000 }); const lc = await chips(pg); await tapChip(pg, 'Let go'); const hq = await memoryShown(pg);
  rec('ending-hollow-from-dread', lc.join() === 'Let go' && hq.name === 'The Hollow Queen', 'without trust the only choice is "' + lc.join() + '": "' + hq.name + '"');
  await ctx.close();
}
{ // the other new endings, each from the scene that decides it
  const { ctx, pg } = await open({}, 'newends'); await wake(pg); await openMessages(pg);
  const run = async (id, patch, label, want, tag) => { await at(pg, id, patch); await tapChip(pg, label); const m = await memoryShown(pg); rec('ending-' + tag, m.name === want && m.kick === 'New memory saved', '"' + m.name + '" (' + m.kick + ')'); await pg.click('#memAct'); await sleep(700); };
  await run('eye_top', { dread: 2, choices: 12 }, 'Answer: remember me', 'The Eye Opens', 'eye');
  await run('vault_choice', { flags: { truth: 1 }, choices: 12 }, 'Take his place', 'The Other Queen', 'mirror');
  await run('vault_choice', { choices: 12 }, 'Lock the door again', 'The Hollow Queen', 'seal');
  await run('reconcile', { flags: { vey_trusted: 1 }, dread: 3, trust: 2, choices: 12 }, 'Open the gate', 'Vey’s Smile', 'betrayal');
  const left = await pg.evaluate(() => Object.keys(ABY.game.found).length);
  rec('gallery-fills', left === 5 || left >= 4, left + ' endings saved in this run (new ones, each a memory in the Gallery)');
  await ctx.close();
}
{ // Day Two: some endings carry on into act two; its true ending only opens for someone who has found others
  const { ctx, pg } = await open({}, 'day2'); await wake(pg); await openMessages(pg); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
  await at(pg, 'gate_opens', { trust: 3, flags: { lullaby: 1 }, choices: 12 }); const m = await memoryShown(pg);
  const nx = await pg.evaluate(() => { const b = document.getElementById('memNext'); return { shown: !b.hidden && b.getBoundingClientRect().height >= 40, t: b.textContent }; });
  rec('day-two-offered', m.name === 'Another Gate' && nx.shown && nx.t === 'Day Two', '"' + m.name + '" offers a ' + nx.t + ' button');
  await pg.click('#memNext'); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
  const d = await pg.evaluate(() => ({ node: ABY.game.state.node, lull: ABY.game.state.flags.lullaby, bat: ABY.game.state.bat, mem: ABY.game.state.mem, thread: document.getElementById('thread').textContent, open: document.getElementById('memory').classList.contains('on'), chips: [...document.querySelectorAll('#replies .chip')].map(c => c.textContent) }));
  rec('day-two-begins', d.node === 'd2_wake' && d.lull === 1 && d.bat >= 47 && !d.open && /Day Two/.test(d.thread) && d.chips.length === 3, 'Day Two opens with her flags kept (battery ' + d.bat + '%): ' + d.chips.join(' / '));
  await at(pg, 'd2_door', { trust: 3, mem: 4, dread: 0, flags: { knew_name: 1 } }); await pg.waitForSelector('#replies.on .chip', { timeout: 10000 }); const c1 = await chips(pg);
  await at(pg, 'd2_door', { trust: 3, mem: 0, dread: 0, flags: { knew_name: 1 } }); await pg.waitForSelector('#replies.on .chip', { timeout: 10000 }); const c0 = await chips(pg);
  rec('day-two-true-ending-gated', c1.some(c => /open it/.test(c)) && !c0.some(c => /open it/.test(c)) && c0.length >= 1, 'with 4 endings found: ' + c1.length + ' choices incl. the true ending; with none: ' + c0.length + ' (it stays hidden)');
  await at(pg, 'd2_door', { trust: 3, mem: 4, dread: 0, flags: { knew_name: 1 } }); await tapChip(pg, 'Say their names together, and open it'); const e = await memoryShown(pg);
  const fin = await pg.evaluate(() => document.getElementById('memNext').hidden);
  rec('ending-daybreak', e.name === 'Real Morning' && fin, '"' + e.name + '" (a final ending: no Day Two button)'); await pg.screenshot({ path: join(OUT, 'day2-daybreak.png') });
  await ctx.close();
}
{ // badges and factions are the player's own; a shared link starts from the beginning
  const { ctx, pg } = await open({}, 'badges'); await wake(pg); await openMessages(pg);
  await at(pg, 'd2_door', { trust: 3, mem: 4, dread: 0, flags: { knew_name: 1 }, choices: 12 }); await tapChip(pg, 'Say their names together, and open it'); await memoryShown(pg);
  const bn = await pg.waitForSelector('#banner.on .note', { timeout: 6000 }).then(() => pg.evaluate(() => document.querySelector('#banner .note').textContent), () => '');
  const got = await pg.evaluate(() => Object.keys(ABY.game.badges).sort().join());
  rec('badges-earned', got === 'day_two,fearless,first_light,lamplighter,name_keeper,real_morning' && /Badge earned/.test(bn), 'one ending earned: ' + got + ' | banner "' + bn.slice(0, 50) + '"');
  await pg.click('#memAct'); await sleep(500); await pg.evaluate(() => ABY.Phone.show('gallery')); await sleep(500);
  const g = await pg.evaluate(() => ({ tiles: document.querySelectorAll('#tiles .tile').length, found: document.querySelectorAll('#tiles .tile.f').length, on: document.querySelectorAll('#badges .bdg.on').length, all: document.querySelectorAll('#badges .bdg').length, fb: [...document.querySelectorAll('#faction .fbtn')].map(b => b.textContent), lean: [...document.querySelectorAll('#faction .fbtn.lean')].length }));
  rec('gallery-badges-factions', g.tiles === 15 && g.found === 1 && g.on === 6 && g.all === 12 && g.fb.join() === 'Choir of Recall,Order of the Door,Hollow Court' && g.lean === 1, g.found + ' of ' + g.tiles + ' memories (the new endings draw), ' + g.on + '/' + g.all + ' badges, factions ' + g.fb.join(' / '));
  await pg.locator('#faction .fbtn', { hasText: 'Order of the Door' }).click(); await sleep(300);
  const jf = await pg.evaluate(() => ({ f: ABY.game.faction, saved: JSON.parse(localStorage.getItem('kudbee.abyss.v2')).faction, title: document.querySelector('#faction h3').textContent, txt: ABY.Share.moment('progress', '', ABY.game.found, { faction: ABY.game.faction, badges: 6 }) }));
  rec('faction-pledge', jf.f === 'order' && jf.saved === 'order' && /Sworn to The Order of the Door/.test(jf.title) && /Order of the Door \(6 badges\)/.test(jf.txt.text) && /SWORN TO THE ORDER/.test(jf.txt.info.line1), 'pledged and saved: "' + jf.title + '"; the share says "' + jf.txt.text.slice(0, 80) + '..."');
  await pg.evaluate(() => ABY.Phone.show('msg')); await at(pg, 'flute_path', {}); await pg.waitForSelector('#replies.on .chip', { timeout: 10000 });
  await pg.goto(URL, { waitUntil: 'load' }); await wake(pg); const resumed = await pg.evaluate(() => !!ABY.game.saved);
  await pg.goto(URL + '?fresh=1', { waitUntil: 'load' }); await wake(pg);
  const fr = await pg.evaluate(() => ({ saved: ABY.game.saved, run: ABY.game.run, found: Object.keys(ABY.game.found).length, badges: Object.keys(ABY.game.badges).length, f: ABY.game.faction, q: location.search, screen: ABY.Phone.screen }));
  await openMessages(pg); await pg.waitForSelector('#thread .m.sys', { timeout: 10000 }); const first = await pg.evaluate(() => ({ node: ABY.game.state.node, n: document.querySelectorAll('#thread .m').length }));
  rec('shared-link-starts-fresh', resumed && fr.saved === null && !fr.run && fr.found === 1 && fr.badges === 6 && fr.f === 'order' && fr.q === '' && fr.screen === 'lock' && first.node === 'awakening', 'a plain visit resumes the saved journey; ?fresh=1 opens the lock screen and begins at "' + first.node + '" (her badges and faction stay; the address is cleaned)');
  await ctx.close();
}
{ // landing pages send people to a fresh journey
  const bad = []; for (const slug of ABYS.ENDING_IDS.concat(['progress'])) { const h = readFileSync(join(GAME, 's', slug, 'index.html'), 'utf8'); if (!h.includes("location.replace('../../index.html?fresh=1')") || !h.includes('href="../../index.html?fresh=1"')) bad.push(slug); }
  rec('landing-pages-start-fresh', bad.length === 0, bad.join(', ') || 'every share link (' + (ABYS.ENDING_IDS.length + 1) + ' pages) opens the game with ?fresh=1');
}
{ // the phone turns: on a desktop it can be laid on its side; on a real phone it turns by itself, mid-chat
  let { ctx, pg } = await open({ ctx: { viewport: { width: 1200, height: 900 } } }, 'rotate'); await wake(pg);
  const dim = () => pg.evaluate(() => { const d = document.getElementById('device').getBoundingClientRect(); return { r: d.width / d.height, land: document.getElementById('device').classList.contains('land'), orient: ABY.Phone.orient, canvas: (document.querySelector('#three-canvas canvas') || {}).width }; });
  const p0 = await dim(); await pg.click('#rotBtn'); await sleep(900); const p1 = await dim(); await pg.screenshot({ path: join(OUT, 'desktop-landscape.png') });
  await pg.reload({ waitUntil: 'load' }); await pg.waitForFunction(() => document.getElementById('pre').classList.contains('done')); const p2 = await dim();
  await pg.keyboard.press('r'); await sleep(800); const p3 = await dim();
  rec('desktop-rotate', !p0.land && Math.abs(p0.r - 0.49) < 0.03 && p1.land && p1.orient === 'landscape' && Math.abs(p1.r - 2.04) < 0.15 && p2.land && !p3.land && Math.abs(p3.r - 0.49) < 0.03, 'portrait ' + p0.r.toFixed(2) + ' -> landscape ' + p1.r.toFixed(2) + ' (kept after a reload) -> the R key turns it back ' + p3.r.toFixed(2));
  await ctx.close();
  ({ ctx, pg } = await open(phoneCtx(PHONES[2]), 'turn')); await wake(pg); await openMessages(pg); await pick(pg, 'Listen to the stones'); await pg.waitForSelector('#replies.on .chip', { timeout: 10000 });
  const lay = () => pg.evaluate(() => { const sh = document.getElementById('sheet'), cs = getComputedStyle(sh), vw = innerWidth, vh = innerHeight, bad = [...document.querySelectorAll('#replies .chip')].filter(c => { const r = c.getBoundingClientRect(); return r.right > vw + 1 || r.bottom > vh + 1 || r.left < -1 || r.top < -1; }).length; return { pos: cs.position, node: ABY.game.state.node, chips: document.querySelectorAll('#replies .chip').length, bad, canvasOk: (() => { const c = document.querySelector('#three-canvas canvas'); return !c || Math.abs(c.getBoundingClientRect().width - document.getElementById('screen').getBoundingClientRect().width) < 2; })() }; });
  const a0 = await lay(); await pg.setViewportSize({ width: 844, height: 390 }); await sleep(900); const a1 = await lay(); await pg.screenshot({ path: join(OUT, 'phone-turned-landscape.png') });
  await pg.setViewportSize({ width: 390, height: 844 }); await sleep(900); const a2 = await lay();
  rec('phone-turns-mid-game', a0.pos !== 'absolute' && a1.pos === 'absolute' && a2.pos !== 'absolute' && a0.node === a1.node && a1.node === a2.node && a1.chips === a0.chips && a1.bad === 0 && a2.bad === 0 && a1.canvasOk && a2.canvasOk, 'upright -> on its side -> upright mid-chat: same scene (' + a1.node + '), ' + a1.chips + ' replies, none cut off, the 3D follows');
  await ctx.close();
}

// Settings: sound and vibration persist; the danger buttons need two taps
{ const c = await open({}, 'settings'); await wake(c.pg); await c.pg.click('#unlock'); await sleep(400); await c.pg.click('[data-app=settings]'); await sleep(400);
  await c.pg.click('#setSnd'); await c.pg.click('#setHap'); await sleep(200);
  await c.pg.reload({ waitUntil: 'load' }); await c.pg.waitForFunction(() => document.getElementById('pre').classList.contains('done')); await c.pg.click('#unlock'); await sleep(400); await c.pg.click('[data-app=settings]'); await sleep(300);
  const o = await c.pg.evaluate(() => ({ snd: document.getElementById('setSnd').getAttribute('aria-pressed'), hap: document.getElementById('setHap').getAttribute('aria-pressed'), muted: ABY.Audio.muted, ctx: !!ABY.Audio.ctx }));
  rec('settings-persist', o.snd === 'false' && o.hap === 'false' && o.muted, 'sound off and vibration off survive a reload');
  await c.pg.click('#setRes'); const armed = await c.pg.evaluate(() => /Tap again/.test(document.getElementById('setResS').textContent)); await c.pg.click('#setRes');
  rec('settings-two-taps', armed, 'a danger button asks for a second tap'); await c.ctx.close(); }

// ================= phone fit =================
for (const p of PHONES) {
  ({ ctx, pg } = await open(phoneCtx(p), 'fit-' + p.n)); await wake(pg);
  const checks = [];
  const fit = async (screen) => {
    const o = await pg.evaluate((visSrc) => {
      const isVis = eval(visSrc), vw = innerWidth, vh = innerHeight, bad = [];
      for (const el of document.querySelectorAll('button, a.appi, #homebar')) { if (!isVis(el) || el.closest('#banner')) continue;      // (a banner is a passing overlay, not layout)
        const r = el.getBoundingClientRect();
        const scrolls = !!el.closest('.pad, #thread');                      // content in a scrolling list may sit below the fold
        if (r.left < -1 || r.right > vw + 1 || (!scrolls && (r.top < -1 || r.bottom > vh + 1))) bad.push('off-screen ' + (el.id || el.className) + ' ' + Math.round(r.left) + '..' + Math.round(r.right) + ' x ' + Math.round(r.bottom));
        if (el.id !== 'homebar' && (r.height < 43.5 || r.width < 43.5)) bad.push('small target ' + (el.id || el.className) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)); }
      let minFont = 99, minEl = '';
      for (const el of document.querySelectorAll('#screen *')) { if (!isVis(el) || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue; if (el.closest('#status') && el.id !== 'carrier') continue; const fs = parseFloat(getComputedStyle(el).fontSize); if (fs < minFont) { minFont = fs; minEl = el.className || el.id || el.tagName; } }
      return { bad, minFont, minEl, hscroll: document.documentElement.scrollWidth > vw + 1 };
    }, vis);
    if (o.bad.length) checks.push(screen + ': ' + o.bad.slice(0, 3).join('; '));
    if (o.minFont < 11.4) checks.push(screen + ': text ' + o.minFont.toFixed(1) + 'px (' + o.minEl + ')');
    if (o.hscroll) checks.push(screen + ': sideways scroll');
  };
  await fit('lock'); await pg.screenshot({ path: join(OUT, `${p.n}-1lock.png`) });
  await pg.click('#unlock'); await sleep(600); await fit('home'); await pg.screenshot({ path: join(OUT, `${p.n}-2home.png`) });
  await pg.click('#icMsg'); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 }); await fit('chat'); await pg.screenshot({ path: join(OUT, `${p.n}-3chat.png`) });
  await pick(pg, 'Listen to the stones'); await pick(pg, 'Approach the guardian'); await pg.waitForSelector('#replies.on .chip'); await fit('chat, 3 replies'); await pg.screenshot({ path: join(OUT, `${p.n}-4chat3.png`) });
  for (const [app, n] of [['gallery', '5gallery'], ['pulse', '6pulse'], ['settings', '7settings'], ['flute', '8flute'], ['notes', '8notes']]) { await pg.evaluate((a) => ABY.Phone.show(a), app); await sleep(900); await fit(app); await pg.screenshot({ path: join(OUT, `${p.n}-${n}.png`) }); }
  await pg.evaluate(() => ABY.Phone.show('msg')); await sleep(300); await pick(pg, 'Embrace'); await pick(pg, 'Open the gate'); await memoryShown(pg); await sleep(500); await fit('memory'); await pg.screenshot({ path: join(OUT, `${p.n}-9memory.png`) });
  await pg.click('#shareBtn'); await pg.waitForFunction(() => ABY.Phone.screen === 'share'); await sleep(700); await fit('share'); await pg.screenshot({ path: join(OUT, `${p.n}-10share.png`) });
  rec('phone-fit-' + p.n, checks.length === 0, checks.join(' | ') || 'targets >= 44px, text >= 11.5px, nothing cut off (lock, home, chat, 3 replies, gallery, pulse, settings, flute, memory)');
  await ctx.close();
}
// the notch: 47px side insets keep every button and the chat clear of the edge
({ ctx, pg } = await open(phoneCtx(PHONES[0]), 'notch')); await wake(pg);
await pg.addStyleTag({ content: ':root { --sl:47px !important; --sr:47px !important; }' }); await pg.click('#unlock'); await sleep(500); await pg.click('#icMsg'); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
const nt = await pg.evaluate(() => { const vw = innerWidth, L = [], Rr = []; for (const e of document.querySelectorAll('#msg .bar > *, #thread .m, #replies .chip, #status .l, #status .r')) { const r = e.getBoundingClientRect(); if (r.width) { L.push(r.left); Rr.push(r.right); } } return { l: Math.min(...L), r: Math.max(...Rr), vw }; });
rec('phone-notch', nt.l >= 46 && nt.r <= nt.vw - 46, 'content spans ' + Math.round(nt.l) + '..' + Math.round(nt.r) + ' of ' + nt.vw + ' with 47px insets'); await ctx.close();
// on a real phone the phone IS the screen: no bezel, no island
({ ctx, pg } = await open(phoneCtx(PHONES[2]), 'fullscreen')); await wake(pg);
const fsd = await pg.evaluate(() => { const d = document.getElementById('device').getBoundingClientRect(); return { w: d.width, h: d.height, vw: innerWidth, vh: innerHeight, island: document.getElementById('island').getBoundingClientRect().width > 0 }; });
rec('phone-is-fullscreen', Math.abs(fsd.w - fsd.vw) < 1 && Math.abs(fsd.h - fsd.vh) < 1 && !fsd.island, 'on a phone the device fills the screen (' + Math.round(fsd.w) + 'x' + Math.round(fsd.h) + ')'); await ctx.close();

// ================= saves =================
({ ctx, pg } = await open(phoneCtx(PHONES[0]), 'save')); await wake(pg); await openMessages(pg); await pick(pg, 'Follow the flute'); await pick(pg, 'Call to the small'); await pg.waitForSelector('#replies.on .chip');
const before = await pg.evaluate(() => ({ s: JSON.stringify(ABY.game.state), n: document.querySelectorAll('#thread .m').length }));
await pg.reload({ waitUntil: 'load' }); await pg.waitForFunction(() => document.getElementById('pre').classList.contains('done'));
const lockNote = await pg.evaluate(() => document.querySelector('#lkNotes .note .h span').textContent);
await pg.click('#unlock'); await sleep(500); await pg.click('#icMsg'); await pg.waitForSelector('#replies.on .chip', { timeout: 10000 }); await sleep(300);
const after = await pg.evaluate(() => ({ s: JSON.stringify(ABY.game.state), n: document.querySelectorAll('#thread .m').length }));
rec('save-continue', before.s === after.s && before.n === after.n && lockNote === 'Vey', 'reload: the lock screen shows ' + lockNote + '\'s last text; Messages resumes with the same ' + after.n + ' messages, stats and flags'); await ctx.close();
for (const [name, raw, want] of [
  ['garbage', 'not json {{{', 0], ['wrong shape', '[1,2,3]', 0], ['unknown node', JSON.stringify({ run: { node: '__proto__', heart: 9 }, found: { dawn: 1, evil: 1, crown: 'x' } }), 1],
  ['ending node', JSON.stringify({ run: { node: 'gate_opens', choices: 5 }, found: {} }), 0],
  ['hostile log', JSON.stringify({ run: { node: 'spire', choices: 2, log: [{ k: 'in', who: 'QUEEN', t: '<img src=x onerror=__pwn()>' }, { k: 'evil', t: 'x' }, { k: 'sys', t: 5 }, 7, { k: 'out', who: 'HACKER', t: 'ok' }] }, found: { echo: 1 } }), 1],
]) {
  const c = await open({}, 'hostile-' + name, { pre: `window.__ran = false; window.__pwn = () => { window.__ran = true; }; try { localStorage.setItem('kudbee.abyss.v2', ${JSON.stringify(raw)}); } catch (e) {}` });
  await wake(c.pg); await c.pg.click('#unlock'); await sleep(400); if (await c.pg.isVisible('#gOk')) await c.pg.click('#gOk'); await c.pg.click('#icMsg'); await sleep(1200);
  const o = await c.pg.evaluate(() => ({ lock: true, found: Object.keys(ABY.game.found).length, ran: window.__ran, img: !!document.querySelector('#thread img'), outs: document.querySelectorAll('#thread .m').length }));
  rec('save-hostile-' + name.replace(' ', '-'), o.found === want && !o.ran && !o.img, 'loads clean; endings found ' + o.found + '; no injected markup ran; ' + o.outs + ' messages drawn');
  await c.ctx.close();
}

// ================= first run: reply from the lock screen, the guide, swipe between home pages =================
{ const c = await open({ guide: true, ctx: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } }, 'firstrun'); const pg = c.pg; await wake(pg);
  await pg.waitForSelector('#lkNotes .nrep button', { timeout: 8000 });
  const chips = await pg.$$eval('#lkNotes .nrep button', bs => bs.map(x => ({ t: x.textContent, h: Math.round(x.getBoundingClientRect().height) })));
  await pg.click('#lkNotes .nrep button >> nth=0');
  await pg.waitForSelector('#guide:not([hidden])', { timeout: 8000 });
  const steps = await pg.$$eval('#guide li', l => l.length); await pg.click('#gOk');
  await pg.waitForFunction(() => ABY.game.state.choices >= 1, null, { timeout: 20000 });
  const o = await pg.evaluate(() => ({ node: ABY.game.state.node, out: [...document.querySelectorAll('#thread .m.out')].map(e => e.textContent), guided: ABY.game.guided, hidden: document.getElementById('guide').hidden }));
  rec('lock-reply-starts-level-one', chips.length >= 2 && chips.every(x => x.h >= 43) && o.node !== 'awakening' && o.out.length === 1 && o.out[0] === chips[0].t, chips.length + ' reply chips on the lock note (' + chips.map(x => x.h).join('/') + 'px); tapping "' + chips[0].t + '" -> ' + o.node);
  rec('first-run-guide', steps >= 4 && o.guided && o.hidden, 'a ' + steps + '-step guide shows on a first run, "Got it" dismisses and remembers it');
  await pg.evaluate(() => ABY.Phone.show('home')); await sleep(1200);
  const swipe = async (x0, x1) => { const s = await c.ctx.newCDPSession(pg); const pt = (x, t) => s.send('Input.dispatchTouchEvent', { type: t, touchPoints: t === 'touchEnd' ? [] : [{ x, y: 400, id: 1 }] }); await pt(x0, 'touchStart'); await pt((x0 + x1) / 2, 'touchMove'); await pt(x1, 'touchMove'); await pt(x1, 'touchEnd'); await sleep(600); };
  await swipe(330, 60); const l = await pg.evaluate(() => ABY.Phone.screen);
  await swipe(60, 330); const r = await pg.evaluate(() => ABY.Phone.screen);
  await pg.evaluate(() => ABY.Phone.show('home')); await sleep(1200); await swipe(300, 40); const ic = await pg.evaluate(() => ABY.Phone.screen);
  rec('swipe-home-pages', l === 'home2' && r === 'home' && ic === 'home2', 'swipe left -> ' + l + ', right -> ' + r + ', a swipe that starts on an icon -> ' + ic + ' (never opens the app)');
  await pg.reload(); await pg.waitForFunction(() => document.getElementById('pre').classList.contains('done'));
  const back = await pg.evaluate(() => ({ hidden: document.getElementById('guide').hidden, chips: document.querySelectorAll('#lkNotes .nrep').length }));
  rec('returning-player-no-guide', back.hidden && back.chips === 0, 'a saved journey skips the guide and the lock-screen reply chips');
  await c.ctx.close(); }

// ================= robustness =================
{ const c = await open({}, 'nocdn', { cdn: false }); await wake(c.pg); const nogl = await c.pg.evaluate(() => document.getElementById('screen').classList.contains('nogl'));
  await openMessages(c.pg); await c.pg.waitForSelector('#thread .m.sys', { timeout: 8000 }); await c.pg.screenshot({ path: join(OUT, 'no-3d-fallback.png') });
  rec('no-3d-still-plays', nogl, 'CDN blocked -> picture wallpaper + the whole phone still works'); await c.ctx.close(); }
{ const c = await open({}, 'nogl', { pre: 'const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/i.test(t) ? null : g.call(this, t, ...a); };' });
  await wake(c.pg); const ok = await c.pg.evaluate(() => document.getElementById('screen').classList.contains('nogl')); await openMessages(c.pg); await c.pg.waitForSelector('#thread .m.sys', { timeout: 8000 });
  rec('no-webgl-still-plays', ok, 'WebGL refused -> fallback + the chat still runs'); await c.ctx.close(); }
if (THREE_PATH) {
  const c = await open({}, 'hidden'); await wake(c.pg);
  await c.pg.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }); await sleep(300);
  const a = await c.pg.evaluate(() => ABY.debug.frames()); await sleep(900); const b = await c.pg.evaluate(() => ABY.debug.frames());
  await c.pg.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }); await sleep(700); const d = await c.pg.evaluate(() => ABY.debug.frames());
  rec('hidden-tab-pauses', b - a <= 1 && d - b >= 5, 'frames while hidden +' + (b - a) + ', after returning +' + (d - b)); await c.ctx.close();
}
{ const c = await open({ ctx: { reducedMotion: 'reduce' } }, 'reduced'); await wake(c.pg); await openMessages(c.pg); await c.pg.waitForSelector('#replies.on .chip', { timeout: 6000 });
  const o = await c.pg.evaluate(() => ({ red: ABY.Scene.reduced || !ABY.Scene.ready, bubbles: document.querySelectorAll('#thread .m.sys').length }));
  rec('reduced-motion', o.red && o.bubbles >= 1, 'messages arrive without the typing delay, scene sway off'); await c.ctx.close(); }

rec('no-console-errors', errs.length === 0, errs.slice(0, 2).join(' | ').slice(0, 220) || 'no page errors or console errors in any run');
await browser.close(); srv.close();
const pass = R.filter(r => r.pass).length; console.log('\n=== ' + pass + '/' + R.length + ' passed ===');
process.exit(pass === R.length ? 0 : 1);
