// AI subject detection overlay (Studio seg/): the ML subject mask joins the per-animal strength texture (data
// texture 3) the grade reads. R/G stay the engine's own per-animal strength and interior hold (cut by the
// excluded subjects), B is the ML alpha and A where (and how much) it replaces the engine's subject weight; see
// grade-shader toneWeight. Without an overlay B = A = 0 and the grade is the engine's alone.
import { SEG_TONE } from "./grade-shader.ts";

function sstep(lo: number, hi: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
}

export type SegOverlay = {
  width: number;
  height: number;
  /** Pop alpha 0..1 (feathered). */
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

/**
 * Engine strength texture (any size, RGBA) + overlay → one RGBA texture at the overlay's size. The ML's water cap is
 * applied here, from the overlay's own water-departure map blurred over a region (SEG_CAP_BLUR), with the rule of
 * SEG_TONE: water-like regions keep at most waterFloor of the tone unless the ML is sure, the texel well inside the
 * mask and its region departing at least a little from the water. Regional, so a subject whose shaded side happens
 * to match the water is toned whole (no patches), while a leak onto open water (a region of water) stays capped.
 * Without a departure map: in a close-up (`closeUp`, no backdrop) every texel counts as water (the cap holds); in
 * open water nothing is capped here.
 */
export function composeSegStrength(st: { width: number; height: number; data: Float32Array }, o: SegOverlay, closeUp = false): { width: number; height: number; data: Float32Array } {
  const W = o.width, H = o.height, w = st.width, h = st.height, s = st.data;
  const out = new Float32Array(W * H * 4);
  const depB = o.depart ? blur(o.depart, W, H, Math.max(1, Math.round(SEG_CAP_BLUR * W))) : null;
  for (let y = 0; y < H; y++) {
    const fy = Math.min(h - 1, Math.max(0, ((y + 0.5) / H) * h - 0.5)), y0 = Math.floor(fy), y1 = Math.min(h - 1, y0 + 1), ty = fy - y0;
    const ny = Math.min(h - 1, Math.floor(((y + 0.5) / H) * h));
    for (let x = 0; x < W; x++) {
      const fx = Math.min(w - 1, Math.max(0, ((x + 0.5) / W) * w - 0.5)), x0 = Math.floor(fx), x1 = Math.min(w - 1, x0 + 1), tx = fx - x0;
      const nx = Math.min(w - 1, Math.floor(((x + 0.5) / W) * w));
      const g0 = s[(y0 * w + x0) * 4 + 1] + (s[(y0 * w + x1) * 4 + 1] - s[(y0 * w + x0) * 4 + 1]) * tx;
      const g1 = s[(y1 * w + x0) * 4 + 1] + (s[(y1 * w + x1) * 4 + 1] - s[(y1 * w + x0) * 4 + 1]) * tx;
      const i = y * W + x, keep = o.exclude ? 1 - o.exclude[i] : 1;
      out[i * 4] = s[(ny * w + nx) * 4] * keep;
      out[i * 4 + 1] = (g0 + (g1 - g0) * ty) * keep;
      let a = o.alpha[i];
      if (depB || closeUp) {
        const dep = depB ? depB[i] : 0;
        const sure = sstep(SEG_TONE.confLo, SEG_TONE.confHi, o.near[i]);
        const floorW = SEG_TONE.waterFloor + (1 - SEG_TONE.waterFloor) * sure * sstep(SEG_TONE.insideLo, SEG_TONE.insideHi, a) * sstep(SEG_TONE.departLo, SEG_TONE.departHi, dep);
        a *= floorW + (1 - floorW) * dep;
      }
      out[i * 4 + 2] = a;
      out[i * 4 + 3] = o.near[i];
    }
  }
  return { width: W, height: H, data: out };
}
