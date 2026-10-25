// Photo EXIF carry-over: read from JPEG / HEIF-AVIF / PNG / WebP, edit, write into the exported JPEG.
//   node --experimental-strip-types apps/studio/test/exif.test.ts
import assert from "node:assert/strict";
import sharp from "sharp";
import { editExif, readExif, tiffExtent, withExif } from "../src/pipeline/photo-exif.ts";

// ---------------------------------------------------------------- a hand-built EXIF block
type Tag = { tag: number; type: number; count: number; value: number | Uint8Array };

/** TIFF with IFD0 (+ Exif, GPS sub-IFDs and an IFD1 thumbnail), little- or big-endian. */
function buildTiff(le: boolean, opts: { makerNote?: number } = {}): Uint8Array {
  const buf = new Uint8Array(200_000);
  const v = new DataView(buf.buffer);
  const u16 = (at: number, x: number) => v.setUint16(at, x, le);
  const u32 = (at: number, x: number) => v.setUint32(at, x, le);
  buf.set(le ? [0x49, 0x49, 0x2a, 0] : [0x4d, 0x4d, 0, 0x2a], 0);
  u32(4, 8);
  let heap = 2000;
  const str = (s: string) => new TextEncoder().encode(s + "\0");
  const rational = (pairs: [number, number][]) => {
    const b = new Uint8Array(pairs.length * 8);
    const d = new DataView(b.buffer);
    pairs.forEach(([n, den], i) => { d.setUint32(i * 8, n, le); d.setUint32(i * 8 + 4, den, le); });
    return b;
  };
  const writeIfd = (at: number, tags: Tag[], next: number) => {
    u16(at, tags.length);
    tags.forEach((t, i) => {
      const e = at + 2 + i * 12;
      u16(e, t.tag); u16(e + 2, t.type); u32(e + 4, t.count);
      if (t.value instanceof Uint8Array) {
        if (t.value.length <= 4) buf.set(t.value, e + 8);
        else { buf.set(t.value, heap); u32(e + 8, heap); heap += t.value.length + (t.value.length & 1); }
      } else if (t.type === 3) u16(e + 8, t.value);
      else u32(e + 8, t.value);
    });
    u32(at + 2 + tags.length * 12, next);
  };
  const IFD0 = 8, EXIF = 400, GPS = 800, IFD1 = 1200;
  const make = str("DJI"), model = str("Osmo Action 5 Pro"), date = str("2026:10:01 10:20:30");
  writeIfd(IFD0, [
    { tag: 0x010f, type: 2, count: make.length, value: make },
    { tag: 0x0110, type: 2, count: model.length, value: model },
    { tag: 0x0112, type: 3, count: 1, value: 6 },
    { tag: 0x0132, type: 2, count: date.length, value: date },
    { tag: 0x8769, type: 4, count: 1, value: EXIF },
    { tag: 0x8825, type: 4, count: 1, value: GPS },
  ], IFD1);
  const exifTags: Tag[] = [
    { tag: 0x9003, type: 2, count: date.length, value: date },
    { tag: 0x829a, type: 5, count: 1, value: rational([[1, 250]]) },
    { tag: 0xa002, type: 4, count: 1, value: 4000 },
    { tag: 0xa003, type: 3, count: 1, value: 3000 },
  ];
  if (opts.makerNote) exifTags.push({ tag: 0x927c, type: 7, count: opts.makerNote, value: new Uint8Array(opts.makerNote).fill(0x5a) });
  writeIfd(EXIF, exifTags, 0);
  writeIfd(GPS, [
    { tag: 0x0001, type: 2, count: 2, value: str("N") },
    { tag: 0x0002, type: 5, count: 3, value: rational([[8, 1], [30, 1], [1234, 100]]) },
    { tag: 0x0003, type: 2, count: 2, value: str("E") },
    { tag: 0x0004, type: 5, count: 3, value: rational([[115, 1], [10, 1], [0, 1]]) },
  ], 0);
  writeIfd(IFD1, [{ tag: 0x0201, type: 4, count: 1, value: 1900 }, { tag: 0x0202, type: 4, count: 1, value: 50 }], 0);
  return buf.slice(0, heap);
}

/** Minimal reader for the assertions: tag → value of IFD0 / Exif / GPS. */
function parse(tiff: Uint8Array) {
  const le = tiff[0] === 0x49;
  const v = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const u16 = (at: number) => v.getUint16(at, le), u32 = (at: number) => v.getUint32(at, le);
  const size: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1 };
  const ifd = (off: number) => {
    const out = new Map<number, string | number | number[]>();
    const n = u16(off);
    for (let i = 0; i < n; i++) {
      const e = off + 2 + i * 12, tag = u16(e), type = u16(e + 2), count = u32(e + 4);
      const at = size[type] * count > 4 ? u32(e + 8) : e + 8;
      if (type === 2) out.set(tag, new TextDecoder().decode(tiff.subarray(at, at + count)).replace(/\0+$/, ""));
      else if (type === 3) out.set(tag, u16(at));
      else if (type === 4) out.set(tag, u32(at));
      else if (type === 5) out.set(tag, Array.from({ length: count }, (_, k) => u32(at + k * 8) / u32(at + k * 8 + 4)));
      else out.set(tag, count);
    }
    return { tags: out, next: u32(off + 2 + n * 12) };
  };
  const i0 = ifd(u32(4));
  return { ifd0: i0.tags, next: i0.next, exif: ifd(i0.tags.get(0x8769) as number).tags, gps: ifd(i0.tags.get(0x8825) as number).tags };
}

const plain = await sharp({ create: { width: 64, height: 48, channels: 3, background: "#336699" } }).jpeg().toBuffer();
const app1 = (tiff: Uint8Array) => {
  const len = 8 + tiff.length;
  return Uint8Array.from([0xff, 0xe1, len >> 8, len & 255, 0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff]);
};
const jpegWith = (tiff: Uint8Array) => Uint8Array.from([0xff, 0xd8, ...app1(tiff), ...plain.subarray(2)]);

for (const le of [true, false]) {
  const tiff = buildTiff(le);
  // Reading: a camera JPEG.
  const src = jpegWith(tiff);
  const got = readExif(src);
  assert.ok(got, "EXIF read from JPEG");
  assert.deepEqual(Buffer.from(got!.subarray(0, tiff.length)), Buffer.from(tiff));
  // Editing: orientation baked in, size updated, thumbnail gone; nothing else touched.
  const ed = parse(editExif(tiff, { width: 1920, height: 1080 }));
  assert.equal(ed.ifd0.get(0x0112), 1, "Orientation → 1");
  assert.equal(ed.next, 0, "IFD1 dropped");
  assert.equal(ed.exif.get(0xa002), 1920);
  assert.equal(ed.exif.get(0xa003), 1080);
  assert.equal(parse(tiff).ifd0.get(0x0112), 6, "input not modified");
  // Writing into the exported JPEG (the browser's encoder output: JFIF APP0, no EXIF).
  const out = withExif(new Uint8Array(plain), got, { width: 64, height: 48 });
  assert.equal(out[0], 0xff); assert.equal(out[1], 0xd8);
  assert.equal(out[2], 0xff); assert.equal(out[3], 0xe1, "APP1 right after SOI");
  const back = parse(readExif(out)!);
  assert.equal(back.ifd0.get(0x010f), "DJI");
  assert.equal(back.ifd0.get(0x0110), "Osmo Action 5 Pro");
  assert.equal(back.ifd0.get(0x0112), 1);
  assert.equal(back.exif.get(0x9003), "2026:10:01 10:20:30", "DateTimeOriginal kept");
  assert.deepEqual(back.exif.get(0x829a), [1 / 250], "exposure kept");
  assert.equal(back.gps.get(0x0001), "N");
  assert.deepEqual(back.gps.get(0x0002), [8, 30, 12.34], "GPS latitude kept");
  assert.deepEqual(back.gps.get(0x0004), [115, 10, 0]);
  // Still a valid JPEG, and other readers agree.
  const meta = await sharp(Buffer.from(out)).metadata();
  assert.equal(meta.width, 64);
  assert.equal(meta.orientation ?? 1, 1, "sharp sees no rotation");
  assert.ok(meta.exif && meta.exif.length > 100, "sharp finds the EXIF block");
  await sharp(Buffer.from(out)).raw().toBuffer();
}

// Trailing bytes (the dropped thumbnail) are cut.
{
  const tiff = buildTiff(true);
  assert.ok(tiffExtent(tiff) <= tiff.length);
}

// A 70 KB maker note doesn't fit an APP1 segment: it goes, the rest stays.
{
  const big = buildTiff(true, { makerNote: 70_000 });
  const out = withExif(new Uint8Array(plain), big, { width: 64, height: 48 });
  const back = parse(readExif(out)!);
  assert.equal(back.ifd0.get(0x010f), "DJI");
  assert.equal(back.gps.get(0x0001), "N");
  assert.ok(!back.exif.has(0x927c), "maker note dropped");
  assert.ok(out.length < plain.length + 65_536);
}

// No EXIF in the source: the export is untouched.
assert.equal(withExif(new Uint8Array(plain), null, { width: 64, height: 48 }).length, plain.length);
assert.equal(readExif(new Uint8Array(plain)), null);

// HEIF-family (AVIF here; HEIC uses the same "Exif" item), PNG and WebP sources.
const exifOpts = { IFD0: { Make: "Apple", Model: "iPhone 16 Pro" }, IFD2: { DateTimeOriginal: "2026:09:20 08:00:00" } };
const base = () => sharp({ create: { width: 32, height: 24, channels: 3, background: "#204060" } });
for (const [name, buf] of [
  ["avif", await base().avif().withExif(exifOpts).toBuffer()],
  ["png", await base().png().withExif(exifOpts).toBuffer()],
  ["webp", await base().webp().withExif(exifOpts).toBuffer()],
] as const) {
  const t = readExif(new Uint8Array(buf));
  assert.ok(t, `EXIF read from ${name}`);
  const p = parse(t!);
  assert.equal(p.ifd0.get(0x010f), "Apple", `${name} Make`);
  assert.equal(p.ifd0.get(0x0110), "iPhone 16 Pro", `${name} Model`);
  const out = withExif(new Uint8Array(plain), t, { width: 64, height: 48 });
  assert.equal(parse(readExif(out)!).exif.get(0x9003), "2026:09:20 08:00:00", `${name} → JPEG keeps the date`);
}

console.log("exif tests passed");
