/* Talaan service worker: keeps the app working offline.
   Bump VERSION whenever you replace index.html so phones pick up the new files. */
const VERSION = 'talaan-v22';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './jsQR.min.js',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'
];

const OFFLINE_PAGE = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>Talaan</title><body style="font-family:sans-serif;padding:32px;line-height:1.5">' +
  '<h2>Talaan is not saved on this phone yet</h2><p>Open the app once while you have internet, wait a few seconds, then close and open it again. After that it works offline.</p>';

self.addEventListener('install', (e) => {
  // add files one by one so a single missing icon does not stop the whole install
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => Promise.allSettled(SHELL.map((url) => c.add(new Request(url, { cache: 'reload' })))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.match('./index.html'))
      .then((ok) =>
        // keep the old copy if the new one is incomplete, so the app never ends up with nothing saved
        ok ? caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))) : null
      )
      .then(() => self.clients.claim())
  );
});

function save(req, res) {
  if (res && (res.ok || res.type === 'opaque')) {
    const copy = res.clone();
    caches.open(VERSION).then((c) => {
      c.put(req, copy.clone());
      // an online visit to the app page also refreshes the saved start page
      if (req.mode === 'navigate') c.put('./index.html', copy.clone());
    });
  }
  return res;
}

// look in this version first, then in any older saved copy
function lookup(req, opts) {
  return caches.match(req, opts);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    // Own files: network first so updates show up, saved copy when offline.
    e.respondWith(
      fetch(req)
        .then((res) => save(req, res))
        .catch(async () => {
          const m = await lookup(req, { ignoreSearch: true });
          if (m) return m;
          if (req.mode === 'navigate') {
            const p = (await lookup('./index.html')) || (await lookup('./'));
            return p || new Response(OFFLINE_PAGE, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
          }
          return Response.error();
        })
    );
  } else {
    // Fonts and the QR library: saved on first load, then served from the saved copy.
    e.respondWith(lookup(req).then((m) => m || fetch(req).then((res) => save(req, res))));
  }
});
