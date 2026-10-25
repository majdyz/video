// Gyro maths: quaternions, lens models, smoother, horizon levelling, the
// crop budget and the per-vertex warp.
//   node --experimental-strip-types apps/motion-fix/test/gyro-math.test.ts
import assert from "node:assert/strict";
import {
  computeGyroPlan,
  frameTimesOf,
  gyroWarpFnAtTime,
  levelRoll,
  rotationJitter,
  smoothQuats,
  type GyroParams,
} from "../src/lib/gyro/gyro-stabilize.ts";
import { fitFisheye, maxTheta, project, thetaD, thetaFromD, unproject, type LensModel } from "../src/lib/gyro/lens.ts";
import { qangle, qat, qconj, qexp, qlog, qmat, qmul, qrot, qslerp, sampleOrientation, type Quat, type Vec3 } from "../src/lib/gyro/quat.ts";
import { fisheyeFromGoProPoly, GOPRO_WIDE_K, type CameraMotion } from "../src/lib/gyro/telemetry.ts";

const close = (a: number, b: number, tol: number, msg: string): void => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`);
const deg = Math.PI / 180;

// ---------------------------------------------------------------- quaternions
{
  const q = qexp([0.3, -0.2, 0.5]);
  const v: Vec3 = [0.2, -1, 3];
  const m = qmat(q);
  const r1 = qrot(q, v);
  const r2 = [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
  for (let k = 0; k < 3; k++) close(r1[k], r2[k], 1e-12, "qrot vs qmat");
  const l = qlog(q);
  close(l[0], 0.3, 1e-12, "log(exp)");
  close(l[2], 0.5, 1e-12, "log(exp)");
  const id = qmul(q, qconj(q));
  close(id[0], 1, 1e-12, "q q* = 1");
  // composition: rotate by a then b == rotate by b⊗a
  const a = qexp([0, 0.4, 0]);
  const b = qexp([0.1, 0, 0.2]);
  const c1 = qrot(b, qrot(a, v));
  const c2 = qrot(qmul(b, a), v);
  for (let k = 0; k < 3; k++) close(c1[k], c2[k], 1e-12, "composition order");
  const mid = qslerp(a, b, 0.5);
  close(qangle(qmul(qconj(a), mid)), qangle(qmul(qconj(mid), b)), 1e-9, "slerp midpoint is equidistant");
  // sampleOrientation interpolates and clamps
  const times = Float64Array.of(0, 1);
  const quats = Float64Array.of(...a, ...b);
  const s = sampleOrientation(times, quats, 0.5);
  close(qangle(qmul(qconj(s), mid)), 0, 1e-9, "sampleOrientation = slerp");
  close(qangle(qmul(qconj(sampleOrientation(times, quats, 5)), b)), 0, 1e-12, "clamped at end");
  console.log("quaternions ok");
}

// ---------------------------------------------------------------- lens
const hero: LensModel = { kind: "fisheye", width: 1920, height: 1080, fx: 911, fy: 911, cx: 960, cy: 540, k: [...GOPRO_WIDE_K], source: "test" };
const dji: LensModel = { kind: "fisheye", width: 3840, height: 2160, fx: 1405.13, fy: 1405.13, cx: 1920, cy: 1080, k: [0.2499, 0.01361, -0.06208, 0.01219], source: "test" };
const pin: LensModel = { kind: "pinhole", width: 1920, height: 1080, fx: 1000, fy: 1000, cx: 960, cy: 540, k: [0, 0, 0, 0], source: "test" };
{
  for (const lens of [hero, dji, pin]) {
    let worst = 0;
    for (let y = 0; y <= lens.height; y += lens.height / 8) {
      for (let x = 0; x <= lens.width; x += lens.width / 8) {
        const ray = unproject(lens, x, y);
        close(Math.hypot(...ray), 1, 1e-9, "unit ray");
        const p = project(lens, ray);
        worst = Math.max(worst, Math.hypot(p[0] - x, p[1] - y));
      }
    }
    assert.ok(worst < 1e-6, `${lens.kind} round trip ${worst}`);
  }
  // Centre magnification of the fisheye is fx: a 1 mrad ray lands fx/1000 px off-centre.
  const p = project(hero, [Math.tan(0.001), 0, 1]);
  close(p[0] - 960, 0.911, 1e-4, "fisheye centre focal");
  for (const td of [0.1, 0.7, 1.2]) close(thetaD(dji.k, thetaFromD(dji.k, td)), td, 1e-9, "thetaFromD inverse");
  assert.ok(maxTheta(hero.k) > 1.5, "HERO profile monotonic over the frame");
  // Fit recovers a known model from samples.
  const samples = [];
  for (let i = 1; i <= 50; i++) {
    const th = (i / 50) * 1.3;
    samples.push({ theta: th, r: 1405.13 * thetaD(dji.k, th) });
  }
  const fit = fitFisheye(samples);
  close(fit.f, 1405.13, 0.5, "fit f");
  for (let i = 0; i < 50; i++) close(fit.f * thetaD(fit.k, samples[i].theta), samples[i].r, 0.05, "fit r(θ)");
  // GoPro POLY (angle = poly(p), p = zmpl·r/halfDiag) -> fisheye: an equidistant POLY gives k ≈ 0 and f = hd/(a·zmpl).
  const hd = Math.hypot(5312, 2988) / 2;
  const gp = fisheyeFromGoProPoly([0, 1.1, 0, 0, 0], 0.9, 5312, 2988);
  assert.ok(gp);
  close(gp.fx, hd / (1.1 * 0.9), 0.01, "POLY equidistant f");
  for (const k of gp.k) close(k, 0, 1e-6, "POLY equidistant k");
  console.log("lens ok");
}

// ---------------------------------------------------------------- smoothing
function synthMotion(n: number, fps: number, rot: (t: number) => Vec3, lens: LensModel, readout = 0): CameraMotion {
  // High-rate samples (4x frame rate) so the readout has something to interpolate.
  const m = 4 * n;
  const times = new Float64Array(m);
  const quats = new Float64Array(4 * m);
  for (let i = 0; i < m; i++) {
    const t = i / (4 * fps) - 0.02;
    times[i] = t;
    quats.set(qexp(rot(t)), 4 * i);
  }
  return {
    source: "gopro",
    camera: "synthetic",
    times,
    quats,
    readout,
    timeOffset: 0,
    lens,
    down: [0, 1, 0],
    eis: { active: false, label: "off" },
    video: { width: lens.width, height: lens.height, rotation: 0, frameCount: n, duration: n / fps, fps },
    notes: [],
  };
}

const shake = (t: number): Vec3 => [
  1.0 * deg * Math.sin(2 * Math.PI * 4.3 * t) + 0.4 * deg * Math.sin(2 * Math.PI * 7.1 * t + 1),
  10 * deg * t + 0.8 * deg * Math.sin(2 * Math.PI * 3.1 * t + 0.5), // 10°/s pan + shake
  0.6 * deg * Math.sin(2 * Math.PI * 5.3 * t + 2),
];
{
  const n = 300;
  const fps = 60;
  const motion = synthMotion(n, fps, shake, hero);
  const times = frameTimesOf(motion);
  const raw = new Float64Array(4 * n);
  for (let i = 0; i < n; i++) raw.set(sampleOrientation(motion.times, motion.quats, times[i]), 4 * i);
  const sm = smoothQuats(raw, times, new Float64Array(n).fill(0.4));
  const j0 = rotationJitter(raw);
  const j1 = rotationJitter(sm);
  assert.ok(j1 < j0 / 20, `smoother jitter ${j0} -> ${j1}`);
  // Zero phase: in the middle the smoothed yaw sits on the pan, not behind it.
  let lag = 0;
  for (let i = 100; i < 200; i++) lag += qlog(qat(sm, i))[1] - 10 * deg * times[i];
  close(lag / 100 / deg, 0, 0.15, "pan followed without lag (deg)");

  const plan = computeGyroPlan(motion, { smoothing: 0.6, maxCrop: 0.15, horizonLock: 0, output: "lens" });
  assert.ok(plan.stats.virtJitter < plan.stats.rawJitter / 8, `plan jitter ${plan.stats.rawJitter} -> ${plan.stats.virtJitter}`);
  console.log(`smoother: jitter ${(j0 / deg).toFixed(4)} -> ${(j1 / deg).toFixed(4)} deg/frame²; plan ${plan.stats.rawJitter.toFixed(4)} -> ${plan.stats.virtJitter.toFixed(4)}, zoom ${plan.stats.meanZoom.toFixed(3)}`);
}

// ---------------------------------------------------------------- horizon
{
  // Camera looking at the horizon (forward = world z, down = world y), rolled 20° and pitched 10°.
  const q = qmul(qexp([10 * deg, 0, 0]), qexp([0, 0, 20 * deg]));
  const { q: lv, weight } = levelRoll(q, [0, 1, 0]);
  assert.equal(weight, 1);
  const x = qrot(lv, [1, 0, 0]);
  close(x[1], 0, 1e-9, "levelled camera x axis is horizontal");
  const f0 = qrot(q, [0, 0, 1]);
  const f1 = qrot(lv, [0, 0, 1]);
  for (let k = 0; k < 3; k++) close(f0[k], f1[k], 1e-9, "levelling keeps the view direction");
  assert.ok(qrot(lv, [0, 1, 0])[1] > 0.9, "camera down points down");
  // Straight down: no horizon, weight 0.
  assert.equal(levelRoll(qexp([-90 * deg, 0, 0]), [0, 1, 0]).weight, 0);
  console.log("horizon ok");
}

// ---------------------------------------------------------------- warp
{
  const still = synthMotion(10, 30, () => [0, 0, 0], hero);
  const solved = computeGyroPlan(still, { smoothing: 0, maxCrop: 0.1, horizonLock: 0, output: "lens" });
  assert.ok(solved.zoom[0] < 1.002, "a still camera needs (almost) no zoom");
  const plan = { ...solved, zoom: new Float32Array(10).fill(1) };
  const w = gyroWarpFnAtTime(still, plan, 0.1);
  for (const [x, y] of [[0, 0], [500, 300], [-900, -500], [950, 530]]) {
    const [sx, sy] = w(x, y);
    close(sx, x, 1e-6, "identity warp x");
    close(sy, y, 1e-6, "identity warp y");
  }
  // Virtual camera yawed right by δ relative to the source: the output centre shows the source δ·f to the right.
  const d = 2 * deg;
  const yawPlan = { ...plan, virt: plan.virt.map((v, i) => qexp([0, d, 0])[i % 4]) as Float64Array, zoom: new Float32Array(10).fill(1) };
  const [cx] = gyroWarpFnAtTime(still, yawPlan, 0.1)(0, 0);
  close(cx, 911 * d, 0.01, "yaw maps the centre by f·δ");
  // Pinhole output at zoom z: a pixel at radius r sees angle atan(r / (f·rectBase·z)).
  const recti = computeGyroPlan(still, { smoothing: 0, maxCrop: 0.1, horizonLock: 0, output: "rectilinear" });
  assert.ok(recti.rectBase > 0.3 && recti.rectBase < 3, `rectBase ${recti.rectBase}`);
  const wr = gyroWarpFnAtTime(still, recti, 0.1);
  const [ex] = wr(800, 0);
  close(recti.zoom[0], 1, 0.01, "rectilinear identity view fits at zoom ~1");
  const th = Math.atan(800 / (911 * recti.rectBase * recti.zoom[0]));
  close(ex, 911 * thetaD(hero.k, th), 1e-6, "rectilinear output maps through both lenses");
  for (const [x, y] of [[-960, -540], [960, 540], [-960, 540]]) {
    const [sx, sy] = wr(x, y);
    assert.ok(Math.abs(sx) <= 960.5 && Math.abs(sy) <= 540.5, `rectilinear corner inside (${sx}, ${sy})`);
  }

  // Rolling shutter: camera yawing at ω, virtual = raw at the frame centre.
  // A source row read Δt after the centre was seen from a camera turned ω·Δt further.
  const omega = 30 * deg;
  const ro = 0.012;
  const rs = synthMotion(20, 30, (t) => [0, omega * t, 0], pin, ro);
  const rsPlan = computeGyroPlan(rs, { smoothing: 0, maxCrop: 0.1, horizonLock: 0, output: "lens" });
  const t5 = rsPlan.frameTimes[5];
  const rsw = gyroWarpFnAtTime(rs, { ...rsPlan, zoom: new Float32Array(20).fill(1) }, t5);
  const [mx] = rsw(0, 0);
  close(mx, 0, 0.05, "centre row unaffected");
  const [bx, by] = rsw(0, 500);
  // Bottom row read ro·(by/H) later than the centre: the source camera has turned right, so the scene sits further left.
  const dt = ro * (by / 1080);
  close(bx, -1000 * Math.tan(omega * dt), 0.05, "rolling-shutter shift at the bottom row");
  console.log(`warp ok (rectBase ${recti.rectBase.toFixed(3)}, RS shift at bottom ${bx.toFixed(2)} px)`);
}

// ---------------------------------------------------------------- crop budget: never a black border
{
  const big = (t: number): Vec3 => {
    const s = shake(t);
    return [4 * s[0], 3 * s[1] - 25 * deg * t, 4 * s[2]];
  };
  for (const params of [
    { smoothing: 0.8, maxCrop: 0.12, horizonLock: 0, output: "lens" },
    { smoothing: 1, maxCrop: 0.04, horizonLock: 0, output: "lens" },
    { smoothing: 0.7, maxCrop: 0.1, horizonLock: 1, output: "rectilinear" },
  ] as GyroParams[]) {
    const motion = synthMotion(240, 60, big, dji, 0.01);
    const plan = computeGyroPlan(motion, params);
    let worst = 0;
    for (let i = 0; i < plan.frameTimes.length; i += 3) {
      const w = gyroWarpFnAtTime(motion, plan, plan.frameTimes[i]);
      for (let k = 0; k <= 16; k++) {
        const f = k / 16;
        for (const [x, y] of [[(f - 0.5) * 3840, -1080], [(f - 0.5) * 3840, 1080], [-1920, (f - 0.5) * 2160], [1920, (f - 0.5) * 2160]]) {
          const [sx, sy] = w(x, y);
          worst = Math.max(worst, Math.abs(sx) - 1920, Math.abs(sy) - 1080);
        }
      }
    }
    assert.ok(worst <= 1, `border excursion ${worst.toFixed(2)} px for ${JSON.stringify(params)}`);
    for (const z of plan.zoom) assert.ok(z <= plan.maxZoom + 1e-6 && z >= 1 - 1e-6);
    console.log(`crop budget ${JSON.stringify(params)}: worst excursion ${worst.toFixed(2)} px, zoom ${plan.stats.meanZoom.toFixed(3)}/${plan.stats.maxUsedZoom.toFixed(3)}, limited ${plan.stats.limitedFrames}/240, jitter ${plan.stats.rawJitter.toFixed(3)} -> ${plan.stats.virtJitter.toFixed(3)}`);
  }
}
console.log("gyro maths tests passed");

export type { Quat };
