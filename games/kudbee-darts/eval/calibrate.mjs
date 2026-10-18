// Kudbee Darts — Darts Birds star calibration.
// Plays every campaign level many times with a bot standing in for the
// player and prints, per level, the bot's win rate and the darts it threw on
// its winning legs. Use it to set each level's `par` in src/campaign.js from
// data, not guesses. The "player" is an AI of a chosen accuracy (sigma, in
// board-radius units; Pro = 0.07, Rookie = 0.13).
//
//   node games/kudbee-darts/eval/calibrate.mjs [runs] [sigma ...]
import { chromium } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL = 'file://' + resolve(HERE, '..', 'index.html');
const RUNS = Number(process.argv[2]) || 40;
const SIGMAS = process.argv.slice(3).map(Number).filter(Boolean);
if (!SIGMAS.length) SIGMAS.push(0.07, 0.10);

const opts = { headless: true, args: ['--no-sandbox', '--disable-gpu'] };
if (process.env.PW_CHROMIUM) opts.executablePath = process.env.PW_CHROMIUM;
const browser = await chromium.launch(opts);
const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
await page.goto(URL);
await page.waitForFunction(() => window.DARTS && window.KD && window.KD.Campaign);
await page.evaluate(() => { window.DARTS.loop.stop && window.DARTS.loop.stop(); });

const pct = (a, p) => (a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : NaN);

for (const sigma of SIGMAS) {
  console.log(`\n=== player sigma ${sigma} · ${RUNS} legs per level ===`);
  console.log('lvl  name            mode  rival   win%   p25  p50  p75   par  3★%  2★%');
  const rows = await page.evaluate(([runs, sigma]) => {
    const g = window.DARTS, C = window.KD.Campaign, out = [];
    const saved = JSON.stringify(g.progression.data);
    for (let i = 0; i < C.LEVELS.length; i++) {
      const L = C.LEVELS[i], darts = [];
      let wins = 0;
      for (let r = 0; r < runs; r++) {
        g.levelIdx = i; g._startMatch();
        // Turn the human seat into a bot of the chosen accuracy.
        const me = g.players[0];
        Object.setPrototypeOf(me, window.KD.AIPlayer.prototype);
        me.isAI = true; me.tierName = 'Pro'; me.sigma = sigma; me.thinkTime = 0.02; me.ambition = 1;
        g.players[1].thinkTime = 0.02;
        let n = 0;
        while (g.state !== 'matchOver' && n++ < 60000) {
          if (g.state === 'turnEnd') g.turnEndTimer = 0;
          g._update(1 / 30);
        }
        if (g.matchResult && g.matchResult.won) { wins++; darts.push(g.matchResult.darts); }
      }
      darts.sort((a, b) => a - b);
      out.push({ i, name: L.name, mode: L.mode, tier: L.tier, par: L.par, wins, runs, darts });
    }
    g.progression.data = JSON.parse(saved); g.progression.save();
    g.levelIdx = null; g.state = 'menu';
    return out;
  }, [RUNS, sigma]);
  for (const r of rows) {
    const d = r.darts;
    const s3 = d.filter((x) => x <= r.par).length, s2 = d.filter((x) => x > r.par && x <= r.par + 6).length;
    const pc = (x) => (d.length ? Math.round((100 * x) / d.length) : 0);
    console.log(
      String(r.i + 1).padStart(3), ' ', r.name.padEnd(14), r.mode.padEnd(5), r.tier.padEnd(7),
      String(Math.round((100 * r.wins) / r.runs)).padStart(4) + '%',
      String(pct(d, 0.25)).padStart(5), String(pct(d, 0.5)).padStart(4), String(pct(d, 0.75)).padStart(4),
      String(r.par).padStart(5), String(pc(s3)).padStart(4) + '%', String(pc(s2)).padStart(4) + '%',
    );
  }
}
await browser.close();
