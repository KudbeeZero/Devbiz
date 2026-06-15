/* =====================================================================
 * Kudbee Leaderboard — worker/worker.js  (Cloudflare Worker entry)
 * Serves the leaderboard API under /api/* backed by D1, with CORS. Any
 * non-/api request is handed to the static-assets binding (env.ASSETS) if
 * present, so this Worker can either run standalone or front the studio site.
 *
 * Bindings (see wrangler.toml):
 *   DB         D1 database (run schema.sql once)
 *   ASSETS     (optional) static assets binding
 * Vars/secrets (all optional until you enable Clerk):
 *   CLERK_PUBLISHABLE_KEY, CLERK_ISSUER, CLERK_JWKS_URL,
 *   CLERK_AUTHORIZED_PARTIES, ALLOW_DEMO, ALLOWED_ORIGINS
 * ===================================================================== */
import { createD1Store } from './store-d1.js';
import { runApi, corsHeaders } from '../shared/http.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('origin');
    const allowed = (env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim()).filter(Boolean);
    const cors = corsHeaders(origin, allowed.length === 1 && allowed[0] === '*' ? '*' : allowed);

    if (url.pathname.startsWith('/api/')) {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

      let body = null;
      if (request.method === 'POST') {
        try { body = await request.json(); } catch (_) { body = null; }
      }
      const store = createD1Store(env.DB);
      const { status, body: out } = await runApi(store, env, {
        method: request.method,
        path: url.pathname,
        query: url.searchParams,
        headers: request.headers,
        body,
      });
      return new Response(JSON.stringify(out), {
        status,
        headers: { 'content-type': 'application/json; charset=utf-8', ...cors },
      });
    }

    // Non-API: defer to static assets if bound, else 404.
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Not found', { status: 404 });
  },
};
