/* Tank IQ service worker.
   - App page: network first (so every update you upload shows straight away), cached copy when offline.
   - Library files (Tailwind, Font Awesome, Chart.js, SheetJS, Google Fonts): cached after first load.
   - Google Sheets sync and anything else: never touched, always goes straight to the network.
   - Update checks from the app (?_chk=...) always go straight to the network, so the app can compare versions. */
const CACHE = 'tankiq-v1';
const SHELL = ['./', 'manifest.json', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];
const LIB_HOSTS = [
  'cdn.tailwindcss.com',
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function keep(req, res) {
  if (res && (res.ok || res.type === 'opaque')) {
    const copy = res.clone();
    caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
  }
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // The app's own "is there an update?" probe: never answered from cache
  if (url.searchParams.has('_chk')) return;

  // The app page itself
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req.url, { cache: 'no-store' })   // skip the browser's HTTP cache so a new upload is seen at once
        .then(res => keep(new Request('./'), res))
        .catch(() => caches.match('./', { ignoreSearch: true }).then(r => r || caches.match('index.html', { ignoreSearch: true })))
    );
    return;
  }

  // Our own small files (icons, manifest)
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then(hit => {
        const net = fetch(req).then(res => keep(req, res)).catch(() => hit);
        return hit || net;
      })
    );
    return;
  }

  // Libraries and fonts: serve the saved copy, refresh it in the background
  if (LIB_HOSTS.includes(url.hostname)) {
    e.respondWith(
      caches.match(req).then(hit => {
        const net = fetch(req).then(res => keep(req, res)).catch(() => hit);
        return hit || net;
      })
    );
  }
  // everything else (Google Sheets sync etc.) is not intercepted
});
