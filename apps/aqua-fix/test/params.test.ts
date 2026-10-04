// Pure-function checks for the parameter model.
//   node --experimental-strip-types apps/aqua-fix/test/params.test.ts
import assert from "node:assert/strict";
import { IDENTITY_PARAMS, medianParams, presetParams, resolveSettings, DEFAULT_SETTINGS, lookParams, boostParams, pushOf } from "../src/engine/params.ts";
import { fitToGamut, compressToGamut, GAMUT_SCALE_MIN } from "../src/engine/color.ts";

// 1. medianParams: a one-off outlier frame (orange fish fills the frame →
//    balance wants no red) must not move the clip-wide estimate.
{
  const base = { ...IDENTITY_PARAMS, wb: [2.0, 1, 0.9] as [number, number, number], exposure: 1.1 };
  const outlier = { ...IDENTITY_PARAMS, wb: [1.0, 1, 1.3] as [number, number, number], exposure: 0.8 };
  const med = medianParams([base, base, outlier, base, base]);
  assert.deepEqual(med.wb, base.wb);
  assert.equal(med.exposure, base.exposure);
  // Even median count averages the two middle values.
  const med2 = medianParams([base, outlier]);
  assert.ok(Math.abs(med2.wb[0] - 1.5) < 1e-9);
  console.log("ok  medianParams ignores a passing subject");
}

// 2. Presets: auto is the identity; reef caps the red gain; murky pushes blue.
{
  const p = { ...IDENTITY_PARAMS, wb: [3.0, 1, 1.0] as [number, number, number] };
  assert.deepEqual(presetParams(p, { ...DEFAULT_SETTINGS, preset: "auto" }).wb, p.wb);
  assert.ok(presetParams(p, { ...DEFAULT_SETTINGS, preset: "reef" }).wb[0] <= 1.6 + 1e-9);
  assert.ok(presetParams(p, { ...DEFAULT_SETTINGS, preset: "murky" }).wb[2] > 1.0);
  assert.ok(presetParams(p, { ...DEFAULT_SETTINGS, preset: "deep" }).wb[0] > p.wb[0]);
  console.log("ok  presets");
}

// 3. Intensity: 50 % is the estimate (no push), 100 % pushes the balance.
{
  assert.equal(pushOf(DEFAULT_SETTINGS), 0);
  const p = { ...IDENTITY_PARAMS, wb: [2.0, 1, 0.8] as [number, number, number] };
  assert.deepEqual(boostParams(p, 0).wb, p.wb);
  assert.ok(boostParams(p, 1).wb[0] > 2.0);
  assert.equal(resolveSettings(DEFAULT_SETTINGS).strength, 1);
  assert.equal(resolveSettings({ ...DEFAULT_SETTINGS, intensity: 0 }).strength, 0);
  console.log("ok  intensity");
}

// 4. Look: no dimming on a clear frame, dimming on a hazy one; off by default.
{
  const clear = { ...IDENTITY_PARAMS, exposure: 1, haze: 0 };
  const hazy = { ...IDENTITY_PARAMS, exposure: 1, haze: 0.5 };
  assert.equal(lookParams(clear, DEFAULT_SETTINGS).exposure, 1);
  assert.equal(lookParams(hazy, DEFAULT_SETTINGS).exposure, 1);
  assert.equal(lookParams(clear, { ...DEFAULT_SETTINGS, look: 1 }).exposure, 1);
  assert.ok(lookParams(hazy, { ...DEFAULT_SETTINGS, look: 1 }).exposure < 1);
  console.log("ok  look dims only hazy frames");
}

// 5. Gamut: an over-range saturated orange keeps its hue ratio (scales down)
//    instead of being bleached toward grey; in-range colours pass through.
{
  const [r, g, b] = fitToGamut(1.2, 0.3, 0.03);
  assert.ok(r <= 1 + 1e-9);
  assert.ok(Math.abs(g / r - 0.3 / 1.2) < 0.02, `hue ratio kept: ${g / r}`);
  const [cr, cg] = compressToGamut(1.2, 0.3, 0.03);
  assert.ok(cg / cr > g / r, "constant-luminance compression desaturates more");
  assert.deepEqual(fitToGamut(0.5, 0.4, 0.3), [0.5, 0.4, 0.3]);
  // Beyond the scale floor the remainder is still compressed into range.
  const [xr] = fitToGamut(1 / GAMUT_SCALE_MIN * 1.5, 0.1, 0.1);
  assert.ok(xr <= 1 + 1e-9);
  console.log("ok  fitToGamut");
}
