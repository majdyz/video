// Builds the small parser fixtures used by test/gyro-parsers.test.ts from
// real clips plus telemetry-parser's reference output (tpdump JSON: the
// quaternions, readout and lens telemetry-parser reports for the same file):
//   node --experimental-strip-types apps/motion-fix/scripts/make-gyro-fixtures.ts <gopro.mp4> <gopro-tp.json> <dji.mp4> <dji-tp.json>
// Writes test/fixtures/{gopro,dji}-payloads.bin (length-prefixed MP4
// samples, plus moov/udta/GPMF for GoPro) and *-reference.json.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { open } from "node:fs/promises";
import { telemetryTrackOf } from "../src/lib/gyro/extract.ts";
import { readMp4Index, readSamples, type RangeReader } from "../src/lib/gyro/mp4-index.ts";

const [gpFile, gpRef, djFile, djRef] = process.argv.slice(2);
const outDir = new URL("../test/fixtures/", import.meta.url);
mkdirSync(outDir, { recursive: true });

async function reader(file: string): Promise<{ read: RangeReader; size: number; close: () => Promise<void> }> {
  const fh = await open(file, "r");
  const { size } = await fh.stat();
  return {
    size,
    close: () => fh.close(),
    read: async (off, len) => {
      const n = Math.max(0, Math.min(len, size - off));
      const b = Buffer.alloc(n);
      await fh.read(b, 0, n, off);
      return new Uint8Array(b.buffer, b.byteOffset, n);
    },
  };
}

function pack(chunks: Uint8Array[]): Buffer {
  const parts: Buffer[] = [];
  for (const c of chunks) {
    const h = Buffer.alloc(4);
    h.writeUInt32BE(c.length);
    parts.push(h, Buffer.from(c));
  }
  return Buffer.concat(parts);
}

{
  const r = await reader(gpFile);
  const index = await readMp4Index(r.read, r.size);
  const t = index && telemetryTrackOf(index);
  if (!index || !t || t.kind !== "gopro") throw new Error("no gpmd");
  const samples = t.track.samples.slice(0, 2);
  const bytes = await readSamples(r.read, samples);
  await r.close();
  writeFileSync(new URL("gopro-payloads.bin", outDir), pack([index.udtaGpmf ?? new Uint8Array(0), ...bytes]));
  const ref = JSON.parse(readFileSync(gpRef, "utf8"));
  const end = (samples[1].time + samples[1].duration) * 1000;
  writeFileSync(
    new URL("gopro-reference.json", outDir),
    JSON.stringify({ source: "telemetry-parser (tpdump) on the public Gyroflow HERO10 HyperSmooth sample, first 10 s", samples: samples.map((s) => ({ time: s.time, duration: s.duration })), model: ref.model, readout_ms: ref.readout_ms, quats: ref.quats.filter((q: number[]) => q[0] < end - 1e-6) }),
  );
  console.log(`gopro: ${bytes.reduce((a, b) => a + b.length, 0)} payload bytes`);
}
{
  const r = await reader(djFile);
  const index = await readMp4Index(r.read, r.size);
  const t = index && telemetryTrackOf(index);
  if (!index || !t || t.kind !== "dji") throw new Error("no djmd");
  const samples = t.track.samples.slice(0, 24);
  const bytes = await readSamples(r.read, samples);
  await r.close();
  writeFileSync(new URL("dji-payloads.bin", outDir), pack(bytes));
  const ref = JSON.parse(readFileSync(djRef, "utf8"));
  const end = samples[samples.length - 1].time * 1000 + 30;
  writeFileSync(
    new URL("dji-reference.json", outDir),
    JSON.stringify({ source: "telemetry-parser (tpdump) on the public Gyroflow DJI Avata sample, first 24 frames", samples: samples.map((s) => ({ time: s.time, duration: s.duration })), model: ref.model, readout_ms: ref.readout_ms, lens: ref.lens?.fisheye_params, quats: ref.quats.filter((q: number[]) => q[0] < end) }),
  );
  console.log(`dji: ${bytes.reduce((a, b) => a + b.length, 0)} payload bytes`);
}
