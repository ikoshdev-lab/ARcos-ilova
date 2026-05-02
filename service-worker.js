const CACHE_NAME = 'arcos-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  'https://cdn.socket.io/4.8.1/socket.io.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/simple-peer/9.11.1/simplepeer.min.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((res) => res || fetch(e.request))
  );
});
