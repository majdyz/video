// AI subject detection overlay (Studio seg/): with an overlay on the frame, the per-animal strength texture (data
// texture 3) the grade reads carries the ML subject in place of the engine's own per-animal strength
// (composeSegStrength; grade-shader toneWeight). Without an overlay it is the engine's alone (B = A = 0).
import { linearToOklab } from "./color.ts";

function sstep(lo: number, hi: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
}

export type SegOverlay = {
  width: number;
  height: number;
  /** Pop alpha 0..1: the mask's signed distance (0.5 on its contour, linear to 1 / 0 at SEG_TONE.alphaR mask px in / out). */
  alpha: Float32Array;
  /** Excluded subjects 0..1 (feathered), or null. */
  exclude: Float32Array | null;
  /** ML weight per texel 0..1 (the confidence weight times the region near the ML subject). */
  near: Float32Array;
  /** How far each texel departs from the water around it (0..1), or null (studio seg/; the grade tells water from
   * the subject with composeSegStrength's own water field). */
  depart?: Float32Array | null;
};

/**
 * The ML subject's lightness against the water around it, from the analysis guide (linear RGB, RGBA) and the ML
 * overlay: ln(subject luminance / water luminance), the water being the ring the near map reaches outside the mask.
 * Null when either side is too small to tell. The engine averages it over the clip (popDirection of the mean), so the
 * subject's look is decided once, not frame by frame as it swims off into the haze.
 */
export function popContrast(g: { width: number; height: number; data: Float32Array }, o: SegOverlay): number | null {
  let ls = 0, ns = 0, lr = 0, nr = 0;
  for (let y = 0; y < g.height; y++) {
    const oy = Math.min(o.height - 1, Math.floor(((y + 0.5) / g.height) * o.height));
    for (let x = 0; x < g.width; x++) {
      const i = oy * o.width + Math.min(o.width - 1, Math.floor(((x + 0.5) / g.width) * o.width));
      const k = (y * g.width + x) * 4, L = 0.2126 * g.data[k] + 0.7152 * g.data[k + 1] + 0.0722 * g.data[k + 2];
      if (o.alpha[i] > 0.6) { ls += L; ns++; } else if (o.alpha[i] < 0.05 && o.near[i] > 0.15) { lr += L; nr++; }
    }
  }
  if (ns < 4 || nr < 4 || lr <= 0) return null;
  return Math.log(Math.max(1e-6, ls / ns) / (lr / nr));
}

/**
 * Subject pop lift direction from the clip's mean popContrast: +1 lifts the subject (about as light as the water or
 * lighter), −1 deepens it (clearly darker: a close-up silhouette against bright water, where a lift would only bring
 * it closer to the water).
 */
export function popDirection(meanContrast: number): number {
  return 1 - 2 * sstep(POP_DARK.lo, POP_DARK.hi, -meanContrast);
}

/** popDirection: the subject turns from lifted to deepened as it gets this much darker than the water (−ln ratio). */
export const POP_DARK = { lo: 0.12, hi: 0.35 };

/** Separable box blur, radius r (texels), edges clamped. */
function blur(src: Float32Array, W: number, H: number, r: number): Float32Array {
  const tmp = new Float32Array(W * H), out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[y * W + Math.min(W - 1, Math.max(0, k))];
    for (let x = 0; x < W; x++) {
      tmp[y * W + x] = acc / (2 * r + 1);
      acc += src[y * W + Math.min(W - 1, x + r + 1)] - src[y * W + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < W; x++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += tmp[Math.min(H - 1, Math.max(0, k)) * W + x];
    for (let y = 0; y < H; y++) {
      out[y * W + x] = acc / (2 * r + 1);
      acc += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x];
    }
  }
  return out;
}

/**
 * The local water and the subject's regional evidence (waterField), on the analysis guide's grid: the water is a
 * normalised blur of the guide texels the ML mask is well clear of (alpha below alphaMax over the whole texel,
 * excluded subjects too) over `blur` of the guide's width, eased (where the subject hides the water that near) into
 * one over `wide`, then the frame's water mean. A texel inside the mask is evidence of the subject as far as its
 * colour departs from that water (Oklab ΔE evLo..evHi, a lower bar than the per-pixel test: a shaded belly still
 * counts); the regional trust is the share of evidence
 * around it (a box of ±`region` of the width) over trustLo..trustHi: deep in an animal, a shaded part that matches
 * the water is toned with the rest; a mask that leaked onto the water (a region of water inside it) is not, nor
 * the water just inside a fat contour.
 */
export const SEG_WATER = { blur: 1 / 20, wide: 1 / 5, alphaMax: 0.02, evLo: 0.012, evHi: 0.035, region: 1 / 32, trustLo: 0.25, trustHi: 0.6 };

type Guide = { width: number; height: number; data: Float32Array };

/** Bilinear resize of a w × h map to W × H (pixel centres aligned). */
function resample(f: Float32Array, w: number, h: number, W: number, H: number): Float32Array {
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const fy = Math.min(h - 1, Math.max(0, ((y + 0.5) / H) * h - 0.5)), y0 = Math.floor(fy), y1 = Math.min(h - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = Math.min(w - 1, Math.max(0, ((x + 0.5) / W) * w - 0.5)), x0 = Math.floor(fx), x1 = Math.min(w - 1, x0 + 1), tx = fx - x0;
      const a = f[y0 * w + x0] + (f[y0 * w + x1] - f[y0 * w + x0]) * tx;
      const b = f[y1 * w + x0] + (f[y1 * w + x1] - f[y1 * w + x0]) * tx;
      out[y * W + x] = a + (b - a) * ty;
    }
  }
  return out;
}

/**
 * The local water's Oklab L and the regional trust (see SEG_WATER) on the overlay grid, from the analysis guide
 * (linear RGB, RGBA). Null when the frame shows no water clear of the mask (the subject fills it).
 */
export function waterField(g: Guide, o: SegOverlay): { L: Float32Array; trust: Float32Array } | null {
  const gw = g.width, gh = g.height, W = o.width, H = o.height, n = gw * gh;
  const lab = new Float32Array(n * 3), wt = new Float32Array(n), inside = new Uint8Array(n);
  const sum = [0, 0, 0];
  let sumW = 0;
  for (let y = 0; y < gh; y++) {
    const oy0 = Math.floor((y * H) / gh), oy1 = Math.min(H, Math.max(oy0 + 1, Math.ceil(((y + 1) * H) / gh)));
    for (let x = 0; x < gw; x++) {
      const ox0 = Math.floor((x * W) / gw), ox1 = Math.min(W, Math.max(ox0 + 1, Math.ceil(((x + 1) * W) / gw)));
      let m = 0, a = 0, c = 0;
      for (let oy = oy0; oy < oy1; oy++) for (let ox = ox0; ox < ox1; ox++) {
        const k = oy * W + ox;
        m = Math.max(m, o.alpha[k], o.exclude ? o.exclude[k] : 0);
        a += o.alpha[k];
        c++;
      }
      const i = y * gw + x, k = i * 4;
      const v = linearToOklab(Math.max(0, g.data[k]), Math.max(0, g.data[k + 1]), Math.max(0, g.data[k + 2]));
      lab[i * 3] = v[0]; lab[i * 3 + 1] = v[1]; lab[i * 3 + 2] = v[2];
      wt[i] = m < SEG_WATER.alphaMax ? 1 : 0;
      inside[i] = a / c > 0.5 ? 1 : 0;
      for (let q = 0; q < 3; q++) sum[q] += v[q] * wt[i];
      sumW += wt[i];
    }
  }
  if (sumW < 1) return null;
  const r1 = Math.max(1, Math.round(SEG_WATER.blur * gw)), r2 = Math.max(1, Math.round(SEG_WATER.wide * gw));
  const w1 = blur(wt, gw, gh, r1), w2 = blur(wt, gw, gh, r2);
  const water = [0, 1, 2].map((q) => {
    const f = new Float32Array(n);
    for (let i = 0; i < n; i++) f[i] = lab[i * 3 + q] * wt[i];
    const a1 = blur(f, gw, gh, r1), a2 = blur(f, gw, gh, r2), out = new Float32Array(n), mean = sum[q] / sumW;
    for (let i = 0; i < n; i++) {
      const wide = w2[i] > 1e-3 ? a2[i] / w2[i] : mean;
      out[i] = w1[i] > 1e-4 ? wide + (a1[i] / w1[i] - wide) * Math.min(1, w1[i] / 0.15) : wide;
    }
    return out;
  });
  const ev = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (!inside[i]) continue;
    const d = Math.hypot(lab[i * 3] - water[0][i], lab[i * 3 + 1] - water[1][i], lab[i * 3 + 2] - water[2][i]);
    ev[i] = sstep(SEG_WATER.evLo, SEG_WATER.evHi, d);
  }
  const dens = blur(ev, gw, gh, Math.max(1, Math.round(SEG_WATER.region * gw)));
  const trust = dens.map((v) => sstep(SEG_WATER.trustLo, SEG_WATER.trustHi, v));
  return { L: resample(water[0], gw, gh, W, H), trust: resample(trust, gw, gh, W, H) };
}

/**
 * Overlay (+ the analysis guide) → the RGBA texture the grade reads with an AI overlay on the frame (grade-shader
 * animalStrength / toneWeight, at the overlay's size): R = the local water's Oklab L (−1 without water to compare
 * with, or without a guide: every pixel then counts as the subject), G = the regional trust (waterField: how far the
 * mask is trusted over the pixel's own departure from the water; 1 without a guide), B = the ML alpha (the mask's
 * signed distance, as is), A = the ML weight (near map).
 */
export function composeSegStrength(o: SegOverlay, guide: Guide | null = null): { width: number; height: number; data: Float32Array } {
  const W = o.width, H = o.height;
  const out = new Float32Array(W * H * 4);
  const wf = guide ? waterField(guide, o) : null;
  for (let i = 0; i < W * H; i++) {
    out[i * 4] = wf ? wf.L[i] : -1;
    out[i * 4 + 1] = wf ? wf.trust[i] : 1;
    out[i * 4 + 2] = o.alpha[i];
    out[i * 4 + 3] = o.near[i];
  }
  return { width: W, height: H, data: out };
}
