// Offline support. Network first, so updated rules show up as soon as you're
// online; the cached copy is the fallback at a venue with no signal.
// Bump CACHE when the file list changes.
const CACHE = 'scenario-selector-v1';
const CORE = [
  './',
  'index.html',
  'css/styles.css',
  'js/app.js',
  'js/state.js',
  'js/text.js',
  'js/diagram.js',
  'data/systems.json',
  'data/bolt-action.json',
  'data/konflikt-47.json',
  'manifest.webmanifest',
  'assets/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // 'no-cache' revalidates with the server (a cheap 304 when nothing changed),
  // so an edited rules file is never hidden behind the browser's HTTP cache.
  const network = req.mode === 'navigate'
    ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
    : fetch(req, { cache: 'no-cache' });

  event.respondWith(
    network
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(req, { ignoreSearch: true });
        if (cached) return cached;
        if (req.mode === 'navigate') return caches.match('./');
        return Response.error();
      }),
  );
});
