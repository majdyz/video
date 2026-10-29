// AI subject detection (pure parts): memory bank assembly, optical flow, mask ops, keyframe interpolation and the
// confidence curve.   node --experimental-strip-types apps/studio/test/seg.test.ts
import assert from "node:assert/strict";
import { assembleMemory, frameIndex, isEmpty, MEM_DIM, MEM_TOKENS, newBank, pruneBank, storeMemory, type MemEntry } from "../src/pipeline/seg/bank.ts";
import { denseFlow, warp, type Gray } from "../src/pipeline/seg/flow.ts";
import { boxMean, DEPART_STEP, departMap, distanceTransform, feather, guidedFilter, iou, promptFromMask } from "../src/pipeline/seg/mask.ts";
import { composeSegStrength } from "../../aqua-fix/src/engine/seg-overlay.ts";
import { SEG_TONE } from "../../aqua-fix/src/engine/grade-shader.ts";
import { clearCast } from "../../aqua-fix/src/engine/apply.ts";
import { SUBJECT_CLEAR } from "../../aqua-fix/src/engine/params.ts";
import { fillInterval, keyTimes, sampleRange, SegTrack, type Keyframe } from "../src/pipeline/seg/track.ts";
import { autoObjects, ML_OUTLINE_ID, outlineSelection, popComponentBox, promptFor, segPopsAt } from "../src/pipeline/seg/studio-seg.ts";

const entry = (v: number): MemEntry => ({ mem: new Float32Array(MEM_TOKENS * MEM_DIM).fill(v), pos: new Float32Array(MEM_TOKENS * MEM_DIM).fill(v), ptr: new Float32Array(256).fill(v), score: 1 });
const tpos = Float32Array.from({ length: 7 * 64 }, (_, i) => Math.floor(i / 64) * 100);

// Bank: transformers' streaming order (conditioning frames, then t-6..t-1; pointers cond then t-1..t-15).
{
  const b = newBank();
  assert.equal(isEmpty(b), true);
  assert.equal(assembleMemory(b, 5, false, tpos), null, "no conditioning frame: nothing to attend to");
  storeMemory(b, 0, entry(1), true);
  storeMemory(b, 5, entry(2), false);
  storeMemory(b, 10, entry(3), false);
  const m = assembleMemory(b, 15, false, tpos)!;
  assert.deepEqual(m.spatialFrames, [0, 10], "keyframes every 5: the prompt + the keyframe before");
  assert.deepEqual(m.pointerFrames, [0, 10, 5], "pointers: conditioning first, then nearest first, within 15");
  assert.equal(m.spatialLen, 2 * MEM_TOKENS);
  assert.equal(m.pointerLen, 3 * 4, "each 256-d pointer is 4 tokens of 64");
  // Temporal encoding: slot 0 (conditioning) takes the last row, slot k the row k-1.
  assert.equal(m.spatialPos[0], 1 + 600);
  assert.equal(m.spatialPos[MEM_TOKENS * MEM_DIM], 3 + 400, "frame 10 at t=15 is slot 5 → row 4");
  assert.equal(m.pointer[256], 3, "second pointer = frame 10");
  assert.ok(m.pointerPos.every((x) => x === 0));
  // Backwards: the mirror image.
  const r = newBank();
  storeMemory(r, 30, entry(1), true);
  storeMemory(r, 25, entry(2), false);
  storeMemory(r, 20, entry(3), false);
  const mr = assembleMemory(r, 15, true, tpos)!;
  assert.deepEqual(mr.spatialFrames, [30, 20]);
  assert.deepEqual(mr.pointerFrames, [30, 20, 25]);
  assert.equal(assembleMemory(r, 35, true, tpos)!.pointerFrames.length, 0, "a conditioning frame before t is not a pointer when tracking backwards");
  // Prune: memories out of every later frame's reach go.
  storeMemory(b, 30, entry(4), false);
  pruneBank(b, 30, false);
  assert.deepEqual([...b.noncond.keys()], [30], "5 and 10 are ≥ 16 frames behind 30... and 15 would still be reachable");
  assert.equal(b.cond.size, 1, "conditioning frames are kept");
  assert.equal(frameIndex(1 / 6), 5);
  assert.equal(frameIndex(2.5), 75);
}

// Flow: a textured image shifted by (3, -2) px is recovered; warping a mask with it lands the mask.
const W = 96, H = 64;
const tex = (x: number, y: number) => 0.5 + 0.25 * Math.sin(x * 0.37 + Math.cos(y * 0.21) * 2) + 0.2 * Math.cos(y * 0.29 - x * 0.11);
const img = (dx: number, dy: number): Gray => {
  const d = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) d[y * W + x] = tex(x - dx, y - dy);
  return { width: W, height: H, data: d };
};
{
  const a = img(0, 0), b = img(3, -2); // b(x) = a(x - (3,-2)) → a(x) = b(x + (3,-2))
  const f = denseFlow(a, b);
  const us: number[] = [], vs: number[] = [];
  for (let y = 12; y < H - 12; y++) for (let x = 12; x < W - 12; x++) { us.push(f.data[(y * W + x) * 2]); vs.push(f.data[(y * W + x) * 2 + 1]); }
  const med = (a: number[]) => a.sort((p, q) => p - q)[a.length >> 1];
  assert.ok(Math.abs(med(us) - 3) < 0.3 && Math.abs(med(vs) + 2) < 0.3, `flow ${med(us)}, ${med(vs)}`);
  const sq = (ox: number, oy: number) => { const m = new Float32Array(W * H); for (let y = 20; y < 40; y++) for (let x = 30; x < 55; x++) m[(y + oy) * W + x + ox] = 1; return m; };
  // The mask on b's grid, pulled onto a's grid: the square at its a position.
  assert.ok(iou(warp(sq(3, -2), f), sq(0, 0)) > 0.9);
}

// Mask ops.
{
  const c = new Float32Array(W * H).fill(0.3);
  assert.ok(boxMean(c, W, H, 3).every((x) => Math.abs(x - 0.3) < 1e-6));
  const sq = new Float32Array(W * H);
  for (let y = 20; y < 44; y++) for (let x = 30; x < 70; x++) sq[y * W + x] = 1;
  const f = feather(sq, W, H, 6);
  const sum = (a: Float32Array) => a.reduce((s, x) => s + x, 0);
  assert.ok(Math.abs(sum(f) - sum(sq)) / sum(sq) < 0.02, "feather keeps the mass");
  assert.ok(iou(f, sq) > 0.85, "and the 0.5 contour");
  let hard = 0;
  for (let y = 0; y < H; y++) for (let x = 1; x < W; x++) hard = Math.max(hard, Math.abs(f[y * W + x] - f[y * W + x - 1]));
  assert.ok(hard < 0.25, `no hard step after the feather (${hard})`);
  // Guided filter: a mask on a luma edge stays on it.
  const I = new Float32Array(W * H), p = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { I[y * W + x] = x >= 48 ? 0.9 : 0.2; p[y * W + x] = x >= 46 ? 1 : 0; }
  const g = guidedFilter(I, p, W, H, 4, 2e-3);
  assert.ok(g[32 * W + 52] > 0.9 && g[32 * W + 40] < 0.1, "snaps to the edge");
  const bin = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) bin[i] = sq[i] > 0.5 ? 1 : 0;
  const dt = distanceTransform(bin, W, H);
  assert.equal(dt[32 * W + 50], 12, "centre row: 12 px to the top/bottom edge");
  assert.equal(dt[0], 0);
  const pr = promptFromMask(sq, W, H, 0.5)!;
  assert.ok(pr.pos.length >= 1 && pr.pos.every(([x, y]) => sq[y * W + x] === 1), "positives inside");
  assert.ok(pr.neg.length >= 1 && pr.neg.every(([x, y]) => sq[y * W + x] === 0), "negatives outside");
}

// Fill: keyframe masks carried along per-frame flow both ways and cross-faded; the track is a lookup of the filled
// frames (deterministic); the confidence curve eases.
{
  const lumaAt = (dx: number) => { const d = new Float32Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) d[y * W + x] = tex(x - dx, y); return d; };
  const sqAt = (dx: number) => { const m = new Float32Array(W * H); for (let y = 20; y < 44; y++) for (let x = 20; x < 40; x++) m[y * W + x + Math.round(dx)] = 1; return m; };
  // A square moving 2 px a frame, keyframes 5 frames apart; the motion is not linear (a 1-frame pause at frame 2).
  const pos = [0, 2, 2, 4, 6, 8];
  const kf = (j: number, conf = 1): Keyframe => ({ t: j / 30, inc: sqAt(pos[j]), exc: null, luma: lumaAt(pos[j]), conf, reprompts: 0, score: 5 });
  const times = [0, 1, 2, 3, 4].map((j) => j / 30), lumas = [0, 1, 2, 3, 4].map((j) => lumaAt(pos[j]));
  const filled = fillInterval(kf(0), kf(5), times, lumas, W, H, false);
  for (const j of [1, 2, 3, 4]) assert.ok(iou(filled[j].inc, sqAt(pos[j])) > 0.85, `frame ${j} follows the real motion (${iou(filled[j].inc, sqAt(pos[j])).toFixed(2)})`);
  assert.equal(iou(filled[0].inc, sqAt(0)), 1, "the keyframe's own frame is the keyframe's mask");
  const last = fillInterval(kf(5), null, [5 / 30], [lumaAt(pos[5])], W, H, false);
  assert.ok(iou(last[0].inc, sqAt(8)) > 0.99);

  // Track: confidences on 7 keyframes 1/6 s apart, one doubtful.
  const K: Keyframe[] = [0, 1, 2, 3, 4, 5, 6].map((k) => ({ t: k / 6, inc: new Float32Array(0), exc: null, luma: new Float32Array(0), conf: k === 3 ? 0 : 1, reprompts: 0, score: 5 }));
  const grid = sampleRange(0, 1);
  assert.equal(grid.n, 31);
  const frames = Array.from({ length: grid.n }, (_, i) => Uint8Array.from(sqAt(i % 20), (x) => 255 * x));
  const tr = new SegTrack(W, H, K, grid.i0, frames, frames.map(() => null));
  assert.ok(iou(tr.rawAt(7 / 30)!.inc, sqAt(7)) === 1, "an exact frame time reads its filled frame");
  assert.ok(iou(tr.rawAt(7.5 / 30)!.inc, sqAt(7)) > 0.85, "between two samples: their blend");
  assert.deepEqual(Array.from(tr.at(0.4)!.alpha), Array.from(new SegTrack(W, H, K, grid.i0, frames, frames.map(() => null)).at(0.4)!.alpha), "a pure function of the pass");
  assert.ok(tr.weightAt(3 / 6) < 0.5, "a doubtful keyframe lowers the ML weight");
  assert.ok(tr.weightAt(0) > 0.95, "far from it the ML weight is full");
  let step = 0;
  for (let t = 0; t < 1; t += 1 / 30) step = Math.max(step, Math.abs(tr.weightAt(t + 1 / 30) - tr.weightAt(t)));
  assert.ok(step < 0.2, `the weight never snaps (max step per frame ${step.toFixed(2)})`);
  assert.equal(tr.weightAt(2), 0, "outside the pass: the engine's own mask");
  const m = tr.at(0.5 / 6)!;
  assert.ok(m.weight > 0 && m.near.some((x) => x > 0.9 * m.weight) && m.near[0] < 0.05, "near covers the subject, not the far frame");
  assert.deepEqual(keyTimes(0, 0.5, [0.27]), [0, 1 / 6, 0.27, 2 / 6, 0.5].map((x) => +x.toFixed(6)));
}

// Prompts: the engine's automatic subjects become ML prompts (points inside, negatives outside, a box when compact);
// a tap on a diver takes the person detector's box.
{
  const w = 160, h = 90, ids = new Uint16Array(w * h);
  for (let y = 30; y < 60; y++) for (let x = 40; x < 80; x++) ids[y * w + x] = 1;
  for (let y = 5; y < 15; y++) for (let x = 120; x < 140; x++) ids[y * w + x] = 2;
  const sel = { width: w, height: h, ids, animals: [{ id: 1, strength: 1, auto: 1 }, { id: 2, strength: 0.2, auto: 0.2 }] };
  const objs = autoObjects(sel, 1.5, []);
  assert.equal(objs.length, 1, "only toned animals without a correction");
  const o = objs[0];
  assert.equal(o.kind, "include");
  assert.equal(o.t, 1.5);
  o.prompt.points.forEach(([u, v], i) => {
    const inside = ids[Math.floor(v * h) * w + Math.floor(u * w)] === 1;
    assert.equal(inside, o.prompt.labels[i] === 1, "positives inside, negatives outside");
  });
  assert.ok(o.prompt.box && o.prompt.box.x0 < 40 / w && o.prompt.box.x1 > 80 / w, "a compact animal gets its box");
  const diver = promptFor({ u: 0.5, v: 0.5 }, [{ x: 0.4, y: 0.3, w: 0.2, h: 0.5, score: 0.9 }]);
  assert.deepEqual(diver.box, { x0: 0.4, y0: 0.3, x1: 0.6000000000000001, y1: 0.8 });
  assert.equal(promptFor({ u: 0.1, v: 0.1 }, [{ x: 0.4, y: 0.3, w: 0.2, h: 0.5, score: 0.9 }]).box, undefined);
  // A tap on what the ML pops (at full weight) is an exclude; elsewhere, or with the ML eased out, it is not.
  const alpha = new Float32Array(16), near = new Float32Array(16).fill(1);
  alpha[5] = 1;
  assert.equal(segPopsAt({ width: 4, height: 4, alpha, exclude: null, near }, 1.5 / 4, 1.5 / 4), true);
  assert.equal(segPopsAt({ width: 4, height: 4, alpha, exclude: null, near }, 3.5 / 4, 3.5 / 4), false);
  assert.equal(segPopsAt({ width: 4, height: 4, alpha, exclude: null, near: new Float32Array(16) }, 1.5 / 4, 1.5 / 4), false);
  assert.equal(segPopsAt(null, 0.5, 0.5), false);
  // Outlines with AI on: the ML subject (solid) over the engine's other animals, on the overlay grid.
  const eng = { width: 2, height: 2, ids: Uint16Array.from([0, 0, 0, 7]), animals: [{ id: 7, strength: 0.1 }] };
  const os = outlineSelection({ width: 4, height: 4, alpha, exclude: null, near }, eng)!;
  assert.equal(os.ids[5], ML_OUTLINE_ID);
  assert.equal(os.ids[15], 7, "the engine's animal elsewhere, resampled");
  assert.deepEqual(os.animals.map((a) => a.id).sort(), [7, ML_OUTLINE_ID].sort());
  assert.equal(outlineSelection(null, eng), eng, "AI off: the engine's selection");
  // Taking out a popped subject: the exclude gets the popped region's box.
  const ba = new Float32Array(100), bn = new Float32Array(100).fill(1);
  for (let y = 2; y < 6; y++) for (let x = 3; x < 9; x++) ba[y * 10 + x] = 1;
  const pb = popComponentBox({ width: 10, height: 10, alpha: ba, exclude: null, near: bn }, 0.45, 0.35)!;
  assert.ok(pb.x <= 0.3 && pb.x + pb.w >= 0.9 && pb.y <= 0.2 && pb.y + pb.h >= 0.6, JSON.stringify(pb));
  assert.equal(popComponentBox({ width: 10, height: 10, alpha: ba, exclude: null, near: bn }, 0.05, 0.95), null);
}

// Close-ups: the water-departure map tells water (even where the mask leaked onto it) from the subject, and the
// overlay folds the leak cap into the ML alpha when the engine sees no open water.
{
  const w = 64, h = 32, rgba = new Uint8ClampedArray(w * h * 4), inc = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const hole = x >= 30 && x < 34 && y >= 12 && y < 20; // a blue highlight on the subject's flank
    const i = y * w + x, subject = x >= 24 && x < 40 && !hole;
    rgba.set(subject ? [150, 150, 145, 255] : [20, 90, 170, 255], i * 4); // grey subject, blue water
    if (x >= 20 && x < 44) inc[i] = 255; // the mask leaks 4 px onto the water either side
  }
  const d = departMap(rgba, inc, w, h);
  const at = (x: number, y: number) => d.data[Math.floor(y / DEPART_STEP) * d.width + Math.floor(x / DEPART_STEP)] / 255;
  assert.ok(at(4, 16) < 0.1, "open water: 0");
  assert.ok(at(30, 16) > 0.9, "the grey subject: 1");
  assert.ok(at(21, 16) < 0.2, "the leak onto water reads as water");
  assert.ok(at(31, 16) > 0.8, `a small water-coloured spot inside the subject is the subject (${at(31, 16)})`);
  const ov = { width: 2, height: 1, alpha: Float32Array.from([1, 1]), exclude: null, near: Float32Array.from([1, 1]), depart: Float32Array.from([0, 1]) };
  const st = { width: 1, height: 1, data: new Float32Array(4) };
  const c = composeSegStrength(st, ov, true).data;
  assert.ok(c[2] <= SEG_TONE.waterFloor + 1e-6, `a sure leak on water keeps the cap (${c[2]})`);
  assert.equal(c[6], 1, "the subject keeps the full alpha");
  assert.equal(composeSegStrength(st, ov, false).data[2], 1, "open water: the shader caps it instead");
}

// The pop tone (subject clearing): shrinks the water cast along the pixel's own hue, bounded, never a fixed target.
{
  const vh: [number, number] = [-0.6, -0.8]; // the water's hue (unit)
  const blue: [number, number] = [-0.06, -0.08], other: [number, number] = [-0.02, -0.11], warm: [number, number] = [0.05, 0.03];
  const [ba, bb] = clearCast(blue[0], blue[1], vh[0], vh[1], 1);
  assert.ok(Math.abs(Math.atan2(bb, ba) - Math.atan2(blue[1], blue[0])) < 1e-9, "the hue never turns");
  assert.ok(Math.hypot(ba, bb) < Math.hypot(...blue) && Math.hypot(...blue) - Math.hypot(ba, bb) <= SUBJECT_CLEAR.cMax + SUBJECT_CLEAR.desat * 0.1 + 1e-9, "a bounded step toward neutral");
  assert.deepEqual(clearCast(blue[0], blue[1], vh[0], vh[1], 0), blue, "no weight: untouched");
  const [oa, ob] = clearCast(other[0], other[1], vh[0], vh[1], 1);
  assert.ok(Math.hypot(ba - oa, bb - ob) > 0.35 * Math.hypot(blue[0] - other[0], blue[1] - other[1]), "two subject colours stay apart, about in proportion to the chroma (no single pasted colour)");
  const [wa, wb] = clearCast(warm[0], warm[1], vh[0], vh[1], 1);
  assert.ok(Math.hypot(wa, wb) >= (1 - SUBJECT_CLEAR.desat) * Math.hypot(...warm) - 1e-9, "a colour away from the water's hue keeps (almost) all of its chroma");
}

console.log("seg tests passed");
