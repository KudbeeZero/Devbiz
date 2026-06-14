# Kudbee Contra

> **Kudbee Games Studio — Game #1**
> A 2.5D side-scrolling run-and-gun. *Phase 1 vertical slice: Level 1 — Neon Jungle Outpost.*

Kudbee Contra is an **original** modern arcade shooter that captures the feeling of classic
run-and-gun action — cinematic layered environments, fluid movement, and chunky combat —
without using any copyrighted assets. Everything here (art, sound, code) is original to
Kudbee Games Studio.

It runs as a **zero-dependency, zero-build** browser game (pure HTML5 Canvas + vanilla JS),
which is why it drops straight into this repo's static Cloudflare Pages deployment with no
toolchain.

---

## ▶ Play

- **Hosted:** open the website, go to **Games → Play Demo**, or open
  `games/kudbee-contra/index.html`.
- **Locally:** any static file server works. From the repo root:
  ```bash
  python3 -m http.server 8000
  # then open http://localhost:8000/games/kudbee-contra/index.html
  ```
  (It also runs from `file://`, but a server matches production exactly.)

## 🎮 Controls

| Action        | Keyboard            | Gamepad        | Touch (mobile)     |
|---------------|---------------------|----------------|--------------------|
| Move / Aim    | WASD or Arrows      | Stick / D-pad  | On-screen D-pad    |
| Jump / Double | Space               | A              | JUMP               |
| Fire          | K or X              | X              | FIRE               |
| Grenade       | L or C              | B              | GRN                |
| Slide         | Shift               | RB             | SLD                |
| Pause         | P or Esc            | Start          | —                  |
| Start / Retry | Enter               | A              | tap                |

Aim in 8 directions by holding a direction while firing (up, up-forward, and down while
airborne). Hold a direction and tap Slide on the ground to slide under fire.

Debug: `` ` `` toggles an FPS/entity readout, `M` mutes audio.

---

## 🧩 Architecture

Ordered classic `<script>` files attach to a single global namespace `window.KC` — clean
separation without a bundler. Load order is defined in `index.html`.

```
src/
  game.js                 KC.Game — state machine, spawn director, collisions, HUD, menus
  engine/
    util.js               math, AABB collision, ObjectPool
    loop.js               fixed-timestep 60Hz loop (decoupled update/render)
    input.js              keyboard + Gamepad API + touch -> unified actions
    camera.js             follow, trauma screen-shake, dynamic zoom, parallax offsets
    audio.js              WebAudio-synthesized SFX + procedural music (original)
    particles.js          pooled explosions/sparks/debris/damage-numbers
  art/
    sprites.js            procedural original sprites + asset-manifest fallback loader
  world/
    parallax.js           7 independently-scrolling depth layers
    level1.js             Neon Jungle Outpost level data (platforms/spawns/pickups/boss)
  entities/
    weapons.js            data-driven weapon table (Pulse Rifle, Spread Shot, …)
    projectiles.js        pooled player/enemy bolts + arcing grenades
    player.js             Kudbee Operative: full moveset + platform physics
    enemies.js            Drone / Cyber Soldier / Turret + Hive Sentinel mini-boss
assets/                   drop-in target for production/AI art (see docs/ASSET_PIPELINE.md)
docs/                     design + pipeline + AI-integration documentation
```

**Logical resolution** is a fixed `960×600`, scaled responsively to fit any screen while
keeping a crisp, consistent layout. The fixed-timestep loop targets a steady **60 FPS**.

## ✨ Phase 1 features

- Player: run, jump, **double-jump**, slide, 8-way aim, shoot, grenades, i-frames, death,
  respawn, 3 lives.
- Weapons: Pulse Rifle + Spread Shot power-up (table built to add Plasma/Laser/Missiles).
- Enemies: Alien Drone (patrol→chase), Cyber Soldier (ranged + cover), Mechanical Turret,
  and the **Hive Sentinel** 2-phase mini-boss.
- Combat FX: enemy projectiles, explosions, particles, hit flashes, floating **damage
  numbers**, health + spread **power-ups**.
- Cinematic camera: smooth follow with look-ahead, trauma screen-shake, **boss-reveal zoom**.
- Level 1: **7 parallax layers**, neon fog, god-ray shafts, glowing flora, drifting spores.
- Full game loop: Start menu → play → pause → Game Over / Outpost Cleared → restart, with
  HUD (health, lives, score, weapon, boss bar).

## 🗺 Roadmap (post–Phase 1)

Levels 2–5 (Abandoned Space Station, Alien Factory, Orbital City, Bio-Mechanical Hive),
full boss roster, remaining weapons, behavior-tree enemy AI, and production/AI-generated art
+ music swapped in through the asset pipeline. See `docs/GAME_DESIGN.md`.

## 🎨 Assets

All current art and audio are **procedurally generated in code** — 100% original and
copyright-safe placeholders. They can be replaced with production or AI-generated assets
**without any code changes** via `assets/manifest.json`. See **`docs/ASSET_PIPELINE.md`** and
**`docs/AI_INTEGRATION.md`** (Higgs Field AI / image + sound generation).
