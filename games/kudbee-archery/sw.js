/* =====================================================================
 * Kudbee Archery — sw.js (the offline copy)
 * Keeps the whole game (page, code, fonts, pictures) in a cache so it opens and
 * plays with no signal, from the home screen or the browser. Online it is
 * network-first for the page and code, so a deploy shows on the next load; the
 * pictures and font come from the cache first (they are long-lived files).
 * Only GETs inside the game's own folder are touched. Bump V to drop old copies
 * (and whenever assets/sfx.mp3 is rebuilt: kept files are matched without their ?v=).
 * ===================================================================== */

const V = 'kar-v5';
const SHELL = ['./', 'manifest.webmanifest',
  'src/util.js', 'src/sfx.js', 'src/audio.js', 'src/sim.js', 'src/ghost.js', 'src/ach.js', 'src/quest.js', 'src/agent.js', 'src/render.js', 'src/ui.js', 'src/share.js', 'src/cloud.js', 'src/game.js',
  'assets/fonts/lilita-one.woff2', 'assets/sfx.mp3', 'assets/bg-menu.jpg', 'assets/bg-range-1.jpg', 'assets/bg-range-2.jpg',
  'assets/icon-192.png', 'assets/icon-512.png', 'assets/icon-maskable-512.png', 'assets/apple-touch-icon.png'];
// (the store screenshots, share cards and landing pages are left to the network)

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('kar-') && k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// a page served from the cache must not be a redirect (the host sends index.html on to ./)
const clean = r => (r && r.redirected ? r.blob().then(b => new Response(b, { status: 200, headers: r.headers })) : r);
const scope = () => new URL(self.registration.scope);

self.addEventListener('fetch', e => {
  const q = e.request, u = new URL(q.url);
  if (q.method !== 'GET' || u.origin !== location.origin || !u.pathname.startsWith(scope().pathname)) return;
  const page = q.mode === 'navigate', code = page || /\.(js|html|webmanifest)$/.test(u.pathname) || u.pathname.endsWith('/');
  const game = u.pathname === scope().pathname || u.pathname === scope().pathname + 'index.html', key = game ? './' : q;   // the game page, either spelling
  if (code) {
    // network first: the newest game when online, the kept copy when not (any other page in the folder falls back to the game)
    e.respondWith(fetch(q).then(r => {
      if (r.ok && r.type === 'basic') { const c = r.clone(); caches.open(V).then(k => k.put(key, c)); }
      return r;
    }).catch(() => caches.match(key, { ignoreSearch: true }).then(r => r || (page ? caches.match('./') : r)).then(clean)));
    return;
  }
  // pictures + the font: the kept copy first, else fetch it and keep it
  e.respondWith(caches.match(q, { ignoreSearch: true }).then(hit => hit || fetch(q).then(r => {
    if (r.ok && r.type === 'basic') { const c = r.clone(); caches.open(V).then(k => k.put(q, c)); }
    return r;
  })));
});
