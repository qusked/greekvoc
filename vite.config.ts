import { createHash } from 'node:crypto'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/** Emits sw.js with a precache list of every built file, so the app works offline. */
function serviceWorker(): Plugin {
  return {
    name: 'greek-learner-sw',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map') && f !== 'index.html')
      const precache = ['./', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', ...files]
      // A new version on every build, so changes to index.html, the manifest or icons also reach installed apps.
      const version = createHash('sha1')
        .update(precache.join('|'))
        .update(process.env.GITHUB_SHA ?? String(Date.now()))
        .digest('hex')
        .slice(0, 10)
      const source = `const CACHE = 'greek-learner-${version}';
const PRECACHE = ${JSON.stringify(precache)};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('greek-learner-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req.mode === 'navigate' ? './' : req, { ignoreSearch: true, ignoreVary: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
  );
});
`
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), serviceWorker()],
  build: { chunkSizeWarningLimit: 4000 },
})
