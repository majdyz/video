// Seg eval page (run-eval.mjs drives it headless): the app's own AI subject detection code (worker,
// onnxruntime-web, EdgeTAM bank, track pass, per-frame fill and feather) on a prototype clip, with the prototype's
// prompts. Frames come from the runner (/evaldata); masks, timings and (robust=1) renders go back to it.
import { WorkerSegModel } from "../../src/pipeline/seg/model.ts";
import { maskSize, runPass, SEG, type Keyframe, type SegObject } from "../../src/pipeline/seg/track.ts";

const q = new URLSearchParams(location.search);
const clip = q.get("clip")!;
const W = +q.get("w")!, H = +q.get("h")!, T = +q.get("frames")!;
const objects = JSON.parse(q.get("objects")!) as SegObject[];
const prefer = (q.get("prefer") ?? "auto") as "auto" | "wasm";
// ?segfps=4: another keyframe rate (speed vs quality).
if (q.get("segfps")) SEG.fps = +q.get("segfps")!;
const logEl = document.getElementById("log")!;
const log = (s: string) => { logEl.textContent += "\n" + s; console.log(s); };

const [mw, mh] = maskSize(W, H);
const big = document.createElement("canvas"); big.width = 1024; big.height = 1024;
const small = document.createElement("canvas"); small.width = mw; small.height = mh;
const bctx = big.getContext("2d", { willReadFrequently: true })!, mctx = small.getContext("2d", { willReadFrequently: true })!;

/** Frame i of the clip (640 px, from the prototype's cache) on a canvas. */
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

async function frame(i: number, lumaOnly = false) {
  const src = await frameCanvas(i);
  mctx.imageSmoothingQuality = "high";
  mctx.drawImage(src, 0, 0, mw, mh);
  const m = mctx.getImageData(0, 0, mw, mh).data, luma = new Uint8Array(mw * mh);
  for (let k = 0; k < mw * mh; k++) luma[k] = Math.round(0.299 * m[k * 4] + 0.587 * m[k * 4 + 1] + 0.114 * m[k * 4 + 2]);
  if (lumaOnly) return { luma, rgb: m };
  bctx.imageSmoothingQuality = "high";
  bctx.drawImage(src, 0, 0, 1024, 1024);
  return { rgba1024: bctx.getImageData(0, 0, 1024, 1024).data, luma, rgb: m };
}

const post = (name: string, body: Blob | Uint8Array) => fetch(`/evaldata/out?clip=${clip}&name=${name}`, { method: "POST", body: body as BodyInit }).then(() => undefined);

(async () => {
  try {
    const model = new WorkerSegModel();
    const info = await model.load(undefined, { prefer });
    log(`model ${JSON.stringify(info)} coi=${crossOriginIsolated}`);
    const enc: number[] = [], step: number[] = [];
    const t0 = performance.now();
    let K: Keyframe[] = [];
    let mlMs = 0;
    const source = (t: number, lumaOnly?: boolean) => frame(Math.min(T - 1, Math.round(t * 30)), lumaOnly);
    const track = await runPass({
      objects, start: 0, end: (T - 1) / 30, width: W, height: H, model, source,
      onTiming: (s) => { if (s.encodeMs > 1) enc.push(s.encodeMs); step.push(s.stepMs); },
      onKeyframes: (k) => { K = k.map((x) => ({ ...x, inc: x.inc.slice(), exc: x.exc?.slice() ?? null })); mlMs = performance.now() - t0; },
      onProgress: (d, n) => { if (Math.floor(d) % 10 === 0 && d === Math.floor(d)) log(`pass ${d}/${n.toFixed(0)} ${((performance.now() - t0) / 1000).toFixed(0)} s`); },
    });
    const passMs = performance.now() - t0;
    if (!track) throw new Error("cancelled");
    const alpha = new Uint8Array(T * mw * mh), raw = new Uint8Array(T * mw * mh), weight: number[] = [];
    const tr = performance.now();
    for (let i = 0; i < T; i++) {
      const m = track.at(i / 30)!, r = track.rawAt(i / 30)!;
      for (let k = 0; k < mw * mh; k++) {
        alpha[i * mw * mh + k] = Math.round(255 * m.alpha[k]);
        raw[i * mw * mh + k] = Math.round(255 * Math.min(1, Math.max(0, r.inc[k] * (r.exc ? 1 - r.exc[k] : 1))));
      }
      weight.push(m.weight);
    }
    const renderMs = (performance.now() - tr) / T / 2;
    const med = (a: number[]) => a.length ? [...a].sort((x, y) => x - y)[a.length >> 1] : 0;
    // Per keyframe: one encode, then one tracker step per subject (memory attention + decoder + memory encoder).
    const keys = track.keys.map((k) => ({ t: k.t, conf: +k.conf.toFixed(3), reprompts: k.reprompts, score: +k.score.toFixed(2) }));
    const meta = { clip, mw, mh, T, info, passMs, mlMs, fillMs: passMs - mlMs, encodeMedMs: med(enc), stepMedMs: med(step), renderMsPerFrame: renderMs, keyframes: track.keys.length, reprompts: keys.reduce((s, k) => s + k.reprompts, 0), trackBytes: track.bytes, weight, keys };
    await post("alpha", alpha);
    await post("raw", raw);
    await post("meta", new TextEncoder().encode(JSON.stringify(meta)));
    log(`PASS ${JSON.stringify({ passMs, mlMs, encodeMedMs: meta.encodeMedMs, stepMedMs: meta.stepMedMs, renderMs, keyframes: meta.keyframes, reprompts: meta.reprompts })}`);
    model.dispose();
    if (q.get("robust") === "1") {
      const { robustness } = await import("./robust.ts");
      const r = await robustness({ clip, W, H, T, mw, mh, K, clean: track, source, frame: frameCanvas, post, log });
      await post("robust", new TextEncoder().encode(JSON.stringify(r)));
      log(`ROBUST ${JSON.stringify(r)}`);
    }
    log("DONE");
  } catch (e) {
    log("ERROR " + (e instanceof Error ? e.stack ?? e.message : String(e)));
  }
})();
