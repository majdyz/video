// Dependency-free sparse motion tracker for Motion Fix.
//
// Per frame pair it estimates one 2-D similarity (rotation, uniform scale,
// translation) that maps the previous analysis image onto the current one.
// The recipe is the classic KLT front-end tuned for underwater footage:
//
//   1. analysis image = green channel + CLAHE (blue water has almost no red
//      and very little contrast; local equalisation gets corners into it),
//   2. Shi-Tomasi corners bucketed on a ~40 px grid so no region of the
//      frame dominates, re-detected incrementally only where tracks died,
//   3. pyramidal Lucas-Kanade (Bouguet 2000: 15x15 window, 4 levels, <= 20
//      Newton iterations) with a forward-backward consistency check,
//   4. per-cell translational RANSAC (fish, particles and caustics disagree
//      with their neighbours and are dropped before the global fit),
//   5. MSAC similarity fit with the previous frame's motion as an extra
//      hypothesis, refined by Tukey IRLS with track-age weights,
//   6. a degrees-of-freedom ladder (similarity -> rigid -> translation ->
//      identity) when inlier support is thin,
//   7. an optional homography upgrade fitted on the similarity's inliers
//      (normalised DLT, 4-point MSAC) and kept only when it explains them
//      measurably better and passes sanity checks; the path solver ignores
//      it, the renderer uses it for wobble suppression.
//
// Everything works on Float32 images in plain typed arrays so it runs in a
// Worker, in Node for the tests, and needs no WASM download.

import { affineAnisotropy, applyH, fitHomographyRobust, type Homography } from "./homography.ts";

/** x' = a*x - b*y + tx ; y' = b*x + a*y + ty */
export type Similarity = { a: number; b: number; tx: number; ty: number };

export const IDENTITY: Similarity = { a: 1, b: 0, tx: 0, ty: 0 };

/** Which model the ladder settled on for a frame, in decreasing confidence. */
export type MotionModel = "similarity" | "rigid" | "translation" | "identity";

export type SimilarityFit = Similarity & {
  model: MotionModel;
  /** Tracks that survived LK + forward-backward + cell RANSAC. */
  tracked: number;
  /** Tracks consistent with the final model. */
  inliers: number;
  /** RMS residual of the inliers in analysis pixels. */
  rms: number;
};

/**
 * Outcome of the homography upgrade: "upgraded" (kept), "similarity" (a sane
 * fit that is not measurably better — the similarity stands in for it when
 * chains are built), "none" (no trustworthy plane-projective model: thin
 * support, or a homography that fits better but does not look like a camera
 * motion).
 */
export type HomographyState = "none" | "similarity" | "upgraded";

export type FrameMotion = SimilarityFit & {
  /** Homography upgrade of the same prev -> current motion (centred analysis px); non-null only when `homographyState` is "upgraded". */
  homography: Homography | null;
  homographyState: HomographyState;
  /** Mean reprojection error the homography saves over the similarity on the inliers (px; 0 unless upgraded). */
  homographyGain: number;
};

export type TrackerOptions = {
  levels: number;
  /** LK window half size (7 -> 15x15). */
  halfWindow: number;
  maxIterations: number;
  /** Stop iterating when the update is below this (pixels). */
  epsilon: number;
  /** Forward-backward disagreement that rejects a track (pixels). */
  fbThreshold: number;
  /** Target cell edge for bucketing / local RANSAC (pixels). */
  cellSize: number;
  /** Live tracks kept per cell. */
  perCell: number;
  minDistance: number;
  /** Shi-Tomasi floor as a fraction of the strongest response in the cell. */
  qualityLevel: number;
  /** Absolute Shi-Tomasi floor (gradient units squared) so flat water yields nothing. */
  minResponse: number;
  /** Local RANSAC agreement (pixels). */
  cellInlierThreshold: number;
  /** MSAC inlier threshold (pixels). */
  msacThreshold: number;
  msacIterations: number;
  irlsIterations: number;
  /** CLAHE clip limit relative to the uniform bin height; <= 0 disables CLAHE. */
  claheClip: number;
  claheTiles: number;
  /** Homography upgrade: MSAC threshold (px). */
  homographyThreshold: number;
  homographyIterations: number;
  /**
   * Mean reprojection error the homography must save over the similarity
   * (px) to be kept. On a pure similarity (synthetic or real reef clips from
   * phones / action cameras) the apparent gain from fitting noise tops out
   * near 0.1 px at 640 px, so 0.2 px is "measurably better".
   */
  homographyGain: number;
  /** |h31|, |h32| limit per pixel at the 640-px analysis scale (scaled for other analysis widths). */
  homographyMaxPerspective: number;
  /** Corner displacement vs the similarity, as a fraction of the frame width. */
  homographyMaxCorner: number;
  /** Smallest allowed singular-value ratio of the affine part (1 = conformal). */
  homographyMinAnisotropy: number;
};

export const DEFAULT_TRACKER_OPTIONS: TrackerOptions = {
  levels: 4,
  halfWindow: 7,
  maxIterations: 20,
  epsilon: 0.03,
  fbThreshold: 1.0,
  cellSize: 40,
  perCell: 3,
  minDistance: 8,
  qualityLevel: 0.02,
  minResponse: 30,
  cellInlierThreshold: 1.5,
  msacThreshold: 2.0,
  msacIterations: 200,
  irlsIterations: 6,
  claheClip: 2.5,
  claheTiles: 8,
  homographyThreshold: 1.0,
  homographyIterations: 100,
  homographyGain: 0.2,
  homographyMaxPerspective: 4e-4,
  homographyMaxCorner: 0.04,
  homographyMinAnisotropy: 0.9,
};

// ---------------------------------------------------------------------------
// Image preparation

/** Picks the analysis size: longest edge 640, aspect preserved, even dims. */
export function analysisSize(srcW: number, srcH: number, longEdge = 640): { width: number; height: number } {
  const scale = Math.min(1, longEdge / Math.max(srcW, srcH));
  const width = Math.max(32, Math.round((srcW * scale) / 2) * 2);
  const height = Math.max(32, Math.round((srcH * scale) / 2) * 2);
  return { width, height };
}

/** Green channel of an RGBA buffer as a Float32 image (0..255). */
export function greenChannel(rgba: Uint8ClampedArray | Uint8Array, out: Float32Array): void {
  const n = out.length;
  for (let i = 0, j = 1; i < n; i++, j += 4) out[i] = rgba[j];
}

/**
 * Contrast-limited adaptive histogram equalisation (Zuiderveld 1994) in
 * place. Tile LUTs are blended bilinearly so tile borders don't show up
 * as fake edges that LK would happily lock onto.
 */
export function clahe(img: Float32Array, w: number, h: number, tiles: number, clip: number): void {
  const tw = Math.ceil(w / tiles);
  const th = Math.ceil(h / tiles);
  const luts = new Uint8Array(tiles * tiles * 256);
  const hist = new Int32Array(256);
  for (let ty = 0; ty < tiles; ty++) {
    for (let tx = 0; tx < tiles; tx++) {
      hist.fill(0);
      const x0 = tx * tw;
      const y0 = ty * th;
      const x1 = Math.min(w, x0 + tw);
      const y1 = Math.min(h, y0 + th);
      const area = (x1 - x0) * (y1 - y0);
      for (let y = y0; y < y1; y++) {
        const row = y * w;
        for (let x = x0; x < x1; x++) hist[img[row + x] | 0]++;
      }
      // Clip and redistribute the excess uniformly (one pass is plenty).
      const limit = Math.max(1, Math.floor((clip * area) / 256));
      let excess = 0;
      for (let i = 0; i < 256; i++) {
        if (hist[i] > limit) {
          excess += hist[i] - limit;
          hist[i] = limit;
        }
      }
      const perBin = Math.floor(excess / 256);
      let rest = excess - perBin * 256;
      for (let i = 0; i < 256; i++) {
        hist[i] += perBin;
        if (rest > 0) {
          hist[i]++;
          rest--;
        }
      }
      const base = (ty * tiles + tx) * 256;
      let cdf = 0;
      for (let i = 0; i < 256; i++) {
        cdf += hist[i];
        luts[base + i] = Math.round((cdf * 255) / area);
      }
    }
  }
  // Bilinear blend between the four nearest tile LUTs (by tile centre). The
  // per-axis tile indices and weights are tabulated once; the pixel loop is
  // then four lookups and a lerp.
  const colT0 = new Int32Array(w);
  const colT1 = new Int32Array(w);
  const colW = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    const fx = (x + 0.5) / tw - 0.5;
    const t0 = Math.max(0, Math.min(tiles - 1, Math.floor(fx)));
    colT0[x] = t0 * 256;
    colT1[x] = Math.min(tiles - 1, t0 + 1) * 256;
    colW[x] = Math.max(0, Math.min(1, fx - t0));
  }
  for (let y = 0; y < h; y++) {
    const fy = (y + 0.5) / th - 0.5;
    const ty0 = Math.max(0, Math.min(tiles - 1, Math.floor(fy)));
    const ty1 = Math.min(tiles - 1, ty0 + 1);
    const wy = Math.max(0, Math.min(1, fy - ty0));
    const row0 = ty0 * tiles * 256;
    const row1 = ty1 * tiles * 256;
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const v = img[row + x] | 0;
      const wx = colW[x];
      const top = luts[row0 + colT0[x] + v] * (1 - wx) + luts[row0 + colT1[x] + v] * wx;
      const bot = luts[row1 + colT0[x] + v] * (1 - wx) + luts[row1 + colT1[x] + v] * wx;
      img[row + x] = top * (1 - wy) + bot * wy;
    }
  }
}

// ---------------------------------------------------------------------------
// Pyramid

export type PyramidLevel = {
  w: number;
  h: number;
  img: Float32Array;
  gx: Float32Array;
  gy: Float32Array;
};

/** [1 4 6 4 1]/16 blur + decimate by two, borders replicated. */
function downsample(src: Float32Array, sw: number, sh: number, dst: Float32Array, dw: number, dh: number, tmp: Float32Array): void {
  // Horizontal pass evaluated at even columns only (tmp is sh x dw).
  for (let y = 0; y < sh; y++) {
    const r = y * sw;
    const o = y * dw;
    for (let x = 0; x < dw; x++) {
      const c = 2 * x;
      const xm2 = c >= 2 ? c - 2 : 0;
      const xm1 = c >= 1 ? c - 1 : 0;
      const xp1 = c + 1 < sw ? c + 1 : sw - 1;
      const xp2 = c + 2 < sw ? c + 2 : sw - 1;
      tmp[o + x] = (src[r + xm2] + 4 * src[r + xm1] + 6 * src[r + c] + 4 * src[r + xp1] + src[r + xp2]) * 0.0625;
    }
  }
  for (let y = 0; y < dh; y++) {
    const c = 2 * y;
    const ym2 = (c >= 2 ? c - 2 : 0) * dw;
    const ym1 = (c >= 1 ? c - 1 : 0) * dw;
    const y0 = c * dw;
    const yp1 = (c + 1 < sh ? c + 1 : sh - 1) * dw;
    const yp2 = (c + 2 < sh ? c + 2 : sh - 1) * dw;
    const o = y * dw;
    for (let x = 0; x < dw; x++) {
      dst[o + x] = (tmp[ym2 + x] + 4 * tmp[ym1 + x] + 6 * tmp[y0 + x] + 4 * tmp[yp1 + x] + tmp[yp2 + x]) * 0.0625;
    }
  }
}

/**
 * Sobel derivatives: the [1 2 1] cross-smoothing doubles as the light blur
 * LK wants, so no separate blur pass is needed. Scaled to true gradient
 * units (per pixel). Borders replicate.
 */
function gradients(level: PyramidLevel): void {
  const { w, h, img, gx, gy } = level;
  for (let y = 0; y < h; y++) {
    const r = y * w;
    const up = (y > 0 ? y - 1 : 0) * w;
    const dn = (y < h - 1 ? y + 1 : h - 1) * w;
    for (let x = 0; x < w; x++) {
      const xl = x > 0 ? x - 1 : 0;
      const xr = x < w - 1 ? x + 1 : w - 1;
      gx[r + x] = (img[up + xr] - img[up + xl] + 2 * (img[r + xr] - img[r + xl]) + img[dn + xr] - img[dn + xl]) * 0.125;
      gy[r + x] = (img[dn + xl] - img[up + xl] + 2 * (img[dn + x] - img[up + x]) + img[dn + xr] - img[up + xr]) * 0.125;
    }
  }
}

export class Pyramid {
  readonly levels: PyramidLevel[] = [];
  private readonly tmp: Float32Array;

  constructor(w: number, h: number, count: number) {
    let lw = w;
    let lh = h;
    for (let i = 0; i < count; i++) {
      const n = lw * lh;
      this.levels.push({ w: lw, h: lh, img: new Float32Array(n), gx: new Float32Array(n), gy: new Float32Array(n) });
      lw = Math.max(2, lw >> 1);
      lh = Math.max(2, lh >> 1);
    }
    this.tmp = new Float32Array(w * h);
  }

  /** Fills every level from a (w x h) gray image. */
  build(gray: Float32Array): void {
    const l0 = this.levels[0];
    l0.img.set(gray);
    gradients(l0);
    for (let i = 1; i < this.levels.length; i++) {
      const src = this.levels[i - 1];
      const dst = this.levels[i];
      downsample(src.img, src.w, src.h, dst.img, dst.w, dst.h, this.tmp);
      gradients(dst);
    }
  }
}

// ---------------------------------------------------------------------------
// Lucas-Kanade

/**
 * Bouguet's pyramidal LK for one point. `out` receives the position in the
 * next image; returns false when the track is lost (window off-image,
 * degenerate gradient matrix, or no convergence at the finest level).
 */
export class LucasKanade {
  private readonly hw: number;
  private readonly winN: number;
  private readonly wi: Float32Array;
  private readonly wx: Float32Array;
  private readonly wy: Float32Array;
  private readonly opts: TrackerOptions;

  constructor(opts: TrackerOptions) {
    this.opts = opts;
    this.hw = opts.halfWindow;
    const side = 2 * this.hw + 1;
    this.winN = side * side;
    this.wi = new Float32Array(this.winN);
    this.wx = new Float32Array(this.winN);
    this.wy = new Float32Array(this.winN);
  }

  /** Full pyramid track from `prev` to `next`, starting at (x, y) with no prior. */
  track(prev: Pyramid, next: Pyramid, x: number, y: number, out: Float32Array, o: number): boolean {
    const top = prev.levels.length - 1;
    let dx = 0;
    let dy = 0;
    for (let L = top; L >= 0; L--) {
      const s = 1 << L;
      const r = this.trackLevel(prev.levels[L], next.levels[L], x / s, y / s, dx, dy);
      if (r === null) return false;
      dx = r[0] * (L > 0 ? 2 : 1);
      dy = r[1] * (L > 0 ? 2 : 1);
    }
    out[o] = x + dx;
    out[o + 1] = y + dy;
    return true;
  }

  /**
   * Finest-level-only refinement from a known displacement: used for the
   * backward check, where the forward result is already a good start.
   */
  refine(prev: Pyramid, next: Pyramid, x: number, y: number, dx: number, dy: number, out: Float32Array, o: number): boolean {
    const r = this.trackLevel(prev.levels[0], next.levels[0], x, y, dx, dy);
    if (r === null) return false;
    out[o] = x + r[0];
    out[o + 1] = y + r[1];
    return true;
  }

  private trackLevel(I: PyramidLevel, J: PyramidLevel, px: number, py: number, dx: number, dy: number): [number, number] | null {
    const hw = this.hw;
    const side = 2 * hw + 1;
    const { w, h } = I;
    // Window must sit fully inside I (with one pixel for the bilinear tap).
    if (px - hw < 1 || py - hw < 1 || px + hw >= w - 2 || py + hw >= h - 2) return null;
    const ix0 = Math.floor(px);
    const iy0 = Math.floor(py);
    const fx = px - ix0;
    const fy = py - iy0;
    const w00 = (1 - fx) * (1 - fy);
    const w10 = fx * (1 - fy);
    const w01 = (1 - fx) * fy;
    const w11 = fx * fy;
    const { wi, wx, wy } = this;
    let gxx = 0;
    let gxy = 0;
    let gyy = 0;
    let k = 0;
    for (let j = -hw; j <= hw; j++) {
      let idx = (iy0 + j) * w + ix0 - hw;
      for (let i = 0; i < side; i++, idx++, k++) {
        const v = I.img[idx] * w00 + I.img[idx + 1] * w10 + I.img[idx + w] * w01 + I.img[idx + w + 1] * w11;
        const gx = I.gx[idx] * w00 + I.gx[idx + 1] * w10 + I.gx[idx + w] * w01 + I.gx[idx + w + 1] * w11;
        const gy = I.gy[idx] * w00 + I.gy[idx + 1] * w10 + I.gy[idx + w] * w01 + I.gy[idx + w + 1] * w11;
        wi[k] = v;
        wx[k] = gx;
        wy[k] = gy;
        gxx += gx * gx;
        gxy += gx * gy;
        gyy += gy * gy;
      }
    }
    const det = gxx * gyy - gxy * gxy;
    // Degenerate texture (edge or flat): the normal equations are useless.
    if (det < 1e-3 || (gxx + gyy - Math.sqrt((gxx - gyy) ** 2 + 4 * gxy * gxy)) * 0.5 < 1e-2 * this.winN) return null;
    const invDet = 1 / det;
    const eps2 = this.opts.epsilon * this.opts.epsilon;
    for (let it = 0; it < this.opts.maxIterations; it++) {
      const qx = px + dx;
      const qy = py + dy;
      if (qx - hw < 1 || qy - hw < 1 || qx + hw >= J.w - 2 || qy + hw >= J.h - 2) return null;
      const jx0 = Math.floor(qx);
      const jy0 = Math.floor(qy);
      const gx = qx - jx0;
      const gy = qy - jy0;
      const v00 = (1 - gx) * (1 - gy);
      const v10 = gx * (1 - gy);
      const v01 = (1 - gx) * gy;
      const v11 = gx * gy;
      let bx = 0;
      let by = 0;
      k = 0;
      for (let j = -hw; j <= hw; j++) {
        let idx = (jy0 + j) * J.w + jx0 - hw;
        for (let i = 0; i < side; i++, idx++, k++) {
          const jv = J.img[idx] * v00 + J.img[idx + 1] * v10 + J.img[idx + J.w] * v01 + J.img[idx + J.w + 1] * v11;
          const d = wi[k] - jv;
          bx += d * wx[k];
          by += d * wy[k];
        }
      }
      const ex = (gyy * bx - gxy * by) * invDet;
      const ey = (gxx * by - gxy * bx) * invDet;
      dx += ex;
      dy += ey;
      if (ex * ex + ey * ey < eps2) break;
    }
    return [dx, dy];
  }
}

// ---------------------------------------------------------------------------
// Corner detection

/**
 * Shi-Tomasi response (min eigenvalue of the 3x3-summed structure tensor)
 * for the whole finest level, separable: per-row 3-wide sums of the three
 * gradient products, then a 3-row sum. ~20 flops per pixel.
 */
function shiTomasi(level: PyramidLevel, out: Float32Array, rowA: Float32Array, rowB: Float32Array, rowC: Float32Array): void {
  const { w, h, gx, gy } = level;
  // rowA/B/C hold the horizontal 3-sums for 3 consecutive rows (ring of 3).
  const fillRow = (y: number, slot: number): void => {
    const r = y * w;
    const o = slot * w;
    for (let x = 1; x < w - 1; x++) {
      let A = 0;
      let B = 0;
      let C = 0;
      for (let i = -1; i <= 1; i++) {
        const a = gx[r + x + i];
        const c = gy[r + x + i];
        A += a * a;
        B += a * c;
        C += c * c;
      }
      rowA[o + x] = A;
      rowB[o + x] = B;
      rowC[o + x] = C;
    }
  };
  out.fill(0);
  if (h < 3) return;
  fillRow(0, 0);
  fillRow(1, 1);
  for (let y = 1; y < h - 1; y++) {
    fillRow(y + 1, (y + 1) % 3);
    const s0 = ((y - 1) % 3) * w;
    const s1 = (y % 3) * w;
    const s2 = ((y + 1) % 3) * w;
    const r = y * w;
    for (let x = 1; x < w - 1; x++) {
      const A = rowA[s0 + x] + rowA[s1 + x] + rowA[s2 + x];
      const B = rowB[s0 + x] + rowB[s1 + x] + rowB[s2 + x];
      const C = rowC[s0 + x] + rowC[s1 + x] + rowC[s2 + x];
      out[r + x] = 0.5 * (A + C - Math.sqrt((A - C) * (A - C) + 4 * B * B));
    }
  }
}

// ---------------------------------------------------------------------------
// Robust similarity fitting

type Fit = { a: number; b: number; tx: number; ty: number; score: number };

/** Weighted least-squares similarity (complex linear regression q = z p + t). */
function fitSimilarity(px: Float32Array, py: Float32Array, qx: Float32Array, qy: Float32Array, wgt: Float32Array, n: number, rigid: boolean): Similarity | null {
  let sw = 0;
  let mpx = 0;
  let mpy = 0;
  let mqx = 0;
  let mqy = 0;
  for (let i = 0; i < n; i++) {
    const w = wgt[i];
    sw += w;
    mpx += w * px[i];
    mpy += w * py[i];
    mqx += w * qx[i];
    mqy += w * qy[i];
  }
  if (sw <= 1e-9) return null;
  mpx /= sw;
  mpy /= sw;
  mqx /= sw;
  mqy /= sw;
  let re = 0;
  let im = 0;
  let pp = 0;
  for (let i = 0; i < n; i++) {
    const w = wgt[i];
    const ax = px[i] - mpx;
    const ay = py[i] - mpy;
    const bx = qx[i] - mqx;
    const by = qy[i] - mqy;
    re += w * (ax * bx + ay * by);
    im += w * (ax * by - ay * bx);
    pp += w * (ax * ax + ay * ay);
  }
  if (pp <= 1e-9) return null;
  let a: number;
  let b: number;
  if (rigid) {
    const m = Math.hypot(re, im);
    if (m <= 1e-12) return null;
    a = re / m;
    b = im / m;
  } else {
    a = re / pp;
    b = im / pp;
  }
  return { a, b, tx: mqx - (a * mpx - b * mpy), ty: mqy - (b * mpx + a * mpy) };
}

function residual2(s: Similarity, px: number, py: number, qx: number, qy: number): number {
  const ex = s.a * px - s.b * py + s.tx - qx;
  const ey = s.b * px + s.a * py + s.ty - qy;
  return ex * ex + ey * ey;
}

// ---------------------------------------------------------------------------
// The tracker

export class MotionTracker {
  readonly width: number;
  readonly height: number;
  readonly opts: TrackerOptions;
  private readonly cellsX: number;
  private readonly cellsY: number;
  private readonly cellW: number;
  private readonly cellH: number;
  private readonly capacity: number;
  private prev: Pyramid;
  private next: Pyramid;
  private readonly gray: Float32Array;
  private readonly response: Float32Array;
  private readonly rowA: Float32Array;
  private readonly rowB: Float32Array;
  private readonly rowC: Float32Array;
  private readonly candidates: Float32Array;
  private readonly lk: LucasKanade;
  private hasPrev = false;
  private previousMotion: Similarity = IDENTITY;
  // Track store (struct of arrays), compacted every frame.
  private n = 0;
  private readonly tx: Float32Array;
  private readonly ty: Float32Array;
  private readonly age: Int32Array;
  // Per-frame scratch.
  private readonly fwd: Float32Array;
  private readonly nx: Float32Array;
  private readonly ny: Float32Array;
  private readonly back: Float32Array;
  private readonly alive: Uint8Array;
  private readonly cellOf: Int32Array;
  private readonly cellCount: Int32Array;
  private readonly fitPx: Float32Array;
  private readonly fitPy: Float32Array;
  private readonly fitQx: Float32Array;
  private readonly fitQy: Float32Array;
  private readonly fitAge: Float32Array;
  private readonly fitIdx: Int32Array;
  private readonly irlsW: Float32Array;
  private readonly res2: Float32Array;
  private readonly sortBuf: Float32Array;
  private readonly hPx: Float32Array;
  private readonly hPy: Float32Array;
  private readonly hQx: Float32Array;
  private readonly hQy: Float32Array;
  private rng = 0x9e3779b9;

  constructor(width: number, height: number, options: Partial<TrackerOptions> = {}) {
    this.width = width;
    this.height = height;
    this.opts = { ...DEFAULT_TRACKER_OPTIONS, ...options };
    this.cellsX = Math.max(2, Math.round(width / this.opts.cellSize));
    this.cellsY = Math.max(2, Math.round(height / this.opts.cellSize));
    this.cellW = width / this.cellsX;
    this.cellH = height / this.cellsY;
    this.capacity = this.cellsX * this.cellsY * this.opts.perCell;
    this.prev = new Pyramid(width, height, this.opts.levels);
    this.next = new Pyramid(width, height, this.opts.levels);
    this.gray = new Float32Array(width * height);
    this.response = new Float32Array(width * height);
    this.rowA = new Float32Array(3 * width);
    this.rowB = new Float32Array(3 * width);
    this.rowC = new Float32Array(3 * width);
    this.candidates = new Float32Array(3 * 64);
    this.lk = new LucasKanade(this.opts);
    const c = this.capacity;
    this.tx = new Float32Array(c);
    this.ty = new Float32Array(c);
    this.age = new Int32Array(c);
    this.fwd = new Float32Array(2 * c);
    this.nx = new Float32Array(c);
    this.ny = new Float32Array(c);
    this.back = new Float32Array(2);
    this.alive = new Uint8Array(c);
    this.cellOf = new Int32Array(c);
    this.cellCount = new Int32Array(this.cellsX * this.cellsY);
    this.fitPx = new Float32Array(c);
    this.fitPy = new Float32Array(c);
    this.fitQx = new Float32Array(c);
    this.fitQy = new Float32Array(c);
    this.fitAge = new Float32Array(c);
    this.fitIdx = new Int32Array(c);
    this.irlsW = new Float32Array(c);
    this.res2 = new Float32Array(c);
    this.sortBuf = new Float32Array(c);
    this.hPx = new Float32Array(c);
    this.hPy = new Float32Array(c);
    this.hQx = new Float32Array(c);
    this.hQy = new Float32Array(c);
  }

  /** Number of live tracks after the last step (diagnostics). */
  get trackCount(): number {
    return this.n;
  }

  /** Feeds an RGBA frame at the analysis size. */
  step(rgba: Uint8ClampedArray | Uint8Array): FrameMotion {
    greenChannel(rgba, this.gray);
    return this.stepGray(this.gray);
  }

  /**
   * Feeds a gray frame (0..255, analysis size). Returns the similarity that
   * maps previous-frame points to this frame, in pixel coordinates centred
   * on the image (so rotation and scale pivot around the frame centre).
   */
  stepGray(gray: Float32Array): FrameMotion {
    if (gray !== this.gray) this.gray.set(gray);
    if (this.opts.claheClip > 0) clahe(this.gray, this.width, this.height, this.opts.claheTiles, this.opts.claheClip);
    this.next.build(this.gray);
    let motion: FrameMotion;
    if (!this.hasPrev) {
      motion = { ...IDENTITY, model: "identity", tracked: 0, inliers: 0, rms: 0, homography: null, homographyState: "none", homographyGain: 0 };
    } else {
      motion = this.estimate();
    }
    this.replenish();
    const swap = this.prev;
    this.prev = this.next;
    this.next = swap;
    this.hasPrev = true;
    this.previousMotion = motion;
    return motion;
  }

  private estimate(): FrameMotion {
    const { opts, prev, next, tx, ty, fwd, nx, ny, alive, back } = this;
    const fb2 = opts.fbThreshold * opts.fbThreshold;
    // 1. LK forward, then a finest-level backward check from the result.
    for (let i = 0; i < this.n; i++) {
      alive[i] = 0;
      if (!this.lk.track(prev, next, tx[i], ty[i], fwd, 2 * i)) continue;
      nx[i] = fwd[2 * i];
      ny[i] = fwd[2 * i + 1];
      const dx = nx[i] - tx[i];
      const dy = ny[i] - ty[i];
      if (!this.lk.refine(next, prev, nx[i], ny[i], -dx, -dy, back, 0)) continue;
      const ex = back[0] - tx[i];
      const ey = back[1] - ty[i];
      if (ex * ex + ey * ey > fb2) continue;
      alive[i] = 1;
    }
    // 2. Local translational RANSAC per cell.
    this.cellRansac();
    // 3. Gather survivors for the global fit, weighted by track age.
    let m = 0;
    for (let i = 0; i < this.n; i++) {
      if (!alive[i]) continue;
      this.fitPx[m] = tx[i];
      this.fitPy[m] = ty[i];
      this.fitQx[m] = nx[i];
      this.fitQy[m] = ny[i];
      this.fitAge[m] = Math.min(this.age[i], 8) / 8;
      this.fitIdx[m] = i;
      m++;
    }
    const fit = this.robustFit(m);
    // 4. Keep only inliers as live tracks, advanced to their new positions,
    //    and collect them (centred) for the homography upgrade. The fit is
    //    centred, the track store is top-left: test in the store's frame.
    let k = 0;
    const thr2 = opts.msacThreshold * opts.msacThreshold;
    const cx = this.width * 0.5;
    const cy = this.height * 0.5;
    const fitTopLeft = this.toTopLeft(fit);
    for (let j = 0; j < m; j++) {
      const i = this.fitIdx[j];
      if (fit.model !== "identity" && residual2(fitTopLeft, tx[i], ty[i], nx[i], ny[i]) > thr2) continue;
      this.hPx[k] = tx[i] - cx;
      this.hPy[k] = ty[i] - cy;
      this.hQx[k] = nx[i] - cx;
      this.hQy[k] = ny[i] - cy;
      tx[k] = nx[i];
      ty[k] = ny[i];
      this.age[k] = this.age[i] + 1;
      k++;
    }
    this.n = k;
    const upgrade = fit.model === "similarity" || fit.model === "rigid" ? this.upgradeToHomography(fit, k) : { state: "none" as const };
    return { ...fit, homography: upgrade.state === "upgraded" ? upgrade.h : null, homographyState: upgrade.state, homographyGain: upgrade.state === "upgraded" ? upgrade.gain : 0 };
  }

  /**
   * Fits a homography on the similarity's inliers and keeps it only when it
   * explains them measurably better (mean reprojection error) and looks
   * like a camera motion: small perspective terms, corners within a few
   * percent of where the similarity puts them, no anisotropic stretch. A
   * fish crossing the frame or a slightly wrong inlier set fails these and
   * the frame falls back to the similarity, which the renderer treats as
   * "no wobble correction across this keyframe interval".
   */
  private upgradeToHomography(sim: Similarity, n: number): { state: "upgraded"; h: Homography; gain: number } | { state: "similarity" | "none" } {
    const { opts, hPx: px, hPy: py, hQx: qx, hQy: qy } = this;
    if (n < 24) return { state: "none" };
    const fit = fitHomographyRobust(px, py, qx, qy, n, {
      threshold: opts.homographyThreshold,
      maxIterations: opts.homographyIterations,
      minInliers: 24,
      minTriangleArea: 0.001 * this.width * this.height,
    }, () => this.random());
    if (!fit) return { state: "none" };
    let simError = 0;
    for (let i = 0; i < n; i++) simError += Math.sqrt(residual2(sim, px[i], py[i], qx[i], qy[i]));
    simError /= n;
    const gain = simError - fit.meanError;
    // No measurable gain: the similarity is as good a homography as any.
    if (gain < opts.homographyGain) return { state: "similarity" };
    const h = fit.h;
    const maxPerspective = (opts.homographyMaxPerspective * 640) / this.width;
    if (Math.abs(h[6]) > maxPerspective || Math.abs(h[7]) > maxPerspective) return { state: "none" };
    if (affineAnisotropy(h) < opts.homographyMinAnisotropy) return { state: "none" };
    const hw = this.width * 0.5;
    const hh = this.height * 0.5;
    const maxCorner = opts.homographyMaxCorner * this.width;
    for (const x of [-hw, hw]) {
      for (const y of [-hh, hh]) {
        const [hx, hy] = applyH(h, x, y);
        const [sx, sy] = apply(sim, x, y);
        if (Math.hypot(hx - sx, hy - sy) > maxCorner) return { state: "none" };
      }
    }
    return { state: "upgraded", h, gain };
  }

  /**
   * In each ~40 px cell, the flow vector supported by most of its neighbours
   * (within 1.5 px) wins and the rest are dropped. Cheap and very effective
   * against fish / particles, which never agree with the reef behind them.
   */
  private cellRansac(): void {
    const { alive, cellOf, cellCount, tx, ty, nx, ny } = this;
    const thr2 = this.opts.cellInlierThreshold ** 2;
    cellCount.fill(0);
    for (let i = 0; i < this.n; i++) {
      cellOf[i] = alive[i] ? this.cellIndex(tx[i], ty[i]) : -1;
      if (alive[i]) cellCount[cellOf[i]]++;
    }
    for (let c = 0; c < cellCount.length; c++) {
      if (cellCount[c] < 2) continue;
      let bestSupport = 0;
      let bestI = -1;
      for (let i = 0; i < this.n; i++) {
        if (cellOf[i] !== c) continue;
        const vx = nx[i] - tx[i];
        const vy = ny[i] - ty[i];
        let support = 0;
        for (let j = 0; j < this.n; j++) {
          if (cellOf[j] !== c) continue;
          const dx = nx[j] - tx[j] - vx;
          const dy = ny[j] - ty[j] - vy;
          if (dx * dx + dy * dy <= thr2) support++;
        }
        if (support > bestSupport) {
          bestSupport = support;
          bestI = i;
        }
      }
      if (bestI < 0 || bestSupport < 2) continue;
      const vx = nx[bestI] - tx[bestI];
      const vy = ny[bestI] - ty[bestI];
      for (let j = 0; j < this.n; j++) {
        if (cellOf[j] !== c) continue;
        const dx = nx[j] - tx[j] - vx;
        const dy = ny[j] - ty[j] - vy;
        if (dx * dx + dy * dy > thr2) alive[j] = 0;
      }
    }
  }

  private cellIndex(x: number, y: number): number {
    const cx = Math.min(this.cellsX - 1, Math.max(0, Math.floor(x / this.cellW)));
    const cy = Math.min(this.cellsY - 1, Math.max(0, Math.floor(y / this.cellH)));
    return cy * this.cellsX + cx;
  }

  private random(): number {
    // xorshift32: deterministic across runs so analyses are reproducible.
    let x = this.rng;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.rng = x >>> 0;
    return this.rng / 4294967296;
  }

  /**
   * MSAC (Torr & Zisserman 2000) over 2-point similarity hypotheses plus the
   * previous frame's motion and identity, then Tukey-biweight IRLS on the
   * inliers. Falls down the DoF ladder when support is thin.
   */
  private robustFit(m: number): SimilarityFit {
    const { fitPx: px, fitPy: py, fitQx: qx, fitQy: qy, fitAge, res2, irlsW } = this;
    const T = this.opts.msacThreshold;
    const T2 = T * T;
    const cx = this.width * 0.5;
    const cy = this.height * 0.5;
    const identity = (): SimilarityFit => ({ ...IDENTITY, model: "identity", tracked: m, inliers: 0, rms: 0 });
    if (m < 4) return identity();

    const score = (s: Similarity): number => {
      let total = 0;
      for (let i = 0; i < m; i++) {
        const r = residual2(s, px[i], py[i], qx[i], qy[i]);
        total += fitAge[i] * (r < T2 ? r : T2);
      }
      return total;
    };
    const prior = this.toTopLeft(this.previousMotion);
    let best: Fit = { ...prior, score: score(prior) };
    const idScore = score(IDENTITY);
    if (idScore < best.score) best = { ...IDENTITY, score: idScore };
    let iterations = this.opts.msacIterations;
    for (let it = 0; it < iterations; it++) {
      const i = Math.floor(this.random() * m);
      let j = Math.floor(this.random() * (m - 1));
      if (j >= i) j++;
      const dpx = px[j] - px[i];
      const dpy = py[j] - py[i];
      const dqx = qx[j] - qx[i];
      const dqy = qy[j] - qy[i];
      const d2 = dpx * dpx + dpy * dpy;
      if (d2 < 25) continue; // too close together to pin down rotation/scale
      const a = (dpx * dqx + dpy * dqy) / d2;
      const b = (dpx * dqy - dpy * dqx) / d2;
      const h: Similarity = { a, b, tx: qx[i] - (a * px[i] - b * py[i]), ty: qy[i] - (b * px[i] + a * py[i]) };
      const sc = score(h);
      if (sc < best.score) {
        best = { ...h, score: sc };
        // Adaptive termination: enough samples for p = 0.99 given the inlier ratio.
        let inl = 0;
        for (let k = 0; k < m; k++) if (residual2(h, px[k], py[k], qx[k], qy[k]) < T2) inl++;
        const ratio = Math.max(0.05, inl / m);
        iterations = Math.min(this.opts.msacIterations, it + 1 + Math.ceil(Math.log(0.01) / Math.log(1 - ratio * ratio)));
      }
    }

    // IRLS refinement on the MSAC consensus.
    let model: Similarity = best;
    let inliers = 0;
    for (let it = 0; it < this.opts.irlsIterations; it++) {
      inliers = 0;
      let cnt = 0;
      for (let i = 0; i < m; i++) {
        res2[i] = residual2(model, px[i], py[i], qx[i], qy[i]);
        if (res2[i] < T2) {
          this.sortBuf[cnt++] = Math.sqrt(res2[i]);
          inliers++;
        }
      }
      if (inliers < 4) break;
      const sub = this.sortBuf.subarray(0, cnt).sort();
      const sigma = Math.max(0.3, 1.4826 * sub[cnt >> 1]);
      const c2 = (4.685 * sigma) ** 2;
      for (let i = 0; i < m; i++) {
        const r2 = res2[i];
        irlsW[i] = r2 < c2 ? fitAge[i] * (1 - r2 / c2) ** 2 : 0;
      }
      const ratio = inliers / m;
      const rigid = !(inliers >= 25 && ratio >= 0.4);
      const refined = fitSimilarity(px, py, qx, qy, irlsW, m, rigid);
      if (!refined) break;
      model = refined;
    }
    let rms = 0;
    inliers = 0;
    for (let i = 0; i < m; i++) {
      const r2 = residual2(model, px[i], py[i], qx[i], qy[i]);
      if (r2 < T2) {
        inliers++;
        rms += r2;
      }
    }
    rms = inliers > 0 ? Math.sqrt(rms / inliers) : 0;
    const ratio = inliers / m;

    // DoF ladder.
    let chosen: MotionModel;
    if (inliers >= 25 && ratio >= 0.4) chosen = "similarity";
    else if (inliers >= 12) chosen = "rigid";
    else if (inliers >= 4) chosen = "translation";
    else return identity();
    if (chosen === "rigid") {
      const r = fitSimilarity(px, py, qx, qy, irlsW, m, true);
      if (r) model = r;
    } else if (chosen === "translation") {
      model = this.weightedMedianTranslation(m);
    }
    const centred = this.toCentred(model, cx, cy);
    return { ...centred, model: chosen, tracked: m, inliers, rms };
  }

  private weightedMedianTranslation(m: number): Similarity {
    const { fitPx: px, fitPy: py, fitQx: qx, fitQy: qy, irlsW, sortBuf } = this;
    const medianOf = (sel: (i: number) => number): number => {
      let cnt = 0;
      for (let i = 0; i < m; i++) if (irlsW[i] > 0) sortBuf[cnt++] = sel(i);
      if (cnt === 0) return 0;
      const s = sortBuf.subarray(0, cnt).sort();
      return s[cnt >> 1];
    };
    return { a: 1, b: 0, tx: medianOf((i) => qx[i] - px[i]), ty: medianOf((i) => qy[i] - py[i]) };
  }

  /** Re-expresses a top-left-origin similarity about the image centre. */
  private toCentred(s: Similarity, cx: number, cy: number): Similarity {
    return {
      a: s.a,
      b: s.b,
      tx: s.tx + (s.a - 1) * cx - s.b * cy,
      ty: s.ty + s.b * cx + (s.a - 1) * cy,
    };
  }

  private toTopLeft(s: Similarity): Similarity {
    const cx = this.width * 0.5;
    const cy = this.height * 0.5;
    return {
      a: s.a,
      b: s.b,
      tx: s.tx - (s.a - 1) * cx + s.b * cy,
      ty: s.ty - s.b * cx - (s.a - 1) * cy,
    };
  }

  /**
   * Detects new corners in cells that have fewer than `perCell` live tracks.
   * Detection runs on pyramid level 1: four times cheaper, and LK only needs
   * "a textured spot" — the 15x15 window at level 0 does not care whether the
   * corner sits a pixel off its centre.
   */
  private replenish(): void {
    const { opts, cellCount, response } = this;
    const level = this.next.levels[1];
    const lw = level.w;
    const margin = Math.ceil((opts.halfWindow + 2) / 2);
    const minD2 = opts.minDistance * opts.minDistance;
    cellCount.fill(0);
    for (let i = 0; i < this.n; i++) cellCount[this.cellIndex(this.tx[i], this.ty[i])]++;
    let needed = false;
    for (let c = 0; c < cellCount.length; c++) if (cellCount[c] < opts.perCell) needed = true;
    if (!needed || this.n >= this.capacity) return;
    shiTomasi(level, response, this.rowA, this.rowB, this.rowC);
    const cand = this.candidates;
    for (let cy = 0; cy < this.cellsY; cy++) {
      for (let cx = 0; cx < this.cellsX; cx++) {
        const c = cy * this.cellsX + cx;
        const want = opts.perCell - cellCount[c];
        if (want <= 0 || this.n >= this.capacity) continue;
        const x0 = Math.max(margin, Math.floor((cx * this.cellW) / 2));
        const y0 = Math.max(margin, Math.floor((cy * this.cellH) / 2));
        const x1 = Math.min(lw - margin, Math.floor(((cx + 1) * this.cellW) / 2));
        const y1 = Math.min(level.h - margin, Math.floor(((cy + 1) * this.cellH) / 2));
        if (x1 - x0 < 3 || y1 - y0 < 3) continue;
        let cellMax = 0;
        for (let y = y0; y < y1; y++) {
          const r = y * lw;
          for (let x = x0; x < x1; x++) if (response[r + x] > cellMax) cellMax = response[r + x];
        }
        // Local threshold (Grundmann 2012 style) so faint texture in blue
        // water still yields corners, with an absolute floor against noise.
        const floor = Math.max(opts.minResponse, opts.qualityLevel * cellMax);
        if (cellMax < floor) continue;
        // Candidates = 3x3 local maxima above the floor, best first.
        let nc = 0;
        for (let y = y0; y < y1 && nc < cand.length / 3; y++) {
          const r = y * lw;
          for (let x = x0; x < x1 && nc < cand.length / 3; x++) {
            const v = response[r + x];
            if (v < floor || !this.isLocalMax(level, x, y, v)) continue;
            cand[3 * nc] = v;
            cand[3 * nc + 1] = 2 * x + 0.5;
            cand[3 * nc + 2] = 2 * y + 0.5;
            nc++;
          }
        }
        this.sortCandidates(nc);
        let picked = 0;
        for (let k = 0; k < nc && picked < want; k++) {
          const x = cand[3 * k + 1];
          const y = cand[3 * k + 2];
          let clear = true;
          for (let i = 0; i < this.n; i++) {
            const dx = this.tx[i] - x;
            const dy = this.ty[i] - y;
            if (dx * dx + dy * dy < minD2) {
              clear = false;
              break;
            }
          }
          if (!clear) continue;
          this.tx[this.n] = x;
          this.ty[this.n] = y;
          this.age[this.n] = 1;
          this.n++;
          picked++;
          if (this.n >= this.capacity) return;
        }
      }
    }
  }

  /** Insertion sort of (response, x, y) triples by response, descending. */
  private sortCandidates(nc: number): void {
    const c = this.candidates;
    for (let i = 1; i < nc; i++) {
      const v = c[3 * i];
      const x = c[3 * i + 1];
      const y = c[3 * i + 2];
      let j = i - 1;
      while (j >= 0 && c[3 * j] < v) {
        c[3 * j + 3] = c[3 * j];
        c[3 * j + 4] = c[3 * j + 1];
        c[3 * j + 5] = c[3 * j + 2];
        j--;
      }
      c[3 * j + 3] = v;
      c[3 * j + 4] = x;
      c[3 * j + 5] = y;
    }
  }

  private isLocalMax(level: PyramidLevel, x: number, y: number, v: number): boolean {
    const w = level.w;
    const r = this.response;
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        if (i === 0 && j === 0) continue;
        const xx = x + i;
        const yy = y + j;
        if (xx < 0 || yy < 0 || xx >= w || yy >= level.h) continue;
        if (r[yy * w + xx] > v) return false;
      }
    }
    return true;
  }
}

// ---------------------------------------------------------------------------
// Similarity algebra shared with the path solver and renderer.

/** (p ∘ q)(x) = p(q(x)) */
export function compose(p: Similarity, q: Similarity): Similarity {
  return {
    a: p.a * q.a - p.b * q.b,
    b: p.b * q.a + p.a * q.b,
    tx: p.a * q.tx - p.b * q.ty + p.tx,
    ty: p.b * q.tx + p.a * q.ty + p.ty,
  };
}

export function invert(s: Similarity): Similarity {
  const d = s.a * s.a + s.b * s.b;
  if (d < 1e-12) return { ...IDENTITY };
  const a = s.a / d;
  const b = -s.b / d;
  return { a, b, tx: -(a * s.tx - b * s.ty), ty: -(b * s.tx + a * s.ty) };
}

export function apply(s: Similarity, x: number, y: number): [number, number] {
  return [s.a * x - s.b * y + s.tx, s.b * x + s.a * y + s.ty];
}
