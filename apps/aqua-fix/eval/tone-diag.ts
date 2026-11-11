// Tone diagnostics per clip: where the grade's lightness shift moves inside a shot, and how "crunchy" it is.
//
//   node --experimental-strip-types apps/aqua-fix/eval/tone-diag.ts --clips id,id,… [--secs 8] [--w 240] [--series]
//        [--tune OBJ.field=v,…] [--valset <dir>]
//
// Each clip is replayed at preview cadence (clip-sim.ts) in the default studio style and sampled every 0.5 s:
//   light std / jump   as score.ts (std and largest 0.5 s step of median L* out − source, per shot, frame weighted)
//   dL, dL5            mean shift of the median and of the black point (L* p5): a large negative dL5 is the harsh crush
//   chroma             output / source mean chroma
//   detail gain        output / source local contrast: mean |L* − 3×3 mean| over the frame
//   noise gain         the same over the source's flat pixels only (5×5 std of L* under FLAT): what the grade does to
//                      grain and compression blocks where there is no picture detail ("crunchy" = well over 1)
// --series also prints, per sample: t, source L50/L5, output L50/L5, the locked haze black against the frame's own.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import * as analyzeModule from "../src/engine/analyze.ts";
import { analyzeThumbnail, ANALYSIS_H, ANALYSIS_W } from "../src/engine/analyze.ts";
import { applyGrade } from "../src/engine/apply.ts";
import * as paramsModule from "../src/engine/params.ts";
import * as redModule from "../src/engine/red.ts";
import * as lockModule from "../src/engine/lock.ts";
import { DEFAULT_SETTINGS, type UserSettings } from "../src/engine/params.ts";
import { ClipSim } from "./clip-sim.ts";
import { quantile, srgb8ToLab } from "./colour-metrics.ts";

const args = process.argv.slice(2);
const opt = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const VALSET = opt("valset", process.env.SCORE_VALSET ?? "/home/majdyz/video-data/valset");
const SECS = parseFloat(opt("secs", "8")), GW = parseInt(opt("w", "240")), EVERY = 0.5, FLAT = 1.2;
const SERIES = args.includes("--series");
for (const kv of opt("tune", "").split(",").filter(Boolean)) {
  const [key, val] = kv.split("="), [obj, field] = key.split(".");
  const o = (analyzeModule as unknown as Record<string, Record<string, unknown>>)[obj] ?? (paramsModule as unknown as Record<string, Record<string, unknown>>)[obj] ?? (redModule as unknown as Record<string, Record<string, unknown>>)[obj] ?? (lockModule as unknown as Record<string, Record<string, unknown>>)[obj];
  if (!o || !(field in o)) throw new Error(`--tune: no ${key}`);
  o[field] = parseFloat(val);
}
const STYLE: UserSettings = { ...DEFAULT_SETTINGS, vivid: 1, blue: 0, seabed: 0.6 };
const valset: { id: string; file: string }[] = JSON.parse(fs.readFileSync(path.join(VALSET, "valset.json"), "utf8"));

function decode(file: string, vf: string, w: number, h: number): Uint8ClampedArray[] {
  const r = spawnSync("ffmpeg", ["-v", "error", "-t", String(SECS), "-i", file, "-vf", vf, "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { maxBuffer: 2 ** 30 });
  const size = w * h * 4, buf = r.stdout as Buffer, out: Uint8ClampedArray[] = [];
  for (let o = 0; o + size <= buf.length; o += size) out.push(new Uint8ClampedArray(buf.buffer, buf.byteOffset + o, size));
  return out;
}
const std = (v: number[]) => { if (v.length < 2) return 0; const m = v.reduce((a, b) => a + b, 0) / v.length; return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length); };
/** Mean of a (2r+1)² box around each pixel (edges clamped). */
function box(L: Float64Array, w: number, h: number, r: number): Float64Array {
  const o = new Float64Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, c = 0;
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) { const xx = Math.min(w - 1, Math.max(0, x + i)), yy = Math.min(h - 1, Math.max(0, y + j)); s += L[yy * w + xx]; c++; }
    o[y * w + x] = s / c;
  }
  return o;
}

console.log(`${"clip".padEnd(30)} shots  light std  light jump     dL    dL5  chroma  detail gain  noise gain  flat %`);
for (const id of opt("clips", "sand_flounder,green_combjelly,blue_eagleray,user_drift").split(",")) {
  const c = valset.find((x) => x.id === id);
  if (!c) throw new Error(`no clip ${id}`);
  const file = path.join(VALSET, c.file);
  const st = JSON.parse(spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate", "-of", "json", file], { encoding: "utf8" }).stdout).streams[0];
  const [fa, fb] = String(st.r_frame_rate).split("/").map(Number), fps = fa / (fb || 1);
  const GH = Math.round((GW * st.height) / st.width / 2) * 2, n = GW * GH;
  const COLOR = "in_color_matrix=bt709:in_range=tv:out_range=pc";
  const thumbs = decode(file, `scale=${ANALYSIS_W}:${ANALYSIS_H}:flags=area:${COLOR},format=rgba`, ANALYSIS_W, ANALYSIS_H);
  const fulls = decode(file, `fps=1/${EVERY},scale=${GW}:${GH}:flags=area:${COLOR},format=rgba`, GW, GH);
  const sim = new ClipSim("preview", fps, 1);
  sim.profile(thumbs);
  const step = Math.max(1, Math.round(EVERY * fps));
  const rows: { seg: number; dL: number; dL5: number }[] = [];
  let cS = 0, cO = 0, hfS = 0, hfO = 0, nS = 0, nO = 0, flatN = 0, tot = 0;
  for (let f = 0; f < thumbs.length; f++) {
    sim.step(f, thumbs);
    if (f % step) continue;
    const full = fulls[Math.round(f / step)];
    if (!full) continue;
    const x = sim.state();
    const g = applyGrade({ params: x.params, settings: STYLE, depth: x.depth, clahe: x.clahe }, full, GW, GH);
    const Ls = new Float64Array(n), Lo = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const s = srgb8ToLab(full[i * 4], full[i * 4 + 1], full[i * 4 + 2]), o = srgb8ToLab(g[i * 4], g[i * 4 + 1], g[i * 4 + 2]);
      Ls[i] = s[0]; Lo[i] = o[0]; cS += Math.hypot(s[1], s[2]); cO += Math.hypot(o[1], o[2]);
    }
    const ms = box(Ls, GW, GH, 1), mo = box(Lo, GW, GH, 1), m5 = box(Ls, GW, GH, 2), q5 = box(Ls.map((v) => v * v), GW, GH, 2);
    for (let i = 0; i < n; i++) {
      const ds = Math.abs(Ls[i] - ms[i]), d = Math.abs(Lo[i] - mo[i]);
      hfS += ds; hfO += d; tot++;
      if (Math.sqrt(Math.max(0, q5[i] - m5[i] * m5[i])) < FLAT) { nS += ds; nO += d; flatN++; }
    }
    const ss = Float64Array.from(Ls).sort(), so = Float64Array.from(Lo).sort();
    const row = { seg: x.segment, dL: quantile(so, 0.5) - quantile(ss, 0.5), dL5: quantile(so, 0.05) - quantile(ss, 0.05) };
    rows.push(row);
    if (SERIES) {
      const own = analyzeThumbnail(thumbs[f], ANALYSIS_W, ANALYSIS_H).params;
      console.log(`  ${(f / fps).toFixed(1).padStart(4)}s seg ${x.segment}  src L50 ${quantile(ss, 0.5).toFixed(1).padStart(5)} L5 ${quantile(ss, 0.05).toFixed(1).padStart(5)} | out L50 ${quantile(so, 0.5).toFixed(1).padStart(5)} L5 ${quantile(so, 0.05).toFixed(1).padStart(5)} | dL ${row.dL.toFixed(1).padStart(6)} | hazeBlack lock ${x.params.hazeBlack.toFixed(3)} own ${own.hazeBlack.toFixed(3)}  haze ${x.params.haze.toFixed(2)}/${own.haze.toFixed(2)}  exp ${x.params.exposure.toFixed(2)}/${own.exposure.toFixed(2)}  white ${x.params.white.toFixed(2)}/${own.white.toFixed(2)}  gamma ${(x.params.toneGamma ?? 1).toFixed(2)}/${(own.toneGamma ?? 1).toFixed(2)}  calm ${Math.max(x.params.calm ?? 0, x.params.calmTone ?? 0).toFixed(2)}`);
    }
  }
  const segs = [...new Set(rows.map((r) => r.seg))];
  let lightStd = 0, jump = 0;
  for (const sg of segs) {
    const v = rows.filter((r) => r.seg === sg);
    lightStd += (v.length / rows.length) * std(v.map((r) => r.dL));
    for (let i = 1; i < v.length; i++) jump = Math.max(jump, Math.abs(v[i].dL - v[i - 1].dL));
  }
  const mean = (k: "dL" | "dL5") => rows.reduce((a, r) => a + r[k], 0) / Math.max(1, rows.length);
  const f = (x: number, w: number, d = 1) => x.toFixed(d).padStart(w);
  console.log(`${id.padEnd(30)} ${String(segs.length).padStart(5)}  ${f(lightStd, 9)}  ${f(jump, 10)}  ${f(mean("dL"), 5)}  ${f(mean("dL5"), 5)}  ${f(cO / Math.max(1e-6, cS), 6, 2)}  ${f(hfO / Math.max(1e-6, hfS), 11, 2)}  ${f(flatN ? nO / Math.max(1e-6, nS) : 0, 10, 2)}  ${f((100 * flatN) / Math.max(1, tot), 6, 0)}`);
}
