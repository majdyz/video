// GPMF (GoPro Metadata Format) KLV parser. Each record is a 4-byte key, a
// type char (0 = nested), a structure size, a 16-bit repeat count and the
// payload padded to 4 bytes; streams (STRM) carry sticky modifiers such as
// SCAL (divisor), STMP (µs timestamp), ORIN (channel order) before the data
// record they apply to. Format reference: github.com/gopro/gpmf-parser
// (README "KLV design").

export type KlvNode = {
  key: string;
  /** Type character, or "\0" for nested containers. */
  type: string;
  structSize: number;
  repeat: number;
  /** Payload bytes (unpadded). */
  data: Uint8Array;
  children: KlvNode[] | null;
};

const TYPE_SIZE: Record<string, number> = { b: 1, B: 1, c: 1, s: 2, S: 2, l: 4, L: 4, f: 4, d: 8, j: 8, J: 8, q: 4, Q: 8, F: 4, U: 16, G: 16 };

export function parseKlv(bytes: Uint8Array, start = 0, end = bytes.length, depth = 0): KlvNode[] {
  const out: KlvNode[] = [];
  let p = start;
  while (p + 8 <= end) {
    const key = String.fromCharCode(bytes[p], bytes[p + 1], bytes[p + 2], bytes[p + 3]);
    const type = String.fromCharCode(bytes[p + 4]);
    const structSize = bytes[p + 5];
    const repeat = (bytes[p + 6] << 8) | bytes[p + 7];
    const len = structSize * repeat;
    const dataStart = p + 8;
    const dataEnd = dataStart + len;
    if (dataEnd > end || !/^[A-Za-z0-9 _]{4}$/.test(key)) break;
    const node: KlvNode = { key, type, structSize, repeat, data: bytes.subarray(dataStart, dataEnd), children: null };
    if (type === "\0" && depth < 8) node.children = parseKlv(bytes, dataStart, dataEnd, depth + 1);
    out.push(node);
    p = dataStart + ((len + 3) & ~3);
  }
  return out;
}

/** Numeric payload as a flat array (big-endian), or null for strings / unknown types. */
export function klvNumbers(n: KlvNode): number[] | null {
  const size = TYPE_SIZE[n.type];
  if (!size || n.type === "c" || n.type === "U" || n.type === "G" || n.type === "F") return null;
  const dv = new DataView(n.data.buffer, n.data.byteOffset, n.data.byteLength);
  const count = Math.floor(n.data.byteLength / size);
  const out: number[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const o = i * size;
    switch (n.type) {
      case "b": out[i] = dv.getInt8(o); break;
      case "B": out[i] = dv.getUint8(o); break;
      case "s": out[i] = dv.getInt16(o); break;
      case "S": out[i] = dv.getUint16(o); break;
      case "l": out[i] = dv.getInt32(o); break;
      case "L": out[i] = dv.getUint32(o); break;
      case "f": out[i] = dv.getFloat32(o); break;
      case "d": out[i] = dv.getFloat64(o); break;
      case "j": out[i] = Number(dv.getBigInt64(o)); break;
      case "J": out[i] = Number(dv.getBigUint64(o)); break;
      case "q": out[i] = dv.getInt16(o) + dv.getUint16(o + 2) / 65536; break;
      case "Q": out[i] = dv.getInt32(o) + dv.getUint32(o + 4) / 4294967296; break;
    }
  }
  return out;
}

export function klvString(n: KlvNode): string | null {
  if (n.type !== "c" && n.type !== "F" && n.type !== "U") return null;
  let s = "";
  for (const c of n.data) s += String.fromCharCode(c);
  return s.replace(/\0+$/, "").trim();
}

/** Depth-first search for the first leaf with `key`. */
export function findKlv(nodes: KlvNode[], key: string): KlvNode | null {
  for (const n of nodes) {
    if (n.key === key) return n;
    if (n.children) {
      const hit = findKlv(n.children, key);
      if (hit) return hit;
    }
  }
  return null;
}

export type GpmfStream = {
  /** Rows of scaled values (SCAL applied per channel). */
  rows: number[][];
  /** STMP of the payload in µs, when present. */
  stmp: number | null;
  orin: string | null;
  units: string | null;
};

/**
 * Data records of one payload (one MP4 gpmd sample), keyed by four-cc. Each
 * STRM's sticky SCAL is applied; streams of the same key are concatenated.
 */
export function payloadStreams(bytes: Uint8Array, wanted: readonly string[]): Map<string, GpmfStream> {
  const out = new Map<string, GpmfStream>();
  for (const devc of parseKlv(bytes)) {
    if (devc.key !== "DEVC" || !devc.children) continue;
    for (const strm of devc.children) {
      if (strm.key !== "STRM" || !strm.children) continue;
      let scal: number[] = [1];
      let stmp: number | null = null;
      let orin: string | null = null;
      let units: string | null = null;
      for (const e of strm.children) {
        if (e.key === "SCAL") scal = klvNumbers(e) ?? [1];
        else if (e.key === "STMP") stmp = klvNumbers(e)?.[0] ?? null;
        else if (e.key === "ORIN") orin = klvString(e);
        else if (e.key === "SIUN" || e.key === "UNIT") units = klvString(e);
        else if (wanted.includes(e.key)) {
          const flat = klvNumbers(e);
          if (!flat || e.repeat === 0) continue;
          const per = Math.max(1, Math.round(flat.length / e.repeat));
          const rows: number[][] = [];
          for (let r = 0; r < e.repeat; r++) {
            const row: number[] = [];
            for (let i = 0; i < per; i++) {
              const div = scal.length > 1 ? (scal[i] ?? 1) : scal[0];
              row.push(flat[r * per + i] / (div || 1));
            }
            rows.push(row);
          }
          const prev = out.get(e.key);
          if (prev) prev.rows.push(...rows);
          else out.set(e.key, { rows, stmp, orin, units });
        }
      }
    }
  }
  return out;
}

/** Sticky camera / lens keys (from moov/udta/GPMF or a payload), first occurrence wins. */
export type GoProGlobals = {
  model: string | null;
  /** Sensor readout time, ms. */
  srot: number | null;
  /** Diagonal field of view of the recorded frame, degrees. */
  zfov: number | null;
  /** Lens mode: W wide, S superview, H hyperview, L linear, N narrow, M medium, X max superview. */
  vfov: string | null;
  /** EIS enabled flag ("Y"/"N") and the HyperSmooth setting ("HS High", "N/A", ...). */
  eise: string | null;
  eisa: string | null;
  prjt: string | null;
  /** HERO11+ in-file lens calibration. */
  poly: number[] | null;
  zmpl: number | null;
  vres: number[] | null;
  aruw: number | null;
  arwa: number | null;
  mapx: number[] | null;
  mapy: number[] | null;
};

export function readGoProGlobals(trees: KlvNode[][]): GoProGlobals {
  const num = (k: string): number | null => {
    for (const t of trees) {
      const n = findKlv(t, k);
      const v = n && klvNumbers(n);
      if (v && v.length) return v[0];
    }
    return null;
  };
  const nums = (k: string): number[] | null => {
    for (const t of trees) {
      const n = findKlv(t, k);
      const v = n && klvNumbers(n);
      if (v && v.length) return v;
    }
    return null;
  };
  const str = (k: string): string | null => {
    for (const t of trees) {
      const n = findKlv(t, k);
      const v = n && klvString(n);
      if (v) return v;
    }
    return null;
  };
  return {
    model: str("MINF"),
    srot: num("SROT"),
    zfov: num("ZFOV"),
    vfov: str("VFOV"),
    eise: str("EISE"),
    eisa: str("EISA"),
    prjt: str("PRJT"),
    poly: nums("POLY"),
    zmpl: num("ZMPL"),
    vres: nums("VRES"),
    aruw: num("ARUW"),
    arwa: num("ARWA"),
    mapx: nums("MAPX"),
    mapy: nums("MAPY"),
  };
}
