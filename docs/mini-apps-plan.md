# Kudbee Mini Apps — Landing Pages & Monetization Plan

> A roadmap for turning small, self-contained "mini apps" into products you can
> sell from the Kudbee site — each with its own landing page, tied back to the
> homepage, with one-time purchases powered by Stripe.

**Decisions locked in (2026-06-18):**

| Decision | Choice |
|---|---|
| Pricing model | **One-time purchase** (pay once, unlock forever) |
| Stripe rollout | **Fastest path first** — Stripe Payment Links (no backend), upgrade to real gated unlock later |
| First product | **A brand-new mini app** (see candidate ideas below) |
| Reference inspiration | protocols.io — clean SaaS landing, free tier + paid upgrade, single clear CTA |

---

## 1. Where you are today

You already have most of the foundation:

- **`index.html`** — single-file, zero-build marketing site (CSS-only routing,
  design tokens, dark/light theme, Pricing + Tools sections). Deployed on
  **Cloudflare Pages** (`wrangler.toml` serves repo root).
- **`tools/token-analyzer/`** — your first "mini app": a standalone, zero-build
  browser tool. This is the exact shape every future mini app will take.
- **`leaderboard/worker/`** — a real **Cloudflare Worker + D1** backend that
  already verifies **Clerk** JWTs and serves `/api/*`. This is the muscle we'll
  reuse for *real* paid unlocks in Phase 2 — you don't have to build a backend
  from scratch.

So the gap is small: a repeatable **landing-page + paywall template**, a
**store grid** on the homepage, and a **Stripe** hookup.

---

## 2. Target architecture

A new top-level **`apps/`** directory holds each sellable mini app. (Keep
`tools/` as-is for free/utility tools; `apps/` is the storefront.)

```
apps/
  _template/              Copy this to start any new mini app
    index.html            Landing page (marketing + demo + Buy button)
    app.html              The actual mini app (free tier + Pro features)
    README.md             What it is, pricing, changelog
  <your-first-app>/
    index.html
    app.html
assets/
  kudbee.css              Shared design tokens + components (extracted from index.html)
  kudbee-paywall.js       Tiny client lib: checks unlock state, opens checkout
legal/
  terms.html
  refund-policy.html
  privacy.html
docs/
  mini-apps-plan.md       (this file)
```

**Per-app layout — two files:**

1. **`index.html` = the landing page.** protocols.io-style: a focused hero
   (what it does in one line), a live/embedded demo or screenshot, 3–6 feature
   blocks, a simple pricing card (Free vs one-time Pro), FAQ, and **one primary
   CTA: "Get Pro — $X"**. This is the page you link to from the homepage and
   share on social.
2. **`app.html` = the working app.** Loads `kudbee-paywall.js`, runs free by
   default, and unlocks Pro features when the user owns it.

This keeps the zero-build, no-framework philosophy: plain HTML/CSS/JS, linked
shared assets, nothing to compile.

---

## 3. Monetization mechanics (one-time purchase)

### Phase A — Fastest path: Stripe Payment Links (no backend)

Goal: **be able to take money this week.**

1. Create a Stripe account; add a **Product** with a **one-time price** (e.g.
   `Pro Unlock — $9`).
2. Create a **Payment Link** for it. Set the link's **after-payment redirect**
   to your app's success URL, e.g.
   `https://kudbee.com/apps/<app>/app.html?unlocked=1&cs={CHECKOUT_SESSION_ID}`.
3. The landing page "Get Pro" button just opens the Payment Link.
4. `kudbee-paywall.js` on `app.html`:
   - If `?unlocked=1` is present on return from Stripe, write an unlock flag to
     `localStorage` (and clean the URL).
   - On every load, read that flag to decide free vs Pro.

**Honest tradeoff:** with Payment Links alone there's no server verification, so
the unlock is effectively **honor-system / convenience** (a savvy user could set
the flag manually). That's an accepted, standard tradeoff for low-ticket tools
and lets you validate demand with near-zero engineering. We harden it in Phase B.

### Phase B — Real gated unlock (Stripe Checkout + Worker + Clerk)

Once an app is selling, make ownership real. You already have the pieces.

1. **Sign-in:** reuse Clerk (already wired in the leaderboard client) so a buyer
   has a stable user id.
2. **Checkout:** add a `POST /api/checkout` route to the Worker that creates a
   Stripe **Checkout Session** with `client_reference_id = <clerk_user_id>` and
   your one-time price. Return the session URL; the button redirects to it.
3. **Webhook:** add `POST /api/stripe/webhook` to the Worker. On
   `checkout.session.completed`, record the entitlement in **D1**
   (`entitlements(user_id, app, purchased_at)`). Verify the Stripe signature
   with a `STRIPE_WEBHOOK_SECRET` (Worker secret).
4. **Entitlement check:** add `GET /api/entitlements?app=<slug>`; `app.html`
   calls it with the Clerk session token to unlock Pro. Now ownership is
   server-verified and survives across devices.

`STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` live only as **Worker secrets** —
never in client code. This mirrors how the leaderboard Worker already handles
Clerk secrets.

---

## 4. Homepage integration ("tie to my homepage")

- **Rename/repurpose the `Tools` page → `Apps`** (or add a new `Apps` nav item).
  Turn the current card grid into a **store grid**: each card shows the app
  name, one-liner, a tag row, a price badge (`Free` / `$9 one-time`), and two
  buttons: **"Try free"** (→ `apps/<slug>/app.html`) and **"Learn more"**
  (→ `apps/<slug>/index.html`).
- Add a one-line teaser + link in the **hero** and the **footer** "Studio"
  column so every page funnels to the store.
- Keep `tools/token-analyzer` listed as a free tool to show range.
- Replace the `yourdomain.com` placeholders (canonical + OG tags in `index.html`)
  with your real domain so shared links preview correctly.

---

## 5. First product — brand-new mini app

Criteria: small enough to ship fast, zero-build, useful repeatedly (so a
one-time price feels fair), and on-brand for an AI-native dev studio.

| Idea | What it does | Free vs Pro (one-time) | Why it fits |
|---|---|---|---|
| **Prompt Vault** ⭐ | Local-first manager for your AI prompts: save, tag, search, one-click copy, variables/placeholders | Free: 25 prompts. Pro: unlimited + folders + import/export + sync-ready | Pairs perfectly with Token Analyzer; daily-use; clean free→Pro line |
| **OG / Social Card Studio** | Generate share images & favicons for sites/apps from templates | Free: watermark + 2 templates. Pro: no watermark + all templates + PNG/SVG export | Concrete output devs happily pay once for |
| **Brand Kit / Gradient-Mesh Generator** | Build the exact gradient-mesh + token palette your site uses; export CSS/Tailwind | Free: preview. Pro: export tokens + save kits | Showcases your aesthetic; markets the studio itself |
| **AI Project Quoter** | Estimate token + time cost of an AI build before you start | Free: single estimate. Pro: save/compare + client-ready PDF | Natural sibling to Token Analyzer; B2B angle |

**Recommendation: build _Prompt Vault_ first.** It's the smallest to ship, it's
the kind of thing your audience uses every day, the free/Pro split is obvious and
non-annoying, and it reinforces the "AI-native developer tools" story you've
already started with Token Analyzer.

> Final pick is yours — the template in §2 means swapping the first app for any
> of the others is cheap.

---

## 6. Supporting pieces for selling

- **Legal pages** (`legal/`): lightweight Terms, Refund Policy, and Privacy.
  Stripe and buyers expect these; link them from footer + checkout.
- **Analytics:** enable **Cloudflare Web Analytics** (privacy-friendly, no
  cookie banner) and track `buy_click` / `unlocked` events so you can see the
  funnel.
- **Email receipts:** Stripe sends these automatically — no work needed.
- **Support:** a single `support@` mailto in the footer is enough to start.

---

## 7. Phased roadmap (suggested PR sequence)

Following your "one PR open at a time" working agreement:

| Phase | Deliverable | Stripe needed? |
|---|---|---|
| **0** | This plan (doc only) | No |
| **1** | `assets/kudbee.css` + `apps/_template/` (landing + app + paywall stub) | No |
| **2** | First mini app (e.g. Prompt Vault) built free-tier-only + its landing page | No |
| **3** | Homepage `Apps` store grid + footer/hero links + real domain in meta tags | No |
| **4** | **Phase A Stripe:** Payment Link + `kudbee-paywall.js` localStorage unlock → first real sales | Yes (links) |
| **5** | `legal/` pages + Cloudflare Web Analytics | No |
| **6** | **Phase B Stripe:** Worker `/api/checkout` + `/api/stripe/webhook` + `/api/entitlements`, Clerk-gated Pro | Yes (keys+webhook) |

Phases 1–4 get you to **live, paying customers**. Phases 5–6 harden and scale.

---

## 8. Open items for you

1. **Domain** — what's the real production domain? (replace `yourdomain.com`).
2. **Price point** — confirm the one-time price (suggest **$7–$12** for a first
   tool to reduce friction).
3. **First app** — confirm Prompt Vault, or pick another from §5.
4. **Stripe account** — create it (or confirm it exists) so Phase 4 isn't blocked.

Once you confirm 2–4, the next step is **Phase 1** (shared CSS + app template).
