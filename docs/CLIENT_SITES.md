# Client Sites — path convention & launch checklist

> The single source of truth for **where client sites live** and **how their
> links must be written**, so a demo never 404s and a launch never breaks links.
> Created for W3 after the ModernMed `../` back-link bug (PRs #85). Process doc.

## The two homes of every client site

| Stage | Where it lives | Example URL |
|---|---|---|
| **Demo** (now) | a folder in this repo, served at that path | `…workers.dev/clients/modernmed/recovery-suboxone.html` |
| **Production** (launch) | the client's own root domain | `https://modernmedchicago.com/recovery-suboxone/` |

The depth differs by one level. That difference is exactly what broke ModernMed:
a link authored for production can 404 in the demo, and vice-versa.

## The link rule (do this and links work in BOTH stages)

**Link to a sibling page by its real filename, relative to the same folder.**

- ✅ From `clients/<name>/a.html` → `clients/<name>/b.html`: write `href="b.html"`.
- ✅ "Home / logo / breadcrumb" → the client's own landing: write `href="./"`
  (resolves to the folder's `index.html` in the demo).
- ❌ **Never `href="../"`** from a client page — in the demo that escapes to
  `/clients/` (no page → 404). This was the bug.
- ❌ **Avoid root-absolute `/…`** for *intra-site* links in the demo — `/` is the
  Kudbee root, not the client's root. (Root-absolute only becomes correct once the
  site is alone on its own domain.)
- In-page section jumps (`#consult`, `#faq`) are fine; just confirm the `id` exists
  on the **target** page, and that the path in front of the `#` resolves (e.g.
  `./#consult`, not `../#consult`).

### At launch (site moves to its own domain root)
Pages move from `/clients/<name>/<page>.html` to `/<page>/`. Then:
- `href="./"` (home) and same-folder filenames keep working if pages stay as
  files; if you switch to pretty directories (`/recovery-suboxone/`), re-point
  intra-site links to root-absolute `/` and `/<page>/`.
- Re-run the link check (below) on the new structure before going live.

## Per-client launch checklist
- [ ] Point the real domain; remove `noindex,nofollow` from **every** page.
- [ ] Set the real canonical/OG/Twitter host on every page (replace the
      `*.workers.dev` / placeholder domain like `modernmedchicago.com`).
- [ ] Re-point intra-site links per the rule above for the production structure.
- [ ] Update `sitemap.xml` to the production URLs; submit it (Search Console + Bing).
- [ ] Validate JSON-LD (Rich Results Test) and confirm FAQ counts match.
- [ ] Re-run the link audit on the live structure (see below).
- [ ] Client-specific extras live in the client's own folder (e.g.
      `clients/modernmed/SETUP-AND-SUBMIT.md`).

## How to verify links (the audit method)
1. **Scan** for broken internal links: walk every `.html`, resolve each
   `href`/`src`/`data-url` against the file's folder, flag any target that
   doesn't exist (ignore JS template strings like `href=' + url +'`).
2. **Serve & click**: `python3 -m http.server` then load each page and confirm
   "home/back/book" links resolve (a directory with no `index.html` returns 404
   on a static server even though the folder "exists" — CI link-checkers can miss
   this, so spot-check in a browser).
3. **Watch the depth**: for any link, count `../` against the file's folder depth
   from the served root.

## Current client sites
- `clients/modernmed/` — ModernMed Chicago (landing + 4 service pages + blog +
  dashboard + local-SEO kit). Production placeholder domain: `modernmedchicago.com`.
- `clients/grange-park-fastpitch/` — La Grange Park Fastpitch (single landing).
