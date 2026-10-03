// Stabilisation data model and the path stage: from per-frame motions to the
// per-frame render warp. Pure functions over typed arrays, so this runs in
// the analysis worker and in Node tests alike.
//
// Pipeline position:  analyze.ts (tracker) -> this file (L1 path, post-filter,
// wobble suppression, adaptive zoom) -> mesh-renderer.ts (per-vertex UVs
// from the warp).

import { applyHAt, composeH, homographyFromSimilarity, identityH, invertH, type Homography } from "./homography.ts";
import type { WarpFn } from "./mesh-renderer.ts";
import { GRUNDMANN_WEIGHTS, solvePath, virtualPath, warpsFromVirtualPath, type PathSolution } from "./path-l1.ts";
import { IDENTITY, apply, compose, invert, type HomographyState, type MotionModel, type Similarity } from "./tracker.ts";

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
  /** Plane-projective M_t (prev -> current, centred source px, row-major 3x3, 9 per frame): the upgraded homography, or the similarity itself when that was as good. */
  homography: Float64Array;
  /** 0 none (untrusted), 1 similarity stands in, 2 upgraded; see HomographyState. */
  homographyState: Uint8Array;
  /** Tracking time per frame (ms), decode excluded. */
  trackMsPerFrame: number;
};

export const MODEL_CODE: Record<MotionModel, number> = { identity: 0, translation: 1, rigid: 2, similarity: 3 };
export const HOMOGRAPHY_STATE: Record<HomographyState, number> = { none: 0, similarity: 1, upgraded: 2 };

export type StabilizeParams = {
  /** 0 = pass-through, 1 = use the whole crop budget. */
  smoothing: number;
  /** Fraction of width/height that may be cropped from each side (0..0.45). */
  maxCrop: number;
  /** Wobble suppression between keyframes; always on in the app, switchable for tests and reports. */
  wobble?: boolean;
};

export const DEFAULT_PARAMS: StabilizeParams = { smoothing: 0.8, maxCrop: 0.15 };

/** Keyframe spacing of the wobble suppression (Grundmann 2011 uses 30). */
export const WOBBLE_KEYFRAME_INTERVAL = 30;
/** Largest per-vertex deviation from the similarity warp, as a fraction of the longer frame edge. */
export const WOBBLE_BUDGET = 0.02;

export type StabilizedPath = {
  frameCount: number;
  times: Float64Array;
  /** Render warp per frame: output (centred, display px) -> source (centred, display px) before zoom. */
  warp: Float64Array;
  /** Zoom per frame (>= 1): the output shows the central 1/zoom of the warped frame. */
  zoom: Float32Array;
  maxZoom: number;
  /**
   * Wobble suppression residuals, applied to the similarity's sample
   * position: `wobbleFwd` replays the chained per-frame homographies in
   * place of the chained similarities from the previous keyframe,
   * `wobbleBwd` from the next (9 entries per frame, centred source px).
   * `wobbleBlend` is the weight of the backward one (the frame's position
   * inside its keyframe interval); < 0 means the frame uses the similarity
   * alone. `wobbleBudget` clamps the deviation (source px).
   */
  wobbleFwd: Float64Array;
  wobbleBwd: Float64Array;
  wobbleBlend: Float32Array;
  wobbleBudget: Float32Array;
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

/** Identity homography in every slot of a 9n array. */
function identityChain(n: number): Float64Array {
  const out = new Float64Array(9 * n);
  for (let t = 0; t < n; t++) {
    out[9 * t] = 1;
    out[9 * t + 4] = 1;
    out[9 * t + 8] = 1;
  }
  return out;
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
    wobbleFwd: identityChain(n),
    wobbleBwd: identityChain(n),
    wobbleBlend: new Float32Array(n).fill(-1),
    wobbleBudget: new Float32Array(n),
    stats: { objective: 0, iterations: 0, converged: true, solveMs: 0, meanZoom: 1, maxUsedZoom: 1 },
  };
}

// ---------------------------------------------------------------------------
// Wobble suppression (Grundmann, Kwatra, Essa 2011 §5.3)
//
// The similarity path leaves whatever a similarity cannot describe —
// parallax, refraction, residual rolling shutter — as a visible wobble. The
// fix keeps the planned path at keyframes every k frames and, in between,
// replays the frame-to-frame motion through the per-frame homographies
// instead of the similarities. With W_t the similarity warp (output -> frame
// t), the forward estimate from keyframe K is
//
//   W'_t = (H_t ∘ … ∘ H_{K+1}) ∘ (M_t ∘ … ∘ M_{K+1})⁻¹ ∘ W_t = R^f_t ∘ W_t
//
// i.e. the similarity's sample position is carried back to the keyframe by
// the similarity chain and forward again by the homography chain. The
// backward estimate R^b_t does the same from the next keyframe, and the two
// sample positions are blended linearly in time. A steady perspective drift
// (camera pointing down while swimming forward) grows linearly in both
// chains with opposite sign and cancels in the blend; only the non-linear
// part — the wobble — survives. R^f and R^b are stored per frame so the
// renderer only has to evaluate two homographies per vertex.

type WobbleChains = { fwd: Float64Array; bwd: Float64Array; blend: Float32Array };

function readH(arr: Float64Array, t: number): Homography {
  return arr.subarray(9 * t, 9 * t + 9);
}

function computeWobbleChains(analysis: MotionAnalysis, keyframeInterval: number): WobbleChains {
  const n = analysis.frameCount;
  const fwd = identityChain(n);
  const bwd = identityChain(n);
  const blend = new Float32Array(n).fill(-1);
  for (let k1 = 0; k1 + 1 < n; k1 += keyframeInterval) {
    const k2 = Math.min(n - 1, k1 + keyframeInterval);
    // Guard rail: one pair without a trustworthy plane-projective motion
    // and the whole interval stays on the similarity — a chain with a hole
    // would carry the similarity's residual on one side of it only. Pairs
    // the similarity explains as well as any homography are fine (the
    // similarity stands in), but an interval made only of those has
    // nothing to correct and is skipped so the output stays untouched.
    let valid = true;
    let upgraded = 0;
    for (let t = k1 + 1; t <= k2; t++) {
      const state = analysis.homographyState[t];
      if (state === HOMOGRAPHY_STATE.none) valid = false;
      if (state === HOMOGRAPHY_STATE.upgraded) upgraded++;
    }
    if (!valid || upgraded === 0 || k2 - k1 < 2) continue;
    let hc = identityH();
    let sc: Similarity = IDENTITY;
    for (let t = k1 + 1; t < k2; t++) {
      hc = composeH(readH(analysis.homography, t), hc);
      sc = compose(readSim(analysis.motion, t), sc);
      fwd.set(composeH(hc, homographyFromSimilarity(invert(sc))), 9 * t);
    }
    hc = identityH();
    sc = IDENTITY;
    for (let t = k2 - 1; t > k1; t--) {
      hc = composeH(invertH(readH(analysis.homography, t + 1)), hc);
      sc = compose(invert(readSim(analysis.motion, t + 1)), sc);
      bwd.set(composeH(hc, homographyFromSimilarity(invert(sc))), 9 * t);
    }
    for (let t = k1 + 1; t < k2; t++) blend[t] = (t - k1) / (k2 - k1);
  }
  return { fwd, bwd, blend };
}

/**
 * Wobble deviation at frame t for a similarity sample position (sx, sy):
 * the time-blend of the forward and backward replays minus the similarity,
 * clamped to the frame's budget so a bad fit can shift, never tear.
 */
function wobbleDeviation(path: StabilizedPath, t: number, sx: number, sy: number): [number, number] {
  const alpha = path.wobbleBlend[t];
  if (alpha < 0) return [0, 0];
  const [fx, fy] = applyHAt(path.wobbleFwd, 9 * t, sx, sy);
  const [bx, by] = applyHAt(path.wobbleBwd, 9 * t, sx, sy);
  let dx = fx + (bx - fx) * alpha - sx;
  let dy = fy + (by - fy) * alpha - sy;
  const len = Math.hypot(dx, dy);
  const budget = path.wobbleBudget[t];
  if (len > budget) {
    const k = budget / len;
    dx *= k;
    dy *= k;
  }
  return [dx, dy];
}

/** Output border of the crop window: corners plus `perEdge` points along each edge, in output centred px. */
function borderSamples(hw: number, hh: number, perEdge: number): Float64Array {
  const pts: number[] = [];
  for (let i = 0; i <= perEdge; i++) {
    const f = -1 + (2 * i) / perEdge;
    pts.push(f * hw, -hh, f * hw, hh, -hw, f * hh, hw, f * hh);
  }
  return Float64Array.from(pts);
}

/**
 * Smallest zoom in [lo, hi] at which every border sample, warped by the
 * similarity plus wobble deviation, lands inside the source; `hi + 1` when
 * even `hi` does not fit. Bisection: the deviation is tiny and smooth, so
 * inclusion is monotonic in the zoom for all practical purposes.
 */
function requiredZoomWobble(path: StabilizedPath, t: number, w: Similarity, border: Float64Array, hw: number, hh: number, lo: number, hi: number): number {
  const fits = (z: number): boolean => {
    for (let i = 0; i < border.length; i += 2) {
      const x = border[i] / z;
      const y = border[i + 1] / z;
      const sx = w.a * x - w.b * y + w.tx;
      const sy = w.b * x + w.a * y + w.ty;
      const [dx, dy] = wobbleDeviation(path, t, sx, sy);
      if (Math.abs(sx + dx) > hw + 1e-6 || Math.abs(sy + dy) > hh + 1e-6) return false;
    }
    return true;
  };
  if (fits(lo)) return lo;
  if (!fits(hi)) return hi + 1;
  let a = lo;
  let b = hi;
  for (let i = 0; i < 18; i++) {
    const mid = (a + b) / 2;
    if (fits(mid)) b = mid;
    else a = mid;
  }
  return b;
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
  const wobble = params.wobble ?? true;
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
  const warp = new Float64Array(4 * n);
  for (let t = 0; t < n; t++) {
    warps[t] = fitToZoom(warps[t], maxZoom, HW, HH);
    required[t] = Math.min(maxZoom, requiredZoom(warps[t], HW, HH));
    writeSim(warp, t, warps[t]);
  }

  // Wobble suppression residuals, then the zoom each frame needs once its
  // border is bent by them. A frame whose wobble would not fit even at the
  // zoom cap has its budget cut back until it does (bisection on the
  // budget; at budget 0 the similarity fits by construction).
  const chains = wobble ? computeWobbleChains(analysis, WOBBLE_KEYFRAME_INTERVAL) : null;
  const path: StabilizedPath = {
    frameCount: n,
    times: analysis.times,
    warp,
    zoom: new Float32Array(n),
    maxZoom,
    wobbleFwd: chains?.fwd ?? identityChain(n),
    wobbleBwd: chains?.bwd ?? identityChain(n),
    wobbleBlend: chains?.blend ?? new Float32Array(n).fill(-1),
    wobbleBudget: new Float32Array(n).fill(WOBBLE_BUDGET * Math.max(analysis.width, analysis.height)),
    stats: { objective: sol.objective, iterations: sol.iterations, converged: sol.converged, solveMs: 0, meanZoom: 1, maxUsedZoom: 1 },
  };
  if (chains) {
    const border = borderSamples(HW, HH, 8);
    for (let t = 0; t < n; t++) {
      if (path.wobbleBlend[t] < 0) continue;
      let z = requiredZoomWobble(path, t, warps[t], border, HW, HH, required[t], maxZoom);
      if (z > maxZoom) {
        let lo = 0;
        let hi = path.wobbleBudget[t];
        for (let i = 0; i < 12; i++) {
          const mid = (lo + hi) / 2;
          path.wobbleBudget[t] = mid;
          if (requiredZoomWobble(path, t, warps[t], border, HW, HH, required[t], maxZoom) <= maxZoom) lo = mid;
          else hi = mid;
        }
        path.wobbleBudget[t] = lo;
        z = maxZoom;
      }
      required[t] = z;
    }
  }
  const windowFrames = Math.max(8, Math.round(analysis.frameRate * 2.5));
  const zoom = smoothZoom(required, windowFrames, maxZoom);

  let meanZoom = 0;
  let maxUsedZoom = 1;
  for (let t = 0; t < n; t++) {
    meanZoom += zoom[t];
    maxUsedZoom = Math.max(maxUsedZoom, zoom[t]);
  }
  return {
    ...path,
    zoom,
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
  if (path.frameCount === 0) return IDENTITY_WARP;
  const { i0, i1, f } = frameBracket(path.times, time);
  const w0: RenderWarp = { ...readSim(path.warp, i0), zoom: path.zoom[i0] };
  if (i1 === i0) return w0;
  const w1: RenderWarp = { ...readSim(path.warp, i1), zoom: path.zoom[i1] };
  return {
    a: w0.a + (w1.a - w0.a) * f,
    b: w0.b + (w1.b - w0.b) * f,
    tx: w0.tx + (w1.tx - w0.tx) * f,
    ty: w0.ty + (w1.ty - w0.ty) * f,
    zoom: w0.zoom + (w1.zoom - w0.zoom) * f,
  };
}

/** The two frames surrounding `time` and the blend toward the second (i1 === i0 at the ends). */
function frameBracket(times: Float64Array, time: number): { i0: number; i1: number; f: number } {
  const n = times.length;
  if (n <= 1 || time <= times[0]) return { i0: 0, i1: 0, f: 0 };
  if (time >= times[n - 1]) return { i0: n - 1, i1: n - 1, f: 0 };
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
  if (dt <= 0) return { i0, i1: i0, f: 0 };
  return { i0, i1, f: (time - times[i0]) / dt };
}

/** The warp with its zoom folded in: output centred px -> source centred px. */
export function zoomedWarp(w: RenderWarp): Similarity {
  return { a: w.a / w.zoom, b: w.b / w.zoom, tx: w.tx, ty: w.ty };
}

/**
 * The complete per-vertex render warp at a media time: zoomed similarity
 * plus the wobble deviation, the latter interpolated between the two
 * surrounding frames (each frame's residual is evaluated on its own, since
 * the chains restart at keyframes and their entries cannot be lerped).
 */
export function warpFnAtTime(path: StabilizedPath, time: number): WarpFn {
  const z = zoomedWarp(warpAtTime(path, time));
  const { i0, i1, f } = frameBracket(path.times, time);
  const plain = path.frameCount === 0 || (path.wobbleBlend[i0] < 0 && path.wobbleBlend[i1] < 0);
  return (x, y) => {
    const sx = z.a * x - z.b * y + z.tx;
    const sy = z.b * x + z.a * y + z.ty;
    if (plain) return [sx, sy];
    const [dx0, dy0] = wobbleDeviation(path, i0, sx, sy);
    if (i1 === i0) return [sx + dx0, sy + dy0];
    const [dx1, dy1] = wobbleDeviation(path, i1, sx, sy);
    return [sx + dx0 + (dx1 - dx0) * f, sy + dy0 + (dy1 - dy0) * f];
  };
}

/** Diagnostics: how many keyframe intervals exist and how many got wobble suppression. */
export function wobbleCoverage(path: StabilizedPath): { frames: number; applied: number } {
  let applied = 0;
  for (let t = 0; t < path.frameCount; t++) if (path.wobbleBlend[t] >= 0) applied++;
  return { frames: path.frameCount, applied };
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
