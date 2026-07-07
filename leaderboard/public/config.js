/* Kudbee Leaderboard — public runtime config (safe to expose; no secrets).
 *
 * Authentication providers:
 *   AUTH_PROVIDERS: ['algo', 'clerk', 'demo']  (checked in order; first valid method used)
 *
 * ALGO Wallet (new):
 *   - Players connect an Algorand wallet (Pera, Defly, etc)
 *   - SDK signs a message; API verifies ed25519 signature
 *   - No chain writes; instant, free verification
 *   - Set AUTH_PROVIDERS: ['algo', 'demo'] to enable ALGO + demo fallback
 *
 * Clerk (existing):
 *   - OAuth/email-based authentication
 *   - To enable: set CLERK_PUBLISHABLE_KEY to your publishable key
 *   - Leave empty to disable
 *
 * Demo (keyless, always available):
 *   - Players pick a display name, no real accounts
 *   - Enabled by default if other providers not available
 *   - Can be disabled by setting AUTH_PROVIDERS to exclude 'demo'
 *
 * API_BASE: '' means "same origin". Point at your Worker URL if hosted separately.
 */
window.KD_LB_CONFIG = {
  API_BASE: '',
  CLERK_PUBLISHABLE_KEY: '',
  GAME: 'darts',
  AUTH_PROVIDERS: ['demo'],  // NEW: list enabled providers (algo, clerk, demo)
                              // Examples:
                              // ['demo'] — demo mode only
                              // ['algo', 'demo'] — ALGO wallet + demo fallback
                              // ['algo', 'clerk', 'demo'] — all three
  // Where the "Play Kudbee Darts" link points.
  GAME_URL: '/games/kudbee-darts/',
};
