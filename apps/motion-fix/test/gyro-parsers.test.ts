// Telemetry parsers: MP4 index (ranged reads), GPMF KLV, DJI protobuf —
// on synthetic data and cross-checked against telemetry-parser's output for
// real GoPro HERO10 and DJI Avata payloads (test/fixtures, made by
// scripts/make-gyro-fixtures.ts).
//   node --experimental-strip-types apps/motion-fix/test/gyro-parsers.test.ts
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { decodeDjiSample, protoFields } from "../src/lib/gyro/dji-meta.ts";
import { extractDji, extractGoPro, telemetryTrackOf } from "../src/lib/gyro/extract.ts";
import { klvNumbers, parseKlv, payloadStreams, readGoProGlobals } from "../src/lib/gyro/gpmf.ts";
import { bytesReader, readMp4Index, readSamples, type Mp4Index, type Mp4Track, type RangeReader } from "../src/lib/gyro/mp4-index.ts";
import { qmul, type Quat } from "../src/lib/gyro/quat.ts";
import { probeTelemetry } from "../src/lib/gyro/telemetry.ts";

const close = (a: number, b: number, tol: number, msg: string): void => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`);

// ---------------------------------------------------------------- byte builders
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
function klv(key: string, type: string, size: number, repeat: number, data: number[]): number[] {
  const out = [...str4(key), type === "\0" ? 0 : type.charCodeAt(0), size, (repeat >> 8) & 255, repeat & 255, ...data];
  while (out.length % 4) out.push(0);
  return out;
}
function i16(v: number): number[] {
  const u = v < 0 ? v + 65536 : v;
  return [(u >> 8) & 255, u & 255];
}

// ---------------------------------------------------------------- MP4 index on a synthetic file
{
  // ftyp | mdat with 3 metadata samples (two in chunk 1, one in chunk 2) | moov
  const ftyp = box("ftyp", str4("mp42"), be32(0));
  const s1 = [1, 2, 3, 4, 5];
  const s2 = [6, 7, 8];
  const s3 = [9, 10, 11, 12];
  const mdatStart = ftyp.length;
  const mdat = box("mdat", s1, s2, s3);
  const off1 = mdatStart + 8;
  const off2 = off1 + s1.length + s2.length;
  const stsd = full("stsd", be32(1), box("gpmd", [0, 0, 0, 0, 0, 0, 0, 1]));
  const stts = full("stts", be32(1), be32(3), be32(1001));
  const stsc = full("stsc", be32(2), be32(1), be32(2), be32(1), be32(2), be32(1), be32(1));
  const stsz = full("stsz", be32(0), be32(3), be32(s1.length), be32(s2.length), be32(s3.length));
  const stco = full("stco", be32(2), be32(off1), be32(off2));
  const stbl = box("stbl", stsd, stts, stsc, stsz, stco);
  const minf = box("minf", stbl);
  const mdhd = full("mdhd", be32(0), be32(0), be32(1000), be32(3003), [0, 0, 0, 0]);
  const hdlr = full("hdlr", be32(0), str4("meta"), be32(0), be32(0), be32(0), str4("GoPro MET"), [0]);
  const mdia = box("mdia", mdhd, hdlr, minf);
  const matrix = [be32(0x10000), be32(0), be32(0), be32(0), be32(0x10000), be32(0), be32(0), be32(0), be32(0x40000000)].flat();
  const tkhd = full("tkhd", be32(0), be32(0), be32(7), be32(0), be32(3003), be32(0), be32(0), [0, 0, 0, 0, 0, 0, 0, 0], matrix, be32(0), be32(0));
  const trak = box("trak", tkhd, mdia);
  const udta = box("udta", box("GPMF", klv("MINF", "c", 1, 4, str4("TEST"))));
  const moov = box("moov", trak, udta);
  const file = Uint8Array.from([...ftyp, ...mdat, ...moov]);
  let reads = 0;
  let bytes = 0;
  const base = bytesReader(file);
  const read: RangeReader = (o, l) => {
    reads++;
    bytes += l;
    return base(o, l);
  };
  const index = await readMp4Index(read, file.length);
  assert.ok(index);
  assert.equal(index.tracks.length, 1);
  const t = index.tracks[0];
  assert.equal(t.codec, "gpmd");
  assert.equal(t.handler, "meta");
  assert.equal(t.handlerName, "GoPro MET");
  assert.equal(t.id, 7);
  assert.deepEqual(t.samples.map((s) => [s.offset, s.size]), [[off1, 5], [off1 + 5, 3], [off2, 4]]);
  close(t.samples[2].time, 2.002, 1e-9, "sample time");
  assert.equal(telemetryTrackOf(index)?.kind, "gopro");
  const got = await readSamples(read, t.samples, { gap: 0 });
  assert.deepEqual(got.map((g) => Array.from(g)), [s1, s2, s3]);
  assert.ok(bytes < file.length + 64, "index + samples read without loading the mdat twice");
  assert.equal(readGoProGlobals([parseKlv(index.udtaGpmf!)]).model, "TEST");
  console.log(`mp4 index ok (${reads} reads)`);
}

// ---------------------------------------------------------------- GPMF KLV (synthetic)
{
  const cori = klv("CORI", "s", 8, 2, [...i16(32767), ...i16(0), ...i16(-16384), ...i16(100), ...i16(16384), ...i16(16384), ...i16(16384), ...i16(16384)]);
  const inner = [...klv("STMP", "J", 8, 1, [0, 0, 0, 0, 0, 0, 0x30, 0x39]), ...klv("SCAL", "s", 2, 1, i16(32767)), ...cori];
  const strmNode = klv("STRM", "\0", 1, inner.length, inner);
  const gyroInner = [...klv("SCAL", "s", 2, 3, [...i16(100), ...i16(200), ...i16(400)]), ...klv("ORIN", "c", 1, 3, str4("ZXY")), ...klv("GYRO", "s", 6, 1, [...i16(100), ...i16(-200), ...i16(800)])];
  const gyroStrm = klv("STRM", "\0", 1, gyroInner.length, gyroInner);
  const devInner = [...klv("DVNM", "c", 1, 6, str4("Camera")), ...strmNode, ...gyroStrm];
  const devc = Uint8Array.from(klv("DEVC", "\0", 1, devInner.length, devInner));
  const s = payloadStreams(devc, ["CORI", "GYRO"]);
  const c = s.get("CORI");
  assert.ok(c);
  assert.equal(c.rows.length, 2);
  close(c.rows[0][0], 1, 1e-9, "CORI w scaled");
  close(c.rows[0][2], -16384 / 32767, 1e-9, "CORI negative component");
  assert.equal(c.stmp, 12345);
  const g = s.get("GYRO");
  assert.ok(g);
  assert.equal(g.orin, "ZXY");
  assert.deepEqual(g.rows[0], [1, -1, 2]);
  assert.deepEqual(klvNumbers(parseKlv(Uint8Array.from(klv("TEST", "q", 4, 1, [0, 2, 0x80, 0])))[0]), [2.5]);
  console.log("gpmf ok");
}

// ---------------------------------------------------------------- DJI protobuf (synthetic)
{
  const varint = (n: number): number[] => {
    const out: number[] = [];
    do {
      let b = n % 128;
      n = Math.floor(n / 128);
      if (n > 0) b |= 128;
      out.push(b);
    } while (n > 0);
    return out;
  };
  const tag = (no: number, wire: number): number[] => varint(no * 8 + wire);
  const msg = (no: number, body: number[]): number[] => [...tag(no, 2), ...varint(body.length), ...body];
  const f32 = (no: number, v: number): number[] => {
    const b = Buffer.alloc(4);
    b.writeFloatLE(v);
    return [...tag(no, 5), ...b];
  };
  const vi = (no: number, v: number): number[] => [...tag(no, 0), ...varint(v)];
  const packed = (no: number, vs: number[]): number[] => {
    const b = Buffer.alloc(4 * vs.length);
    vs.forEach((v, i) => b.writeFloatLE(v, 4 * i));
    return msg(no, [...b]);
  };
  const header = msg(1, [...msg(10, str4("DJI Test")), ...msg(1, str4("dvtm_wm169.proto"))]);
  const clip = msg(1, [...header, ...msg(3, packed(1, [0.25, 0.01, -0.06, 0.012])), ...msg(4, vi(1, 9720000)), ...msg(8, f32(1, 1405.5)), ...msg(9, vi(1, 1)), ...msg(10, vi(1, 2000)), ...msg(11, f32(1, 59.97))]);
  const stream = msg(2, msg(3, [...vi(1, 3840), ...vi(2, 2160), ...f32(3, 59.94)]));
  const q = (w: number, x: number, y: number, z: number): number[] => msg(3, [...f32(1, w), ...f32(2, x), ...f32(3, y), ...f32(4, z)]);
  const frame = msg(3, [...msg(1, [...vi(1, 7), ...vi(2, 123456789012)]), ...msg(2, msg(4, [...vi(1, 1), ...vi(1, 500)])), ...msg(3, msg(2, [...vi(1, 1), ...vi(2, 2), ...q(1, 0, 0, 0), ...q(0, 1, 0, 0), ...f32(4, 13.25)]))]);
  const d = decodeDjiSample(Uint8Array.from([...clip, ...stream, ...frame]));
  assert.ok(d.clip && d.frame);
  assert.equal(d.clip.productName, "DJI Test");
  assert.equal(d.clip.readoutNs, 9720000);
  close(d.clip.focalLength!, 1405.5, 1e-3, "focal");
  assert.equal(d.clip.eisStatus, 1);
  close(d.clip.distortion![2], -0.06, 1e-6, "k3");
  assert.equal(d.clip.videoWidth, 3840);
  close(d.clip.videoFps!, 59.94, 1e-4, "fps");
  assert.equal(d.frame.frameTimestampUs, 123456789012);
  close(d.frame.exposure, 1 / 500, 1e-12, "exposure");
  assert.deepEqual(d.frame.quats, [1, 0, 0, 0, 0, 1, 0, 0]);
  close(d.frame.offset, 13.25, 1e-6, "offset");
  assert.equal(protoFields(Uint8Array.from(vi(5, 300)))[0].value, 300);
  console.log("dji protobuf ok");
}

// ---------------------------------------------------------------- cross-check vs telemetry-parser: GoPro HERO10 (HyperSmooth)
const fx = new URL("./fixtures/", import.meta.url);
function unpack(buf: Buffer): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (let p = 0; p + 4 <= buf.length; ) {
    const n = buf.readUInt32BE(p);
    out.push(new Uint8Array(buf.buffer, buf.byteOffset + p + 4, n));
    p += 4 + n;
  }
  return out;
}
function fakeTrack(payloads: Uint8Array[], times: { time: number; duration: number }[], codec: string): { track: Mp4Track; read: RangeReader } {
  const total = payloads.reduce((a, b) => a + b.length, 0);
  const buf = new Uint8Array(total);
  const samples = [];
  let off = 0;
  for (let i = 0; i < payloads.length; i++) {
    buf.set(payloads[i], off);
    samples.push({ offset: off, size: payloads[i].length, time: times[i].time, duration: times[i].duration });
    off += payloads[i].length;
  }
  return { track: { id: 1, handler: "meta", handlerName: "", codec, timescale: 1000, duration: 0, width: 0, height: 0, rotation: 0, editMediaTime: 0, samples }, read: bytesReader(buf) };
}
const conjX = (q: Quat): Quat => [q[0], -q[1], q[2], q[3]];
{
  const ref = JSON.parse(readFileSync(new URL("gopro-reference.json", fx), "utf8"));
  const [udta, ...payloads] = unpack(readFileSync(new URL("gopro-payloads.bin", fx)));
  const { track, read } = fakeTrack(payloads, ref.samples, "gpmd");
  const index: Mp4Index = { fileSize: 0, tracks: [track], udtaGpmf: udta };
  const g = await extractGoPro(index, track, read);
  assert.equal(g.globals.model, ref.model);
  close(g.globals.srot!, ref.readout_ms, 1e-9, "SROT = telemetry-parser readout");
  assert.equal(g.globals.eise, "Y");
  assert.ok(g.cori && g.iori);
  assert.equal(g.cori.times.length, ref.quats.length, "one CORI per frame, same count as telemetry-parser");
  let worstQ = 0;
  let worstT = 0;
  for (let i = 0; i < ref.quats.length; i++) {
    const c: Quat = [g.cori.values[4 * i], g.cori.values[4 * i + 1], g.cori.values[4 * i + 2], g.cori.values[4 * i + 3]];
    const io: Quat = [g.iori.values[4 * i], g.iori.values[4 * i + 1], g.iori.values[4 * i + 2], g.iori.values[4 * i + 3]];
    // telemetry-parser: CORI·IORI with the x component negated on both.
    const tp = qmul(conjX(c), conjX(io));
    const [t, w, x, y, z] = ref.quats[i];
    worstQ = Math.max(worstQ, Math.abs(tp[0] - w), Math.abs(tp[1] - x), Math.abs(tp[2] - y), Math.abs(tp[3] - z));
    worstT = Math.max(worstT, Math.abs(g.cori.times[i] * 1000 - t));
  }
  assert.ok(worstQ < 1e-9, `GoPro quaternions vs telemetry-parser: ${worstQ}`);
  assert.ok(worstT < 0.01, `GoPro timestamps vs telemetry-parser: ${worstT} ms`);
  console.log(`gopro vs telemetry-parser: ${ref.quats.length} quaternions, max diff ${worstQ.toExponential(1)}, time ${worstT.toFixed(4)} ms`);
}

// ---------------------------------------------------------------- cross-check vs telemetry-parser: DJI Avata
{
  const ref = JSON.parse(readFileSync(new URL("dji-reference.json", fx), "utf8"));
  const payloads = unpack(readFileSync(new URL("dji-payloads.bin", fx)));
  const { track, read } = fakeTrack(payloads, ref.samples, "djmd");
  const d = await extractDji(track, read);
  assert.ok(d.clip);
  const fp = ref.lens;
  close(d.clip.focalLength!, fp.camera_matrix[0][0], 1e-6, "DJI focal");
  for (let k = 0; k < 4; k++) close(d.clip.distortion![k], fp.distortion_coeffs[k], 1e-9, `DJI k${k + 1}`);
  const readoutMs = (d.clip.readoutNs! / 1e6) * (d.clip.sensorFps! / d.clip.videoFps!);
  close(readoutMs, ref.readout_ms, 1e-6, "DJI readout");
  // telemetry-parser converts to Gyroflow's frame: (0,0,1,0) ⊗ q ⊗ (0.5,−0.5,−0.5,0.5).
  const tpOf = (q: Quat): Quat => qmul([0, 0, 1, 0], qmul(q, [0.5, -0.5, -0.5, 0.5]));
  const refQ: number[][] = ref.quats;
  let worstQ = 0;
  let worstT = 0;
  let matched = 0;
  for (let i = 0; i < d.attitude.times.length; i++) {
    const t = d.attitude.times[i] * 1000;
    // nearest reference sample in time
    let best = -1;
    let bd = Infinity;
    for (let j = 0; j < refQ.length; j++) {
      const dd = Math.abs(refQ[j][0] - t);
      if (dd < bd) {
        bd = dd;
        best = j;
      }
    }
    if (best < 0 || bd > 1) continue;
    matched++;
    const mine = tpOf([d.attitude.values[4 * i], d.attitude.values[4 * i + 1], d.attitude.values[4 * i + 2], d.attitude.values[4 * i + 3]]);
    const r = refQ[best];
    const s = Math.sign(mine[0] * r[1] + mine[1] * r[2] + mine[2] * r[3] + mine[3] * r[4]) || 1;
    worstQ = Math.max(worstQ, ...[0, 1, 2, 3].map((k) => Math.abs(s * mine[k] - r[k + 1])));
    worstT = Math.max(worstT, bd);
  }
  assert.ok(matched > 0.95 * d.attitude.times.length, `matched ${matched}/${d.attitude.times.length}`);
  assert.ok(worstQ < 2e-3, `DJI quaternions vs telemetry-parser: ${worstQ}`);
  assert.ok(worstT < 0.3, `DJI timestamps vs telemetry-parser: ${worstT} ms`);
  console.log(`dji vs telemetry-parser: ${matched} quaternions, max diff ${worstQ.toExponential(1)}, time ${worstT.toFixed(3)} ms`);
}

// ---------------------------------------------------------------- full probe on the sample clips, when present
const SAMPLES = process.env.GYRO_SAMPLES ?? "/tmp/claude-1000/-home-majdyz/8748a5fb-c7bc-4cd8-a074-37faf13dce54/scratchpad/v3";
async function probePath(path: string) {
  const buf = readFileSync(path);
  return probeTelemetry(bytesReader(new Uint8Array(buf.buffer, buf.byteOffset, buf.length)), buf.length);
}
if (existsSync(`${SAMPLES}/hero10-hs-10s.mp4`)) {
  const p = await probePath(`${SAMPLES}/hero10-hs-10s.mp4`);
  assert.equal(p.status, "ok");
  if (p.status === "ok") {
    assert.equal(p.motion.camera, "GoPro HERO10 Black");
    assert.ok(p.motion.eis.active);
    assert.equal(p.motion.readout, 0);
    close(p.motion.lens.fx, 996, 15, "HS focal near the fitted 996 px");
    assert.ok(p.motion.down && p.motion.down[1] > 0.9, "gravity points down the image");
  }
  const q = await probePath(`${SAMPLES}/hero10-10s.mp4`);
  assert.ok(q.status === "ok" && !q.motion.eis.active && Math.abs(q.motion.lens.fx - 907.5) < 15);
  console.log("probe on HERO10 samples ok");
} else console.log("(sample clips not found, probe test skipped)");
if (existsSync(`${SAMPLES}/avata-12s-1080.mp4`)) {
  const p = await probePath(`${SAMPLES}/avata-12s-1080.mp4`);
  assert.equal(p.status, "ok");
  if (p.status === "ok") {
    close(p.motion.lens.fx, 1405.13 / 2, 0.01, "DJI focal scaled to the 1080p re-encode");
    close(p.motion.readout * 1000, 9.725, 0.01, "DJI readout");
  }
  console.log("probe on Avata sample ok");
}
console.log("gyro parser tests passed");
