/* =====================================================================
 * Kudbee Leaderboard — test/single-file.test.js
 * The one-file Worker (worker/dist/worker.single.js, for pasting into the
 * Cloudflare dashboard) must be the build of the current sources, and must
 * serve the API the same way: health, and a guest cloud save round trip on a
 * real SQLite database. If this fails, run `node worker/build-single.mjs`.
 * ===================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildSingle, OUT } from '../worker/build-single.mjs';

let sqlite = null;
try { sqlite = await import('node:sqlite'); } catch (_) { /* Node without node:sqlite: skipped below */ }

function d1() {
  const db = new sqlite.DatabaseSync(':memory:');
  db.exec(readFileSync(fileURLToPath(new URL('../worker/schema.sql', import.meta.url)), 'utf8'));
  return {
    prepare(sql) {
      const st = db.prepare(sql);
      const bound = (args) => ({
        async first() { return st.get(...args) || null; },
        async all() { return { results: st.all(...args) }; },
        async run() { const r = st.run(...args); return { meta: { changes: Number(r.changes) } }; },
      });
      return { bind: (...a) => bound(a), ...bound([]) };
    },
  };
}

test('dist/worker.single.js is the current build of the sources', () => {
  assert.ok(existsSync(OUT), 'run: node worker/build-single.mjs');
  assert.equal(readFileSync(OUT, 'utf8'), buildSingle(), 'dist is stale: run node worker/build-single.mjs');
});

test('one-file Worker serves health and a guest cloud save round trip', { skip: !sqlite && 'node:sqlite unavailable' }, async () => {
  const { default: worker } = await import(pathToFileURL(OUT).href);
  const env = { DB: d1(), ALLOW_DEMO: '1' };
  const code = '7F3Q9XMA2PRW4HNT';
  const call = (method, path, body) => worker.fetch(new Request('https://w.example' + path, {
    method,
    headers: { 'x-guest-code': code, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }), env);

  const health = await worker.fetch(new Request('https://w.example/api/health'), env);
  assert.equal(health.status, 200);

  const put = await call('POST', '/api/save', { game: 'archery', rev: 0, data: { stars: [3, 2] } });
  assert.equal(put.status, 200);
  const got = await call('GET', '/api/save?game=archery');
  assert.equal(got.status, 200);
  const body = await got.json();
  assert.equal(body.save.rev, 1);
  assert.deepEqual(body.save.data, { stars: [3, 2] });
});
