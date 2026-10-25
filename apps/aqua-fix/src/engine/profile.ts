// Clip profile → locked segments (pure; shared by Aqua Fix and the Studio app).
// The app samples ~a dozen frames over the clip (engine.analyzeRaw on each)
// and this turns them into the LockSegment[] for engine.lockGlobals().

import type { LockSegment } from "./lock.ts";
import { medianParams, type GradeParams } from "./params.ts";

export type ProfileSample = { t: number; params: GradeParams; mean: [number, number, number] };

/** How many frames to sample for a clip of `durationSec`, and at which times. */
export function profileTimes(durationSec: number): number[] {
  if (!Number.isFinite(durationSec) || durationSec < 0.5) return [];
  const n = Math.min(12, Math.max(4, Math.round(durationSec)));
  return Array.from({ length: n }, (_, i) => Math.min(durationSec - 0.05, 0.15 + ((durationSec - 0.3) * (i + 0.5)) / n));
}

/**
 * Split at real cuts only: samples are ~0.5–1 s apart, so a pan from sunlit
 * surface to dark rock already moves the mean colour by more than the
 * frame-to-frame cut threshold. A split needs a large jump, or a moderate one
 * together with a genuinely different estimate. Each segment with ≥ 2
 * samples locks its own median; a lone sample joins the previous segment.
 * `cutDiff` is the engine's frame-to-frame cut threshold (SCENE_CUT_MEAN_DIFF).
 * Returns null when there are too few samples to lock (< 3).
 */
export function segmentProfile(samples: ProfileSample[], cutDiff: number): LockSegment[] | null {
  if (samples.length < 3) return null;
  const segs: { from: number; window?: [number, number]; items: ProfileSample[] }[] = [{ from: 0, items: [samples[0]] }];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1].mean, b = samples[i].mean;
    const diff = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
    const wa = samples[i - 1].params.wb, wb = samples[i].params.wb;
    const wbDiff = Math.max(Math.abs(Math.log(wa[0] / wb[0])), Math.abs(Math.log(wa[2] / wb[2])));
    const cut = diff > 2 * cutDiff || (diff > cutDiff && wbDiff > 0.2);
    if (cut) segs.push({ from: (samples[i - 1].t + samples[i].t) / 2, window: [samples[i - 1].t, samples[i].t], items: [] });
    segs[segs.length - 1].items.push(samples[i]);
  }
  for (let i = segs.length - 1; i > 0; i--) if (segs[i].items.length < 2) { segs[i - 1].items.push(...segs[i].items); segs.splice(i, 1); }
  return segs.map((s) => ({ from: s.from, window: s.window, params: medianParams(s.items.map((x) => x.params)) }));
}
