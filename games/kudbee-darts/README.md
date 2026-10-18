# Kudbee Darts 🎯

> **Kudbee Games Studio — Game #2**
> Predictive flick-throw darts in your browser. Original IP, zero install, 60 FPS.

Play **301**, **501** and **Cricket** against a friend (pass-and-play) or a league of smart AI
rivals. **Drag to aim, then swipe-release to throw** — a true flick whose speed sets the
power and curl (a tap won't throw). Watch the score land on a **digital seven-segment
scoreboard** that pops and sheds bricks, follow the **on-board checkout guide** that lights
up exactly what to hit on a finish, climb the **league ladder**, earn **XP**, and unlock
**neon dart skins**.

## Play

- **Hosted:** `/(site)/games/kudbee-darts/index.html`
- **Locally:** from the repo root run `python3 -m http.server 8000`, then open
  <http://localhost:8000/games/kudbee-darts/index.html>

## Darts Birds (campaign)

**DARTS BIRDS** on the menu opens a level map in the Angry Birds style: three worlds of
five levels, each world ending in a boss. A level is a 301 or 501 leg against a named
rival. Stars come from the darts you throw on the winning leg: 1 star for a win, 2 within
par + 6, 3 within par. Levels unlock one at a time, and the best stars are saved per
level (`campaign.js` holds the level list and the star rule).

**THINK BOX** is a side world that opens once the World 1 boss has a star: wooden
crates stand just in front of the board (some slide side to side), and a dart that meets
one sticks in the wood and scores nothing, so you plan around them. The AI aims around
the crates too.

Each level sets its rival's accuracy, so difficulty ramps level by level. The
rivals and the star targets (`par`) are tuned with bots, not guesses:

```bash
node games/kudbee-darts/eval/calibrate.mjs 150 0.10 0.13
```

plays every level 150 times with a bot in your seat at each accuracy (0.10 is a
strong player, 0.13 a casual one) and prints win rates, darts-to-win percentiles
and the share of 3★ / 2★ wins. At the current tuning a casual player wins about
75% of World 1 down to about 30% of the last boss, and a strong player earns 3★
on roughly half to two-thirds of the wins.

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
sweet spot. A wild, rushed flick scatters more than a smooth, committed one.

**The flight is simulated**, like the arrow in Kudbee Archery. The release becomes a 3D
projectile from your hand to the board face (gravity, curl, weight), drawn in
perspective: a soft flick is slower, so it drops lower; a hard one is faster and flatter,
so it rides high; curl bends it sideways. Where that path meets the board is what scores
(`src/entities/dart.js` → `_launch`).

**The power band auto-calibrates to you.** Everyone flicks at their own pace — a short
trackpad drag, a fast phone swipe. Over your first few throws the game learns your natural
release speed and re-centers the sweet spot on it (persisted per device), so a clean flick
reads as clean on any device instead of being stuck against one fixed speed. Aim and
steadying the hand-tremor stay the skill; the band just fits your throw. In shared hotseat
play both seats share one device profile.

## Modes

- **301 / 501** — race from 301 (quick game) or 501 to exactly zero. You must **finish on a double** (the bull
  counts as D25). Bust (going below 0, landing on 1, or hitting 0 without a double) reverts
  the whole turn. A live **checkout hint** plus an **on-board guide** light up your
  finishing route — the next dart brightest — doubling as a built-in training aid.
- **Cricket** — close `20·19·18·17·16·15` and the **bull** by hitting each three times
  (single = 1 mark, double = 2, treble = 3). Once you've closed a number, extra hits
  **score** its value — until your opponent closes it too. Win by closing everything with
  points ≥ your opponent.

## Board look

The menu's **BOARD** button switches between the default **Neon** board and a classic **Pub** board
(black/cream wedges, red/green rings, wooden surround, wood-panelled wall). It is paint only — both
themes share one geometry and hit-test, so scoring is identical — and the choice is saved.

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

Match results are also posted to the **Kudbee online leaderboard** via the SDK
(`leaderboard/client/kd-leaderboard.js`). In demo mode (no auth) you'll be prompted
for a name after each match; when the Worker is deployed and `API_BASE` is configured,
scores post to the global top-10 automatically.

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
SOFT / TOO HARD / DIALED IN) coaches the swipe against your own auto-calibrated power band,
and supported phones get a **haptic thump**. Darts stick
with their **tip exactly on the scoring pixel**. No external assets required — the dartboard
and darts are drawn procedurally so hit detection is pixel-exact. All original IP.
