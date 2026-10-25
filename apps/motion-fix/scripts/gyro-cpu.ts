// Gyro pipeline on the CPU, for before/after measurements without a browser:
//   node --experimental-strip-types apps/motion-fix/scripts/gyro-cpu.ts <clip> <out.mp4> [smoothing] [maxCrop] [horizon] [lens|rectilinear] [width]
// Probes the telemetry with ranged reads (like the app), solves the gyro
// plan, renders every frame through the CPU twin of the mesh renderer at
// `width` px (default 640, gray) and prints the shake metric of the source
// and the output.
import { spawnSync } from "node:child_process";
import { open } from "node:fs/promises";
import { computeGyroPlan, correctionAngleDeg, frameTimesOf, gyroWarpFnAtTime, DEFAULT_GYRO_PARAMS } from "../src/lib/gyro/gyro-stabilize.ts";
import { checkMedium, checkWindows, PairCollector } from "../src/lib/gyro/medium.ts";
import type { RangeReader } from "../src/lib/gyro/mp4-index.ts";
import { probeTelemetry } from "../src/lib/gyro/telemetry.ts";
import { renderThroughMesh } from "../test/synth.ts";
import { measure } from "./shake-metric.ts";

const [file, out, sArg, cArg, hArg, oArg, wArg] = process.argv.slice(2);
if (!file || !out) {
  console.error("usage: gyro-cpu.ts <clip> <out.mp4> [smoothing] [maxCrop] [horizon] [lens|rectilinear] [width]");
  process.exit(2);
}
const fh = await open(file, "r");
const { size } = await fh.stat();
const read: RangeReader = async (off, len) => {
  const n = Math.max(0, Math.min(len, size - off));
  const b = Buffer.alloc(n);
  await fh.read(b, 0, n, off);
  return new Uint8Array(b.buffer, b.byteOffset, n);
};
const t0 = performance.now();
const probe = await probeTelemetry(read, size);
await fh.close();
const probeMs = performance.now() - t0;
if (probe.status !== "ok") {
  console.log(`${file}: telemetry ${probe.status}: ${"reason" in probe ? probe.reason : ""}`);
  process.exit(1);
}
const motion = probe.motion;
console.log(`${file}: ${motion.camera}, lens ${motion.lens.kind} f=${motion.lens.fx.toFixed(1)} k=${motion.lens.k.map((k) => k.toFixed(4)).join(",")} (${motion.lens.source}), readout ${(motion.readout * 1000).toFixed(2)} ms, EIS ${motion.eis.label}, ${motion.times.length} orientation samples, probe ${probeMs.toFixed(0)} ms`);
const dispW = motion.video.rotation % 180 ? motion.video.height : motion.video.width;
const dispH = motion.video.rotation % 180 ? motion.video.width : motion.video.height;
const aw = Number(wArg ?? 640);
const ah = Math.round((dispH * aw) / dispW / 2) * 2;
const raw = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-vf", `scale=${aw}:${ah}`, "-pix_fmt", "gray", "-f", "rawvideo", "-"], { maxBuffer: 2 ** 31 });
if (raw.status !== 0) throw new Error(raw.stderr.toString());
const frameSize = aw * ah;
const n = Math.floor(raw.stdout.length / frameSize);

// Picture check (air / water, telemetry consistency) on 4 short windows, like the app.
{
  const times = frameTimesOf(motion);
  const collector = new PairCollector(aw, ah, motion.lens.width / aw);
  const gray = new Float32Array(frameSize);
  for (const [w0, w1] of checkWindows(motion.video.duration)) {
    collector.reset();
    for (let t = 0; t < n && t < times.length; t++) {
      if (times[t] < w0 || times[t] > w1) continue;
      for (let i = 0; i < frameSize; i++) gray[i] = raw.stdout[t * frameSize + i];
      collector.push(times[t], gray);
    }
  }
  const t1 = performance.now();
  motion.medium = checkMedium(motion, collector.pairs);
  const m = motion.medium;
  console.log(`  picture check: ${m.pairs} pairs, ${m.points} points; median error air ${m.errAir.toFixed(2)} px, water ${m.errWater.toFixed(2)} px, still ${m.errStill.toFixed(2)} px -> ${m.detected ?? "undecided"}${m.consistent ? "" : " (gyro does NOT match the picture)"} (${(performance.now() - t1).toFixed(0)} ms)`);
}

const params = {
  smoothing: Number(sArg ?? DEFAULT_GYRO_PARAMS.smoothing),
  maxCrop: Number(cArg ?? DEFAULT_GYRO_PARAMS.maxCrop),
  horizonLock: Number(hArg ?? 0),
  output: (oArg === "rectilinear" ? "rectilinear" : "lens") as "lens" | "rectilinear",
  medium: (process.env.MEDIUM ?? "auto") as "auto" | "air" | "water",
};
const plan = computeGyroPlan(motion, params);
let maxCorr = 0;
for (let i = 0; i < plan.frameTimes.length; i++) maxCorr = Math.max(maxCorr, correctionAngleDeg(motion, plan, i));
console.log(`  plan: ${JSON.stringify(params)} n=${plan.n} zoom mean ${plan.stats.meanZoom.toFixed(3)} max ${plan.stats.maxUsedZoom.toFixed(3)}, limited ${plan.stats.limitedFrames}/${plan.frameTimes.length}, raw speed ${plan.stats.rawSpeed.toFixed(1)}°/s -> ${plan.stats.virtSpeed.toFixed(1)}°/s, rotation jitter ${plan.stats.rawJitter.toFixed(3)} -> ${plan.stats.virtJitter.toFixed(3)}°/frame², max correction ${maxCorr.toFixed(2)}°, solve ${plan.stats.solveMs.toFixed(0)} ms`);
if (process.env.PLAN_ONLY) process.exit(0);
const fps = motion.video.fps;
const src = new Float32Array(frameSize);
const dst = new Float32Array(frameSize);
const video = Buffer.alloc(frameSize * n);
const tr = performance.now();
let warpMs = 0;
for (let t = 0; t < n; t++) {
  for (let i = 0; i < frameSize; i++) src[i] = raw.stdout[t * frameSize + i];
  const time = plan.frameTimes[Math.min(t, plan.frameTimes.length - 1)];
  const w0 = performance.now();
  const warp = gyroWarpFnAtTime(motion, plan, time, aw, ah);
  // Time the vertex pass alone (what the browser does per frame on the CPU).
  for (let vy = 0; vy <= 36; vy++) for (let vx = 0; vx <= 64; vx++) warp((vx / 64 - 0.5) * aw, (vy / 36 - 0.5) * ah);
  warpMs += performance.now() - w0;
  renderThroughMesh(src, aw, ah, warp, dst);
  for (let i = 0; i < frameSize; i++) video[t * frameSize + i] = Math.round(dst[i]);
}
console.log(`  rendered ${n} frames at ${aw}x${ah} in ${((performance.now() - tr) / 1000).toFixed(1)} s; vertex warp ${(warpMs / n).toFixed(2)} ms/frame`);
const enc = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "gray", "-s", `${aw}x${ah}`, "-r", String(fps), "-i", "-", "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", out], { input: video, maxBuffer: 2 ** 31 });
if (enc.status !== 0) throw new Error(enc.stderr.toString());
if (!process.env.NO_METRIC) {
  for (const [name, clip] of [["source", file], ["gyro", out]] as const) {
    const r = measure(clip);
    console.log(`  ${name.padEnd(8)} mean |translation| ${r.meanShift.toFixed(2)} px/frame, mean |rotation| ${r.meanRotDeg.toFixed(3)}°/frame, jitter RMS ${r.jitterRms.toFixed(2)} px, fit residual ${r.meanRms.toFixed(3)} px`);
  }
}
