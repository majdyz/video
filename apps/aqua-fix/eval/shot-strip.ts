// Strip over time for a stability change: per clip, one frame per --every seconds across the shot, rows
// source / [before] / after (default studio style, clip replayed at preview cadence, clip-sim.ts).
//
//   node --experimental-strip-types apps/aqua-fix/eval/shot-strip.ts --out strip.jpg [--clips id,id,…] [--secs 8] [--every 1]
//        [--save <dir>]     writes this run's graded frames there (<clip>-<k>.png)
//        [--before <dir>]   a --save directory of an earlier run (another commit): shown as the "before" row
//        [--mode preview|export] [--valset <dir>] [--w 200]
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { ANALYSIS_H, ANALYSIS_W } from "../src/engine/analyze.ts";
import { applyGrade } from "../src/engine/apply.ts";
import { DEFAULT_SETTINGS, type UserSettings } from "../src/engine/params.ts";
import { ClipSim, type SimMode } from "./clip-sim.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const VALSET = opt("valset", process.env.SCORE_VALSET ?? "/home/majdyz/video-data/valset");
const OUT = opt("out", "strip.jpg"), SECS = parseFloat(opt("secs", "8")), EVERY = parseFloat(opt("every", "1")), W = parseInt(opt("w", "200"));
const SAVE = opt("save", ""), BEFORE = opt("before", ""), MODE = opt("mode", "preview") as SimMode;
const CLIPS = opt("clips", "blue_whaleshark,green_reservoir_divers,tilt_reef_to_blue_barracuda,user_drift").split(",");
const STYLE: UserSettings = { ...DEFAULT_SETTINGS, vivid: 1, blue: 0, seabed: 0.6 };
const require = createRequire(path.resolve(HERE, "../package.json"));
const sharp = require("sharp") as typeof import("sharp");

function decode(file: string, vf: string, w: number, h: number): Uint8ClampedArray[] {
  const r = spawnSync("ffmpeg", ["-v", "error", "-t", String(SECS), "-i", file, "-vf", vf, "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { maxBuffer: 2 ** 30 });
  const size = w * h * 4, buf = r.stdout as Buffer, out: Uint8ClampedArray[] = [];
  for (let o = 0; o + size <= buf.length; o += size) out.push(new Uint8ClampedArray(buf.buffer, buf.byteOffset + o, size));
  return out;
}
const valset: { id: string; file: string }[] = JSON.parse(fs.readFileSync(path.join(VALSET, "valset.json"), "utf8"));
const PAD = 3, LABEL = 20, NAME = 22, H = Math.round((W * 9) / 16);
const rows = BEFORE ? ["source", "before", "after"] : ["source", "graded"];
const GROUP = NAME + rows.length * (H + PAD) + 10;
const comp: { input: Buffer; left: number; top: number }[] = [];
let svg = "", cols = 0;
if (SAVE) fs.mkdirSync(SAVE, { recursive: true });
for (let c = 0; c < CLIPS.length; c++) {
  const clip = valset.find((x) => x.id === CLIPS[c]);
  if (!clip) throw new Error(`no clip ${CLIPS[c]}`);
  const file = path.join(VALSET, clip.file);
  const st = JSON.parse(spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate", "-of", "json", file], { encoding: "utf8" }).stdout).streams[0];
  const [fa, fb] = String(st.r_frame_rate).split("/").map(Number), fps = fa / (fb || 1);
  const GH = Math.round((W * st.height) / st.width / 2) * 2;
  const COLOR = "in_color_matrix=bt709:in_range=tv:out_range=pc";
  const thumbs = decode(file, `scale=${ANALYSIS_W}:${ANALYSIS_H}:flags=area:${COLOR},format=rgba`, ANALYSIS_W, ANALYSIS_H);
  const fulls = decode(file, `fps=1/${EVERY},scale=${W}:${GH}:flags=area:${COLOR},format=rgba`, W, GH);
  const step = Math.max(1, Math.round(EVERY * fps));
  const sim = new ClipSim(MODE, fps, 1);
  sim.profile(thumbs);
  const top = c * GROUP;
  svg += `<text x="${LABEL + 4}" y="${top + 16}" font-size="14" font-weight="bold" fill="#fff" font-family="sans-serif">${clip.id}</text>`;
  rows.forEach((r, i) => (svg += `<text transform="translate(14 ${top + NAME + i * (H + PAD) + H / 2}) rotate(-90)" text-anchor="middle" font-size="12" fill="#ccc" font-family="sans-serif">${r}</text>`));
  const jpg = (b: Buffer | Uint8ClampedArray, raw: boolean) => (raw ? sharp(Buffer.from((b as Uint8ClampedArray).buffer, b.byteOffset, b.byteLength), { raw: { width: W, height: GH, channels: 4 } }) : sharp(b as Buffer)).resize(W, H, { fit: "cover" }).jpeg({ quality: 92 }).toBuffer();
  for (let f = 0, k = 0; f < thumbs.length; f++) {
    sim.step(f, thumbs);
    if (f % step) continue;
    const img = fulls[Math.round(f / step)];
    if (!img) continue;
    const x = sim.state();
    const g = applyGrade({ params: x.params, settings: STYLE, depth: x.depth, clahe: x.clahe }, img, W, GH);
    if (SAVE) await sharp(Buffer.from(g.buffer, g.byteOffset, g.byteLength), { raw: { width: W, height: GH, channels: 4 } }).png().toFile(path.join(SAVE, `${clip.id}-${k}.png`));
    const left = LABEL + k * (W + PAD);
    const cells: (Buffer | null)[] = [await jpg(img, true)];
    if (BEFORE) { const b = path.join(BEFORE, `${clip.id}-${k}.png`); cells.push(fs.existsSync(b) ? await jpg(fs.readFileSync(b), false) : null); }
    cells.push(await jpg(g, true));
    cells.forEach((b, i) => { if (b) comp.push({ input: b, left, top: top + NAME + i * (H + PAD) }); });
    svg += `<text x="${left + 4}" y="${top + NAME + 13}" font-size="11" fill="#fff" font-family="sans-serif">${(f / fps).toFixed(0)} s</text>`;
    cols = Math.max(cols, ++k);
  }
  process.stderr.write(`${clip.id} done\n`);
}
const Wd = LABEL + cols * (W + PAD), Hd = CLIPS.length * GROUP;
comp.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${Wd}" height="${Hd}">${svg}</svg>`), left: 0, top: 0 });
await sharp({ create: { width: Wd, height: Hd, channels: 3, background: "#111" } }).composite(comp).jpeg({ quality: 88 }).toFile(OUT);
console.log(OUT);
