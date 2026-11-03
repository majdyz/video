import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const dist = resolve(root, "dist");

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

// DiveGrade (apps/studio) is the product at /video/studio/. The single-tool apps are retired:
// their engines live on inside the studio, their old URLs open it with that tool on.
cpSync(resolve(root, "apps/studio/dist"), resolve(dist, "studio"), { recursive: true });

const redirect = (target, title) => `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#0a0a0b" />
<title>${title}</title>
<meta http-equiv="refresh" content="0; url=${target}" />
<link rel="canonical" href="${target}" />
<script>
  // Keep any extra query (e.g. ?coi=0) and the hash.
  (function () {
    var t = new URL(${JSON.stringify(target)}, location.href);
    new URLSearchParams(location.search).forEach(function (v, k) { if (!t.searchParams.has(k)) t.searchParams.set(k, v); });
    t.hash = location.hash;
    location.replace(t.href);
  })();
</script>
<style>
  html, body { margin: 0; height: 100%; background: #0a0a0b; color: #ededf0; font: 15px/1.5 -apple-system, system-ui, sans-serif; }
  main { min-height: 100%; display: grid; place-content: center; text-align: center; padding: 24px; }
  a { color: #ededf0; text-underline-offset: 3px; text-decoration-color: rgba(255,255,255,.25); }
</style>
</head>
<body>
<main><a href="${target}">Open DiveGrade &rarr;</a></main>
</body>
</html>
`;

// A service worker that removes itself: phones that installed a classic app keep its worker,
// which would go on serving the old cached app. On its next update check the browser fetches
// this, it clears the old caches, unregisters and reloads open pages (which then redirect).
const killSw = `self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) await caches.delete(k);
    await self.registration.unregister();
    for (const c of await self.clients.matchAll({ type: "window" })) c.navigate(c.url);
  })());
});
`;

writeFileSync(resolve(dist, "index.html"), redirect("./studio/", "DiveGrade"));
const retired = { "aqua-fix": "colour", "motion-fix": "stabilise", dewarp: "dewarp", classic: null };
for (const [app, tool] of Object.entries(retired)) {
  const dir = resolve(dist, app);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, "index.html"), redirect(tool ? `../studio/?tool=${tool}` : "../studio/", "DiveGrade"));
  writeFileSync(resolve(dir, "sw.js"), killSw);
}

console.log(`Assembled dist/ → /studio/; ${Object.keys(retired).map((a) => "/" + a + "/").join(", ")} redirect to it`);
