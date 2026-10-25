// Split / per-segment maths (pure).
//   node --experimental-strip-types apps/studio/test/segments.test.ts
import assert from "node:assert/strict";
import {
  MIN_SEGMENT_SEC,
  activeCuts,
  isSplit,
  lockWithCuts,
  lookAfterRemove,
  lookIndexAt,
  moveCut,
  removeCut,
  segmentAtTime,
  segmentNumber,
  splitAt,
  topUpTimes,
  visibleSegments,
  type Segments,
} from "../src/pipeline/segments.ts";

type L = string;
const D = 10;
const none: Segments<L> = { cuts: [], looks: [] };

// ---- split
const s1 = splitAt(none, 3, null, D, "A")!;
assert.deepEqual(s1, { cuts: [3], looks: ["A", "A"] }, "the first split creates two regions with the clip's look");
const s1b: Segments<L> = { cuts: s1.cuts, looks: ["A", "B"] };
const s2 = splitAt(s1b, 6, null, D, "x")!;
assert.deepEqual(s2, { cuts: [3, 6], looks: ["A", "B", "B"] }, "the split region's look is copied to both halves");
assert.deepEqual(splitAt(s1b, 1, null, D, "x"), { cuts: [1, 3], looks: ["A", "A", "B"] }, "splitting left of an existing cut");
assert.equal(splitAt(s1b, 3.2, null, D, "x"), null, "too close to an existing cut");
assert.equal(splitAt(s1b, 0.2, null, D, "x"), null, "too close to the clip start");
assert.equal(splitAt(s1b, 9.8, null, D, "x"), null, "too close to the clip end");
assert.equal(splitAt(s1b, NaN, null, D, "x"), null);
assert.ok(splitAt(s1b, 3 + MIN_SEGMENT_SEC, null, D, "x"), "exactly the minimum away is fine");

// ---- trim interaction
const trim = { start: 2, end: 8 };
assert.equal(splitAt(none, 1, trim, D, "A"), null, "a split outside the trim is ignored");
assert.equal(splitAt(none, 8.5, trim, D, "A"), null, "a split outside the trim is ignored (right)");
assert.equal(splitAt(none, 2.2, trim, D, "A"), null, "too close to the trim's in point");
assert.ok(splitAt(none, 5, trim, D, "A"));

const three: Segments<L> = { cuts: [3, 6], looks: ["A", "B", "C"] };
assert.deepEqual(activeCuts(three.cuts, null, D), [0, 1]);
assert.deepEqual(activeCuts(three.cuts, { start: 4, end: 10 }, D), [1], "a cut before the trim is ignored");
assert.deepEqual(activeCuts(three.cuts, { start: 2.7, end: 10 }, D), [1], "a cut within the minimum of the trim's in point is ignored");
assert.deepEqual(activeCuts(three.cuts, { start: 0, end: 6.2 }, D), [0], "… and of its out point");
assert.equal(isSplit(three.cuts, { start: 3.5, end: 5.5 }, D), false, "trimmed between the cuts: one segment");

assert.deepEqual(visibleSegments(three.cuts, null, D), [
  { look: 0, start: 0, end: 3 },
  { look: 1, start: 3, end: 6 },
  { look: 2, start: 6, end: 10 },
]);
assert.deepEqual(visibleSegments(three.cuts, { start: 4, end: 9 }, D), [
  { look: 1, start: 4, end: 6 },
  { look: 2, start: 6, end: 9 },
], "trimmed past the first cut: the first segment is region 1's");
assert.deepEqual(visibleSegments(three.cuts, { start: 3.5, end: 5.5 }, D), [{ look: 1, start: 3.5, end: 5.5 }]);
assert.deepEqual(visibleSegments(three.cuts, { start: 7, end: 9 }, D), [{ look: 2, start: 7, end: 9 }]);
assert.deepEqual(visibleSegments([], null, D), [{ look: 0, start: 0, end: 10 }]);

// ---- time → segment
assert.equal(lookIndexAt(three.cuts, 0, null, D), 0);
assert.equal(lookIndexAt(three.cuts, 2.99, null, D, 30), 1, "the frame within half a frame of the cut opens the next segment");
assert.equal(lookIndexAt(three.cuts, 2.95, null, D, 30), 0);
// 30 fps frame grid: frame 89 (2.9667 s) is the last of segment 1, frame 90 (3.0 s) the first of segment 2.
assert.equal(lookIndexAt(three.cuts, 89 / 30, null, D, 30), 0);
assert.equal(lookIndexAt(three.cuts, 90 / 30, null, D, 30), 1);
assert.equal(lookIndexAt(three.cuts, 6.5, null, D), 2);
assert.equal(lookIndexAt(three.cuts, 9.99, null, D), 2);
assert.equal(lookIndexAt(three.cuts, 4.5, { start: 4, end: 9 }, D), 1);
assert.equal(lookIndexAt(three.cuts, 4.5, { start: 3.5, end: 5.5 }, D), 1, "a lone visible segment uses its own region");
assert.equal(lookIndexAt([], 4, null, D), 0);
assert.equal(segmentAtTime(three.cuts, 4, null, D).look, 1);
assert.equal(segmentAtTime(three.cuts, 0, null, D).look, 0);

assert.deepEqual(segmentNumber(three.cuts, 1, null, D), { index: 2, count: 3 });
assert.deepEqual(segmentNumber(three.cuts, 2, { start: 4, end: 9 }, D), { index: 2, count: 2 });
assert.equal(segmentNumber(three.cuts, 0, { start: 4, end: 9 }, D), null, "a region outside the trim has no number");
assert.equal(segmentNumber([], 0, null, D), null, "unsplit: no segment label");

// ---- merge
assert.deepEqual(removeCut(three, 0), { cuts: [6], looks: ["A", "C"] }, "removing a cut keeps the left look");
assert.deepEqual(removeCut(three, 1), { cuts: [3], looks: ["A", "B"] });
assert.deepEqual(removeCut(removeCut(three, 1), 0), { cuts: [], looks: ["A"] });
assert.equal(removeCut(three, 5), three, "out of range: unchanged");
assert.equal(lookAfterRemove(2, 0), 1);
assert.equal(lookAfterRemove(1, 0), 0, "the right half of a merge selects the merged segment");
assert.equal(lookAfterRemove(0, 0), 0);

// ---- drag
assert.deepEqual(moveCut(three.cuts, 0, 4, null, D), [4, 6]);
assert.deepEqual(moveCut(three.cuts, 0, 5.9, null, D), [6 - MIN_SEGMENT_SEC, 6], "stops the minimum short of the next cut");
assert.deepEqual(moveCut(three.cuts, 0, -2, null, D), [MIN_SEGMENT_SEC, 6], "… and of the clip start");
assert.deepEqual(moveCut(three.cuts, 1, 12, null, D), [3, D - MIN_SEGMENT_SEC]);
assert.deepEqual(moveCut(three.cuts, 1, 2, { start: 0, end: 8 }, D), [3, 3 + MIN_SEGMENT_SEC]);
assert.deepEqual(moveCut(three.cuts, 1, 9, { start: 0, end: 8 }, D), [3, 8 - MIN_SEGMENT_SEC], "kept inside the trim");
assert.deepEqual(moveCut([1, 5], 1, 0.5, { start: 2, end: 9 }, D), [1, 2 + MIN_SEGMENT_SEC], "an ignored cut before the trim doesn't limit the drag past it… but the trim does");

// ---- scene lock with the cuts forced in
const med = (ps: number[]) => [...ps].sort((a, b) => a - b)[Math.floor(ps.length / 2)];
const samples = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5].map((t) => ({ t, params: t * 10 }));
const auto = [{ from: 0, params: 50 }];
assert.equal(lockWithCuts(auto, samples, [], med), auto, "no cuts: the automatic lock unchanged");
assert.equal(lockWithCuts(null, samples, [3], med), null, "no automatic lock: stays unlocked");
const l1 = lockWithCuts(auto, samples, [3], med, 30)!;
assert.equal(l1.length, 2);
assert.deepEqual(l1[0], { from: 0, params: 15 }, "segment 1 locks the median of its own samples");
assert.equal(l1[1].params, 65, "segment 2 too");
assert.ok(Math.abs(l1[1].from - (3 - 1 / 60)) < 1e-9, "the new lock starts half a frame before the cut (the cut's own frame is in)");
assert.equal(l1[1].window, undefined, "a user cut is exact: no detection window");

const sparse = [{ t: 1, params: 10 }, { t: 2, params: 20 }, { t: 8, params: 80 }];
const l2 = lockWithCuts(auto, sparse, [5], med)!;
assert.equal(l2[0].params, 20);
assert.equal(l2[1].params, 50, "under 2 samples: the automatic estimate");

// An automatic scene cut (windowed) inside the second segment keeps its window, clipped to it.
const auto2 = [{ from: 0, params: 1 }, { from: 6, params: 2, window: [5.5, 6.5] as [number, number] }];
const l3 = lockWithCuts(auto2, samples, [3], med)!;
assert.equal(l3.length, 3);
assert.equal(l3[0].from, 0);
assert.ok(l3[1].from < 3 && l3[1].from > 2.9);
assert.deepEqual(l3[2], { from: 6, params: 85, window: [5.5, 6.5] });
// … and a user cut inside an automatic window clips that window.
const l4 = lockWithCuts(auto2, samples, [6.2], med, 30)!;
assert.equal(l4.length, 3);
assert.deepEqual(l4[1].window, [5.5, 6.2]);
assert.equal(l4[2].window, undefined);
assert.ok(l4.every((s, i) => i === 0 || s.from > l4[i - 1].from), "segments in time order");

// ---- profile top-up: every segment gets two samples of its own
const segs = visibleSegments([3, 3.6], null, D);
const base = [0.5, 2, 5, 8];
const extra = topUpTimes(base, segs);
assert.equal(extra.length, 2, "only the 0.6 s middle segment needs samples");
assert.ok(extra.every((t) => t > 3 && t < 3.6));
assert.deepEqual(topUpTimes(base, visibleSegments([], null, D)), [], "unsplit: nothing extra");

console.log("segments tests passed");
