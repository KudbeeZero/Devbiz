// mediapipe.worker.js  (ES-module worker)
//
// Face detection + selfie segmentation via Google MediaPipe, used to power privacy features:
// blur faces, virtual backgrounds, etc. Runs off the main thread and renders exclusively on an
// OffscreenCanvas (no DOM in a worker).
//
// MediaPipe's solution APIs are callback-based (`onResults`), so each request parks a pending
// resolver that the corresponding onResults handler fulfills. Only one frame per model is in
// flight at a time (the pool gives this worker maxInstances:1), so a single pending slot is safe.

// --- Plugin self-registration (MUST be first) ------------------------------------------------
self.PLUGIN_NAME = 'mediapipe';
self.PLUGIN_VERSION = '1.0.0';
self.PLUGIN_METHODS = ['detectFaces', 'segmentSelfie', 'blurFaces', 'virtualBackground'];

import { FaceDetection } from '@mediapipe/face_detection';
import { SelfieSegmentation } from '@mediapipe/selfie_segmentation';
import {
  MessageType,
  createResponse,
  createError,
  createReadyMessage,
} from '../src/worker-protocol.js';

// --- Worker state ----------------------------------------------------------------------------
let faceDetection = null;
let selfieSegmentation = null;
let offscreen = null; // reusable OffscreenCanvas for compositing
let ctx = null; // 2D context of `offscreen`
let isReady = false;

// Pending-result slots: MediaPipe delivers results via onResults, so we stash the resolver here
// and the callback hands the result back. One slot per model (single in-flight frame).
let pendingFaceResolve = null;
let pendingSelfieResolve = null;

/**
 * Lazily (re)size the shared OffscreenCanvas to the frame dimensions.
 */
function ensureCanvas(width, height) {
  if (!offscreen) {
    offscreen = new OffscreenCanvas(width, height);
    ctx = offscreen.getContext('2d');
  } else if (offscreen.width !== width || offscreen.height !== height) {
    offscreen.width = width;
    offscreen.height = height;
  }
  return ctx;
}

/**
 * Initialize both MediaPipe models in parallel and announce readiness.
 */
async function init() {
  // Workers have no DOM; everything renders to OffscreenCanvas. Bail clearly if it's missing.
  if (typeof OffscreenCanvas === 'undefined') {
    self.postMessage(createError(null, 'NO_OFFSCREEN_CANVAS', 'OffscreenCanvas is required but unavailable'));
    return;
  }

  // Face detection — short-range model, jsdelivr-hosted WASM/assets.
  faceDetection = new FaceDetection({
    locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection@0.4.1646425229/${f}`,
  });
  faceDetection.setOptions({ model: 'short', minDetectionConfidence: 0.5 });
  faceDetection.onResults((results) => {
    // Hand the raw results to whoever is awaiting a face pass.
    if (pendingFaceResolve) {
      const resolve = pendingFaceResolve;
      pendingFaceResolve = null;
      resolve(results);
    }
  });

  // Selfie segmentation — landscape model (modelSelection:1) for general-purpose backgrounds.
  selfieSegmentation = new SelfieSegmentation({
    locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1675465747/${f}`,
  });
  selfieSegmentation.setOptions({ modelSelection: 1 });
  selfieSegmentation.onResults((results) => {
    if (pendingSelfieResolve) {
      const resolve = pendingSelfieResolve;
      pendingSelfieResolve = null;
      resolve(results);
    }
  });

  // initialize() downloads + compiles the model graphs; run both concurrently.
  await Promise.all([faceDetection.initialize(), selfieSegmentation.initialize()]);

  isReady = true;
  self.postMessage(createReadyMessage(self.PLUGIN_NAME, self.PLUGIN_VERSION, self.PLUGIN_METHODS));
}

init().catch((err) => {
  self.postMessage(createError(null, 'INIT_FAILED', err?.message || String(err), err?.stack || null));
});

// --- Core passes (return MediaPipe results via the pending-resolver bridge) -------------------

/** Run face detection over a frame already drawn on the offscreen canvas. */
function runFaceDetection(width, height) {
  return new Promise((resolve, reject) => {
    pendingFaceResolve = resolve;
    // send() is async-ish; if it throws synchronously, clear the slot and reject.
    faceDetection.send({ image: offscreen }).catch((err) => {
      pendingFaceResolve = null;
      reject(err);
    });
  });
}

/** Run selfie segmentation over a frame already drawn on the offscreen canvas. */
function runSelfieSegmentation() {
  return new Promise((resolve, reject) => {
    pendingSelfieResolve = resolve;
    selfieSegmentation.send({ image: offscreen }).catch((err) => {
      pendingSelfieResolve = null;
      reject(err);
    });
  });
}

// --- Method implementations ------------------------------------------------------------------

/**
 * Detect faces in a frame.
 * payload: { frame:ImageBitmap, width, height } → { detections:[{boundingBox, landmarks}] }
 */
async function handleDetectFaces(requestId, payload) {
  const { frame, width, height } = payload;
  const context = ensureCanvas(width, height);
  context.drawImage(frame, 0, 0, width, height);
  frame.close(); // release the transferred bitmap as soon as it's drawn

  const results = await runFaceDetection(width, height);
  const detections = (results.detections || []).map((d) => ({
    boundingBox: d.boundingBox,
    landmarks: d.landmarks || [],
  }));
  return createResponse(requestId, { detections });
}

/**
 * Produce a segmentation mask for the subject.
 * payload: { frame:ImageBitmap, width, height } → { mask:ImageBitmap }
 */
async function handleSegmentSelfie(requestId, payload) {
  const { frame, width, height } = payload;
  const context = ensureCanvas(width, height);
  context.drawImage(frame, 0, 0, width, height);
  frame.close();

  const results = await runSelfieSegmentation();
  // results.segmentationMask is a canvas-image source; rasterize it into an ImageBitmap we can
  // transfer back to the caller.
  const maskCanvas = new OffscreenCanvas(width, height);
  maskCanvas.getContext('2d').drawImage(results.segmentationMask, 0, 0, width, height);
  const mask = maskCanvas.transferToImageBitmap();

  return createResponse(requestId, { mask }, [mask]);
}

/**
 * Detect faces and blur each one in place.
 * payload: { frame:ImageBitmap, blurRadius, width, height } → { frame:ImageBitmap }
 */
async function handleBlurFaces(requestId, payload) {
  const { frame, blurRadius = 16, width, height } = payload;
  const context = ensureCanvas(width, height);
  context.filter = 'none';
  context.drawImage(frame, 0, 0, width, height);
  frame.close();

  const results = await runFaceDetection(width, height);

  // For each detected face, redraw just that region from a blurred copy of the source. We blur the
  // whole frame once into a scratch canvas, then stamp the blurred face boxes back over the sharp
  // original — cheaper and cleaner than per-box filters.
  const scratch = new OffscreenCanvas(width, height);
  const sctx = scratch.getContext('2d');
  sctx.filter = `blur(${blurRadius}px)`;
  sctx.drawImage(offscreen, 0, 0);
  sctx.filter = 'none';

  for (const det of results.detections || []) {
    const bb = det.boundingBox;
    // MediaPipe boxes are normalized (center + size); convert to pixel rect.
    const w = bb.width * width;
    const h = bb.height * height;
    const x = bb.xCenter * width - w / 2;
    const y = bb.yCenter * height - h / 2;
    context.drawImage(scratch, x, y, w, h, x, y, w, h);
  }

  const out = offscreen.transferToImageBitmap();
  return createResponse(requestId, { frame: out }, [out]);
}

/**
 * Replace the background behind the subject with a supplied image.
 * payload: { frame:ImageBitmap, background:ImageBitmap, width, height } → { frame:ImageBitmap }
 */
async function handleVirtualBackground(requestId, payload) {
  const { frame, background, width, height } = payload;

  // 1) Draw the subject frame and get its segmentation mask.
  const context = ensureCanvas(width, height);
  context.filter = 'none';
  context.drawImage(frame, 0, 0, width, height);
  const seg = await runSelfieSegmentation();

  // 2) Composite: start from the background, then paint the subject only where the mask says
  //    "person" using destination-over / source-in masking.
  const composed = new OffscreenCanvas(width, height);
  const cctx = composed.getContext('2d');

  // Subject masked: draw frame, then keep only masked pixels.
  const subject = new OffscreenCanvas(width, height);
  const subctx = subject.getContext('2d');
  subctx.drawImage(frame, 0, 0, width, height);
  subctx.globalCompositeOperation = 'destination-in';
  subctx.drawImage(seg.segmentationMask, 0, 0, width, height);

  // Background fills everything, subject goes on top.
  cctx.drawImage(background, 0, 0, width, height);
  cctx.drawImage(subject, 0, 0);

  // Release all input bitmaps now that we've consumed them.
  frame.close();
  background.close();

  const out = composed.transferToImageBitmap();
  return createResponse(requestId, { frame: out }, [out]);
}

// --- Message router --------------------------------------------------------------------------
self.onmessage = async (event) => {
  const msg = event.data;
  if (!msg || msg.type !== MessageType.REQUEST) return;

  if (typeof OffscreenCanvas === 'undefined') {
    self.postMessage(createError(msg.id, 'NO_OFFSCREEN_CANVAS', 'OffscreenCanvas is required but unavailable'));
    return;
  }
  if (!isReady) {
    self.postMessage(createError(msg.id, 'NOT_READY', 'mediapipe models are still initializing'));
    return;
  }

  try {
    let response;
    switch (msg.method) {
      case 'detectFaces':
        response = await handleDetectFaces(msg.id, msg.payload);
        break;
      case 'segmentSelfie':
        response = await handleSegmentSelfie(msg.id, msg.payload);
        break;
      case 'blurFaces':
        response = await handleBlurFaces(msg.id, msg.payload);
        break;
      case 'virtualBackground':
        response = await handleVirtualBackground(msg.id, msg.payload);
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
  const reason = e?.reason;
  self.postMessage(createError(null, 'UNHANDLED_REJECTION', reason?.message || String(reason)));
});
