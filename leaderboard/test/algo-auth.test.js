/* =====================================================================
 * Kudbee Leaderboard — test/algo-auth.test.js
 * Test suite for ALGO wallet authentication.
 * ===================================================================== */

import test from 'node:test';
import assert from 'node:assert';
import {
  verifyAlgoMessage,
  isAlgoAuthEnabled,
  authError,
  TEST_UTILS,
} from '../shared/algo-auth.js';

const {
  decodeAlgoAddress,
  extractPublicKeyFromAddress,
  publicKeyToAddress,
  verifySignature,
  parseAlgoMessage,
  reconstructSignedMessage,
} = TEST_UTILS;

// ---- Test utilities ---------------------------------------------------

/**
 * Create a mock ALGO message payload.
 * In real usage, this would be signed by the wallet.
 *
 * Algorand addresses are 58 chars: 52 chars base32 key + 6 chars checksum (base32).
 * Format: A-Z and 2-7 characters only.
 */
function mockAlgoPayload(address, timestamp = null, nonce = null, exp = null) {
  const now = Math.floor(Date.now() / 1000);
  // Valid format: 58-char Algorand address (base32)
  // This is a dummy address; real verification would need an actual Pera signature
  return {
    algo_address: address || 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HVY', // 58 chars
    timestamp: timestamp !== null ? timestamp : now,
    nonce: nonce || 'test_nonce_' + Math.random().toString(36).slice(2),
    exp: exp !== null ? exp : now + 600, // 10 min default expiration
  };
}

function payloadToBase64(payload) {
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

// Minimal standalone base32 encoder (RFC 4648, no padding) used ONLY to
// build synthetic test addresses byte-for-byte. Independent of the
// source's own encode logic in publicKeyToAddress() — this is test
// infrastructure, not a re-test of the implementation.
function encodeBase32NoPad(bytes) {
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const byte of bytes) bits += byte.toString(2).padStart(8, '0');
  let encoded = '';
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.substr(i, 5).padEnd(5, '0');
    encoded += ALPHABET[parseInt(chunk, 2)];
  }
  return encoded;
}

function concatBytes(a, b) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

// ---- Tests: Message parsing -------------------------------------------

test('parseAlgoMessage: valid payload', () => {
  const payload = mockAlgoPayload();
  const b64 = payloadToBase64(payload);
  const parsed = parseAlgoMessage(b64);

  assert.strictEqual(parsed.algo_address, payload.algo_address);
  assert.strictEqual(parsed.timestamp, payload.timestamp);
  assert.strictEqual(parsed.nonce, payload.nonce);
  assert.strictEqual(parsed.exp, payload.exp);
});

test('parseAlgoMessage: malformed base64', () => {
  const parsed = parseAlgoMessage('not-valid-base64!!!');
  assert.strictEqual(parsed, null);
});

test('parseAlgoMessage: missing address', () => {
  const payload = { timestamp: 1234, nonce: 'test', exp: 5678 };
  const b64 = payloadToBase64(payload);
  const parsed = parseAlgoMessage(b64);
  assert.strictEqual(parsed, null);
});

test('parseAlgoMessage: invalid nonce (too short)', () => {
  const payload = mockAlgoPayload('AAAAA...AAAAA', null, 'short');
  const b64 = payloadToBase64(payload);
  const parsed = parseAlgoMessage(b64);
  assert.strictEqual(parsed, null);
});

// ---- Tests: Environment config ----------------------------------------

test('isAlgoAuthEnabled: default (true)', () => {
  assert.strictEqual(isAlgoAuthEnabled({}), true);
  assert.strictEqual(isAlgoAuthEnabled({ ALGO_AUTH_ENABLED: undefined }), true);
});

test('isAlgoAuthEnabled: explicit enable', () => {
  assert.strictEqual(isAlgoAuthEnabled({ ALGO_AUTH_ENABLED: '1' }), true);
  assert.strictEqual(isAlgoAuthEnabled({ ALGO_AUTH_ENABLED: 'true' }), true);
  assert.strictEqual(isAlgoAuthEnabled({ ALGO_AUTH_ENABLED: 'yes' }), true);
});

test('isAlgoAuthEnabled: explicit disable', () => {
  assert.strictEqual(isAlgoAuthEnabled({ ALGO_AUTH_ENABLED: '0' }), false);
  assert.strictEqual(isAlgoAuthEnabled({ ALGO_AUTH_ENABLED: 'false' }), false);
  assert.strictEqual(isAlgoAuthEnabled({ ALGO_AUTH_ENABLED: 'no' }), false);
});

// ---- Tests: Error creation -----------------------------------------------

test('authError: creates proper error object', () => {
  const err = authError(401, 'test_code');
  assert.strictEqual(err.message, 'test_code');
  assert.strictEqual(err.status, 401);
  assert.strictEqual(err.code, 'test_code');
  assert.strictEqual(err.authError, true);
});

// ---- Tests: Algorand address utilities (mocking) ----------------------

test('extractPublicKeyFromAddress: stub (needs real Algorand test addresses)', () => {
  // In production, this would be tested with real Algorand addresses.
  // For now, we verify the function returns null for invalid input.
  const result = extractPublicKeyFromAddress('invalid');
  assert.strictEqual(result, null);

  const result2 = extractPublicKeyFromAddress('');
  assert.strictEqual(result2, null);
});

test('publicKeyToAddress: converts 32-byte key to Algorand address (or null if the runtime lacks SHA-512/256)', async () => {
  // Create a 32-byte public key (all zeros for testing)
  const publicKey = new Uint8Array(32);

  const address = await publicKeyToAddress(publicKey);

  // publicKeyToAddress() computes the 4-byte checksum via
  // crypto.subtle.digest('SHA-512/256', ...). Node's WebCrypto does NOT
  // implement that algorithm ("Unrecognized algorithm name" — verified
  // directly against globalThis.crypto.subtle in this repo's Node 22 test
  // runtime), so the function's own try/catch always lands in the catch
  // and returns null here. Cloudflare Workers' documented
  // SubtleCrypto.digest() algorithm list (MD5/SHA-1/256/384/512 only, no
  // SHA-512/256) suggests this isn't just a Node quirk either — see the
  // DBZ-060 PR notes ("Found but not changed": ALGO wallet auth's
  // address-recovery check may never succeed on either runtime as
  // written). Out of scope for this CI/tests-only PR.
  if (address !== null) {
    // If a future runtime *does* implement SHA-512/256, assert the
    // expected shape rather than silently accepting anything.
    assert.strictEqual(typeof address, 'string');
    assert.strictEqual(address.length, 58);
    assert(/^[A-Z2-7]{58}$/.test(address));
  } else {
    assert.strictEqual(address, null);
  }
});

test('publicKeyToAddress: null key returns null', async () => {
  const result = await publicKeyToAddress(null);
  assert.strictEqual(result, null);
});

test('publicKeyToAddress: wrong key length returns null', async () => {
  const shortKey = new Uint8Array(16);
  const result = await publicKeyToAddress(shortKey);
  assert.strictEqual(result, null);
});

// ---- Tests: Message reconstruction (signing baseline) -------------------

test('reconstructSignedMessage: produces deterministic JSON', () => {
  const payload = mockAlgoPayload();
  const msg = reconstructSignedMessage(payload);

  // Reconstruct again and verify it's identical
  const msg2 = reconstructSignedMessage(payload);
  assert.deepStrictEqual(msg, msg2);

  // Verify it's a string with no extra whitespace
  const str = new TextDecoder().decode(msg);
  assert.strictEqual(str.includes(' '), false);
  assert.strictEqual(str.startsWith('{'), true);
});

test('reconstructSignedMessage: fields in consistent order', () => {
  const payload = mockAlgoPayload();
  const msg = reconstructSignedMessage(payload);
  const str = new TextDecoder().decode(msg);

  // Expected order: algo_address, timestamp, nonce, exp
  const addressIdx = str.indexOf('algo_address');
  const timestampIdx = str.indexOf('timestamp');
  const nonceIdx = str.indexOf('nonce');
  const expIdx = str.indexOf('exp');

  assert(addressIdx < timestampIdx);
  assert(timestampIdx < nonceIdx);
  assert(nonceIdx < expIdx);
});

// ---- Tests: Signature verification (mock scenarios) -------------------

test('verifyAlgoMessage: expired signature', async () => {
  const now = Math.floor(Date.now() / 1000);
  const payload = mockAlgoPayload(
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HVY',
    now - 100,
    'nonce_' + Math.random().toString(36).slice(2),
    now - 10
  );
  const b64 = payloadToBase64(payload);

  try {
    await verifyAlgoMessage('invalid_sig', b64, {});
    assert.fail('should have thrown');
  } catch (e) {
    assert.strictEqual(e.code, 'algo_signature_expired');
  }
});

test('verifyAlgoMessage: timestamp too old', async () => {
  const now = Math.floor(Date.now() / 1000);
  const maxAge = 600;
  const payload = mockAlgoPayload(
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HVY',
    now - maxAge - 100, // older than 10 min
    'nonce_' + Math.random().toString(36).slice(2),
    now + 100
  );
  const b64 = payloadToBase64(payload);

  try {
    await verifyAlgoMessage('invalid_sig', b64, { ALGO_MAX_AGE_SECONDS: maxAge });
    assert.fail('should have thrown');
  } catch (e) {
    assert.strictEqual(e.code, 'algo_timestamp_too_old');
  }
});

test('verifyAlgoMessage: timestamp in future (clock skew)', async () => {
  const now = Math.floor(Date.now() / 1000);
  const payload = mockAlgoPayload(
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HVY',
    now + 60,
    'nonce_' + Math.random().toString(36).slice(2),
    now + 600
  );
  const b64 = payloadToBase64(payload);

  try {
    await verifyAlgoMessage('invalid_sig', b64, {});
    assert.fail('should have thrown');
  } catch (e) {
    assert.strictEqual(e.code, 'algo_timestamp_in_future');
  }
});

test('verifyAlgoMessage: malformed base64', async () => {
  try {
    await verifyAlgoMessage('bad_sig', 'not-base64!!!', {});
    assert.fail('should have thrown');
  } catch (e) {
    assert.strictEqual(e.code, 'malformed_algo_message');
  }
});

test('verifyAlgoMessage: invalid address format', async () => {
  const now = Math.floor(Date.now() / 1000);
  // Use a long invalid address (passes length check but not Algorand format)
  const payload = mockAlgoPayload('0000000000000000000000000000000000000000000000000000000000000000', now, 'nonce_' + Math.random().toString(36).slice(2), now + 600);
  const b64 = payloadToBase64(payload);

  try {
    // Use a valid base64-encoded 64-byte signature
    const validSig = Buffer.alloc(64).toString('base64');
    await verifyAlgoMessage(validSig, b64, {});
    assert.fail('should have thrown');
  } catch (e) {
    // Will fail at address validation since address can't be decoded
    // (invalid base32 or incorrect length)
    assert(e.code === 'algo_address_invalid' || e.code === 'algo_signature_invalid' || e.code === 'algo_address_mismatch');
  }
});

test('verifyAlgoMessage: nonce replay is rejected deterministically (pre-seeded used_nonces)', async () => {
  // The replay check (line ~215) runs BEFORE signature verification, so it
  // can be exercised deterministically without any real signing: seed
  // used_nonces with the exact nonce the payload carries, and confirm the
  // call throws algo_nonce_replayed rather than falling through to (and
  // failing on) signature verification.
  const now = Math.floor(Date.now() / 1000);
  const payload = mockAlgoPayload(
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HVY',
    now,
    'replay_nonce_seeded',
    now + 600
  );
  const b64 = payloadToBase64(payload);
  const used_nonces = new Set(['replay_nonce_seeded']);

  await assert.rejects(
    () => verifyAlgoMessage('anything', b64, {}, used_nonces),
    (e) => e.code === 'algo_nonce_replayed'
  );
  // The set must still contain exactly the one seeded nonce — a replay
  // rejection must not re-add or mutate it.
  assert.strictEqual(used_nonces.size, 1);
});

test('verifyAlgoMessage: a fresh nonce is recorded in used_nonces before signature verification', async () => {
  const now = Math.floor(Date.now() / 1000);
  const payload = mockAlgoPayload(
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HVY',
    now,
    'fresh_nonce_recorded',
    now + 600
  );
  const b64 = payloadToBase64(payload);
  const used_nonces = new Set();

  // Signature is garbage so this still throws — but AFTER the nonce has
  // been recorded (recording happens before signature decode/verify).
  await assert.rejects(() => verifyAlgoMessage('invalid_sig', b64, {}, used_nonces));
  assert.strictEqual(used_nonces.has('fresh_nonce_recorded'), true);
});

test('verifyAlgoMessage: non-string signature is a malformed signature (Buffer.from throws on non-strings)', async () => {
  // Buffer.from(str, 'base64') never throws for garbage *strings* in Node
  // (invalid characters are silently skipped) — so the only deterministic
  // way to hit the algo_signature_malformed catch (line ~231) is a
  // non-string sig_b64, which Buffer.from() rejects with a TypeError.
  const now = Math.floor(Date.now() / 1000);
  const payload = mockAlgoPayload(
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HVY',
    now,
    'malformed_sig_nonce',
    now + 600
  );
  const b64 = payloadToBase64(payload);

  await assert.rejects(
    () => verifyAlgoMessage(null, b64, {}),
    (e) => e.code === 'algo_signature_malformed' && e.status === 401
  );
});

test('verifyAlgoMessage: a genuinely valid ed25519 signature reaches address-consistency, not signature failure', async () => {
  // End-to-end with REAL ed25519 signing (Node 22's WebCrypto supports
  // Ed25519 natively — verified directly). This proves the function's
  // "happy path" plumbing — message reconstruction, signature
  // verification succeeding, and the address-recovery check — actually
  // runs, rather than every test only ever exercising early-exit branches.
  //
  // We deliberately do NOT assert a successful return here: recovering
  // the address back from the public key requires
  // crypto.subtle.digest('SHA-512/256', ...), which this runtime doesn't
  // implement (see the publicKeyToAddress test above) — so the recovered
  // address is always null, and the call always ends in
  // algo_address_mismatch even though the signature itself verified.
  // That is the real, current behavior of this code path today.
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const pubKeyBytes = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));

  // Build a syntactically valid 58-char base32 Algorand-shaped address
  // whose first 32 bytes are the real public key (the trailing checksum
  // bytes don't need to be cryptographically correct — extractPublicKeyFromAddress
  // never validates them, it only slices the first 32 bytes).
  const address = encodeBase32NoPad(concatBytes(pubKeyBytes, new Uint8Array(4)));
  assert.strictEqual(address.length, 58);

  const now = Math.floor(Date.now() / 1000);
  const payload = { algo_address: address, timestamp: now, nonce: 'real_sig_e2e_nonce', exp: now + 600 };
  const message = reconstructSignedMessage(payload);
  const signature = new Uint8Array(await crypto.subtle.sign('Ed25519', pair.privateKey, message));
  const sig_b64 = Buffer.from(signature).toString('base64');
  const payload_b64 = payloadToBase64(payload);

  await assert.rejects(
    () => verifyAlgoMessage(sig_b64, payload_b64, {}),
    (e) => e.code === 'algo_address_mismatch' // NOT algo_signature_invalid — proves the sig verified
  );
});

test('verifyAlgoMessage: malformed signature (wrong length)', async () => {
  const now = Math.floor(Date.now() / 1000);
  const payload = mockAlgoPayload(
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HVY',
    now,
    'nonce_' + Math.random().toString(36).slice(2),
    now + 600
  );
  const b64 = payloadToBase64(payload);

  try {
    // Base64-encoded short signature (will decode to < 64 bytes)
    const shortSig = Buffer.alloc(32).toString('base64');
    await verifyAlgoMessage(shortSig, b64, {});
    assert.fail('should have thrown');
  } catch (e) {
    // Signature length validation should fail
    assert.strictEqual(e.code, 'algo_signature_invalid');
  }
});

// ---- Tests: Integration scenarios (require real signing) ----------------

test('verifyAlgoMessage: integration test structure (mock)', async () => {
  // This test verifies the structure but not the actual signature.
  // In a real integration test, we would:
  // 1. Create a message
  // 2. Sign with actual Pera SDK (testnet)
  // 3. Submit to verifyAlgoMessage
  // 4. Verify the returned identity

  const payload = mockAlgoPayload('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HVY');
  const b64 = payloadToBase64(payload);

  // Mock signature (64 bytes of zeros - will fail verification)
  const mockSig = Buffer.alloc(64).toString('base64');

  try {
    const result = await verifyAlgoMessage(mockSig, b64, {});
    // Won't reach here; signature verification will fail
    assert.fail('should have thrown');
  } catch (e) {
    // Expected: signature invalid or address issue
    assert.strictEqual(e.status, 401);
  }
});

// ---- Tests: Base32 decoding edge cases ----------------------------------

test('decodeAlgoAddress: valid base32 (A-Z, 2-7 chars)', () => {
  // Test with a simple valid base32 sequence
  const result = decodeAlgoAddress('AAAAAAAA'); // 8 A's
  assert(result instanceof Uint8Array);
  assert.strictEqual(result.length > 0, true);
});

test('decodeAlgoAddress: padding handling', () => {
  // Base32 requires padding with '=' if needed
  const result = decodeAlgoAddress('AAAAA'); // Needs padding
  assert(result instanceof Uint8Array || result === null);
});

test('decodeAlgoAddress: invalid base32 char', () => {
  const result = decodeAlgoAddress('AAAA@@@@'); // '@' is invalid base32
  assert.strictEqual(result, null);
});

test('decodeAlgoAddress: empty string returns null or throws', () => {
  try {
    const result = decodeAlgoAddress('');
    // If it doesn't throw, result should be null or invalid
    assert(result === null || result.length === 0);
  } catch (e) {
    // It's also OK to throw on empty input
    assert(true);
  }
});

// ---- Tests: Signature edge cases ----------------------------------------

// verifySignature()'s entire body is wrapped in a try/catch that always
// returns false on any failure — per its own contract it can never throw
// to the caller. These three tests assert that contract directly instead
// of hedging with a try/catch that would silently pass either way.
test('verifySignature: wrong-length key returns false (never throws)', async () => {
  const message = new TextEncoder().encode('test');
  const sig = new Uint8Array(64);
  const badKey = new Uint8Array(16); // Should be 32 bytes
  assert.strictEqual(await verifySignature(message, sig, badKey), false);
});

test('verifySignature: wrong-length signature returns false (never throws)', async () => {
  const message = new TextEncoder().encode('test');
  const badSig = new Uint8Array(32); // Should be 64 bytes
  const key = new Uint8Array(32);
  assert.strictEqual(await verifySignature(message, badSig, key), false);
});

test('verifySignature: correctly-sized but zero-filled keys/sigs fail verification', async () => {
  const message = new TextEncoder().encode('test');
  const sig = new Uint8Array(64);
  const key = new Uint8Array(32);
  assert.strictEqual(await verifySignature(message, sig, key), false);
});

test('verifySignature: a genuine ed25519 signature verifies true; a tampered one verifies false', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const pubKeyBytes = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const message = new TextEncoder().encode('kudbee-leaderboard-test-message');
  const sig = new Uint8Array(await crypto.subtle.sign('Ed25519', pair.privateKey, message));

  assert.strictEqual(await verifySignature(message, sig, pubKeyBytes), true);

  const tampered = new Uint8Array(sig);
  tampered[0] ^= 0xff;
  assert.strictEqual(await verifySignature(message, tampered, pubKeyBytes), false);

  const wrongMessage = new TextEncoder().encode('a different message entirely');
  assert.strictEqual(await verifySignature(wrongMessage, sig, pubKeyBytes), false);
});

// ---- Tests: Message reconstruction consistency -------------------------

test('reconstructSignedMessage: handles all field types', () => {
  const payload = {
    algo_address: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HVY',
    timestamp: 1234567890,
    nonce: 'test_nonce_12345',
    exp: 1234571490,
  };
  const msg1 = reconstructSignedMessage(payload);
  const msg2 = reconstructSignedMessage(payload);

  // Should be byte-for-byte identical
  assert.deepStrictEqual(msg1, msg2);
});

test('reconstructSignedMessage: field order is fixed', () => {
  const payload = {
    algo_address: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HVY',
    timestamp: 999,
    nonce: 'abc',
    exp: 888,
  };
  const msg = reconstructSignedMessage(payload);
  const str = new TextDecoder().decode(msg);

  // Verify JSON structure and order
  assert(str.includes('algo_address'));
  assert(str.includes('timestamp'));
  assert(str.includes('nonce'));
  assert(str.includes('exp'));

  // Verify no extra whitespace
  assert.strictEqual(str.includes('  '), false); // No double spaces
  assert.strictEqual(str.includes(' : '), false); // No spaces around colons
});

// ---- Tests: Nonce replay with caching ----------------------------------
// (Real, deterministic nonce-replay coverage — pre-seeded set and
// fresh-nonce recording — now lives in the "verifyAlgoMessage: nonce
// replay is rejected deterministically" and "...fresh nonce is recorded"
// tests above.)

// ---- Tests: Additional coverage paths -----------------------------------

test('verifyAlgoMessage: invalid base64 signature encoding throws', async () => {
  const now = Math.floor(Date.now() / 1000);
  const payload = mockAlgoPayload(
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HVY',
    now,
    'test_nonce_b64error',
    now + 600
  );
  const b64 = payloadToBase64(payload);

  try {
    await verifyAlgoMessage('!!!invalid!!!base64!!!', b64, {});
  } catch (e) {
    // Error thrown as expected
    assert(e.code === 'algo_signature_malformed' || e.code === 'algo_signature_invalid');
  }
});

test('isAlgoAuthEnabled: env config variants', () => {
  assert.strictEqual(isAlgoAuthEnabled({}), true, 'default should be true');
  assert.strictEqual(isAlgoAuthEnabled({ ALGO_AUTH_ENABLED: '1' }), true);
  assert.strictEqual(isAlgoAuthEnabled({ ALGO_AUTH_ENABLED: 'true' }), true);
  assert.strictEqual(isAlgoAuthEnabled({ ALGO_AUTH_ENABLED: 'yes' }), true);
  assert.strictEqual(isAlgoAuthEnabled({ ALGO_AUTH_ENABLED: '0' }), false);
  assert.strictEqual(isAlgoAuthEnabled({ ALGO_AUTH_ENABLED: 'false' }), false);
  assert.strictEqual(isAlgoAuthEnabled({ ALGO_AUTH_ENABLED: 'no' }), false);
  assert.strictEqual(isAlgoAuthEnabled({ ALGO_AUTH_ENABLED: 'TRUE' }), true);
  assert.strictEqual(isAlgoAuthEnabled({ ALGO_AUTH_ENABLED: 'FALSE' }), false);
});

test('reconstructSignedMessage: produces consistent canonical JSON', () => {
  const payload1 = {
    algo_address: 'TESTADDRESS123',
    timestamp: 1000000,
    nonce: 'testnonce',
    exp: 2000000,
  };
  const msg1 = reconstructSignedMessage(payload1);
  const msg1Text = new TextDecoder().decode(msg1);
  const obj1 = JSON.parse(msg1Text);

  assert.strictEqual(obj1.algo_address, 'TESTADDRESS123');
  assert.strictEqual(obj1.timestamp, 1000000);
  assert.strictEqual(obj1.nonce, 'testnonce');
  assert.strictEqual(obj1.exp, 2000000);

  // Verify it's proper Uint8Array
  assert(msg1 instanceof Uint8Array, 'should be Uint8Array');
});

test('parseAlgoMessage: edge case - max length nonce', () => {
  const maxNonce = 'a'.repeat(64);
  const payload = { algo_address: 'A'.repeat(58), timestamp: 1000, nonce: maxNonce, exp: 2000 };
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64');
  const parsed = parseAlgoMessage(b64);

  assert(parsed !== null, 'should parse max-length nonce');
  assert.strictEqual(parsed.nonce.length, 64);
});

// ---- Tests: Auth error structure ----------------------------------------

test('authError: error properties are set correctly', () => {
  const err1 = authError(401, 'test_error');
  assert.strictEqual(err1.authError, true);
  assert.strictEqual(err1.status, 401);
  assert.strictEqual(err1.code, 'test_error');

  const err2 = authError(500, 'server_error');
  assert.strictEqual(err2.status, 500);
  assert.strictEqual(err2.code, 'server_error');
});

// ---- End of tests -------------------------------------------------------

console.log('✓ All ALGO auth tests defined');
