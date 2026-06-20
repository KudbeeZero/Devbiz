# Kudbee Scribe — AI Worker

Optional Cloudflare Worker that powers the tool's **AI Deep Analysis** by proxying to the
Anthropic Messages API. The Scribe tool works fully without it (private/offline mode); this
only enables the opt-in AI feature.

## Endpoint

`POST /api/scribe`

```json
{ "text": "your draft…", "preset": "business", "goal": "rewrite" }
```

Response:

```json
{ "rewrite": "…", "suggestions": [{ "type": "", "original": "", "improved": "", "reason": "" }], "summary": "…" }
```

Error responses carry `{ "error": "…" }` and the client degrades gracefully:
- `503 ai_unavailable` — no API key configured on the server.
- `502 upstream_error` — the AI service returned an error.
- `413 too_large` — text exceeds 20,000 characters.

## Deploy

```bash
cd tools/kudbee-scribe/worker
npx wrangler deploy
npx wrangler secret put ANTHROPIC_API_KEY   # paste your Anthropic key when prompted
```

Optional config in `wrangler.toml`:
- `ALLOWED_ORIGINS` — tighten from `*` to your production origin before launch.
- `SCRIBE_MODEL` — defaults to `claude-haiku-4-5` (lowest cost); set `claude-sonnet-4-6`
  for higher-quality rewrites.

## Enable in the tool

Set `SCRIBE_API` near the top of `tools/kudbee-scribe/index.html` to the deployed URL plus
`/api/scribe`, e.g. `https://kudbee-scribe.<account>.workers.dev/api/scribe`. Leaving it
empty keeps Scribe fully private/offline.

## Smoke test

```bash
curl -X POST https://kudbee-scribe.<account>.workers.dev/api/scribe \
  -H 'content-type: application/json' \
  -d '{"text":"This is teh test.","preset":"business","goal":"rewrite"}'
```
