// deepfix service worker: offline launch and offline tools.
//
// The build (vite.config.ts, studioServiceWorker) replaces the two
// placeholders below: VERSION becomes a hash of the built files, PRECACHE
// the app shell plus every JS/CSS chunk (the lazily loaded tools included,
// so Stabilise or Dewarp work offline even if never opened online).
// Hashed bundles and the MediaPipe models are cache-first; the HTML is
// network-first so a deploy never serves an index pointing at deleted
// bundles. Each deploy gets a new cache and the old one is deleted on
// activate.
const VERSION = "studio-bb8530993b31";
const PRECACHE = ["./","./index.html","./manifest.webmanifest","./icon.svg","./icon-192.png","./apple-touch-icon.png","./assets/analysis-worker-BJ5uGTov.js","./assets/analysis-worker-D2TOee3w.js","./assets/colour-DXO7_dLO.js","./assets/dewarp-CKb2KjLh.js","./assets/fisheye-ZQaGtv4_.js","./assets/id3-2rrXXeLR.js","./assets/index-D5-jL11B.js","./assets/index-DASDL9P1.css","./assets/media-V4DZhXq0.js","./assets/motion-DcKKNYnN.js","./assets/opfs-worker-BuQ2QldH.js","./assets/person-worker-PK8s94hj.js","./assets/vision_bundle-DgfK8w8l.js"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((c) => c.addAll(PRECACHE)).catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("studio-") && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
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
  // Sample clip: let the browser stream it (range requests), don't cache it.
  if (req.url.includes("/samples/")) return;
  const immutable = req.url.includes("/mediapipe/") || req.url.includes("/assets/");
  if (immutable) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => put(req, res))));
    return;
  }
  event.respondWith(
    fetch(req)
      .then((res) => put(req, res))
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || Response.error())),
  );
});
