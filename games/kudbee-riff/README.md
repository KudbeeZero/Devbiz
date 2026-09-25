# Kudbee Riff — Neon Fret Rush

> **Kudbee Games Studio** — four-lane rhythm game synced to an **original Kudbee track**
> (`assets/analysis.json`). Zero install, canvas + Web Audio.

Notes fall to the beat; hit them in the **D F J K** lanes, build **heat**, and ignite
**Overdrive** for score multipliers. Chord **slams**, accuracy tiers, and career stats persist
in `localStorage`.

## Play

- **Hosted:** `/games/kudbee-riff/index.html`
- **Locally:** `python3 -m http.server 8000` →
  <http://localhost:8000/games/kudbee-riff/index.html>

## Controls

| Action | Keyboard | Touch |
|--------|----------|-------|
| Lanes | `D` `F` `J` `K` | Tap lane columns |
| Overdrive | `Space` (when heat full) | Tap heat bar |
| Pause | `P` | Pause control in HUD |

Requires `./assets/analysis.json` (beat chart). Honors `prefers-reduced-motion` where supported.

## Leaderboard

**kd-leaderboard** SDK (`GAME: 'riff'`). Metrics: `score`, `bestCombo`, `accuracy`.
Use **Post my score** on the results screen; posts queue if clicked before SDK boot (DBZ-072).
Live cloud needs Worker + `API_BASE` — see `leaderboard/README.md`.

## Related

**Kudbee Riff II** ([`../kudbee-riff-2/`](../kudbee-riff-2/)) — same engine, different original track/chart.
