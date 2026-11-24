// Bump this version whenever the installed application changes.
const VERSION = 'private-sync-v1';
const PREFIX = 'sunflower-diary-' + new URL(self.registration.scope).pathname + ':';
const CACHE = PREFIX + VERSION;
const root = new URL('./', self.location.href);
// Use the host's canonical root directly so offline navigations never replay a redirect.
const shell = root.href;
const htmlPath = new URL('index.html', root).pathname;
const paths = [
  './', 'styles.css', 'app.js', 'storage.js', 'sync.js', 'merge.js', 'mascots.js', 'offline.js',
  'manifest.webmanifest', 'assets/apple-touch-icon.png', 'assets/icon-192.png', 'assets/icon-512.png',
  ...['dinosaur', 'ladybug', 'butterfly', 'cow', 'bee', 'bunny'].map(id => 'assets/' + id + '.webp')
];
const urls = new Set(paths.map(path => new URL(path, root).href));

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    for (const url of urls) {
      const response = await fetch(url, { cache: 'reload', credentials: 'same-origin' });
      if (!response.ok) throw new Error('Could not cache ' + new URL(url).pathname);
      // A private host may redirect a signed-out request to a login page with status 200.
      if (url === shell) {
        if (!(await response.clone().text()).includes('name="application-name" content="小猪向阳日记"')) throw new Error('Diary shell unavailable');
      } else if ((response.headers.get('Content-Type') || '').includes('text/html')) {
        throw new Error('Expected an application asset');
      }
      await cache.put(url, response);
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith(PREFIX) && name !== CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type !== 'check-diary-cache' || !event.ports[0]) return;
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const stored = new Set((await cache.keys()).map(request => request.url));
    event.ports[0].postMessage({ ready: [...urls].every(url => stored.has(url)) });
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== root.origin) return;
  const entry = request.mode === 'navigate' && (url.pathname === root.pathname || url.pathname === htmlPath);
  const key = entry ? shell : url.href;
  if (!urls.has(key)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    return (await cache.match(key)) || fetch(request);
  })());
});
