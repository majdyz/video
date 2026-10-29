// Balance follow: the clip lock's white balance, re-aimed at what the shot's
// material anchor asks for (pure; engine + eval harness). See anchor.ts for
// why the lock alone lets sand drift within a shot.
//
// Each analysis may carry an anchor correction (log R, log B gain relative to
// the lock in force). It is trusted by how much anchor the frame holds
// (open water / surface frames freeze the follow: no evidence, no change) and
// not at all on frames with healthy reds or no cast (calm.ts: an orange
// subject filling the frame, topside); a short running median removes single
// outliers and the offset eases toward it, so the balance never steps.
//
// Tried first and dropped: (1) the per-frame estimate's own balance relative
// to the lock — it was fitted with that frame's own backscatter, so it does
// not neutralise anything under the locked one, and its gray-world vote
// follows composition (the weed coming into view asked for yellow sand);
// (2) a motion-aligned camera gain chain between consecutive thumbnails —
// underwater, tracked content changes distance as the diver swims and the
// red ratio measured red attenuation (×2.2 in 2 s), not the camera.
import type { AnchorResult } from "./anchor.ts";
import { ANCHOR, balanceOffset } from "./anchor.ts";
import type { GradeParams } from "./params.ts";

export const FOLLOW = {
  /** Healthy-red / no-cast scores (calm.ts) above which a frame's anchor is not trusted. */
  calmLo: 0.1,
  calmHi: 0.4,
  /** Running median span (trusted analyses) and the ease time constant (s). */
  window: 3,
  tau: 0.15,
};

export class BalanceFollow {
  /** Current offset, log(R gain), log(B gain) relative to the lock. */
  log: [number, number] = [0, 0];
  private hist: [number, number][] = [];
  private started = false;

  reset(): void {
    this.log = [0, 0];
    this.hist = [];
    this.started = false;
  }

  /** One analysis of the shot: its anchor correction (null = none in frame), the frame's own estimate (for the calm gates), seconds since the previous analysis. */
  update(anchor: AnchorResult | null, frame: GradeParams, dt: number): void {
    const w = anchor ? trust(anchor, frame) : 0;
    if (!anchor || w <= 0) return;
    this.hist.push([anchor.log[0], anchor.log[1]]);
    if (this.hist.length > FOLLOW.window) this.hist.shift();
    const med: [number, number] = [median(this.hist.map((h) => h[0])), median(this.hist.map((h) => h[1]))];
    if (!this.started) {
      // A shot starts where its first trusted frame puts it.
      this.log = med;
      this.started = true;
      return;
    }
    const k = 1 - Math.exp(-Math.max(0, dt) * w / FOLLOW.tau);
    this.log = [this.log[0] + (med[0] - this.log[0]) * k, this.log[1] + (med[1] - this.log[1]) * k];
    // Lagging behind a camera that is taking red away must not leave more red than the recent trusted
    // frames ask for (their median: one outlier cannot pull it): too little red reads cool, too much pink.
    if (w >= 0.5 && this.log[0] > med[0]) this.log[0] = med[0];
  }

  /**
   * The lock in force changed within the shot (a profiled segment boundary
   * without an observed cut): re-express the offset against the new lock so
   * the balance it asks for stays where it was.
   */
  rebase(from: GradeParams, to: GradeParams): void {
    const dr = Math.log(from.wb[0] / to.wb[0]), db = Math.log(from.wb[2] / to.wb[2]);
    const cl = (x: number) => Math.max(-ANCHOR.maxLog, Math.min(ANCHOR.maxLog, x));
    this.log = [cl(this.log[0] + dr), cl(this.log[1] + db)];
    this.hist = this.hist.map(([r, b]) => [r + dr, b + db]);
  }

  /** The locked parameters with the offset applied to the balance (anchor.ts balanceOffset). */
  apply(p: GradeParams): GradeParams {
    return balanceOffset(p, this.log);
  }
}

/** How far a frame's anchor can be trusted (0..1). */
export function trust(a: AnchorResult, frame: GradeParams): number {
  const calm = Math.max(frame.calm ?? 0, frame.calmTone ?? 0);
  return smoothstep(ANCHOR.fracLo, ANCHOR.fracHi, a.frac) * (1 - smoothstep(FOLLOW.calmLo, FOLLOW.calmHi, calm));
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
