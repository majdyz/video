// DJI `djmd` metadata track decoder (Osmo Action 2/3/4/5 Pro, Avata, O3/O4
// air units, Neo — the "wm169" product schema). Each MP4 sample is one
// protobuf `ProductMeta` message; the first carries the clip calibration
// (lens, readout, EIS mode, IMU rate), every one carries the frame's fused
// attitude quaternions.
//
// A tiny wire-format reader stands in for a protobuf runtime: we only walk
// the handful of field numbers below. Field numbers are from DJI's own
// schema files (dvtm_wm169.proto / dvtm_library.proto, as distributed with
// telemetry-parser under MIT/Apache-2.0).

type Field = { no: number; wire: number; /** varint / fixed value */ value: number; /** length-delimited payload */ bytes: Uint8Array | null; /** fixed32 raw for floats */ raw32: number };

function readVarint(b: Uint8Array, p: { i: number }): number {
  let result = 0;
  let mul = 1;
  for (let k = 0; k < 10; k++) {
    const byte = b[p.i++];
    if (byte === undefined) throw new Error("truncated varint");
    result += (byte & 0x7f) * mul;
    if ((byte & 0x80) === 0) return result;
    mul *= 128;
  }
  throw new Error("varint too long");
}

const f32 = new DataView(new ArrayBuffer(4));
function floatFromBits(bits: number): number {
  f32.setUint32(0, bits >>> 0, true);
  return f32.getFloat32(0, true);
}

export function protoFields(b: Uint8Array): Field[] {
  const out: Field[] = [];
  const p = { i: 0 };
  while (p.i < b.length) {
    const tag = readVarint(b, p);
    const no = Math.floor(tag / 8);
    const wire = tag & 7;
    if (wire === 0) out.push({ no, wire, value: readVarint(b, p), bytes: null, raw32: 0 });
    else if (wire === 1) {
      const dv = new DataView(b.buffer, b.byteOffset + p.i, 8);
      out.push({ no, wire, value: dv.getFloat64(0, true), bytes: null, raw32: 0 });
      p.i += 8;
    } else if (wire === 2) {
      const len = readVarint(b, p);
      if (p.i + len > b.length) throw new Error("truncated field");
      out.push({ no, wire, value: len, bytes: b.subarray(p.i, p.i + len), raw32: 0 });
      p.i += len;
    } else if (wire === 5) {
      const bits = (b[p.i] | (b[p.i + 1] << 8) | (b[p.i + 2] << 16) | (b[p.i + 3] << 24)) >>> 0;
      out.push({ no, wire, value: floatFromBits(bits), bytes: null, raw32: bits });
      p.i += 4;
    } else throw new Error(`unsupported wire type ${wire}`);
  }
  return out;
}

const sub = (fields: Field[], no: number): Uint8Array | null => fields.find((f) => f.no === no && f.wire === 2)?.bytes ?? null;
const subs = (fields: Field[], no: number): Uint8Array[] => fields.filter((f) => f.no === no && f.wire === 2).map((f) => f.bytes as Uint8Array);
const num = (fields: Field[], no: number): number | null => {
  const f = fields.find((x) => x.no === no && x.wire !== 2);
  return f ? f.value : null;
};
const str = (fields: Field[], no: number): string | null => {
  const b = sub(fields, no);
  return b ? new TextDecoder().decode(b) : null;
};
/** Repeated float: packed (wire 2) or one field per value (wire 5). */
function floats(fields: Field[], no: number): number[] {
  const out: number[] = [];
  for (const f of fields) {
    if (f.no !== no) continue;
    if (f.wire === 5) out.push(f.value);
    else if (f.wire === 2 && f.bytes) {
      const dv = new DataView(f.bytes.buffer, f.bytes.byteOffset, f.bytes.byteLength);
      for (let i = 0; i + 4 <= f.bytes.byteLength; i += 4) out.push(dv.getFloat32(i, true));
    }
  }
  return out;
}
function ints(fields: Field[], no: number): number[] {
  const out: number[] = [];
  for (const f of fields) {
    if (f.no !== no) continue;
    if (f.wire === 0) out.push(f.value > 0x7fffffff && f.value < 2 ** 32 ? f.value - 2 ** 32 : f.value);
    else if (f.wire === 2 && f.bytes) {
      const p = { i: 0 };
      while (p.i < f.bytes.length) out.push(readVarint(f.bytes, p));
    }
  }
  return out;
}

export const DJI_EIS_NAMES = [
  "off",
  "RockSteady",
  "HorizonSteady",
  "HyperSmooth",
  "Tradeoff",
  "HorizonBalancing",
  "DeepSpace",
  "off (with crop)",
  "HorizonCorrection",
  "RS auto",
] as const;

export type DjiClipMeta = {
  productName: string | null;
  protoFile: string | null;
  firmware: string | null;
  /** OpenCV fisheye k1..k4. */
  distortion: number[] | null;
  /** Readout per frame, raw (ns). */
  readoutNs: number | null;
  /** fx = fy, pixels at the video resolution. */
  focalLength: number | null;
  /** EisStatusType enum value; null when the field is absent (= EIS_OFF). */
  eisStatus: number | null;
  imuRate: number | null;
  sensorFps: number | null;
  videoWidth: number | null;
  videoHeight: number | null;
  videoFps: number | null;
};

export type DjiFrameMeta = {
  /** µs since power-up. */
  frameTimestampUs: number;
  /** Exposure time, s (0 if absent). */
  exposure: number;
  /** Attitude samples within the frame interval as (w, x, y, z), raw DJI frame. */
  quats: number[];
  /** Time offset between the first sensor row exposure and the first sample, in samples. */
  offset: number;
};

export type DjiSample = { clip: DjiClipMeta | null; frame: DjiFrameMeta | null };

export function decodeDjiSample(bytes: Uint8Array): DjiSample {
  const top = protoFields(bytes);
  let clip: DjiClipMeta | null = null;
  const clipBytes = sub(top, 1);
  const streamBytes = sub(top, 2);
  if (clipBytes) {
    const c = protoFields(clipBytes);
    const header = sub(c, 1);
    const h = header ? protoFields(header) : [];
    const dist = sub(c, 3);
    const ro = sub(c, 4);
    const fl = sub(c, 8);
    const eis = sub(c, 9);
    const imu = sub(c, 10);
    const sfps = sub(c, 11);
    let videoWidth: number | null = null;
    let videoHeight: number | null = null;
    let videoFps: number | null = null;
    if (streamBytes) {
      const vs = sub(protoFields(streamBytes), 3);
      if (vs) {
        const v = protoFields(vs);
        videoWidth = num(v, 1);
        videoHeight = num(v, 2);
        videoFps = num(v, 3);
      }
    }
    clip = {
      productName: str(h, 10),
      protoFile: str(h, 1),
      firmware: str(h, 6),
      distortion: dist ? floats(protoFields(dist), 1) : null,
      readoutNs: ro ? num(protoFields(ro), 1) : null,
      focalLength: fl ? num(protoFields(fl), 1) : null,
      eisStatus: eis ? (num(protoFields(eis), 1) ?? 0) : null,
      imuRate: imu ? num(protoFields(imu), 1) : null,
      sensorFps: sfps ? num(protoFields(sfps), 1) : null,
      videoWidth,
      videoHeight,
      videoFps,
    };
  }
  let frame: DjiFrameMeta | null = null;
  const frameBytes = sub(top, 3);
  if (frameBytes) {
    const f = protoFields(frameBytes);
    const header = sub(f, 1);
    const ts = header ? (num(protoFields(header), 2) ?? 0) : 0;
    let exposure = 0;
    const cam = sub(f, 2);
    if (cam) {
      const et = sub(protoFields(cam), 4);
      if (et) {
        const r = ints(protoFields(et), 1);
        if (r.length >= 2 && r[1] > 0) exposure = r[0] / r[1];
      }
    }
    const quats: number[] = [];
    let offset = 0;
    const imu = sub(f, 3);
    if (imu) {
      const att = sub(protoFields(imu), 2);
      if (att) {
        const a = protoFields(att);
        offset = num(a, 4) ?? 0;
        for (const q of subs(a, 3)) {
          const qf = protoFields(q);
          quats.push(num(qf, 1) ?? 0, num(qf, 2) ?? 0, num(qf, 3) ?? 0, num(qf, 4) ?? 0);
        }
      }
    }
    frame = { frameTimestampUs: ts, exposure, quats, offset };
  }
  return { clip, frame };
}
