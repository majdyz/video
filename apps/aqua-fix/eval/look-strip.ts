// Valset strip for a look change: one column per clip, rows source / before / after (default studio style).
//
//   node --experimental-strip-types apps/aqua-fix/eval/look-strip.ts --out strip.jpg [--clips id,id,…] [--at 4]
//        [--before OBJ.field=v,…]   overrides for the "before" row (default WATER_HUE.amount=0: Vivid without the water-hue map)
//        [--resim]                  the "before" row replays the clip with its overrides in force (for a change in the analysis, e.g. RED.litLo=10)
//        [--clips all]              every clip of the valset (after any --first id,id,… clips)   [--cols 8] wraps the strip into rows of clips
//        [--valset <dir>] [--w 320]
//
// Each clip is replayed at preview cadence (clip-sim.ts) up to --at seconds and that frame is graded twice.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as paramsModule from "../src/engine/params.ts";
import * as analyzeModule from "../src/engine/analyze.ts";
import * as redModule from "../src/engine/red.ts";
import { ANALYSIS_H, ANALYSIS_W } from "../src/engine/analyze.ts";
import { applyGrade } from "../src/engine/apply.ts";
import { DEFAULT_SETTINGS, type UserSettings } from "../src/engine/params.ts";
import { ClipSim } from "./clip-sim.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const VALSET = opt("valset", process.env.SCORE_VALSET ?? "/home/majdyz/video-data/valset");
const OUT = opt("out", "strip.jpg"), AT = parseFloat(opt("at", "4")), W = parseInt(opt("w", "320"));
const tunable = (o: string) => (paramsModule as unknown as Record<string, Record<string, number>>)[o] ?? (analyzeModule as unknown as Record<string, Record<string, number>>)[o] ?? (redModule as unknown as Record<string, Record<string, number>>)[o];
const BEFORE = opt("before", "WATER_HUE.amount=0").split(",").filter(Boolean).map((kv) => { const [k, v] = kv.split("="), [o, f] = k.split("."); if (!tunable(o) || !(f in tunable(o))) throw new Error(`--before: no ${k}`); return { o: tunable(o), f, v: parseFloat(v) }; });
const RESIM = args.includes("--resim"), COLS = parseInt(opt("cols", "0"));
const STYLE: UserSettings = { ...DEFAULT_SETTINGS, vivid: 1, blue: 0, seabed: 0.6 };
const require = createRequire(path.resolve(HERE, "../package.json"));
const sharp = require("sharp") as typeof import("sharp");

function decode(file: string, vf: string, w: number, h: number): Uint8ClampedArray[] {
  const r = spawnSync("ffmpeg", ["-v", "error", "-t", String(AT + 0.2), "-i", file, "-vf", vf, "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { maxBuffer: 2 ** 30 });
  const size = w * h * 4, buf = r.stdout as Buffer, out: Uint8ClampedArray[] = [];
  for (let o = 0; o + size <= buf.length; o += size) out.push(new Uint8ClampedArray(buf.buffer, buf.byteOffset + o, size));
  return out;
}
const valset: { id: string; file: string }[] = JSON.parse(fs.readFileSync(path.join(VALSET, "valset.json"), "utf8"));
const FIRST = opt("first", "").split(",").filter(Boolean);
const CLIPS_OPT = opt("clips", "green_cantabrian,green_reservoir_divers,divers_wreck_cabo,reef_redsea_shallow,sand_eagleray,divers_shallow_reef,topside_manta_surface");
const CLIPS = CLIPS_OPT === "all" ? [...FIRST, ...valset.filter((c) => !FIRST.includes(c.id) && fs.existsSync(path.join(VALSET, c.file))).map((c) => c.id)] : CLIPS_OPT.split(",");
const NCOL = COLS > 0 ? Math.min(COLS, CLIPS.length) : CLIPS.length;
const PAD = 4, LABEL = 20, H = Math.round((W * 9) / 16);
const ROWH = LABEL + 3 * (H + LABEL) + 8;
const comp: { input: Buffer; left: number; top: number }[] = [];
let svg = "";
const rows = ["source", "before", "after"];
for (let c = 0; c < CLIPS.length; c++) {
  const clip = valset.find((x) => x.id === CLIPS[c]);
  if (!clip) throw new Error(`no clip ${CLIPS[c]}`);
  const file = path.join(VALSET, clip.file);
  const st = JSON.parse(spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate", "-of", "json", file], { encoding: "utf8" }).stdout).streams[0];
  const [fa, fb] = String(st.r_frame_rate).split("/").map(Number), fps = fa / (fb || 1);
  const GH = Math.round((W * st.height) / st.width / 2) * 2;
  const COLOR = "in_color_matrix=bt709:in_range=tv:out_range=pc";
  const thumbs = decode(file, `scale=${ANALYSIS_W}:${ANALYSIS_H}:flags=area:${COLOR},format=rgba`, ANALYSIS_W, ANALYSIS_H);
  const last = thumbs.length - 1;
  const full = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-vf", `select=eq(n\\,${last}),scale=${W}:${GH}:flags=area:${COLOR},format=rgba`, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { maxBuffer: 2 ** 28 }).stdout as Buffer;
  const img = new Uint8ClampedArray(full.buffer, full.byteOffset, W * GH * 4);
  const replay = () => {
    const sim = new ClipSim("preview", fps, 1);
    sim.profile(thumbs);
    for (let f = 0; f <= last; f++) sim.step(f, thumbs);
    return sim.state();
  };
  const x = replay();
  const grade = (y: typeof x) => applyGrade({ params: y.params, settings: STYLE, depth: y.depth, clahe: y.clahe }, img, W, GH);
  const after = grade(x);
  const saved = BEFORE.map((b) => b.o[b.f]);
  BEFORE.forEach((b) => (b.o[b.f] = b.v));
  const before = grade(RESIM ? replay() : x);
  BEFORE.forEach((b, i) => (b.o[b.f] = saved[i]));
  const cells = [img, before, after];
  const cx = (c % NCOL) * (W + PAD), cy = Math.floor(c / NCOL) * ROWH;
  for (let r = 0; r < 3; r++) comp.push({ input: await sharp(Buffer.from(cells[r].buffer, cells[r].byteOffset, cells[r].byteLength), { raw: { width: W, height: GH, channels: 4 } }).resize(W, H, { fit: "cover" }).jpeg({ quality: 92 }).toBuffer(), left: cx, top: cy + LABEL + r * (H + LABEL) + LABEL });
  svg += `<text x="${cx + 4}" y="${cy + 14}" font-size="13" fill="#ddd" font-family="sans-serif">${clip.id}</text>`;
  process.stderr.write(`${clip.id} done\n`);
}
const NROW = Math.ceil(CLIPS.length / NCOL);
const Wd = NCOL * (W + PAD), Hd = NROW * ROWH;
for (let k = 0; k < NROW; k++) for (let r = 0; r < 3; r++) svg += `<text x="4" y="${k * ROWH + LABEL + r * (H + LABEL) + 16}" font-size="14" font-weight="bold" fill="#fff" font-family="sans-serif">${rows[r]}</text>`;
comp.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${Wd}" height="${Hd}">${svg}</svg>`), left: 0, top: 0 });
await sharp({ create: { width: Wd, height: Hd, channels: 3, background: "#111" } }).composite(comp).jpeg({ quality: 88 }).toFile(OUT);
console.log(OUT);
