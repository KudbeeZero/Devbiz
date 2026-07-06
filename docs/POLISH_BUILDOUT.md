# Kudbee Polish Build-Out — the 12-Lane Program

> **Owner directive (2026-07-06):** polish the redesigned site — architecture, SEO,
> optimization, and design fidelity. **No redesign.** The cinematic long-scroll
> `index.html` shipped on PR **#109** (`claude/personal-website-redesign-yd2a3y`,
> ledger `DBZ-047`) is the visual and structural baseline; every lane below makes
> it faster, more discoverable, more accessible, or more impressive — never
> different.
>
> **Execution model:** this document is the architecture. Each lane is scoped so a
> **Sonnet** session (`claude-sonnet-5`) can execute it end-to-end without
> re-deriving context. Kick off a lane by starting a session on its branch with the
> kickoff prompt at the end of its spec.

---

## Ground rules (every lane, no exceptions)

1. **Read first:** `CLAUDE.md`, this doc's own lane section, and every file you
   touch, before editing. The baseline `index.html` is ~2,200 lines — read the
   region you're changing, not just grep hits.
2. **No redesign.** Keep the Deep Lab language: bg `#05050a`, cyan `#39e6ff` →
   violet `#6f5bff` → magenta `#c46bff`, green `#7cffb2`, Space Grotesk + Inter,
   glass panels, existing section order. Polish fidelity, don't change identity.
3. **Zero-build stays.** Single-file-first, vanilla JS, no frameworks, no
   bundlers, no CDN dependencies. Shared code goes in `assets/` (Cloudflare
   serves the repo root).
4. **Motion is gated.** Everything animated must respect
   `prefers-reduced-motion`, be rAF-driven, pause off-screen
   (IntersectionObserver), and hold 60 FPS on mid-range mobile. Content must
   read with JS disabled.
5. **Truth only.** No fabricated stats, schema for features that don't exist,
   or sitemap entries for missing URLs (Doctrine §C).
6. **Owner gates hold.** No payment enabling, no AI/API keys, no production env
   changes, no merges. `PAYMENT_LIVE` stays `false`. Lead/waitlist endpoints
   stay empty until the owner supplies them.
7. **One lane = one branch = one draft PR.** Branch from `main` (after #109
   lands). Use the exact branch name in the lane spec. Draft PR, §10 closeout
   format, §7 green-status language ("expected green is not green").
8. **Verify before claiming done.** Minimum bar for every lane:
   `node --check` on every inline script block, JSON-LD parses, and a real
   Chromium pass (Playwright is preinstalled) at 1440px and 390px with **zero
   console/page errors**, plus a reduced-motion render. Screenshot the result.
9. **Found but not changed:** unrelated issues go in the PR body in the §9
   format — never fixed in-lane.

## Order & parallelization

```
Wave 1 (foundation, parallel-safe): 01-seo · 02-performance · 03-a11y
Wave 2 (motion system first):       04-motion-tokens → 05-hero-atmosphere
Wave 3 (section polish, parallel):  06-work-cases · 07-arcade-juice · 08-agent-ux · 09-conversion
Wave 4 (system + wow):              10-shared-tokens → 11-exhibit
Wave 5 (last, always):              12-launch-qa
```

Waves 1 and 3 lanes touch disjoint regions and can run as parallel Sonnet
sessions; still rebase before opening the PR. 04 must land before 05 (05
consumes the motion tokens). 10 must land before 11 (11 consumes the shared
assets). 12 runs last because it locks CI around everything prior.

---

## Lane specs

### DBZ-048 · Lane 01 — SEO & structured-data truth pass
**Branch:** `claude/polish-01-seo` · **Lane:** feature (SEO) · **Depends:** #109 merged

**Goal:** the one-page site is fully, honestly indexable by search engines and LLMs.

**In scope**
- `sitemap.xml`: regenerate against files that actually exist (index + games +
  tools + clients + blog + brain + ship-it + lab). Remove dead URLs, add real ones.
- `robots.txt`: verify fencing still matches intent (private surfaces stay fenced).
- `llms.txt`: rewrite to describe the new one-page structure, section anchors,
  games, tools, pricing.
- `index.html` JSON-LD: add `BreadcrumbList` (section anchors) and an `ItemList`
  of the six games; verify every schema claim is real (no SearchAction — there is
  no search).
- OG image: capture a real 1200×630 screenshot of the new hero (Playwright),
  commit as `assets/og/home.jpg`, point `og:image`/`twitter:image` at it.
- Meta description / titles pass for sub-surfaces that have placeholder metadata.

**Out of scope:** canonical domain flip (owner-gated, see DBZ-042 HOLD), content rewrites.

**Acceptance criteria**
- Every sitemap URL returns 200 on a local static serve; every JSON-LD block
  validates (parse + schema.org lint); OG image is a real render of the live hero.
- Lighthouse SEO = 100 locally.

**Kickoff prompt (paste into a Sonnet session):**
> Read `CLAUDE.md`, then `docs/POLISH_BUILDOUT.md` lane DBZ-048. Execute exactly
> that scope on branch `claude/polish-01-seo` (create from latest `main`).
> Follow the doc's Ground Rules, verify per rule 8 plus the lane's acceptance
> criteria, push, open a draft PR with the §10 closeout, and update nothing else.

---

### DBZ-049 · Lane 02 — Performance & Core Web Vitals
**Branch:** `claude/polish-02-performance` · **Lane:** feature (perf) · **Depends:** #109 merged

**Goal:** measurably faster: LCP < 2.0s, CLS < 0.02, 60 FPS scroll on mobile.

**In scope**
- Fonts: self-host Space Grotesk + Inter subsets in `assets/fonts/` (woff2,
  `font-display: swap`, preload the two critical weights); drop the Google
  Fonts round-trip.
- Images: responsive `srcset`/`sizes` + AVIF/WebP (with JPG fallback) for
  `assets/work/*.jpg` and the Contra hero background; explicit width/height
  everywhere (CLS zero).
- Hero canvas: replace the O(n²) link pass with a spatial-grid neighbor check;
  cap DPR at 1.5 on `hardwareConcurrency <= 4`; pause when tab hidden
  (`visibilitychange`).
- Audit every scroll listener is rAF-throttled + passive; every canvas is
  IntersectionObserver-gated (they should be — verify, don't assume).
- Defer non-critical work to `requestIdleCallback` where safe.

**Out of scope:** visual changes of any kind; service workers (separate decision).

**Acceptance criteria**
- Lighthouse (desktop + mobile emulation) Performance ≥ 95, CLS < 0.02;
  before/after numbers recorded in the PR body.
- No visible rendering difference at 1440/768/390 widths (screenshot diff).

**Kickoff prompt:**
> Read `CLAUDE.md`, then `docs/POLISH_BUILDOUT.md` lane DBZ-049. Execute exactly
> that scope on branch `claude/polish-02-performance` (create from latest
> `main`). Record before/after Lighthouse numbers in the PR body. Follow Ground
> Rules, verify per rule 8, push, open a draft PR with the §10 closeout.

---

### DBZ-050 · Lane 03 — Accessibility hardening
**Branch:** `claude/polish-03-a11y` · **Lane:** a11y · **Depends:** #109 merged

**Goal:** the cinematic site is fully usable by keyboard and screen reader (the
v1 site had this — DBZ-034; the redesign must match or beat it).

**In scope**
- Skip-to-content link; logical heading hierarchy audit (one h1, ordered h2/h3).
- Mobile drawer: restore the full dialog pattern — focus moves in on open,
  restores on close, background set `inert`, `aria-expanded`/`aria-modal`,
  Escape closes (Escape exists; the focus/inert work does not).
- Checkbox-hack controls (`label[for="nav-open"]`): keyboard-operable with
  `role`/`tabindex`/Enter/Space (pattern from v1, see DBZ-034).
- Every decorative canvas confirmed `aria-hidden`; meaningful imagery gets alt
  text; agent chat log announces politely (verify `aria-live` behavior).
- Contrast pass on `--dim` (#7b8299) text against its actual backgrounds; fix
  to AA where it fails.
- Axe-core run (via Playwright) — finish with zero serious/critical violations.

**Out of scope:** visual restyling beyond contrast-driven tweaks.

**Acceptance criteria:** axe clean (serious+critical = 0); full keyboard
walkthrough documented in the PR (tab order, drawer, chat, terminal, form).

**Kickoff prompt:**
> Read `CLAUDE.md`, then `docs/POLISH_BUILDOUT.md` lane DBZ-050. Execute exactly
> that scope on branch `claude/polish-03-a11y` (create from latest `main`).
> Run axe-core via Playwright and include the summary in the PR body. Follow
> Ground Rules, verify per rule 8, push, open a draft PR with the §10 closeout.

---

### DBZ-051 · Lane 04 — Motion design tokens (north-star Phase A completion)
**Branch:** `claude/polish-04-motion-tokens` · **Lane:** feature (motion) · **Depends:** #109 merged

**Goal:** one coherent motion system instead of per-effect magic numbers —
the reusable engine `docs/cinematic-ui-north-star.md` §10 Phase A calls for.

**In scope**
- Define motion tokens as CSS custom properties (`--mo-dur-1..4`,
  `--mo-ease-out/in-out/spring`, `--mo-stagger-1..3`) and refactor every
  transition/animation in `index.html` to use them.
- Extract the reveal/stagger/counter/marquee/magnetic/tilt primitives into
  `assets/kudbee-motion.css` + `assets/kudbee-motion.js` (loaded with `defer`,
  progressive enhancement — index keeps working if the file 404s).
- Add `animation-timeline: view()` progressive enhancement for reveals where
  supported, keeping the IntersectionObserver fallback.
- Unify scroll-linked effects (nav hide, ghost parallax, stack recede) on one
  shared rAF scroll bus instead of three listeners.

**Out of scope:** new visual effects (that's lane 05); touching sub-pages (lane 10).

**Acceptance criteria:** zero behavior change at the user level (before/after
screenshots + interaction videos match); all motion constants flow from tokens;
reduced-motion still kills everything.

**Kickoff prompt:**
> Read `CLAUDE.md`, `docs/cinematic-ui-north-star.md` §3/§8, then
> `docs/POLISH_BUILDOUT.md` lane DBZ-051. Execute exactly that scope on branch
> `claude/polish-04-motion-tokens` (create from latest `main`). Behavior must
> not change — prove it with before/after captures. Follow Ground Rules, verify
> per rule 8, push, open a draft PR with the §10 closeout.

---

### DBZ-052 · Lane 05 — Hero & atmosphere fidelity
**Branch:** `claude/polish-05-hero-atmosphere` · **Lane:** feature (visual) · **Depends:** DBZ-051

**Goal:** the first five seconds feel unmistakably premium — same design, higher fidelity.

**In scope**
- Particle field: 2–3 depth layers with parallax response, occasional
  shooting-spark, color-mixed links (cyan→violet along the line), smoother
  pointer gravity (spring easing).
- Aurora: per-section hue bias (home cyan-violet → games green bias → agents
  magenta bias) driven by scroll position, subtle.
- Hero exit choreography: title/sub/CTAs ease up + fade slightly as you scroll
  away (scroll-linked, composite-only transforms).
- Preloader: tighten to a signature moment (logo mask wipe), still ≤ 1.2s and
  session-once.
- Section lighting: soft top-glow on each section as it enters (the "lit
  exhibit" note from the north star §2).

**Out of scope:** layout, copy, section order; WebGL (only if the owner asks).

**Acceptance criteria:** 60 FPS scroll trace on 4x-CPU-throttled Chrome; all new
motion uses lane-04 tokens; reduced-motion serves the static composition.

**Kickoff prompt:**
> Read `CLAUDE.md`, `docs/cinematic-ui-north-star.md` §2–3, then
> `docs/POLISH_BUILDOUT.md` lane DBZ-052. Execute exactly that scope on branch
> `claude/polish-05-hero-atmosphere` (create from latest `main` — requires
> lane 04 merged). Record a performance trace. Follow Ground Rules, verify per
> rule 8, push, open a draft PR with the §10 closeout.

---

### DBZ-053 · Lane 06 — Work section case-study depth
**Branch:** `claude/polish-06-work-cases` · **Lane:** feature (content/visual) · **Depends:** #109 merged

**Goal:** the two client cases read like agency case studies, not cards.

**In scope**
- Device-frame presentation: browser-chrome frame around `modernmed.jpg` /
  `lagrange.jpg` with a subtle scroll-on-hover pan of the screenshot.
- Truthful fact chips per case (stack, deliverables, year) — from
  `docs/CLIENT_SITES.md`; nothing invented.
- Mini-grid: live favicon/wordmark treatment per tool, consistent scene art,
  "opens in new tab" affordance.
- Receipts row: tighten into a quote-mark editorial treatment.

**Out of scope:** new case studies, testimonials from unverifiable sources.

**Acceptance criteria:** hover/focus parity (keyboard gets the same reveal);
images stay CLS-zero; copy verified against `docs/CLIENT_SITES.md`.

**Kickoff prompt:**
> Read `CLAUDE.md`, `docs/CLIENT_SITES.md`, then `docs/POLISH_BUILDOUT.md` lane
> DBZ-053. Execute exactly that scope on branch `claude/polish-06-work-cases`
> (create from latest `main`). Follow Ground Rules, verify per rule 8, push,
> open a draft PR with the §10 closeout.

---

### DBZ-054 · Lane 07 — Games arcade juice
**Branch:** `claude/polish-07-arcade-juice` · **Lane:** feature (games) · **Depends:** #109 merged

**Goal:** the arcade section feels alive — like standing in front of running cabinets.

**In scope**
- Animate the six scene-painter thumbnails: subtle rAF loops (darts reticle
  pulse, riff notes falling, pinball ball drift, voidrunner starfield drift,
  contra bolt flicker) — IntersectionObserver-gated, one shared ticker,
  static frame under reduced-motion.
- CRT hover treatment on game cards (scanline + slight bloom, CSS-only).
- Per-title accent theming (border/glow picks up each game's palette).
- League banner: pull top-3 scores from the existing leaderboard endpoint if
  it's publicly readable; otherwise keep static copy (no new backend).

**Out of scope:** game engine changes, new games, iframe embeds on the home page.

**Acceptance criteria:** scroll stays 60 FPS with all six thumbnails animating
(profile it); total added JS < 6 KB; reduced-motion = current static art.

**Kickoff prompt:**
> Read `CLAUDE.md`, then `docs/POLISH_BUILDOUT.md` lane DBZ-054. Execute exactly
> that scope on branch `claude/polish-07-arcade-juice` (create from latest
> `main`). Profile scrolling with all thumbnails live. Follow Ground Rules,
> verify per rule 8, push, open a draft PR with the §10 closeout.

---

### DBZ-055 · Lane 08 — Agent & terminal experience
**Branch:** `claude/polish-08-agent-ux` · **Lane:** feature (AI UX) · **Depends:** #109 merged

**Goal:** the live agent is the site's proof-of-craft — make talking to it feel great.

**In scope**
- Message entrance animations (slide/fade per lane-04 tokens), smarter
  auto-scroll (don't yank if the user scrolled up).
- KB upgrades: token-overlap scoring → add simple stemming + typo tolerance
  (Levenshtein ≤ 1 on keywords); 6–10 new KB entries (pricing detail, process,
  lab, league, doctrine articles); multi-intent answers.
- Terminal: `kudbee help`, `kudbee list`, `kudbee open <slug>` typed commands
  (real input, local only); install animation polish; command history (↑).
- Wire the existing `LEAD_ENDPOINT` / `WAITLIST_ENDPOINT` seams to read from
  one config block at the top of the file (owner pastes URLs in one place —
  ties into DBZ-039/DBZ-040; endpoints themselves stay empty).

**Out of scope:** any backend, API keys, model calls (owner-gated; the
`window.KUDBEE_AGENT_URL` seam already exists — don't touch it).

**Acceptance criteria:** scripted Playwright conversation (5 varied questions,
including one typo'd) returns relevant answers with working deep-link buttons;
terminal commands work by keyboard.

**Kickoff prompt:**
> Read `CLAUDE.md`, then `docs/POLISH_BUILDOUT.md` lane DBZ-055. Execute exactly
> that scope on branch `claude/polish-08-agent-ux` (create from latest `main`).
> Include the scripted-conversation transcript in the PR body. Follow Ground
> Rules, verify per rule 8, push, open a draft PR with the §10 closeout.

---

### DBZ-056 · Lane 09 — Conversion & contact polish
**Branch:** `claude/polish-09-conversion` · **Lane:** feature (conversion) · **Depends:** #109 merged

**Goal:** every visitor who's ready to buy finds a frictionless next step.

**In scope**
- Contact form: inline validation states, honest success state (mailto flow
  explained before click), field focus polish; keep the no-backend truthfulness.
- Floating "Start a project" pill that appears after the services section and
  hides near the contact section (dismissable, session-remembered).
- FAQ: grow to 6–8 real questions (pricing range, revisions, timelines, AI
  training format, game licensing) — answers must be defensible.
- Pricing cards: per-card hover emphasis + "what happens next" microcopy under
  the CTA.

**Out of scope:** pricing *changes* (owner-only §11), analytics/trackers,
payment of any kind.

**Acceptance criteria:** form usable with keyboard + screen reader; pill never
overlaps content at 390px; all new copy factual.

**Kickoff prompt:**
> Read `CLAUDE.md`, then `docs/POLISH_BUILDOUT.md` lane DBZ-056. Execute exactly
> that scope on branch `claude/polish-09-conversion` (create from latest
> `main`). Do not alter prices. Follow Ground Rules, verify per rule 8, push,
> open a draft PR with the §10 closeout.

---

### DBZ-057 · Lane 10 — Shared Deep Lab chrome for sub-surfaces
**Branch:** `claude/polish-10-shared-tokens` · **Lane:** infrastructure · **Depends:** DBZ-051

**Goal:** leaving the home page no longer feels like leaving the brand.

**In scope**
- Extract shared design tokens to `assets/kudbee-ui.css` (colors, type scale,
  buttons, panel/border/glow recipes) — sourced from the new `index.html`.
- Apply *chrome only* (tokens + nav/footer treatment + background) to the hub
  pages: `blog/index.html`, `brain/index.html`, `ship-it/index.html`,
  `lab/index.html`, `tools/*/index.html` headers. Content and layout of those
  pages stay as-is.
- Consistent back-to-home affordance on every sub-surface.

**Out of scope:** redesigning any sub-page; touching game engines; client sites
(`clients/*` keep their own brands, by design).

**Acceptance criteria:** side-by-side screenshots of each hub before/after;
zero layout breakage (link-check + render pass on every touched page);
`index.html` unaffected.

**Kickoff prompt:**
> Read `CLAUDE.md`, then `docs/POLISH_BUILDOUT.md` lane DBZ-057. Execute exactly
> that scope on branch `claude/polish-10-shared-tokens` (create from latest
> `main` — requires lane 04 merged). Chrome only — do not redesign sub-pages.
> Follow Ground Rules, verify per rule 8 on every touched page, push, open a
> draft PR with the §10 closeout.

---

### DBZ-058 · Lane 11 — Museum exhibit prototype (north-star Phase B)
**Branch:** `claude/polish-11-exhibit` · **Lane:** feature (flagship) · **Depends:** DBZ-051, DBZ-057

**Goal:** the one premium "wow" the north star greenlit: a single high-polish
exhibit that proves the museum format.

**In scope**
- One vertical-slice exhibit page at `museum/kudbee-contra/` (strongest
  candidate; owner may swap the subject before kickoff): artifact frame,
  narrative beats, status badge, **simulated read-only proof timeline**
  (idea → agent runs → proof created → receipt → shipped), "Enter exhibit"
  moment, Deep Lab treatment throughout.
- Exhibit data model: a small JS/JSON structure (`museum/exhibits.js`) driving
  the exhibit so future ones are data, not hand-builds (north star §8).
- A single tasteful entry point on the home page (Work section footer link —
  no new nav item without owner OK).

**Out of scope:** a full `/museum` section (that's Phase C, gated on this lane's
quality bar); wallets, chains, live proof — **everything labeled simulated**.

**Acceptance criteria:** the exhibit clears the north-star quality bar ("more
curated, cinematic, and immersive than a portfolio") in the owner's browser —
this lane always ends `MANUAL_CHECK`; reduced-motion/no-JS tells the full story
as plain content.

**Kickoff prompt:**
> Read `CLAUDE.md`, all of `docs/cinematic-ui-north-star.md`, then
> `docs/POLISH_BUILDOUT.md` lane DBZ-058. Execute exactly that scope on branch
> `claude/polish-11-exhibit` (create from latest `main` — requires lanes 04 and
> 10 merged). Everything proof-related is simulated and labeled as such. Follow
> Ground Rules, verify per rule 8, push, open a draft PR with the §10 closeout,
> status `MANUAL_CHECK`.

---

### DBZ-059 · Lane 12 — Launch QA & CI hardening
**Branch:** `claude/polish-12-launch-qa` · **Lane:** CI/tests · **Depends:** all prior lanes landed (or explicitly skipped by the owner)

**Goal:** the polish program is locked in by automated checks, not memory.

**In scope**
- Playwright smoke suite in CI (`.github/workflows/quality.yml` job): home
  renders with zero console errors at 1440/390, sticky pin engages, agent
  answers a canned question, reduced-motion renders content — advisory
  (`continue-on-error`) first, per the DBZ-032 precedent.
- Lighthouse CI budget check (perf ≥ 90, SEO = 100, a11y ≥ 95) — advisory first.
- `.htmlhintrc` tightening for the new markup; extend the lychee link check to
  the new anchors.
- `404.html` polish in the site's language (small, on-brand, links home).
- Cross-browser manual-gate checklist (Safari/Firefox/iOS) written into the PR
  for the owner.

**Out of scope:** making checks required/blocking (owner promotes them later);
deploy config changes.

**Acceptance criteria:** new CI jobs green on the PR itself; a deliberate
console-error injection on a scratch branch makes the smoke job fail (prove the
tests can fail); checklist delivered.

**Kickoff prompt:**
> Read `CLAUDE.md`, `.github/workflows/quality.yml`, then
> `docs/POLISH_BUILDOUT.md` lane DBZ-059. Execute exactly that scope on branch
> `claude/polish-12-launch-qa` (create from latest `main`, after the other
> polish lanes land). Prove the smoke test can fail. Follow Ground Rules, push,
> open a draft PR with the §10 closeout.

---

## Program-level notes

- **Ledger:** rows DBZ-047 (the redesign PR #109) and DBZ-048..059 (these lanes,
  `PLAN`) are registered in `docs/BUILD_LEDGER.md`. Each Sonnet session flips its
  own row `PLAN → BUILDING → DRAFT → AWAITING_AUDIT` on a docs commit inside its
  lane's PR? **No** — ledger flips ride separate docs/process commits per
  CLAUDE.md; in practice: the owner (or a docs session) batches status flips.
  Sonnet sessions report status in their PR closeouts and leave the ledger alone.
- **Relationship to the existing improvement program** (`docs/BUILD_PLAN.md`,
  DBZ-037..046): lanes 08/09 here polish the *front-end seams* of DBZ-039/040
  (lead + waitlist capture) without wiring endpoints; DBZ-042 (domain) stays
  HOLD and is intentionally absent here; the Ship-it lanes (DBZ-043..046) are a
  separate program and untouched.
- **Merging:** every lane ends at owner review. No agent merges anything (§5).
