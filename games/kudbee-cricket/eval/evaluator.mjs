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
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(URL); await page.waitForFunction(() => window.KCKGame);

const box = await page.locator('#gameCanvas').boundingBox();
const toPx = (x, y) => [box.x + x * box.width / 960, box.y + y * box.height / 640];
const click = async id => { const b = await page.evaluate(i => { const x = KCK.UI.buttons.find(b => b.id === i); return x && { x: x.x + x.w / 2, y: x.y + x.h / 2 }; }, id); if (!b) return false; await page.mouse.click(...toPx(b.x, b.y)); return true; };
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
rec('no-errors', errors.length === 0, `${errors.length} page errors${errors.length ? ': ' + errors[0] : ''}`);
await browser.close(); server.close();
const fail = R.filter(x => !x).length;
console.log(`\n=== ${R.length - fail}/${R.length} passed ===`);
process.exit(fail ? 1 : 0);
