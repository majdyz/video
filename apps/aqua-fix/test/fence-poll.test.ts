// The GPU fence wait (pure scheduling, no GPU): task-speed polls first, timer polls after, always bounded.
//   node --experimental-strip-types apps/aqua-fix/test/fence-poll.test.ts
import assert from "node:assert/strict";
import { pollFence, yieldTask, type FenceStatus } from "../src/engine/fence-poll.ts";

/** A fake event loop: a clock, a task queue (each task costs `taskMs`) and timers (clamped to 4 ms, as nested timers are). */
function harness(taskMs = 0.1) {
  let clock = 0;
  const tasks: (() => void)[] = [];
  const timers: { at: number; fn: () => void }[] = [];
  const count = { fast: 0, slow: 0 };
  const opts = {
    now: () => clock,
    yieldTask: (fn: () => void) => { count.fast++; tasks.push(fn); },
    setTimer: (fn: () => void, ms: number) => { count.slow++; timers.push({ at: clock + Math.max(4, ms), fn }); },
  };
  /** Runs the loop until it is idle (or `limit` steps: a spin would never end). */
  const run = (limit = 1e6) => {
    for (let i = 0; i < limit; i++) {
      const task = tasks.shift();
      if (task) { clock += taskMs; task(); continue; }
      timers.sort((a, b) => a.at - b.at);
      const t = timers.shift();
      if (!t) return true;
      clock = Math.max(clock, t.at);
      t.fn();
    }
    return false;
  };
  return { opts, run, count, time: () => clock, advance: (ms: number) => { clock += ms; } };
}
const settled = async (p: Promise<void>) => p.then(() => "ok", (e: Error) => e.message);

// Already signalled: resolves at once, nothing scheduled.
{
  const h = harness();
  const p = pollFence(() => "done", h.opts);
  assert.equal(h.count.fast + h.count.slow, 0);
  assert.equal(await settled(p), "ok");
}

// Ready after 2 ms: found by task-speed polls, no timer (the old loop waited a clamped 4 ms at least).
{
  const h = harness();
  const p = pollFence((): FenceStatus => (h.time() >= 2 ? "done" : "wait"), h.opts);
  assert.equal(h.run(), true);
  assert.equal(await settled(p), "ok");
  assert.equal(h.count.slow, 0, "no timer for a fence that is ready within the fast window");
  assert.ok(h.time() < 2.5, `resolved at ${h.time()} ms, well under the 4 ms clamp`);
}

// Ready after 200 ms: the fast window ends at fastMs, timers take over (no spin).
{
  const h = harness();
  const p = pollFence((): FenceStatus => (h.time() >= 200 ? "done" : "wait"), { ...h.opts, fastMs: 12 });
  assert.equal(h.run(), true);
  assert.equal(await settled(p), "ok");
  assert.ok(h.count.fast <= 12 / 0.1 + 1, `fast polls bounded by the window (${h.count.fast})`);
  assert.ok(h.count.slow >= 40 && h.count.slow <= 50, `timer polls for the rest (${h.count.slow})`);
}

// Never ready: rejects after the bounded timer polls (no hang).
{
  const h = harness();
  const p = pollFence(() => "wait", { ...h.opts, maxSlowTries: 25 });
  assert.equal(h.run(), true, "the loop goes idle");
  assert.equal(await settled(p), "GPU readback timed out");
  assert.equal(h.count.slow, 25);
}

// A clock that does not advance: the fast polls are capped by count too.
{
  const h = harness(0);
  const p = pollFence(() => "wait", { ...h.opts, maxFastTries: 50, maxSlowTries: 3 });
  assert.equal(h.run(10_000), true, "no endless task loop");
  assert.equal(await settled(p), "GPU readback timed out");
  assert.equal(h.count.fast, 50);
}

// WAIT_FAILED and a throwing check reject; the label is the message.
{
  const h = harness();
  assert.equal(await settled(pollFence(() => "failed", { ...h.opts, label: "lost" })), "lost");
  assert.equal(await settled(pollFence(() => { throw new Error("context lost"); }, h.opts)), "context lost");
  assert.equal(h.count.fast + h.count.slow, 0);
}

// fastMs 0: straight to timers (the old behaviour).
{
  const h = harness();
  let n = 0;
  const p = pollFence((): FenceStatus => (++n > 3 ? "done" : "wait"), { ...h.opts, fastMs: 0 });
  h.run();
  assert.equal(await settled(p), "ok");
  assert.deepEqual(h.count, { fast: 0, slow: 3 });
}

// The real yieldTask: runs in order, in later tasks, and lets the process exit.
{
  const order: number[] = [];
  await new Promise<void>((done) => {
    yieldTask(() => order.push(1));
    yieldTask(() => { order.push(2); done(); });
    order.push(0);
  });
  assert.deepEqual(order, [0, 1, 2]);
  // And the real defaults end to end.
  let n = 0;
  await pollFence((): FenceStatus => (++n > 5 ? "done" : "wait"));
  assert.equal(n, 6);
}
console.log("ok  fence poll");
