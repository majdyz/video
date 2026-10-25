// What the Stabilise tool tells the user about Motion Fix v3's analysis:
// which path ran (gyro telemetry or visual tracking), why, and how much it
// smoothed. Pure, type-only imports: the UI can use it without loading the
// motion chunk. Wording follows apps/motion-fix/src/App.tsx (explain/describe).

import type { AnalysisResult, Plan } from "../../../motion-fix/src/lib/plan.ts";

export type StabInfo = {
  mode: "gyro" | "visual";
  /** "Gyro stabilisation · GoPro HERO10 Black" / "Visual stabilisation". */
  badge: string;
  /** Why visual tracking ran, or a gyro caveat; null when nothing to say. */
  warning: string | null;
  /** Gyro only: camera name, detected port medium, whether the clip knows "down" (Keep level). */
  camera: string | null;
  mediumDetected: "air" | "water" | null;
  canLevel: boolean;
  /** The file has usable gyro data (whether or not the user picked visual tracking). */
  canSwitch: boolean;
  /** Gyro path on an unrotated clip: the bobbing (hybrid) pass can run. */
  canBobbing: boolean;
};

export function stabInfo(r: AnalysisResult): StabInfo {
  if (r.mode === "gyro") {
    const m = r.motion;
    const extra = m.eis.active ? ` · ${m.eis.label} compensated` : "";
    const water = m.medium?.detected === "water" ? " · underwater lens" : "";
    const mismatch = m.medium && !m.medium.consistent ? "The motion data barely matches the picture (an edited or re-timed copy?). If the result shakes, switch to Visual tracking under Advanced." : null;
    return {
      mode: "gyro",
      badge: `Gyro stabilisation · ${m.camera}${extra}${water}`,
      warning: mismatch,
      camera: m.camera,
      mediumDetected: m.medium?.detected ?? null,
      canLevel: !!m.down,
      canSwitch: true,
      canBobbing: m.video.rotation === 0,
    };
  }
  const t = r.telemetry;
  const base = { mode: "visual" as const, badge: "Visual stabilisation", camera: null, mediumDetected: null, canLevel: false, canBobbing: false };
  if (t.status === "declined") return { ...base, warning: null, canSwitch: true };
  if (t.status === "unusable") {
    if (t.eisActive && t.source === "dji") {
      return { ...base, canSwitch: false, warning: `EIS was on in camera (${t.camera}): its warp can't be undone with the gyro data, so the picture is tracked instead. Record with RockSteady / HorizonSteady off for gyro-grade results.` };
    }
    return { ...base, canSwitch: false, warning: `${t.camera}: ${t.reason}. Using visual tracking.` };
  }
  return { ...base, canSwitch: false, warning: "No motion data in this file. For GoPro / DJI clips, import the original from the SD card (shared or re-saved copies lose it)." };
}

/** One line: shake before → after and the crop used. */
export function stabSummary(r: AnalysisResult, plan: Plan): string | null {
  if (r.mode === "gyro" && plan.kind === "gyro") {
    const s = plan.plan.stats;
    const h = plan.plan.hybrid;
    const bob = h?.applied ? ` · bobbing ${h.wanderBefore.toFixed(1)} → ${h.wanderAfter.toFixed(1)} px` : "";
    return `Shake ${s.rawJitter.toFixed(2)} → ${s.virtJitter.toFixed(2)}°/frame²${bob} · zoom ${s.maxUsedZoom.toFixed(2)}×`;
  }
  if (r.mode === "visual" && plan.kind === "visual") {
    const a = r.analysis;
    let good = 0;
    for (let t = 0; t < a.frameCount; t++) if (a.model[t] >= 2) good++;
    const q = a.frameCount ? Math.round((100 * good) / a.frameCount) : 0;
    return `Tracked ${q}% of frames · zoom ${plan.path.stats.maxUsedZoom.toFixed(2)}×`;
  }
  return null;
}

/**
 * Short line about the bobbing pass for the Stabilise panel: progress, the
 * result, or why the clip stayed gyro-only. Null when there is nothing to say.
 */
export function bobbingNote(plan: Plan | null, refine: "idle" | "running" | "done" | "unavailable", progress: number): string | null {
  if (refine === "running") return `Measuring bobbing ${Math.round(progress * 100)}%…`;
  if (refine === "unavailable") return "Bobbing: gyro only (the picture could not be measured)";
  if (refine !== "done" || !plan || plan.kind !== "gyro") return null;
  const h = plan.plan.hybrid;
  if (!h) return null;
  if (h.applied) return `Bobbing removed · ${h.wanderBefore.toFixed(1)} → ${h.wanderAfter.toFixed(1)} px`;
  return `Bobbing: gyro only (${h.reason})`;
}
