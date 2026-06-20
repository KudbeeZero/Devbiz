/* Kudbee Grow Companion — minimal Service Worker.
 *
 * Scope: opt-in *local* notifications only. It lets the page show OS-level
 * notifications via showNotification(), focuses the tab when one is clicked,
 * and registers a best-effort periodicSync where the browser supports it.
 *
 * NOTE: true always-on background push (delivering while the site is closed)
 * needs Web Push + VAPID keys + a push backend — that is a separate,
 * owner-approved infra step. This SW intentionally ships none of that.
 */
const VERSION = 'kudbee-grow-v1';

self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });

// Allow the page to push a local notification through the SW (more reliable
// than page-context Notification on some platforms).
self.addEventListener('message', (e) => {
    const d = e.data || {};
    if (d.type === 'notify') {
        self.registration.showNotification(d.title || 'Kudbee Grow', {
            body: d.body || '', tag: d.tag || 'grow', renotify: false
        });
    }
});

// Best-effort: if the browser grants Periodic Background Sync, surface a nudge
// to re-open the companion. No network, no backend — purely a local reminder.
self.addEventListener('periodicsync', (e) => {
    if (e.tag === 'grow-checkin') {
        e.waitUntil(self.registration.showNotification('Kudbee Grow', {
            body: 'Your plant has news — come check in on your grow. 🌱', tag: 'grow-checkin'
        }));
    }
});

self.addEventListener('notificationclick', (e) => {
    e.notification.close();
    e.waitUntil((async () => {
        const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const c of all) { if (c.url.includes('/lab/grow') && 'focus' in c) return c.focus(); }
        if (clients.openWindow) return clients.openWindow('./index.html');
    })());
});
