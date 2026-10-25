// deepfix service worker: offline launch, cache-first for the immutable
// heavy assets (MediaPipe runtime/models, hashed bundles, fonts), network-first
// for the HTML so a deploy never serves an index pointing at deleted bundles.
const VERSION = "studio-v1";
const STATIC = ["./", "./icon.svg", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png", "./manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(STATIC)).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("studio-") && k !== VERSION).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

function put(req, res) {
  if (res && res.status === 200 && res.type === "basic") {
    const clone = res.clone();
    caches.open(VERSION).then((c) => c.put(req, clone)).catch(() => undefined);
  }
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || !req.url.startsWith(self.location.origin)) return;
  // Sample clip: let the browser stream it (range requests), don't cache 3 MB on install.
  if (req.url.includes("/samples/")) return;
  const immutable = req.url.includes("/mediapipe/") || req.url.includes("/assets/");
  if (immutable) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => put(req, res))));
    return;
  }
  event.respondWith(
    fetch(req)
      .then((res) => put(req, res))
      .catch(() => caches.match(req).then((hit) => hit || Response.error())),
  );
});
