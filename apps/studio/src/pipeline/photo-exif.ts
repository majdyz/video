// EXIF carry-over for exported photos: the browser's JPEG encoder writes
// none, so the original's block (date, GPS, camera, lens, exposure) is read
// from the source file and written into the export, with Orientation set to 1
// (the rotation is baked into the pixels), the pixel dimensions updated and
// the embedded thumbnail (IFD1, the unedited picture) dropped.
//
// Sources: JPEG (APP1 "Exif"), HEIC / HEIF / AVIF (the ISOBMFF "Exif" item),
// PNG (eXIf chunk), WebP (RIFF "EXIF" chunk). Pure byte work, no DOM: tested
// in node (test/exif.test.ts).

const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0, 0]; // "Exif\0\0"
/** An APP1 segment holds at most 65533 bytes after its length field. */
const APP1_MAX = 65533;

const TAG_ORIENTATION = 0x0112;
const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;
const TAG_INTEROP_IFD = 0xa005;
const TAG_PIXEL_X = 0xa002;
const TAG_PIXEL_Y = 0xa003;
const TAG_MAKERNOTE = 0x927c;

const ascii = (b: Uint8Array, at: number, n: number) => String.fromCharCode(...b.subarray(at, at + n));

function startsWithExifHeader(b: Uint8Array, at = 0): boolean {
  return EXIF_HEADER.every((v, i) => b[at + i] === v);
}

/** The TIFF structure ("II*\0" / "MM\0*" …) inside an EXIF payload, with or without the "Exif\0\0" prefix. */
function tiffOf(b: Uint8Array): Uint8Array | null {
  let at = startsWithExifHeader(b) ? 6 : 0;
  // Some writers pad before the TIFF header; look a few bytes ahead.
  for (let k = 0; k < 16 && at + 4 <= b.length; k++, at++) {
    if ((b[at] === 0x49 && b[at + 1] === 0x49 && b[at + 2] === 0x2a && b[at + 3] === 0) || (b[at] === 0x4d && b[at + 1] === 0x4d && b[at + 2] === 0 && b[at + 3] === 0x2a)) {
      return b.subarray(at);
    }
  }
  return null;
}

// ---------------------------------------------------------------- reading the source

function fromJpeg(b: Uint8Array): Uint8Array | null {
  let at = 2;
  while (at + 4 <= b.length && b[at] === 0xff) {
    const marker = b[at + 1];
    if (marker === 0xd9 || marker === 0xda) break; // EOI / start of scan: no more metadata
    if (marker === 0xff) { at++; continue; } // fill byte
    if (marker >= 0xd0 && marker <= 0xd7) { at += 2; continue; }
    const len = (b[at + 2] << 8) | b[at + 3];
    if (marker === 0xe1 && startsWithExifHeader(b, at + 4)) return tiffOf(b.subarray(at + 4, at + 2 + len));
    at += 2 + len;
  }
  return null;
}

type Box = { type: string; start: number; end: number; body: number };
function boxes(b: Uint8Array, from: number, to: number): Box[] {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out: Box[] = [];
  let at = from;
  while (at + 8 <= to) {
    let size = v.getUint32(at);
    let body = at + 8;
    if (size === 1) { size = Number(v.getBigUint64(at + 8)); body = at + 16; } else if (size === 0) size = to - at;
    if (size < 8 || at + size > to) break;
    out.push({ type: ascii(b, at + 4, 4), start: at, end: at + size, body });
    at += size;
  }
  return out;
}

function fromIsobmff(b: Uint8Array): Uint8Array | null {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const meta = boxes(b, 0, b.length).find((x) => x.type === "meta");
  if (!meta) return null;
  const inner = boxes(b, meta.body + 4, meta.end); // full box: version/flags first
  const iinf = inner.find((x) => x.type === "iinf");
  const iloc = inner.find((x) => x.type === "iloc");
  if (!iinf || !iloc) return null;
  // Item id of the "Exif" item.
  const iinfVer = b[iinf.body];
  const infeStart = iinf.body + 4 + (iinfVer === 0 ? 2 : 4);
  let exifId = -1;
  for (const infe of boxes(b, infeStart, iinf.end)) {
    if (infe.type !== "infe") continue;
    const ver = b[infe.body];
    if (ver < 2) continue;
    const id = ver === 2 ? v.getUint16(infe.body + 4) : v.getUint32(infe.body + 4);
    const typeAt = infe.body + 4 + (ver === 2 ? 2 : 4) + 2;
    if (ascii(b, typeAt, 4) === "Exif") { exifId = id; break; }
  }
  if (exifId < 0) return null;
  // Its extent in iloc (construction method 0: file offsets).
  const ver = b[iloc.body];
  let at = iloc.body + 4;
  const sizes = v.getUint16(at); at += 2;
  const offSize = sizes >> 12, lenSize = (sizes >> 8) & 15, baseSize = (sizes >> 4) & 15, idxSize = ver >= 1 ? sizes & 15 : 0;
  const count = ver < 2 ? v.getUint16(at) : v.getUint32(at); at += ver < 2 ? 2 : 4;
  const readN = (n: number) => { let x = 0; for (let i = 0; i < n; i++) x = x * 256 + b[at + i]; at += n; return x; };
  for (let i = 0; i < count; i++) {
    const id = ver < 2 ? readN(2) : readN(4);
    let method = 0;
    if (ver >= 1) method = readN(2) & 15;
    readN(2); // data reference index
    const base = readN(baseSize);
    const extents = readN(2);
    const parts: Uint8Array[] = [];
    for (let e = 0; e < extents; e++) {
      if (idxSize) readN(idxSize);
      const off = readN(offSize), len = readN(lenSize);
      parts.push(b.subarray(base + off, base + off + len));
    }
    if (id !== exifId) continue;
    if (method !== 0) return null;
    const data = parts.length === 1 ? parts[0] : concat(parts);
    // ExifDataBlock: 4-byte offset to the TIFF header, then (usually "Exif\0\0" and) the TIFF.
    if (data.length < 8) return null;
    const skip = new DataView(data.buffer, data.byteOffset, 4).getUint32(0);
    return tiffOf(data.subarray(4 + Math.min(skip, data.length - 4)));
  }
  return null;
}

function fromPng(b: Uint8Array): Uint8Array | null {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let at = 8;
  while (at + 12 <= b.length) {
    const len = v.getUint32(at);
    const type = ascii(b, at + 4, 4);
    if (type === "eXIf") return tiffOf(b.subarray(at + 8, at + 8 + len));
    if (type === "IDAT" || type === "IEND") break;
    at += 12 + len;
  }
  return null;
}

function fromWebp(b: Uint8Array): Uint8Array | null {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let at = 12;
  while (at + 8 <= b.length) {
    const type = ascii(b, at, 4);
    const len = v.getUint32(at + 4, true);
    if (type === "EXIF") return tiffOf(b.subarray(at + 8, at + 8 + len));
    at += 8 + len + (len & 1);
  }
  return null;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

/** The source photo's EXIF as a TIFF structure, or null when it has none (or the format isn't one we read). */
export function readExif(bytes: Uint8Array): Uint8Array | null {
  try {
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return fromJpeg(bytes);
    if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === "PNG") return fromPng(bytes);
    if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return fromWebp(bytes);
    if (ascii(bytes, 4, 4) === "ftyp") return fromIsobmff(bytes);
  } catch {
    // malformed metadata: export without it
  }
  return null;
}

// ---------------------------------------------------------------- editing the TIFF

type Entry = { at: number; tag: number; type: number; count: number };

class Tiff {
  readonly b: Uint8Array;
  readonly v: DataView;
  readonly le: boolean;
  constructor(src: Uint8Array) {
    this.b = src.slice();
    this.v = new DataView(this.b.buffer);
    this.le = this.b[0] === 0x49;
  }
  u16(at: number) { return this.v.getUint16(at, this.le); }
  u32(at: number) { return this.v.getUint32(at, this.le); }
  set16(at: number, x: number) { this.v.setUint16(at, x, this.le); }
  set32(at: number, x: number) { this.v.setUint32(at, x, this.le); }
  /** Entries of the IFD at `off` (bounds-checked). */
  entries(off: number): Entry[] {
    if (off < 8 || off + 2 > this.b.length) return [];
    const n = this.u16(off);
    if (off + 2 + n * 12 + 4 > this.b.length || n > 1000) return [];
    return Array.from({ length: n }, (_, i) => {
      const at = off + 2 + i * 12;
      return { at, tag: this.u16(at), type: this.u16(at + 2), count: this.u32(at + 4) };
    });
  }
  nextIfdAt(off: number): number {
    return off + 2 + this.u16(off) * 12;
  }
  /** Writes a SHORT or LONG inline value (count 1). */
  setInt(e: Entry, x: number) {
    if (e.count !== 1) return;
    if (e.type === 3) this.set16(e.at + 8, x);
    else if (e.type === 4) this.set32(e.at + 8, x);
  }
}

export type ExifEdit = { width: number; height: number };

/**
 * Prepares a source EXIF block for the export: Orientation 1, PixelX/YDimension
 * = the exported size, no IFD1 thumbnail. Returns a new TIFF; the input is
 * not modified.
 */
export function editExif(tiff: Uint8Array, edit: ExifEdit): Uint8Array {
  const t = new Tiff(tiff);
  const ifd0 = t.u32(4);
  const e0 = t.entries(ifd0);
  if (!e0.length) return t.b;
  for (const e of e0) {
    if (e.tag === TAG_ORIENTATION) t.setInt(e, 1);
  }
  // Drop IFD1 (thumbnail of the unedited, unrotated picture).
  t.set32(t.nextIfdAt(ifd0), 0);
  const exifPtr = e0.find((e) => e.tag === TAG_EXIF_IFD);
  if (exifPtr) {
    for (const e of t.entries(t.u32(exifPtr.at + 8))) {
      if (e.tag === TAG_PIXEL_X) t.setInt(e, edit.width);
      else if (e.tag === TAG_PIXEL_Y) t.setInt(e, edit.height);
    }
  }
  return t.b;
}

/** The used length of a TIFF block: the end of the furthest IFD or value it references (trailing thumbnail bytes are cut). */
export function tiffExtent(tiff: Uint8Array): number {
  const t = new Tiff(tiff);
  let end = 8;
  const sizes: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };
  const seen = new Set<number>();
  const walk = (off: number) => {
    if (!off || seen.has(off) || off >= tiff.length) return;
    seen.add(off);
    const es = t.entries(off);
    if (!es.length) return;
    end = Math.max(end, t.nextIfdAt(off) + 4);
    for (const e of es) {
      const n = (sizes[e.type] ?? 1) * e.count;
      if (n > 4) {
        const at = t.u32(e.at + 8);
        if (at + n <= tiff.length) end = Math.max(end, at + n);
      }
      if (e.tag === TAG_EXIF_IFD || e.tag === TAG_GPS_IFD || e.tag === TAG_INTEROP_IFD) walk(t.u32(e.at + 8));
    }
    const next = t.u32(t.nextIfdAt(off));
    if (next) walk(next);
  };
  walk(t.u32(4));
  return Math.min(end, tiff.length);
}

const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

/**
 * A compact copy of the TIFF holding only IFD0 and its Exif / GPS / Interop
 * sub-IFDs, minus `skip` tags (the maker note), values packed after the IFDs.
 * Used when the block is too big for one APP1 segment: the maker note's
 * internal offsets would not survive a move, so it is the part that goes.
 */
export function compactExif(tiff: Uint8Array, skip: number[]): Uint8Array {
  const t = new Tiff(tiff);
  const out = new Uint8Array(65_536 * 2);
  const ov = new DataView(out.buffer);
  const le = t.le;
  out.set(tiff.subarray(0, 4), 0);
  ov.setUint32(4, 8, le);
  let at = 8;
  const writeIfd = (off: number): number => {
    const es = t.entries(off).filter((e) => !skip.includes(e.tag));
    const start = at;
    ov.setUint16(at, es.length, le);
    at += 2 + es.length * 12 + 4;
    const fixups: { at: number; sub: number }[] = [];
    es.forEach((e, i) => {
      const dst = start + 2 + i * 12;
      out.set(tiff.subarray(e.at, e.at + 12), dst);
      const n = (TYPE_SIZE[e.type] ?? 1) * e.count;
      if (e.tag === TAG_EXIF_IFD || e.tag === TAG_GPS_IFD || e.tag === TAG_INTEROP_IFD) fixups.push({ at: dst + 8, sub: t.u32(e.at + 8) });
      else if (n > 4) {
        const src = t.u32(e.at + 8);
        if (src + n > tiff.length || at + n > out.length - 16) { ov.setUint32(dst + 4, 0, le); return; }
        out.set(tiff.subarray(src, src + n), at);
        ov.setUint32(dst + 8, at, le);
        at += n + (n & 1);
      }
    });
    ov.setUint32(start + 2 + es.length * 12, 0, le);
    for (const f of fixups) ov.setUint32(f.at, writeIfd(f.sub), le);
    return start;
  };
  writeIfd(t.u32(4));
  return out.slice(0, at);
}

/** APP1 "Exif" segment for a TIFF block (null if it can't fit in one segment). */
export function exifSegment(tiff: Uint8Array): Uint8Array | null {
  const len = 2 + 6 + tiff.length;
  if (len - 2 > APP1_MAX) return null;
  const seg = new Uint8Array(2 + len);
  seg[0] = 0xff;
  seg[1] = 0xe1;
  seg[2] = len >> 8;
  seg[3] = len & 255;
  seg.set(EXIF_HEADER, 4);
  seg.set(tiff, 10);
  return seg;
}

/**
 * The exported JPEG with the source's EXIF inserted (right after SOI, in
 * place of the encoder's JFIF APP0). Returns the JPEG unchanged when the
 * source has no EXIF or it can't be fitted.
 */
export function withExif(jpeg: Uint8Array, sourceTiff: Uint8Array | null, size: { width: number; height: number }): Uint8Array {
  if (!sourceTiff || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return jpeg;
  let tiff = editExif(sourceTiff, size);
  tiff = tiff.subarray(0, tiffExtent(tiff));
  let seg = exifSegment(tiff);
  if (!seg) {
    // Large maker notes (some phones write 60 KB+): drop them rather than the whole block.
    seg = exifSegment(compactExif(editExif(sourceTiff, size), [TAG_MAKERNOTE]));
  }
  if (!seg) return jpeg;
  // Skip the encoder's APP0 JFIF (EXIF wants APP1 first) and any APP1 it wrote.
  let at = 2;
  while (at + 4 <= jpeg.length && jpeg[at] === 0xff && (jpeg[at + 1] === 0xe0 || jpeg[at + 1] === 0xe1)) {
    at += 2 + ((jpeg[at + 2] << 8) | jpeg[at + 3]);
  }
  return concat([jpeg.subarray(0, 2), seg, jpeg.subarray(at)]);
}
