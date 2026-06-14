# Kudbee Games Studio

The games division of the studio. Original browser games built to run directly on the same
**zero-build static (Cloudflare Pages)** stack as the main site — no bundler, no dependencies.

## Titles

| # | Title             | Status            | Genre                         | Folder |
|---|-------------------|-------------------|-------------------------------|--------|
| 1 | **Kudbee Contra** | 🎮 Playable (P1)  | 2.5D side-scrolling run-and-gun | [`kudbee-contra/`](./kudbee-contra/) |
| 2 | *Untitled*        | 🧪 Concept        | TBA                           | —      |

## Conventions for new games

Each game is self-contained under `games/<slug>/`:

```
games/<slug>/
  index.html      standalone playable shell (canvas + UI + ordered <script> includes)
  src/            engine + game modules (classic scripts on a window.KC-style namespace)
  assets/         drop-in production/AI assets + manifest.json (procedural fallback)
  docs/           design + asset pipeline + AI-integration docs
  README.md       controls, architecture, run/deploy
```

Principles:
- **No build step.** Classic `<script>` files load in order; everything attaches to one
  global namespace. Deploys as-is via the root `wrangler.toml` (`assets = { directory = "./" }`).
- **Original IP only.** No copyrighted assets.
- **Asset swap pipeline.** Ship procedural placeholders; swap real/AI art via `manifest.json`
  with zero code changes (see each game's `docs/ASSET_PIPELINE.md`).
- **60 FPS target**, responsive canvas, keyboard + gamepad + touch.

## Featured on the site

Games are showcased on the main website under **Games** (`index.html` → `#page-games`):
hero banner, featured card, screenshot gallery, dev logs, Play Demo, roadmap, and coming-soon.
