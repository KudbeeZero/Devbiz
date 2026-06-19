# GrowVerse — Vercel Readiness & Protected Review Route (audit plan)

**Lane:** GrowVerse Plant Review / Vercel Readiness · **Status:** ⛔ **BLOCKED on
repo access** (see below) · **Driven from:** devbiz control plane (Mission Control + AI Command Center)

> **Honesty up front.** This session runs in an **isolated cloud container**, not
> your local WSL machine, and its GitHub access is scoped to `kudbeezero/devbiz`
> only. I **could not clone or read the GrowVerse repo** from here, so the
> repo-specific answers below are a **checklist to confirm**, not findings. I have
> **not** fabricated framework/build/env facts about code I can't see. Everything
> marked **⟨confirm⟩** needs a session that can actually read the GrowVerse repo
> (or you pasting the key files).

---

## Why the live audit is blocked (facts, from this container)

| Check | Result |
|---|---|
| Environment | Cloud container — `whoami=root`, `HOME=/root`, cwd `/home/user/Devbiz`. **Not** your WSL. |
| `/home/kudbee/projects/growverse-vercel-audit` | Does **not** exist here (that's your local machine). |
| `gh` CLI | **Not installed** in this container. |
| `vercel` CLI | **Not installed** in this container. |
| Node toolchain | ✅ present: node v22, npm 10, pnpm 10, yarn 1.22, git 2.43. |
| Network → github.com | ✅ reachable. |
| Clone `KudbeeZero/{growverse,GrowVerse}` | ❌ **"Repository not found"** + auth failed — private or different name/org, and **no GitHub token** in this container. |
| GitHub MCP scope | `kudbeezero/devbiz` only; no `list_repos`/`add_repo` tool to add GrowVerse. |

**Net:** to run the real audit you need **one** of:
1. Run this lane from a session/agent that has the GrowVerse repo in scope (e.g. your local WSL with `gh`/`git` already authed, or a Claude session scoped to the GrowVerse repo), **or**
2. Paste the key files here (no secrets): `package.json`, `pnpm-lock.yaml`/`package-lock.json`/`yarn.lock`, `next.config.*`, `vercel.json` (if any), `app/dev/plant-review/**` (or wherever that route lives), and the GrowChamber renderer entry.

---

## Audit checklist (run against the real repo)

Report first (before editing): `pwd`, repo URL, `branch`, `git status -sb`,
`git remote -v`, package manager, framework, build command, root directory.

- [ ] **Framework** ⟨confirm⟩ — Next.js? App Router (`app/`) or Pages (`pages/`)? Version?
- [ ] **Package manager** ⟨confirm⟩ — by lockfile: `pnpm-lock.yaml`→pnpm · `package-lock.json`→npm · `yarn.lock`→yarn.
- [ ] **Build command** ⟨confirm⟩ — default Next.js is `next build`.
- [ ] **Output mode** ⟨confirm⟩ — is `output: 'export'` (static) or `output: 'standalone'` set in `next.config`? Default (unset) = Vercel-native SSR/hybrid.
- [ ] **SSR / server routes** ⟨confirm⟩ — any `app/**/route.ts`, server actions, `getServerSideProps`, dynamic segments, middleware? If yes → **not** a pure static export.
- [ ] **Static export possible?** ⟨confirm⟩ — only if there are zero server-only features. A canvas/WebGL review board is client-side, but confirm no server routes back it.
- [ ] **Env vars needed now** ⟨confirm⟩ — grep `process.env.` and `NEXT_PUBLIC_`.
- [ ] **Public vs private env** ⟨confirm⟩ — `NEXT_PUBLIC_*` are embedded in the client bundle (safe, non-secret only); everything else is server-only.
- [ ] **Algo/wallet secrets for the Review Board?** ⟨confirm⟩ — a *visual* review board on the canonical GrowChamber renderer should need **none**. Verify it doesn't import wallet/Algorand client code at build/render.
- [ ] **`/dev/plant-review` truly dev-only?** ⟨confirm⟩ — is it guarded (e.g. `NODE_ENV`/middleware 404 in prod) or shippable? It must **not** be reachable in a public prod build.
- [ ] **GrowChamber renderer** ⟨confirm⟩ — does the Plant Review Board import the **canonical** renderer (not a fork/copy)?
- [ ] **Deploys on Vercel as-is?** ⟨confirm⟩ — after the above, does `next build` succeed locally with no required secrets?
- [ ] **Config changes needed for Vercel?** ⟨confirm⟩ — usually none; see below.

---

## Recommended Vercel settings (Next.js App Router — confirm against repo)

| Setting | Recommendation |
|---|---|
| Framework preset | **Next.js** (auto-detected). |
| Root Directory | Repo root, **unless** GrowVerse is a monorepo — then the app subfolder (the dir with `package.json` + `next.config`). ⟨confirm⟩ |
| Install command | Auto from lockfile (pnpm/npm/yarn). Don't override unless needed. |
| Build command | Default `next build` (leave blank to use the preset). |
| Output directory | Default (Vercel handles `.next`). **Do not** set a custom output for a standard Next app. |
| Node version | Pin via `package.json` `engines.node` (e.g. `>=20`) or Project Settings → Node 20.x. ⟨confirm⟩ |
| `vercel.json` | **Not needed** for a standard Next.js app. Add only if you need custom headers/redirects/regions — keep it minimal and harmless. |
| **Docker** | **Not** the production path — Vercel builds Next.js natively. Docker is fine to *document* for local/dev parity only. |
| Deployment Protection | Use Vercel **preview protection** (and/or front the domain with Cloudflare Access later) so previews aren't public. ⟨confirm plan tier⟩ |

> If `output: 'export'` is set and the board is fully static, Vercel still deploys
> it fine as a static site — but you lose server routes. Don't add `export` just
> to "simplify"; match what the app actually needs.

---

## Protected review route (design)

- **Keep `/dev/plant-review` dev-only.** Guard it so a production build 404s it —
  e.g. middleware or a server check: `if (process.env.NODE_ENV !== 'development') return notFound()`. Never expose it publicly.
- **Add a safe review route** for sharing: **`/review/plant-review`** (preferred) or
  `/lab/plant-review`. Protect it with **one** of:
  1. **Cloudflare Access** on that path once the domain is fronted by Cloudflare (your preferred security layer) — *not configured in this lane*; recommendation only.
  2. **Vercel deployment/preview protection** (so only authed teammates open the preview).
  3. A lightweight **app-level gate**: Next.js middleware checking an env-configured allowlist or a non-secret review token (`REVIEW_ACCESS_TOKEN`) — a gate, **not** a wallet/Algo secret.
- The review route should render the **canonical GrowChamber renderer** (read-only/visual), with **no wallet/Algorand wiring**.

---

## Env var framework (placeholders only — put in the GrowVerse repo, not here)

```
# .env.example  (GrowVerse) — placeholders only, never commit real values
# --- needed to BUILD/PREVIEW the review board (confirm against repo) ---
NEXT_PUBLIC_APP_URL=            # e.g. https://growverse-preview.vercel.app
# NEXT_PUBLIC_* = public, embedded in client bundle — non-secret config only

# --- review-route gate (optional, non-secret) ---
REVIEW_ACCESS_TOKEN=           # server-only gate for /review/plant-review (NOT a wallet key)

# --- deferred to LATER lanes (do NOT add now) ---
# ALGOD_*, INDEXER_*, WALLET_* ...  ← economy/chain; not required for the visual review board
```

- **Required now (build/preview):** likely none or just `NEXT_PUBLIC_APP_URL`. ⟨confirm⟩
- **Required later:** any real data source + the Algo/wallet set — **explicitly deferred**, not part of this lane.
- **Secret-free status:** the review board should be **secret-free**. ⟨confirm by grep⟩

---

## Domain / Cloudflare (recommendation only — no changes made)

- **Vercel = hosting.** **Cloudflare = registrar/DNS/security.** No DNS changes, no
  domain purchase, no Cloudflare Access configured in this lane.
- When you do connect a domain: add the Vercel-provided DNS target in Cloudflare.
  Note the known caveat — proxying (orange-cloud) Cloudflare *in front of* Vercel
  can conflict; Vercel generally wants **DNS-only (grey cloud)** or careful config.
  Document and decide later; don't change DNS now.

---

## Phone-checkable vs desktop/account-required

- **Phone-checkable:** this report; the recommended settings; the review-route plan.
- **Requires desktop / account access (cannot be done from this container):**
  the fresh clone + `pnpm/npm install` + local `next build`/lint/typecheck;
  `vercel whoami`/`vercel link`/any preview deploy; reading the private GrowVerse repo.
