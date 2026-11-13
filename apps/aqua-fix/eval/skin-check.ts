// Skin on the freediver reference pairs and on the owner's clip: hue and chroma of hand-marked skin regions in the
// source, the engine's output (per style, with and without a person mask) and, for the pairs, the owner's reference.
//
//   node --experimental-strip-types apps/aqua-fix/eval/skin-check.ts [--pairs <dir>] [--clip <file>] [--out <dir>] [--tune OBJ.field=v,…]
//
// The CPU harness has no person segmentation (the app's MediaPipe mask), so the mask is given by hand here: a box
// around the diver (what the selfie segmenter would mark, roughly), and inside it small boxes that hold only skin
// and only gear (fins, suit, swimsuit). Regions are fractions of the picture; the reference is a different crop, so
// it has its own boxes. Reported per region: median Oklab L, chroma C and hue h°, and the CIELAB hue hab° and C*
// (the "LCh" hue: natural skin sits at about 30–60°).
//
// The owner's clip (default ~/video-data/user-clips/freediver-line-skinred.mov, "the skin becomes red when using
// our app") is replayed at preview cadence (clip-sim.ts) and measured the same way at its marked frames. It has no
// reference: skin should read natural, neither cold blue-grey nor red.
//
// Also a leak test on every picture: the same grade with the person mask set over the WHOLE frame (a segmenter
// that marks everything). Reported: the share of the source's water-coloured pixels that come out warm, and the
// mean (a*, b*) move of the picture against the mask-less grade: what a wrong mask can cost.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as paramsModule from "../src/engine/params.ts";
import * as lookFitModule from "../src/engine/look-fit.ts";
import { analyzeThumbnail, ANALYSIS_H, ANALYSIS_W } from "../src/engine/analyze.ts";
import { applyGrade } from "../src/engine/apply.ts";
import { linearToOklab, srgbToLinear } from "../src/engine/color.ts";
import { DEFAULT_SETTINGS, type ClaheLuts, type DepthMap, type GradeParams, type UserSettings } from "../src/engine/params.ts";
import { ClipSim } from "./clip-sim.ts";
import { srgb8ToLab } from "./colour-metrics.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const PAIRS = opt("pairs", process.env.SCORE_PAIRS ?? "/home/majdyz/video-data/review-fable/colour/pairs");
const CLIP = opt("clip", "/home/majdyz/video-data/user-clips/freediver-line-skinred.mov");
const OUT = opt("out", "");
const require = createRequire(path.resolve(HERE, "../package.json"));
for (const kv of opt("tune", "").split(",").filter(Boolean)) {
  const [key, val] = kv.split("="), [obj, field] = key.split(".");
  const o = (paramsModule as unknown as Record<string, Record<string, unknown>>)[obj] ?? (lookFitModule as unknown as Record<string, Record<string, unknown>>)[obj];
  if (!o || !(field in o)) throw new Error(`--tune: no ${key}`);
  o[field] = parseFloat(val);
}
const STYLES: Record<string, UserSettings> = {
  vivid: { ...DEFAULT_SETTINGS, vivid: 1, blue: 0, seabed: 0.6 },
  blue: { ...DEFAULT_SETTINGS, vivid: 1, blue: 1, seabed: 0.6 },
};
type Box = [number, number, number, number]; // x0, y0, x1, y1 (fractions)
type Marks = { person: Box; skin: Record<string, { src: Box; ref?: Box }>; gear: Record<string, Box> };
export const SKIN_MARKS: Record<string, Marks> = {
  u1_freediver_cyan: {
    person: [0.36, 0.33, 1.0, 0.585],
    skin: { legs: { src: [0.66, 0.51, 0.74, 0.53], ref: [0.66, 0.508, 0.74, 0.522] }, arm: { src: [0.415, 0.44, 0.435, 0.468], ref: [0.36, 0.436, 0.4, 0.454] } },
    gear: { "blue fins": [0.86, 0.53, 0.94, 0.56], "black suit": [0.5, 0.4, 0.56, 0.46] },
  },
  u3_freediver_green: {
    person: [0.32, 0.4, 1.0, 0.6],
    skin: { hand: { src: [0.56, 0.53, 0.59, 0.55], ref: [0.555, 0.537, 0.585, 0.555] } },
    gear: { "white fins": [0.8, 0.415, 0.9, 0.435], "black suit": [0.62, 0.49, 0.72, 0.53] },
  },
  h2: {
    person: [0.05, 0.43, 0.95, 0.78],
    skin: { shoulder: { src: [0.525, 0.545, 0.575, 0.558], ref: [0.525, 0.545, 0.575, 0.558] }, chest: { src: [0.455, 0.55, 0.49, 0.568], ref: [0.455, 0.55, 0.49, 0.568] } },
    gear: { "blue swimsuit": [0.44, 0.6, 0.5, 0.63], "white mask": [0.46, 0.452, 0.52, 0.462] },
  },
};
/** The owner's clip: frames (s) with their marks. */
export const CLIP_MARKS: Record<string, Marks> = {
  "20": { person: [0.33, 0.27, 0.6, 0.68], skin: { "hand at the face": { src: [0.535, 0.3, 0.555, 0.32] }, foot: { src: [0.39, 0.63, 0.41, 0.655] } }, gear: { "black suit": [0.42, 0.38, 0.5, 0.44] } },
  "25": { person: [0.31, 0.27, 0.55, 0.8], skin: { hands: { src: [0.41, 0.29, 0.46, 0.34] } }, gear: { "black suit": [0.4, 0.56, 0.48, 0.62] } },
};

type Stat = { L: number; C: number; h: number; hab: number; Cab: number };
const med = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s[s.length >> 1]; };
function stat(img: Uint8ClampedArray | Buffer, w: number, h: number, b: Box): Stat {
  const Ls: number[] = [], as: number[] = [], bs: number[] = [], la: number[] = [], lb: number[] = [];
  for (let y = Math.floor(b[1] * h); y < Math.ceil(b[3] * h); y++) for (let x = Math.floor(b[0] * w); x < Math.ceil(b[2] * w); x++) {
    const i = (y * w + x) * 4, o = linearToOklab(srgbToLinear(img[i] / 255), srgbToLinear(img[i + 1] / 255), srgbToLinear(img[i + 2] / 255)), c = srgb8ToLab(img[i], img[i + 1], img[i + 2]);
    Ls.push(o[0]); as.push(o[1]); bs.push(o[2]); la.push(c[1]); lb.push(c[2]);
  }
  const a = med(as), bb = med(bs), deg = (y: number, x: number) => ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return { L: med(Ls), C: Math.hypot(a, bb), h: deg(bb, a), hab: deg(med(lb), med(la)), Cab: Math.hypot(med(la), med(lb)) };
}
const fmt = (s: Stat) => `L ${s.L.toFixed(2)}  C ${s.C.toFixed(3)}  h ${s.h.toFixed(0).padStart(3)}°  | LCh hue ${s.hab.toFixed(0).padStart(3)}°  C* ${s.Cab.toFixed(1).padStart(4)}`;

const sharp = require("sharp") as typeof import("sharp");
const PX = 480;
const result: Record<string, unknown> = {};
type Est = { params: GradeParams; depth: DepthMap; clahe: ClaheLuts };
async function evaluate(name: string, marks: Marks, img: Uint8ClampedArray, W: number, H: number, a: Est, rb: { data: Buffer; info: { width: number; height: number } } | null): Promise<void> {
  const mask = (b: Box | null) => { const d = a.depth, p = new Float32Array(d.width * d.height); for (let y = 0; y < d.height; y++) for (let x = 0; x < d.width; x++) { const u = (x + 0.5) / d.width, v = (y + 0.5) / d.height; p[y * d.width + x] = !b || (u >= b[0] && u <= b[2] && v >= b[1] && v <= b[3]) ? 1 : 0; } return p; };
  const grade = (style: string, person: Float32Array | null) => applyGrade({ params: a.params, settings: STYLES[style], depth: person ? { ...a.depth, person } : a.depth, clahe: a.clahe }, img, W, H);
  console.log(`\n${name}`);
  const rows: Record<string, unknown> = {};
  const outs: Record<string, Uint8ClampedArray> = {};
  for (const style of Object.keys(STYLES)) { outs[`${style}, no mask`] = grade(style, null); outs[`${style}, person mask`] = grade(style, mask(marks.person)); }
  for (const [region, b] of Object.entries(marks.skin)) {
    console.log(`  skin: ${region}`);
    const r: Record<string, Stat> = { source: stat(img, W, H, b.src) };
    for (const [label, o] of Object.entries(outs)) r[label] = stat(o, W, H, b.src);
    if (rb && b.ref) r.reference = stat(rb.data, rb.info.width, rb.info.height, b.ref);
    for (const [label, s] of Object.entries(r)) console.log(`    ${label.padEnd(20)} ${fmt(s)}`);
    rows[`skin ${region}`] = r;
  }
  for (const [region, b] of Object.entries(marks.gear)) {
    console.log(`  gear: ${region}`);
    const r: Record<string, Stat> = {};
    for (const [label, o] of Object.entries(outs)) r[label] = stat(o, W, H, b);
    for (const [label, s] of Object.entries(r)) console.log(`    ${label.padEnd(20)} ${fmt(s)}`);
    rows[`gear ${region}`] = r;
  }
  // Leak test: the mask over the whole frame.
  for (const style of Object.keys(STYLES)) {
    const base = outs[`${style}, no mask`], all = grade(style, mask(null));
    let water = 0, warm = 0, warm0 = 0, move = 0;
    const isWarm = (c: number[]) => { const co = Math.hypot(c[1], c[2]), ho = ((Math.atan2(c[2], c[1]) * 180) / Math.PI + 360) % 360; return co >= 8 && (ho < 150 || ho > 310); };
    for (let i = 0; i < W * H; i++) {
      const s = srgb8ToLab(img[i * 4], img[i * 4 + 1], img[i * 4 + 2]), o = srgb8ToLab(all[i * 4], all[i * 4 + 1], all[i * 4 + 2]), b0 = srgb8ToLab(base[i * 4], base[i * 4 + 1], base[i * 4 + 2]);
      move += Math.hypot(o[1] - b0[1], o[2] - b0[2]);
      const cs = Math.hypot(s[1], s[2]), hs = ((Math.atan2(s[2], s[1]) * 180) / Math.PI + 360) % 360;
      if (cs > 14 && hs > 170 && hs < 300) { water++; if (isWarm(o)) warm++; if (isWarm(b0)) warm0++; }
    }
    console.log(`  leak (${style}, mask over the whole frame): water turned warm ${((100 * warm0) / Math.max(1, water)).toFixed(2)} % -> ${((100 * warm) / Math.max(1, water)).toFixed(2)} %, mean (a*, b*) move ${(move / (W * H)).toFixed(2)}`);
    rows[`leak ${style}`] = { waterWarmBase: (100 * warm0) / Math.max(1, water), waterWarm: (100 * warm) / Math.max(1, water), move: move / (W * H) };
  }
  result[name] = rows;
  if (OUT) {
    fs.mkdirSync(OUT, { recursive: true });
    // Crop of the diver: source / each output / reference (its own crop of the person box), side by side.
    const b = marks.person, cw = Math.floor((b[2] - b[0]) * W), ch = Math.floor((b[3] - b[1]) * H);
    const crop = (o: Uint8ClampedArray | Buffer, w: number, h: number) => sharp(Buffer.from(o.buffer, o.byteOffset, o.byteLength), { raw: { width: w, height: h, channels: 4 } }).extract({ left: Math.floor(b[0] * w), top: Math.floor(b[1] * h), width: Math.floor((b[2] - b[0]) * w), height: Math.floor((b[3] - b[1]) * h) }).resize(cw * 2, ch * 2, { fit: "fill" }).png().toBuffer();
    const cells: [string, Buffer][] = [["source", await crop(img, W, H)]];
    for (const [label, o] of Object.entries(outs)) cells.push([label, await crop(o, W, H)]);
    if (rb) cells.push(["reference", await crop(rb.data, rb.info.width, rb.info.height)]);
    const comp = cells.map(([, buf], i) => ({ input: buf, left: i * (cw * 2 + 4), top: 18 }));
    const svg = cells.map(([label], i) => `<text x="${i * (cw * 2 + 4) + 4}" y="13" font-size="12" fill="#fff" font-family="sans-serif">${label}</text>`).join("");
    const Wd = cells.length * (cw * 2 + 4), Hd = ch * 2 + 18;
    comp.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${Wd}" height="${Hd}">${svg}</svg>`), left: 0, top: 0 });
    await sharp({ create: { width: Wd, height: Hd, channels: 3, background: "#111" } }).composite(comp).jpeg({ quality: 90 }).toFile(path.join(OUT, `skin-${name}.jpg`));
  }
}

for (const [name, marks] of Object.entries(SKIN_MARKS)) {
  const fn = fs.readdirSync(path.join(PAIRS, "src")).find((f) => f.startsWith(name + "."))!;
  const meta = await sharp(path.join(PAIRS, "src", fn)).rotate().toBuffer({ resolveWithObject: true });
  const k = PX / Math.max(meta.info.width, meta.info.height), W = Math.round(meta.info.width * k), H = Math.round(meta.info.height * k);
  const img = new Uint8ClampedArray((await sharp(meta.data).resize(W, H, { fit: "fill" }).ensureAlpha().raw().toBuffer()).buffer);
  const tb = await sharp(meta.data).resize(ANALYSIS_W, ANALYSIS_H, { fit: "fill" }).ensureAlpha().raw().toBuffer();
  const a = analyzeThumbnail(new Uint8ClampedArray(tb.buffer, tb.byteOffset, tb.byteLength), ANALYSIS_W, ANALYSIS_H);
  const rb = await sharp(path.join(PAIRS, "ref", fn)).rotate().resize(PX, PX, { fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  await evaluate(name, marks, img, W, H, a, rb);
}
// The owner's clip, replayed at preview cadence up to each marked frame.
if (fs.existsSync(CLIP)) {
  const st = JSON.parse(spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate", "-of", "json", CLIP], { encoding: "utf8" }).stdout).streams[0];
  const [fa, fb] = String(st.r_frame_rate).split("/").map(Number), fps = fa / (fb || 1);
  const times = Object.keys(CLIP_MARKS).map(Number).sort((x, y) => x - y), last = times[times.length - 1];
  const k = PX / Math.max(st.width, st.height), W = Math.round((st.width * k) / 2) * 2, H = Math.round((st.height * k) / 2) * 2;
  const COLOR = "in_color_matrix=bt709:in_range=tv:out_range=pc";
  const raw = (pre: string[], vf: string, w: number, h: number) => {
    const r = spawnSync("ffmpeg", ["-v", "error", ...pre, "-i", CLIP, "-vf", vf, "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { maxBuffer: 2 ** 30 });
    const size = w * h * 4, buf = r.stdout as Buffer, o: Uint8ClampedArray[] = [];
    for (let off = 0; off + size <= buf.length; off += size) o.push(new Uint8ClampedArray(buf.buffer, buf.byteOffset + off, size));
    return o;
  };
  const thumbs = raw(["-t", String(last + 0.2)], `scale=${ANALYSIS_W}:${ANALYSIS_H}:flags=area:${COLOR},format=rgba`, ANALYSIS_W, ANALYSIS_H);
  const sim = new ClipSim("preview", fps, 1);
  sim.profile(thumbs);
  for (let f = 0; f < thumbs.length; f++) {
    sim.step(f, thumbs);
    const t = times.find((x) => Math.round(x * fps) === f);
    if (t === undefined) continue;
    const x = sim.state();
    const full = raw(["-ss", String(t), "-t", "0.02"], `scale=${W}:${H}:flags=area:${COLOR},format=rgba`, W, H)[0];
    if (full) await evaluate(`clip-${path.basename(CLIP).replace(/\.[^.]+$/, "")}-${t}s`, CLIP_MARKS[String(t)], full, W, H, { params: x.params, depth: x.depth, clahe: x.clahe }, null);
  }
}
if (OUT) fs.writeFileSync(path.join(OUT, "skin.json"), JSON.stringify(result, null, 1) + "\n");
