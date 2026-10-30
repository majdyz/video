// AI subject detection eval: runs the Studio's browser pipeline (seg/ worker + onnxruntime-web WASM + EdgeTAM bank +
// track pass + interpolation) headless on the prototype's clips with the prototype's prompts, then scores the
// masks against the SAM 2.1-L pseudo-GT (metrics.py: IoU at the GT frames, flow-compensated flicker).
//
//   node apps/studio/eval/seg/run-eval.mjs [clip ...]     (default: the six prototype clips)
//   env: SEG_DATA (~/video-data/sam), OUT (<SEG_DATA>/app-eval), COI=0 (single-thread WASM), PORT,
//        ROBUST=1 (also grade frames through the colour engine: engine vs ML vs corrupted ML masks, robust.ts)
//        TUNE=1 (Subject pop tuning, tune.ts: no segmentation pass; the masks of an earlier run in MASKS, default
//        <SEG_DATA>/app-eval-tone, graded Vivid on, pop off vs on at STRENGTHS, frames BOARDF; OUT gets <clip>.tune.json;
//        RES=1280: frames from cache/<clip>_1280.npy, the export's size, instead of the 640 px cache; halo.ts metric)
// Needs the model files (apps/studio/scripts/seg-models.py) and Playwright in ~/browser.
import { createServer } from "vite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME;
const DATA = process.env.SEG_DATA ?? path.join(HOME, "video-data/sam");
const OUT = process.env.OUT ?? path.join(DATA, "app-eval");
const PORT = +(process.env.PORT ?? 8931);
const COI = process.env.COI !== "0";
const TUNE = process.env.TUNE === "1";
const MASKS = process.env.MASKS ?? path.join(DATA, "app-eval-tone");
const { chromium } = await import(path.join(HOME, "browser/node_modules/playwright/index.mjs"));
fs.mkdirSync(OUT, { recursive: true });

// The prototype's video prompts (~/video-data/sam/scripts/prompts.py TAPS): frame, points at 640 px.
const TAPS = {
  shark: [[0, [[380, 200]]]],
  sharkclose: [[0, [[330, 170]]]],
  manta: [[0, [[330, 135]]]],
  dolphins: [[0, [[400, 85]]], [0, [[250, 60]]], [0, [[280, 125]]]],
  whitetip: [[0, [[300, 120]]], [40, [[120, 150]]]],
  reefdiver: [[0, [[350, 170]]]],
  // The app's sample clip (public/samples/thresher.mp4; cache it with ffmpeg/cv2 as cache/thresher_640.npy): no
  // pseudo-GT, renders only. Board frames 0.5 / 2 / 3 / 4 / 5.5 s.
  thresher: [[15, [[300, 185]]]],
};
const BOARD_FRAMES = { thresher: [15, 60, 90, 120, 165] };
const clips = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(TAPS).filter((c) => c !== "thresher");

function npy(file) {
  const fd = fs.openSync(file, "r");
  const head = Buffer.alloc(256);
  fs.readSync(fd, head, 0, 256, 0);
  const hl = head.readUInt16LE(8), off = 10 + hl;
  const shape = head.toString("latin1", 10, off).match(/\(([^)]*)\)/)[1].split(",").map((s) => s.trim()).filter(Boolean).map(Number);
  return { fd, off, shape };
}
const arrays = new Map();
const arr = (clip) => {
  if (!arrays.has(clip)) arrays.set(clip, npy(path.join(DATA, `cache/${clip}_${process.env.RES ?? 640}.npy`)));
  return arrays.get(clip);
};

const server = await createServer({
  root: path.resolve(here, "../.."),
  configFile: path.resolve(here, "../../vite.config.ts"),
  // No HMR: an edit to the app's code must not reload a page halfway through a pass.
  server: { port: PORT, strictPort: true, host: "127.0.0.1", hmr: false, watch: null },
  logLevel: "warn",
  plugins: [{
    name: "seg-eval-data",
    configureServer(s) {
      s.middlewares.use((req, res, next) => {
        if (COI) { res.setHeader("Cross-Origin-Opener-Policy", "same-origin"); res.setHeader("Cross-Origin-Embedder-Policy", "require-corp"); }
        const u = new URL(req.url, "http://x");
        if (u.pathname === "/evaldata/frame") {
          const a = arr(u.searchParams.get("clip")), i = +u.searchParams.get("i");
          const [, h, w, c] = a.shape, n = h * w * c, buf = Buffer.alloc(n);
          fs.readSync(a.fd, buf, 0, n, a.off + i * n);
          res.setHeader("content-type", "application/octet-stream");
          return res.end(buf);
        }
        if (u.pathname === "/evaldata/file") {
          const f = path.join(MASKS, path.basename(u.searchParams.get("name")));
          if (!fs.existsSync(f)) { res.statusCode = 404; return res.end(); }
          res.setHeader("content-type", "application/octet-stream");
          return res.end(fs.readFileSync(f));
        }
        if (u.pathname === "/evaldata/out" && req.method === "POST") {
          const parts = [];
          req.on("data", (d) => parts.push(d));
          req.on("end", () => {
            const name = u.searchParams.get("name"), clip = u.searchParams.get("clip");
            const ext = name === "meta" || name === "robust" || name === "tune" ? ".json" : name === "alpha" || name === "raw" ? ".u8" : ".png";
            if (ext === ".png") fs.mkdirSync(path.join(OUT, "frames"), { recursive: true });
            fs.writeFileSync(path.join(OUT, ext === ".png" ? `frames/${clip}_${name}${ext}` : `${clip}.${name}${ext}`), Buffer.concat(parts));
            res.end("ok");
          });
          return;
        }
        next();
      });
    },
  }],
});
await server.listen();
const base = `http://127.0.0.1:${PORT}/video/studio/eval/seg/${TUNE ? "tune" : "index"}.html`;
// WebGL2 through SwiftShader for the colour engine (ROBUST=1 renders); the segmenter itself is WASM.
const gpuArgs = process.env.GPU === "1" ? ["--enable-unsafe-webgpu", "--use-webgpu-adapter=swiftshader", "--enable-features=Vulkan"] : []; // GPU=1: WebGPU (SwiftShader) for the ORT WebGPU EP
const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", ...gpuArgs] });
try {
  for (const clip of clips) {
    const [T0, H, W] = arr(clip).shape, T = Math.min(T0, +(process.env.MAXF ?? T0)); // MAXF: a short smoke run
    const objects = TAPS[clip].map(([f, pts], i) => ({ kind: "include", t: f / 30, prompt: { points: pts.map(([x, y]) => [x / W, y / H]), labels: pts.map(() => 1) }, id: i }));
    const page = await browser.newPage();
    page.on("console", (m) => { const t = m.text(); if (/pass|PASS|ROBUST|TUNE|track|frame \d|DONE|ERROR|model|engine/.test(t)) console.log(`[${clip}] ${t}`); });
    page.on("pageerror", (e) => console.log(`[${clip}] PAGEERROR ${e.message}`));
    const url = `${base}?clip=${clip}&w=${W}&h=${H}&frames=${T}&objects=${encodeURIComponent(JSON.stringify(objects))}&prefer=${process.env.PREFER ?? "auto"}${process.env.SEGFPS ? `&segfps=${process.env.SEGFPS}` : ""}&robust=${process.env.ROBUST === "1" ? 1 : 0}&boardf=${process.env.BOARDF ?? (BOARD_FRAMES[clip] ?? [6, 90, 165]).join(",")}&strengths=${process.env.STRENGTHS ?? "0,0.25,0.5,0.75,1"}&sp=${encodeURIComponent(process.env.SP ?? "")}&sc=${encodeURIComponent(process.env.SC ?? "")}`;
    await page.goto(url);
    await page.waitForFunction(() => /DONE|ERROR/.test(document.getElementById("log").textContent), null, { timeout: 3 * 3600_000, polling: 2000 });
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
const py = process.env.PYTHON ?? path.join(HOME, ".venvs/video/bin/python");
if (!TUNE) console.log(execFileSync(py, [path.join(here, "metrics.py"), OUT, ...clips], { encoding: "utf8" }));
