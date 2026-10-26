# Entire.md — Kudbee Master Instructions

## Purpose
Single source of truth consolidating project doctrine, workflow, and verification rules from `AGENTS.md`, `CLAUDE.md`, and `docs/`.

## Workflow
- Commit-streaming on working branches `claude/<lane>`; merge to `main` when done + verified.
- One PR = one purpose; draft first unless tiny docs change.
- Local verification is the gate; no CI configured.

## Branch lifecycle
- `main` is the only long-lived branch and deploy source (Cloudflare Pages).
- Delete branch (local + remote) on completion; log stale remote deletions in `docs/BUILD_LEDGER.md` (HTTP 403 in this env).

## Verification
- Green gate from repo root: `npm run verify` (pinball 24/24 + leaderboard unit tests).
- Per-game gates: `npm run abyss:eval`, `npm run pinball:eval`, etc. (each prints `N/N passed`).
- Games CSP gate: `npm run games:csp`.
- Abyss graph: `npm run abyss:graph` (8GB heap, ~2 min).

## Security rules (games)
- Nothing from outside goes into `innerHTML`; use `textContent`/`createElement`.
- Never trust a save or link; clamp/type-check on load.
- Cross-site scripts need `integrity` + `crossorigin="anonymous"`, pinned version.
- Leaderboard refuses invalid values via `floor`/`rules` in `leaderboard/shared/core.js`; rebuild worker (`node leaderboard/worker/build-single.mjs`).
- CSP ships Report-Only; widen policy, never enforce before real-phone checks.

## Site filing system
- Sections between `BEGIN`/`END` markers with matching ids; `npm run site:filing` validates.
- CSS conventions in `assets/site/site.css` (radius/shadow/accent/motion rules).

## Memory layers
- Cortex: `CLAUDE.md`; Hippocampus: `docs/BUILD_LEDGER.md`; Prefrontal: `docs/BUILD_PLAN.md`, `docs/BACKLOG.md`, `docs/PR_FLOW.md`; Amygdala: `docs/PRIVATE_TESTING_GATE.md`.

## Owner-only decisions
- Stop and ask before merging, deploying, changing pricing/permissions/security, enabling keys, changing prod env vars, retargeting branches.
EOF
filePath">
/workspace/app/Entire.md