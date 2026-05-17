const CACHE_NAME = 'bussradar-v38';
const APP_SHELL = [
  './',
  './index.php',
  './login.php',
  './assets/css/styles.css',
  './assets/js/app.js',
  './assets/js/auth.js',
  './assets/icon.svg',
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

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.pathname.endsWith('/api.php')) {
    event.respondWith(
      fetch(event.request).catch(() => new Response(
        JSON.stringify({ ok: false, error: 'Võrguühendus puudub.' }),
        { status: 503, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      ))
    );
    return;
  }

  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200) return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      });
    })
  );
});
