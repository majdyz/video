// Person segmentation off the main thread: MediaPipe selfie segmenter
// (250 KB model, WASM CPU delegate) on a small RGBA8 thumbnail. The reply is
// the person confidence mask at the model's resolution (0..1 floats).
//
// The runtime (~3.4 MB gzipped) is loaded lazily on the first request; a
// failure (no SIMD, offline before first cache, …) is reported once and the
// worker then answers every request with `null` so the engine carries on
// without a mask.
import type { ImageSegmenter } from "@mediapipe/tasks-vision";

export type PersonRequest = { id: number; rgba: ArrayBuffer; width: number; height: number; timestampMs: number };
export type PersonPacket = { id: number; mask: Float32Array | null; width: number; height: number; ms: number; error?: string };

// In dev Vite refuses dynamic imports from public/, so point at the package.
const BASE = import.meta.env.BASE_URL; // "/video/aqua-fix/"
const WASM_DIR = import.meta.env.DEV
  ? `${BASE}@fs/home/majdyz/video/node_modules/.pnpm/@mediapipe+tasks-vision@1.0.1/node_modules/@mediapipe/tasks-vision/wasm`
  : `${BASE}mediapipe`;
const MODEL = `${BASE}mediapipe/selfie_segmenter.tflite`;

let segP: Promise<ImageSegmenter | null> | null = null;
let failure: string | null = null;

function segmenter(): Promise<ImageSegmenter | null> {
  return (segP ??= (async () => {
    try {
      const { FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
      // The Emscripten loader is a classic script that leaves `ModuleFactory`
      // as a top-level var. In a module worker there is no importScripts, and
      // a dynamic import() keeps that var module-scoped, so the runtime finds
      // nothing on `self` ("ModuleFactory not set"). Evaluate it in global
      // scope ourselves first; the runtime's own import() is then a no-op.
      const loader = await (await fetch(`${WASM_DIR}/vision_wasm_internal.js`)).text();
      (0, eval)(loader);
      const fileset = await FilesetResolver.forVisionTasks(WASM_DIR);
      return await ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL, delegate: "CPU" },
        runningMode: "VIDEO",
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      });
    } catch (e) {
      failure = String(e);
      return null;
    }
  })());
}

let lastTs = 0;

self.onmessage = async (e: MessageEvent<PersonRequest>) => {
  const { id, rgba, width, height, timestampMs } = e.data;
  const t0 = performance.now();
  const seg = await segmenter();
  if (!seg) {
    (self as unknown as Worker).postMessage({ id, mask: null, width: 0, height: 0, ms: 0, error: failure ?? "unavailable" } satisfies PersonPacket);
    return;
  }
  try {
    // VIDEO mode wants monotonically increasing timestamps.
    const ts = Math.max(lastTs + 1, Math.round(timestampMs));
    lastTs = ts;
    const img = new ImageData(new Uint8ClampedArray(rgba), width, height);
    const res = seg.segmentForVideo(img, ts);
    const m = res.confidenceMasks?.[0];
    let mask: Float32Array | null = null, mw = 0, mh = 0;
    if (m) {
      mask = Float32Array.from(m.getAsFloat32Array());
      mw = m.width;
      mh = m.height;
    }
    for (const mm of res.confidenceMasks ?? []) mm.close();
    const packet: PersonPacket = { id, mask, width: mw, height: mh, ms: performance.now() - t0 };
    (self as unknown as Worker).postMessage(packet, mask ? [mask.buffer] : []);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, mask: null, width: 0, height: 0, ms: 0, error: String(err) } satisfies PersonPacket);
  }
};
