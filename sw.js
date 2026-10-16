/* Guarda la app para que abra sin señal.
   Al publicar una versión nueva hay que subir CACHE y APP_VERSION en js/ui.js. */
const CACHE = 'panprod-V.2026.5';
const ASSETS = ['./', './index.html', './manifest.webmanifest',
  './css/app.css', './js/vendor/jszip.min.js', './js/datos.js', './js/calculo.js',
  './js/excel.js', './js/lector.js', './js/ui.js',
  './icon-192.png', './icon-512.png', './icon-maskable.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
/* Red primero para traer siempre lo último; si no hay señal, responde del caché. */
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copia = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copia)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match('./index.html')))
  );
});
