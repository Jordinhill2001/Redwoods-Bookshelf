const CACHE_NAME = 'redwoods-bookshelf-v1';
const OFFLINE_URLS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(OFFLINE_URLS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // network-first for dynamic (try network, else cache)
  const request = event.request;
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});
