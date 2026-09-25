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
| Motor cortex (execution) | `index.html`, `games/`, `tools/`, `recording-it/`, `leaderboard/`, `clients/`, `lab/` | Before editing | When making changes |
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
index.html              Single-file marketing site (CSS-only routing, no build step)
wrangler.toml           Cloudflare Pages config (serves repo root as static assets)
games/                  Kudbee Games Studio (HTML5 Canvas titles)
tools/                  Kudbee developer utilities (standalone HTML, no build step)
leaderboard/            Online leaderboard service (Worker + D1 + client SDK)
docs/                   Project documentation (ledger, plans, concepts, specs)
```

## Local Preview

```bash
python3 -m http.server 8000
```

## Games Studio — Current Status

All 9 games have completed a "game-polish" pass. The main cross-cutting gap is **online leaderboard integration**:

| Game | Leaderboard Status |
|------|-------------------|
| `riff`, `riff-2` | SDK-wired, needs Worker deployed |
| `darts` | SDK-wired (DBZ-064 draft), demo mode works |
| `voidrunner` | SDK-wired (draft PR #169), demo mode works |
| `pinball` | **SDK integrated + physics/logic hardened** — metrics: score, bestMultiball, modesCompleted; evaluator **21/21** |
| `contra`, `munch`, `orbital`, `puzzles` | SDK-wired (DBZ-065) — demo mode works immediately |

See `docs/GAMES_STUDIO_ROADMAP.md` for the phased integration plan.

## Leaderboard Service

- `leaderboard/shared/core.js` — metric catalog (`GAMES` object), validation, ranking, HTTP handler
- `leaderboard/client/kd-leaderboard.js` — browser SDK (`KDLeaderboard.create()`), supports demo/ALGO/Clerk auth
- `leaderboard/worker/` — Cloudflare Worker + D1 storage
- Games integrate via `window.KD_LB_CONFIG = { API_BASE, GAME, ... }` + `<script src="../../leaderboard/client/kd-leaderboard.js">`

## Testing / Verification

- No CI configured (removed to avoid billing stalls)
- Local verification only: run project's lint/typecheck/test commands before declaring green
- Manual gates documented in ledger (browser, wallet, payment, API key, deploy verification)
- Test hooks: `window.__kbTest` (pinball), `window.RIFF` (riff), `window.PINBALL` (pinball) for headless verification