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
 * Engine strength texture (any size, RGBA) + overlay → one RGBA texture at the overlay's size. `closeUp`: the engine
 * sees no open water (no backdrop to tell the water by in the shader), so the ML's water cap is applied here, from
 * the overlay's own water-departure map, with the shader's rule (grade-shader toneWeight, SEG_TONE): water-like
 * texels keep at most waterFloor of the tone unless the ML is sure, the texel well inside the mask and departing
 * at least a little from the water. Without a departure map every texel counts as water (the cap holds).
 */
export function composeSegStrength(st: { width: number; height: number; data: Float32Array }, o: SegOverlay, closeUp = false): { width: number; height: number; data: Float32Array } {
  const W = o.width, H = o.height, w = st.width, h = st.height, s = st.data;
  const out = new Float32Array(W * H * 4);
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
      if (closeUp) {
        const dep = o.depart ? o.depart[i] : 0;
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
