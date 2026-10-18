// Kudbee Archery — browser rubric (Playwright + Chromium, real pointer/keyboard input).
//   node evaluator.mjs     (serves the repo over local HTTP)
import http from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, extname, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { runApi } from '../../../leaderboard/shared/http.js';
import { createFileStore } from '../../../leaderboard/server/store-file.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'out'); mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.png': 'image/png', '.css': 'text/css', '.mp3': 'audio/mpeg' };
// /api/* is the real leaderboard API (leaderboard/shared, the same code the Worker runs) on a throwaway file store
const LBDIR = mkdtempSync(join(tmpdir(), 'kar-lb-')), lb = createFileStore(join(LBDIR, 'lb.json'));
const server = http.createServer(async (q, s) => {
  if (q.url.startsWith('/api/')) {
    let raw = ''; for await (const c of q) raw += c;
    let body = null; try { body = raw ? JSON.parse(raw) : null; } catch (e) { body = null; }
    const u = new globalThis.URL(q.url, 'http://x'), r = await runApi(lb, {}, { method: q.method, path: u.pathname, query: u.searchParams, headers: q.headers, body });
    s.writeHead(r.status, { 'content-type': 'application/json' }); return s.end(JSON.stringify(r.body));
  }
  let p = join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');   // a folder URL serves its index (as the host does)
  if (!p.startsWith(ROOT) || !existsSync(p)) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); s.end(readFileSync(p));
});
await new Promise(r => server.listen(0, r));
const URL = `http://localhost:${server.address().port}/games/kudbee-archery/index.html`;

const KAR_AIM = ['SLOW', 'NORMAL', 'FAST'];
const R = [];
const rec = (id, pass, note) => { R.push(pass); console.log(pass ? 'PASS' : 'FAIL', id, '—', note); };
// Cloud containers: use the pre-installed Chromium when present (avoids `playwright install`).
const launchOpts = existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {};
const browser = await chromium.launch(launchOpts);
const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
// colour probes vote over a small patch (one readback): a drifting wind leaf or a particle can cross any single
// pixel. __patch(x, y, test) reads a 3x3 grid around stage point (x, y), `step` px apart; ok = 6+ of 9 pass test.
await page.addInitScript(() => { window.KAR_API = null; });      // (the cloud stays off here: the CLOUD checks run in their own phones)
await page.addInitScript(() => {
  window.__patch = (x, y, test, step = 12) => {
    const g = KARGame, R = KAR.Render, r = g.res, cv = g.ctx.canvas;
    const x0 = Math.max(0, Math.round((x - step - R.XL) * r)), y0 = Math.max(0, Math.round((y - step) * r));
    const w = Math.min(cv.width - x0, Math.round(2 * step * r) + 1), h = Math.min(cv.height - y0, Math.round(2 * step * r) + 1);
    if (!(w > 0 && h > 0)) return { ok: false, rgb: 'off-canvas', n: 0 };
    const d = g.ctx.getImageData(x0, y0, w, h).data;
    const px = [];
    for (const dy of [-step, 0, step]) for (const dx of [-step, 0, step]) {
      const ix = Math.min(w - 1, Math.max(0, Math.round((x + dx - R.XL) * r) - x0)), iy = Math.min(h - 1, Math.max(0, Math.round((y + dy) * r) - y0)), i = (iy * w + ix) * 4;
      px.push([d[i], d[i + 1], d[i + 2]]);
    }
    const good = px.filter(test);
    return { ok: good.length >= 6, rgb: good.length >= 6 ? good[0] : px.find(p => !test(p)), n: good.length };
  };
});
await page.goto(URL); await page.waitForFunction(() => window.KARGame);

const box = await page.locator('#gameCanvas').boundingBox();
const toPx = (x, y) => [box.x + x * box.width / 960, box.y + y * box.height / 640];
const click = async id => { const b = await page.evaluate(i => { const x = KAR.UI.buttons.find(b => b.id === i); return x && { x: x.x + x.w / 2, y: x.y + x.h / 2 }; }, id); if (!b) return false; await page.mouse.click(...toPx(b.x, b.y)); return true; };
const G = fn => page.evaluate(fn);
const clickWhen = async id => { await page.waitForFunction(i => KAR.UI.buttons.some(b => b.id === i), id, { timeout: 5000 }).catch(() => {}); return click(id); };
const waitFor = (fn, ms = 20000) => page.waitForFunction(fn, null, { timeout: ms }).then(() => true, () => false);

rec('boots-clean', errors.length === 0 && await G(() => KAR.UI.buttons.length > 0), `menu renders with ${await G(() => KAR.UI.buttons.length)} buttons, ${errors.length} console errors`);
await page.screenshot({ path: `${OUT}/menu.png` });

await click('mode0'); await click('d3'); await click('d2');
rec('settings-persist', await G(() => { const d = JSON.parse(localStorage.getItem('kudbee.archery.v1')); return d.dist === 2 && d.mode === 0; }), '50 m selected and saved');

await click('play');
rec('range-starts', await G(() => KARGame.screen === 'play' && KARGame.match.mode === 'range' && KARGame.match.dist === 50 && KARGame.bp === 'ready'), 'range screen at 50 m, ready to shoot');

// draw with a real press-and-hold, aim with the pointer, check the draw meter rises
await page.mouse.move(...toPx(480, 318)); await page.mouse.down();
await page.waitForTimeout(500);
const d1 = await G(() => KARGame.draw);
await waitFor(() => KARGame.draw >= 1, 3000);
rec('draw-meter', d1 > 0.25 && d1 < 0.9 && await G(() => KARGame.draw >= 1), `drawing climbs (${d1.toFixed(2)} at 0.5 s) to a full draw`);
await page.screenshot({ path: `${OUT}/aim.png` });
// a recurve gets heavier toward the anchor: the draw comes off the brace quickly and slows into full draw
const rate = await G(() => { const g = KARGame, keep = [g.draw, g.holdT]; const step = d => { g.draw = d; g._updateShot(0.05); return g.draw - d; }; const r = [step(0), step(0.9)]; g.draw = keep[0]; g.holdT = keep[1]; return r; });
rec('draw-gets-heavier', rate[0] > rate[1] * 1.6 && rate[1] > 0, `draw speed off the brace ${rate[0].toFixed(3)} vs near anchor ${rate[1].toFixed(3)} per 50 ms`);
// the first-person bow: it follows the sight, and drawing it pulls the string and arrow back toward the eye
const bowPix = await G(() => {
  const c = document.createElement('canvas'); c.width = 960; c.height = 640; const ctx = c.getContext('2d');
  const shot = (sx, d) => { ctx.clearRect(0, 0, 960, 640); KAR.Render.bow(ctx, sx, 300, d, 0, 1, 0, {}); return ctx.getImageData(0, 0, 960, 640).data; };
  const cx = px => { let s = 0, n = 0; for (let i = 3; i < px.length; i += 16) if (px[i] > 0) { s += (i >> 2) % 960; n++; } return n ? s / n : 0; };
  const a = shot(380, 1), b = shot(580, 1), lo = shot(480, 0.3), hi = shot(480, 1);
  let diff = 0; for (let y = 480; y < 640; y++) for (let x = 0; x < 960; x += 2) { const i = (y * 960 + x) * 4 + 3; if ((lo[i] > 0) !== (hi[i] > 0)) diff++; }
  return { shift: cx(b) - cx(a), diff };
});
rec('bow-follows-sight', Math.abs(bowPix.shift - 200) < 25, `moving the sight 200 px moves the bow ${bowPix.shift.toFixed(0)} px`);
rec('bow-draws-back', bowPix.diff > 800, `drawing from 30% to full changes ${bowPix.diff} px of string, arrow and hand below the grip`);

// the sight sways at full draw; holding breath (B) shrinks the sway
const amp = async hold => {
  if (hold) await page.keyboard.down('b');
  let mx = 0; for (let i = 0; i < 25; i++) { await page.waitForTimeout(40); mx = Math.max(mx, await G(() => Math.hypot(KARGame.sway.x, KARGame.sway.y))); }
  if (hold) await page.keyboard.up('b'); return mx;
};
const loose = await amp(false), steady = await amp(true);
rec('breath-steadies', loose > 0.01 && steady < loose * 0.7, `sight sway ${(loose * 100).toFixed(1)} cm free vs ${(steady * 100).toFixed(1)} cm holding breath`);

await page.mouse.up();
rec('loose-flies', await waitFor(() => KARGame.bp === 'flight' || KARGame.bp === 'result', 2000), 'releasing the mouse looses the arrow');
await page.waitForTimeout(250); await page.screenshot({ path: `${OUT}/flight.png` });
await waitFor(() => KARGame.bp === 'result', 8000);
const r1 = await G(() => ({ ring: KARGame.flight.res.ring, total: KARGame.match.total(0), n: KARGame.match.arrows[0].length }));
rec('arrow-scores', r1.n === 1 && r1.total === r1.ring, `arrow 1 scored ${r1.ring}; the scoreboard shows ${r1.total}`);
await page.screenshot({ path: `${OUT}/hit.png` });
await waitFor(() => KARGame.bp === 'ready', 5000);

// a too-short draw does not shoot
await page.mouse.move(...toPx(480, 318)); await page.mouse.down(); await page.waitForTimeout(150); await page.mouse.up();
rec('short-draw-cancels', await G(() => KARGame.bp === 'ready' && KARGame.match.arrows[0].length === 1), 'a quick tap does not loose an arrow');

// keyboard shot: Space draws and releases
await page.keyboard.down(' '); await waitFor(() => KARGame.draw >= 1, 3000); await page.keyboard.up(' ');
rec('keyboard-shot', await waitFor(() => KARGame.match.arrows[0].length === 2, 8000), 'holding and releasing Space shoots');
await waitFor(() => KARGame.bp === 'ready', 8000);

// pause freezes the shot clock
await page.keyboard.press('p');
const t0 = await G(() => KARGame.bpT); await page.waitForTimeout(350);
rec('pause', await G(() => KARGame.screen === 'paused') && await page.evaluate(v => KARGame.bpT === v, t0), 'P pauses and the clock stops');
await page.screenshot({ path: `${OUT}/pause.png` });
await click('resume');
rec('resume', await G(() => KARGame.screen === 'play'), 'resume returns to the range');

// finish: put the range on its very last arrow, shoot it for real
await G(() => { const m = KARGame.match; m.endNo = m.ends - 1; m.arrowNo = m.per - 1; });
await waitFor(() => KARGame.bp === 'ready', 8000);
await page.mouse.move(...toPx(480, 318)); await page.mouse.down(); await waitFor(() => KARGame.draw >= 1, 3000); await page.mouse.up();
rec('range-ends', await waitFor(() => KARGame.screen === 'over', 15000), `the range ends on the results screen (${await G(() => KARGame.match.total(0))} points)`);
await page.screenshot({ path: `${OUT}/over.png` });
rec('best-saved', await G(() => JSON.parse(localStorage.getItem('kudbee.archery.v1')).best[2] === KARGame.match.total(0) && JSON.parse(localStorage.getItem('kudbee.archery.v1')).stats.arrows >= 3), 'best score and arrow count are saved');

// duel: the CPU takes its arrows
await clickWhen('menu'); await page.waitForTimeout(150); await clickWhen('mode1'); await clickWhen('lv1'); await clickWhen('play');
rec('duel-starts', await G(() => KARGame.match.mode === 'duel' && KARGame.screen === 'play'), 'duel vs CPU starts');
await waitFor(() => KARGame.bp === 'ready' && KARGame.match.shooter === 0, 5000);
await page.mouse.move(...toPx(480, 318)); await page.mouse.down(); await waitFor(() => KARGame.draw >= 1, 3000); await page.mouse.up();
rec('cpu-replies', await waitFor(() => KARGame.match.arrows[1].length === 1, 20000), 'after your arrow the CPU draws, aims and shoots one of its own');
await page.screenshot({ path: `${OUT}/duel.png` });

// --- the new layer: correct face, arrow cam, streaks, ROBIN HOOD, last-arrow pressure, focus rules ---
await G(() => { KAR.Store.data.mode = 0; KAR.Store.data.dist = 1; KARGame.startMatch(); });
await waitFor(() => KARGame.bp === 'ready' && KARGame.zoom > 0.98, 5000);
await G(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));   // a frame drawn with the new range's camera
const px = await G(() => {
  const c = document.getElementById('gameCanvas'), x = c.getContext('2d'), R = KAR.Render, m = KARGame.match, d = KARGame.res;
  const at = (dx) => { const q = R.proj(dx, KAR.CFG.FACE_Y, m.dist); return Array.from(x.getImageData(Math.round((q.x - R.XL) * d), Math.round(q.y * d), 1, 1).data); };
  return { mid: at(m.faceD / 2 * 0.15), outer: at(m.faceD / 2 * 0.95) };   // middle of the 9 band; middle of the 1 band
});
rec('face-colours', px.mid[0] > 200 && px.mid[1] > 160 && px.mid[2] < 140 && px.outer[0] > 200 && px.outer[1] > 200 && px.outer[2] > 190, `gold in the middle rgb(${px.mid.slice(0, 3)}), white on the outside rgb(${px.outer.slice(0, 3)})`);
const perfect = () => G(() => { const g = KARGame; g.match.wind = 0; g.drawing = true; g.draw = 1; g.aimX = 0.03; g.aimY = KAR.CFG.FACE_Y; g.sway = { x: 0, y: 0 }; g._loose(); return g.flight && g.flight.hero; });
const hero = await perfect();
const camIn = await waitFor(() => KARGame.camB > 0.95 && KAR.Render.cam.z > KARGame.match.dist * 0.3, 3000);
await page.screenshot({ path: `${OUT}/arrowcam.png` });
rec('arrow-cam', hero && camIn, `a gold shot gets the arrow cam (hero=${hero}); the camera rides down-range behind the arrow`);
await waitFor(() => KARGame.bp === 'result', 8000); await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/arrowcam-hit.png` });
rec('cam-holds-on-hit', await G(() => KARGame.camB > 0.9 && KAR.Render.cam.z > KARGame.match.dist * 0.8), 'the cam holds close on the hit before pulling back');
const swung = await waitFor(() => KARGame.orbit > 0.95 && Math.abs(KAR.Render.cam.yaw) > 0.15 && KARGame.camB > 0.9, 3000);
await page.screenshot({ path: `${OUT}/landing.png` });
rec('landing-replay', swung, `after the hit the camera swings round (yaw ${(await G(() => KAR.Render.cam.yaw * 57.3)).toFixed(0)}°) to show the arrow standing out of the boss`);
const pose = await G(() => {
  const R = KAR.Render, a = R.restDir({ x: 0.02, y: 1.31, vx: 0.1, vy: -3, vz: 58 }), b = R.restDir({ x: 0.02, y: 1.31, vx: 0.1, vy: -3, vz: 58 }), c = R.restDir({ x: -0.07, y: 1.25, vx: 0.1, vy: -3, vz: 58 });
  return { tailUp: a.y < 0 && c.y < 0, stable: a.x === b.x && a.y === b.y, varied: a.x !== c.x, intoFace: a.z > 0.95 };
});
rec('arrow-rest-pose', pose.tailUp && pose.stable && pose.varied && pose.intoFace, `stuck arrows lean tail-up into the face, each its own way, and never flicker (${JSON.stringify(pose)})`);
await waitFor(() => KARGame.bp === 'ready', 8000);
const r2 = await perfect(); await page.keyboard.press(' ');
const skipped = await G(() => KARGame.flight.skip);
await waitFor(() => KARGame.bp === 'result', 8000); await page.waitForTimeout(250);
await page.screenshot({ path: `${OUT}/robin.png` });
const st = await G(() => ({ robin: KARGame.flight.res.robin, banner: KARGame.banner && KARGame.banner.text, streak: KARGame.streak, saved: KAR.Store.data.stats.robins, split: KARGame.match.arrows[0][0].split }));
rec('skip-arrow-cam', r2 && skipped, 'Space during the arrow cam fast-forwards it');
rec('robin-hood', st.robin && st.split && st.banner === 'ROBIN HOOD!' && st.saved >= 1, `the same spot twice splits the first arrow (${st.banner}), counted in stats`);
rec('gold-streak', st.streak === 2, `two golds in a row -> streak ${st.streak}`);
await waitFor(() => KARGame.bp === 'ready', 8000);
const drama = await G(() => { const g = KARGame, m = g.match; KAR.Store.data.best[1] = 200; m.endNo = m.ends - 1; m.arrowNo = m.per - 1; g._nextShot(); return g.drama; });
await page.screenshot({ path: `${OUT}/last-arrow.png` });
rec('last-arrow-line', /^LAST ARROW/.test(drama), `the final arrow shows the pressure line: "${drama}"`);
const focus = await G(() => {
  window.dispatchEvent(new Event('blur')); const afterBlur = KARGame.screen;
  Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange'));
  const afterHide = KARGame.screen;
  Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange'));
  if (KARGame.screen === 'paused') KARGame.togglePause();
  return { afterBlur, afterHide };
});
rec('no-pause-on-blur', focus.afterBlur === 'play', 'screen after a window blur: ' + focus.afterBlur);
rec('hidden-tab-pauses', focus.afterHide === 'paused', 'screen after hiding the tab: ' + focus.afterHide);

// --- BALLOON POP + release feel ---
await G(() => KARGame.activate('menu')); await clickWhen('mode2');
rec('pop-mode-menu', await G(() => KAR.Store.data.mode === 2 && KAR.UI.buttons.some(b => b.id === 'mode2')), 'BALLOON POP is a third mode on the menu');
await clickWhen('play');
rec('pop-starts', await waitFor(() => KARGame.screen === 'play' && KARGame.match.mode === 'trick' && KARGame.match.balloons.length >= 3, 3000), 'balloons drift across the range');
await waitFor(() => KARGame.bp === 'ready', 3000);
const tb0 = await G(() => KARGame.match.T); await page.waitForTimeout(400);
rec('pop-balloons-move', await page.evaluate(v => KARGame.match.T > v + 0.2, tb0), 'the balloon clock runs while you aim');
// a real press-and-hold shot first: the bow kicks away on release
await page.mouse.move(...toPx(480, 300)); await page.mouse.down(); await waitFor(() => KARGame.draw >= 1, 3000); await page.mouse.up();
const rel = await G(() => KARGame.time - KARGame.relT);
await page.waitForTimeout(90); await page.screenshot({ path: `${OUT}/release.png` });
rec('release-kick', rel >= 0 && rel < 0.2, 'releasing starts the bow kick-away animation');
await waitFor(() => KARGame.bp === 'ready', 8000);
const lead = await G(() => {
  const g = KARGame, m = g.match, C = KAR.CFG, D = m.dist, b = m.balloons.find(x => x.popAt === null && Math.abs(m.pos(x, m.T).x) < 3) || m.balloons.find(x => x.popAt === null);
  let t = 0.4; for (let i = 0; i < 4; i++) { const p = m.pos(b, m.T + t), s = KAR.Flight.solve(D, p.x, p.y), r = KAR.Flight.run(D, s.yaw, s.pitch, C.V0, m.wind); t = r.hit.t; }
  const p = m.pos(b, m.T + t), before = m.score; g.drawing = true; g.draw = 1; g.aimX = p.x; g.aimY = p.y; g.sway = { x: 0, y: 0 }; g._loose();
  return { id: b.id, pops: g.flight.res.pops.map(x => x.id), before };
});
await waitFor(() => KARGame.flight && KARGame.flight.popDone, 5000); await page.waitForTimeout(100);
await page.screenshot({ path: `${OUT}/pop.png` });
const popped = await G(() => ({ shown: KARGame.trickShown, score: KARGame.match.score, banner: KARGame.banner && KARGame.banner.text }));
rec('pop-leading-shot', lead.pops.includes(lead.id) && popped.shown === popped.score && popped.score > lead.before && /POP/.test(popped.banner || ''), `leading a balloon pops it on screen (${popped.banner}, score ${popped.score})`);
await G(() => { KARGame.match.quiver = 1; });
await waitFor(() => KARGame.bp === 'ready', 8000);
await G(() => { const g = KARGame; g.drawing = true; g.draw = 1; g.aimX = 0; g.aimY = 5.4; g.sway = { x: 0, y: 0 }; g._loose(); });
rec('pop-out-of-arrows', await waitFor(() => KARGame.screen === 'over', 8000), 'the last arrow ends the round on the results card');
await page.waitForTimeout(600); await page.screenshot({ path: `${OUT}/pop-over.png` });
rec('pop-best-saved', await G(() => JSON.parse(localStorage.getItem('kudbee.archery.v1')).trickBest === KARGame.match.score && KARGame.match.score > 0), 'the BALLOON POP best is saved');

// 70 m is locked on a fresh profile, opens with 6 stars from the shorter distances
await clickWhen('menu');
const lock = await G(() => { const b = KAR.UI.buttons.find(x => x.id === 'd3'); return b && b.disabled; });
await G(() => { KAR.Store.data.mode = 0; });
await page.waitForTimeout(80);
const lock0 = await G(() => { const b = KAR.UI.buttons.find(x => x.id === 'd3'); return !!(b && b.disabled); });
await click('d3'); const still = await G(() => KAR.Store.data.dist !== 3);
await G(() => { KAR.Store.data.stars = [3, 2, 1, 0]; }); await page.waitForTimeout(80); await click('d3');
rec('unlock-70', lock0 && still && await G(() => KAR.Store.data.dist === 3), '70 M is greyed out and won\'t select until 6 stars are earned at 18/30/50');
await G(() => { KAR.Store.data.stars = [0, 0, 0, 0]; KAR.Store.data.dist = 1; });
// SWINGER: the boss swings on its ropes and a leading shot scores
await click('mode3'); await click('play');
rec('swing-starts', await G(() => KARGame.screen === 'play' && KARGame.match.mode === 'swing'), 'SWINGER starts from the menu');
// sample the rendered swing over ~1 s: two samples can match when they straddle a peak (random phase)
const sxs = [];
for (let k = 0; k < 8; k++) { sxs.push(await G(() => KAR.Render.tOff ? KAR.Render.tOff.x : 0)); await page.waitForTimeout(130); }
rec('swing-moves', Math.max(...sxs) - Math.min(...sxs) > 0.05, 'the target swings while you aim');
const lead2 = await G(() => { const g = KARGame, m = g.match, C = KAR.CFG; m.wind = 0; const s = KAR.Flight.solve(m.dist, 0, C.FACE_Y), tf = KAR.Flight.run(m.dist, s.yaw, s.pitch, C.V0, 0).hit.t, o = m.offAt(m.T + tf); g.drawing = true; g.draw = 1; g.aimX = o.x; g.aimY = C.FACE_Y + o.y; g.sway = { x: 0, y: 0 }; g._loose(); return g.flight.res.ring; });
await waitFor(() => KARGame.bp === 'ready', 9000); await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/swing.png` });
rec('swing-lead-scores', lead2 >= 9 && await G(() => KARGame.match.arrows[0][0].hit !== null), `leading the swing scores a ${lead2}, and the arrow rides in the boss`);
// DAILY: today's seed, the share line, today's best kept
await G(() => KARGame.activate('menu')); await page.waitForTimeout(80); await click('mode4'); await click('play');
const dl = await G(() => ({ d: KARGame.match.daily, w: KARGame.match.wind, ok: KARGame.match.daily === KAR.Daily.day() }));
const w2 = await G(() => new KAR.Trick({ seed: KAR.Daily.seed(KAR.Daily.day()), daily: 1 }).wind);
rec('daily-starts', dl.ok && Math.abs(dl.w - w2) < 1e-12, `DAILY #${dl.d} plays today's seed (same wind on any device: ${dl.w.toFixed(3)})`);
await G(() => { KARGame.match.quiver = 1; const g = KARGame; g.drawing = true; g.draw = 1; g.aimX = 0; g.aimY = 5.4; g._loose(); });
await waitFor(() => KARGame.screen === 'over', 9000); await page.waitForTimeout(400);
await clickWhen('share');
const sh = await G(() => ({ t: KARGame.shareText || '', d: JSON.parse(localStorage.getItem('kudbee.archery.v1')).daily }));
rec('daily-share', /Daily #\d+ \(\d{4}-\d\d-\d\d\) · \d+ pts/.test(sh.t) && sh.d.day === dl.d && sh.d.plays === 1, `share line: "${sh.t.split(' · http')[0]}"; today's plays saved`);
await page.screenshot({ path: `${OUT}/daily-over.png` });

// THE TOUR: fresh progress shows level 1 open and the rest locked; a cleared level saves its stars and NEXT LEVEL opens level 2
await G(() => { const D = KAR.Store.data; D.tour.stars.fill(0); D.tour.best.fill(0); D.tourLv = 0; KARGame.activate('menu'); }); await page.waitForTimeout(80);
await click('mode5'); await page.waitForTimeout(80); await click('play'); await page.waitForTimeout(120);
const tiles = await G(() => [KARGame.screen].concat(['L00', 'L01', 'L05'].map(id => { const b = KAR.UI.buttons.find(x => x.id === id); return b ? (b.disabled ? 'locked' : 'open') : 'none'; })));
await page.screenshot({ path: `${OUT}/tour-map.png` });
// the map is a bright cartoon world (blue sky up top, green hills low down), not a dimmed photo
const mapPx = await G(() => { const g = KARGame, c = g.ctx, R = KAR.Render, px = (x, y) => Array.from(c.getImageData(Math.round((x - R.XL) * g.res), Math.round(y * g.res), 1, 1).data); return { sky: px(30, 20), hill: px(330, 600), sun: px(788, 112) }; });
await click('L01'); await page.waitForTimeout(80); const stay = await G(() => KAR.Store.data.tourLv === 0 && KARGame.screen === 'levels');
await click('wnext'); await page.waitForTimeout(80); const wp = await G(() => ({ v: KARGame.worldView, ids: KAR.UI.buttons.filter(b => /^L\d\d$/.test(b.id)).map(b => b.id).join(), boss: KAR.TOUR[11].boss }));
await click('wprev'); await page.waitForTimeout(80);
// (and the cartoon sun is there - the photo range has a blue sky and green grass too, so those alone prove nothing)
const skyOk = mapPx.sky[2] > 150 && mapPx.sky[2] > mapPx.sky[0] + 40, hillOk = mapPx.hill[1] > mapPx.hill[0] && mapPx.hill[1] > mapPx.hill[2], sunOk = mapPx.sun[0] > 190 && mapPx.sun[1] > 160 && mapPx.sun[2] < mapPx.sun[0] - 90;
rec('tour-map', tiles.join() === 'levels,open,locked,locked' && stay && wp.v === 1 && wp.ids === "L06,L07,L08,L09,L10,L11" && wp.boss && skyOk && hillOk && sunOk,
  `PLAY opens the level map (${tiles[0]}) on a cartoon world (sky rgb ${mapPx.sky.slice(0, 3)}, hill rgb ${mapPx.hill.slice(0, 3)}, sun rgb ${mapPx.sun.slice(0, 3)}): on a fresh profile level 1 ${tiles[1]}, 2 ${tiles[2]}, the world 1 boss ${tiles[3]}; a locked tile can't be picked; > pages to world ${wp.v + 1} (${wp.ids}, boss last), stayed ${stay}`);
await click('L00');
const st1 = await G(() => ({ m: KARGame.match.mode, lv: KARGame.match.lv, hint: KARGame.hint }));
// shoot the level clean: a bot with a steady hand that reads the wind exactly
await G(() => { const g = KARGame, m = g.match, rng = KAR.Util.rng(5); g._clear = () => { if (g.bp !== 'ready' || m.over) return; const s = KAR.Bot.shot(m, rng, 0, 0); g.drawing = true; g.draw = 1; g.aimX = s.aimX; g.aimY = s.aimY; g.sway = { x: 0, y: 0 }; g._loose(); if (g.flight) g.flight.skip = true; }; });
for (let i = 0; i < 12 && !(await G(() => KARGame.screen === 'over')); i++) { await waitFor(() => (KARGame.bp === 'ready' && !KARGame.drawing) || KARGame.screen === 'over', 12000); await G(() => KARGame._clear()); await page.waitForTimeout(100); }
await waitFor(() => KARGame.screen === 'over', 12000);
await page.waitForTimeout(700); await page.screenshot({ path: `${OUT}/tour-clear.png` });
const cl = await G(() => ({ n: KARGame.match.arrows[0].length, tot: KARGame.match.total(0), over: KARGame.screen === 'over', st: KARGame.match.stars(), saved: JSON.parse(localStorage.getItem('kudbee.archery.v1')).tour.stars[0], next: KAR.UI.buttons.some(b => b.id === 'next' && !b.disabled), un: KARGame.unlocked }));
rec('tour-clear', st1.m === 'stage' && st1.lv === 0 && /^LEVEL 1/.test(st1.hint) && cl.over && cl.st >= 1 && cl.saved === cl.st && cl.next && cl.un, `level 1 shot clean (${cl.n} arrows, ${cl.tot} points, ${cl.st} stars saved); the card offers NEXT LEVEL and says level 2 is unlocked`);
await click('next');
const st2 = await G(() => ({ lv: KARGame.match.lv, saved: KAR.Store.data.tourLv }));
rec('tour-next', st2.lv === 1 && st2.saved === 1, `NEXT LEVEL starts level ${st2.lv + 1}`);
// the venues: each paints its own scene, and moving levels draw their rail / swing frame
const venues = await G(() => { const out = []; KAR.Store.data.tour.stars.fill(1); for (const lv of [2, 7, 12, 18, 27]) { KAR.Store.data.tourLv = lv; KARGame.startMatch(); KARGame._render(); out.push(KAR.Render.venue + ':' + (KARGame.match.move || '-')); } return out; });
await page.waitForTimeout(300); await page.screenshot({ path: `${OUT}/tour-venue.png` });
rec('tour-venues', venues.join() === '0:slide,1:swing,2:-,3:-,4:slide' && errors.length === 0, `levels 3 / 8 / 13 / 19 / 28 render in venue:move ${venues.join(', ')} with no errors`);
// THINK BOX: the world 5 page is locked until the Village Cup falls (and says so); a shot into the crate wall is BLOCKED,
// scores 0 and stays stuck in the crate (drawn in front of the face); through the window it scores
{
  await G(() => { const D = KAR.Store.data; D.tour.stars.fill(0); D.tour.stars[23] = 2; D.tourLv = 0; KARGame.activate('levels'); KARGame.worldView = 4; }); await page.waitForTimeout(120);
  const shut = await G(() => KAR.UI.buttons.filter(b => /^L2\d$/.test(b.id)).every(b => b.disabled));
  await G(() => { KAR.Store.data.tour.stars[5] = 1; }); await page.waitForTimeout(120);
  const open = await G(() => KAR.UI.buttons.filter(b => /^L2\d$/.test(b.id) && !b.disabled).map(b => b.id).join());
  await page.screenshot({ path: `${OUT}/think-map.png` });
  await click('L24'); await page.waitForFunction(() => KARGame.screen === 'play' && KARGame.match.lv === 24 && KARGame.bp === 'ready', null, { timeout: 8000 }).catch(() => {}); await page.waitForTimeout(150);
  const lv = await G(() => ({ lv: KARGame.match.lv, boxes: KAR.Render.boxes && KAR.Render.boxes.length, hint: KARGame.hint }));
  const wood = await G(() => { const g = KARGame, q = KAR.Render.proj(0.4, 1.0, g.match.dist - KAR.BOXZ); return __patch(q.x, q.y, p => p[0] > p[2] + 60); });   // a crate between the window column (0.12) and the pennant pole (0.55), at eye height (the aim zoom crops the lower crates)

  await waitFor(() => KARGame.bp === 'ready', 8000);
  const b1 = await page.evaluate(([x, y]) => { const g = KARGame; g.match.wind = 0; g.match._gust = () => { g.match.wind = 0; }; g.drawing = true; g.draw = 1; g.aimX = x; g.aimY = y; g.sway = { x: 0, y: 0 }; g._loose(); const r = g.flight.res; return { blocked: r.blocked, ring: r.ring }; }, [0.5, 1.0]);
  await waitFor(() => KARGame.bp === 'result', 8000); await page.waitForTimeout(250);
  const ban = await G(() => KARGame.banner && KARGame.banner.text);
  await page.screenshot({ path: `${OUT}/think-blocked.png` });
  await waitFor(() => KARGame.bp === 'ready', 8000);
  const b2 = await page.evaluate(([x, y]) => { const g = KARGame; g.drawing = true; g.draw = 1; g.aimX = x; g.aimY = y; g.sway = { x: 0, y: 0 }; g._loose(); const r = g.flight.res; return { blocked: !!r.blocked, ring: r.ring }; }, [0, 1.3]);
  await waitFor(() => KARGame.bp === 'ready', 12000);
  const kept = await G(() => { const a = KARGame.match.arrows[0]; return a.length === 2 && a[0].hit && a[0].hit.z === KARGame.match.dist - KAR.BOXZ && a[1].ring >= 9; });

  rec('think-box', shut && open === 'L24' && lv.lv === 24 && lv.boxes >= 4 && /PEEPHOLE/.test(lv.hint) && wood.ok && b1.blocked && b1.ring === 0 && ban === 'BLOCKED!' && !b2.blocked && b2.ring >= 9 && kept && errors.length === 0,
    `THINK BOX stays shut on 2 stars at the world 4 boss and opens off the Village Cup (${open}); PEEPHOLE draws ${lv.boxes} crates (wood rgb ${wood.rgb}, ${wood.n}/9); a shot into the wall reads ${ban} for ${b1.ring} and stays in the crate; through the window it scores ${b2.ring}`);
}
// BITCOIN CITY: the world 6 page stays shut until the Forest Crown falls; its map is a night city (dark violet sky); the
// level paints the neon city and glowing orange chain blocks; the COIN BLOCK cashes in for a 10
{
  await G(() => { const D = KAR.Store.data; D.tour.stars.fill(0); D.tour.stars[5] = 1; D.tourLv = 0; KARGame.activate('levels'); KARGame.worldView = 5; }); await page.waitForTimeout(150);
  const shut = await G(() => KAR.UI.buttons.filter(b => /^L3\d$/.test(b.id)).every(b => b.disabled));
  await G(() => { KAR.Store.data.tour.stars[11] = 1; }); await page.waitForTimeout(150);
  const open = await G(() => KAR.UI.buttons.filter(b => /^L3\d$/.test(b.id) && !b.disabled).map(b => b.id).join());
  const sky = await G(() => __patch(30, 20, p => p[2] > p[1] + 10 && p[0] < 90));
  await page.screenshot({ path: `${OUT}/crypto-map.png` });
  await click('L30'); await page.waitForTimeout(200);
  const lv = await G(() => ({ lv: KARGame.match.lv, venue: KAR.Render.venue, boxes: KAR.Render.boxes && KAR.Render.boxes.length, hint: KARGame.hint }));
  const block = await G(() => { const g = KARGame, R = KAR.Render, q = R.proj(0.75, 1.0, g.match.dist - KAR.BOXZ), d = g.ctx.getImageData(Math.round((q.x - R.XL) * g.res), Math.round(q.y * g.res), 1, 1).data; return [d[0], d[1], d[2]]; });
  await waitFor(() => KARGame.bp === 'ready', 8000);
  const cb = await G(() => { const g = KARGame, m = g.match, b = m.boxes.find(x => x.star); m.wind = 0; m._gust = () => { m.wind = 0; }; g.drawing = true; g.draw = 1; g.aimX = (b.x0 + b.x1) / 2; g.aimY = (b.y0 + b.y1) / 2; g.sway = { x: 0, y: 0 }; g._loose(); const r = g.flight.res; return { star: !!r.star, ring: r.ring }; });
  await waitFor(() => KARGame.bp === 'result', 8000); await page.waitForTimeout(250);
  const ban = await G(() => KARGame.banner && KARGame.banner.text);
  await page.screenshot({ path: `${OUT}/crypto-coin.png` });
  rec('crypto-city', shut && open === 'L30' && sky.ok && lv.lv === 30 && lv.venue === 5 && lv.boxes >= 4 && /GENESIS BLOCK/.test(lv.hint) && block[0] > block[2] && cb.star && cb.ring === 10 && ban === 'COIN BLOCK!' && errors.length === 0,
    `BITCOIN CITY stays shut until the Forest Crown falls, then opens ${open}; the map sky is a night violet (rgb ${sky.rgb}, ${sky.n}/9); GENESIS BLOCK paints venue ${lv.venue} with ${lv.boxes} orange chain blocks (rgb ${block}); the COIN BLOCK reads ${ban} for ${cb.ring}`);
}
// SOLANA BEACH + ALGORAND PEAKS: world 7 opens off the BITCOIN CITY boss and world 8 off the SOLANA boss; the map pages
// to 8/8; ORBIT paints the synthwave beach (a violet sky) with the boss going round its hub; FINALITY paints the ice wall
{
  await G(() => { const D = KAR.Store.data; D.tour.stars.fill(0); D.tour.stars.fill(1, 0, 35); D.tourLv = 0; KARGame.activate('levels'); KARGame.worldView = 6; }); await page.waitForFunction(() => KAR.UI.buttons.some(b => b.id === 'L36'), null, { timeout: 5000 }).catch(() => {});
  const shut7 = await G(() => KAR.UI.buttons.filter(b => /^L(3[6-9]|4[01])$/.test(b.id)).every(b => b.disabled));
  await G(() => { KAR.Store.data.tour.stars[35] = 1; }); await page.waitForFunction(() => KAR.UI.buttons.some(b => b.id === 'L36' && !b.disabled), null, { timeout: 5000 }).catch(() => {});
  const open7 = await G(() => KAR.UI.buttons.filter(b => /^L(3[6-9]|4[01])$/.test(b.id) && !b.disabled).map(b => b.id).join());
  await clickWhen('wnext'); await page.waitForFunction(() => KARGame.worldView === 7 && KAR.UI.buttons.some(b => b.id === 'L42'), null, { timeout: 5000 }).catch(() => {});
  const page8 = await G(() => KARGame.worldView === 7 && KAR.UI.buttons.find(b => b.id === 'wnext').disabled && KAR.UI.buttons.filter(b => /^L4[2-7]$/.test(b.id)).every(b => b.disabled));
  await G(() => { KAR.Store.data.tour.stars.fill(1, 36, 46); }); await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}/algorand-map.png` });
  await clickWhen('wprev'); await page.waitForFunction(() => KARGame.worldView === 6 && KAR.UI.buttons.some(b => b.id === 'L39' && !b.disabled), null, { timeout: 5000 }).catch(() => {});
  await click('L39'); await page.waitForFunction(() => KARGame.screen === 'play' && KARGame.match.lv === 39, null, { timeout: 5000 }).catch(() => {}); await page.waitForTimeout(400);
  const ob = await G(() => ({ lv: KARGame.match.lv, venue: KAR.Render.venue, orbit: KAR.Render.orbitA, xs: Array.from({ length: 24 }, (_, i) => KARGame.match.offAt(i / 24 * 2 * Math.PI / KARGame.match.def.w).x) }));   // one whole loop (2π/w): two samples can straddle its end (random phase)
  const sky = await G(() => __patch(30, 16, p => p[2] > p[1]));
  await page.screenshot({ path: `${OUT}/solana-orbit.png` });
  await G(() => { KARGame.activate('levels'); KARGame.worldView = 7; }); await page.waitForFunction(() => KARGame.screen === 'levels' && KAR.UI.buttons.some(b => b.id === 'L43' && !b.disabled), null, { timeout: 5000 }).catch(() => {});
  await click('L43'); await page.waitForFunction(() => KARGame.screen === 'play' && KARGame.match.lv === 43, null, { timeout: 5000 }).catch(() => {}); await page.waitForTimeout(400);
  const fin = await G(() => ({ lv: KARGame.match.lv, venue: KAR.Render.venue, boxes: KAR.Render.boxes && KAR.Render.boxes.length }));
  // the ice crate's face (KAR.Render.BLOCKS[7]): within 20 of one of its three face colours
  const ice = await G(() => { const g = KARGame, q = KAR.Render.proj(1.0, 0.6, g.match.dist - KAR.BOXZ), F = KAR.Render.BLOCKS[7].face.map(h => [1, 3, 5].map(k => parseInt(h.slice(k, k + 2), 16))); return __patch(q.x, q.y, p => F.some(f => f.every((c, k) => Math.abs(c - p[k]) <= 20))); });
  await page.screenshot({ path: `${OUT}/algorand-finality.png` });
  rec('crypto-worlds', shut7 && open7 === 'L36' && page8 && ob.lv === 39 && ob.venue === 6 && ob.orbit > 0 && Math.max(...ob.xs) - Math.min(...ob.xs) > 0.2 && sky.ok && fin.lv === 43 && fin.venue === 7 && fin.boxes >= 4 && ice.ok && errors.length === 0,
    `SOLANA BEACH opens off the BITCOIN CITY boss (${open7}), the map pages to 8/8 with ALGORAND PEAKS shut; ORBIT paints venue ${ob.venue} (sky rgb ${sky.rgb}, ${sky.n}/9) with the boss circling its hub; FINALITY paints venue ${fin.venue} with ${fin.boxes} ice blocks (rgb ${ice.rgb}, ${ice.n}/9) [shut7 ${shut7} page8 ${page8} lv ${ob.lv} orbit ${ob.orbit} dx ${(Math.max(...ob.xs) - Math.min(...ob.xs)).toFixed(2)} fin ${fin.lv} errors ${errors.length}]`);
}
// THE CUP: pick it from the menu, START CUP by a real click; the HUD names your rival; the tie's results card shows the
// bracket and NEXT ROUND (a real click goes on to the semi-final at the next distance); a cup in progress survives a
// reload; a loss knocks you out (NEW CUP); three wins take it, pay the prize once and open the next cup
{
  await G(() => { const D = KAR.Store.data; D.cup = null; D.cupWon = [0, 0, 0]; D.cupTier = 0; D.gems = 0; KARGame.setScreen('menu'); });
  await clickWhen('mode6'); await page.waitForFunction(() => KAR.Store.data.mode === 6 && KAR.UI.buttons.some(b => b.id === 'cup0'), null, { timeout: 5000 }).catch(() => {});
  const cards = await G(() => ['cup0', 'cup1', 'cup2'].map(id => { const b = KAR.UI.buttons.find(x => x.id === id); return b ? (b.disabled ? 'shut' : 'open') : 'none'; }).join());
  await clickWhen('play'); await page.waitForFunction(() => KARGame.screen === 'play' && KARGame.match.cup && KAR.Store.data.cup, null, { timeout: 5000 }).catch(() => {});
  const st = await G(() => { const m = KARGame.match; return { cup: !!m.cup, name: m.cup && m.cup.name, dist: m.dist, duel: m.mode, hint: KARGame.hint, round: (KAR.Store.data.cup || {}).round }; });
  const playOut = win => page.evaluate(w => { const g = KARGame, m = g.match, r = KAR.Util.rng(77); while (!m.over) { const s = KAR.Bot.shot(m, r, m.shooter ? m.level.sigma : (w ? 0.0004 : 0.02), m.shooter ? m.level.read : (w ? 0.02 : 2)); m.shoot(s.aimX, s.aimY, s.sx, s.sy, 1); } g._finishMatch(); return m.winner; }, win);
  const w1 = await playOut(true); await page.waitForTimeout(500);
  const card = await G(() => ({ next: KAR.UI.buttons.some(b => b.id === 'next'), round: (KAR.Store.data.cup || {}).round, res: KAR.Store.data.cup ? KAR.Store.data.cup.res[0].length : -1 }));
  await page.screenshot({ path: `${OUT}/cup-bracket.png` });
  await click('next'); await page.waitForTimeout(300);
  const semi = await G(() => ({ dist: KARGame.match.dist, round: KARGame.match.cup.round }));
  await page.reload(); await page.waitForFunction(() => window.KARGame); await page.waitForTimeout(200);
  const kept = await G(() => { const c = KAR.Store.data.cup; return c && c.round === 1 && KAR.Store.data.mode === 6; });
  await click('play'); await page.waitForTimeout(300);
  const w2 = await playOut(false); await page.waitForTimeout(300);
  const out = await G(() => ({ out: KAR.Store.data.cup.out, newCup: KAR.UI.buttons.some(b => b.id === 'rematch'), next: KAR.UI.buttons.some(b => b.id === 'next') }));
  await click('rematch'); await page.waitForTimeout(300);
  const fresh = await G(() => KAR.Store.data.cup.round === 0 && !KAR.Store.data.cup.out);
  for (let k = 0; k < 3; k++) { if (k) { await click('next'); await page.waitForTimeout(200); } await playOut(true); await page.waitForTimeout(200); }
  const champ = await G(() => ({ won: KAR.Store.data.cup.won, cupWon: KAR.Store.data.cupWon.join(), gems: KAR.Store.data.gems, gemsWon: KARGame.cupGems }));
  await page.screenshot({ path: `${OUT}/cup-winner.png` });
  await G(() => KARGame.setScreen('menu')); await page.waitForTimeout(100);
  const silver = await G(() => !KAR.UI.buttons.find(b => b.id === 'cup1').disabled);
  rec('cup-flow', cards === 'open,shut,shut' && st.cup && st.duel === 'duel' && st.dist === 18 && /QUARTER-FINAL/.test(st.hint) && w1 === 0 && card.next && card.round === 1 && card.res === 4 && semi.dist === 30 && semi.round === 1 && kept && w2 === 1 && out.out && out.newCup && !out.next && fresh && champ.won && champ.cupWon === '1,0,0' && champ.gems === 40 && silver && errors.length === 0,
    `BRONZE open, SILVER + GOLD shut; START CUP: a ${st.dist} m quarter-final vs ${st.name}; won, the bracket card offers NEXT ROUND → the semi at ${semi.dist} m; the cup survives a reload; a loss knocks you out (NEW CUP); three wins take it: +${champ.gems} gems, SILVER opens`);
}
// the results card around the side world: clearing the Village Cup the first time opens world 2 AND THINK BOX; the
// world 4 boss doesn't offer NEXT into THINK BOX; TOUR COMPLETE only for the win that beats the last boss standing
{
  const card = await G(() => {
    const g = KARGame, D = KAR.Store.data, C = KAR.CFG;
    const win = lv => { D.tourLv = lv; D.mode = 5; g.startMatch(); const m = g.match; m._gust = () => { m.wind = 0; }; while (!m.over) { m.wind = 0; const sv = KAR.Flight.solve(m.dist, 0, C.FACE_Y), tf = KAR.Flight.run(m.dist, sv.yaw, sv.pitch, C.V0, 0).hit.t, o = m.offAt ? m.offAt(m.T + tf) : { x: 0, y: 0 }; m.shoot(o.x, C.FACE_Y + o.y, 0, 0, 1); } g._finishMatch(); g._render(); return { side: g.sideOpen, un: g.unlocked, done: g.tourDone, next: KAR.UI.buttons.some(b => b.id === 'next'), st: m.stars(), scr: g.screen }; };
    D.tour.stars.fill(0); D.tour.stars.fill(1, 0, 5);
    const cup = win(5);                                          // first clear of the world 1 boss
    D.tour.stars.fill(1); D.tour.stars[23] = 0; D.tour.stars[22] = 1;
    const king = win(23);                                        // the last boss standing (THINK BOX already done)
    const replay = win(5);                                       // a boss replay after the tour is done
    return { cup, king, replay };
  });
  rec('think-card', card.cup.side === 4 && card.cup.un && !card.cup.done && card.king.done && !card.king.next && !card.replay.done,
    `Village Cup first clear opens world 2 and THINK BOX (side ${card.cup.side}); the world 4 boss as the last boss standing reads TOUR COMPLETE with no NEXT into THINK BOX; a boss replay after that doesn't (${card.replay.done})`);
  await G(() => { KAR.Store.data.tour.stars.fill(0); KARGame.activate('menu'); });
}
// the first-shot tutorial: level 1 coaches the basics (aim at the gold), then breath; level 2 marks the wind hold-off
const tut1 = await G(() => { const D = KAR.Store.data; D.tut = 0; D.tourLv = 0; D.mode = 5; KARGame.startMatch(); const c = KARGame.coach; return c && { bit: c.bit, mk: !!c.marker, x: c.marker && c.marker.x }; });
await page.waitForTimeout(200); await page.screenshot({ path: `${OUT}/tutorial-1.png` });
await G(() => { const g = KARGame; g.drawing = true; g.draw = 1; g.aimX = 0; g.aimY = KAR.CFG.FACE_Y; g.sway = { x: 0, y: 0 }; g._loose(); });
const tutSaved = await G(() => JSON.parse(localStorage.getItem('kudbee.archery.v1')).tut);
await waitFor(() => KARGame.bp === 'ready', 12000);
const tut2 = await G(() => KARGame.coach && KARGame.coach.bit);
const tutW = await G(() => { const D = KAR.Store.data; D.tour.stars[0] = 1; D.tourLv = 1; KARGame.startMatch(); const g = KARGame, c = g.coach, h = KAR.Bot.hold(g.match); return c && { bit: c.bit, dx: Math.abs(c.marker.x - h.x), off: Math.abs(c.marker.x), wind: Math.abs(g.match.wind) }; });
await page.waitForTimeout(200); await page.screenshot({ path: `${OUT}/tutorial-wind.png` });
const tutHit = await G(() => { const g = KARGame, mk = g.coach.marker; g.drawing = true; g.draw = 1; g.aimX = mk.x; g.aimY = mk.y; g.sway = { x: 0, y: 0 }; g._loose(); return g.flight.res.ring; });
rec('tutorial', tut1 && tut1.bit === 1 && tut1.mk && tut1.x === 0 && (tutSaved & 1) && tut2 === 2 && tutW && tutW.bit === 4 && tutW.dx < 1e-9 && tutW.off > 0.01 && tutHit >= 9,
  `level 1 coaches "aim at the gold" (saved once shot), then breath; level 2 marks the wind hold-off ${(tutW.off * 100).toFixed(1)} cm off the gold in a ${tutW.wind.toFixed(1)} wind - aiming there scores ${tutHit}`);
await waitFor(() => KARGame.bp === 'ready', 12000);
// the GEAR LOCKER: kit opens with stars, equips, and the bow and fletching you see change (the CPU keeps club kit)
await G(() => { const D = KAR.Store.data; D.tour.stars.fill(0); D.stars = [0, 0, 0, 0]; D.gear = { bow: 0, fletch: 0, sight: 0 }; KARGame.activate('menu'); }); await page.waitForTimeout(80);
await click('gear'); await page.waitForTimeout(80);
const g0 = await G(() => ({ scr: KARGame.screen, lockedBow: KAR.UI.buttons.find(b => b.id === 'gb1').disabled }));
await click('gb1'); const stay0 = await G(() => KAR.Store.data.gear.bow === 0);
await G(() => { KAR.Store.data.tour.stars.fill(2, 0, 6); }); await page.waitForTimeout(80);
await click('gb2'); await click('gf2'); await click('gs1'); await page.waitForTimeout(150);
await page.screenshot({ path: `${OUT}/gear.png` });
const g1 = await G(() => { const R = KAR.Render, G = KAR.GEAR, D = KAR.Store.data; return { saved: JSON.parse(localStorage.getItem('kudbee.archery.v1')).gear, mine: R.kit(0).limb === G.bow[2].limb && R.kit(0).v[0] === G.fletch[2].v[0] && R.kit(0).steady === G.sight[1].steady, cpu: R.kit(1).limb === G.bow[0].limb }; });
await click('back');
rec('gear-locker', g0.scr === 'gear' && g0.lockedBow && stay0 && g1.saved.bow === 2 && g1.saved.fletch === 2 && g1.saved.sight === 1 && g1.mine && g1.cpu && await G(() => KARGame.screen === 'menu'),
  `locked kit won't equip at 0 stars; at 12 stars the Royal Blue bow, Lime fletching and Ice sight equip, save, and draw on your bow (the CPU keeps club kit)`);
await G(() => { KAR.Store.data.gear = { bow: 0, fletch: 0, sight: 0 }; });
// TROPHIES: the menu button opens the screen, it pages, and a real first arrow announces FIRST ARROW (saved)
await G(() => { const D = KAR.Store.data; D.ach = {}; for (const k in D.stats) D.stats[k] = 0; KARGame.activate('menu'); }); await page.waitForTimeout(80);
await click('trophies'); await page.waitForTimeout(80);
const tr0 = await G(() => ({ scr: KARGame.screen, cards: KAR.ACH.length }));
await click('tnext'); await page.waitForTimeout(60);
const tr1 = await G(() => KARGame.achPage);
await page.screenshot({ path: `${OUT}/trophies.png` });
await click('back'); await page.waitForTimeout(60);
await G(() => { KAR.Store.data.mode = 0; KARGame.startMatch(); });
await page.waitForFunction(() => KARGame.human(), null, { timeout: 5000 }).catch(() => {});
await G(() => { const g = KARGame; g.drawing = true; g.draw = 1; g._loose(); });
await page.waitForFunction(() => KARGame.achQ && KARGame.achQ.some(q => q.a.id === 'arrow1'), null, { timeout: 8000 }).catch(() => {});
const tr2 = await G(() => ({ toast: !!(KARGame.achQ && KARGame.achQ.some(q => q.a.id === 'arrow1')), saved: (JSON.parse(localStorage.getItem('kudbee.archery.v1')).ach || {}).arrow1 === 1, count: KAR.achCount(KAR.Store.data) }));
await page.screenshot({ path: `${OUT}/trophy-toast.png` });
rec('trophies', tr0.scr === 'trophies' && tr0.cards >= 20 && tr1 === 1 && tr2.toast && tr2.saved && tr2.count >= 1,
  `TROPHIES opens from the menu (${tr0.cards} trophies), pages to ${tr1 + 1}; a real first arrow announces FIRST ARROW and saves it (${tr2.count} won)`);
await G(() => { KARGame.achQ = []; KARGame.activate('menu'); });
// QUESTS + BOWS & ARROWS: a real arrow finishes a quest, CLAIM pays gems, the shop sells + equips kit,
// and only your arrows use it (the CPU and the Daily keep club kit)
await G(() => { const D = KAR.Store.data, day = KAR.Daily.day(); D.gems = 15; D.ownBow = 1; D.ownArrow = 1; D.kit = { bow: 0, arrow: 0 };
  D.quest = { day, q: [{ id: 'arrows', have: 19, claimed: false }, { id: 'tens', have: 0, claimed: false }, { id: 'duel', have: 0, claimed: false }], bonus: false }; KARGame.achQ = []; KAR.Store.data.mode = 0; KARGame.startMatch(); });
await page.waitForFunction(() => KARGame.human(), null, { timeout: 5000 }).catch(() => {});
await G(() => { const g = KARGame; g.drawing = true; g.draw = 1; g._loose(); });
const qd = await G(() => ({ done: KAR.Store.data.quest.q[0].have === 20, card: !!(KARGame.achQ && KARGame.achQ.some(q => q.title === 'QUEST DONE!')) }));
await G(() => KARGame.activate('menu')); await page.waitForTimeout(80);
await click('quests'); await page.waitForTimeout(80);
const qs0 = await G(() => ({ scr: KARGame.screen, dot: KAR.questClaimable(KAR.Store.data) }));
await click('qc0'); await page.waitForTimeout(60);
await page.screenshot({ path: `${OUT}/quests.png` });
const qs1 = await G(() => ({ gems: KAR.Store.data.gems, claimed: KAR.Store.data.quest.q[0].claimed, saved: JSON.parse(localStorage.getItem('kudbee.archery.v1')).gems }));
await click('shop'); await page.waitForTimeout(60);
await click('ka1'); await page.waitForTimeout(60);                // CARBON: 25 gems - shown, not bought yet
const sh0 = await G(() => ({ sel: KARGame.shopSel && KARGame.shopSel.i, gems: KAR.Store.data.gems, own: KAR.kitOwned(KAR.Store.data, 'arrow', 1) }));
await click('kbuy'); await page.waitForTimeout(60);
await page.screenshot({ path: `${OUT}/shop.png` });
const sh1 = await G(() => { const D = KAR.Store.data; KAR.Store.data.mode = 1; KARGame.startMatch(); const g = KARGame, mine = g._kit(0).wind, cpu = g._kit(1).wind; KAR.Store.data.mode = 4; g.startMatch(); const daily = g._kit(0).wind; KAR.Store.data.mode = 0; g.activate('menu');
  return { gems: D.gems, arrow: D.kit.arrow, own: KAR.kitOwned(D, 'arrow', 1), mine, cpu, daily, saved: JSON.parse(localStorage.getItem('kudbee.archery.v1')).kit.arrow }; });
rec('quests-shop', qd.done && qd.card && qs0.scr === 'quests' && qs0.dot && qs1.gems === 25 && qs1.claimed && qs1.saved === 25 && sh0.sel === 1 && sh0.gems === 25 && !sh0.own
  && sh1.gems === 0 && sh1.arrow === 1 && sh1.own && sh1.saved === 1 && sh1.mine === 0.82 && sh1.cpu === 1 && sh1.daily === 1,
  `a real 20th arrow finishes "shoot 20 arrows" (card shown); QUESTS → CLAIM pays 10 gems (15 → ${qs1.gems}, saved); tapping CARBON shows it without buying, BUY spends 25 and equips it (saved); your arrows fly carbon (wind x${sh1.mine}), the CPU and the Daily keep club kit (x${sh1.cpu}, x${sh1.daily})`);
await G(() => { const D = KAR.Store.data; D.gems = 0; D.kit = { bow: 0, arrow: 0 }; D.ownBow = 1; D.ownArrow = 1; D.quest = null; KARGame.achQ = []; });
await G(() => { KAR.Store.data.tour.stars.fill(0); KAR.Store.data.tourLv = 0; KAR.Store.data.mode = 0; KARGame.activate('menu'); });

// THE AGENT: three real arrows aimed dead centre in a strong right wind (no hold-off) → ROBIN's tip card says the wind is
// winning; '/' opens the AGENT screen from pause, Escape goes back; the in-game tips switch saves; /#agent opens it directly
{
  await G(() => { KAR.Store.data.mode = 0; KAR.Store.data.dist = 1; KAR.Store.data.agent = true; KARGame.agentLog = []; KARGame.agentTip = null; KARGame.achQ = []; KARGame.startMatch(); });
  for (let i = 0; i < 3; i++) {
    await page.waitForFunction(() => KARGame.human(), null, { timeout: 9000 }).catch(() => {});
    await G(() => { const g = KARGame, m = g.match; m.wind = 3; g.aimX = 0; g.aimY = KAR.CFG.FACE_Y; g.drawing = true; g.draw = 1; g.holdT = 0.5; g._loose(); g.sway = { x: 0, y: 0 }; });
    await page.waitForFunction(() => KARGame.bp === 'result' || KARGame.screen !== 'play', null, { timeout: 9000 }).catch(() => {});
  }
  const ag0 = await G(() => ({ n: KARGame.agentLog.length, tip: KARGame.agentTip && KARGame.agentTip.id }));
  await page.waitForTimeout(150); await page.screenshot({ path: `${OUT}/agent-tip.png` });
  await page.keyboard.press('p'); await page.keyboard.press('/'); await page.waitForTimeout(100);
  const ag1 = await G(() => ({ scr: KARGame.screen, see: KAR.Agent.read(KARGame.agentLog)[0].id }));
  await page.screenshot({ path: `${OUT}/agent.png` });
  const saved = await G(() => (JSON.parse(localStorage.getItem('kudbee.archery.v1')).agentLog || []).length);
  await click('aq0'); await page.waitForTimeout(60);
  const asked = await G(() => KARGame.agentQ === 0);
  await page.screenshot({ path: `${OUT}/agent-ask.png` });
  await click('aq0'); await page.waitForTimeout(40);
  await click('agentTips'); await page.waitForTimeout(50);
  const off = await G(() => KAR.Store.data.agent === false && JSON.parse(localStorage.getItem('kudbee.archery.v1')).agent === false);
  await click('agentTips'); await page.keyboard.press('Escape'); await page.waitForTimeout(50);
  const back = await G(() => KARGame.screen);
  // the results card carries ROBIN's debrief, and tapping it opens the AGENT
  await G(() => { const g = KARGame; g.match.over = true; g.setScreen('over'); g.overlayT = 3; });
  await page.waitForTimeout(120);
  const deb = await G(() => KAR.UI.buttons.some(b => b.id === 'agent'));
  await page.screenshot({ path: `${OUT}/agent-debrief.png` });
  await click('agent'); await page.waitForTimeout(50);
  const debOpen = await G(() => KARGame.screen === 'agent' && KARGame.agentBack === 'over');
  const hp = await browser.newPage(); await hp.goto(URL + '#agent'); await hp.waitForFunction(() => window.KARGame);
  const hash = await hp.evaluate(() => KARGame.screen); await hp.close();
  rec('agent', ag0.n === 3 && ag0.tip === 'under' && ag1.scr === 'agent' && ag1.see === 'under' && off && back === 'paused' && hash === 'agent' && saved >= 3 && asked && deb && debOpen,
    `3 un-held arrows in a 3-unit wind → ROBIN says "${ag0.tip}"; P then / opens the AGENT (${ag1.scr}), Escape back to ${back}; TIPS OFF saves; /#agent opens on ${hash}; ${saved} arrows remembered in the save; ASK ROBIN answers; the results card's debrief opens the AGENT`);
  await G(() => { KARGame.agentLog = []; KARGame.agentTip = null; KAR.Store.data.mode = 0; KARGame.activate('menu'); });
}

// TEN POLISH ITEMS: the level card (star targets) shows while you get set and goes; PAUSE offers LEVELS on a tour level; a
// finished level pays gems for new stars and plots your group; N / Escape work on the results card; a new end's wind is
// called (switched sides!) and the gauge flashes; the END COMPLETE line gives your pace; reduced motion stills the screen
{
  await G(() => { const D = KAR.Store.data; D.tour.stars.fill(0); D.tour.stars[0] = 1; D.tour.best.fill(0); D.tut = 15; D.tourLv = 1; D.mode = 5; D.gems = 0; KARGame.achQ = []; KARGame.startMatch(); });
  await page.waitForTimeout(700);
  const px = () => G(() => { const g = KARGame, R = KAR.Render; return Array.from(g.ctx.getImageData(Math.round((480 - R.XL) * g.res), Math.round(190 * g.res), 1, 1).data); });
  const c0 = await px(); await page.screenshot({ path: `${OUT}/level-card.png` });
  await page.waitForTimeout(4200); const c1 = await px();
  const card = Math.abs(c0[0] - c1[0]) + Math.abs(c0[1] - c1[1]) + Math.abs(c0[2] - c1[2]) > 60;
  await page.keyboard.press('p'); await page.waitForTimeout(60);
  const pl = await G(() => KAR.UI.buttons.some(b => b.id === 'levels'));
  await click('levels'); await page.waitForTimeout(60);
  const toMap = await G(() => KARGame.screen);
  // shoot level 2 out with a perfect wind-reader, then finish it the game's own way
  const fin = await G(() => { const g = KARGame, D = KAR.Store.data; D.tourLv = 1; g.startMatch(); const m = g.match; while (!m.over) { const h = KAR.Bot.hold(m); m.shoot(h.x, h.y, 0, 0, 1); } g._finishMatch(); g.overlayT = 3; return { st: m.stars(), gems: D.gems, won: g.starGemsWon, saved: JSON.parse(localStorage.getItem('kudbee.archery.v1')).gems }; });
  await page.waitForTimeout(150); await page.screenshot({ path: `${OUT}/results-group.png` });
  await page.keyboard.press('n'); await page.waitForTimeout(60);
  const nx = await G(() => ({ scr: KARGame.screen, lv: KARGame.match.lv }));
  await G(() => { const g = KARGame, m = g.match; while (!m.over) m.shoot(0, 0, 0, 0, 1); g._finishMatch(); g.overlayT = 3; });
  await page.waitForTimeout(120); await page.keyboard.press('Escape'); await page.waitForTimeout(60);
  const esc = await G(() => KARGame.screen);
  // a range: end 2's wind on the other side → the call and the gauge flash; END COMPLETE says how you're doing against your best
  const ws = await G(() => { const D = KAR.Store.data; D.mode = 0; D.dist = 1; D.best[1] = 120; const g = KARGame; g.startMatch(); const m = g.match;
    for (let i = 0; i < 3; i++) { g.drawing = true; g.draw = 1; g.aimX = 0; g.aimY = KAR.CFG.FACE_Y; g.sway = { x: 0, y: 0 }; m.wind = 0; g._loose(); g.flight.t = g.flight.tEnd; g._land(); g.bp = 'ready'; }
    const endHint = g.hint; g.lastBase = -2; m.baseWind = 2; g._nextShot(); return { endHint, hint: g.hint, flash: g.time - g.windT < 0.1, flip: g.windFlip }; });
  await page.waitForTimeout(250); await page.screenshot({ path: `${OUT}/wind-shift.png` });
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForTimeout(60);
  const calm = await G(() => { const g = KARGame, n0 = g.particles.length; g._burst(40); return { calm: g.calm, n: g.particles.length - n0 }; });
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.waitForTimeout(60);
  const loud = await G(() => KARGame.calm);
  rec('polish', card && pl && toMap === 'levels' && fin.st === 3 && fin.won === 15 && fin.gems === 15 && fin.saved === 15 && nx.scr === 'play' && nx.lv === 2 && esc === 'levels'
    && /SWITCHED SIDES/.test(ws.hint) && ws.flash && ws.flip && /END COMPLETE .*(AHEAD OF|BEHIND|LEVEL WITH) YOUR BEST/.test(ws.endHint) && calm.calm && calm.n === 10 && !loud && errors.length === 0,
    `level card drawn then gone (${c0.slice(0, 3)} → ${c1.slice(0, 3)}); pause → LEVELS → ${toMap}; ${fin.st} new stars pay ${fin.won} gems (saved ${fin.saved}); N → ${nx.scr} level ${nx.lv + 1}; Escape → ${esc}; "${ws.hint}"; "${ws.endHint}"; reduced motion: ${calm.n} confetti for 40`);
  await G(() => { const D = KAR.Store.data; D.tour.stars.fill(0); D.tour.best.fill(0); D.tourLv = 0; D.best[1] = 0; D.gems = 0; D.mode = 0; KARGame.activate('menu'); });
}

// SHARING: the page carries a share card (Open Graph + Twitter large image, absolute https URLs) whose image is a real 1200x630
// file in the repo, and the menu's share button shares the game's public (canonical) link
{
  const meta = await G(() => { const q = n => (document.querySelector(`meta[property="${n}"], meta[name="${n}"]`) || {}).content || ''; return { img: q('og:image'), tw: q('twitter:image'), card: q('twitter:card'), title: q('og:title'), desc: q('og:description'), url: q('og:url'), canon: document.querySelector('link[rel=canonical]').href }; });
  const local = meta.img.replace(/^https:\/\/[^/]+/, '').split('?')[0];
  const dims = await page.evaluate(src => new Promise(r => { const im = new Image(); im.onload = () => r([im.naturalWidth, im.naturalHeight]); im.onerror = () => r([0, 0]); im.src = src; }), local);
  await G(() => { KARGame.activate('menu'); }); await page.waitForTimeout(80);
  await click('shareGame'); await page.waitForTimeout(80);
  const st = await G(() => KARGame.shareText || '');
  rec('share-card', /^https:\/\//.test(meta.img) && meta.img === meta.tw && meta.card === 'summary_large_image' && meta.title && /48 levels/.test(meta.desc) && meta.url === meta.canon && dims[0] === 1200 && dims[1] === 630 && st.endsWith(meta.canon),
    `og/twitter image ${meta.img} (${dims.join('x')}), large-image card; SHARE copies "${st.slice(0, 60)}... ${meta.canon}"`);
}

// SHARING MOMENTS: a cleared level / world boss, a won cup round or a trophy makes a 1200x630 brag card from the game's
// own art and opens the SHARE screen (X / Facebook / WhatsApp / copy / save; no game buttons under it). Its link is a
// landing page (s/<slug>/) whose og:image is that moment's card (tools/share-cards.mjs), a real 1200x630 file.
{
  const lp = await page.evaluate(async () => {
    const out = [];
    for (const slug of KAR.Share.SLUGS) {
      const cv = KAR.Share.card(KAR.Share.generic(slug)), px = cv.getContext('2d').getImageData(0, 0, 1200, 630).data;
      let lo = 255, hi = 0; for (let i = 0; i < px.length; i += 4 * 997) { const v = px[i] + px[i + 1] + px[i + 2]; lo = Math.min(lo, v); hi = Math.max(hi, v); }
      const r = await fetch('s/' + slug + '/index.html'), doc = new DOMParser().parseFromString(r.ok ? await r.text() : '', 'text/html');
      const q = n => (doc.querySelector(`meta[property="${n}"], meta[name="${n}"]`) || {}).content || '';
      const img = q('og:image'), local = img.replace(/^https:\/\/[^/]+/, '').split('?')[0];
      const dims = await new Promise(res => { const im = new Image(); im.onload = () => res([im.naturalWidth, im.naturalHeight]); im.onerror = () => res([0, 0]); im.src = local; });
      out.push({ slug, ok: r.ok && cv.width === 1200 && cv.height === 630 && hi - lo > 200 && q('og:url') === KAR.Share.url(slug) && img === q('twitter:image') && local === '/assets/og/archery/' + slug + '.jpg' && q('twitter:card') === 'summary_large_image' && dims[0] === 1200 && dims[1] === 630 });
    }
    return out;
  });
  const bad = lp.filter(x => !x.ok).map(x => x.slug);
  rec('share-pages', lp.length === 14 && !bad.length, `${lp.length} landing pages (worlds, cups, daily, champion, trophy) each with its own 1200x630 card + matching og/twitter tags${bad.length ? '; BAD: ' + bad.join(',') : ''}`);
  const lv = await G(() => {        // PURE STAKE (level 43, world 8): calm and still, so the perfect hold clears it every time
    const D = KAR.Store.data, g = KARGame; D.tut = 15; D.tour.stars.fill(3); D.tourLv = 42; D.mode = 5; g.startMatch(); const m = g.match;
    while (!m.over) { const h = KAR.Bot.hold(m); m.shoot(h.x, h.y, 0, 0, 1); }
    g._finishMatch(); return m.stars();
  });
  await page.waitForTimeout(300); await clickWhen('shareLevel'); await page.waitForTimeout(300);
  const sc = await G(() => ({ s: KARGame.screen, t: KARGame.shareText, ids: KAR.UI.buttons.map(b => b.id), cv: KARGame.shareCv && [KARGame.shareCv.cv.width, KARGame.shareCv.cv.height], x: KAR.Share.intent('x', KARGame.shareCv.mo.text, KARGame.shareCv.url) }));
  await page.screenshot({ path: `${OUT}/share.png` });
  await click('shBack'); await page.waitForTimeout(150);
  const back = await G(() => KARGame.screen);
  const nets = ['shX', 'shFB', 'shWA', 'shCopy', 'shSave', 'shBack'].every(i => sc.ids.includes(i)) && !sc.ids.includes('retry') && !sc.ids.includes('pause');
  rec('share-level', lv >= 1 && sc.s === 'share' && /^I scored \d+ on Level 43 · PURE STAKE ★+ in Kudbee Archery.*\/s\/w8\/$/.test(sc.t) && sc.cv.join('x') === '1200x630' && nets && sc.x.startsWith('https://twitter.com/intent/tweet?text=I%20scored') && back === 'over',
    `level 43 cleared (${lv} stars) -> SHARE screen with a ${sc.cv.join('x')} card, X/FB/WA/copy/save, no game buttons under it; "${sc.t.slice(0, 70)}..."; BACK -> ${back}`);
  await G(() => { KARGame.activate('menu'); KARGame.activate('trophies'); KARGame.activate('tnext'); }); await page.waitForTimeout(200);
  const tid = await G(() => (KAR.UI.buttons.find(b => /^tsh\d+$/.test(b.id)) || {}).id);
  if (tid) { await click(tid); await page.waitForTimeout(200); }
  const tr = await G(() => ({ s: KARGame.screen, t: KARGame.shareText || '' }));
  await G(() => KARGame.activate('shBack')); await page.waitForTimeout(100);
  rec('share-trophy', !!tid && tr.s === 'share' && /^I won the [A-Z ]+ trophy.*\/s\/trophy\/$/.test(tr.t) && await G(() => KARGame.screen) === 'trophies', `a won trophy is a tap target (${tid}) -> "${tr.t.slice(0, 60)}..."; BACK -> trophies`);
  await G(() => KARGame.activate('menu'));
}

// --- a phone: real touch input (CDP touch events, coarse pointer) ---
{
  const tctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const tp = await tctx.newPage(), cdp = await tctx.newCDPSession(tp);
  tp.on('pageerror', e => errors.push(e.message));
  await tp.goto(URL); await tp.waitForFunction(() => window.KARGame);
  const tb = await tp.locator('#gameCanvas').boundingBox(), stage = await tp.evaluate(() => ({ XL: KAR.Render.XL, XW: KAR.Render.XW }));
  const at = (x, y) => ({ x: tb.x + (x - stage.XL) * tb.width / stage.XW, y: tb.y + y * tb.height / 640 });   // the phone's wide stage: x runs XL .. XL + XW
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i })) });
  const T = fn => tp.evaluate(fn);
  await T(() => { KAR.Store.data.mode = 0; });            // a plain range (a fresh profile opens on LEVELS, whose PLAY goes to the map)
  const play = await T(() => { const x = KAR.UI.buttons.find(b => b.id === 'play'); return { x: x.x + x.w / 2, y: x.y + x.h / 2 }; });
  await touch('touchStart', [at(play.x, play.y)]); await touch('touchEnd', []);
  await tp.waitForFunction(() => KARGame.screen === 'play' && KARGame.bp === 'ready', null, { timeout: 5000 });
  // sound: the first touch unlocked the AudioContext; listen to the master output through an analyser
  await T(() => { const a = KARGame.audio; a.setMuted(false); window.__an = a.actx.createAnalyser(); window.__an.fftSize = 2048; a.comp.connect(window.__an);
    window.__rms = () => { const d = new Float32Array(2048); window.__an.getFloatTimeDomainData(d); let s = 0; for (const v of d) s += v * v; return Math.sqrt(s / d.length); }; });
  const lvl = async (ms) => { let m = 0; for (let i = 0; i < ms / 30; i++) { await tp.waitForTimeout(30); m = Math.max(m, await T(() => window.__rms())); } return m; };
  rec('audio-unlocks-on-touch', await T(() => KARGame.audio.actx && KARGame.audio.actx.state === 'running' && !!KARGame.audio.comp), 'the first touch starts the audio engine (compressor on the master)');
  // 1. hold still for a full draw, drag a little, lift: the arrow goes
  const p0 = at(480, 420); await touch('touchStart', [p0]);
  for (let i = 0; i < 6; i++) { await tp.waitForTimeout(60); await touch('touchMove', [{ x: p0.x + i * 0.5, y: p0.y + i }]); }
  const creak = await lvl(300), creaking = await T(() => !!KARGame.audio.creak);
  for (let i = 6; i < 18; i++) { await tp.waitForTimeout(40); await touch('touchMove', [{ x: p0.x + i * 0.5, y: p0.y + i }]); }
  const full = await T(() => KARGame.draw >= 1 && KARGame.drawing);
  await touch('touchEnd', []); await tp.waitForTimeout(20);
  const twang = await lvl(240), stopped = await T(() => !KARGame.audio.creak);
  rec('touch-hold-release', full && await T(() => KARGame.bp === 'flight' || KARGame.bp === 'result'), 'touch & hold draws to full, lifting the finger looses the arrow');
  rec('sound-draw-and-release', creaking && creak > 0.01 && twang > 0.03 && stopped, `audible output: bow creak while drawing (rms ${creak.toFixed(3)}), the twang on release (rms ${twang.toFixed(3)}); the creak stops on the loose`);
  await tp.waitForFunction(() => KARGame.bp === 'ready', null, { timeout: 12000 });
  // 2. the phone cancels the pointer mid-draw (long-press gesture) and never sends pointerup: lifting still looses
  await touch('touchStart', [p0]); await tp.waitForTimeout(1100);
  await T(() => { window.__eatUp = e => e.stopImmediatePropagation(); window.addEventListener('pointerup', window.__eatUp, true);
    KARGame.canvas.dispatchEvent(new PointerEvent('pointercancel', { pointerType: 'touch', bubbles: true })); });
  const kept = await T(() => KARGame.drawing && KARGame.draw >= 1);
  await touch('touchEnd', []); await tp.waitForTimeout(60);
  const went = await T(() => KARGame.bp === 'flight');
  await T(() => window.removeEventListener('pointerup', window.__eatUp, true));
  rec('touch-cancel-still-looses', kept && went, `a touch pointercancel keeps the draw (${kept}); lifting the finger still looses (${went})`);
  // 2b. the phone's wide screen is used edge to edge: more scenery either side, the HUD out at the real edges, no studio link mid-game
  const fill = await T(() => { const c = KARGame.canvas.getBoundingClientRect(), R = KAR.Render, p = KAR.UI.buttons.find(b => b.id === 'pause');
    return { w: c.width, vw: innerWidth, XW: R.XW, right: p.x + p.w, edge: R.XL + R.XW, link: getComputedStyle(document.querySelector('.back-link')).display }; });
  await tp.screenshot({ path: `${OUT}/phone-wide.png` });
  rec('phone-fills-screen', Math.abs(fill.w - fill.vw) < 2 && fill.XW > 1300 && fill.edge - fill.right < 40 && fill.link === 'none',
    `canvas ${fill.w.toFixed(0)} of ${fill.vw} CSS px wide (stage ${fill.XW} wide, was 960), pause button ${(fill.edge - fill.right).toFixed(0)} px from the right edge, studio link hidden in play`);
  // 2c. touch aims like a trackpad: the finger lands anywhere (here bottom-left), the sight starts on the gold and follows the drag at TOUCH_GAIN
  await tp.waitForFunction(() => KARGame.bp === 'ready' && KARGame.human(), null, { timeout: 12000 });
  const f0 = at(-60, 560); await touch('touchStart', [f0]); await tp.waitForTimeout(60);
  const a0 = await T(() => { const g = KARGame, q = KAR.Render.proj(g.aimX, g.aimY, g.match.dist); return { x: q.x, y: q.y, onGold: Math.hypot(g.aimX, g.aimY - KAR.CFG.FACE_Y) < 0.002 }; });
  for (let i = 1; i <= 5; i++) { await touch('touchMove', [{ x: f0.x + i * 10 * tb.width / stage.XW, y: f0.y - i * 6 * tb.height / 640 }]); await tp.waitForTimeout(30); }
  const a1 = await T(() => { const g = KARGame, q = KAR.Render.proj(g.aimX, g.aimY, g.match.dist); return { x: q.x, y: q.y }; });
  const gain = await T(() => KAR.CFG.TOUCH_GAIN), dx = a1.x - a0.x, dy = a1.y - a0.y;
  rec('phone-drag-aim', a0.onGold && Math.abs(dx - 50 * gain) < 3 && Math.abs(dy + 30 * gain) < 3,
    `a touch far from the target leaves the sight on the gold; a 50, -30 px drag moves it ${dx.toFixed(1)}, ${dy.toFixed(1)} (x${gain})`);
  // 2d. while drawing, a second finger holds your breath; lifting it doesn't loose the arrow, lifting the first does
  await tp.waitForFunction(() => KARGame.draw >= 1, null, { timeout: 3000 });
  await touch('touchStart', [{ x: f0.x + 50 * tb.width / stage.XW, y: f0.y - 30 * tb.height / 640 }, at(700, 300)]); await tp.waitForTimeout(60);
  const b1 = await T(() => ({ hold: KARGame.holding, drawing: KARGame.drawing, aim: KARGame.aimX }));
  const lift2 = at(700, 300); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: lift2.x, y: lift2.y, id: 1 }] }); await tp.waitForTimeout(60);   // CDP lifts the points listed: just the second finger
  const b2 = await T(() => ({ hold: KARGame.holding, drawing: KARGame.drawing, bp: KARGame.bp, aim: KARGame.aimX }));
  await touch('touchEnd', []); await tp.waitForTimeout(40);
  const b3 = await T(() => KARGame.bp);
  rec('phone-second-finger-breath', b1.hold && b1.drawing && !b2.hold && b2.drawing && b2.bp === 'ready' && Math.abs(b2.aim - b1.aim) < 1e-6 && b3 === 'flight',
    `second finger down: holding ${b1.hold}; lifted: holding ${b2.hold}, still drawing ${b2.drawing}, aim unmoved; first finger lifted: ${b3}`);
  // 3. no long-press callout / selection on the play area
  rec('touch-no-callout', await T(() => (document.querySelector('style').textContent.match(/-webkit-touch-callout:none/g) || []).length >= 2 && getComputedStyle(document.body).userSelect === 'none'), 'long-press callout and text selection are off');
  // 4. phone layout: the menu buttons and level tiles are big enough to hit (about 40 pt and up), and work by touch
  await T(() => { const D = KAR.Store.data; D.mode = 5; D.tour.stars.fill(0); D.tour.stars[0] = 1; D.tour.stars[5] = 1; KARGame.activate('menu'); }); await tp.waitForTimeout(150);
  const k = tb.height / 640, hs = () => T(() => KAR.UI.buttons.filter(b => /^(mode\d|wprev|wnext|back|L\d\d|play|gear)$/.test(b.id)).map(b => b.h));
  const tap = async id => { const b = await T(new Function('return (' + (i => { const x = KAR.UI.buttons.find(b => b.id === i); return x && { x: x.x + x.w / 2, y: x.y + x.h / 2 }; }) + ')(' + JSON.stringify(id) + ')')); await touch('touchStart', [at(b.x, b.y)]); await touch('touchEnd', []); await tp.waitForTimeout(80); };
  const sizes = await hs(); await tap('play'); const sizes2 = await hs(), onMap = await T(() => KARGame.screen);
  // swipe left across the map: the next world
  const s0 = at(700, 300), s1 = at(380, 310); await touch('touchStart', [s0]); for (let i = 1; i <= 6; i++) { await touch('touchMove', [{ x: s0.x + (s1.x - s0.x) * i / 6, y: s0.y + (s1.y - s0.y) * i / 6 }]); await tp.waitForTimeout(20); } await touch('touchEnd', []); await tp.waitForTimeout(80);
  const tiles = await T(() => KARGame.worldView + ':' + KAR.UI.buttons.filter(b => /^L\d\d$/.test(b.id)).map(b => b.id).join());
  await tp.screenshot({ path: `${OUT}/phone-map.png` });
  await tap('L06'); const pick = await T(() => ({ lv: KAR.Store.data.tourLv, scr: KARGame.screen, m: KARGame.match.lv }));
  const all = sizes.concat(sizes2);
  rec('phone-big-taps', all.length >= 15 && Math.min(...all) * k >= 31 && onMap === 'levels' && tiles === '1:L06,L07,L08,L09,L10,L11' && pick.lv === 6 && pick.scr === 'play' && pick.m === 6,
    `${all.length} menu + map targets, the smallest ${(Math.min(...all) * k).toFixed(0)} CSS px tall; PLAY opens the map, a swipe turns to world 2 (${tiles}), a tap starts level 7`);
  await T(() => KARGame.activate('menu'));
  // 4b. AIM SPEED: pause on a phone offers SLOW / NORMAL / FAST; tapping it steps the touch gain (saved)
  {
    await T(() => { KAR.Store.data.mode = 0; KAR.Store.data.aimSpeed = 1; KARGame.startMatch(); KARGame.togglePause(); });
    await tp.waitForTimeout(80); await tp.screenshot({ path: `${OUT}/phone-pause.png` });
    const ab = await T(() => { const x = KAR.UI.buttons.find(b => b.id === 'aim'); return x && { x: x.x + x.w / 2, y: x.y + x.h / 2 }; });
    if (ab) { await touch('touchStart', [at(ab.x, ab.y)]); await touch('touchEnd', []); await tp.waitForTimeout(60); }
    const as = await T(() => ({ i: KAR.Store.data.aimSpeed, gain: KARGame.aimGain(), saved: JSON.parse(localStorage.getItem('kudbee.archery.v1')).aimSpeed }));
    rec('phone-aim-speed', !!ab && as.i === 2 && as.gain === 0.95 && as.saved === 2, `pause shows AIM SPEED; a tap → ${KAR_AIM[as.i] || as.i} (gain ${as.gain}, saved ${as.saved})`);
    await T(() => { KAR.Store.data.aimSpeed = 1; KAR.Store.save(); KARGame.activate('menu'); });
    // the level card on a phone (screenshot)
    await T(() => { const D = KAR.Store.data; D.tour.stars[0] = 1; D.tourLv = 1; D.tut = 15; D.mode = 5; KARGame.startMatch(); });
    await tp.waitForTimeout(700); await tp.screenshot({ path: `${OUT}/phone-level-card.png` });
    await T(() => { KAR.Store.data.mode = 0; KARGame.activate('menu'); });
  }
  // 5. held upright: a full-screen 'turn sideways' card, and a range in progress pauses under it
  await T(() => { KAR.Store.data.mode = 0; KARGame.startMatch(); });
  await tp.setViewportSize({ width: 390, height: 844 }); await tp.waitForTimeout(250);
  const port = await T(() => ({ card: getComputedStyle(document.querySelector('.rotate-tip')).display, scr: KARGame.screen }));
  await tp.screenshot({ path: `${OUT}/phone-portrait.png` });
  await tp.setViewportSize({ width: 844, height: 390 }); await tp.waitForTimeout(250);
  const land = await T(() => getComputedStyle(document.querySelector('.rotate-tip')).display);
  rec('phone-portrait-card', port.card === 'flex' && port.scr === 'paused' && land === 'none', `upright: card ${port.card}, game ${port.scr}; sideways again: card ${land}`);
  await tctx.close();
}

// --- SOUND: the recorded core loop (one CC0 sprite) and a score you can hear ---
{
  const sc = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const sp = await sc.newPage(); sp.on('pageerror', e => errors.push(e.message));
  await sp.goto(URL); await sp.waitForFunction(() => window.KARGame);
  await sp.tap('canvas', { position: { x: 30, y: 30 } });
  const loaded = await sp.waitForFunction(() => KARGame.audio.sfx || KARGame.audio.sfxFailed, null, { timeout: 10000 }).then(() => sp.evaluate(() => !!KARGame.audio.sfx), () => false);
  // the sprite decodes, and every clip in the map starts on its sound with silence before and after it
  const al = loaded && await sp.evaluate(() => {
    const B = KARGame.audio.sfx, sr = B.sampleRate, d = B.getChannelData(0), bad = [];
    const pk = (a, z) => { let m = 0; for (let i = Math.max(0, a * sr | 0); i < Math.min(d.length, z * sr | 0); i++) m = Math.max(m, Math.abs(d[i])); return m; };
    const C = KAR.SFX.clips, names = Object.keys(C);
    for (const k of names) { const [at, len] = C[k]; if (at + len > B.duration + 0.01 || pk(at - 0.2, at - 0.02) > 0.01 || pk(at + len + 0.03, at + len + 0.2) > 0.01 || pk(at, at + 0.06) < 0.02) bad.push(k); }
    const kinds = ['bow', 'swish', 'hit', 'body', 'creak', 'ooh', 'clap'].filter(n => !C[n + '1']);
    return { n: names.length, dur: B.duration, bad, kinds };
  });
  rec('sfx-sprite', loaded && al.n >= 14 && !al.bad.length && !al.kinds.length,
    `the recorded sprite loads and decodes (${al && al.dur.toFixed(1)} s, ${al && al.n} clips: bow, swish, hit, body, creak, ooh, clap); every clip sits on its sound with silence either side${al && al.bad.length ? ' - off: ' + al.bad.join(', ') : ''}`);
  // the ladder: real shots on FIRST ARROWS (calm, still) aimed to land a 6, a 9, a 10 and an X; listen after each
  await sp.evaluate(() => { const g = KARGame, a = g.audio, D = KAR.Store.data; a.setMuted(false); a.stopMusic(); a.setWind = () => {}; if (a.windBed) a.windBed.g.gain.value = 0;
    D.tut = 15; D.mode = 5; D.tourLv = 0; g.startMatch(); g.hintT = 0;
    const an = a.actx.createAnalyser(); an.fftSize = 2048; a.comp.connect(an);
    window.__rms = () => { const v = new Float32Array(2048); an.getFloatTimeDomainData(v); let s = 0; for (const x of v) s += x * x; return Math.sqrt(s / v.length); };
    window.__calls = []; for (const k of ['thud', 'ooh', 'ten', 'xHit', 'play', 'gold']) { const f = a[k].bind(a); a[k] = (...x) => { const r = f(...x); window.__calls.push(k === 'play' ? 'play:' + x[0] + ':' + !!r : k); return r; }; } });
  const lad = [];
  for (const [want, dy] of [['6', 0.09], ['9', 0.03], ['10', 0.015], ['X', 0.003]]) {
    await sp.waitForFunction(() => KARGame.bp === 'ready' && KARGame.screen === 'play', null, { timeout: 15000 });
    await sp.waitForTimeout(700);                                                   // let the last shot's tail die away
    const r = await sp.evaluate(dy => { window.__calls = []; const g = KARGame, h = KAR.Bot.hold(g.match, KAR.CFG.FACE_Y + dy, g._kit(0)); g.aimX = h.x; g.aimY = h.y; g.holdT = 0; g.sway = { x: 0, y: 0 }; g.drawing = true; g.draw = 1; g._loose(); const f = g.flight.res; return f.x ? 'X' : String(f.ring); }, dy);
    await sp.waitForFunction(() => KARGame.flight && KARGame.flight.done, null, { timeout: 15000 });
    let e = 0; for (let i = 0; i < 30; i++) { await sp.waitForTimeout(40); e += await sp.evaluate(() => window.__rms()); }
    lad.push({ want, got: r, e, calls: await sp.evaluate(() => window.__calls.slice()) });
  }
  const L = Object.fromEntries(lad.map(x => [x.want, x])), has = (w, c) => L[w].calls.includes(c);
  const ladOk = lad.every(x => x.want === x.got && has(x.want, 'thud') && has(x.want, 'play:hit:true')) && has('9', 'ooh') && has('10', 'ten') && has('X', 'xHit') && !has('6', 'ooh') && !has('6', 'ten')
    && L.X.e > L['10'].e && L['10'].e > L['9'].e && L['9'].e > L['6'].e;
  rec('sound-ladder', ladOk, `real shots land ${lad.map(x => x.got).join(' / ')}: each a recorded thwack; the 9 draws the crowd's "ooh", the 10 its bell, the X its own call; heard louder up the ladder (energy over 1.2 s: 6 ${L['6'].e.toFixed(1)}, 9 ${L['9'].e.toFixed(1)}, 10 ${L['10'].e.toFixed(1)}, X ${L.X.e.toFixed(1)})`);
  // the release and the flight are recorded too, the gold streak climbs, and nothing is lost when the sprite can't load
  const rel = await sp.evaluate(() => { window.__calls = []; const a = KARGame.audio; a.loose(); a.fly(0.4); a.drawStart(); a.drawStop(); return window.__calls.slice(); });
  const lift = await sp.evaluate(() => { const a = KARGame.audio; return [1, 2, 3, 4].map(n => a._lift(n)); });
  const fb = await sp.evaluate(async () => { const a = KARGame.audio, keep = a.sfx; a.sfx = null; a.last = {}; const r = []; for (const f of [() => a.loose(), () => a.thud(8), () => a.ooh(), () => a.xHit(1)]) { await new Promise(z => setTimeout(z, 500)); f(); let m = 0; for (let i = 0; i < 6; i++) { await new Promise(z => setTimeout(z, 30)); m = Math.max(m, window.__rms()); } r.push(m); } a.sfx = keep; return r; });
  rec('sound-recorded-loop', ['play:bow:true', 'play:swish:true', 'play:creak:true'].every(c => rel.includes(c)) && lift.every((k, i) => !i || k > lift[i - 1]) && fb.every(v => v > 0.01),
    `the release, the swish and the draw creak play recorded takes; a gold streak lifts the chime (${lift.map(k => k.toFixed(2)).join(' < ')}); with no sprite the synth stands in (rms ${fb.map(v => v.toFixed(3)).join(' / ')})`);
  await sc.close();
}

// --- the app: plays offline, offers to install, helps when you're stuck, and feels like it ---
// OFFLINE: the service worker keeps the game; with the network gone a reload still opens it and a level starts
{
  const oc = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const op = await oc.newPage(); op.on('pageerror', e => errors.push(e.message));
  await op.goto(URL); await op.waitForFunction(() => window.KARGame);
  const ctl = await op.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller && navigator.serviceWorker.controller.state === 'activated', null, { timeout: 15000 }).then(() => true, () => false);
  await op.evaluate(() => caches.keys().then(ks => caches.open(ks.find(k => k.startsWith('kar-')))).then(c => c.keys()).then(k => k.length)).then(n => { op.__kept = n; });      // (whichever kar-vN sw.js keeps now)
  await oc.setOffline(true);
  const res = await op.reload().catch(() => null);
  const up = await op.waitForFunction(() => window.KARGame && document.fonts.check('24px "Lilita One"'), null, { timeout: 8000 }).then(() => true, () => false);
  const lv = up && await op.evaluate(async () => { const D = KAR.Store.data; D.tut = 15; D.mode = 5; D.tourLv = 0; KARGame.startMatch(); await new Promise(r => setTimeout(r, 300)); return { scr: KARGame.screen, lv: KARGame.match.lv, on: navigator.onLine, bg: [...document.images].length }; });
  const snd = up && await op.evaluate(async () => { const a = KARGame.audio; a.ensure(); for (let i = 0; i < 50 && !a.sfx && !a.sfxFailed; i++) await new Promise(r => setTimeout(r, 100)); return !!a.sfx; });
  await op.screenshot({ path: `${OUT}/offline-play.png` });
  rec('offline-play', ctl && op.__kept >= 20 && !!res && res.fromServiceWorker() && up && lv.scr === 'play' && lv.lv === 0 && lv.on === false && snd,
    `the service worker keeps ${op.__kept} files; offline (navigator.onLine ${lv && lv.on}) a reload is served by it (${res && res.fromServiceWorker()}), the font loads, LEVEL 1 starts (${lv && lv.scr}) and the recorded sounds still load (${snd})`);
  await oc.close();
}
// INSTALL: phones, from the second visit. Android: the browser's own prompt, kept and fired from the menu's button.
// iPhone: the button opens a card showing Share -> Add to Home Screen; GOT IT puts it away for good
{
  const ic = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const ip = await ic.newPage(), cdp = await ic.newCDPSession(ip); ip.on('pageerror', e => errors.push(e.message));
  const I = fn => ip.evaluate(fn);
  const tapId = async id => { const b = await I(`(() => { const x = KAR.UI.buttons.find(b => b.id === ${JSON.stringify(id)}); return x && { x: x.x + x.w / 2, y: x.y + x.h / 2 }; })()`); if (!b) return false;
    const tb = await ip.locator('#gameCanvas').boundingBox(), st = await I(() => ({ XL: KAR.Render.XL, XW: KAR.Render.XW })), p = { x: tb.x + (b.x - st.XL) * tb.width / st.XW, y: tb.y + b.y * tb.height / 640, id: 0 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); return true; };
  const fakeBip = () => { const e = new Event('beforeinstallprompt', { cancelable: true }); e.prompt = () => { window.__prompted = (window.__prompted || 0) + 1; }; e.userChoice = Promise.resolve({ outcome: 'accepted' }); window.dispatchEvent(e); };
  await ip.goto(URL); await ip.waitForFunction(() => window.KARGame);
  await I(fakeBip); await ip.waitForTimeout(150);
  const first = await I(() => ({ v: KAR.Store.data.visits, btn: KAR.UI.buttons.some(b => b.id === 'install') }));
  await ip.reload(); await ip.waitForFunction(() => window.KARGame);
  await I(fakeBip); await ip.waitForTimeout(150);
  const second = await I(() => ({ v: KAR.Store.data.visits, btn: KAR.UI.buttons.some(b => b.id === 'install') }));
  await ip.screenshot({ path: `${OUT}/install-button.png` });
  await tapId('install'); await ip.waitForTimeout(150);
  const after = await I(() => ({ prompted: window.__prompted, inst: KAR.Store.data.install, btn: KAR.UI.buttons.some(b => b.id === 'install') }));
  rec('install-button', first.v === 1 && !first.btn && second.v === 2 && second.btn && after.prompted === 1 && after.inst === 1 && !after.btn,
    `first visit: no button; second visit: INSTALL on the menu (${second.btn}); a tap fires the browser's install prompt (${after.prompted}) and the button goes once answered (${!after.btn})`);
  // iPhone Safari: no prompt event, so the card
  await I(() => { KAR.Store.data.install = 0; KARGame.ios = true; KARGame.bip = null; });
  await ip.waitForTimeout(120); await tapId('install'); await ip.waitForTimeout(250);
  const card = await I(() => ({ scr: KARGame.screen, ok: KAR.UI.buttons.some(b => b.id === 'instOk'), not: KAR.UI.buttons.some(b => b.id === 'instBack') }));
  await ip.screenshot({ path: `${OUT}/install-ios-card.png` });
  await tapId('instOk'); await ip.waitForTimeout(150);
  const gone = await I(() => ({ scr: KARGame.screen, inst: KAR.Store.data.install, btn: KAR.UI.buttons.some(b => b.id === 'install'), saved: JSON.parse(localStorage.getItem('kudbee.archery.v1')).install }));
  rec('install-ios-card', card.scr === 'install' && card.ok && card.not && gone.scr === 'menu' && gone.inst === 1 && gone.saved === 1 && !gone.btn,
    `iPhone: INSTALL opens the Share -> Add to Home Screen card (${card.scr}); GOT IT goes back to the menu and the button stays gone (saved ${gone.saved})`);
  await ic.close();
}
// AIM HELP: two failed tries at a still level (never cleared) and the first arrow of each end shows where to aim for
// this wind and your kit; an arrow loosed on the marker scores gold; a clear puts it away; movers never get it
{
  await G(() => { const D = KAR.Store.data, T = D.tour; D.tut = 15; D.mode = 5; T.stars.fill(0); T.stars[0] = 1; T.fails.fill(0); D.tourLv = 1; KARGame.startMatch(); });
  const off = await G(() => !KARGame.aid);
  for (let i = 0; i < 2; i++) await G(() => { KARGame.startMatch(); KARGame._finishMatch(); });      // two tries that score nothing
  const card = await G(() => ({ fails: KAR.Store.data.tour.fails[1], next: KARGame.aidNext, scr: KARGame.screen }));
  await page.waitForTimeout(700); await page.screenshot({ path: `${OUT}/aim-help-card.png` });
  await G(() => KARGame.startMatch());
  await waitFor(() => KARGame.screen === 'play' && KARGame.bp === 'ready', 5000);
  const on = await G(() => ({ aid: !!KARGame.aid, hint: KARGame.hint }));
  await page.waitForTimeout(250); await page.screenshot({ path: `${OUT}/aim-help-marker.png` });
  const shot = await G(() => { const g = KARGame, a = g._aidMark(), kit = g._kit(0), h = KAR.Bot.hold(g.match, undefined, kit); g.aimX = a.x; g.aimY = a.y; g.drawing = true; g.draw = 1; g.holdT = 0; g.sway = { x: 0, y: 0 }; g._loose(); return { x: a.x, hx: h.x, ring: g.flight && g.flight.res.ring, aidAfter: !!g.aid }; });
  await waitFor(() => KARGame.bp === 'ready' && KARGame.match.arrowNo === 1, 15000);
  const second = await G(() => !KARGame.aid);
  const won = await G(() => { const g = KARGame; g.match.stars = () => 1; g._finishMatch(); return KAR.Store.data.tour.fails[1]; });
  const mover = await G(() => { const D = KAR.Store.data, T = D.tour; T.fails[2] = 5; T.stars[2] = 0; T.stars[1] = 1; D.tourLv = 2; KARGame.startMatch(); return { lv: KARGame.match.lv, mv: !!KARGame.match.offAt, aid: !!KARGame.aid }; });
  rec('aim-help', off && card.fails === 2 && card.next && card.scr === 'over' && on.aid && /^AIM HELP IS ON/.test(on.hint) && shot.ring >= 9 && !shot.aidAfter && second && won === 0,
    `off at first; 2 failed tries -> the results card says AIM HELP IS ON (${card.next}); the next try marks the hold-off (${shot.x.toFixed(3)} m) and an arrow loosed on it scores ${shot.ring}; arrow 2 of the end has no marker (${second}); a clear resets the count (${won})`);
  rec('aim-help-still-only', mover.lv === 2 && mover.mv && !mover.aid, `a moving target (L${mover.lv + 1}) never gets the marker, even after ${5} fails`);
  await G(() => { const T = KAR.Store.data.tour; T.fails.fill(0); T.stars.fill(0); KAR.Store.data.tourLv = 0; KARGame.activate('menu'); });
}
// FEEL: the limbs tick (a third, two thirds, full); a gold lands with a hit-stop under a white flash; the results stars
// land one by one with rising chimes; every world plays its own tune
{
  await G(() => { const D = KAR.Store.data; D.tut = 15; D.mode = 5; D.tourLv = 0; KARGame.__bz = []; KARGame.buzz = p => KARGame.__bz.push(p); KARGame.startMatch(); });
  await waitFor(() => KARGame.screen === 'play' && KARGame.bp === 'ready', 5000);
  await G(() => { KARGame.achQ = []; KARGame.__bz = []; KARGame._beginDraw(); });      // (record from the draw on, with no trophy card queued: its drop-in buzzes too)
  await waitFor(() => KARGame.draw >= 1, 5000);
  const ticks = await G(() => KARGame.__bz.slice());
  await G(() => { const g = KARGame, h = KAR.Bot.hold(g.match, undefined, g._kit(0)); g.aimX = h.x; g.aimY = h.y; g.holdT = 0; g.sway = { x: 0, y: 0 }; g._loose(); });
  const hs = await page.waitForFunction(() => KARGame.flash && { a: KARGame.flash.a, f: KARGame.freeze, ring: KARGame.flight.res.ring }, null, { timeout: 15000 }).then(h => h.jsonValue(), () => null);
  await page.screenshot({ path: `${OUT}/feel-hit-flash.png` });
  rec('feel-draw-ticks', JSON.stringify(ticks) === '[5,5,12]', `vibration through the draw: ${JSON.stringify(ticks)} (a tick at a third and two thirds, a firmer one at full draw)`);
  rec('feel-hit-stop', !!hs && hs.ring === 10 && hs.f > 0 && hs.a >= 0.32, `a gold (${hs && hs.ring}) holds the world for ${hs && Math.round(hs.f * 1000)} ms under a white flash (${hs && hs.a})`);
  await waitFor(() => KARGame.bp === 'ready' || KARGame.screen === 'over', 15000);
  await G(() => { const g = KARGame; delete g.buzz; g.__stars = []; g.audio.star = n => g.__stars.push(n); g.match.stars = () => 3; g._finishMatch(); });
  await waitFor(() => KARGame.overlayT > 1.5, 5000);
  const chimes = await G(() => { const s = KARGame.__stars.slice(); delete KARGame.audio.star; return s; });
  rec('feel-star-chimes', JSON.stringify(chimes) === '[1,2,3]', `the 3 results stars land one at a time, each with a higher chime: ${JSON.stringify(chimes)}`);
  const tunes = await G(async () => {
    const g = KARGame, D = KAR.Store.data, T = KAR.Audio.THEMES, fr = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    g.activate('levels'); g.worldView = 5; await fr(); const map = g.audio.theme;
    D.tour.stars.fill(1); D.tourLv = KAR.TOUR.findIndex(L => L.v === 6); g.startMatch(); await fr(); const play = [g.match.venue, g.audio.theme];
    D.tour.stars.fill(0); D.tourLv = 0; g.activate('menu'); await fr();
    return { n: T.length, distinct: new Set(T.map(t => t.bpm + ':' + JSON.stringify(t.chords))).size, map, play, menu: g.audio.theme };
  });
  rec('world-music', tunes.n === 8 && tunes.distinct === 8 && tunes.map === 5 && tunes.play[0] === 6 && tunes.play[1] === 6 && tunes.menu === 0,
    `${tunes.n} world tunes (${tunes.distinct} different); the map plays the world on its page (${tunes.map}), a level its world's (${tunes.play[1]}), the menu the village green (${tunes.menu})`);
}

// CLOUD SAVE: progress follows the player. Phone A finishes a round -> a backup code is made and the save goes up;
// phone B (its own progress) types A's code (any case, spaces) -> both progresses merge; A picks up B's level;
// the league ranks them. Then a write that lost a race to another device merges and goes again, and with no
// network the game carries on (saved on the phone) and says so.
{
  const phone = async api => {
    const c = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const p = await c.newPage(); p.on('pageerror', e => errors.push(e.message));
    await p.addInitScript(a => { window.KAR_API = a; }, api);
    await p.goto(URL); await p.waitForFunction(() => window.KARGame);
    return { c, p, E: (fn, arg) => p.evaluate(fn, arg) };
  };
  // finish level `lv` with `st` stars (the round itself is the game's; the score is set)
  const finish = (ph, lv, st) => ph.p.evaluate(([lv, st]) => { const D = KAR.Store.data; D.tut = 15; D.mode = 5; D.tour.stars[0] = Math.max(D.tour.stars[0], lv > 0 ? 1 : 0); D.tourLv = lv; KARGame.startMatch(); KARGame.match.stars = () => st; KARGame._finishMatch(); KAR.Cloud.soon(); }, [lv, st]);
  const synced = ph => ph.p.waitForFunction(() => KAR.Cloud.state === 'ok' && !KAR.Cloud.busy, null, { timeout: 10000 }).then(() => true, () => false);
  const A = await phone('');
  const before = await A.E(() => ({ code: KAR.Cloud.meta.code, btn: KAR.UI.buttons.some(b => b.id === 'cloud') }));
  await finish(A, 0, 3); const aUp = await synced(A);
  const a1 = await A.E(() => ({ code: KAR.Cloud.meta.code, pretty: KAR.Cloud.pretty(KAR.Cloud.meta.code), rev: KAR.Cloud.meta.rev, name: KAR.Cloud.meta.name }));
  const B = await phone('');
  await finish(B, 0, 1); await synced(B); await finish(B, 1, 2); await synced(B);
  const bOwn = await B.E(() => KAR.Cloud.meta.code);
  // B types A's code into the box (lower case, spaces instead of dashes)
  await B.E(c => { window.prompt = () => c; KARGame.activate('cloud'); }, a1.pretty.toLowerCase().replace(/-/g, ' '));
  await B.p.waitForTimeout(300); await B.E(() => KARGame.activate('clUse'));
  await B.p.waitForFunction(() => KARGame.clMsg && KAR.Cloud.state === 'ok' && !KAR.Cloud.busy, null, { timeout: 10000 }).catch(() => {});
  const b1 = await B.E(() => ({ code: KAR.Cloud.meta.code, msg: KARGame.clMsg && KARGame.clMsg.t, s: KAR.Store.data.tour.stars.slice(0, 3) }));
  await B.p.waitForTimeout(200); await B.p.screenshot({ path: `${OUT}/cloud-phone-b.png` });
  // A opens CLOUD SAVE (a sync): B's level 2 arrives
  await A.E(() => KARGame.activate('cloud')); await A.p.waitForTimeout(150); await synced(A);
  const a2 = await A.E(() => ({ s: KAR.Store.data.tour.stars.slice(0, 3), board: KAR.Cloud.board, saved: JSON.parse(localStorage.getItem('kudbee.archery.v1')).tour.stars.slice(0, 2) }));
  await A.p.waitForTimeout(200); await A.p.screenshot({ path: `${OUT}/cloud-phone-a.png` });
  const top = a2.board && a2.board.entries[0];
  rec('cloud-sync', !before.code && before.btn && aUp && /^KDB(-[0-9A-HJKMNP-TV-Z]{4}){4}$/.test(a1.pretty) && a1.rev >= 1 && /^ARCHER [0-9A-F]{4}$/.test(a1.name)
    && bOwn && bOwn !== a1.code && b1.code === a1.code && /WELCOME BACK/.test(b1.msg) && b1.s.join() === '3,2,0' && a2.s.join() === '3,2,0' && a2.saved.join() === '3,2'
    && !!top && top.you && top.value === 5 && a2.board.total === 2,
    `no code until a round is finished, then ${a1.pretty.slice(0, 8)}… (${a1.name}) syncs; phone B types it in lower case with spaces -> "${b1.msg}", its own level 2 merged with A's level 1 (${b1.s.join('/')}); A picks up B's level (${a2.s.join('/')}, saved); the league: ${top && top.name} first with ★${top && top.value} of ${a2.board && a2.board.total}`);
  // a write that lost a race: another device writes between this phone's read and its write -> refused, merged, written again
  const race = await A.E(async () => {
    const C = KAR.Cloud, orig = C._req.bind(C); let once = true;
    C._req = async (m, p, b) => {
      if (once && m === 'POST' && p === '/api/save') { once = false; const other = JSON.parse(JSON.stringify(b.data)); other.tour.stars[2] = 1; other.gems = 777; await orig('POST', '/api/save', { game: 'archery', rev: b.rev, data: other }); }
      const r = await orig(m, p, b); log.push(m + ' ' + p.split('?')[0] + ' ' + r.status + ' ' + (b && b.rev !== undefined ? b.rev : '') + '>' + (r.body.rev !== undefined ? r.body.rev : r.body.save ? r.body.save.rev : '')); return r;
    };
    const log = [], rev0 = C.meta.rev, ok = await C.sync(); C._req = orig;
    return { ok, rev0, rev: C.meta.rev, s: KAR.Store.data.tour.stars.slice(0, 3), gems: KAR.Store.data.gems, log };
  });
  const R0 = race.log[0] && +race.log[0].split('>')[1], want = [`GET /api/save 200 >${R0}`, `POST /api/save 409 ${R0}>${R0 + 1}`, `POST /api/save 200 ${R0 + 1}>${R0 + 2}`];
  rec('cloud-conflict', race.ok && want.every((w, i) => race.log[i] === w) && race.rev === R0 + 2 && race.s.join() === '3,2,1' && race.gems === 777,
    `read rev ${R0}; another phone wrote first (-> ${R0 + 1}): this phone's write is refused, merged with it (level 3 ★${race.s[2]}, gems ${race.gems}) and written as rev ${race.rev} [${race.log.slice(0, 3).join(' | ')}]`);
  await A.c.close(); await B.c.close();
  // no network / no Worker yet: nothing breaks, the save stays on the phone, the screen says so
  const N = await phone('http://127.0.0.1:9');
  await finish(N, 0, 2);
  await N.p.waitForFunction(() => KAR.Cloud.state === 'offline', null, { timeout: 10000 }).catch(() => {});
  await N.E(() => KARGame.activate('cloud')); await N.p.waitForTimeout(400);
  const n1 = await N.E(() => ({ st: KAR.Cloud.state, code: !!KAR.Cloud.meta.code, saved: JSON.parse(localStorage.getItem('kudbee.archery.v1')).tour.stars[0], scr: KARGame.screen }));
  await N.p.screenshot({ path: `${OUT}/cloud-offline.png` });
  rec('cloud-offline', n1.st === 'offline' && n1.code && n1.saved === 2 && n1.scr === 'cloud', `no cloud to reach: the round is saved on the phone (★${n1.saved}), the code is still made, CLOUD SAVE says ${n1.st}`);
  await N.c.close();
}

// GHOST CHALLENGES: the challenger clears a level and taps CHALLENGE -> a link. A friend on a phone (fresh: the level
// isn't open for them) opens it -> the invite card -> ACCEPT -> the same level on the same seed, so the same wind for
// every arrow; the challenger's arrows land beside theirs and the HUD keeps both scores. The results say who won, a
// practice round saves nothing to the map, CHALLENGE BACK makes their own link, REMATCH plays the ghost again, and a
// doctored link is just ignored.
{
  const made = await G(() => {
    const g = KARGame, D = KAR.Store.data, lv = KAR.TOUR.findIndex((L, i) => i > 2 && !L.move && !L.boxes);
    D.tut = 15; D.mode = 5; D.tourLv = lv; D.tour.stars[lv - 1] = Math.max(1, D.tour.stars[lv - 1]); g.chal = null;
    g.startMatch(); const m = g.match, winds = [], k = g._kit(0);
    while (!m.over) { winds.push(m.wind); const h = KAR.Bot.hold(m, undefined, k); m.shoot(h.x, h.y, 0, 0, 1, k); }
    g._finishMatch();
    return { lv, seed: m.seed, total: m.total(0), rings: m.arrows[0].map(a => a.ring), winds };
  });
  const tapped = await clickWhen('shareChallenge');
  const link = await G(() => { const sh = KARGame.shareCv; return sh && { url: sh.url, kind: sh.kind, text: KARGame.shareText, w: sh.cv.width, h: sh.cv.height }; });
  const code = link && new globalThis.URL(link.url).searchParams.get('c');
  rec('ghost-made', tapped && !!code && link.url.startsWith('https://devbiz.kudbee.workers.dev/games/kudbee-archery/?c=') && /^Beat my \d+ on Level \d+/.test(link.text) && link.w === 1200 && link.h === 630,
    `CHALLENGE on the results card (level ${made.lv + 1}, ${made.total} pts) -> a ${code ? code.length : 0}-char link to the game with the ghost in ?c=, a 1200x630 card and "${link && link.text.slice(0, 48)}…"`);
  await G(() => KARGame.activate('shBack'));

  const fc = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await fc.addInitScript(() => { window.KAR_API = null; });
  const fp = await fc.newPage(); fp.on('pageerror', e => errors.push(e.message)); fp.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const F = fn => fp.evaluate(fn);
  const fbox = async () => fp.locator('#gameCanvas').boundingBox();
  const ftap = async id => {
    await fp.waitForFunction(i => KAR.UI.buttons.some(b => b.id === i), id, { timeout: 5000 }).catch(() => {});
    const b = await fp.evaluate(i => { const x = KAR.UI.buttons.find(b => b.id === i), R = KAR.Render; return x && { x: x.x + x.w / 2 - R.XL, y: x.y + x.h / 2, XW: R.XW }; }, id), bx = await fbox();
    if (!b) return false; await fp.touchscreen.tap(bx.x + b.x * bx.width / b.XW, bx.y + b.y * bx.height / 640); return true;
  };
  await fp.goto(URL + '?c=' + code); await fp.waitForFunction(() => window.KARGame);
  await fp.waitForTimeout(300);
  const inv = await F(() => ({ scr: KARGame.screen, lv: KARGame.invite && KARGame.invite.lv, total: KARGame.invite && KARGame.invite.total, name: KARGame.invite && KARGame.invite.name, q: location.search, open: KAR.tourOpen(KARGame.invite ? KARGame.invite.lv : 0, KAR.Store.data) }));
  await fp.screenshot({ path: `${OUT}/ghost-invite.png` });
  rec('ghost-invite', inv.scr === 'challenge' && inv.lv === made.lv && inv.total === made.total && inv.q === '' && inv.open === false,
    `the friend's phone opens the link on the invite: ${inv.name} scored ${inv.total} on level ${inv.lv + 1} (not open for them: practice); the code is gone from the address bar (${JSON.stringify(inv.q)})`);

  await ftap('chGo');
  await fp.waitForFunction(() => KARGame.screen === 'play' && KARGame.bp === 'ready', null, { timeout: 5000 }).catch(() => {});
  const start = await F(() => { const m = KARGame.match; return { lv: m.lv, seed: m.seed, gh: !!m.ghost, counts: m.counts, hint: KARGame.hint }; });
  // real arrows through the game (a little off the hold point, so the friend's shots differ), ghosts landing; the
  // reading is taken after two, while the first end is still up (the third closes it and the face is cleared for end 2)
  const fw = [], loose = async i => {
    fw.push(await F(() => { const g = KARGame, m = g.match, h = KAR.Bot.hold(m, undefined, g._kit(0)); g.aimX = h.x + 0.06; g.aimY = h.y; g.drawing = true; g.draw = 1; g.holdT = 0; g.sway = { x: 0, y: 0 }; const w = m.wind; g._loose(); return w; }));
    await fp.waitForFunction(n => KARGame.bp === 'ready' && KARGame.match.arrows[0].length === n, i + 1, { timeout: 15000 }).catch(() => {});
  };
  await loose(0); await loose(1);
  const mid = await F(() => { const g = KARGame, gh = g.match.ghost; return { n: g.ghostN(), so: KAR.Ghost.soFar(gh, g.ghostN()), mine: g.match.total(0), shown: gh.arrows.filter((a, i) => i < g.ghostN() && a.end === g.showEnd && a.hit).length }; });
  await fp.screenshot({ path: `${OUT}/ghost-play.png` });
  await loose(2);
  const want2 = made.rings.slice(0, 2).reduce((s, r) => s + r, 0);
  rec('ghost-play', start.lv === made.lv && start.seed === made.seed && start.gh && start.counts === false && /^CHALLENGE/.test(start.hint) && mid.n === 2 && mid.so === want2 && mid.shown === 2,
    `ACCEPT -> level ${start.lv + 1} on the challenger's seed (${start.seed === made.seed}); after 2 arrows the HUD has the ghost on ${mid.so} (theirs: ${want2}) against your ${mid.mine}, with ${mid.shown} ghost arrows in the face beside yours`);
  // the rest straight through the sim, then the results
  const fin = await F(() => {
    const g = KARGame, m = g.match, k = g._kit(0), winds = [];
    while (!m.over) { winds.push(m.wind); const h = KAR.Bot.hold(m, undefined, k); m.shoot(h.x + 0.06, h.y, 0, 0, 1, k); }
    g._finishMatch(); const D = KAR.Store.data;
    return { winds, total: m.total(0), scr: g.screen, stars: D.tour.stars[m.lv], best: D.tour.best[m.lv], gh: m.ghost.total };
  });
  const sameWind = fw.concat(fin.winds).every((w, i) => w === made.winds[i]) && fw.length + fin.winds.length === made.winds.length;
  rec('ghost-wind-phone', sameWind, `every one of the friend's ${fw.length + fin.winds.length} arrows had the wind the challenger had (${made.winds.slice(0, 3).map(w => w.toFixed(2)).join(', ')}…), though they shot differently (${fin.total} vs ${made.total})`);
  await fp.waitForTimeout(700);
  const over = await F(() => ({ ids: KAR.UI.buttons.map(b => b.id) }));
  await fp.screenshot({ path: `${OUT}/ghost-over.png` });
  rec('ghost-result', fin.scr === 'over' && fin.stars === 0 && fin.best === 0 && ['shareChallenge', 'rematch', 'levels', 'menu'].every(i => over.ids.includes(i)) && !over.ids.includes('next') && !over.ids.includes('shareLevel'),
    `results: you ${fin.total} vs ${fin.gh}; practice on an unopened level saves nothing (★${fin.stars}, best ${fin.best}); CHALLENGE BACK, REMATCH, LEVELS, MENU (no NEXT, no SHARE)`);
  await ftap('shareChallenge');
  const back = await F(() => { const sh = KARGame.shareCv, c = sh && new URL(sh.url).searchParams.get('c'), gh = c && KAR.Ghost.decode(c); return { ok: !!gh, total: gh && gh.total, lv: gh && gh.lv, seed: gh && gh.seed, text: KARGame.shareText }; });
  await F(() => KARGame.activate('shBack'));
  await ftap('rematch');
  await fp.waitForFunction(() => KARGame.screen === 'play', null, { timeout: 5000 }).catch(() => {});
  const re = await F(() => ({ scr: KARGame.screen, gh: !!KARGame.match.ghost, seed: KARGame.match.seed, n: KARGame.match.arrows[0].length }));
  rec('ghost-back', back.ok && back.total === fin.total && back.lv === made.lv && back.seed === made.seed && re.scr === 'play' && re.gh && re.seed === made.seed && re.n === 0,
    `CHALLENGE BACK makes the friend's own link (${back.total} on the same level + seed: "${(back.text || '').slice(0, 40)}…"); REMATCH plays the same ghost again (${re.gh})`);
  // a doctored or broken link: no invite, no errors, just the game
  const e0 = errors.length;
  await fp.goto(URL + '?c=eyJ2IjoxLCJsIjo5OTl9'); await fp.waitForFunction(() => window.KARGame); await fp.waitForTimeout(300);
  const junk = await F(() => ({ scr: KARGame.screen, inv: !!KARGame.invite }));
  rec('ghost-bad-link', junk.scr === 'menu' && !junk.inv && errors.length === e0, `a link naming level 1000 opens the plain menu (${junk.scr}), no invite, no errors`);
  await fc.close();
}

await page.setViewportSize({ width: 390, height: 780 });
rec('mobile-fit', await G(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no horizontal scroll at phone width');
rec('no-errors', errors.length === 0, `${errors.length} page errors${errors.length ? ': ' + errors[0] : ''}`);
await browser.close(); server.close(); rmSync(LBDIR, { recursive: true, force: true });
const fail = R.filter(x => !x).length;
console.log(`\n=== ${R.length - fail}/${R.length} passed ===`);
process.exit(fail ? 1 : 0);
