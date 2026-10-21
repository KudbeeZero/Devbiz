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
async function open(opts = {}, tag = '', { cdn = true, pre, keepBoot } = {}) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 960, height: 600 } }, opts.ctx || {}));
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push(tag + ' ' + e.message)); pg.on('console', x => { if (x.type() === 'error' && !NOISE.test(x.text())) errs.push(tag + ' ' + x.text().slice(0, 140)); });
  await pg.route('https://fonts.*/**', r => r.abort());
  if (cdn && THREE_PATH) await pg.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, path: THREE_PATH }));
  else await pg.route('https://cdnjs.cloudflare.com/**', r => r.abort());
  if (!opts.guide) await pg.addInitScript(`try { if (!localStorage.getItem('kudbee.abyss.v2')) localStorage.setItem('kudbee.abyss.v2', '{"guided":true}'); } catch (e) {}`);   // the first-run guide has its own check; every other flow starts past it
  if (!opts.scramble) await pg.addInitScript('window.__abyOpening = "awakening";');   // flows that pick replies by name start at the first opening; the scramble has its own check
  if (pre) await pg.addInitScript(pre);
  await pg.goto(URL, { waitUntil: 'load' });
  await pg.waitForFunction(() => document.getElementById('pre').classList.contains('done'), null, { timeout: 15000 });
  if (!keepBoot) await pg.waitForFunction(() => document.getElementById('boot').classList.contains('gone'), null, { timeout: 15000 });   // the power-on screen has its own check
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
const hb = await pg.evaluate(() => { const r = document.getElementById('homebar').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });   // (start on the bar itself: its place moves with the phone's size)
await pg.mouse.move(hb.x, hb.y); await pg.mouse.down(); await pg.mouse.move(hb.x, hb.y - 100, { steps: 5 }); await pg.mouse.up(); await pg.waitForFunction(() => ABY.Phone.screen === 'home', null, { timeout: 3000 }).catch(() => {});
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
rec('share-native-sheet', sh && sh.url === SITE + '/games/kudbee-abyss/s/song/' && /Song Remembered/.test(sh.text) && /1 of 27/.test(sh.text) && sh.file && sh.file.n === 'kudbee-abyss.png' && sh.file.t === 'image/png' && sh.file.sz > 50000, sh ? 'share sheet got the link ' + sh.url.replace(SITE, '') + ' + ' + (sh.file ? sh.file.n + ' (' + Math.round(sh.file.sz / 1024) + 'KB)' : 'NO IMAGE') : 'navigator.share not called');
await pg.click('#shX'); await pg.click('#shFb'); await pg.click('#shWa'); const op = await pg.evaluate(() => window.__opened), land = encodeURIComponent(SITE + '/games/kudbee-abyss/s/song/');
rec('share-network-links', op.length === 3 && op[0].startsWith('https://twitter.com/intent/tweet?') && op[0].includes('url=' + land) && op[1].startsWith('https://www.facebook.com/sharer/sharer.php?u=' + land) && op[2].startsWith('https://wa.me/?text=') && op[2].includes(land), 'X, Facebook and WhatsApp all carry the landing-page link');
await pg.click('#shCopy'); await sleep(200); const cp = await pg.evaluate(() => window.__copied);
rec('share-copy-link', cp && /Song Remembered/.test(cp) && cp.endsWith(SITE + '/games/kudbee-abyss/s/song/'), 'the copied text ends with the landing-page link');
const dl = await Promise.all([pg.waitForEvent('download', { timeout: 5000 }).catch(() => null), pg.click('#shSave')]); const dn = dl[0] && dl[0].suggestedFilename();
rec('share-save-image', dn === 'kudbee-abyss-song.png', 'Save image downloads ' + dn);
// progress share (from Pulse): the count is personal, the link is the progress page
await pg.click('#shBack'); await sleep(300); await pg.evaluate(() => ABY.Phone.show('pulse')); await sleep(500); await pg.click('#pShare'); await pg.waitForFunction(() => ABY.Phone.screen === 'share'); await sleep(700); await pg.click('#shNative'); await sleep(300);
const sp = await pg.evaluate(() => window.__shared); rec('share-progress', sp && sp.url === SITE + '/games/kudbee-abyss/s/progress/' && /1 of 27 endings/.test(sp.text) && sp.files && sp.files[0], sp ? sp.text.slice(0, 60) + '... -> ' + sp.url.replace(SITE, '') : 'navigator.share not called');
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
rec('pulse-rings', pl.rows.length === 4 && /Endings found 1\/27/.test(pl.sub), 'Heart / Resolve / Trust / Dread ' + pl.rows.join(', ') + ' | ' + pl.sub);
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
    await pg.evaluate(id => ABY.debug.goto(id, {}), eyeId); await pg.waitForFunction(() => ABY.Scene.eye > 0.8, null, { timeout: 15000 }).catch(() => {});
    const on = await pg.evaluate(() => ABY.Scene.eye);
    await pg.evaluate(() => ABY.debug.goto(ABY.START, {})); await pg.waitForFunction(() => ABY.Scene.eye < 0.2, null, { timeout: 15000 }).catch(() => {});
    const off = await pg.evaluate(() => ABY.Scene.eye);
    rec('eye-backdrop', on > 0.8 && off < 0.2, 'the Eye fades in on its scene (' + on.toFixed(2) + ') and away after (' + off.toFixed(2) + ')');
  }
  await ctx.close();
}
{
  // power-on: the phone boots under the studio's name, never blocks a tap, then is gone
  ({ ctx, pg } = await open({}, 'boot', { keepBoot: true }));
  const b1 = await pg.evaluate(() => { const b = document.getElementById('boot'); return { txt: b.textContent, gone: b.classList.contains('gone'), pe: getComputedStyle(b).pointerEvents }; });
  await pg.waitForFunction(() => document.getElementById('boot').classList.contains('gone'), null, { timeout: 15000 });
  const b2 = await pg.evaluate(() => getComputedStyle(document.getElementById('boot')).display);
  rec('phone-boot', /Kudbee\s*Nightmares\s*Studio/.test(b1.txt) && !b1.gone && b1.pe === 'none' && b2 === 'none', 'the phone powers on as Kudbee Nightmares Studio, lets taps through, then clears');
  await ctx.close();
}
{
  // the App Store: free listings, gated by endings found; GET installs (and is remembered), OPEN shows its page
  ({ ctx, pg } = await open({}, 'store')); await wake(pg);
  const st = await pg.evaluate(async () => {
    const G = ABY.game, P = ABY.Phone, out = {};
    G.found = { song: 1 }; P.show('store');
    const rows = [...document.querySelectorAll('#stList .sti')]; out.rows = rows.length; out.locked = rows.filter(r => r.classList.contains('lk')).length;
    out.icon = !!document.querySelector('.appi[data-app="store"]');
    return out;
  });
  const btn = pg.locator('#stList .sti:not(.lk) .get').first();
  const bb = await btn.boundingBox();
  await btn.click(); await sleep(300);
  const after = await pg.evaluate(() => ({ appx: document.getElementById('appx').classList.contains('on'), name: document.getElementById('axName').textContent, saved: JSON.parse(localStorage.getItem('kudbee.abyss.v2') || '{}').apps }));
  await pg.click('#axBack'); await sleep(300);
  const back = await pg.evaluate(() => ({ store: document.getElementById('store').classList.contains('on'), open: [...document.querySelectorAll('#stList .get')].map(b => b.textContent) }));
  rec('app-store', st.icon && st.rows >= 4 && st.locked === st.rows - 2 && bb && bb.height >= 43.5 && after.appx && after.name === 'Lantern' && after.saved && after.saved.lantern === 1 && back.store && back.open[0] === 'OPEN', st.rows + ' listings (' + st.locked + ' locked), GET installs "' + after.name + '" and it is saved, back returns to the store, GET button ' + (bb ? bb.height : 0) + 'px');
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
{ // Day Four: a Day Three ending carries on (the button names the day), the Drowned Choir is a rite, and the book only closes for a veteran
  const { ctx, pg } = await open({}, 'day4'); await wake(pg); await openMessages(pg); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
  await at(pg, 'd3_finale', { choices: 20, flags: { rite_doors: 1 } }); await tapChip(pg, 'Look away'); const m = await memoryShown(pg);
  const nx = await pg.evaluate(() => { const b = document.getElementById('memNext'); return { shown: !b.hidden, t: b.textContent }; });
  await pg.click('#memNext'); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
  const d = await pg.evaluate(() => ({ node: ABY.game.state.node, doors: ABY.game.state.flags.rite_doors, thread: document.getElementById('thread').textContent, name: document.getElementById('mName').textContent, chips: [...document.querySelectorAll('#replies .chip')].map(c => c.textContent) }));
  rec('day-four-begins', m.name === 'The Watched' && nx.shown && nx.t === 'Day Four' && d.node === 'd4_wake' && d.doors === 1 && /Day Four/.test(d.thread) && d.name === 'Everyone Before You' && d.chips.length >= 3, '"' + m.name + '" offers ' + nx.t + '; it opens from "' + d.name + '": ' + d.chips.join(' / '));
  await at(pg, 'd4_stones', { mem: 7, dread: 1, light: 1, flags: { read_names: 1 } }); await pg.screenshot({ path: join(OUT, 'day4-stones.png') });
  await pick(pg, 'Raise the flute and sing with them'); await playSong(pg); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
  const w = await pg.evaluate(() => ({ node: ABY.game.state.node, flag: ABY.game.state.flags.rite_choir }));
  await tapChip(pg, 'Ask them their names'); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 }); const c1 = await chips(pg);
  await tapChip(pg, 'Say every name'); const e = await memoryShown(pg); const fin = await pg.evaluate(() => document.getElementById('memNext').hidden);
  rec('day-four-choir-and-names', w.node === 'd4_choir_win' && w.flag === 1 && c1.length === 4 && e.name === 'The Last Name' && fin, 'the choir is won (' + w.node + '), the shore shows ' + c1.length + ' choices, "' + e.name + '" is final'); await pg.screenshot({ path: join(OUT, 'day4-names.png') });
  await pg.click('#memAct'); await sleep(500);
  await at(pg, 'd4_shore', { mem: 2, flags: { rite_choir: 1, read_names: 1 } }); await pg.waitForSelector('#replies.on .chip', { timeout: 10000 }); const c0 = await chips(pg);
  rec('day-four-true-ending-gated', !c0.some(c => /every name/.test(c)) && c0.length === 3, 'with only 2 endings found the book will not close: ' + c0.join(' / '));
  await ctx.close();
}
{ // Day Five: a dark Day Four ending carries on as Wren's caller; the warning only works for a veteran who told the truth and won the wake-up
  const { ctx, pg } = await open({}, 'day5'); await wake(pg); await openMessages(pg); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
  await at(pg, 'd4_type', { mem: 3, choices: 20, flags: { rite_choir: 1 } }); await tapChip(pg, 'Press send'); const m = await memoryShown(pg);
  const nx = await pg.evaluate(() => { const b = document.getElementById('memNext'); return { shown: !b.hidden, t: b.textContent }; });
  await pg.click('#memNext'); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
  const d = await pg.evaluate(() => ({ node: ABY.game.state.node, thread: document.getElementById('thread').textContent, chips: [...document.querySelectorAll('#replies .chip')].map(c => c.textContent) }));
  rec('day-five-begins', m.name === 'The Next Caller' && nx.shown && nx.t === 'Day Five' && d.node === 'd5_wake' && /Day Five/.test(d.thread) && d.chips.length === 5, '"' + m.name + '" offers ' + nx.t + '; it opens: ' + d.chips.join(' / '));
  await at(pg, 'd5_truth', { mem: 8, dread: 1, light: 1, flags: { told_truth: 1 } }); await pg.screenshot({ path: join(OUT, 'day5-truth.png') });
  await pick(pg, 'Tell her to sing with you'); await playSong(pg); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
  const w = await pg.evaluate(() => ({ node: ABY.game.state.node, flag: ABY.game.state.flags.rite_wake }));
  await tapChip(pg, 'Tell her to hold on until the light'); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 }); const c1 = await chips(pg);
  await tapChip(pg, 'Have her call the first number'); const e = await memoryShown(pg); const fin = await pg.evaluate(() => document.getElementById('memNext').hidden);
  rec('day-five-wake-and-warning', w.node === 'd5_rite_win' && w.flag === 1 && c1.length === 4 && e.name === 'The Warning' && fin, 'the wake-up is won (' + w.node + '), dawn shows ' + c1.length + ' choices, "' + e.name + '" is final'); await pg.screenshot({ path: join(OUT, 'day5-warned.png') });
  await pg.click('#memAct'); await sleep(500);
  await at(pg, 'd5_dawn', { mem: 2, flags: { rite_wake: 1, told_truth: 1 } }); await pg.waitForSelector('#replies.on .chip', { timeout: 10000 }); const c0 = await chips(pg);
  rec('day-five-true-ending-gated', !c0.some(c => /first number/.test(c)) && c0.length === 3, 'with only 2 endings found the warning will not work: ' + c0.join(' / '));
  await ctx.close();
}
{ // falls and checkpoints: 3:07 Again is a fall, not a way on. It wakes her at the last dawn (one wake fewer, a little more afraid); with no wakes left, only a new journey
  const { ctx, pg } = await open(phoneCtx({ w: 844, h: 390 }), 'falls'); await wake(pg); await openMessages(pg); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
  await at(pg, 'd2_you', { mem: 2, dread: 1, heart: 2, flags: { knew_name: 1 } }); await tapChip(pg, 'Turn the phone off'); const m = await memoryShown(pg);
  const card = await pg.evaluate(() => { const b = document.getElementById('memNext'); return { shown: !b.hidden, t: b.textContent, act: document.getElementById('memAct').textContent }; });
  await pg.screenshot({ path: join(OUT, 'fall-wake-offer.png') });
  await pg.click('#memNext'); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
  const w = await pg.evaluate(() => { const g = ABY.game, d = JSON.parse(localStorage.getItem('kudbee.abyss.v2')); return { node: g.state.node, dread: g.state.dread, heart: g.state.heart, flag: g.state.flags.knew_name, wakes: g.wakes, thread: document.getElementById('thread').textContent, saved: d.wakes, cp: d.cp && d.cp.node, found: !!g.found.loop }; });
  rec('fall-wakes-at-dawn', m.name === '3:07 Again' && card.shown && card.t === 'Wake at dawn \u00B7 3 left' && w.node === 'd2_you' && w.dread === 2 && w.heart === 2 && w.flag === 1 && w.wakes === 2 && w.saved === 2 && w.cp === 'd2_you' && w.found && /again/.test(w.thread) && /2 wakes left/.test(w.thread),
    '"' + m.name + '" offers "' + card.t + '"; she wakes at ' + w.node + ' with dread ' + w.dread + ' and ' + w.wakes + ' wakes left (saved), the ending still in the Gallery');
  await pg.evaluate(() => { ABY.game.wakes = 0; }); await tapChip(pg, 'Turn the phone off'); const m2 = await memoryShown(pg);
  const last = await pg.evaluate(() => ({ next: !document.getElementById('memNext').hidden, kick: document.getElementById('eKick').textContent, act: document.getElementById('memAct').textContent }));
  await pg.screenshot({ path: join(OUT, 'fall-no-wakes.png') });
  await pg.click('#memAct'); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
  const fresh = await pg.evaluate(() => ({ node: ABY.game.state.node, wakes: ABY.game.wakes, cp: ABY.game.cp && ABY.game.cp.node }));
  rec('fall-without-wakes', m2.name === '3:07 Again' && !last.next && /will not wake again/.test(last.kick) && last.act === 'Start over' && fresh.node === 'awakening' && fresh.wakes === 3 && fresh.cp === 'awakening',
    'no wakes left: "' + last.kick + '", only "' + last.act + '"; the new journey opens at ' + fresh.node + ' with ' + fresh.wakes + ' wakes');
  await ctx.close();
}
{ // scars: the fall she just suffered wakes with her (a way past it, and a note in her own handwriting); a new journey carries every scar, and the glass shows them
  const { ctx, pg } = await open(phoneCtx({ w: 844, h: 390 }), 'scars'); await wake(pg); await openMessages(pg); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
  await at(pg, 'd2_you', { mem: 2, dread: 1 }); const before = await chips(pg); await tapChip(pg, 'Turn the phone off'); await memoryShown(pg);
  await pg.click('#memNext'); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
  const w = await pg.evaluate(() => ({ chips: [...document.querySelectorAll('#replies .chip')].map(c => c.textContent), scar: ABY.game.state.flags.scar_loop, notes: ABY.game.state.notes.slice(), glass: document.getElementById('screen').getAttribute('data-scars'), badge: (document.querySelector('[data-app="notes"] .badge') || {}).textContent }));
  await pg.screenshot({ path: join(OUT, 'scar-wake.png') });
  await tapChip(pg, 'Leave it on'); const n1 = await pg.evaluate(() => ABY.game.state.node);
  rec('scar-wakes-wiser', !before.some(c => /Leave it on/.test(c)) && w.chips.some(c => /Leave it on/.test(c)) && w.scar === 1 && w.notes.includes('scar_loop') && w.glass === '1' && w.badge === '1' && n1 === 'd2_want',
    'after 3:07 Again she wakes with the scar: "' + w.chips.filter(c => /Leave/.test(c))[0] + '" -> ' + n1 + '; a note in her own handwriting; the glass is cracked (' + w.glass + ')');
  await ctx.close();
  const pre = `try { localStorage.setItem('kudbee.abyss.v2', JSON.stringify({ guided: true, found: { loop: 1, drowned: 1, hollow: 1, dawn: 1 } })); } catch (e) {}`;
  const c2 = await open(phoneCtx({ w: 844, h: 390 }), 'scars-new', { pre }); await wake(c2.pg); await openMessages(c2.pg); await c2.pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
  const j = await c2.pg.evaluate(() => ({ flags: Object.keys(ABY.game.state.flags).sort().join(), notes: ABY.game.state.notes.length, glass: document.getElementById('screen').getAttribute('data-scars'), banner: document.getElementById('banner').textContent, cracks: getComputedStyle(document.querySelector('#cracks .c2')).display }));
  await c2.pg.screenshot({ path: join(OUT, 'scars-new-journey.png') });
  rec('scars-carry-into-new-journeys', j.flags === 'scar_drowned,scar_hollow,scar_loop' && j.notes === 3 && j.glass === '2' && j.cracks !== 'none' && /3 notes/.test(j.banner),
    'three falls in the Gallery: the new journey starts with ' + j.flags + ', ' + j.notes + ' notes ("' + j.banner.trim().slice(0, 60) + '"), and the glass at crack level ' + j.glass);
  await c2.ctx.close();
}
{ // the evidence board: in Notes, tap two clues to pin them. A wrong pair costs battery and dread; the right pair files a deduction (kept over nights)
  // and opens a hidden choice in the scene she is in; that scene returns to the door, and is offered once
  const { ctx, pg } = await open(phoneCtx({ w: 844, h: 390 }), 'evidence'); await wake(pg); await openMessages(pg); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
  await at(pg, 'd2_door', { mem: 2, dread: 1, notes: ['recording', 'future_call', 'ledger'] }); const before = await chips(pg);
  await pg.evaluate(() => ABY.Phone.show('notes')); await pg.waitForSelector('#noteList .nt.pin', { timeout: 5000 });
  const s0 = await pg.evaluate(() => ({ bat: ABY.game.state.bat, dread: ABY.game.state.dread, h: Math.min(...[...document.querySelectorAll('#noteList .nt.pin')].map(e => e.getBoundingClientRect().height)) }));
  // with a long list the tray must stay in view (the pinned clue and what the last pin did), or the player scrolls away from the answer
  await pg.evaluate(() => { const st = ABY.game.state; ['vey_photo', 'photo_you', 'holders', 'first_page', 'next_line', 'wren_call', 'eye', 'nursery_wall', 'door_crack', 'bargain'].forEach(k => { if (!st.notes.includes(k)) st.notes.push(k); }); ABY.Phone.show('home'); ABY.Phone.show('notes'); });
  await pg.waitForSelector('#noteList .nt.pin[data-note="bargain"]'); await pg.evaluate(() => { document.querySelector('#notes .pad').scrollTop = 99999; });
  await pg.click('#noteList .nt.pin[data-note="bargain"]'); await sleep(300);
  const tray = await pg.evaluate(() => { const t = document.querySelector('.pintray'), p = document.querySelector('#notes .pad').getBoundingClientRect(), r = t.getBoundingClientRect(), c = document.getElementById('nCancel'); return { inView: r.top >= p.top - 1 && r.bottom <= p.bottom && r.height > 0, text: t.textContent, cancel: !!c && c.getBoundingClientRect().height >= 36, scrolled: document.querySelector('#notes .pad').scrollTop > 200 }; });
  await pg.click('#nCancel'); await sleep(200); const cleared = await pg.evaluate(() => ({ sel: document.querySelectorAll('#noteList .nt.sel').length, cancel: !!document.getElementById('nCancel'), tray: document.getElementById('nMsg').textContent }));
  await pg.evaluate(() => { document.querySelector('#notes .pad').scrollTop = 0; });
  rec('notes-tray-stays-in-view', tray.inView && tray.scrolled && /What the Queen gave/.test(tray.text) && tray.cancel && cleared.sel === 0 && !cleared.cancel && /Tap two clues/.test(cleared.tray),
    'with a long clue list scrolled to the bottom, the tray stays pinned in view ("' + tray.text.replace(/Cancel$/, '').trim() + '") with a Cancel; Cancel puts the clue down');
  await pg.click('#noteList .nt.pin[data-note="recording"]'); await pg.click('#noteList .nt.pin[data-note="ledger"]'); await sleep(300);
  const bad = await pg.evaluate(() => ({ bat: ABY.game.state.bat, dread: ABY.game.state.dread, msg: document.getElementById('nMsg').textContent, ded: document.querySelectorAll('#noteList .ded').length }));
  await pg.click('#noteList .nt.pin[data-note="future_call"]'); const sel = await pg.evaluate(() => { const e = document.querySelector('#noteList .nt.sel'); return e ? e.getAttribute('data-note') + ':' + e.getAttribute('aria-pressed') : ''; });
  await pg.click('#noteList .nt.pin[data-note="recording"]'); await sleep(300);
  const good = await pg.evaluate(() => { const d = JSON.parse(localStorage.getItem('kudbee.abyss.v2')); return { flag: ABY.game.state.flags.link_two_warnings, bat: ABY.game.state.bat, ded: [...document.querySelectorAll('#noteList .ded h3')].map(h => h.textContent), sub: document.getElementById('nSub').textContent, deduced: d.deduced && d.deduced.two_warnings, run: d.run && d.run.flags.link_two_warnings }; });
  await pg.screenshot({ path: join(OUT, 'evidence-board.png') });
  rec('evidence-board-pins', s0.h >= 44 && bad.bat === s0.bat - 2 && bad.dread === s0.dread + 1 && /don’t fit/.test(bad.msg) && bad.ded === 0 && sel === 'future_call:true'
    && good.flag === 1 && good.bat === bad.bat && good.ded.length === 1 && /Two warnings/.test(good.ded[0]) && /1 deduction/.test(good.sub) && good.deduced === 1 && good.run === 1,
    'clue cards are ' + Math.round(s0.h) + 'px tall; a wrong pair costs 2% and 1 dread ("' + bad.msg.slice(0, 40) + '..."); the right pair files "' + good.ded[0] + '", saved for this night and every night');
  await pg.evaluate(() => ABY.Phone.show('msg')); await sleep(400); const after = await chips(pg);
  await pick(pg, 'Two warnings'); await pick(pg, 'nearly');
  await pg.waitForFunction(() => ABY.game.state.node === 'd2_door' && !ABY.game.delivering, null, { timeout: 15000 }).catch(() => {}); await sleep(300);
  const back = await pg.evaluate(() => ({ node: ABY.game.state.node, trust: ABY.game.state.trust, chips: [...document.querySelectorAll('#replies .chip')].map(c => c.textContent), thread: document.getElementById('thread').textContent }));
  rec('deduction-opens-a-choice', !before.some(c => /Two warnings/.test(c)) && after.some(c => /Two warnings/.test(c)) && back.node === 'd2_door' && back.trust === 1 && /is it morning yet/.test(back.thread) && !back.chips.some(c => /Two warnings/.test(c)),
    'before the pin: ' + before.length + ' choices; after it, "' + after.filter(c => /Two warnings/.test(c))[0] + '" -> the voice behind the door -> back at the door (trust ' + back.trust + '), and it is not offered twice');
  await ctx.close();
}
{ // a reply is felt (a ring of light from the thumb, a sound; a frightening one lands dark), and a call that will not take no: declined, it rings
  // again louder, and the third time it has answered itself
  const { ctx, pg } = await open(phoneCtx({ w: 844, h: 390 }), 'calls'); await wake(pg); await openMessages(pg); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
  await pg.evaluate(() => { window.__sfx = []; const f = ABY.Audio.sfx; ABY.Audio.sfx = function (n) { window.__sfx.push(n); return f.apply(this, arguments); }; });
  await at(pg, 'd2_wake', {}); await tapChip(pg, 'Message the Queen');
  const plain = await pg.evaluate(() => ({ r: document.querySelectorAll('#screen .ripple:not(.dark)').length, cls: document.getElementById('screen').className, sfx: window.__sfx.slice() }));
  await at(pg, 'd2_photo', {}); await pg.evaluate(() => { window.__sfx = []; }); await tapChip(pg, 'Put the phone down');
  const dark = await pg.evaluate(() => ({ r: document.querySelectorAll('#screen .ripple.dark').length, cls: document.getElementById('screen').className, sfx: window.__sfx.slice() }));
  await sleep(900); const gone = await pg.evaluate(() => document.querySelectorAll('#screen .ripple').length);
  rec('replies-are-felt', plain.r >= 1 && /\bstruck\b/.test(plain.cls) && plain.sfx.includes('pick') && dark.r >= 1 && /struck-dark/.test(dark.cls) && dark.sfx.includes('pickdark') && gone === 0,
    'a reply: a ring of light and "' + plain.sfx.filter(x => /pick/.test(x))[0] + '"; a frightening one: a red ring, the glass shudders, "' + dark.sfx.filter(x => /pick/.test(x))[0] + '"; the rings clear themselves');
  await at(pg, 'c3_corvin', {}); await pg.waitForSelector('#call.on[data-ring="1"]', { timeout: 15000 });
  const r1 = await pg.evaluate(() => ({ who: document.getElementById('callWho').textContent, n: document.querySelectorAll('#callAct .cbtn').length, dread: ABY.game.state.dread }));
  await pg.locator('#callAct .cbtn.no').click(); await pg.waitForSelector('#call.on[data-ring="2"]', { timeout: 15000 });
  const r2 = await pg.evaluate(() => ({ sub: document.getElementById('callSub').textContent, n: document.querySelectorAll('#callAct .cbtn').length, sfx: window.__sfx.slice() }));
  await pg.screenshot({ path: join(OUT, 'call-rings-again.png') });
  await pg.locator('#callAct .cbtn.no').click(); await pg.waitForSelector('#call.on[data-ring="3"]', { timeout: 15000 });
  const r3 = await pg.evaluate(() => ({ btns: [...document.querySelectorAll('#callAct .cbtn')].map(b => b.textContent.replace(/[^A-Za-z]/g, '')), dread: ABY.game.state.dread }));
  await pg.screenshot({ path: join(OUT, 'call-answers-itself.png') });
  await pg.locator('#callAct .cbtn').first().click(); await pick(pg, 'Thank him');
  const done = await pg.evaluate(() => ({ node: ABY.game.state.node, call: document.getElementById('call').classList.contains('on'), thread: document.getElementById('thread').textContent }));
  rec('calls-will-not-take-no', r1.who === 'Corvin Ash' && r1.n === 2 && r2.n === 2 && /again/.test(r2.sub) && r2.sfx.includes('ring2') && r3.btns.join() === 'Listen' && r3.dread === r1.dread + 2 && /I called/.test(done.thread) && !done.call && ['d3_blood', 'd3_blood_win', 'd3_blood_fail'].includes(done.node),
    'Corvin Ash calls; declined, it rings again ("' + r2.sub + '", harsher), declined again it answers itself (only "' + r3.btns.join() + '"), dread ' + r1.dread + ' -> ' + r3.dread + '; then on to ' + done.node);
  await ctx.close();
}
{ // overnight messages: a day that carries on opens with what the people she met said while she slept, for the flags she earned, each from its own
  // contact; a clue filed by one is announced, and it unlocks a deduction (the little key + the nursery wall) that opens a way past the low lock
  const { ctx, pg } = await open(phoneCtx({ w: 844, h: 390 }), 'overnight'); await wake(pg); await openMessages(pg); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
  await at(pg, 'd2_door', { mem: 3, resolve: 3, flags: { vey_known: 1, freed_name: 1 } }); await tapChip(pg, 'Hold the door yourself'); await memoryShown(pg);
  await pg.click('#memNext'); await pg.waitForFunction(() => ABY.game.state.node === 'd3_wake', null, { timeout: 15000 });
  for (let i = 0; i < 14 && await pg.evaluate(() => ABY.game.delivering); i++) { await pg.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))); await sleep(160); }
  await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
  const m = await pg.evaluate(() => ({ who: [...document.querySelectorAll('#thread .who')].map(w => w.textContent), thread: document.getElementById('thread').textContent, notes: ABY.game.state.notes.slice(), banner: document.getElementById('banner').textContent, badge: (document.querySelector('[data-app="notes"] .badge') || {}).textContent, head: document.getElementById('mName').textContent }));
  await pg.screenshot({ path: join(OUT, 'overnight-day-three.png') });
  rec('overnight-messages-arrive', m.who.slice(0, 3).join() === 'Vey,Guardian,No Caller ID' && /left something on your pillow/.test(m.thread) && /saying it to myself all night/.test(m.thread) && /day three/i.test(m.thread) && m.notes.includes('vey_gift') && /New clue: Message: Vey/.test(m.banner) && m.head === 'No Caller ID',
    'Day Three opens with ' + m.who.slice(0, 3).join(' then ') + ' (the Eye\u2019s own line comes last); Vey’s message files "' + (m.notes.includes('vey_gift') ? 'Message: Vey, overnight' : '?') + '" and the banner announces it; the header goes back to ' + m.head);
  await at(pg, 'd3_wake', { mem: 3, flags: {} }); const quiet = await pg.evaluate(() => document.getElementById('thread').textContent);
  rec('overnight-silent-without-flags', !/pillow|saying it to myself/.test(quiet) && /day three/i.test(quiet), 'a player without those flags hears nothing from Vey or the Guardian');
  await at(pg, 'd6_door', { mem: 3, notes: ['vey_gift', 'nursery_wall'], flags: {} }); const before = await chips(pg);
  await pg.evaluate(() => ABY.Phone.show('notes')); await pg.waitForSelector('#noteList .nt.pin[data-note="vey_gift"]'); await pg.click('#noteList .nt.pin[data-note="vey_gift"]'); await pg.click('#noteList .nt.pin[data-note="nursery_wall"]'); await sleep(300);
  await pg.evaluate(() => ABY.Phone.show('msg')); await sleep(400);
  await tapChip(pg, 'little brass key'); await pg.waitForFunction(() => ABY.game.state.node === 'ev_key', null, { timeout: 15000 });
  await tapChip(pg, 'Turn the key'); await pg.waitForFunction(() => ABY.game.state.node === 'd6_dawn', null, { timeout: 15000 });
  const key = await pg.evaluate(() => ({ promised: ABY.game.state.flags.promised_sorrel, node: ABY.game.state.node }));
  rec('little-key-opens-the-low-lock', !before.some(c => /little brass key/.test(c)) && key.promised === 1 && key.node === 'd6_dawn', 'pinning the key to the nursery wall adds "Try the little brass key in the low lock"; turning it frees Sorrel and promises to come back');
  await at(pg, 'd2_wake', { mem: 3, open: 'op_bath' }); const bath = await pg.evaluate(() => document.getElementById('thread').textContent);
  await at(pg, 'd2_wake', { mem: 3 }); const first = await pg.evaluate(() => document.getElementById('thread').textContent);
  rec('overnight-remembers-the-way-in', /You came up through the water this time/.test(bath) && !/You came/.test(first), 'a journey that began in the bath hears about it on Day Two; the first journey does not');
  await ctx.close();
}
{ // the Clock: from a day's scene she can turn the clock back (a flashback) or wind it forward (a flash-forward). The glass tints, the clock reads another hour,
  // a stamp announces it, a sound plays; every choice in it comes back to the scene she left (which does not repeat itself), the slip is gone from the choices,
  // its clue is filed, and what she saw opens a choice on a later day. The way back survives a reload.
  const { ctx, pg } = await open(phoneCtx({ w: 844, h: 390 }), 'clock'); await wake(pg); await openMessages(pg); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
  await pg.evaluate(() => { window.__sfx = []; const f = ABY.Audio.sfx; ABY.Audio.sfx = function (n) { window.__sfx.push(n); return f.apply(this, arguments); }; });
  await at(pg, 'd3_wake', { mem: 3, flags: { doubt: 1 } }); const origin = await chips(pg);
  await tapChip(pg, 'Turn the clock back'); await pg.waitForFunction(() => ABY.game.state.node === 'fb_locking', null, { timeout: 15000 });
  for (let i = 0; i < 14 && await pg.evaluate(() => ABY.game.delivering); i++) { await pg.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))); await sleep(160); }
  await pg.waitForSelector('#replies.on .chip', { timeout: 15000 }); await sleep(900);
  const past = await pg.evaluate(() => ({ time: document.getElementById('screen').getAttribute('data-time'), fx: getComputedStyle(document.getElementById('timefx')).opacity, clock: document.getElementById('clock').textContent, thread: document.getElementById('thread').textContent, sfx: window.__sfx.slice(), chips: [...document.querySelectorAll('#replies .chip')].map(c => c.textContent), save: JSON.parse(localStorage.getItem('kudbee.abyss.v2')).run, banner: document.getElementById('banner').textContent }));
  await pg.screenshot({ path: join(OUT, 'clock-flashback.png') });
  await tapChip(pg, 'Watch, and say nothing'); await pg.waitForFunction(() => ABY.game.state.node === 'd3_wake' && !ABY.game.delivering, null, { timeout: 15000 }); await sleep(900);
  const back = await pg.evaluate(() => ({ time: document.getElementById('screen').getAttribute('data-time'), fx: getComputedStyle(document.getElementById('timefx')).opacity, thread: document.getElementById('thread').textContent, flag: ABY.game.state.flags.tt_locking, notes: ABY.game.state.notes.slice(), back: ABY.game.state.back, chips: [...document.querySelectorAll('#replies .chip')].map(c => c.textContent) }));
  const wakeText = (t) => (t.match(/practising your face/g) || []).length;
  rec('clock-turns-back-and-returns', origin.some(c => /Turn the clock back/.test(c)) && origin.some(c => /Wind the clock forward/.test(c)) && past.time === 'past' && past.fx === '1' && past.clock === '1:08' && /Flashback/.test(past.thread) && past.sfx.includes('rewind')
    && past.chips.length === 3 && past.chips.some(c => /gate needs a lock/.test(c)) && past.save && past.save.node === 'fb_locking' && past.save.back === 'd3_wake'
    && back.time === '' && back.fx === '0' && /clock settles/.test(back.thread) && back.flag === 1 && back.notes.includes('locking') && back.back === '' && wakeText(back.thread) === 1 && !back.chips.some(c => /Turn the clock back/.test(c)) && back.chips.some(c => /Wind the clock forward/.test(c)),
    'the clock runs back to ' + past.clock + ' (glass tinted, "' + past.sfx.filter(x => /rewind/.test(x))[0] + '", a stamp); a flashback with ' + past.chips.length + ' choices (one only because she doubted her) is saved with its way back; "Watch" returns to Day Three without repeating it, the clue is filed and the slip is gone');
  await tapChip(pg, 'Wind the clock forward'); await pg.waitForFunction(() => ABY.game.state.node === 'ff_choir', null, { timeout: 15000 });
  for (let i = 0; i < 14 && await pg.evaluate(() => ABY.game.delivering); i++) { await pg.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))); await sleep(160); }
  await pg.waitForSelector('#replies.on .chip', { timeout: 15000 }); await sleep(900);
  const fut = await pg.evaluate(() => ({ time: document.getElementById('screen').getAttribute('data-time'), clock: document.getElementById('clock').textContent, thread: document.getElementById('thread').textContent, sfx: window.__sfx.slice(), dread: ABY.game.state.dread }));
  await pg.screenshot({ path: join(OUT, 'clock-flashforward.png') });
  await tapChip(pg, 'Memorise the eleven notes'); await pg.waitForFunction(() => ABY.game.state.node === 'd3_wake' && !ABY.game.delivering, null, { timeout: 15000 });
  const done = await pg.evaluate(() => ({ flag: ABY.game.state.flags.tt_choir, chips: [...document.querySelectorAll('#replies .chip')].map(c => c.textContent), notes: ABY.game.state.notes.slice() }));
  await at(pg, 'd4_stones', { mem: 3, flags: { tt_choir: 1 } }); const stones = await chips(pg);
  await at(pg, 'd4_stones', { mem: 3, flags: {} }); const plain = await chips(pg);
  rec('clock-winds-forward-and-pays-off', fut.time === 'future' && fut.clock === '6:51' && /Flash-forward/.test(fut.thread) && fut.sfx.includes('forward') && fut.dread === 1 && done.flag === 1 && !done.chips.some(c => /Wind the clock forward/.test(c)) && done.notes.includes('glimpse_choir')
    && stones.some(c => /own name into the water/.test(c)) && !plain.some(c => /own name into the water/.test(c)),
    'winding forward shows ' + fut.clock + ' and the Day Four water; having seen it opens "Say your own name into the water" on the night, and not otherwise');
  await ctx.close();
}
{ // leaving the ending card must not lose what the ending offered: the next day, or a wake at dawn. It survives swiping home, tapping the badge banner, closing the
  // app (a reload), and shows on the lock screen; only "New journey" / "Start over" lets it go
  const { ctx, pg } = await open(phoneCtx({ w: 844, h: 390 }), 'card'); await wake(pg); await openMessages(pg); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
  await at(pg, 'd2_door', { mem: 3, resolve: 3 }); await tapChip(pg, 'Hold the door yourself'); const m1 = await memoryShown(pg);
  const card = () => pg.evaluate(() => ({ shown: document.getElementById('memory').classList.contains('on'), next: document.getElementById('memNext').hidden ? '' : document.getElementById('memNext').textContent, kick: document.getElementById('eKick').textContent, saved: (() => { const d = JSON.parse(localStorage.getItem('kudbee.abyss.v2')); return d.pend ? d.pend.kind + ':' + d.pend.id + ':' + (d.pend.state ? d.pend.state.node : '') : ''; })() }));
  const c1 = await card();
  await pg.evaluate(() => ABY.Phone.show('home')); await sleep(400); const gone = await pg.evaluate(() => document.getElementById('memory').classList.contains('on'));
  const badge = await pg.evaluate(() => (document.querySelector('[data-app="msg"] .badge') || {}).textContent || '');
  await pg.evaluate(() => ABY.Phone.show('lock')); await sleep(300); const lock = await pg.evaluate(() => document.getElementById('lkNotes').textContent);
  await pg.evaluate(() => ABY.Phone.show('home')); await pg.click('#icMsg'); await sleep(500); const c2 = await card();
  rec('ending-card-offer-survives-leaving', m1.name === 'The Night Keeper' && c1.next === 'Day Three' && c1.saved === 'carry:keeper:d3_wake' && !gone && badge === '1' && /Day Three is waiting/.test(lock) && c2.shown && c2.next === 'Day Three' && /waiting/.test(c2.kick),
    'at "' + m1.name + '" the card offers ' + c1.next + ' and saves it (' + c1.saved + '); leaving the card, the Messages icon wears a badge, the lock screen says "Day Three is waiting", and opening Messages brings the card back with "' + c2.next + '"');
  await pg.click('#memNext'); await pg.waitForFunction(() => ABY.game.state.node === 'd3_wake', null, { timeout: 15000 });
  const after = await pg.evaluate(() => ({ node: ABY.game.state.node, thread: document.getElementById('thread').textContent, pend: JSON.parse(localStorage.getItem('kudbee.abyss.v2')).pend }));
  // the app is closed on the card: reload, and the lock screen still offers it
  await at(pg, 'd2_door', { mem: 3, resolve: 3 }); await tapChip(pg, 'Hold the door yourself'); await memoryShown(pg); await sleep(300);
  await pg.reload(); await pg.waitForFunction(() => document.getElementById('boot').classList.contains('gone'), null, { timeout: 15000 }); await wake(pg);
  const lock2 = await pg.evaluate(() => document.getElementById('lkNotes').textContent); await openMessages(pg); await sleep(500); const c3 = await card();
  await pg.click('#memNext'); await pg.waitForFunction(() => ABY.game.state.node === 'd3_wake', null, { timeout: 15000 });
  const d3 = await pg.evaluate(() => ({ thread: document.getElementById('thread').textContent, keptResolve: ABY.game.state.resolve }));
  rec('ending-card-offer-survives-a-reload', after.node === 'd3_wake' && /Day Three/.test(after.thread) && after.pend === null && /Day Three is waiting/.test(lock2) && c3.shown && c3.next === 'Day Three' && /Day Three/.test(d3.thread) && d3.keptResolve >= 3,
    'taking it starts Day Three and clears the offer; with the app closed on the card, the reloaded lock screen says "Day Three is waiting" and Messages offers "' + c3.next + '" with her resolve kept (' + d3.keptResolve + ')');
  // a fall: the wakes are not lost either; and "New journey" is how she lets the offer go
  await at(pg, 'd2_you', { mem: 2, dread: 1, heart: 2, flags: { knew_name: 1 } }); await tapChip(pg, 'Turn the phone off'); await memoryShown(pg);
  const f1 = await card(); await pg.evaluate(() => ABY.Phone.show('home')); await sleep(300); await pg.reload(); await pg.waitForFunction(() => document.getElementById('boot').classList.contains('gone'), null, { timeout: 15000 }); await wake(pg);
  await openMessages(pg); await sleep(500); const f2 = await card(); await pg.click('#memNext'); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
  const f3 = await pg.evaluate(() => ({ node: ABY.game.state.node, wakes: ABY.game.wakes, thread: document.getElementById('thread').textContent }));
  rec('fall-wakes-survive-leaving-the-card', f1.next === 'Wake at dawn · 3 left' && f1.saved === 'wake:loop:' && f2.shown && f2.next === 'Wake at dawn · 3 left' && f3.node === 'd2_you' && f3.wakes === 2 && /2 wakes left/.test(f3.thread),
    'after 3:07 Again she leaves the card and the app; Messages offers "' + f2.next + '" and she wakes at ' + f3.node + ' with ' + f3.wakes + ' wakes left');
  await at(pg, 'd2_door', { mem: 3, resolve: 3 }); await tapChip(pg, 'Hold the door yourself'); await memoryShown(pg); await pg.click('#memAct'); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
  const n1 = await pg.evaluate(() => ({ node: ABY.game.state.node, pend: JSON.parse(localStorage.getItem('kudbee.abyss.v2')).pend }));
  rec('new-journey-lets-the-offer-go', n1.node === 'awakening' && n1.pend === null, '"New journey" starts at ' + n1.node + ' and clears the saved offer');
  await ctx.close();
}
{ // the beginnings, deeper: a journey that began in the lift plays three scenes of its own (the panel, a drawing taped where it should not be, the wall where "W. WAS HERE"),
  // files its clue, and then goes on into the haze as it always did; the lift comes back as a flashback on Day Four and again on Day Six, only for that journey, and what
  // she remembers there is read by Wren on Day Five and by the Eye on Day Seven
  const { ctx, pg } = await open(phoneCtx({ w: 844, h: 390 }), 'threads'); await wake(pg); await openMessages(pg); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
  await at(pg, 'op_lift', { open: 'op_lift' }); const c0 = await chips(pg); await tapChip(pg, 'Study the crown');
  await pg.waitForFunction(() => ABY.game.state.node === 'op_lift_b', null, { timeout: 15000 }); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 }); const t1 = await pg.evaluate(() => document.getElementById('thread').textContent);
  await tapChip(pg, 'Take the drawing'); await pg.waitForFunction(() => ABY.game.state.node === 'op_lift_c', null, { timeout: 15000 }); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 }); const c3 = await chips(pg);
  const note = await pg.evaluate(() => ({ notes: ABY.game.state.notes.slice(), banner: document.getElementById('banner').textContent, open: ABY.game.state.open }));
  await pg.screenshot({ path: join(OUT, 'opening-lift-third-scene.png') });
  await tapChip(pg, 'Step out into the haze'); const n4 = await pg.evaluate(() => ABY.game.state.node);
  rec('opening-has-three-scenes-of-its-own', c0.length === 3 && /drawing of a lift/.test(t1) && c3.join('|') === 'Step out into the haze|Press every button at once|Say hello to her' && note.notes.includes('o_lift') && /New clue: The lift wall/.test(note.banner) && note.open === 'op_lift' && n4 === 'flute_path',
    'the lift journey: "' + c0[0] + '" -> a drawing taped where it should not be -> "W. WAS HERE" (clue "The lift wall") -> the same three ways into the haze (' + n4 + '), and she remembers how she began (' + note.open + ')');
  await at(pg, 'd4_wake', { open: 'op_lift', mem: 3 });
  // seven choices on a landscape phone: the list scrolls inside its own box (it used to run off the bottom of the screen), a fade says there are more, and the last one can be reached
  const sc0 = await pg.evaluate(() => { const r = document.getElementById('replies'), s = document.getElementById('screen').getBoundingClientRect(); return { over: r.scrollHeight > r.clientHeight + 10, more: r.classList.contains('more'), box: Math.round(r.getBoundingClientRect().bottom) <= Math.round(s.bottom), n: r.querySelectorAll('.chip').length }; });
  await pg.evaluate(() => { document.getElementById('replies').scrollTop = 99999; }); await sleep(250);
  const sc1 = await pg.evaluate(() => { const r = document.getElementById('replies'), c = [...r.querySelectorAll('.chip')].pop(), cb = c.getBoundingClientRect(), rb = r.getBoundingClientRect(); return { more: r.classList.contains('more'), last: c.textContent, reach: cb.bottom <= rb.bottom + 1 && cb.top >= rb.top - 1 }; });
  await pg.evaluate(() => { document.getElementById('replies').scrollTop = 0; }); await sleep(150);
  rec('long-choice-lists-scroll', sc0.n === 7 && sc0.over && sc0.more && sc0.box && !sc1.more && sc1.reach && /first came in/.test(sc1.last), 'with ' + sc0.n + ' choices on an 844x390 phone the list scrolls in its own box and fades while more are below (' + sc0.more + '); scrolled to the end the last one, "' + sc1.last + '", is fully reachable and the fade is gone');
  const d4 = await chips(pg); await tapChip(pg, 'how you first came in');
  await pg.waitForFunction(() => ABY.game.state.node === 'ec4_lift', null, { timeout: 15000 });
  for (let i = 0; i < 14 && await pg.evaluate(() => ABY.game.delivering); i++) { await pg.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))); await sleep(160); }
  await pg.waitForSelector('#replies.on .chip', { timeout: 15000 }); await sleep(900);
  const e4 = await pg.evaluate(() => ({ time: document.getElementById('screen').getAttribute('data-time'), thread: document.getElementById('thread').textContent }));
  await pg.screenshot({ path: join(OUT, 'opening-lift-echo-day4.png') });
  await tapChip(pg, 'Take the drawing, and keep it'); await pg.waitForFunction(() => ABY.game.state.node === 'd4_wake' && !ABY.game.delivering, null, { timeout: 15000 });
  const back = await pg.evaluate(() => ({ flag: ABY.game.state.flags.tt_echo4, chips: [...document.querySelectorAll('#replies .chip')].map(c => c.textContent) }));
  await at(pg, 'd4_wake', { open: 'op_bath', mem: 3 }); const bath = await chips(pg); await at(pg, 'd4_wake', { mem: 3 }); const first = await chips(pg);
  await at(pg, 'd5_truth', { mem: 3, flags: { tt_echo4: 1 } }); const truth = await chips(pg); await at(pg, 'd5_truth', { mem: 3 }); const plain = await chips(pg);
  await at(pg, 'd6_dawn', { open: 'op_lift', mem: 3, flags: { promised_sorrel: 1 } }); const d6 = await chips(pg);
  await at(pg, 'd7_eye', { mem: 3, flags: { tt_echo6: 1 } }); const eye = await chips(pg);
  rec('opening-comes-back-on-day-four-and-six', d4.some(c => /how you first came in \(the lift\)/.test(c)) && e4.time === 'past' && /pressing the button to call it/.test(e4.thread) && back.flag === 1 && !back.chips.some(c => /first came in/.test(c))
    && bath.some(c => /how you first came in \(the bath\)/.test(c)) && !bath.some(c => /the lift/.test(c)) && !first.some(c => /first came in/.test(c))
    && truth.some(c => /how you came in, the very first night/.test(c)) && !plain.some(c => /how you came in, the very first night/.test(c)) && d6.some(c => /the lift, once more/.test(c)) && eye.some(c => /door you came through/.test(c)),
    'Day Four offers the lift flashback only to the journey that began there ("' + (d4.filter(c => /first came in/.test(c))[0] || '') + '"; a bath journey is offered the bath, the first journey nothing), it is a warm flashback that returns and is seen once; Wren reads it on Day Five, the lift returns on Day Six, and the Eye on Day Seven reads the door');
  await ctx.close();
}
{ // Days Six and Seven: Day Five carries on, Day Six finds the first page (and Sorrel), and the book closes on the seventh morning only for a veteran
  const { ctx, pg } = await open({}, 'day67'); await wake(pg); await openMessages(pg); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
  await at(pg, 'd5_dawn', { mem: 3, choices: 20, flags: { told_truth: 1 } }); await tapChip(pg, 'Promise to stay on the line'); const m = await memoryShown(pg);
  const nx = await pg.evaluate(() => { const b = document.getElementById('memNext'); return { shown: !b.hidden, t: b.textContent }; });
  await pg.click('#memNext'); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
  const d = await pg.evaluate(() => ({ node: ABY.game.state.node, thread: document.getElementById('thread').textContent, chips: [...document.querySelectorAll('#replies .chip')].map(c => c.textContent) }));
  rec('day-six-begins', m.name === 'The Night Line' && nx.shown && nx.t === 'Day Six' && d.node === 'd6_wake' && /Day Six/.test(d.thread) && d.chips.length === 3, '"' + m.name + '" offers ' + nx.t + '; it opens: ' + d.chips.join(' / '));
  await at(pg, 'd6_sorrel', { mem: 3, dread: 1 }); await pg.waitForSelector('#replies.on .chip', { timeout: 10000 });
  const so = await pg.evaluate(() => ({ name: document.getElementById('mName').textContent, av: document.getElementById('mAv').className, who: [...document.querySelectorAll('#thread .who')].map(w => w.textContent).pop() }));
  rec('sorrel-speaks', so.name === 'Sorrel' && /sorrel/.test(so.av) && so.who === 'Sorrel', 'the first number answers as ' + so.name + ' (' + so.av + ')'); await pg.screenshot({ path: join(OUT, 'day6-sorrel.png') });
  await at(pg, 'd6_dawn', { mem: 3, flags: { promised_sorrel: 1, told_truth: 1 } }); await tapChip(pg, 'Say you will come back'); const m2 = await memoryShown(pg);
  const nx2 = await pg.evaluate(() => document.getElementById('memNext').textContent); await pg.click('#memNext'); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
  const d2 = await pg.evaluate(() => ({ node: ABY.game.state.node, thread: document.getElementById('thread').textContent, wren: [...document.querySelectorAll('#replies .chip')].some(c => /Call Wren/.test(c.textContent)) }));
  rec('day-seven-begins', m2.name === 'The First Page' && nx2 === 'Day Seven' && d2.node === 'd7_wake' && /Day Seven/.test(d2.thread) && d2.wren, '"' + m2.name + '" offers ' + nx2 + '; Wren can be called because she was told the truth');
  await at(pg, 'd7_gather', { mem: 10, heart: 3, dread: 1, flags: { told_truth: 1, named_eye: 1 } }); await tapChip(pg, 'Raise the flute'); await playSong(pg); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
  const w = await pg.evaluate(() => ({ node: ABY.game.state.node, flag: ABY.game.state.flags.rite_seventh, slam: ABY.Song.stats.slam, chords: ABY.Song.stats.chords }));
  await tapChip(pg, 'Go to the first page'); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 }); const c1 = await chips(pg);
  await tapChip(pg, 'Read the first page aloud'); const e = await memoryShown(pg); const fin = await pg.evaluate(() => document.getElementById('memNext').hidden);
  rec('seventh-morning', w.node === 'd7_rite_win' && w.flag === 1 && w.slam === w.chords && w.chords >= 20 && c1.length === 3 && e.name === 'The Seventh Morning' && fin,
    'the Seventh Night is won (' + w.slam + '/' + w.chords + ' slams), the first page shows ' + c1.length + ' choices, "' + e.name + '" is the end of the week'); await pg.screenshot({ path: join(OUT, 'day7-seventh-morning.png') });
  await pg.click('#memAct'); await sleep(500);
  await at(pg, 'd7_end', { mem: 2, heart: 3, flags: { told_truth: 1, named_eye: 1, rite_seventh: 1 } }); await pg.waitForSelector('#replies.on .chip', { timeout: 10000 }); const c0 = await chips(pg);
  rec('day-seven-true-ending-gated', !c0.some(c => /first page/.test(c)) && c0.length === 2, 'with only 2 endings found the book will not close: ' + c0.join(' / '));
  await ctx.close();
}
{ // the accusation (Day Seven): lay out the notes and name who kept it 3:07. Three wrong names are always there; the Queen only with "Who she locked
  // away" pinned; the key to the low lock turns her confession into The Low Door. A wrong name is a fall
  const { ctx, pg } = await open({}, 'accuse'); await wake(pg); await openMessages(pg); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
  await at(pg, 'd7_gather', { mem: 2, heart: 2, dread: 1 }); const g = await chips(pg); await tapChip(pg, 'Lay out your notes'); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
  const a0 = await chips(pg), n0 = await pg.evaluate(() => ABY.game.state.node);
  await at(pg, 'd7_accuse', { mem: 2, heart: 2, dread: 1, flags: { link_what_she_gave: 1 } }); const a1 = await chips(pg); await tapChip(pg, 'The Queen'); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
  const c1 = await chips(pg), conf = await pg.evaluate(() => ({ node: ABY.game.state.node, name: document.getElementById('mName').textContent, note: ABY.game.state.notes.includes('confession') }));
  await at(pg, 'd7_confess', { mem: 2, heart: 2, dread: 1, flags: { link_what_she_gave: 1, link_low_lock: 1 } }); const c2 = await chips(pg);
  await tapChip(pg, 'Give her Vey'); const e = await memoryShown(pg); const fin = await pg.evaluate(() => document.getElementById('memNext').hidden); await pg.screenshot({ path: join(OUT, 'day7-low-door.png') });
  await pg.click('#memAct'); await sleep(500);
  await at(pg, 'd7_accuse', { mem: 2, heart: 2, dread: 1 }); await tapChip(pg, 'The Eye'); await tapChip(pg, 'Wait'); const f = await memoryShown(pg);
  rec('accusation-low-door', g.some(c => /Lay out your notes/.test(c)) && n0 === 'd7_accuse' && a0.length === 4 && !a0.some(c => /Queen/.test(c)) && a1.length === 5 && a1.some(c => /The Queen/.test(c))
    && conf.node === 'd7_confess' && conf.note && c1.length === 1 && c2.length === 2 && e.name === 'The Low Door' && fin && f.name === 'Day One, Again',
    'the notes open the accusation (' + a0.length + ' suspects without the deduction, ' + a1.length + ' with it); the Queen confesses (' + conf.name + '), and with the key: "' + e.name + '" ends the week; naming the Eye: "' + f.name + '"');
  await ctx.close();
}
{ // ten openings: a returning player's new journey is scrambled into another beginning (never the one they just had), on a phone
  const pre = `try { localStorage.setItem('kudbee.abyss.v2', JSON.stringify({ guided: true, found: { dawn: 1, song: 1, echo: 1 }, lastOpen: 'awakening' })); } catch (e) {}`;
  const { ctx, pg } = await open(Object.assign({ scramble: true }, phoneCtx({ w: 844, h: 390 })), 'scramble', { pre }); await wake(pg); await openMessages(pg); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
  const o = await pg.evaluate(() => ({ node: ABY.game.state.node, chips: [...document.querySelectorAll('#replies .chip')].map(c => c.textContent), want: ABY.NODES[ABY.game.state.node].choices.map(c => c.label), last: JSON.parse(localStorage.getItem('kudbee.abyss.v2')).lastOpen }));
  await pg.screenshot({ path: join(OUT, 'opening-scrambled.png') });
  await tapChip(pg, o.chips[0]); const n1 = await pg.evaluate(() => ABY.game.state.node);
  rec('opening-scrambled', ABYS.OPENINGS.includes(o.node) && o.node !== 'awakening' && o.chips.join('|') === o.want.join('|') && o.last === o.node && n1 !== o.node,
    'a returning player opens on ' + o.node + ' (not the last one, awakening): ' + o.chips.join(' / ') + ' -> ' + n1);
  await ctx.close();
}
{ // the two hard rites: chords. A perfect player slams every chord and wins; half a chord is not a slam; a rite that is given up still goes on
  const { ctx, pg } = await open({}, 'hardrites'); await wake(pg); await openMessages(pg); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
  await at(pg, 'd4_shore', { mem: 7, dread: 3, flags: { rite_choir: 1, read_names: 1 } }); await pg.waitForSelector('#replies.on .chip', { timeout: 10000 });
  await tapChip(pg, 'Ring the drowned bells'); await playSong(pg); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
  const b = await pg.evaluate(() => { const s = ABY.Song.stats, g = ABY.game.state; return { node: g.node, flag: g.flags.rite_bells, slam: s.slam, chords: s.chords, acc: s.acc, total: s.total }; });
  await tapChip(pg, 'Wade back to the shore'); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 }); const c = await chips(pg);
  const sd = await pg.evaluate(() => ({ node: ABY.game.state.node, dread: ABY.game.state.dread, done: ABY.game.state.flags.bells_done }));
  rec('hard-rite-bells', b.node === 'd4_bells_win' && b.flag === 1 && b.chords >= 12 && b.slam === b.chords && b.acc === 1 && sd.node === 'd4_shore' && sd.dread === 1 && sd.done === 1 && !c.some(x => /drowned bells/.test(x)),
    'the bot lands ' + b.slam + '/' + b.chords + ' slams of ' + b.total + ' notes and wins; dread 3 -> ' + sd.dread + '; the bells are offered once: ' + c.join(' / ')); await pg.screenshot({ path: join(OUT, 'day4-bells-won.png') });
  await at(pg, 'd5_dawn', { mem: 8, dread: 2, flags: { rite_wake: 1, told_truth: 1 } }); await pg.waitForSelector('#replies.on .chip', { timeout: 10000 });
  await tapChip(pg, 'Play her the riff'); await playSong(pg); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
  const r = await pg.evaluate(() => { const s = ABY.Song.stats, g = ABY.game.state; return { node: g.node, flag: g.flags.rite_riff, slam: s.slam, chords: s.chords, total: s.total }; });
  rec('hard-rite-riff', r.node === 'd5_riff_win' && r.flag === 1 && r.chords >= 24 && r.slam === r.chords, 'the bot lands ' + r.slam + '/' + r.chords + ' slams of ' + r.total + ' notes and wins'); await pg.screenshot({ path: join(OUT, 'day5-riff-won.png') });
  // half a chord is not a slam; both together is; a chord is two notes that both have to be struck
  const h = await pg.evaluate(() => {
    const S = ABY.Song; S.start(() => {}, ABY.RITES.riff); S.bot = false; const ch = S.notes.filter(n => n.pair && n.lane < n.pair.lane);
    const a = ch[0], a2 = a.pair; S.t = a.t; S.press(a.lane); S.t = a.t + 0.14; S.press(a2.lane);            // 0.14 s apart: both land, no slam
    const slow = S.stats.slam, b = ch[1], b2 = b.pair; S.t = b.t; S.press(b.lane); S.press(b2.lane);        // together: a slam
    const out = { slow, together: S.stats.slam, hits: S.stats.perfect + S.stats.good, total: S.stats.total, chords: S.stats.chords }; S.stop(); return out;
  });
  rec('chord-slam-needs-both-together', h.slow === 0 && h.together === 1 && h.hits === 4 && h.chords >= 24, 'struck 0.14s apart: ' + h.slow + ' slams; together: ' + h.together + ' (' + h.hits + ' notes hit)');
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
  rec('gallery-badges-factions', g.tiles === 27 && g.found === 1 && g.on === 6 && g.all === 16 && g.fb.join() === 'Choir of Recall,Order of the Door,Hollow Court' && g.lean === 1, g.found + ' of ' + g.tiles + ' memories (the new endings draw), ' + g.on + '/' + g.all + ' badges, factions ' + g.fb.join(' / '));
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
  const lay = () => pg.evaluate(() => { const sh = document.getElementById('sheet'), cs = getComputedStyle(sh), vw = innerWidth, vh = innerHeight, rp = document.getElementById('replies'), rb = rp.getBoundingClientRect(), scrolls = rp.scrollHeight > rp.clientHeight + 1, bad = [...document.querySelectorAll('#replies .chip')].filter(c => { const r = c.getBoundingClientRect(); return r.right > vw + 1 || r.left < -1 || (!scrolls && (r.bottom > vh + 1 || r.top < -1)); }).length + (rb.bottom > vh + 1 || rb.top < -1 ? 1 : 0); return { pos: cs.position, node: ABY.game.state.node, chips: document.querySelectorAll('#replies .chip').length, bad, canvasOk: (() => { const c = document.querySelector('#three-canvas canvas'); return !c || Math.abs(c.getBoundingClientRect().width - document.getElementById('screen').getBoundingClientRect().width) < 2; })() }; });
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

// Calm flashes: a scare never strobes, flickers, shakes or goes white; on by default for reduced motion, and a switch in Settings that persists
{ const c = await open({}, 'calm'); const pg = c.pg; await wake(pg); await openMessages(pg); await pg.waitForSelector('#replies.on .chip', { timeout: 8000 });
  const look = () => pg.evaluate(() => { const sc = document.getElementById('screen'), a = getComputedStyle(sc, '::after'); return { calm: document.documentElement.classList.contains('calm'), shake: getComputedStyle(sc).animationName, after: a.animationName, bg: a.backgroundColor, sheet: getComputedStyle(document.getElementById('sheet')).animationName }; });
  await pg.evaluate(() => ABY.debug.scare('jump')); await sleep(60); const off = await look();
  await pg.evaluate(() => ABY.Phone.show('settings')); await sleep(300); await pg.click('#setCalm'); await sleep(100);
  await pg.reload({ waitUntil: 'load' }); await pg.waitForFunction(() => document.getElementById('pre').classList.contains('done')); await pg.waitForFunction(() => document.getElementById('boot').classList.contains('gone'), null, { timeout: 15000 });
  await pg.evaluate(() => ABY.Phone.show('msg')); await sleep(400);
  await pg.evaluate(() => ABY.debug.scare('jump')); await sleep(60); const jump = await look(); await sleep(800);
  await pg.evaluate(() => ABY.debug.scare('glitch')); await sleep(60); const glitch = await look(); await sleep(1000);
  await pg.evaluate(() => ABY.debug.scare('eye')); await sleep(60); const eye = await look();
  await pg.evaluate(() => ABY.Phone.show('settings')); await sleep(300); const pressed = await pg.evaluate(() => document.getElementById('setCalm').getAttribute('aria-pressed'));
  await c.ctx.close();
  const r = await open({ ctx: { reducedMotion: 'reduce' } }, 'calm-reduced'); const byDefault = await r.pg.evaluate(() => document.documentElement.classList.contains('calm')); await r.ctx.close();
  const white = (bg) => /rgb\(25[0-5], 25[0-5], 25[0-5]/.test(bg);
  rec('calm-flashes', !off.calm && off.after === 'jumpFlash' && off.shake === 'jumpShake' && jump.calm && pressed === 'true' && jump.shake === 'none' && jump.after === 'calmFade' && !white(jump.bg) && glitch.sheet === 'none' && eye.after === 'calmFade' && byDefault,
    'off: ' + off.shake + '/' + off.after + '/' + off.bg + ' (calm ' + off.calm + '); Calm flashes (saved across a reload): no shake (' + jump.shake + '), a dark fade (' + jump.after + ', ' + jump.bg + '), no glitch (' + glitch.sheet + '), a slow Eye (' + eye.after + ', pressed ' + pressed + '); on by default with reduced motion: ' + byDefault); }

// ================= phone fit =================
for (const p of PHONES) {
  ({ ctx, pg } = await open(phoneCtx(p), 'fit-' + p.n)); await wake(pg);
  const checks = [];
  const fit = async (screen) => {
    await pg.evaluate(() => new Promise(done => {          // measure a screen only once it has stopped sliding in (a slow machine finishes the transition late)
      const at = () => [...document.querySelectorAll('#homebar, .scr.on button')].slice(0, 8).map(e => { const r = e.getBoundingClientRect(); return Math.round(r.left * 10) + ',' + Math.round(r.top * 10); }).join(';');
      let last = '', same = 0, n = 0; (function tick() { const now = at(); same = now === last ? same + 1 : 0; last = now; if (same >= 6 || ++n > 240) done(); else requestAnimationFrame(tick); })();
    }));
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
  for (const [app, n] of [['gallery', '5gallery'], ['pulse', '6pulse'], ['settings', '7settings'], ['flute', '8flute'], ['notes', '8notes'], ['store', '9store']]) { await pg.evaluate((a) => ABY.Phone.show(a), app); await sleep(900); await fit(app); await pg.screenshot({ path: join(OUT, `${p.n}-${n}.png`) }); }
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
  const steps = await pg.$$eval('#guide li', l => l.length);
  const warn = await pg.evaluate(() => { const w = document.querySelector('#guide .gwarn'), b = document.getElementById('gCalm'), r = b && b.getBoundingClientRect(); return { text: w ? w.textContent : '', h: r ? Math.round(r.height) : 0, before: document.documentElement.classList.contains('calm') }; });
  await pg.click('#gCalm'); const calmOn = await pg.evaluate(() => ({ cls: document.documentElement.classList.contains('calm'), pressed: document.getElementById('gCalm').getAttribute('aria-pressed'), saved: JSON.parse(localStorage.getItem('kudbee.abyss.v2')).calm }));
  rec('photosensitivity-warning', /Photosensitivity warning/.test(warn.text) && /flash/.test(warn.text) && warn.h >= 44 && !warn.before && calmOn.cls && calmOn.pressed === 'true' && calmOn.saved === true, 'the first-run guide warns about flashing lights before the first scare; its Calm flashes switch (' + warn.h + 'px) turns calm on and saves it');
  await pg.click('#gOk');
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
