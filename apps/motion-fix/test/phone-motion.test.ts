// Phone / logger motion sources: CAMM tracks, Gyroflow .gcsv and Sensor
// Logger sidecars, the Gyroflow-IMU-frame -> camera-frame relation, the
// clock sync of a motion log against tracked picture motion, and the
// display -> coded mapping the picture check uses on rotated phone clips.
// All fixtures are synthetic (the real sample files found are not licensed
// for redistribution).
//   node --experimental-strip-types apps/motion-fix/test/phone-motion.test.ts
import assert from "node:assert/strict";
import { angleAxisToQuat, decodeCamm } from "../src/lib/gyro/camm.ts";
import { applyOrientation, gyroflowToCamera, parseImuLog, validOrientation } from "../src/lib/gyro/imu-log.ts";
import { pinholeFromFov, project, unproject, type LensModel } from "../src/lib/gyro/lens.ts";
import { calibrateRawGyro, checkAndCalibrate, displayToCoded, syncLogClock, type MatchPair } from "../src/lib/gyro/medium.ts";
import { bytesReader, readMp4Index } from "../src/lib/gyro/mp4-index.ts";
import { qangle, qat, qexp, qmat, qmul, qconj, sampleOrientation, type Quat, type Vec3 } from "../src/lib/gyro/quat.ts";
import { defaultGoProOrin, integrateGoProGyro, integrateRates, phoneLens, probeTelemetry, probeWithLog, type CameraMotion } from "../src/lib/gyro/telemetry.ts";
import { rotateInto } from "../src/lib/frame-gray.ts";
import { makeRng } from "./synth.ts";

const close = (a: number, b: number, tol: number, msg: string): void => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`);
const deg = Math.PI / 180;

// ---------------------------------------------------------------- MP4 builder
function be32(n: number): number[] {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
}
function str4(s: string): number[] {
  return [...s].map((c) => c.charCodeAt(0));
}
function box(type: string, ...payload: number[][]): number[] {
  const body = payload.flat();
  return [...be32(8 + body.length), ...str4(type), ...body];
}
function full(type: string, ...payload: number[][]): number[] {
  return box(type, [0, 0, 0, 0], ...payload);
}
type TrackSpec = { handler: string; codec: string; timescale: number; samples: { data: number[]; dur: number }[]; width?: number; height?: number; rotation?: 0 | 90 };
function buildMp4(tracks: TrackSpec[], opts: { creationTime?: number; metaKeys?: Record<string, string> } = {}): Uint8Array {
  const ftyp = box("ftyp", str4("qt  "), be32(0));
  const mdatBody: number[] = [];
  const offsets: number[][] = [];
  const mdatStart = ftyp.length + 8;
  for (const t of tracks) {
    offsets.push(t.samples.map((s) => {
      const o = mdatStart + mdatBody.length;
      mdatBody.push(...s.data);
      return o;
    }));
  }
  const mdat = box("mdat", mdatBody);
  const traks = tracks.map((t, ti) => {
    const n = t.samples.length;
    const stsd = full("stsd", be32(1), box(t.codec, [0, 0, 0, 0, 0, 0, 0, 1]));
    const stts = full("stts", be32(n), ...t.samples.map((s) => [...be32(1), ...be32(s.dur)]));
    const stsc = full("stsc", be32(1), be32(1), be32(1), be32(1));
    const stsz = full("stsz", be32(0), be32(n), ...t.samples.map((s) => be32(s.data.length)));
    const stco = full("stco", be32(n), ...offsets[ti].map((o) => be32(o)));
    const total = t.samples.reduce((a, s) => a + s.dur, 0);
    const mdhd = full("mdhd", be32(0), be32(0), be32(t.timescale), be32(total), [0, 0, 0, 0]);
    const hdlr = full("hdlr", be32(0), str4(t.handler), be32(0), be32(0), be32(0), str4("Test"), [0]);
    const mdia = box("mdia", mdhd, hdlr, box("minf", box("stbl", stsd, stts, stsc, stsz, stco)));
    const r = t.rotation === 90;
    const matrix = [be32(r ? 0 : 0x10000), be32(r ? 0x10000 : 0), be32(0), be32(r ? 0xffff0000 : 0), be32(r ? 0 : 0x10000), be32(0), be32(0), be32(0), be32(0x40000000)].flat();
    const tkhd = full("tkhd", be32(0), be32(0), be32(ti + 1), be32(0), be32(total), be32(0), be32(0), [0, 0, 0, 0, 0, 0, 0, 0], matrix, be32((t.width ?? 0) * 65536), be32((t.height ?? 0) * 65536));
    return box("trak", tkhd, mdia);
  });
  const mvhd = full("mvhd", be32(opts.creationTime ? opts.creationTime + 2082844800 : 0), be32(0), be32(1000), be32(0), new Array(80).fill(0));
  const extra: number[][] = [];
  if (opts.metaKeys) {
    const names = Object.keys(opts.metaKeys);
    const keys = full("keys", be32(names.length), ...names.map((k) => box("mdta", str4(k).length === 4 ? str4(k) : [...k].map((c) => c.charCodeAt(0)))));
    const items = names.map((k, i) => box(String.fromCharCode(0, 0, 0, i + 1), box("data", be32(1), be32(0), [...new TextEncoder().encode(opts.metaKeys![k])])));
    extra.push(box("meta", full("hdlr", be32(0), str4("mdta"), be32(0), be32(0), be32(0), [0]), keys, box("ilst", ...items)));
  }
  const moov = box("moov", mvhd, ...traks, ...extra);
  return Uint8Array.from([...ftyp, ...mdat, ...moov]);
}
function cammPacket(type: number, floats: number[], ints?: number[]): number[] {
  const b = new DataView(new ArrayBuffer(4 + 4 * (ints ?? floats).length));
  b.setUint16(0, 0, true);
  b.setUint16(2, type, true);
  (ints ?? floats).forEach((v, i) => (ints ? b.setInt32(4 + 4 * i, v, true) : b.setFloat32(4 + 4 * i, v, true)));
  return [...new Uint8Array(b.buffer)];
}
function videoTrack(w: number, h: number, frames: number, rotation: 0 | 90 = 0): TrackSpec {
  return { handler: "vide", codec: "avc1", timescale: 600, width: w, height: h, rotation, samples: Array.from({ length: frames }, () => ({ data: [0, 0, 0, 1], dur: 20 })) };
}

// ---------------------------------------------------------------- Gyroflow frame vs camera frame
{
  // telemetry-parser gives GoPro HERO5 "XYZ" and HERO6 "ZyX" (Gyroflow IMU
  // frame); this repo measured the camera-frame channel orders from the
  // picture (ZXY, YxZ). With gyroflowToCamera both must give the same rates.
  // (Checked on real clips too: correlation 1.0000 on every axis against
  // telemetry-parser's normalized IMU for HERO5 Session, HERO6, HERO8, HERO10.)
  const rng = makeRng(3);
  for (const [model, tpOrientation] of [["HERO5 Black", "XYZ"], ["HERO6 Black", "ZyX"]] as const) {
    for (let k = 0; k < 20; k++) {
      const raw = [rng() - 0.5, rng() - 0.5, rng() - 0.5];
      const viaGf = gyroflowToCamera(applyOrientation(raw, tpOrientation));
      // Ours: integrate one tiny step with the measured channel order and read back the rate.
      const h = 1e-4;
      const t = Float64Array.of(0, h);
      const v = Float64Array.of(0, 0, 0, ...raw);
      const q = qat(integrateGoProGyro(t, v, null, model)!.quats, 1);
      const w = [q[1], q[2], q[3]].map((c) => (2 * c) / h);
      for (let a = 0; a < 3; a++) close(viaGf[a], w[a], 1e-6, `${model} (${defaultGoProOrin(model)}) axis ${a}`);
    }
  }
  assert.ok(validOrientation("YxZ") && !validOrientation("XXZ") && !validOrientation("abc"));
  console.log("gyroflow frame relation matches the measured GoPro axes");
}

// ---------------------------------------------------------------- .gcsv
{
  const rows: string[] = [];
  for (let i = 0; i < 400; i++) rows.push(`${i},${Math.round(100 * Math.sin(i / 20))},0,0,0,2048,0`);
  const text = ["GYROFLOW IMU LOG", "version,1.3", "id,potato_cam", "orientation,YxZ", "vendor,potatocam", "timestamp,1700000000", "videofilename,clip.mp4", "lens_info,linear", "frame_readout_time,15.5", "frame_readout_direction,1", "tscale,0.001", "gscale,0.01", "ascale,0.00048828125", "t,gx,gy,gz,ax,ay,az", ...rows].join("\n");
  const r = parseImuLog(text, "clip.gcsv");
  assert.ok(r.ok, r.ok ? "" : r.reason);
  if (r.ok) {
    const l = r.log;
    assert.equal(l.format, "gcsv");
    assert.equal(l.gyro.times.length, 400);
    close(l.gyro.times[399], 0.399, 1e-9, "tscale");
    // Column gx (raw x) at row 20: 100·sin(1)·0.01 rad/s. YxZ: Gyroflow Y = −raw x -> camera x = −Y = raw x.
    close(l.gyro.values[3 * 20], Math.round(100 * Math.sin(1)) * 0.01, 1e-12, "camera x from raw x");
    close(l.gyro.values[3 * 20 + 1], 0, 1e-12, "camera y");
    close(l.readout!, -0.0155, 1e-12, "bottom-to-top readout is negative");
    assert.equal(l.wallStart, 1700000000);
    assert.equal(l.lensInfo, "linear");
    assert.equal(l.device, "potatocam potato cam");
    // ay 2048 · ascale = 1 g on raw y; YxZ: Gyroflow Z = raw z, X = raw y -> camera y = −X = −1 g.
    assert.ok(l.accl);
    close(l.accl!.values[1], -9.80665, 1e-9, "accel in camera frame, m/s²");
  }
  // Floats in µs, no accelerometer, CAMERA IMU LOG header, CRLF.
  const t2 = ["CAMERA IMU LOG", "version,1.3", "id,app", "orientation,XYZ", "tscale,0.000001", "gscale,1", "t,gx,gy,gz", ...Array.from({ length: 50 }, (_, i) => `${10000 + i * 5000},0.1,0.2,0.3`)].join("\r\n");
  const r2 = parseImuLog(t2, "x.gcsv");
  assert.ok(r2.ok && r2.log.accl === null && r2.log.wallStart === null);
  if (r2.ok) {
    close(r2.log.gyro.times[1] - r2.log.gyro.times[0], 0.005, 1e-12, "µs timestamps");
    assert.deepEqual([...r2.log.gyro.values.subarray(0, 3)].map((v) => Math.round(v * 10) / 10), [-0.2, -0.1, -0.3]);
  }
  assert.equal(parseImuLog("hello,world\n1,2", "a.csv").ok, false);
  assert.equal(parseImuLog("GYROFLOW IMU LOG\nversion,1.3\n", "a.gcsv").ok, false);
  console.log("gcsv parser ok");
}

// ---------------------------------------------------------------- Sensor Logger
{
  const t0 = 1729850000123456789n;
  const lines = ["time,seconds_elapsed,z,y,x"];
  for (let i = 0; i < 100; i++) lines.push(`${t0 + BigInt(i) * 10000000n},${(i * 0.01).toFixed(2)},0.3,0.2,0.1`);
  const r = parseImuLog(lines.join("\n"), "Gyroscope.csv");
  assert.ok(r.ok, r.ok ? "" : r.reason);
  if (r.ok) {
    assert.equal(r.log.format, "sensor-logger");
    close(r.log.gyro.times[99], 0.99, 1e-6, "ns clock -> s");
    close(r.log.wallStart!, 1729850000.123, 1e-3, "wall clock");
    // Device axes (x 0.1, y 0.2, z 0.3) -> camera (−y, −x, −z).
    assert.deepEqual([...r.log.gyro.values.subarray(0, 3)].map((v) => Math.round(v * 10) / 10), [-0.2, -0.1, -0.3]);
  }
  const acc = parseImuLog(lines.join("\n"), "Accelerometer.csv");
  assert.ok(!acc.ok && /Gyroscope\.csv/.test(acc.reason));
  console.log("Sensor Logger parser ok");
}

// ---------------------------------------------------------------- CAMM
{
  assert.deepEqual(angleAxisToQuat(0, 0, 0), [1, 0, 0, 0]);
  close(qangle(angleAxisToQuat(0, 0.3, 0)), 0.3, 1e-12, "angle-axis angle");
  // 2 s of 200 Hz gyro: 0.5 rad/s about the camera's y (pan), plus exposure packets.
  const camm: TrackSpec = { handler: "meta", codec: "camm", timescale: 1000, samples: [] };
  for (let i = 0; i < 400; i++) camm.samples.push({ data: cammPacket(2, [0, 0.5, 0]), dur: 5 });
  for (let i = 0; i < 4; i++) camm.samples.push({ data: cammPacket(1, [], [8000000, 21000000]), dur: 0 });
  camm.samples.push({ data: cammPacket(3, [0, 9.8, 0]), dur: 0 });
  const file = buildMp4([videoTrack(1920, 1080, 60, 90), camm], { metaKeys: { "com.apple.quicktime.model": "Pixel Test", "com.apple.quicktime.camera.focal_length.35mm_equivalent": "24" } });
  const index = await readMp4Index(bytesReader(file), file.length);
  assert.ok(index);
  assert.equal(index.metaKeys["com.apple.quicktime.model"], "Pixel Test");
  const p = await probeTelemetry(bytesReader(file), file.length);
  assert.equal(p.status, "ok", JSON.stringify(p));
  if (p.status === "ok") {
    const m = p.motion;
    assert.equal(m.source, "camm");
    assert.match(m.camera, /^Phone motion data \(CAMM\)/);
    assert.equal(m.video.rotation, 90);
    assert.equal(m.lens.kind, "pinhole");
    assert.equal(m.lens.width, 1920, "lens in the coded (landscape) frame: tkhd is pre-matrix");
    assert.equal(m.lens.height, 1080);
    close(m.lens.fx, (24 / 43.27) * 1.25 * 1920, 1e-6, "focal from the 35 mm equivalent");
    close(m.readout, 0.021, 1e-9, "readout from the exposure packets");
    const q0 = sampleOrientation(m.times, m.quats, 0.2);
    const q1 = sampleOrientation(m.times, m.quats, 1.2);
    const d = qmul(qconj(q0), q1);
    close(qangle(d), 0.5, 2e-3, "integrated 1 s at 0.5 rad/s");
    assert.ok(Math.abs(d[2]) > 0.24, "about the camera y axis");
  }
  // Raw decode: multiple packet types, readout median.
  const raw = decodeCamm([Uint8Array.from(cammPacket(0, [0, 0, 0.2])), Uint8Array.from(cammPacket(0, [0, 0, 0.4])), Uint8Array.from(cammPacket(7, [1, 2, 3]))], [0, 0.1, 0.2]);
  assert.equal(raw.orientation?.times.length, 2);
  assert.equal(raw.counts[7], 1);
  // 360° (2:1) footage is refused.
  const eq = buildMp4([videoTrack(3840, 1920, 30), camm]);
  const pe = await probeTelemetry(bytesReader(eq), eq.length);
  assert.ok(pe.status === "unusable" && /360/.test(pe.reason));
  console.log("CAMM probe ok");
}

// ---------------------------------------------------------------- sidecar probe + clock sync
const lens: LensModel = pinholeFromFov(1280, 720, 80, "test");
function pairsFrom(truth: CameraMotion, l: LensModel, windows: [number, number][], fps: number, seed: number): MatchPair[] {
  const rng = makeRng(seed);
  const pairs: MatchPair[] = [];
  for (const [w0, w1] of windows) {
    for (let t0 = w0; t0 + 1 / fps <= w1; t0 += 1 / fps) {
      const t1 = t0 + 1 / fps;
      const m0 = qmat(sampleOrientation(truth.times, truth.quats, t0));
      const m1 = qmat(sampleOrientation(truth.times, truth.quats, t1));
      const px: number[] = [], py: number[] = [], qx: number[] = [], qy: number[] = [];
      for (let i = 0; i < 40; i++) {
        const x = 40 + rng() * (l.width - 80), y = 40 + rng() * (l.height - 80);
        const r = unproject(l, x, y);
        const w = [m0[0] * r[0] + m0[1] * r[1] + m0[2] * r[2], m0[3] * r[0] + m0[4] * r[1] + m0[5] * r[2], m0[6] * r[0] + m0[7] * r[1] + m0[8] * r[2]];
        const c: Vec3 = [m1[0] * w[0] + m1[3] * w[1] + m1[6] * w[2], m1[1] * w[0] + m1[4] * w[1] + m1[7] * w[2], m1[2] * w[0] + m1[5] * w[1] + m1[8] * w[2]];
        const p = project(l, c);
        if (!Number.isFinite(p[0])) continue;
        px.push(x); py.push(y); qx.push(p[0] + (rng() - 0.5) * 0.5); qy.push(p[1] + (rng() - 0.5) * 0.5);
      }
      pairs.push({ t0, t1, px: Float32Array.from(px), py: Float32Array.from(py), qx: Float32Array.from(qx), qy: Float32Array.from(qy) });
    }
  }
  return pairs;
}
{
  // Handheld phone wobble: smooth random rates (a periodic test signal would
  // make every period an equally good sync).
  const knots = (() => {
    const r = makeRng(21);
    return Array.from({ length: 3 * 700 }, () => r() - 0.5);
  })();
  const rate = (t: number): Vec3 => {
    const x = t * 10, i = Math.floor(x), f = x - i;
    const s = (1 - Math.cos(Math.PI * f)) / 2;
    const k = (a: number): number => (knots[3 * i + a] * (1 - s) + knots[3 * (i + 1) + a] * s) * 1.6;
    return [k(0), k(1), 0.4 * k(2)];
  };
  // A 60 s log at 200 Hz; the 20 s clip starts 17.25 s into it.
  const n = 12000;
  const gt = new Float64Array(n), gv = new Float64Array(3 * n);
  for (let i = 0; i < n; i++) {
    gt[i] = i / 200;
    gv.set(rate(gt[i]), 3 * i);
  }
  const start = 17.25;
  const integ = integrateRates(gt, gv)!;
  const fps = 30;
  // Truth on the video timeline (media t -> log t + start), focal as the picture really is.
  const truth: CameraMotion = { source: "imu-log", camera: "t", times: integ.times.map((t) => t - start), quats: integ.quats, readout: 0, timeOffset: 0, lens, down: null, eis: { active: false, label: "off" }, video: { width: 1280, height: 720, rotation: 0, frameCount: 600, duration: 20, fps }, notes: [] };
  const windows: [number, number][] = Array.from({ length: 8 }, (_, k) => [1 + 2.2 * k, 1.7 + 2.2 * k]);
  const pairs = pairsFrom(truth, lens, windows, fps, 5);

  // The sidecar probe on a synthetic clip: gcsv text -> parse -> probeWithLog.
  const rows = Array.from({ length: n }, (_, i) => `${i * 5},${(gv[3 * i + 1] * -1).toFixed(6)},${(gv[3 * i] * -1).toFixed(6)},${(gv[3 * i + 2] * -1).toFixed(6)}`);
  const gcsv = ["GYROFLOW IMU LOG", "version,1.3", "id,phone", "orientation,XYZ", "tscale,0.001", "gscale,1", "t,gx,gy,gz", ...rows].join("\n");
  const parsed = parseImuLog(gcsv, "clip.gcsv");
  assert.ok(parsed.ok);
  const file = buildMp4([videoTrack(1280, 720, 600)]);
  const probe = parsed.ok ? await probeWithLog(bytesReader(file), file.length, parsed.log) : null;
  assert.ok(probe && probe.status === "ok");
  if (probe?.status === "ok") {
    const m = probe.motion;
    assert.equal(m.source, "imu-log");
    assert.equal(m.camera, "Motion log (.gcsv)");
    assert.equal(m.timeOffset, 0, "no wall clocks: log assumed to start with the clip");
    assert.ok(m.syncRange && m.syncRange[0] <= 0 && m.syncRange[1] >= 40, `sync range ${m.syncRange}`);
    // The focal the probe guesses (26 mm) is off; the picture tells the rest.
    m.lens = { ...phoneLens(1280, 720, null, "guess") };
    const t0 = performance.now();
    const s = syncLogClock(m, pairs, m.syncRange!);
    const ms = performance.now() - t0;
    assert.ok(s, "synced");
    close(s!.offset, start, 0.006, "log clock offset recovered");
    console.log(`log clock sync: ${s!.offset.toFixed(3)} s (truth ${start}), correlation ${s!.correlation.toFixed(2)}, ${s!.errBefore.toFixed(1)} -> ${s!.errAfter.toFixed(1)} px, ${ms.toFixed(0)} ms`);
    // Full check: sync, then focal + readout self-calibration, then the medium check.
    const check = checkAndCalibrate(m, pairs);
    close(m.timeOffset, start, 0.006, "offset after checkAndCalibrate");
    close(m.lens.fx, lens.fx, 0.06 * lens.fx, "focal after calibration");
    assert.ok(check.consistent && check.errAir < 1.5, `consistent, err ${check.errAir.toFixed(2)} px`);
    console.log(`sidecar calibration: ${m.notes.join("; ")}`);
  }
  // Wall clocks: the log started 5 s before the clip (mvhd creation time); the sync searches ±3 s around it.
  const parsedWall = parseImuLog(gcsv.replace("tscale", "timestamp,1700000000\ntscale"), "clip.gcsv");
  const fileWall = buildMp4([videoTrack(1280, 720, 600)], { creationTime: 1700000005 });
  const pw = parsedWall.ok ? await probeWithLog(bytesReader(fileWall), fileWall.length, parsedWall.log) : null;
  assert.ok(pw?.status === "ok");
  if (pw?.status === "ok") {
    close(pw.motion.timeOffset, 5, 1e-9, "wall-clock placement");
    assert.deepEqual(pw.motion.syncRange, [2, 8]);
  }
  // Nothing to sync on (camera still): null, the caller keeps its guess.
  const still = { ...truth, quats: truth.quats.map((_, i) => (i % 4 === 0 ? 1 : 0)) };
  assert.equal(syncLogClock(still, pairsFrom(still, lens, windows, fps, 6), [0, 30]), null);
  // calibrateRawGyro's readout search: a 20 ms rolling shutter is found.
  const ro: CameraMotion = { ...truth, readout: 0.02, timeOffset: 0 };
  const roPairs: MatchPair[] = [];
  {
    const rng = makeRng(11);
    for (const [w0, w1] of windows) {
      for (let t0 = w0; t0 + 1 / fps <= w1; t0 += 1 / fps) {
        const t1 = t0 + 1 / fps;
        const px: number[] = [], py: number[] = [], qx: number[] = [], qy: number[] = [];
        for (let i = 0; i < 40; i++) {
          const x = 40 + rng() * 1200, y = 40 + rng() * 640;
          const ta = t0 + (y / 720 - 0.5) * ro.readout;
          const m0 = qmat(sampleOrientation(ro.times, ro.quats, ta));
          const r = unproject(lens, x, y);
          const w = [m0[0] * r[0] + m0[1] * r[1] + m0[2] * r[2], m0[3] * r[0] + m0[4] * r[1] + m0[5] * r[2], m0[6] * r[0] + m0[7] * r[1] + m0[8] * r[2]];
          // Iterate the row time of the matched point once (small rotations).
          let p: [number, number] = [x, y];
          for (let it = 0; it < 3; it++) {
            const m1 = qmat(sampleOrientation(ro.times, ro.quats, t1 + (p[1] / 720 - 0.5) * ro.readout));
            const c: Vec3 = [m1[0] * w[0] + m1[3] * w[1] + m1[6] * w[2], m1[1] * w[0] + m1[4] * w[1] + m1[7] * w[2], m1[2] * w[0] + m1[5] * w[1] + m1[8] * w[2]];
            p = project(lens, c, [0, 0]);
          }
          px.push(x); py.push(y); qx.push(p[0]); qy.push(p[1]);
        }
        roPairs.push({ t0, t1, px: Float32Array.from(px), py: Float32Array.from(py), qx: Float32Array.from(qx), qy: Float32Array.from(qy) });
      }
    }
  }
  const cal = calibrateRawGyro({ ...ro, readout: 0 }, roPairs, { focalMin: 0.7, focalMax: 1.4, readouts: [0, 0.008, 0.016, 0.024, 0.032] });
  assert.ok(cal && cal.readoutMs !== undefined && Math.abs(cal.readoutMs - 20) <= 4, `readout found: ${JSON.stringify(cal)}`);
  console.log(`readout search: ${cal!.readoutMs} ms (truth 20)`);
}

// ---------------------------------------------------------------- display -> coded (rotated phone clips)
{
  // A bright pixel in a coded image, rotated like the decoder does, maps back to where it was.
  const cw = 8, ch = 5;
  for (const rot of [90, 180, 270] as const) {
    for (let k = 0; k < cw * ch; k++) {
      const src = new Float32Array(cw * ch);
      src[k] = 1;
      const out = new Float32Array(cw * ch);
      rotateInto(src, cw, ch, rot, out);
      const dw = rot === 180 ? cw : ch;
      const j = out.indexOf(1);
      const xd = (j % dw) + 0.5, yd = Math.floor(j / dw) + 0.5;
      const [u, v] = displayToCoded(xd, yd, rot, cw, ch);
      close(u, (k % cw) + 0.5, 1e-9, `rot ${rot} x`);
      close(v, Math.floor(k / cw) + 0.5, 1e-9, `rot ${rot} y`);
    }
  }
  console.log("display -> coded mapping ok");
}

console.log("phone motion tests passed");
export type { Quat };
void qexp;
