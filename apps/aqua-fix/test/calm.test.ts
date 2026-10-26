// Do-no-harm (calm.ts) and the sand white reference, on synthetic frames.
//   node --experimental-strip-types apps/aqua-fix/test/calm.test.ts
import assert from "node:assert/strict";
import { analyzeThumbnail, ANALYSIS_W, ANALYSIS_H } from "../src/engine/analyze.ts";
import { applyGrade, resolveContext } from "../src/engine/apply.ts";
import { CALM, calmEvidence, calmParams, calmScores, calmSettings } from "../src/engine/calm.ts";
import { linearToOklab, srgbToLinear } from "../src/engine/color.ts";
import { DEFAULT_SETTINGS, IDENTITY_PARAMS, packUniforms, resolveSettings, type GradeParams } from "../src/engine/params.ts";

const W = ANALYSIS_W, H = ANALYSIS_H;
function frame(fill: (x: number, y: number) => [number, number, number]): Uint8ClampedArray {
  const px = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const [r, g, b] = fill(x / W, y / H);
    const i = (y * W + x) * 4;
    px[i] = Math.min(1, Math.max(0, r)) * 255 + 0.5; px[i + 1] = Math.min(1, Math.max(0, g)) * 255 + 0.5; px[i + 2] = Math.min(1, Math.max(0, b)) * 255 + 0.5; px[i + 3] = 255;
  }
  return px;
}
function noise(seed: number): number { const s = Math.sin(seed * 12.9898) * 43758.5453; return s - Math.floor(s); }
const grain = (u: number, v: number, a = 0.03) => (noise(u * 977 + v * 331) - 0.5) * a;
const lab = (px: Uint8ClampedArray, i: number) => linearToOklab(srgbToLinear(px[i * 4] / 255), srgbToLinear(px[i * 4 + 1] / 255), srgbToLinear(px[i * 4 + 2] / 255));
function regionLab(px: Uint8ClampedArray, inside: (u: number, v: number) => boolean): { L: number; C: number; hue: number } {
  let L = 0, a = 0, b = 0, C = 0, k = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!inside(x / W, y / H)) continue;
    const [l, aa, bb] = lab(px, y * W + x); L += l; a += aa; b += bb; C += Math.hypot(aa, bb); k++;
  }
  return { L: L / k, C: C / k, hue: ((Math.atan2(b / k, a / k) * 180) / Math.PI + 360) % 360 };
}
function meanAbsDiff(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let s = 0; for (let i = 0; i < a.length; i += 4) s += (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3;
  return s / (a.length / 4);
}
const grade = (px: Uint8ClampedArray) => { const a = analyzeThumbnail(px, W, H); return { a, out: applyGrade({ params: a.params, settings: DEFAULT_SETTINGS, depth: a.depth, clahe: a.clahe }, px, W, H) }; };

// 1. calmParams: identity at 0, near-identity grade parameters at full calm.
{
  const p: GradeParams = { ...IDENTITY_PARAMS, wb: [2.2, 1, 0.8], waterWb: [1.6, 1, 0.9], attn: [0.8, 0, -0.2], binf: [0.01, 0.1, 0.8], exposure: 0.75, levelsMix: 0.5, haze: 0.4, hazeBlack: 0.05, hazeFloor: [0.01, 0.04, 0.06], knee: 0.75 };
  assert.deepEqual(calmParams(p), p, "no calm field: unchanged");
  assert.deepEqual(calmParams({ ...p, calm: 0, calmTone: 0 }), { ...p, calm: 0, calmTone: 0 });
  const c = calmParams({ ...p, calm: 1, calmTone: 1 });
  for (const g of [...c.wb, ...c.waterWb]) assert.ok(Math.abs(g - 1) < 1e-9);
  assert.deepEqual([...c.attn, ...c.binf].map((x) => Math.abs(x) < 1e-12), [true, true, true, true, true, true]);
  assert.ok(Math.abs(c.exposure - 1) < 1e-9 && c.levelsMix === 0 && c.haze === 0 && c.hazeBlack === 0 && c.knee === CALM.knee);
  const colourOnly = calmParams({ ...p, calm: 1, calmTone: 0 });
  assert.equal(colourOnly.exposure, p.exposure, "colour calm leaves tone alone");
  assert.equal(calmSettings(resolveSettings(DEFAULT_SETTINGS), { ...p, calmTone: 1 }).clarity, 0, "tone calm: no local contrast");
  console.log("ok  calmParams / calmSettings");
}

// 2. Uniform packing applies the same calm as the CPU reference (the shaders
//    read only uniforms, so CPU/GLSL/WGSL parity follows).
{
  const p: GradeParams = { ...IDENTITY_PARAMS, wb: [2.0, 1, 1.2], exposure: 0.8, levelsMix: 0.5, calm: 0.6, calmTone: 0.5 };
  const depth = { width: 1, height: 1, fields: new Float32Array(4), guide: new Float32Array(3) };
  const clahe = { tilesX: 1, tilesY: 1, bins: 1, data: new Float32Array(1) };
  const u = packUniforms(p, DEFAULT_SETTINGS, depth, clahe, 0, 0);
  const ctx = resolveContext({ params: p, settings: DEFAULT_SETTINGS, depth, clahe });
  const near = (x: number, y: number) => Math.abs(x - y) < 1e-6;
  assert.ok(near(u[20], ctx.params.wb[0]) && near(u[22], ctx.params.wb[2]) && near(u[23], ctx.params.exposure), "wb / exposure");
  assert.ok(near(u[26], ctx.params.levelsMix) && near(u[27], ctx.settings.clarity), "levels / clarity");
  assert.ok(u[20] < 2.0 && u[23] > 0.8, "calm reached the uniforms");
  console.log("ok  packUniforms matches resolveContext under calm");
}

// 3. Raw underwater (blue-green cast, no reds): no calm at all.
{
  const px = frame((u, v) => {
    const n = grain(u, v);
    const rock = v > 0.5 && (Math.floor(u * 9) + Math.floor(v * 7)) % 2 === 0;
    return rock ? [0.12 + n, 0.42 + n, 0.45 + n] : [0.03 + n, 0.35 + 0.2 * (1 - v) + n, 0.55 + 0.2 * (1 - v) + n];
  });
  const { a } = grade(px);
  assert.ok((a.params.calm ?? 0) < 0.05 && (a.params.calmTone ?? 0) < 0.05, `raw: calm ${a.params.calm} tone ${a.params.calmTone}`);
  console.log("ok  raw blue-green frame is not calmed", a.params.calm?.toFixed(2), a.params.calmTone?.toFixed(2));
}

// 4. Topside (neutral-ish greens, greys, warm road, blue sky): calmTone high
//    and the grade stays close to the source.
{
  const px = frame((u, v) => {
    const n = grain(u, v, 0.04);
    if (v < 0.15) return [0.55 + n, 0.68 + n, 0.85 + n]; // sky (a sky-dominated frame reads like shallow blue water: see calm.ts)
    if (v < 0.65) return (Math.floor(u * 10) % 2 === 0) ? [0.25 + n, 0.4 + n, 0.15 + n] : [0.5 + n, 0.48 + n, 0.44 + n]; // trees / buildings
    if (v < 0.72) return [0.04 + n / 4, 0.04 + n / 4, 0.035 + n / 4]; // shadows under the trees
    return u < 0.3 ? [0.65 + n, 0.38 + n, 0.3 + n] : [0.32 + n, 0.31 + n, 0.3 + n]; // red-brown road edge / asphalt
  });
  const { a, out } = grade(px);
  assert.ok((a.params.calmTone ?? 0) > 0.7, `topside tone calm ${a.params.calmTone} ${JSON.stringify(a.diag?.calm)}`);
  const d = meanAbsDiff(px, out);
  assert.ok(d < 4, `topside |Δ| ${d.toFixed(2)} / 255`);
  console.log("ok  topside passes nearly unchanged", a.params.calmTone?.toFixed(2), `|Δ| ${d.toFixed(2)}`);
}

// 5. Already-balanced reef: blue water, cyan-white rubble and a red coral
//    head. Colour calm high; the coral keeps its hue and chroma within a few
//    percent instead of being pushed by a red ×2 gain. (A red share this large
//    — ~15 % of the frame — also reads as graded / lit footage, so the tone
//    calm engages too: see CALM.redToneLo/Hi.)
{
  const coral = (u: number, v: number) => u < 0.25 && v > 0.4;
  const px = frame((u, v) => {
    const n = grain(u, v);
    if (coral(u, v)) return [0.62 + n, 0.3 + n, 0.28 + n];
    if (v > 0.55) return [0.35 + n, 0.75 + n, 0.82 + n]; // cyan-white rubble
    return [0.02 + n, 0.2 + 0.1 * v + n, 0.52 + n]; // blue water
  });
  const { a, out } = grade(px);
  assert.ok((a.params.calm ?? 0) > 0.7, `balanced: calm ${a.params.calm} tone ${a.params.calmTone}`);
  const s = regionLab(px, coral), o = regionLab(out, coral);
  assert.ok(Math.abs(o.hue - s.hue) < 6 && o.C < s.C * 1.15, `coral ${s.hue.toFixed(0)}°/${s.C.toFixed(3)} → ${o.hue.toFixed(0)}°/${o.C.toFixed(3)}`);
  console.log("ok  balanced reef keeps its coral", `${s.hue.toFixed(0)}°/${s.C.toFixed(3)} → ${o.hue.toFixed(0)}°/${o.C.toFixed(3)}`);
}

// 6. Sand under a green-cyan cast: a large, grainy, bright patch is used as
//    the white reference — the graded sand ends close to neutral.
{
  const sand = (u: number, v: number) => v > 0.45 && (Math.floor(u * 16) + Math.floor(v * 9)) % 7 !== 0;
  const px = frame((u, v) => {
    const n = grain(u, v, 0.08);
    // Dark seagrass tufts and rocks give the frame a real black point (else
    // the haze lift reads the water as a lifted floor).
    if (v > 0.45 && (Math.floor(u * 16) + Math.floor(v * 9)) % 7 === 0) return [0.04 + n / 4, 0.09 + n / 4, 0.06 + n / 4];
    if (sand(u, v)) return [0.5 + n, 0.7 + n, 0.52 + n];
    const k = 1 - v;
    return [0.12 + 0.02 * k, 0.42 + 0.1 * k, 0.33 + 0.08 * k]; // green-cyan water
  });
  const { a, out } = grade(px);
  const s = regionLab(px, sand), o = regionLab(out, sand);
  assert.ok((a.diag?.sandWeight ?? 0) > 0.5, `sand reference found: ${a.diag?.sandWeight}`);
  assert.ok(o.C < 0.03 && o.C < s.C * 0.5, `sand chroma ${s.C.toFixed(3)} → ${o.C.toFixed(3)} hue ${o.hue.toFixed(0)} wb ${a.params.wb} sand ${a.diag?.sandWeight} ${a.diag?.sandFrac} calm ${a.params.calm}`);
  console.log("ok  sand ends near white", `C ${s.C.toFixed(3)}/${s.hue.toFixed(0)}° → ${o.C.toFixed(3)}/${o.hue.toFixed(0)}°`, "wb", a.params.wb.map((x) => x.toFixed(2)).join(","));
}

// 7. Open blue water only (bright and smooth near the surface): no sand
//    reference, so nothing pushes the balance.
{
  const px = frame((u, v) => { const n = grain(u, v, 0.006); const k = 1 - v; return [0.1 + 0.25 * k + n, 0.45 + 0.3 * k + n, 0.7 + 0.25 * k + n]; });
  const a = analyzeThumbnail(px, W, H);
  assert.equal(a.diag?.sandWeight ?? 0, 0, "smooth water is not sand");
  console.log("ok  open water is not a white reference");
}

// 8. Evidence scores behave as documented.
{
  const n = 64, lin = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { lin[i * 3] = 0.3; lin[i * 3 + 1] = 0.31; lin[i * 3 + 2] = 0.29; }
  const e = calmEvidence(lin, n);
  assert.ok(e.noCast > 0.9 && e.reds === 0);
  assert.ok(calmScores(e, 0).calmTone > 0.8 && calmScores(e, 0.6).calmTone === 0, "haze gates topside");
  console.log("ok  evidence scores");
}
