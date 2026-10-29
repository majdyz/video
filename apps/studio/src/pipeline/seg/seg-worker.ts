// AI subject detection worker: onnxruntime-web (WebGPU when the device has it, else WASM) + EdgeTAM sessions.
// Requests carry an id; every reply echoes it ({ id, ok, ... } or { id, error }).
import * as ort from "onnxruntime-web/webgpu";
import { EdgeTam, type BankParams, type GraphName } from "./edgetam.ts";

type Req =
  | { id: number; type: "init"; models: Record<GraphName, ArrayBuffer>; bank: BankParams; wasmBase: string; threads: number; prefer: "auto" | "wasm" }
  | { id: number; type: "encode"; rgba: ArrayBuffer }
  | { id: number; type: "step"; key: string; frame: number; points: [number, number][] | null; labels: number[] | null; reverse: boolean }
  | { id: number; type: "drop"; key: string };

let model: EdgeTam | null = null;

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

self.onmessage = async (ev: MessageEvent<Req>) => {
  const r = ev.data;
  const post = (m: object, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage({ id: r.id, ...m }, transfer);
  try {
    if (r.type === "init") {
      ort.env.wasm.wasmPaths = r.wasmBase;
      ort.env.wasm.numThreads = r.threads;
      ort.env.logLevel = "error";
      const gpu = r.prefer === "wasm" ? { ok: false, f16: false } : await webgpuInfo();
      const eps = gpu.ok ? ["webgpu", "wasm"] : ["wasm"];
      const m = Object.fromEntries(Object.entries(r.models).map(([k, v]) => [k, new Uint8Array(v)])) as Record<GraphName, Uint8Array>;
      model = await EdgeTam.create(ort, m, r.bank, eps);
      post({ ok: true, ep: model.ep, f16: gpu.f16, threads: ort.env.wasm.numThreads });
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
    }
  } catch (e) {
    post({ error: e instanceof Error ? e.message : String(e) });
  }
};
