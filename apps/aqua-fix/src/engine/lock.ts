// Clip-lock segment selection (pure, no GPU): which locked estimate is in
// force at a media time, given where each segment's cut was actually seen.
import type { GradeParams } from "./params.ts";

/**
 * One locked estimate from `from` onward. Profiling only samples the clip
 * every ~0.5–1 s, so a cut is known to lie somewhere inside `window` (the two
 * sample times around it): the segment then takes over when the per-frame
 * analysis actually sees the cut inside that window, or at the window's end.
 */
export type LockSegment = { from: number; params: GradeParams; window?: [number, number] };

/** When segment `index` takes over: at its observed cut, else at the end of its window, else at `from`. */
export function switchTime(s: LockSegment, index: number, cutSeen: ReadonlyMap<number, number>): number {
  const seen = cutSeen.get(index);
  if (seen !== undefined) return seen;
  return s.window ? s.window[1] : s.from;
}

/** The segment in force at `timeSec` (segments sorted by `from`). */
export function segmentAt(segments: readonly LockSegment[], cutSeen: ReadonlyMap<number, number>, timeSec: number): LockSegment {
  let seg = segments[0];
  segments.forEach((s, i) => { if (timeSec >= switchTime(s, i, cutSeen)) seg = s; });
  return seg;
}

/** True while `timeSec` lies inside a segment's cut window whose cut hasn't been seen yet. */
export function inCutWindow(segments: readonly LockSegment[], cutSeen: ReadonlyMap<number, number>, timeSec: number): boolean {
  return segments.some((s, i) => s.window !== undefined && !cutSeen.has(i) && timeSec >= s.window[0] && timeSec < s.window[1]);
}

/** Records a scene cut seen at `timeSec`: windowed segments still waiting for theirs switch there. */
export function noteCut(segments: readonly LockSegment[], cutSeen: Map<number, number>, timeSec: number): void {
  segments.forEach((s, i) => {
    if (s.window && !cutSeen.has(i) && timeSec >= s.window[0] && timeSec <= s.window[1]) cutSeen.set(i, timeSec);
  });
}
