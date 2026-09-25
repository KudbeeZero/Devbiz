# Kudbee

A creative dev studio site — **web design, live AI agent training, and original game
development** — built as a zero-build static site and deployed on Cloudflare Pages.

## Structure

```
index.html              Single-file marketing site (CSS-only routing, no build step)
wrangler.toml           Cloudflare Pages config (serves the repo root as static assets)
games/                  Kudbee Games Studio — nine canvas titles (see games/README.md)
leaderboard/            Online scores SDK + Worker + D1 (demo mode on static host)
tools/                  Kudbee developer utilities (standalone HTML, no build step)
  token-analyzer/       Token Price Analyzer — track AI model costs across sessions
  coverage-dashboard/   Coverage Breakdown — read-only view of the scoped coverage
                        gate (leaderboard/shared/ only; NOT whole-repo coverage)
```

## Leaderboard tests & coverage

**Local gate (no CI configured):** `npm run test:leaderboard` runs `node --test` under
`leaderboard/`. Pinball playability: `npm run pinball:eval` (**24/24** rubric).

Optional **scoped coverage** for `leaderboard/shared/` only (not whole-repo): thresholds in
`leaderboard/.c8rc.json`; read-only [`tools/coverage-dashboard/`](tools/coverage-dashboard/)
and [`leaderboard/README.md`](leaderboard/README.md#coverage-gate-scoped-to-shared).

## Run locally

It's all static — any file server works:

```bash
python3 -m http.server 8000
# Site:  http://localhost:8000/index.html
# Game:  http://localhost:8000/games/kudbee-contra/index.html
```

Local verification (no CI configured):

```bash
npm run verify                # pinball eval (24/24) + leaderboard unit tests
npm run pinball:eval          # Playwright rubric only
npm run test:leaderboard      # node --test under leaderboard/
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

## Project docs

Active lanes, merge status, and owner gates: [`docs/BUILD_LEDGER.md`](docs/BUILD_LEDGER.md).
Roadmap and backlog: [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md), [`docs/BACKLOG.md`](docs/BACKLOG.md).
Agent workflow: [`AGENTS.md`](AGENTS.md), [`CLAUDE.md`](CLAUDE.md).
