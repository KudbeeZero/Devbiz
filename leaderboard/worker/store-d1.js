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
const METRIC_DIR = {
  // game -> { metric: 'max'|'min' }, derived from the shared catalog.
};
for (const g of Object.keys(GAMES)) {
  METRIC_COLS[g] = Object.keys(GAMES[g].metrics);
  METRIC_DIR[g] = {};
  for (const m of METRIC_COLS[g]) METRIC_DIR[g][m] = GAMES[g].metrics[m].dir || 'max';
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
      const cols = METRIC_COLS[game] || [];
      const safe = cols.includes(metric) ? metric : 'rating';
      const dir = (METRIC_DIR[game] && METRIC_DIR[game][safe]) || 'max';
      const { results } = await db
        .prepare(`SELECT * FROM scores WHERE game = ? ORDER BY ${safe} ${dir === 'min' ? 'ASC' : 'DESC'}, updated_at ASC LIMIT ?`)
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
      // INSERT the row; on conflict keep best-ever per metric (MAX for 'max',
      // MIN for 'min'). excluded.* refers to the values we just tried to insert.
      const insertCols = ['game', 'user_id', 'name', 'updated_at', ...cols];
      const insertVals = [game, userId, name, Date.now(), ...cols.map((c) => metrics[c])];
      const placeholders = insertCols.map(() => '?').join(', ');
      const updateAssign = [
        'name = excluded.name',
        'updated_at = excluded.updated_at',
        ...cols.map((c) => {
          const dir = (METRIC_DIR[game] && METRIC_DIR[game][c]) || 'max';
          return dir === 'min' ? `${c} = MIN(scores.${c}, excluded.${c})` : `${c} = MAX(scores.${c}, excluded.${c})`;
        }),
      ].join(', ');

      await db.prepare(
        `INSERT INTO scores (${insertCols.join(', ')}) VALUES (${placeholders})
         ON CONFLICT(game, user_id) DO UPDATE SET ${updateAssign}`
      ).bind(...insertVals).run();

      return this.getUser(game, userId);
    },
    // cloud saves (table `saves`): a conditional write on the revision, so two devices can't overwrite each other blind
    async getSave(game, userId) {
      const row = await db.prepare('SELECT data, rev, updated_at FROM saves WHERE game = ? AND user_id = ?').bind(game, userId).first();
      return row ? { data: row.data, rev: row.rev, updatedAt: row.updated_at } : null;
    },
    async putSave(game, userId, data, rev) {
      const now = Date.now();
      const r = rev === 0
        ? await db.prepare('INSERT INTO saves (game, user_id, data, rev, updated_at) VALUES (?, ?, ?, 1, ?) ON CONFLICT(game, user_id) DO NOTHING').bind(game, userId, data, now).run()
        : await db.prepare('UPDATE saves SET data = ?, rev = rev + 1, updated_at = ? WHERE game = ? AND user_id = ? AND rev = ?').bind(data, now, game, userId, rev).run();
      return r && r.meta && r.meta.changes === 1 ? { ok: true, rev: rev + 1 } : { ok: false };
    },
  };
}
