// Does the Vivid style (Vivid + Seabed recovery) treat one material as one colour? CPU reference (apply.ts), replayed
// at preview cadence (clip-sim.ts) up to the frame asked for.
//
//   node --experimental-strip-types apps/aqua-fix/eval/coherence.ts --out <dir> [--before <dir>] [--board <jpg>] [--gw 360] <clip>@<sec> …
//
// The user's report (11 Nov, eagle ray over sand, Vivid): "the stone, some goes to blue some goes to grey depending
// it's on top of the sand or on top of the water background". The cause was Seabed recovery's weight: the larger of
// the pixel's own brightness ramp and a small ring's, so a dark stone took whatever its few neighbours said and the
// sand switched from neutral to blue along a line. Per frame (coherence.jsonl, printed):
//  - seabed: the Seabed amount in force (0 = this frame says nothing about the weight);
//  - sharp %: share of the frame where the seabed weight changes by more than 0.2 between two pixels 0.02 uv apart
//    (a boundary the picture does not have), for the weight in the engine and for the one before it (`legacy`);
//  - stone gap: mean (and p95) difference between the weight on a stone (a pixel clearly darker than the ground
//    around it, lower 65 % of the frame) and the mean weight of that ground: 0 = stone and sand are treated alike;
//  - stone spread: spread of the stones' output colour in Vivid (root of the a/b variances, Oklab ×100): one
//    material in two colours reads high. With --before <dir> (the stills of an earlier run of this script, e.g. from
//    a checkout of the commit before) the same for those, and --board writes source | Vivid before | Vivid now.
// Writes <out>/<id>-{src,natural,vivid}.png and <out>/<id>-weight.png (legacy | now, white = seabed).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { ANALYSIS_H, ANALYSIS_W } from "../src/engine/analyze.ts";
import * as applyModule from "../src/engine/apply.ts";
import { applyGrade, seabedAmountOf } from "../src/engine/apply.ts";
import { linearToOklab, srgbToLinear } from "../src/engine/color.ts";
import { DEFAULT_SETTINGS, SEABED, type DepthMap, type GradeParams, type UserSettings } from "../src/engine/params.ts";
import { ClipSim } from "./clip-sim.ts";

const args = process.argv.slice(2);
const opt = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const OUT = opt("out", ""), BEFORE = opt("before", ""), BOARD = opt("board", "");
const GW = parseInt(opt("gw", "360"));
const jobs = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
if (!OUT || !jobs.length) { console.error("usage: coherence.ts --out <dir> [--before <dir>] [--board <jpg>] <clip>@<sec> …"); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
const require = createRequire(path.resolve(path.dirname(new URL(import.meta.url).pathname), "../package.json"));
const sharp = require("sharp") as typeof import("sharp");
const COLOR = "in_color_matrix=bt709:in_range=tv:out_range=pc";
// The studio's colourSettings() per style (apps/studio/src/pipeline/tools.ts): Seabed rides on Vivid.
const STYLES: Record<"natural" | "vivid", UserSettings> = { natural: { ...DEFAULT_SETTINGS, vivid: 0, blue: 0, seabed: 0 }, vivid: { ...DEFAULT_SETTINGS, vivid: 1, blue: 0, seabed: 0.6 } };

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const smoothstep = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
/** The weight before 11 Nov: the pixel's own brightness ramp (0.25..0.75 of Lb − Lw) or a ring of 8 guide texels (radius 0.06, gain 1.6). */
function legacyW(p: GradeParams, d: DepthMap, u: number, v: number, L: number): number {
  const lw = p.seabedLw ?? 0, lb = Math.max(p.seabedLb ?? 1, lw + 0.05);
  const seabedT = (x: number) => smoothstep(lw + 0.25 * (lb - lw), lw + 0.75 * (lb - lw), x);
  let acc = 0;
  for (let k = 0; k < 8; k++) {
    const a = k * 0.7853982;
    const qx = clamp(u + 0.06 * Math.cos(a), 0, 1), qy = clamp(v + 0.06 * Math.sin(a), 0, 1);
    const i = Math.min(d.height - 1, Math.floor(qy * d.height)) * d.width + Math.min(d.width - 1, Math.floor(qx * d.width));
    acc += seabedT(linearToOklab(Math.max(0, d.guide[i * 3]), Math.max(0, d.guide[i * 3 + 1]), Math.max(0, d.guide[i * 3 + 2]))[0]);
  }
  return Math.max(seabedT(L), Math.min(1, (1.6 * acc) / 8)) * smoothstep(SEABED.y0, SEABED.y1, v);
}
/** The engine's weight (apply.ts seabedW); a checkout from before it was exported has the legacy one. */
const engineW = (applyModule as unknown as { seabedW?: (p: GradeParams, u: number, v: number) => number }).seabedW;

function decode(file: string, vf: string, w: number, h: number, secs: number): Uint8ClampedArray[] {
  const r = spawnSync("ffmpeg", ["-v", "error", "-t", String(secs), "-i", file, "-vf", vf, "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { maxBuffer: 2 ** 31 });
  const size = w * h * 4, buf = r.stdout as Buffer, out: Uint8ClampedArray[] = [];
  for (let o = 0; o + size <= buf.length; o += size) out.push(new Uint8ClampedArray(buf.buffer, buf.byteOffset + o, size));
  return out;
}
function oklab(px: ArrayLike<number>, n: number): Float32Array {
  const o = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const l = linearToOklab(srgbToLinear(px[i * 4] / 255), srgbToLinear(px[i * 4 + 1] / 255), srgbToLinear(px[i * 4 + 2] / 255)); o[i * 3] = l[0]; o[i * 3 + 1] = l[1]; o[i * 3 + 2] = l[2]; }
  return o;
}
/** Box mean of `src` (radius r) over the pixels where `keep` is set (all when absent); NaN where none. */
function boxMean(src: Float32Array, w: number, h: number, r: number, keep?: Uint8Array): Float32Array {
  const S = new Float64Array((w + 1) * (h + 1)), C = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, k = keep ? keep[i] : 1, j = (y + 1) * (w + 1) + x + 1;
    S[j] = S[j - 1] + S[j - w - 1] - S[j - w - 2] + (k ? src[i] : 0);
    C[j] = C[j - 1] + C[j - w - 1] - C[j - w - 2] + k;
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1), y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    const at = (a: Float64Array) => a[y1 * (w + 1) + x1] - a[y0 * (w + 1) + x1] - a[y1 * (w + 1) + x0] + a[y0 * (w + 1) + x0];
    const c = at(C);
    out[y * w + x] = c > 0 ? at(S) / c : NaN;
  }
  return out;
}
const pct = (xs: number[], q: number) => { if (!xs.length) return NaN; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const r3 = (x: number) => (Number.isFinite(x) ? +x.toFixed(3) : null);

const rows: { id: string; src: string; before: string | null; now: string }[] = [];
const jsonl = fs.createWriteStream(path.join(OUT, "coherence.jsonl"));
for (const job of jobs) {
  const at = job.lastIndexOf("@"), file = job.slice(0, at), T = parseFloat(job.slice(at + 1));
  const base = path.basename(file).replace(/\.[^.]+$/, "");
  // A clip asked for at several times: the time goes into the name.
  const id = jobs.filter((j) => j.slice(0, j.lastIndexOf("@")) === file).length > 1 ? `${base}-${T}s` : base;
  const st = JSON.parse(spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate,sample_aspect_ratio", "-of", "json", file], { encoding: "utf8" }).stdout).streams?.[0];
  if (!st) { console.error(`${id}: no video stream`); continue; }
  const [fa, fb] = String(st.r_frame_rate).split("/").map(Number), fps = fa / (fb || 1);
  const sar = String(st.sample_aspect_ratio ?? "1:1").split(":").map(Number);
  const GH = Math.round((GW * st.height) / (st.width * ((sar[0] || 1) / (sar[1] || 1))) / 2) * 2, n = GW * GH;
  // The profile reads the clip (up to a minute of it); the frame asked for is graded as the preview would show it.
  const thumbs = decode(file, `scale=${ANALYSIS_W}:${ANALYSIS_H}:flags=area:${COLOR},format=rgba`, ANALYSIS_W, ANALYSIS_H, 60);
  const f = Math.min(thumbs.length - 1, Math.round(T * fps));
  const one = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-vf", `select=eq(n\\,${f}),scale=${GW}:${GH}:flags=area:${COLOR},format=rgba`, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { maxBuffer: 2 ** 30 }).stdout as Buffer;
  const full = new Uint8ClampedArray(one.buffer, one.byteOffset, n * 4);
  const sim = new ClipSim("preview", fps, 1);
  sim.profile(thumbs);
  for (let i = 0; i <= f; i++) sim.step(i, thumbs);
  const x = sim.state();
  const outs = Object.fromEntries(Object.entries(STYLES).map(([k, s]) => [k, applyGrade({ params: x.params, settings: s, depth: x.depth, clahe: x.clahe }, full, GW, GH)])) as Record<"natural" | "vivid", Uint8ClampedArray>;
  const png = (px: ArrayLike<number> & { buffer: ArrayBufferLike; byteOffset: number; byteLength: number }, name: string) => sharp(Buffer.from(px.buffer, px.byteOffset, px.byteLength), { raw: { width: GW, height: GH, channels: 4 } }).png().toFile(path.join(OUT, name));
  await png(full, `${id}-src.png`);
  await png(outs.natural, `${id}-natural.png`);
  await png(outs.vivid, `${id}-vivid.png`);

  // The two weights over the frame.
  const src = oklab(full, n), L = new Float32Array(n);
  const wNow = new Float32Array(n), wOld = new Float32Array(n);
  for (let y = 0; y < GH; y++) for (let xx = 0; xx < GW; xx++) {
    const i = y * GW + xx, u = (xx + 0.5) / GW, v = (y + 0.5) / GH;
    L[i] = src[i * 3];
    wOld[i] = legacyW(x.params, x.depth, u, v, L[i]);
    wNow[i] = engineW ? engineW(x.params, u, v) : wOld[i];
  }
  {
    const map = new Uint8ClampedArray(2 * n * 4);
    for (let y = 0; y < GH; y++) for (let xx = 0; xx < GW; xx++) for (const [k, w] of [[0, wOld], [1, wNow]] as const) {
      const o = (y * 2 * GW + k * GW + xx) * 4, g = 255 * w[y * GW + xx];
      map[o] = map[o + 1] = map[o + 2] = g; map[o + 3] = 255;
    }
    await sharp(Buffer.from(map.buffer), { raw: { width: 2 * GW, height: GH, channels: 4 } }).png().toFile(path.join(OUT, `${id}-weight.png`));
  }
  // Sharp changes of the weight: two pixels 0.02 uv apart (either axis) more than 0.2 apart.
  const dx = Math.max(1, Math.round(0.02 * GW)), dy = Math.max(1, Math.round(0.02 * GH));
  const sharpPct = (w: Float32Array) => {
    let k = 0;
    for (let y = 0; y < GH - dy; y++) for (let xx = 0; xx < GW - dx; xx++) { const i = y * GW + xx; if (Math.abs(w[i] - w[i + dx]) > 0.2 || Math.abs(w[i] - w[i + dy * GW]) > 0.2) k++; }
    return (100 * k) / n;
  };
  // Stones: clearly darker than the ground around them (source Oklab L against its box mean over ±0.06 uv), lower 65 %.
  const R = Math.round(0.06 * GW), around = boxMean(L, GW, GH, R);
  const stone = new Uint8Array(n), ground = new Uint8Array(n);
  for (let y = Math.floor(0.35 * GH); y < GH; y++) for (let xx = 0; xx < GW; xx++) { const i = y * GW + xx; if (L[i] < around[i] - 0.025) stone[i] = 1; else if (L[i] > around[i] - 0.005) ground[i] = 1; }
  const gap = (w: Float32Array) => {
    const g = boxMean(w, GW, GH, R, ground), d: number[] = [];
    for (let i = 0; i < n; i++) if (stone[i] && Number.isFinite(g[i])) d.push(Math.abs(w[i] - g[i]));
    return { mean: d.reduce((a, b) => a + b, 0) / Math.max(1, d.length), p95: pct(d, 0.95) };
  };
  const spread = (px: ArrayLike<number>) => {
    const lab = oklab(px, n);
    let k = 0, sa = 0, sb = 0, saa = 0, sbb = 0;
    for (let i = 0; i < n; i++) if (stone[i]) { const a = lab[i * 3 + 1], b = lab[i * 3 + 2]; k++; sa += a; sb += b; saa += a * a; sbb += b * b; }
    return k > 50 ? 100 * Math.sqrt(Math.max(0, saa / k - (sa / k) ** 2) + Math.max(0, sbb / k - (sb / k) ** 2)) : NaN;
  };
  const beforePng = BEFORE ? path.join(BEFORE, `${id}-vivid.png`) : "";
  let spreadBefore = NaN, natSame: boolean | null = null;
  if (beforePng && fs.existsSync(beforePng)) {
    const b = await sharp(beforePng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (b.info.width === GW && b.info.height === GH) spreadBefore = spread(b.data);
    const nb = path.join(BEFORE, `${id}-natural.png`);
    if (fs.existsSync(nb)) natSame = Buffer.compare(await sharp(nb).ensureAlpha().raw().toBuffer(), Buffer.from(outs.natural.buffer, outs.natural.byteOffset, outs.natural.byteLength)) === 0;
  }
  const gn = gap(wNow), go = gap(wOld);
  let stones = 0; for (let i = 0; i < n; i++) stones += stone[i];
  const r = {
    id, t: T, w: GW, h: GH, seabed: r3(seabedAmountOf(x.params, STYLES.vivid)), stonePct: r3((100 * stones) / n),
    sharpPct: { legacy: r3(sharpPct(wOld)), now: r3(sharpPct(wNow)) },
    stoneGap: { legacy: r3(go.mean), now: r3(gn.mean) }, stoneGapP95: { legacy: r3(go.p95), now: r3(gn.p95) },
    stoneSpread: { before: r3(spreadBefore), now: r3(spread(outs.vivid)) },
    naturalSameAsBefore: natSame,
  };
  jsonl.write(JSON.stringify(r) + "\n");
  console.log(JSON.stringify(r));
  rows.push({ id, src: path.join(OUT, `${id}-src.png`), before: beforePng && fs.existsSync(beforePng) ? beforePng : null, now: path.join(OUT, `${id}-vivid.png`) });
}
jsonl.end();

if (BOARD && rows.length) {
  // Rows: one frame each; columns: source | Vivid before (when given) | Vivid now. Every tile 300 px wide.
  const TW = 300, PAD = 8, HEAD = 26;
  const cols = rows.some((r) => r.before) ? (["src", "before", "now"] as const) : (["src", "now"] as const);
  const label = { src: "source", before: "Vivid before", now: "Vivid now" };
  const tiles: { input: Buffer; left: number; top: number }[] = [];
  let y = HEAD;
  for (const r of rows) {
    let hMax = 0;
    for (const [c, k] of cols.entries()) {
      const p = r[k];
      if (!p) continue;
      const img = await sharp(p).resize({ width: TW }).png().toBuffer({ resolveWithObject: true });
      tiles.push({ input: img.data, left: PAD + c * (TW + PAD), top: y });
      hMax = Math.max(hMax, img.info.height);
    }
    const txt = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${TW}" height="18"><text x="4" y="13" font-family="sans-serif" font-size="12" fill="#fff" stroke="#000" stroke-width="0.4">${r.id}</text></svg>`);
    tiles.push({ input: txt, left: PAD, top: y + 2 });
    y += hMax + PAD;
  }
  const W = PAD + cols.length * (TW + PAD);
  const head = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${HEAD}">${cols.map((k, c) => `<text x="${PAD + c * (TW + PAD) + 4}" y="18" font-family="sans-serif" font-size="14" fill="#ddd">${label[k]}</text>`).join("")}</svg>`);
  fs.mkdirSync(path.dirname(BOARD), { recursive: true });
  await sharp({ create: { width: W, height: y, channels: 3, background: "#111" } }).composite([{ input: head, left: 0, top: 0 }, ...tiles]).jpeg({ quality: 92 }).toFile(BOARD);
  console.log(`board: ${BOARD}`);
}
