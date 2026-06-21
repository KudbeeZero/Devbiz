# FRONTIER: Aether Wing

Arcade space dogfighter — Kudbee Games Studio. Private preview (`noindex`).

`index.html` is the **playable slice** (Phase 1): a true-3D rail dogfighter built
on Three.js (vendored at `vendor/three.min.js` — no runtime CDN, fully
self-contained). The ship holds near the origin and steers in X/Y while the
world (asteroids, drones, their fire, starfield) streams toward the camera.

## Controls
- **Steer / aim:** mouse, WASD / arrow keys, or drag (touch)
- **Blasters:** hold Left-click / Space  ·  **Missiles (lock-on):** Right-click / X
- **Boost:** Shift  ·  **Pause:** P / Esc  ·  **Restart:** R  ·  **Mute:** M

## Loop
Threats approach from depth — destroy drones and asteroids before they reach
you. Killing without taking damage builds a multiplier; clearing a wave's drones
advances the wave. Shield regenerates after a few seconds without damage; hull
does not. Hull 0 → results (score, wave, kills, accuracy, local best).

## Roadmap
1. **Playable slice** — flight, blasters, missiles, drones, asteroids,
   boost/shield/hull, waves, score, pause/restart, results. *(this PR)*
2. Premium visuals · 3. Menus & mobile polish · 4. Audio & feel ·
5. Site integration · 6. Proof layer (optional).

## Notes
- Vendored Three.js r160 (UMD build) loaded via classic `<script>` — matches the
  zero-build site; only other external dep is Google Fonts.
- Honors `prefers-reduced-motion`, pauses when hidden, DPR-capped.
