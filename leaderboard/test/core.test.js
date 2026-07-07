/* =====================================================================
 * Kudbee Leaderboard — test/core.test.js
 * Targeted unit tests for shared/core.js branches that test/api.test.js's
 * happy-path scenarios don't reach: the health endpoint, the catch-all
 * 404, "unknown game" on every route, unauthenticated /api/me, a user with
 * no record yet, and the leaderboard's metric/limit-clamping branches.
 * Run:  node --test   (from the leaderboard/ folder)
 * ===================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runApi } from '../shared/http.js';
import { handle, gameDef, sanitizeMetrics } from '../shared/core.js';

function memStore() {
  const data = { darts: {} };
  return {
    async topByMetric(game, metric, limit) {
      const recs = Object.values(data[game] || {});
      recs.sort((a, b) => (b[metric] || 0) - (a[metric] || 0) || a.updatedAt - b.updatedAt);
      return recs.slice(0, limit).map((r) => ({ ...r }));
    },
    async getUser(game, id) { const r = (data[game] || {})[id]; return r ? { ...r } : null; },
    async count(game) { return Object.keys(data[game] || {}).length; },
    async upsertScore(game, id, name, metrics) {
      data[game] = data[game] || {};
      const prev = data[game][id] || { userId: id, game };
      const rec = { ...prev, userId: id, game, name };
      for (const k of Object.keys(metrics)) rec[k] = Math.max(prev[k] || 0, metrics[k]);
      rec.updatedAt = Date.now() + Math.random();
      data[game][id] = rec;
      return { ...rec };
    },
  };
}

const demoHeaders = (id, name) => ({ 'x-demo-user': id, 'x-demo-name': name });

// ---- /api/health ----------------------------------------------------------

test('GET /api/health returns ok + the game catalog', async () => {
  const r = await handle(memStore(), { method: 'GET', path: '/api/health', query: new URLSearchParams(), auth: null });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.service, 'kudbee-leaderboard');
  assert.deepEqual(r.body.games.sort(), Object.keys(gameDef('darts') ? { darts: 1, riff: 1, riff2: 1 } : {}).sort());
  assert.ok(r.body.games.includes('darts'));
});

test('GET /health (short alias) also resolves to the health payload', async () => {
  const r = await handle(memStore(), { method: 'GET', path: '/health', query: new URLSearchParams(), auth: null });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
});

// ---- catch-all 404 ---------------------------------------------------------

test('unmatched method/path falls through to a clean 404 not_found', async () => {
  const r = await handle(memStore(), { method: 'DELETE', path: '/api/scores', query: new URLSearchParams(), auth: null });
  assert.equal(r.status, 404);
  assert.equal(r.body.error, 'not_found');
});

test('unknown GET path falls through to 404 not_found', async () => {
  const r = await handle(memStore(), { method: 'GET', path: '/api/nonexistent', query: new URLSearchParams({ game: 'darts' }), auth: null });
  assert.equal(r.status, 404);
  assert.equal(r.body.error, 'not_found');
});

// ---- unknown_game across every route ---------------------------------------

test('leaderboard: unknown game -> 400 unknown_game', async () => {
  const r = await handle(memStore(), { method: 'GET', path: '/api/leaderboard', query: new URLSearchParams({ game: 'chess' }), auth: null });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'unknown_game');
});

test('me: unknown game -> 400 unknown_game (auth present)', async () => {
  const r = await handle(memStore(), { method: 'GET', path: '/api/me', query: new URLSearchParams({ game: 'chess' }), auth: { userId: 'demo:x' } });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'unknown_game');
});

test('scores: unknown game -> 400 unknown_game (auth present)', async () => {
  const r = await handle(memStore(), {
    method: 'POST', path: '/api/scores', query: new URLSearchParams(),
    auth: { userId: 'demo:x' }, body: { game: 'chess', metrics: { rating: 1 } },
  });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'unknown_game');
});

// ---- /api/me: auth required + no-record-yet branches -----------------------

test('GET /api/me without auth -> 401 auth_required', async () => {
  const r = await handle(memStore(), { method: 'GET', path: '/api/me', query: new URLSearchParams({ game: 'darts' }), auth: null });
  assert.equal(r.status, 401);
  assert.equal(r.body.error, 'auth_required');
});

test('GET /api/me for a user who has never submitted a score returns record:null, ranks:null', async () => {
  const r = await handle(memStore(), { method: 'GET', path: '/api/me', query: new URLSearchParams({ game: 'darts' }), auth: { userId: 'demo:ghost', demo: true } });
  assert.equal(r.status, 200);
  assert.equal(r.body.record, null);
  assert.equal(r.body.ranks, null);
  assert.equal(r.body.demo, true);
});

// ---- leaderboard: metric fallback + limit clamping --------------------------

test('leaderboard: an unranked/unknown metric query param falls back to the game primary', async () => {
  const store = memStore();
  await runApi(store, {}, { method: 'POST', path: '/api/scores', query: new URLSearchParams(), headers: demoHeaders('a', 'A'), body: { game: 'darts', metrics: { rating: 1000 } } });
  const r = await handle(store, { method: 'GET', path: '/api/leaderboard', query: new URLSearchParams({ game: 'darts', metric: 'not_a_real_metric' }), auth: null });
  assert.equal(r.status, 200);
  assert.equal(r.body.metric, 'rating'); // darts primary
});

test('leaderboard: non-numeric limit defaults to 50', async () => {
  const store = memStore();
  const r = await handle(store, { method: 'GET', path: '/api/leaderboard', query: new URLSearchParams({ game: 'darts', limit: 'lots' }), auth: null });
  assert.equal(r.status, 200); // no throw; store received the clamped default internally
});

test('leaderboard: limit above 100 clamps to 100, and below 1 clamps to 1', async () => {
  const store = memStore();
  const seen = [];
  const spyStore = { ...store, async topByMetric(game, metric, limit) { seen.push(limit); return store.topByMetric(game, metric, limit); } };
  await handle(spyStore, { method: 'GET', path: '/api/leaderboard', query: new URLSearchParams({ game: 'darts', limit: '9999' }), auth: null });
  await handle(spyStore, { method: 'GET', path: '/api/leaderboard', query: new URLSearchParams({ game: 'darts', limit: '-5' }), auth: null });
  assert.equal(seen[0], 100);
  assert.equal(seen[1], 1);
});

test('leaderboard: "you" is populated when the caller has a record, and omitted (null) otherwise', async () => {
  const store = memStore();
  await runApi(store, {}, { method: 'POST', path: '/api/scores', query: new URLSearchParams(), headers: demoHeaders('withrec', 'WithRec'), body: { game: 'darts', metrics: { rating: 1300 } } });

  const withRecord = await handle(store, { method: 'GET', path: '/api/leaderboard', query: new URLSearchParams({ game: 'darts' }), auth: { userId: 'demo:withrec' } });
  assert.equal(withRecord.body.you.value, 1300);

  const noRecord = await handle(store, { method: 'GET', path: '/api/leaderboard', query: new URLSearchParams({ game: 'darts' }), auth: { userId: 'demo:norecord' } });
  assert.equal(noRecord.body.you, null);
});

// ---- sanitizeMetrics: unknown game + non-finite values ----------------------

test('sanitizeMetrics: unknown game returns an empty object', () => {
  assert.deepEqual(sanitizeMetrics('not_a_game', { rating: 1500 }), {});
});

test('sanitizeMetrics: missing metrics object and non-finite values are both dropped, not crashed on', () => {
  assert.deepEqual(sanitizeMetrics('darts', undefined), {});
  assert.deepEqual(sanitizeMetrics('darts', { rating: 'not_a_number', bestCheckout: NaN, wins: 5 }), { wins: 5 });
});

// ---- handle(): request-shape edge cases --------------------------------------

test('handle: a plain-object query (no .get method) is normalized into URLSearchParams', async () => {
  const store = memStore();
  const r = await handle(store, { method: 'GET', path: '/api/leaderboard', query: { game: 'darts' }, auth: null });
  assert.equal(r.status, 200);
  assert.equal(r.body.game, 'darts');
});

test('handle: root path "/" (empty after trailing-slash strip) falls through to 404, not a crash', async () => {
  const store = memStore();
  const r = await handle(store, { method: 'GET', path: '/', query: new URLSearchParams(), auth: null });
  assert.equal(r.status, 404);
  assert.equal(r.body.error, 'not_found');
});

test('leaderboard: caller has a record but not the queried metric -> "you".value falls back to 0', async () => {
  const store = memStore();
  // Submit only `wins`, never `rating`.
  await runApi(store, {}, { method: 'POST', path: '/api/scores', query: new URLSearchParams(), headers: demoHeaders('winsonly', 'WinsOnly'), body: { game: 'darts', metrics: { wins: 3 } } });
  const r = await handle(store, { method: 'GET', path: '/api/leaderboard', query: new URLSearchParams({ game: 'darts', metric: 'rating' }), auth: { userId: 'demo:winsonly' } });
  assert.equal(r.body.you.value, 0);
});

test('POST /api/scores with no body at all -> no_valid_metrics (not a crash)', async () => {
  const store = memStore();
  const r = await handle(store, { method: 'POST', path: '/api/scores', query: new URLSearchParams({ game: 'darts' }), auth: { userId: 'demo:nobody', name: 'NoBody' } });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'no_valid_metrics');
});

test('POST /api/scores with only unknown/invalid metric keys -> 400 no_valid_metrics', async () => {
  const store = memStore();
  const r = await handle(store, {
    method: 'POST', path: '/api/scores', query: new URLSearchParams(),
    auth: { userId: 'demo:junkonly', name: 'JunkOnly' }, body: { game: 'darts', metrics: { notARealMetric: 5 } },
  });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'no_valid_metrics');
});

// ---- short-path route aliases (no /api prefix) -------------------------------
// The router accepts both `/api/scores` and `/scores` (etc.) — only the
// `/api/...` forms were exercised elsewhere; confirm the bare aliases
// actually route the same way rather than silently 404ing.

test('POST /scores (short alias) submits a score just like /api/scores', async () => {
  const store = memStore();
  const r = await handle(store, {
    method: 'POST', path: '/scores', query: new URLSearchParams(),
    auth: { userId: 'demo:aliasuser', name: 'AliasUser' }, body: { game: 'darts', metrics: { rating: 1400 } },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.record.userId, 'demo:aliasuser');
});

test('GET /leaderboard and /me (short aliases) route the same as their /api/ forms', async () => {
  const store = memStore();
  await handle(store, { method: 'POST', path: '/api/scores', query: new URLSearchParams(), auth: { userId: 'demo:aliaslb', name: 'AliasLb' }, body: { game: 'darts', metrics: { rating: 1100 } } });

  const lb = await handle(store, { method: 'GET', path: '/leaderboard', query: new URLSearchParams({ game: 'darts' }), auth: null });
  assert.equal(lb.status, 200);
  assert.equal(lb.body.entries[0].name, 'AliasLb');

  const me = await handle(store, { method: 'GET', path: '/me', query: new URLSearchParams({ game: 'darts' }), auth: { userId: 'demo:aliaslb' } });
  assert.equal(me.status, 200);
  assert.equal(me.body.record.name, 'AliasLb');
});
