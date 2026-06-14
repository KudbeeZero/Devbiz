# Game Design Document — Kudbee Contra

*Kudbee Games Studio — Game #1. Living document; Phase 1 = Level 1 vertical slice.*

## Pillars

1. **Arcade clarity** — readable silhouettes, instant feedback, fair hits.
2. **Cinematic depth** — layered 2.5D parallax, fog, lighting, screen-shake.
3. **Fluid movement** — run/double-jump/slide flow that feels good moment-to-moment.
4. **100% original IP** — captures the *feeling* of classic run-and-gun without copying it.

## The world

A neon-soaked frontier where a private hive-intelligence has overrun a chain of outposts,
stations, and orbital cities. You play a lone **Kudbee Operative** sent to burn it back out.

## Protagonist — Kudbee Operative

Agile cyber-soldier in cyan reactive armor with a glowing visor and back-mounted thruster.

- **Moveset:** run, jump, double-jump (thruster burst), slide (under fire / through gaps),
  8-direction aim, fire, throw arc grenades.
- **Survivability:** 6 health pips, post-hit invulnerability window, 3 lives, checkpoint
  respawn near the current camera position.

## K9 — companion missile-dog

The operative is accompanied by **K9**, a robotic cybernetic hound (your "Jarvis") that hovers
at your side. Combat charges an **OVERDRIVE** meter; at full charge you trigger the **Special**
and K9 enters a **missile barrage**: it locks onto the nearest targets and fires homing,
splash-damage missiles for a few seconds, then the meter drains and rebuilds through kills.

- **Status:** ✅ Phase 1 (always-present companion + barrage special).
- **Charge:** +15 OVERDRIVE per enemy defeated; barrage lasts ~5s firing every ~0.3s.
- **Missiles:** homing (steer toward nearest enemy/boss), splash damage on impact.
- **Future:** levelled upgrades (wider barrages, shield drone mode, secondary abilities),
  and a "level-up / bonus power" progression that unlocks new K9 modes.

## Weapons

| Weapon        | Status | Behavior |
|---------------|--------|----------|
| Pulse Rifle   | ✅ P1  | Fast single bolt, default. |
| Spread Shot   | ✅ P1  | 5-pellet fan, power-up. |
| Plasma Cannon | ✅ P1  | Heavy slow bolt that **pierces** a whole line of enemies. |
| Laser         | ✅ P1  | Rapid-fire **piercing** beam-bolts. |
| Missiles      | ✅ P1  | Homing + splash — fired by the K9 companion barrage. |

Weapons are picked up in the level (Spread `S`, Plasma `P`, Laser `L`) and shown on the HUD.

## Progression — XP & levels

Defeated enemies grant **XP**. Filling the XP bar triggers a **LEVEL UP**, which:
- grants **+1 max health** (capped) with a small heal,
- **upgrades K9** — longer barrages, faster cadence, and from level 3 a second missile per volley.

The HUD shows the current **LV** and an XP bar; each level-up flashes a toast. This is the
seed of the deeper "bonus power" progression on the roadmap (unlockable K9 modes & abilities).

Weapons are a data table (`entities/weapons.js`) — new entries need no engine changes.

## Enemies

| Enemy           | Status | AI |
|-----------------|--------|----|
| Alien Drone     | ✅ P1  | PATROL → CHASE, dive for contact damage. |
| Cyber Soldier   | ✅ P1  | PATROL → ranged ATTACK with brief COVER repositioning. |
| Mechanical Turret | ✅ P1 | Stationary; tracks and fires on a cadence. |
| Hive Sentinel (mini-boss) | ✅ P1 | 2 phases: aimed volleys; enrages < 50% HP with denser spreads. |
| Mutated Creature | 🔜    | Melee lunger, erratic. |
| Cyber Soldier (elite) | 🔜 | Shielded, flanks. |
| Level Bosses    | 🔜     | Multi-phase set-pieces per level. |

AI uses plain state enums today; the structure is designed to grow into behavior trees
(see `AI_INTEGRATION.md` for Higgs Field AI–assisted authoring).

## Combat feel

Projectile pooling, hit-flash, particle explosions, floating damage numbers, screen-shake
scaled by event weight, and a dynamic boss-reveal zoom. Power-ups drop occasionally from kills
(health) and are placed in the level (health, spread).

## Levels

| # | Name                   | Status | Theme |
|---|------------------------|--------|-------|
| 1 | Neon Jungle Outpost    | ✅ P1  | Alien jungle + neon tech, fog, god-rays. |
| 2 | Abandoned Space Station| 🔜     | Derelict corridors, vacuum hazards. |
| 3 | Alien Factory          | 🔜     | Conveyors, presses, acid. |
| 4 | Orbital City           | 🔜     | Skyline rooftops, hover traffic. |
| 5 | Bio-Mechanical Hive    | 🔜     | Organic-machine fusion, final boss. |

Every level uses the 7-layer stack: far-bg, background, midground, gameplay, foreground,
particle, lighting — each scrolling at its own speed. Levels are data files matching
`world/level1.js`.

## Level 1 flow

Left→right traversal across a ground plane with raised ledges for verticality. Escalating
encounters (soldiers → drones → turrets, mixed) gate toward a locked **boss arena** where the
camera bounds clamp, the zoom pushes in, and the Hive Sentinel reveals. Defeat it →
**Outpost Cleared**.

## Difficulty & pacing

Phase 1 tuning aims for a ~2–3 minute confident clear, forgiving respawns, and a boss that
teaches its tells before the enrage. Future: Higgs Field AI–driven difficulty curves and
encounter variation per `AI_INTEGRATION.md`.

## Roadmap snapshot

- **Phase 1 (done):** Level 1 slice, core loop, 2 weapons, 3 enemies + mini-boss, asset
  pipeline + docs, website Games showcase.
- **Phase 2:** Levels 2–3, Plasma/Laser, elite enemies, frame-animated production art, music.
- **Phase 3:** Levels 4–5, full bosses, missiles, behavior-tree AI, save/leaderboard, polish.
