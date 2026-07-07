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
- [x] 🟡 **Accessibility hardening** — homepage Lighthouse a11y **87 → 100** (mobile): `--text-dim` contrast bump, 24px carousel-dot tap targets + labels, `h4`→`h3` heading order, removed redundant media-tile `aria-label`s (label-in-name). _(PR #101)_

## 🟢 Cleanup
- [ ] 🟢 **Prune merged remote branches** — ~75 stale `origin/claude/*` branches (mostly other efforts: pinball/voidrunner/growverse/mission-control). Delete only the fully-merged ones; owner ok first since they span other work.
- [x] 🟢 **Ledger truth fix** — `BUILD_LEDGER.md` rows `DBZ-035` and `DBZ-048..059` were stale (`DRAFT`/`PLAN`) though all merged. Fixed 2026-07-07: all 12 polish lanes (PRs #112–123) confirmed merged and flipped to `MERGED`; `DBZ-035` flipped too (its branch is gone, content already reflected).
- [ ] 🟢 **SEO follow-ups from the DBZ-048 re-verification (2026-07-07)** — not blocking: (1) `assets/og/home.jpg` was captured before Lane 05's hero changes landed, may no longer be a fully current render; (2) `museum/kudbee-contra/` (added by Lane 11, after Lane 01) has no `canonical`/`og:*`/`robots` meta and isn't in `sitemap.xml`.

## 🌟 Dream feature (north star)
- [ ] 🌟 **Ship-it → real deployed draft → booked call** — after the teaser, the agent interviews for ~60s, generates an *actual multi-page* site (real pages/copy/schema, house style), deploys to a temporary `their-business.kudbee.dev`, and books the call with the draft attached. (Deploy step is owner-gated/backend.) Fuses agent + Ship-it + templates + real deploy into a top-of-funnel no template shop can match.

## 🔍 Found problems (site scan — 2026-06-30)
Read-only scout swept the primary surfaces. **Clean:** no broken internal links or
hash anchors, valid JSON-LD + canonicals everywhere, sitemap entries all resolve,
images/inputs have alt/labels, no fabricated data slipped back in. Findings:

**Actionable now (non-gated):**
- [x] 🟡 **Tools discoverability** — UTM Builder + Invoice Generator now have live
  cards on the homepage **Tools** page card-grid + the site-search index. _(PR #97)_
- [x] 🟢 **Invoice meta length** — `tools/invoice-generator/index.html` meta trimmed
  to 156 chars (≤160). _(PR #97)_
- [ ] 🟢 **Ship-it "NEW" badge** — fine for now (launched today); revisit/remove in a few weeks.

**Already tracked (owner-gated placeholders, re-confirmed by the scan):** the
`cal.com/kudbee` link (32 instances), the capture endpoints (`LEAD_ENDPOINT` /
`WAITLIST_ENDPOINT` / `SHIPIT_ENDPOINT`), `PAYMENT_LIVE=false` (store), and the
greyed "Call or text — number coming soon" line. All covered under 🔒 above.
