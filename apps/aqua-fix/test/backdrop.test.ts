// Artifact guard, smooth-water backdrop and object neutral tone (synthetic).
//   node --experimental-strip-types apps/aqua-fix/test/backdrop.test.ts
import assert from "node:assert/strict";
import { backdropObjectness } from "../src/engine/backdrop.ts";
import { detailBase, detailRatio, objectNeutral, warmClamp } from "../src/engine/apply.ts";
import { backdropSubject, growSubjects } from "../src/engine/backdrop.ts";
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
// Whole-animal map: a solid animal is kept whole; a faint, hazy region (a far group joined through lit water) and a
// school of animals bridged by the closing are dropped entirely.
{
  const w = 160, h = 90, n = w * h;
  const obj = new Float32Array(n), dev = new Float32Array(n), out = new Float32Array(n);
  const blob = (cx: number, cy: number, rx: number, ry: number, d: number) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1) { dev[y * w + x] = d; obj[y * w + x] = 1; }
  };
  blob(30, 20, 22, 9, 1); // solid animal
  blob(110, 20, 22, 9, 0.3); // faint group
  // a school: three solid animals a few texels apart (the closing bridges them)
  blob(20, 70, 11, 7, 1); blob(45, 70, 11, 7, 1); blob(70, 70, 11, 7, 1);
  blob(130, 70, 11, 7, 1); // the same animal alone
  growSubjects(obj, dev, 1, w, h, out);
  assert.equal(out[20 * w + 30], 1, "solid animal toned whole");
  assert.equal(out[20 * w + 110], 0, "faint group dropped");
  assert.equal(out[70 * w + 45], 0, "school dropped");
  assert.equal(out[70 * w + 130], 1, "a lone animal of the same size is kept");
  // A user seed (tap) on the faint group makes it a subject anyway.
  const seeded = new Float32Array(n);
  growSubjects(obj, dev, 1, w, h, seeded, undefined, undefined, undefined, [{ u: 110.5 / w, v: 20.5 / h }]);
  assert.equal(seeded[20 * w + 110], 1, "a seeded region is kept");
  assert.equal(seeded[20 * w + 30], 1, "other subjects unchanged");
}
// A school of small, separate animals (each well under the size an animal is toned from): Subject pop's own map
// (`small`) holds each of them by itself, the base map (`out`) none; the water between them stays water. Faint
// patches, specks, a line along the top edge, unsure water and a frame full of small regions (texture) get nothing.
{
  const w = 256, h = 144, n = w * h;
  const mk = () => ({ obj: new Float32Array(n), dev: new Float32Array(n), out: new Float32Array(n), small: new Float32Array(n) });
  const blob = (s: { obj: Float32Array; dev: Float32Array }, cx: number, cy: number, rx: number, ry: number, d: number, seeded = true) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1) { s.dev[y * w + x] = d; if (seeded) s.obj[y * w + x] = 1; }
  };
  const grow = (s: ReturnType<typeof mk>, validity = 1) => growSubjects(s.obj, s.dev, validity, w, h, s.out, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, s.small);
  const a = mk();
  blob(a, 60, 40, 14, 3, 0.5); blob(a, 150, 60, 16, 3, 0.4); blob(a, 90, 100, 12, 3, 0.6); // three far sharks, ~0.3–0.4 % each
  blob(a, 200, 110, 14, 3, 0.1, false); // a faint patch of haze
  blob(a, 30, 120, 2, 1.5, 1); // a particle
  for (let x = 0; x < w; x++) { a.dev[x] = 1; a.obj[x] = 1; } // a dark line along the top edge
  const tone = grow(a);
  assert.ok(a.out.every((v) => v === 0), "the base map is unchanged: nothing of this size");
  for (const [x, y] of [[60, 40], [150, 60], [90, 100]]) assert.equal(a.small[y * w + x], 1, `far shark at ${x},${y} is a subject`);
  assert.equal(a.small[50 * w + 105], 0, "the water between the sharks stays water");
  assert.equal(a.small[110 * w + 200], 0, "a faint patch is not a subject");
  assert.equal(a.small[120 * w + 30], 0, "a particle is not a subject");
  assert.equal(a.small[128], 0, "a line along the top edge is not a subject");
  assert.equal(tone, 1, "a school counts as the clip's lit animal (no lightness data: lit)");
  // Not surely open water (a reef in the frame): small regions are rocks and shadows as often as animals.
  const b = mk();
  blob(b, 60, 40, 14, 3, 0.5);
  grow(b, 0.4);
  assert.ok(b.small.every((v) => v === 0), "low water validity: no small subjects");
  // Texture: a frame full of small regions (ripples, a bait ball) is not a school of animals.
  const c = mk();
  for (let k = 0; k < 18; k++) blob(c, 25 + (k % 6) * 40, 25 + Math.floor(k / 6) * 45, 12, 3, 0.6);
  grow(c);
  assert.ok(c.small.every((v) => v === 0), "too many small regions: texture, none toned");
  // Clutter: one shark-sized region among two dozen patches (a smooth seabed the surface fits) is not toned either.
  const e = mk();
  blob(e, 60, 40, 14, 3, 0.5);
  for (let k = 0; k < 26; k++) blob(e, 20 + (k % 9) * 26, 80 + Math.floor(k / 9) * 18, 3, 2, 0.5, false);
  grow(e);
  assert.ok(e.small.every((v) => v === 0), "a cluttered frame: no small subjects");
  // A whole animal the solidity test drops (no pixel departs strongly) but that departs well on average: dropped
  // from the base map as before, a subject in Subject pop's map; a hazy group stays out of both.
  const f = mk();
  blob(f, 80, 50, 40, 12, 0.6); blob(f, 180, 110, 40, 12, 0.3);
  grow(f);
  assert.equal(f.out[50 * w + 80], 0, "the base map keeps the solidity verdict");
  assert.equal(f.small[50 * w + 80], 1, "a strong whole animal is a Subject pop subject");
  assert.equal(f.small[110 * w + 180], 0, "a hazy group is not");
  // Without the `small` output nothing changes for callers that do not ask for it.
  const d = mk();
  blob(d, 60, 40, 14, 3, 0.5);
  growSubjects(d.obj, d.dev, 1, w, h, d.out);
  assert.ok(d.out.every((v) => v === 0));
}
console.log("ok  backdrop / artifact guard / object neutral / warm clamp");
