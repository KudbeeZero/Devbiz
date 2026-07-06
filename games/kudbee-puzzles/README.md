# Kudbee Puzzles — Circuit

A **bite-size brain-bender pack** by Kudbee Games Studio. Rotate pipe tiles to route power from
the core to every node on the board — 30 hand-picked boards from 4×4 up to 8×8, the last few
wrapping at the edges. Single-file, zero-build, all art and sound procedural.

## Play

Serve the repo root with any file server and open `games/kudbee-puzzles/`:

```bash
python3 -m http.server 8000
# → http://localhost:8000/games/kudbee-puzzles/
```

## Controls

| Input | Action |
| --- | --- |
| **Tap / click a tile** | Rotate it 90° |
| **Arrows** | Move the keyboard cursor |
| **Enter / Space** | Rotate the tile under the cursor |
| **U** | Undo |
| **R** | Restart the level |
| **Esc** | Back to level select |
| **M** | Sound toggle (persisted) |

## Design

- Every board is generated from a random spanning tree over the grid, then scrambled by rotation
  — **every level is provably solvable** (verified: flood-filling each level's solved
  configuration from its core lights 100% of cells, for all 30 shipped boards).
- Stars per level: 3 for solving at-or-under par moves, 2 for under double par, 1 for any solve.
  Progress (stars per level) saves locally to `kudbee.puzzles.progress`.
- Difficulty ramps from a plain 4×4 grid to an 8×8 grid with wrapping edges.
- A **flawless streak** badge appears on the win screen after two or more consecutive
  at-or-under-par (3-star) solves, capped at ×9+ — a session-only skill flourish, not persisted.

## Tech notes

Zero-build, no dependencies, single `index.html`. Canvas 2D at a capped device-pixel-ratio, one
`requestAnimationFrame` loop. `prefers-reduced-motion` tones down the connect/rotate animation.
Procedural WebAudio blips behind a persisted mute toggle — never before a user gesture. The level
generator that produced the embedded list ships in the same file behind a `#gen` dev flag, so more
boards can be produced the same way later.
