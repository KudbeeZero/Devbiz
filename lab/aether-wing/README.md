# FRONTIER: Aether Wing

Arcade space dogfighter — Kudbee Games Studio. Private preview (`noindex`).

`index.html` is the **playable slice** (Phase 1): a true-3D rail dogfighter built
on Three.js (vendored at `vendor/three.min.js` — no runtime CDN, fully
self-contained). The ship holds near the origin and steers in X/Y while the
world (asteroids, drones, their fire, starfield) streams toward the camera.

## Controls
- **Steer / aim:** mouse, WASD / arrow keys, or drag (touch)
- **Blasters:** hold Left-click / Space  ·  **Missiles (lock-on):** Right-click / X
- **Boost:** Shift  ·  **Pause:** P / Esc  ·  **Restart:** R  ·  **Mute:** M or the 🔊 button
- **Touch:** drag anywhere to steer; Fire / MSL / Boost buttons

## Loop
Threats approach from depth — destroy drones and asteroids before they reach
you. Killing without taking damage builds a multiplier; clearing a wave's drones
pays a wave bonus (250 × wave) and, after a short break, announces the next wave.
Missiles need a lock: with nothing ahead (or an empty rack) the reticle flashes red. Shield regenerates after a few seconds without damage; hull
does not. Hull 0 → results (score, wave, kills, accuracy, local best).

## Audio
Procedural Web Audio, no assets: blasters, hits, explosions, missiles, damage,
wave chimes and a filtered engine hum that rises on boost. The context starts on
the Launch gesture; mute persists in `localStorage` (`aw-muted`).

## Verification
`npm run aether:eval` — Playwright + Chromium (WebGL via SwiftShader), driving the
game through `window.AW`. 14 checks, including phone touch-steering and the
wave-break pause/restart regressions. Screenshots land in `eval/out/` (gitignored).

## Roadmap
1. **Playable slice** — flight, blasters, missiles, drones, asteroids,
   boost/shield/hull, waves, score, pause/restart, results. *(this PR)*
2. Premium visuals · 3. Menus & mobile polish · 4. Audio & feel *(first pass done)* ·
5. Site integration · 6. Proof layer (optional).

## Notes
- Vendored Three.js r160 (UMD build) loaded via classic `<script>` — matches the
  zero-build site; only other external dep is Google Fonts.
- Honors `prefers-reduced-motion`, pauses when hidden, DPR-capped.
