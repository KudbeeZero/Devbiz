# Kudbee Birds

> **Kudbee Games Studio** — bright cartoon slingshot demolition. Zero install, zero build: canvas + Web Audio.
> Birds, grubs, blocks and effects are drawn in code; all sound is synthesized.

Fling four kinds of bird at the Hive grubs' fortresses across **16 levels in two worlds** (each ends in
a boss), using real rigid-body physics: stacks topple, ice shatters, stone cracks, boulders roll, TNT chains.
The look is a bright cartoon style (chunky outlines, glossy UI); the characters are all original.

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
| Cream **Egg Bomb** | Lays an egg bomb straight down (it explodes on impact or after a short fuse) and recoils forward |

## Rules

- Destroy every grub to clear a level. Blocks are ice (weak), wood, stone (tough) and **TNT**
  (explodes, damaging and launching everything nearby, including other TNT), in boxes, planks, triangle roofs,
  rolling boulders and wheels, plus immovable rock hills to lob over. Helmeted grubs take more hits; bosses more still.
- Score: blocks + drones + chain bonuses + **10,000 per unused bird**. Stars are by score; a win is
  always at least 1★ and unlocks the next level.
- Progress (stars, best score) and the sound setting are stored in `localStorage`
  (`kudbee.birds.v2`); everything degrades gracefully if storage is blocked.
- Fail a level and **Try Again** restarts that level (not the whole game).
- World 1 (Meadow) uses a painted backdrop (`assets/bg-lake.jpg`, 260 KB) graded per level (morning, dusk,
  sunset, ember, crimson night). If it is missing or still loading a procedural skyline is drawn instead, so the
  stage is never empty. World 2 (Frostpeak) is a procedural snowy-mountain scene with falling snow.
- Display font: Lilita One (`assets/fonts/`, SIL OFL 1.1).
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
assets/bg-lake.jpg   painted backdrop for world 1 (meadow line = physics ground)
assets/fonts/        Lilita One (OFL)
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
