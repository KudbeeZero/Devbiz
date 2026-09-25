# Kudbee Games Studio

Original browser games on the same **zero-build static (Cloudflare Pages)** stack as the main site —
no bundler required for play; deploy via root `wrangler.toml`.

## Titles (canvas arcade)

| Title | Folder | README |
|-------|--------|--------|
| Kudbee Contra | [`kudbee-contra/`](./kudbee-contra/) | [yes](./kudbee-contra/README.md) |
| Kudbee Darts | [`kudbee-darts/`](./kudbee-darts/) | [yes](./kudbee-darts/README.md) |
| Kudbee Riff | [`kudbee-riff/`](./kudbee-riff/) | [yes](./kudbee-riff/README.md) |
| Kudbee Riff II | [`kudbee-riff-2/`](./kudbee-riff-2/) | [yes](./kudbee-riff-2/README.md) |
| Kudbee Pinball — Starbreak | [`kudbee-pinball/`](./kudbee-pinball/) | [yes](./kudbee-pinball/README.md) · [eval](./kudbee-pinball/eval/README.md) |
| Kudbee Voidrunner | [`kudbee-voidrunner/`](./kudbee-voidrunner/) | [yes](./kudbee-voidrunner/README.md) |
| Kudbee Munch — Windy City | [`kudbee-munch/`](./kudbee-munch/) | [yes](./kudbee-munch/README.md) |
| Kudbee Orbital | [`kudbee-orbital/`](./kudbee-orbital/) | [yes](./kudbee-orbital/README.md) |
| Kudbee Puzzles — Circuit | [`kudbee-puzzles/`](./kudbee-puzzles/) | [yes](./kudbee-puzzles/README.md) |

Other playable experiments (cornhole, cricket, abyss, etc.) may appear on the marketing site;
this table is the core **Games Studio** set from `docs/GAMES_STUDIO_ROADMAP.md`.

## Local preview

```bash
python3 -m http.server 8000
# → http://localhost:8000/games/<slug>/index.html
```

## Verification

From repo root (no CI configured):

```bash
npm run verify                # pinball Playwright rubric (21/21) + leaderboard unit tests
npm run pinball:eval          # pinball only
```

Pinball gameplay changes should keep **21/21** on `games/kudbee-pinball/eval/evaluator.mjs`.

## Online leaderboards

All nine titles above are **SDK-wired** (`leaderboard/client/kd-leaderboard.js` + `KD_LB_CONFIG`).
Demo mode works on static hosts; live post/load needs the Worker deployed and `API_BASE` set
(owner-gated — see `leaderboard/README.md`).

## Conventions for new games

Each game is self-contained under `games/<slug>/`:

```
games/<slug>/
  index.html      standalone playable shell (canvas + UI)
  src/            optional modules (classic scripts on a global namespace)
  assets/         art + manifest.json (procedural fallback)
  docs/           design + asset pipeline (when needed)
  README.md       controls, run/deploy, leaderboard notes
```

Principles:

- **No build step** for play — classic `<script>` order or single-file canvas games deploy as-is.
- **Original IP only.**
- **60 FPS target**, responsive canvas, keyboard + touch; honor `prefers-reduced-motion`.
- Shared engine helpers live under [`shared/engine/`](./shared/engine/) where titles opt in.

## Featured on the site

Games are showcased on the main site under **Games** (`index.html` → `#page-games`).
