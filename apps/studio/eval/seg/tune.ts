// Subject pop tuning page (run-eval.mjs TUNE=1 drives it headless): the real colour engine (GradeEngine, Vivid on, as
// the studio ships) grades frames of a clip with the ML masks of an earlier eval run (<clip>.raw.u8 + meta: the
// keyframes, filled again by the app's own fill), Subject pop off and on at several Strengths, and measures:
//   separation  the subject (mask > 0.6) against the water right around it (a ring 3 px .. 8% of the subject's
//               diagonal out, mask < 0.05): CIE76 ΔE between their mean colours and their L difference;
//   guards      the subject's L spread, high-pass energy and chroma spread against the source (robust.ts guard);
//   edge        the pop's own change (on vs off) and its spatial step (ΔE per pixel, p99.9): a hard edge shows here.
import "./tune-sp.ts";
import { GradeEngine } from "../../../aqua-fix/src/engine/engine.ts";
import { DEFAULT_SETTINGS, type UserSettings } from "../../../aqua-fix/src/engine/params.ts";
import { fillTrack, maskSize, type Keyframe } from "../../src/pipeline/seg/track.ts";
import { bbox, dilate } from "../../src/pipeline/seg/mask.ts";
import { deltaE, guard, lab, stats } from "./robust.ts";

const q = new URLSearchParams(location.search);
const clip = q.get("clip")!;
const W = +q.get("w")!, H = +q.get("h")!, T = +q.get("frames")!;
const strengths = (q.get("strengths") ?? "0,0.25,0.5,0.75,1").split(",").map(Number);
const boardf = (q.get("boardf") ?? "30,90,150").split(",").map(Number).filter((f) => f < T);
const logEl = document.getElementById("log")!;
const log = (s: string) => { logEl.textContent += "\n" + s; console.log(s); };
const [mw, mh] = maskSize(W, H);
const small = document.createElement("canvas"); small.width = mw; small.height = mh;
const mctx = small.getContext("2d", { willReadFrequently: true })!;

async function frameCanvas(i: number): Promise<HTMLCanvasElement> {
  const r = await fetch(`/evaldata/frame?clip=${clip}&i=${i}`);
  const rgb = new Uint8Array(await r.arrayBuffer());
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  const img = ctx.createImageData(W, H);
  for (let k = 0; k < W * H; k++) { img.data[k * 4] = rgb[k * 3 + 2]; img.data[k * 4 + 1] = rgb[k * 3 + 1]; img.data[k * 4 + 2] = rgb[k * 3]; img.data[k * 4 + 3] = 255; }
  ctx.putImageData(img, 0, 0);
  return c;
}
async function frame(i: number) {
  const src = await frameCanvas(i);
  mctx.imageSmoothingQuality = "high";
  mctx.drawImage(src, 0, 0, mw, mh);
  const m = mctx.getImageData(0, 0, mw, mh).data, luma = new Uint8Array(mw * mh);
  for (let k = 0; k < mw * mh; k++) luma[k] = Math.round(0.299 * m[k * 4] + 0.587 * m[k * 4 + 1] + 0.114 * m[k * 4 + 2]);
  return { luma, rgb: m };
}
const post = (name: string, body: Blob | Uint8Array) => fetch(`/evaldata/out?clip=${clip}&name=${name}`, { method: "POST", body: body as BodyInit }).then(() => undefined);

/** Subject (mask > 0.6) vs the water ring around it: mean-colour ΔE76 and L difference. */
function separation(px: Uint8ClampedArray, mk: Float32Array) {
  const b = bbox(mk, W, H);
  if (!b) return null;
  const diag = Math.hypot(b.x1 - b.x0, b.y1 - b.y0);
  const bin = Float32Array.from(mk, (x) => (x > 0.3 ? 1 : 0));
  const outer = dilate(bin, W, H, Math.max(6, Math.round(0.08 * diag))), inner = dilate(bin, W, H, 3);
  const acc = { s: [0, 0, 0, 0], r: [0, 0, 0, 0] };
  for (let i = 0; i < W * H; i++) {
    const k = mk[i] > 0.6 ? acc.s : outer[i] > 0 && inner[i] === 0 && mk[i] < 0.05 ? acc.r : null;
    if (!k) continue;
    const l = lab(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
    k[0] += l[0]; k[1] += l[1]; k[2] += l[2]; k[3]++;
  }
  if (acc.s[3] < 50 || acc.r[3] < 50) return null;
  const ms = acc.s.slice(0, 3).map((x) => x / acc.s[3]), mr = acc.r.slice(0, 3).map((x) => x / acc.r[3]);
  return { de: Math.hypot(ms[0] - mr[0], ms[1] - mr[1], ms[2] - mr[2]), dL: ms[0] - mr[0], Ls: ms[0], Lr: mr[0] };
}

(async () => {
  try {
    const meta = await (await fetch(`/evaldata/file?name=${clip}.meta.json`)).json();
    const raw = new Uint8Array(await (await fetch(`/evaldata/file?name=${clip}.raw.u8`)).arrayBuffer());
    if (meta.mw !== mw || meta.mh !== mh) throw new Error(`mask grid ${meta.mw}x${meta.mh} != ${mw}x${mh}`);
    const n = mw * mh;
    const K: Keyframe[] = [];
    for (const k of meta.keys as { t: number; conf: number }[]) {
      const i = Math.min(T - 1, Math.round(k.t * 30));
      const f = await frame(i);
      K.push({ t: k.t, inc: Float32Array.from(raw.subarray(i * n, (i + 1) * n), (x) => x / 255), exc: null, luma: Float32Array.from(f.luma, (x) => x / 255), rgb: f.rgb, conf: k.conf, reprompts: 0, score: 0 });
    }
    const track = (await fillTrack(K, mw, mh, async (t) => frame(Math.min(T - 1, Math.round(t * 30)))))!;
    log(`track ${K.length} keyframes`);
    const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
    const engine = await GradeEngine.create(canvas, (e) => log("engine error " + e.message), false);
    const read = document.createElement("canvas"); read.width = W; read.height = H;
    const rctx = read.getContext("2d", { willReadFrequently: true })!;
    const base: UserSettings = { ...DEFAULT_SETTINGS, vivid: 1 };
    const render = async (t: number, s: UserSettings, ml: boolean) => {
      engine.settings = s;
      const ov = ml ? track.at(t) : null;
      engine.setSegOverlay(ov ? { width: ov.width, height: ov.height, alpha: ov.alpha, exclude: ov.exclude, near: ov.near, depart: ov.depart } : null);
      const vf = await engine.renderToFrame(0, Math.round(t * 1e6), 33_333);
      rctx.drawImage(vf, 0, 0, W, H);
      vf.close();
      return rctx.getImageData(0, 0, W, H).data;
    };
    const png = async (name: string, px: Uint8ClampedArray) => {
      const c = document.createElement("canvas"); c.width = W; c.height = H;
      c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(px), W, H), 0, 0);
      await post(name, await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/png")));
    };
    type Row = { f: number; s: number | "off"; de: number; dL: number; Ls: number; Lr: number; lStdRatio?: number; hpRatio?: number; cStdRatio?: number; popDE?: number; stepP999?: number };
    const rows: Row[] = [];
    for (const f of boardf) {
      const t = f / 30;
      const src = await frameCanvas(f);
      const sc = src.getContext("2d")!.getImageData(0, 0, W, H).data;
      engine.upload(src, W, H, 0);
      engine.setTime(t);
      engine.settings = { ...base, subjectPop: true };
      await engine.analyzeNow(true);
      const m = track.at(t);
      if (!m) continue;
      const mk = new Float32Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) mk[y * W + x] = m.alpha[Math.min(m.height - 1, Math.floor((y / H) * m.height)) * m.width + Math.min(m.width - 1, Math.floor((x / W) * m.width))];
      const off = await render(t, { ...base, subjectPop: false }, false);
      await png(`tune-src_${f}`, sc);
      await png(`tune-off_${f}`, off);
      const so = separation(off, mk);
      if (so) rows.push({ f, s: "off", ...so, ...(guard(sc, off, mk, W, H) ?? {}) });
      for (const st of strengths) {
        const on = await render(t, { ...base, subjectPop: true, subjectPopStrength: st }, true);
        await png(`tune-on${st}_${f}`, on);
        const sp = separation(on, mk);
        const g = guard(sc, on, mk, W, H);
        const d = stats(deltaE(on, off, W * H), W, H);
        if (sp) rows.push({ f, s: st, ...sp, ...(g ?? {}), popDE: d.p99, stepP999: d.stepP999 });
      }
      log(`frame ${f} done`);
    }
    // Per setting: means over the frames.
    const keys = ["off", ...strengths] as (number | "off")[];
    const summary = keys.map((k) => {
      const r = rows.filter((x) => x.s === k);
      const m = (f: (x: Row) => number | undefined) => r.length ? r.reduce((s, x) => s + (f(x) ?? 0), 0) / r.length : 0;
      return { s: k, sepDE: +m((x) => x.de).toFixed(2), dL: +m((x) => x.dL).toFixed(2), lStdRatio: +m((x) => x.lStdRatio).toFixed(3), hpRatio: +m((x) => x.hpRatio).toFixed(3), cStdRatio: +m((x) => x.cStdRatio).toFixed(3), popP99DE: +m((x) => x.popDE).toFixed(2), stepP999: +m((x) => x.stepP999).toFixed(3) };
    });
    await post("tune", new TextEncoder().encode(JSON.stringify({ clip, summary, rows }, null, 1)));
    log(`TUNE ${JSON.stringify(summary)}`);
    engine.dispose();
    log("DONE");
  } catch (e) {
    log("ERROR " + (e instanceof Error ? e.stack ?? e.message : String(e)));
  }
})();
