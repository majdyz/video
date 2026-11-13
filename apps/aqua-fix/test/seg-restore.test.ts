// AI subject restore (params.ts SEG_RESTORE; apply.ts segRestore / grade-shader segRestore): with a real AI mask on
// the frame the subject is brought a little closer (part of its water cast off, its own contrast up), scales with
// the Pop slider (nothing at 0), stays inside the mask, and stays in the scene's light: never neutral, never warm.
// The user's eagle-ray clip (12 Nov): first the AI mask changed the ray by under 1% and Pop 100 looked like Pop 50;
// the stronger restore that followed turned it a neutral grey-brown (orange when far away) in an all-blue scene, a
// cut-out sticker ("really bad, too jarring"). Now a set share of the cast goes: about 0.4 at Pop 50 in the
// subject's core, at most two thirds at Pop 100, less on thin, small, far or low-contrast subjects.
//   node --experimental-strip-types apps/aqua-fix/test/seg-restore.test.ts
import assert from "node:assert/strict";
import { analyzeThumbnail, ANALYSIS_W, ANALYSIS_H } from "../src/engine/analyze.ts";
import { applyGrade, segColourK, segRestore, segToneWeight } from "../src/engine/apply.ts";
import { linearToOklab, srgbToLinear } from "../src/engine/color.ts";
import { GRADE_GLSL, GRADE_WGSL, SEG_TONE } from "../src/engine/grade-shader.ts";
import { DEFAULT_SETTINGS, SEG_RESTORE, guideTexture, type UserSettings } from "../src/engine/params.ts";
import { composeSegStrength, engineSubjectMaps, packSegR, SEG_THICK, subjectCloseness, unpackSegR, waterField } from "../src/engine/seg-overlay.ts";

const R = SEG_RESTORE, wx = Math.cos(R.hue), wy = Math.sin(R.hue);
const along = (a: number, b: number) => a * wx + b * wy;

// 1. The stage itself, on Oklab colours.
{
  assert.deepEqual(segRestore(0.4, -0.05, -0.04, 0, 0.5, 1.2), [0.4, -0.05, -0.04], "no AI weight (or Pop 0): untouched");
  // A cast-blue pixel (teal) loses a share of its cast step by step and stays on the water's side of neutral.
  const C0 = Math.hypot(0.05, 0.04);
  let prevC = C0, prevL = 0.4;
  const keptAt: Record<number, number> = {};
  for (const s of [0.5, 1, 1.5, 2]) {
    for (const warmth of [0, 0.5, 1]) {
      const [L, a, b] = segRestore(0.4, -0.05, -0.04, s, warmth, 1);
      assert.ok(along(a, b) < -0.005, `never neutral, never warm (S ${s}, Warmth ${warmth}: ${along(a, b).toFixed(4)} along the warm hue)`);
      assert.ok(Math.hypot(a, b) >= (1 - R.castMax) * (1 - R.warmShare) * C0 - 1e-9, `at least a third of the cast stays (S ${s}, Warmth ${warmth})`);
      assert.ok(L > 0.4 && L < 0.4 + 0.06, `a small lift only (S ${s}: ${L.toFixed(3)})`);
    }
    const [L, a, b] = segRestore(0.4, -0.05, -0.04, s, 0.5, 1);
    const C = Math.hypot(a, b);
    // (The share taken off stops at castMax, reached at Pop 75.)
    assert.ok(s <= 1.5 ? C < prevC - 1e-4 : C <= prevC + 1e-9, `Pop up, cast down (S ${s}: ${C.toFixed(4)} vs ${prevC.toFixed(4)})`);
    assert.ok(L > prevL, `Pop up, lighter (S ${s}: ${L.toFixed(3)})`);
    keptAt[s] = C / C0;
    prevC = C; prevL = L;
  }
  // The owner's target: Pop 50 takes a third to a half of the cast, Pop 100 at most about two thirds.
  // (At full weight, deep inside a close subject; a whole animal, with its feathered rim, loses less: section 3.)
  assert.ok(keptAt[1] >= 0.45 && keptAt[1] <= 0.67, `Pop 50 keeps ${(keptAt[1] * 100).toFixed(0)}% of the cast`);
  assert.ok(keptAt[2] >= 0.32 && keptAt[2] < keptAt[1] - 0.05, `Pop 100 keeps ${(keptAt[2] * 100).toFixed(0)}% of the cast`);
  // Warmth 0: a share of the cast goes, nothing is added.
  const [, a0, b0] = segRestore(0.4, -0.05, -0.04, 2, 0, 1);
  assert.ok(Math.abs(Math.hypot(a0, b0) - (1 - R.castMax) * C0) < 1e-9 && Math.abs(a0 * -0.04 - b0 * -0.05) < 1e-9, "Warmth off: the hue is kept");
  // The colour share (the mask's edge, a thin / small / far subject): none of the colour at 0, the lift and the
  // local contrast as before.
  const full = segRestore(0.4, -0.05, -0.04, 1, 0.5, 1.2), part = segRestore(0.4, -0.05, -0.04, 1, 0.5, 1.2, 0, R.farKeep), none = segRestore(0.4, -0.05, -0.04, 1, 0.5, 1.2, 0, 0);
  assert.ok(Math.abs(none[1] + 0.05) < 1e-9 && Math.abs(none[2] + 0.04) < 1e-9 && none[0] === full[0], "colour share 0: the colour is the plain grade's");
  assert.ok(Math.hypot(part[1], part[2]) > Math.hypot(full[1], full[2]) + 0.005 && Math.hypot(part[1], part[2]) < C0 - 0.003, `a far subject keeps more of the cast (${(Math.hypot(part[1], part[2]) / C0).toFixed(2)} vs ${(Math.hypot(full[1], full[2]) / C0).toFixed(2)})`);
  // segColourK: the edge feather over the mask's read-back distance × the subject's closeness.
  const at = (d: number, close?: number): number[] => [-1, 1, 0.5 + d / (2 * SEG_TONE.alphaR), 1, ...(close === undefined ? [] : [close])];
  assert.equal(segColourK(at(0)), 0, "nothing on the contour");
  assert.equal(segColourK(at(-2)), 0, "nothing outside the mask");
  assert.equal(segColourK(at(R.edge)), 1, "whole from `edge` px inside a close subject");
  assert.ok(R.edge > SEG_TONE.rampIn, "the colour fades in over more of the mask than the tone does");
  assert.ok(Math.abs(segColourK(at(SEG_TONE.alphaR, 0)) - R.farKeep) < 1e-9, "a far subject gets the farKeep share, however deep");
  assert.ok(Math.abs(segColourK(at(SEG_TONE.alphaR, 0.5)) - (R.farKeep + 1) / 2) < 1e-9);
  for (let d = 0.25; d <= SEG_TONE.alphaR; d += 0.25) assert.ok(segColourK(at(d)) >= segColourK(at(d - 0.25)) - 1e-9 && segColourK(at(d)) - segColourK(at(d - 0.25)) < 0.2, `no step in the colour share (d ${d})`);
  // The closeness rides in R next to the water's L (or its −1 / SEG_THICK): packed and unpacked without loss.
  for (const r of [-1, 0, 0.37, 1, SEG_THICK]) for (const c of [0, 0.25, 0.5, 1]) {
    const [r1, c1] = unpackSegR(packSegR(r, c));
    assert.ok(Math.abs(r1 - r) < 1e-5 && c1 === c, `pack ${r} / ${c} -> ${r1} / ${c1}`);
  }
  assert.equal(packSegR(0.37, 0), 0.37, "closeness 0 leaves R as it was");
  // An already warm subject (an orange fish) keeps its colour: no extra saturation.
  const [, af, bf] = segRestore(0.6, 0.08, 0.1, 2, 1, 1);
  assert.ok(Math.abs(af - 0.08) < 1e-9 && Math.abs(bf - 0.1) < 1e-9, "a warm subject is not saturated further");
  // A green or magenta pixel is not "cool": its chroma stays (only the warm floor may add along the warm hue).
  const gx = -wy * 0.06, gy = wx * 0.06;
  const [, ag, bg] = segRestore(0.5, gx, gy, 2, 0, 1);
  assert.ok(Math.abs(ag - gx) < 1e-9 && Math.abs(bg - gy) < 1e-9, "a hue across the warm axis keeps its chroma");
  // White spots stay white, blacks stay neutral.
  const [, aw, bw] = segRestore(0.98, 0, 0, 2, 1, 1), [, ak, bk] = segRestore(0.05, 0, 0, 2, 1, 1);
  assert.ok(Math.hypot(aw, bw) < 1e-6 && Math.hypot(ak, bk) < 1e-6, "no warmth on highlights or blacks");
  // Local contrast: a spot lighter than its neighbourhood gets lighter, the back around it darker; clamped.
  const up = segRestore(0.5, 0, 0, 1, 0, 1.3, 1)[0], dn = segRestore(0.5, 0, 0, 1, 0, 0.9, 1)[0], cap = segRestore(0.5, 0, 0, 1, 0, 50, 1)[0];
  assert.ok(up > 0.5 && dn < 0.5 && Math.abs(cap - 0.5 * R.rMax ** R.detail) < 1e-9, `local contrast (${up.toFixed(3)} / ${dn.toFixed(3)})`);
  // The lift makes up what Subject pop's own lift has not given: nothing on top of a full lift, all of it after a deepening.
  assert.equal(segRestore(0.4, 0, 0, 1, 0, 1, R.lift)[0], 0.4, "already lifted: no more");
  assert.ok(segRestore(0.4, 0, 0, 1, 0, 1, -0.05)[0] > segRestore(0.4, 0, 0, 1, 0, 1, 0)[0], "a deepened subject is brought back up");
  for (const L of [0, 0.2, 0.5, 0.8, 1]) { const l = segRestore(L, 0, 0, 2, 1, R.rMax, -0.2)[0]; assert.ok(l >= L - 1e-9 && l <= 1.25, `L ${L} -> ${l.toFixed(3)}`); }
  // The upper half of the Pop slider (x = the AI weight × (multiplier − 1): 0 up to Pop 50, 1 at Pop 100) bites:
  // mostly more local contrast (the base terms alone stop growing: castMax is reached at Pop 75), a little more of
  // the cast off and a little more lift. Still the animal in the scene's light: on the water's side of neutral, at
  // least a quarter of its cast kept, no big lift.
  assert.deepEqual(segRestore(0.4, -0.05, -0.04, 1, 0.5, 1.2, 0, 1, 0), segRestore(0.4, -0.05, -0.04, 1, 0.5, 1.2), "Pop 50 and below: the tuned look, untouched");
  const x0 = segRestore(0.4, -0.05, -0.04, 2, 0.5, 1.3, 0, 1, 0), x1 = segRestore(0.4, -0.05, -0.04, 2, 0.5, 1.3, 0, 1, 1), bd = segRestore(0.4, -0.05, -0.04, 2, 0.5, 0.8, 0, 1, 1), bd0 = segRestore(0.4, -0.05, -0.04, 2, 0.5, 0.8, 0, 1, 0);
  assert.ok(x1[0] > x0[0] + 0.04 && bd[0] < bd0[0] - 0.03, `Pop 100: spots clearly lighter (${x0[0].toFixed(3)} -> ${x1[0].toFixed(3)}), the back around them darker (${bd0[0].toFixed(3)} -> ${bd[0].toFixed(3)})`);
  for (const warmth of [0, 0.5, 1]) {
    const [L, a, b] = segRestore(0.4, -0.05, -0.04, 2, warmth, 1, 0, 1, 1);
    assert.ok(along(a, b) < -0.004, `boosted: never neutral, never warm (Warmth ${warmth}: ${along(a, b).toFixed(4)})`);
    assert.ok(Math.hypot(a, b) >= 0.25 * C0, `boosted: a quarter of the cast stays (Warmth ${warmth}: ${((Math.hypot(a, b) / C0) * 100).toFixed(0)}%)`);
    assert.ok(L > 0.4 && L < 0.4 + 0.07, `boosted: still a small lift on a flat patch (${L.toFixed(3)})`);
  }
  for (const L of [0, 0.2, 0.5, 0.8, 1]) { const l = segRestore(L, 0, 0, 2, 1, R.rMax, 0, 1, 1)[0]; assert.ok(l >= L - 1e-9 && l <= 1.6 * L + 0.05, `boosted L ${L} -> ${l.toFixed(3)}`); }
}

// 2. The AI tone weight: nothing at Pop 0, full from a low Pop; nothing on or outside the contour.
{
  const inside: [number, number, number, number] = [-1, 1, 1, 1], contour: [number, number, number, number] = [-1, 1, 0.5, 1];
  const lab: [number, number, number] = [0.5, 0, 0];
  assert.equal(segToneWeight(inside, lab, 1, 0, 0, 0), 0, "Pop 0: no AI tone at all");
  assert.equal(segToneWeight(inside, lab, 1, 0, 0, 1), 1, "Pop 50: full");
  assert.equal(segToneWeight(inside, lab, 1, 0, 0, 0.25), 1, "full from Pop 12");
  assert.equal(segToneWeight(contour, lab, 1, 0, 0, 2), 0, "nothing on the contour");
  assert.equal(segToneWeight([-1, 1, 0.2, 1], lab, 1, 0, 0, 2), 0, "nothing outside it");
  assert.equal(segToneWeight([-1, 1, 1, 0], lab, 1, 0, 0, 2), 0, "no ML weight: nothing");
  const half = segToneWeight([-1, 1, 1, (SEG_TONE.popLo + SEG_TONE.popHi) / 2], lab, 1, 0, 0, 1);
  assert.ok(half > 0.3 && half < 0.7, `an unsure track is toned less (${half.toFixed(2)})`);
  assert.equal(segToneWeight([-1, 0.5, 1, 1], lab, 1, 0, 0, 1), 0.5, "the regional trust scales it");
}

// 3. A whole frame through the CPU reference: a dark, cast-blue animal with light spots in teal water (the ray).
{
  const W = 160, H = 90, px = new Uint8ClampedArray(W * H * 4);
  const X0 = 50, X1 = 110, Y0 = 30, Y1 = 60;
  const isSub = (x: number, y: number) => x >= X0 && x < X1 && y >= Y0 && y < Y1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const spot = isSub(x, y) && x % 6 === 2 && y % 6 === 2;
    // Water: a vertical gradient (lit from above); the animal darker, its spots lighter; no red anywhere.
    const c = spot ? [40, 170, 175] : isSub(x, y) ? [4, 92, 100] : [6, 150 - y * 0.4, 160 - y * 0.3];
    px.set([c[0], c[1], c[2], 255], (y * W + x) * 4);
  }
  // Analysis on the frame resized to the analysis grid (nearest).
  const th = new Uint8ClampedArray(ANALYSIS_W * ANALYSIS_H * 4);
  for (let y = 0; y < ANALYSIS_H; y++) for (let x = 0; x < ANALYSIS_W; x++) {
    const s = (Math.min(H - 1, Math.floor(((y + 0.5) / ANALYSIS_H) * H)) * W + Math.min(W - 1, Math.floor(((x + 0.5) / ANALYSIS_W) * W))) * 4;
    th.set(px.subarray(s, s + 4), (y * ANALYSIS_W + x) * 4);
  }
  const an = analyzeThumbnail(th, ANALYSIS_W, ANALYSIS_H);
  // The AI overlay on the frame's own grid: the mask's signed distance as the alpha, a sure track.
  const alpha = new Float32Array(W * H), near = new Float32Array(W * H).fill(1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = Math.max(X0 - x, x - (X1 - 1)), dy = Math.max(Y0 - y, y - (Y1 - 1));
    const d = dx <= 0 && dy <= 0 ? Math.min(-dx, -dy) + 0.5 : -(Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - 0.5);
    alpha[y * W + x] = Math.min(1, Math.max(0, 0.5 + d / (2 * SEG_TONE.alphaR)));
  }
  const strength = composeSegStrength({ width: W, height: H, alpha, exclude: null, near, depart: null, quality: 1 }, { width: an.depth.width, height: an.depth.height, data: guideTexture(an.depth) });
  const grade = (s: Partial<UserSettings>, ai: boolean) => applyGrade({ params: an.params, settings: { ...DEFAULT_SETTINGS, vivid: 1, ...s }, depth: an.depth, clahe: an.clahe, ...(ai ? { seg: { strength, popDir: -1 } } : {}) }, px, W, H);
  const off = grade({ subjectPop: false }, false);
  const diff = (a: Uint8ClampedArray, b: Uint8ClampedArray, where: (x: number, y: number) => boolean) => {
    let s = 0, n = 0, max = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (where(x, y)) {
      const i = (y * W + x) * 4, d = (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3;
      s += d; n++; max = Math.max(max, d);
    }
    return { mean: s / n, max };
  };
  const core = (x: number, y: number) => x >= X0 + 6 && x < X1 - 6 && y >= Y0 + 6 && y < Y1 - 6;
  const outside = (x: number, y: number) => !isSub(x, y);
  const p0 = grade({ subjectPop: true, subjectPopStrength: 0 }, true), p50 = grade({ subjectPop: true, subjectPopStrength: 0.5 }, true), p100 = grade({ subjectPop: true, subjectPopStrength: 1 }, true);
  assert.equal(diff(off, p0, () => true).max, 0, "Pop 0 is the plain grade, to the code value");
  const d50 = diff(off, p50, core).mean, d100 = diff(off, p100, core).mean;
  // (To see, not to jump at: the first restore changed this subject by 7% of full scale and read as a sticker.)
  assert.ok(d50 > 0.02 * 255 && d50 < 0.06 * 255, `Pop 50 is there to see on the subject, and no more (${((d50 / 255) * 100).toFixed(1)}% of full scale)`);
  assert.ok(d100 > 1.2 * d50, `Pop 100 is clearly more than Pop 50 (${((d100 / 255) * 100).toFixed(1)}% vs ${((d50 / 255) * 100).toFixed(1)}%)`);
  for (const [name, p] of [["50", p50], ["100", p100]] as const) assert.equal(diff(off, p, outside).max, 0, `Pop ${name}: the water outside the mask is untouched`);
  // The feather: the outermost ring of the mask moves less than the ring 2 px in, which moves less than the core (no step, no halo).
  const ring = (k: number) => (x: number, y: number) => isSub(x, y) && Math.min(x - X0, X1 - 1 - x, y - Y0, Y1 - 1 - y) === k;
  const r0 = diff(off, p100, ring(0)).mean, r2 = diff(off, p100, ring(2)).mean;
  assert.ok(r0 < 0.5 * r2 && r2 <= d100 * 1.2, `feathered edge (ring 0: ${r0.toFixed(1)}, ring 2: ${r2.toFixed(1)}, core: ${d100.toFixed(1)})`);
  // Colour: the back loses a share of its cast (red up) and stays in the scene's light: on the water's side of
  // neutral, its hue the plain grade's, its lightness too. It used to end near neutral (the grey-brown sticker).
  const mean = (p: Uint8ClampedArray, spot: boolean) => {
    const s = [0, 0, 0]; let n = 0;
    for (let y = Y0 + 6; y < Y1 - 6; y++) for (let x = X0 + 6; x < X1 - 6; x++) if ((x % 6 === 2 && y % 6 === 2) === spot) { for (let c = 0; c < 3; c++) s[c] += p[(y * W + x) * 4 + c]; n++; }
    return s.map((v) => v / n);
  };
  const b0 = mean(off, false), b50 = mean(p50, false), b1 = mean(p100, false), s0 = mean(off, true), s1 = mean(p100, true);
  const lab = (c: number[]) => linearToOklab(srgbToLinear(c[0] / 255), srgbToLinear(c[1] / 255), srgbToLinear(c[2] / 255));
  const [wL, wa, wb] = lab(b0), C0 = Math.hypot(wa, wb), hue = (a: number, b: number) => (Math.atan2(b, a) * 180) / Math.PI;
  assert.ok(b1[0] > b50[0] && b50[0] > b0[0], `the back gets some red back (${b0.map(Math.round)} -> ${b50.map(Math.round)} -> ${b1.map(Math.round)})`);
  for (const [name, c, lo, hi] of [["50", b50, 0.45, 0.85], ["100", b1, 0.27, 0.7]] as const) { // (0.27: the tone target's shadow toe leaves this dark back a little lighter, and its plain-grade chroma reads 3 points higher; the restore itself is unchanged)
    const [L, a, b] = lab(c), kept = Math.hypot(a, b) / C0;
    assert.ok(kept >= lo && kept <= hi, `Pop ${name}: ${(kept * 100).toFixed(0)}% of the back's cast is kept (a share goes, never all)`);
    assert.ok(along(a, b) < -0.01, `Pop ${name}: the back stays on the water's side of neutral (${along(a, b).toFixed(3)})`);
    assert.ok(Math.abs(((hue(a, b) - hue(wa, wb) + 540) % 360) - 180) < 15, `Pop ${name}: its hue is the plain grade's (${hue(a, b).toFixed(0)}° vs ${hue(wa, wb).toFixed(0)}°)`);
    assert.ok(Math.abs(L - wL) < 0.04, `Pop ${name}: its lightness stays close to the plain grade's (${L.toFixed(3)} vs ${wL.toFixed(3)})`);
  }
  const [, sa, sb] = lab(s1);
  assert.ok(along(sa, sb) < 0, `the spots are not warmed past neutral (${along(sa, sb).toFixed(3)})`);
  const lum = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  assert.ok(lum(s1) - lum(b1) > lum(s0) - lum(b0), `the spots stand out more from the back (${(lum(s1) - lum(b1)).toFixed(1)} vs ${(lum(s0) - lum(b0)).toFixed(1)})`);
  // The engine's own (basic) masks never get the restore.
  const basic = grade({ subjectPop: true, subjectPopStrength: 1 }, false);
  assert.ok(diff(off, basic, core).mean < 0.5 * d100, "the restore is the AI mask's alone");
}

// 3b. Far, veiled subjects get a share of the colour only: the closeness is how far the animal stands out from the
// water around it on the analysis guide (one value per animal), packed in R; the tone's own channels are untouched.
{
  const W = 160, H = 90, X0 = 60, X1 = 100, Y0 = 35, Y1 = 55;
  const isSub = (x: number, y: number) => x >= X0 && x < X1 && y >= Y0 && y < Y1;
  const frame = (sub: number[]) => {
    const px = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = isSub(x, y) ? sub : [6, 150 - y * 0.4, 160 - y * 0.3]; px.set([c[0], c[1], c[2], 255], (y * W + x) * 4); }
    const th = new Uint8ClampedArray(ANALYSIS_W * ANALYSIS_H * 4);
    for (let y = 0; y < ANALYSIS_H; y++) for (let x = 0; x < ANALYSIS_W; x++) {
      const s = (Math.min(H - 1, Math.floor(((y + 0.5) / ANALYSIS_H) * H)) * W + Math.min(W - 1, Math.floor(((x + 0.5) / ANALYSIS_W) * W))) * 4;
      th.set(px.subarray(s, s + 4), (y * ANALYSIS_W + x) * 4);
    }
    const an = analyzeThumbnail(th, ANALYSIS_W, ANALYSIS_H);
    return { px, an, guide: { width: an.depth.width, height: an.depth.height, data: guideTexture(an.depth) } };
  };
  const alpha = new Float32Array(W * H), near = new Float32Array(W * H).fill(1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = Math.max(X0 - x, x - (X1 - 1)), dy = Math.max(Y0 - y, y - (Y1 - 1));
    const d = dx <= 0 && dy <= 0 ? Math.min(-dx, -dy) + 0.5 : -(Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - 0.5);
    alpha[y * W + x] = Math.min(1, Math.max(0, 0.5 + d / (2 * SEG_TONE.alphaR)));
  }
  const overlay = { width: W, height: H, alpha, exclude: null, near, depart: null, quality: 1 };
  const mid = ((Y0 + Y1) >> 1) * W + ((X0 + X1) >> 1), wy0 = 150 - 45 * 0.4, wy1 = 160 - 45 * 0.3;
  // The same animal close (dark against the water) and far away (most of the way to the water's colour).
  const close = frame([4, 92, 100]), far = frame([6, Math.round(wy0 - 12), Math.round(wy1 - 12)]);
  const cClose = subjectCloseness(overlay, waterField(close.guide, overlay)!.sep), cFar = subjectCloseness(overlay, waterField(far.guide, overlay)!.sep);
  assert.equal(cClose[mid], 1, "an animal that stands out from its water is close");
  assert.ok(cFar[mid] < 0.2, `one that hardly stands out is far (${cFar[mid].toFixed(2)})`);
  assert.equal(cClose[0], 0, "nothing off the mask");
  let same = true;
  for (let i = 0; i < W * H; i++) if (alpha[i] > 0.5 && cFar[i] !== cFar[mid]) same = false;
  assert.ok(same, "one value for the whole animal: no patches");
  assert.equal(subjectCloseness(overlay, null)[mid], 1, "nothing to compare with: as close");
  const sClose = composeSegStrength(overlay, close.guide), sFar = composeSegStrength(overlay, far.guide), sNone = composeSegStrength(overlay, null);
  assert.equal(unpackSegR(sClose.data[mid * 4])[1], 1);
  assert.ok(unpackSegR(sFar.data[mid * 4])[1] < 0.2);
  assert.deepEqual(unpackSegR(sNone.data[mid * 4]).slice(0, 2), [-1, 1], "no guide: no water test, the colour as for a close subject");
  for (let i = 0; i < W * H; i++) for (const c of [2, 3]) assert.equal(sFar.data[i * 4 + c], sClose.data[i * 4 + c], "the mask's distance and the ML weight do not depend on the closeness");
  // Graded: the far animal keeps clearly more of its cast than the same mask on the close one, at the same Pop.
  const kept = (f: typeof close, strength: typeof sClose) => {
    const g = (ai: boolean) => applyGrade({ params: f.an.params, settings: { ...DEFAULT_SETTINGS, vivid: 1, subjectPop: ai, subjectPopStrength: 1 }, depth: f.an.depth, clahe: f.an.clahe, ...(ai ? { seg: { strength, popDir: -1 } } : {}) }, f.px, W, H);
    const off = g(false), on = g(true), C = (p: Uint8ClampedArray) => { const [, a, b] = linearToOklab(srgbToLinear(p[mid * 4] / 255), srgbToLinear(p[mid * 4 + 1] / 255), srgbToLinear(p[mid * 4 + 2] / 255)); return Math.hypot(a, b); };
    return C(on) / C(off);
  };
  const kClose = kept(close, sClose), kFar = kept(far, sFar);
  assert.ok(kFar > kClose + 0.15 && kFar < 0.98, `Pop 100: the far animal keeps ${(kFar * 100).toFixed(0)}% of its cast, the close one ${(kClose * 100).toFixed(0)}%`);
  console.log(`seg-restore: Pop 100 keeps ${(kClose * 100).toFixed(0)}% of a close animal's cast, ${(kFar * 100).toFixed(0)}% of a far one's`);
}

// 3c. Off the AI's mask an AI frame is the plain grade's. In the reference: section 3 (the water outside the mask
// is untouched, to the code value). In the engine the maps must also be the plain grade's: Subject pop makes them
// follow the picture at the subject's pace (guide, backdrop surface, led animals) only while its own masks tone the
// frame; with an AI overlay those steps moved the whole picture (~0.4% in green over the owner's AI export).
{
  assert.equal(engineSubjectMaps(true, false), true, "Subject pop with the engine's masks: its maps follow fast");
  assert.equal(engineSubjectMaps(true, true), false, "an AI overlay on the frame: the maps are the plain grade's");
  assert.equal(engineSubjectMaps(false, false), false);
  assert.equal(engineSubjectMaps(false, true), false);
}

// 4. WebGL2 and WebGPU carry the same stage and constants as this reference.
for (const [name, code] of [["GLSL", GRADE_GLSL], ["WGSL", GRADE_WGSL]] as const) {
  for (const fn of ["segRestore(", "segColourK(an)", "guideLum(", "SR_POP_GATE * ", "SR_WARM_SHARE + SR_X_WARM_SHARE * x) * max(0.0, -dot(ab, wh))", "* cool * ck"]) assert.ok(code.includes(fn), `${name} has ${fn}`);
  assert.ok(!code.includes("SR_WARM_MAX"), `${name}: no warm chroma floor any more`);
  const c = (k: string, v: number, d = 4) => assert.ok(new RegExp(`${k}(: f32)? = ${v.toFixed(d).replace(".", "\\.")};`).test(code), `${name} ${k} = ${v.toFixed(d)}`);
  c("SR_CAST", R.cast); c("SR_CAST_MAX", R.castMax); c("SR_WARM", R.warm); c("SR_WARM_SHARE", R.warmShare); c("SR_FAR_KEEP", R.farKeep); c("SR_DETAIL", R.detail); c("SR_LIFT", R.lift);
  c("SR_X_WARM", R.boostWarm); c("SR_X_WARM_SHARE", R.boostWarmShare); c("SR_X_DETAIL", R.boostDetail); c("SR_X_LIFT", R.boostLift);
  assert.ok(code.includes("segS * max(0.0, 1.0 - 1.0 / max(p[23].w, 1.0))"), `${name}: the boost is the AI weight × (Pop multiplier − 1), 0 up to Pop 50`);
  c("SR_DARK_LO", R.darkLo); c("SR_DARK_HI", R.darkHi); c("SR_POP_GATE", R.popGate); c("SR_COS", wx, 6); c("SR_SIN", wy, 6);
}

console.log("seg-restore: ok");
