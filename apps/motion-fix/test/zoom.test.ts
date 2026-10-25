// Rate-limited zoom: never below a frame's need, never faster than the limit.
//   node --experimental-strip-types apps/motion-fix/test/zoom.test.ts
import assert from "node:assert/strict";
import { rateLimitedZoom, smoothZoom } from "../src/lib/stabilize.ts";
import { makeRng } from "./synth.ts";

const fps = 30;
const n = 600;
const rng = makeRng(7);
const required = new Float32Array(n);
for (let t = 0; t < n; t++) {
  // calm, a shaky burst, calm, a single-frame spike, a long shaky stretch
  const burst = t > 100 && t < 160 ? 0.18 * rng() : 0;
  const spike = t === 300 ? 0.3 : 0;
  const stretch = t > 420 ? 0.1 + 0.05 * rng() : 0;
  required[t] = 1 + 0.02 * rng() + burst + spike + stretch;
}
const maxZoom = 1.4;
const rate = 0.025;
const z = rateLimitedZoom(required, fps, rate, maxZoom);
let worstBelow = 0;
let worstRate = 0;
let tv = 0;
for (let t = 0; t < n; t++) {
  worstBelow = Math.max(worstBelow, Math.min(maxZoom, required[t]) - z[t]);
  assert.ok(z[t] <= maxZoom + 1e-6 && z[t] >= 1);
  if (t) {
    worstRate = Math.max(worstRate, Math.abs(z[t] - z[t - 1]) * fps);
    tv += Math.abs(z[t] - z[t - 1]);
  }
}
assert.ok(worstBelow <= 1e-6, `zoom below the need by ${worstBelow}`);
assert.ok(worstRate <= rate + 1e-4, `zoom rate ${worstRate} > ${rate}`);
const old = smoothZoom(required, Math.round(2.5 * fps), maxZoom);
let oldRate = 0;
for (let t = 1; t < n; t++) oldRate = Math.max(oldRate, Math.abs(old[t] - old[t - 1]) * fps);
assert.ok(oldRate > 2 * worstRate, "the rolling window pumps faster than the rate-limited zoom");
console.log(`zoom: peak rate ${worstRate.toFixed(4)}/s (rolling window ${oldRate.toFixed(3)}/s), total variation ${tv.toFixed(3)}`);
console.log("zoom tests passed");
