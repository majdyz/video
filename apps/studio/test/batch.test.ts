// Batch export helpers: the store-only ZIP writer, share groups, names.
//   node --experimental-strip-types apps/studio/test/batch.test.ts
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, crc32Blob, zipStore } from "../src/pipeline/zip.ts";
import { batchZip, kindOf, shareGroups, splitBatch, uniqueNames, type BatchOutput } from "../src/pipeline/batch.ts";

const enc = new TextEncoder();
assert.equal(crc32(enc.encode("123456789")), 0xcbf43926, "CRC-32 check value");
assert.equal(crc32(new Uint8Array(0)), 0);
// Chunked CRC matches one-shot (crc32Blob reads 8 MB slices).
const big = new Uint8Array(9 << 20).map((_, i) => (i * 31) & 0xff);
assert.equal(await crc32Blob(new Blob([big])), crc32(big));

// Names: unique, case-insensitive, extension kept.
assert.deepEqual(uniqueNames(["a.jpg", "A.jpg", "b.jpg", "a.jpg", "noext", "noext"]), ["a.jpg", "A (2).jpg", "b.jpg", "a (3).jpg", "noext", "noext (2)"]);

// Share groups: ≤10 files, ≤ maxBytes, an oversize file alone.
const sz = (n: number) => ({ size: n });
assert.deepEqual(shareGroups(Array.from({ length: 23 }, () => sz(1))).map((g) => g.length), [10, 10, 3]);
assert.deepEqual(shareGroups([sz(50), sz(50), sz(200), sz(10)], 10, 100).map((g) => g.map((x) => x.size)), [[50, 50], [200], [10]]);
assert.deepEqual(shareGroups([]), []);

// Mixed picks: photos and videos kept in order, other files left out.
const f = (name: string, type = "") => new File([new Uint8Array(1)], name, { type });
const { media, skipped } = splitBatch([f("a.jpg", "image/jpeg"), f("clip.MOV"), f("notes.txt", "text/plain"), f("b.HEIC"), f("c.mp4", "video/mp4")]);
assert.deepEqual(media.map((m) => m.name), ["a.jpg", "clip.MOV", "b.HEIC", "c.mp4"]);
assert.equal(skipped, 1);
assert.equal(kindOf(media[0]), "photo");
assert.equal(kindOf(media[1]), "video");

// ZIP: valid for the system unzip (CRC + structure), names deduplicated, UTF-8.
const out = (name: string, bytes: Uint8Array, mime = "image/jpeg"): BatchOutput => ({ name, kind: "photo", blob: new Blob([bytes as BlobPart], { type: mime }), native: null, size: bytes.length, mime, width: 1, height: 1 });
const files = [out("IMG_1-colour.jpg", enc.encode("one")), out("IMG_1-colour.jpg", enc.encode("two two")), out("Rïff-colour.jpg", big), out("clip-colour.mp4", enc.encode("mp4"), "video/mp4")];
const zip = await batchZip(files);
assert.equal(zip.type, "application/zip");
const dir = mkdtempSync(join(tmpdir(), "batchzip-"));
try {
  const p = join(dir, "t.zip");
  writeFileSync(p, new Uint8Array(await zip.arrayBuffer()));
  let unzip = true;
  try { execFileSync("unzip", ["-v"], { stdio: "ignore" }); } catch { unzip = false; }
  if (unzip) {
    const t = execFileSync("unzip", ["-t", p]).toString();
    assert.match(t, /No errors detected/);
    const l = execFileSync("unzip", ["-Z1", p]).toString().trim().split("\n");
    assert.deepEqual(l, ["IMG_1-colour.jpg", "IMG_1-colour (2).jpg", "Rïff-colour.jpg", "clip-colour.mp4"]);
  } else {
    console.warn("unzip not installed: structure checks only");
  }
  // End record: 4 entries.
  const b = new Uint8Array(await zip.arrayBuffer());
  const end = new DataView(b.buffer, b.length - 22);
  assert.equal(end.getUint32(0, true), 0x06054b50);
  assert.equal(end.getUint16(10, true), 4);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
// Empty ZIP is still a ZIP.
assert.equal((zipStore([])).size, 22);

console.log("batch: ok");
