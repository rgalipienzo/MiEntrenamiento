// Guarda la app para que funcione sin conexión.
// Cambia la versión cuando actualices archivos para que los móviles reciban la nueva.
importScripts('ejercicios.js');
const CACHE = 'mientreno-v9';
const FILES = ['./', 'index.html', 'styles.css', 'app.js', 'manifest.json', 'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png', 'ejercicios.js',
  ...EJERCICIOS.map((e) => `img/ejercicios/${e.id}.png`)];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

// Primero intenta la red (para tener siempre lo último); si no hay conexión, usa lo guardado.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    // «no-cache»: pregunta siempre al servidor si hay versión nueva.
    fetch(e.request, { cache: 'no-cache' })
      .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html')))
  );
});
