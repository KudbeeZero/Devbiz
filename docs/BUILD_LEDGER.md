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
| DBZ-014 | Devbiz | N/A | `claude/ai-code-review-learning-q4ouka` | docs | `PLAN` | Owner review of the Code Lens spec | Review spec; approve concept + name, then greenlight Phase 2 scaffold | Code Lens: learn-as-you-build code review tool. Local heuristics + opt-in AI, language-agnostic. Spec/plan only — no tool code. See `docs/code-lens-plan.md`. |
| DBZ-013 | Devbiz | #13 | `claude/build-ledger-dbz` | docs | `DRAFT` | Owner review of docs | Review & merge the docs PR | This ledger + CLAUDE.md reference. Process-only. |
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

## Updating this ledger

- One row per work item; keep **Notes** to short context, not history.
- Change **Status** only when the real state changes; never use a label outside
  the approved set.
- Adding or editing a row is a docs/process change — keep it on a docs lane and
  out of feature/CI PRs.
