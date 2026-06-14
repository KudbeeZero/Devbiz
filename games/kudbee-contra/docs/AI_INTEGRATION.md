# AI Integration Guide — Kudbee Contra

This is a **forward-looking integration spec**. As of Phase 1 the repository has **no AI
provider wired up and no API keys** — all art and audio are generated procedurally in code
(see `ASSET_PIPELINE.md`). This document describes exactly how to plug generators in when
keys/budget are available, so the work is a configuration task rather than a redesign.

> Status legend: 🟢 ready hook · 🟡 needs key/endpoint · ⚪ future

## Where AI plugs in

The game never calls a generator at runtime. Generators are **build-time / authoring tools**
that produce files which land in `assets/` and get referenced from `manifest.json`. This keeps
the shipped game fast, offline-capable, and dependency-free.

```
[ Higgs Field AI ]  design + planning  ─┐
[ image models   ]  art   ──────────────┼─►  assets/<...>  ──►  manifest.json  ──►  game
[ audio models   ]  sound ──────────────┘        (files)          (mapping)        (loads)
```

## 1. Higgs Field AI — design & procedural planning 🟡

Use for game-architecture planning, procedural level layouts, enemy archetypes/behavior
trees, encounter pacing, and difficulty scaling. Its **output is data**, not binaries:

- Generate level layouts in the shape of `world/level1.js` (`platforms`, `spawns`, `pickups`,
  `bossArena`). A new level is a new data file — no engine changes.
- Generate enemy behavior specs that map to the state enums in `entities/enemies.js`
  (`patrol`/`chase`/`attack`/`cover`), or richer behavior trees for a future AI runtime.
- Generate encounter/difficulty curves consumed by the spawn director in `game.js`.

**Suggested workflow:** a small Node script under a future `tools/` dir calls the Higgs Field
API, validates the JSON against the level/enemy schema, and writes `world/levelN.js`.

## 2. Image generation — concept & production art 🟡

Any text-to-image provider works (OpenAI Images, Stability/SDXL, Leonardo, Flux, local SDXL,
Midjourney export). Targets and specs are in `ASSET_PIPELINE.md`.

Prompt guidance to match the studio look:
- **Palette:** neon cyan `#39e6ff`, violet `#c46bff`, jungle green `#7CFFb2`, hostile
  red/orange `#ff5d3c`, deep space-navy backgrounds.
- **Style:** original cyberpunk / alien-jungle / space-military; cinematic rim-lighting; fog
  and volumetric god-rays; **side-on** orthographic framing for entities; seamless horizontal
  tiling for parallax layers.
- **Strictly original IP — never reference or reproduce copyrighted run-and-gun assets.**

Pipeline: generate → remove background / crop to spec → export PNG to `assets/<folder>` →
update `manifest.json`. Background removal/cropping can be done with the connected Adobe
Express MCP image tools if available, or any editor.

## 3. Sound & music generation ⚪

- **Music** (Suno / Stable Audio): menu theme, level loop, boss theme. Export to
  `assets/audio/` and add a future `audio.*` manifest section; `engine/audio.js` would switch
  from synthesized fallback to streamed tracks when present (mirrors the sprite fallback).
- **Voice** (ElevenLabs): operative barks, boss taunts, announcer. Same drop-in pattern.
- **SFX**: weapon fire, explosions, hits — currently synthesized; can be replaced with sample
  files keyed by name.

## Configuration (when wiring real providers)

Keys must **never** be committed. For static Cloudflare Pages, generation runs in an
**authoring environment** (local or CI), not in the browser. Recommended:

```
# .env (local/CI only — gitignored; create when keys exist)
HIGGSFIELD_API_KEY=...
IMAGE_API_KEY=...
AUDIO_API_KEY=...
```

A future `tools/generate.mjs` reads these, calls the providers, writes into `assets/`, and
updates `manifest.json`. Because the runtime only ever reads local files, no secret is exposed
to players and the deployed site stays a pure static bundle.

## Why runtime generation is intentionally avoided

- Keeps 60 FPS and offline play (no network in the hot path).
- No keys shipped to the client.
- Deterministic, reviewable assets in version control.
- The manifest fallback guarantees the game is always fully playable, even with zero AI assets.
