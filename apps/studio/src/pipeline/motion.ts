// Motion analysis entry for the Studio (lazy chunk, loaded the first time
// Stabilise is switched on): Motion Fix v3's worker client (gyro telemetry
// from GoPro gpmd / DJI djmd, visual tracking otherwise) and the per-vertex
// warp for whichever path ran.
export { AnalysisClient } from "../../../motion-fix/src/lib/analysis-client.ts";
export { planWarpFn, type AnalysisResult, type Plan } from "../../../motion-fix/src/lib/plan.ts";
