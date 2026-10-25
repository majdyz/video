import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { cpSync, createReadStream, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
// Capacitor / file:// builds pass STUDIO_BASE=./ ; the web build lives under /video/studio/.
const base = process.env.STUDIO_BASE ?? "/video/studio/";

/**
 * The colour engine's person detector loads MediaPipe's runtime and models
 * from `${BASE_URL}mediapipe/`. They live in Aqua Fix's public folder (19 MB);
 * rather than commit a second copy, serve them from there in dev and copy
 * them into the build output.
 */
function sharedMediapipe(): Plugin {
  const dir = resolve(here, "../aqua-fix/public/mediapipe");
  return {
    name: "studio-shared-mediapipe",
    configureServer(server) {
      server.middlewares.use(`${base}mediapipe/`, (req, res, next) => {
        const name = decodeURIComponent((req.url ?? "").split("?")[0]).replace(/^\/+/, "");
        const file = join(dir, name);
        if (!name || name.includes("..") || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader("content-type", file.endsWith(".wasm") ? "application/wasm" : file.endsWith(".js") ? "text/javascript" : "application/octet-stream");
        createReadStream(file).pipe(res);
      });
    },
    writeBundle(opts) {
      if (opts.dir && existsSync(dir)) cpSync(dir, join(opts.dir, "mediapipe"), { recursive: true });
    },
  };
}

/**
 * Versions the service worker: after the bundle is written, sw.js gets a hash
 * of every built asset as its cache name and the shell + all JS/CSS chunks
 * (lazy tool chunks and workers included) as its precache list. Fonts, the
 * MediaPipe models and icons are cached on first use.
 */
function studioServiceWorker(): Plugin {
  return {
    name: "studio-service-worker",
    apply: "build",
    writeBundle(opts) {
      const dir = opts.dir;
      if (!dir) return;
      const sw = join(dir, "sw.js");
      if (!existsSync(sw)) return;
      const assets = readdirSync(join(dir, "assets")).sort();
      const hash = createHash("sha256");
      for (const a of assets) hash.update(a);
      hash.update(readFileSync(join(dir, "index.html")));
      const version = hash.digest("hex").slice(0, 12);
      const precache = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg", "./icon-192.png", "./apple-touch-icon.png", ...assets.filter((a) => /\.(js|css)$/.test(a)).map((a) => `./assets/${a}`)];
      const src = readFileSync(sw, "utf8").replace("__BUILD_VERSION__", version).replace("__PRECACHE__", JSON.stringify(precache));
      writeFileSync(sw, src);
      this.info?.(`sw.js: cache studio-${version}, ${precache.length} files precached`);
    },
  };
}

export default defineConfig({
  base,
  plugins: [react(), sharedMediapipe(), studioServiceWorker()],
  server: { fs: { allow: [resolve(here, "../.."), "/home/majdyz/video/node_modules"] } },
  worker: { format: "es" },
});
