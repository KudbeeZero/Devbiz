# Mission Control — Roadmap (v2+)

> **Status of v1:** the static foundation shipped in PR #25 and is **merged**.
> v1 is a **zero-build, data-driven dashboard** (renders from `data/*.json`) — a
> logbook, not a control plane. This roadmap captures where Mission Control goes
> next. **Nothing here is built yet.** Each evolution is its own owner-approved PR.

---

## Vision — what Mission Control should eventually become

1. **Operations database** — structured, queryable project/lane/PR/agent state.
2. **Document / evidence vault** — screenshots, tarballs, verification artifacts.
3. **Agent control surface** — open / park / resume / close lanes from one place.
4. **Owner action tracker** — actions with status, completion, and history.
5. **Prompt launcher** — generate kickoff / closeout prompts on demand.
6. **Lane lifecycle system** — open → park → resume → close, recorded over time.

v1 already covers the **read/logbook** half of this honestly. v2+ adds
**structure (DB)**, **evidence (vault)**, and **controlled actions (API)** — each
only when wired to something real.

---

## Recommended future architecture

| Layer | Role | Notes |
|---|---|---|
| **Cloudflare Access (Zero Trust)** | Private gate | Already the intended gate for `/lab/*`; no change in approach. |
| **Cloudflare D1** | Structured Mission Control data | Migration target for today's `data/*.json` registries. |
| **Cloudflare R2** | Document / evidence object store | Screenshots, tarballs, verification files, attachments. |
| **Cloudflare Worker API** | Controlled actions | The only thing that may *write* — open/park/resume/close, mark-complete, attach. |
| **Static `/lab` frontend** | Dashboard UI | Stays the zero-build front end; reads the API instead of flat JSON. |

**Migration principle:** preserve the v1 contract — the frontend renders from a
data source, agents update the data, the UI doesn't get rewritten per change.
JSON files → D1 rows should be a drop-in of the *source*, not a UI redesign.

---

## Data points to track (v2 schema target)

projects · lanes · PRs · agents · owner actions · decisions · prompts ·
documents/attachments · verification evidence · browser checks · canonical repo
paths · preview URLs · CI status · last verified commit · next safe action.

(v1 already tracks: projects, PRs, agents, owner actions, decisions, prompts. v2
adds: lanes as first-class objects, documents/evidence, browser checks, canonical
repo paths, preview URLs, CI status, last-verified-commit, next-safe-action.)

---

## Controls (must be honest)

| Control | Real action required before it's "live" |
|---|---|
| Open lane | Worker API write to D1 |
| Park lane | Worker API write to D1 |
| Resume lane | Worker API write to D1 |
| Close lane | Worker API write to D1 |
| Mark owner action complete | Worker API write to D1 |
| Attach document / evidence | R2 upload via Worker (presigned/authenticated) |
| Generate kickoff prompt | Template render (local OK) |
| Generate closeout prompt | Template render (local OK) |
| Create GitHub issue / PR comment | Real GitHub integration (later) |

> **Honesty rule (carries over from v1):** until a control is wired to a real API,
> it must be labeled **manual / reported / database-only** in the UI. **Do not fake
> live control.** A button that only writes a local row is a *database edit*, not
> "control" of anything external. No agent or UI may claim live control over an
> external session, repo, or deploy unless that integration genuinely exists.

---

## Sequencing (owner-set, 2026-06-19)

1. ✅ **Mission Control v1 — static foundation** (PR #25, merged). Keep it clean;
   **no database/control features added to #25.**
2. ▶️ **AI Command Center v1 — the next clean PR** (its own lane, owner-defined
   scope). This comes before the database/vault work.
3. ⏭️ **Operations database + document/evidence vault** (D1 + R2 + Worker API) —
   **after** AI Command Center v1, unless the owner explicitly re-prioritizes.

---

## Gates & honest caveats

- Standing up **D1 / R2 / a Worker API** is a **backend + infrastructure lane** —
  this is **owner-only** (CLAUDE.md §11) and, because it touches production
  infra / API surface / possibly env vars and keys, it falls under the
  **highest-stakes** set that additionally needs an explicit **`OWNER-OK: <phrase>`**
  token (PR_FLOW.md §11a). v1 deliberately stayed static to avoid all of that.
- Each evolution is **one PR = one purpose**: don't bundle DB + R2 + controls into
  one PR. Phase them (schema/plan → API scaffold → one control end-to-end → vault).
- Cloudflare **Access policy and secrets are never committed** — they live in the
  Cloudflare dashboard. This roadmap changes no policy and adds no secrets.
- Suggested ledger ID when this graduates to a build lane: **INFRA-002**
  (cross-project infra) — add on a separate docs lane, per the ledger rule.

---

## Next safe action

Capture is done (this doc). The next *build* unit is **AI Command Center v1** as a
clean standalone PR — not the database/vault, and not bundled into Mission Control
v1. The DB/vault work waits for an owner-approved infra lane (with `OWNER-OK`).
