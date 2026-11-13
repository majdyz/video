// Reference-quality score of the colour engine (CPU reference, apply.ts).
//
//   node --experimental-strip-types apps/aqua-fix/eval/score.ts [--pairs <dir>] [--valset <dir>] [--out <dir>]
//        [--before <dir>] [--write-baseline] [--baseline <file>] [--jobs 2] [--secs 8] [--only-pairs] [--only-clips]
//        [--tune OBJ.field=value,…] [--all] [--cache <dir>] [--max <n>]
//
// Three scores, printed and compared with eval/baseline-score.json (--write-baseline replaces that file):
//
//  1. Reference distance. <pairs>/src/<name>.jpg is graded as each studio style and compared with the user's own
//     grade <pairs>/ref/<name>.jpg: a sliced Wasserstein distance between the two CIELAB distributions (the crops
//     differ, so nothing is aligned per pixel; it scores tone and palette, not local artefacts), plus region
//     statistics against the reference: water hue, median L*, black point (L* p5), the chroma of the bright
//     non-water pixels (sand, skin), and saturation: the median chroma of the frame and of its water, and the chroma
//     of the warm subjects (95th percentile of the warm-hued chroma). Lower is closer. The headline is the default style (Vivid + Seabed).
//  2. Do no harm. Already-graded and topside clips of the valset, replayed at preview cadence (clip-sim.ts) in the
//     default style: mean CIEDE2000 between output and source. Lower is better.
//  3. Stability per shot. The harm clips plus a fixed set of difficult clips: within each locked shot, the standard
//     deviation over time of the grade's own lightness shift (median L* out − source) and balance shift (mean a*, b*
//     out − source), the largest step of the lightness shift between samples 0.5 s apart, and how far the balance
//     and exposure parameters move. Lower is steadier. Frames inside a dissolve from one shot to the next (the lock
//     handing over through an uncut window) belong to neither shot and are left out; `handover` counts them.
//     `lightJumpOwn` is the largest step where the source's own median moved less than 5 L* (a jump the grade made). Diagnostics per clip: dL* (mean lightness shift; a crush reads
//     strongly negative) and the output chroma / pink share of the source's brightest 2 % (white fins must stay neutral).
//
// --all scores every clip of the valset (section 4: how many clips still swing the balance by more than 1.25× inside
// a shot, jump more than 5 L* between samples, lose more than a quarter of their chroma; the headline scores 2 and 3
// stay on their fixed sets so they compare with the baseline). --cache <dir> keeps each clip's result as
// <dir>/<id>.json and reuses it; with --max <n> a run scores at most n new clips and exits with code 3 while clips are
// left, so a long sweep can be split into short runs (the cache belongs to ONE engine state: use a new dir per change).
//
// What the CPU reference renders: every stage of the shader including Seabed recovery; person segmentation, AI
// subjects and the temporal layer are inputs the harness leaves empty (as in the app for a clip without people and
// with Subject pop off, its default).
//
// --out writes the graded stills (<name>-<style>.png) and board.jpg (rows: source / [--before stills of an earlier
// run] / default style / reference).
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as analyzeModule from "../src/engine/analyze.ts";
import { analyzeThumbnail, ANALYSIS_H, ANALYSIS_W } from "../src/engine/analyze.ts";
import { applyGrade } from "../src/engine/apply.ts";
import * as paramsModule from "../src/engine/params.ts";
import * as redModule from "../src/engine/red.ts";
import * as lockModule from "../src/engine/lock.ts";
import { DEFAULT_SETTINGS, type UserSettings } from "../src/engine/params.ts";
import { ClipSim } from "./clip-sim.ts";
import { deltaE00, halve, hueDiff, labOf, quantile, regionStats, srgb8ToLab, swd, type Lab } from "./colour-metrics.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const flag = (n: string) => args.includes(`--${n}`);
const PAIRS = opt("pairs", process.env.SCORE_PAIRS ?? "/home/majdyz/video-data/review-fable/colour/pairs");
const VALSET = opt("valset", process.env.SCORE_VALSET ?? "/home/majdyz/video-data/valset");
const OUT = opt("out", "");
const BEFORE = opt("before", "");
const BASELINE = opt("baseline", path.join(HERE, "baseline-score.json"));
const JOBS = parseInt(opt("jobs", "2"));
const SECS = parseFloat(opt("secs", "8"));
// Tuning experiments: --tune TONE.target=0.07,TONE.strength=0.5 overrides fields of the engine's exported tuning objects (analyze.ts, params.ts, red.ts).
const TUNE = opt("tune", "");
const ALL = flag("all"), CACHE = opt("cache", ""), MAX_NEW = parseInt(opt("max", "0")) || Infinity;
for (const kv of TUNE.split(",").filter(Boolean)) {
  const [key, val] = kv.split("="), [obj, field] = key.split(".");
  const o = (analyzeModule as unknown as Record<string, Record<string, unknown>>)[obj] ?? (paramsModule as unknown as Record<string, Record<string, unknown>>)[obj] ?? (redModule as unknown as Record<string, Record<string, unknown>>)[obj] ?? (lockModule as unknown as Record<string, Record<string, unknown>>)[obj];
  if (!o || !(field in o)) throw new Error(`--tune: no ${key}`);
  o[field] = val === "null" ? null : parseFloat(val);
}
/** Longest side of the images the reference distance is measured on; stills are graded at twice this. */
const SCORE_PX = 200;
/** Clip render width and sampling step (s). */
const CLIP_W = 160, EVERY = 0.5;

// The studio's colourSettings() per style (apps/studio/src/pipeline/tools.ts): Seabed rides on Vivid.
export const STYLES: Record<string, UserSettings> = {
  natural: { ...DEFAULT_SETTINGS, vivid: 0, blue: 0, seabed: 0 },
  vivid: { ...DEFAULT_SETTINGS, vivid: 1, blue: 0, seabed: 0.6 },
  blue: { ...DEFAULT_SETTINGS, vivid: 1, blue: 1, seabed: 0.6 },
};
export const DEFAULT_STYLE = "vivid";
/** Do-no-harm clips: the valset's graded and topside categories. */
const HARM_CATEGORIES = new Set(["graded", "topside"]);
/** Stability clips beyond the harm set: the review's balance swings, lightness jumps and blend artefacts, one easy reef. */
const STABILITY_CLIPS = ["blue_whaleshark", "user_drift", "divers_shallow_reef", "green_reservoir_divers", "school_sardines", "sand_flounder", "cave_spring_surface_to_under", "tilt_reef_to_blue_barracuda", "divers_wreck_cabo", "reef_anemonefish"];

const require = createRequire(path.resolve(HERE, "../package.json"));
const r2 = (x: number) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);

// ---------- 1. reference pairs ----------

type PairScore = { source: number; swd: Record<string, number>; out: Region; ref: Region; err: { waterHue: number | null; L50: number; L5: number; warmC: number | null; C50: number; waterC: number | null; subjC: number } };

async function scorePairs(): Promise<Record<string, PairScore>> {
  const sharp = require("sharp") as typeof import("sharp");
  const names = fs.readdirSync(path.join(PAIRS, "src")).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort();
  const res: Record<string, PairScore> = {};
  if (OUT) fs.mkdirSync(OUT, { recursive: true });
  const cells: { name: string; rows: (Buffer | null)[] }[] = [];
  for (const f of names) {
    const name = f.replace(/\.[^.]+$/, ""), file = path.join(PAIRS, "src", f);
    const refFile = path.join(PAIRS, "ref", f);
    const meta = await sharp(file).rotate().toBuffer({ resolveWithObject: true });
    const k = SCORE_PX / Math.max(meta.info.width, meta.info.height);
    const sw = Math.max(1, Math.round(meta.info.width * k)), sh = Math.max(1, Math.round(meta.info.height * k));
    const W = sw * 2, H = sh * 2;
    const full = new Uint8ClampedArray((await sharp(meta.data).resize(W, H, { fit: "fill" }).ensureAlpha().raw().toBuffer()).buffer);
    const thumbB = await sharp(meta.data).resize(ANALYSIS_W, ANALYSIS_H, { fit: "fill" }).ensureAlpha().raw().toBuffer();
    const a = analyzeThumbnail(new Uint8ClampedArray(thumbB.buffer, thumbB.byteOffset, thumbB.byteLength), ANALYSIS_W, ANALYSIS_H);
    const refB = await sharp(refFile).rotate().resize(SCORE_PX, SCORE_PX, { fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const ref = labOf(refB.data, refB.info.width * refB.info.height);
    const half = (img: Uint8ClampedArray) => labOf(halve(img, W, H), sw * sh);
    const src = half(full);
    const out: Record<string, number> = {};
    let def: Lab = src, defPng: Buffer | null = null;
    for (const [id, settings] of Object.entries(STYLES)) {
      const g = applyGrade({ params: a.params, settings, depth: a.depth, clahe: a.clahe }, full, W, H);
      const lab = half(g);
      out[id] = swd(lab, ref);
      if (OUT) {
        const png = await sharp(Buffer.from(g.buffer, g.byteOffset, g.byteLength), { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
        fs.writeFileSync(path.join(OUT, `${name}-${id}.png`), png);
        if (id === DEFAULT_STYLE) defPng = png;
      }
      if (id === DEFAULT_STYLE) def = lab;
    }
    const so = regionStats(def), sr = regionStats(ref);
    const d = (x: number | null, y: number | null) => (x === null || y === null ? null : Math.abs(x - y));
    res[name] = { source: swd(src, ref), swd: out, out: so, ref: sr, err: { waterHue: so.waterHue === null || sr.waterHue === null ? null : hueDiff(so.waterHue, sr.waterHue), L50: Math.abs(so.L50 - sr.L50), L5: Math.abs(so.L5 - sr.L5), warmC: d(so.warmC, sr.warmC), C50: Math.abs(so.C50 - sr.C50), waterC: d(so.waterC, sr.waterC), subjC: Math.abs(so.subjC - sr.subjC) } };
    if (OUT) {
      const before = BEFORE && fs.existsSync(path.join(BEFORE, `${name}-${DEFAULT_STYLE}.png`)) ? fs.readFileSync(path.join(BEFORE, `${name}-${DEFAULT_STYLE}.png`)) : null;
      cells.push({ name, rows: [meta.data, ...(BEFORE ? [before] : []), defPng, fs.readFileSync(refFile)] });
    }
    process.stderr.write(`pair ${name} done\n`);
  }
  if (OUT && cells.length) await board(cells, ["source", ...(BEFORE ? ["before"] : []), BEFORE ? "after" : "engine (default style)", "your reference"], path.join(OUT, "board.jpg"));
  return res;
}
async function board(cells: { name: string; rows: (Buffer | null)[] }[], labels: string[], file: string): Promise<void> {
  const sharp = require("sharp") as typeof import("sharp");
  const CW = 260, CH = 174, PAD = 4, LABEL = 22, TOP = 20;
  const comp: { input: Buffer; left: number; top: number }[] = [];
  const esc = (s: string) => s.replace(/[<&>]/g, "");
  let svg = "";
  for (let c = 0; c < cells.length; c++) {
    svg += `<text x="${c * (CW + PAD) + 4}" y="14" font-size="13" fill="#ddd" font-family="sans-serif">${esc(cells[c].name)}</text>`;
    for (let r = 0; r < labels.length; r++) {
      const b = cells[c].rows[r];
      if (!b) continue;
      comp.push({ input: await sharp(b).rotate().resize(CW, CH, { fit: "cover" }).jpeg({ quality: 92 }).toBuffer(), left: c * (CW + PAD), top: TOP + r * (CH + LABEL) + LABEL });
    }
  }
  const Wd = cells.length * (CW + PAD), Hd = TOP + labels.length * (CH + LABEL);
  for (let r = 0; r < labels.length; r++) svg += `<text x="4" y="${TOP + r * (CH + LABEL) + 16}" font-size="14" font-weight="bold" fill="#fff" font-family="sans-serif">${esc(labels[r])}</text>`;
  comp.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${Wd}" height="${Hd}">${svg}</svg>`), left: 0, top: 0 });
  await sharp({ create: { width: Wd, height: Hd, channels: 3, background: "#111" } }).composite(comp).jpeg({ quality: 88 }).toFile(file);
}

// ---------- 2 and 3. clips ----------

type ClipScore = {
  id: string; category: string; frames: number; shots: number;
  /** Mean CIEDE2000 output vs source over the sampled frames, and its largest frame. */
  dE: number; dEMax: number;
  /** Per shot (frame-weighted mean over shots): std of the lightness shift (L*), its largest 0.5 s step, std of the balance shift (a*, b*). */
  lightStd: number; lightJump: number; wbStd: number;
  /** Largest 0.5 s step of the lightness shift while the source's own median L* moved by less than 5 (the grade's own jump), and the samples left out as a dissolve between shots. */
  lightJumpOwn: number; handover: number;
  /** Largest swing of the balance gains and of the exposure inside a shot (max/min ratio − 1). */
  wbSwing: number; expSwing: number;
  /** Share of the source's water-coloured pixels that come out warm or magenta (%), and output/source mean chroma. */
  waterWarm: number; chroma: number;
  /** Mean lightness shift (median L* out − source): a large negative value on a bright clip is a crush. */
  dL: number;
  /** Mean of the do-no-harm score over the samples (calm.ts: 1 = the engine stands down; the grade is "active" under 0.5). */
  calm: number;
  /** Tone and water of the output: mean over the samples of its median L*; the hue (CIELAB, circular mean; null without water) of the pixels that are water-coloured in the source; and the share (%) of the frame the grade crushes (source L* ≥ 20, output L* < 8). */
  outL50: number; waterHue: number | null; crush: number;
  /** The source's brightest 2 % (white fins, sand, foam): their mean output chroma (C*ab; neutral = low) and the share that comes out pink or magenta (%). */
  hiC: number; hiPink: number;
};

function decode(file: string, vf: string, w: number, h: number): Uint8ClampedArray[] {
  const r = spawnSync("ffmpeg", ["-v", "error", "-t", String(SECS), "-i", file, "-vf", vf, "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { maxBuffer: 2 ** 30 });
  const size = w * h * 4, buf = r.stdout as Buffer, out: Uint8ClampedArray[] = [];
  for (let o = 0; o + size <= buf.length; o += size) out.push(new Uint8ClampedArray(buf.buffer, buf.byteOffset + o, size));
  return out;
}
const std = (v: number[]) => { if (v.length < 2) return 0; const m = v.reduce((a, b) => a + b, 0) / v.length; return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length); };

function scoreClip(c: { id: string; category: string; file: string }): ClipScore {
  const file = path.join(VALSET, c.file);
  const st = JSON.parse(spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate", "-of", "json", file], { encoding: "utf8" }).stdout).streams[0];
  const [fa, fb] = String(st.r_frame_rate).split("/").map(Number), fps = fa / (fb || 1);
  const GW = CLIP_W, GH = Math.round((GW * st.height) / st.width / 2) * 2, n = GW * GH;
  const COLOR = "in_color_matrix=bt709:in_range=tv:out_range=pc";
  const thumbs = decode(file, `scale=${ANALYSIS_W}:${ANALYSIS_H}:flags=area:${COLOR},format=rgba`, ANALYSIS_W, ANALYSIS_H);
  const fulls = decode(file, `fps=1/${EVERY},scale=${GW}:${GH}:flags=area:${COLOR},format=rgba`, GW, GH);
  const sim = new ClipSim("preview", fps, 1);
  sim.profile(thumbs);
  const step = Math.max(1, Math.round(EVERY * fps));
  type S = { seg: number; dL: number; srcL: number; da: number; db: number; wbR: number; wbB: number; exp: number; calm: number };
  const samples: S[] = [];
  let dESum = 0, dEMax = 0, water = 0, warm = 0, cOut = 0, cSrc = 0;
  let hiN = 0, hiC = 0, hiPink = 0, hx = 0, hy = 0, crush = 0, pix = 0, l50 = 0;
  for (let f = 0; f < thumbs.length; f++) {
    sim.step(f, thumbs);
    if (f % step) continue;
    const full = fulls[Math.round(f / step)];
    if (!full) continue;
    const x = sim.state();
    const g = applyGrade({ params: x.params, settings: STYLES[DEFAULT_STYLE], depth: x.depth, clahe: x.clahe }, full, GW, GH);
    const Ls = new Float64Array(n), Lo = new Float64Array(n);
    let da = 0, db = 0, de = 0;
    for (let i = 0; i < n; i++) {
      const s = srgb8ToLab(full[i * 4], full[i * 4 + 1], full[i * 4 + 2]), o = srgb8ToLab(g[i * 4], g[i * 4 + 1], g[i * 4 + 2]);
      Ls[i] = s[0]; Lo[i] = o[0]; da += o[1] - s[1]; db += o[2] - s[2];
      de += deltaE00(s, o);
      const cs = Math.hypot(s[1], s[2]), co = Math.hypot(o[1], o[2]), hs = ((Math.atan2(s[2], s[1]) * 180) / Math.PI + 360) % 360;
      cSrc += cs; cOut += co;
      if (s[0] >= 20 && o[0] < 8) crush++;
      if (cs > 14 && hs > 170 && hs < 300 && co > 4) { hx += o[1] / co; hy += o[2] / co; }
      if (cs > 14 && hs > 170 && hs < 300) { water++; const ho = ((Math.atan2(o[2], o[1]) * 180) / Math.PI + 360) % 360; if (co >= 8 && (ho < 150 || ho > 310)) warm++; }
    }
    {
      const cut = Float64Array.from(Ls).sort()[Math.floor(0.98 * (n - 1))];
      for (let i = 0; i < n; i++) {
        if (Ls[i] < cut) continue;
        const o = srgb8ToLab(g[i * 4], g[i * 4 + 1], g[i * 4 + 2]), co = Math.hypot(o[1], o[2]), ho = ((Math.atan2(o[2], o[1]) * 180) / Math.PI + 360) % 360;
        hiN++; hiC += co;
        if (co >= 8 && (ho > 290 || ho < 20)) hiPink++;
      }
    }
    Ls.sort(); Lo.sort();
    de /= n; dESum += de; dEMax = Math.max(dEMax, de);
    pix += n; l50 += quantile(Lo, 0.5);
    samples.push({ seg: x.blending ? -1 : x.segment, dL: quantile(Lo, 0.5) - quantile(Ls, 0.5), srcL: quantile(Ls, 0.5), da: da / n, db: db / n, wbR: x.params.wb[0], wbB: x.params.wb[2], exp: x.params.exposure, calm: Math.max(x.params.calm ?? 0, x.params.calmTone ?? 0) });
  }
  // Per shot, weighted by its frames.
  const inShot = samples.filter((s) => s.seg >= 0), segs = [...new Set(inShot.map((s) => s.seg))];
  let lightStd = 0, wbStd = 0, lightJump = 0, lightJumpOwn = 0, wbSwing = 0, expSwing = 0;
  for (const sg of segs) {
    const v = inShot.filter((s) => s.seg === sg), wgt = v.length / inShot.length;
    lightStd += wgt * std(v.map((s) => s.dL));
    wbStd += wgt * Math.hypot(std(v.map((s) => s.da)), std(v.map((s) => s.db)));
    for (let i = 1; i < v.length; i++) {
      const j = Math.abs(v[i].dL - v[i - 1].dL);
      lightJump = Math.max(lightJump, j);
      if (Math.abs(v[i].srcL - v[i - 1].srcL) < 5) lightJumpOwn = Math.max(lightJumpOwn, j);
    }
    const swing = (k: "wbR" | "wbB" | "exp") => Math.max(...v.map((s) => s[k])) / Math.min(...v.map((s) => s[k])) - 1;
    wbSwing = Math.max(wbSwing, swing("wbR"), swing("wbB"));
    expSwing = Math.max(expSwing, swing("exp"));
  }
  return { id: c.id, category: c.category, frames: samples.length, shots: segs.length, dE: dESum / Math.max(1, samples.length), dEMax, lightStd, lightJump, lightJumpOwn, handover: samples.length - inShot.length, wbStd, wbSwing, expSwing, waterWarm: water ? (100 * warm) / water : 0, chroma: cSrc > 0 ? cOut / cSrc : 1, dL: samples.reduce((a, x) => a + x.dL, 0) / Math.max(1, samples.length), calm: samples.reduce((a, x) => a + x.calm, 0) / Math.max(1, samples.length), outL50: l50 / Math.max(1, samples.length), waterHue: water > 0.05 * pix ? ((Math.atan2(hy, hx) * 180) / Math.PI + 360) % 360 : null, crush: pix ? (100 * crush) / pix : 0, hiC: hiN ? hiC / hiN : 0, hiPink: hiN ? (100 * hiPink) / hiN : 0 };
}

/** Section 4 (--all): every clip of the valset against the colour review's counts. A clip is "active" when the engine does not stand down on it (calm < 0.5). */
function valsetSummary(v: ClipScore[]) {
  const act = v.filter((c) => c.calm < 0.5), med = (x: number[]) => (x.length ? quantile(Float64Array.from(x).sort(), 0.5) : NaN);
  const m = (x: number[]) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : NaN);
  return {
    clips: v.length, active: act.length,
    wbSwingOver25: v.filter((c) => c.wbSwing > 0.25).length, wbSwingOver50: v.filter((c) => c.wbSwing > 0.5).length, wbSwingMax: Math.max(0, ...v.map((c) => c.wbSwing)),
    lightJumpOver5: v.filter((c) => c.lightJump > 5).length, lightJumpOwnOver5: v.filter((c) => c.lightJumpOwn > 5).length, handoverClips: v.filter((c) => c.handover > 0).length, lightJumpMean: m(v.map((c) => c.lightJump)), lightStdMean: m(v.map((c) => c.lightStd)), wbStdMean: m(v.map((c) => c.wbStd)),
    chromaMedianActive: med(act.map((c) => c.chroma)), chromaLossOver25: act.filter((c) => c.chroma < 0.75).length, chromaGainOver25: act.filter((c) => c.chroma > 1.25).length,
    // The references: low-key (median L* 21–40 over the eight pairs) cobalt water (CIELAB 240–290°).
    waterClips: act.filter((c) => c.waterHue !== null).length, waterHueInRange: act.filter((c) => c.waterHue !== null && c.waterHue >= 240 && c.waterHue <= 290).length,
    outL50Median: med(act.map((c) => c.outL50)), outL50InRange: act.filter((c) => c.outL50 >= 21 && c.outL50 <= 40).length,
    crushMean: m(act.map((c) => c.crush)), crushOver2: act.filter((c) => c.crush > 2).length,
    waterWarmMean: m(v.map((c) => c.waterWarm)), waterWarmOver2: v.filter((c) => c.waterWarm > 2).length, hiPinkOver5: v.filter((c) => c.hiPink > 5).length,
  };
}

// ---------- main ----------

const valset = (): { id: string; category: string; file: string }[] => JSON.parse(fs.readFileSync(path.join(VALSET, "valset.json"), "utf8"));

if (flag("clip")) {
  // Worker: one clip, JSON on stdout.
  const c = valset().find((x) => x.id === opt("clip", ""))!;
  process.stdout.write(JSON.stringify(scoreClip(c)) + "\n");
} else {
  const t0 = performance.now();
  const inSet = (c: { id: string; category: string }) => HARM_CATEGORIES.has(c.category) || STABILITY_CLIPS.includes(c.id);
  const list = valset().filter((c) => (ALL || inSet(c)) && fs.existsSync(path.join(VALSET, c.file)));
  const all: ClipScore[] = [];
  const queue = flag("only-pairs") ? [] : [...list];
  if (CACHE) fs.mkdirSync(CACHE, { recursive: true });
  let fresh = 0, left = 0;
  const partial = CACHE !== "" && queue.filter((c) => !fs.existsSync(path.join(CACHE, `${c.id}.json`))).length > MAX_NEW;
  const worker = async () => {
    for (let c = queue.shift(); c; c = queue.shift()) {
      const id = c.id, cached = CACHE ? path.join(CACHE, `${id}.json`) : "";
      if (cached && fs.existsSync(cached)) { all.push(JSON.parse(fs.readFileSync(cached, "utf8"))); continue; }
      if (fresh >= MAX_NEW) { left++; continue; }
      fresh++;
      const out = await new Promise<string>((resolve, reject) => {
        const ch = spawn(process.execPath, ["--experimental-strip-types", "--no-warnings", fileURLToPath(import.meta.url), "--clip", id, "--valset", VALSET, "--secs", String(SECS), ...(TUNE ? ["--tune", TUNE] : [])], { stdio: ["ignore", "pipe", "inherit"] });
        let s = "";
        ch.stdout.on("data", (d) => (s += d));
        ch.on("close", (code) => (code === 0 ? resolve(s) : reject(new Error(`clip ${id} failed (${code})`))));
      });
      const line = out.trim().split("\n").pop()!;
      all.push(JSON.parse(line));
      if (cached) fs.writeFileSync(cached, line + "\n");
      process.stderr.write(`clip ${id} done\n`);
    }
  };
  const pool = Promise.all(Array.from({ length: Math.max(1, JOBS) }, worker));
  const pairs = flag("only-clips") || partial ? {} : await scorePairs();
  await pool;
  if (left) { console.log(`${fresh} clip(s) scored, ${left} left: run again with the same --cache`); process.exit(3); }
  all.sort((a, b) => a.id.localeCompare(b.id));
  // Scores 2 and 3 stay on their fixed sets (comparable with the baseline); --all adds section 4 over every clip.
  const clips = all.filter(inSet);

  const mean = (v: (number | null)[]) => { const x = v.filter((y): y is number => y !== null && Number.isFinite(y)); return x.length ? x.reduce((a, b) => a + b, 0) / x.length : NaN; };
  const P = Object.values(pairs), harm = clips.filter((c) => HARM_CATEGORIES.has(c.category));
  const summary = {
    reference: {
      source: mean(P.map((p) => p.source)),
      ...Object.fromEntries(Object.keys(STYLES).map((s) => [s, mean(P.map((p) => p.swd[s]))])),
      waterHueErr: mean(P.map((p) => p.err.waterHue)), L50Err: mean(P.map((p) => p.err.L50)), L5Err: mean(P.map((p) => p.err.L5)), warmCErr: mean(P.map((p) => p.err.warmC)), C50Err: mean(P.map((p) => p.err.C50)), waterCErr: mean(P.map((p) => p.err.waterC)), subjCErr: mean(P.map((p) => p.err.subjC)),
    } as Record<string, number>,
    harm: { dE: mean(harm.map((c) => c.dE)), dEMax: Math.max(0, ...harm.map((c) => c.dEMax)) },
    stability: { lightStd: mean(clips.map((c) => c.lightStd)), lightJump: mean(clips.map((c) => c.lightJump)), wbStd: mean(clips.map((c) => c.wbStd)), wbSwing: mean(clips.map((c) => c.wbSwing)), expSwing: mean(clips.map((c) => c.expSwing)) },
    diagnostics: { waterWarm: mean(clips.map((c) => c.waterWarm)), chroma: mean(clips.map((c) => c.chroma)) },
    ...(ALL ? { valset: valsetSummary(all) } : {}),
  };
  const round = (o: unknown): unknown => (typeof o === "number" ? r2(o) : Array.isArray(o) ? o.map(round) : o && typeof o === "object" ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, round(v)])) : o);
  const result = round({
    note: "CPU reference (apply.ts) incl. Seabed recovery; person segmentation, AI subjects and the temporal layer are not simulated. Default style = Vivid + Seabed 0.6 (the studio default).",
    config: { defaultStyle: DEFAULT_STYLE, scorePx: SCORE_PX, clipW: CLIP_W, every: EVERY, secs: SECS },
    summary, pairs, clips: Object.fromEntries(all.map((c) => [c.id, c])),
  }) as { summary: typeof summary; pairs: Record<string, PairScore>; clips: Record<string, ClipScore> };

  const base = fs.existsSync(BASELINE) ? (JSON.parse(fs.readFileSync(BASELINE, "utf8")) as typeof result) : null;
  const f = (x: number | null | undefined, w = 6) => (x === null || x === undefined || !Number.isFinite(x) ? "-" : x.toFixed(1)).padStart(w);
  const dl = (x: number | null | undefined, b: number | null | undefined) => (base && typeof x === "number" && typeof b === "number" ? ` (${x - b >= 0 ? "+" : ""}${(x - b).toFixed(2)})` : "");
  const lines: string[] = [];
  if (P.length) {
    lines.push("1. REFERENCE DISTANCE (CIELAB sliced Wasserstein to the user's grade; lower = closer)");
    lines.push(`${"pair".padEnd(20)}${["source", ...Object.keys(STYLES)].map((s) => (s === DEFAULT_STYLE ? `${s}*` : s).padStart(9)).join("")}   | default* vs ref: water hue     L50          L5        sand/skin C | chroma: median    water      warm subj`);
    for (const [name, p] of Object.entries(result.pairs)) {
      const pr = (a: number | null, b: number | null) => `${f(a, 5)}/${f(b, 5)}`;
      lines.push(`${name.padEnd(20)}${f(p.source, 9)}${Object.keys(STYLES).map((s) => f(p.swd[s], 9)).join("")}   |             ${pr(p.out.waterHue, p.ref.waterHue)}  ${pr(p.out.L50, p.ref.L50)}  ${pr(p.out.L5, p.ref.L5)}  ${pr(p.out.warmC, p.ref.warmC)} |        ${pr(p.out.C50, p.ref.C50)} ${pr(p.out.waterC, p.ref.waterC)} ${pr(p.out.subjC, p.ref.subjC)}`);
    }
    const s = result.summary.reference, b = base?.summary.reference;
    lines.push(`${"MEAN".padEnd(20)}${f(s.source, 9)}${Object.keys(STYLES).map((k) => f(s[k], 9)).join("")}   | mean |error|:  hue ${f(s.waterHueErr, 5)}°  L50 ${f(s.L50Err, 5)}  L5 ${f(s.L5Err, 5)}  C ${f(s.warmCErr, 5)} | chroma: median ${f(s.C50Err, 5)}  water ${f(s.waterCErr, 5)}  warm subj ${f(s.subjCErr, 5)}`);
    if (b) lines.push(`${"vs baseline".padEnd(20)}${" ".repeat(9)}${Object.keys(STYLES).map((k) => dl(s[k], b[k]).padStart(9)).join("")}   |                hue${dl(s.waterHueErr, b.waterHueErr)}  L50${dl(s.L50Err, b.L50Err)}  L5${dl(s.L5Err, b.L5Err)}  C${dl(s.warmCErr, b.warmCErr)} | median${dl(s.C50Err, b.C50Err)}  water${dl(s.waterCErr, b.waterCErr)}  warm subj${dl(s.subjCErr, b.subjCErr)}`);
  }
  if (clips.length) {
    lines.push("", "2. DO NO HARM (graded + topside clips, default style; mean CIEDE2000 output vs source; lower = better)");
    for (const c of harm) lines.push(`${c.id.padEnd(30)} dE ${f(result.clips[c.id].dE)}  worst frame ${f(result.clips[c.id].dEMax)}${dl(result.clips[c.id].dE, base?.clips[c.id]?.dE)}`);
    lines.push(`${"MEAN".padEnd(30)} dE ${f(result.summary.harm.dE)}  worst frame ${f(result.summary.harm.dEMax)}${dl(result.summary.harm.dE, base?.summary.harm.dE)}`);
    lines.push("", "3. STABILITY PER SHOT (default style; std over time of the grade's own shift inside a shot; lower = steadier)");
    lines.push(`${"clip".padEnd(30)} shots  light std  light jump  balance std  wb swing  exp swing | dE src  water→warm %  chroma x  dL*  bright C  bright pink %`);
    for (const c of clips) { const k = result.clips[c.id]; lines.push(`${c.id.padEnd(30)} ${String(k.shots).padStart(5)}  ${f(k.lightStd, 9)}  ${f(k.lightJump, 10)}  ${f(k.wbStd, 11)}  ${(k.wbSwing ?? 0).toFixed(2).padStart(8)}  ${(k.expSwing ?? 0).toFixed(2).padStart(9)} | ${f(k.dE)}  ${f(k.waterWarm, 12)}  ${(k.chroma ?? 0).toFixed(2).padStart(8)}  ${f(k.dL, 5)}  ${f(k.hiC, 7)}  ${f(k.hiPink, 12)}`); }
    const s = result.summary.stability, b = base?.summary.stability, d = result.summary.diagnostics;
    lines.push(`${"MEAN".padEnd(30)}        ${f(s.lightStd, 9)}  ${f(s.lightJump, 10)}  ${f(s.wbStd, 11)}  ${s.wbSwing.toFixed(2).padStart(8)}  ${s.expSwing.toFixed(2).padStart(9)} |         ${f(d.waterWarm, 12)}  ${d.chroma.toFixed(2).padStart(8)}`);
    if (b) lines.push(`vs baseline: light std${dl(s.lightStd, b.lightStd)}  light jump${dl(s.lightJump, b.lightJump)}  balance std${dl(s.wbStd, b.wbStd)}  wb swing${dl(s.wbSwing, b.wbSwing)}  exp swing${dl(s.expSwing, b.expSwing)}`);
  }
  if (ALL && all.length) {
    const v = (result.summary as unknown as { valset: ReturnType<typeof valsetSummary> }).valset, bv = (base?.summary as unknown as { valset?: ReturnType<typeof valsetSummary> } | undefined)?.valset;
    const dn = (x: number, b: number | undefined) => (typeof b === "number" ? ` (${x - b >= 0 ? "+" : ""}${Math.round((x - b) * 100) / 100})` : "");
    lines.push("", `4. VALSET (${v.clips} clips, ${v.active} with the engine active; default style)`);
    lines.push(`${"clip".padEnd(30)} ${"category".padEnd(22)} calm  light std  light jump  balance std  wb swing | dE src  water→warm %  chroma x    dL*  bright pink % | out L50  water hue  crush %  own jump`);
    for (const c of all) { const k = result.clips[c.id]; lines.push(`${c.id.padEnd(30)} ${c.category.padEnd(22)} ${(k.calm ?? 0).toFixed(2)}  ${f(k.lightStd, 9)}  ${f(k.lightJump, 10)}  ${f(k.wbStd, 11)}  ${(k.wbSwing ?? 0).toFixed(2).padStart(8)} | ${f(k.dE)}  ${f(k.waterWarm, 12)}  ${(k.chroma ?? 0).toFixed(2).padStart(8)}  ${f(k.dL, 5)}  ${f(k.hiPink, 12)} | ${f(k.outL50, 7)}  ${f(k.waterHue, 9)}  ${f(k.crush, 7)}  ${f(k.lightJumpOwn, 8)}`); }
    lines.push(`balance swing inside a shot > 1.25x: ${v.wbSwingOver25} clips${dn(v.wbSwingOver25, bv?.wbSwingOver25)}, > 1.5x: ${v.wbSwingOver50}${dn(v.wbSwingOver50, bv?.wbSwingOver50)}, largest ${(1 + v.wbSwingMax).toFixed(2)}x`);
    lines.push(`lightness jump > 5 L* in 0.5 s: ${v.lightJumpOver5} clips${dn(v.lightJumpOver5, bv?.lightJumpOver5)}, of them with a steady source (the grade's own jump): ${v.lightJumpOwnOver5}${dn(v.lightJumpOwnOver5, bv?.lightJumpOwnOver5)}; ${v.handoverClips} clips hold a dissolve between shots (left out); mean jump ${v.lightJumpMean.toFixed(2)}${dn(v.lightJumpMean, bv?.lightJumpMean)}, mean light std ${v.lightStdMean.toFixed(2)}${dn(v.lightStdMean, bv?.lightStdMean)}, mean balance std ${v.wbStdMean.toFixed(2)}${dn(v.wbStdMean, bv?.wbStdMean)}`);
    lines.push(`chroma kept (active clips, output / source): median ${v.chromaMedianActive.toFixed(2)}${dn(v.chromaMedianActive, bv?.chromaMedianActive)}; lose > 25 %: ${v.chromaLossOver25}${dn(v.chromaLossOver25, bv?.chromaLossOver25)}, gain > 25 %: ${v.chromaGainOver25}${dn(v.chromaGainOver25, bv?.chromaGainOver25)}`);
    lines.push(`look (active clips): water hue inside 240–290° in ${v.waterHueInRange} of ${v.waterClips} clips with water${dn(v.waterHueInRange, bv?.waterHueInRange)}; median L* ${v.outL50Median.toFixed(1)}${dn(v.outL50Median, bv?.outL50Median)}, inside 21–40 in ${v.outL50InRange} of ${v.active}${dn(v.outL50InRange, bv?.outL50InRange)}; crushed (source L* ≥ 20 → under 8): mean ${v.crushMean.toFixed(2)} %${dn(v.crushMean, bv?.crushMean)}, > 2 % in ${v.crushOver2} clips${dn(v.crushOver2, bv?.crushOver2)}`);
    lines.push(`water turned warm: mean ${v.waterWarmMean.toFixed(2)} %${dn(v.waterWarmMean, bv?.waterWarmMean)}, > 2 % in ${v.waterWarmOver2} clips${dn(v.waterWarmOver2, bv?.waterWarmOver2)}; pink highlights > 5 % in ${v.hiPinkOver5} clips${dn(v.hiPinkOver5, bv?.hiPinkOver5)}`);
  }
  const s = result.summary;
  lines.push("", `SUMMARY  reference ${f(s.reference[DEFAULT_STYLE], 0)} (source ${f(s.reference.source, 0)})${dl(s.reference[DEFAULT_STYLE], base?.summary.reference[DEFAULT_STYLE])} · harm dE ${f(s.harm.dE, 0)}${dl(s.harm.dE, base?.summary.harm.dE)} · stability light ${f(s.stability.lightStd, 0)}${dl(s.stability.lightStd, base?.summary.stability.lightStd)} / balance ${f(s.stability.wbStd, 0)}${dl(s.stability.wbStd, base?.summary.stability.wbStd)}${P.length ? ` · chroma error median ${f(s.reference.C50Err, 0)}${dl(s.reference.C50Err, base?.summary.reference.C50Err)} / water ${f(s.reference.waterCErr, 0)}${dl(s.reference.waterCErr, base?.summary.reference.waterCErr)} / warm ${f(s.reference.subjCErr, 0)}${dl(s.reference.subjCErr, base?.summary.reference.subjCErr)} · water hue error ${f(s.reference.waterHueErr, 0)}°${dl(s.reference.waterHueErr, base?.summary.reference.waterHueErr)}` : ""}${base ? "   (deltas vs " + path.basename(BASELINE) + ")" : ""}`);
  if (TUNE) lines.push(`TUNED: ${TUNE}`);
  lines.push(`Scores come from the CPU reference incl. Seabed recovery; person segmentation / AI subjects / temporal layer are not simulated. ${((performance.now() - t0) / 1000).toFixed(0)} s`);
  console.log(lines.join("\n"));
  if (OUT) fs.writeFileSync(path.join(OUT, "score.json"), JSON.stringify(result, null, 1) + "\n");
  if (flag("write-baseline")) { fs.writeFileSync(BASELINE, JSON.stringify(result, null, 1) + "\n"); console.log(`baseline written: ${BASELINE}`); }
}
