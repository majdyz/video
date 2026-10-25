// Fast parameter study for the visual (v2) path: tracks each clip once
// (cached next to the cache dir), then solves the path for each variant and
// prints the virtual-camera residual (stabilize.ts residualMotion) and zoom
// behaviour — no rendering, so a sweep takes seconds.
//   node --experimental-strip-types apps/motion-fix/scripts/v2-eval.ts '<json variants>' <cacheDir> clip...
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { homographyFromSimilarity } from "../src/lib/homography.ts";
import { computeStabilizedPath, HOMOGRAPHY_STATE, MODEL_CODE, rawMotion, residualMotion, type MotionAnalysis, type StabilizeParams } from "../src/lib/stabilize.ts";
import { MotionTracker } from "../src/lib/tracker.ts";

export function trackClip(file: string, cacheDir: string): MotionAnalysis {
  mkdirSync(cacheDir, { recursive: true });
  const cache = `${cacheDir}/${basename(file)}.analysis.json`;
  if (existsSync(cache)) {
    const j = JSON.parse(readFileSync(cache, "utf8"));
    const typed: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(j)) {
      if (Array.isArray(v)) {
        const ctor = { motion: Float64Array, cumulative: Float64Array, times: Float64Array, homography: Float64Array, inliers: Uint16Array, tracked: Uint16Array, rms: Float32Array, model: Uint8Array, homographyState: Uint8Array }[k] ?? Float64Array;
        typed[k] = ctor.from(v as number[]);
      } else typed[k] = v;
    }
    return typed as unknown as MotionAnalysis;
  }
  const probe = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate", "-of", "csv=p=0", file], { encoding: "utf8" });
  const [wStr, hStr, rate] = probe.stdout.trim().split(",");
  const [num, den] = rate.split("/").map(Number);
  const fps = num / (den || 1);
  const width = Number(wStr);
  const height = Number(hStr);
  // Same analysis size rule as the app (480 px long edge at >= 50 fps).
  const long = fps >= 50 ? 480 : 640;
  const aw = width >= height ? long : Math.round((width * long) / height / 2) * 2;
  const ah = width >= height ? Math.round((height * long) / width / 2) * 2 : long;
  const raw = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-vf", `scale=${aw}:${ah}`, "-pix_fmt", "gray", "-f", "rawvideo", "-"], { maxBuffer: 2 ** 31 });
  const bytes = raw.stdout;
  const frameSize = aw * ah;
  const n = Math.floor(bytes.length / frameSize);
  const tracker = new MotionTracker(aw, ah);
  const gray = new Float32Array(frameSize);
  const a: MotionAnalysis = {
    width: aw, height: ah, analysisWidth: aw, analysisHeight: ah, frameCount: n, frameRate: fps,
    times: new Float64Array(n), motion: new Float64Array(4 * n), cumulative: new Float64Array(4 * n), inliers: new Uint16Array(n), tracked: new Uint16Array(n), rms: new Float32Array(n), model: new Uint8Array(n), homography: new Float64Array(9 * n), homographyState: new Uint8Array(n), trackMsPerFrame: 0,
  };
  let c = { a: 1, b: 0, tx: 0, ty: 0 };
  for (let t = 0; t < n; t++) {
    for (let i = 0; i < frameSize; i++) gray[i] = bytes[t * frameSize + i];
    const m = tracker.stepGray(gray);
    a.motion.set([m.a, m.b, m.tx, m.ty], 4 * t);
    c = { a: m.a * c.a - m.b * c.b, b: m.b * c.a + m.a * c.b, tx: m.a * c.tx - m.b * c.ty + m.tx, ty: m.b * c.tx + m.a * c.ty + m.ty };
    a.cumulative.set([c.a, c.b, c.tx, c.ty], 4 * t);
    a.times[t] = t / fps;
    a.inliers[t] = m.inliers;
    a.tracked[t] = m.tracked;
    a.rms[t] = m.rms;
    a.model[t] = MODEL_CODE[m.model];
    a.homography.set(m.homography ?? homographyFromSimilarity(m), 9 * t);
    a.homographyState[t] = HOMOGRAPHY_STATE[m.homographyState];
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(a)) out[k] = ArrayBuffer.isView(v) ? Array.from(v as unknown as ArrayLike<number>) : v;
  writeFileSync(cache, JSON.stringify(out));
  return a;
}

/** Zoom behaviour: mean, max, and how much it moves (total variation per second, peak rate per second). */
export function zoomStats(zoom: Float32Array, fps: number): { mean: number; max: number; tvPerSec: number; peakRate: number } {
  let mean = 0;
  let max = 1;
  let tv = 0;
  let peak = 0;
  for (let i = 0; i < zoom.length; i++) {
    mean += zoom[i];
    max = Math.max(max, zoom[i]);
    if (i) {
      tv += Math.abs(zoom[i] - zoom[i - 1]);
      peak = Math.max(peak, Math.abs(zoom[i] - zoom[i - 1]) * fps);
    }
  }
  return { mean: mean / zoom.length, max, tvPerSec: (tv / Math.max(1, zoom.length - 1)) * fps, peakRate: peak };
}

if (process.argv[1]?.endsWith("v2-eval.ts")) {
  const [vjson, cacheDir, ...clips] = process.argv.slice(2);
  const variants: StabilizeParams[] = JSON.parse(vjson);
  for (const clip of clips) {
    const a = trackClip(clip, cacheDir);
    const r0 = rawMotion(a);
    console.log(`${basename(clip)}: ${a.frameCount} frames @${a.frameRate.toFixed(1)}  raw: shift ${r0.meanShift.toFixed(2)} rot ${r0.meanRotationDeg.toFixed(3)} jitter ${r0.jitterRms.toFixed(2)}`);
    for (const v of variants) {
      const p = computeStabilizedPath(a, v);
      const r = residualMotion(a, p);
      const z = zoomStats(p.zoom, a.frameRate);
      console.log(`  ${JSON.stringify(v).padEnd(60)} jitter ${r.jitterRms.toFixed(3)} shift ${r.meanShift.toFixed(2)} rot ${r.meanRotationDeg.toFixed(3)} | zoom ${z.mean.toFixed(3)}/${z.max.toFixed(3)} tv ${z.tvPerSec.toFixed(4)}/s peak ${z.peakRate.toFixed(3)}/s | ${p.stats.solveMs.toFixed(0)} ms`);
    }
  }
}
