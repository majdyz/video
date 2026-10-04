// Person segmentation off the main thread: MediaPipe selfie segmenter
// (250 KB model, WASM CPU delegate) on a small RGBA8 thumbnail. The reply is
// the person confidence mask at the model's resolution (0..1 floats).
//
// The selfie model assumes somebody is in the picture and segments "the
// subject" — on a reef with nobody in it that is the nearest coral head, which
// the skin memory colour would then paint salmon. So a second, slower model
// (EfficientDet-Lite0, COCO classes, ~7 MB) answers the question the selfie
// model can't: is there a person at all, and where. The engine gates the
// mask with those boxes.
//
// The runtime (~3.4 MB gzipped) is loaded lazily on the first request; a
// failure (no SIMD, offline before first cache, …) is reported once and the
// worker then answers every request with `null` so the engine carries on
// without a mask.
import type { ImageSegmenter, ObjectDetector } from "@mediapipe/tasks-vision";

import type { PersonBox } from "./person-gate.ts";
export type { PersonBox };
export type PersonRequest = { id: number; rgba: ArrayBuffer; width: number; height: number; timestampMs: number; detect?: boolean };
export type PersonPacket = {
  id: number;
  mask: Float32Array | null;
  width: number;
  height: number;
  ms: number;
  error?: string;
  /** Detection replies: person boxes as fractions of the frame; undefined when the detector is unavailable. */
  boxes?: PersonBox[];
};

// In dev Vite refuses dynamic imports from public/, so point at the package.
const BASE = import.meta.env.BASE_URL; // "/video/aqua-fix/"
const WASM_DIR = import.meta.env.DEV
  ? `${BASE}@fs/home/majdyz/video/node_modules/.pnpm/@mediapipe+tasks-vision@1.0.1/node_modules/@mediapipe/tasks-vision/wasm`
  : `${BASE}mediapipe`;
const MODEL = `${BASE}mediapipe/selfie_segmenter.tflite`;
const DETECTOR = `${BASE}mediapipe/efficientdet_lite0.tflite`;
const DETECT_MIN_SCORE = 0.15;

let visionP: Promise<typeof import("@mediapipe/tasks-vision") & { fileset: unknown; loader: string }> | null = null;
let segP: Promise<ImageSegmenter | null> | null = null;
let detP: Promise<ObjectDetector | null> | null = null;
let failure: string | null = null;
let detFailure: string | null = null;

function vision() {
  return (visionP ??= (async () => {
    const mod = await import("@mediapipe/tasks-vision");
    // The Emscripten loader is a classic script that leaves `ModuleFactory`
    // as a top-level var. In a module worker there is no importScripts, and
    // a dynamic import() keeps that var module-scoped, so the runtime finds
    // nothing on `self` ("ModuleFactory not set"). Evaluate it in global
    // scope ourselves first; the runtime's own import() is then a no-op.
    // The runtime deletes the factory once a task has consumed it, so the
    // loader is evaluated again before every task is created (see arm()).
    const loader = await (await fetch(`${WASM_DIR}/vision_wasm_internal.js`)).text();
    (0, eval)(loader);
    const fileset = await mod.FilesetResolver.forVisionTasks(WASM_DIR);
    return Object.assign({}, mod, { fileset, loader });
  })());
}

function segmenter(): Promise<ImageSegmenter | null> {
  return (segP ??= (async () => {
    try {
      const v = await vision();
      (0, eval)(v.loader);
      return await v.ImageSegmenter.createFromOptions(v.fileset as never, {
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

function detector(): Promise<ObjectDetector | null> {
  return (detP ??= (async () => {
    try {
      const v = await vision();
      (0, eval)(v.loader);
      return await v.ObjectDetector.createFromOptions(v.fileset as never, {
        baseOptions: { modelAssetPath: DETECTOR, delegate: "CPU" },
        runningMode: "VIDEO",
        scoreThreshold: DETECT_MIN_SCORE,
        maxResults: 6,
      });
    } catch (e) {
      detFailure = String(e);
      return null;
    }
  })());
}

let lastTs = 0;
let lastDetTs = 0;

self.onmessage = async (e: MessageEvent<PersonRequest>) => {
  const { id, rgba, width, height, timestampMs, detect } = e.data;
  const t0 = performance.now();
  const post = (p: PersonPacket, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(p, transfer);
  if (detect) {
    const det = await detector();
    if (!det) {
      post({ id, mask: null, width: 0, height: 0, ms: 0, error: detFailure ?? "detector unavailable" });
      return;
    }
    try {
      const ts = Math.max(lastDetTs + 1, Math.round(timestampMs));
      lastDetTs = ts;
      const img = new ImageData(new Uint8ClampedArray(rgba), width, height);
      const res = det.detectForVideo(img, ts);
      const boxes: PersonBox[] = [];
      for (const d of res.detections) {
        const c = d.categories[0];
        const b = d.boundingBox;
        if (!c || !b || c.categoryName !== "person") continue;
        boxes.push({ x: b.originX / width, y: b.originY / height, w: b.width / width, h: b.height / height, score: c.score });
      }
      post({ id, mask: null, width, height, ms: performance.now() - t0, boxes });
    } catch (err) {
      post({ id, mask: null, width: 0, height: 0, ms: 0, error: String(err) });
    }
    return;
  }
  const seg = await segmenter();
  if (!seg) {
    post({ id, mask: null, width: 0, height: 0, ms: 0, error: failure ?? "unavailable" });
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
    post({ id, mask, width: mw, height: mh, ms: performance.now() - t0 }, mask ? [mask.buffer] : []);
  } catch (err) {
    post({ id, mask: null, width: 0, height: 0, ms: 0, error: String(err) });
  }
};
