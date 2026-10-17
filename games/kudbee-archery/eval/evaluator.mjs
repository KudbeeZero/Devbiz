// Kudbee Archery — browser rubric (Playwright + Chromium, real pointer/keyboard input).
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
const URL = `http://localhost:${server.address().port}/games/kudbee-archery/index.html`;

const R = [];
const rec = (id, pass, note) => { R.push(pass); console.log(pass ? 'PASS' : 'FAIL', id, '—', note); };
// Cloud containers: use the pre-installed Chromium when present (avoids `playwright install`).
const launchOpts = existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {};
const browser = await chromium.launch(launchOpts);
const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
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
const sx0 = await G(() => KARGame.match.offAt(KARGame.match.T).x); await page.waitForTimeout(500);
rec('swing-moves', Math.abs(await G(() => KAR.Render.tOff && KAR.Render.tOff.x) - sx0) > 0.05, 'the target swings while you aim');
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
  await click('L24'); await page.waitForTimeout(150);
  const lv = await G(() => ({ lv: KARGame.match.lv, boxes: KAR.Render.boxes && KAR.Render.boxes.length, hint: KARGame.hint }));
  const wood = await G(() => { const g = KARGame, R = KAR.Render, q = R.proj(0.6, 1.0, g.match.dist - KAR.BOXZ), d = g.ctx.getImageData(Math.round((q.x - R.XL) * g.res), Math.round(q.y * g.res), 1, 1).data; return [d[0], d[1], d[2]]; });

  await waitFor(() => KARGame.bp === 'ready', 8000);
  const b1 = await page.evaluate(([x, y]) => { const g = KARGame; g.match.wind = 0; g.match._gust = () => { g.match.wind = 0; }; g.drawing = true; g.draw = 1; g.aimX = x; g.aimY = y; g.sway = { x: 0, y: 0 }; g._loose(); const r = g.flight.res; return { blocked: r.blocked, ring: r.ring }; }, [0.5, 1.0]);
  await waitFor(() => KARGame.bp === 'result', 8000); await page.waitForTimeout(250);
  const ban = await G(() => KARGame.banner && KARGame.banner.text);
  await page.screenshot({ path: `${OUT}/think-blocked.png` });
  await waitFor(() => KARGame.bp === 'ready', 8000);
  const b2 = await page.evaluate(([x, y]) => { const g = KARGame; g.drawing = true; g.draw = 1; g.aimX = x; g.aimY = y; g.sway = { x: 0, y: 0 }; g._loose(); const r = g.flight.res; return { blocked: !!r.blocked, ring: r.ring }; }, [0, 1.3]);
  await waitFor(() => KARGame.bp === 'ready', 12000);
  const kept = await G(() => { const a = KARGame.match.arrows[0]; return a.length === 2 && a[0].hit && a[0].hit.z === KARGame.match.dist - KAR.BOXZ && a[1].ring >= 9; });

  rec('think-box', shut && open === 'L24' && lv.lv === 24 && lv.boxes >= 4 && /PEEPHOLE/.test(lv.hint) && wood[0] > wood[2] + 60 && b1.blocked && b1.ring === 0 && ban === 'BLOCKED!' && !b2.blocked && b2.ring >= 9 && kept && errors.length === 0,
    `THINK BOX stays shut on 2 stars at the world 4 boss and opens off the Village Cup (${open}); PEEPHOLE draws ${lv.boxes} crates (wood rgb ${wood}); a shot into the wall reads ${ban} for ${b1.ring} and stays in the crate; through the window it scores ${b2.ring}`);
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
await G(() => { KAR.Store.data.tour.stars.fill(0); KAR.Store.data.tourLv = 0; KAR.Store.data.mode = 0; KARGame.activate('menu'); });

// SHARING: the page carries a share card (Open Graph + Twitter large image, absolute https URLs) whose image is a real 1200x630
// file in the repo, and the menu's share button shares the game's public (canonical) link
{
  const meta = await G(() => { const q = n => (document.querySelector(`meta[property="${n}"], meta[name="${n}"]`) || {}).content || ''; return { img: q('og:image'), tw: q('twitter:image'), card: q('twitter:card'), title: q('og:title'), desc: q('og:description'), url: q('og:url'), canon: document.querySelector('link[rel=canonical]').href }; });
  const local = meta.img.replace(/^https:\/\/[^/]+/, '').split('?')[0];
  const dims = await page.evaluate(src => new Promise(r => { const im = new Image(); im.onload = () => r([im.naturalWidth, im.naturalHeight]); im.onerror = () => r([0, 0]); im.src = src; }), local);
  await G(() => { KARGame.activate('menu'); }); await page.waitForTimeout(80);
  await click('shareGame'); await page.waitForTimeout(80);
  const st = await G(() => KARGame.shareText || '');
  rec('share-card', /^https:\/\//.test(meta.img) && meta.img === meta.tw && meta.card === 'summary_large_image' && meta.title && /30 levels/.test(meta.desc) && meta.url === meta.canon && dims[0] === 1200 && dims[1] === 630 && st.endsWith(meta.canon),
    `og/twitter image ${meta.img} (${dims.join('x')}), large-image card; SHARE copies "${st.slice(0, 60)}... ${meta.canon}"`);
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

await page.setViewportSize({ width: 390, height: 780 });
rec('mobile-fit', await G(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no horizontal scroll at phone width');
rec('no-errors', errors.length === 0, `${errors.length} page errors${errors.length ? ': ' + errors[0] : ''}`);
await browser.close(); server.close();
const fail = R.filter(x => !x).length;
console.log(`\n=== ${R.length - fail}/${R.length} passed ===`);
process.exit(fail ? 1 : 0);
