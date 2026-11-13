// Fits the fitted Look (src/engine/look-fit.ts: twelve global parameters per style) to the owner's reference pairs,
// with leave-one-out and the valset guards.
//
//   1. capture   node --experimental-strip-types apps/aqua-fix/eval/fit-look2.ts --capture --cache <dir> [--max n]
//                Replays every valset clip at preview cadence (clip-sim.ts) and records, for three frames per clip
//                and per style, each pixel's graded colour just before the Look (ApplyContext.lookTap) with what
//                the end of the pixel needs. Exit code 3 while clips are left (run again). The cache belongs to
//                ONE state of the stages before the Look.
//   2. fit       … --fit --cache <dir> --out <file.json> [--style vivid|blue] [--hold <pair>] [--lambda 0.3] [--start <file.json>]
//                One fit: all pairs, or all but --hold (a leave-one-out fold: the held-out pair is scored with the
//                parameters fitted on the others). --only <pair> fits one pair alone (what a per-picture look could reach);
//                --no-guard switches the valset guards off, --hold-weight 0 the per-pair hold (the family's ceiling).
//   3. report    … --report <dir of fit JSONs> [--style vivid]
//   5. sheet     … --sheet <out dir> --cache <dir> [--set <file.json>] [--rows label=fit.json,label=dir]
//                contact sheets: source / without the Look / with it (/ further fits) (/ reference)
//   4. check     … --check --cache <dir> [--style vivid] [--set <file.json>]   the guards and the pair scores of the shipped (or given) set
//
// Objective (lower is better):
//     mean over pairs of [ SWD(look(graded), reference) + 0.1 × water-hue error / 10° ]      (score.ts's distance)
//   + HOLD × mean over pairs of max(0, distance − distance without the Look − 0.3)              (no pair is sold for the mean)
//   + lambda × Σ (parameter / its limit)²                                                         (stay near identity)
//   + the valset guard penalty (below)
// Candidates whose tone curve leaves the slope limits (FIT_LOOK_LIMITS) are rejected outright.
//
// Valset guards, per clip, against the same clip without the Look (the "base"):
//   chroma    output / source mean chroma must stay inside 0.75–1.25 (a clip already outside: within 3 % under / 5 % over its base)
//   crush     share of pixels taken from source L* ≥ 20 to under 8 must not rise by more than 0.3 % (0.5 % is always
//             allowed) and never cross 2 % (a clip already over: + 0.3 %)
//   warm      pixels that are warm-hued in the base (skin, sand, reef: CIELAB hue 20–100°, C* ≥ 12): mean |hue change| ≤ 4°
//             and their chroma within 0.8–1.3 × the base (no cyan skin, no orange sand, no grey reef)
//   neutral   near-neutral lit pixels in the base (C* < 8, L* > 35: white sand, fins, silver): mean (a*, b*) move ≤ 3
//   water     source-water pixels that come out warm: as crush, with + 0.5 %, 1 % always allowed, never across 2 %
//   harm      graded and topside clips: mean CIEDE2000 to the source must not rise by more than 0.1
// A fit is reported with its violations; a set that violates any guard is not shipped.
//
// The search is a pattern search from identity (or --start): each parameter is stepped by ± its step, the best move
// is kept, steps halve when a sweep finds nothing. Deterministic; no gradients (the objective is piecewise).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { analyzeThumbnail, ANALYSIS_H, ANALYSIS_W } from "../src/engine/analyze.ts";
import { applyGrade, finishPixel } from "../src/engine/apply.ts";
import { DEFAULT_SETTINGS, type UserSettings } from "../src/engine/params.ts";
import { FIT_LOOK, FIT_LOOK_IDENTITY, FIT_LOOK_KEYS, FIT_LOOK_LIMITS, fitLookSlope, type FitLookSet } from "../src/engine/look-fit.ts";
import { ClipSim } from "./clip-sim.ts";
import { deltaE00, halve, hueDiff, labOf, regionStats, srgb8ToLab, swdOf, swdQuantiles, type Lab, type Region } from "./colour-metrics.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const flag = (n: string) => args.includes(`--${n}`);
const PAIRS = opt("pairs", process.env.SCORE_PAIRS ?? "/home/majdyz/video-data/review-fable/colour/pairs");
const VALSET = opt("valset", process.env.SCORE_VALSET ?? "/home/majdyz/video-data/valset");
const CACHE = opt("cache", "");
const STYLE = opt("style", "vivid") as "vivid" | "blue";
const LAMBDA = parseFloat(opt("lambda", "0.3")), HOLD = parseFloat(opt("hold-weight", "1"));
const require = createRequire(path.resolve(HERE, "../package.json"));
// The studio's styles (score.ts STYLES).
const STYLES: Record<string, UserSettings> = {
  vivid: { ...DEFAULT_SETTINGS, vivid: 1, blue: 0, seabed: 0.6 },
  blue: { ...DEFAULT_SETTINGS, vivid: 1, blue: 1, seabed: 0.6 },
};
const SCORE_PX = 200; // score.ts: stills graded at 2 × this, halved, compared at this size
const CLIP_W = 160, EVERY = 0.5, SECS = 8, SAMPLES = [3, 8, 13]; // valset frames at 1.5, 4 and 6.5 s
const HARM_CATEGORIES = new Set(["graded", "topside"]);
const VERBOSE = flag("verbose");
const FIT_STRIDE = 4, GUARD_STRIDE = 3;

// ---------- a recorded frame: the graded colour before the Look, per pixel ----------

type Frame = {
  w: number; h: number;
  /** Per pixel: L, a, b (Oklab before the Look), chroma floor, detail ratio. */
  pre: Float32Array;
  /** The source, RGBA8. */
  src: Uint8ClampedArray;
  strength: number; look: number; mix: number;
};
function record(ctx: Parameters<typeof applyGrade>[0], img: Uint8ClampedArray, w: number, h: number): Frame {
  const pre = new Float32Array(w * h * 5);
  let i = 0, strength = 1, look = 0, mix = 0;
  applyGrade({ ...ctx, lookTap: (L, a, b, cFloor, dr, st, lk, mx) => { pre[i++] = L; pre[i++] = a; pre[i++] = b; pre[i++] = cFloor; pre[i++] = dr; strength = st; look = lk; mix = mx; } }, img, w, h);
  return { w, h, pre, src: img, strength, look, mix };
}
type Sets = { vivid: FitLookSet; blue: FitLookSet };
const setsOf = (P: FitLookSet): Sets => (STYLE === "blue" ? { vivid: FIT_LOOK.vivid, blue: P } : { vivid: P, blue: FIT_LOOK.blue });
/** The frame's output (RGBA8, as applyGrade writes it) under a parameter set; every `stride`-th pixel of every `stride`-th row. */
function render(f: Frame, sets: Sets, stride = 1): { rgba: Uint8ClampedArray; w: number; h: number } {
  const w = Math.ceil(f.w / stride), h = Math.ceil(f.h / stride), out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0, o = 0; y < f.h; y += stride) for (let x = 0; x < f.w; x += stride, o += 4) {
    const i = y * f.w + x, k = i * 5;
    const c = finishPixel(f.pre[k], f.pre[k + 1], f.pre[k + 2], f.pre[k + 3], f.pre[k + 4], f.look, f.mix, sets);
    for (let ch = 0; ch < 3; ch++) { const s = f.src[i * 4 + ch] / 255; out[o + ch] = (s + (c[ch] - s) * f.strength) * 255 + 0.5; }
    out[o + 3] = 255;
  }
  return { rgba: out, w, h };
}

// ---------- reference pairs ----------

type Pair = { name: string; frame: Frame; ref: Lab; refQ: Float64Array; refStats: Region; /** Without the Look: the fit's own distance (strided) and score.ts's. */ d0: number; exact0: number };
async function loadPairs(): Promise<Pair[]> {
  const sharp = require("sharp") as typeof import("sharp");
  const out: Pair[] = [];
  for (const fn of fs.readdirSync(path.join(PAIRS, "src")).filter((x) => /\.(jpe?g|png)$/i.test(x)).sort()) {
    const meta = await sharp(path.join(PAIRS, "src", fn)).rotate().toBuffer({ resolveWithObject: true });
    const k = SCORE_PX / Math.max(meta.info.width, meta.info.height), sw = Math.max(1, Math.round(meta.info.width * k)), sh = Math.max(1, Math.round(meta.info.height * k)), W = sw * 2, H = sh * 2;
    const img = new Uint8ClampedArray((await sharp(meta.data).resize(W, H, { fit: "fill" }).ensureAlpha().raw().toBuffer()).buffer);
    const tb = await sharp(meta.data).resize(ANALYSIS_W, ANALYSIS_H, { fit: "fill" }).ensureAlpha().raw().toBuffer();
    const a = analyzeThumbnail(new Uint8ClampedArray(tb.buffer, tb.byteOffset, tb.byteLength), ANALYSIS_W, ANALYSIS_H);
    const rb = await sharp(path.join(PAIRS, "ref", fn)).rotate().resize(SCORE_PX, SCORE_PX, { fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const ref = labOf(rb.data, rb.info.width * rb.info.height);
    const frame = record({ params: a.params, settings: STYLES[STYLE], depth: a.depth, clahe: a.clahe }, img, W, H);
    const p: Pair = { name: fn.replace(/\.[^.]+$/, ""), frame, ref, refQ: swdQuantiles(ref), refStats: regionStats(ref), d0: 0, exact0: 0 };
    const idy = setsOf(FIT_LOOK_IDENTITY);
    p.d0 = pairFit(p, idy).d; p.exact0 = pairExact(p, idy).d;
    out.push(p);
  }
  return out;
}
type PScore = { d: number; hue: number | null; stats: Region };
function scoreLab(p: Pair, lab: Lab): PScore {
  const st = regionStats(lab);
  return { d: swdOf(swdQuantiles(lab), p.refQ), hue: st.waterHue === null || p.refStats.waterHue === null ? null : hueDiff(st.waterHue, p.refStats.waterHue), stats: st };
}
/** The fit's distance: a strided sample of the graded pixels. */
function pairFit(p: Pair, sets: Sets): PScore {
  const r = render(p.frame, sets, FIT_STRIDE);
  return scoreLab(p, labOf(r.rgba, r.w * r.h));
}
/** score.ts's distance: graded at 2 ×, halved. */
function pairExact(p: Pair, sets: Sets): PScore {
  const r = render(p.frame, sets, 1);
  return scoreLab(p, labOf(halve(r.rgba, r.w, r.h), (r.w >> 1) * (r.h >> 1)));
}

// ---------- valset frames and guards ----------

type Clip = { id: string; category: string; file: string };
const valset = (): Clip[] => JSON.parse(fs.readFileSync(path.join(VALSET, "valset.json"), "utf8"));
function decode(file: string, vf: string, w: number, h: number): Uint8ClampedArray[] {
  const r = spawnSync("ffmpeg", ["-v", "error", "-t", String(SECS), "-i", file, "-vf", vf, "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { maxBuffer: 2 ** 30 });
  const size = w * h * 4, buf = r.stdout as Buffer, out: Uint8ClampedArray[] = [];
  for (let o = 0; o + size <= buf.length; o += size) out.push(new Uint8ClampedArray(buf.buffer, buf.byteOffset + o, size));
  return out;
}
/** Worker: one clip → <cache>/<id>.json (meta) + <id>.bin (per style, per frame: pre floats then source bytes). */
function captureClip(c: Clip): void {
  const file = path.join(VALSET, c.file);
  const st = JSON.parse(spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate", "-of", "json", file], { encoding: "utf8" }).stdout).streams[0];
  const [fa, fb] = String(st.r_frame_rate).split("/").map(Number), fps = fa / (fb || 1);
  const GW = CLIP_W, GH = Math.round((GW * st.height) / st.width / 2) * 2;
  const COLOR = "in_color_matrix=bt709:in_range=tv:out_range=pc";
  const thumbs = decode(file, `scale=${ANALYSIS_W}:${ANALYSIS_H}:flags=area:${COLOR},format=rgba`, ANALYSIS_W, ANALYSIS_H);
  const fulls = decode(file, `fps=1/${EVERY},scale=${GW}:${GH}:flags=area:${COLOR},format=rgba`, GW, GH);
  const sim = new ClipSim("preview", fps, 1);
  sim.profile(thumbs);
  const step = Math.max(1, Math.round(EVERY * fps));
  const meta: { id: string; category: string; w: number; h: number; frames: { style: string; strength: number; look: number; mix: number; calm: number }[] } = { id: c.id, category: c.category, w: GW, h: GH, frames: [] };
  const chunks: Buffer[] = [];
  for (let f = 0; f < thumbs.length; f++) {
    sim.step(f, thumbs);
    if (f % step || !SAMPLES.includes(Math.round(f / step))) continue;
    const full = fulls[Math.round(f / step)];
    if (!full) continue;
    const x = sim.state();
    for (const style of Object.keys(STYLES)) {
      const fr = record({ params: x.params, settings: STYLES[style], depth: x.depth, clahe: x.clahe }, full, GW, GH);
      meta.frames.push({ style, strength: fr.strength, look: fr.look, mix: fr.mix, calm: Math.max(x.params.calm ?? 0, x.params.calmTone ?? 0) });
      chunks.push(Buffer.from(fr.pre.buffer, fr.pre.byteOffset, fr.pre.byteLength), Buffer.from(full.buffer, full.byteOffset, full.byteLength));
    }
  }
  fs.writeFileSync(path.join(CACHE, `${c.id}.bin`), Buffer.concat(chunks));
  fs.writeFileSync(path.join(CACHE, `${c.id}.json`), JSON.stringify(meta));
}

type GFrame = Frame & { /** CIELAB of the source and of the output without the Look, strided. */ sLab: Lab; bLab: Lab };
type GClip = { id: string; category: string; frames: GFrame[]; base: GStats };
type GStats = { chroma: number; crush: number; warmShift: number; neutralShift: number; waterWarm: number; dE: number; L50: number; warmHueAbs: number; /** Signed mean hue change (°) and chroma ratio of the base-warm pixels; share (%) of the base-neutral pixels that gain C* > 6. */ warmHue: number; warmC: number; neutralTint: number };
function loadClips(stride: number): GClip[] {
  const out: GClip[] = [];
  for (const c of valset()) {
    const mf = path.join(CACHE, `${c.id}.json`);
    if (!fs.existsSync(mf)) continue;
    const meta = JSON.parse(fs.readFileSync(mf, "utf8")), bin = fs.readFileSync(path.join(CACHE, `${c.id}.bin`));
    const n = meta.w * meta.h, frames: GFrame[] = [];
    let off = 0;
    for (const fm of meta.frames) {
      const pre = new Float32Array(bin.buffer.slice(bin.byteOffset + off, bin.byteOffset + off + n * 20)); off += n * 20;
      const src = new Uint8ClampedArray(bin.buffer.slice(bin.byteOffset + off, bin.byteOffset + off + n * 4)); off += n * 4;
      if (fm.style !== STYLE) continue;
      const f: Frame = { w: meta.w, h: meta.h, pre, src, strength: fm.strength, look: fm.look, mix: fm.mix };
      const b = render(f, setsOf(FIT_LOOK_IDENTITY), stride), sw = b.w, sh = b.h, s = new Uint8ClampedArray(sw * sh * 4);
      for (let y = 0, o = 0; y < f.h; y += stride) for (let x = 0; x < f.w; x += stride, o += 4) { const i = (y * f.w + x) * 4; s[o] = src[i]; s[o + 1] = src[i + 1]; s[o + 2] = src[i + 2]; }
      frames.push({ ...f, sLab: labOf(s, sw * sh), bLab: labOf(b.rgba, sw * sh) });
    }
    const clip: GClip = { id: c.id, category: c.category, frames, base: null as unknown as GStats };
    clip.base = clipStats(clip, null, stride, true);
    out.push(clip);
  }
  return out;
}
const hueOf = (a: number, b: number) => ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
/** Guard statistics of one clip under a parameter set (null = without the Look). `full` adds the slow ones (CIEDE2000 to the source on every clip, median L*). */
function clipStats(c: GClip, sets: Sets | null, stride: number, full = false): GStats {
  let cS = 0, cO = 0, crush = 0, pix = 0, water = 0, warmOut = 0, wn = 0, ws = 0, wh = 0, wha = 0, wc0 = 0, wc1 = 0, nn = 0, ns = 0, nt = 0, de = 0, l50 = 0;
  const harm = HARM_CATEGORIES.has(c.category);
  for (const f of c.frames) {
    const n = f.sLab.length / 3;
    const oLab = sets && f.look > 0 ? (() => { const r = render(f, sets, stride); return labOf(r.rgba, n); })() : f.bLab;
    const Ls = full ? new Float64Array(n) : null;
    for (let i = 0; i < n; i++) {
      const sL = f.sLab[i * 3], sa = f.sLab[i * 3 + 1], sb = f.sLab[i * 3 + 2], oL = oLab[i * 3], oa = oLab[i * 3 + 1], ob = oLab[i * 3 + 2], bL = f.bLab[i * 3], ba = f.bLab[i * 3 + 1], bb = f.bLab[i * 3 + 2];
      const cs = Math.hypot(sa, sb), co = Math.hypot(oa, ob), cb = Math.hypot(ba, bb);
      cS += cs; cO += co; pix++;
      if (sL >= 20 && oL < 8) crush++;
      if (cs > 14) { const hs = hueOf(sa, sb); if (hs > 170 && hs < 300) { water++; const ho = hueOf(oa, ob); if (co >= 8 && (ho < 150 || ho > 310)) warmOut++; } }
      const hb = hueOf(ba, bb);
      if (cb >= 12 && hb >= 20 && hb <= 100) { wn++; ws += Math.hypot(oa - ba, ob - bb); const dh = ((hueOf(oa, ob) - hb + 540) % 360) - 180; wh += dh; wha += Math.abs(dh); wc0 += cb; wc1 += co; }
      if (cb < 8 && bL > 35) { nn++; ns += Math.hypot(oa - ba, ob - bb); if (co - cb > 6) nt++; }
      if (harm || full) de += deltaE00([sL, sa, sb], [oL, oa, ob]);
      if (Ls) Ls[i] = oL;
    }
    if (Ls) { Ls.sort(); l50 += Ls[Ls.length >> 1] / c.frames.length; }
  }
  return { chroma: cS > 0 ? cO / cS : 1, crush: pix ? (100 * crush) / pix : 0, warmShift: wn > 0.01 * pix ? ws / wn : 0, neutralShift: nn > 0.01 * pix ? ns / nn : 0, waterWarm: water ? (100 * warmOut) / water : 0, dE: pix ? de / pix : 0, L50: l50, warmHue: wn > 0.01 * pix ? wh / wn : 0, warmHueAbs: wn > 0.01 * pix ? wha / wn : 0, warmC: wc0 > 0 && wn > 0.01 * pix ? wc1 / wc0 : 1, neutralTint: nn > 0.01 * pix ? (100 * nt) / nn : 0 };
}
const GUARD = { chromaLo: 0.75, chromaHi: 1.25, chromaTolLo: 0.97, chromaTolHi: 1.05, crush: 0.5, crushTol: 0.3, crushMax: 2, waterWarmTol: 0.5, waterWarmMax: 2, warmHue: 4, warmCLo: 0.8, warmCHi: 1.3, neutral: 3, waterWarm: 1, harmDE: 0.1 };
/** The guard violations of one clip (each as an amount over its limit; empty = clean). */
function violations(c: GClip, s: GStats): Record<string, number> {
  const b = c.base, v: Record<string, number> = {};
  const add = (k: string, x: number) => { if (x > 1e-9) v[k] = x; };
  // A clip inside a limit must stay inside it (the valset's counts cannot rise); one already outside may drift by the tolerance.
  add("chromaLoss", (b.chroma < GUARD.chromaLo ? b.chroma * GUARD.chromaTolLo : GUARD.chromaLo) - s.chroma);
  add("chromaGain", s.chroma - (b.chroma > GUARD.chromaHi ? b.chroma * GUARD.chromaTolHi : GUARD.chromaHi));
  add("crush", s.crush - (b.crush > GUARD.crushMax ? b.crush + GUARD.crushTol : Math.min(GUARD.crushMax, Math.max(b.crush + GUARD.crushTol, GUARD.crush))));
  add("warmHue", s.warmHueAbs - GUARD.warmHue);
  add("warmChroma", Math.max(GUARD.warmCLo - s.warmC, s.warmC - GUARD.warmCHi));
  add("neutral", s.neutralShift - GUARD.neutral);
  add("waterWarm", s.waterWarm - (b.waterWarm > GUARD.waterWarmMax ? b.waterWarm + GUARD.waterWarmTol : Math.min(GUARD.waterWarmMax, Math.max(b.waterWarm + GUARD.waterWarmTol, GUARD.waterWarm))));
  if (HARM_CATEGORIES.has(c.category)) add("harm", s.dE - b.dE - GUARD.harmDE);
  return v;
}
const PEN: Record<string, number> = { chromaLoss: 10, chromaGain: 10, crush: 1, warmHue: 0.5, warmChroma: 10, neutral: 0.5, waterWarm: 1, harm: 2 };
let lastBreak: Record<string, number> = {};
function guardPenalty(clips: GClip[], sets: Sets): number {
  let pen = 0;
  lastBreak = {};
  if (flag("no-guard")) return 0;
  for (const c of clips) for (const [k, x] of Object.entries(violations(c, clipStats(c, sets, GUARD_STRIDE)))) { pen += PEN[k] * x; lastBreak[k] = (lastBreak[k] ?? 0) + PEN[k] * x; }
  return pen;
}

// ---------- the fit ----------

const LIMIT: Record<(typeof FIT_LOOK_KEYS)[number], number> = { sh: FIT_LOOK_LIMITS.tone, mid: FIT_LOOK_LIMITS.tone, hi: FIT_LOOK_LIMITS.tone, rot: FIT_LOOK_LIMITS.rot, sat: FIT_LOOK_LIMITS.sat, coolSat: FIT_LOOK_LIMITS.sat, warmSat: FIT_LOOK_LIMITS.sat, satL: FIT_LOOK_LIMITS.sat, shA: FIT_LOOK_LIMITS.tint, shB: FIT_LOOK_LIMITS.tint, hiA: FIT_LOOK_LIMITS.tint, hiB: FIT_LOOK_LIMITS.tint };
/** `bound`: a cost the candidate must beat; when the fit and the regulariser alone do not, the (slow) guards are not evaluated. */
function objective(P: FitLookSet, pairs: Pair[], clips: GClip[], bound = Infinity): { cost: number; fit: number; pen: number } {
  const [lo, hi] = fitLookSlope(P);
  if (lo < FIT_LOOK_LIMITS.slopeMin || hi > FIT_LOOK_LIMITS.slopeMax) return { cost: Infinity, fit: Infinity, pen: 0 };
  const sets = setsOf(P);
  let fit = 0;
  for (const p of pairs) { const s = pairFit(p, sets); fit += s.d + 0.1 * (s.hue ?? 0) / 10 + HOLD * Math.max(0, s.d - p.d0 - 0.3); }
  fit /= pairs.length;
  let reg = 0;
  for (const k of FIT_LOOK_KEYS) reg += (P[k] / LIMIT[k]) ** 2;
  if (fit + LAMBDA * reg >= bound) return { cost: Infinity, fit, pen: NaN };
  const pen = guardPenalty(clips, sets);
  return { cost: fit + LAMBDA * reg + pen, fit, pen };
}
function search(start: FitLookSet, pairs: Pair[], clips: GClip[], log: (s: string) => void): FitLookSet {
  let P = { ...start }, best = objective(P, pairs, clips), evals = 1;
  let scale = 0.25;
  while (scale >= 1 / 32 && evals < 900) {
    let moved = false;
    for (const k of FIT_LOOK_KEYS) {
      let bestK = P[k], bc = best;
      for (const dir of [-1, 1]) {
        const v = Math.min(LIMIT[k], Math.max(-LIMIT[k], P[k] + dir * scale * LIMIT[k]));
        if (v === P[k]) continue;
        const o = objective({ ...P, [k]: v }, pairs, clips, bc.cost - 2e-4); evals++;
        if (VERBOSE) log(`    ${k} ${v.toFixed(4)}: cost ${o.cost.toFixed(3)} (fit ${o.fit.toFixed(3)}, guard ${o.pen.toFixed(3)}) ${Object.entries(lastBreak).map(([g, x]) => `${g} ${x.toFixed(2)}`).join(" ")}`);
        if (o.cost < bc.cost - 2e-4) { bc = o; bestK = v; }
      }
      if (bestK !== P[k]) { P = { ...P, [k]: bestK }; best = bc; moved = true; }
    }
    log(`step ${scale.toFixed(4)}  cost ${best.cost.toFixed(3)} (fit ${best.fit.toFixed(3)}, guard ${best.pen.toFixed(3)})  evals ${evals}`);
    if (!moved) scale /= 2;
  }
  return P;
}
const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
const fmtSet = (P: FitLookSet) => `{ ${FIT_LOOK_KEYS.map((k) => `${k}: ${r4(P[k])}`).join(", ")} }`;
function guardReport(clips: GClip[], sets: Sets, stride: number) {
  const rows = clips.map((c) => { const s = clipStats(c, sets, stride, true); return { id: c.id, category: c.category, look: c.frames.reduce((a, f) => a + f.look, 0) / Math.max(1, c.frames.length), base: c.base, out: s, violations: violations(c, s) }; });
  const act = rows.filter((r) => r.look > 0.5), cnt = (f: (r: (typeof rows)[number], k: "base" | "out") => boolean) => ({ base: rows.filter((r) => f(r, "base")).length, out: rows.filter((r) => f(r, "out")).length });
  const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / Math.max(1, v.length), med = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : NaN; };
  const harm = rows.filter((r) => HARM_CATEGORIES.has(r.category));
  return {
    clips: rows.length, lookActive: act.length,
    chromaMedian: { base: med(rows.map((r) => r.base.chroma)), out: med(rows.map((r) => r.out.chroma)) },
    chromaLossOver25: cnt((r, k) => r[k].chroma < 0.75), chromaGainOver25: cnt((r, k) => r[k].chroma > 1.25),
    crushMean: { base: mean(rows.map((r) => r.base.crush)), out: mean(rows.map((r) => r.out.crush)) }, crushOver2: cnt((r, k) => r[k].crush > 2),
    L50Median: { base: med(rows.map((r) => r.base.L50)), out: med(rows.map((r) => r.out.L50)) }, L50ShiftMax: Math.max(...rows.map((r) => Math.abs(r.out.L50 - r.base.L50))),
    warmShiftMax: Math.max(...rows.map((r) => r.out.warmShift)), warmHueMax: Math.max(...rows.map((r) => r.out.warmHueAbs)), warmChromaRange: [Math.min(...rows.map((r) => r.out.warmC)), Math.max(...rows.map((r) => r.out.warmC))],
    neutralShiftMax: Math.max(...rows.map((r) => r.out.neutralShift)), neutralTintMax: Math.max(...rows.map((r) => r.out.neutralTint)),
    waterWarmOver2: cnt((r, k) => r[k].waterWarm > 2),
    harmDE: { base: mean(harm.map((r) => r.base.dE)), out: mean(harm.map((r) => r.out.dE)) },
    dEMean: { base: mean(rows.map((r) => r.base.dE)), out: mean(rows.map((r) => r.out.dE)) },
    violations: Object.fromEntries(rows.filter((r) => Object.keys(r.violations).length).map((r) => [r.id, r.violations])),
    rows,
  };
}

// ---------- main ----------

if (flag("capture-clip")) {
  captureClip(valset().find((c) => c.id === opt("capture-clip", ""))!);
} else if (flag("capture")) {
  fs.mkdirSync(CACHE, { recursive: true });
  const MAX = parseInt(opt("max", "0")) || Infinity;
  let fresh = 0, left = 0;
  for (const c of valset()) {
    if (fs.existsSync(path.join(CACHE, `${c.id}.json`)) || !fs.existsSync(path.join(VALSET, c.file))) continue;
    if (fresh >= MAX) { left++; continue; }
    fresh++;
    const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", fileURLToPath(import.meta.url), "--capture-clip", c.id, "--cache", CACHE, "--valset", VALSET], { stdio: "inherit" });
    if (r.status !== 0) throw new Error(`capture ${c.id} failed`);
    process.stderr.write(`captured ${c.id}\n`);
  }
  console.log(`${fresh} captured, ${left} left`);
  process.exit(left ? 3 : 0);
} else if (flag("fit") || flag("check")) {
  const t0 = performance.now();
  const all = await loadPairs(), holdName = opt("hold", "");
  const only = opt("only", "");
  const pairs = all.filter((p) => p.name !== holdName && (!only || p.name === only));
  if (holdName && pairs.length === all.length) throw new Error(`no pair ${holdName}`);
  const clips = loadClips(GUARD_STRIDE);
  process.stderr.write(`${all.length} pairs, ${clips.length} clips loaded in ${((performance.now() - t0) / 1000).toFixed(0)} s\n`);
  const given = (file: string): FitLookSet => ({ ...FIT_LOOK_IDENTITY, ...JSON.parse(fs.readFileSync(file, "utf8")).params });
  let P: FitLookSet;
  if (flag("check")) P = opt("set", "") ? given(opt("set", "")) : FIT_LOOK[STYLE];
  else P = search(opt("start", "") ? given(opt("start", "")) : { ...FIT_LOOK_IDENTITY }, pairs, clips, (s) => process.stderr.write(`  ${s}\n`));
  const sets = setsOf(P);
  const res = {
    style: STYLE, lambda: LAMBDA, hold: holdName || null, params: Object.fromEntries(FIT_LOOK_KEYS.map((k) => [k, r4(P[k])])), slope: fitLookSlope(P).map(r4),
    pairs: Object.fromEntries(all.map((p) => { const s = pairExact(p, sets); return [p.name, { before: r4(p.exact0), after: r4(s.d), hueErr: s.hue === null ? null : r4(s.hue), L50: r4(s.stats.L50), refL50: r4(p.refStats.L50), heldOut: p.name === holdName }]; })),
    guard: holdName ? null : guardReport(clips, sets, GUARD_STRIDE),
    seconds: Math.round((performance.now() - t0) / 1000),
  };
  const P2 = Object.values(res.pairs), mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);
  console.log(`${STYLE}${holdName ? ` (held out: ${holdName})` : ""}: ${fmtSet(P)}`);
  for (const [n, p] of Object.entries(res.pairs)) console.log(`  ${n.padEnd(22)} ${p.before.toFixed(2)} -> ${p.after.toFixed(2)}${p.heldOut ? "   (held out)" : ""}`);
  console.log(`  ${"MEAN".padEnd(22)} ${mean(P2.map((p) => p.before)).toFixed(2)} -> ${mean(P2.map((p) => p.after)).toFixed(2)}`);
  if (res.guard) {
    const g = res.guard, { rows: _rows, ...short } = g;
    void _rows;
    console.log(JSON.stringify(short, (_k, v) => (typeof v === "number" ? Math.round(v * 100) / 100 : v), 1));
  }
  if (opt("out", "")) fs.writeFileSync(opt("out", ""), JSON.stringify(res, null, 1) + "\n");
} else if (flag("report")) {
  const dir = opt("report", "");
  const runs = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))).filter((r) => r.style === STYLE);
  const full = runs.find((r) => !r.hold), folds = runs.filter((r) => r.hold);
  if (!full) throw new Error("no full fit in " + dir);
  const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);
  console.log(`${STYLE}: ${JSON.stringify(full.params)}`);
  console.log(`${"pair".padEnd(22)} ${"before".padStart(7)} ${"fitted".padStart(7)} ${"held out".padStart(9)}`);
  const held: number[] = [], heldBefore: number[] = [];
  for (const [n, p] of Object.entries(full.pairs) as [string, { before: number; after: number }][]) {
    const f = folds.find((r) => r.hold === n), h = f ? (f.pairs[n].after as number) : NaN;
    if (f) { held.push(h); heldBefore.push(p.before); }
    console.log(`${n.padEnd(22)} ${p.before.toFixed(2).padStart(7)} ${p.after.toFixed(2).padStart(7)} ${(f ? h.toFixed(2) : "-").padStart(9)}`);
  }
  const P2 = Object.values(full.pairs) as { before: number; after: number }[];
  console.log(`${"MEAN".padEnd(22)} ${mean(P2.map((p) => p.before)).toFixed(2).padStart(7)} ${mean(P2.map((p) => p.after)).toFixed(2).padStart(7)} ${(held.length ? mean(held).toFixed(2) : "-").padStart(9)}`);
  if (held.length) console.log(`leave-one-out over ${held.length} folds: ${mean(heldBefore).toFixed(2)} without the Look -> ${mean(held).toFixed(2)} held out (${held.filter((h, i) => h < heldBefore[i] - 0.05).length} pairs closer, ${held.filter((h, i) => h > heldBefore[i] + 0.05).length} further)`);
  for (const f of folds) console.log(`  fold -${String(f.hold).padEnd(20)} ${FIT_LOOK_KEYS.map((k) => `${k} ${f.params[k]}`).join("  ")}`);
} else if (flag("sheet")) {
  const sharp = require("sharp") as typeof import("sharp");
  const dir = opt("sheet", "");
  fs.mkdirSync(dir, { recursive: true });
  const P: FitLookSet = opt("set", "") ? { ...FIT_LOOK_IDENTITY, ...JSON.parse(fs.readFileSync(opt("set", ""), "utf8")).params } : FIT_LOOK[STYLE];
  const sets = setsOf(P), idy = setsOf(FIT_LOOK_IDENTITY);
  const png = (rgba: Uint8ClampedArray, w: number, h: number) => sharp(Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength), { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  const esc = (x: string) => x.replace(/[<&>]/g, "");
  async function sheet(cells: { name: string; rows: Buffer[] }[], labels: string[], cols: number, CW: number, CH: number, file: string) {
    const PAD = 4, NAME = 16, LAB = 96, rowsN = Math.ceil(cells.length / cols), blockH = NAME + labels.length * (CH + 2) + 8;
    const comp: { input: Buffer; left: number; top: number }[] = [];
    let svg = "";
    for (let i = 0; i < cells.length; i++) {
      const cx = LAB + (i % cols) * (CW + PAD), cy = Math.floor(i / cols) * blockH;
      svg += `<text x="${cx + 2}" y="${cy + 12}" font-size="11" fill="#ddd" font-family="sans-serif">${esc(cells[i].name)}</text>`;
      for (let r = 0; r < cells[i].rows.length; r++) comp.push({ input: await sharp(cells[i].rows[r]).rotate().resize(CW, CH, { fit: "cover" }).png().toBuffer(), left: cx, top: cy + NAME + r * (CH + 2) });
    }
    for (let b = 0; b < rowsN; b++) for (let r = 0; r < labels.length; r++) svg += `<text x="4" y="${b * blockH + NAME + r * (CH + 2) + CH / 2 + 4}" font-size="11" font-weight="bold" fill="#fff" font-family="sans-serif">${esc(labels[r])}</text>`;
    const Wd = LAB + cols * (CW + PAD), Hd = rowsN * blockH;
    comp.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${Wd}" height="${Hd}">${svg}</svg>`), left: 0, top: 0 });
    await sharp({ create: { width: Wd, height: Hd, channels: 3, background: "#111" } }).composite(comp).jpeg({ quality: 90 }).toFile(file);
    console.log(`wrote ${file}`);
  }
  // --rows "label=file.json,label=dir": further rows on the pairs sheet (a directory holds one fit per picture, only-<pair>.json).
  const extra = opt("rows", "").split(",").filter(Boolean).map((kv) => { const [label, file] = kv.split("="); return { label, file }; });
  const setFor = (file: string, pair: string): Sets => setsOf({ ...FIT_LOOK_IDENTITY, ...JSON.parse(fs.readFileSync(fs.statSync(file).isDirectory() ? path.join(file, `only-${pair}.json`) : file, "utf8")).params });
  const pairs = await loadPairs(), pc: { name: string; rows: Buffer[] }[] = [];
  for (const p of pairs) {
    const f = p.frame, b = render(f, idy), a = render(f, sets), fn = fs.readdirSync(path.join(PAIRS, "ref")).find((x) => x.startsWith(p.name + "."))!;
    const ex = extra.map((e) => { const st = setFor(e.file, p.name); return { img: render(f, st), d: pairExact(p, st).d }; });
    pc.push({ name: `${p.name}  ${[p.exact0, pairExact(p, sets).d, ...ex.map((e) => e.d)].map((d) => d.toFixed(1)).join(" / ")}`, rows: [await png(f.src, f.w, f.h), await png(b.rgba, f.w, f.h), await png(a.rgba, f.w, f.h), ...(await Promise.all(ex.map((e) => png(e.img.rgba, f.w, f.h)))), fs.readFileSync(path.join(PAIRS, "ref", fn))] });
  }
  await sheet(pc, ["source", "before", opt("after-label", "after"), ...extra.map((e) => e.label), "reference"], 8, 300, 200, path.join(dir, `sheet-reference-pairs-${STYLE}.jpg`));
  const cc: { name: string; rows: Buffer[] }[] = [];
  for (const c of loadClips(1)) {
    const f = c.frames[Math.min(1, c.frames.length - 1)];
    if (!f) continue;
    const b = render(f, idy), a = render(f, sets), ex = extra.filter((e) => !fs.statSync(e.file).isDirectory()).map((e) => render(f, setFor(e.file, "")));
    cc.push({ name: `${c.id}${f.look < 0.5 ? `  (look ${f.look.toFixed(2)})` : ""}`, rows: [await png(f.src, f.w, f.h), await png(b.rgba, f.w, f.h), await png(a.rgba, f.w, f.h), ...(await Promise.all(ex.map((e) => png(e.rgba, f.w, f.h))))] });
  }
  await sheet(cc, ["source", "before", opt("after-label", "after"), ...extra.filter((e) => !fs.statSync(e.file).isDirectory()).map((e) => e.label)], 8, 224, 126, path.join(dir, `sheet-valset-${STYLE}.jpg`));
} else {
  console.log("usage: see the header of eval/fit-look2.ts");
}
