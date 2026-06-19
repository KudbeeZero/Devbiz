# Deployment and Domain Plan

## Current Hosting
- **Platform**: Vercel
- **Live Domain**: growverse.dev
- Cloudflare is **not required** for growverse.dev at this time.

## Future Domains (Owner Approval Required)
- `review.growverse.dev` — Protected review environment
- `api.growverse.dev` — Future backend/API
- `www.growverse.dev` → `growverse.dev` redirect (optional)

## Protected Routes
- Future review route: `/review/plant-review` (only on review.growverse.dev)
- Local development route: `/dev/plant-review` (must remain local-dev-only)

## Deployment Rules
- No production deployment without explicit owner approval.
- Preview deployments (Vercel) are acceptable for review.
- Never expose `/dev/plant-review` publicly.
- Do not move the domain to Cloudflare (or any other provider) without owner approval.

## Agent Instruction
When making changes that affect deployment or domains, document the impact in the PR and closeout.