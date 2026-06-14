# Kudbee

A creative dev studio site — **web design, live AI agent training, and original game
development** — built as a zero-build static site and deployed on Cloudflare Pages.

## Structure

```
Index.html              Single-file marketing site (CSS-only routing, no build step)
wrangler.toml           Cloudflare Pages config (serves the repo root as static assets)
games/                  Kudbee Games Studio
  kudbee-contra/        Flagship title — a playable 2.5D run-and-gun (HTML5 Canvas)
```

## Run locally

It's all static — any file server works:

```bash
python3 -m http.server 8000
# Site:  http://localhost:8000/Index.html
# Game:  http://localhost:8000/games/kudbee-contra/index.html
```

## Highlights

- **Modern single-file site** — gradient-mesh design, glassmorphism nav, dark/light theme,
  scroll reveals, and live canvas-rendered art. No bundler, no dependencies.
- **Games showcase** (`Index.html → Games`) — hero, live playable embed, screenshot gallery,
  dev logs, roadmap, and coming-soon.
- **Kudbee Contra** — original arcade run-and-gun running at 60 FPS in the browser with
  keyboard / gamepad / touch support. See [`games/kudbee-contra/README.md`](games/kudbee-contra/README.md).

All art and audio are **original** (procedurally generated placeholders with a documented
swap-in pipeline for production / AI-generated assets). No copyrighted material.
