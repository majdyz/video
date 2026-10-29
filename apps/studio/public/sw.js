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
const VERSION = "studio-__BUILD_VERSION__";
const PRECACHE = __PRECACHE__;

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
// Opt-in (?coi=1) since 29 Oct: an isolated page rendered a black preview on iPhone Safari (the same deploy also
// shipped two WGSL compile errors, the likelier cause; the studio now defaults to WebGL2). The mode follows the
// last navigation (?coi=1 on, without it off) and is kept in a tiny cache entry, since this worker can be stopped
// and restarted between requests.
const COI_CACHE = "deepfix-coi";
let coiMode = caches.open(COI_CACHE).then((c) => c.match("mode")).then((r) => (r ? r.text() : "0")).then((t) => t === "1").catch(() => false);
function setCoi(on) {
  coiMode = Promise.resolve(on);
  caches.open(COI_CACHE).then((c) => c.put("mode", new Response(on ? "1" : "0"))).catch(() => undefined);
}
async function coi(res) {
  if (!(await coiMode)) return res;
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
  if (req.mode === "navigate") setCoi(new URL(req.url).searchParams.get("coi") === "1");
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
