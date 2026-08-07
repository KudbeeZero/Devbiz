/* =====================================================================
 * Kudbee Voidrunner — Wingman worker/worker.js  (Cloudflare Worker entry)
 * ---------------------------------------------------------------------
 * Serves the SIMURGH tactical agent under /wingman/*:
 *   POST /wingman/tactical   — intake a run-state snapshot, return a tactic
 *   GET  /wingman            — health + identity check
 *
 * The deterministic brain (tactics.js) always runs first and is the reliable
 * floor. If Workers AI bindings (env.AI) are present and AI_MODE='fancy',
 * the tactic line is additionally fed to a small model for tone before being
 * returned — but the engine result is never dropped for a missing model.
 *
 * A single /wingman path is routed here; ASSETS can serve the game so this
 * Worker can optionally front the whole site like the leaderboard worker.
 *
 * Bindings (wrangler.toml):
 *   AI     (optional) Cloudflare Workers AI binding
 *   DB     (optional) D1, used only for milestone memory if schema applied
 * Vars:
 *   AI_MODE  'off' | 'engine' | 'fancy' (default 'engine')
 *   ALLOWED_ORIGINS  comma-separated, default '*'
 * ===================================================================== */
import { evaluate } from './tactics.js';

const CORS_ALLOW = (env, origin) => {
  const allowed = (env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim()).filter(Boolean);
  if (allowed.length === 1 && allowed[0] === '*') return '*';
  const list = allowed.filter((a) => a === origin);
  return list.length ? origin : null;
};
const corsHeaders = (origin) => ({
  'access-control-allow-origin': origin,
  'access-control-allow-methods': 'POST, GET, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'content-type': 'application/json; charset=utf-8',
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = CORS_ALLOW(env, request.headers.get('origin'));
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!url.pathname.startsWith('/wingman')) return new Response('Not found', { status: 404 });

    if (request.method === 'GET' && url.pathname === '/wingman') {
      return json({ ok: true, agent: 'simurgh', brain: describeBrain(env) }, cors);
    }

    if (request.method === 'POST' && url.pathname === '/wingman/tactical') {
      let body = null;
      try { body = await request.json(); } catch (_) { body = null; }
      if (!body || typeof body !== 'object' || typeof body.distance !== 'number') {
        return json({ ok: false, error: 'invalid snapshot' }, cors, 400);
      }

      const engine = evaluate(body);
      let line = engine;

      // Optional Workers AI tone pass — never fatal if it fails.
      const mode = (env.AI_MODE || 'engine').toLowerCase();
      if (mode === 'fancy' && env.AI) {
        try {
          const out = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
            messages: [
              { role: 'system', content:
                'You are SIMURGH, a calm starfighter wingman AI. Rewrite the pilot advice ' +
                'below in one short punchy sentence (max 16 words), keeping the color and ' +
                'urgency. No preamble, no punctuation overkill.' },
              { role: 'user', content: engine.text },
            ],
            max_tokens: 40,
          });
          const txt = String(out && out.response ? out.response : engine.text).trim();
          if (txt) line = Object.assign({}, engine, { text: txt });
        } catch (_) { /* fallback to engine line */ }
      }

      return json({ ok: true, line }, cors);
    }

    return json({ ok: false, error: 'method not allowed' }, cors, 405);
  },
};

function describeBrain(env) {
  const mode = (env.AI_MODE || 'engine').toLowerCase();
  return { engine: 'deterministic-tactical-v1', ai: mode === 'fancy' && !!env.AI };
}
function json(body, cors, status) {
  return new Response(JSON.stringify(body), { status: status || 200, headers: cors });
}
