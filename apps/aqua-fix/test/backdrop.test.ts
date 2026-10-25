// Artifact guard, smooth-water backdrop and object neutral tone (synthetic).
//   node --experimental-strip-types apps/aqua-fix/test/backdrop.test.ts
import assert from "node:assert/strict";
import { backdropObjectness } from "../src/engine/backdrop.ts";
import { detailBase, detailRatio, objectNeutral, warmClamp } from "../src/engine/apply.ts";
import { backdropSubject } from "../src/engine/backdrop.ts";
import { linearToOklab, srgbToLinear } from "../src/engine/color.ts";

const W = 256, H = 144, n = W * H;
const lab = (rgb: Uint8ClampedArray) => {
  const L = new Float32Array(n), A = new Float32Array(n), B = new Float32Array(n);
  for (let i = 0; i < n; i++) { const o = linearToOklab(srgbToLinear(rgb[i * 4] / 255), srgbToLinear(rgb[i * 4 + 1] / 255), srgbToLinear(rgb[i * 4 + 2] / 255)); L[i] = o[0]; A[i] = o[1]; B[i] = o[2]; }
  return { L, A, B };
};
/** Blue water with a vertical gradient and, optionally, an ellipse "shark" or a soft glow. */
const scene = (subject: "none" | "shark" | "glow") => {
  const px = new Uint8ClampedArray(n * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, t = y / H;
    let r = 30, g = 170 - 90 * t, b = 238 - 80 * t;
    const dx = (x - 128) / 60, dy = (y - 70) / 14;
    if (subject === "shark" && dx * dx + dy * dy < 1) { r = 45; g = 205; b = 232; }
    if (subject === "glow") { const d = Math.hypot((x - 128) / 70, y / 40); const k = Math.exp(-d * d); g += 60 * k; b += 17 * k; r += 40 * k; }
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
  }
  return px;
};
const run = (px: Uint8ClampedArray) => { const { L, A, B } = lab(px); const out = new Float32Array(n); const v = backdropObjectness(L, A, B, new Float32Array(n).fill(1), W, H, out); return { v, out }; };

// Open water: the model holds and nothing is a subject.
{
  const { v, out } = run(scene("none"));
  assert.ok(v > 0.9, `validity ${v}`);
  assert.ok(Math.max(...out) < 0.05, "no subject in open water");
}
// A veil-hued but lighter, outlined subject is found; the water around it is not.
{
  const { v, out } = run(scene("shark"));
  assert.ok(v > 0.9);
  assert.ok(out[70 * W + 128] > 0.8, `shark centre ${out[70 * W + 128].toFixed(2)}`);
  assert.ok(out[20 * W + 20] < 0.05, "water stays water");
}
// A soft sun glow (no outline) is brighter water, not a subject.
{
  const { out } = run(scene("glow"));
  assert.ok(out[5 * W + 128] < 0.2, `glow ${out[5 * W + 128].toFixed(2)}`);
}
// A frame the smooth surface cannot explain (noise everywhere, like a reef) gets no backdrop.
{
  const px = new Uint8ClampedArray(n * 4);
  let s = 1;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) { px[i * 4] = rnd() * 255; px[i * 4 + 1] = rnd() * 255; px[i * 4 + 2] = rnd() * 255; px[i * 4 + 3] = 255; }
  assert.equal(run(px).v, 0);
}

// Artifact guard: flat region with 2-code macroblock steps → the base is (nearly) flat; a real edge survives.
{
  const w = 64, h = 32, img = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const v = x < 48 ? 60 + (((x >> 3) + (y >> 3)) & 1) * 2 : 160; // blocks, then an edge at x = 48
    img[i] = v; img[i + 1] = v; img[i + 2] = v; img[i + 3] = 255;
  }
  const a = detailBase(img, w, h, 23, 12, 1)[1] * 255, b = detailBase(img, w, h, 24, 12, 1)[1] * 255;
  assert.ok(Math.abs(a - b) < 0.8, `block step ${Math.abs(a - b).toFixed(2)} codes after the guard (2 before)`);
  assert.ok(Math.abs(detailBase(img, w, h, 47, 12, 1)[1] * 255 - 61) < 2.5, "dark side of the edge stays dark");
  assert.ok(Math.abs(detailBase(img, w, h, 48, 12, 1)[1] * 255 - 160) < 1, "light side stays light");
  // guard 0 = the pixel itself, and a pixel that is its own base has a unit detail ratio
  const p = detailBase(img, w, h, 23, 12, 0);
  assert.deepEqual(p, [img[(12 * w + 23) * 4] / 255, img[(12 * w + 23) * 4 + 1] / 255, img[(12 * w + 23) * 4 + 2] / 255]);
  assert.equal(detailRatio(p[0], p[1], p[2], srgbToLinear(p[0]), srgbToLinear(p[1]), srgbToLinear(p[2])), 1);
}

// Object neutral tone: a red-starved cyan object loses chroma; warm colours, red-rich sources,
// dark pixels, water (conf 0) and frames without a backdrop are untouched.
{
  const cyan = linearToOklab(0.05, 0.6, 0.55);
  const warm = linearToOklab(0.6, 0.4, 0.2);
  assert.ok(objectNeutral(cyan[0], cyan[1], cyan[2], 0.02, 0.6, 0.8, 0, 1, 1) > 0.6);
  assert.equal(objectNeutral(warm[0], warm[1], warm[2], 0.4, 0.6, 0.8, 0, 1, 1), 0, "warm with real source red: untouched");
  assert.ok(objectNeutral(warm[0], warm[1], warm[2], 0.02, 0.6, 0.8, 0, 1, 1) > 0.6, "warm made from no source red (orange belly): neutralised");
  assert.equal(objectNeutral(cyan[0], cyan[1], cyan[2], 0.4, 0.6, 0.8, 0, 1, 1), 0);
  assert.equal(objectNeutral(0.08, cyan[1], cyan[2], 0.02, 0.6, 0.8, 0, 1, 1), 0);
  assert.equal(objectNeutral(cyan[0], cyan[1], cyan[2], 0.02, 0.6, 0.8, 0, 0, 1), 0);
  assert.equal(objectNeutral(cyan[0], cyan[1], cyan[2], 0.02, 0.6, 0.8, 0, 1, 0), 0);
  assert.equal(objectNeutral(cyan[0], cyan[1], cyan[2], 0.02, 0.6, 0.8, 1, 1, 1), 0);
}
// Warm clamp: orange made from a red-starved source goes; a source with real red, a person, or a far source hue keep it.
{
  const o = linearToOklab(0.6, 0.4, 0.2);
  assert.ok(warmClamp(o[1], o[2], 0.01, 0.5, 0.7, 0, 0, 1) < 0.05);
  assert.equal(warmClamp(o[1], o[2], 0.4, 0.5, 0.7, 0, 0, 1), 1);
  assert.equal(warmClamp(o[1], o[2], 0.01, 0.5, 0.7, 0, 1, 1), 1);
  assert.equal(warmClamp(o[1], o[2], 0.01, 0.5, 0.7, 1, 0, 1), 1);
  const blue = linearToOklab(0.02, 0.3, 0.8);
  assert.equal(warmClamp(blue[1], blue[2], 0.01, 0.3, 0.8, 0, 0, 1), 1, "water untouched");
}
// Per-pixel backdrop test: on the surface = 0, far off it = 1.
{
  const fit = new Array(18).fill(0); fit[0] = 0.6; fit[6] = -0.05; fit[12] = -0.12;
  assert.equal(backdropSubject(0.6, -0.05, -0.12, 0.3, 0.7, fit), 0);
  assert.equal(backdropSubject(0.8, 0, 0, 0.3, 0.7, fit), 1);
}
console.log("ok  backdrop / artifact guard / object neutral / warm clamp");
