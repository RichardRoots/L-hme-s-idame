const CACHE_NAME = 'bussradar-v192';
const APP_SHELL = [
  './',
  './index.html',
  './reset.html',
  './login.html',
  './api.html',
  './assets/css/styles.css?v=192',
  './assets/js/static-api.js?v=192',
  './assets/js/app.js?v=192',
  './assets/js/auth.js?v=192',
  './assets/icon.svg',
  './assets/favicon-32.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/maskable-icon-512.png',
  './assets/apple-touch-icon.png',
  './data/schools.json',
  './data/fleet.json',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.cache === 'no-store' || url.origin !== self.location.origin) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (event.request.method !== 'GET') {
    return;
  }

  const isFreshAsset = url.origin === self.location.origin
    && /\.(?:js|css)$/i.test(url.pathname);

  if (isFreshAsset) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  const isPageRequest = event.request.mode === 'navigate'
    || event.request.destination === 'document'
    || url.pathname === `${new URL(self.registration.scope).pathname}index.html`
    || url.pathname.endsWith('.html');

  if (isPageRequest) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (!response || response.status !== 200) return response;
      const clone = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
      return response;
    }))
  );
});
