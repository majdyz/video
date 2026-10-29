// Minimal FIT decoder (Garmin Descent, Suunto app exports), written from the
// public FIT protocol description (Garmin FIT SDK docs: file header, record
// headers, definition / data messages, compressed timestamps, developer
// fields, CRC-16). It decodes every message to {num, fields} and then reads
// only what a dive profile needs:
//   record (20): timestamp 253, depth 92 (uint32, mm), temperature 13 (sint8, °C)
//   session (18) / activity (34): start_time 2, local_timestamp 5 (activity)
//   file_id (0): manufacturer 1, product 2 (device name)
// Developer fields named like "depth" / "temperature" (field_description 206)
// are used when the native ones are missing.

import { DiveLogError, tidySamples, type DiveLog, type DiveSample } from "./types.ts";

/** Seconds between the Unix epoch and the FIT epoch (1989-12-31T00:00:00Z). */
export const FIT_EPOCH_S = 631065600;

export type FitMessage = { num: number; fields: Map<number, number | number[] | string | null>; dev: Map<string, number | number[] | string | null> };

type FieldDef = { num: number; size: number; base: number };
type Def = { num: number; little: boolean; fields: FieldDef[]; dev: { num: number; size: number; idx: number }[] };

const CRC_TABLE = [0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001, 0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01, 0x8801, 0x4400];

/** FIT CRC-16 (as in the FIT SDK). */
export function fitCrc(bytes: Uint8Array, from = 0, to = bytes.length): number {
  let crc = 0;
  for (let i = from; i < to; i++) {
    const b = bytes[i];
    let tmp = CRC_TABLE[crc & 0xf];
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ CRC_TABLE[b & 0xf];
    tmp = CRC_TABLE[crc & 0xf];
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ CRC_TABLE[(b >> 4) & 0xf];
  }
  return crc;
}

export function isFit(bytes: Uint8Array): boolean {
  return bytes.length >= 12 && bytes[8] === 0x2e && bytes[9] === 0x46 && bytes[10] === 0x49 && bytes[11] === 0x54; // ".FIT"
}

// Base types: low 5 bits of the base-type byte. Size, invalid value.
const BASE: Record<number, { size: number; invalid: number | null; signed?: boolean; float?: boolean; str?: boolean }> = {
  0x00: { size: 1, invalid: 0xff }, // enum
  0x01: { size: 1, invalid: 0x7f, signed: true }, // sint8
  0x02: { size: 1, invalid: 0xff }, // uint8
  0x03: { size: 2, invalid: 0x7fff, signed: true }, // sint16
  0x04: { size: 2, invalid: 0xffff }, // uint16
  0x05: { size: 4, invalid: 0x7fffffff, signed: true }, // sint32
  0x06: { size: 4, invalid: 0xffffffff }, // uint32
  0x07: { size: 1, invalid: null, str: true }, // string
  0x08: { size: 4, invalid: null, float: true }, // float32
  0x09: { size: 8, invalid: null, float: true }, // float64
  0x0a: { size: 1, invalid: 0x00 }, // uint8z
  0x0b: { size: 2, invalid: 0x0000 }, // uint16z
  0x0c: { size: 4, invalid: 0x00000000 }, // uint32z
  0x0d: { size: 1, invalid: null }, // byte
  0x0e: { size: 8, invalid: null, signed: true }, // sint64
  0x0f: { size: 8, invalid: null }, // uint64
  0x10: { size: 8, invalid: null }, // uint64z
};

function readValue(dv: DataView, off: number, size: number, baseByte: number, little: boolean): number | number[] | string | null {
  const bt = BASE[baseByte & 0x1f] ?? { size: 1, invalid: null };
  if (bt.str) {
    let s = "";
    for (let i = 0; i < size; i++) {
      const c = dv.getUint8(off + i);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    try {
      s = decodeURIComponent(escape(s)); // UTF-8
    } catch {
      /* keep the raw string */
    }
    return s || null;
  }
  const n = bt.size <= size ? Math.max(1, Math.floor(size / bt.size)) : 1;
  const one = (o: number): number | null => {
    let v: number;
    if (bt.size > size) return null;
    switch (bt.size) {
      case 1: v = bt.signed ? dv.getInt8(o) : dv.getUint8(o); break;
      case 2: v = bt.signed ? dv.getInt16(o, little) : dv.getUint16(o, little); break;
      case 4: v = bt.float ? dv.getFloat32(o, little) : bt.signed ? dv.getInt32(o, little) : dv.getUint32(o, little); break;
      default: v = bt.float ? dv.getFloat64(o, little) : Number(bt.signed ? dv.getBigInt64(o, little) : dv.getBigUint64(o, little));
    }
    if (bt.invalid !== null && v === bt.invalid) return null;
    if (bt.float && !Number.isFinite(v)) return null;
    return v;
  };
  if (n === 1) return one(off);
  const arr: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = one(off + i * bt.size);
    if (v !== null) arr.push(v);
  }
  return arr.length ? arr : null;
}

/** Decode every message in a FIT file. Throws DiveLogError on a broken file; ignores a bad CRC. */
export function decodeFit(input: Uint8Array | ArrayBuffer): FitMessage[] {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (!isFit(bytes)) throw new DiveLogError("not a FIT file");
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerSize = bytes[0];
  const dataSize = dv.getUint32(4, true);
  const end = Math.min(bytes.length, headerSize + dataSize);
  const defs = new Map<number, Def>();
  const devNames = new Map<string, { name: string; base: number; scale: number; offset: number }>(); // "devIdx:fieldNum" → description
  const out: FitMessage[] = [];
  let lastTimestamp = 0;
  let p = headerSize;
  while (p < end) {
    const h = bytes[p++];
    if (h & 0x80) {
      // Compressed timestamp header: local type in bits 5-6, 5-bit time offset.
      const local = (h >> 5) & 0x3;
      const offset = h & 0x1f;
      const def = defs.get(local);
      if (!def) throw new DiveLogError(`FIT: data for undefined local message ${local}`);
      let ts = (lastTimestamp & ~0x1f) + offset;
      if (offset < (lastTimestamp & 0x1f)) ts += 0x20;
      lastTimestamp = ts;
      const m = readData(dv, p, def, devNames);
      p += m.len;
      if (!m.msg.fields.has(253)) m.msg.fields.set(253, ts);
      out.push(m.msg);
      continue;
    }
    const local = h & 0x0f;
    if (h & 0x40) {
      // Definition message.
      const little = bytes[p + 1] === 0;
      const num = little ? dv.getUint16(p + 2, true) : dv.getUint16(p + 2, false);
      const nf = bytes[p + 4];
      p += 5;
      const fields: FieldDef[] = [];
      for (let i = 0; i < nf; i++, p += 3) fields.push({ num: bytes[p], size: bytes[p + 1], base: bytes[p + 2] });
      const dev: Def["dev"] = [];
      if (h & 0x20) {
        const nd = bytes[p++];
        for (let i = 0; i < nd; i++, p += 3) dev.push({ num: bytes[p], size: bytes[p + 1], idx: bytes[p + 2] });
      }
      if (p > end) throw new DiveLogError("FIT: truncated definition");
      defs.set(local, { num, little, fields, dev });
      continue;
    }
    const def = defs.get(local);
    if (!def) throw new DiveLogError(`FIT: data for undefined local message ${local}`);
    const m = readData(dv, p, def, devNames);
    p += m.len;
    if (p > end) throw new DiveLogError("FIT: truncated data message");
    const ts = m.msg.fields.get(253);
    if (typeof ts === "number") lastTimestamp = ts;
    if (m.msg.num === 206) {
      // field_description: developer_data_index 0, field_definition_number 1, fit_base_type_id 2,
      // field_name 3, scale 6, offset 7.
      const di = m.msg.fields.get(0), fn = m.msg.fields.get(1), base = m.msg.fields.get(2), name = m.msg.fields.get(3);
      const scale = num(m.msg.fields.get(6)), offset = num(m.msg.fields.get(7));
      if (typeof di === "number" && typeof fn === "number" && typeof name === "string") {
        devNames.set(`${di}:${fn}`, { name, base: typeof base === "number" ? base : 0x0d, scale: scale || 1, offset: offset ?? 0 });
      }
    }
    out.push(m.msg);
  }
  return out;
}

function readData(dv: DataView, p: number, def: Def, devNames: Map<string, { name: string; base: number; scale: number; offset: number }>): { msg: FitMessage; len: number } {
  const fields = new Map<number, number | number[] | string | null>();
  const dev = new Map<string, number | number[] | string | null>();
  let q = p;
  for (const f of def.fields) {
    if (q + f.size > dv.byteLength) throw new DiveLogError("FIT: truncated data message");
    fields.set(f.num, readValue(dv, q, f.size, f.base, def.little));
    q += f.size;
  }
  for (const d of def.dev) {
    if (q + d.size > dv.byteLength) throw new DiveLogError("FIT: truncated developer field");
    const desc = devNames.get(`${d.idx}:${d.num}`);
    if (desc) {
      const v = readValue(dv, q, d.size, desc.base, def.little);
      dev.set(desc.name, typeof v === "number" ? v / desc.scale - desc.offset : v);
    }
    q += d.size;
  }
  return { msg: { num: def.num, fields, dev }, len: q - p };
}

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : Array.isArray(v) && typeof v[0] === "number" ? v[0] : undefined);
const fitDate = (s: number) => new Date((s + FIT_EPOCH_S) * 1000);

/** A dive (or any activity with depth) from a FIT file: Garmin Descent `record.depth`, or a developer "depth" field. */
export function parseFit(input: Uint8Array | ArrayBuffer): DiveLog {
  const msgs = decodeFit(input);
  let device: string | undefined;
  let start: number | undefined;
  let localTs: number | undefined;
  let activityTs: number | undefined;
  const raw: { ts: number; depth: number; temp?: number }[] = [];
  for (const m of msgs) {
    if (m.num === 0) {
      const manu = num(m.fields.get(1)), prod = num(m.fields.get(2));
      const names: Record<number, string> = { 1: "Garmin", 23: "Suunto", 123: "Polar", 294: "Coros", 255: "Development" };
      if (manu !== undefined) device = `${names[manu] ?? `manufacturer ${manu}`}${prod !== undefined ? ` product ${prod}` : ""}`;
      const pn = m.fields.get(8); // product_name
      if (typeof pn === "string") device = pn;
    } else if (m.num === 18) {
      const s = num(m.fields.get(2));
      if (s !== undefined && (start === undefined || s < start)) start = s;
    } else if (m.num === 34) {
      const lt = num(m.fields.get(5)), ts = num(m.fields.get(253));
      if (lt !== undefined && ts !== undefined) { localTs = lt; activityTs = ts; }
    } else if (m.num === 20) {
      const ts = num(m.fields.get(253));
      let depth = num(m.fields.get(92));
      if (depth !== undefined) depth /= 1000;
      else {
        for (const [k, v] of m.dev) if (/^depth$/i.test(k.trim()) && typeof v === "number") depth = v;
      }
      let temp = num(m.fields.get(13));
      if (temp === undefined) for (const [k, v] of m.dev) if (/^(water[ _]?)?temp(erature)?$/i.test(k.trim()) && typeof v === "number") temp = v;
      if (ts !== undefined && depth !== undefined) raw.push({ ts, depth, temp });
    }
  }
  if (!raw.length) throw new DiveLogError("FIT file has no depth samples (not a dive?)");
  const t0 = start !== undefined && start <= raw[0].ts ? start : raw[0].ts;
  const samples: DiveSample[] = raw.map((r) => (r.temp !== undefined ? { t: r.ts - t0, depth: r.depth, temp: r.temp } : { t: r.ts - t0, depth: r.depth }));
  const log: DiveLog = { startTime: fitDate(t0), utc: true, samples: tidySamples(samples), format: "fit" };
  if (device) log.device = device;
  if (localTs !== undefined && activityTs !== undefined) log.utcOffsetS = localTs - activityTs;
  return log;
}

// ------------------------------------------------------------------ writer (fixtures, tests)

export type FitField = { num: number; base: number; size: number; value: number | string };
/** A developer field value: `num` = field_definition_number, `idx` = developer_data_index. */
export type FitDevField = { num: number; idx: number; base: number; size: number; value: number };
export type FitWriteMsg = { local: number; global: number; fields: FitField[]; dev?: FitDevField[] };

function encodeValue(base: number, size: number, value: number | string): number[] {
  const b = new Uint8Array(size);
  const dv = new DataView(b.buffer);
  const bt = base & 0x1f;
  if (typeof value === "string") b.set(new TextEncoder().encode(value).subarray(0, size - 1));
  else if (bt === 0x08) dv.setFloat32(0, value, true);
  else if (size === 1) dv.setUint8(0, value & 0xff);
  else if (size === 2) dv.setUint16(0, value & 0xffff, true);
  else if (size === 4) dv.setUint32(0, value >>> 0, true);
  return [...b];
}

/**
 * Tiny FIT writer: definition + data message per distinct local layout, little-endian,
 * 14-byte header with header and file CRCs, developer fields supported. Enough to
 * build test fixtures.
 */
export function encodeFit(msgs: FitWriteMsg[]): Uint8Array {
  const body: number[] = [];
  const defined = new Map<number, string>();
  for (const m of msgs) {
    const dev = m.dev ?? [];
    const sig = `${m.global}|${m.fields.map((f) => `${f.num}:${f.base}:${f.size}`).join(",")}|${dev.map((d) => `${d.idx}:${d.num}:${d.size}`).join(",")}`;
    if (defined.get(m.local) !== sig) {
      body.push((dev.length ? 0x60 : 0x40) | m.local, 0, 0, m.global & 0xff, m.global >> 8, m.fields.length);
      for (const f of m.fields) body.push(f.num, f.size, f.base);
      if (dev.length) {
        body.push(dev.length);
        for (const d of dev) body.push(d.num, d.size, d.idx);
      }
      defined.set(m.local, sig);
    }
    body.push(m.local);
    for (const f of m.fields) body.push(...encodeValue(f.base, f.size, f.value));
    for (const d of dev) body.push(...encodeValue(d.base, d.size, d.value));
  }
  const out = new Uint8Array(14 + body.length + 2);
  const dv = new DataView(out.buffer);
  out[0] = 14;
  out[1] = 0x20; // protocol 2.0
  dv.setUint16(2, 2132, true); // profile 21.32
  dv.setUint32(4, body.length, true);
  out.set([0x2e, 0x46, 0x49, 0x54], 8);
  dv.setUint16(12, fitCrc(out, 0, 12), true);
  out.set(body, 14);
  dv.setUint16(14 + body.length, fitCrc(out, 0, 14 + body.length), true);
  return out;
}
