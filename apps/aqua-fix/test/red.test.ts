// Red restoration and its guards (red.ts), on synthetic frames.
//   node --experimental-strip-types apps/aqua-fix/test/red.test.ts
// Sections 1–5 are regressions against the user's hard rules (skin never
// turns red, no glaring red / red clipping, sand and whites never pink, no
// red flicker or blotches, graded footage left alone); they failed before
// red.ts existed. Section 6 covers the pure functions.
import assert from "node:assert/strict";
import { analyzeThumbnail, ANALYSIS_W, ANALYSIS_H } from "../src/engine/analyze.ts";
import { applyGrade } from "../src/engine/apply.ts";
import { calmEvidence, calmScores } from "../src/engine/calm.ts";
import { linearToOklab, srgbToLinear } from "../src/engine/color.ts";
import { DEFAULT_SETTINGS, type DepthMap, type UserSettings } from "../src/engine/params.ts";
import { RED, chromaRebuild, greenCastOf, greenNeutral, murkHold, redGuard, warmMaterial } from "../src/engine/red.ts";

const W = ANALYSIS_W, H = ANALYSIS_H;
function noise(seed: number): number { const s = Math.sin(seed * 12.9898) * 43758.5453; return s - Math.floor(s); }
function frame(fill: (x: number, y: number, i: number) => [number, number, number]): Uint8ClampedArray {
  const px = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const [r, g, b] = fill(x, y, i);
    px[i * 4] = r; px[i * 4 + 1] = g; px[i * 4 + 2] = b; px[i * 4 + 3] = 255;
  }
  return px;
}
const lab = (px: Uint8ClampedArray, i: number) => linearToOklab(srgbToLinear(px[i * 4] / 255), srgbToLinear(px[i * 4 + 1] / 255), srgbToLinear(px[i * 4 + 2] / 255));
const hueDeg = (a: number, b: number) => ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
// `wbR` forces the red gain (a stress test: the rules hold whatever the estimate says).
function grade(px: Uint8ClampedArray, settings: UserSettings, person?: (u: number, v: number) => number, wbR?: number) {
  const a = analyzeThumbnail(px, W, H);
  if (wbR) a.params = { ...a.params, wb: [wbR, 1, a.params.wb[2]], waterWb: [Math.min(1.6, Math.sqrt(wbR)), 1, a.params.waterWb[2]], calm: 0, calmTone: 0 };
  let depth: DepthMap = a.depth;
  if (person) {
    const p = new Float32Array(depth.width * depth.height);
    for (let y = 0; y < depth.height; y++) for (let x = 0; x < depth.width; x++) p[y * depth.width + x] = person((x + 0.5) / depth.width, (y + 0.5) / depth.height);
    depth = { ...depth, person: p };
  }
  const ctx = { params: a.params, settings, depth, clahe: a.clahe };
  return { a, ctx, out: applyGrade(ctx, px, W, H) };
}
const PUSH: UserSettings = { ...DEFAULT_SETTINGS, intensity: 2 };
// Open blue water at depth with grain, the classic red-starved scene.
const water = (x: number, y: number, i: number): [number, number, number] => {
  const n = (noise(i * 1.7) - 0.5) * 6;
  return [18 + n * 0.5, 96 + 30 * (1 - y / H) + n, 150 + 30 * (1 - y / H) + n];
};
const inRect = (x: number, y: number, x0: number, y0: number, x1: number, y1: number) => x >= x0 * W && x < x1 * W && y >= y0 * H && y < y1 * H;

// 1. Skin never turns red: a diver's skin under a cyan cast (grey in the
//    source), on the person mask, at the pushed intensity with a red gain of
//    4, keeps a natural skin hue (≥ 15°, red is ~0–10°; the reference
//    freediver measures 19°) and natural skin chroma.
{
  const px = frame((x, y, i) => inRect(x, y, 0.35, 0.3, 0.65, 0.7) ? [150 + (noise(i) - 0.5) * 4, 146, 156] : water(x, y, i));
  const { out } = grade(px, PUSH, (u, v) => (u > 0.33 && u < 0.67 && v > 0.28 && v < 0.72 ? 1 : 0), 4);
  let sa = 0, sb = 0, sl = 0, k = 0, minHue = 360;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!inRect(x, y, 0.4, 0.36, 0.6, 0.64)) continue;
    const [l, a, b] = lab(out, y * W + x); sa += a; sb += b; sl += l; k++;
    const hh = hueDeg(a, b); if (Math.hypot(a, b) > 0.02) minHue = Math.min(minHue, hh > 180 ? hh - 360 : hh);
  }
  const hue = hueDeg(sa / k, sb / k), C = Math.hypot(sa / k, sb / k);
  assert.ok(hue >= 15 && hue <= 70, `skin hue ${hue.toFixed(1)}° (natural skin 15°–70°, red 0–10°)`);
  assert.ok(C <= 0.09, `skin chroma ${C.toFixed(3)} ≤ 0.09`);
  assert.ok(minHue >= 12, `no skin pixel on the red side: min hue ${minHue.toFixed(1)}°`);
  console.log(`ok  skin stays skin (hue ${hue.toFixed(1)}°, C ${C.toFixed(3)}, min hue ${minHue.toFixed(1)}°)`);
}

// 2. No glaring red: a red fish (dull mauve in the source) under blue water
//    at the pushed intensity with a red gain of 4.5: restored red stays below
//    the ceiling, and no pixel clips the red channel.
{
  const px = frame((x, y, i) => {
    const dx = (x - 0.5 * W) / (0.22 * W), dy = (y - 0.55 * H) / (0.18 * H);
    return dx * dx + dy * dy < 1 ? [118 + (noise(i * 3.1) - 0.5) * 6, 70, 96] : water(x, y, i);
  });
  const { out } = grade(px, PUSH, undefined, 4.5);
  let maxC = 0, clip = 0, k = 0;
  for (let i = 0; i < W * H; i++) {
    const [, a, b] = lab(out, i); const hh = hueDeg(a, b);
    if (hh > 315 || hh < 60) maxC = Math.max(maxC, Math.hypot(a, b));
    if (out[i * 4] >= 254 && out[i * 4 + 1] < 230) clip++;
    k++;
  }
  assert.ok(maxC <= RED.cMax + 0.005, `red chroma ${maxC.toFixed(3)} ≤ ceiling ${RED.cMax}`);
  assert.equal(clip, 0, `${clip} pixels clip the red channel`);
  console.log(`ok  no glaring red (max red-band chroma ${maxC.toFixed(3)}, ${clip} clipped of ${k})`);
}

// 3. Sand and whites never turn pink: bright cyan-cast sand under a green-cyan
//    veil at the pushed intensity with a red gain of 5.
{
  const px = frame((x, y, i) => {
    const n = (noise(i * 2.3) - 0.5) * 10;
    return y > 0.45 * H ? [168 + n, 186 + n, 174 + n] : [30 + n * 0.3, 120 + n, 128 + n];
  });
  const { out } = grade(px, PUSH, undefined, 5);
  let bright = 0, pink = 0;
  for (let i = 0; i < W * H; i++) {
    const [l, a, b] = lab(out, i); if (l < 0.66) continue;
    bright++; const hh = hueDeg(a, b);
    if (Math.hypot(a, b) > 0.03 && (hh > 300 || hh < 45)) pink++; // pink, salmon, peach: natural sand sits at ~60°–90°
  }
  assert.ok(bright > W * H * 0.2, "sand stays light");
  assert.ok(pink / bright < 0.01, `pink share of light pixels ${(100 * pink / bright).toFixed(2)} %`);
  console.log(`ok  sand never pink (${(100 * pink / bright).toFixed(2)} % of ${bright} light pixels)`);
}

// 4. No red flicker or blotches: two frames of the same red-starved scene that
//    differ only by fresh red-channel grain and 16×16 chroma-block offsets
//    (what a compressed clip does from frame to frame). Graded with one
//    analysis (a locked clip) at a red gain of 3.5, the output's red barely
//    moves: the noise is neither amplified nor passed through.
{
  const base = (x: number, y: number, i: number): [number, number, number] => {
    const dx = (x - 0.45 * W) / (0.35 * W), dy = (y - 0.5 * H) / (0.35 * H);
    return dx * dx + dy * dy < 1 ? [112, 150, 146] : water(x, y, i);
  };
  const mk = (seed: number) => frame((x, y, i) => {
    const [r, g, b] = base(x, y, i);
    const blk = (noise(seed * 977 + Math.floor(x / 16) * 31 + Math.floor(y / 16) * 7) - 0.5) * 20;
    return [r + blk + (noise(seed * 131 + i * 0.37) - 0.5) * 2, g, b];
  });
  const f1 = mk(1), f2 = mk(2);
  const { ctx } = grade(f1, PUSH, undefined, 3.5);
  const o1 = applyGrade(ctx, f1, W, H), o2 = applyGrade(ctx, f2, W, H);
  let dOut = 0, dSrc = 0;
  for (let i = 0; i < W * H; i++) { dOut += Math.abs(o1[i * 4] - o2[i * 4]); dSrc += Math.abs(f1[i * 4] - f2[i * 4]); }
  let bOut = 0, bSrc = 0, nb = 0;
  for (let by = 0; by + 16 <= H; by += 16) for (let bx = 0; bx + 16 <= W; bx += 16) {
    let so = 0, ss = 0;
    for (let y = by; y < by + 16; y++) for (let x = bx; x < bx + 16; x++) { const i = y * W + x; so += o1[i * 4] - o2[i * 4]; ss += f1[i * 4] - f2[i * 4]; }
    bOut += Math.abs(so / 256); bSrc += Math.abs(ss / 256); nb++;
  }
  const flick = dOut / dSrc, blot = bOut / bSrc;
  // The rebuild takes red's detail from green/blue, so the red grain and the
  // chroma blocks of the source are not carried into the output at all.
  assert.ok(flick <= 0.5, `red frame-to-frame change ×${flick.toFixed(2)} of the source's`);
  assert.ok(blot <= 0.5, `16×16 red block change ×${blot.toFixed(2)} of the source's`);
  console.log(`ok  no red flicker / blotches (pixel ×${flick.toFixed(2)}, block ×${blot.toFixed(2)})`);
}

// 5. Graded footage stays put: a lit sea floor (yellow-brown sand, a pale
//    lilac animal, warm shadows) — already balanced ROV footage — counts as
//    calm and comes out within a few codes of the source.
{
  const px = frame((x, y, i) => {
    const n = (noise(i * 5.3) - 0.5) * 12;
    const dx = (x - 0.55 * W) / (0.15 * W), dy = (y - 0.5 * H) / (0.2 * H);
    if (dx * dx + dy * dy < 1) return [205 + n * 0.2, 190 + n * 0.2, 225 + n * 0.2];
    const t = noise(i * 0.91);
    return t < 0.15 ? [62 + n * 0.3, 46 + n * 0.2, 40 + n * 0.2] : [140 + n, 124 + n, 104 + n];
  });
  const lin = new Float32Array(W * H * 3);
  for (let i = 0; i < W * H; i++) for (let c = 0; c < 3; c++) lin[i * 3 + c] = srgbToLinear(px[i * 4 + c] / 255);
  const ev = calmEvidence(lin, W * H);
  const { calm } = calmScores(ev, 0.05);
  assert.ok(calm >= 0.8, `warm-floor graded footage is calm (${calm.toFixed(2)}; evidence ${JSON.stringify(ev)})`);
  const { out } = grade(px, DEFAULT_SETTINGS);
  let d = 0; for (let i = 0; i < W * H; i++) for (let c = 0; c < 3; c++) d += Math.abs(out[i * 4 + c] - px[i * 4 + c]);
  d /= W * H * 3;
  assert.ok(d <= 4, `graded footage changed by ${d.toFixed(2)} codes`);
  console.log(`ok  graded footage left alone (calm ${calm.toFixed(2)}, mean |Δ| ${d.toFixed(2)} codes)`);
}

// 6. Pure functions.
{
  // Rebuild: identity when no channel is amplified; with a red gain, red
  // grain below the tolerance is replaced by the smooth ratio × G/B detail.
  const lin = [0.02, 0.15, 0.3], s = [0.025, 0.15, 0.3];
  assert.deepEqual(chromaRebuild(lin, s, [1, 1, 1], [0, 0, 0]).c, lin);
  const rb = chromaRebuild(lin, s, [4, 1, 1], [0.01, 0.05, 0.1]);
  assert.ok(Math.abs(rb.c[0] - 0.025) < 1e-3 && rb.c[1] === lin[1] && rb.c[2] === lin[2], `rebuilt ${rb.c}`);
  const far = chromaRebuild([0.02, 0.15, 0.3], [0.2, 0.15, 0.3], [4, 1, 1], [0, 0, 0]).c[0];
  assert.ok(far <= 0.02 * (1 + RED.tolFrac) + RED.tolLin + 1e-9, "a mismatched guide is bounded to the pixel's own value ± tolerance");
  // Green weight: blue veil 0, green veil 1, a veil too dim to be a cast 0.
  assert.equal(greenCastOf([0.02, 0.3, 0.6]), 0);
  assert.equal(greenCastOf([0.02, 0.4, 0.1]), 1);
  assert.equal(greenCastOf([0.016, 0.029, 0.019]), 0, "ROV-lit floor (dim veil) is not green water");
  // Green neutral: off at g = 0, moves green toward the muted target, leaves red/yellow alone.
  assert.deepEqual(greenNeutral(0.6, -0.1, 0.05, 0), [-0.1, 0.05]);
  const gn = greenNeutral(0.6, -0.1, 0.05, 1);
  assert.ok(Math.hypot(gn[0], gn[1]) < 0.05, "green cast desaturated");
  assert.deepEqual(greenNeutral(0.6, 0.02, 0.08, 1), [0.02, 0.08], "yellow untouched");
  // Guard: a vivid red is rolled off below the ceiling; a source that already held it keeps it.
  const g1 = redGuard(0.6, 0.25, 0.03, -0.02, -0.03, 0, 0);
  assert.ok(Math.hypot(g1[0], g1[1]) <= RED.cMax, "red ceiling");
  const g2 = redGuard(0.6, 0.2, 0.03, 0.2, 0.03, 0, 0);
  assert.ok(Math.hypot(g2[0], g2[1]) >= 0.19, "source red kept");
  const g3 = redGuard(0.9, 0.06, 0.0, 0, 0, 0, 0);
  assert.ok(Math.hypot(g3[0], g3[1]) <= RED.whiteC + 1e-9, "white never pink");
  const g4 = redGuard(0.6, 0.06, 0.005, -0.01, -0.01, 1, 0);
  assert.ok(hueDeg(g4[0], g4[1]) >= 14.9, "skin hue floor");
  console.log("ok  chromaRebuild / greenCastOf / greenNeutral / redGuard");
}

// 7. Green water, second round.
{
  // Cyan-green water is detected from the veil colour (diver_green: B∞ G/B 1.05,
  // veil G/B 1.90); tropical cyan reef water is not (vs09 / vs18: veil G/B ≤ 1.26).
  assert.ok(greenCastOf([0.03, 0.27, 0.257], [0.04, 0.38, 0.2]) > 0.95, "cyan-green coastal water is green water");
  assert.equal(greenCastOf([0.002, 0.24, 0.267], [0.02, 0.3, 0.238]), 0, "tropical cyan reef water (veil G/B 1.26) is not");
  assert.equal(greenCastOf([0.03, 0.128, 0.127], [0.02, 0.29, 0.293]), 0, "cyan reef (veil G/B 0.99) is not");
  // Stone / sand mid-tones in green water: an orange overshoot is rolled off to natural-material chroma; a vivid source (far from the veil) is not.
  const h = (70 * Math.PI) / 180, Co = 0.1;
  const m = warmMaterial(0.6, Co * Math.cos(h), Co * Math.sin(h), 1, 0);
  assert.ok(Math.hypot(m[0], m[1]) <= RED.matC + 1e-9, `material chroma ${Math.hypot(m[0], m[1]).toFixed(3)}`);
  assert.deepEqual(warmMaterial(0.6, Co * Math.cos(h), Co * Math.sin(h), 1, 1), [Co * Math.cos(h), Co * Math.sin(h)], "a yellow fish that escaped the cast keeps its colour");
  assert.deepEqual(warmMaterial(0.6, Co * Math.cos(h), Co * Math.sin(h), 0, 0), [Co * Math.cos(h), Co * Math.sin(h)], "off outside green water");
  // Murk is never lifted: a water-path pixel ends at or below its source (dark murk below).
  assert.ok(murkHold(0.2, 0.09, 1) <= 0.09 * RED.murkDark + 1e-6 + (1 - RED.murkDark) * 0.09 * 0.01, "dark murk ends darker than its source");
  assert.ok(Math.abs(murkHold(0.5, 0.4, 1) - 0.4) < 1e-9, "light water ends at its source luminance");
  assert.equal(murkHold(0.2, 0.09, 0), 0.2, "off outside green water");
  console.log("ok  cyan-green detection / natural-material ceiling / murk hold");
}

// 8. Green water end to end: murky cyan-green frame — the murk ends no lighter than the source; seagrass-like olive stays on the yellow side (no lavender).
{
  const px = frame((x, y, i) => {
    const n = (noise(i * 3.7) - 0.5) * 8;
    if (y > 0.55 * H && x < 0.5 * W) return [96 + n, 118 + n, 52 + n]; // olive seagrass
    return [14 + n * 0.3, 96 + n, 70 + n]; // dark cyan-green murk
  });
  const { a, out } = grade(px, DEFAULT_SETTINGS);
  let ls = 0, lo = 0, k = 0, sa = 0, sb = 0, kg = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (y < 0.4 * H) { ls += lab(px, i)[0]; lo += lab(out, i)[0]; k++; }
    if (y > 0.65 * H && x < 0.4 * W) { const [, aa, bb] = lab(out, i); sa += aa; sb += bb; kg++; }
  }
  const hue = hueDeg(sa / kg, sb / kg);
  assert.ok(a.params.binf[1] > 0, "veil fitted");
  assert.ok(lo / k <= ls / k + 0.005, `murk L ${(lo / k).toFixed(3)} vs source ${(ls / k).toFixed(3)}`);
  assert.ok(hue > 30 && hue < 140, `seagrass hue ${hue.toFixed(0)}° stays olive/brown, not lavender`);
  console.log(`ok  murk not lifted (L ${(ls / k).toFixed(3)} → ${(lo / k).toFixed(3)}), seagrass hue ${hue.toFixed(0)}°`);
}
