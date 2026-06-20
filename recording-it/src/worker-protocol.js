// worker-protocol.js
//
// Shared message schema used by every worker AND by the WorkerPool / WorkerBridge that
// drive them. This is the single contract that keeps both ends of every Worker boundary
// in lockstep: if you change a message shape, you change it here and nowhere else.
//
// This module is a LEAF — it imports nothing from the project. That keeps it safe to load
// from both the main thread and any module worker without dragging in a dependency graph
// (and without risking circular imports). See CROSS-CUTTING REQUIREMENT #6.
//
// All exports are NAMED. There is intentionally no default export, because consumers
// cherry-pick only the few helpers they need (workers typically import three of them).

/**
 * Generate a collision-resistant unique id for correlating requests with responses.
 *
 * Prefers the native `crypto.randomUUID()` (available in all our target browsers and in
 * Worker/ServiceWorker scopes over a secure context). Falls back to a manual RFC-4122
 * version-4 UUID built from `Math.random()` for the rare environment where `crypto` or
 * `randomUUID` is missing (e.g. an insecure-origin preview). The fallback is NOT
 * cryptographically secure — it only needs to be unique enough to route messages.
 *
 * @returns {string} A UUID-shaped string, e.g. "f47ac10b-58cc-4372-a567-0e02b2c3d479".
 */
export function generateId() {
  // Fast path: native UUID generator. `globalThis.crypto` resolves in window, worker and
  // service-worker scopes alike, so we never reach for a scope-specific global.
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  // Fallback: RFC-4122 v4 layout. The version nibble is forced to 4 and the variant nibble
  // to one of 8/9/a/b, matching a real v4 UUID so downstream code can treat both paths the same.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const rand = (Math.random() * 16) | 0;
    const value = char === 'x' ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
}

/**
 * The closed set of message kinds exchanged across the worker boundary.
 *
 * Frozen so a typo like `MessageType.REQEUST` throws instead of silently producing
 * `undefined` and routing nowhere. Every message object carries a `type` drawn from here.
 *
 * - REQUEST:  main thread → worker; asks the worker to run a method.
 * - RESPONSE: worker → main thread; the successful result of a REQUEST.
 * - PROGRESS: worker → main thread; an interim update for a still-pending REQUEST.
 * - ERROR:    worker → main thread; a REQUEST failed (carries code/message/stack).
 * - READY:    worker → main thread; sent once after init, advertises name/version/methods.
 * - SHUTDOWN: main thread → worker; ask the worker to release resources before termination.
 *
 * @type {Readonly<{REQUEST:string, RESPONSE:string, PROGRESS:string, ERROR:string, READY:string, SHUTDOWN:string}>}
 */
export const MessageType = Object.freeze({
  REQUEST: 'request',
  RESPONSE: 'response',
  PROGRESS: 'progress',
  ERROR: 'error',
  READY: 'ready',
  SHUTDOWN: 'shutdown',
});

/**
 * Build a REQUEST message (main thread → worker).
 *
 * The `transfer` list is carried INSIDE the message purely as metadata so the sender can
 * recover it right before `postMessage(msg, msg.transfer)`. It is not consumed by the
 * worker — the structured-clone algorithm strips it on the way across.
 *
 * @param {string} method                The worker method to invoke (must be in PLUGIN_METHODS).
 * @param {*}      payload               Method arguments; must be structured-cloneable.
 * @param {Transferable[]} [transfer=[]] Transferables within `payload` to move (not copy).
 * @returns {{id:string, type:string, method:string, payload:*, transfer:Transferable[], timestamp:number}}
 */
export function createRequest(method, payload, transfer = []) {
  return {
    id: generateId(),
    type: MessageType.REQUEST,
    method,
    payload,
    transfer,
    timestamp: Date.now(),
  };
}

/**
 * Build a RESPONSE message (worker → main thread) for a completed request.
 *
 * `requestId` ties this result back to the originating REQUEST so the pool can resolve the
 * correct pending promise. The message gets its own fresh `id` as well.
 *
 * @param {string} requestId            The `id` of the REQUEST being answered.
 * @param {*}      payload              The method's return value; must be structured-cloneable.
 * @param {Transferable[]} [transfer=[]] Transferables within `payload` to move back to the caller.
 * @returns {{id:string, requestId:string, type:string, payload:*, transfer:Transferable[], timestamp:number}}
 */
export function createResponse(requestId, payload, transfer = []) {
  return {
    id: generateId(),
    requestId,
    type: MessageType.RESPONSE,
    payload,
    transfer,
    timestamp: Date.now(),
  };
}

/**
 * Build a PROGRESS message (worker → main thread) for an in-flight request.
 *
 * Progress messages do NOT settle the pending promise — the pool looks the job up by
 * `requestId`, forwards the update, and leaves the job pending until a RESPONSE/ERROR.
 *
 * @param {string} requestId    The `id` of the REQUEST this progress belongs to.
 * @param {number} percent      Completion percentage, 0–100.
 * @param {*}      [detail=null] Optional extra context (current frame time, file name, ...).
 * @returns {{id:string, requestId:string, type:string, payload:{percent:number, detail:*}, timestamp:number}}
 */
export function createProgress(requestId, percent, detail = null) {
  return {
    id: generateId(),
    requestId,
    type: MessageType.PROGRESS,
    payload: { percent, detail },
    timestamp: Date.now(),
  };
}

/**
 * Build an ERROR message (worker → main thread) for a failed request.
 *
 * Errors are not thrown across the boundary (Error objects don't structured-clone cleanly
 * and an uncaught throw would crash the worker). Instead every failure is serialized here
 * into a plain object the pool can rebuild into a rejected promise.
 *
 * @param {string} requestId     The `id` of the REQUEST that failed.
 * @param {string} code          A short machine-readable error code, e.g. 'METHOD_ERROR'.
 * @param {string} message       A human-readable error message.
 * @param {?string} [stack=null] Optional stack trace for debugging.
 * @returns {{id:string, requestId:string, type:string, payload:{code:string, message:string, stack:?string}, timestamp:number}}
 */
export function createError(requestId, code, message, stack = null) {
  return {
    id: generateId(),
    requestId,
    type: MessageType.ERROR,
    payload: { code, message, stack },
    timestamp: Date.now(),
  };
}

/**
 * Build a READY message (worker → main thread), sent exactly once after the worker has
 * finished initializing.
 *
 * The pool reads `payload.methods` to auto-build its dispatch table, so a worker can only
 * be called for methods it actually advertises here. `name`/`version` mirror the worker's
 * self-registered PLUGIN_NAME / PLUGIN_VERSION for diagnostics.
 *
 * @param {string}   pluginName    Lowercase plugin identifier, e.g. 'ffmpeg'.
 * @param {string}   pluginVersion Semver string, e.g. '1.0.0'.
 * @param {string[]} pluginMethods Method names this worker handles.
 * @returns {{id:string, type:string, payload:{name:string, version:string, methods:string[]}, timestamp:number}}
 */
export function createReadyMessage(pluginName, pluginVersion, pluginMethods) {
  return {
    id: generateId(),
    type: MessageType.READY,
    payload: {
      name: pluginName,
      version: pluginVersion,
      methods: pluginMethods,
    },
    timestamp: Date.now(),
  };
}
