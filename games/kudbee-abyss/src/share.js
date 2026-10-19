/* =====================================================================
 * Kudbee Abyss - share.js (SHARING)
 * Every ending and the player's progress make a 1200 x 630 card painted from the
 * game's own art: the world painting, the Queen on the phone's lock screen, the
 * ending's name and "N of 13 endings found". Phones hand the picture straight to the
 * share sheet; elsewhere the Share screen previews it with X / Facebook / WhatsApp /
 * copy / save. The link in every share is a landing page per ending (s/<slug>/)
 * whose og:image is the same card without the personal count, so a pasted link
 * unfurls with the right picture (tools/share-cards.mjs renders those).
 * ===================================================================== */
var ABY = window.ABY = window.ABY || {};

ABY.Share = {
  SITE: 'https://devbiz.kudbee.workers.dev',
  PATH: '/games/kudbee-abyss/',
  W: 1200, H: 630,
  SLUGS: ABY.ENDING_IDS.concat(['progress']),                                  // the landing pages (one card each, /assets/og/abyss/<slug>.jpg)
  WORDS: ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN'],
  FONT: '"Space Grotesk", "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  WORLD: { dawn: ['city', 'rgba(255,196,90,0.20)'], song: ['city', 'rgba(57,230,255,0.16)'], echo: ['city', 'rgba(196,107,255,0.22)'], silence: ['city', 'rgba(120,128,150,0.45)'], crown: ['stairs', 'rgba(255,40,60,0.14)'], progress: ['city', 'rgba(120,70,255,0.12)'], game: ['corrupt', 'rgba(0,0,0,0)'],
    hollow: ['corrupt', 'rgba(130,40,220,0.26)'], eye: ['stairs', 'rgba(255,30,60,0.18)'], mirror: ['city', 'rgba(150,170,215,0.30)'], betrayal: ['corrupt', 'rgba(60,255,150,0.10)'], blackout: ['corrupt', 'rgba(0,0,0,0.72)'], daybreak: ['city', 'rgba(255,214,120,0.30)'], keeper: ['stairs', 'rgba(110,130,255,0.20)'], loop: ['corrupt', 'rgba(40,255,140,0.14)'] },
  url(slug) { return this.SITE + this.PATH + (slug ? 's/' + slug + '/' : 'index.html'); },

  // the card for a landing page / the game page: no personal numbers
  generic(slug) {
    const E = ABY.ENDINGS[slug], ids = ABY.ENDING_IDS, NW = this.WORDS[ids.length] || String(ids.length);
    if (E) return { world: slug, kicker: 'ONE OF ' + NW + ' ENDINGS', title: E.name, line1: E.tag, line2: 'FIND ALL ' + NW + ' ON A HAUNTED PHONE', found: ids.map(i => i === slug), label: 'WHICH ENDING WILL YOU FIND?', note: ['GALLERY \u00B7 now', 'New memory saved', E.name], time: '3:22', signal: E.mood === 'dark' || E.mood === 'throne' ? 'NO SERVICE' : 'ECHO 5G' };
    if (slug === 'progress') return { world: 'progress', kicker: 'A HORROR STORY ON A HAUNTED PHONE', title: 'FIND ALL ' + ids.length + ' ENDINGS', line1: 'TEXT THE QUEEN  \u00B7  SURVIVE THE DARK', line2: 'CAN YOU FREE THE GUARDIAN?', found: ids.map(() => false), label: ids.length + ' ENDINGS TO FIND', note: ['MESSAGES \u00B7 now', 'Unknown', 'You\u2019re awake. Do you hear it?'], time: '3:07', signal: 'ECHO' };
    return { world: 'game', kicker: 'A HORROR STORY ON A HAUNTED PHONE', title: 'THE GUARDIAN\u2019S GATE', line1: 'SURVIVE THE DARK  \u00B7  TRUST THE WRONG THING', line2: 'TEXT THE QUEEN  \u00B7  ' + ids.length + ' ENDINGS', found: ids.map(() => false), label: ids.length + ' ENDINGS TO FIND', note: ['MESSAGES \u00B7 now', 'Unknown', 'You\u2019re awake. Do you hear it?'], time: '3:07', signal: 'NO SERVICE' };
  },

  // ---- the card ----
  // info: { world, kicker, title, line1, line2, found: [5 bools], label, note: [head, title, text], time, signal }
  card(info) {
    const cv = document.createElement('canvas'); cv.width = this.W; cv.height = this.H;
    const c = cv.getContext('2d'), W = this.W, H = this.H, art = ABY.Art || {}, w = this.WORLD[info.world] || this.WORLD.progress;
    // the world behind her, covered to the card
    const cover = (img, x, y, bw, bh, fx, fy) => { const r = Math.max(bw / img.naturalWidth, bh / img.naturalHeight), dw = img.naturalWidth * r, dh = img.naturalHeight * r; c.drawImage(img, x - (dw - bw) * (fx == null ? 0.5 : fx), y - (dh - bh) * (fy == null ? 0.5 : fy), dw, dh); };
    c.fillStyle = '#05031a'; c.fillRect(0, 0, W, H);
    const bg = art[w[0]] || art.city; if (bg && bg.naturalWidth) cover(bg, 0, 0, W, H, 0.5, 0.35);
    c.fillStyle = w[1]; c.fillRect(0, 0, W, H);
    let g = c.createLinearGradient(0, 0, 820, 0); g.addColorStop(0, 'rgba(5,3,26,0.94)'); g.addColorStop(0.62, 'rgba(5,3,26,0.78)'); g.addColorStop(1, 'rgba(5,3,26,0.12)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    g = c.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.75); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.5)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    this._phone(c, info, art);
    this._text(c, info);
    return cv;
  },
  _rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); },
  _t(c, text, x, y, size, color, weight, align, maxW, spacing) {
    let s = size; c.font = (weight || 700) + ' ' + s + 'px ' + this.FONT; if ('letterSpacing' in c) c.letterSpacing = (spacing || 0) + 'px';
    while (maxW && c.measureText(text).width > maxW && s > size * 0.5) { s -= 2; c.font = (weight || 700) + ' ' + s + 'px ' + this.FONT; }
    c.fillStyle = color; c.textAlign = align || 'left'; c.textBaseline = 'alphabetic'; c.fillText(text, x, y); if ('letterSpacing' in c) c.letterSpacing = '0px'; return s;
  },
  // the phone: a bezel, the Queen on its lock screen, the status bar and a notification
  _phone(c, info, art) {
    const x = 846, y = 44, w = 282, h = 542, r = 44, sx = x + 11, sy = y + 11, sw = w - 22, sh = h - 22;
    c.save(); c.shadowColor = 'rgba(160,90,255,0.55)'; c.shadowBlur = 50; c.shadowOffsetY = 12; this._rr(c, x, y, w, h, r); c.fillStyle = '#0d0a1c'; c.fill(); c.restore();
    const bz = c.createLinearGradient(x, y, x + w, y + h); bz.addColorStop(0, '#3a3060'); bz.addColorStop(0.5, '#15102a'); bz.addColorStop(1, '#2a2348'); c.lineWidth = 3; c.strokeStyle = bz; this._rr(c, x, y, w, h, r); c.stroke();
    c.save(); this._rr(c, sx, sy, sw, sh, r - 11); c.clip();
    c.fillStyle = '#0a0420'; c.fillRect(sx, sy, sw, sh);
    const q = art.queen; if (q && q.naturalWidth) { const rr = sh / q.naturalHeight, dw = q.naturalWidth * rr, dh = sh; c.drawImage(q, sx - (dw - sw) * 0.46, sy, dw, dh); }
    let g = c.createLinearGradient(0, sy, 0, sy + sh); g.addColorStop(0, 'rgba(5,3,26,0.62)'); g.addColorStop(0.25, 'rgba(5,3,26,0)'); g.addColorStop(0.62, 'rgba(5,3,26,0)'); g.addColorStop(1, 'rgba(5,3,26,0.88)'); c.fillStyle = g; c.fillRect(sx, sy, sw, sh);
    c.fillStyle = '#000'; this._rr(c, x + w / 2 - 38, sy + 9, 76, 20, 10); c.fill();                       // the island
    this._t(c, info.time || '3:07', sx + 26, sy + 27, 17, '#fff', 700);
    this._t(c, info.signal || 'ECHO', sx + sw - 24, sy + 26, 12.5, '#fff', 700, 'right', 0, 0.5);
    this._t(c, info.time || '3:07', x + w / 2, sy + 98, 64, '#fff', 700, 'center');                           // the lock-screen clock
    // the notification (a message, or the memory just saved)
    const n = info.note || ['MESSAGES', 'Unknown', ''], ny = sy + sh - 138, nx = sx + 12, nw = sw - 24;
    c.fillStyle = 'rgba(24,18,52,0.78)'; this._rr(c, nx, ny, nw, 92, 20); c.fill(); c.lineWidth = 1.2; c.strokeStyle = 'rgba(255,255,255,0.16)'; c.stroke();
    const ic = c.createLinearGradient(nx, ny, nx + 44, ny + 44); const gal = /GALLERY/.test(n[0]); ic.addColorStop(0, gal ? '#ff8a5c' : '#34d27b'); ic.addColorStop(1, gal ? '#ff4fa3' : '#0e9f55');
    c.fillStyle = ic; this._rr(c, nx + 12, ny + 14, 40, 40, 11); c.fill(); this._t(c, gal ? '❉' : '✉', nx + 32, ny + 43, 22, '#fff', 700, 'center');
    this._t(c, n[0], nx + 62, ny + 29, 12, '#c9d6f0', 700, 'left', nw - 74, 0.4); this._t(c, n[1], nx + 62, ny + 52, 17, '#fff', 700, 'left', nw - 74);
    this._t(c, n[2] || '', nx + 62, ny + 76, 13.5, '#cdd8f0', 500, 'left', nw - 74);
    c.fillStyle = 'rgba(255,255,255,0.85)'; this._rr(c, x + w / 2 - 50, sy + sh - 14, 100, 5, 2.5); c.fill();
    c.restore();
  },
  _text(c, info) {
    const L = 64;
    this._t(c, 'KUDBEE · ABYSS', L, 88, 25, '#39e6ff', 700, 'left', 0, 6);
    this._t(c, info.kicker || '', L, 134, 21, '#ffd34d', 700, 'left', 700, 3);
    // the title: one line when it fits, else two
    const words = String(info.title).split(' '), probe = (t, size) => { c.font = '700 ' + size + 'px ' + this.FONT; return c.measureText(t).width; };
    let lines = [info.title], size = 96; while (probe(info.title, size) > 700 && size > 62) size -= 4;
    if (probe(info.title, size) > 700 && words.length > 1) { const h = Math.ceil(words.length / 2); lines = [words.slice(0, h).join(' '), words.slice(h).join(' ')]; size = 88; while (Math.max(probe(lines[0], size), probe(lines[1], size)) > 700 && size > 52) size -= 4; }
    let y = lines.length === 1 ? 252 : 236; lines.forEach((ln, i) => { const f = this._t(c, ln, L, y + i * (size * 1.02), size, '#ffffff', 700, 'left', 710, -1); });
    y = lines.length === 1 ? 322 : 236 + size * 1.02 + 64;
    c.save(); c.shadowColor = 'rgba(196,107,255,0.8)'; c.shadowBlur = 0; c.restore();
    if (info.line1) this._t(c, info.line1, L, y, 29, '#ffe9a8', 700, 'left', 740, 0.5);
    if (info.line2) this._t(c, info.line2, L, y + 42, 24, '#e6eeff', 600, 'left', 740, 0.5);
    // the endings, found ones lit
    const fa = info.found || [], gap = 9, pw = Math.floor((700 - gap * (fa.length - 1)) / Math.max(1, fa.length)), dy = 468; fa.forEach((f, i) => { const x = L + i * (pw + gap); this._rr(c, x, dy, pw, 13, 6.5); if (f) { const g = c.createLinearGradient(x, 0, x + pw, 0); g.addColorStop(0, '#39e6ff'); g.addColorStop(1, '#c46bff'); c.fillStyle = g; } else c.fillStyle = 'rgba(255,255,255,0.18)'; c.fill(); });
    this._t(c, info.label || '', L, dy + 46, 22, '#cfe0ff', 700, 'left', 740, 2);
    // where to play
    const t = 'PLAY FREE  ·  ' + this.SITE.replace(/^https:\/\//, '').toUpperCase(); c.font = '700 22px ' + this.FONT; const w = Math.min(740, c.measureText(t).width + 56), cy = 548;
    const g = c.createLinearGradient(L, 0, L + w, 0); g.addColorStop(0, 'rgba(57,230,255,0.9)'); g.addColorStop(1, 'rgba(196,107,255,0.92)'); c.fillStyle = g; this._rr(c, L, cy, w, 46, 23); c.fill();
    this._t(c, t, L + w / 2, cy + 31, 22, '#05031a', 700, 'center', w - 30, 1);
  },

  // ---- turning a moment into a share: { slug, url, text, info } ----
  // ending: the player's ending id; progress: how far she is
  moment(kind, id, found) {
    const ids = ABY.ENDING_IDS, n = ids.filter(i => found[i]).length, F = ids.map(i => !!found[i]);
    if (kind === 'ending' && ABY.ENDINGS[id]) {
      const E = ABY.ENDINGS[id], g = this.generic(id);
      return { slug: id, url: this.url(id), text: 'I found “' + E.name + '” in Kudbee Abyss, a horror story told through a haunted phone (' + n + ' of ' + ids.length + ' endings found). Can you find them all?',
        info: Object.assign(g, { kicker: n === ids.length ? 'ALL ' + (this.WORDS[ids.length] || ids.length) + ' ENDINGS FOUND' : 'NEW MEMORY SAVED', found: F, label: n + ' OF ' + ids.length + ' ENDINGS FOUND' }) };
    }
    const g = this.generic('progress');
    return { slug: 'progress', url: this.url('progress'), text: n ? 'I’ve found ' + n + ' of ' + ids.length + ' endings in Kudbee Abyss, a horror story told through a haunted phone. Can you find them all?' : 'Kudbee Abyss: a horror story told through a haunted phone. Text the Queen, survive the dark, find all ' + ids.length + ' endings.',
      info: Object.assign(g, { kicker: 'MY JOURNEY SO FAR', title: n + ' OF ' + ids.length + ' ENDINGS', line1: 'FOUND ON A HAUNTED PHONE', found: F, label: n ? n + ' OF ' + ids.length + ' FOUND  ·  CAN YOU BEAT THAT?' : ids.length + ' ENDINGS TO FIND' }) };
  },
  // the card as a PNG file for the share sheet (made as the Share screen opens, so the tap that shares it still counts as the user's gesture)
  file(cv) { return new Promise(res => { try { cv.toBlob(b => res(b ? new File([b], 'kudbee-abyss.png', { type: 'image/png' }) : null), 'image/png'); } catch (e) { res(null); } }); },
  canFiles(f) { try { return !!(f && navigator.canShare && navigator.share && navigator.canShare({ files: [f] })); } catch (e) { return false; } },
  intent(net, text, url) {
    const e = encodeURIComponent;
    if (net === 'x') return 'https://twitter.com/intent/tweet?text=' + e(text) + '&url=' + e(url);
    if (net === 'fb') return 'https://www.facebook.com/sharer/sharer.php?u=' + e(url);
    if (net === 'wa') return 'https://wa.me/?text=' + e(text + ' ' + url);
    return url;
  },
};
