// Split / per-segment maths (pure, no DOM): the cuts the user placed on the
// timeline, which of them are in force inside the trim, which segment a frame
// belongs to, and the scene lock that re-locks the grade at every cut.
// Tested in test/segments.test.ts.
//
// Model: `cuts` are sorted clip times; they divide the whole clip into
// `cuts.length + 1` regions, and region i owns `looks[i]` (its colour
// settings). Only cuts strictly inside the trim (at least MIN_SEGMENT_SEC from
// its edges and from each other) divide what is shown and exported: the
// others are kept but ignored, so trimming back out restores them.

import type { TrimRange } from "./trim.ts";

export type Segments<L> = { cuts: number[]; looks: L[] };
/** One segment as the timeline shows it: its span (inside the trim) and the region whose look it uses. */
export type SegmentSpan = { look: number; start: number; end: number };

/** Shortest segment a split or a drag may leave. */
export const MIN_SEGMENT_SEC = 0.5;

function rangeOf(range: TrimRange | null, duration: number): TrimRange {
  return range ?? { start: 0, end: Math.max(0, duration) };
}

/** Indices of the cuts in force inside `range` (null = the whole clip). */
export function activeCuts(cuts: readonly number[], range: TrimRange | null, duration: number, min = MIN_SEGMENT_SEC): number[] {
  const r = rangeOf(range, duration);
  const out: number[] = [];
  let last = r.start;
  cuts.forEach((c, i) => {
    if (c >= last + min - 1e-6 && c <= r.end - min + 1e-6) {
      out.push(i);
      last = c;
    }
  });
  return out;
}

/** True when the clip is divided inside the range (more than one segment shows). */
export function isSplit(cuts: readonly number[], range: TrimRange | null, duration: number): boolean {
  return activeCuts(cuts, range, duration).length > 0;
}

/**
 * The segments inside the range, left to right. The first one uses the
 * region at the range's start (cuts before it, or too close to it, are
 * ignored); each later one the region right after its cut.
 */
export function visibleSegments(cuts: readonly number[], range: TrimRange | null, duration: number): SegmentSpan[] {
  const r = rangeOf(range, duration);
  const act = activeCuts(cuts, range, duration);
  const firstLook = act.length ? act[0] : cuts.filter((c) => c <= r.end).length;
  const out: SegmentSpan[] = [{ look: firstLook, start: r.start, end: r.end }];
  for (const i of act) {
    out[out.length - 1].end = cuts[i];
    out.push({ look: i + 1, start: cuts[i], end: r.end });
  }
  return out;
}

/**
 * Which region's look applies to the frame starting at `t` (clip seconds).
 * A frame belongs to the segment its start lies in, with half a frame of
 * tolerance, so the frame on a cut at 3.0 s (30 fps) opens the next segment.
 */
export function lookIndexAt(cuts: readonly number[], t: number, range: TrimRange | null, duration: number, fps = 30): number {
  const segs = visibleSegments(cuts, range, duration);
  const half = 0.5 / (fps > 0 ? fps : 30);
  let look = segs[0].look;
  for (let i = 1; i < segs.length; i++) if (t >= segs[i].start - half) look = segs[i].look;
  return look;
}

/** "Segment 2 of 3" numbers for a region's look (null when that region isn't on screen, or nothing is split). */
export function segmentNumber(cuts: readonly number[], look: number, range: TrimRange | null, duration: number): { index: number; count: number } | null {
  const segs = visibleSegments(cuts, range, duration);
  if (segs.length < 2) return null;
  const i = segs.findIndex((s) => s.look === look);
  return i < 0 ? null : { index: i + 1, count: segs.length };
}

/** The visible segment under time `t` (taps on the strip). */
export function segmentAtTime(cuts: readonly number[], t: number, range: TrimRange | null, duration: number): SegmentSpan {
  const segs = visibleSegments(cuts, range, duration);
  let seg = segs[0];
  for (const s of segs) if (t >= s.start) seg = s;
  return seg;
}

/**
 * Splits at `t`: the region it lands in is divided and both halves keep its
 * look. Null when the split isn't allowed: outside the trim, or closer than
 * MIN_SEGMENT_SEC to the trim's edges or to a cut in force. `initial` is the
 * look of an unsplit clip (the first split creates the looks).
 */
export function splitAt<L>(s: Segments<L>, t: number, range: TrimRange | null, duration: number, initial: L, min = MIN_SEGMENT_SEC): Segments<L> | null {
  if (!Number.isFinite(t)) return null;
  const r = rangeOf(range, duration);
  if (t < r.start + min - 1e-6 || t > r.end - min + 1e-6) return null;
  const act = activeCuts(s.cuts, range, duration);
  if (act.some((i) => Math.abs(s.cuts[i] - t) < min - 1e-6)) return null;
  const looks = s.cuts.length ? s.looks.slice() : [initial];
  // Ignored cuts this close to the new one would make a sliver region: the split replaces them.
  const cuts = s.cuts.slice();
  for (let i = cuts.length - 1; i >= 0; i--) {
    if (Math.abs(cuts[i] - t) < 1e-3) {
      cuts.splice(i, 1);
      looks.splice(i + 1, 1);
    }
  }
  const at = cuts.filter((c) => c < t).length;
  cuts.splice(at, 0, t);
  looks.splice(at + 1, 0, looks[at]);
  return { cuts, looks };
}

/** Removes cut `k`: its two regions merge and keep the left one's look. */
export function removeCut<L>(s: Segments<L>, k: number): Segments<L> {
  if (k < 0 || k >= s.cuts.length) return s;
  const cuts = s.cuts.slice();
  const looks = s.looks.slice();
  cuts.splice(k, 1);
  looks.splice(k + 1, 1);
  return { cuts, looks };
}

/**
 * Drags cut `k` to `t`, kept MIN_SEGMENT_SEC inside its neighbours (the
 * cuts in force on either side, else the trim's edges). Returns new cuts.
 */
export function moveCut(cuts: readonly number[], k: number, t: number, range: TrimRange | null, duration: number, min = MIN_SEGMENT_SEC): number[] {
  if (k < 0 || k >= cuts.length) return cuts.slice();
  const r = rangeOf(range, duration);
  const act = activeCuts(cuts, range, duration);
  const pos = act.indexOf(k);
  const lo = (pos > 0 ? cuts[act[pos - 1]] : r.start) + min;
  const hi = (pos >= 0 && pos < act.length - 1 ? cuts[act[pos + 1]] : r.end) - min;
  // Ignored neighbours keep the order: never cross another cut.
  const prev = k > 0 ? cuts[k - 1] + 1e-3 : -Infinity;
  const next = k < cuts.length - 1 ? cuts[k + 1] - 1e-3 : Infinity;
  const a = Math.max(lo, prev), b = Math.min(hi, next);
  const out = cuts.slice();
  out[k] = b < a ? cuts[k] : Math.min(b, Math.max(a, t));
  return out;
}

/** Region index → its new index after `removeCut(k)` (selection follows the merge). */
export function lookAfterRemove(look: number, k: number): number {
  return look > k ? look - 1 : look;
}

// ------------------------------------------------------------ scene lock

export type LockLike<P> = { from: number; params: P; window?: [number, number] };
export type SampleLike<P> = { t: number; params: P };

/**
 * The clip's scene lock with the user's cuts forced in: every cut in force
 * starts a new locked estimate exactly at its frame (from = cut − half a
 * frame, no detection window), estimated from the profile samples inside
 * that segment (their median, ≥ 2 samples; else the automatic segment's own
 * estimate). The automatic cuts (scene changes the profile found) still
 * apply inside each segment, their windows clipped to it. `auto` null (too
 * few samples to lock) stays null: the engine then runs unlocked.
 */
export function lockWithCuts<P>(auto: LockLike<P>[] | null, samples: readonly SampleLike<P>[], bounds: readonly number[], median: (ps: P[]) => P, fps = 30): LockLike<P>[] | null {
  if (!auto || !auto.length) return auto;
  if (!bounds.length) return auto;
  const half = 0.5 / (fps > 0 ? fps : 30);
  const sorted = [...auto].sort((a, b) => a.from - b.from);
  const edges = [-Infinity, ...bounds, Infinity];
  const out: LockLike<P>[] = [];
  for (let p = 0; p < edges.length - 1; p++) {
    const ps = edges[p], pe = edges[p + 1];
    for (let j = 0; j < sorted.length; j++) {
      const as = j === 0 ? -Infinity : sorted[j].from;
      const ae = j + 1 < sorted.length ? sorted[j + 1].from : Infinity;
      const s = Math.max(ps, as), e = Math.min(pe, ae);
      if (!(e > s)) continue;
      const inside = samples.filter((x) => x.t >= s && x.t < e).map((x) => x.params);
      const params = inside.length >= 2 ? median(inside) : sorted[j].params;
      const atCut = s === ps && p > 0;
      const seg: LockLike<P> = { from: atCut ? ps - half : s === -Infinity ? sorted[0].from : s, params };
      if (!atCut && sorted[j].window && s === as) {
        const w0 = Math.max(sorted[j].window![0], ps), w1 = Math.min(sorted[j].window![1], pe);
        if (w1 > w0) seg.window = [w0, w1];
      }
      out.push(seg);
    }
  }
  return out;
}

/**
 * Extra profile sample times so every segment in force has at least `per`
 * samples of its own (the base times are the clip profile's spacing). Each
 * short segment gets `per` evenly spaced frames inside it.
 */
export function topUpTimes(base: readonly number[], segs: readonly SegmentSpan[], per = 2): number[] {
  if (segs.length < 2) return [];
  const extra: number[] = [];
  for (const s of segs) {
    const have = base.filter((t) => t >= s.start && t < s.end).length;
    if (have >= per) continue;
    const len = s.end - s.start;
    for (let i = 0; i < per; i++) extra.push(s.start + (len * (i + 1)) / (per + 1));
  }
  return extra;
}
