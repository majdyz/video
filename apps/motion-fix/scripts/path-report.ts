// Runs the pure pipeline (tracker -> L1 path -> zoom) on a clip in Node and
// prints what the browser would compute, for tuning without a browser:
//   node --experimental-strip-types apps/motion-fix/scripts/path-report.ts <clip.mp4> [smoothing] [maxCrop]
// FIDELITY=0,0.1,0.5 sweeps the fidelity weight on the same analysis.
import { spawnSync } from "node:child_process";
import { computeStabilizedPath, rawMotion, residualMotion, HOMOGRAPHY_STATE, MODEL_CODE, type MotionAnalysis } from "../src/lib/stabilize.ts";
import { GRUNDMANN_WEIGHTS } from "../src/lib/path-l1.ts";
import { homographyFromSimilarity, rescaleH } from "../src/lib/homography.ts";
import { MotionTracker } from "../src/lib/tracker.ts";

const [file, smoothingArg, cropArg] = process.argv.slice(2);
if (!file) {
  console.error("usage: path-report.ts <clip> [smoothing] [maxCrop]");
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
const bytes = raw.stdout;
const frameSize = aw * ah;
const n = Math.floor(bytes.length / frameSize);
const tracker = new MotionTracker(aw, ah);
const gray = new Float32Array(frameSize);
const scale = width / aw;
const motion = new Float64Array(4 * n);
const cumulative = new Float64Array(4 * n);
const times = new Float64Array(n);
const inliers = new Uint16Array(n);
const tracked = new Uint16Array(n);
const rms = new Float32Array(n);
const model = new Uint8Array(n);
const homography = new Float64Array(9 * n);
const homographyState = new Uint8Array(n);
let upgrades = 0;
let c = { a: 1, b: 0, tx: 0, ty: 0 };
let ms = 0;
for (let t = 0; t < n; t++) {
  for (let i = 0; i < frameSize; i++) gray[i] = bytes[t * frameSize + i];
  const t0 = performance.now();
  const m = tracker.stepGray(gray);
  ms += performance.now() - t0;
  const tx = m.tx * scale;
  const ty = m.ty * scale;
  motion.set([m.a, m.b, tx, ty], 4 * t);
  c = { a: m.a * c.a - m.b * c.b, b: m.b * c.a + m.a * c.b, tx: m.a * c.tx - m.b * c.ty + tx, ty: m.b * c.tx + m.a * c.ty + ty };
  cumulative.set([c.a, c.b, c.tx, c.ty], 4 * t);
  times[t] = t / fps;
  inliers[t] = m.inliers;
  tracked[t] = m.tracked;
  rms[t] = m.rms;
  model[t] = MODEL_CODE[m.model];
  homography.set(m.homography ? rescaleH(m.homography, scale) : homographyFromSimilarity({ a: m.a, b: m.b, tx, ty }), 9 * t);
  homographyState[t] = HOMOGRAPHY_STATE[m.homographyState];
  if (m.homography) upgrades++;
}
const analysis: MotionAnalysis = { width, height, analysisWidth: aw, analysisHeight: ah, frameCount: n, frameRate: fps, times, motion, cumulative, inliers, tracked, rms, model, homography, homographyState, trackMsPerFrame: ms / n };
const params = { smoothing: Number(smoothingArg ?? 0.8), maxCrop: Number(cropArg ?? 0.15) };
const rawSummary = rawMotion(analysis);
const models = [0, 0, 0, 0];
for (let t = 0; t < n; t++) models[model[t]]++;
console.log(`${file}: ${n} frames ${width}x${height}@${fps.toFixed(2)}, tracker ${(ms / n).toFixed(1)} ms/frame`);
console.log(`  models: similarity ${models[3]}, rigid ${models[2]}, translation ${models[1]}, identity ${models[0]}; homography upgrades ${upgrades}`);
console.log(`  raw motion ${rawSummary.meanShift.toFixed(2)} px/frame, ${rawSummary.meanRotationDeg.toFixed(3)}°/frame, jitter RMS ${rawSummary.jitterRms.toFixed(2)} px`);
const fidelities = (process.env.FIDELITY ?? String(GRUNDMANN_WEIGHTS.fidelity)).split(",").map(Number);
for (const fidelity of fidelities) {
  GRUNDMANN_WEIGHTS.fidelity = fidelity;
  const path = computeStabilizedPath(analysis, params);
  const res = residualMotion(analysis, path);
  console.log(`  fidelity ${fidelity} (smoothing ${params.smoothing}, maxCrop ${params.maxCrop}): residual ${res.meanShift.toFixed(2)} px/frame, ${res.meanRotationDeg.toFixed(3)}°/frame, jitter RMS ${res.jitterRms.toFixed(3)} px; ` +
    `zoom mean ${path.stats.meanZoom.toFixed(3)} max ${path.stats.maxUsedZoom.toFixed(3)} (cap ${path.maxZoom.toFixed(3)}); solve ${path.stats.solveMs.toFixed(0)} ms, ${path.stats.iterations} it, converged ${path.stats.converged}`);
}
