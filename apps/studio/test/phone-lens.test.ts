// Phone 0.5× stretch fix: the Pannini maths and the EXIF ultra-wide detection.
//   node --experimental-strip-types apps/studio/test/phone-lens.test.ts
import assert from "node:assert/strict";
import { fitZoom, fovFromF35, pannini, phoneFocalPx, samplePoint, warpUniforms } from "../../dewarp/src/fisheye.ts";
import { photoCamera, photoLensHint, phoneSized } from "../src/pipeline/phone-lens.ts";
import { dewarpParams } from "../src/pipeline/dewarp.ts";
import { DEFAULT_DEWARP, profileDefaults } from "../src/pipeline/tools.ts";

const near = (a: number, b: number, e = 1e-6, m = "") => assert.ok(Math.abs(a - b) < e, `${m} ${a} vs ${b}`);
// d = 0 is the identity (rectilinear to rectilinear).
for (const [x, y] of [[0.3, 0.2], [1.2, -0.7], [-0.9, 0.4]]) { const [sx, sy] = pannini(x, y, 0); near(sx, x, 1e-9); near(sy, y, 1e-9); }
// d = 1 on the horizon: x = 2 tan(φ/2) (stereographic sideways); verticals stay vertical (sx independent of y).
{ const phi = 0.9; const [sx] = pannini(2 * Math.tan(phi / 2), 0, 1); near(Math.atan(sx), phi, 1e-9, "d=1 horizon"); }
{ const [a] = pannini(0.8, 0, 0.7), [b] = pannini(0.8, 0.6, 0.7); near(a, b, 1e-12, "vertical lines straight"); }
// Edges compressed: an output point at the edge samples further out than rectilinear.
{ const [sx] = pannini(1.2, 0, 0.7); assert.ok(sx > 1.2); }
// 13 mm → 117.9° (4:3 diagonal); focal in px the same for 16:9 crops and portrait.
near(fovFromF35(13), 117.9, 0.1);
near(phoneFocalPx(5712, 3213, fovFromF35(13)), phoneFocalPx(3213, 5712, fovFromF35(13)), 1e-9);
near(phoneFocalPx(5712, 4284, fovFromF35(13)), 13 / 43.267 * Math.hypot(5712, 4284), 2);

// Studio params: Phone 0.5× → projection 2, centre unchanged, auto-fit zooms in (no black corners).
const d = { ...DEFAULT_DEWARP, ...profileDefaults("phone-ultra-wide"), enabled: true };
assert.equal(d.strength, 70);
const p = dewarpParams(d, 5712, 3213, null);
assert.ok(p.rectilinear && p.zoom > 1.1 && p.zoom < 1.4, `zoom ${p.zoom}`);
const u = warpUniforms(p);
assert.equal(u.projection, 2);
const [cx, cy] = samplePoint(u, 2856, 1606.5); near(cx, 2856, 1e-6); near(cy, 1606.5, 1e-6);
for (const [x, y] of [[0, 0], [5712, 0], [0, 3213], [5712, 3213], [0, 1606], [2856, 0]]) {
  const [sx, sy] = samplePoint(u, x, y);
  assert.ok(sx >= -1 && sy >= -1 && sx <= 5713 && sy <= 3214, `corner ${x},${y} -> ${sx},${sy}`);
}
// Portrait clip stored landscape (rotation 90): the fix runs along the frame's y.
const ur = warpUniforms(dewarpParams(d, 1920, 1080, null, true));
assert.equal(ur.axisY, 1);
// EXIF's own focal length is used.
assert.ok(dewarpParams(d, 4032, 3024, { evidence: [], focal35: 14 }).fovDeg < dewarpParams(d, 4032, 3024, null).fovDeg);
assert.ok(fitZoom({ ...p }, 0.5, 16, 2) > 1);

// Detection.
const sz = { w: 4032, h: 3024 };
assert.equal(photoCamera({ make: "Apple", model: "iPhone 13", lensModel: "iPhone 13 back dual wide camera 1.54mm f/2.4", focal: 1.54, focal35: 14 }, sz).profileId, "phone-ultra-wide");
assert.equal(photoCamera({ make: "Apple", model: "iPhone 15 Pro", lensModel: "iPhone 15 Pro back triple camera 6.765mm f/1.78", focal: 6.765, focal35: 24 }, sz).notUltraWide, true);
assert.equal(photoCamera({ make: "Apple", model: "iPhone 15 Pro", lensModel: "iPhone 15 Pro back triple camera 2.22mm f/2.2", focal: 2.22, focal35: 13 }, sz).focal35, 13);
assert.equal(photoCamera({ make: "Xiaomi", model: "M2101K7AG", focal: 1.65 }, sz).profileId, "phone-ultra-wide", "no 35 mm tag: short phone focal");
assert.equal(photoCamera({ make: "samsung", model: "SM-S918B", focal: 6.3, focal35: 23 }, sz).profileId, undefined);
assert.equal(photoCamera({ make: "Apple", model: "iPhone 11 Pro", lensModel: "iPhone 11 Pro back camera 1.54mm f/2.4", focal: 1, focal35: 13 }, sz).profileId, "phone-ultra-wide");
assert.equal(photoCamera({ make: "Canon", model: "EOS R5", focal: 16, focal35: 16 }, sz).profileId, "phone-ultra-wide", "any 16 mm-equivalent shot is ultra-wide");
assert.equal(photoCamera({ make: "Canon", model: "EOS R5", focal: 35, focal35: 35 }, sz).notUltraWide, undefined, "a non-phone isn't flagged");
assert.ok(photoCamera({ make: "Apple", model: "iPhone 13" }, sz).model === "iPhone 13");
// No EXIF (stripped by a messenger): a hint, never an automatic fix.
const none = photoCamera({}, { w: 5712, h: 3213 });
assert.equal(none.profileId, undefined);
assert.match(photoLensHint(none, { w: 5712, h: 3213 }) ?? "", /Phone 0\.5×/);
assert.equal(photoLensHint(none, { w: 1200, h: 800 }), null);
assert.ok(phoneSized(3213, 5712) && phoneSized(4032, 3024) && !phoneSized(1920, 1080));
console.log("phone-lens: ok");
