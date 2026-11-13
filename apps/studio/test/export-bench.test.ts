// The export sheet's first-time estimate (export-bench.ts): a share of the measured pace, bounded; a default without one.
//   node --experimental-strip-types apps/studio/test/export-bench.test.ts
import assert from "node:assert/strict";
import { aboutDuration, BENCH_SHARE, DEFAULT_MPXS, firstExportSpeed } from "../src/pipeline/export-bench.ts";

assert.equal(firstExportSpeed(null, true), DEFAULT_MPXS.mobile);
assert.equal(firstExportSpeed(null, false), DEFAULT_MPXS.desktop);
assert.equal(firstExportSpeed(NaN, true), DEFAULT_MPXS.mobile);
assert.equal(firstExportSpeed(0, true), DEFAULT_MPXS.mobile);
assert.equal(firstExportSpeed(100, true), 100 * BENCH_SHARE, "a share of the grade + capture + encode pace");
assert.equal(firstExportSpeed(0.5, true), 0.5, "a slow device is believed down to the floor");
assert.equal(firstExportSpeed(0.1, true), 0.5, "never slower than the floor");
assert.equal(firstExportSpeed(10_000, false), 150, "never faster than the ceiling");
// A 60 s 1080p30 clip on a phone without a measurement: 60 * 30 * 2.07 Mpx at 14 Mpx-frames/s = about 4 min.
assert.equal(aboutDuration((60 * 30 * 1920 * 1080) / 1e6 / firstExportSpeed(null, true)), "about 4 min");
assert.equal(aboutDuration(2), "about 5 s", "never under 5 s");
assert.equal(aboutDuration(23), "about 25 s");
assert.equal(aboutDuration(89), "about 90 s");
assert.equal(aboutDuration(200), "about 3 min");
console.log("export-bench tests passed");
