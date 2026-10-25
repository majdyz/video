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
const VERSION = "studio-ef6063b23c7f";
const PRECACHE = ["./","./index.html","./manifest.webmanifest","./icon.svg","./icon-192.png","./apple-touch-icon.png","./calib/hlg-hevc.mp4","./calib/hlg-vp9.webm","./calib/pq-hevc.mp4","./calib/pq-vp9.webm","./calib/wide-hevc.mp4","./calib/wide-vp9.webm","./assets/analysis-worker--wK0gl3y.js","./assets/analysis-worker-D2TOee3w.js","./assets/bridge-BX9I2jLB.js","./assets/colour-lHw3Qa-1.js","./assets/dewarp-BE6HMIeU.js","./assets/dist-C1-5Ybmv.js","./assets/fisheye-ZQaGtv4_.js","./assets/frame-worker-Bf6wfUvw.js","./assets/index-B8aEsyaI.css","./assets/index-BxWi9JCP.js","./assets/media-CCdoCj0Q.js","./assets/motion-BjPAXzq3.js","./assets/opfs-worker-BuQ2QldH.js","./assets/person-worker-PK8s94hj.js","./assets/videoframe-colorspace-D9OO0HVe.js","./assets/vision_bundle-DgfK8w8l.js","./assets/web-Ean3G7CM.js"];

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
