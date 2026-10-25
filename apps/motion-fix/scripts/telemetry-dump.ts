// Dumps the raw telemetry of a clip (ranged reads, like the app):
//   node --experimental-strip-types apps/motion-fix/scripts/telemetry-dump.ts <clip> [out.json]
import { open } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { extractDji, extractGoPro, telemetryTrackOf, videoTrackOf } from "../src/lib/gyro/extract.ts";
import { readMp4Index, type RangeReader } from "../src/lib/gyro/mp4-index.ts";

const [file, outFile] = process.argv.slice(2);
const fh = await open(file, "r");
const { size } = await fh.stat();
let bytesRead = 0;
let reads = 0;
const read: RangeReader = async (off, len) => {
  const n = Math.max(0, Math.min(len, size - off));
  const b = Buffer.alloc(n);
  await fh.read(b, 0, n, off);
  bytesRead += n;
  reads++;
  return new Uint8Array(b.buffer, b.byteOffset, n);
};
const t0 = performance.now();
const index = await readMp4Index(read, size);
if (!index) throw new Error("no moov");
const video = videoTrackOf(index);
const found = telemetryTrackOf(index);
const tele = found?.track;
const teleKind = found?.kind;
console.log("tracks:", index.tracks.map((t) => `${t.handler}/${t.codec}(${t.samples.length}) "${t.handlerName}"`).join(" "));
console.log("video:", video && { w: video.width, h: video.height, rot: video.rotation, n: video.samples.length, dur: video.duration.toFixed(3), edit: video.editMediaTime });
let dump: unknown = null;
if (tele && teleKind === "gopro") {
  const g = await extractGoPro(index, tele, read);
  console.log("globals:", g.globals);
  for (const k of ["cori", "iori", "grav", "gyro", "accl"] as const) {
    const s = g[k];
    if (s) console.log(k, s.times.length, "first", Array.from(s.values.subarray(0, s.stride)).map((x) => +x.toFixed(4)), "t0", s.times[0], "t1", s.times[1], "last t", s.times[s.times.length - 1].toFixed(3));
  }
  console.log("gyro ORIN", g.gyroOrin);
  dump = { kind: "gopro", video, globals: g.globals, cori: g.cori && ser(g.cori), iori: g.iori && ser(g.iori), grav: g.grav && ser(g.grav), gyro: g.gyro && ser(g.gyro), gyroOrin: g.gyroOrin, accl: g.accl && ser(g.accl) };
} else if (tele && teleKind === "dji") {
  const d = await extractDji(tele, read);
  console.log("clip:", d.clip);
  console.log("attitude samples", d.attitude.times.length, "frames", d.frameTimes.length, "exposure", d.meanExposure);
  dump = { kind: "dji", video, clip: d.clip, attitude: ser(d.attitude), frameTimes: Array.from(d.frameTimes), meanExposure: d.meanExposure };
} else console.log("no telemetry track");
console.log(`${reads} reads, ${(bytesRead / 1e6).toFixed(2)} MB of ${(size / 1e6).toFixed(0)} MB, ${(performance.now() - t0).toFixed(0)} ms`);
await fh.close();
if (outFile && dump) writeFileSync(outFile, JSON.stringify(dump, (k, v) => (k === "samples" ? undefined : v)));

function ser(s: { times: Float64Array; values: Float64Array; stride: number }) {
  return { times: Array.from(s.times), values: Array.from(s.values), stride: s.stride };
}
