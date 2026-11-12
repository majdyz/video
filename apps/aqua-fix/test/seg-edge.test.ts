// AI subject overlay, the weight inside the mask and its edge (owner's ray clip, 12 Nov: "the marking is not full",
// blocky outlines): a far, thin, low-contrast subject is toned in full over most of its width, the water test still
// holds on water, and the mask's edge is read edge-aware (a joint bilateral upsample on the source's luma), the
// same arithmetic in the reference and both shaders.
//   node --experimental-strip-types apps/aqua-fix/test/seg-edge.test.ts
import assert from "node:assert/strict";
import { segSample, segToneWeight } from "../src/engine/apply.ts";
import { linearToOklab } from "../src/engine/color.ts";
import { GRADE_GLSL, GRADE_WGSL, SEG_TONE, segJbuWeights } from "../src/engine/grade-shader.ts";
import { GLSL_FRAGMENT, WGSL_GRADE, WGSL_GRADE_EXT } from "../src/engine/shaders.ts";
import { GLSL_TP_FIELD, WGSL_TP_FIELD } from "../src/engine/temporal.ts";
import { composeSegStrength, packSegR, segRamp, segThin, SEG_THICK, SEG_WATER, unpackSegR } from "../src/engine/seg-overlay.ts";

const R = SEG_TONE.alphaR;

// ---------------------------------------------------------------- the feather by the part's thickness
{
  assert.equal(segRamp(3), SEG_TONE.rampIn, "a thin part: the plain feather (the grade shortens it where the pixel is the animal)");
  assert.equal(segRamp(10), SEG_TONE.rampIn, "a fish: the plain feather, as before");
  assert.equal(segRamp(40), SEG_WATER.rampK * 40, "a big body: a little longer, as before");
  assert.equal(segRamp(200), SEG_WATER.rampLong);
  for (let t = 0.5; t < 80; t += 0.5) assert.ok(segRamp(t) >= segRamp(t - 0.5) - 1e-9, "monotonic in the thickness");
  // How thin a part is rides in R with the water's L and the closeness: packed and unpacked without loss.
  assert.ok(segThin(3) === 1 && segThin(SEG_WATER.thinLo) === 1 && segThin(SEG_WATER.thinHi) === 0 && segThin(30) === 0 && segThin(6.5) > 0.3 && segThin(6.5) < 0.7);
  for (const r of [-1, 0, 0.37, 1, SEG_THICK]) for (const c of [0, 0.25, 0.5, 1]) for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const [r1, c1, t1] = unpackSegR(packSegR(r, c, t));
    assert.ok(Math.abs(r1 - r) < 1e-9 && c1 === c && t1 === t, `R ${r}, closeness ${c}, thinness ${t} survive the packing`);
    // In the texture's 32-bit floats too.
    const [r2, c2, t2] = unpackSegR(Math.fround(packSegR(r, c, t)));
    assert.ok(Math.abs(r2 - r) < 1e-3 && c2 === c && t2 === t);
  }
  assert.deepEqual(unpackSegR(packSegR(0.37, 0.5)), [unpackSegR(packSegR(0.37, 0.5))[0], 0.5, 0], "no thinness given: 0");
}

// ---------------------------------------------------------------- a far, thin subject is toned in full
// A subject `thick` mask px thick and 60 long in open water, its Oklab L `dL` under the water's (grey: no chroma).
function scene(thick: number, dL: number, leak = false) {
  const W = 120, H = 60, y0 = 30 - thick / 2, y1 = 30 + thick / 2, x0 = 30, x1 = 90;
  const alpha = new Float32Array(W * H), near = new Float32Array(W * H).fill(1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = Math.max(x0 - (x + 0.5), x + 0.5 - x1), dy = Math.max(y0 - (y + 0.5), y + 0.5 - y1);
    const d = dx <= 0 && dy <= 0 ? Math.min(-dx, -dy) : -Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
    alpha[y * W + x] = Math.min(1, Math.max(0, 0.5 + d / (2 * R)));
  }
  const wl = 0.05, Lw = linearToOklab(wl, wl, wl)[0], sl = (Lw - dL) ** 3;
  const g = new Float32Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sub = !leak && x >= x0 && x < x1 && y + 0.5 > y0 && y + 0.5 < y1;
    g.fill(sub ? sl : wl, (y * W + x) * 4, (y * W + x) * 4 + 3);
  }
  const overlay = { width: W, height: H, alpha, exclude: null, near, depart: null, quality: 1 };
  const tex = composeSegStrength(overlay, { width: W, height: H, data: g });
  // The tone weight of texel (x, y) for a pixel of Oklab L `L` there (Pop 50, no open-water amount).
  const weight = (x: number, y: number, L: number) => {
    const i = (y * W + x) * 4, [r, close, thin] = unpackSegR(tex.data[i]);
    return segToneWeight([r, tex.data[i + 1], tex.data[i + 2], tex.data[i + 3], close, thin], [L, 0, 0], 1, 0, 0, 1);
  };
  let sum = 0, n = 0, min = 1;
  for (let y = 0; y < H; y++) for (let x = x0 + 4; x < x1 - 4; x++) if (alpha[y * W + x] > 0.5) { const wt = weight(x, y, Lw - dL); sum += wt; n++; min = Math.min(min, wt); }
  return { W, H, tex, weight, mean: sum / n, min, Lw, alpha };
}
{
  // The owner's far ray: 6–8 mask px thick, ΔL ≈ 0.035–0.045 off the water (measured on the clip's frames at 15–19 s).
  const far = scene(6, 0.038);
  assert.ok(far.mean > 0.65, `a far ray 6 px thick: mean tone weight ${far.mean.toFixed(2)} over the mask`);
  assert.ok(far.weight(60, 29, far.Lw - 0.038) > 0.99 && far.weight(60, 30, far.Lw - 0.038) > 0.99, "full along its middle");
  // Its edge is still a feather: nothing on the contour's outside, a ramp inside, no step.
  assert.equal(far.weight(60, 26, far.Lw - 0.038), 0, "nothing outside the contour");
  assert.ok(far.weight(60, 27, far.Lw - 0.038) < 0.6, "the texel on the contour is part of the ramp");
  // The water test holds: a pixel of plain water under the mask's edge band gets (next to) nothing...
  assert.ok(far.weight(60, 27, far.Lw) === 0 && far.weight(60, 28, far.Lw) === 0 && far.weight(60, 28, far.Lw - 0.004) < 0.05, "water inside a fat contour is not toned");
  // The same pixels as part of the animal: toned from a px inside.
  assert.ok(far.weight(60, 28, far.Lw - 0.038) > 0.99 && far.weight(60, 27, far.Lw - 0.038) > 0.3, "the animal's own pixels are, from a px inside");
  // ...and a mask on plain water (a leak: nothing there departs from the water) is not trusted as a whole.
  const leak = scene(6, 0.038, true);
  assert.ok(leak.mean < 0.05, `a mask on plain water: ${leak.mean.toFixed(3)}`);
  // A close, thick subject is as before: full inside, the plain feather.
  const close = scene(40, 0.2);
  assert.ok(close.mean > 0.8 && close.weight(60, 30, close.Lw - 0.2) === 1);
  assert.ok(close.weight(60, 10, close.Lw - 0.2) < 0.2 && close.weight(60, 11, close.Lw - 0.2) < 0.6, "a big body's edge still fades in");
  console.log(`seg-edge: tone weight over a far ray 6 px thick ${far.mean.toFixed(2)} (close body ${close.mean.toFixed(2)}, a mask on plain water ${leak.mean.toFixed(3)}): ok`);
}

// ---------------------------------------------------------------- the edge-aware read of the mask
{
  // Weights: flat luma → the bilinear weights; an edge → the texels on the pixel's side.
  const wb = [0.25, 0.25, 0.25, 0.25];
  const flat = segJbuWeights(wb, [0.4, 0.4, 0.4, 0.4], 0.4);
  assert.deepEqual(flat, wb);
  const noisy = segJbuWeights(wb, [0.401, 0.399, 0.402, 0.4], 0.4);
  for (const v of noisy) assert.ok(Math.abs(v - 0.25) < 0.005, "sensor noise leaves the bilinear read");
  const edge = segJbuWeights(wb, [0.3, 0.4, 0.3, 0.4], 0.305);
  assert.ok(edge[0] > 20 * edge[1] && edge[2] > 20 * edge[3], "across an edge the far side's texels hardly count");
  // A low-contrast edge (a far ray: 0.035 in luma) still decides.
  const faint = segJbuWeights(wb, [0.365, 0.4, 0.365, 0.4], 0.367);
  assert.ok(faint[0] > 5 * faint[1], `a faint edge decides too (${(faint[0] / faint[1]).toFixed(1)}×)`);

  // The mask grid is 8× coarser than the picture; the animal's true edge runs at x = 67 px (texel 8.375), the mask
  // has it at the texel boundary x = 64 (texel 8): the mask is 3 px short of the animal.
  const S = 8, W = 20, H = 6, tex = { width: W, height: H, data: new Float32Array(W * H * 4) };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, d = 8 - (x + 0.5); // > 0 inside (left)
    tex.data[i] = -1; tex.data[i + 1] = 1; tex.data[i + 2] = Math.min(1, Math.max(0, 0.5 + d / (2 * R))); tex.data[i + 3] = 1;
  }
  const lumAt = (edgePx: number, contrast: number) => (u: number, _v: number) => (u * W * S < edgePx ? 0.4 - contrast : 0.4);
  const contour = (guide?: (u: number, v: number) => number): number => {
    let prev = 1;
    for (let px = 40; px < 100; px++) {
      const a = segSample(tex, (px + 0.5) / (W * S), 0.5, guide)[2];
      if (prev > 0.5 && a <= 0.5) return px - 1 + (prev - 0.5) / (prev - a) + 0.5;
      prev = a;
    }
    return NaN;
  };
  const plain = contour(), guided = contour(lumAt(67, 0.1)), faintEdge = contour(lumAt(67, 0.035)), flatW = contour(() => 0.4);
  assert.ok(Math.abs(plain - 64) < 0.01, `bilinear: the contour on the mask's own edge (${plain.toFixed(2)} px)`);
  assert.ok(Math.abs(guided - 67) < 0.75, `edge-aware: on the picture's edge (${guided.toFixed(2)} px, the animal's at 67)`);
  assert.ok(Math.abs(faintEdge - 67) < 1, `a far subject's faint edge too (${faintEdge.toFixed(2)} px)`);
  assert.ok(Math.abs(flatW - plain) < 1e-9, "no edge in the picture: the bilinear read");
  // The other way: the mask 3 px fat (the animal's edge at 61): the contour comes in to it.
  const fat = contour(lumAt(61, 0.1));
  assert.ok(Math.abs(fat - 61) < 0.75, `a fat mask is brought in to the picture's edge (${fat.toFixed(2)} px)`);
  // Never past the neighbouring texels' own values (a convex mix), and nothing changes away from the contour.
  for (let px = 0; px < W * S; px++) {
    const u = (px + 0.5) / (W * S), a = segSample(tex, u, 0.5, lumAt(67, 0.1))[2], b = segSample(tex, u, 0.5)[2];
    const fx = Math.min(Math.max(u * W - 0.5, 0), W - 1), x0 = Math.floor(fx), x1 = Math.min(W - 1, x0 + 1);
    const lo = Math.min(tex.data[x0 * 4 + 2], tex.data[x1 * 4 + 2]), hi = Math.max(tex.data[x0 * 4 + 2], tex.data[x1 * 4 + 2]);
    assert.ok(a >= lo - 1e-9 && a <= hi + 1e-9);
    if (lo > SEG_TONE.jbuHi || hi < SEG_TONE.jbuLo) assert.equal(a, b, "away from the contour: untouched");
    for (const c of [0, 1, 3, 4]) assert.equal(segSample(tex, u, 0.5, lumAt(67, 0.1))[c], segSample(tex, u, 0.5)[c], "only the alpha is read edge-aware");
  }
  console.log(`seg-edge: mask 3 px short of the animal's edge → contour at ${guided.toFixed(1)} px (edge 67, bilinear ${plain.toFixed(1)}); faint edge ${faintEdge.toFixed(1)}; fat mask → ${fat.toFixed(1)} (edge 61): ok`);
}

// ---------------------------------------------------------------- reference and shaders say the same
{
  for (const [name, code] of [["GLSL", GRADE_GLSL], ["WGSL", GRADE_WGSL]] as const) {
    assert.ok(code.includes("segGuideLum(uv)") && code.includes("exp(-e * e)") && code.includes("max(SEG_JBU_NOISE, SEG_JBU_K * (ghi - glo))"), `${name}: the edge-aware read`);
    assert.ok(code.includes("blo < SEG_JBU_HI && bhi > SEG_JBU_LO"), `${name}: only where the contour passes`);
    assert.ok(code.includes("mix(SEG_EV_FAR, 1.0, clamp(g_segClose, 0.0, 1.0))") && code.includes("SEG_EV_LO * k, SEG_EV_HI * k"), `${name}: the water test's bar follows the subject's contrast`);
    assert.ok(code.includes("mix(SEG_RAMP_IN, SEG_RAMP_EV, ev * clamp(g_segThin, 0.0, 1.0))") && code.includes("an.x >= 0.0 && an.x <= 2.0") && code.includes("smoothstepf(0.0, rin, d)"), `${name}: the short feather where the pixel is the animal, on thin parts`);
    assert.ok(code.includes("floor((n + 0.5) / (SEG_LEVELS + 1.0))") && code.includes("th / SEG_THIN_LEVELS") && code.includes("g_segThin = mix(mix(u00.z, u10.z, t.x), mix(u01.z, u11.z, t.x), t.y);"), `${name}: the thinness unpacked per texel`);
    for (const [k, v] of [["SEG_EV_FAR", SEG_TONE.evFar], ["SEG_RAMP_EV", SEG_TONE.rampEv], ["SEG_THIN_LEVELS", SEG_TONE.thinLevels], ["SEG_JBU_K", SEG_TONE.jbuK], ["SEG_JBU_NOISE", SEG_TONE.jbuNoise], ["SEG_JBU_LO", SEG_TONE.jbuLo], ["SEG_JBU_HI", SEG_TONE.jbuHi]] as const) {
      assert.ok(new RegExp(`${k}(: f32)? = ${v.toFixed(4)};`).test(code), `${name}: ${k}`);
    }
  }
  // The grade pass reads the source as the guide (upright uv → the source's own orientation); the 1/8 temporal field
  // has none. The external-texture variant samples it the way it samples the source.
  assert.ok(GLSL_FRAGMENT.includes("float segGuideLum(vec2 uv) { return dot(textureLod(u_source, rotateUV(uv, int(p[0].x + 0.5)), 0.0).rgb"));
  assert.ok(WGSL_GRADE.includes("fn segGuideLum(uv: vec2<f32>) -> f32 { return dot(textureSampleLevel(u_source, samp, rotateUV(uv, u32(params.p[0].x + 0.5)), 0.0).rgb"));
  assert.ok(WGSL_GRADE_EXT.includes("fn segGuideLum(uv: vec2<f32>) -> f32 { return dot(textureSampleBaseClampToEdge(u_source, samp, rotateUV(uv, u32(params.p[0].x + 0.5))).rgb"));
  assert.ok(!WGSL_GRADE_EXT.includes("textureSampleLevel(u_source"));
  assert.ok(GLSL_TP_FIELD.includes("float segGuideLum(vec2 uv) { return -1.0; }") && WGSL_TP_FIELD.includes("fn segGuideLum(uv: vec2<f32>) -> f32 { return -1.0; }"));
  assert.ok(SEG_TONE.jbuHi >= 0.5 + SEG_TONE.rampIn / (2 * R), "the edge-aware band covers the tone's ramp");
}

console.log("seg-edge: ok");
