// The cobalt water-hue map (BLUE_WATER): in the default Vivid style at WATER_HUE.amount, at 1 in the Blue water style; its gate (blueGateOf).
//   node --experimental-strip-types apps/aqua-fix/test/bluewater.test.ts
import assert from "node:assert/strict";
import { blueLook, vividLook } from "../src/engine/apply.ts";
import { BLUE_WATER, CLAHE_BINS, DEFAULT_SETTINGS, IDENTITY_PARAMS, WATER_HUE, blueAmountOf, blueGateOf, packUniforms, vividAmountOf, vividGateOf, type DepthMap } from "../src/engine/params.ts";

const D = Math.PI / 180;
const lab = (L: number, C: number, hDeg: number): [number, number, number] => [L, C * Math.cos(hDeg * D), C * Math.sin(hDeg * D)];
const hueOf = (x: readonly number[]) => ((Math.atan2(x[2], x[1]) / D) % 360 + 360) % 360;
const chromaOf = (x: readonly number[]) => Math.hypot(x[1], x[2]);
const run = (x: [number, number, number], v = 1, g = 0) => blueLook(x[0], x[1], x[2], v, g);

// 1. Off is the identity and the default; it never changes Vivid's amount.
{
  const x = lab(0.4, 0.05, 190);
  const o = run(x, 0);
  assert.deepEqual([o[0], o[1], o[2]], x);
  assert.equal(DEFAULT_SETTINGS.blue ?? 0, 0);
  assert.equal(blueAmountOf(IDENTITY_PARAMS, DEFAULT_SETTINGS), 0);
  assert.equal(vividAmountOf(IDENTITY_PARAMS, { ...DEFAULT_SETTINGS, vivid: 1, blue: 1 }), vividAmountOf(IDENTITY_PARAMS, { ...DEFAULT_SETTINGS, vivid: 1 }));
  const depth: DepthMap = { width: 1, height: 1, fields: new Float32Array(4), guide: new Float32Array(3) };
  const clahe = { tilesX: 1, tilesY: 1, bins: CLAHE_BINS, data: new Float32Array(CLAHE_BINS) };
  assert.equal(packUniforms(IDENTITY_PARAMS, DEFAULT_SETTINGS, depth, clahe, 0, 1)[103], 0);
  assert.equal(packUniforms(IDENTITY_PARAMS, { ...DEFAULT_SETTINGS, vivid: 1, blue: 1 }, depth, clahe, 0, 1)[103], 1);
  console.log("ok  off by default, Vivid unchanged");
}

// 2. Blue and teal water land on the cobalt target at chroma ≈ cK·L; faint teal (near the neutral end of the ramp) most
//    of the way; green water in a green-water frame turns a deep teal-blue (never neon, never left green).
{
  const T = BLUE_WATER.target / D;
  for (const [L, C, h, g] of [[0.32, 0.068, 234, 0], [0.4, 0.037, 189, 0], [0.4, 0.027, 186, 0.1], [0.35, 0.05, 275, 0]] as const) {
    const o = run(lab(L, C, h), 1, g);
    assert.ok(Math.abs(hueOf(o) - T) < (C < 0.04 ? 12 : 6), `water ${h}° (g ${g}) → ${hueOf(o).toFixed(1)}°`);
    assert.ok(chromaOf(o) > 0.05 && chromaOf(o) < 0.105, `water C ${C} → ${chromaOf(o).toFixed(3)}`);
  }
  const gw = run(lab(0.4, 0.05, 150), 1, 1);
  assert.ok(hueOf(gw) > 200 && hueOf(gw) < T + 6 && chromaOf(gw) < 0.1, `green water → ${hueOf(gw).toFixed(1)}° C ${chromaOf(gw).toFixed(3)}`);
  console.log("ok  water → cobalt, green water → teal-blue");
}

// 3. Near-greys (whose hue is noise) pass source chroma noise at a bounded gain: no blue/green speckle on dark,
//    noisy water or hazy reef ("water" is a linear projection, not a hue angle).
{
  let worst = 0;
  for (let i = 0; i < 20000; i++) {
    const x = lab(0.05 + 0.9 * Math.random(), 0.02 * Math.random(), 360 * Math.random());
    const y: [number, number, number] = [x[0], x[1] + 0.002 * (Math.random() - 0.5), x[2] + 0.002 * (Math.random() - 0.5)];
    const a0 = run(x), b = run(y);
    worst = Math.max(worst, Math.hypot(a0[1] - b[1], a0[2] - b[2]) / Math.max(1e-6, Math.hypot(x[1] - y[1], x[2] - y[2])));
  }
  assert.ok(worst < 3, `near-grey chroma noise gain ${worst.toFixed(2)}`);
  console.log(`ok  near-grey noise gain ${worst.toFixed(2)}×`);
}

// 4. Smooth: neighbouring colours stay neighbours (no step anywhere in the colour space).
{
  let worst = 0;
  for (let i = 0; i < 20000; i++) {
    const x = lab(0.05 + 0.9 * Math.random(), 0.15 * Math.random(), 360 * Math.random());
    const y: [number, number, number] = [x[0] + 0.002 * (Math.random() - 0.5), x[1] + 0.002 * (Math.random() - 0.5), x[2] + 0.002 * (Math.random() - 0.5)];
    const a = run(x), b = run(y);
    const dIn = Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
    worst = Math.max(worst, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / Math.max(1e-6, dIn));
  }
  assert.ok(worst < 8, `local gain ${worst.toFixed(1)}`);
  console.log(`ok  smooth (worst local gain ${worst.toFixed(1)}×)`);
}

// 5. Warm subjects go orange and richer; skin-red hues and silver / white subjects are not pushed warm.
{
  const j = run(lab(0.74, 0.057, 85));
  assert.ok(hueOf(j) < 78 && hueOf(j) > 58 && chromaOf(j) > 0.075, `jelly ${hueOf(j).toFixed(1)}° C ${chromaOf(j).toFixed(3)}`);
  const skin = run(lab(0.7, 0.06, 25));
  assert.ok(Math.abs(hueOf(skin) - 25) < 1 && Math.abs(chromaOf(skin) - 0.06) < 1e-3, "skin-red hue unchanged");
  const silver = run(lab(0.68, 0.025, 225));
  assert.ok(chromaOf(silver) < 0.018, `silver C ${chromaOf(silver).toFixed(3)}`);
  const white = run(lab(0.95, 0.01, 230));
  assert.ok(chromaOf(white) < 0.01 && white[0] > 0.94, "white stays white");
  console.log("ok  warm → orange, silver → neutral");
}

// 6. Shadows: deeper, monotone in L, black stays black and near-neutral.
{
  let prev = -1;
  for (let L = 0; L <= 1.0001; L += 0.01) {
    const o = run(lab(L, 0.03, 240));
    assert.ok(o[0] <= L + 1e-9 && o[0] >= prev - 1e-9, `L ${L} → ${o[0]}`);
    prev = o[0];
  }
  const k = run(lab(0.1, 0.01, 200));
  assert.ok(k[0] < 0.08 && chromaOf(k) < 0.03, `shadow ${k[0]} C ${chromaOf(k)}`);
  console.log("ok  deeper shadows");
}

// 7. Gate: a sunlit cenote (dark veil, top much lighter) keeps the style; torch-lit caves / night do not; Vivid's gate is unchanged.
{
  assert.ok(blueGateOf(0.292, 0.019, -0.41) > 0.95);
  assert.ok(vividGateOf(0.292, 0.019, -0.41) < 0.2);
  assert.equal(blueGateOf(0.247, 0.012, -0.03), 0);
  assert.ok(blueGateOf(0.28, 0.03, 0.1) < 0.05);
  assert.ok(blueGateOf(0.615, 0.034, 0.513) <= 0.3);
  assert.equal(blueGateOf(0.87, 0.136, -0.33), 1);
  assert.equal(blueAmountOf({ ...IDENTITY_PARAMS, blueGate: 0.25 }, { ...DEFAULT_SETTINGS, blue: 1 }), 0.25);
  assert.equal(blueAmountOf({ ...IDENTITY_PARAMS, calm: 0.9 }, { ...DEFAULT_SETTINGS, blue: 1 }), 0);
  // Vivid (the default style) carries the water-hue map at WATER_HUE.amount through the same gate; Natural has none.
  assert.equal(blueAmountOf(IDENTITY_PARAMS, { ...DEFAULT_SETTINGS, vivid: 1 }), WATER_HUE.amount);
  assert.equal(blueAmountOf(IDENTITY_PARAMS, { ...DEFAULT_SETTINGS, vivid: 1, blue: 1 }), 1);
  assert.equal(blueAmountOf(IDENTITY_PARAMS, { ...DEFAULT_SETTINGS, vivid: 0 }), 0);
  assert.equal(blueAmountOf({ ...IDENTITY_PARAMS, calm: 0.9 }, { ...DEFAULT_SETTINGS, vivid: 1 }), 0);
  // … and stands down sooner than the rest of Vivid on footage that looks graded / topside.
  assert.equal(blueAmountOf({ ...IDENTITY_PARAMS, calm: 0.3 }, { ...DEFAULT_SETTINGS, vivid: 1 }), 0);
  assert.ok(vividAmountOf({ ...IDENTITY_PARAMS, calm: 0.3 }, { ...DEFAULT_SETTINGS, vivid: 1 }) > 0.5);
  assert.ok(Math.abs(blueAmountOf({ ...IDENTITY_PARAMS, blueGate: 0.25 }, { ...DEFAULT_SETTINGS, vivid: 1 }) - 0.25 * WATER_HUE.amount) < 1e-12);
  console.log("ok  gate");
}

// 8. Applied after Vivid, Blue water finishes what Vivid starts on teal (Vivid alone stays short of cobalt).
{
  const x = lab(0.45, 0.05, 195);
  const v = vividLook(x[0], x[1], x[2], 1, 0);
  const b = run(v);
  assert.ok(hueOf(v) < 240 && Math.abs(hueOf(b) - BLUE_WATER.target / D) < 4, `vivid ${hueOf(v).toFixed(1)} → blue ${hueOf(b).toFixed(1)}`);
  console.log("ok  on top of Vivid");
}

// Off-hue water (BLUE_WATER.far*): at the default look's share, cyan / teal / green water goes further toward the
// cobalt than the plain share would take it; water already near the cobalt, warm colours, near-greys and the full
// style (amount 1) are untouched by the boost; the map stays smooth at the default share.
{
  const T = BLUE_WATER.target / D, v = WATER_HUE.amount, boost = BLUE_WATER.farBoost;
  const withBoost = (x: [number, number, number], k: number, amount = v, g = 0) => { BLUE_WATER.farBoost = k; const o = run(x, amount, g); BLUE_WATER.farBoost = boost; return o; };
  const dist = (o: readonly number[]) => Math.abs(hueOf(o) - T);
  // Green and teal water in a green-water frame (g = 1; elsewhere those hues are vegetation and keep their colour), and cyan-teal water anywhere.
  for (const [h, g] of [[165, 1], [180, 1], [190, 1], [198, 0]] as const) {
    const x = lab(0.45, 0.07, h), o1 = withBoost(x, boost, v, g), o0 = withBoost(x, 0, v, g);
    assert.ok(dist(o1) < dist(o0) - 2, `off-hue water ${h}° (g ${g}): ${hueOf(o0).toFixed(1)}° → ${hueOf(o1).toFixed(1)}° (target ${T.toFixed(0)}°)`);
    assert.ok(chromaOf(o1) < 0.13, "no neon");
  }
  const grass = lab(0.5, 0.07, 120), g1 = withBoost(grass, boost), g0 = withBoost(grass, 0);
  assert.ok(Math.hypot(g1[1] - g0[1], g1[2] - g0[2]) < 1e-9 && Math.abs(hueOf(g1) - 120) < 3, "vegetation keeps its green");
  for (const [L, C, h] of [[0.4, 0.07, 240], [0.4, 0.07, 258], [0.4, 0.07, 280], [0.6, 0.08, 60], [0.5, 0.01, 180], [0.5, 0.06, 95]] as const) {
    const x = lab(L, C, h), o1 = withBoost(x, boost), o0 = withBoost(x, 0);
    assert.ok(Math.hypot(o1[1] - o0[1], o1[2] - o0[2]) < 1e-9, `${h}° C ${C} is not boosted`);
  }
  const x = lab(0.45, 0.07, 170), f1 = withBoost(x, boost, 1), f0 = withBoost(x, 0, 1);
  assert.ok(Math.hypot(f1[1] - f0[1], f1[2] - f0[2]) < 1e-9, "the full style is unchanged");
  let worst = 0, noise = 0;
  for (let i = 0; i < 20000; i++) {
    const p = lab(0.05 + 0.9 * Math.random(), 0.15 * Math.random(), 360 * Math.random());
    const q: [number, number, number] = [p[0] + 0.002 * (Math.random() - 0.5), p[1] + 0.002 * (Math.random() - 0.5), p[2] + 0.002 * (Math.random() - 0.5)];
    const a = run(p, v), b = run(q, v);
    const g = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / Math.max(1e-6, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]));
    worst = Math.max(worst, g);
    if (Math.hypot(p[1], p[2]) < 0.02) noise = Math.max(noise, g);
  }
  assert.ok(worst < 8 && noise < 3, `local gain ${worst.toFixed(1)}, near-grey ${noise.toFixed(2)}`);
  console.log(`ok  off-hue water goes further at the default share (local gain ${worst.toFixed(1)}×, near-grey ${noise.toFixed(2)}×)`);
}
