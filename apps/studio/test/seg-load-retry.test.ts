// AI subjects, starting the model (seg/load-retry.ts): a start that fails is tried once more in a fresh worker on
// plain WASM with one thread, the first failure's own error is reported, and the frames a session posts go through
// the worker's transfer rules (test/seg-post.ts).
//   node --experimental-strip-types apps/studio/test/seg-load-retry.test.ts
import assert from "node:assert/strict";
import { loadAttempts, loadWithRetry, RETRY_THREADS, type LoadAttempt } from "../src/pipeline/seg/load-retry.ts";
import { frameTransfers, type SessionFrameOut } from "../src/pipeline/seg/session.ts";
import { postFrames } from "./seg-post.ts";

/** A worker stand-in. Its runtime keeps a failed start, as onnxruntime-web does: every later init in the same worker
 * fails with "previous call to 'initWasm()' failed". */
class FakeWorker {
  static made: FakeWorker[] = [];
  disposed = false;
  private broken = false;
  readonly a: LoadAttempt;
  readonly fails: boolean;
  constructor(a: LoadAttempt, fails: boolean) { this.a = a; this.fails = fails; FakeWorker.made.push(this); }
  async init(): Promise<void> {
    if (this.disposed) throw new Error("worker gone");
    if (this.broken) throw new Error("no available backend found. ERR: [wasm] Error: previous call to 'initWasm()' failed.");
    if (this.fails) { this.broken = true; throw new Error("RangeError: Out of memory"); }
  }
}
const run = (fails: (i: number) => boolean, first: LoadAttempt, failed: string[] = []) => {
  FakeWorker.made = [];
  return loadWithRetry({
    attempts: loadAttempts(first),
    make: (a) => new FakeWorker(a, fails(FakeWorker.made.length)),
    load: (w) => w.init(),
    dispose: (w) => { w.disposed = true; },
    wait: async () => {},
    onFailed: (e, a, retrying) => failed.push(`${a.wasm ? "wasm" : "webgpu"}${a.threads ? `/${a.threads}` : ""}: ${(e as Error).message}${retrying ? " (retrying)" : ""}`),
  });
};

// The runtime's own behaviour, which is why the retry needs a new worker: the same one never recovers.
{
  const w = new FakeWorker({ wasm: true }, true);
  await assert.rejects(w.init(), /Out of memory/);
  await assert.rejects(w.init(), /previous call to 'initWasm\(\)' failed/, "a second init in the same worker is stuck");
}

// The first start throws: a fresh worker, plain WASM, one thread; the first one is shut down before it is made.
{
  const failed: string[] = [];
  const r = await run((i) => i === 0, { wasm: false }, failed);
  assert.equal(FakeWorker.made.length, 2, "two workers");
  assert.notEqual(r.model, FakeWorker.made[0], "the model is the fresh worker's");
  assert.equal(r.model, FakeWorker.made[1]);
  assert.equal(FakeWorker.made[0].disposed, true, "the failed worker is shut down");
  assert.equal(r.model.disposed, false);
  assert.deepEqual(r.attempt, { wasm: true, threads: RETRY_THREADS }, "the retry: WASM, one thread");
  assert.ok(RETRY_THREADS >= 1 && RETRY_THREADS <= 2);
  assert.equal(r.tries, 2);
  assert.deepEqual(failed, ["webgpu: RangeError: Out of memory (retrying)"], "the first failure's real error is reported");
  console.log("model start: the first init throws → a fresh worker on WASM with one thread: ok");
}

// A start that works: one worker, as asked for.
{
  const failed: string[] = [];
  const r = await run(() => false, { wasm: true }, failed);
  assert.equal(FakeWorker.made.length, 1);
  assert.deepEqual(r.attempt, { wasm: true });
  assert.equal(r.tries, 1);
  assert.deepEqual(failed, []);
}

// All fail: "not available", with the last error; every worker shut down, every failure reported. The last try
// waits first (LAST_WAIT_MS) for the page's memory to come back.
{
  const failed: string[] = [];
  await assert.rejects(run(() => true, { wasm: true }, failed), /Out of memory/);
  assert.equal(FakeWorker.made.length, 3);
  assert.ok(FakeWorker.made.every((w) => w.disposed), "nothing left alive");
  assert.deepEqual(failed, ["wasm: RangeError: Out of memory (retrying)", "wasm/1: RangeError: Out of memory (retrying)", "wasm/1: RangeError: Out of memory"]);
  assert.ok((loadAttempts({ wasm: true })[2].waitMs ?? 0) >= 1000, "the last try waits");
  console.log("model start: every try fails → unavailable, every worker shut down, every error reported: ok");
}
// Out of memory twice, then the page has settled: the third try (after its wait) starts.
{
  const r = await run((i) => i < 2, { wasm: false });
  assert.equal(r.tries, 3);
  assert.equal(FakeWorker.made.length, 3);
  console.log("model start: out of memory twice → the delayed third try starts: ok");
}

// The frames' transfer list: every map its own buffer, or the post throws (as the worker's postMessage does).
{
  const frame = (i: number): SessionFrameOut => ({ i, alpha: new Uint8Array([1, 0]), nearQ: new Uint8Array([1, 0]), excQ: null, depQ: new Uint8Array([1, 255]), pop: null });
  const ok = [frame(0), { ...frame(1), excQ: new Uint8Array([2, 0]) }];
  assert.equal(frameTransfers(ok).length, 7);
  const got = postFrames(ok);
  assert.deepEqual([...got[1].excQ!], [2, 0]);
  assert.equal(ok[0].alpha.byteLength, 0, "handed over: the sender's copy is detached, as in the worker");
  // What the first version of the early frames did: one frame's arrays under several frame numbers.
  const first = frame(0);
  assert.throws(() => postFrames([first, { ...first, i: 1 }]), /DataCloneError|duplicate|detached|transfer/i, "one buffer twice in the transfer list throws");
  const a = frame(0);
  assert.throws(() => postFrames([{ ...a, nearQ: a.alpha }]), /DataCloneError|duplicate|detached|transfer/i, "two maps of one frame on one buffer throw");
  console.log("frames: posted through the worker's transfer rules; a buffer named twice throws: ok");
}
