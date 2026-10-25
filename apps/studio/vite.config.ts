import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { cpSync, createReadStream, existsSync, statSync } from "node:fs";
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

export default defineConfig({
  base,
  plugins: [react(), sharedMediapipe()],
  server: { fs: { allow: [resolve(here, "../.."), "/home/majdyz/video/node_modules"] } },
  worker: { format: "es" },
});
