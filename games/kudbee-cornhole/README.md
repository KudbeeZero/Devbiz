# Kudbee Cornhole

Backyard bag toss vs a CPU, first to 21 with cancellation scoring. Zero-build: Canvas 2D, no dependencies.

- **Play:** press/drag over the board to place the swaying aiming ring, release to throw (arrow keys + Space also work). **S** toggles *slide* (skids a few inches, can slide in) and *flop* (dies where it lands). P pause · M mute · R restart.
- **Rules:** hole = 3 (airmail = untouched), board = 1, floor = 0. Per round the lower score cancels the higher; the difference is banked. Eight bags per round, teams alternate; scorer throws first next round. Practice mode is one thrower, four bags.
- **Bag:** a sewn pillow — bowed edges, pinched dog-ear corners, double stitching, corn-fill highlights; it squashes and wobbles on impact (cosmetic spring, never feeds the physics).
- **Physics:** regulation 24×48 in boards on a 27 ft pitch, 12 in rise (10.6° slope). Bags are 3D in flight then slide in board-plane coordinates with friction, spin, bag-on-bag pushes, and the hole as a drop zone. Fixed 120 Hz step, fully deterministic.
- **CPU:** plans by simulating candidate throws (two-stage grid, both styles) and picking the best expected outcome; difficulty (ROOKIE / PRO / LEGEND) is execution noise, not omniscience.

## Layout
`src/util.js` (rng, store) · `physics.js` (CFG, Sim, Match rules, AI) · `render.js` (pitched pinhole camera, backdrop, board, bags) · `ui.js` (cartoon HUD) · `game.js` (controller) · `audio.js` (synthesized).

## Tests
- `npm run cornhole:engine` — 15 headless checks (geometry, airmail, styles, skill curve, bag pushing, determinism, cancellation, turn order, 21, CPU, store).
- `npm run cornhole:eval` — 14 Playwright checks with real pointer/keyboard input (screenshots in `eval/out/`, git-ignored).

Font: Lilita One (OFL), self-hosted in `assets/fonts/`.
