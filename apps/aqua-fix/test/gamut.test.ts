// Chroma knee toward the sRGB gamut edge (pure colour maths): a pushed chroma
// on saturated cyan water must never land on the edge where red is 0.
//   node --experimental-strip-types apps/aqua-fix/test/gamut.test.ts
import assert from "node:assert/strict";
import { capChroma, gamutChroma, GAMUT_CHROMA_KNEE, linearToOklab, oklabToLinear } from "../src/engine/color.ts";

// Moderate colours pass through untouched.
{
  const [L, a, b] = linearToOklab(0.3, 0.45, 0.4);
  const [a2, b2] = capChroma(L, a, b);
  assert.equal(a2, a);
  assert.equal(b2, b);
}

// A cyan pushed past the gamut: after the knee every channel is inside (0, 1) with red clearly above 0.
{
  const [L, a, b] = linearToOklab(0.0, 0.75, 0.78);
  const C = Math.hypot(a, b);
  const [a2, b2] = capChroma(L, a * 1.6, b * 1.6);
  const C2 = Math.hypot(a2, b2);
  const cMax = gamutChroma(L, a / C, b / C);
  assert.ok(C2 < cMax, `knee keeps chroma ${C2.toFixed(3)} below the edge ${cMax.toFixed(3)}`);
  assert.ok(C2 > GAMUT_CHROMA_KNEE * cMax, "but above the knee");
  const rgb = oklabToLinear(L, a2, b2);
  assert.ok(rgb[0] > 0.01 && rgb[0] < 1, `red stays positive: ${rgb[0].toFixed(3)}`);
  assert.ok(rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4), `in gamut: ${rgb.map((v) => v.toFixed(3))}`);
}

// Monotone: more input chroma never gives less output chroma.
{
  const [L, a, b] = linearToOklab(0.1, 0.6, 0.7);
  const C = Math.hypot(a, b);
  let prev = 0;
  for (let k = 0.2; k <= 3; k += 0.2) {
    const [a2, b2] = capChroma(L, (a / C) * k * 0.1, (b / C) * k * 0.1);
    const c2 = Math.hypot(a2, b2);
    assert.ok(c2 >= prev - 1e-9, `monotone at k=${k.toFixed(1)}`);
    prev = c2;
  }
}

// Vivid in-gamut colours (a Garibaldi orange) lose at most a few percent of chroma.
{
  const [L, a, b] = linearToOklab(0.9, 0.3, 0.02);
  const C = Math.hypot(a, b);
  const [a2, b2] = capChroma(L, a * 1.1, b * 1.1, C);
  assert.ok(Math.hypot(a2, b2) >= C - 1e-9, `orange keeps its source chroma: ${(Math.hypot(a2, b2) / C).toFixed(3)}`);
  const [a3, b3] = capChroma(L, a, b, C);
  assert.equal(a3, a); assert.equal(b3, b);
}

console.log("gamut: ok");
