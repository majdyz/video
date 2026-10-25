// Subject-pop stability gate (synthetic masks).
//   node --experimental-strip-types apps/aqua-fix/test/pop-gate.test.ts
import assert from "node:assert/strict";
import { gateTarget, shiftedIoU, subjectMask } from "../src/engine/pop-gate.ts";

const W = 160, H = 90;
/** Fields texture with an ellipse "subject" in channel 1. */
const fields = (cx: number, cy: number, rx: number, ry: number) => {
  const f = new Float32Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1) f[(y * W + x) * 4 + 1] = 1;
  return f;
};
const a = subjectMask(fields(80, 45, 30, 10), W, H);
// The same animal a few texels on: stable.
const b = subjectMask(fields(84, 46, 30, 10), W, H);
assert.ok(shiftedIoU(a.m, b.m, a.w, a.h) > 0.85);
assert.ok(gateTarget(a, b) > 0.95, "a swimming animal keeps the gate open");
// Fragmenting / jumping mask: gate closes.
const c = subjectMask(fields(30, 20, 8, 4), W, H);
assert.ok(gateTarget(a, c) < 0.05, "a jumping mask closes the gate");
// No previous mask yet: closed (fades in only once two analyses agree).
assert.equal(gateTarget(null, a), 0);
// Nothing in either frame: nothing to gate.
const e = subjectMask(new Float32Array(W * H * 4), W, H);
assert.equal(gateTarget(e, e), 1);
console.log("ok  pop gate");
