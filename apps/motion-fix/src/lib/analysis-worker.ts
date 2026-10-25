// Analysis worker: owns the telemetry probe, the decode + track pass and the
// path solves so the page stays responsive (sliders, scrubbing, the preview
// loop) while a 4K clip is being analysed. Protocol in analysis-client.ts.

import { analyzeAny, solveAny } from "./analysis-run.ts";
import type { AnalysisResult, Plan, SolveParams } from "./plan.ts";

export type WorkerRequest =
  | { type: "analyze"; id: number; file: File; forceVisual: boolean }
  | { type: "solve"; id: number; params: SolveParams }
  | { type: "cancel" };

export type WorkerResponse =
  | { type: "progress"; id: number; fraction: number; frames: number }
  | { type: "analysis"; id: number; result: AnalysisResult }
  | { type: "path"; id: number; plan: Plan }
  | { type: "error"; id: number; message: string; name: string };

const scope = self as unknown as { postMessage: (msg: WorkerResponse, transfer?: Transferable[]) => void; onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null };

let result: AnalysisResult | null = null;
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
    try {
      const r = await analyzeAny(msg.file, msg.forceVisual, (fraction, frames) => scope.postMessage({ type: "progress", id: msg.id, fraction, frames }), abort.signal);
      result = r;
      // Structured clone (no transfer): the worker keeps the arrays for solves.
      scope.postMessage({ type: "analysis", id: msg.id, result: r });
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
