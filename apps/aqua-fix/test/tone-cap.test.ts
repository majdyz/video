// Tone caps by signal (colour review item 8): local contrast, haze lift and the veil on low-signal frames, and the
// haze lift under a clip lock.
//   node --experimental-strip-types apps/aqua-fix/test/tone-cap.test.ts
import assert from "node:assert/strict";
import { analyzeThumbnail, buildClahe, ANALYSIS_W, ANALYSIS_H, CLAHE, HAZE_CAP, VEIL_CAP } from "../src/engine/analyze.ts";
import { applyGrade } from "../src/engine/apply.ts";
import { lockParams, LOCK_LIFT } from "../src/engine/lock.ts";
import { CLAHE_BINS, CLAHE_TILES_X, CLAHE_TILES_Y, DEFAULT_SETTINGS, HAZE_AUTO, IDENTITY_PARAMS, lerpParams, type GradeParams } from "../src/engine/params.ts";

const W = ANALYSIS_W, H = ANALYSIS_H, N = W * H;
function noise(seed: number): number {
  const s = Math.sin(seed * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}
function frame(fill: (u: number, v: number, i: number) => [number, number, number]): Uint8ClampedArray {
  const px = new Uint8ClampedArray(N * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, [r, g, b] = fill(x / W, y / H, i);
    px[i * 4] = r * 255 + 0.5; px[i * 4 + 1] = g * 255 + 0.5; px[i * 4 + 2] = b * 255 + 0.5; px[i * 4 + 3] = 255;
  }
  return px;
}

// 1. Local contrast LUTs. A flat tile (noise only) keeps the identity; a textured tile is equalised about its own
//    median (the anchor), where plain equalisation would have sent that median to mid-grey.
{
  const edge = (lut: Float32Array, b: number) => lut[b]; // LUT entry b = value at the upper edge of bin b (tile 0)
  const flat = new Float32Array(N);
  for (let i = 0; i < N; i++) flat[i] = 0.4 + (noise(i) - 0.5) * 0.02;
  const f = buildClahe(flat, W, H);
  assert.equal(f.data.length, CLAHE_TILES_X * CLAHE_TILES_Y * CLAHE_BINS);
  for (let b = 0; b < CLAHE_BINS; b++) assert.ok(Math.abs(edge(f.data, b) - (b + 1) / CLAHE_BINS) < 1e-6, `flat tile: identity at bin ${b}`);

  // Dark texture, uniform over [0.125, 0.375]: median 0.25 = the upper edge of bin 7.
  const tex = new Float32Array(N);
  for (let i = 0; i < N; i++) tex[i] = 0.125 + 0.25 * noise(i * 1.37 + 5);
  const t = buildClahe(tex, W, H);
  assert.ok(Math.abs(edge(t.data, 7) - 0.25) < 0.02, `anchored: the tile's median stays (${edge(t.data, 7).toFixed(3)})`);
  const slope = (edge(t.data, 10) - edge(t.data, 4)) / (6 / CLAHE_BINS);
  assert.ok(slope > 1.5 && slope < 3.1, `textured tile: contrast gain inside its range (${slope.toFixed(2)})`);
  for (let b = 1; b < CLAHE_BINS; b++) assert.ok(edge(t.data, b) >= edge(t.data, b - 1), "monotone");
  const was = CLAHE.anchor;
  CLAHE.anchor = 0;
  const u = buildClahe(tex, W, H);
  CLAHE.anchor = was;
  assert.ok(edge(u.data, 7) > 0.3, `plain equalisation lifts a dark tile's median toward mid-grey (${edge(u.data, 7).toFixed(3)})`);
  // A tile between the two takes part of the equalisation.
  const mid = new Float32Array(N);
  for (let i = 0; i < N; i++) mid[i] = 0.25 + (noise(i * 1.37 + 5) - 0.5) * 0.22; // std ≈ 0.064
  const m = buildClahe(mid, W, H);
  const sm = (edge(m.data, 9) - edge(m.data, 5)) / (4 / CLAHE_BINS);
  const full = (() => { const lo = CLAHE.sigLo, hi = CLAHE.sigHi; CLAHE.sigLo = -1; CLAHE.sigHi = 0; const r = buildClahe(mid, W, H); CLAHE.sigLo = lo; CLAHE.sigHi = hi; return (edge(r.data, 9) - edge(r.data, 5)) / (4 / CLAHE_BINS); })();
  assert.ok(sm > 1.05 && sm < full - 0.2, `low-signal tile: part of the gain (${sm.toFixed(2)} of ${full.toFixed(2)})`);
  console.log("ok  local contrast: identity on flat tiles, anchored at the tile median", slope.toFixed(2), sm.toFixed(2));
}

// A top-down, evenly lit sand frame (no water column in view): near-grey, low contrast, brown patches, grain.
const sand = frame((u, v, i) => {
  const t = 0.5 + 0.06 * Math.sin(u * 37 + v * 11) * Math.cos(v * 29) + (noise(i) - 0.5) * 0.05;
  return Math.sin(u * 9) * Math.sin(v * 7) > 0.6 ? [t * 0.8, t * 0.72, t * 0.6] : [t * 0.93, t, t * 0.98];
});
// A reef in haze under open water: bright blue-green water above, a darker textured reef with warm patches below.
const reef = frame((u, v, i) => {
  const n = (noise(i) - 0.5) * 0.03;
  if (v < 0.45) { const k = 0.8 - 0.5 * v; return [0.08 + n, k * 0.7 + n, k * 0.85 + n]; }
  const cell = (Math.floor(u * 16) + Math.floor(v * 9)) % 4;
  const base = [0.1, 0.22, 0.38, 0.6][cell];
  return cell === 3 ? [base * 0.9 + n, base * 0.75 + n, base * 0.45 + n] : [base * 0.5 + n, base + n, base * 0.9 + n];
});
const lumStd = (px: Uint8ClampedArray) => {
  let s = 0, s2 = 0;
  for (let i = 0; i < N; i++) { const y = (0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]) / 255; s += y; s2 += y * y; }
  return Math.sqrt(Math.max(0, s2 / N - (s / N) ** 2));
};
const uncapped = <T>(fn: () => T): T => {
  const v = { ...VEIL_CAP }, h = { ...HAZE_CAP };
  VEIL_CAP.covLo = 2; VEIL_CAP.covHi = 3; HAZE_CAP.low = 99; HAZE_CAP.mid = 99;
  try { return fn(); } finally { Object.assign(VEIL_CAP, v); Object.assign(HAZE_CAP, h); }
};
const grade = (px: Uint8ClampedArray, a: ReturnType<typeof analyzeThumbnail>) => applyGrade({ params: a.params, settings: { ...DEFAULT_SETTINGS, clarity: 0 }, depth: a.depth, clahe: a.clahe }, px, W, H);

// 2. Veil cap: the sand frame's fit is scaled down and its grade is gentler; the reef in haze keeps its fit.
{
  const a = analyzeThumbnail(sand, W, H), b = uncapped(() => analyzeThumbnail(sand, W, H));
  const sum = (p: GradeParams) => p.binf[0] + p.binf[1] + p.binf[2];
  assert.ok(sum(a.params) < 0.75 * sum(b.params), `sand: veil capped (${sum(a.params).toFixed(3)} of ${sum(b.params).toFixed(3)})`);
  const src = lumStd(sand), capped = lumStd(grade(sand, a)), before = lumStd(grade(sand, b));
  assert.ok(capped < 0.8 * before, `sand: less contrast added (${(capped / src).toFixed(2)}× the source, ${(before / src).toFixed(2)}× uncapped)`);
  assert.ok(capped < 1.6 * src, `sand: contrast gain bounded (${(capped / src).toFixed(2)}×)`);
  const r = analyzeThumbnail(reef, W, H), r0 = uncapped(() => analyzeThumbnail(reef, W, H));
  assert.ok(Math.abs(sum(r.params) - sum(r0.params)) < 1e-9, "reef in haze: fit untouched");
  console.log("ok  veil cap: flat all-object frame", (capped / src).toFixed(2), "vs", (before / src).toFixed(2));
}

// 3. Haze lift cap: the black handed to the lift never exceeds its share of the frame's low tones and median.
{
  for (const [name, px] of [["sand", sand], ["reef", reef]] as const) {
    const a = analyzeThumbnail(px, W, H), t = a.diag!.tone!;
    assert.ok(a.params.hazeBlack <= HAZE_CAP.low * t.yLow + 1e-9 && a.params.hazeBlack <= HAZE_CAP.mid * t.yMid + 1e-9, `${name}: lift black within the caps`);
    assert.ok(a.params.hazeBlack <= t.black + 1e-9, `${name}: never above the measured black`);
    assert.equal(a.params.frameBlack, a.params.hazeBlack);
  }
  // A flat hazy water frame (everything on the water path, low tones just above the black): the cap bites.
  const haze = frame((u, v, i) => { const k = 0.52 + 0.05 * v + (noise(i) - 0.5) * 0.03; return [k * 0.55, k, k * 0.95]; });
  const a = analyzeThumbnail(haze, W, H), t = a.diag!.tone!;
  assert.ok(t.black > HAZE_CAP.mid * t.yMid, "flat haze: the measured black is over the cap");
  assert.ok(Math.abs(a.params.hazeBlack - Math.min(HAZE_CAP.low * t.yLow, HAZE_CAP.mid * t.yMid)) < 1e-6, "flat haze: lift black at the cap");
  assert.ok(a.params.haze > 0.9, "flat haze: still counted as hazy");
  assert.ok(HAZE_AUTO.lift <= 0.8 && HAZE_AUTO.clarity === 0 && DEFAULT_SETTINGS.clarity <= 0.15, "conservative defaults");
  console.log("ok  haze lift cap", a.params.hazeBlack.toFixed(3), "of", t.black.toFixed(3));
}

// 4. The lift under a lock: a frame darker than the shot's median takes less lift (eased with the frame), a brighter
//    one keeps the lock's; applying the lock again changes nothing.
{
  const lock: GradeParams = { ...IDENTITY_PARAMS, haze: 1, hazeBlack: 0.1, hazeFloor: [0.05, 0.1, 0.12], exposure: 1.2 };
  const dark: GradeParams = { ...IDENTITY_PARAMS, hazeBlack: 0.05, frameBlack: 0.05, hazeFloor: [0.02, 0.05, 0.06] };
  const l = lockParams(lock, dark);
  assert.ok(Math.abs(l.hazeBlack - LOCK_LIFT.margin * 0.05) < 1e-9, "darker frame: its own black × margin");
  assert.ok(Math.abs(l.hazeFloor[2] - 0.12 * LOCK_LIFT.margin * 0.5) < 1e-9, "the haze colour scales with it");
  assert.equal(l.exposure, 1.2);
  const again = lockParams(lock, l);
  assert.ok(Math.abs(again.hazeBlack - l.hazeBlack) < 1e-12 && again.frameBlack === 0.05, "idempotent");
  const bright = lockParams(lock, { ...dark, hazeBlack: 0.2, frameBlack: 0.2 });
  assert.equal(bright.hazeBlack, 0.1, "brighter frame: the lock's lift, never more");
  assert.deepEqual(bright.hazeFloor, lock.hazeFloor);
  // An estimate without the field (older caller) counts with its hazeBlack; easing carries the frame's own value.
  assert.equal(lockParams(lock, { ...IDENTITY_PARAMS, hazeBlack: 0.3 }).hazeBlack, 0.1);
  const eased = lerpParams(l, lockParams(lock, { ...dark, frameBlack: 0.09, hazeBlack: 0.09 }), 0.5);
  assert.ok(Math.abs(eased.frameBlack! - 0.07) < 1e-9);
  assert.ok(Math.abs(lockParams(lock, eased).hazeBlack - LOCK_LIFT.margin * 0.07) < 1e-9, "the lift follows the eased frame value");
  const m = LOCK_LIFT.margin;
  LOCK_LIFT.margin = 0;
  assert.equal(lockParams(lock, dark).hazeBlack, 0.1, "margin 0: plain lock");
  LOCK_LIFT.margin = m;
  console.log("ok  haze lift under a lock");
}
