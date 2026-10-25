// Raw telemetry extraction from an MP4 index: GoPro `gpmd` and DJI `djmd`
// tracks into time series in the device's own frames. The conversion to
// the camera frame, lens and readout happens in telemetry.ts.

import { decodeCamm, type CammRaw } from "./camm.ts";
import { decodeDjiSample, type DjiClipMeta } from "./dji-meta.ts";
import { parseKlv, payloadStreams, readGoProGlobals, type GoProGlobals, type KlvNode } from "./gpmf.ts";
import { readSamples, type Mp4Index, type Mp4Track, type RangeReader } from "./mp4-index.ts";

export type TimeSeries = { times: Float64Array; values: Float64Array; stride: number };

export type GoProRaw = {
  kind: "gopro";
  globals: GoProGlobals;
  /** Camera orientation, one per video frame (w, x, y, z as stored). */
  cori: TimeSeries | null;
  /** Image orientation relative to CORI (the in-camera EIS correction). */
  iori: TimeSeries | null;
  /** Gravity direction in the camera's IMU frame, per frame. */
  grav: TimeSeries | null;
  /** Gyro rad/s in the stored channel order (see gyroOrin). */
  gyro: TimeSeries | null;
  gyroOrin: string | null;
  accl: TimeSeries | null;
};

export type DjiRaw = {
  kind: "dji";
  clip: DjiClipMeta | null;
  /** Fused attitude (w, x, y, z as stored), on the video timeline. */
  attitude: TimeSeries;
  /** Frame start (first row) times on the video timeline, s. */
  frameTimes: Float64Array;
  meanExposure: number;
};

export function videoTrackOf(index: Mp4Index): Mp4Track | null {
  return index.tracks.find((t) => t.handler === "vide" && t.width > 64) ?? index.tracks.find((t) => t.handler === "vide") ?? null;
}

export type TelemetryKind = "gopro" | "dji" | "camm";

/** The metadata track, by sample-entry four-cc or (for remuxed files with a blank stsd) by handler name. */
export function telemetryTrackOf(index: Mp4Index): { kind: TelemetryKind; track: Mp4Track } | null {
  const usable = index.tracks.filter((t) => t.samples.length > 0);
  const gp = usable.find((t) => t.codec === "gpmd") ?? usable.find((t) => /GoPro MET/i.test(t.handlerName));
  if (gp) return { kind: "gopro", track: gp };
  const dj = usable.find((t) => t.codec === "djmd") ?? usable.find((t) => /DJI meta/i.test(t.handlerName));
  if (dj) return { kind: "dji", track: dj };
  const camm = usable.find((t) => t.codec === "camm");
  if (camm) return { kind: "camm", track: camm };
  return null;
}

function series(rowsT: number[], rows: number[][], stride: number): TimeSeries {
  const values = new Float64Array(rows.length * stride);
  rows.forEach((r, i) => {
    for (let k = 0; k < stride; k++) values[i * stride + k] = r[k] ?? 0;
  });
  return { times: Float64Array.from(rowsT), values, stride };
}

type ReadOpts = { signal?: AbortSignal; onProgress?: (f: number) => void };

export async function extractGoPro(index: Mp4Index, track: Mp4Track, read: RangeReader, opts: ReadOpts = {}): Promise<GoProRaw> {
  const payloads = await readSamples(read, track.samples, opts);
  const trees: KlvNode[][] = [];
  if (index.udtaGpmf) trees.push(parseKlv(index.udtaGpmf));
  if (payloads[0]) trees.push(parseKlv(payloads[0]));
  const globals = readGoProGlobals(trees);
  const keys = ["CORI", "IORI", "GRAV", "GYRO", "ACCL", "SHUT"] as const;
  const perPayload = payloads.map((p) => payloadStreams(p, keys));
  // Video-associated clock origin: the first frame-rate stream's STMP
  // (CORI, else the shutter stream) — the moment of video frame 0.
  const first = perPayload[0];
  const refStmp = first?.get("CORI")?.stmp ?? first?.get("SHUT")?.stmp ?? null;
  const acc: Record<string, { t: number[]; rows: number[][] }> = {};
  let gyroOrin: string | null = null;
  for (let i = 0; i < payloads.length; i++) {
    const s = track.samples[i];
    const streams = perPayload[i];
    for (const k of keys) {
      if (k === "SHUT") continue;
      const st = streams.get(k);
      if (!st || !st.rows.length) continue;
      if (k === "GYRO" && st.orin) gyroOrin = st.orin;
      const a = (acc[k] ??= { t: [], rows: [] });
      const n = st.rows.length;
      const nextStmp = perPayload[i + 1]?.get(k)?.stmp ?? null;
      const prevStmp = perPayload[i - 1]?.get(k)?.stmp ?? null;
      const prevN = perPayload[i - 1]?.get(k)?.rows.length ?? n;
      if ((k === "GYRO" || k === "ACCL") && refStmp !== null && st.stmp !== null && (nextStmp !== null || prevStmp !== null)) {
        // The IMU runs on its own clock (200.0 Hz against a 1.001 s payload),
        // so spreading it over the MP4 duration drifts ~1 ms per second.
        // Its STMP (µs) places every sample on the video clock instead.
        const step = nextStmp !== null ? (nextStmp - st.stmp) / n : (st.stmp - (prevStmp as number)) / prevN;
        for (let r = 0; r < n; r++) {
          a.t.push((st.stmp - refStmp + r * step) / 1e6);
          a.rows.push(st.rows[r]);
        }
        continue;
      }
      // Frame-rate streams (CORI/IORI/GRAV): spread evenly over the
      // payload's MP4 duration — one row per video frame, landing exactly
      // on the frame times (their STMP steps are exactly 1001/60000 s).
      for (let r = 0; r < n; r++) {
        a.t.push(s.time - track.editMediaTime + (r * s.duration) / n);
        a.rows.push(st.rows[r]);
      }
    }
  }
  const get = (k: string, stride: number): TimeSeries | null => (acc[k] ? series(acc[k].t, acc[k].rows, stride) : null);
  return { kind: "gopro", globals, cori: get("CORI", 4), iori: get("IORI", 4), grav: get("GRAV", 3), gyro: get("GYRO", 3), gyroOrin, accl: get("ACCL", 3) };
}

export async function extractDji(track: Mp4Track, read: RangeReader, opts: ReadOpts = {}): Promise<DjiRaw> {
  const payloads = await readSamples(read, track.samples, opts);
  let clip: DjiClipMeta | null = null;
  const qt: number[] = [];
  const qv: number[][] = [];
  const frameTimes: number[] = [];
  let first: number | null = null;
  let expSum = 0;
  let expN = 0;
  for (let i = 0; i < payloads.length; i++) {
    let d;
    try {
      d = decodeDjiSample(payloads[i]);
    } catch {
      continue;
    }
    if (d.clip && !clip) clip = d.clip;
    const f = d.frame;
    if (!f) continue;
    first ??= f.frameTimestampUs;
    const sensorFps = clip?.sensorFps || clip?.videoFps || 30;
    const videoFps = clip?.videoFps || sensorFps;
    const ratio = videoFps / sensorFps;
    // Frame time on the video timeline: the MP4 sample time of this frame
    // (container clock) — the µs stamps only serve the sub-frame spacing.
    const ft = track.samples[i].time - track.editMediaTime;
    frameTimes.push(ft);
    if (f.exposure > 0) {
      expSum += f.exposure;
      expN++;
    }
    const n = f.quats.length / 4;
    const vsync = 1 / sensorFps;
    for (let k = 0; k < n; k++) {
      // Sample k of n spans one sensor frame interval; `offset` (in samples)
      // is the lag between the first sensor row's exposure and sample 0.
      const t = ft + (((k - f.offset) / n) * vsync) / ratio;
      qt.push(t);
      qv.push([f.quats[4 * k], f.quats[4 * k + 1], f.quats[4 * k + 2], f.quats[4 * k + 3]]);
    }
  }
  // Drop non-increasing stamps (duplicates at frame seams) and invalid quats.
  const keepT: number[] = [];
  const keepV: number[][] = [];
  for (let i = 0; i < qt.length; i++) {
    const q = qv[i];
    const nrm = Math.hypot(q[0], q[1], q[2], q[3]);
    if (!(nrm > 0.5 && nrm < 1.5) || q.some((x) => !Number.isFinite(x))) continue;
    if (keepT.length && qt[i] <= keepT[keepT.length - 1]) continue;
    keepT.push(qt[i]);
    keepV.push(q.map((x) => x / nrm));
  }
  return { kind: "dji", clip, attitude: series(keepT, keepV, 4), frameTimes: Float64Array.from(frameTimes), meanExposure: expN ? expSum / expN : 0 };
}

export async function extractCamm(track: Mp4Track, read: RangeReader, opts: ReadOpts = {}): Promise<CammRaw> {
  const payloads = await readSamples(read, track.samples, opts);
  return decodeCamm(payloads, track.samples.map((s) => s.time - track.editMediaTime));
}
