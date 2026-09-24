# Continuity log

Append-only decisions and findings that future lanes should not re-litigate.

## 2026-09-24 — Pinball evaluator `no-real-console-errors` (load-perf lane)

**Finding:** The sole failing rubric check (`no-real-console-errors`) is **`Fetch API cannot load file:///api/leaderboard?…`** when the game is opened via **`file://`**, `KD_LB_CONFIG.API_BASE` is empty, and `start()` calls `lbBoot()` → `lbLoadTop()` → SDK `fetch('/api/leaderboard')`. That relative URL resolves to `file:///api/…`, which Chromium rejects with a console `error` (not a page throw).

**Not a load-perf regression:** Same **11/12** result on the parent commit (`fe22bc2^`) with the evaluator loaded from `games/kudbee-pinball/index.html`. Deferred `buildTable()` / lazy SDK do not cause the message; `resetGame()` still calls `buildTable()` synchronously on `start()` before physics.

**Action:** Treat as **file:// harness limitation**; extend `games/kudbee-pinball/eval/evaluator.mjs` filters to match this pattern (same class as ignored font/network noise). Do not change leaderboard semantics or skip live HTTP(S) fetches when `API_BASE` is set.
