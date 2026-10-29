// Dense optical flow for carrying subject masks between keyframes (AI subject detection). A small DIS-style
// estimator (Kroeger et al. 2016, without the variational refinement): coarse to fine over a Gaussian pyramid,
// inverse-compositional Lucas-Kanade on overlapping 8 px patches every 4 px, densified by photometric-error
// weighting. On the 320 px mask grid it costs a few ms; masks move with the animal, the mask's own soft edge
// absorbs the small errors. Pure, deterministic, no DOM.

export type Flow = { width: number; height: number; /** (dx, dy) per pixel, interleaved */ data: Float32Array };

const PATCH = 8;
const STRIDE = 5;
const ITERS = 6;
/** Smaller Hessian eigenvalue per patch pixel below which a patch is untextured (luma 0..1 units). */
const TEXTURE_MIN = 2e-5;
/** Flow smoothing radius per level (px). */
const SMOOTH_R = 2;
const MIN_LEVEL_SIDE = 20;

/** Grey image as floats 0..1. */
export type Gray = { width: number; height: number; data: Float32Array };

export function grayFromU8(data: Uint8Array | Uint8ClampedArray, width: number, height: number): Gray {
  const f = new Float32Array(width * height);
  for (let i = 0; i < f.length; i++) f[i] = data[i] / 255;
  return { width, height, data: f };
}

function blurDown(g: Gray): Gray {
  // 1-2-1 blur then 2× decimation.
  const w = g.width, h = g.height, nw = Math.max(1, w >> 1), nh = Math.max(1, h >> 1);
  const tmp = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const l = g.data[y * w + Math.max(0, x - 1)], c = g.data[y * w + x], r = g.data[y * w + Math.min(w - 1, x + 1)];
      tmp[y * w + x] = 0.25 * l + 0.5 * c + 0.25 * r;
    }
  }
  const out = new Float32Array(nw * nh);
  for (let y = 0; y < nh; y++) {
    const sy = Math.min(h - 1, 2 * y);
    const u = Math.max(0, sy - 1), d = Math.min(h - 1, sy + 1);
    for (let x = 0; x < nw; x++) {
      const sx = Math.min(w - 1, 2 * x);
      out[y * nw + x] = 0.25 * tmp[u * w + sx] + 0.5 * tmp[sy * w + sx] + 0.25 * tmp[d * w + sx];
    }
  }
  return { width: nw, height: nh, data: out };
}

function pyramid(g: Gray): Gray[] {
  const p = [g];
  while (Math.min(p[p.length - 1].width, p[p.length - 1].height) >= 2 * MIN_LEVEL_SIDE) p.push(blurDown(p[p.length - 1]));
  return p;
}

function sample(d: Float32Array, w: number, h: number, x: number, y: number): number {
  x = x < 0 ? 0 : x > w - 1 ? w - 1 : x;
  y = y < 0 ? 0 : y > h - 1 ? h - 1 : y;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = x0 + 1 < w ? x0 + 1 : x0, y1 = y0 + 1 < h ? y0 + 1 : y0;
  const fx = x - x0, fy = y - y0;
  const a = d[y0 * w + x0] + (d[y0 * w + x1] - d[y0 * w + x0]) * fx;
  const b = d[y1 * w + x0] + (d[y1 * w + x1] - d[y1 * w + x0]) * fx;
  return a + (b - a) * fy;
}

/** Flow on `a`'s grid: a(x) ≈ b(x + flow(x)). */
export function denseFlow(a: Gray, b: Gray): Flow {
  if (a.width !== b.width || a.height !== b.height) throw new Error("denseFlow: size mismatch");
  const pa = pyramid(a), pb = pyramid(b);
  let flow: Float32Array | null = null;
  let fw = 0, fh = 0;
  for (let l = pa.length - 1; l >= 0; l--) {
    const A = pa[l], B = pb[l], w = A.width, h = A.height, Ad = A.data, Bd = B.data;
    // Initial dense flow: the coarser level's, doubled (bilinear).
    const init = new Float32Array(w * h * 2);
    if (flow) {
      for (let y = 0; y < h; y++) {
        const sy = Math.min(fh - 1, Math.max(0, (y + 0.5) / 2 - 0.5)), y0 = Math.floor(sy), y1 = Math.min(fh - 1, y0 + 1), ty = sy - y0;
        for (let x = 0; x < w; x++) {
          const sx = Math.min(fw - 1, Math.max(0, (x + 0.5) / 2 - 0.5)), x0 = Math.floor(sx), x1 = Math.min(fw - 1, x0 + 1), tx = sx - x0;
          for (let c = 0; c < 2; c++) {
            const p = flow[(y0 * fw + x0) * 2 + c] * (1 - tx) + flow[(y0 * fw + x1) * 2 + c] * tx;
            const q = flow[(y1 * fw + x0) * 2 + c] * (1 - tx) + flow[(y1 * fw + x1) * 2 + c] * tx;
            init[(y * w + x) * 2 + c] = 2 * (p * (1 - ty) + q * ty);
          }
        }
      }
    }
    // Gradients of A (central differences).
    const gx = new Float32Array(w * h), gy = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        gx[i] = 0.5 * (Ad[y * w + Math.min(w - 1, x + 1)] - Ad[y * w + Math.max(0, x - 1)]);
        gy[i] = 0.5 * (Ad[Math.min(h - 1, y + 1) * w + x] - Ad[Math.max(0, y - 1) * w + x]);
      }
    }
    const P = Math.min(PATCH, w, h), S = Math.max(1, Math.min(STRIDE, P >> 1)), PP = P * P;
    const xs: number[] = [], ys: number[] = [];
    for (let x = 0; x + P <= w; x += S) xs.push(x);
    if (xs[xs.length - 1] !== w - P) xs.push(w - P);
    for (let y = 0; y + P <= h; y += S) ys.push(y);
    if (ys[ys.length - 1] !== h - P) ys.push(h - P);
    const acc = new Float32Array(w * h * 2), wsum = new Float32Array(w * h);
    const bs = new Float32Array(PP);
    for (const py of ys) {
      for (const px of xs) {
        // Hessian of the patch (inverse compositional: constant over the iterations).
        let hxx = 0, hxy = 0, hyy = 0, am = 0, sgx = 0, sgy = 0, sgxa = 0, sgya = 0;
        for (let y = py; y < py + P; y++) for (let x = px; x < px + P; x++) {
          const i = y * w + x, u = gx[i], v = gy[i];
          hxx += u * u; hxy += u * v; hyy += v * v; am += Ad[i]; sgx += u; sgy += v; sgxa += u * Ad[i]; sgya += v * Ad[i];
        }
        am /= PP;
        const det = hxx * hyy - hxy * hxy;
        // Texture test: the smaller eigenvalue of the Hessian (flat water has no usable gradient).
        const tr = hxx + hyy, lmin = 0.5 * (tr - Math.sqrt(Math.max(0, tr * tr - 4 * det)));
        const ci = ((py + (P >> 1)) * w + px + (P >> 1)) * 2;
        const u0 = init[ci], v0 = init[ci + 1];
        let u = u0, v = v0, ok = lmin > TEXTURE_MIN * PP;
        if (ok) {
          for (let it = 0; it < ITERS; it++) {
            // Mean-normalised residual (robust to a brightness change between the frames), one pass over the patch.
            let sb = 0, sgxb = 0, sgyb = 0, k = 0;
            for (let y = py; y < py + P; y++) for (let x = px; x < px + P; x++, k++) {
              const bv = sample(Bd, w, h, x + u, y + v), i = y * w + x;
              bs[k] = bv; sb += bv; sgxb += gx[i] * bv; sgyb += gy[i] * bv;
            }
            const dm = sb / PP - am;
            const ex = sgxb - sgxa - dm * sgx, ey = sgyb - sgya - dm * sgy;
            const du = (hyy * ex - hxy * ey) / det, dv = (hxx * ey - hxy * ex) / det;
            u -= du; v -= dv;
            if (du * du + dv * dv < 1e-3) break;
          }
          // A patch that ran away (beyond the coarse estimate by more than its size) keeps the coarse estimate.
          if (Math.abs(u - u0) > P || Math.abs(v - v0) > P || !Number.isFinite(u + v)) { u = u0; v = v0; ok = false; }
        }
        // Densify: each pixel of the patch takes the patch's flow, weighted by the patch's texture and by how well it
        // explains that pixel; an untextured patch only carries the coarse estimate, weakly.
        const conf = ok ? Math.min(1, lmin / (TEXTURE_MIN * PP * 8)) : 0.05;
        let k = 0;
        for (let y = py; y < py + P; y++) for (let x = px; x < px + P; x++, k++) {
          const i = y * w + x;
          const r = ok ? Math.abs(sample(Bd, w, h, x + u, y + v) - Ad[i]) : 0.05;
          const wt = conf / Math.max(0.02, r);
          acc[i * 2] += wt * u; acc[i * 2 + 1] += wt * v; wsum[i] += wt;
        }
      }
    }
    let next: Float32Array = new Float32Array(w * h * 2);
    for (let i = 0; i < w * h; i++) {
      if (wsum[i] > 0) { next[i * 2] = acc[i * 2] / wsum[i]; next[i * 2 + 1] = acc[i * 2 + 1] / wsum[i]; }
      else { next[i * 2] = init[i * 2]; next[i * 2 + 1] = init[i * 2 + 1]; }
    }
    next = smoothFlow(next, w, h, SMOOTH_R);
    flow = next; fw = w; fh = h;
  }
  return { width: fw, height: fh, data: flow! };
}

/** Box-smoothed flow (a light regulariser in place of DIS's variational refinement). */
function smoothFlow(f: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(f.length), out = new Float32Array(f.length), n = 2 * r + 1;
  for (let y = 0; y < h; y++) for (let c = 0; c < 2; c++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += f[(y * w + Math.min(w - 1, Math.max(0, k))) * 2 + c];
    for (let x = 0; x < w; x++) {
      tmp[(y * w + x) * 2 + c] = s / n;
      s += f[(y * w + Math.min(w - 1, x + r + 1)) * 2 + c] - f[(y * w + Math.max(0, x - r)) * 2 + c];
    }
  }
  for (let x = 0; x < w; x++) for (let c = 0; c < 2; c++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += tmp[(Math.min(h - 1, Math.max(0, k)) * w + x) * 2 + c];
    for (let y = 0; y < h; y++) {
      out[(y * w + x) * 2 + c] = s / n;
      s += tmp[(Math.min(h - 1, y + r + 1) * w + x) * 2 + c] - tmp[(Math.max(0, y - r) * w + x) * 2 + c];
    }
  }
  return out;
}

/** m resampled at x + k·flow(x) (bilinear, edges replicated): `m` from flow's target frame onto its source grid. */
export function warp(m: Float32Array, flow: Flow, k = 1, out?: Float32Array): Float32Array {
  const w = flow.width, h = flow.height, o = out ?? new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      o[i] = sample(m, w, h, x + k * flow.data[i * 2], y + k * flow.data[i * 2 + 1]);
    }
  }
  return o;
}
