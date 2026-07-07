/* =====================================================================
 * Kudbee Leaderboard — shared/algo-auth.js
 * Algorand wallet-based authentication module.
 *
 * This module provides ed25519 signature verification for Algorand
 * wallet addresses. The wallet signs a message containing:
 *   { algo_address, timestamp, nonce, exp }
 *
 * The backend verifies:
 *   1. The signature is valid (ed25519 against the wallet's public key)
 *   2. The message is not expired (exp > now)
 *   3. The timestamp is recent (not older than max age)
 *   4. The nonce is not replayed (checked server-side)
 *
 * This approach is secure because:
 *   - ed25519 is standard for Algorand
 *   - Signatures are one-time use (nonce)
 *   - No chain writes needed (instant, free verification)
 *   - Private key never leaves the user's wallet
 *
 * Config (env):
 *   ALGO_AUTH_ENABLED     "true"/"false" or "1"/"0" (default: true if not set)
 *   ALGO_MAX_AGE_SECONDS  Max message age in seconds (default: 600 = 10 min)
 *   ALGO_REPLAY_CACHE     "memory"/"none" (default: none = no replay check for MVP)
 * ===================================================================== */

const subtle = (globalThis.crypto && globalThis.crypto.subtle);

// ---- Algorand address & key utilities ---------------------------------

/**
 * Decode an Algorand address (base32) to bytes.
 * Algorand addresses are 36-byte values encoded as base32 without padding.
 * The last 4 bytes are a checksum; the first 32 bytes are the public key.
 */
export function decodeAlgoAddress(address) {
  try {
    // Algorand addresses are base32-encoded without padding
    // Add padding if needed for standard base32 decode
    let padded = address;
    while (padded.length % 8) padded += '=';

    // Convert base32 to bytes
    const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    for (const char of padded) {
      if (char === '=') break;
      const idx = ALPHABET.indexOf(char.toUpperCase());
      if (idx === -1) throw new Error('invalid_char_' + char);
      bits += idx.toString(2).padStart(5, '0');
    }

    const bytes = new Uint8Array(Math.ceil(bits.length / 8));
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(bits.substr(i * 8, 8), 2);
    }
    return bytes;
  } catch (e) {
    return null;
  }
}

/**
 * Extract the 32-byte public key from an Algorand address.
 * Algorand addresses are 36 bytes: 32 bytes key + 4 bytes checksum.
 */
export function extractPublicKeyFromAddress(address) {
  const bytes = decodeAlgoAddress(address);
  if (!bytes || bytes.length < 32) return null;
  return bytes.slice(0, 32);
}

/**
 * Recover an Algorand address from a 32-byte public key.
 * Reconstructs the full 36-byte address (key + 4-byte SHA-512/256 checksum).
 */
export async function publicKeyToAddress(publicKey) {
  if (!publicKey || publicKey.length !== 32) return null;
  try {
    // Compute SHA-512/256 of the key
    const hash = await subtle.digest('SHA-512/256', publicKey);
    const checksum = new Uint8Array(hash).slice(-4);

    // Combine key + checksum and encode as base32
    const full = new Uint8Array(36);
    full.set(publicKey);
    full.set(checksum, 32);

    // Encode as base32 (no padding)
    const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    for (const byte of full) {
      bits += byte.toString(2).padStart(8, '0');
    }

    let encoded = '';
    for (let i = 0; i < bits.length; i += 5) {
      const chunk = bits.substr(i, 5).padEnd(5, '0');
      encoded += ALPHABET[parseInt(chunk, 2)];
    }
    return encoded;
  } catch (e) {
    return null;
  }
}

// ---- Signature verification ------------------------------------------

/**
 * Verify an ed25519 signature.
 * @param {Uint8Array} message - The exact bytes that were signed
 * @param {Uint8Array} signature - The ed25519 signature (64 bytes)
 * @param {Uint8Array} publicKey - The signer's public key (32 bytes)
 * @returns {Promise<boolean>} true if signature is valid
 */
export async function verifySignature(message, signature, publicKey) {
  try {
    if (!subtle) throw new Error('crypto.subtle unavailable');
    if (signature.length !== 64) throw new Error('signature_not_64_bytes');
    if (publicKey.length !== 32) throw new Error('pubkey_not_32_bytes');

    const key = await subtle.importKey(
      'raw',
      publicKey,
      { name: 'Ed25519', namedCurve: 'Ed25519' },
      false,
      ['verify']
    );

    return await subtle.verify('Ed25519', key, signature, message);
  } catch (e) {
    return false;
  }
}

// ---- ALGO message structure & validation ------------------------------

/**
 * Parse and validate an ALGO auth message.
 * Expected structure:
 *   { algo_address, timestamp, nonce, exp }
 *
 * Returns parsed object or null if invalid.
 */
export function parseAlgoMessage(payload_b64) {
  try {
    const json = atob(payload_b64);
    const msg = JSON.parse(json);

    // Validate required fields
    if (typeof msg.algo_address !== 'string') throw new Error('missing_address');
    if (typeof msg.timestamp !== 'number') throw new Error('missing_timestamp');
    if (typeof msg.nonce !== 'string') throw new Error('missing_nonce');
    if (typeof msg.exp !== 'number') throw new Error('missing_exp');

    // Validate formats
    if (msg.algo_address.length < 32) throw new Error('address_too_short');
    if (msg.nonce.length < 8 || msg.nonce.length > 64) throw new Error('nonce_invalid');

    return msg;
  } catch (e) {
    return null;
  }
}

/**
 * Reconstruct the exact message bytes that were signed.
 * Must match what the client signed.
 */
export function reconstructSignedMessage(payload) {
  // Exact JSON serialization (no extra whitespace)
  const msg = {
    algo_address: payload.algo_address,
    timestamp: payload.timestamp,
    nonce: payload.nonce,
    exp: payload.exp,
  };
  return new TextEncoder().encode(JSON.stringify(msg));
}

// ---- Main verification function ----------------------------------------

/**
 * Verify an ALGO wallet signature and return the authenticated identity.
 *
 * @param {string} sig_b64 - Base64-encoded ed25519 signature
 * @param {string} payload_b64 - Base64-encoded message { algo_address, timestamp, nonce, exp }
 * @param {object} env - Environment config { ALGO_MAX_AGE_SECONDS, ALGO_REPLAY_CACHE }
 * @param {Set} [used_nonces] - Optional set of already-used nonces (for replay prevention)
 *
 * @returns {Promise<{userId, name, wallet, verified_at} | null>}
 *   Returns identity object on success, or throws authError on failure.
 */
export async function verifyAlgoMessage(sig_b64, payload_b64, env, used_nonces) {
  env = env || {};
  const MAX_AGE = parseInt(env.ALGO_MAX_AGE_SECONDS || '600', 10);

  // Parse payload
  const payload = parseAlgoMessage(payload_b64);
  if (!payload) throw authError(401, 'malformed_algo_message');

  const { algo_address, timestamp, nonce, exp } = payload;

  // Validate expiration
  const now = Math.floor(Date.now() / 1000);
  if (now > exp) throw authError(401, 'algo_signature_expired');

  // Validate timestamp freshness (not older than MAX_AGE seconds)
  if (now - timestamp > MAX_AGE) throw authError(401, 'algo_timestamp_too_old');

  // Validate timestamp not in future (with 30-second clock skew allowance)
  if (timestamp > now + 30) throw authError(401, 'algo_timestamp_in_future');

  // Check nonce replay (optional, for MVP can skip)
  if (used_nonces && used_nonces.has(nonce)) {
    throw authError(401, 'algo_nonce_replayed');
  }
  if (used_nonces) {
    used_nonces.add(nonce);
  }

  // Extract public key from address
  const publicKey = extractPublicKeyFromAddress(algo_address);
  if (!publicKey) throw authError(401, 'algo_address_invalid');

  // Decode signature
  let signature;
  try {
    signature = new Uint8Array(Buffer.from(sig_b64, 'base64'));
  } catch (e) {
    throw authError(401, 'algo_signature_malformed');
  }

  // Reconstruct the signed message
  const message = reconstructSignedMessage(payload);

  // Verify signature
  const valid = await verifySignature(message, signature, publicKey);
  if (!valid) throw authError(401, 'algo_signature_invalid');

  // Verify address consistency (recovered address should match claimed address)
  const recoveredAddress = await publicKeyToAddress(publicKey);
  if (recoveredAddress !== algo_address) {
    throw authError(401, 'algo_address_mismatch');
  }

  // Success! Return authenticated identity
  return {
    userId: 'algo:' + algo_address,
    name: algo_address.slice(0, 8) + '…' + algo_address.slice(-4), // XXXXX…XXXX
    wallet: algo_address,
    verified_at: now,
    demo: false,
  };
}

// ---- Helper functions ---------------------------------------------------

export function isAlgoAuthEnabled(env) {
  env = env || {};
  if (env.ALGO_AUTH_ENABLED === undefined) return true; // default: on
  const v = String(env.ALGO_AUTH_ENABLED).toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export function authError(status, code) {
  const e = new Error(code);
  e.authError = true;
  e.status = status;
  e.code = code;
  return e;
}

// ---- Exports for testing ------------------------------------------------

export const TEST_UTILS = {
  decodeAlgoAddress,
  extractPublicKeyFromAddress,
  publicKeyToAddress,
  parseAlgoMessage,
  reconstructSignedMessage,
  verifySignature,
};
