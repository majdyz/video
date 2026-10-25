// Camera / lens detection for the Studio (part of the lazy media chunk):
// reads the moov box and the first sample of each timed-metadata track
// (DJI djmd, GoPro gpmd) straight from the file and hands them to Dewarp's
// detector (apps/dewarp/src/camera-detect.ts), the same input the Dewarp
// app gets from mp4box, without pulling mp4box in.

import { detectCamera, type CameraInfo, type MetaSample } from "../../../dewarp/src/camera-detect.ts";

type Box = { type: string; start: number; size: number; body: number };

async function readBytes(file: Blob, start: number, len: number): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(start, start + len).arrayBuffer());
}

/** Top-level boxes, from their headers only. */
async function topLevel(file: Blob): Promise<Box[]> {
  const out: Box[] = [];
  let at = 0;
  for (let i = 0; i < 64 && at + 8 <= file.size; i++) {
    const h = await readBytes(file, at, 16);
    const v = new DataView(h.buffer, h.byteOffset, h.byteLength);
    let size = v.getUint32(0);
    const type = String.fromCharCode(h[4], h[5], h[6], h[7]);
    let body = at + 8;
    if (size === 1) {
      size = Number(v.getBigUint64(8));
      body = at + 16;
    } else if (size === 0) size = file.size - at;
    if (size < 8) break;
    out.push({ type, start: at, size, body });
    at += size;
  }
  return out;
}

function children(buf: Uint8Array, from: number, to: number): Box[] {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const out: Box[] = [];
  let at = from;
  while (at + 8 <= to) {
    let size = v.getUint32(at);
    let body = at + 8;
    if (size === 1) {
      size = Number(v.getBigUint64(at + 8));
      body = at + 16;
    } else if (size === 0) size = to - at;
    if (size < 8 || at + size > to) break;
    out.push({ type: String.fromCharCode(buf[at + 4], buf[at + 5], buf[at + 6], buf[at + 7]), start: at, size, body });
    at += size;
  }
  return out;
}

function child(buf: Uint8Array, parent: Box, type: string): Box | undefined {
  return children(buf, parent.body, parent.start + parent.size).find((b) => b.type === type);
}

/** Format, offset and size of the first sample of a trak (for timed-metadata tracks). */
function firstSample(moov: Uint8Array, trak: Box): { format: string; offset: number; size: number } | null {
  const stbl = [ "mdia", "minf", "stbl" ].reduce<Box | undefined>((b, t) => (b ? child(moov, b, t) : undefined), trak);
  if (!stbl) return null;
  const v = new DataView(moov.buffer, moov.byteOffset, moov.byteLength);
  const stsd = child(moov, stbl, "stsd");
  if (!stsd || stsd.body + 16 > stsd.start + stsd.size) return null;
  const e = stsd.body + 8; // version/flags, entry_count, then the first entry
  const format = String.fromCharCode(moov[e + 4], moov[e + 5], moov[e + 6], moov[e + 7]);
  if (format !== "djmd" && format !== "gpmd") return { format, offset: 0, size: 0 };
  const stsz = child(moov, stbl, "stsz");
  const co = child(moov, stbl, "stco") ?? child(moov, stbl, "co64");
  if (!stsz || !co) return null;
  const fixed = v.getUint32(stsz.body + 4);
  const size = fixed || v.getUint32(stsz.body + 12);
  const offset = co.type === "co64" ? Number(v.getBigUint64(co.body + 8)) : v.getUint32(co.body + 8);
  return { format, offset, size };
}

/** What camera/lens shot this clip, as far as its metadata says. Never throws. */
export async function detectClipCamera(file: File, codedW: number, codedH: number): Promise<CameraInfo> {
  try {
    const moovBox = (await topLevel(file)).find((b) => b.type === "moov");
    if (!moovBox) return { evidence: ["no moov box"] };
    // A long clip's sample tables run to a few MB; the camera tags sit in udta near the end.
    const moov = await readBytes(file, moovBox.start, Math.min(moovBox.size, 64 << 20));
    const root: Box = { type: "moov", start: 0, size: moov.byteLength, body: moovBox.body - moovBox.start };
    const metaSamples: MetaSample[] = [];
    for (const trak of children(moov, root.body, root.size).filter((b) => b.type === "trak")) {
      const s = firstSample(moov, trak);
      if (!s || !s.size || s.size > 1 << 20) continue;
      metaSamples.push({ format: s.format, data: await readBytes(file, s.offset, s.size) });
    }
    return detectCamera({ moov, width: codedW, height: codedH, metaSamples });
  } catch (e) {
    return { evidence: [`metadata unreadable: ${(e as Error).message}`] };
  }
}
