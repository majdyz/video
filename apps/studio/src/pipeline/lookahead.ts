// Analyse-first for exports: a second decoder runs ahead of the render and,
// for every frame whose clip time may open a colour analysis, uploads it to
// the engine and reads its analysis thumbnail back (engine.precompute); the
// analyses themselves run in the engine's worker pool while the render works
// through the frames before them. When the render reaches such a frame its
// analyzeDue finds the thumbnail and (usually) the finished analysis, so the
// grade is the one the render would have computed itself — the same pixels
// through the same functions — without the render waiting for a worker.
//
// It works in windows: when the render gets within `leadSec` of the end of
// what was analysed, the next `windowSec` are analysed (the caller runs this
// where nothing else uses the engine's source texture or the geometry
// canvas). Memory stays bounded by the window (thumbnails and analyses of a
// few seconds), never the clip. Frames it guessed wrong are harmless: a miss
// is analysed live, as without the lookahead; a frame it analysed that the
// render doesn't need is dropped.

import type { SampleReader } from "@dive-tools/shared/codec-export.ts";

type Sample = { close(): void };
type Item = { sample: Sample; timeSec: number; timestamp: number };

export type LookaheadOptions = {
  reader: SampleReader;
  /** The clock of the times passed to `ensure` / `want` / `analyse`: clip time (offline export) or container time (native). */
  clock: "clip" | "container";
  /** Seconds analysed per window, and how close to its end the render gets before the next one. */
  windowSec?: number;
  leadSec?: number;
  /** End of the exported range (clip seconds). */
  endSec?: number;
  /** May the render analyse the frame at `t` (`prev`: the frame before it, null for the first)? */
  want: (t: number, prev: number | null) => boolean;
  /** Prepares, uploads and precomputes one frame; owns nothing (the sample is closed after). */
  analyse: (sample: Sample, t: number, prev: number | null) => Promise<void>;
  /** Wall time spent per window (profiling). */
  onWindow?: (ms: number, frames: number) => void;
  signal?: AbortSignal;
};

export class AnalysisLookahead {
  private readonly o: Required<Pick<LookaheadOptions, "windowSec" | "leadSec">> & LookaheadOptions;
  private it: AsyncGenerator<Item, void, unknown> | null = null;
  private pending: Item | null = null;
  private horizon = -Infinity;
  private prev: number | null = null;
  private done = false;
  /** Frames precomputed so far, and frames it failed to prepare (left to the render). */
  analysed = 0;
  failures = 0;

  constructor(o: LookaheadOptions) {
    this.o = { windowSec: 3, leadSec: 1.5, ...o };
  }

  private time(i: Item): number {
    return this.o.clock === "clip" ? i.timeSec : i.timestamp;
  }

  /** Call before rendering the frame at `t`: analyses the next window when the render is near the end of this one. */
  async ensure(t: number): Promise<void> {
    if (this.done || t + this.o.leadSec < this.horizon) return;
    const started = performance.now();
    if (!this.it) {
      const clip = this.o.clock === "clip" ? t : t - this.o.reader.t0;
      this.it = this.o.reader.samples(Math.max(0, clip), this.o.endSec);
    }
    const until = Math.max(t, this.horizon) + this.o.windowSec;
    let n = 0;
    for (;;) {
      if (this.o.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      let item = this.pending;
      this.pending = null;
      if (!item) {
        const next = await this.it.next();
        if (next.done) {
          this.done = true;
          break;
        }
        item = next.value;
      }
      const ti = this.time(item);
      if (ti >= until) {
        this.pending = item;
        break;
      }
      try {
        if (this.o.want(ti, this.prev)) {
          try {
            await this.o.analyse(item.sample, ti, this.prev);
            this.analysed++;
            n++;
          } catch (e) {
            // A frame the lookahead couldn't prepare (a readback timed out, …) is analysed live by the render.
            if (e instanceof DOMException && e.name === "AbortError") throw e;
            if (this.failures++ === 0) console.warn("[export] analyse-first skipped a frame:", e instanceof Error ? e.message : e);
          }
        }
      } finally {
        item.sample.close();
      }
      this.prev = ti;
    }
    this.horizon = until;
    this.o.onWindow?.(performance.now() - started, n);
  }

  dispose(): void {
    this.pending?.sample.close();
    this.pending = null;
    void this.it?.return().catch(() => undefined);
    this.it = null;
    this.o.reader.dispose();
  }
}
