# Grow Telemetry — event collector (owner-only deploy)

A tiny Cloudflare Worker + KV that aggregates anonymous usage events from the
Grow Companion and the music video so the owner can answer "is the audio
working?", "did testers plant a seed?", and "how far did grows get?".

**The site works without this.** The client `track()` helper logs to a local
ring-buffer and only forwards to a collector once one is configured. This Worker
just enables **cross-tester** aggregation.

## What it stores

Anonymous, allow-listed events only — event name, `page`, a random per-browser
`uid`, a coarse timestamp, and a short allow-list of props (`stage`, `day`,
`on`, `ok`, `reason`, `code`, `ct`). **No IPs, cookies, fingerprints, or PII.**
See `ALLOWED_EVENTS` / `ALLOWED_PROPS` in `worker/worker.js`.

## Endpoints

- `POST /collect` — `{event, props?, page?, uid?}` or `{events:[...]}` → `204`
- `GET /stats?token=…` — token-gated aggregates → `{counts, byDay, recent}`
- `GET /health` → `{ok:true}`

## Deploy (OWNER-ONLY — needs `OWNER-OK`)

Deploying a data collector + setting secrets is an owner-only action per
`docs/PR_FLOW.md` §11 (infra / keys / production env). Do **not** deploy from an
agent without an explicit `OWNER-OK: <phrase>` instruction.

```bash
cd tools/grow-telemetry/worker
npx wrangler kv:namespace create GROW_KV     # paste the id into wrangler.toml
npx wrangler secret put STATS_TOKEN          # choose a long random read token
npx wrangler deploy
```

Then wire the client (two one-line edits, owner-only):

1. `lab/grow/index.html` and `lab/music-video/index.html` — set
   `const TELEMETRY_URL = 'https://grow-telemetry.<acct>.workers.dev/collect';`
2. `lab/grow/diagnostics.html` — set `COLLECTOR_URL` (Worker base URL) and
   `COLLECTOR_TOKEN` (the `STATS_TOKEN` value). **Do not commit a real token.**

## Privacy note

Keep `ALLOWED_ORIGINS` pinned to the production origin before launch, keep the
allow-lists narrow, and add a short privacy line to the Grow Companion if/when
collection is enabled. Retention: per-day buckets expire after ~120 days; the
recent ring keeps the last 200 events.
