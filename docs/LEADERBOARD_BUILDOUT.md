# Kudbee Leaderboard System — Complete Buildout Plan

**Status:** IN PROGRESS  
**Target Branch:** `claude/leaderboard-audit-architecture-r5b2xh`  
**Target Merge:** `main`

---

## Executive Summary

This document tracks the complete rebuild and enhancement of Kudbee's leaderboard system:
- ✅ **Phase 0:** Scaffolding + spec documentation — merged (PR #133)
- ✅ **Phase 1:** Server-side ALGO wallet authentication — merged (PR #133)
- ✅ **Phase 2:** Client SDK enhancements — code + unit tests complete;
  **manual browser/wallet test still pending** (see Phase 2 Testing Checklist)
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

## Phase 1: Server-Side ALGO Auth ✅

**Status:** Merged to `main` in PR #133.

### Deliverables
- [x] Implement `verifyAlgoMessage()` in `algo-auth.js`
  - Parse and validate message payload
  - Verify ed25519 signature
  - Check expiration, nonce, timestamp bounds
- [x] Integrate into `resolveAuth()` in `shared/auth.js`
  - Add ALGO pathway (checked before Clerk/demo)
  - Returns `{ userId: 'algo:<address>', name, wallet: address, ... }`
- [x] Run test suite: 37 algo-auth tests passing (`test/algo-auth.test.js`)
- [x] Run full API tests: Clerk + demo still work unchanged
- [x] `leaderboard/shared/` coverage gate green (88.84%, threshold 88%)

### Testing Checklist
- [x] Valid signature path exercised (ed25519 verify, address round-trip via `publicKeyToAddress`)
- [x] Invalid signature rejected (401)
- [x] Expired signature rejected (401)
- [x] Timestamp-in-future / too-old bounds enforced
- [x] Clerk pathway still works (backward compat)
- [x] Demo mode still works (backward compat)
- [ ] **Nonce replay is NOT enforced on the live request path** — `resolveAuth()` calls
      `verifyAlgoMessage()` without a `used_nonces` set, so `verifyAlgoMessage()`'s replay
      check only runs when a caller explicitly passes one (which nothing in production does
      yet). See README "Security notes" — tracked as a follow-up needing durable storage
      (D1/KV), not a Phase 1 test gap.

### Files Modified
```
leaderboard/
  ├─ shared/algo-auth.js (COMPLETE)     281 lines
  ├─ shared/auth.js (MODIFIED)          ALGO pathway integrated into resolveAuth()
  ├─ test/algo-auth.test.js (COMPLETE)  37 tests, all green
  └─ public/config.js, README.md         AUTH_PROVIDERS config + docs
```

---

## Phase 2: Client SDK Enhancements ✅ (code) / ⏳ (manual browser gate)

### Deliverables
- [x] Lazy-load `@perawallet/connect` in `kd-leaderboard.js` (dynamic `import()` from
  esm.sh — ESM-only package, zero-build via CDN, only fetched when `'algo'` is enabled)
- [x] Implement wallet connection: `AlgoWallet.connect()` / `.reconnect()` (silent, on load)
- [x] Implement message signing: `AlgoWallet._sign()` via `peraWallet.signData()`
- [x] Update `Client.prototype._authHeaders()` to send ALGO headers when signed in
- [x] Implement session caching (`localStorage`, re-signs ~60s before server-side expiry)
- [x] Implement `signOut()` / `disconnect()` for ALGO (clears cache + wallet session)
- [ ] **Manual test on dev leaderboard with a real testnet Pera wallet — not yet done.**
  This requires a live browser + a real Pera wallet extension/app, which this coding
  session cannot drive. Documented as a manual gate per `docs/PR_FLOW.md` §8 — do not
  mark Phase 2 fully audit-ready until this is completed or explicitly waived.

### Design notes / honest limitations
- The API this SDK calls (`connect`, `reconnectSession`, `disconnect`, `signData`,
  the `connector.on('disconnect', ...)` event) was verified against Pera's public
  SDK documentation (`@perawallet/connect`), not against a live wallet — the manual
  gate above is what closes that gap.
- "Session caching" reuses the same signed message for its freshness window
  (`ALGO_MAX_AGE_SECONDS`, default 10 min) — it is **not** a 7-day zero-reprompt
  session. See README "How it works" for the follow-up needed (a server-issued
  session-token exchange endpoint) to actually deliver that.
- This PR is scoped to the SDK only — no changes to `leaderboard.html`/`app.js` UI
  (that's Phase 3, per the phase-order rule: don't jump ahead of an approved phase).

### Testing Checklist
- [x] Pure logic unit-tested in Node (11 tests, `test/algo-client.test.js`): nonce format,
  payload shape/field-order (verified byte-identical to what the server reconstructs and
  signs against), base64 encode/decode round-trips, Clerk key decoding unchanged
- [x] `payloadToBase64()` output round-trips through the server's real `parseAlgoMessage()`
- [ ] Pera SDK loads without blocking page (manual — needs a browser)
- [ ] Wallet connect → address displayed (manual)
- [ ] Message signed → signature cached, reused across requests (manual)
- [ ] API calls include ALGO headers and the Worker accepts them end-to-end (manual)
- [ ] Session cache survives page refresh; re-signs near expiry (manual)
- [ ] Sign-out clears ALGO session + disconnects wallet (manual)
- [ ] Fallback to demo if wallet unavailable / user cancels (manual)
- [ ] Works on Chrome + Firefox (desktop) (manual)

### Files Modified
```
leaderboard/
  ├─ client/kd-leaderboard.js (REWRITTEN)   AlgoWallet provider, multi-provider Client
  ├─ test/algo-client.test.js (NEW)         11 tests — pure helpers, no DOM/wallet needed
  └─ README.md, docs/LEADERBOARD_BUILDOUT.md  Updated to match real implementation
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
- [x] Phase 0 PR merged (#133, squashed into the same PR as Phase 1)

### Phase 1 Status
- [x] `algo-auth.js` implementation complete
- [x] Integration with `auth.js` complete
- [x] Test suite execution: 37 tests green, coverage gate passing (88.84%)
- [x] Backward compatibility verified (Clerk + demo unaffected)
- [x] Merged to `main` (PR #133)

### Phase 2 Status
- [x] Client SDK implementation complete (`client/kd-leaderboard.js`)
- [x] Pure-logic unit tests green (11 tests, `test/algo-client.test.js`)
- [ ] Manual browser/wallet test — **not done**, needs a real Pera testnet wallet in an
  actual browser (this coding session cannot drive one). Do not treat Phase 2 as fully
  audit-ready until this manual gate is completed or explicitly waived.

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
