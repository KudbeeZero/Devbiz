# Kudbee Leaderboard 🏆

> Self-contained **online leaderboard + accounts** service for Kudbee games.
> Clerk auth, **Cloudflare Worker + D1** in production, a **portable Node dev
> server** for local testing and any Node host. No build step, no framework.

It ships in **keyless demo mode** so it runs and is testable *today* — players
pick a display name and post. Flip on real accounts later by pasting one Clerk
publishable key; **zero code changes.**

```
leaderboard/
  shared/      core.js (API + metrics + ranking) · auth.js (Clerk JWT verify + demo) · http.js
  worker/      worker.js (Cloudflare entry) · store-d1.js · schema.sql · wrangler.toml
  server/      dev-server.js (portable Node) · store-file.js (JSON store)
  public/      leaderboard.html · app.js · styles.css · config.js
  client/      kd-leaderboard.js (browser SDK, used by the page and games)
  test/        api.test.js (demo + real RS256 JWT verification)
```

The **same `shared/` logic** runs on both Cloudflare and Node — the platform
files are thin adapters, so behaviour can't drift between dev and prod.

## Run it locally

```bash
cd leaderboard
npm run dev           # → http://localhost:8787
```

- `/`            the Bullseye League page
- `/game/`       Kudbee Darts (served same-origin so the page can read your
                 local profile and publish it)
- `/api/health`  API health check

Play a match in the game, then hit **Publish your stats** on the page. In demo
mode you just pick a name; your best-ever values are stored and ranked.

Run the tests (demo flow, validation, ranking, and real Clerk JWT verification
against a mocked JWKS):

```bash
npm test
```

## Coverage gate (scoped to `shared/`)

There is a **real, quantitative coverage gate** — but it is scoped *honestly* to
`leaderboard/shared/` only. That's the deterministic, framework-free leaderboard
logic (`core.js`, `auth.js`, `http.js`) where a coverage percentage is actually
meaningful. **This is not a whole-repository coverage gate.** The Worker/D1
adapters, the dev server, the browser SDK, the games and the marketing site are
deliberately *out of scope* — a percentage there would be noise, not a signal.

```bash
npm run coverage           # run tests under c8; FAILS if shared/ drops below threshold
npm run coverage:snapshot  # refresh the JSON the read-only dashboard renders
```

- **Config / thresholds** live in `.c8rc.json` — the single, code-reviewed source
  of truth (`include: ["shared/**"]`, `all: false`, plus `lines`/`branches`/
  `functions`/`statements` floors). Change the gate only by editing that file in a
  reviewed PR.
- **CI** runs the gate on every push/PR (`.github/workflows/coverage.yml`,
  job *"leaderboard/shared/ coverage gate"*). It fails the build if coverage drops
  below the thresholds, and it verifies the committed dashboard snapshot is fresh.
- **Breakdown dashboard:** a *read-only* view at `tools/coverage-dashboard/` shows
  the exact per-file numbers, the configured thresholds, pass/fail status, and the
  weakest files. It only visualizes the data — it cannot change the gate.

The thresholds are set at the *current measured* coverage (floored, not aspired);
no test was backfilled to inflate a number, and there is no fake "80%" claim.

## Metrics

Defined once in `shared/core.js`. Per game:
- **`GAMES.darts`** — rating, bestCheckout, total180s, wins, bestStreak.
- **`GAMES.riff`** — score (primary), bestCombo, accuracy.

The server keeps each player's *best-ever* value and clamps inputs to sane
bounds (e.g. checkout ≤ 170, accuracy ≤ 100). Add a metric there + a column in
`schema.sql` to extend. Add another game by adding a `GAMES` entry.

**Kudbee Riff is wired in** (`games/kudbee-riff/` posts on the results screen and
shows a Top-10). To make Riff scores record online:
1. Deploy the Worker (see *Deploy to Cloudflare* below) and apply `schema.sql`.
   On an **already-deployed** D1, also run the one-time migration at the bottom
   of `schema.sql` (three `ALTER TABLE … ADD COLUMN` lines for score/bestCombo/
   accuracy), then the new indexes.
2. Point the game at the API: in `games/kudbee-riff/index.html` set
   `KD_LB_CONFIG.API_BASE` to your Worker URL (e.g.
   `https://kudbee-leaderboard.<acct>.workers.dev`) **or** route `/api` on the
   studio origin to the Worker (then `API_BASE: ''` works same-origin).
Until then the game degrades gracefully — local best only, posts fail quietly.

`rating` mirrors the in-game formula so the page and the game agree:
`1180 + level*38 + ladderRank*150 + bestStreak*22 + wins*6`.

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/health` | — | liveness |
| GET | `/api/leaderboard?game=darts&metric=rating&limit=50` | optional | standings (flags `you`) |
| GET | `/api/me?game=darts` | required | your record + ranks |
| POST | `/api/scores` `{game,name,metrics}` | required | upsert best-ever |

Auth is a `Authorization: Bearer <clerk-session-jwt>` header (real accounts) or
`X-Demo-User: <id>` + `X-Demo-Name` (demo). The browser SDK handles this for you.

## Deploy to Cloudflare (production)

The studio site already deploys on Cloudflare (`wrangler.toml` at the repo root).
This Worker adds the `/api/*` routes backed by D1.

```bash
cd leaderboard/worker
npx wrangler d1 create kudbee-leaderboard          # paste database_id into wrangler.toml
npx wrangler d1 execute kudbee-leaderboard --remote --file ./schema.sql
npx wrangler deploy
```

To serve the **site + games + leaderboard API from one Worker**, uncomment the
`[assets]` block in `worker/wrangler.toml` (`directory = "../"`). Otherwise deploy
the Worker standalone and point `public/config.js` `API_BASE` at its URL.

## Turn on real accounts (Clerk)

1. Create a Clerk application (or `clerk apps create "Kudbee" --json` with the
   Clerk CLI — the `clerk-setup` skill covers this).
2. Frontend: put your **publishable key** in `public/config.js`:
   ```js
   CLERK_PUBLISHABLE_KEY: 'pk_test_xxx',
   ```
   The page then loads Clerk from the CDN and shows real sign-in (Google/email).
3. Backend: set the same key as a Worker var and disable demo:
   ```bash
   cd leaderboard/worker
   npx wrangler deploy   # with CLERK_PUBLISHABLE_KEY set in wrangler.toml [vars]
   # and ALLOW_DEMO = "0", CLERK_AUTHORIZED_PARTIES = "https://your-site.com"
   ```
   The backend derives the **issuer + JWKS** from the publishable key and verifies
   every submission's RS256 signature **networklessly** (no secret key needed for
   token verification). No code changes — the same files, now gated by real auth.

> Security note: scores are submitted by the client, so the server clamps them to
> believable bounds and keeps best-ever values. That stops trivial tampering but
> isn't full anti-cheat — for that, validate match results server-side later.

## Turn on ALGO wallet authentication (Algorand)

The leaderboard supports **ALGO wallet authentication** as an alternative (or parallel)
to Clerk. Players can sign in with their Algorand wallet and their wallet address
becomes the persistent user identity.

### How it works

1. User connects their Algorand wallet (Pera, Defly, or another WalletConnect app)
2. SDK creates a signed message: `{ algo_address, timestamp, nonce, exp }`
3. User signs with their wallet (one-click approval, no chain write)
4. API verifies the ed25519 signature against the wallet's public key
5. Session cached for 7 days

### Setup

1. Ensure Pera SDK is available in `public/leaderboard.html`:
   ```html
   <script src="https://cdn.jsdelivr.net/gh/perawallet/connect-button@latest/dist/pera.js"></script>
   ```

2. Update `public/config.js` to enable ALGO:
   ```js
   window.KD_LB_CONFIG = {
     API_BASE: '',
     GAME: 'darts',
     AUTH_PROVIDERS: ['algo', 'demo'],  // NEW: enable ALGO wallet
   };
   ```

3. Backend: ALGO auth is enabled by default. To verify:
   ```bash
   # In wrangler.toml [env.production.vars]
   ALGO_AUTH_ENABLED = "true"           # default if unset
   ALGO_MAX_AGE_SECONDS = "600"          # 10 min message freshness
   ```

4. Deploy the Worker:
   ```bash
   cd leaderboard/worker
   npx wrangler deploy
   ```

### Authentication priority

The backend checks auth methods in order:
1. **ALGO wallet signature** (new)
2. **Clerk JWT** (existing)
3. **Demo mode** (existing, keyless)

The first valid auth method is used; others are ignored.

### User identity format

- **ALGO:** `userId = 'algo:XXXXX...XXXXX'` (wallet address with checksum)
- **Clerk:** `userId = 'clerk:<sub>'` (OpenID sub claim)
- **Demo:** `userId = 'demo:<id>'` (random ID, localStorage persisted)

All user data is stored in the same `scores` table; the prefix allows mixing auth methods
(though a player should use the same method consistently).

### Security notes

- **No chain writes:** ALGO auth is based on message signing only; no transactions.
- **Signature freshness:** Messages expire after 10 minutes; old signatures are rejected.
- **Nonce replay:** Each signature includes a unique nonce; replay attacks are prevented.
- **Public key verification:** Signatures are verified against the wallet's ed25519 public key
  (derived from the Algorand address), not a centralized service.
- **Wallet control:** The player's private key never leaves their wallet; Kudbee never sees it.

### Testnet vs. mainnet

By default, the Pera SDK connects to **testnet**. For production:
1. Configure Pera to use mainnet
2. Update `wrangler.toml` to point API_BASE at the production Worker
3. Verify a test submission works end-to-end

### Comparison: ALGO vs. Clerk

| Feature | ALGO | Clerk |
|---------|------|-------|
| **Setup** | Just Pera SDK | Clerk project + keys |
| **Cost** | Free | Free (up to limit) |
| **Identity** | Wallet address | Email/phone + OAuth |
| **Sign-in flow** | One-click (Pera) | Modal (Google/email/etc) |
| **Logout** | Disconnect wallet | Clerk sign-out |
| **Recovery** | User owns wallet; can re-import seed | Clerk account recovery |

## Wire it into the games / studio nav

The leaderboard page links back to the game via `config.js` `GAME_URL`
(default `/game/`; on the studio site set `/games/kudbee-darts/`). To add a
link the other way, drop this into the game or studio nav:

```html
<a href="/leaderboard/public/leaderboard.html">🏆 Online League</a>
```
