// Camera detection from the file (the Studio's moov reader): DJI metadata
// tracks are found by sample entry or, after a re-mux, by handler name.
//   node --experimental-strip-types apps/studio/test/camera.test.ts
import assert from "node:assert/strict";
import { detectClipCamera } from "../src/pipeline/camera.ts";
import { DJI_OA5P_DJMD } from "../../dewarp/src/camera-fixtures.ts";

const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const box = (type: string, ...body: number[][]): number[] => {
  const payload = body.flat();
  return [...be32(8 + payload.length), ...[...type].map((c) => c.charCodeAt(0)), ...payload];
};
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** ftyp, mdat holding one sample, moov with one metadata trak (handler `handler`, stsd entry `entry` or none). */
function clip(sample: Uint8Array, handler: string, entry: string | null): File {
  const ftyp = box("ftyp", ascii("qt  "), be32(512), ascii("qt  "));
  const mdatAt = ftyp.length;
  const mdat = box("mdat", [...sample]);
  const sampleAt = mdatAt + 8;
  const hdlr = box("hdlr", be32(0), be32(0), ascii("mhlr"), ascii("meta"), be32(0), be32(0), be32(0), [handler.length], ascii(handler));
  const stsd = box("stsd", be32(0), be32(entry ? 1 : 0), entry ? box(entry, [0, 0, 0, 0, 0, 0, 0, 1]) : []);
  const stsz = box("stsz", be32(0), be32(sample.length), be32(1));
  const stco = box("stco", be32(0), be32(1), be32(sampleAt));
  const moov = box("moov", box("trak", box("mdia", hdlr, box("minf", box("stbl", stsd, stsz, stco)))));
  return new File([Uint8Array.from([...ftyp, ...mdat, ...moov])], "clip.mp4");
}

const djmd = Uint8Array.from(Buffer.from(DJI_OA5P_DJMD, "base64"));

const original = await detectClipCamera(clip(djmd, "DJI meta", "djmd"), 3840, 2160);
assert.equal(original.brand, "DJI");
assert.equal(original.model, "Osmo Action 5 Pro");

// ffmpeg -map 0 -c copy: the track and handler survive, the sample entry list comes out empty.
const remuxed = await detectClipCamera(clip(djmd, "DJI meta", null), 3840, 2160);
assert.equal(remuxed.brand, "DJI", remuxed.evidence.join("; "));
assert.equal(remuxed.model, "Osmo Action 5 Pro");

// A data track that is not DJI's stays unknown.
const other = await detectClipCamera(clip(djmd, "Core Media Data Handler", null), 3840, 2160);
assert.equal(other.brand, undefined);

console.log("camera detection: ok");
