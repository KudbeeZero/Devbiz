# Mission Control data registry

The `/lab/mission-control` dashboard renders **entirely from these JSON files**.
Update the data here — you never have to touch the dashboard markup or JS.

| File | Section it feeds | Notes |
|---|---|---|
| `actions.json` | Owner Action Queue (top) | Only what needs the **owner** now. Order high → low priority. |
| `projects.json` | Active Project Lanes | One entry per major project/repo. |
| `prs.json` | Active PR Board | Cross-repo PRs must be labeled **reported** (this dashboard can't verify them). |
| `agents.json` | Agent Registry | **Reported status only** — no live integration with external sessions. |
| `decisions.json` | Decision Log | Major owner decisions, newest first. |
| `prompts.json` | Prompt Ledger | Reusable prompts (inline `body` or `link`). |

## Rules
- **Be honest.** Use `reported`, `manual`, `unknown`, `needs verification` when you
  haven't actually verified something. Don't claim CI green or merged unless it is.
- Keep each entry small. Long context belongs in `notes`, not in titles.
- Every file has a leading `_comment` describing its schema and allowed enum values.
- Valid JSON only — the dashboard shows a clear error if a file fails to parse.

## Editing locally
The dashboard `fetch()`es these files, so preview over HTTP (not `file://`):

```bash
python3 -m http.server 8000
# → http://localhost:8000/lab/mission-control/
```
