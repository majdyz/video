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

/** sdfFeather: the mask is binarised on a grid this many times finer (its soft edge, bilinear), so the distance is
 * good to ±1/(2·SS) mask px, not ±½: the contour the grade reads back follows the mask's soft edge, not the stairs
 * of the 320-px grid (owner's clip, 12 Nov: "blocky" outlines on a far ray). */
export const SDF_SS = 2;

/**
 * The tone's feather: a ramp of about ±r px across the mask's own 0.5 contour, from the signed distance to it. A
 * blur of the same width would erase anything thinner than the blur (a fin, a tail tip); this keeps every part of
 * the mask above 0.5 along its middle, with a soft edge. The distance is measured on a grid `ss` times finer
 * (SDF_SS): 0.5 exactly on the soft mask's own contour, to a fraction of a mask px.
 */
export function sdfFeather(m: Float32Array, w: number, h: number, r: number, ss = SDF_SS): Float32Array {
  const s = signedDistance(m, w, h, ss), k = 1 / (2 * Math.max(0.5, r));
  for (let i = 0; i < s.length; i++) s[i] = Math.min(1, Math.max(0, 0.5 + s[i] * k));
  return s;
}

/**
 * Signed distance (mask px; > 0 inside) from each texel centre to the 0.5 contour of the soft mask `m`, measured on
 * a grid `ss` times finer (the mask resampled bilinearly, binarised there, an exact distance transform each way) and
 * averaged back over each texel's ss × ss samples. ss = 1 is the plain binary mask's distance (±½ px: stairs).
 */
export function signedDistance(m: Float32Array, w: number, h: number, ss = SDF_SS): Float32Array {
  const S = Math.max(1, Math.round(ss)), W = w * S, H = h * S, n = W * H;
  const f = S === 1 ? m : resize(m, w, h, W, H);
  const bin = new Uint8Array(n), inv = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const b = f[i] > 0.5; bin[i] = b ? 1 : 0; inv[i] = b ? 0 : 1; }
  const din = distanceTransform(bin, W, H), dout = distanceTransform(inv, W, H), out = new Float32Array(w * h);
  const k = 1 / (S * S * S);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let a = 0;
    for (let yy = y * S; yy < y * S + S; yy++) for (let xx = x * S; xx < x * S + S; xx++) {
      const i = yy * W + xx;
      a += bin[i] ? din[i] - 0.5 : -(dout[i] - 0.5);
    }
    out[y * w + x] = a * k;
  }
  return out;
}

/** The centre of mass of the texels over `thr` (mask px) and their count; null when there are none. */
export function centroid(m: ArrayLike<number>, w: number, h: number, thr = 0.5): { x: number; y: number; n: number } | null {
  let sx = 0, sy = 0, n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y * w + x] > thr) { sx += x; sy += y; n++; }
  return n ? { x: sx / n, y: sy / n, n } : null;
}

/** `src` moved by (dx, dy) mask px (bilinear; what comes in from outside the frame is 0). */
export function shiftMap(src: Float32Array, w: number, h: number, dx: number, dy: number, out = new Float32Array(w * h)): Float32Array {
  const ix = Math.floor(-dx), iy = Math.floor(-dy), tx = -dx - ix, ty = -dy - iy;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : src[y * w + x]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const x0 = x + ix, y0 = y + iy;
    const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
    out[y * w + x] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  }
  return out;
}

/** The 4-connected parts of a mask (texels over `thr`) holding at least `minShare` of its area: their count. */
export function bigParts(m: ArrayLike<number>, w: number, h: number, thr = 0.5, minShare = 0.04): number {
  const n = w * h, seen = new Uint8Array(n), sizes: number[] = [], stack: number[] = [];
  let area = 0;
  for (let s = 0; s < n; s++) {
    if (!(m[s] > thr)) continue;
    area++;
    if (seen[s]) continue;
    let size = 0;
    seen[s] = 1; stack.push(s);
    while (stack.length) {
      const i = stack.pop()!, x = i % w;
      size++;
      if (x > 0 && m[i - 1] > thr && !seen[i - 1]) { seen[i - 1] = 1; stack.push(i - 1); }
      if (x < w - 1 && m[i + 1] > thr && !seen[i + 1]) { seen[i + 1] = 1; stack.push(i + 1); }
      if (i >= w && m[i - w] > thr && !seen[i - w]) { seen[i - w] = 1; stack.push(i - w); }
      if (i < n - w && m[i + w] > thr && !seen[i + w]) { seen[i + w] = 1; stack.push(i + w); }
    }
    sizes.push(size);
  }
  return sizes.filter((z) => z >= Math.max(1, minShare * area)).length;
}

/**
 * How far a mask's colour stands off the water right around it: the CIE76 ΔE between the mean colour of the frame's
 * cells (cellLab: DEPART_STEP mask px each) the mask covers and that of the cells in a ring of `ring` cells around
 * it. The water test of a re-check (session.ts recheck): a mask the model drew on plain water has the ring's colour
 * (ΔE ≈ 0). Null when the mask covers no cell or has no ring (it fills the frame).
 */
export function waterContrast(m: ArrayLike<number>, cells: Float32Array, w: number, h: number, ring = 3): number | null {
  const S = DEPART_STEP, qw = Math.max(1, Math.ceil(w / S)), qh = Math.max(1, Math.ceil(h / S));
  if (cells.length !== qw * qh * 3) return null;
  // A cell is the mask's when any of its texels is (a far subject is a cell or two thick).
  const on = new Float32Array(qw * qh);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y * w + x] > 0.5) on[Math.floor(y / S) * qw + Math.floor(x / S)] = 1;
  // The ring starts a cell away from the mask (the cells next to it hold its soft edge).
  const near = dilate(on, qw, qh, 1), far = dilate(on, qw, qh, 1 + ring);
  const a = [0, 0, 0], b = [0, 0, 0];
  let na = 0, nb = 0;
  for (let q = 0; q < qw * qh; q++) {
    if (on[q]) { for (let c = 0; c < 3; c++) a[c] += cells[q * 3 + c]; na++; }
    else if (far[q] && !near[q]) { for (let c = 0; c < 3; c++) b[c] += cells[q * 3 + c]; nb++; }
  }
  if (!na || !nb) return null;
  return Math.hypot(a[0] / na - b[0] / nb, a[1] / na - b[1] / nb, a[2] / na - b[2] / nb);
}

/**
 * Where the ML mask is trusted over the engine's: 1 on the subject and within r of it, easing to 0 by 2r. Grown from
 * the binary mask (a dilation, then a box blur), so a thin fin counts as fully as the body (a plain blur would thin
 * it out to nothing).
 */
export function nearMap(inc: Float32Array, w: number, h: number, r: number): Float32Array {
  const bin = new Float32Array(w * h);
  for (let i = 0; i < bin.length; i++) bin[i] = inc[i] > 0.5 ? 1 : 0;
  return boxMean(dilateBin(bin, w, h, r), w, h, r);
}

/**
 * dilate for a map of 0s and 1s: a texel is 1 when its (2r+1)² window holds a 1, counted with running sums (the
 * max filter above looks at every texel of the window: 2r+1 reads a texel and pass, and the near map's radius grows
 * with the subject, 27 px for a school across the frame). The same map.
 */
export function dilateBin(bin: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Uint8Array(w * h), o = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let c = 0;
    for (let k = 0; k <= Math.min(w - 1, r); k++) c += bin[row + k] > 0 ? 1 : 0;
    for (let x = 0; x < w; x++) {
      tmp[row + x] = c > 0 ? 1 : 0;
      if (x + r + 1 < w) c += bin[row + x + r + 1] > 0 ? 1 : 0;
      if (x - r >= 0) c -= bin[row + x - r] > 0 ? 1 : 0;
    }
  }
  for (let x = 0; x < w; x++) {
    let c = 0;
    for (let k = 0; k <= Math.min(h - 1, r); k++) c += tmp[k * w + x];
    for (let y = 0; y < h; y++) {
      o[y * w + x] = c > 0 ? 1 : 0;
      if (y + r + 1 < h) c += tmp[(y + r + 1) * w + x];
      if (y - r >= 0) c -= tmp[(y - r) * w + x];
    }
  }
  return o;
}

/**
 * Grows a subject's mask onto the parts of it the tracker's coarse mask missed (owner's eagle ray, 13 Nov: the white
 * wing tips and the head lay outside the phone model's mask): pixels within `r` px of the mask (grown one ring at a
 * time, each touching the mask or the ring before) whose luma stands out from the water around the subject. The
 * water is the band r..2r outside the mask: its mean and spread; a pixel joins when it differs from that mean by
 * more than max(k × spread, floor). A subject over sand or reef (no plain water around it: the band's spread is
 * high) grows little or not at all. Returns a new mask (0..1); `m` is not changed.
 */
export function growToSubject(m: Float32Array, luma: Float32Array, w: number, h: number, r: number, k = 3, floor = 0.06): Float32Array {
  const n = w * h, out = Float32Array.from(m);
  if (r < 1) return out;
  const bin = new Float32Array(n);
  let any = false;
  for (let i = 0; i < n; i++) if (m[i] > 0.5) { bin[i] = 1; any = true; }
  if (!any) return out;
  const near = dilateBin(bin, w, h, r), far = dilateBin(bin, w, h, 2 * r);
  let c = 0, sum = 0, sq = 0;
  for (let i = 0; i < n; i++) if (far[i] > 0 && near[i] === 0) { c++; sum += luma[i]; sq += luma[i] * luma[i]; }
  if (c < 16) return out;
  const mean = sum / c, sd = Math.sqrt(Math.max(0, sq / c - mean * mean));
  const thr = Math.max(k * sd, floor);
  // Spread too high: the subject is not on plain water (sand, reef, a busy background): leave the mask as it is.
  if (sd > 0.08) return out;
  let front = bin;
  for (let step = 0; step < r; step++) {
    const ring = dilateBin(front, w, h, 1);
    let added = 0;
    const next = Float32Array.from(front);
    for (let i = 0; i < n; i++) {
      if (front[i] > 0 || ring[i] === 0 || near[i] === 0) continue;
      if (Math.abs(luma[i] - mean) > thr) { next[i] = 1; added++; if (out[i] < 1) out[i] = 1; }
    }
    if (!added) break;
    front = next;
  }
  return out;
}

/** sRGB code value (0..255) → linear light. */
const SRGB_LIN = Float32Array.from({ length: 256 }, (_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });

/** framePop: the subject is alpha over this, the water around it alpha under `out` where the raw near map is over
 * `near` (the engine's own test on the overlay, aqua-fix seg-overlay.ts popContrast: 0.6 / 0.05 / 0.15 of a near map
 * stored × 4), with at least `min` texels on either side. */
export const FRAME_POP = { inside: 0.6, out: 0.05, near: 0.15 / 4, min: 16 };

/**
 * One frame's subject lightness against the water around it: ln(subject luminance / ring luminance), in linear
 * light, from the frame's luma (0..1, as decoded), the pop alpha (0..255) and the raw near map on the mask grid.
 * Null when either side is too small to tell. The session measures every filled frame with it; their mean over the
 * clip decides whether Subject pop lifts or deepens the subject (aqua-fix seg-overlay.ts popDirection), once for the
 * clip, the same in the preview and the export.
 */
export function framePop(luma: Float32Array, alpha: Uint8Array, near: Float32Array): number | null {
  const P = FRAME_POP;
  let ls = 0, ns = 0, lr = 0, nr = 0;
  for (let i = 0; i < alpha.length; i++) {
    const a = alpha[i] / 255;
    if (a > P.inside) { ls += SRGB_LIN[Math.min(255, Math.max(0, Math.round(luma[i] * 255)))]; ns++; }
    else if (a < P.out && near[i] > P.near) { lr += SRGB_LIN[Math.min(255, Math.max(0, Math.round(luma[i] * 255)))]; nr++; }
  }
  if (ns < P.min || nr < P.min || lr <= 0) return null;
  return Math.log(Math.max(1e-6, ls / ns) / (lr / nr));
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
  return departFromCells(cellLab(rgba, w, h), inc, w, h, lo, hi);
}

/** The frame's mean colour per DEPART_STEP cell, as CIE Lab (3 floats per cell): what departMap needs of a frame. */
export function cellLab(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Float32Array {
  const S = DEPART_STEP, qw = Math.max(1, Math.ceil(w / S)), qh = Math.max(1, Math.ceil(h / S));
  const out = new Float32Array(qw * qh * 3);
  for (let qy = 0; qy < qh; qy++) for (let qx = 0; qx < qw; qx++) {
    let r = 0, g = 0, b = 0, c = 0;
    for (let y = qy * S; y < Math.min(h, qy * S + S); y++) for (let x = qx * S; x < Math.min(w, qx * S + S); x++) {
      const i = y * w + x;
      r += rgba[i * 4]; g += rgba[i * 4 + 1]; b += rgba[i * 4 + 2]; c++;
    }
    const lab = srgbToLab(r / c, g / c, b / c), q = (qy * qw + qx) * 3;
    out[q] = lab[0]; out[q + 1] = lab[1]; out[q + 2] = lab[2];
  }
  return out;
}

/** departMap from cellLab's cells and the subject mask (0..255 on the w × h grid). */
export function departFromCells(cells: Float32Array, inc: Uint8Array, w: number, h: number, lo = 3, hi = 10): { width: number; height: number; data: Uint8Array } {
  const S = DEPART_STEP, qw = Math.max(1, Math.ceil(w / S)), qh = Math.max(1, Math.ceil(h / S)), n = qw * qh;
  const L = new Float32Array(n), A = new Float32Array(n), B = new Float32Array(n), wt = new Float32Array(n);
  for (let qy = 0; qy < qh; qy++) for (let qx = 0; qx < qw; qx++) {
    let m = 0;
    for (let y = qy * S; y < Math.min(h, qy * S + S); y++) for (let x = qx * S; x < Math.min(w, qx * S + S); x++) m = Math.max(m, inc[y * w + x]);
    const q = qy * qw + qx;
    L[q] = cells[q * 3]; A[q] = cells[q * 3 + 1]; B[q] = cells[q * 3 + 2];
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

/**
 * The parts of the grid a map of the mask `m` can differ from zero in: the bounds of each connected part of its
 * texels over `thr`, grown by `margin` px inside the frame, with windows that touch merged into one (so no window
 * holds, or is within `margin` of, a part of the mask that is not its own). A school of three far sharks is three
 * small windows, not the frame between them. Empty: nothing over `thr`.
 */
export function maskWindows(m: ArrayLike<number>, w: number, h: number, margin: number, thr: number): Box[] {
  const n = w * h, seen = new Uint8Array(n), stack: number[] = [], boxes: Box[] = [];
  for (let s0 = 0; s0 < n; s0++) {
    if (seen[s0] || !(m[s0] > thr)) continue;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    seen[s0] = 1; stack.push(s0);
    while (stack.length) {
      const i = stack.pop()!, x = i % w, y = (i - x) / w;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && !seen[i - 1] && m[i - 1] > thr) { seen[i - 1] = 1; stack.push(i - 1); }
      if (x < w - 1 && !seen[i + 1] && m[i + 1] > thr) { seen[i + 1] = 1; stack.push(i + 1); }
      if (y > 0 && !seen[i - w] && m[i - w] > thr) { seen[i - w] = 1; stack.push(i - w); }
      if (y < h - 1 && !seen[i + w] && m[i + w] > thr) { seen[i + w] = 1; stack.push(i + w); }
    }
    const g = Math.ceil(margin);
    boxes.push({ x0: x0 - g, y0: y0 - g, x1: x1 + g, y1: y1 + g });
  }
  // Grown windows that overlap (or touch) become one, until none do.
  for (let merged = true; merged;) {
    merged = false;
    for (let i = 0; i < boxes.length && !merged; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.x0 > b.x1 + 1 || b.x0 > a.x1 + 1 || a.y0 > b.y1 + 1 || b.y0 > a.y1 + 1) continue;
      boxes[i] = { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
      boxes.splice(j, 1);
      merged = true;
      break;
    }
  }
  return boxes.map((b) => ({ x0: Math.max(0, b.x0), y0: Math.max(0, b.y0), x1: Math.min(w - 1, b.x1), y1: Math.min(h - 1, b.y1) }));
}

function cropTo(src: Float32Array, w: number, b: Box): Float32Array {
  const cw = b.x1 - b.x0 + 1, ch = b.y1 - b.y0 + 1, out = new Float32Array(cw * ch);
  for (let y = 0; y < ch; y++) out.set(src.subarray((b.y0 + y) * w + b.x0, (b.y0 + y) * w + b.x0 + cw), y * cw);
  return out;
}

/** Windows over this share of the frame are not worth the copies: the map is made on the whole frame. */
const WINDOW_MAX = 0.6;

/**
 * A map of the mask made on the mask's own windows only (maskWindows) and put back on a frame of zeros. The session
 * makes every filled frame's maps (session.ts product: 58 ms a frame on the whole 320 × 180 grid, 88 s of the
 * owner's 50 s hammerhead clip, most of it the signed distance on a grid twice as fine), and a far subject is a
 * hundredth of the frame. The maps below are zero wherever the mask is further away than their reach, so with a
 * margin of that reach the result is the whole frame's.
 */
function windowed(m: Float32Array, w: number, h: number, margin: number, thr: number, others: Float32Array[], fn: (m: Float32Array, cw: number, ch: number, others: Float32Array[]) => Float32Array, full: () => Float32Array): Float32Array {
  const boxes = maskWindows(m, w, h, margin, thr);
  if (!boxes.length) return new Float32Array(w * h);
  let total = 0;
  for (const b of boxes) total += (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1);
  if (total > WINDOW_MAX * w * h) return full();
  const out = new Float32Array(w * h);
  for (const b of boxes) {
    const cw = b.x1 - b.x0 + 1, ch = b.y1 - b.y0 + 1;
    const part = fn(cropTo(m, w, b), cw, ch, others.map((o) => cropTo(o, w, b)));
    for (let y = 0; y < ch; y++) out.set(part.subarray(y * cw, y * cw + cw), (b.y0 + y) * w + b.x0);
  }
  return out;
}

/** sdfFeather on the mask's window: the ramp is 0 from r px outside the 0.5 contour on. */
export function sdfFeatherNear(m: Float32Array, w: number, h: number, r: number, ss = SDF_SS): Float32Array {
  return windowed(m, w, h, r + 3, 0.5, [], (c, cw, ch) => sdfFeather(c, cw, ch, r, ss), () => sdfFeather(m, w, h, r, ss));
}

/** nearMap on the mask's window: the map is 0 from 2r px outside the mask on. */
export function nearMapNear(inc: Float32Array, w: number, h: number, r: number): Float32Array {
  return windowed(inc, w, h, 2 * r + 2, 0.5, [], (c, cw, ch) => nearMap(c, cw, ch, r), () => nearMap(inc, w, h, r));
}

/** guidedFilter on the window of p's non-zero texels: the output is 0 where p is 0 within 2r px all round. */
export function guidedFilterNear(I: Float32Array, p: Float32Array, w: number, h: number, r: number, eps: number): Float32Array {
  return windowed(p, w, h, 2 * r + 2, 0, [I], (c, cw, ch, [ic]) => guidedFilter(ic, c, cw, ch, r, eps), () => guidedFilter(I, p, w, h, r, eps));
}

/**
 * Byte run-length code for 8-bit maps: (count 1..255, value) pairs. A feathered mask is long runs of 0 and 255 with a
 * thin ramp at the edge, so it shrinks ~10–50× (the session keeps every frame's maps this way).
 */
export function rleEncode(src: Uint8Array): Uint8Array {
  const out = new Uint8Array(src.length * 2 + 2);
  let o = 0;
  for (let i = 0; i < src.length;) {
    const v = src[i];
    let n = 1;
    while (n < 255 && i + n < src.length && src[i + n] === v) n++;
    out[o++] = n; out[o++] = v;
    i += n;
  }
  return out.slice(0, o);
}

/** Inverse of rleEncode (n: the decoded length). */
export function rleDecode(rle: Uint8Array, n: number, out = new Uint8Array(n)): Uint8Array {
  let o = 0;
  for (let i = 0; i + 1 < rle.length && o < n; i += 2) {
    const c = Math.min(rle[i], n - o);
    out.fill(rle[i + 1], o, o + c);
    o += c;
  }
  return out;
}
