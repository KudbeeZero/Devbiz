// worker-bridge.js
//
// The high-level RPC surface the rest of the app uses. WorkerBridge wraps a WorkerPool so
// callers write `bridge.call('ffmpeg', 'trim', {...})` and get a promise — they never deal with
// message construction, transfer lists, or worker lifecycle directly.
//
// Import graph: worker-pool.js only (which itself pulls in worker-protocol + capability-check).

import WorkerPool, { WorkerState } from './worker-pool.js';

/**
 * Ergonomic RPC facade over a WorkerPool.
 *
 * One bridge wraps one already-initialized pool. Use the {@link createWorkerBridge} factory for
 * the common "spawn + wrap" case rather than constructing both by hand.
 */
export default class WorkerBridge {
  /**
   * @param {WorkerPool} poolInstance An ALREADY-initialized pool (its init() must have resolved
   *   for the plugins you intend to call; calling a not-yet-ready plugin will queue until ready).
   * @param {Object} [options]
   * @param {number} [options.defaultTimeout=120000] Fallback per-call timeout when a call omits one.
   */
  constructor(poolInstance, options = {}) {
    this._pool = poolInstance;
    this._defaultTimeout = options.defaultTimeout ?? 120_000;
    // Lazily created the first time onProgress() is used, so a bridge that never subscribes to
    // progress pays nothing.
    this._progressChannel = null;
  }

  /**
   * Invoke a worker method and await its result.
   *
   * Transfer-list resolution, in priority order:
   *   1. `options.transfer` — explicit, preferred.
   *   2. `payload._transfer` — a convenience convention so callers can co-locate the transfer
   *      list with the payload. The bridge STRIPS `_transfer` before sending so it never reaches
   *      the worker as data.
   *
   * @template T
   * @param {string} pluginName Target plugin, e.g. 'ffmpeg'.
   * @param {string} method     Method to invoke, e.g. 'trim'.
   * @param {Object} [payload={}] Structured-cloneable arguments (may carry an optional `_transfer`).
   * @param {Object} [options={}]
   * @param {Transferable[]} [options.transfer] Transferables within payload to move (not copy).
   * @param {number} [options.timeout] Per-call timeout in ms (defaults to the bridge default).
   * @returns {Promise<T>} The worker method's return value.
   *
   * @example bridge.call('ffmpeg', 'trim', { inputBlob, start: 0.5, end: 10.2, outputFormat: 'webm' })
   * @example bridge.call('whisper', 'transcribe', { audioBuffer, language: 'en', task: 'transcribe' }, { transfer: [audioBuffer] })
   * @example bridge.call('mediapipe', 'detectFaces', { frame, width: 1280, height: 720 }, { transfer: [frame] })
   * @example bridge.call('ocr', 'recognize', { imageBlob, language: 'eng' })
   * @example bridge.call('opencv', 'findDocumentCorners', { imageData: { data, width, height } })
   */
  call(pluginName, method, payload = {}, options = {}) {
    let actualPayload = payload;
    let transfer = options.transfer;

    // Support the payload._transfer convention without leaking it across the wire.
    if (transfer == null && payload && Array.isArray(payload._transfer)) {
      transfer = payload._transfer;
      // Shallow-clone minus _transfer so we don't mutate the caller's object.
      actualPayload = { ...payload };
      delete actualPayload._transfer;
    }

    const timeout = options.timeout ?? this._defaultTimeout;
    return this._pool.dispatch(pluginName, method, actualPayload, transfer || [], timeout);
  }

  /**
   * Subscribe to progress events from ALL workers.
   *
   * Backed by the 'kudbee-worker-progress' BroadcastChannel that the pool publishes on, so
   * progress is delivered even across the worker boundary and to sibling tabs.
   *
   * @param {(update:{pluginName:string, requestId:string, percent:number, detail:*})=>void} callback
   * @returns {()=>void} An unsubscribe function; call it to stop receiving events.
   */
  onProgress(callback) {
    if (!this._progressChannel) {
      this._progressChannel = new BroadcastChannel('kudbee-worker-progress');
    }
    const handler = (event) => callback(event.data);
    this._progressChannel.addEventListener('message', handler);
    // Return a tidy unsubscribe so callers can clean up (e.g. on component unmount).
    return () => {
      if (this._progressChannel) this._progressChannel.removeEventListener('message', handler);
    };
  }

  /**
   * Current pool status snapshot (instance counts, states, queue depth per plugin).
   * @returns {Object<string, {instances:number, states:string[], queueDepth:number}>}
   */
  status() {
    return this._pool.getStatus();
  }

  /**
   * Tear everything down: terminate all workers and close the progress channel. Call on app exit.
   * @returns {void}
   */
  destroy() {
    this._pool.terminateAll();
    if (this._progressChannel) {
      this._progressChannel.close();
      this._progressChannel = null;
    }
  }
}

/**
 * Convenience factory: spawn a pool for the given plugins, wait for them to be READY, and return
 * a bridge wrapping it. This is the one-liner most callers want.
 *
 * @param {string[]} pluginNames Plugins to spawn now, e.g. ['ffmpeg', 'whisper'].
 * @param {Object} [options]
 * @param {number} [options.defaultTimeout=120000] Default per-call timeout for the bridge.
 * @param {(pluginName:string, requestId:string, percent:number, detail:*)=>void} [options.onProgress]
 *   Optional global progress hook forwarded to the pool.
 * @returns {Promise<WorkerBridge>} A ready-to-use bridge.
 *
 * @example const bridge = await createWorkerBridge(['ffmpeg', 'whisper']);
 */
export async function createWorkerBridge(pluginNames, options = {}) {
  const pool = new WorkerPool({ onProgress: options.onProgress });
  await pool.init(pluginNames);
  return new WorkerBridge(pool, options);
}

// Re-export WorkerState so consumers can interpret status() output without reaching past the
// bridge into worker-pool.js.
export { WorkerState };
