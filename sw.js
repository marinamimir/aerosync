/* ================================================
   AeroSync — Service Worker (funciona offline)
   Estratégia:
   - Ao instalar: guarda o app inteiro no cache (o HTML já tem CSS, fontes e ícones embutidos)
   - Abrir o app: tenta a versão mais recente da rede; usa o cache apenas sem internet
   - Sem internet: tudo continua funcionando; seus dados ficam no localStorage
   Lançou uma versão nova do aerosync.html? Troque o número em CACHE_VERSION.
   ================================================ */
const CACHE_VERSION = 'v21';
const CACHE_NAME = `aerosync-${CACHE_VERSION}`;
const APP_SHELL = [
  './aerosync.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

// 1. Instalação: baixa e guarda o app
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()) // a versão nova assume sem esperar fechar as abas
  );
});

// 2. Ativação: apaga caches de versões antigas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('aerosync-') && k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Documento principal: rede primeiro; cache somente como fallback offline.
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

// Atualiza e armazena recursos auxiliares sem interromper o app se a rede falhar.
async function fetchAndCache(request) {
  const response = await fetch(request);
  if (response && response.ok && response.type === 'basic') {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

// 3. Pedidos: navegação do app em rede primeiro; arquivos auxiliares em cache primeiro
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // não mexe em nada de outros sites (ex.: links úteis)

  // App: sempre tenta obter o HTML publicado mais recente; cache apenas offline.
  const shell = new URL('./aerosync.html', self.registration.scope).href;
  const isApp = url.pathname === new URL(shell).pathname || url.href.split('?')[0] === self.registration.scope;
  if (req.mode === 'navigate' && isApp) {
    event.respondWith(networkFirst(req, shell));
    return;
  }

  // Demais arquivos (manifest, ícones): cache, com atualização em segundo plano
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => {
      const network = fetchAndCache(req).catch(() => cached);
      return cached || network;
    })
  );
});