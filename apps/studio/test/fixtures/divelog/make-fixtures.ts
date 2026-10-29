// Writes the dive-log fixtures in this folder from profile.ts (run once; the outputs are committed):
//   node --experimental-strip-types --no-warnings apps/studio/test/fixtures/divelog/make-fixtures.ts
// Each format uses its own sample rate, units and rounding, the way the real exporters do.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encodeFit, FIT_EPOCH_S, type FitWriteMsg } from "../../../src/pipeline/divelog/fit.ts";
import { DURATION_S, START_WALL, truthDepth, truthTemp, UTC_OFFSET_S } from "./profile.ts";

const dir = path.dirname(fileURLToPath(import.meta.url));
const pad = (n: number) => String(n).padStart(2, "0");
const wall = new Date(START_WALL * 1000);
const times = (step: number) => Array.from({ length: Math.floor(DURATION_S / step) + 1 }, (_, i) => i * step);

// Shearwater XML (Desktop / Cloud export): metric, currentTime in ms, 10 s samples, integer °C, .NET date.
{
  const h = wall.getUTCHours();
  const date = `${wall.getUTCMonth() + 1}/${wall.getUTCDate()}/${wall.getUTCFullYear()} ${h % 12 || 12}:${pad(wall.getUTCMinutes())}:${pad(wall.getUTCSeconds())} ${h < 12 ? "AM" : "PM"}`;
  const recs = times(10).map((t) => `      <diveLogRecord><currentTime>${t * 1000}</currentTime><currentDepth>${truthDepth(t).toFixed(2)}</currentDepth><fractionO2>0.21</fractionO2><fractionHe>0</fractionHe><currentCircuitSetting>1</currentCircuitSetting><waterTemp>${Math.round(truthTemp(t))}</waterTemp></diveLogRecord>`);
  fs.writeFileSync(path.join(dir, "shearwater.xml"), `<?xml version="1.0" encoding="utf-8"?>
<dive version="1">
  <diveLog>
    <number>212</number>
    <startDate>${date}</startDate>
    <maxTime>40</maxTime>
    <maxDepth>19.5</maxDepth>
    <imperialUnits>False</imperialUnits>
    <computerSerial>1a2b3c4d</computerSerial>
    <computerModel>8</computerModel>
    <product>Perdix 2</product>
    <diveLogRecords>
${recs.join("\n")}
    </diveLogRecords>
  </diveLog>
</dive>
`);
}

// Shearwater Cloud CSV: imperial (ft, °F), info block then the sample table, 10 s samples.
{
  const d = `${wall.getUTCFullYear()}-${pad(wall.getUTCMonth() + 1)}-${pad(wall.getUTCDate())} ${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}:${pad(wall.getUTCSeconds())}`;
  const rows = times(10).map((t) => `${t},${(truthDepth(t) / 0.3048).toFixed(1)},0,1,0.21,0,99,${(truthTemp(t) * 9 / 5 + 32).toFixed(0)}`);
  fs.writeFileSync(path.join(dir, "shearwater.csv"), [
    "Dive Number,Start Date,Max Depth,Max Time,Imperial Units,Product,Serial Number",
    `212,${d},64.0,40,true,Perdix 2,1a2b3c4d`,
    "",
    "Time (sec),Depth,First Stop Depth,Time To Surface (min),Fraction O2,Fraction He,Current NDL,Water Temp",
    ...rows,
    "",
  ].join("\r\n"));
}

// FIT: UTC timestamps (s since 1989-12-31), activity.local_timestamp carries the zone.
const utcStart = START_WALL - UTC_OFFSET_S - FIT_EPOCH_S;
const U8 = 0x02, ENUM = 0x00, U16 = 0x84, U32 = 0x86, S8 = 0x01, STR = 0x07, F32 = 0x88;

// Garmin Descent: record.depth (uint32 mm) + record.temperature (sint8 °C), 1 s samples.
{
  const msgs: FitWriteMsg[] = [
    { local: 0, global: 0, fields: [{ num: 0, base: ENUM, size: 1, value: 4 }, { num: 1, base: U16, size: 2, value: 1 }, { num: 2, base: U16, size: 2, value: 3258 }, { num: 4, base: U32, size: 4, value: utcStart }] },
    ...times(1).map((t): FitWriteMsg => ({ local: 1, global: 20, fields: [
      { num: 253, base: U32, size: 4, value: utcStart + t },
      { num: 92, base: U32, size: 4, value: Math.round(truthDepth(t) * 1000) },
      { num: 13, base: S8, size: 1, value: Math.round(truthTemp(t)) },
    ] })),
    { local: 2, global: 18, fields: [{ num: 253, base: U32, size: 4, value: utcStart + DURATION_S }, { num: 2, base: U32, size: 4, value: utcStart }, { num: 5, base: ENUM, size: 1, value: 53 }] },
    { local: 3, global: 34, fields: [{ num: 253, base: U32, size: 4, value: utcStart + DURATION_S }, { num: 5, base: U32, size: 4, value: utcStart + DURATION_S + UTC_OFFSET_S }, { num: 1, base: U16, size: 2, value: 1 }] },
  ];
  fs.writeFileSync(path.join(dir, "garmin-descent.fit"), encodeFit(msgs));
}

// Suunto (Suunto app FIT export): record.depth every 10 s, temperature as a developer field
// ("Temperature", float32 °C) described by developer_data_id (207) + field_description (206).
{
  const msgs: FitWriteMsg[] = [
    { local: 0, global: 0, fields: [{ num: 0, base: ENUM, size: 1, value: 4 }, { num: 1, base: U16, size: 2, value: 23 }, { num: 4, base: U32, size: 4, value: utcStart }, { num: 8, base: STR, size: 16, value: "Suunto Ocean" }] },
    { local: 1, global: 207, fields: [{ num: 3, base: U8, size: 1, value: 0 }] },
    { local: 2, global: 206, fields: [{ num: 0, base: U8, size: 1, value: 0 }, { num: 1, base: U8, size: 1, value: 0 }, { num: 2, base: U8, size: 1, value: F32 }, { num: 3, base: STR, size: 12, value: "Temperature" }] },
    ...times(10).map((t): FitWriteMsg => ({ local: 3, global: 20,
      fields: [{ num: 253, base: U32, size: 4, value: utcStart + t }, { num: 92, base: U32, size: 4, value: Math.round(truthDepth(t) * 1000) }],
      dev: [{ num: 0, idx: 0, base: F32, size: 4, value: truthTemp(t) }] })),
    { local: 4, global: 18, fields: [{ num: 253, base: U32, size: 4, value: utcStart + DURATION_S }, { num: 2, base: U32, size: 4, value: utcStart }] },
    { local: 5, global: 34, fields: [{ num: 253, base: U32, size: 4, value: utcStart + DURATION_S }, { num: 5, base: U32, size: 4, value: utcStart + DURATION_S + UTC_OFFSET_S }] },
  ];
  fs.writeFileSync(path.join(dir, "suunto.fit"), encodeFit(msgs));
}

// UDDF 3.2: SI units (m, K, s), 6 s waypoints, floating local datetime.
{
  const iso = `${wall.getUTCFullYear()}-${pad(wall.getUTCMonth() + 1)}-${pad(wall.getUTCDate())}T${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}:${pad(wall.getUTCSeconds())}`;
  const wps = times(6).map((t) => `          <waypoint><depth>${truthDepth(t).toFixed(2)}</depth><divetime>${t}.0</divetime><temperature>${(truthTemp(t) + 273.15).toFixed(2)}</temperature></waypoint>`);
  fs.writeFileSync(path.join(dir, "dive.uddf"), `<?xml version="1.0" encoding="UTF-8"?>
<uddf version="3.2.0">
  <generator><name>Fixture writer</name><type>converter</type><version>1.0</version></generator>
  <diver><owner id="owner"><personal><lastname>Test</lastname></personal>
    <equipment><divecomputer id="dc1"><name>Generic UDDF computer</name></divecomputer></equipment></owner></diver>
  <profiledata>
    <repetitiongroup id="rg1">
      <dive id="d1">
        <informationbeforedive><divenumber>212</divenumber><datetime>${iso}</datetime></informationbeforedive>
        <samples>
${wps.join("\n")}
        </samples>
        <informationafterdive><greatestdepth>19.5</greatestdepth><diveduration>${DURATION_S}</diveduration></informationafterdive>
      </dive>
    </repetitiongroup>
  </profiledata>
</uddf>
`);
}
console.log("fixtures written to", dir);
