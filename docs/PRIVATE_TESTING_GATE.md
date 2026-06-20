# Private Testing Gate — Cloudflare Access

The **Studio Lab** (`/lab/*`) and any in-development game routes (e.g.
`/dogfight`, `/flight-lab`, `/lab/aether-wing`) are **private testing surfaces**.
They are protected at the Cloudflare edge with **Cloudflare Access (Zero Trust)** —
not with app code, a password field, or any custom auth logic in this repo.

> **Why edge auth, not app code?** This site is a zero-build static site served by
> Cloudflare. Cloudflare Access gates the request *before* the asset is served, so
> there are no secrets in the repo, no login form to maintain, and nothing to
> bypass client-side. The existing Clerk pattern (in `leaderboard/`) is left
> untouched — that is for real player accounts later, not this private gate.

## What ships in the repo

- `/lab/index.html` — the gated tool-library hub (cards for tools + games).
- `/lab/aether-wing/index.html` — placeholder route for FRONTIER: Aether Wing.
- `robots.txt` + per-path `_headers` add `noindex` so these pages are never
  indexed even before Access is configured. **`noindex` is privacy hygiene, not
  access control** — the real gate is Cloudflare Access below.

**Nothing in the repo enforces login.** Until the owner configures Access in the
dashboard, these routes are reachable by URL in production. Configure Access
before sharing any deployed URL.

## Local development stays open

No auth runs locally. Preview the whole site (including `/lab`) with any static
server:

```bash
python3 -m http.server 8000
# → http://localhost:8000/lab/
```

## Owner setup — one-time, in the Cloudflare dashboard

1. **Zero Trust → Access → Applications → Add an application → Self-hosted.**
2. **Application domain / paths** — add the private paths on your production host
   (and preview host if you want previews gated too):
   - `your-domain/lab` *(and `your-domain/lab/*`)*
   - `your-domain/dogfight`, `your-domain/flight-lab` *(add when those routes exist)*
3. **Policy → Allow.** Add a rule that matches only the people who should get in:
   - **Emails:** your own email (and any teammate you choose to invite later), **or**
   - **Emails ending in:** a domain you control, **or**
   - a Cloudflare Access **group** you maintain.
4. **Identity / login method:** the simplest is **One-time PIN** (Access emails a
   code — no IdP required). Google / GitHub SSO also work if you prefer.
5. **Save.** Visiting a protected path now requires passing the Access policy;
   everything else on the site stays public.

### Granting others access later

Add their email (or add them to the Access group) in the **Allow** policy. No code
change, no redeploy. Remove them the same way to revoke.

## Verify the gate (after configuring)

- In a private/incognito window, open `https://your-domain/lab` → you should hit
  the Cloudflare Access login screen, **not** the hub.
- Complete the one-time PIN with an allow-listed email → the hub loads.
- Confirm a **public** page (e.g. the homepage) still loads with **no** Access
  prompt.

## Out of scope (by design, for this lane)

- No shared-password gate, no custom auth logic, no committed secrets.
- No wallet / blockchain logic.
- No changes to the existing Clerk-based leaderboard auth.
