// AI subject restore (params.ts SEG_RESTORE; apply.ts segRestore / grade-shader segRestore): with a real AI mask on
// the frame the subject's correction is plain to see, scales with the Pop slider (nothing at 0), stays inside the
// mask and never turns the subject orange.
// The user's eagle-ray clip (12 Nov): with the AI mask the ray changed by under 1% of the frame, and Pop 100 looked
// like Pop 50.
//   node --experimental-strip-types apps/aqua-fix/test/seg-restore.test.ts
import assert from "node:assert/strict";
import { analyzeThumbnail, ANALYSIS_W, ANALYSIS_H } from "../src/engine/analyze.ts";
import { applyGrade, segRestore, segToneWeight } from "../src/engine/apply.ts";
import { linearToOklab, srgbToLinear } from "../src/engine/color.ts";
import { GRADE_GLSL, GRADE_WGSL, SEG_TONE } from "../src/engine/grade-shader.ts";
import { DEFAULT_SETTINGS, SEG_RESTORE, guideTexture, type UserSettings } from "../src/engine/params.ts";
import { composeSegStrength } from "../src/engine/seg-overlay.ts";

const R = SEG_RESTORE, wx = Math.cos(R.hue), wy = Math.sin(R.hue);
const along = (a: number, b: number) => a * wx + b * wy;

// 1. The stage itself, on Oklab colours.
{
  assert.deepEqual(segRestore(0.4, -0.05, -0.04, 0, 0.5, 1.2), [0.4, -0.05, -0.04], "no AI weight (or Pop 0): untouched");
  // A cast-blue pixel (teal) loses its cast step by step and ends a warm neutral, never orange.
  let prevC = Math.hypot(0.05, 0.04), prevL = 0.4;
  for (const s of [0.5, 1, 1.5, 2]) {
    const [L, a, b] = segRestore(0.4, -0.05, -0.04, s, 0.5, 1);
    const cool = Math.hypot(a - wx * Math.max(0, along(a, b)), b - wy * Math.max(0, along(a, b)));
    // (The share taken off stops at castMax, reached a little past Pop 50.)
    assert.ok(s <= 1 ? cool < prevC - 1e-4 : cool <= prevC + 1e-9, `Pop up, cast down (S ${s}: ${cool.toFixed(4)} vs ${prevC.toFixed(4)})`);
    assert.ok(L > prevL, `Pop up, lighter (S ${s}: ${L.toFixed(3)})`);
    assert.ok(along(a, b) <= R.warmMax + 1e-6 && Math.hypot(a, b) < 0.06, `never orange (S ${s}: chroma ${Math.hypot(a, b).toFixed(3)})`);
    prevC = cool; prevL = L;
  }
  const [, a2, b2] = segRestore(0.4, -0.05, -0.04, 2, 0.5, 1);
  assert.ok(along(a2, b2) > 0.01, `at Pop 100 the red is back: the colour sits on the warm side (${along(a2, b2).toFixed(3)})`);
  // Warmth 0: cleared, not warmed.
  const [, a0, b0] = segRestore(0.4, -0.05, -0.04, 2, 0, 1);
  assert.ok(along(a0, b0) <= 0 && Math.hypot(a0, b0) < 0.012, "Warmth off: the cast goes, nothing is added");
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
  assert.ok(d50 > 0.04 * 255, `Pop 50 is plain to see on the subject (${((d50 / 255) * 100).toFixed(1)}% of full scale)`);
  assert.ok(d100 > 1.2 * d50, `Pop 100 is clearly more than Pop 50 (${((d100 / 255) * 100).toFixed(1)}% vs ${((d50 / 255) * 100).toFixed(1)}%)`);
  for (const [name, p] of [["50", p50], ["100", p100]] as const) assert.equal(diff(off, p, outside).max, 0, `Pop ${name}: the water outside the mask is untouched`);
  // The feather: the outermost ring of the mask moves less than the ring 2 px in, which moves less than the core (no step, no halo).
  const ring = (k: number) => (x: number, y: number) => isSub(x, y) && Math.min(x - X0, X1 - 1 - x, y - Y0, Y1 - 1 - y) === k;
  const r0 = diff(off, p100, ring(0)).mean, r2 = diff(off, p100, ring(2)).mean;
  assert.ok(r0 < 0.5 * r2 && r2 <= d100 * 1.2, `feathered edge (ring 0: ${r0.toFixed(1)}, ring 2: ${r2.toFixed(1)}, core: ${d100.toFixed(1)})`);
  // Colour: the back is de-blued (red up, blue not), near neutral or a little warm; the spots are light and neutral.
  const mean = (p: Uint8ClampedArray, spot: boolean) => {
    const s = [0, 0, 0]; let n = 0;
    for (let y = Y0 + 6; y < Y1 - 6; y++) for (let x = X0 + 6; x < X1 - 6; x++) if ((x % 6 === 2 && y % 6 === 2) === spot) { for (let c = 0; c < 3; c++) s[c] += p[(y * W + x) * 4 + c]; n++; }
    return s.map((v) => v / n);
  };
  const b0 = mean(off, false), b1 = mean(p100, false), s0 = mean(off, true), s1 = mean(p100, true);
  assert.ok(b1[0] > b0[0] + 10, `the back gets its red back (${b0.map(Math.round)} -> ${b1.map(Math.round)})`);
  const lab = (c: number[]) => linearToOklab(srgbToLinear(c[0] / 255), srgbToLinear(c[1] / 255), srgbToLinear(c[2] / 255));
  const [, ba, bb] = lab(b1), [, sa, sb] = lab(s1), [, wa, wb] = lab(b0);
  assert.ok(Math.hypot(ba, bb) < 0.5 * Math.hypot(wa, wb) && Math.hypot(ba, bb) < 0.06, `the back is near neutral, not blue and not orange (chroma ${Math.hypot(ba, bb).toFixed(3)} from ${Math.hypot(wa, wb).toFixed(3)})`);
  assert.ok(Math.hypot(sa, sb) < 0.06, `the spots are near white (chroma ${Math.hypot(sa, sb).toFixed(3)})`);
  const lum = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  assert.ok(lum(s1) - lum(b1) > lum(s0) - lum(b0), `the spots stand out more from the back (${(lum(s1) - lum(b1)).toFixed(1)} vs ${(lum(s0) - lum(b0)).toFixed(1)})`);
  // The engine's own (basic) masks never get the restore.
  const basic = grade({ subjectPop: true, subjectPopStrength: 1 }, false);
  assert.ok(diff(off, basic, core).mean < 0.5 * d100, "the restore is the AI mask's alone");
}

// 4. WebGL2 and WebGPU carry the same stage and constants as this reference.
for (const [name, code] of [["GLSL", GRADE_GLSL], ["WGSL", GRADE_WGSL]] as const) {
  for (const fn of ["segRestore(", "guideLum(", "SR_POP_GATE * "]) assert.ok(code.includes(fn), `${name} has ${fn}`);
  const c = (k: string, v: number, d = 4) => assert.ok(new RegExp(`${k}(: f32)? = ${v.toFixed(d).replace(".", "\\.")};`).test(code), `${name} ${k} = ${v.toFixed(d)}`);
  c("SR_CAST", R.cast); c("SR_CAST_MAX", R.castMax); c("SR_WARM", R.warm); c("SR_WARM_MAX", R.warmMax); c("SR_DETAIL", R.detail); c("SR_LIFT", R.lift);
  c("SR_DARK_LO", R.darkLo); c("SR_DARK_HI", R.darkHi); c("SR_POP_GATE", R.popGate); c("SR_COS", wx, 6); c("SR_SIN", wy, 6);
}

console.log("seg-restore: ok");
