import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
const HERE = dirname(fileURLToPath(import.meta.url));
const URL = process.env.PINBALL_URL || ('file://' + resolve(HERE, '..', 'index.html'));
const OUT = HERE;
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const R=[]; const rec=(id,p,n)=>{R.push({id,pass:p,note:n});console.log((p?'PASS':'FAIL'),id,'—',n);};

const browser = await chromium.launch({ headless:true, args:['--no-sandbox','--disable-setuid-sandbox','--disable-gpu'] });
  const page = await browser.newPage({ viewport:{ width:540, height:900 }, deviceScaleFactor:2 });
  // Override document.hidden before page loads
  await page.addInitScript(() => {
    Object.defineProperty(document, 'hidden', { value: false, writable: true, configurable: true });
    Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true, configurable: true });
    // Override visibilitychange event
    const originalAddEventListener = document.addEventListener;
    document.addEventListener = function(type, listener, options) {
      if (type === 'visibilitychange') return;
      return originalAddEventListener.call(this, type, listener, options);
    };
  });
const errors=[], consoleErrs=[];
page.on('pageerror', e=>errors.push(String(e)));
// Ignore known-non-gameplay console noise: blocked fonts, network stubs, and file://
// leaderboard fetches (empty API_BASE → relative /api/* resolves to file:///api/…).
page.on('console', m=>{ if(m.type()==='error'){ const t=m.text(); if(!/Failed to load resource|ERR_|fonts\.g|net::|file:\/\/\/api\/leaderboard|URL scheme "file" is not supported/.test(t)) consoleErrs.push(t); } });

await page.goto(URL,{waitUntil:'domcontentloaded',timeout:15000});
  await sleep(400);
  rec('loads', errors.length===0, errors.length?errors[0]:'no page errors');
rec('hook', await page.evaluate(()=>!!window.PINBALL), 'window.PINBALL present');
await page.screenshot({ path: OUT+'/01-gate.png' });
await page.evaluate(()=>{ window.__f=0; const c=()=>{window.__f++;requestAnimationFrame(c);}; requestAnimationFrame(c); window.__t0=performance.now(); });
await page.click('#startBtn').catch(()=>{}); await page.evaluate(()=>{const b=document.getElementById('startBtn'); if(b)b.blur();}); await sleep(150);
rec('start', (await page.evaluate(()=>window.PINBALL.state))==='play', 'state=play after Launch');
rec('plunger-affordance-gate', await page.evaluate(()=>{
  var T=window.__kbTest;
  return T && T.plungerAffordanceWouldShow(true) && !T.plungerAffordanceWouldShow(false);
}), 'inLane + coarse gate true; hides when coarse false (headless uses logic hook)');

const zone = await page.evaluate(() => {
  const b = window.PINBALL.bounds();
  return {
    coarseMid: window.PINBALL.launchPointerHit(true, b.W * 0.75, b.H * 0.5),
    mouseMid: window.PINBALL.launchPointerHit(false, b.W * 0.75, b.H * 0.5),
    mouseCorner: window.PINBALL.launchPointerHit(false, b.W * 0.8, b.H * 0.85),
  };
});
rec('touch-zone-mid-right', zone.coarseMid && !zone.mouseMid, 'coarse mid-right accepts plunger; fine pointer mid-right does not');
rec('mouse-zone-corner', zone.mouseCorner, 'desktop lower-right plunger zone unchanged');

const touchLaunch = await page.evaluate(async () => {
  const c = document.getElementById('game');
  const r = c.getBoundingClientRect();
  const cx = r.left + r.width * 0.78;
  const cy = r.top + r.height * 0.48;
  c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: cx, clientY: cy, pointerId: 42, pointerType: 'touch', isPrimary: true }));
  await new Promise(res => setTimeout(res, 450));
  c.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: cx, clientY: cy, pointerId: 42, pointerType: 'touch', isPrimary: true }));
  await new Promise(res => setTimeout(res, 250));
  const b0 = window.PINBALL.balls[0];
  return { inLane: !!(b0 && b0.inLane), x: b0 ? b0.x : null, ch: window.PINBALL.charge };
});
rec('touch-hold-launch', !touchLaunch.inLane && touchLaunch.x < 850, 'synthetic touch hold launched (inLane=false, x=' + (touchLaunch.x == null ? 'n/a' : touchLaunch.x.toFixed(0)) + ')');

await page.keyboard.down('Space'); await sleep(900); await page.keyboard.up('Space'); await sleep(350);
const launchPrep = await page.evaluate(() => {
  const P = window.PINBALL, T = window.__kbTest;
  function onPlayfield() {
    const b = P.balls[0];
    return b && !b.inLane && b.x < 700;
  }
  for (let round = 0; round < 3 && !onPlayfield(); round++) {
    for (let i = 0; i < 320; i++) {
      const b = P.balls[0];
      if (!b) break;
      if (b.inLane) P.setCharge(1);
      else if (b.x < 700) break;
      P.physStep(1 / 300);
    }
    if (P.balls[0] && P.balls[0].inLane) { P.setCharge(1); P.launch(); }
  }
  if (!onPlayfield()) T.prepBall(420, 380, 120, 180);
  const b = P.balls[0];
  return { x: b ? Math.round(b.x) : null, via: onPlayfield() ? 'playfield' : 'prepBall-fail' };
});
await sleep(350);

let minX=1e9,maxScore=0,nan=false,sawPlayfield=false,flipMoved=false,launches=0;
const flRest = await page.evaluate(()=>window.PINBALL.flipL.a);
for (let i=0;i<70;i++){
  if (i%6<3){ await page.keyboard.down('ArrowLeft'); await page.keyboard.down('ArrowRight'); }
  else { await page.keyboard.up('ArrowLeft'); await page.keyboard.up('ArrowRight'); }
  const s = await page.evaluate(()=>{ const P=window.PINBALL;
    let relaunched=false;
    if (P.balls[0] && P.balls[0].inLane){ P.setCharge(1.0); P.launch(); relaunched=true; }
    return { state:P.state, score:P.score, relaunched,
      balls:P.balls.map(b=>({x:b.x,y:b.y,fin:isFinite(b.x)&&isFinite(b.y)})), flA:P.flipL.a };
  });
  if (s.relaunched) launches++;
  maxScore=Math.max(maxScore,s.score);
  for (const b of s.balls){ if(!b.fin) nan=true; minX=Math.min(minX,b.x); if(b.x<700) sawPlayfield=true; }
  if (Math.abs(s.flA-flRest)>0.1) flipMoved=true;
  if (i===8) await page.screenshot({ path: OUT+'/02-play.png' });
  if (s.state==='over') break;
  await sleep(200);
}
await page.screenshot({ path: OUT+'/03-play-late.png' });
const fps = await page.evaluate(()=>window.__f/((performance.now()-window.__t0)/1000));

rec('ball-enters-playfield', sawPlayfield, 'min ball x = '+(minX===1e9?'n/a':minX.toFixed(0))+' (need <700)'+(launchPrep&&launchPrep.x!=null?' · prep x='+launchPrep.x:''));
rec('scoring-works', maxScore>0, 'max score = '+maxScore+' (launches='+launches+')');
rec('flippers-respond', flipMoved, 'flipper angle moved on keypress');
rec('no-nan', !nan, 'all ball positions finite');
rec('fps', fps>=45, 'measured ~'+fps.toFixed(0)+' fps');
const physReg = await page.evaluate(() => window.__kbTest.runPhysWallRegression());
const physFail = physReg.cases ? Object.entries(physReg.cases).filter((e) => !e[1].ok).map((e) => e[0] + '(sp=' + e[1].sp + ',pen=' + e[1].pen + ')').join('; ') : (physReg.reason || 'missing');
rec('phys-wall-regression', !!physReg.ok, physReg.ok ? '9 segment/contact cases' : physFail);

const nudgeT = await page.evaluate(() => window.__kbTest.nudgeImpulseTest());
rec('nudge-impulse', !!(nudgeT && nudgeT.ok), nudgeT && nudgeT.ok ? 'sp ' + nudgeT.sp0 + '→' + nudgeT.sp1 : JSON.stringify(nudgeT));

const solar = await page.evaluate(() => window.__kbTest.solarSailMissionTest());
rec('solar-sail-mission', !!(solar && solar.ok), solar && solar.ok
  ? 'missionComplete[3] at spins=' + solar.spins + ' steps=' + solar.steps
  : JSON.stringify(solar));

// #179 lower-playfield geometry + funnel/flipper band (uses existing __kbTest / PINBALL only).
const lower = await page.evaluate(() => {
  const T = window.__kbTest, P = window.PINBALL;
  const g = T.geometry();
  const geo = {
    drain: g.DRAIN_Y,
    kickY0: g.kickZoneL && g.kickZoneL.y0,
    kickY1: g.kickZoneL && g.kickZoneL.y1,
    flipY: P.flipL && P.flipL.py,
    flipLen: P.flipL && P.flipL.len,
  };
  const geoOk = geo.drain === 1430 && geo.kickY0 === 1382 && geo.kickY1 === 1426 && geo.flipY === 1300 && geo.flipLen === 150;
  const b = T.prepBall(250, 1280, 20, 40);
  if (!b) return { geo, geoOk, stuck: 99, reason: 'no ball' };
  b.midT = 0; b.lowT2 = 0;
  const PH = 1 / 300;
  let stuck = 0;
  for (let i = 0; i < 200; i++) {
    const px = b.x, py = b.y, psp = Math.hypot(b.vx, b.vy);
    P.physStep(PH);
    if (Math.hypot(b.x - px, b.y - py) < 0.03 && Math.abs(Math.hypot(b.vx, b.vy) - psp) < 2 && psp < 12) stuck++;
    else stuck = 0;
    if (stuck > 50) break;
  }
  return { geo, geoOk, stuck, x: Math.round(b.x), y: Math.round(b.y), sp: Math.round(Math.hypot(b.vx, b.vy)) };
});
rec('lower-playfield-geo', !!lower.geoOk, lower.geoOk
  ? 'drain 1430 · kick 1382–1426 · flip py 1300 len 150'
  : JSON.stringify(lower.geo));
rec('lower-funnel-band', lower.stuck <= 50, 'stuck=' + lower.stuck + ' pos=' + lower.x + ',' + lower.y + ' sp=' + lower.sp);

const band = await page.evaluate(() => window.__kbTest.runLowerBandRegression());
const bandFail = band.drops ? band.drops.filter((d) => !d.ok).map((d) => d.id + '@' + d.x + ',' + d.y + ' sp=' + d.sp + ' stuck=' + d.stuck).join('; ') : (band.reason || 'missing');
rec('right-gutter-band', !!(band.drops && band.drops[0].ok && band.drops[1].ok),
  band.drops && band.drops[0].ok && band.drops[1].ok
    ? 'rightGutter + rightHugLow move or drain'
    : bandFail);
var flipEdgesOk = !!(band.drops && band.drops[2].ok && band.drops[3].ok && band.drops[4].ok);
rec('flipper-band-edges', flipEdgesOk,
  flipEdgesOk ? 'flipR / between / flipL alleys clear' : bandFail);
rec('drain-lip-crawl', !!(band.drops && band.drops[5] && band.drops[5].ok),
  band.drops && band.drops[5]
    ? 'drain lip center sp=' + band.drops[5].sp + ' stuck=' + band.drops[5].stuck
    : bandFail);
rec('ur-mini-flip-pocket', !!(band.drops && band.drops[6] && band.drops[6].ok),
  band.drops && band.drops[6]
    ? 'urMiniFlip end=' + band.drops[6].x + ',' + band.drops[6].y + ' stuck=' + band.drops[6].stuck
    : bandFail);

const launchLive = await page.evaluate(() => {
  const P = window.PINBALL, PH = 1 / 300;
  function runCharge(ch, steps) {
    P.start();
    P.setCharge(ch);
    P.launch();
    let minX = 1e9, inj = false;
    for (let i = 0; i < steps; i++) {
      P.physStep(PH);
      const b = P.balls[0];
      if (!b) return { drained: true, minX: Math.round(minX), inj };
      if (b.injected) inj = true;
      minX = Math.min(minX, b.x);
    }
    const b = P.balls[0];
    return b
      ? { x: Math.round(b.x), y: Math.round(b.y), minX: Math.round(minX), inj, lane: !!b.inLane }
      : { drained: true, minX: Math.round(minX), inj };
  }
  return { mid: runCharge(0.35, 700), tap: runCharge(0, 1100) };
});
rec('launch-crest-mid-charge', !!(launchLive.mid && launchLive.mid.inj && launchLive.mid.minX < 700),
  launchLive.mid && launchLive.mid.inj && launchLive.mid.minX < 700
    ? 'charge 0.35 → playfield minX=' + launchLive.mid.minX
    : JSON.stringify(launchLive.mid));
rec('failed-plunge-reserve', !!(launchLive.tap && launchLive.tap.lane && !launchLive.tap.inj),
  launchLive.tap && launchLive.tap.lane
    ? 'tap plunge re-parked in lane x=' + launchLive.tap.x
    : JSON.stringify(launchLive.tap));

rec('no-real-console-errors', consoleErrs.length===0, consoleErrs.length?consoleErrs.slice(0,2).join(' | '):'clean (blocked web-font requests ignored)');

const pass=R.filter(r=>r.pass).length,total=R.length;
writeFileSync(OUT+'/findings.md',
`# Kudbee Pinball — Evaluator findings (Playwright + real Chromium)\n\n`+
`Viewport 540×900 · file:// load · ${pass}/${total} rubric checks passed.\n\n`+
`| Check | Result | Note |\n|---|---|---|\n`+
R.map(r=>`| ${r.id} | ${r.pass?'✅':'❌'} | ${r.note} |`).join('\n')+
`\n\nScreenshots: 01-gate.png · 02-play.png · 03-play-late.png\n`+
`Page errors: ${errors.length?errors.join('; '):'none'}\n`);
console.log('\n=== '+pass+'/'+total+' passed ===');
await browser.close();
