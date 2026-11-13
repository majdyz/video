// The clip lock over time (pure; the engine and the eval harness share it):
// which estimate is in force at a clip time, as one frozen estimate per shot.
//
//  - A segment that starts at a cut (seen by the analysis, or a user split:
//    no window) takes over there, whole.
//  - A segment whose window passes without a cut is the same shot changing (a
//    dissolve, a pan from the surface to dark rock). Its share follows how far
//    the frames have moved from the profile sample before the window to the
//    one after it (fadeProgress; two analyses in a row must agree and it only
//    grows): a dissolve is graded in step with the picture, and nothing moves
//    before the picture does. By the window's end the segment is in force.
//    (Before: the old estimate held to the window's end and the new one eased
//    in after it over ~2 s, so a 1 s dissolve from a boat to green water was
//    graded as the boat until well after it.)
//  - Each segment carries its shot's balance curve (follow.ts): a constant, or
//    a slow one-way change over clip time.
//
// Outside an unseen window the result depends on the clip time alone, so a
// frame's globals do not depend on playback history, seeks or worker timing.
import { applyCurve, type ShotCurve } from "./follow.ts";
import { inCutWindow, noteCut, switchTime, type LockSegment } from "./lock.ts";
import { lerpParams, type GradeParams, type Vec3 } from "./params.ts";

/** Ease (s) of a windowed segment's share between analyses (they arrive every ANALYSIS_SLOT_S; the share must not step). */
export const FADE_TAU_S = 0.12;

/** How far a frame of mean colour `m` has moved from the sample before a profiled change (`means[0]`) to the one after it (`means[1]`), 0..1. */
export function fadeProgress(means: readonly [Vec3, Vec3], m: Vec3): number {
  const [a, b] = means;
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const n = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  if (n < 1e-8) return 0;
  return Math.min(1, Math.max(0, ((m[0] - a[0]) * d[0] + (m[1] - a[1]) * d[1] + (m[2] - a[2]) * d[2]) / n));
}

export class LockTrack {
  readonly segments: LockSegment[];
  readonly cutSeen = new Map<number, number>();
  /** Balance curve per segment (follow.ts shotBalance); empty until measured. */
  curves: (ShotCurve | null)[] = [];
  /** Per windowed segment: the progress the analyses have seen, the last frame's, and the share in force (eased). */
  private seen = new Map<number, number>();
  private last = new Map<number, number>();
  private shown = new Map<number, number>();
  private time = Number.NaN;

  constructor(segments: readonly LockSegment[]) {
    this.segments = [...segments].sort((a, b) => a.from - b.from);
  }

  /** A scene cut seen at `timeSec`: windowed segments waiting for theirs switch there. */
  noteCut(timeSec: number): void {
    noteCut(this.segments, this.cutSeen, timeSec);
  }

  /** An analysed frame (its mean colour) at `timeSec`: moves the share of a segment whose window holds it. */
  noteFrame(mean: Vec3, timeSec: number): void {
    this.segments.forEach((s, i) => {
      if (!s.window || !s.means || this.cutSeen.has(i) || timeSec < s.window[0] || timeSec >= s.window[1]) { this.last.delete(i); return; }
      const p = fadeProgress(s.means, mean), prev = this.last.get(i);
      this.last.set(i, p);
      // One frame alone (a flash, a burst of bubbles) does not move the grade.
      if (prev !== undefined) this.seen.set(i, Math.max(this.seen.get(i) ?? 0, Math.min(p, prev)));
    });
  }

  /** The share segment `i` should have at `timeSec` (0 = not yet, 1 = in force). */
  private aim(i: number, timeSec: number): number {
    const s = this.segments[i];
    if (i === 0 || timeSec >= switchTime(s, i, this.cutSeen)) return 1;
    if (!s.window || timeSec < s.window[0]) return 0;
    return this.seen.get(i) ?? 0;
  }

  /**
   * Moves the clock to `timeSec`. Shares ease while the clip plays through a
   * window (a step forward of at most 0.5 s, `snap` false); a seek, a cut, a
   * snapped analysis or any time outside a window sets them at once.
   */
  advance(timeSec: number, snap = false): void {
    const dt = timeSec - this.time;
    const playing = !snap && dt >= 0 && dt <= 0.5;
    this.time = timeSec;
    this.segments.forEach((s, i) => {
      if (!s.window) return;
      if (timeSec < s.window[0]) { this.seen.delete(i); this.last.delete(i); }
      const aim = this.aim(i, timeSec);
      const fading = playing && !this.cutSeen.has(i) && timeSec >= s.window[0] && timeSec < s.window[1] + 4 * FADE_TAU_S;
      const cur = this.shown.get(i) ?? 0;
      this.shown.set(i, fading ? cur + (aim - cur) * (1 - Math.exp(-dt / FADE_TAU_S)) : aim);
    });
  }

  private share(i: number, timeSec: number): number {
    return this.segments[i].window && timeSec === this.time ? this.shown.get(i) ?? this.aim(i, timeSec) : this.aim(i, timeSec);
  }

  /** Index of the segment in force at `timeSec` (the last one with at least half the share). */
  index(timeSec: number): number {
    let k = 0;
    for (let i = 1; i < this.segments.length; i++) if (this.share(i, timeSec) >= 0.5) k = i;
    return k;
  }

  /** True while one shot's estimate is handing over to the next through an uncut window (a dissolve): the frame belongs to neither shot yet. */
  blending(timeSec: number): boolean {
    for (let i = 1; i < this.segments.length; i++) { const w = this.share(i, timeSec); if (w > 0.02 && w < 0.98) return true; }
    return false;
  }

  /** The locked estimate at `timeSec`, each shot with its balance curve, blended through an uncut window. */
  paramsAt(timeSec: number, withCurves = true): GradeParams {
    const of = (i: number) => (withCurves ? applyCurve(this.segments[i].params, this.curves[i], timeSec) : this.segments[i].params);
    let p = of(0);
    for (let i = 1; i < this.segments.length; i++) {
      const w = this.share(i, timeSec);
      if (w >= 1) p = of(i);
      else if (w > 0) p = lerpParams(p, of(i), w);
    }
    return p;
  }

  /** True while `timeSec` lies inside a window whose cut hasn't been seen (callers may analyse every frame there). */
  inCutWindow(timeSec: number): boolean {
    return inCutWindow(this.segments, this.cutSeen, timeSec);
  }

  /** Forgets what playback saw (cuts, fades): a new run over the clip. */
  reset(): void {
    this.cutSeen.clear();
    this.seen.clear();
    this.last.clear();
    this.shown.clear();
    this.time = Number.NaN;
  }
}
