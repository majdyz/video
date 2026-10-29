// Dive-log import (feature 7a): Shearwater XML / CSV, Garmin and Suunto FIT,
// UDDF → one shape, plus alignment with a video. Plain logic, no DOM.
//
// API
//   parseDiveLog(data, name?)      → DiveLog[]   (a file can hold several dives; FIT / CSV give one)
//   detectDiveLogFormat(data, name?) → DiveLogFormat | null
//   type DiveLog = { startTime: Date, utc: boolean, samples: {t s, depth m, temp? °C}[], format, device?, utcOffsetS? }
//     startTime is floating wall-clock time (UTC fields) unless utc is true (FIT).
//   sampleAt(log, t)               → {depth, temp?} | null    interpolated, t in s since startTime
//
//   Video clock: mp4CreationTime(bytes) / readMp4CreationTime(file) (mvhd, treated as local wall clock),
//                gpmfGpsStart(gpmdPayload, payloadTimeS) (GoPro GPS UTC, HERO5–11).
//   syncVideoToDive(log, {start, utc, source}, {durationS, manualOffsetS, autoZone}) → DiveSync
//   sampleAtVideoTime(log, sync, videoT) → {depth, temp?} | null
//
// Formats not handled: Suunto DM4/DM5 (.sde, SQLite), Suunto app JSON, Shearwater
// Cloud .db (SQLite), Garmin .tcx/.gpx (no depth), Subsurface .ssrf. FIT
// developer fields are only read when named "depth" / "temperature".

import { isFit, parseFit } from "./fit.ts";
import { isShearwaterCsv, isShearwaterXml, parseShearwaterCsv, parseShearwaterXml } from "./shearwater.ts";
import { isUddf, parseUddf } from "./uddf.ts";
import { DiveLogError, type DiveLog, type DiveLogFormat } from "./types.ts";

export * from "./types.ts";
export { decodeFit, encodeFit, fitCrc, parseFit, FIT_EPOCH_S, type FitMessage, type FitWriteMsg, type FitField, type FitDevField } from "./fit.ts";
export { parseShearwaterCsv, parseShearwaterXml } from "./shearwater.ts";
export { parseUddf } from "./uddf.ts";
export { parseWallClock } from "./time.ts";
export * from "./sync.ts";

const toBytes = (d: ArrayBuffer | Uint8Array | string): Uint8Array =>
  typeof d === "string" ? new TextEncoder().encode(d) : d instanceof Uint8Array ? d : new Uint8Array(d);
const toText = (d: ArrayBuffer | Uint8Array | string): string => (typeof d === "string" ? d : new TextDecoder("utf-8").decode(toBytes(d)));

export function detectDiveLogFormat(data: ArrayBuffer | Uint8Array | string, name = ""): DiveLogFormat | null {
  if (typeof data !== "string" && isFit(toBytes(data))) return "fit";
  const text = toText(data).slice(0, 65536);
  if (isUddf(text)) return "uddf";
  if (isShearwaterXml(text)) return "shearwater-xml";
  if (/\.(csv|txt)$/i.test(name) || !/^\s*</.test(text)) if (isShearwaterCsv(text)) return "shearwater-csv";
  return null;
}

/** Every dive in the file. Throws DiveLogError with a readable message when the file is not a supported log. */
export function parseDiveLog(data: ArrayBuffer | Uint8Array | string, name = ""): DiveLog[] {
  const f = detectDiveLogFormat(data, name);
  switch (f) {
    case "fit":
      return [parseFit(toBytes(data))];
    case "uddf":
      return parseUddf(toText(data));
    case "shearwater-xml":
      return parseShearwaterXml(toText(data));
    case "shearwater-csv":
      return [parseShearwaterCsv(toText(data))];
    default:
      throw new DiveLogError(`${name || "file"}: not a dive log this app reads (Shearwater XML / CSV, FIT, UDDF)`);
  }
}
