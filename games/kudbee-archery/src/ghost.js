/* =====================================================================
 * Kudbee Archery — ghost.js (GHOST CHALLENGES)
 * A finished level becomes a link a friend can play against: "beat my 92 on
 * Level 12". The link carries the level, the match seed (so the friend gets
 * exactly the same wind: one roll per end and one gust per arrow, whatever
 * anyone shoots), the challenger's name and every arrow (ring, X, and where
 * it hit the face in cm). No server: the whole ghost rides in ?c=.
 *
 * As the friend shoots, each of the challenger's arrows lands beside theirs
 * as a ghost and the HUD keeps both scores. A link is never trusted: decode()
 * checks every field against the level it names and returns null on anything
 * off, and the score is always added up from the rings, never read.
 * ===================================================================== */

KAR.Ghost = {
  V: 1,
  MAX: 1600,                                           // a link longer than this is not one of ours
  B64: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',

  name(n) { return String(n || '').toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16); },

  // the ghost of a finished tour level (null for anything else); an arrow in a crate keeps its score but no mark
  of(m, name) {
    if (!m || m.mode !== 'stage' || !m.over || !Number.isInteger(m.seed)) return null;
    const a = m.arrows[0].map(h => {
      const on = h.hit && h.hit.z === undefined;
      return [h.ring, h.x ? 1 : 0, on ? Math.round(h.hit.x * 100) : null, on ? Math.round(h.hit.y * 100) : null];
    });
    return this._check({ v: this.V, l: m.lv, s: m.seed >>> 0, n: this.name(name) || 'AN ARCHER', a });
  },

  // ---- the link ----
  encode(gh) { return this._b64(JSON.stringify({ v: this.V, l: gh.lv, s: gh.seed, n: gh.name, a: gh.raw })); },
  decode(str) {
    if (typeof str !== 'string' || !str || str.length > this.MAX || !/^[A-Za-z0-9_-]+$/.test(str)) return null;
    let o = null;
    try { o = JSON.parse(this._unb64(str)); } catch (e) { return null; }
    return this._check(o);
  },
  // where the link goes: the game's own folder (the host serves its index there) with the ghost in ?c=
  link(gh) { return KAR.Share.SITE + KAR.Share.PATH + '?c=' + this.encode(gh); },

  // every field checked against the level it names; returns the ghost the game uses, or null
  _check(o) {
    if (!o || typeof o !== 'object' || o.v !== this.V) return null;
    const lv = o.l, def = Number.isInteger(lv) && lv >= 0 && lv < KAR.TOUR.length ? KAR.TOUR[lv] : null;
    if (!def || !Number.isInteger(o.s) || o.s < 0 || o.s > 0xffffffff || !Array.isArray(o.a)) return null;
    const per = KAR.CFG.PER, n = def.ends * per;
    if (o.a.length !== n) return null;
    const arrows = [];
    for (let i = 0; i < n; i++) {
      const r = o.a[i];
      if (!Array.isArray(r) || r.length !== 4) return null;
      const [ring, x, hx, hy] = r;
      if (!Number.isInteger(ring) || ring < 0 || ring > 10 || (x !== 0 && x !== 1) || (x === 1 && ring !== 10)) return null;
      const mark = hx !== null || hy !== null;
      if (mark && !(Number.isInteger(hx) && Number.isInteger(hy) && Math.abs(hx) <= 500 && hy >= -100 && hy <= 600)) return null;
      // a mark is drawn like a stuck arrow (R.stuck), which needs a flight direction: a level arrow coming in
      arrows.push({ ring, x: x === 1, end: Math.floor(i / per), hit: mark ? { x: hx / 100, y: hy / 100, vx: 0, vy: -2, vz: 60 } : null });
    }
    const total = arrows.reduce((s, a) => s + a.ring, 0), S = def.stars;
    return { lv, seed: o.s, name: this.name(o.n) || 'AN ARCHER', arrows, total, stars: total >= S[2] ? 3 : total >= S[1] ? 2 : total >= S[0] ? 1 : 0, raw: o.a };
  },

  // the challenger's score after the same number of arrows you've had
  soFar(gh, n) { let s = 0; for (let i = 0; i < Math.min(n, gh.arrows.length); i++) s += gh.arrows[i].ring; return s; },

  // base64url of an ASCII string (no btoa: this file also runs in the headless tests)
  _b64(s) {
    const A = this.B64; let out = '';
    for (let i = 0; i < s.length; i += 3) {
      const a = s.charCodeAt(i), b = s.charCodeAt(i + 1), c = s.charCodeAt(i + 2), n = (a << 16) | ((b || 0) << 8) | (c || 0);
      out += A[(n >> 18) & 63] + A[(n >> 12) & 63] + (i + 1 < s.length ? A[(n >> 6) & 63] : '') + (i + 2 < s.length ? A[n & 63] : '');
    }
    return out;
  },
  _unb64(t) {
    const A = this.B64; let out = '';
    for (let i = 0; i < t.length; i += 4) {
      const v = [0, 1, 2, 3].map(k => (i + k < t.length ? A.indexOf(t[i + k]) : 0));
      const n = (v[0] << 18) | (v[1] << 12) | (v[2] << 6) | v[3];
      out += String.fromCharCode((n >> 16) & 255);
      if (i + 2 < t.length) out += String.fromCharCode((n >> 8) & 255);
      if (i + 3 < t.length) out += String.fromCharCode(n & 255);
    }
    return out;
  },
};
