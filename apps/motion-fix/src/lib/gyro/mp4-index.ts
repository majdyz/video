// Ranged ISO-BMFF (MP4 / MOV) index reader: finds the `moov` box with a few
// small reads, then lists every track's samples (file offset, size, time)
// from the sample tables. Nothing is decoded and the media data is never
// read, so a 2.4 GB drone clip costs a few hundred KB of I/O — the metadata
// samples are fetched afterwards, one Blob.slice each.
//
// Box layout reference: ISO/IEC 14496-12 (moov/trak/mdia/minf/stbl, stsd,
// stts, stsc, stsz/stz2, stco/co64, elst, tkhd matrix).

/** Reads `length` bytes at `offset`; maps 1:1 onto Blob.slice().arrayBuffer(). */
export type RangeReader = (offset: number, length: number) => Promise<Uint8Array>;

export function blobReader(blob: Blob): RangeReader {
  return async (offset, length) => new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer());
}

export function bytesReader(bytes: Uint8Array): RangeReader {
  return async (offset, length) => bytes.subarray(offset, Math.min(bytes.length, offset + length));
}

export type Mp4Sample = { offset: number; size: number; /** decode time, s */ time: number; duration: number };

export type Mp4Track = {
  id: number;
  /** Handler type: "vide", "soun", "meta", "tmcd", ... */
  handler: string;
  /** Handler name string ("GoPro MET", "DJI meta", ...). */
  handlerName: string;
  /** Sample entry four-cc: "avc1", "hvc1", "gpmd", "djmd", ... */
  codec: string;
  timescale: number;
  /** Media duration in seconds. */
  duration: number;
  /** tkhd display size (video tracks) and rotation from the matrix (0/90/180/270, clockwise). */
  width: number;
  height: number;
  rotation: 0 | 90 | 180 | 270;
  /** Media time (s) of the first presented sample, from the edit list (0 without one). */
  editMediaTime: number;
  samples: Mp4Sample[];
};

export type Mp4Index = {
  fileSize: number;
  tracks: Mp4Track[];
  /** Raw payload of moov/udta/GPMF (GoPro global metadata), if present. */
  udtaGpmf: Uint8Array | null;
};

type Box = { type: string; start: number; data: number; end: number };

function fourcc(u8: Uint8Array, p: number): string {
  return String.fromCharCode(u8[p], u8[p + 1], u8[p + 2], u8[p + 3]);
}

function children(u8: Uint8Array, dv: DataView, start: number, end: number): Box[] {
  const out: Box[] = [];
  let p = start;
  while (p + 8 <= end) {
    let size = dv.getUint32(p);
    let hdr = 8;
    if (size === 1) {
      if (p + 16 > end) break;
      size = Number(dv.getBigUint64(p + 8));
      hdr = 16;
    } else if (size === 0) size = end - p;
    if (size < hdr || p + size > end) break;
    out.push({ type: fourcc(u8, p + 4), start: p, data: p + hdr, end: p + size });
    p += size;
  }
  return out;
}

/** Top-level scan for `moov`; returns its bytes (header included). */
async function readMoov(read: RangeReader, fileSize: number): Promise<Uint8Array | null> {
  let p = 0;
  for (let guard = 0; p + 8 <= fileSize && guard < 10000; guard++) {
    const h = await read(p, 16);
    if (h.length < 8) return null;
    const dv = new DataView(h.buffer, h.byteOffset, h.byteLength);
    let size = dv.getUint32(0);
    const type = fourcc(h, 4);
    if (size === 1) {
      if (h.length < 16) return null;
      size = Number(dv.getBigUint64(8));
    } else if (size === 0) size = fileSize - p;
    if (size < 8) return null;
    if (type === "moov") {
      if (size > 256 * 1024 * 1024) throw new Error("moov box too large");
      return read(p, size);
    }
    p += size;
  }
  return null;
}

function rotationFromMatrix(dv: DataView, p: number): 0 | 90 | 180 | 270 {
  // Matrix [a b u; c d v; x y w], a/b/c/d 16.16 fixed point.
  const a = dv.getInt32(p) / 65536;
  const b = dv.getInt32(p + 4) / 65536;
  const deg = Math.round((Math.atan2(b, a) * 180) / Math.PI);
  const r = ((deg % 360) + 360) % 360;
  return r === 90 ? 90 : r === 180 ? 180 : r === 270 ? 270 : 0;
}

function parseTrak(u8: Uint8Array, dv: DataView, trak: Box): Mp4Track | null {
  const kids = children(u8, dv, trak.data, trak.end);
  const find = (list: Box[], t: string): Box | undefined => list.find((b) => b.type === t);
  const tkhd = find(kids, "tkhd");
  const mdia = find(kids, "mdia");
  if (!tkhd || !mdia) return null;
  const tv = dv.getUint8(tkhd.data);
  const id = dv.getUint32(tkhd.data + (tv === 1 ? 20 : 12));
  const tail = tkhd.data + (tv === 1 ? 88 : 76); // width/height 16.16 after the matrix
  const matrix = tail - 36;
  const width = dv.getUint32(tail) / 65536;
  const height = dv.getUint32(tail + 4) / 65536;
  const rotation = rotationFromMatrix(dv, matrix);

  const mk = children(u8, dv, mdia.data, mdia.end);
  const mdhd = find(mk, "mdhd");
  const hdlr = find(mk, "hdlr");
  const minf = find(mk, "minf");
  if (!mdhd || !hdlr || !minf) return null;
  const mv = dv.getUint8(mdhd.data);
  const timescale = dv.getUint32(mdhd.data + (mv === 1 ? 20 : 12));
  const durRaw = mv === 1 ? Number(dv.getBigUint64(mdhd.data + 24)) : dv.getUint32(mdhd.data + 16);
  const handler = fourcc(u8, hdlr.data + 8);
  let nameEnd = hdlr.data + 24;
  while (nameEnd < hdlr.end && u8[nameEnd] !== 0) nameEnd++;
  // QuickTime writes a Pascal string here (length byte first).
  let nameStart = hdlr.data + 24;
  if (nameStart < hdlr.end && u8[nameStart] === nameEnd - nameStart - 1) nameStart++;
  const handlerName = String.fromCharCode(...u8.subarray(nameStart, Math.min(nameEnd, nameStart + 64))).trim();

  // Edit list: first non-empty edit's media time.
  let editMediaTime = 0;
  const edts = find(kids, "edts");
  if (edts) {
    const elst = find(children(u8, dv, edts.data, edts.end), "elst");
    if (elst) {
      const ev = dv.getUint8(elst.data);
      const count = dv.getUint32(elst.data + 4);
      let p = elst.data + 8;
      for (let i = 0; i < count; i++) {
        const mediaTime = ev === 1 ? Number(dv.getBigInt64(p + 8)) : dv.getInt32(p + 4);
        p += ev === 1 ? 20 : 12;
        if (mediaTime >= 0) {
          editMediaTime = mediaTime / timescale;
          break;
        }
      }
    }
  }

  const stbl = find(children(u8, dv, minf.data, minf.end), "stbl");
  if (!stbl) return null;
  const sk = children(u8, dv, stbl.data, stbl.end);
  const stsd = find(sk, "stsd");
  const codec = stsd && dv.getUint32(stsd.data + 4) > 0 ? fourcc(u8, stsd.data + 12) : "";

  // Sample sizes.
  const sizes: number[] = [];
  const stsz = find(sk, "stsz");
  const stz2 = find(sk, "stz2");
  if (stsz) {
    const fixed = dv.getUint32(stsz.data + 4);
    const n = dv.getUint32(stsz.data + 8);
    for (let i = 0; i < n; i++) sizes.push(fixed || dv.getUint32(stsz.data + 12 + 4 * i));
  } else if (stz2) {
    const field = dv.getUint8(stz2.data + 7);
    const n = dv.getUint32(stz2.data + 8);
    for (let i = 0; i < n; i++) {
      const p = stz2.data + 12;
      if (field === 16) sizes.push(dv.getUint16(p + 2 * i));
      else if (field === 8) sizes.push(dv.getUint8(p + i));
      else sizes.push(i & 1 ? dv.getUint8(p + (i >> 1)) & 15 : dv.getUint8(p + (i >> 1)) >> 4);
    }
  }
  // Chunk offsets.
  const offsets: number[] = [];
  const stco = find(sk, "stco");
  const co64 = find(sk, "co64");
  if (stco) {
    const n = dv.getUint32(stco.data + 4);
    for (let i = 0; i < n; i++) offsets.push(dv.getUint32(stco.data + 8 + 4 * i));
  } else if (co64) {
    const n = dv.getUint32(co64.data + 4);
    for (let i = 0; i < n; i++) offsets.push(Number(dv.getBigUint64(co64.data + 8 + 8 * i)));
  }
  // Sample-to-chunk runs.
  const runs: { first: number; per: number }[] = [];
  const stsc = find(sk, "stsc");
  if (stsc) {
    const n = dv.getUint32(stsc.data + 4);
    for (let i = 0; i < n; i++) runs.push({ first: dv.getUint32(stsc.data + 8 + 12 * i), per: dv.getUint32(stsc.data + 12 + 12 * i) });
  }
  // Decode durations.
  const durations: number[] = [];
  const stts = find(sk, "stts");
  if (stts) {
    const n = dv.getUint32(stts.data + 4);
    for (let i = 0; i < n; i++) {
      const count = dv.getUint32(stts.data + 8 + 8 * i);
      const delta = dv.getUint32(stts.data + 12 + 8 * i);
      for (let k = 0; k < count && durations.length < sizes.length; k++) durations.push(delta);
    }
  }

  const samples: Mp4Sample[] = [];
  let s = 0;
  let t = 0;
  let r = 0;
  for (let c = 0; c < offsets.length && s < sizes.length && runs.length; c++) {
    while (r + 1 < runs.length && runs[r + 1].first <= c + 1) r++;
    let off = offsets[c];
    for (let k = 0; k < runs[r].per && s < sizes.length; k++, s++) {
      const d = durations[s] ?? 0;
      samples.push({ offset: off, size: sizes[s], time: t / timescale, duration: d / timescale });
      off += sizes[s];
      t += d;
    }
  }
  return { id, handler, handlerName, codec, timescale, duration: durRaw / timescale, width, height, rotation, editMediaTime, samples };
}

export async function readMp4Index(read: RangeReader, fileSize: number): Promise<Mp4Index | null> {
  const moov = await readMoov(read, fileSize);
  if (!moov) return null;
  const dv = new DataView(moov.buffer, moov.byteOffset, moov.byteLength);
  const top = children(moov, dv, 8, moov.byteLength);
  const tracks: Mp4Track[] = [];
  let udtaGpmf: Uint8Array | null = null;
  for (const b of top) {
    if (b.type === "trak") {
      const t = parseTrak(moov, dv, b);
      if (t) tracks.push(t);
    } else if (b.type === "udta") {
      const g = children(moov, dv, b.data, b.end).find((x) => x.type === "GPMF");
      if (g) udtaGpmf = moov.slice(g.data, g.end);
    }
  }
  return { fileSize, tracks, udtaGpmf };
}

/**
 * Fetches many small samples with bounded concurrency, merging neighbours
 * that sit within `gap` bytes of each other into one read.
 */
export async function readSamples(read: RangeReader, samples: Mp4Sample[], opts: { gap?: number; concurrency?: number; signal?: AbortSignal; onProgress?: (f: number) => void } = {}): Promise<Uint8Array[]> {
  const gap = opts.gap ?? 4096;
  const concurrency = opts.concurrency ?? 8;
  const order = samples.map((_, i) => i).sort((a, b) => samples[a].offset - samples[b].offset);
  type Group = { start: number; end: number; members: number[] };
  const groups: Group[] = [];
  for (const i of order) {
    const s = samples[i];
    const g = groups[groups.length - 1];
    if (g && s.offset >= g.start && s.offset <= g.end + gap && s.offset + s.size - g.start <= 4 * 1024 * 1024) {
      g.end = Math.max(g.end, s.offset + s.size);
      g.members.push(i);
    } else groups.push({ start: s.offset, end: s.offset + s.size, members: [i] });
  }
  const out: Uint8Array[] = new Array(samples.length);
  let next = 0;
  let done = 0;
  const worker = async (): Promise<void> => {
    while (next < groups.length) {
      if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const g = groups[next++];
      const bytes = await read(g.start, g.end - g.start);
      for (const i of g.members) out[i] = bytes.subarray(samples[i].offset - g.start, samples[i].offset - g.start + samples[i].size);
      done++;
      opts.onProgress?.(done / groups.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, groups.length) }, worker));
  return out;
}
