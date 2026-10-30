// AI subject detection (pure parts): memory bank assembly, optical flow, mask ops, keyframe interpolation and the
// confidence curve.   node --experimental-strip-types apps/studio/test/seg.test.ts
import assert from "node:assert/strict";
import { assembleMemory, frameIndex, isEmpty, MEM_DIM, MEM_TOKENS, newBank, pruneBank, storeMemory, type MemEntry } from "../src/pipeline/seg/bank.ts";
import { denseFlow, warp, type Gray } from "../src/pipeline/seg/flow.ts";
import { boxMean, DEPART_STEP, departMap, distanceTransform, feather, guidedFilter, iou, nearMap, promptFromMask, rleDecode, rleEncode, sdfFeather } from "../src/pipeline/seg/mask.ts";
import { composeSegStrength } from "../../aqua-fix/src/engine/seg-overlay.ts";
import { SEG_TONE } from "../../aqua-fix/src/engine/grade-shader.ts";
import { clearCast } from "../../aqua-fix/src/engine/apply.ts";
import { SUBJECT_CLEAR } from "../../aqua-fix/src/engine/params.ts";
import { fillInterval, keyTimes, sampleRange, SEG, SegTrack, type Keyframe } from "../src/pipeline/seg/track.ts";
import { linearToOklab } from "../../aqua-fix/src/engine/color.ts";
import { autoObjects, ML_OUTLINE_ID, outlineSelection, popComponentBox, promptFor, SegLive, segPopsAt } from "../src/pipeline/seg/studio-seg.ts";

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
  assert.deepEqual(keyTimes(0, 0.5, [0.27], 6), [0, 1 / 6, 0.27, 2 / 6, 0.5].map((x) => +x.toFixed(6)));
  assert.deepEqual(keyTimes(0, 0.5, [], 4), [0, 0.25, 0.5]);
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
  const nearPart = near.slice(); nearPart[15] = 0; // the ML is trusted everywhere but the far corner
  const os = outlineSelection({ width: 4, height: 4, alpha, exclude: null, near: nearPart }, eng)!;
  assert.equal(os.ids[5], ML_OUTLINE_ID);
  assert.equal(os.ids[15], 7, "the engine's animal where the ML is not trusted, resampled");
  assert.equal(os.ids[10], 0, "where the ML is trusted, its 'not the subject' wins over the engine's animal");
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
}

// The tone stays inside the subject: the alpha is the mask's signed distance at the grade's own scale; the local
// water L (R) is read from the guide's water only; the regional trust (G) holds deep in the subject, a water-coloured
// patch on it included, and not on water the mask leaked onto.
{
  assert.equal(SEG.alphaR, SEG_TONE.alphaR, "studio feather and grade read the same distance scale");
  const W = 160, H = 60, m = new Float32Array(W * H);
  // Mask: the subject (x 40..99) plus a leak onto the water to its right (x 100..139).
  for (let y = 10; y < 50; y++) for (let x = 40; x < 140; x++) m[y * W + x] = 1;
  const a = sdfFeather(m, W, H, SEG.alphaR);
  assert.ok(Math.abs(a[30 * W + 40] - (0.5 + 0.5 / (2 * SEG.alphaR))) < 1e-6 && Math.abs(a[30 * W + 39] - (0.5 - 0.5 / (2 * SEG.alphaR))) < 1e-6, "0.5 on the contour");
  // Guide at half the overlay grid: a bright subject (linear 0.5) with a water-coloured patch, in darker water (0.05).
  const gw = 80, gh = 30, g = new Float32Array(gw * gh * 4);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    const sub = x >= 20 && x < 50 && y >= 5 && y < 25 && !(x >= 34 && x < 36 && y >= 14 && y < 16);
    g.fill(sub ? 0.5 : 0.05, (y * gw + x) * 4, (y * gw + x) * 4 + 3);
  }
  const ov = { width: W, height: H, alpha: a, exclude: null, near: new Float32Array(W * H).fill(1), depart: null };
  const c = composeSegStrength(ov, { width: gw, height: gh, data: g }).data;
  const Lw = linearToOklab(0.05, 0.05, 0.05)[0];
  for (const [x, y] of [[150, 30], [10, 5], [70, 30]]) assert.ok(Math.abs(c[(y * W + x) * 4] - Lw) < 0.01, `water L everywhere, under the subject too (${c[(y * W + x) * 4].toFixed(3)} vs ${Lw.toFixed(3)})`);
  // The regional trust rides the ML weight (A).
  const T = (x: number, y: number) => c[(y * W + x) * 4 + 3];
  assert.ok(T(70, 30) > 0.95, `deep in the subject the mask rules, its water-coloured patch too (${T(70, 30).toFixed(2)})`);
  assert.ok(T(130, 30) < 0.1, `the leak onto the water is not trusted (${T(130, 30).toFixed(2)})`);
  let step = 0;
  for (let y = 12; y < 48; y++) for (let x = 42; x < 138; x++) step = Math.max(step, Math.abs(T(x + 1, y) - T(x, y)), Math.abs(T(x, y + 1) - T(x, y)));
  assert.ok(step < 0.08, `the trust varies slowly, never in patches (max step ${step.toFixed(3)} per texel)`);
  assert.ok((c[(30 * W + 70) * 4 + 2] - 0.5) * 2 * SEG_TONE.alphaR >= SEG_TONE.rampIn, "deep inside the tone is full");
  const noGuide = composeSegStrength(ov).data;
  assert.ok(noGuide[0] === -1 && noGuide[1] === 1 && noGuide[(30 * W + 70) * 4 + 3] === 1, "no guide: no water to compare with, the mask rules");
  const full = { width: W, height: H, alpha: new Float32Array(W * H).fill(1), exclude: null, near: ov.near, depart: null };
  assert.equal(composeSegStrength(full, { width: gw, height: gh, data: g }).data[0], -1, "no water in the frame: -1");
}

// The ramp-in follows the part's thickness: a big body fades in gently from its contour (a contour that runs
// across the animal is no step), a thin fin is toned nearly to its edge and keeps the per-pixel water test (G).
{
  const W = 160, H = 80, m = new Float32Array(W * H);
  for (let y = 10; y < 70; y++) for (let x = 20; x < 100; x++) m[y * W + x] = 1; // a body 60 px tall
  for (let y = 38; y < 41; y++) for (let x = 100; x < 150; x++) m[y * W + x] = 1; // a fin 3 px thick
  const a = sdfFeather(m, W, H, SEG.alphaR);
  const c = composeSegStrength({ width: W, height: H, alpha: a, exclude: null, near: new Float32Array(W * H).fill(1), depart: null }).data;
  const dOf = (x: number, y: number) => (c[(y * W + x) * 4 + 2] - 0.5) * 2 * SEG_TONE.alphaR;
  assert.ok(dOf(60, 14) < 0.5 * SEG_TONE.rampIn, `a big body ramps in slowly (${dOf(60, 14).toFixed(2)} mask px read back 4 px in)`);
  assert.ok(dOf(60, 40) >= SEG_TONE.rampIn, `its middle is toned in full (${dOf(60, 40).toFixed(2)})`);
  assert.ok(dOf(130, 39) > 0.5 && dOf(130, 39) > 0.9 * Math.max(0, (a[39 * W + 130] - 0.5) * 2 * SEG_TONE.alphaR), `a thin fin keeps its short ramp (${dOf(130, 39).toFixed(2)})`);
  assert.ok(c[(39 * W + 130) * 4 + 1] > 0.8 && c[(14 * W + 60) * 4 + 1] < 0.2, "the per-pixel water test on thin parts only");
  let step = 0;
  for (let y = 11; y < 69; y++) for (let x = 21; x < 99; x++) step = Math.max(step, Math.abs(dOf(x + 1, y) - dOf(x, y)), Math.abs(dOf(x, y + 1) - dOf(x, y)));
  assert.ok(step < 0.5, `the ramp varies smoothly (max ${step.toFixed(2)} per texel)`);
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

// The feather keeps thin parts: a 3 px fin stays above 0.5 along its middle (a blur of the same width erases it),
// and the edge is a ramp (no hard step).
{
  const w = 80, h = 40, m = new Float32Array(w * h);
  for (let y = 10; y < 30; y++) for (let x = 10; x < 40; x++) m[y * w + x] = 1; // body
  for (let y = 19; y < 22; y++) for (let x = 40; x < 75; x++) m[y * w + x] = 1; // fin, 3 px
  const s = sdfFeather(m, w, h, 6), b = feather(m, w, h, 6);
  assert.ok(s[20 * w + 65] > 0.5, `fin kept (${s[20 * w + 65].toFixed(2)})`);
  assert.ok(b[20 * w + 65] < 0.5, "a blur would have erased it");
  let step = 0;
  for (let x = 1; x < w; x++) step = Math.max(step, Math.abs(s[15 * w + x] - s[15 * w + x - 1]));
  assert.ok(step <= 0.1, `soft edge (${step.toFixed(2)} per px)`);
  // ML trust (near): full on the fin, as on the body, and nothing far out.
  const n = nearMap(m, w, h, 4);
  assert.ok(n[20 * w + 65] > 0.95 && n[20 * w + 20] > 0.95, `fin trusted (${n[20 * w + 65].toFixed(2)})`);
  assert.ok(n[2 * w + 78] < 0.01, "far water not");
}

// Live masks hand over smoothly: full ML weight inside a filled run, easing to nothing toward unfilled frames,
// null on unfilled frames (the engine's own mask there).
{
  const mw = 16, mh = 9, qw = 4, qh = 3, n = 60;
  const live = new SegLive({ mw, mh, i0: 0, n });
  const frame = (i: number) => ({ i, alpha: rleEncode(new Uint8Array(mw * mh).fill(255)), nearQ: rleEncode(new Uint8Array(qw * qh).fill(255)), excQ: null, depQ: rleEncode(new Uint8Array(qw * qh)) });
  live.put(Array.from({ length: 30 }, (_, i) => frame(i))); // frames 0..29 filled
  live.setConf(keyTimes(0, 2).map((t) => ({ t, conf: 1 })));
  const near = (t: number) => live.at(t)?.near[0] ?? null;
  assert.ok(Math.abs((near(0.3) ?? 0) - 1) < 1e-3, "full weight inside a filled run");
  assert.equal(near(1.2), null, "unfilled frame: the engine's mask");
  const ws = [20, 22, 24, 26, 28, 29].map((i) => near(i / 30) ?? -1);
  for (let k = 1; k < ws.length; k++) assert.ok(ws[k] <= ws[k - 1] + 1e-6, `eases out toward the gap (${ws.map((w) => w.toFixed(2))})`);
  assert.ok(ws[ws.length - 1] < 0.05 && ws[0] > 0.95, "reaches nothing at the edge");
  assert.equal(live.coverage, 0.5);
}

// Run-length coded maps round-trip exactly; a feathered mask codes small.
{
  const w = 320, h = 180, m = new Uint8Array(w * h);
  for (let y = 40; y < 140; y++) for (let x = 60; x < 260; x++) m[y * w + x] = 255;
  for (let x = 58; x < 62; x++) for (let y = 40; y < 140; y++) m[y * w + x] = 64 * (x - 57); // a ramp
  const r = rleEncode(m);
  assert.deepEqual(rleDecode(r, m.length), m);
  assert.ok(r.length < m.length / 10, `codes small (${r.length} of ${m.length} bytes)`);
  const noise = Uint8Array.from({ length: 1000 }, (_, i) => (i * 7919) % 251);
  assert.deepEqual(rleDecode(rleEncode(noise), noise.length), noise);
}

console.log("seg tests passed");
