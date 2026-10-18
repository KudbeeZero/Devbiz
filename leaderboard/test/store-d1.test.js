/* =====================================================================
 * Kudbee Leaderboard — test/store-d1.test.js
 * The production D1 store's SQL, run for real on SQLite (node:sqlite) behind a
 * D1-shaped adapter (prepare().bind().first/all/run with meta.changes), with
 * schema.sql applied as written: scores keep best-ever, and cloud saves write
 * only on the revision they were built from.
 * ===================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createD1Store } from '../worker/store-d1.js';

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

test('D1 store on real SQLite: archery scores + cloud saves', { skip: !sqlite && 'node:sqlite unavailable' }, async () => {
  const s = createD1Store(d1());
  await s.upsertScore('archery', 'guest:a', 'A', { stars: 12, golds: 30 });
  await s.upsertScore('archery', 'guest:a', 'A', { stars: 9, golds: 41 });            // keeps the best of each
  await s.upsertScore('archery', 'guest:b', 'B', { stars: 20 });
  const a = await s.getUser('archery', 'guest:a');
  assert.equal(a.stars, 12); assert.equal(a.golds, 41);
  assert.deepEqual((await s.topByMetric('archery', 'stars', 10)).map((r) => r.userId), ['guest:b', 'guest:a']);
  assert.equal(await s.count('archery'), 2);

  assert.equal(await s.getSave('archery', 'guest:a'), null);
  assert.deepEqual(await s.putSave('archery', 'guest:a', '{"v":1}', 0), { ok: true, rev: 1 });
  assert.deepEqual(await s.putSave('archery', 'guest:a', '{"v":9}', 0), { ok: false });       // a second "first" save loses
  assert.deepEqual(await s.putSave('archery', 'guest:a', '{"v":2}', 1), { ok: true, rev: 2 });
  assert.deepEqual(await s.putSave('archery', 'guest:a', '{"v":9}', 1), { ok: false });       // stale
  const sv = await s.getSave('archery', 'guest:a');
  assert.equal(sv.data, '{"v":2}'); assert.equal(sv.rev, 2); assert.ok(sv.updatedAt > 0);
  assert.equal(await s.getSave('archery', 'guest:b'), null);
});
