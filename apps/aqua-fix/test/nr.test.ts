// Temporal noise reduction (NR in params.ts): the CPU reference (apply.ts) on synthetic clips, and the shader
// passes kept in step with it (same constants, same bindings, GLSL and WGSL twins).
//   node --experimental-strip-types apps/aqua-fix/test/nr.test.ts
import assert from "node:assert/strict";
import { TemporalNR, nrBlend, nrKeep, nrLevel, nrLevelAt, nrRefine, nrStrength, rgbOf, tpFlow, tpLowSize, tpLum } from "../src/engine/apply.ts";
import { CLAHE_BINS, DEFAULT_SETTINGS, IDENTITY_PARAMS, NR, TEMPORAL, noiseLevelOf, packUniforms } from "../src/engine/params.ts";
import { UNIFORM_FLOATS } from "../src/engine/backend.ts";
import { GLSL_FRAGMENT, WGSL_GRADE, WGSL_GRADE_EXT } from "../src/engine/shaders.ts";
import { GLSL_NR, GLSL_NR_LEVEL, GLSL_NR_REFINE, NR_CONSTS_GLSL, NR_CONSTS_WGSL, WGSL_NR, WGSL_NR_LEVEL, WGSL_NR_REFINE, tpExternal } from "../src/engine/temporal.ts";

const W = 192, H = 128, [LW, LH] = tpLowSize(W, H);
let seed = 7;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
type Scene = (x: number, y: number) => [number, number, number];
/** An RGBA8 frame of `scene` (8-bit values) with white noise of `sigma` steps per channel. */
function frame(scene: Scene, sigma = 0): Uint8ClampedArray {
  const out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = scene(x, y), i = (y * W + x) * 4;
    for (let k = 0; k < 3; k++) out[i + k] = c[k] + (sigma ? gauss() * sigma : 0) + 0.5;
    out[i + 3] = 255;
  }
  return out;
}
const water: Scene = (x, y) => [30 + x * 0.05, 70 + y * 0.1, 110];
/** Smooth, non-repeating texture: value noise of 14 px cells, ±50 steps (a reef at a distance). */
const cell = (i: number, j: number) => { let h = (i * 374761393 + j * 668265263) >>> 0; h = ((h ^ (h >>> 13)) * 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const reef = (dx: number, dy: number): Scene => (x, y) => {
  const fx = (x + dx + 1000) / 14, fy = (y + dy + 1000) / 14, i = Math.floor(fx), j = Math.floor(fy);
  const sx = fx - i, sy = fy - j, tx = sx * sx * (3 - 2 * sx), ty = sy * sy * (3 - 2 * sy);
  const v = 110 + 100 * ((cell(i, j) * (1 - tx) + cell(i + 1, j) * tx) * (1 - ty) + (cell(i, j + 1) * (1 - tx) + cell(i + 1, j + 1) * tx) * ty - 0.5)
    + 12 * Math.sin((x + dx) * 0.9 + (y + dy) * 0.35) + 12 * Math.sin((y + dy) * 0.8 - (x + dx) * 0.3);
  return [v, v * 0.9, v * 0.7];
};
const rms = (a: Float32Array, b: Float32Array, pick: (x: number, y: number) => boolean = () => true) => {
  let s = 0, n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (pick(x, y)) for (let k = 0; k < 3; k++) { s += (a[(y * W + x) * 3 + k] - b[(y * W + x) * 3 + k]) ** 2; n++; }
  return Math.sqrt(s / n) * 255;
};

// --- settings and uniforms
assert.equal(DEFAULT_SETTINGS.noiseReduction, "auto");
assert.deepEqual([noiseLevelOf({}), noiseLevelOf({ noiseReduction: "off" }), noiseLevelOf({ noiseReduction: "auto" }), noiseLevelOf({ noiseReduction: "strong" })], [1, 0, 1, 2]);
assert.equal(UNIFORM_FLOATS, 108);
assert.equal(TEMPORAL.scale, 8);

// --- lum and block flow: a picture shifted by one low-resolution texel is found
{
  const a = rgbOf(frame(reef(0, 0)), W, H), b = rgbOf(frame(reef(8, 0)), W, H); // b(x) = a(x + 8)
  assert.ok(Math.abs(tpLum(rgbOf(frame(() => [100, 100, 100]), W, H), W, H)[5] - 100 / 255) < 1e-6, "lum of a flat frame");
  const flow = tpFlow(tpLum(b, W, H), tpLum(a, W, H), LW, LH); // current b against previous a
  const o = ((LH >> 1) * LW + (LW >> 1)) * 3;
  assert.deepEqual([flow[o], flow[o + 1]], [1, 0], "block flow of an 8 px shift");
  assert.ok(flow[o + 2] > 0.9, "confident match");
}

// --- refine: the block flow taken to the pixel
{
  const prev = rgbOf(frame(reef(0, 0)), W, H), cur = rgbOf(frame(reef(11, -2)), W, H); // cur(x) = prev(x + (11, -2))
  // The block flow's answer for this shift (one texel right), as a perfect field.
  const block = new Float32Array(LW * LH * 3);
  for (let i = 0; i < LW * LH; i++) { block[i * 3] = 1; block[i * 3 + 2] = 1; }
  const fine = nrRefine(cur, prev, block, null, W, H);
  let ok = 0, near = 0, n = 0;
  for (let ly = 3; ly < LH - 3; ly++) for (let lx = 3; lx < LW - 3; lx++) {
    const ex = Math.abs(fine[(ly * LW + lx) * 3] - 11), ey = Math.abs(fine[(ly * LW + lx) * 3 + 1] + 2);
    n++;
    if (ex + ey === 0) ok++;
    if (ex <= 1 && ey <= 1) near++;
  }
  // Blocks on a flat spot of the texture stay nearer the block flow (the bias): within a pixel is what matters.
  assert.ok(ok / n > 0.8 && near / n > 0.88, `refined flow hits (11, -2) on ${ok}/${n} interior blocks, within a pixel on ${near}`);
  const coarse = nrRefine(cur, null, block, null, W, H);
  assert.deepEqual([coarse[((LH >> 1) * LW + (LW >> 1)) * 3], coarse[((LH >> 1) * LW + (LW >> 1)) * 3 + 1]], [8, 0], "without a history the block flow passes through in pixels");
  assert.deepEqual([...nrRefine(cur, cur, new Float32Array(LW * LH * 3), null, W, H)].filter((v) => v !== 0).length, 0, "a still picture stays put");
  // The block's own confidence: within the noise level it keeps the block flow's, a block that cannot be matched loses it.
  const lv = new Float32Array(NR.bins * 2).fill(3 / 255), one = new Float32Array(LW * LH * 3).fill(0);
  for (let i = 2; i < one.length; i += 3) one[i] = 1;
  const still = nrRefine(rgbOf(frame(water, 1.2), W, H), rgbOf(frame(water), W, H), one, lv, W, H);
  const moved = nrRefine(rgbOf(frame(reef(40, 30)), W, H), prev, one, lv, W, H);
  const mid = ((LH >> 1) * LW + (LW >> 1)) * 3 + 2;
  assert.equal(still[mid], 1, "a block within the noise keeps its confidence");
  assert.equal(moved[mid], 0, "a block the flow cannot follow has none");
}

// --- level: flat noisy water reads its noise; clean or all-textured frames read none
{
  const clean = rgbOf(frame(water), W, H), zero = new Float32Array(LW * LH * 3).fill(0);
  for (let i = 2; i < zero.length; i += 3) zero[i] = 1;
  const noisy = rgbOf(frame(water, 3), W, H);
  const lv = nrLevel(noisy, clean, zero, tpLum(noisy, W, H), W, H);
  const [e0, el] = nrLevelAt(lv, 0.27);
  // The largest of three channels' |N(0, 3)|: mean ≈ 1.33 × 3 steps; the 3×3 tent average of white noise ≈ 0.375 of that.
  assert.ok(e0 * 255 > 3.2 && e0 * 255 < 4.6, `e0 ${e0 * 255}`);
  assert.ok(el / e0 > 0.28 && el / e0 < 0.5, `el/e0 ${el / e0}`);
  assert.equal(nrLevel(clean, clean, zero, tpLum(clean, W, H), W, H)[0], 0, "identical frames carry no information (dead tiles)");
  const tex = rgbOf(frame(reef(0, 0), 3), W, H);
  assert.equal(nrLevel(tex, rgbOf(frame(reef(0, 0)), W, H), zero, tpLum(tex, W, H), W, H)[0], 0, "no flat tile, no level");
  // The gate: auto ignores what 8-bit rounding alone produces, strong opens earlier, off is off.
  assert.equal(nrStrength(1, 0.8 / 255), 0);
  assert.ok(nrStrength(2, 1.2 / 255) > nrStrength(1, 1.2 / 255));
  assert.equal(nrStrength(1, 4 / 255), NR.auto.w);
  assert.equal(nrStrength(2, 4 / 255), NR.strong.w);
  assert.equal(nrStrength(0, 4 / 255), 0);
  // The motion tests: within the noise keeps the history, a real change drops it.
  assert.equal(nrKeep(0.01, 0.004, 0.01, 0.004), 1);
  assert.equal(nrKeep(0.04, 0.004, 0.01, 0.004), 0);
  assert.equal(nrKeep(0.01, 0.013, 0.01, 0.004), 0);
}

// --- static noisy water: the noise falls toward (1 − w) / (1 + w) of its variance; off and clean clips are untouched
{
  const truth = rgbOf(frame(water), W, H);
  for (const [level, w] of [[1, NR.auto.w], [2, NR.strong.w]] as const) {
    const nr = new TemporalNR();
    let out: Float32Array = new Float32Array(0), src: Float32Array = new Float32Array(0);
    for (let f = 0; f < 24; f++) { const fr = frame(water, 3); src = rgbOf(fr, W, H); out = nr.step(fr, W, H, level); }
    const before = rms(src, truth), after = rms(out, truth), ideal = before * Math.sqrt((1 - w) / (1 + w));
    assert.ok(after < before * 0.62 && after < ideal * 1.45, `level ${level}: noise ${before.toFixed(2)} → ${after.toFixed(2)} (ideal ${ideal.toFixed(2)})`);
    assert.ok(nr.weight > 0.75 * w, `level ${level}: mean weight ${nr.weight}`);
  }
  const off = new TemporalNR();
  off.step(frame(water, 3), W, H, 0);
  const fr = frame(water, 3);
  assert.deepEqual(off.step(fr, W, H, 0), rgbOf(fr, W, H), "off returns the source");
  // A clean clip (8-bit rounding of a slow drift only): Auto leaves every pixel as it was.
  const clean = new TemporalNR();
  let same = true;
  for (let f = 0; f < 6; f++) {
    const fr2 = frame((x, y) => [30 + x * 0.05 + f * 0.2, 70 + y * 0.1, 110]);
    const o = clean.step(fr2, W, H, 1), s = rgbOf(fr2, W, H);
    for (let i = 0; i < o.length; i++) if (Math.abs(o[i] - s[i]) > 0.5 / 1023) same = false;
  }
  assert.ok(same, "clean footage is unchanged by Auto");
  // History precision: 10 bits by default.
  const q = nrBlend(rgbOf(fr, W, H), null, new Float32Array(LW * LH * 3), new Float32Array(NR.bins * 2), 1, W, H);
  assert.ok(Math.abs(q[0] * 1023 - Math.round(q[0] * 1023)) < 1e-3);
}

// --- marine snow: a speck is kept whole and leaves no trail; a moving fish does not ghost
{
  const nr = new TemporalNR();
  for (let f = 0; f < 10; f++) nr.step(frame(water, 3), W, H, 1);
  const sx = 97, sy = 61;
  const speck: Scene = (x, y) => (Math.abs(x - sx) <= 1 && Math.abs(y - sy) <= 1 ? [200, 210, 220] : water(x, y));
  const withSpeck = frame(speck, 3);
  const o1 = nr.step(withSpeck, W, H, 1), i = (sy * W + sx) * 3;
  assert.ok(Math.abs(o1[i + 1] - withSpeck[(sy * W + sx) * 4 + 1] / 255) < 1 / 255, "the speck is not dimmed");
  const o2 = nr.step(frame(water, 3), W, H, 1);
  assert.ok(Math.abs(o2[i + 1] * 255 - water(sx, sy)[1]) < 12, `no trail where the speck was (${(o2[i + 1] * 255).toFixed(1)} vs ${water(sx, sy)[1].toFixed(1)})`);

  // A dark fish 24 × 12 px moving 5 px a frame over noisy water.
  const fish = (f: number): Scene => (x, y) => (x >= 40 + f * 5 && x < 64 + f * 5 && y >= 50 && y < 62 ? [25, 30, 35] : water(x, y));
  const nr2 = new TemporalNR();
  let leak = 0, n = 0, bg = 0, bn = 0;
  for (let f = 0; f < 14; f++) {
    const out = nr2.step(frame(fish(f), 3), W, H, 2), truth = rgbOf(frame(fish(f)), W, H);
    if (f < 8) continue;
    // Where the fish was one frame ago and is not now (the trail), and far from it.
    leak += rms(out, truth, (x, y) => y >= 50 && y < 62 && x >= 40 + (f - 1) * 5 && x < 40 + f * 5) ** 2; n++;
    bg += rms(out, truth, (_x, y) => y < 30) ** 2; bn++;
  }
  // The uncovered water has no usable history, so it keeps the source's noise (3 steps) and no more.
  assert.ok(Math.sqrt(leak / n) < 3.6, `trail error ${Math.sqrt(leak / n).toFixed(2)} steps (source noise 3)`);
  assert.ok(Math.sqrt(bg / bn) < 1.6, `background noise ${Math.sqrt(bg / bn).toFixed(2)} steps`);
}

// --- a panning textured scene with noise: no worse than the source anywhere (misaligned history is dropped)
{
  const nr = new TemporalNR();
  let before = 0, after = 0;
  for (let f = 0; f < 12; f++) {
    const sc: Scene = (x, y) => (y < 64 ? water(x, y) : reef(f * 3, f)(x, y));
    const fr = frame(sc, 3), out = nr.step(fr, W, H, 1), truth = rgbOf(frame(sc), W, H);
    if (f < 6) continue;
    before += rms(rgbOf(fr, W, H), truth, (_x, y) => y >= 72) ** 2;
    after += rms(out, truth, (_x, y) => y >= 72) ** 2;
  }
  assert.ok(after < before * 1.02, `panning texture: error ${Math.sqrt(before / 6).toFixed(2)} → ${Math.sqrt(after / 6).toFixed(2)} steps`);
}

// --- a cut or a seek: reset drops the history
{
  const nr = new TemporalNR();
  for (let f = 0; f < 4; f++) nr.step(frame(water, 3), W, H, 1);
  nr.reset();
  const fr = frame(reef(0, 0), 3);
  assert.deepEqual(nr.step(fr, W, H, 1), nrBlend(rgbOf(fr, W, H), null, new Float32Array(LW * LH * 3), new Float32Array(NR.bins * 2), 1, W, H), "first frame after a reset is the source");
}

// --- uniforms: p26.x carries the level; y (history valid) and z (hold) are the backend's and the engine's
{
  const depth = { width: 1, height: 1, fields: new Float32Array(4), guide: new Float32Array(3) };
  const clahe = { tilesX: 1, tilesY: 1, bins: CLAHE_BINS, data: new Float32Array(CLAHE_BINS) };
  const u = (s: object) => packUniforms(IDENTITY_PARAMS, { ...DEFAULT_SETTINGS, ...s }, depth, clahe, 0, 0);
  assert.deepEqual([u({})[104], u({ noiseReduction: "off" })[104], u({ noiseReduction: "strong" })[104]], [1, 0, 2]);
  assert.deepEqual([u({})[105], u({})[106], u({})[107]], [0, 0, 0]);
}

// --- shaders: constants, twins and bindings
const bare = (code: string) => code.replace(/\/\/.*$/gm, "");
const ident = (code: string) => [...bare(code).matchAll(/NR_[A-Z0-9_]+/g)].map((m) => m[0]).sort();
const numbers = (code: string) => [...bare(code).replace(/^const .*$/gm, "").matchAll(/(?<![\w.])\d+\.\d+(?:e-?\d+)?/g)].map((m) => Number(m[0])).sort((a, b) => a - b);
for (const [name, glsl, wgsl] of [["refine", GLSL_NR_REFINE, WGSL_NR_REFINE], ["level", GLSL_NR_LEVEL, WGSL_NR_LEVEL], ["nr", GLSL_NR, WGSL_NR]] as const) {
  // Past the shared prologue, both languages use the same constants and the same literals.
  const g = glsl.slice(glsl.indexOf("vec2 nrUp")), w = wgsl.slice(wgsl.indexOf("fn nrSrc"));
  assert.deepEqual(ident(g), ident(w), `${name}: GLSL and WGSL use the same NR constants`);
  // nrUp's flip (1.0 − t.y) is GLSL's alone (WebGPU targets are top-down).
  const gn = numbers(g.replace("return vec2(t.x, 1.0 - t.y);", "")), wn = numbers(w);
  assert.deepEqual(gn, wn, `${name}: GLSL and WGSL use the same literals`);
  assert.ok(!/\btexture\(/.test(glsl), `${name}: GLSL samples with explicit lod (loops)`);
  assert.ok(/p\[26\]\.y/.test(glsl) && /p\[26\]\.y/.test(wgsl), `${name}: reads the history-valid flag`);
  assert.ok(/textureSampleBaseClampToEdge\(u_source/.test(tpExternal(wgsl)) && !/textureSampleLevel\(u_source/.test(tpExternal(wgsl)), `${name}: external-texture variant`);
}
for (const [k, v] of Object.entries({ NR_RT: NR.refineTaps, NR_RSTEP: NR.refineStep, NR_TX: NR.tilesX, NR_TY: NR.tilesY, NR_T: NR.tileTaps, NR_BINS: NR.bins })) {
  assert.ok(NR_CONSTS_GLSL.includes(`const int ${k} = ${v};`), `GLSL ${k}`);
  assert.ok(NR_CONSTS_WGSL.includes(`const ${k}: i32 = ${v};`), `WGSL ${k}`);
}
for (const [k, v] of Object.entries({ NR_RBIAS: NR.refineBias, NR_TEX_LO: NR.texLo, NR_TEX_HI: NR.texHi, NR_TILES_MIN: NR.tilesMin, NR_EPS: NR.eps, NR_LUM_LO: NR.lumLo, NR_LUM_HI: NR.lumHi, NR_DEAD: NR.dead, NR_BIN_MIN: NR.binMin, NR_BIN_MAX: NR.binMax, NR_EMAX: NR.eMax, NR_C0_LO: NR.c0Lo, NR_C0_HI: NR.c0Hi, NR_L_LO: NR.lLo, NR_L_HI: NR.lHi, NR_A_W: NR.auto.w, NR_A_LO: NR.auto.gateLo, NR_A_HI: NR.auto.gateHi, NR_S_W: NR.strong.w, NR_S_LO: NR.strong.gateLo, NR_S_HI: NR.strong.gateHi })) {
  assert.ok(NR_CONSTS_GLSL.includes(`const float ${k} = ${v.toFixed(6)};`), `GLSL ${k}`);
  assert.ok(NR_CONSTS_WGSL.includes(`const ${k}: f32 = ${v.toFixed(6)};`), `WGSL ${k}`);
}
// The grade reads the denoised source (and its detail guard) when p26.x is set, in every variant; the uniform
// block is the same size everywhere.
for (const [name, code] of Object.entries({ GLSL_FRAGMENT, WGSL_GRADE, WGSL_GRADE_EXT })) {
  assert.ok(/p\[26\]\.x > 0\.5/.test(code) && /u_tpNr/.test(code) && /detailBaseNr\(nuv, src\)/.test(code) && /dgTapNr/.test(code), `${name}: reads the denoised source`);
  assert.ok(!/u_tpPrev|u_tpFlow/.test(code), `${name}: the old post-grade denoise is gone`);
}
for (const code of [GLSL_FRAGMENT, GLSL_NR, GLSL_NR_LEVEL, GLSL_NR_REFINE]) assert.ok(code.includes(`vec4 p[${UNIFORM_FLOATS / 4}]`));
for (const code of [WGSL_GRADE, WGSL_NR, WGSL_NR_LEVEL, WGSL_NR_REFINE]) assert.ok(code.includes(`array<vec4<f32>, ${UNIFORM_FLOATS / 4}>`));
console.log("ok  temporal noise reduction (CPU reference, shader twins)");
