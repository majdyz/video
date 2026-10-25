// Trim range maths and time mapping (pure).
//   node --experimental-strip-types apps/studio/test/trim.test.ts
import assert from "node:assert/strict";
import {
  ANALYSIS_MARGIN_SEC,
  MIN_TRIM_SEC,
  analysisSpan,
  audioPacketTime,
  clampRange,
  clampToRange,
  effectiveTrim,
  filmstripTimes,
  formatClock,
  formatTimecode,
  frameInRange,
  fullRange,
  isTrimmed,
  loopTarget,
  moveHandle,
  nearestHandle,
  outputLength,
  outputTime,
  pctOf,
  rangeTimes,
  selectionLabel,
  spanCovers,
  spanServes,
  timeAtX,
  trimAt,
} from "../src/pipeline/trim.ts";
import { profileTimes } from "../../aqua-fix/src/engine/profile.ts";
import { spanTimes } from "../../motion-fix/src/lib/gyro/gyro-stabilize.ts";

const near = (a: number, b: number, eps = 1e-9, msg?: string) => assert.ok(Math.abs(a - b) <= eps, msg ?? `${a} ≉ ${b}`);

// ---- ranges
assert.deepEqual(fullRange(6), { start: 0, end: 6 });
assert.deepEqual(clampRange({ start: 2, end: 4 }, 6), { start: 2, end: 4 });
assert.deepEqual(clampRange({ start: 4, end: 2 }, 6), { start: 2, end: 4 }, "swapped ends are reordered");
assert.deepEqual(clampRange({ start: -1, end: 9 }, 6), { start: 0, end: 6 }, "clamped into the clip");
assert.deepEqual(clampRange({ start: 3, end: 3.1 }, 6), { start: 3, end: 3 + MIN_TRIM_SEC }, "minimum length");
assert.deepEqual(clampRange({ start: 5.9, end: 6 }, 6), { start: 6 - MIN_TRIM_SEC, end: 6 }, "minimum length at the clip's end");
assert.deepEqual(clampRange({ start: 0, end: 0.1 }, 0.3), { start: 0, end: 0.3 }, "a clip shorter than the minimum is kept whole");
assert.deepEqual(clampRange({ start: NaN, end: NaN }, 6), { start: 0, end: 6 });

assert.equal(isTrimmed(null, 6), false);
assert.equal(isTrimmed({ start: 0, end: 6 }, 6), false);
assert.equal(isTrimmed({ start: 0.0005, end: 5.9995 }, 6), false, "sub-millisecond edges are the clip's own");
assert.equal(isTrimmed({ start: 2, end: 6 }, 6), true);
assert.equal(isTrimmed({ start: 0, end: 4 }, 6), true);
assert.equal(effectiveTrim({ start: 0, end: 6 }, 6), null);
assert.deepEqual(effectiveTrim({ start: 2, end: 4 }, 6), { start: 2, end: 4 });

near(outputLength(null, 6), 6);
near(outputLength({ start: 2, end: 4 }, 6), 2);
near(outputLength({ start: 0, end: 6 }, 6), 6);

// ---- analysis span: the range plus the margin, inside the clip
assert.equal(ANALYSIS_MARGIN_SEC, 0.5);
assert.deepEqual(analysisSpan({ start: 2, end: 4 }, 6), { start: 1.5, end: 4.5 });
assert.deepEqual(analysisSpan({ start: 0.2, end: 4 }, 6), { start: 0, end: 4.5 }, "clamped at the start");
assert.equal(analysisSpan({ start: 0.2, end: 5.8 }, 6), null, "a margin reaching both ends is the whole clip");
assert.equal(analysisSpan(null, 6), null);

assert.equal(spanCovers(null, { start: 1, end: 2 }), true, "the whole clip covers anything");
assert.equal(spanCovers({ start: 1, end: 3 }, null), false);
assert.equal(spanCovers({ start: 1, end: 3 }, { start: 1, end: 3 }), true);
assert.equal(spanCovers({ start: 1, end: 3 }, { start: 0.9, end: 3 }), false);
assert.equal(spanServes({ start: 1.5, end: 4.5 }, { start: 2, end: 4 }, 60), true);
assert.equal(spanServes({ start: 1.5, end: 4.5 }, { start: 1, end: 4 }, 60), false, "extended past the analysed span: re-run");
assert.equal(spanServes(null, { start: 10, end: 12 }, 600), false, "a whole 10-min analysis is far more than a 2 s trim needs");
assert.equal(spanServes(null, { start: 1, end: 5 }, 6), true, "a 6 s analysis is fine for a 4 s trim");

// ---- frames in the output: 2.0–4.0 s of a 29.97 fps clip
const fps = 30000 / 1001;
const frameTimes = Array.from({ length: 180 }, (_, i) => i / fps);
const kept = frameTimes.filter((t) => frameInRange(t, { start: 2, end: 4 }, fps));
assert.equal(kept.length, 60, "2 s at 29.97 fps is 60 frames");
near(kept[0], 60 / fps, 1e-9, "first kept frame is #60");
// Timestamps slightly off the grid still give the same frames.
const jittered = frameTimes.map((t, i) => t + (i % 2 ? 0.003 : -0.003));
assert.equal(jittered.filter((t) => frameInRange(t, { start: 2, end: 4 }, fps)).length, 60);
assert.equal(frameTimes.filter((t) => frameInRange(t, null, fps)).length, 180);
assert.equal(frameTimes.filter((t) => frameInRange(t, { start: 0, end: 6.006 }, fps)).length, 180, "full range keeps every frame");
// 25 fps: 1.0–1.5 s = 12 or 13 frames depending on the edges; [1.0, 1.48) holds 12.
assert.equal(Array.from({ length: 100 }, (_, i) => i / 25).filter((t) => frameInRange(t, { start: 1, end: 1.5 }, 25)).length, 12);

near(outputTime(kept[0], kept[0]), 0);
near(outputTime(kept[59], kept[0]), 59 / fps, 1e-9);
near(outputTime(1.9, 2), 0, 0, "never negative");

// ---- audio packets: 1024-sample AAC at 48 kHz, trim 2.0–4.0
const aDur = 1024 / 48000;
const packets = Array.from({ length: 300 }, (_, i) => i * aDur);
const offset = kept[0];
const out = packets.map((ts) => audioPacketTime(ts, aDur, { start: 2, end: 4 }, offset)).filter((x): x is number => x !== null);
const firstIdx = packets.findIndex((ts) => ts + aDur > 2);
assert.equal(out.length, packets.filter((ts) => ts + aDur > 2 && ts < 4).length);
near(out[0], Math.max(0, packets[firstIdx] - offset), 1e-12, "first packet shifted with the video");
const audioLen = out[out.length - 1] + aDur;
assert.ok(audioLen > 1.98 && audioLen < 2.03, `audio ~2 s (${audioLen.toFixed(3)})`);
assert.equal(audioPacketTime(5, aDur, { start: 2, end: 4 }, offset), null, "after the out point");
assert.equal(audioPacketTime(1, aDur, { start: 2, end: 4 }, offset), null, "before the in point");
near(audioPacketTime(0.5, aDur, null, 0)!, 0.5, 1e-12, "untrimmed: unchanged");

// ---- preview loop and seeks
assert.equal(loopTarget(3, { start: 2, end: 4 }), null);
assert.equal(loopTarget(3.99, { start: 2, end: 4 }), 2, "the frame at the out point loops back");
assert.equal(loopTarget(5, { start: 2, end: 4 }), 2);
assert.equal(loopTarget(0, { start: 2, end: 4 }), 2, "the element's own loop (back to 0) lands at the in point");
assert.equal(loopTarget(1.99, { start: 2, end: 4 }), null, "a frame before the in point is decode slop, not a loop");
assert.equal(loopTarget(3, null), null);
assert.equal(clampToRange(1, { start: 2, end: 4 }, 6), 2);
assert.equal(clampToRange(5, { start: 2, end: 4 }, 6), 4);
assert.equal(clampToRange(5, null, 6), 5);
assert.equal(clampToRange(7, null, 6), 6);

// ---- handles
assert.deepEqual(moveHandle({ start: 2, end: 4 }, "in", 1, 6), { start: 1, end: 4 });
assert.deepEqual(moveHandle({ start: 2, end: 4 }, "in", 3.9, 6), { start: 3.5, end: 4 }, "the in handle stops the minimum before the out");
assert.deepEqual(moveHandle({ start: 2, end: 4 }, "out", 2.1, 6), { start: 2, end: 2.5 });
assert.deepEqual(moveHandle({ start: 2, end: 4 }, "out", 9, 6), { start: 2, end: 6 });
assert.deepEqual(moveHandle({ start: 2, end: 4 }, "in", -3, 6), { start: 0, end: 4 });
assert.equal(nearestHandle({ start: 2, end: 4 }, 2.2), "in");
assert.equal(nearestHandle({ start: 2, end: 4 }, 3.9), "out");
assert.equal(nearestHandle({ start: 3, end: 3 }, 2.9), "in", "collapsed range: the side pressed on");
assert.equal(nearestHandle({ start: 3, end: 3 }, 3.1), "out");

// I / O keys
assert.deepEqual(trimAt("in", 2, null, 6), { start: 2, end: 6 });
assert.deepEqual(trimAt("out", 4, { start: 2, end: 6 }, 6), { start: 2, end: 4 });
assert.deepEqual(trimAt("in", 5, { start: 2, end: 4 }, 6), { start: 5, end: 6 }, "in past the out point: a new selection to the end");
assert.deepEqual(trimAt("out", 1, { start: 2, end: 4 }, 6), { start: 0, end: 1 }, "out before the in point: a new selection from the start");
assert.deepEqual(trimAt("in", 3.8, { start: 2, end: 4 }, 6), { start: 3.5, end: 4 }, "kept the minimum apart");

// ---- pixels ↔ time
near(timeAtX(0, 300, 6), 0);
near(timeAtX(150, 300, 6), 3);
near(timeAtX(400, 300, 6), 6, 0, "clamped");
near(timeAtX(-5, 300, 6), 0, 0, "clamped");
assert.equal(timeAtX(10, 0, 6), 0, "no width yet");
near(pctOf(3, 6), 50);
near(pctOf(9, 6), 100);
assert.equal(pctOf(1, 0), 0);
// Round trip at the strip's resolution.
for (const t of [0, 0.5, 2, 3.3, 6]) near(timeAtX((pctOf(t, 6) / 100) * 358, 358, 6), t, 1e-9);

// ---- colour profile samples inside the range
const pt = rangeTimes(profileTimes, { start: 2, end: 4 }, 6);
assert.ok(pt.length >= 4, "the profile still gets its minimum sample count");
assert.ok(pt.every((t) => t >= 2 && t < 4), `profile samples inside the trim: ${pt.map((t) => t.toFixed(2)).join(", ")}`);
assert.deepEqual(rangeTimes(profileTimes, null, 6), profileTimes(6));
assert.deepEqual(rangeTimes(profileTimes, { start: 2, end: 2.3 }, 6), [], "too short to profile");

// ---- gyro solve span: frame times inside the analysis span
const gt = Float64Array.from({ length: 180 }, (_, i) => i / fps);
const st = spanTimes(gt, { start: 1.5, end: 4.5 });
near(st[0], 45 / fps, 1e-9);
assert.ok(st[st.length - 1] <= 4.5 && st.length === 90, `${st.length} frames in 1.5–4.5 s`);
assert.equal(spanTimes(gt, null), gt);
assert.equal(spanTimes(gt, { start: 10, end: 11 }), gt, "a span outside the clip falls back to all frames");

// ---- labels
assert.equal(formatClock(107), "1:47");
assert.equal(formatClock(1.97), "0:01", "positions floor");
assert.equal(formatClock(1.97, true), "0:02", "durations round");
assert.equal(formatClock(-1), "0:00");
assert.equal(formatTimecode(2), "0:02.0");
assert.equal(formatTimecode(3.96), "0:04.0");
assert.equal(formatTimecode(61.25), "1:01.3");
assert.equal(formatTimecode(59.96), "1:00.0", "tenths carry into the minute");
assert.equal(selectionLabel({ start: 2, end: 4 }, 6.006), "0:02.0 of 0:06");
assert.equal(selectionLabel(null, 107), "1:47 of 1:47");
assert.equal(selectionLabel({ start: 10, end: 22 }, 107), "0:12 of 1:47");

// ---- filmstrip: evenly spaced slot centres inside the clip
const ft = filmstripTimes(6, 10);
assert.equal(ft.length, 10);
near(ft[0], 0.3);
near(ft[9], 5.7);
assert.deepEqual(filmstripTimes(0, 10), []);
assert.ok(filmstripTimes(0.04, 3).every((t) => t >= 0 && t <= 0.04));

console.log("trim tests passed");
