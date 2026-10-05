// Segment selection of the clip lock (pure logic, no GPU): the estimate in
// force must follow the segment of the current time and the median of each.
//   node --experimental-strip-types apps/aqua-fix/test/lock.test.ts
import assert from "node:assert/strict";
import { IDENTITY_PARAMS, medianParams } from "../src/engine/params.ts";

// Mirror of GradeEngine.lockedAt (kept trivial so a divergence would be obvious).
type Seg = { from: number; params: typeof IDENTITY_PARAMS };
function lockedAt(segs: Seg[], t: number) {
  const sorted = [...segs].sort((a, b) => a.from - b.from);
  let seg = sorted[0];
  for (const s of sorted) if (t >= s.from) seg = s;
  return seg.params;
}
const A = { ...IDENTITY_PARAMS, wb: [2.0, 1, 0.9] as [number, number, number] };
const B = { ...IDENTITY_PARAMS, wb: [1.1, 1, 1.3] as [number, number, number] };
const segs: Seg[] = [{ from: 4.2, params: B }, { from: 0, params: A }];
assert.deepEqual(lockedAt(segs, 0).wb, A.wb);
assert.deepEqual(lockedAt(segs, 4.19).wb, A.wb);
assert.deepEqual(lockedAt(segs, 4.2).wb, B.wb);
assert.deepEqual(lockedAt(segs, 99).wb, B.wb);
// Before the first segment's start (negative / pre-roll) the first one applies.
assert.deepEqual(lockedAt(segs, -1).wb, A.wb);
// A segment's params are the median of its samples, unaffected by the other segment.
const med = medianParams([A, A, { ...A, wb: [2.4, 1, 0.9] }]);
assert.deepEqual(med.wb, A.wb);
console.log("ok  lock segments");

// Windowed segments: a cut profiled between two samples switches at the
// observed cut, or at the window's end when none is seen.
{
  const { segmentAt, inCutWindow, noteCut } = await import("../src/engine/lock.ts");
  const A = { ...IDENTITY_PARAMS, exposure: 1 }, B = { ...IDENTITY_PARAMS, exposure: 2 };
  const segs = [{ from: 0, params: A }, { from: 4.1, window: [3.7, 4.5] as [number, number], params: B }];
  const seen = new Map<number, number>();
  assert.equal(segmentAt(segs, seen, 4.2).params, A, "before the window ends and no cut seen: still A");
  assert.equal(segmentAt(segs, seen, 4.5).params, B, "window end: B");
  assert.equal(inCutWindow(segs, seen, 3.9), true);
  assert.equal(inCutWindow(segs, seen, 3.0), false);
  noteCut(segs, seen, 3.0); // outside the window: ignored
  assert.equal(seen.size, 0);
  noteCut(segs, seen, 4.2);
  assert.equal(segmentAt(segs, seen, 4.19).params, A);
  assert.equal(segmentAt(segs, seen, 4.2).params, B, "from the observed cut: B");
  assert.equal(inCutWindow(segs, seen, 4.3), false, "cut seen: no longer waiting");
  console.log("ok  windowed segments");
}

