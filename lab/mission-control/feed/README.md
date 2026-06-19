# Mission Control — Feed layer

**Route:** `/lab/mission-control/feed/` · **Status:** private, Cloudflare
Access–gated (same as `/lab/*`).

The Feed layer is the **agent/feed view** of Mission Control. Where the v1 board
(`/lab/mission-control/`) is a structured logbook of projects/PRs/agents, the Feed
layer turns everything into one honest stream of **Mission Packets** that answers:

- What is happening right now?
- Which agents are active, and what did they report?
- Which PRs / branches / builds need attention?
- Which systems are stale, placeholder, or **not wired**?
- What needs **owner action** now, and what can safely wait?

It is a **zero-build static page** that renders entirely from JSON. **No backend,
no secrets, no live API, no GitHub token** — by design.

## How it renders

Every source is **normalized into Mission Packets** (see
[`PACKET_MODEL.md`](./PACKET_MODEL.md)) by a small **adapter**, then rendered into
one consistent UI. Adapters run via `Promise.allSettled`, so one bad feed shows a
per-source error instead of blanking the board.

| Adapter | Reads | Wiring | Becomes |
|---|---|---|---|
| Manual packets | `data/packets.json` | manual | mixed packets |
| Agent registry | `../data/agents.json` | manual (reported) | Agent Reports |
| Agent Feed Inbox | `data/inbox.json` → `docs/agent-feed/inbox/*.json` | partial | Agent Reports |
| Owner actions | `../data/actions.json` | manual | Owner Action Now |
| PR / branch | `../data/prs.json` | **not wired** | PR / Branch Feed (reported) |
| ci / deploy / security / worker | `data/feeds.json` | placeholder / not wired | scaffold packets |

The **Wiring Map** section renders [`data/feeds.json`](./data/feeds.json) directly:
every feed source, its `wiring` status, and the exact backend/API/webhook needed
next.

## Honesty rules

Same contract as v1, made explicit in the model:

- **Nothing is labelled `live`** in this lane — no live integration is wired. The
  honest mix is `manual` / `partial` / `placeholder` / `not wired`.
- **No faked green / merged / PR updates.** Reported cross-repo status says so.
- **Freshness is computed from real dates only**; missing dates show `unknown`.
- **Owner action floats to the top** when `ownerAction: true`.

## Editing locally

The page `fetch()`es JSON, so preview over **HTTP** (not `file://`):

```bash
python3 -m http.server 8000
# → http://localhost:8000/lab/mission-control/feed/
```

Update the **data**, never the markup:

- Add a packet → `data/packets.json`
- Add a feed source / change wiring → `data/feeds.json`
- Post an agent report → drop JSON in `docs/agent-feed/inbox/` + add a line to
  `data/inbox.json` (see that folder's README)

Valid JSON only — each section shows a clear error if a file fails to parse.

## PR / branch / CI feed — the safe pipeline (NOT wired yet)

The PR feed here is **reported, not live**. A real PR/branch/CI/deploy feed must:

- Run **server-side only** — a Cloudflare Worker holds the GitHub token as a
  **secret**. **No GitHub token in browser code, ever.**
- **Cache + rate-limit** API requests; prefer webhooks (`check_run`,
  `pull_request`, `deployment_status`) over polling where possible.
- **Separate preview vs production** branches/deploys.
- Surface **branch name, PR number, CI state, review status, merge conflicts,
  deployment state**, and a **last-verified timestamp**.
- **Never mark a PR/build green** unless verified from a real source. "Expected
  green" is not green.

Until that Worker exists (an owner-only infra lane needing explicit `OWNER-OK`),
the PR/CI/deploy/security/worker feeds stay labelled `not wired` / `placeholder`.

## Access & login (honest limitation)

There is **no app-level login, password, or basic-auth** in this repo. The only
real gate on `/lab/*` is **Cloudflare Access (Zero Trust)**, configured in the
Cloudflare dashboard (not committed). `noindex` + `robots.txt Disallow` on `/lab/*`
are crawler **hygiene only — not access control**. Verify the Access prompt
appears in an incognito window before sharing any deployed link. See
[`docs/PRIVATE_TESTING_GATE.md`](../../../docs/PRIVATE_TESTING_GATE.md).

## Relationship to v1 and the roadmap

This is purely additive: v1's `index.html` and its data-rendering are untouched
(only a nav link is added). It is the **read/stream** half of the
[v2+ roadmap](../ROADMAP.md). Controlled writes (open/park/resume/close lanes,
evidence vault) still require a real Cloudflare D1/R2/Worker API and stay
**owner-only** — not built here, and never faked as live control.
