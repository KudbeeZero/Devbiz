# Kudbee Voidrunner

> **Kudbee Games Studio** — neon asteroid-belt flyer. Zero install, canvas + Web Audio, 60 FPS target.

Dive through a procedurally scrolling belt: steer, boost, chain-beam, missiles, and dash
through waves of rocks and bosses. Score scales with depth, kills, and survival time.

## Play

- **Hosted:** `/games/kudbee-voidrunner/index.html`
- **Locally:** from the repo root run `python3 -m http.server 8000`, then open
  <http://localhost:8000/games/kudbee-voidrunner/index.html>

## Controls

| Action | Keyboard | Touch |
|--------|----------|-------|
| Steer | `← → ↑ ↓` or `WASD` | Drag on canvas |
| Fire | `Space` | Tap |
| Boost | Hold `Shift` (afterburner at max) | Boost gauge |
| Chain beam | `C` when charged | Tap chain gauge |
| Missile | `V` (auto-lock) | **MSL** button (left of the chain gauge) |
| Dash | `X` (brief i-frames) | **DASH** button (right of the chain gauge) |
| Pause | `P` / `Esc` | ❚❚ button (top right) |

Pause (❚❚) and audio toggles are in the HUD. The run pauses itself when the tab or app is hidden; losing window focus releases held keys without pausing. Honors `prefers-reduced-motion` where animations allow.

## Verification

`npm run voidrunner:eval` — Playwright + Chromium, driving the game through `window.VOID`. 13 checks: clean frames with the bloom pass on (it used to throw every frame and skip the HUD), fps, scoring, pause button, blur key release, hidden-tab pause, game over, and phone touch controls. Screenshots land in `eval/out/` (gitignored).

## Leaderboard

Online scores use the shared **kd-leaderboard** SDK (`GAME: 'voidrunner'`). Metrics:
`score`, `waveSurvived`, `bestTime`. Demo mode works on any static host; set
`KD_LB_CONFIG.API_BASE` to a deployed Worker for live post/load (see `leaderboard/README.md`).
First run after load queues the cloud post until the SDK finishes booting (DBZ-068).

## Tech

Single-file `index.html` — procedural art, pooled particles, screen shake, boss phases.
Local top-10 initials remain as fallback when the SDK is offline.
