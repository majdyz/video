// Hybrid gyro + visual on the CPU: gyro-only vs hybrid on one clip.
//   node --experimental-strip-types apps/motion-fix/scripts/hybrid-cpu.ts <clip> <out-prefix> [smoothing] [maxCrop]
// Env:
//   BOB=ax,ay,f    add a synthetic bob before anything sees the frames: lateral
//                  sway ax and vertical heave ay (fractions of the frame
//                  height) at f Hz (sway at f/2), plus a little 3f jitter —
//                  the telemetry stays untouched, so the gyro cannot see it.
//   MEDIUM=air|water|auto   lens medium (default auto = picture check)
//   NO_RENDER=1    plans only;  NO_METRIC=1  skip the output tracker metric
//   CACHE=path     read/write the residual track (skips the tracking pass)
// Writes <prefix>-gyro.mp4, <prefix>-hybrid.mp4 (640 px gray) and with BOB <prefix>-src.mp4.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { open } from "node:fs/promises";
import { computeGyroPlan, frameTimesOf, gyroWarpFnAtTime, DEFAULT_GYRO_PARAMS, WATER_INDEX, type GyroPlan } from "../src/lib/gyro/gyro-stabilize.ts";
import { ResidualCollector, type ResidualMotion } from "../src/lib/gyro/hybrid.ts";
import { checkMedium, checkWindows, PairCollector } from "../src/lib/gyro/medium.ts";
import type { RangeReader } from "../src/lib/gyro/mp4-index.ts";
import { probeTelemetry } from "../src/lib/gyro/telemetry.ts";
import { renderThroughMesh } from "../test/synth.ts";
import { measure } from "./shake-metric.ts";
import { MotionTracker } from "../src/lib/tracker.ts";

/**
 * Low-frequency wander of a clip: the tracker's cumulative translation
 * minus its 0.5 s Gaussian (what is left is heave/sway and shake, a slow
 * pan is not), RMS in 640-px units.
 */
function wander(clip: string, fps: number): number {
  const w = 640;
  const pr = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", clip], { encoding: "utf8" });
  const [cw, ch] = pr.stdout.trim().split(",").map(Number);
  const h = Math.round((ch * w) / cw / 2) * 2;
  const raw = spawnSync("ffmpeg", ["-v", "error", "-i", clip, "-vf", `scale=${w}:${h}`, "-pix_fmt", "gray", "-f", "rawvideo", "-"], { maxBuffer: 2 ** 31 }).stdout;
  const n = Math.floor(raw.length / (w * h));
  const tr = new MotionTracker(w, h);
  const g = new Float32Array(w * h);
  const cx: number[] = [];
  const cy: number[] = [];
  let x = 0;
  let y = 0;
  for (let t = 0; t < n; t++) {
    for (let i = 0; i < w * h; i++) g[i] = raw[t * w * h + i];
    const m = tr.stepGray(g);
    if (t > 0) {
      x += m.tx;
      y += m.ty;
    }
    cx.push(x);
    cy.push(y);
  }
  const sig = 0.5 * fps;
  const r = Math.ceil(3 * sig);
  let acc = 0;
  let cnt = 0;
  for (let t = r; t < n - r; t++) {
    let sx = 0, sy = 0, sw = 0;
    for (let k = -r; k <= r; k++) {
      const wk = Math.exp(-(k * k) / (2 * sig * sig));
      sx += wk * cx[t + k];
      sy += wk * cy[t + k];
      sw += wk;
    }
    acc += (cx[t] - sx / sw) ** 2 + (cy[t] - sy / sw) ** 2;
    cnt++;
  }
  return Math.sqrt(acc / Math.max(1, cnt));
}

const [file, prefix, sArg, cArg] = process.argv.slice(2);
if (!file || !prefix) {
  console.error("usage: hybrid-cpu.ts <clip> <out-prefix> [smoothing] [maxCrop]");
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
const probe = await probeTelemetry(read, size);
await fh.close();
if (probe.status !== "ok") {
  console.log(`${file}: telemetry ${probe.status}: ${"reason" in probe ? probe.reason : ""}`);
  process.exit(1);
}
const motion = probe.motion;
console.log(`${file}: ${motion.camera}, lens ${motion.lens.kind} f=${motion.lens.fx.toFixed(1)} (${motion.lens.source}), EIS ${motion.eis.label}, ${motion.video.width}x${motion.video.height} ${motion.video.fps.toFixed(2)} fps, ${motion.video.frameCount} frames`);
if (motion.video.rotation !== 0) throw new Error("rotated clips are not handled by this script");
// START=s DUR=s: work on a stretch of a long clip (telemetry shifted to match).
const start = Number(process.env.START ?? 0);
const dur = process.env.DUR ? Number(process.env.DUR) : 0;
if (start || dur) {
  const d = dur || motion.video.duration - start;
  motion.times = motion.times.map((t) => t - start);
  motion.video = { ...motion.video, duration: d, frameCount: Math.round(d * motion.video.fps) };
  console.log(`  stretch ${start}..${start + d} s (${motion.video.frameCount} frames)`);
}
const seek = start || dur ? ["-ss", String(start), ...(dur ? ["-t", String(dur)] : [])] : [];

function decode(w: number): { data: Buffer; w: number; h: number; n: number } {
  const h = Math.round((motion.video.height * w) / motion.video.width / 2) * 2;
  const raw = spawnSync("ffmpeg", ["-v", "error", ...seek, "-i", file, "-vf", `scale=${w}:${h}`, "-pix_fmt", "gray", "-f", "rawvideo", "-"], { maxBuffer: 2 ** 31 });
  if (raw.status !== 0) throw new Error(raw.stderr.toString());
  return { data: raw.stdout, w, h, n: Math.floor(raw.stdout.length / (w * h)) };
}

// Synthetic bob (fractions of the height) at frame time t.
const bob = process.env.BOB ? process.env.BOB.split(",").map(Number) : null;
function bobAt(t: number): [number, number] {
  if (!bob) return [0, 0];
  const [ax, ay, f] = bob;
  const x = ax * Math.sin(Math.PI * f * t + 0.7) + 0.15 * ax * Math.sin(2 * Math.PI * 3 * f * t + 1.3);
  const y = ay * Math.sin(2 * Math.PI * f * t) + 0.2 * ay * Math.sin(2 * Math.PI * 2.3 * f * t + 0.4) + 0.1 * ay * Math.sin(2 * Math.PI * 3.7 * f * t);
  return [x, y];
}
function shifted(src: Buffer, off: number, w: number, h: number, dx: number, dy: number, out: Float32Array): void {
  // out(x, y) = src(x − dx, y − dy), bilinear, edges clamped.
  for (let y = 0; y < h; y++) {
    const sy = Math.min(h - 1.001, Math.max(0, y - dy));
    const y0 = Math.floor(sy);
    const fy = sy - y0;
    for (let x = 0; x < w; x++) {
      const sx = Math.min(w - 1.001, Math.max(0, x - dx));
      const x0 = Math.floor(sx);
      const fx = sx - x0;
      const i = off + y0 * w + x0;
      out[y * w + x] = (src[i] * (1 - fx) + src[i + 1] * fx) * (1 - fy) + (src[i + w] * (1 - fx) + src[i + w + 1] * fx) * fy;
    }
  }
}
const times = frameTimesOf(motion);
function frameAt(d: { data: Buffer; w: number; h: number }, t: number, out: Float32Array): void {
  const size = d.w * d.h;
  if (!bob) {
    for (let i = 0; i < size; i++) out[i] = d.data[t * size + i];
    return;
  }
  const [bx, by] = bobAt(times[Math.min(t, times.length - 1)]);
  shifted(d.data, t * size, d.w, d.h, bx * d.h, by * d.h, out);
}

// Tracking pass at the app's analysis size (480 px long edge).
const track = decode(480);
const tg = new Float32Array(track.w * track.h);
{
  const collector = new PairCollector(track.w, track.h, motion.lens.width / track.w);
  for (const [w0, w1] of checkWindows(motion.video.duration)) {
    collector.reset();
    for (let t = 0; t < track.n && t < times.length; t++) {
      if (times[t] < w0 || times[t] > w1) continue;
      frameAt(track, t, tg);
      collector.push(times[t], tg);
    }
  }
  motion.medium = checkMedium(motion, collector.pairs);
  const m = motion.medium;
  console.log(`  picture check: ${m.pairs} pairs, ${m.points} points; median error air ${m.errAir.toFixed(2)} px, water ${m.errWater.toFixed(2)} px, still ${m.errStill.toFixed(2)} px -> ${m.detected ?? "undecided"}${m.consistent ? "" : " (gyro does NOT match the picture)"}`);
}
function residualPass(withBob: boolean, cache: string | undefined): ResidualMotion {
  if (cache && existsSync(cache)) {
    const j = JSON.parse(readFileSync(cache, "utf8"));
    return { ...j, times: Float64Array.from(j.times), air: Float32Array.from(j.air), water: Float32Array.from(j.water), points: Uint16Array.from(j.points) };
  }
  const rc = new ResidualCollector(motion, track.w, track.h, WATER_INDEX);
  const t0 = performance.now();
  for (let t = 0; t < track.n && t < times.length; t++) {
    if (withBob) frameAt(track, t, tg);
    else for (let i = 0; i < tg.length; i++) tg[i] = track.data[t * tg.length + i];
    rc.push(times[t], tg);
  }
  const r = rc.finish();
  console.log(`  residual tracking ${track.w}x${track.h}: ${r.trackMsPerFrame.toFixed(1)} ms/frame, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  if (cache) writeFileSync(cache, JSON.stringify({ ...r, times: [...r.times], air: [...r.air], water: [...r.water], points: [...r.points] }));
  return r;
}
const cache = process.env.CACHE;
const residual = residualPass(!!bob, cache);

const params = {
  ...DEFAULT_GYRO_PARAMS,
  smoothing: Number(sArg ?? DEFAULT_GYRO_PARAMS.smoothing),
  maxCrop: Number(cArg ?? DEFAULT_GYRO_PARAMS.maxCrop),
  medium: (process.env.MEDIUM ?? "auto") as "auto" | "air" | "water",
};
const gyro = computeGyroPlan(motion, params);
const hybrid = computeGyroPlan(motion, params, residual);
const h = hybrid.hybrid!;
const zs = (p: GyroPlan): string => `zoom mean ${p.stats.meanZoom.toFixed(3)} max ${p.stats.maxUsedZoom.toFixed(3)}`;
console.log(`  gyro:   ${zs(gyro)}, rotation jitter ${gyro.stats.virtJitter.toFixed(3)}°/frame², solve ${gyro.stats.solveMs.toFixed(0)} ms`);
console.log(`  hybrid: ${zs(hybrid)}, ${h.applied ? "applied" : "NOT applied"} (${h.reason}); accepted ${(h.acceptedFrac * 100).toFixed(0)}% ${JSON.stringify(h.rejected)}; residual jitter ${h.jitterBefore.toFixed(3)} -> ${h.jitterAfter.toFixed(3)} px, wander ${h.wanderBefore.toFixed(2)} -> ${h.wanderAfter.toFixed(2)} px (480-px units), max shift ${h.maxShift.toFixed(1)} px, limited ${h.limitedFrames}, solve ${hybrid.stats.solveMs.toFixed(0)} ms`);
if (process.env.NO_RENDER) process.exit(0);

const ren = decode(640);
const fps = motion.video.fps;
const fsz = ren.w * ren.h;
const src = new Float32Array(fsz);
const dst = new Float32Array(fsz);
const outs: [string, GyroPlan | null][] = [[`${prefix}-gyro.mp4`, gyro], [`${prefix}-hybrid.mp4`, hybrid]];
if (bob || seek.length) outs.unshift([`${prefix}-src.mp4`, null]);
for (const [out, plan] of outs) {
  const video = Buffer.alloc(fsz * ren.n);
  for (let t = 0; t < ren.n; t++) {
    frameAt(ren, t, src);
    if (plan) {
      const warp = gyroWarpFnAtTime(motion, plan, plan.frameTimes[Math.min(t, plan.frameTimes.length - 1)], ren.w, ren.h);
      renderThroughMesh(src, ren.w, ren.h, warp, dst);
    } else dst.set(src);
    for (let i = 0; i < fsz; i++) video[t * fsz + i] = Math.round(dst[i]);
  }
  const enc = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "gray", "-s", `${ren.w}x${ren.h}`, "-r", String(fps), "-i", "-", "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", out], { input: video, maxBuffer: 2 ** 31 });
  if (enc.status !== 0) throw new Error(enc.stderr.toString());
}
if (bob) {
  // Ground truth: the same method on the clean frames. Each output's
  // per-frame offset from its clean twin is the injected bob that survived
  // (tracked pairwise): gyro-only keeps all of it, a perfect hybrid none.
  const cleanRes = residualPass(false, cache ? `${cache}.clean` : undefined);
  const hybridClean = computeGyroPlan(motion, params, cleanRes);
  console.log(`  hybrid on the clean clip: ${zs(hybridClean)}, ${hybridClean.hybrid?.applied ? "applied" : "not applied"} (${hybridClean.hybrid?.reason})`);
  const renderClean = (plan: GyroPlan): Uint8Array => {
    const out = new Uint8Array(fsz * ren.n);
    for (let t = 0; t < ren.n; t++) {
      for (let i = 0; i < fsz; i++) src[i] = ren.data[t * fsz + i];
      const warp = gyroWarpFnAtTime(motion, plan, plan.frameTimes[Math.min(t, plan.frameTimes.length - 1)], ren.w, ren.h);
      renderThroughMesh(src, ren.w, ren.h, warp, dst);
      for (let i = 0; i < fsz; i++) out[t * fsz + i] = Math.round(dst[i]);
    }
    return out;
  };
  const refs: Record<string, Uint8Array> = { gyro: renderClean(gyro), hybrid: renderClean(hybridClean) };
  for (const [out, plan] of outs) {
    if (!plan) continue;
    const ref = plan === gyro ? refs.gyro : refs.hybrid;
    const raw = spawnSync("ffmpeg", ["-v", "error", "-i", out, "-pix_fmt", "gray", "-f", "rawvideo", "-"], { maxBuffer: 2 ** 31 }).stdout;
    const ox: number[] = [];
    const oy: number[] = [];
    const g = new Float32Array(fsz);
    const rf = new Float32Array(fsz);
    for (let t = 0; t < ren.n; t++) {
      const tr = new MotionTracker(ren.w, ren.h);
      for (let i = 0; i < fsz; i++) rf[i] = ref[t * fsz + i];
      tr.stepGray(rf);
      for (let i = 0; i < fsz; i++) g[i] = raw[t * fsz + i];
      const m = tr.stepGray(g);
      ox.push(m.tx);
      oy.push(m.ty);
    }
    // Remove the slow common part (a fixed offset or 2 s drift is not bob).
    const sig = 2 * fps;
    const r = Math.ceil(2.5 * sig);
    let acc = 0;
    let j2 = 0;
    for (let t = 0; t < ox.length; t++) {
      let sx = 0, sy = 0, sw = 0;
      for (let k = -r; k <= r; k++) {
        const u = Math.min(ox.length - 1, Math.max(0, t + k));
        const wk = Math.exp(-(k * k) / (2 * sig * sig));
        sx += wk * ox[u];
        sy += wk * oy[u];
        sw += wk;
      }
      acc += (ox[t] - sx / sw) ** 2 + (oy[t] - sy / sw) ** 2;
      if (t >= 2) j2 += (ox[t] - 2 * ox[t - 1] + ox[t - 2]) ** 2 + (oy[t] - 2 * oy[t - 1] + oy[t - 2]) ** 2;
    }
    console.log(`  bob left in ${out.split("/").pop()}: RMS ${Math.sqrt(acc / ox.length).toFixed(2)} px (640-px units), offset jitter ${Math.sqrt(j2 / Math.max(1, ox.length - 2)).toFixed(3)} px`);
  }
}
if (!process.env.NO_METRIC) {
  const list: [string, string][] = [["source", bob || seek.length ? `${prefix}-src.mp4` : file], ["gyro", `${prefix}-gyro.mp4`], ["hybrid", `${prefix}-hybrid.mp4`]];
  for (const [name, clip] of list) {
    const r = measure(clip);
    console.log(`  ${name.padEnd(8)} mean |translation| ${r.meanShift.toFixed(2)} px/frame, mean |rotation| ${r.meanRotDeg.toFixed(3)}°/frame, jitter RMS ${r.jitterRms.toFixed(3)} px, wander ${wander(clip, fps).toFixed(2)} px, fit residual ${r.meanRms.toFixed(3)} px`);
  }
}
