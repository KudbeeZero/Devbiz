# Kudbee Darts — Game Design

## Pillars

1. **Predictive, skill-based throw** — you always see where the dart will land *before* you
   release; mastery is about committing at the right moment.
2. **Honest difficulty** — AI and humans score through the identical hit-test; an opponent is
   only as good as its aim scatter and target choice.
3. **Always-on progression** — every match feeds XP, streaks, a league ladder, and skin
   unlocks, all persisted locally so there's always a next goal.

## The throw model (`entities/dart.js`)

- **Aim** — press on the board and drag; the reticle eases toward the pointer (a weighty
  feel), clamped to the board disc.
- **Wobble** — the reticle carries a small Lissajous jitter `(A·sin(ω₁t), A·cos(ω₂t))` whose
  amplitude `A` *grows* the longer you hover (base 0.006 → max 0.060 board-radii). Hovering
  forever is punished; a quick committed throw groups tight.
- **Predict** — every frame the predicted landing = aim + current wobble; it's fed to
  `Board.hitTest` to drive the glowing reticle and the live label ("T20 60").
- **Release** — final landing = predicted point + a 2-D Gaussian **scatter** (σ in
  board-radius units). Human σ ≈ 0.024 (skill-assisted). The flight is cosmetic 2.5-D
  (scales for depth, arcs in); only the landing point scores.

## Modes (`modes/x01.js`, `modes/cricket.js`)

Both expose a uniform interface — `initPlayer`, `beginTurn`, `applyDart(player, hit,
opponent) → {bust, win, scored, text}`, `summary`, `checkoutHint` — so `game.js` is
mode-agnostic.

- **501** — subtract each dart; finish on a double; bust reverts the turn. A checkout solver
  (`checkoutRoute`) powers both the AI and the human hint, searching 1–3 dart routes that end
  on a double, preferring classic lines (T20…, D20/D16 finishes).
- **Cricket** — marks per number (15–20, bull); close at 3; overflow on a number you've
  closed but the opponent hasn't scores its value. Win = all closed and points ≥ opponent.

## Opponents (`entities/players.js`)

Tiers set two knobs only:

| Tier   | σ (scatter) | think time | ambition |
|--------|-------------|------------|----------|
| Rookie | 0.130       | 0.9 s      | low (grinds singles, safe doubles) |
| Pro    | 0.070       | 0.6 s      | trebles + checkouts |
| Legend | 0.030       | 0.45 s     | optimal trebles + checkouts |

- **501 AI** — go for T20 above 170; below, take the first dart of the computed checkout
  route; knock down bogey numbers with the 20s. Rookies favour safer lines.
- **Cricket AI** — Pro/Legend rack points on closed 20/19, otherwise close the highest open
  number with trebles; Rookies bank single marks.

## Progression (`progression.js`)

`localStorage` key `kd.profile.v1`: XP/level (×1.35 curve), coins, win streak (with a bonus
multiplier), a **league ladder** of seven named rivals (Rookie→Legend), unlockable skins
(ladder rewards + level milestones), and per-mode stats (180s, best checkout, marks, points).
The shape is deliberately serializable so a future cloud sync / online league can adopt it
unchanged.

## Juice (`game.js`)

Slow-mo + zoom punch + screen shake on big hits (T20, bull, checkout, 180), confetti and a
crowd-cheer on wins, floating score pops, announcer callouts ("180!"), and level-up / unlock
toasts. Audio is 100% code-synthesized (Web Audio) — whoosh, thud, scoring chimes, bust
buzzer, cheer.

## Deferred (v2)

Real-time online PvP and shared leaderboards (would add a Cloudflare Workers + Durable
Objects backend). The current build ships fully on static hosting.
