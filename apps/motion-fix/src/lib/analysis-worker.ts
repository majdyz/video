// Analysis worker: owns the decode + track pass and the path solves so the
// page stays responsive (sliders, scrubbing, the preview loop) while a 4K
// clip is being tracked. Protocol in analysis-client.ts.

import { analyzeVideoFile } from "./analyze.ts";
import { computeStabilizedPath, type MotionAnalysis, type StabilizeParams, type StabilizedPath } from "./stabilize.ts";

export type WorkerRequest =
  | { type: "analyze"; id: number; file: File }
  | { type: "solve"; id: number; params: StabilizeParams }
  | { type: "cancel" };

export type WorkerResponse =
  | { type: "progress"; id: number; fraction: number; frames: number }
  | { type: "analysis"; id: number; analysis: MotionAnalysis }
  | { type: "path"; id: number; path: StabilizedPath }
  | { type: "error"; id: number; message: string; name: string };

const scope = self as unknown as { postMessage: (msg: WorkerResponse, transfer?: Transferable[]) => void; onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null };

let analysis: MotionAnalysis | null = null;
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
    analysis = null;
    try {
      const result = await analyzeVideoFile(
        msg.file,
        (fraction, frames) => scope.postMessage({ type: "progress", id: msg.id, fraction, frames }),
        abort.signal,
      );
      analysis = result;
      // Structured clone (no transfer): the worker keeps the arrays for solves.
      scope.postMessage({ type: "analysis", id: msg.id, analysis: result });
    } catch (err) {
      fail(msg.id, err);
    }
    return;
  }
  if (msg.type === "solve") {
    if (!analysis) {
      fail(msg.id, new Error("No analysis loaded"));
      return;
    }
    try {
      const path = computeStabilizedPath(analysis, msg.params);
      scope.postMessage({ type: "path", id: msg.id, path });
    } catch (err) {
      fail(msg.id, err);
    }
  }
};
