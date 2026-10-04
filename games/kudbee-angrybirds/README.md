# Kudbee Birds

> **Kudbee Games Studio** — slingshot demolition across painted meadows. Zero install, zero build:
> canvas + Web Audio; birds, drones, blocks and effects are drawn in code, sound is synthesized.

Fling three kinds of bird at the Hive's drone fortresses across **8 levels** (the last is a boss),
using real rigid-body physics: stacks topple, glass shatters, stone cracks, TNT chains.

## Play

- **Hosted:** `/games/kudbee-angrybirds/index.html`
- **Locally:** from the repo root run `python3 -m http.server 8000`, then open
  <http://localhost:8000/games/kudbee-angrybirds/index.html>

## Controls

| Action | Mouse / touch | Keyboard |
|--------|---------------|----------|
| Aim | Drag the bird back from the slingshot (a dotted arc previews the shot) | `← →` power, `↑ ↓` angle |
| Fire | Release | `Space` / `Enter` |
| Bird ability | Tap anywhere while the bird is flying | `Space` |
| Pause / resume | Pause button | `P` or `Esc` |
| Restart level | Retry button | `R` |
| Sound on/off | Speaker button | `M` |
| Menus | Click / tap | `Tab`/arrows to move, `Enter` to pick, `N` next level |

## Birds

| Bird | Ability (one use, before it hits anything) |
|------|--------------------------------------------|
| Cyan **Dash** | Boost forward |
| Gold **Slam** | Dive straight down, hard — cracks roofs |
| Green **Split** | Split into three |

## Rules

- Destroy every drone to clear a level. Blocks are glass (weak), wood, stone (tough) and **TNT**
  (explodes, damaging and launching everything nearby, including other TNT).
- Score: blocks + drones + chain bonuses + **10,000 per unused bird**. Stars are by score; a win is
  always at least 1★ and unlocks the next level.
- Progress (stars, best score) and the sound setting are stored in `localStorage`
  (`kudbee.birds.v2`); everything degrades gracefully if storage is blocked.
- Fail a level and **Try Again** restarts that level (not the whole game).
- Each level has its own lighting mood (morning, dusk, sunset, ember, crimson night) graded over one painted
  backdrop (`assets/bg-lake.jpg`, 260 KB). If the image is missing or still loading, a procedural neon skyline
  is drawn instead, so the stage is never empty.
- Honors `prefers-reduced-motion` (no shake, no slow-mo, static stars) and pauses when the tab is hidden.

## How it's built

```
src/util.js      namespace, seeded RNG, localStorage store
src/physics.js   rigid-body engine: box/circle SAT + clipped manifolds, warm-started impulses,
                 sleeping, impact damage. Fixed 1/60 s tick, 3 sub-steps, fully deterministic.
src/levels.js    level data (builder DSL)
src/world.js     game rules, DOM-free: launch, abilities, destruction, TNT, turn state machine
src/particle.js  cosmetic effects        src/audio.js   synthesized SFX + music bed
src/render.js    backdrop + world drawing  src/ui.js    HUD + menu/select/pause/win/fail screens
src/game.js      loop, input, wiring
assets/bg-lake.jpg   painted backdrop (level moods are baked in at load; meadow line = physics ground)
```

`world.js` has no DOM dependency, so the same code runs in the browser and in the headless tests.

## Verification

From the repo root (no CI configured):

```bash
npm run birds:eval     # engine/rules/levels (Node) + browser rubric (Playwright)
npm run birds:engine   # Node only — fast
npm run verify         # whole repo gate (includes birds:eval)
```

- `eval/engine.mjs` — stacking, no-tunnelling, determinism, abilities, state machine, every level
  stands still on its own, and **replays a recorded winning line for every level**
  (`eval/solutions.json`) so a physics or layout tweak can't silently make a level unwinnable.
- `eval/evaluator.mjs` — real Chromium (page served over a local HTTP server, like production), real pointer/keyboard input: menu, select + locks, launch,
  ability tap, keyboard aim, pause, a full recorded win, persistence across reload, fail flow,
  phone-sized viewport, reduced motion. Screenshots land in `eval/out/` (gitignored).
- `eval/solve.mjs` — beam-search bot that finds winning lines. Re-run after changing levels or
  physics: `node eval/solve.mjs --write` (use `FAST=1` for a quick coarse pass while iterating).

## Leaderboard

Not SDK-wired yet (local progress only). Wiring it is a follow-up on the shared
`leaderboard/client/kd-leaderboard.js` (metrics would be `score`, `stars`, `levelsCleared`);
live post/load also needs the Worker deployed (owner-gated — see `leaderboard/README.md`).
