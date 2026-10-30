// Clip profile samples are retried with longer budgets instead of dropped (profile-retry.ts).
//   node --experimental-strip-types apps/studio/test/profile-retry.test.ts
import assert from "node:assert/strict";
import { PROFILE_SAMPLE_BUDGETS_MS, withRetries } from "../src/pipeline/profile-retry.ts";

// A sample that times out twice under load still votes, with growing budgets.
{
  const budgets: number[] = [];
  const retries: number[] = [];
  const r = await withRetries(async (budget) => {
    budgets.push(budget);
    if (budgets.length < 3) throw new Error("Frame analysis timed out");
    return "params";
  }, PROFILE_SAMPLE_BUDGETS_MS, () => true, (n) => retries.push(n));
  assert.equal(r, "params");
  assert.deepEqual(budgets, [10_000, 20_000, 40_000]);
  assert.deepEqual(retries, [1, 2]);
}

// The first attempt that works is used; no extra attempts.
{
  let calls = 0;
  assert.equal(await withRetries(async () => ++calls), 1);
  assert.equal(calls, 1);
}

// Every attempt failed: left out (null), not thrown.
{
  let calls = 0;
  assert.equal(await withRetries(async () => { calls++; throw new Error("GPU readback timed out"); }), null);
  assert.equal(calls, PROFILE_SAMPLE_BUDGETS_MS.length);
}

// A newer clip (generation changed) stops the retries.
{
  let calls = 0, alive = true;
  const r = await withRetries(async () => { calls++; alive = false; throw new Error("timed out"); }, [1, 2, 3], () => alive);
  assert.equal(r, null);
  assert.equal(calls, 1);
}

// Budgets grow: a slow device gets more time per sample, never less.
for (let i = 1; i < PROFILE_SAMPLE_BUDGETS_MS.length; i++) assert.ok(PROFILE_SAMPLE_BUDGETS_MS[i] > PROFILE_SAMPLE_BUDGETS_MS[i - 1]);
console.log("profile-retry tests passed");
