# Build Ledger

A lightweight tracking system so every PR, phase, and active work lane has a
**numbered ID**, a **clear status**, and an explicit **owner approval state**.

It exists to reduce confusion about what is ready to merge, what is waiting,
what is blocked, and what must not be touched. It complements — does not replace
— the workflow rules in [`PR_FLOW.md`](PR_FLOW.md) and the condensed copy in
[`../CLAUDE.md`](../CLAUDE.md).

> **Process doc only.** This file tracks state; it does not change app code, CI,
> workflows, package files, or feature behavior.

---

## Numbering system

Every work item gets exactly **one ID**, using a per-project prefix:

| Prefix | Project |
|---|---|
| `DBZ-###` | Devbiz |
| `GV-###` | GrowVerse |
| `REC-###` | Recorded It |
| `BOOM-###` | BOOMSKI / Copy Snap |
| `FR-###` | Frontier |
| `INFRA-###` | Cross-project infrastructure |

IDs are stable and never reused. Where a PR number exists, the convention is to
align the ledger number with it for readability (e.g. `DBZ-012` ↔ PR #12), but
the ID is internal and independent — items can exist before a PR is opened
(`PR: N/A`).

Example: `DBZ-012 — Coverage Dashboard / PR #12`

---

## Status labels

Use **only** these labels:

| Label | Meaning |
|---|---|
| `PLAN` | Scope/spec being defined. No branch or code yet (or plan PR only). |
| `BUILDING` | Active development in progress on a branch. |
| `DRAFT` | Draft PR open; scope still being checked; no merge expectation. |
| `AWAITING_AUDIT` | Scope frozen; checks documented; ready for review/audit. |
| `MANUAL_CHECK` | Blocked on a manual gate (browser/preview/wallet/payment/API key/deploy). |
| `APPROVED` | Meets the merge-readiness rule; cleared to merge by the owner. |
| `MERGED` | Merged to the target branch; lane closed. |
| `HOLD` | Intentionally parked by the owner; do not advance. |
| `FIX_FIRST` | A specific change must land before it can progress. |
| `BLOCKED` | Blocked by an external dependency or another item. |

---

## Ledger

| ID | Repo | PR | Branch | Lane | Status | Gate | Next Owner Action | Notes |
|---|---|---|---|---|---|---|---|---|
| DBZ-079 | Devbiz | #180 | `claude/pinball-ball-physics-8khnuy` | bugfix | `DRAFT` | Manual browser play-test on preview | Play-test rolling / center drain / cradle; approve merge | **Pinball stuck-ball root causes (collision physics):** swept-TOI exit-root freeze on walls, per-step friction drag → Coulomb, −v̂ / flat end-cap normals → capsule normal; center drain opened (pivots 305/635, py 1300 / len 150 kept); guide/target/post V-pockets removed; rescues ≥1s, off while a flipper is held. Stuck scan 2566 → 58 (`__kbTest.simulate`). Evaluator 21/21 + leaderboard 105/105, local passed, no CI configured. Docs: CONTINUITY 2026-09-26, AGENTS.md pinball physics rules. Owner-directed docs in the same PR. |
| DBZ-060 | Devbiz | #145 | (merged) | CI/tests | `MERGED` | — | None | **Coverage-gate flake — fixed, merged 2026-07-17 (run `29582241815`, `success`).** Two independent bugs stacked: (1) `leaderboard/shared/auth.js` genuinely had several thin/conditionally-exercised branches (`frontendApiFromPublishableKey()`, `issuerFromEnv()`'s `CLERK_PUBLISHABLE_KEY` fallback, `resolveAuth()`'s ALGO-failure catch fallthrough, `getKey()`'s JWKS-TTL cache) — fixed with real deterministic tests (`leaderboard/test/{auth,core,http}.test.js` new, `algo-auth.test.js` hardened), raising `leaderboard/shared/**` coverage 87.98%→95.85% lines/statements (confirmed stable across 5 fresh runs). (2) Deeper bug, found *after* step 1's fix still failed CI: `coverage:snapshot -- --check` did an exact `JSON.stringify` match against the committed dashboard snapshot, but branch-coverage counts are genuinely nondeterministic run-to-run at the **integer** level (reproduced: `total.branches.total` measured 267/268/269 across 3 back-to-back identical runs — real V8/c8 instrumentation jitter on the Promise-heavy auth code, not a rounding artifact or a test-quality gap). No amount of test coverage can make an inherently-jittery metric byte-match a fixed snapshot. Fixed `leaderboard/scripts/coverage-snapshot.mjs`'s `--check` to bucket branches to a 5-point tolerance (whole-number rounding alone still flipped near x.5 boundaries — reproduced 3/10 stale failures before widening) while keeping lines/statements/functions at 1-point (never drifted in 30+ runs); raw `counts` excluded from the check entirely. Verified 20/20 pass across a genuinely-fresh (not cached) coverage+check loop, with branches still visibly jittering 89.51–89.59% during those runs. **Confirmed green on GitHub Actions itself** (both push- and pull_request-triggered runs of the job, not just local) as of commit `c1fb668`. Merged 2026-07-17 after owner authorized option A to recover main's green (the docs Green Gate commit had briefly turned `main` red at 87.98% < 88% threshold; PR #145 restored 95.85%).maining step. |
| DBZ-061 | Devbiz | #168 | `kilo/lucky-wire-mfi` | feature | `MERGED` | — | None | **Pinball Phase 4 — Online Leaderboard Integration**: Pinball metric catalog in `leaderboard/shared/core.js` (score, bestMultiball, modesCompleted); full SDK integration in `games/kudbee-pinball/index.html` with game-over overlay UI, demo mode works immediately. Local verification passed (launch→play state, syntax clean). Pinball now matches Riff/Riff-2 as "SDK-wired" in GAMES_STUDIO_ROADMAP.md. Merged 2026-09-21 after owner approval. |
| DBZ-063 | Devbiz | #167 | (owner) | feature | `MERGED` | — | None | **Kudbee Abyss — Interactive 3D Story (Phase 1)**: Three.js scene, branching choices, preloader, chapter map, save/resume, stats, reduced-motion support. Owner PR. Merged 2026-09-21. |
| DBZ-078 | Devbiz | N/A | `cursor/games-roadmap-status-2a63` | docs/process | `MERGED` | — | None | **`GAMES_STUDIO_ROADMAP.md`:** Phases B/C marked done on `main`; remaining gap = Worker deploy only. Local passed (`npm run pinball:eval` 21/21), no CI configured. |
| DBZ-077 | Devbiz | N/A | `cursor/root-readme-sync-2a63` | docs/process | `MERGED` | — | None | **Root README sync:** studio index → `games/README.md`, local verify/coverage wording (no CI), replace stale Baton/PR#4 block with `docs/` pointers. Local passed (`npm run test:leaderboard`), no CI configured. |
| DBZ-076 | Devbiz | N/A | `cursor/pinball-readme-2a63` | docs/process | `MERGED` | — | None | **Pinball player README** (Starbreak controls, LB, link to eval rubric); `games/README.md` index updated. Local passed (`npm run pinball:eval` 21/21), no CI configured. |
| DBZ-075 | Devbiz | N/A | `cursor/riff-readme-2a63` | docs/process | `MERGED` | — | None | **Riff + Riff II READMEs** (play, controls, leaderboard); `games/README.md` links updated. Local passed (`npm run pinball:eval` 21/21), no CI configured. |
| DBZ-074 | Devbiz | N/A | `cursor/games-readme-studio-2a63` | docs/process | `MERGED` | — | None | **`games/README.md` studio index:** all 9 titles, verify commands, LB note; **CLAUDE.md** §7b cites `npm run verify`. Local passed (`npm run pinball:eval` 21/21), no CI configured. |
| DBZ-073 | Devbiz | N/A | `cursor/voidrunner-readme-agents-2a63` | docs/process | `MERGED` | — | None | **Voidrunner README** (play, controls, leaderboard); **AGENTS.md** games LB table synced with roadmap. Local passed (`npm run verify`), no CI configured. |
| DBZ-072 | Devbiz | N/A | `cursor/riff-lb-post-queue-2a63` | bugfix | `MERGED` | — | None | **Riff / riff-2 — LB post queue:** `lbPostQueued` + `lbBooting`; “Post my score” before `KDLeaderboard.create()` resolves now flushes instead of showing offline. Roadmap table synced (all 9 SDK-wired). Local passed (`npm run verify`), no CI configured. |
| DBZ-071 | Devbiz | N/A | `cursor/games-lb-post-queue-2a63` | bugfix | `MERGED` | — | None | **Munch / puzzles / orbital — LB post queue:** `lbPending` snapshot + `lbBooting` guard; flush pending metrics when SDK boots (first game-over race, same pattern as darts/voidrunner). Contra unchanged (recursive `_lbPost`). Local passed (`npm run verify`), no CI configured. |
| INFRA-003 | Devbiz | N/A | `cursor/infra-verify-script-2a63` | infrastructure | `MERGED` | — | None | **`npm run verify`:** chains `pinball:eval` (21/21) + `test:leaderboard` (105 tests). README documents verify first. Merged `a19d47d` 2026-09-25. Local passed, no CI configured. |
| INFRA-002 | Devbiz | N/A | `cursor/infra-local-scripts-2a63` | infrastructure | `MERGED` | — | None | **Root local verify scripts:** `package.json` → `npm run pinball:eval` (21-check Playwright rubric), `npm run test:leaderboard`. Documented in README + AGENTS.md. Merged `7f42fe5` 2026-09-25. Local passed, no CI configured. |
| DBZ-070 | Devbiz | N/A | `cursor/pinball-eval-launch-fallback-2a63` | CI/tests | `MERGED` | — | None | **Pinball evaluator 21/21 rubric:** `solar-sail-mission` (DBZ-067 mission C), launch harness stability + `prepBall` fallback for headless plunger flake (`cb9c090`). Prior commits `02f93e4`, `6352f3b`. Local passed, no CI configured. Merged 2026-09-25. |
| DBZ-069 | Devbiz | N/A | `cursor/pinball-nudge-eval-2a63` | CI/tests | `MERGED` | — | None | **Pinball evaluator — `nudge-impulse` rubric (20/20):** `__kbTest.nudgeImpulseTest()` guards DBZ-067 straight nudge. Merged `966806d` 2026-09-25. Local passed, no CI configured. |
| DBZ-066 | Devbiz | N/A | `cursor/pinball-flipper-gutter-2a63` (ff stack) | bugfix | `MERGED` | — | None | **Pinball playability restore (post #179 overlap):** Reverted shortened flippers / raised drain “cage”; full lower table (drain 1430, kick 1382–1426, flip py 1300 len 150); right gutter TOI slide + peel/rail; skill-drop `enterFromLane` + crest inject; flipper-band / gutter unstuck (`gutterT`, `flipBandT`). Evaluator **18/18** (`games/kudbee-pinball/eval/evaluator.mjs`). Fast-forwarded to `main` at `8d80634` (2026-09-25). Local passed, no CI configured. Online leaderboard still degrades on static host (`API_BASE: ''` → `/api/leaderboard` 404) — infra lane, not gameplay. |
| DBZ-067 | Devbiz | N/A | `52f1dab` | bugfix | `MERGED` | — | None | **Pinball — Physics & Logic Hardening**: Fix missionC ReferenceError (add Solar Sail mission); swept collision hitT=0 stuck-ball fix; speed cap after sub-steps; ArrowUp/W nudge per spec; superLocks atomic addSuperLock(); vortex mid-capture race fix; ball-vs-ball restitution (0.6). Rubric at merge was 16 checks; current gate **20/20** (see DBZ-066 stack + DBZ-069). Local passed, no CI configured. Merged 2026-09-25. |
| DBZ-065 | Devbiz | N/A | `kilo/fix-ball-save-bumper-stuck` | bugfix | `MERGED` | — | None | **Pinball Phase 2+ — Skill Shots + Physics Bug Fixes**: Fix skill shot lane mapping (was inverted), ball stuck in lane after skill shot, STARBREAK undefined missionA/B/C variables, colorWash RGB clamping (>255 invalid CSS), saveT not cleared on wizard mode end, STARBREAK wizardKickMult + WIZARD_DURATION constant, explicit bumper cd:0 initialization. Evaluator: 14/14 pass (local passed, no CI configured). Merged 2026-09-25 after owner request. |
| DBZ-068 | Devbiz | N/A | `cursor/voidrunner-lb-queue-2a63` | bugfix | `MERGED` | — | None | **Voidrunner — cloud post queue after SDK boot**: `commitScore` cleared `pendingScore` before `KDLeaderboard.create()` finished; snapshot metrics + `lbPendingCloud` flush (on `main` after `929f92e` SDK merge). Tip `4876000`. Local passed, no CI configured. |
| DBZ-064 | Devbiz | #170 | `claude/darts-leaderboard-wiring` | feature | `MERGED` | — | None | **Darts Phase B.2 — Online Leaderboard SDK on `main`**: `KD_LB_CONFIG` + SDK in `index.html`; `_lbInit`/`_lbPostMatch` in `game.js` (rating, bestCheckout, total180s, wins, bestStreak). Follow-up **`95d174c`**: queue post until SDK boots (first-match race). README Leaderboard section updated. Demo mode; LIVE post needs Worker/`API_BASE`. Local passed, no CI configured. Merged via ff to `main` 2026-09-25 (PR #170 may remain open/closed separately). |
| DBZ-059 | Devbiz | #123 | (merged) | CI/tests | `MERGED` | — | Manual gate: Safari/Firefox/iOS cross-browser pass (checklist in PR #123) | **Polish L12 — Launch QA**: Playwright smoke + Lighthouse budget in CI (advisory, confirmed green on GitHub Actions run 28813438482), htmlhint `alt-require`, `404.html`, `robots.txt` `/tests/` fencing. Merged 2026-07-06. |
| DBZ-058 | Devbiz | #122 | (merged) | feature | `MERGED` | — | None | **Polish L11 — Museum exhibit prototype** (north-star Phase B): `museum/kudbee-contra/` — device-frame artifact, simulated read-only proof timeline (every simulated stage labeled, persistent "no wallet/mint/chain" banner), `museum/exhibits.js` data model, one Work-section entry link. Owner reviewed and merged 2026-07-06 (lane spec's default `MANUAL_CHECK` cleared by that review). |
| DBZ-057 | Devbiz | #121 | (merged) | infrastructure | `MERGED` | — | None | **Polish L10 — Shared Deep Lab chrome**: extracted `assets/kudbee-ui.css` tokens; applied chrome-only to blog/brain/ship-it/lab/tools hubs. Merged 2026-07-06. |
| DBZ-056 | Devbiz | #120 | (merged) | feature | `MERGED` | — | None | **Polish L09 — Conversion**: form validation/success states, floating CTA pill, FAQ depth, pricing-card microcopy. No price changes. Merged 2026-07-06. |
| DBZ-055 | Devbiz | #119 | (merged) | feature | `MERGED` | — | None | **Polish L08 — Agent & terminal UX**: message animations, KB depth + typo tolerance, terminal commands, single endpoint config block (seams for DBZ-039/040, endpoints still empty). Merged 2026-07-06. |
| DBZ-054 | Devbiz | #118 | (merged) | feature | `MERGED` | — | None | **Polish L07 — Arcade juice**: animated game thumbnails (IO-gated shared ticker), CRT hover, per-title theming. Reduced-motion = static art. Merged 2026-07-06. |
| DBZ-053 | Devbiz | #117 | (merged) | feature | `MERGED` | — | None | **Polish L06 — Work case depth**: device-frame case rows, truthful fact chips from `CLIENT_SITES.md`, receipts treatment. Merged 2026-07-06. |
| DBZ-052 | Devbiz | #116 | (merged) | feature | `MERGED` | — | None | **Polish L05 — Hero/atmosphere fidelity**: depth-layered particles, scroll-linked aurora hue bias, hero exit choreography, section lighting. Merged 2026-07-06. |
| DBZ-051 | Devbiz | #115 | (merged) | feature | `MERGED` | — | None | **Polish L04 — Motion tokens** (north-star Phase A completion): CSS motion tokens, extracted `assets/kudbee-motion.css/js`, one rAF scroll bus, view-timeline enhancement. Zero behavior change. Merged 2026-07-06. |
| DBZ-050 | Devbiz | #114 | (merged) | a11y | `MERGED` | — | None | **Polish L03 — A11y hardening**: skip link, drawer focus/inert dialog (match DBZ-034 bar), keyboard-operable controls, contrast AA, canvas aria. Re-verified live 2026-07-07: fresh axe-core run (WCAG2A/AA+2.1A/AA+best-practice) = 0 violations at 1440px and 390px. Merged 2026-07-06. |
| DBZ-049 | Devbiz | #113 | (merged) | feature | `MERGED` | — | None | **Polish L02 — Performance/CWV**: self-hosted fonts, responsive AVIF/WebP images, hero-canvas spatial grid, CLS zero, listener audit. Lighthouse mobile Performance 73→95, CLS 0.06→0. Merged 2026-07-06. |
| DBZ-048 | Devbiz | #112 | (merged) | feature | `MERGED` | — | None | **Polish L01 — SEO truth pass**: sitemap regenerated (23 real URLs), robots.txt fencing extended, llms.txt rewritten, BreadcrumbList + 9-game ItemList JSON-LD, real OG hero screenshot (`assets/og/home.jpg`). No canonical flip (DBZ-042 HOLD). Merged 2026-07-06. Note: OG screenshot predates L05's hero changes and `museum/kudbee-contra/` (added by L11) has no canonical/OG/robots meta or sitemap entry — both minor, logged to BACKLOG.md, not blocking. |
| DBZ-047 | Devbiz | #109 | (merged) | feature | `MERGED` | — | None | **Cinematic long-scroll redesign** of `index.html` (owner-directed): personal voice, scroll storytelling, live agent + store kept. Merged 2026-07-06 — baseline for the 12-lane polish program (`POLISH_BUILDOUT.md`, DBZ-048..059, PR #110 merged same session). |
| DBZ-046 | Devbiz | TBD | `claude/website-improvements-6vwv66` | feature | `PLAN` | Browser preview | Review the Ship-it studio | **D1 Ship-it Phase 4**: convert (book-a-call / export) + agent hand-off + polish. See `BUILD_PLAN.md`. |
| DBZ-045 | Devbiz | TBD | `claude/website-improvements-6vwv66` | feature | `PLAN` | Browser preview | — | **D1 Ship-it Phase 3**: live preview generator (describe business → assembled house-style preview). |
| DBZ-044 | Devbiz | TBD | `claude/website-improvements-6vwv66` | feature | `PLAN` | Browser preview | — | **D1 Ship-it Phase 2**: house-style template system across a few industries. |
| DBZ-043 | Devbiz | TBD | `claude/website-improvements-6vwv66` | feature | `PLAN` | Browser preview | — | **D1 Ship-it Phase 1**: scaffold the self-serve studio page + intake form. |
| DBZ-042 | Devbiz | TBD | `claude/website-improvements-6vwv66` | infra | `HOLD` | Owner buys/points DNS | Pick + point domain | **I1 Domain readiness**: centralize canonical/OG/schema host into one switch; recommend `kudbee.dev`/`.com`. Do NOT flip canonical to a dead domain. |
| DBZ-041 | Devbiz | TBD | `claude/website-improvements-6vwv66` | docs | `PLAN` | — | — | **W3 Path source-of-truth**: documented demo↔production base-path convention + launch checklist so client-site links never 404. |
| DBZ-040 | Devbiz | TBD | `claude/website-improvements-6vwv66` | feature | `PLAN` | Browser preview | — | **I3 Storefront demand capture**: real "notify me / join the list" on the tiny-apps store, before Gumroad goes live. |
| DBZ-039 | Devbiz | TBD | `claude/website-improvements-6vwv66` | feature | `PLAN` | Browser preview | — | **I2 Agent lead-capture**: the Kudbee Agent captures an email/intent (no backend; form-endpoint + mailto fallback). |
| DBZ-038 | Devbiz | TBD | `claude/website-improvements-6vwv66` | feature | `PLAN` | Browser preview | Review nav/IA changes | **W2 Identity focus**: tighten nav/IA so web-design reads as the #1 business; group secondary surfaces. |
| DBZ-037 | Devbiz | TBD | `claude/website-improvements-6vwv66` | content | `PLAN` | Owner confirms stats real | Confirm stats/testimonials | **W1 Honest social proof**: reframe unverified "150+/50+/98%" + named testimonials to defensible claims. |
| DBZ-036 | Devbiz | TBD | `claude/website-improvements-6vwv66` | docs | `BUILDING` | — | Review the plan | **Build program plan** (`docs/BUILD_PLAN.md`) for the improvements/weaknesses/dream-feature loop + this ledger catch-up. Notes PRs #76–#85 merged this session. |
| DBZ-035 | Devbiz | TBD | (merged, branch gone) | docs | `MERGED` | — | None | Third reconciliation: records the 2026-06-20 nav/controls/a11y session — backfills `MERGED` rows DBZ-029..034 and flips DBZ-028 to `MERGED`. Process-only. Confirmed 2026-07-07: its content is already reflected in this ledger and its branch no longer exists remotely. |
| DBZ-034 | Devbiz | #49 | (merged) | a11y | `MERGED` | — | Manual gate: screen-reader pass | Accessibility hardening: CSS-label routing made keyboard-operable (tabindex/role/Enter-Space), `aria-current` on active page, mobile drawer = real dialog (focus move/restore, `inert` background focus trap, `aria-expanded`/`aria-modal`), global `:focus-visible` rings. Merged 2026-06-20. |
| DBZ-033 | Devbiz | #48 | (merged) | feature | `MERGED` | — | Manual gate: mobile touch + Firefox/Safari pass | Controls Phase 3: `.kbd-knob` rotary (SVG gradient arc, drag/wheel/keys, role=slider) + `.kbd-stepper` (number + −/+) + shared `data-kbd-name` link bus, extending `assets/kbd-controls.*`; live showcase at `tools/controls/`. Merged 2026-06-20. |
| DBZ-032 | Devbiz | #47 | (merged) | CI | `MERGED` | — | Promote to required once clean | CI quality guardrails (`.github/workflows/quality.yml`): lychee internal-link check + htmlhint, **advisory/non-blocking** (`continue-on-error`) to start; `.htmlhintrc` + `.lycheeignore`. Merged 2026-06-20. |
| DBZ-031 | Devbiz | #46 | (merged) | infra | `MERGED` | — | None | Favicon: on-brand `favicon.svg` + root `favicon.ico` (PNG-in-ICO) + `apple-touch-icon.png` — kills the site-wide `/favicon.ico` 404. Merged 2026-06-20. |
| DBZ-030 | Devbiz | #45 | (merged) | feature | `MERGED` | — | None | Kudbee Controls Phase 1+2: shared `assets/kbd-controls.*` slider layer (gradient fill, throb glow, value bubble) on lab/grow + lab/music-video; decimal-precision pass on accuracy readouts (darts, coverage). Merged 2026-06-20. |
| DBZ-029 | Devbiz | #44 | (merged) | feature | `MERGED` | — | Manual gate: device feel-check | Nav & wayfinding: real Work-portfolio links, CSS-routed breadcrumb sub-header + `#hash` deep-linking, frosted-glass slide-out mobile drawer, sub-page back-links + leaderboard `/game/` link fix. Merged 2026-06-20. |
| DBZ-028 | Devbiz | #43 | (merged) | docs | `MERGED` | — | None | Second reconciliation: backfilled `MERGED` rows DBZ-020..027, updated spec-doc gating text (PR #20 merged), renamed Focus-Board working IDs `DBZ-00x` -> `CP-00x`, resolved the `prs.json` "this PR" placeholder to #25. Merged 2026-06-20. |
| DBZ-027 | Devbiz | #41 | (merged) | docs | `MERGED` | — | None | Narrowed the `OWNER-OK` token tier in `CLAUDE.md`/`PR_FLOW.md` to irreversible/costly actions only (payments, AI/API keys, token-credit, blockchain, prod env vars). Per owner decision. Merged 2026-06-20. |
| DBZ-026 | Devbiz | #38 | (merged) | feature | `MERGED` | — | Manual gate: browser walkthrough | Grow Companion (`lab/grow/`): animated time-lapse, six illustrated stages, onboarding + day-by-day notification system. Merged 2026-06-20. Owner browser check still open. |
| DBZ-025 | Devbiz | #37 | (merged) | feature | `MERGED` | — | Manual gate: audio-sync feel | Music video FX2: color-shift palette, cannabis-leaf particles, star-to-heart formation, local audio telemetry seam. Merged 2026-06-20. |
| DBZ-024 | Devbiz | #34 | (merged) | feature | `MERGED` | — | Manual gate: audio-sync feel | Audio-reactive music video (`lab/music-video/`) + Studio·Media section. 2.6 MB track committed. Merged 2026-06-20. Owner audio/sync check still open. |
| DBZ-023 | Devbiz | #32 | (merged) | docs | `MERGED` | — | None | Agent Feed Inbox mirror at `docs/agent-feed/inbox/` (7 mirrored + 2 DRAFT placeholders, secret-free). Merged 2026-06-20. Maps to Focus-Board CP-002. |
| DBZ-022 | Devbiz | #31 | (merged) | docs | `MERGED` | — | None | GrowVerse living-plant audit + v1 spec (`lab/ai-command-center/lanes/`). Server-authoritative finding; login-404 root cause. Merged 2026-06-20. |
| DBZ-021 | Devbiz | #30 | (merged) | privacy | `MERGED` | — | Manual gate: verify /lab 404 after Vercel redeploy | `vercel.json` 404s `/lab` + `/lab/*` on the Vercel mirror (Cloudflare host unaffected). Reversible. Merged 2026-06-20. Maps to Focus-Board CP-001. |
| DBZ-020 | Devbiz | #29 | (merged) | docs | `MERGED` | — | None | GrowVerse Vercel-readiness audit (real `next build` verified) + Mission Control lane registration. Merged 2026-06-20. |
| DBZ-019 | Devbiz | #42 | (merged) | docs | `MERGED` | — | None | Post-merge reconciliation: flipped DBZ-017/DBZ-018 to `MERGED` and cleared stale "draft/pending/merge-me" references across the Mission Control data files. Merged 2026-06-20. |
| DBZ-018 | Devbiz | #20 | (merged) | docs | `MERGED` | — | None | Code Lens spec. Owner approved directionally 2026-06-18: name=Code Lens; Phase 2 = deterministic read-only scaffold (no writes/auto-fix/merge); AI deferred behind a provider interface; score advisory (90/75 bands). Spec/plan only — no tool code. See `docs/code-lens-plan.md`. Merged 2026-06-20; Phase 2 scaffold opens as a separate PR. |
| DBZ-017 | Devbiz | #14 | (merged) | docs | `MERGED` | — | None | Ledger reconcile: closed out DBZ-013 (PR #13 merged). Process-only. Merged 2026-06-20. |
| DBZ-016 | Devbiz | TBD | `claude/output-quality-doctrine` | docs | `DRAFT` | Owner review of the doctrine | Review & merge | Output Quality Doctrine added to `CLAUDE.md` (distilled from the June 2026 "Fable 5" system-prompt patterns: capability/verification/honesty over persona). Domain-independent, zero-risk; peeled from DBZ-014 to merge independently. |
| DBZ-014 | Devbiz | #19 | `claude/website-content-animation-u83xbk` | feature | `DRAFT` | Owner browser preview (dive scroll/cursor, routing, reduced-motion) + connect `kudbee.dev` | Connect domain; run browser gate; supply social/OG assets; then mark ready & merge | Homepage upgrade (owner-approved single cohesive PR, multi-lane by exception): content/meta → `kudbee.dev`; interactive underwater "dive"; SEO/AI-readability (JSON-LD, robots/sitemap/llms.txt, `_headers`, `<main>`/aria); robots.txt privacy fencing. Doctrine peeled to DBZ-016. `kudbee.dev` not yet registered; OG image interim; social URLs placeholder; CSP deferred. |
| DBZ-015 | Devbiz | #22 | `claude/cinematic-ui-north-star` | docs | `DRAFT` | Owner review of the North Star vision | Review & merge the North Star doc; then greenlight Phase A Foundation as a separate PR | Cinematic UI North Star (audit + vision, no site code). Owner locked 2026-06-18: Deep Lab primary / Space secondary; one-exhibit-first museum; Phase A Foundation first; proof read-only. See `docs/cinematic-ui-north-star.md`. |
| DBZ-013 | Devbiz | #13 | (merged) | docs | `MERGED` | — | None | This ledger + `CLAUDE.md`/`PR_FLOW.md` references. Process-only. Merged 2026-06-18. |
| DBZ-012 | Devbiz | #12 | `claude/coverage-gate-breakdown-eii751` | coverage | `MANUAL_CHECK` | Owner manual preview review of the breakdown app | Review branch preview; approve merge if correct | CI green, snapshot freshness passing, Cloudflare preview deployed, no unresolved comments. Scope frozen. |
| DBZ-011 | Devbiz | #11 | (merged) | docs | `MERGED` | — | None | Global PR flow rules (`CLAUDE.md` + `docs/PR_FLOW.md`). |
| DBZ-009 | Devbiz | #9 | `claude/prowritingaid-writing-tool-qed9pf` | feature | `AWAITING_AUDIT` | Owner manual preview (passed) | Owner audit / merge decision | Kudbee Scribe writing tool + landing page. CI green; preview reviewed (PASS). AI Worker documented but disabled; private/client-side default. Scope frozen. |
| DBZ-007 | Devbiz | #7 | (merged) | feature | `MERGED` | — | None | 🏆 Online League nav link (top nav, mobile nav, footer). |
| DBZ-006 | Devbiz | #6 | `claude/vellum-ai-research-launch-5f19vn` | feature | `MANUAL_CHECK` | Live `ANTHROPIC_API_KEY` + Worker deploy to verify the agent end-to-end | Review; provide key/deploy or waive to merge in keyless demo mode | **Open, not merged.** Live AI concierge + Kudbee Doctrine page; ships in keyless demo. |
| DBZ-005 | Devbiz | #5 | (merged) | feature | `MERGED` | — | None | Kudbee Darts polish + Dart Workshop, Leaderboard & online Bullseye League. |
| DBZ-004 | Devbiz | #4 | (merged) | feature | `MERGED` | — | None | Token Price Analyzer tool + Tools nav page. |
| DBZ-003 | Devbiz | #3 | (merged) | feature | `MERGED` | — | None | Kudbee Darts game (501 + Cricket, AI leagues). |
| DBZ-002 | Devbiz | #2 | (merged) | feature | `MERGED` | — | None | Simplified mobile touch controls + auto-fire. |
| DBZ-001 | Devbiz | #1 | (merged) | feature | `MERGED` | — | None | Kudbee Games Studio launch: Kudbee Contra + full site redesign. |

> Column definitions — **ID:** internal build number · **Repo:** project ·
> **PR:** PR number or `N/A` · **Branch:** branch name if known · **Lane:** docs,
> feature, infra, CI, coverage, economy, privacy, marketplace, etc. ·
> **Status:** one of the labels above · **Gate:** what must happen before merge ·
> **Next Owner Action:** what the owner must do next · **Notes:** short context.

History for PRs #1–#7 is backfilled above (one row per PR, IDs aligned to PR
numbers). Of that range, **#6 is still open** (`MANUAL_CHECK`) — it is not merged.
Not yet tracked here: merged PRs #8 and #16 (`INFRA-001`) and open PR #10 — add
them on a docs lane if desired.

---

## Approval rule

A review/approval advisor (e.g. ChatGPT) may assess a PR and return exactly one of:

- `APPROVE`
- `HOLD`
- `FIX_FIRST`
- `MANUAL_CHECK_REQUIRED`

**No agent may merge** on the strength of an advisor verdict alone. A merge
happens only when **the owner explicitly authorizes that merge**, or the owner
has stated that the advisor's approval is sufficient **for that specific PR**.
An advisor `APPROVE` is a recommendation, not authorization.

---

## Merge-readiness rule

An item may be marked `APPROVED` only when **all** of the following hold:

1. Scope is frozen.
2. Checks / deploy status are known (not assumed — see the Green Status Rule in
   [`PR_FLOW.md`](PR_FLOW.md#7-green-status-rule)).
3. Manual gates are complete or explicitly waived.
4. No review comments are unresolved.
5. No owner-only decision is pending.
6. No unrelated changes are included.

If any condition fails, the correct status is `AWAITING_AUDIT`, `MANUAL_CHECK`,
`FIX_FIRST`, `HOLD`, or `BLOCKED` — not `APPROVED`.

---

## Closeout rule

When a PR merges:

1. Update its status to `MERGED`.
2. Record the final outcome in **Notes**.
3. Unsubscribe / stand down from watching it, if applicable.
4. **Do not** open follow-up work unless explicitly authorized.

---

## Stale branches (merged, remote-delete blocked)

**Known tooling limitation (discovered 2026-07-07, confirmed repeatedly across sessions):**
this environment's git remote is a local proxy, and `git push origin --delete <branch>`
consistently fails with `HTTP 403` against it — it is not a permissions/auth problem that
retrying fixes. The GitHub MCP server also has **no delete-branch/delete-ref tool** (checked
directly; `create_branch`, `list_branches`, `delete_file`, etc. exist, branch deletion does
not). **There is currently no tool-based path from any agent session in this environment to
delete a remote branch.** Do not retry `git push --delete` more than once per branch — it
will not succeed differently on retry.

**Root-cause fix (owner action, not agent-executable):** enable **"Automatically delete head
branches"** in the repo's GitHub settings (Settings → General → Pull Requests). This makes
every future PR merge self-clean with zero agent action — it's the actual fix, not a
workaround. This has been recommended before (see `PR_FLOW.md`) but as of this writing is
still not confirmed on. Until it's on, every merged branch accumulates here instead of
disappearing.

**What agents should do instead:** after a lane merges (PR-merge or direct fast-forward),
attempt the delete once; if it 403s, add a row below rather than treating it as done or
retrying in a loop. This table is the actual record of "branches that should not exist
anymore" — check it before assuming the branch list is clean, and re-attempt deletion here
first if a future session ever gains a working delete path (a fresh session may have
different git remote permissions — don't assume this limitation is permanent without
checking).

| Branch | Merged via | Date noted | Safe to delete? |
|---|---|---|---|
| `cursor/pinball-full-fix-2a63` | direct fast-forward → main | 2026-09-25 | Yes — fully in `main` |
| `cursor/pinball-main-polish-2a63` | direct fast-forward → main | 2026-09-25 | Yes — fully in `main` |
| `cursor/pinball-flipper-gutter-2a63` | direct fast-forward → main | 2026-09-25 | Yes — fully in `main` |
| `kilo/pinball-bottom-rail-stuck-fixes` | PR #179 → main | 2026-09-25 | Yes — fully in `main` |
| `kilo/fix-ball-save-bumper-stuck` | direct fast-forward → main | 2026-09-25 | Yes — fully in `main` |
| `claude/leaderboard-audit-architecture-r5b2xh` | PR #133 → main | 2026-07-07 | Yes — fully in `main` |
| `claude/abyss-prototype` | PR #167 → main | 2026-09-22 | Yes — fully in `main` |
| `kilo/lucky-wire-mfi` | PR #168 → main | 2026-09-21 | Yes — fully in `main` |
| `claude/games-studio-roadmap` | direct fast-forward → main | 2026-07-07 | Yes — fully in `main` |
| `claude/branch-cleanup-ledger` | direct fast-forward → main | 2026-07-07 | Yes — fully in `main` |
| `claude/coverage-gate-flake-note` | direct fast-forward → main | 2026-07-07 | Yes — fully in `main` |
| `claude/voidrunner-ship-enemies-fx` | PR #135 → main | 2026-07-07 | Yes — fully in `main` |
| `claude/csp-report-only-hsts` | merged → main | 2026-07-07 (backfilled) | Yes — fully in `main` |
| `claude/fix-modernmed-sw-cache` | merged → main | 2026-07-07 (backfilled) | Yes — fully in `main` |
| `claude/game-polish-contra` | merged → main | 2026-07-07 (backfilled) | Yes — fully in `main` |
| `claude/game-polish-darts` | merged → main | 2026-07-07 (backfilled) | Yes — fully in `main` |
| `claude/game-polish-munch` | merged → main | 2026-07-07 (backfilled) | Yes — fully in `main` |
| `claude/game-polish-orbital` | merged → main | 2026-07-07 (backfilled) | Yes — fully in `main` |
| `claude/game-polish-pinball` | merged → main | 2026-07-07 (backfilled) | Yes — fully in `main` |
| `claude/game-polish-puzzles` | merged → main | 2026-07-07 (backfilled) | Yes — fully in `main` |
| `claude/game-polish-riff` | merged → main | 2026-07-07 (backfilled) | Yes — fully in `main` |
| `claude/game-polish-riff-2` | merged → main | 2026-07-07 (backfilled) | Yes — fully in `main` |
| `claude/game-polish-voidrunner` | merged → main | 2026-07-07 (backfilled) | Yes — fully in `main` |
| `claude/github-sentinel-webhook-cache-3hs8ay` | merged → main | 2026-07-07 (backfilled) | Yes — fully in `main` |
| `claude/guitar-hero-combo-research-3asnqb` | merged → main | 2026-07-07 (backfilled) | Yes — fully in `main` |
| `claude/integration` | merged → main | 2026-07-07 (backfilled) | Yes — fully in `main` |
| `claude/personal-website-redesign-yd2a3y` | PR #109 → main | 2026-07-07 (backfilled) | Yes — fully in `main` |
| `claude/polish-01-seo` through `claude/polish-12-launch-qa` (12 branches) | merged → main | 2026-07-07 (backfilled) | Yes — fully in `main` |
| `claude/polish-buildout-plan` | merged → main | 2026-07-07 (backfilled) | Yes — fully in `main` |
| `claude/pr-review-roadmap-2xeeer` | merged → main | 2026-07-07 (backfilled) | Yes — fully in `main` |
| `claude/recording-it-pin-cdn` | merged → main | 2026-07-07 (backfilled) | Yes — fully in `main` |
| `claude/security-xss-hardening` | merged → main | 2026-07-07 (backfilled) | Yes — fully in `main` |
| `claude/shared-engine-core` | merged → main | 2026-07-07 (backfilled) | Yes — fully in `main` |
| `claude/site-audit-games-work` | merged → main | 2026-07-07 (backfilled) | Yes — fully in `main` |
| `claude/voidrunner-boss` | merged → main | 2026-07-07 (backfilled) | Yes — fully in `main` |

"Backfilled" dates mean the branch was already merged and stale before this table existed —
found via `git merge-base --is-ancestor origin/<branch> origin/main` across all remote
branches on 2026-07-07, not merged on that date. New entries should record the actual merge
date. When the owner (or a future session) does gain a working delete path, clear this table
in the same PR/commit that does the deleting — don't let it grow stale in the other
direction.

---

## Updating this ledger

- One row per work item; keep **Notes** to short context, not history.
- Change **Status** only when the real state changes; never use a label outside
  the approved set.
- Adding or editing a row is a docs/process change — keep it on a docs lane and
  out of feature/CI PRs.
