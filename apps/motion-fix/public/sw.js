const VERSION = "motion-fix-v1";
const STATIC = ["./icon.svg", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png", "./manifest.webmanifest"];
// Caches the app's lazy loader populates outside the SW. Activate-step
// must skip these — otherwise the OpenCV bytes our cachedFetch stashed
// in motion-fix-deps-v1 get wiped on every page load and the user has
// to re-download.
const DEPS_CACHE_PREFIXES = ["motion-fix-deps-"];

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
