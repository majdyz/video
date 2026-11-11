// Waiting for a GPU fence (WebGL2 readbacks) without the timer clamp.
//
// The readbacks used to poll with setTimeout(poll, 1): nested timers are clamped to 4 ms by the HTML spec, so every
// readback idled 4 ms or more after the GPU was done. Here the first polls are spaced by MessageChannel tasks (no
// clamp; the event loop still runs input, rendering and other tasks in between), and a fence that is not ready
// within `fastMs` drops to the old timer polling, so a slow GPU (or a hidden tab) never spins the CPU. The wait is
// bounded as before: `maxSlowTries` timer polls, then it rejects.

export type FenceStatus = "done" | "wait" | "failed";

export type FencePollOptions = {
  /** How long to poll at task speed before falling back to timers (ms). */
  fastMs?: number;
  /** Delay of the fallback timer polls (ms; the browser clamps nested timers to 4). */
  slowDelayMs?: number;
  /** Fallback polls before giving up. */
  maxSlowTries?: number;
  /** Hard cap on task-speed polls (a clock that does not advance must not spin for ever). */
  maxFastTries?: number;
  /** Error message of the rejection. */
  label?: string;
  // Injected in tests.
  now?: () => number;
  yieldTask?: (fn: () => void) => void;
  setTimer?: (fn: () => void, ms: number) => void;
};

export const FENCE_FAST_MS = 12;
export const FENCE_MAX_SLOW_TRIES = 15000;
const FENCE_MAX_FAST_TRIES = 20000;

let channel: MessageChannel | null = null;
const queue: (() => void)[] = [];

/** Runs `fn` in a new task, without the 4 ms clamp of nested timers (setTimeout where there is no MessageChannel). */
export function yieldTask(fn: () => void): void {
  if (typeof MessageChannel === "undefined") {
    setTimeout(fn, 0);
    return;
  }
  if (!channel) {
    channel = new MessageChannel();
    channel.port1.onmessage = () => {
      const next = queue.shift();
      // The port only keeps a process alive (Node) while something waits on it.
      if (!queue.length) (channel!.port1 as unknown as { unref?: () => void }).unref?.();
      next?.();
    };
  }
  if (!queue.length) (channel.port1 as unknown as { ref?: () => void }).ref?.();
  queue.push(fn);
  channel.port2.postMessage(0);
}

/**
 * Resolves once `check` says "done"; rejects on "failed", when `check` throws, or when the bounded wait runs out.
 * `check` runs synchronously first, then once per task for `fastMs`, then once per `slowDelayMs` timer.
 */
export function pollFence(check: () => FenceStatus, opts: FencePollOptions = {}): Promise<void> {
  const fastMs = opts.fastMs ?? FENCE_FAST_MS;
  const slowDelayMs = opts.slowDelayMs ?? 1;
  const maxSlowTries = opts.maxSlowTries ?? FENCE_MAX_SLOW_TRIES;
  const maxFastTries = opts.maxFastTries ?? FENCE_MAX_FAST_TRIES;
  const now = opts.now ?? (() => performance.now());
  const fast = opts.yieldTask ?? yieldTask;
  const timer = opts.setTimer ?? ((fn: () => void, ms: number) => void setTimeout(fn, ms));
  return new Promise<void>((resolve, reject) => {
    const t0 = now();
    let fastTries = 0, slowTries = 0;
    const poll = () => {
      let status: FenceStatus;
      try {
        status = check();
      } catch (e) {
        return reject(e);
      }
      if (status === "done") return resolve();
      if (status === "failed") return reject(new Error(opts.label ?? "GPU readback timed out"));
      if (fastTries < maxFastTries && now() - t0 < fastMs) {
        fastTries++;
        return fast(poll);
      }
      if (++slowTries > maxSlowTries) return reject(new Error(opts.label ?? "GPU readback timed out"));
      timer(poll, slowDelayMs);
    };
    poll();
  });
}

/** pollFence on a WebGL2 sync object (the caller deletes it). */
export function waitForSync(gl: WebGL2RenderingContext, sync: WebGLSync, opts: FencePollOptions = {}): Promise<void> {
  return pollFence(() => {
    const status = gl.clientWaitSync(sync, 0, 0);
    if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED) return "done";
    return status === gl.WAIT_FAILED ? "failed" : "wait";
  }, opts);
}
