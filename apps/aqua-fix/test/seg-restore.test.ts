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
import { applyGrade, segColourK, segRestore, segRim, segToneWeight, segWaterL, subjectDeepen, whiteGuard } from "../src/engine/apply.ts";
import { linearToOklab, srgbToLinear } from "../src/engine/color.ts";
import { GRADE_GLSL, GRADE_WGSL, SEG_TONE } from "../src/engine/grade-shader.ts";
import { DEFAULT_SETTINGS, SEG_RESTORE, SUBJECT_DEEP, SUBJECT_CLEAR, SUBJECT_POP, WARM_POP, WHITE_GUARD, guideTexture, type UserSettings } from "../src/engine/params.ts";
import { composeSegStrength, engineSubjectMaps, packSegR, SEG_THICK, subjectCloseness, unpackSegR, waterField } from "../src/engine/seg-overlay.ts";

const R = SEG_RESTORE, wx = Math.cos(R.hue), wy = Math.sin(R.hue);
const along = (a: number, b: number) => a * wx + b * wy;

// 1. The stage itself, on Oklab colours. Second pass of 14 Nov (the owner's freediver in deep blue "turns grey, and a
// ring of water around him"; then the review of the first fix: "sharks still beige-grey, leaked sand orange"): inside
// the outline the colour is never neutralised and never tinted. The subject keeps its own hue and at least its own
// chroma, and pops by light: its lightness moves away from the local water's (up only: a dark blue pushed darker
// leaves the display's gamut and comes back greyer), with local contrast and a little more of its own colour.
{
  const hueOf = (a: number, b: number) => ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  assert.deepEqual(segRestore(0.4, -0.05, -0.04, 0, 1.2), [0.4, -0.05, -0.04], "no AI weight (or Pop 0): untouched");
  for (const [a0, b0] of [[-0.05, -0.04], [-0.02, -0.09], [0.08, 0.1], [0.03, -0.06], [0, 0]]) for (const L of [0.1, 0.3, 0.5, 0.7, 0.95]) for (const s of [0.25, 0.5, 1, 1.5, 2]) for (const t of [-1, -0.4, 0, 0.4, 1]) for (const ck of [0, 0.35, 1]) {
    const x = s > 1 ? s - 1 : 0, [L1, a, b] = segRestore(L, a0, b0, s, 1, ck, x, t), C0 = Math.hypot(a0, b0), C = Math.hypot(a, b);
    assert.ok(C >= C0 - 1e-12, `never less chroma than the plain grade (L ${L}, S ${s}, t ${t}: ${C.toFixed(4)} vs ${C0.toFixed(4)})`);
    assert.ok(C <= C0 * (1 + R.vib + R.boostVib) + 1e-12, "a capped boost");
    if (C0 > 0) assert.ok(Math.abs(((hueOf(a, b) - hueOf(a0, b0) + 540) % 360) - 180) < 1e-6, "the hue is the subject's own: never neutralised, never tinted");
    // Lightness: lighter than the water → lighter; at or under the water's lightness this stage does nothing (what
    // is darker is deepened by subjectDeepen instead: section 1b).
    // (Not in the highlights, hiLo..hiHi: what is bright already is left alone, bright water under a leak too.)
    if (t > 0) assert.ok((L >= R.hiHi ? L1 === L : L1 > L) && L1 - L <= (R.sep * Math.min(1, s) + R.boostSep * x) + 1e-9, `lighter than the water: lifted, by a bounded step (${L} -> ${L1.toFixed(3)})`);
    if (t === 0) assert.equal(L1, L);
    if (t < 0) assert.ok(L1 === L && C === C0, "darker than the water: not lifted (a lifted black wetsuit went a milky navy)");
  }
  // More Pop, more separation; the slider's upper half adds to it.
  let prev = 0.5;
  for (const s of [0.5, 1, 1.5, 2]) { const l = segRestore(0.5, -0.05, -0.04, s, 1, 1, s > 1 ? s - 1 : 0, 1)[0]; assert.ok(l > prev + 0.004, `Pop up, more lift (S ${s}: ${l.toFixed(3)})`); prev = l; }
  // The chroma boost: by the colour share (the edge feather, a far subject), by how far the pixel's lightness is
  // from the water's (water under a leaked outline is not made bluer), not on an already saturated colour.
  const cOf = (o: number[]) => Math.hypot(o[1], o[2]), C0 = Math.hypot(0.05, 0.04);
  assert.ok(cOf(segRestore(0.5, -0.05, -0.04, 1, 1, 1, 0, 1)) > 1.15 * C0, "a clear subject: its own colour, more of it");
  assert.ok(Math.abs(cOf(segRestore(0.5, -0.05, -0.04, 1, 1, 0, 0, 1)) - C0) < 1e-12, "colour share 0 (the contour): the plain grade's chroma");
  assert.ok(Math.abs(cOf(segRestore(0.5, -0.05, -0.04, 1, 1, 1, 0, 0)) - C0) < 1e-12, "at the water's lightness: the plain grade's chroma");
  assert.ok(cOf(segRestore(0.5, -0.05, -0.04, 1, 1, R.farKeep, 0, 1)) < cOf(segRestore(0.5, -0.05, -0.04, 1, 1, 1, 0, 1)), "a far subject gets less of it");
  assert.ok(Math.abs(cOf(segRestore(0.5, -0.2, -0.16, 2, 1, 1, 1, 1)) - Math.hypot(0.2, 0.16)) < 1e-12, "a saturated colour is not pushed");
  // Local contrast: a spot lighter than its neighbourhood gets lighter; nothing is darkened; clamped.
  // (By how far the pixel stands above the water, like the lift: a patch of sand under a leaked outline is not sharpened into a blotch.)
  const flat = segRestore(0.5, 0, 0, 1, 1, 1, 0, 1)[0], up = segRestore(0.5, 0, 0, 1, 1.3, 1, 0, 1)[0], dn = segRestore(0.5, 0, 0, 1, 0.95, 1, 0, 1)[0], cap = segRestore(0.5, 0, 0, 1, 50, 1, 0, 1)[0];
  assert.ok(up > flat && dn <= flat + 1e-12 && cap > up && cap < flat * R.rMax ** R.detail, `local contrast (${up.toFixed(3)} / ${dn.toFixed(3)})`);
  assert.equal(segRestore(0.5, 0, 0, 1, 1.3, 1, 0, 0)[0], 0.5, "none at the water's lightness");
  // The shoulder: all the lightening together never takes more than `head` of the headroom to white.
  for (const L of [0.3, 0.6, 0.8, 0.95]) assert.ok(segRestore(L, 0, 0, 2, 50, 1, 1, 1)[0] <= L + R.head * (1 - L) + 1e-9, `no clipped highlight (L ${L})`);
  assert.ok(R.rMin >= 0.9, "next to no darkening side in the local contrast (gamut again)");
  for (const L of [0, 0.2, 0.5, 0.8, 1]) { const l = segRestore(L, 0, 0, 2, R.rMax, 1, 1, 1)[0]; assert.ok(l >= L - 1e-9 && l <= 1.6 * L + 0.12, `L ${L} -> ${l.toFixed(3)}`); }
  // 1b. What is darker than the water is deepened (SUBJECT_DEEP): lightness down, the chroma with it (the hue and
  // the saturation kept: a richer black, inside the gamut), a toe so that what is black already is not crushed.
  {
    const D = SUBJECT_DEEP;
    assert.deepEqual(subjectDeepen(0.3, -0.03, -0.06, 0, 1), [0.3, -0.03, -0.06], "no weight: untouched");
    for (const L of [0.05, 0.15, 0.3, 0.5]) for (const w of [0.3, 1, 2]) for (const lr of [0.5, 1, 2]) {
      const [L1, a, b] = subjectDeepen(L, -0.03, -0.06, w, lr);
      assert.ok(L1 >= L * (1 - D.k * D.wMax) * D.rMin ** (D.detail * D.wMax) - 1e-9 && L1 <= L * D.rMax ** (D.detail * D.wMax) * (1 + D.spot * D.wMax) + 1e-9, `bounded (${L} -> ${L1.toFixed(3)})`);
      assert.ok(Math.abs(a / -0.03 - b / -0.06) < 1e-9, "the hue is kept");
      if (lr === 1) assert.ok(L1 <= L && Math.abs(Math.hypot(a, b) / Math.hypot(0.03, 0.06) - (L1 / L) ** D.chroma) < 1e-9, "darker, the chroma with the lightness (saturation kept)");
    }
    const dk = (L: number) => 1 - subjectDeepen(L, 0, 0, 1, 1)[0] / L;
    assert.ok(dk(0.3) > 0.2 && dk(0.3) <= D.k + 1e-9, `a milky navy comes down clearly (${(dk(0.3) * 100).toFixed(0)}%)`);
    assert.ok(dk(D.toeLo + 0.25 * (D.toeHi - D.toeLo)) < 0.5 * dk(0.3) && dk(D.toeHi) <= dk(0.3) + 1e-9, "what is black already is not crushed (the toe)");
    assert.ok(subjectDeepen(0.3, 0, 0, 0.5, 1)[0] > subjectDeepen(0.3, 0, 0, 1, 1)[0], "by the weight");
    assert.ok(subjectDeepen(0.3, 0, 0, 1, D.spotHi)[0] > 0.3, "a spot clearly lighter than its neighbourhood is lifted, not deepened with the body");
    assert.ok(subjectDeepen(0.3, 0, 0, 1, 1.2)[0] > subjectDeepen(0.3, 0, 0, 1, 1)[0] && subjectDeepen(0.3, 0, 0, 1, 0.9)[0] < subjectDeepen(0.3, 0, 0, 1, 1)[0], "local contrast both ways");
  }
  // segColourK: the edge feather over the mask's read-back distance × the subject's closeness.
  const at = (d: number, close?: number, r = -1): number[] => [r, 1, 0.5 + d / (2 * SEG_TONE.alphaR), 1, ...(close === undefined ? [] : [close, 0])];
  assert.equal(segColourK(at(0)), 0, "nothing on the contour");
  assert.equal(segColourK(at(-2)), 0, "nothing outside the mask");
  assert.equal(segColourK(at(R.edge)), 1, "whole from `edge` px inside a close subject");
  assert.ok(R.edge > SEG_TONE.rampIn, "the colour fades in over more of the mask than the tone does");
  assert.ok(Math.abs(segColourK(at(SEG_TONE.alphaR, 0)) - R.farKeep) < 1e-9, "a far subject gets the farKeep share, however deep");
  for (let d = 0.25; d <= SEG_TONE.alphaR; d += 0.25) assert.ok(segColourK(at(d)) >= segColourK(at(d - 0.25)) - 1e-9 && segColourK(at(d)) - segColourK(at(d - 0.25)) < 0.2, `no step in the colour share (d ${d})`);
  // The closeness rides in R next to the water's L (or its −1 / SEG_THICK + L): packed and unpacked without loss.
  for (const r of [-1, 0, 0.37, 1, SEG_THICK, SEG_THICK + 0.6]) for (const c of [0, 0.25, 0.5, 1]) {
    const [r1, c1] = unpackSegR(packSegR(r, c));
    assert.ok(Math.abs(r1 - r) < 1e-5 && c1 === c, `pack ${r} / ${c} -> ${r1} / ${c1}`);
  }
  assert.equal(packSegR(0.37, 0), 0.37, "closeness 0 leaves R as it was");
  // The rim test: near the contour the restore follows the pixel, so water under an outline that runs wide is left
  // alone. The local water's L rides in R: as it is on thin parts, + SEG_THICK on thick ones.
  assert.equal(segWaterL(at(1, 1, 0.5)), 0.5); assert.ok(Math.abs(segWaterL(at(1, 1, SEG_THICK + 0.5)) - 0.5) < 1e-9); assert.ok(segWaterL(at(1, 1, -1)) < 0);
  for (const r of [0.5, SEG_THICK + 0.5]) {
    assert.equal(segRim(at(1, 1, r), [0.5, -0.05, -0.08], -0.53, -0.848), 0, "water under the contour: none of the restore");
    assert.equal(segRim(at(1, 1, r), [0.5 - R.rimHi, -0.05, -0.08], -0.53, -0.848), 1, "a pixel that departs from the water: all of it");
    assert.equal(segRim(at(SEG_TONE.trustHi, 1, r), [0.5, -0.05, -0.08], -0.53, -0.848), 1, "deep inside the mask rules");
    let pv = 0;
    for (let d = 0; d <= SEG_TONE.alphaR; d += 0.25) { const v = segRim(at(d, 1, r), [0.5, -0.05, -0.08], -0.53, -0.848); assert.ok(v >= pv - 1e-9 && v - pv < 0.25, "no step in the rim"); pv = v; }
  }
  assert.equal(segRim(at(1, 1, -1), [0.5, -0.05, -0.08], -0.53, -0.848), 1, "no water to compare with: the mask rules");
  // The engine's own (Basic) masks: no cast clearing and no warm pull either; a small chroma boost only.
  assert.equal(SUBJECT_CLEAR.k, 0); assert.equal(SUBJECT_CLEAR.cMax, 0); assert.ok(SUBJECT_CLEAR.desat < 0 && SUBJECT_CLEAR.desat >= -0.5);
  assert.equal(WARM_POP.amount, 0, "the warm pull is off");
  assert.equal(SUBJECT_CLEAR.edgeFloor, 0, "no tone on plain water inside the engine's mask");
}

// 1c. White guard (the owner's freediver at 11 s: white fins "turn yellow/beige" with Subjects on). Subjects on puts
// the subject on the object path, whose white balance pushed a bluish-white source past neutral to yellow-green. A
// light pixel that was on the water's side and has crossed to the far side loses that chroma: white gear stays white.
{
  const vx = -0.53, vy = -0.848; // the water's hue (unit): blue
  const G = WHITE_GUARD;
  assert.equal(whiteGuard(0.9, 0.02 * -vx, 0.02 * -vy, 0.025 * vx, 0.025 * vy, vx, vy, 0), 1, "Subjects off: nothing");
  assert.equal(whiteGuard(0.9, 0.02 * -vx, 0.02 * -vy, 0.025 * vx, 0.025 * vy, vx, vy, 1), 0, "a white fin pushed to yellow: back to white");
  assert.equal(whiteGuard(0.9, 0.02 * vx, 0.02 * vy, 0.025 * vx, 0.025 * vy, vx, vy, 1), 1, "still on the water's side: untouched");
  assert.equal(whiteGuard(G.lLo, 0.05 * -vx, 0.05 * -vy, 0.03 * vx, 0.03 * vy, vx, vy, 1), 1, "skin and other midtones keep the colour the balance gives them");
  assert.equal(whiteGuard(0.9, 0.08 * -vx, 0.08 * -vy, 0.06 * -vx, 0.06 * -vy, vx, vy, 1), 1, "a fin that was yellow in the source stays yellow");
  let prev = 1;
  for (let L = G.lLo; L <= G.lHi + 1e-9; L += 0.01) { const v = whiteGuard(L, 0.02 * -vx, 0.02 * -vy, 0.025 * vx, 0.025 * vy, vx, vy, 1); assert.ok(v <= prev + 1e-9 && prev - v < 0.25, "no step over the lightness"); prev = v; }
  for (const code of [GRADE_GLSL, GRADE_WGSL]) for (const s of ["whiteGuard(lab, lab0.yz, p[14].xy, p[22].z)", "WG_CROSS", "SP_WATER_LO"]) assert.ok(code.includes(s), `both shaders carry ${s}`);
  assert.ok(SUBJECT_POP.waterLo > 0.02 && SUBJECT_POP.waterHi > SUBJECT_POP.waterLo, "the engine-mask pop needs the pixel itself to stand off the water");
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
  // (This animal is darker than its water: it is never lifted into it; its back is deepened a little (SUBJECT_DEEP),
  // its light spots stand out more. A subject lighter than its water is lifted clearly: section 1.)
  assert.ok(d50 > 0 && d50 < 0.06 * 255, `Pop 50 leaves a dark animal's back close to the plain grade (${((d50 / 255) * 100).toFixed(1)}% of full scale)`);
  assert.ok(d100 > 1.2 * d50, `Pop 100 is clearly more than Pop 50 (${((d100 / 255) * 100).toFixed(1)}% vs ${((d50 / 255) * 100).toFixed(1)}%)`);
  for (const [name, p] of [["50", p50], ["100", p100]] as const) assert.equal(diff(off, p, outside).max, 0, `Pop ${name}: the water outside the mask is untouched`);
  // The feather: the outermost ring of the mask moves less than the ring 2 px in, which moves less than the core (no step, no halo).
  const ring = (k: number) => (x: number, y: number) => isSub(x, y) && Math.min(x - X0, X1 - 1 - x, y - Y0, Y1 - 1 - y) === k;
  const r0 = diff(off, p100, ring(0)).mean, r2 = diff(off, p100, ring(2)).mean;
  assert.ok(r0 < 0.5 * r2 && r2 <= d100 * 1.2, `feathered edge (ring 0: ${r0.toFixed(1)}, ring 2: ${r2.toFixed(1)}, core: ${d100.toFixed(1)})`);
  // Colour: the animal keeps its own. Hue the plain grade's, chroma not under it (to the display's rounding), back
  // and spots alike: no grey, no beige.
  const mean = (p: Uint8ClampedArray, spot: boolean) => {
    const s = [0, 0, 0]; let n = 0;
    for (let y = Y0 + 6; y < Y1 - 6; y++) for (let x = X0 + 6; x < X1 - 6; x++) if ((x % 6 === 2 && y % 6 === 2) === spot) { for (let c = 0; c < 3; c++) s[c] += p[(y * W + x) * 4 + c]; n++; }
    return s.map((v) => v / n);
  };
  const b0 = mean(off, false), b50 = mean(p50, false), b1 = mean(p100, false), s0 = mean(off, true), s1 = mean(p100, true);
  const lab = (c: number[]) => linearToOklab(srgbToLinear(c[0] / 255), srgbToLinear(c[1] / 255), srgbToLinear(c[2] / 255));
  const hue = (a: number, b: number) => (Math.atan2(b, a) * 180) / Math.PI;
  for (const [name, c, ref] of [["Pop 50 back", b50, b0], ["Pop 100 back", b1, b0], ["Pop 100 spots", s1, s0]] as const) {
    const [L, a, b] = lab(c), [L0, a0, bb0] = lab(ref), kept = Math.hypot(a, b) / Math.hypot(a0, bb0);
    // (A deepened back: the chroma follows the lightness down, so the saturation is the plain grade's; never a grey.)
    assert.ok(kept >= 0.9 * Math.min(1, L / L0) && kept <= 1.6, `${name}: ${(kept * 100).toFixed(0)}% of the plain grade's chroma at ${((L / L0) * 100).toFixed(0)}% of its lightness (the saturation never less)`);
    assert.ok(along(a, b) < -0.01, `${name}: on the water's side of neutral (${along(a, b).toFixed(3)})`);
    assert.ok(Math.abs(((hue(a, b) - hue(a0, bb0) + 540) % 360) - 180) < 8, `${name}: its hue is the plain grade's (${hue(a, b).toFixed(0)}° vs ${hue(a0, bb0).toFixed(0)}°)`);
    assert.ok(Math.abs(L - L0) < 0.2, `${name}: no jump in lightness (${L.toFixed(3)} vs ${L0.toFixed(3)})`);
  }
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
  // Graded: neither loses colour (the plain grade's saturation, chroma over lightness, or more: a dark animal is
  // deepened with its chroma), at the same Pop.
  const kept = (f: typeof close, strength: typeof sClose) => {
    const g = (ai: boolean) => applyGrade({ params: f.an.params, settings: { ...DEFAULT_SETTINGS, vivid: 1, subjectPop: ai, subjectPopStrength: 1 }, depth: f.an.depth, clahe: f.an.clahe, ...(ai ? { seg: { strength, popDir: -1 } } : {}) }, f.px, W, H);
    const off = g(false), on = g(true), C = (p: Uint8ClampedArray) => { const [L, a, b] = linearToOklab(srgbToLinear(p[mid * 4] / 255), srgbToLinear(p[mid * 4 + 1] / 255), srgbToLinear(p[mid * 4 + 2] / 255)); return Math.hypot(a, b) / L; };
    return C(on) / C(off);
  };
  const kClose = kept(close, sClose), kFar = kept(far, sFar);
  assert.ok(kClose >= 0.8 && kFar >= 0.95 && kClose < 1.6 && kFar < 1.6, `Pop 100: the close animal has ${(kClose * 100).toFixed(0)}% of the plain grade's saturation, the far one ${(kFar * 100).toFixed(0)}%`);
  console.log(`seg-restore: Pop 100 leaves ${(kClose * 100).toFixed(0)}% of a close animal's saturation, ${(kFar * 100).toFixed(0)}% of a far one's`);
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
  for (const fn of ["segRestore(", "segColourK(an)", "guideLum(", "SR_POP_GATE * ", "segRim(an, lab0)", "SEG_THICK_R", "sepT", "subjectDeepen(lk, deepW", "SD_TOE_LO", "whiteGuard(lab, lab0.yz, p[14].xy, p[22].z)", "clamp(t, 0.0, 1.0)", "SD_FAR_LIT", "SR_SEP_CLOSE", "WP_AMOUNT * "]) assert.ok(code.includes(fn), `${name} has ${fn}`);
  for (const gone of ["SR_CAST", "SR_WARM", "segWarmK"]) assert.ok(!code.includes(gone), `${name}: no ${gone} any more (no cast cut, no warm pull under an AI mask)`);
  const c = (k: string, v: number, d = 4) => assert.ok(new RegExp(`${k}(: f32)? = ${v.toFixed(d).replace(".", "\\.")};`).test(code), `${name} ${k} = ${v.toFixed(d)}`);
  c("SR_SEP", R.sep); c("SR_X_SEP", R.boostSep); c("SR_SEP_RANGE", R.sepRange); c("SR_SEP_CLOSE", R.sepClose); c("SD_K", SUBJECT_DEEP.k); c("SD_DETAIL", SUBJECT_DEEP.detail); c("SD_ENGINE", SUBJECT_DEEP.engine); c("SD_ENGINE_LO", SUBJECT_DEEP.engineLo); c("SD_FAR_KEEP", SUBJECT_DEEP.farKeep); c("SR_VIB", R.vib); c("SR_X_VIB", R.boostVib); c("SR_VIB_LO", R.vibLo); c("SR_VIB_HI", R.vibHi);
  c("SR_FAR_KEEP", R.farKeep); c("SR_DETAIL", R.detail); c("SR_X_DETAIL", R.boostDetail); c("SR_RIM_LO", R.rimLo); c("SR_RIM_HI", R.rimHi);
  assert.ok(code.includes("segS * max(0.0, 1.0 - 1.0 / max(p[23].w, 1.0))"), `${name}: the boost is the AI weight × (Pop multiplier − 1), 0 up to Pop 50`);
  c("SR_DARK_LO", R.darkLo); c("SR_DARK_HI", R.darkHi); c("SR_POP_GATE", R.popGate); c("SR_COS", wx, 6); c("SR_SIN", wy, 6);
}

console.log("seg-restore: ok");
