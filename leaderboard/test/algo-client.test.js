/* =====================================================================
 * Kudbee Leaderboard — test/algo-client.test.js
 * Node-side unit tests for the pure, DOM-free helpers inside
 * client/kd-leaderboard.js (nonce generation, payload shape, base64
 * encoding). These are NOT part of the shared/ coverage gate (client/ is
 * intentionally excluded — see .c8rc.json) but exist to verify the exact
 * wire format the browser SDK sends matches what shared/algo-auth.js
 * expects to verify.
 * ===================================================================== */

import test from 'node:test';
import assert from 'node:assert';

// Side-effect import: this file is authored as a classic-<script>-compatible
// IIFE (no `export`), so it attaches to globalThis.KDLeaderboard when evaluated.
import '../client/kd-leaderboard.js';
import { TEST_UTILS, reconstructSignedMessage } from '../shared/algo-auth.js';

const { randomNonce, buildAlgoPayload, payloadToBase64, bytesToBase64, frontendApiFromPk } =
  globalThis.KDLeaderboard.TEST_UTILS;

test('randomNonce: produces a hex string within algo-auth\'s 8-64 char bound', () => {
  const nonce = randomNonce();
  assert.strictEqual(typeof nonce, 'string');
  assert(nonce.length >= 8 && nonce.length <= 64, `nonce length ${nonce.length} out of bounds`);
  assert(/^[0-9a-f]+$/.test(nonce), 'nonce should be lowercase hex');
});

test('randomNonce: two calls produce different values', () => {
  const a = randomNonce();
  const b = randomNonce();
  assert.notStrictEqual(a, b);
});

test('buildAlgoPayload: shape matches what shared/algo-auth.js expects', () => {
  const address = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HVY';
  const payload = buildAlgoPayload(address, 600, 1_700_000_000);

  assert.strictEqual(payload.algo_address, address);
  assert.strictEqual(payload.timestamp, 1_700_000_000);
  assert.strictEqual(payload.exp, 1_700_000_600);
  assert.strictEqual(typeof payload.nonce, 'string');
  assert(payload.nonce.length >= 8 && payload.nonce.length <= 64);
});

test('buildAlgoPayload: default max age is 600 seconds', () => {
  const now = 1_700_000_000;
  const payload = buildAlgoPayload('ADDR', undefined, now);
  assert.strictEqual(payload.exp - payload.timestamp, 600);
});

test('buildAlgoPayload: field order matches reconstructSignedMessage on the server', () => {
  // The server signs/verifies `{ algo_address, timestamp, nonce, exp }` in that
  // exact key order. JSON.stringify emits string keys in insertion order, so if
  // the client's object literal isn't built in this order the signed bytes on
  // each side would silently diverge (wallet-signed bytes != server-reconstructed
  // bytes) and every real signature would fail verification.
  const payload = buildAlgoPayload('SOME_ADDRESS', 600, 1_700_000_000);
  const clientBytes = JSON.stringify(payload);
  const serverBytes = new TextDecoder().decode(reconstructSignedMessage(payload));
  assert.strictEqual(clientBytes, serverBytes);
});

test('payloadToBase64: round-trips through atob/JSON.parse', () => {
  const payload = buildAlgoPayload('ADDR123', 600, 1_700_000_000);
  const b64 = payloadToBase64(payload);
  const decoded = JSON.parse(atob(b64));
  assert.deepStrictEqual(decoded, payload);
});

test('payloadToBase64: matches parseAlgoMessage on the server (round-trip through the real verifier)', () => {
  const payload = buildAlgoPayload('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HVY', 600, 1_700_000_000);
  const b64 = payloadToBase64(payload);
  const parsed = TEST_UTILS.parseAlgoMessage(b64);
  assert.deepStrictEqual(parsed, payload);
});

test('bytesToBase64: encodes a 64-byte ed25519 signature correctly', () => {
  const sig = new Uint8Array(64);
  for (let i = 0; i < 64; i++) sig[i] = i * 4;
  const b64 = bytesToBase64(sig);

  // Round-trip via Buffer (Node) to confirm exact byte equality.
  const roundTripped = new Uint8Array(Buffer.from(b64, 'base64'));
  assert.deepStrictEqual(roundTripped, sig);
});

test('bytesToBase64: empty array encodes to empty string', () => {
  assert.strictEqual(bytesToBase64(new Uint8Array(0)), '');
});

test('frontendApiFromPk: decodes a Clerk publishable key (unchanged from Phase 1)', () => {
  const host = 'example.clerk.accounts.dev';
  const pk = 'pk_test_' + btoa(host + '$');
  assert.strictEqual(frontendApiFromPk(pk), host);
});

test('frontendApiFromPk: malformed key returns null, not a throw', () => {
  assert.strictEqual(frontendApiFromPk('not_a_real_key'), null);
  assert.strictEqual(frontendApiFromPk(''), null);
});
