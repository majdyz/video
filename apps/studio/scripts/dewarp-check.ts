// Dewarp spot-check on real clips, the Studio's own path end to end:
//   node --experimental-strip-types apps/studio/scripts/dewarp-check.ts <clip> <out-prefix> [time-s]
// Detects the camera from the file (detectClipCamera, as the Studio does),
// picks the profile the Studio would pick (detectedProfile -> profileDefaults),
// renders one frame through the CPU twin of the warp shader and writes a
// before | after JPEG (<prefix>-dewarp.jpg) to eyeball straight lines.
import { spawnSync } from "node:child_process";
import { openAsBlob } from "node:fs";
import { renderCpu } from "../../dewarp/src/cpu-warp.ts";
import { detectClipCamera } from "../src/pipeline/camera.ts";
import { dewarpParams, dewarpUniforms } from "../src/pipeline/dewarp.ts";
import { DEFAULT_DEWARP, detectedProfile, profileDefaults } from "../src/pipeline/tools.ts";

const [clip, prefix, tArg] = process.argv.slice(2);
if (!clip || !prefix) {
  console.error("usage: dewarp-check.ts <clip> <out-prefix> [time-s]");
  process.exit(2);
}
const pr = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", clip], { encoding: "utf8" });
const [cw, ch] = pr.stdout.trim().split(",").map(Number);
const blob = await openAsBlob(clip);
const file = new File([blob], clip.split("/").pop() ?? "clip.mp4");
const camera = await detectClipCamera(file, cw, ch);
const id = detectedProfile(camera);
const d = { ...DEFAULT_DEWARP, enabled: true, ...(id ? profileDefaults(id) : {}) };
const p = dewarpParams(d, cw, ch, camera);
console.log(`${clip.split("/").pop()}: ${cw}x${ch}; camera ${[camera.brand, camera.model, camera.lensMode].filter(Boolean).join(" ") || "unknown"}, stabilisation ${camera.stabilization ?? "?"}; profile ${id ?? `(none detected -> ${d.profile})`}; lens ${p.lens ? `fx ${p.lens.fx.toFixed(0)} k ${p.lens.k.map((k) => k.toFixed(3)).join(",")}` : `fov ${p.fovDeg}`}${camera.lensSource ? ` (${camera.lensSource})` : ""}; strength ${d.strength}, zoom ${p.zoom.toFixed(3)}`);
console.log(`  evidence: ${camera.evidence.join("; ")}`);
// One frame at a working size (the warp is resolution independent in normalised coordinates).
const W = 960;
const H = Math.round((ch * W) / cw / 2) * 2;
const raw = spawnSync("ffmpeg", ["-v", "error", "-ss", tArg ?? "3", "-i", clip, "-frames:v", "1", "-vf", `scale=${W}:${H}`, "-pix_fmt", "rgba", "-f", "rawvideo", "-"], { maxBuffer: 1 << 28 }).stdout;
const img = { width: W, height: H, data: new Uint8ClampedArray(raw.buffer, raw.byteOffset, W * H * 4) };
// The warp works in source pixels of the image it samples: uniforms at the working size (the lens scales with it).
const out = renderCpu(img, dewarpUniforms(d, W, H, camera));
const both = Buffer.alloc(2 * W * H * 4);
for (let y = 0; y < H; y++) {
  Buffer.from(img.data.buffer, img.data.byteOffset + y * W * 4, W * 4).copy(both, y * 2 * W * 4);
  Buffer.from(out.buffer, out.byteOffset + y * W * 4, W * 4).copy(both, y * 2 * W * 4 + W * 4);
}
const enc = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${2 * W}x${H}`, "-i", "-", "-frames:v", "1", "-q:v", "3", `${prefix}-dewarp.jpg`], { input: both });
if (enc.status !== 0) throw new Error(enc.stderr.toString());
console.log(`  wrote ${prefix}-dewarp.jpg (source | dewarped)`);
