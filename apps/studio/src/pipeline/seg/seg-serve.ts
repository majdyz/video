// AI subject detection worker body: onnxruntime-web (WebGPU when the device has it, else WASM) + EdgeTAM sessions.
// Requests carry an id; every reply echoes it ({ id, ok, ... } or { id, error }). Two entries run it, each with one
// runtime build imported statically (seg-worker.ts: the WebGPU build; seg-worker-wasm.ts: the plain WASM one).
import { wasmHeapMB } from "./wasm-heap.ts";
import type * as OrtNS from "onnxruntime-web";
import { EdgeTam, type BankParams, type GraphName } from "./edgetam.ts";
import { SegSession } from "./session.ts";
import { openSessionFrames } from "./frames.ts";
import type { SegObject } from "./track.ts";

type Req =
  | { id: number; type: "init"; models: Record<GraphName, ArrayBuffer>; bank: BankParams; threads: number; prefer: "auto" | "wasm"; lite?: boolean; debug?: boolean }
  | { id: number; type: "encode"; rgba: ArrayBuffer }
  | { id: number; type: "step"; key: string; frame: number; points: [number, number][] | null; labels: number[] | null; reverse: boolean }
  | { id: number; type: "drop"; key: string }
  // The background session (session.ts): the clip's own decoder, objects, per-frame masks posted as events.
  | { id: number; type: "session-open"; file: File; start: number; end: number }
  | { id: number; type: "session-add"; object: SegObject & { id: number } }
  | { id: number; type: "session-remove"; object: number }
  | { id: number; type: "session-restore"; object: number }
  | { id: number; type: "session-exclude"; object: number; t: number; u: number; v: number }
  | { id: number; type: "session-close" }
  | { id: number; type: "session-busy" }
  | { id: number; type: "session-autoseeds"; t: number }
  | { id: number; type: "session-seeds"; t: number; objects: (SegObject & { id: number })[] };

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

/**
 * Answers the main thread's requests with `ort` (the entry's runtime build; `webgpu`: it has the WebGPU provider).
 * onnxruntime-web's bundled build starts its WASM threads as copies of the module it is in, the worker entry (named
 * "em-pthread"): those keep emscripten's own message handler, or the session never starts. The runtime stays in the
 * entry's chunk (a runtime chunk of its own imported by the threads failed to load in WebKit under COEP).
 */
export function serve(ort: typeof OrtNS, webgpu: boolean): void {
  if ((self as unknown as { name?: string }).name === "em-pthread") return;
  self.onmessage = (ev: MessageEvent<Req>) => handle(ort, webgpu, ev.data);
  // A rejection nobody handles would vanish (worker.onerror does not fire for it): it goes to the breadcrumbs.
  self.addEventListener("unhandledrejection", (ev) => {
    const why = (ev as PromiseRejectionEvent).reason;
    emit({ ev: "trace", msg: `unhandled: ${String(why instanceof Error ? why.message : why).slice(0, 120)} · heap ${wasmHeapMB()} MB` });
  });
}

/**
 * The model's stage hook: the first graph runs go to the breadcrumbs with the heap (an iPhone died two steps into a
 * pass). Made here, at module level, on purpose: the hook lives as long as the model, and a closure made inside
 * handle() keeps that call's request alive with it (closures of one scope share its variables, and `post` there
 * holds `r`): for the init request that is the four model files, 33 MB the runtime has already copied into its heap.
 */
function stageTracer(debug: boolean): (stage: string) => void {
  let stages = 0;
  return (st) => {
    const mb = wasmHeapMB();
    if (debug) console.info(`[seg] heap ${mb} MB after ${st}`);
    if (session && stages++ < 10) emit({ ev: "trace", msg: `${st} · heap ${mb} MB` });
  };
}

async function handle(ort: typeof OrtNS, webgpu: boolean, r: Req): Promise<void> {
  const post = (m: object, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage({ id: r.id, ...m }, transfer);
  try {
    if (r.type === "init") {
      const gpu = r.prefer === "wasm" || !webgpu ? { ok: false, f16: false } : await webgpuInfo();
      // The WASM binary is the asset the bundler emits next to the worker (assets/, service-worker cached).
      ort.env.wasm.numThreads = r.threads;
      ort.env.logLevel = "error";
      const eps = gpu.ok ? ["webgpu", "wasm"] : ["wasm"];
      const m = Object.fromEntries(Object.entries(r.models).map(([k, v]) => [k, new Uint8Array(v)])) as Record<GraphName, Uint8Array>;
      const failed: string[] = [];
      model = await EdgeTam.create(ort, m, r.bank, eps, failed, !!r.lite);
      model.onStage = stageTracer(!!r.debug);
      post({ ok: true, heapMB: wasmHeapMB(), ep: model.ep, tried: eps, failed, webgpu: gpu.ok, f16: gpu.f16, threads: ort.env.wasm.numThreads, coi: typeof crossOriginIsolated !== "undefined" && crossOriginIsolated });
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
        progress: (done, total) => emit({ ev: "progress", done, total, heapMB: wasmHeapMB() }),
        idle: (profile) => emit({ ev: "idle", profile: { ...profile, heapMB: wasmHeapMB() } }),
        needSeeds: (k, t) => emit({ ev: "seeds", k, t }),
        rejected: (id) => emit({ ev: "rejected", id }),
        // The pass threw (session.ts run): the main thread shows it and shuts this worker down.
        error: (msg) => { if (session === s) session = null; emit({ ev: "error", msg, heapMB: wasmHeapMB() }); },
        // Each breadcrumb carries the WASM heap (it only grows: the step that took it past the phone's limit shows).
        trace: (msg) => emit({ ev: "trace", msg: `${msg} · heap ${wasmHeapMB()} MB` }),
      });
      session = s;
      post({ ok: true, width: frames.width, height: frames.height, mw: s.mw, mh: s.mh, i0: s.grid.i0, n: s.grid.n });
    } else if (r.type === "session-busy") {
      post({ ok: true, busy: !!session?.busy });
    } else if (r.type === "session-close") {
      session?.close();
      session = null;
      post({ ok: true });
    } else if (!session) {
      throw new Error("no session");
    } else if (r.type === "session-autoseeds") {
      post({ ok: true, objects: await session.autoSeeds(r.t) });
    } else if (r.type === "session-seeds") {
      session.seeds(r.t, r.objects);
      post({ ok: true });
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
}
