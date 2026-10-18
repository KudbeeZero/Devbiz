// Kudbee Cricket — browser rubric (Playwright + Chromium, real pointer/keyboard input).
//   node evaluator.mjs     (serves the repo over local HTTP)
import http from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, extname, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'out'); mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.png': 'image/png', '.css': 'text/css' };
const server = http.createServer((q, s) => {
  const p = join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !existsSync(p)) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); s.end(readFileSync(p));
});
await new Promise(r => server.listen(0, r));
const URL = `http://localhost:${server.address().port}/games/kudbee-cricket/index.html`;

const R = [];
const rec = (id, pass, note) => { R.push(pass); console.log(pass ? 'PASS' : 'FAIL', id, '—', note); };
// Cloud containers: use the pre-installed Chromium when present (avoids `playwright install`).
const launchOpts = existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {};
const browser = await chromium.launch(launchOpts);
const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(URL); await page.waitForFunction(() => window.KCKGame);

// stage coords -> page px (the stage is XW wide starting at XL; a wide screen shows past 0..960)
const toPxOn = async (pg, x, y) => { const box = await pg.locator('#gameCanvas').boundingBox(), s = await pg.evaluate(() => ({ XL: KCK.Render.XL, XW: KCK.Render.XW })); return [box.x + (x - s.XL) * box.width / s.XW, box.y + y * box.height / 640]; };
const btnOn = (pg, id) => pg.evaluate(i => { const x = KCK.UI.buttons.find(b => b.id === i); return x && { x: x.x + x.w / 2, y: x.y + x.h / 2 }; }, id);
let box = await page.locator('#gameCanvas').boundingBox();
const toPx = (x, y) => [box.x + x * box.width / 960, box.y + y * box.height / 640];
const click = async id => { const b = await btnOn(page, id); if (!b) return false; await page.mouse.click(...await toPxOn(page, b.x, b.y)); return true; };
const G = fn => page.evaluate(fn);
const waitFor = (fn, ms = 20000) => page.waitForFunction(fn, null, { timeout: ms }).then(() => true, () => false);

rec('boots-clean', errors.length === 0 && await G(() => KCK.UI.buttons.length > 0), `menu renders with ${await G(() => KCK.UI.buttons.length)} buttons, ${errors.length} console errors`);
await page.screenshot({ path: `${OUT}/menu.png` });

await click('lv0'); await click('ov0');
rec('settings-persist', await G(() => { const d = JSON.parse(localStorage.getItem('kudbee.cricket.v2')); return d.difficulty === 0 && d.overs === 0; }), 'ROOKIE + 2 overs selected and saved');

await click('play');
rec('match-starts', await G(() => KCKGame.screen === 'play' && KCKGame.match.maxBalls === 12), 'play screen, 12-ball chase');
await waitFor(() => KCKGame.bp === 'flight');
await page.screenshot({ path: `${OUT}/flight.png` });

// swing with real input: wait for the ball, aim right with the pointer, click on time
const hittable = () => { const a = KCKGame.cur.del.arr; return Math.abs(a.x - 0.1) < 0.6 && a.z < 1.5 && !KCKGame.cur.del.noBall; };
const swingOnTime = async (xFrac) => {
  for (let i = 0; i < 6; i++) {
    await waitFor(() => KCKGame.bp === 'flight', 12000);
    if (await G(hittable)) break;
    await waitFor(() => KCKGame.bp === 'ready' || KCKGame.screen === 'over', 12000);
  }
  await page.mouse.move(...toPx(480 + xFrac * 480, 330));
  await waitFor(() => KCKGame.bt >= KCKGame.cur.del.tArr - 0.115, 4000);
  await page.mouse.down(); await page.mouse.up();
  await waitFor(() => KCKGame.bp === 'hit' || KCKGame.bp === 'miss', 4000);
};
await swingOnTime(0.3);
const o1 = await G(() => ({ contact: KCKGame.out.contact, kind: KCKGame.out.kind, q: KCKGame.out.shot && KCKGame.out.shot.q }));
rec('pointer-swing', o1.contact && o1.q > 0.6, `a click on the beat makes contact (q=${(o1.q || 0).toFixed(2)}) -> ${o1.kind}`);
await page.waitForTimeout(700); await page.screenshot({ path: `${OUT}/hit.png` });
rec('field-view', await G(() => KCKGame.camTarget === 1 && KCKGame.camB > 0.3), 'a hit cuts to the high field view');
await waitFor(() => KCKGame.bp === 'ready', 15000);
rec('scoreboard-updates', await G(() => KCKGame.match.runs === KCKGame.match.log.reduce((a, o) => a + o.runs + o.extras, 0) && KCKGame.match.log.length >= 1), `score ${await G(() => KCKGame.match.runs)}/${await G(() => KCKGame.match.wk)} after one ball`);

// leaving a ball: the bowled/dot/wide result plays in the bat view
await waitFor(() => KCKGame.bp === 'flight', 12000);
await waitFor(() => KCKGame.bp === 'miss', 6000);
rec('no-swing-resolves', await G(() => KCKGame.out && !KCKGame.out.contact && ['wicket', 'dot', 'wide'].includes(KCKGame.out.kind)), `not swinging gives ${await G(() => KCKGame.out.kind)}`);
await page.screenshot({ path: `${OUT}/miss.png` });

// keyboard: aim, loft, swing
await waitFor(() => KCKGame.bp === 'ready', 8000);
await page.keyboard.press('l');
rec('loft-toggle', await G(() => KCKGame.loft === true), 'L toggles lofted shots');
const a0 = await G(() => KCKGame.aimDeg);
await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
rec('keyboard-aim', await G(() => KCKGame.aimDeg) === a0 - 12, `arrow keys steer the aim (${a0}° -> ${await G(() => KCKGame.aimDeg)}°)`);
await waitFor(() => KCKGame.bp === 'flight', 8000);
await waitFor(() => KCKGame.bt >= KCKGame.cur.del.tArr - 0.115, 4000);
await page.keyboard.press(' ');
rec('keyboard-swing', await waitFor(() => KCKGame.bp === 'hit' || KCKGame.bp === 'miss', 4000) && await G(() => !!KCKGame.out), 'Space swings');

// pause freezes the ball; resume continues
await waitFor(() => KCKGame.bp === 'ready' || KCKGame.screen === 'over', 15000);
if (await G(() => KCKGame.screen === 'play')) {
  await page.keyboard.press('p');
  rec('pause', await G(() => KCKGame.screen === 'paused'), 'P pauses');
  const t0 = await G(() => KCKGame.bpT + KCKGame.bt); await page.waitForTimeout(400);
  rec('pause-freezes', await page.evaluate(v => KCKGame.bpT + KCKGame.bt === v, t0), 'the delivery clock stops while paused');
  await page.screenshot({ path: `${OUT}/pause.png` });
  await click('resume');
  rec('resume', await G(() => KCKGame.screen === 'play'), 'resume returns to play');
} else { rec('pause', true, 'match already over'); rec('pause-freezes', true, '-'); rec('resume', true, '-'); }

// finish the match: put it on the last ball, then let the ball go
await G(() => { KCKGame.match.balls = KCKGame.match.maxBalls - 1; });
await waitFor(() => KCKGame.screen === 'over', 40000);
rec('match-ends', await G(() => KCKGame.screen === 'over'), `match ends on the result screen (${await G(() => KCKGame.match.result)})`);
await page.screenshot({ path: `${OUT}/over.png` });
rec('stats-saved', await G(() => JSON.parse(localStorage.getItem('kudbee.cricket.v2')).stats.played >= 1), 'the finished match is saved to stats');
await click('rematch');
rec('rematch', await G(() => KCKGame.screen === 'play' && KCKGame.match.balls === 0), 'play again starts a fresh chase');

await page.setViewportSize({ width: 390, height: 780 });
rec('mobile-fit', await G(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no horizontal scroll at phone width');

// ---- phone (landscape 844 x 390, touch): fills the screen, thumb-sized controls, tap to swing, upright card ----
const phone = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const pp = await phone.newPage();
pp.on('pageerror', e => errors.push('phone: ' + e.message));
await pp.goto(URL); await pp.waitForFunction(() => window.KCKGame);
const P = fn => pp.evaluate(fn);
const tapId = async id => { const b = await btnOn(pp, id); if (!b) return false; await pp.touchscreen.tap(...await toPxOn(pp, b.x, b.y)); return true; };
const pbox = await pp.locator('#gameCanvas').boundingBox();
rec('phone-fill', pbox.width >= 843 && pbox.height >= 389, `canvas ${Math.round(pbox.width)}x${Math.round(pbox.height)} on an 844x390 screen (no letterbox bars)`);
// every button on a screen is at least ~32 CSS px each way
const smallest = () => P(() => { const k = document.getElementById('gameCanvas').getBoundingClientRect().height / 640; return Math.min(...KCK.UI.buttons.map(b => Math.min(b.w, b.h) * k)); });
const tapMenu = await smallest();
await pp.screenshot({ path: `${OUT}/phone-menu.png` });
const linkMenu = await P(() => getComputedStyle(document.querySelector('.back-link')).display !== 'none');
await tapId('play');
await pp.waitForFunction(() => KCKGame.bp === 'flight', null, { timeout: 12000 });
const tapPlay = await smallest();
const linkPlay = await P(() => getComputedStyle(document.querySelector('.back-link')).display === 'none');
rec('phone-studio-link', linkMenu && linkPlay, 'the STUDIO link shows on the menu and hides during play');
await pp.screenshot({ path: `${OUT}/phone-flight.png` });
// the HUD sits on the real screen edges, inside the canvas
const edges = await P(() => { const R = KCK.Render, xs = KCK.UI.buttons.map(b => [b.x, b.x + b.w]).flat(); return { lo: Math.min(...xs) - R.XL, hi: R.XL + R.XW - Math.max(...xs), wide: R.XW > 1200 }; });
rec('phone-hud-edges', edges.wide && edges.hi >= 0 && edges.hi < 40, `the stage is wide and the HUD buttons ride the right edge (${Math.round(edges.hi)} px in)`);
// tap on the off side, on the beat: the touch aims and swings
await pp.waitForFunction(() => KCKGame.bp === 'ready' || KCKGame.bp === 'runup', null, { timeout: 12000 });
await pp.waitForFunction(() => KCKGame.bp === 'flight', null, { timeout: 12000 });
await pp.waitForFunction(() => KCKGame.bt >= 0.1, null, { timeout: 4000 });      // timing is checked on desktop; here: the tap lands, swings, aims
await pp.touchscreen.tap(...await toPxOn(pp, 700, 330));
await pp.waitForFunction(() => KCKGame.bp === 'hit' || KCKGame.bp === 'miss', null, { timeout: 4000 }).catch(() => {});
const tp = await P(() => KCKGame.tap && { aim: KCKGame.tap.aim });
rec('phone-tap-swing', !!tp && tp.aim > 20, `a tap swings and aims to the off side (${tp ? Math.round(tp.aim) + '°' : 'no swing'})`);
await pp.waitForFunction(() => KCKGame.bp === 'ready' || KCKGame.screen === 'over', null, { timeout: 15000 });
await tapId('pause');
const tapPause = await smallest();
const hasBuzz = await P(() => KCK.UI.buttons.some(b => b.id === 'buzz'));
await pp.screenshot({ path: `${OUT}/phone-pause.png` });
const minTap = Math.min(tapMenu, tapPlay, tapPause);
rec('phone-tap-targets', minTap >= 32 && hasBuzz, `smallest button ${minTap.toFixed(1)} CSS px (menu ${tapMenu.toFixed(0)}, play ${tapPlay.toFixed(0)}, pause ${tapPause.toFixed(0)}); vibration toggle in pause`);
await tapId('resume');
await pp.setViewportSize({ width: 390, height: 844 });
await pp.waitForTimeout(250);
const up = await P(() => ({ card: getComputedStyle(document.querySelector('.rotate-tip')).display !== 'none', screen: KCKGame.screen }));
await pp.screenshot({ path: `${OUT}/phone-portrait.png` });
rec('phone-portrait', up.card && up.screen === 'paused', `held upright: the turn-sideways card shows and the match pauses (${up.screen})`);
await phone.close();

rec('no-errors', errors.length === 0, `${errors.length} page errors${errors.length ? ': ' + errors[0] : ''}`);
await browser.close(); server.close();
const fail = R.filter(x => !x).length;
console.log(`\n=== ${R.length - fail}/${R.length} passed ===`);
process.exit(fail ? 1 : 0);
