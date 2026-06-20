// worker-pool.js
//
// The central worker manager. It spawns and tracks every Web Worker instance, queues jobs when
// all workers of a kind are busy, restarts workers that crash, and routes the protocol messages
// (REQUEST / RESPONSE / PROGRESS / ERROR / READY) between callers and workers.
//
// Callers normally don't touch this directly — they go through WorkerBridge (worker-bridge.js),
// which wraps the pool in an ergonomic RPC API. The pool is the lower, plumbing layer.
//
// Import graph: worker-protocol.js + capability-check.js (both leaves). No cycle.

import { MessageType, createRequest, generateId } from './worker-protocol.js';
import { CAPABILITIES } from './capability-check.js';

/**
 * Static configuration for every worker kind the pool knows how to spawn.
 *
 * `maxInstances` is deliberately 1 for the WASM-heavy plugins (ffmpeg, whisper, mediapipe):
 * running two ffmpeg.wasm or Transformers.js instances at once blows the memory budget on
 * mobile. OCR and OpenCV are far lighter, so they may run two instances for throughput.
 *
 * `type` selects module vs classic worker. opencv MUST be 'classic' because it loads OpenCV.js
 * via importScripts (a classic-only API); the rest are ES-module workers.
 *
 * Paths are relative to THIS file (src/), resolved through `new URL(path, import.meta.url)` in
 * _spawnWorker so they work both under Vite's bundler and as native ESM.
 *
 * Not exported — internal wiring.
 * @type {Object<string, {path:string, type:('module'|'classic'), maxInstances:number}>}
 */
const WORKER_CONFIGS = {
  ffmpeg: { path: '../workers/ffmpeg.worker.js', type: 'module', maxInstances: 1 },
  whisper: { path: '../workers/whisper.worker.js', type: 'module', maxInstances: 1 },
  mediapipe: { path: '../workers/mediapipe.worker.js', type: 'module', maxInstances: 1 },
  ocr: { path: '../workers/ocr.worker.js', type: 'module', maxInstances: 2 },
  opencv: { path: '../workers/opencv.worker.js', type: 'classic', maxInstances: 2 },
};

// Default per-job timeout. WASM transcode/transcribe jobs can legitimately run long, so this is
// generous (2 minutes). Callers may override per dispatch.
const DEFAULT_TIMEOUT = 120_000;

// How long to wait for a freshly spawned worker to send its READY message before giving up.
const SPAWN_TIMEOUT = 30_000;

// How long to wait before respawning a crashed worker, so a hard-crash loop can't busy-spin.
const RESTART_DELAY = 1000;

/**
 * Resolve a plugin name to its worker entry URL.
 *
 * Each `new URL('<string-literal>', import.meta.url)` is written out explicitly (not via a
 * variable) BECAUSE Vite's bundler only statically analyzes — and therefore only emits and
 * resolves the bare-specifier imports of — worker entries whose URL is a literal. A computed
 * `new URL(config.path, ...)` would build fine but silently fail to bundle the worker for
 * production. Native ESM resolves these literals identically, so this works with and without Vite.
 *
 * @param {string} pluginName
 * @returns {URL}
 */
function resolveWorkerUrl(pluginName) {
  switch (pluginName) {
    case 'ffmpeg':
      return new URL('../workers/ffmpeg.worker.js', import.meta.url);
    case 'whisper':
      return new URL('../workers/whisper.worker.js', import.meta.url);
    case 'mediapipe':
      return new URL('../workers/mediapipe.worker.js', import.meta.url);
    case 'ocr':
      return new URL('../workers/ocr.worker.js', import.meta.url);
    case 'opencv':
      return new URL('../workers/opencv.worker.js', import.meta.url);
    default:
      throw new Error(`No worker URL registered for plugin "${pluginName}"`);
  }
}

/**
 * Lifecycle states a worker instance moves through.
 *
 * INITIALIZING → READY (after its READY message) → BUSY (while running a job) → READY again.
 * ERROR is a transient state after a recoverable method error; DEAD is terminal (crashed and
 * removed, pending respawn).
 *
 * @type {Readonly<{INITIALIZING:string, READY:string, BUSY:string, ERROR:string, DEAD:string}>}
 */
export const WorkerState = Object.freeze({
  INITIALIZING: 'initializing',
  READY: 'ready',
  BUSY: 'busy',
  ERROR: 'error',
  DEAD: 'dead',
});

/**
 * @typedef {Object} WorkerInstance
 * @property {Worker} worker            The underlying Web Worker.
 * @property {string} state             One of WorkerState.
 * @property {string} pluginName        Which plugin this instance serves.
 * @property {?string} pluginVersion    Reported version (set from the READY message).
 * @property {?string} currentJobId     requestId of the in-flight job, or null when idle.
 * @property {string} instanceId        Unique id for this instance (for logging/lookup).
 * @property {?Function} _resolveSpawn  Resolver for the spawn promise, cleared once READY/timeout.
 * @property {?Function} _rejectSpawn   Rejecter for the spawn promise.
 * @property {?number} _spawnTimeoutId  Timer guarding the READY handshake.
 */

/**
 * @typedef {Object} PendingJob
 * @property {object} message     The REQUEST message sent to the worker.
 * @property {Transferable[]} transfer Transferables sent with the message.
 * @property {Function} resolve   Resolves the caller's dispatch() promise.
 * @property {Function} reject    Rejects the caller's dispatch() promise.
 * @property {number} timeoutMs   The timeout configured for this job.
 */

/**
 * Spawns, tracks, queues and recovers Web Workers, and routes protocol messages between them and
 * their callers. One pool typically serves the whole app.
 */
export default class WorkerPool {
  /**
   * @param {Object} [options]
   * @param {(pluginName:string, requestId:string, percent:number, detail:*)=>void} [options.onProgress]
   *   Optional global progress hook, invoked on every PROGRESS message from any worker.
   */
  constructor(options = {}) {
    /** @type {Map<string, WorkerInstance[]>} pluginName → live instances */
    this._pools = new Map();
    /** @type {Map<string, PendingJob[]>} pluginName → queued jobs awaiting a free worker */
    this._queues = new Map();
    /** @type {Map<string, {resolve:Function, reject:Function, timeoutId:number, pluginName:string, instanceId:string}>} requestId → pending */
    this._pendingJobs = new Map();
    /** @type {Map<string, Set<string>>} pluginName → advertised method names (built from READY) */
    this._dispatchTable = new Map();

    // One channel to fan worker progress out to any listener (e.g. WorkerBridge.onProgress).
    this._progressChannel = new BroadcastChannel('kudbee-worker-progress');

    this._onProgress = options.onProgress || null;

    // Surfaced for callers/diagnostics; also let CAPABILITIES inform future tuning decisions.
    this.DEFAULT_TIMEOUT = DEFAULT_TIMEOUT;
    this.capabilities = CAPABILITIES;
  }

  /**
   * Spawn the requested workers and resolve once every one has reported READY.
   *
   * Call once at startup with only the plugins you need immediately; spawn others lazily later
   * with another init() call (it's additive). Spawning is cheap to defer because each worker
   * eagerly loads its (large) WASM/model payload on construction.
   *
   * @param {string[]} [pluginNames=Object.keys(WORKER_CONFIGS)] Plugins to spawn now.
   * @returns {Promise<void>} Resolves when all requested workers are READY (or rejects on the
   *   first spawn failure/timeout).
   */
  init(pluginNames = Object.keys(WORKER_CONFIGS)) {
    return Promise.all(pluginNames.map((name) => this._spawnWorker(name)));
  }

  /**
   * Construct a single worker instance and wire up its lifecycle.
   *
   * @param {string} pluginName
   * @returns {Promise<WorkerInstance>} Resolves with the instance once it sends READY; rejects
   *   if construction throws or the READY handshake times out.
   * @private
   */
  _spawnWorker(pluginName) {
    const config = WORKER_CONFIGS[pluginName];
    if (!config) {
      return Promise.reject(new Error(`Unknown plugin "${pluginName}"`));
    }

    const instanceId = generateId();

    return new Promise((resolve, reject) => {
      let worker;
      try {
        // Resolve via static literals (see resolveWorkerUrl) so BOTH Vite's bundler and native
        // ESM emit/resolve the worker entry and its bare-specifier imports. config.path is kept
        // for documentation/diagnostics but is intentionally NOT used to construct the URL.
        const workerUrl = resolveWorkerUrl(pluginName);
        worker = new Worker(workerUrl, { type: config.type });
      } catch (err) {
        reject(new Error(`Failed to construct ${pluginName} worker: ${err.message}`));
        return;
      }

      /** @type {WorkerInstance} */
      const instance = {
        worker,
        state: WorkerState.INITIALIZING,
        pluginName,
        pluginVersion: null,
        currentJobId: null,
        instanceId,
        _resolveSpawn: resolve,
        _rejectSpawn: reject,
        _spawnTimeoutId: null,
      };

      // Guard the READY handshake: if the worker never reports in, tear it down and reject.
      instance._spawnTimeoutId = setTimeout(() => {
        if (instance.state === WorkerState.INITIALIZING) {
          instance.state = WorkerState.DEAD;
          try {
            worker.terminate();
          } catch {
            /* already gone */
          }
          this._removeInstance(pluginName, instanceId);
          reject(new Error(`Worker ${pluginName} timed out after ${SPAWN_TIMEOUT}ms waiting for READY`));
        }
      }, SPAWN_TIMEOUT);

      // Route all worker → main messages and hard errors through the pool's handlers.
      worker.onmessage = (event) => this._handleMessage(pluginName, instanceId, event);
      worker.onerror = (error) => this._handleWorkerError(pluginName, instanceId, error);
      // messageerror fires on a structured-clone failure — treat it like a crash for safety.
      worker.onmessageerror = (error) => this._handleWorkerError(pluginName, instanceId, error);

      // Register the instance immediately so messages that arrive before READY can find it.
      if (!this._pools.has(pluginName)) this._pools.set(pluginName, []);
      this._pools.get(pluginName).push(instance);
    });
  }

  /**
   * Route an inbound worker message by its type.
   * @param {string} pluginName
   * @param {string} instanceId
   * @param {MessageEvent} event
   * @private
   */
  _handleMessage(pluginName, instanceId, event) {
    const msg = event.data;
    if (!msg || typeof msg.type !== 'string') return; // ignore non-protocol noise

    switch (msg.type) {
      case MessageType.READY: {
        const instance = this._findInstance(pluginName, instanceId);
        if (!instance) return;

        instance.state = WorkerState.READY;
        instance.pluginVersion = msg.payload?.version ?? null;

        // Auto-build the dispatch table from what the worker advertises — the pool never
        // hard-codes method names, so adding a worker method requires no pool change.
        const methods = Array.isArray(msg.payload?.methods) ? msg.payload.methods : [];
        if (!this._dispatchTable.has(pluginName)) this._dispatchTable.set(pluginName, new Set());
        const methodSet = this._dispatchTable.get(pluginName);
        for (const m of methods) methodSet.add(m);

        // Complete the spawn handshake.
        if (instance._spawnTimeoutId != null) clearTimeout(instance._spawnTimeoutId);
        instance._spawnTimeoutId = null;
        const resolveSpawn = instance._resolveSpawn;
        instance._resolveSpawn = null;
        instance._rejectSpawn = null;
        if (resolveSpawn) resolveSpawn(instance);

        // Jobs may have been queued before this worker came up — try to start them now.
        this._drainQueue(pluginName);
        return;
      }

      case MessageType.RESPONSE: {
        const pending = this._pendingJobs.get(msg.requestId);
        const instance = this._findInstance(pluginName, instanceId);
        if (instance) {
          instance.state = WorkerState.READY;
          instance.currentJobId = null;
        }
        if (pending) {
          clearTimeout(pending.timeoutId);
          this._pendingJobs.delete(msg.requestId);
          pending.resolve(msg.payload);
        }
        // Free worker → pull the next queued job.
        this._drainQueue(pluginName);
        return;
      }

      case MessageType.PROGRESS: {
        // Progress does NOT settle the job — leave the pending entry in place.
        const requestId = msg.requestId;
        const { percent, detail } = msg.payload || {};
        if (this._onProgress) this._onProgress(pluginName, requestId, percent, detail);
        // Re-broadcast so decoupled listeners (UI, WorkerBridge.onProgress) can subscribe.
        this._progressChannel.postMessage({ pluginName, requestId, percent, detail });
        return;
      }

      case MessageType.ERROR: {
        const pending = this._pendingJobs.get(msg.requestId);
        const instance = this._findInstance(pluginName, instanceId);
        if (instance) {
          // A method error is recoverable: briefly mark ERROR for observability, then return the
          // worker to READY so it can serve the next job (the worker itself is still healthy).
          instance.state = WorkerState.ERROR;
          instance.currentJobId = null;
          instance.state = WorkerState.READY;
        }
        if (pending) {
          clearTimeout(pending.timeoutId);
          this._pendingJobs.delete(msg.requestId);
          const err = new Error(msg.payload?.message || 'Worker error');
          err.code = msg.payload?.code || 'WORKER_ERROR';
          if (msg.payload?.stack) err.workerStack = msg.payload.stack;
          pending.reject(err);
        }
        this._drainQueue(pluginName);
        return;
      }

      default:
        // Unknown type — ignore rather than crash the router.
        return;
    }
  }

  /**
   * Handle a hard worker failure (uncaught error / clone error). The worker is considered DEAD,
   * its in-flight job is rejected, and a replacement is scheduled.
   * @param {string} pluginName
   * @param {string} instanceId
   * @param {ErrorEvent|MessageEvent} error
   * @private
   */
  _handleWorkerError(pluginName, instanceId, error) {
    const instance = this._findInstance(pluginName, instanceId);
    if (instance) {
      instance.state = WorkerState.DEAD;

      // Reject the job this worker was running, if any.
      if (instance.currentJobId) {
        const pending = this._pendingJobs.get(instance.currentJobId);
        if (pending) {
          clearTimeout(pending.timeoutId);
          this._pendingJobs.delete(instance.currentJobId);
          pending.reject(new Error(`Worker ${pluginName} crashed: ${error?.message || 'unknown error'}`));
        }
      }

      // If the worker died before completing its READY handshake, fail the spawn promise too.
      if (instance._spawnTimeoutId != null) clearTimeout(instance._spawnTimeoutId);
      if (instance._rejectSpawn) {
        instance._rejectSpawn(new Error(`Worker ${pluginName} crashed during init`));
        instance._resolveSpawn = null;
        instance._rejectSpawn = null;
      }

      try {
        instance.worker.terminate();
      } catch {
        /* already gone */
      }
    }

    this._removeInstance(pluginName, instanceId);
    console.error(`[WorkerPool] Worker ${pluginName}#${instanceId} crashed:`, error);

    // Respawn after a short delay so a crash-on-init loop can't hot-spin the CPU.
    setTimeout(() => {
      this._spawnWorker(pluginName).catch((err) => {
        console.error(`[WorkerPool] Failed to respawn ${pluginName}:`, err);
      });
    }, RESTART_DELAY);
  }

  /**
   * Submit a job to a plugin. Resolves with the worker's RESPONSE payload, rejects on ERROR,
   * crash, or timeout.
   *
   * @param {string} pluginName            Target plugin (must be configured).
   * @param {string} method                Method to invoke (must be advertised by the worker).
   * @param {*} payload                    Structured-cloneable method arguments.
   * @param {Transferable[]} [transfer=[]] Transferables within payload to move (not copy).
   * @param {number} [timeoutMs=DEFAULT_TIMEOUT] Per-job timeout.
   * @returns {Promise<*>} The method's result.
   */
  dispatch(pluginName, method, payload, transfer = [], timeoutMs = DEFAULT_TIMEOUT) {
    if (!WORKER_CONFIGS[pluginName]) {
      throw new Error(`Unknown plugin "${pluginName}"`);
    }
    const methods = this._dispatchTable.get(pluginName);
    // If the worker hasn't reported READY yet the table is empty; that's fine — we validate
    // against it only once methods are known. Before READY we optimistically queue.
    if (methods && methods.size > 0 && !methods.has(method)) {
      throw new Error(`Plugin "${pluginName}" does not handle method "${method}"`);
    }

    const message = createRequest(method, payload, transfer);

    return new Promise((resolve, reject) => {
      /** @type {PendingJob} */
      const job = { message, transfer, resolve, reject, timeoutMs };
      // Try to start immediately; otherwise park it until a worker frees up (or comes up).
      if (!this._routeJob(pluginName, job)) {
        if (!this._queues.has(pluginName)) this._queues.set(pluginName, []);
        this._queues.get(pluginName).push(job);
      }
    });
  }

  /**
   * Try to hand a job to an idle worker of the given plugin.
   * @param {string} pluginName
   * @param {PendingJob} job
   * @returns {boolean} true if the job was started, false if no idle worker was available.
   * @private
   */
  _routeJob(pluginName, job) {
    const instances = this._pools.get(pluginName) || [];
    const instance = instances.find((i) => i.state === WorkerState.READY);
    if (!instance) return false;

    instance.state = WorkerState.BUSY;
    instance.currentJobId = job.message.id;

    // Arm the timeout BEFORE posting so a worker that never replies still settles the promise.
    const timeoutId = setTimeout(() => {
      this._pendingJobs.delete(job.message.id);
      if (instance.currentJobId === job.message.id) {
        instance.currentJobId = null;
        instance.state = WorkerState.READY;
      }
      const err = new Error(`Job "${job.message.method}" on "${pluginName}" timed out after ${job.timeoutMs}ms`);
      err.name = 'TimeoutError';
      job.reject(err);
      // The worker may still be busy with the stale job, but freeing the slot lets the queue
      // progress; a truly wedged worker will be caught by onerror or the next health signal.
      this._drainQueue(pluginName);
    }, job.timeoutMs);

    this._pendingJobs.set(job.message.id, {
      resolve: job.resolve,
      reject: job.reject,
      timeoutId,
      pluginName,
      instanceId: instance.instanceId,
    });

    // Move (don't copy) any transferables for zero-copy hand-off of big buffers/bitmaps.
    instance.worker.postMessage(job.message, job.transfer || []);
    return true;
  }

  /**
   * Start as many queued jobs as there are idle workers for a plugin.
   * @param {string} pluginName
   * @private
   */
  _drainQueue(pluginName) {
    const queue = this._queues.get(pluginName);
    if (!queue || queue.length === 0) return;

    // Keep pulling while both a job and an idle worker exist.
    while (queue.length > 0) {
      const job = queue[0];
      if (this._routeJob(pluginName, job)) {
        queue.shift(); // started — drop it from the queue
      } else {
        break; // no idle worker right now; stop until one frees up
      }
    }
  }

  /**
   * Terminate every worker of a plugin and reject any of its outstanding work.
   * @param {string} pluginName
   * @returns {void}
   */
  terminate(pluginName) {
    const instances = this._pools.get(pluginName) || [];
    for (const instance of instances) {
      if (instance._spawnTimeoutId != null) clearTimeout(instance._spawnTimeoutId);
      try {
        instance.worker.terminate();
      } catch {
        /* already gone */
      }
    }
    this._pools.set(pluginName, []);

    // Reject pending jobs that belonged to this plugin.
    for (const [requestId, pending] of this._pendingJobs.entries()) {
      if (pending.pluginName === pluginName) {
        clearTimeout(pending.timeoutId);
        pending.reject(new Error(`Plugin "${pluginName}" was terminated`));
        this._pendingJobs.delete(requestId);
      }
    }

    // Drop any queued-but-unstarted jobs too.
    const queue = this._queues.get(pluginName);
    if (queue) {
      for (const job of queue) job.reject(new Error(`Plugin "${pluginName}" was terminated`));
      this._queues.set(pluginName, []);
    }
  }

  /**
   * Terminate all workers across all plugins. Call on app teardown.
   * @returns {void}
   */
  terminateAll() {
    for (const pluginName of this._pools.keys()) {
      this.terminate(pluginName);
    }
  }

  /**
   * Snapshot of pool health for diagnostics/UI.
   * @returns {Object<string, {instances:number, states:string[], queueDepth:number}>}
   */
  getStatus() {
    const status = {};
    for (const [pluginName, instances] of this._pools.entries()) {
      status[pluginName] = {
        instances: instances.length,
        states: instances.map((i) => i.state),
        queueDepth: (this._queues.get(pluginName) || []).length,
      };
    }
    return status;
  }

  /**
   * Find a live instance by id.
   * @param {string} pluginName
   * @param {string} instanceId
   * @returns {?WorkerInstance}
   * @private
   */
  _findInstance(pluginName, instanceId) {
    const instances = this._pools.get(pluginName) || [];
    return instances.find((i) => i.instanceId === instanceId) || null;
  }

  /**
   * Remove a (dead) instance from its pool.
   * @param {string} pluginName
   * @param {string} instanceId
   * @private
   */
  _removeInstance(pluginName, instanceId) {
    const instances = this._pools.get(pluginName);
    if (!instances) return;
    const idx = instances.findIndex((i) => i.instanceId === instanceId);
    if (idx !== -1) instances.splice(idx, 1);
  }
}
