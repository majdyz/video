// Main-thread handle on the analysis worker. Promises per request, progress
// callbacks, cancellation, and an in-thread fallback for browsers whose
// workers lack WebCodecs (the same analyze/solve code runs either way).

import { analyzeAny, solveAny } from "./analysis-run.ts";
import type { WorkerRequest, WorkerResponse } from "./analysis-worker.ts";
import type { AnalysisResult, Plan, SolveParams } from "./plan.ts";

type Pending = { resolve: (v: never) => void; reject: (e: Error) => void; onProgress?: (fraction: number, frames: number) => void };

export class AnalysisClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private workerBroken = false;
  /** Kept for the in-thread fallback solves. */
  private fallbackResult: AnalysisResult | null = null;

  private ensureWorker(): Worker | null {
    if (this.workerBroken) return null;
    if (this.worker) return this.worker;
    try {
      const w = new Worker(new URL("./analysis-worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent<WorkerResponse>) => this.onMessage(e.data);
      w.onerror = (e) => {
        this.workerBroken = true;
        const err = new Error(e.message || "analysis worker failed");
        for (const p of this.pending.values()) p.reject(err);
        this.pending.clear();
      };
      this.worker = w;
      return w;
    } catch {
      this.workerBroken = true;
      return null;
    }
  }

  private onMessage(msg: WorkerResponse): void {
    const p = this.pending.get(msg.id);
    if (!p) return;
    if (msg.type === "progress") {
      p.onProgress?.(msg.fraction, msg.frames);
      return;
    }
    this.pending.delete(msg.id);
    if (msg.type === "error") {
      const err = new Error(msg.message);
      err.name = msg.name;
      p.reject(err);
    } else if (msg.type === "analysis") {
      p.resolve(msg.result as never);
    } else {
      p.resolve(msg.plan as never);
    }
  }

  private request<T>(req: WorkerRequest & { id: number }, onProgress?: Pending["onProgress"]): Promise<T> {
    const w = this.ensureWorker();
    if (!w) return Promise.reject(new Error("worker unavailable"));
    return new Promise<T>((resolve, reject) => {
      this.pending.set(req.id, { resolve: resolve as (v: never) => void, reject, onProgress });
      w.postMessage(req);
    });
  }

  /**
   * Reads the clip's motion: gyro telemetry when the file has usable motion
   * data (and `forceVisual` is off), else decode + feature tracking.
   * Rejects with AbortError when cancelled.
   */
  async analyze(file: File, onProgress: (fraction: number, frames: number) => void, signal?: AbortSignal, forceVisual = false): Promise<AnalysisResult> {
    this.fallbackResult = null;
    const id = this.nextId++;
    const onAbort = (): void => this.worker?.postMessage({ type: "cancel" } satisfies WorkerRequest);
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      return await this.request<AnalysisResult>({ type: "analyze", id, file, forceVisual }, onProgress);
    } catch (e) {
      if (signal?.aborted || (e instanceof Error && e.name === "AbortError")) throw new DOMException("Aborted", "AbortError");
      if (!this.workerBroken && !(e instanceof Error && /VideoDecoder|worker/i.test(e.message))) throw e;
      // Worker could not decode here (older Safari): same code on the main thread.
      this.workerBroken = true;
      const result = await analyzeAny(file, forceVisual, onProgress, signal ?? new AbortController().signal);
      this.fallbackResult = result;
      return result;
    } finally {
      signal?.removeEventListener("abort", onAbort);
    }
  }

  /** Solves the path for the loaded analysis with new parameters. */
  async solve(params: SolveParams): Promise<Plan> {
    if (this.fallbackResult) return solveAny(this.fallbackResult, params);
    const id = this.nextId++;
    return this.request<Plan>({ type: "solve", id, params });
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    for (const p of this.pending.values()) p.reject(new DOMException("Aborted", "AbortError"));
    this.pending.clear();
  }
}
