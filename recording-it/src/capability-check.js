// capability-check.js
//
// One-time, synchronous capability sniffing performed at module load. The result is a
// frozen CAPABILITIES object that the rest of the app reads to decide which backend to use
// for each workload (WebGPU vs WebGL vs WASM), whether multi-threaded ffmpeg is possible,
// whether we can persist models, and so on.
//
// This module is a LEAF: it imports nothing from the project. Detection runs exactly once
// (at import time) so callers never pay for re-sniffing, and the values can't drift mid-session.
//
// Browser target: Chrome 108+, Safari 17+, Firefox 117+. Every probe below degrades
// gracefully (typeof checks / try-catch) so an older or locked-down environment yields
// `false`/`'wasm'` rather than a thrown error.

/**
 * Probe for a working WebGL2 context.
 *
 * We create a throwaway canvas, request a 'webgl2' context, and immediately release the GPU
 * resources via the WEBGL_lose_context extension so this one-time check never holds a context
 * for the life of the page. Wrapped in try/catch because canvas/context creation can throw in
 * headless or GPU-blocklisted environments.
 *
 * @returns {boolean} true if a WebGL2 context could be created.
 */
function detectWebGL2() {
  try {
    // OffscreenCanvas is preferred (works in workers too), but this module loads on the main
    // thread, so a plain <canvas> is fine and avoids an OffscreenCanvas dependency here.
    const canvas =
      typeof document !== 'undefined'
        ? document.createElement('canvas')
        : typeof OffscreenCanvas !== 'undefined'
          ? new OffscreenCanvas(1, 1)
          : null;
    if (!canvas) return false;

    const gl = canvas.getContext('webgl2');
    if (!gl) return false;

    // Proactively free the context instead of waiting for GC — important on mobile where GPU
    // contexts are a scarce resource.
    const loseExt = gl.getExtension('WEBGL_lose_context');
    if (loseExt) loseExt.loseContext();
    return true;
  } catch {
    return false;
  }
}

/**
 * Feature-detect support for ES-module workers (`new Worker(url, { type: 'module' })`).
 *
 * Some older engines silently ignore the `type` option and load the worker as classic, which
 * breaks `import` statements. We can't fully prove module support without spawning a real
 * worker, so we use the well-known trick of passing a `get type()` accessor: the option is only
 * read when the engine actually honors module workers. We pass an empty blob URL so nothing
 * runs, and terminate immediately.
 *
 * @returns {'module'|'classic'} The worker type this engine can be trusted to honor.
 */
function detectWorkerType() {
  let supportsModule = false;
  try {
    // A 1-byte blob is enough; the worker body never executes meaningfully before terminate().
    const blobUrl = URL.createObjectURL(new Blob([''], { type: 'text/javascript' }));
    const probe = {
      get type() {
        // Reached only if the engine inspects the `type` option → module workers supported.
        supportsModule = true;
        return 'module';
      },
    };
    const worker = new Worker(blobUrl, probe);
    worker.terminate();
    URL.revokeObjectURL(blobUrl);
  } catch {
    // Any throw → assume the safe default below.
    supportsModule = false;
  }
  return supportsModule ? 'module' : 'classic';
}

// --- Run every probe exactly once, in dependency order ---------------------------------------

// SharedArrayBuffer alone is not enough: the page must also be cross-origin isolated for SAB to
// be usable (this is what our COOP/COEP headers buy us on /recording-it/*). We require BOTH.
const sharedArrayBuffer =
  typeof SharedArrayBuffer !== 'undefined' && globalThis.crossOriginIsolated === true;

// OffscreenCanvas lets workers render without DOM access — required by the MediaPipe worker and
// by multi-threaded ffmpeg.wasm's internal pipeline.
const offscreenCanvas = typeof OffscreenCanvas !== 'undefined';

// WebGPU is the fastest Whisper backend when present (Chrome 113+, Safari 17+ behind support).
const webGPU = typeof navigator !== 'undefined' && typeof navigator.gpu !== 'undefined';

const webGL2 = detectWebGL2();
const serviceWorker = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
const cacheStorage = 'caches' in globalThis;
const indexedDB = 'indexedDB' in globalThis;
const workerType = detectWorkerType();

// Multi-threaded ffmpeg.wasm needs SharedArrayBuffer for its thread pool AND OffscreenCanvas for
// its render path; without both we must fall back to the single-threaded core.
const threads = sharedArrayBuffer && offscreenCanvas;

// Pick the best available ML backend per workload, most-capable first.
const whisperBackend = webGPU ? 'webgpu' : webGL2 ? 'webgl' : 'wasm';
const mediapipeBackend = webGL2 ? 'webgl2' : 'wasm';

/**
 * The detected capabilities of the current environment.
 *
 * Frozen so it can be shared freely without any consumer mutating it. Computed once at module
 * load; import it anywhere you need to branch on environment support.
 *
 * @type {Readonly<{
 *   sharedArrayBuffer: boolean,
 *   offscreenCanvas: boolean,
 *   webGPU: boolean,
 *   webGL2: boolean,
 *   serviceWorker: boolean,
 *   cacheStorage: boolean,
 *   indexedDB: boolean,
 *   workerType: ('module'|'classic'),
 *   threads: boolean,
 *   whisperBackend: ('webgpu'|'webgl'|'wasm'),
 *   mediapipeBackend: ('webgl2'|'wasm')
 * }>}
 */
export const CAPABILITIES = Object.freeze({
  sharedArrayBuffer,
  offscreenCanvas,
  webGPU,
  webGL2,
  serviceWorker,
  cacheStorage,
  indexedDB,
  workerType,
  threads,
  whisperBackend,
  mediapipeBackend,
});

// Surface the full snapshot immediately so developers can see exactly what the environment
// supports the moment the app boots — invaluable when debugging "works on my machine" reports.
console.debug('[capability-check] CAPABILITIES:', CAPABILITIES);

/**
 * Assert that a capability is present, throwing a standard DOM error if it is not.
 *
 * Use this at the entry point of any feature that hard-depends on a capability (e.g. requiring
 * `threads` before offering multi-threaded export) so the failure is explicit and typed rather
 * than a confusing downstream crash. We throw a real `NotSupportedError` DOMException so callers
 * can branch on `err.name` the same way they would for a native unsupported-API error.
 *
 * @param {keyof typeof CAPABILITIES} key The capability to require.
 * @param {string} errorMessage           Message describing what needs the capability.
 * @throws {DOMException} name 'NotSupportedError' when CAPABILITIES[key] is falsy.
 * @returns {void}
 */
export function requireCapability(key, errorMessage) {
  if (!CAPABILITIES[key]) {
    throw new DOMException(errorMessage, 'NotSupportedError');
  }
}
