// Person presence gate: the selfie segmenter always finds "a subject", so its
// mask only counts inside boxes a real person detector drew (padded, since
// fins and outstretched arms reach past a COCO box). Pure, for tests.

/** A detected person as fractions of the frame. */
export type PersonBox = { x: number; y: number; w: number; h: number; score: number };

/** Each box grows by this fraction of its own size on every side … */
export const PERSON_BOX_PAD = 0.3;
/** … and the gate then fades to 0 over this further fraction. */
export const PERSON_BOX_FADE = 0.15;
/** Detections below this score are ignored. */
export const PERSON_BOX_MIN_SCORE = 0.3;

/**
 * Union of the padded boxes as a soft map on a `fw`×`fh` grid: 1 inside a
 * padded box, fading to 0 just outside it. No boxes → all zero.
 */
export function boxGate(boxes: readonly PersonBox[], fw: number, fh: number, pad = PERSON_BOX_PAD, fade = PERSON_BOX_FADE): Float32Array {
  const out = new Float32Array(fw * fh);
  for (const b of boxes) {
    const x0 = b.x - b.w * pad, x1 = b.x + b.w * (1 + pad);
    const y0 = b.y - b.h * pad, y1 = b.y + b.h * (1 + pad);
    const fx = Math.max(1e-3, b.w * fade), fy = Math.max(1e-3, b.h * fade);
    for (let y = 0; y < fh; y++) {
      const cy = (y + 0.5) / fh;
      const dy = Math.max(y0 - cy, cy - y1, 0);
      const wy = Math.max(0, 1 - dy / fy);
      if (wy <= 0) continue;
      for (let x = 0; x < fw; x++) {
        const cx = (x + 0.5) / fw;
        const dx = Math.max(x0 - cx, cx - x1, 0);
        const w = wy * Math.max(0, 1 - dx / fx);
        const i = y * fw + x;
        if (w > out[i]) out[i] = w;
      }
    }
  }
  return out;
}
