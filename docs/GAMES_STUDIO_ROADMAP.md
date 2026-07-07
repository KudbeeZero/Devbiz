# Kudbee Games Studio — Buildout Roadmap

> **Origin:** owner asked (2026-07-07, from mobile) for a plan/roadmap across the other 8
> games while a dedicated pass ran on `kudbee-pinball`. This doc is that survey + plan.
> Based on a live code survey of all 9 games — see "Survey findings" for exactly what
> was checked and how.

## Where things actually stand today

All 9 games (`contra`, `darts`, `munch`, `orbital`, `pinball`, `puzzles`, `riff`, `riff-2`,
`voidrunner`) have already been through one dedicated "game-polish" pass each (merged
branches: `claude/game-polish-<name>` plus game-specific follow-ups — darts got a swipe/throw
overhaul, riff got auto-overdrive/streak-bonus passes, voidrunner got boss/enemy passes,
pinball got several table-feel passes). **Code hygiene across all 8 non-pinball games is
clean** — no TODO/FIXME, no stray `console.log`/`debugger`, no dead-end stubs. Every game
already handles `prefers-reduced-motion` and has touch input (7 of 8 with explicit
touch/pointer handlers; puzzles relies on generic `click`, lower risk given its tap-to-rotate
mechanic but worth a manual mobile check). **This is not a "finish unfinished games" roadmap
— it's a "what's the next tier of ambition" roadmap.**

The one real functional gap, cutting across every game: **online leaderboard integration is
inconsistent.**

| Game | Leaderboard status |
|---|---|
| `riff`, `riff-2` | Fully SDK-wired (`KD_LB_CONFIG` + `client/kd-leaderboard.js`), posts + loads top-10. **Not live** — `API_BASE` is empty, so scores post nowhere yet. Needs the Worker deployed (see `leaderboard/README.md` → *Deploy to Cloudflare*). |
| `darts` | Backend is darts-shaped and half-built (`leaderboard/shared/core.js` already defines `GAMES.darts`; the leaderboard portal page defaults to darts). But the game itself has **no SDK call** — syncing today means the player manually visits `leaderboard/public/leaderboard.html`, which reads darts' local profile out of band and requires a manual "Publish your stats" click. Darts' own in-game "🏆 Leaderboard" is a cosmetic local AI-ladder screen, not the online service — worth noting since the README text reads ambiguously on this point. |
| `voidrunner` | Has its own polished **local** top-10 + 3-initial arcade entry screen already built (`kudbee.voidrunner.scores`/`initials`). This is the easiest of the remaining games to wire — the "you got a good score, enter your name" UX already exists; it just needs the SDK call swapped in underneath instead of `localStorage`. |
| `contra`, `munch`, `orbital`, `puzzles` | No online leaderboard artifact of any kind — local best/progress only. `contra`'s own `docs/GAME_DESIGN.md` roadmap already names "save/leaderboard" as a named Phase 3 item, so wiring it there has an existing design hook. |

## Proposed phases

Sequenced by leverage (cheapest, highest-value first), not by game importance. Each phase
is small enough to be one branch/PR, matching the repo's phase-order + one-PR-one-purpose
rules.

### Phase A — Turn the lights on (unblocks everything below)
Deploy the leaderboard Worker + D1 (`leaderboard/worker/`, `npx wrangler d1 create` +
`wrangler deploy`), point `riff`/`riff-2`'s `API_BASE` at it. This is a **production
deployment** — an owner-only decision per `CLAUDE.md` §11, needs explicit authorization
before it happens, not something to do silently as part of a "polish" pass. Zero code
risk (the SDK is already wired and tested); the risk is entirely "this makes prod state
change," which is exactly the kind of thing to flag rather than just do.

### Phase B — Wire the two "almost there" games
1. **`voidrunner`**: swap its existing local top-10/initials UX to post through
   `client/kd-leaderboard.js` (`GAME: 'voidrunner'`) instead of `localStorage`, keeping the
   same on-screen initials-entry moment. Lowest-effort win — the UX doesn't need to be
   designed, just re-plumbed.
2. **`darts`**: add the SDK call directly into `games/kudbee-darts/index.html` (matching the
   `GAMES.darts` metric shape that already exists server-side: rating, bestCheckout,
   total180s, wins, bestStreak) so a match auto-posts instead of requiring a manual visit to
   the separate leaderboard portal page. Refresh the README's "Leaderboard" section at the
   same time so it stops reading as if the local AI-ladder *is* the online leaderboard.

### Phase C — Wire the four with no online leaderboard yet
`contra`, `munch`, `orbital`, `puzzles` — each needs a `GAMES.<name>` entry added to
`leaderboard/shared/core.js` (metric shape per game, e.g. contra: score/wave/kills; munch:
score/level; orbital: score/wave-survived; puzzles: boards-solved/best-time), a schema
column set in `worker/schema.sql`, and the same `KD_LB_CONFIG` + SDK script wiring riff
already demonstrates. Do these as one PR each (or grouped if truly trivial) — don't bundle
four unrelated games into one lane.

### Phase D — Per-game next-tier ambition (independent of leaderboard work)
Pulled from what the survey actually found, not invented:
- **`contra`**: its own `docs/GAME_DESIGN.md` already specs Phase 2 (levels 2–3, new
  weapons, elite enemies, production art/music) and Phase 3 (levels 4–5, full bosses,
  behavior-tree AI, save/leaderboard, polish). This is the one game with a real backlog
  already written down — follow it rather than re-planning from scratch.
- **`puzzles`**: no dedicated pointer/touch handlers (relies on generic `click`); low risk
  given the tap-to-rotate mechanic, but do a real mobile-device pass to confirm feel. Its
  own level generator already supports going past 30 boards trivially if more content is
  wanted.
- **`voidrunner`**: has zero README/docs (the only game with none) — worth a short one once
  its leaderboard wiring (Phase B) lands, so it reaches parity with the others.
- **`riff`/`riff-2`**: ~98% duplicated engine code across two files (no shared module). Any
  future engine-level polish has to be applied twice by hand today — worth a "diff and
  extract only what's genuinely shared" pass (per the repo's own reflex: diff before
  extracting), but only if a third track is ever planned; not worth doing pre-emptively for
  two.

## What this roadmap deliberately does NOT include
- A redesign or engine rewrite of any game — every game already reads as feature-complete
  for its current scope; this is additive, not corrective.
- Actually deploying the Worker (Phase A) — that's an owner decision, flagged not executed.
- Mainnet/production changes of any kind.

## Survey findings (raw, for reference)

Per-game detail — genre, size, exact leaderboard-wiring mechanics, and rough-edge scan —
is preserved from the live code survey below, in case anything above needs re-checking
against source.

### kudbee-contra
2.5D run-and-gun, "Phase 1 vertical slice" per its own docs. Multi-file (`src/{engine,
entities,art,world}/` + `game.js`, 16 files, ~3,340 src lines). Has `docs/GAME_DESIGN.md`,
`ASSET_PIPELINE.md`, `AI_INTEGRATION.md`. No leaderboard wiring; local best only. Clean
(no TODO/console.log/debugger); `prefers-reduced-motion` handled in `game.js`; touch via
on-screen D-pad + `src/engine/input.js`.

### kudbee-darts
Predictive flick-throw darts (501 + Cricket, vs AI/2P). Multi-file (`src/{engine,entities,
modes,world}/` + `progression.js` + `game.js`, 13 files, ~3,559 src lines). Has `docs/`
(GAME_DESIGN, BOARD_MATH, ASSET_PIPELINE). In-game "leaderboard" is a local AI-ladder
screen only (`_leaderboardData`/`_drawLeaderboard` in `src/game.js`, rating formula pulled
from `progression.js`'s `localStorage` profile `kd.profile.v1`) — no network calls. The
real online bridge is `leaderboard/public/leaderboard.html` reading darts' same-origin
`localStorage` and requiring a manual "Publish your stats" click; `leaderboard/shared/
core.js` already defines `GAMES.darts`. `docs/GAME_DESIGN.md` explicitly defers "real-time
online PvP and shared leaderboards" to a "v2," though the backend schema now partially
exists, making the doc slightly out of date. Clean (no TODO/console.log/debugger);
`prefers-reduced-motion` in 3 files; touch/swipe is a first-class mechanic.

### kudbee-munch
Maze-chase (Pac-Man-style), "Beezer the bee-bot" vs. 4 drones. Single-file, 1,342 lines.
Has README, no `docs/`. No leaderboard wiring; local best only. Clean; `prefers-reduced-
motion` via CSS + JS; touch via swipe + on-screen D-pad.

### kudbee-orbital
Zero-gravity twin-stick shooter (Newtonian drift, splitting asteroids). Single-file, 1,064
lines. Has README, no `docs/`. No leaderboard wiring; local best only. Clean; `prefers-
reduced-motion` handled (disables shake/glow, trims particles); dual virtual sticks +
gamepad support; has a documented `window.__test` smoke-test hook.

### kudbee-puzzles
Pipe-rotation circuit puzzle, 30 boards (4×4→8×8). Single-file, 726 lines — smallest of
the 8. Has README, no `docs/`. No leaderboard wiring; local progress only. One
`console.log` at line 703, intentionally gated behind a `#gen` dev-flag hash (documented in
README, not a stray leftover). No dedicated touch/pointer handlers — relies on `click`/
`mousemove`/`keydown` (works for tap-to-rotate; `touch-action:manipulation` prevents
double-tap zoom, but is the one game without explicit touch events). `prefers-reduced-
motion` handled. README notes the level generator can trivially produce more boards later.

### kudbee-riff
Guitar-Hero-style rhythm game, original track. Single-file, 1,433 lines + `assets/
analysis.json` + `assets/song.mp3`. No README (docs live as a header comment in
`index.html`). **Fully SDK-wired**: `KD_LB_CONFIG = { API_BASE: '', ..., GAME: 'riff' }` +
`<script src="../../leaderboard/client/kd-leaderboard.js">`, posts + loads top-10 on the
results screen. `API_BASE` empty → posts fail quietly until a Worker is deployed. Clean;
`prefers-reduced-motion` + `pointer:coarse` both checked; pointer-event touch handling.

### kudbee-riff-2
Second track, same engine. Single-file, 1,436 lines, own `assets/analysis.json` +
`assets/song.mp3`. ~98% code-identical to `riff` (diff shows ~33 lines differ — title/meta
text, track length, one localStorage-key comment). Same SDK wiring pattern (`GAME:
'riff2'`), same un-deployed state, same clean/touch/reduced-motion profile as riff.

### kudbee-voidrunner
Vertical-scrolling space shooter/endless-runner. Single-file, 1,351 lines + `assets/
intro.mp3`. **No README/docs at all** — the only game with zero external documentation
(branch history shows dedicated `claude/voidrunner-boss` / `claude/voidrunner-enemies`
passes already merged). No online leaderboard, but has its own polished **local** top-10 +
3-initial arcade name-entry screen (`kudbee.voidrunner.scores`/`initials`) — the natural
next step is swapping the storage layer under that existing UX for the SDK. Clean;
`prefers-reduced-motion` handled; pointer-event touch (drag to steer, tap to fire).

## Cross-cutting facts (apply to all 8 surveyed games)
- No TODO/FIXME, no stray `console.log`/`debugger`/`alert()` anywhere in the 8.
- All 8 implement `prefers-reduced-motion` — not a gap anywhere.
- 7 of 8 have explicit touch/pointer handling; puzzles is the one relying on generic clicks.
- Size tiers: contra + darts are the "big" multi-file engines (~3,300–3,700 lines, 13–16
  files each, plus real `docs/`); the other 6 are single-file, 726–1,436 lines.
- Documentation gaps: voidrunner has none at all; riff/riff-2 have no README (comment-only).
  Contra and darts have the most complete docs.
