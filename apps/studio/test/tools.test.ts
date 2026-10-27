// Tool state → engine parameters (pure).
//   node --experimental-strip-types apps/studio/test/tools.test.ts
import assert from "node:assert/strict";
import {
  DEFAULT_TOOLS,
  applyStabPreset,
  colourSettings,
  enabledTools,
  exportSuffix,
  processingChain,
  profileAspectMismatch,
  profileDefaults,
  stabiliseParams,
  solveParams,
  GYRO_DEFAULT_SMOOTHING,
  subjectPopVisible,
} from "../src/pipeline/tools.ts";
import { DEFAULT_GYRO_PARAMS } from "../../motion-fix/src/lib/gyro/gyro-stabilize.ts";
import { dewarpParams, dewarpUniforms } from "../src/pipeline/dewarp.ts";
import { bobbingNote } from "../src/pipeline/stab-info.ts";
import { DEFAULT_SETTINGS } from "../../aqua-fix/src/engine/params.ts";
import { DEFAULT_PARAMS } from "../../motion-fix/src/lib/stabilize.ts";
import { samplePoint } from "../../dewarp/src/fisheye.ts";
import { profileTimes, segmentProfile, type ProfileSample } from "../../aqua-fix/src/engine/profile.ts";
import { IDENTITY_PARAMS } from "../../aqua-fix/src/engine/params.ts";

// Colour: strength 50 is exactly the engine's own estimate (intensity 1), defaults pass through.
assert.deepEqual(colourSettings(DEFAULT_TOOLS.colour), { ...DEFAULT_SETTINGS });
assert.equal(colourSettings({ ...DEFAULT_TOOLS.colour, strength: 100 }).intensity, 2);
assert.equal(colourSettings({ ...DEFAULT_TOOLS.colour, strength: 0 }).intensity, 0);
assert.equal(colourSettings({ ...DEFAULT_TOOLS.colour, strength: 140 }).intensity, 2, "clamped");
assert.equal(colourSettings({ ...DEFAULT_TOOLS.colour, preset: "murky" }).preset, "murky");

// Stabilise: defaults are Motion Fix's; presets set both knobs.
assert.deepEqual(stabiliseParams(DEFAULT_TOOLS.stabilise), DEFAULT_PARAMS);
const locked = applyStabPreset(DEFAULT_TOOLS.stabilise, "locked");
assert.equal(locked.preset, "locked");
assert.deepEqual(stabiliseParams(locked), { smoothing: 1, maxCrop: 0.25 });
// Motion Fix v3: one Strength drives both paths; Steady = each path's tuned default.
assert.equal(GYRO_DEFAULT_SMOOTHING, DEFAULT_GYRO_PARAMS.smoothing);
assert.ok(Math.abs(solveParams(DEFAULT_TOOLS.stabilise, "gyro", "lens").smoothing - DEFAULT_GYRO_PARAMS.smoothing) < 1e-9);
assert.equal(solveParams(DEFAULT_TOOLS.stabilise, "visual", "lens").smoothing, DEFAULT_PARAMS.smoothing);
assert.equal(solveParams(locked, "gyro", "lens").smoothing, 1);
assert.equal(solveParams({ ...locked, keepLevel: true, lens: "water" }, "gyro", "rectilinear").horizonLock, 1);
assert.equal(solveParams({ ...locked, lens: "water" }, "gyro", "rectilinear").medium, "water");
assert.equal(solveParams({ ...DEFAULT_TOOLS.stabilise, strength: 0 }, "gyro", "lens").smoothing, 0);

// Dewarp: the Osmo profile's fitted 55 % strength is the default; auto-fit leaves no black corners.
assert.equal(DEFAULT_TOOLS.dewarp.strength, 55);
assert.equal(profileDefaults("osmo-action-wide-raw").strength, 100);
assert.equal(profileDefaults("nope").profile, "osmo-action-wide");
const p = dewarpParams({ ...DEFAULT_TOOLS.dewarp, enabled: true }, 1920, 1080);
const u = dewarpUniforms({ ...DEFAULT_TOOLS.dewarp, enabled: true }, 1920, 1080);
assert.ok(p.zoom > 0.5 && p.zoom < 2, `fit zoom ${p.zoom}`);
for (const [x, y] of [[0, 0], [1920, 0], [0, 1080], [1920, 1080], [960, 0], [0, 540]]) {
  const [sx, sy] = samplePoint(u, x, y);
  assert.ok(sx >= -0.5 && sy >= -0.5 && sx <= 1920.5 && sy <= 1080.5, `corner ${x},${y} → ${sx},${sy}`);
}
assert.equal(dewarpParams({ ...DEFAULT_TOOLS.dewarp, autoZoom: false, zoom: 1.3 }, 1920, 1080).zoom, 1.3);
assert.equal(profileAspectMismatch("osmo-action-wide", 1920, 1080), false);
assert.equal(profileAspectMismatch("osmo-action-wide", 1440, 1080), true);
assert.equal(profileAspectMismatch("generic-fisheye", 1440, 1080), false);

// Chain labels and file names follow the render order (geometry first, colour last).
const all = { colour: { ...DEFAULT_TOOLS.colour, enabled: true }, stabilise: { ...DEFAULT_TOOLS.stabilise, enabled: true }, dewarp: { ...DEFAULT_TOOLS.dewarp, enabled: true } };
assert.equal(processingChain(all), "Dewarp → Stabilise → Colour");
assert.equal(exportSuffix(all), "dewarped-stabilised-colour");
assert.deepEqual(enabledTools(DEFAULT_TOOLS), ["colour"]);
assert.equal(processingChain({ ...all, colour: { ...all.colour, enabled: false }, stabilise: { ...all.stabilise, enabled: false }, dewarp: { ...all.dewarp, enabled: false } }), "Original");

// Clip profile seam (aqua-fix/src/engine/profile.ts): sample times and cut segmentation.
assert.deepEqual(profileTimes(0.2), []);
const times = profileTimes(10);
assert.equal(times.length, 10);
assert.ok(times.every((t, i) => t > 0 && t < 10 && (i === 0 || t > times[i - 1])));
const sample = (t: number, mean: [number, number, number], wb0: number): ProfileSample => ({ t, mean, params: { ...IDENTITY_PARAMS, wb: [wb0, 1, 1] } });
assert.equal(segmentProfile([sample(1, [0.2, 0.3, 0.4], 2)], 0.16), null);
const flat = segmentProfile([1, 2, 3, 4].map((t) => sample(t, [0.2, 0.3, 0.4], 2)), 0.16)!;
assert.equal(flat.length, 1);
const cut = segmentProfile([sample(1, [0.2, 0.3, 0.4], 2), sample(2, [0.2, 0.3, 0.4], 2), sample(3, [0.6, 0.5, 0.2], 1.1), sample(4, [0.6, 0.5, 0.2], 1.1)], 0.16)!;
assert.equal(cut.length, 2);
assert.equal(cut[1].from, 2.5);
assert.deepEqual(cut[1].window, [2, 3]);
assert.equal(cut[1].params.wb[0], 1.1);

// Bobbing (Motion Fix hybrid): on by default, off -> gyro only; older saved state (no field) counts as on.
assert.equal(solveParams(DEFAULT_TOOLS.stabilise, "gyro", "lens").hybrid, 1);
assert.equal(solveParams({ ...DEFAULT_TOOLS.stabilise, bobbing: false }, "gyro", "lens").hybrid, 0);
{
  const { bobbing: _, ...legacy } = DEFAULT_TOOLS.stabilise;
  assert.equal(solveParams(legacy as typeof DEFAULT_TOOLS.stabilise, "gyro", "lens").hybrid, 1);
}
{
  const gyroPlan = (hybrid: unknown) => ({ kind: "gyro", plan: { hybrid } }) as unknown as Parameters<typeof bobbingNote>[0];
  assert.equal(bobbingNote(null, "running", 0.42), "Measuring bobbing 42%…");
  assert.match(bobbingNote(null, "unavailable", 0)!, /gyro only/);
  assert.match(bobbingNote(gyroPlan({ applied: true, wanderBefore: 4.2, wanderAfter: 0.8, reason: "bobbing removed" }), "done", 1)!, /4\.2 → 0\.8/);
  assert.match(bobbingNote(gyroPlan({ applied: false, reason: "scene too deep: x" }), "done", 1)!, /gyro only \(scene too deep/);
  assert.equal(bobbingNote(gyroPlan(undefined), "idle", 0), null);
}

// Subject pop (Beta) is visible to everyone; `?labs=1` keeps working.
assert.equal(subjectPopVisible(""), true);
assert.equal(subjectPopVisible("?pop=1"), true);
assert.equal(subjectPopVisible("?labs=1"), true);

console.log("tools: ok");
