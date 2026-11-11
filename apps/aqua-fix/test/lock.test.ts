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


// The lock over time (lock-track.ts): frozen inside a shot, whole at a cut, in step with the picture through a
// profiled change without a cut (a dissolve), and a function of clip time outside one.
{
  const { LockTrack, fadeProgress } = await import("../src/engine/lock-track.ts");
  type V = [number, number, number];
  const A = { ...IDENTITY_PARAMS, wb: [1, 1, 1] as V, exposure: 1 };
  const B = { ...IDENTITY_PARAMS, wb: [4, 1, 1] as V, exposure: 2 };
  const mA: V = [0.5, 0.5, 0.5], mB: V = [0.1, 0.6, 0.3];
  const mix = (k: number): V => [mA[0] + (mB[0] - mA[0]) * k, mA[1] + (mB[1] - mA[1]) * k, mA[2] + (mB[2] - mA[2]) * k];
  assert.equal(fadeProgress([mA, mB], mA), 0);
  assert.equal(fadeProgress([mA, mB], mB), 1);
  assert.ok(Math.abs(fadeProgress([mA, mB], mix(0.3)) - 0.3) < 1e-9);
  const segs = () => [{ from: 0, params: A }, { from: 3.5, window: [3, 4] as [number, number], means: [mA, mB] as [V, V], params: B }];

  // A dissolve from 3.2 to 3.8 s, analysed every 0.1 s, played at 30 fps: the red gain moves with the picture,
  // never before it, never back, without a step, and is B's by the window's end.
  const tr0 = new LockTrack(segs());
  const d: { t: number; wb: number }[] = [];
  let slot = -1;
  for (let f = 0; f <= 150; f++) {
    const t = f / 30;
    tr0.advance(t);
    const s = Math.floor(t / 0.1 + 1e-6);
    if (s !== slot) { slot = s; tr0.noteFrame(mix(Math.min(1, Math.max(0, (t - 3.2) / 0.6))), t); }
    d.push({ t, wb: tr0.paramsAt(t).wb[0] });
  }
  for (const x of d) if (x.t < 3.2) assert.equal(x.wb, 1, `the lock moved before the picture did (t=${x.t.toFixed(2)})`);
  for (let i = 1; i < d.length; i++) {
    assert.ok(d[i].wb >= d[i - 1].wb - 1e-9, "the lock never goes back through a dissolve");
    assert.ok(d[i].wb / d[i - 1].wb < 1.35, `the lock stepped ×${(d[i].wb / d[i - 1].wb).toFixed(2)} in one frame at ${d[i].t.toFixed(2)} s`);
  }
  const at = (t: number) => d.find((x) => x.t >= t)!.wb;
  assert.ok(at(3.5) > 1.1 && at(3.5) < 3.5 && at(3.8) > 1.8, `mid-dissolve the lock is between the two, about a quarter of a second behind the picture (${at(3.5).toFixed(2)})`);
  assert.ok(at(4.2) > 3.5 && at(4.6) === 4, "after the window the new estimate is in force");
  assert.equal(new LockTrack(segs()).index(2), 0);

  // Frozen inside a shot: whatever the analyses say outside a window, the estimate does not move.
  {
    const tr = new LockTrack(segs());
    for (let t = 0; t < 2.9; t += 0.1) { tr.advance(t); tr.noteFrame(mix(Math.random()), t); assert.deepEqual(tr.paramsAt(t).wb, A.wb); }
    for (let t = 4.6; t < 8; t += 0.1) { tr.advance(t); tr.noteFrame(mix(Math.random()), t); assert.deepEqual(tr.paramsAt(t).wb, B.wb); }
  }
  // One odd frame inside the window (a flash) does not move the lock: two analyses in a row must agree.
  {
    const tr = new LockTrack(segs());
    tr.advance(3.0); tr.noteFrame(mA, 3.0);
    tr.advance(3.1); tr.noteFrame(mB, 3.1);
    tr.advance(3.2); tr.noteFrame(mA, 3.2);
    tr.advance(3.3); tr.noteFrame(mA, 3.3);
    tr.advance(3.4);
    assert.equal(tr.paramsAt(3.4).wb[0], 1);
  }
  // A cut seen inside the window: whole, at the cut.
  {
    const tr = new LockTrack(segs());
    tr.advance(3.3);
    assert.equal(tr.inCutWindow(3.3), true);
    tr.noteCut(3.3);
    tr.advance(3.3, true);
    assert.deepEqual(tr.paramsAt(3.3).wb, B.wb);
    assert.equal(tr.index(3.3), 1);
    assert.equal(tr.inCutWindow(3.4), false);
  }
  // A seek: the estimate at a time outside a window does not depend on where playback came from.
  {
    const tr = new LockTrack(segs());
    tr.advance(6);
    assert.deepEqual(tr.paramsAt(6).wb, B.wb);
    tr.advance(1);
    assert.deepEqual(tr.paramsAt(1).wb, A.wb);
    tr.advance(4.2);
    assert.deepEqual(tr.paramsAt(4.2).wb, B.wb, "past the window: B, whether or not the window was played");
    tr.reset();
    tr.advance(3.5, true);
    assert.deepEqual(tr.paramsAt(3.5).wb, A.wb, "a seek into a window nothing was seen of: still A");
  }
  // The shot's balance curve rides on its segment: frozen (one knot) or easing with clip time.
  {
    const tr = new LockTrack([{ from: 0, params: A }]);
    tr.curves = [{ t: [2], r: [Math.log(1.2)], b: [0] }];
    assert.ok(Math.abs(tr.paramsAt(0).wb[0] - 1.2) < 1e-9 && Math.abs(tr.paramsAt(7).wb[0] - 1.2) < 1e-9, "a frozen shot has one balance");
    assert.equal(tr.paramsAt(3, false).wb[0], 1, "?follow=0: the plain lock");
    tr.curves = [{ t: [1, 5], r: [0, Math.log(1.4)], b: [0, 0] }];
    assert.equal(tr.paramsAt(0.5).wb[0], 1);
    assert.ok(Math.abs(tr.paramsAt(3).wb[0] - Math.sqrt(1.4)) < 1e-9);
    assert.ok(Math.abs(tr.paramsAt(9).wb[0] - 1.4) < 1e-9);
  }
  console.log("ok  lock track: frozen in a shot, whole at a cut, with the picture through a dissolve, seek-proof");
}

// Profile segmentation: a change must still be there one sample on (exposure that pumps is not a cut), and a
// windowed segment carries the means either side of its window.
{
  const { segmentProfile } = await import("../src/engine/profile.ts");
  type V = [number, number, number];
  const P = (t: number, v: number, wbR = 1) => ({ t, params: { ...IDENTITY_PARAMS, wb: [wbR, 1, 1] as V }, mean: [v, v, v] as V });
  const pump = segmentProfile([P(0.6, 0.53), P(1.6, 0.41), P(2.6, 0.48), P(3.5, 0.41), P(4.5, 0.45), P(5.4, 0.41)], 0.16);
  assert.equal(pump!.length, 1, "pumping exposure split the shot");
  const cutClip = segmentProfile([P(0.6, 0.5), P(1.6, 0.5), P(2.6, 0.5), P(3.5, 0.2, 3), P(4.5, 0.2, 3), P(5.4, 0.21, 3)], 0.16);
  assert.equal(cutClip!.length, 2);
  assert.deepEqual(cutClip![1].window, [2.6, 3.5]);
  assert.deepEqual(cutClip![1].means, [[0.5, 0.5, 0.5], [0.2, 0.2, 0.2]]);
  console.log("ok  profile: pumping exposure is one shot; a real change splits and keeps its means");
}
