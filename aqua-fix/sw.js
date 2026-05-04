const VERSION = "aqua-fix-v4";
const STATIC = ["./icon.svg", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png", "./manifest.webmanifest"];
// Caches we own outside the SW (Cache API populated by the app's lazy
// loaders). Activate-step must NOT delete these — otherwise every page
// activation wipes the lazy-loaded model bytes the app just stashed.
const DEPS_CACHE_PREFIXES = ["aqua-fix-models-"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(STATIC)).catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== VERSION)
          .filter((k) => !DEPS_CACHE_PREFIXES.some((p) => k.startsWith(p)))
          .map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

// Network-first for everything: never serve a stale index.html that points to a
// deleted JS bundle. Falls back to cache only when offline. Static assets above
// are pre-cached so the app still launches without a network.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && res.type === "basic") {
          const clone = res.clone();
          caches.open(VERSION).then((cache) => cache.put(req, clone)).catch(() => undefined);
        }
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || Response.error()))
  );
});
