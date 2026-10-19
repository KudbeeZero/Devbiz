// Kudbee Abyss - playability + safety rubric (Playwright + Chromium). From the repo root: `npm run abyss:eval`.
// Walks the story in node (graph.mjs), then plays the real page AS A PHONE: lock screen, home screen, status bar, the Messages
// chat (all five endings by tapping replies), the Echo Flute (by touch, key and bot), Gallery, Pulse, Settings, banners and
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
import { graphChecks } from './graph.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), GAME = resolve(HERE, '..'), ROOT = resolve(GAME, '..', '..');
const OUT = join(HERE, 'out'), CACHE = join(HERE, '.cache'); mkdirSync(OUT, { recursive: true }); mkdirSync(CACHE, { recursive: true });
const R = [], rec = (id, pass, note) => { R.push({ id, pass: !!pass }); console.log((pass ? 'PASS' : 'FAIL') + ' ' + id + ' - ' + note); };
const skip = (id, why) => console.log('SKIP ' + id + ' - ' + why);
const sleep = ms => new Promise(r => setTimeout(r, ms));

for (const r of graphChecks()) rec(r.id, r.pass, r.note);

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
  const problems = [], slugs = ['dawn', 'song', 'echo', 'silence', 'crown', 'progress'];
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
  for (let i = 0; i < 6 && await pg.evaluate(() => ABY.game.delivering); i++) { await pg.keyboard.press('Enter'); await sleep(150); }
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
rec('chat-typing-and-bubbles', sawTyping && m0.bubbles >= 1 && m0.chips === 2, 'typing dots shown first: ' + sawTyping + ', ' + m0.bubbles + ' message bubble(s), ' + m0.chips + ' quick replies');
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
rec('share-native-sheet', sh && sh.url === SITE + '/games/kudbee-abyss/s/song/' && /Song Remembered/.test(sh.text) && /1 of 5/.test(sh.text) && sh.file && sh.file.n === 'kudbee-abyss.png' && sh.file.t === 'image/png' && sh.file.sz > 50000, sh ? 'share sheet got the link ' + sh.url.replace(SITE, '') + ' + ' + (sh.file ? sh.file.n + ' (' + Math.round(sh.file.sz / 1024) + 'KB)' : 'NO IMAGE') : 'navigator.share not called');
await pg.click('#shX'); await pg.click('#shFb'); await pg.click('#shWa'); const op = await pg.evaluate(() => window.__opened), land = encodeURIComponent(SITE + '/games/kudbee-abyss/s/song/');
rec('share-network-links', op.length === 3 && op[0].startsWith('https://twitter.com/intent/tweet?') && op[0].includes('url=' + land) && op[1].startsWith('https://www.facebook.com/sharer/sharer.php?u=' + land) && op[2].startsWith('https://wa.me/?text=') && op[2].includes(land), 'X, Facebook and WhatsApp all carry the landing-page link');
await pg.click('#shCopy'); await sleep(200); const cp = await pg.evaluate(() => window.__copied);
rec('share-copy-link', cp && /Song Remembered/.test(cp) && cp.endsWith(SITE + '/games/kudbee-abyss/s/song/'), 'the copied text ends with the landing-page link');
const dl = await Promise.all([pg.waitForEvent('download', { timeout: 5000 }).catch(() => null), pg.click('#shSave')]); const dn = dl[0] && dl[0].suggestedFilename();
rec('share-save-image', dn === 'kudbee-abyss-song.png', 'Save image downloads ' + dn);
// progress share (from Pulse): the count is personal, the link is the progress page
await pg.click('#shBack'); await sleep(300); await pg.evaluate(() => ABY.Phone.show('pulse')); await sleep(500); await pg.click('#pShare'); await pg.waitForFunction(() => ABY.Phone.screen === 'share'); await pg.click('#shNative'); await sleep(300);
const sp = await pg.evaluate(() => window.__shared); rec('share-progress', sp && sp.url === SITE + '/games/kudbee-abyss/s/progress/' && /1 of 5 endings/.test(sp.text) && sp.files && sp.files[0], sp ? sp.text.slice(0, 60) + '... -> ' + sp.url.replace(SITE, '') : 'navigator.share not called');
await pg.evaluate(() => ABY.Phone.show('home')); await sleep(300);
// the Gallery: the found ending is a photo, the rest are locked; tapping the photo reopens the memory; Pulse shows the stats; Settings toggles
await pg.mouse.move(550, 860).catch(() => {}); await pg.evaluate(() => ABY.Phone.show('home')); await sleep(400);
rec('gallery-badge', await pg.evaluate(() => !!document.querySelector('#icGal .badge')), 'the Gallery shows a badge for the new memory');
await pg.click('#icGal'); await sleep(500);
const gal = await pg.evaluate(() => [...document.querySelectorAll('#tiles .tile')].map(t => ({ f: t.classList.contains('f'), h: t.querySelector('h3').textContent })));
rec('gallery-tiles', gal.length === 5 && gal.filter(g => g.f).length === 1 && gal.filter(g => g.h === 'Locked').length === 4, gal.map(g => g.h).join(' | '));
await pg.click('#tiles .tile.f'); await sleep(300); rec('gallery-opens-memory', await pg.evaluate(() => document.getElementById('memory').classList.contains('on') && /Song Remembered/.test(document.getElementById('eName').textContent) && document.getElementById('eKick').textContent === 'Memory'), 'a found photo reopens its memory');
await pg.click('#memAct'); await sleep(300);
await pg.evaluate(() => ABY.Phone.show('pulse')); await sleep(900);
const pl = await pg.evaluate(() => ({ rows: [...document.querySelectorAll('#ringsL .rl .v')].map(v => v.textContent), sub: document.getElementById('pSub').textContent }));
rec('pulse-rings', pl.rows.length === 3 && /Endings found 1\/5/.test(pl.sub), 'Heart / Resolve / Trust ' + pl.rows.join(', ') + ' | ' + pl.sub);
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
      for (const el of document.querySelectorAll('button, a.appi, #homebar')) { if (!isVis(el)) continue; const r = el.getBoundingClientRect();
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
  for (const [app, n] of [['gallery', '5gallery'], ['pulse', '6pulse'], ['settings', '7settings'], ['flute', '8flute']]) { await pg.evaluate((a) => ABY.Phone.show(a), app); await sleep(900); await fit(app); await pg.screenshot({ path: join(OUT, `${p.n}-${n}.png`) }); }
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
  await wake(c.pg); await c.pg.click('#unlock'); await sleep(400); await c.pg.click('#icMsg'); await sleep(1200);
  const o = await c.pg.evaluate(() => ({ lock: true, found: Object.keys(ABY.game.found).length, ran: window.__ran, img: !!document.querySelector('#thread img'), outs: document.querySelectorAll('#thread .m').length }));
  rec('save-hostile-' + name.replace(' ', '-'), o.found === want && !o.ran && !o.img, 'loads clean; endings found ' + o.found + '; no injected markup ran; ' + o.outs + ' messages drawn');
  await c.ctx.close();
}

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
