// Picture check for the gyro path: track a few short stretches of the clip
// and ask which lens model — in air, or underwater behind a flat port —
// makes the telemetry's rotation reproduce the points' motion. The same
// numbers tell whether the telemetry matches the picture at all.
//
// Why it matters: underwater a flat port narrows the lens by ~1.33 and
// bends the periphery (Snell). Rotating rays with the in-air model would
// leave about a quarter of every shake in the output.

import { project, unproject, type LensModel } from "./lens.ts";
import { qmat, sampleOrientation } from "./quat.ts";
import type { CameraMotion, MediumCheck } from "./telemetry.ts";
import { WATER_INDEX } from "./gyro-stabilize.ts";
import { MotionTracker } from "../tracker.ts";

/** Tracked points between two frames, in coded source pixels. */
export type MatchPair = { t0: number; t1: number; px: Float32Array; py: Float32Array; qx: Float32Array; qy: Float32Array };

/** Default window count: 4 for short clips, up to 12 for long ones (a long dive has long calm stretches). */
export function checkWindowCount(duration: number): number {
  return Math.min(12, Math.max(4, Math.round(duration / 10)));
}

/** Where to look: `count` short windows spread over the clip (start, end in media seconds). */
export function checkWindows(duration: number, count = checkWindowCount(duration), length = 0.35): [number, number][] {
  const out: [number, number][] = [];
  for (let w = 0; w < count; w++) {
    const c = (duration * (w + 1)) / (count + 1);
    out.push([Math.max(0, c - length / 2), Math.min(duration, c + length / 2)]);
  }
  return out;
}

/**
 * Tracks consecutive frames of one window (gray 0..255 at the analysis
 * size) and returns their point pairs scaled to coded source pixels.
 */
export class PairCollector {
  private tracker: MotionTracker;
  private prevTime: number | null = null;
  readonly pairs: MatchPair[] = [];
  private readonly aw: number;
  private readonly ah: number;
  private readonly scale: number;
  constructor(aw: number, ah: number, scale: number) {
    this.aw = aw;
    this.ah = ah;
    this.scale = scale;
    this.tracker = new MotionTracker(aw, ah);
  }
  /** Starts a new window (tracks do not continue across a seek). */
  reset(): void {
    this.tracker = new MotionTracker(this.aw, this.ah);
    this.prevTime = null;
  }
  push(time: number, gray: Float32Array): void {
    this.tracker.stepGray(gray);
    if (this.prevTime !== null) {
      const m = this.tracker.lastMatches();
      const s = this.scale;
      // Pixel centres: analysis px i covers source px [i·s, (i+1)·s).
      const map = (v: Float32Array): Float32Array => v.map((x) => (x + 0.5) * s);
      if (m.px.length) this.pairs.push({ t0: this.prevTime, t1: time, px: map(m.px), py: map(m.py), qx: map(m.qx), qy: map(m.qy) });
    }
    this.prevTime = time;
  }
}

function median(v: number[]): number {
  if (!v.length) return Infinity;
  const s = v.slice().sort((a, b) => a - b);
  return s[s.length >> 1];
}

/** Per-point reprojection errors of `pairs` under lens `lens` (n included), rotation from the telemetry. */
export function reprojectionErrors(motion: CameraMotion, lens: LensModel, pairs: MatchPair[], useRotation = true): number[] {
  const errs: number[] = [];
  const px: [number, number] = [0, 0];
  const ro = motion.readout;
  const H = lens.height;
  for (const p of pairs) {
    for (let i = 0; i < p.px.length; i++) {
      const ray = unproject(lens, p.px[i], p.py[i]);
      let q = ray;
      if (useRotation) {
        const t0 = p.t0 + motion.timeOffset + (p.py[i] / H - 0.5) * ro;
        const t1 = p.t1 + motion.timeOffset + (p.qy[i] / H - 0.5) * ro;
        const m0 = qmat(sampleOrientation(motion.times, motion.quats, t0));
        const m1 = qmat(sampleOrientation(motion.times, motion.quats, t1));
        // world = M0 ray; frame-1 camera ray = M1ᵀ world
        const wx = m0[0] * ray[0] + m0[1] * ray[1] + m0[2] * ray[2];
        const wy = m0[3] * ray[0] + m0[4] * ray[1] + m0[5] * ray[2];
        const wz = m0[6] * ray[0] + m0[7] * ray[1] + m0[8] * ray[2];
        q = [m1[0] * wx + m1[3] * wy + m1[6] * wz, m1[1] * wx + m1[4] * wy + m1[7] * wz, m1[2] * wx + m1[5] * wy + m1[8] * wz];
      }
      project(lens, q, px);
      if (!Number.isFinite(px[0])) continue;
      errs.push(Math.hypot(px[0] - p.qx[i], px[1] - p.qy[i]));
    }
  }
  return errs;
}

/**
 * Decides air vs water from tracked pairs. Water wins only by a clear
 * margin (15 % lower median error) and only when there is enough motion
 * to tell (the still-camera error well above the tracking noise).
 */
export function checkMedium(motion: CameraMotion, pairs: MatchPair[]): MediumCheck {
  const air: LensModel = { ...motion.lens, n: 1 };
  const water: LensModel = { ...motion.lens, n: WATER_INDEX };
  const eAir = median(reprojectionErrors(motion, air, pairs));
  const eWater = median(reprojectionErrors(motion, water, pairs));
  const eStill = median(reprojectionErrors(motion, air, pairs, false));
  const points = pairs.reduce((a, p) => a + p.px.length, 0);
  const scale = motion.lens.width / 1000;
  const informative = points >= 200 && eStill > 1.5 * scale;
  let detected: "air" | "water" | null = null;
  if (informative) {
    if (eWater < 0.85 * eAir) detected = "water";
    else if (eAir < 0.95 * eWater) detected = "air";
  }
  const best = Math.min(eAir, eWater);
  let consistent = !informative || best < 0.6 * eStill;
  // Per window: on real dives most windows are calm or full of swimmers,
  // fish and bubbles, and the pooled median drowns the few windows where
  // the camera turns enough to tell. Windows where the gyro clearly
  // explains the motion each get a vote; a clear majority decides.
  const votes = windowVotes(motion, air, water, pairs, scale);
  if (votes.informative >= 2) {
    const total = votes.air + votes.water;
    if (total >= 2 && votes.water >= 0.75 * total) detected = "water";
    else if (total >= 2 && votes.air >= 0.75 * total) detected = "air";
    // The gyro does explain the picture where there is motion to explain.
    consistent = true;
  }
  return { detected, errAir: eAir, errWater: eWater, errStill: eStill, pairs: pairs.length, points, consistent, windows: votes };
}

/**
 * Splits pairs into their check windows (a gap of more than ~3 frames
 * starts a new one) and lets every window where the camera moved (still
 * error > 3 px per 1000 px) and the gyro explains at least half of it vote
 * for the lens that explains it clearly better (10 %).
 */
export function windowVotes(motion: CameraMotion, air: LensModel, water: LensModel, pairs: MatchPair[], scale: number): { informative: number; air: number; water: number } {
  const groups: MatchPair[][] = [];
  let cur: MatchPair[] = [];
  for (const p of pairs) {
    const prev = cur[cur.length - 1];
    if (prev && (p.t0 - prev.t1 > 3 * Math.max(1e-3, prev.t1 - prev.t0) || p.t0 < prev.t0)) {
      groups.push(cur);
      cur = [];
    }
    cur.push(p);
  }
  if (cur.length) groups.push(cur);
  const out = { informative: 0, air: 0, water: 0 };
  for (const g of groups) {
    if (g.reduce((a, p) => a + p.px.length, 0) < 100) continue;
    const st = median(reprojectionErrors(motion, air, g, false));
    const ea = median(reprojectionErrors(motion, air, g));
    const ew = median(reprojectionErrors(motion, water, g));
    if (!(st > 3 * scale && Math.min(ea, ew) < 0.5 * st)) continue;
    out.informative++;
    if (ew < 0.9 * ea) out.water++;
    else if (ea < 0.9 * ew) out.air++;
  }
  return out;
}

export type GyroCalibration = { offsetMs: number; focalScale: number; errBefore: number; errAfter: number };

/**
 * Self-calibration for raw-gyro GoPros (HERO5–7, no in-file lens, timing
 * spread over the payload): the time offset and focal length that make
 * the gyro reproduce the tracked points best, searched coarse to fine on
 * the picture-check pairs. Measured need: a public HERO6 clip wants
 * −35 ms and 0.8x the guessed focal (7.3 → 3.9 px against 29 px with no
 * rotation). Returns null when the pairs cannot tell (too little motion)
 * or the gain is under 15 %.
 */
export function calibrateRawGyro(motion: CameraMotion, pairs: MatchPair[]): GyroCalibration | null {
  const points = pairs.reduce((a, p) => a + p.px.length, 0);
  if (points < 300) return null;
  // Subsample to ~1500 points: the search runs ~40 evaluations.
  const step = Math.max(1, Math.floor(points / 1500));
  const sub = pairs.map((p) => {
    const keep = (v: Float32Array): Float32Array => v.filter((_, i) => i % step === 0);
    return { ...p, px: keep(p.px), py: keep(p.py), qx: keep(p.qx), qy: keep(p.qy) };
  });
  const air: LensModel = { ...motion.lens, n: 1 };
  const still = median(reprojectionErrors(motion, air, sub, false));
  if (!(still > 3 * (motion.lens.width / 1000))) return null;
  const err = (off: number, scale: number): number =>
    median(reprojectionErrors({ ...motion, timeOffset: motion.timeOffset + off }, { ...air, fx: air.fx * scale, fy: air.fy * scale }, sub));
  const before = err(0, 1);
  let bo = 0, bs = 1, be = before;
  for (let o = -0.08; o <= 0.0801; o += 0.01) {
    const e = err(o, 1);
    if (e < be) { be = e; bo = o; }
  }
  // Kept narrow: a larger focal is also what a flat port underwater looks like, and the medium check decides that.
  for (let sc = 0.8; sc <= 1.1001; sc += 0.05) {
    const e = err(bo, sc);
    if (e < be) { be = e; bs = sc; }
  }
  for (let o = bo - 0.01; o <= bo + 0.0101; o += 0.002) {
    const e = err(o, bs);
    if (e < be) { be = e; bo = o; }
  }
  if (!(be < 0.85 * before)) return null;
  return { offsetMs: Math.round(bo * 1000), focalScale: Math.round(bs * 100) / 100, errBefore: before, errAfter: be };
}

/**
 * Applies a calibration in place: telemetry moves on its own timeline (frame
 * times stay), the lens focal scales about the centre.
 */
export function applyGyroCalibration(motion: CameraMotion, c: GyroCalibration): void {
  const off = c.offsetMs / 1000;
  motion.times = motion.times.map((t) => t - off);
  motion.lens = { ...motion.lens, fx: motion.lens.fx * c.focalScale, fy: motion.lens.fy * c.focalScale, source: `${motion.lens.source}, self-calibrated ${c.focalScale}x` };
  motion.notes = [...motion.notes, `gyro self-calibrated from the picture: ${c.offsetMs} ms, focal ${c.focalScale}x (${c.errBefore.toFixed(1)} → ${c.errAfter.toFixed(1)} px)`];
}

/** True for telemetry that benefits from self-calibration (integrated raw gyro, no in-file lens). */
export function needsGyroCalibration(motion: CameraMotion): boolean {
  return motion.source === "gopro" && motion.notes.some((n) => /raw gyro/.test(n)) && !/in-file/.test(motion.lens.source);
}

/** The picture check plus, for raw-gyro bodies, self-calibration first (mutates `motion`). */
export function checkAndCalibrate(motion: CameraMotion, pairs: MatchPair[]): MediumCheck {
  if (needsGyroCalibration(motion)) {
    const c = calibrateRawGyro(motion, pairs);
    if (c) applyGyroCalibration(motion, c);
  }
  return checkMedium(motion, pairs);
}
