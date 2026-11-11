// Temporal noise reduction, measured on the CPU reference (apply.ts TemporalNR) over valset clips at native size.
//
//   node --experimental-strip-types apps/aqua-fix/eval/noise.ts <valset dir> [--only id,id] [--frames 16] [--start 1.0]
//        [--maxw 1920] [--synth 3,2] [--norefine] [--bits 10] [--board out.jpg [--boardonly id,id]] [--json out.json]
//
// Per clip, Off vs Auto vs Strong (the grade's state frozen at the window's middle, so only the noise differs):
//   noise    frame-to-frame residual on flat, static tiles (the block flow says they do not move), tile mean
//            removed, RMS / √2 in 8-bit steps: of the source the grade reads ("src") and of the graded picture
//            ("out": luminance, and the red channel the grade amplifies most)
//   detail   high-frequency energy (luminance minus its 3×3 tent average) on the most textured tiles against Off;
//            "net" subtracts the same energy on the flat tiles first (noise is high-frequency too, and removing
//            it is the point), so net < 1 is texture lost
//   ghost    on moving pixels (the source's own 3×3 change against the previous frame is far above the noise):
//            how much of that change leaks into the output, Σ|out − src| / Σ|src − previous src| (0 = none)
//   change   mean |out − src| over the whole frame, 8-bit steps (what clean footage must keep near 0)
// --synth w,b adds noise to the clip (white, sd w steps per channel, plus 8×8 blocks of sd b) and scores against
// the clip itself: PSNR on the flat tiles, the textured tiles and the moving pixels, noisy vs denoised.
// --board writes 2× crops (graded), two rows per clip (Off above Auto): the noisiest flat region at the last
// frame, then three consecutive frames of the busiest moving region.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { ANALYSIS_H, ANALYSIS_W } from "../src/engine/analyze.ts";
import { TemporalNR, applyGrade, nrLevelAt, nrStrength, rgbOf, tpFlow, tpLowSize, tpLum } from "../src/engine/apply.ts";
import { DEFAULT_SETTINGS, NR, type UserSettings } from "../src/engine/params.ts";
import { ClipSim } from "./clip-sim.ts";

const args = process.argv.slice(2);
const opt = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const flag = (n: string) => args.includes(`--${n}`);
const dir = args[0];
const ONLY = opt("only", "") ? opt("only", "").split(",") : null;
const FRAMES = parseInt(opt("frames", "16"));
const START = parseFloat(opt("start", "1.0"));
const MAXW = parseInt(opt("maxw", "1920"));
const SYNTH = opt("synth", "") ? opt("synth", "").split(",").map(Number) : null;
const REFINE = !flag("norefine");
const BITS = parseInt(opt("bits", "10"));
const BOARD = opt("board", "");
const JSON_OUT = opt("json", "");
const BOARD_ONLY = opt("boardonly", "") ? opt("boardonly", "").split(",") : null;
const WARM = Math.min(8, FRAMES - 2);
const TILE = 48, PICK = 12;
const SETTINGS: UserSettings = { ...DEFAULT_SETTINGS, vivid: 1, blue: 0, seabed: 0.6 };
const COLOR = "in_color_matrix=bt709:in_range=tv:out_range=pc";
const require = createRequire(path.resolve(path.dirname(new URL(import.meta.url).pathname), "../package.json"));

function decode(file: string, pre: string[], vf: string, w: number, h: number, frames: number): Uint8ClampedArray[] {
  const r = spawnSync("ffmpeg", ["-v", "error", ...pre, "-i", file, "-frames:v", String(frames), "-vf", vf, "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { maxBuffer: 2 ** 31 });
  const size = w * h * 4, buf = r.stdout as Buffer, out: Uint8ClampedArray[] = [];
  for (let o = 0; o + size <= buf.length; o += size) out.push(new Uint8ClampedArray(buf.buffer, buf.byteOffset + o, size));
  return out;
}

// Deterministic noise for --synth.
let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
function addNoise(rgba: Uint8ClampedArray, w: number, h: number, sw: number, sb: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length);
  const bw = Math.ceil(w / 8), bh = Math.ceil(h / 8), blocks = new Float32Array(bw * bh * 3);
  for (let i = 0; i < blocks.length; i++) blocks[i] = gauss() * sb;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, b = ((y >> 3) * bw + (x >> 3)) * 3;
    for (let c = 0; c < 3; c++) out[i + c] = rgba[i + c] + gauss() * sw + blocks[b + c] + 0.5;
    out[i + 3] = 255;
  }
  return out;
}

const lumaAt = (f: Float32Array, i: number) => 0.2126 * f[i * 3] + 0.7152 * f[i * 3 + 1] + 0.0722 * f[i * 3 + 2];
const maxDiff = (a: Float32Array, b: Float32Array, i: number) => Math.max(Math.abs(a[i * 3] - b[i * 3]), Math.abs(a[i * 3 + 1] - b[i * 3 + 1]), Math.abs(a[i * 3 + 2] - b[i * 3 + 2]));
/** RGBA float crop (alpha 1) of an rgb float frame. */
function crop(f: Float32Array, w: number, x0: number, y0: number, cw: number, ch: number): Float32Array {
  const out = new Float32Array(cw * ch * 4);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const s = ((y0 + y) * w + x0 + x) * 3, d = (y * cw + x) * 4;
    out[d] = f[s]; out[d + 1] = f[s + 1]; out[d + 2] = f[s + 2]; out[d + 3] = 1;
  }
  return out;
}
/** High-frequency energy of the luminance in a tile: mean (Y − 3×3 tent of Y)², interior pixels. */
function hfEnergy(f: Float32Array, w: number, x0: number, y0: number): number {
  let s = 0, n = 0;
  for (let y = y0 + 1; y < y0 + TILE - 1; y++) for (let x = x0 + 1; x < x0 + TILE - 1; x++) {
    const Y = (dx: number, dy: number) => lumaAt(f, (y + dy) * w + x + dx);
    const t = (Y(-1, -1) + Y(1, -1) + Y(-1, 1) + Y(1, 1) + 2 * (Y(0, -1) + Y(0, 1) + Y(-1, 0) + Y(1, 0)) + 4 * Y(0, 0)) / 16;
    s += (Y(0, 0) - t) ** 2; n++;
  }
  return s / n;
}
/** Frame-to-frame residual of a channel getter in a tile: Σ (d − mean d)² and the count. */
function residual(get: (i: number) => number, n: number): number {
  let m = 0;
  for (let i = 0; i < n; i++) m += get(i);
  m /= n;
  let s = 0;
  for (let i = 0; i < n; i++) s += (get(i) - m) ** 2;
  return s / n;
}
const rms8 = (meanSq: number) => Math.sqrt(meanSq / 2) * 255;
const psnr = (mse: number) => (mse > 0 ? 10 * Math.log10(1 / mse) : 99);
const r2 = (x: number) => Math.round(x * 100) / 100;

type Variant = "off" | "auto" | "strong";
const VARIANTS: Variant[] = ["off", "auto", "strong"];
const LEVEL: Record<Variant, number> = { off: 0, auto: 1, strong: 2 };
type Row = Record<string, number | string>;
const rows: Row[] = [];
const boardCells: { id: string; images: { buf: Buffer; w: number; h: number; label: string }[] }[] = [];

const list = (JSON.parse(fs.readFileSync(path.join(dir, "valset.json"), "utf8")) as { id: string; category: string; file: string }[]).filter((c) => !ONLY || ONLY.includes(c.id));
if (ONLY) list.sort((a, b) => ONLY.indexOf(a.id) - ONLY.indexOf(b.id));
for (const c of list) {
  const file = path.join(dir, c.file);
  if (!fs.existsSync(file)) continue;
  const st = JSON.parse(spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate", "-of", "json", file], { encoding: "utf8" }).stdout).streams?.[0];
  if (!st) continue;
  const [fa, fb] = String(st.r_frame_rate).split("/").map(Number), fps = fa / (fb || 1);
  const sc = Math.min(1, MAXW / st.width);
  const W = Math.round((st.width * sc) / 2) * 2, H = Math.round((st.height * sc) / 2) * 2;
  const t0 = performance.now();
  const f0 = Math.round(START * fps);
  const thumbs = decode(file, [], `scale=${ANALYSIS_W}:${ANALYSIS_H}:flags=area:${COLOR},format=rgba`, ANALYSIS_W, ANALYSIS_H, f0 + FRAMES);
  let fulls = decode(file, ["-ss", String(f0 / fps)], `scale=${W}:${H}:flags=area:${COLOR},format=rgba`, W, H, FRAMES);
  if (fulls.length < FRAMES || thumbs.length < f0 + FRAMES) { console.log(`${c.id}: too short, skipped`); continue; }
  const clean = SYNTH ? fulls.map((f) => rgbOf(f, W, H)) : null;
  if (SYNTH) fulls = fulls.map((f) => addNoise(f, W, H, SYNTH[0], SYNTH[1]));

  // The grade's state at the middle of the window, held for every frame.
  const sim = new ClipSim("preview", fps, 1);
  sim.profile(thumbs);
  for (let f = 0; f <= f0 + (FRAMES >> 1); f++) sim.step(f, thumbs);
  const state = sim.state();
  const ctx = { params: state.params, settings: SETTINGS, depth: state.depth, clahe: state.clahe };
  const grade = (f: Float32Array, x0: number, y0: number, cw: number, ch: number) => applyGrade(ctx, crop(f, W, x0, y0, cw, ch), cw, ch, { x: x0 / W, y: y0 / H, w: cw / W, h: ch / H }, 1);

  // Pass 1: tiles. Texture (variance of the low-resolution luminance), motion (block flow), brightness, the
  // source's own temporal residual; moving pixels of the last frames per tile (for the board's strip).
  const [lw, lh] = tpLowSize(W, H);
  const tw = Math.floor(W / TILE), th = Math.floor(H / TILE), nt = tw * th;
  const still = new Float64Array(nt), tex = new Float64Array(nt), mot = new Float64Array(nt), conf = new Float64Array(nt), lum = new Float64Array(nt), res = new Float64Array(nt), mov = new Float64Array(nt);
  {
    let prevLum: Float32Array | null = null, prev: Float32Array | null = null;
    for (let f = 0; f < FRAMES; f++) {
      const src = clean ? clean[f] : rgbOf(fulls[f], W, H), lm = tpLum(src, W, H);
      const flow = prevLum ? tpFlow(lm, prevLum, lw, lh) : null;
      for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) {
        const t = ty * tw + tx;
        let s = 0, s2 = 0, n = 0, m = 0, cf = 0;
        const lx0 = Math.floor((tx * TILE * lw) / W), lx1 = Math.min(lw, Math.ceil(((tx + 1) * TILE * lw) / W)), ly0 = Math.floor((ty * TILE * lh) / H), ly1 = Math.min(lh, Math.ceil(((ty + 1) * TILE * lh) / H));
        for (let y = ly0; y < ly1; y++) for (let x = lx0; x < lx1; x++) {
          const v = lm[y * lw + x];
          s += v; s2 += v * v; n++;
          if (flow) { m += Math.hypot(flow[(y * lw + x) * 3], flow[(y * lw + x) * 3 + 1]); cf += flow[(y * lw + x) * 3 + 2]; still[t] += Math.abs(v - prevLum![y * lw + x]) / ((lx1 - lx0) * (ly1 - ly0) * (FRAMES - 1)); }
        }
        tex[t] += (s2 / n - (s / n) ** 2) / FRAMES;
        lum[t] += s / n / FRAMES;
        if (flow) { mot[t] += m / n / (FRAMES - 1); conf[t] += cf / n / (FRAMES - 1); }
        if (prev) {
          const p = prev, x0 = tx * TILE, y0 = ty * TILE;
          res[t] += residual((i) => { const q = (y0 + Math.floor(i / TILE)) * W + x0 + (i % TILE); return lumaAt(src, q) - lumaAt(p, q); }, TILE * TILE) / (FRAMES - 1);
          if (f >= FRAMES - 3) for (let i = 0; i < TILE * TILE; i += 3) { const q = (y0 + Math.floor(i / TILE)) * W + x0 + (i % TILE); if (maxDiff(src, p, q) > 24 / 255) mov[t]++; }
        }
      }
      prevLum = lm; prev = src;
    }
  }
  const ids = [...Array(nt).keys()];
  const midLum = [...lum].sort((a, b) => a - b)[nt >> 1];
  const calm = ids.filter((t) => mot[t] < 0.02 && conf[t] > 0.9 && lum[t] > 0.04 && lum[t] < 0.9 && still[t] < 1.2 / 255);
  const flat = [...calm].sort((a, b) => tex[a] - tex[b]).slice(0, PICK);
  const textured = ids.filter((t) => conf[t] > 0.5 && !flat.includes(t)).sort((a, b) => tex[b] - tex[a]).slice(0, PICK);
  const xy = (t: number): [number, number] => [(t % tw) * TILE, Math.floor(t / tw) * TILE];

  // Pass 2: the three variants, frame by frame.
  type Acc = { src: number; hfFlat: number; hfTex: number; outY: number; outR: number; n: number; ghostNum: number; ghostDen: number; movN: number; change: number; e0: number; el: number; gate: number; frames: number; pFlat: number; pTex: number; pMov: number; pMovN: number; gateMax: number; wt: number };
  const acc = Object.fromEntries(VARIANTS.map((v) => [v, { src: 0, hfFlat: 0, hfTex: 0, outY: 0, outR: 0, n: 0, ghostNum: 0, ghostDen: 0, movN: 0, change: 0, e0: 0, el: 0, gate: 0, frames: 0, pFlat: 0, pTex: 0, pMov: 0, pMovN: 0, gateMax: 0, wt: 0 }])) as Record<Variant, Acc>;
  const nrs = { off: new TemporalNR({ refine: REFINE, bits: BITS }), auto: new TemporalNR({ refine: REFINE, bits: BITS }), strong: new TemporalNR({ refine: REFINE, bits: BITS }) };
  const prevOut: Partial<Record<Variant, Float32Array>> = {};
  const prevGraded: Partial<Record<Variant, Uint8ClampedArray[]>> = {};
  let prevSrc: Float32Array | null = null;
  // Board crops: the noisiest flat tile's surroundings, and the busiest moving tile's.
  const CW = 192, CH = 128;
  const around = (t: number): [number, number] => { const [x, y] = xy(t); return [Math.min(Math.max(0, x + TILE / 2 - CW / 2), W - CW) | 0, Math.min(Math.max(0, y + TILE / 2 - CH / 2), H - CH) | 0]; };
  const noisy = flat.length ? [...flat].sort((a, b) => res[b] - res[a])[0] : ids.sort((a, b) => lum[a] - lum[b])[nt >> 1];
  const busy = [...Array(nt).keys()].sort((a, b) => mov[b] - mov[a])[0];
  const cell: { buf: Buffer; w: number; h: number; label: string }[] = [];
  for (let f = 0; f < FRAMES; f++) {
    const src = rgbOf(fulls[f], W, H);
    // Moving pixels: the source's own 3×3 change is far above the noise (every 2nd pixel of every 2nd row).
    const moving: number[] = [];
    if (prevSrc && f >= 2) {
      const base = clean ? clean[f] : src, basePrev = clean ? clean[f - 1] : prevSrc;
      const thr = 16 / 255;
      for (let y = 2; y < H - 2; y += 2) for (let x = 2; x < W - 2; x += 2) {
        let m = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) m += lumaAt(base, (y + dy) * W + x + dx) - lumaAt(basePrev, (y + dy) * W + x + dx);
        if (Math.abs(m) / 9 > thr) moving.push(y * W + x);
      }
    }
    for (const v of VARIANTS) {
      const a = acc[v], nr = nrs[v];
      const out = v === "off" ? src : nr.step(fulls[f], W, H, LEVEL[v]);
      const po = prevOut[v];
      if (v !== "off" && f >= 1) {
        // Levels and strength at the frame's median luminance bin (the picture's bulk), and the largest strength of any bin.
        const lv = nrLevelAt(nr.levels, midLum);
        a.e0 += lv[0] * 255; a.el += lv[1] * 255; a.wt += nr.weight; a.gate += nrStrength(LEVEL[v], lv[0]); a.frames++;
        for (let b = 0; b < NR.bins; b++) a.gateMax = Math.max(a.gateMax, nrStrength(LEVEL[v], nr.levels[b * 2]));
      }
      if (f >= 2) {
        let ch = 0;
        for (let i = 0; i < W * H; i += 7) ch += maxDiff(out, src, i);
        a.change += (ch / Math.ceil((W * H) / 7)) * 255;
        for (const i of moving) { a.ghostNum += maxDiff(out, src, i); a.ghostDen += maxDiff(src, prevSrc!, i); }
        a.movN += moving.length;
        if (clean) for (const i of moving) { for (let k = 0; k < 3; k++) a.pMov += (out[i * 3 + k] - clean[f][i * 3 + k]) ** 2; a.pMovN += 3; }
      }
      if (f >= WARM && po) {
        const graded: Uint8ClampedArray[] = [];
        for (const t of flat) {
          const [x0, y0] = xy(t);
          a.src += residual((i) => { const q = (y0 + Math.floor(i / TILE)) * W + x0 + (i % TILE); return lumaAt(out, q) - lumaAt(po, q); }, TILE * TILE);
          a.hfFlat += hfEnergy(out, W, x0, y0);
          if (!SYNTH) graded.push(grade(out, x0, y0, TILE, TILE));
          if (clean) a.pFlat += residualMse(out, clean[f], W, x0, y0);
        }
        for (const t of textured) { const [x0, y0] = xy(t); a.hfTex += hfEnergy(out, W, x0, y0); if (clean) a.pTex += residualMse(out, clean[f], W, x0, y0); }
        const pg = prevGraded[v];
        if (pg && !SYNTH) graded.forEach((g, k) => {
          a.outY += residual((i) => (0.2126 * (g[i * 4] - pg[k][i * 4]) + 0.7152 * (g[i * 4 + 1] - pg[k][i * 4 + 1]) + 0.0722 * (g[i * 4 + 2] - pg[k][i * 4 + 2])) / 255, TILE * TILE);
          a.outR += residual((i) => (g[i * 4] - pg[k][i * 4]) / 255, TILE * TILE);
        });
        if (pg || SYNTH) a.n++;
        prevGraded[v] = graded;
      } else if (f >= WARM - 1 && !SYNTH) prevGraded[v] = flat.map((t) => { const [x0, y0] = xy(t); return grade(out, x0, y0, TILE, TILE); });
      if (BOARD && v !== "strong" && f >= FRAMES - 3) {
        // Row per variant: the flat region at the last frame, then the moving region over the last three frames.
        const row = v === "off" ? 0 : 1, lv = nrLevelAt(nrs.auto.levels, lum[noisy])[0];
        const put = (t: number, col: number, label: string) => { const [x0, y0] = around(t); cell[row * 4 + col] = { buf: Buffer.from(grade(out, x0, y0, CW, CH).buffer), w: CW, h: CH, label }; };
        if (f === FRAMES - 1) put(noisy, 0, v === "off" ? `${c.id}${SYNTH ? ` + synthetic noise (sd ${SYNTH[0]})` : ""} · flat region · OFF` : `AUTO (measured noise ${r2(lv * 255)}, strength ${r2(nrStrength(1, lv))})`);
        put(busy, 1 + f - (FRAMES - 3), `moving region · ${v === "off" ? "OFF" : "AUTO"} · frame ${f - (FRAMES - 3) + 1}/3`);
      }
      prevOut[v] = out;
    }
    prevSrc = src;
  }
  if (BOARD && (!BOARD_ONLY || BOARD_ONLY.includes(c.id))) { boardCells.push({ id: c.id, images: cell.slice(0, 4) }); boardCells.push({ id: c.id, images: cell.slice(4, 8) }); }

  const nf = Math.max(1, flat.length), ntx = Math.max(1, textured.length);
  const row: Row = { id: c.id, size: `${W}x${H}`, flatTiles: flat.length };
  for (const v of VARIANTS) {
    const a = acc[v], n = Math.max(1, a.n), o = acc.off;
    const fr = FRAMES - WARM;
    row[`${v}.srcNoise`] = r2(rms8(a.src / (fr * nf)));
    if (!SYNTH) { row[`${v}.outNoiseY`] = r2(rms8(a.outY / (n * nf))); row[`${v}.outNoiseR`] = r2(rms8(a.outR / (n * nf))); }
    if (v !== "off") {
      row[`${v}.detail`] = r2(a.hfTex / o.hfTex);
      // Net of the noise's own high frequencies; meaningless ("n/a") without flat tiles or when the textured tiles are barely busier than the flat ones.
      const netDen = o.hfTex / ntx - o.hfFlat / nf;
      row[`${v}.detailNet`] = flat.length && netDen > 0.25 * (o.hfTex / ntx) ? r2((a.hfTex / ntx - a.hfFlat / nf) / netDen) : "n/a";
      row[`${v}.ghost`] = r2(a.ghostDen > 0 ? a.ghostNum / a.ghostDen : 0);
      row[`${v}.change`] = r2(a.change / (FRAMES - 2));
      row[`${v}.e0`] = r2(a.e0 / Math.max(1, a.frames));
      row[`${v}.el`] = r2(a.el / Math.max(1, a.frames));
      row[`${v}.strength`] = r2(a.gate / Math.max(1, a.frames));
      row[`${v}.strengthMax`] = r2(a.gateMax);
      row[`${v}.weight`] = r2(a.wt / Math.max(1, a.frames));
    }
    if (SYNTH) {
      row[`${v}.psnrFlat`] = r2(psnr(a.pFlat / (fr * nf)));
      row[`${v}.psnrTex`] = r2(psnr(a.pTex / (fr * ntx)));
      row[`${v}.psnrMoving`] = r2(psnr(a.pMov / Math.max(1, a.pMovN)));
    }
  }
  row.movingShare = r2(acc.auto.movN / ((FRAMES - 2) * ((W * H) / 4)));
  rows.push(row);
  const g = (k: string) => row[k];
  if (SYNTH) console.log(`${c.id.padEnd(30)} PSNR flat ${g("off.psnrFlat")}→${g("auto.psnrFlat")}/${g("strong.psnrFlat")} · textured ${g("off.psnrTex")}→${g("auto.psnrTex")}/${g("strong.psnrTex")} · moving ${g("off.psnrMoving")}→${g("auto.psnrMoving")}/${g("strong.psnrMoving")} · e0 ${g("auto.e0")} strength ${g("auto.strength")} weight ${g("auto.weight")}/${g("strong.weight")} · ${((performance.now() - t0) / 1000).toFixed(0)} s`);
  else console.log(`${c.id.padEnd(30)} e0 ${g("auto.e0")} el ${g("auto.el")} str ${g("auto.strength")} (max ${g("auto.strengthMax")}) wt ${g("auto.weight")}/${g("strong.weight")} | src noise ${g("off.srcNoise")}→${g("auto.srcNoise")}/${g("strong.srcNoise")} | out Y ${g("off.outNoiseY")}→${g("auto.outNoiseY")}/${g("strong.outNoiseY")} R ${g("off.outNoiseR")}→${g("auto.outNoiseR")}/${g("strong.outNoiseR")} | detail ${g("auto.detail")}/${g("strong.detail")} net ${g("auto.detailNet")}/${g("strong.detailNet")} | ghost ${g("auto.ghost")}/${g("strong.ghost")} (moving ${g("movingShare")}) | change ${g("auto.change")}/${g("strong.change")} | flat ${flat.length} · ${((performance.now() - t0) / 1000).toFixed(0)} s`);
}

function residualMse(out: Float32Array, ref: Float32Array, w: number, x0: number, y0: number): number {
  let s = 0;
  for (let y = y0; y < y0 + TILE; y++) for (let x = x0; x < x0 + TILE; x++) { const i = (y * w + x) * 3; s += (out[i] - ref[i]) ** 2 + (out[i + 1] - ref[i + 1]) ** 2 + (out[i + 2] - ref[i + 2]) ** 2; }
  return s / (TILE * TILE * 3);
}

if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(rows, null, 1));

if (BOARD && boardCells.length) {
  const sharp = require("sharp") as typeof import("sharp");
  const Z = 2, CW = 192 * Z, CH = 128 * Z, LBL = 22, cols = 4;
  const rowH = CH + LBL;
  const comps: { input: Buffer; left: number; top: number }[] = [];
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  let svg = "";
  for (let r = 0; r < boardCells.length; r++) {
    const im = boardCells[r].images;
    for (let k = 0; k < im.length; k++) {
      const png = await sharp(im[k].buf, { raw: { width: im[k].w, height: im[k].h, channels: 4 } }).resize(CW, CH, { kernel: "nearest" }).png().toBuffer();
      comps.push({ input: png, left: k * CW, top: r * rowH + LBL });
      svg += `<text x="${k * CW + 6}" y="${r * rowH + 16}" font-family="sans-serif" font-size="14" fill="#fff">${esc(im[k].label)}</text>`;
    }
  }
  const Wb = cols * CW, Hb = boardCells.length * rowH;
  comps.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${Wb}" height="${Hb}">${svg}</svg>`), left: 0, top: 0 });
  await sharp({ create: { width: Wb, height: Hb, channels: 3, background: "#111" } }).composite(comps).jpeg({ quality: 92 }).toFile(BOARD);
  console.log(`board: ${BOARD}`);
}
