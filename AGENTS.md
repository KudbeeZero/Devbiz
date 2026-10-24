# AGENTS.md

Project-specific agent instructions for the Kudbee repository.

## Agent Workflow

This project uses a **commit-streaming workflow** (owner decision 2026-07-02):
- Default to incremental commits on a working/integration branch
- Open a PR only when a genuine review gate is needed or the owner requests it
- When a PR is opened, the full PR Flow rules apply (see `docs/PR_FLOW.md`)

## Branch Lifecycle

- `main` is the only long-lived branch and the deploy source (Cloudflare Pages)
- Working branches are short-lived and single-purpose: `claude/<lane>`
- When a lane is **done + verified**: land commits to `main` and delete the branch (local + remote) in the same step
- A branch may linger only while it holds active in-progress work
- **Note**: Remote branch deletion currently fails (HTTP 403) in this environment — log stale branches in `docs/BUILD_LEDGER.md` instead of retrying

## PR Flow Rules (when a PR is opened)

1. **One PR = One Purpose** — docs/process, infrastructure, bug fix, feature, security/privacy, economy/marketplace, or deployment/release
2. **Phase Order** — Plan → Scaffold → Feature → Hardening → Launch
3. **Draft First** — unless tiny docs-only change
4. **AWAITING_AUDIT** only after scope frozen, checks documented, risks listed
5. **No Auto-Merge** — explicit owner approval required
6. **Green Status** — local verification only (CI workflows removed); say "local passed, no CI configured"
7. **Owner-Only Decisions** — stop and ask before merging, deploying, changing pricing/permissions/security, enabling payment/API keys, changing production env vars, retargeting branches, opening new PR lanes

## Memory Layers (where to read/write)

| Layer | File | When to Read | When to Write |
|-------|------|--------------|---------------|
| Cortex (durable doctrine) | `CLAUDE.md` | Task start | When a rule becomes permanent |
| Hippocampus (working memory) | `docs/BUILD_LEDGER.md` | Task start | On every lane state change |
| Prefrontal cortex (planning) | `docs/BUILD_PLAN.md`, `docs/BACKLOG.md`, `docs/PR_FLOW.md` | Before scoping | When plan changes |
| Cerebellum (procedural reflexes) | Reflexes log in `CLAUDE.md` | Task start | When something learned twice |
| Amygdala (guardrails) | `docs/PRIVATE_TESTING_GATE.md`, §11 in `CLAUDE.md` | Before risky actions | Never auto-cross |
| Motor cortex (execution) | `index.html` + `assets/site/` (filed — see *Site filing system*), `games/`, `tools/`, `recording-it/`, `leaderboard/`, `clients/`, `lab/` | Before editing | When making changes |
| Sensory cortex (external signals) | Cloudflare/Vercel deploys, `ops/github-sentinel/` | Continuous | Treat deploy comments as signal only |

## Build Ledger

Track every PR/lane in `docs/BUILD_LEDGER.md` with:
- ID (prefix: `DBZ-`, `GV-`, `REC-`, `BOOM-`, `FR-`, `INFRA-`)
- Status: `PLAN`, `BUILDING`, `DRAFT`, `AWAITING_AUDIT`, `MANUAL_CHECK`, `APPROVED`, `MERGED`, `HOLD`, `FIX_FIRST`, `BLOCKED`
- Gate, Next Owner Action, Notes

Update on a docs/process lane — never bundled into feature PRs.

## Output Quality Doctrine

- **Taste & visual ambition**: every surface is a portfolio piece; match house style (zero-build, inline, vanilla, canvas vector art, existing palette/`fitCanvas`); 60fps target, honor `prefers-reduced-motion`
- **Verify before claiming done**: reuse Green Status language; actually create/modify files; confirm structure before committing
- **Honesty**: own gaps/limitations plainly; don't fabricate data in code/markup
- **No laziness**: read file before editing; don't truncate deliverables
- **Act decisively**: when answer is clear, act then report; reserve questions for genuine ambiguity

## Key Conventions

- **Local verification is the gate**: run lint/typecheck/test locally before declaring base sound or branch mergeable
- **Precise language**: "local passed, no CI configured" — never "CI green" or "expected green"
- **No branches left behind**: delete on merge/close; log if deletion blocked
- **Found but not changed**: document unrelated discoveries, don't fix in current PR

## Project Structure

```
index.html              Marketing site markup (filed §01–§17; no build step)
assets/site/            Its stylesheet + scripts: site.css, site.js, agent.js, store.js (filed)
wrangler.toml           Cloudflare Pages config (serves repo root as static assets)
games/                  Kudbee Games Studio (HTML5 Canvas titles)
tools/                  Kudbee developer utilities (standalone HTML, no build step)
leaderboard/            Online leaderboard service (Worker + D1 + client SDK)
docs/                   Project documentation (ledger, plans, concepts, specs)
```

## Site filing system (`index.html` + `assets/site/`)

The marketing site is filed like a cabinet: every major section sits between a
**BEGIN** and an **END** marker carrying the same id and title, so any section can
be found with one grep and edited without scrolling through 4,000 lines.

- **Markup** — `index.html`, ids `§01`–`§17`: `<!-- ════════ BEGIN §05 Services — sticky stack ════════ -->` … `END §05 …`
- **Styles** — `assets/site/site.css`, ids `C01`–`C22` (cascade order = file order)
- **Behaviour** — `assets/site/site.js` `J01`–`J18` (one IIFE, shared closure), `agent.js` `A01`–`A04`, `store.js` `T01`–`T02`
- **Find a section:** `grep -n "BEGIN" index.html assets/site/*` · **Check the filing:** `npm run site:filing`
- **Rules:** new work goes inside an existing section or gets a new BEGIN/END pair with the next id;
  titles on BEGIN and END must match; update the directory below in the same commit
  (`node ops/check-filing.mjs --print` regenerates it). The check fails if they drift.
- Keep inline only what must be inline: the `html.js` flag script and the JSON-LD.
- **Shared page stylesheets** (one source of truth for pages that were copy-pasted):
  `blog/post.css` — every blog post (not `blog/index.html`); `clients/modernmed/service.css` — the
  four ModernMed service pages (page-only rules stay in a small inline `<style>` after the link).
  New pages of either kind link the shared file instead of pasting CSS. The `tools/` pages
  were checked and left separate: their styles have genuinely diverged (~40–50% overlap).

### Directory

| Id | File | Section |
|---|---|---|
| `§01` | `index.html` | Page chrome — skip link, grain, aurora, preloader, progress |
| `§02` | `index.html` | Nav + mobile drawer |
| `§03` | `index.html` | Hero |
| `§04` | `index.html` | Stats |
| `§05` | `index.html` | Services — sticky stack |
| `§06` | `index.html` | Story — pinned process |
| `§07` | `index.html` | Work — case studies |
| `§08` | `index.html` | Games band |
| `§09` | `index.html` | AI agents + tiny-app store |
| `§10` | `index.html` | Lab |
| `§11` | `index.html` | Pricing |
| `§12` | `index.html` | Doctrine |
| `§13` | `index.html` | Contact + FAQ |
| `§14` | `index.html` | Mega CTA |
| `§15` | `index.html` | Floating "Start a project" pill |
| `§16` | `index.html` | Footer |
| `§17` | `index.html` | Scripts — site.js, agent.js, store.js (assets/site/) |
| `C01` | `assets/site/site.css` | Foundation — fonts, design tokens, base elements |
| `C02` | `assets/site/site.css` | Ambient room — film grain + aurora |
| `C03` | `assets/site/site.css` | Preloader + ghost wordmark |
| `C04` | `assets/site/site.css` | Custom cursor |
| `C05` | `assets/site/site.css` | Progress bar + nav + mobile drawer |
| `C06` | `assets/site/site.css` | Section chrome, lighting, buttons |
| `C07` | `assets/site/site.css` | Hero + marquee ribbon |
| `C08` | `assets/site/site.css` | Stats |
| `C09` | `assets/site/site.css` | Services — sticky stack |
| `C10` | `assets/site/site.css` | Story — pinned steps |
| `C11` | `assets/site/site.css` | Work — case cards, device frames, quotes |
| `C12` | `assets/site/site.css` | Games band |
| `C13` | `assets/site/site.css` | Agents — chat card + capability cards |
| `C14` | `assets/site/site.css` | Tiny-app store + terminal |
| `C15` | `assets/site/site.css` | Lab / media |
| `C16` | `assets/site/site.css` | Pricing |
| `C17` | `assets/site/site.css` | Doctrine |
| `C18` | `assets/site/site.css` | Contact form + FAQ |
| `C19` | `assets/site/site.css` | Floating "Start a project" pill |
| `C20` | `assets/site/site.css` | Big CTA + footer |
| `C21` | `assets/site/site.css` | Responsive breakpoints |
| `C22` | `assets/site/site.css` | Global reduced-motion gate |
| `J01` | `assets/site/site.js` | Setup + motion-token readers |
| `J02` | `assets/site/site.js` | Preloader |
| `J03` | `assets/site/site.js` | Custom cursor |
| `J04` | `assets/site/site.js` | Shared rAF scroll bus |
| `J05` | `assets/site/site.js` | Nav — progress, hide-on-scroll, active section, drawer |
| `J06` | `assets/site/site.js` | Reveal / counter / magnetic / marquee |
| `J07` | `assets/site/site.js` | Card spotlight follow |
| `J08` | `assets/site/site.js` | Ghost-word parallax |
| `J09` | `assets/site/site.js` | Hero exit choreography |
| `J10` | `assets/site/site.js` | Aurora per-section hue bias |
| `J11` | `assets/site/site.js` | Sticky service stack |
| `J12` | `assets/site/site.js` | Pinned story canvas |
| `J13` | `assets/site/site.js` | Hero constellation canvas |
| `J14` | `assets/site/site.js` | Neon scene painter (game thumbnails) |
| `J15` | `assets/site/site.js` | Arcade thumbnail motion ticker |
| `J16` | `assets/site/site.js` | Legacy hash router |
| `J17` | `assets/site/site.js` | Floating "Start a project" pill |
| `J18` | `assets/site/site.js` | Contact form validation |
| `A01` | `assets/site/agent.js` | Owner config — capture endpoints |
| `A02` | `assets/site/agent.js` | Kudbee Agent — setup + site index |
| `A03` | `assets/site/agent.js` | Agent KB scoring |
| `A04` | `assets/site/agent.js` | Lead capture + chat UI |
| `T01` | `assets/site/store.js` | Tiny-app store — install terminal |
| `T02` | `assets/site/store.js` | Typed terminal commands |

### Site CSS conventions

Moved here from the stylesheet (it was shipped to every visitor as a comment).

```
ALL CARD-LIKE ELEMENTS follow these rules for consistency:

1. BORDER-RADIUS SCALE
   • --radius-sm (14px): small cards, minor UI, badges
   • --radius-md (20px): medium cards, tool items, form fields, capability items
   • --radius-lg (24px): primary cards (games, services, work, pricing, games hero)
   Example: border-radius: var(--radius-lg);

2. SHADOW ARCHITECTURE
   • Base shadows use CSS custom properties (no hardcoded values)
   • --shadow-sm: at-rest cards (subtle, ~12px blur)
   • --shadow-md: hover/panels (medium depth, ~30px blur)
   • --shadow-lg: hero/prominent (deep, ~80px blur)
   • Each shadow includes inset white highlight (1px, low opacity) for depth
   Example: box-shadow: var(--shadow-md);
   Hover: box-shadow: 0 24px 60px rgba(0,0,0,0.55), 0 0 40px rgba(var(--acc-rgb), 0.16);

3. ACCENT COLOR SYSTEM
   • Default accent: --cyan (57,230,255)
   • Per-card override: inline style="--acc-rgb:R,G,B" (no comma spaces)
   • Usage in shadows: rgba(var(--acc-rgb, 57,230,255), 0.2) for fallback
   • Apply to borders, glows, and CRT effects on hover
   Example: border-color: rgba(var(--acc-rgb, 57,230,255), 0.4);

4. MOTION TIMING
   • All transitions use --mo-dur-* variables (never hardcoded milliseconds)
   • Primary interaction: --mo-dur-1 (0.25s), --mo-dur-2 (0.3s), --mo-dur-3 (0.4s)
   • Use --ease (cubic-bezier easing) by default, --ease-io for symmetrical
   • Respect prefers-reduced-motion: wrap animations in @media blocks
   Example: transition: transform var(--mo-dur-3) var(--ease);

5. TRANSFORM & HARDWARE ACCELERATION
   • Use transform + opacity only (never left/top/margin for animation)
   • Add will-change: transform; on interactive cards to hint compositor
   • On hover: transform: translateY(-4px) or scale(1.02) for depth
   Example: will-change: transform; transition: transform var(--mo-dur-3) var(--ease);

6. INSET HIGHLIGHTS & GLOSS
   • Dark backgrounds (--bg-2, --panel) + inset white border creates depth
   • Inset highlights: inset 0 1px 0 rgba(255,255,255,0.03..0.08)
   • CRT scanlines on game cards: repeating-linear-gradient(0deg, rgba(0,0,0,0.13)..0.22)
   • Applied to ::after pseudo-elements so they layer on top
   Example: inset 0 1px 0 rgba(255,255,255,0.05);

7. RESPONSIVE SCALING
   • Font sizes, gaps, padding use clamp(min, preferred, max)
   • Border-radius: can vary per breakpoint if needed, but prefer fixed for now
   • Example: padding: clamp(24px, 3.5vw, 40px);

Implementation note: This is the production CSS foundation. Every new card
type or section applies these rules without exception. Audit new PRs against
this checklist before approving.
```

## Local Preview

```bash
python3 -m http.server 8000
```

## Games Studio — Current Status

All 9 games have completed a "game-polish" pass. The main cross-cutting gap is **online leaderboard integration**:

| Game | Leaderboard Status |
|------|-------------------|
| All 9 | SDK-wired on `main`; **live post** needs Worker deploy + `API_BASE` (owner-gated) |
| `pinball` | Evaluator gate **24/24** (`npm run pinball:eval`); metrics score / bestMultiball / modesCompleted |
| `darts`, `voidrunner` | Auto-post with queue-until-boot (DBZ-064, DBZ-068) |
| `munch`, `puzzles`, `orbital` | Auto-post with `lbPending` flush (DBZ-071) |
| `riff`, `riff-2` | Manual post + top-10; `lbPostQueued` (DBZ-072) |
| `contra` | Auto-post; recursive `_lbPost` after SDK create |

See `docs/GAMES_STUDIO_ROADMAP.md` for the phased integration plan.

## Leaderboard Service

- `leaderboard/shared/core.js` — metric catalog (`GAMES` object), validation, ranking, HTTP handler
- `leaderboard/client/kd-leaderboard.js` — browser SDK (`KDLeaderboard.create()`), supports demo/ALGO/Clerk auth
- `leaderboard/worker/` — Cloudflare Worker + D1 storage
- Games integrate via `window.KD_LB_CONFIG = { API_BASE, GAME, ... }` + `<script src="../../leaderboard/client/kd-leaderboard.js">`

## Testing / Verification

- No CI configured (removed to avoid billing stalls)
- Local verification only: run project's lint/typecheck/test commands before declaring green
- Green gate from repo root: `npm run verify` (pinball 24/24 + leaderboard unit tests). Pinball-only: `npm run pinball:eval`
- Manual gates documented in ledger (browser, wallet, payment, API key, deploy verification)
- Test hooks: `window.__kbTest` (pinball), `window.RIFF` (riff), `window.PINBALL` (pinball), `window.ABY` (abyss: `ABY.game`, `ABY.Song`, `ABY.Scene`) for headless verification
- Per-game gates from repo root: `npm run archery:engine` + `archery:eval`, `abyss:eval`, `voidrunner:eval`, `darts:eval`, `cornhole:*`, `cricket:*` (each prints `N/N passed`; say "local passed, no CI configured")
- Games security gate: `npm run games:csp` loads every `games/*/index.html` under the `/games/*` CSP from `_headers` and fails on any violation or any cross-site script/stylesheet without an `integrity` hash

## Security rules for games (owner priority, 2026-10)

- **Nothing from outside goes into `innerHTML`.** Leaderboard names, cloud saves, share links and `localStorage` are data, never markup: use `textContent` / `createElement`, or escape (voidrunner `escHtml`). A hostile name once ran script on Voidrunner's game-over screen (`board-name-is-text` guards it).
- **A save or a link is never trusted.** Clamp and type-check every field on load (archery `Store.load`, `Ghost.decode`; abyss `ABY.cleanState`), cap sizes, and refuse the whole thing on one bad field.
- **Cross-site scripts carry `integrity` + `crossorigin="anonymous"`**, pinned to an exact version (Abyss: three.js r128 from cdnjs). A dynamic `import()` cannot take SRI, so pin an exact version and ask the owner (wallet code is OWNER-OK territory).
- **The leaderboard refuses what cannot be real**, not clamps it: a metric can have `floor` (values below are dropped) and a game can have `rules` (a contradicting line is dropped whole) in `leaderboard/shared/core.js`. Rebuild the single-file worker after editing (`node leaderboard/worker/build-single.mjs`); the test fails if `dist/` is stale. Redeploying the Worker is owner-only.
- **CSP**: `/*` and `/games/*` both ship Report-Only. Widen the policy for a legitimate need; never enforce before real-phone checks.
- Production switches an agent cannot flip (owner, in the Cloudflare dashboard): `ALLOW_DEMO=0`, `ALLOWED_ORIGINS`, rate limits. Never ask for keys or tokens in chat.

## Kudbee Abyss (`games/kudbee-abyss/`)

A story told through a **simulated phone** (owner goal, 2026-10): the whole game plays on an in-world phone with a five-ending branching story, a flute rhythm game and a live 3D wallpaper. Zero build; scripts load in this order: `src/story.js` (pure data + pure functions, also loaded by node), `fx.js` (generated sound), `scene.js` (three.js r128 stage = the wallpaper), `song.js` (the rhythm game), `phone.js` (the OS shell), `game.js` (story delivery, apps, saves, loop).

- **The phone.** Lock screen (story clock, notifications, swipe up) -> home screen (Pulse widget, apps, dock) -> apps: **Messages** (the story arrives as chat: typing dots, split bubbles, her replies are quick-reply chips, contact header follows the speaker), **Echo Flute** (the Song of Recall: the story's song node, plus a practice mode with a kept best), **Gallery** (every ending is a memory/photo; locked tiles show a hint), **Pulse** (heart / resolve / trust rings), **Settings** (sound, vibration, two-tap "new journey" / "erase Gallery"). The status bar is *story* state: clock moves ~3 min per choice, battery drains, signal follows the mood (void 1 bar ... dark = NO SERVICE). New messages while she is in another app raise a banner + a badge. Home bar: swipe up or tap.
- **Device vs screen.** On a roomy fine-pointer desktop (height >= 700) the phone sits in a portrait bezel with an island; on any real phone it fills the screen (no bezel). **Layout rules for what is inside the phone are `@container phone (...)` queries, never `@media`** - a desktop bezel is a portrait phone inside a landscape window, and a media query picks the wrong layout (the first build did). Wide phone = scene left, chat right; tall phone = chat sheet under the scene.
- **Story = data (horror, seven days, twenty-seven endings, ten openings).** `ABY.NODES` is ~190 scenes in 12 chapters (The Awakening, The Companion, The Guardian's Gate, The Descent, The Eye, then Day Two, The Door, Day Three ... Day Seven). The week ends on Day Seven: no ending carries past it. A scene has a speaker (NARRATOR / QUEEN / GUARDIAN / VEY / EYE = the sinister "No Caller ID" / CHOIR / WREN / SORREL), mood, focus, text and `choices`. The player is the voice in the phone. **State:** hidden stats heart / resolve / trust (0-5) and **dread** (0-6; at 6 she comes apart), a real **battery** (`bat`, starts 62; a choice costs 1, +`ABY.TORCH` while the flashlight is on; negative `bat` on a choice charges) and the **flashlight** (`light`, also switched by hand with the torch button: costs `TORCH_TOGGLE`). A choice can `add` stats, `set` a flag, switch `light`, cost `bat`, and be hidden until its `req` holds (`flag`, `noflag`, `min:{trust:2}`, `minDread`, `maxDread`, `light`, `noLight`). A scene can `scare` (glitch | jump | whisper | eye | blackout), be `dark` (arriving without the flashlight = +1 dread), `call` (a full-screen incoming call whose two choices are Answer / Decline), show an `img` (a photo bubble), file a `note` (a clue in the Notes app) or end (`ending: 'auto'` = `ABY.endingFor`, or a fixed id). **Forced scenes** interrupt wherever she is and return with `@back`: `blackout` (battery 0; recharge only with the crystal flag or resolve 3) and `hollowing` (dread 6; trust 3 pulls her back). **Twenty-six endings:** dawn, song, echo, silence, crown, hollow, eye, mirror, betrayal, blackout; **Day Two** daybreak, keeper, loop; **Day Three** chorus, watched; **Day Four** names, caller, drowned; **Day Five** warned, nightline, passed; **Day Six** firstpage, cradle; **Day Seven** seventh (the true end of the week: 10+ endings found, the Seventh Night won, the Eye named Sorrel, Wren told the truth), throne, again. An ending with `cont` carries on to the next day (`keeper` -> Day Three, `chorus`/`watched` -> Four, `caller` -> Five, `nightline`/`passed` -> Six, `firstpage` -> Seven). **Falls and checkpoints:** an ending with `fall: true` (crown, hollow, eye, betrayal, loop, drowned, cradle, again, blackout: she dies or loses herself) goes in the Gallery but never carries on. Every dawn (the opening, or the day a good ending carried her into) is a checkpoint (`G.cp`, saved); a journey has `ABY.WAKES` (3) wakes, and the memory card of a fall offers "Wake at dawn" (`ABY.wake(cp, wakes, mem)`: back to the checkpoint, +1 dread, never into the hollowing). With no wakes left the card says the phone will not wake again and offers only Start over. A new journey resets the wakes; a carry keeps them. Every day must keep a way in that is not a fall (graph check `falls-and-wakes`). **Scars:** every fall in the player's Gallery marks every later journey: `ABY.newState(mem, open, found)` sets `scar_<fall>` flags and files a note from her past self (`ABY.NOTES.scar_<fall>`, announced as a Notes banner); a scar-gated choice at the scene of that fall shows a way past it (8 of the 9 falls; `blackout` is a note only, so the forced blackout keeps states that end in the dark). Waking from a fall brings its scar at once (`ABY.wake(cp, wakes, mem, found)`), so the replayed day already knows. The glass shows them: `#cracks` (an SVG over the screen, no pointer events) at levels 1 / 2 / 3 for 1 / 3 / 6 scars (`#screen[data-scars]`). The graph walk starts as a veteran (every scar) so every scar's way out is proven reachable (`scars`). **Ten openings:** `ABY.OPENINGS` (`awakening` + nine `op_*` scenes: a lift, a bath, a night bus, a ward, a shore, a party, lost property, a voicemail, indoor snow), each with a lock-screen `teaser`, all joining the same Day One graph. A player's first journey opens on `ABY.START`; every later one is scrambled by the pure `ABY.pickOpening(rnd, found, last)` (never the one before; `lastOpen` is saved). The evaluator pins `window.__abyOpening = 'awakening'` unless a flow opts in with `open({ scramble: true })`. `endingFor` order: crown > betrayal (trusted Vey after seeing it, dread >= 3) > sealed > song > lullaby > broken > echo (2/2/2 and dread <= 2) > dawn (trust 2 or truth) > silence. **Day Two (act two):** an ending with `cont: 'd2_wake'` (dawn, song, echo, silence) shows a Day Two button on the memory card; `ABY.carry(state)` takes her on with stats, flags and clues kept, dread -2, battery >= 48 and the light off (it returns null for a final ending). **Badges and factions (a player's own, on their phone, `kudbee.abyss.v2`):** `ABY.BADGES` (16) are earned at an ending by the pure `ABY.badgesFor(found, state, deduced)`; `ABY.FACTIONS` (choir / order / court) are where her choices lean (`ABY.leaning`), the player pledges to one in the Gallery by their own choice and it ranks Initiate / Adept / Elder by badges (`ABY.rank`); the progress share names it. There is no shared server tally: a collaborative event needs the leaderboard Worker deployed (owner-only), so do not fake one. **Fresh start:** every share landing page opens the game with `?fresh=1` (the tool `tools/share-cards.mjs` writes it); the game ignores the saved journey for that visit, keeps badges and faction, and cleans the address. **Memory:** the state carries `mem` (how many endings the player has found, set from the Gallery by `ABY.newState(mem)`); a choice can require it (`req: { min: { mem: 4 } }`). The true ending `daybreak` needs `mem` >= 4, the Guardian's name (flag `knew_name`, from the ledger), trust 3 and dread <= 3, so it only opens for someone who has been through the story before. **Evidence board (Notes):** the player taps two clues to pin them; `ABY.link(state, a, b)` is pure. A pair in `ABY.LINKS` (7: one early clue + one later one, each with an `at` scene) sets the deduction flag `link_<id>`, which opens a hidden choice at `at` (an `ev_*` scene; the ones that return to `at` set `ev_*` and are offered once); a wrong pair costs 2% battery and 1 dread but never below 1% or into the hollowing. The Notes screen keeps a sticky tray (`.pintray`, `#nMsg`) at the top of the list showing the clue she has picked (with a Cancel) and what her last pin did, so a long list never scrolls the answer out of view. Deductions pinned on any night are kept in the save as `deduced` (the Detective badge counts five different ones; one journey can only reach about three, because Day One branches hold different early clues). The graph walk pins every right pair as soon as both clues are held, and its follow-up walks treat a deduction as its two clues (`note:<id>`). **The beginnings run deep (threads):** each of the nine openings after the first is a three-scene prologue, not one scene: `op_X` (three reactions, all to `op_X_b`) -> `op_X_b` (a scene only that opening has, two choices) -> `op_X_c` (the clue `o_*` is filed, then the opening's three original ways into the haze, unchanged). The first scene is a prologue too: `awakening` (three reactions, all to `awakening_b`) -> `awakening_b` (the note under the flute strap, the photo of a small hand) -> `awakening_c` (clue `o_awake`, then the same three ways: `flute_path`, `stones_path`, `unknown_sms`). It has no flashbacks or overnight lines (the first journey sees none; graph `first-scene-prologue`). Any evaluator flow that taps the first scene's three ways goes through `pick()`, which reads the two prologue lines first; a first-journey flow that counts battery pays 2 more. The way she began is kept in the state as `open` (not in the graph walk's key, so the walk merges journeys that differ only in how they began and seeds the other nine openings first). It comes back: an overnight message on Day Two and Day Seven (`req.open`), and a flashback on Day Four (`ec4_*`) and Day Six (`ec6_*`), entered from `d4_wake` / `d6_dawn` by a choice with `req: { open, noflag: 'tt_echoN' }` so only that journey is offered it, once. Echo nodes carry `thread: '<opening>'` and are exempt from the walk's reachability (it follows one opening); the `opening-threads` check proves them structurally. What she remembers there is read by Wren on Day Five (`tt_echo4` at `d5_truth`) and by the Eye on Day Seven (`tt_echo6` at `d7_eye`). A long list of choices (the Clock adds some) scrolls in its own box (`#replies`, `max-height: 54cqh`) and fades while more are below. **What an ending offers survives the card (`G.pend`):** an ending that carries on (the next day) or a fall with wakes left saves its offer in `kudbee.abyss.v2` as `pend` (`{ kind: 'carry', id, state }` or `{ kind: 'wake', id }`) the moment the run ends, because `finale()` clears the run. The ending card, `startRun(true)`/`wakeRun()`, the lock screen ("Day N is waiting"), the badge on the Messages icon and `openMsgApp()` all read `G.pend`, so swiping home, tapping the badge banner or closing the app does not lose the day or the wakes; only taking it, "New journey" / "Start over", erasing memories or a `?fresh=1` link clears it. Never read `G.state` for what the card offers (it is gone after a reload). **The Clock (time slips):** from five scenes (`d3_wake`, `d4_wake`, `d5_wake`, `d6_dawn`, `d7_gather`) she can turn the clock back (a flashback) or wind it forward (a flash-forward): 10 slips, `fb_*` / `ff_*`. A slip is a `safe` node with `time: 'past' | 'future'`; `ABY.choose` entering one remembers where she was (`back`), every choice inside it is `@back` and sets its own `tt_<slip>` flag (the entry choice has `noflag` on the same flag, so each is seen once), and the slip files a clue. What she saw opens hidden choices on later days (`tt_*` flags: say your own name into the water, remind Wren of the landing, sing Sorrel the birthday song, a morning she was shown...), and the eight flags nothing read before are the gates inside the slips. game.js `deliver()` stamps a slip going in and coming out and plays `rewind` / `forward`; `world()` sets `#screen[data-time]` (warm sepia for the past, cold scanlines for the future) and the status clock reads 1:08 or 6:51. A slip is `safe`, so nothing interrupts it, but the scene she returns to can (a flat battery still ends in the dark). Graph: `time-slips`, `every-flag-is-read`. A save in a slip keeps its way back; with none it starts over. **Overnight messages:** `ABY.OVERNIGHT` (15) are what people say while she sleeps: on a day's wake scene (`at`: d2_wake..d7_wake) the thread opens with messages from the Queen, Vey, the Guardian, the Eye, Wren and Sorrel, each shown only to someone whose flag (`req`, like a choice's) a choice set on an earlier day; the pure `ABY.overnightFor(state)` lists them, game.js `deliver()` plays them before the scene's own text (switching the contact header), and a message with a `note` files that clue (in `_land` and in `ABY.carry`, so a carried day files it too; `begin()` un-marks it so the banner announces it). They give flags nothing else read a voice, and one (Vey's brass key) pairs with the nursery wall into the `low_lock` deduction. **Calls:** a scene with `call: { from, sub, ring }` rings full-screen; its first choice is Answer, the second Decline. `ring` (1-3) is how insistent it is (louder, faster, a cracked screen). An insistent call's Decline leads to another call one level louder, and at level 3 the phone has answered itself (one choice). Every day rings at least once (graph `calls-must-be-answered`). **Optional calls (`rg_*`):** seven more chains, one per day, are detours from one scene each (HOME on `awakening_b`, Vey `d2_lull`, HOME `d3_stare`, No Caller ID `d4_delete`, Corvin Ash `d5_hang`, the Queen `d6_wall` and `d7_again`): an entry choice `req: { noflag: 'rg_done_<k>' }` -> `rg_<k>` (ring 1) -> `rg_<k>_2` (ring 2) -> `rg_<k>_3` (ring 3, answers itself); Answer from ring 1 or 2 goes to `rg_<k>_a`, the self-answered one to `rg_<k>_b`; every end returns to the scene she left and sets `rg_done_<k>`. All choices are `bat: 0` with no stat, note or light, so no ending can move (graph `ring-detours` proves it; evaluator `ring-detours-ui` plays one). Note the flashlight: each choice costs `ABY.TORCH` extra while it is on, so a call taken with the light on is not free, and the walk keeps that lowest-battery copy (the graph's `hidden-choices` therefore exempts `rg_done_` entries). The `rg_done_` flags are not in the walk's key. HOME, counting, is the same small voice all week. **Felt replies:** every tap on a reply plays `pick` with a ring of light from the thumb and a flex of the glass; a reply that adds dread plays `pickdark` with a red ring and a shudder (`struck()` in game.js). Always use `ABY.options(state)` (the visible choices) and `ABY.choose(state, i)` (i = the choice's index in the scene); never index `choices` directly. **Echoes:** every non-fall ending in the Gallery sets `echo_<id>` at the start of a journey (`ABY.echoesOf`, `ABY.ECHOES`, delivered through `overnightFor` on a later wake); nothing reads them, so they add no branches, and `eval/graph.mjs` strips them from its seeds (they fattened every state until the walk ran out of heap). **Bonds:** `ABY.BONDS` counts how she has treated Queen, Vey, Guardian, Wren and the Eye from flags her choices already set (`ABY.bond(state, who)`; no new state); a choice or an overnight message can ask `req: { bond: { who, min | max } }`, Pulse lists the people she has touched, and the graph keeps `ABY.BOND_FLAGS` in its key. Every flag a bond counts must be set before Day Seven, and a threshold must be one the walk can reach (`trust-ledger`, `hidden-choices`). **Feel (touch and sound):** every control on the phone is a 44px target (the home swipe strip aside) and answers a tap with a sound or a buzz; the evaluator block `feel` (`touch-targets-and-feel`) taps every control on eight screens in portrait and landscape and fails on a small or silent one, so a new button needs a `click`/`ui` sound or a `buzz`. Settings has a Sound level (Quiet / Normal / Loud = 0.5 / 1 / 1.3 on the master gain, `G.sndLv`, saved as `sndLv`, `ABY.Audio.setVol`) beside the Sound switch, and Vibration strength beside Vibration; the level row is dead while sound is off. **Epilogue (A week later):** winning `seventh` keeps how she treated the five people (`ABY.bondSnap(state)` -> `G.epi`, saved as `epi`, `epiSeen`); the next time the phone is on the lock screen a note "A week later" opens the `#epi` sheet with five messages, one per person, in the tone her bond earned (`ABY.EPI_LINES`, warm >= 2 / mid / cold <= -1 via `ABY.epiBand`; `ABY.epilogueFor(snap)` is pure), read once and reread from the Gallery (`#gEpi`). It changes no scene, ending or share card, so the graph walk never sees it (graph `epilogue` proves all 15 lines exist and are distinct; evaluator `epilogue` drives the phone). Erasing memories clears it. **Store screenshots:** `node games/kudbee-abyss/tools/store-shots.mjs` renders six captioned screens (lock, a thread, Notes, the phone's App Store, the Gallery, the epilogue) as 1320x2868 JPEGs into `assets/store/` (the App Store's 6.9\" size) for a listing, a post or a press kit; the game never loads them. Re-run it when a screen changes; the evaluator block `store-shots` checks all six exist at that size. They are made from a save with no fall ending, because a fall scars the glass with cracks that read as a glitch in store art.
**Graphics (Abyss):** `ABY.Perf` (top of `scene.js`, pure) steps the 3D down a tier (0 full, 1 lite, 2 minimal) when a 60-frame window averages over 26 ms, ignoring the first 90 frames and any gap over 250 ms; it never steps back up in a session. Lite = pixel ratio 1.25, half the shards, no motes; minimal = pixel ratio 1, no shards, every other frame. Settings > Graphics is Auto / Full / Lite (`gfx`, `gfxTier` saved). Evaluator `graphics`; the render path was checked once against a real three.js build (`.pbtest/q3d.mjs`) since the 3D cache is absent in this sandbox.
**Music box (third hard rite):** `ABY.RITES.box` (Day Six, offered once from `d6_sorrel`, `box_done`): a waltz with a chord on every first beat (26 chords, 100 notes, step 0.26, win 0.68, fall 1.05); `hard-rites` (graph) now proves all three hard rites are faster than every plain rite, chord-fair and optional; evaluator `hard-rite-box` plays it with the bot and screenshots mid-song at 844x390.
**Confidences and holders (Abyss, endings untouched):** story added as inert memories: five warm-bond `cf_*` confidences (`thread: 'confide'`, offered by `req.bond`) and five earlier holders behind `hold_hub` (`thread: 'holders'`, opened from `d4_wake`). Every choice is `bat: 0`, with no `add`, light, clue or gate, one once-only `tt_*` flag, and returns to the scene she left, so the graph checks `confidences` and `holders` can prove no ending moves. Two traps found by the walk: (1) landing on a `dark: true` scene costs +1 dread (unless the torch is on), so an inert return must go to a scene that is not dark; (2) a bond-gated entry must sit where a warm flag already exists (Wren's are set during Day Five, so hers is on `d5_dawn`, not the wake). Keep these `tt_*` flags out of the graph walk's key (`READ`), or the state space multiplies.
- **Objects (Abyss):** `ABY.OBJECTS` (3: salt, a child's crayon, a cursed sliver of mirror) are plain flags, no engine state: a pickup is a choice on an early scene that loops back to it with `set: 'has_<id>'` and `req: { noflag: 'has_<id>' }` (offered once); the use is a choice on a later day with `req: { flag: 'has_<id>', noflag: 'used_<id>' }` and `set: 'used_<id>'`; carried = `has_` and not `used_` (`ABY.carried(state)`), shown in Pulse as a Pocket (`.rl.pocket`, the cursed one red with a skull). Each use is remembered by someone on the next wake (`n_obj_*` in `ABY.OVERNIGHT`). Salt: Day Two stairs -> Day Five `d5_hang`; crayon: Day Three `d3_photo` -> Day Six `d6_wall`; mirror: Day Two `d2_clock` -> Day Six `d6_room` (+1 resolve, +2 dread). Keep it at three (the cap is the list itself) and add every `has_`/`used_` flag to the walk's `READ`. A call scene keeps exactly Answer / Decline (graph `calls-must-be-answered`), so never hang a use on one. Graph: `objects`; evaluator: `objects-carried-and-spent`.
- **Codas (Abyss):** the way to grow the story without touching an ending, a Gallery tile or a share card. `ABY.CODAS` (71, at least two per ending) are last words from the people she met, `{ id, end, req: { flag }, who, text }`; when an ending scene is reached they arrive as typed messages from their contacts (`ABY.codasFor(id, state)`, at most `ABY.CODA_MAX` = 2, in list order) while Messages is still on screen, then a 2.4s beat, then the gate and the memory card, whose text is still the ending's own. Order matters: put the strongest coda for an ending first. A coda's flag must be set on a reached scene from which that ending can still be reached (following choices, rite results, a slip's return and a good ending's carry); a blackout coda only needs a Day One flag. Graph: `codas`; evaluator: `codas-close-the-ending`.
- **Detours and second sight (Abyss):** the other two ways to grow the story without new endings. `ABY.DETOURS` (6, one a day from Day Two to Day Seven) are pairs of scenes `dt_dN_a`/`dt_dN_b`, built from data: the origin (`from`) gets a choice with `req: { noflag: 'dt_dN' }`, `_a`'s choices lead to `_b`, and every `_b` choice returns to the origin with `set: 'dt_dN'` (offered once; its flag stays out of the walk's `READ`). A detour never reaches an ending, call, rite or slip, and pays only in stats. `ABY.SECOND_SIGHT` (16) are lines added before a scene's own text on later journeys, for `echo_<good ending>`, `scar_<fall>` or `min: { mem }`; they ride `ABY.overnightFor`. Never put one on a scene she can come back to (a flashlight loop, a slip origin, a detour origin) or it is said twice. Graph: `detours`, `second-sight`; evaluator: `detours-return-once`, `second-sight-remembers`.
- **App Store (Abyss):** the phone's shop (`ABY.STORE`, 12 listings, nothing is bought) reads only what is kept on the phone, never a journey's state, so it adds nothing to the story or the graph walk. A listing opens by `key`: `{ found: N }` endings, one ending `{ end }` (a fall too), or one pinned deduction `{ link }`; a key that is not a count needs a `hint`, shown in quotes while it is locked. Its page is a header (stars averaged over the reviews she can read), the blurb, `lore`, then `reviews` (`{ who, stars, text, key? }`); a review with a `key` is shown only once she has earned it, marked "because you were there", and the rest are counted as sealed. Pure helpers: `ABY.storeHas(meta, key)`, `ABY.storeOpen(meta)`, `ABY.storeReviews(meta, id)` with `meta = { found, deduced }`. What she has seen is saved as `stSeen`: a listing opened by an ending or a deduction puts a badge on the icon and, 4.6s later (after the banner that event raised), a banner naming it; a save from before `stSeen` existed counts everything already open as seen. Graph: `store-data`, `store-depth`; evaluator: `app-store`, `store-listings-know-you`, `store-banner-waits`.
- **Abyss is an app on a real phone too:** `manifest.webmanifest` (id `/games/kudbee-abyss/`, `display: standalone`, icons and three portrait store screenshots in `assets/app/`, all rendered from the game by `node games/kudbee-abyss/tools/app-assets.mjs`: the icon is the Eye cropped from `assets/world/abyss-eye.webp`), the iPhone tags (`apple-touch-icon` 180, an `apple-touch-startup-image` per current iPhone size rendered from the power-on screen so a home-screen launch never flashes white (`LAUNCH` in the asset tool), `apple-mobile-web-app-capable`, `black-translucent` status bar, title Abyss) and `sw.js` (`aby-vN`: network-first for the page and code, cache-first for pictures, the site's two fonts and the pinned three.js, which is kept with its CORS response so the page's SRI still checks it; no CDN at install means offline is 2D). An install card tops the phone's own App Store (`installRow`, `canInstall`: touch screens, second visit on via `visits`, not inside the installed app, not once `install` is 1): Android gets the kept `beforeinstallprompt`, iPhone a sheet with Safari's three taps, which says plainly that the home-screen app keeps its own memories (iOS gives it separate storage). Every evaluator context from `open()` blocks service workers, because a route cannot see what a worker fetches; the `installable` block has its own contexts (`app-manifest`, `plays-offline`, `install-card`). Re-run the asset tool and bump `V` in `sw.js` when the art or the screens change. Settings also has an About block (where her data goes: nowhere) and What's New (`RELEASES` in game.js, newest first, one entry per player-facing release from what actually shipped; add to it with each such change; evaluator `whats-new`).
- **App whispers (Abyss):** the one place the App Store touches a journey, and only as a voice. Each installed app sets `app_<id>` at the start of a journey (`ABY.newState(mem, open, found, apps)`, `ABY.appsOf`; `cleanState` keeps them), and installing one mid-journey adds it to the day she is in and its dawn (`G.state`, `G.cp`). `ABY.APP_WHISPERS` (one per listing) ride `ABY.overnightFor`: the app speaks once, as itself (speaker `APP_<ID>`, its name, colour and glyph in the contact header), on a Day Two to Day Seven scene she cannot come back to; Lantern sits on a dark scene with `noLight`, whose only loop switches the light on. `fx` is how it arrives (`flicker` = the torch stutters, `ring` = an old call, `glitch`). No choice, stat or ending may read an `app_` flag: graph `app-whispers` proves it by replaying 1,500 seeded journeys with every app and with none (identical choices, scenes and endings). The dark-scene hint is not one of a scene's messages (`DARK_HINT`): counting it in `deliver`'s `done` used to swallow the first one (evaluator `dark-scene-keeps-its-text`). Evaluator: `apps-reach-the-night`. **App clues:** four whispers also file a clue (`note: 'a_<app>'`, hush / smile / party / cast) that is one half of a deduction's second pair (`alt` in `ABY.LINKS`, matched by `ABY.linkOf`): the app stands in for a clue her journey missed (the call from her own number, Vey's key, the door that smelled of candles, the flashback of the lock), so it opens a deduction that already exists, never a new scene, choice or ending. Pick a clue to stand in for only where it is really missable: Redial and Ledger were dropped because every way to their deduction files the original anyway. Graph `app-clues` searches from real reached states standing where the app speaks *without* the original clue, steered by `toward` (to the clue it pairs with, then to the deduction's scene), and must reach the hidden choice; the whisper replay strips `a_` notes along with `app_` flags. Evaluator: `apps-leave-clues`. **The credit:** pinning a deduction with an app's clue records `helped[linkId] = app` in `kudbee.abyss.v2` (`ABY.helpedBy(a, b)`, `ABY.clueApp(note)`). The deduction's card in Notes says "<app> showed you this", the ending card of that journey says "<app> helped you see it: <deduction>" (`#eCredit`, from `credits(G.state)` taken in `finale()` before the run is cleared), and the app's own App Store page opens a review keyed `{ helped: '<app>' }` (`ABY.STORE_KEYS`). Like the whispers, it is shown and never read by the story (graph `app-credit`; evaluator `apps-get-the-credit`).
- **Haptics (Abyss):** `ABY.Audio.buzz(p)` takes a number or an `[on, off, on, ...]` pattern in ms and is the only place the Vibration switch is enforced (`ABY.Audio.hapOn`, kept in step by game.js `syncHap()`), because the flute rites call it directly. `ABY.Audio.hap` scales the buzzes (never the gaps) by the Settings strength (Light 0.6 / Normal 1 / Strong 1.6, saved as `hapLv`). Patterns follow the story: a message lands as a heartbeat once dread is 2+ (`pulse()`), calls shake in a pattern that grows with `ring`, a fall ends in a slow fade, a miss in the rites stumbles. iPhone Safari has no `navigator.vibrate`: on an iPhone user agent a hidden `<input type=checkbox switch>` is clicked inside the tap (a tick on iOS 17.4+; a timer-driven buzz does nothing there). Real-device feel is a manual gate (Android Chrome for the patterns, iPhone Safari for the tick). Evaluator: `vibration-*` spy on `navigator.vibrate`.
- **Scares and dread** (game.js `scare()`, `corrupt()`, `ambient()`): jump = shake + flash + sting + haptic; glitch = RGB split + jitter + noise; whisper = status-bar flicker + breath; eye = red pulse + sub-bass; blackout = black screen "0%". At dread >= 4 the screen glitches by itself and her words corrupt for a moment; at >= 5 strangers text ("you left the door open"); the vignette, shard colour and camera jitter follow dread (`--dread` on `#screen`, `Scene.setDread`). `prefers-reduced-motion` keeps sound and a soft red pulse but drops shakes.
- **Rotate.** A real phone turns by itself (container queries). On a desktop the bezel is portrait; the **Rotate** button (or the R key) lays it on its side (`#device.land`, `P.setOrient`, saved). Wide = scene left / chat right; tall = chat sheet under the scene. Turning mid-game keeps the scene, replies and 3D size (`phone-turns-mid-game`).
- **Rites (Day Three, owner: "more games like Guitar Hero / KUDBEERIFF, really haunting").** A story node with `song: '<id>'` plays a rhythm rite from `ABY.RITES` (`doors`, `blood`, `lull`; three lanes, win at 60%) and routes by `songNext: { win, fail, give }`; each rite is bounded by `ABY.MAX_SONG_TRIES` (3) then offers `give`. The haunting (door, crack, flash, blood, knock, scream, drip, dark, whisper; `Song.haunt` / `dress` in `src/song.js`, sounds in `fx.js`) is dressing only: it never changes what must be hit, so a rite stays fair and the graph test (`rites-bounded`) can prove it. A new rite is chart data plus a node; no new engine code.
- **First run and the home pages.** The lock-screen note carries reply chips (`replies` on a note, rendered as `.nrep` buttons; tapping one sets `G.autoPick` and opens Messages, which sends that choice once the guide is dismissed); a first run shows the 5-step `#guide` card (`G.guided`, saved) when no ending has been found; Home has a second page `#home2` (endings dots, badges, rank, faction) reached by swiping (`hswipe` in `phone.js`: no pointer capture, the click after a swipe is swallowed for 350 ms, `touch-action: pan-y` on both pages) or the arrow keys. The evaluator starts every other flow past the guide (`open()` pre-saves `guided`; `open({ guide: true })` keeps the first run).
- **After editing the story** run `npm run abyss:graph` (about 2 min; it gives node an 8 GB heap, because the walk outgrew node's default and runs out of memory under a bare `node games/kudbee-abyss/eval/graph.mjs`; the fast eval runs the same walk as one of its blocks): it proves, for every possible state, that each scene has an always-available choice and that those reach an ending (no dead ends, never stuck in a loop), and by a bounded search that every scene and all endings are reachable (the walk starts from all ten openings with `mem` 10 and carries endings with a way on into the next day; each day has its own queue and the walk takes from them in turn, so seven days share the budget; a scene or gated choice still unreached is chased by a follow-up walk from real reached states that hold its flags, merged on just those flags; a structural check proves the true ending is gated on `mem`), the blackout and hollowing are reachable and recoverable, and gated choices can be unlocked. **Compute reachable stat maxima before setting a threshold; make every gated choice reachable (a recharge option that can never be reached is dead content); a dead phone cannot toggle its flashlight.** The full state space is too big to enumerate (millions); do not add unbounded state.
- **Gate: `npm run abyss:eval`** (graph checks + Playwright: the bezel, lock swipe, home, typing dots, status bar, banner + badge, the endings played by tapping replies, the horror systems (scare, flashlight + battery, dark scenes, clues, calls, photos, dread, blackout, hollowing, the new endings), rotate and turning mid-game, the song by touch / key / bot, practice, Gallery, Pulse, Settings, phone fit on three phones, notch, hostile saves, no-3D / no-WebGL, hidden tab, reduced motion, share). three.js is fetched once into `eval/.cache/` (curl) and its hash is checked against the page's `integrity`, so the run also proves the SRI hash. No network: the 3D checks skip.
- **Faster Abyss runs:** the evaluator is a list of named blocks (`await block('name', async () => { ... })`); each opens its own browser contexts. `ONLY=settings,vibration npm run abyss:eval` runs just those blocks (seconds; the loop while building). `npm run abyss:eval:fast` (`eval/parallel.mjs`) runs every block once, spread over 4 processes (`SHARDS=n` to change), longest first by the last run's times (`node_modules/.cache/abyss-eval-times.json`): 166/166 in ~4.5 min instead of ~25, the same checks. Only the `graph` block walks the story, so two walks never run at once. A block that throws is recorded as `block-<name>` FAIL and the others still run. A new test block must be wrapped in `block()` with a unique name, and must not read variables another block set (`ctx`/`pg` are shared only by reassignment). Run the full single-process `npm run abyss:eval` when a change touches the evaluator's shared helpers.
- **The world behind her** is `assets/world/abyss-city.webp` (owner-supplied painting, 1600px): a far plane in `scene.js` with slow parallax, tinted by the mood; it is the home-screen wallpaper (the Queen fades to a ghost via `setStage('wall', 0.1)`) and shows around the Queen's feathered edges in the chat. `assets/world/abyss-city-corrupt.webp` (the same city with the red eye) fades in whenever the mood is `dark` (Guardian's first appearance, the crown, a failed song) with a breathing eye, and the shards turn red. `assets/world/abyss-stairs.webp` (the stairway to the eye, owner-supplied) is the world of mood `throne` (she takes the crown; the Crown of Shadows ending): signal 0, the art ghosted over it. A missing image just leaves the nebula; the no-WebGL picture fallback layers the Queen over it.
- **Phone first.** Targets >= 44px, text >= 11.5px, safe areas via `env()` (`--sl/--sr/--st/--sb`); the scene's `setStage('chat' | 'wall', dim)` keeps the art clear of the chat sheet; if the 3D library or WebGL is missing the picture fallback still runs the whole phone.
- Gotchas: a `hidden` attribute loses to any `display:` rule (`[hidden]{display:none !important}`); `setPointerCapture` on a parent swallows the click on its child buttons (the swipe handlers listen on `window`); an infinite transform animation makes a button "not stable" for tests (animate opacity only); Enter pressed to skip typing also clicks a focused chip (press it only while `ABY.game.delivering`).
- Test hooks that must stay: `ABY.debug.goto(id, patch)` / `.tick(dt)`, `ABY.Song.bot` / `.rate` / `.laneX`, `ABY.debug.frames()`, `ABY.game.{state,delivering,found,saved}`, `ABY.Phone.{screen,show}`, `ABY.Scene.{focus,camera,drawCalls}`.
- **Sharing (owner: "metadata shows images, with progress sharing").** `src/share.js` paints a 1200x630 card from the game's own art (world painting + the Queen on a phone lock screen + ending name + "N of 5 endings found"); the in-phone **Share screen** (opened from the ending memory, the Gallery and Pulse) previews it and offers the native sheet **with the PNG attached**, X, Facebook, WhatsApp, copy link and save image. Every share links to a landing page `s/<slug>/` (dawn, song, echo, silence, crown, progress) whose og:image is the same card without the personal count, so a pasted link unfurls with a picture. `node games/kudbee-abyss/tools/share-cards.mjs` renders `assets/og/abyss/<slug>.jpg`, the landing pages and the game page card `assets/og/abyss.jpg`; **bump `VER` in that tool and the `?v=` on the page's og:image whenever a card changes** (X / iMessage / Facebook cache cards for days). Share the canonical URL, never `location`. Cards only go live once the branch is on `main`.
- Not yet: a real-device check (iPhone Safari + Android Chrome: WebGL cost, audio unlock, touch lanes, safe areas, the native share sheet with an image), the static cards use a fallback font (the generator cannot load Google Fonts offline; the in-game cards use Space Grotesk), more apps (Camera, Notes), ending art beyond the one painting.

## Pinball physics rules (`games/kudbee-pinball/index.html`)

Stuck-ball reports are almost always a **physics bug, not a missing rescue**. Before adding geometry nudges or another "FREED" timer, reproduce with `window.__kbTest.simulate(x, y, vx, vy, secs)` (returns `maxStill`, `freed`, `where`, `touch`) and scan the table. Invariants (full rationale: `docs/CONTINUITY.md` 2026-09-26, DBZ-079):

- **Swept TOI** (`sweptSeg`): a ball already touching a surface is a hit only if moving *into* it. Never return the exit root.
- **Friction is Coulomb** (tangential impulse ≤ `fric · normal impulse`); never a per-step %-of-speed cut.
- **Contact normal** = capsule normal (closest point → ball); round at end caps. No −velocity normals.
- **Clearances** the ball must pass: ≥30px surface-to-surface (ball Ø28). Guides end *on* flipper pivots, never cross them.
- **Rescues** (`gutterT`, `flipBandT`) are last resort: ≥1s, and never while a flipper is held (cradling).
- **Launching is a plug-in:** `games/kudbee-pinball/launcher.js` (`KBLauncher.create(host)`) owns serve, lane hold, charge, plunger, climb, crest + skill shot, weak-plunge recapture, the in-lane power column and the touch overlay. The game passes hooks (score, sfx, burst…); don't re-add launch logic to `index.html`.
- **Multiball jackpots are a plug-in:** `games/kudbee-pinball/jackpot.js` (`KBJackpot.create(host)`) watches `multiballActive` itself (edge-detected inside `jackpot.update(h)`, called from `physStep`, not `frame()` — that keeps it deterministic and testable without a real rAF loop, same reason `launcher.update()` lives there). The three ramps light for escalating Jackpots during multiball; collecting all three lights SUPER JACKPOT (any ramp, big payout, relights the round). Two call sites only: `jackpot.hitCenter()` in `onRamp`, `jackpot.hitSide(r.side)` in `onSideRamp`. Announcements reuse the existing `callout()` banner — never add a second on-screen banner for the same event, the HUD is crowded enough during multiball.
- **Shooter lane holds one ball.** Plunger code finds it with `laneBall()` — never `balls[0]` (during multiball the lane ball is rarely first). Locks serve a lane ball only when nothing else is live and the lane is empty (`serveAfterLock`); otherwise the saucer kicks the ball back out.
- **Frame loop must catch up to real time** (step cap 15 = the 50ms dt cap). A cap of 5 only keeps pace at a steady 60fps; iOS Low Power Mode (30fps rAF) ran the game at half speed.
- **Round apexes are unstable** (`apexRoll`): a ball dead-centre on a post/cap/target top is tipped off, never balanced.
- Lower geo is gated: drain 1430, flip **py 1300 / len 150**. There are no outlanes or kickbacks: each outer funnel runs onto its flipper pivot, and the funnel meets the flipper's top surface (offset 13px along its normal) so there is no ledge. Pivot x / rest angle may move to keep the center drain open (~34px clear).