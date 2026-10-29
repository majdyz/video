// Which person pass an analysis runs (pure logic, shared by the engine's
// live analyses and the export's analyse-first pass). Every analysis counts;
// every `every`-th one runs a person pass; the first pass of a fresh run (and
// every PERSON_DETECT_EVERY-th after it) asks the detector whether anybody is
// there, the others segment the full frame or one of its quadrants in turn.
// Knowing the counters before an analysis is knowing its pass: the export
// precomputes it ahead of the render (engine.precompute).

export const PERSON_DETECT_EVERY = 3;

/** Person counters before an analysis. */
export type PersonCounters = { count: number; passes: number; rectIdx: number };

/** The pass the analysis with `c` before it runs: none, a detection, or a segmentation of quadrant `rectIdx`. */
export function personPassOf(c: PersonCounters, every: number): { want: boolean; detect: boolean } {
  const want = c.count % every === 0;
  return { want, detect: want && c.passes % PERSON_DETECT_EVERY === 0 };
}

/**
 * The counters before the `n`-th analysis of a run that started at `base`,
 * assuming every person pass answered before the next analysis started (an
 * export waits for it).
 */
export function personCountersAt(base: PersonCounters, n: number, every: number): PersonCounters {
  const c = { ...base };
  for (let i = 0; i < n; i++) {
    if (c.count++ % every !== 0) continue;
    if (c.passes++ % PERSON_DETECT_EVERY !== 0) c.rectIdx++;
  }
  return c;
}

export function samePersonCounters(a: PersonCounters, b: PersonCounters): boolean {
  return a.count === b.count && a.passes === b.passes && a.rectIdx === b.rectIdx;
}
