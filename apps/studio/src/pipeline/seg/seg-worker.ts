// AI subject detection worker: onnxruntime-web (WebGPU when the device has it, else WASM) + EdgeTAM sessions.
// Requests carry an id; every reply echoes it ({ id, ok, ... } or { id, error }).
import * as ort from "onnxruntime-web/webgpu";
import { EdgeTam, type BankParams, type GraphName } from "./edgetam.ts";
import { SegSession } from "./session.ts";
import { openSessionFrames } from "./frames.ts";
import type { SegObject } from "./track.ts";

type Req =
  | { id: number; type: "init"; models: Record<GraphName, ArrayBuffer>; bank: BankParams; threads: number; prefer: "auto" | "wasm" }
  | { id: number; type: "encode"; rgba: ArrayBuffer }
  | { id: number; type: "step"; key: string; frame: number; points: [number, number][] | null; labels: number[] | null; reverse: boolean }
  | { id: number; type: "drop"; key: string }
  // The background session (session.ts): the clip's own decoder, objects, per-frame masks posted as events.
  | { id: number; type: "session-open"; file: File; start: number; end: number }
  | { id: number; type: "session-add"; object: SegObject & { id: number } }
  | { id: number; type: "session-remove"; object: number }
  | { id: number; type: "session-restore"; object: number }
  | { id: number; type: "session-exclude"; object: number; t: number; u: number; v: number }
  | { id: number; type: "session-close" };

let model: EdgeTam | null = null;
let session: SegSession | null = null;
/** Session events (no request id): frames, keyframe confidences, progress, idle. */
const emit = (m: object, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage({ type: "ev", ...m }, transfer);

async function webgpuInfo(): Promise<{ ok: boolean; f16: boolean }> {
  const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<{ features: Set<string> } | null> } }).gpu;
  if (!gpu) return { ok: false, f16: false };
  try {
    const a = await gpu.requestAdapter();
    return { ok: !!a, f16: !!a?.features.has("shader-f16") };
  } catch {
    return { ok: false, f16: false };
  }
}

// onnxruntime-web's bundled build starts its WASM threads as copies of this very worker (named "em-pthread"); those
// must keep emscripten's own message handler, or the session never starts.
const isPthread = (self as unknown as { name?: string }).name === "em-pthread";

if (!isPthread) self.onmessage = async (ev: MessageEvent<Req>) => {
  const r = ev.data;
  const post = (m: object, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage({ id: r.id, ...m }, transfer);
  try {
    if (r.type === "init") {
      // The WASM binary is the asset the bundler emits next to this worker (assets/, service-worker cached).
      ort.env.wasm.numThreads = r.threads;
      ort.env.logLevel = "error";
      const gpu = r.prefer === "wasm" ? { ok: false, f16: false } : await webgpuInfo();
      const eps = gpu.ok ? ["webgpu", "wasm"] : ["wasm"];
      const m = Object.fromEntries(Object.entries(r.models).map(([k, v]) => [k, new Uint8Array(v)])) as Record<GraphName, Uint8Array>;
      const failed: string[] = [];
      model = await EdgeTam.create(ort, m, r.bank, eps, failed);
      post({ ok: true, ep: model.ep, tried: eps, failed, webgpu: gpu.ok, f16: gpu.f16, threads: ort.env.wasm.numThreads, coi: typeof crossOriginIsolated !== "undefined" && crossOriginIsolated });
    } else if (!model) {
      throw new Error("not initialised");
    } else if (r.type === "encode") {
      await model.encode(new Uint8ClampedArray(r.rgba));
      post({ ok: true });
    } else if (r.type === "step") {
      const s = await model.step(r.key, r.frame, r.points, r.labels, r.reverse);
      post({ ok: true, ...s }, [s.logits.buffer]);
    } else if (r.type === "drop") {
      model.drop(r.key);
      post({ ok: true });
    } else if (r.type === "session-open") {
      session?.close();
      const frames = await openSessionFrames(r.file);
      const s = new SegSession(model, frames, { start: r.start, end: r.end }, {
        frames: (items) => emit({ ev: "frames", items }, items.flatMap((x) => [x.alpha.buffer, x.nearQ.buffer, x.depQ.buffer, ...(x.excQ ? [x.excQ.buffer] : [])])),
        keys: (conf) => emit({ ev: "keys", conf }),
        progress: (done, total) => emit({ ev: "progress", done, total }),
        idle: () => emit({ ev: "idle" }),
        rejected: (id) => emit({ ev: "rejected", id }),
      });
      session = s;
      post({ ok: true, width: frames.width, height: frames.height, mw: s.mw, mh: s.mh, i0: s.grid.i0, n: s.grid.n });
    } else if (r.type === "session-close") {
      session?.close();
      session = null;
      post({ ok: true });
    } else if (!session) {
      throw new Error("no session");
    } else if (r.type === "session-add") {
      session.add(r.object);
      post({ ok: true, t: session.snap(r.object.t) });
    } else if (r.type === "session-remove") {
      session.remove(r.object);
      post({ ok: true });
    } else if (r.type === "session-restore") {
      session.restore(r.object);
      post({ ok: true });
    } else if (r.type === "session-exclude") {
      post({ ok: true, ...(await session.excludeAt(r.object, r.t, r.u, r.v)) });
    }
  } catch (e) {
    post({ error: e instanceof Error ? e.message : String(e) });
  }
};
