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

/** Where to look: `count` short windows spread over the clip (start, end in media seconds). */
export function checkWindows(duration: number, count = 4, length = 0.35): [number, number][] {
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
  const consistent = !informative || best < 0.6 * eStill;
  return { detected, errAir: eAir, errWater: eWater, errStill: eStill, pairs: pairs.length, points, consistent };
}
