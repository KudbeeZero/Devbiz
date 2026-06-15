/* =====================================================================
 * Kudbee Leaderboard — client/kd-leaderboard.js
 * A tiny browser SDK (global `KDLeaderboard`) used by the leaderboard page
 * and, optionally, by the games. It abstracts auth so callers don't care
 * whether we're on real Clerk or keyless demo mode:
 *
 *   const lb = await KDLeaderboard.create(window.KD_LB_CONFIG);
 *   lb.isSignedIn(); lb.user();                 // identity
 *   await lb.signIn(); await lb.signOut();       // Clerk modal / demo prompt
 *   await lb.leaderboard('rating', 50);          // public standings
 *   await lb.submit(name, { rating, ... });      // auth required
 *   await lb.me();                               // your record + ranks
 *
 * Config (window.KD_LB_CONFIG): { API_BASE, CLERK_PUBLISHABLE_KEY, GAME }.
 * No build step — load with a plain <script> tag.
 * ===================================================================== */
(function (root) {
  'use strict';

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

  function Client(cfg, clerk) {
    this.cfg = cfg;
    this.clerk = clerk;            // null in demo mode
    this.base = (cfg.API_BASE || '').replace(/\/+$/, '');
    this.game = cfg.GAME || 'darts';
  }

  Client.prototype.mode = function () { return this.clerk ? 'clerk' : 'demo'; };

  Client.prototype.isSignedIn = function () {
    if (this.clerk) return !!this.clerk.user;
    return !!localStorage.getItem('kd.lb.demoName');
  };

  Client.prototype.user = function () {
    if (this.clerk && this.clerk.user) {
      var u = this.clerk.user;
      return { name: u.fullName || u.username || (u.primaryEmailAddress && u.primaryEmailAddress.emailAddress) || 'Player', avatar: u.imageUrl || null, demo: false };
    }
    var d = demoIdentity();
    return d.name ? { name: d.name, avatar: null, demo: true } : null;
  };

  Client.prototype.signIn = function (demoName) {
    if (this.clerk) { this.clerk.openSignIn(); return Promise.resolve(); }
    // Demo mode: persist a chosen display name.
    var name = demoName != null ? demoName : (root.prompt ? root.prompt('Choose a display name for the demo leaderboard:', '') : '');
    if (name) localStorage.setItem('kd.lb.demoName', String(name).slice(0, 24));
    return Promise.resolve();
  };

  Client.prototype.signOut = function () {
    if (this.clerk) return this.clerk.signOut();
    localStorage.removeItem('kd.lb.demoName');
    return Promise.resolve();
  };

  Client.prototype._authHeaders = function () {
    var self = this;
    if (this.clerk) {
      if (!this.clerk.session) return Promise.resolve({});
      return this.clerk.session.getToken().then(function (t) {
        return t ? { authorization: 'Bearer ' + t } : {};
      });
    }
    var d = demoIdentity();
    var h = { 'x-demo-user': d.id };
    if (d.name) h['x-demo-name'] = d.name;
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
      var pk = cfg.CLERK_PUBLISHABLE_KEY;
      if (!pk) return Promise.resolve(new Client(cfg, null));   // demo mode
      var host = frontendApiFromPk(pk);
      if (!host) return Promise.resolve(new Client(cfg, null));
      var src = 'https://' + host + '/npm/@clerk/clerk-js@5/dist/clerk.browser.js';
      return injectScript(src, { 'data-clerk-publishable-key': pk })
        .then(function () { return root.Clerk.load(); })
        .then(function () { return new Client(cfg, root.Clerk); })
        .catch(function () { return new Client(cfg, null); });  // fall back to demo
    },
  };

  root.KDLeaderboard = KDLeaderboard;
})(typeof window !== 'undefined' ? window : this);
