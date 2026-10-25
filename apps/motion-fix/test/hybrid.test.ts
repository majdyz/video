// Hybrid gyro + visual: residual translation from derotated point pairs,
// confidence gating, the L1 translation path and its composition with the
// gyro plan.
//   node --experimental-strip-types apps/motion-fix/test/hybrid.test.ts
import assert from "node:assert/strict";
import { computeGyroPlan, frameTimesOf, gyroWarpFnAtTime, viewShiftQuat, type GyroParams } from "../src/lib/gyro/gyro-stabilize.ts";
import { DEFAULT_GATE, gateResidual, jitter2, pairResidual, ResidualCollector, smoothPath1D, wander2, type ResidualMotion } from "../src/lib/gyro/hybrid.ts";
import { project, unproject, type LensModel } from "../src/lib/gyro/lens.ts";
import { qexp, qmat, qrot, sampleOrientation, type Vec3 } from "../src/lib/gyro/quat.ts";
import { GOPRO_WIDE_K, type CameraMotion } from "../src/lib/gyro/telemetry.ts";
import { makeRng } from "./synth.ts";

const close = (a: number, b: number, tol: number, msg: string): void => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`);
const deg = Math.PI / 180;
const W = 1920;
const H = 1080;
const hero: LensModel = { kind: "fisheye", width: W, height: H, fx: 910, fy: 910, cx: W / 2, cy: H / 2, k: [...GOPRO_WIDE_K], source: "test" };
const params: GyroParams = { smoothing: 0.6, maxCrop: 0.15, horizonLock: 0, output: "lens" };

type Scene = { rot: (t: number) => Vec3; pos: (t: number) => Vec3; depth: number };

function motionOf(n: number, fps: number, scene: Scene, lens: LensModel): CameraMotion {
  const m = 4 * n + 8;
  const times = new Float64Array(m);
  const quats = new Float64Array(4 * m);
  for (let i = 0; i < m; i++) {
    const t = i / (4 * fps) - 0.02;
    times[i] = t;
    quats.set(qexp(scene.rot(t)), 4 * i);
  }
  return {
    source: "gopro",
    camera: "synthetic",
    times,
    quats,
    readout: 0,
    timeOffset: 0,
    lens,
    down: [0, 1, 0],
    eis: { active: false, label: "off" },
    video: { width: lens.width, height: lens.height, rotation: 0, frameCount: n, duration: n / fps, fps },
    notes: [],
  };
}

/**
 * Point matches between frames t0 and t1 of a camera translating in front
 * of a fronto-parallel plane at `depth` (world z), rotating as the gyro
 * says. `movers`: fraction of points on an independently moving object
 * (fish); `noise`: px.
 */
function matches(scene: Scene, lens: LensModel, t0: number, t1: number, rng: () => number, count = 120, noise = 0.4, movers = 0, moverShift: [number, number] = [0, 0]): { px: Float32Array; py: Float32Array; qx: Float32Array; qy: Float32Array } {
  const q0 = qexp(scene.rot(t0));
  const q1 = qexp(scene.rot(t1));
  const m1 = qmat(q1);
  const p0 = scene.pos(t0);
  const p1 = scene.pos(t1);
  const px: number[] = [], py: number[] = [], qx: number[] = [], qy: number[] = [];
  while (px.length < count) {
    const x = 60 + rng() * (lens.width - 120);
    const y = 60 + rng() * (lens.height - 120);
    const r = qrot(q0, unproject(lens, x, y));
    if (r[2] < 0.2) continue;
    const lam = (scene.depth - p0[2]) / r[2];
    const X: Vec3 = [p0[0] + lam * r[0], p0[1] + lam * r[1], scene.depth];
    const d: Vec3 = [X[0] - p1[0], X[1] - p1[1], X[2] - p1[2]];
    const c: Vec3 = [m1[0] * d[0] + m1[3] * d[1] + m1[6] * d[2], m1[1] * d[0] + m1[4] * d[1] + m1[7] * d[2], m1[2] * d[0] + m1[5] * d[1] + m1[8] * d[2]];
    const p = project(lens, c);
    if (!Number.isFinite(p[0]) || p[0] < 0 || p[1] < 0 || p[0] > lens.width || p[1] > lens.height) continue;
    const mover = rng() < movers;
    px.push(x);
    py.push(y);
    qx.push(p[0] + (rng() - 0.5) * 2 * noise + (mover ? moverShift[0] : 0));
    qy.push(p[1] + (rng() - 0.5) * 2 * noise + (mover ? moverShift[1] : 0));
  }
  return { px: Float32Array.from(px), py: Float32Array.from(py), qx: Float32Array.from(qx), qy: Float32Array.from(qy) };
}

function residualOf(motion: CameraMotion, scene: Scene, lens: LensModel, opts: { noise?: number; movers?: (i: number) => number; moverShift?: [number, number]; drop?: (i: number) => boolean } = {}): ResidualMotion {
  const rng = makeRng(11);
  // 480-px analysis scale, as in the app.
  const rc = new ResidualCollector(motion, 480, 270, 1.335);
  const times = frameTimesOf(motion);
  for (let i = 0; i < times.length; i++) {
    if (i === 0 || opts.drop?.(i)) rc.addMatches(times[i], null);
    else rc.addMatches(times[i], matches(scene, lens, times[i - 1], times[i], rng, 120, opts.noise ?? 0.4 * 4, opts.movers?.(i) ?? 0, opts.moverShift ?? [0, 0]));
  }
  return rc.finish();
}

const fps = 60;
const shake = (t: number): Vec3 => [1.2 * deg * Math.sin(2 * Math.PI * 4.3 * t), 8 * deg * t + 0.8 * deg * Math.sin(2 * Math.PI * 3.1 * t + 0.5), 0.6 * deg * Math.sin(2 * Math.PI * 5.3 * t + 2)];
// Fin-kick heave (1.1 Hz) and sway (0.5 Hz), plus a slow forward-right drift, in metres; plane 2 m away.
const bob = (t: number): Vec3 => [0.04 * Math.sin(2 * Math.PI * 0.5 * t + 0.3) + 0.02 * t, 0.06 * Math.sin(2 * Math.PI * 1.1 * t), 0.05 * t];
const still = (): Vec3 => [0, 0, 0];

// ------------------------------------------------------------ pair residual
{
  const rng = makeRng(5);
  // Rotation only: the derotated residual is zero (up to noise).
  const rotOnly: Scene = { rot: shake, pos: still, depth: 2 };
  const m = motionOf(60, fps, rotOnly, hero);
  const mt = matches(rotOnly, hero, 0.3, 0.3 + 1 / fps, rng);
  const r0 = pairResidual(m, hero, 0.3, 0.3 + 1 / fps, mt.px, mt.py, mt.qx, mt.qy, 0.6 / 230);
  close(r0.dx * 910, 0, 0.15, "rotation only: no residual x (px)");
  close(r0.dy * 910, 0, 0.15, "rotation only: no residual y (px)");
  assert.ok(r0.inlierFrac > 0.9 && r0.coverage > 0.6, `rotation only: clean fit (${r0.inlierFrac}, ${r0.coverage})`);
  // Sideways step of 2 cm at 2 m: the plane shifts by −0.01 focal units (left/up), whatever the rotation.
  const step: Scene = { rot: shake, pos: (t) => (t < 0.31 ? [0, 0, 0] : [0.02, -0.01, 0]), depth: 2 };
  const ms = matches(step, hero, 0.3, 0.32, rng);
  const r1 = pairResidual(m, hero, 0.3, 0.32, ms.px, ms.py, ms.qx, ms.qy, 0.6 / 230);
  close(r1.dx, -0.01, 0.0006, "sideways step: residual x");
  close(r1.dy, 0.005, 0.0006, "sideways step: residual y");
  close(Math.exp(r1.logS), 1, 0.002, "sideways step: no scale");
  // A forward step reads as scale, not as shift.
  const fwd: Scene = { rot: shake, pos: (t) => (t < 0.31 ? [0, 0, 0] : [0, 0, 0.04]), depth: 2 };
  const mf = matches(fwd, hero, 0.3, 0.32, rng);
  const r2 = pairResidual(m, hero, 0.3, 0.32, mf.px, mf.py, mf.qx, mf.qy, 0.6 / 230);
  close(Math.exp(r2.logS), 2 / 1.96, 0.003, "forward step: scale");
  close(Math.hypot(r2.dx, r2.dy), 0, 0.0008, "forward step: no shift");
  // Fish over a static scene: a big still group vetoes the shift.
  const mfish = matches(rotOnly, hero, 0.3, 0.3 + 1 / fps, rng, 120, 0.4, 0.55, [14, -6]);
  const r3 = pairResidual(m, hero, 0.3, 0.3 + 1 / fps, mfish.px, mfish.py, mfish.qx, mfish.qy, 0.6 / 230);
  assert.ok(r3.zeroSupport > 0.3, `fish: still group seen (${r3.zeroSupport.toFixed(2)})`);
  console.log(`pair residual: rotation-only ${(r0.dx * 910).toFixed(3)},${(r0.dy * 910).toFixed(3)} px; step ${(r1.dx * 910).toFixed(2)},${(r1.dy * 910).toFixed(2)} px; forward scale ${Math.exp(r2.logS).toFixed(4)}; fish still group ${(r3.zeroSupport * 100).toFixed(0)}%`);
}

// ---------------------------------------------------------- L1 translation path
{
  const n = 400;
  const c = new Float64Array(n);
  for (let i = 0; i < n; i++) c[i] = 6 * Math.sin((2 * Math.PI * 1.1 * i) / fps) + 0.05 * i;
  const lo = new Float64Array(n).fill(-4);
  const hi = new Float64Array(n).fill(5);
  const s = smoothPath1D(c, lo, hi);
  for (let i = 0; i < n; i++) assert.ok(s[i] - c[i] >= -4 - 1e-6 && s[i] - c[i] <= 5 + 1e-6, `box held at ${i}`);
  const z = new Float64Array(n);
  const before = wander2(c, z, 30);
  const after = wander2(s, z, 30);
  assert.ok(after < 0.4 * before, `bob removed within the box: wander ${before.toFixed(2)} -> ${after.toFixed(2)}`);
  // The drift (0.05 px/frame) is followed, not held.
  assert.ok(Math.abs(s[n - 1] - c[n - 1]) <= 5, "drift followed");
  console.log(`translation path: wander ${before.toFixed(2)} -> ${after.toFixed(2)} px inside a −4..5 px box`);
}

// --------------------------------------------------- hybrid plan on a bobbing clip
{
  const n = 360;
  const scene: Scene = { rot: shake, pos: bob, depth: 2 };
  const motion = motionOf(n, fps, scene, hero);
  const residual = residualOf(motion, scene, hero);
  const gyro = computeGyroPlan(motion, params);
  const hyb = computeGyroPlan(motion, params, residual);
  const h = hyb.hybrid!;
  assert.ok(h, "hybrid stats present");
  assert.ok(h.applied, `hybrid applied (${h.reason})`);
  assert.ok(h.acceptedFrac > 0.95, `clean synthetic pairs accepted (${h.acceptedFrac})`);
  assert.ok(h.wanderAfter < 0.35 * h.wanderBefore, `heave/sway removed: ${h.wanderBefore.toFixed(2)} -> ${h.wanderAfter.toFixed(2)} px`);
  assert.ok(hyb.stats.maxUsedZoom <= hyb.maxZoom + 1e-6, "zoom within the budget");
  assert.ok(!gyro.hybrid, "no residual -> no hybrid stats");
  // Ground truth: where the scene point under the output centre sits, frame by frame.
  // The plane point the output centre sees should stay put (up to a smooth path) with the hybrid.
  const centreTrack = (plan: typeof gyro): { x: Float64Array; y: Float64Array } => {
    const x = new Float64Array(n);
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const t = plan.frameTimes[i];
      const warp = gyroWarpFnAtTime(motion, plan, t);
      const [sx, sy] = warp(0, 0);
      const ray = qrot(sampleOrientation(motion.times, motion.quats, t), unproject(hero, sx + W / 2, sy + H / 2));
      const p = scene.pos(t);
      const lam = (scene.depth - p[2]) / ray[2];
      // Plane point under the centre, in mm, minus the drift the path is allowed to follow.
      x[i] = (p[0] + lam * ray[0]) * 1000;
      y[i] = (p[1] + lam * ray[1]) * 1000;
    }
    return { x, y };
  };
  const g = centreTrack(gyro);
  const hb = centreTrack(hyb);
  const wg = wander2(g.x, g.y, 0.5 * fps);
  const wh = wander2(hb.x, hb.y, 0.5 * fps);
  // Floor: the same shot without the bob (drift only), gyro only — what the smooth pan alone leaves in this measure.
  const saved = scene.pos;
  scene.pos = (t) => [0.02 * t, 0, 0.05 * t];
  const f = centreTrack(gyro);
  scene.pos = saved;
  const floor = wander2(f.x, f.y, 0.5 * fps);
  assert.ok(wh - floor < 0.1 * (wg - floor), `ground truth: the plane under the centre wanders ${wg.toFixed(1)} mm (gyro) -> ${wh.toFixed(1)} mm (hybrid), floor ${floor.toFixed(1)} mm`);
  console.log(`hybrid plan: residual wander ${h.wanderBefore.toFixed(2)} -> ${h.wanderAfter.toFixed(2)} px (480-px), ground-truth plane wander ${wg.toFixed(1)} -> ${wh.toFixed(1)} mm (no-bob floor ${floor.toFixed(1)}), zoom ${gyro.stats.meanZoom.toFixed(3)} -> ${hyb.stats.meanZoom.toFixed(3)} (max ${hyb.stats.maxUsedZoom.toFixed(3)}), shift max ${h.maxShift.toFixed(1)} px`);
  // Switching it off gives the gyro-only plan exactly.
  const off = computeGyroPlan(motion, { ...params, hybrid: 0 }, residual);
  assert.deepEqual(Array.from(off.virt), Array.from(gyro.virt), "hybrid 0 = gyro only");
}

// ---------------------------------------------------------- graceful fallbacks
{
  const n = 300;
  // No translation at all: nothing to remove, the plan stays gyro-only.
  const calm: Scene = { rot: shake, pos: still, depth: 2 };
  const m1 = motionOf(n, fps, calm, hero);
  const p1 = computeGyroPlan(m1, params, residualOf(m1, calm, hero));

  assert.equal(p1.hybrid?.applied, false, `calm clip: not applied (${p1.hybrid?.reason})`);
  assert.deepEqual(Array.from(p1.virt), Array.from(computeGyroPlan(m1, params).virt), "calm clip: gyro-only plan untouched");
  // Featureless blue water: no pairs at all.
  const scene: Scene = { rot: shake, pos: bob, depth: 2 };
  const m2 = motionOf(n, fps, scene, hero);
  const p2 = computeGyroPlan(m2, params, residualOf(m2, scene, hero, { drop: () => true }));
  assert.equal(p2.hybrid?.applied, false, "no texture: not applied");
  assert.match(p2.hybrid!.reason, /unreliable/);
  // A school of fish crossing (60 % of the points moving 12 px/frame) for half the clip: those frames are dropped, the rest still works.
  const r3 = residualOf(m2, scene, hero, { movers: (i) => (i > 100 && i < 250 ? 0.6 : 0), moverShift: [12, 3] });
  const g3 = gateResidual(r3, "air", frameTimesOf(m2), fps);
  assert.ok(Object.values(g3.rejected).reduce((a, b) => a + b, 0) > 100, `fish frames rejected (${JSON.stringify(g3.rejected)})`);
  const p3 = computeGyroPlan(m2, params, r3);
  assert.ok(p3.stats.maxUsedZoom <= p3.maxZoom + 1e-6, "fish: zoom within the budget");
  // Fish as the majority (a big fish filling the frame, moving): the gate trusts nothing it cannot explain.
  const r4 = residualOf(m2, scene, hero, { movers: () => 0.5, moverShift: [9, -9] });
  const g4 = gateResidual(r4, "air", frameTimesOf(m2), fps);
  console.log(`fallbacks: calm "${p1.hybrid?.reason}", featureless "${p2.hybrid?.reason}", fish half-clip accepted ${(g3.acceptedFrac * 100).toFixed(0)}% ${JSON.stringify(g3.rejected)}, fish everywhere accepted ${(g4.acceptedFrac * 100).toFixed(0)}%`);
  assert.ok(g4.acceptedFrac < 0.3, "two equal motions everywhere: not trusted");
  // Gate defaults are sane.
  assert.ok(DEFAULT_GATE.minPoints >= 10 && DEFAULT_GATE.bridge <= 5);
}

// ---------------------------------------------------------------- view shift
{
  // viewShiftQuat turns the optical axis toward (ex, ey, 1).
  const q = viewShiftQuat(0.05, -0.02);
  const z = qrot(q, [0, 0, 1]);
  close(z[0] / z[2], 0.05, 1e-12, "view shift x");
  close(z[1] / z[2], -0.02, 1e-12, "view shift y");
  const j = jitter2(Float64Array.of(0, 1, 4, 9), Float64Array.of(0, 0, 0, 0));
  close(j, 2, 1e-12, "second difference of t²");
}
console.log("hybrid tests passed");
