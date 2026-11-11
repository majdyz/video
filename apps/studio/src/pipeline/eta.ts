/**
 * "About 2 min left" from a progress fraction and when the work started. Quiet (null) until there is enough signal:
 * at least 4 s elapsed and 3% done, so the first guess is not wild. Rounded coarsely: users want a feel, not a timer.
 */
export function etaText(startMs: number, progress: number, nowMs = Date.now()): string | null {
  const el = (nowMs - startMs) / 1000;
  if (!(progress >= 0.03) || progress >= 1 || el < 4) return null;
  const left = (el * (1 - progress)) / progress;
  if (left < 45) return "under a minute left";
  const min = Math.round(left / 60);
  return min <= 1 ? "about a minute left" : `about ${min} min left`;
}

/** Tracks a start time per run so callers can just feed progress. */
export class Eta {
  private start = 0;
  reset(): void { this.start = 0; }
  text(progress: number | null | undefined, now = Date.now()): string | null {
    if (progress == null) return null;
    if (!this.start) this.start = now;
    return etaText(this.start, progress, now);
  }
}
