// Stabilisation data model and the path stage: from per-frame motions to the
// per-frame render warp. Pure functions over typed arrays, so this runs in
// the analysis worker and in Node tests alike.
//
// Pipeline position:  analyze.ts (tracker) -> this file (L1 path, post-filter,
// adaptive zoom) -> mesh-renderer.ts (per-vertex UVs from the warp).

import { GRUNDMANN_WEIGHTS, solvePath, virtualPath, warpsFromVirtualPath, type PathSolution } from "./path-l1.ts";
import { IDENTITY, apply, compose, type MotionModel, type Similarity } from "./tracker.ts";

/** Everything the tracker learnt about a clip. All arrays have `frameCount` entries (x4 for transforms). */
export type MotionAnalysis = {
  /** Source size in display orientation (what the user sees), pixels. */
  width: number;
  height: number;
  analysisWidth: number;
  analysisHeight: number;
  frameCount: number;
  frameRate: number;
  /** Presentation time of each frame in seconds (exact container timestamps). */
  times: Float64Array;
  /** Frame-to-frame motion M_t (previous -> current) as (a, b, tx, ty), centred source pixels. */
  motion: Float64Array;
  /** Cumulative path C_t = M_t ∘ C_{t-1} (frame 0 -> frame t). */
  cumulative: Float64Array;
  inliers: Uint16Array;
  tracked: Uint16Array;
  /** Inlier RMS residual in analysis pixels. */
  rms: Float32Array;
  /** 0 identity, 1 translation, 2 rigid, 3 similarity. */
  model: Uint8Array;
  /** Tracking time per frame (ms), decode excluded. */
  trackMsPerFrame: number;
};

export const MODEL_CODE: Record<MotionModel, number> = { identity: 0, translation: 1, rigid: 2, similarity: 3 };

export type StabilizeParams = {
  /** 0 = pass-through, 1 = use the whole crop budget. */
  smoothing: number;
  /** Fraction of width/height that may be cropped from each side (0..0.45). */
  maxCrop: number;
};

export const DEFAULT_PARAMS: StabilizeParams = { smoothing: 0.8, maxCrop: 0.15 };

export type StabilizedPath = {
  frameCount: number;
  times: Float64Array;
  /** Render warp per frame: output (centred, display px) -> source (centred, display px) before zoom. */
  warp: Float64Array;
  /** Zoom per frame (>= 1): the output shows the central 1/zoom of the warped frame. */
  zoom: Float32Array;
  maxZoom: number;
  stats: { objective: number; iterations: number; converged: boolean; solveMs: number; meanZoom: number; maxUsedZoom: number };
};

/** Warp sampled at an arbitrary media time (zoom folded in). */
export type RenderWarp = Similarity & { zoom: number };

export const IDENTITY_WARP: RenderWarp = { ...IDENTITY, zoom: 1 };

function readSim(arr: Float64Array, t: number): Similarity {
  return { a: arr[4 * t], b: arr[4 * t + 1], tx: arr[4 * t + 2], ty: arr[4 * t + 3] };
}

function writeSim(arr: Float64Array, t: number, s: Similarity): void {
  arr[4 * t] = s.a;
  arr[4 * t + 1] = s.b;
  arr[4 * t + 2] = s.tx;
  arr[4 * t + 3] = s.ty;
}

/** Zero-phase Gaussian over an array of similarities (each parameter separately), edges replicated. */
function gaussianSimilarities(path: Similarity[], sigma: number): Similarity[] {
  if (sigma <= 0.05 || path.length < 3) return path;
  const radius = Math.max(1, Math.ceil(3 * sigma));
  const kernel = new Float64Array(2 * radius + 1);
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    kernel[i + radius] = Math.exp(-(i * i) / (2 * sigma * sigma));
    sum += kernel[i + radius];
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;
  const n = path.length;
  const out: Similarity[] = [];
  for (let t = 0; t < n; t++) {
    let a = 0;
    let b = 0;
    let tx = 0;
    let ty = 0;
    for (let i = -radius; i <= radius; i++) {
      const u = Math.min(n - 1, Math.max(0, t + i));
      const k = kernel[i + radius];
      a += k * path[u].a;
      b += k * path[u].b;
      tx += k * path[u].tx;
      ty += k * path[u].ty;
    }
    out.push({ a, b, tx, ty });
  }
  return out;
}

/**
 * Smallest zoom at which the full output frame, warped by `w`, stays inside
 * the source frame (half extents hw, hh). Infinity when even the centre is
 * outside, which the solver's inclusion constraints rule out.
 */
export function requiredZoom(w: Similarity, hw: number, hh: number): number {
  let z = 1;
  for (const cx of [-hw, hw]) {
    for (const cy of [-hh, hh]) {
      const ux = w.a * cx - w.b * cy;
      const uy = w.b * cx + w.a * cy;
      // u/z + t must stay within ±h on both axes.
      const zx = ux > 0 ? ux / (hw - w.tx) : ux < 0 ? -ux / (hw + w.tx) : 1;
      const zy = uy > 0 ? uy / (hh - w.ty) : uy < 0 ? -uy / (hh + w.ty) : 1;
      z = Math.max(z, zx > 0 ? zx : Infinity, zy > 0 ? zy : Infinity);
    }
  }
  return z;
}

/**
 * Adaptive zoom (the Gyroflow recipe): per-frame required zoom -> rolling
 * maximum over a window of a few seconds -> Gaussian with sigma = window/6.
 * The result is a slow, invisible breathing of the crop instead of a
 * constant worst-case crop, and never below what each frame needs.
 */
export function smoothZoom(required: Float32Array, windowFrames: number, maxZoom: number): Float32Array {
  const n = required.length;
  const half = Math.max(1, Math.floor(windowFrames / 2));
  const rolling = new Float32Array(n);
  for (let t = 0; t < n; t++) {
    let m = 1;
    for (let u = Math.max(0, t - half); u <= Math.min(n - 1, t + half); u++) m = Math.max(m, required[u]);
    rolling[t] = Math.min(maxZoom, m);
  }
  const sigma = Math.max(0.5, windowFrames / 6);
  const radius = Math.ceil(3 * sigma);
  const out = new Float32Array(n);
  for (let t = 0; t < n; t++) {
    let acc = 0;
    let wsum = 0;
    for (let i = -radius; i <= radius; i++) {
      const u = Math.min(n - 1, Math.max(0, t + i));
      const k = Math.exp(-(i * i) / (2 * sigma * sigma));
      acc += k * rolling[u];
      wsum += k;
    }
    out[t] = Math.min(maxZoom, Math.max(acc / wsum, Math.min(maxZoom, required[t]), 1));
  }
  return out;
}

/**
 * Pulls a warp toward the identity until the frame fits at `zoom` (bisection
 * on the blend factor; the required zoom is monotonic in it). Only ever
 * needed for the last fraction of a pixel the post-filter may have added.
 */
function fitToZoom(w: Similarity, zoom: number, hw: number, hh: number): Similarity {
  if (requiredZoom(w, hw, hh) <= zoom + 1e-9) return w;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    const c = { a: 1 + (w.a - 1) * mid, b: w.b * mid, tx: w.tx * mid, ty: w.ty * mid };
    if (requiredZoom(c, hw, hh) <= zoom + 1e-9) lo = mid;
    else hi = mid;
  }
  return { a: 1 + (w.a - 1) * lo, b: w.b * lo, tx: w.tx * lo, ty: w.ty * lo };
}

/** Pass-through path: identity warps, zoom 1. */
export function identityPath(analysis: MotionAnalysis): StabilizedPath {
  const n = analysis.frameCount;
  const warp = new Float64Array(4 * n);
  for (let t = 0; t < n; t++) warp[4 * t] = 1;
  return {
    frameCount: n,
    times: analysis.times,
    warp,
    zoom: new Float32Array(n).fill(1),
    maxZoom: 1,
    stats: { objective: 0, iterations: 0, converged: true, solveMs: 0, meanZoom: 1, maxUsedZoom: 1 },
  };
}

/**
 * The path stage. Units: the LP runs in analysis-resolution pixels (that is
 * where the paper's 100:1 affine/translation weighting was tuned); warps are
 * returned in source display pixels.
 */
export function computeStabilizedPath(analysis: MotionAnalysis, params: StabilizeParams): StabilizedPath {
  const n = analysis.frameCount;
  const smoothing = Math.min(1, Math.max(0, params.smoothing));
  const maxCrop = Math.min(0.45, Math.max(0, params.maxCrop));
  const userCropRatio = 1 - 2 * maxCrop;
  // Smoothing decides how much of the crop budget the virtual camera may
  // use to decouple from the real one; the rest stays as head-room for the
  // adaptive zoom. At 0 the path is pinned to the source: pass-through.
  const solverCropRatio = 1 - smoothing * (1 - userCropRatio);
  if (n < 4 || solverCropRatio >= 0.995) return identityPath(analysis);

  const started = performance.now();
  const unit = analysis.analysisWidth / analysis.width;
  const motions: Similarity[] = [];
  for (let t = 0; t < n; t++) {
    const m = readSim(analysis.motion, t);
    motions.push({ a: m.a, b: m.b, tx: m.tx * unit, ty: m.ty * unit });
  }
  const hw = (analysis.width * unit) / 2;
  const hh = (analysis.height * unit) / 2;
  const sol: PathSolution = solvePath({
    motions,
    halfWidth: hw,
    halfHeight: hh,
    cropHalfWidth: hw * solverCropRatio,
    cropHalfHeight: hh * solverCropRatio,
    weights: GRUNDMANN_WEIGHTS,
  });

  // Back to source pixels.
  const cumulative: Similarity[] = [];
  for (let t = 0; t < n; t++) cumulative.push(readSim(analysis.cumulative, t));
  let warps = sol.warps.map((w) => ({ a: w.a, b: w.b, tx: w.tx / unit, ty: w.ty / unit }));

  // Light zero-phase filter on the virtual camera: ℓ1 trend filtering
  // produces exact kinks between its constant / linear / parabolic segments
  // and a sigma of a few frames hides them without adding lag.
  const sigma = 0.5 + 2.5 * smoothing;
  const q = gaussianSimilarities(virtualPath(cumulative, warps), sigma);
  warps = warpsFromVirtualPath(cumulative, q);

  // Adaptive zoom within the user's budget.
  const HW = analysis.width / 2;
  const HH = analysis.height / 2;
  const maxZoom = 1 / userCropRatio;
  const required = new Float32Array(n);
  for (let t = 0; t < n; t++) {
    warps[t] = fitToZoom(warps[t], maxZoom, HW, HH);
    required[t] = Math.min(maxZoom, requiredZoom(warps[t], HW, HH));
  }
  const windowFrames = Math.max(8, Math.round(analysis.frameRate * 2.5));
  const zoom = smoothZoom(required, windowFrames, maxZoom);

  const warp = new Float64Array(4 * n);
  let meanZoom = 0;
  let maxUsedZoom = 1;
  for (let t = 0; t < n; t++) {
    writeSim(warp, t, warps[t]);
    meanZoom += zoom[t];
    maxUsedZoom = Math.max(maxUsedZoom, zoom[t]);
  }
  return {
    frameCount: n,
    times: analysis.times,
    warp,
    zoom,
    maxZoom,
    stats: {
      objective: sol.objective,
      iterations: sol.iterations,
      converged: sol.converged,
      solveMs: performance.now() - started,
      meanZoom: meanZoom / n,
      maxUsedZoom,
    },
  };
}

/** Index of the frame whose timestamp is closest to `time` (binary search). */
export function frameIndexAt(times: Float64Array, time: number): number {
  const n = times.length;
  if (n === 0) return 0;
  if (time <= times[0]) return 0;
  if (time >= times[n - 1]) return n - 1;
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] < time) lo = mid + 1;
    else hi = mid;
  }
  return lo > 0 && time - times[lo - 1] < times[lo] - time ? lo - 1 : lo;
}

/**
 * Render warp at a media time, interpolated between the two surrounding
 * frames. Playback clocks and container timestamps rarely agree exactly, and
 * a nearest-sample lookup would snap by a whole frame's motion.
 */
export function warpAtTime(path: StabilizedPath, time: number): RenderWarp {
  const { times, warp, zoom } = path;
  const n = path.frameCount;
  if (n === 0) return IDENTITY_WARP;
  const at = (t: number): RenderWarp => ({ ...readSim(warp, t), zoom: zoom[t] });
  if (n === 1 || time <= times[0]) return at(0);
  if (time >= times[n - 1]) return at(n - 1);
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] < time) lo = mid + 1;
    else hi = mid;
  }
  const i1 = lo;
  const i0 = Math.max(0, lo - 1);
  const dt = times[i1] - times[i0];
  if (dt <= 0) return at(i0);
  const f = (time - times[i0]) / dt;
  const w0 = at(i0);
  const w1 = at(i1);
  return {
    a: w0.a + (w1.a - w0.a) * f,
    b: w0.b + (w1.b - w0.b) * f,
    tx: w0.tx + (w1.tx - w0.tx) * f,
    ty: w0.ty + (w1.ty - w0.ty) * f,
    zoom: w0.zoom + (w1.zoom - w0.zoom) * f,
  };
}

/** The warp with its zoom folded in: output centred px -> source centred px. */
export function zoomedWarp(w: RenderWarp): Similarity {
  return { a: w.a / w.zoom, b: w.b / w.zoom, tx: w.tx, ty: w.ty };
}

export type MotionSummary = {
  /** Mean |translation| per frame (px): pans count, so this is "motion", not shake. */
  meanShift: number;
  meanRotationDeg: number;
  /** RMS of the second difference of the translation (px): what the eye reads as shake. */
  jitterRms: number;
};

/** Residual motion left in a path, measured on the virtual camera. */
export function residualMotion(analysis: MotionAnalysis, path: StabilizedPath): MotionSummary {
  const n = analysis.frameCount;
  if (n < 3) return { meanShift: 0, meanRotationDeg: 0, jitterRms: 0 };
  let shift = 0;
  let rot = 0;
  let jitter = 0;
  let prevDx = 0;
  let prevDy = 0;
  for (let t = 1; t < n; t++) {
    // Virtual camera step between frames, in frame-t pixels: F_t W_t − W_{t−1} applied to the centre.
    const m = readSim(analysis.motion, t);
    const d = m.a * m.a + m.b * m.b;
    const inv: Similarity = { a: m.a / d, b: -m.b / d, tx: 0, ty: 0 };
    inv.tx = -(inv.a * m.tx - inv.b * m.ty);
    inv.ty = -(inv.b * m.tx + inv.a * m.ty);
    const step = compose(inv, readSim(path.warp, t));
    const prev = readSim(path.warp, t - 1);
    const [x1, y1] = apply(step, 0, 0);
    const [x0, y0] = apply(prev, 0, 0);
    const dx = x1 - x0;
    const dy = y1 - y0;
    shift += Math.hypot(dx, dy);
    rot += Math.abs(Math.atan2(step.b, step.a) - Math.atan2(prev.b, prev.a));
    if (t > 1) jitter += (dx - prevDx) ** 2 + (dy - prevDy) ** 2;
    prevDx = dx;
    prevDy = dy;
  }
  return { meanShift: shift / (n - 1), meanRotationDeg: ((rot / (n - 1)) * 180) / Math.PI, jitterRms: Math.sqrt(jitter / (n - 2)) };
}

/** Same summary for the raw camera (frame-to-frame motions). */
export function rawMotion(analysis: MotionAnalysis): MotionSummary {
  const n = analysis.frameCount;
  if (n < 3) return { meanShift: 0, meanRotationDeg: 0, jitterRms: 0 };
  let shift = 0;
  let rot = 0;
  let jitter = 0;
  for (let t = 1; t < n; t++) {
    const m = readSim(analysis.motion, t);
    shift += Math.hypot(m.tx, m.ty);
    rot += Math.abs(Math.atan2(m.b, m.a));
    if (t > 1) {
      const p = readSim(analysis.motion, t - 1);
      jitter += (m.tx - p.tx) ** 2 + (m.ty - p.ty) ** 2;
    }
  }
  return { meanShift: shift / (n - 1), meanRotationDeg: ((rot / (n - 1)) * 180) / Math.PI, jitterRms: Math.sqrt(jitter / (n - 2)) };
}
