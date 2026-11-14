// Subject pop, old engine vs new, on real frames with the CPU reference (applyGrade): strips "off | on old | on new"
// for the AI-outline path and the Basic path, plus the subject's chroma, the change of the water under a wide
// outline (DILATE px) and of the water ring outside it. The "AI" mask is a colour-departure mask (pixel vs the heavily
// blurred frame, Oklab), cleaned, small parts dropped: a stand-in, not the model's.
//   ffmpeg -i clip.mov -vf fps=1,scale=270:480 -pix_fmt rgba -f rawvideo frames.rgba
//   git archive <old commit> apps/aqua-fix/src/engine | tar -x -C /tmp/old
//   node --experimental-strip-types pop-compare.ts <name> frames.rgba 270 480 <t0,t1,...> <oldEngineDir> <newEngineDir> <outDir> [thr] [ai,basic,person]
//   env: DILATE, ONLY (times), BOX u0,v0,u1,v1 (+ BOXT), LIGHTK, POP, WARMTH, MASK, MASKONLY, DBG,
//        SWEEP (JSON list of {name, SEG_RESTORE, SUBJECT_POP, SUBJECT_CLEAR} overrides: strips "off | level ...")
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const [name, file, Ws, Hs, ts, oldDir, newDir, outDir, thrS, modesS] = process.argv.slice(2);
const BOX0 = process.env.BOX ? process.env.BOX.split(",").map(Number) : null; // u0,v0,u1,v1: the mask only inside
const W = +Ws, H = +Hs, times = ts.split(",").map(Number), thr = +(thrS ?? 0.07);
const modes = (modesS ?? "ai,basic,person").split(",");
const require = createRequire(path.join(newDir, "x.js"));
const sharp = require("sharp");
fs.mkdirSync(outDir, { recursive: true });

async function loadEngine(dir: string) {
  const load = (f: string) => import(pathToFileURL(path.join(dir, f)).href);
  const { analyzeThumbnail, ANALYSIS_W, ANALYSIS_H } = await load("analyze.ts");
  const { applyGrade } = await load("apply.ts");
  const color = await load("color.ts");
  const { SEG_TONE } = await load("grade-shader.ts");
  const params = await load("params.ts");
  const { DEFAULT_SETTINGS, guideTexture } = params;
  const so = await load("seg-overlay.ts");
  return { analyzeThumbnail, ANALYSIS_W, ANALYSIS_H, applyGrade, color, SEG_TONE, DEFAULT_SETTINGS, guideTexture, so, params };
}
const E = { old: await loadEngine(oldDir), new: await loadEngine(newDir) };
const { linearToOklab, srgbToLinear } = E.new.color;
const labOf = (p: Uint8ClampedArray, i: number) => linearToOklab(srgbToLinear(p[i * 4] / 255), srgbToLinear(p[i * 4 + 1] / 255), srgbToLinear(p[i * 4 + 2] / 255)) as [number, number, number];

function dist(on: Uint8Array): Float32Array {
  const d = new Float32Array(W * H).map((_, i) => (on[i] ? 1e6 : 0));
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? 1e6 : d[y * W + x]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[y * W + x]) d[y * W + x] = Math.min(d[y * W + x], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.414, at(x + 1, y - 1) + 1.414);
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) if (d[y * W + x]) d[y * W + x] = Math.min(d[y * W + x], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.414, at(x - 1, y + 1) + 1.414);
  return d;
}
function boxBlur(src: Float32Array, r: number): Float32Array {
  const tmp = new Float32Array(W * H), out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) { let s = 0, n = 0; for (let x = -r; x < W; x++) { const xa = x + r, xr = x - r - 1; if (xa < W) { s += src[y * W + xa]; n++; } if (xr >= 0) { s -= src[y * W + xr]; n--; } if (x >= 0) tmp[y * W + x] = s / n; } }
  for (let x = 0; x < W; x++) { let s = 0, n = 0; for (let y = -r; y < H; y++) { const ya = y + r, yr = y - r - 1; if (ya < H) { s += tmp[ya * W + x]; n++; } if (yr >= 0) { s -= tmp[yr * W + x]; n--; } if (y >= 0) out[y * W + x] = s / n; } }
  return out;
}

let curT = 0;
let devMap = new Float32Array(0);
function maskOf(px: Uint8ClampedArray): Uint8Array {
  const BOX = BOX0 && curT <= +(process.env.BOXT ?? 1e9) ? BOX0 : null;
  const ch = [0, 1, 2].map(() => new Float32Array(W * H));
  for (let i = 0; i < W * H; i++) { const l = labOf(px, i); ch[0][i] = l[0]; ch[1][i] = l[1]; ch[2][i] = l[2]; }
  const r = Math.round(W / 4);
  const bg = ch.map((c) => boxBlur(boxBlur(c, r), r));
  const raw = new Uint8Array(W * H);
  devMap = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) devMap[i] = Math.hypot(ch[0][i] - bg[0][i], ch[1][i] - bg[1][i], ch[2][i] - bg[2][i]);
  // (LIGHTK: what is lighter than the blurred frame needs that many times the departure: bright water in a steep gradient is not a subject.)
  const LK = +(process.env.LIGHTK ?? 1);
  for (let i = 0; i < W * H; i++) raw[i] = Math.hypot(ch[0][i] - bg[0][i], ch[1][i] - bg[1][i], ch[2][i] - bg[2][i]) > thr * (ch[0][i] > bg[0][i] ? LK : 1) ? 1 : 0;
  const on = new Uint8Array(W * H);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { let c = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) c += raw[(y + dy) * W + x + dx]; on[y * W + x] = c >= 5 ? 1 : 0; }
  // Drop parts under 0.15% of the frame.
  const lab = new Int32Array(W * H); let parts = 0; const sizes: number[] = [0];
  for (let s = 0; s < W * H; s++) {
    if (!on[s] || lab[s]) continue;
    const st = [s]; lab[s] = ++parts; let n = 0;
    while (st.length) { const i = st.pop()!, x = i % W; n++; for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) if (j >= 0 && j < W * H && on[j] && !lab[j]) { lab[j] = parts; st.push(j); } }
    sizes.push(n);
  }
  for (let i = 0; i < W * H; i++) if (on[i] && (sizes[lab[i]] < 0.0015 * W * H || (BOX && ((i % W) / W < BOX[0] || (i % W) / W > BOX[2] || Math.floor(i / W) / H < BOX[1] || Math.floor(i / W) / H > BOX[3])))) on[i] = 0;
  return on;
}

const buf = fs.readFileSync(file);
const rows: any[] = [];
for (let fi = 0; fi < times.length; fi++) {
  if (process.env.ONLY && !process.env.ONLY.split(",").map(Number).includes(times[fi])) continue;
  const px = new Uint8ClampedArray(buf.buffer, buf.byteOffset + fi * W * H * 4, W * H * 4);
  curT = times[fi];
  const on0 = maskOf(px);
  const dIn0 = dist(on0), dOut0 = dist(Uint8Array.from(on0, (v) => 1 - v));
  const DIL = +(process.env.DILATE ?? 0);
  const on = DIL > 0 ? Uint8Array.from(on0, (v, i) => (v || dOut0[i] <= DIL ? 1 : 0)) : on0;
  const dIn = dist(on), dOut = dist(Uint8Array.from(on, (v) => 1 - v));
  const area = on.reduce((s, v) => s + v, 0) / (W * H);
  if (process.env.MASKONLY) {
    const mi = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) { const v = on[i] ? 255 : 0; mi.set([v, v, v, 255], i * 4); }
    await sharp({ create: { width: 2 * W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } }).composite([px, mi].map((t, k) => ({ input: Buffer.from(t.buffer, t.byteOffset, t.byteLength), raw: { width: W, height: H, channels: 4 }, left: k * W, top: 0 }))).png().toFile(path.join(outDir, `${name}_t${String(times[fi]).padStart(4, "0")}_mask.png`));
    continue;
  }
  const renders: Record<string, Uint8ClampedArray> = {};
  for (const [ek, e] of Object.entries(E)) {
    const alpha = new Float32Array(W * H), near = new Float32Array(W * H).fill(1);
    for (let i = 0; i < W * H; i++) alpha[i] = Math.min(1, Math.max(0, 0.5 + (on[i] ? dIn[i] - 0.5 : -(dOut[i] - 0.5)) / (2 * e.SEG_TONE.alphaR)));
    const AW = e.ANALYSIS_W, AH = e.ANALYSIS_H;
    const th = new Uint8ClampedArray(AW * AH * 4);
    for (let y = 0; y < AH; y++) for (let x = 0; x < AW; x++) { const s = (Math.min(H - 1, Math.floor(((y + 0.5) / AH) * H)) * W + Math.min(W - 1, Math.floor(((x + 0.5) / AW) * W))) * 4; th.set(px.subarray(s, s + 4), (y * AW + x) * 4); }
    const an = e.analyzeThumbnail(th, AW, AH);
    const guide = { width: an.depth.width, height: an.depth.height, data: e.guideTexture(an.depth) };
    const overlay = { width: W, height: H, alpha, exclude: null, near, depart: null, quality: 1 };
    const strength = e.so.composeSegStrength(overlay, guide);
    const pc = e.so.popContrast(guide, overlay), popDir = pc === null ? 1 : e.so.popDirection(pc);
    const person = new Float32Array(an.depth.width * an.depth.height);
    for (let y = 0; y < an.depth.height; y++) for (let x = 0; x < an.depth.width; x++) person[y * an.depth.width + x] = on[Math.min(H - 1, Math.floor(((y + 0.5) / an.depth.height) * H)) * W + Math.min(W - 1, Math.floor(((x + 0.5) / an.depth.width) * W))];
    if (process.env.DBG && ek === "new") {
      const { segSample, segRim, segToneWeight, segColourK } = await import(pathToFileURL(path.join(newDir, "apply.ts")).href);
      const h: Record<string, number[]> = {};
      for (let i = 0; i < W * H; i++) {
        const isHalo = on[i] === 1 && !on0[i] && dOut0[i] >= 2, isSub = on0[i] === 1 && dIn0[i] >= 2;
        if (!isHalo && !isSub) continue;
        const u = ((i % W) + 0.5) / W, v = (Math.floor(i / W) + 0.5) / H;
        const a = segSample(strength, u, v);
        const l0 = labOf(px, i);
        const key = isHalo ? "halo" : "subj";
        (h[key + ".R"] ??= []).push(a[0]); (h[key + ".d"] ??= []).push((a[2] - 0.5) * 12); (h[key + ".L0"] ??= []).push(l0[0]); (h[key + ".G"] ??= []).push(a[1]); (h[key + ".close"] ??= []).push(a[4]);
        (h[key + ".ck"] ??= []).push(segColourK(a));
        if (a[0] > 2) { (h[key + ".dL"] ??= []).push(l0[0] - (a[0] - 9)); const lin = e.color.linearToOklab(an.params.veilColor[0], an.params.veilColor[1], an.params.veilColor[2]); const n = Math.hypot(lin[1], lin[2]) || 1; (h[key + ".perp"] ??= []).push((l0[1] * lin[2] - l0[2] * lin[1]) / n); (h[key + ".rim"] ??= []).push(segRim(a, l0, lin[1] / n, lin[2] / n)); }
      }
      for (const [k, v] of Object.entries(h)) { v.sort((x, y) => x - y); console.log("DBG", k, [0.05, 0.25, 0.5, 0.75, 0.95].map((q) => v[Math.floor(q * (v.length - 1))].toFixed(3)).join(" ")); }
    }
    const set = (pop: boolean) => ({ ...e.DEFAULT_SETTINGS, vivid: 1, seabed: 0.6, subjectPop: pop, subjectPopStrength: +(process.env.POP ?? 0.5), subjectPopWarmth: +(process.env.WARMTH ?? 0.5) });
    const g = (pop: boolean, seg: boolean, pers: boolean) => e.applyGrade({ params: an.params, settings: set(pop), depth: pers ? { ...an.depth, person } : an.depth, clahe: an.clahe, ...(seg ? { seg: { strength, popDir } } : {}) }, px, W, H) as Uint8ClampedArray;
    renders[`${ek}.off`] = g(false, false, false);
    if (modes.includes("ai")) renders[`${ek}.ai`] = g(true, true, false);
    if (modes.includes("basic")) renders[`${ek}.basic`] = g(true, false, false);
    // SWEEP='[{"name":"A","SEG_RESTORE":{...},"SUBJECT_POP":{...},"SUBJECT_CLEAR":{...}}, ...]': the new engine again at each level.
    if (ek === "new" && process.env.SWEEP) for (const lvl of JSON.parse(process.env.SWEEP)) {
      const saved: Record<string, object> = {};
      for (const k of ["SEG_RESTORE", "SUBJECT_POP", "SUBJECT_CLEAR"]) if (lvl[k]) { saved[k] = { ...e.params[k] }; Object.assign(e.params[k], lvl[k]); }
      if (modes.includes("ai")) renders[`${lvl.name}.ai`] = g(true, true, false);
      if (modes.includes("basic")) renders[`${lvl.name}.basic`] = g(true, false, false);
      for (const k of Object.keys(saved)) Object.assign(e.params[k], saved[k]);
    }
    if (modes.includes("person")) { renders[`${ek}.offp`] = g(false, false, true); renders[`${ek}.aip`] = g(true, true, true); renders[`${ek}.basicp`] = g(true, false, true); }
  }
  // Metrics.
  const subj = (i: number) => on0[i] === 1 && dIn0[i] >= 2, halo = (i: number) => on[i] === 1 && !on0[i] && dOut0[i] >= 2 && devMap[i] < 0.5 * thr, ring = (i: number) => !on[i] && dOut[i] >= 2 && dOut[i] <= 12 && devMap[i] < 0.5 * thr; // (water only: what the stand-in mask missed, another shark of the school, is not water)
  const m = (p: Uint8ClampedArray, where: (i: number) => boolean, ref?: Uint8ClampedArray) => {
    let n = 0, C = 0, L = 0, dE = 0, a = 0, b = 0;
    for (let i = 0; i < W * H; i++) if (where(i)) { const l = labOf(p, i); n++; C += Math.hypot(l[1], l[2]); L += l[0]; a += l[1]; b += l[2]; if (ref) { const q = labOf(ref, i); dE += Math.hypot(l[0] - q[0], l[1] - q[1], l[2] - q[2]); } }
    n = Math.max(1, n);
    return { C: +(C / n).toFixed(4), L: +(L / n).toFixed(4), hue: +(((Math.atan2(b, a) * 180) / Math.PI + 360) % 360).toFixed(0), dE: +((dE / n) * 100).toFixed(3), n };
  };
  const row: any = { t: times[fi], area: +(area * 100).toFixed(2) };
  for (const [k, p] of Object.entries(renders)) {
    const ek = k.split(".")[0], kind = k.split(".")[1];
    const ref = kind === "off" || kind === "offp" ? undefined : renders[`${ek === "old" ? "old" : "new"}.${kind.endsWith("p") ? "offp" : "off"}`];
    row[k] = { subj: m(p, subj, ref), ring: m(p, ring, ref), halo: m(p, halo, ref) };
  }
  let offDiff = 0;
  for (let i = 0; i < W * H * 4; i++) offDiff = Math.max(offDiff, Math.abs(renders["old.off"][i] - renders["new.off"][i]));
  row.offDiff = offDiff;
  rows.push(row);
  const f = (k: string) => { const r = row[k]; return r ? `${k.padEnd(11)} subjC ${r.subj.C.toFixed(3)} L ${r.subj.L.toFixed(3)} hue ${String(r.subj.hue).padStart(3)} dE ${r.subj.dE.toFixed(2).padStart(5)} | ring dE ${r.ring.dE.toFixed(3)} C ${r.ring.C.toFixed(3)} | halo dE ${r.halo.dE.toFixed(3)} C ${r.halo.C.toFixed(3)}` : ""; };
  console.log(`\n${name} t=${times[fi]}s mask ${row.area}% offDiff ${offDiff}`);
  for (const k of Object.keys(renders)) console.log("  " + f(k));
  // PNGs: per mode a strip  off | on old | on new  (+ source and mask for the first).
  const tag = `${name}_t${String(times[fi]).padStart(4, "0")}`;
  const maskImg = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { const v = on[i] ? 255 : 0; maskImg.set([v, v, v, 255], i * 4); }
  const strip = async (tiles: Uint8ClampedArray[], out: string, labels = ["Subjects off", "Subjects on - old", "Subjects on - new"], title = "") => {
    const G = 4, HB = 24, cw = tiles.length * W + (tiles.length - 1) * G;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${HB}">` + labels.map((l, k) => `<text x="${k * (W + G) + 6}" y="17" font-family="DejaVu Sans, sans-serif" font-size="13" fill="#e8e8e8">${l}${k === 0 && title ? "  (" + title + ")" : ""}</text>`).join("") + `</svg>`;
    await sharp({ create: { width: cw, height: H + HB, channels: 4, background: { r: 20, g: 20, b: 20, alpha: 1 } } })
      .composite([...tiles.map((t, k) => ({ input: Buffer.from(t.buffer, t.byteOffset, t.byteLength), raw: { width: W, height: H, channels: 4 }, left: k * (W + G), top: HB })), { input: Buffer.from(svg), left: 0, top: 0 }])
      .png().toFile(path.join(outDir, out));
  };
  const ttl = (m: string) => `${m}, ${times[fi]} s`;
  if (modes.includes("ai")) await strip([renders["new.off"], renders["old.ai"], renders["new.ai"]], `${tag}_ai.png`, undefined, ttl("AI outline"));
  if (modes.includes("basic")) await strip([renders["new.off"], renders["old.basic"], renders["new.basic"]], `${tag}_basic.png`, undefined, ttl("Basic"));
  if (modes.includes("person")) { await strip([renders["new.offp"], renders["old.aip"], renders["new.aip"]], `${tag}_ai-person.png`); await strip([renders["new.offp"], renders["old.basicp"], renders["new.basicp"]], `${tag}_basic-person.png`); }
  if (process.env.SWEEP) {
    const names = JSON.parse(process.env.SWEEP).map((l: any) => l.name as string);
    for (const m of modes.filter((x) => x === "ai" || x === "basic")) await strip([renders["new.off"], ...names.map((n: string) => renders[`${n}.${m}`])], `${tag}_${m}_sweep.png`, ["Subjects off", ...names.map((n: string) => `on - ${n}`)], ttl(m === "ai" ? "AI outline" : "Basic"));
  }
  if (process.env.MASK) await strip([px, maskImg], `${tag}_mask.png`, ["source", "mask"]);
}
fs.writeFileSync(path.join(outDir, `${name}.metrics.json`), JSON.stringify(rows, null, 1));
