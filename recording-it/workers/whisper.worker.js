// whisper.worker.js  (ES-module worker)
//
// Speech-to-text via Transformers.js (Xenova/whisper-tiny) running entirely in the browser.
// A single ASR pipeline is created once at startup and reused for every request. Audio arrives
// as raw ArrayBuffers (transferred, not copied) and is fed to the model as Float32 PCM.
//
// Privacy note: nothing here ever leaves the device — Transformers.js loads the model into WASM/
// WebGPU and runs inference locally, which is the whole point of "Recording It".

// --- Plugin self-registration (MUST be first) ------------------------------------------------
self.PLUGIN_NAME = 'whisper';
self.PLUGIN_VERSION = '1.0.0';
self.PLUGIN_METHODS = ['transcribe', 'transcribeLive', 'detectLanguage'];

import { pipeline, env } from '@xenova/transformers';
import {
  MessageType,
  createResponse,
  createProgress,
  createError,
  createReadyMessage,
} from '../src/worker-protocol.js';

// --- Worker state ----------------------------------------------------------------------------
let transcriber = null; // the ASR pipeline instance
let isReady = false;

/**
 * Load the Whisper pipeline once. Fire-and-forget at module load.
 */
async function init() {
  // Pull weights from the Hugging Face hub (no local model dir), but let Transformers.js persist
  // them in the browser cache so subsequent loads are instant and offline-capable.
  env.allowLocalModels = false;
  env.useBrowserCache = true;

  // whisper-tiny + quantized = the smallest/fastest config, appropriate for mobile-first.
  transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
    quantized: true,
  });

  isReady = true;
  self.postMessage(createReadyMessage(self.PLUGIN_NAME, self.PLUGIN_VERSION, self.PLUGIN_METHODS));
}

init().catch((err) => {
  self.postMessage(createError(null, 'INIT_FAILED', err?.message || String(err), err?.stack || null));
});

// --- Helpers ---------------------------------------------------------------------------------

/**
 * Reinterpret an incoming ArrayBuffer as Float32 mono PCM.
 * Callers transfer a Float32Array's underlying buffer; we view it back as Float32 without copying.
 */
function toFloat32(audioBuffer) {
  // If the buffer length isn't a multiple of 4 it isn't valid Float32 PCM; fail loudly.
  if (audioBuffer.byteLength % 4 !== 0) {
    throw new Error('audioBuffer length is not a multiple of 4 — expected Float32 PCM');
  }
  return new Float32Array(audioBuffer);
}

// --- Method implementations ------------------------------------------------------------------

/**
 * Full-clip transcription with word/segment timestamps.
 * payload: { audioBuffer, language|null, task:'transcribe'|'translate' }
 * → { text, chunks:[{timestamp:[start,end], text}] }
 */
async function handleTranscribe(requestId, payload) {
  const { audioBuffer, language = null, task = 'transcribe' } = payload;
  const audio = toFloat32(audioBuffer);

  const result = await transcriber(audio, {
    language,
    task,
    // 30s chunks with 5s overlap is Whisper's recommended long-form setup; stride avoids dropping
    // words at chunk boundaries.
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: true,
    // Stream partial decodes back as progress so the UI can show live text while a long clip runs.
    callback_function: (beams) => {
      try {
        const partial = beams?.[0]?.output_token_ids
          ? transcriber.tokenizer.decode(beams[0].output_token_ids, { skip_special_tokens: true })
          : '';
        self.postMessage(createProgress(requestId, 50, partial));
      } catch {
        /* decoding a partial beam is best-effort; never let it break the run */
      }
    },
  });

  return createResponse(requestId, {
    text: result.text || '',
    chunks: Array.isArray(result.chunks) ? result.chunks : [],
  });
}

/**
 * Low-latency transcription of a short rolling window (e.g. ~3s) for live captioning.
 * payload: { audioChunk, sequenceId } → { sequenceId, text, isFinal }
 */
async function handleTranscribeLive(requestId, payload) {
  const { audioChunk, sequenceId } = payload;
  const audio = toFloat32(audioChunk);

  // Short window: skip chunking entirely for minimum latency.
  const result = await transcriber(audio, { chunk_length_s: 0, return_timestamps: false });

  // A live partial is never "final" — the caller decides when a phrase is complete from its own
  // VAD/silence detection; we always report isFinal:false here.
  return createResponse(requestId, {
    sequenceId,
    text: result.text || '',
    isFinal: false,
  });
}

/**
 * Detect the dominant spoken language.
 * payload: { audioBuffer } → { language, confidence }
 *
 * Whisper exposes language via its first decoded token when you don't force a language. We run a
 * tiny transcription and read the model's chosen language back off the pipeline config.
 */
async function handleDetectLanguage(requestId, payload) {
  const { audioBuffer } = payload;
  const audio = toFloat32(audioBuffer);

  // language:null lets Whisper auto-detect; we only need a short window to identify it.
  const result = await transcriber(audio, {
    language: null,
    task: 'transcribe',
    chunk_length_s: 30,
    return_timestamps: false,
  });

  // Transformers.js surfaces the detected language on the result when available; fall back to the
  // tokenizer's most recent decode. Confidence isn't directly exposed, so we report a heuristic.
  const language = result?.language || transcriber?.model?.config?.lang || 'unknown';
  return createResponse(requestId, { language, confidence: result?.language ? 0.9 : 0.5 });
}

// --- Message router --------------------------------------------------------------------------
self.onmessage = async (event) => {
  const msg = event.data;
  if (!msg || msg.type !== MessageType.REQUEST) return;

  // Whisper init (downloading + compiling the model) can take seconds; reject early if a request
  // races ahead of readiness so the caller can retry/queue rather than hang.
  if (!isReady || !transcriber) {
    self.postMessage(createError(msg.id, 'NOT_READY', 'whisper pipeline is still initializing'));
    return;
  }

  try {
    let response;
    switch (msg.method) {
      case 'transcribe':
        response = await handleTranscribe(msg.id, msg.payload);
        break;
      case 'transcribeLive':
        response = await handleTranscribeLive(msg.id, msg.payload);
        break;
      case 'detectLanguage':
        response = await handleDetectLanguage(msg.id, msg.payload);
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
