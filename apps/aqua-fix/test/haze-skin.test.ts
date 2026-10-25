// Haze-lift removal and skin memory colour (pure functions).
//   node --experimental-strip-types apps/aqua-fix/test/haze-skin.test.ts
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, HAZE_AUTO, HAZE_LIFT, IDENTITY_PARAMS, SKIN, hazeLiftRatio, hazeLiftT, hazeSettings, lookParams, resolveSettings, presetSettings } from "../src/engine/params.ts";
import { skinTone } from "../src/engine/apply.ts";

// 1. The haze-lift curve: identity at t = 0 (and continuous into it), monotone,
//    never below the toe floor (no black blobs), darker than the input below 1.
{
  for (const y of [0, 0.01, 0.2, 0.7, 1]) assert.equal(hazeLiftRatio(y, 0), 1);
  assert.ok(Math.abs(hazeLiftRatio(0.4, 1e-6) - 1) < 1e-4, "continuous at t → 0");
  for (const t of [0.02, 0.08, 0.15, 0.25]) {
    let prev = -1;
    for (let k = 0; k <= 400; k++) {
      const y = k / 400;
      const out = y * hazeLiftRatio(y, t);
      assert.ok(out >= prev - 1e-9, `monotone at y=${y} t=${t}`);
      prev = out;
      if (y > 0) {
        assert.ok(hazeLiftRatio(y, t) >= HAZE_LIFT.floor - 0.01, `toe floor at y=${y} t=${t}`);
        if (y < 0.95) assert.ok(out <= y + 1e-9, `never brightens below white (y=${y} t=${t})`);
      }
    }
  }
  console.log("ok  hazeLiftRatio identity / monotone / floored");
}

// 2. The subtraction follows the frame: zero without a lifted black, neutral
//    share + capped per-channel share otherwise; the automatic lift is driven
//    by the haze weight only (clear frames: none).
{
  assert.deepEqual(hazeLiftT({ ...IDENTITY_PARAMS }, 1), [0, 0, 0]);
  const p = { ...IDENTITY_PARAMS, haze: 1, hazeBlack: 0.1, hazeFloor: [0.02, 0.12, 0.5] as [number, number, number] };
  const t = hazeLiftT(p, 1);
  const k = HAZE_LIFT.chroma;
  assert.ok(Math.abs(t[0] - ((1 - k) * 0.1 + k * 0.02)) < 1e-9);
  assert.ok(Math.abs(t[2] - ((1 - k) * 0.1 + k * 0.2)) < 1e-9, "per-channel share capped at 2× the luminance black");
  const g = resolveSettings(DEFAULT_SETTINGS);
  assert.equal(g.hazeLift, 0);
  assert.equal(hazeSettings(g, { ...IDENTITY_PARAMS, haze: 0 }).hazeLift, 0, "clear frame: no lift");
  assert.ok(Math.abs(hazeSettings(g, { ...IDENTITY_PARAMS, haze: 1 }).hazeLift - HAZE_AUTO.lift) < 1e-9, "murky frame: full auto lift");
  assert.ok(presetSettings(g, { ...DEFAULT_SETTINGS, preset: "murky" }).hazeLift > 0, "Green water preset lifts");
  assert.equal(presetSettings(g, { ...DEFAULT_SETTINGS, preset: "reef" }).hazeLift, 0);
  console.log("ok  hazeLiftT / hazeSettings");
}

// 2b. The look's haze dim backs off when the haze lift is already darkening
//     the frame (they used to stack to near-black on murky scenes).
{
  const murky = { ...IDENTITY_PARAMS, haze: 1, hazeBlack: 0.14 };
  const lifted = lookParams(murky, { ...DEFAULT_SETTINGS, look: 1 }).exposure;
  const unlifted = lookParams(murky, { ...DEFAULT_SETTINGS, look: 1, hazeAuto: false }).exposure;
  assert.ok(lifted < 1 && lifted > unlifted, `relief: ${lifted} vs ${unlifted}`);
  console.log("ok  look dim relief under haze lift");
}

// 3. Skin memory colour: a cream person pixel turns pink (toward SKIN.hue),
//    the same pixel off the person mask is untouched, a dark wetsuit and a
//    vivid blue fin are untouched.
{
  const deg = (a: number, b: number) => ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  const L = 0.8, C = 0.03, h = (80 * Math.PI) / 180;
  const a = C * Math.cos(h), b = C * Math.sin(h);
  const [a2, b2] = skinTone(L, a, b, 1);
  const hue = deg(a2, b2);
  assert.ok(Math.abs(hue - (SKIN.hue * 180) / Math.PI) < 3, `cream → pink, got ${hue.toFixed(1)}°`);
  assert.ok(Math.hypot(a2, b2) >= SKIN.cMin - 1e-9, "chroma floor");
  assert.deepEqual(skinTone(L, a, b, 0), [a, b], "no person → untouched");
  assert.deepEqual(skinTone(0.2, a, b, 1), [a, b], "dark wetsuit untouched");
  const fa = 0.12 * Math.cos(4.4), fb = 0.12 * Math.sin(4.4);
  assert.deepEqual(skinTone(0.6, fa, fb, 1), [fa, fb], "vivid fin untouched");
  console.log("ok  skinTone");
}
