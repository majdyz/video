// Google Camera Motion Metadata (CAMM): the timed-metadata track of Street
// View uploads (sample entry 'camm', handler 'meta'). Spec:
// https://developers.google.com/streetview/publish/camm-spec
//
// Each sample is one little-endian packet: uint16 reserved (0), uint16 type,
// then the payload. Types used here:
//   0  angle_axis float[3]: rotation local camera -> world, |v| = angle (rad)
//   1  pixel_exposure_time int32, rolling_shutter_skew_time int32 (ns)
//   2  gyro float[3], rad/s, camera frame
//   3  acceleration float[3], m/s², camera frame
//   7  magnetic_field float[3], µT (ignored)
//   4, 5, 6 position / GPS (ignored)
// Camera frame: x right, y down, z forward (the same frame as the rest of
// this pipeline, OpenCV). telemetry-parser maps CAMM gyro with its "yxz"
// orientation into Gyroflow's IMU frame; with that frame's relation to the
// camera (imu-log.ts) it lands on x, y, z unchanged, which agrees.
//
// Who writes it (checked 25 Oct 2026): 360 cameras for Street View
// (Insta360, Ricoh Theta, Labpano), mapping tools; none of the stock phone
// camera apps sampled (Pixel, iPhone, other Android) write a camm track.

import type { TimeSeries } from "./extract.ts";
import type { Quat } from "./quat.ts";

export type CammRaw = {
  kind: "camm";
  /** Camera -> world orientation from angle-axis packets (w, x, y, z). */
  orientation: TimeSeries | null;
  /** rad/s in the camera frame. */
  gyro: TimeSeries | null;
  /** m/s² in the camera frame. */
  accl: TimeSeries | null;
  /** Rolling-shutter skew from type-1 packets, ns (median); null when absent. */
  readoutNs: number | null;
  /** Packet counts by type, for diagnostics. */
  counts: Record<number, number>;
};

export function angleAxisToQuat(x: number, y: number, z: number): Quat {
  const a = Math.hypot(x, y, z);
  if (a < 1e-12) return [1, 0, 0, 0];
  const s = Math.sin(a / 2) / a;
  return [Math.cos(a / 2), x * s, y * s, z * s];
}

/**
 * Decodes CAMM packets. `times[i]` is the presentation time of payload i on
 * the video timeline (s). A sample may carry several packets back to back;
 * all get the sample's time.
 */
export function decodeCamm(payloads: Uint8Array[], times: number[]): CammRaw {
  const ot: number[] = [], ov: number[] = [];
  const gt: number[] = [], gv: number[] = [];
  const at: number[] = [], av: number[] = [];
  const skews: number[] = [];
  const counts: Record<number, number> = {};
  const size: Record<number, number> = { 0: 12, 1: 8, 2: 12, 3: 12, 4: 12, 5: 24, 6: 56, 7: 12 };
  for (let i = 0; i < payloads.length; i++) {
    const p = payloads[i];
    if (!p) continue;
    const dv = new DataView(p.buffer, p.byteOffset, p.byteLength);
    let o = 0;
    while (o + 4 <= p.length) {
      const type = dv.getUint16(o + 2, true);
      const n = size[type];
      if (n === undefined || o + 4 + n > p.length) break;
      const d = o + 4;
      counts[type] = (counts[type] ?? 0) + 1;
      const f = (k: number): number => dv.getFloat32(d + 4 * k, true);
      const t = times[i];
      if (type === 0) {
        const q = angleAxisToQuat(f(0), f(1), f(2));
        if (q.every(Number.isFinite)) {
          ot.push(t);
          ov.push(...q);
        }
      } else if (type === 1) {
        const skew = dv.getInt32(d + 4, true);
        if (skew > 0) skews.push(skew);
      } else if (type === 2 || type === 3) {
        const v = [f(0), f(1), f(2)];
        if (v.every(Number.isFinite)) {
          (type === 2 ? gt : at).push(t);
          (type === 2 ? gv : av).push(...v);
        }
      }
      o = d + n;
    }
  }
  const ser = (t: number[], v: number[], stride: number): TimeSeries | null => {
    if (t.length < 2) return null;
    // Packets of one type can share a sample time: keep strictly increasing stamps.
    const keepT: number[] = [], keepV: number[] = [];
    for (let i = 0; i < t.length; i++) {
      if (keepT.length && t[i] <= keepT[keepT.length - 1]) continue;
      keepT.push(t[i]);
      for (let k = 0; k < stride; k++) keepV.push(v[stride * i + k]);
    }
    return keepT.length >= 2 ? { times: Float64Array.from(keepT), values: Float64Array.from(keepV), stride } : null;
  };
  skews.sort((a, b) => a - b);
  return {
    kind: "camm",
    orientation: ser(ot, ov, 4),
    gyro: ser(gt, gv, 3),
    accl: ser(at, av, 3),
    readoutNs: skews.length ? skews[skews.length >> 1] : null,
    counts,
  };
}
