# Kudbee Orbital

A **zero-gravity twin-stick arena skirmish** by Kudbee Games Studio. Newtonian drift, escalating
drone waves, splitting asteroids, and combo-multiplier scoring inside a glowing station ring.
Single-file, zero-build, all art and sound procedural — deploys as-is on the studio's static stack.

## Play

Serve the repo root with any file server and open `games/kudbee-orbital/`:

```bash
python3 -m http.server 8000
# → http://localhost:8000/games/kudbee-orbital/
```

## Controls

| Input | Action |
| --- | --- |
| **WASD / arrows** | Thrust (adds momentum — there is no brake) |
| **Mouse** | Aim; hold left button to fire |
| **Touch** | Dual virtual sticks — left half thrusts, right half aims + fires |
| **Gamepad** | Twin-stick: left stick thrust, right stick aim/fire (RT or A also fire) |
| **P / Esc** | Pause |
| **M / 🔊 button** | Sound toggle (persisted) |

## Design

- **Newtonian drift** — thrust adds velocity; a tiny damping term and a speed cap keep it
  controllable, but momentum is otherwise conserved. Firing applies recoil.
- **Arena** — a circular station ring with a soft bounce; drifting asteroids split once
  (big → 2 medium → rubble) and carry over between waves.
- **Waves** — escalating drone mix per wave: **chasers** (ram you), **strafers** (orbit and
  snipe), **turrets** (near-static, fire *led* shots at your projected position). A wave banner
  announces each round; clearing all drones advances.
- **Pickups** (dropped on kills): **S** shield cell (absorbs a hit, stacks to 3),
  **R** rapid-fire (8 s), **E** EMP burst (clears enemy bullets, damages/knocks back nearby drones).
- **Scoring** — kill-streak combo multiplier up to ×8 (streak window 2.6 s; taking hull damage
  resets it). Best score persists in `localStorage` under `kudbee.orbital.best`.

## Engineering

- Zero-build vanilla JS + Canvas 2D in one `index.html`; only external request is the shared
  Google Fonts stylesheet used by every Kudbee title.
- Single `requestAnimationFrame` loop, clamped `dt`, DPR capped at 2, auto-pause when the tab hides.
- `prefers-reduced-motion` disables screen shake, glow blur, and trims particle counts.
- WebAudio blips are created only after the first user gesture; mute is a visible persisted
  toggle (`kudbee.orbital.muted`).
- Pre-rendered starfield + nebula offscreen canvases drawn with parallax offsets.
- `window.__test` exposes read-only state + helpers for automated smoke tests; it does not
  affect gameplay.
