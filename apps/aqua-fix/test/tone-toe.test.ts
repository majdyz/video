// Tone target with a shadow toe (params.ts toneCurve / TONE_TOE; analyze.ts TONE): the mid-tones take the whole
// gamma, white stays white, and the shadows are left alone instead of being darkened the most.
//   node --experimental-strip-types apps/aqua-fix/test/tone-toe.test.ts
import assert from "node:assert/strict";
import { analyzeThumbnail, ANALYSIS_W, ANALYSIS_H, TONE } from "../src/engine/analyze.ts";
import { GRADE_GLSL, GRADE_WGSL } from "../src/engine/grade-shader.ts";
import { TONE_TOE, toneCurve } from "../src/engine/params.ts";

// 1. Shape: identity at g = 1, 0 → 0, 1 → 1, strictly monotone with a slope that never collapses, darkening only.
const gMax = 1 + (TONE.max - 1) * TONE.strength;
assert.ok(gMax <= 1.7, `the largest gamma the analysis can ask for (${gMax.toFixed(2)}) is inside the monotone range`);
for (const g of [1, 1.1, 1.25, gMax, 1.7]) {
  assert.ok(Math.abs(toneCurve(1, g) - 1) < 1e-12 && toneCurve(0, g) === 0);
  let prev = 0, minSlope = Infinity;
  for (let L = 0.002; L <= 1.0001; L += 0.002) {
    const y = toneCurve(L, g);
    assert.ok(y <= L + 1e-12, `darkening only (g ${g}, L ${L.toFixed(3)})`);
    minSlope = Math.min(minSlope, (y - prev) / 0.002);
    if (g === 1) assert.equal(y, L);
    prev = y;
  }
  assert.ok(minSlope > (g <= gMax ? 0.3 : 0.1), `monotone, no flat step (g ${g.toFixed(2)}: least slope ${minSlope.toFixed(2)})`);
}
// Under the toe nothing moves; from its top up it is the plain gamma.
for (const g of [1.25, gMax]) {
  assert.equal(toneCurve(TONE_TOE.lo * 0.9, g), TONE_TOE.lo * 0.9);
  for (const L of [TONE_TOE.hi, 0.6, 0.8, 0.95]) assert.ok(Math.abs(toneCurve(L, g) - Math.pow(L, g)) < 1e-12);
}
// A subject in shade: Oklab L 0.25 (L* ≈ 13) stays above L 0.2 (L* ≈ 8); the plain gamma took it to 0.18.
assert.ok(toneCurve(0.25, 1.25) > 0.21 && Math.pow(0.25, 1.25) < 0.18, `shade ${toneCurve(0.25, 1.25).toFixed(3)}`);
console.log(`ok  toed tone curve: monotone up to g 1.7, white kept, shadows left alone (L 0.25 → ${toneCurve(0.25, 1.25).toFixed(3)} at g 1.25)`);

// 2. The analysis asks for a gamma inside the cap on a bright frame.
{
  const px = new Uint8ClampedArray(ANALYSIS_W * ANALYSIS_H * 4);
  for (let y = 0; y < ANALYSIS_H; y++) for (let x = 0; x < ANALYSIS_W; x++) {
    const i = (y * ANALYSIS_W + x) * 4, t = x / ANALYSIS_W, n = ((x * 7 + y * 13) % 17) / 17;
    px[i] = 70 + 60 * t + 10 * n; px[i + 1] = 140 + 50 * t + 10 * n; px[i + 2] = 160 + 50 * t + 10 * n; px[i + 3] = 255;
  }
  const g = analyzeThumbnail(px, ANALYSIS_W, ANALYSIS_H).params.toneGamma ?? 1;
  assert.ok(g > 1 && g <= gMax + 1e-9, `gamma ${g}`);
  console.log(`ok  analysis gamma ${g.toFixed(3)} on a bright frame (cap ${gMax.toFixed(3)})`);
}

// 3. Both shaders carry the same curve and constants.
for (const [name, src] of [["GLSL", GRADE_GLSL], ["WGSL", GRADE_WGSL]] as const) {
  assert.ok(src.includes(TONE_TOE.lo.toFixed(6)) && src.includes(TONE_TOE.hi.toFixed(6)), `${name} carries the toe`);
  assert.ok(/pow\(tl, 1\.0 \+ \((params\.)?p\[24\]\.w - 1\.0\) \* smoothstepf\(TONE_TOE_LO, TONE_TOE_HI, tl\)\)/.test(src), `${name} applies the toed curve`);
}
console.log("ok  GLSL and WGSL mirror the curve");
