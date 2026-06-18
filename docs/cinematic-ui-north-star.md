# Kudbee Cinematic UI — North Star

> A vision + roadmap for taking the Kudbee site to a next-level **cinematic,
> blockchain-aware** experience: smooth, premium, technical, trustworthy, and
> alive — a futuristic product lab, not a landing page. Every motion must
> **explain, reveal, or prove**, never just decorate. This is a **vision doc**:
> no site code ships from it. Implementation lands later as small, safe PRs.

**Decisions locked in (2026-06-18, owner-approved):**

| Decision | Choice |
|---|---|
| Visual direction | **Deep Lab / bioluminescent (primary)**; **Space / observatory (secondary)** for proof/system moments; **Architectural gallery deferred** |
| Museum strategy | **Prototype one premium exhibit first** → graduate to a net-new `/museum` section only if it hits the quality bar. Keep the Work page for browsing/filtering. |
| First implementation unit | **Phase A — Foundation** (motion engine + data model + guardrails), greenlit **after PR #20 merges**. Then the exhibit prototype. |
| Blockchain/proof | **Read-only / simulated** only — no wallet, mint, payments, or chain writes in any UI-polish PR. |
| Build constraint | **Zero-build, additive, reversible.** Never break the current marketing site; everything works with animations disabled. |

> **Quality bar:** the Museum must feel **more curated, cinematic, and immersive
> than a portfolio** — an interactive proof gallery, not a renamed case-study list.
> Phase A is the design-engine foundation; the exhibit prototype is the first
> *wow* moment.

---

## 1. Current state (audited 2026-06-18)

- **One file, zero-build.** `index.html` ≈ 132 KB / ~1790 lines, inline
  `<style>` + `<script>`, **CSS-only radio routing** across 8 pages (home,
  services, agents, games, work, contact, tools, scribe) + external League link.
  Served by Cloudflare Pages (`wrangler.toml`, `assets = "./"`).
- **Motion today:** ambient mesh-gradient drift, `pageIn` fade, a one-shot
  **IntersectionObserver `.reveal`** system (threshold 0.12, 0.7s), rAF
  stat-counters, a CSS tech marquee, hover lifts, and **static Canvas 2D scene
  painters** (jungle/combat/boss/darts…). **No WebGL, no GSAP, no scroll-timeline,
  no site-level parallax** (parallax lives only inside the Contra game engine).
- **A Museum seed already exists:** the **Work page** is a filterable project grid
  (`cat-web` / `cat-ai` / `cat-game`) with canvas thumbnails — a natural reference
  point, but per the decision above the Museum is built as a **net-new premium
  exhibit**, not by renaming Work.
- **Design tokens:** bg `#06060c`; signature gradient cyan `#39e6ff` → violet
  `#6f5bff` → magenta `#c46bff`; green `#7CFFb2`; glow `rgba(111,91,255,.35)`;
  Space Grotesk + Inter.
- **Pre-existing gaps to fix along the way (not new work, but in scope to respect):**
  mesh blobs are **not** `prefers-reduced-motion` gated; `yourdomain.com`
  placeholder still in canonical/OG tags; no `robots.txt` / `sitemap.xml` /
  JSON-LD; some low-contrast dim text; canvases lack `aria`/text fallbacks.

---

## 2. Visual direction — Deep Lab / bioluminescent

Extend Kudbee's existing identity rather than reskin it:

- **Primary — Deep Lab / bioluminescent.** Near-black depth (`#06060c`), glass
  panels, volumetric glow, the cyan→violet→magenta gradient used as a
  **"proof / energy" accent** that lights up as actions are verified. Lowest risk;
  builds directly on the current tokens and matches the Kudbee / BOOMSKI /
  proof-layer brand.
- **Secondary — Space / observatory.** Used **only for specific system moments**:
  proof timelines, orbital/receipt artifacts, agent-activity maps, and
  blockchain-confirmation visuals. A flavor, not the whole site.
- **Deferred — Architectural gallery.** Clean, but moves too far from the dark
  identity. Revisit only if the brand direction changes.

Add **depth and light**: layered z-planes, soft parallax, and spotlighting so
sections read as lit exhibits with real hierarchy.

---

## 3. Motion direction

Every motion must **explain, reveal, or prove** — never decorate.

- **Scroll-reveal, leveled up.** Extend the existing IntersectionObserver into
  **staggered, directional reveals** driven by motion tokens (duration / easing /
  stagger scales) — consistent, reusable, reduced-motion-correct.
- **Pinned "story" moments.** A few `position: sticky` scenes where scrolling
  resolves layers in order: **idea → agent → action → proof → receipt → product**.
  The animation *is* the explanation.
- **Living artifacts.** Exhibit cards gain tilt, status pulse, glow, and a tiny
  canvas/SVG preview — they read as artifacts, not boxes.
- **Technique priority:** CSS transforms + IntersectionObserver + **rAF-gated**
  work first; optional `animation-timeline: view()` **with fallback**; WebGL only
  for a single hero moment if it clearly earns its weight.

---

## 4. Museum / exhibit concept — "Kudbee Museum"

**Strategy (locked):** prove the format with **one premium exhibit** before
building a section.

- **Now:** keep the **Work page** as the browse/filter surface, untouched.
- **First build:** one **high-polish vertical-slice exhibit** for the strongest
  project/story — full Deep Lab treatment, artifact frame, narrative, status
  badge, proof/receipt, action trail, and an **"Enter exhibit"** interaction.
- **Then:** if it clears the quality bar, use it as the template for a **net-new
  `/museum` section** with exhibits per project (Devbiz, **Code Lens**, Recording
  It, Grok Assist, BOOMSKI / proof agents, Frontier / games).
- **Anti-goal:** do **not** fold the concept into Work and call it done — the
  Museum must feel like an interactive proof gallery, not a renamed portfolio.

---

## 5. Blockchain / proof concept (read-only, philosophy-first)

A visible **"Proof You Can See"** timeline expressing Kudbee's product philosophy
of verifiable agent actions:

`action requested → permission granted → agent runs → proof created → receipt
visible → user controls access`

- Rendered as **simulated proof objects / transaction-style receipt cards** and
  agent action logs — the Space/observatory flavor fits here.
- **Hard line:** **no wallet, no mint, no payments, no chain writes, no live API**
  in any UI-polish PR. Future live hooks stay fenced behind a clearly separated
  interface, never inside a visual-only change.
- Reads as a **product value** (trust, verifiability), not crypto hype.

---

## 6. Performance rules

Zero-build preserved · no heavy dependencies · CSS transforms over JS where
possible · IntersectionObserver + **rAF gating** for anything per-frame · WebGL
only where it earns it · lazy-load + **reserved dimensions** (no layout shift) ·
protect mobile FPS · the full content story stays readable with **JS and
animations disabled**.

---

## 7. Accessibility rules

`prefers-reduced-motion` gates **all** motion (including today's ungated mesh) ·
`aria` roles + `:focus-visible` on every interactive element · complete keyboard
paths · contrast fixes for dim text in both themes · canvas `aria-label` / text
fallback · the museum and proof timeline must be legible as plain semantic content
with every effect turned off.

---

## 8. Suggested tech approach

Stay **vanilla and additive**. Introduce a small shared motion layer —
`assets/kudbee-motion.css` + `assets/kudbee-motion.js` (Cloudflare serves the repo
root, so shared files load fine; this mirrors the `assets/` idea already in
`docs/mini-apps-plan.md`), loaded with `defer` as pure progressive enhancement.
**Motion tokens** live as CSS custom properties. No framework, no bundler, and the
single-file marketing site keeps working untouched. An **exhibit data model** (a
small JSON/JS structure describing each project's story, status, and proof) drives
the museum so exhibits are data, not hand-built one-offs.

---

## 9. Risks

- **SEO placeholder domain** (`yourdomain.com`) in canonical/OG — pre-existing;
  fix before any public push.
- **Mesh not reduced-motion gated** — accessibility gap to close in Phase A.
- **Single-file growth** — motivates the shared `assets/` split.
- **Canvas / WebGL mobile FPS** — budget carefully; one hero moment max.
- **Scroll-jank / CLS** if rushed — reserve dimensions, test on device.
- **Over-animation** diluting clarity — every effect must justify itself.
- **Museum scope-creep** — the one-exhibit-first rule is the guardrail.
- **Proof misread as live chain** — keep everything labeled read-only / simulated.

What should **stay static/simple:** the marketing routing, the games/tools pages,
and core navigation. Cinematic work concentrates in the **new exhibit** and the
**proof timeline**, not a site-wide rewrite.

---

## 10. Three-phase roadmap

### Phase A — Foundation (first unit, after PR #20 merges)
The reusable **design engine** — makes future pages easy to make cinematic, not
just one page look cool. **No visual overhaul.** Deliverables:
- reusable cinematic **motion tokens** (durations / easings / stagger scales),
- **reduced-motion-correct** reveal/stagger system (and close the mesh gap),
- the **exhibit data model**,
- the **proof / receipt / project exhibit** structure (markup + style primitives:
  glass, glow, depth, artifact frame, proof badge, timeline, status pulse),
- **performance + accessibility guardrails**,
- optionally one **safe preview/demo surface** to validate — not a full overhaul.

### Phase B — One premium exhibit (the first *wow*)
Build a single high-polish museum exhibit on the Phase A foundation, with the
proof/receipt visual language and Deep Lab treatment. No live-chain dependency.
This is the quality-bar test that decides whether the Museum graduates.

### Phase C — Cinematic expansion
If the exhibit lands: extend the system into a net-new `/museum` section, add the
interactive proof timeline across relevant pages, optionally a **read-only**
wallet/proof integration later, and harden everything into a reusable **Kudbee
motion design language**.

---

## 11. Open items for the owner

1. **Strongest first exhibit** — which project gets the premium vertical slice
   (Code Lens, BOOMSKI / proof agents, a game, …)?
2. **Domain** — the real production domain, so SEO/OG placeholders can be fixed
   before any public-facing push.
3. **Phase A start** — confirm kickoff timing (gated on PR #20 merging first).

> Owner-only gates still apply (CLAUDE.md §11): no new lanes, deploys, or any
> blockchain/payment enablement without explicit authorization. This doc enables
> none of that — it sets direction only.
