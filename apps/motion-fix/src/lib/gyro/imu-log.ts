// Motion logs recorded next to a video (sidecar files): Gyroflow's .gcsv
// and Sensor Logger's Gyroscope.csv. Parsed into gyro rates in the camera
// frame (x right, y down, z forward) on the log's own clock; telemetry.ts
// turns them into a CameraMotion and medium.ts lines the clock up with the
// picture.
//
// .gcsv (format: docs.gyroflow.xyz "gcsv format", field details checked
// against telemetry-parser's reader, MIT/Apache):
//   GYROFLOW IMU LOG | CAMERA IMU LOG
//   version,1.3
//   id,<logger>                          orientation,<e.g. YxZ>
//   [vendor, timestamp (unix s at log start), videofilename, lensprofile,
//    lens_info, frame_readout_time (ms), frame_readout_direction]
//   tscale,<s per t unit>   gscale,<rad/s per unit>   ascale,<g per unit>
//   t,gx,gy,gz[,ax,ay,az[,mx,my,mz]]
//   <rows>
// The orientation string picks, for each of Gyroflow's IMU axes X, Y, Z,
// the logged column (letter) and its sign (lower case = negated).
//
// Gyroflow's IMU frame vs our camera frame, measured rather than assumed:
// telemetry-parser gives GoPro HERO5 gyro the orientation "XYZ" and HERO6
// "ZyX"; the channel orders this repo measured by tracking features through
// public clips (telemetry.ts, defaultGoProOrin) then put both bodies on
//   camera x = −Y_gf,  camera y = −X_gf,  camera z = −Z_gf.
// CAMM's "yxz" in telemetry-parser maps onto CAMM's documented camera frame
// through the same relation, and a phone's sensor axes (x right, y to the
// top, z out of the screen) on the landscape frame a phone camera encodes
// (portrait clips carry a 90° rotation tag) give it too, which is why
// telemetry-parser reads phone logging apps with orientation "XYZ".
//
// Sensor Logger (iOS / Android, Kelvin Choi): exports one CSV per sensor;
// Gyroscope.csv is "time,seconds_elapsed,z,y,x" with time in Unix ns and
// rates in rad/s on the device axes, so orientation "XYZ" as above.

import type { TimeSeries } from "./extract.ts";

export type ImuLog = {
  format: "gcsv" | "sensor-logger";
  /** For the UI: "Gyroflow motion log", "Sensor Logger". */
  label: string;
  /** Logger / camera id from the file, when it names one. */
  device: string | null;
  /** rad/s in the camera frame; times in s on the log clock (0 = first row or the log's t = 0). */
  gyro: TimeSeries;
  /** m/s² (specific force) in the camera frame, when logged. Sign conventions vary between loggers. */
  accl: TimeSeries | null;
  /** Unix seconds at log time 0, when the file says. */
  wallStart: number | null;
  /** Rolling-shutter readout, s (negative = bottom to top); null = unknown. */
  readout: number | null;
  lensInfo: string | null;
  lensProfile: string | null;
  videoFilename: string | null;
  orientation: string;
  notes: string[];
};

export type ImuLogResult = { ok: true; log: ImuLog } | { ok: false; reason: string };

/** Gyroflow IMU axes (after the orientation string) -> camera frame. */
export function gyroflowToCamera(g: readonly number[]): [number, number, number] {
  return [-g[1], -g[0], -g[2]];
}

/** Applies a Gyroflow orientation string ("YxZ") to raw columns (x, y, z). */
export function applyOrientation(raw: readonly number[], orientation: string): [number, number, number] {
  const out: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const ch = orientation[i];
    const k = "xyz".indexOf(ch.toLowerCase());
    out[i] = ch === ch.toUpperCase() ? raw[k] : -raw[k];
  }
  return out;
}

export function validOrientation(o: string): boolean {
  if (!/^[XYZxyz]{3}$/.test(o)) return false;
  return new Set(o.toLowerCase()).size === 3;
}

function splitLine(line: string): string[] {
  return line.split(",").map((c) => c.trim());
}

/** Reads a motion log by content (and file name, for Sensor Logger's per-sensor CSVs). */
export function parseImuLog(text: string, fileName = ""): ImuLogResult {
  const head = text.slice(0, 200).replace(/^﻿/, "");
  if (/^(GYROFLOW|CAMERA) IMU LOG/.test(head)) return parseGcsv(text);
  const firstLine = head.split(/\r?\n/, 1)[0].trim();
  if (/^time,seconds_elapsed,/.test(firstLine)) {
    if (/accelerometer|gravity|magnetometer|orientation|location|barometer/i.test(fileName) && !/gyro/i.test(fileName)) {
      return { ok: false, reason: `${fileName} is not a gyroscope log; pick Gyroscope.csv from the Sensor Logger export` };
    }
    return parseSensorLogger(text, fileName);
  }
  return { ok: false, reason: "not a recognised motion log (expected a Gyroflow .gcsv or a Sensor Logger Gyroscope.csv)" };
}

function parseGcsv(text: string): ImuLogResult {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const header: Record<string, string> = {};
  let i = 1;
  let columns: string[] | null = null;
  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cells = splitLine(line);
    if (cells[0] === "t" || cells[0] === "time") {
      columns = cells;
      i++;
      break;
    }
    if (cells.length >= 2) header[cells[0].toLowerCase()] = cells.slice(1).join(",");
  }
  if (!columns) return { ok: false, reason: "the .gcsv has no data header (t,gx,gy,gz…)" };
  const num = (k: string, d: number): number => {
    const v = header[k] !== undefined ? Number(header[k]) : NaN;
    return Number.isFinite(v) && v !== 0 ? v : d;
  };
  const tscale = num("tscale", 0.001);
  const gscale = num("gscale", 1);
  const ascale = num("ascale", 1);
  const notes: string[] = [];
  let orientation = header.orientation ?? "xzY";
  if (!validOrientation(orientation)) {
    notes.push(`orientation "${orientation}" not understood, assumed XYZ`);
    orientation = "XYZ";
  }
  const gt: number[] = [], gv: number[] = [];
  const at: number[] = [], av: number[] = [];
  const hasAccel = columns.length >= 7;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const c = splitLine(line);
    if (c.length < 4) continue;
    const t = Number(c[0]) * tscale;
    const raw = [Number(c[1]) * gscale, Number(c[2]) * gscale, Number(c[3]) * gscale];
    if (!Number.isFinite(t) || !raw.every(Number.isFinite)) continue;
    if (gt.length && t <= gt[gt.length - 1]) continue;
    gt.push(t);
    gv.push(...gyroflowToCamera(applyOrientation(raw, orientation)));
    if (hasAccel && c.length >= 7) {
      const a = [Number(c[4]) * ascale * 9.80665, Number(c[5]) * ascale * 9.80665, Number(c[6]) * ascale * 9.80665];
      if (a.every(Number.isFinite)) {
        at.push(t);
        av.push(...gyroflowToCamera(applyOrientation(a, orientation)));
      }
    }
  }
  if (gt.length < 10) return { ok: false, reason: "the .gcsv holds fewer than 10 gyro samples" };
  let readout: number | null = null;
  const rt = Number(header.frame_readout_time);
  if (Number.isFinite(rt) && rt > 0) {
    const dir = (header.frame_readout_direction ?? "0").trim();
    if (dir === "0" || /^TopToBottom$/i.test(dir)) readout = rt / 1000;
    else if (dir === "1" || dir === "180" || /^BottomToTop$/i.test(dir)) readout = -rt / 1000;
    else notes.push("sideways rolling-shutter readout is not corrected");
  }
  const ts = Number(header.timestamp);
  const id = header.id?.replace(/_/g, " ").trim() || null;
  const vendor = header.vendor?.trim() || null;
  const device = vendor && id && !id.toLowerCase().includes(vendor.toLowerCase()) ? `${vendor} ${id}` : (id ?? vendor);
  return {
    ok: true,
    log: {
      format: "gcsv",
      label: "Gyroflow motion log",
      device,
      gyro: { times: Float64Array.from(gt), values: Float64Array.from(gv), stride: 3 },
      accl: at.length >= 2 ? { times: Float64Array.from(at), values: Float64Array.from(av), stride: 3 } : null,
      wallStart: Number.isFinite(ts) && ts > 1e9 ? ts : null,
      readout,
      lensInfo: header.lens_info?.trim() || null,
      lensProfile: header.lensprofile?.trim() || null,
      videoFilename: header.videofilename?.trim() || null,
      orientation,
      notes,
    },
  };
}

function parseSensorLogger(text: string, fileName: string): ImuLogResult {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const cols = splitLine(lines[0]);
  const it = cols.indexOf("time");
  const ix = cols.indexOf("x"), iy = cols.indexOf("y"), iz = cols.indexOf("z");
  if (it < 0 || ix < 0 || iy < 0 || iz < 0) return { ok: false, reason: "Sensor Logger CSV without time/x/y/z columns" };
  const gt: number[] = [], gv: number[] = [];
  let t0: number | null = null;
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const c = splitLine(lines[i]);
    // Unix ns: beyond float64's integer range for sub-µs, fine at the µs level.
    const tn = Number(c[it]);
    const raw = [Number(c[ix]), Number(c[iy]), Number(c[iz])];
    if (!Number.isFinite(tn) || !raw.every(Number.isFinite)) continue;
    t0 ??= tn;
    const t = (tn - t0) / 1e9;
    if (gt.length && t <= gt[gt.length - 1]) continue;
    gt.push(t);
    gv.push(...gyroflowToCamera(raw));
  }
  if (gt.length < 10 || t0 === null) return { ok: false, reason: "the Sensor Logger CSV holds fewer than 10 samples" };
  const uncal = /uncalibrated/i.test(fileName);
  return {
    ok: true,
    log: {
      format: "sensor-logger",
      label: "Sensor Logger",
      device: null,
      gyro: { times: Float64Array.from(gt), values: Float64Array.from(gv), stride: 3 },
      accl: null,
      wallStart: t0 > 1e15 ? t0 / 1e9 : null,
      readout: null,
      lensInfo: null,
      lensProfile: null,
      videoFilename: null,
      orientation: "XYZ",
      notes: uncal ? ["uncalibrated gyroscope (bias not removed)"] : [],
    },
  };
}
