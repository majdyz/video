// Auto vs the opt-in Vivid look (VIVID_LOOK) on validation clips, replayed on
// the CPU (clip-sim.ts, preview cadence, anchor + follow on).
//
//   node --experimental-strip-types apps/aqua-fix/eval/vivid.ts <valset dir> <out dir> --only id,id [--from 0] [--secs 3] [--gw 192] [--bw 0] [--raw 0|1]
//
// Every frame of `secs` seconds from `from` (the engine replays the clip from its start) is graded twice (Auto, Vivid) at
// `gw` px wide. Per clip (vivid.jsonl, printed):
//  - temporal: global flicker (mean |Δ mean L| frame to frame) and per-pixel
//    temporal change (mean |ΔL|) of the output over the source's; crawl = mean
//    frame-to-frame change of the correction's spatial detail (output − source,
//    minus its 9×9 box mean), ΔE76 units (a denoise raises it too: the
//    correction then follows the source noise); hpRatio = frame-to-frame change
//    of the output's own detail (minus its 9×9 box mean) over the source's —
//    above 1 the grade adds shimmer the picture does not have;
//  - new edges: share of pixels whose output gradient exceeds 2× the
//    source's + 3 ΔE (an edge the picture does not have), and Vivid's
//    gradient over Auto's (1.5× + 3);
//  - rules: water hue (CIELAB) of pixels Auto leaves cyan-blue, violet share
//    pushed past 262° (hue 262–330°, C > 8, bluer than the source / Auto), pink on near-neutral source (hue 330–40°, C > 6),
//    clipped red, mean output L of source shadows (L < 15), mean ΔE00 Vivid vs Auto;
//  - drift: tracked-sand colour drift (as valset.ts: brightest quarter of the
//    low-chroma pixels of the lower half; max ΔE00 in a/b against the first
//    frame, lightness equalised) for both grades, and the source's.
// Writes <out>/<id>-{src,auto,vivid}.png (middle frame; also graded at `bw` px wide as
// <id>-{src,auto,vivid}-big.png when --bw is set) and, with --raw 1,
// <out>/<id>-{src,auto,vivid}.rgb (rgb24 frames, for an A/B video).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { ANALYSIS_H, ANALYSIS_W } from "../src/engine/analyze.ts";
import { applyGrade } from "../src/engine/apply.ts";
import { DEFAULT_SETTINGS, type FrameAnalysis, type UserSettings } from "../src/engine/params.ts";
import { ClipSim } from "./clip-sim.ts";
import { deltaE00, srgb8ToLab } from "./colour-metrics.ts";

const args = process.argv.slice(2);
const opt = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const [dir, outDir] = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
const SECS = parseFloat(opt("secs", "3"));
const FROM = parseFloat(opt("from", "0"));
const GW = parseInt(opt("gw", "192"));
const RAW = opt("raw", "0") === "1";
const BW = parseInt(opt("bw", "0"));
const ONLY = opt("only", "") ? new Set(opt("only", "").split(",")) : null;
fs.mkdirSync(outDir, { recursive: true });
const list = JSON.parse(fs.readFileSync(path.join(dir, "valset.json"), "utf8")) as { id: string; category: string; file: string }[];
const COLOR = "in_color_matrix=bt709:in_range=tv:out_range=pc";
const require = createRequire(path.resolve(path.dirname(new URL(import.meta.url).pathname), "../package.json"));
const sharp = require("sharp") as typeof import("sharp");

function decode(file: string, vf: string, w: number, h: number, secs: number): Uint8ClampedArray[] {
  const r = spawnSync("ffmpeg", ["-v", "error", "-t", String(secs), "-i", file, "-vf", vf, "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { maxBuffer: 2 ** 31 });
  const size = w * h * 4, buf = r.stdout as Buffer, out: Uint8ClampedArray[] = [];
  for (let o = 0; o + size <= buf.length; o += size) out.push(new Uint8ClampedArray(buf.buffer, buf.byteOffset + o, size));
  return out;
}

type Lab = Float32Array; // L, a, b interleaved
function toLab(px: Uint8ClampedArray, n: number): Lab {
  const o = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const l = srgb8ToLab(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]); o[i * 3] = l[0]; o[i * 3 + 1] = l[1]; o[i * 3 + 2] = l[2]; }
  return o;
}
function grad(l: Lab, w: number, h: number): Float32Array {
  const g = new Float32Array(w * h);
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
    const i = y * w + x, r = i + 1, d = i + w;
    let sx = 0, sy = 0;
    for (let c = 0; c < 3; c++) { sx += (l[r * 3 + c] - l[i * 3 + c]) ** 2; sy += (l[d * 3 + c] - l[i * 3 + c]) ** 2; }
    g[i] = Math.max(Math.sqrt(sx), Math.sqrt(sy));
  }
  return g;
}
/** Correction detail: (out − src) minus its 9×9 box mean, per channel. */
function corrDetail(o: Lab, s: Lab | null, w: number, h: number): Float32Array {
  const n = w * h, c = new Float32Array(n * 3), d = new Float32Array(n * 3), R = 4;
  for (let i = 0; i < n * 3; i++) c[i] = o[i] - (s ? s[i] : 0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const m = [0, 0, 0]; let k = 0;
    for (let yy = Math.max(0, y - R); yy <= Math.min(h - 1, y + R); yy++) for (let xx = Math.max(0, x - R); xx <= Math.min(w - 1, x + R); xx++) { const j = (yy * w + xx) * 3; m[0] += c[j]; m[1] += c[j + 1]; m[2] += c[j + 2]; k++; }
    const i = (y * w + x) * 3;
    for (let ch = 0; ch < 3; ch++) d[i + ch] = c[i + ch] - m[ch] / k;
  }
  return d;
}
const hueOf = (a: number, b: number) => ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
const pct = (xs: number[], q: number) => { if (!xs.length) return NaN; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

const SETTINGS: Record<"auto" | "vivid", UserSettings> = { auto: DEFAULT_SETTINGS, vivid: { ...DEFAULT_SETTINGS, vivid: 1 } };
const jsonl = fs.createWriteStream(path.join(outDir, "vivid.jsonl"), { flags: "a" });
for (const c of list) {
  if (ONLY && !ONLY.has(c.id)) continue;
  const file = path.join(dir, c.file);
  if (!fs.existsSync(file)) continue;
  const pr = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate,sample_aspect_ratio", "-of", "json", file], { encoding: "utf8" });
  const st = JSON.parse(pr.stdout).streams?.[0];
  if (!st) continue;
  const [fa, fb] = String(st.r_frame_rate).split("/").map(Number);
  const fps = fa / (fb || 1);
  const sar = String(st.sample_aspect_ratio ?? "1:1").split(":").map(Number);
  const dispW = st.width * ((sar[0] || 1) / (sar[1] || 1));
  const GH = Math.round((GW * st.height) / dispW / 2) * 2;
  const n = GW * GH;
  const t0 = performance.now();
  // The profile reads the whole clip; the graded span is the first SECS seconds.
  const thumbs = decode(file, `scale=${ANALYSIS_W}:${ANALYSIS_H}:flags=area:${COLOR},format=rgba`, ANALYSIS_W, ANALYSIS_H, 60);
  const fulls = decode(file, `scale=${GW}:${GH}:flags=area:${COLOR},format=rgba`, GW, GH, FROM + SECS);
  const f0 = Math.round(FROM * fps);
  const BH = Math.round((BW * st.height) / dispW / 2) * 2;
  const bigs = BW > 0 ? decode(file, `scale=${BW}:${BH}:flags=area:${COLOR},format=rgba`, BW, BH, FROM + SECS) : [];
  const cache = new Map<number, FrameAnalysis>();
  const sim = new ClipSim("preview", fps, 1, { cache });
  sim.profile(thumbs);
  const raws = RAW ? { src: fs.openSync(path.join(outDir, `${c.id}-src.rgb`), "w"), auto: fs.openSync(path.join(outDir, `${c.id}-auto.rgb`), "w"), vivid: fs.openSync(path.join(outDir, `${c.id}-vivid.rgb`), "w") } : null;
  const acc = {
    auto: { hp: 0, flick: 0, tAbs: 0, crawl: 0, newEdge: 0, violet: 0, pink: 0, redClip: 0, shadowL: 0, shadowN: 0 },
    vivid: { hp: 0, flick: 0, tAbs: 0, crawl: 0, newEdge: 0, violet: 0, pink: 0, redClip: 0, shadowL: 0, shadowN: 0 },
  };
  let srcFlick = 0, srcTAbs = 0, pairs = 0, frames = 0, edgeVsAuto = 0, dEva = 0, dEvaN = 0;
  const waterHue: number[] = [];
  const trk: Record<"src" | "auto" | "vivid", [number, number, number][]> = { src: [], auto: [], vivid: [] };
  let prev: { src: Lab; auto: Lab; vivid: Lab; cdA: Float32Array; cdV: Float32Array; hS: Float32Array; hA: Float32Array; hV: Float32Array } | null = null;
  let srcHp = 0;
  const dHp = (x: Float32Array, y: Float32Array) => { let t = 0; for (let i = 0; i < n; i++) t += Math.hypot(x[i * 3] - y[i * 3], x[i * 3 + 1] - y[i * 3 + 1], x[i * 3 + 2] - y[i * 3 + 2]); return t / n; };
  const mid = Math.floor((f0 + Math.min(fulls.length, thumbs.length)) / 2);
  const mean = (l: Lab) => { let s = 0; for (let i = 0; i < n; i++) s += l[i * 3]; return s / n; };
  for (let f = 0; f < thumbs.length && f < fulls.length; f++) {
    sim.step(f, thumbs);
    if (f < f0) continue;
    const x = sim.state();
    const outs = { auto: applyGrade({ params: x.params, settings: SETTINGS.auto, depth: x.depth, clahe: x.clahe }, fulls[f], GW, GH), vivid: applyGrade({ params: x.params, settings: SETTINGS.vivid, depth: x.depth, clahe: x.clahe }, fulls[f], GW, GH) };
    const src = toLab(fulls[f], n);
    const lab = { auto: toLab(outs.auto, n), vivid: toLab(outs.vivid, n) };
    const gS = grad(src, GW, GH);
    const gA = grad(lab.auto, GW, GH), gV = grad(lab.vivid, GW, GH);
    for (let i = 0; i < n; i++) if (gV[i] > 1.5 * gA[i] + 3) edgeVsAuto++;
    for (const k of ["auto", "vivid"] as const) {
      const l = lab[k], g = k === "auto" ? gA : gV, o = outs[k], a = acc[k];
      for (let i = 0; i < n; i++) {
        if (g[i] > 2 * gS[i] + 3) a.newEdge++;
        const L = l[i * 3], A = l[i * 3 + 1], B = l[i * 3 + 2], C = Math.hypot(A, B), h = hueOf(A, B);
        // Pushed into violet: past 262° and bluer than what it was graded from (deep blue water sits past 262° on its own).
        const ref = k === "auto" ? src : lab.auto;
        if (h > 262 && h < 330 && C > 8 && h > hueOf(ref[i * 3 + 1], ref[i * 3 + 2]) + 2) a.violet++;
        const Cs = Math.hypot(src[i * 3 + 1], src[i * 3 + 2]);
        if (src[i * 3] > 45 && Cs < 20 && (h > 330 || h < 40) && C > 6) a.pink++;
        if (o[i * 4] > 252 && o[i * 4 + 1] < 230) a.redClip++;
        if (src[i * 3] < 15) { a.shadowL += L; a.shadowN++; }
      }
    }
    for (let i = 0; i < n; i += 3) {
      const A = lab.auto[i * 3 + 1], B = lab.auto[i * 3 + 2], h = hueOf(A, B);
      if (h > 180 && h < 250 && Math.hypot(A, B) > 15 && lab.auto[i * 3] > 30) waterHue.push(hueOf(lab.vivid[i * 3 + 1], lab.vivid[i * 3 + 2]));
      if (f % 10 === 0) { dEva += deltaE00([lab.auto[i * 3], A, B], [lab.vivid[i * 3], lab.vivid[i * 3 + 1], lab.vivid[i * 3 + 2]]); dEvaN++; }
    }
    {
      // Tracked sand (valset.ts): brightest quarter of the low-chroma pixels of the lower half (source Lab here).
      const ids: [number, number][] = [];
      for (let i = n >> 1; i < n; i++) if (Math.hypot(src[i * 3 + 1], src[i * 3 + 2]) < 20) ids.push([i, src[i * 3]]);
      ids.sort((p, q) => q[1] - p[1]);
      const top = ids.slice(0, Math.max(1, ids.length >> 2));
      if (top.length >= 50) for (const [k, l] of [["src", src], ["auto", lab.auto], ["vivid", lab.vivid]] as const) {
        let L = 0, A = 0, B = 0;
        for (const [i] of top) { L += l[i * 3]; A += l[i * 3 + 1]; B += l[i * 3 + 2]; }
        trk[k].push([L / top.length, A / top.length, B / top.length]);
      }
    }
    const cdA = corrDetail(lab.auto, src, GW, GH), cdV = corrDetail(lab.vivid, src, GW, GH);
    const hS = corrDetail(src, null, GW, GH), hA = corrDetail(lab.auto, null, GW, GH), hV = corrDetail(lab.vivid, null, GW, GH);
    if (prev) {
      srcHp += dHp(hS, prev.hS); acc.auto.hp += dHp(hA, prev.hA); acc.vivid.hp += dHp(hV, prev.hV);
      srcFlick += Math.abs(mean(src) - mean(prev.src));
      let st = 0; for (let i = 0; i < n; i++) st += Math.abs(src[i * 3] - prev.src[i * 3]);
      srcTAbs += st / n;
      for (const k of ["auto", "vivid"] as const) {
        const a = acc[k], l = lab[k], pl = prev[k], cd = k === "auto" ? cdA : cdV, pcd = k === "auto" ? prev.cdA : prev.cdV;
        a.flick += Math.abs(mean(l) - mean(pl));
        let t = 0, cr = 0;
        for (let i = 0; i < n; i++) {
          t += Math.abs(l[i * 3] - pl[i * 3]);
          cr += Math.hypot(cd[i * 3] - pcd[i * 3], cd[i * 3 + 1] - pcd[i * 3 + 1], cd[i * 3 + 2] - pcd[i * 3 + 2]);
        }
        a.tAbs += t / n; a.crawl += cr / n;
      }
      pairs++;
    }
    prev = { src, auto: lab.auto, vivid: lab.vivid, cdA, cdV, hS, hA, hV };
    frames++;
    if (raws) {
      for (const [k, px] of [["src", fulls[f]], ["auto", outs.auto], ["vivid", outs.vivid]] as const) {
        const rgb = Buffer.alloc(n * 3);
        for (let i = 0; i < n; i++) { rgb[i * 3] = px[i * 4]; rgb[i * 3 + 1] = px[i * 4 + 1]; rgb[i * 3 + 2] = px[i * 4 + 2]; }
        fs.writeSync(raws[k as "src" | "auto" | "vivid"], rgb);
      }
    }
    if (f === mid && bigs[f]) {
      const px = { src: bigs[f], auto: applyGrade({ params: x.params, settings: SETTINGS.auto, depth: x.depth, clahe: x.clahe }, bigs[f], BW, BH), vivid: applyGrade({ params: x.params, settings: SETTINGS.vivid, depth: x.depth, clahe: x.clahe }, bigs[f], BW, BH) };
      for (const [k, p] of Object.entries(px)) await sharp(Buffer.from(p.buffer, p.byteOffset, p.byteLength), { raw: { width: BW, height: BH, channels: 4 } }).png().toFile(path.join(outDir, `${c.id}-${k}-big.png`));
    }
    if (f === mid) {
      for (const [k, px] of [["src", fulls[f]], ["auto", outs.auto], ["vivid", outs.vivid]] as const) {
        await sharp(Buffer.from(px.buffer, px.byteOffset, px.byteLength), { raw: { width: GW, height: GH, channels: 4 } }).png().toFile(path.join(outDir, `${c.id}-${k}.png`));
      }
    }
  }
  if (raws) for (const fd of Object.values(raws)) fs.closeSync(fd);
  const P = Math.max(1, pairs), F = Math.max(1, frames) * n;
  const sum = (k: "auto" | "vivid") => {
    const a = acc[k];
    return { hpRatio: +(a.hp / Math.max(1e-6, srcHp)).toFixed(3), flick: +(a.flick / P).toFixed(3), tRatio: +((a.tAbs / P) / Math.max(1e-6, srcTAbs / P)).toFixed(3), crawl: +(a.crawl / P).toFixed(3), newEdgePct: +((100 * a.newEdge) / F).toFixed(3), violetPct: +((100 * a.violet) / F).toFixed(3), pinkPct: +((100 * a.pink) / F).toFixed(3), redClipPct: +((100 * a.redClip) / F).toFixed(4), shadowL: +(a.shadowL / Math.max(1, a.shadowN)).toFixed(2) };
  };
  const r = {
    id: c.id, category: c.category, fps, frames, w: GW, h: GH,
    srcFlick: +(srcFlick / P).toFixed(3),
    auto: sum("auto"), vivid: sum("vivid"),
    vividEdgeVsAutoPct: +((100 * edgeVsAuto) / F).toFixed(3),
    dE00VividAuto: +(dEva / Math.max(1, dEvaN)).toFixed(2),
    sandDrift: trk.src.length ? Object.fromEntries((["src", "auto", "vivid"] as const).map((k) => [k, +trk[k].reduce((m, x) => Math.max(m, deltaE00(trk[k][0], [trk[k][0][0], x[1], x[2]])), 0).toFixed(2)])) : null,
    waterHue: waterHue.length > 50 ? { n: waterHue.length, med: +pct(waterHue, 0.5).toFixed(1), p98: +pct(waterHue, 0.98).toFixed(1) } : null,
  };
  jsonl.write(JSON.stringify(r) + "\n");
  console.log(`${c.id.padEnd(28)} ${((performance.now() - t0) / 1000).toFixed(0)} s  ${JSON.stringify(r)}`);
}
jsonl.end();
