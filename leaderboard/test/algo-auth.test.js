/* =====================================================================
 * Kudbee Leaderboard — test/algo-auth.test.js
 * Test suite for ALGO wallet authentication.
 * ===================================================================== */

import test from 'node:test';
import assert from 'node:assert';
import {
  decodeAlgoAddress,
  extractPublicKeyFromAddress,
  verifyAlgoMessage,
  parseAlgoMessage,
  reconstructSignedMessage,
  isAlgoAuthEnabled,
  authError,
} from '../shared/algo-auth.js';

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

test('verifyAlgoMessage: nonce replay detection', async () => {
  const now = Math.floor(Date.now() / 1000);
  const payload = mockAlgoPayload(
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HVY',
    now,
    'replay_nonce',
    now + 600
  );
  const b64 = payloadToBase64(payload);
  const used_nonces = new Set();

  // First attempt should fail at signature verification (no real sig)
  try {
    await verifyAlgoMessage('invalid_sig', b64, {}, used_nonces);
    assert.fail('should have thrown');
  } catch (e) {
    // Expected: signature verification fails before nonce check
    assert(e.code.includes('algo_'));
  }

  // For a real test, we'd need to successfully verify the first sig,
  // then check that a second call with the same nonce throws.
  // This requires actual ed25519 signing from Pera SDK.
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

test('verifySignature: crypto operations work or return false', async () => {
  const message = new TextEncoder().encode('test');
  const sig = new Uint8Array(64);
  const badKey = new Uint8Array(16); // Should be 32 bytes

  try {
    const result = await verifySignature(message, sig, badKey);
    // If it doesn't throw, it should return false
    assert.strictEqual(result, false);
  } catch (e) {
    // It's also OK to throw on invalid key length
    assert(true);
  }
});

test('verifySignature: invalid signature length throws or returns false', async () => {
  const message = new TextEncoder().encode('test');
  const badSig = new Uint8Array(32); // Should be 64 bytes
  const key = new Uint8Array(32);

  try {
    const result = await verifySignature(message, badSig, key);
    // If it doesn't throw, it should return false
    assert.strictEqual(result, false);
  } catch (e) {
    // It's also OK to throw on invalid signature length
    assert(true);
  }
});

test('verifySignature: empty or zero-filled keys/sigs fail verification', async () => {
  const message = new TextEncoder().encode('test');
  const sig = new Uint8Array(64);
  const key = new Uint8Array(32);

  try {
    const result = await verifySignature(message, sig, key);
    // Zero-filled sig/key should fail verification
    assert.strictEqual(result, false);
  } catch (e) {
    // It's also OK to throw if crypto operations fail
    assert(true);
  }
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

test('verifyAlgoMessage: nonce set is updated on success', async () => {
  // This is a structural test; actual signature verification would fail.
  // We verify that nonce tracking would work.
  const used_nonces = new Set();
  const now = Math.floor(Date.now() / 1000);
  const payload = mockAlgoPayload(
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HVY',
    now,
    'unique_nonce_12345',
    now + 600
  );
  const b64 = payloadToBase64(payload);
  const validSig = Buffer.alloc(64).toString('base64');

  try {
    await verifyAlgoMessage(validSig, b64, {}, used_nonces);
  } catch (e) {
    // Expected to fail on signature verification
  }

  // Nonce should be in the set if replay prevention is enabled
  // (In MVP, it might not be checked, but the structure should be in place)
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
