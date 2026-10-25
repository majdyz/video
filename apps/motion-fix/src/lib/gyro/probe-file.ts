// Browser glue for the telemetry probe: File -> ranged Blob reads, then the
// video's first presentation timestamp (so telemetry frame i lines up with
// the i-th presented frame whatever the container's start offset), and a
// rate cap on very dense orientation streams (DJI writes 2 kHz).

import { ALL_FORMATS, BlobSource, Input } from "mediabunny";
import { blobReader } from "./mp4-index.ts";
import { probeTelemetry, type CameraMotion, type TelemetryProbe } from "./telemetry.ts";

const MAX_RATE_HZ = 1000;

export function decimate(motion: CameraMotion, maxRate = MAX_RATE_HZ): CameraMotion {
  const n = motion.times.length;
  if (n < 3) return motion;
  const rate = (n - 1) / Math.max(1e-6, motion.times[n - 1] - motion.times[0]);
  const step = Math.floor(rate / maxRate);
  if (step < 2) return motion;
  const m = Math.ceil(n / step);
  const times = new Float64Array(m);
  const quats = new Float64Array(4 * m);
  for (let i = 0, j = 0; i < n && j < m; i += step, j++) {
    times[j] = motion.times[i];
    quats.set(motion.quats.subarray(4 * i, 4 * i + 4), 4 * j);
  }
  return { ...motion, times, quats };
}

export async function probeFile(file: File, signal?: AbortSignal): Promise<TelemetryProbe> {
  let probe: TelemetryProbe;
  try {
    probe = await probeTelemetry(blobReader(file), file.size, { signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    return { status: "none", reason: `telemetry could not be read (${e instanceof Error ? e.message : String(e)})` };
  }
  if (probe.status !== "ok") return probe;
  let motion = decimate(probe.motion);
  try {
    const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
    try {
      const track = await input.getPrimaryVideoTrack();
      const first = track ? await track.getFirstTimestamp() : 0;
      if (Number.isFinite(first) && Math.abs(first) < 1) motion = { ...motion, timeOffset: motion.timeOffset - first };
    } finally {
      input.dispose();
    }
  } catch {
    // keep offset 0
  }
  return { status: "ok", motion };
}
