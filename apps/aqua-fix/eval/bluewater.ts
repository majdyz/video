// Grades still images as the studio's three styles (Natural, Vivid, Blue water) on the CPU reference.
//   node --experimental-strip-types apps/aqua-fix/eval/bluewater.ts <out dir> <image...> [--w 600]
// Writes <out>/<name>-{natural,vivid,blue}.png at `w` px wide (and <name>-src.png), for
// eval/bluewater_metrics.py (water hue/chroma vs a human-graded reference) and the boards.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { analyzeThumbnail, ANALYSIS_H, ANALYSIS_W } from "../src/engine/analyze.ts";
import { applyGrade } from "../src/engine/apply.ts";
import { DEFAULT_SETTINGS, type UserSettings } from "../src/engine/params.ts";

const args = process.argv.slice(2);
const opt = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const [outDir, ...images] = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
const W = parseInt(opt("w", "600"));
const require = createRequire(path.resolve(path.dirname(new URL(import.meta.url).pathname), "../package.json"));
const sharp = require("sharp") as typeof import("sharp");
fs.mkdirSync(outDir, { recursive: true });

// The studio's colourSettings() for each style (seabed is GPU-only, so it is left out here).
const STYLES: Record<string, UserSettings> = {
  natural: { ...DEFAULT_SETTINGS, vivid: 0, blue: 0 },
  vivid: { ...DEFAULT_SETTINGS, vivid: 1, blue: 0 },
  blue: { ...DEFAULT_SETTINGS, vivid: 1, blue: 1 },
};

for (const file of images) {
  const name = path.basename(file).replace(/\.[^.]+$/, "");
  const { data, info } = await sharp(file).rotate().resize({ width: W }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const full = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
  const thumb = await sharp(file).rotate().resize(ANALYSIS_W, ANALYSIS_H, { fit: "fill" }).ensureAlpha().raw().toBuffer();
  const a = analyzeThumbnail(new Uint8ClampedArray(thumb.buffer, thumb.byteOffset, thumb.byteLength), ANALYSIS_W, ANALYSIS_H);
  const raw = { raw: { width: info.width, height: info.height, channels: 4 as const } };
  await sharp(Buffer.from(full.buffer, full.byteOffset, full.byteLength), raw).png().toFile(path.join(outDir, `${name}-src.png`));
  for (const [id, settings] of Object.entries(STYLES)) {
    const g = applyGrade({ params: a.params, settings, depth: a.depth, clahe: a.clahe }, full, info.width, info.height);
    await sharp(Buffer.from(g.buffer, g.byteOffset, g.byteLength), raw).png().toFile(path.join(outDir, `${name}-${id}.png`));
  }
  console.log(`${name}: ${info.width}x${info.height}`);
}
