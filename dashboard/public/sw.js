/**
 * PWA service worker — makes the dashboard installable and keeps the shell
 * available offline. API calls are never cached (data must be live).
 * Bump CACHE_NAME on deploys that change static assets.
 */
const CACHE_NAME = 'hpt-dashboard-v3';
const STATIC_ASSETS = ['/manifest.json', '/icon-192.png', '/icon-512.png', '/icons/icon-48.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((res) => { const copy = res.clone(); caches.open(CACHE_NAME).then((c) => c.put(event.request, copy)); return res; })
        .catch(() => caches.match(event.request)),
    );
    return;
  }
  if (url.pathname.startsWith('/_next/static/') || STATIC_ASSETS.includes(url.pathname) || url.pathname.startsWith('/platforms/')) {
    event.respondWith(caches.match(event.request).then((hit) => hit || fetch(event.request).then((res) => {
      const copy = res.clone(); caches.open(CACHE_NAME).then((c) => c.put(event.request, copy)); return res;
    })));
  }
});
