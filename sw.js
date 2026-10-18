// Only versioned application assets are cached. Receipts/tokens never enter Cache Storage.
import { CACHE_NAME, SHELL_ASSETS } from './asset-manifest.js';
import { drainUploads } from './js/pipeline.js';

const scope = self.registration.scope;
const indexUrl = new URL('index.html', scope).href;
const assets = new Set(SHELL_ASSETS.map((path) => new URL(path, scope).href));
self.addEventListener('install', (event) => {
  // Do not take over an old app while a receipt/form is open. UI explicitly activates updates.
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll([...assets].map((url) => new Request(url, { cache: 'reload' })))));
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith('belegwerk-shell-') && name !== CACHE_NAME) await caches.delete(name);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(scope)) return;
  const canonical = new URL(url); canonical.search = ''; canonical.hash = '';
  if (event.request.mode === 'navigate' && (canonical.href === scope || canonical.href === indexUrl || !canonical.pathname.split('/').pop().includes('.'))) {
    event.respondWith(caches.open(CACHE_NAME).then(async (cache) => (await cache.match(indexUrl)) || fetch(event.request)));
    return;
  }
  if (assets.has(canonical.href)) event.respondWith(caches.open(CACHE_NAME).then(async (cache) => (await cache.match(canonical.href)) || fetch(event.request)));
});
async function uploadAndNotify(retry) {
  const result = await drainUploads();
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) client.postMessage({ type: 'DOCUMENTS_CHANGED' });
  if (retry && (result.pending || result.busy)) throw new Error('Upload queue has pending retries');
}
self.addEventListener('sync', (event) => { if (event.tag === 'belegwerk-uploads') event.waitUntil(uploadAndNotify(true)); });
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
  if (event.data?.type === 'UPLOADS_CHANGED') event.waitUntil(uploadAndNotify(false).catch(() => {}));
});
