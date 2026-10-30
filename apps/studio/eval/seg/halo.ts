// Subject pop halo metric: how much the pop changes the water right outside the subject, against water farther out.
// The subject is the ML mask's 0.5 contour (the feathered alpha, upsampled bilinearly to the frame as the shader
// reads it). ΔL = CIE L* (pop on) − L* (pop off) per pixel; the halo is mean ΔL in a ring rLo..rHi px outside the
// contour minus mean ΔL in water fLo..fHi px out (≈ 0 when the pop stays on the subject; a glow reads > 1).
// Also: the lift on the subject (mean ΔL ≥ 3 px inside) and the ring's mean ΔE. Pure, deterministic.
import { distanceTransform } from "../../src/pipeline/seg/mask.ts";
import { lab } from "./robust.ts";

export const HALO_RING = { rLo: 2, rHi: 15, fLo: 30, fHi: 60, inside: 3 };

/** Bilinear upsample (pixel centres aligned) of a mask-grid map to W × H. */
export function upsample(m: Float32Array, mw: number, mh: number, W: number, H: number): Float32Array {
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const fy = Math.min(mh - 1, Math.max(0, ((y + 0.5) / H) * mh - 0.5)), y0 = Math.floor(fy), y1 = Math.min(mh - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = Math.min(mw - 1, Math.max(0, ((x + 0.5) / W) * mw - 0.5)), x0 = Math.floor(fx), x1 = Math.min(mw - 1, x0 + 1), tx = fx - x0;
      const a = m[y0 * mw + x0] + (m[y0 * mw + x1] - m[y0 * mw + x0]) * tx;
      const b = m[y1 * mw + x0] + (m[y1 * mw + x1] - m[y1 * mw + x0]) * tx;
      out[y * W + x] = a + (b - a) * ty;
    }
  }
  return out;
}

export type Halo = { halo: number; ringDL: number; farDL: number; ringDE: number; liftDL: number; nRing: number; nFar: number; nIn: number };

/** `on` / `off`: RGBA frames (W × H); `mask`: the subject at W × H (> 0.5 = subject). Null when a region is empty. */
export function halo(on: Uint8ClampedArray, off: Uint8ClampedArray, mask: Float32Array, W: number, H: number): Halo | null {
  const n = W * H, inside = new Uint8Array(n), outside = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const b = mask[i] > 0.5; inside[i] = b ? 1 : 0; outside[i] = b ? 0 : 1; }
  // distanceTransform: distance to the nearest 0 → dOut (outside pixels to the subject), dIn (inside to the water).
  const dOut = distanceTransform(outside, W, H), dIn = distanceTransform(inside, W, H);
  const R = HALO_RING;
  let rs = 0, rn = 0, fs = 0, fn = 0, es = 0, is = 0, inn = 0;
  for (let i = 0; i < n; i++) {
    const ring = !inside[i] && dOut[i] >= R.rLo && dOut[i] <= R.rHi, far = !inside[i] && dOut[i] >= R.fLo && dOut[i] <= R.fHi, inn3 = inside[i] && dIn[i] >= R.inside;
    if (!ring && !far && !inn3) continue;
    const p = lab(on[i * 4], on[i * 4 + 1], on[i * 4 + 2]), q = lab(off[i * 4], off[i * 4 + 1], off[i * 4 + 2]);
    const dl = p[0] - q[0];
    if (ring) { rs += dl; rn++; es += Math.hypot(dl, p[1] - q[1], p[2] - q[2]); }
    if (far) { fs += dl; fn++; }
    if (inn3) { is += dl; inn++; }
  }
  if (rn < 50 || fn < 50 || inn < 50) return null;
  const r2 = (x: number) => +x.toFixed(2);
  return { halo: r2(rs / rn - fs / fn), ringDL: r2(rs / rn), farDL: r2(fs / fn), ringDE: r2(es / rn), liftDL: r2(is / inn), nRing: rn, nFar: fn, nIn: inn };
}
