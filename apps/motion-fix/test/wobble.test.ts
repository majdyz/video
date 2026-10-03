// Wobble suppression on a synthetic planar scene: a camera with perspective
// wobble (tilt oscillation) on top of hand-held jitter, tracked and
// stabilised end to end, measured against ground truth and with the tracker
// on the rendered output (as scripts/shake-metric.ts does). Plus the
// degenerate case: pure similarity motion must reject every homography and
// leave the output byte-identical to the similarity-only path.
//   node --experimental-strip-types apps/motion-fix/test/wobble.test.ts
import assert from "node:assert/strict";
import { applyH, composeH, homographyFromSimilarity, invertH, type Homography } from "../src/lib/homography.ts";
import { GRID_H, GRID_W } from "../src/lib/mesh-renderer.ts";
import {
  computeStabilizedPath,
  HOMOGRAPHY_STATE,
  warpAtTime,
  warpFnAtTime,
  wobbleCoverage,
  zoomedWarp,
  type MotionAnalysis,
  type StabilizedPath,
} from "../src/lib/stabilize.ts";
import { MotionTracker, compose, type Similarity } from "../src/lib/tracker.ts";
import { makeRng, makeWorld, renderFrameH, renderThroughMesh, similarityFrom, tiltHomography } from "./synth.ts";

const FW = 640;
const FH = 360;
const FPS = 30;
const N = 91; // three 30-frame keyframe intervals
const FOCAL = 320; // wide lens (~90° horizontal), where perspective shows

type Tracked = { analysis: MotionAnalysis; frames: Float32Array[]; upgrades: number; meanGain: number };

/** Renders and tracks a sequence of world -> frame homographies. */
function trackSequence(cams: Homography[]): Tracked {
  const rng = makeRng(4242);
  const world = makeWorld(1100, 700, rng);
  const tracker = new MotionTracker(FW, FH);
  const n = cams.length;
  const frames: Float32Array[] = [];
  const motion = new Float64Array(4 * n);
  const cumulative = new Float64Array(4 * n);
  const homography = new Float64Array(9 * n);
  const homographyState = new Uint8Array(n);
  const times = new Float64Array(n);
  const model = new Uint8Array(n);
  let c: Similarity = { a: 1, b: 0, tx: 0, ty: 0 };
  let upgrades = 0;
  let gain = 0;
  for (let t = 0; t < n; t++) {
    const frame = new Float32Array(FW * FH);
    renderFrameH(world, cams[t], FW, FH, frame, 3, rng);
    frames.push(frame);
    const m = tracker.stepGray(Float32Array.from(frame));
    motion.set([m.a, m.b, m.tx, m.ty], 4 * t);
    c = compose(m, c);
    cumulative.set([c.a, c.b, c.tx, c.ty], 4 * t);
    times[t] = t / FPS;
    model[t] = m.model === "similarity" ? 3 : m.model === "rigid" ? 2 : m.model === "translation" ? 1 : 0;
    homography.set(m.homography ?? homographyFromSimilarity(m), 9 * t);
    homographyState[t] = HOMOGRAPHY_STATE[m.homographyState];
    if (m.homography) {
      upgrades++;
      gain += m.homographyGain;
    } else if (process.env.VERBOSE && t > 0) {
      console.log(`  pair ${t}: ${m.homographyState} (model ${m.model}, inliers ${m.inliers}, rms ${m.rms.toFixed(2)})`);
    }
  }
  const analysis: MotionAnalysis = {
    width: FW,
    height: FH,
    analysisWidth: FW,
    analysisHeight: FH,
    frameCount: n,
    frameRate: FPS,
    times,
    motion,
    cumulative,
    inliers: new Uint16Array(n).fill(200),
    tracked: new Uint16Array(n).fill(220),
    rms: new Float32Array(n),
    model,
    homography,
    homographyState,
    trackMsPerFrame: 0,
  };
  return { analysis, frames, upgrades, meanGain: upgrades ? gain / upgrades : 0 };
}

/**
 * Ground-truth residual: the world point seen at each of a grid of output
 * pixels, per frame. `jitter` is the RMS second difference of those world
 * positions (what the eye reads as shake); `spread` is the per-frame standard
 * deviation of the grid's displacements about their mean, i.e. the motion
 * no single translation could remove — the wobble itself.
 */
function groundTruthResidual(cams: Homography[], path: StabilizedPath): { jitter: number; spread: number } {
  const pts: [number, number][] = [];
  for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 7; gx++) pts.push([(-0.6 + (1.2 * gx) / 6) * FW * 0.5, (-0.6 + (1.2 * gy) / 3) * FH * 0.5]);
  const n = cams.length;
  const wx = new Float64Array(n * pts.length);
  const wy = new Float64Array(n * pts.length);
  for (let t = 0; t < n; t++) {
    const fn = warpFnAtTime(path, path.times[t]);
    const inv = invertH(cams[t]);
    pts.forEach(([x, y], k) => {
      const [sx, sy] = fn(x, y);
      const [ux, uy] = applyH(inv, sx, sy);
      wx[t * pts.length + k] = ux;
      wy[t * pts.length + k] = uy;
    });
  }
  let jitter = 0;
  let spread = 0;
  for (let t = 1; t < n; t++) {
    let mx = 0;
    let my = 0;
    const dx = new Float64Array(pts.length);
    const dy = new Float64Array(pts.length);
    for (let k = 0; k < pts.length; k++) {
      dx[k] = wx[t * pts.length + k] - wx[(t - 1) * pts.length + k];
      dy[k] = wy[t * pts.length + k] - wy[(t - 1) * pts.length + k];
      mx += dx[k];
      my += dy[k];
      if (t > 1) {
        const px = wx[(t - 1) * pts.length + k] - wx[(t - 2) * pts.length + k];
        const py = wy[(t - 1) * pts.length + k] - wy[(t - 2) * pts.length + k];
        jitter += (dx[k] - px) ** 2 + (dy[k] - py) ** 2;
      }
    }
    mx /= pts.length;
    my /= pts.length;
    let v = 0;
    for (let k = 0; k < pts.length; k++) v += (dx[k] - mx) ** 2 + (dy[k] - my) ** 2;
    spread += Math.sqrt(v / pts.length);
  }
  return { jitter: Math.sqrt(jitter / ((n - 2) * pts.length)), spread: spread / (n - 1) };
}

/** shake-metric.ts on the rendered output: similarity jitter plus the residual the similarity could not explain. */
function trackerMetric(frames: Float32Array[], path: StabilizedPath): { meanShift: number; jitterRms: number; meanRms: number } {
  const tracker = new MotionTracker(FW, FH);
  const out = new Float32Array(FW * FH);
  const tx: number[] = [];
  const ty: number[] = [];
  let shift = 0;
  let rms = 0;
  let counted = 0;
  for (let t = 0; t < frames.length; t++) {
    renderThroughMesh(frames[t], FW, FH, warpFnAtTime(path, path.times[t]), out);
    const m = tracker.stepGray(out);
    if (t === 0) continue;
    shift += Math.hypot(m.tx, m.ty);
    tx.push(m.tx);
    ty.push(m.ty);
    if (m.model !== "identity") {
      rms += m.rms;
      counted++;
    }
  }
  let jitter = 0;
  for (let i = 1; i < tx.length; i++) jitter += (tx[i] - tx[i - 1]) ** 2 + (ty[i] - ty[i - 1]) ** 2;
  return { meanShift: shift / tx.length, jitterRms: Math.sqrt(jitter / (tx.length - 1)), meanRms: rms / Math.max(1, counted) };
}

/** Hand-held jitter shared by both sequences. */
function jitterPose(t: number, rng: () => number): Similarity {
  return similarityFrom(0.3 * Math.sin(t * 0.9) + (rng() - 0.5) * 0.3, 1 + 0.004 * Math.sin(t * 0.4), 6 * Math.sin(t * 1.3) + (rng() - 0.5) * 4, 4 * Math.cos(t * 0.7) + (rng() - 0.5) * 4);
}

const PARAMS = { smoothing: 0.8, maxCrop: 0.15 };

// 1. Planar scene under a ±1° tilt oscillation plus the jitter (a ±0.5°
//    tilt is also corrected on most pairs, but its gain over the similarity
//    straddles the 0.2 px acceptance threshold, so whole keyframe intervals
//    would rarely qualify).
{
  const rng = makeRng(31);
  const cams: Homography[] = [];
  for (let t = 0; t < N; t++) {
    const tilt = tiltHomography(1.0 * Math.sin(t * 1.7) + (rng() - 0.5) * 0.3, 1.0 * Math.cos(t * 1.1) + (rng() - 0.5) * 0.3, FOCAL);
    cams.push(composeH(homographyFromSimilarity(jitterPose(t, rng)), tilt));
  }
  const { analysis, frames, upgrades, meanGain } = trackSequence(cams);
  console.log(`wobble: homography kept on ${upgrades}/${N - 1} pairs, mean gain ${meanGain.toFixed(2)} px`);
  assert.ok(upgrades >= 0.8 * (N - 1), `too few homography upgrades: ${upgrades}`);

  const off = computeStabilizedPath(analysis, { ...PARAMS, wobble: false });
  const on = computeStabilizedPath(analysis, PARAMS);
  const coverage = wobbleCoverage(on);
  console.log(`wobble: applied on ${coverage.applied}/${coverage.frames} frames; zoom mean ${on.stats.meanZoom.toFixed(3)} (similarity-only ${off.stats.meanZoom.toFixed(3)})`);
  assert.ok(coverage.applied >= 0.8 * N, `wobble suppression covers only ${coverage.applied} frames`);

  const gtOff = groundTruthResidual(cams, off);
  const gtOn = groundTruthResidual(cams, on);
  console.log(`wobble: ground-truth jitter ${gtOff.jitter.toFixed(3)} -> ${gtOn.jitter.toFixed(3)} px, non-rigid spread ${gtOff.spread.toFixed(3)} -> ${gtOn.spread.toFixed(3)} px`);
  assert.ok(gtOn.spread < 0.6 * gtOff.spread, "wobble suppression did not reduce the non-rigid residual");
  assert.ok(gtOn.jitter < 0.7 * gtOff.jitter, "wobble suppression did not reduce the jitter");

  const tmOff = trackerMetric(frames, off);
  const tmOn = trackerMetric(frames, on);
  console.log(`wobble: tracker on output: |shift| ${tmOff.meanShift.toFixed(3)} -> ${tmOn.meanShift.toFixed(3)} px/frame, jitter RMS ${tmOff.jitterRms.toFixed(3)} -> ${tmOn.jitterRms.toFixed(3)} px, fit residual ${tmOff.meanRms.toFixed(3)} -> ${tmOn.meanRms.toFixed(3)} px`);
  assert.ok(tmOn.meanRms < 0.8 * tmOff.meanRms, "tracker residual on the output did not drop");
  assert.ok(tmOn.jitterRms <= tmOff.jitterRms * 1.1, "tracker jitter on the output got worse");

  // Inclusion with the bent border, and the deviation budget.
  const budget = on.wobbleBudget[0];
  let worst = 0;
  let maxDev = 0;
  for (let t = 0; t < N; t++) {
    const fn = warpFnAtTime(on, on.times[t]);
    const z = zoomedWarp(warpAtTime(on, on.times[t]));
    for (let vy = 0; vy <= GRID_H; vy++) {
      for (let vx = 0; vx <= GRID_W; vx++) {
        const x = (vx / GRID_W - 0.5) * FW;
        const y = (vy / GRID_H - 0.5) * FH;
        const [sx, sy] = fn(x, y);
        maxDev = Math.max(maxDev, Math.hypot(sx - (z.a * x - z.b * y + z.tx), sy - (z.b * x + z.a * y + z.ty)));
        if (vx === 0 || vy === 0 || vx === GRID_W || vy === GRID_H) worst = Math.max(worst, Math.abs(sx) - FW / 2, Math.abs(sy) - FH / 2);
      }
    }
  }
  console.log(`wobble: worst border excursion ${worst.toFixed(3)} px, largest deviation from the similarity ${maxDev.toFixed(2)} px (budget ${budget.toFixed(1)})`);
  assert.ok(worst < 0.5, `warped border leaves the source by ${worst} px`);
  assert.ok(maxDev <= budget + 1e-6, "deviation exceeds the budget");

  // Time interpolation stays between the neighbours.
  const t0 = on.times[40];
  const t1 = on.times[41];
  const a = warpFnAtTime(on, t0)(200, -100);
  const b = warpFnAtTime(on, t1)(200, -100);
  const mid = warpFnAtTime(on, (t0 + t1) / 2)(200, -100);
  assert.ok(Math.abs(mid[0] - (a[0] + b[0]) / 2) < 0.05 && Math.abs(mid[1] - (a[1] + b[1]) / 2) < 0.05, "mid-frame warp is not the average");
}

// 2. Pure similarity motion: the homography is rejected and the output is
//    identical to the similarity-only path.
{
  const rng = makeRng(31);
  const cams: Homography[] = [];
  for (let t = 0; t < N; t++) cams.push(homographyFromSimilarity(jitterPose(t, rng)));
  const { analysis, upgrades } = trackSequence(cams);
  console.log(`similarity-only scene: homography kept on ${upgrades}/${N - 1} pairs`);
  assert.ok(upgrades <= 0.1 * N, `homography accepted on a pure similarity scene: ${upgrades}`);
  const off = computeStabilizedPath(analysis, { ...PARAMS, wobble: false });
  const on = computeStabilizedPath(analysis, PARAMS);
  assert.equal(wobbleCoverage(on).applied, 0);
  assert.deepEqual(Array.from(on.zoom), Array.from(off.zoom));
  assert.deepEqual(Array.from(on.warp), Array.from(off.warp));
  for (let t = 0; t < N; t++) {
    const fnOn = warpFnAtTime(on, on.times[t] + 0.004);
    const fnOff = warpFnAtTime(off, off.times[t] + 0.004);
    const z = zoomedWarp(warpAtTime(off, off.times[t] + 0.004));
    for (const [x, y] of [[-320, -180], [0, 0], [310, 170], [-100, 40]]) {
      assert.deepEqual(fnOn(x, y), fnOff(x, y));
      assert.deepEqual(fnOn(x, y), [z.a * x - z.b * y + z.tx, z.b * x + z.a * y + z.ty]);
    }
  }
}

console.log("wobble tests passed");
