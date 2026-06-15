/* =====================================================================
 * Kudbee Leaderboard — server/store-file.js
 * A dependency-free JSON-file store implementing the core store interface.
 * Good for local dev and small/single-instance deployments on any Node host.
 * For high traffic / multi-instance, use the Cloudflare D1 store instead.
 * Writes are serialized and atomic (temp file + rename).
 * ===================================================================== */
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { GAMES } from '../shared/core.js';

export function createFileStore(path) {
  let data = null;            // { [game]: { [userId]: record } }
  let writing = Promise.resolve();

  async function load() {
    if (data) return data;
    try {
      data = JSON.parse(await readFile(path, 'utf8'));
    } catch (_) {
      data = {};
    }
    for (const g of Object.keys(GAMES)) if (!data[g]) data[g] = {};
    return data;
  }

  async function persist() {
    const tmp = path + '.tmp';
    await mkdir(dirname(path), { recursive: true }).catch(() => {});
    await writeFile(tmp, JSON.stringify(data, null, 2));
    await rename(tmp, path);
  }

  function sorted(game, metric, limit) {
    const recs = Object.values(data[game] || {});
    recs.sort((a, b) => (b[metric] || 0) - (a[metric] || 0) || a.updatedAt - b.updatedAt);
    return limit ? recs.slice(0, limit) : recs;
  }

  return {
    async topByMetric(game, metric, limit) {
      await load();
      return sorted(game, metric, limit).map((r) => ({ ...r }));
    },
    async getUser(game, userId) {
      await load();
      const r = (data[game] || {})[userId];
      return r ? { ...r } : null;
    },
    async count(game) {
      await load();
      return Object.keys(data[game] || {}).length;
    },
    async upsertScore(game, userId, name, metrics) {
      await load();
      if (!data[game]) data[game] = {};
      const prev = data[game][userId] || { userId, game };
      const rec = { ...prev, userId, game, name };
      // Keep the best-ever for each metric (all metrics are dir:'max').
      for (const key of Object.keys(metrics)) {
        rec[key] = Math.max(prev[key] || 0, metrics[key]);
      }
      rec.updatedAt = Date.now();
      data[game][userId] = rec;
      writing = writing.then(persist, persist);
      await writing;
      return { ...rec };
    },
  };
}
