# Website Pages Audit — 2026-06-27

**Lane:** DBZ-036 (docs) · **Branch:** `claude/website-pages-audit-r59w6n`

A page-by-page review of the Kudbee site: the single-file marketing site
(`index.html`) plus every subdirectory app, cross-checked against the
discoverability files (`sitemap.xml`, `llms.txt`, `robots.txt`).

**Headline:** the site is in good shape. All 9 marketing views are fully built and
most games/tools are complete. The gaps are a handful of intentional "coming soon"
placeholders, a few owner-gated items, two unfinished games, and one real defect
(the sitemap/`llms.txt` omitted three complete games) — **fixed in this PR**.

---

## Inventory

### Fully built & functional — no action needed

**`index.html` — 9 CSS-routed marketing views:**

| View | Status |
|---|---|
| Home | Built — hero, live-agent card (UI preview), stats, media showcase |
| Services | Built — Web / AI Training / Game Dev tabs + pricing tiers |
| Agents (Support Agent Suite) | Built — problem/solution, 6 agent cards, use cases |
| Games | Built — embeds + gallery + dev logs + roadmap |
| Work | Built — filterable portfolio grid |
| Contact | Built UI — form is non-functional (see below) |
| Tools | Built — 2 real tools + 2 "coming soon" cards |
| Scribe | Built — feature hub; Pro/Teams pricing "coming soon" |
| Doctrine | Built — articles + CTA |

Nav, breadcrumb sub-header, and mobile drawer all resolve to real views.

**Games:** Riff & Riff II (fully playable rhythm games), Darts (complete),
Pinball (functional Phase-1 physics prototype).

**Tools:** Token Analyzer, Coverage Dashboard, Kudbee Scribe, Controls Gallery —
all complete, client-side, no backend required.

**Lab** (private, `noindex` + Cloudflare Access gated): hub, two music videos,
AI command center, mission control, grow, aether-wing.

**Leaderboard:** Bullseye League public page (anonymous demo mode by design).

---

## Findings & backlog (ranked)

### P1 — Real defect · FIXED in this PR
**Sitemap & `llms.txt` omitted three complete, public games.**
`games/kudbee-riff/`, `games/kudbee-riff-2/`, and `games/kudbee-pinball/` all exist,
are playable, and are linked from the site footer/nav — but were absent from
`sitemap.xml` and `llms.txt`. Added them (Riff/Riff II at priority 0.9, Pinball
prototype at 0.7). Voidrunner deliberately left out until it is playable.

### P2 — Owner-gated (needs your input/decision; not actioned)
1. **Social links** — X / GitHub / LinkedIn are `href="#"` in the Contact section
   (`index.html:2266-2268`) and footer (`index.html:2541`). A `TODO(owner)` already
   marks them. Needs the real profile URLs — cannot be fabricated.
2. **Contact form** — `index.html:2247` uses `onsubmit="return false;"` and has no
   endpoint. Needs a backend decision: Formspree (zero-build), a Cloudflare Worker
   (matches the stack), or a `mailto:` fallback.
3. **Live AI concierge** (DBZ-006) — homepage concierge ships as a keyless demo.
   Going live needs `ANTHROPIC_API_KEY` + a Worker deploy. **OWNER-OK gated** (API key).
4. **Domain** — `sitemap.xml`/`llms.txt`/meta use `devbiz.kudbee.workers.dev`;
   DBZ-014 plans a move to `kudbee.dev`. A site-wide URL swap should happen as one
   change once the domain is connected.

### P3 — Unfinished games (larger game-dev lanes)
1. **Voidrunner** (`games/kudbee-voidrunner/`) — intro/boot sequence only; the main
   game engine is not built. Needs core gameplay before it is linked/indexed.
2. **Contra** (`games/kudbee-contra/`) — playable scaffold, but the asset pipeline is
   incomplete (`.gitkeep` placeholders in `assets/levels/`, `effects/`, `ui/`,
   `audio/`). Needs the real level/effect/UI/audio assets to ship as a finished title.

### P4 — Intentional placeholders (low priority; leave as-is unless prioritized)
- Tools page: 2 "coming soon" cards (`index.html:2325`, `2331`).
- Scribe pricing: Pro / Teams tiers marked "coming soon" (`index.html:2441`, `2446`).

---

## Closeout

**Asked:** Go through all the website pages and report what needs building/updating;
fix the safe items now.

**Done:** Audited every page (this report). Added the three complete games
(Riff, Riff II, Pinball) to `sitemap.xml` and `llms.txt`. Logged the work as DBZ-036.

**Verified:** `sitemap.xml` parses as well-formed XML; each new URL maps to an existing
`index.html`; Voidrunner confirmed *not* added. (See PR for command output.)

**Needs you:** Decide which P2/P3 items to schedule — social URLs, contact-form
backend, AI concierge key/deploy, domain move, and finishing Voidrunner/Contra.

**Risks / Notes:** This PR bundles a docs lane (the report + ledger) with an SEO/content
lane (sitemap/`llms.txt`) at owner direction; it can be split if preferred. No
owner-gated changes were made.
