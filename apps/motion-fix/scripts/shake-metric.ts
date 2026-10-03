// Frame-to-frame motion metric for before/after comparisons:
//   node --experimental-strip-types apps/motion-fix/scripts/shake-metric.ts <clip.mp4> [more clips...]
// Decodes with ffmpeg to 640-px gray frames, runs the app's own tracker and
// prints the mean |translation| and |rotation| per frame plus the RMS of the
// second difference (the "shake" a viewer perceives: constant pans are not
// shake, jitter is).
import { spawnSync } from "node:child_process";
import { MotionTracker } from "../src/lib/tracker.ts";

function probe(file: string): { w: number; h: number } {
  const out = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file], { encoding: "utf8" });
  if (out.status !== 0) throw new Error(out.stderr);
  const [w, h] = out.stdout.trim().split(",").map(Number);
  return { w, h };
}

export function measure(file: string): { frames: number; meanShift: number; meanRotDeg: number; jitterRms: number; meanRms: number; msPerFrame: number } {
  const { w, h } = probe(file);
  const aw = 640;
  const ah = Math.round((h * aw) / w / 2) * 2;
  const raw = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-vf", `scale=${aw}:${ah}`, "-pix_fmt", "gray", "-f", "rawvideo", "-"], { maxBuffer: 1 << 30 });
  if (raw.status !== 0) throw new Error(raw.stderr.toString());
  const bytes = raw.stdout;
  const frameSize = aw * ah;
  const frames = Math.floor(bytes.length / frameSize);
  const tracker = new MotionTracker(aw, ah);
  const gray = new Float32Array(frameSize);
  const tx: number[] = [];
  const ty: number[] = [];
  let shift = 0;
  let rot = 0;
  let rms = 0;
  let fitted = 0;
  let elapsed = 0;
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < frameSize; i++) gray[i] = bytes[f * frameSize + i];
    const t0 = performance.now();
    const m = tracker.stepGray(gray);
    elapsed += performance.now() - t0;
    if (f === 0) continue;
    shift += Math.hypot(m.tx, m.ty);
    rot += Math.abs(Math.atan2(m.b, m.a));
    tx.push(m.tx);
    ty.push(m.ty);
    if (m.model !== "identity") {
      rms += m.rms;
      fitted++;
    }
  }
  let jitter = 0;
  for (let i = 1; i < tx.length; i++) jitter += (tx[i] - tx[i - 1]) ** 2 + (ty[i] - ty[i - 1]) ** 2;
  return {
    frames,
    meanShift: shift / Math.max(1, frames - 1),
    meanRotDeg: ((rot / Math.max(1, frames - 1)) * 180) / Math.PI,
    jitterRms: Math.sqrt(jitter / Math.max(1, tx.length - 1)),
    // Mean inlier residual of the similarity fit: what no similarity can remove (wobble, parallax, noise).
    meanRms: rms / Math.max(1, fitted),
    msPerFrame: elapsed / frames,
  };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "")) {
  for (const file of process.argv.slice(2)) {
    const r = measure(file);
    console.log(
      `${file}: ${r.frames} frames, mean |translation| ${r.meanShift.toFixed(2)} px/frame, ` +
        `mean |rotation| ${r.meanRotDeg.toFixed(3)}°/frame, jitter RMS ${r.jitterRms.toFixed(2)} px, fit residual ${r.meanRms.toFixed(3)} px (640-px units), tracker ${r.msPerFrame.toFixed(1)} ms/frame`,
    );
  }
}
