// The whole pipeline on the CPU, for before/after measurements without a
// browser:
//   node --experimental-strip-types apps/motion-fix/scripts/stabilize-cpu.ts <clip.mp4> <out-prefix> [smoothing] [maxCrop]
// Decodes to 640-px gray with ffmpeg, tracks, solves the path with and
// without wobble suppression, renders both through the CPU twin of the mesh
// renderer and writes <out-prefix>-similarity.mp4 and <out-prefix>-wobble.mp4
// (gray, analysis resolution), then runs scripts/shake-metric.ts on the
// source and both outputs.
import { spawnSync } from "node:child_process";
import { homographyFromSimilarity } from "../src/lib/homography.ts";
import { computeStabilizedPath, HOMOGRAPHY_STATE, MODEL_CODE, warpFnAtTime, wobbleCoverage, type MotionAnalysis, type StabilizedPath } from "../src/lib/stabilize.ts";
import { MotionTracker } from "../src/lib/tracker.ts";
import { renderThroughMesh } from "../test/synth.ts";
import { measure } from "./shake-metric.ts";

const [file, outPrefix, smoothingArg, cropArg] = process.argv.slice(2);
if (!file || !outPrefix) {
  console.error("usage: stabilize-cpu.ts <clip> <out-prefix> [smoothing] [maxCrop]");
  process.exit(2);
}
const probe = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate", "-of", "csv=p=0", file], { encoding: "utf8" });
const [wStr, hStr, rate] = probe.stdout.trim().split(",");
const width = Number(wStr);
const height = Number(hStr);
const [num, den] = rate.split("/").map(Number);
const fps = num / (den || 1);
const aw = 640;
const ah = Math.round((height * aw) / width / 2) * 2;
const raw = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-vf", `scale=${aw}:${ah}`, "-pix_fmt", "gray", "-f", "rawvideo", "-"], { maxBuffer: 2 ** 31 });
if (raw.status !== 0) throw new Error(raw.stderr.toString());
const bytes = raw.stdout;
const frameSize = aw * ah;
const n = Math.floor(bytes.length / frameSize);

// Track at the analysis size itself, so source px == analysis px.
const tracker = new MotionTracker(aw, ah);
const gray = new Float32Array(frameSize);
const motion = new Float64Array(4 * n);
const cumulative = new Float64Array(4 * n);
const times = new Float64Array(n);
const inliers = new Uint16Array(n);
const tracked = new Uint16Array(n);
const rms = new Float32Array(n);
const model = new Uint8Array(n);
const homography = new Float64Array(9 * n);
const homographyState = new Uint8Array(n);
let c = { a: 1, b: 0, tx: 0, ty: 0 };
let upgrades = 0;
for (let t = 0; t < n; t++) {
  for (let i = 0; i < frameSize; i++) gray[i] = bytes[t * frameSize + i];
  const m = tracker.stepGray(gray);
  motion.set([m.a, m.b, m.tx, m.ty], 4 * t);
  c = { a: m.a * c.a - m.b * c.b, b: m.b * c.a + m.a * c.b, tx: m.a * c.tx - m.b * c.ty + m.tx, ty: m.b * c.tx + m.a * c.ty + m.ty };
  cumulative.set([c.a, c.b, c.tx, c.ty], 4 * t);
  times[t] = t / fps;
  inliers[t] = m.inliers;
  tracked[t] = m.tracked;
  rms[t] = m.rms;
  model[t] = MODEL_CODE[m.model];
  homography.set(m.homography ?? homographyFromSimilarity(m), 9 * t);
  homographyState[t] = HOMOGRAPHY_STATE[m.homographyState];
  if (m.homography) upgrades++;
}
const analysis: MotionAnalysis = { width: aw, height: ah, analysisWidth: aw, analysisHeight: ah, frameCount: n, frameRate: fps, times, motion, cumulative, inliers, tracked, rms, model, homography, homographyState, trackMsPerFrame: 0 };
const params = { smoothing: Number(smoothingArg ?? 0.8), maxCrop: Number(cropArg ?? 0.15) };
console.log(`${file}: ${n} frames ${width}x${height}@${fps.toFixed(2)} (analysed at ${aw}x${ah}); homography kept on ${upgrades}/${n - 1} pairs`);

function render(path: StabilizedPath, out: string): void {
  const src = new Float32Array(frameSize);
  const dst = new Float32Array(frameSize);
  const video = Buffer.alloc(frameSize * n);
  for (let t = 0; t < n; t++) {
    for (let i = 0; i < frameSize; i++) src[i] = bytes[t * frameSize + i];
    renderThroughMesh(src, aw, ah, warpFnAtTime(path, times[t]), dst);
    for (let i = 0; i < frameSize; i++) video[t * frameSize + i] = Math.round(dst[i]);
  }
  const enc = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "gray", "-s", `${aw}x${ah}`, "-r", String(fps), "-i", "-", "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", out], { input: video, maxBuffer: 2 ** 31 });
  if (enc.status !== 0) throw new Error(enc.stderr.toString());
}

const variants: [string, boolean][] = [["similarity", false], ["wobble", true]];
const outputs: [string, string][] = [["source", file]];
for (const [name, wobble] of variants) {
  const path = computeStabilizedPath(analysis, { ...params, wobble });
  const coverage = wobbleCoverage(path);
  const out = `${outPrefix}-${name}.mp4`;
  render(path, out);
  console.log(`  ${name}: wobble applied on ${coverage.applied}/${n} frames; zoom mean ${path.stats.meanZoom.toFixed(3)} max ${path.stats.maxUsedZoom.toFixed(3)}; solve ${path.stats.solveMs.toFixed(0)} ms -> ${out}`);
  outputs.push([name, out]);
}
for (const [name, clip] of outputs) {
  const r = measure(clip);
  console.log(`  ${name.padEnd(10)} mean |translation| ${r.meanShift.toFixed(2)} px/frame, mean |rotation| ${r.meanRotDeg.toFixed(3)}°/frame, jitter RMS ${r.jitterRms.toFixed(2)} px, fit residual ${r.meanRms.toFixed(3)} px`);
}
