import { describe, expect, it } from "vitest";
import { applyMetadata, readSourceMetadata } from "./metadata";

const enc = new TextEncoder();

function box(type: string, ...payload: Uint8Array[]): Uint8Array {
  const body = payload.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(8 + body);
  new DataView(out.buffer).setUint32(0, out.length);
  out.set(enc.encode(type), 4);
  let at = 8;
  for (const p of payload) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** mvhd, tkhd and mdhd share the layout this cares about: version, flags, creation, modification. */
function timedBox(type: string, seconds: number): Uint8Array {
  const payload = new Uint8Array(20);
  const view = new DataView(payload.buffer);
  view.setUint32(4, seconds);
  view.setUint32(8, seconds);
  return box(type, payload);
}

function movie(seconds: number, udta?: Uint8Array): Uint8Array {
  const trak = box("trak", timedBox("tkhd", seconds), box("mdia", timedBox("mdhd", seconds)));
  return box("moov", timedBox("mvhd", seconds), trak, ...(udta ? [udta] : []));
}

function file(moov: Uint8Array): { blob: Blob; moov: { start: number; size: number } } {
  const ftyp = box("ftyp", enc.encode("isom"));
  const mdat = box("mdat", new Uint8Array(64));
  const start = ftyp.length + mdat.length;
  return { blob: new Blob([ftyp, mdat, moov]), moov: { start, size: moov.length } };
}

const SOURCE_TIME = 3_800_000_000;
const MUXER_TIME = 3_900_000_000;

function times(bytes: Uint8Array, type: string): number[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const found: number[] = [];
  for (let at = 0; at + 8 <= bytes.length; at++) {
    const tag = String.fromCharCode(bytes[at + 4]!, bytes[at + 5]!, bytes[at + 6]!, bytes[at + 7]!);
    if (tag === type) found.push(view.getUint32(at + 12), view.getUint32(at + 16));
  }
  return found;
}

describe("source metadata", () => {
  it("reads the creation time and the udta block", async () => {
    const udta = box("udta", box("©xyz", enc.encode("+51.5+000.1/")));
    const { blob, moov } = file(movie(SOURCE_TIME, udta));
    const meta = await readSourceMetadata(blob, moov);
    expect(meta?.creationTime).toBe(SOURCE_TIME);
    expect(meta?.tags).toEqual([udta]);
  });

  it("reports no tag boxes when the clip has none", async () => {
    const { blob, moov } = file(movie(SOURCE_TIME));
    expect((await readSourceMetadata(blob, moov))?.tags).toEqual([]);
  });
});

describe("applying it to the export", () => {
  it("stamps the source time on every header and carries the udta over", async () => {
    const udta = box("udta", box("©mak", enc.encode("DJI")));
    const { blob, moov } = file(movie(MUXER_TIME));
    const tagged = await applyMetadata(blob, moov, { creationTime: SOURCE_TIME, tags: [udta] });
    const bytes = new Uint8Array(await tagged.arrayBuffer());

    for (const type of ["mvhd", "tkhd", "mdhd"]) {
      expect(times(bytes, type)).toEqual([SOURCE_TIME, SOURCE_TIME]);
    }
    expect(tagged.size).toBe(blob.size + udta.length);
    const rewritten = bytes.slice(moov.start);
    expect(new DataView(rewritten.buffer, rewritten.byteOffset).getUint32(0)).toBe(rewritten.length);
    expect(rewritten.slice(rewritten.length - udta.length)).toEqual(udta);
  });

  it("leaves the file alone when the export already has a udta", async () => {
    const own = box("udta", enc.encode("keep"));
    const { blob, moov } = file(movie(MUXER_TIME, own));
    const tagged = await applyMetadata(blob, moov, { creationTime: SOURCE_TIME, tags: [box("udta", enc.encode("new"))] });
    expect(tagged.size).toBe(blob.size);
    expect(times(new Uint8Array(await tagged.arrayBuffer()), "mvhd")).toEqual([SOURCE_TIME, SOURCE_TIME]);
  });

  it("keeps the times but not the udta when moov is not the last box", async () => {
    const ftyp = box("ftyp", enc.encode("isom"));
    const moovBytes = movie(MUXER_TIME);
    const trailing = box("free", new Uint8Array(8));
    const blob = new Blob([ftyp, moovBytes, trailing]);
    const tagged = await applyMetadata(blob, { start: ftyp.length, size: moovBytes.length }, {
      creationTime: SOURCE_TIME,
      tags: [box("udta", enc.encode("no"))],
    });
    expect(tagged.size).toBe(blob.size);
    expect(times(new Uint8Array(await tagged.arrayBuffer()), "mvhd")).toEqual([SOURCE_TIME, SOURCE_TIME]);
  });
});

describe("iPhone style tags", () => {
  it("carries the movie level meta box across as well", async () => {
    const meta = box("meta", enc.encode("com.apple.quicktime.creationdate"));
    const { blob, moov } = file(movie(MUXER_TIME));
    const tagged = await applyMetadata(blob, moov, { creationTime: SOURCE_TIME, tags: [meta] });
    const bytes = new Uint8Array(await tagged.arrayBuffer());
    expect(bytes.slice(bytes.length - meta.length)).toEqual(meta);
  });
});

describe("a source with no creation time", () => {
  it("reports none rather than 1904", async () => {
    const { blob, moov } = file(movie(0));
    expect((await readSourceMetadata(blob, moov))?.creationTime).toBeUndefined();
  });

  it("leaves the export's own time alone", async () => {
    const { blob, moov } = file(movie(MUXER_TIME));
    const tagged = await applyMetadata(blob, moov, { creationTime: undefined, tags: [] });
    expect(times(new Uint8Array(await tagged.arrayBuffer()), "mvhd")).toEqual([
      MUXER_TIME,
      MUXER_TIME,
    ]);
  });

  it("still carries the tag boxes over", async () => {
    const udta = box("udta", enc.encode("gps"));
    const { blob, moov } = file(movie(MUXER_TIME));
    const tagged = await applyMetadata(blob, moov, { creationTime: undefined, tags: [udta] });
    expect(tagged.size).toBe(blob.size + udta.length);
  });
});
