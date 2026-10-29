// Highlight scoring (feature 9a): feature extraction on synthetic frames and reel selection.
//   node --experimental-strip-types --no-warnings apps/studio/test/highlights.test.ts
import assert from "node:assert/strict";
import { detectCuts, frameFeatures, pickHighlights, windowFeatures, type FrameLike, type HighlightWindow, type TimedFeatures } from "../src/pipeline/highlights.ts";

const near = (a: number, b: number, tol: number, msg: string) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (±${tol})`);

// Seeded PRNG so the test is deterministic.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

// ---------------------------------------------------------------- synthetic frames
const W = 96, H = 54;
/** A reef-ish texture: value noise in two octaves, tinted; `dx` shifts it, `blur` box-blurs it. */
function makeFrame(opts: { seed: number; dx?: number; blur?: number; tint?: [number, number, number]; grey?: boolean }): FrameLike {
  const r = rng(opts.seed);
  const G = 12;
  const grid = Array.from({ length: (G + 2) * (G + 2) }, () => r());
  const fine = Array.from({ length: 64 * 64 }, () => r());
  const val = (x: number, y: number) => {
    const gx = (x / W) * G, gy = (y / H) * G;
    const ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
    const g = (a: number, b: number) => grid[(b % (G + 2)) * (G + 2) + (a % (G + 2))];
    const coarse = g(ix, iy) * (1 - fx) * (1 - fy) + g(ix + 1, iy) * fx * (1 - fy) + g(ix, iy + 1) * (1 - fx) * fy + g(ix + 1, iy + 1) * fx * fy;
    return 0.6 * coarse + 0.4 * fine[((y & 63) * 64 + (x & 63))];
  };
  const dx = opts.dx ?? 0;
  let lum = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) lum[y * W + x] = val(((x + dx) % W + W) % W + 200, y);
  const b = opts.blur ?? 0;
  for (let pass = 0; pass < b; pass++) {
    const o = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let s = 0, n = 0;
      for (let v = -1; v <= 1; v++) for (let u = -1; u <= 1; u++) {
        const X = Math.min(W - 1, Math.max(0, x + u)), Y = Math.min(H - 1, Math.max(0, y + v));
        s += lum[Y * W + X];
        n++;
      }
      o[y * W + x] = s / n;
    }
    lum = o;
  }
  const tint = opts.grey ? [1, 1, 1] : opts.tint ?? [0.35, 0.8, 1];
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    data[i * 4] = 255 * lum[i] * tint[0];
    data[i * 4 + 1] = 255 * lum[i] * tint[1];
    data[i * 4 + 2] = 255 * lum[i] * tint[2];
    data[i * 4 + 3] = 255;
  }
  return { data, width: W, height: H };
}

const sharp = frameFeatures(makeFrame({ seed: 1 }));
const soft = frameFeatures(makeFrame({ seed: 1, blur: 3 }));
assert.ok(sharp.sharpness > 4 * soft.sharpness, `blur lowers sharpness: ${sharp.sharpness.toFixed(3)} vs ${soft.sharpness.toFixed(3)}`);
const grey = frameFeatures(makeFrame({ seed: 1, grey: true }));
const vivid = frameFeatures(makeFrame({ seed: 1, tint: [1, 0.3, 0.6] }));
assert.ok(grey.colour < 0.02, `grey frame has no colour: ${grey.colour}`);
assert.ok(vivid.colour > 3 * frameFeatures(makeFrame({ seed: 1, tint: [0.8, 0.85, 0.9] })).colour, "vivid beats washed-out");
// Motion: a 4 px pan is measured (to the 2 px grid of the half-size search).
const a = frameFeatures(makeFrame({ seed: 2 }));
const b = frameFeatures(makeFrame({ seed: 2, dx: 4 }), a);
near(b.motion * W, 4, 2, "4 px pan");
assert.equal(frameFeatures(makeFrame({ seed: 2 }), a).motion, 0, "still camera");
assert.ok(b.change < 0.1, "a pan is not a cut");
const cutF = frameFeatures(makeFrame({ seed: 99, tint: [1, 0.6, 0.3] }), a);
assert.ok(cutF.change > 0.25, `new scene changes the histogram: ${cutF.change}`);

// ---------------------------------------------------------------- end to end on frames: 2 min at 2 fps, blur at 40–60 s, cut at 80 s
{
  const frames: TimedFeatures[] = [];
  let prev = null;
  for (let i = 0; i < 240; i++) {
    const t = i / 2;
    const scene = t < 80 ? 3 : 4;
    const fr = makeFrame({ seed: scene, dx: i % 3, blur: t >= 40 && t < 60 ? 3 : 0, tint: scene === 3 ? [0.35, 0.8, 1] : [0.9, 0.5, 0.4] });
    const f = frameFeatures(fr, prev);
    frames.push({ t, f });
    prev = f;
  }
  const cuts = detectCuts(frames);
  assert.equal(cuts.length, 1, `one cut: ${cuts}`);
  near(cuts[0], 79.75, 0.5, "cut time");
  const wins = windowFeatures(frames, { windowS: 1, sourceS: 120 });
  assert.equal(wins.length, 120);
  const reel = pickHighlights(wins, { targetS: 30, sourceS: 120, cuts });
  near(reel.totalS, 30, 0.5, "30 s reel from frames");
  for (const p of reel.picks) {
    assert.ok(p.t1 <= 40 || p.t0 >= 60, `pick ${p.t0}–${p.t1} avoids the blur`);
    assert.ok(!(p.t0 < cuts[0] && p.t1 > cuts[0]), "no pick straddles the cut");
  }
  assert.ok(reel.blurryWindows >= 18, `blurry windows found: ${reel.blurryWindows}`);
}

// ---------------------------------------------------------------- 60-minute source from window features
const SRC = 3600;
const r = rng(7);
const cuts: number[] = [];
for (let t = 20 + r() * 40; t < SRC; t += 15 + r() * 75) cuts.push(Math.round(t * 10) / 10);
// Blurry stretches (descent, a silt-out, ascent) — the silt-out is colourful and "full of subject" to tempt the scorer.
const blurry = (t: number) => t < 120 || (t >= 1500 && t < 1620) || t >= 3420;
const windows: HighlightWindow[] = [];
for (let t = 0; t < SRC; t++) {
  const lively = 0.5 + 0.5 * Math.sin(t / 97) * Math.cos(t / 31);
  windows.push({
    t0: t, t1: t + 1,
    sharpness: blurry(t) ? 0.2 + 0.2 * r() : 2 + 3 * r(),
    subject: blurry(t) ? 0.9 : Math.max(0, Math.min(1, lively + 0.2 * (r() - 0.5))),
    colour: blurry(t) ? 0.4 : 0.1 + 0.15 * lively + 0.05 * r(),
    calm: blurry(t) ? 1 : 0.5 + 0.5 * r(),
  });
}
// A run of excellent-but-short-lived windows clustered in one place, to test variety.
for (let t = 600; t < 700; t++) Object.assign(windows[t], { subject: 1, colour: 0.4, calm: 1, sharpness: 5 });
const gate = 0.5 * [...windows.map((w) => w.sharpness)].sort((x, y) => x - y)[SRC >> 1];
const t0 = performance.now();
for (const target of [30, 60, 90]) {
  const reel = pickHighlights(windows, { targetS: target, sourceS: SRC, cuts });
  near(reel.totalS, target, 0.5, `${target} s reel length`);
  const sum = reel.picks.reduce((s, p) => s + p.t1 - p.t0, 0);
  near(sum, reel.totalS, 1e-6, "totalS is the sum");
  assert.equal(reel.short, false);
  for (let i = 0; i < reel.picks.length; i++) {
    const p = reel.picks[i];
    assert.ok(p.t0 >= 0 && p.t1 <= SRC && p.t1 > p.t0, `pick inside the source: ${p.t0}–${p.t1}`);
    assert.ok(p.t1 - p.t0 >= 1.5 - 1e-9, "no clip under the minimum");
    if (i) assert.ok(p.t0 >= reel.picks[i - 1].t1, "no overlaps, source order");
    for (let t = Math.floor(p.t0); t < Math.ceil(p.t1); t++) assert.ok(windows[t].sharpness >= gate, `pick ${p.t0}–${p.t1} has no blurry window (t=${t})`);
    for (const c of cuts) assert.ok(!(c > p.t0 + 1e-6 && c < p.t1 - 1e-6), `pick ${p.t0}–${p.t1} does not straddle cut ${c}`);
    // Snapped: a cut just after the start would have pulled the start onto it.
    for (const c of cuts) assert.ok(!(c > p.t0 + 1e-6 && c <= p.t0 + 1 && c + (p.t1 - p.t0) <= SRC), `pick ${p.t0} snaps to cut ${c}`);
  }
  // Variety: picks spread across the dive, not all in the 600–700 s honey pot.
  const deciles = new Set(reel.picks.map((p) => Math.floor((p.t0 / SRC) * 10)));
  assert.ok(deciles.size >= Math.min(7, reel.picks.length), `${target} s: picks in ${deciles.size} deciles`);
  const inPot = reel.picks.filter((p) => p.t0 >= 600 && p.t1 <= 700).length;
  assert.ok(inPot >= 1 && inPot <= Math.max(2, Math.ceil(reel.picks.length / 6)), `${target} s: the best stretch is used but not hogged (${inPot})`);
}
const ms = performance.now() - t0;
assert.ok(ms < 5000, `60-min source scored in ${ms.toFixed(0)} ms`);

// Not enough usable footage: everything blurry but 20 s.
{
  const ws: HighlightWindow[] = Array.from({ length: 300 }, (_, t) => ({ t0: t, t1: t + 1, sharpness: t >= 100 && t < 120 ? 5 : 0.1 }));
  const reel = pickHighlights(ws, { targetS: 60, sourceS: 300, minSharpness: 1 });
  assert.equal(reel.short, true);
  assert.ok(reel.totalS <= 20 + 1e-9);
  for (const p of reel.picks) assert.ok(p.t0 >= 100 && p.t1 <= 120);
}
// Source shorter than the target: the target clamps to the source.
{
  const ws: HighlightWindow[] = Array.from({ length: 20 }, (_, t) => ({ t0: t, t1: t + 1, sharpness: 3 }));
  const reel = pickHighlights(ws, { targetS: 30, sourceS: 20 });
  assert.ok(reel.totalS <= 20);
}

console.log(`highlights tests passed (60-min source: ${ms.toFixed(0)} ms for 3 reels)`);
