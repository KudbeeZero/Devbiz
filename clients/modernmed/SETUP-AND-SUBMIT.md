# ModernMed — Launch Setup, Sitemap Submission & AI Readiness

> Everything to flip on once the site goes live on the real domain. The concept demo is
> `noindex`; before launch, remove `noindex`, set the real domain, and work this checklist.

---

## 1. Where to submit the sitemap (and how)
The sitemap lives at `https://modernmedchicago.com/sitemap.xml` (template included).

| Where | What to do | Why |
|---|---|---|
| **Google Search Console** | Verify the domain → **Sitemaps** → submit `sitemap.xml`. Then "Inspect URL" + **Request indexing** for the homepage and each new article. | The #1 channel; also where you watch rankings, clicks, Core Web Vitals, and coverage errors. |
| **Bing Webmaster Tools** | Verify → submit the same `sitemap.xml`. You can **import directly from Search Console**. | Bing also powers DuckDuckGo, Yahoo, and **Microsoft Copilot** — important for AI answers. |
| **IndexNow** (via Bing) | Turn on IndexNow so new/updated pages ping search engines instantly. | Near-instant discovery of new blog posts. |

You do **not** submit sitemaps to "Google" and "Bing" search boxes — only inside their
Webmaster/Search Console tools. No other submission is needed; everything else discovers you via links + sitemap.

## 2. Make it AI-ready (so AI search & assistants cite you)
Already built into the site — verify each:
- **Structured data (JSON-LD):** MedicalClinic + Physician + FAQPage on the homepage; Article/MedicalWebPage on the blog. **Validate** at Google's [Rich Results Test](https://search.google.com/test/rich-results) and the [Schema Markup Validator](https://validator.schema.org/).
- **`llms.txt`** at the domain root — a plain-language summary AI models read. Keep it current.
- **`robots.txt`** explicitly **allows AI crawlers** (GPTBot, OAI-SearchBot, PerplexityBot, Google-Extended, ClaudeBot) and points to the sitemap. Keep these `Allow` if you want visibility in ChatGPT/Perplexity/Copilot/Gemini.
- **Semantic HTML + clear headings + FAQs** — already in place; this is what AI extracts.
- **Google Business Profile** feeds Google's AI Overviews and Maps — optimize it (see the Local Visibility Kit).

## 3. Mobile — and the "plugin packs" question
This site is **hand-built and static**, which is the upgrade: it's faster than any WordPress + plugin stack, with no plugin bloat, security surface, or update treadmill.
- **PWA installed:** `manifest.webmanifest` + service worker + icons → patients can "Add to Home Screen," and the shell works offline. That's the real mobile advance.
- **Performance:** non-render-blocking fonts, a 30fps canvas, zero layout shift. Lighthouse mobile: **Landing 92 / Blog 100**.
- **If you ever stay on WordPress instead**, the equivalent plugin pack would be: **Rank Math or Yoast** (SEO/schema), **WP Rocket** (caching/speed), **Perfmatters** (script control), **ShortPixel** (image compression), **Wordfence** (security). We replicate all of that natively here — no plugins, no monthly licenses.

## 4. Are we using Lighthouse? Yes.
Every page is tested with **Google Lighthouse (mobile)** before shipping. Current scores:
- **Landing:** Performance 92 · Accessibility 100 · Best Practices 96 · SEO 63
- **Blog article:** Performance 100 · Accessibility 100 · Best Practices 96 · SEO 63
- **SEO shows 63 only because the demo is `noindex`** (intentional). Removing `noindex` at launch takes SEO to ~100. The lone Best-Practices item is a sandbox font-load console note that doesn't occur on the live host.
- Core Web Vitals are green (LCP ~1.2s, CLS 0).

## 5. Content / blog plan
The blog is live with a flagship article (**"The First 72 Hours of Suboxone"**) — a genuine linkable asset that also earns AI citations. Suggested cadence: **2–4 posts/month**, each mapped to a service line and target keyword:
- Recovery: home induction, what is precipitated withdrawal, naltrexone vs buprenorphine
- Men's health: low-T signs, is TRT safe, TRT cost
- Weight: GLP-1 explained, semaglutide side effects
- Mental health: SPRAVATO candidacy, ketamine vs esketamine
Each post: `Article`/`MedicalWebPage` schema, Dr. Oyasu author + "medically reviewed," a consult CTA, and an internal link to its service page.

## 6. Pre-launch checklist
- [ ] Point the real domain at the site; remove `noindex,nofollow` from every page.
- [ ] Replace placeholders: review link/Place ID, any TBD contact details, confirm hours.
- [ ] Consolidate the 3 old domains → 301-redirect into this one (per the SEO battle plan, Tier 0).
- [ ] Verify in Google Search Console + Bing Webmaster Tools; submit `sitemap.xml`; turn on IndexNow.
- [ ] Validate all structured data (Rich Results Test + Schema validator).
- [ ] Claim/optimize the Google Business Profile; fix NAP everywhere; start the review engine (Local Visibility Kit).
- [ ] Stand up **HIPAA-safe analytics** (BAA-covered/server-side — never standard GA/Meta Pixel on medical pages).
- [ ] Re-run Lighthouse on the live domain; confirm SEO ~100 and CWV green.
- [ ] Request indexing for the homepage + each article.

---
*Concept setup guide by Kudbee. Not legal advice — confirm HIPAA/marketing-compliance decisions with counsel and execute under appropriate BAAs.*
