# Kudbee Leaderboard System — Complete Buildout Plan

**Status:** IN PROGRESS  
**Target Branch:** `claude/leaderboard-audit-architecture-r5b2xh`  
**Target Merge:** `main`

---

## Executive Summary

This document tracks the complete rebuild and enhancement of Kudbee's leaderboard system:
- ✅ **Phase 0:** Scaffolding + spec documentation
- ⏳ **Phase 1:** Server-side ALGO wallet authentication
- ⏳ **Phase 2:** Client SDK enhancements
- ⏳ **Phase 3:** UI/UX polish and error handling
- ⏳ **Phase 4:** Multi-game integration (all 9 games)
- ⏳ **Phase 5:** Production deployment configuration

**Total estimated effort:** 2–3 weeks (all phases, development + testing)

---

## Phase 0: Scaffolding & Specification ✅

### Deliverables
- [x] Create `leaderboard/shared/algo-auth.js` module (stub + full comments)
- [x] Create `leaderboard/test/algo-auth.test.js` (test suite structure)
- [x] Update `leaderboard/README.md` with ALGO auth documentation
- [x] Document ALGO integration in CLAUDE.md guardrails
- [x] Create config schema for multi-provider auth
- [ ] Merge Phase 0 commit(s)

### Files Created/Modified
```
leaderboard/
  ├─ shared/algo-auth.js (NEW)         ~250 lines, stub functions with JSDoc
  ├─ test/algo-auth.test.js (NEW)      ~300 lines, test suite (not yet running)
  ├─ README.md (MODIFIED)              Add ALGO section + migration guide
  └─ shared/auth.js (READY)            Will integrate ALGO in Phase 1

CLAUDE.md (MODIFIED)                    Add guardrail: no chain writes, OWNER-OK for NFT proofs
docs/LEADERBOARD_BUILDOUT.md (THIS FILE)
```

---

## Phase 1: Server-Side ALGO Auth ⏳

### Deliverables
- [ ] Implement `verifyAlgoMessage()` in `algo-auth.js`
  - Parse and validate message payload
  - Verify ed25519 signature
  - Check expiration, nonce, timestamp bounds
- [ ] Integrate into `resolveAuth()` in `shared/auth.js`
  - Add ALGO pathway (check before Clerk/demo)
  - Return `{ userId: 'algo:<address>', name, wallet: address, ... }`
- [ ] Run test suite: all 15+ algo-auth tests passing
- [ ] Run full API tests: verify Clerk + demo still work
- [ ] Verify D1 schema works with `algo:<address>` user_ids

### Testing Checklist
- [ ] Valid signature verifies (mock Pera + ed25519)
- [ ] Invalid signature rejected (401)
- [ ] Expired signature rejected (401)
- [ ] Nonce replay attempt rejected (401)
- [ ] Timestamp bounds enforced
- [ ] Clerk pathway still works (backward compat)
- [ ] Demo mode still works (backward compat)
- [ ] Mixing auth types rejected (only one valid)

### Files Modified
```
leaderboard/
  ├─ shared/algo-auth.js (COMPLETE)     ~250 lines
  ├─ shared/auth.js (MODIFIED)          +30 lines for integration
  ├─ test/algo-auth.test.js (COMPLETE)  ~300 lines, all tests green
  └─ test/api.test.js (MODIFIED)        +15 tests for ALGO flows
```

---

## Phase 2: Client SDK Enhancements ⏳

### Deliverables
- [ ] Lazy-load Pera SDK in `kd-leaderboard.js`
- [ ] Implement wallet connection: `connectAlgoWallet()`
- [ ] Implement message signing: `signAlgoMessage()`
- [ ] Update `_authHeaders()` to use ALGO headers when signed in
- [ ] Implement session caching (localStorage)
- [ ] Implement `signOut()` for ALGO (clear session + disconnect)
- [ ] Test on dev leaderboard with testnet Pera

### Testing Checklist
- [ ] Pera SDK loads without blocking page
- [ ] Wallet connect → address displayed
- [ ] Message signed → signature cached
- [ ] API calls include ALGO headers
- [ ] Session survives page refresh
- [ ] Sign-out clears ALGO session
- [ ] Fallback to demo if wallet unavailable
- [ ] Works on Chrome + Firefox (desktop)

### Files Modified
```
leaderboard/
  ├─ client/kd-leaderboard.js (MODIFIED)  +~300 lines for ALGO support
  ├─ public/config.js (MODIFIED)          Add AUTH_PROVIDERS config
  └─ test/integration.test.js (NEW)       Browser/SDK integration tests
```

---

## Phase 3: UI/UX Polish ⏳

### Deliverables
- [ ] Update `leaderboard.html` sign-in UI
  - New button: "🔗 Connect ALGO Wallet"
  - Display connected wallet address (truncated)
  - "Disconnect wallet" option
- [ ] Update `app.js` with provider-choice modal
  - On first visit: show "Choose how to sign in"
  - Options: ALGO wallet, Guest (demo)
  - Remember choice for session
- [ ] Game result overlay updates
  - Show player's signed-in identity
  - Direct "Post to leaderboard" button
  - Clear error states
- [ ] Styling & responsive design
  - Match existing Kudbee aesthetic
  - Mobile-friendly wallet UI
  - Dark/light mode support

### Testing Checklist
- [ ] Sign-in modal displays correctly
- [ ] Wallet address truncation (8 chars…4 chars)
- [ ] Responsive on mobile (Pera mobile app detection)
- [ ] Error states clear and actionable
- [ ] Transitions smooth (no jank)
- [ ] Accessibility: keyboard + screen reader

### Files Modified
```
leaderboard/
  ├─ public/leaderboard.html (MODIFIED)   +~50 lines, new UI sections
  ├─ public/app.js (MODIFIED)             +~150 lines, provider logic
  └─ public/styles.css (MODIFIED)         +~100 lines, new component styles
```

---

## Phase 4: Multi-Game Integration ⏳

### Deliverables
- [ ] Wire leaderboard into all 9 games
  - Add `KD_LB_CONFIG` + SDK script tag
  - Define game-specific metrics in `core.js`
  - Add "Post to leaderboard" button on game-over screen
- [ ] Games to integrate:
  1. ✅ Kudbee Riff (already done)
  2. ✅ Kudbee Riff II (already done)
  3. [ ] Kudbee Darts (metrics: rating, bestCheckout, wins, etc.)
  4. [ ] Kudbee Voidrunner (metrics: score, distance)
  5. [ ] Kudbee Contra (metrics: levels beaten, time)
  6. [ ] Kudbee Munch (metrics: score, combos)
  7. [ ] Kudbee Pinball (metrics: score, multipliers)
  8. [ ] Kudbee Puzzles (metrics: score, time)
  9. [ ] Kudbee Orbital (metrics: score, waves)

### Testing Checklist
- [ ] Submit score from each game
- [ ] Verify metrics recorded correctly
- [ ] Scores appear on leaderboard
- [ ] Cross-game rankings work
- [ ] Graceful degradation if API is down

### Files Modified
```
games/
  ├─ kudbee-darts/index.html (MODIFIED)
  ├─ kudbee-voidrunner/index.html (MODIFIED)
  ├─ kudbee-contra/index.html (MODIFIED)
  ├─ kudbee-munch/index.html (MODIFIED)
  ├─ kudbee-pinball/index.html (MODIFIED)
  ├─ kudbee-puzzles/index.html (MODIFIED)
  ├─ kudbee-orbital/index.html (MODIFIED)
  └─ shared/leaderboard-metrics.js (NEW)   Shared metric definitions

leaderboard/
  └─ shared/core.js (MODIFIED)             Add metrics for 7 new games
```

---

## Phase 5: Production Deployment ⏳

### Deliverables
- [ ] Finalize `wrangler.toml` (no secrets hardcoded)
- [ ] Verify D1 schema migrations
- [ ] Set up monitoring/alerting
- [ ] Document rollout procedure
- [ ] Testnet deployment verification
- [ ] Mainnet flip (owner approval required)

### Testing Checklist
- [ ] Testnet: sign in with Pera testnet → post score → see on leaderboard
- [ ] Mainnet: same flow (after owner approval)
- [ ] Performance: signature verification < 100ms
- [ ] Monitoring: auth attempt logging, error rates

### Files Modified
```
leaderboard/
  ├─ worker/wrangler.toml (REVIEWED)
  ├─ worker/schema.sql (VERIFIED)
  └─ README.md (DEPLOYMENT SECTION UPDATED)

.github/workflows/ (NEW/MODIFIED)
  └─ leaderboard-deploy.yml (deployment triggers)
```

---

## Progress Tracker

### Phase 0 Status
- [x] Phase 0 scaffolding complete
- [x] Spec documentation created
- [ ] Awaiting Phase 0 PR merge

### Phase 1 Status
- [ ] `algo-auth.js` implementation (in progress)
- [ ] Integration with `auth.js` (pending)
- [ ] Test suite execution (pending)
- [ ] Backward compatibility verification (pending)

### Phase 2 Status
- [ ] Client SDK enhancement (not started)

### Phase 3 Status
- [ ] UI polish (not started)

### Phase 4 Status
- [ ] Multi-game integration (not started)

### Phase 5 Status
- [ ] Deployment config (not started)

---

## Rollback Plan

If issues are discovered:
1. **Phase 0:** Revert scaffolding commit, no data affected
2. **Phase 1:** Revert auth changes, Clerk + demo still work
3. **Phase 2:** Revert client SDK, fallback to demo mode
4. **Phase 3:** Revert UI changes, leaderboard still functional
5. **Phase 4:** Revert game integrations individually
6. **Phase 5:** Revert deployment, no prod data loss

All changes are **backward compatible** and can be safely reverted without data loss.

---

## Risk Matrix

| Risk | Phase | Likelihood | Mitigation |
|------|-------|------------|-----------|
| Pera SDK loading fails | 2 | Low | Fallback to demo mode |
| Signature verification slow | 1 | Low | Cache sessions; benchmark nacl |
| Nonce replay attack | 1 | Med | Store nonces in D1 |
| User loses wallet access | 2 | High | Alternative sign-in + recovery |
| Mainnet/testnet mismatch | 5 | High | Config flag + documentation |
| Data loss on deploy | 5 | Low | Backup D1 before migration |

---

## Sign-Off Checklist

Before final merge to `main`:
- [ ] All phases complete (0–5)
- [ ] Test coverage: 20+ new tests, all passing
- [ ] Backward compatibility verified
- [ ] Manual QA: desktop + mobile, Chrome/Firefox/Safari
- [ ] Performance: no regressions
- [ ] Security: no new vulnerabilities
- [ ] Documentation: README + CLAUDE.md updated
- [ ] Owner review + approval
- [ ] PR merged to `main`

---

## Timeline

| Phase | Start | Duration | End |
|-------|-------|----------|-----|
| 0 | Day 1 | 1 day | Day 1 |
| 1 | Day 2 | 2–3 days | Day 4 |
| 2 | Day 5 | 2–3 days | Day 7 |
| 3 | Day 8 | 1–2 days | Day 9 |
| 4 | Day 10 | 2–3 days | Day 12 |
| 5 | Day 13 | 1 day | Day 13 |

**Total:** ~2 weeks (aggressive, with parallel work possible)

---

## Next Steps

1. **Immediate:** Execute Phase 0 (currently in progress)
2. **This session:** Phases 0–2 (scaffolding + core auth)
3. **Follow-up:** Phases 3–5 (UI + integration + deploy)

See individual phase sections above for detailed work items.
