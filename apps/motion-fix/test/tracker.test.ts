// Tracker accuracy on synthetic shaky sequences with known ground truth.
//   node --experimental-strip-types apps/motion-fix/test/tracker.test.ts
import assert from "node:assert/strict";
import { MotionTracker, compose, invert, type Similarity } from "../src/lib/tracker.ts";
import { angleDeg, makeRng, makeWorld, relativeMotion, renderFrame, scaleOf, similarityFrom } from "./synth.ts";

const FW = 640;
const FH = 360;

type Run = { maxTransErr: number; maxAngleErr: number; maxScaleErr: number; msPerFrame: number; minInliers: number };

function runSequence(name: string, poses: Similarity[], noise: number, trackerOpts = {}): Run {
  const rng = makeRng(777);
  const world = makeWorld(1100, 700, rng);
  const tracker = new MotionTracker(FW, FH, trackerOpts);
  const frame = new Float32Array(FW * FH);
  let maxTransErr = 0;
  let maxAngleErr = 0;
  let maxScaleErr = 0;
  let minInliers = Infinity;
  let elapsed = 0;
  for (let t = 0; t < poses.length; t++) {
    renderFrame(world, poses[t], FW, FH, frame, noise, rng);
    const t0 = performance.now();
    const m = tracker.stepGray(frame);
    elapsed += performance.now() - t0;
    if (t === 0) continue;
    // Tracker reports prev->cur in frame coordinates; truth is cur ∘ prev^-1.
    const truth = relativeMotion(poses[t - 1], poses[t]);
    const err = compose(invert(truth), m);
    const transErr = Math.hypot(err.tx, err.ty);
    const angErr = Math.abs(angleDeg(err));
    const scaleErr = Math.abs(scaleOf(err) - 1);
    maxTransErr = Math.max(maxTransErr, transErr);
    maxAngleErr = Math.max(maxAngleErr, angErr);
    maxScaleErr = Math.max(maxScaleErr, scaleErr);
    minInliers = Math.min(minInliers, m.inliers);
    if (process.env.VERBOSE) {
      console.log(`${name} f${t}: model=${m.model} tracked=${m.tracked} inliers=${m.inliers} rms=${m.rms.toFixed(2)} ` +
        `truth=(${truth.tx.toFixed(2)},${truth.ty.toFixed(2)},${angleDeg(truth).toFixed(2)}°) err=${transErr.toFixed(3)}px ${angErr.toFixed(3)}°`);
    }
  }
  const run = { maxTransErr, maxAngleErr, maxScaleErr, msPerFrame: elapsed / poses.length, minInliers };
  console.log(`${name}: max err ${maxTransErr.toFixed(3)} px, ${maxAngleErr.toFixed(3)}°, scale ${maxScaleErr.toFixed(4)}; min inliers ${minInliers}; ${run.msPerFrame.toFixed(1)} ms/frame`);
  return run;
}

// 1. Hand-held jitter: a few pixels of translation, a bit of roll, tiny zoom.
{
  const rng = makeRng(42);
  const poses: Similarity[] = [];
  for (let t = 0; t < 40; t++) {
    const ang = 1.2 * Math.sin(t * 0.9) + (rng() - 0.5) * 0.6;
    const sc = 1 + 0.01 * Math.sin(t * 0.5);
    poses.push(similarityFrom(ang, sc, 8 * Math.sin(t * 1.3) + (rng() - 0.5) * 6, 6 * Math.cos(t * 0.7) + (rng() - 0.5) * 6));
  }
  const r = runSequence("jitter", poses, 4);
  assert.ok(r.maxTransErr < 0.3, `translation error ${r.maxTransErr}`);
  assert.ok(r.maxAngleErr < 0.1, `angle error ${r.maxAngleErr}`);
  assert.ok(r.maxScaleErr < 0.002, `scale error ${r.maxScaleErr}`);
  assert.ok(r.minInliers > 100, `inliers ${r.minInliers}`);
}

// 2. Fast pan with large per-frame displacement (tests the pyramid).
{
  const poses: Similarity[] = [];
  for (let t = 0; t < 20; t++) poses.push(similarityFrom(0.3 * t, 1, -22 * t, 9 * t));
  const r = runSequence("pan", poses, 2);
  assert.ok(r.maxTransErr < 0.3, `translation error ${r.maxTransErr}`);
  assert.ok(r.maxAngleErr < 0.1, `angle error ${r.maxAngleErr}`);
}

// 3. A "fish": a moving block of texture covering ~8% of the frame must not
//    pull the global motion off the background truth.
{
  const rng = makeRng(99);
  const world = makeWorld(1100, 700, rng);
  const fish = makeWorld(140, 90, makeRng(5));
  const tracker = new MotionTracker(FW, FH);
  const frame = new Float32Array(FW * FH);
  const poses: Similarity[] = [];
  for (let t = 0; t < 30; t++) poses.push(similarityFrom(0.4 * Math.sin(t * 0.8), 1, 5 * Math.sin(t * 1.1), 4 * Math.cos(t * 0.9)));
  let maxErr = 0;
  for (let t = 0; t < poses.length; t++) {
    renderFrame(world, poses[t], FW, FH, frame, 3, rng);
    // Paste the fish moving against the background at 7 px/frame.
    const fx0 = Math.round(80 + 7 * t);
    const fy0 = 140;
    for (let y = 0; y < fish.h; y++) for (let x = 0; x < fish.w; x++) frame[(fy0 + y) * FW + fx0 + x] = fish.img[y * fish.w + x];
    const m = tracker.stepGray(frame);
    if (t === 0) continue;
    const err = compose(invert(relativeMotion(poses[t - 1], poses[t])), m);
    maxErr = Math.max(maxErr, Math.hypot(err.tx, err.ty));
  }
  console.log(`fish: max translation error ${maxErr.toFixed(3)} px`);
  assert.ok(maxErr < 0.4, `fish pulled the fit: ${maxErr}`);
}

// 4. Low-contrast "blue water" (heavy haze) still tracks thanks to CLAHE.
{
  const rng = makeRng(7);
  const world = makeWorld(1100, 700, rng);
  for (let i = 0; i < world.img.length; i++) world.img[i] = 150 + (world.img[i] - 128) * 0.12;
  const tracker = new MotionTracker(FW, FH);
  const frame = new Float32Array(FW * FH);
  let maxErr = 0;
  let prev = similarityFrom(0, 1, 0, 0);
  for (let t = 0; t < 15; t++) {
    const cur = similarityFrom(0.2 * t, 1, 3 * t, -2 * t);
    renderFrame(world, cur, FW, FH, frame, 2, rng);
    const m = tracker.stepGray(frame);
    if (t > 0) {
      const err = compose(invert(relativeMotion(prev, cur)), m);
      maxErr = Math.max(maxErr, Math.hypot(err.tx, err.ty));
      assert.notEqual(m.model, "identity", `lost track on low-contrast frame ${t}`);
    }
    prev = cur;
  }
  console.log(`low contrast: max translation error ${maxErr.toFixed(3)} px`);
  assert.ok(maxErr < 0.5, `low-contrast error ${maxErr}`);
}

console.log("tracker tests passed");
