// AI subject detection, model side on the main thread: lazy download of the EdgeTAM files (Cache Storage, with
// progress), the worker that runs them, and the SegModel the track pass talks to. Nothing here runs until the
// user turns "AI subject detection" on.
import type { GraphName } from "./edgetam.ts";
import type { SegModel, SegObject, StepResult } from "./track.ts";
import type { SessionFrameOut } from "./session.ts";
import type { SeedCandidate } from "./seeds.ts";
import { deviceFacts, segThreads } from "../device.ts";

/** Background-session events from the worker (session.ts). */
export type SessionEvent =
  | { ev: "frames"; items: SessionFrameOut[] }
  | { ev: "keys"; conf: { t: number; conf: number }[] }
  | { ev: "progress"; done: number; total: number; taps?: number; heapMB?: number }
  | { ev: "idle"; profile: Record<string, number> }
  | { ev: "seeds"; k: number; t: number; search?: boolean }
  | { ev: "rejected"; id: number }
  /** The playhead's look (session.ts focus) at keyframe k0: taken up, following subjects, or found none. */
  | { ev: "peek"; k0: number; state: "looking" | "following" | "none" }
  /** The pass threw in the worker and stopped for good (session.ts fail). */
  | { ev: "error"; msg: string; heapMB?: number }
  | { ev: "trace"; msg: string };
export type SessionInfo = { width: number; height: number; mw: number; mh: number; i0: number; n: number };

export type SegManifest = { model: string; source: string; files: Record<string, { bytes: number; sha256: string }> };
/** heapMB: onnxruntime-web's WASM heap once the graphs are loaded (wasm-heap.ts). */
export type SegLoadInfo = { ep: string; f16: boolean; threads: number; loadMs: number; bytes: number; heapMB: number };

const CACHE = "deepfix-seg-v1";
const GRAPH_FILES: GraphName[] = ["vision_encoder", "mask_decoder", "memory_attention", "memory_encoder"];

/** Where the model files are served (the build copies them to <base>seg/). */
export function segBase(): string {
  return `${import.meta.env.BASE_URL}seg/`;
}

/** `?debug=1`: segmentation logs (load, timing, fallbacks). */
export function segDebug(): boolean {
  try {
    return new URLSearchParams(location.search).get("debug") === "1";
  } catch {
    return false;
  }
}
/** `?segfps=N`: a fixed keyframe rate for the session (no adaptive extra keyframes), to compare speeds and masks. */
export function segFps(): number | undefined {
  try {
    const n = Number(new URLSearchParams(location.search).get("segfps"));
    return Number.isFinite(n) && n >= 1 && n <= 8 ? n : undefined;
  } catch {
    return undefined;
  }
}
/** `?seggrid=1`: the model's blind grid also while a subject is followed surely (session.ts gridAlways). */
export function segGridAlways(): boolean {
  try {
    return new URLSearchParams(location.search).get("seggrid") === "1";
  } catch {
    return false;
  }
}
/** `?segstride=0 | 1`: the stride for small subjects (session.ts strideAt) off / on; without it, by the model. */
export function segStride(): boolean | undefined {
  try {
    const v = new URLSearchParams(location.search).get("segstride");
    return v === "0" ? false : v === "1" ? true : undefined;
  } catch {
    return undefined;
  }
}
export function segLog(...a: unknown[]): void {
  if (segDebug()) console.info("[seg]", ...a);
}

async function fetchCached(url: string, key: string, onBytes: (n: number) => void): Promise<ArrayBuffer> {
  let cache: Cache | null = null;
  try {
    cache = await caches.open(CACHE);
    const hit = await cache.match(key);
    if (hit) {
      const b = await hit.arrayBuffer();
      onBytes(b.byteLength);
      return b;
    }
  } catch {
    cache = null; // no Cache Storage (private mode, file://): download every time
  }
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`${url}: HTTP ${res.status}`);
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    n += value.byteLength;
    onBytes(value.byteLength);
  }
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.byteLength; }
  if (cache) await cache.put(key, new Response(out.slice().buffer)).catch(() => undefined);
  return out.buffer;
}

/** Drops cached model files of other versions (a new manifest hash). */
async function pruneCache(keep: Set<string>): Promise<void> {
  try {
    const c = await caches.open(CACHE);
    for (const req of await c.keys()) if (!keep.has(req.url)) await c.delete(req);
  } catch { /* none */ }
}

export class WorkerSegModel implements SegModel {
  private w: Worker;
  private seq = 0;
  private waiting = new Map<number, { res: (v: Record<string, unknown>) => void; rej: (e: Error) => void }>();
  info: SegLoadInfo | null = null;
  /** Background-session events (frames, keyframe confidences, progress, idle). */
  onEvent: ((e: SessionEvent) => void) | null = null;

  /** wasm: the worker with the plain WASM runtime, no WebGPU (seg-worker-wasm.ts; WebKit). */
  constructor(wasm = false) {
    this.w = wasm
      ? new Worker(new URL("./seg-worker-wasm.ts", import.meta.url), { type: "module" })
      : new Worker(new URL("./seg-worker.ts", import.meta.url), { type: "module" });
    this.w.onmessage = (ev: MessageEvent<Record<string, unknown> & { id: number; error?: string }>) => {
      if (ev.data.type === "ev") { this.onEvent?.(ev.data as unknown as SessionEvent); return; }
      const p = this.waiting.get(ev.data.id);
      if (!p) return;
      this.waiting.delete(ev.data.id);
      if (ev.data.error) p.rej(new Error(ev.data.error));
      else p.res(ev.data);
    };
    this.w.onerror = (e) => {
      for (const p of this.waiting.values()) p.rej(new Error(e.message || "segmentation worker failed"));
      this.waiting.clear();
      // The worker itself fell over (a script error, the runtime aborting): the session is gone with it.
      this.onEvent?.({ ev: "error", msg: e.message || "segmentation worker failed" });
    };
  }

  private call(msg: Record<string, unknown>, transfer: Transferable[] = []): Promise<Record<string, unknown>> {
    const id = ++this.seq;
    return new Promise((res, rej) => {
      this.waiting.set(id, { res, rej });
      this.w.postMessage({ id, ...msg }, transfer);
    });
  }

  /** Downloads (or reads from the cache) and starts the model. `onProgress` gets 0..1 of the download. */
  /** opts.threads: that many WASM threads whatever the device (the retry after a failed start: load-retry.ts). */
  async load(onProgress?: (p: number) => void, opts: { prefer?: "auto" | "wasm"; base?: string; lite?: boolean; threads?: number } = {}): Promise<SegLoadInfo> {
    const t0 = performance.now();
    const base = opts.base ?? segBase();
    const man = await (await fetch(`${base}manifest.json`, { cache: "no-cache" })).json() as SegManifest;
    // Lite: the 512-px vision encoder (a quarter of the activation memory; iPhone WebKit ran out with the 1024 one).
    const lite = !!opts.lite && !!man.files["vision_encoder_lite.onnx"];
    const fileOf = (g: GraphName) => (lite && g === "vision_encoder" ? "vision_encoder_lite" : g);
    const total = GRAPH_FILES.reduce((s, g) => s + (man.files[`${fileOf(g)}.onnx`]?.bytes ?? 0), 0) || 1;
    let got = 0;
    const keys = new Set<string>();
    const tick = (n: number) => { got += n; onProgress?.(Math.min(1, got / total)); };
    const models = {} as Record<GraphName, ArrayBuffer>;
    for (const g of GRAPH_FILES) {
      const f = man.files[`${fileOf(g)}.onnx`];
      if (!f) throw new Error(`manifest has no ${g}`);
      const url = new URL(`${base}${fileOf(g)}.onnx?v=${f.sha256.slice(0, 16)}`, location.href).href;
      keys.add(url);
      models[g] = await fetchCached(url, url, tick);
    }
    void pruneCache(keys);
    const bank = await (await fetch(`${base}bank.json?v=${man.files["bank.json"]?.sha256.slice(0, 16) ?? "0"}`)).json();
    // One thread on iOS, up to four elsewhere when isolated (device.ts segThreads; `?segthreads=N` to measure).
    const threads = opts.threads && opts.threads > 0 ? opts.threads : segThreads(deviceFacts(), Number(new URLSearchParams(location.search).get("segthreads")) || null);
    const r = await this.call({ type: "init", models, bank, threads, prefer: opts.prefer ?? "auto", lite, debug: segDebug() }, Object.values(models));
    this.info = { ep: String(r.ep) + (lite ? " lite" : ""), f16: !!r.f16, threads: Number(r.threads), loadMs: performance.now() - t0, bytes: total, heapMB: Number(r.heapMB ?? 0) };
    segLog(`model ready on ${this.info.ep} (tried ${(r.tried as string[]).join(", ")}; WebGPU adapter ${r.webgpu ? "yes" : "no"}, shader-f16 ${r.f16 ? "yes" : "no"}; WASM threads ${this.info.threads}, cross-origin isolated ${r.coi ? "yes" : "no"})`, this.info);
    for (const f of r.failed as string[]) segLog("execution provider skipped:", f);
    return this.info;
  }

  async encode(rgba: Uint8ClampedArray): Promise<void> {
    const copy = rgba.slice();
    await this.call({ type: "encode", rgba: copy.buffer }, [copy.buffer]);
  }

  async step(key: string, frame: number, points: [number, number][] | null, labels: number[] | null, reverse: boolean): Promise<StepResult> {
    const r = await this.call({ type: "step", key, frame, points, labels, reverse });
    return { logits: r.logits as Float32Array, lw: Number(r.lw), lh: Number(r.lh), score: Number(r.score), iou: Number(r.iou) };
  }

  async drop(key: string): Promise<void> {
    await this.call({ type: "drop", key });
  }

  // ------------------------------------------------------------------ background session (session.ts)

  /** fps: keyframes a second, fixed (`?segfps=N`); without it the session picks by the model (session.ts). */
  /** autoCap: the engine's own subjects followed at a time (a phone: SEG.liteAutos whatever the model). */
  /** weak: a phone short of memory (device.ts isWeakDevice): the session keeps less (session.ts SessionOptions.weak). */
  /** (`?segstride=0 | 1`: small subjects at every regular keyframe / at every other one, whatever the model;
   * `?seggrid=1`: the blind grid at every regular look, as before.) */
  async sessionOpen(file: File, start: number, end: number, fps?: number, autoCap?: number, weak?: boolean): Promise<SessionInfo> {
    return (await this.call({ type: "session-open", file, start, end, fps, autoCap, weak, stride: segStride(), gridAlways: segGridAlways() })) as unknown as SessionInfo;
  }

  /** Playhead first (session.ts focus): the subjects of the paused frame at t, followed ahead of the pass. */
  /** Null: not taken (the pass is there, or that keyframe was looked at); else the keyframe the look is made at. */
  async sessionFocus(t: number, objects: SegObject[], search: boolean): Promise<{ k0: number } | null> {
    const r = await this.call({ type: "session-focus", t, objects, search });
    return r.taken ? { k0: Number(r.k0) } : null;
  }

  async sessionAdd(object: SegObject & { id: number }): Promise<number> {
    return Number((await this.call({ type: "session-add", object })).t);
  }

  /** The seeds of the segment starting at t (the engine's own subjects on its canonical frame; may be none). */
  async sessionSeeds(t: number, objects: (SegObject & { id: number })[]): Promise<void> {
    await this.call({ type: "session-seeds", t, objects });
  }

  /** Subjects the model finds by itself on frame t (session.ts autoSeeds). */
  async sessionAutoSeeds(t: number, regions: readonly SeedCandidate[] = [], grid = true): Promise<SegObject[]> {
    return ((await this.call({ type: "session-autoseeds", t, regions, grid })).objects as SegObject[]) ?? [];
  }

  async sessionRemove(object: number): Promise<void> {
    await this.call({ type: "session-remove", object });
  }

  async sessionRestore(object: number): Promise<void> {
    await this.call({ type: "session-restore", object });
  }

  async sessionExclude(object: number, t: number, u: number, v: number): Promise<{ action: "removed"; removed: number } | { action: "part" | "exclude" }> {
    return (await this.call({ type: "session-exclude", object, t, u, v })) as unknown as { action: "removed"; removed: number } | { action: "part" | "exclude" };
  }

  /** Whether the session still has work (answered in order with its events: an idle sent before this is seen first). */
  async sessionBusy(): Promise<boolean> {
    return !!(await this.call({ type: "session-busy" })).busy;
  }

  async sessionClose(): Promise<void> {
    await this.call({ type: "session-close" });
  }

  dispose(): void {
    this.w.terminate();
    for (const p of this.waiting.values()) p.rej(new Error("disposed"));
    this.waiting.clear();
  }
}
