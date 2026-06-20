# Review Board Route Policy

> ⚠️ **DRAFT — agent-filled gap.** This doc was missing from the owner pack. Drafted
> from the owner-confirmed decision recorded in
> `lab/ai-command-center/lanes/growverse-vercel-readiness.md` (and the Mission
> Control Decision Log). Owner: confirm or replace.

## Confirmed decision (owner, 2026-06-19)
- **Public app:** `growverse.dev`
- **Protected review host:** `review.growverse.dev`
- **Protected review route:** `/review/plant-review`
- **Full review URL:** `https://review.growverse.dev/review/plant-review`
- **`/dev/plant-review`** stays **local-development-only** and is **never public**.

## Current live state (verified)
- `growverse.dev/dev/plant-review` → **404 in production** ✅ (real `NODE_ENV` gate:
  `if (process.env.NODE_ENV !== "development") notFound()`).
- `review.growverse.dev` → DNS resolves but **503** (not yet attached to the Vercel
  project / route not deployed).

## Policy
1. **Never expose `/dev/*`** in a production/preview build. Keep the `NODE_ENV` gate.
2. The reviewable board lives at **`/review/plant-review`**, gated by a **non-secret**
   env flag (e.g. `NEXT_PUBLIC_ENABLE_REVIEW`, default `false`) and protected at the
   deployment level (Vercel Deployment Protection, or Cloudflare Access later).
3. It must render the **canonical GrowChamber** renderer — read-only, no wallet/Algo.
4. Implementation is an **additive PR in the GrowVerse repo** (not devbiz).
