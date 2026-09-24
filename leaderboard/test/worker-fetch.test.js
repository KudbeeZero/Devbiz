/* =====================================================================
 * Cloudflare Worker fetch() routing — devbiz unified deploy + standalone LB.
 * Uses an in-memory D1 mock (no Cloudflare credentials). Run: node --test
 * ===================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import lbWorker from '../worker/worker.js';
import devbizWorker from '../../worker.js';

function memD1() {
  const rows = [];
  return {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async all() {
              if (/ORDER BY score DESC/i.test(sql)) {
                const game = args[0];
                const limit = args[1];
                const filtered = rows.filter((r) => r.game === game).sort((a, b) => b.score - a.score);
                return { results: filtered.slice(0, limit) };
              }
              return { results: [] };
            },
            async first() {
              const game = args[0];
              const userId = args[1];
              const r = rows.find((x) => x.game === game && x.user_id === userId);
              return r || null;
            },
            async run() {
              const [game, userId, name, updatedAt, score] = args;
              const i = rows.findIndex((x) => x.game === game && x.user_id === userId);
              const row = {
                game,
                user_id: userId,
                name,
                updated_at: updatedAt,
                score: i >= 0 ? Math.max(rows[i].score, score) : score,
                bestMultiball: 0,
                modesCompleted: 0,
                rating: 0,
                bestCheckout: 0,
                total180s: 0,
                wins: 0,
                bestStreak: 0,
                bestCombo: 0,
                accuracy: 0,
                dist: 0,
                waveSurvived: 0,
                bestTime: 0,
                waves: 0,
                kills: 0,
                level: 0,
                chipsEaten: 0,
                wave: 0,
                boardsSolved: 0,
                bestMoves: 0,
                flawlessStreak: 0,
              };
              if (i >= 0) rows[i] = row;
              else rows.push(row);
              return { success: true };
            },
          };
        },
      };
    },
  };
}

const envBase = {
  DB: memD1(),
  ALLOW_DEMO: '1',
  ALLOWED_ORIGINS: '*',
  ASSETS: {
    fetch(req) {
      return new Response('static:' + new URL(req.url).pathname, { status: 200 });
    },
  },
};

test('devbiz worker re-exports the same fetch handler as leaderboard/worker', () => {
  assert.equal(devbizWorker.fetch, lbWorker.fetch);
});

test('worker: GET /api/health', async () => {
  const res = await lbWorker.fetch(new Request('https://devbiz.test/api/health'), envBase);
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.ok, true);
});

test('worker: GET /api/leaderboard pinball empty list', async () => {
  const res = await lbWorker.fetch(
    new Request('https://devbiz.test/api/leaderboard?game=pinball&metric=score&limit=10'),
    envBase,
  );
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.game, 'pinball');
  assert.equal(j.metric, 'score');
  assert.deepEqual(j.entries, []);
});

test('worker: demo POST /api/scores then leaderboard shows entry', async () => {
  const post = await lbWorker.fetch(new Request('https://devbiz.test/api/scores', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-demo-user': 'demo-pinball-1',
      'x-demo-name': 'SmokePlayer',
    },
    body: JSON.stringify({ game: 'pinball', metrics: { score: 4200, bestMultiball: 2, modesCompleted: 1 } }),
  }), envBase);
  assert.equal(post.status, 200);
  const got = await lbWorker.fetch(
    new Request('https://devbiz.test/api/leaderboard?game=pinball&metric=score&limit=10'),
    envBase,
  );
  assert.equal(got.status, 200);
  const j = await got.json();
  assert.equal(j.entries.length, 1);
  assert.equal(j.entries[0].name, 'SmokePlayer');
  assert.equal(j.entries[0].value, 4200);
});

test('worker: non-API defers to ASSETS binding', async () => {
  const res = await lbWorker.fetch(new Request('https://devbiz.test/games/kudbee-pinball/'), envBase);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /static:\/games\/kudbee-pinball\//);
});

test('worker: /api/* without DB binding returns 503 db_not_bound', async () => {
  const res = await lbWorker.fetch(
    new Request('https://devbiz.test/api/leaderboard?game=pinball&metric=score&limit=10'),
    { ALLOW_DEMO: '1', ALLOWED_ORIGINS: '*' },
  );
  assert.equal(res.status, 503);
  const j = await res.json();
  assert.equal(j.error, 'db_not_bound');
});
