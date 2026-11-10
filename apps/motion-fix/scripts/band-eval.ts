// What a viewer sees, split by frequency: the scene's trajectory in OUTPUT
// pixels (zoom included, so a tighter crop magnifies what is left) through
// three Gaussian bands —
//   jitter  > 3 Hz          (shake, vibration, tracking noise)
//   bob     0.3 .. 3 Hz     (fin kicks, swim strokes, surge pulses)
//   wander  < 0.3 Hz        (pans, drift; reported as speed, mostly intended)
// plus rotation in the same bands and the zoom. Tracks each clip once
// (cached by v2-eval's trackClip), so a sweep over variants takes seconds.
//   node --experimental-strip-types apps/motion-fix/scripts/band-eval.ts '<json variants>' <cacheDir> clip...
// A variant {"source":true} reports the unstabilised clip.
import { basename } from "node:path";
import { computeStabilizedPath, type MotionAnalysis, type StabilizedPath, type StabilizeParams } from "../src/lib/stabilize.ts";
import { compose, invert, type Similarity } from "../src/lib/tracker.ts";
import { trackClip, zoomStats } from "./v2-eval.ts";

function gauss(x: Float64Array, sigma: number): Float64Array {
  const n = x.length;
  const r = Math.max(1, Math.ceil(3 * sigma));
  const out = new Float64Array(n);
  for (let t = 0; t < n; t++) {
    let acc = 0;
    let w = 0;
    for (let i = -r; i <= r; i++) {
      const u = t + i;
      if (u < 0 || u >= n) continue; // truncated (no replicated edges: they fake a flat start)
      const k = Math.exp(-(i * i) / (2 * sigma * sigma));
      acc += k * x[u];
      w += k;
    }
    out[t] = acc / w;
  }
  return out;
}

export type Bands = { jitter: number; bob: number; wanderSpeed: number; rotJitter: number; rotBob: number };

/** Band RMS of a trajectory (px, degrees); wander as mean speed of the low band (px/s). */
export function bands(x: Float64Array, y: Float64Array, th: Float64Array, fps: number): Bands {
  const sHf = 0.1325 / 3 * fps; // -3 dB at 3 Hz
  const sLf = 0.1325 / 0.3 * fps; // -3 dB at 0.3 Hz
  const rms = (a: Float64Array, b: Float64Array | null): number => {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] ** 2 + (b ? b[i] ** 2 : 0);
    return Math.sqrt(s / Math.max(1, a.length));
  };
  const split = (v: Float64Array): [Float64Array, Float64Array, Float64Array] => {
    const hfLow = gauss(v, sHf);
    const lf = gauss(v, sLf);
    const hf = v.map((q, i) => q - hfLow[i]);
    const mid = hfLow.map((q, i) => q - lf[i]);
    return [hf, mid, lf];
  };
  const [xh, xm, xl] = split(x);
  const [yh, ym, yl] = split(y);
  const [th_h, th_m] = split(th);
  let speed = 0;
  for (let i = 1; i < x.length; i++) speed += Math.hypot(xl[i] - xl[i - 1], yl[i] - yl[i - 1]);
  return { jitter: rms(xh, yh), bob: rms(xm, ym), wanderSpeed: (speed / Math.max(1, x.length - 1)) * fps, rotJitter: rms(th_h, null), rotBob: rms(th_m, null) };
}

/**
 * Scene trajectory in output pixels: G_t = Z_t ∘ W_t⁻¹ ∘ C_t ∘ W_0⁻¹... measured
 * as where the output-frame centre's scene point of frame 0 lands in each
 * output frame, plus the scene's rotation, so pans show up as wander.
 */
export function outputTrajectory(a: MotionAnalysis, path: StabilizedPath | null): { x: Float64Array; y: Float64Array; th: Float64Array } {
  const n = a.frameCount;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const th = new Float64Array(n);
  const read = (arr: Float64Array, t: number): Similarity => ({ a: arr[4 * t], b: arr[4 * t + 1], tx: arr[4 * t + 2], ty: arr[4 * t + 3] });
  const w0 = path ? read(path.warp, 0) : { a: 1, b: 0, tx: 0, ty: 0 };
  for (let t = 0; t < n; t++) {
    const w = path ? read(path.warp, t) : { a: 1, b: 0, tx: 0, ty: 0 };
    const z = path ? path.zoom[t] : 1;
    // Scene point under output pixel 0 of frame 0 lives at source W_0(0) in frame 0, C_t W_0(0) in frame t, W_t⁻¹ C_t W_0(0) in output t.
    const g = compose(invert(w), compose(read(a.cumulative, t), w0));
    x[t] = g.tx * z;
    y[t] = g.ty * z;
    th[t] = (Math.atan2(g.b, g.a) * 180) / Math.PI;
  }
  return { x, y, th };
}

if (process.argv[1]?.endsWith("band-eval.ts")) {
  const [vjson, cacheDir, ...clips] = process.argv.slice(2);
  const variants: (StabilizeParams & { source?: boolean; label?: string })[] = JSON.parse(vjson);
  for (const clip of clips) {
    const a = trackClip(clip, cacheDir);
    // Report in px of a 640-px long edge whatever the analysis size.
    const k = 640 / Math.max(a.width, a.height);
    console.log(`${basename(clip)}: ${a.frameCount} frames @${a.frameRate.toFixed(1)} (${a.width}x${a.height})`);
    for (const v of variants) {
      const path = v.source ? null : computeStabilizedPath(a, v);
      const tr = outputTrajectory(a, path);
      const b = bands(tr.x.map((q) => q * k), tr.y.map((q) => q * k), tr.th, a.frameRate);
      const z = path ? zoomStats(path.zoom, a.frameRate) : { mean: 1, max: 1, tvPerSec: 0, peakRate: 0 };
      const label = v.label ?? (v.source ? "source" : JSON.stringify(v));
      console.log(
        `  ${label.padEnd(44)} jitter ${b.jitter.toFixed(2)} bob ${b.bob.toFixed(2)} px  rot ${b.rotJitter.toFixed(3)}/${b.rotBob.toFixed(3)}°  wander ${b.wanderSpeed.toFixed(1)} px/s | zoom ${z.mean.toFixed(3)}/${z.max.toFixed(3)}${path ? ` ${path.stats.solveMs.toFixed(0)} ms` : ""}`,
      );
    }
  }
}
