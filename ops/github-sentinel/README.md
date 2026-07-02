# GitHub Ops Sentinel — webhook receiver + API cache

Minimal foundation layer for GitHub monitoring in this repo: a Cloudflare
Worker that receives GitHub webhooks (signature-verified) plus an ETag-aware
caching layer for GitHub API reads. **No UI, no alerts, no multi-repo logic
yet** — those build on top of this.

## Files

| File | Purpose |
| --- | --- |
| `types.ts` | Shared types: worker env, webhook payload subsets, cache contracts |
| `github-cache.ts` | `GitHubCache` — conditional requests (`If-None-Match`), rate-limit awareness, pluggable store |
| `webhook-receiver.ts` | Worker entry point — verifies `X-Hub-Signature-256`, handles `pull_request` / `check_suite`, returns 200 fast |
| `wrangler.toml` | Worker config, separate from the Pages site at the repo root |

## How the cache behaves

- First `fetchJson(path)` → GitHub 200 → body + ETag stored (`source: "network"`).
- Next call → sends `If-None-Match` → GitHub 304 → cached body served
  (`source: "revalidated"`), which **does not count against the rate limit**.
- Rate limit near exhaustion (floor of 5 requests, configurable) → cached
  copy served as `source: "stale"`; if nothing is cached, `RateLimitError`.
- Webhook events invalidate the affected paths so the next read revalidates.

Storage is a per-isolate in-memory `Map` (MVP). To persist across isolates,
implement the `CacheStore` interface over Cloudflare KV or Redis and pass it
to `new GitHubCache({ store })` — the KV binding is stubbed in `wrangler.toml`.

## Deploy

```bash
cd ops/github-sentinel
npx wrangler secret put GITHUB_WEBHOOK_SECRET   # required
npx wrangler secret put GITHUB_TOKEN            # optional, higher rate limits
npx wrangler deploy
```

Then add a webhook on the GitHub repo (Settings → Webhooks):

- **Payload URL:** the deployed Worker URL
- **Content type:** `application/json`
- **Secret:** the same value as `GITHUB_WEBHOOK_SECRET`
- **Events:** Pull requests, Check suites

GitHub's redelivery UI (Settings → Webhooks → Recent Deliveries) is the
easiest way to test end-to-end; a `ping` delivery should return `200 {"ok":true,...}`.

## Local development

```bash
cd ops/github-sentinel
echo 'GITHUB_WEBHOOK_SECRET=devsecret' > .dev.vars   # gitignored by wrangler convention
npx wrangler dev
```

Send a signed test payload:

```bash
BODY='{"zen":"test"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac devsecret | awk '{print $2}')
curl -s -X POST http://localhost:8787 \
  -H 'content-type: application/json' \
  -H 'x-github-event: ping' \
  -H "x-hub-signature-256: sha256=$SIG" \
  -d "$BODY"
```

## Response contract

| Case | Status |
| --- | --- |
| Valid `ping` / `pull_request` / `check_suite` | `200` |
| Valid signature, unhandled event type | `202` (acknowledged, not processed) |
| Missing/bad signature | `401` |
| Non-POST | `405` |
| Secret not configured on the Worker | `503` |
