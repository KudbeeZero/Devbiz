/* =====================================================================
 * Kudbee Leaderboard — scripts/coverage-snapshot.mjs
 * Turns the raw c8 output into the compact, read-only JSON that the
 * breakdown dashboard (tools/coverage-dashboard/) renders.
 *
 * It reads the SAME two sources the gate uses:
 *   - .c8rc.json                  -> thresholds + include/exclude scope
 *   - coverage/coverage-summary.json -> measured total + per-file pcts
 * and writes ../tools/coverage-dashboard/coverage-data.json.
 *
 * The dashboard NEVER computes or edits thresholds; this script is the
 * only bridge, so what you see is exactly what the gate enforces.
 *
 * Run:  npm run coverage && npm run coverage:snapshot   (from leaderboard/)
 * ===================================================================== */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const leaderboardDir = resolve(here, '..');
const repoRoot = resolve(leaderboardDir, '..');

const rc = JSON.parse(readFileSync(join(leaderboardDir, '.c8rc.json'), 'utf8'));

const summaryPath = join(leaderboardDir, 'coverage', 'coverage-summary.json');
if (!existsSync(summaryPath)) {
  console.error('coverage-summary.json not found. Run `npm run coverage` first.');
  process.exit(1);
}
const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));

const METRICS = ['lines', 'branches', 'functions', 'statements'];
const thresholds = Object.fromEntries(METRICS.map((m) => [m, rc[m] ?? 0]));

const roundPct = (n) => Math.round(n);
const pctOf = (entry, m) => {
  const pct = entry?.[m]?.pct;
  return typeof pct === 'number' ? roundPct(pct) : 0;
};
const countsOf = (entry, m) => ({
  covered: entry?.[m]?.covered ?? 0,
  total: entry?.[m]?.total ?? 0,
});

const total = Object.fromEntries(METRICS.map((m) => [m, pctOf(summary.total, m)]));
const totalCounts = Object.fromEntries(METRICS.map((m) => [m, countsOf(summary.total, m)]));

// Per-file rows. Keys are absolute paths; present them relative to leaderboard/.
const files = Object.entries(summary)
  .filter(([k]) => k !== 'total')
  .map(([abs, entry]) => {
    let rel = abs;
    const marker = `${leaderboardDir}/`;
    if (rel.startsWith(marker)) rel = rel.slice(marker.length);
    const metrics = Object.fromEntries(METRICS.map((m) => [m, pctOf(entry, m)]));
    const counts = Object.fromEntries(METRICS.map((m) => [m, countsOf(entry, m)]));
    return { path: rel, metrics, counts };
  })
  // Weak spots first: lowest line coverage at the top.
  .sort((a, b) => a.metrics.lines - b.metrics.lines);

// Same pass rule c8 --check-coverage uses: every metric >= its threshold.
const pass = METRICS.every((m) => total[m] >= thresholds[m]);

let commit = 'unknown';
try {
  commit = execSync('git rev-parse --short HEAD', { cwd: repoRoot }).toString().trim();
} catch {
  /* not a git checkout / git unavailable — leave as unknown */
}

const out = {
  version: 1,
  scope: 'leaderboard/shared/',
  note: 'Scoped coverage gate — leaderboard/shared/ only. NOT global repository coverage.',
  generatedAt: new Date().toISOString(),
  commit,
  thresholds,
  include: rc.include ?? [],
  exclude: rc.exclude ?? [],
  total,
  totalCounts,
  files,
  pass,
};

const outDir = join(repoRoot, 'tools', 'coverage-dashboard');
const outPath = join(outDir, 'coverage-data.json');

// `generatedAt` (wall-clock) and `commit` (HEAD) move on every run, so they are
// never part of the freshness contract — only the measured coverage, thresholds,
// scope and verdict are. `--check` compares just that stable portion.
const stable = (o) => {
  const { generatedAt, commit, total, totalCounts, files, ...core } = o;
  const meetsThresholds = METRICS.every((m) =>
    (total?.[m] ?? 0) >= (core.thresholds?.[m] ?? 0)
  );
  return JSON.stringify({ ...core, meetsThresholds });
};

if (process.argv.includes('--check')) {
  if (!existsSync(outPath)) {
    console.error(`Missing ${outPath}. Run \`npm run coverage:snapshot\` and commit it.`);
    process.exit(1);
  }
  const committed = JSON.parse(readFileSync(outPath, 'utf8'));
  if (stable(committed) !== stable(out)) {
    console.error('Dashboard snapshot is stale — coverage numbers/thresholds changed.');
    console.error('Run `npm run coverage && npm run coverage:snapshot` and commit coverage-data.json.');
    process.exit(1);
  }
  console.log(`Dashboard snapshot is fresh (pass=${pass}, lines=${total.lines}%).`);
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
console.log(`Wrote ${outPath} (pass=${pass}, lines=${total.lines}%)`);
