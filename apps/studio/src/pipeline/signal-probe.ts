// Does this browser hand an HDR / wide-gamut clip's raw signal to WebGL, or
// convert it to SDR itself? It differs per browser and per path, measured:
//
//   Chrome (Linux, SwiftShader)  <video> → texImage2D: raw signal
//                                VideoFrame → texImage2D: converted to sRGB,
//                                  BT.2020 → BT.709, HLG / PQ CLIPPED at ~SDR white
//   WebKit (Playwright, Linux)   VideoFrame → texImage2D: raw signal
//
// so the Studio measures it once per clip kind: a tiny clip with known
// patches, tagged like the user's clip (public/calib/, built by
// scripts/calibration-clips.mjs), goes through the same path and is read
// back. Raw → the footage transform runs (HDR tone-mapped with highlight
// roll-off, footage.ts). Converted → for decoded frames the frame is re-tagged
// as Rec.709 (copied out and wrapped again, so the browser stops converting)
// when that makes the read-back raw; otherwise the browser's own conversion
// is kept and the transform is skipped on that path.

import { ALL_FORMATS, BlobSource, EncodedPacketSink, Input } from "mediabunny";
import type { GeometryRenderer } from "./geometry.ts";

/** Patch signals, one per 16 px column of the 128×64 clip (scripts/calibration-clips.mjs). */
export const CALIB_PATCHES: [number, number, number][] = [[0.25, 0.25, 0.25], [0.5, 0.5, 0.5], [0.75, 0.75, 0.75], [0.9, 0.9, 0.9], [0.5, 0, 0], [0, 0.5, 0], [0, 0, 0.5], [0.1, 0.1, 0.1]];
const CW = 128, CH = 64;
const POINTS: [number, number][] = CALIB_PATCHES.map((_, i) => [(i * 16 + 8) / CW, 0.5]);

export type CalibKind = "hlg" | "pq" | "wide";
/** raw: the signal arrives untouched; retag: raw after re-tagging the frame as Rec.709; browser: the browser converts, keep it. */
export type PathSignal = "raw" | "retag" | "browser";
export type SignalCalibration = { video: PathSignal | null; frame: PathSignal | null; log: string[] };

/** Max abs difference between a read-back and the patch signals. */
export function calibError(read: number[][]): number {
  let m = 0;
  read.forEach((rgb, i) => rgb.forEach((v, c) => { m = Math.max(m, Math.abs(v - CALIB_PATCHES[i][c])); }));
  return m;
}
/** 8-bit read-back + a lossy 10-bit encode: 0.05 is far below any transfer or gamut conversion (≥ 0.1 on these patches). */
export const RAW_TOLERANCE = 0.05;

const fmt = (r: number[][]) => r.map((p) => p.map((v) => v.toFixed(2)).join(",")).join(" ");

function calibUrl(kind: CalibKind, family: "hevc" | "vp9"): string {
  const base = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
  return `${base}calib/${kind}-${family}.${family === "vp9" ? "webm" : "mp4"}`;
}

/** Copies a decoded frame out and wraps it again tagged Rec.709 (keeping its matrix and range), so uploads stop converting. */
export async function retagFrame(frame: VideoFrame): Promise<VideoFrame> {
  const format = frame.format;
  if (!format) throw new Error("opaque frame (no pixel format): cannot copy out");
  const rect = frame.visibleRect;
  const w = rect?.width ?? frame.codedWidth, h = rect?.height ?? frame.codedHeight;
  const buf = new Uint8Array(frame.allocationSize());
  const layout = await frame.copyTo(buf);
  const cs = frame.colorSpace;
  return new VideoFrame(buf, {
    format,
    codedWidth: w,
    codedHeight: h,
    layout,
    timestamp: frame.timestamp,
    duration: frame.duration ?? undefined,
    displayWidth: frame.displayWidth,
    displayHeight: frame.displayHeight,
    colorSpace: { primaries: "bt709", transfer: "bt709", matrix: cs.matrix ?? "bt709", fullRange: cs.fullRange ?? false },
  });
}

async function probeVideo(url: string, geo: GeometryRenderer, log: string[]): Promise<PathSignal | null> {
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  v.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("timeout")), 4000);
      v.onloadeddata = () => { clearTimeout(t); resolve(); };
      v.onerror = () => { clearTimeout(t); reject(new Error(`error ${v.error?.code ?? "?"}`)); };
    });
    await v.play().catch(() => undefined);
    await new Promise((r) => setTimeout(r, 120));
    v.pause();
    if (!v.videoWidth) throw new Error("no picture");
    const read = geo.sample(v, CW, CH, false, POINTS);
    const err = calibError(read);
    log.push(`<video>: ${fmt(read)} (max err ${err.toFixed(3)})`);
    return err <= RAW_TOLERANCE ? "raw" : "browser";
  } catch (e) {
    log.push(`<video>: not measured (${(e as Error).message})`);
    return null;
  } finally {
    v.removeAttribute("src");
    v.load();
  }
}

async function decodeFirst(url: string): Promise<VideoFrame> {
  const blob = await (await fetch(url)).blob();
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) });
  try {
    const track = await input.getPrimaryVideoTrack();
    const config = track && (await track.getDecoderConfig());
    if (!track || !config) throw new Error("no track");
    if (!(await VideoDecoder.isConfigSupported(config)).supported) throw new Error("decoder unsupported");
    const frames: VideoFrame[] = [];
    let error: unknown = null;
    const dec = new VideoDecoder({ output: (f) => frames.push(f), error: (e) => { error = e; } });
    dec.configure(config);
    for await (const p of new EncodedPacketSink(track).packets()) dec.decode(p.toEncodedVideoChunk());
    await dec.flush();
    dec.close();
    if (error) throw error;
    const [first, ...rest] = frames;
    for (const f of rest) f.close();
    if (!first) throw new Error("no frame decoded");
    return first;
  } finally {
    input.dispose();
  }
}

async function probeFrame(url: string, geo: GeometryRenderer, log: string[]): Promise<PathSignal | null> {
  if (typeof VideoDecoder === "undefined") return null;
  let frame: VideoFrame | null = null;
  try {
    frame = await decodeFirst(url);
    const read = geo.sample(frame, CW, CH, true, POINTS);
    const err = calibError(read);
    log.push(`VideoFrame (${frame.format ?? "opaque"}): ${fmt(read)} (max err ${err.toFixed(3)})`);
    if (err <= RAW_TOLERANCE) return "raw";
    try {
      const re = await retagFrame(frame);
      try {
        const r2 = geo.sample(re, CW, CH, true, POINTS);
        const e2 = calibError(r2);
        log.push(`VideoFrame re-tagged Rec.709: ${fmt(r2)} (max err ${e2.toFixed(3)})`);
        if (e2 <= RAW_TOLERANCE) return "retag";
      } finally {
        re.close();
      }
    } catch (e) {
      log.push(`re-tag failed: ${(e as Error).message}`);
    }
    return "browser";
  } catch (e) {
    log.push(`VideoFrame: not measured (${(e as Error).message})`);
    return null;
  } finally {
    frame?.close();
  }
}

/**
 * Measures both upload paths for a clip of `kind` whose codec family is
 * `family` (the calibration clip uses the same family when one exists, so the
 * same decoder runs). Unmeasured paths come back null (callers assume raw).
 */
export async function calibrateSignal(kind: CalibKind, family: string | null, geo: GeometryRenderer): Promise<SignalCalibration> {
  const log: string[] = [];
  const fams: ("hevc" | "vp9")[] = family === "vp9" ? ["vp9", "hevc"] : ["hevc", "vp9"];
  let video: PathSignal | null = null, frame: PathSignal | null = null;
  for (const f of fams) {
    const url = calibUrl(kind, f);
    log.push(`calibration clip ${url}`);
    if (video === null) video = await probeVideo(url, geo, log);
    if (frame === null) frame = await probeFrame(url, geo, log);
    if (video !== null && frame !== null) break;
  }
  return { video, frame, log };
}
