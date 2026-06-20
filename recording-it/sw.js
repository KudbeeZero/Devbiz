// sw.js — Service Worker for the Recording It sub-app.
//
// Two jobs:
//   1. Cache WASM binaries + ML model files on first fetch so the app works offline and starts
//      fast on repeat visits.
//   2. Inject COOP/COEP headers on navigation responses, so cross-origin isolation
//      (SharedArrayBuffer / multi-threaded ffmpeg.wasm) works even on static hosts that can't set
//      response headers themselves. Our root _headers file already does this for Cloudflare/
//      Netlify; the SW is the belt-and-suspenders path for hosts (e.g. GitHub Pages) that don't.
//
// SCOPE: this worker is registered with { scope: '/recording-it/' }, so it only ever controls the
// Recording It app — never the Kudbee marketing site at /.
//
// Vanilla SW code (no Workbox), to keep the zero-extra-dependency spirit of the repo.

// Cache names MUST match src/model-cache.js so files fetched through either path are shared.
const WASM_CACHE = 'kudbee-wasm-v1';
const MODEL_CACHE = 'kudbee-models-v1';
const APP_CACHE = 'kudbee-app-v1';

// App-shell files to pre-cache on install. Only files that actually exist under /recording-it/ —
// workers and WASM are intentionally excluded (they're large and fetched lazily on first use).
const APP_SHELL = [
  '/recording-it/',
  '/recording-it/index.html',
  '/recording-it/styles.css',
  '/recording-it/app.js',
  '/recording-it/src/capability-check.js',
  '/recording-it/src/worker-protocol.js',
  '/recording-it/src/worker-pool.js',
  '/recording-it/src/worker-bridge.js',
  '/recording-it/src/model-cache.js',
];

// --- INSTALL: warm the app shell ------------------------------------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) =>
      // addAll is atomic-ish: if any file 404s the whole install fails, which is what we want —
      // a broken shell should not silently "succeed".
      cache.addAll(APP_SHELL),
    ),
  );
  // Activate this version immediately rather than waiting for old tabs to close.
  self.skipWaiting();
});

// --- ACTIVATE: prune stale caches -----------------------------------------------------------
self.addEventListener('activate', (event) => {
  const keep = new Set([WASM_CACHE, MODEL_CACHE, APP_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => !keep.has(n)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()), // take control of open clients now
  );
});

// --- Helpers --------------------------------------------------------------------------------

/** Heuristic: is this a WASM core asset we want in WASM_CACHE? */
function isWasmRequest(url) {
  return url.pathname.endsWith('.wasm') || url.href.includes('ffmpeg-core');
}

/** Heuristic: is this an ML model file we want in MODEL_CACHE? */
function isModelRequest(url) {
  return (
    url.hostname.includes('huggingface.co') ||
    url.hostname.includes('tessdata.projectnaptha.com') ||
    url.pathname.endsWith('.tflite') ||
    url.pathname.endsWith('.onnx')
  );
}

/**
 * Cache-first fetch into a named cache. On a hit for a .wasm file we repair the Content-Type if a
 * CDN served it as octet-stream — `application/wasm` is required for streaming compilation.
 */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    return fixWasmMime(request, cached);
  }
  const response = await fetch(request);
  // Only cache successful, complete responses (status 200). Opaque/redirect responses are skipped.
  if (response && response.status === 200) {
    cache.put(request, response.clone());
  }
  return fixWasmMime(request, response);
}

/** If the URL is .wasm but the response Content-Type is wrong, re-wrap with application/wasm. */
function fixWasmMime(request, response) {
  if (!response) return response;
  const url = new URL(request.url);
  if (url.pathname.endsWith('.wasm') && response.headers.get('content-type') !== 'application/wasm') {
    const headers = new Headers(response.headers);
    headers.set('content-type', 'application/wasm');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
  return response;
}

/**
 * Navigation handler: serve from network, fall back to the cached shell offline, and ALWAYS
 * re-emit with COOP/COEP so the document is cross-origin isolated even when the host can't set
 * those headers. We must reconstruct the Response because header objects on a fetched Response are
 * immutable.
 */
async function handleNavigate(request) {
  let response;
  try {
    response = await fetch(request);
  } catch {
    // Offline: fall back to the cached index for the app shell.
    const cache = await caches.open(APP_CACHE);
    response = (await cache.match(request)) || (await cache.match('/recording-it/index.html'));
    if (!response) throw new Error('Offline and no cached shell available');
  }

  const modifiedHeaders = new Headers(response.headers);
  modifiedHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
  modifiedHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: modifiedHeaders,
  });
}

/**
 * Stale-while-revalidate for same-origin app-shell assets: serve the cached copy instantly, then
 * refresh it in the background so the next load is up to date.
 */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(APP_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.status === 200) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached); // network failed — the cached copy (if any) is our answer
  return cached || network;
}

// --- FETCH router ----------------------------------------------------------------------------
self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Only GET is cacheable/safe to intercept; let everything else pass straight through.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Route 1 — WASM binaries (cache-first, MIME-repaired).
  if (isWasmRequest(url)) {
    event.respondWith(cacheFirst(request, WASM_CACHE));
    return;
  }

  // Route 2 — ML model files (cache-first).
  if (isModelRequest(url)) {
    event.respondWith(cacheFirst(request, MODEL_CACHE));
    return;
  }

  // Route 3 — navigations (header injection + offline shell).
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigate(request));
    return;
  }

  // Route 4 — same-origin app-shell JS/CSS/HTML (stale-while-revalidate).
  if (url.origin === self.location.origin && /\.(js|css|html)$/.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Route 5 — everything else: straight to network, no caching.
  // (No respondWith → default browser handling.)
});
