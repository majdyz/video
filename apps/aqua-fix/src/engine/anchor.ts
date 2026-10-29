// Material anchor: hold the shot's sand where the grade put it (pure; runs in
// the analysis worker and in the eval harness).
//
// Why (user report 27 Oct, ~/video-data/drift/user-drift.mov, a 12 s tilt
// from an all-sand frame to one half open blue water): the clip lock holds the
// grade still, yet the same sand went cyan → neutral → cream in one shot
// (tracked near sand up to 19 ΔE00 in colour alone). The source moved under the
// lock — the camera's auto white balance re-balances as the blue water fills
// the frame, and near sand under the sun carries less cast than the median
// the lock was fitted to — and a strong balance (red ×2.8) amplifies every
// such source change ~3× (source sand moved 6 ΔE00). Re-estimating per frame
// instead follows composition: gray-world votes move with what fills the
// frame (the weed coming into view asked for yellower sand).
//
// What: a closed loop on one material. Sand (and white rubble) is the
// material a seabed shot reliably holds. Its target colour is what the lock
// itself makes of it, measured once per locked shot on the profile's own
// frames (follow.ts shotTarget: the median over the shot, never pinker than
// ANCHOR.pinkMax past neutral), so the look the lock chose is kept and only
// the drift around it is taken out.
// On each analysis thumbnail the bright, grainy, low-chroma pixels on the
// cast side of the veil are found (texture keeps smooth open water out, the
// hue test keeps pink coral out), preferring the bottom 30 % of the frame (the
// near seabed stays in view through a tilt; far sand carries a different
// cast); their output is predicted with the CPU reference of the shader under
// the *locked* parameters (this frame's maps and range), and the red/blue
// gain correction that brings their mean output to the target is solved
// (damped Newton on finite differences, ~64 pixels, a few ms in the worker).
// The engine eases the balance toward lock × correction (follow.ts); frames
// without enough sand hold the last correction, a cut resets it.
//
// Not covered: one balance cannot hold near and far sand at once, so as the
// framing changes their mix the near sand still moves a little (≈3.7 ΔE00 on
// the synthetic tilt in test/drift.test.ts, vs ≈11 with the lock alone).
// Open water, green water, red subjects and topside frames are not anchored
// (follow.ts sceneTrust).
import { gradePixel, resolveContext } from "./apply.ts";
import { SRGB_TO_LINEAR_LUT, linearToOklab, srgbToLinear } from "./color.ts";
import { DEFAULT_SETTINGS, type ClaheLuts, type DepthMap, type GradeParams } from "./params.ts";

export const ANCHOR = {
  /** Candidate: source Oklab chroma below this … */
  cMax: 0.13,
  /** … nearly neutral, or within this hue angle of the veil's … */
  achroma: 0.03,
  hueMax: (75 * Math.PI) / 180,
  /** … linear luminance at least this … */
  lumMin: 0.05,
  /** … local luminance std / mean (r = 2) inside this band: grainy, not smooth water, not an edge. */
  texLo: 0.045,
  texHi: 0.25,
  /** The anchor is the brightest share of the candidates (shadowed sand carries more veil error) … */
  top: 0.3,
  /** … in the lower part of the frame when that holds enough of it: the near seabed stays in view through a
   *  tilt while the far field comes and goes, and the far sand's colour differs from the near sand's. */
  near: 0.3,
  /** Candidate share of the frame where the anchor starts to count, and counts fully. */
  fracLo: 0.06,
  fracHi: 0.15,
  /** Pixels graded per evaluation (a strided subset of the anchor). */
  samples: 64,
  /** Neutral sand (Oklab a, b): B = 0.94·G as the analysis' sand reference (SAND_BLUE_TARGET) … */
  neutral: (() => { const [, a, b] = linearToOklab(1, 1, 0.94); return [a, b] as [number, number]; })(),
  /** … and how far toward red (Oklab a) a shot's target may sit from it (follow.ts shotTarget). */
  pinkMax: 0.006,
  /** Correction clamp (log gain per channel) and the finite-difference step. */
  maxLog: Math.log(1.6),
  eps: 0.04,
  /** Newton iterations, the largest step per iteration (log gain) and the tolerance (Oklab a/b distance). */
  iterations: 4,
  maxStep: 0.2,
  tol: 0.002,
  /** Share of the balance offset the water path takes (analyze.ts WATER_WB_POWER). */
  water: 0.6,
};

export type AnchorResult = {
  /** log(R gain), log(B gain) to multiply into the locked balance. */
  log: [number, number];
  /** Candidate share of the frame (the trust: see ANCHOR.fracLo/fracHi). */
  frac: number;
  /** Predicted mean output (Oklab a, b) of the anchor before and after the correction (diagnostics). */
  before: [number, number];
  after: [number, number];
};

/** Upright thumbnail indices of the anchor pixels and the candidate share (no grade involved). */
export function anchorPixels(rgba: Uint8ClampedArray, w: number, h: number, veilColor: readonly number[]): { idx: number[]; frac: number } {
  const n = w * h;
  const lum = new Float32Array(n), sq = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const y = 0.2126 * SRGB_TO_LINEAR_LUT[rgba[i * 4]] + 0.7152 * SRGB_TO_LINEAR_LUT[rgba[i * 4 + 1]] + 0.0722 * SRGB_TO_LINEAR_LUT[rgba[i * 4 + 2]];
    lum[i] = y; sq[i] = y * y;
  }
  const mL = box(lum, w, h, 2), mS = box(sq, w, h, 2);
  const [, va, vb] = linearToOklab(veilColor[0], veilColor[1], veilColor[2]);
  const vn = Math.hypot(va, vb) || 1;
  const cosMax = Math.cos(ANCHOR.hueMax);
  const cand: number[] = [];
  const yNear = Math.floor(h * (1 - ANCHOR.near));
  // Every other pixel in both directions: the anchor is a large region by definition.
  let grid = 0, gridNear = 0, nearCount = 0;
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      grid++;
      if (y >= yNear) gridNear++;
      const i = y * w + x;
      if (lum[i] < ANCHOR.lumMin) continue;
      const m = mL[i];
      const sd = Math.sqrt(Math.max(0, mS[i] - m * m));
      if (sd < ANCHOR.texLo * m || sd > ANCHOR.texHi * m) continue;
      const [, a, b] = linearToOklab(SRGB_TO_LINEAR_LUT[rgba[i * 4]], SRGB_TO_LINEAR_LUT[rgba[i * 4 + 1]], SRGB_TO_LINEAR_LUT[rgba[i * 4 + 2]]);
      const c = Math.hypot(a, b);
      if (c > ANCHOR.cMax) continue;
      if (c > ANCHOR.achroma && (a * va + b * vb) / (c * vn) < cosMax) continue;
      cand.push(i);
      if (y >= yNear) nearCount++;
    }
  }
  const nearFrac = nearCount / Math.max(1, gridNear);
  const useNear = nearFrac >= ANCHOR.fracHi;
  const pool = useNear ? cand.filter((i) => i >= yNear * w) : cand;
  const frac = useNear ? nearFrac : cand.length / Math.max(1, grid);
  pool.sort((a, b) => lum[b] - lum[a]);
  return { idx: pool.slice(0, Math.ceil(pool.length * ANCHOR.top)), frac };
}

/** The anchor's graded mean colour (Oklab a, b) under `params` with a balance offset `x`, for a fixed pixel pick. */
function anchorMean(rgba: Uint8ClampedArray, w: number, h: number, pick: number[], params: GradeParams, depth: DepthMap, clahe: ClaheLuts) {
  return (x: [number, number]): [number, number] => {
    const ctx = resolveContext({ params: balanceOffset(params, x), settings: DEFAULT_SETTINGS, depth, clahe });
    let r = 0, g = 0, b = 0;
    for (const i of pick) {
      const u = ((i % w) + 0.5) / w, v = (Math.floor(i / w) + 0.5) / h;
      const o = gradePixel(ctx, rgba[i * 4] / 255, rgba[i * 4 + 1] / 255, rgba[i * 4 + 2] / 255, u, v);
      r += srgbToLinear(o[0]); g += srgbToLinear(o[1]); b += srgbToLinear(o[2]);
    }
    const [, a, bb] = linearToOklab(r / pick.length, g / pick.length, b / pick.length);
    return [a, bb];
  };
}

/** The anchor pixels to grade (a strided subset), or null when the frame holds too little anchor. */
function anchorPick(rgba: Uint8ClampedArray, w: number, h: number, params: GradeParams): { pick: number[]; frac: number } | null {
  const { idx, frac } = anchorPixels(rgba, w, h, params.veilColor);
  if (frac < ANCHOR.fracLo || idx.length < 12) return null;
  const stride = Math.max(1, Math.floor(idx.length / ANCHOR.samples));
  const pick: number[] = [];
  for (let k = 0; k < idx.length; k += stride) pick.push(idx[k]);
  return { pick, frac };
}

/** The anchor's graded colour (Oklab a, b) in this frame under `params`, as the grade stands. */
export function anchorColour(rgba: Uint8ClampedArray, w: number, h: number, params: GradeParams, depth: DepthMap, clahe: ClaheLuts): { ab: [number, number]; frac: number } | null {
  const p = anchorPick(rgba, w, h, params);
  return p ? { ab: anchorMean(rgba, w, h, p.pick, params, depth, clahe)([0, 0]), frac: p.frac } : null;
}

/**
 * The balance correction that puts this frame's anchor at `target` (Oklab
 * a, b) under `params` (the locked estimate with this frame's range), graded
 * with this frame's own maps. Null when the frame holds too little anchor.
 */
export function anchorCorrection(rgba: Uint8ClampedArray, w: number, h: number, params: GradeParams, depth: DepthMap, clahe: ClaheLuts, target: readonly [number, number]): AnchorResult | null {
  const p = anchorPick(rgba, w, h, params);
  if (!p) return null;
  const { frac } = p;
  const meanAb = anchorMean(rgba, w, h, p.pick, params, depth, clahe);
  const cl = (v: number) => Math.max(-ANCHOR.maxLog, Math.min(ANCHOR.maxLog, v));
  const err = (v: [number, number]) => Math.hypot(v[0] - target[0], v[1] - target[1]);
  let x: [number, number] = [0, 0];
  let f = meanAb(x);
  const before = f;
  // Damped Newton: the grade saturates (chroma ceiling, gamut, red guard), so a
  // finite-difference step can overshoot; steps are capped and only kept when
  // they bring the anchor closer to the target (else halved).
  for (let it = 0; it < ANCHOR.iterations && err(f) > ANCHOR.tol; it++) {
    const fr = meanAb([x[0] + ANCHOR.eps, x[1]]);
    const fb = meanAb([x[0], x[1] + ANCHOR.eps]);
    // Jacobian columns: d(a, b)/d(log R), d(a, b)/d(log B).
    const j00 = (fr[0] - f[0]) / ANCHOR.eps, j10 = (fr[1] - f[1]) / ANCHOR.eps;
    const j01 = (fb[0] - f[0]) / ANCHOR.eps, j11 = (fb[1] - f[1]) / ANCHOR.eps;
    const det = j00 * j11 - j01 * j10;
    if (!Number.isFinite(det) || Math.abs(det) < 1e-6) break;
    const ea = target[0] - f[0], eb = target[1] - f[1];
    let d0 = (j11 * ea - j01 * eb) / det, d1 = (-j10 * ea + j00 * eb) / det;
    const len = Math.hypot(d0, d1);
    if (len > ANCHOR.maxStep) { d0 *= ANCHOR.maxStep / len; d1 *= ANCHOR.maxStep / len; }
    let accepted = false;
    for (let half = 0; half < 3 && !accepted; half++, d0 /= 2, d1 /= 2) {
      const xn: [number, number] = [cl(x[0] + d0), cl(x[1] + d1)];
      const fn = meanAb(xn);
      if (err(fn) < err(f)) { x = xn; f = fn; accepted = true; }
    }
    if (!accepted) break;
  }
  return { log: x, frac, before, after: f };
}

/**
 * A balance offset (log R gain, log B gain) applied to a parameter set: the
 * object path takes all of it, the water path ANCHOR.water of it (analyze.ts
 * WATER_WB_POWER: water keeps most of its own colour).
 */
export function balanceOffset(p: GradeParams, log: readonly [number, number]): GradeParams {
  if (log[0] === 0 && log[1] === 0) return p;
  const r = Math.exp(log[0]), b = Math.exp(log[1]);
  const rw = Math.exp(log[0] * ANCHOR.water), bw = Math.exp(log[1] * ANCHOR.water);
  return { ...p, wb: [p.wb[0] * r, p.wb[1], p.wb[2] * b], waterWb: [p.waterWb[0] * rw, p.waterWb[1], p.waterWb[2] * bw] };
}

/** Box mean of radius r (clamped edges), separable. */
function box(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) { s += src[y * w + k]; n++; }
      tmp[y * w + x] = s / n;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) { s += tmp[k * w + x]; n++; }
      out[y * w + x] = s / n;
    }
  }
  return out;
}
