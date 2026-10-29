// AI subject detection overlay (Studio seg/): the ML subject mask joins the per-animal strength texture (data
// texture 3) the grade reads. R/G stay the engine's own per-animal strength and interior hold (cut by the
// excluded subjects), B is the ML alpha and A where (and how much) it replaces the engine's subject weight; see
// grade-shader toneWeight. Without an overlay B = A = 0 and the grade is the engine's alone.

export type SegOverlay = {
  width: number;
  height: number;
  /** Pop alpha 0..1 (feathered). */
  alpha: Float32Array;
  /** Excluded subjects 0..1 (feathered), or null. */
  exclude: Float32Array | null;
  /** ML weight per texel 0..1 (the confidence weight times the region near the ML subject). */
  near: Float32Array;
};

/** Engine strength texture (any size, RGBA) + overlay → one RGBA texture at the overlay's size. */
export function composeSegStrength(st: { width: number; height: number; data: Float32Array }, o: SegOverlay): { width: number; height: number; data: Float32Array } {
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
      out[i * 4 + 2] = o.alpha[i];
      out[i * 4 + 3] = o.near[i];
    }
  }
  return { width: W, height: H, data: out };
}
