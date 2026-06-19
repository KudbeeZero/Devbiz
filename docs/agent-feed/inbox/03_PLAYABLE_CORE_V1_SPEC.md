# Playable Core v1 Specification

## Minimum Playable Loop Target

1. User creates or loads a local grower profile
2. User receives their first GrowPod
3. One living plant is instantiated and rendered via the canonical GrowChamber renderer
4. User can perform basic actions:
   - Water
   - Light
   - Inspect
   - Advance Day / Simulate Day
5. Progress can be saved and reloaded locally
6. Plant Analyst panel is accessible
7. (Optional) Non-destructive Take Sample is available

## Renderer Requirement
All plant visuals must go through the **canonical GrowChamber / chamberCore renderer**. Do not create parallel or temporary rendering paths.

## State Management (Current Phase)
- Local-first by default
- Use localStorage or equivalent for profile + plant state until backend is confirmed ready
- Clearly document current persistence layer in code and docs

## Action Design Principles
- Actions should feel responsive and meaningful
- Prefer clear feedback over complex simulation in v1
- Keep the loop simple enough to complete in one focused session

## Success Criteria for v1
- User can complete a full grow cycle (or meaningful portion of one)
- Plant state visibly changes based on actions
- Save/reload preserves state correctly
- Plant Analyst provides useful, honest feedback