# Kudbee

A creative dev studio site — **web design, live AI agent training, and original game
development** — built as a zero-build static site and deployed on Cloudflare Pages.

## Structure

```
index.html              Single-file marketing site (CSS-only routing, no build step)
wrangler.toml           Cloudflare Pages config (serves the repo root as static assets)
games/                  Kudbee Games Studio
  kudbee-contra/        Flagship title — a playable 2.5D run-and-gun (HTML5 Canvas)
  kudbee-darts/         Predictive flick-throw darts game (501 + Cricket, AI leagues)
tools/                  Kudbee developer utilities (standalone HTML, no build step)
  token-analyzer/       Token Price Analyzer — track AI model costs across sessions
```

## Run locally

It's all static — any file server works:

```bash
python3 -m http.server 8000
# Site:  http://localhost:8000/index.html
# Game:  http://localhost:8000/games/kudbee-contra/index.html
```

## Highlights

- **Modern single-file site** — gradient-mesh design, glassmorphism nav, dark/light theme,
  scroll reveals, and live canvas-rendered art. No bundler, no dependencies.
- **Games showcase** (`index.html → Games`) — hero, live playable embed, screenshot gallery,
  dev logs, roadmap, and coming-soon.
- **Kudbee Contra** — original arcade run-and-gun running at 60 FPS in the browser with
  keyboard / gamepad / touch support. See [`games/kudbee-contra/README.md`](games/kudbee-contra/README.md).

All art and audio are **original** (procedurally generated placeholders with a documented
swap-in pipeline for production / AI-generated assets). No copyrighted material.

## Baton

### ✅ Completed units

| Unit | PR | Status |
|---|---|---|
| Kudbee Contra — vertical slice | #1 | Merged |
| Mobile touch controls + auto-fire | #2 | Merged |
| Kudbee Darts — full game | #3 | Merged |
| Token Price Analyzer tool | #4 | **Open → audit+polish complete, ready to merge** |

### 🔲 Backlog (not blocking PR #4)

- **Nav mobile overflow** — 6 nav items may wrap on mid-size screens; consider a scrollable pill row or hiding "Tools" behind a "More" dropdown at ≤768 px
- **Pricing table staleness** — no automated update when model prices change; a comment in the JS marks the cache date (`2026-06-04`)
- **Session editing** — currently sessions are append-only; an edit-in-place flow would be useful
- **Daily cost sparkline** — a timeline chart showing cost per day would complement the existing model breakdown bar chart
- **Bookmarklet / CLI snippet** — a one-liner to pre-fill the log form from terminal output (e.g. Cursor usage stats)

### ⛔ Working agreement

One PR open at a time. Do not start the next implementation unit until PR #4 is audited and merged.
