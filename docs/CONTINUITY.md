# Continuity log

Append-only decisions and findings that future lanes should not re-litigate.

## 2026-09-24 — PR #175 owner gate (implementation frozen; no Cloudflare auth)

**DISCOVERY:** Branch `cursor/leaderboard-api-devbiz-2a63` is **implementation-frozen** at **`3309b29ff8912d16491c810c9dc116dc47f80ea7`**. Unified Worker code is on branch; **PR #175 not open on GitHub** from this environment (ManagePullRequest requires user approval; GitHub MCP `create_pull_request` → 403). **Founder opens manually:** [compare main…branch](https://github.com/KudbeeZero/Devbiz/compare/main...cursor/leaderboard-api-devbiz-2a63?expand=1).

**IMPLEMENTATION:** No further application changes on #175 until owner-gated deploy is proven. D1 plan: **one** database `kudbee-leaderboard`; replace `REPLACE_WITH_YOUR_D1_DATABASE_ID` in root `wrangler.toml` **only** with owner-provided ID (or equivalent dashboard binding); **do not** create a duplicate DB; **do not** commit secrets.

**TEST_VERIFIED:** Unchanged — `leaderboard/` **111/111** at freeze commit. Local passed, no CI configured.

**LIVE_VERIFIED:** **No** — `npx wrangler whoami` → **not authenticated**; no remote D1 create/execute/deploy; no fabricated HTTPS receipts. Production `GET /api/health` on `devbiz.kudbee.workers.dev` still **404** (pre-#175 merge deploy).

**DECISION:** **STOP at owner gate.** No merge, no extra leaderboard feature work while #175 waits. #174 Pinball lane closed (merged).

**NEXT ACTION (owner / founder):** (1) Open PR #175 from compare link. (2) With authorized Cloudflare access: ensure single `kudbee-leaderboard` D1 exists → remote `schema.sql` → set real `database_id` → deploy unified Worker → HTTPS smoke: `GET /api/health`, `GET /api/leaderboard?game=pinball&…`, demo `POST /api/scores`, reload persistence, Pinball game-over → Post Score → reload. (3) Append LIVE receipts to this log; **PRODUCTION READY** only after LIVE VERIFIED + founder review/merge.

**Four-State (PR #175 infra):** CODE COMPLETE **yes** · TEST VERIFIED **yes** · LIVE VERIFIED **no** · PRODUCTION READY **no**.

## 2026-09-24 — PR #175 devbiz unified Worker (leaderboard API routing)

**DISCOVERY:** Pinball (#174 merged) verified HTTPS gameplay; `kd-leaderboard.js` loads; `GET /api/leaderboard` returned **404** because root `wrangler.toml` was **assets-only** (no `main`, no `/api/*` handler). Intended model per `leaderboard/README.md`: one Worker serves static site + `/api/*` backed by D1 — not a Pinball defect.

**IMPLEMENTATION:** Repo root `worker.js` re-exports `leaderboard/worker/worker.js` (single API implementation). Root `wrangler.toml`: `main`, `assets` binding `ASSETS`, `[[d1_databases]]` `DB` → `kudbee-leaderboard`, demo vars. Worker returns **503 `{ error: db_not_bound }`** when `DB` is missing (clear deploy gap vs silent 404). `leaderboard/test/worker-fetch.test.js` — routing, demo post/load, ASSETS passthrough, db guard (+6 tests). README deploy section updated.

**TEST_VERIFIED:** `leaderboard/` **111/111** (105 prior + 6 worker-fetch); local passed, no CI configured.

**LIVE_VERIFIED:** **No** — this environment has no Cloudflare auth; root `database_id` remains `REPLACE_WITH_YOUR_D1_DATABASE_ID` until owner binds real D1 (create + `schema.sql` + paste ID or dashboard binding). After deploy with DB: expect **200** on `GET /api/leaderboard?game=pinball&metric=score&limit=10`; until then preview may return **503** `db_not_bound` (routing present, persistence not wired).

**OWNER GATE (not in agent scope):** `npx wrangler d1 create kudbee-leaderboard` → execute `leaderboard/worker/schema.sql` → set `database_id` in root `wrangler.toml` or Cloudflare Workers → devbiz → Bindings → D1.

## 2026-09-24 — PR #174 deployed Cloudflare HTTP smoke (leaderboard path)

**DEPLOY (PR #174 bot, commit `7c8b31f3`):** Cloudflare Workers git integration — **Commit preview** `https://fa541bdc-devbiz.kudbee.workers.dev` · **Branch preview** `https://cursor-pinball-phys-timestep-fix-2a63-devbiz.kudbee.workers.dev` (same build). Vercel mirror: `https://devbiz-git-cursor-pinball-phys-timestep-fix-2a63-ascend9.vercel.app` (not primary). Pinball route: `/games/kudbee-pinball/`.

**DEPLOYED GAMEPLAY (Playwright + real Chromium on commit preview):** Launch → play; left-wall slide sp≈1129; right-lane contact sp≈783; forced drain → **game-over** (score 140, `ballsLeft` 0). **No page errors; no console errors** on this pass.

**DEPLOYED LEADERBOARD / NETWORK:** `GET …/leaderboard/client/kd-leaderboard.js` → **200** (304 on reload). `GET …/api/leaderboard?game=pinball&metric=score&limit=10` → **404** (empty body) on preview **and** on production host `https://devbiz.kudbee.workers.dev` (curl). Game-over UI: **`leaderboard offline`**; **`#lbPostBtn` hidden** (SDK client never binds — expected when top-10 load fails). Post-click with pre-set demo name: **no post** (button not shown). **Not** local/demo `file://` behavior — this is **http(s) hosted** with **relative `API_BASE: ''`** hitting a **static-only devbiz Worker** (root `wrangler.toml` assets only; no `/api/*` route). Separate `kudbee-leaderboard` Worker URL probe returned **404 / error 1042** — **no live production Worker** reachable from this environment for pinball receipts.

**CLASSIFICATION (Four-State):**

| State | PR #174 Pinball |
| --- | --- |
| **CODE COMPLETE** | Yes — physics frozen at `7c8b31f`; load/hardening + wall regression harness on branch. |
| **TEST VERIFIED** | Yes — Pinball evaluator **14/14** (file://); `leaderboard/` **105/105**; inline IIFE syntax OK; localhost HTTP regression **9/9** (prior). Local passed, no CI configured. |
| **LIVE VERIFIED** | **Partial** — **deployed static preview** gameplay + SDK load **verified** on Cloudflare HTTPS; **online leaderboard post/load not verified** (API 404 — infra gap, not Pinball regression). Do **not** claim full LIVE VERIFIED for leaderboard until `/api/leaderboard` returns 200 on the target host or `KD_LB_CONFIG.API_BASE` points at a deployed Worker. |
| **PRODUCTION READY** | **No** — founder review/merge + live leaderboard routing/Worker (owner-gated deploy). |

**DECISION:** No Pinball code change on #174 for this finding — client correctly degrades to “leaderboard offline” when API is absent. **Next larger improvement (infra lane):** mount leaderboard API on devbiz Worker (uncomment assets+routes per `leaderboard/README.md`) **or** set per-env `API_BASE` after Worker deploy; then rerun game-over → Post Score → reload top-10 on the **same** preview URL.

## 2026-09-24 — PR #174 wall-glue collision solver fix (replaces f7d927d heuristic)

**DISCOVERY:** Balls “glued” to side walls because (1) **`resolveSeg` velocity-normal override** ran whenever `v·n ≥ 0`, including **tangential slides while still penetrating** — depenetration pushed along ±Y instead of the geometric outward normal, so the ball never left the wall; (2) **contact blacklist** still skipped resolution for penetrations up to **0.35** radius units; (3) **`resolveAll` × 3** re-applied tangential **friction every iteration** on the same segment, compounding to near-zero slide speed (documented failure mode at buildTable comment). The f7d927d **wall-hug timer** masked symptoms; removed.

**IMPLEMENTATION:** Geometric normal always used when `pen > 0.012`; blacklist skip only when `pen ≤ 0.012`; tangential friction **once per segment per micro-substep** via shared `frictPass`; removed `wallT` eject hack. Evaluator rubric **`wall-slide-left`** (deterministic left-wall slide, y+100 / sp>85).

**TEST_VERIFIED:** Pinball evaluator **14/14** (file://); leaderboard **105/105**; inline IIFE syntax OK; **HTTP preview smoke** (`http://127.0.0.1:8765/...`) — launch enters playfield, `__kbTest.wallSlideLeft` sp≈1129, lazy SDK present, no console errors. Local passed, no CI configured.

**LIVE VERIFIED:** **No** — localhost/preview only; not production deploy or player evidence.

## 2026-09-24 — PR #174 multi-wall/corner physics regression harness

**DISCOVERY:** Shared `resolveSeg` fix needed proof beyond left wall — table has vertical cabinet walls, lane-inner (x≈800), angled top deflector, corner nubs, funnel diagonals, slings, and deflector TOI pocket (x≈831).

**IMPLEMENTATION:** Deterministic `__kbTest.runPhysWallRegression()` — nine cases (left/right slide, deflector angle, left-top corner, high-normal impact, long parallel slide, gravity micro-substeps, lane-deflector TOI, flipper-near-wall). Each asserts no hang (`stuck` counter), `ballMaxPen` ≤ threshold, minimum speed — **no timer/eject**. Evaluator rubric **`phys-wall-regression`** (replaces standalone `wall-slide-left` check).

**TEST_VERIFIED:** Pinball evaluator **14/14** (file://); leaderboard **105/105**; inline syntax OK; HTTP `http://127.0.0.1:8765/...` phys regression **9/9**. Local passed, no CI configured.

**LIVE VERIFIED:** **No**.

**NEXT (PR #174):** Deployed HTTP game-over → leaderboard post/load on Cloudflare preview (not localhost).

## 2026-09-24 — PR #174 single Pinball lane (phys + load-perf stack)

**LANE:** All Pinball work on **`cursor/pinball-phys-timestep-fix-2a63`** → [PR #174](https://github.com/KudbeeZero/Devbiz/pull/174). Preserved **`5608b0e`**; cherry-picked touch, load-perf, affordance, hardening, eval/docs (pinball-only).

## 2026-09-24 — Pinball ten-fix hardening batch (load-perf branch)

**FIXES:** (1) `sweptSeg` perpendicular velocity uses `pvAlong` (removed self-referential dead `pvy` line). (2) Leaderboard boot/post gated on `http(s)` — no `file://` fetch noise; game-over shows hosting hint. (3) `lbPost` queues through async SDK boot. (4) Tab hidden: skip physics dt + reset `acc`/`lastT` on visible. (5) Physics backlog capped after 5 substeps. (6) `gameOver`/`resetGame` clear charge + pointer roles. (7) Space keyup cannot launch from gate/over overlays. (8) `setFlip`/`physStep`/`drawFlipper` guard before table built. (9) Plunger affordance also when charging / launch pointer down (fine-pointer discoverability). (10) Canvas a11y + resize redraw calls `ensureTableBuilt()`.

**TEST_VERIFIED:** Pinball evaluator **13/13**; leaderboard **105/105**. Local passed, no CI configured.

## 2026-09-24 — Pinball evaluator `no-real-console-errors` (load-perf lane)

**Finding:** The sole failing rubric check (`no-real-console-errors`) is **`Fetch API cannot load file:///api/leaderboard?…`** when the game is opened via **`file://`**, `KD_LB_CONFIG.API_BASE` is empty, and `start()` calls `lbBoot()` → `lbLoadTop()` → SDK `fetch('/api/leaderboard')`. That relative URL resolves to `file:///api/…`, which Chromium rejects with a console `error` (not a page throw).

**Not a load-perf regression:** Same **11/12** result on the parent commit (`fe22bc2^`) with the evaluator loaded from `games/kudbee-pinball/index.html`. Deferred `buildTable()` / lazy SDK do not cause the message; `resetGame()` still calls `buildTable()` synchronously on `start()` before physics.

**Action:** Treat as **file:// harness limitation**; extend `games/kudbee-pinball/eval/evaluator.mjs` filters to match this pattern (same class as ignored font/network noise). Do not change leaderboard semantics or skip live HTTP(S) fetches when `API_BASE` is set.

## 2026-09-24 — Pinball on-canvas plunger affordance (coarse pointer)

**DISCOVERY:** Touch launch uses a wide right-column hold zone, but nothing on the table showed *where* to press; gate copy alone is easy to miss on mobile.

**IMPLEMENTATION:** `drawPlungerAffordance()` in HUD when `state === 'play'`, ball `inLane`, and `(pointer: coarse)` — cyan lane highlight (≥52% canvas width), plunger capsule icon, **HOLD** / **RELEASE** labels, charge arc while charging. Desktop unchanged (`isCoarse` false). Reduced motion: static pulse opacity, no sine animation on border. Coarse devices hide redundant “HOLD SPACE” HUD string.

**TEST_VERIFIED:** Pinball evaluator **13/13** (added `plunger-affordance-gate` via `__kbTest.plungerAffordanceWouldShow`). Leaderboard **105/105**. No gameplay/input/physics changes.

**DECISION:** Affordance is render-only; same gating as touch plunger hit-test width (52%). No parallel help system.

**NEXT ACTION:** Optional live mobile smoke on a coarse-pointer device; consider subtle first-serve animation if analytics show launch drop-off.
