# Domain launch runbook (Kudbee main site)

> How to move the Kudbee site off `devbiz.kudbee.workers.dev` onto a real domain
> in **one find-replace**, safely. **HOLD the flip until DNS resolves** — pointing
> canonical/OG/schema at a domain that doesn't load yet hurts SEO. Process doc;
> I1 from `BUILD_PLAN.md`. (Client sites keep their *own* domains — not affected.)

## Recommendation
**`kudbee.dev`** — available (checked via GoDaddy 2026-06-30), already the agency
domain credited in client-site footers, and `.dev` reads right for a dev studio.
- `kudbee.com` — **taken** (not available).
- Available alternates if preferred: `kudbee.ai`, `kudbee.io`, `kudbee.studio`,
  `kudbee.co`, `kudbee.net`.
- Register: https://www.godaddy.com/domainsearch/find?domainToCheck=kudbee.dev

## What changes
The host string `devbiz.kudbee.workers.dev` appears **133×** across **11 files**
(canonical, Open Graph, Twitter, JSON-LD, sitemap, robots, llms):

```
index.html · brain/index.html · blog/index.html
blog/build-your-own-memory-layer.html · blog/what-makes-a-website-convert.html
blog/teach-your-team-to-build-ai-agents.html
tools/utm-builder/index.html · tools/invoice-generator/index.html
sitemap.xml · robots.txt · llms.txt
```

## The flip (run only AFTER DNS resolves)
1. **Buy** the domain and, in the Cloudflare dashboard, add it as a **custom
   domain** on the `devbiz` Worker; wait until `https://kudbee.dev/` actually serves.
2. **Find-replace the host** across the repo (one command):
   ```bash
   grep -rl "devbiz.kudbee.workers.dev" --include=*.html --include=*.xml \
     --include=*.txt . | xargs sed -i 's/devbiz\.kudbee\.workers\.dev/kudbee.dev/g'
   ```
3. **Spot-check**: `<link rel="canonical">`, `og:url`, `og:image`, `twitter:*`,
   JSON-LD `url`/`@id`, `sitemap.xml` `<loc>`, `robots.txt` `Sitemap:`, and
   `llms.txt` all read `https://kudbee.dev/…`.
4. **Resubmit** `sitemap.xml` in Google Search Console + Bing; request indexing
   for `/`.
5. (Optional) keep `*.workers.dev` reachable and 301 → `kudbee.dev` so old links
   and previews don't break.
6. Re-run the link audit (see `CLIENT_SITES.md`) on the live domain.

## Why HOLD (don't flip early)
Canonical/OG/schema must point at a URL that loads. If we flip before DNS is
live, every page declares a canonical to a dead host — search engines may drop or
mis-index the site. The find-replace is a 10-second step once DNS is up; there is
no benefit to doing it sooner.

## Owner action to unblock
1. Pick the domain (recommend `kudbee.dev`) and register it.
2. Point it at the Worker (custom domain) and confirm it serves.
3. Tell me "domain is live" — I'll run the find-replace + verification in one PR.
