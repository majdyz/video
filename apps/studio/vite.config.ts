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
 * AI subject detection (EdgeTAM, Apache-2.0): the model files are built outside the repo by
 * scripts/seg-models.py (~33 MB of fp16 weights; SEG_MODELS_DIR overrides the folder) and served from
 * `${BASE_URL}seg/` in dev and copied into the build output, next to onnxruntime-web's WASM runtime
 * (`seg/ort/`). Each file is far below GitHub Pages' 100 MB limit. Without the folder the build still succeeds
 * and the app falls back to the engine's own subject masks.
 */
function studioSegModels(): Plugin {
  const dir = process.env.SEG_MODELS_DIR ?? join(process.env.HOME ?? "", "video-data/models/edgetam-web");
  const ortDir = resolve(here, "node_modules/onnxruntime-web/dist");
  const ortFiles = ["ort-wasm-simd-threaded.jsep.mjs", "ort-wasm-simd-threaded.jsep.wasm"];
  const fileFor = (name: string): string | null => {
    if (name.startsWith("ort/")) return ortFiles.includes(name.slice(4)) ? join(ortDir, name.slice(4)) : null;
    return /^[\w.-]+$/.test(name) ? join(dir, name) : null;
  };
  return {
    name: "studio-seg-models",
    configureServer(server) {
      server.middlewares.use(`${base}seg/`, (req, res, next) => {
        const name = decodeURIComponent((req.url ?? "").split("?")[0]).replace(/^\/+/, "");
        const file = fileFor(name);
        if (!file || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader("content-type", file.endsWith(".wasm") ? "application/wasm" : file.endsWith(".mjs") ? "text/javascript" : file.endsWith(".json") ? "application/json" : "application/octet-stream");
        createReadStream(file).pipe(res);
      });
    },
    writeBundle(opts) {
      if (!opts.dir) return;
      const out = join(opts.dir, "seg");
      if (!existsSync(join(dir, "manifest.json"))) {
        this.warn(`AI subject detection models not found in ${dir} (run scripts/seg-models.py); the build ships without them`);
        return;
      }
      cpSync(dir, out, { recursive: true });
      cpSync(ortDir, join(out, "ort"), { recursive: true, filter: (f) => f === ortDir || ortFiles.some((n) => f.endsWith(n)) });
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
      // The HDR calibration clips (a few KB) too: an HDR clip opened offline still gets measured.
      const calib = existsSync(join(dir, "calib")) ? readdirSync(join(dir, "calib")).sort().map((f) => `./calib/${f}`) : [];
      const precache = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg", "./icon-192.png", "./apple-touch-icon.png", ...calib, ...assets.filter((a) => /\.(js|css)$/.test(a)).map((a) => `./assets/${a}`)];
      const src = readFileSync(sw, "utf8").replace("__BUILD_VERSION__", version).replace("__PRECACHE__", JSON.stringify(precache));
      writeFileSync(sw, src);
      this.info?.(`sw.js: cache studio-${version}, ${precache.length} files precached`);
    },
  };
}

export default defineConfig({
  base,
  plugins: [react(), sharedMediapipe(), studioSegModels(), studioServiceWorker()],
  server: { fs: { allow: [resolve(here, "../.."), "/home/majdyz/video/node_modules"] } },
  worker: { format: "es" },
});
