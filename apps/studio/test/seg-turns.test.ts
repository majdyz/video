// AI subject detection, one heavy job at a time on the main thread (seg/turns.ts): the seed frame's analysis and a
// tap take turns (iPhone crash, 12 Nov: the tap's track, the seed frame's analysis and the model's search alive
// together).
//   node --experimental-strip-types apps/studio/test/seg-turns.test.ts
import assert from "node:assert/strict";
import { SegTurns } from "../src/pipeline/seg/turns.ts";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// A seed frame job waits for the tap; a tap waits for the seed frame in the engine; never both at once.
{
  let tap = false, active = 0, peak = 0;
  const log: string[] = [];
  const turns = new SegTurns({ tapActive: () => tap, log: (m) => log.push(m) });
  const heavy = async (what: string, ms: number) => {
    active++;
    peak = Math.max(peak, active);
    log.push(`${what} runs`);
    await sleep(ms);
    active--;
  };
  /** A tap as SubjectSeg.include does it: marked at once, sent after the seed frame in the engine, over when the
   * session says so. */
  const doTap = async (ms: number) => {
    tap = true;
    await turns.seedIdle();
    await heavy("tap", ms);
    tap = false;
    turns.tapEnded();
  };

  // The tap is being followed when the session's request for seeds is answered: the seed frame waits.
  const t1 = doTap(20);
  const s1 = turns.seedJob("8.00s", () => heavy("seed 8", 10));
  await sleep(5);
  assert.equal(turns.seedBusy, false, "not started while the tap is followed");
  await Promise.all([t1, s1]);
  assert.deepEqual(log, ["tap runs", "ai: job m1 seed 8.00s start", "seed 8 runs", "ai: job m1 seed 8.00s end: done"]);

  // The seed frame is in the engine when the user taps: the tap goes to the session after it.
  log.length = 0;
  const s2 = turns.seedJob("16.00s", () => heavy("seed 16", 20));
  await sleep(5);
  assert.equal(turns.seedBusy, true);
  const t2 = doTap(10);
  // And the next seed frame, asked for meanwhile, after both.
  const s3 = turns.seedJob("24.00s", () => heavy("seed 24", 5));
  await Promise.all([s2, t2, s3]);
  assert.deepEqual(log, [
    "ai: job m2 seed 16.00s start", "seed 16 runs", "ai: job m2 seed 16.00s end: done",
    "tap runs",
    "ai: job m3 seed 24.00s start", "seed 24 runs", "ai: job m3 seed 24.00s end: done",
  ]);
  assert.equal(peak, 1, "one heavy job at a time");
  console.log("turns: a tap and the seed frame's analysis take turns: ok");
}

// A job that throws ends (the next one runs), and says so.
{
  const log: string[] = [];
  const turns = new SegTurns({ tapActive: () => false, log: (m) => log.push(m) });
  await assert.rejects(turns.seedJob("1.00s", async () => { throw new Error("clip changed"); }), /clip changed/);
  assert.equal(turns.seedBusy, false);
  assert.equal(await turns.seedJob("2.00s", async () => 7), 7);
  assert.deepEqual(log, ["ai: job m1 seed 1.00s start", "ai: job m1 seed 1.00s end: failed", "ai: job m2 seed 2.00s start", "ai: job m2 seed 2.00s end: done"]);
  console.log("turns: a failed seed frame job ends: ok");
}

// A tap whose end is never heard does not stop the pass for good; a seed frame that hangs does not hold a tap.
{
  const log: string[] = [];
  const turns = new SegTurns({ tapActive: () => true, log: (m) => log.push(m), maxTapWaitMs: 20, maxSeedWaitMs: 20 });
  let release!: () => void;
  const hung = turns.seedJob("8.00s", () => new Promise<void>((r) => { release = r; }));
  await sleep(60);
  assert.equal(turns.seedBusy, true, "went on after the wait");
  assert.equal(log[0], "ai: seed 8.00s: a tap is still busy; going on");
  const t1 = Date.now();
  await turns.seedIdle();
  assert.ok(Date.now() - t1 < 500, "the tap goes on after its own wait");
  release();
  await hung;
  console.log("turns: both waits are bounded: ok");
}
