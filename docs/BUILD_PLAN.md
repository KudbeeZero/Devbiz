# Kudbee Build Plan — Improvements · Weaknesses · Dream Feature

> Living plan + progress memory for the autonomous build program kicked off via
> `/loop` (2026-06-30). One green-merged PR per item. Update the **Status** boxes
> as each lands so the loop never loses its place. Process/plan doc only.

## Goal
Turn the audit's improvement/weakness list + the "dream feature" into shipped,
verified, merged product — ending in an awesome experience for customers and a
fully caught-up, green repo.

## Standing rules for this program
- Develop on `claude/website-improvements-6vwv66`; one purpose per PR; draft → CI
  green → owner-authorized merge (owner has authorized the merge loop).
- Verify in a real browser (headless Chromium) before claiming done; no fabricated
  data or proof.
- **Gated, NOT auto-done:** enabling live payment (Gumroad), and pointing a real
  domain / changing canonical to it. These need explicit owner action — prepare,
  don't flip.

## Backlog & sequence (each = its own PR)

| # | ID | Item | Lane | Status |
|---|----|------|------|--------|
| 0 | DBZ-036 | This plan doc + ledger catch-up | docs | ☑ done (PR #86) |
| 1 | DBZ-037 | **W1** Honest social proof — reframe unverified "150+/50+/98%" stats + named testimonials to defensible claims | content | ☑ done — true stats (6 games / 6 apps / 2 client builds / 100 Lighthouse), testimonials → real "Proof, not promises" case highlights, no fake names/stars |
| 2 | DBZ-038 | **W2** Identity focus — tighten nav/IA so web-design reads as #1; demote/group secondary surfaces | feature/IA | ☑ done — primary nav = Home·Work·Services·Brain·Blog·Contact; Agents/Games/Tools/Doctrine/League grouped under a CSS-only keyboard-accessible "More ▾" |
| 3 | DBZ-039 | **I2** Agent lead-capture — the Kudbee Agent captures an email/intent (no backend; form-endpoint + mailto fallback) | feature | ☑ done — buying-intent + a chip surface an email form; saves to localStorage `kudbee.leads`, POSTs to `LEAD_ENDPOINT` if set else mailto fallback; confirms + offers booking |
| 4 | DBZ-040 | **I3** Storefront demand capture — real "notify me / join the list" on the tiny-apps store (measures demand before Gumroad) | feature | ☐ todo |
| 5 | DBZ-041 | **W3** Demo↔production path source-of-truth — documented base-path convention + launch checklist so client-site links never 404 again | docs/infra | ☐ todo |
| 6 | DBZ-042 | **I1** Domain readiness — centralize the canonical/OG/schema host into a single switch + recommend `kudbee.dev`/`.com`; **HOLD** flipping until owner buys/points DNS | infra | ☐ todo (owner-gated) |
| 7 | DBZ-043 | **D1** "Ship-it" self-serve studio — Phase 1: scaffold the page + intake form | feature | ☐ todo |
| 8 | DBZ-044 | **D1** Phase 2: house-style template system (a few industries) | feature | ☐ todo |
| 9 | DBZ-045 | **D1** Phase 3: live preview generator (describe business → assembled preview) | feature | ☐ todo |
| 10 | DBZ-046 | **D1** Phase 4: convert (book-a-call / export) + agent hand-off + polish | feature | ☐ todo |

## The dream feature — "Ship-it"
A visitor describes their business ("med spa in Naperville") and watches Kudbee
assemble a real, previewable site in the house style, then converts: book a call to
make it real, or export. Client-side, template-driven, no backend required for v1.
Fuses the agent + marketplace + templates + taste into one top-of-funnel moment.

## Session reconciliation (caught up)
This session already shipped & merged (not previously ledgered): PRs **#76–#85** —
Grange Park landing, ModernMed concept (landing/dashboard/kit/blog/PWA) + service
pages + candidate check + mobile bar, homepage web-design-first positioning + real
client previews + booking + perf, site-indexed Kudbee Agent + Brain page + SEO blog,
ModernMed landscape-nav fix, tiny-apps marketplace + install terminal, UTM Builder +
Invoice Generator (live) + Gumroad wiring, and the link-audit fixes (service-page
404s + homepage hash router). All `MERGED`.

## Open owner inputs (unblock when ready)
- Real **Cal.com** link → replaces `cal.com/kudbee` placeholders site-wide.
- **Gumroad** store handle + product slugs → flip `PAYMENT_LIVE = true`.
- **Domain** choice (kudbee.dev / .com) + DNS → flip canonical/OG/schema host.
- Confirm whether the hero **stats/testimonials** are real (drives W1).
