// WebKit export policy: the offline → real-time recorder handover (realtime-steps.ts) and export crash crumbs.
//   node --experimental-strip-types apps/studio/test/export-policy.test.ts
import assert from "node:assert/strict";
import { realtimeSteps } from "../src/pipeline/realtime-steps.ts";

const rates = (s: number | null) => realtimeSteps(s).map((x) => `${x.rate}@${x.scale}`);

// Forced recorder: the whole ladder, down to half size.
assert.deepEqual(rates(null), ["1@1", "0.5@1", "0.25@1", "0.25@0.5"]);
// Offline near real time: stays offline (no step beats it by 1.3×).
assert.deepEqual(rates(0.9), []);
assert.deepEqual(rates(0.78), []);
// Offline at 0.6×: only full speed is worth the restart.
assert.deepEqual(rates(0.6), ["1@1"]);
// Offline at 0.3×: full or half speed, never a smaller picture.
assert.deepEqual(rates(0.3), ["1@1", "0.5@1"]);
// Very slow offline: down to quarter speed, still full size.
assert.deepEqual(rates(0.1), ["1@1", "0.5@1", "0.25@1"]);
console.log("realtime-steps: ok");

// A session that died mid-export is told apart from one that died elsewhere (crumbs.ts).
{
  const { exportCrashed } = await import("../src/pipeline/crumbs.ts");
  assert.equal(exportCrashed(["10:00:00 open video/mp4 200 MB", "10:00:05 export start (offline, 3840×2160)"]), true);
  assert.equal(exportCrashed(["10:00:05 export start (offline, 3840×2160)", "10:00:35 export 30% (3840×2160, 9.1 fps)"]), true);
  assert.equal(exportCrashed(["10:00:05 export start (offline, 3840×2160)", "10:01:35 export done"]), false);
  assert.equal(exportCrashed(["10:00:05 export start (offline)", "10:00:09 export failed"]), false);
  assert.equal(exportCrashed(["10:00:00 ai: model load"]), false);
  assert.equal(exportCrashed(null), false);
  console.log("export crash crumbs: ok");
}
