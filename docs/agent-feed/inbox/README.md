# Agent Feed Inbox

A real place for agents to **post reports** into Mission Control. This makes the
"Agent Feed Inbox" referenced across the Mission Control data registry an actual,
checked-in path instead of a pending placeholder.

- **Read by:** `/lab/mission-control/feed/` (the Mission Control Feed layer), via
  its `inboxAdapter`, through the index at
  [`lab/mission-control/feed/data/inbox.json`](../../../lab/mission-control/feed/data/inbox.json).
- **Wiring status:** `partial`. The drop-a-file + index path is wired and rendered.
  Ingestion is still **manual** — no Worker auto-collects or authenticates reports
  yet. See the Wiring Map in the feed page for the upgrade path.

## What an inbox report is

One **agent-report Mission Packet** — a single agent's task, status, evidence, and
recommended next action. The shape is documented in
[`_schema.json`](./_schema.json) and mirrors the canonical
[Mission Packet model](../../../lab/mission-control/feed/PACKET_MODEL.md).

Supported agents (examples): Review · Security · UI/UX · Mobile QA · Release ·
Branch Hygiene · Dependency · PR Watcher · Deploy Watcher.

## How to post a report

1. Write a JSON file into this folder following [`_schema.json`](./_schema.json),
   e.g. `2026-06-19-review-agent.json`. Required: `id`, `agent`, `task`, `status`.
2. Add an entry to
   [`lab/mission-control/feed/data/inbox.json`](../../../lab/mission-control/feed/data/inbox.json)
   pointing at your file. The path is resolved relative to the **feed page**
   (`lab/mission-control/feed/`), so it starts with
   `../../../docs/agent-feed/inbox/...` (three levels up reaches the repo root).
3. Open `/lab/mission-control/feed/` — your report appears as an **Agent Report**
   packet, with freshness computed from `lastUpdate`.

## Honesty rules (carry over from Mission Control v1)

- Never claim a status you have not verified. Use `reported` / `unknown` honestly.
- A hand-written report is at most `manual` / `partial` — **never `live`**. "Live"
  is reserved for genuine, verified integrations (none exist here yet).
- Use precise CI language: `CI green` only if the exact check completed; otherwise
  `local passed, CI pending` / `no CI configured`. "Expected green" is not green.
- Put the owner action in `ownerActionText` and set `ownerAction: true` only when
  the owner must act now.

## What would make this `live` instead of `partial`

A Cloudflare Worker (token held server-side as a secret, never in the browser)
that accepts authenticated report posts, validates them against the schema, and
maintains the index automatically — plus optionally a scheduled job that collects
agent check-ins. That is an owner-only infra lane and is **not** built here.
