# GrowVerse — Vercel Readiness & Protected Review Route

**Lane:** GrowVerse Plant Review / Vercel Readiness · **Status:** ✅ **Audited & build-verified**
**Repo audited:** `KudbeeZero/mainnet-growverse-v2.0` (public; the current v2 — `growVerseRepelitv1` is the older one) · **Driven from:** devbiz control plane

> **How this was audited (honest):** this session is a cloud container, not your
> WSL — so I could not write to `/home/kudbee/...` or use your local `gh`/`vercel`
> auth. But both GrowVerse repos are **public**, so I cloned `mainnet-growverse-v2.0`
> into the container, read the real source, and **ran `next build` — it succeeded.**
> Findings below are verified against the real code, not assumed.

---

## Verdict (owner's 7 questions)

1. **Fresh clone path:** I cloned the public repo in-container at `/tmp/...` (ephemeral). **You** should clone on your machine — exact commands at the bottom.
2. **Does it build locally?** ✅ **Yes.** `npm install` + `next build` in `growpod/web` succeeded (Next.js 15.1.6, React 19, Node 22). Produced a normal hybrid route manifest.
3. **Can Vercel deploy it as-is?** ✅ **Yes**, with the settings below — **two caveats**: (a) `/dev/plant-review` 404s in any production build (so you need a dedicated gated review route to preview it); (b) live game data needs the Flask backend URL, but the **visual review board needs neither backend nor secrets**.
4. **Exact Vercel settings:** see the table below.
5. **Env vars later:** see the env section — all **public flags** (default `false`) + one public API base; **no wallet/Algo secrets** for the review board.
6. **Login/admin/secret blocking deploy?** Nothing secret is needed to build/preview the review board. The only real "blocker" was repo access from this session — resolved (public). Doing it on **your** Vercel account requires *your* `vercel login` (don't share it with me).
7. **Safe to approve next:** add a gated `/review/plant-review` route in the GrowVerse repo (additive), then a no-secret Vercel **preview** of `growpod/web`. Details below.

---

## What the repo actually is (verified)

- **Monorepo, two deploy targets by design** (from the repo's own `fly.toml`):
  - **Backend** = Flask/Python (`growpod/`, gunicorn, `alembic`, `growpodempire`) → **Fly.io** (`api.frontierprotocol.app`); needs `DATABASE_URL`. *Not your Vercel target.*
  - **Frontend** = **Next.js app in `growpod/web/`** (`growv2-web`) — the public game UI. The repo notes it as Cloudflare Pages today; **this is what moves to Vercel.**
- **`growpod/web` is a standalone npm app** — it has its **own `package-lock.json`** and is **not** a member of the root or `growpod` pnpm workspaces. → On Vercel, install with **npm**, not pnpm.
- **Framework:** Next.js **15.1.6**, **App Router** (`growpod/web/src/app/**`), React 19, Tailwind 3, Zustand, TanStack Query.
- **Build output:** hybrid — mix of `○ Static (prerendered)` and `ƒ Dynamic (server-rendered)` routes. **Not** a static export (`output: 'export'` is NOT set). Vercel serves this natively (serverless functions).
- **`next.config.mjs`:** strict security headers (CSP, HSTS, X-Frame DENY) + `rewrites()` proxying `/api/*`, `/health`, `/openapi.json` to `BACKEND_URL` (default `localhost:8000`).

## Plant Review Board (verified)

- **Route:** `growpod/web/src/app/dev/plant-review/page.tsx` → `PlantReviewPanel.tsx`.
- **Dev-only gate is real:** `if (process.env.NODE_ENV !== "development") notFound();` — in any production build (incl. Vercel preview) it **404s before the panel renders**. Confirmed: it built as a route that returns 404 in prod. **Players never see it.**
- **Canonical renderer:** the panel inspects the real **`<GrowChamber>`** renderer (`components/viz/GrowChamber.tsx`) via `@/lib/chamber/*` (`chamberCore`, `strainVisuals`, `budDna`). ✅ canonical, not a fork.
- **No backend calls** in `PlantReviewPanel` (no `fetch`/`useQuery`) → **fully client-side**; renders standalone with no backend, **no secrets**.
- **No wallet/Algorand deps** anywhere in `growpod/web` (verified by grep). Chain/contracts are **feature flags, default `false`**.

---

## Exact Vercel settings (`growpod/web`)

| Setting | Value |
|---|---|
| Framework Preset | **Next.js** |
| **Root Directory** | **`growpod/web`** (monorepo subdir — set this in Vercel project settings) |
| Install Command | **npm** — leave default; Vercel sees `growpod/web/package-lock.json`. **Do not** force pnpm (web isn't in the pnpm workspaces). |
| Build Command | default `next build` |
| Output Directory | default (`.next`) — do not override |
| Node version | 20.x or 22.x |
| `vercel.json` | **Not needed.** Security headers + rewrites already live in `next.config.mjs` (Vercel honors them). Add one later only for custom regions/redirects. |
| **Docker** | **Not** the Vercel path — the root `Dockerfile`/`fly.toml` are the **Python backend**. Vercel builds Next natively. (Docker stays for the Fly backend / local parity only.) |

---

## Protected review route (recommended — additive change in the GrowVerse repo)

The catch: `/dev/plant-review` 404s on **any** prod build, so a plain Vercel preview won't show it. To review on a deployed URL without exposing `/dev/*` or shipping to players:

1. **Add `growpod/web/src/app/review/plant-review/page.tsx`** that renders `<PlantReviewPanel />` gated by a **non-secret env flag** (e.g. `NEXT_PUBLIC_ENABLE_REVIEW === "true"`), defaulting off. Reuse the existing flag pattern (`NEXT_PUBLIC_ENABLE_*`). Keep `/dev/plant-review` exactly as-is (dev-only).
2. **Protect the deployment**, not just the route: turn on **Vercel Deployment Protection** (preview protection / Vercel Authentication) so only you/teammates open the preview — or front it with **Cloudflare Access** later.
3. Result: enable the flag on a protected Vercel **preview** → review the canonical GrowChamber board on a real URL, no backend, no secrets, players unaffected.

> This is a small additive PR **in the GrowVerse repo** (not devbiz). I can draft it once a session has write access to `mainnet-growverse-v2.0`.

---

## Env vars (verified — `growpod/web/.env.local.example` exists)

| Var | Scope | Needed for review board? | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_API_BASE` | public | ❌ no | Flask API base; only for live game data. Empty → relative + dev rewrite. |
| `BACKEND_URL` | server-only | ❌ no | `next.config` rewrite target (default `localhost:8000`). Dev/local. |
| `NEXT_PUBLIC_ENABLE_MARKETPLACE` | public flag | ❌ no | default `false` |
| `NEXT_PUBLIC_ENABLE_CHAIN` | public flag | ❌ no | default `false` (Algorand path stays off) |
| `NEXT_PUBLIC_ENABLE_CONTRACTS` | public flag | ❌ no | default `false` |
| `NEXT_PUBLIC_ENABLE_CUP` | public flag | ❌ no | default `false` |
| `NEXT_PUBLIC_ENABLE_UNIVERSITY` | public flag | ❌ no | default `false` |
| (proposed) `NEXT_PUBLIC_ENABLE_REVIEW` | public flag | ✅ for the gated route | default `false`; enable only on the protected preview |

- **Required now (build/preview the review board):** none. The board renders client-side.
- **Required later (full game):** `NEXT_PUBLIC_API_BASE` → the deployed Fly backend; the backend itself needs `DATABASE_URL` (Fly secret, not Vercel).
- **Secret-free status:** ✅ the web app / review board need **no secrets** and **no wallet/Algo keys**.

---

## Domain / Cloudflare (recommendation only — nothing changed)

- **Vercel = hosting** for `growpod/web`; **Cloudflare = registrar/DNS/security**.
- When connecting a domain: add Vercel's DNS target in Cloudflare as **DNS-only (grey cloud)** for the Vercel host (proxying/orange-cloud in front of Vercel can conflict). No DNS change, no domain purchase, no Cloudflare Access in this lane.
- Backend stays on **Fly** (`api.frontierprotocol.app`) — keep frontend↔backend on separate hosts via `NEXT_PUBLIC_API_BASE`.

---

## Exact commands for YOUR machine (WSL)

```bash
mkdir -p ~/projects && cd ~/projects
git clone https://github.com/KudbeeZero/mainnet-growverse-v2.0.git growverse-vercel-audit
cd growverse-vercel-audit/growpod/web
npm install            # package-lock.json present → npm (not pnpm)
npm run build          # next build — verified working
# optional preview (asks for YOUR Vercel login — do not share it with the agent):
# npx vercel        # set Root Directory = growpod/web when prompted
```

## Phone-checkable vs desktop/account-required

- **Phone-checkable:** this report; the recommended settings; the route plan.
- **Requires your desktop/account:** running `vercel login` / creating the Vercel project / connecting a domain; deploying the Fly backend; merging any change into the GrowVerse repo.
