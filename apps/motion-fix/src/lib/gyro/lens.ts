// Camera lens models in pixel space. Camera frame: x right, y down, z
// forward (OpenCV). Fisheye is the OpenCV fisheye (Kannala-Brandt) model:
//   θ = atan2(r, z),  θd = θ (1 + k1 θ² + k2 θ⁴ + k3 θ⁶ + k4 θ⁸),
//   u = cx + fx θd x / r,  v = cy + fy θd y / r.
// Pinhole is u = cx + fx x / z (GoPro Linear mode, rectilinear output).

import type { Vec3 } from "./quat.ts";

export type LensModel = {
  kind: "fisheye" | "pinhole";
  /** Image size the intrinsics refer to. */
  width: number;
  height: number;
  fx: number;
  fy: number;
  cx: number;
  cy: number;
  /** k1..k4 (fisheye only; zeros for pinhole). */
  k: [number, number, number, number];
  /** Where the profile came from, for the UI ("in-file calibration", "HERO10 Wide profile", ...). */
  source: string;
};

/** Distorted angle θd(θ). */
export function thetaD(k: readonly number[], th: number): number {
  const t2 = th * th;
  return th * (1 + t2 * (k[0] + t2 * (k[1] + t2 * (k[2] + t2 * k[3]))));
}

function dThetaD(k: readonly number[], th: number): number {
  const t2 = th * th;
  return 1 + t2 * (3 * k[0] + t2 * (5 * k[1] + t2 * (7 * k[2] + t2 * 9 * k[3])));
}

/**
 * Largest θ (≤ π) up to which θd is monotonic: beyond it the polynomial
 * folds back and the model is meaningless.
 */
export function maxTheta(k: readonly number[]): number {
  const step = 0.002;
  for (let th = step; th < Math.PI; th += step) if (dThetaD(k, th) <= 0) return th - step;
  return Math.PI;
}

/** Inverse of θd: Newton from θ = θd, clamped to [0, thMax]. */
export function thetaFromD(k: readonly number[], td: number, thMax = Math.PI): number {
  let th = Math.min(td, thMax);
  for (let i = 0; i < 12; i++) {
    const f = thetaD(k, th) - td;
    const d = dThetaD(k, th);
    if (d <= 1e-9) break;
    const nth = Math.min(thMax, Math.max(0, th - f / d));
    if (Math.abs(nth - th) < 1e-10) return nth;
    th = nth;
  }
  return th;
}

/** Ray (any length) -> pixel. Returns NaN for rays the lens cannot see. */
export function project(lens: LensModel, ray: Vec3, out: [number, number] = [0, 0], thMax = Math.PI): [number, number] {
  const [x, y, z] = ray;
  if (lens.kind === "pinhole") {
    if (z <= 1e-9) {
      out[0] = NaN;
      out[1] = NaN;
      return out;
    }
    out[0] = lens.cx + (lens.fx * x) / z;
    out[1] = lens.cy + (lens.fy * y) / z;
    return out;
  }
  const r = Math.hypot(x, y);
  const th = Math.atan2(r, z);
  if (th > thMax) {
    out[0] = NaN;
    out[1] = NaN;
    return out;
  }
  if (r < 1e-12) {
    out[0] = lens.cx;
    out[1] = lens.cy;
    return out;
  }
  const s = thetaD(lens.k, th) / r;
  out[0] = lens.cx + lens.fx * s * x;
  out[1] = lens.cy + lens.fy * s * y;
  return out;
}

/** Pixel -> unit ray. */
export function unproject(lens: LensModel, u: number, v: number, thMax = Math.PI): Vec3 {
  const mx = (u - lens.cx) / lens.fx;
  const my = (v - lens.cy) / lens.fy;
  if (lens.kind === "pinhole") {
    const n = Math.hypot(mx, my, 1);
    return [mx / n, my / n, 1 / n];
  }
  const td = Math.hypot(mx, my);
  if (td < 1e-12) return [0, 0, 1];
  const th = thetaFromD(lens.k, td, thMax);
  const s = Math.sin(th) / td;
  return [mx * s, my * s, Math.cos(th)];
}

/** The same lens at another resolution (uniform scale about the image, aspect kept by the caller). */
export function scaleLens(lens: LensModel, width: number, height: number): LensModel {
  const sx = width / lens.width;
  const sy = height / lens.height;
  return { ...lens, width, height, fx: lens.fx * sx, fy: lens.fy * sy, cx: lens.cx * sx, cy: lens.cy * sy };
}

/**
 * Fisheye with focal f whose corner (half diagonal) sees `diagFovDeg / 2`,
 * with only k1 free: for when the file gives a diagonal FOV but no
 * calibration. `f` is the centre magnification (px per radian).
 */
export function fisheyeFromFov(width: number, height: number, f: number, diagFovDeg: number, source: string): LensModel {
  const halfDiag = Math.hypot(width, height) / 2;
  const th = (diagFovDeg * Math.PI) / 360;
  // halfDiag = f θ (1 + k1 θ²)
  const k1 = (halfDiag / (f * th) - 1) / (th * th);
  return { kind: "fisheye", width, height, fx: f, fy: f, cx: width / 2, cy: height / 2, k: [k1, 0, 0, 0], source };
}

/** Rectilinear lens whose half diagonal sees diagFovDeg / 2. */
export function pinholeFromFov(width: number, height: number, diagFovDeg: number, source: string): LensModel {
  const halfDiag = Math.hypot(width, height) / 2;
  const f = halfDiag / Math.tan((diagFovDeg * Math.PI) / 360);
  return { kind: "pinhole", width, height, fx: f, fy: f, cx: width / 2, cy: height / 2, k: [0, 0, 0, 0], source };
}

/**
 * Least-squares OpenCV-fisheye fit of an arbitrary radial mapping, given as
 * samples (θ rad, r px): r = f θ + a1 θ³ + a2 θ⁵ + a3 θ⁷ + a4 θ⁹, k_i = a_i / f.
 */
export function fitFisheye(samples: { theta: number; r: number }[]): { f: number; k: [number, number, number, number] } {
  const m = 5;
  const A = Array.from({ length: m }, () => new Float64Array(m));
  const b = new Float64Array(m);
  for (const { theta, r } of samples) {
    const row = [theta, theta ** 3, theta ** 5, theta ** 7, theta ** 9];
    for (let i = 0; i < m; i++) {
      b[i] += row[i] * r;
      for (let j = 0; j < m; j++) A[i][j] += row[i] * row[j];
    }
  }
  const x = solveDense(A, b);
  const f = x[0];
  return { f, k: [x[1] / f, x[2] / f, x[3] / f, x[4] / f] };
}

/** Gaussian elimination with partial pivoting (small systems). */
export function solveDense(A: Float64Array[], b: Float64Array): Float64Array {
  const n = b.length;
  const M = A.map((row, i) => {
    const r = new Float64Array(n + 1);
    r.set(row);
    r[n] = b[i];
    return r;
  });
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    const d = M[c][c] || 1e-300;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / d;
      if (f === 0) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return Float64Array.from(M.map((row, i) => row[n] / (row[i] || 1e-300)));
}
