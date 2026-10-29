// Source colour of the analysis' sand reference over a clip (per analysed frame).
//   node --experimental-strip-types apps/aqua-fix/eval/sand-track.ts <clip> [--every 4]
// Prints t, sand weight / share, the reference's mean source colour (linear,
// before any de-scatter) as R/G, B/G and luminance: a camera white-balance or
// exposure drift shows here as a trend on the same material.
import { spawnSync } from "node:child_process";
import { analyzeThumbnail, ANALYSIS_H, ANALYSIS_W } from "../src/engine/analyze.ts";
import { SRGB_TO_LINEAR_LUT } from "../src/engine/color.ts";

const clip = process.argv[2];
const ei = process.argv.indexOf("--every");
const EVERY = ei > 0 ? parseInt(process.argv[ei + 1]) : 4;
const r = spawnSync("ffmpeg", ["-v", "error", "-i", clip, "-vf", `scale=${ANALYSIS_W}:${ANALYSIS_H}:flags=area:in_color_matrix=bt709:in_range=tv:out_range=pc,format=rgba`, "-fps_mode", "passthrough", "-f", "rawvideo", "-"], { maxBuffer: 2 ** 31 });
const fpsOut = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate", "-of", "csv=p=0", clip], { encoding: "utf8" }).stdout.trim().split("/").map(Number);
const fps = fpsOut[0] / (fpsOut[1] || 1);
const size = ANALYSIS_W * ANALYSIS_H * 4;
const buf = r.stdout as Buffer;
console.log("t,weight,frac,srcR/G,srcB/G,srcY,wb_r,wb_b");
for (let f = 0, o = 0; o + size <= buf.length; f++, o += size) {
  if (f % EVERY) continue;
  const px = new Uint8ClampedArray(buf.buffer, buf.byteOffset + o, size);
  const a = analyzeThumbnail(px, ANALYSIS_W, ANALYSIS_H);
  const m = a.diag!.sandMask;
  let R = 0, G = 0, B = 0, k = 0;
  for (let i = 0; i < m.length; i++) if (m[i]) { R += SRGB_TO_LINEAR_LUT[px[i * 4]]; G += SRGB_TO_LINEAR_LUT[px[i * 4 + 1]]; B += SRGB_TO_LINEAR_LUT[px[i * 4 + 2]]; k++; }
  const p = a.params;
  console.log([(f / fps).toFixed(2), a.diag!.sandWeight.toFixed(2), a.diag!.sandFrac.toFixed(3), k ? (R / G).toFixed(3) : "", k ? (B / G).toFixed(3) : "", k ? ((0.2126 * R + 0.7152 * G + 0.0722 * B) / k).toFixed(3) : "", p.wb[0].toFixed(2), p.wb[2].toFixed(2)].join(","));
}
