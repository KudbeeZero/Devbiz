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

**Cloud containers:** The evaluator auto-detects Chromium at `/opt/pw-browsers`
if available, so it runs without `playwright install` mismatch errors.

## Stuck-ball scan (not in the rubric yet)

`window.__kbTest.simulate(x, y, vx, vy, secs)` drops a ball, runs `physStep` headlessly
with flippers at rest, and returns `{ drained, maxStill, freed, where, touch }`:
`maxStill` = longest time (s) within 8px of one spot, `freed` = anti-stuck rescues fired,
`where` = first rescue positions, `touch` = colliders in contact when it ended. Grid it
over the table (x 80–790 step 30, y 150–1400 step 40, a few velocities, 6s) and flag
`maxStill > 1.2 || freed > 0`. Baseline after DBZ-079: **58 flags**, all balls balanced
exactly on a round post top or started inside the sealed pocket above the deflector
(was 2566). Run it before and after any physics or lower-table change.

## Rubric (21 checks)

| ID | What it proves |
|---|---|
| `loads` | No page errors on load |
| `hook` | `window.PINBALL` present |
| `start` | Launch → `state=play` |
| `plunger-affordance-gate` | Coarse-pointer plunger affordance gating |
| `touch-zone-mid-right` | Coarse mid-right plunger hit-test |
| `mouse-zone-corner` | Desktop lower-right plunger zone |
| `touch-hold-launch` | Synthetic touch hold launches ball |
| *(harness)* | After Space/touch, evaluator retries charged lane sim then `prepBall` fallback if headless plunger does not crest (playfield/scoring rubrics only) |
| `ball-enters-playfield` | Ball reaches playfield (`min x < 700`) |
| `scoring-works` | Score increases during play loop |
| `flippers-respond` | Flipper angle moves on keypress |
| `no-nan` | Ball positions stay finite |
| `fps` | ≥45 fps (headless rAF count) |
| `phys-wall-regression` | 9 deterministic wall/corner cases via `__kbTest.runPhysWallRegression()` |
| `nudge-impulse` | `__kbTest.nudgeImpulseTest()` — straight nudge adds ball speed (DBZ-067) |
| `solar-sail-mission` | `__kbTest.solarSailMissionTest()` — spinner totalSpins ≥50 lights mission C |
| `lower-playfield-geo` | Drain 1430 · kick 1382–1426 · flip py 1300 len 150 |
| `lower-funnel-band` | `prepBall(250,1280)` + 200 `physStep` — stuck counter ≤50 |
| `right-gutter-band` | `runLowerBandRegression()` — right gutter + hug-low |
| `flipper-band-edges` | `runLowerBandRegression()` — flipR / between / flipL alleys |
| `drain-lip-crawl` | `runLowerBandRegression()` — center drain lip (y≈1345) clears without hang |
| `no-real-console-errors` | Ignores blocked fonts + `file://` `/api/leaderboard` noise when `API_BASE` is empty |

Extend the rubric as features land; run before claiming pinball gameplay green.
