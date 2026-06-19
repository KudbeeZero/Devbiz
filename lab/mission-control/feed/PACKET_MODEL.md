# Mission Packet model

The reusable feed-item model that the Mission Control **Feed layer**
(`/lab/mission-control/feed/`) renders. Every feed source — manual packets, the
agent registry, the Agent Feed Inbox, the (reported) PR board, and the
placeholder ci/deploy/security/worker feeds — is **normalized into Mission
Packets** before rendering, so the UI is one consistent, honest stream.

> This document is the canonical schema. The page also carries the same
> `@typedef` inline in its `<script>` (the repo is zero-build, so the "model" is
> JSDoc + this doc, not a compiled type).

## Fields

| Field | Type | Notes |
|---|---|---|
| `id` | string | **Required.** Stable unique id, e.g. `MP-PR-FEED-002`. |
| `title` | string | **Required.** One-line headline. |
| `source` | string | Human label of who/what produced it (e.g. "Wiring Map", "Review Agent"). |
| `sourceType` | enum | **Required.** See sourceType enum below. |
| `timestamp` | string | ISO date `YYYY-MM-DD`, or the honest words `reported` / `unknown`. Freshness is computed only from real dates. |
| `freshness` | enum (derived) | Computed by the page from `timestamp`: `fresh` (≤2d) · `recent` (≤7d) · `aging` (≤30d) · `stale` (>30d) · `unknown` (no real date). Do not hand-set. |
| `severity` | enum | `critical` · `high` · `medium` · `low` · `info`. |
| `status` | enum | `open` · `in-progress` · `blocked` · `resolved` · `watching` · `unknown`. |
| `summary` | string | Plain-language detail. |
| `evidence` | string[] | Concrete proof: files, commands, routes, screenshots, doc links. |
| `related` | object | `{ branch, pr, build }` — any that apply, else `—`. |
| `actionRequired` | boolean | Something must happen (by anyone). |
| `ownerAction` | boolean | The **owner** must act now → surfaces in "Owner Action Now". |
| `ownerActionText` | string | The exact owner action (when `ownerAction` is true). |
| `confidence` | enum | `high` · `medium` · `low` — how sure the source is. |
| `link` | string | Optional route/URL for more. Relative paths resolve from the feed folder. |
| `rawStatus` | enum | **The honesty flag.** `live` · `partial` · `placeholder` · `not wired`. Hand-authored data is at most `manual`/`partial`; `live` is reserved for genuine verified integrations. |

### `sourceType` enum

`agent-report` · `pr-feed` · `branch-feed` · `ci-feed` · `deploy-feed` ·
`security-feed` · `release-feed` · `repo-health` · `worker-feed` ·
`manual-status` · `placeholder`

## Honesty contract

- **No faked green.** Never set `status: resolved` / `rawStatus: live` unless it is
  actually true and verified from a real source.
- **No invented freshness.** If there is no real date, `timestamp` is `reported` /
  `unknown` and the page shows freshness `unknown` — it does not pretend.
- **Reported ≠ live.** Cross-repo and external statuses are `reported`; the feed
  cannot verify them from this session and says so.
- **Owner action is obvious.** When the owner must act, set `ownerAction: true`
  and write `ownerActionText` — it floats to the top.

## Worked example

```json
{
  "id": "MP-PR-FEED-002",
  "title": "PR feed not wired yet — cards are reported, not live",
  "source": "Wiring Map",
  "sourceType": "pr-feed",
  "timestamp": "2026-06-19",
  "severity": "medium",
  "status": "watching",
  "rawStatus": "not wired",
  "confidence": "high",
  "summary": "Cards are normalized from the v1 reported PR board — NOT live from GitHub. A safe live feed needs a server-side Worker holding the token.",
  "evidence": ["Source: ../data/prs.json (reported board)", "No GitHub API call from the browser"],
  "related": { "branch": "—", "pr": "—", "build": "—" },
  "actionRequired": true,
  "ownerAction": true,
  "ownerActionText": "Decide whether to greenlight a server-side GitHub feed Worker (owner-only; needs OWNER-OK).",
  "link": "./data/feeds.json"
}
```

## Adapter interface

Each feed source is exposed by an adapter:

```js
/** @typedef {{ id:string, label:string, sourceType:string, wiring:string,
 *   load:() => Promise<MissionPacket[]> }} FeedAdapter */
```

`wiring` is one of `live | partial | manual | placeholder | not wired` and is the
source-level honesty flag shown in the **Wiring Map**. Adapters run via
`Promise.allSettled`, so one failing/malformed feed never blanks the board — it
shows a per-source error instead. New feeds are added by writing one adapter +
one row in [`data/feeds.json`](./data/feeds.json); the UI does not change.
