// Trim range maths (pure, no DOM): the in/out selection on the timeline, the
// analysis span around it, which frames and audio packets an export keeps,
// and how source time maps to output time. Tested in test/trim.test.ts.
//
// Times are clip seconds: 0 is the first video frame, the same clock as the
// <video> element's currentTime and the exporters' `timeSec`.

export type TrimRange = { start: number; end: number };

/** Shortest selection the handles allow (the colour profile needs ≥ 0.5 s too). */
export const MIN_TRIM_SEC = 0.5;
/** Extra source analysed on each side of the selection, so the path smoothing has context at the cut. */
export const ANALYSIS_MARGIN_SEC = 0.5;
/** Below this a range edge counts as the clip's own start / end. */
const EDGE_EPS = 1e-3;

/** The whole clip. */
export function fullRange(duration: number): TrimRange {
  return { start: 0, end: Math.max(0, duration) };
}

/**
 * A valid range inside [0, duration]: ordered, at least `min` long (or the
 * whole clip when it is shorter than that).
 */
export function clampRange(r: TrimRange, duration: number, min = MIN_TRIM_SEC): TrimRange {
  const d = Math.max(0, Number.isFinite(duration) ? duration : 0);
  const len = Math.min(min, d);
  let start = Number.isFinite(r.start) ? r.start : 0;
  let end = Number.isFinite(r.end) ? r.end : d;
  if (end < start) [start, end] = [end, start];
  start = Math.min(Math.max(0, start), d - len);
  end = Math.max(Math.min(d, end), start + len);
  return { start, end };
}

/** True when the range cuts something off the clip (null = no trim). */
export function isTrimmed(r: TrimRange | null | undefined, duration: number): r is TrimRange {
  return !!r && (r.start > EDGE_EPS || r.end < duration - EDGE_EPS);
}

/** The trim to apply, or null when the range is the whole clip. */
export function effectiveTrim(r: TrimRange | null | undefined, duration: number): TrimRange | null {
  return isTrimmed(r, duration) ? clampRange(r, duration) : null;
}

/** Output length in seconds. */
export function outputLength(r: TrimRange | null | undefined, duration: number): number {
  const t = effectiveTrim(r, duration);
  return t ? t.end - t.start : Math.max(0, duration);
}

/** What the motion analysis covers for a trim: the range plus a margin each side, inside the clip. */
export function analysisSpan(r: TrimRange | null | undefined, duration: number, margin = ANALYSIS_MARGIN_SEC): TrimRange | null {
  const t = effectiveTrim(r, duration);
  if (!t) return null;
  const s = { start: Math.max(0, t.start - margin), end: Math.min(duration, t.end + margin) };
  return isTrimmed(s, duration) ? s : null;
}

/** True when `outer` (null = the whole clip) contains `inner` (null = the whole clip). */
export function spanCovers(outer: TrimRange | null, inner: TrimRange | null, eps = 1e-3): boolean {
  if (!outer) return true;
  if (!inner) return false;
  return outer.start <= inner.start + eps && outer.end >= inner.end - eps;
}

/**
 * Whether an analysis made over `analysed` still serves the trim `want`:
 * it must cover it, and not be so much larger that re-running on the
 * smaller span is clearly worth it (more than 3× the needed length).
 */
export function spanServes(analysed: TrimRange | null, want: TrimRange | null, duration: number): boolean {
  if (!spanCovers(analysed, want)) return false;
  const a = analysed ? analysed.end - analysed.start : duration;
  const w = want ? want.end - want.start : duration;
  return a <= 3 * w + 1e-6;
}

/**
 * Does the frame starting at `t` (clip seconds) belong to the trimmed
 * output? A frame is kept when its start lies in [start, end), with half a
 * frame of tolerance for timestamps that don't sit exactly on the grid, so
 * 2.0–4.0 s of a 30 fps clip is exactly 60 frames.
 */
export function frameInRange(t: number, r: TrimRange | null, fps: number): boolean {
  if (!r) return true;
  const half = 0.5 / (fps > 0 ? fps : 30);
  return t >= r.start - half && t < r.end - half;
}

/** Output timestamp of a kept frame: clip time minus the first kept frame's time. */
export function outputTime(t: number, firstKept: number): number {
  return Math.max(0, t - firstKept);
}

/**
 * An audio packet [ts, ts + dur) (clip seconds) against the range: null when
 * it lies outside, otherwise its output timestamp (shifted by `offset`, the
 * first video frame's clip time, clamped at 0). Packets overlapping the cut
 * are kept whole: one AAC packet is ~21 ms.
 */
export function audioPacketTime(ts: number, dur: number, r: TrimRange | null, offset: number): number | null {
  const end = r ? r.end : Infinity;
  const start = r ? r.start : 0;
  if (ts + dur <= start || ts >= end) return null;
  if (ts - offset + dur <= 0) return null;
  return Math.max(0, ts - offset);
}

/** Preview loop: where playback at `t` should be (null = leave it). */
export function loopTarget(t: number, r: TrimRange | null, fps = 30): number | null {
  if (!r) return null;
  const frame = 1 / (fps > 0 ? fps : 30);
  if (t >= r.end - 0.5 * frame || t < r.start - 2 * frame) return r.start;
  return null;
}

/** A seek inside the selection. */
export function clampToRange(t: number, r: TrimRange | null, duration: number): number {
  const lo = r ? r.start : 0;
  const hi = r ? r.end : duration;
  return Math.min(Math.max(lo, t), hi);
}

/** Moves one handle to `t`, keeping the other where it is and the minimum length. */
export function moveHandle(r: TrimRange, which: "in" | "out", t: number, duration: number, min = MIN_TRIM_SEC): TrimRange {
  const len = Math.min(min, duration);
  if (which === "in") return { start: Math.min(Math.max(0, t), r.end - len), end: r.end };
  return { start: r.start, end: Math.max(Math.min(duration, t), r.start + len) };
}

/**
 * I / O keys: the in or out point at the playhead. An in point at or past the
 * out point (or the reverse) starts a fresh selection to the clip's end (start).
 */
export function trimAt(which: "in" | "out", t: number, trim: TrimRange | null, duration: number): TrimRange {
  const r = trim ?? fullRange(duration);
  if (which === "in" && t >= r.end) return clampRange({ start: t, end: duration }, duration);
  if (which === "out" && t <= r.start) return clampRange({ start: 0, end: t }, duration);
  return moveHandle(r, which, t, duration);
}

/** Pointer x (px from the track's left edge) → clip time. */
export function timeAtX(x: number, width: number, duration: number): number {
  if (!(width > 0) || !(duration > 0)) return 0;
  return Math.min(1, Math.max(0, x / width)) * duration;
}

/** Clip time → percent of the track. */
export function pctOf(t: number, duration: number): number {
  return duration > 0 ? Math.min(100, Math.max(0, (t / duration) * 100)) : 0;
}

/** Which handle a press at time `t` grabs when both are within reach (the nearer one; ties go to the side pressed on). */
export function nearestHandle(r: TrimRange, t: number): "in" | "out" {
  const di = Math.abs(t - r.start), dout = Math.abs(t - r.end);
  if (Math.abs(di - dout) < 1e-9) return t < r.start ? "in" : "out";
  return di < dout ? "in" : "out";
}

/** Colour-profile sample times for the range: the profile's own spacing, shifted into it. */
export function rangeTimes(times: (len: number) => number[], r: TrimRange | null, duration: number): number[] {
  if (!r) return times(duration);
  return times(r.end - r.start).map((t) => r.start + t);
}

/** Clock text: m:ss (durations round to the nearest second, positions floor). */
export function formatClock(s: number, round = false): string {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const whole = round ? Math.round(s) : Math.floor(s + 1e-6);
  const m = Math.floor(whole / 60);
  return `${m}:${(whole % 60).toString().padStart(2, "0")}`;
}

/** Timecode with tenths, m:ss.t (handles while dragging, the playhead). */
export function formatTimecode(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const tenths = Math.round(s * 10);
  const m = Math.floor(tenths / 600);
  const rest = tenths - m * 600;
  const sec = Math.floor(rest / 10);
  return `${m}:${sec.toString().padStart(2, "0")}.${rest % 10}`;
}

/** "0:12 of 1:47": the selection's length and the clip's. Short selections get tenths so 2.0 s doesn't read 0:01. */
export function selectionLabel(r: TrimRange | null, duration: number): string {
  const len = outputLength(r, duration);
  const sel = len < 10 && isTrimmed(r, duration) ? formatTimecode(len) : formatClock(len, true);
  return `${sel} of ${formatClock(duration, true)}`;
}

/** Evenly spaced filmstrip thumbnail times (frame centres of `count` equal slots). */
export function filmstripTimes(duration: number, count: number): number[] {
  if (!(duration > 0) || count < 1) return [];
  return Array.from({ length: count }, (_, i) => Math.min(Math.max(0, duration - 0.05), ((i + 0.5) / count) * duration));
}
