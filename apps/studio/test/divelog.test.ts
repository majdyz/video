// Dive-log parsers and video sync (feature 7a).
//   node --experimental-strip-types --no-warnings apps/studio/test/divelog.test.ts
// Fixtures: test/fixtures/divelog (synthetic but format-correct, from make-fixtures.ts).
// Optional: DIVELOG_REAL_DIR=/dir with real exports (*.fit, *.uddf, *.xml, *.csv) parses each and prints a summary.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  decodeFit, detectDiveLogFormat, diveWallClock, DiveLogError, fitCrc, gpmfGpsStart, mp4CreationTime, MP4_EPOCH_S, parseDiveLog,
  parseWallClock, readMp4CreationTime, sampleAt, sampleAtVideoTime, syncVideoToDive, type DiveLog,
} from "../src/pipeline/divelog/index.ts";
import { DURATION_S, START_WALL, truthDepth, truthTemp, UTC_OFFSET_S } from "./fixtures/divelog/profile.ts";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/divelog");
const read = (f: string) => new Uint8Array(fs.readFileSync(path.join(dir, f)));
const near = (a: number, b: number, tol: number, msg: string) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (±${tol})`);

// ---------------------------------------------------------------- every format parses
const files = { "shearwater.xml": "shearwater-xml", "shearwater.csv": "shearwater-csv", "garmin-descent.fit": "fit", "suunto.fit": "fit", "dive.uddf": "uddf" } as const;
const logs = new Map<string, DiveLog>();
for (const [f, fmt] of Object.entries(files)) {
  const bytes = read(f);
  assert.equal(detectDiveLogFormat(bytes, f), fmt, `${f} detected`);
  const all = parseDiveLog(bytes, f);
  assert.equal(all.length, 1, `${f}: one dive`);
  const log = all[0];
  assert.equal(log.format, fmt);
  assert.ok(log.samples.length > 100, `${f}: samples`);
  for (let i = 1; i < log.samples.length; i++) assert.ok(log.samples[i].t > log.samples[i - 1].t, `${f}: sorted`);
  near(log.samples[log.samples.length - 1].t, DURATION_S, 0.001, `${f}: duration`);
  logs.set(f, log);
}
// Start times: floating wall clock for Shearwater / UDDF, UTC + offset for FIT.
for (const f of ["shearwater.xml", "shearwater.csv", "dive.uddf"]) {
  assert.equal(logs.get(f)!.utc, false, `${f} floating`);
  assert.equal(logs.get(f)!.startTime.getTime() / 1000, START_WALL, `${f} start`);
}
for (const f of ["garmin-descent.fit", "suunto.fit"]) {
  const l = logs.get(f)!;
  assert.equal(l.utc, true);
  assert.equal(l.startTime.toISOString(), "2026-03-14T01:12:30.000Z", `${f} start (UTC)`);
  assert.equal(l.utcOffsetS, UTC_OFFSET_S, `${f} zone from activity.local_timestamp`);
  assert.equal(diveWallClock(l, 0), START_WALL);
}
assert.equal(logs.get("suunto.fit")!.device, "Suunto Ocean");
assert.match(logs.get("garmin-descent.fit")!.device ?? "", /Garmin/);
assert.equal(logs.get("shearwater.xml")!.device, "Shearwater Perdix 2");
assert.equal(logs.get("shearwater.csv")!.device, "Shearwater Perdix 2");

// ---------------------------------------------------------------- same depth at the same time (±0.1 m)
let worst = 0;
for (let wall = START_WALL + 3; wall < START_WALL + DURATION_S; wall += 17) {
  const t = wall - START_WALL;
  const depths: number[] = [];
  for (const [f, log] of logs) {
    const s = sampleAt(log, wall - diveWallClock(log, 0));
    assert.ok(s, `${f}: sample at ${t}`);
    depths.push(s!.depth);
    near(s!.depth, truthDepth(t), 0.1, `${f} depth at ${t} s`);
    assert.ok(s!.temp !== undefined, `${f}: temperature at ${t}`);
    near(s!.temp!, truthTemp(t), 0.6, `${f} temperature at ${t} s`);
  }
  worst = Math.max(worst, Math.max(...depths) - Math.min(...depths));
}
assert.ok(worst <= 0.2, `formats agree: worst spread ${worst.toFixed(3)} m`);
const ref = logs.get("garmin-descent.fit")!;
for (const [f, log] of logs) {
  for (const t of [60, 300, 777, 1234, 2000, 2200, 2350]) near(sampleAt(log, t + diveWallClock(ref, 0) - diveWallClock(log, 0))!.depth, sampleAt(ref, t)!.depth, 0.1, `${f} vs Garmin at ${t} s`);
}
assert.equal(sampleAt(ref, -1), null, "before the dive");
assert.equal(sampleAt(ref, DURATION_S + 1), null, "after the dive");

// ---------------------------------------------------------------- FIT details
const garminBytes = read("garmin-descent.fit");
assert.equal(fitCrc(garminBytes), 0, "file CRC over data + CRC is 0");
assert.ok(decodeFit(garminBytes).some((m) => m.num === 20 && m.fields.get(92) !== undefined));
assert.ok(decodeFit(read("suunto.fit")).some((m) => m.num === 20 && typeof m.dev.get("Temperature") === "number"), "Suunto developer temperature");
assert.throws(() => parseDiveLog(new Uint8Array([1, 2, 3, 4]), "x.bin"), DiveLogError);
assert.throws(() => parseDiveLog("hello, world", "notes.txt"), DiveLogError);

// ---------------------------------------------------------------- date strings
const wc = (s: string) => parseWallClock(s)?.date.toISOString();
assert.equal(wc("3/14/2026 9:12:30 AM"), "2026-03-14T09:12:30.000Z");
assert.equal(wc("3/14/2026 9:12:30 PM"), "2026-03-14T21:12:30.000Z");
assert.equal(wc("14.03.2026 09:12:30"), "2026-03-14T09:12:30.000Z");
assert.equal(wc("Sat Mar 14 09:12:30 2026"), "2026-03-14T09:12:30.000Z");
assert.equal(wc("2026-03-14T09:12:30"), "2026-03-14T09:12:30.000Z");
assert.equal(parseWallClock("2026-03-14T09:12:30+08:00")!.utc, true);
assert.equal(wc("2026-03-14T09:12:30+08:00"), "2026-03-14T01:12:30.000Z");
assert.equal(parseWallClock("not a date"), null);

// ---------------------------------------------------------------- video clock
function mp4WithMvhd(createdUnixS: number, version: 0 | 1 = 0): Uint8Array {
  const box = (type: string, body: number[]) => { const n = 8 + body.length; return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255, ...[...type].map((c) => c.charCodeAt(0)), ...body]; };
  const be = (v: number, bytes: number) => Array.from({ length: bytes }, (_, i) => Math.floor(v / 2 ** (8 * (bytes - 1 - i))) & 255);
  const secs = createdUnixS + MP4_EPOCH_S;
  const mvhd = version === 1 ? [1, 0, 0, 0, ...be(secs, 8), ...be(secs, 8), ...be(1000, 4), ...be(60000, 8), ...new Array(80).fill(0)] : [0, 0, 0, 0, ...be(secs, 4), ...be(secs, 4), ...be(1000, 4), ...be(60000, 4), ...new Array(80).fill(0)];
  return Uint8Array.from([...box("ftyp", [...[..."isom"].map((c) => c.charCodeAt(0)), 0, 0, 2, 0]), ...box("mdat", new Array(64).fill(7)), ...box("moov", box("mvhd", mvhd))]);
}
const clipLocal = START_WALL + 450; // 09:20:00 on the camera's (local) clock
assert.equal(mp4CreationTime(mp4WithMvhd(clipLocal))!.getTime() / 1000, clipLocal, "mvhd v0");
assert.equal(mp4CreationTime(mp4WithMvhd(clipLocal, 1))!.getTime() / 1000, clipLocal, "mvhd v1");
assert.equal(mp4CreationTime(new Uint8Array(16)), null);
const viaBlob = await readMp4CreationTime(new Blob([mp4WithMvhd(clipLocal)]));
assert.equal(viaBlob!.getTime() / 1000, clipLocal, "mvhd from a Blob");

// mvhd (camera wall clock) against every log: dive t = 450 s at video 0.
const videoMvhd = { start: new Date(clipLocal * 1000), utc: false, source: "mvhd" as const };
for (const [f, log] of logs) {
  const s = syncVideoToDive(log, videoMvhd, { durationS: 60 });
  near(s.diveTimeAtVideoStart, 450, 1e-6, `${f}: mvhd sync`);
  assert.equal(s.zoneShiftS, 0);
  assert.equal(s.overlapS, 60);
  near(sampleAtVideoTime(log, s, 30)!.depth, truthDepth(480), 0.1, `${f}: depth 30 s into the clip`);
}
// Manual offset is added last.
assert.equal(syncVideoToDive(ref, videoMvhd, { manualOffsetS: 12 }).diveTimeAtVideoStart, 462);
// Camera left on home time (UTC+1) while the computer is on local time (UTC+8): 7 h zone shift.
const homeClock = { start: new Date((clipLocal - 7 * 3600) * 1000), utc: false, source: "mvhd" as const };
const zs = syncVideoToDive(logs.get("shearwater.xml")!, homeClock, { durationS: 60 });
assert.equal(zs.zoneShiftS, 7 * 3600);
near(zs.diveTimeAtVideoStart, 450, 1e-6, "zone-shifted sync");
assert.equal(syncVideoToDive(logs.get("shearwater.xml")!, homeClock, { durationS: 60, autoZone: false }).overlapS, 0);

// GoPro GPMF GPSU (UTC) in a payload 5 s into the clip.
const klv = (key: string, type: number, size: number, repeat: number, data: number[]) => {
  const pad = (4 - (data.length % 4)) % 4;
  return [...[...key].map((c) => c.charCodeAt(0)), type, size, repeat >> 8, repeat & 255, ...data, ...new Array(pad).fill(0)];
};
const gpsu = [..."260314012005.000"].map((c) => c.charCodeAt(0)); // 2026-03-14 01:20:05 UTC
const inner = [...klv("STNM", 0x63, 1, 3, [..."GPS"].map((c) => c.charCodeAt(0))), ...klv("GPSU", 0x55, 16, 1, gpsu)];
const payload = Uint8Array.from(klv("DEVC", 0, 4, inner.length / 4 + 2, [...klv("STRM", 0, 4, inner.length / 4, inner)]));
const gpsStart = gpmfGpsStart(payload, 5);
assert.equal(gpsStart!.toISOString(), "2026-03-14T01:20:00.000Z", "GPMF GPSU → clip start (UTC)");
const videoGps = { start: gpsStart!, utc: true, source: "gpmf-gps" as const };
near(syncVideoToDive(ref, videoGps, { durationS: 60 }).diveTimeAtVideoStart, 450, 1e-6, "GPS UTC vs FIT (UTC + offset)");
const gpsVsShearwater = syncVideoToDive(logs.get("shearwater.xml")!, videoGps, { durationS: 60 });
near(gpsVsShearwater.diveTimeAtVideoStart, 450, 1e-6, "GPS UTC vs Shearwater local: zone found");
assert.equal(gpsVsShearwater.zoneShiftS, UTC_OFFSET_S);

// ---------------------------------------------------------------- optional: real exports
const realDir = process.env.DIVELOG_REAL_DIR;
if (realDir && fs.existsSync(realDir)) {
  for (const f of fs.readdirSync(realDir)) {
    const bytes = new Uint8Array(fs.readFileSync(path.join(realDir, f)));
    if (!detectDiveLogFormat(bytes, f)) continue;
    try {
      for (const l of parseDiveLog(bytes, f)) {
        const max = Math.max(...l.samples.map((s) => s.depth));
        console.log(`${f}: ${l.format} ${l.device ?? ""} ${l.startTime.toISOString()} ${l.utc ? "UTC" : "local"}, ${l.samples.length} samples, ${(l.samples.at(-1)!.t / 60).toFixed(1)} min, max ${max.toFixed(1)} m`);
      }
    } catch (e) {
      console.log(`${f}: ${(e as Error).message}`);
    }
  }
}

console.log("divelog tests passed");
