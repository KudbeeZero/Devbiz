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
const errors=[], consoleErrs=[];
page.on('pageerror', e=>errors.push(String(e)));
// Ignore known-non-gameplay console noise: blocked fonts, network stubs, and file://
// leaderboard fetches (empty API_BASE → relative /api/* resolves to file:///api/…).
page.on('console', m=>{ if(m.type()==='error'){ const t=m.text(); if(!/Failed to load resource|ERR_|fonts\.g|net::|file:\/\/\/api\/leaderboard|URL scheme "file" is not supported/.test(t)) consoleErrs.push(t); } });

await page.goto(URL,{waitUntil:'domcontentloaded',timeout:15000}); await sleep(400);
rec('loads', errors.length===0, errors.length?errors[0]:'no page errors');
rec('hook', await page.evaluate(()=>!!window.PINBALL), 'window.PINBALL present');
await page.screenshot({ path: OUT+'/01-gate.png' });
await page.evaluate(()=>{ window.__f=0; const c=()=>{window.__f++;requestAnimationFrame(c);}; requestAnimationFrame(c); window.__t0=performance.now(); });
await page.click('#startBtn').catch(()=>{}); await page.evaluate(()=>{const b=document.getElementById('startBtn'); if(b)b.blur();}); await sleep(150);
rec('start', (await page.evaluate(()=>window.PINBALL.state))==='play', 'state=play after Launch');

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

await page.keyboard.down('Space'); await sleep(800); await page.keyboard.up('Space'); await sleep(300);

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

rec('ball-enters-playfield', sawPlayfield, 'min ball x = '+(minX===1e9?'n/a':minX.toFixed(0))+' (need <700)');
rec('scoring-works', maxScore>0, 'max score = '+maxScore+' (launches='+launches+')');
rec('flippers-respond', flipMoved, 'flipper angle moved on keypress');
rec('no-nan', !nan, 'all ball positions finite');
rec('fps', fps>=45, 'measured ~'+fps.toFixed(0)+' fps');
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
