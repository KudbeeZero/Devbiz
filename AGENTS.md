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
- Test hooks: `window.__kbTest` (pinball), `window.RIFF` (riff), `window.PINBALL` (pinball) for headless verification

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
- Lower geo is gated: drain 1430, kick 1382–1426, flip **py 1300 / len 150**. Pivot x / rest angle may move to keep the center drain open (~34px clear).