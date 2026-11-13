// The fitted Look (look-fit.ts): a global transform of the graded Oklab colour, parameter sets per style.
//   node --experimental-strip-types apps/aqua-fix/test/look-fit.test.ts
// (Numerical parity of the GLSL / WGSL twins with fitLook is checked in a real GPU context by scripts/check-shaders.ts.)
import assert from "node:assert/strict";
import { applyGrade, finishPixel, resolveContext } from "../src/engine/apply.ts";
import { GRADE_GLSL, GRADE_WGSL } from "../src/engine/grade-shader.ts";
import { FIT_LOOK, FIT_LOOK_BANDS, FIT_LOOK_IDENTITY, FIT_LOOK_KEYS, FIT_LOOK_LIMITS, SKIN_GUARD, skinGuard, skinGuardCool, fitLook, fitLookAmountOf, fitLookGateOf, fitLookGlsl, fitLookIsIdentity, fitLookMixOf, fitLookSlope, fitLookTone, fitLookWgsl, type FitLookSet } from "../src/engine/look-fit.ts";
import { UNIFORM_FLOATS } from "../src/engine/backend.ts";
import { CLAHE_BINS, DEFAULT_SETTINGS, IDENTITY_PARAMS, SKIN, packUniforms, type DepthMap } from "../src/engine/params.ts";

const D = Math.PI / 180;
const lab = (L: number, C: number, hDeg: number): [number, number, number] => [L, C * Math.cos(hDeg * D), C * Math.sin(hDeg * D)];
const hueOf = (x: readonly number[]) => ((Math.atan2(x[2], x[1]) / D) % 360 + 360) % 360;
const chromaOf = (x: readonly number[]) => Math.hypot(x[1], x[2]);
const LIM = FIT_LOOK_LIMITS;
const limitOf = (k: keyof FitLookSet) => (k === "sh" || k === "mid" || k === "hi" ? LIM.tone : k === "rot" ? LIM.rot : k.startsWith("sh") || k.startsWith("hi") ? LIM.tint : LIM.sat);
// A set with every parameter at its limit, signs mixed: what the fit may at most return.
const EXTREME: FitLookSet = Object.fromEntries(FIT_LOOK_KEYS.map((k, i) => [k, (i % 2 ? -1 : 1) * limitOf(k)])) as FitLookSet;
const STYLES = Object.entries(FIT_LOOK) as [string, FitLookSet][];

// 1. Off is off: amount 0 and the identity set return the colour untouched.
{
  const x = lab(0.47, 0.09, 215);
  assert.deepEqual(fitLook(...x, 0), x);
  assert.deepEqual(fitLook(...x, 0, 1, { vivid: EXTREME, blue: EXTREME }), x);
  const idy = fitLook(...x, 1, 0.5, { vivid: FIT_LOOK_IDENTITY, blue: FIT_LOOK_IDENTITY });
  for (let k = 0; k < 3; k++) assert.ok(Math.abs(idy[k] - x[k]) < 1e-12);
  console.log("ok  amount 0 and the identity set change nothing");
}

// 2. The shipped sets stay inside the limits the fit searches, and their tone curves are monotone with a bounded
//    slope (a slope over 1 amplifies the lightness steps of the stages before).
for (const [name, P] of STYLES) {
  for (const k of FIT_LOOK_KEYS) assert.ok(Math.abs(P[k]) <= limitOf(k) + 1e-9, `${name}.${k} = ${P[k]} outside ±${limitOf(k)}`);
  const [lo, hi] = fitLookSlope(P);
  assert.ok(lo >= LIM.slopeMin && hi <= LIM.slopeMax, `${name} tone slope ${lo.toFixed(2)}..${hi.toFixed(2)}`);
  let prev = -1;
  for (let i = 0; i <= 1000; i++) { const y = fitLookTone(i / 1000, P); assert.ok(y > prev, `${name} tone not monotone at ${i / 1000}`); prev = y; }
  console.log(`ok  ${name}: inside the limits, tone slope ${lo.toFixed(2)}..${hi.toFixed(2)}`);
}

// 3. Black stays black and white stays white, neutral: for any set (the bases vanish at both ends).
for (const P of [EXTREME, ...STYLES.map((s) => s[1])]) {
  for (const L of [0, 1]) {
    const o = fitLook(L, 0, 0, 1, 0, { vivid: P, blue: P });
    assert.ok(Math.abs(o[0] - L) < 1e-12 && chromaOf(o) < 1e-12, `L ${L} -> ${o}`);
  }
}
console.log("ok  black and white are fixed points");

// 4. Neutrals take at most the tint (never more than the limit), and clearly warm colours take none of it and keep
//    their hue exactly: skin stays skin, sand with colour is not pushed toward orange or cyan by the split toning.
for (const [name, P] of [["extreme", EXTREME], ...STYLES] as [string, FitLookSet][]) {
  const sets = { vivid: P, blue: P };
  for (let L = 0.05; L < 1; L += 0.05) {
    const o = fitLook(L, 0, 0, 1, 0, sets);
    assert.ok(chromaOf(o) <= Math.hypot(P.shA, P.shB) + Math.hypot(P.hiA, P.hiB) + 1e-12 && chromaOf(o) <= 2 * Math.SQRT2 * LIM.tint, `${name}: neutral at L ${L.toFixed(2)} -> C ${chromaOf(o).toFixed(4)}`);
  }
  for (let h = 25; h <= 105; h += 5) for (const C of [FIT_LOOK_BANDS.protHi, 0.08, 0.15]) for (const L of [0.3, 0.55, 0.8]) {
    const o = fitLook(...lab(L, C, h), 1, 0, sets);
    assert.ok(Math.abs(hueOf(o) - h) < 1e-6, `${name}: warm hue ${h}° moved to ${hueOf(o).toFixed(2)}°`);
  }
}
console.log("ok  neutrals bounded by the tint, warm colours keep their hue");

// 5. The shipped looks on skin, sand and reef colours: the hue stays put, the chroma change is moderate, and the
//    lightness change stays inside the tone limit.
for (const [name, P] of STYLES) {
  const sets = { vivid: P, blue: P };
  for (const [what, x] of [["skin", lab(0.68, 0.07, 55)], ["tanned skin", lab(0.55, 0.09, 50)], ["sand", lab(0.78, 0.04, 85)], ["orange fish", lab(0.7, 0.16, 55)], ["reef", lab(0.45, 0.06, 40)]] as [string, [number, number, number]][]) {
    const o = fitLook(...x, 1, 0, sets);
    assert.ok(Math.abs(hueOf(o) - hueOf(x)) < 4, `${name}: ${what} hue ${hueOf(x).toFixed(0)}° -> ${hueOf(o).toFixed(1)}°`);
    assert.ok(chromaOf(o) / chromaOf(x) > 0.6 && chromaOf(o) / chromaOf(x) < 1.6, `${name}: ${what} chroma x${(chromaOf(o) / chromaOf(x)).toFixed(2)}`);
    assert.ok(Math.abs(o[0] - x[0]) <= LIM.tone * 1.5, `${name}: ${what} L ${x[0]} -> ${o[0].toFixed(3)}`);
  }
}
console.log("ok  shipped looks keep skin, sand and reef hues");

// 6. Smooth: no steps across lightness, chroma or hue (a global look must not band or split a gradient), even for
//    the extreme set.
{
  const sets = { vivid: EXTREME, blue: EXTREME };
  const far = (p: number[], q: number[]) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  let worst = 0;
  for (let L = 0; L <= 1.0001; L += 0.02) for (let C = 0; C <= 0.3; C += 0.006) for (let h = 0; h < 360; h += 2) {
    const o = fitLook(...lab(L, C, h), 1, 0, sets);
    worst = Math.max(worst, far(o, fitLook(...lab(L + 0.002, C, h), 1, 0, sets)) / 0.002, far(o, fitLook(...lab(L, C + 0.0006, h), 1, 0, sets)) / 0.0006, C > 0 ? far(o, fitLook(...lab(L, C, h + 0.2), 1, 0, sets)) / (C * 0.2 * D) : 0);
  }
  assert.ok(worst < 6, `largest local gain ${worst.toFixed(2)}`);
  // Through the neutral axis: a colour and its opposite at a vanishing chroma land on the same output.
  const a = fitLook(0.5, 1e-7, 0, 1, 0, sets), b = fitLook(0.5, -1e-7, 0, 1, 0, sets);
  assert.ok(far(a, b) < 1e-5, "step across the neutral axis");
  console.log(`ok  continuous (largest local gain ${worst.toFixed(2)} at the extreme set)`);
}

// 7. The amount and the style mix: Natural has no look, Vivid the full one, it stands down with the calm scores
//    (graded, topside) and Vivid's gate (night, lamp-lit); the Blue water style switches the parameter set.
{
  const viv = { ...DEFAULT_SETTINGS, vivid: 1, blue: 0 }, blue = { ...DEFAULT_SETTINGS, vivid: 1, blue: 1 }, nat = { ...DEFAULT_SETTINGS, vivid: 0, blue: 0 };
  assert.equal(fitLookGateOf(IDENTITY_PARAMS, nat), 0);
  assert.equal(fitLookGateOf(IDENTITY_PARAMS, viv), 1);
  assert.equal(fitLookGateOf({ ...IDENTITY_PARAMS, calm: 0.9 }, viv), 0);
  assert.equal(fitLookGateOf({ ...IDENTITY_PARAMS, calmTone: 0.4 }, viv), 0);
  assert.equal(fitLookGateOf({ ...IDENTITY_PARAMS, vividGate: 0 }, viv), 0);
  assert.ok(fitLookGateOf({ ...IDENTITY_PARAMS, vividGate: 0, blueGate: 1 }, blue) === 1, "Blue water follows its own gate");
  const mid = fitLookGateOf({ ...IDENTITY_PARAMS, calm: 0.15 }, viv);
  assert.ok(mid > 0 && mid < 1, `eased with calm: ${mid}`);
  assert.equal(fitLookMixOf(viv), 0); assert.equal(fitLookMixOf(blue), 1);
  const depth: DepthMap = { width: 1, height: 1, fields: new Float32Array(4), guide: new Float32Array(3) };
  const clahe = { tilesX: 1, tilesY: 1, bins: CLAHE_BINS, data: new Float32Array(CLAHE_BINS) };
  assert.equal(UNIFORM_FLOATS, 148);
  // The amount is the gate for a fitted set and 0 for the identity (the shaders then skip the stage).
  assert.equal(fitLookAmountOf(IDENTITY_PARAMS, viv, { vivid: EXTREME, blue: FIT_LOOK_IDENTITY }), 1);
  assert.equal(fitLookAmountOf(IDENTITY_PARAMS, viv, { vivid: FIT_LOOK_IDENTITY, blue: EXTREME }), 0);
  assert.equal(fitLookAmountOf(IDENTITY_PARAMS, blue, { vivid: FIT_LOOK_IDENTITY, blue: EXTREME }), 1);
  assert.equal(fitLookAmountOf(IDENTITY_PARAMS, nat, { vivid: EXTREME, blue: EXTREME }), 0);
  const u = packUniforms({ ...IDENTITY_PARAMS, calm: 0.15 }, blue, depth, clahe, 0, 1);
  assert.ok(Math.abs(u[144] - (fitLookIsIdentity(FIT_LOOK.blue) ? 0 : mid)) < 1e-6 && u[145] === 1, `p36 = ${u[144]}, ${u[145]}`);
  assert.equal(packUniforms(IDENTITY_PARAMS, nat, depth, clahe, 0, 1)[144], 0);
  const ctx = resolveContext({ params: { ...IDENTITY_PARAMS, calm: 0.15 }, settings: blue, depth, clahe });
  assert.ok(Math.abs(ctx.fitLook! - u[144]) < 1e-6 && Math.abs(ctx.fitLookGate! - mid) < 1e-6 && ctx.fitLookMix === 1, "CPU reference and uniforms agree");
  console.log("ok  amount and style mix reach the uniforms (p36) and the CPU reference alike");
}

// 8. The shaders carry the same numbers and run the look at the same place (last, before the gamut knee).
{
  const lit = (x: number) => { const s = x.toFixed(7).replace(/0+$/, ""); return s.endsWith(".") ? s + "0" : s; };
  for (const [name, code, call] of [["GLSL", GRADE_GLSL, "lk = fitLook(lk, p[36].x, p[36].y);"], ["WGSL", GRADE_WGSL, "lk = fitLook(lk, params.p[36].x, params.p[36].y);"]] as const) {
    assert.ok(code.includes(name === "GLSL" ? fitLookGlsl() : fitLookWgsl()), `${name}: look source missing`);
    for (const k of FIT_LOOK_KEYS) assert.ok(code.includes(`mix(${lit(FIT_LOOK.vivid[k])}, ${lit(FIT_LOOK.blue[k])}, m)`), `${name}: ${k}`);
    const at = code.indexOf(call), cap = code.indexOf("oklabToLinear(capChroma(lk", at), tone = code.lastIndexOf("TONE_TOE_LO", at);
    assert.ok(at > 0 && cap > at && tone > 0 && tone < at && code.indexOf(call, at + 1) < 0, `${name}: look not called once between the tone target and the gamut knee`);
  }
  console.log("ok  GLSL and WGSL carry the shipped sets and call the look last");
}

// 9. The CPU reference applies it: a frame graded with the look equals the look-less end of the pixel replayed
//    through finishPixel (what the fit optimises is what ships), and Natural is untouched by the sets.
{
  const depth: DepthMap = { width: 1, height: 1, fields: new Float32Array([0.5, 0, 0.5, 1]), guide: new Float32Array([0.2, 0.4, 0.5]) };
  const clahe = { tilesX: 1, tilesY: 1, bins: CLAHE_BINS, data: Float32Array.from({ length: CLAHE_BINS }, (_, i) => i / (CLAHE_BINS - 1)) };
  const img = new Uint8ClampedArray(16 * 16 * 4);
  for (let i = 0; i < 256; i++) { img[i * 4] = 20 + (i * 7) % 90; img[i * 4 + 1] = 60 + (i * 13) % 150; img[i * 4 + 2] = 90 + (i * 5) % 160; img[i * 4 + 3] = 255; }
  const settings = { ...DEFAULT_SETTINGS, vivid: 1 };
  const rec: number[][] = [];
  const out = applyGrade({ params: IDENTITY_PARAMS, settings, depth, clahe, lookTap: (...v) => rec.push(v) }, img, 16, 16);
  assert.equal(rec.length, 256);
  for (let i = 0; i < 256; i++) {
    const [L, a, b, cFloor, dr, strength, look, mix] = rec[i];
    assert.equal(look, 1);
    const c = finishPixel(L, a, b, cFloor, dr, look, mix);
    const want = Uint8ClampedArray.from([0, 1, 2], (k) => (img[i * 4 + k] / 255 + (c[k] - img[i * 4 + k] / 255) * strength) * 255 + 0.5);
    for (let k = 0; k < 3; k++) assert.equal(out[i * 4 + k], want[k], `pixel ${i} channel ${k}`);
  }
  const nat: number[] = [];
  applyGrade({ params: IDENTITY_PARAMS, settings: { ...DEFAULT_SETTINGS, vivid: 0 }, depth, clahe, lookTap: (...v) => nat.push(v[6]) }, img, 16, 16);
  assert.ok(nat.every((x) => x === 0), "Natural has a look amount");
  console.log("ok  applyGrade ends in finishPixel; Natural takes no look");
}

// 10. Skin guard (SKIN_GUARD): a person's skin is never red or orange and pale skin is not cold; gear, water under
//     a wrong mask, black and white are left alone; nothing happens without a person.
{
  const G = SKIN_GUARD, hs = G.hue / D;
  const sg = (x: [number, number, number], cap = 1, rest = 1): [number, number, number] => [x[0], ...skinGuard(x[0], x[1], x[2], cap, rest)];
  const same = (x: [number, number, number], y: number[], eps = 1e-9) => Math.abs(x[1] - y[1]) < eps && Math.abs(x[2] - y[2]) < eps;
  for (const x of [lab(0.6, 0.12, 18), lab(0.7, 0.02, 250), lab(0.5, 0, 0)]) assert.ok(same(x, sg(x, 0, 0)), "changed without a person");
  // Red hands (the owner's clip: the memory colour's old pink, saturated by the looks) and orange skin.
  for (const [h, C] of [[18, 0.12], [10, 0.16], [25, 0.09], [60, 0.15], [80, 0.2]]) for (const L of [0.35, 0.6, 0.85]) {
    const o = sg(lab(L, C, h));
    assert.ok(chromaOf(o) <= G.cap + 1e-9, `chroma ${C} at ${h}° -> ${chromaOf(o).toFixed(3)}`);
    assert.ok(hueOf(o) > 25 && hueOf(o) < 65, `hue ${h}° -> ${hueOf(o).toFixed(1)}° outside natural`);
    assert.ok(Math.abs(hueOf(o) - hs) < Math.abs(h - hs), `hue ${h}° -> ${hueOf(o).toFixed(1)}° not closer to natural`);
  }
  // Natural skin stays close to what it is (the owner's reference skin: about 55°, C 0.07).
  for (const [h, C] of [[45, 0.04], [50, 0.05], [55, 0.07]]) { const x = lab(0.75, C, h), o = sg(x); assert.ok(Math.abs(hueOf(o) - h) < 7 && Math.abs(chromaOf(o) - C) < 0.012, `natural ${h}° ${C} -> ${hueOf(o).toFixed(1)}° ${chromaOf(o).toFixed(3)}`); }
  // Pale cold skin (blue-grey, grey-green) and neutral pale skin get a faint natural warmth: warm, never vivid.
  for (const [h, C] of [[250, 0.02], [200, 0.025], [165, 0.015], [0, 0]]) for (const L of [0.5, 0.7, 0.85]) {
    const o = sg(lab(L, C, h));
    // Along the skin hue (s) and across it (the cast): the cast is cut by restMix and s moves that share of the way to `rest`.
    const x = lab(L, C, h), along = (v: number[]) => v[1] * Math.cos(G.hue) + v[2] * Math.sin(G.hue), across = (v: number[]) => v[2] * Math.cos(G.hue) - v[1] * Math.sin(G.hue);
    assert.ok(Math.abs(along(o) - (along(x) + (G.rest - along(x)) * G.restMix)) < 1e-9 && Math.abs(across(o) - across(x) * (1 - G.restMix)) < 1e-9, `cold ${h}° at L ${L}`);
    assert.ok(chromaOf(o) <= Math.max(C, G.rest) + 1e-9 && along(o) > along(x), `cold ${h}° -> C ${chromaOf(o).toFixed(3)}`);
    if (C === 0) assert.ok(Math.abs(hueOf(o) - hs) < 1e-6 && Math.abs(chromaOf(o) - G.rest * G.restMix) < 1e-9, "neutral pale skin: a faint natural warmth");
  }
  // Left alone: blue gear and water under a wrong mask, the black suit, white fins and foam.
  for (const x of [lab(0.55, 0.09, 250), lab(0.6, 0.12, 240), lab(0.45, 0.07, 215), lab(0.2, 0.03, 255), lab(0.98, 0.01, 200)]) assert.ok(same(x, sg(x), 1e-4), `moved ${x.map((v) => v.toFixed(3))} -> ${sg(x).map((v) => v.toFixed(3))}`);
  // Continuous, also through the neutral axis.
  let worst = 0;
  for (let L = 0.2; L <= 1; L += 0.05) for (let C = 0; C <= 0.2; C += 0.004) for (let h = 0; h < 360; h += 3) {
    const o = sg(lab(L, C, h)), o2 = sg(lab(L, C + 0.0005, h)), o3 = sg(lab(L, C, h + 0.3)), o4 = sg(lab(L + 0.002, C, h));
    worst = Math.max(worst, Math.hypot(o[1] - o2[1], o[2] - o2[2]) / 0.0005, C > 0 ? Math.hypot(o[1] - o3[1], o[2] - o3[2]) / (C * 0.3 * D) : 0, Math.hypot(o[1] - o4[1], o[2] - o4[2]) / 0.002);
  }
  assert.ok(worst < 4, `largest local gain ${worst.toFixed(2)}`);
  const p = sg([0.6, 1e-7, 0]), q = sg([0.6, -1e-7, 0]);
  assert.ok(Math.hypot(p[1] - q[1], p[2] - q[2]) < 1e-5, "step across the neutral axis");
  // Blue-lit skin (the source itself clearly blue: the owner's clip at depth): the warmth is held to a pale neutral,
  // so single pale pixels of a blue hand cannot stand out as orange patches. A shallow, faintly cast source is not "cool".
  assert.ok(skinGuardCool(...(lab(0, 0.07, 255).slice(1) as [number, number])) > 0.99 && skinGuardCool(...(lab(0, 0.03, 140).slice(1) as [number, number])) === 0 && skinGuardCool(...(lab(0, 0.09, 50).slice(1) as [number, number])) === 0, "cool source");
  for (const [h, C] of [[45, 0.075], [18, 0.12], [60, 0.05]]) {
    const x = lab(0.55, C, h), o = skinGuard(x[0], x[1], x[2], 1, 1, 1);
    assert.ok(Math.hypot(o[0], o[1]) <= G.cap * (1 - G.coolCut) + 0.004, `blue-lit: C ${C} -> ${Math.hypot(o[0], o[1]).toFixed(3)}`);
  }
  // The memory colour aims at the same natural hue (it was pink), and the shaders run the guard after every look.
  assert.equal(SKIN.hue, G.hue);
  for (const [name, code] of [["GLSL", GRADE_GLSL], ["WGSL", GRADE_WGSL]] as const) {
    const at = code.indexOf("skinGuard(lk,"), look = code.indexOf("lk = fitLook(lk,"), tone = code.lastIndexOf("TONE_TOE_LO", at);
    assert.ok(at > 0 && look > at && tone > 0, `${name}: skin guard not between the tone target and the fitted Look`);
  }
  console.log(`ok  skin guard: no red, no cold pale skin, gear and water untouched, continuous (gain ${worst.toFixed(2)})`);
}
