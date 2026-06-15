/* =====================================================================
 * Kudbee Leaderboard — shared/core.js
 * Storage- and runtime-agnostic leaderboard logic. ONE place owns the API
 * routes, the metric catalog, validation, and ranking, so the Cloudflare
 * Worker and the portable Node dev server stay thin adapters over the same
 * behaviour. No platform globals beyond the standard `fetch`/`crypto` used
 * in shared/auth.js — this file is pure logic.
 *
 * A "store" is any object implementing:
 *   topByMetric(game, metric, limit) -> [{ userId, name, <metrics>, updatedAt }]
 *   getUser(game, userId)            -> record | null
 *   upsertScore(game, userId, name, metrics) -> record   (keeps best-ever)
 *   count(game)                      -> number
 * ===================================================================== */

// Per-game metric catalog. `dir:'max'` means a higher value is better and the
// store keeps the best-ever; `rank` marks metrics that can order the board.
export const GAMES = {
  darts: {
    label: 'Kudbee Darts',
    primary: 'rating',
    metrics: {
      rating:       { label: 'Rating',        dir: 'max', min: 0, max: 6000, rank: true },
      bestCheckout: { label: 'Best checkout', dir: 'max', min: 0, max: 170,  rank: true },
      total180s:    { label: '180s',          dir: 'max', min: 0, max: 1e6,  rank: true },
      wins:         { label: 'Wins',          dir: 'max', min: 0, max: 1e6,  rank: true },
      bestStreak:   { label: 'Best streak',   dir: 'max', min: 0, max: 1e6,  rank: true },
    },
  },
};

export function gameDef(game) { return GAMES[game] || null; }

// ---- Validation --------------------------------------------------------
export function cleanName(name) {
  let n = (name == null ? '' : String(name)).trim();
  // Strip control chars; collapse whitespace; clamp length.
  n = n.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').slice(0, 24);
  return n || 'Anonymous';
}

// Coerce + clamp incoming metrics to the game's catalog. Unknown keys dropped.
export function sanitizeMetrics(game, metrics) {
  const def = gameDef(game);
  if (!def) return {};
  const out = {};
  for (const key of Object.keys(def.metrics)) {
    const spec = def.metrics[key];
    let v = metrics ? metrics[key] : undefined;
    if (v === undefined || v === null) continue;
    v = Number(v);
    if (!Number.isFinite(v)) continue;
    v = Math.max(spec.min, Math.min(spec.max, Math.round(v)));
    out[key] = v;
  }
  return out;
}

// ---- Ranking -----------------------------------------------------------
function rankRows(rows, metric) {
  // rows already sorted desc by metric; assign 1-based competition rank.
  let rank = 0, prev = null, seen = 0;
  return rows.map((r) => {
    seen++;
    const v = r[metric] || 0;
    if (v !== prev) { rank = seen; prev = v; }
    return { rank, name: r.name, userId: r.userId, value: v, updatedAt: r.updatedAt };
  });
}

// ---- HTTP-ish handler --------------------------------------------------
// `handle` takes a normalized request and returns { status, body }. The
// adapter is responsible for CORS, method/preflight, and resolving `auth`
// (via shared/auth.js) before calling here.
//   req = { method, path, query (URLSearchParams|object), body (obj|null), auth (obj|null) }
export async function handle(store, req) {
  const q = req.query && typeof req.query.get === 'function'
    ? req.query
    : new URLSearchParams(req.query || {});
  const game = (q.get('game') || (req.body && req.body.game) || 'darts');
  const path = req.path.replace(/\/+$/, '') || '/';

  if (req.method === 'GET' && (path === '/api/health' || path === '/health')) {
    return ok({ ok: true, service: 'kudbee-leaderboard', games: Object.keys(GAMES) });
  }

  if (req.method === 'GET' && (path === '/api/leaderboard' || path === '/leaderboard')) {
    const def = gameDef(game);
    if (!def) return err(400, 'unknown_game');
    let metric = q.get('metric') || def.primary;
    if (!def.metrics[metric] || !def.metrics[metric].rank) metric = def.primary;
    let limit = parseInt(q.get('limit'), 10);
    if (!Number.isFinite(limit)) limit = 50;
    limit = Math.max(1, Math.min(100, limit));

    const rows = await store.topByMetric(game, metric, limit);
    const ranked = rankRows(rows, metric);
    const meId = req.auth && req.auth.userId;
    let you = null;
    if (meId) {
      const mine = await store.getUser(game, meId);
      if (mine) {
        you = { ...computeRankFor(await store.topByMetric(game, metric, 100000), metric, meId), value: mine[metric] || 0, name: mine.name };
      }
    }
    return ok({
      game, metric, label: def.metrics[metric].label,
      total: await store.count(game),
      entries: ranked.map((r) => ({ rank: r.rank, name: r.name, value: r.value, you: r.userId === meId })),
      you,
    });
  }

  if (req.method === 'GET' && (path === '/api/me' || path === '/me')) {
    if (!req.auth) return err(401, 'auth_required');
    const def = gameDef(game);
    if (!def) return err(400, 'unknown_game');
    const rec = await store.getUser(game, req.auth.userId);
    return ok({ game, demo: !!req.auth.demo, record: rec, ranks: rec ? await allRanks(store, game, req.auth.userId) : null });
  }

  if (req.method === 'POST' && (path === '/api/scores' || path === '/scores')) {
    if (!req.auth) return err(401, 'auth_required');
    const def = gameDef(game);
    if (!def) return err(400, 'unknown_game');
    const body = req.body || {};
    const name = cleanName(body.name || req.auth.name);
    const metrics = sanitizeMetrics(game, body.metrics);
    if (!Object.keys(metrics).length) return err(400, 'no_valid_metrics');
    const rec = await store.upsertScore(game, req.auth.userId, name, metrics);
    return ok({ ok: true, game, record: rec, ranks: await allRanks(store, game, req.auth.userId) });
  }

  return err(404, 'not_found');
}

async function allRanks(store, game, userId) {
  const def = gameDef(game);
  const out = {};
  for (const metric of Object.keys(def.metrics)) {
    if (!def.metrics[metric].rank) continue;
    const rows = await store.topByMetric(game, metric, 100000);
    out[metric] = computeRankFor(rows, metric, userId).rank;
  }
  return out;
}

function computeRankFor(rows, metric, userId) {
  const ranked = rankRows(rows, metric);
  const hit = ranked.find((r) => r.userId === userId);
  return { rank: hit ? hit.rank : null, of: rows.length };
}

function ok(body) { return { status: 200, body }; }
function err(status, code) { return { status, body: { error: code } }; }
