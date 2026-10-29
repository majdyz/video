// The export's frame loop, kept free of WebCodecs so its memory rules are
// unit-tested: at most `depth` renders in flight, frames encoded in source
// order, the next decoded frame pulled only once there is room (the decoder
// waits instead of piling raw 4K frames up in memory), and every input and
// output released exactly once, on success, failure or abort.

export type PipelineHooks<S, F> = {
  /** Renders in flight at once (≥ 1). */
  depth: number;
  /** Starts rendering a decoded input; resolves to the frame to encode. */
  render: (input: S, index: number) => Promise<F> | F;
  /**
   * Encodes one rendered frame (in order). Awaiting it is the encoder
   * backpressure: the next frame is not pulled until it resolves.
   */
  encode: (frame: F, input: S, index: number) => Promise<void> | void;
  /** Frees a decoded input (always called once per pulled input). */
  releaseInput: (input: S) => void;
  /** Frees a rendered frame (always called once per frame a render produced). */
  releaseFrame: (frame: F) => void;
  /** Skips inputs without rendering them (released at once). */
  accept?: (input: S) => boolean;
  /** Awaited before every pull: a pause (page in the background) holds the loop here. */
  gate?: () => Promise<void> | void;
  signal?: AbortSignal;
  /** Called with the number of renders in flight after each pull (tests, diagnostics). */
  onInflight?: (n: number) => void;
};

function abortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}

/** Resolves when `p` does or the signal aborts (a paused export can still be cancelled). */
function untilAborted(p: Promise<void> | void, signal?: AbortSignal): Promise<void> | void {
  if (!p || !signal) return p;
  if (signal.aborted) return;
  return new Promise<void>((resolve) => {
    const done = () => {
      signal.removeEventListener("abort", done);
      resolve();
    };
    signal.addEventListener("abort", done, { once: true });
    p.then(done, done);
  });
}

/** Runs the pipeline over `source`; resolves to the number of frames encoded. */
export async function runFramePipeline<S, F>(source: AsyncIterable<S>, h: PipelineHooks<S, F>): Promise<number> {
  const depth = Math.max(1, Math.floor(h.depth));
  const inflight: { promise: Promise<F>; input: S; index: number }[] = [];
  let encoded = 0;
  let pulled = 0;

  const encodeOldest = async () => {
    const job = inflight.shift()!;
    let frame: F | undefined;
    let have = false;
    try {
      frame = await job.promise;
      have = true;
      if (h.signal?.aborted) throw abortError();
      await h.encode(frame, job.input, job.index);
      encoded += 1;
    } finally {
      if (have) h.releaseFrame(frame as F);
      h.releaseInput(job.input);
    }
  };

  const iterator = source[Symbol.asyncIterator]();
  try {
    for (;;) {
      if (h.gate) await untilAborted(h.gate(), h.signal);
      if (h.signal?.aborted) throw abortError();
      const next = await iterator.next();
      if (next.done) break;
      const input = next.value;
      if (h.accept && !h.accept(input)) {
        h.releaseInput(input);
        continue;
      }
      const index = pulled++;
      let promise: Promise<F>;
      try {
        promise = Promise.resolve(h.render(input, index));
      } catch (e) {
        promise = Promise.reject(e);
      }
      // A rejection is handled when the job is encoded or drained.
      promise.catch(() => undefined);
      inflight.push({ promise, input, index });
      h.onInflight?.(inflight.length);
      if (inflight.length >= depth) await encodeOldest();
    }
    while (inflight.length > 0) await encodeOldest();
  } catch (e) {
    // Drain what is in flight so no frame leaks, then rethrow.
    const rest = inflight.splice(0);
    for (const job of rest) {
      h.releaseInput(job.input);
      await job.promise.then((f) => h.releaseFrame(f), () => undefined);
    }
    await iterator.return?.().catch(() => undefined);
    throw e;
  }
  return encoded;
}

/**
 * A pause gate: `wait()` resolves at once while running and holds while
 * paused; `pausedMs` excludes paused time from rate / ETA maths.
 */
export class PauseGate {
  private waiters: (() => void)[] = [];
  private since: number | null = null;
  private total = 0;
  private readonly now: () => number;
  constructor(now: () => number = () => performance.now()) {
    this.now = now;
  }

  get paused(): boolean {
    return this.since !== null;
  }

  /** Total time spent paused so far (ms), including a pause still running. */
  get pausedMs(): number {
    return this.total + (this.since !== null ? this.now() - this.since : 0);
  }

  pause(): void {
    if (this.since === null) this.since = this.now();
  }

  resume(): void {
    if (this.since === null) return;
    this.total += this.now() - this.since;
    this.since = null;
    const w = this.waiters;
    this.waiters = [];
    for (const r of w) r();
  }

  wait = (): Promise<void> | void => {
    if (this.since === null) return;
    return new Promise<void>((r) => this.waiters.push(r));
  };
}
