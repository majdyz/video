// Hybrid gyro + visual: what the gyro cannot see.
//
// The gyro removes rotation exactly, but a diver's camera also bobs and
// sways (fin kicks, breathing, swimming): a translation, which moves near
// things across the picture (parallax) and leaves the gyro-only output
// gently heaving. This module measures that residual from the picture:
//
//  1. Tracked point pairs (frame t−1 -> t) are derotated with the
//     telemetry: each point becomes a world ray at its row's capture time,
//     and both rays are expressed in the camera at frame t. What remains is
//     exactly what the feature tracker would see on gyro-derotated frames
//     (without resampling them).
//  2. In gnomonic coordinates (x/z, y/z) a sideways camera translation
//     moves a fronto-parallel scene by a uniform shift and a forward one
//     scales it about the centre, so a robust fit of g' = s·g + d per pair
//     gives the residual translation d (focal units) and scale s.
//  3. Confidence gating per pair: enough points spread over the frame,
//     most of them agreeing, a small fit residual, a plausible step, and no
//     sizeable group of points that stays put while the fit moves (fish or
//     particles over a static scene). Frames that fail contribute zero
//     residual, i.e. exactly the gyro-only result for that frame.
//  4. The cumulative residual is smoothed by an L1-optimal path (the v2
//     machinery's LP core) inside per-frame margins that the gyro plan
//     still has left in its crop budget; the difference becomes a small
//     extra rotation of the virtual camera (gyro-stabilize.ts), so the
//     render warp and the crop search stay exactly as they are.

import { solveL1Lp, type L1Term, type LinearConstraint } from "../path-l1.ts";
import { MotionTracker } from "../tracker.ts";
import { unproject, type LensModel } from "./lens.ts";
import { qmat, sampleOrientation } from "./quat.ts";
import type { CameraMotion } from "./telemetry.ts";

/** Residual (non-rotational) motion of a clip, measured on gyro-derotated point pairs. */
export type ResidualMotion = {
  /** Media time of each measured frame (the later frame of its pair). */
  times: Float64Array;
  /** Refractive indices the two estimates use: [air, water]. */
  indices: [number, number];
  /** Per frame and medium (air, water): dx, dy (focal units, camera at t), log scale, then the fit quality. */
  air: Float32Array;
  water: Float32Array;
  /** Per frame and medium: top-half dx, dy, bottom-half dx, dy (focal units; NO_HALF = too few points). Absent in older data. */
  airHalves?: Float32Array;
  waterHalves?: Float32Array;
  /** Tracked points per pair. */
  points: Uint16Array;
  /** Analysis px per focal unit (gnomonic -> analysis pixels at the centre). */
  unitPx: number;
  analysisWidth: number;
  analysisHeight: number;
  trackMsPerFrame: number;
};

/** Floats stored per frame and medium in ResidualMotion.air / .water. */
export const RESIDUAL_STRIDE = 7;
// Layout: 0 dx, 1 dy, 2 log s, 3 inlier fraction, 4 rms (analysis px), 5 coverage (0..1), 6 zero support (0..1).

export type PairResidual = {
  dx: number;
  dy: number;
  logS: number;
  points: number;
  inlierFrac: number;
  rms: number;
  coverage: number;
  zeroSupport: number;
  /** The shift measured on the top and the bottom half of the frame alone (same scale), NO_HALF when a half has too few points. */
  top: [number, number];
  bottom: [number, number];
};

/** Marks a half without enough points in PairResidual.top/.bottom and ResidualMotion halves. */
export const NO_HALF = 1e6;

const EMPTY: PairResidual = { dx: 0, dy: 0, logS: 0, points: 0, inlierFrac: 0, rms: Infinity, coverage: 0, zeroSupport: 0, top: [NO_HALF, NO_HALF], bottom: [NO_HALF, NO_HALF] };

function medianOf(v: Float64Array, n: number): number {
  if (n === 0) return 0;
  const s = Array.from(v.subarray(0, n)).sort((a, b) => a - b);
  return n % 2 ? s[n >> 1] : 0.5 * (s[(n >> 1) - 1] + s[n >> 1]);
}

/**
 * Residual of one pair of frames. Points in coded source px (as from
 * PairCollector), times on the media timeline. `noisePx` is the tracking
 * noise floor in focal units (≈ 0.7 analysis px / unitPx).
 */
export function pairResidual(motion: CameraMotion, lens: LensModel, t0: number, t1: number, px: Float32Array, py: Float32Array, qx: Float32Array, qy: Float32Array, noise: number): PairResidual {
  const m = px.length;
  if (m < 8) return { ...EMPTY, points: m };
  const ro = motion.readout;
  const H = lens.height;
  const W = lens.width;
  const off = motion.timeOffset;
  const rc = qmat(sampleOrientation(motion.times, motion.quats, t1 + off));
  const fixed0 = ro > 0 ? null : qmat(sampleOrientation(motion.times, motion.quats, t0 + off));
  const fixed1 = ro > 0 ? null : rc;
  const ax = new Float64Array(m), ay = new Float64Array(m), bx = new Float64Array(m), by = new Float64Array(m);
  const cell = new Int32Array(m);
  let k = 0;
  const minZ = 0.5; // within 60° of the axis: gnomonic stretch stays below 4x
  for (let i = 0; i < m; i++) {
    const m0 = fixed0 ?? qmat(sampleOrientation(motion.times, motion.quats, t0 + off + (py[i] / H - 0.5) * ro));
    const m1 = fixed1 ?? qmat(sampleOrientation(motion.times, motion.quats, t1 + off + (qy[i] / H - 0.5) * ro));
    const u = unproject(lens, px[i], py[i]);
    const v = unproject(lens, qx[i], qy[i]);
    // world = M u; camera at t (centre row) = Rcᵀ world
    const wx = m0[0] * u[0] + m0[1] * u[1] + m0[2] * u[2];
    const wy = m0[3] * u[0] + m0[4] * u[1] + m0[5] * u[2];
    const wz = m0[6] * u[0] + m0[7] * u[1] + m0[8] * u[2];
    const vx = m1[0] * v[0] + m1[1] * v[1] + m1[2] * v[2];
    const vy = m1[3] * v[0] + m1[4] * v[1] + m1[5] * v[2];
    const vz = m1[6] * v[0] + m1[7] * v[1] + m1[8] * v[2];
    const a0 = rc[0] * wx + rc[3] * wy + rc[6] * wz;
    const a1 = rc[1] * wx + rc[4] * wy + rc[7] * wz;
    const a2 = rc[2] * wx + rc[5] * wy + rc[8] * wz;
    const b0 = rc[0] * vx + rc[3] * vy + rc[6] * vz;
    const b1 = rc[1] * vx + rc[4] * vy + rc[7] * vz;
    const b2 = rc[2] * vx + rc[5] * vy + rc[8] * vz;
    if (a2 < minZ || b2 < minZ) continue;
    ax[k] = a0 / a2;
    ay[k] = a1 / a2;
    bx[k] = b0 / b2;
    by[k] = b1 / b2;
    const cx = Math.min(3, Math.max(0, Math.floor((qx[i] / W) * 4)));
    const cy = Math.min(3, Math.max(0, Math.floor((qy[i] / H) * 4)));
    cell[k] = cy * 4 + cx;
    k++;
  }
  if (k < 8) return { ...EMPTY, points: k };

  // Robust start: per-axis median shift (scale 1).
  const tmp = new Float64Array(k);
  for (let i = 0; i < k; i++) tmp[i] = bx[i] - ax[i];
  let dx = medianOf(tmp, k);
  for (let i = 0; i < k; i++) tmp[i] = by[i] - ay[i];
  let dy = medianOf(tmp, k);
  let s = 1;
  const res = new Float64Array(k);
  const w = new Float64Array(k);
  let sigma = noise;
  for (let it = 0; it < 6; it++) {
    for (let i = 0; i < k; i++) res[i] = Math.hypot(s * ax[i] + dx - bx[i], s * ay[i] + dy - by[i]);
    // Tukey biweight at 3 robust sigmas, never tighter than the noise floor.
    sigma = Math.max(noise, 1.4826 * medianOf(Float64Array.from(res), k));
    const c = 3 * sigma;
    // Weighted least squares for (s, dx, dy): normal equations, 3x3.
    let Sw = 0, Sx = 0, Sy = 0, Sxx = 0, Sbx = 0, Sby = 0, Sxb = 0;
    for (let i = 0; i < k; i++) {
      const r = res[i] / c;
      const wi = r < 1 ? (1 - r * r) ** 2 : 0;
      w[i] = wi;
      if (!wi) continue;
      Sw += wi;
      Sx += wi * ax[i];
      Sy += wi * ay[i];
      Sxx += wi * (ax[i] * ax[i] + ay[i] * ay[i]);
      Sbx += wi * bx[i];
      Sby += wi * by[i];
      Sxb += wi * (ax[i] * bx[i] + ay[i] * by[i]);
    }
    if (Sw < 1e-9) break;
    // [Sxx Sx Sy; Sx Sw 0; Sy 0 Sw] [s dx dy] = [Sxb Sbx Sby]
    const det = Sxx * Sw * Sw - Sx * Sx * Sw - Sy * Sy * Sw;
    if (Math.abs(det) > 1e-12 * Sw * Sw * Sw && Sxx * Sw - Sx * Sx - Sy * Sy > 1e-4 * Sw * Sw) {
      s = (Sxb * Sw * Sw - Sx * Sbx * Sw - Sy * Sby * Sw) / det;
      dx = (Sbx - s * Sx) / Sw;
      dy = (Sby - s * Sy) / Sw;
    } else {
      s = 1;
      dx = (Sbx - Sx) / Sw;
      dy = (Sby - Sy) / Sw;
    }
    s = Math.min(1.1, Math.max(0.9, s));
  }
  // Quality: inliers within 2.5 noise floors (or 3 sigma), their spread and rms.
  const thr = Math.max(2.5 * noise, 2 * sigma);
  let inl = 0;
  let ss = 0;
  let zero = 0;
  const cells = new Uint8Array(16);
  for (let i = 0; i < k; i++) {
    const r = Math.hypot(s * ax[i] + dx - bx[i], s * ay[i] + dy - by[i]);
    if (r < thr) {
      inl++;
      ss += r * r;
      cells[cell[i]] = 1;
    }
    if (Math.hypot(bx[i] - ax[i], by[i] - ay[i]) < 2.5 * noise) zero++;
  }
  let cov = 0;
  for (let i = 0; i < 16; i++) cov += cells[i];
  // Per half (rows of cells 0-1 vs 2-3): near ground and far water or sky
  // differ here when the scene is deep, and one shift cannot steady both.
  const half = (top: boolean): [number, number] => {
    let sw = 0, hx = 0, hy = 0, cnt = 0;
    const c = 3 * Math.max(noise, sigma);
    for (let i = 0; i < k; i++) {
      if ((cell[i] < 8) !== top) continue;
      const rx = bx[i] - s * ax[i];
      const ry = by[i] - s * ay[i];
      const r = Math.hypot(rx - dx, ry - dy) / (2 * c);
      const wi = r < 1 ? (1 - r * r) ** 2 : 0;
      if (!wi) continue;
      sw += wi;
      hx += wi * rx;
      hy += wi * ry;
      cnt++;
    }
    return cnt >= 6 ? [hx / sw, hy / sw] : [NO_HALF, NO_HALF];
  };
  return { dx, dy, logS: Math.log(s), points: k, inlierFrac: inl / k, rms: inl ? Math.sqrt(ss / inl) : Infinity, coverage: cov / 16, zeroSupport: zero / k, top: half(true), bottom: half(false) };
}

/**
 * Tracks the whole clip (gray 0..255 frames at the analysis size, in coded
 * orientation) and records each pair's residual for the air and the water
 * lens. Memory: 22 floats per frame.
 */
export class ResidualCollector {
  private readonly tracker: MotionTracker;
  private readonly motion: CameraMotion;
  private readonly scale: number;
  private readonly lenses: [LensModel, LensModel];
  private readonly noise: number;
  private prevTime: number | null = null;
  private readonly times: number[] = [];
  private readonly air: number[] = [];
  private readonly water: number[] = [];
  private readonly points: number[] = [];
  private readonly airHalves: number[] = [];
  private readonly waterHalves: number[] = [];
  private trackMs = 0;
  readonly aw: number;
  readonly ah: number;
  readonly unitPx: number;

  constructor(motion: CameraMotion, aw: number, ah: number, waterIndex: number) {
    this.motion = motion;
    this.aw = aw;
    this.ah = ah;
    this.scale = motion.lens.width / aw;
    this.tracker = new MotionTracker(aw, ah, { homographyIterations: 0 });
    this.lenses = [
      { ...motion.lens, n: 1 },
      { ...motion.lens, n: waterIndex },
    ];
    this.unitPx = motion.lens.fx / this.scale;
    // Tracking noise floor: ~0.6 analysis px per point.
    this.noise = 0.6 / this.unitPx;
  }

  /** Next frame (gray 0..255 at the analysis size, coded orientation) at media time `time`. */
  push(time: number, gray: Float32Array): void {
    const t0 = performance.now();
    this.tracker.stepGray(gray);
    if (this.prevTime === null) this.addMatches(time, null);
    else {
      const m = this.tracker.lastMatches();
      const s = this.scale;
      // Pixel centres: analysis px i covers source px [i·s, (i+1)·s).
      const map = (v: Float32Array): Float32Array => v.map((x) => (x + 0.5) * s);
      this.addMatches(time, { px: map(m.px), py: map(m.py), qx: map(m.qx), qy: map(m.qy) });
    }
    this.trackMs += performance.now() - t0;
  }

  /**
   * Records the pair (previous frame -> this one) from point matches in
   * coded source px; null for the first frame or a frame without matches.
   */
  addMatches(time: number, m: { px: Float32Array; py: Float32Array; qx: Float32Array; qy: Float32Array } | null): void {
    const prev = this.prevTime;
    this.prevTime = time;
    this.times.push(time);
    const rec = (arr: number[], r: PairResidual): void => {
      arr.push(r.dx, r.dy, r.logS, r.inlierFrac, Number.isFinite(r.rms) ? r.rms * this.unitPx : 99, r.coverage, r.zeroSupport);
    };
    if (prev === null || !m) {
      rec(this.air, EMPTY);
      rec(this.water, EMPTY);
      this.airHalves.push(NO_HALF, NO_HALF, NO_HALF, NO_HALF);
      this.waterHalves.push(NO_HALF, NO_HALF, NO_HALF, NO_HALF);
      this.points.push(0);
      return;
    }
    const ra = pairResidual(this.motion, this.lenses[0], prev, time, m.px, m.py, m.qx, m.qy, this.noise);
    const rw = pairResidual(this.motion, this.lenses[1], prev, time, m.px, m.py, m.qx, m.qy, this.noise);
    rec(this.air, ra);
    rec(this.water, rw);
    this.airHalves.push(...ra.top, ...ra.bottom);
    this.waterHalves.push(...rw.top, ...rw.bottom);
    this.points.push(Math.min(65535, ra.points));
  }

  finish(): ResidualMotion {
    return {
      times: Float64Array.from(this.times),
      indices: [1, this.lenses[1].n ?? 1],
      air: Float32Array.from(this.air),
      water: Float32Array.from(this.water),
      airHalves: Float32Array.from(this.airHalves),
      waterHalves: Float32Array.from(this.waterHalves),
      points: Uint16Array.from(this.points),
      unitPx: this.unitPx,
      analysisWidth: this.aw,
      analysisHeight: this.ah,
      trackMsPerFrame: this.trackMs / Math.max(1, this.times.length),
    };
  }
}

// ---------------------------------------------------------------------------
// Gating

export type GateOptions = {
  minPoints: number;
  minInlierFrac: number;
  minCoverage: number;
  /** Largest believable residual speed, analysis px per second (the rest is fish, sync error or blur). */
  maxSpeedPx: number;
  /** Largest fit rms, analysis px. */
  maxRms: number;
  /** A group this large that stays put while the fit moves vetoes the frame (fish over a static scene). */
  maxZeroSupport: number;
  /**
   * Rejected stretches between usable frames are filled by interpolating
   * the step (constant-velocity guess) up to this long, seconds; longer
   * ones fade the neighbours' step to zero over half a second from each side.
   * Zero steps inside a steady drift would turn every rejected frame into a
   * jerk in the output.
   */
  bridgeSec: number;
};

export const DEFAULT_GATE: GateOptions = { minPoints: 20, minInlierFrac: 0.55, minCoverage: 5 / 16, maxSpeedPx: 160, maxRms: 1.5, maxZeroSupport: 0.3, bridgeSec: 1 };

export type GatedResidual = {
  /** Per plan frame: residual step (analysis px at the centre), 0 where rejected. */
  dx: Float64Array;
  dy: Float64Array;
  accepted: Uint8Array;
  /** Residual frame measured for each plan frame (-1: none). */
  index: Int32Array;
  acceptedFrac: number;
  /** Why frames were dropped (counts). */
  rejected: { missing: number; points: number; inliers: number; coverage: number; rms: number; speed: number; still: number; spike: number };
};

/**
 * Per plan frame residual steps. Frames that fail a check get an
 * interpolated step (bridgeSec), or one fading to zero (gyro-only
 * behaviour) in long stretches and at the ends of the clip.
 */
export function gateResidual(res: ResidualMotion, medium: "air" | "water", frameTimes: Float64Array, fps: number, opts: GateOptions = DEFAULT_GATE): GatedResidual {
  const n = frameTimes.length;
  const data = medium === "water" ? res.water : res.air;
  const S = RESIDUAL_STRIDE;
  const dx = new Float64Array(n);
  const dy = new Float64Array(n);
  const ok = new Uint8Array(n);
  const index = new Int32Array(n).fill(-1);
  const rej = { missing: 0, points: 0, inliers: 0, coverage: 0, rms: 0, speed: 0, still: 0, spike: 0 };
  const dt = 1 / Math.max(1, fps);
  const maxStep = opts.maxSpeedPx * dt;
  const u = res.unitPx;
  // Residual frames by nearest time (both come from the same decode, but be tolerant).
  let j = 0;
  for (let i = 1; i < n; i++) {
    const t = frameTimes[i];
    while (j + 1 < res.times.length && Math.abs(res.times[j + 1] - t) <= Math.abs(res.times[j] - t)) j++;
    if (res.times.length === 0 || Math.abs(res.times[j] - t) > 0.5 * dt || j === 0) {
      rej.missing++;
      continue;
    }
    index[i] = j;
    const o = S * j;
    const x = data[o] * u;
    const y = data[o + 1] * u;
    const step = Math.hypot(x, y);
    if (res.points[j] < opts.minPoints) rej.points++;
    else if (data[o + 3] < opts.minInlierFrac) rej.inliers++;
    else if (data[o + 5] < opts.minCoverage) rej.coverage++;
    else if (data[o + 4] > opts.maxRms) rej.rms++;
    else if (step > maxStep) rej.speed++;
    else if (data[o + 6] > opts.maxZeroSupport && step > 1.5) rej.still++;
    else {
      dx[i] = x;
      dy[i] = y;
      ok[i] = 1;
    }
  }
  // Spikes: a step far from its neighbours' median is one bad pair (blur, a fish crossing).
  const r = 3;
  const keep = Uint8Array.from(ok);
  for (let i = 1; i < n; i++) {
    if (!ok[i]) continue;
    const nx: number[] = [];
    const ny: number[] = [];
    for (let k = Math.max(1, i - r); k <= Math.min(n - 1, i + r); k++) if (k !== i && ok[k]) {
      nx.push(dx[k]);
      ny.push(dy[k]);
    }
    if (nx.length < 3) continue;
    nx.sort((a, b) => a - b);
    ny.sort((a, b) => a - b);
    const mx = nx[nx.length >> 1];
    const my = ny[ny.length >> 1];
    if (Math.hypot(dx[i] - mx, dy[i] - my) > Math.max(2, 0.5 * Math.hypot(mx, my) + 1.5)) {
      keep[i] = 0;
      rej.spike++;
    }
  }
  for (let i = 0; i < n; i++) if (!keep[i]) {
    dx[i] = 0;
    dy[i] = 0;
  }
  // Fill rejected stretches (blur in a kick, a fish crossing, a turn).
  let accepted = 0;
  const maxBridge = Math.max(1, Math.round(opts.bridgeSec * fps));
  const fade = Math.max(1, Math.round(0.5 * fps));
  for (let i = 1; i < n; i++) {
    if (keep[i]) {
      accepted++;
      continue;
    }
    let e = i;
    while (e < n && !keep[e]) e++;
    const len = e - i;
    const hasL = i - 1 >= 1 && keep[i - 1];
    const hasR = e < n;
    for (let k = i; k < e; k++) {
      if (hasL && hasR && len <= maxBridge) {
        const f = (k - i + 1) / (len + 1);
        dx[k] = dx[i - 1] + (dx[e] - dx[i - 1]) * f;
        dy[k] = dy[i - 1] + (dy[e] - dy[i - 1]) * f;
      } else {
        // Fade each neighbour's step out over `fade` frames.
        const wl = hasL ? Math.max(0, 1 - (k - i + 1) / fade) : 0;
        const wr = hasR ? Math.max(0, 1 - (e - k) / fade) : 0;
        dx[k] = (hasL ? dx[i - 1] * wl : 0) + (hasR ? dx[e] * wr : 0);
        dy[k] = (hasL ? dy[i - 1] * wl : 0) + (hasR ? dy[e] * wr : 0);
      }
    }
    i = e - 1;
  }
  return { dx, dy, accepted: keep, index, acceptedFrac: accepted / Math.max(1, n - 1), rejected: rej };
}

// ---------------------------------------------------------------------------
// L1 path for the translation

export type TranslationWeights = { d1: number; d2: number; d3: number; fidelity: number };

/**
 * Translation path weights. Grundmann's 10/1/100 favour a locked-off
 * camera; a diver drifts on purpose, so the first difference is cheap and
 * the jerk (third difference) is what is expensive.
 */
export const TRANSLATION_WEIGHTS: TranslationWeights = { d1: 1, d2: 10, d3: 100, fidelity: 0.02 };

/**
 * L1-optimal 1-D path: minimises w1|D¹s| + w2|D²s| + w3|D³s| + wf|s − c|
 * subject to lo_t ≤ s_t − c_t ≤ hi_t (per-frame box: how far the virtual
 * camera may sit from the measured one; lo ≤ 0 ≤ hi). Solved with the
 * banded interior point of path-l1.ts; units are normalised to the median
 * box half-width.
 */
export function smoothPath1D(c: Float64Array, lo: Float64Array, hi: Float64Array, w: TranslationWeights = TRANSLATION_WEIGHTS): Float64Array {
  const n = c.length;
  const out = Float64Array.from(c);
  if (n < 5) return out;
  const pos: number[] = [];
  for (let i = 0; i < n; i++) if (hi[i] - lo[i] > 0) pos.push(0.5 * (hi[i] - lo[i]));
  if (pos.length < n / 4) return out;
  pos.sort((a, b) => a - b);
  const unit = Math.max(1e-6, pos[pos.length >> 1]);
  // Variables: e_t = (s_t − c_t) / unit; the x0 = 0 start must be strictly inside every box.
  const eps = 1e-4;
  const l = new Float64Array(n);
  const h = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    l[i] = Math.min(-eps, lo[i] / unit);
    h[i] = Math.max(eps, hi[i] / unit);
  }
  const cu = new Float64Array(n);
  for (let i = 0; i < n; i++) cu[i] = c[i] / unit;
  const terms: L1Term[] = [];
  const diff = (order: number, weight: number): void => {
    if (weight <= 0) return;
    const coefs = order === 1 ? [-1, 1] : order === 2 ? [1, -2, 1] : [-1, 3, -3, 1];
    for (let t = 0; t + order < n; t++) {
      const idx = new Int32Array(order + 1);
      const coef = new Float64Array(order + 1);
      let offset = 0;
      for (let k = 0; k <= order; k++) {
        idx[k] = t + k;
        coef[k] = coefs[k];
        offset += coefs[k] * cu[t + k];
      }
      terms.push({ idx, coef, offset, weight });
    }
  };
  diff(1, w.d1);
  diff(2, w.d2);
  diff(3, w.d3);
  if (w.fidelity > 0) for (let t = 0; t < n; t++) terms.push({ idx: Int32Array.of(t), coef: Float64Array.of(1), offset: 0, weight: w.fidelity });
  const cons: LinearConstraint[] = [];
  for (let t = 0; t < n; t++) {
    cons.push({ idx: Int32Array.of(t), coef: Float64Array.of(1), offset: -h[t] });
    cons.push({ idx: Int32Array.of(t), coef: Float64Array.of(-1), offset: l[t] });
  }
  const sol = solveL1Lp(n, terms, cons, new Float64Array(n), { maxIterations: 60 });
  for (let i = 0; i < n; i++) out[i] = (cu[i] + Math.max(l[i], Math.min(h[i], sol.x[i]))) * unit;
  return out;
}

/**
 * RMS of a 2-D track minus its Gaussian (sigma frames): the heave and sway
 * a viewer sees, without the slow drift a deliberate move leaves.
 */
export function wander2(x: Float64Array, y: Float64Array, sigma: number): number {
  const n = x.length;
  if (n < 3) return 0;
  const r = Math.max(1, Math.ceil(2.5 * sigma));
  const k = new Float64Array(2 * r + 1);
  for (let i = -r; i <= r; i++) k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma));
  let acc = 0;
  for (let t = 0; t < n; t++) {
    let sx = 0, sy = 0, sw = 0;
    for (let i = -r; i <= r; i++) {
      const u = Math.min(n - 1, Math.max(0, t + i));
      sx += k[i + r] * x[u];
      sy += k[i + r] * y[u];
      sw += k[i + r];
    }
    acc += (x[t] - sx / sw) ** 2 + (y[t] - sy / sw) ** 2;
  }
  return Math.sqrt(acc / n);
}

/** RMS of the second difference of a 2-D track (the jitter a viewer sees). */
export function jitter2(x: Float64Array, y: Float64Array, mask?: Uint8Array): number {
  let acc = 0;
  let cnt = 0;
  for (let i = 2; i < x.length; i++) {
    if (mask && !(mask[i] && mask[i - 1])) continue;
    acc += (x[i] - 2 * x[i - 1] + x[i - 2]) ** 2 + (y[i] - 2 * y[i - 1] + y[i - 2]) ** 2;
    cnt++;
  }
  return cnt ? Math.sqrt(acc / cnt) : 0;
}
