// AI subject detection overlay (Studio seg/): with an overlay on the frame, the per-animal strength texture (data
// texture 3) the grade reads carries the ML subject in place of the engine's own per-animal strength
// (composeSegStrength; grade-shader toneWeight). Without an overlay it is the engine's alone (B = A = 0).
import { SEG_TONE } from "./grade-shader.ts";
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
  /** How far each texel departs from the water around it (0..1), or null. */
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

/** The ML water cap reads the departure map blurred over this share of the overlay's width (a region, not a pixel). */
export const SEG_CAP_BLUR = 1 / 30;

/** The local water around the subject (waterL): a normalised blur of the guide's water texels over `blur` of its
 * width, eased (where the subject hides the water that near) into one over `wide`, then the frame's water mean. */
export const SEG_WATER = { blur: 1 / 20, wide: 1 / 5, alphaMax: 0.02 };

type Guide = { width: number; height: number; data: Float32Array };

/**
 * The local water's Oklab L on the overlay grid, from the analysis guide (linear RGB, RGBA): the guide texels the
 * ML mask is well clear of (alpha below SEG_WATER.alphaMax over the whole texel, excluded subjects too), averaged
 * over a region around each point. Null when the frame shows no such water (the subject fills it).
 */
export function waterL(g: Guide, o: SegOverlay): Float32Array | null {
  const gw = g.width, gh = g.height, W = o.width, H = o.height, n = gw * gh;
  const L = new Float32Array(n), wt = new Float32Array(n);
  let sumL = 0, sumW = 0;
  for (let y = 0; y < gh; y++) {
    const oy0 = Math.floor((y * H) / gh), oy1 = Math.min(H, Math.max(oy0 + 1, Math.ceil(((y + 1) * H) / gh)));
    for (let x = 0; x < gw; x++) {
      const ox0 = Math.floor((x * W) / gw), ox1 = Math.min(W, Math.max(ox0 + 1, Math.ceil(((x + 1) * W) / gw)));
      let m = 0;
      for (let oy = oy0; oy < oy1; oy++) for (let ox = ox0; ox < ox1; ox++) {
        const k = oy * W + ox;
        m = Math.max(m, o.alpha[k], o.exclude ? o.exclude[k] : 0);
      }
      const i = y * gw + x, k = i * 4;
      L[i] = linearToOklab(Math.max(0, g.data[k]), Math.max(0, g.data[k + 1]), Math.max(0, g.data[k + 2]))[0];
      wt[i] = m < SEG_WATER.alphaMax ? 1 : 0;
      sumL += L[i] * wt[i];
      sumW += wt[i];
    }
  }
  if (sumW < 1) return null;
  const meanL = sumL / sumW;
  const LW = L.map((v, i) => v * wt[i]);
  const r1 = Math.max(1, Math.round(SEG_WATER.blur * gw)), r2 = Math.max(1, Math.round(SEG_WATER.wide * gw));
  const a1 = blur(LW, gw, gh, r1), w1 = blur(wt, gw, gh, r1), a2 = blur(LW, gw, gh, r2), w2 = blur(wt, gw, gh, r2);
  const field = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const wide = w2[i] > 1e-3 ? a2[i] / w2[i] : meanL;
    field[i] = w1[i] > 1e-4 ? wide + (a1[i] / w1[i] - wide) * Math.min(1, w1[i] / 0.15) : wide;
  }
  // Bilinear onto the overlay grid.
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const fy = Math.min(gh - 1, Math.max(0, ((y + 0.5) / H) * gh - 0.5)), y0 = Math.floor(fy), y1 = Math.min(gh - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = Math.min(gw - 1, Math.max(0, ((x + 0.5) / W) * gw - 0.5)), x0 = Math.floor(fx), x1 = Math.min(gw - 1, x0 + 1), tx = fx - x0;
      const a = field[y0 * gw + x0] + (field[y0 * gw + x1] - field[y0 * gw + x0]) * tx;
      const b = field[y1 * gw + x0] + (field[y1 * gw + x1] - field[y1 * gw + x0]) * tx;
      out[y * W + x] = a + (b - a) * ty;
    }
  }
  return out;
}

/**
 * Overlay (+ the analysis guide) → the RGBA texture the grade reads with an AI overlay on the frame (grade-shader
 * animalStrength / toneWeight, at the overlay's size): R = the local water's Oklab L (waterL; −1 without water to
 * compare with, or without a guide), G = the ML's regional leak cap, B = the ML alpha (the mask's signed distance,
 * as is), A = the ML weight (near map).
 * The cap follows the rule of SEG_TONE, from the overlay's own water-departure map blurred over a region
 * (SEG_CAP_BLUR): water-like regions keep at most waterFloor of the tone unless the ML is sure, the texel well inside
 * the mask and its region departing at least a little from the water. Regional, so a subject whose shaded side
 * happens to match the water is toned whole (no patches), while a leak onto open water (a region of water) stays
 * capped. Without a departure map: in a close-up (`closeUp`, no backdrop) every texel counts as water (the cap
 * holds); in open water nothing is capped here.
 */
export function composeSegStrength(o: SegOverlay, closeUp = false, guide: Guide | null = null): { width: number; height: number; data: Float32Array } {
  const W = o.width, H = o.height;
  const out = new Float32Array(W * H * 4);
  const depB = o.depart ? blur(o.depart, W, H, Math.max(1, Math.round(SEG_CAP_BLUR * W))) : null;
  const wl = guide ? waterL(guide, o) : null;
  for (let i = 0; i < W * H; i++) {
    const a = o.alpha[i];
    let cap = 1;
    if (depB || closeUp) {
      const dep = depB ? depB[i] : 0;
      const sure = sstep(SEG_TONE.confLo, SEG_TONE.confHi, o.near[i]);
      const floorW = SEG_TONE.waterFloor + (1 - SEG_TONE.waterFloor) * sure * sstep(SEG_TONE.insideLo, SEG_TONE.insideHi, a) * sstep(SEG_TONE.departLo, SEG_TONE.departHi, dep);
      cap = floorW + (1 - floorW) * dep;
    }
    out[i * 4] = wl ? wl[i] : -1;
    out[i * 4 + 1] = cap;
    out[i * 4 + 2] = a;
    out[i * 4 + 3] = o.near[i];
  }
  return { width: W, height: H, data: out };
}
