# Kudbee Munch — Windy City

An **original maze-chase** by Kudbee Games Studio. Beezer the bee-bot sweeps honey chips across a
neon Chicago grid after dark, powers up on Deep Dish Slices to turn the tables on four surveillance
drones, and grabs Chicago-icon bonus cameos along the way. Single-file, zero-build, all art and
sound procedural — deploys as-is on the studio's static stack.

**Original IP.** Genre mechanics only — original maze, original character (Beezer), original
rival designs (Hawk/Spire/Loop/Rando), original bonus items. No third-party characters, names, or
assets of any kind.

## Play

Serve the repo root with any file server and open `games/kudbee-munch/`:

```bash
python3 -m http.server 8000
# → http://localhost:8000/games/kudbee-munch/
```

## Controls

| Input | Action |
| --- | --- |
| **Arrows / WASD** | Steer (turns are buffered at intersections) |
| **Swipe / on-screen d-pad** | Touch steering |
| **P / Esc** | Pause |
| **M** | Sound toggle (persisted) |

## Design

- **Honey chips** fill the maze; clear them all to advance a level.
- **Deep Dish Slices** (4 per maze) flip the four surveillance drones — Hawk, Spire, Loop, and
  Rando, each with a distinct chase behavior — frosty and fleeing for a shrinking window each level,
  chainable for 200/400/800/1600 bonus points.
- **Chicago cameos** (hot dog, Bean sculpture, 'L' token, deep dish) spawn mid-level for bonus
  points and collect in the HUD.
- 3 lives, level-speed ramp, extra life at 10,000, best score saved locally
  (`kudbee.munch.best`).

## Tech notes

Zero-build, no dependencies, single `index.html`. Canvas 2D at a capped device-pixel-ratio, one
`requestAnimationFrame` loop, pauses when the tab is hidden. `prefers-reduced-motion` tones down
non-gameplay flourishes. Procedural WebAudio blips behind a persisted mute toggle — never before a
user gesture.
