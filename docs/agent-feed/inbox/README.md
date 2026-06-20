# Agent Feed — Inbox

A **safe, ordered queue of context documents** for future coding agents / Claude
bot workflows. Agents process these **one at a time, in numeric order**, before
and during a GrowVerse work lane.

## Provenance (honest)
The owner authored a numbered "agent feed" pack and **accidentally pushed it to the
GrowVerse app repo** (`KudbeeZero/mainnet-growverse-v2.0` → `growpod/docs/`) instead
of here. This folder is the **canonical control-plane copy**, mirrored into devbiz
(next to Mission Control). The GrowVerse originals were **not** deleted.

- **Mirrored verbatim (secret-free, verified):** `00, 01, 03, 04, 05, 07, 08, 09`.
- **Not copied:** a stray exact duplicate `01_GROWVERSE_CURRENT_STATUS 2.md`.
- **Were missing from the owner pack → added here as clearly-labelled DRAFTs**
  (agent-filled from the verified audits; owner to confirm/replace):
  `02_PLANT_ANALYST_SPEC.md`, `06_REVIEW_BOARD_ROUTE_POLICY.md`.

> **Secret check:** every mirrored doc was scanned — **0 real secret values**.
> `04_ENV_VARS_INVENTORY.md` is names-only by design. Keep it that way: never
> commit real values here.

## How agents process the inbox
1. Read `00` → `09` in order before acting. `00` = context, `07` = owner rules &
   safety (read this every time), `08` = the verification checklist to run before
   closing, `09` = how to register the lane in Mission Control.
2. **One active GrowVerse gameplay PR at a time** (see `07`).
3. Register the lane in Mission Control **first** (`09` + `/lab/mission-control`),
   then proceed.
4. Gameplay code lands in the **GrowVerse repo**, not devbiz. These docs are
   context; the control plane (Mission Control + AI Command Center) lives in devbiz.
5. Finish with the closeout (`Asked / Done / Needs you`) and the `08` checklist.

## Files
See [`INDEX.md`](./INDEX.md) for the per-document coverage report + status.

## Related (already in this repo)
- Mission Control: `/lab/mission-control/`
- GrowVerse Vercel readiness + domain: `lab/ai-command-center/lanes/growverse-vercel-readiness.md`
- GrowVerse Living-Plant audit + backend runbook: `lab/ai-command-center/lanes/growverse-living-plant-audit.md`
