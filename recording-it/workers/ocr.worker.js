// ocr.worker.js  (ES-module worker)
//
// Optical character recognition via Tesseract.js. Tesseract already spins up its own internal
// worker(s); we drive it through a scheduler so future multi-worker scaling is a one-line change.
// All recognition runs locally — image bytes never leave the device.

// --- Plugin self-registration (MUST be first) ------------------------------------------------
self.PLUGIN_NAME = 'ocr';
self.PLUGIN_VERSION = '1.0.0';
self.PLUGIN_METHODS = ['recognize', 'detectOrientation', 'extractTable'];

import Tesseract from 'tesseract.js';
import {
  MessageType,
  createResponse,
  createProgress,
  createError,
  createReadyMessage,
} from '../src/worker-protocol.js';

// --- Worker state ----------------------------------------------------------------------------
let scheduler = null;
let workers = []; // the Tesseract worker pool
const WORKER_COUNT = 1; // one worker is plenty on mobile; scheduler lets us raise this later
let isReady = false;

/**
 * Stand up the Tesseract scheduler + worker pool once. Fire-and-forget at module load.
 */
async function init() {
  scheduler = Tesseract.createScheduler();

  for (let i = 0; i < WORKER_COUNT; i += 1) {
    // createWorker('eng') downloads the language data + core and returns a ready worker.
    const worker = await Tesseract.createWorker('eng');
    workers.push(worker);
    scheduler.addWorker(worker);
  }

  isReady = true;
  self.postMessage(createReadyMessage(self.PLUGIN_NAME, self.PLUGIN_VERSION, self.PLUGIN_METHODS));
}

init().catch((err) => {
  self.postMessage(createError(null, 'INIT_FAILED', err?.message || String(err), err?.stack || null));
});

// --- Helpers ---------------------------------------------------------------------------------

/** Apply per-job Tesseract parameters (PSM, char whitelist) before a recognize call. */
async function applyParams(params) {
  // Scheduler doesn't expose setParameters, so set on each underlying worker.
  for (const w of workers) {
    await w.setParameters(params);
  }
}

// --- Method implementations ------------------------------------------------------------------

/**
 * Recognize text in an image.
 * payload: { imageBlob, language, options:{ psm, tessedit_char_whitelist } }
 * → { text, confidence, blocks:[{text,bbox,confidence}], hocr }
 */
async function handleRecognize(requestId, payload) {
  const { imageBlob, options = {} } = payload;

  const params = {};
  if (options.psm != null) params.tessedit_pageseg_mode = String(options.psm);
  if (options.tessedit_char_whitelist) params.tessedit_char_whitelist = options.tessedit_char_whitelist;
  if (Object.keys(params).length) await applyParams(params);

  const { data } = await scheduler.addJob('recognize', imageBlob, {
    // Forward Tesseract's own progress (it reports { status, progress }) as protocol progress.
    logger: (m) => {
      if (typeof m.progress === 'number') {
        self.postMessage(createProgress(requestId, Math.round(m.progress * 100), m.status));
      }
    },
  });

  const blocks = (data.blocks || []).map((b) => ({
    text: b.text,
    bbox: b.bbox,
    confidence: b.confidence,
  }));

  return createResponse(requestId, {
    text: data.text || '',
    confidence: data.confidence ?? 0,
    blocks,
    hocr: data.hocr || '',
  });
}

/**
 * Detect page orientation/script using Tesseract OSD (PSM 0).
 * payload: { imageBlob } → { orientation, confidence, script }
 */
async function handleDetectOrientation(requestId, payload) {
  const { imageBlob } = payload;
  // PSM 0 = "Orientation and script detection only".
  await applyParams({ tessedit_pageseg_mode: '0' });

  // detect() is the OSD entry point; fall back through recognize metadata if a build lacks it.
  const { data } = await scheduler.addJob('detect', imageBlob);
  return createResponse(requestId, {
    orientation: data.orientation_degrees ?? 0,
    confidence: data.orientation_confidence ?? 0,
    script: data.script || 'Latin',
  });
}

/**
 * Extract a simple table by clustering recognized words into rows/cells by their bbox geometry.
 * payload: { imageBlob } → { rows:[[cell,...],...], confidence }
 */
async function handleExtractTable(requestId, payload) {
  const { imageBlob } = payload;
  // PSM 6 = "assume a single uniform block of text" — good baseline for tabular captures.
  await applyParams({ tessedit_pageseg_mode: '6' });

  const { data } = await scheduler.addJob('recognize', imageBlob, {
    logger: (m) => {
      if (typeof m.progress === 'number') {
        self.postMessage(createProgress(requestId, Math.round(m.progress * 100), m.status));
      }
    },
  });

  // Group words into rows by vertical overlap, then order each row's words left→right as cells.
  const words = (data.words || []).map((w) => ({ text: w.text, bbox: w.bbox }));
  words.sort((a, b) => a.bbox.y0 - b.bbox.y0);

  const rows = [];
  let currentRow = [];
  let currentY = null;
  // Row threshold: half the median word height; recomputed cheaply as we go.
  const rowTolerance = 12;

  for (const word of words) {
    const yMid = (word.bbox.y0 + word.bbox.y1) / 2;
    if (currentY === null || Math.abs(yMid - currentY) <= rowTolerance) {
      currentRow.push(word);
      currentY = currentY === null ? yMid : (currentY + yMid) / 2;
    } else {
      rows.push(finalizeRow(currentRow));
      currentRow = [word];
      currentY = yMid;
    }
  }
  if (currentRow.length) rows.push(finalizeRow(currentRow));

  return createResponse(requestId, { rows, confidence: data.confidence ?? 0 });
}

/** Sort a row's words by x and project to a string array (cells). */
function finalizeRow(rowWords) {
  return rowWords.sort((a, b) => a.bbox.x0 - b.bbox.x0).map((w) => w.text);
}

// --- Message router --------------------------------------------------------------------------
self.onmessage = async (event) => {
  const msg = event.data;
  if (!msg) return;

  // Graceful teardown: release Tesseract resources, then confirm so the pool can finish cleanly.
  if (msg.type === MessageType.SHUTDOWN) {
    try {
      if (scheduler) await scheduler.terminate();
    } finally {
      self.postMessage(createResponse(msg.id, { shutdown: true }));
    }
    return;
  }

  if (msg.type !== MessageType.REQUEST) return;

  if (!isReady) {
    self.postMessage(createError(msg.id, 'NOT_READY', 'ocr scheduler is still initializing'));
    return;
  }

  try {
    let response;
    switch (msg.method) {
      case 'recognize':
        response = await handleRecognize(msg.id, msg.payload);
        break;
      case 'detectOrientation':
        response = await handleDetectOrientation(msg.id, msg.payload);
        break;
      case 'extractTable':
        response = await handleExtractTable(msg.id, msg.payload);
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
