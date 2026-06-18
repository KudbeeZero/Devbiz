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
