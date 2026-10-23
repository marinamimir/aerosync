/* ================================================
   AeroSync — Service Worker (funciona offline)
   Estratégia:
   - Ao instalar: guarda o app inteiro no cache (o HTML já tem CSS, fontes e ícones embutidos)
   - Abrir o app: mostra a versão do cache na hora e busca uma nova em segundo plano
     ("stale-while-revalidate") — a atualização aparece na próxima vez que abrir
   - Sem internet: tudo continua funcionando; seus dados ficam no localStorage
   Lançou uma versão nova do aerosync.html? Troque o número em CACHE_VERSION.
   ================================================ */
const CACHE_VERSION = 'v7';
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

// Busca na rede e atualiza o cache (só respostas válidas do próprio site)
function fetchAndCache(request, cacheKey = request) {
  return fetch(request).then((response) => {
    if (response && response.ok && response.type === 'basic') {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(cacheKey, copy));
    }
    return response;
  });
}

// 3. Pedidos: cache primeiro, rede em segundo plano
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // não mexe em nada de outros sites (ex.: links úteis)

  // Abrir o app (aerosync.html ou a raiz da pasta): sempre responde com o aerosync.html do cache
  const shell = new URL('./aerosync.html', self.registration.scope).href;
  const isApp = url.pathname === new URL(shell).pathname || url.href.split('?')[0] === self.registration.scope;
  if (req.mode === 'navigate' && isApp) {
    event.respondWith(
      caches.match(shell).then((cached) => {
        const network = fetchAndCache(req, shell).catch(() => cached);
        return cached || network;
      })
    );
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
