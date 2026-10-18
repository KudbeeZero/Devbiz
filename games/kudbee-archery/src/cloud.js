/* =====================================================================
 * Kudbee Archery — cloud.js (CLOUD SAVE + the LEAGUE)
 * Progress follows you. After your first finished round the game makes a
 * BACKUP CODE on this device (KDB-XXXX-XXXX-XXXX-XXXX: 80 random bits in
 * Crockford base32, no I/L/O/U). The code is your guest account: the server
 * (the Kudbee leaderboard Worker, leaderboard/) keys your save by a hash of it
 * and never sees anything else about you. Type it on another phone (USE A
 * CODE) and your stars, bests, trophies, gems and cups come along.
 *
 * Sync = read the cloud save, MERGE it with this device's (the best of both:
 * stars, bests, stats, trophies, gems, kit owned, cups; this device keeps its
 * own settings), write it back on the revision it read. If another device
 * wrote in between, the server says so with its newer save; merge again and
 * write again. The merged save goes back through KAR.Store.load's checks.
 * No network, no Worker yet, a blocked request: the game carries on as
 * before (the save is still on the phone) and says so on the CLOUD screen.
 * window.KAR_API overrides the API origin ('' = this site; null = off).
 * ===================================================================== */

KAR.Cloud = {
  API: typeof window !== 'undefined' && window.KAR_API !== undefined ? window.KAR_API : 'https://kudbee-leaderboard.kudbee.workers.dev',
  KEY: 'kudbee.archery.cloud',          // this device's link: { code, rev, name, at }
  GAME: 'archery',
  ABC: '0123456789ABCDEFGHJKMNPQRSTVWXYZ',
  meta: { code: null, rev: 0, name: null, at: 0 },
  state: 'idle',                         // idle | syncing | ok | offline | bad | off
  board: null,                           // the LEAGUE: { entries, you, total, at }

  on() { return this.API !== null && this.API !== false; },
  load() {
    try { const m = JSON.parse(window.localStorage.getItem(this.KEY) || 'null'); if (m && typeof m === 'object') { const c = this.norm(m.code); if (c) this.meta = { code: c, rev: Number.isInteger(m.rev) && m.rev >= 0 ? m.rev : 0, name: typeof m.name === 'string' ? m.name.slice(0, 16) : null, at: +m.at || 0 }; } } catch (e) { /* storage unavailable */ }
    if (!this.on()) this.state = 'off';
    return this.meta;
  },
  keep() { try { window.localStorage.setItem(this.KEY, JSON.stringify(this.meta)); } catch (e) { /* ignore */ } },

  // ---- the code ----
  // typed codes are forgiving: any case, dashes or spaces, the KDB prefix optional, I/L read as 1 and O as 0
  norm(raw) {
    let s = String(raw || '').toUpperCase().replace(/[\s-]/g, '');
    if (s.indexOf('KDB') === 0) s = s.slice(3);
    s = s.replace(/[IL]/g, '1').replace(/O/g, '0');
    return /^[0-9A-HJKMNP-TV-Z]{16}$/.test(s) ? s : null;
  },
  pretty(c) { return c ? 'KDB-' + c.match(/.{4}/g).join('-') : ''; },
  newCode() { const b = new Uint8Array(16); window.crypto.getRandomValues(b); let s = ''; for (const x of b) s += this.ABC[x & 31]; return s; },
  // a league name from the code's hash (never from the code itself), e.g. ARCHER 3F9A
  async tag(c) { const h = new Uint8Array(await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode('kudbee-name:' + c))); return [...h.slice(0, 2)].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase(); },

  // ---- the merge: the best of both saves; this device keeps its own settings, mode, kit worn and today's quests ----
  merge(L, R) {
    const out = JSON.parse(JSON.stringify(L));
    if (!R || typeof R !== 'object') return out;
    const num = v => Number.isFinite(v) ? v : 0;
    const mx = (a, b) => Math.max(num(a), num(b));
    const arrMax = (a, b) => Array.isArray(a) && Array.isArray(b) ? a.map((v, i) => mx(v, b[i])) : a;
    if (R.tour && out.tour) { out.tour.stars = arrMax(out.tour.stars, R.tour.stars); out.tour.best = arrMax(out.tour.best, R.tour.best); }
    out.best = arrMax(out.best, R.best); out.stars = arrMax(out.stars, R.stars); out.cupWon = arrMax(out.cupWon, R.cupWon);
    out.trickBest = mx(out.trickBest, R.trickBest); out.swingBest = mx(out.swingBest, R.swingBest); out.gems = mx(out.gems, R.gems);
    out.tourLv = mx(out.tourLv, R.tourLv);
    if (R.stats && out.stats) for (const k in out.stats) out.stats[k] = mx(out.stats[k], R.stats[k]);
    if (R.ach && typeof R.ach === 'object') for (const k in R.ach) if (R.ach[k] === 1) out.ach[k] = 1;
    for (const k of ['ownBow', 'ownArrow']) if (Number.isInteger(R[k])) out[k] = (out[k] | R[k]) & 15;
    if (Number.isInteger(R.tut)) out.tut = out.tut | R.tut;
    if (R.daily && out.daily) { if (num(R.daily.day) > num(out.daily.day)) out.daily = Object.assign({}, R.daily); else if (R.daily.day === out.daily.day) { out.daily.best = mx(out.daily.best, R.daily.best); out.daily.plays = mx(out.daily.plays, R.daily.plays); } }
    if (R.streak && out.streak) { const b = mx(out.streak.best, R.streak.best); if (num(R.streak.day) > num(out.streak.day)) out.streak = { day: R.streak.day, n: R.streak.n, best: b }; else out.streak.best = b; }
    if (!out.cup && R.cup) out.cup = R.cup;
    return out;
  },
  // the league line for this save
  metrics(D) { return { stars: D.tour.stars.reduce((a, b) => a + b, 0), golds: D.stats.tens, xs: D.stats.xs, bestStreak: D.stats.bestStreak, cups: D.cupWon.reduce((a, b) => a + b, 0) }; },

  // ---- the network ----
  async _req(method, path, body) {
    const h = { 'x-guest-code': this.meta.code, 'x-guest-name': encodeURIComponent(this.meta.name || '') };
    if (body) h['content-type'] = 'application/json';
    const r = await fetch(this.API + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    let j = null; try { j = await r.json(); } catch (e) { /* not JSON */ }
    return { status: r.status, body: j || {} };
  },
  _apply(merged) {
    try { window.localStorage.setItem(KAR.Store.KEY, JSON.stringify(merged)); } catch (e) { return; }
    KAR.Store.load();                    // through the save's own checks: a forged cloud save can't open what it shouldn't
  },
  // make this device's code (after the first finished round), then sync
  async start() {
    if (!this.on()) return false;
    if (!this.meta.code) { this.meta.code = this.newCode(); this.meta.rev = 0; this.meta.name = 'ARCHER ' + await this.tag(this.meta.code); this.keep(); }
    return this.sync();
  },
  // pull + merge + push (one retry when another device wrote first), then post the league line and fetch the board
  async sync() {
    if (!this.on() || !this.meta.code || this.busy) return false;
    this.busy = true; this.state = 'syncing';
    try {
      let g = await this._req('GET', '/api/save?game=' + this.GAME);
      if (g.status !== 200) throw new Error(g.status === 401 ? 'bad' : 'net');
      let rev = g.body.save ? g.body.save.rev : 0;
      if (g.body.save && g.body.save.data) this._apply(this.merge(KAR.Store.data, g.body.save.data));
      for (let i = 0; i < 3; i++) {
        const p = await this._req('POST', '/api/save', { game: this.GAME, rev, data: KAR.Store.data });
        if (p.status === 200) { rev = p.body.rev; break; }
        if (p.status !== 409 || !p.body.save) throw new Error('net');
        this._apply(this.merge(KAR.Store.data, p.body.save.data)); rev = p.body.save.rev;
      }
      this.meta.rev = rev; this.meta.at = Date.now(); this.keep();
      await this._req('POST', '/api/scores', { game: this.GAME, name: this.meta.name, metrics: this.metrics(KAR.Store.data) });
      await this.league();
      this.state = 'ok';
      return true;
    } catch (e) { this.state = e && e.message === 'bad' ? 'bad' : 'offline'; return false; }
    finally { this.busy = false; }
  },
  async league() {
    const r = await this._req('GET', '/api/leaderboard?game=' + this.GAME + '&metric=stars&limit=8');
    if (r.status === 200) this.board = { entries: r.body.entries || [], you: r.body.you, total: r.body.total || 0, at: Date.now() };
  },
  // another phone's code: this device becomes that player (its progress merges in; nothing is lost on either side)
  async use(raw) {
    const c = this.norm(raw); if (!c) return 'bad';
    if (c === this.meta.code) return 'same';
    while (this.busy) await new Promise(r => setTimeout(r, 50));     // let a sync in flight finish on the old code first
    this.meta = { code: c, rev: 0, name: 'ARCHER ' + await this.tag(c), at: 0 }; this.keep(); this.board = null;
    return (await this.sync()) ? 'ok' : this.state;
  },
  rename(n) { n = String(n || '').toUpperCase().replace(/[^A-Z0-9 ._-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16); if (!n) return false; this.meta.name = n; this.keep(); this.sync(); return true; },
  // after a round: soon (one sync for a burst of saves), and only once a code exists or a round has been finished
  soon() { if (!this.on()) return; clearTimeout(this._t); this._t = setTimeout(() => { this.start(); }, 1200); },
};
