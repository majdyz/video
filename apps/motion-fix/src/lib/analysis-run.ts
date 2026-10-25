// The analysis entry points shared by the worker and the main-thread
// fallback: telemetry first (ranged reads, no decode), feature tracking when
// the file has no usable motion data; optionally the hybrid pass (track the
// picture too, for the translation the gyro cannot see).

import { analyzeVideoFile, type TimeSpan } from "./analyze.ts";
import { computeGyroPlan } from "./gyro/gyro-stabilize.ts";
import { checkPicture } from "./gyro/check-file.ts";
import { probeFile } from "./gyro/probe-file.ts";
import { trackResidual } from "./gyro/residual-file.ts";
import { noteFromProbe, type AnalysisResult, type Plan, type SolveParams } from "./plan.ts";
import { computeStabilizedPath } from "./stabilize.ts";

export type AnalyzeOptions = {
  /** Gyro clips: also run the hybrid pass before returning (see refineHybrid for the two-step flow). */
  hybrid?: boolean;
  /**
   * Trim: only this stretch of the clip (clip seconds) is decoded and
   * tracked (visual analysis, the gyro picture check, the hybrid pass). The
   * gyro telemetry (or motion log) is read whole (cheap, and a log's clock
   * sync searches all of it); the solve takes the span from SolveParams.span.
   */
  span?: TimeSpan | null;
  /** A motion log recorded next to the clip (.gcsv, Sensor Logger CSV): used instead of the file's own telemetry. */
  motionLog?: File | null;
};

export async function analyzeAny(file: File, forceVisual: boolean, onProgress: (fraction: number, frames: number) => void, signal: AbortSignal, options: AnalyzeOptions = {}): Promise<AnalysisResult> {
  const t0 = performance.now();
  const probe = await probeFile(file, signal, options.motionLog);
  if (probe.status === "ok" && !forceVisual) {
    // Picture check: air vs underwater lens, and whether the gyro matches the picture at all.
    try {
      const check = await checkPicture(file, probe.motion, signal, options.span);
      if (check) probe.motion.medium = check;
    } catch (e) {
      // Only a cancel by the caller ends the analysis: a decoder that aborts on its own
      // (WebCodecs reports a reset or reclaimed decoder as AbortError) just skips the check.
      if (signal.aborted) throw e;
      console.warn("[motion] picture check failed, using the in-air lens", e);
    }
    const result: AnalysisResult = { mode: "gyro", motion: probe.motion, probeMs: performance.now() - t0 };
    return options.hybrid ? refineHybrid(file, result, onProgress, signal, options.span) : result;
  }
  const analysis = await analyzeVideoFile(file, onProgress, signal, options.span);
  return { mode: "visual", analysis, telemetry: noteFromProbe(probe) };
}

/**
 * Hybrid pass for a gyro result: decodes and tracks the clip, derotating
 * every pair with the gyro, and returns the result with `residual` set.
 * Visual results, rotated clips and decode failures come back unchanged
 * (the gyro-only plan stays as it is). Rejects only with AbortError.
 */
export async function refineHybrid(file: File, result: AnalysisResult, onProgress: (fraction: number, frames: number) => void, signal: AbortSignal, span?: TimeSpan | null): Promise<AnalysisResult> {
  if (result.mode !== "gyro") return result;
  try {
    const residual = await trackResidual(file, result.motion, onProgress, signal, span);
    return residual ? { ...result, residual } : result;
  } catch (e) {
    if (signal.aborted) throw e;
    console.warn("[motion] bobbing pass failed, keeping the gyro result", e);
    return result;
  }
}

export function solveAny(r: AnalysisResult, params: SolveParams): Plan {
  if (r.mode === "gyro") return { kind: "gyro", plan: computeGyroPlan(r.motion, params, r.residual) };
  return { kind: "visual", path: computeStabilizedPath(r.analysis, { smoothing: params.smoothing, maxCrop: params.maxCrop }) };
}
