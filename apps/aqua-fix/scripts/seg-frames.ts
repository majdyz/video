// Offline check of the AI subject restore (params.ts SEG_RESTORE) on real frames, with the CPU reference and a
// hand-made mask: does the subject stay in the scene's light?
//
//   ffmpeg -ss 7.9 -i clip.mov -frames:v 1 -vf scale=180:320 -pix_fmt rgba -f rawvideo close.rgba
//   node --experimental-strip-types apps/aqua-fix/scripts/seg-frames.ts <name>=<file.rgba>:<u0,v0,u1,v1>:<ratio> ... [--engine <dir>]
//
// Each frame is 180×320 RGBA. The mask is every pixel inside the box (u0..v1, 0..1) whose green is under `ratio` ×
// the water's on its row (the box's left and right margins), cleaned by a 3×3 majority: good enough for a dark
// animal on open water. `--engine` points at another copy of src/engine (an older commit, to compare).
// Prints, for the plain grade and Pop 50 / 100 with the mask as an AI overlay: the subject's and the surrounding
// water's mean RGB, their Oklab hue and the hue difference, the subject's chroma as a share of the plain grade's
// (100% = all of the cast kept, 0 = neutral; over the whole mask, and over its core 3.5 px inside the contour), which
// side of neutral it is on, its lightness against the water, and the colour step across the mask's contour.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const ei = args.indexOf("--engine");
const engine = ei >= 0 ? path.resolve(args.splice(ei, 2)[1]) : path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/engine");
const load = (f: string) => import(pathToFileURL(path.join(engine, f)).href);
const { analyzeThumbnail, ANALYSIS_W, ANALYSIS_H } = await load("analyze.ts");
const { applyGrade } = await load("apply.ts");
const { linearToOklab, srgbToLinear } = await load("color.ts");
const { SEG_TONE } = await load("grade-shader.ts");
const { DEFAULT_SETTINGS, SEG_RESTORE, guideTexture } = await load("params.ts");
const so = await load("seg-overlay.ts");
const { composeSegStrength, popContrast, popDirection } = so;

const W = 180, H = 320;

/** Chamfer distance (px) from each texel where `on` to the nearest where not. */
function dist(on: Uint8Array): Float32Array {
  const d = new Float32Array(W * H).map((_, i) => (on[i] ? 1e6 : 0));
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? 1e6 : d[y * W + x]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[y * W + x]) d[y * W + x] = Math.min(d[y * W + x], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.414, at(x + 1, y - 1) + 1.414);
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) if (d[y * W + x]) d[y * W + x] = Math.min(d[y * W + x], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.414, at(x - 1, y + 1) + 1.414);
  return d;
}

const lab = (c: number[]) => linearToOklab(srgbToLinear(c[0] / 255), srgbToLinear(c[1] / 255), srgbToLinear(c[2] / 255)) as [number, number, number];
const deg = (a: number, b: number) => ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
const wx = Math.cos(SEG_RESTORE.hue), wy = Math.sin(SEG_RESTORE.hue);

for (const spec of args) {
  const [name, rest] = spec.split("=");
  const [file, box, ratio] = rest.split(":");
  const [u0, v0, u1, v1] = box.split(",").map(Number);
  const px = new Uint8ClampedArray(fs.readFileSync(file));
  if (px.length !== W * H * 4) throw new Error(`${file}: expected ${W}×${H} RGBA`);
  // The hand-made mask.
  const x0 = Math.round(u0 * W), x1 = Math.round(u1 * W), y0 = Math.round(v0 * H), y1 = Math.round(v1 * H), m = 4;
  const raw = new Uint8Array(W * H);
  for (let y = y0; y < y1; y++) {
    let g = 0, n = 0;
    for (let x = x0; x < x1; x++) if (x < x0 + m || x >= x1 - m) { g += px[(y * W + x) * 4 + 1]; n++; }
    for (let x = x0 + m; x < x1 - m; x++) if (px[(y * W + x) * 4 + 1] < Number(ratio) * (g / n)) raw[y * W + x] = 1;
  }
  const on = new Uint8Array(W * H);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    let c = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) c += raw[(y + dy) * W + x + dx];
    on[y * W + x] = c >= 5 ? 1 : 0;
  }
  const dIn = dist(on), dOut = dist(Uint8Array.from(on, (v) => 1 - v));
  const alpha = new Float32Array(W * H), near = new Float32Array(W * H).fill(1);
  for (let i = 0; i < W * H; i++) alpha[i] = Math.min(1, Math.max(0, 0.5 + (on[i] ? dIn[i] - 0.5 : -(dOut[i] - 0.5)) / (2 * SEG_TONE.alphaR)));
  const area = on.reduce((s, v) => s + v, 0) / (W * H);

  const th = new Uint8ClampedArray(ANALYSIS_W * ANALYSIS_H * 4);
  for (let y = 0; y < ANALYSIS_H; y++) for (let x = 0; x < ANALYSIS_W; x++) {
    const s = (Math.min(H - 1, Math.floor(((y + 0.5) / ANALYSIS_H) * H)) * W + Math.min(W - 1, Math.floor(((x + 0.5) / ANALYSIS_W) * W))) * 4;
    th.set(px.subarray(s, s + 4), (y * ANALYSIS_W + x) * 4);
  }
  const an = analyzeThumbnail(th, ANALYSIS_W, ANALYSIS_H);
  const guide = { width: an.depth.width, height: an.depth.height, data: guideTexture(an.depth) };
  const overlay = { width: W, height: H, alpha, exclude: null, near, depart: null, quality: 1 };
  const strength = composeSegStrength(overlay, guide);
  const pc = popContrast(guide, overlay), popDir = pc === null ? 1 : popDirection(pc);
  const grade = (pop: number | null) => applyGrade({ params: an.params, settings: { ...DEFAULT_SETTINGS, vivid: 1, seabed: 0.6, subjectPop: pop !== null, subjectPopStrength: pop ?? 0.5, subjectPopWarmth: 0.5 }, depth: an.depth, clahe: an.clahe, ...(pop !== null ? { seg: { strength, popDir } } : {}) }, px, W, H);
  const mean = (p: Uint8ClampedArray, where: (i: number) => boolean) => {
    const s = [0, 0, 0]; let n = 0;
    for (let i = 0; i < W * H; i++) if (where(i)) { for (let c = 0; c < 3; c++) s[c] += p[i * 4 + c]; n++; }
    return s.map((v) => v / Math.max(1, n));
  };
  const subj = (i: number) => on[i] === 1, ring = (i: number) => !on[i] && dOut[i] >= 3 && dOut[i] <= 12;
  // The outermost ring of the mask against the water just outside it: the colour step at the boundary.
  const edgeIn = (i: number) => on[i] === 1 && dIn[i] <= 1.5, edgeOut = (i: number) => !on[i] && dOut[i] <= 2.5;
  let deepest = 0;
  for (let i = 0; i < W * H; i++) if (on[i]) deepest = Math.max(deepest, (strength.data[i * 4 + 2] - 0.5) * 2 * SEG_TONE.alphaR);
  // The subject's stand-off from its local water on the guide (mean Oklab ΔE) and the closeness that comes to
  // (seg-overlay.ts subjectCloseness; absent in an engine copy from before it).
  let sepText = "";
  if (so.waterField && so.subjectCloseness) {
    const wf = so.waterField(guide, overlay);
    if (wf?.sep) {
      let sum = 0, n = 0;
      for (let i = 0; i < wf.sep.dE.length; i++) if (wf.sep.inside[i]) { sum += wf.sep.dE[i]; n++; }
      const c = so.subjectCloseness(overlay, wf.sep);
      sepText = `, stand-off ΔE ${(sum / Math.max(1, n)).toFixed(3)} over ${n} guide texels → closeness ${Math.max(...c).toFixed(2)}`;
    }
  }
  console.log(`\n${name}: mask ${(area * 100).toFixed(1)}% of the frame, pop direction ${popDir.toFixed(2)}, deepest read-back distance ${deepest.toFixed(1)} of ${SEG_TONE.alphaR} px${sepText}`);
  console.log("  grade     subject RGB      water RGB        hue subj/water (diff)   chroma  cast kept (core)  side     L subj−water  edge step ΔE");
  const core = (i: number) => on[i] === 1 && dIn[i] >= 3.5;
  const off = grade(null), [, a0, b0] = lab(mean(off, subj)), [, ac0, bc0] = lab(mean(off, core));
  const C0 = Math.hypot(a0, b0), Cc0 = Math.hypot(ac0, bc0);
  for (const [label, p] of [["source", px], ["plain", off], ["Pop 50", grade(0.5)], ["Pop 100", grade(1)]] as const) {
    const s = mean(p, subj), w = mean(p, ring), [Ls, as, bs] = lab(s), [Lw, aw, bw] = lab(w);
    const hs = deg(as, bs), hw = deg(aw, bw), dh = ((hs - hw + 540) % 360) - 180;
    const ei = lab(mean(p, edgeIn)), eo = lab(mean(p, edgeOut));
    const [, ac, bc] = lab(mean(p, core));
    const kept = label === "source" ? "   –         " : `${((Math.hypot(as, bs) / C0) * 100).toFixed(0).padStart(4)}% (${((Math.hypot(ac, bc) / Cc0) * 100).toFixed(0).padStart(3)}%) `;
    console.log(`  ${label.padEnd(8)}  ${s.map((v) => Math.round(v).toString().padStart(3)).join(" ")}      ${w.map((v) => Math.round(v).toString().padStart(3)).join(" ")}      ${hs.toFixed(0).padStart(3)}° / ${hw.toFixed(0).padStart(3)}° (${dh >= 0 ? "+" : ""}${dh.toFixed(0)}°)`.padEnd(64) + `   ${Math.hypot(as, bs).toFixed(3)}   ${kept}    ${as * wx + bs * wy < 0 ? "water" : "WARM "}    ${(Ls - Lw >= 0 ? "+" : "") + (Ls - Lw).toFixed(3)}        ${Math.hypot(ei[0] - eo[0], ei[1] - eo[1], ei[2] - eo[2]).toFixed(3)}`);
  }
}
