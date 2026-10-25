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

/** Picture-check windows for a clip: motion logs get more and longer ones (their unknown clock is synced from them). */
export function checkWindowsFor(motion: CameraMotion, span?: { start: number; end: number } | null): [number, number][] {
  // Trimmed: the windows are spread over the span (trim + margin) only. A log's clock sync
  // still searches the whole log (syncRange); only the picture it is matched against shrinks.
  const base = span ? Math.max(0, span.start) : 0;
  const d = span ? Math.max(0, Math.min(motion.video.duration, span.end) - base) : motion.video.duration;
  const log = motion.source === "imu-log";
  const count = log ? Math.max(8, checkWindowCount(d)) : checkWindowCount(d);
  const length = log ? 0.7 : 0.35;
  // A span shorter than the windows put end to end: read all of it once (no overlapping windows).
  const wins: [number, number][] = span && count * length >= d ? [[0, d]] : checkWindows(d, count, length);
  return wins.map(([a, b]) => [base + a, base + b]);
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
  private readonly rotation: 0 | 90 | 180 | 270;
  private readonly cw: number;
  private readonly ch: number;
  /**
   * `aw`×`ah`: the analysis frames as decoded (upright, display
   * orientation). With a rotation tag the pairs are carried back to the
   * coded frame (`cw`×`ch` source px) the lens and telemetry live in.
   */
  constructor(aw: number, ah: number, scale: number, rotation: 0 | 90 | 180 | 270 = 0, cw = 0, ch = 0) {
    this.aw = aw;
    this.ah = ah;
    this.scale = scale;
    this.rotation = rotation;
    this.cw = cw;
    this.ch = ch;
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
      if (m.px.length) {
        const [px, py] = this.toCoded(map(m.px), map(m.py));
        const [qx, qy] = this.toCoded(map(m.qx), map(m.qy));
        this.pairs.push({ t0: this.prevTime, t1: time, px, py, qx, qy });
      }
    }
    this.prevTime = time;
  }
  private toCoded(xd: Float32Array, yd: Float32Array): [Float32Array, Float32Array] {
    if (this.rotation === 0) return [xd, yd];
    const u = new Float32Array(xd.length);
    const v = new Float32Array(xd.length);
    const out: [number, number] = [0, 0];
    for (let i = 0; i < xd.length; i++) {
      displayToCoded(xd[i], yd[i], this.rotation, this.cw, this.ch, out);
      u[i] = out[0];
      v[i] = out[1];
    }
    return [u, v];
  }
}

/**
 * Display (upright) position -> coded position, continuous pixel
 * coordinates (pixel i spans [i, i+1)); the inverse of the decoder's
 * clockwise `rotation` (frame-gray.ts rotateInto). `cw`×`ch`: coded size.
 */
export function displayToCoded(xd: number, yd: number, rotation: 0 | 90 | 180 | 270, cw: number, ch: number, out: [number, number] = [0, 0]): [number, number] {
  if (rotation === 90) { out[0] = yd; out[1] = ch - xd; }
  else if (rotation === 270) { out[0] = cw - yd; out[1] = xd; }
  else if (rotation === 180) { out[0] = cw - xd; out[1] = ch - yd; }
  else { out[0] = xd; out[1] = yd; }
  return out;
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

export type GyroCalibration = { offsetMs: number; focalScale: number; errBefore: number; errAfter: number; /** Rolling-shutter readout found (ms), when searched. */ readoutMs?: number };

export type CalibrationOptions = {
  /** Offset search (s, relative to the current timing): coarse range and step. */
  offsetRange?: number;
  offsetStep?: number;
  /** Focal scale search range. */
  focalMin?: number;
  focalMax?: number;
  /** Readouts to try (s); omitted = keep the motion's own. */
  readouts?: number[];
};

function subsamplePairs(pairs: MatchPair[], target: number): MatchPair[] {
  const points = pairs.reduce((a, p) => a + p.px.length, 0);
  const step = Math.max(1, Math.floor(points / target));
  return pairs.map((p) => {
    const keep = (v: Float32Array): Float32Array => v.filter((_, i) => i % step === 0);
    return { ...p, px: keep(p.px), py: keep(p.py), qx: keep(p.qx), qy: keep(p.qy) };
  });
}

/**
 * Self-calibration for gyro sources without in-file timing or lens (raw-gyro
 * GoPros HERO5–7, CAMM, motion logs): the time offset and focal length (and,
 * when asked, the rolling-shutter readout) that make the gyro reproduce the
 * tracked points best, searched coarse to fine on the picture-check pairs.
 * Measured need: a public HERO6 clip wants −35 ms and 0.8x the guessed
 * focal (7.3 → 3.9 px against 29 px with no rotation). Returns null when
 * the pairs cannot tell (too little motion) or the gain is under 15 %.
 */
export function calibrateRawGyro(motion: CameraMotion, pairs: MatchPair[], opts: CalibrationOptions = {}): GyroCalibration | null {
  const points = pairs.reduce((a, p) => a + p.px.length, 0);
  if (points < 300) return null;
  // Subsample to ~1500 points: the search runs ~40 evaluations.
  const sub = subsamplePairs(pairs, 1500);
  const air: LensModel = { ...motion.lens, n: 1 };
  const still = median(reprojectionErrors(motion, air, sub, false));
  if (!(still > 3 * (motion.lens.width / 1000))) return null;
  const range = opts.offsetRange ?? 0.08;
  const stepO = opts.offsetStep ?? 0.01;
  const fMin = opts.focalMin ?? 0.8;
  const fMax = opts.focalMax ?? 1.1;
  let ro = motion.readout;
  const err = (off: number, scale: number, readout = ro): number =>
    median(reprojectionErrors({ ...motion, readout, timeOffset: motion.timeOffset + off }, { ...air, fx: air.fx * scale, fy: air.fy * scale }, sub));
  const before = err(0, 1);
  let bo = 0, bs = 1, be = before;
  for (let o = -range; o <= range + 1e-9; o += stepO) {
    const e = err(o, 1);
    if (e < be) { be = e; bo = o; }
  }
  // Kept narrow for cameras: a larger focal is also what a flat port underwater looks like, and the medium check decides that.
  for (let sc = fMin; sc <= fMax + 1e-9; sc += 0.05) {
    const e = err(bo, sc);
    if (e < be) { be = e; bs = sc; }
  }
  if (opts.readouts) {
    // A readout has to earn its place (3 %): tracking noise alone favours some value.
    let rb = err(bo, bs, ro);
    for (const r of opts.readouts) {
      const e = err(bo, bs, r);
      if (e < 0.97 * rb) { rb = e; ro = r; }
    }
    be = Math.min(be, rb);
  }
  for (let o = bo - stepO; o <= bo + stepO + 1e-9; o += stepO / 5) {
    const e = err(o, bs);
    if (e < be) { be = e; bo = o; }
  }
  if (!(be < 0.85 * before)) return null;
  const out: GyroCalibration = { offsetMs: Math.round(bo * 1000), focalScale: Math.round(bs * 100) / 100, errBefore: before, errAfter: be };
  if (opts.readouts) out.readoutMs = Math.round(ro * 1000);
  return out;
}

/**
 * Applies a calibration in place: telemetry moves on its own timeline (frame
 * times stay), the lens focal scales about the centre.
 */
export function applyGyroCalibration(motion: CameraMotion, c: GyroCalibration): void {
  const off = c.offsetMs / 1000;
  motion.times = motion.times.map((t) => t - off);
  motion.lens = { ...motion.lens, fx: motion.lens.fx * c.focalScale, fy: motion.lens.fy * c.focalScale, source: `${motion.lens.source}, self-calibrated ${c.focalScale}x` };
  if (c.readoutMs !== undefined) motion.readout = c.readoutMs / 1000;
  const ro = c.readoutMs !== undefined ? `, rolling shutter ${c.readoutMs} ms` : "";
  motion.notes = [...motion.notes, `gyro self-calibrated from the picture: ${c.offsetMs} ms, focal ${c.focalScale}x${ro} (${c.errBefore.toFixed(1)} → ${c.errAfter.toFixed(1)} px)`];
}

/** True for telemetry that benefits from self-calibration (integrated raw gyro, no in-file lens; CAMM; motion logs). */
export function needsGyroCalibration(motion: CameraMotion): boolean {
  if (motion.source === "camm" || motion.source === "imu-log") return true;
  return motion.source === "gopro" && motion.notes.some((n) => /raw gyro/.test(n)) && !/in-file/.test(motion.lens.source);
}

/** Readouts a phone may have (s): global-shutter-like to slow 4K readouts. */
const PHONE_READOUTS = [0, 0.008, 0.016, 0.024, 0.032];

export type ClockSync = { offset: number; correlation: number; errBefore: number; errAfter: number };

/**
 * Coarse clock sync for a motion log (its own clock, possibly seconds or
 * minutes away from the video's): correlates how far the picture moves
 * between tracked frame pairs with how far the gyro turned over the same
 * interval at every candidate offset (4 ms steps over `range`, absolute
 * timeOffset values), then settles the best few peaks by reprojection
 * error. Returns the absolute timeOffset, or null when the picture cannot
 * tell (too little motion, or no peak the gyro explains).
 */
export function syncLogClock(motion: CameraMotion, pairs: MatchPair[], range: [number, number]): ClockSync | null {
  const use = pairs.filter((p) => p.px.length >= 8);
  if (use.length < 12) return null;
  // Picture motion per pair: median point displacement.
  const vis = use.map((p) => {
    const d: number[] = [];
    for (let i = 0; i < p.px.length; i++) d.push(Math.hypot(p.qx[i] - p.px[i], p.qy[i] - p.py[i]));
    return median(d);
  });
  // Cumulative turned angle on a 2 ms grid (gyro clock).
  const T0 = motion.times[0], T1 = motion.times[motion.times.length - 1];
  const dt = 0.002;
  const n = Math.max(2, Math.ceil((T1 - T0) / dt) + 1);
  const cum = new Float64Array(n);
  let prev = sampleOrientation(motion.times, motion.quats, T0);
  for (let i = 1; i < n; i++) {
    const q = sampleOrientation(motion.times, motion.quats, T0 + i * dt);
    const dq = prev[0] * q[0] + prev[1] * q[1] + prev[2] * q[2] + prev[3] * q[3];
    cum[i] = cum[i - 1] + 2 * Math.acos(Math.min(1, Math.abs(dq)));
    prev = q;
  }
  const at = (t: number): number => {
    const x = (t - T0) / dt;
    if (x <= 0) return 0;
    if (x >= n - 1) return cum[n - 1];
    const i = Math.floor(x);
    return cum[i] + (cum[i + 1] - cum[i]) * (x - i);
  };
  const mv = vis.reduce((a, b) => a + b, 0) / vis.length;
  let sv = 0;
  for (const v of vis) sv += (v - mv) ** 2;
  if (!(sv > 0)) return null;
  const step = 0.004;
  const offs: number[] = [];
  const ncc: number[] = [];
  const g = new Float64Array(use.length);
  for (let o = range[0]; o <= range[1] + 1e-9; o += step) {
    let mg = 0;
    for (let k = 0; k < use.length; k++) {
      g[k] = at(use[k].t1 + o) - at(use[k].t0 + o);
      mg += g[k];
    }
    mg /= use.length;
    let sg = 0, sx = 0;
    for (let k = 0; k < use.length; k++) {
      sg += (g[k] - mg) ** 2;
      sx += (g[k] - mg) * (vis[k] - mv);
    }
    offs.push(o);
    ncc.push(sg > 0 ? sx / Math.sqrt(sg * sv) : -1);
  }
  // Best few local maxima at least 40 ms apart.
  const order = ncc.map((_, i) => i).sort((a, b) => ncc[b] - ncc[a]);
  const peaks: number[] = [];
  for (const i of order) {
    if (peaks.length >= 5 || ncc[i] < 0.2) break;
    if (peaks.every((j) => Math.abs(offs[j] - offs[i]) > 0.04)) peaks.push(i);
  }
  if (!peaks.length) return null;
  const sub = subsamplePairs(use, 800);
  const air: LensModel = { ...motion.lens, n: 1 };
  const errAt = (off: number): number => median(reprojectionErrors({ ...motion, timeOffset: off }, air, sub));
  const still = median(reprojectionErrors(motion, air, sub, false));
  let best = { off: motion.timeOffset, err: errAt(motion.timeOffset), corr: 0 };
  const errBefore = best.err;
  for (const i of peaks) {
    for (let o = offs[i] - 0.012; o <= offs[i] + 0.012 + 1e-9; o += 0.004) {
      const e = errAt(o);
      if (e < best.err) best = { off: o, err: e, corr: ncc[i] };
    }
  }
  // The gyro must explain the picture at the chosen offset.
  if (!(best.err < 0.7 * still)) return null;
  return { offset: best.off, correlation: best.corr, errBefore, errAfter: best.err };
}

/** The picture check plus, for raw-gyro bodies, CAMM and motion logs, self-calibration first (mutates `motion`). */
export function checkAndCalibrate(motion: CameraMotion, pairs: MatchPair[]): MediumCheck {
  if (motion.source === "imu-log" && motion.syncRange) {
    const s = syncLogClock(motion, pairs, motion.syncRange);
    if (s) {
      motion.timeOffset = s.offset;
      motion.notes = [...motion.notes, `log synced to the picture at ${s.offset.toFixed(3)} s (correlation ${s.correlation.toFixed(2)}, ${s.errBefore.toFixed(1)} → ${s.errAfter.toFixed(1)} px)`];
    } else motion.notes = [...motion.notes, "could not sync the log to the picture (too little camera motion?)"];
  }
  if (needsGyroCalibration(motion)) {
    const phone = motion.source === "camm" || motion.source === "imu-log";
    const opts: CalibrationOptions = phone ? { focalMin: 0.7, focalMax: 1.4, readouts: motion.readout ? undefined : PHONE_READOUTS } : {};
    const c = calibrateRawGyro(motion, pairs, opts);
    if (c) applyGyroCalibration(motion, c);
  }
  return checkMedium(motion, pairs);
}
