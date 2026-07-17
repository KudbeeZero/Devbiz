/* =====================================================================
 * Kudbee Leaderboard — test/auth.test.js
 * Targeted unit tests for shared/auth.js branches that test/api.test.js's
 * end-to-end flows don't reach:
 *   - frontendApiFromPublishableKey(): well-formed key, empty key, and a
 *     key whose payload isn't valid base64 (hits the try/catch).
 *   - issuerFromEnv()'s CLERK_PUBLISHABLE_KEY fallback (CLERK_ISSUER unset)
 *     — verified via a full, real Clerk JWT round trip so we know the
 *     derived issuer is actually the one used for verification, not just
 *     that some function returns a truthy string.
 *   - resolveAuth()'s ALGO-failure fallthrough: a malformed X-Algo-Message
 *     throws an error whose code does NOT start with "algo_"
 *     ("malformed_algo_message"), which per the resolveAuth() contract
 *     must fall through to try Clerk/demo rather than propagate.
 *   - getKey()'s JWKS TTL cache: cache-hit (no re-fetch) vs cache-expired
 *     (re-fetch), driven deterministically via a monkey-patched Date.now
 *     rather than real wall-clock timing.
 * Run:  node --test   (from the leaderboard/ folder)
 * ===================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frontendApiFromPublishableKey, clerkConfigured, resolveAuth } from '../shared/auth.js';

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

async function makeRsaKeyPairAndJwk(kid) {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  jwk.kid = kid; jwk.alg = 'RS256'; jwk.use = 'sig';
  return { pair, jwk };
}

// ---- frontendApiFromPublishableKey() -----------------------------------

test('frontendApiFromPublishableKey: well-formed pk_test_ decodes the frontend-api host', () => {
  const host = 'proud-koala-1.clerk.accounts.dev';
  const pk = 'pk_test_' + Buffer.from(host + '$').toString('base64');
  assert.equal(frontendApiFromPublishableKey(pk), host);
});

test('frontendApiFromPublishableKey: well-formed pk_live_ decodes the frontend-api host', () => {
  const host = 'app.clerk.example.com';
  const pk = 'pk_live_' + Buffer.from(host + '$').toString('base64');
  assert.equal(frontendApiFromPublishableKey(pk), host);
});

test('frontendApiFromPublishableKey: empty payload after the prefix returns null', () => {
  assert.equal(frontendApiFromPublishableKey('pk_test_'), null);
  assert.equal(frontendApiFromPublishableKey(''), null);
  assert.equal(frontendApiFromPublishableKey('nounderscoreparts'), null);
});

test('frontendApiFromPublishableKey: malformed base64 payload is caught and returns null', () => {
  // '!' and '?' are not valid base64 characters -> atob() throws -> caught.
  assert.equal(frontendApiFromPublishableKey('pk_test_!!!not_base64_at_all???'), null);
});

test('frontendApiFromPublishableKey: non-string input is caught and returns null', () => {
  assert.equal(frontendApiFromPublishableKey(null), null);
  assert.equal(frontendApiFromPublishableKey(undefined), null);
});

// ---- issuerFromEnv() CLERK_PUBLISHABLE_KEY fallback ---------------------
// issuerFromEnv() itself isn't exported, so we exercise its fallback branch
// (CLERK_ISSUER unset, CLERK_PUBLISHABLE_KEY set) the way production code
// actually depends on it: a full Clerk JWT verifies successfully using ONLY
// the derived issuer, both for the JWKS URL and the iss-claim match check.
test('issuerFromEnv fallback: CLERK_PUBLISHABLE_KEY alone (no CLERK_ISSUER) derives a working issuer', async () => {
  const host = 'fallback-app.clerk.accounts.dev';
  const issuer = 'https://' + host;
  const pk = 'pk_test_' + Buffer.from(host + '$').toString('base64');
  const kid = 'fallback-key-1';
  const { pair, jwk } = await makeRsaKeyPairAndJwk(kid);

  const env = { CLERK_PUBLISHABLE_KEY: pk }; // deliberately no CLERK_ISSUER
  assert.equal(clerkConfigured(env), true);
  assert.equal(clerkConfigured({}), false);

  const realFetch = globalThis.fetch;
  let fetchedUrl = null;
  globalThis.fetch = async (url) => { fetchedUrl = String(url); return { ok: true, json: async () => ({ keys: [jwk] }) }; };
  try {
    const token = await makeClerkToken({ sub: 'user_fallback', iss: issuer, kid, privateKey: pair.privateKey });
    const auth = await resolveAuth({ authorization: 'Bearer ' + token }, env);
    assert.equal(auth.userId, 'clerk:user_fallback');
    assert.equal(auth.demo, false);
    // The JWKS URL was built from the issuer *derived from the publishable key*.
    assert.equal(fetchedUrl, issuer + '/.well-known/jwks.json');

    // A token whose `iss` claim does NOT match the derived issuer is rejected —
    // proves the derived issuer is actually enforced, not just used for the URL.
    const wrongIssToken = await makeClerkToken({ sub: 'user_fallback', iss: 'https://someone-else.clerk.accounts.dev', kid, privateKey: pair.privateKey });
    await assert.rejects(() => resolveAuth({ authorization: 'Bearer ' + wrongIssToken }, env), (e) => e && e.authError && e.code === 'bad_issuer');
  } finally {
    globalThis.fetch = realFetch;
  }
});

// ---- resolveAuth(): ALGO-failure fallthrough -----------------------------
// verifyAlgoMessage() throws authError(401, 'malformed_algo_message') when the
// X-Algo-Message payload can't be parsed. That code does NOT start with
// "algo_", so per resolveAuth()'s contract it must NOT be rethrown — it must
// fall through and let Clerk/demo have a shot. We prove the fallthrough
// actually happens by making the *subsequent* Clerk attempt genuinely
// succeed, using the same Authorization header ALGO looked at and rejected.
test('resolveAuth: malformed ALGO message falls through to a successful Clerk auth', async () => {
  const issuer = 'https://algo-fallthrough.clerk.accounts.dev';
  const kid = 'algo-fallthrough-key';
  const { pair, jwk } = await makeRsaKeyPairAndJwk(kid);
  const env = { CLERK_ISSUER: issuer }; // ALGO_AUTH_ENABLED defaults to true

  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ keys: [jwk] }) });
  try {
    const token = await makeClerkToken({ sub: 'user_via_fallthrough', iss: issuer, kid, privateKey: pair.privateKey });
    const auth = await resolveAuth({
      authorization: 'Bearer ' + token,
      'x-algo-message': 'not-valid-base64-json-payload!!!', // -> parseAlgoMessage() returns null
    }, env);
    // If the ALGO catch had (incorrectly) rethrown, this would throw instead
    // of resolving — so a clean Clerk identity here proves the fallthrough.
    assert.equal(auth.userId, 'clerk:user_via_fallthrough');
    assert.equal(auth.demo, false);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('resolveAuth: a genuine ALGO-tagged failure (algo_*) IS rethrown, unlike the malformed-message case', async () => {
  // Contrast with the fallthrough tests above: when verifyAlgoMessage()
  // throws a code that DOES start with "algo_" (here: a well-formed
  // message but a garbage signature -> algo_signature_invalid... actually
  // parseAlgoMessage succeeds but decodeAlgoAddress on this address is
  // syntactically fine, so it reaches signature verification and fails
  // there), resolveAuth must rethrow immediately rather than trying
  // Clerk/demo — even though a valid demo identity is available right
  // alongside it.
  const now = Math.floor(Date.now() / 1000);
  const payload = { algo_address: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HVY', timestamp: now, nonce: 'rethrow_test_nonce', exp: now + 600 };
  const algoMsg = Buffer.from(JSON.stringify(payload)).toString('base64');
  const garbageSig = Buffer.alloc(64).toString('base64'); // well-formed length, wrong content

  await assert.rejects(
    () => resolveAuth({
      authorization: 'Bearer ' + garbageSig,
      'x-algo-message': algoMsg,
      'x-demo-user': 'shouldnotbereached', // demo must NOT be tried
    }, {}),
    (e) => e.authError === true && e.code.startsWith('algo_')
  );
});

test('resolveAuth: malformed ALGO message falls through to Clerk, which then reports its OWN failure (not an ALGO error)', async () => {
  // Same Authorization header is used for both the ALGO and Clerk attempts
  // (they aren't independent auth "slots") — so once ALGO's malformed
  // message swallows softly, Clerk still gets tried against the same
  // garbage bearer token and rejects it on its own terms. The important
  // assertion is WHICH error surfaces: a Clerk-flavored "malformed_token",
  // never an "algo_*" code — proving the ALGO catch didn't (incorrectly)
  // rethrow, and proving the fallthrough genuinely reached the Clerk path
  // rather than the exception just being lost.
  const env = { CLERK_ISSUER: 'https://unused.clerk.accounts.dev' };
  await assert.rejects(
    () => resolveAuth({
      authorization: 'Bearer not-a-real-jwt',
      'x-algo-message': 'also-not-valid-base64!!!',
    }, env),
    (e) => e.authError === true && e.code === 'malformed_token'
  );
});

test('resolveAuth: no Authorization header at all + demo allowed -> resolves via demo (ALGO/Clerk never attempted)', async () => {
  const auth = await resolveAuth({ 'x-demo-user': 'onlydemo' }, {});
  assert.equal(auth.userId, 'demo:onlydemo');
});

test('resolveAuth: no Authorization header and no demo identity -> null', async () => {
  const auth = await resolveAuth({}, {});
  assert.equal(auth, null);
});

// ---- getKey() JWKS TTL cache: deterministic hit vs expired ---------------
test('JWKS cache: repeated verification within TTL reuses the cache; past TTL refetches', async () => {
  const issuer = 'https://ttl-app.clerk.accounts.dev';
  const kid = 'ttl-key-1';
  const { pair, jwk } = await makeRsaKeyPairAndJwk(kid);
  const env = { CLERK_ISSUER: issuer };

  const realFetch = globalThis.fetch;
  const realDateNow = Date.now;
  let fetchCount = 0;
  globalThis.fetch = async () => { fetchCount++; return { ok: true, json: async () => ({ keys: [jwk] }) }; };
  try {
    let now = realDateNow();
    Date.now = () => now;

    const token = await makeClerkToken({ sub: 'ttl_user', iss: issuer, kid, privateKey: pair.privateKey, exp: Math.floor(now / 1000) + 3600, nbf: Math.floor(now / 1000) - 5 });

    // First call: cache miss -> one fetch.
    const a1 = await resolveAuth({ authorization: 'Bearer ' + token }, env);
    assert.equal(a1.userId, 'clerk:ttl_user');
    assert.equal(fetchCount, 1);

    // Second call, same (mocked) instant, well within the 10-minute TTL:
    // must reuse the cache -> no new fetch.
    const a2 = await resolveAuth({ authorization: 'Bearer ' + token }, env);
    assert.equal(a2.userId, 'clerk:ttl_user');
    assert.equal(fetchCount, 1, 'cache hit should not refetch JWKS');

    // Advance the mocked clock past the 10-minute JWKS_TTL_MS. The token's
    // own exp is 1 hour out, so this only exercises the JWKS cache branch,
    // not token expiry.
    now = now + 11 * 60 * 1000;
    Date.now = () => now;

    const a3 = await resolveAuth({ authorization: 'Bearer ' + token }, env);
    assert.equal(a3.userId, 'clerk:ttl_user');
    assert.equal(fetchCount, 2, 'expired cache should trigger exactly one refetch');
  } finally {
    globalThis.fetch = realFetch;
    Date.now = realDateNow;
  }
});
