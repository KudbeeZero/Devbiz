# Mission Control — Operating Guide

**Route:** `/lab/mission-control/` · **Status:** private, Cloudflare Access–gated (same as `/lab/*`)

Mission Control is Kudbee's **project operations board**. It exists because build
velocity was outpacing tracking — so this is the one place to see every repo, PR,
agent, blocker, preview link, CI state, decision, and the **owner action queue**
before more work starts.

It is a **zero-build static page** that renders entirely from JSON data files.
There is **no backend, no secrets, no live API integration.**

---

## What Mission Control is (and isn't)

- ✅ A **logbook + dashboard**: owner actions, project lanes, PR board, agent
  census, decision log, prompt ledger, and the agent reporting protocol.
- ✅ **Data-driven**: the UI never needs editing — agents update `data/*.json`.
- ❌ **Not** live telemetry. It cannot see or control external Claude / Codex /
  Fly sessions. Every agent/PR status is **"reported"** by whoever last edited the
  data, unless a real integration is actually wired (none is today).
- ❌ **Not** a control plane that can start, stop, or merge anything. Merges and
  deploys remain **owner-only**.

> **Honesty rule:** use `reported`, `manual`, `unknown`, `needs verification`,
> `merged`, `parked` honestly. Never claim CI green, "live control," or "merged"
> unless it is actually true and verified. No agent may claim live control over an
> external session unless that integration genuinely exists.

---

## How the owner uses it

1. Open `/lab/mission-control/` (locally via `python3 -m http.server`, or the
   Cloudflare preview / production once Access is configured).
2. Read the **Owner Action Queue** at the top — it lists only what needs *you*,
   highest priority first, with the exact next action and what it blocks.
3. Scan **Project Lanes** and the **PR Board** for state, CI, preview, and merge
   readiness. Cross-repo items are labeled *reported* (not verifiable from devbiz).
4. Check the **Agent Census** for who is active / parked / subscribed / complete /
   unknown — remembering these are reported statuses.
5. Use the **Decision Log** and **Prompt Ledger** as the durable record + reusable
   prompts. Copy buttons are provided.

---

## Which file updates what

The dashboard reads these — edit the **data**, never the markup:

| File | Section | What to put there |
|---|---|---|
| `data/actions.json` | Owner Action Queue (top) | Only what needs the **owner** now. Order high → low priority. |
| `data/projects.json` | Active Project Lanes | One entry per major project/repo. |
| `data/prs.json` | Active PR Board | PR state · CI · preview · owner action · merge readiness. Cross-repo = **reported**. |
| `data/agents.json` | Agent Census | Reported agent status. Don't invent agents; mark unknowns as `unknown`. |
| `data/decisions.json` | Decision Log | Major owner decisions, newest first. |
| `data/prompts.json` | Prompt Ledger | Reusable prompts (inline `body` or `link`). |

Each file has a leading `_comment` documenting its schema and allowed enum values.
Valid JSON only — the dashboard shows a clear per-section error if a file fails to
parse. It uses `fetch()`, so preview over **HTTP**, not `file://`.

---

## How future agents must report into Mission Control

**Before starting a lane:** register it. Add the lane to `data/projects.json` +
`data/agents.json`, and any owner action to `data/actions.json`. *First update
Mission Control with this lane, then proceed.* No lane runs unregistered.

**On completion:** end with the closeout below **and** keep the data files current.

### Agent Reporting Template (copy this)

```
Asked:
Done:
Needs you:

Repo:
Branch:
PR:
CI status:
Preview/dev route:
Files changed:
Verification performed:
Owner action now:
Next recommended unit:
Agent state: active / parked / subscribed / complete / unknown
```

**Rules**
- Never say **"standing by"** when owner action is required.
- Say **"Owner action now:"** when the owner must click / test / approve / merge /
  configure.
- If nothing is needed, say **"No owner action right now."**
- Always report whether the agent is **active, parked, subscribed, complete, or
  unsubscribed**.
- Use precise CI language: `CI green` / `local passed, CI pending` / `no CI
  configured` — "expected green" is not green.

The same template + rules are rendered live in the dashboard's **Agent Reporting
Protocol** section.

---

## Access & login (there is no password in the repo)

`/lab/mission-control` has **no app-level login, no shared password, and no
basic-auth** — none of that exists in this repo, by design. The only intended
protection is **Cloudflare Access (Zero Trust)**, an edge gate configured in the
Cloudflare dashboard (not committed here). See
[`docs/PRIVATE_TESTING_GATE.md`](../../docs/PRIVATE_TESTING_GATE.md).

**Owner verification checklist (manual / external):**

1. Open `/lab/mission-control/` in an **incognito/private** window.
2. **Expected:** a **Cloudflare Access** screen appears *before* the page loads →
   sign in with the **allowed owner email + one-time PIN**.
3. **If the dashboard loads with no prompt:** Access is **not configured yet** —
   **do not share the link publicly**, and configure Cloudflare Zero Trust Access
   for `/lab` and `/lab/*` per the gate doc.

> `noindex` headers + `robots.txt Disallow` on `/lab/*` are crawler **hygiene
> only — not access control**. The real gate is Cloudflare Access. This task does
> not change any Cloudflare policy.

---

## Environment / secrets

Mission Control needs **no secrets**. For future lanes that do:

- `.env.example` (repo root) — placeholder keys, committed.
- `.env.local.example` — local-override template, committed.
- `.env`, `.env.local`, `.env.*.local` — **gitignored**; real values live here.

```bash
cp .env.example .env.local   # then fill private values locally — never commit them
```

No real secrets are ever committed; the `*.example` files hold placeholders only.

---

## Build Ledger row (suggested — to be added on a separate docs lane)

This repo tracks work in [`docs/BUILD_LEDGER.md`](../../docs/BUILD_LEDGER.md), and
its own rule is that **ledger updates ride a separate docs/process lane — never
bundled into a feature/ops PR**. So the row below is **documented here** rather
than edited into the ledger inside PR #25. Add it on its own docs lane:

```
| DBZ-018 | Devbiz | #25 | claude/mission-control-v1-g2jmjv | feature (ops/control-plane) | DRAFT | Owner browser visual check of /lab/mission-control | Browser-check the preview; then approve/merge | Mission Control v1 — owner project operations dashboard at /lab/mission-control. Data-driven (data/*.json), zero-build, honest reported labels. CI green (Workers build; coverage gate unaffected). |
```

> Suggested ID **DBZ-018** (or **INFRA-002** if treated as cross-project infra).
> Purpose: Mission Control v1 / owner operations dashboard. Status: draft PR #25,
> CI green, pending owner browser check.
