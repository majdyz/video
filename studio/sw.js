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
const VERSION = "studio-315826985dec";
const PRECACHE = ["./","./index.html","./manifest.webmanifest","./icon.svg","./icon-192.png","./apple-touch-icon.png","./calib/hlg-hevc.mp4","./calib/hlg-vp9.webm","./calib/pq-hevc.mp4","./calib/pq-vp9.webm","./calib/wide-hevc.mp4","./calib/wide-vp9.webm","./assets/analysis-worker--wK0gl3y.js","./assets/analysis-worker-DbtqEL7Z.js","./assets/bridge-DEzh20dy.js","./assets/colour-DkMNy9Uw.js","./assets/dewarp-CoSDw-AB.js","./assets/dist-1Myv_BFQ.js","./assets/export-journal-Bb2hZhso.js","./assets/fisheye-D0_b3mZj.js","./assets/frame-worker-Bf6wfUvw.js","./assets/index-B-f-uGJB.js","./assets/index-BMr-hGeF.css","./assets/media-CDZNy6uR.js","./assets/motion-D0n6QsFt.js","./assets/opfs-worker-ZrutHdOu.js","./assets/person-worker-PK8s94hj.js","./assets/rolldown-runtime-S-ySWqyJ.js","./assets/seg-worker-DeMH3Gcr.js","./assets/videoframe-colorspace-zfqeaqOD.js","./assets/vision_bundle-DgfK8w8l.js","./assets/web-D4TrakeJ.js"];

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

// Cross-origin isolation (the coi-serviceworker approach, in our own worker): GitHub Pages can't set headers, so
// every response this worker serves gets COOP / COEP / CORP added. The page is then crossOriginIsolated, which
// SharedArrayBuffer and so multi-threaded WASM (AI subject detection, onnxruntime-web) need. Everything the
// studio loads is same-origin (fonts and MediaPipe are self-hosted), so require-corp blocks nothing.
function coi(res) {
  if (!res || res.status === 0 || res.type === "opaque" || res.type === "opaqueredirect") return res;
  const headers = new Headers(res.headers);
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

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
  // Sample clip: let the browser stream it (range requests), don't cache it. Same-origin subresources need no
  // isolation headers (only documents and workers do), so a pass-through is fine.
  if (req.url.includes("/samples/")) return;
  // AI subject detection: the models (~33 MB) live in the app's own cache across deploys (seg/model.ts); the
  // onnxruntime-web WASM runtime (~22 MB) is a hashed asset, cached below like the bundles.
  if (req.url.includes("/seg/")) return;
  const immutable = req.url.includes("/mediapipe/") || req.url.includes("/assets/");
  if (immutable) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => put(req, res))).then(coi));
    return;
  }
  event.respondWith(
    fetch(req)
      .then((res) => put(req, res))
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || Response.error()))
      .then(coi),
  );
});
