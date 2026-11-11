// Seabed recovery's weight (apply.ts seabedW, SEABED): one material, one colour.
// (The weight is read from a coarse grid the analysis makes: analyze.ts seabedGridOf.)
// The user's eagle-ray clip (11 Nov, Vivid): dark stones lying on bright sand went grey with it, the same stones a
// little further off stayed blue, and the sand switched from grey to blue along a line. The weight now comes from
// the ground around a pixel only, so a stone and its sand share it, and it fades with distance without a step.
//   node --experimental-strip-types apps/aqua-fix/test/seabed.test.ts
import assert from "node:assert/strict";
import { seabedGridOf } from "../src/engine/analyze.ts";
import { gradePixel, resolveContext, seabedW } from "../src/engine/apply.ts";
import { DEFAULT_SETTINGS, IDENTITY_PARAMS, type DepthMap, type GradeParams } from "../src/engine/params.ts";

// A frame looking along a seabed: open water above v = 0.45, sand below it brightening toward the camera, with dark
// stones scattered over all of it (near and far). Guide texels are neutral greys of a given Oklab L (L = cbrt(grey)).
const W = 160, H = 90, LW = 0.5, LB = 0.8;
const sandL = (v: number) => (v < 0.45 ? 0.47 : 0.52 + 0.3 * Math.min(1, (v - 0.45) / 0.4));
const isStone = (x: number, y: number) => y / H > 0.47 && ((x >> 2) % 3 === 1) && ((y >> 2) % 2 === 1);
const guide = new Float32Array(W * H * 3), okL = new Float32Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const L = isStone(x, y) ? sandL((y + 0.5) / H) - 0.2 : sandL((y + 0.5) / H);
  okL[y * W + x] = L;
  guide.fill(L ** 3, (y * W + x) * 3, (y * W + x) * 3 + 3);
}
const depth: DepthMap = { width: W, height: H, fields: new Float32Array(W * H * 4), guide };
// A cyan veil, with the far-hue ramp the analysis gives a clear frame (hues past 60–100° from the water's are objects).
const p: GradeParams = { ...IDENTITY_PARAMS, seabedNeed: 1, seabedLw: LW, seabedLb: LB, seabedGrid: seabedGridOf(okL, W, H, LW, LB), veilColor: [0.05, 0.5, 0.55], hueFarLo: (60 * Math.PI) / 180, hueFarHi: (100 * Math.PI) / 180, achroma: 0.02 };
const at = (x: number, y: number) => seabedW(p, (x + 0.5) / W, (y + 0.5) / H);

// 1. A stone and the sand beside it share the weight, near the camera and far from it.
let worst = 0, nearMin = 1;
for (let y = Math.ceil(0.5 * H); y < H - 2; y++) for (let x = 12; x < W - 12; x++) {
  if (!isStone(x, y)) continue;
  if (isStone(x + 4, y)) continue;
  const stone = at(x, y), sand = at(x + 4, y);
  worst = Math.max(worst, Math.abs(stone - sand));
  if (y / H > 0.85) nearMin = Math.min(nearMin, stone, sand);
}
assert.ok(worst < 0.04, `a stone and its sand differ by ${worst.toFixed(3)} in seabed weight`);
// Near the camera the ground is seabed in full although a share of it is dark stone.
assert.ok(nearMin > 0.97, `near seabed weight ${nearMin.toFixed(3)}`);
console.log(`ok  stone = sand (worst gap ${worst.toFixed(3)}, near seabed ${nearMin.toFixed(3)})`);

// 2. Open water above the seabed takes none, and the weight fades with distance without a step: never more than
//    0.15 between two points 0.02 of the frame apart (the weight before: a full step at the edge of the bright sand), and never rising again toward the water.
for (const x of [20, 80, 140]) {
  assert.ok(at(x, Math.floor(0.2 * H)) < 1e-3);
  assert.ok(at(x, Math.floor(0.3 * H)) < 0.02, `water at v 0.3: ${at(x, Math.floor(0.3 * H))}`);
}
let step = 0, rise = 0;
for (let i = 0; i < 400; i++) {
  const v = 0.2 + (0.78 * i) / 400;
  for (const u of [0.15, 0.4, 0.62, 0.85]) {
    const a = seabedW(p, u, v), b = seabedW(p, u, v + 0.02), c = seabedW(p, u + 0.02, v);
    step = Math.max(step, Math.abs(a - b), Math.abs(a - c));
    rise = Math.max(rise, a - b);
  }
}
assert.ok(step < 0.15, `seabed weight steps by ${step.toFixed(3)} over 0.02 of the frame`);
assert.ok(rise < 0.05, `seabed weight rises by ${rise.toFixed(3)} toward the water`);
// The fade is wide: from a tenth of the weight to nine tenths takes more than a tenth of the frame's height.
const col = (w: number) => { for (let i = 0; i < 1000; i++) if (seabedW(p, 0.5, i / 1000) >= w) return i / 1000; return 1; };
assert.ok(col(0.9) - col(0.1) > 0.1, `fade ${col(0.1).toFixed(3)} → ${col(0.9).toFixed(3)}`);
console.log(`ok  gradual fade (largest step ${step.toFixed(3)}, 10 % at v ${col(0.1).toFixed(2)}, 90 % at v ${col(0.9).toFixed(2)})`);

// 3. In the grade: two stones of the same source colour, one on near sand and one further off, come out in the
//    colour of the ground they lie on (not one grey, one blue), and a pixel whose own colour escaped the cast (an
//    orange fish over the sand) is not turned into sand.
{
  const clahe = { tilesX: 1, tilesY: 1, bins: 2, data: new Float32Array([0.5, 1]) };
  const ctx = resolveContext({ params: p, settings: { ...DEFAULT_SETTINGS, clarity: 0, vivid: 1, seabed: 1 }, depth, clahe });
  const plain = resolveContext({ params: p, settings: { ...DEFAULT_SETTINGS, clarity: 0, vivid: 1, seabed: 0 }, depth, clahe });
  const chroma = (c: readonly number[]) => Math.max(...c) - Math.min(...c);
  const stoneRgb = [0.08, 0.3, 0.34], sandRgb = [0.2, 0.62, 0.66];
  for (const v of [0.9, 0.7]) {
    const s = gradePixel(ctx, stoneRgb[0], stoneRgb[1], stoneRgb[2], 0.5, v), s0 = gradePixel(plain, stoneRgb[0], stoneRgb[1], stoneRgb[2], 0.5, v);
    const g = gradePixel(ctx, sandRgb[0], sandRgb[1], sandRgb[2], 0.5, v), g0 = gradePixel(plain, sandRgb[0], sandRgb[1], sandRgb[2], 0.5, v);
    // Both lose the same share of their cast.
    const ks = chroma(s) / chroma(s0), kg = chroma(g) / chroma(g0);
    assert.ok(Math.abs(ks - kg) < 0.12, `v ${v}: stone keeps ${ks.toFixed(2)} of its cast, sand ${kg.toFixed(2)}`);
  }
  const fish = [0.85, 0.45, 0.1];
  const f = gradePixel(ctx, fish[0], fish[1], fish[2], 0.5, 0.9), f0 = gradePixel(plain, fish[0], fish[1], fish[2], 0.5, 0.9);
  assert.ok(chroma(f) > 0.9 * chroma(f0), `an orange fish over the sand lost its colour: ${chroma(f).toFixed(3)} of ${chroma(f0).toFixed(3)}`);
  console.log("ok  stones take the colour of their ground; an orange fish keeps its own");
}
