// ffmpeg.worker.js  (ES-module worker)
//
// Wraps ffmpeg.wasm in a worker so all transcoding/trimming/concatenation runs off the main
// thread. A single FFmpeg instance is created and `load()`-ed once at startup; every request
// reuses it. The worker speaks the shared protocol (REQUEST → RESPONSE/PROGRESS/ERROR).
//
// Memory discipline: ffmpeg.wasm keeps an in-memory virtual filesystem. Every file we write must
// be deleted again (in a finally) or the worker's heap grows unbounded over a session.

// --- Plugin self-registration (MUST be first, before imports/async) --------------------------
self.PLUGIN_NAME = 'ffmpeg';
self.PLUGIN_VERSION = '1.0.0';
self.PLUGIN_METHODS = ['trim', 'cut', 'export', 'probe', 'concat'];

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import {
  MessageType,
  createResponse,
  createProgress,
  createError,
  createReadyMessage,
} from '../src/worker-protocol.js';

// ffmpeg.wasm core assets. Hard-coded here (rather than imported from model-cache.js) because a
// worker can't cleanly pull in the main-thread cache module; these URLs mirror MODEL_REGISTRY's
// 'ffmpeg-core' entry so the Service Worker caches the very same files.
const CORE_BASE = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';

// --- Worker state ----------------------------------------------------------------------------
let ffmpeg = null; // the single FFmpeg instance
let isReady = false; // flips true once load() resolves
let currentRequestId = null; // the in-flight request, so progress events can be attributed

/**
 * Initialize ffmpeg.wasm exactly once and announce readiness.
 * Fire-and-forget at module load (no top-level await — mixed browser support).
 */
async function init() {
  ffmpeg = new FFmpeg();

  // ffmpeg emits 'progress' with { progress: 0..1, time }. Attribute it to whatever request is
  // currently running. If nothing is running (e.g. during load), there's no id to report against.
  ffmpeg.on('progress', (e) => {
    if (currentRequestId) {
      self.postMessage(createProgress(currentRequestId, Math.round((e.progress || 0) * 100), e.time));
    }
  });

  // toBlobURL fetches the core files and hands ffmpeg a same-origin blob: URL, which keeps the
  // worker happy under cross-origin isolation (COEP).
  await ffmpeg.load({
    coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
    workerURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.worker.js`, 'text/javascript'),
  });

  isReady = true;
  self.postMessage(createReadyMessage(self.PLUGIN_NAME, self.PLUGIN_VERSION, self.PLUGIN_METHODS));
}

// Kick off init; surface any failure as a protocol ERROR rather than an unhandled rejection.
init().catch((err) => {
  self.postMessage(createError(null, 'INIT_FAILED', err?.message || String(err), err?.stack || null));
});

// --- Helpers ---------------------------------------------------------------------------------

/** Best-effort extension from a Blob's MIME type, defaulting to a generic container. */
function extFromBlob(blob, fallback = 'bin') {
  const type = blob?.type || '';
  const map = {
    'video/webm': 'webm',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'audio/webm': 'webm',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
  };
  return map[type] || fallback;
}

/** Read an ffmpeg FS file into a Blob of the given MIME type. */
async function readFileAsBlob(name, mime) {
  const data = await ffmpeg.readFile(name); // Uint8Array
  const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
  return new Blob([u8], { type: mime });
}

/** Delete a list of FS files, ignoring "not found" so cleanup never throws. */
async function cleanupFiles(names) {
  for (const name of names) {
    try {
      await ffmpeg.deleteFile(name);
    } catch {
      /* file may not exist if the op failed early — ignore */
    }
  }
}

/** Convert a Blob result into a RESPONSE, transferring its ArrayBuffer for zero-copy hand-off. */
async function blobResponse(requestId, blob, extraFields = {}) {
  const buffer = await blob.arrayBuffer();
  // We send the raw ArrayBuffer + metadata and transfer the buffer; the main thread reconstructs
  // a Blob. This avoids structured-cloning (copying) what can be tens of MB of video.
  const payload = { buffer, type: blob.type, ...extraFields };
  return createResponse(requestId, payload, [buffer]);
}

/** MIME type for a target container/format string. */
function mimeForFormat(format) {
  const map = { webm: 'video/webm', mp4: 'video/mp4', mov: 'video/quicktime', gif: 'image/gif', mp3: 'audio/mpeg', wav: 'audio/wav' };
  return map[format] || 'application/octet-stream';
}

// --- Method implementations ------------------------------------------------------------------

/**
 * Trim a single contiguous range [start, end] without re-encoding (stream copy = fast, lossless).
 * payload: { inputBlob, start, end, outputFormat }
 */
async function handleTrim(requestId, payload) {
  const { inputBlob, start, end, outputFormat } = payload;
  const inExt = extFromBlob(inputBlob, 'webm');
  const inName = `input.${inExt}`;
  const outName = `output.${outputFormat}`;

  try {
    await ffmpeg.writeFile(inName, await fetchFile(inputBlob));
    // -ss/-to before -c copy: seek + copy packets, no transcode. Good enough for trims.
    await ffmpeg.exec(['-i', inName, '-ss', String(start), '-to', String(end), '-c', 'copy', outName]);
    const blob = await readFileAsBlob(outName, mimeForFormat(outputFormat));
    return await blobResponse(requestId, blob);
  } finally {
    await cleanupFiles([inName, outName]);
  }
}

/**
 * Cut OUT the given segments and concatenate the survivors back together.
 * payload: { inputBlob, segments:[{start,end}], outputFormat }
 *
 * Implemented with a single filter_complex: each kept span becomes a trimmed v/a pair, then all
 * pairs are concat-ed. This re-encodes (filtering requires it), but keeps everything in one pass.
 */
async function handleCut(requestId, payload) {
  const { inputBlob, segments, outputFormat } = payload;
  const inExt = extFromBlob(inputBlob, 'webm');
  const inName = `input.${inExt}`;
  const outName = `output.${outputFormat}`;

  try {
    await ffmpeg.writeFile(inName, await fetchFile(inputBlob));

    // Build the list of KEEP ranges = complement of the cut segments. We need the total duration
    // for the final keep span, so probe first.
    const duration = await probeDuration(inName);
    const cuts = [...segments].sort((a, b) => a.start - b.start);
    const keeps = [];
    let cursor = 0;
    for (const seg of cuts) {
      if (seg.start > cursor) keeps.push({ start: cursor, end: seg.start });
      cursor = Math.max(cursor, seg.end);
    }
    if (cursor < duration) keeps.push({ start: cursor, end: duration });

    self.postMessage(createProgress(requestId, 10, `Cutting ${cuts.length} segment(s)`));

    if (keeps.length === 0) {
      throw new Error('Cut would remove the entire clip — nothing left to export');
    }

    // Compose filter_complex: trim each keep range for video+audio, then concat.
    const parts = [];
    const concatInputs = [];
    keeps.forEach((k, i) => {
      parts.push(
        `[0:v]trim=start=${k.start}:end=${k.end},setpts=PTS-STARTPTS[v${i}]`,
        `[0:a]atrim=start=${k.start}:end=${k.end},asetpts=PTS-STARTPTS[a${i}]`,
      );
      concatInputs.push(`[v${i}][a${i}]`);
    });
    const filter = `${parts.join(';')};${concatInputs.join('')}concat=n=${keeps.length}:v=1:a=1[outv][outa]`;

    await ffmpeg.exec(['-i', inName, '-filter_complex', filter, '-map', '[outv]', '-map', '[outa]', outName]);
    self.postMessage(createProgress(requestId, 95, 'Finalizing'));

    const blob = await readFileAsBlob(outName, mimeForFormat(outputFormat));
    return await blobResponse(requestId, blob);
  } finally {
    await cleanupFiles([inName, outName]);
  }
}

/**
 * Re-encode/transcode with caller-supplied options.
 * payload: { inputBlob, format, options:{ videoBitrate, audioBitrate, fps, scale, codec } }
 */
async function handleExport(requestId, payload) {
  const { inputBlob, format, options = {} } = payload;
  const inExt = extFromBlob(inputBlob, 'webm');
  const inName = `input.${inExt}`;
  const outName = `output.${format}`;

  try {
    await ffmpeg.writeFile(inName, await fetchFile(inputBlob));

    // Assemble args from whatever options were provided; omit flags for unset options so ffmpeg
    // uses its sensible defaults.
    const args = ['-i', inName];
    if (options.codec) args.push('-c:v', options.codec);
    if (options.videoBitrate) args.push('-b:v', String(options.videoBitrate));
    if (options.audioBitrate) args.push('-b:a', String(options.audioBitrate));
    if (options.fps) args.push('-r', String(options.fps));
    if (options.scale) args.push('-vf', `scale=${options.scale}`); // e.g. "1280:-2"
    args.push(outName);

    await ffmpeg.exec(args);
    const blob = await readFileAsBlob(outName, mimeForFormat(format));
    return await blobResponse(requestId, blob);
  } finally {
    await cleanupFiles([inName, outName]);
  }
}

/**
 * Probe basic media metadata. ffmpeg.wasm has no separate ffprobe, so we run ffmpeg with no
 * output and scrape the log it emits to stderr.
 * payload: { inputBlob }  → { duration, width, height, fps, codec, bitrate }
 */
async function handleProbe(requestId, payload) {
  const { inputBlob } = payload;
  const inExt = extFromBlob(inputBlob, 'webm');
  const inName = `input.${inExt}`;
  const logLines = [];
  const logHandler = (entry) => logLines.push(entry.message);

  try {
    await ffmpeg.writeFile(inName, await fetchFile(inputBlob));
    ffmpeg.on('log', logHandler);
    // `-f null -` runs the demux/parse without producing a file; metadata is printed to the log.
    try {
      await ffmpeg.exec(['-i', inName, '-f', 'null', '-']);
    } catch {
      // ffmpeg may exit non-zero with `-f null`; the log we need is already captured regardless.
    }

    const text = logLines.join('\n');
    const info = parseProbe(text);
    return createResponse(requestId, info);
  } finally {
    ffmpeg.off('log', logHandler);
    await cleanupFiles([inName]);
  }
}

/**
 * Concatenate multiple clips of the same codec via the demuxer concat protocol (no re-encode).
 * payload: { blobs:[Blob], outputFormat }
 */
async function handleConcat(requestId, payload) {
  const { blobs, outputFormat } = payload;
  const inNames = [];
  const outName = `output.${outputFormat}`;
  const listName = 'concat_list.txt';

  try {
    // Write each input under an indexed name and build the concat manifest.
    for (let i = 0; i < blobs.length; i += 1) {
      const ext = extFromBlob(blobs[i], outputFormat);
      const name = `part_${i}.${ext}`;
      await ffmpeg.writeFile(name, await fetchFile(blobs[i]));
      inNames.push(name);
      self.postMessage(createProgress(requestId, Math.round(((i + 1) / blobs.length) * 50), `Loaded part ${i + 1}`));
    }
    const manifest = inNames.map((n) => `file '${n}'`).join('\n');
    await ffmpeg.writeFile(listName, new TextEncoder().encode(manifest));

    // -safe 0 lets us reference our own FS filenames; -c copy keeps it lossless and fast.
    await ffmpeg.exec(['-f', 'concat', '-safe', '0', '-i', listName, '-c', 'copy', outName]);
    self.postMessage(createProgress(requestId, 95, 'Finalizing'));

    const blob = await readFileAsBlob(outName, mimeForFormat(outputFormat));
    return await blobResponse(requestId, blob);
  } finally {
    await cleanupFiles([...inNames, listName, outName]);
  }
}

// --- Probe helpers ---------------------------------------------------------------------------

/** Run a throwaway probe just to recover the duration in seconds (used by handleCut). */
async function probeDuration(inName) {
  const logLines = [];
  const logHandler = (entry) => logLines.push(entry.message);
  ffmpeg.on('log', logHandler);
  try {
    await ffmpeg.exec(['-i', inName, '-f', 'null', '-']);
  } catch {
    /* expected non-zero with -f null */
  } finally {
    ffmpeg.off('log', logHandler);
  }
  return parseProbe(logLines.join('\n')).duration || 0;
}

/** Parse ffmpeg's stderr log into a small metadata object. Resilient to missing fields. */
function parseProbe(text) {
  const info = { duration: 0, width: 0, height: 0, fps: 0, codec: null, bitrate: 0 };

  // Duration: HH:MM:SS.xx
  const dur = text.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
  if (dur) info.duration = (+dur[1]) * 3600 + (+dur[2]) * 60 + parseFloat(dur[3]);

  // Video stream line: "Video: <codec> ... 1280x720 ... 30 fps ... 1234 kb/s"
  const video = text.match(/Video:\s*([^\s,]+).*?(\d{2,5})x(\d{2,5})/);
  if (video) {
    info.codec = video[1];
    info.width = +video[2];
    info.height = +video[3];
  }
  const fps = text.match(/(\d+(?:\.\d+)?)\s*fps/);
  if (fps) info.fps = parseFloat(fps[1]);
  const bitrate = text.match(/bitrate:\s*(\d+)\s*kb\/s/);
  if (bitrate) info.bitrate = +bitrate[1] * 1000;

  return info;
}

// --- Message router --------------------------------------------------------------------------
self.onmessage = async (event) => {
  const msg = event.data;
  // Only REQUESTs are actionable here; ignore everything else (e.g. stray broadcasts).
  if (!msg || msg.type !== MessageType.REQUEST) return;

  if (!isReady) {
    self.postMessage(createError(msg.id, 'NOT_READY', 'ffmpeg is still initializing'));
    return;
  }

  // Track the active request so the ffmpeg 'progress' handler can attribute its events.
  currentRequestId = msg.id;

  try {
    let response;
    switch (msg.method) {
      case 'trim':
        response = await handleTrim(msg.id, msg.payload);
        break;
      case 'cut':
        response = await handleCut(msg.id, msg.payload);
        break;
      case 'export':
        response = await handleExport(msg.id, msg.payload);
        break;
      case 'probe':
        response = await handleProbe(msg.id, msg.payload);
        break;
      case 'concat':
        response = await handleConcat(msg.id, msg.payload);
        break;
      default:
        self.postMessage(createError(msg.id, 'UNKNOWN_METHOD', `Unknown method: ${msg.method}`));
        return;
    }
    // Transfer the result buffer (if any) for zero-copy delivery.
    self.postMessage(response, response.transfer || []);
  } catch (err) {
    self.postMessage(createError(msg.id, 'METHOD_ERROR', err?.message || String(err), err?.stack || null));
  } finally {
    currentRequestId = null;
  }
};

// --- Last-resort error capture ---------------------------------------------------------------
// Convert anything that slips past the handlers into a protocol ERROR so the worker never dies
// silently and the pool can surface a real rejection.
self.addEventListener('error', (e) => {
  self.postMessage(createError(currentRequestId, 'WORKER_ERROR', e?.message || 'Uncaught worker error'));
});
self.addEventListener('unhandledrejection', (e) => {
  const reason = e?.reason;
  self.postMessage(createError(currentRequestId, 'UNHANDLED_REJECTION', reason?.message || String(reason)));
});
