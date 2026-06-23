/* =====================================================================
 * Kudbee Leaderboard — shared/auth.js
 * Resolves the caller's identity for an incoming request. Two modes:
 *
 *   1. Clerk (production): the frontend sends `Authorization: Bearer <jwt>`
 *      where the JWT is a Clerk session token (Clerk.session.getToken()).
 *      We verify it *networklessly* — RS256 signature against the instance
 *      JWKS (fetched once and cached), plus iss/exp/nbf checks. Works the
 *      same on Cloudflare Workers and Node 18+ (both expose globalThis.crypto
 *      + fetch).
 *
 *   2. Demo (keyless): when no Clerk issuer is configured (or env.ALLOW_DEMO
 *      is on), a caller may send `X-Demo-User: <id>` to act as a sandbox
 *      identity. This lets the whole thing run + be tested before any keys
 *      exist; turn it OFF in production by setting ALLOW_DEMO=0.
 *
 * Resolve config (env) — all optional until you go live with Clerk:
 *   CLERK_ISSUER            e.g. https://your-app.clerk.accounts.dev
 *   CLERK_PUBLISHABLE_KEY   pk_test_... (issuer is derived from it if unset)
 *   CLERK_JWKS_URL          override (defaults to <issuer>/.well-known/jwks.json)
 *   CLERK_AUTHORIZED_PARTIES  comma list of allowed `azp` origins (optional)
 *   ALLOW_DEMO              "1"/"true" to permit demo identities
 * ===================================================================== */

const subtle = (globalThis.crypto && globalThis.crypto.subtle);

// ---- small base64url helpers ------------------------------------------
function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64urlToString(s) {
  const bytes = b64urlToBytes(s);
  return new TextDecoder().decode(bytes);
}

// Derive the Clerk Frontend API host from a publishable key. The key is
// `pk_test_<base64("frontend-api-host$")>`.
export function frontendApiFromPublishableKey(pk) {
  try {
    const enc = pk.split('_').slice(2).join('_');
    if (!enc) return null;
    const decoded = atob(enc);
    return decoded.replace(/\$+$/, '') || null;
  } catch (_) { return null; }
}

function issuerFromEnv(env) {
  if (env.CLERK_ISSUER) return env.CLERK_ISSUER.replace(/\/+$/, '');
  if (env.CLERK_PUBLISHABLE_KEY) {
    const host = frontendApiFromPublishableKey(env.CLERK_PUBLISHABLE_KEY);
    if (host) return 'https://' + host;
  }
  return null;
}

export function clerkConfigured(env) { return !!issuerFromEnv(env); }

export function demoAllowed(env) {
  if (!clerkConfigured(env)) return true;            // keyless -> demo on
  const v = String(env.ALLOW_DEMO == null ? '' : env.ALLOW_DEMO).toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

// ---- JWKS cache --------------------------------------------------------
const _jwks = new Map();   // jwksUrl -> { keys, fetchedAt }
const JWKS_TTL_MS = 10 * 60 * 1000;

async function getKey(jwksUrl, kid) {
  let cached = _jwks.get(jwksUrl);
  if (!cached || (Date.now() - cached.fetchedAt) > JWKS_TTL_MS || !cached.keys[kid]) {
    const res = await fetch(jwksUrl, { headers: { accept: 'application/json' } });
    if (!res.ok) throw authError(503, 'jwks_unavailable');
    const json = await res.json();
    const keys = {};
    for (const k of (json.keys || [])) keys[k.kid] = k;
    cached = { keys, fetchedAt: Date.now() };
    _jwks.set(jwksUrl, cached);
  }
  const jwk = cached.keys[kid];
  if (!jwk) throw authError(401, 'unknown_kid');
  return jwk;
}

async function verifyClerkJWT(token, env) {
  const issuer = issuerFromEnv(env);
  if (!issuer) throw authError(500, 'clerk_not_configured');
  const jwksUrl = env.CLERK_JWKS_URL || (issuer + '/.well-known/jwks.json');

  const parts = token.split('.');
  if (parts.length !== 3) throw authError(401, 'malformed_token');
  const [h, p, s] = parts;
  let header, payload;
  try { header = JSON.parse(b64urlToString(h)); payload = JSON.parse(b64urlToString(p)); }
  catch (_) { throw authError(401, 'malformed_token'); }
  if (header.alg !== 'RS256') throw authError(401, 'unsupported_alg');

  const jwk = await getKey(jwksUrl, header.kid);
  const key = await subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const data = new TextEncoder().encode(`${h}.${p}`);
  const sig = b64urlToBytes(s);
  const valid = await subtle.verify('RSASSA-PKCS1-v1_5', key, sig, data);
  if (!valid) throw authError(401, 'bad_signature');

  const now = Math.floor(Date.now() / 1000);
  const skew = 30;
  if (payload.exp && now > payload.exp + skew) throw authError(401, 'token_expired');
  if (payload.nbf && now + skew < payload.nbf) throw authError(401, 'token_not_yet_valid');
  if (payload.iss && payload.iss.replace(/\/+$/, '') !== issuer) throw authError(401, 'bad_issuer');

  const allowed = (env.CLERK_AUTHORIZED_PARTIES || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (allowed.length && payload.azp && !allowed.includes(payload.azp)) throw authError(401, 'bad_azp');

  return payload;
}

function header(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === 'function') return headers.get(name);
  return headers[name] || headers[name.toLowerCase()] || null;
}

// Resolve identity or return null. Throws { authError, status, code } only for
// a token that is *present but invalid* (so the adapter can 401 clearly).
export async function resolveAuth(headers, env) {
  env = env || {};
  const authz = header(headers, 'authorization') || header(headers, 'Authorization');
  if (authz && /^Bearer\s+/i.test(authz)) {
    const token = authz.replace(/^Bearer\s+/i, '').trim();
    const claims = await verifyClerkJWT(token, env);
    const name = claims.name || claims.username
      || [claims.first_name, claims.last_name].filter(Boolean).join(' ') || null;
    return { userId: 'clerk:' + claims.sub, name, demo: false, claims };
  }
  if (demoAllowed(env)) {
    const demo = header(headers, 'x-demo-user') || header(headers, 'X-Demo-User');
    if (demo) {
      const id = String(demo).slice(0, 64).replace(/[^a-zA-Z0-9_-]/g, '');
      if (id) {
        let name = header(headers, 'x-demo-name');
        if (name) { try { name = decodeURIComponent(name); } catch (e) { /* keep raw on bad encoding */ } }
        return { userId: 'demo:' + id, name: name || null, demo: true };
      }
    }
  }
  return null;
}

export function authError(status, code) {
  const e = new Error(code);
  e.authError = true; e.status = status; e.code = code;
  return e;
}
