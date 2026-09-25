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

## Rubric (18 checks)

| ID | What it proves |
|---|---|
| `loads` | No page errors on load |
| `hook` | `window.PINBALL` present |
| `start` | Launch → `state=play` |
| `plunger-affordance-gate` | Coarse-pointer plunger affordance gating |
| `touch-zone-mid-right` | Coarse mid-right plunger hit-test |
| `mouse-zone-corner` | Desktop lower-right plunger zone |
| `touch-hold-launch` | Synthetic touch hold launches ball |
| `ball-enters-playfield` | Ball reaches playfield (`min x < 700`) |
| `scoring-works` | Score increases during play loop |
| `flippers-respond` | Flipper angle moves on keypress |
| `no-nan` | Ball positions stay finite |
| `fps` | ≥45 fps (headless rAF count) |
| `phys-wall-regression` | 9 deterministic wall/corner cases via `__kbTest.runPhysWallRegression()` |
| `lower-playfield-geo` | Drain 1430 · kick 1382–1426 · flip py 1300 len 150 |
| `lower-funnel-band` | `prepBall(250,1280)` + 200 `physStep` — stuck counter ≤50 |
| `right-gutter-band` | `runLowerBandRegression()` — right gutter + hug-low |
| `flipper-band-edges` | `runLowerBandRegression()` — flipR / between / flipL alleys |
| `no-real-console-errors` | Ignores blocked fonts + `file://` `/api/leaderboard` noise when `API_BASE` is empty |

Extend the rubric as features land; run before claiming pinball gameplay green.
