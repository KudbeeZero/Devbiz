# Kudbee Cinematic UI — North Star

> A vision for taking Kudbee from a clean marketing site to a **next-level
> cinematic, blockchain-aware web experience** — a futuristic creative/dev lab
> where every motion **explains, reveals, or proves**, and where projects, tools,
> agents, games, and proof systems live as interactive exhibits.
>
> **Phase 1 = audit + vision only.** This document does not change the site. It
> sets direction so the owner can approve before any code is written.

**Decisions locked in (2026-06-18, owner):**

| Decision | Choice |
|---|---|
| Visual direction | **Deep Lab / bioluminescent (primary)** · Space / observatory (secondary, for proof timelines / orbital receipts / agent + chain confirmations / system maps) · Architectural gallery **deferred** |
| Museum strategy | **Prototype one premium exhibit first**, then graduate to a net-new `/museum` section only if it hits the quality bar. Keep the Work page for browsing/filtering. |
| First implementation unit | **Phase A — Foundation** (after PR #20 merges), then the single exhibit prototype |
| Blockchain / proof | **Read-only / simulated** (proof timeline, receipts, agent logs). No wallet, mint, payments, or chain writes in UI-polish PRs. |
| Engineering | **Zero-build, vanilla, additive.** No framework, no bundler. Progressive enhancement; never break the marketing site. |

---

## 1. Current state (audited 2026-06-18)

- **One file, zero-build.** `index.html` is ~132 KB / ~1790 lines with inline
  `<style>` + `<script>`. Navigation is **CSS-only radio routing** across 8 pages
  (home, services, agents, games, work, contact, tools, scribe) plus an external
  League link. Served by Cloudflare Pages (`wrangler.toml`, `assets = "./"`).
- **Motion today:** ambient mesh-gradient drift (`drift1`/`drift2`), `pageIn`
  fade, a one-shot **IntersectionObserver `.reveal`** system (0.7s, threshold
  0.12), rAF stat-counters, a CSS tech marquee, hover lifts, and **static Canvas
  2D scene painters** (jungle / combat / boss / darts …). **No WebGL, no GSAP, no
  scroll-timeline, no site-level parallax.**
- **A Museum seed already exists:** the **Work** page is a filterable project grid
  (`cat-web` / `cat-ai` / `cat-game`) with canvas thumbnails — the natural
  skeleton to template an exhibit from.
- **Design tokens:** bg `#06060c`; signature gradient cyan `#39e6ff` → violet
  `#6f5bff` → magenta `#c46bff`; green `#7CFFb2`; glow `rgba(111,91,255,.35)`;
  fonts **Space Grotesk** + **Inter**.
- **Gaps to address along the way (pre-existing):** mesh blobs are **not**
  `prefers-reduced-motion` gated; `yourdomain.com` placeholder remains in
  canonical/OG (SEO); no `robots.txt` / `sitemap.xml` / JSON-LD; some low-contrast
  dim text; canvases lack `aria` / text fallbacks.

---

## 2. Visual direction — Deep Lab / bioluminescent

Extend Kudbee's existing distinctive look rather than reskin it.

- **Primary — Deep Lab / bioluminescent.** Near-black depth, glass panels,
  volumetric glow, and the cyan → violet → magenta gradient used as a
  **proof / permission / energy** accent. Layered z-planes, soft parallax, and
  spotlighting make sections feel like **lit exhibits**, not stacked cards.
  Lowest-risk because it builds directly on current tokens and the
  BOOMSKI / proof-layer identity.
- **Secondary — Space / observatory.** Reserved for specific moments:
  **proof timelines, orbital receipts, agent-activity maps, blockchain
  confirmations, system diagrams.** A complementary language, not the main skin.
- **Deferred — Architectural gallery.** Clean, but moves too far from the dark
  Kudbee identity right now. Revisit later if ever.

---

## 3. Motion direction

Rule: every motion must **explain, reveal, or prove** — never decorate.

- **Scroll-reveal, leveled up:** extend the existing IntersectionObserver into
  **staggered, directional reveals** driven by **motion tokens** (duration / easing
  / stagger scales).
- **Pinned "story" moments:** a few `position: sticky` scenes where scrolling
  resolves layers **idea → agent → action → proof → receipt → product**.
- **Living artifacts:** project/exhibit cards gain tilt, status pulse, glow, and a
  small canvas preview — they read as artifacts, not boxes.
- **Technique priority:** CSS transforms + IntersectionObserver + **rAF-gated**
  work first; optional `animation-timeline: view()` **with a fallback**; WebGL
  only for a single hero moment if it clearly earns its weight.

---

## 4. Museum / exhibit concept — "Kudbee Museum"

The Museum is a **premium interactive proof gallery**, not a renamed portfolio.

**Strategy (owner-locked):** prove the format with **one** exhibit before building
a section.

1. Keep the current **Work** page for browsing and filtering.
2. Build **one** high-polish "museum exhibit" vertical slice for the strongest
   project/story (candidates: **Code Lens**, BOOMSKI / proof agents, a flagship
   game).
3. If that exhibit clears the quality bar (more curated, cinematic, and immersive
   than a case-study list), use it as the **template** for a net-new `/museum`
   section.
4. Do **not** fold the whole concept into Work, and do **not** build a full
   `/museum` section yet.

Each exhibit = cinematic **artifact frame** + one-line story + **status badge** +
**proof / receipt** object + action trail + an **"Enter exhibit"** CTA. Future
exhibits: Devbiz, Code Lens, Recording It, Grok Assist, BOOMSKI / proof agents,
Frontier / games.

---

## 5. Blockchain / proof concept (read-only, philosophy-first)

A visible **"Proof You Can See"** timeline as a product *value*, not crypto hype:

`action requested → permission granted → agent runs → proof created → receipt
visible → user controls access`

- Rendered as **simulated proof objects / transaction-style receipt cards** using
  the Space/observatory secondary language.
- **No wallet, no mint, no payments, no chain writes** in any UI-polish PR.
- Any future live integration is **read-only** and clearly fenced behind an
  interface — never introduced inside a visual PR, and an owner-only decision per
  CLAUDE.md §11.

---

## 6. Performance rules

Zero-build preserved · no heavy dependencies · CSS transforms over JS where
possible · IntersectionObserver + rAF gating · WebGL only where it earns it ·
lazy-load with **reserved dimensions** (no CLS) · protect mobile FPS · all primary
content must remain **fully readable with JS / animation disabled**.

---

## 7. Accessibility rules

`prefers-reduced-motion` gates **all** motion (including fixing today's
un-gated mesh) · `aria` / roles + `:focus-visible` on every interactive element ·
complete keyboard paths · contrast fixes for dim text in both themes · canvas
`aria-label` + text fallback · the museum and proof timeline must read as plain
semantic content with effects off.

---

## 8. Suggested tech approach

Stay vanilla and additive. Introduce a small shared motion layer —
`assets/kudbee-motion.css` + `assets/kudbee-motion.js` (Cloudflare serves the repo
root, so shared files are fine; this mirrors the `assets/` direction already in
`mini-apps-plan.md`) — loaded with `defer`, pure progressive enhancement. Express
**motion + visual primitives as CSS custom properties** (durations, easings,
stagger, glass, glow, depth, artifact frame, proof badge, timeline, status pulse).
No framework, no bundler, and the single-file marketing site keeps working
untouched.

---

## 9. Risks

- **SEO placeholder domain** (`yourdomain.com`) — pre-existing; replace before any
  launch push.
- **Reduced-motion gap** on mesh blobs — fix in Phase A.
- **Single-file growth** — favor the shared `assets/` split to keep `index.html`
  manageable.
- **Canvas / WebGL mobile FPS** — budget carefully; prefer CSS/SVG.
- **Scroll-jank / CLS** if rushed — reserve dimensions, gate with rAF.
- **Over-animation** diluting clarity — every effect must justify itself.
- **Museum scope-creep** — the one-exhibit-first rule is the guardrail.
- **Proof misread as live chain** — keep everything labeled read-only / simulated.

---

## 10. Three-phase roadmap

### Phase A — Foundation (first unit, after PR #20 merges)
Safe and additive; makes future pages **easier to make cinematic**, not just one
page look cool. No full visual overhaul.

- Reusable cinematic **motion tokens** (durations / easings / stagger).
- **Reduced-motion-correct** reveal / stagger system (fixes the mesh gap).
- **Exhibit data model** (the shape an exhibit/artifact is described in).
- **Proof / receipt / project exhibit structure** primitives.
- **Performance** guardrails + **accessibility** guardrails baked in.
- Optional one safe **preview/demo surface** to validate the engine — not a
  site-wide overhaul.

### Phase B — One museum exhibit (first "wow")
A single premium exhibit vertical slice built on the Phase A foundation, with the
proof/receipt visual language. No live-chain dependency. Decision gate: does it
clear the quality bar to template a section?

### Phase C — Cinematic expansion
Graduate the exhibit into a net-new `/museum` section, extend the system across
pages, add the interactive proof timeline, optionally add **read-only** wallet /
proof integration later, and harden everything into a reusable **Kudbee motion
design language**.

---

## 11. Open items for the owner

The four direction decisions are locked (top table). Remaining confirmations,
gathered as Phases progress — **none blocking Phase A**:

1. **Exhibit subject** for the Phase B prototype (Code Lens / BOOMSKI proof agents
   / a flagship game?).
2. **Production domain** to replace `yourdomain.com` before any launch push.
3. Whether the Phase A preview/demo surface should be a throwaway page or wired
   into an existing route.

> Per PR_FLOW, each phase ships as its own small, additive, reversible PR. No
> blockchain writes, no secrets, no live API calls in visual-only PRs.
