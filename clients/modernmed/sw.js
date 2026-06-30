/* ModernMed — minimal offline shell (concept). Cache-first for the app shell, network for the rest. */
var C = 'modernmed-v1';
var ASSETS = ['./', 'index.html', 'local-seo-kit.html', 'blog/', 'blog/index.html', 'manifest.webmanifest', 'icon-192.png'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(C).then(function (c) { return c.addAll(ASSETS).catch(function () {}); }));
  self.skipWaiting();
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== C; }).map(function (k) { return caches.delete(k); }));
  }));
  self.clients.claim();
});
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(function (r) {
      return r || fetch(e.request).then(function (resp) {
        var cp = resp.clone();
        caches.open(C).then(function (c) { c.put(e.request, cp).catch(function () {}); });
        return resp;
      }).catch(function () { return caches.match('index.html'); });
    })
  );
});
