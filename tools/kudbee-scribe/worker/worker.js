/* =====================================================================
 * Kudbee Scribe — worker/worker.js  (Cloudflare Worker)
 * Stateless proxy that powers the tool's optional "AI Deep Analysis".
 * It forwards the user's text to the Anthropic Messages API and returns
 * structured suggestions + a rewrite. No database, no auth — only an
 * ANTHROPIC_API_KEY secret and CORS.
 *
 * The Scribe tool works fully without this Worker (private/offline mode);
 * this just enables the opt-in AI feature.
 *
 * Vars (wrangler.toml [vars]):
 *   ALLOWED_ORIGINS   '*' or comma-separated list of allowed origins
 *   SCRIBE_MODEL      (optional) override, default 'claude-haiku-4-5'
 * Secret (wrangler secret put ANTHROPIC_API_KEY):
 *   ANTHROPIC_API_KEY your Anthropic API key
 *
 * Endpoint:  POST /api/scribe
 *   body:  { text: string, preset?: string, goal?: 'rewrite'|'analyze' }
 *   200:   { rewrite, suggestions: [{type,original,improved,reason}], summary }
 *   503:   { error: 'ai_unavailable' }   (no key configured)
 *   4xx/5xx: { error, detail? }
 * ===================================================================== */

const MAX_CHARS = 20000;
const DEFAULT_MODEL = 'claude-haiku-4-5';

function corsHeaders(origin, allowed) {
  let allow = '*';
  if (Array.isArray(allowed) && allowed.length) {
    allow = origin && allowed.includes(origin) ? origin : allowed[0];
  } else if (typeof allowed === 'string' && allowed && allowed !== '*') {
    allow = allowed;
  }
  return {
    'access-control-allow-origin': allow,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    'vary': 'origin',
  };
}

function json(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...cors },
  });
}

function buildSystemPrompt(preset) {
  return (
    'You are Kudbee Scribe, an expert editor. The author is writing in a "' + (preset || 'general') +
    '" style. Improve clarity, concision, grammar and flow while preserving the author\'s meaning, ' +
    'voice and intent. Do not invent facts.\n\n' +
    'Respond with ONLY a single JSON object (no markdown, no commentary) of this exact shape:\n' +
    '{"rewrite": string, "suggestions": [{"type": string, "original": string, "improved": string, "reason": string}], "summary": string}\n' +
    '- "rewrite": the full improved version of the text.\n' +
    '- "suggestions": up to 8 of the most impactful specific edits.\n' +
    '- "summary": one or two sentences on the biggest opportunities.'
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('origin');
    const allowed = (env.ALLOWED_ORIGINS || '*')
      .split(',').map((s) => s.trim()).filter(Boolean);
    const cors = corsHeaders(origin, allowed.length === 1 && allowed[0] === '*' ? '*' : allowed);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    if (url.pathname !== '/api/scribe' || request.method !== 'POST') {
      return json({ error: 'not_found' }, 404, cors);
    }

    if (!env.ANTHROPIC_API_KEY) {
      return json({ error: 'ai_unavailable', detail: 'ANTHROPIC_API_KEY not configured' }, 503, cors);
    }

    let body;
    try { body = await request.json(); } catch (_) { return json({ error: 'bad_request' }, 400, cors); }
    const text = body && typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) return json({ error: 'bad_request', detail: 'text is required' }, 400, cors);
    if (text.length > MAX_CHARS) {
      return json({ error: 'too_large', detail: 'text exceeds ' + MAX_CHARS + ' characters' }, 413, cors);
    }

    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: env.SCRIBE_MODEL || DEFAULT_MODEL,
          max_tokens: 2048,
          system: buildSystemPrompt(body.preset),
          messages: [{ role: 'user', content: text }],
        }),
      });

      if (!resp.ok) {
        const detail = await resp.text().catch(() => '');
        return json({ error: 'upstream_error', status: resp.status, detail: detail.slice(0, 500) }, 502, cors);
      }

      const data = await resp.json();
      const raw = data && data.content && data.content[0] && data.content[0].text ? data.content[0].text : '';
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (_) {
        // model didn't return clean JSON — try to extract an object, else fall back
        const m = raw.match(/\{[\s\S]*\}/);
        try { parsed = m ? JSON.parse(m[0]) : null; } catch (_2) { parsed = null; }
        if (!parsed) parsed = { rewrite: raw, suggestions: [], summary: '' };
      }
      return json(parsed, 200, cors);
    } catch (e) {
      return json({ error: 'internal_error', detail: String((e && e.message) || e) }, 500, cors);
    }
  },
};
