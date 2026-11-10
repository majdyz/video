// Colour side-by-side of the source and stabilised variants at the analysis
// size, streamed (one frame in memory at a time), through the CPU twin of
// the mesh renderer:
//   node --experimental-strip-types apps/motion-fix/scripts/sbs-render.ts <clip> <cacheDir> <out.mp4> '<json variants>'
// Variants as in band-eval.ts (each may carry a "label"). Uses the tracking
// cached by band-eval / v2-eval, so the paths match the printed numbers.
import { spawn } from "node:child_process";
import { computeStabilizedPath, warpFnAtTime, type StabilizeParams } from "../src/lib/stabilize.ts";
import { renderThroughMesh } from "../test/synth.ts";
import { trackClip } from "./v2-eval.ts";

const [clip, cacheDir, out, vjson] = process.argv.slice(2);
const variants: (StabilizeParams & { label?: string })[] = JSON.parse(vjson);
const a = trackClip(clip, cacheDir);
const w = a.width;
const h = a.height;
const paths = variants.map((v) => computeStabilizedPath(a, v));
const panels = 1 + paths.length;
const labels = ["source", ...variants.map((v, i) => v.label ?? `v${i}`)];
const vertical = w > h;
const ow = vertical ? w : w * panels;
const oh = vertical ? h * panels : h;

const dec = spawn("ffmpeg", ["-v", "error", "-i", clip, "-vf", `scale=${w}:${h}`, "-pix_fmt", "rgb24", "-f", "rawvideo", "-"]);
const draw = labels
  .map((l, i) => `drawtext=text='${l.replace(/[':]/g, "")}':x=${vertical ? 8 : i * w + 8}:y=${vertical ? i * h + 8 : 8}:fontsize=${Math.round(Math.min(w, h) / 18)}:fontcolor=white:box=1:boxcolor=black@0.5`)
  .join(",");
const enc = spawn("ffmpeg", ["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${ow}x${oh}`, "-r", String(a.frameRate), "-i", "-", "-vf", draw, "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", out]);
enc.stderr.pipe(process.stderr);

const frameBytes = w * h * 3;
const chan = [new Float32Array(w * h), new Float32Array(w * h), new Float32Array(w * h)];
const res = new Float32Array(w * h);
const outBuf = Buffer.alloc(ow * oh * 3);
let pending = Buffer.alloc(0);
let t = 0;

async function emit(frame: Buffer): Promise<void> {
  for (let i = 0; i < w * h; i++) for (let c = 0; c < 3; c++) chan[c][i] = frame[3 * i + c];
  const place = (p: number, get: (c: number, i: number) => number): void => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = vertical ? ((p * h + y) * ow + x) * 3 : (y * ow + p * w + x) * 3;
        for (let c = 0; c < 3; c++) outBuf[o + c] = get(c, y * w + x);
      }
    }
  };
  place(0, (c, i) => chan[c][i]);
  const time = a.times[Math.min(t, a.frameCount - 1)];
  for (let p = 0; p < paths.length; p++) {
    const warp = warpFnAtTime(paths[p], time);
    const planes: Uint8Array[] = [];
    for (let c = 0; c < 3; c++) {
      renderThroughMesh(chan[c], w, h, warp, res);
      planes.push(Uint8Array.from(res, (v) => Math.max(0, Math.min(255, Math.round(v)))));
    }
    place(p + 1, (c, i) => planes[c][i]);
  }
  t++;
  if (!enc.stdin.write(outBuf)) await new Promise((r) => enc.stdin.once("drain", r));
}

for await (const chunk of dec.stdout) {
  pending = Buffer.concat([pending, chunk as Buffer]);
  while (pending.length >= frameBytes) {
    const frame = Buffer.from(pending.subarray(0, frameBytes));
    pending = pending.subarray(frameBytes);
    await emit(frame);
  }
}
enc.stdin.end();
await new Promise((r) => enc.on("close", r));
console.log(`${out}: ${t} frames, ${labels.join(" | ")}; zoom ${paths.map((p) => p.stats.meanZoom.toFixed(3)).join(" / ")}`);
