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

**Table feel:** like a real table, a dead ball can drain **between the flippers** (the
resting tips leave a ball-width gap) — hold a flipper up to **cradle** the ball and line up
a shot. The ball rolls freely along walls and flippers; an auto-free only kicks in after a
full second of a genuinely wedged ball, never while you're holding a flipper.

## Leaderboard

**kd-leaderboard** SDK (`GAME: 'pinball'`). Metrics: `score`, `bestMultiball`, `modesCompleted`.
Game-over overlay loads top-10 and **Post your score**; posts queue while SDK boots.
Live cloud needs Worker + `API_BASE` — see `leaderboard/README.md`.

## Verification (developers)

Automated playability rubric (**21 checks**, Playwright + Chromium):

```bash
npm run pinball:eval    # from repo root
```

Details: [`eval/README.md`](./eval/README.md). Headless hooks: `window.PINBALL`, `window.__kbTest`
(incl. `__kbTest.simulate()` for stuck-ball scans). Physics invariants — swept-TOI, Coulomb
friction, capsule normals, ≥30px clearances — are in [`AGENTS.md`](../../AGENTS.md#pinball-physics-rules-gameskudbee-pinballindexhtml);
read them before touching collision code or lower-table geometry.
