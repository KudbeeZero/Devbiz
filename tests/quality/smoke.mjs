#!/usr/bin/env node
// Playwright smoke suite (DBZ-059, Polish Lane 12) — advisory CI job, see
// .github/workflows/quality.yml. Runs a real Chromium pass against the home
// page over a local static server (server.mjs) and checks the handful of
// things the Ground Rules (docs/POLISH_BUILDOUT.md rule 8) already require
// every polish lane to verify by hand: zero console/page errors at 1440px
// and 390px, the pinned scrollytelling section actually engages as you
// scroll, the live agent answers a real question from its local KB, and the
// reduced-motion render still delivers the content.
//
// This suite is intentionally NOT wired as a blocking gate yet (see the
// workflow file header) — it exists so a future visual regression shows up
// in the PR Checks tab instead of only being caught if someone remembers to
// run a manual pass.
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');

const results = [];
function record(name, fn) {
  return fn()
    .then(() => { results.push({ name, ok: true }); console.log(`  ok   ${name}`); })
    .catch((err) => { results.push({ name, ok: false, err }); console.log(`  FAIL ${name}\n       ${err.message}`); });
}
function assert(cond, msg) { if (!cond) throw new Error('assertion failed: ' + msg); }

// Console/page-error collector. Ignores nothing by default — a clean page
// should produce zero entries; anything captured here is a real regression.
function collectErrors(page) {
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push('console.error: ' + msg.text()); });
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
  page.on('requestfailed', (req) => {
    // A failed same-origin request (e.g. a 404'd asset) is a real bug in this
    // suite's static server or the page's own markup — surface it the same
    // way a browser devtools console would.
    if (req.url().startsWith('http://127.0.0.1')) errors.push('requestfailed: ' + req.url() + ' (' + (req.failure()?.errorText || 'unknown') + ')');
  });
  return errors;
}

async function main() {
  console.log('Starting static server over the repo root...');
  const { url, close } = await startServer(REPO_ROOT);
  console.log('Serving at', url);

  const browser = await chromium.launch();
  try {
    // ---- 1 & 2: home renders with zero console errors at 1440px and 390px ----
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await record(`home renders with zero console errors at ${viewport.width}px`, async () => {
        const context = await browser.newContext({ viewport });
        const page = await context.newPage();
        const errors = collectErrors(page);
        const resp = await page.goto(url + '/index.html', { waitUntil: 'networkidle', timeout: 20000 });
        assert(resp && resp.ok(), `expected 200 for index.html, got ${resp && resp.status()}`);
        await page.waitForSelector('#heroTitle', { state: 'visible', timeout: 5000 });
        await context.close();
        if (errors.length) throw new Error(`${errors.length} console/page error(s):\n       ` + errors.join('\n       '));
      });
    }

    // ---- 3: the sticky-pin story section engages correctly while scrolling ----
    await record('sticky-pin story section (#storyOuter/.pin) engages on scroll', async () => {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      await page.goto(url + '/index.html', { waitUntil: 'networkidle', timeout: 20000 });

      const before = await page.evaluate(() => {
        const steps = Array.from(document.querySelectorAll('#storySteps .step'));
        return { onCount: steps.filter((s) => s.classList.contains('on')).length, total: steps.length };
      });
      assert(before.total >= 3, `expected several story steps in the DOM, found ${before.total}`);
      assert(before.onCount <= 1, `expected the story to start mostly un-engaged before scrolling, got ${before.onCount}/${before.total} already on`);

      // Scroll to the midpoint of the pinned section's scrollable range.
      // `behavior: 'instant'` is required, not cosmetic: index.html sets
      // `html { scroll-behavior: smooth }` under no-preference motion, so a
      // plain scrollTo(x, y) would animate over real wall-clock time and
      // still be mid-flight a couple of rAF frames later.
      await page.evaluate(() => {
        const el = document.getElementById('storyOuter');
        const rect = el.getBoundingClientRect();
        const top = rect.top + window.scrollY;
        const target = top + (el.offsetHeight - window.innerHeight) * 0.5;
        window.scrollTo({ top: target, left: 0, behavior: 'instant' });
      });
      // The pinned section's progress is driven by a continuous
      // IntersectionObserver-gated rAF loop while it's in view — give it a
      // couple of animation frames to recompute after the scroll jump.
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

      const mid = await page.evaluate(() => {
        const pin = document.querySelector('.story .pin');
        const bar = document.getElementById('storyBar');
        const steps = Array.from(document.querySelectorAll('#storySteps .step'));
        return {
          pinTop: pin.getBoundingClientRect().top,
          barTransform: bar.style.transform,
          onCount: steps.filter((s) => s.classList.contains('on')).length,
          total: steps.length,
        };
      });
      assert(Math.abs(mid.pinTop) < 3, `expected the pinned panel to be stuck at top≈0 mid-scroll, got ${mid.pinTop}px`);
      const scaleMatch = /scaleX\(([\d.]+)\)/.exec(mid.barTransform || '');
      assert(scaleMatch, `expected #storyBar to have a scaleX() transform, got "${mid.barTransform}"`);
      const scaleX = parseFloat(scaleMatch[1]);
      assert(scaleX > 0.15 && scaleX < 0.95, `expected mid-range scroll progress on the bar, got scaleX(${scaleX})`);
      assert(mid.onCount > before.onCount && mid.onCount < mid.total, `expected some (not all/none) steps engaged mid-scroll, got ${mid.onCount}/${mid.total}`);

      await context.close();
    });

    // ---- 4: the live agent answers a canned question from its local KB ----
    await record('live agent answers a canned question', async () => {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      const errors = collectErrors(page);
      await page.goto(url + '/index.html', { waitUntil: 'networkidle', timeout: 20000 });

      const botMsgsBefore = await page.locator('#agent-log .agent-msg.bot').count();
      await page.locator('#agent-input').click();
      await page.locator('#agent-input').fill('what are your pricing tiers?');
      await page.locator('#agent-form').evaluate((form) => form.requestSubmit());

      await page.waitForFunction(
        (prevCount) => document.querySelectorAll('#agent-log .agent-msg.bot').length > prevCount,
        botMsgsBefore,
        { timeout: 5000 }
      );
      const reply = await page.locator('#agent-log .agent-msg.bot').last().innerText();
      assert(reply.trim().length > 0, 'expected a non-empty bot reply');
      assert(/pric|\$\d{2,3}/i.test(reply), `expected a pricing-relevant reply (real KB match, not the generic fallback), got: "${reply}"`);

      await context.close();
      if (errors.length) throw new Error(`${errors.length} console/page error(s) during the agent conversation:\n       ` + errors.join('\n       '));
    });

    // ---- 5: reduced-motion still renders the content, zero console errors ----
    await record('reduced-motion render delivers content with zero console errors', async () => {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const errors = collectErrors(page);
      await page.goto(url + '/index.html', { waitUntil: 'networkidle', timeout: 20000 });

      assert(await page.locator('#heroTitle').isVisible(), 'expected the hero title to be visible under reduced-motion');
      // Under reduced-motion the story section's own init immediately marks
      // every step "on" and fills the bar (index.html: `if (reduce) { ... return; }`)
      // instead of waiting on scroll — a good proxy that the static fallback ran.
      const state = await page.evaluate(() => {
        const steps = Array.from(document.querySelectorAll('#storySteps .step'));
        const bar = document.getElementById('storyBar');
        return { allOn: steps.length > 0 && steps.every((s) => s.classList.contains('on')), barTransform: bar.style.transform };
      });
      assert(state.allOn, 'expected all story steps to be statically "on" under reduced-motion');
      assert(state.barTransform === 'scaleX(1)', `expected the story bar fully filled under reduced-motion, got "${state.barTransform}"`);

      await context.close();
      if (errors.length) throw new Error(`${errors.length} console/page error(s) under reduced-motion:\n       ` + errors.join('\n       '));
    });
  } finally {
    await browser.close();
    await close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} smoke checks passed.`);
  if (failed.length) {
    console.log('\nFailed checks:');
    failed.forEach((f) => console.log(` - ${f.name}: ${f.err.message}`));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Smoke suite crashed:', err);
  process.exitCode = 1;
});
