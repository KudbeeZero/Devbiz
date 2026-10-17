# Kudbee Archery

Read the wind, hold your breath, hit the gold. Zero-build Canvas 2D, no dependencies.

- **Modes:** *Range* — 5 ends of 3 arrows (max 150) at 18 / 30 / 50 / 70 m, 3 stars per range. *Duel vs CPU* — alternate arrows, each end is worth 2 set points (1 each if level), first to 6 wins; CPU is ROOKIE / PRO / LEGEND. *Balloon Pop* — arcade: balloons drift across the range 25 m out, pushed by the wind and bobbing; lead the movers. 12 arrows; 100 a balloon (gold 250, and it refills 2 arrows); pops on consecutive arrows build a combo up to x5; an arrow flies on after a pop, so two lined-up balloons both go (and score double each). Best score is saved.
- **Release:** letting go kicks the bow forward and away, the string snaps and shivers, and the view jolts.
- **Controls:** press and hold (or hold **Space**) to draw, move the pointer (or arrow keys) to aim, release to loose. Hold **B** / **Shift** / right-click to steady your breath (about 2.4 s, then you gasp and the sight shakes). Hold the full draw too long and your arm tires. **P** pause · **M** mute · **R** restart. On touch the sight rides above your fingertip and there is a HOLD BREATH button.
- **Wind:** the gauge shows which way the wind pushes the arrow. The sight is zeroed for still air, so *aim into the wind*. It re-rolls every end and gusts per arrow; longer ranges get stronger wind.
- **Scoring:** ten rings (1–10), the centre dot is an **X** (a 10 that breaks ties). The face is 40 cm at 18 m, 80 cm at 30 m and 122 cm at 50/70 m.
- **Physics:** metres. Gravity plus quadratic drag against the *air* (so wind matters); a bisection solver zeroes the sight for each distance. Less than a full draw means a slower, lower arrow. Fixed seeds replay identically.
- **Camera:** one pinhole camera blends between a zoomed scope view (aiming) and a wide view that follows the arc, then punches back in on the hit.
- **Arrow cam:** golds (plus the odd 7 or 8, so the cam alone doesn't give it away), the last arrow of a range and the CPU's X ride the arrow in, in slow motion, with speed lines, then hold close on the hit. Press (or Space) to skip.
- **The landing:** arrows are real 3D objects (shaft, three spinning vanes, nock). On impact the point drives in, the shaft flexes from its flight line to a tail-up rest and quivers; it punches a hole and casts a shadow on the face. After an arrow-cam shot the camera swings round to a three-quarter view of the arrow standing out of the boss.
- **Moments:** a fresh hit kicks up chaff; consecutive 9s and better build a **GOLD STREAK** (the chime climbs a tone each time; best streak is saved); an arrow that lands in the hole of one already in the face this end is a **ROBIN HOOD** and splits it.
- **Last-arrow pressure:** on a range's final arrow the screen shows what you need for a new best and for 3 stars; in a duel, what the CPU needs on its last arrow to take the end.
- **Focus:** a hidden tab pauses; a plain window blur (iframes, toolbars) only drops held input.

## Layout
`src/util.js` · `sim.js` (CFG, Flight, Score, Match, Bot — DOM-free) · `render.js` · `ui.js` · `game.js` · `audio.js`.

## Tests
- `npm run archery:engine` — 23 headless checks (sight solver, wind/drag, power, ring + X scoring, range and duel flow, determinism, bot skill curves, stars, ROBIN HOOD, last-arrow needs, Balloon Pop leading/combo/gold/double/flow, persistence).
- `npm run archery:eval` — 35 Playwright checks with real pointer/keyboard input, plus Balloon Pop, the release kick, face colours, arrow cam, landing replay, arrow rest pose, streak, ROBIN HOOD, last-arrow line and focus rules (screenshots in `eval/out/`, git-ignored).

Font: Lilita One (OFL), self-hosted.
