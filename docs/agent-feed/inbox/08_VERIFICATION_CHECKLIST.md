# Verification Checklist

Use this checklist at the end of scoped work before closing.

## Functional Checks
- [ ] Install succeeds cleanly
- [ ] Lint / typecheck / build passes (if configured)
- [ ] growverse.dev loads without errors
- [ ] Login / create account no longer throws raw 404 (or honest local-first path is documented)
- [ ] First GrowPod can be created/loaded
- [ ] Plant renders through canonical GrowChamber renderer
- [ ] Water, Light, Inspect, and Advance/Simulate Day actions function
- [ ] Plant Analyst scan produces observations and a suggested action
- [ ] Take Sample (if implemented) is non-destructive
- [ ] Save and reload preserves plant state correctly
- [ ] Mobile experience is usable

## Safety & Process Checks
- [ ] No secrets committed to repo
- [ ] `/dev/plant-review` is not publicly accessible
- [ ] Wallet / Algorand integration remains deferred (not introduced)
- [ ] Work stayed within the scoped PR lane
- [ ] Closeout format was followed

## Deployment Checks (if applicable)
- [ ] Vercel preview deploy succeeds (if used)
- [ ] No unintended domain or route exposure