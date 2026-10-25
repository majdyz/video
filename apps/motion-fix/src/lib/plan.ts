// What the analysis produced and how a frame is warped, for both paths:
//   gyro   — the file carries camera orientation (GoPro gpmd, DJI djmd,
//            CAMM) or the user added a motion log (.gcsv, Sensor Logger):
//            rotation-exact stabilisation through the lens, no decode pass.
//   visual — feature tracking (v2) for phones, re-encoded clips, EIS-on DJI.

import { gyroWarpFnAtTime, type GyroParams, type GyroPlan } from "./gyro/gyro-stabilize.ts";
import type { ResidualMotion } from "./gyro/hybrid.ts";
import type { CameraMotion, MotionSource, TelemetryProbe } from "./gyro/telemetry.ts";
import type { WarpFn } from "./mesh-renderer.ts";
import { warpFnAtTime, type MotionAnalysis, type StabilizedPath } from "./stabilize.ts";

/** Why the visual path was used (shown to the user). */
export type TelemetryNote =
  | { status: "unusable"; source: MotionSource; camera: string; reason: string; eisActive: boolean }
  | { status: "none"; reason: string }
  | { status: "declined"; camera: string };

export type AnalysisResult =
  /** residual: the hybrid pass's picture measurements (translation the gyro cannot see), when it ran. */
  | { mode: "gyro"; motion: CameraMotion; probeMs: number; residual?: ResidualMotion }
  | { mode: "visual"; analysis: MotionAnalysis; telemetry: TelemetryNote };

export type SolveParams = GyroParams;

export type Plan = { kind: "gyro"; plan: GyroPlan } | { kind: "visual"; path: StabilizedPath };

export function noteFromProbe(p: TelemetryProbe): TelemetryNote {
  if (p.status === "unusable") return p;
  if (p.status === "none") return p;
  return { status: "declined", camera: p.motion.camera };
}

/** Per-vertex warp at a media time for whichever path is active. */
export function planWarpFn(result: AnalysisResult, plan: Plan, time: number, outW: number, outH: number): WarpFn {
  if (plan.kind === "gyro" && result.mode === "gyro") return gyroWarpFnAtTime(result.motion, plan.plan, time, outW, outH);
  if (plan.kind === "visual") return warpFnAtTime(plan.path, time);
  return (x, y) => [x, y];
}
