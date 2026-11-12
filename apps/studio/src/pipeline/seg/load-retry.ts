// AI subjects, starting the model: one more try in a fresh worker before "not available on this device".
//
// The runtime (onnxruntime-web) remembers a failed start for the life of its instance: once its WASM init has
// thrown (out of memory while the threads' heaps are made, a WebGPU attempt that took the page's memory with it),
// every later call in that worker answers "previous call to 'initWasm()' failed" (owner's iPhone, Safari 26: the
// Subjects panel said "Not available on this device … no available backend found" from then on). A fresh worker is
// a fresh runtime, so the second try is made in one, on plain WASM with RETRY_THREADS threads (the start that
// needs least). The first failure's own error goes to the breadcrumbs: it is the real one, the second only says
// what was left. Pure (the worker is whatever `make` returns); tested in test/seg-load-retry.test.ts.

/** The second try's WASM threads. */
export const RETRY_THREADS = 1;

/** One try: which worker (the plain WASM runtime, or the one with WebGPU) and how many threads (undefined: the device's). */
export type LoadAttempt = { wasm: boolean; threads?: number };

/** The tries for a model that would start as `first`: that, then plain WASM on RETRY_THREADS threads. */
export function loadAttempts(first: LoadAttempt): LoadAttempt[] {
  return [first, { wasm: true, threads: RETRY_THREADS }];
}

/**
 * Starts the model: each try in a worker of its own (`make`), the failed one shut down (`dispose`) before the next
 * is made, so two runtimes are never alive together. Resolves to the first that loads, with the try it was;
 * rejects with the last error when none does. `onFailed`: every failure, with the try and whether another follows.
 */
export async function loadWithRetry<M>(o: {
  attempts: readonly LoadAttempt[];
  make: (a: LoadAttempt) => M;
  load: (m: M, a: LoadAttempt) => Promise<unknown>;
  dispose: (m: M) => void;
  onFailed?: (err: unknown, a: LoadAttempt, retrying: boolean) => void;
}): Promise<{ model: M; attempt: LoadAttempt; tries: number }> {
  let last: unknown = new Error("no attempt");
  for (let i = 0; i < o.attempts.length; i++) {
    const a = o.attempts[i], m = o.make(a);
    try {
      await o.load(m, a);
      return { model: m, attempt: a, tries: i + 1 };
    } catch (e) {
      last = e;
      try { o.dispose(m); } catch { /* already gone */ }
      o.onFailed?.(e, a, i + 1 < o.attempts.length);
    }
  }
  throw last;
}
