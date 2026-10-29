// Shared shape for every dive-log parser (see index.ts for the API overview).

/** One profile sample. `t` is seconds since `DiveLog.startTime`. */
export type DiveSample = {
  /** Seconds since the dive's start. */
  t: number;
  /** Depth, metres (positive down). */
  depth: number;
  /** Water temperature, °C, when the computer logged one at this sample. */
  temp?: number;
};

export type DiveLogFormat = "shearwater-xml" | "shearwater-csv" | "fit" | "uddf";

export type DiveLog = {
  /**
   * When the dive started. Dive computers log their own wall clock with no
   * zone, so unless `utc` is true this Date carries the wall-clock fields as
   * if they were UTC ("floating" time: read it with getUTC*). FIT files log
   * true UTC (`utc: true`).
   */
  startTime: Date;
  /** True when `startTime` is a real UTC instant (FIT), false for a floating wall-clock time. */
  utc: boolean;
  /** Sorted by t, t >= 0. */
  samples: DiveSample[];
  format: DiveLogFormat;
  /** Computer / product name when the file names one. */
  device?: string;
  /** FIT only: the computer's local-time offset from UTC in seconds, when the file records it. */
  utcOffsetS?: number;
};

export class DiveLogError extends Error {}

/** Sort, drop non-finite rows, shift so the first sample is not before 0, merge duplicate times. */
export function tidySamples(samples: DiveSample[]): DiveSample[] {
  const ok = samples.filter((s) => Number.isFinite(s.t) && Number.isFinite(s.depth)).sort((a, b) => a.t - b.t);
  const out: DiveSample[] = [];
  for (const s of ok) {
    const temp = s.temp !== undefined && Number.isFinite(s.temp) ? s.temp : undefined;
    const row: DiveSample = temp === undefined ? { t: s.t, depth: s.depth } : { t: s.t, depth: s.depth, temp };
    if (out.length && Math.abs(out[out.length - 1].t - s.t) < 1e-6) out[out.length - 1] = row;
    else out.push(row);
  }
  return out;
}

export const FT = 0.3048;
export const fToC = (f: number) => ((f - 32) * 5) / 9;
