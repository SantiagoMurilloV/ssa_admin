// Service worker del panel. Sube CACHE_VERSION para invalidar todo lo viejo.
const CACHE_VERSION = 'ssa-admin-v2';
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

// ── Notificaciones de pedidos y encargos ──
// El servidor manda {title, body, url}. Sin este handler la suscripción existe
// pero no aparece nada: el push llega y se descarta.
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : '' };
  }
  const url = payload.url ?? '/';
  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'SSA Import', {
      body: payload.body ?? '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url },
      // Un tag por destino: varios pedidos seguidos se agrupan en vez de
      // apilar una notificación por cada uno.
      tag: url,
      renotify: true
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url ?? '/';
  // Si el panel ya está abierto se reutiliza esa pestaña en vez de abrir otra
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (new URL(client.url).origin === self.location.origin) {
          return client.focus().then((focused) => focused.navigate(target));
        }
      }
      return self.clients.openWindow(target);
    })
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
