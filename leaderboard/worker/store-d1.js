/* =====================================================================
 * Kudbee Leaderboard — worker/store-d1.js
 * Cloudflare D1 (SQLite) store implementing the core store interface. One row
 * per (game, user_id); each rankable metric is a column kept at its best-ever
 * value. See schema.sql for the table. Ranking/limits run as ORDER BY queries.
 * ===================================================================== */
import { GAMES } from '../shared/core.js';

const METRIC_COLS = {
  // game -> [metric column names], derived from the shared catalog.
};
for (const g of Object.keys(GAMES)) {
  METRIC_COLS[g] = Object.keys(GAMES[g].metrics);
}

function rowToRecord(row) {
  if (!row) return null;
  const r = { userId: row.user_id, game: row.game, name: row.name, updatedAt: row.updated_at };
  for (const m of (METRIC_COLS[row.game] || [])) r[m] = row[m] != null ? row[m] : 0;
  return r;
}

export function createD1Store(db) {
  return {
    async topByMetric(game, metric, limit) {
      const safe = (METRIC_COLS[game] || []).includes(metric) ? metric : 'rating';
      const { results } = await db
        .prepare(`SELECT * FROM scores WHERE game = ? ORDER BY ${safe} DESC, updated_at ASC LIMIT ?`)
        .bind(game, limit || 100000)
        .all();
      return (results || []).map(rowToRecord);
    },
    async getUser(game, userId) {
      const row = await db
        .prepare('SELECT * FROM scores WHERE game = ? AND user_id = ?')
        .bind(game, userId).first();
      return rowToRecord(row);
    },
    async count(game) {
      const row = await db.prepare('SELECT COUNT(*) AS n FROM scores WHERE game = ?').bind(game).first();
      return row ? row.n : 0;
    },
    async upsertScore(game, userId, name, metrics) {
      const cols = (METRIC_COLS[game] || []).filter((c) => metrics[c] != null);
      // INSERT the row; on conflict keep MAX(existing, incoming) per metric.
      // excluded.* refers to the values we just tried to insert, so no extra
      // binds are needed for the UPDATE clause.
      const insertCols = ['game', 'user_id', 'name', 'updated_at', ...cols];
      const insertVals = [game, userId, name, Date.now(), ...cols.map((c) => metrics[c])];
      const placeholders = insertCols.map(() => '?').join(', ');
      const updateAssign = [
        'name = excluded.name',
        'updated_at = excluded.updated_at',
        ...cols.map((c) => `${c} = MAX(scores.${c}, excluded.${c})`),
      ].join(', ');

      await db.prepare(
        `INSERT INTO scores (${insertCols.join(', ')}) VALUES (${placeholders})
         ON CONFLICT(game, user_id) DO UPDATE SET ${updateAssign}`
      ).bind(...insertVals).run();

      return this.getUser(game, userId);
    },
  };
}
