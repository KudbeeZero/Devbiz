# CLAUDE.md

Project instructions for agents working in this repository.

## Project

**Kudbee** — a creative dev studio site (web design, live AI agent training, and original
game development), built as a zero-build static site and deployed on Cloudflare Pages.

```
index.html              Single-file marketing site (CSS-only routing, no build step)
wrangler.toml           Cloudflare Pages config (serves the repo root as static assets)
games/                  Kudbee Games Studio (HTML5 Canvas titles)
tools/                  Kudbee developer utilities (standalone HTML, no build step)
```

Everything is static — any file server works for local preview:

```bash
python3 -m http.server 8000
```

## BUILD LEDGER

Every PR, phase, and active work lane is tracked with a numbered ID, a status label, and
an owner approval state in [`docs/BUILD_LEDGER.md`](docs/BUILD_LEDGER.md). Consult it to
see what is ready to merge, waiting, blocked, or must not be touched.

- **IDs** use per-project prefixes: `DBZ-###` (Devbiz), `GV-###` (GrowVerse),
  `REC-###` (Recorded It), `BOOM-###` (BOOMSKI / Copy Snap), `FR-###` (Frontier),
  `INFRA-###` (cross-project). One ID per work item, never reused.
- **Status labels** (use only these): `PLAN`, `BUILDING`, `DRAFT`, `AWAITING_AUDIT`,
  `MANUAL_CHECK`, `APPROVED`, `MERGED`, `HOLD`, `FIX_FIRST`, `BLOCKED`.
- **Approval rule:** an advisor (e.g. ChatGPT) may return `APPROVE` / `HOLD` /
  `FIX_FIRST` / `MANUAL_CHECK_REQUIRED`, but **no agent may merge** without explicit
  owner authorization for that specific PR. Mark `APPROVED` only when the
  merge-readiness rule in the ledger is fully met.

Keep ledger updates on a docs/process lane — never bundled into feature or CI PRs.

## PR FLOW RULES

These rules govern how every future PR is planned, opened, watched, audited, merged, and
closed. They apply to all agents and contributors. Full reference: [`docs/PR_FLOW.md`](docs/PR_FLOW.md).

### 1. One PR = One Purpose

Every PR must have one lane only:

- docs/process
- infrastructure
- CI/workflows
- tests/coverage
- bug fix
- feature
- security/privacy
- economy/marketplace
- deployment/release

Do not mix lanes unless explicitly authorized.

### 2. Phase Order

Use phased PRs for larger work:

1. Plan / spec PR
2. Scaffold PR
3. Feature PR
4. Hardening / tests PR
5. Launch / enablement PR

Do not jump to Phase 2 before Phase 1 is merged or explicitly approved.

### 3. Draft First

New PRs should usually start as drafts unless they are tiny docs-only changes.

Draft means:

- scope is still being checked
- manual review may still be needed
- no merge expectation yet

### 4. AWAITING_AUDIT State

A PR may move to `AWAITING_AUDIT` only after:

- scope is frozen
- no more code changes are planned
- tests/checks are documented
- manual checks are documented if needed
- known risks are listed
- no unrelated work remains inside the PR

### 5. No Auto-Merge

Do not merge automatically.

Merge requires explicit owner approval. Even if CI is green, wait for owner review/merge
instruction.

### 6. Watcher Rule

If assigned to watch a PR, stay quiet unless something actionable happens.

Surface only:

- CI failure
- review comment
- merge conflict
- preview/deploy issue
- owner decision needed

Do not send repeated "still holding" messages.

### 7. Green Status Rule

Never claim green unless the exact check completed successfully.

Use precise language:

- local passed, CI pending
- CI green
- Cloudflare deployed
- no CI configured
- manual preview passed
- expected green, not confirmed

Expected green is not green.

### 8. Manual Check Rule

If a PR requires browser, wallet, payment, screen capture, API key, or deployment
verification, document it as a manual gate.

Do not mark it audit-ready until the manual gate is completed or explicitly waived.

### 9. Found But Not Changed

If unrelated work is discovered, do not fix it inside the PR. Use:

```
Found but not changed:
1. Issue:
2. Risk:
3. Recommended follow-up PR:
4. Blocking current task? Yes/No.
```

### 10. Closeout Format

Every PR closeout must use:

```
Asked:
Done:
Verified:
Needs you:
Risks / Notes:
```

Keep it compact. If there are no risks, say `Risks / Notes: None.`

### 11. Owner-Only Decisions

Stop and ask before:

- merging
- deploying
- changing pricing
- changing permissions/security policy
- enabling payment
- enabling AI/API keys
- changing token/credit behavior
- changing blockchain/proof behavior
- changing production environment variables
- retargeting branches
- opening a new PR lane

Highest-stakes, hard-to-reverse actions (production deploy; security/permission/
pricing changes; enabling payment or AI/API keys; token/credit or blockchain/proof
behavior; production env vars) additionally require a confirmation token
`OWNER-OK: <phrase>` in the instruction — even under full delegation. The phrase is
agreed out-of-band and never committed. See `docs/PR_FLOW.md` §11a.

### 12. Closed Lane Rule

When a PR is merged or closed:

- confirm final state
- unsubscribe/stand down if applicable
- do not reopen
- do not start follow-up work unless explicitly authorized

### 13. Current Status Snapshot

When asked for current state, report compactly:

- PR number/name
- status
- allowed actions
- blocked actions
- next owner action

Do not restate the whole project history.

## OUTPUT QUALITY DOCTRINE

Kudbee is a design-and-games studio: the work has to *look* and *feel* next-level, not just
function. These rules raise the bar for how agents work here. They are distilled from
widely-circulated long-running-agent prompt patterns (the June 2026 "Fable 5" system-prompt
discussion) — the durable lesson of which is that great agent output comes from **precise
capability, output contracts, and verification — not persona or vibes**. Adapted for this repo:

### A. Taste & visual ambition
- Treat every visual surface (site, game, tool) as a portfolio piece. When asked for "a spec"
  — a poster, a section, an animation — **build and verify the rendered result**, don't just
  describe it. Reach for the more impressive, more polished version when effort allows.
- Match the house style already in the codebase (zero-build, inline, vanilla, canvas vector
  art, the existing palette/`fitCanvas` helpers) before inventing new patterns.
- Performance is part of quality: 60fps target, `requestAnimationFrame`, pause work off-screen,
  honor `prefers-reduced-motion`, and degrade gracefully on mobile/low-power.

### B. Verify before claiming done
- Reuse the §7 Green Status language. "Expected green" is not green. Don't say a thing renders,
  passes, or deploys unless you actually ran the exact check and saw it.
- Actually create/modify the files — never just print intended content. Confirm structure
  (syntax-check JS, validate JSON-LD/XML, balance tags) before committing.

### C. Honesty about what was and wasn't done
- Own gaps and limitations plainly (use the §10 closeout `Needs you:` / `Risks` fields). If a
  step was skipped, a placeholder was left, or a manual gate remains, say so — don't paper over it.
- Don't fabricate data in code or markup (e.g. no schema.org `SearchAction` with no real search,
  no sitemap entries for URLs that don't exist).

### D. No laziness / no silent truncation
- Read the relevant file/skill/doc before editing it; don't guess at structure you can cheaply check.
- Don't truncate or "...rest unchanged" real deliverables. Ship the whole thing.

### E. Act decisively vs over-asking
- When the request and the codebase make the answer clear, act — then report. Reserve questions
  for genuine owner-only decisions (§11) or true ambiguity, and batch them.
- Keep replies tight: lead with the result, minimal formatting, no narration of internal machinery.
