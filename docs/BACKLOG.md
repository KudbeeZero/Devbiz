# Kudbee Backlog / To-Do

> The living to-do list. Anything not-yet-done lives here with a priority and a
> status box. **Working rule:** one item → one green-merged PR; when a problem is
> found, add it here and put an agent on it; keep this list current. Completed
> program work is recorded in [`BUILD_PLAN.md`](BUILD_PLAN.md); shipped lanes in
> [`BUILD_LEDGER.md`](BUILD_LEDGER.md).

## How we work this list
1. **Always complete the loop** — every item ends in a verified, CI-green, merged PR.
2. **Found a problem → log it here**, then dispatch an agent (or take it) — don't let it go stale.
3. **One PR = one purpose.** Verify in a real browser before claiming done. No fabricated data.
4. Tick the box + note the PR when an item lands.

Priority: 🔴 high · 🟡 medium · 🟢 low · 🔒 owner-gated (needs the owner to act first)

---

## 🔒 Owner-gated — unblock the funnel (highest leverage once unblocked)
These make the site actually *transact / measure*. All the UI is built and waiting.
- [ ] 🔒 **Real Cal.com link** → replace `cal.com/kudbee` everywhere (homepage, brain, blog, ship-it, store).
- [ ] 🔒 **Form endpoint** (Formspree/Lemon/Formsubmit) → lights up all capture in one shot: agent `LEAD_ENDPOINT`, store `WAITLIST_ENDPOINT`, ship-it `SHIPIT_ENDPOINT`. Until then it's localStorage + mailto.
- [ ] 🔒 **Gumroad products** → set the store handle + per-app slugs, flip `PAYMENT_LIVE = true` (`index.html` store script).
- [ ] 🔒 **Domain** → register `kudbee.dev` (recommended; `.com` taken), point it at the Worker, then run the one-command flip in [`DOMAIN_LAUNCH.md`](DOMAIN_LAUNCH.md).
- [ ] 🔒 **Confirm hero stats / testimonials** are real (or keep the honest versions). Real X/LinkedIn URLs + a phone/SMS number to light up those channels.

## 🔴 Build — next phase
- [ ] 🔴 **Measurement loop** — add privacy-friendly analytics (Cloudflare Web Analytics or Plausible) so we can see views + conversions; we're currently flying blind.
- [ ] 🔴 **One real, end-to-end case study** — take ModernMed (or a real client) to production and write before → scope → outcome. Replaces self-referential proof.
- [ ] 🟡 **Accessibility hardening** — homepage Lighthouse a11y ~87 (palette contrast, tap-target sizing, heading order). Its own lane; touches brand contrast, so confirm look.

## 🟢 Cleanup
- [ ] 🟢 **Prune merged remote branches** — ~75 stale `origin/claude/*` branches (mostly other efforts: pinball/voidrunner/growverse/mission-control). Delete only the fully-merged ones; owner ok first since they span other work.
- [ ] 🟢 **Ledger truth fix** — `BUILD_LEDGER.md` row `DBZ-035` still reads `DRAFT` but its branch (`claude/ledger-reconcile-session`) is merged. One-line docs fix.

## 🌟 Dream feature (north star)
- [ ] 🌟 **Ship-it → real deployed draft → booked call** — after the teaser, the agent interviews for ~60s, generates an *actual multi-page* site (real pages/copy/schema, house style), deploys to a temporary `their-business.kudbee.dev`, and books the call with the draft attached. (Deploy step is owner-gated/backend.) Fuses agent + Ship-it + templates + real deploy into a top-of-funnel no template shop can match.

## 🔍 Found problems (site scan — 2026-06-30)
Read-only scout swept the primary surfaces. **Clean:** no broken internal links or
hash anchors, valid JSON-LD + canonicals everywhere, sitemap entries all resolve,
images/inputs have alt/labels, no fabricated data slipped back in. Findings:

**Actionable now (non-gated):**
- [ ] 🟡 **Tools discoverability** — UTM Builder + Invoice Generator are in the store
  but not linked from the homepage **Tools** page card-grid. Add them.
- [ ] 🟢 **Invoice meta length** — `tools/invoice-generator/index.html` meta description
  is 161 chars; trim to ≤160.
- [ ] 🟢 **Ship-it "NEW" badge** — fine for now (launched today); revisit/remove in a few weeks.

**Already tracked (owner-gated placeholders, re-confirmed by the scan):** the
`cal.com/kudbee` link (32 instances), the capture endpoints (`LEAD_ENDPOINT` /
`WAITLIST_ENDPOINT` / `SHIPIT_ENDPOINT`), `PAYMENT_LIVE=false` (store), and the
greyed "Call or text — number coming soon" line. All covered under 🔒 above.
