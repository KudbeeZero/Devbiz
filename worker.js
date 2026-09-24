/* Devbiz Cloudflare Worker — static studio site + Kudbee Leaderboard API.
 * Reuses leaderboard/worker/worker.js (no duplicate API implementation).
 * wrangler.toml: ASSETS = repo root, DB = kudbee-leaderboard D1. */
export { default } from './leaderboard/worker/worker.js';
