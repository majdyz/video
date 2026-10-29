// The opt-in "Vivid" look (VIVID_LOOK) and the near-white pink guard.
//   node --experimental-strip-types apps/aqua-fix/test/vivid.test.ts
import assert from "node:assert/strict";
import { highlightPink, vividLook } from "../src/engine/apply.ts";
import { CLAHE_BINS, DEFAULT_SETTINGS, IDENTITY_PARAMS, packUniforms, vividAmountOf, type DepthMap } from "../src/engine/params.ts";

const D = Math.PI / 180;
const lab = (L: number, C: number, hDeg: number): [number, number, number] => [L, C * Math.cos(hDeg * D), C * Math.sin(hDeg * D)];
const hueOf = (x: readonly number[]) => ((Math.atan2(x[2], x[1]) / D) % 360 + 360) % 360;
const chromaOf = (x: readonly number[]) => Math.hypot(x[1], x[2]);
const run = (x: [number, number, number], _L0 = x[0], v = 1, g = 0) => vividLook(x[0], x[1], x[2], v, g);

// 1. Off is the identity; the default settings leave it off.
{
  const x = lab(0.8, 0.12, 201);
  assert.deepEqual(run(x, x[0], 0), x);
  assert.equal(DEFAULT_SETTINGS.vivid, 0);
  assert.equal(vividAmountOf(IDENTITY_PARAMS, DEFAULT_SETTINGS), 0);
  console.log("ok  off by default");
}

// 2. Bright cyan water (the refgrade pair: Oklab hue ≈201°) turns navy, darker, never violet.
{
  const o = run(lab(0.86, 0.12, 201));
  assert.ok(hueOf(o) > 230 && hueOf(o) < 243, `water hue ${hueOf(o)}`);
  assert.ok(o[0] < 0.72 && o[0] > 0.6, `water L ${o[0]}`);
  assert.ok(chromaOf(o) >= 0.12 && chromaOf(o) < 0.14, `water C ${chromaOf(o)}`);
  // Nothing in the water band is pushed past ~243° (CIELAB ≈262°), and bluer hues only come back toward it.
  for (let h = 160; h <= 300; h += 2) assert.ok(hueOf(run(lab(0.7, 0.1, h))) <= Math.max(243.5, h + 1e-6), `hue ${h} → ${hueOf(run(lab(0.7, 0.1, h)))}`);
  console.log("ok  water → navy");
}

// 3. Skin, sand, warm whites and blacks are left alone; shadows never lighter than the source.
{
  for (const [L, C, h] of [[0.7, 0.06, 50], [0.75, 0.03, 100], [0.6, 0.05, 80], [0.9, 0.02, 85]] as const) {
    const o = run(lab(L, C, h));
    assert.ok(Math.abs(hueOf(o) - h) < 0.5, `hue ${h} moved to ${hueOf(o)}`);
    assert.ok(Math.abs(o[0] - L) < 1e-9, `L ${L} → ${o[0]}`);
  }
  // Shadows go darker (a toe), never lighter; mid-tones and highlights keep their lightness.
  const o = run(lab(0.2, 0.0, 0));
  assert.ok(o[0] < 0.2 * 0.9 && o[0] > 0.2 * 0.8, `shadow L ${o[0]}`);
  assert.ok(Math.abs(run(lab(0.6, 0.0, 0))[0] - 0.6) < 1e-9);
  // Dark violet speckle loses most of its chroma.
  assert.ok(chromaOf(run(lab(0.2, 0.05, 290), 0.2)) < 0.025);
  console.log("ok  skin / sand / blacks");
}

// 4. No new edges: the look is a smooth, monotone function of the colour —
//    hue never folds over (order kept) and small steps stay small (bounded
//    gain), in clear and in green water alike.
for (const g of [0, 0.5, 1]) {
  for (const [L, C] of [[0.35, 0.05], [0.6, 0.1], [0.85, 0.12]] as const) {
    let prev = run(lab(L, C, 0), L, 1, g);
    let prevH = Math.atan2(prev[2], prev[1]);
    let unwrapped = prevH;
    let maxGain = 0;
    for (let h = 0.25; h <= 360; h += 0.25) {
      const o = run(lab(L, C, h), L, 1, g);
      let dh = Math.atan2(o[2], o[1]) - prevH;
      dh -= 2 * Math.PI * Math.round(dh / (2 * Math.PI));
      assert.ok(dh > -1e-9, `hue folds at ${h}° (g ${g}, L ${L}, C ${C})`);
      unwrapped += dh;
      const step = Math.hypot(o[0] - prev[0], o[1] - prev[1], o[2] - prev[2]);
      maxGain = Math.max(maxGain, step / (2 * C * Math.sin((0.25 * D) / 2)));
      prev = o;
      prevH = Math.atan2(o[2], o[1]);
    }
    assert.ok(Math.abs(unwrapped - prevH - 2 * Math.PI * Math.round((unwrapped - prevH) / (2 * Math.PI))) < 1e-6);
    assert.ok(maxGain < 3.5, `gain ${maxGain.toFixed(2)} (g ${g}, L ${L}, C ${C})`);
  }
}
// … and along lightness / chroma (a gradient in the water keeps its order).
for (const g of [0, 1]) {
  let prevL = -1;
  for (let L = 0.05; L <= 1; L += 0.005) {
    const o = run(lab(L, 0.1, 201), L, 1, g);
    assert.ok(o[0] > prevL, `lightness order at ${L.toFixed(3)} (g ${g})`);
    prevL = o[0];
  }
}
// … and along a cyan-to-white gradient (whitish water near the surface): no knee, no dark-blue / white boundary.
{
  let prev = run(lab(0.97, 0.01, 201));
  let maxGain = 0;
  for (let t = 0.005; t <= 1; t += 0.005) {
    const x = lab(0.97 - 0.2 * t, 0.01 + 0.13 * t, 201);
    const o = run(x);
    const xp = lab(0.97 - 0.2 * (t - 0.005), 0.01 + 0.13 * (t - 0.005), 201);
    maxGain = Math.max(maxGain, Math.hypot(o[0] - prev[0], o[1] - prev[1], o[2] - prev[2]) / Math.hypot(x[0] - xp[0], x[1] - xp[1], x[2] - xp[2]));
    prev = o;
  }
  assert.ok(maxGain < 2.6, `cyan-to-white gain ${maxGain.toFixed(2)}`);
}
console.log("ok  smooth and monotone (no new edges)");

// 5. Green water: one coherent shift — greens and cyans move by the same angle, nothing goes violet.
{
  const a = hueOf(run(lab(0.6, 0.08, 150), 0.6, 1, 1)) - 150;
  const b = hueOf(run(lab(0.6, 0.08, 180), 0.6, 1, 1)) - 180;
  assert.ok(Math.abs(a - b) < 1 && a > 15, `green shift ${a.toFixed(1)} vs ${b.toFixed(1)}`);
  assert.ok(hueOf(run(lab(0.6, 0.1, 235), 0.6, 1, 1)) < 243);
  console.log("ok  green water shifts as one");
}

// 6. Do-no-harm: graded / topside footage (calm) gets no look; the shader reads the amount at p23.z.
{
  assert.equal(vividAmountOf({ ...IDENTITY_PARAMS, calmTone: 1 }, { ...DEFAULT_SETTINGS, vivid: 1 }), 0);
  assert.equal(vividAmountOf(IDENTITY_PARAMS, { ...DEFAULT_SETTINGS, vivid: 1 }), 1);
  const depth: DepthMap = { width: 1, height: 1, fields: new Float32Array(4), guide: new Float32Array(3) };
  const u = packUniforms(IDENTITY_PARAMS, { ...DEFAULT_SETTINGS, vivid: 1 }, depth, { tilesX: 1, tilesY: 1, bins: CLAHE_BINS, data: new Float32Array(CLAHE_BINS) }, 0, 0);
  assert.equal(u[94], 1);
  console.log("ok  do-no-harm gate and uniform");
}

// 7. Near-white pink guard (default path): faint pink in a highlight goes neutral; warm white and skin stay.
{
  const pink = lab(0.93, 0.025, 350);
  const [a, b] = highlightPink(pink[0], pink[1], pink[2]);
  assert.ok(Math.hypot(a, b) < 0.012);
  for (const h of [85, 60]) {
    const x = lab(0.93, 0.025, h);
    const [a2, b2] = highlightPink(x[0], x[1], x[2]);
    assert.ok(Math.abs(Math.hypot(a2, b2) - 0.025) < 0.002, `hue ${h}`);
  }
  // Mid-tones and vivid pinks are untouched.
  const mid = lab(0.6, 0.025, 350);
  assert.deepEqual(highlightPink(mid[0], mid[1], mid[2]), [mid[1], mid[2]]);
  console.log("ok  near-white pink guard");
}
