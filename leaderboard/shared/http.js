/* =====================================================================
 * Kudbee Leaderboard — shared/http.js
 * Tiny helpers shared by both adapters: CORS headers + turning the core
 * handler's { status, body } into a JSON Response, and resolving auth with
 * clean 401s for present-but-invalid tokens.
 * ===================================================================== */
import { resolveAuth } from './auth.js';
import { handle } from './core.js';

export function corsHeaders(origin, allowed) {
  // allowed: '*' or array of allowed origins. Echo the origin when permitted.
  let allow = '*';
  if (Array.isArray(allowed) && allowed.length) {
    allow = (origin && allowed.includes(origin)) ? origin : allowed[0];
  } else if (typeof allowed === 'string' && allowed && allowed !== '*') {
    allow = allowed;
  }
  return {
    'access-control-allow-origin': allow,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type, x-demo-user, x-demo-name',
    'access-control-max-age': '86400',
    'vary': 'origin',
  };
}

// Run an API request end to end: resolve auth, dispatch to core, JSON-encode.
// `reqLike` = { method, path, query (URLSearchParams), headers (Headers-like),
//               body (parsed obj|null) }. Returns { status, body }.
export async function runApi(store, env, reqLike) {
  let auth = null;
  try {
    auth = await resolveAuth(reqLike.headers, env);
  } catch (e) {
    if (e && e.authError) return { status: e.status, body: { error: e.code } };
    return { status: 401, body: { error: 'auth_failed' } };
  }
  try {
    return await handle(store, { ...reqLike, auth });
  } catch (e) {
    return { status: 500, body: { error: 'internal_error', detail: String(e && e.message || e) } };
  }
}
