# Kudbee Pinball — Starbreak

> **Kudbee Games Studio** — neon space pinball on a single HTML5 canvas. Zero install;
> procedural table art and Web Audio.

Clear drop targets, spell **K·U·D**, rip loop ramps, build **combos** and **multiplier**, chase
modes and multiball. Ball save on fresh serves; one **kickback** per outlane.

## Play

- **Hosted:** `/games/kudbee-pinball/index.html`
- **Locally:** `python3 -m http.server 8000` →
  <http://localhost:8000/games/kudbee-pinball/index.html>

Use **http(s)** for online leaderboard SDK calls; `file://` shows an offline hint by design.

## Controls

| Action | Keyboard | Touch |
|--------|----------|-------|
| Flippers | `Z` / `.` or `←` / `→` | Tap lower left / right |
| Launch | Hold `Space` to charge, release | Hold right side (plunger lane), release |
| Nudge | `Space` / `↓` / `X` / `C` (tilt if abused) | Tap upper playfield |
| Sound | `M` | Mute in HUD |

Honors `prefers-reduced-motion` where animations allow.

## Leaderboard

**kd-leaderboard** SDK (`GAME: 'pinball'`). Metrics: `score`, `bestMultiball`, `modesCompleted`.
Game-over overlay loads top-10 and **Post your score**; posts queue while SDK boots.
Live cloud needs Worker + `API_BASE` — see `leaderboard/README.md`.

## Verification (developers)

Automated playability rubric (**23 checks**, Playwright + Chromium):

```bash
npm run pinball:eval    # from repo root
```

Details: [`eval/README.md`](./eval/README.md). Headless hooks: `window.PINBALL`, `window.__kbTest`.
