# Kudbee Code Lens — Learn-as-You-Build Code Review Tool

> A "code review for coding" companion. You still write and own the code — but as
> you build, Code Lens **explains what each part does**, **offers more options
> grouped by purpose** (SEO, AI crawlers, landing-page intent, accessibility,
> performance), and **flags likely errors with a quality score** so you can
> deliberately push from "good enough" to ~99%. The point isn't to type less; it's
> to *understand more* — to become a visual learner who reads AI's output instead
> of just accepting it.

**Decisions locked in (2026-06-18):**

| Decision | Choice |
|---|---|
| Engine | **Local/deterministic first + opt-in Claude AI later** (the proven Kudbee Scribe pattern) |
| Scope | **Language-agnostic** — HTML is first-class; JS / CSS / JSON / Python and others supported |
| First pass | **Spec / plan PR only** (Phase 1) — no tool code yet, concept approved first |
| Reference inspiration | **Kudbee Scribe** (`tools/kudbee-scribe/`) — privacy-first local analysis + optional AI |
| Name | **Code Lens** (confirmed by owner) |

**Owner directional approval (2026-06-18) — PR #20 approved directionally, with these decisions:**

1. **Name** — keep **Code Lens**.
2. **Scope priority** — **Phase 2 is a deterministic, read-only scaffold first** (see
   §9.1): repo/code map · diff/PR intake · coverage/test signal intake · issue
   taxonomy · report output. **No auto-fixes, no repo writes, no merge automation.**
3. **AI-layer timing** — **defer the AI layer** until the Phase 2 scaffold works on
   deterministic local/sample data. When added it must sit behind a **provider
   interface** with: a mock/fake provider for tests · an env-gated live provider ·
   no client-side secrets · no live-API requirement for CI · no automatic code
   changes from AI output (see §8).
4. **Score thresholds** — **advisory, not blocking.** Bands: **90–100 green** ·
   **75–89 yellow / needs review** · **below 75 red / high attention.** Not
   merge-blocking until real baseline data exists across several PRs (see §7).

---

## 1. Vision / the problem

AI now writes almost everything, and it writes it fast. The cost is silent: you
become a bystander to your own codebase. Code lands in the "90% range" on error
checks instead of 99%, and there's no structured moment where you *learn what just
happened*. You can't review what you don't understand, and you can't push quality
toward 99% if every file is a black box.

Code Lens fixes the learning gap without slowing you down. You paste in what AI
(or you) wrote — say, a `<head>` block — and instead of a silent rewrite, it:

1. **Explains** each part in plain language ("this `<meta name="viewport">` is what
   makes the page scale correctly on phones").
2. **Offers options** you didn't know to ask for, grouped by *why* you'd want them
   ("for AI crawlers, you could add JSON-LD structured data here").
3. **Flags errors and scores quality** so the climb from 90 → 99 is visible and
   actionable, not vibes.

You stay the author. The tool gives understanding and choices — not a forced
rewrite. Do it long enough and you stop re-reading the basics; you *recognize*
them. That's the visual-learner payoff.

---

## 2. The three pillars

### Explain
Paste code → get plain-language annotations at the line/block level. No jargon
walls. Every annotation answers "what does this do, and why is it here?" This is
the read-along layer that turns watching into learning.

### Expand (more options)
The differentiator. For each piece of code, Code Lens surfaces **purpose-grouped
suggestions** — opt-in additions, never forced rewrites:

- **SEO** — title length, meta description, canonical URL, `lang`, social previews.
- **AI crawlers** — schema.org / JSON-LD structured data, `robots` directives,
  `llms.txt` awareness, semantic HTML that machines can parse.
- **Landing-page intent** — clear single CTA, above-the-fold messaging, OG image
  for shares, conversion-oriented structure.
- **Accessibility** — alt text, heading hierarchy, focus states, ARIA where needed.
- **Performance** — `preconnect`, `defer`/`async`, image sizing, font loading.

This is the owner's "it gives you more options within the code" — you see the menu,
you choose what fits the page's actual purpose.

### Detect & score
Flag likely errors and risks (see §6), then roll them into a **Quality Score**
(see §7) — the explicit 90 → 99 mechanic — with a checklist of exactly what's
missing and what each fix is worth.

---

## 3. The learning model

Traditional learning says "retype it until it sticks." That's not how working with
AI actually goes — and it's slow. Code Lens leans on a different model:

- **Annotation builds recognition.** Seeing the *why* next to the code, repeatedly,
  trains pattern recognition. You don't memorize syntax; you learn to read intent.
- **Option-framing builds judgment.** When every suggestion is tagged with a
  purpose, you stop asking "is this right?" and start asking "is this right *for
  what I'm building*?" That's the skill that separates 90% from 99%.
- **Score builds direction.** A number with a breakdown turns "make it better" into
  a concrete, finite checklist. You always know the next best move.

You don't go back and type everything. You think about it differently — and over
enough reps, you become the reviewer instead of the bystander.

---

## 4. Architecture

A net-new standalone tool at **`tools/code-lens/index.html`** — zero-build,
single-file HTML, no framework, no bundler. It reuses the shared Kudbee tool
conventions exactly (see `tools/token-analyzer/` and `tools/kudbee-scribe/`):

- Same `<head>` + fonts (**Space Grotesk** + **Inter** via Google Fonts).
- Same CSS variables (`:root` dark + `.light` theme), `.mesh` ambient gradient
  background, sticky nav with **Back / kudbee logo / tool title / theme toggle**.
- Theme persisted via `localStorage` key `kudbee_theme`.
- Toast notification pattern for copy/feedback.
- Responsive breakpoints at ~900px and ~600px.

The closest structural precedent is **Kudbee Scribe** (`tools/kudbee-scribe/
index.html`): a privacy-first tool that runs all core analysis **locally in the
browser** and offers **optional, opt-in** Claude AI as a "deep" upgrade. Code Lens
mirrors that shape — local engine first, AI as an explicit add-on (see §8).

```
tools/code-lens/
  index.html            Single-file tool: editor pane + findings/score panel + theme/nav
```

---

## 5. UI sketch

Two-pane layout (collapses to stacked on mobile):

- **Left — Editor.** A large paste/type area for code, a detected-language badge,
  and a "Review" action. Sample snippets to try.
- **Right — Lens panel**, three tabs mapping to the pillars:
  - **Explain** — annotated walkthrough of the pasted code.
  - **Options** — purpose-grouped suggestion cards (SEO / AI crawlers / Landing /
    A11y / Perf), each with a copyable snippet and a "why it matters" note.
  - **Score** — the Quality Score ring + category breakdown + missing-items
    checklist.
- A **"Deep Explain with Claude"** button (disabled by default — see §8).

---

## 6. Local heuristic engine (language-agnostic)

Runs entirely client-side. No code leaves the browser.

**Language auto-detect** — HTML / JS / CSS / JSON / Python / other, inferred from
content + simple hints, with a manual override.

**Universal checks** (any language):
- Obvious balance/syntax issues — unclosed tags, unbalanced brackets/quotes.
- `TODO` / `FIXME` / `XXX` markers left in.
- Secret-looking strings (API-key / token shapes) that shouldn't be committed.
- Very long lines and oversized functions/blocks (readability smell).
- Missing error handling around risky patterns (e.g. `fetch`/`JSON.parse` with no
  guard).

**HTML / web deep module** (the richest — matches the owner's `<head>` example):
- **SEO** — `<title>` length, meta description presence/length, canonical link,
  `<meta viewport>`, `<html lang>`.
- **Social** — Open Graph + Twitter card tags, OG image.
- **AI crawlers** — JSON-LD / schema.org structured data, `robots` meta, semantic
  landmarks (`<main>`, `<nav>`, `<article>`), `llms.txt` awareness.
- **Accessibility** — `alt` on images, heading hierarchy (single `<h1>`, no skips),
  labels on inputs.
- **Performance** — `preconnect`/`dns-prefetch`, `defer`/`async` on scripts, image
  width/height, font-display.

**Each finding carries five fields**, which is what makes it a learning tool and
not just a linter:

| Field | Purpose |
|---|---|
| Category | SEO / AI crawlers / Landing / A11y / Perf / Correctness |
| Severity | info / suggestion / warning / error |
| Explanation | Plain-language "what this is" |
| Option | The suggested snippet to add or change (copyable) |
| Why it matters | The learning note — the reason you'd choose it |

---

## 7. Quality Score

A single weighted score (0–100) derived from findings, shown as a ring/number with
a **per-category breakdown** (SEO, A11y, Perf, Correctness, …) so the 90 → 99 climb
is visible and each fix shows what it's worth. The missing-items checklist doubles
as the to-do list.

**Score bands (locked by owner — advisory, not blocking):**

| Band | Range | Meaning |
|---|---|---|
| 🟢 Green | **90–100** | Strong — no high-attention issues |
| 🟡 Yellow | **75–89** | Needs review |
| 🔴 Red | **below 75** | High attention |

**Advisory only.** The score is a coaching signal, **not** a merge gate. It must
**not** become merge-blocking until we have real baseline data across several PRs —
otherwise we'd be tuning thresholds blind. Bands and weights stay adjustable while
that baseline is gathered.

**Honest tradeoff:** the local score is a *heuristic* of best-practice coverage. It
is **not** a guarantee of zero runtime errors — it can't execute the code or know
your intent. It's a directional coach, not a compiler. (The opt-in AI layer in §8
is where deeper, context-aware review comes from.)

---

## 8. Opt-in Claude AI "Deep Explain" — deferred until after Phase 2

**Deferred by owner decision (2026-06-18).** The AI layer is **not** built until the
Phase 2 deterministic scaffold (§9.1) is working end-to-end on local/sample data.
The deterministic engine is the product; AI is an explicit, later upgrade — off by
default, exactly like Kudbee Scribe (`DBZ-009`) and the Vellum concierge (`DBZ-006`).

When AI is added, it **must** sit behind a **provider interface** with these
non-negotiables:

| Requirement | Why |
|---|---|
| **Mock / fake provider for tests** | Tests run with deterministic canned output — no network, no flakiness. |
| **Env-gated live provider** | The real Claude provider activates only when its env/secret is present. |
| **No client-side secrets** | Keys live only in a Cloudflare Worker (mirror the leaderboard Worker), never in shipped HTML/JS. |
| **No live-API requirement for CI** | CI passes with the mock provider; it never needs a real key or network call. |
| **No automatic code changes from AI output** | AI output is advisory text/suggestions only — it never writes files, applies fixes, or pushes. |

- A **"Deep Explain with Claude"** button (when enabled) sends the current
  snippet/diff to the live provider for a conversational explanation and
  intent-aware options — the thing heuristics can't do.
- **Owner-only decision.** Enabling AI / API keys is an owner-only action per
  CLAUDE.md §11; this phase only *documents* it and it stays off until then.

---

## 9. Phased roadmap (suggested PR sequence)

Following the "one PR = one purpose" + phase-order rules in
[`PR_FLOW.md`](PR_FLOW.md):

| Phase | Deliverable | AI key needed? |
|---|---|---|
| **1** | This spec doc (no code) ← *this PR* | No |
| **2** | **Deterministic, read-only scaffold** (§9.1) — intake + report output, no writes | No |
| **3** | Heuristic depth — universal checks + HTML deep module + Quality Score bands | No |
| **4** | Homepage Tools-page card + footer link (replace a "coming soon" card) | No |
| **5** | Hardening / tests + deeper language modules (JS / CSS / Python) | No |
| **6** | Opt-in Claude "Deep Explain" behind the provider interface (§8) | Yes (key + Worker) |

Phases 1–5 deliver a genuinely useful, fully deterministic learning tool. Phase 6
adds AI — and only behind the §8 provider interface.

### 9.1 Phase 2 scope — deterministic, read-only scaffold (locked by owner)

Phase 2 is **additive and safe**: it ships the deterministic skeleton that
everything else builds on, with **no** way to mutate a repo. Six capabilities,
all read-only, all runnable on **local/sample data** (no live services required):

| Capability | What it does (read-only) |
|---|---|
| **Repo / code map** | Build a structural map of files, languages, and entry points from a local checkout or sample fixture. |
| **Diff / PR intake** | Ingest a diff or PR payload (from a file/fixture) and identify the changed surface to review. |
| **Coverage / test signal intake** | Read existing coverage/test reports if present and attach them as signals — never run or require them in CI. |
| **Issue taxonomy** | Classify findings into stable categories/severities (SEO, A11y, Perf, Correctness, …) — the schema §6 builds on. |
| **Report output** | Emit a structured, human-readable review report (and a machine-readable form) — the deliverable. |
| **Sample/fixture mode** | Run the whole pipeline against bundled sample data so it's demoable and testable with zero external dependencies. |

**Hard guardrails for Phase 2 (must all hold):**

- ❌ **No auto-fixes** — it describes issues, it never edits code.
- ❌ **No repo writes** — read-only; it never commits, pushes, or modifies files under review.
- ❌ **No merge automation** — it never merges, approves, or gates a PR.
- ❌ **No secrets / no live AI calls in CI** — deterministic local/sample data only.
- ❌ **No root marketing-site changes** unless explicitly required (Code Lens lives under `tools/`).

This makes Phase 2 fully reversible and reviewable on its own, consistent with
PR_FLOW §1 (one purpose) and the "additive and safe" instruction.

---

## 10. Open items — resolved (2026-06-18)

All four open items were decided by the owner when PR #20 was approved directionally
(captured in the "Owner directional approval" block up top):

1. **Name** — ✅ keep **Code Lens**.
2. **Scope priority** — ✅ **Phase 2 deterministic read-only scaffold first** (§9.1).
3. **AI Deep Explain** — ✅ **deferred** until after the Phase 2 scaffold, then only
   behind the §8 provider interface.
4. **Score grading** — ✅ **advisory bands** 90–100 / 75–89 / <75 (§7), not
   merge-blocking until baseline data exists.

**Next step:** PR #20 is **merged** (2026-06-20, ledger DBZ-018). **Phase 2** (the
deterministic read-only scaffold, §9.1) now opens as the next **separate PR** — no
auto-merge, additive and safe.
