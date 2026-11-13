// Shot balance: one white balance per shot, frozen (pure; worker + eval harness).
//
// The clip lock holds one estimate per shot. On top of it a shot gets one
// balance offset from its material anchor (anchor.ts), pooled over the
// profile's frames of that shot: every frame that holds enough anchor says
// which red / blue gain would put the shot's sand where the lock put it, and
//
//  - when those corrections do not agree on a direction over the shot
//    (estimator noise: a grey animal passing, composition, a clamp), the shot
//    keeps one constant offset, their confidence-weighted median. Nothing
//    follows the frame;
//  - when they move one way through the shot, consistently and by more than
//    SHOT.deadband (a real change: the camera's auto white balance warming
//    through a tilt from sand into blue water, a descent), the offset is a
//    monotone, rate-limited curve over clip time through the pooled values
//    (isotonic fit): it can ease one way, slowly, and never swings back. A
//    change that sits in one gap between frames is a step (a new subject),
//    not a trend, and does not count.
//
// The offset is a function of clip time alone (curveAt), so a frame's balance
// does not depend on playback history, seeks or worker timing, and preview
// and export agree by construction.
//
// Replaced (10 Nov): a per-frame follow (running median of 3 analyses, 0.15 s
// ease) of the same anchor. It took out the camera drift of the user's tilt
// clip, but it followed the estimator everywhere else: red gain 4.76 → 1.87
// inside one whale-shark shot, reef to lavender through a tilt, 18 of 47
// valset clips with a balance swing over 1.25x in 8 s (review-fable P3).
// Tried before that and dropped: the per-frame estimate's own balance (fitted
// with that frame's backscatter; its gray-world vote follows composition) and
// a motion-aligned camera gain chain (it measured red attenuation).
import { ANCHOR, anchorColour, anchorCorrection, balanceOffset } from "./anchor.ts";
import { analyzeThumbnail } from "./analyze.ts";
import { lockParams } from "./lock.ts";
import type { GradeParams } from "./params.ts";
import { greenWeight } from "./red.ts";

export const FOLLOW = {
  /** Healthy-red / no-cast scores (calm.ts) above which a frame's anchor is not trusted. */
  calmLo: 0.1,
  calmHi: 0.4,
  /** Open-water validity (GradeParams.backdrop) over which the anchor is not trusted. */
  openLo: 0.05,
  openHi: 0.3,
};

export const SHOT = {
  /** Frames at least this trusted count toward a trend; a shot needs this many of them (fewer: constant). */
  trendTrust: 0.5,
  minSamples: 4,
  /** Kendall rank correlation of the corrections with time from which they count as one-directional. */
  kendall: 0.8,
  /** Total change over the shot (log gain) below which it is not worth moving for. */
  deadband: 0.1,
  /** Largest share of that change one gap between frames may hold: more is a step (a diver swimming up to the
   *  lens, a different thing in frame), which is a change of subject, not of the light. */
  stepMax: 0.6,
  /** Fastest the offset may move (log gain per second): ×1.5 takes four seconds. */
  maxRate: 0.1,
  /** Largest total change of the offset over one shot (log gain): just under ×1.25 end to end. A longer trend is compressed
   *  about its middle (tilt_reef_to_blue_barracuda still moved ×1.33 inside one shot). */
  maxSwing: Math.log(1.24),
  /** Spread of the corrections (weighted median absolute deviation, log gain) from which a constant offset is
   *  backed off, and where it is dropped: frames that disagree about the offset are no evidence for one. */
  spreadLo: 0.06,
  spreadHi: 0.18,
  /** A correction still this far (Oklab a/b) from the target after the solve did not converge: not a sample. */
  residual: 0.008,
};

/** One profile frame's anchor correction (log R, log B gain against the shot's lock), its clip time and trust (0..1). */
export type ShotSample = { t: number; log: [number, number]; w: number };
/** A shot's balance offset over clip time: knots (ascending t), linear between, constant outside. One knot = frozen. */
export type ShotCurve = { t: number[]; r: number[]; b: number[] };

/**
 * A shot's balance offset from its pooled anchor corrections. Frozen (one
 * knot: their weighted median, backed off toward the plain lock when they
 * disagree) unless the well-anchored frames move the red gain one way through
 * the shot; then a monotone, rate-limited curve through them. Null without a
 * trusted frame (the shot keeps the plain lock).
 */
export function shotCurve(samples: readonly ShotSample[]): ShotCurve | null {
  const s = samples.filter((x) => x.w > 0 && Number.isFinite(x.log[0]) && Number.isFinite(x.log[1])).sort((a, b) => a.t - b.t);
  if (!s.length) return null;
  const w = s.map((x) => x.w);
  const constant = (x: number[]) => {
    const m = weightedMedian(x, w);
    const spread = weightedMedian(x.map((v) => Math.abs(v - m)), w);
    return m * (1 - smoothstep(SHOT.spreadLo, SHOT.spreadHi, spread));
  };
  const flat: ShotCurve = { t: [weightedMedian(s.map((x) => x.t), w)], r: [constant(s.map((x) => x.log[0]))], b: [constant(s.map((x) => x.log[1]))] };
  const k = s.filter((x) => x.w >= SHOT.trendTrust);
  if (k.length < SHOT.minSamples) return flat;
  const t = k.map((x) => x.t), kw = k.map((x) => x.w);
  // The red gain decides (it is what a camera's white balance and the water column move most); blue comes along
  // when it has a direction of its own, else it keeps the well-anchored frames' median.
  const r = trend(t, k.map((x) => x.log[0]), kw);
  if (!r || Math.abs(r[r.length - 1] - r[0]) < SHOT.deadband) return flat;
  const b = trend(t, k.map((x) => x.log[1]), kw) ?? t.map(() => weightedMedian(k.map((x) => x.log[1]), kw));
  return { t, r, b };
}

/** One channel's monotone, rate-limited fit at the sample times, or null when the samples have no one direction. */
function trend(t: number[], x: number[], w: number[]): number[] | null {
  // Single outliers out (3-point median; an end takes the median of itself twice and its neighbour: itself).
  const sm = x.map((_, i) => median3(x[Math.max(0, i - 1)], x[i], x[Math.min(x.length - 1, i + 1)]));
  const tau = kendall(sm);
  if (Math.abs(tau) < SHOT.kendall) return null;
  const fit = isotonic(sm, w, tau > 0);
  const total = Math.abs(fit[fit.length - 1] - fit[0]);
  for (let i = 1; i < fit.length; i++) if (Math.abs(fit[i] - fit[i - 1]) > SHOT.stepMax * total) return null;
  // Rate limit, outward from the middle of the shot (so neither end is favoured).
  const mid = fit.length >> 1;
  for (let i = mid + 1; i < fit.length; i++) fit[i] = clampAround(fit[i], fit[i - 1], SHOT.maxRate * (t[i] - t[i - 1]));
  for (let i = mid - 1; i >= 0; i--) fit[i] = clampAround(fit[i], fit[i + 1], SHOT.maxRate * (t[i + 1] - t[i]));
  // Bounded swing: the whole trend is compressed about its mid value.
  const lo = Math.min(fit[0], fit[fit.length - 1]), hi = Math.max(fit[0], fit[fit.length - 1]);
  const k = hi - lo > SHOT.maxSwing ? SHOT.maxSwing / (hi - lo) : 1, c = (lo + hi) / 2;
  return fit.map((v) => Math.max(-ANCHOR.maxLog, Math.min(ANCHOR.maxLog, c + (v - c) * k)));
}

/** The offset (log R, log B gain) at clip time `t`; [0, 0] without a curve. */
export function curveAt(c: ShotCurve | null | undefined, t: number): [number, number] {
  if (!c || !c.t.length) return [0, 0];
  const n = c.t.length;
  if (n === 1 || t <= c.t[0]) return [c.r[0], c.b[0]];
  if (t >= c.t[n - 1]) return [c.r[n - 1], c.b[n - 1]];
  let i = 1;
  while (c.t[i] < t) i++;
  const k = (t - c.t[i - 1]) / Math.max(1e-6, c.t[i] - c.t[i - 1]);
  return [c.r[i - 1] + (c.r[i] - c.r[i - 1]) * k, c.b[i - 1] + (c.b[i] - c.b[i - 1]) * k];
}

/** The locked parameters with the shot's offset at clip time `t` applied to the balance (anchor.ts balanceOffset). */
export function applyCurve(p: GradeParams, c: ShotCurve | null | undefined, t: number): GradeParams {
  return c ? balanceOffset(p, curveAt(c, t)) : p;
}

/**
 * A locked shot's balance from the profile's own frames of it (`times`: their
 * clip times): the colour its anchor should keep, and the offset curve that
 * keeps it there.
 *
 * The target (Oklab a, b) is what the locked estimate makes of the anchor,
 * the median over the frames that hold enough of it and pass the scene gates:
 * the lock's look is kept, only the drift around it is taken out. It is never
 * pinker than ANCHOR.pinkMax past neutral (sand never pink). With fewer than
 * two usable frames the shot keeps the plain lock (null).
 */
export function shotBalance(thumbs: readonly Uint8ClampedArray[], times: readonly number[], w: number, h: number, lock: GradeParams): { target: [number, number]; curve: ShotCurve | null; samples: ShotSample[] } | null {
  const frames = thumbs.map((px, i) => ({ px, t: times[i] ?? i, a: analyzeThumbnail(px, w, h) }));
  const as: number[] = [], bs: number[] = [];
  for (const f of frames) {
    if (sceneTrust(f.a.params) < 0.5) continue;
    const c = anchorColour(f.px, w, h, lockParams(lock, f.a.params), f.a.depth, f.a.clahe);
    if (!c || c.frac < ANCHOR.fracHi) continue;
    as.push(c.ab[0]);
    bs.push(c.ab[1]);
  }
  if (as.length < 2) return null;
  const target: [number, number] = [Math.min(median(as), ANCHOR.neutral[0] + ANCHOR.pinkMax), median(bs)];
  const samples: ShotSample[] = [];
  for (const f of frames) {
    const scene = sceneTrust(f.a.params);
    if (scene <= 0) continue;
    const c = anchorCorrection(f.px, w, h, lockParams(lock, f.a.params), f.a.depth, f.a.clahe, target);
    if (!c) continue;
    // A solve that ran into the clamp or stopped short of the target has no answer for this frame.
    const pinned = Math.max(Math.abs(c.log[0]), Math.abs(c.log[1])) >= ANCHOR.maxLog - 1e-6;
    const short = Math.hypot(c.after[0] - target[0], c.after[1] - target[1]) > SHOT.residual;
    if (!pinned && !short) samples.push({ t: f.t, log: c.log, w: smoothstep(ANCHOR.fracLo, ANCHOR.fracHi, c.frac) * scene });
  }
  return { target, curve: shotCurve(samples), samples };
}

/** The scene gates of an anchor's trust: 0 = this frame's anchor does not count. */
export function sceneTrust(frame: GradeParams): number {
  const calm = Math.max(frame.calm ?? 0, frame.calmTone ?? 0);
  // Open water (backdrop.ts) is the subjects' scene: grey sharks and dolphins pass the anchor's tests and
  // their own tone (object neutral) is not the balance's to set; seabed under open water has the whole
  // open-water treatment to itself. Green water has its own neutral (red.ts greenNeutral, murk hold).
  const open = smoothstep(FOLLOW.openLo, FOLLOW.openHi, frame.backdrop ?? 0);
  return (1 - smoothstep(FOLLOW.calmLo, FOLLOW.calmHi, calm)) * (1 - open) * (1 - greenWeight(frame));
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
function median3(a: number, b: number, c: number): number {
  return Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));
}
function clampAround(v: number, centre: number, d: number): number {
  return Math.max(centre - d, Math.min(centre + d, v));
}
/** Weighted median (the value where half the weight lies below; between two values when the split is exact). */
export function weightedMedian(xs: readonly number[], ws: readonly number[]): number {
  const o = xs.map((x, i) => ({ x, w: Math.max(0, ws[i] ?? 0) })).filter((p) => p.w > 0).sort((a, b) => a.x - b.x);
  if (!o.length) return 0;
  const half = o.reduce((s, p) => s + p.w, 0) / 2;
  let acc = 0;
  for (let i = 0; i < o.length; i++) {
    acc += o[i].w;
    if (Math.abs(acc - half) < 1e-12 && i + 1 < o.length) return (o[i].x + o[i + 1].x) / 2;
    if (acc > half) return o[i].x;
  }
  return o[o.length - 1].x;
}
/** Kendall's tau-a of a series against its index (−1..1; ties count as neither). */
function kendall(x: number[]): number {
  let s = 0, n = 0;
  for (let i = 0; i < x.length; i++) for (let j = i + 1; j < x.length; j++) { s += Math.sign(x[j] - x[i]); n++; }
  return n ? s / n : 0;
}
/** Weighted isotonic regression (pool adjacent violators), non-decreasing when `up`, else non-increasing. */
function isotonic(x: number[], w: number[], up: boolean): number[] {
  const v = up ? x : x.map((y) => -y);
  const blocks: { sum: number; w: number; n: number }[] = [];
  for (let i = 0; i < v.length; i++) {
    blocks.push({ sum: v[i] * w[i], w: w[i], n: 1 });
    while (blocks.length > 1 && blocks[blocks.length - 2].sum / blocks[blocks.length - 2].w > blocks[blocks.length - 1].sum / blocks[blocks.length - 1].w) {
      const b = blocks.pop()!, a = blocks[blocks.length - 1];
      a.sum += b.sum; a.w += b.w; a.n += b.n;
    }
  }
  const out: number[] = [];
  for (const b of blocks) for (let k = 0; k < b.n; k++) out.push((up ? 1 : -1) * (b.sum / b.w));
  return out;
}
