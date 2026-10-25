// Analysis worker: owns the telemetry probe, the decode + track pass and the
// path solves so the page stays responsive (sliders, scrubbing, the preview
// loop) while a 4K clip is being analysed. Protocol in analysis-client.ts.

import { analyzeAny, refineHybrid, solveAny } from "./analysis-run.ts";
import type { AnalysisResult, Plan, SolveParams } from "./plan.ts";
import type { TimeSpan } from "./analyze.ts";

export type WorkerRequest =
  | { type: "analyze"; id: number; file: File; forceVisual: boolean; hybrid?: boolean; span?: TimeSpan | null }
  /** Hybrid pass on the loaded gyro analysis (same file); later solves use it. */
  | { type: "refine"; id: number; span?: TimeSpan | null }
  | { type: "solve"; id: number; params: SolveParams }
  | { type: "cancel" };

export type WorkerResponse =
  | { type: "progress"; id: number; fraction: number; frames: number }
  | { type: "analysis"; id: number; result: AnalysisResult }
  /** `residual`: whether the hybrid measurements are now loaded. */
  | { type: "refined"; id: number; residual: boolean }
  | { type: "path"; id: number; plan: Plan }
  | { type: "error"; id: number; message: string; name: string };

const scope = self as unknown as { postMessage: (msg: WorkerResponse, transfer?: Transferable[]) => void; onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null };

let result: AnalysisResult | null = null;
let file: File | null = null;
let abort: AbortController | null = null;

function fail(id: number, e: unknown): void {
  const err = e instanceof Error ? e : new Error(String(e));
  scope.postMessage({ type: "error", id, message: err.message, name: err.name });
}

scope.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  if (msg.type === "cancel") {
    abort?.abort();
    return;
  }
  if (msg.type === "analyze") {
    abort?.abort();
    abort = new AbortController();
    result = null;
    file = msg.file;
    try {
      const r = await analyzeAny(msg.file, msg.forceVisual, (fraction, frames) => scope.postMessage({ type: "progress", id: msg.id, fraction, frames }), abort.signal, { hybrid: msg.hybrid, span: msg.span });
      result = r;
      // Structured clone (no transfer): the worker keeps the arrays for solves.
      scope.postMessage({ type: "analysis", id: msg.id, result: r });
    } catch (err) {
      fail(msg.id, err);
    }
    return;
  }
  if (msg.type === "refine") {
    if (!result || !file) {
      fail(msg.id, new Error("No analysis loaded"));
      return;
    }
    abort?.abort();
    abort = new AbortController();
    const base = result;
    try {
      const r = await refineHybrid(file, base, (fraction, frames) => scope.postMessage({ type: "progress", id: msg.id, fraction, frames }), abort.signal, msg.span);
      // A newer analysis may have replaced the one this pass refined.
      if (result === base) result = r;
      scope.postMessage({ type: "refined", id: msg.id, residual: r.mode === "gyro" && !!r.residual && result === r });
    } catch (err) {
      fail(msg.id, err);
    }
    return;
  }
  if (msg.type === "solve") {
    if (!result) {
      fail(msg.id, new Error("No analysis loaded"));
      return;
    }
    try {
      scope.postMessage({ type: "path", id: msg.id, plan: solveAny(result, msg.params) });
    } catch (err) {
      fail(msg.id, err);
    }
  }
};
