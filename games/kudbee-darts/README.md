# Kudbee Darts 🎯

> **Kudbee Games Studio — Game #2**
> Predictive flick-throw darts in your browser. Original IP, zero install, 60 FPS.

Play **501** and **Cricket** against a friend (pass-and-play) or a league of smart AI
rivals. **Drag to aim, then swipe-release to throw** — a true flick whose speed sets the
power and curl (a tap won't throw). Watch the score land on a **digital seven-segment
scoreboard** that pops and sheds bricks, follow the **on-board checkout guide** that lights
up exactly what to hit on a finish, climb the **league ladder**, earn **XP**, and unlock
**neon dart skins**.

## Play

- **Hosted:** `/(site)/games/kudbee-darts/index.html`
- **Locally:** from the repo root run `python3 -m http.server 8000`, then open
  <http://localhost:8000/games/kudbee-darts/index.html>

## Controls

| Action            | Mouse / Touch                              | Keyboard |
|-------------------|--------------------------------------------|----------|
| Aim               | Press on the board and drag the reticle    | —        |
| Throw             | **Swipe-release** (flick) — a tap won't throw | —     |
| Menu select       | Tap a button                               | Enter    |
| Pause             | `P` (tap upper area resume / lower quit)   | `P`      |
| Mute              | `M`                                        | `M`      |
| Debug FPS         | `` ` ``                                    | `` ` ``  |

**The flick is the throw.** Drag to line up the reticle, then swipe and let go: the
release **speed** sets the power (too soft drops low and short; too hard sails high and
out), the sideways flick adds **curl**, and harder **pressure** (pen / 3D-touch) sinks the
dart with extra weight. A live **power gauge** beside the reticle shows the committed-flick
sweet spot. Where the dart lands (plus a little scatter) is what scores, so the read is
honest. A wild, rushed flick scatters more than a smooth, committed one.

## Modes

- **501** — race from 501 to exactly zero. You must **finish on a double** (the bull
  counts as D25). Bust (going below 0, landing on 1, or hitting 0 without a double) reverts
  the whole turn. A live **checkout hint** plus an **on-board guide** light up your
  finishing route — the next dart brightest — doubling as a built-in training aid.
- **Cricket** — close `20·19·18·17·16·15` and the **bull** by hitting each three times
  (single = 1 mark, double = 2, treble = 3). Once you've closed a number, extra hits
  **score** its value — until your opponent closes it too. Win by closing everything with
  points ≥ your opponent.

## Opponents & League

- **2P Hotseat** — pass-and-play on one device.
- **AI tiers** — Rookie / Pro / Legend. Difficulty is modelled honestly: every dart (yours
  and theirs) scores through the *same* board hit-test; the AI just has a wider/narrower
  Gaussian aim **scatter** and more/less ambitious target choice per tier.
- **Career ladder** — climb a ranked list of named rivals; beat one to unlock the next plus
  a dart skin. Progress, XP, levels, win streaks, stats and skins persist in `localStorage`.

## Dart Workshop

Open **🎯 Dart Workshop** from the menu to craft your dart from three independent parts,
with a big live preview:

- **Barrel** — the 5 neon skins (unlocked by leveling up / climbing the ladder).
- **Tip** — Steel · Needle · Neon Spike · Plasma · Gold Point.
- **Flight** — Standard · Slim · Kite · Shark · Star · Ghost.

Tips and flights are bought once with **coins** earned from matches, then equipped freely.
Everything in the Workshop is **purely cosmetic** — every dart flies through the exact same
physics, so the game stays fair.

## Leaderboard

**🏆 Leaderboard** shows the **Bullseye League** standings — you ranked against the AI
ladder by a rating derived from your level, ladder progress and streaks — alongside a
career card (501/Cricket records, 180s, best checkout, streaks, coins).

## Architecture

Pure HTML5 Canvas 2D + vanilla JS, **no build step**, classic ordered `<script>` tags
attaching to the global `window.KD` namespace — the same engine pattern as Kudbee Contra.

```
src/
  engine/   util · loop (fixed 60Hz) · input (pointer drag) · camera · audio · particles
  art/      sprites (procedural darts + manifest swap-in)
  world/    board (dartboard geometry, exact polar hit-test, baked neon render)
  entities/ dart (swipe-flick throw physics + curl) · players (human + AI strategy)
  modes/    x01 (501 + checkout solver) · cricket
  progression.js (XP / ladder / skins / stats, localStorage)
  game.js   (state machine, turn director, HUD, juice)
assets/     manifest.json (+ Firefly background swap-in; the board stays procedural)
docs/       GAME_DESIGN · BOARD_MATH · ASSET_PIPELINE
```

See `docs/BOARD_MATH.md` for the dartboard geometry and hit-test derivation, and
`docs/ASSET_PIPELINE.md` for how generated art swaps in.

## Tech

Original code-synthesized Web Audio SFX, pooled particles, trauma-based screen shake,
slow-mo on big hits, confetti on wins. The throw has Darts-of-Fury feel: the board **lunges**
in and snaps back on release, the dart **lofts and barrel-rolls** in flight, and the scoring
**explosion scales with the score** (radial spray + shockwave rings, gold on big hits). The
**exact segment you hit lights up** on the board, a quick **flick read-out** (PERFECT / TOO
SOFT / TOO HARD) coaches the swipe, and supported phones get a **haptic thump**. Darts stick
with their **tip exactly on the scoring pixel**. No external assets required — the dartboard
and darts are drawn procedurally so hit detection is pixel-exact. All original IP.
