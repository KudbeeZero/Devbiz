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

// ---- End of tests -------------------------------------------------------

console.log('✓ All ALGO auth tests defined');
