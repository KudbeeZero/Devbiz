/* =====================================================================
 * Kudbee Darts — tts-backend.js
 * Swappable TTS backends for the commentary engine.
 *
 * The commentary engine (commentary.js) talks to whatever is assigned to
 * `engine.backend`. This file provides two:
 *
 *   1. WebSpeechBackend — the browser's built-in SpeechSynthesis. Zero deps,
 *      fully offline, works today. Ships as the default.
 *
 *   2. HttpTTSBackend — hits a self-hosted OpenAI-compatible TTS endpoint
 *      (Kokoro-FastAPI, Chatterbox, MOSS-TTS, vLLM-Omni, ... all expose
 *      POST /v1/audio/speech). Generates once, caches as a data-URL, plays
 *      via a shared AudioContext. Falls back to Web Speech if the server is
 *      unreachable, so commentary never goes silent.
 *
 * Wire it (pick ONE):
 *   game.commentary.backend = KD.TTS.webSpeech();            // default, zero-setup
 *   game.commentary.backend = KD.TTS.http({ url: 'http://localhost:8880', voice: 'af_heart' });
 *
 * Kokoro-FastAPI one-liner to serve the http backend:
 *   docker run --rm -p 8880:8880 ghcr.io/remsky/kokoro-fastapi:latest
 * ===================================================================== */
(function (KD) {
  'use strict';

  // ---- Web Speech API backend (default) -------------------------------
  function webSpeech() {
    var B = {
      name: 'web-speech',
      available: false,
      _voice: null,
      _rate: 1.08,
      init: function () {
        if (!('speechSynthesis' in window)) return false;
        this.available = true;
        var self = this;
        var choose = function () {
          var voices = speechSynthesis.getVoices();
          if (!voices.length) return;
          // prefer an English voice, else first available
          self._voice = voices.filter(function (x) { return /^en(-|_|$)/i.test(x.lang); })[0] || voices[0];
        };
        choose();
        if (typeof speechSynthesis.onvoiceschanged !== 'undefined')
          speechSynthesis.onvoiceschanged = choose;
        return true;
      },
      speak: function (text, onEnd, priority) {
        if (!this.available || !text) { if (onEnd) onEnd(); return; }
        if (priority === 'high') speechSynthesis.cancel();
        var self = this;
        var u = new SpeechSynthesisUtterance(text);
        if (this._voice) u.voice = this._voice;
        u.rate = this._rate; u.pitch = 1.0; u.volume = 1.0;
        u.onend = function () { if (onEnd) onEnd(); };
        u.onerror = function () { if (onEnd) onEnd(); };
        speechSynthesis.speak(u);
      }
    };
    B.init();
    return B;
  }

  // ---- HTTP (Kokoro / Chatterbox / MOSS / vLLM-Omni) backend -----------
  // All of them speak OpenAI's POST /v1/audio/speech shape:
  //   { model, input, voice, response_format, speed } -> audio bytes
  function httpTTS(opts) {
    opts = opts || {};
    var base = (opts.url || 'http://localhost:8880').replace(/\/$/, '');
    var voice = opts.voice || 'af_heart';
    var model = opts.model || 'tts-1';
    var format = opts.format || 'wav';
    var cache = {};            // text -> dataURL, so a line is synthesized once
    var pending = {};          // text -> [callbacks], dedupe in-flight requests

    // single shared context for cached-playback; created lazily on first use
    var actx = null;
    function ctx() {
      if (!actx) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) actx = new AC(); }
      return actx;
    }
    function playDataURL(dataURL, onEnd) {
      var c = ctx();
      if (!c) { if (onEnd) onEnd(); return; }
      if (c.state === 'suspended') c.resume();
      var buf;
      try {
        var bin = atob(dataURL.split(',')[1]);
        var len = bin.length; var bytes = new Uint8Array(len);
        for (var i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
        c.decodeAudioData(bytes.buffer, function (decoded) {
          var src = c.createBufferSource(); src.buffer = decoded;
          src.connect(c.destination); src.start();
          src.onended = function () { if (onEnd) onEnd(); };
        }, function () { if (onEnd) onEnd(); });
      } catch (e) { if (onEnd) onEnd(); }
    }

    var B = {
      name: 'http-tts',
      url: base, voice: voice,
      available: false,
      _fallback: null,

      // Probe the server once at init. If it's down, silently fall back to
      // Web Speech so commentary never goes silent.
      init: function () {
        var self = this;
        this._fallback = webSpeech();
        var ctrl = (window.AbortController ? new AbortController() : null);
        var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 1500);
        var p = fetch(base + '/v1/audio/voices', { signal: ctrl ? ctrl.signal : undefined })
          .then(function (r) { return r.ok; })
          .catch(function () { return false; });
        p.then(function (ok) {
          clearTimeout(timer);
          self.available = ok;
        });
        return true;
      },

      speak: function (text, onEnd, priority) {
        if (!text) { if (onEnd) onEnd(); return; }
        // Server not reachable → use the fallback voice.
        if (!this.available) { this._fallback.speak(text, onEnd, priority); return; }
        // High-priority lines skip the queue visually; we still play them.
        var self = this;
        if (cache[text]) { playDataURL(cache[text], onEnd); return; }
        // Dedupe: if this line is already being synthesized, queue the callback.
        if (pending[text]) { pending[text].push(onEnd); return; }
        pending[text] = [onEnd];
        fetch(base + '/v1/audio/speech', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: model, input: text, voice: voice, response_format: format, speed: 1.0 })
        }).then(function (r) {
          if (!r.ok) throw new Error('tts ' + r.status);
          return r.blob();
        }).then(function (blob) {
          var reader = new FileReader();
          reader.onloadend = function () {
            var dataURL = reader.result;
            cache[text] = dataURL;
            var cbs = pending[text] || []; delete pending[text];
            playDataURL(dataURL, function () {
              cbs.forEach(function (cb) { if (cb) cb(); });
            });
          };
          reader.readAsDataURL(blob);
        }).catch(function () {
          // Synthesis failed mid-flight: fall back for this line only.
          var cbs = pending[text] || []; delete pending[text];
          self._fallback.speak(text, function () {
            cbs.forEach(function (cb) { if (cb) cb(); });
          }, priority);
        });
      }
    };
    B.init();
    return B;
  }

  KD.TTS = {
    webSpeech: webSpeech,
    http: httpTTS,
    // Helper: pick the best available backend with a one-liner.
    // Pass the http opts to try a local server first; auto-falls back to Web Speech.
    auto: function (httpOpts) {
      if (httpOpts) {
        var h = httpTTS(httpOpts);
        // If the probe already failed, just use web speech.
        if (h.available) return h;
      }
      return webSpeech();
    }
  };
})(window.KD = window.KD || {});
