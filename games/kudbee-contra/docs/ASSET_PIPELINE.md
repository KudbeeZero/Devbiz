# Asset Pipeline — Kudbee Contra

This document defines how AI-generated or hand-produced art and audio replace the original
**procedural placeholders** that ship in Phase 1 — with **zero code changes**.

## The core idea: a manifest swap

`art/sprites.js` loads `assets/manifest.json` on startup. Every logical asset key maps to a
file path:

- **Empty string** → draw the original code-based placeholder (current default).
- **Non-empty path** → load that image and use it instead.

```jsonc
// assets/manifest.json
{
  "version": 1,
  "assets": {
    "player.idle":          "characters/operative_idle.png",  // overrides placeholder
    "enemy.drone":          "",                                // keeps procedural art
    "bg.neon-jungle.far":   "backgrounds/nj_far.png"
  }
}
```

To swap an asset:
1. Drop the file into the matching `assets/<subfolder>/`.
2. Point its key at the path in `manifest.json`.
3. Reload. Done — no JS edits.

> The `index.html` calls `game.sprites.load('assets/manifest.json')` before starting, so the
> manifest is always the single source of truth for what is real vs. placeholder.

## Folder layout

```
assets/
  characters/   player operative sprites / sheets
  enemies/      drone, soldier, turret, boss
  backgrounds/  parallax layers (far / back / mid / fore)
  audio/        music + SFX (mp3/ogg/wav) — see AI_INTEGRATION.md
  ui/           logo, HUD frames, icons
  effects/      explosion / muzzle / impact sheets
  levels/       per-level tilesets and prop atlases
```

## Logical keys & recommended specs

| Key                     | Folder        | Suggested size / format         | Notes |
|-------------------------|---------------|---------------------------------|-------|
| `player.idle` / `.run` / `.jump` / `.slide` | characters | 64×64 frames, transparent PNG | side-on, facing right; engine flips for left |
| `enemy.drone`           | enemies       | 64×48 PNG                       | hover bob handled in code |
| `enemy.soldier`         | enemies       | 64×80 PNG                       | feet at bottom |
| `enemy.turret`          | enemies       | 64×56 PNG                       | barrel rotates in code; keep base only |
| `boss.hive-sentinel`    | enemies       | 256×220 PNG                     | symmetrical; core eye glows in code |
| `pickup.health` / `.spread` | ui        | 32×32 PNG                       | — |
| `bg.neon-jungle.far`    | backgrounds   | 1920×600, seamless horizontally | slowest parallax (~0.05) |
| `bg.neon-jungle.back`   | backgrounds   | 2000×600, tileable              | skyline (~0.2) |
| `bg.neon-jungle.mid`    | backgrounds   | 1600×600, tileable              | canopy (~0.45) |
| `bg.neon-jungle.fore`   | backgrounds   | 1280×600, alpha edges           | near vines (~1.25) |
| `ui.logo`               | ui            | 512×256 PNG                     | menu title |

**Conventions**
- Sprites face **right**; the engine mirrors for left-facing.
- Transparent backgrounds (PNG) for all entities/props.
- Background layers must **tile seamlessly** on X (they scroll and repeat).
- Keep the studio palette: neon cyan `#39e6ff`, violet `#c46bff`, jungle green `#7CFFb2`,
  hostile red/orange `#ff5d3c`.

## Animation frames (when ready)

Phase 1 uses single-pose placeholders. To add frame animation later, extend the manifest
value to an object and teach `sprites.js` to slice a sheet:

```jsonc
"player.run": { "src": "characters/operative_run.png", "frames": 8, "fps": 14, "w": 64, "h": 64 }
```

This is a planned extension point — the loader already centralizes all image access, so only
`sprites.js` changes, not the entities.

## Production swap checklist

- [ ] Generate/produce asset to the spec above (original IP only — no copyrighted material).
- [ ] Export to the correct `assets/` subfolder with a descriptive name.
- [ ] Add/point the logical key in `manifest.json`.
- [ ] Verify in-game; confirm scale/anchor matches the placeholder footprint.
- [ ] Commit the asset + manifest change together.

See **`AI_INTEGRATION.md`** for wiring image/sound generators (Higgs Field AI, image models,
Suno/ElevenLabs/Stable Audio) into this pipeline.
