// Material-consistency harness for a video clip (CPU reference of the engine).
//
//   node --experimental-strip-types apps/aqua-fix/eval/clip-drift.ts <clip> <out dir>
//        [--mode export|preview|unlocked] [--gw 240] [--step 6] [--png 0|1] [--lat 2] [--end <s>]
//
// Decodes the clip with ffmpeg (bt709 limited → full-range sRGB, as the
// browser does), then replays what the app does with it:
//   1. the clip profile (profileTimes → analyzeThumbnail → segmentProfile → lock),
//   2. per-frame analyses (export: every frame the worker is free, ~`lat`
//      frames of latency; preview: every ANALYSIS_INTERVAL_MS of media time;
//      unlocked: preview without the clip lock, as before profiling ends),
//      the material anchor + balance follow, scene-cut snaps and the
//      engine's easing (clip-sim.ts mirrors engine.ts),
//   3. the CPU grade (apply.ts, the shader's reference) every `step`-th frame
//      at `gw` px wide (up to `--end` seconds).
// The GPU-only temporal (anti-crawl) layer is not simulated.
// Ablations (env): SIM_NOFOLLOW=1 (no anchor/follow) with SIM_SNAPSEG=1 (snap at
// every profiled segment switch) replays the engine before 29 Oct 2026;
// SIM_LOCKZ=1 also locks the range normalisation; SIM_CLARITY sets the
// clarity; SIM_TAU / SIM_WINDOW tune the follow.
//
// Probes:
//  - tracked sand (the one to watch): the brightest quarter of the low-chroma
//    pixels of the lower half, i.e. the near sand, whatever its source colour;
//    its mean source and output colour per frame, ΔE00 against the first
//    graded frame, in full and colour only (lightness equalised: the camera's
//    exposure and which pixels qualify move L). Source drift = what the camera
//    did; output drift = what the viewer sees.
//  - keyed sand / weed: pixels whose *source* Oklab is within PROBE_R of a
//    first-frame reference colour, their mean output. Only meaningful while
//    the source holds still (a camera white-balance drift moves the material
//    out of the key and other content into it).
//  - transfer: the same per source-colour bin populated in both frames
//    (median ΔE00 over bins).
// Short-horizon per-region change (output vs source, flow-aligned) is
// region-drift.py, run on the PNGs this writes; sand-track.ts prints the
// source colour of the analysis' own sand reference over a clip.
//
// Writes <out>/drift.csv (per graded frame), <out>/params.csv (per analysis,
// with the anchor and the follow), optionally <out>/f<idx>.png (graded
// frames), and prints a summary.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { ANALYSIS_H, ANALYSIS_W } from "../src/engine/analyze.ts";
import { applyGrade } from "../src/engine/apply.ts";
import { linearToOklab, srgbToLinear } from "../src/engine/color.ts";
import { DEFAULT_SETTINGS } from "../src/engine/params.ts";
import { ClipSim, type SimMode } from "./clip-sim.ts";
import { deltaE00, srgb8ToLab } from "./colour-metrics.ts";

const args = process.argv.slice(2);
const opt = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const positional = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
const [clip, outDir] = positional;
if (!clip || !outDir) {
  console.error("usage: clip-drift.ts <clip> <out dir> [--mode export|preview|unlocked] [--gw 240] [--step 6] [--png 0|1]");
  process.exit(2);
}
const mode = opt("mode", "export") as SimMode;
const GW = parseInt(opt("gw", "240"));
const STEP = parseInt(opt("step", "6"));
const PNG = opt("png", "0") === "1";
const LAT = parseInt(opt("lat", "2"));
// Probe statistics only up to this time (s): the shot under test (the default is the whole clip).
const END = parseFloat(opt("end", "1e9"));
fs.mkdirSync(outDir, { recursive: true });

// ---------------------------------------------------------------- decode
function probe(file: string) {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate:stream_side_data=rotation", "-of", "json", file], { encoding: "utf8" });
  const s = JSON.parse(r.stdout).streams[0];
  const [a, b] = String(s.r_frame_rate).split("/").map(Number);
  const rot = Math.abs(Number(s.side_data_list?.[0]?.rotation ?? 0)) % 180 === 90;
  return { w: rot ? s.height : s.width, h: rot ? s.width : s.height, fps: a / (b || 1) };
}
function decode(file: string, vf: string, fw: number, fh: number): Uint8ClampedArray[] {
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-vf", vf, "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { maxBuffer: 2 ** 31 });
  if (r.status !== 0) throw new Error(String(r.stderr));
  const size = fw * fh * 4;
  const buf = r.stdout as Buffer;
  const out: Uint8ClampedArray[] = [];
  for (let o = 0; o + size <= buf.length; o += size) out.push(new Uint8ClampedArray(buf.buffer, buf.byteOffset + o, size));
  return out;
}
const COLOR = "in_color_matrix=bt709:in_range=tv:out_range=pc";
const info = probe(clip);
const GH = Math.round((GW * info.h) / info.w / 2) * 2;
// The app's analysis thumbnail stretches the upright frame into the 16:9 box.
const thumbs = decode(clip, `scale=${ANALYSIS_W}:${ANALYSIS_H}:flags=area:${COLOR},format=rgba`, ANALYSIS_W, ANALYSIS_H);
const fulls = decode(clip, `select=not(mod(n\\,${STEP})),scale=${GW}:${GH}:flags=area:${COLOR},format=rgba`, GW, GH);
const fps = info.fps;
console.log(`${path.basename(clip)}: ${info.w}x${info.h} @ ${fps.toFixed(2)} fps, ${thumbs.length} frames, grading ${fulls.length} at ${GW}x${GH}, mode ${mode}`);

// ---------------------------------------------------------------- simulate
const sim = new ClipSim(mode, fps, LAT);
const lockInfo = sim.profile(thumbs);
console.log(`profile: ${lockInfo}`);
const settings = { ...DEFAULT_SETTINGS, ...(process.env.SIM_CLARITY ? { clarity: parseFloat(process.env.SIM_CLARITY) } : {}) };

type Probe = { name: string; ref: [number, number, number]; first: [number, number, number] | null; max: number; maxAb: number; series: number[] };
/** ΔE00 of the colour only (b's lightness set to a's): brightness changes and probe selection noise left out. */
const dAb = (a: number[], b: number[]) => deltaE00(a, [a[0], b[1], b[2]]);
const PROBE_R = 0.03;
const probes: Probe[] = [];
const BIN = 0.03;
let transferRef: Map<string, [number, number, number, number]> | null = null;
const csv: string[] = ["frame,t,segment,sand_n,sand_src_L,sand_out_L,sand_out_a,sand_out_b,sand_dE,weed_n,weed_dE,trk_n,trk_src_lab,trk_out_lab,trk_src_dE,trk_out_dE,transfer_dE,mean_out_L,mean_out_a,mean_out_b"];
const tracked = { src0: null as [number, number, number] | null, out0: null as [number, number, number] | null, maxSrc: 0, maxOut: 0, abSrc: 0, abOut: 0, abOutSeries: [] as number[], srcSeries: [] as number[], outSeries: [] as number[] };

function oklabOf(px: Uint8ClampedArray, i: number): [number, number, number] {
  return linearToOklab(srgbToLinear(px[i] / 255), srgbToLinear(px[i + 1] / 255), srgbToLinear(px[i + 2] / 255));
}

const N = thumbs.length;
for (let f = 0; f < N; f++) {
  sim.step(f, thumbs);
  if (f % STEP !== 0 || f / fps > END) continue;
  const src = fulls[f / STEP];
  if (!src) break;
  const st = sim.state();
  const out = applyGrade({ params: st.params, settings, depth: st.depth, clahe: st.clahe }, src, GW, GH);
  if (PNG) await writePng(path.join(outDir, `f${String(f).padStart(4, "0")}.png`), out, GW, GH);
  // Per-pixel source Oklab (cached per frame).
  const n = GW * GH;
  const sL = new Float32Array(n), sA = new Float32Array(n), sB = new Float32Array(n);
  for (let i = 0; i < n; i++) { const [L, a, b] = oklabOf(src, i * 4); sL[i] = L; sA[i] = a; sB[i] = b; }
  if (probes.length === 0) {
    // Sand: brightest quarter of the low-chroma pixels; weed: darkest 15 % of the lower half.
    const idx = [...Array(n).keys()].filter((i) => Math.hypot(sA[i], sB[i]) < 0.08).sort((a, b) => sL[b] - sL[a]);
    const top = idx.slice(0, Math.max(50, idx.length >> 2));
    const lower = [...Array(n).keys()].filter((i) => i >= n / 2).sort((a, b) => sL[a] - sL[b]);
    const dark = lower.slice(0, Math.max(50, Math.floor(lower.length * 0.15)));
    const meanOf = (ids: number[]): [number, number, number] => { let L = 0, a = 0, b = 0; for (const i of ids) { L += sL[i]; a += sA[i]; b += sB[i]; } return [L / ids.length, a / ids.length, b / ids.length]; };
    probes.push({ name: "sand", ref: meanOf(top), first: null, max: 0, maxAb: 0, series: [] });
    probes.push({ name: "weed", ref: meanOf(dark), first: null, max: 0, maxAb: 0, series: [] });
    console.log(`probe refs (source Oklab): sand ${probes[0].ref.map((x) => x.toFixed(3))} weed ${probes[1].ref.map((x) => x.toFixed(3))}`);
  }
  const row: (string | number)[] = [f, (f / fps).toFixed(3), st.segment];
  for (const p of probes) {
    let cnt = 0, r = 0, g = 0, b = 0, Ls = 0;
    for (let i = 0; i < n; i++) {
      if (Math.hypot(sL[i] - p.ref[0], sA[i] - p.ref[1], sB[i] - p.ref[2]) > PROBE_R) continue;
      cnt++; r += out[i * 4]; g += out[i * 4 + 1]; b += out[i * 4 + 2]; Ls += sL[i];
    }
    let dE = NaN;
    let lab: [number, number, number] = [NaN, NaN, NaN];
    if (cnt >= 100) {
      lab = srgb8ToLab(r / cnt, g / cnt, b / cnt);
      if (!p.first) p.first = lab;
      dE = deltaE00(p.first, lab);
      p.max = Math.max(p.max, dE);
      p.maxAb = Math.max(p.maxAb, dAb(p.first, lab));
    }
    p.series.push(dE);
    if (p.name === "sand") row.push(cnt, (Ls / Math.max(1, cnt)).toFixed(3), lab[0].toFixed(2), lab[1].toFixed(2), lab[2].toFixed(2), dE.toFixed(2));
    else row.push(cnt, dE.toFixed(2));
  }
  // Tracked sand (not keyed on the source colour, so a camera white-balance drift shows):
  // the brightest quarter of the low-chroma pixels of the lower half; its mean source and output colour.
  {
    const ids: number[] = [];
    for (let i = n >> 1; i < n; i++) if (Math.hypot(sA[i], sB[i]) < 0.08) ids.push(i);
    ids.sort((a, b) => sL[b] - sL[a]);
    const top = ids.slice(0, Math.max(1, ids.length >> 2));
    let r = 0, g = 0, b = 0, r2 = 0, g2 = 0, b2 = 0;
    for (const i of top) { r += src[i * 4]; g += src[i * 4 + 1]; b += src[i * 4 + 2]; r2 += out[i * 4]; g2 += out[i * 4 + 1]; b2 += out[i * 4 + 2]; }
    const k = top.length;
    const ls = srgb8ToLab(r / k, g / k, b / k), lo = srgb8ToLab(r2 / k, g2 / k, b2 / k);
    if (!tracked.src0) { tracked.src0 = ls; tracked.out0 = lo; }
    const dS = deltaE00(tracked.src0, ls), dO = deltaE00(tracked.out0!, lo);
    tracked.maxSrc = Math.max(tracked.maxSrc, dS); tracked.maxOut = Math.max(tracked.maxOut, dO);
    tracked.abSrc = Math.max(tracked.abSrc, dAb(tracked.src0, ls)); tracked.abOut = Math.max(tracked.abOut, dAb(tracked.out0!, lo));
    tracked.abOutSeries.push(dAb(tracked.out0!, lo));
    tracked.srcSeries.push(dS); tracked.outSeries.push(dO);
    row.push(k, ls.map((x) => x.toFixed(1)).join(" "), lo.map((x) => x.toFixed(1)).join(" "), dS.toFixed(2), dO.toFixed(2));
  }
  // Transfer drift over source-colour bins.
  const bins = new Map<string, [number, number, number, number]>();
  let mr = 0, mg = 0, mb = 0;
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(sL[i] / BIN)},${Math.round(sA[i] / BIN)},${Math.round(sB[i] / BIN)}`;
    const e = bins.get(k) ?? [0, 0, 0, 0];
    e[0] += out[i * 4]; e[1] += out[i * 4 + 1]; e[2] += out[i * 4 + 2]; e[3]++;
    bins.set(k, e);
    mr += out[i * 4]; mg += out[i * 4 + 1]; mb += out[i * 4 + 2];
  }
  let tdE = 0;
  if (!transferRef) transferRef = bins;
  else {
    const ds: number[] = [];
    for (const [k, e] of bins) {
      const r0 = transferRef.get(k);
      if (!r0 || r0[3] < 40 || e[3] < 40) continue;
      ds.push(deltaE00(srgb8ToLab(r0[0] / r0[3], r0[1] / r0[3], r0[2] / r0[3]), srgb8ToLab(e[0] / e[3], e[1] / e[3], e[2] / e[3])));
    }
    ds.sort((a, b) => a - b);
    tdE = ds.length ? ds[ds.length >> 1] : NaN;
  }
  const mlab = srgb8ToLab(mr / n, mg / n, mb / n);
  row.push(tdE.toFixed(2), mlab[0].toFixed(2), mlab[1].toFixed(2), mlab[2].toFixed(2));
  csv.push(row.join(","));
}
fs.writeFileSync(path.join(outDir, "drift.csv"), csv.join("\n") + "\n");
fs.writeFileSync(path.join(outDir, "params.csv"), sim.paramLog.join("\n") + "\n");

// Summary: max drift and worst rate per second (over 1 s windows).
const dt = STEP / fps;
for (const p of probes) {
  const s = p.series;
  let rate = 0;
  const w = Math.max(1, Math.round(1 / dt));
  for (let i = w; i < s.length; i++) if (Number.isFinite(s[i]) && Number.isFinite(s[i - w])) rate = Math.max(rate, Math.abs(s[i] - s[i - w]));
  console.log(`${p.name}: max ΔE00 ${p.max.toFixed(2)} (colour only ${p.maxAb.toFixed(2)}) vs first frame, worst 1 s change ${rate.toFixed(2)} (n frames ${s.filter(Number.isFinite).length}/${s.length})`);
}
{
  const w = Math.max(1, Math.round(1 / dt));
  const rate = (s: number[]) => { let r = 0; for (let i = w; i < s.length; i++) r = Math.max(r, Math.abs(s[i] - s[i - w])); return r; };
  console.log(`tracked sand: source max ΔE00 ${tracked.maxSrc.toFixed(2)} (colour only ${tracked.abSrc.toFixed(2)}, worst 1 s ${rate(tracked.srcSeries).toFixed(2)}) · output max ΔE00 ${tracked.maxOut.toFixed(2)} (colour only ${tracked.abOut.toFixed(2)}, worst 1 s ${rate(tracked.outSeries).toFixed(2)}, colour-only worst 1 s ${rate(tracked.abOutSeries).toFixed(2)})`);
}
console.log(`cuts seen: ${sim.cuts.map((t) => t.toFixed(2)).join(", ") || "none"}`);

async function writePng(file: string, px: Uint8ClampedArray, w: number, h: number) {
  const require = createRequire(path.resolve("apps/aqua-fix/package.json"));
  const sharp = require("sharp") as typeof import("sharp");
  await sharp(Buffer.from(px.buffer, px.byteOffset, px.byteLength), { raw: { width: w, height: h, channels: 4 } }).png().toFile(file);
}
