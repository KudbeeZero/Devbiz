# Kudbee Archery

Read the wind, hold your breath, hit the gold. Zero-build Canvas 2D, no dependencies.

- **Modes:** *Range* — 5 ends of 3 arrows (max 150) at 18 / 30 / 50 / 70 m, 3 stars per range. *Duel vs CPU* — alternate arrows, each end is worth 2 set points (1 each if level), first to 6 wins; CPU is ROOKIE / PRO / LEGEND.
- **Controls:** press and hold (or hold **Space**) to draw, move the pointer (or arrow keys) to aim, release to loose. Hold **B** / **Shift** / right-click to steady your breath (about 2.4 s, then you gasp and the sight shakes). Hold the full draw too long and your arm tires. **P** pause · **M** mute · **R** restart. On touch the sight rides above your fingertip and there is a HOLD BREATH button.
- **Wind:** the gauge shows which way the wind pushes the arrow. The sight is zeroed for still air, so *aim into the wind*. It re-rolls every end and gusts per arrow; longer ranges get stronger wind.
- **Scoring:** ten rings (1–10), the centre dot is an **X** (a 10 that breaks ties). The face is 40 cm at 18 m, 80 cm at 30 m and 122 cm at 50/70 m.
- **Physics:** metres. Gravity plus quadratic drag against the *air* (so wind matters); a bisection solver zeroes the sight for each distance. Less than a full draw means a slower, lower arrow. Fixed seeds replay identically.
- **Camera:** one pinhole camera blends between a zoomed scope view (aiming) and a wide view that follows the arc, then punches back in on the hit.

## Layout
`src/util.js` · `sim.js` (CFG, Flight, Score, Match, Bot — DOM-free) · `render.js` · `ui.js` · `game.js` · `audio.js`.

## Tests
- `npm run archery:engine` — 16 headless checks (sight solver, wind/drag, power, ring + X scoring, range and duel flow, determinism, bot skill curves, stars, persistence).
- `npm run archery:eval` — 17 Playwright checks with real pointer/keyboard input (screenshots in `eval/out/`, git-ignored).

Font: Lilita One (OFL), self-hosted.
