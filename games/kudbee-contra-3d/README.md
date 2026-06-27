# Kudbee Contra · 3D — engine-built edition (drop-in)

This folder hosts the **Unity WebGL** build of Contra so it can ship on the Kudbee site.
It does **not** replace the lightweight canvas game at `../kudbee-contra/` — that stays live.

The host page (`index.html`) is already wired up. Until a build is dropped in, it shows a
graceful "build pending" panel and is marked `noindex` + left unlinked from the site.

---

## 1. Build in Unity

**Build Settings → Platform: WebGL.** Then in **Player Settings → Publishing Settings**:

- **Compression Format: `Disabled`** ← recommended. Cloudflare Pages compresses responses
  on the fly, so you avoid `Content-Encoding` header juggling and it "just works."
  (If you must use Brotli/Gzip instead, see the note at the bottom.)
- **Name Files As Hashes: off** (so the output keeps predictable names).
- Decompression Fallback: not needed when Compression Format = Disabled.

When you click **Build**, name the build output **`kudbee-contra`**. Unity will produce:

```
Build/
  kudbee-contra.loader.js
  kudbee-contra.data
  kudbee-contra.framework.js
  kudbee-contra.wasm
TemplateData/        (optional — only if you used a custom template)
```

## 2. Drop it in

Copy Unity's `Build/` contents into **this folder's `Build/`** (replacing `.gitkeep`):

```
games/kudbee-contra-3d/Build/kudbee-contra.loader.js
games/kudbee-contra-3d/Build/kudbee-contra.data
games/kudbee-contra-3d/Build/kudbee-contra.framework.js
games/kudbee-contra-3d/Build/kudbee-contra.wasm
```

The host page already points at exactly these paths/names — no code changes needed.

## 3. Test locally

```bash
python3 -m http.server 8000
# open http://localhost:8000/games/kudbee-contra-3d/
```

Confirm the game loads, plays, and the browser console is clean.

## 4. Go-live checklist (only after it plays)

Honesty rule: don't index or link a page that isn't really playable yet. Once verified:

1. In `index.html`, remove the `<meta name="robots" content="noindex,nofollow">` line.
2. Add a link from the site: footer "Games" column + the Work/Games portfolio grid in
   `/index.html` (mirror an existing game link).
3. Add a `<url>` entry to `/sitemap.xml` and a bullet under `## Games` in `/llms.txt`.
4. Commit on a feature lane and open/append the draft PR per `docs/PR_FLOW.md`.

---

## Headers (already handled in `/_headers`)

- `/games/kudbee-contra-3d/Build/*` is long-cached (`immutable`).
- COOP/COEP/CORP are set for `/games/kudbee-contra-3d/*`. These are only required if you
  enable **Unity wasm threads** (multithreading); harmless otherwise.

## If you used Brotli/Gzip compression instead of Disabled

Cloudflare Pages won't auto-set `Content-Encoding` for pre-compressed `.br`/`.gz` files.
You'd then rename outputs (e.g. `kudbee-contra.wasm.br`) and add a `/_headers` block setting
`Content-Encoding: br` (or `gzip`) for `/games/kudbee-contra-3d/Build/*`. Using
**Compression Format = Disabled** avoids all of this — prefer it.
