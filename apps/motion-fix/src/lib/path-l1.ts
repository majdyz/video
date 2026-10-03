// L1-optimal camera path (Grundmann, Kwatra, Essa, CVPR 2011) solved with a
// banded primal-dual interior-point method.
//
// The path is the per-frame crop-window warp W_t (output -> source frame t,
// a 4-parameter similarity). The virtual camera Q_t = C_t^-1 ∘ W_t must move
// like a tripod / dolly / crane shot, so the LP minimises the weighted L1
// norm of its first, second and third differences:
//
//     min  Σ_t  w1 |D¹_t| + w2 |D²_t| + w3 |D³_t|
//     s.t. proximity:  0.9 ≤ a_t ≤ 1.1,  -0.1 ≤ b_t ≤ 0.1
//          inclusion:  W_t(crop corner) inside the source frame
//
// Differences are expressed in frame t's own pixel coordinates (the paper's
// R_t = F_{t+1} B_{t+1} - B_t), so the solution does not depend on how far the
// cumulative path has drifted. Inside each residual the affine entries (a, b)
// are weighted 100:1 against the translation (the detail most reimplementations
// drop, and it changes the look of the result materially).
//
// Why interior point and not ADMM: an LP has no strongly convex term, so a
// single-rho ADMM converges sublinearly and was measured 250-1500x above the
// optimum after 1000 iterations while looking "feasible". The Newton system of
// the primal-dual method (Boyd & Vandenberghe §11.7) is banded here: after
// eliminating the slack variables each L1 term only couples four consecutive
// frames, giving half-bandwidth 15 on the 4n path variables. Each Newton step
// is therefore O(n) and the whole solve takes milliseconds per thousand
// frames, converging to an exact vertex (Kim, Koh, Boyd, Gorinevsky 2009 use
// the same structure for ℓ1 trend filtering).

import { IDENTITY, compose, invert, type Similarity } from "./tracker.ts";

// ---------------------------------------------------------------------------
// Generic LP core:  minimise Σ_k w_k |a_kᵀx + o_k|  subject to  c_jᵀx + d_j ≤ 0.

export type L1Term = { idx: Int32Array; coef: Float64Array; offset: number; weight: number };
export type LinearConstraint = { idx: Int32Array; coef: Float64Array; offset: number };

export type L1Solution = {
  x: Float64Array;
  objective: number;
  iterations: number;
  /** Final surrogate duality gap (0 at the exact optimum). */
  gap: number;
  converged: boolean;
};

export type L1SolverOptions = {
  maxIterations: number;
  /** Barrier growth factor per iteration (μ in Boyd & Vandenberghe). */
  mu: number;
  /** Stop when the duality gap is below this fraction of the objective. */
  relativeGap: number;
  /** Diagnostics hook, called once per Newton iteration. */
  trace?: (it: number, objective: number, gap: number, step: number) => void;
};

const DEFAULT_SOLVER: L1SolverOptions = { maxIterations: 80, mu: 10, relativeGap: 1e-5 };


/** Symmetric positive-definite band matrix (lower half stored row by row). */
class BandMatrix {
  readonly n: number;
  readonly bw: number;
  readonly data: Float64Array;

  constructor(n: number, bw: number) {
    this.n = n;
    this.bw = bw;
    this.data = new Float64Array(n * (bw + 1));
  }

  clear(): void {
    this.data.fill(0);
  }

  /** In-place Cholesky (L Lᵀ); returns false when not positive definite. */
  factor(): boolean {
    const { n, bw, data } = this;
    for (let j = 0; j < n; j++) {
      let d = data[j * (bw + 1)];
      const kmin = Math.max(0, j - bw);
      for (let k = kmin; k < j; k++) {
        const l = data[j * (bw + 1) + (j - k)];
        d -= l * l;
      }
      if (!(d > 0)) return false;
      const sq = Math.sqrt(d);
      data[j * (bw + 1)] = sq;
      const imax = Math.min(n - 1, j + bw);
      for (let i = j + 1; i <= imax; i++) {
        let s = data[i * (bw + 1) + (i - j)];
        const k0 = Math.max(0, i - bw, kmin);
        for (let k = k0; k < j; k++) s -= data[i * (bw + 1) + (i - k)] * data[j * (bw + 1) + (j - k)];
        data[i * (bw + 1) + (i - j)] = s / sq;
      }
    }
    return true;
  }

  /** Solves L Lᵀ x = b in place after factor(). */
  solve(b: Float64Array): void {
    const { n, bw, data } = this;
    for (let i = 0; i < n; i++) {
      let s = b[i];
      for (let k = Math.max(0, i - bw); k < i; k++) s -= data[i * (bw + 1) + (i - k)] * b[k];
      b[i] = s / data[i * (bw + 1)];
    }
    for (let i = n - 1; i >= 0; i--) {
      let s = b[i];
      const imax = Math.min(n - 1, i + bw);
      for (let k = i + 1; k <= imax; k++) s -= data[k * (bw + 1) + (k - i)] * b[k];
      b[i] = s / data[i * (bw + 1)];
    }
  }
}

/**
 * Rows packed into flat typed arrays with a fixed stride: one object per row
 * costs an indirection per access in the Newton loops, which dominated the
 * profile. Zero-padded entries carry index 0 and coefficient 0.
 */
class Rows {
  readonly count: number;
  readonly stride: number;
  readonly idx: Int32Array;
  readonly coef: Float64Array;
  readonly len: Int32Array;
  readonly offset: Float64Array;
  readonly weight: Float64Array;

  constructor(rows: { idx: Int32Array; coef: Float64Array; offset: number; weight?: number }[]) {
    this.count = rows.length;
    let stride = 1;
    for (const r of rows) stride = Math.max(stride, r.idx.length);
    this.stride = stride;
    this.idx = new Int32Array(rows.length * stride);
    this.coef = new Float64Array(rows.length * stride);
    this.len = new Int32Array(rows.length);
    this.offset = new Float64Array(rows.length);
    this.weight = new Float64Array(rows.length);
    rows.forEach((r, k) => {
      this.idx.set(r.idx, k * stride);
      this.coef.set(r.coef, k * stride);
      this.len[k] = r.idx.length;
      this.offset[k] = r.offset;
      this.weight[k] = r.weight ?? 0;
    });
  }

  /** Row k dotted with x, plus the offset (or without it when `withOffset` is false). */
  dot(k: number, x: Float64Array, withOffset: boolean): number {
    let s = withOffset ? this.offset[k] : 0;
    const base = k * this.stride;
    const end = base + this.len[k];
    for (let p = base; p < end; p++) s += this.coef[p] * x[this.idx[p]];
    return s;
  }

  /** x[idx] += scale * coef for row k. */
  axpy(k: number, scale: number, x: Float64Array): void {
    const base = k * this.stride;
    const end = base + this.len[k];
    for (let p = base; p < end; p++) x[this.idx[p]] += scale * this.coef[p];
  }

  /** H += w * row_k row_kᵀ (lower band storage). */
  addOuter(k: number, w: number, H: BandMatrix): void {
    const { bw, data } = H;
    const base = k * this.stride;
    const end = base + this.len[k];
    for (let p = base; p < end; p++) {
      const i = this.idx[p];
      const wi = w * this.coef[p];
      const rowBase = i * (bw + 1) + i;
      for (let q = base; q < end; q++) {
        const j = this.idx[q];
        if (j <= i) data[rowBase - j] += wi * this.coef[q];
      }
    }
  }

  bandwidth(): number {
    let bw = 0;
    for (let k = 0; k < this.count; k++) {
      const base = k * this.stride;
      let lo = Infinity;
      let hi = -Infinity;
      for (let p = base; p < base + this.len[k]; p++) {
        if (this.idx[p] < lo) lo = this.idx[p];
        if (this.idx[p] > hi) hi = this.idx[p];
      }
      if (this.len[k] && hi - lo > bw) bw = hi - lo;
    }
    return bw;
  }
}

/**
 * Primal-dual interior-point solver for the weighted-L1 LP. `x0` must be
 * strictly feasible for the constraints. The slack variables e_k ≥ |r_k| are
 * handled implicitly: each one is eliminated from the Newton system in closed
 * form, which is what keeps the system banded in x alone.
 */
export function solveL1Lp(
  nVars: number,
  terms: L1Term[],
  cons: LinearConstraint[],
  x0: Float64Array,
  options: Partial<L1SolverOptions> = {},
): L1Solution {
  const opts = { ...DEFAULT_SOLVER, ...options };
  const T = new Rows(terms);
  const C = new Rows(cons);
  const m = T.count;
  const p = C.count;
  const M = 2 * m + p;
  const x = Float64Array.from(x0);
  const e = new Float64Array(m);
  const r = new Float64Array(m); // residual values a_kᵀx + o_k
  const g = new Float64Array(p); // constraint values c_jᵀx + d_j
  const lam = new Float64Array(M);
  const s = new Float64Array(M); // slacks = -g_i > 0
  const H = new BandMatrix(nVars, Math.max(T.bandwidth(), C.bandwidth()));
  const q = new Float64Array(nVars);
  const dx = new Float64Array(nVars);
  const de = new Float64Array(m);
  const dlam = new Float64Array(M);
  const ds = new Float64Array(M);
  const tau = new Float64Array(M); // complementarity targets λ_i s_i → τ_i
  const dsAff = new Float64Array(M);
  const dlamAff = new Float64Array(M);
  const dterm = new Float64Array(M); // d_i = λ_i / s_i
  const rdual = new Float64Array(nVars + m);

  const evaluate = (): boolean => {
    let feasible = true;
    for (let k = 0; k < m; k++) {
      r[k] = T.dot(k, x, true);
      s[2 * k] = e[k] - r[k];
      s[2 * k + 1] = e[k] + r[k];
      if (s[2 * k] <= 0 || s[2 * k + 1] <= 0) feasible = false;
    }
    for (let j = 0; j < p; j++) {
      g[j] = C.dot(j, x, true);
      s[2 * m + j] = -g[j];
      if (s[2 * m + j] <= 0) feasible = false;
    }
    return feasible;
  };

  /** ∞-norm of the dual residual ∇f + Σ λ_i ∇g_i. */
  const dualResidual = (): number => {
    rdual.fill(0);
    for (let k = 0; k < m; k++) {
      T.axpy(k, lam[2 * k] - lam[2 * k + 1], rdual);
      rdual[nVars + k] = T.weight[k] - lam[2 * k] - lam[2 * k + 1];
    }
    for (let j = 0; j < p; j++) C.axpy(j, lam[2 * m + j], rdual);
    let worst = 0;
    for (let i = 0; i < rdual.length; i++) worst = Math.max(worst, Math.abs(rdual[i]));
    return worst;
  };

  /**
   * Newton direction for the system { dual residual = 0, λ_i s_i = τ_i }
   * using the already factored H. Fills dx, de, dlam, ds.
   */
  const newtonStep = (): void => {
    q.fill(0);
    for (let k = 0; k < m; k++) {
      const d1 = dterm[2 * k];
      const d2 = dterm[2 * k + 1];
      const qe = -T.weight[k] + tau[2 * k] / s[2 * k] + tau[2 * k + 1] / s[2 * k + 1];
      de[k] = qe;
      T.axpy(k, -(tau[2 * k] / s[2 * k] - tau[2 * k + 1] / s[2 * k + 1]) - ((d2 - d1) / (d1 + d2)) * qe, q);
    }
    for (let j = 0; j < p; j++) C.axpy(j, -tau[2 * m + j] / s[2 * m + j], q);
    dx.set(q);
    H.solve(dx);
    for (let k = 0; k < m; k++) {
      const d1 = dterm[2 * k];
      const d2 = dterm[2 * k + 1];
      const adx = T.dot(k, dx, false);
      de[k] = (de[k] - (d2 - d1) * adx) / (d1 + d2);
      // Δλ_i = -λ_i + τ_i/s_i + (λ_i/s_i) ∇g_iᵀΔz, and s_i moves by -∇g_iᵀΔz.
      dlam[2 * k] = -lam[2 * k] + tau[2 * k] / s[2 * k] + d1 * (adx - de[k]);
      dlam[2 * k + 1] = -lam[2 * k + 1] + tau[2 * k + 1] / s[2 * k + 1] + d2 * (-adx - de[k]);
      ds[2 * k] = de[k] - adx;
      ds[2 * k + 1] = de[k] + adx;
    }
    for (let j = 0; j < p; j++) {
      const i = 2 * m + j;
      const cdx = C.dot(j, dx, false);
      dlam[i] = -lam[i] + tau[i] / s[i] + dterm[i] * cdx;
      ds[i] = -cdx;
    }
  };

  /** Largest step in [0, 1] keeping every λ_i and s_i positive. */
  const maxStep = (dl: Float64Array, dsl: Float64Array): number => {
    let step = 1;
    for (let i = 0; i < M; i++) {
      if (dl[i] < 0) step = Math.min(step, -lam[i] / dl[i]);
      if (dsl[i] < 0) step = Math.min(step, -s[i] / dsl[i]);
    }
    return step;
  };

  // Initial point. Each L1 term's slack pair gets λ = w_k/2 on both sides,
  // which makes the e_k rows of the dual residual vanish exactly; e_k sits a
  // typical residual above |r_k| so complementarity λ·s is balanced; the
  // constraint duals take the same complementarity level. Starting instead
  // from λ = 1 leaves a dual residual of 1e4 on the heavy terms and the
  // first Newton steps are ~1e-6 long.
  evaluate();
  let meanAbs = 0;
  for (let k = 0; k < m; k++) meanAbs += Math.abs(r[k]);
  meanAbs = m > 0 ? meanAbs / m : 0;
  const delta = 0.5 * meanAbs + 1e-6;
  for (let k = 0; k < m; k++) e[k] = Math.abs(r[k]) + delta;
  if (!evaluate()) throw new Error("L1 solver: initial point violates a constraint");
  let mu0 = 0;
  for (let k = 0; k < m; k++) {
    lam[2 * k] = T.weight[k] / 2;
    lam[2 * k + 1] = T.weight[k] / 2;
    mu0 += (T.weight[k] / 2) * delta;
  }
  mu0 = m > 0 ? mu0 / m : 1;
  for (let j = 0; j < p; j++) lam[2 * m + j] = mu0 / s[2 * m + j];

  let objective = 0;
  let gap = Infinity;
  let it = 0;
  let converged = false;
  let maxWeight = 1;
  for (let k = 0; k < m; k++) maxWeight = Math.max(maxWeight, T.weight[k]);
  for (; it < opts.maxIterations; it++) {
    objective = 0;
    for (let k = 0; k < m; k++) objective += T.weight[k] * Math.abs(r[k]);
    gap = 0;
    for (let i = 0; i < M; i++) gap += lam[i] * s[i];
    // The dual residual floors at ~1e-5 of the heaviest weight: near the
    // vertex the Newton system mixes d_i = λ_i/s_i from 1e-9 to 1e13 and
    // Cholesky cannot do better in double precision. The objective is
    // stable to five digits by then, which is far below a pixel.
    if (gap <= opts.relativeGap * Math.max(1, objective) && dualResidual() <= 1e-4 * maxWeight) {
      converged = true;
      break;
    }
    const mu = gap / M;

    // Reduced normal equations H = Σ d_i ∇g_i ∇g_iᵀ with the slack variables
    // eliminated: each L1 term contributes 4 d1 d2 / (d1 + d2) a aᵀ.
    H.clear();
    for (let k = 0; k < m; k++) {
      dterm[2 * k] = lam[2 * k] / s[2 * k];
      dterm[2 * k + 1] = lam[2 * k + 1] / s[2 * k + 1];
      const d1 = dterm[2 * k];
      const d2 = dterm[2 * k + 1];
      T.addOuter(k, (4 * d1 * d2) / (d1 + d2), H);
    }
    for (let j = 0; j < p; j++) {
      dterm[2 * m + j] = lam[2 * m + j] / s[2 * m + j];
      C.addOuter(j, dterm[2 * m + j], H);
    }
    // Tiny ridge: keeps the factorisation alive when a parameter is pinned
    // only through nearly-inactive constraints.
    for (let i = 0; i < nVars; i++) H.data[i * (H.bw + 1)] += 1e-12 * (1 + Math.abs(H.data[i * (H.bw + 1)]));
    if (!H.factor()) break;

    // Mehrotra predictor-corrector: the affine step (τ = 0) measures how far
    // the pure Newton step can go; the centering σ = (μ_aff/μ)³ and the
    // second-order term Δs_aff Δλ_aff then shape the real step. Same
    // factorisation, two solves.
    tau.fill(0);
    newtonStep();
    const alphaAff = maxStep(dlam, ds);
    let muAff = 0;
    for (let i = 0; i < M; i++) muAff += (s[i] + alphaAff * ds[i]) * (lam[i] + alphaAff * dlam[i]);
    muAff /= M;
    const sigma = Math.min(1, (muAff / mu) ** 3);
    dsAff.set(ds);
    dlamAff.set(dlam);
    for (let i = 0; i < M; i++) tau[i] = sigma * mu - dsAff[i] * dlamAff[i];
    newtonStep();
    let step = Math.min(1, 0.99 * maxStep(dlam, ds));
    if (step < 0.1 * alphaAff) {
      // The second-order term misjudged the curvature; fall back to plain
      // centering, which is always a usable direction.
      for (let i = 0; i < M; i++) tau[i] = sigma * mu;
      newtonStep();
      step = Math.min(1, 0.99 * maxStep(dlam, ds));
    }

    for (let i = 0; i < nVars; i++) x[i] += step * dx[i];
    for (let k = 0; k < m; k++) e[k] += step * de[k];
    for (let i = 0; i < M; i++) lam[i] += step * dlam[i];
    evaluate();
    opts.trace?.(it, objective, gap, step);
    if (step < 1e-10) break;
  }
  objective = 0;
  for (let k = 0; k < m; k++) objective += T.weight[k] * Math.abs(T.dot(k, x, true));
  return { x, objective, iterations: it, gap, converged };
}

// ---------------------------------------------------------------------------
// Camera-path problem

export type PathWeights = {
  /** Weights of the first, second and third difference terms. */
  d1: number;
  d2: number;
  d3: number;
  /** Multiplier on the (a, b) entries relative to (tx, ty) inside each residual. */
  affine: number;
  /**
   * Weight per pixel of |W_t − I| (translation, and scale/rotation measured at
   * the frame edge). The paper has no such term: with a fixed crop every
   * feasible path costs the same crop. With adaptive zoom it is the
   * tie-breaker that keeps the window centred and un-zoomed whenever the
   * smoothness terms do not care, and it makes long drifts get followed
   * instead of held until the budget runs out.
   */
  fidelity: number;
};

export const GRUNDMANN_WEIGHTS: PathWeights = { d1: 10, d2: 1, d3: 100, affine: 100, fidelity: 0.1 };

export type PathProblem = {
  /** Frame-to-frame motions M_t (previous -> current, centred coordinates); M_0 is ignored. */
  motions: Similarity[];
  /** Frame half extents in the same units as the motions' translation. */
  halfWidth: number;
  halfHeight: number;
  /** Crop window half extents (must be strictly inside the frame). */
  cropHalfWidth: number;
  cropHalfHeight: number;
  weights?: PathWeights;
  /** Warps for the first `fixed.length` frames, held fixed (window seams). */
  fixed?: Similarity[];
};

/** Parameter-space linear map of "F ∘ (·)" for a known similarity F. */
function leftMultiplyMatrix(f: Similarity): Float64Array {
  // Row-major 4x4 acting on (a, b, tx, ty); the constant part is (0, 0, f.tx, f.ty).
  return Float64Array.from([
    f.a, -f.b, 0, 0,
    f.b, f.a, 0, 0,
    0, 0, f.a, -f.b,
    0, 0, f.b, f.a,
  ]);
}

/**
 * A linear form over the 4-parameter warps of frames t0..t0+3 plus a
 * constant: coef[4*(t - t0) + c] multiplies parameter c of frame t.
 */
type Form = { t0: number; coef: Float64Array; offset: number };

function emptyForm(t0: number): Form {
  return { t0, coef: new Float64Array(16), offset: 0 };
}

/** Residual R_t = F_{t+1} ∘ W_{t+1} − W_t as four forms (one per parameter), based at t. */
function residualForms(F: Similarity, t: number): Form[] {
  const L = leftMultiplyMatrix(F);
  const forms: Form[] = [];
  for (let c = 0; c < 4; c++) {
    const f = emptyForm(t);
    for (let k = 0; k < 4; k++) f.coef[4 + k] = L[c * 4 + k];
    f.coef[c] -= 1;
    f.offset = c === 2 ? F.tx : c === 3 ? F.ty : 0;
    forms.push(f);
  }
  return forms;
}

/** Transports forms by the linear part of F (no constant), rebased to t0. */
function transport(forms: Form[], F: Similarity, t0: number): Form[] {
  const L = leftMultiplyMatrix(F);
  const out: Form[] = [];
  for (let c = 0; c < 4; c++) {
    const f = emptyForm(t0);
    for (let k = 0; k < 4; k++) {
      const w = L[c * 4 + k];
      if (w === 0) continue;
      const src = forms[k];
      const shift = 4 * (src.t0 - t0);
      for (let i = 0; i < 16; i++) if (src.coef[i] !== 0) f.coef[i + shift] += w * src.coef[i];
      f.offset += w * src.offset;
    }
    out.push(f);
  }
  return out;
}

function combine(t0: number, parts: { form: Form; scale: number }[]): Form {
  const f = emptyForm(t0);
  for (const { form, scale } of parts) {
    const shift = 4 * (form.t0 - t0);
    for (let i = 0; i < 16; i++) if (form.coef[i] !== 0) f.coef[i + shift] += scale * form.coef[i];
    f.offset += scale * form.offset;
  }
  return f;
}

/** Converts a form to a solver term over the free frames, folding fixed frames into the offset. */
function toSparse(form: Form, nFixed: number, fixed: Float64Array): { idx: Int32Array; coef: Float64Array; offset: number } {
  const idx: number[] = [];
  const coef: number[] = [];
  let offset = form.offset;
  for (let i = 0; i < 16; i++) {
    const c = form.coef[i];
    if (c === 0) continue;
    const frame = form.t0 + (i >> 2);
    const param = i & 3;
    if (frame < nFixed) offset += c * fixed[4 * frame + param];
    else {
      idx.push(4 * (frame - nFixed) + param);
      coef.push(c);
    }
  }
  return { idx: Int32Array.from(idx), coef: Float64Array.from(coef), offset };
}

export type PathSolution = {
  /** Output -> source warp per frame, centred coordinates. */
  warps: Similarity[];
  objective: number;
  iterations: number;
  converged: boolean;
};

/**
 * Builds and solves the Grundmann LP for one window. The virtual camera's
 * differences are penalised in frame-t coordinates (exact transport through
 * the measured motions, so the window may drift or zoom freely).
 */
export function solvePathWindow(problem: PathProblem, solver: Partial<L1SolverOptions> = {}): PathSolution {
  const n = problem.motions.length;
  const w = problem.weights ?? GRUNDMANN_WEIGHTS;
  // Translations are solved in units of the frame half-width so every
  // coefficient and variable is O(1); otherwise the Newton system mixes
  // 1e-3 affine entries with 1e2 pixel offsets and Cholesky loses the
  // direction long before the duality gap closes. Weights are scaled to
  // keep the objective identical to the pixel-unit formulation.
  const unit = problem.halfWidth;
  const scaleDown = (s: Similarity): Similarity => ({ a: s.a, b: s.b, tx: s.tx / unit, ty: s.ty / unit });
  const scaleUp = (s: Similarity): Similarity => ({ a: s.a, b: s.b, tx: s.tx * unit, ty: s.ty * unit });
  const fixedWarps = (problem.fixed ?? []).map(scaleDown);
  const nFixed = Math.min(fixedWarps.length, n);
  const fixed = new Float64Array(4 * nFixed);
  for (let t = 0; t < nFixed; t++) {
    const s = fixedWarps[t];
    fixed.set([s.a, s.b, s.tx, s.ty], 4 * t);
  }
  const nFree = n - nFixed;
  if (nFree <= 0) return { warps: fixedWarps.slice(0, n).map(scaleUp), objective: 0, iterations: 0, converged: true };

  // F_{t} = M_t^-1 maps frame t coordinates back to frame t-1.
  const F: Similarity[] = problem.motions.map((m, t) => (t === 0 ? { ...IDENTITY } : scaleDown(invert(m))));
  const R: Form[][] = [];
  for (let t = 0; t + 1 < n; t++) R.push(residualForms(F[t + 1], t));

  const paramWeight = (c: number): number => (c < 2 ? w.affine : unit);
  const terms: L1Term[] = [];
  // Zero-weight terms are dropped: they would start with λ = 0, which the
  // interior-point iteration cannot move away from.
  const pushTerm = (form: Form, weight: number): void => {
    if (weight <= 0) return;
    const sp = toSparse(form, nFixed, fixed);
    if (sp.idx.length === 0) return;
    terms.push({ ...sp, weight });
  };
  for (let t = 0; t + 1 < n; t++) {
    // D¹_t = R_t
    for (let c = 0; c < 4; c++) pushTerm(R[t][c], w.d1 * paramWeight(c));
    if (t + 2 < n) {
      // D²_t = F_{t+1} R_{t+1} − R_t   (R_{t+1} transported into frame t)
      const Rn = transport(R[t + 1], F[t + 1], t);
      for (let c = 0; c < 4; c++) pushTerm(combine(t, [{ form: Rn[c], scale: 1 }, { form: R[t][c], scale: -1 }]), w.d2 * paramWeight(c));
      if (t + 3 < n) {
        // D³_t = F_{t+1} F_{t+2} R_{t+2} − 2 F_{t+1} R_{t+1} + R_t
        const Rnn = transport(transport(R[t + 2], F[t + 2], t + 1), F[t + 1], t);
        for (let c = 0; c < 4; c++) {
          pushTerm(combine(t, [{ form: Rnn[c], scale: 1 }, { form: Rn[c], scale: -2 }, { form: R[t][c], scale: 1 }]), w.d3 * paramWeight(c));
        }
      }
    }
  }

  // Fidelity: |a−1|, |b|, |tx|, |ty| per free frame. In scaled units a
  // translation of 1 is `unit` px and a change of 1 in a or b moves the
  // frame edge by about `unit` px too, so all four share one weight.
  for (let t = nFixed; t < n && w.fidelity > 0; t++) {
    const base = 4 * (t - nFixed);
    for (let c = 0; c < 4; c++) {
      terms.push({ idx: Int32Array.from([base + c]), coef: Float64Array.from([1]), offset: c === 0 ? -1 : 0, weight: w.fidelity * unit });
    }
  }

  const cons: LinearConstraint[] = [];
  const hw = problem.halfWidth / unit;
  const hh = problem.halfHeight / unit;
  const chw = problem.cropHalfWidth / unit;
  const chh = problem.cropHalfHeight / unit;
  const corners: [number, number][] = [[-chw, -chh], [chw, -chh], [-chw, chh], [chw, chh]];
  for (let t = nFixed; t < n; t++) {
    const base = 4 * (t - nFixed);
    const one = (param: number, coef: number, offset: number): void => {
      cons.push({ idx: Int32Array.from([base + param]), coef: Float64Array.from([coef]), offset });
    };
    one(0, 1, -1.1);
    one(0, -1, 0.9);
    one(1, 1, -0.1);
    one(1, -1, -0.1);
    for (const [cx, cy] of corners) {
      // x' = a cx − b cy + tx ∈ [−hw, hw];  y' = b cx + a cy + ty ∈ [−hh, hh]
      const idx = Int32Array.from([base, base + 1, base + 2, base + 3]);
      cons.push({ idx, coef: Float64Array.from([cx, -cy, 1, 0]), offset: -hw });
      cons.push({ idx, coef: Float64Array.from([-cx, cy, -1, 0]), offset: -hw });
      cons.push({ idx, coef: Float64Array.from([cy, cx, 0, 1]), offset: -hh });
      cons.push({ idx, coef: Float64Array.from([-cy, -cx, 0, -1]), offset: -hh });
    }
  }

  // Identity warps are strictly feasible whenever the crop is inside the frame.
  const x0 = new Float64Array(4 * nFree);
  for (let t = 0; t < nFree; t++) x0[4 * t] = 1;
  const sol = solveL1Lp(4 * nFree, terms, cons, x0, solver);
  const warps: Similarity[] = [];
  for (let t = 0; t < nFixed; t++) warps.push(scaleUp(fixedWarps[t]));
  for (let t = 0; t < nFree; t++) {
    warps.push(scaleUp({ a: sol.x[4 * t], b: sol.x[4 * t + 1], tx: sol.x[4 * t + 2], ty: sol.x[4 * t + 3] }));
  }
  return { warps, objective: sol.objective, iterations: sol.iterations, converged: sol.converged };
}

export type WindowOptions = {
  /** Frames per window and the stride between windows (Bradley et al. 2021: 1800 / 1500). */
  windowSize: number;
  stride: number;
  /** Frames of the previous solution pinned at the start of each new window. */
  pinned: number;
};

export const DEFAULT_WINDOW: WindowOptions = { windowSize: 1800, stride: 1500, pinned: 3 };

/**
 * Solves long clips in overlapping windows. Each window after the first pins
 * its first frames to the previous solution, so position, velocity and
 * acceleration stay continuous across the seam; its result overrides the
 * overlap region of the previous window.
 */
export function solvePath(problem: PathProblem, windows: Partial<WindowOptions> = {}, solver: Partial<L1SolverOptions> = {}): PathSolution {
  const wo = { ...DEFAULT_WINDOW, ...windows };
  const n = problem.motions.length;
  if (n <= wo.windowSize) return solvePathWindow(problem, solver);
  const warps: Similarity[] = new Array<Similarity>(n);
  let objective = 0;
  let iterations = 0;
  let converged = true;
  for (let start = 0; start < n; start += wo.stride) {
    const end = Math.min(n, start + wo.windowSize);
    const fixed = start === 0 ? [] : warps.slice(start, start + wo.pinned);
    const sol = solvePathWindow({ ...problem, motions: problem.motions.slice(start, end), fixed }, solver);
    for (let t = 0; t < sol.warps.length; t++) warps[start + t] = sol.warps[t];
    objective += sol.objective;
    iterations += sol.iterations;
    converged &&= sol.converged;
    if (end === n) break;
  }
  return { warps, objective, iterations, converged };
}

// ---------------------------------------------------------------------------
// Helpers shared with the orchestration layer.

/** Virtual camera path Q_t = C_t^-1 ∘ W_t given cumulative motions C_t. */
export function virtualPath(cumulative: Similarity[], warps: Similarity[]): Similarity[] {
  return warps.map((w, t) => compose(invert(cumulative[t]), w));
}

/** Inverse of virtualPath: W_t = C_t ∘ Q_t. */
export function warpsFromVirtualPath(cumulative: Similarity[], path: Similarity[]): Similarity[] {
  return path.map((q, t) => compose(cumulative[t], q));
}
