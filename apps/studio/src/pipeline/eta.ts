/**
 * "About 2 min left" from a progress fraction and when the work started. Quiet (null) until there is enough signal:
 * at least 4 s elapsed and 3% done, so the first guess is not wild. Rounded coarsely: users want a feel, not a timer.
 */
export function etaText(startMs: number, progress: number, nowMs = Date.now()): string | null {
  const left = etaSeconds(startMs, progress, nowMs);
  if (left === null) return null;
  if (left < 45) return "under a minute left";
  const min = Math.round(left / 60);
  return min <= 1 ? "about a minute left" : `about ${min} min left`;
}

/** The estimate behind etaText: seconds left, or null while there is too little to go on. */
export function etaSeconds(startMs: number, progress: number, nowMs = Date.now()): number | null {
  const el = (nowMs - startMs) / 1000;
  if (!(progress >= 0.03) || progress >= 1 || el < 4) return null;
  return (el * (1 - progress)) / progress;
}

/** The same estimate in a few characters, for a status chip's second line: "under 1 min left", "1 min left", "4 min left". */
export function etaShort(startMs: number, progress: number, nowMs = Date.now()): string | null {
  const left = etaSeconds(startMs, progress, nowMs);
  if (left === null) return null;
  return left < 45 ? "under 1 min left" : `${Math.max(1, Math.round(left / 60))} min left`;
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
  /** etaShort of the same run (the same start as `text`). */
  short(progress: number | null | undefined, now = Date.now()): string | null {
    if (progress == null) return null;
    if (!this.start) this.start = now;
    return etaShort(this.start, progress, now);
  }
}

/**
 * The stage pill while a clip's colour is profiled (the picture already shows a provisional grade): plain words and
 * the seconds left, "Fine-tuning colour… 4 s left"; no number until the first sample has shown the pace.
 */
export function colourStatus(secLeft: number | null): string {
  if (secLeft === null || !Number.isFinite(secLeft)) return "Fine-tuning colour…";
  return `Fine-tuning colour… ${Math.max(1, Math.ceil(secLeft))} s left`;
}
