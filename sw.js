/* ================================================
   ALife — Service Worker (funciona offline)
   Estratégia:
   - Ao instalar: guarda o app inteiro no cache
   - Abrir o app: tenta a versão mais recente da rede; usa o cache apenas sem internet
   - Sem internet: tudo continua funcionando; seus dados ficam no localStorage
   ================================================ */
const CACHE_VERSION = 'v43';
const CACHE_NAME = `aerosync-${CACHE_VERSION}`;
const APP_SHELL = [
  './aerosync.html',
  './manifest.json',
  './version.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
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
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('aerosync-') && k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request, cacheKey = request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response && response.ok && response.type === 'basic') {
      await cache.put(cacheKey, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(cacheKey);
    if (cached) return cached;
    throw error;
  }
}

async function fetchAndCache(request) {
  const response = await fetch(request);
  if (response && response.ok && response.type === 'basic') {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith('/version.json')) {
    event.respondWith(networkFirst(req));
    return;
  }

  const shell = new URL('./aerosync.html', self.registration.scope).href;
  const isApp = url.pathname === new URL(shell).pathname || url.href.split('?')[0] === self.registration.scope;
  if (req.mode === 'navigate' && isApp) {
    event.respondWith(networkFirst(req, shell));
    return;
  }

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => {
      const network = fetchAndCache(req).catch(() => cached);
      return cached || network;
    })
  );
});