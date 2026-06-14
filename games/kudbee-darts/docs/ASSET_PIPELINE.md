# Asset Pipeline — Kudbee Darts

Same manifest-driven contract as Kudbee Contra. The runtime never calls a generator;
generated art is dropped into `assets/` and referenced from `manifest.json`. This keeps the
shipped game fast, offline-capable, and dependency-free.

## How it works

`assets/manifest.json` maps logical keys to image paths:

```json
{
  "version": 1,
  "assets": {
    "bg.stage": "",
    "bg.preview": "",
    "ui.logo": ""
  }
}
```

- **Non-empty path** → the image loads (`src/art/sprites.js`) and is used.
- **Empty / missing / failed** → the procedural placeholder draws instead.

So to add a generated background: drop the file in `assets/backgrounds/`, point `bg.stage`
at it, and it renders with **zero code changes** (the game blits `bg.stage` behind the board
when present, else `sprites.drawBackdrop` paints the procedural neon stage).

## What is — and isn't — image-swappable

| Asset            | Source                | Why |
|------------------|-----------------------|-----|
| `bg.stage`       | **Firefly / image**   | Mood backdrop behind the board. |
| `bg.preview`     | **Firefly / image**   | Homepage banner art. |
| `ui.logo`        | **Firefly / image**   | Optional branding. |
| **Dartboard**    | **Always procedural** | Hit detection must be pixel-exact (`world/board.js`). |
| **Darts**        | **Always procedural** | Skin-tinted; drawn in `art/sprites.js`. |

The board and darts stay vector/procedural on purpose — a raster board could never be made
pixel-accurate against the polar hit-test.

## Generating background art (Adobe Firefly / Express MCP)

Prompt to the studio neon palette: cyan `#39e6ff`, violet `#c46bff`, jade `#7CFFb2`, hostile
`#ff5d3c`, deep space-navy. Suggested `bg.stage` prompt:

> *A moody neon cyber dart-lounge: a dark space-navy room, a soft cyan spotlight cone from
> above, violet rim-lighting, subtle volumetric haze and bokeh; clean negative space in the
> upper-centre where a dartboard will sit; 16:9, cinematic, no text, no dartboard.*

Pipeline: generate → (optional) crop/clean with Adobe image tools → save to
`assets/backgrounds/stage.jpg` → set `"bg.stage": "backgrounds/stage.jpg"` in the manifest.

> Note: in some sandboxes the Adobe MCP requires interactive approval on first use, and the
> Higgsfield CLI is not installed. The game is **fully playable with all keys empty** — the
> procedural stage and board always render — so generated art is a pure enhancement.

## Audio

100% code-synthesized via Web Audio (`engine/audio.js`): throw whoosh, board thud, scoring
chimes, bust buzzer, crowd cheer, plus an ambient music bed. Sample files could later be
keyed in the same way if desired.
