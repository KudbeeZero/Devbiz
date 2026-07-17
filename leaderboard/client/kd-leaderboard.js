/* =====================================================================
 * Kudbee Leaderboard — client/kd-leaderboard.js
 * A tiny browser SDK (global `KDLeaderboard`) used by the leaderboard page
 * and, optionally, by the games. It abstracts auth so callers don't care
 * whether we're on ALGO wallet, Clerk, or keyless demo mode:
 *
 *   const lb = await KDLeaderboard.create(window.KD_LB_CONFIG);
 *   lb.isSignedIn(); lb.user();                    // identity
 *   await lb.signIn(); await lb.signOut();          // wallet connect / Clerk modal / demo prompt
 *   await lb.signIn({ provider: 'algo' });          // explicit provider (Phase 3 UI will use this)
 *   await lb.leaderboard('rating', 50);             // public standings
 *   await lb.submit(name, { rating, ... });         // auth required
 *   await lb.me();                                   // your record + ranks
 *
 * Config (window.KD_LB_CONFIG):
 *   { API_BASE, GAME, AUTH_PROVIDERS: ['algo','clerk','demo'], CLERK_PUBLISHABLE_KEY,
 *     ALGO_NETWORK: 'testnet'|'mainnet' (default testnet), ALGO_MAX_AGE_SECONDS }
 *
 * ALGO wallet flow (Pera Wallet Connect, @perawallet/connect):
 *   1. connect()    -> wallet picker, returns the account address (one-time approval)
 *   2. sign a message { algo_address, timestamp, nonce, exp } via peraWallet.signData()
 *   3. send it as `Authorization: Bearer <sig_b64>` + `X-Algo-Message: <payload_b64>`
 *   The server (shared/algo-auth.js) verifies the ed25519 signature networklessly.
 *
 * Honest limitation: the server verifies the *raw signed message* on every request
 * (there is no session/JWT issuance endpoint yet) and enforces message freshness via
 * ALGO_MAX_AGE_SECONDS (default 600s / 10 min) independent of the signed `exp` field.
 * So this SDK caches the signed (signature, payload) pair client-side and reuses it
 * until it is within 60s of that freshness window, then transparently re-signs — which
 * still requires a wallet approval each time the cache expires. A true "sign once, stay
 * in for 7 days with zero prompts" UX needs a follow-up: a Worker endpoint that exchanges
 * a verified ALGO signature for a short-lived, server-issued session token. Not built
 * here — flagged as a Phase 2.5/3 follow-up, not implemented.
 *
 * No build step — load with a plain <script> tag. The Pera SDK itself is ESM-only, so
 * it's loaded lazily via a dynamic import() from an ESM CDN (esm.sh) only when 'algo'
 * is an enabled provider — zero cost for sites that don't use it.
 * ===================================================================== */
(function (root) {
  'use strict';

  // ---- shared helpers -----------------------------------------------------

  function frontendApiFromPk(pk) {
    try {
      var enc = pk.split('_').slice(2).join('_');
      return atob(enc).replace(/\$+$/, '') || null;
    } catch (e) { return null; }
  }

  function injectScript(src, attrs) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.async = true; s.crossOrigin = 'anonymous';
      Object.keys(attrs || {}).forEach(function (k) { s.setAttribute(k, attrs[k]); });
      s.onload = resolve; s.onerror = function () { reject(new Error('failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }

  function demoIdentity() {
    var id = localStorage.getItem('kd.lb.demoId');
    if (!id) {
      id = 'g' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
      localStorage.setItem('kd.lb.demoId', id);
    }
    return { id: id, name: localStorage.getItem('kd.lb.demoName') || '' };
  }

  // ---- ALGO wallet helpers (pure; unit-tested from Node, no DOM needed) ---

  function randomNonce() {
    var bytes = new Uint8Array(16);
    if (root.crypto && root.crypto.getRandomValues) {
      root.crypto.getRandomValues(bytes);
    } else {
      for (var i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    var hex = '';
    for (var j = 0; j < bytes.length; j++) hex += bytes[j].toString(16).padStart(2, '0');
    return hex; // 32 hex chars — within algo-auth.js's 8-64 char nonce bound
  }

  // Field order matters: must match shared/algo-auth.js reconstructSignedMessage()
  // exactly, since the server re-derives the signed bytes from this same shape.
  function buildAlgoPayload(address, maxAgeSeconds, nowSeconds) {
    var now = nowSeconds != null ? nowSeconds : Math.floor(Date.now() / 1000);
    return {
      algo_address: address,
      timestamp: now,
      nonce: randomNonce(),
      exp: now + (maxAgeSeconds || 600),
    };
  }

  function payloadToBase64(payload) {
    // ASCII-safe (base32 address + digits + hex nonce) — plain btoa is fine.
    return btoa(JSON.stringify(payload));
  }

  function bytesToBase64(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  // ---- ALGO wallet provider -------------------------------------------------

  function AlgoWallet(cfg) {
    this.maxAge = cfg.ALGO_MAX_AGE_SECONDS || 600;
    this.chainId = cfg.ALGO_NETWORK === 'mainnet' ? 416001 : 416002; // default: testnet
    this.pera = null;
    this.address = (typeof localStorage !== 'undefined' && localStorage.getItem('kd.lb.algoAddress')) || null;
    this._cached = null; // { address, sig_b64, payload_b64, exp }
    this._loadCache();
  }

  AlgoWallet.prototype._loadCache = function () {
    try {
      var raw = localStorage.getItem('kd.lb.algoSession');
      this._cached = raw ? JSON.parse(raw) : null;
    } catch (e) { this._cached = null; }
  };

  AlgoWallet.prototype._saveCache = function () {
    try {
      if (this._cached) localStorage.setItem('kd.lb.algoSession', JSON.stringify(this._cached));
      else localStorage.removeItem('kd.lb.algoSession');
    } catch (e) { /* storage unavailable/full — auth still works, just re-signs next call */ }
  };

  AlgoWallet.prototype._ensureSDK = function () {
    var self = this;
    if (this.pera) return Promise.resolve(this.pera);
    // @perawallet/connect is ESM-only; esm.sh serves a browser-ready build with no build step.
    return import(/* webpackIgnore: true */ 'https://esm.sh/@perawallet/connect@1?bundle').then(function (mod) {
      var PeraWalletConnect = mod.PeraWalletConnect || mod.default;
      self.pera = new PeraWalletConnect({ chainId: self.chainId });
      if (self.pera.connector && typeof self.pera.connector.on === 'function') {
        self.pera.connector.on('disconnect', function () { self._onWalletDisconnected(); });
      }
      return self.pera;
    });
  };

  AlgoWallet.prototype._onWalletDisconnected = function () {
    this.address = null;
    this._cached = null;
    this._saveCache();
    try { localStorage.removeItem('kd.lb.algoAddress'); } catch (e) { /* ignore */ }
  };

  // Silent, best-effort — restores a prior connection without prompting the user.
  AlgoWallet.prototype.reconnect = function () {
    var self = this;
    return this._ensureSDK().then(function (pera) {
      return pera.reconnectSession().then(function (accounts) {
        if (accounts && accounts[0]) {
          self.address = accounts[0];
          try { localStorage.setItem('kd.lb.algoAddress', self.address); } catch (e) { /* ignore */ }
        }
        return self.address;
      });
    }).catch(function () { return self.address; });
  };

  // Explicit, user-initiated — opens the Pera wallet picker.
  AlgoWallet.prototype.connect = function () {
    var self = this;
    return this._ensureSDK().then(function (pera) {
      return pera.connect().then(function (accounts) {
        self.address = accounts[0];
        try { localStorage.setItem('kd.lb.algoAddress', self.address); } catch (e) { /* ignore */ }
        return self.address;
      });
    });
  };

  AlgoWallet.prototype.disconnect = function () {
    var self = this;
    this._onWalletDisconnected();
    if (this.pera) { try { this.pera.disconnect(); } catch (e) { /* already gone */ } }
    return Promise.resolve();
  };

  AlgoWallet.prototype.isSignedIn = function () { return !!this.address; };

  AlgoWallet.prototype._freshCachedAuth = function () {
    if (!this._cached || this._cached.address !== this.address) return null;
    var now = Math.floor(Date.now() / 1000);
    // Re-sign a bit before the server would reject on freshness (60s safety margin).
    if (this._cached.exp - now <= 60) return null;
    return this._cached;
  };

  AlgoWallet.prototype._sign = function () {
    var self = this;
    if (!this.address) return Promise.reject(new Error('algo_not_connected'));
    return this._ensureSDK().then(function (pera) {
      var payload = buildAlgoPayload(self.address, self.maxAge);
      var messageBytes = new TextEncoder().encode(JSON.stringify(payload));
      return pera.signData(
        [{ data: messageBytes, message: 'Sign in to the Kudbee Bullseye League' }],
        self.address
      ).then(function (signed) {
        var cached = {
          address: self.address,
          sig_b64: bytesToBase64(signed[0]),
          payload_b64: payloadToBase64(payload),
          exp: payload.exp,
        };
        self._cached = cached;
        self._saveCache();
        return cached;
      });
    });
  };

  AlgoWallet.prototype.authHeaders = function () {
    var fresh = this._freshCachedAuth();
    if (fresh) return Promise.resolve({ authorization: 'Bearer ' + fresh.sig_b64, 'x-algo-message': fresh.payload_b64 });
    return this._sign().then(function (cached) {
      return { authorization: 'Bearer ' + cached.sig_b64, 'x-algo-message': cached.payload_b64 };
    });
  };

  // ---- Client ---------------------------------------------------------------

  function Client(cfg, clerk, algo, providers) {
    this.cfg = cfg;
    this.clerk = clerk || null;      // null unless Clerk is enabled + loaded
    this.algo = algo || null;        // null unless 'algo' is an enabled provider
    this.providers = providers && providers.length ? providers : ['demo'];
    this.base = (cfg.API_BASE || '').replace(/\/+$/, '');
    this.game = cfg.GAME || 'darts';
  }

  Client.prototype.mode = function () {
    if (this.algo && this.algo.isSignedIn()) return 'algo';
    if (this.clerk && this.clerk.user) return 'clerk';
    return 'demo';
  };

  Client.prototype.isSignedIn = function () {
    if (this.algo && this.algo.isSignedIn()) return true;
    if (this.clerk) return !!this.clerk.user;
    return !!localStorage.getItem('kd.lb.demoName');
  };

  Client.prototype.user = function () {
    if (this.algo && this.algo.isSignedIn()) {
      var addr = this.algo.address;
      return { name: addr.slice(0, 8) + '…' + addr.slice(-4), avatar: null, demo: false, wallet: addr };
    }
    if (this.clerk && this.clerk.user) {
      var u = this.clerk.user;
      return { name: u.fullName || u.username || (u.primaryEmailAddress && u.primaryEmailAddress.emailAddress) || 'Player', avatar: u.imageUrl || null, demo: false };
    }
    var d = demoIdentity();
    return d.name ? { name: d.name, avatar: null, demo: true } : null;
  };

  // signIn(): no-arg uses the first configured provider (back-compat with the
  // existing "Sign in" button). signIn({ provider, name }): explicit choice,
  // for the provider-picker UI landing in Phase 3.
  Client.prototype.signIn = function (opts) {
    var provider, demoName;
    if (opts && typeof opts === 'object') {
      provider = opts.provider;
      demoName = opts.name;
    } else {
      demoName = opts; // legacy: signIn('SomeName') picked a demo name directly
      provider = this.providers[0];
    }

    if (provider === 'algo') {
      if (!this.algo) return Promise.reject(new Error('algo_not_enabled'));
      return this.algo.connect();
    }
    if (provider === 'clerk') {
      if (!this.clerk) return Promise.reject(new Error('clerk_not_enabled'));
      this.clerk.openSignIn();
      return Promise.resolve();
    }
    var name = demoName != null ? demoName : (root.prompt ? root.prompt('Choose a display name for the demo leaderboard:', '') : '');
    if (name) localStorage.setItem('kd.lb.demoName', String(name).slice(0, 24));
    return Promise.resolve();
  };

  Client.prototype.signOut = function () {
    if (this.algo && this.algo.isSignedIn()) return this.algo.disconnect();
    if (this.clerk) return this.clerk.signOut();
    localStorage.removeItem('kd.lb.demoName');
    return Promise.resolve();
  };

  Client.prototype._authHeaders = function () {
    if (this.algo && this.algo.isSignedIn()) {
      return this.algo.authHeaders().catch(function () { return {}; });
    }
    if (this.clerk) {
      if (!this.clerk.session) return Promise.resolve({});
      return this.clerk.session.getToken().then(function (t) {
        return t ? { authorization: 'Bearer ' + t } : {};
      });
    }
    var d = demoIdentity();
    var h = { 'x-demo-user': d.id };
    // Percent-encode: HTTP header values are ByteString (Latin-1), so a raw
    // name with an emoji/accent would make fetch() throw. The server decodes it.
    if (d.name) h['x-demo-name'] = encodeURIComponent(d.name);
    return Promise.resolve(h);
  };

  Client.prototype._fetch = function (path, opts) {
    opts = opts || {};
    var self = this;
    return this._authHeaders().then(function (auth) {
      var headers = Object.assign({ 'content-type': 'application/json' }, auth, opts.headers || {});
      return fetch(self.base + path, { method: opts.method || 'GET', headers: headers, body: opts.body });
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw Object.assign(new Error(j.error || ('http_' + r.status)), { status: r.status, data: j });
        return j;
      });
    });
  };

  Client.prototype.leaderboard = function (metric, limit) {
    var q = '?game=' + encodeURIComponent(this.game) + '&metric=' + encodeURIComponent(metric || 'rating') + '&limit=' + (limit || 50);
    return this._fetch('/api/leaderboard' + q);
  };
  Client.prototype.me = function () {
    return this._fetch('/api/me?game=' + encodeURIComponent(this.game));
  };
  Client.prototype.submit = function (name, metrics) {
    return this._fetch('/api/scores', {
      method: 'POST',
      body: JSON.stringify({ game: this.game, name: name, metrics: metrics }),
    });
  };

  var KDLeaderboard = {
    create: function (cfg) {
      cfg = cfg || {};
      var providers = cfg.AUTH_PROVIDERS && cfg.AUTH_PROVIDERS.length
        ? cfg.AUTH_PROVIDERS
        : (cfg.CLERK_PUBLISHABLE_KEY ? ['clerk', 'demo'] : ['demo']);

      var algo = providers.indexOf('algo') !== -1 ? new AlgoWallet(cfg) : null;
      var wantsClerk = providers.indexOf('clerk') !== -1 && cfg.CLERK_PUBLISHABLE_KEY;

      function loadClerk() {
        if (!wantsClerk) return Promise.resolve(null);
        var pk = cfg.CLERK_PUBLISHABLE_KEY;
        var host = frontendApiFromPk(pk);
        if (!host) return Promise.resolve(null);
        var src = 'https://' + host + '/npm/@clerk/clerk-js@5/dist/clerk.browser.js';
        return injectScript(src, { 'data-clerk-publishable-key': pk })
          .then(function () { return root.Clerk.load(); })
          .then(function () { return root.Clerk; })
          .catch(function () { return null; }); // fall through to demo
      }

      return loadClerk().then(function (clerk) {
        var client = new Client(cfg, clerk, algo, providers);
        if (!algo) return client;
        // Best-effort silent reconnect so a returning wallet user isn't asked
        // to re-approve the connection every page load. Never blocks render.
        return algo.reconnect().then(function () { return client; });
      });
    },
    // Pure-logic exports for Node-based unit tests (no DOM/wallet required).
    // client/ is intentionally outside the shared/ coverage gate (see .c8rc.json) —
    // these tests exist for quality, not to satisfy that gate.
    TEST_UTILS: {
      frontendApiFromPk: frontendApiFromPk,
      randomNonce: randomNonce,
      buildAlgoPayload: buildAlgoPayload,
      payloadToBase64: payloadToBase64,
      bytesToBase64: bytesToBase64,
    },
  };

  root.KDLeaderboard = KDLeaderboard;

  // This file is loaded as a plain classic <script> in the browser (not type="module"),
  // so it can't use `export`; and the repo's package.json sets "type": "module", so
  // CommonJS `module.exports` doesn't exist either. `globalThis` is the one object both
  // environments share — tests import this file for its side effect of setting
  // `globalThis.KDLeaderboard`, then read `.TEST_UTILS` off it.
})(typeof window !== 'undefined' ? window : globalThis);
