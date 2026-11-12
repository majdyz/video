// AI subject detection, one heavy job at a time: the main thread's side. The session's own jobs (a tap's track, the
// model's search, the peek, the pass) take turns in its loop in the worker (session.ts work). What the worker cannot
// see is the seed frame's job here: a second <video> seeks to the segment's canonical frame and the engine analyses
// it on the page's GPU (studio.ts seedSegmentCanonical). That job and a tap take turns too:
//   - a seed frame job starts only once no tap is with the session (the pass stands still for the tap anyway, so the
//     seeds are not needed before);
//   - a tap that comes while a seed frame is in the engine waits for that analysis to end (about a second) before it
//     goes to the session.
// An iPhone's page died with all three alive (12 Nov): the tap's track in the worker, the seed frame's analysis here
// and then the model's search for that frame, run between two of the tap's steps.

export type TurnsOptions = {
  /** A tap is with the session and not followed through yet. */
  tapActive: () => boolean;
  /** A breadcrumb (crumbs.ts crumb). */
  log: (msg: string) => void;
  /** A seed frame job waits for a tap at most this long (ms), then goes on with a breadcrumb: a tap whose end was
   * never heard must not stop the pass for good. */
  maxTapWaitMs?: number;
  /** A tap waits for the seed frame in the engine at most this long (ms). */
  maxSeedWaitMs?: number;
};

export class SegTurns {
  private waiters: (() => void)[] = [];
  private seed: Promise<void> | null = null;
  private seq = 0;
  private o: TurnsOptions;

  constructor(o: TurnsOptions) {
    this.o = o;
  }

  /** To call wherever a tap may have ended (followed through, failed, the clip closed): those waiting go on. */
  tapEnded(): void {
    if (this.o.tapActive() || !this.waiters.length) return;
    const w = this.waiters;
    this.waiters = [];
    for (const r of w) r();
  }

  /** Resolves true once no tap is with the session, false when one still is after maxTapWaitMs. */
  async tapIdle(): Promise<boolean> {
    const until = Date.now() + (this.o.maxTapWaitMs ?? 300000);
    while (this.o.tapActive()) {
      const left = until - Date.now();
      if (left <= 0) return false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        new Promise<void>((r) => this.waiters.push(r)),
        new Promise<void>((r) => { timer = setTimeout(r, left); }),
      ]);
      clearTimeout(timer);
    }
    return true;
  }

  /** A seed frame is in the engine. */
  get seedBusy(): boolean {
    return this.seed !== null;
  }

  /** Resolves when no seed frame is in the engine (at once when none is), or after maxSeedWaitMs. */
  async seedIdle(): Promise<void> {
    const s = this.seed;
    if (!s) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([s, new Promise<void>((r) => { timer = setTimeout(r, this.o.maxSeedWaitMs ?? 8000); })]);
    clearTimeout(timer);
  }

  /**
   * Runs a seed frame job (what: its frame, for the breadcrumbs): after the one before, and not while a tap is with
   * the session. A breadcrumb when it starts and when it ends, numbered m1, m2, ... (the session's own jobs are
   * numbered without the m).
   */
  async seedJob<T>(what: string, fn: () => Promise<T>): Promise<T> {
    for (;;) {
      if (this.seed) { await this.seed; continue; }
      if (!this.o.tapActive()) break;
      if (!(await this.tapIdle())) { this.o.log(`ai: seed ${what}: a tap is still busy; going on`); break; }
    }
    const id = `m${++this.seq}`;
    this.o.log(`ai: job ${id} seed ${what} start`);
    let done!: () => void;
    this.seed = new Promise<void>((r) => { done = r; });
    let how = "done";
    try {
      return await fn();
    } catch (e) {
      how = "failed";
      throw e;
    } finally {
      this.seed = null;
      done();
      this.o.log(`ai: job ${id} seed ${what} end: ${how}`);
    }
  }
}
