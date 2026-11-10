// Swimming footage: a slow pan with a fin-kick bob (0.8 Hz vertical heave,
// 0.5 Hz roll) and a little hand shake. The visual path must take the bob
// out (it sits below the old fidelity's break-even, ~0.5 Hz, and used to
// pass straight through), keep following the pan, and stay inside a modest
// crop.
//   node --experimental-strip-types apps/motion-fix/test/bobbing.test.ts
import assert from "node:assert/strict";
import { bands, outputTrajectory } from "../scripts/band-eval.ts";
import { computeStabilizedPath, lowPassPath, type MotionAnalysis } from "../src/lib/stabilize.ts";
import { compose, invert, type Similarity } from "../src/lib/tracker.ts";
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
    width, height, analysisWidth: width, analysisHeight: height, frameCount: n, frameRate: fps, times, motion, cumulative,
    inliers: new Uint16Array(n).fill(200), tracked: new Uint16Array(n).fill(220), rms: new Float32Array(n).fill(0.3),
    model: new Uint8Array(n).fill(3), homography: new Float64Array(9 * n), homographyState: new Uint8Array(n), trackMsPerFrame: 0,
  };
}

const fps = 30;
const rng = makeRng(7);
const poses: Similarity[] = [];
for (let t = 0; t < 300; t++) {
  const s = t / fps;
  poses.push(similarityFrom(0.8 * Math.sin(2 * Math.PI * 0.5 * s) + (rng() - 0.5) * 0.1, 1, 30 * s + (rng() - 0.5) * 2, 14 * Math.sin(2 * Math.PI * 0.8 * s) + (rng() - 0.5) * 2));
}
const a = analysisFrom(poses, 640, 360, fps);
const measure = (p: ReturnType<typeof computeStabilizedPath> | null) => {
  const tr = outputTrajectory(a, p);
  return bands(tr.x, tr.y, tr.th, fps);
};
const src = measure(null);
const path = computeStabilizedPath(a, { smoothing: 0.8, maxCrop: 0.15 });
const out = measure(path);
assert.ok(out.bob < 0.35 * src.bob, `bob ${out.bob.toFixed(2)} vs source ${src.bob.toFixed(2)} px`);
assert.ok(out.rotBob < 0.35 * src.rotBob, `roll bob ${out.rotBob.toFixed(3)} vs ${src.rotBob.toFixed(3)}°`);
assert.ok(out.jitter < 0.5 * src.jitter, `jitter ${out.jitter.toFixed(2)} vs ${src.jitter.toFixed(2)} px`);
// The pan is intended: the output still moves at about the camera's speed.
assert.ok(out.wanderSpeed > 0.7 * src.wanderSpeed, `pan lost: ${out.wanderSpeed.toFixed(1)} vs ${src.wanderSpeed.toFixed(1)} px/s`);
assert.ok(path.stats.meanZoom < 1.15, `mean zoom ${path.stats.meanZoom.toFixed(3)}`);

// The anchor's low-pass reproduces a steady pan exactly, ends included.
{
  const line: Similarity[] = [];
  for (let t = 0; t < 50; t++) line.push({ a: 1, b: 0.001 * t, tx: 3 * t - 20, ty: -t });
  const lp = lowPassPath(line, 12);
  for (let t = 0; t < 50; t++) {
    assert.ok(Math.abs(lp[t].tx - line[t].tx) < 1e-6 && Math.abs(lp[t].ty - line[t].ty) < 1e-6 && Math.abs(lp[t].b - line[t].b) < 1e-9, `frame ${t}`);
  }
}
