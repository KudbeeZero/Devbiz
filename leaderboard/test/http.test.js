/* =====================================================================
 * Kudbee Leaderboard — test/http.test.js
 * Targeted unit tests for shared/http.js, which had effectively no direct
 * coverage: corsHeaders() was never called by any test, and runApi()'s two
 * failure-fallback branches (auth resolution throwing something that isn't
 * an authError, and the core handler throwing unexpectedly) were never
 * exercised.
 * Run:  node --test   (from the leaderboard/ folder)
 * ===================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { corsHeaders, runApi } from '../shared/http.js';

// ---- corsHeaders() -------------------------------------------------------

test('corsHeaders: default "*" allows any origin', () => {
  const h = corsHeaders('https://example.com', '*');
  assert.equal(h['access-control-allow-origin'], '*');
  assert.equal(h['access-control-allow-methods'], 'GET, POST, OPTIONS');
  assert.equal(h['access-control-allow-headers'], 'authorization, content-type, x-demo-user, x-demo-name');
  assert.equal(h['access-control-max-age'], '86400');
  assert.equal(h.vary, 'origin');
});

test('corsHeaders: no allowed-list argument defaults to "*"', () => {
  const h = corsHeaders('https://example.com');
  assert.equal(h['access-control-allow-origin'], '*');
});

test('corsHeaders: origin present in the allow-list is echoed back', () => {
  const h = corsHeaders('https://kudbee.dev', ['https://kudbee.dev', 'https://staging.kudbee.dev']);
  assert.equal(h['access-control-allow-origin'], 'https://kudbee.dev');
});

test('corsHeaders: origin NOT in the allow-list falls back to the first allowed origin', () => {
  const h = corsHeaders('https://evil.example', ['https://kudbee.dev', 'https://staging.kudbee.dev']);
  assert.equal(h['access-control-allow-origin'], 'https://kudbee.dev');
});

test('corsHeaders: no origin header with an allow-list falls back to the first allowed origin', () => {
  const h = corsHeaders(null, ['https://kudbee.dev']);
  assert.equal(h['access-control-allow-origin'], 'https://kudbee.dev');
});

test('corsHeaders: single-string allow-list (not "*") is used directly', () => {
  const h = corsHeaders('https://anything.example', 'https://kudbee.dev');
  assert.equal(h['access-control-allow-origin'], 'https://kudbee.dev');
});

test('corsHeaders: empty array allow-list falls back to "*"', () => {
  const h = corsHeaders('https://example.com', []);
  assert.equal(h['access-control-allow-origin'], '*');
});

// ---- runApi(): auth-resolution failure fallback --------------------------
// resolveAuth() itself never lets a plain (non-authError) exception escape —
// every internal catch either rethrows a tagged authError or swallows it.
// But header lookups happen *outside* those internal try/catches, so a
// `headers`-like object whose `.get()` throws demonstrates runApi()'s own
// defensive fallback: an unexpected, untagged failure during auth resolution
// degrades to a clean 401 "auth_failed" instead of crashing the request.
test('runApi: auth resolution throwing a non-authError exception degrades to 401 auth_failed', async () => {
  const store = { async topByMetric() { return []; }, async getUser() { return null; }, async count() { return 0; }, async upsertScore() { return {}; } };
  const brokenHeaders = { get() { throw new Error('boom: header store unavailable'); } };
  const r = await runApi(store, {}, {
    method: 'POST', path: '/api/scores', query: new URLSearchParams(),
    headers: brokenHeaders, body: { game: 'darts', metrics: { rating: 1 } },
  });
  assert.equal(r.status, 401);
  assert.equal(r.body.error, 'auth_failed');
});

// ---- runApi(): core-handler failure fallback ------------------------------
test('runApi: a throwing store surfaces as a clean 500 internal_error (not a crash)', async () => {
  const brokenStore = {
    async topByMetric() { throw new Error('store backend unavailable'); },
    async getUser() { return null; },
    async count() { return 0; },
    async upsertScore() { return {}; },
  };
  const r = await runApi(brokenStore, {}, {
    method: 'GET', path: '/api/leaderboard', query: new URLSearchParams({ game: 'darts' }),
    headers: { 'x-demo-user': 'alice' },
  });
  assert.equal(r.status, 500);
  assert.equal(r.body.error, 'internal_error');
  assert.match(r.body.detail, /store backend unavailable/);
});

test('runApi: a store that throws a non-Error (no .message) still produces a readable 500 detail', async () => {
  // Exercises the `String(e && e.message || e)` fallback when the thrown
  // value has no .message (e.g. a plain string or object thrown instead
  // of an Error instance) — a real possibility with third-party store
  // adapters.
  const brokenStore = {
    async topByMetric() { throw 'plain string failure, not an Error instance'; },
    async getUser() { return null; },
    async count() { return 0; },
    async upsertScore() { return {}; },
  };
  const r = await runApi(brokenStore, {}, {
    method: 'GET', path: '/api/leaderboard', query: new URLSearchParams({ game: 'darts' }),
    headers: { 'x-demo-user': 'alice' },
  });
  assert.equal(r.status, 500);
  assert.equal(r.body.error, 'internal_error');
  assert.equal(r.body.detail, 'plain string failure, not an Error instance');
});

test('runApi: happy path still resolves normally (sanity check against the failure tests above)', async () => {
  const store = { async topByMetric() { return []; }, async getUser() { return null; }, async count() { return 0; }, async upsertScore(game, id, name, metrics) { return { userId: id, game, name, ...metrics }; } };
  const r = await runApi(store, {}, {
    method: 'POST', path: '/api/scores', query: new URLSearchParams(),
    headers: { 'x-demo-user': 'sanity' }, body: { game: 'darts', metrics: { rating: 1200 } },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.record.userId, 'demo:sanity');
});
