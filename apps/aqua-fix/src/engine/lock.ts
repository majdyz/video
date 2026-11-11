// Clip-lock segment selection (pure, no GPU): which locked estimate is in
// force at a media time, given where each segment's cut was actually seen.
import type { GradeParams, Vec3 } from "./params.ts";

/**
 * One locked estimate from `from` onward. Profiling only samples the clip
 * every ~0.5–1 s, so a cut is known to lie somewhere inside `window` (the two
 * sample times around it): the segment then takes over when the per-frame
 * analysis actually sees the cut inside that window, or at the window's end
 * (lock-track.ts: without a cut it comes in with the picture). `means`: the
 * mean colour of the profile samples either side of the window.
 */
export type LockSegment = { from: number; params: GradeParams; window?: [number, number]; means?: [Vec3, Vec3] };

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

/**
 * A frame's parameters under a locked estimate: the lock's globals, with the
 * frame's own range normalisation (unless `lockRange`) and backdrop surface
 * (it describes this frame's view of the water and moves with the camera).
 */
export function lockParams(l: GradeParams, p: GradeParams, lockRange = false): GradeParams {
  const fit = p.backdropFit ?? l.backdropFit;
  // Seabed recovery follows the frame (a clip that swims from the sand into the blue): its median over a scene was
  // nothing whenever most of the scene was open water.
  const sb = { seabedNeed: p.seabedNeed ?? l.seabedNeed, seabedLw: p.seabedLw ?? l.seabedLw, seabedLb: p.seabedLb ?? l.seabedLb };
  // Haze lift: never more than this frame's own lifted black allows (LOCK_LIFT).
  const own = p.frameBlack ?? p.hazeBlack;
  const k = LOCK_LIFT.margin > 0 && l.hazeBlack > 1e-6 ? Math.min(1, (LOCK_LIFT.margin * own) / l.hazeBlack) : 1;
  const hz = { frameBlack: own, ...(k < 1 ? { hazeBlack: l.hazeBlack * k, hazeFloor: l.hazeFloor.map((f) => f * k) as Vec3 } : {}) };
  return lockRange ? { ...l, ...sb, ...hz, backdropFit: fit } : { ...l, ...sb, ...hz, zLo: p.zLo, zHi: p.zHi, backdropFit: fit };
}

/**
 * The haze lift under a lock. The lock's lifted black is the shot's median; a frame of the same shot whose own black
 * sits below it (the camera's exposure hunting over sand, a tilt from reef toward brighter water: half of any shot,
 * by definition of a median) had more subtracted than it held, and its low tones went to the toe: the picture
 * darkened by up to 20 L* and came back with the next frame (lightness pumping, colour review P3/P5). The lift
 * therefore uses the smaller of the lock's black and `margin` × the frame's own (the frame's value arrives eased like
 * its range, engine TAU_PARAMS). Frames at or above the lock keep the lock: the lift never follows a frame upward.
 * margin 0 turns the follow off.
 */
export const LOCK_LIFT = { margin: 1.1 };

/** Clip time between analyses, preview and export alike (engine tick / analyzeDue): the grade of a frame depends on the clip, not on timing. */
export const ANALYSIS_SLOT_S = 0.1;
/** The analysis slot a clip time falls in. */
export function analysisSlot(timeSec: number, slotSec = ANALYSIS_SLOT_S): number {
  return Math.floor(timeSec / slotSec + 1e-6);
}
