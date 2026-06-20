# AI Command Center — Operating Guide

**Route:** `/lab/ai-command-center/` · **Status:** private, Cloudflare Access–gated (same as `/lab/*`)

A **manual-first agent console**. It does one honest thing well: helps you
**compose copyable prompts** (kickoff, closeout, registration, review) and keep a
**reported** roster of agents — without pretending to control anything live.

It is a **zero-build static page** that renders from JSON. **No backend, no
database, no secrets, no live GitHub/Fly/Cloudflare actions, no fake live control.**

---

## What it is (and isn't)

- ✅ **Prompt Launcher** — pick a template, fill the fields, copy the result into
  your own Claude/Codex session. The page **composes text**; it sends nothing.
- ✅ **Reported agent/session roster** + a **model reference** lookup.
- ✅ **Data-driven** — edit `data/*.json`, never the markup.
- ❌ **Not** a backend or control plane. It cannot start, stop, merge, deploy, or
  observe any session. Status is **reported**, not telemetry.

> **Honesty rule (shared with Mission Control):** label anything not actually
> wired as `reported` / `manual` / `unknown`. No agent or UI may claim live
> control over an external session, repo, or deploy unless that integration
> genuinely exists. It does not here.

---

## Which file updates what

| File | Feeds | Notes |
|---|---|---|
| `data/prompts.json` | Prompt Launcher | Templates with `fields` + a `template` body using `{{key}}` placeholders. |
| `data/agents.json` | Agent / Session Roster | Reported only. Don't invent sessions. |
| `data/models.json` | Model Reference | Lookup table — verify current IDs in the Claude docs. |

Valid JSON only — each section shows a clear error if a file fails to parse. The
page uses `fetch()`, so preview over **HTTP** (`python3 -m http.server`), not
`file://`.

### Adding a Prompt Launcher template

```json
{
  "id": "unique-id",
  "title": "Shown on the chip",
  "category": "Lanes | Reporting | Review | General",
  "purpose": "One line shown above the form",
  "fields": [ { "key": "name", "label": "Name", "placeholder": "...", "type": "text|textarea" } ],
  "template": "Any text with {{name}} placeholders"
}
```

Unfilled `{{key}}` placeholders render as highlighted `⟨Label⟩` tokens in the
preview so you can see what's still missing before copying.

---

## Relationship to Mission Control

Mission Control is the **project operations board** (lanes, PRs, decisions, owner
actions). The AI Command Center is the **prompt + agent console**. This lane is
**registered in Mission Control** (`projects.json` / `agents.json` / `actions.json`)
per the lane-kickoff rule. The reporting protocol is shared — build closeouts with
the launcher's “Agent closeout report” template; the canonical protocol lives in
Mission Control.

---

## Access & secrets

Same gate as the rest of `/lab/*`: **Cloudflare Access (Zero Trust)**, configured
in the Cloudflare dashboard — **no app login, no password, no basic-auth, no
secrets in the repo.** This console needs none.
