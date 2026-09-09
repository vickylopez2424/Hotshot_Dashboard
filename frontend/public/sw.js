/* Hotshot service worker.
 * - App shell: network first, fall back to cache, so updates land on the next open.
 * - Map tiles: cache first, capped, so the last areas viewed still draw with no signal.
 * - API: network only, with a cached copy of the last incidents/alerts as a fallback.
 */
const VERSION = 'hotshot-v1';
const SHELL = `${VERSION}-shell`;
const TILES = `${VERSION}-tiles`;
const API = `${VERSION}-api`;
const TILE_LIMIT = 1500;
const TILE_HOSTS = ['server.arcgisonline.com', 'basemap.nationalmap.gov', 'tile.openstreetmap.org'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/', '/manifest.webmanifest', '/icons/icon-192.png'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

async function trimCache(name, limit) {
  const c = await caches.open(name);
  const keys = await c.keys();
  if (keys.length > limit) await Promise.all(keys.slice(0, keys.length - limit).map((k) => c.delete(k)));
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  if (TILE_HOSTS.some((h) => url.hostname.endsWith(h))) {
    e.respondWith(caches.open(TILES).then(async (c) => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      try {
        const res = await fetch(e.request);
        if (res.ok) { c.put(e.request, res.clone()); trimCache(TILES, TILE_LIMIT); }
        return res;
      } catch { return hit || Response.error(); }
    }));
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    const cacheable = /^\/api\/(wildcad\/incidents\/map|nws\/alerts\/map)/.test(url.pathname);
    e.respondWith(fetch(e.request).then((res) => {
      if (cacheable && res.ok) caches.open(API).then((c) => c.put(e.request, res.clone()));
      return res;
    }).catch(async () => (await caches.match(e.request)) || new Response(JSON.stringify({ offline: true, features: [] }), { headers: { 'content-type': 'application/json' } })));
    return;
  }

  if (url.origin === self.location.origin) {
    e.respondWith(fetch(e.request).then((res) => {
      if (res.ok) caches.open(SHELL).then((c) => c.put(e.request, res.clone()));
      return res;
    }).catch(async () => (await caches.match(e.request)) || (await caches.match('/'))));
  }
});
