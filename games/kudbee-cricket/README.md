# Kudbee Cricket

A T20 **run chase** in the browser: you bat, the CPU bowls. Time the swing, aim at the gaps, loft it over the
rope. Zero-build Canvas 2D, no dependencies. All players are invented.

- **Play:** click/tap to swing as the ball reaches the bat. *Where you click (left–right) aims the shot.* Hover
  with a mouse to preview the aim wedge (also on the minimap). **GROUND** is safe and along the deck; **LOFT**
  hits big but with a tighter timing window. Keys: ←/→ aim · Space swing · L loft · P pause · M mute · R restart.
- **Timing:** early drags the ball to leg, late to off. Dead-on is *PERFECT*; the edge of the window edges the ball
  behind (caught-behind). Faster balls and LEGEND bowling shrink the window.
- **Bowling:** five bowlers (swing, pace, off-spin, leg-spin/googly, death-over yorker specialist) mixing good length,
  full, yorkers, bouncers, slower balls and wide lines. The field changes with the phase (powerplay → middle → death).
- **Rules:** target is set by the skill level; ROOKIE/PRO/LEGEND; 2/5/10-over chases with 3/5/8 wickets. Wide = +1 and
  re-bowl; no-ball = +1 and a **free hit** (can't be out). Boundary on the ground = 4, over the rope on the full = 6.
  Fielders catch, drop (rarely), field and throw; runs are taken only when the batters beat the throw.
- **Broadcast:** a TV-style presentation: a speed gun on every delivery, a commentary lower third after each ball
  (shot direction, fielder, result), bowler figures and current/required run rates on the scoreboard, a timing meter
  (EARLY ... LATE) under the feedback, a slow-motion action replay of sixes, wickets and perfectly timed fours (tap to
  skip), an end-of-over card, and a match-end scorecard with strike rates and a wagon wheel.
- **Physics:** metres, a 20.12 m pitch. Deliveries are solved analytically then integrated (gravity, swing, bounce,
  spin turn); hit balls have drag, bounces and rolling friction. Fixed seeds make matches fully reproducible.
- **Phone:** landscape fills the whole screen (a wide phone sees more of the ground, no letterbox bars) and the HUD
  rides the real edges. Thumb-sized buttons (≥ 32 CSS px) and bigger small print on touch screens; the tap point
  spans the full screen width for aim. Full screen + landscape lock on PLAY (Android Chrome), screen kept awake
  during a chase, vibration on contact, sixes and wickets (toggle in PAUSE), and a *turn sideways* card that pauses
  the match when the phone is held upright. Only a hidden tab pauses (not a window blur).

## Layout
`src/util.js` (rng, store) · `sim.js` (CFG, Delivery, Bowling AI, Field, Bat, Hit, Match, Bot — DOM-free) ·
`render.js` (one pinhole camera blending bat view ↔ field view) · `ui.js` (cartoon HUD) · `game.js` (controller) ·
`audio.js` (synthesized).

## Tests
- `npm run cricket:engine` — 24 headless checks (delivery physics, timing windows, shot direction, bowled/wide/no-ball/free-hit,
  catches, run model, match rules, determinism, bot difficulty curve, persistence, commentary/figures/wagon-wheel data).
- `npm run cricket:eval` — 24 Playwright checks with real pointer/keyboard input, plus an emulated landscape phone
  (844×390, touch): fill, studio link, edge HUD, tap-to-swing, tap-target size, the upright card (screenshots in
  `eval/out/`, git-ignored). Real-device checks (iPhone Safari, Android Chrome) are a manual gate.

Not modelled (yet): LBW, run-outs, byes, a second innings with you bowling. Font: Lilita One (OFL), self-hosted.
