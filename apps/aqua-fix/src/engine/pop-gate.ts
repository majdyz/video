// Subject-pop stability gate. The subject tone is the riskiest thing the
// grade does: a mask that fragments, jumps or flickers reads as a glitch,
// far worse than no tone. Each analysis' subject map (the open-water object
// channel of the fields texture) is compared with the previous one after the
// best small shift (the animal swims): a low temporal IoU or a jump in
// coverage drives the gate's target to 0, and the engine eases the gate
// slowly (≥ 0.5 s) so the tone fades rather than snaps.

export const POP_GATE = {
  /** Mask threshold on the subject map. */
  on: 0.5,
  /** Shift search radius (half-resolution map texels). */
  shift: 3,
  /** Temporal IoU ramp → gate target. */
  iouLo: 0.45,
  iouHi: 0.7,
  /** Coverage ratio (smaller / larger) ramp. */
  covLo: 0.55,
  covHi: 0.8,
  /** Below this coverage (share of the frame) there is nothing to gate (target 1). */
  minArea: 0.003,
  /** Gate easing time constants (s): fade out faster than in, both ≥ 0.5 s. */
  tauDown: 0.5,
  tauUp: 1.0,
};

/** Half-resolution binary subject mask from RGBA fields (channel 1). */
export function subjectMask(fields: Float32Array, w: number, h: number): { m: Uint8Array; w: number; h: number; area: number } {
  const mw = w >> 1, mh = h >> 1;
  const m = new Uint8Array(mw * mh);
  let area = 0;
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
    const i = (2 * y * w + 2 * x) * 4 + 1;
    const v = (fields[i] + fields[i + 4] + fields[i + w * 4] + fields[i + w * 4 + 4]) * 0.25;
    if (v >= POP_GATE.on) { m[y * mw + x] = 1; area++; }
  }
  return { m, w: mw, h: mh, area: area / (mw * mh) };
}

/** Best IoU of `b` against `a` over integer shifts within ±POP_GATE.shift. */
export function shiftedIoU(a: Uint8Array, b: Uint8Array, w: number, h: number): number {
  const R = POP_GATE.shift;
  let best = 0;
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    let inter = 0, uni = 0;
    for (let y = 0; y < h; y++) {
      const yb = y + dy;
      for (let x = 0; x < w; x++) {
        const xb = x + dx;
        const va = a[y * w + x];
        const vb = yb >= 0 && yb < h && xb >= 0 && xb < w ? b[yb * w + xb] : 0;
        inter += va & vb;
        uni += va | vb;
      }
    }
    if (uni > 0 && inter / uni > best) best = inter / uni;
  }
  return best;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Gate target for consecutive masks (1 = stable, 0 = unstable). */
export function gateTarget(prev: { m: Uint8Array; area: number } | null, cur: { m: Uint8Array; w: number; h: number; area: number }): number {
  if (!prev) return 0;
  if (cur.area < POP_GATE.minArea && prev.area < POP_GATE.minArea) return 1;
  const cov = Math.min(cur.area, prev.area) / Math.max(cur.area, prev.area, 1e-6);
  const iou = shiftedIoU(prev.m, cur.m, cur.w, cur.h);
  return smoothstep(POP_GATE.iouLo, POP_GATE.iouHi, iou) * smoothstep(POP_GATE.covLo, POP_GATE.covHi, cov);
}
