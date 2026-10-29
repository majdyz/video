// Aligning a dive log with a video.
//
// The video's clock comes from the MP4 `mvhd` creation time (seconds since
// 1904; the spec says UTC, but GoPro, DJI and most action cams write their
// local wall clock there, so it is treated as floating by default) or from
// GoPro GPMF `GPSU` (true UTC from the GPS, HERO5–HERO11; HERO12/13 have no
// GPS). Dive computers log wall-clock time (Shearwater, UDDF) or UTC with a
// local offset (FIT). `syncVideoToDive` puts both on one clock, and when the
// two clocks disagree by whole time zones (camera set to home time, computer
// to local) it can shift by the 15-minute multiple that makes the clip
// overlap the dive best. The manual offset is added last.
//
//   const sync = syncVideoToDive(log, { start, utc: false, source: "mvhd" }, { durationS, manualOffsetS })
//   const s = sampleAtVideoTime(log, sync, videoT)   // {depth, temp?} | null outside the dive

import type { DiveLog, DiveSample } from "./types.ts";

/** Seconds from 1904-01-01 (MP4 epoch) to 1970-01-01. */
export const MP4_EPOCH_S = 2082844800;

export type VideoClock = {
  /** Wall-clock (utc false) or UTC (utc true) time of the clip's first frame. */
  start: Date;
  utc: boolean;
  source: "mvhd" | "gpmf-gps" | "manual";
};

const u32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const type4 = (b: Uint8Array, o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);

/** mvhd creation time from the bytes of an mvhd box body (version byte first). Null when unset (0). */
export function mvhdCreationTime(body: Uint8Array): Date | null {
  if (body.length < 8) return null;
  const v = body[0];
  const secs = v === 1 ? u32(body, 4) * 2 ** 32 + u32(body, 8) : u32(body, 4);
  if (!secs) return null;
  return new Date((secs - MP4_EPOCH_S) * 1000);
}

/**
 * mvhd creation time from MP4 bytes: a whole (small) file, or a `moov` box, or
 * any buffer whose boxes contain moov/mvhd. Null when there is none.
 */
export function mp4CreationTime(buf: Uint8Array): Date | null {
  const walk = (from: number, to: number, depth: number): Date | null => {
    let p = from;
    while (p + 8 <= to) {
      let size = u32(buf, p);
      const t = type4(buf, p + 4);
      let hdr = 8;
      if (size === 1 && p + 16 <= to) {
        size = u32(buf, p + 8) * 2 ** 32 + u32(buf, p + 12);
        hdr = 16;
      } else if (size === 0) size = to - p;
      if (size < hdr) return null;
      const end = Math.min(to, p + size);
      if (t === "mvhd") return mvhdCreationTime(buf.subarray(p + hdr, end));
      if (t === "moov" && depth < 2) {
        const r = walk(p + hdr, end, depth + 1);
        return r;
      }
      p += size;
    }
    return null;
  };
  return walk(0, buf.length, 0);
}

/** Same as mp4CreationTime, reading only box headers and the start of moov from a Blob / File. */
export async function readMp4CreationTime(file: Blob): Promise<Date | null> {
  const read = async (o: number, n: number) => new Uint8Array(await file.slice(o, Math.min(file.size, o + n)).arrayBuffer());
  let p = 0;
  for (let guard = 0; guard < 4096 && p + 8 <= file.size; guard++) {
    const h = await read(p, 16);
    let size = u32(h, 0);
    let hdr = 8;
    if (size === 1) {
      size = u32(h, 8) * 2 ** 32 + u32(h, 12);
      hdr = 16;
    } else if (size === 0) size = file.size - p;
    if (size < hdr) return null;
    if (type4(h, 4) === "moov") {
      const moov = await read(p + hdr, Math.min(size - hdr, 1 << 16));
      return mp4CreationTime(moov);
    }
    p += size;
  }
  return null;
}

/**
 * First GPS UTC time in a GoPro GPMF payload (a `gpmd` sample): the `GPSU`
 * KLV, "yymmddhhmmss.sss" UTC. `payloadTimeS` is that sample's time in the
 * clip; the result is the UTC time of the clip's first frame.
 */
export function gpmfGpsStart(payload: Uint8Array, payloadTimeS = 0): Date | null {
  const walk = (from: number, to: number): Date | null => {
    let p = from;
    while (p + 8 <= to) {
      const key = type4(payload, p);
      const type = payload[p + 4];
      const size = payload[p + 5];
      const repeat = (payload[p + 6] << 8) | payload[p + 7];
      const len = size * repeat;
      const body = p + 8;
      if (body + len > to) return null;
      if (type === 0) {
        const r = walk(body, body + len);
        if (r) return r;
      } else if (key === "GPSU" && len >= 16) {
        const s = String.fromCharCode(...payload.subarray(body, body + 16));
        const m = s.match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2}(?:\.\d+)?)/);
        if (m) {
          const ms = Date.UTC(2000 + +m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0) + Number(m[6]) * 1000;
          if (Number.isFinite(ms)) return new Date(ms - payloadTimeS * 1000);
        }
      }
      p = body + ((len + 3) & ~3);
    }
    return null;
  };
  return walk(0, payload.length);
}

export type DiveSync = {
  /** Dive time (s since log.startTime) at video t = 0, everything included. */
  diveTimeAtVideoStart: number;
  /** Raw clock difference before any zone shift or manual offset. */
  clockOffsetS: number;
  /** Whole-zone shift applied (multiple of 15 min), 0 when none. */
  zoneShiftS: number;
  manualOffsetS: number;
  /** Seconds of the clip that fall inside the dive (needs durationS). */
  overlapS: number;
  /** Short explanation for the UI / log. */
  note: string;
};

export type SyncOptions = {
  /** Clip length, s: used for overlap and the zone search. */
  durationS?: number;
  /** Added last: positive = the overlay shows a later point of the dive. */
  manualOffsetS?: number;
  /** Try whole-zone shifts when the clip misses the dive (default true). */
  autoZone?: boolean;
};

export function diveDuration(log: DiveLog): number {
  return log.samples.length ? log.samples[log.samples.length - 1].t : 0;
}

/** Both clocks as wall-clock seconds when possible (FIT knows its UTC offset). */
function wallSeconds(d: Date, utc: boolean, utcOffsetS?: number): { s: number; utc: boolean } {
  const s = d.getTime() / 1000;
  if (utc && utcOffsetS !== undefined) return { s: s + utcOffsetS, utc: false };
  return { s, utc };
}

const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

export function syncVideoToDive(log: DiveLog, video: VideoClock, opts: SyncOptions = {}): DiveSync {
  const dur = Math.max(0, opts.durationS ?? 0);
  const manual = opts.manualOffsetS ?? 0;
  const L = wallSeconds(log.startTime, log.utc, log.utcOffsetS);
  const V = wallSeconds(video.start, video.utc);
  const clock = V.s - L.s;
  const diveLen = diveDuration(log);
  const ov = (base: number) => (dur > 0 ? overlap(base, base + dur, 0, diveLen) : base >= 0 && base <= diveLen ? 1 : 0);
  let shift = 0;
  let note = L.utc === V.utc ? "same clock" : "clocks of different kinds (UTC vs local)";
  if ((opts.autoZone ?? true) && ov(clock) === 0) {
    let best = 0, bestOv = 0;
    for (let q = -14 * 4; q <= 14 * 4; q++) {
      const s = q * 900;
      const o = ov(clock + s);
      if (o > bestOv + 1e-9 || (o > 0 && Math.abs(o - bestOv) <= 1e-9 && Math.abs(s) < Math.abs(best))) {
        best = s;
        bestOv = o;
      }
    }
    if (bestOv > 0) {
      shift = best;
      note = `clip outside the dive by the clock; shifted ${shift / 3600} h (camera and computer on different time zones)`;
    } else note = "clip does not overlap the dive at any time-zone shift; set the offset by hand";
  }
  const base = clock + shift + manual;
  return {
    diveTimeAtVideoStart: base,
    clockOffsetS: clock,
    zoneShiftS: shift,
    manualOffsetS: manual,
    overlapS: dur > 0 ? overlap(base, base + dur, 0, diveLen) : 0,
    note,
  };
}

/** Depth (linear) and temperature (linear between the nearest samples that have one) at dive time t; null outside. */
export function sampleAt(log: DiveLog, t: number): { depth: number; temp?: number } | null {
  const s = log.samples;
  if (!s.length || t < s[0].t || t > s[s.length - 1].t) return null;
  let lo = 0, hi = s.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (s[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = s[lo], b = s[hi];
  const f = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
  const depth = a.depth + (b.depth - a.depth) * f;
  const temp = tempAt(s, lo, t);
  return temp === undefined ? { depth } : { depth, temp };
}

function tempAt(s: DiveSample[], i: number, t: number): number | undefined {
  let a = i;
  while (a >= 0 && s[a].temp === undefined) a--;
  let b = i + 1;
  while (b < s.length && s[b].temp === undefined) b++;
  const A = a >= 0 ? s[a] : undefined, B = b < s.length ? s[b] : undefined;
  if (A && B && B.t > A.t) return A.temp! + (B.temp! - A.temp!) * Math.min(1, Math.max(0, (t - A.t) / (B.t - A.t)));
  return A?.temp ?? B?.temp;
}

export function sampleAtVideoTime(log: DiveLog, sync: DiveSync, videoT: number) {
  return sampleAt(log, sync.diveTimeAtVideoStart + videoT);
}

/** Wall-clock time of a dive moment, as floating seconds (UTC logs with a known offset are converted). */
export function diveWallClock(log: DiveLog, t: number): number {
  return wallSeconds(log.startTime, log.utc, log.utcOffsetS).s + t;
}
