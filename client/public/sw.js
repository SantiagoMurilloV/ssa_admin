// Service worker del panel. Sube CACHE_VERSION para invalidar todo lo viejo.
const CACHE_VERSION = 'ssa-admin-v1';
const SHELL = ['/', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      // addAll falla entero si un recurso falla; el shell no vale un install roto
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // NUNCA cachear el API. Son datos de sesión: un pedido, un stock o una
  // respuesta de /auth/me servidos de cache le mostrarían al admin un estado
  // que ya no existe, o dejarían ver datos después de cerrar sesión.
  if (url.pathname.startsWith('/api/')) return;

  // Solo GET del mismo origen; POST/PATCH/DELETE van siempre a la red
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Los bundles de Vite llevan hash en el nombre: si están en cache, son válidos
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
            }
            return response;
          })
      )
    );
    return;
  }

  // Navegación: red primero (el panel no sirve de nada sin API), y si no hay
  // conexión al menos carga el shell en vez de la pantalla de error del browser
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put('/', copy));
          }
          return response;
        })
        .catch(() => caches.match('/').then((hit) => hit ?? Response.error()))
    );
  }
});
