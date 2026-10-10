/* Service Worker · Bachoco Mantenimiento
   Estrategia:
   - HTML/navegación: red primero, caché como respaldo (para tener siempre la última versión si hay internet)
   - Resto (CSS, JS, CDN, íconos): caché primero, red como respaldo (rápido y funciona offline)
*/

const CACHE = 'bachoco-mtto-v1';

const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg'
];

const CDN_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Locales: obligatorios
    await cache.addAll(PRECACHE).catch(err => console.warn('[SW] Precache local falló:', err));
    // CDN: tolerante a fallos (si no hay internet en la instalación, no rompe)
    await Promise.allSettled(
      CDN_ASSETS.map(url => cache.add(new Request(url, { mode: 'cors' })))
    );
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Ignorar esquemas que no sean http(s)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Navegación (abrir la app) → red primero, fallback a index.html cacheado
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch {
        const cache = await caches.open(CACHE);
        return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Resto: caché primero, red como respaldo y guardado
  event.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) return cached;

    try {
      const fresh = await fetch(req);
      if (fresh && fresh.status === 200 && (fresh.type === 'basic' || fresh.type === 'cors')) {
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch (err) {
      // Sin internet y sin caché
      return new Response('Recurso no disponible offline.', {
        status: 503,
        statusText: 'Offline',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  })());
});
