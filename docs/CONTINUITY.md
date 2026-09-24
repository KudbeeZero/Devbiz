# Continuity log

Append-only decisions and findings that future lanes should not re-litigate.

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
