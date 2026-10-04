// Person presence gate (pure logic): the selfie mask only survives inside
// padded detector boxes; no detection means no person path at all.
//   node --experimental-strip-types apps/aqua-fix/test/person-gate.test.ts
import assert from "node:assert/strict";
import { boxGate, PERSON_BOX_PAD } from "../src/engine/person-gate.ts";

const fw = 64, fh = 36;
const at = (g: Float32Array, fx: number, fy: number) => g[Math.floor(fy * fh) * fw + Math.floor(fx * fw)];

// No detections: everything gated out (a reef with nobody in it stays reef-coloured).
{
  const g = boxGate([], fw, fh);
  assert.equal(g.reduce((s, v) => s + v, 0), 0);
}

// One box: 1 inside, 1 in the padding (fins, arms), 0 well outside.
{
  const g = boxGate([{ x: 0.4, y: 0.3, w: 0.2, h: 0.4, score: 0.6 }], fw, fh);
  assert.equal(at(g, 0.5, 0.5), 1);
  assert.equal(at(g, 0.4 + 0.2 * (1 + PERSON_BOX_PAD) - 0.02, 0.5), 1, "inside the padded edge");
  assert.equal(at(g, 0.05, 0.5), 0, "far left");
  assert.equal(at(g, 0.5, 0.95), 0, "far below");
  // The fade is monotone leaving the box.
  const a = at(g, 0.4 + 0.2 * (1 + PERSON_BOX_PAD) + 0.005, 0.5);
  const b = at(g, 0.4 + 0.2 * (1 + PERSON_BOX_PAD) + 0.02, 0.5);
  assert.ok(a >= b, `fade ${a} >= ${b}`);
}

// Two boxes: union, never above 1.
{
  const g = boxGate([{ x: 0.1, y: 0.1, w: 0.2, h: 0.2, score: 0.5 }, { x: 0.6, y: 0.6, w: 0.2, h: 0.2, score: 0.5 }], fw, fh);
  assert.equal(at(g, 0.2, 0.2), 1);
  assert.equal(at(g, 0.7, 0.7), 1);
  assert.equal(at(g, 0.45, 0.45), 0);
  assert.ok(Math.max(...g) <= 1);
}

// A full-frame box (detector unavailable → gate open) keeps every cell.
{
  const g = boxGate([{ x: 0, y: 0, w: 1, h: 1, score: 1 }], fw, fh);
  assert.equal(Math.min(...g), 1);
}

console.log("person-gate: ok");
