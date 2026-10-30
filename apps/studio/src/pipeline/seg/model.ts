// AI subject detection, model side on the main thread: lazy download of the EdgeTAM files (Cache Storage, with
// progress), the worker that runs them, and the SegModel the track pass talks to. Nothing here runs until the
// user turns "AI subject detection" on.
import type { GraphName } from "./edgetam.ts";
import type { SegModel, SegObject, StepResult } from "./track.ts";
import type { SessionFrameOut } from "./session.ts";

/** Background-session events from the worker (session.ts). */
export type SessionEvent =
  | { ev: "frames"; items: SessionFrameOut[] }
  | { ev: "keys"; conf: { t: number; conf: number }[] }
  | { ev: "progress"; done: number; total: number }
  | { ev: "idle" }
  | { ev: "rejected"; id: number };
export type SessionInfo = { width: number; height: number; mw: number; mh: number; i0: number; n: number };

export type SegManifest = { model: string; source: string; files: Record<string, { bytes: number; sha256: string }> };
export type SegLoadInfo = { ep: string; f16: boolean; threads: number; loadMs: number; bytes: number };

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

  constructor() {
    this.w = new Worker(new URL("./seg-worker.ts", import.meta.url), { type: "module" });
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
  async load(onProgress?: (p: number) => void, opts: { prefer?: "auto" | "wasm"; base?: string } = {}): Promise<SegLoadInfo> {
    const t0 = performance.now();
    const base = opts.base ?? segBase();
    const man = await (await fetch(`${base}manifest.json`, { cache: "no-cache" })).json() as SegManifest;
    const total = GRAPH_FILES.reduce((s, g) => s + (man.files[`${g}.onnx`]?.bytes ?? 0), 0) || 1;
    let got = 0;
    const keys = new Set<string>();
    const tick = (n: number) => { got += n; onProgress?.(Math.min(1, got / total)); };
    const models = {} as Record<GraphName, ArrayBuffer>;
    for (const g of GRAPH_FILES) {
      const f = man.files[`${g}.onnx`];
      if (!f) throw new Error(`manifest has no ${g}`);
      const url = new URL(`${base}${g}.onnx?v=${f.sha256.slice(0, 16)}`, location.href).href;
      keys.add(url);
      models[g] = await fetchCached(url, url, tick);
    }
    void pruneCache(keys);
    const bank = await (await fetch(`${base}bank.json?v=${man.files["bank.json"]?.sha256.slice(0, 16) ?? "0"}`)).json();
    const threads = typeof crossOriginIsolated !== "undefined" && crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
    const r = await this.call({ type: "init", models, bank, threads, prefer: opts.prefer ?? "auto" }, Object.values(models));
    this.info = { ep: String(r.ep), f16: !!r.f16, threads: Number(r.threads), loadMs: performance.now() - t0, bytes: total };
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

  async sessionOpen(file: File, start: number, end: number): Promise<SessionInfo> {
    return (await this.call({ type: "session-open", file, start, end })) as unknown as SessionInfo;
  }

  async sessionAdd(object: SegObject & { id: number }): Promise<number> {
    return Number((await this.call({ type: "session-add", object })).t);
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
