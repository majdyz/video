// Geometry stage maths (pure, mirrored by the GLSL in src/pipeline/geometry.ts).
//   node --experimental-strip-types apps/studio/test/geometry.test.ts
import assert from "node:assert/strict";
import { codedToDisplay, displaySize, displayToCoded, sourcePoint, stabilisedPoint, turnsOf, type GeometryParams, type QuarterTurns } from "../src/pipeline/geometry-math.ts";
import { samplePoint, warpUniforms } from "../../dewarp/src/fisheye.ts";
import { PROFILES } from "../../dewarp/src/profiles.ts";

const near = (a: number, b: number, eps = 1e-9, msg = "") => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b}`);

// Rotation helpers: inverse pairs, and they agree with the motion-fix mesh renderer's displayToTexture.
for (const rot of [0, 1, 2, 3] as QuarterTurns[]) {
  for (const [x, y] of [[0.1, 0.2], [0.9, 0.35], [0.5, 0.5], [0, 1]]) {
    const [cx, cy] = displayToCoded(x, y, rot);
    const [dx, dy] = codedToDisplay(cx, cy, rot);
    near(dx, x, 1e-12, `rot ${rot} x`);
    near(dy, y, 1e-12, `rot ${rot} y`);
  }
}
assert.deepEqual(displayToCoded(0.25, 0.75, 1), [0.75, 0.75]); // motion-fix: case 90 → [ny, 1 - nx]
assert.deepEqual(displayToCoded(0.25, 0.75, 3), [0.25, 0.25]); // case 270 → [1 - ny, nx]
assert.equal(turnsOf(90), 1);
assert.equal(turnsOf(-90), 3);
assert.equal(turnsOf(270), 3);
assert.equal(turnsOf(360), 0);
assert.deepEqual(displaySize(1920, 1080, 1), [1080, 1920]);

// Display corner (0,0) of a 90° clip is the coded frame's bottom-left (the sensor's top-left after a clockwise turn).
assert.deepEqual(displayToCoded(0, 0, 1), [0, 1]);

// Nothing on: identity.
const base: GeometryParams = { rot: 0, displayW: 1920, displayH: 1080, stab: null, dewarp: null };
for (const [x, y] of [[0.3, 0.7], [0.5, 0.5]]) assert.deepEqual(sourcePoint(x, y, base), [x, y]);

// Stabilise only: a pure translation of +40 px in x shifts the sample by 40/1920.
const shift = { ...base, stab: (x: number, y: number) => [x + 40, y] as const };
near(stabilisedPoint(0.5, 0.5, shift)[0], 0.5 + 40 / 1920, 1e-12, "stab shift");
// … and samples outside the frame are reported as such (rendered black).
assert.equal(sourcePoint(0.999, 0.5, shift), null);

// Dewarp only (rot 0): matches the dewarp app's samplePoint exactly.
const lens = PROFILES["osmo-action-wide"].lens!;
const u = warpUniforms({ srcWidth: 1920, srcHeight: 1080, fovDeg: 148, k1: 0, strength: 1, projection: "rectilinear", zoom: 1, lens });
const dw: GeometryParams = { ...base, dewarp: u };
for (const [x, y] of [[0.2, 0.3], [0.5, 0.5], [0.8, 0.9]]) {
  const p = sourcePoint(x, y, dw)!;
  const [sx, sy] = samplePoint(u, x * 1920, y * 1080);
  near(p[0], sx / 1920, 1e-12, "dewarp x");
  near(p[1], sy / 1080, 1e-12, "dewarp y");
}
// Rectilinear output of a fisheye pulls edge samples inward (barrel undone): a point near the
// left edge samples closer to the centre of the fisheye frame.
assert.ok(sourcePoint(0.1, 0.5, dw)![0] > 0.1, "dewarp pulls edges inward");

// Dewarp on a rotated (portrait) clip happens in the coded (landscape sensor) frame:
// the display centre maps to the lens's principal point and display-x maps to coded-y.
const uRot = warpUniforms({ srcWidth: 1920, srcHeight: 1080, fovDeg: 148, k1: 0, strength: 1, projection: "rectilinear", zoom: 1, lens });
const rotParams: GeometryParams = { rot: 1, displayW: 1080, displayH: 1920, stab: null, dewarp: uRot };
const c = sourcePoint(0.5, 0.5, rotParams)!;
near(c[0], uRot.center[0] / 1920, 1e-9, "rot centre x");
near(c[1], uRot.center[1] / 1080, 1e-9, "rot centre y");
const left = sourcePoint(0.1, 0.5, rotParams)!; // left in display = bottom (y→1) in the coded frame for 90°
const expect = samplePoint(uRot, 0.5 * 1920, 0.9 * 1080);
near(left[0], expect[0] / 1920, 1e-9, "rot edge x");
near(left[1], expect[1] / 1080, 1e-9, "rot edge y");

// Combined: the stabilise warp acts before (in the output frame of) the dewarp.
const both: GeometryParams = { ...dw, stab: (x: number, y: number) => [x * 0.9, y * 0.9] as const };
const pc = sourcePoint(0.25, 0.5, both)!;
const mid = [0.5 + (0.25 - 0.5) * 0.9, 0.5];
const [ex, ey] = samplePoint(u, mid[0] * 1920, mid[1] * 1080);
near(pc[0], ex / 1920, 1e-9, "combined x");
near(pc[1], ey / 1080, 1e-9, "combined y");

console.log("geometry: ok");
