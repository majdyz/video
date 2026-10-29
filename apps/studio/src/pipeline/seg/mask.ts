// Mask helpers for AI subject detection: edge snapping (guided filter), the forgiving feather, prompts rebuilt from
// a carried mask (the flow guard), and the small metrics the confidence and the evals use. Pure, deterministic.

/** Mean over a (2r+1)² window, edges clamped (separable running sums). */
export function boxMean(src: Float32Array, w: number, h: number, r: number, out?: Float32Array): Float32Array {
  const tmp = new Float32Array(w * h), o = out ?? new Float32Array(w * h);
  if (r <= 0) { o.set(src); return o; }
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let s = 0;
    for (let k = -r; k <= r; k++) s += src[row + Math.min(w - 1, Math.max(0, k))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = s / (2 * r + 1);
      s += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += tmp[Math.min(h - 1, Math.max(0, k)) * w + x];
    for (let y = 0; y < h; y++) {
      o[y * w + x] = s / (2 * r + 1);
      s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return o;
}

/** Guided filter (He et al.) of `p` by luma `I` (both 0..1): the mask edge snaps to the picture's edge. */
export function guidedFilter(I: Float32Array, p: Float32Array, w: number, h: number, r: number, eps: number): Float32Array {
  const n = w * h;
  const Ip = new Float32Array(n), II = new Float32Array(n);
  for (let i = 0; i < n; i++) { Ip[i] = I[i] * p[i]; II[i] = I[i] * I[i]; }
  const mI = boxMean(I, w, h, r), mp = boxMean(p, w, h, r), mIp = boxMean(Ip, w, h, r), mII = boxMean(II, w, h, r);
  const a = new Float32Array(n), b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    a[i] = (mIp[i] - mI[i] * mp[i]) / (mII[i] - mI[i] * mI[i] + eps);
    b[i] = mp[i] - a[i] * mI[i];
  }
  const ma = boxMean(a, w, h, r), mb = boxMean(b, w, h, r), out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.min(1, Math.max(0, ma[i] * I[i] + mb[i]));
  return out;
}

/** Soft blur of about `radius` px (three box passes ≈ Gaussian with σ ≈ radius / 2). */
export function feather(src: Float32Array, w: number, h: number, radius: number): Float32Array {
  const r = Math.max(0, Math.round(radius / 2));
  if (r === 0) return src.slice();
  let a = boxMean(src, w, h, r);
  a = boxMean(a, w, h, r);
  return boxMean(a, w, h, r);
}

/** Square max filter (dilation) of radius r. */
export function dilate(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(w * h), o = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = 0;
    for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) m = Math.max(m, src[y * w + k]);
    tmp[y * w + x] = m;
  }
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    let m = 0;
    for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) m = Math.max(m, tmp[k * w + x]);
    o[y * w + x] = m;
  }
  return o;
}

export function area(m: ArrayLike<number>, thr = 0.5): number {
  let n = 0;
  for (let i = 0; i < m.length; i++) if (m[i] > thr) n++;
  return n;
}

export function iou(a: ArrayLike<number>, b: ArrayLike<number>, thr = 0.5): number {
  let i = 0, u = 0;
  for (let k = 0; k < a.length; k++) {
    const x = a[k] > thr, y = b[k] > thr;
    if (x && y) i++;
    if (x || y) u++;
  }
  return u ? i / u : 1;
}

export type Box = { x0: number; y0: number; x1: number; y1: number };
export function bbox(m: ArrayLike<number>, w: number, h: number, thr = 0.5): Box | null {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y * w + x] > thr) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/** Exact squared Euclidean distance to the nearest 0 pixel (Felzenszwalb–Huttenlocher), as distances. */
export function distanceTransform(bin: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e20, n = Math.max(w, h);
  const f = new Float64Array(n), d = new Float64Array(n), z = new Float64Array(n + 1), v = new Int32Array(n);
  const g = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = bin[i] ? INF : 0;
  const pass = (len: number) => {
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
  };
  for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) f[y] = g[y * w + x]; pass(h); for (let y = 0; y < h; y++) g[y * w + x] = d[y]; }
  for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) f[x] = g[y * w + x]; pass(w); for (let x = 0; x < w; x++) g[y * w + x] = d[x]; }
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = Math.sqrt(g[i]);
  return out;
}

/**
 * Prompt rebuilt from a flow-carried mask (the flow guard re-prompts the tracker with it): positives spread over
 * the mask's interior (farthest-point sampling on its distance transform), negatives on a ring just outside it.
 * Points in the mask's pixel grid; `scale` = grid width / 640 (the prototype's lengths are at 640 px).
 */
export function promptFromMask(m: Float32Array, w: number, h: number, scale: number, npos = 3, nneg = 4): { pos: [number, number][]; neg: [number, number][] } | null {
  const bin = new Uint8Array(w * h);
  let n = 0;
  for (let i = 0; i < w * h; i++) if (m[i] > 0.5) { bin[i] = 1; n++; }
  if (n < 30 * scale * scale) return null;
  const dt = distanceTransform(bin, w, h);
  let dmax = 0, imax = 0;
  for (let i = 0; i < w * h; i++) if (dt[i] > dmax) { dmax = dt[i]; imax = i; }
  const thr = Math.max(2 * scale, 0.35 * dmax);
  const cand: number[] = [];
  for (let i = 0; i < w * h; i++) if (dt[i] >= thr) cand.push(i);
  const pos = [imax];
  const far = (pts: number[], list: number[]): [number, number] => {
    let best = -1, bi = -1;
    for (const c of list) {
      const cx = c % w, cy = (c / w) | 0;
      let d = Infinity;
      for (const p of pts) d = Math.min(d, Math.hypot(cx - (p % w), cy - ((p / w) | 0)));
      if (d > best) { best = d; bi = c; }
    }
    return [bi, best];
  };
  for (let k = 1; k < npos && cand.length; k++) {
    const [c, d] = far(pos, cand);
    if (d < 8 * scale) break;
    pos.push(c);
  }
  const outer = dilate(Float32Array.from(bin), w, h, Math.round(15 * scale)), inner = dilate(Float32Array.from(bin), w, h, Math.round(7 * scale));
  const ring: number[] = [];
  for (let i = 0; i < w * h; i++) if (outer[i] > 0 && inner[i] === 0) ring.push(i);
  const neg: number[] = [];
  if (ring.length) {
    neg.push(ring[(ring.length * 0.5) | 0]);
    for (let k = 1; k < nneg; k++) neg.push(far(neg, ring)[0]);
  }
  const xy = (i: number): [number, number] => [i % w, (i / w) | 0];
  return { pos: pos.map(xy), neg: neg.map(xy) };
}

/** Bilinear resize of a w×h float map to W×H (pixel centres aligned). */
export function resize(src: Float32Array, w: number, h: number, W: number, H: number): Float32Array {
  const o = new Float32Array(W * H), sx = w / W, sy = h / H;
  for (let y = 0; y < H; y++) {
    const fy = Math.min(h - 1, Math.max(0, (y + 0.5) * sy - 0.5)), y0 = Math.floor(fy), y1 = Math.min(h - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = Math.min(w - 1, Math.max(0, (x + 0.5) * sx - 0.5)), x0 = Math.floor(fx), x1 = Math.min(w - 1, x0 + 1), tx = fx - x0;
      const a = src[y0 * w + x0] + (src[y0 * w + x1] - src[y0 * w + x0]) * tx;
      const b = src[y1 * w + x0] + (src[y1 * w + x1] - src[y1 * w + x0]) * tx;
      o[y * W + x] = a + (b - a) * ty;
    }
  }
  return o;
}

export function smoothstep(lo: number, hi: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
}

/** sRGB 8-bit → CIE Lab (D65). */
export function srgbToLab(r8: number, g8: number, b8: number): [number, number, number] {
  const lin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const r = lin(r8), g = lin(g8), b = lin(b8);
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

/** Departure map scale: one value per DEPART_STEP × DEPART_STEP mask pixels. */
export const DEPART_STEP = 4;

/**
 * How far each part of the frame departs from the water around it (0 = water, 1 = clearly not), at 1/DEPART_STEP of
 * the mask grid: the local water colour is a wide normalised blur of the pixels outside the subject mask (`inc`,
 * 0..255), and the departure ramps over a CIE76 ΔE of lo..hi from it. Where the frame shows no water at all: 1.
 */
export function departMap(rgba: Uint8ClampedArray | Uint8Array, inc: Uint8Array, w: number, h: number, lo = 3, hi = 10): { width: number; height: number; data: Uint8Array } {
  const S = DEPART_STEP, qw = Math.max(1, Math.ceil(w / S)), qh = Math.max(1, Math.ceil(h / S)), n = qw * qh;
  const L = new Float32Array(n), A = new Float32Array(n), B = new Float32Array(n), wt = new Float32Array(n);
  for (let qy = 0; qy < qh; qy++) for (let qx = 0; qx < qw; qx++) {
    let r = 0, g = 0, b = 0, m = 0, c = 0;
    for (let y = qy * S; y < Math.min(h, qy * S + S); y++) for (let x = qx * S; x < Math.min(w, qx * S + S); x++) {
      const i = y * w + x;
      r += rgba[i * 4]; g += rgba[i * 4 + 1]; b += rgba[i * 4 + 2]; m = Math.max(m, inc[i]); c++;
    }
    const q = qy * qw + qx, lab = srgbToLab(r / c, g / c, b / c);
    L[q] = lab[0]; A[q] = lab[1]; B[q] = lab[2];
    wt[q] = m < 13 ? 1 : 0; // nowhere near the subject: water (or background)
  }
  let tw = 0, gl = 0, ga = 0, gb = 0;
  for (let q = 0; q < n; q++) if (wt[q]) { tw++; gl += L[q]; ga += A[q]; gb += B[q]; }
  const out = new Uint8Array(n);
  if (!tw) { out.fill(255); return { width: qw, height: qh, data: out }; }
  const R = Math.max(2, Math.round(qw / 6));
  const wl = new Float32Array(n), wa = new Float32Array(n), wb = new Float32Array(n);
  for (let q = 0; q < n; q++) { wl[q] = L[q] * wt[q]; wa[q] = A[q] * wt[q]; wb[q] = B[q] * wt[q]; }
  const bw = boxMean(wt, qw, qh, R), bl = boxMean(wl, qw, qh, R), ba = boxMean(wa, qw, qh, R), bb = boxMean(wb, qw, qh, R);
  for (let q = 0; q < n; q++) {
    const k = bw[q] > 0.02 ? 1 / bw[q] : 0;
    const el = k ? bl[q] * k : gl / tw, ea = k ? ba[q] * k : ga / tw, eb = k ? bb[q] * k : gb / tw;
    out[q] = Math.round(255 * smoothstep(lo, hi, Math.hypot(L[q] - el, A[q] - ea, B[q] - eb)));
  }
  // Small water-like spots inside the subject (a blue highlight on a flank) are the subject: a closing of radius
  // CLOSE_R fills holes up to ~2 CLOSE_R cells inside the mask; a leak onto the water is far larger and stays water.
  const CLOSE_R = 2;
  const f = Float32Array.from(out, (x) => x / 255);
  const dil = dilate(f, qw, qh, CLOSE_R);
  const inv = Float32Array.from(dil, (x) => 1 - x);
  const closed = dilate(inv, qw, qh, CLOSE_R);
  for (let q = 0; q < n; q++) if (wt[q] === 0 && (1 - closed[q]) * 255 > out[q]) out[q] = Math.round((1 - closed[q]) * 255);
  return { width: qw, height: qh, data: out };
}
