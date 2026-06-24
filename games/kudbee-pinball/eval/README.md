# Kudbee Pinball — Evaluator (dev-only)

A **Playwright + real-Chromium** harness that loads the game, drives it through a
rubric, screenshots it, and writes `findings.md`. This is the "Evaluator" leg of the
Planner → Generator → Evaluator build loop (spec → build → evaluate → findings → fix).
It is a **dev tool only** — it is not shipped and the game itself stays zero-build.

## Run
```bash
cd games/kudbee-pinball/eval
npm init -y >/dev/null 2>&1 || true
npm i playwright
npx playwright install chromium
node evaluator.mjs            # writes findings.md + *.png here
```

## Rubric (Phase 1)
loads · hook present · starts · ball enters the playfield · scoring works ·
flippers respond · no NaN · ≥45 fps · no real console errors (blocked web-font
requests are ignored). Extend the rubric as features land.
