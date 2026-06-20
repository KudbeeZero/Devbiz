# Plant Analyst Spec (v1)

> ⚠️ **DRAFT — agent-filled gap.** This doc was missing from the owner pack. Drafted
> from the verified GrowVerse audit (`lab/ai-command-center/lanes/growverse-living-plant-audit.md`).
> Owner: confirm or replace with your authoritative version.

## What already exists (verified in `mainnet-growverse-v2.0`)
- `components/plant/AdvisorPanel.tsx` + `lib/api/advisor.ts` — an **"AI Master
  Grower" read-only diagnosis on demand** (`GET /players/{id}/plants/{id}/advisor`)
  plus a guarded agentic **auto-care** (budget + action cap). **Backend-powered.**
- So "Plant Analyst" largely **exists** — it's dark only because the backend isn't
  wired (see `05` + the backend runbook). Wiring it lights up the real analyst.

## v1 scope (if an OFFLINE/local analyst is wanted before the backend is up)
A **rule-based** panel — **labelled "rule-based game-state analysis," NOT AI** (no
faking AI when no AI is wired). Reads **only real `Plant` fields**:
`growth_stage, height, health, water_level, nutrient_level, pest_level,
disease_level, condition_flags[], is_alive, harvested`.

**UX:** button "Run Plant Scan" → 1–2s thinking state ("Scanning canopy… / Reading
growth signals… / Checking cultivar state…") → 2–4 observations from actual state →
one suggested next action.

**Example outputs (only from real state):** "Water trend looks low for this stage."
· "No active pest or mildew flags detected." · "Health is stable." · "Would you like
to take a non-destructive sample?"

## Safety
- **In-game simulation feedback only.** No real-world cannabis cultivation advice.
- Do **not** invent stats that don't exist in the state model.
- Do **not** label rule-based output as AI.

## Take Sample (v1)
Non-destructive: creates a sample card (timestamp/day + Analyst notes). **No** health
reduction, **no** genetics change, **no** damage. If an existing stress/negative
system is found, report it before using it — never add plant damage silently.
