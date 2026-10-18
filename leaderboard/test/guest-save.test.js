/* =====================================================================
 * Kudbee Leaderboard — test/guest-save.test.js
 * Guest backup codes (the code is the account; only its hash is an id) and
 * CLOUD SAVES (a whole game save per player, written against a revision so
 * two devices can't overwrite each other blind), on the in-memory store and
 * the real JSON file store.
 * ===================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runApi } from '../shared/http.js';
import { resolveAuth, normalizeGuestCode, guestId } from '../shared/auth.js';
import { createFileStore } from '../server/store-file.js';
import { SAVE_MAX } from '../shared/core.js';

function memSaves() {
  const saves = {}, scores = {};
  return {
    async topByMetric(game) { return Object.values(scores[game] || {}); },
    async getUser(game, id) { return (scores[game] || {})[id] || null; },
    async count(game) { return Object.keys(scores[game] || {}).length; },
    async upsertScore(game, id, name, m) { scores[game] = scores[game] || {}; const r = { ...(scores[game][id] || {}), userId: id, name, ...m, updatedAt: Date.now() }; scores[game][id] = r; return r; },
    async getSave(game, id) { const s = (saves[game] || {})[id]; return s ? { ...s } : null; },
    async putSave(game, id, data, rev) { const g = saves[game] || (saves[game] = {}), cur = g[id]; if ((cur ? cur.rev : 0) !== rev) return { ok: false }; g[id] = { data, rev: rev + 1, updatedAt: Date.now() }; return { ok: true, rev: rev + 1 }; },
  };
}
const CODE = 'KDB-7F3Q-9XMA-2PRW-4HNT';      // 16 chars after the prefix
const H = (code, extra) => ({ 'x-guest-code': code, ...(extra || {}) });
const call = (store, method, path, headers, body, env) => runApi(store, env || {}, { method, path: path.split('?')[0], query: new URLSearchParams(path.split('?')[1] || ''), headers, body });

test('guest codes: forgiving to type, strict to accept', async () => {
  assert.equal(normalizeGuestCode('KDB-7F3Q-9XMA-2PRW-4HNT'), '7F3Q9XMA2PRW4HNT');
  assert.equal(normalizeGuestCode('kdb 7f3q 9xma 2prw 4hnt'), '7F3Q9XMA2PRW4HNT');       // any case, spaces
  assert.equal(normalizeGuestCode('7F3Q-9XMA-2PRW-4HNT'), '7F3Q9XMA2PRW4HNT');             // prefix optional
  assert.equal(normalizeGuestCode('7F3Q9XMA2PRW4HNT'.replace('1', 'I')), '7F3Q9XMA2PRW4HNT');
  assert.equal(normalizeGuestCode('KDB-0000-1111-2222-333O'), '0000111122223330');         // O reads as 0
  assert.equal(normalizeGuestCode('KDB-7F3Q-9XMA-2PRW'), null);                            // too short
  assert.equal(normalizeGuestCode('KDB-7F3Q-9XMA-2PRW-4HNU'), null);                       // U is not Crockford
  const a = await resolveAuth(H(CODE), {}), b = await resolveAuth(H('kdb7f3q9xma2prw4hnt'), {});
  assert.equal(a.userId, b.userId);                                                         // same code typed differently = same player
  assert.match(a.userId, /^guest:[0-9a-f]{24}$/);
  assert.ok(!a.userId.includes('7F3Q'));                                                    // the code itself is never the id
  assert.equal(a.userId, 'guest:' + await guestId('7F3Q9XMA2PRW4HNT'));
  await assert.rejects(resolveAuth(H('KDB-BAD'), {}), (e) => e.status === 401 && e.code === 'bad_guest_code');
  assert.equal(await resolveAuth(H(CODE), { GUEST_AUTH: '0' }), null);                     // switched off
});

test('cloud save: write, read back on another device, revisions refuse a blind overwrite', async () => {
  const st = memSaves();
  assert.equal((await call(st, 'GET', '/api/save?game=archery', {})).status, 401);
  assert.equal((await call(st, 'GET', '/api/save?game=nope', H(CODE))).status, 400);
  let r = await call(st, 'GET', '/api/save?game=archery', H(CODE));
  assert.deepEqual(r.body, { game: 'archery', save: null });
  r = await call(st, 'POST', '/api/save', H(CODE), { game: 'archery', rev: 0, data: { tour: { stars: [3, 2] } } });
  assert.equal(r.status, 200); assert.equal(r.body.rev, 1);
  // phone B types the same code: it reads phone A's save
  r = await call(st, 'GET', '/api/save?game=archery', H('kdb 7f3q 9xma 2prw 4hnt'));
  assert.deepEqual(r.body.save.data, { tour: { stars: [3, 2] } }); assert.equal(r.body.save.rev, 1);
  // B writes on rev 1 -> 2; A (still on rev 1) is refused with B's save to merge
  assert.equal((await call(st, 'POST', '/api/save', H(CODE), { game: 'archery', rev: 1, data: { tour: { stars: [3, 3] } } })).body.rev, 2);
  r = await call(st, 'POST', '/api/save', H(CODE), { game: 'archery', rev: 1, data: { tour: { stars: [1, 0] } } });
  assert.equal(r.status, 409); assert.equal(r.body.error, 'stale_rev'); assert.deepEqual(r.body.save.data, { tour: { stars: [3, 3] } }); assert.equal(r.body.save.rev, 2);
  // a different code is a different player
  assert.equal((await call(st, 'GET', '/api/save?game=archery', H('KDB-0000-0000-0000-0001'))).body.save, null);
  // shape checks
  assert.equal((await call(st, 'POST', '/api/save', H(CODE), { game: 'archery', data: {} })).body.error, 'bad_rev');
  assert.equal((await call(st, 'POST', '/api/save', H(CODE), { game: 'archery', rev: 2, data: [1] })).body.error, 'bad_save');
  assert.equal((await call(st, 'POST', '/api/save', H(CODE), { game: 'archery', rev: 2, data: { x: 'y'.repeat(SAVE_MAX) } })).status, 413);
});

test('guest scores: the archery board ranks by stars under the guest identity', async () => {
  const st = memSaves();
  const r = await call(st, 'POST', '/api/scores', H(CODE, { 'x-guest-name': encodeURIComponent('Archer 7F3Q') }), { game: 'archery', metrics: { stars: 999, golds: 40, xs: 9, bestStreak: 6, cups: 1, junk: 5 } });
  assert.equal(r.status, 200); assert.equal(r.body.record.stars, 144); assert.equal(r.body.record.junk, undefined);
  assert.equal(r.body.record.name, 'Archer 7F3Q'); assert.match(r.body.record.userId, /^guest:/);
});

test('file store: saves persist and keep their revision', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kdlb-')), file = join(dir, 'lb.json');
  try {
    const a = createFileStore(file);
    assert.deepEqual(await a.putSave('archery', 'guest:x', '{"a":1}', 0), { ok: true, rev: 1 });
    assert.deepEqual(await a.putSave('archery', 'guest:x', '{"a":2}', 0), { ok: false });
    assert.deepEqual(await a.putSave('archery', 'guest:x', '{"a":2}', 1), { ok: true, rev: 2 });
    const b = createFileStore(file);                     // a fresh process reading the same file
    const s = await b.getSave('archery', 'guest:x');
    assert.equal(s.data, '{"a":2}'); assert.equal(s.rev, 2);
    assert.ok(JSON.parse(readFileSync(file, 'utf8'))._saves.archery['guest:x']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
