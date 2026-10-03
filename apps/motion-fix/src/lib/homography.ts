// Plane-projective (homography) algebra and a robust fit, used by the wobble
// suppression stage (Grundmann, Kwatra, Essa 2011 §5.3): the camera path is
// still planned on similarities, but between keyframes the residual motion
// is replayed through per-frame homographies, which do describe the
// perspective part of parallax, refraction through a flat port and the
// residual of in-camera rolling-shutter correction.
//
// A homography is a row-major 3x3 in a Float64Array, normalised so h[8] = 1;
// coordinates are centred on the frame like everything else in the tracker.
// Dependency-free: the DLT null vector comes from a Jacobi eigen-solve of the
// 9x9 normal matrix, which is exact enough once the points are Hartley-
// normalised and runs in microseconds.

import type { Similarity } from "./tracker.ts";

export type Homography = Float64Array;

export function identityH(): Homography {
  const h = new Float64Array(9);
  h[0] = h[4] = h[8] = 1;
  return h;
}

export function homographyFromSimilarity(s: Similarity): Homography {
  const h = new Float64Array(9);
  h[0] = s.a;
  h[1] = -s.b;
  h[2] = s.tx;
  h[3] = s.b;
  h[4] = s.a;
  h[5] = s.ty;
  h[8] = 1;
  return h;
}

/** Applies the homography stored at `h[o..o+9)`; returns [x', y']. */
export function applyHAt(h: Float64Array, o: number, x: number, y: number): [number, number] {
  const w = h[o + 6] * x + h[o + 7] * y + h[o + 8];
  const iw = Math.abs(w) > 1e-12 ? 1 / w : 0;
  return [(h[o] * x + h[o + 1] * y + h[o + 2]) * iw, (h[o + 3] * x + h[o + 4] * y + h[o + 5]) * iw];
}

export function applyH(h: Homography, x: number, y: number): [number, number] {
  return applyHAt(h, 0, x, y);
}

/** Divides by h33 so chained products never drift in scale. */
function normalise(h: Homography): Homography {
  const s = h[8];
  if (Math.abs(s) > 1e-12) for (let i = 0; i < 9; i++) h[i] /= s;
  return h;
}

/** (p ∘ q)(x) = p(q(x)) */
export function composeH(p: Homography, q: Homography): Homography {
  const out = new Float64Array(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[3 * r + c] = p[3 * r] * q[c] + p[3 * r + 1] * q[3 + c] + p[3 * r + 2] * q[6 + c];
    }
  }
  return normalise(out);
}

export function invertH(h: Homography): Homography {
  const [a, b, c, d, e, f, g, k, i] = h;
  const A = e * i - f * k;
  const B = -(d * i - f * g);
  const C = d * k - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-18) return identityH();
  const out = new Float64Array(9);
  out[0] = A / det;
  out[1] = -(b * i - c * k) / det;
  out[2] = (b * f - c * e) / det;
  out[3] = B / det;
  out[4] = (a * i - c * g) / det;
  out[5] = -(a * f - c * d) / det;
  out[6] = C / det;
  out[7] = -(a * k - b * g) / det;
  out[8] = (a * e - b * d) / det;
  return normalise(out);
}

/** Re-expresses the homography in coordinates scaled by `s` (D H D⁻¹ with D = diag(s, s, 1)). */
export function rescaleH(h: Homography, s: number): Homography {
  const out = Float64Array.from(h);
  out[2] *= s;
  out[5] *= s;
  out[6] /= s;
  out[7] /= s;
  return out;
}

// ---------------------------------------------------------------------------
// Estimation

/**
 * Eigenvector of the smallest eigenvalue of a symmetric 9x9 matrix (cyclic
 * Jacobi, destroys `m`). Returns false when the matrix is not usable.
 */
function smallestEigenvector(m: Float64Array, out: Float64Array): boolean {
  const N = 9;
  const v = new Float64Array(N * N);
  for (let i = 0; i < N; i++) v[i * N + i] = 1;
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    let diag = 0;
    for (let p = 0; p < N; p++) {
      diag += m[p * N + p] * m[p * N + p];
      for (let q = p + 1; q < N; q++) off += m[p * N + q] * m[p * N + q];
    }
    if (off <= 1e-26 * Math.max(diag, 1e-300)) break;
    for (let p = 0; p < N - 1; p++) {
      for (let q = p + 1; q < N; q++) {
        const apq = m[p * N + q];
        if (Math.abs(apq) < 1e-300) continue;
        const theta = (m[q * N + q] - m[p * N + p]) / (2 * apq);
        const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        m[p * N + p] -= t * apq;
        m[q * N + q] += t * apq;
        m[p * N + q] = 0;
        m[q * N + p] = 0;
        for (let r = 0; r < N; r++) {
          if (r !== p && r !== q) {
            const arp = m[r * N + p];
            const arq = m[r * N + q];
            m[r * N + p] = c * arp - s * arq;
            m[p * N + r] = m[r * N + p];
            m[r * N + q] = s * arp + c * arq;
            m[q * N + r] = m[r * N + q];
          }
          const vrp = v[r * N + p];
          const vrq = v[r * N + q];
          v[r * N + p] = c * vrp - s * vrq;
          v[r * N + q] = s * vrp + c * vrq;
        }
      }
    }
  }
  let k = 0;
  for (let i = 1; i < N; i++) if (m[i * N + i] < m[k * N + k]) k = i;
  let norm = 0;
  for (let r = 0; r < N; r++) {
    out[r] = v[r * N + k];
    norm += out[r] * out[r];
  }
  return norm > 1e-30 && Number.isFinite(norm);
}

/**
 * Normalised DLT (Hartley & Zisserman alg. 4.2) over the points selected by
 * `idx[0..count)`: p -> q. Writes the homography to `out`; false when the
 * configuration is degenerate.
 */
export function fitHomographyDlt(px: Float32Array, py: Float32Array, qx: Float32Array, qy: Float32Array, idx: Int32Array, count: number, out: Homography): boolean {
  if (count < 4) return false;
  let cpx = 0;
  let cpy = 0;
  let cqx = 0;
  let cqy = 0;
  for (let k = 0; k < count; k++) {
    const i = idx[k];
    cpx += px[i];
    cpy += py[i];
    cqx += qx[i];
    cqy += qy[i];
  }
  cpx /= count;
  cpy /= count;
  cqx /= count;
  cqy /= count;
  let dp = 0;
  let dq = 0;
  for (let k = 0; k < count; k++) {
    const i = idx[k];
    dp += Math.hypot(px[i] - cpx, py[i] - cpy);
    dq += Math.hypot(qx[i] - cqx, qy[i] - cqy);
  }
  if (dp < 1e-9 || dq < 1e-9) return false;
  const sp = (Math.SQRT2 * count) / dp;
  const sq = (Math.SQRT2 * count) / dq;
  // Accumulate AᵀA from the two DLT rows of every correspondence.
  const m = new Float64Array(81);
  const r1 = new Float64Array(9);
  const r2 = new Float64Array(9);
  for (let k = 0; k < count; k++) {
    const i = idx[k];
    const x = (px[i] - cpx) * sp;
    const y = (py[i] - cpy) * sp;
    const u = (qx[i] - cqx) * sq;
    const v = (qy[i] - cqy) * sq;
    r1[0] = -x; r1[1] = -y; r1[2] = -1; r1[3] = 0; r1[4] = 0; r1[5] = 0; r1[6] = x * u; r1[7] = y * u; r1[8] = u;
    r2[0] = 0; r2[1] = 0; r2[2] = 0; r2[3] = -x; r2[4] = -y; r2[5] = -1; r2[6] = x * v; r2[7] = y * v; r2[8] = v;
    for (let a = 0; a < 9; a++) {
      for (let b = a; b < 9; b++) {
        const s = r1[a] * r1[b] + r2[a] * r2[b];
        m[a * 9 + b] += s;
        if (a !== b) m[b * 9 + a] += s;
      }
    }
  }
  const hn = new Float64Array(9);
  if (!smallestEigenvector(m, hn)) return false;
  // H = T_q⁻¹ · Ĥ · T_p with T_p = [sp 0 -sp·cpx; 0 sp -sp·cpy; 0 0 1].
  const tp = new Float64Array([sp, 0, -sp * cpx, 0, sp, -sp * cpy, 0, 0, 1]);
  const tqInv = new Float64Array([1 / sq, 0, cqx, 0, 1 / sq, cqy, 0, 0, 1]);
  const h = composeH(tqInv, composeH(hn, tp));
  if (!Number.isFinite(h[0]) || Math.abs(h[8]) < 1e-12) return false;
  out.set(h);
  return true;
}

export type HomographyFitOptions = {
  /** MSAC inlier threshold (px). */
  threshold: number;
  maxIterations: number;
  minInliers: number;
  /** Triangles spanned by three sample points must exceed this area (px²) so no three are collinear. */
  minTriangleArea: number;
};

export type HomographyFit = {
  h: Homography;
  inliers: number;
  /** Mean reprojection error over all `n` points (not only the inliers). */
  meanError: number;
};

function reprojError(h: Homography, x: number, y: number, u: number, v: number): number {
  const [hx, hy] = applyHAt(h, 0, x, y);
  return Math.hypot(hx - u, hy - v);
}

/**
 * 4-point MSAC homography followed by two rounds of least-squares refit on
 * the inliers. Intended for points that already agree with a similarity to
 * within a couple of pixels, so the inlier ratio is high and the loop ends
 * after a handful of samples.
 */
export function fitHomographyRobust(
  px: Float32Array,
  py: Float32Array,
  qx: Float32Array,
  qy: Float32Array,
  n: number,
  opts: HomographyFitOptions,
  random: () => number,
): HomographyFit | null {
  if (n < Math.max(4, opts.minInliers)) return null;
  const T = opts.threshold;
  const T2 = T * T;
  const sample = new Int32Array(4);
  const cand = new Float64Array(9);
  let best: Homography | null = null;
  let bestScore = Infinity;
  let iterations = opts.maxIterations;
  const triangleOk = (a: number, b: number, c: number): boolean => {
    const area2 = Math.abs((px[b] - px[a]) * (py[c] - py[a]) - (px[c] - px[a]) * (py[b] - py[a]));
    return area2 > 2 * opts.minTriangleArea;
  };
  for (let it = 0; it < iterations; it++) {
    // Four distinct indices.
    let k = 0;
    while (k < 4) {
      const i = Math.floor(random() * n);
      let dup = false;
      for (let j = 0; j < k; j++) if (sample[j] === i) dup = true;
      if (!dup) sample[k++] = i;
    }
    const [a, b, c, d] = sample;
    if (!triangleOk(a, b, c) || !triangleOk(a, b, d) || !triangleOk(a, c, d) || !triangleOk(b, c, d)) continue;
    if (!fitHomographyDlt(px, py, qx, qy, sample, 4, cand)) continue;
    let score = 0;
    let inl = 0;
    for (let i = 0; i < n; i++) {
      const e = reprojError(cand, px[i], py[i], qx[i], qy[i]);
      const e2 = e * e;
      if (e2 < T2) {
        score += e2;
        inl++;
      } else score += T2;
    }
    if (score < bestScore) {
      bestScore = score;
      best = Float64Array.from(cand);
      const ratio = Math.max(0.05, inl / n);
      iterations = Math.min(opts.maxIterations, it + 1 + Math.ceil(Math.log(0.01) / Math.log(1 - ratio ** 4)));
    }
  }
  if (!best) return null;
  // Least-squares refit on the consensus set, twice (the inlier set settles
  // after the first refit).
  const idx = new Int32Array(n);
  let h = best;
  let inliers = 0;
  for (let round = 0; round < 2; round++) {
    inliers = 0;
    for (let i = 0; i < n; i++) if (reprojError(h, px[i], py[i], qx[i], qy[i]) < T) idx[inliers++] = i;
    if (inliers < opts.minInliers) return null;
    const refit = new Float64Array(9);
    if (!fitHomographyDlt(px, py, qx, qy, idx, inliers, refit)) break;
    h = refit;
  }
  inliers = 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const e = reprojError(h, px[i], py[i], qx[i], qy[i]);
    total += e;
    if (e < T) inliers++;
  }
  if (inliers < opts.minInliers) return null;
  return { h, inliers, meanError: total / n };
}

/** Ratio of the smaller to the larger singular value of the affine 2x2 part (1 = conformal). */
export function affineAnisotropy(h: Homography): number {
  const [a, b, , c, d] = h;
  const S = a * a + b * b + c * c + d * d;
  const D = a * d - b * c;
  const disc = Math.sqrt(Math.max(0, S * S - 4 * D * D));
  const hi = (S + disc) / 2;
  const lo = (S - disc) / 2;
  return hi > 0 ? Math.sqrt(Math.max(0, lo) / hi) : 0;
}
