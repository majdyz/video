// The analysis entry points shared by the worker and the main-thread
// fallback: telemetry first (ranged reads, no decode), feature tracking when
// the file has no usable motion data.

import { analyzeVideoFile } from "./analyze.ts";
import { computeGyroPlan } from "./gyro/gyro-stabilize.ts";
import { checkPicture } from "./gyro/check-file.ts";
import { probeFile } from "./gyro/probe-file.ts";
import { noteFromProbe, type AnalysisResult, type Plan, type SolveParams } from "./plan.ts";
import { computeStabilizedPath } from "./stabilize.ts";

export async function analyzeAny(file: File, forceVisual: boolean, onProgress: (fraction: number, frames: number) => void, signal: AbortSignal): Promise<AnalysisResult> {
  const t0 = performance.now();
  const probe = await probeFile(file, signal);
  if (probe.status === "ok" && !forceVisual) {
    // Picture check: air vs underwater lens, and whether the gyro matches the picture at all.
    try {
      const check = await checkPicture(file, probe.motion, signal);
      if (check) probe.motion.medium = check;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") throw e;
    }
    return { mode: "gyro", motion: probe.motion, probeMs: performance.now() - t0 };
  }
  const analysis = await analyzeVideoFile(file, onProgress, signal);
  return { mode: "visual", analysis, telemetry: noteFromProbe(probe) };
}

export function solveAny(r: AnalysisResult, params: SolveParams): Plan {
  if (r.mode === "gyro") return { kind: "gyro", plan: computeGyroPlan(r.motion, params) };
  return { kind: "visual", path: computeStabilizedPath(r.analysis, { smoothing: params.smoothing, maxCrop: params.maxCrop }) };
}
