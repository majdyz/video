// Offline evaluation of the Aqua Fix engine on still images.
//   node --experimental-strip-types scripts/aqua-eval.ts <out dir> <image...> [--strength 1] [--clarity 0.45] [--saturation 1] [--veil 1]
// For each image: analyse a 320×180 thumbnail exactly as the app does, grade
// the full image with the CPU reference, write <name>-graded.png and a
// before/after side-by-side <name>-compare.jpg, and print the fitted params.
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { analyzeThumbnail, ANALYSIS_W, ANALYSIS_H } from "../apps/aqua-fix/src/engine/analyze.ts";
import { applyGrade } from "../apps/aqua-fix/src/engine/apply.ts";
import { DEFAULT_SETTINGS, type UserSettings } from "../apps/aqua-fix/src/engine/params.ts";

const require = createRequire(path.join(process.cwd(), "apps/aqua-fix/package.json"));
const sharp = require("sharp") as typeof import("sharp");

const args = process.argv.slice(2);
const flag = (name: string, def: number) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? parseFloat(args[i + 1]) : def;
};
const settings: UserSettings = {
  intensity: flag("intensity", DEFAULT_SETTINGS.intensity),
  saturation: flag("saturation", DEFAULT_SETTINGS.saturation),
  clarity: flag("clarity", DEFAULT_SETTINGS.clarity),
  veil: flag("veil", DEFAULT_SETTINGS.veil),
  look: flag("look", DEFAULT_SETTINGS.look),
};
const maxW = flag("maxw", 1600);
const positional = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
const [outDir, ...images] = positional;
if (!outDir || images.length === 0) {
  console.error("usage: aqua-eval.ts <out dir> <image...> [--strength n] [--clarity n] [--saturation n] [--veil n] [--maxw px]");
  process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });

for (const file of images) {
  const name = path.basename(file).replace(/\.[^.]+$/, "");
  const t0 = performance.now();
  const base = sharp(file).rotate().resize({ width: maxW, withoutEnlargement: true });
  const { data, info } = await base.clone().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const full = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
  // Thumbnail for analysis: letterbox-free resize into the 16:9 analysis box
  // (the app downscales the whole frame, so stretch rather than crop).
  const thumb = await sharp(file).rotate().resize(ANALYSIS_W, ANALYSIS_H, { fit: "fill" }).ensureAlpha().raw().toBuffer();
  const thumbPx = new Uint8ClampedArray(thumb.buffer, thumb.byteOffset, thumb.byteLength);
  const analysis = analyzeThumbnail(thumbPx, ANALYSIS_W, ANALYSIS_H);
  const t1 = performance.now();
  // Warm timing: the app analyses every ~100 ms, so the JIT-warm cost matters.
  const tw0 = performance.now();
  for (let k = 0; k < 3; k++) analyzeThumbnail(thumbPx, ANALYSIS_W, ANALYSIS_H);
  const warmMs = (performance.now() - tw0) / 3;
  const graded = applyGrade({ params: analysis.params, settings, depth: analysis.depth, clahe: analysis.clahe }, full, info.width, info.height);
  const t2 = performance.now();
  const gradedPng = path.join(outDir, `${name}-graded.png`);
  await sharp(Buffer.from(graded.buffer), { raw: { width: info.width, height: info.height, channels: 4 } }).png().toFile(gradedPng);
  // Side-by-side at half width each, JPEG for quick viewing.
  const half = Math.min(960, info.width);
  const left = await sharp(Buffer.from(full.buffer), { raw: { width: info.width, height: info.height, channels: 4 } }).resize({ width: half }).png().toBuffer();
  const right = await sharp(Buffer.from(graded.buffer), { raw: { width: info.width, height: info.height, channels: 4 } }).resize({ width: half }).png().toBuffer();
  const lh = (await sharp(left).metadata()).height!;
  await sharp({ create: { width: half * 2 + 4, height: lh, channels: 3, background: "#000" } })
    .composite([{ input: left, left: 0, top: 0 }, { input: right, left: half + 4, top: 0 }])
    .jpeg({ quality: 88 })
    .toFile(path.join(outDir, `${name}-compare.jpg`));
  const p = analysis.params;
  const f = (v: number[]) => v.map((x) => x.toFixed(2)).join(",");
  console.log(
    `${name}: ${info.width}x${info.height} analyse ${(t1 - t0).toFixed(0)}ms (warm ${warmMs.toFixed(0)}ms) apply ${(t2 - t1).toFixed(0)}ms | ` +
      `Binf ${f(p.binf)} betaB ${f(p.betaB)} cB ${f(p.cB)} attn ${f(p.attn)} wb ${f(p.wb)} exp ${p.exposure.toFixed(2)} ` +
      `levels ${p.black.toFixed(3)}..${p.white.toFixed(3)} z ${p.zLo.toFixed(2)}..${p.zHi.toFixed(2)} mean ${f(analysis.mean)}`,
  );
}
