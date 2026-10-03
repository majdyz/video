// L1 path solver tests:
//   1. the generic LP core against brute-force vertex enumeration,
//   2. camera-path properties (static / linear segments, constraints, seams),
//   3. timing for a 1000-frame path.
//   node --experimental-strip-types apps/motion-fix/test/path-l1.test.ts
import assert from "node:assert/strict";
import {
  GRUNDMANN_WEIGHTS,
  solveL1Lp,
  solvePath,
  solvePathWindow,
  virtualPath,
  type L1Term,
  type LinearConstraint,
  type PathProblem,
} from "../src/lib/path-l1.ts";
import { IDENTITY, apply, compose, type Similarity } from "../src/lib/tracker.ts";
import { makeRng, similarityFrom } from "./synth.ts";

// ---------------------------------------------------------------------------
// 1. Generic core vs brute force.
//
// A convex piecewise-linear objective over a polytope attains its minimum at
// a vertex of the arrangement of the constraint planes and the kink planes
// (a_kᵀx + o_k = 0). Enumerate every N-subset of planes, solve, keep the
// best feasible point.

function solve3x3(A: number[][], b: number[]): number[] | null {
  const m = A.map((r, i) => [...r, b[i]]);
  const n = 3;
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[piv][c])) piv = r;
    if (Math.abs(m[piv][c]) < 1e-9) return null;
    [m[c], m[piv]] = [m[piv], m[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r][c] / m[c][c];
      for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k];
    }
  }
  return m.map((r, i) => r[n] / r[i]);
}

function bruteForce(terms: L1Term[], cons: LinearConstraint[]): number {
  const planes: { c: number[]; o: number }[] = [];
  const dense = (idx: Int32Array, coef: Float64Array): number[] => {
    const v = [0, 0, 0];
    for (let p = 0; p < idx.length; p++) v[idx[p]] += coef[p];
    return v;
  };
  for (const t of terms) planes.push({ c: dense(t.idx, t.coef), o: t.offset });
  for (const c of cons) planes.push({ c: dense(c.idx, c.coef), o: c.offset });
  const objective = (x: number[]): number => {
    let s = 0;
    for (const t of terms) {
      const d = dense(t.idx, t.coef);
      s += t.weight * Math.abs(d[0] * x[0] + d[1] * x[1] + d[2] * x[2] + t.offset);
    }
    return s;
  };
  const feasible = (x: number[]): boolean =>
    cons.every((c) => {
      const d = dense(c.idx, c.coef);
      return d[0] * x[0] + d[1] * x[1] + d[2] * x[2] + c.offset <= 1e-7;
    });
  let best = Infinity;
  const P = planes.length;
  for (let i = 0; i < P; i++) {
    for (let j = i + 1; j < P; j++) {
      for (let k = j + 1; k < P; k++) {
        const x = solve3x3([planes[i].c, planes[j].c, planes[k].c], [-planes[i].o, -planes[j].o, -planes[k].o]);
        if (!x || !feasible(x)) continue;
        best = Math.min(best, objective(x));
      }
    }
  }
  return best;
}

{
  const rng = makeRng(2024);
  let worst = 0;
  for (let trial = 0; trial < 40; trial++) {
    const terms: L1Term[] = [];
    for (let k = 0; k < 6; k++) {
      terms.push({
        idx: Int32Array.from([0, 1, 2]),
        coef: Float64Array.from([rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1]),
        offset: rng() * 4 - 2,
        weight: 0.1 + rng() * 10,
      });
    }
    // Box |x_i| <= 3 keeps the polytope bounded; x = 0 is strictly feasible.
    const cons: LinearConstraint[] = [];
    for (let i = 0; i < 3; i++) {
      cons.push({ idx: Int32Array.from([i]), coef: Float64Array.from([1]), offset: -3 });
      cons.push({ idx: Int32Array.from([i]), coef: Float64Array.from([-1]), offset: -3 });
    }
    cons.push({ idx: Int32Array.from([0, 1, 2]), coef: Float64Array.from([rng(), rng(), rng()]), offset: -(1 + rng()) });
    const ref = bruteForce(terms, cons);
    const sol = solveL1Lp(3, terms, cons, new Float64Array(3));
    assert.ok(sol.converged, `trial ${trial} did not converge`);
    const rel = (sol.objective - ref) / Math.max(1e-9, ref);
    worst = Math.max(worst, rel);
    assert.ok(rel > -1e-6, `trial ${trial}: solver beat the brute force? ${sol.objective} vs ${ref}`);
    assert.ok(rel < 1e-5, `trial ${trial}: solver objective ${sol.objective} vs reference ${ref}`);
  }
  console.log(`LP core vs brute force: worst relative gap ${worst.toExponential(2)} over 40 problems`);
}

// ---------------------------------------------------------------------------
// 2. Camera-path properties.

function problemFrom(poses: Similarity[], cropRatio: number, extra: Partial<PathProblem> = {}): PathProblem {
  const motions: Similarity[] = [IDENTITY];
  for (let t = 1; t < poses.length; t++) {
    // M_t = C_t ∘ C_{t-1}^-1
    const inv = poses[t - 1];
    const d = inv.a * inv.a + inv.b * inv.b;
    const ia = inv.a / d;
    const ib = -inv.b / d;
    const invPrev = { a: ia, b: ib, tx: -(ia * inv.tx - ib * inv.ty), ty: -(ib * inv.tx + ia * inv.ty) };
    motions.push(compose(poses[t], invPrev));
  }
  return { motions, halfWidth: 320, halfHeight: 180, cropHalfWidth: 320 * cropRatio, cropHalfHeight: 180 * cropRatio, ...extra };
}

function maxCornerExcursion(warps: Similarity[], p: PathProblem): number {
  let worst = 0;
  for (const w of warps) {
    for (const cx of [-p.cropHalfWidth, p.cropHalfWidth]) {
      for (const cy of [-p.cropHalfHeight, p.cropHalfHeight]) {
        const [x, y] = apply(w, cx, cy);
        worst = Math.max(worst, Math.abs(x) - p.halfWidth, Math.abs(y) - p.halfHeight);
      }
    }
  }
  return worst;
}

// 2a. Pure jitter inside the budget -> a static virtual camera (all D¹ = 0).
{
  const rng = makeRng(5);
  const poses: Similarity[] = [];
  for (let t = 0; t < 120; t++) poses.push(similarityFrom((rng() - 0.5) * 1.0, 1 + (rng() - 0.5) * 0.01, (rng() - 0.5) * 20, (rng() - 0.5) * 16));
  const p = problemFrom(poses, 0.8);
  const sol = solvePathWindow(p);
  assert.ok(sol.converged);
  const q = virtualPath(poses, sol.warps);
  let maxStep = 0;
  for (let t = 1; t < q.length; t++) maxStep = Math.max(maxStep, Math.abs(q[t].tx - q[t - 1].tx), Math.abs(q[t].ty - q[t - 1].ty), 1000 * Math.abs(q[t].a - q[t - 1].a), 1000 * Math.abs(q[t].b - q[t - 1].b));
  console.log(`jitter path: objective ${sol.objective.toFixed(4)}, ${sol.iterations} iterations, max virtual-camera step ${maxStep.toExponential(2)}`);
  assert.ok(maxStep < 1e-3, `virtual camera should be static, max step ${maxStep}`);
  assert.ok(maxCornerExcursion(sol.warps, p) <= 1e-6, "crop window left the frame");
}

// 2b. Constant-velocity pan + jitter -> the virtual camera keeps the pan with
//     tiny acceleration. (Not exactly zero: w1 > 0 pulls the path against the
//     inclusion bound, where it legitimately follows the window edge.)
{
  const rng = makeRng(9);
  const poses: Similarity[] = [];
  for (let t = 0; t < 150; t++) poses.push(similarityFrom((rng() - 0.5) * 0.6, 1, 3 * t + (rng() - 0.5) * 12, (rng() - 0.5) * 10));
  const p = problemFrom(poses, 0.8);
  const sol = solvePathWindow(p);
  assert.ok(sol.converged);
  const q = virtualPath(poses, sol.warps);
  let maxAccel = 0;
  for (let t = 2; t < q.length; t++) maxAccel = Math.max(maxAccel, Math.abs(q[t].tx - 2 * q[t - 1].tx + q[t - 2].tx));
  console.log(`pan path: ${sol.iterations} iterations, max second difference ${maxAccel.toExponential(2)}`);
  assert.ok(maxAccel < 0.25, `path should be nearly linear during a pan, max accel ${maxAccel}`);
}

// 2c. Shake larger than the budget: constraints bind but hold exactly.
{
  const rng = makeRng(11);
  const poses: Similarity[] = [];
  for (let t = 0; t < 200; t++) poses.push(similarityFrom(2 * Math.sin(t * 0.3), 1, 80 * Math.sin(t * 0.21) + (rng() - 0.5) * 10, 50 * Math.cos(t * 0.17)));
  const p = problemFrom(poses, 0.85);
  const sol = solvePathWindow(p);
  assert.ok(sol.converged);
  const exc = maxCornerExcursion(sol.warps, p);
  console.log(`binding path: ${sol.iterations} iterations, max corner excursion ${exc.toExponential(2)} px`);
  assert.ok(exc <= 1e-6, `inclusion violated by ${exc}`);
  for (const w of sol.warps) {
    assert.ok(w.a >= 0.9 - 1e-9 && w.a <= 1.1 + 1e-9 && Math.abs(w.b) <= 0.1 + 1e-9, "proximity violated");
  }
}

// 2d. Windowed solve is continuous across the seam and feasible. (It is not
//     compared with the single solve: an L1 path depends on the whole future,
//     so a window that cannot see it legitimately picks a different vertex.)
{
  const rng = makeRng(13);
  const poses: Similarity[] = [];
  for (let t = 0; t < 400; t++) poses.push(similarityFrom((rng() - 0.5) * 0.8, 1, 0.5 * t + 30 * Math.sin(t * 0.05) + (rng() - 0.5) * 14, (rng() - 0.5) * 12));
  const p = problemFrom(poses, 0.8);
  const whole = solvePathWindow(p);
  const windowed = solvePath(p, { windowSize: 250, stride: 200, pinned: 3 });
  const qa = virtualPath(poses, whole.warps);
  const qb = virtualPath(poses, windowed.warps);
  const jerkOf = (q: Similarity[]): number => {
    let worst = 0;
    for (let t = 3; t < q.length; t++) worst = Math.max(worst, Math.abs(q[t].tx - 3 * q[t - 1].tx + 3 * q[t - 2].tx - q[t - 3].tx));
    return worst;
  };
  console.log(`windowed path: max third difference ${jerkOf(qb).toFixed(3)} px (whole solve ${jerkOf(qa).toFixed(3)} px), objective ${windowed.objective.toFixed(0)} vs ${whole.objective.toFixed(0)}`);
  assert.ok(jerkOf(qb) < 2, `seam is not smooth: jerk ${jerkOf(qb)}`);
  assert.ok(maxCornerExcursion(windowed.warps, p) <= 1e-6, "crop window left the frame (windowed)");
}

// ---------------------------------------------------------------------------
// 3. Timing for 1000 frames.
{
  const rng = makeRng(17);
  const poses: Similarity[] = [];
  for (let t = 0; t < 1000; t++) poses.push(similarityFrom((rng() - 0.5) * 1.0 + 0.5 * Math.sin(t * 0.01), 1 + 0.02 * Math.sin(t * 0.003), 0.3 * t + 40 * Math.sin(t * 0.03) + (rng() - 0.5) * 16, 30 * Math.cos(t * 0.02) + (rng() - 0.5) * 14));
  const p = problemFrom(poses, 0.8, { weights: GRUNDMANN_WEIGHTS });
  const t0 = performance.now();
  const sol = solvePath(p);
  const ms = performance.now() - t0;
  console.log(`1000-frame path: ${ms.toFixed(0)} ms, ${sol.iterations} iterations, converged=${sol.converged}`);
  assert.ok(sol.converged);
  assert.ok(ms < 20_000, "solver too slow");
}

console.log("path-l1 tests passed");
