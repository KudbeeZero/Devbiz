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
