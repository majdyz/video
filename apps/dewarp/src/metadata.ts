/**
 * Photos sorts by the file's own creation time, so an export stamped with the muxer's "now" lands at
 * the end of the timeline instead of next to the clip it came from. mp4-muxer has no option for it,
 * and the moov is written last with fastStart off, so the finished moov is rewritten here.
 */

export type BoxSpan = { start: number; size: number };

export type SourceMetadata = {
  /** Seconds since 1904, the form the file stores, so nothing is lost converting to a Date and back. A
   *  re-muxed clip often carries 0, and stamping that on the export would file it under 1904. */
  creationTime: number | undefined;
  /** Movie level udta and meta, which carry GPS, camera make and model, the DJI block, and on iPhone clips the capture date. */
  tags: Uint8Array[];
};

const CARRIED = ["udta", "meta"];

type Child = { type: string; start: number; size: number; body: number };

function children(buf: Uint8Array, from: number, to: number): Child[] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const out: Child[] = [];
  let at = from;
  while (at + 8 <= to) {
    let size = view.getUint32(at);
    const type = String.fromCharCode(buf[at + 4]!, buf[at + 5]!, buf[at + 6]!, buf[at + 7]!);
    let body = at + 8;
    if (size === 1) {
      if (at + 16 > to) break;
      size = Number(view.getBigUint64(at + 8));
      body = at + 16;
    } else if (size === 0) {
      size = to - at;
    }
    if (size < body - at || at + size > to) break;
    out.push({ type, start: at, size, body });
    at += size;
  }
  return out;
}

function find(list: Child[], type: string): Child | undefined {
  return list.find(c => c.type === type);
}

function readTime(buf: Uint8Array, box: Child): number {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const version = buf[box.body]!;
  const at = box.body + 4;
  return version === 1 ? Number(view.getBigUint64(at)) : view.getUint32(at);
}

function writeTime(buf: Uint8Array, box: Child, seconds: number): void {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const version = buf[box.body]!;
  const at = box.body + 4;
  if (version === 1) {
    view.setBigUint64(at, BigInt(seconds));
    view.setBigUint64(at + 8, BigInt(seconds));
  } else if (seconds <= 0xffffffff) {
    view.setUint32(at, seconds);
    view.setUint32(at + 4, seconds);
  }
}

/** Child range of a container box, skipping its own header. */
function contents(buf: Uint8Array, box: { start: number; size: number }): Child[] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const large = view.getUint32(box.start) === 1;
  return children(buf, box.start + (large ? 16 : 8), box.start + box.size);
}

export async function readSourceMetadata(file: Blob, moov: BoxSpan): Promise<SourceMetadata | undefined> {
  const buf = new Uint8Array(await file.slice(moov.start, moov.start + moov.size).arrayBuffer());
  const top = contents(buf, { start: 0, size: buf.length });
  const mvhd = find(top, "mvhd");
  if (!mvhd) return undefined;
  const carried = top.filter(c => CARRIED.includes(c.type));
  const creationTime = readTime(buf, mvhd);
  return {
    creationTime: creationTime > 0 ? creationTime : undefined,
    tags: carried.map(c => buf.slice(c.start, c.start + c.size)),
  };
}

/**
 * Rewrites the output's moov with the source's times and udta. Growing the box is only safe while
 * moov is the last box, because a stco offset into the mdat before it must not move.
 */
export async function applyMetadata(out: Blob, moov: BoxSpan, meta: SourceMetadata): Promise<Blob> {
  const buf = new Uint8Array(await out.slice(moov.start, moov.start + moov.size).arrayBuffer());
  const top = contents(buf, { start: 0, size: buf.length });
  const mvhd = find(top, "mvhd");
  if (!mvhd) return out;
  const when = meta.creationTime;
  if (when) {
    writeTime(buf, mvhd, when);
    for (const trak of top.filter(c => c.type === "trak")) {
      const inTrak = contents(buf, trak);
      const tkhd = find(inTrak, "tkhd");
      if (tkhd) writeTime(buf, tkhd, when);
      const mdia = find(inTrak, "mdia");
      const mdhd = mdia && find(contents(buf, mdia), "mdhd");
      if (mdhd) writeTime(buf, mdhd, when);
    }
  }

  const last = moov.start + moov.size === out.size;
  const missing = last ? meta.tags.filter(t => !find(top, tagType(t))) : [];
  // A 4K export is a file backed blob of several hundred megabytes. Rebuilding it for no change
  // risks pulling it into page memory on Safari, which is the thing the file sink exists to avoid.
  if (!when && missing.length === 0) return out;
  const moved = missing.length ? concat(buf, ...missing) : buf;
  if (missing.length) {
    const view = new DataView(moved.buffer, moved.byteOffset, moved.byteLength);
    if (view.getUint32(0) === 1) view.setBigUint64(8, BigInt(moved.length));
    else view.setUint32(0, moved.length);
  }
  return new Blob([out.slice(0, moov.start), moved as BlobPart, out.slice(moov.start + moov.size)], { type: "video/mp4" });
}

function tagType(tag: Uint8Array): string {
  return String.fromCharCode(tag[4]!, tag[5]!, tag[6]!, tag[7]!);
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
