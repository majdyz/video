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

/** The trak's handler name (mdia/hdlr), "" when absent: "DJI meta", "GoPro MET", … */
export function handlerName(moov: Uint8Array, trak: Box): string {
  const mdia = child(moov, trak, "mdia");
  const hdlr = mdia && child(moov, mdia, "hdlr");
  if (!hdlr) return "";
  // version/flags, pre_defined, handler_type, 3 reserved words, then the name (C or Pascal string).
  const from = hdlr.body + 24;
  const to = hdlr.start + hdlr.size;
  if (from >= to) return "";
  return String.fromCharCode(...moov.subarray(from, to)).replace(/[^ -~]/g, "").trim();
}

/** Format, offset and size of the first sample of a trak (for timed-metadata tracks). */
function firstSample(moov: Uint8Array, trak: Box): { format: string; offset: number; size: number } | null {
  const stbl = [ "mdia", "minf", "stbl" ].reduce<Box | undefined>((b, t) => (b ? child(moov, b, t) : undefined), trak);
  if (!stbl) return null;
  const v = new DataView(moov.buffer, moov.byteOffset, moov.byteLength);
  const stsd = child(moov, stbl, "stsd");
  if (!stsd) return null;
  const e = stsd.body + 8; // version/flags, entry_count, then the first entry
  // (A re-mux can leave the entry list empty.)
  let format = e + 8 <= stsd.start + stsd.size ? String.fromCharCode(moov[e + 4], moov[e + 5], moov[e + 6], moov[e + 7]) : "";
  // Re-muxers (ffmpeg -map 0 -c copy) keep the track but may rewrite its sample entry; the handler name survives.
  if (format !== "djmd" && format !== "gpmd") {
    const handler = handlerName(moov, trak);
    if (/DJI meta/i.test(handler)) format = "djmd";
    else if (/GoPro MET/i.test(handler)) format = "gpmd";
    else return { format, offset: 0, size: 0 };
  }
  const stsz = child(moov, stbl, "stsz");
  const co = child(moov, stbl, "stco") ?? child(moov, stbl, "co64");
  if (!stsz || !co) return null;
  const fixed = v.getUint32(stsz.body + 4);
  const size = fixed || v.getUint32(stsz.body + 12);
  const offset = co.type === "co64" ? Number(v.getBigUint64(co.body + 8)) : v.getUint32(co.body + 8);
  return { format, offset, size };
}

/** Words in vendor metadata that name a colour mode (footage.ts `detectFootage` reads the result). */
const COLOUR_MODE = /\b(d-?log ?m|d-?log2?|apple ?log|gp-?log)\b/i;

/** DJI dvtm ColorMode values (telemetry-parser dvtm_library.proto, MIT/Apache-2.0). */
const DJI_COLOUR_MODE: Record<number, string> = { 0: "Normal", 1: "D-Cinelike", 2: "D-Log", 9: "HLG", 19: "D-Log M", 22: "D-Log2" };

/** Protobuf walk: the varint at a field path (e.g. [2, 4, 1]), undefined if absent, null if unparsable. */
export function protoVarintAt(b: Uint8Array, path: number[]): number | undefined | null {
  let from = 0, to = b.length;
  for (let depth = 0; depth < path.length; depth++) {
    let i = from, found = false;
    const varint = (): number => {
      let x = 0, s = 1;
      for (let k = 0; k < 10; k++) {
        if (i >= to) throw new Error("eof");
        const c = b[i++];
        x += (c & 127) * s;
        if (!(c & 128)) return x;
        s *= 128;
      }
      throw new Error("varint");
    };
    try {
      while (i < to) {
        const key = varint(), field = Math.floor(key / 8), wire = key & 7;
        if (field === 0) return null;
        const last = depth === path.length - 1;
        if (wire === 0) {
          const v = varint();
          if (field === path[depth] && last) return v;
        } else if (wire === 2) {
          const n = varint();
          if (i + n > to) return null;
          if (field === path[depth] && !last) { from = i; to = i + n; found = true; break; }
          i += n;
        } else if (wire === 1) i += 8;
        else if (wire === 5) i += 4;
        else return null;
      }
    } catch {
      return null;
    }
    if (!found) return undefined;
  }
  return undefined;
}

/**
 * DJI clips record the colour mode in the first djmd sample (StreamMeta 2 →
 * ColorMode 4 → color_mode 1; proto3 omits the default, Normal). Measured
 * on Osmo Action 5 Pro files: D-Log M = 19 (8-bit Normal files carry none).
 */
export function djiColourMode(djmd: Uint8Array): string | null {
  const v = protoVarintAt(djmd, [2, 4, 1]);
  if (v === null) return null;
  return DJI_COLOUR_MODE[v ?? 0] ?? `mode ${v}`;
}

/**
 * GoPro writes its settings as GPMF in moov/udta; `PTCL` is the colour
 * profile ("NATURAL", "FLAT", "GP-LOG", …), a KLV string: key, type 'c',
 * element size, repeat count (big-endian), then the bytes.
 */
export function goproColourProfile(moov: Uint8Array): string | null {
  for (let i = 0; i + 8 < moov.length; i++) {
    if (moov[i] !== 0x50 || moov[i + 1] !== 0x54 || moov[i + 2] !== 0x43 || moov[i + 3] !== 0x4c || moov[i + 4] !== 0x63) continue; // "PTCL" 'c'
    const n = moov[i + 5] * ((moov[i + 6] << 8) | moov[i + 7]);
    if (n <= 0 || n > 32 || i + 8 + n > moov.length) continue;
    const s = String.fromCharCode(...moov.subarray(i + 8, i + 8 + n)).replace(/\0+$/, "").trim();
    if (/^[\x20-\x7e]+$/.test(s)) return s;
  }
  return null;
}

/**
 * What the clip's own metadata says about its colour mode: the DJI colour
 * mode from the djmd track ("DJI colour mode: D-Log M"), plus printable runs
 * in the moov box (udta / meta / vendor atoms) that name one; null when
 * nothing does. Never throws.
 */
export async function readColourModeHints(file: File): Promise<string | null> {
  try {
    const moovBox = (await topLevel(file)).find((b) => b.type === "moov");
    if (!moovBox) return null;
    const moov = await readBytes(file, moovBox.start, Math.min(moovBox.size, 64 << 20));
    const hits = new Set<string>();
    const root: Box = { type: "moov", start: 0, size: moov.byteLength, body: moovBox.body - moovBox.start };
    for (const trak of children(moov, root.body, root.size).filter((b) => b.type === "trak")) {
      const s = firstSample(moov, trak);
      if (s?.format !== "djmd" || !s.size || s.size > 1 << 20) continue;
      const mode = djiColourMode(await readBytes(file, s.offset, s.size));
      if (mode) hits.add(`DJI colour mode: ${mode}`);
    }
    const gopro = goproColourProfile(moov);
    if (gopro) hits.add(`GoPro colour profile: ${gopro}`);
    let run = "";
    for (let i = 0; i <= moov.length; i++) {
      const c = i < moov.length ? moov[i] : 0;
      if (c >= 0x20 && c < 0x7f) {
        run += String.fromCharCode(c);
        continue;
      }
      if (run.length >= 3 && run.length < 200) {
        const m = run.match(COLOUR_MODE);
        if (m) hits.add(run.trim());
      }
      run = "";
    }
    return hits.size ? [...hits].join(" | ") : null;
  } catch {
    return null;
  }
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
