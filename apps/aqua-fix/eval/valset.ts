// Before/after on the validation set: the engine before 29 Oct (clip lock
// alone, snapping at every profiled segment switch) vs now (material anchor +
// balance follow), replayed on the CPU (clip-sim.ts) over each clip.
//
//   node --experimental-strip-types apps/aqua-fix/eval/valset.ts <valset dir> <out dir> [--secs 8] [--gw 160] [--every 1] [--only id,id]
//
// <valset dir>/valset.json lists the clips ({ id, category, file, … }); clips
// whose file is missing are skipped. Preview cadence (an analysis every
// ANALYSIS_INTERVAL_MS) to keep it affordable; the analyses are shared by both
// runs. Every `every` seconds both grades are rendered at `gw` px wide and
// compared: mean per-pixel ΔE00 old vs new (how much the change moves this
// clip) and each run's tracked-sand colour drift (clip-drift.ts). Writes
// <out>/valset.jsonl and prints the clips sorted by the change, largest first.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { ANALYSIS_H, ANALYSIS_W } from "../src/engine/analyze.ts";
import { applyGrade } from "../src/engine/apply.ts";
import { linearToOklab, srgbToLinear } from "../src/engine/color.ts";
import { DEFAULT_SETTINGS, type FrameAnalysis } from "../src/engine/params.ts";
import { ClipSim } from "./clip-sim.ts";
import { deltaE00, srgb8ToLab } from "./colour-metrics.ts";
// SIM_VIVID=1 grades with the Vivid look (the studio default) instead of the engine's plain Auto.
const SETTINGS = { ...DEFAULT_SETTINGS, ...(process.env.SIM_VIVID ? { vivid: parseFloat(process.env.SIM_VIVID) } : {}) };

const args = process.argv.slice(2);
const opt = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const [dir, outDir] = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
const SECS = parseFloat(opt("secs", "8"));
const GW = parseInt(opt("gw", "160"));
const EVERY = parseFloat(opt("every", "1"));
const ONLY = opt("only", "") ? new Set(opt("only", "").split(",")) : null;
fs.mkdirSync(outDir, { recursive: true });
const list = JSON.parse(fs.readFileSync(path.join(dir, "valset.json"), "utf8")) as { id: string; category: string; file: string }[];
const COLOR = "in_color_matrix=bt709:in_range=tv:out_range=pc";
const require = createRequire(path.resolve(path.dirname(new URL(import.meta.url).pathname), "../package.json"));
const sharp = require("sharp") as typeof import("sharp");

function decode(file: string, vf: string, w: number, h: number, secs: number): Uint8ClampedArray[] {
  const r = spawnSync("ffmpeg", ["-v", "error", "-t", String(secs), "-i", file, "-vf", vf, "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { maxBuffer: 2 ** 31 });
  const size = w * h * 4, buf = r.stdout as Buffer, out: Uint8ClampedArray[] = [];
  for (let o = 0; o + size <= buf.length; o += size) out.push(new Uint8ClampedArray(buf.buffer, buf.byteOffset + o, size));
  return out;
}

const results: { id: string; category: string; change: number; changeMax: number; driftOld: number; driftNew: number; frames: number }[] = [];
const jsonl = fs.createWriteStream(path.join(outDir, "valset.jsonl"));
for (const c of list) {
  if (ONLY && !ONLY.has(c.id)) continue;
  const file = path.join(dir, c.file);
  if (!fs.existsSync(file)) continue;
  const pr = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate", "-of", "json", file], { encoding: "utf8" });
  const st = JSON.parse(pr.stdout).streams?.[0];
  if (!st) continue;
  const [fa, fb] = String(st.r_frame_rate).split("/").map(Number);
  const fps = fa / (fb || 1);
  const GH = Math.round((GW * st.height) / st.width / 2) * 2;
  const t0 = performance.now();
  const thumbs = decode(file, `scale=${ANALYSIS_W}:${ANALYSIS_H}:flags=area:${COLOR},format=rgba`, ANALYSIS_W, ANALYSIS_H, SECS);
  const fulls = decode(file, `scale=${GW}:${GH}:flags=area:${COLOR},format=rgba`, GW, GH, SECS);
  const cache = new Map<number, FrameAnalysis>();
  const sims = [new ClipSim("preview", fps, 1, { noFollow: true, snapSeg: true, cache }), new ClipSim("preview", fps, 1, { noFollow: false, snapSeg: false, cache })];
  for (const s of sims) s.profile(thumbs);
  const step = Math.max(1, Math.round(EVERY * fps));
  let sum = 0, n = 0, max = 0;
  const trk: [number, number, number][][] = [[], []];
  const shots: Buffer[][] = [[], []];
  for (let f = 0; f < thumbs.length && f < fulls.length; f++) {
    for (const s of sims) s.step(f, thumbs);
    if (f % step) continue;
    const outs = sims.map((s) => { const x = s.state(); return applyGrade({ params: x.params, settings: SETTINGS, depth: x.depth, clahe: x.clahe }, fulls[f], GW, GH); });
    // Old vs new, per pixel (every 2nd pixel).
    let fs_ = 0, fn = 0;
    for (let i = 0; i < GW * GH; i += 2) {
      fs_ += deltaE00(srgb8ToLab(outs[0][i * 4], outs[0][i * 4 + 1], outs[0][i * 4 + 2]), srgb8ToLab(outs[1][i * 4], outs[1][i * 4 + 1], outs[1][i * 4 + 2]));
      fn++;
    }
    const fm = fs_ / fn;
    sum += fm; n++; max = Math.max(max, fm);
    // Tracked sand (as clip-drift.ts): brightest quarter of the low-chroma pixels of the lower half.
    const src = fulls[f];
    const ids: [number, number][] = [];
    for (let i = (GW * GH) >> 1; i < GW * GH; i++) {
      const [L, a, b] = linearToOklab(srgbToLinear(src[i * 4] / 255), srgbToLinear(src[i * 4 + 1] / 255), srgbToLinear(src[i * 4 + 2] / 255));
      if (Math.hypot(a, b) < 0.08) ids.push([i, L]);
    }
    ids.sort((p, q) => q[1] - p[1]);
    const top = ids.slice(0, Math.max(1, ids.length >> 2));
    outs.forEach((o, k) => {
      let r = 0, g = 0, b = 0;
      for (const [i] of top) { r += o[i * 4]; g += o[i * 4 + 1]; b += o[i * 4 + 2]; }
      if (top.length >= 50) trk[k].push(srgb8ToLab(r / top.length, g / top.length, b / top.length));
      shots[k].push(Buffer.from(o.buffer, o.byteOffset, o.byteLength));
    });
  }
  const drift = (s: [number, number, number][]) => s.reduce((m, x) => Math.max(m, deltaE00(s[0], [s[0][0], x[1], x[2]])), 0);
  const r = { id: c.id, category: c.category, change: sum / Math.max(1, n), changeMax: max, driftOld: trk[0].length ? drift(trk[0]) : NaN, driftNew: trk[1].length ? drift(trk[1]) : NaN, frames: n };
  results.push(r);
  jsonl.write(JSON.stringify(r) + "\n");
  // Contact strip: old row over new row at the sampled times.
  const tile = (bufs: Buffer[]) => bufs.map((b, i) => ({ input: b, raw: { width: GW, height: GH, channels: 4 as const }, left: i * GW, top: 0 }));
  const k = Math.min(shots[0].length, 8);
  const strip = async (bufs: Buffer[]) => sharp({ create: { width: GW * k, height: GH, channels: 4, background: "#000" } }).composite(tile(bufs.slice(0, k))).png().toBuffer();
  const [ro, rn] = [await strip(shots[0]), await strip(shots[1])];
  await sharp({ create: { width: GW * k, height: GH * 2 + 4, channels: 3, background: "#000" } }).composite([{ input: ro, left: 0, top: 0 }, { input: rn, left: 0, top: GH + 4 }]).jpeg({ quality: 80 }).toFile(path.join(outDir, `${c.id}.jpg`));
  console.log(`${c.id.padEnd(28)} ${c.category.padEnd(16)} change ${r.change.toFixed(2)} (max ${r.changeMax.toFixed(2)}) · sand drift old ${r.driftOld.toFixed(2)} new ${r.driftNew.toFixed(2)} · ${((performance.now() - t0) / 1000).toFixed(0)} s`);
}
jsonl.end();
results.sort((a, b) => b.change - a.change);
console.log("\nlargest changes vs the lock alone (mean per-pixel ΔE00 old→new):");
for (const r of results.slice(0, 5)) console.log(`  ${r.id} (${r.category}): ${r.change.toFixed(2)}, max ${r.changeMax.toFixed(2)}`);
