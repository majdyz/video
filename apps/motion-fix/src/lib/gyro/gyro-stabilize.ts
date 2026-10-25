// Gyro stabilisation: from the camera's measured orientation to a smooth
// virtual camera, a per-frame zoom that never shows a black border, and the
// per-vertex render warp (output pixel -> source pixel) through the lens.
//
//  1. Raw orientation per video frame (frame centre time).
//  2. Speed-adaptive smoothing: a forward-backward SLERP exponential filter
//     whose time constant shrinks with the (look-ahead smoothed) angular
//     speed, so slow drift and fin-kick shake are flattened while a
//     deliberate pan is followed instead of lagging and running into the
//     crop wall.
//  3. Optional horizon levelling: roll the virtual camera so its "down"
//     axis lies in the plane of gravity and the view direction.
//  4. Crop budget: the zoom each frame needs so every output border ray,
//     rotated into the source camera at its own readout time and projected
//     through the lens, lands inside the recorded frame. Frames over the
//     budget get their correction pulled back toward a lightly smoothed
//     path (and only as a last resort toward the raw camera), with the
//     pull-back itself smoothed in time so it never jumps.
//  5. Zoom = required zoom -> rolling maximum -> Gaussian (slow breathing,
//     never below what a frame needs).
//
// Render: output pixel -> output lens (source lens at the zoomed focal,
// or rectilinear) -> ray -> virtual orientation -> world -> source
// orientation at the row's capture time (rolling shutter) -> source lens ->
// source pixel.

import { maxTheta, project, unproject, type LensModel } from "./lens.ts";
import { qat, qconj, qcontinuous, qdot, qlog, qmat, qmul, qnorm, qrot, qslerp, sampleOrientation, type Quat, type Vec3 } from "./quat.ts";
import type { CameraMotion } from "./telemetry.ts";

export type GyroParams = {
  /** 0 = follow the camera, 1 = heaviest smoothing. */
  smoothing: number;
  /** Fraction cropped from each side at most (zoom cap 1 / (1 − 2·maxCrop)). */
  maxCrop: number;
  /** 0..1, how strongly the horizon is levelled from gravity. */
  horizonLock: number;
  /** Keep the camera's lens look, or output rectilinear (straight lines). */
  output: "lens" | "rectilinear";
  /** Tuning override (tests/scripts): angular speed, deg/s, at which smoothing halves. */
  omegaRefDeg?: number;
};

export const DEFAULT_GYRO_PARAMS: GyroParams = { smoothing: 0.6, maxCrop: 0.15, horizonLock: 0, output: "lens" };

export type GyroPlan = {
  kind: "gyro";
  frameTimes: Float64Array;
  /** Virtual camera orientation per frame (camera -> world), 4 per frame. */
  virt: Float64Array;
  /** Output zoom per frame (>= 1). */
  zoom: Float32Array;
  output: "lens" | "rectilinear";
  /** Rectilinear output: focal (in source fx units) at zoom 1, chosen so the identity view fits. */
  rectBase: number;
  maxZoom: number;
  stats: {
    meanZoom: number;
    maxUsedZoom: number;
    /** Frames whose correction had to be pulled back to stay within the crop budget. */
    limitedFrames: number;
    solveMs: number;
    /** Mean |angular speed| of the raw / virtual camera at frame rate, deg/s, and of the high-frequency part (shake). */
    rawSpeed: number;
    virtSpeed: number;
    /** RMS of the frame-to-frame change of the per-frame rotation (deg/frame²): the shake a viewer sees. */
    rawJitter: number;
    virtJitter: number;
  };
};

/** Presentation times of the video frames (media timeline; telemetry time = media time + timeOffset). */
export function frameTimesOf(motion: CameraMotion): Float64Array {
  const n = motion.video.frameCount;
  const dt = motion.video.duration / Math.max(1, n);
  const t = new Float64Array(n);
  for (let i = 0; i < n; i++) t[i] = i * dt - motion.timeOffset;
  return t;
}

// ---------------------------------------------------------------------------
// Smoothing

function gaussian1d(v: Float64Array, sigma: number): Float64Array {
  if (sigma < 0.3) return Float64Array.from(v);
  const r = Math.ceil(3 * sigma);
  const k: number[] = [];
  for (let i = -r; i <= r; i++) k.push(Math.exp(-(i * i) / (2 * sigma * sigma)));
  const n = v.length;
  const out = new Float64Array(n);
  for (let t = 0; t < n; t++) {
    let a = 0;
    let w = 0;
    for (let i = -r; i <= r; i++) {
      const u = Math.min(n - 1, Math.max(0, t + i));
      a += k[i + r] * v[u];
      w += k[i + r];
    }
    out[t] = a / w;
  }
  return out;
}

function windowMax(v: Float64Array, radius: number): Float64Array {
  const n = v.length;
  const out = new Float64Array(n);
  for (let t = 0; t < n; t++) {
    let m = -Infinity;
    for (let u = Math.max(0, t - radius); u <= Math.min(n - 1, t + radius); u++) m = Math.max(m, v[u]);
    out[t] = m;
  }
  return out;
}

function windowMin(v: Float64Array, radius: number): Float64Array {
  const n = v.length;
  const out = new Float64Array(n);
  for (let t = 0; t < n; t++) {
    let m = Infinity;
    for (let u = Math.max(0, t - radius); u <= Math.min(n - 1, t + radius); u++) m = Math.min(m, v[u]);
    out[t] = m;
  }
  return out;
}

/** Angular speed per frame (rad/s), from consecutive orientations. */
export function angularSpeed(q: Float64Array, times: Float64Array): Float64Array {
  const n = times.length;
  const w = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    const d = Math.min(1, Math.abs(qdot(qat(q, i - 1), qat(q, i))));
    w[i] = (2 * Math.acos(d)) / Math.max(1e-6, times[i] - times[i - 1]);
  }
  if (n > 1) w[0] = w[1];
  return w;
}

/**
 * Forward-backward SLERP exponential smoothing with a per-frame time
 * constant tau[i] (s). Zero phase: a constant-rate pan comes out without lag.
 */
export function smoothQuats(q: Float64Array, times: Float64Array, tau: Float64Array): Float64Array {
  const n = times.length;
  const fwd = new Float64Array(4 * n);
  const out = new Float64Array(4 * n);
  if (n === 0) return out;
  fwd.set(qat(q, 0), 0);
  for (let i = 1; i < n; i++) {
    const dt = Math.max(1e-6, times[i] - times[i - 1]);
    const a = tau[i] <= 1e-6 ? 1 : 1 - Math.exp(-dt / tau[i]);
    fwd.set(qslerp(qat(fwd, i - 1), qat(q, i), a), 4 * i);
  }
  out.set(qat(fwd, n - 1), 4 * (n - 1));
  for (let i = n - 2; i >= 0; i--) {
    const dt = Math.max(1e-6, times[i + 1] - times[i]);
    const a = tau[i] <= 1e-6 ? 1 : 1 - Math.exp(-dt / tau[i]);
    out.set(qslerp(qat(out, i + 1), qat(fwd, i), a), 4 * i);
  }
  return out;
}

/**
 * Per-frame time constants: tau0 at rest, shrinking as (look-ahead
 * smoothed) angular speed grows past omegaRef. The speed envelope is a
 * rolling maximum then a Gaussian, so the filter loosens *before* a pan
 * starts and tightens again only after it ends.
 */
export function adaptiveTau(speed: Float64Array, fps: number, tau0: number, omegaRef: number): Float64Array {
  const env = gaussian1d(windowMax(gaussian1d(speed, 0.1 * fps), Math.round(0.4 * fps)), 0.25 * fps);
  const tau = new Float64Array(speed.length);
  for (let i = 0; i < speed.length; i++) {
    const r = env[i] / omegaRef;
    tau[i] = tau0 / (1 + r * r);
  }
  return tau;
}

/** Smoothing slider -> rest time constant (s): 0 -> 0, 0.6 -> 0.6 s, 1 -> 2 s. */
export function tauForSmoothing(s: number): number {
  const c = Math.min(1, Math.max(0, s));
  return 2 * c * c * (0.6 + 0.4 * c) / 1;
}

/**
 * RMS of the second difference of orientation (rad/frame²): per-frame
 * rotation increments d_i = log(q_{i-1}⁻¹ q_i) in the camera frame, then
 * |d_i − d_{i−1}|. A constant pan scores 0; shake scores its acceleration.
 */
export function rotationJitter(q: Float64Array): number {
  const n = q.length / 4;
  if (n < 3) return 0;
  let prev: Vec3 | null = null;
  let acc = 0;
  let cnt = 0;
  for (let i = 1; i < n; i++) {
    const d = qlog(qmul(qconj(qat(q, i - 1)), qat(q, i)));
    if (prev) {
      acc += (d[0] - prev[0]) ** 2 + (d[1] - prev[1]) ** 2 + (d[2] - prev[2]) ** 2;
      cnt++;
    }
    prev = d;
  }
  return Math.sqrt(acc / cnt);
}

// ---------------------------------------------------------------------------
// Horizon

/** Rolls q so that the camera's y axis (down) lies in the plane of the view axis and `down`. */
export function levelRoll(q: Quat, down: Vec3): { q: Quat; weight: number } {
  const f = qrot(q, [0, 0, 1]);
  const d = down;
  const dot = f[0] * d[0] + f[1] * d[1] + f[2] * d[2];
  let y: Vec3 = [d[0] - dot * f[0], d[1] - dot * f[1], d[2] - dot * f[2]];
  const len = Math.hypot(y[0], y[1], y[2]);
  // Looking (almost) straight up or down: no horizon to level.
  const weight = Math.min(1, Math.max(0, (len - 0.17) / 0.25));
  if (len < 1e-6) return { q, weight: 0 };
  y = [y[0] / len, y[1] / len, y[2] / len];
  // x = y × z for a right-handed (x right, y down, z forward) frame.
  const x: Vec3 = [y[1] * f[2] - y[2] * f[1], y[2] * f[0] - y[0] * f[2], y[0] * f[1] - y[1] * f[0]];
  const lq = quatFromBasis(x, y, f);
  return { q: qdot(lq, q) < 0 ? [-lq[0], -lq[1], -lq[2], -lq[3]] : lq, weight };
}

/** Rotation whose matrix columns are x, y, z. */
export function quatFromBasis(x: Vec3, y: Vec3, z: Vec3): Quat {
  const m00 = x[0], m01 = y[0], m02 = z[0];
  const m10 = x[1], m11 = y[1], m12 = z[1];
  const m20 = x[2], m21 = y[2], m22 = z[2];
  const tr = m00 + m11 + m22;
  let q: Quat;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    q = [0.25 * s, (m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s];
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    q = [(m21 - m12) / s, 0.25 * s, (m01 + m10) / s, (m02 + m20) / s];
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    q = [(m02 - m20) / s, (m01 + m10) / s, 0.25 * s, (m12 + m21) / s];
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    q = [(m10 - m01) / s, (m02 + m20) / s, (m12 + m21) / s, 0.25 * s];
  }
  return qnorm(q);
}

// ---------------------------------------------------------------------------
// Geometry: output lens, source rotation at a row, border check

export type OutputLens = { lens: LensModel; thMax: number };

/** Output lens at a zoom: the source lens magnified, or a rectilinear lens. */
export function outputLens(src: LensModel, output: "lens" | "rectilinear", rectBase: number, zoom: number, width: number, height: number): LensModel {
  if (output === "rectilinear") {
    const f = src.fx * rectBase * zoom;
    return { kind: "pinhole", width, height, fx: f, fy: f * (src.fy / src.fx), cx: width / 2, cy: height / 2, k: [0, 0, 0, 0], source: "rectilinear" };
  }
  return { ...src, width, height, fx: src.fx * zoom, fy: src.fy * zoom, cx: width / 2, cy: height / 2 };
}

/**
 * Source orientations across one frame's readout: `count` matrices from the
 * top row's capture time to the bottom row's, so a vertex picks (and
 * blends) by its source row instead of searching the telemetry.
 */
export class RowRotations {
  readonly mats: Float64Array;
  readonly count: number;
  constructor(motion: CameraMotion, t: number, count = 9) {
    const ro = motion.readout;
    this.count = ro > 0 ? count : 1;
    this.mats = new Float64Array(9 * this.count);
    for (let b = 0; b < this.count; b++) {
      const f = this.count === 1 ? 0.5 : b / (this.count - 1);
      const q = sampleOrientation(motion.times, motion.quats, t + motion.timeOffset + (f - 0.5) * ro);
      this.mats.set(qmat(q), 9 * b);
    }
  }
  /** Source ray for world ray w at source row fraction fy (0 top .. 1 bottom): Rᵀ w. */
  toSource(w: Vec3, fy: number, out: Vec3): Vec3 {
    const m = this.mats;
    if (this.count === 1) {
      out[0] = m[0] * w[0] + m[3] * w[1] + m[6] * w[2];
      out[1] = m[1] * w[0] + m[4] * w[1] + m[7] * w[2];
      out[2] = m[2] * w[0] + m[5] * w[1] + m[8] * w[2];
      return out;
    }
    const p = Math.min(this.count - 1, Math.max(0, fy * (this.count - 1)));
    const b = Math.min(this.count - 2, Math.floor(p));
    const a = p - b;
    const o0 = 9 * b;
    const o1 = o0 + 9;
    for (let r = 0; r < 3; r++) {
      out[r] =
        (m[o0 + r] * (1 - a) + m[o1 + r] * a) * w[0] +
        (m[o0 + 3 + r] * (1 - a) + m[o1 + 3 + r] * a) * w[1] +
        (m[o0 + 6 + r] * (1 - a) + m[o1 + 6 + r] * a) * w[2];
    }
    return out;
  }
}

/** Output ray (camera frame of the virtual camera) -> source pixel, rolling shutter by fixed-point on the row. */
function mapRay(ray: Vec3, virtMat: number[], rows: RowRotations, src: LensModel, srcThMax: number, out: [number, number]): [number, number] {
  const w: Vec3 = [
    virtMat[0] * ray[0] + virtMat[1] * ray[1] + virtMat[2] * ray[2],
    virtMat[3] * ray[0] + virtMat[4] * ray[1] + virtMat[5] * ray[2],
    virtMat[6] * ray[0] + virtMat[7] * ray[1] + virtMat[8] * ray[2],
  ];
  const s: Vec3 = [0, 0, 0];
  let fy = 0.5;
  const iters = rows.count > 1 ? 3 : 1;
  for (let k = 0; k < iters; k++) {
    rows.toSource(w, fy, s);
    project(src, s, out, srcThMax);
    if (!Number.isFinite(out[1])) return out;
    fy = out[1] / src.height;
  }
  return out;
}

function borderPoints(width: number, height: number, perEdge: number): Float64Array {
  const pts: number[] = [];
  for (let i = 0; i <= perEdge; i++) {
    const f = i / perEdge;
    pts.push(f * width, 0, f * width, height, 0, f * height, width, f * height);
  }
  return Float64Array.from(pts);
}

type Geometry = {
  motion: CameraMotion;
  src: LensModel;
  srcThMax: number;
  output: "lens" | "rectilinear";
  rectBase: number;
  border: Float64Array;
};

function fits(g: Geometry, virt: Quat, rows: RowRotations, zoom: number): boolean {
  const { src } = g;
  const outL = outputLens(src, g.output, g.rectBase, zoom, src.width, src.height);
  const vm = qmat(virt);
  const px: [number, number] = [0, 0];
  // Half a pixel inside: the border between samples bulges slightly through the lens.
  const m = 0.5;
  for (let i = 0; i < g.border.length; i += 2) {
    const ray = unproject(outL, g.border[i], g.border[i + 1]);
    mapRay(ray, vm, rows, src, g.srcThMax, px);
    if (!(px[0] >= m && px[0] <= src.width - m && px[1] >= m && px[1] <= src.height - m)) return false;
  }
  return true;
}

/** Smallest zoom in [lo, hi] at which the output fits; hi + 1 when even hi does not. */
function requiredZoom(g: Geometry, virt: Quat, rows: RowRotations, lo: number, hi: number): number {
  if (fits(g, virt, rows, lo)) return lo;
  if (!fits(g, virt, rows, hi)) return hi + 1;
  let a = lo;
  let b = hi;
  for (let i = 0; i < 18; i++) {
    const m = (a + b) / 2;
    if (fits(g, virt, rows, m)) b = m;
    else a = m;
  }
  return b;
}

/** Rectilinear output: the focal (× source fx) at which the un-rotated view just fits. */
function rectilinearBase(motion: CameraMotion, src: LensModel, srcThMax: number, border: Float64Array): number {
  const g: Geometry = { motion, src, srcThMax, output: "rectilinear", rectBase: 1, border };
  const rows = new RowRotations({ ...motion, readout: 0, times: Float64Array.of(0), quats: Float64Array.of(1, 0, 0, 0) }, 0);
  const z = requiredZoom(g, [1, 0, 0, 0], rows, 0.2, 3);
  return Math.min(3, z);
}

export function smoothZoomTrack(required: Float32Array, windowFrames: number, maxZoom: number): Float32Array {
  const n = required.length;
  const half = Math.max(1, Math.floor(windowFrames / 2));
  const rolling = new Float64Array(n);
  for (let t = 0; t < n; t++) rolling[t] = required[t];
  const mx = windowMax(rolling, half);
  for (let t = 0; t < n; t++) mx[t] = Math.min(maxZoom, mx[t]);
  const g = gaussian1d(mx, Math.max(0.5, windowFrames / 6));
  const out = new Float32Array(n);
  for (let t = 0; t < n; t++) out[t] = Math.min(maxZoom, Math.max(g[t], Math.min(maxZoom, required[t]), 1));
  return out;
}

// ---------------------------------------------------------------------------
// The solve

export function computeGyroPlan(motion: CameraMotion, params: GyroParams): GyroPlan {
  const started = performance.now();
  const times = frameTimesOf(motion);
  const n = times.length;
  const fps = motion.video.fps || 30;
  const src = motion.lens;
  const srcThMax = src.kind === "fisheye" ? maxTheta(src.k) : Math.PI / 2;
  const maxZoom = 1 / (1 - 2 * Math.min(0.45, Math.max(0, params.maxCrop)));
  const border = borderPoints(src.width, src.height, 10);
  const rectBase = params.output === "rectilinear" ? rectilinearBase(motion, src, srcThMax, border) : 1;
  const geo: Geometry = { motion, src, srcThMax, output: params.output, rectBase, border };

  // 1. raw orientation at frame centres
  const raw = new Float64Array(4 * n);
  for (let i = 0; i < n; i++) raw.set(sampleOrientation(motion.times, motion.quats, times[i] + motion.timeOffset), 4 * i);
  qcontinuous(raw);

  // 2. speed-adaptive smoothing
  const speed = angularSpeed(raw, times);
  const tau0 = tauForSmoothing(params.smoothing);
  // Speed at which the time constant has dropped to half: more smoothing
  // also tolerates faster moves before letting go.
  const omegaRef = ((params.omegaRefDeg ?? 25 + 75 * Math.min(1, Math.max(0, params.smoothing))) * Math.PI) / 180;
  const tau = adaptiveTau(speed, fps, tau0, omegaRef);
  let virt = smoothQuats(raw, times, tau);
  // Light path: what a frame falls back to before the raw camera when the budget runs out.
  const light = smoothQuats(raw, times, new Float64Array(n).fill(Math.min(tau0, 0.08)));

  // 3. horizon
  const lock = Math.min(1, Math.max(0, params.horizonLock));
  if (lock > 0 && motion.down) {
    const lv = new Float64Array(4 * n);
    const wts = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const { q, weight } = levelRoll(qat(virt, i), motion.down);
      lv.set(q, 4 * i);
      wts[i] = weight * lock;
    }
    const ws = gaussian1d(wts, 0.3 * fps);
    for (let i = 0; i < n; i++) virt.set(qslerp(qat(virt, i), qat(lv, i), ws[i]), 4 * i);
  }

  if (tau0 <= 1e-6 && lock === 0) virt = Float64Array.from(raw);

  // 4. crop budget: pull-back factor per frame (1 = full correction).
  const rowsAt = (i: number): RowRotations => new RowRotations(motion, times[i]);
  const lambda = new Float64Array(n).fill(1);
  const mu = new Float64Array(n).fill(1); // light -> raw blend when even the light path does not fit
  let limited = 0;
  for (let i = 0; i < n; i++) {
    const rows = rowsAt(i);
    if (fits(geo, qat(virt, i), rows, maxZoom)) continue;
    limited++;
    const target = (l: number): Quat => qslerp(qat(light, i), qat(virt, i), l);
    if (fits(geo, target(0), rows, maxZoom)) {
      let a = 0;
      let b = 1;
      for (let k = 0; k < 14; k++) {
        const m = (a + b) / 2;
        if (fits(geo, target(m), rows, maxZoom)) a = m;
        else b = m;
      }
      lambda[i] = a;
    } else {
      lambda[i] = 0;
      let a = 0;
      let b = 1;
      for (let k = 0; k < 14; k++) {
        const m = (a + b) / 2;
        if (fits(geo, qslerp(qat(raw, i), qat(light, i), m), rows, maxZoom)) a = m;
        else b = m;
      }
      mu[i] = a;
    }
  }
  if (limited > 0) {
    // Smooth the pull-back in time: rolling minimum, then a Gaussian whose
    // support is inside the window, so every frame stays at or below its
    // own limit.
    const rad = Math.max(2, Math.round(0.5 * fps));
    const sig = rad / 3;
    const ls = gaussian1d(windowMin(lambda, rad), sig);
    const ms = gaussian1d(windowMin(mu, rad), sig);
    for (let i = 0; i < n; i++) {
      const lightish = qslerp(qat(raw, i), qat(light, i), Math.min(ms[i], mu[i]));
      virt.set(qslerp(lightish, qat(virt, i), Math.min(ls[i], lambda[i])), 4 * i);
    }
  }
  qcontinuous(virt);

  // 5. zoom
  const required = new Float32Array(n);
  for (let i = 0; i < n; i++) required[i] = Math.min(maxZoom, requiredZoom(geo, qat(virt, i), rowsAt(i), 1, maxZoom));
  const zoom = smoothZoomTrack(required, Math.max(8, Math.round(fps * 3)), maxZoom);

  let meanZoom = 0;
  let maxUsed = 1;
  for (let i = 0; i < n; i++) {
    meanZoom += zoom[i];
    maxUsed = Math.max(maxUsed, zoom[i]);
  }
  const vs = angularSpeed(virt, times);
  let rs = 0;
  let vsum = 0;
  for (let i = 0; i < n; i++) {
    rs += speed[i];
    vsum += vs[i];
  }
  const deg = 180 / Math.PI;
  const rawJitter = rotationJitter(raw) * deg;
  const virtJitter = rotationJitter(virt) * deg;
  return {
    kind: "gyro",
    frameTimes: times,
    virt,
    zoom,
    output: params.output,
    rectBase,
    maxZoom,
    stats: { meanZoom: meanZoom / Math.max(1, n), maxUsedZoom: maxUsed, limitedFrames: limited, solveMs: performance.now() - started, rawSpeed: (rs / Math.max(1, n)) * deg, virtSpeed: (vsum / Math.max(1, n)) * deg, rawJitter, virtJitter },
  };
}

// ---------------------------------------------------------------------------
// Render warp

function bracket(times: Float64Array, t: number): { i0: number; i1: number; f: number } {
  const n = times.length;
  if (n <= 1 || t <= times[0]) return { i0: 0, i1: 0, f: 0 };
  if (t >= times[n - 1]) return { i0: n - 1, i1: n - 1, f: 0 };
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (times[m] <= t) lo = m;
    else hi = m;
  }
  return { i0: lo, i1: hi, f: (t - times[lo]) / (times[hi] - times[lo]) };
}

/** Display-centred px <-> coded px for a track stored rotated `rot` degrees clockwise. */
function displayToCoded(x: number, y: number, rot: number, cw: number, ch: number): [number, number] {
  switch (rot) {
    case 90: return [y + cw / 2, -x + ch / 2];
    case 180: return [-x + cw / 2, -y + ch / 2];
    case 270: return [-y + cw / 2, x + ch / 2];
    default: return [x + cw / 2, y + ch / 2];
  }
}

function codedToDisplay(u: number, v: number, rot: number, cw: number, ch: number): [number, number] {
  const a = u - cw / 2;
  const b = v - ch / 2;
  switch (rot) {
    case 90: return [-b, a];
    case 180: return [-a, -b];
    case 270: return [b, -a];
    default: return [a, b];
  }
}

export type WarpFnLike = (x: number, y: number) => readonly [number, number];

/**
 * The per-vertex warp at media time t: output centred display px -> source
 * centred display px (the renderer's WarpFn contract). Rays the lens cannot
 * see map far outside the frame so the renderer paints them black.
 */
export function gyroWarpFnAtTime(motion: CameraMotion, plan: GyroPlan, t: number, outW?: number, outH?: number): WarpFnLike {
  const { i0, i1, f } = bracket(plan.frameTimes, t);
  const virt = qslerp(qat(plan.virt, i0), qat(plan.virt, i1), f);
  const zoom = plan.zoom[i0] + (plan.zoom[i1] - plan.zoom[i0]) * f;
  const src = motion.lens;
  const rot = motion.video.rotation;
  const cw = src.width;
  const ch = src.height;
  // The renderer's canvas is the display size; scale if it differs from the coded size.
  const dispW = rot === 90 || rot === 270 ? ch : cw;
  const dispH = rot === 90 || rot === 270 ? cw : ch;
  const sx = outW ? dispW / outW : 1;
  const sy = outH ? dispH / outH : 1;
  const outL = outputLens(src, plan.output, plan.rectBase, zoom, cw, ch);
  const srcThMax = src.kind === "fisheye" ? maxTheta(src.k) : Math.PI / 2;
  const rows = new RowRotations(motion, t);
  const vm = qmat(virt);
  const px: [number, number] = [0, 0];
  return (x, y) => {
    const [u, v] = displayToCoded(x * sx, y * sy, rot, cw, ch);
    const ray = unproject(outL, u, v);
    mapRay(ray, vm, rows, src, srcThMax, px);
    if (!Number.isFinite(px[0]) || !Number.isFinite(px[1])) return [1e6, 1e6];
    const [dx, dy] = codedToDisplay(px[0], px[1], rot, cw, ch);
    return [dx / sx, dy / sy];
  };
}

/** Raw camera orientation at time t (for diagnostics/tests). */
export function rawOrientationAt(motion: CameraMotion, t: number): Quat {
  return sampleOrientation(motion.times, motion.quats, t + motion.timeOffset);
}

/** Relative rotation between virtual and raw camera at frame i, degrees (diagnostics). */
export function correctionAngleDeg(motion: CameraMotion, plan: GyroPlan, i: number): number {
  const r = rawOrientationAt(motion, plan.frameTimes[i]);
  const d = qmul(qconj(r), qat(plan.virt, i));
  return (2 * Math.atan2(Math.hypot(d[1], d[2], d[3]), Math.abs(d[0])) * 180) / Math.PI;
}
