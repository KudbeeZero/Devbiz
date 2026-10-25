// Kudbee Abyss - the whole rubric, run as several evaluator processes at once. From the repo root: `npm run abyss:eval:fast`.
// Every block of evaluator.mjs runs exactly once; blocks are dealt to SHARDS processes (default 4, or one per core), longest first, by how long each took on the
// last run (the local cache node_modules/.cache/abyss-eval-times.json over the committed eval/block-times.json; a new block counts as 30s). Each process has its own browser and server.
// The graph walk is one block, so only one process ever walks the story (two walks at once can run out of memory); each process gets an 8 GB heap ceiling, as `npm run abyss:graph` does.
// ONLY=a,b narrows it to those blocks. Exit code 0 only when every check passed in every process.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = resolve(HERE, '..', '..', '..');
const CACHE = join(ROOT, 'node_modules', '.cache'), TIMES = join(CACHE, 'abyss-eval-times.json'); mkdirSync(CACHE, { recursive: true });
const src = readFileSync(join(HERE, 'evaluator.mjs'), 'utf8');
let names = [...new Set([...src.matchAll(/^await block\('([^']+)'/gm)].map(x => x[1]))];
if (process.env.ONLY) { const only = process.env.ONLY.split(',').map(x => x.trim()); names = names.filter(n => only.includes(n)); }
const KNOWN = join(HERE, 'block-times.json');   // (committed: a fresh checkout deals blocks the same way as every other; the local cache, when there is one, is newer)
const last = Object.assign({}, existsSync(KNOWN) ? JSON.parse(readFileSync(KNOWN, 'utf8')) : {}, existsSync(TIMES) ? JSON.parse(readFileSync(TIMES, 'utf8')) : {});
const cost = n => last[n] || (n === 'graph' ? 120000 : 30000);
const N = Math.max(1, Math.min(names.length, Number(process.env.SHARDS) || Math.min(4, os.cpus().length)));
const shards = Array.from({ length: N }, () => ({ names: [], ms: 0 }));
for (const n of names.slice().sort((a, b) => cost(b) - cost(a))) { const s = shards.reduce((a, b) => (b.ms < a.ms ? b : a)); s.names.push(n); s.ms += cost(n); }

const t0 = Date.now(), lines = [], times = {};
const run = (s, i) => new Promise(done => {
  const tf = join(CACHE, 'abyss-eval-times.' + i + '.json'); rmSync(tf, { force: true });
  const p = spawn(process.execPath, ['--max-old-space-size=8192', join(HERE, 'evaluator.mjs')], { env: Object.assign({}, process.env, { ONLY: s.names.join(','), EVAL_TIMES: tf }), stdio: ['ignore', 'pipe', 'pipe'] });
  let buf = '';
  const out = (d) => { buf += d; let k; while ((k = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, k); buf = buf.slice(k + 1); if (/^(PASS|FAIL|SKIP) /.test(l)) { lines.push(l); console.log('[' + (i + 1) + '] ' + l); } else if (/Error|error/.test(l)) console.log('[' + (i + 1) + '] ' + l); } };
  p.stdout.on('data', out); p.stderr.on('data', out);
  p.on('close', (code) => { if (existsSync(tf)) Object.assign(times, JSON.parse(readFileSync(tf, 'utf8'))); rmSync(tf, { force: true }); done(code); });
});
console.log('abyss eval: ' + names.length + ' blocks over ' + N + ' processes (' + shards.map(s => s.names.length + ' blocks ~' + Math.round(s.ms / 1000) + 's').join(', ') + ')');
const codes = await Promise.all(shards.map(run));

// the same check id can be recorded by more than one process (no-console-errors closes every run): it passes only if it passed everywhere
const byId = new Map();
for (const l of lines) { const m = /^(PASS|FAIL) (\S+)/.exec(l); if (m) byId.set(m[2], (byId.get(m[2]) ?? true) && m[1] === 'PASS'); }
const ran = names.filter(n => times[n] !== undefined), lost = names.filter(n => times[n] === undefined);
if (ran.length) writeFileSync(TIMES, JSON.stringify(Object.assign({}, last, times)));
if (process.env.SAVE_TIMES && !process.env.ONLY && !lost.length) writeFileSync(KNOWN, JSON.stringify(Object.fromEntries(Object.entries(Object.assign({}, last, times)).filter(([n]) => names.includes(n)).map(([n, v]) => [n, Math.round(v / 1000) * 1000]).sort((a, b) => (a[0] < b[0] ? -1 : 1))), null, 1) + '\n');   // SAVE_TIMES=1 refreshes the committed table after a full run
const pass = [...byId.values()].filter(Boolean).length, failed = [...byId].filter(([, ok]) => !ok).map(([id]) => id);
if (lost.length) console.log('\nNOT RUN (a process died before reaching them): ' + lost.join(', '));
if (failed.length) console.log('\nFAILED: ' + failed.join(', '));
console.log('\n=== ' + pass + '/' + byId.size + ' passed (' + N + ' processes, ' + Math.round((Date.now() - t0) / 1000) + 's) ===');
process.exit(failed.length === 0 && lost.length === 0 && codes.every(c => c === 0) ? 0 : 1);
