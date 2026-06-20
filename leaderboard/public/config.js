/* Kudbee Leaderboard — public runtime config (safe to expose; no secrets).
 *
 * Leave CLERK_PUBLISHABLE_KEY empty to run in keyless DEMO mode (pick a
 * display name, no real accounts). To go live with real accounts, paste your
 * Clerk publishable key (pk_test_... or pk_live_...). The issuer/JWKS the
 * backend verifies against are derived from this key automatically.
 *
 * API_BASE: '' means "same origin" (the dev server and the Worker both serve
 * /api on the same origin). Point it at your Worker URL if the API is hosted
 * separately, e.g. 'https://kudbee-leaderboard.you.workers.dev'.
 */
window.KD_LB_CONFIG = {
  API_BASE: '',
  CLERK_PUBLISHABLE_KEY: '',
  GAME: 'darts',
  // Where the "Play Kudbee Darts" link points. On the studio site the game lives
  // at the repo-root path below; app.js applies this to the .back link.
  GAME_URL: '/games/kudbee-darts/',
};
