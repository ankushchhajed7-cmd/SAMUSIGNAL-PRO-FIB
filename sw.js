/* SamuSignal Pro FIB — service worker. App shell cache; data (Firebase / TwelveData) kabhi cache nahi. */
const VERSION = '0.2.0';
const CACHE = 'ssfib-' + VERSION;
const SHELL = ['./', 'index.html', 'manifest.json', 'src/app.js', 'src/engine.js', 'src/data.js', 'src/symbols.js', 'src/bridge.js', 'src/records.js', 'src/mtf.js',
  'icon-192.png', 'icon-512.png', 'favicon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())) });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x)))).then(() => self.clients.claim())) });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if(u.origin !== location.origin || e.request.method !== 'GET') return;          /* Firebase / TwelveData = seedha network */
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r }).catch(() => caches.match(e.request)));
});
