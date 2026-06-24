# Kudbee Pinball — **STARBREAK** · Concept & Build Spec

> **Status:** Concept / Phase-1 spec (no game code yet).
> **Working title:** *Starbreak* — a neon space pinball table by Kudbee Games Studio.
> **One-liner:** A single, gorgeous neon-space pinball table where every shot
> charges your ship to break orbit — built the Kudbee way: zero-build, vanilla
> HTML5 Canvas, 60 fps on phone and desktop, online leaderboard from day one.

---

## 1. Why this fits Kudbee

- **Same recipe as the lineup.** Contra, Darts, and Riff are all zero-build,
  self-contained Canvas games with code-drawn neon vector art, a fixed-timestep
  loop, pooled particles, Web-Audio-synth sound, `prefers-reduced-motion`
  support, and touch controls. Pinball drops straight into that mold.
- **We already solved the scary part once.** Kudbee Darts uses *swept-segment
  collision* so fast bolts can't tunnel through targets. Pinball is the same
  class of problem (a fast ball vs. thin walls/flippers) — so the riskiest
  system is a known quantity here, not a research project.
- **It reuses our new infrastructure.** The online leaderboard (Worker + D1 +
  demo-mode SDK) we just shipped for Riff takes a `pinball` game in one catalog
  entry — instant global high scores behind a shareable link.
- **It shows range.** A rhythm game, a sports game, a run-and-gun, and a physics
  pinball table is a genuinely impressive portfolio spread.

**Difficulty: medium.** Harder than Riff (real continuous physics), easier than
the 3D Aether Wing (no WebGL, no 3D math, no asset pipeline).

---

## 2. Player fantasy & core loop

You're a pilot stranded at the edge of a dying star. Each ball is a launch
attempt; the table is your ship's systems. **Hit shots → charge subsystems →
light missions → reach the wizard mode "STARBREAK" (escape the star).**

**Core loop (seconds):** plunge → control the ball on the flippers → aim a shot
(ramp / orbit / target) → get a reward (score, light a lamp, advance a mode) →
recover the ball → repeat. Lose the ball down the drain → next ball (3 balls +
earned extra balls). **Session:** climb modes within a ball; chain modes across
balls; chase the personal-best and the online board.

The whole game lives or dies on **game feel** (§7), not feature count.

---

## 3. The table — themed layout

Logical playfield ~ **900 × 1500** (portrait, like a real table), scaled to fit
the frame. Y points down; gravity pulls toward the flippers.

```
            ┌───────────────────────────────────┐
            │   ✦  starfield + nebula backdrop ✦ │
            │        ╭─ THE STAR (top saucer) ─╮ │   ← mission start / wizard lock
            │   ◎ orbit-L          orbit-R ◎    │   ← left/right orbits (loops)
            │     ╭──RAMP: WARP──╮   ◍ ◍ ◍      │   ← habitrail ramp + bumper cluster
            │   ▣▣▣ drop targets   (asteroids)  │
            │        ◍   ◍   ◍                   │   ← 3 pop bumpers ("asteroid belt")
            │   ⊟ spinner        ⬡ lock saucer  │   ← spinner ("solar sail") + multiball lock
            │     ◣ sling         sling ◢        │   ← slingshots
            │       \   ◐ flippers ◑   /         │
            │   drain│  L         R  │drain      │
            │  out──◤└──────┬──────┘◥──out       │   ← outlanes (drain) + inlanes (save feed)
            │            ▼ DRAIN ▼               │
            └──────────────────────┐ plunger lane│   ← right plunger lane + skill-shot
```

**Regions:**
- **Flippers (L/R)** at the bottom, plus optional **upper-right mini-flipper**
  for the ramp feed (Phase 3).
- **Plunger lane** (right): pull-and-release launch with a **skill shot**
  (time the plunge to light the top lane).
- **Slingshots** (two) above the flippers — reactive kickers that keep play
  lively.
- **Pop bumpers** ×3 ("the asteroid belt") — center-upper, high-energy
  scattering.
- **Drop-target bank** ×3–5 ("hull breaches") — knock all down to light a mode.
- **Two orbits** (left/right loops) — smooth high-value lane shots that feed the
  top.
- **The WARP ramp** — a habitrail the ball rides and returns to a flipper; the
  signature "satisfying" shot.
- **Spinner** ("solar sail") on a lane — rapid points + a held-shot feel.
- **Lock saucer** ("docking bay") — captures the ball to lock for **multiball**.
- **The Star** (top saucer) — starts missions; becomes the **wizard-mode** lock.
- **Outlanes/inlanes** with a **ball-save** "tractor beam" early in each ball.

---

## 4. Physics design — the hard part (do this first)

A pinball can cross its own diameter in a single frame, so **naïve "move then
test" lets it pass through thin walls and the swinging flipper.** The fix is
standard and we've shipped it before:

### 4.1 Integration & sub-stepping
- Fixed-timestep simulation (e.g. 240 Hz physics, 4 sub-steps per 60 Hz frame),
  decoupled from render (we already do fixed-timestep loops). Sub-stepping alone
  removes most tunneling and stabilizes fast contacts.
- **Continuous collision (swept):** treat the ball as a moving circle; for each
  collider, solve the earliest time-of-impact along the step and resolve at that
  point, then continue the remaining step. This is the Darts swept-segment idea
  generalized to circle-vs-segment / circle-vs-circle / circle-vs-arc.

### 4.2 Collider primitives (the whole table is just these)
- **Line segment** (walls, lane guides, target faces) — circle-vs-segment swept
  test; reflect velocity about the segment normal.
- **Circle / point** (posts, bumper cores, ball-vs-ball for multiball) —
  circle-vs-circle.
- **Arc** (rounded corners, orbits, the warp ramp curve) — circle-vs-arc, or
  approximate arcs as short segment fans (cheaper, plenty accurate).
- **Capsule** = segment + end caps — the cleanest **flipper** collider.

Restitution (bounciness) and tangential **friction** per material: lively off
bumpers/slings, dead-ish off rubber, slick on ramps.

### 4.3 Gravity & "slope"
A real table is tilted ~6.5°; we fake the slope as a constant downward
acceleration plus a slight tunable "drift." One gravity constant + per-region
damping is enough; tune by feel, not by simulating 3D incline.

### 4.4 Flipper dynamics (where the feel is won)
- Flipper = a **capsule rotating about a pivot**, driven to two angles (rest /
  raised) by a fast angular spring or a clamped angular velocity (~a few ms to
  full swing — flipper latency is the #1 feel factor).
- On contact, impart the flipper's **surface velocity** at the contact point to
  the ball (angular impulse): the ball leaves faster the closer to the tip and
  the faster the flipper is still moving — this gives live catches, backhands,
  and tip passes.
- **Hold = "cradle/trap":** a held flipper plus the right damping lets the ball
  rest against the flipper so the player can aim — essential for skilled play.

### 4.5 Drain, save, nudge/tilt
- **Drain:** ball below the flippers between the outlanes → lost.
- **Ball save / "tractor beam":** a short grace window early in each ball
  (and after multiball) re-serves a quick drain.
- **Nudge:** a small impulse to the ball (keyboard key / phone shake via
  `devicemotion`, or a swipe) — with a **tilt** meter that penalizes
  over-nudging (lose the ball). Optional but adds huge authenticity.

> **De-risk rule:** Phase 1 builds *one flipper + a ball + a few walls + a
> bumper* and nothing else, until the catch/cradle/bounce feels right. Feature
> work only starts after the physics core feels good.

---

## 5. Game-feel checklist (the actual product)

- Flipper response feels **instant** (sub-step the input; raise within ~3–6 ms).
- You can **trap and cradle** the ball, then **aim** a deliberate shot.
- Ramps **flow** and return the ball to a flipper (no dead returns).
- Bumpers/slings feel **alive** but not chaotic; the ball is recoverable.
- Big shots land **juice**: screen-relative shake, flash, particle burst,
  a rising score pop, satisfying synth "thwack."
- Difficulty comes from **physics + geometry**, not fake randomness.

---

## 6. Features & mechanics (and how big each is)

| Feature | Feel job | Build size |
|---|---|---|
| Flippers + plunger | the entire control scheme | **core (big)** |
| Slingshots | keep play energetic above the flippers | small |
| Pop bumpers | scatter + points up top | small |
| Drop targets | "clear the bank → reward" | small–med |
| Orbits / lanes | smooth high-value shots | med (geometry) |
| **Warp ramp** | the signature satisfying shot | **med–big** (habitrail) |
| Spinner | rapid points, held-shot feel | small |
| Lock + **multiball** | the headline thrill (2–3 balls, ball-vs-ball) | **big** |
| Missions/modes | goals + variety + the "one more game" hook | med (mostly content) |
| Scoring/combos/bonus | the reason to chase shots | med |
| Skill shot | rewards a clean plunge | small |
| Nudge / tilt | authenticity | small–med (optional) |

---

## 7. Modes & missions (space-themed mission stack)

Light a mode at **The Star** saucer; one active at a time; complete to bank a
star. Collect N stars → **STARBREAK wizard mode**.

1. **Asteroid Field** — hit the 3 bumpers ×N before time runs out (fast, frantic).
2. **Solar Sail** — keep the spinner spinning to charge a meter; cash at the ramp.
3. **Hull Repair** — drop the full target bank, then hit the lit orbit.
4. **Wormhole** — lock 2 balls at the docking bay → **2-ball multiball**, jackpots
   at the ramp, super-jackpot at The Star.
5. **WIZARD: STARBREAK** — all stars lit: short multiball with every major shot
   scoring escalating jackpots; survive/Score to "break orbit." Big finale.

Each mode = a lamp state + a timer + a shot list + a reward; cheap to add once
the table physics and the shot-detection scaffolding exist.

---

## 8. Scoring, combos & the online board

- **Base awards** per element; **combo multiplier** that climbs while you keep
  hitting lit shots and decays on a miss/drain (same "reward the streak" idea we
  just tuned into Riff).
- **Jackpots** in multiball; **end-of-ball bonus** = (modes + targets + spins) ×
  bonus multiplier.
- **Skill-shot** bonus for a timed plunge.
- **Leaderboard (reuse the live service):** add a `pinball` game to
  `leaderboard/shared/core.js` with metrics **score** (primary), **bestMultiball**,
  **modesCompleted** — identical pattern to the `riff` wiring, so it's a tiny
  backend change + the same in-game "Post score / Top-10" UI. Global high scores
  on day one.

---

## 9. Controls

- **Desktop:** Left/Right flippers = **Z / .** (or Left/Right arrows or A/L);
  **Space** = plunge (hold to charge, release to fire); **↑/Shift** = nudge;
  **P** pause, **M** mute.
- **Mobile (two-thumb):** tap/hold the **left half** of the screen = left
  flipper, **right half** = right flipper (the natural pinball-app scheme);
  the plunger is a **pull-down-and-release** drag in the plunger lane; an
  optional **shake-to-nudge** via `devicemotion`. Big invisible touch zones,
  not tiny buttons.

---

## 10. Art direction

- **Neon vector, code-drawn** (no asset pipeline): glowing lane guides, additive
  bloom on hot elements, chrome-ish posts, gem-like targets — same palette as the
  studio (`#39e6ff / #c46bff / #7CFFb2 / #ffd34d / #ff5d3c`).
- **Backdrop:** reuse Riff's **parallax starfield + shooting stars** behind the
  playfield glass; a slow nebula gradient; the dying star pulsing at the top.
- **Lighting:** lamps (insert lights) that bloom when lit; the ball gets a
  specular highlight + motion-blur streak at speed; ramps glow when their shot is
  live.
- **Juice:** pooled particles for hits, ring shockwaves on big shots, a CRT/glass
  vignette, screen-relative shake (honor `prefers-reduced-motion` — cap shake,
  skip motion-blur, keep the table readable).

## 11. Audio

100% Web-Audio synth (our house pattern): flipper "clack," bumper "boing,"
ramp whoosh, spinner ratchet, target ping, multiball launch riser, mode jingles,
and an ambient bed. No files, no licensing.

---

## 12. Tech architecture

- **Zero-build**, deployed as static assets on Cloudflare Pages (like every
  other game). Likely a **modular classic-script layout like Darts**
  (`engine/` loop·input·audio·particles, `world/` table geometry + colliders,
  `entities/` ball·flipper, `modes/`, `game.js`) rather than one giant file —
  pinball has enough systems to warrant it.
- **Fixed-timestep** physics (sub-stepped) + separate render pass; **DPR-aware**
  canvas; **object pools** for particles/balls; pause when hidden; reduced-motion
  path. The **table geometry is data** (a list of colliders + lamp/shot
  definitions) so the renderer and the physics derive from one source — the same
  "one source of truth" discipline as the Darts board.

## 13. Performance & accessibility

- 60 fps target; physics sub-steps capped; broad-phase = simple spatial buckets
  (the table is small and mostly static, so even brute-force is fine at first).
- Degrade gracefully on low-power mobile (fewer particles, no motion-blur).
- `prefers-reduced-motion`, color-contrast for lit/unlit lamps, large touch
  zones, pause/mute, a clear "how to play" gate.

---

## 14. Scope & phased plan

> Phased per our PR flow (plan → scaffold → feature → hardening → launch). Each
> phase is its own PR; physics correctness gates everything after Phase 2.

- **Phase 0 — this spec** *(done).* Concept + decisions + open questions.
- **Phase 1 — Physics proof** *(highest risk, do next).* One flipper + ball +
  walls + one bumper; sub-stepped swept collision; cradle/catch tuning. A tiny
  playable page whose only job is to **feel right**. *(small–medium)*
- **Phase 2 — Playable table.** Two flippers, plunger + skill shot, slings,
  bumpers, drop targets, one orbit, the warp ramp, drain/ball-save, base scoring
  + combo, the neon art + juice + audio. **This is the real game.** *(large)*
- **Phase 3 — Depth.** Lock + multiball (ball-vs-ball), spinner, second orbit,
  the mission stack + STARBREAK wizard, end-of-ball bonus, nudge/tilt.
  *(medium–large, mostly content on the Phase-2 engine)*
- **Phase 4 — Online + polish.** `pinball` leaderboard wiring (reuse Riff's),
  results/Top-10 UI, settings, mobile feel pass, performance + accessibility
  pass, Studio nav card. *(medium)*

**Honest effort read:** Phases 1–2 are the bulk; once the table engine + shot
scaffolding exist, Phase 3 features are comparatively cheap to add. The single
biggest determinant of quality is **time spent tuning flipper/ball feel** in
Phase 1 — budget for iteration there.

## 15. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Fast-ball tunneling | sub-stepping + swept (already proven in Darts) |
| Flipper feel "off" | isolate it in Phase 1; tune before any features |
| Ramp/habitrail returns feel dead | model ramps as guided lanes that re-feed a flipper; playtest |
| Mobile flipper latency | flippers on raw touchstart, sub-stepped input, big zones |
| Scope creep (it's pinball — endless features) | one table, phase-gated, leaderboard as the "endless" hook |
| Perf on low-end phones | particle/motion budgets + reduced-motion path |

## 16. Success criteria

1. The ball **feels real** — you can trap, cradle, aim, backhand, and ride the
   ramp, at 60 fps on a mid phone.
2. A first-timer understands it in 5 seconds and wants "one more ball."
3. It looks unmistakably **Kudbee neon-space**.
4. Scores post to the **global board** behind a shareable link.

---

## 17. Open questions for the owner

1. **Title:** keep *Starbreak*, or another name?
2. **Scope confirm:** one deep table (recommended) vs. multiple simpler tables?
3. **Nudge/tilt:** include it (more authentic, slightly more work) or skip for v1?
4. **Leaderboard metric:** rank by **score** (default), or a blended "skill"
   rating like Darts?
5. **Greenlight Phase 1** (the physics-proof prototype) so you can *feel* the
   core before we commit to the full table?

> Recommendation: **hand-rolled 2D physics** (full control over feel, zero
> dependencies, matches the house style), **one deep neon-space table**, phased
> as above, starting with a Phase-1 physics proof.
