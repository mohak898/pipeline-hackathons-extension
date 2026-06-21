/**
 * Service Worker — network-first for pages, cache-first for assets.
 * Bump CACHE_NAME on every deploy to bust stale caches.
 */

const CACHE_NAME = 'hpt-dashboard-v2';
const STATIC_ASSETS = ['/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Network-first for Firestore API
  if (url.hostname === 'firestore.googleapis.com') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request)),
    );
    return;
  }

  // Network-first for HTML pages (navigation requests)
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request)),
    );
    return;
  }

  // Cache-first for static assets (images, manifests, etc.)
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request)),
  );
});
