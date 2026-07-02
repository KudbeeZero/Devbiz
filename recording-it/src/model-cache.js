// model-cache.js
//
// Lazy download + persistent caching of every large binary the app needs at runtime: the
// ffmpeg.wasm core, Whisper ONNX weights, MediaPipe WASM/TFLite bundles, the Tesseract
// language pack, and OpenCV.js. These range from a few hundred KB to tens of MB, so they are
// NEVER bundled — they are fetched on first use and then served from a durable cache so the
// app works offline and start-up stays fast.
//
// Storage strategy (in priority order):
//   1. Cache Storage  — the natural home for opaque/CORS responses; survives reloads and is
//                       what the Service Worker also reads from.
//   2. IndexedDB      — fallback for the rare environment where Cache Storage is unavailable
//                       (some private-mode / embedded webviews). We store raw ArrayBuffers.
//
// Everything here is async and yields to the event loop; nothing blocks the main thread.
//
// Import graph: this module depends ONLY on capability-check.js (a leaf), preventing cycles.

import { CAPABILITIES } from './capability-check.js';

/**
 * Registry of every cacheable asset group, keyed by a short logical name.
 *
 * Each entry lists the concrete download URLs and the Cache Storage bucket they belong in.
 * The two bucket names intentionally match the Service Worker's WASM_CACHE / MODEL_CACHE so a
 * file fetched through either path lands in the same place and is reused, not re-downloaded.
 *
 * Not exported — callers reference groups by name through the functions below, so the URL list
 * is an implementation detail that can evolve without breaking the public API.
 *
 * @type {Object<string, {urls: string[], cacheName: string}>}
 */
// All URLs are pinned to an immutable ref so an upstream change can't silently
// alter the code/weights we execute: HuggingFace via a commit SHA (not the
// mutable `main` branch), MediaPipe via an exact npm version (not jsdelivr
// "latest"), and ffmpeg/opencv/tesseract via their versioned paths. Bumping a
// version here is a deliberate, reviewable change. (A SHA-256 integrity check on
// the fetched bytes — verify-then-cache in downloadModel() — is the next
// hardening step; it needs the known-good digests recorded per URL first.)
const MODEL_REGISTRY = {
  'ffmpeg-core': {
    urls: [
      'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js',
      'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm',
      'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.worker.js',
    ],
    cacheName: 'kudbee-wasm-v1',
  },
  'whisper-tiny': {
    urls: [
      'https://huggingface.co/Xenova/whisper-tiny/resolve/5332fcc35e32a33b86612b9a57a89be7906102b1/onnx/encoder_model.onnx',
      'https://huggingface.co/Xenova/whisper-tiny/resolve/5332fcc35e32a33b86612b9a57a89be7906102b1/onnx/decoder_model_merged.onnx',
      'https://huggingface.co/Xenova/whisper-tiny/resolve/5332fcc35e32a33b86612b9a57a89be7906102b1/tokenizer.json',
      'https://huggingface.co/Xenova/whisper-tiny/resolve/5332fcc35e32a33b86612b9a57a89be7906102b1/config.json',
    ],
    cacheName: 'kudbee-models-v1',
  },
  'mediapipe-face': {
    urls: [
      'https://cdn.jsdelivr.net/npm/@mediapipe/face_detection@0.4.1646425229/face_detection_solution_simd_wasm_bin.wasm',
      'https://cdn.jsdelivr.net/npm/@mediapipe/face_detection@0.4.1646425229/face_detection_short_range.tflite',
    ],
    cacheName: 'kudbee-models-v1',
  },
  'mediapipe-selfie': {
    urls: [
      'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1675465747/selfie_segmentation_solution_simd_wasm_bin.wasm',
      'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1675465747/selfie_segmentation_landscape.tflite',
    ],
    cacheName: 'kudbee-models-v1',
  },
  'tesseract-eng': {
    urls: ['https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz'],
    cacheName: 'kudbee-models-v1',
  },
  opencv: {
    urls: ['https://docs.opencv.org/4.8.0/opencv.js'],
    cacheName: 'kudbee-wasm-v1',
  },
};

// IndexedDB constants for the fallback path. Kept module-private.
const IDB_NAME = 'kudbee-model-cache';
const IDB_VERSION = 1;
const IDB_STORE = 'models';

// A single BroadcastChannel name used to fan download progress out to any interested context
// (the main thread UI, other tabs). Created lazily so merely importing this module costs nothing.
const PROGRESS_CHANNEL = 'kudbee-model-progress';

/**
 * Look up a registry entry, throwing a clear error for an unknown name.
 * @param {string} modelName
 * @returns {{urls: string[], cacheName: string}}
 */
function getRegistryEntry(modelName) {
  const entry = MODEL_REGISTRY[modelName];
  if (!entry) {
    throw new Error(`Unknown model "${modelName}". Known models: ${Object.keys(MODEL_REGISTRY).join(', ')}`);
  }
  return entry;
}

/**
 * Open (and lazily create) the IndexedDB database used for the Cache-Storage fallback.
 * Resolves with an IDBDatabase; rejects if IndexedDB is unavailable or blocked.
 * @returns {Promise<IDBDatabase>}
 */
function openIdb() {
  return new Promise((resolve, reject) => {
    if (!CAPABILITIES.indexedDB) {
      reject(new Error('IndexedDB is not available in this environment'));
      return;
    }
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        // Keyed by URL so a single fetched file maps to exactly one record.
        db.createObjectStore(IDB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'));
  });
}

/** Read one ArrayBuffer back from the IndexedDB fallback store. @returns {Promise<ArrayBuffer|undefined>} */
async function idbGet(url) {
  const db = await openIdb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(url);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

/** Write one ArrayBuffer into the IndexedDB fallback store. @returns {Promise<void>} */
async function idbPut(url, arrayBuffer) {
  const db = await openIdb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(arrayBuffer, url);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/**
 * Report whether every file of a model group is already cached locally.
 *
 * Designed to be safe to call speculatively on app start to decide whether to show a
 * "downloading models…" indicator. It NEVER throws: any failure (no Cache Storage, IDB error,
 * unknown model) is swallowed and reported as `false`, because "not cached" is always a safe,
 * recoverable answer (we just re-download).
 *
 * @param {string} modelName A key of the internal MODEL_REGISTRY.
 * @returns {Promise<boolean>} true only if ALL of the model's URLs are present locally.
 */
export async function isModelCached(modelName) {
  try {
    const { urls, cacheName } = getRegistryEntry(modelName);

    // Cache Storage is the source of truth when available.
    if (CAPABILITIES.cacheStorage) {
      const cache = await caches.open(cacheName);
      for (const url of urls) {
        const hit = await cache.match(url);
        if (!hit) return false;
      }
      return true;
    }

    // Fallback: confirm every URL has a record in IndexedDB.
    if (CAPABILITIES.indexedDB) {
      for (const url of urls) {
        const buf = await idbGet(url);
        if (!buf) return false;
      }
      return true;
    }

    // No durable storage at all → nothing can be "cached".
    return false;
  } catch {
    return false;
  }
}

/**
 * Download every file in a model group and persist it for offline reuse.
 *
 * Files are fetched sequentially so progress is meaningful and bandwidth on mobile isn't
 * saturated. After each file completes we (a) invoke the optional `onProgress` callback and
 * (b) broadcast the same progress on the '{@link PROGRESS_CHANNEL}' BroadcastChannel so other
 * contexts (UI, sibling tabs) can react. Responses go to Cache Storage when available, else
 * their ArrayBuffers go to IndexedDB.
 *
 * @param {string} modelName A key of the internal MODEL_REGISTRY.
 * @param {(percent:number, url:string)=>void} [onProgress] Called after each file (0–100).
 * @returns {Promise<void>} Resolves once every file is cached.
 * @throws {Error} With a descriptive message if any single download fails.
 */
export async function downloadModel(modelName, onProgress) {
  const { urls, cacheName } = getRegistryEntry(modelName);

  // One channel for the whole download; closed in finally so we never leak it.
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(PROGRESS_CHANNEL) : null;

  const cache = CAPABILITIES.cacheStorage ? await caches.open(cacheName) : null;

  try {
    for (let i = 0; i < urls.length; i += 1) {
      const url = urls[i];

      // Cross-origin assets must be fetched in CORS mode so the response is usable under our
      // COEP:require-corp policy; the CDNs we list all send permissive CORP/CORS headers.
      let response;
      try {
        response = await fetch(url, { mode: 'cors', credentials: 'omit' });
      } catch (networkErr) {
        throw new Error(`Network error downloading ${url} for model "${modelName}": ${networkErr.message}`);
      }
      if (!response.ok) {
        throw new Error(`Failed to download ${url} for model "${modelName}": HTTP ${response.status}`);
      }

      if (cache) {
        // Store the Response directly; Cache Storage keeps headers so MIME type is preserved.
        await cache.put(url, response.clone());
      } else if (CAPABILITIES.indexedDB) {
        // Fallback: extract the bytes and persist them ourselves.
        const buf = await response.arrayBuffer();
        await idbPut(url, buf);
      } else {
        throw new Error(`No durable storage available to cache ${url} (model "${modelName}")`);
      }

      // Percent reflects files completed, not bytes — adequate for a per-file progress bar and
      // far simpler/more reliable than streaming Content-Length (which CDNs may omit).
      const percent = Math.round(((i + 1) / urls.length) * 100);
      if (typeof onProgress === 'function') onProgress(percent, url);
      if (channel) channel.postMessage({ modelName, percent, url });
    }
  } finally {
    if (channel) channel.close();
  }
}

/**
 * Resolve a remote model URL to a LOCAL object URL backed by the cached bytes.
 *
 * Workers call this so they can load weights from the durable cache even when offline, and so a
 * single download is reused across worker restarts. If the file isn't cached (or no storage is
 * available), we transparently fall back to the original remote URL — the loader still works, it
 * just hits the network.
 *
 * NOTE: the returned object URL is owned by the caller; revoke it with URL.revokeObjectURL once
 * the resource has finished loading to avoid leaking blob references.
 *
 * @param {string} url The original remote URL (must appear in some MODEL_REGISTRY entry to be cached).
 * @returns {Promise<string>} A `blob:`-scheme object URL, or the original `url` if not cached.
 */
export async function getModelUrl(url) {
  try {
    if (CAPABILITIES.cacheStorage) {
      // The file could live in either bucket; check both rather than requiring the caller to know.
      for (const cacheName of ['kudbee-wasm-v1', 'kudbee-models-v1']) {
        const cache = await caches.open(cacheName);
        const hit = await cache.match(url);
        if (hit) {
          const blob = await hit.blob();
          return URL.createObjectURL(blob);
        }
      }
    }

    if (CAPABILITIES.indexedDB) {
      const buf = await idbGet(url);
      if (buf) return URL.createObjectURL(new Blob([buf]));
    }
  } catch {
    // Fall through to the network URL on any cache error — correctness over optimization.
  }
  return url;
}

/**
 * Ensure a set of models is cached, downloading only the ones that are missing.
 *
 * Runs strictly SEQUENTIALLY (one model at a time) — on mobile, parallel multi-MB downloads
 * compete for bandwidth and memory and make progress reporting meaningless. A failure on one
 * model is recorded and does not abort the others, so a partial preload still makes forward
 * progress.
 *
 * @param {string[]} modelNames Model keys to ensure are present.
 * @returns {Promise<{cached:string[], downloaded:string[], failed:string[]}>} Per-model outcome.
 */
export async function preloadModels(modelNames) {
  const summary = { cached: [], downloaded: [], failed: [] };

  for (const name of modelNames) {
    try {
      if (await isModelCached(name)) {
        summary.cached.push(name);
        continue;
      }
      await downloadModel(name);
      summary.downloaded.push(name);
    } catch (err) {
      // Keep going; surface the failure in the summary for the caller to handle/retry.
      console.warn(`[model-cache] Failed to preload "${name}":`, err);
      summary.failed.push(name);
    }
  }

  return summary;
}

/**
 * Delete an entire Cache Storage bucket by name (e.g. to force a model refresh or free space).
 *
 * @param {string} cacheName The bucket to delete, e.g. 'kudbee-models-v1'.
 * @returns {Promise<boolean>} true if the cache existed and was deleted (or simply that the op
 *   completed without error); false if Cache Storage is unavailable or deletion failed.
 */
export async function clearModelCache(cacheName) {
  try {
    if (!CAPABILITIES.cacheStorage) return false;
    return await caches.delete(cacheName);
  } catch (err) {
    console.warn(`[model-cache] Failed to clear cache "${cacheName}":`, err);
    return false;
  }
}
