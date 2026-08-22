/* =====================================================================
 * Kudbee Darts — commentary.js
 * A deterministic, play-by-play commentary engine.
 *
 *   - Event-driven: the game reports what happened (treble-20, 180, bust,
 *     checkout) and the engine says the right line with the right energy.
 *   - Deterministic: same event always yields from the same line pool, so a
 *     replay reads identically.
 *   - Backend-swappable: ships with the browser's Web Speech API (zero deps,
 *     works today, fully offline). Drop in a Kokoro / Chatterbox backend later
 *     without touching the game — just assign engine.backend.
 *
 * Hook: after creating the Game, do
 *   this.commentary = new KD.CommentaryEngine(this);
 * and call this.commentary.onDart(res, out) from _onDartLand, onBust(),
 * on180(), onWin(), onMatchWin() — see the wiring in game.js.
 * ===================================================================== */
(function (KD) {
  'use strict';

  // ---- line pools -------------------------------------------------------
  // Each pool is a deterministic array. We rotate via a per-context counter so
  // we don't repeat the same quip every single dart, but a given event ALWAYS
  // draws from its own pool (replays are deterministic).
  var POOLS = {
    miss:      ['Wide.', 'Nothing on it.', 'Off the board.', 'A miss.', 'Nowhere near it.', 'Lost that one.'],
    singleLo:  ['Just the one.', 'A single.', 'Just one.', 'Counts one.'],
    singleHi:  ['The big twenty.', 'Twenty.', 'Landing on twenty.', 'He finds twenty.'],
    treble:    ['Treble!', 'A treble!', 'Treble, good dart.', 'Found the treble.'],
    t20:       ['Treble twenty!', 'A big treble twenty!', 'Maximum!', 'The big twenty again.', 'Treble twenty, clinical!'],
    bull:      ['The bull!', 'Straight in the bull!', 'Dead centre!', 'Bullseye!'],
    d25:       ['Two fifty.', 'The outer bull.', 'Two and a half dozen.'],
    double:    ['A double!', 'He doubles up.', 'Double, that is the shot.'],
    big:       ['A massive score!', 'What a shot!', 'Huge scoring!', 'Piling them in.'],
    bust:      ['And that is a bust.', 'He busted.', 'Oh, bust.', 'It all falls apart, bust.'],
    s180:      ['One hundred and eighty!', 'A maximum!', 'Absolutely magnificent, one eighty!', 'A perfect visit!'],
    checkout:  ['And it is a finish!', 'He takes the leg!', 'What a checkout!', 'That wraps it up!'],
    legWin:    ['He takes the leg!', 'Leg to him!', 'That is the leg.', 'He seals the leg.'],
    matchWin:  ['Game shot! He takes the match!', 'What a performance, match winner!', 'He is done! The match is his!']
  };

  function pick(pool, key) {
    pool = POOLS[pool] || POOLS.singleLo;
    var idx = (key || 0) % pool.length;
    return pool[idx];
  }

  // ---- default backend: Web Speech API ----------------------------------
  // Ships with every browser. Zero deps, fully offline, works today.
  var WebSpeechBackend = {
    _speaking: false,
    _rate: 1.08,
    _pitch: 1.0,
    available: false,
    init: function () {
      if (!('speechSynthesis' in window)) return false;
      this.available = true;
      var self = this;
      var choose = function () {
        var voices = speechSynthesis.getVoices();
        if (!voices.length) return;
        var v = voices.filter(function (x) { return /^en(-|_|$)/i.test(x.lang); })[0] || voices[0];
        self._voice = v;
      };
      choose();
      if (typeof speechSynthesis.onvoiceschanged !== 'undefined')
        speechSynthesis.onvoiceschanged = choose;
      return true;
    },
    speak: function (text, onEnd, priority) {
      if (!this.available || !text) { if (onEnd) onEnd(); return; }
      if (priority === 'high') { speechSynthesis.cancel(); this._speaking = false; }
      var self = this;
      var u = new SpeechSynthesisUtterance(text);
      if (this._voice) u.voice = this._voice;
      u.rate = this._rate;
      u.pitch = this._pitch;
      u.volume = 1.0;
      u.onend = function () { self._speaking = false; if (onEnd) onEnd(); };
      u.onerror = function () { self._speaking = false; if (onEnd) onEnd(); };
      speechSynthesis.speak(u);
      this._speaking = true;
    },
    setRate: function (r) { this._rate = r || 1; }
  };

  // ---- CommentaryEngine --------------------------------------------------
  function CommentaryEngine(game) {
    this.game = game;
    this.enabled = true;
    this._counters = {};
    // Use the swappable TTS module if it loaded, else fall back to Web Speech.
    if (window.KD && KD.TTS) {
      // Default to Web Speech (zero-setup). Call useHTTP(url, voice) to switch to
      // a self-hosted Kokoro/Chatterbox server at runtime.
      this.backend = KD.TTS.webSpeech();
    } else {
      this.backend = WebSpeechBackend;
    }
    if (this.backend.init) this.backend.init();
  }

  // Switch to a self-hosted OpenAI-compatible TTS server (Kokoro/Chatterbox/MOSS).
  // usage: commentary.useHTTP('http://localhost:8880', 'af_heart')
  CommentaryEngine.prototype.useHTTP = function (url, voice) {
    if (window.KD && KD.TTS) {
      this.backend = KD.TTS.http({ url: url, voice: voice });
      return this.backend.available || this.backend._fallback;
    }
    return false;
  };

  // Switch back to the browser's built-in Web Speech.
  CommentaryEngine.prototype.useWebSpeech = function () {
    if (window.KD && KD.TTS) this.backend = KD.TTS.webSpeech();
    else { this.backend = WebSpeechBackend; this.backend.init(); }
  };

  CommentaryEngine.prototype.backendName = function () { return (this.backend && this.backend.name) || 'web-speech'; };

  CommentaryEngine.prototype._say = function (text, priority) {
    if (!this.enabled || !text) return;
    if (this.game._say) this.game._say(text, priority === 'high' ? 1.9 : 1.3);
    if (this.backend && this.backend.speak) this.backend.speak(text, null, priority);
  };

  CommentaryEngine.prototype._line = function (pool) {
    this._counters[pool] = (this._counters[pool] || 0);
    var v = pick(pool, this._counters[pool]);
    this._counters[pool]++;
    return v;
  };

  // ---- event handlers (called from game.js) ------------------------------
  CommentaryEngine.prototype.onDart = function (res, out) {
    if (!this.enabled) return;
    var ring = res.ring, val = res.value;
    if (out && out.bust) return;
    if (ring === 'miss') { this._say(this._line('miss'), 'low'); return; }
    if (ring === 'treble' && val === 20) { this._say(this._line('t20'), 'high'); return; }
    if (ring === 'treble') { this._say(this._line('treble') + ' ' + val, 'med'); return; }
    if (ring === 'inbull') { this._say(this._line('bull'), 'high'); return; }
    if (ring === 'outbull') { this._say(this._line('d25'), 'med'); return; }
    if (ring === 'double') { this._say(this._line('double') + ' ' + val, 'med'); return; }
    if (val >= 15) this._say(this._line('singleHi'), 'low');
    else this._say(this._line('singleLo'), 'low');
  };

  CommentaryEngine.prototype.onBig = function () {
    if (!this.enabled) return;
    this._say(this._line('big'), 'med');
  };

  CommentaryEngine.prototype.on180 = function () {
    if (!this.enabled) return;
    this._say(this._line('s180'), 'high');
  };

  CommentaryEngine.prototype.onBust = function () {
    if (!this.enabled) return;
    this._say(this._line('bust'), 'high');
  };

  CommentaryEngine.prototype.onWin = function () {
    if (!this.enabled) return;
    this._say(this._line('checkout'), 'high');
    var self = this;
    setTimeout(function () { self._say(self._line('legWin'), 'high'); }, 900);
  };

  CommentaryEngine.prototype.onMatchWin = function () {
    if (!this.enabled) return;
    this._say(this._line('matchWin'), 'high');
  };

  CommentaryEngine.prototype.setEnabled = function (on) {
    this.enabled = on;
    if (!on && 'speechSynthesis' in window) speechSynthesis.cancel();
  };

  CommentaryEngine.prototype.isEnabled = function () { return this.enabled; };

  KD.CommentaryEngine = CommentaryEngine;
})(window.KD = window.KD || {});
