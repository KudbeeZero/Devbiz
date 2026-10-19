// Kudbee Abyss - playability + safety rubric (Playwright + Chromium). From the repo root: `npm run abyss:eval`.
// Walks the story in node (graph.mjs), then plays the real page: all five endings by clicking, the song by touch and by
// bot, phone fit + notch, saves (good and hostile), no-WebGL / no-CDN, hidden tab, reduced motion, share, sound.
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

// click an option by its text (waits for the text to finish: Enter skips the typewriter)
async function pick(pg, text) {
  await pg.waitForFunction(() => document.getElementById('say').textContent.length > 0, null, { timeout: 15000 });
  if (await pg.evaluate(() => !!ABY.game.type)) await pg.keyboard.press('Enter');          // skip the typewriter (the options appear when it is done)
  await pg.waitForSelector('#opts.on .opt', { timeout: 8000 });
  await pg.locator('#opts .opt', { hasText: text }).first().click();
  await sleep(350);
}
async function begin(pg) { await pg.click('#beginBtn'); await sleep(450); }
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
async function endingShown(pg) { await pg.waitForFunction(() => !document.getElementById('end').classList.contains('hidden'), null, { timeout: 12000 }); return pg.evaluate(() => ({ name: document.getElementById('eName').textContent, kick: document.getElementById('eKick').textContent, found: Object.keys(ABY.game.found) })); }

// ================= desktop =================
let { ctx, pg } = await open({}, 'desk');
if (THREE_PATH) {
  const f0 = await pg.evaluate(() => ABY.debug.frames()); await sleep(1500); const f1 = await pg.evaluate(() => ABY.debug.frames());
  const calls = await pg.evaluate(() => ABY.Scene.drawCalls());
  rec('3d-renders', f1 - f0 >= 8 && calls > 0 && await pg.evaluate(() => !!ABY.Scene.canvas()), (f1 - f0) + ' frames in 1.5 s, ' + calls + ' draw calls');
  const cam0 = await pg.evaluate(() => ABY.Scene.camera());
  await begin(pg); await pick(pg, 'Listen to the stones'); await pick(pg, 'Ask Vey'); await sleep(2200);
  const cam1 = await pg.evaluate(() => ABY.Scene.camera());
  rec('camera-follows-speaker', Math.abs(cam1.x - cam0.x) > 0.3 || Math.abs(cam1.z - cam0.z) > 0.3, 'camera moved from (' + cam0.x.toFixed(1) + ', ' + cam0.z.toFixed(1) + ') to (' + cam1.x.toFixed(1) + ', ' + cam1.z.toFixed(1) + ') for Vey');
  await pg.screenshot({ path: join(OUT, 'desktop-vey.png') });
  await ctx.close(); ({ ctx, pg } = await open({}, 'desk'));
} else skip('3d-renders', 'no three.js copy');
rec('title-screen', await pg.evaluate(() => !document.getElementById('title').classList.contains('hidden') && document.getElementById('beginBtn').offsetParent !== null && /0\/5/.test(document.getElementById('titleMeta').textContent)), 'title shows Begin and 0/5 endings');
await pg.screenshot({ path: join(OUT, 'desktop-title.png') });

// the four story endings by real clicks (Enter skips the typewriter, which tests that too)
const done = {};
for (const [id, path] of Object.entries(PATHS)) {
  await ctx.close(); ({ ctx, pg } = await open({}, 'run-' + id)); await begin(pg);
  for (const t of path) await pick(pg, t);
  const e = await endingShown(pg); done[id] = e;
  const want = { silence: 'The Quiet Gate', dawn: 'The Gate Opens', crown: 'The Crown of Shadows', echo: 'Another Gate' }[id];
  rec('ending-' + id, e.name === want && e.kick === 'New ending found', '"' + e.name + '" (' + e.kick + ')');
  if (id === 'echo') await pg.screenshot({ path: join(OUT, 'desktop-ending-echo.png') });
}
// the song ending: a bot plays a perfect song
await ctx.close(); ({ ctx, pg } = await open({}, 'run-song')); await begin(pg);
await pick(pg, 'Listen to the stones'); await pick(pg, 'Ask Vey'); await pick(pg, 'Play the Song');
await playSong(pg, true);
const st = await pg.evaluate(() => ({ stats: ABY.Song.stats, node: ABY.game.state.node, flags: ABY.game.state.flags }));
rec('song-win', st.node === 'song_win' && st.flags.song === 'win' && st.stats.perfect + st.stats.good >= 24, 'node ' + st.node + ', ' + st.stats.perfect + ' perfect / ' + st.stats.good + ' good / ' + st.stats.miss + ' missed');
await pick(pg, 'Walk into the dawn');
const es = await endingShown(pg);
rec('ending-song', es.name === 'The Song Remembered', '"' + es.name + '"');
// share: names the ending and the canonical link, never location
await pg.evaluate(() => { window.__shared = null; navigator.share = d => { window.__shared = d; return Promise.resolve(); }; });
await pg.click('#shareBtn'); await sleep(200);
const sh = await pg.evaluate(() => window.__shared);
rec('share-text', sh && /Song Remembered/.test(sh.text) && sh.url === 'https://devbiz.kudbee.workers.dev/games/kudbee-abyss/', sh ? sh.text.slice(0, 60) + '… -> ' + sh.url : 'navigator.share not called');
// echoes gallery shows the found ending, hides the others
await pg.click('#againBtn'); await sleep(600); await pg.click('#echoBtn'); await sleep(300);
const gal = await pg.evaluate(() => [...document.querySelectorAll('#gList .gi')].map(d => ({ f: d.classList.contains('f'), h: d.querySelector('h3').textContent })));
rec('echoes-gallery', gal.length === 5 && gal.filter(g => g.f).length === 1 && gal.filter(g => g.h === '???').length === 4, gal.map(g => g.h).join(' | '));
await pg.screenshot({ path: join(OUT, 'desktop-echoes.png') });

// a real touch tap and a key both land on a note
await ctx.close(); ({ ctx, pg } = await open(phoneCtx(PHONES[0]), 'touch-song')); await begin(pg);
await pick(pg, 'Listen to the stones'); await pick(pg, 'Ask Vey'); await pick(pg, 'Play the Song');
await pick(pg, 'Raise the flute'); await pg.waitForFunction(() => ABY.Song.active);
const hit = async (viaTouch) => {
  const n = await pg.evaluate(() => { const S = ABY.Song, o = S.notes.find(x => x.s === 0); return o ? { lane: o.lane, wait: o.t - S.t } : null; });
  await pg.waitForFunction(() => { const S = ABY.Song, o = S.notes.find(x => x.s === 0); return o && o.t - S.t < 0.05; }, null, { polling: 'raf', timeout: 8000 });
  if (viaTouch) { const x = await pg.evaluate((l) => document.getElementById('songCv').getBoundingClientRect().left + 0 + ABY.Song.laneX(l), n.lane); await pg.touchscreen.tap(x, 300); } else await pg.keyboard.press(['a', 's', 'd'][n.lane]);
  await sleep(120); return pg.evaluate(() => ABY.Song.stats.perfect + ABY.Song.stats.good);
};
const h1 = await hit(true), h2 = await hit(false);
rec('song-touch-and-keys', h1 >= 1 && h2 >= 2, 'a touch tap landed (' + h1 + ') and a key landed (' + h2 + ')');
await pg.screenshot({ path: join(OUT, 'phone-song.png') });
// no input at all: the song fails, the Guardian offers another try, and the tries are bounded
await pg.evaluate(() => { ABY.Song.rate = 3; });
await pg.waitForFunction(() => !ABY.Song.active, null, { timeout: 40000 }); await sleep(1500);
const failed = await pg.evaluate(() => ({ node: ABY.game.state.node, fail: ABY.game.state.flags.song, opts: [...document.querySelectorAll('#opts .opt')].map(b => b.textContent), note: document.getElementById('skip').textContent }));
rec('song-fail', failed.node === 'song_fail' && failed.fail === 'fail' && failed.opts.some(o => /again/i.test(o)) && /Song of Recall: \d+%/.test(failed.note), 'node ' + failed.node + ' | ' + failed.opts.join(' / ') + ' | ' + failed.note.slice(0, 40));
await ctx.close();

// ================= phone fit =================
for (const p of PHONES) {
  ({ ctx, pg } = await open(phoneCtx(p), 'fit-' + p.n));
  const checks = [];
  const fit = async (screen) => {
    const o = await pg.evaluate(() => {
      const vw = innerWidth, vh = innerHeight, bad = [], vis = el => { const s = getComputedStyle(el), r = el.getBoundingClientRect(); return s.visibility !== 'hidden' && s.display !== 'none' && r.width > 0 && r.height > 0 && +s.opacity > 0.05 && !el.closest('.hidden') && !el.closest('[hidden]'); };
      for (const el of document.querySelectorAll('button, a.hbtn')) { if (!vis(el)) continue; const r = el.getBoundingClientRect();
        if (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1) bad.push('off-screen ' + (el.id || el.className) + ' ' + Math.round(r.left) + ',' + Math.round(r.right) + 'x' + Math.round(r.bottom));
        if (r.height < 43.5 || r.width < 43.5) bad.push('small target ' + (el.id || el.className) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)); }
      let minFont = 99, minEl = '';
      for (const el of document.querySelectorAll('#stage *')) { if (!vis(el) || !el.childNodes.length || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue; const fs = parseFloat(getComputedStyle(el).fontSize); if (fs < minFont) { minFont = fs; minEl = el.className || el.id || el.tagName; } }
      const card = [...document.querySelectorAll('.panel, #end .box, #title .box, #echoes .box')].filter(vis).map(e => e.getBoundingClientRect());
      for (const r of card) if (r.bottom > vh + 1 || r.right > vw + 1 || r.left < -1 || r.top < -1) bad.push('panel cut off ' + Math.round(r.top) + '-' + Math.round(r.bottom) + ' of ' + vh);
      const pr = document.querySelector('.panel'), prr = pr && vis(pr.parentNode) ? pr.getBoundingClientRect() : null;
      return { bad, minFont, minEl, hscroll: document.documentElement.scrollWidth > vw + 1, panelShare: prr ? (vw >= vh ? prr.width / vw : prr.height / vh) : 0 };
    });
    if (o.bad.length) checks.push(screen + ': ' + o.bad.slice(0, 3).join('; '));
    if (o.minFont < 11.4) checks.push(screen + ': text ' + o.minFont.toFixed(1) + 'px (' + o.minEl + ')');
    if (o.hscroll) checks.push(screen + ': sideways scroll');
    if (o.panelShare > 0.6) checks.push(screen + ': dialogue covers ' + Math.round(o.panelShare * 100) + '% of the scene');
  };
  await fit('title'); await pg.screenshot({ path: join(OUT, `${p.n}-1title.png`) });
  await begin(pg); await pg.waitForSelector('#opts.on .opt', { timeout: 15000 }); await fit('dialogue'); await pg.screenshot({ path: join(OUT, `${p.n}-2dialogue.png`) });
  await pick(pg, 'Listen to the stones'); await pick(pg, 'Approach the guardian'); await pg.waitForSelector('#opts.on .opt'); await fit('3 choices'); await pg.screenshot({ path: join(OUT, `${p.n}-3three-choices.png`) });
  await pg.click('#echoBtn'); await sleep(500); await fit('echoes'); await pg.screenshot({ path: join(OUT, `${p.n}-4echoes.png`) }); await pg.click('#echoClose'); await sleep(500);
  await pick(pg, 'Embrace'); await pick(pg, 'Open the gate'); await endingShown(pg); await sleep(500); await fit('ending'); await pg.screenshot({ path: join(OUT, `${p.n}-5ending.png`) });
  rec('phone-fit-' + p.n, checks.length === 0, checks.join(' | ') || 'targets >= 44px, text >= 11.5px, nothing cut off, scene stays visible (title, dialogue, 3 choices, echoes, ending)');
  await ctx.close();
}
// the notch: 47px side insets (set as the page's own safe-area variables) keep every button and the card clear of the edge
({ ctx, pg } = await open(phoneCtx(PHONES[0]), 'notch'));
await pg.addStyleTag({ content: ':root { --sl:47px !important; --sr:47px !important; --st:0px; }' }); await begin(pg); await pg.waitForSelector('#opts.on .opt');
const nt = await pg.evaluate(() => { const vw = innerWidth, L = [], Rr = []; for (const e of document.querySelectorAll('.hud > *, .panel')) { const r = e.getBoundingClientRect(); if (r.width) { L.push(r.left); Rr.push(r.right); } } return { l: Math.min(...L), r: Math.max(...Rr), vw }; });
rec('phone-notch', nt.l >= 46 && nt.r <= nt.vw - 46, 'content spans ' + Math.round(nt.l) + '..' + Math.round(nt.r) + ' of ' + nt.vw + ' with 47px insets');
await ctx.close();

// ================= saves =================
({ ctx, pg } = await open(phoneCtx(PHONES[0]), 'save')); await begin(pg); await pick(pg, 'Follow the flute'); await pick(pg, 'Call to the small');
const before = await pg.evaluate(() => JSON.stringify(ABY.game.state));
await pg.reload({ waitUntil: 'load' }); await pg.waitForFunction(() => document.getElementById('pre').classList.contains('done'));
const cont = await pg.evaluate(() => ({ vis: !document.getElementById('contBtn').hidden, begin: document.getElementById('beginBtn').textContent }));
await pg.click('#contBtn'); await sleep(600); const after = await pg.evaluate(() => JSON.stringify(ABY.game.state));
rec('save-continue', cont.vis && /New journey/.test(cont.begin) && before === after, 'reload -> Continue -> same node, stats and flags');
await ctx.close();
for (const [name, raw, want] of [
  ['garbage', 'not json {{{', 0], ['wrong shape', '[1,2,3]', 0], ['unknown node', JSON.stringify({ run: { node: '__proto__', heart: 9 }, found: { dawn: 1, evil: 1, crown: 'x' } }), 1],
  ['ending node', JSON.stringify({ run: { node: 'gate_opens', choices: 5 }, found: {} }), 0], ['huge numbers', JSON.stringify({ run: { node: 'spire', heart: 1e12, resolve: -5, trust: '9', choices: 1e99, flags: { crown: 'yes' } }, found: { echo: 1 } }), 1],
]) {
  const c = await open({}, 'hostile-' + name, { pre: `try { localStorage.setItem('kudbee.abyss.v2', ${JSON.stringify(raw)}); } catch (e) {}` });
  const o = await c.pg.evaluate(() => ({ title: !document.getElementById('title').classList.contains('hidden'), found: Object.keys(ABY.game.found).length, st: ABY.game.saved && ABY.game.saved.node, st2: ABY.game.saved && [ABY.game.saved.heart, ABY.game.saved.resolve, ABY.game.saved.trust, ABY.game.saved.flags.crown || 0] }));
  const okState = !o.st || (o.st === 'spire' && o.st2.join() === '5,0,0,0') || o.st === 'awakening';
  rec('save-hostile-' + name.replace(' ', '-'), o.title && o.found === want && okState, 'loads clean; endings found ' + o.found + (o.st ? ', run ' + o.st + ' ' + o.st2.join('/') : ', no run'));
  await c.ctx.close();
}

// ================= robustness =================
{ // no 3D library (CDN blocked) and no WebGL: the game still plays on the art
  const c = await open({}, 'nocdn', { cdn: false }); const nogl = await c.pg.evaluate(() => document.getElementById('stage').classList.contains('nogl'));
  await begin(c.pg); await pick(c.pg, 'Follow the flute'); const dlg = await c.pg.evaluate(() => !document.getElementById('card').hidden && /flute/i.test(document.getElementById('say').textContent));
  rec('no-3d-still-plays', nogl && dlg, 'CDN blocked -> picture fallback + the story still runs'); await c.pg.screenshot({ path: join(OUT, 'no-3d-fallback.png') }); await c.ctx.close();
}
{ const c = await open({}, 'nogl', { pre: 'const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/i.test(t) ? null : g.call(this, t, ...a); };' });
  const ok = await c.pg.evaluate(() => document.getElementById('stage').classList.contains('nogl')); await begin(c.pg); await pick(c.pg, 'Follow the flute');
  rec('no-webgl-still-plays', ok && await c.pg.evaluate(() => !document.getElementById('card').hidden), 'WebGL refused -> fallback + the story still runs'); await c.ctx.close(); }
if (THREE_PATH) {
  const c = await open({}, 'hidden'); await begin(c.pg); const f0 = await c.pg.evaluate(() => ABY.debug.frames());
  await c.pg.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }); await sleep(300);
  const a = await c.pg.evaluate(() => ABY.debug.frames()); await sleep(900); const b = await c.pg.evaluate(() => ABY.debug.frames());
  await c.pg.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }); await sleep(700); const d = await c.pg.evaluate(() => ABY.debug.frames());
  rec('hidden-tab-pauses', b - a <= 1 && d - b >= 5, 'frames while hidden +' + (b - a) + ', after returning +' + (d - b)); await c.ctx.close();
}
{ const c = await open({ ctx: { reducedMotion: 'reduce' } }, 'reduced'); await begin(c.pg); const o = await c.pg.evaluate(() => ({ typed: ABY.game.type === null, text: document.getElementById('say').textContent.length, red: ABY.Scene.reduced || !ABY.Scene.ready }));
  rec('reduced-motion', o.typed && o.text > 80 && o.red, 'text appears at once, scene sway off'); await c.ctx.close(); }
{ const c = await open({}, 'sound'); await c.pg.click('#sndBtn'); await sleep(200);
  const o = await c.pg.evaluate(() => ({ pressed: document.getElementById('sndBtn').getAttribute('aria-pressed'), muted: ABY.Audio.muted, ctx: !!ABY.Audio.ctx, saved: JSON.parse(localStorage.getItem('kudbee.abyss.v2')).muted }));
  await c.pg.reload({ waitUntil: 'load' }); await c.pg.waitForFunction(() => document.getElementById('pre').classList.contains('done'));
  const o2 = await c.pg.evaluate(() => ({ pressed: document.getElementById('sndBtn').getAttribute('aria-pressed'), muted: ABY.Audio.muted }));
  rec('sound-toggle-persists', o.pressed === 'true' && o.muted && o.ctx && o.saved === true && o2.pressed === 'true' && o2.muted, 'mute on, saved, still on after reload; audio context made on the first tap'); await c.ctx.close(); }

rec('no-console-errors', errs.length === 0, errs.slice(0, 2).join(' | ').slice(0, 220) || 'no page errors or console errors in any run');
await browser.close(); srv.close();
const pass = R.filter(r => r.pass).length; console.log('\n=== ' + pass + '/' + R.length + ' passed ===');
process.exit(pass === R.length ? 0 : 1);
