/* =====================================================================
 * Kudbee Leaderboard — test/api.test.js
 * Exercises the shared core + auth end to end with an in-memory store:
 *   - demo-mode submit / leaderboard / me / ranking / validation
 *   - real Clerk RS256 JWT verification against a mocked JWKS (networkless)
 *   - demo refused once Clerk is configured (unless ALLOW_DEMO)
 * Run:  node --test   (from the leaderboard/ folder)
 * ===================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runApi } from '../shared/http.js';
import { resolveAuth, authError } from '../shared/auth.js';
import { cleanName, sanitizeMetrics } from '../shared/core.js';

// --- in-memory store implementing the core store interface -------------
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

test('unit: cleanName + sanitizeMetrics', () => {
  assert.equal(cleanName('  Spicy Name  '), 'Spicy Name');   // spaces preserved + trimmed
  assert.equal(cleanName('Spicy\nName'), 'SpicyName');        // control chars stripped
  assert.equal(cleanName(''), 'Anonymous');
  assert.equal(cleanName('x'.repeat(40)).length, 24);
  const m = sanitizeMetrics('darts', { rating: 1500, bestCheckout: 999, junk: 5, total180s: '12' });
  assert.equal(m.bestCheckout, 170);       // clamped to max
  assert.equal(m.total180s, 12);            // coerced from string
  assert.equal(m.junk, undefined);          // unknown dropped
});

test('demo: submit -> leaderboard -> me -> ranking', async () => {
  const store = memStore();
  const env = {}; // keyless -> demo allowed

  // Two players publish.
  let r = await runApi(store, env, {
    method: 'POST', path: '/api/scores', query: new URLSearchParams(),
    headers: demoHeaders('alice', 'Alice'),
    body: { game: 'darts', metrics: { rating: 1500, bestCheckout: 120, total180s: 3, wins: 5 } },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.record.name, 'Alice');
  assert.equal(r.body.ranks.rating, 1);

  r = await runApi(store, env, {
    method: 'POST', path: '/api/scores', query: new URLSearchParams(),
    headers: demoHeaders('bob', 'Bob'),
    body: { game: 'darts', metrics: { rating: 1800, bestCheckout: 100, wins: 9 } },
  });
  assert.equal(r.body.ranks.rating, 1);     // Bob now #1 by rating

  // Leaderboard by rating: Bob first, Alice flagged as "you" for Alice's view.
  r = await runApi(store, env, {
    method: 'GET', path: '/api/leaderboard',
    query: new URLSearchParams({ game: 'darts', metric: 'rating' }),
    headers: demoHeaders('alice', 'Alice'),
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.entries[0].name, 'Bob');
  assert.equal(r.body.entries[0].value, 1800);
  assert.equal(r.body.entries[1].name, 'Alice');
  assert.equal(r.body.entries[1].you, true);

  // Best-ever is kept: re-submit Alice with a worse rating but better checkout.
  r = await runApi(store, env, {
    method: 'POST', path: '/api/scores', query: new URLSearchParams(),
    headers: demoHeaders('alice', 'Alice'),
    body: { game: 'darts', metrics: { rating: 10, bestCheckout: 150 } },
  });
  const me = await runApi(store, env, {
    method: 'GET', path: '/api/me', query: new URLSearchParams({ game: 'darts' }),
    headers: demoHeaders('alice', 'Alice'),
  });
  assert.equal(me.body.record.rating, 1500);     // unchanged (best kept)
  assert.equal(me.body.record.bestCheckout, 150); // improved
});

test('riff: score metrics validate + rank by score', async () => {
  // Validation: unknown dropped, accuracy clamped to 0..100, strings coerced.
  const m = sanitizeMetrics('riff', { score: 123456, bestCombo: 240, accuracy: '97', junk: 1 });
  assert.equal(m.score, 123456);
  assert.equal(m.bestCombo, 240);
  assert.equal(m.accuracy, 97);
  assert.equal(m.junk, undefined);
  assert.equal(sanitizeMetrics('riff', { accuracy: 250 }).accuracy, 100);

  const store = memStore();
  await runApi(store, {}, {
    method: 'POST', path: '/api/scores', query: new URLSearchParams(),
    headers: demoHeaders('nova', 'Nova'),
    body: { game: 'riff', metrics: { score: 50000, bestCombo: 120, accuracy: 88 } },
  });
  const r = await runApi(store, {}, {
    method: 'POST', path: '/api/scores', query: new URLSearchParams(),
    headers: demoHeaders('echo', 'Echo'),
    body: { game: 'riff', metrics: { score: 161545, bestCombo: 177, accuracy: 99 } },
  });
  assert.equal(r.body.ranks.score, 1);                 // Echo tops the board

  const lb = await runApi(store, {}, {
    method: 'GET', path: '/api/leaderboard',
    query: new URLSearchParams({ game: 'riff' }),       // primary metric defaults to score
    headers: demoHeaders('nova', 'Nova'),
  });
  assert.equal(lb.body.metric, 'score');
  assert.equal(lb.body.entries[0].name, 'Echo');
  assert.equal(lb.body.entries[0].value, 161545);
  assert.equal(lb.body.entries[1].name, 'Nova');
  assert.equal(lb.body.entries[1].you, true);
});

test('auth required without identity', async () => {
  const store = memStore();
  const r = await runApi(store, {}, {
    method: 'POST', path: '/api/scores', query: new URLSearchParams(),
    headers: {}, body: { game: 'darts', metrics: { rating: 1 } },
  });
  assert.equal(r.status, 401);
});

test('demo refused once Clerk is configured', async () => {
  const env = { CLERK_ISSUER: 'https://x.clerk.accounts.dev' };
  const auth = await resolveAuth(demoHeaders('mallory', 'Mallory'), env);
  assert.equal(auth, null);
  // ...unless explicitly allowed
  const auth2 = await resolveAuth(demoHeaders('mallory', 'Mallory'), { ...env, ALLOW_DEMO: '1' });
  assert.equal(auth2.userId, 'demo:mallory');
});

// ---- Real Clerk JWT verification against a mocked JWKS ----------------
function b64url(buf) { return Buffer.from(buf).toString('base64url'); }

async function makeClerkToken({ sub, iss, kid, privateKey, exp, nbf }) {
  const header = { alg: 'RS256', typ: 'JWT', kid };
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub, iss, name: 'Clerk User', iat: now, nbf: nbf ?? now - 5, exp: exp ?? now + 3600 };
  const signingInput = b64url(JSON.stringify(header)) + '.' + b64url(JSON.stringify(payload));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey,
    new TextEncoder().encode(signingInput));
  return signingInput + '.' + b64url(new Uint8Array(sig));
}

test('clerk: valid RS256 token verifies; expired rejected', async () => {
  const issuer = 'https://test-app.clerk.accounts.dev';
  const kid = 'test-key-1';
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  jwk.kid = kid; jwk.alg = 'RS256'; jwk.use = 'sig';

  // Mock the network: any fetch returns our JWKS.
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ keys: [jwk] }) });
  try {
    const env = { CLERK_ISSUER: issuer };
    const store = memStore();

    const token = await makeClerkToken({ sub: 'user_abc', iss: issuer, kid, privateKey: pair.privateKey });
    const auth = await resolveAuth({ authorization: 'Bearer ' + token }, env);
    assert.equal(auth.userId, 'clerk:user_abc');
    assert.equal(auth.demo, false);
    assert.equal(auth.name, 'Clerk User');

    // End-to-end submit with the real token through runApi.
    const r = await runApi(store, env, {
      method: 'POST', path: '/api/scores', query: new URLSearchParams(),
      headers: { authorization: 'Bearer ' + token },
      body: { game: 'darts', metrics: { rating: 2000 } },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.record.userId, 'clerk:user_abc');

    // Expired token -> 401 at the adapter.
    const expired = await makeClerkToken({ sub: 'user_abc', iss: issuer, kid, privateKey: pair.privateKey, exp: Math.floor(Date.now() / 1000) - 600 });
    const r2 = await runApi(store, env, {
      method: 'GET', path: '/api/me', query: new URLSearchParams({ game: 'darts' }),
      headers: { authorization: 'Bearer ' + expired },
    });
    assert.equal(r2.status, 401);
    assert.equal(r2.body.error, 'token_expired');

    // Tampered signature -> rejected.
    const bad = token.slice(0, -4) + 'AAAA';
    await assert.rejects(() => resolveAuth({ authorization: 'Bearer ' + bad }, env));
  } finally {
    globalThis.fetch = realFetch;
  }
});
