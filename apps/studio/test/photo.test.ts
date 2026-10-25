// Photo helpers (pure parts) and the camera-detection seam.
//   node --experimental-strip-types apps/studio/test/photo.test.ts
import assert from "node:assert/strict";
import { isPhotoFile, photoLimits } from "../src/pipeline/photo.ts";
import { cameraLabel, detectedProfile, dewarpChips, DEWARP_PROFILES, FROM_FILE, profileAspectMismatch, profileDefaults } from "../src/pipeline/tools.ts";
import { dewarpParams } from "../src/pipeline/dewarp.ts";
import { DEFAULT_TOOLS } from "../src/pipeline/tools.ts";

const f = (name: string, type = "") => new File([new Uint8Array(4)], name, { type });
assert.ok(isPhotoFile(f("IMG_0001.HEIC")), "HEIC by extension (iOS gives no type)");
assert.ok(isPhotoFile(f("a.jpg", "image/jpeg")));
assert.ok(isPhotoFile(f("x", "image/png")));
assert.ok(!isPhotoFile(f("clip.mov", "video/quicktime")));
assert.ok(!isPhotoFile(f("clip.mp4")));

// WebKit: 16 Mpx canvas cap; WebGPU: 8192 px textures.
assert.equal(photoLimits(true, "webgl2").maxPixels, 16_000_000);
assert.equal(photoLimits(false, "webgpu").maxSide, 8192);
assert.equal(photoLimits(false, "webgl2").maxSide, 16384);

// Camera detection → Dewarp preselection.
assert.equal(cameraLabel(null), null);
assert.equal(cameraLabel({ brand: "GoPro", model: "HERO12 Black", lensMode: "Wide", evidence: [] }), "GoPro HERO12 Black · Wide");
assert.equal(detectedProfile({ brand: "GoPro", profileId: "gopro-wide-16x9", evidence: [] }), "gopro-wide-16x9");
assert.equal(detectedProfile({ brand: "GoPro", profileId: "gopro-wide-8x7", evidence: [] }), null, "only profiles the chips offer");
assert.equal(detectedProfile({ brand: "DJI", profileId: FROM_FILE, evidence: [] }), null, "from-file needs a lens");
const lens = { width: 3840, height: 2160, fx: 1400, fy: 1400, cx: 1920, cy: 1080, k: [0.2, -0.05, 0.004, -0.009] as [number, number, number, number] };
const dji = { brand: "DJI", model: "Osmo Action 5 Pro", profileId: FROM_FILE, lens, evidence: [] };
assert.equal(detectedProfile(dji), FROM_FILE);
assert.equal(dewarpChips(dji)[0].id, FROM_FILE);
assert.equal(dewarpChips(null), DEWARP_PROFILES);
assert.deepEqual(profileDefaults(FROM_FILE), { profile: FROM_FILE, strength: 100, fovDeg: 150 });
assert.equal(profileAspectMismatch(FROM_FILE, 1440, 1080), false);
// The clip's own lens drives the warp; without the camera it falls back to the default profile.
const fromClip = dewarpParams({ ...DEFAULT_TOOLS.dewarp, ...profileDefaults(FROM_FILE), enabled: true }, 3840, 2160, dji);
assert.equal(fromClip.lens?.fx, 1400);
assert.equal(fromClip.strength, 1);
const fallback = dewarpParams({ ...DEFAULT_TOOLS.dewarp, ...profileDefaults(FROM_FILE), enabled: true }, 3840, 2160, null);
assert.notEqual(fallback.lens?.fx, 1400);

console.log("photo + camera: ok");
