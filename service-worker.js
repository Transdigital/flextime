// Flextide service worker
// Strategy: network-first for app HTML (so you always get the latest deploy),
// cache-first for fonts and static assets.
//
// Bump CACHE_VERSION when the app changes structurally to force old caches
// to be cleared on the next visit. (Network-first means you don't strictly
// have to bump it for every change, but doing so keeps things tidy.)

const CACHE_VERSION = 'flextide-v1';
const APP_SHELL = ['./', './index.html', './manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
      .catch(() => {}) // first install on file:// or restricted contexts may fail; that's ok
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Clean up old cache versions
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET requests
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Don't intercept calls to the GitHub API (sync) — always hit network
  if (url.hostname === 'api.github.com' || url.hostname === 'gist.githubusercontent.com') {
    return;
  }

  // Don't intercept Google Fonts CSS — let the browser handle (small, cached by browser)
  if (url.hostname === 'fonts.googleapis.com') {
    return;
  }

  // Network-first for HTML / navigations / the app shell
  const isNavigation = req.mode === 'navigate' || (req.destination === 'document');
  const isAppShell = url.pathname.endsWith('/') || url.pathname.endsWith('.html') || url.pathname.endsWith('manifest.json');

  if (isNavigation || isAppShell) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Cache successful responses for offline use
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('./')))
    );
    return;
  }

  // Cache-first for everything else (fonts, images, etc.)
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
        }
        return res;
      });
    })
  );
});

// Optional: listen for skipWaiting messages from the page so an "update available"
// banner could trigger an immediate refresh. Not used yet but ready.
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
