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
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { resolve, join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { graphChecks } from './graph.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), GAME = resolve(HERE, '..'), ROOT = resolve(GAME, '..', '..');
const OUT = join(HERE, 'out'), CACHE = join(HERE, '.cache'); mkdirSync(OUT, { recursive: true }); mkdirSync(CACHE, { recursive: true });
const R = [], rec = (id, pass, note) => { R.push({ id, pass: !!pass }); console.log((pass ? 'PASS' : 'FAIL') + ' ' + id + ' - ' + note); };
const skip = (id, why) => console.log('SKIP ' + id + ' - ' + why);
const sleep = ms => new Promise(r => setTimeout(r, ms));
// The rubric is a list of named blocks, each with its own browser contexts. ONLY=graph,vibration runs just those (the fast loop while building);
// eval/parallel.mjs runs every block, spread over several processes by how long each took last time (EVAL_TIMES = where this run writes that).
// A block that throws is a FAIL with its error, and the rest still run.
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',').map(x => x.trim()).filter(Boolean)) : null, want = (name) => !ONLY || ONLY.has(name), TIMES = {};
async function block(name, fn) {
  if (!want(name)) return;
  const t = Date.now();
  try { await fn(); } catch (e) { rec('block-' + name, false, 'crashed: ' + String((e && e.message) || e).split('\n')[0].slice(0, 240)); }
  TIMES[name] = (TIMES[name] || 0) + Date.now() - t;
}

await block('graph', async () => {
  for (const r of graphChecks()) rec(r.id, r.pass, r.note);
});
const ABYS = createRequire(import.meta.url)(join(GAME, 'src', 'story.js'));

// ---- three.js, verified ----
const html = readFileSync(join(GAME, 'index.html'), 'utf8');
const m = html.match(/<script src="(https:\/\/cdnjs\.cloudflare\.com\/[^"]*three\.min\.js)" integrity="sha384-([^"]+)"/);
if (want('share-meta')) rec('abyss-sri-present', !!m && /crossorigin="anonymous"/.test(html.slice(html.indexOf('three.min.js'), html.indexOf('three.min.js') + 200)), m ? 'three.js has integrity + crossorigin' : 'three.js tag has no integrity hash');
let THREE_PATH = null;
if (m) {
  const f = join(CACHE, 'three.r128.min.js');
  try { if (!existsSync(f) || statSync(f).size < 1e5) { const tmp = f + '.' + process.pid; execFileSync('curl', ['-sSfL', '-m', '60', '-o', tmp, m[1]], { stdio: 'ignore' }); renameSync(tmp, f); } } catch (e) { /* offline */ }   // (a temp name, so parallel shards never read a half-written copy)
  if (existsSync(f) && statSync(f).size > 1e5) {
    const h = createHash('sha384').update(readFileSync(f)).digest('base64');
    if (want('share-meta')) rec('abyss-sri-matches-cdn-file', h === m[2], h === m[2] ? 'integrity hash matches the file the CDN serves' : 'HASH MISMATCH: the browser would refuse three.js on the live site');
    if (h === m[2]) THREE_PATH = f;
  } else if (want('share-meta')) skip('abyss-sri-matches-cdn-file', 'cdnjs unreachable from here');
}

// ---- link previews: the game page and every landing page carry an image of the right size ----
const jpegSize = (file) => { const b = readFileSync(file); if (b[0] !== 0xff || b[1] !== 0xd8) return null; for (let i = 2; i < b.length - 9;) { if (b[i] !== 0xff) { i++; continue; } const m = b[i + 1]; if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) }; i += 2 + b.readUInt16BE(i + 2); } return null; };
const metaOf = (html) => { const o = {}; for (const t of html.match(/<meta\b[^>]*>/gi) || []) { const k = (t.match(/(?:property|name)="([^"]+)"/) || [])[1], v = (t.match(/content="([^"]*)"/) || [])[1]; if (k && v !== undefined) o[k] = v; } o.canonical = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1]; o.title = (html.match(/<title>([^<]*)<\/title>/) || [])[1]; return o; };
const SITE = 'https://devbiz.kudbee.workers.dev';
const imgFile = (u) => join(ROOT, new globalThis.URL(u).pathname);
await block('share-meta', async () => {
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
});

// ---- a static server (a folder URL serves its index.html) ----
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.json': 'application/json', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
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
let ctx, pg;                                            // the blocks that drive one page from line to line share these
async function open(opts = {}, tag = '', { cdn = true, pre, keepBoot } = {}) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 960, height: 600 }, serviceWorkers: 'block' }, opts.ctx || {}));   // (routes cannot see what a service worker fetches; the offline check has its own context)
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push(tag + ' ' + e.message)); pg.on('console', x => { if (x.type() === 'error' && !NOISE.test(x.text())) errs.push(tag + ' ' + x.text().slice(0, 140)); });
  await pg.route('https://fonts.*/**', r => r.abort());
  if (cdn && THREE_PATH) await pg.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, path: THREE_PATH }));
  else await pg.route('https://cdnjs.cloudflare.com/**', r => r.abort());
  if (!opts.guide) await pg.addInitScript(`try { if (!localStorage.getItem('kudbee.abyss.v2')) localStorage.setItem('kudbee.abyss.v2', '{"guided":true}'); } catch (e) {}`);   // the first-run guide has its own check; every other flow starts past it
  if (!opts.beats) await pg.addInitScript('window.__abySkipBeats = true;');   // beats are pure pass-throughs: flows walk through them to the scene they mean; the beats block plays them
  if (!opts.scramble) await pg.addInitScript('window.__abyOpening = "awakening";');
  if (!opts.hero) await pg.addInitScript('window.__abyHero = "";');   // flows that pick replies by name begin as no one in particular; choosing who you were has its own check   // flows that pick replies by name start at the first opening; the scramble has its own check
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
  // the first scene is a three-scene prologue now: a flow that means "the first scene's three ways" reads through it first (a flow that asks for a prologue line gets it)
  const PRO = ['Feel for the flute at your back', 'Read the note again, slowly'];
  if (!PRO.some(t => text.indexOf(t) === 0 || t.indexOf(text) === 0)) {
    for (const t of PRO) { if (await pg.locator('#replies .chip', { hasText: t }).count()) { await pg.locator('#replies .chip', { hasText: t }).first().click(); await sleep(250); await pg.waitForFunction(() => ABY.game.delivering || document.querySelector('#replies.on .chip'), null, { timeout: 15000 }); for (let i = 0; i < 6 && await pg.evaluate(() => ABY.game.delivering); i++) { await pg.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))); await sleep(150); } await pg.waitForSelector('#replies.on .chip', { timeout: 10000 }); } }
  }
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
await block('desktop', async () => {
  ({ ctx, pg } = await open({ ctx: { viewport: { width: 1100, height: 900 } } }, 'bezel'));
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
  rec('chat-reply-bubbles', m1.outs.join('|') === 'Feel for the flute at your back|Read the note again, slowly|Listen to the stones|Ask Vey to guide me', 'her replies appear as outgoing bubbles, prologue first: ' + m1.outs.join(' / '));
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
});

// the five endings, by tapping replies in Messages
await block('endings', async () => {
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
});
// the song ending: the Song of Recall arrives as a message; the Echo Flute plays it; a bot plays it perfectly
await block('song-and-share', async () => {
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
});

// the Echo Flute app: practice by touch and by key; fail; the best score is kept
await block('flute', async () => {
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
});
// no input in the story: the song fails, the Guardian offers another try
await block('song-fail', async () => {
  ({ ctx, pg } = await open({}, 'songfail')); await wake(pg); await openMessages(pg);
  await pick(pg, 'Listen to the stones'); await pick(pg, 'Ask Vey'); await pick(pg, 'Play the Song'); await pick(pg, 'Raise the flute'); await pg.waitForFunction(() => ABY.Song.active); await pg.evaluate(() => { ABY.Song.rate = 3; });
  await pg.waitForFunction(() => !ABY.Song.active, null, { timeout: 40000 }); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
  const failed = await pg.evaluate(() => ({ node: ABY.game.state.node, fail: ABY.game.state.flags.song, chips: [...document.querySelectorAll('#replies .chip')].map(b => b.textContent) }));
  rec('song-fail', failed.node === 'song_fail' && failed.fail === 'fail' && failed.chips.some(o => /again/i.test(o)), 'node ' + failed.node + ' | ' + failed.chips.join(' / ')); await ctx.close();
});


// ================= the horror: dread, flashlight, battery, calls, clues, scares, forced scenes =================
const at = async (pg, id, patch) => {                  // be at a scene (a test hook) and let its messages arrive
  await pg.evaluate(([i, p]) => ABY.debug.goto(i, p), [id, patch || {}]);
  for (let i = 0; i < 12 && await pg.evaluate(() => ABY.game.delivering); i++) { await pg.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))); await sleep(140); }
  await sleep(250);
};
await block('scares-3d', async () => {
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
});
await block('boot', async () => {
  // power-on: the phone boots under the studio's name, never blocks a tap, then is gone
  ({ ctx, pg } = await open({}, 'boot', { keepBoot: true }));
  const b1 = await pg.evaluate(() => { const b = document.getElementById('boot'); return { txt: b.textContent, gone: b.classList.contains('gone'), pe: getComputedStyle(b).pointerEvents }; });
  await pg.waitForFunction(() => document.getElementById('boot').classList.contains('gone'), null, { timeout: 15000 });
  const b2 = await pg.evaluate(() => getComputedStyle(document.getElementById('boot')).display);
  rec('phone-boot', /Kudbee\s*Nightmares\s*Studio/.test(b1.txt) && !b1.gone && b1.pe === 'none' && b2 === 'none', 'the phone powers on as Kudbee Nightmares Studio, lets taps through, then clears');
  await ctx.close();
});
await block('app-store', async () => {
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
});

await block('app-whispers', async () => {
  // an installed app reaches into a later day: a new journey starts with it, Lantern speaks as itself on a dark scene (the torch stutters) once,
  // a phone without it hears nothing, and an app installed mid-journey reaches the day she is in
  const pre = `localStorage.setItem('kudbee.abyss.v2', JSON.stringify({ guided: true, found: { dawn: 1, nightline: 1 }, apps: { lantern: 1 } }));`;
  ({ ctx, pg } = await open(phoneCtx({ w: 844, h: 390 }), 'whispers', { pre })); await wake(pg); await openMessages(pg); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
  const journey = await pg.evaluate(() => ({ lantern: ABY.game.state.flags.app_lantern === 1, redial: !!ABY.game.state.flags.app_redial }));
  await pg.evaluate(() => { window.__fl = 0; new MutationObserver(() => { if (document.getElementById('screen').classList.contains('flicker')) window.__fl++; }).observe(document.getElementById('screen'), { attributes: true, attributeFilter: ['class'] }); });
  await at(pg, 'd4_contact', { flags: { app_lantern: 1 } });
  const lit = await pg.evaluate(() => ({ said: [...document.querySelectorAll('#thread .m.in .who')].filter(w => w.textContent === 'Lantern').length, fl: window.__fl, text: ([...document.querySelectorAll('#thread .m.in')].find(m => /Lantern switched itself on/.test(m.textContent)) || {}).textContent || '' }));
  await pick(pg, 'Switch on the flashlight');
  await pg.waitForFunction(() => !ABY.game.delivering && ABY.game.state.light === 1, null, { timeout: 15000 }); await sleep(300);
  const again = await pg.evaluate(() => [...document.querySelectorAll('#thread .m.in .who')].filter(w => w.textContent === 'Lantern').length);
  await at(pg, 'd4_contact', {});
  const none = await pg.evaluate(() => [...document.querySelectorAll('#thread .m.in .who')].filter(w => w.textContent === 'Lantern').length);
  // the dark hint is not one of the scene's messages: a dark scene still delivers all of its own (the hint used to swallow the first, half the Eye's on d3_table)
  await at(pg, 'd3_table', {});
  const dark = await pg.evaluate(() => { const t = [...document.querySelectorAll('#thread .m')].map(m => m.textContent).join(' '), w = ABY.NODES.d3_table.text; return { hint: /too dark/.test(t), first: t.includes(w.slice(0, 40)), last: t.includes(w.slice(-16)) }; });
  rec('dark-scene-keeps-its-text', dark.hint && dark.first && dark.last, 'arriving at a dark scene without the light: the hint, then every one of the scene\'s own messages (first and last of the Eye\'s on d3_table)');
  // install Redial now (Night Line found opens it): the day she is in carries it, and so does her dawn
  await pg.evaluate(() => ABY.Phone.show('store')); await pg.locator('#stList .sti[data-id="redial"] .get').click();
  await pg.waitForFunction(() => document.getElementById('axName').textContent === 'Redial');
  const mid = await pg.evaluate(() => ({ now: ABY.game.state.flags.app_redial === 1, dawn: ABY.game.cp.flags.app_redial === 1, saved: JSON.parse(localStorage.getItem('kudbee.abyss.v2')).cp.flags.app_redial === 1 }));
  await ctx.close();
  rec('apps-reach-the-night', journey.lantern && !journey.redial && lit.said === 1 && lit.fl >= 1 && /Lantern switched itself on/.test(lit.text) && again === 1 && none === 0 && mid.now && mid.dawn && mid.saved,
    'a new journey starts with Lantern (installed) and not Redial; on the dark contact list Lantern speaks as itself ("' + lit.text.replace(/^Lantern/, '').slice(0, 40) + '…") and the torch stutters; switching the light on does not repeat it; without it, silence; Redial installed mid-journey reaches this day and its dawn');
});
await block('installable', async () => {
  // Abyss is an app on a REAL phone too: a manifest with its icons and store screenshots (all real files of the stated size), the tags an iPhone
  // reads, a service worker that keeps the game so a reload with no network still opens it, and an install card in the phone's own App Store
  // (second visit on, phones only) whose iPhone sheet shows Safari's three taps
  const c0 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const p0 = await c0.newPage(); p0.on('pageerror', e => errs.push('installable ' + e.message));
  await c0.route('https://fonts.*/**', r => r.abort());
  // the pinned three.js from the cached copy whose hash matches the page's integrity (a context route also answers the service worker's own fetch)
  if (THREE_PATH) await c0.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, path: THREE_PATH })); else await c0.route('https://cdnjs.cloudflare.com/**', r => r.abort());
  await p0.addInitScript(`try { localStorage.setItem('kudbee.abyss.v2', '{"guided":true}'); } catch (e) {}`);
  await p0.goto(URL, { waitUntil: 'load' });
  const man = await p0.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]'), m = await (await fetch(link.href)).json(), base = new URL(link.href);
    const size = src => new Promise(r => { const i = new Image(); i.onload = () => r(i.naturalWidth + 'x' + i.naturalHeight); i.onerror = () => r('missing'); i.src = new URL(src, base).href; });
    const icons = await Promise.all(m.icons.map(async i => ({ want: i.sizes, got: await size(i.src), purpose: i.purpose })));
    const shots = await Promise.all((m.screenshots || []).map(async i => ({ want: i.sizes, got: await size(i.src) })));
    const apple = document.querySelector('link[rel="apple-touch-icon"]'), meta = n => (document.querySelector('meta[name="' + n + '"]') || {}).content;
    const launch = await Promise.all([...document.querySelectorAll('link[rel="apple-touch-startup-image"]')].map(async l => { const q = /device-width: (\d+)px\) and \(device-height: (\d+)px\) and \(-webkit-device-pixel-ratio: (\d)/.exec(l.media); return { want: q ? q[1] * q[3] + 'x' + q[2] * q[3] : '?', got: await size(l.getAttribute('href')) }; }));
    return { id: m.id, name: m.name, short: m.short_name, display: m.display, start: m.start_url, icons, shots, launch, apple: apple ? await size(apple.getAttribute('href')) : 'missing',
      capable: meta('apple-mobile-web-app-capable'), bar: meta('apple-mobile-web-app-status-bar-style'), title: meta('apple-mobile-web-app-title') };
  });
  const sized = a => a.every(i => i.want === i.got);
  rec('app-manifest', man.id === '/games/kudbee-abyss/' && man.name === 'Kudbee Abyss' && man.short === 'Abyss' && man.display === 'standalone' && man.start === './index.html' && sized(man.icons) && man.icons.some(i => i.purpose === 'maskable') && man.icons.some(i => i.got === '512x512')
    && man.shots.length >= 3 && sized(man.shots) && man.launch.length >= 8 && sized(man.launch) && man.apple === '180x180' && man.capable === 'yes' && man.bar === 'black-translucent' && man.title === 'Abyss',
    man.name + ' (' + man.short + ', ' + man.display + '): ' + man.icons.map(i => i.got + (i.purpose === 'maskable' ? ' maskable' : '')).join(', ') + ', a ' + man.apple + ' home-screen icon and ' + man.shots.length + ' store screenshots and ' + man.launch.length + ' iPhone launch screens, every one the size it says; full screen from an iPhone home screen');
  // offline: the service worker keeps the game; with no network a reload is served by it and the phone wakes to its lock screen
  const ctl = await p0.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller && navigator.serviceWorker.controller.state === 'activated', null, { timeout: 20000 }).then(() => true, () => false);
  const kept = await p0.evaluate(() => caches.keys().then(ks => caches.open(ks.find(k => k.startsWith('aby-')))).then(c => c.keys()).then(k => k.map(r => r.url)));
  await c0.setOffline(true);
  const res = await p0.reload({ waitUntil: 'load' }).catch(() => null);
  const off = await p0.waitForFunction(() => document.getElementById('boot').classList.contains('gone') && window.ABY && ABY.Phone && ABY.Phone.screen === 'lock', null, { timeout: 20000 }).then(() => true, () => false);
  const live = off && await p0.evaluate(async () => { await document.fonts.ready; return { on: navigator.onLine, font: document.fonts.check('16px "Space Grotesk"'), gl: !document.getElementById('screen').classList.contains('nogl') && !!window.THREE }; });
  const three = kept.some(u => /three\.min\.js/.test(u));
  await p0.screenshot({ path: join(OUT, 'offline-lock.png') });
  await c0.close();
  rec('plays-offline', ctl && kept.length >= 20 && kept.some(u => /space-grotesk/.test(u)) && kept.some(u => /story\.js$/.test(u)) && !!res && res.fromServiceWorker() && off && live.on === false && live.font && (!THREE_PATH || (three && live.gl)),
    'the service worker keeps ' + kept.length + ' files (' + (three ? 'the 3D library too, and offline its integrity still checks: the 3D world is up (' + live.gl + ')' : 'no 3D library: no cached copy here, so offline is 2D') + '); with the network gone a reload is served by it (' + (res && res.fromServiceWorker()) + '), the fonts load and the phone wakes to its lock screen');
  // the install card: an iPhone on its second visit sees it at the top of the App Store; GET opens the three taps; a first visit does not
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  const card = async (visits, w, h) => {
    const c = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: IPHONE, serviceWorkers: 'block' });
    const p = await c.newPage(); p.on('pageerror', e => errs.push('install-card ' + e.message));
    await p.route('https://**', r => r.abort());
    await p.addInitScript(`localStorage.setItem('kudbee.abyss.v2', JSON.stringify({ guided: true, visits: ${visits} }));`);
    await p.goto(URL, { waitUntil: 'load' }); await p.waitForFunction(() => document.getElementById('boot').classList.contains('gone') && window.ABY && ABY.Phone && ABY.Phone.screen === 'lock', null, { timeout: 20000 });
    await p.evaluate(() => ABY.Phone.show('store')); await sleep(500);
    const row = await p.evaluate(() => ({ row: !!document.querySelector('#stList .sti.real'), first: (document.querySelector('#stList .sti') || {}).getAttribute && document.querySelector('#stList .sti').getAttribute('data-id') }));
    let sheet = null;
    if (row.row) {
      await p.click('#stInstall'); await sleep(300);
      sheet = await p.evaluate(() => { const s = document.getElementById('inst'), b = document.getElementById('instOk').getBoundingClientRect(); return { open: !s.hidden, steps: [...s.querySelectorAll('li')].map(l => l.textContent), btn: b.bottom <= innerHeight && b.height >= 40 }; });
      await p.screenshot({ path: join(OUT, 'install-sheet-' + w + 'x' + h + '.png') });
      await p.click('#instOk'); await sleep(200); sheet.closed = await p.evaluate(() => document.getElementById('inst').hidden);
    }
    await p.evaluate(() => ABY.Phone.show('settings')); await sleep(400);
    const set = await p.evaluate(() => ({ row: !document.getElementById('setInstall').hidden, about: document.querySelector('#settings .about').textContent }));
    if (set.row) { await p.click('#setInstall'); await sleep(300); set.sheet = await p.evaluate(() => !document.getElementById('inst').hidden); await p.screenshot({ path: join(OUT, 'settings-about-' + w + 'x' + h + '.png') }); await p.click('#instOk'); await sleep(200); }
    // What's New: the version in About, and the releases in a sheet whose Done stays on screen however long the list
    set.ver = await p.evaluate(() => document.getElementById('setVer').textContent); await p.click('#setNews'); await sleep(300);
    set.news = await p.evaluate(() => { const b = document.getElementById('newsOk').getBoundingClientRect(); return { open: !document.getElementById('news').hidden, rel: document.querySelectorAll('#newsList .nrel').length, first: (document.querySelector('#newsList .nrel h4') || {}).textContent || '', done: b.top >= 0 && b.bottom <= innerHeight && b.height >= 40 }; });
    await p.screenshot({ path: join(OUT, 'whats-new-' + w + 'x' + h + '.png') }); await p.click('#newsOk'); await sleep(200); set.news.closed = await p.evaluate(() => document.getElementById('news').hidden);
    await c.close(); return { row, sheet, set };
  };
  const first = await card(0, 390, 844), second = await card(1, 390, 844), wide = await card(5, 844, 390);
  const ok = s => s && s.open && s.steps.length === 3 && /Share/.test(s.steps[0]) && /Add to Home Screen/.test(s.steps[1]) && s.btn && s.closed;
  const news = s => s.set.news.open && s.set.news.rel >= 5 && s.set.news.done && s.set.news.closed && s.set.ver.startsWith(s.set.news.first.replace(/\d+ \w+ \d{4}$/, '').trim());
  rec('whats-new', news(first) && news(wide), 'Settings shows "' + first.set.ver + '"; What\'s New lists ' + first.set.news.rel + ' releases, newest first ("' + first.set.news.first + '"), and its Done stays on screen upright and on its side');
  rec('install-card', !first.row.row && !first.set.row && second.set.row && second.set.sheet && /sends nothing anywhere/.test(second.set.about) && /Plays offline/.test(second.set.about) && second.row.row && second.row.first === 'abyss' && ok(second.sheet) && wide.row.row && ok(wide.sheet),
    'an iPhone\'s first visit shows no card; from the second, "Kudbee Abyss · YOUR PHONE" tops the App Store and GET opens the three taps (' + (second.sheet ? second.sheet.steps.map(t => t.split(/[ ,.]/).slice(0, 3).join(' ')).join(' / ') : '?') + '), whose button fits on screen upright and on its side, and closes; Settings offers the same, and its About says the game sends nothing anywhere');
});
await block('epilogue', async () => {
  // "A week later": winning the seventh night keeps how she treated the five people (G.epi); the next time the phone is opened a lock-screen note brings
  // five messages in the words each bond earned, read once (epiSeen) and reread from the Gallery; nobody who has not won the seventh night sees it
  const snap = '{ QUEEN: 0, VEY: 4, GUARDIAN: -2, WREN: 2, EYE: -1 }';
  const pre = `if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('kudbee.abyss.v2', JSON.stringify({ guided: true, found: { seventh: 1 }, epi: ${snap} })); }`;   // (only the first load: a reload must see what the page saved)
  ({ ctx, pg } = await open(phoneCtx(PHONES[2]), 'epilogue', { pre })); await wake(pg);
  const lk = await pg.evaluate(() => [...document.querySelectorAll('#lkNotes .note')].map(n => n.textContent));
  const note = lk.some(t => /A week later/.test(t) && /Five messages/.test(t));
  await pg.locator('#lkNotes .note', { hasText: 'A week later' }).click(); await pg.waitForFunction(() => !document.getElementById('epi').hidden);
  const sheet = await pg.evaluate(() => [...document.querySelectorAll('#epiList .nrel')].map(s => s.textContent));
  const right = sheet.length === 5 && /Vey.*kept her word/.test(sheet.find(t => /^Vey/.test(t))) && /Guardian.*asked my name/.test(sheet.find(t => /^Guardian/.test(t))) && /Wren.*not scared/.test(sheet.find(t => /^Wren/.test(t))) && /Queen.*play again/.test(sheet.find(t => /^Queen/.test(t))) && /No Caller ID.*looked away/.test(sheet.find(t => /^No Caller ID/.test(t)));
  await pg.screenshot({ path: join(OUT, 'epilogue-portrait.png') });
  await pg.setViewportSize({ width: 844, height: 390 }); await sleep(300);
  const reach = await pg.evaluate(() => { const b = document.getElementById('epiOk'); b.scrollIntoView({ block: 'end' }); const r = b.getBoundingClientRect(); return r.bottom <= innerHeight + 1 && r.height >= 44; });
  await pg.setViewportSize({ width: 390, height: 844 }); await sleep(200);
  await pg.locator('#epiOk').click();
  const seen = await pg.evaluate(() => JSON.parse(localStorage.getItem('kudbee.abyss.v2')).epiSeen === true && document.getElementById('epi').hidden);
  await pg.reload({ waitUntil: 'load' }); await pg.waitForFunction(() => document.getElementById('boot').classList.contains('gone')); await wake(pg);
  const gone = await pg.evaluate(() => !/A week later/.test(document.getElementById('lkNotes').textContent));
  await pg.evaluate(() => ABY.Phone.show('gallery')); await pg.waitForTimeout(300);
  const btn = await pg.evaluate(() => !document.getElementById('gEpi').hidden);
  await pg.locator('#gEpi').click(); const again = await pg.evaluate(() => document.querySelectorAll('#epiList .nrel').length);
  await ctx.close();
  // a hostile save is cleaned (a bad number is clamped or zeroed, a bad flag is false)
  ({ ctx, pg } = await open({}, 'epilogue-win', { pre: `localStorage.setItem('kudbee.abyss.v2', JSON.stringify({ guided: true, epi: { QUEEN: 'x', VEY: 99 }, epiSeen: 'yes' }));` })); await wake(pg);
  const clean = await pg.evaluate(() => ({ vey: ABY.game.epi && ABY.game.epi.VEY, queen: ABY.game.epi && ABY.game.epi.QUEEN, seen: ABY.game.epiSeen }));
  await ctx.close();
  rec('epilogue', note && right && reach && seen && gone && btn && again === 5 && clean.vey === 4 && clean.queen === 0 && clean.seen === false,
    'the lock screen offers "A week later" once; five messages in each bond\'s tone (Vey warm, Guardian cold...); read once, then only from the Gallery (' + again + ' messages); a hostile save is cleaned (Vey ' + clean.vey + ', Queen ' + clean.queen + ')');
});
await block('feel', async () => {
  // The phone is a tactile thing: every control a thumb can reach is a proper target (44px, bar the home swipe strip) on a portrait and a landscape phone,
  // every tap on the home screen, lock screen and every app answers with a sound or a buzz (nothing silent), and the Sound level setting really moves
  // the master gain, survives a reload and is dead while sound is off
  const SCREENS = ['lock', 'home', 'notes', 'pulse', 'store', 'settings', 'gallery', 'flute'];
  const audit = {};
  for (const ph of [PHONES[0], PHONES[2]]) {
    const { ctx, pg } = await open(phoneCtx(ph), 'feel-' + ph.n);
    await wake(pg);
    await pg.evaluate(() => { window.__feel = 0; ['sfx', 'buzz'].forEach(k => { const o = ABY.Audio[k]; ABY.Audio[k] = function (n) { if (!(k === 'sfx' && n === 'tick')) window.__feel++; return o.apply(this, arguments); }; }); });
    const small = [], silent = []; let seen = 0;
    for (const sc of SCREENS) {
      await pg.evaluate(n => ABY.Phone.show(n), sc); await pg.waitForTimeout(350);
      const list = await pg.evaluate(() => {
        const dev = document.getElementById('device').getBoundingClientRect(), id = ABY.Phone.screen, out = []; let i = 0;
        document.querySelectorAll('#' + id + ' button, #' + id + ' [role=button], #' + id + ' .app, #homebar').forEach(e => {
          const r = e.getBoundingClientRect(), cs = getComputedStyle(e); if (!r.width || !r.height || cs.visibility === 'hidden' || cs.display === 'none' || r.bottom > dev.bottom || r.top < dev.top || e.disabled) return;
          e.setAttribute('data-feel', i); out.push({ i, name: (e.id || e.className || e.tagName) + '', w: Math.round(r.width), h: Math.round(r.height) }); i++;
        });
        return out;
      });
      for (const e of list) {
        seen++;
        if (e.name !== 'homebar' && (e.w < 44 || e.h < 44)) small.push(ph.n + ' ' + sc + ' ' + e.name + ' ' + e.w + 'x' + e.h);
        await pg.evaluate(n => ABY.Phone.show(n), sc); await pg.waitForTimeout(120);
        const el = await pg.$('[data-feel="' + e.i + '"]'); if (!el) continue;
        await pg.evaluate(() => { window.__feel = 0; });
        try { await el.tap({ timeout: 800 }); } catch (x) { continue; }
        await pg.waitForTimeout(120);
        if (e.name !== 'homebar' && !(await pg.evaluate(() => window.__feel))) silent.push(ph.n + ' ' + sc + ' ' + e.name);
      }
    }
    audit[ph.n] = { seen, small, silent }; await ctx.close();
  }
  // the Sound level setting
  const { ctx, pg } = await open(phoneCtx(PHONES[0]), 'feel-sound'); await wake(pg);
  await pg.evaluate(() => { ABY.Audio.init(); ABY.Phone.show('settings'); }); await pg.waitForTimeout(300);
  const gain = () => pg.evaluate(() => Math.round(ABY.Audio.vol * 100));
  const row = await pg.evaluate(() => document.getElementById('sndLvS').textContent);
  const names = [row]; const vols = [await gain()];
  for (let i = 0; i < 3; i++) { await pg.locator('#setSndLv').click(); names.push(await pg.evaluate(() => document.getElementById('sndLvS').textContent)); vols.push(await gain()); }
  await pg.locator('#setSndLv').click(); await pg.waitForTimeout(100);   // -> Loud
  const saved = await pg.evaluate(() => JSON.parse(localStorage.getItem('kudbee.abyss.v2')).sndLv);
  await pg.reload({ waitUntil: 'load' }); await pg.waitForFunction(() => document.getElementById('boot').classList.contains('gone')); await pg.evaluate(() => ABY.Phone.show('settings'));
  const after = await pg.evaluate(() => ({ label: document.getElementById('sndLvS').textContent, vol: Math.round(ABY.Audio.vol * 100) }));
  await pg.locator('#setSnd').click();
  const off = await pg.evaluate(() => document.getElementById('setSndLv').disabled);
  await ctx.close();
  const a = audit[PHONES[0].n], b = audit[PHONES[2].n];
  rec('touch-targets-and-feel', !a.small.length && !b.small.length && !a.silent.length && !b.silent.length && a.seen > 20 && b.seen > 20 && names.join() === 'Normal,Loud,Quiet,Normal' && vols.join() === '100,130,50,100' && saved === 2 && after.label === 'Loud' && after.vol === 130 && off,
    'every control on ' + SCREENS.length + ' screens is a 44px target and answers a tap (landscape ' + a.seen + ' checked, portrait ' + b.seen + ')' + (a.small.concat(b.small).length ? '; SMALL ' + a.small.concat(b.small).slice(0, 4).join(' | ') : '') + (a.silent.concat(b.silent).length ? '; SILENT ' + a.silent.concat(b.silent).slice(0, 4).join(' | ') : '') + '; sound level ' + names.join('>') + ' (' + vols.join('/') + '), saved ' + saved + ', after reload ' + after.label + ', disabled while muted: ' + off);
});
await block('graphics', async () => {
  // the frame-time governor: a slow phone steps the 3D down a tier (and keeps it), a fast one never does, a stall is ignored; the Graphics setting is Auto / Full / Lite and survives a reload
  const { ctx, pg } = await open(phoneCtx(PHONES[0]), 'graphics'); await wake(pg);
  const gov = await pg.evaluate(() => {
    const P = ABY.Perf, out = {}; const run = (ms, n) => { let last = -1; for (let i = 0; i < n; i++) { const r = P.step(ms); if (r >= 0) last = r; } return last; };
    P.reset(0, true); out.fast = run(16.7, 600) === -1 && P.tier === 0;
    P.reset(0, true); out.stall = run(900, 600) === -1 && P.tier === 0;
    P.reset(0, true); out.slow1 = run(40, 400) >= 1 && P.tier >= 1;
    P.reset(0, true); run(40, 3000); out.floor = P.tier === 2;
    P.reset(0, false); out.fixed = run(40, 600) === -1 && P.tier === 0;
    P.reset(0, true); run(16.7, 100); out.loadSkipped = run(40, 30) === -1;
    return out;
  });
  await pg.evaluate(() => ABY.Phone.show('settings')); await pg.waitForTimeout(300);
  const lab = () => pg.evaluate(() => ({ t: document.getElementById('gfxS').textContent, tier: ABY.Perf.tier, auto: ABY.Perf.auto }));
  const seq = [await lab()]; for (let i = 0; i < 3; i++) { await pg.locator('#setGfx').click(); seq.push(await lab()); }
  await pg.locator('#setGfx').click(); await pg.locator('#setGfx').click(); await pg.waitForTimeout(100);    // -> Lite
  const saved = await pg.evaluate(() => JSON.parse(localStorage.getItem('kudbee.abyss.v2')).gfx);
  await pg.reload({ waitUntil: 'load' }); await pg.waitForFunction(() => document.getElementById('boot').classList.contains('gone')); await pg.evaluate(() => ABY.Phone.show('settings'));
  const after = await lab();
  await ctx.close();
  const names = seq.map(x => x.t).join();
  rec('graphics-tiers', Object.values(gov).every(Boolean) && names === 'Auto,Full,Lite,Auto' && seq[1].tier === 0 && !seq[1].auto && seq[2].tier === 1 && seq[3].auto && saved === 2 && after.t === 'Lite' && after.tier === 1 && !after.auto,
    'Auto steps a slow phone down and stays down, ignores stalls and load; Full/Lite are fixed; ' + names + ' saved ' + saved + ' -> ' + after.t + (Object.values(gov).every(Boolean) ? '' : '; GOV ' + JSON.stringify(gov)));
});
await block('store-shots', async () => {
  // the store-style screenshot set (tools/store-shots.mjs): six real JPEGs at the App Store's 6.9" size, 1320x2868, each a screen of the phone under a caption;
  // the game never loads them, so this is the only thing that notices one went missing or was re-rendered at the wrong size
  const names = ['01-lock', '02-thread', '03-notes', '04-store', '05-gallery', '06-epilogue'], bad = [];
  for (const n of names) {
    const p = join(HERE, '..', 'assets', 'store', n + '.jpg'); let b; try { b = readFileSync(p); } catch (e) { bad.push(n + ' missing'); continue; }
    let i = 2, w = 0, h = 0; while (i < b.length) { if (b[i] !== 0xFF) { i++; continue; } const m = b[i + 1]; if (m >= 0xC0 && m <= 0xC3) { h = b.readUInt16BE(i + 5); w = b.readUInt16BE(i + 7); break; } i += 2 + b.readUInt16BE(i + 2); }
    if (b[0] !== 0xFF || b[1] !== 0xD8 || w !== 1320 || h !== 2868 || b.length < 100000 || b.length > 3e6) bad.push(n + ' ' + w + 'x' + h + ' ' + b.length + 'B');
  }
  rec('store-shots', !bad.length, names.length + ' captioned screenshots, each a JPEG of 1320x2868 and under 3 MB' + (bad.length ? '; BAD ' + bad.join(' | ') : ''));
});
await block('app-store-depth', async () => {
  // listings opened by one ending or deduction (a NEW tag and a badge on the icon), pages whose reviews know what she has done, and old saves stay quiet
  const pre = `localStorage.setItem('kudbee.abyss.v2', JSON.stringify({ guided: true, found: { drowned: 1, names: 1 }, deduced: { two_warnings: 1 }, stSeen: { lantern: 1 } }));`;
  ({ ctx, pg } = await open({}, 'store-depth', { pre })); await wake(pg);
  const before = await pg.evaluate(() => { const b = document.querySelector('#icStore .badge'); return b ? b.textContent : ''; });
  await pg.evaluate(() => ABY.Phone.show('store'));
  await pg.waitForFunction(() => document.querySelectorAll('#stList .sti').length === ABY.STORE.length);
  const list = await pg.evaluate(() => {
    const row = id => document.querySelector('#stList .sti[data-id="' + id + '"]');
    return { badge: !!document.querySelector('#icStore .badge'), tide: !row('tide').classList.contains('lk') && !!row('tide').querySelector('.new'), pin: !row('pin').classList.contains('lk'),
      smile: row('smile').classList.contains('lk') && /^“.+”$/.test(row('smile').querySelector('small').textContent), ledger: row('ledger').classList.contains('lk') && /Find 3 endings/.test(row('ledger').querySelector('small').textContent),
      lanternNew: !!row('lantern').querySelector('.new'), seen: JSON.parse(localStorage.getItem('kudbee.abyss.v2')).stSeen };
  });
  await pg.locator('#stList .sti[data-id="tide"] .get').click();
  await pg.waitForFunction(() => document.getElementById('appx').classList.contains('on') && document.getElementById('axName').textContent === 'Tide Tables');
  const tide = await pg.evaluate(() => ({ rv: document.querySelectorAll('#axBody .rv').length, k: document.querySelectorAll('#axBody .rv.k').length, sealed: !!document.querySelector('#axBody .sealed'), rate: document.querySelector('#axBody .rate').textContent }));
  await pg.click('#axBack'); await pg.waitForFunction(() => document.getElementById('store').classList.contains('on'));
  await pg.locator('#stList .sti[data-id="lantern"] .get').click();
  await pg.waitForFunction(() => document.getElementById('axName').textContent === 'Lantern');
  const lant = await pg.evaluate(() => ({ rv: document.querySelectorAll('#axBody .rv').length, k: document.querySelectorAll('#axBody .rv.k').length, sealed: (document.querySelector('#axBody .sealed') || {}).textContent || '' }));
  await ctx.close();
  // a save from before the store kept track of what was seen: nothing already open is announced
  ({ ctx, pg } = await open({}, 'store-old', { pre: `localStorage.setItem('kudbee.abyss.v2', JSON.stringify({ guided: true, found: { drowned: 1, names: 1, song: 1 } }));` })); await wake(pg);
  const old = await pg.evaluate(() => !document.querySelector('#icStore .badge'));
  await ctx.close();
  rec('store-listings-know-you', before === '4' && !list.badge && list.tide && list.pin && list.smile && list.ledger && !list.lanternNew && list.seen.tide === 1 && list.seen.pin === 1
    && tide.rv === 3 && tide.k === 1 && !tide.sealed && /3 reviews/.test(tide.rate) && lant.rv === 2 && lant.k === 0 && /^2 more reviews/.test(lant.sealed) && old,
    'badge ' + before + ' for 4 new listings (Tide Tables by a fall, Pinboard by a deduction), cleared once seen; a locked one shows its riddle; Tide Tables shows ' + tide.rv + ' reviews (' + tide.k + ' because she was there), Lantern ' + lant.rv + ' and "' + lant.sealed.slice(0, 22) + '…"; an old save announces nothing');
});
const chips = (pg) => pg.evaluate(() => [...document.querySelectorAll('#replies .chip')].map(c => c.textContent));
const tapChip = async (pg, text) => { await pg.waitForSelector('#replies.on .chip', { timeout: 10000 }); await pg.locator('#replies .chip', { hasText: text }).first().click(); await sleep(300); };
await block('app-clues', async () => {
  // an installed app can leave a clue: Mirror Cast speaks on Day Six and files what the Queen keeps on her screen; pinned to her bargain it opens the
  // deduction a journey without the flashback would miss, and its hidden reply. Without the app the same scenes file nothing new.
  const pre = `localStorage.setItem('kudbee.abyss.v2', JSON.stringify({ guided: true, found: { dawn: 1, cradle: 1, mirror: 1 }, apps: { cast: 1 } }));`;
  ({ ctx, pg } = await open(phoneCtx({ w: 844, h: 390 }), 'app-clues', { pre })); await wake(pg); await openMessages(pg); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
  const settle = async (node) => { for (let i = 0; i < 40 && await pg.evaluate((n) => ABY.game.state.node !== n || ABY.game.delivering, node); i++) { await pg.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))); await sleep(150); } await sleep(250); };
  await at(pg, 'd6_wake', { mem: 3, flags: { app_cast: 1 } }); await tapChip(pg, 'Ask the Queen whose number it is'); await settle('d6_queen');
  const cast = await pg.evaluate(() => ({ notes: ABY.game.state.notes.slice(), who: [...document.querySelectorAll('#thread .m.in .who')].map(w => w.textContent), banner: document.getElementById('banner').textContent }));
  await tapChip(pg, 'Ask what she gave for it'); await settle('d6_story');
  const before = await chips(pg);
  await pg.evaluate(() => ABY.Phone.show('notes')); await pg.waitForSelector('#noteList .nt.pin[data-note="a_cast"]');
  await pg.screenshot({ path: join(OUT, 'app-clue-notes.png') });
  await pg.click('#noteList .nt.pin[data-note="a_cast"]'); await pg.click('#noteList .nt.pin[data-note="bargain"]'); await sleep(300);
  const pinned = await pg.evaluate(() => ({ flag: ABY.game.state.flags.link_what_she_gave === 1, banner: document.getElementById('banner').textContent, saved: JSON.parse(localStorage.getItem('kudbee.abyss.v2')).deduced.what_she_gave === 1,
    cred: (document.querySelector('#noteList .nt.ded[data-ded="what_she_gave"] .cred') || {}).textContent || '', msg: document.getElementById('nMsg').textContent, helped: JSON.parse(localStorage.getItem('kudbee.abyss.v2')).helped }));
  await pg.screenshot({ path: join(OUT, 'app-credit-notes.png') });
  await pg.evaluate(() => ABY.Phone.show('msg')); await sleep(400); const after = await chips(pg);
  // the credit: Mirror Cast's page now has a review only for someone it helped, and the ending card of this journey names it
  await pg.evaluate(() => ABY.Phone.show('store')); await pg.locator('#stList .sti[data-id="cast"] .get').click(); await pg.waitForFunction(() => document.getElementById('axName').textContent === 'Mirror Cast');
  const review = await pg.evaluate(() => [...document.querySelectorAll('#axBody .rv')].map(r => r.textContent).join(' | ')); await pg.click('#axBack');
  await pg.evaluate(() => ABY.Phone.show('msg')); await at(pg, 'end_passed', { mem: 3, flags: { link_what_she_gave: 1 }, notes: ['a_cast', 'bargain'] }); await memoryShown(pg);
  const card = await pg.evaluate(() => ({ shown: !document.getElementById('eCredit').hidden, text: document.getElementById('eCredit').textContent }));
  await pg.screenshot({ path: join(OUT, 'app-credit-card.png') });
  await at(pg, 'd6_wake', { mem: 3, flags: {} }); await tapChip(pg, 'Ask the Queen whose number it is'); await settle('d6_queen');
  const bare = await pg.evaluate(() => ({ notes: ABY.game.state.notes.slice(), cast: [...document.querySelectorAll('#thread .m.in .who')].some(w => w.textContent === 'Mirror Cast') }));
  await ctx.close();
  const reply = c => /know who she locked away/.test(c);
  rec('apps-leave-clues', cast.notes.includes('a_cast') && cast.who.includes('Mirror Cast') && /New clue: Mirror Cast/.test(cast.banner) && !before.some(reply) && pinned.flag && /Deduction: Who she locked away/.test(pinned.banner) && pinned.saved && after.some(reply) && !bare.notes.includes('a_cast') && !bare.cast,
    'with Mirror Cast installed Day Six files "' + (cast.notes.includes('a_cast') ? 'Mirror Cast: what the Queen keeps on her screen' : '?') + '" (banner); pinned to her bargain it deduces "Who she locked away" and adds the reply "' + (after.find(reply) || '?').slice(0, 44) + '…"; without the app, no clue and no voice');
  rec('apps-get-the-credit', /Mirror Cast showed you this/.test(pinned.cred) && /Mirror Cast saw it first/.test(pinned.msg) && pinned.helped && pinned.helped.what_she_gave === 'cast' && /It showed you my screen/.test(review) && card.shown && /Mirror Cast helped you see it: Who she locked away/.test(card.text),
    'the deduction in Notes says "' + pinned.cred + '" and the save remembers it; Mirror Cast\'s page opens a review only for someone it helped; the ending card says "' + card.text + '"');
});
await block('horror', async () => {
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
  rec('flashlight-costs-battery', t1.on && t1.light === 1 && t1.torch === 1 && t1.bat === ABYS.BAT0 - 4 && t2.bat === t1.bat - 1 - ABYS.TORCH && !t3.on && t3.bat === t2.bat - ABYS.TORCH_TOGGLE, 'torch on (' + t1.bat + '%), the next choice cost ' + (t1.bat - t2.bat) + ' (1 + ' + ABYS.TORCH + '), switching it off cost ' + (t2.bat - t3.bat));
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
});
await block('forced-scenes', async () => { // the phone dies; her mind comes apart
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
});
await block('new-endings', async () => { // the other new endings, each from the scene that decides it
  const { ctx, pg } = await open({}, 'newends'); await wake(pg); await openMessages(pg);
  const run = async (id, patch, label, want, tag) => { await at(pg, id, patch); await tapChip(pg, label); const m = await memoryShown(pg); rec('ending-' + tag, m.name === want && m.kick === 'New memory saved', '"' + m.name + '" (' + m.kick + ')'); await pg.click('#memAct'); await sleep(700); };
  await run('eye_top', { dread: 2, choices: 12 }, 'Answer: remember me', 'The Eye Opens', 'eye');
  await run('vault_choice', { flags: { truth: 1 }, choices: 12 }, 'Take his place', 'The Other Queen', 'mirror');
  await run('vault_choice', { choices: 12 }, 'Lock the door again', 'The Hollow Queen', 'seal');
  await run('reconcile', { flags: { vey_trusted: 1 }, dread: 3, trust: 2, choices: 12 }, 'Open the gate', 'Vey’s Smile', 'betrayal');
  const left = await pg.evaluate(() => Object.keys(ABY.game.found).length);
  rec('gallery-fills', left === 5 || left >= 4, left + ' endings saved in this run (new ones, each a memory in the Gallery)');
  await ctx.close();
});
await block('day-two', async () => { // Day Two: some endings carry on into act two; its true ending only opens for someone who has found others
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
});
await block('day-four', async () => { // Day Four: a Day Three ending carries on (the button names the day), the Drowned Choir is a rite, and the book only closes for a veteran
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
});
await block('day-five', async () => { // Day Five: a dark Day Four ending carries on as Wren's caller; the warning only works for a veteran who told the truth and won the wake-up
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
  rec('day-five-wake-and-warning', w.node === 'd5_rite_win' && w.flag === 1 && c1.length === 5 && c1.some(c => /Stay on the line with Wren/.test(c)) && e.name === 'The Warning' && fin, 'the wake-up is won (' + w.node + '), dawn shows ' + c1.length + ' choices, "' + e.name + '" is final'); await pg.screenshot({ path: join(OUT, 'day5-warned.png') });
  await pg.click('#memAct'); await sleep(500);
  await at(pg, 'd5_dawn', { mem: 2, flags: { rite_wake: 1, told_truth: 1 } }); await pg.waitForSelector('#replies.on .chip', { timeout: 10000 }); const c0 = await chips(pg);
  rec('day-five-true-ending-gated', !c0.some(c => /first number/.test(c)) && c0.length === 4 && c0.some(c => /Stay on the line with Wren/.test(c)), 'with only 2 endings found the warning will not work: ' + c0.join(' / '));
  await ctx.close();
});
await block('falls-and-wakes', async () => { // falls and checkpoints: 3:07 Again is a fall, not a way on. It wakes her at the last dawn (one wake fewer, a little more afraid); with no wakes left, only a new journey
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
});
await block('scars', async () => { // scars: the fall she just suffered wakes with her (a way past it, and a note in her own handwriting); a new journey carries every scar, and the glass shows them
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
  const j = await c2.pg.evaluate(() => ({ flags: Object.keys(ABY.game.state.flags).filter(k => !/^echo_/.test(k)).sort().join(), notes: ABY.game.state.notes.length, glass: document.getElementById('screen').getAttribute('data-scars'), banner: document.getElementById('banner').textContent, cracks: getComputedStyle(document.querySelector('#cracks .c2')).display }));
  await c2.pg.screenshot({ path: join(OUT, 'scars-new-journey.png') });
  rec('scars-carry-into-new-journeys', j.flags === 'scar_drowned,scar_hollow,scar_loop' && j.notes === 3 && j.glass === '2' && j.cracks !== 'none' && /3 notes/.test(j.banner),
    'three falls in the Gallery: the new journey starts with ' + j.flags + ', ' + j.notes + ' notes ("' + j.banner.trim().slice(0, 60) + '"), and the glass at crack level ' + j.glass);
  await c2.ctx.close();
});
await block('evidence-board', async () => { // the evidence board: in Notes, tap two clues to pin them. A wrong pair costs battery and dread; the right pair files a deduction (kept over nights)
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
  const good = await pg.evaluate(() => { const d = JSON.parse(localStorage.getItem('kudbee.abyss.v2')); return { flag: ABY.game.state.flags.link_two_warnings, bat: ABY.game.state.bat, ded: [...document.querySelectorAll('#noteList .ded h3')].map(h => h.textContent), sub: document.getElementById('nSub').textContent, deduced: d.deduced && d.deduced.two_warnings, run: d.run && d.run.flags.link_two_warnings, store: (document.querySelector('#icStore .badge') || {}).textContent || '', bn: document.getElementById('banner').textContent }; });
  await pg.screenshot({ path: join(OUT, 'evidence-board.png') });
  rec('evidence-board-pins', s0.h >= 44 && bad.bat === s0.bat - 2 && bad.dread === s0.dread + 1 && /don’t fit/.test(bad.msg) && bad.ded === 0 && sel === 'future_call:true'
    && good.flag === 1 && good.bat === bad.bat && good.ded.length === 1 && /Two warnings/.test(good.ded[0]) && /1 deduction/.test(good.sub) && good.deduced === 1 && good.run === 1 && good.store === '1' && /Deduction/.test(good.bn),
    'clue cards are ' + Math.round(s0.h) + 'px tall; a wrong pair costs 2% and 1 dread ("' + bad.msg.slice(0, 40) + '..."); the right pair files "' + good.ded[0] + '", saved for this night and every night, and opens a listing in the App Store (badge ' + good.store + ')');
  await pg.waitForFunction(() => /New listing: Pinboard/.test(document.getElementById('banner').textContent), null, { timeout: 8000 }).then(() => rec('store-banner-waits', true, 'the deduction\'s banner shows first; then "' + 'New listing: Pinboard' + '"'), () => rec('store-banner-waits', false, 'no App Store banner after the deduction'));
  await pg.evaluate(() => ABY.Phone.show('msg')); await sleep(400); const after = await chips(pg);
  await pick(pg, 'Two warnings'); await pick(pg, 'nearly');
  await pg.waitForFunction(() => ABY.game.state.node === 'd2_door' && !ABY.game.delivering, null, { timeout: 15000 }).catch(() => {}); await sleep(300);
  const back = await pg.evaluate(() => ({ node: ABY.game.state.node, trust: ABY.game.state.trust, chips: [...document.querySelectorAll('#replies .chip')].map(c => c.textContent), thread: document.getElementById('thread').textContent }));
  rec('deduction-opens-a-choice', !before.some(c => /Two warnings/.test(c)) && after.some(c => /Two warnings/.test(c)) && back.node === 'd2_door' && back.trust === 1 && /is it morning yet/.test(back.thread) && !back.chips.some(c => /Two warnings/.test(c)),
    'before the pin: ' + before.length + ' choices; after it, "' + after.filter(c => /Two warnings/.test(c))[0] + '" -> the voice behind the door -> back at the door (trust ' + back.trust + '), and it is not offered twice');
  await ctx.close();
});
await block('felt-replies-and-calls', async () => { // a reply is felt (a ring of light from the thumb, a sound; a frightening one lands dark), and a call that will not take no: declined, it rings
  // again louder, and the third time it has answered itself
  const { ctx, pg } = await open(phoneCtx({ w: 844, h: 390 }), 'calls'); await wake(pg); await openMessages(pg); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
  await pg.evaluate(() => { window.__sfx = []; const f = ABY.Audio.sfx; ABY.Audio.sfx = function (n) { window.__sfx.push(n); return f.apply(this, arguments); }; });
  // record the flash and the rings as they happen (they last 360-800ms, so a look after the tap can miss them on a busy machine)
  await pg.evaluate(() => { const sc = document.getElementById('screen'); window.__felt = { cls: [], rings: [] }; new MutationObserver(ms => ms.forEach(m => { if (m.type === 'attributes') window.__felt.cls.push(sc.className); m.addedNodes.forEach(n => { if (n.classList && n.classList.contains('ripple')) window.__felt.rings.push(n.className); }); })).observe(sc, { attributes: true, attributeFilter: ['class'], childList: true }); });
  const felt = () => pg.evaluate(() => { const f = window.__felt, o = { r: f.rings.slice(), cls: f.cls.join(' '), sfx: window.__sfx.slice() }; f.cls.length = 0; f.rings.length = 0; return o; });
  await at(pg, 'd2_wake', {}); await felt(); await tapChip(pg, 'Message the Queen');
  const p0 = await felt(), plain = { r: p0.r.filter(c => !/dark/.test(c)).length, cls: p0.cls, sfx: p0.sfx };
  await at(pg, 'd2_photo', {}); await pg.evaluate(() => { window.__sfx = []; }); await felt(); await tapChip(pg, 'Put the phone down');
  const d0 = await felt(), dark = { r: d0.r.filter(c => /dark/.test(c)).length, cls: d0.cls, sfx: d0.sfx };
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
});
await block('overnight', async () => { // overnight messages: a day that carries on opens with what the people she met said while she slept, for the flags she earned, each from its own
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
  rec('overnight-remembers-the-way-in', /You came up through the water this time/.test(bath) && /You came the first way/.test(first) && !/water this time/.test(first), 'a journey that began in the bath hears about it on Day Two; the first journey hears about the haze instead');
  await at(pg, 'd2_wake', { mem: 3, flags: { echo_dawn: 1, echo_song: 1 } }); const echoed = await pg.evaluate(() => document.getElementById('thread').textContent);
  rec('echoes-remembered', /You opened the gate once/.test(echoed) && /you sang it back to me/.test(echoed) && !/You opened the gate once|you sang it back/.test(first), 'someone who found The Gate Opens and The Song Remembered hears the Queen and the Eye remember them on Day Two; a player who found neither hears nothing');
  await at(pg, 'd4_shore', { mem: 3, flags: { vey_known: 1, vey_trusted: 1, refused_next: 1 } }); await pg.evaluate(() => ABY.Phone.show('pulse')); await sleep(300);
  const bonds = await pg.evaluate(() => [...document.querySelectorAll('#ringsL .bond')].map(r => r.textContent)); await pg.evaluate(() => ABY.Phone.show('msg')); await sleep(300);
  await at(pg, 'd6_door', { mem: 3, flags: { marked: 1, asked_eye: 1, named_eye: 1 } }); const kind = await chips(pg);
  await at(pg, 'd6_door', { mem: 3, flags: { marked: 1 } }); const few = await chips(pg);
  rec('bonds-show-and-open-choices', bonds.length === 2 && /Vey.*Warm toward you.*\+2/.test(bonds.join(' ')) && /Eye.*Cold toward you.*-1/.test(bonds.join(' ')) && kind.some(c => /Ask the Eye to look at her/.test(c)) && !few.some(c => /Ask the Eye to look at her/.test(c)),
    'Pulse lists only the people she has touched (Vey warm +2, the Eye cold -1); a devoted Eye can be asked to look at Sorrel, a stranger cannot');
  await ctx.close();
});
await block('clock', async () => { // the Clock: from a day's scene she can turn the clock back (a flashback) or wind it forward (a flash-forward). The glass tints, the clock reads another hour,
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
});
await block('ending-card-offer', async () => { // leaving the ending card must not lose what the ending offered: the next day, or a wake at dawn. It survives swiping home, tapping the badge banner, closing the
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
});
await block('openings-deep', async () => { // the beginnings, deeper: a journey that began in the lift plays three scenes of its own (the panel, a drawing taped where it should not be, the wall where "W. WAS HERE"),
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
  rec('long-choice-lists-scroll', sc0.n === 8 && sc0.over && sc0.more && sc0.box && !sc1.more && sc1.reach && /first came in/.test(sc1.last), 'with ' + sc0.n + ' choices on an 844x390 phone the list scrolls in its own box and fades while more are below (' + sc0.more + '); scrolled to the end the last one, "' + sc1.last + '", is fully reachable and the fade is gone');
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
    && bath.some(c => /how you first came in \(the bath\)/.test(c)) && !bath.some(c => /the lift/.test(c)) && first.some(c => /how you first came in \(the haze\)/.test(c)) && !first.some(c => /the lift|the bath/.test(c))
    && truth.some(c => /how you came in, the very first night/.test(c)) && !plain.some(c => /how you came in, the very first night/.test(c)) && d6.some(c => /the lift, once more/.test(c)) && eye.some(c => /door you came through/.test(c)),
    'Day Four offers the lift flashback only to the journey that began there ("' + (d4.filter(c => /first came in/.test(c))[0] || '') + '"; a bath journey is offered the bath, the first journey only its own, the haze), it is a warm flashback that returns and is seen once; Wren reads it on Day Five, the lift returns on Day Six, and the Eye on Day Seven reads the door');
  await ctx.close();
});
await block('days-six-seven', async () => { // Days Six and Seven: Day Five carries on, Day Six finds the first page (and Sorrel), and the book closes on the seventh morning only for a veteran
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
});
await block('accusation', async () => { // the accusation (Day Seven): lay out the notes and name who kept it 3:07. Three wrong names are always there; the Queen only with "Who she locked
  // away" pinned; Vey's small key turns her confession into The Low Door. A wrong name is a fall
  const { ctx, pg } = await open({}, 'accuse'); await wake(pg); await openMessages(pg); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
  await at(pg, 'd7_gather', { mem: 2, heart: 2, dread: 1 }); const g = await chips(pg); await tapChip(pg, 'Lay out your notes'); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
  const a0 = await chips(pg), n0 = await pg.evaluate(() => ABY.game.state.node);
  await at(pg, 'd7_accuse', { mem: 2, heart: 2, dread: 1, flags: { link_what_she_gave: 1 } }); const a1 = await chips(pg); await tapChip(pg, 'locked her own child'); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
  const c1 = await chips(pg), conf = await pg.evaluate(() => ({ node: ABY.game.state.node, name: document.getElementById('mName').textContent, note: ABY.game.state.notes.includes('confession') }));
  await at(pg, 'd7_confess', { mem: 2, heart: 2, dread: 1, flags: { link_what_she_gave: 1, vey3_hand: 1 } }); const c2 = await chips(pg);
  await tapChip(pg, 'Give her what Vey'); const e = await memoryShown(pg); const fin = await pg.evaluate(() => document.getElementById('memNext').hidden); await pg.screenshot({ path: join(OUT, 'day7-low-door.png') });
  await pg.click('#memAct'); await sleep(500);
  await at(pg, 'd7_accuse', { mem: 2, heart: 2, dread: 1 }); await tapChip(pg, 'The Eye'); await tapChip(pg, 'Wait'); const f = await memoryShown(pg);
  rec('accusation-low-door', g.some(c => /Lay out your notes/.test(c)) && n0 === 'd7_accuse' && a0.length === 4 && !a0.some(c => /locked her own child/.test(c)) && a1.length === 5 && a1.some(c => /locked her own child/.test(c))
    && conf.node === 'd7_confess' && conf.note && c1.length === 1 && c2.length === 2 && e.name === 'The Low Door' && fin && f.name === 'Day One, Again',
    'the notes open the accusation (' + a0.length + ' suspects without the deduction, ' + a1.length + ' with it); the Queen confesses (' + conf.name + '), and with the key: "' + e.name + '" ends the week; naming the Eye: "' + f.name + '"');
  await ctx.close();
});
await block('ten-openings', async () => { // ten openings: a returning player's new journey is scrambled into another beginning (never the one they just had), on a phone
  const pre = `try { localStorage.setItem('kudbee.abyss.v2', JSON.stringify({ guided: true, found: { dawn: 1, song: 1, echo: 1 }, lastOpen: 'awakening' })); } catch (e) {}`;
  const { ctx, pg } = await open(Object.assign({ scramble: true }, phoneCtx({ w: 844, h: 390 })), 'scramble', { pre }); await wake(pg); await openMessages(pg); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
  const o = await pg.evaluate(() => ({ node: ABY.game.state.node, chips: [...document.querySelectorAll('#replies .chip')].map(c => c.textContent), want: ABY.NODES[ABY.game.state.node].choices.map(c => c.label), last: JSON.parse(localStorage.getItem('kudbee.abyss.v2')).lastOpen }));
  await pg.screenshot({ path: join(OUT, 'opening-scrambled.png') });
  await tapChip(pg, o.chips[0]); const n1 = await pg.evaluate(() => ABY.game.state.node);
  rec('opening-scrambled', ABYS.OPENINGS.includes(o.node) && o.node !== 'awakening' && o.chips.join('|') === o.want.join('|') && o.last === o.node && n1 !== o.node,
    'a returning player opens on ' + o.node + ' (not the last one, awakening): ' + o.chips.join(' / ') + ' -> ' + n1);
  await ctx.close();
});
await block('hard-rites', async () => { // the two hard rites: chords. A perfect player slams every chord and wins; half a chord is not a slam; a rite that is given up still goes on
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
});
await block('hard-rite-box', async () => { // the third hard rite: Sorrel's music box. A perfect player slams every chord and wins; it is offered once; the walk home is the same scene
  const { ctx, pg } = await open({}, 'musicbox'); await wake(pg); await openMessages(pg); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
  await at(pg, 'd6_sorrel', { mem: 9, dread: 3, flags: { rite_wake: 1, riff_done: 1 } }); await pg.waitForSelector('#replies.on .chip', { timeout: 10000 });
  const before = await chips(pg); await tapChip(pg, 'music-box waltz'); await pick(pg, 'Raise the flute'); await pg.waitForFunction(() => ABY.Song.active, null, { timeout: 5000 }); await pg.evaluate(() => { ABY.Song.bot = true; }); await sleep(6500); await pg.screenshot({ path: join(OUT, 'day6-box-mid.png') }); await pg.waitForFunction(() => !ABY.Song.active, null, { timeout: 60000 }); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
  const b = await pg.evaluate(() => { const s = ABY.Song.stats, g = ABY.game.state; return { node: g.node, flag: g.flags.rite_box, slam: s.slam, chords: s.chords, acc: s.acc, total: s.total }; });
  await tapChip(pg, 'her turn to choose'); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 }); const after = await chips(pg);
  const sd = await pg.evaluate(() => ({ node: ABY.game.state.node, dread: ABY.game.state.dread, done: ABY.game.state.flags.box_done }));
  rec('hard-rite-box', before.some(x => /music-box waltz/.test(x)) && b.node === 'd6_box_win' && b.flag === 1 && b.chords >= 12 && b.slam === b.chords && b.acc === 1 && sd.node === 'd6_sorrel' && sd.dread === 2 && sd.done === 1 && !after.some(x => /music-box waltz/.test(x)),
    'the bot lands ' + b.slam + '/' + b.chords + ' slams of ' + b.total + ' notes and wins; dread 3 -> ' + sd.dread + '; the waltz is offered once: ' + after.join(' / ')); await pg.screenshot({ path: join(OUT, 'day6-box-won.png') });
  await ctx.close();
});
await block('badges-and-factions', async () => { // badges and factions are the player's own; a shared link starts from the beginning
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
});
await block('landing-fresh', async () => { // landing pages send people to a fresh journey
  const bad = []; for (const slug of ABYS.ENDING_IDS.concat(['progress'])) { const h = readFileSync(join(GAME, 's', slug, 'index.html'), 'utf8'); if (!h.includes("location.replace('../../index.html?fresh=1')") || !h.includes('href="../../index.html?fresh=1"')) bad.push(slug); }
  rec('landing-pages-start-fresh', bad.length === 0, bad.join(', ') || 'every share link (' + (ABYS.ENDING_IDS.length + 1) + ' pages) opens the game with ?fresh=1');
});
await block('phone-turns', async () => { // the phone turns: on a desktop it can be laid on its side; on a real phone it turns by itself, mid-chat
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
});

// Objects: what she picked up shows in Pulse until she spends it, and a pickup / use is offered only when it can be
await block('objects', async () => { const c = await open({}, 'objects'); const pg = c.pg; await wake(pg); await openMessages(pg);
  await at(pg, 'd2_stairs2', {}); const offer = (await chips(pg)).some(t => /white grit/.test(t)); await tapChip(pg, 'Scoop up the white grit'); const again = (await chips(pg)).some(t => /white grit/.test(t));
  await at(pg, 'd5_hang', { flags: Object.assign({}, await pg.evaluate(() => ABY.game.state.flags), { has_shard: 1 }) }); const use = (await chips(pg)).some(t => /line of salt/.test(t));
  await pg.evaluate(() => ABY.Phone.show('pulse')); await sleep(500);
  const rows = await pg.evaluate(() => [...document.querySelectorAll('#ringsL .rl.pocket')].map(r => r.querySelector('b').textContent + '|' + r.querySelector('.v').textContent));
  await pg.evaluate(() => ABY.Phone.show('msg')); await sleep(300); await tapChip(pg, 'Pour a line of salt'); await pg.evaluate(() => ABY.Phone.show('pulse')); await sleep(500);
  const after = await pg.evaluate(() => [...document.querySelectorAll('#ringsL .rl.pocket b')].map(b => b.textContent));
  rec('objects-carried-and-spent', offer && !again && use && rows.length === 2 && rows.some(r => /salt/.test(r)) && rows.some(r => /mirror.*\u2620/.test(r)) && after.length === 1 && /mirror/.test(after[0]),
    'the salt is offered once (' + offer + '/' + again + '), the pocket shows ' + rows.join(', ') + ', and spending it on Day Five leaves ' + after.join(', ')); await c.ctx.close(); });

// Codas: an ending closes with a last word from the people she met, for what she did, just before the end stamp; the memory card is the ending's own
await block('codas', async () => { const { ctx, pg } = await open(phoneCtx({ w: 844, h: 390 }), 'codas'); await wake(pg); await openMessages(pg); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
  const last = () => pg.evaluate(() => { return { before: [...document.querySelectorAll('#thread .who')].map(w => w.textContent), text: document.getElementById('thread').textContent, card: document.getElementById('eText').textContent }; });
  await at(pg, 'd2_door', { mem: 3, resolve: 3, flags: { freed_name: 1, vey_known: 1, carried: 1 } }); await tapChip(pg, 'Hold the door yourself');
  await pg.waitForFunction(() => /a long shift/.test(document.getElementById('thread').textContent) && !document.body.classList.contains('finale'), null, { timeout: 15000 }); await sleep(300); await pg.screenshot({ path: join(OUT, 'codas-keeper.png') });   // read before the gate takes the screen
  await memoryShown(pg);
  const a = await last(); 
  const want = await pg.evaluate(() => ({ codas: ABY.codasFor('keeper', { flags: { freed_name: 1, vey_known: 1, carried: 1 } }).map(c => c.text), card: ABY.ENDINGS.keeper.text }));
  await at(pg, 'd2_door', { mem: 3, resolve: 3, flags: {} }); await tapChip(pg, 'Hold the door yourself'); await memoryShown(pg); const b = await last();
  rec('codas-close-the-ending', want.codas.length === 2 && want.codas.every(t => a.text.includes(t)) && a.before.slice(-2).join() === 'Guardian,Vey' && /Vey[^]*\u2014 end \u2014$/.test(a.text) && !/dreamt of grass/.test(a.text) && a.card === want.card && b.card === want.card && !want.codas.some(t => b.text.includes(t)),
    'Holding the door after freeing the Guardian and naming Vey ends with ' + a.before.slice(-2).join(' then ') + ', on screen before the gate (the third earned coda waits: two at most), a player who did neither hears nobody, and the memory card is the ending\u2019s own text both times'); await ctx.close(); });

// Detours and second sight: a side room off the day's road, offered once, that brings her back where she was; and a scene that remembers an earlier journey
await block('detours', async () => { const { ctx, pg } = await open(phoneCtx({ w: 844, h: 390 }), 'detours'); await wake(pg); await openMessages(pg); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
  const node = (id) => pg.waitForFunction((id) => ABY.game.state.node === id && !ABY.game.delivering, id, { timeout: 15000 });
  await at(pg, 'd3_fork', { flags: {} }); const offer = (await chips(pg)).some(t => /wall between the three ways/.test(t));
  await tapChip(pg, 'Look closer at the wall'); await node('dt_d3_a'); await tapChip(pg, 'Trace the unfinished door'); await node('dt_d3_b');
  const eye = await pg.evaluate(() => /put them on the fridge/.test(document.getElementById('thread').textContent)); await pg.screenshot({ path: join(OUT, 'detour-day-three.png') });
  await tapChip(pg, 'Tell the Eye they are good'); await node('d3_fork'); const back = await chips(pg), st = await pg.evaluate(() => ({ f: ABY.game.state.flags.dt_d3, heart: ABY.game.state.heart }));
  rec('detours-return-once', offer && eye && st.f === 1 && !back.some(t => /wall between/.test(t)) && back.some(t => /red corridor/.test(t)),
    'Day Three\u2019s fork offers the wall of drawings; the Eye speaks in it; she comes back to the fork with the side room gone and the three ways still open');
  await at(pg, 'g_meet', { mem: 1, flags: { echo_dawn: 1 } }); const seen = await pg.evaluate(() => [...document.querySelectorAll('#thread .who')].map(w => w.textContent).join() + '|' + /draught on my face/.test(document.getElementById('thread').textContent));
  await at(pg, 'g_meet', { mem: 0, flags: {} }); const fresh = await pg.evaluate(() => /draught on my face/.test(document.getElementById('thread').textContent.split('carry the echo').slice(-2)[0] || ''));
  rec('second-sight-remembers', /\|true$/.test(seen) && !fresh, 'someone who once opened the gate is recognised by the Guardian when they meet again; a first journey is not'); await ctx.close(); });

// Settings: sound and vibration persist; the danger buttons need two taps
await block('settings', async () => { const c = await open({}, 'settings'); await wake(c.pg); await c.pg.click('#unlock'); await sleep(400); await c.pg.click('[data-app=settings]'); await sleep(400);
  await c.pg.click('#setSnd'); await c.pg.click('#setHap'); await sleep(200);
  await c.pg.reload({ waitUntil: 'load' }); await c.pg.waitForFunction(() => document.getElementById('pre').classList.contains('done')); await c.pg.click('#unlock'); await sleep(400); await c.pg.click('[data-app=settings]'); await sleep(300);
  const o = await c.pg.evaluate(() => ({ snd: document.getElementById('setSnd').getAttribute('aria-pressed'), hap: document.getElementById('setHap').getAttribute('aria-pressed'), muted: ABY.Audio.muted, ctx: !!ABY.Audio.ctx }));
  rec('settings-persist', o.snd === 'false' && o.hap === 'false' && o.muted, 'sound off and vibration off survive a reload');
  await c.pg.click('#setRes'); const armed = await c.pg.evaluate(() => /Tap again/.test(document.getElementById('setResS').textContent)); await c.pg.click('#setRes');
  rec('settings-two-taps', armed, 'a danger button asks for a second tap'); await c.ctx.close(); });

// Vibration: patterns that follow the story, scaled by the strength setting, silent when it is off (the flute rites included)
await block('vibration', async () => { const c = await open({}, 'vibration', { pre: 'window.__vib = []; navigator.vibrate = function (p) { window.__vib.push(p); return true; };' });
  const vib = () => c.pg.evaluate(() => window.__vib.slice()), clear = () => c.pg.evaluate(() => { window.__vib.length = 0; });
  await wake(c.pg); await c.pg.click('#unlock'); await sleep(400); await c.pg.click('[data-app=settings]'); await sleep(400);
  const lv0 = await c.pg.textContent('#hapLvS');
  await clear(); await c.pg.evaluate(() => ABY.Audio.buzz([100, 50, 100])); const normal = (await vib()).pop();
  await c.pg.click('#setHapLv'); await clear(); await c.pg.evaluate(() => ABY.Audio.buzz([100, 50, 100])); const strong = (await vib()).pop(); const lv1 = await c.pg.textContent('#hapLvS');
  await c.pg.click('#setHapLv'); await clear(); await c.pg.evaluate(() => ABY.Audio.buzz([100, 50, 100])); const light = (await vib()).pop();
  await c.pg.reload({ waitUntil: 'load' }); await c.pg.waitForFunction(() => document.getElementById('pre').classList.contains('done')); const kept = await c.pg.evaluate(() => ABY.game.hapLv);
  await c.pg.evaluate(() => { ABY.game.hapLv = 1; });
  rec('vibration-strength', lv0 === 'Normal' && lv1 === 'Strong' && JSON.stringify(normal) === '[100,50,100]' && JSON.stringify(strong) === '[160,50,160]' && JSON.stringify(light) === '[60,50,60]' && kept === 0, 'Normal ' + JSON.stringify(normal) + ', Strong ' + JSON.stringify(strong) + ', Light ' + JSON.stringify(light) + '; only the buzzes scale, never the gaps; Light survives a reload');
  await openMessages(c.pg); await clear(); await at(c.pg, 'd5_ring', { dread: 0 }); const ring = (await vib()).filter(Array.isArray);
  await clear(); await at(c.pg, 'd2_wake', { dread: 4 }); const beat = (await vib()).filter(p => Array.isArray(p) && p.length === 3);
  await clear(); await at(c.pg, 'end_drowned', {}); await sleep(300); const fall = (await vib()).filter(p => Array.isArray(p) && p.length === 7);
  rec('vibration-follows-the-story', ring.length > 0 && beat.length > 0 && fall.length > 0, 'a ringing call shakes in a pattern (' + ring.length + '), a message lands as a heartbeat at high dread (' + beat.length + '), a fall ends in a slow fade (' + fall.length + ')');
  await c.pg.evaluate(() => document.getElementById('setHap').click()); await clear();
  await c.pg.evaluate(() => { ABY.Audio.buzz([14, 30, 14]); ABY.Audio.buzz(24); }); await at(c.pg, 'd5_ring', { dread: 4 }); const quiet = (await vib()).filter(p => p !== 0);     // (0 only cancels a buzz already running)
  rec('vibration-off-is-silent', quiet.length === 0, 'with Vibration off nothing fires, not from the story and not from the flute rites (' + quiet.length + ' calls)');
  await c.ctx.close(); });

// Vibration on an iPhone (no navigator.vibrate): a hidden switch control is clicked inside the tap, which ticks on iOS 17.4+; and nothing when Vibration is off
await block('vibration-iphone', async () => { const c = await open({ ctx: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' } }, 'vibration-ios', { pre: 'Object.defineProperty(navigator, "vibrate", { value: undefined, configurable: true });' });
  await c.pg.evaluate(() => { window.__flips = 0; document.addEventListener('change', e => { if (e.target && e.target.hasAttribute && e.target.hasAttribute('switch')) window.__flips++; }, true); });
  await c.pg.evaluate(() => { ABY.game.haptics = true; ABY.Audio.hapOn = true; ABY.Audio.buzz(10); ABY.Audio.buzz([30, 60, 30]); }); const on = await c.pg.evaluate(() => ({ flips: window.__flips, sw: document.querySelectorAll('label input[switch]').length }));
  await c.pg.evaluate(() => { ABY.Audio.hapOn = false; ABY.Audio.buzz(10); }); const off = await c.pg.evaluate(() => window.__flips);
  rec('vibration-iphone-tick', on.flips === 2 && on.sw === 1 && off === 2, 'without navigator.vibrate a hidden switch is toggled once per buzz (' + on.flips + ' flips, ' + on.sw + ' switch in the page), and not at all when Vibration is off'); await c.ctx.close(); });

// Calm flashes: a scare never strobes, flickers, shakes or goes white; on by default for reduced motion, and a switch in Settings that persists
await block('calm', async () => { const c = await open({}, 'calm'); const pg = c.pg; await wake(pg); await openMessages(pg); await pg.waitForSelector('#replies.on .chip', { timeout: 8000 });
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
    'off: ' + off.shake + '/' + off.after + '/' + off.bg + ' (calm ' + off.calm + '); Calm flashes (saved across a reload): no shake (' + jump.shake + '), a dark fade (' + jump.after + ', ' + jump.bg + '), no glitch (' + glitch.sheet + '), a slow Eye (' + eye.after + ', pressed ' + pressed + '); on by default with reduced motion: ' + byDefault); });

// ================= phone fit =================
await block('phone-fit', async () => {
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
});

// ================= saves =================
await block('saves', async () => {
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
});

// ================= first run: reply from the lock screen, the guide, swipe between home pages =================
await block('first-run', async () => { const c = await open({ guide: true, ctx: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } }, 'firstrun'); const pg = c.pg; await wake(pg);
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
  await c.ctx.close(); });

// ================= robustness =================
await block('robustness', async () => {
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
});

// ================= sleek scrolling in the thread =================
await block('thread-scroll', async () => {
  const { ctx, pg } = await open(phoneCtx(PHONES[0]), 'threadscroll'); await wake(pg); await openMessages(pg); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
  await pg.evaluate(() => { const th = document.getElementById('thread'); for (let i = 0; i < 30; i++) { const d = document.createElement('div'); d.className = 'm in'; d.style.animation = 'none'; d.textContent = 'an older message, number ' + i + ', long enough to take a line or two on a phone'; th.appendChild(d); } th.scrollTop = th.scrollHeight; th.dispatchEvent(new Event('scroll')); });
  await sleep(200);
  const atEnd = await pg.evaluate(() => ({ btn: document.getElementById('toLatest').classList.contains('on'), up: document.getElementById('thread').classList.contains('up') }));
  await pg.evaluate(() => { const th = document.getElementById('thread'); th.style.scrollBehavior = 'auto'; th.scrollTop = 120; th.dispatchEvent(new Event('scroll')); }); await sleep(200);
  const away = await pg.evaluate(() => ({ btn: document.getElementById('toLatest').classList.contains('on'), up: document.getElementById('thread').classList.contains('up'), top: document.getElementById('thread').scrollTop, bar: getComputedStyle(document.getElementById('thread')).scrollbarWidth, ov: getComputedStyle(document.getElementById('thread')).overscrollBehaviorY }));
  await pg.screenshot({ path: join(OUT, 'thread-scrolled-up.png') });
  const sz = await pg.evaluate(() => { const r = document.getElementById('toLatest').getBoundingClientRect(); return { w: r.width, h: r.height }; });
  await pg.evaluate(() => { window.__sfx = 0; const o = ABY.Audio.sfx; ABY.Audio.sfx = function (n) { if (n === 'ui') window.__sfx++; return o.apply(this, arguments); }; });
  await pg.click('#toLatest'); await sleep(900);
  const end = await pg.evaluate(() => { const th = document.getElementById('thread'); return { gap: th.scrollHeight - th.scrollTop - th.clientHeight, btn: document.getElementById('toLatest').classList.contains('on'), sfx: window.__sfx }; });
  rec('thread-scroll-sleek', !atEnd.btn && atEnd.up && away.btn && away.up && away.top < 200 && /thin|auto/.test(away.bar) && away.ov === 'contain' && sz.w >= 44 && sz.h >= 44 && end.gap < 4 && !end.btn && end.sfx >= 1,
    'at the end: no jump button, the top fades; scrolled up: the button shows (' + sz.w + 'x' + sz.h + '), the bar is thin and the scroll is contained (' + away.bar + '/' + away.ov + '); the button takes her to the latest message with a sound (gap ' + end.gap + ')');
  await ctx.close();
});

// ================= the road, longer: beats =================
await block('beats', async () => {
  const { ctx, pg } = await open(Object.assign(phoneCtx(PHONES[0]), { beats: true }), 'beats'); await wake(pg); await openMessages(pg);
  await at(pg, 'd5_wake', { mem: 3 }); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
  const bat0 = await pg.evaluate(() => ABY.game.state.bat);
  await pg.locator('#replies .chip', { hasText: 'Say her name' }).first().click();
  await pg.waitForFunction(() => ABY.game.state.node === 'bt_d5_bedroom', null, { timeout: 15000 }); await pick(pg, 'Speak first');
  await pg.waitForFunction(() => ABY.game.state.node === 'd5_hello', null, { timeout: 15000 }); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
  const o = await pg.evaluate(() => ({ bat: ABY.game.state.bat, thread: document.getElementById('thread').textContent }));
  rec('beat-plays', /cheap kind that let the street light in/.test(o.thread) && /Speak first/.test(o.thread) && /sleepy whisper/.test(o.thread) && o.bat === bat0 - 1,
    'a beat on the way to Wren: its text arrives, its one reply is sent, and she lands where the old link went (battery ' + bat0 + ' -> ' + o.bat + ': only the original choice cost anything)');
  await ctx.close();
});

// ================= more calls through the week =================
await block('ring-detours-ui', async () => {
  const { ctx, pg } = await open(phoneCtx(PHONES[0]), 'ringdetour'); await wake(pg); await openMessages(pg);
  await at(pg, 'd5_hang', {}); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
  const entry = pg.locator('#replies .chip', { hasText: 'The phone is ringing: Corvin Ash' }); const offered = await entry.count();
  await entry.first().click(); await pg.waitForSelector('#call.on[data-ring="1"]', { timeout: 15000 });
  const r1 = await pg.evaluate(() => ({ who: document.getElementById('callWho').textContent, n: document.querySelectorAll('#callAct .cbtn').length }));
  await pg.locator('#callAct .cbtn.no').click(); await pg.waitForSelector('#call.on[data-ring="2"]', { timeout: 15000 });
  await pg.locator('#callAct .cbtn.no').click(); await pg.waitForSelector('#call.on[data-ring="3"]', { timeout: 15000 });
  const r3 = await pg.evaluate(() => document.querySelectorAll('#callAct .cbtn').length);
  await pg.locator('#callAct .cbtn').first().click(); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 });
  await pg.locator('#replies .chip', { hasText: 'Put the phone down' }).first().click(); await pg.waitForFunction(() => ABY.game.state.node === 'd5_hang' && ABY.game.state.flags.rg_done_corvin5 === 1, null, { timeout: 15000 });
  await pg.waitForSelector('#replies.on .chip', { timeout: 15000 }); const after = await pg.locator('#replies .chip', { hasText: 'The phone is ringing' }).count();
  rec('ring-detour-plays', offered === 1 && r1.who === 'Corvin Ash' && r1.n === 2 && r3 === 1 && after === 0, 'the call is offered once on the scene (' + offered + '), rings as ' + r1.who + ', rings louder when declined, answers itself on the third, and puts her back on the same scene with no second offer (' + after + ')');
  await ctx.close();
});

// ================= who you were =================
await block('heroes-ui', async () => {
  const shots = [];
  for (const ph of [PHONES[2], PHONES[0]]) {
    const { ctx, pg } = await open(Object.assign(phoneCtx(ph), { hero: true }), 'hero-' + ph.n); await wake(pg); await openMessages(pg);
    await pg.waitForSelector('#who:not([hidden]) .hcard', { timeout: 15000 });
    const cards = await pg.$$eval('#who .hcard', bs => bs.map(b => { const r = b.getBoundingClientRect(), v = document.getElementById('device').getBoundingClientRect(); return { id: b.dataset.hero, h: Math.round(r.height), w: Math.round(r.width), inside: r.top >= v.top - 1 && r.bottom <= v.bottom + 1 && r.left >= v.left - 1 && r.right <= v.right + 1, name: b.querySelector('b').textContent }; }));
    await pg.screenshot({ path: join(OUT, 'heroes-' + ph.n + '.png') });
    const run0 = await pg.evaluate(() => ABY.game.run);
    await pg.locator('#who .hcard[data-hero="jude"]').click(); await pg.waitForFunction(() => ABY.game.run && ABY.game.state.node === 'hero_jude', null, { timeout: 15000 });
    await pick(pg, 'Remember her hand'); await pg.waitForFunction(() => ABY.game.state.node === 'awakening' && !ABY.game.delivering, null, { timeout: 15000 });
    const o = await pg.evaluate(() => ({ hero: ABY.game.state.hero, notes: ABY.game.state.notes, bat: ABY.game.state.bat, thread: document.getElementById('thread').textContent, hidden: document.getElementById('who').hidden }));
    shots.push({ ph: ph.n, cards, run0, o });
    await ctx.close();
  }
  const ok = shots.every(x => x.cards.length === 3 && x.cards.every(c => c.h >= 44 && c.inside) && !x.run0 && x.o.hidden && x.o.hero === 'jude' && x.o.notes.includes('h_jude') && x.o.bat === 62 && /you were Jude/.test(x.o.thread) && /Something wakes her/.test(x.o.thread));
  rec('heroes-pick', ok, shots.map(x => x.ph + ': ' + x.cards.map(c => c.name + ' ' + c.w + 'x' + c.h + (c.inside ? '' : ' OFF-SCREEN')).join(', ')).join(' | ') + '; picking Jude plays her "before" scene, files her note, then the first scene, battery untouched');
  // later in the week she is remembered by name, and her flashback is there for her only
  const { ctx, pg } = await open(phoneCtx(PHONES[0]), 'hero-week'); await wake(pg); await openMessages(pg);
  await at(pg, 'd4_type', { hero: 'jude', mem: 2 }); const mine = await chips(pg); await at(pg, 'd4_type', { hero: 'rowan', mem: 2 }); const his = await chips(pg); await at(pg, 'd4_type', { mem: 2 }); const none = await chips(pg);
  await at(pg, 'd4_type', { hero: 'jude', mem: 2, bat: 30 }); await pg.locator('#replies .chip', { hasText: 'who you were (Jude)' }).first().click();
  await pg.waitForFunction(() => ABY.game.state.node === 'hb4_jude', null, { timeout: 15000 }); const slip = await pg.evaluate(() => document.getElementById('screen').dataset.time);
  await pick(pg, 'Remember his name'); await pg.waitForFunction(() => ABY.game.state.node === 'd4_type' && !ABY.game.delivering, null, { timeout: 15000 });
  const back = await pg.evaluate(() => ({ bat: ABY.game.state.bat, f: ABY.game.state.flags.tt_hero4 })); const after = await chips(pg);
  await at(pg, 'd5_wake', { hero: 'ellis', mem: 2 }); const wrenSays = await pg.evaluate(() => document.getElementById('thread').textContent);
  rec('heroes-remembered', mine.some(t => /who you were \(Jude\)/.test(t)) && !his.some(t => /Jude/.test(t)) && his.some(t => /\(Rowan\)/.test(t)) && !none.some(t => /who you were/.test(t)) && slip === 'past' && back.bat === 30 && back.f === 1 && !after.some(t => /who you were/.test(t)) && /Ellis, I found my flute/.test(wrenSays),
    'Day Four offers Jude her own flashback (and Rowan his, and no one none); it plays in the past, costs nothing, comes back to the same scene once; on Day Five Wren writes to Ellis by name');
  await ctx.close();
});

// ================= portrait: the story keeps a window =================
await block('portrait-room', async () => {
  const out = [];
  for (const [w, h] of [[390, 664], [375, 560]]) {   // an iPhone in Safari with its bars showing, and a small one
    const { ctx, pg } = await open({ ctx: { viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } }, 'room-' + w); await wake(pg); await openMessages(pg);
    await at(pg, 'stones_path', { heart: 2 }); await pg.waitForSelector('#replies.on .chip', { timeout: 15000 }); await sleep(400);
    const m = await pg.evaluate(() => { const H = id => document.getElementById(id).getBoundingClientRect().height, rp = document.getElementById('replies'); return { dev: H('device'), thread: H('thread'), chips: rp.querySelectorAll('.chip').length, scrolls: rp.scrollHeight > rp.clientHeight + 4, more: rp.classList.contains('more'), chipH: Math.min(...[...rp.querySelectorAll('.chip')].map(c => c.getBoundingClientRect().height)) }; });
    if (w === 390) await pg.screenshot({ path: join(OUT, 'portrait-room-390x664.png') });
    out.push(Object.assign({ w, h }, m)); await ctx.close();
  }
  rec('portrait-story-keeps-room', out.every(m => m.thread >= m.dev * 0.24 && m.chips >= 5 && m.chipH >= 44 && (!m.scrolls || m.more)), out.map(m => m.w + 'x' + m.h + ': text ' + Math.round(m.thread) + 'px of ' + Math.round(m.dev) + ', ' + m.chips + ' choices' + (m.scrolls ? ' (scroll, faded)' : '')).join(' | ') + ': a long list of choices scrolls instead of squeezing the story to one line');
});

rec('no-console-errors', errs.length === 0, errs.slice(0, 2).join(' | ').slice(0, 220) || 'no page errors or console errors in any run');
await browser.close(); srv.close();
if (process.env.EVAL_TIMES) writeFileSync(process.env.EVAL_TIMES, JSON.stringify(TIMES));
const pass = R.filter(r => r.pass).length; console.log('\n=== ' + pass + '/' + R.length + ' passed ===');
process.exit(pass === R.length ? 0 : 1);
