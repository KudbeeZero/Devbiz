# GrowVerse — Living Plant Polish + Plant Analyst v1 (AUDIT)

**Lane:** GrowVerse Living Plant Polish + Plant Analyst v1 · **Status:** 🔎 **Audited — decision needed before any build**
**Repo audited:** `KudbeeZero/mainnet-growverse-v2.0` (public) · `growpod/web` (Next.js 15, App Router, npm) · **Driven from:** devbiz control plane

> **Scope honesty:** I cloned the public repo and read the real source. I **cannot
> open the gameplay PR** — my write access is `kudbeezero/devbiz` only. The build
> (priorities 1–10) must run in a session with write access to
> `mainnet-growverse-v2.0`. This doc is the required "audit first" + a v1 spec.

---

## The one finding that reframes the lane

**GrowVerse v2 is server-authoritative.** The Next.js app is a *thin client*:

- Account, players, pods, **plants**, care actions, and the **Advisor** all go
  through `lib/api/client.ts` → `/api/game/*`, proxied by `next.config.mjs`
  `rewrites()` to `BACKEND_URL` (the Flask backend on Fly).
- `lib/localStore.ts` only caches **pod/plant IDs** in localStorage; the backend
  is authoritative for the actual plant/sim state. **There is no client-side game
  simulation.**

So "make it playable today, local-first" is **not a polish** — it would mean
building a second, client-side simulation of plant growth/care/analysis that does
not exist, diverging from the canonical server sim. That collides with this lane's
own rules ("use the canonical renderer/state only," "no fake AI/state").

**The fast path to playable is wiring the backend — not a rewrite.** The plant,
renderer, stats, actions, and Plant Analyst already exist; they're dark only
because the API is unreachable.

---

## Audit answers (the requested checklist)

**Login / account flow + exact 404 cause** — `components/onboarding/OnboardingPanel.tsx`:
- **"New account"** → `api.players.create()` → `POST /api/game/players`.
- **"I have a key"** → `api.players.get(id, key)` → `GET /api/game/players/{id}` with `X-API-Key`.
- Both hit `/api/game/*` → rewritten to `BACKEND_URL`. On Vercel `BACKEND_URL` is
  unset → defaults to **localhost** → Vercel returns **`DNS_HOSTNAME_RESOLVED_PRIVATE` (404)**.
  The form surfaces it via `toast.error(e.message)` → the raw error you saw.
  **Root cause = backend not wired on Vercel, confirmed in code.** Not a code bug.

**Local save / session / key** — API key + player id in `localStorage`
(`gpe.api_key`, `gpe.player_id`); `useIdStore` (zustand `persist`) caches pod/plant
IDs per player. Recovery = "import by id + key." **No offline play.**

**Plant renderer entry** — `components/viz/GrowChamber.tsx` (canonical), driven by
`lib/chamber/*`: `chamberCore`, `budDna`, `morphology`, `phyllotaxy`, `trichomes`,
`strainVisuals`, `apicalDominance`, `budPhysics`. ✅ canonical — do not replace.

**Player/grower & GrowPod state** — `lib/types.ts`: `Player` (id, username, api_key…),
`Pod` (tier…), `Plant`.

**Plant stats (real fields the Analyst can read)** — from `interface Plant`:
`growth_stage`, `height`, `health`, `water_level`, `nutrient_level`, `pest_level`,
`disease_level`, `condition_flags[]`, `is_alive`, `harvested` (+ `PlantMetrics`,
`PlantState`). **These are server-provided.**

**Motion / touch effects** — `GrowChamber` has `pointermove` handling (cosmetic
parallax/hover); `Microscope.tsx` has drag/inspect. **Touching the plant has no
stress/damage path** (no `stress`/`damage` in the viz components). ✅ touch is
already cosmetic — safe.

**Plant Analyst already exists** — `components/plant/AdvisorPanel.tsx` +
`lib/api/advisor.ts`: an **"AI Master Grower" read-only diagnosis on demand**
(`GET /players/{id}/plants/{id}/advisor`) plus a guarded agentic **auto-care**
(budget + action cap). This is exactly the "thinks, then gives observations + a
next action" panel — **already built, backend-powered.**

**Wired vs not wired** — *Everything game-facing is wired to the backend and works
when the backend is reachable.* Nothing is "fake." The only break is the missing
`BACKEND_URL`/`NEXT_PUBLIC_API_BASE` + the backend being behind a Cloudflare
challenge (`api.frontierprotocol.app` → "Just a moment" 403).

**`/dev/plant-review`** — still `NODE_ENV`-gated → 404 in production. ✅

---

## Two ways forward (owner decision)

**Option A — Wire the backend (recommended; fastest "playable today").**
Not gameplay code; it's config/infra (owner actions):
1. Set `BACKEND_URL` + `NEXT_PUBLIC_API_BASE` on the GrowVerse Vercel project to a
   reachable API origin; redeploy.
2. Make that API origin **challenge-free** (the planned `api.growverse.dev`, DNS-only /
   WAF-bypass for `/api/*`) — a browser JS-challenge breaks server-to-server calls.
3. Confirm the Fly backend is up + DB migrated.
→ Result: account creation, the plant render, stats, actions, and the **existing
Plant Analyst** all light up. No rewrite, no fake state.

**Option B — Offline "demo grower" as a real gameplay PR (bigger, in the GrowVerse repo).**
If you want *something* before the backend is wired, a v1 that is **honest about
being a local demo**:
- "New account" → creates a **local demo grower** (clearly labelled "Demo — not
  synced"); "I have a key" → "restore not connected yet."
- Replace the raw 404 with a friendly message + a "Try demo mode" path.
- A **rule-based "Plant Analyst (offline)"** that reads only the real `Plant`
  fields above and is **labelled rule-based, not AI** — observations like "water_level
  low for this stage," "no pest/disease flags," "health stable." Suggests one next
  action. **Take Sample** = non-destructive card (timestamp + notes), no health/genetics change.
- Mobile polish + better cards/loading/saved states.
- Risk: a local demo sim is a *parallel* state to the canonical server game; keep it
  cosmetic + clearly labelled to honor the "no fake" rule. **Must be built in a
  GrowVerse-repo session — I can't push there.**

---

## Verification note
Cloned + read the real source (this container). I did **not** run `npm install`/build
or change anything. No secrets, no wallet/Algo, no deploy, no DNS. The gameplay PR
(either option's code) requires a GrowVerse-repo-scoped session.

---

## Option A — Backend wiring runbook (owner chose this, 2026-06-19)

**Verified config (from `growpod/web/next.config.mjs`):**
- Server-side rewrites proxy `/api/:path*`, `/health`, `/openapi.json` →
  **`BACKEND_URL`**, which defaults to **`http://localhost:8000`** when unset →
  on Vercel that's the `DNS_HOSTNAME_RESOLVED_PRIVATE` 404. **`BACKEND_URL` is the
  one var that breaks login.**
- Client base = `NEXT_PUBLIC_API_BASE` (empty → same-origin relative → uses the
  rewrite). CSP `connect-src` auto-includes `NEXT_PUBLIC_API_BASE` if set.
- Fly backend app = **`frontiernext`** (region `ord`); `[deploy] release_command`
  runs `alembic upgrade head && seed` and **requires the `DATABASE_URL` secret**.

> ⛔ **Blocker found (verified now): the backend is not reachable.**
> `https://frontiernext.fly.dev/health` → **timeout** (app down / scaled to zero),
> and `https://api.frontierprotocol.app/health` → **403 Cloudflare challenge**.
> Wiring Vercel does nothing until the backend is up at a **challenge-free** origin.

**Step 0 — bring the Fly backend up + confirm DB (your machine, `fly` CLI):**
```bash
fly status -a frontiernext
fly machine list -a frontiernext      # ensure ≥1 machine is started (Fly auto-stops idle ones)
fly secrets list -a frontiernext      # DATABASE_URL must be set (release_command needs it)
fly deploy                            # if needed — runs migrations + seed
curl https://frontiernext.fly.dev/health   # must return 200 before continuing
```
(If you want it always-on, set `auto_stop_machines = false` / `min_machines_running = 1`
in `fly.toml [http_service]`.)

**Step 1 — choose a challenge-free API origin for `BACKEND_URL`:**
- Simplest: `https://frontiernext.fly.dev` (Fly's own domain — no Cloudflare challenge), once Step 0 returns 200.
- Or `https://api.growverse.dev` pointed at the Fly app with Cloudflare **DNS-only
  (grey cloud)** so there's no JS challenge. (`api.frontierprotocol.app` is
  orange-clouded → 403 challenge → unusable for server-to-server.)

**Step 2 — set the env var on the GrowVerse Vercel project (Settings → Environment Variables, Production + Preview):**
- `BACKEND_URL = https://frontiernext.fly.dev`  *(or the api.growverse.dev DNS-only host)*
- Leave `NEXT_PUBLIC_API_BASE` **empty** → client uses same-origin → Vercel rewrite
  → backend → **no CORS**, CSP `connect-src 'self'` stays valid. (Only set it to the
  API origin if you want direct client→API; then the backend must send CORS for
  `https://growverse.dev`.)
- It's a URL, not a secret — but **you** set it in Vercel; I won't touch your project.

**Step 3 — redeploy** the Vercel project (env changes need a new deployment).

**Step 4 — verify:**
```bash
curl https://growverse.dev/health      # → 200 (proxied), NOT the DNS_HOSTNAME_RESOLVED_PRIVATE 404
# then on growverse.dev: "New account" → returns an api key, no raw 404
```
Ping me after and I'll re-verify `growverse.dev/health` + the account path externally.

**Order of operations:** Step 0 (backend up) is the real blocker — `BACKEND_URL`
can't help until `frontiernext.fly.dev/health` returns 200.
