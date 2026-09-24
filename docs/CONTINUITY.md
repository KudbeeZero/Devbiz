# Continuity log

Append-only decisions and findings that future lanes should not re-litigate.

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
