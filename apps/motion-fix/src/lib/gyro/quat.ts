// Unit quaternion helpers, (w, x, y, z) order, Hamilton convention:
// q ⊗ v ⊗ q* rotates vector v. Kept as plain tuples so they structured-clone
// and stay allocation-light in the per-vertex loop.

export type Quat = [number, number, number, number];
export type Vec3 = [number, number, number];

export const QI: Quat = [1, 0, 0, 0];

export function qmul(a: Quat, b: Quat): Quat {
  return [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ];
}

export function qconj(q: Quat): Quat {
  return [q[0], -q[1], -q[2], -q[3]];
}

export function qnorm(q: Quat): Quat {
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

export function qdot(a: Quat, b: Quat): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
}

/** Rotates v by q. */
export function qrot(q: Quat, v: Vec3): Vec3 {
  // t = 2 q.xyz × v; v' = v + w t + q.xyz × t
  const [w, x, y, z] = q;
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}

/** Rotation matrix (row-major 3×3) of q. */
export function qmat(q: Quat): number[] {
  const [w, x, y, z] = q;
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
    2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
    2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y),
  ];
}

/** Rotation vector (axis × angle, rad) -> quaternion. */
export function qexp(v: Vec3): Quat {
  const a = Math.hypot(v[0], v[1], v[2]);
  if (a < 1e-12) return [1, v[0] / 2, v[1] / 2, v[2] / 2];
  const s = Math.sin(a / 2) / a;
  return [Math.cos(a / 2), v[0] * s, v[1] * s, v[2] * s];
}

/** Quaternion -> rotation vector (shortest arc). */
export function qlog(q: Quat): Vec3 {
  let [w, x, y, z] = q;
  if (w < 0) {
    w = -w;
    x = -x;
    y = -y;
    z = -z;
  }
  const s = Math.hypot(x, y, z);
  if (s < 1e-12) return [2 * x, 2 * y, 2 * z];
  const a = 2 * Math.atan2(s, w);
  return [(x / s) * a, (y / s) * a, (z / s) * a];
}

/** Rotation angle of q, rad, in [0, π]. */
export function qangle(q: Quat): number {
  return 2 * Math.atan2(Math.hypot(q[1], q[2], q[3]), Math.abs(q[0]));
}

export function qslerp(a: Quat, b: Quat, t: number): Quat {
  let d = qdot(a, b);
  let bb = b;
  if (d < 0) {
    d = -d;
    bb = [-b[0], -b[1], -b[2], -b[3]];
  }
  if (d > 0.9995) {
    return qnorm([a[0] + (bb[0] - a[0]) * t, a[1] + (bb[1] - a[1]) * t, a[2] + (bb[2] - a[2]) * t, a[3] + (bb[3] - a[3]) * t]);
  }
  const th = Math.acos(d);
  const s = Math.sin(th);
  const ka = Math.sin((1 - t) * th) / s;
  const kb = Math.sin(t * th) / s;
  return [a[0] * ka + bb[0] * kb, a[1] * ka + bb[1] * kb, a[2] * ka + bb[2] * kb, a[3] * ka + bb[3] * kb];
}

/** Read quaternion i from a packed Float64Array (4 per entry). */
export function qat(arr: Float64Array | number[], i: number): Quat {
  return [arr[4 * i], arr[4 * i + 1], arr[4 * i + 2], arr[4 * i + 3]];
}

/** Makes consecutive quaternions in a packed array lie in the same hemisphere (q and −q are the same rotation). */
export function qcontinuous(arr: Float64Array): void {
  for (let i = 1; 4 * i < arr.length; i++) {
    const d = arr[4 * i] * arr[4 * i - 4] + arr[4 * i + 1] * arr[4 * i - 3] + arr[4 * i + 2] * arr[4 * i - 2] + arr[4 * i + 3] * arr[4 * i - 1];
    if (d < 0) for (let k = 0; k < 4; k++) arr[4 * i + k] = -arr[4 * i + k];
  }
}

/**
 * Orientation at `time` from a packed time series (times ascending,
 * quats 4 per sample), slerp between the bracketing samples, clamped at the ends.
 */
export function sampleOrientation(times: Float64Array, quats: Float64Array, time: number): Quat {
  const n = times.length;
  if (n === 0) return QI;
  if (time <= times[0]) return qat(quats, 0);
  if (time >= times[n - 1]) return qat(quats, n - 1);
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= time) lo = mid;
    else hi = mid;
  }
  const dt = times[hi] - times[lo];
  const f = dt > 0 ? (time - times[lo]) / dt : 0;
  return qslerp(qat(quats, lo), qat(quats, hi), f);
}
