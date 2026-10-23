/* =====================================================================
 * Kudbee Abyss — sw.js (the offline copy)
 * Keeps the whole game (page, code, pictures, the two fonts, the 3D library) so it opens and plays with no signal, from
 * the home screen or the browser. Online it is network-first for the page and code, so a deploy shows on the next load;
 * pictures, fonts and the pinned three.js come from the cache first (long-lived files). Only GETs for the game's own
 * folder, the site's two fonts and that one CDN file are touched. Bump V to drop old copies (and after re-running
 * tools/app-assets.mjs: kept pictures are matched without their ?v=).
 * ===================================================================== */

const V = 'aby-v1';
const THREE = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
const FONTS = ['../../assets/fonts/inter-variable-latin.woff2', '../../assets/fonts/space-grotesk-variable-latin.woff2'];
const SHELL = ['./', 'manifest.webmanifest',
  'src/story.js', 'src/fx.js', 'src/scene.js', 'src/song.js', 'src/share.js', 'src/phone.js', 'src/game.js',
  'assets/character/queen.png', 'assets/character/queen-640.webp', 'assets/character/queen-960.webp',
  'assets/world/abyss-city.webp', 'assets/world/abyss-city-corrupt.webp', 'assets/world/abyss-eye.webp', 'assets/world/abyss-stairs.webp',
  'assets/app/icon-192.png', 'assets/app/icon-512.png', 'assets/app/apple-touch-icon.png'].concat(FONTS);
// (the store screenshots, share cards and landing pages are left to the network)

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL).then(() => c.add(new Request(THREE, { mode: 'cors' })).catch(() => {}))).then(() => self.skipWaiting()));   // (no CDN: the game still plays in 2D)
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('aby-') && k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// a page served from the cache must not be a redirect (the host sends index.html on to ./)
const clean = r => (r && r.redirected ? r.blob().then(b => new Response(b, { status: 200, headers: r.headers })) : r);
const scope = () => new URL(self.registration.scope);
const kept = (q, r) => { if (r.ok && (r.type === 'basic' || r.type === 'cors')) { const c = r.clone(); caches.open(V).then(k => k.put(q, c)); } return r; };

self.addEventListener('fetch', e => {
  const q = e.request, u = new URL(q.url);
  if (q.method !== 'GET') return;
  const mine = u.origin === location.origin && u.pathname.startsWith(scope().pathname), font = u.origin === location.origin && FONTS.some(f => new URL(f, scope()).pathname === u.pathname);
  if (!mine && !font && u.href !== THREE) return;
  const page = q.mode === 'navigate', code = mine && (page || /\.(js|html|webmanifest)$/.test(u.pathname) || u.pathname.endsWith('/'));
  const game = u.pathname === scope().pathname || u.pathname === scope().pathname + 'index.html', key = game ? './' : q;   // the game page, either spelling
  if (code) {
    // network first: the newest game when online, the kept copy when not (any other page in the folder falls back to the game)
    e.respondWith(fetch(q).then(r => kept(key, r)).catch(() => caches.match(key, { ignoreSearch: true }).then(r => r || (page ? caches.match('./') : r)).then(clean)));
    return;
  }
  // pictures, the fonts and the 3D library: the kept copy first, else fetch it and keep it
  e.respondWith(caches.match(q, { ignoreSearch: true }).then(hit => hit || fetch(q).then(r => kept(q, r))));
});
