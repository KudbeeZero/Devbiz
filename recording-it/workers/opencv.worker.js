// opencv.worker.js  (CLASSIC worker — NOT an ES module)
//
// Image-processing primitives (edge detection, document-corner finding, perspective warp, etc.)
// via OpenCV.js. OpenCV.js is loaded from its official CDN with importScripts, which is a
// classic-worker-only API — so this file CANNOT use ESM `import`. The WorkerPool spawns it with
// { type: 'classic' } accordingly.
//
// Because we can't import the shared protocol module here, the handful of protocol helpers we
// need are re-implemented inline below. They must stay byte-compatible with src/worker-protocol.js.
//
// MEMORY: OpenCV.js has NO garbage collection for cv.Mat. Every Mat we allocate MUST be .delete()d,
// and we do so in finally blocks. A leaked Mat is leaked for the entire life of the worker.

// --- Load OpenCV.js (classic-worker importScripts) -------------------------------------------
// Must be the very first thing the worker does. `cv` becomes a global once this resolves.
importScripts('https://docs.opencv.org/4.8.0/opencv.js');

// --- Plugin self-registration ----------------------------------------------------------------
self.PLUGIN_NAME = 'opencv';
self.PLUGIN_VERSION = '1.0.0';
self.PLUGIN_METHODS = ['detectEdges', 'findDocumentCorners', 'perspectiveWarp', 'grayscale', 'threshold'];

// --- Inline protocol helpers (mirror of src/worker-protocol.js) ------------------------------
// Kept minimal and identical in shape so the pool treats opencv messages like any other worker's.
const MessageType = Object.freeze({
  REQUEST: 'request',
  RESPONSE: 'response',
  PROGRESS: 'progress',
  ERROR: 'error',
  READY: 'ready',
  SHUTDOWN: 'shutdown',
});

function generateId() {
  if (typeof self.crypto !== 'undefined' && typeof self.crypto.randomUUID === 'function') {
    return self.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function createResponse(requestId, payload, transfer = []) {
  return { id: generateId(), requestId, type: MessageType.RESPONSE, payload, transfer, timestamp: Date.now() };
}

// eslint-disable-next-line no-unused-vars -- kept for protocol parity / future progress reporting
function createProgress(requestId, percent, detail = null) {
  return { id: generateId(), requestId, type: MessageType.PROGRESS, payload: { percent, detail }, timestamp: Date.now() };
}

function createError(requestId, code, message, stack = null) {
  return { id: generateId(), requestId, type: MessageType.ERROR, payload: { code, message, stack }, timestamp: Date.now() };
}

function createReadyMessage(pluginName, pluginVersion, pluginMethods) {
  return {
    id: generateId(),
    type: MessageType.READY,
    payload: { name: pluginName, version: pluginVersion, methods: pluginMethods },
    timestamp: Date.now(),
  };
}

// --- Worker state ----------------------------------------------------------------------------
let cvReady = false;

/**
 * The `cv` global from the CDN may already be initialized, may be a Promise, or may signal
 * readiness asynchronously via cv.onRuntimeInitialized. Handle all three so we post READY exactly
 * once the WASM runtime is genuinely usable.
 */
function whenCvReady() {
  return new Promise((resolve, reject) => {
    try {
      if (typeof cv !== 'undefined' && cv.getBuildInformation) {
        // Already initialized synchronously.
        resolve();
      } else if (typeof cv !== 'undefined' && typeof cv.then === 'function') {
        // Newer builds expose `cv` as a Promise that resolves to the module.
        cv.then(() => resolve()).catch(reject);
      } else if (typeof cv !== 'undefined') {
        // Classic path: wait for the runtime-initialized callback.
        cv.onRuntimeInitialized = () => resolve();
      } else {
        reject(new Error('OpenCV.js failed to load — `cv` global is undefined'));
      }
    } catch (err) {
      reject(err);
    }
  });
}

whenCvReady()
  .then(() => {
    cvReady = true;
    self.postMessage(createReadyMessage(self.PLUGIN_NAME, self.PLUGIN_VERSION, self.PLUGIN_METHODS));
  })
  .catch((err) => {
    self.postMessage(createError(null, 'INIT_FAILED', err?.message || String(err), err?.stack || null));
  });

// --- Helpers ---------------------------------------------------------------------------------

/**
 * Convert OUR transport shape { data, width, height } into an ImageData OpenCV can ingest.
 * `data` arrives as a plain Uint8ClampedArray (RGBA).
 */
function toImageData({ data, width, height }) {
  const clamped = data instanceof Uint8ClampedArray ? data : new Uint8ClampedArray(data);
  return new ImageData(clamped, width, height);
}

/**
 * Convert an RGBA cv.Mat back to our transport shape, copying the bytes out so we don't hold a
 * reference to OpenCV-managed memory after the Mat is deleted.
 */
function matToImageData(mat) {
  const width = mat.cols;
  const height = mat.rows;
  // Ensure 4-channel RGBA before extracting; many ops leave us with 1-channel data.
  let rgba = new cv.Mat();
  try {
    if (mat.channels() === 1) {
      cv.cvtColor(mat, rgba, cv.COLOR_GRAY2RGBA);
    } else if (mat.channels() === 3) {
      cv.cvtColor(mat, rgba, cv.COLOR_RGB2RGBA);
    } else {
      rgba = mat.clone();
    }
    // Copy into a standalone Uint8ClampedArray detached from OpenCV's heap.
    const out = new Uint8ClampedArray(rgba.data); // copies bytes
    return { data: out, width, height };
  } finally {
    rgba.delete();
  }
}

// --- Method implementations (each guarantees Mat cleanup in finally) -------------------------

/**
 * Canny edge detection.
 * payload: { imageData:{data,width,height} } → { edgeImageData:{data,width,height} }
 */
function handleDetectEdges(requestId, payload) {
  const src = cv.matFromImageData(toImageData(payload.imageData));
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edges = new cv.Mat();
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    cv.Canny(blurred, edges, 50, 150);
    return createResponse(requestId, { edgeImageData: matToImageData(edges) });
  } finally {
    src.delete();
    gray.delete();
    blurred.delete();
    edges.delete();
  }
}

/**
 * Find the four corners of the dominant document/quad in the frame.
 * payload: { imageData } → { corners:[{x,y}x4], found:boolean }
 */
function handleFindDocumentCorners(requestId, payload) {
  const src = cv.matFromImageData(toImageData(payload.imageData));
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edges = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  let approx = new cv.Mat();
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    cv.Canny(blurred, edges, 50, 150);
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    // Largest contour by area is our best document candidate.
    let largest = null;
    let largestArea = 0;
    for (let i = 0; i < contours.size(); i += 1) {
      const c = contours.get(i);
      const area = cv.contourArea(c);
      if (area > largestArea) {
        largestArea = area;
        if (largest) largest.delete();
        largest = c;
      } else {
        c.delete();
      }
    }

    if (!largest) {
      return createResponse(requestId, { corners: [], found: false });
    }

    try {
      // Approximate the contour to a polygon; epsilon scaled to perimeter per the standard recipe.
      const peri = cv.arcLength(largest, true);
      cv.approxPolyDP(largest, approx, 0.02 * peri, true);

      let corners;
      let found;
      if (approx.rows === 4) {
        corners = sortCorners(matPointsToArray(approx));
        found = true;
      } else {
        // Fallback: use the bounding rectangle's corners so callers always get a usable quad.
        const rect = cv.boundingRect(largest);
        corners = [
          { x: rect.x, y: rect.y },
          { x: rect.x + rect.width, y: rect.y },
          { x: rect.x + rect.width, y: rect.y + rect.height },
          { x: rect.x, y: rect.y + rect.height },
        ];
        found = false;
      }
      return createResponse(requestId, { corners, found });
    } finally {
      largest.delete();
    }
  } finally {
    src.delete();
    gray.delete();
    blurred.delete();
    edges.delete();
    contours.delete();
    hierarchy.delete();
    approx.delete();
  }
}

/**
 * Warp the given quad to a flat rectangle (document flattening).
 * payload: { imageData, corners:[{x,y}x4], outputWidth, outputHeight }
 * → { warped:{data,width,height} }
 */
function handlePerspectiveWarp(requestId, payload) {
  const { corners, outputWidth, outputHeight } = payload;
  const src = cv.matFromImageData(toImageData(payload.imageData));
  const dst = new cv.Mat();

  // Source quad (caller order) and destination rectangle, as flat [x,y,...] arrays.
  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    corners[0].x, corners[0].y,
    corners[1].x, corners[1].y,
    corners[2].x, corners[2].y,
    corners[3].x, corners[3].y,
  ]);
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0,
    outputWidth, 0,
    outputWidth, outputHeight,
    0, outputHeight,
  ]);
  let M = null;
  try {
    M = cv.getPerspectiveTransform(srcTri, dstTri);
    cv.warpPerspective(src, dst, M, new cv.Size(outputWidth, outputHeight), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());
    const result = matToImageData(dst);
    return createResponse(requestId, { warped: { data: result.data, width: outputWidth, height: outputHeight } });
  } finally {
    src.delete();
    dst.delete();
    srcTri.delete();
    dstTri.delete();
    if (M) M.delete();
  }
}

/**
 * Grayscale conversion (returned as RGBA so it slots straight into a canvas).
 * payload: { imageData } → { imageData:{data,width,height} }
 */
function handleGrayscale(requestId, payload) {
  const src = cv.matFromImageData(toImageData(payload.imageData));
  const gray = new cv.Mat();
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    return createResponse(requestId, { imageData: matToImageData(gray) });
  } finally {
    src.delete();
    gray.delete();
  }
}

/**
 * Thresholding: binary / adaptive / Otsu.
 * payload: { imageData, type:'binary'|'adaptive'|'otsu' } → { imageData:{data,width,height} }
 */
function handleThreshold(requestId, payload) {
  const { type = 'binary' } = payload;
  const src = cv.matFromImageData(toImageData(payload.imageData));
  const gray = new cv.Mat();
  const out = new cv.Mat();
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    if (type === 'adaptive') {
      cv.adaptiveThreshold(gray, out, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 11, 2);
    } else if (type === 'otsu') {
      cv.threshold(gray, out, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
    } else {
      cv.threshold(gray, out, 127, 255, cv.THRESH_BINARY);
    }
    return createResponse(requestId, { imageData: matToImageData(out) });
  } finally {
    src.delete();
    gray.delete();
    out.delete();
  }
}

// --- Geometry helpers ------------------------------------------------------------------------

/** Read a 4x1 CV_32SC2 (or float) point Mat into [{x,y}]. */
function matPointsToArray(mat) {
  const pts = [];
  for (let i = 0; i < mat.rows; i += 1) {
    pts.push({ x: mat.data32S[i * 2], y: mat.data32S[i * 2 + 1] });
  }
  return pts;
}

/** Order 4 points as top-left, top-right, bottom-right, bottom-left for a stable warp. */
function sortCorners(points) {
  // Sum (x+y) is smallest at top-left, largest at bottom-right; diff (y-x) separates the others.
  const bySum = [...points].sort((a, b) => a.x + a.y - (b.x + b.y));
  const topLeft = bySum[0];
  const bottomRight = bySum[bySum.length - 1];
  const remaining = points.filter((p) => p !== topLeft && p !== bottomRight);
  const [a, b] = remaining;
  const topRight = a.x > b.x ? a : b;
  const bottomLeft = a.x > b.x ? b : a;
  return [topLeft, topRight, bottomRight, bottomLeft];
}

// --- Message router --------------------------------------------------------------------------
self.onmessage = (event) => {
  const msg = event.data;
  if (!msg || msg.type !== MessageType.REQUEST) return;

  if (!cvReady) {
    self.postMessage(createError(msg.id, 'NOT_READY', 'OpenCV runtime is still initializing'));
    return;
  }

  try {
    let response;
    switch (msg.method) {
      case 'detectEdges':
        response = handleDetectEdges(msg.id, msg.payload);
        break;
      case 'findDocumentCorners':
        response = handleFindDocumentCorners(msg.id, msg.payload);
        break;
      case 'perspectiveWarp':
        response = handlePerspectiveWarp(msg.id, msg.payload);
        break;
      case 'grayscale':
        response = handleGrayscale(msg.id, msg.payload);
        break;
      case 'threshold':
        response = handleThreshold(msg.id, msg.payload);
        break;
      default:
        self.postMessage(createError(msg.id, 'UNKNOWN_METHOD', `Unknown method: ${msg.method}`));
        return;
    }
    self.postMessage(response, response.transfer || []);
  } catch (err) {
    self.postMessage(createError(msg.id, 'METHOD_ERROR', err?.message || String(err), err?.stack || null));
  }
};

// --- Last-resort error capture ---------------------------------------------------------------
self.addEventListener('error', (e) => {
  self.postMessage(createError(null, 'WORKER_ERROR', e?.message || 'Uncaught worker error'));
});
self.addEventListener('unhandledrejection', (e) => {
  const reason = e && e.reason;
  self.postMessage(createError(null, 'UNHANDLED_REJECTION', (reason && reason.message) || String(reason)));
});
