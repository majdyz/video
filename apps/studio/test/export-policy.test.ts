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

// The export's one progress bar (export-progress.ts): stages share it, and it never goes backwards.
{
  const { ExportBar, EXPORT_SHARE } = await import("../src/pipeline/export-progress.ts");
  const near = (a: number, b: number, what: string) => assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} vs ${b}`);
  // AI subjects (30%), then the render in what is left; the render starts over twice (offline → recorder → slower).
  const bar = new ExportBar();
  const seen: number[] = [];
  const at = (p: number) => { seen.push(bar.at(p)); return seen[seen.length - 1]; };
  bar.stage(EXPORT_SHARE.subjects);
  near(at(0), 0, "subjects 0%");
  near(at(0.5), 0.15, "subjects 50%");
  near(at(0.48), 0.15, "the pass's total grew: the bar holds");
  seen.push(bar.done());
  near(bar.value, 0.3, "subjects done");
  bar.stage(1);
  near(at(0), 0.3, "render 0%");
  near(at(0.2), 0.3 + 0.2 * 0.7, "render 20%");
  bar.stage(1);
  near(at(0), 0.44, "the recorder takes over: the bar stays");
  near(at(0.5), 0.44 + 0.5 * 0.56, "and goes on from there");
  bar.stage(1);
  near(at(0.01), 0.72, "restarting slower: still no step back");
  near(at(1), 1, "the end is the end");
  assert.ok(seen.every((v, i) => i === 0 || v >= seen[i - 1]), "never backwards");
  // A stage joined part-way fills its share with what is left of it: a pass already at 80%, a resumed render at 40%.
  const b2 = new ExportBar();
  b2.stage(EXPORT_SHARE.subjects);
  near(b2.at(0.8), 0, "the pass was at 80% when the export began");
  near(b2.at(0.9), 0.15, "half of what was left");
  b2.done();
  b2.stage(1);
  near(b2.at(0.4), 0.3, "resumed at 40%");
  near(b2.at(0.7), 0.3 + 0.5 * 0.7, "half of the rest");
  // No stages (nothing to wait for): the render's own progress, as is; junk never moves the bar.
  const b3 = new ExportBar();
  b3.stage(1);
  near(b3.at(0), 0, "0");
  near(b3.at(0.25), 0.25, "25%");
  near(b3.at(Number.NaN), 0.25, "NaN");
  near(b3.at(-3), 0.25, "negative");
  console.log("export progress bar: ok");
}
