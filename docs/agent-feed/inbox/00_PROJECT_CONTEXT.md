# GrowVerse / GrowPod Empire — Project Context

**Project Name**: GrowVerse (also referred to as GrowPod Empire)  
**Live Domain**: https://growverse.dev  
**Hosting**: Vercel (domain purchased through Vercel)  
**Public App**: growverse.dev  
**Optional Redirect**: www.growverse.dev → growverse.dev (future, owner-approved only)  
**Future Protected Review Domain**: review.growverse.dev  
**Future Protected Review Route**: /review/plant-review  
**Full Future Review URL**: https://review.growverse.dev/review/plant-review  
**Local Dev-Only Route**: /dev/plant-review  
**Future Backend/API Domain**: api.growverse.dev  
**Future Frontend Env Placeholder**: `NEXT_PUBLIC_API_BASE_URL=https://api.growverse.dev`

## Current Product Direction

GrowVerse is a playable online grow simulation. Users should be able to:
- Create or load a grower profile
- Receive a GrowPod
- See a living plant through the canonical renderer (GrowChamber / chamberCore)
- Interact with the plant
- Run plant analytics
- Save progress and want to return

**Current Priority**: GrowVerse Living Plant Polish + Plant Analyst v1.

## First Real Gameplay Loop (Target)

- Local-first grower profile
- First GrowPod
- One living plant / cultivar
- Plant rendered through canonical GrowChamber renderer
- Basic actions: Water, Light, Inspect, Advance Day / Simulate Day, Save Progress
- Local save / reload
- Plant Analyst scan panel
- Optional non-destructive “Take Sample” mechanic

## Known Current Issue (Login / Account Creation)

The live app at growverse.dev throws a request error 404 on login/create account flows.

**Agent Instruction**: 
Diagnose the exact failing request URL. Determine whether the flow is:
- Local-only (no backend)
- API-backed but endpoint missing
- Missing backend entirely

Apply the smallest honest local-first path if a real backend is not yet ready. Do not fake success states.

## Important Honesty & Safety Rules (Non-Negotiable)

- No real-world cannabis cultivation instructions
- No medical or chemical advice
- No secrets of any kind in the repo
- No wallet private keys or seed phrases
- No Algorand production secrets
- No token launch work
- No payment flows
- No fake AI claims
- No fake backend success responses
- No fake wallet state
- No production deploy without explicit owner approval
- `/dev/plant-review` must remain local-dev-only (never publicly exposed)
- No unrelated work in scoped PRs

## Owner Workflow Rules

- One active PR lane at a time unless owner explicitly allows multiple
- Every new work lane must be registered in Mission Control / AI Command Center first
- All closeouts must follow this format:

```
Asked:
Done:
Needs you:
```

If owner action is required, begin the response with:

```
Owner action now:
```

## Agent Processing Rule

Process these documents **one file at a time**. Do not assume missing context. When in doubt, ask via the closeout format.