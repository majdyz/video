// The manual override pair: tap-to-neutral (tap.ts, params.ts tapParams) and "Water colour" (WATER_TINT).
//   node --experimental-strip-types apps/aqua-fix/test/tap.test.ts
import assert from "node:assert/strict";
import { applyGrade, gradePixel, resolveContext, warmPop, waterTint, type ApplyContext } from "../src/engine/apply.ts";
import { linearToOklab, linearToSrgb, srgbToLinear } from "../src/engine/color.ts";
import { GRADE_GLSL, GRADE_WGSL } from "../src/engine/grade-shader.ts";
import { lockParams } from "../src/engine/lock.ts";
import { BLUE_WATER, CLAHE_BINS, CLAHE_TILES_X, CLAHE_TILES_Y, DEFAULT_SETTINGS, IDENTITY_PARAMS, TAP, WARM_POP, WATER_TINT, packUniforms, tapGains, tapParams, waterTintOf, type ClaheLuts, type DepthMap, type GradeParams, type UserSettings } from "../src/engine/params.ts";
import { TAP_SOLVE, correctionOnly, solveTap, tapRect, tapSample } from "../src/engine/tap.ts";

const D = Math.PI / 180;
const near = (a: number, b: number, eps: number, msg: string) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`);

// A frame's maps: one flat region, all object (conf 1) or all water (conf 0).
function maps(rgbLin: readonly number[], conf: number): { depth: DepthMap; clahe: ClaheLuts } {
  const w = 4, h = 4, fields = new Float32Array(w * h * 4), guide = new Float32Array(w * h * 3);
  for (let i = 0; i < w * h; i++) { fields.set([0.5, conf, 0.6, 1], i * 4); guide.set(rgbLin, i * 3); }
  const data = new Float32Array(CLAHE_TILES_X * CLAHE_TILES_Y * CLAHE_BINS);
  for (let t = 0; t < CLAHE_TILES_X * CLAHE_TILES_Y; t++) for (let b = 0; b < CLAHE_BINS; b++) data[t * CLAHE_BINS + b] = (b + 1) / CLAHE_BINS;
  return { depth: { width: w, height: h, fields, guide }, clahe: { tilesX: CLAHE_TILES_X, tilesY: CLAHE_TILES_Y, bins: CLAHE_BINS, data } };
}
// An underwater estimate that leaves a cast behind (the auto-is-wrong case): too little red, a little too much blue.
const PARAMS: GradeParams = { ...IDENTITY_PARAMS, wb: [1.3, 1, 1], waterWb: [1.15, 1, 1], veilColor: [0.1, 0.5, 0.7], cosLo: 0.3, cosHi: 0.6, confLo: 0.1, confHi: 0.3, achroma: 0.01 };
const srgb = (lin: readonly number[]) => lin.map((x) => linearToSrgb(x)) as [number, number, number];
const chromaOf = (o: readonly number[]) => { const [, a, b] = linearToOklab(srgbToLinear(o[0]), srgbToLinear(o[1]), srgbToLinear(o[2])); return Math.hypot(a, b); };
const gradeAt = (ctx: ApplyContext, rgb: readonly [number, number, number]) => gradePixel(resolveContext(ctx), rgb[0], rgb[1], rgb[2], 0.5, 0.5);
const STYLES: Record<string, UserSettings> = { natural: { ...DEFAULT_SETTINGS }, vivid: { ...DEFAULT_SETTINGS, vivid: 1, seabed: 0.6 }, blue: { ...DEFAULT_SETTINGS, vivid: 1, blue: 1, seabed: 0.6 } };

// 1. No tap is no change: absent, [1, 1] and nonsense all leave the parameters (the same object) and the uniforms alone.
{
  for (const t of [undefined, [1, 1], [0, 1], [NaN, 1], [1, Infinity], [-2, 1]] as (UserSettings["wbTap"])[]) {
    assert.equal(tapGains({ wbTap: t }), null);
    assert.equal(tapParams(PARAMS, { wbTap: t }), PARAMS);
  }
  const m = maps([0.2, 0.4, 0.5], 1);
  const base = packUniforms(PARAMS, DEFAULT_SETTINGS, m.depth, m.clahe, 0, 0);
  assert.deepEqual(packUniforms(PARAMS, { ...DEFAULT_SETTINGS, wbTap: undefined, waterHue: 0 }, m.depth, m.clahe, 0, 0), base);
  assert.deepEqual(packUniforms(PARAMS, { ...DEFAULT_SETTINGS, wbTap: [1, 1] }, m.depth, m.clahe, 0, 0), base);
  assert.equal(base[107], 0);
  // … and the rendered picture is byte-identical.
  const img = new Uint8ClampedArray(8 * 8 * 4);
  for (let i = 0; i < 64; i++) img.set([40 + i * 2, 120 + i, 200 - i, 255], i * 4);
  const a = applyGrade({ params: PARAMS, settings: STYLES.vivid, ...m }, img, 8, 8);
  assert.deepEqual(applyGrade({ params: PARAMS, settings: { ...STYLES.vivid, wbTap: undefined, waterHue: 0 }, ...m }, img, 8, 8), a);
  console.log("ok  no tap, Water colour 0: parameters, uniforms and pixels unchanged");
}

// 2. The offset: on red and blue only, the water path takes its toned-down share, everything is clamped.
{
  const p = tapParams(PARAMS, { wbTap: [1.5, 0.8] });
  near(p.wb[0], 1.3 * 1.5, 1e-12, "wb r");
  assert.equal(p.wb[1], 1);
  near(p.wb[2], 0.8, 1e-12, "wb b");
  near(p.waterWb[0], 1.15 * Math.pow(1.5, TAP.waterPow), 1e-12, "water r");
  near(p.waterWb[2], Math.pow(0.8, TAP.waterPow), 1e-12, "water b");
  // Everything else is the lock's.
  for (const k of Object.keys(PARAMS) as (keyof GradeParams)[]) if (k !== "wb" && k !== "waterWb") assert.equal(p[k], PARAMS[k]);
  // Limits: the stored gains, the balance with them on it, the water path.
  assert.deepEqual(tapGains({ wbTap: [100, 0.001] }), [TAP.max, 1 / TAP.max]);
  const big = tapParams({ ...PARAMS, wb: [3.5, 1, 0.6] }, { wbTap: [100, 0.001] });
  assert.equal(big.wb[0], TAP.wbMax);
  assert.ok(big.wb[2] >= TAP.wbMin && big.waterWb[0] <= TAP.waterMax && big.waterWb[2] >= 1 / TAP.waterMax);
  console.log("ok  the tap is a bounded gain on red and blue, toned down on the water path");
}

// 3. A clip-level constant: it lives in the settings, so it rides on whatever balance is in force. The clip lock
//    (lock.ts) replaces a frame's own estimate with the shot's; do-no-harm, the scene preset and the push reshape
//    the balance: the tap is applied after all of them, in the uniforms the shader reads.
{
  const m = maps([0.2, 0.4, 0.5], 1);
  const tap: UserSettings = { ...DEFAULT_SETTINGS, wbTap: [1.4, 0.9] };
  const wbOf = (p: GradeParams, s: UserSettings) => { const u = packUniforms(p, s, m.depth, m.clahe, 0, 0); return [u[20], u[21], u[22], u[44], u[45], u[46]]; };
  const lock: GradeParams = { ...PARAMS, wb: [2.2, 1, 0.8], waterWb: [1.5, 1, 0.9] };
  // Two very different frame estimates under the same lock: the same balance, with the tap on it.
  const f1 = lockParams(lock, { ...PARAMS, wb: [1.1, 1, 1.2] }), f2 = lockParams(lock, { ...PARAMS, wb: [3.4, 1, 0.6] });
  assert.deepEqual(wbOf(f1, tap), wbOf(f2, tap));
  const w0 = wbOf(f1, DEFAULT_SETTINGS), w1 = wbOf(f1, tap);
  near(w1[0] / w0[0], 1.4, 1e-5, "locked wb r × tap");
  near(w1[2] / w0[2], 0.9, 1e-5, "locked wb b × tap");
  near(w1[3] / w0[3], Math.pow(1.4, TAP.waterPow), 1e-5, "locked water r × tap");
  // Do-no-harm at full (an already graded clip): the automatic balance stands down to 1, the tap stays whole.
  const calm = wbOf({ ...lock, calm: 1, calmTone: 1 }, tap);
  near(calm[0], 1.4, 1e-5, "calm wb r");
  near(calm[2], 0.9, 1e-5, "calm wb b");
  // Scene preset and push: the ratio to the untapped balance is the tap (inside the limits).
  for (const s of [{ preset: "deep" as const }, { preset: "reef" as const }, { intensity: 1.5 }]) {
    const a = wbOf(lock, { ...DEFAULT_SETTINGS, ...s }), b = wbOf(lock, { ...tap, ...s });
    near(b[0] / a[0], Math.min(1.4, TAP.wbMax / a[0]), 1e-5, `wb r under ${JSON.stringify(s)}`);
    near(b[2] / a[2], 0.9, 1e-5, `wb b under ${JSON.stringify(s)}`);
  }
  console.log("ok  the tap rides on the lock, do-no-harm, the preset and the push");
}

// 4. The solver: a grey under a cast the estimate left behind is balanced to neutral, on the object path and on the
//    water path, at the default Strength and pushed. It is solved on the correction alone (correctionOnly), so the
//    gains are the same in every style, and the looks then treat the point as they treat any grey.
{
  const grey = srgb([0.3 * 0.5, 0.3, 0.3 * 1.15]); // red halved, blue up: the auto balance (×1.3 red) leaves it cyan
  const hueOf = (o: readonly number[]) => { const [, a, b] = linearToOklab(srgbToLinear(o[0]), srgbToLinear(o[1]), srgbToLinear(o[2])); return ((Math.atan2(b, a) / D) % 360 + 360) % 360; };
  for (const conf of [1, 0]) for (const intensity of [1, 1.5]) {
    let first: [number, number] | null = null;
    for (const [name, style] of Object.entries(STYLES)) {
      const settings = { ...style, intensity };
      const ctx: ApplyContext = { params: PARAMS, settings, ...maps(grey.map(srgbToLinear), conf) };
      const corr = { ...ctx, settings: correctionOnly(settings) };
      const s = solveTap(ctx, grey, 0.5, 0.5);
      assert.ok(s.ok, "sampled");
      if (!s.ok) continue;
      near(s.before, chromaOf(gradeAt(corr, grey)), 1e-9, "before");
      assert.ok(s.before > 0.03, `${name}: a visible cast to begin with (${s.before})`);
      assert.ok(!s.limited && s.after <= TAP_SOLVE.done, `${name} conf ${conf} intensity ${intensity}: ${s.before.toFixed(4)} → ${s.after.toFixed(4)} gains ${s.gains}`);
      // What the solver reports is what the correction renders with those gains.
      near(chromaOf(gradeAt({ ...corr, settings: { ...corr.settings, wbTap: s.gains } }, grey)), s.after, 1e-9, "after");
      assert.ok(s.gains[0] > 1 && s.gains[0] <= TAP.max && s.gains[1] < 1 && s.gains[1] >= 1 / TAP.max, `gains ${s.gains}`);
      // The same gains whatever the style: changing the style after a tap leaves the balance right.
      first ??= s.gains;
      assert.deepEqual(s.gains, first, `${name}: gains differ by style`);
      // A second tap replaces the first: an earlier tap in the settings does not change the answer.
      assert.deepEqual(solveTap({ ...ctx, settings: { ...settings, wbTap: [2.5, 0.5] } }, grey, 0.5, 0.5), s);
      // On screen, in this style: the point and its shadow / sunlit side (the same material, darker or lighter:
      // where the looks act differently, e.g. a subject spared the water's blue) are near neutral, far below the
      // cast they had, and never green (a tap solved through the looks left their counter-tint there).
      for (const k of [0.35, 0.6, 1, 1.6]) {
        const px = srgb(grey.map((c) => Math.min(1, srgbToLinear(c) * k)));
        const m = maps(grey.map(srgbToLinear), conf);
        const o0 = gradeAt({ params: PARAMS, settings, ...m }, px), o1 = gradeAt({ params: PARAMS, settings: { ...settings, wbTap: s.gains }, ...m }, px);
        const c0 = chromaOf(o0), c1 = chromaOf(o1), h1 = hueOf(o1);
        assert.ok(c1 < 0.035 && c1 < 0.6 * c0, `${name} conf ${conf} ×${k}: chroma ${c0.toFixed(3)} → ${c1.toFixed(3)}`);
        assert.ok(!(c1 > 0.012 && h1 > 110 && h1 < 185), `${name} conf ${conf} ×${k}: green (${h1.toFixed(0)}°, C ${c1.toFixed(3)})`);
      }
    }
  }
  // A point that is neutral already: nothing to do.
  const n = srgb([0.3 / 1.3, 0.3, 0.3]);
  const s = solveTap({ params: PARAMS, settings: STYLES.natural, ...maps(n.map(srgbToLinear), 1) }, n, 0.5, 0.5);
  assert.ok(s.ok && !s.limited && Math.abs(s.gains[0] - 1) < 0.03 && Math.abs(s.gains[1] - 1) < 0.03, JSON.stringify(s));
  console.log("ok  a cast grey is solved to neutral in every style, on both paths");
}

// 5. Guards. A point with no red left cannot be neutralised by a balance: the tap says so and does not drag the
//    picture to the limit for it (here: leaves it alone). Too dark and clipped points are refused.
{
  const dead: [number, number, number] = [2 / 255, 170 / 255, 190 / 255];
  for (const style of Object.values(STYLES)) {
    const s = solveTap({ params: PARAMS, settings: style, ...maps(dead.map(srgbToLinear), 1) }, dead, 0.5, 0.5);
    assert.ok(s.ok && s.limited, JSON.stringify(s));
    if (s.ok) assert.ok(s.gains[0] < TAP.max - 1e-6 && s.gains[1] > 1 / TAP.max + 1e-6, `not at the limit: ${s.gains}`);
  }
  // Open water tapped as if it were grey (a bubble stream that is mostly water): the correction alone would shed
  // much of its cast, at gains near the limit, and the default look paints water blue again. Refused in every
  // style: gains [1, 1], flagged, the picture untouched. A limited tap that is kept always pays on screen.
  for (const lin of [[0.03, 0.2, 0.42], [0.05, 0.3, 0.6], [0.015, 0.12, 0.3], [0.02, 0.22, 0.5]]) for (const wbr of [2, 3.5]) {
    const water = srgb(lin);
    const P: GradeParams = { ...PARAMS, wb: [wbr, 1, 1], waterWb: [Math.pow(wbr, 0.6), 1, 1], veilColor: lin as [number, number, number] };
    for (const [name, style] of Object.entries(STYLES)) {
      const ctx: ApplyContext = { params: P, settings: style, ...maps(lin, 0) };
      const s = solveTap(ctx, water, 0.5, 0.5);
      assert.ok(s.ok && s.limited, JSON.stringify(s));
      if (!s.ok) continue;
      // Not re-balanced for it: at most the small pull-down (TAP_SOLVE.fall*: blue down, a little red), which
      // sheds chroma, or nothing at all.
      const [r, b] = s.gains;
      assert.ok(r >= 1 && r <= TAP_SOLVE.fallRed + 1e-9 && b <= 1 && b >= 1 / TAP_SOLVE.fallBlue - 1e-9, `${name} water ${lin} wb ${wbr}: gains ${s.gains}`);
      assert.ok(r === 1 && b === 1 ? s.after === s.before : s.after <= (1 - TAP_SOLVE.fallGain) * s.before, `${name} water ${lin}: ${s.before} → ${s.after}`);
    }
  }
  // Sand in deep blue water, its red all but gone (owner, 13 Nov: the tap answered "No red left" and did nothing):
  // the pull-down acts — bounded, flagged, less cast on the correction and on screen in every style, never green.
  {
    const lin = [0.012, 0.16, 0.34], sand = srgb(lin);
    const P: GradeParams = { ...PARAMS, wb: [3, 1, 1], waterWb: [1.9, 1, 1], veilColor: [0.01, 0.12, 0.3] };
    for (const conf of [1, 0.5]) for (const [name, style] of Object.entries(STYLES)) {
      const ctx: ApplyContext = { params: P, settings: style, ...maps(lin, conf) };
      const s = solveTap(ctx, sand, 0.5, 0.5);
      assert.ok(s.ok && s.limited, JSON.stringify(s));
      if (!s.ok) continue;
      assert.ok(s.gains[0] !== 1 || s.gains[1] !== 1, `${name} conf ${conf}: the tap did nothing (${JSON.stringify(s)})`);
      assert.ok(s.gains[0] <= TAP_SOLVE.limitedMax && s.gains[1] >= 1 / TAP_SOLVE.limitedMax, `${name}: bounded ${s.gains}`);
      assert.ok(s.after < s.before, `${name}: ${s.before} → ${s.after}`);
      const o = gradeAt({ ...ctx, settings: { ...correctionOnly(style), wbTap: s.gains } }, sand);
      const [, a, b] = linearToOklab(srgbToLinear(o[0]), srgbToLinear(o[1]), srgbToLinear(o[2]));
      const h = ((Math.atan2(b, a) / D) % 360 + 360) % 360;
      assert.ok(!(Math.hypot(a, b) > TAP_SOLVE.limited && h > TAP_SOLVE.greenLo && h < TAP_SOLVE.greenHi), `${name}: green (${h.toFixed(0)}°)`);
    }
  }
  assert.ok(TAP_SOLVE.limitedMax < TAP.max && TAP_SOLVE.limitedMax >= 2);
  // A partly recoverable point: improved, flagged, and no further than it pays.
  const weak = srgb([0.3 * 0.12, 0.3, 0.3 * 1.1]);
  const ctx: ApplyContext = { params: PARAMS, settings: STYLES.natural, ...maps(weak.map(srgbToLinear), 1) };
  const w = solveTap(ctx, weak, 0.5, 0.5);
  assert.ok(w.ok && w.after <= w.before, JSON.stringify(w));
  assert.deepEqual(solveTap({ params: PARAMS, settings: STYLES.vivid, ...maps([0, 0, 0], 1) }, [0.02, 0.03, 0.04], 0.5, 0.5), { ok: false, reason: "dark" });
  assert.deepEqual(solveTap({ params: PARAMS, settings: STYLES.vivid, ...maps([1, 1, 1], 1) }, [1, 0.99, 1], 0.5, 0.5), { ok: false, reason: "bright" });
  // Strength 0 shows the source: nothing a balance can do, nothing changed.
  const grey = srgb([0.15, 0.3, 0.345]);
  // Strength below the estimate (even 0, which shows the source) does not change the balance: it is solved on the
  // full correction, and Strength then mixes it in like everything else.
  const m = maps(grey.map(srgbToLinear), 1);
  assert.deepEqual(solveTap({ params: PARAMS, settings: { ...STYLES.vivid, intensity: 0 }, ...m }, grey, 0.5, 0.5), solveTap({ params: PARAMS, settings: STYLES.vivid, ...m }, grey, 0.5, 0.5));
  console.log("ok  dead red is soft-limited, dark and clipped points are refused");
}

// 6. The sample: a per-channel median (a bubble in the patch does not move it), from a rectangle inside the frame.
{
  const px = new Uint8ClampedArray(81 * 4);
  for (let i = 0; i < 81; i++) px.set(i < 20 ? [255, 255, 255, 255] : [50, 120, 140, 255], i * 4);
  assert.deepEqual(tapSample(px), [50 / 255, 120 / 255, 140 / 255]);
  for (const [u, v] of [[0, 0], [1, 1], [0.5, 0.5], [0.999, 0.001]]) {
    const r = tapRect(u, v, 1920, 1080);
    assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= 1 + 1e-12 && r.y + r.h <= 1 + 1e-12, JSON.stringify(r));
    assert.ok(r.w * 1920 >= TAP_SOLVE.patch - 1e-9 && r.h * 1080 >= TAP_SOLVE.patch - 1e-9);
  }
  const c = tapRect(0.5, 0.5, 3840, 2160);
  near(c.x + c.w / 2, 0.5, 1e-12, "centred");
  console.log("ok  the sample is a median over a patch inside the frame");
}

// 7. Water colour: a rotation of the water's hue only.
{
  const ab = (C: number, h: number): [number, number] => [C * Math.cos(h * D), C * Math.sin(h * D)];
  const hueOf = (x: readonly number[]) => ((Math.atan2(x[1], x[0]) / D) % 360 + 360) % 360;
  assert.equal(waterTintOf({}), 0);
  assert.equal(waterTintOf({ waterHue: 0 }), 0);
  near(waterTintOf({ waterHue: -1 }), -WATER_TINT.teal, 1e-12, "teal end");
  near(waterTintOf({ waterHue: 1 }), WATER_TINT.blue, 1e-12, "blue end");
  near(waterTintOf({ waterHue: 5 }), WATER_TINT.blue, 1e-12, "clamped");
  assert.equal(waterTintOf({ waterHue: NaN }), 0);
  // Off: exactly the input.
  const w = ab(0.08, 258);
  assert.deepEqual(waterTint(w[0], w[1], 0, 0), w);
  // Water (the cobalt the look sets, the cyan Natural leaves, green water): the hue turns by the full angle, the chroma stays.
  for (const h of [258, 220, 200]) for (const t of [-WATER_TINT.teal, WATER_TINT.blue]) {
    const x = ab(0.08, h), o = waterTint(x[0], x[1], t, 0);
    near(Math.hypot(o[0], o[1]), 0.08, 1e-12, `chroma at ${h}°`);
    near(hueOf(o), h + t / D, 0.01, `hue at ${h}°`);
  }
  // Green water (the frame's green weight): its green is mostly cast, and turns with the rest (most of the way).
  {
    const x = ab(0.08, 170), o = waterTint(x[0], x[1], WATER_TINT.blue, 1), clear = waterTint(x[0], x[1], WATER_TINT.blue, 0);
    assert.ok(hueOf(o) - 170 > 0.75 * (WATER_TINT.blue / D) && hueOf(clear) - 170 < hueOf(o) - 170, `green water ${hueOf(o)} / clear ${hueOf(clear)}`);
  }
  // −1 is greener / teal, +1 bluer.
  assert.ok(hueOf(waterTint(w[0], w[1], waterTintOf({ waterHue: -1 }), 0)) < 258 && hueOf(waterTint(w[0], w[1], waterTintOf({ waterHue: 1 }), 0)) > 258);
  // Subjects: skin, sand in sunlight, orange and red fish, yellow (warm side of the projection) do not move at all.
  for (const h of [20, 40, 62, 90]) for (const C of [0.05, 0.1, 0.18]) for (const t of [-WATER_TINT.teal, WATER_TINT.blue]) {
    const x = ab(C, h), o = waterTint(x[0], x[1], t, 0);
    assert.ok(Math.hypot(o[0] - x[0], o[1] - x[1]) < 1e-9, `warm ${h}° C ${C} moved`);
  }
  // Vegetation (yellow-green with real chroma) and vivid violets (purple coral) keep their hue.
  for (const [h, C] of [[100, 0.08], [120, 0.08], [320, 0.14]]) {
    const x = ab(C, h), o = waterTint(x[0], x[1], WATER_TINT.blue, 0);
    assert.ok(Math.abs(hueOf(o) - h) < 2.5, `kept ${h}° → ${hueOf(o)}`);
  }
  // Near-greys (whites, silver, sand): moved by next to nothing, whatever their hue; no chroma is ever added.
  for (let h = 0; h < 360; h += 15) for (const t of [-WATER_TINT.teal, WATER_TINT.blue]) {
    const x = ab(0.01, h), o = waterTint(x[0], x[1], t, 0);
    assert.ok(Math.hypot(o[0] - x[0], o[1] - x[1]) <= 0.01 * Math.abs(t) + 1e-12, `near-grey at ${h}°`);
    near(Math.hypot(o[0], o[1]), 0.01, 1e-12, "near-grey chroma");
  }
  // Continuous across the water / subject boundary (no new edge): small input steps give small output steps.
  let prev = waterTint(...ab(0.06, 0), WATER_TINT.teal, 0), worst = 0;
  for (let h = 0.5; h <= 360; h += 0.5) { const o = waterTint(...ab(0.06, h), WATER_TINT.teal, 0); worst = Math.max(worst, Math.hypot(o[0] - prev[0], o[1] - prev[1])); prev = o; }
  assert.ok(worst < 0.06 * 0.5 * D * 6, `largest step ${worst}`);
  // The uniform and both shaders carry it, after the water-hue map.
  const m = maps([0.2, 0.4, 0.5], 1);
  near(packUniforms(PARAMS, { ...DEFAULT_SETTINGS, waterHue: -0.5 }, m.depth, m.clahe, 0, 0)[107], -0.5 * WATER_TINT.teal, 1e-6, "p26.w");
  assert.ok(/lk\.yz = waterTint\(lk\.yz, p\[26\]\.w, p\[22\]\.w\);/.test(GRADE_GLSL) && /waterTint\(lk\.yz, params\.p\[26\]\.w, p\[22\]\.w\)/.test(GRADE_WGSL));
  assert.ok(GRADE_GLSL.indexOf("blueLook(lk, p[25].w") < GRADE_GLSL.indexOf("waterTint(lk.yz, p[26].w") && GRADE_GLSL.indexOf("waterTint(lk.yz, p[26].w") < GRADE_GLSL.indexOf("richLook(lk, p[23].z)"));
  void BLUE_WATER;
  console.log("ok  Water colour turns the water's hue; subjects, vegetation, violets and greys stay");
}

// 8. Water colour in the grade: a frame's water moves, its skin-coloured pixel does not, in every style.
{
  const water = srgb([0.05, 0.25, 0.45]), skin = srgb([0.45, 0.28, 0.2]);
  for (const [name, style] of Object.entries(STYLES)) {
    const hue = (rgb: readonly [number, number, number], waterHue: number) => {
      const o = gradeAt({ params: PARAMS, settings: { ...style, waterHue }, ...maps(rgb.map(srgbToLinear), rgb === water ? 0 : 1) }, rgb);
      const [, a, b] = linearToOklab(srgbToLinear(o[0]), srgbToLinear(o[1]), srgbToLinear(o[2]));
      return { h: ((Math.atan2(b, a) / D) % 360 + 360) % 360, o };
    };
    const w0 = hue(water, 0), wm = hue(water, -1), wp = hue(water, 1);
    assert.ok(wm.h < w0.h - 15 && wp.h > w0.h + 8, `${name}: water hue ${wm.h.toFixed(0)} / ${w0.h.toFixed(0)} / ${wp.h.toFixed(0)}`);
    const s0 = hue(skin, 0), sm = hue(skin, -1), sp = hue(skin, 1);
    for (let c = 0; c < 3; c++) assert.ok(Math.abs(sm.o[c] - s0.o[c]) < 1 / 255 && Math.abs(sp.o[c] - s0.o[c]) < 1 / 255, `${name}: skin moved`);
  }
  console.log("ok  in the grade: water turns teal / blue, skin stays, in every style");
}

// 9. The subject path under a tap. Subject pop's warm pull (WARM_POP) meets what the tap leaves on the water path:
//    a shadow on sand that the tap turned from blue to teal. A plain mix of teal and cream is green (the patch seen
//    beside the neutral sand with AI subjects on); the pull now passes through neutral. Blue subjects are as before.
{
  const hueOf = (x: readonly number[]) => ((Math.atan2(x[1], x[0]) / D) % 360 + 360) % 360;
  const ab = (C: number, h: number): [number, number] => [C * Math.cos(h * D), C * Math.sin(h * D)];
  const green = (o: readonly number[]) => Math.hypot(o[0], o[1]) > 0.02 && hueOf(o) > 112 && hueOf(o) < 200;
  // Off: exactly the input. Full: the warm cream, whatever came in.
  assert.deepEqual(warmPop(0.5, ...ab(0.06, 180), 0), ab(0.06, 180));
  for (const h of [180, 250, 20]) near(hueOf(warmPop(0.5, ...ab(0.06, h), 1)), WARM_POP.hue / D, 1e-6, "full pull");
  // Teal, cyan and blue-green subjects (the tap's leftovers, green water): from a real weight on, never green; the
  // chroma stays inside what the pixel and the cream hold.
  for (const h of [165, 180, 195, 210]) for (const C of [0.03, 0.06, 0.1]) {
    for (let k = 0; k <= 1.0001; k += 0.05) {
      const o = warmPop(0.5, ...ab(C, h), k), c = Math.hypot(o[0], o[1]);
      if (k >= 0.4) assert.ok(!green(o), `teal ${h}° C ${C} at k ${k.toFixed(2)}: ${hueOf(o).toFixed(0)}° C ${c.toFixed(3)}`);
      // No colour the pixel and the cream do not hold between them; at a soft mask edge the teal only fades.
      assert.ok(c <= Math.max(C, WARM_POP.cMax) + 1e-12, `chroma at ${h}° k ${k.toFixed(2)}`);
      if (k <= 0.3) assert.ok(c <= C + 1e-12, `chroma grows at ${h}° k ${k.toFixed(2)}`);
    }
    // The old plain mix did go green there (what this guards against).
    const k = 0.5, ct = Math.min(WARM_POP.cMax, Math.max(WARM_POP.keep * C, WARM_POP.cMin));
    const old = [C * Math.cos(h * D) * (1 - k) + Math.cos(WARM_POP.hue) * ct * k, C * Math.sin(h * D) * (1 - k) + Math.sin(WARM_POP.hue) * ct * k];
    if (h <= 195 && C >= 0.06) assert.ok(green(old), `plain mix at ${h}° C ${C}: ${hueOf(old).toFixed(0)}°`);
  }
  // A blue subject (straight across from the cream): within a hair of the plain mix.
  for (const h of [250, 258, 265]) for (const k of [0.25, 0.5, 0.75]) {
    const C = 0.07, ct = Math.min(WARM_POP.cMax, Math.max(WARM_POP.keep * C, WARM_POP.cMin));
    const o = warmPop(0.5, ...ab(C, h), k);
    const old = [C * Math.cos(h * D) * (1 - k) + Math.cos(WARM_POP.hue) * ct * k, C * Math.sin(h * D) * (1 - k) + Math.sin(WARM_POP.hue) * ct * k];
    assert.ok(Math.hypot(o[0] - old[0], o[1] - old[1]) < 0.006, `blue ${h}° k ${k}: moved ${Math.hypot(o[0] - old[0], o[1] - old[1])}`);
  }
  // Both shaders carry the same form.
  for (const code of [GRADE_GLSL, GRADE_WGSL]) assert.ok(code.includes("pow(max(0.0, 1.0 - k), WP_SIDE)") && /WP_SIDE(: f32)? = 4\.0000/.test(code));
  // … and it is for a subject that carries a cast: the weight fades out where the graded colour is near neutral
  // already (a region the tap balanced is not painted cream), and is whole on a cast subject (as before the tap).
  assert.ok(WARM_POP.castLo >= 0.01 && WARM_POP.castHi <= 0.05, "a blue-cast subject (C ≥ 0.05 as graded) keeps the full pull");
  assert.ok(GRADE_GLSL.includes("* smoothstepf(WP_CAST_LO, WP_CAST_HI, length(lab.yz) * scale);") && GRADE_WGSL.includes("* smoothstepf(WP_CAST_LO, WP_CAST_HI, length(lab.yz) * scale);"));
  console.log("ok  the subject's warm pull passes through neutral: a tapped teal shadow is not turned green");
}
