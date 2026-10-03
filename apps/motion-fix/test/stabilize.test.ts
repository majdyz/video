// Path stage on a synthetic analysis: inclusion, adaptive zoom, residual
// motion and time interpolation.
//   node --experimental-strip-types apps/motion-fix/test/stabilize.test.ts
import assert from "node:assert/strict";
import {
  computeStabilizedPath,
  frameIndexAt,
  requiredZoom,
  residualMotion,
  smoothZoom,
  warpAtTime,
  zoomedWarp,
  type MotionAnalysis,
} from "../src/lib/stabilize.ts";
import { apply, compose, invert, type Similarity } from "../src/lib/tracker.ts";
import { makeRng, similarityFrom } from "./synth.ts";

function analysisFrom(poses: Similarity[], width: number, height: number, fps: number): MotionAnalysis {
  const n = poses.length;
  const motion = new Float64Array(4 * n);
  const cumulative = new Float64Array(4 * n);
  const times = new Float64Array(n);
  for (let t = 0; t < n; t++) {
    const m = t === 0 ? { a: 1, b: 0, tx: 0, ty: 0 } : compose(poses[t], invert(poses[t - 1]));
    motion.set([m.a, m.b, m.tx, m.ty], 4 * t);
    cumulative.set([poses[t].a, poses[t].b, poses[t].tx, poses[t].ty], 4 * t);
    times[t] = t / fps;
  }
  return {
    width,
    height,
    analysisWidth: 640,
    analysisHeight: Math.round((640 * height) / width),
    frameCount: n,
    frameRate: fps,
    times,
    motion,
    cumulative,
    inliers: new Uint16Array(n).fill(200),
    tracked: new Uint16Array(n).fill(220),
    rms: new Float32Array(n).fill(0.3),
    model: new Uint8Array(n).fill(3),
    trackMsPerFrame: 0,
  };
}

// Hand-held 1080p: ±25 px / ±1° jitter on top of a slow drift.
const rng = makeRng(21);
const poses: Similarity[] = [];
for (let t = 0; t < 240; t++) {
  poses.push(similarityFrom((rng() - 0.5) * 2 + 0.5 * Math.sin(t * 0.05), 1 + 0.01 * Math.sin(t * 0.02), 2 * t + 50 * Math.sin(t * 0.04) + (rng() - 0.5) * 50, 30 * Math.cos(t * 0.03) + (rng() - 0.5) * 40));
}
const analysis = analysisFrom(poses, 1920, 1080, 30);

{
  const path = computeStabilizedPath(analysis, { smoothing: 0.8, maxCrop: 0.15 });
  assert.equal(path.frameCount, 240);
  assert.ok(path.stats.converged, "solver did not converge");
  // Every frame fits inside the source at its zoom (tiny slack for the post-filter).
  let worst = 0;
  for (let t = 0; t < path.frameCount; t++) {
    const w = zoomedWarp(warpAtTime(path, analysis.times[t]));
    for (const cx of [-960, 960]) {
      for (const cy of [-540, 540]) {
        const [x, y] = apply(w, cx, cy);
        worst = Math.max(worst, Math.abs(x) - 960, Math.abs(y) - 540);
      }
    }
    assert.ok(path.zoom[t] >= 1 && path.zoom[t] <= path.maxZoom + 1e-6, `zoom out of range at ${t}: ${path.zoom[t]}`);
  }
  console.log(`inclusion: worst corner excursion ${worst.toFixed(3)} px; zoom mean ${path.stats.meanZoom.toFixed(3)} max ${path.stats.maxUsedZoom.toFixed(3)} (cap ${path.maxZoom.toFixed(3)}); solve ${path.stats.solveMs.toFixed(0)} ms`);
  assert.ok(worst < 0.5, `frame leaves the source by ${worst} px`);
  // Zoom varies slowly: no step larger than 0.5% between frames.
  for (let t = 1; t < path.frameCount; t++) assert.ok(Math.abs(path.zoom[t] - path.zoom[t - 1]) < 0.005, `zoom jumps at ${t}`);

  // Residual virtual-camera motion is a small fraction of the raw motion.
  const residual = residualMotion(analysis, path);
  let rawShift = 0;
  for (let t = 1; t < 240; t++) rawShift += Math.hypot(analysis.motion[4 * t + 2], analysis.motion[4 * t + 3]);
  rawShift /= 239;
  console.log(`residual motion: ${residual.meanShift.toFixed(2)} px/frame vs raw ${rawShift.toFixed(2)} px/frame, rotation ${residual.meanRotationDeg.toFixed(3)}°/frame`);
  assert.ok(residual.meanShift < 0.25 * rawShift, "path barely smoother than the input");
}

// Smoothing 0 is a pass-through.
{
  const path = computeStabilizedPath(analysis, { smoothing: 0, maxCrop: 0.15 });
  for (let t = 0; t < path.frameCount; t += 37) {
    const w = warpAtTime(path, analysis.times[t]);
    assert.deepEqual([w.a, w.b, w.tx, w.ty, w.zoom], [1, 0, 0, 0, 1]);
  }
}

// Time interpolation lands between neighbours and clamps at the ends.
{
  const path = computeStabilizedPath(analysis, { smoothing: 0.8, maxCrop: 0.15 });
  const t0 = analysis.times[10];
  const t1 = analysis.times[11];
  const a = warpAtTime(path, t0);
  const b = warpAtTime(path, t1);
  const mid = warpAtTime(path, (t0 + t1) / 2);
  assert.ok(Math.abs(mid.tx - (a.tx + b.tx) / 2) < 1e-9);
  assert.equal(frameIndexAt(analysis.times, -1), 0);
  assert.equal(frameIndexAt(analysis.times, 1e9), 239);
  assert.equal(frameIndexAt(analysis.times, analysis.times[57] + 0.001), 57);
  assert.deepEqual(warpAtTime(path, -5), warpAtTime(path, analysis.times[0]));
}

// requiredZoom / smoothZoom basics.
{
  assert.equal(requiredZoom({ a: 1, b: 0, tx: 0, ty: 0 }, 960, 540), 1);
  // 96 px shift needs 1/(1 - 0.1) zoom to keep the far edge covered.
  assert.ok(Math.abs(requiredZoom({ a: 1, b: 0, tx: 96, ty: 0 }, 960, 540) - 1 / 0.9) < 1e-9);
  const req = new Float32Array(100).fill(1);
  req[50] = 1.2;
  const z = smoothZoom(req, 30, 1.5);
  assert.ok(z[50] >= 1.2 - 1e-6 && z[0] < 1.01 && z[99] < 1.01, "rolling max + gaussian shape");
}

console.log("stabilize tests passed");
