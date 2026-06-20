/* =====================================================================
 * Kudbee Grow Telemetry — worker/worker.js  (Cloudflare Worker)
 *
 * A tiny, privacy-light event collector for the Grow Companion + music
 * video. The site's track() helper POSTs anonymous events here; this Worker
 * validates them, bumps per-event / per-day counters in KV, and keeps a small
 * ring of recent events. An owner-only, token-gated /stats endpoint returns
 * the aggregates that the diagnostics page reads.
 *
 * The site works fully WITHOUT this Worker (track() stays local-only until a
 * collector URL is set). This only enables cross-tester aggregation.
 *
 * Bindings (wrangler.toml):
 *   [[kv_namespaces]] binding = "GROW_KV"   — the counter/store
 *   [vars] ALLOWED_ORIGINS                  — '*' or comma-separated origins
 * Secret (owner-only — NEVER commit):
 *   wrangler secret put STATS_TOKEN         — read token for /stats
 *
 * Endpoints:
 *   POST /collect   body: {event,props?,page?,uid?,t?} or {events:[...]}
 *                   -> 204. Anonymous; no PII expected or stored.
 *   GET  /stats?token=...  -> { counts:{event:n}, byDay:{day:{event:n}}, recent:[...] }
 *   GET  /health    -> { ok:true }
 *
 * Privacy: store only event name, page, a random per-browser id (uid), a
 * coarse timestamp, and a SHORT allow-listed subset of props. No IPs, no
 * cookies, no fingerprinting. Tune ALLOWED_PROPS / retention below.
 * ===================================================================== */

const ALLOWED_EVENTS = new Set([
    'video_opened', 'audio_play_ok', 'audio_blocked', 'audio_error', 'party_toggled',
    'drop_replayed', 'completed',
    'grow_visited', 'onboarding_started', 'seed_planted', 'stage_reached',
    'timelapse_played', 'reminders_enabled', 'notification_opened', 'daily_checkin', 'grow_reset'
]);
const ALLOWED_PROPS = new Set(['stage', 'day', 'on', 'ok', 'reason', 'code', 'ct']);
const RECENT_MAX = 200;
const MAX_BATCH = 50;

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const cors = corsHeaders(request, env);

        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
        if (url.pathname === '/health') return json({ ok: true }, 200, cors);

        if (url.pathname === '/collect' && request.method === 'POST') {
            return collect(request, env, cors);
        }
        if (url.pathname === '/stats' && request.method === 'GET') {
            return stats(url, env, cors);
        }
        return json({ error: 'not_found' }, 404, cors);
    }
};

async function collect(request, env, cors) {
    if (!env.GROW_KV) return json({ error: 'kv_unbound' }, 503, cors);
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: 'bad_json' }, 400, cors); }
    const list = Array.isArray(body.events) ? body.events : [body];
    if (list.length > MAX_BATCH) list.length = MAX_BATCH;

    const counts = JSON.parse((await env.GROW_KV.get('agg:counts')) || '{}');
    const day = new Date().toISOString().slice(0, 10);
    const byDayKey = 'agg:day:' + day;
    const dayCounts = JSON.parse((await env.GROW_KV.get(byDayKey)) || '{}');
    const recent = JSON.parse((await env.GROW_KV.get('agg:recent')) || '[]');

    let accepted = 0;
    for (const raw of list) {
        const ev = sanitize(raw);
        if (!ev) continue;
        counts[ev.event] = (counts[ev.event] || 0) + 1;
        dayCounts[ev.event] = (dayCounts[ev.event] || 0) + 1;
        recent.push(ev);
        accepted++;
    }
    while (recent.length > RECENT_MAX) recent.shift();

    if (accepted) {
        await Promise.all([
            env.GROW_KV.put('agg:counts', JSON.stringify(counts)),
            env.GROW_KV.put(byDayKey, JSON.stringify(dayCounts), { expirationTtl: 60 * 60 * 24 * 120 }),
            env.GROW_KV.put('agg:recent', JSON.stringify(recent))
        ]);
    }
    return new Response(null, { status: 204, headers: cors });
}

function sanitize(raw) {
    if (!raw || typeof raw.event !== 'string' || !ALLOWED_EVENTS.has(raw.event)) return null;
    const props = {};
    if (raw.props && typeof raw.props === 'object') {
        for (const k of Object.keys(raw.props)) {
            if (ALLOWED_PROPS.has(k)) {
                const v = raw.props[k];
                if (typeof v === 'string') props[k] = v.slice(0, 40);
                else if (typeof v === 'number' || typeof v === 'boolean') props[k] = v;
            }
        }
    }
    return {
        event: raw.event,
        page: (raw.page === 'grow' || raw.page === 'music-video') ? raw.page : 'unknown',
        uid: typeof raw.uid === 'string' ? raw.uid.slice(0, 16) : null,
        t: Date.now(),
        props
    };
}

async function stats(url, env, cors) {
    const token = url.searchParams.get('token') || '';
    if (!env.STATS_TOKEN || token !== env.STATS_TOKEN) return json({ error: 'unauthorized' }, 401, cors);
    if (!env.GROW_KV) return json({ error: 'kv_unbound' }, 503, cors);
    const counts = JSON.parse((await env.GROW_KV.get('agg:counts')) || '{}');
    const recent = JSON.parse((await env.GROW_KV.get('agg:recent')) || '[]');
    // last 14 days of per-day counts
    const byDay = {};
    const now = new Date();
    for (let i = 0; i < 14; i++) {
        const d = new Date(now.getTime() - i * 86400000).toISOString().slice(0, 10);
        const v = await env.GROW_KV.get('agg:day:' + d);
        if (v) byDay[d] = JSON.parse(v);
    }
    return json({ counts, byDay, recent }, 200, cors);
}

function corsHeaders(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allow = (env && env.ALLOWED_ORIGINS) || '*';
    let allowed = '*';
    if (allow !== '*') {
        const list = allow.split(',').map(s => s.trim());
        allowed = list.includes(origin) ? origin : list[0];
    }
    return {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'content-type,accept',
        'Access-Control-Max-Age': '86400'
    };
}
function json(obj, status, cors) {
    return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...cors } });
}
