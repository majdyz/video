// The manual override pair, measured on the CPU reference (apply.ts, tap.ts) over valset clips.
//
//   node --experimental-strip-types apps/aqua-fix/eval/eyedropper.ts [--valset <dir>] [--only id,id] [--at 2] [--gw 480]
//        [--board out.jpg] [--json out.json] [--style vivid|natural|blue]
//
// Each clip is replayed to `--at` seconds at preview cadence (clip-sim.ts: profile, lock, easing), so the tap is
// solved against the grade the app would show at that frame.
//
//  1. Tap-to-neutral on real neutrals: a hand-picked point per clip that should be white or grey (sand, bubbles).
//     The tap samples the source there (tap.ts tapSample: 9×9 median), solves the balance offset (solveTap) and the
//     whole frame is graded again with it. Reported: chroma of the tapped patch and of the 3×-wider region around
//     it in the graded picture, auto vs tap (CIELAB C*ab of the region's mean colour; neutral = 0), the gains, and
//     whether the tap was soft-limited (the guards held: dead red, gain limits).
//  2. Tap on a synthetic grey card: a flat 45 % grey card under the frame's own cast (its colour = grey × the
//     frame's white-patch illuminant: the 90th percentile of each linear channel, independent of the engine's
//     estimate) is pasted into the clip (every analysis thumbnail and the graded frame, so the lock and the maps
//     see it as part of the scene), tapped, and measured the same way. Twice: with half the frame's cast (in log:
//     a card near the camera, in front of water that is bluer than it) and with all of it (the stress case: in
//     open blue water the card then has next to no red, and the tap must stand down rather than amplify it).
//  3. Untouched: no tap + Water colour 0 must render byte-identical to settings without the two fields
//     (the score.ts metrics then cannot move; run score.ts for the full comparison against its baseline).
//  4. Water colour −1 / +1 against 0: the median CIELAB hue of the water pixels, and the mean CIEDE2000 move of the
//     water pixels vs the warm / subject pixels (skin, sand in sunlight, fish, coral: they should move little).
//
// --board writes one row per clip: source | auto | tap (the point marked) | water −1 | water +1.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { ANALYSIS_H, ANALYSIS_W } from "../src/engine/analyze.ts";
import { applyGrade, type ApplyContext } from "../src/engine/apply.ts";
import { linearToSrgb, srgbToLinear } from "../src/engine/color.ts";
import { DEFAULT_SETTINGS, type UserSettings } from "../src/engine/params.ts";
import { solveTap, tapRect, tapSample, type TapSolve } from "../src/engine/tap.ts";
import { ClipSim } from "./clip-sim.ts";
import { deltaE00, srgb8ToLab } from "./colour-metrics.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const VALSET = opt("valset", process.env.SCORE_VALSET ?? "/home/majdyz/video-data/valset");
const ONLY = opt("only", "") ? new Set(opt("only", "").split(",")) : null;
const AT = parseFloat(opt("at", "2"));
const GW = parseInt(opt("gw", "480"));
const BOARD = opt("board", "");
const JSON_OUT = opt("json", "");
// The studio's colourSettings() per style (score.ts STYLES).
const STYLES: Record<string, UserSettings> = {
  natural: { ...DEFAULT_SETTINGS, vivid: 0, blue: 0, seabed: 0 },
  vivid: { ...DEFAULT_SETTINGS, vivid: 1, blue: 0, seabed: 0.6 },
  blue: { ...DEFAULT_SETTINGS, vivid: 1, blue: 1, seabed: 0.6 },
};
const STYLE = opt("style", "vivid");
const BASE = STYLES[STYLE];
if (!BASE) throw new Error(`--style: ${STYLE}`);

/** Real neutrals: a point (upright uv at --at seconds) that should be white or grey. */
const REAL: { id: string; u: number; v: number; what: string }[] = [
  { id: "sand_eagleray", u: 0.15, v: 0.75, what: "white sand under a blue cast" },
  { id: "divers_sharks_sand", u: 0.1, v: 0.85, what: "white sand" },
  { id: "divers_sharks_sand", u: 0.42, v: 0.1, what: "bubbles" },
  { id: "blue_greyreef_shark", u: 0.3, v: 0.9, what: "sand, deep" },
  { id: "user_drift", u: 0.5, v: 0.75, what: "pale sand" },
  { id: "divers_navy_blue", u: 0.57, v: 0.62, what: "bubble stream in open blue (mostly water between the bubbles)" },
  { id: "tilt_sand_to_open_garajau", u: 0.2, v: 0.3, what: "gravel under a heavy cyan cast (red nearly gone)" },
  { id: "sand_flounder", u: 0.5, v: 0.3, what: "grey-beige sand" },
];
/** Synthetic grey card clips (one per kind of water). */
const CARD_CLIPS = ["blue_thresher", "blue_whaleshark", "reef_bannerfish", "reef_redsea_shallow", "divers_shallow_reef", "school_sardines", "tilt_reef_to_blue_barracuda", "cave_cenote_sunlit", "green_cantabrian", "green_combjelly", "school_seabass_green", "green_blacksea"];
const CARD = { u: 0.5, v: 0.8, w: 0.1, h: 0.12, grey: 0.45 };
/** Board rows (clip, which tap). */
const BOARD_ROWS = ["sand_eagleray", "blue_greyreef_shark", "user_drift", "divers_navy_blue"];

const require = createRequire(path.resolve(HERE, "../package.json"));
const COLOR = "in_color_matrix=bt709:in_range=tv:out_range=pc";

function decode(file: string, vf: string, w: number, h: number, extra: string[] = []): Uint8ClampedArray[] {
  const r = spawnSync("ffmpeg", ["-v", "error", ...extra, "-i", file, "-vf", vf, "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { maxBuffer: 2 ** 30 });
  const size = w * h * 4, buf = r.stdout as Buffer, out: Uint8ClampedArray[] = [];
  for (let o = 0; o + size <= buf.length; o += size) out.push(new Uint8ClampedArray(buf.buffer.slice(buf.byteOffset + o, buf.byteOffset + o + size)));
  return out;
}

type Frame = { id: string; thumbs: Uint8ClampedArray[]; full: Uint8ClampedArray; w: number; h: number; fps: number; f: number };
function load(id: string): Frame | null {
  const c = (JSON.parse(fs.readFileSync(path.join(VALSET, "valset.json"), "utf8")) as { id: string; file: string }[]).find((x) => x.id === id);
  if (!c) return null;
  const file = path.join(VALSET, c.file);
  if (!fs.existsSync(file)) return null;
  const st = JSON.parse(spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate", "-of", "json", file], { encoding: "utf8" }).stdout).streams[0];
  const [fa, fb] = String(st.r_frame_rate).split("/").map(Number), fps = fa / (fb || 1);
  const w = GW, h = Math.round((GW * st.height) / st.width / 2) * 2;
  const f = Math.round(AT * fps);
  const thumbs = decode(file, `scale=${ANALYSIS_W}:${ANALYSIS_H}:flags=area:${COLOR},format=rgba`, ANALYSIS_W, ANALYSIS_H, ["-t", String(AT + 2)]);
  const full = decode(file, `select='eq(n\\,${f})',scale=${w}:${h}:flags=area:${COLOR},format=rgba`, w, h, ["-t", String(AT + 1)])[0];
  if (!full || thumbs.length <= f) return null;
  return { id, thumbs, full, w, h, fps, f };
}

/** The grade's state at the frame, as the app would hold it there. */
function stateAt(fr: Frame): Omit<ApplyContext, "settings"> {
  const sim = new ClipSim("preview", fr.fps, 1);
  sim.profile(fr.thumbs);
  for (let f = 0; f <= fr.f; f++) sim.step(f, fr.thumbs);
  const x = sim.state();
  return { params: x.params, depth: x.depth, clahe: x.clahe };
}

/** Pastes the grey card under the frame's cast into an RGBA image (any size). Returns its sRGB colour. */
function cardColour(full: Uint8ClampedArray, cast: number): [number, number, number] {
  const n = full.length / 4;
  const p90 = [0, 1, 2].map((c) => { const v = new Float64Array(n); for (let i = 0; i < n; i++) v[i] = srgbToLinear(full[i * 4 + c] / 255); v.sort(); return v[Math.floor(0.9 * (n - 1))]; });
  // Illuminant chromaticity (green = 1), on a grey of CARD.grey reflectance at the frame's bright level.
  const lvl = CARD.grey * Math.max(0.25, Math.min(1, p90[1] / 0.6));
  return [0, 1, 2].map((c) => Math.round(255 * linearToSrgb(Math.min(1, lvl * Math.pow(Math.max(1e-4, p90[c]) / Math.max(1e-4, p90[1]), cast))))) as [number, number, number];
}
function paste(img: Uint8ClampedArray, w: number, h: number, col: readonly number[]): void {
  const x0 = Math.round((CARD.u - CARD.w / 2) * w), x1 = Math.round((CARD.u + CARD.w / 2) * w), y0 = Math.round((CARD.v - CARD.h / 2) * h), y1 = Math.round((CARD.v + CARD.h / 2) * h);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * w + x) * 4; img[i] = col[0]; img[i + 1] = col[1]; img[i + 2] = col[2]; }
}

/** CIELAB chroma of the mean colour (linear light) of a pixel block. */
function blockChroma(img: Uint8ClampedArray, w: number, h: number, u: number, v: number, half: number): number {
  const cx = Math.round(u * w - 0.5), cy = Math.round(v * h - 0.5);
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = Math.max(0, cy - half); y <= Math.min(h - 1, cy + half); y++) for (let x = Math.max(0, cx - half); x <= Math.min(w - 1, cx + half); x++) {
    const i = (y * w + x) * 4;
    r += srgbToLinear(img[i] / 255); g += srgbToLinear(img[i + 1] / 255); b += srgbToLinear(img[i + 2] / 255); n++;
  }
  const lab = srgb8ToLab(255 * linearToSrgb(r / n), 255 * linearToSrgb(g / n), 255 * linearToSrgb(b / n));
  return Math.hypot(lab[1], lab[2]);
}

function sampleAt(full: Uint8ClampedArray, w: number, h: number, u: number, v: number): [number, number, number] {
  const r = tapRect(u, v, w, h);
  const x0 = Math.round(r.x * w), y0 = Math.round(r.y * h), pw = Math.max(1, Math.round(r.w * w)), ph = Math.max(1, Math.round(r.h * h));
  const px = new Uint8ClampedArray(pw * ph * 4);
  for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) px.set(full.subarray(((y0 + y) * w + x0 + x) * 4, ((y0 + y) * w + x0 + x) * 4 + 4), (y * pw + x) * 4);
  return tapSample(px);
}

type Kind = "real" | "card" | "card-full";
type TapRow = { id: string; what: string; kind: Kind; u: number; v: number; src: number; autoPatch: number; tapPatch: number; autoRegion: number; tapRegion: number; gains: [number, number] | null; limited: boolean; solve: TapSolve; frameDE: number };
type HueRow = { id: string; hue: { minus: number | null; zero: number | null; plus: number | null }; water: { minus: number; plus: number }; subject: { minus: number; plus: number }; waterShare: number };

const sharp = BOARD ? (require("sharp") as typeof import("sharp")) : null;
const cells: { name: string; rows: Buffer[] }[] = [];
const taps: TapRow[] = [];
const hues: HueRow[] = [];
let identical = true, identicalN = 0;

function measureTap(fr: Frame, st: Omit<ApplyContext, "settings">, auto: Uint8ClampedArray, u: number, v: number, what: string, kind: Kind): { row: TapRow; tapped: Uint8ClampedArray; settings: UserSettings } {
  const rgb = sampleAt(fr.full, fr.w, fr.h, u, v);
  const solve = solveTap({ ...st, settings: BASE }, rgb, u, v);
  const settings: UserSettings = solve.ok ? { ...BASE, wbTap: solve.gains } : BASE;
  const tapped = solve.ok ? applyGrade({ ...st, settings }, fr.full, fr.w, fr.h) : auto;
  let de = 0;
  for (let i = 0; i < fr.w * fr.h; i++) de += deltaE00(srgb8ToLab(auto[i * 4], auto[i * 4 + 1], auto[i * 4 + 2]), srgb8ToLab(tapped[i * 4], tapped[i * 4 + 1], tapped[i * 4 + 2]));
  const half = 4, wide = 13;
  const row: TapRow = {
    id: fr.id, what, kind, u, v,
    src: blockChroma(fr.full, fr.w, fr.h, u, v, half),
    autoPatch: blockChroma(auto, fr.w, fr.h, u, v, half), tapPatch: blockChroma(tapped, fr.w, fr.h, u, v, half),
    autoRegion: blockChroma(auto, fr.w, fr.h, u, v, wide), tapRegion: blockChroma(tapped, fr.w, fr.h, u, v, wide),
    gains: solve.ok ? solve.gains : null, limited: solve.ok ? solve.limited : true, solve, frameDE: de / (fr.w * fr.h),
  };
  return { row, tapped, settings };
}

async function png(img: Uint8ClampedArray, w: number, h: number, mark?: { u: number; v: number }): Promise<Buffer> {
  const base = sharp!(Buffer.from(img.buffer, img.byteOffset, img.byteLength), { raw: { width: w, height: h, channels: 4 } });
  if (!mark) return base.png().toBuffer();
  const x = mark.u * w, y = mark.v * h;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><g fill="none" stroke-linecap="round"><circle cx="${x}" cy="${y}" r="9" stroke="#000" stroke-width="3.5"/><circle cx="${x}" cy="${y}" r="9" stroke="#fff" stroke-width="1.5"/><path d="M${x - 16} ${y}H${x - 4}M${x + 4} ${y}H${x + 16}M${x} ${y - 16}V${y - 4}M${x} ${y + 4}V${y + 16}" stroke="#fff" stroke-width="1.5"/></g></svg>`;
  return base.composite([{ input: Buffer.from(svg), left: 0, top: 0 }]).png().toBuffer();
}

const ids = [...new Set([...REAL.map((r) => r.id), ...CARD_CLIPS])].filter((id) => !ONLY || ONLY.has(id));
for (const id of ids) {
  const fr = load(id);
  if (!fr) { process.stderr.write(`skip ${id} (missing or too short)\n`); continue; }
  const st = stateAt(fr);
  const auto = applyGrade({ ...st, settings: BASE }, fr.full, fr.w, fr.h);
  // 3. Untouched.
  for (const s of [{ ...BASE, wbTap: undefined, waterHue: 0 }, { ...BASE, wbTap: [1, 1] as [number, number] }]) {
    const g = applyGrade({ ...st, settings: s }, fr.full, fr.w, fr.h);
    identicalN++;
    for (let i = 0; i < g.length; i++) if (g[i] !== auto[i]) { identical = false; break; }
  }
  // 1. Real neutrals.
  let boardTap: { tapped: Uint8ClampedArray; u: number; v: number } | null = null;
  for (const r of REAL.filter((x) => x.id === id)) {
    const m = measureTap(fr, st, auto, r.u, r.v, r.what, "real");
    taps.push(m.row);
    boardTap ??= { tapped: m.tapped, u: r.u, v: r.v };
  }
  // 4. Water colour.
  {
    const minus = applyGrade({ ...st, settings: { ...BASE, waterHue: -1 } }, fr.full, fr.w, fr.h);
    const plus = applyGrade({ ...st, settings: { ...BASE, waterHue: 1 } }, fr.full, fr.w, fr.h);
    const n = fr.w * fr.h;
    const hue = (img: Uint8ClampedArray, mask: Uint8Array) => {
      // Circular mean of the CIELAB hue over the water pixels.
      let sx = 0, sy = 0, k = 0;
      for (let i = 0; i < n; i++) if (mask[i] === 1) { const l = srgb8ToLab(img[i * 4], img[i * 4 + 1], img[i * 4 + 2]); const c = Math.hypot(l[1], l[2]); if (c > 1) { sx += l[1] / c; sy += l[2] / c; k++; } }
      return k ? ((Math.atan2(sy, sx) * 180) / Math.PI + 360) % 360 : null;
    };
    // Water: cool hue with real chroma in the auto grade (score.ts's test); subject: warm hue with real chroma.
    const mask = new Uint8Array(n);
    let nw = 0;
    for (let i = 0; i < n; i++) {
      const l = srgb8ToLab(auto[i * 4], auto[i * 4 + 1], auto[i * 4 + 2]), c = Math.hypot(l[1], l[2]), h = ((Math.atan2(l[2], l[1]) * 180) / Math.PI + 360) % 360;
      if (c > 14 && h > 170 && h < 300) { mask[i] = 1; nw++; } else if (c > 8 && (h < 110 || h > 330)) mask[i] = 2;
    }
    const move = (img: Uint8ClampedArray, m: number) => { let s = 0, k = 0; for (let i = 0; i < n; i++) if (mask[i] === m) { s += deltaE00(srgb8ToLab(auto[i * 4], auto[i * 4 + 1], auto[i * 4 + 2]), srgb8ToLab(img[i * 4], img[i * 4 + 1], img[i * 4 + 2])); k++; } return k ? s / k : 0; };
    hues.push({ id, hue: { minus: hue(minus, mask), zero: hue(auto, mask), plus: hue(plus, mask) }, water: { minus: move(minus, 1), plus: move(plus, 1) }, subject: { minus: move(minus, 2), plus: move(plus, 2) }, waterShare: nw / n });
    if (sharp && BOARD_ROWS.includes(id) && boardTap) cells.push({ name: id, rows: [await png(fr.full, fr.w, fr.h), await png(auto, fr.w, fr.h), await png(boardTap.tapped, fr.w, fr.h, boardTap), await png(minus, fr.w, fr.h), await png(plus, fr.w, fr.h)] });
  }
  // 2. Synthetic grey card (its own replay: the card is part of the clip).
  if (CARD_CLIPS.includes(id)) for (const [kind, cast] of [["card", 0.5], ["card-full", 1]] as const) {
    const col = cardColour(fr.full, cast);
    const fc: Frame = { ...fr, thumbs: fr.thumbs.map((t) => { const c = new Uint8ClampedArray(t); paste(c, ANALYSIS_W, ANALYSIS_H, col); return c; }), full: new Uint8ClampedArray(fr.full) };
    paste(fc.full, fc.w, fc.h, col);
    const sc = stateAt(fc);
    const ac = applyGrade({ ...sc, settings: BASE }, fc.full, fc.w, fc.h);
    taps.push(measureTap(fc, sc, ac, CARD.u, CARD.v, `grey card rgb(${col.join(",")})`, kind).row);
  }
  process.stderr.write(`${id} done\n`);
}

const f1 = (x: number | null | undefined, w = 6) => (x === null || x === undefined || !Number.isFinite(x) ? "-" : x.toFixed(1)).padStart(w);
const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const lines: string[] = [];
for (const kind of ["real", "card", "card-full"] as const) {
  const rows = taps.filter((t) => t.kind === kind);
  if (!rows.length) continue;
  lines.push(kind === "real" ? `1. TAP ON A REAL NEUTRAL (${STYLE} style; CIELAB C*ab of the region's mean colour, neutral = 0)` : kind === "card" ? "2. TAP ON A SYNTHETIC GREY CARD (45 % grey under half the frame's cast, part of the clip)" : "2b. STRESS: THE CARD UNDER THE FRAME'S FULL CAST (open blue water leaves it next to no red)");
  lines.push(`${"clip".padEnd(28)} ${"point".padEnd(46)} source |  patch: auto → tap | region: auto → tap |  gains R / B  | frame dE00 | note`);
  for (const t of rows) lines.push(`${t.id.padEnd(28)} ${t.what.slice(0, 46).padEnd(46)} ${f1(t.src)} | ${f1(t.autoPatch, 11)} → ${f1(t.tapPatch, 4)} | ${f1(t.autoRegion, 12)} → ${f1(t.tapRegion, 4)} | ${t.gains ? `${t.gains[0].toFixed(2)} / ${t.gains[1].toFixed(2)}`.padStart(12) : "           -"} | ${f1(t.frameDE, 10)} | ${!t.solve.ok ? `not sampled (${t.solve.reason})` : t.limited ? "soft-limited" : ""}`);
  const ok = rows.filter((t) => t.solve.ok && !t.limited);
  const lim = rows.filter((t) => !t.solve.ok || t.limited);
  lines.push(`${"MEAN (not limited)".padEnd(75)} ${f1(mean(ok.map((t) => t.src)))} | ${f1(mean(ok.map((t) => t.autoPatch)), 11)} → ${f1(mean(ok.map((t) => t.tapPatch)), 4)} | ${f1(mean(ok.map((t) => t.autoRegion)), 12)} → ${f1(mean(ok.map((t) => t.tapRegion)), 4)} |              | ${f1(mean(ok.map((t) => t.frameDE)), 10)} | ${ok.length} of ${rows.length} taps neutralised`);
  if (lim.length) lines.push(`${"MEAN (soft-limited)".padEnd(75)} ${f1(mean(lim.map((t) => t.src)))} | ${f1(mean(lim.map((t) => t.autoPatch)), 11)} → ${f1(mean(lim.map((t) => t.tapPatch)), 4)} | ${f1(mean(lim.map((t) => t.autoRegion)), 12)} → ${f1(mean(lim.map((t) => t.tapRegion)), 4)} |              | ${f1(mean(lim.map((t) => t.frameDE)), 10)} | ${lim.length} of ${rows.length} (${lim.filter((t) => t.gains && t.gains[0] === 1 && t.gains[1] === 1).length} left untouched)`);
  lines.push("");
}
lines.push(`3. UNTOUCHED (no tap, Water colour 0): ${identical ? "byte-identical" : "DIFFERENT"} to the grade without the two settings (${identicalN} renders)`, "");
lines.push("4. WATER COLOUR −1 / 0 / +1 (water = cool pixels with chroma in the auto grade; subject = warm pixels with chroma)");
lines.push(`${"clip".padEnd(28)} water %  water hue (CIELAB°): −1      0     +1 | water dE00: −1     +1 | subject dE00: −1     +1`);
for (const h of hues) lines.push(`${h.id.padEnd(28)} ${f1(100 * h.waterShare, 7)}  ${" ".repeat(20)}${f1(h.hue.minus)} ${f1(h.hue.zero)} ${f1(h.hue.plus)} | ${f1(h.water.minus, 14)} ${f1(h.water.plus)} | ${f1(h.subject.minus, 16)} ${f1(h.subject.plus)}`);
{
  const hw = hues.filter((h) => h.waterShare > 0.05 && h.hue.zero !== null);
  const d = (a: number | null, b: number | null) => (a === null || b === null ? NaN : ((a - b + 540) % 360) - 180);
  lines.push(`${"MEAN (clips with water)".padEnd(28)} ${" ".repeat(9)}hue shift ${f1(mean(hw.map((h) => d(h.hue.minus, h.hue.zero))))}° / ${f1(mean(hw.map((h) => d(h.hue.plus, h.hue.zero))))}°${" ".repeat(9)} | ${f1(mean(hw.map((h) => h.water.minus)), 14)} ${f1(mean(hw.map((h) => h.water.plus)))} | ${f1(mean(hw.map((h) => h.subject.minus)), 16)} ${f1(mean(hw.map((h) => h.subject.plus)))}`);
}
console.log(lines.join("\n"));
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify({ style: STYLE, at: AT, gw: GW, taps, hues, identical }, null, 1) + "\n");

if (sharp && cells.length) {
  const labels = ["source", "auto (one tap)", "tap-to-neutral at the mark", "Water colour −1 (teal)", "Water colour +1 (blue)"];
  const CW = 384, PAD = 4, LABEL = 22, NAME = 150;
  const comp: { input: Buffer; left: number; top: number }[] = [];
  let svg = "", y = LABEL;
  const esc = (s: string) => s.replace(/[<&>]/g, "");
  for (let c = 0; c < labels.length; c++) svg += `<text x="${NAME + c * (CW + PAD) + 4}" y="16" font-size="14" font-weight="bold" fill="#fff" font-family="sans-serif">${esc(labels[c])}</text>`;
  for (const cell of cells) {
    const meta = await sharp(cell.rows[0]).metadata();
    const CH = Math.min(300, Math.round((CW * meta.height!) / meta.width!));
    const t = taps.find((x) => x.id === cell.name && x.kind === "real")!;
    svg += `<text x="4" y="${y + 18}" font-size="12" fill="#ddd" font-family="sans-serif">${esc(cell.name.slice(0, 22))}</text>`;
    svg += `<text x="4" y="${y + 36}" font-size="11" fill="#aaa" font-family="sans-serif">C* ${t.autoRegion.toFixed(1)} → ${t.tapRegion.toFixed(1)}</text>`;
    svg += `<text x="4" y="${y + 52}" font-size="11" fill="#aaa" font-family="sans-serif">R ×${t.gains?.[0].toFixed(2)} B ×${t.gains?.[1].toFixed(2)}${t.limited ? " (limited)" : ""}</text>`;
    for (let c = 0; c < cell.rows.length; c++) comp.push({ input: await sharp(cell.rows[c]).resize(CW, CH, { fit: "contain", background: "#111" }).jpeg({ quality: 92 }).toBuffer(), left: NAME + c * (CW + PAD), top: y });
    y += CH + PAD;
  }
  const W = NAME + labels.length * (CW + PAD);
  comp.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${y}">${svg}</svg>`), left: 0, top: 0 });
  fs.mkdirSync(path.dirname(BOARD), { recursive: true });
  await sharp({ create: { width: W, height: y, channels: 3, background: "#111" } }).composite(comp).jpeg({ quality: 88 }).toFile(BOARD);
  console.log(`board: ${BOARD}`);
}
