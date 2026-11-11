// Fits the look parameters (params.ts tuning objects) to the reference pairs, with leave-one-out.
//
//   node --experimental-strip-types apps/aqua-fix/eval/fit-look.ts [--pairs <dir>] [--style vivid] [--px 160]
//        [--set OBJ.field=v,…]                 start from these overrides (and just print the score when no --fit)
//        [--fit OBJ.field=v1/v2/v3,…]          coordinate descent over these candidate values (the current value is always a candidate)
//        [--loo]                               also refit with each pair held out and score the held-out pair
//        [--rounds 2] [--reg 0.1] [--hold 1] [--creg 0]
//        [--hold-base OBJ.field=v,…]           the look each pair must not fall behind (default WATER_HUE.amount=0)
//
// The objective is score.ts's reference distance (sliced Wasserstein in CIELAB to the user's grade) of one style,
// averaged over the pairs, plus `reg` × the mean water hue error in degrees / 10 (a region statistic the palette
// distance alone under-weights), plus `hold` × how far each pair ends up behind the same style with the water-hue
// map off (WATER_HUE.amount = 0, the look before that fit; --hold-base names another): a mean bought by breaking one
// picture costs. `creg` × the mean chroma error (median, water and warm-subject chroma vs the reference, C*ab / 10) can be added. Stills are graded at --px directly (score.ts grades at 2× and halves), so the
// numbers differ a little from score.ts; the ranking does not.
//
// Leave-one-out: for each pair the same descent runs on the other pairs from the same start; the held-out pair is
// then scored with those parameters. "LOO mean" is the mean of the held-out scores: what the fit is worth on a
// picture it has not seen. A large gap to the in-sample mean means the parameters follow single pictures.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as analyzeModule from "../src/engine/analyze.ts";
import * as paramsModule from "../src/engine/params.ts";
import { analyzeThumbnail, ANALYSIS_H, ANALYSIS_W } from "../src/engine/analyze.ts";
import { applyGrade } from "../src/engine/apply.ts";
import { DEFAULT_SETTINGS, type UserSettings } from "../src/engine/params.ts";
import { hueDiff, labOf, regionStats, swd, type Lab, type Region } from "./colour-metrics.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const PAIRS = opt("pairs", process.env.SCORE_PAIRS ?? "/home/majdyz/video-data/review-fable/colour/pairs");
const PX = parseInt(opt("px", "160")), ROUNDS = parseInt(opt("rounds", "2")), REG = parseFloat(opt("reg", "0.1")), HOLD = parseFloat(opt("hold", "1")), CREG = parseFloat(opt("creg", "0"));
const STYLES: Record<string, UserSettings> = {
  natural: { ...DEFAULT_SETTINGS, vivid: 0, blue: 0, seabed: 0 },
  vivid: { ...DEFAULT_SETTINGS, vivid: 1, blue: 0, seabed: 0.6 },
  blue: { ...DEFAULT_SETTINGS, vivid: 1, blue: 1, seabed: 0.6 },
};
const STYLE = STYLES[opt("style", "vivid")];
const require = createRequire(path.resolve(HERE, "../package.json"));

const DEG = /^(target|warmDir|warmHue|(veg|warm|mag)(In|Out)\d|vio\d)$/; // angles: given in degrees on the command line
function slot(key: string): { o: Record<string, number>; f: string; k: number } {
  const [obj, f] = key.split(".");
  const o = ((paramsModule as unknown as Record<string, Record<string, number>>)[obj] ?? (analyzeModule as unknown as Record<string, Record<string, number>>)[obj]);
  if (!o || !(f in o)) throw new Error(`no ${key}`);
  return { o, f, k: DEG.test(f) ? Math.PI / 180 : 1 };
}
const get = (key: string) => { const s = slot(key); return s.o[s.f] / s.k; };
const set = (key: string, v: number) => { const s = slot(key); s.o[s.f] = v * s.k; };

type Pair = { name: string; /** Reference distance with the water-hue map off. */ d0: number; img: Uint8ClampedArray; w: number; h: number; a: ReturnType<typeof analyzeThumbnail>; ref: Lab; refHue: number | null; refStats: Region };
async function load(): Promise<Pair[]> {
  const sharp = require("sharp") as typeof import("sharp");
  const out: Pair[] = [];
  for (const f of fs.readdirSync(path.join(PAIRS, "src")).filter((x) => /\.(jpe?g|png)$/i.test(x)).sort()) {
    const meta = await sharp(path.join(PAIRS, "src", f)).rotate().toBuffer({ resolveWithObject: true });
    const k = PX / Math.max(meta.info.width, meta.info.height), w = Math.max(1, Math.round(meta.info.width * k)), h = Math.max(1, Math.round(meta.info.height * k));
    const img = new Uint8ClampedArray((await sharp(meta.data).resize(w, h, { fit: "fill" }).ensureAlpha().raw().toBuffer()).buffer);
    const tb = await sharp(meta.data).resize(ANALYSIS_W, ANALYSIS_H, { fit: "fill" }).ensureAlpha().raw().toBuffer();
    const a = analyzeThumbnail(new Uint8ClampedArray(tb.buffer, tb.byteOffset, tb.byteLength), ANALYSIS_W, ANALYSIS_H);
    const rb = await sharp(path.join(PAIRS, "ref", f)).rotate().resize(PX, PX, { fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const ref = labOf(rb.data, rb.info.width * rb.info.height);
    out.push({ name: f.replace(/\.[^.]+$/, ""), d0: 0, img, w, h, a, ref, refHue: regionStats(ref).waterHue, refStats: regionStats(ref) });
  }
  return out;
}
type Score = { d: number; hue: number | null; /** Chroma errors vs the reference: median, water, warm subjects (mean of those defined). */ c: number; cs: [number, number | null, number] };
function scoreOf(p: Pair): Score {
  const g = applyGrade({ params: p.a.params, settings: STYLE, depth: p.a.depth, clahe: p.a.clahe }, p.img, p.w, p.h);
  const lab = labOf(g, p.w * p.h), st = regionStats(lab), wh = st.waterHue, r = p.refStats;
  const cs: [number, number | null, number] = [Math.abs(st.C50 - r.C50), st.waterC === null || r.waterC === null ? null : Math.abs(st.waterC - r.waterC), Math.abs(st.subjC - r.subjC)];
  const def = cs.filter((x): x is number => x !== null);
  return { d: swd(lab, p.ref), hue: wh === null || p.refHue === null ? null : hueDiff(wh, p.refHue), c: def.reduce((a, b) => a + b, 0) / def.length, cs };
}
const cost = (s: Score[], ps: Pair[]) => s.reduce((a, x, i) => a + x.d + REG * (x.hue ?? 0) / 10 + CREG * x.c / 10 + HOLD * Math.max(0, x.d - ps[i].d0), 0) / s.length;
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);

function descend(pairs: Pair[], grid: [string, number[]][], log: boolean): number {
  let best = cost(pairs.map(scoreOf), pairs);
  for (let r = 0; r < ROUNDS; r++) {
    let moved = false;
    for (const [key, cands] of grid) {
      const cur = get(key);
      let bv = cur;
      for (const v of cands) {
        if (Math.abs(v - cur) < 1e-9) continue;
        set(key, v);
        const c = cost(pairs.map(scoreOf), pairs);
        if (c < best - 0.01) { best = c; bv = v; }
      }
      set(key, bv);
      if (bv !== cur) moved = true;
      if (log) process.stderr.write(`  round ${r + 1} ${key} = ${bv}  cost ${best.toFixed(3)}\n`);
    }
    if (!moved) break;
  }
  return best;
}

const pairs = await load();
{
  const base = opt("hold-base", "WATER_HUE.amount=0").split(",").filter(Boolean).map((kv) => { const [k, v] = kv.split("="); return [k, parseFloat(v), get(k)] as const; });
  for (const [k, v] of base) set(k, v);
  for (const p of pairs) p.d0 = scoreOf(p).d;
  for (const [k, , was] of base) set(k, was);
}
for (const kv of opt("set", "").split(",").filter(Boolean)) { const [k, v] = kv.split("="); set(k, parseFloat(v)); }
const grid: [string, number[]][] = opt("fit", "").split(",").filter(Boolean).map((kv) => { const [k, v] = kv.split("="); return [k, v.split("/").map(Number)]; });
const start = grid.map(([k]) => get(k));
const report = (label: string) => {
  const s = pairs.map(scoreOf);
  console.log(`${label}: mean ${mean(s.map((x) => x.d)).toFixed(2)}  hue err ${mean(s.filter((x) => x.hue !== null).map((x) => x.hue!)).toFixed(1)}°  chroma err median ${mean(s.map((x) => x.cs[0])).toFixed(1)} water ${mean(s.filter((x) => x.cs[1] !== null).map((x) => x.cs[1]!)).toFixed(1)} warm ${mean(s.map((x) => x.cs[2])).toFixed(1)}  | ${pairs.map((p, i) => `${p.name.slice(0, 8)} ${s[i].d.toFixed(1)}`).join("  ")}`);
  return s;
};
report("start");
if (grid.length) {
  descend(pairs, grid, true);
  const fitted = grid.map(([k]) => get(k));
  console.log(`fitted: ${grid.map(([k], i) => `${k}=${fitted[i]}`).join(",")}`);
  const full = report("fit (in-sample)");
  if (args.includes("--loo")) {
    const held: number[] = [], heldHue: number[] = [];
    for (let i = 0; i < pairs.length; i++) {
      grid.forEach(([k], j) => set(k, start[j]));
      descend(pairs.filter((_, j) => j !== i), grid, false);
      const s = scoreOf(pairs[i]);
      held.push(s.d); if (s.hue !== null) heldHue.push(s.hue);
      console.log(`  held out ${pairs[i].name.padEnd(20)} ${s.d.toFixed(2)} (in-sample ${full[i].d.toFixed(2)})  ${grid.map(([k]) => `${k.split(".")[1]}=${get(k)}`).join(" ")}`);
    }
    console.log(`LOO mean ${mean(held).toFixed(2)} (in-sample ${mean(full.map((x) => x.d)).toFixed(2)})  LOO hue err ${mean(heldHue).toFixed(1)}°`);
    grid.forEach(([k], j) => set(k, fitted[j]));
  }
}
